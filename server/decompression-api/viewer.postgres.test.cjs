'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { applyMigrations } = require('./migrate.cjs');
const { ViewerStore } = require('./viewer/store.cjs');
const { encodeModule, encodeAchievements } = require('./generated/CloudSaveCodec');

test('viewer PostgreSQL reports count correctly, decode progress and prevent writes in a read-only snapshot', async () => {
    assert.ok(process.env.DATABASE_URL);
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const schema = 'viewer_test_' + randomBytes(8).toString('hex');
    await admin.query('CREATE SCHEMA ' + schema);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, options: '-c search_path=' + schema });
    const store = new ViewerStore(pool), uid = 'a'.repeat(64), device = '1'.repeat(32);
    try {
        await applyMigrations(pool);
        assert.equal((await store.overview()).counts.accounts, '0');
        await pool.query('INSERT INTO cloud_saves(user_id,modules,achievements,revision) VALUES($1,$2,$3,7)',
            [uid, { 2: encodeModule([25, 3]), 4: encodeModule([2, 4], [3, 1]) }, encodeAchievements({ 2: 20000 })]);
        await pool.query('INSERT INTO sync_devices(user_id,device_id,last_seq) VALUES($1,$2,3)', [uid, device]);
        await pool.query('INSERT INTO game_playtime(user_id,device_id,game_id,total_ms) VALUES($1,$2,$3,90000)', [uid, device, 'meowdoku']);
        const overview = await store.overview();
        assert.equal(overview.counts.accounts, '1'); assert.equal(overview.counts.devices, '1'); assert.equal(overview.counts.total_ms, '90000');
        assert.equal(overview.games[0].accounts, '1'); assert.ok(overview.games[0].name);
        assert.equal((await store.saves({ page: 1, prefix: 'aaa' })).total, '1');
        assert.equal((await store.saves({ page: 1, prefix: 'bbb' })).total, '0');
        const account = await store.account(uid);
        assert.equal(account.revision, '7'); assert.equal(account.games.find(game => game.gameId === 'meowdoku').fields[0].value, 25);
        assert.deepEqual(account.games.find(game => game.gameId === 'cyblockbees').stars, [{ level: '1', stars: 3 }, { level: '2', stars: 1 }]);
        assert.equal(account.achievements.length, 1); assert.equal(account.playtime[0].total_ms, '90000');
        assert.equal(await store.account('b'.repeat(64)), undefined);
        await assert.rejects(store.snapshot(db => db.query('DELETE FROM cloud_saves')), { code: '25006' });
        assert.equal((await store.overview()).counts.accounts, '1', 'The attempted write rolled back and the pool remains usable');
    } finally { await pool.end(); await admin.query('DROP SCHEMA ' + schema + ' CASCADE'); await admin.end(); }
});
