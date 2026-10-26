'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
const { loadMigrations, inspectDatabase, applyMigrations, assertTransactional } = require('./migrate.cjs');
const baseline = loadMigrations();
const migration = (version, sql, minAppVersion = 1) => ({ version, file: String(version).padStart(4, '0') + '_test.sql',
    minAppVersion, sql, sha256: createHash('sha256').update(sql).digest('hex') });
async function isolated(body) {
    assert.ok(process.env.DATABASE_URL, 'Explicit database connection required');
    const schema = 'game_api_migration_test_' + randomBytes(8).toString('hex');
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query('CREATE SCHEMA ' + schema);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, options: '-c search_path=' + schema });
    try { await body(pool); }
    finally { await pool.end(); await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end(); }
}
test('migration baseline adopts existing saves, records checksums and never replays completed versions', async () => isolated(async pool => {
    await pool.query(baseline[0].sql);
    await pool.query('INSERT INTO cloud_saves(user_id,revision) VALUES($1,17)', ['f'.repeat(64)]);
    assert.deepEqual((await inspectDatabase(pool)).pending, [1]);
    await assert.rejects(inspectDatabase(pool, baseline, { requireApplied: true }), /required/);
    await applyMigrations(pool, baseline, { compatibleVersion: 1 });
    await applyMigrations(pool);
    assert.equal((await pool.query('SELECT revision FROM cloud_saves')).rows[0].revision, '17');
    assert.equal((await pool.query('SELECT count(*) FROM api_schema_migrations')).rows[0].count, '1');
    assert.deepEqual((await inspectDatabase(pool)).pending, []);
    const changed = [{ ...baseline[0], sha256: '0'.repeat(64) }];
    await assert.rejects(inspectDatabase(pool, changed), /modified/);
}));
test('concurrent additive migrations run once and keep older application versions compatible', async () => isolated(async pool => {
    await applyMigrations(pool);
    const next = baseline.concat(migration(2, 'ALTER TABLE cloud_saves ADD COLUMN migration_test_note text;'));
    const results = await Promise.all([applyMigrations(pool, next, { compatibleVersion: 1 }), applyMigrations(pool, next, { compatibleVersion: 1 })]);
    assert.ok(results.every(value => value.appliedVersion === 2));
    assert.equal((await pool.query('SELECT count(*) FROM api_schema_migrations')).rows[0].count, '2');
    assert.equal((await inspectDatabase(pool, baseline, { requireApplied: true })).minAppVersion, 1,
        'An older release can keep running against an additive migration');
    const breaking = next.concat(migration(3, 'CREATE TABLE incompatible_test(id integer);', 3));
    await assert.rejects(applyMigrations(pool, breaking, { compatibleVersion: 2 }), /prevent rollback/);
    assert.equal((await pool.query("SELECT to_regclass('incompatible_test') AS name")).rows[0].name, null);
    await applyMigrations(pool, breaking, { compatibleVersion: 3 });
    await assert.rejects(inspectDatabase(pool, baseline, { requireApplied: true }), /compatibility floor/);
}));
test('a failed migration rolls back SQL and journal together, and transaction controls are rejected', async () => isolated(async pool => {
    await applyMigrations(pool);
    const failed = baseline.concat(migration(2, 'CREATE TABLE transaction_test(id integer);'),
        migration(3, 'SELECT * FROM table_that_does_not_exist;'));
    await assert.rejects(applyMigrations(pool, failed, { compatibleVersion: 1 }));
    assert.equal((await pool.query("SELECT to_regclass('transaction_test') AS name")).rows[0].name, null);
    assert.equal((await pool.query('SELECT count(*) FROM api_schema_migrations')).rows[0].count, '1');
    for (const sql of ['BEGIN;', 'SELECT 1; /* nested /* comment */ ok */ COMMIT;', 'ROLLBACK;', 'END;'])
        assert.throws(() => assertTransactional(sql), /transaction/);
    assert.doesNotThrow(() => assertTransactional("SELECT 'COMMIT;'; -- BEGIN;\nDO $$ BEGIN RAISE NOTICE 'ok'; END; $$;"));
}));
