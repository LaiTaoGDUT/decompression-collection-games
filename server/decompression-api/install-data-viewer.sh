#!/bin/bash
# 独立、可重复执行的本机只读查看器安装；不改 Nginx、防火墙、游戏密钥或存档。
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
DEPLOY_ROOT=/opt/decompression-api
APP_DIR=$(readlink -f "$DEPLOY_ROOT/app")
[[ -f $APP_DIR/viewer/index.cjs && -d $APP_DIR/node_modules/pg ]] || { echo 'Deploy a release containing viewer/ first.' >&2; exit 1; }
if ! id decompression-viewer >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin decompression-viewer
fi
runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --dbname=decompression_api <<'SQL'
SELECT 'CREATE ROLE "decompression-viewer" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='decompression-viewer') \gexec
ALTER ROLE "decompression-viewer" SET default_transaction_read_only=on;
ALTER ROLE "decompression-viewer" SET statement_timeout='5s';
GRANT CONNECT ON DATABASE decompression_api TO "decompression-viewer";
GRANT USAGE ON SCHEMA public TO "decompression-viewer";
GRANT SELECT ON cloud_saves,sync_devices,game_playtime TO "decompression-viewer";
SQL
# peer 认证使用同名 Linux/数据库账号；无需增加密码或修改 pg_hba.conf。
runuser -u decompression-viewer -- psql -X --set=ON_ERROR_STOP=1 --dbname=decompression_api --command='SELECT count(*) AS saved_accounts FROM cloud_saves;'
install -m 644 "$APP_DIR/decompression-data.service" /etc/systemd/system/decompression-data.service
systemctl daemon-reload
systemctl enable --now decompression-data.service
systemctl restart decompression-data.service
for attempt in {1..15}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:3100/api/overview >/dev/null; then
        install -m 644 /dev/null "$DEPLOY_ROOT/.data-viewer-enabled"
        echo 'DATA_VIEWER_OK listen=127.0.0.1:3100 database_role=decompression-viewer read_only=true'
        exit 0
    fi
    sleep 1
done
journalctl -u decompression-data -n 20 --no-pager
exit 1
