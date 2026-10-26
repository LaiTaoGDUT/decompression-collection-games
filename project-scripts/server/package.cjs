'use strict';

// 发布包、SHA-256 文件与固定部署脚本分开生成；脚本中不嵌入业务代码。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { prepare, root } = require('./prepare.cjs');
const { loadMigrations } = require('../../server/decompression-api/migrate.cjs');

const source = path.join(root, 'server/decompression-api');
const files = [
    'app.cjs', 'auth.cjs', 'login-providers.cjs', 'index.cjs', 'protocol.cjs', 'store.cjs', 'migrate.cjs', 'migrations/manifest.json',
    'package.json', 'package-lock.json', 'test.cjs', 'postgres.test.cjs', 'migrations.postgres.test.cjs',
    'update.sh', 'deploy-native.sh', 'configure-wechat-secret.sh', 'backup-native.sh', 'nginx.conf',
    'decompression-api.service', 'decompression-api-backup.service',
    'decompression-api-backup.timer', 'decompression-data.service', 'install-data-viewer.sh', 'DATA_VIEWER.md',
    'viewer/index.cjs', 'viewer/app.cjs', 'viewer/store.cjs', 'viewer/index.html', 'viewer/viewer.js', 'viewer/viewer.css',
    'viewer.test.cjs', 'viewer.postgres.test.cjs', 'README.md', 'OPERATIONS.md', 'DATABASE.md', 'CLOUD_SAVE.md', 'DEPLOYMENT.md',
    'Dockerfile', 'compose.yaml', 'init-db.sh', '.env.example', '.dockerignore',
    'generated/CloudSaveCodec.js', 'generated/CloudSaveProjection.js', 'generated/catalog.json', 'generated/games.json', 'generated/game-labels.json',
];
const hash = value => createHash('sha256').update(value).digest('hex');
function packageRelease(outputDirectory = path.join(root, 'local/server/releases'), { now = new Date() } = {}) {
    prepare(true);
    execFileSync('bash', ['-n', path.join(source, 'update.sh')]);
    fs.mkdirSync(outputDirectory, { recursive: true });
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'decompression-api-package-'));
    try {
        const migrations = loadMigrations();
        const releaseFiles = files.concat(migrations.map(m => 'migrations/' + m.file));
        const contents = {};
        for (const file of releaseFiles) {
            const data = fs.readFileSync(path.join(source, file));
            contents[file] = hash(data);
            const destination = path.join(stage, file);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, data);
        }
        const version = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
            + '-' + hash(JSON.stringify(contents)).slice(0, 12);
        const manifest = { format: 2, service: 'decompression-api', version, createdAt: now.toISOString(), databaseVersion: migrations.length, files: contents };
        fs.writeFileSync(path.join(stage, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
        const archive = path.resolve(outputDirectory, `decompression-api-${version}.tar.gz`);
        if (fs.existsSync(archive)) throw new Error('版本已存在，请稍后生成新版本：' + archive);
        execFileSync('tar', ['--no-xattrs', '--no-acls', '-czf', archive, '-C', stage, ...releaseFiles, 'release.json'], {
            env: { ...process.env, COPYFILE_DISABLE: '1' },
        });
        const bytes = fs.readFileSync(archive), sha256 = hash(bytes), checksum = archive + '.sha256';
        fs.writeFileSync(checksum, sha256 + '  ' + path.basename(archive) + '\n');
        const updater = path.resolve(outputDirectory, 'update.sh');
        fs.copyFileSync(path.join(stage, 'update.sh'), updater); fs.chmodSync(updater, 0o755);
        return { version, archive, checksum, updater, sha256, archiveBytes: bytes.length };
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

if (require.main === module) console.log(JSON.stringify(packageRelease(process.argv[2]), null, 2));
module.exports = { packageRelease, files };
