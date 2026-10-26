'use strict';
const { Pool } = require('pg');
const { PostgresStore } = require('./store.cjs');
const { createAuth } = require('./auth.cjs');
const { createLoginProviders } = require('./login-providers.cjs');
const { createServer } = require('./app.cjs');
const { inspectDatabase } = require('./migrate.cjs');

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 5000,
        statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 });
    pool.on('error', error => console.error('Database connection error:', error.code ?? 'UNKNOWN'));
    const store = new PostgresStore(pool);
    await inspectDatabase(pool, undefined, { requireApplied: true });
    const auth = createAuth({ providers: createLoginProviders(process.env), tokenSecret: process.env.TOKEN_SECRET });
    const server = createServer({ store, auth });
    const port = Number(process.env.PORT ?? 3000);
    await new Promise(resolve => server.listen(port, process.env.HOST ?? '127.0.0.1', resolve));
    console.log(JSON.stringify({ service: 'decompression-api', port, loginConfigured: auth.configured, loginPlatforms: auth.platforms }));
    const shutdown = () => {
        server.close(() => { void store.close().then(() => process.exit(0)); });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
main().catch(error => { console.error('Game API startup failed:', error.code ?? error.message); process.exitCode = 1; });
