'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = message => { throw new Error(message); };

// 只检查 SQL 顶层语句；字符串、标识符、注释和函数体不当成事务控制语句。
function assertTransactional(sql) {
    let text = '', i = 0;
    while (i < sql.length) {
        if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; text += ' '; }
        else if (sql.startsWith('/*', i)) {
            let depth = 1; i += 2;
            while (i < sql.length && depth) {
                if (sql.startsWith('/*', i)) { depth++; i += 2; }
                else if (sql.startsWith('*/', i)) { depth--; i += 2; } else i++;
            }
            if (depth) invalid('Unterminated SQL comment'); text += ' ';
        } else if (sql[i] === "'" || sql[i] === '"') {
            const quote = sql[i++]; let closed = false;
            while (i < sql.length) {
                if (sql[i++] === quote) { if (sql[i] === quote) i++; else { closed = true; break; } }
            }
            if (!closed) invalid('Unterminated SQL quote'); text += ' literal ';
        } else {
            const dollar = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];
            if (dollar) {
                const end = sql.indexOf(dollar, i + dollar.length);
                if (end < 0) invalid('Unterminated SQL function body');
                i = end + dollar.length; text += ' literal ';
            } else text += sql[i++];
        }
    }
    for (const statement of text.split(';')) {
        if (/^\s*(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i.test(statement))
            invalid('Migration SQL must not control its own transaction');
    }
}
function loadMigrations(directory = path.join(__dirname, 'migrations')) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1 || !Array.isArray(manifest.migrations) || !manifest.migrations.length) invalid('Invalid migration manifest');
    return manifest.migrations.map((entry, index) => {
        if (entry.version !== index + 1 || !Number.isSafeInteger(entry.minAppVersion) || entry.minAppVersion < 1
            || entry.minAppVersion > entry.version || typeof entry.file !== 'string'
            || !new RegExp('^' + String(entry.version).padStart(4, '0') + '_[a-z0-9_]+\\.sql$').test(entry.file))
            invalid('Migrations must have contiguous versions, safe filenames and explicit compatibility');
        const sql = fs.readFileSync(path.join(directory, entry.file), 'utf8');
        assertTransactional(sql);
        return { ...entry, sql, sha256: hash(sql) };
    });
}
function releaseDatabaseVersion(release) {
    const manifest = path.join(release, 'release.json');
    if (fs.existsSync(manifest)) {
        const version = JSON.parse(fs.readFileSync(manifest, 'utf8')).databaseVersion;
        if (Number.isSafeInteger(version) && version >= 1) return version;
    }
    invalid('Release has no recognized database compatibility metadata');
}
async function history(client) {
    const { rows } = await client.query("SELECT to_regclass('api_schema_migrations') AS name");
    return rows[0].name ? (await client.query('SELECT version, file, sha256, min_app_version FROM api_schema_migrations ORDER BY version')).rows : [];
}
function plan(migrations, applied, { compatibleVersion, requireApplied = false } = {}) {
    applied.forEach((row, index) => {
        if (row.version !== index + 1 || row.min_app_version < 1 || row.min_app_version > row.version) invalid('Invalid database migration history');
        const source = migrations[index];
        if (source && (row.file !== source.file || row.sha256 !== source.sha256 || row.min_app_version !== source.minAppVersion))
            invalid('An applied migration was modified: ' + row.version);
    });
    const requiredVersion = migrations.length, appliedVersion = applied.length;
    const minAppVersion = Math.max(1, ...applied.map(row => row.min_app_version));
    if (minAppVersion > requiredVersion) invalid('This application is older than the database compatibility floor');
    if (requireApplied && appliedVersion < requiredVersion) invalid('Database migration is required before starting this application');
    const pending = migrations.slice(appliedVersion);
    if (compatibleVersion !== undefined && (minAppVersion > compatibleVersion || pending.some(m => m.minAppVersion > compatibleVersion)))
        invalid('Migration would prevent rollback to the running application; stage a compatible change first');
    return { requiredVersion, appliedVersion, minAppVersion, pending: pending.map(m => m.version) };
}
async function inspectDatabase(pool, migrations = loadMigrations(), options = {}) {
    const client = await pool.connect();
    try { return plan(migrations, await history(client), options); } finally { client.release(); }
}
async function applyMigrations(pool, migrations = loadMigrations(), options = {}) {
    migrations.forEach(migration => assertTransactional(migration.sql));
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema() || ':decompression-api:migrations'))");
        const before = plan(migrations, await history(client), options);
        if (before.pending.length) {
            await client.query(`CREATE TABLE IF NOT EXISTS api_schema_migrations (
                version integer PRIMARY KEY, file text NOT NULL, sha256 char(64) NOT NULL,
                min_app_version integer NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
            for (const migration of migrations.slice(before.appliedVersion)) {
                await client.query(migration.sql);
                await client.query('INSERT INTO api_schema_migrations(version,file,sha256,min_app_version) VALUES($1,$2,$3,$4)',
                    [migration.version, migration.file, migration.sha256, migration.minAppVersion]);
            }
        }
        const after = plan(migrations, await history(client), { requireApplied: true });
        await client.query('COMMIT'); return after;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
}
async function main() {
    const [action, release] = process.argv.slice(2);
    if (!['--status', '--plan', '--apply', '--check-release'].includes(action)
        || (action === '--check-release' && !release) || process.argv.length > 4) invalid('Use --status | --plan [current-release] | --apply [current-release] | --check-release <target-release>');
    if (!process.env.DATABASE_URL) invalid('DATABASE_URL must be provided by the server environment');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 35000 });
    try {
        const migrations = action === '--check-release' && fs.existsSync(path.join(release, 'migrations/manifest.json'))
            ? loadMigrations(path.join(release, 'migrations')) : loadMigrations();
        const options = action === '--check-release' ? { requireApplied: true }
            : release ? { compatibleVersion: releaseDatabaseVersion(release) } : {};
        if (action === '--check-release' && !fs.existsSync(path.join(release, 'migrations/manifest.json'))) {
            const status = await inspectDatabase(pool);
            if (status.pending.length || status.minAppVersion > releaseDatabaseVersion(release)) invalid('Target release is incompatible with the database');
            console.log(JSON.stringify(status));
        } else console.log(JSON.stringify(action === '--apply' ? await applyMigrations(pool, migrations, options) : await inspectDatabase(pool, migrations, options)));
    } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error('Database operation failed:', error.code ?? error.message); process.exitCode = 1; });
module.exports = { loadMigrations, releaseDatabaseVersion, inspectDatabase, applyMigrations, plan, assertTransactional };
