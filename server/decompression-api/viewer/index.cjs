'use strict';
const { Pool } = require('pg');
const { ViewerStore } = require('./store.cjs');
const { createViewerServer } = require('./app.cjs');

async function main() {
    // 不读取游戏 API 的 .env 或数据库密码。独立 Linux 账号通过本机 peer 认证。
    const pool = new Pool({ host: '/var/run/postgresql', port: 5432, database: 'decompression_api',
        user: 'decompression-viewer', max: 2, connectionTimeoutMillis: 5000,
        options: '-c default_transaction_read_only=on', statement_timeout: 5000,
        idle_in_transaction_session_timeout: 5000 });
    pool.on('error', error => console.error('Viewer database error:', error.code ?? 'UNKNOWN'));
    const role = (await pool.query(`SELECT current_setting('transaction_read_only') AS read_only,
        has_table_privilege(current_user,'cloud_saves','SELECT') AS can_read,
        has_table_privilege(current_user,'cloud_saves','INSERT,UPDATE,DELETE,TRUNCATE') AS can_write,
        rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user`)).rows[0];
    if (!role || role.read_only !== 'on' || !role.can_read || role.can_write || role.rolsuper || role.rolcreaterole || role.rolcreatedb)
        throw new Error('READ_ONLY_ROLE_REQUIRED');
    const server = createViewerServer({ store: new ViewerStore(pool),
        onError: error => console.error('Viewer query failed:', error.code ?? 'UNKNOWN') });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3100, '127.0.0.1', resolve); });
    console.log('Game data viewer ready: http://127.0.0.1:3100 (read only)');
    const shutdown = () => {
        server.close(() => { void pool.end().then(() => process.exit(0)); });
        setTimeout(() => process.exit(1), 8000).unref();
    };
    process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
main().catch(error => { console.error('Viewer startup failed:', error.code ?? error.message); process.exit(1); });
