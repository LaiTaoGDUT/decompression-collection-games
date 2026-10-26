#!/bin/bash
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
DEPLOY_ROOT=/opt/decompression-api
APP_DIR=$(readlink -f "$DEPLOY_ROOT/app")
cd "$APP_DIR"
if ! id decompression-api >/dev/null 2>&1; then useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin decompression-api; fi
install -d -o root -g decompression-api -m 750 "$DEPLOY_ROOT" "$DEPLOY_ROOT/releases"
if [[ ! -f $DEPLOY_ROOT/.env ]]; then
    umask 077
    node <<'NODE' > "$DEPLOY_ROOT/.env"
const { randomBytes } = require('node:crypto');
const password = randomBytes(32).toString('hex');
const config = { DB_PASSWORD: password, DATABASE_URL: 'postgres://decompression_api:' + password + '@127.0.0.1:5432/decompression_api',
    TOKEN_SECRET: randomBytes(48).toString('hex'), WX_APP_ID: 'wx2a5e707ed76bedae', WX_APP_SECRET: '', HOST: '127.0.0.1', PORT: '3000' };
for (const [key, value] of Object.entries(config)) console.log(key + '=' + value);
NODE
fi
chmod 600 "$DEPLOY_ROOT/.env"
set -a
source "$DEPLOY_ROOT/.env"
set +a
systemctl enable --now postgresql
PG_VERSION=$(pg_lsclusters --no-header | awk '$2=="main" && $3=="5432" { print $1; exit }')
if [[ ! $PG_VERSION =~ ^[0-9]+$ ]]; then echo 'PostgreSQL main cluster on port 5432 was not found.' >&2; exit 1; fi
install -d -m 755 "/etc/postgresql/$PG_VERSION/main/conf.d"
cat > "/etc/postgresql/$PG_VERSION/main/conf.d/decompression-api.conf" <<'PGCONF'
listen_addresses = '127.0.0.1'
shared_buffers = '128MB'
max_connections = 30
log_min_duration_statement = 1000
PGCONF
# .env 创建时使用 umask 077；非敏感的数据库配置必须显式允许 postgres 读取。
chmod 644 "/etc/postgresql/$PG_VERSION/main/conf.d/decompression-api.conf"
systemctl restart "postgresql@$PG_VERSION-main.service"
for attempt in {1..30}; do
    if runuser -u postgres -- pg_isready --quiet --host=127.0.0.1 --port=5432; then break; fi
    if [[ $attempt == 30 ]]; then journalctl -u "postgresql@$PG_VERSION-main" -n 25 --no-pager; exit 1; fi
    sleep 1
done
runuser -u postgres -- psql --set=ON_ERROR_STOP=1 --set=app_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE decompression_api LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='decompression_api') \gexec
SELECT 'CREATE DATABASE decompression_api OWNER decompression_api'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='decompression_api') \gexec
SQL
npm ci --omit=dev --ignore-scripts --cache /var/cache/decompression-api-npm --fetch-timeout=30000
chown -R root:decompression-api "$APP_DIR"
chmod -R g+rX "$APP_DIR"
install -m 644 decompression-api.service /etc/systemd/system/decompression-api.service
NGINX_SITE=/etc/nginx/sites-available/decompression-api
# Certbot 会在首次模板上追加证书与跳转配置；重跑安装不能把已启用的 HTTPS 覆盖回 HTTP。
if [[ ! -f $NGINX_SITE ]]; then install -m 644 nginx.conf "$NGINX_SITE"; fi
ln -sfn /etc/nginx/sites-available/decompression-api /etc/nginx/sites-enabled/decompression-api
nginx -t
systemctl daemon-reload
systemctl enable decompression-api.service
node migrate.cjs --apply
systemctl restart decompression-api.service
systemctl enable --now nginx
systemctl reload nginx
for attempt in {1..30}; do
    if curl --fail --silent http://127.0.0.1:3000/health; then break; fi
    if [[ $attempt == 30 ]]; then journalctl -u decompression-api -n 25 --no-pager; exit 1; fi
    sleep 1
done
install -d -m 700 "$DEPLOY_ROOT/backups"
install -m 644 decompression-api-backup.service /etc/systemd/system/decompression-api-backup.service
install -m 644 decompression-api-backup.timer /etc/systemd/system/decompression-api-backup.timer
systemctl daemon-reload
systemctl enable --now decompression-api-backup.timer
systemctl start decompression-api-backup.service
echo
echo 'Native API, PostgreSQL, reverse proxy and daily backups installed.'
echo 'Complete WeChat AppSecret and HTTPS before releasing clients.'
