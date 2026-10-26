#!/bin/bash
# 固定部署工具；业务代码始终来自单独上传的 .tar.gz 发布包。
# 日常更新：sudo /opt/decompression-api/bin/update.sh /home/ubuntu/<版本>.tar.gz
# 手动回退：sudo /opt/decompression-api/bin/update.sh --rollback
set -euo pipefail
if [[ ${1:-} == --help ]]; then
    echo 'Usage: sudo bash update.sh <release.tar.gz> | --rollback | --status'
    echo 'Upload the archive and its matching .sha256 file to the same directory.'
    exit 0
fi
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ $# == 1 ]] || { echo 'Use --help for deployment commands.' >&2; exit 1; }
DEPLOY_ROOT=${GAME_API_DEPLOY_ROOT:-/opt/decompression-api}
PUBLIC_URL=${GAME_API_PUBLIC_URL:-https://api.antcosmos.cn/decompression}
API_SERVICE=${GAME_API_SERVICE:-decompression-api}
BACKUP_SERVICE=${GAME_API_BACKUP_SERVICE:-decompression-api-backup.service}
[[ $PUBLIC_URL =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9/_-]+)?$ ]] || { echo 'Invalid public HTTPS URL.' >&2; exit 1; }
[[ -d $DEPLOY_ROOT/releases && -f $DEPLOY_ROOT/.env && -L $DEPLOY_ROOT/app ]] || { echo 'Existing native deployment required; see README.' >&2; exit 1; }
DEPLOY_ROOT=$(cd "$DEPLOY_ROOT" && pwd -P)
resolve_release() {
    python3 - "$DEPLOY_ROOT" "$1" <<'PY'
from pathlib import Path
import sys
root, target = Path(sys.argv[1]), Path(sys.argv[2]).resolve(strict=True)
if target.parent != root / 'releases' or not target.is_dir():
    raise SystemExit('Release must be a direct child of the releases directory.')
print(target)
PY
}
OLD=$(resolve_release "$DEPLOY_ROOT/app")
if [[ $1 == --status ]]; then
    printf 'current=%s\n' "$OLD"
    if [[ -L $DEPLOY_ROOT/previous ]]; then printf 'previous=%s\n' "$(resolve_release "$DEPLOY_ROOT/previous")"; fi
    exit 0
fi
for deployment_command in node npm python3 flock curl systemctl; do
    command -v "$deployment_command" >/dev/null || { echo "Missing command: $deployment_command" >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
# 同一时间只允许一次发布或回退，进程退出后由系统释放锁。
exec 9> "$DEPLOY_ROOT/.deploy.lock"
flock --nonblock 9 || { echo 'Another deployment is running.' >&2; exit 1; }
OLD=$(resolve_release "$DEPLOY_ROOT/app")
STAGE=$(mktemp -d "$DEPLOY_ROOT/.incoming.XXXXXXXX")
PROMOTED=0
COMMITTED=0
atomic_link() {
    python3 - "$1" "$DEPLOY_ROOT/$2" <<'PY'
import os, sys
source, destination = sys.argv[1:]
temporary = destination + '.next-' + str(os.getpid())
try:
    os.symlink(source, temporary)
    os.replace(temporary, destination)
finally:
    if os.path.lexists(temporary): os.unlink(temporary)
PY
}
wait_ready() {
    for attempt in {1..15}; do
        if curl --connect-timeout 2 --max-time 3 --fail --silent http://127.0.0.1:3000/ready > "$STAGE/local-ready.json"; then return 0; fi
        sleep 1
    done
    return 1
}
finish() {
    local result=$?
    trap - EXIT INT TERM
    if [[ $result != 0 && $PROMOTED == 1 && $COMMITTED == 0 ]]; then
        echo 'Deployment failed; restoring previous application release.' >&2
        if atomic_link "$OLD" app && systemctl restart "$API_SERVICE" && wait_ready; then
            printf 'AUTOMATIC_ROLLBACK_OK release=%s\n' "$OLD" >&2
        else
            echo 'AUTOMATIC_ROLLBACK_FAILED: inspect the application service immediately.' >&2
        fi
    fi
    rm -rf -- "$STAGE"
    exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ $1 == --rollback ]]; then
    [[ -L $DEPLOY_ROOT/previous ]] || { echo 'No previous release recorded.' >&2; exit 1; }
    TARGET=$(resolve_release "$DEPLOY_ROOT/previous")
    [[ $TARGET != "$OLD" ]] || { echo 'Already on the previous release.' >&2; exit 1; }
    echo "Preparing rollback to $TARGET"
else
    # 复制到 root 私有暂存区后再校验，上传中的文件不能影响解包过程。
    cp -- "$1" "$STAGE/release.tar.gz"
    cp -- "$1.sha256" "$STAGE/release.sha256"
    python3 - "$STAGE" "$(basename -- "$1")" <<'PY'
import hashlib, json, re, sys, tarfile
from pathlib import Path, PurePosixPath
stage, filename = Path(sys.argv[1]), sys.argv[2]
checksum = (stage / 'release.sha256').read_text().splitlines()
if len(checksum) != 1 or not re.fullmatch(r'[0-9a-f]{64}  ' + re.escape(filename), checksum[0]):
    raise SystemExit('Invalid checksum file; it must name this archive.')
if (stage / 'release.tar.gz').stat().st_size > 64 * 1024 * 1024:
    raise SystemExit('Compressed release exceeds deployment limit.')
archive_hash = hashlib.sha256((stage / 'release.tar.gz').read_bytes()).hexdigest()
if checksum[0][:64] != archive_hash: raise SystemExit('Archive SHA-256 mismatch.')
with tarfile.open(stage / 'release.tar.gz', 'r:gz') as archive:
    members, total = [], 0
    for member in archive:
        members.append(member)
        total += member.size
        if len(members) > 512 or total > 64 * 1024 * 1024:
            raise SystemExit('Release archive exceeds deployment limits.')
    files = {}
    for member in members:
        name = member.name.rstrip('/') if member.isdir() else member.name
        parts = PurePosixPath(name).parts
        if not name or name.startswith('/') or '\\' in name or any(ord(c) < 32 for c in name) \
            or '..' in parts or str(PurePosixPath(name)) != name \
            or any(p in ('.env', '.git', 'node_modules', 'backups') for p in parts) \
            or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member: ' + repr(name))
        if member.isfile():
            if name in files: raise SystemExit('Duplicate release file.')
            files[name] = member
    if 'release.json' not in files or files['release.json'].size > 65536:
        raise SystemExit('Missing or oversized release manifest.')
    manifest = json.load(archive.extractfile(files['release.json']))
    version = manifest.get('version', '')
    if manifest.get('format') != 2 or manifest.get('service') != 'decompression-api' \
        or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{12}', version) \
        or filename != 'decompression-api-' + version + '.tar.gz':
        raise SystemExit('Invalid release manifest or archive name.')
    expected = manifest.get('files')
    required = {'app.cjs', 'auth.cjs', 'login-providers.cjs', 'index.cjs', 'protocol.cjs', 'store.cjs',
        'package.json', 'package-lock.json', 'migrate.cjs', 'migrations/manifest.json',
        'test.cjs', 'postgres.test.cjs', 'migrations.postgres.test.cjs', 'update.sh',
        'generated/CloudSaveCodec.js', 'generated/CloudSaveProjection.js', 'generated/catalog.json', 'generated/games.json'}
    if not isinstance(expected, dict) or not required.issubset(expected) or set(files) != set(expected) | {'release.json'}:
        raise SystemExit('Manifest file list does not match archive contents.')
    output = stage / 'code'
    for name, member in files.items():
        data = archive.extractfile(member).read()
        if name != 'release.json' and hashlib.sha256(data).hexdigest() != expected[name]:
            raise SystemExit('Release file SHA-256 mismatch: ' + name)
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
(stage / 'version').write_text(version)
(stage / 'archive-sha256').write_text(archive_hash)
print('Verified release: ' + version)
PY
    VERSION=$(cat "$STAGE/version")
    TARGET="$DEPLOY_ROOT/releases/$VERSION"
    [[ ! -e $TARGET ]] || { echo 'This release directory already exists; build a new release or use --rollback.' >&2; exit 1; }
    mv -- "$STAGE/code" "$TARGET"
    cd "$TARGET"
    if cmp --silent "$OLD/package-lock.json" package-lock.json && cmp --silent "$OLD/package.json" package.json && [[ -d $OLD/node_modules ]]; then
        cp -a -- "$OLD/node_modules" node_modules
    else
        npm ci --omit=dev --ignore-scripts --cache "$DEPLOY_ROOT/npm-cache" --fetch-timeout=30000
    fi
fi
[[ -d $TARGET/node_modules ]] || { echo 'Release dependencies are missing.' >&2; exit 1; }
chown -R root:decompression-api "$TARGET"
chmod -R g+rX "$TARGET"
chmod 750 "$TARGET"
cd "$TARGET"
set -a
source "$DEPLOY_ROOT/.env"
set +a
[[ -n ${DATABASE_URL:-} && -n ${TOKEN_SECRET:-} ]] || { echo 'Existing database or token configuration missing.' >&2; exit 1; }
# 真实数据库测试只操作独立随机 schema，不上传或修改正式玩家存档。
SERVER_TESTS=(test.cjs postgres.test.cjs)
if [[ -f migrations.postgres.test.cjs ]]; then SERVER_TESTS+=(migrations.postgres.test.cjs); fi
if [[ -f viewer.test.cjs ]]; then SERVER_TESTS+=(viewer.test.cjs viewer.postgres.test.cjs); fi
node --test "${SERVER_TESTS[@]}"
if [[ $1 == --rollback ]]; then
    node "$OLD/migrate.cjs" --check-release "$TARGET"
else
    node migrate.cjs --plan "$OLD" > "$STAGE/database-plan.json"
    if node -e 'process.exit(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pending.length ? 0 : 1)' "$STAGE/database-plan.json"; then
        # 先备份后迁移；备份失败时保持原应用，已提交迁移通过兼容声明支持应用回退。
        systemctl start "$BACKUP_SERVICE"
        node migrate.cjs --apply "$OLD"
    fi
    node migrate.cjs --check-release "$TARGET"
fi
PROMOTED=1
atomic_link "$TARGET" app
systemctl restart "$API_SERVICE"
wait_ready
curl --connect-timeout 3 --max-time 10 --fail --silent --show-error "$PUBLIC_URL/ready" > "$STAGE/public-ready.json"
curl --connect-timeout 3 --max-time 10 --fail --silent --show-error -H 'Content-Type: application/json' \
    --data '{"v":2,"op":"load","clockOnly":true}' "$PUBLIC_URL/v1/load" > "$STAGE/clock.json"
node - "$STAGE/local-ready.json" "$STAGE/public-ready.json" "$STAGE/clock.json" <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const [local, publicReady, clock] = process.argv.slice(2).map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
for (const ready of [local, publicReady]) {
    assert.equal(ready.ok, true); assert.equal(ready.database, true); assert.equal(ready.loginConfigured, true);
    assert.ok(Array.isArray(ready.loginPlatforms) && ready.loginPlatforms.length > 0);
}
assert.equal(clock.ok, true); assert.equal(clock.clockOnly, true);
assert.ok(Number.isSafeInteger(clock.serverTime));
assert.equal(clock.serverDay, new Date(clock.serverTime + 8 * 3600000).toISOString().slice(0, 10));
assert.equal(clock.found, undefined); assert.equal(clock.token, undefined);
console.log(JSON.stringify({ database: true, loginPlatforms: publicReady.loginPlatforms, serverDay: clock.serverDay }));
NODE
[[ $(curl --connect-timeout 3 --max-time 10 --silent --show-error -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' --data '{"v":2,"op":"load"}' "$PUBLIC_URL/v1/load") == 401 ]]
# 成功后才记录手动回退目标，并更新固定部署工具。
install -d -m 750 "$DEPLOY_ROOT/bin"
if [[ -f $TARGET/update.sh ]]; then
    install -m 750 "$TARGET/update.sh" "$DEPLOY_ROOT/bin/.update.sh.next"
    mv -- "$DEPLOY_ROOT/bin/.update.sh.next" "$DEPLOY_ROOT/bin/update.sh"
fi
printf '%s current=%s previous=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TARGET" "$OLD" >> "$DEPLOY_ROOT/deployments.log"
atomic_link "$OLD" previous
COMMITTED=1
printf 'DEPLOYMENT_OK current=%s previous=%s\n' "$TARGET" "$OLD"
# 本机只读查看器是可选的独立进程；故障不会回退已经验证成功的游戏 API。
if [[ -f $DEPLOY_ROOT/.data-viewer-enabled ]]; then
    if [[ -f $TARGET/viewer/index.cjs ]]; then
        if systemctl restart decompression-data.service && \
            curl --retry 8 --retry-delay 1 --retry-connrefused --max-time 3 --fail --silent \
            http://127.0.0.1:3100/api/overview >/dev/null; then
            echo 'DATA_VIEWER_OK listen=127.0.0.1:3100'
        else
            echo 'DATA_VIEWER_WARNING: game API is deployed; inspect journalctl -u decompression-data.' >&2
        fi
    else
        systemctl stop decompression-data.service
        echo 'DATA_VIEWER_STOPPED: this older release does not include the optional viewer.'
    fi
fi
