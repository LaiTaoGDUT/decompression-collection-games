'use strict';
const { EMPTY, fail, validateSave, mergeProgress, requestHash } = require('./protocol.cjs');

class PostgresStore {
    constructor(pool) { this.pool = pool; }
    async ready() { await this.pool.query('SELECT 1'); }
    async load(uid) {
        const { rows } = await this.pool.query('SELECT modules, achievements, revision FROM cloud_saves WHERE user_id=$1', [uid]);
        return rows[0] ? { found: true, m: rows[0].modules, a: rows[0].achievements, revision: String(rows[0].revision) }
            : { found: false, m: {}, a: EMPTY, revision: '0' };
    }
    async save(uid, value) {
        const request = validateSave(value), hash = requestHash(request), client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // 同账号的所有设备在同一条存档行上串行合并，避免读旧值再覆盖另一个设备。
            await client.query('INSERT INTO cloud_saves(user_id) VALUES($1) ON CONFLICT DO NOTHING', [uid]);
            const { rows: saves } = await client.query('SELECT modules, achievements, revision FROM cloud_saves WHERE user_id=$1 FOR UPDATE', [uid]);
            await client.query('INSERT INTO sync_devices(user_id,device_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [uid, request.device]);
            const { rows: devices } = await client.query('SELECT last_seq,last_hash FROM sync_devices WHERE user_id=$1 AND device_id=$2 FOR UPDATE', [uid, request.device]);
            const previous = saves[0], last = Number(devices[0].last_seq);
            if (request.seq <= last) {
                if (request.seq === last && hash !== devices[0].last_hash) fail('SEQUENCE_CONFLICT', 409);
                await client.query('COMMIT');
                return { found: true, seq: request.seq, m: previous.modules, a: previous.achievements, revision: String(previous.revision) };
            }
            const best = mergeProgress({ m: previous.modules, a: previous.achievements }, request);
            const { rows } = await client.query('UPDATE cloud_saves SET modules=$2,achievements=$3,revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision',
                [uid, best.m, best.a]);
            for (const id of Object.keys(request.t).sort()) {
                const ms = request.t[id];
                if (!ms) continue;
                await client.query('INSERT INTO game_playtime(user_id,device_id,game_id,total_ms) VALUES($1,$2,$3,$4) '
                    + 'ON CONFLICT(user_id,device_id,game_id) DO UPDATE SET total_ms=game_playtime.total_ms+EXCLUDED.total_ms,updated_at=now()',
                [uid, request.device, id, ms]);
            }
            await client.query('UPDATE sync_devices SET last_seq=$3,last_hash=$4,updated_at=now() WHERE user_id=$1 AND device_id=$2',
                [uid, request.device, request.seq, hash]);
            await client.query('COMMIT');
            return { found: true, seq: request.seq, ...best, revision: String(rows[0].revision) };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally { client.release(); }
    }
    async close() { await this.pool.end(); }
}
module.exports = { PostgresStore };
