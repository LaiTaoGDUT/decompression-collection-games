'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { PostgresStore } = require('./store.cjs');
const { encodeModule, decodeModule } = require('./generated/CloudSaveCodec');
const { EMPTY } = require('./protocol.cjs');
const { applyMigrations } = require('./migrate.cjs');

test('real PostgreSQL transactions preserve concurrent devices and count each timing batch once', async () => {
    assert.ok(process.env.DATABASE_URL, 'Run with an explicit PostgreSQL connection');
    const schema = 'cloud_save_test_' + randomBytes(8).toString('hex');
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query('CREATE SCHEMA ' + schema);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, options: '-c search_path=' + schema });
    const store = new PostgresStore(pool), uid = 'a'.repeat(64), other = 'b'.repeat(64);
    const make = (device, seq, normal, hard, ms, stars) => ({ v: 2, op: 'save', device: device.repeat(32), seq,
        m: { 2: encodeModule([normal, hard]), 4: encodeModule([2, 4], stars) }, a: EMPTY, t: { meowdoku: ms } });
    try {
        await applyMigrations(pool); assert.equal((await store.load(uid)).found, false);
        const a = make('1', 1, 100, 10, 60000, [3, 1]), b = make('2', 1, 80, 30, 90000, [1, 3]);
        await Promise.all([store.save(uid, a), store.save(uid, b), store.save(uid, a), store.save(uid, b)]);
        let value = await store.load(uid);
        assert.deepEqual(decodeModule(value.m[2], 2).numbers, [100, 30]);
        assert.deepEqual(decodeModule(value.m[4], 2, 200).stars, [3, 3]);
        const total = async () => Number((await pool.query('SELECT SUM(total_ms) AS total FROM game_playtime WHERE user_id=$1', [uid])).rows[0].total);
        assert.equal(await total(), 150000, 'Duplicate simultaneous uploads add time exactly once');
        await assert.rejects(store.save(uid, { ...a, t: { meowdoku: 999999 } }), { code: 'SEQUENCE_CONFLICT' });
        assert.equal(await total(), 150000, 'A conflicting sequence rolls back everything');
        await store.save(uid, make('1', 2, 101, 10, 30000, [3, 2]));
        await store.save(uid, a);
        assert.equal(await total(), 180000, 'An old retry does not reapply its timing');
        assert.equal((await store.load(other)).found, false, 'Other users cannot see this document');
        const started = performance.now();
        await Promise.all(Array.from({ length: 24 }, (_, i) => store.save(uid,
            { ...make('3', i + 1, 102 + i, 30, 1000, [3, 3]), device: (i + 16).toString(16).padStart(32, '0') })));
        value = await store.load(uid);
        assert.equal(decodeModule(value.m[2], 2).numbers[0], 125);
        assert.equal(await total(), 204000);
        console.log(JSON.stringify({ postgresConcurrency: 24, durationMs: Math.round(performance.now() - started), isolatedTestSchema: true }));
    } finally {
        await store.close();
        // 只删除本次随机创建、与正式表隔离的测试 schema。
        await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end();
    }
});
