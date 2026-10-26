'use strict';
const catalog = require('../generated/catalog.json');
const labels = require('../generated/game-labels.json');
const { decodeModule, decodeAchievements } = require('../generated/CloudSaveCodec');

// 每次页面读取使用同一份只读快照，避免三个数字跨越不同的上传事务。
class ViewerStore {
    constructor(pool) { this.pool = pool; }
    async snapshot(read) {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const result = await read(db);
            await db.query('COMMIT');
            return result;
        } catch (error) {
            await db.query('ROLLBACK').catch(() => {});
            throw error;
        } finally { db.release(); }
    }
    async overview() {
        return this.snapshot(async db => {
            const counts = (await db.query(`SELECT
                (SELECT count(*) FROM cloud_saves) AS accounts,
                (SELECT count(*) FROM sync_devices) AS devices,
                (SELECT count(*) FROM game_playtime) AS timing_rows,
                (SELECT coalesce(sum(total_ms),0)::text FROM game_playtime) AS total_ms,
                (SELECT max(updated_at) FROM cloud_saves) AS last_saved_at`)).rows[0];
            const games = (await db.query(`SELECT game_id, sum(total_ms)::text AS total_ms,
                count(DISTINCT user_id) AS accounts, count(*) AS devices, max(updated_at) AS updated_at
                FROM game_playtime GROUP BY game_id ORDER BY sum(total_ms) DESC, game_id`)).rows;
            return { counts, games: games.map(row => ({ ...row, name: labels[row.game_id] ?? row.game_id })),
                sampledAt: new Date().toISOString() };
        });
    }
    async saves({ page, prefix }) {
        return this.snapshot(async db => {
            const pattern = prefix + '%';
            const total = (await db.query('SELECT count(*) FROM cloud_saves WHERE user_id LIKE $1', [pattern])).rows[0].count;
            const rows = (await db.query(`SELECT user_id, revision, updated_at,
                (SELECT count(*) FROM sync_devices d WHERE d.user_id=s.user_id) AS devices
                FROM cloud_saves s WHERE user_id LIKE $1 ORDER BY updated_at DESC,user_id LIMIT 25 OFFSET $2`,
            [pattern, (page - 1) * 25])).rows;
            return { total, page, pageSize: 25, rows };
        });
    }
    async account(id) {
        return this.snapshot(async db => {
            const saved = (await db.query('SELECT user_id,modules,achievements,revision,updated_at FROM cloud_saves WHERE user_id=$1', [id])).rows[0];
            if (!saved) return undefined;
            const devices = (await db.query('SELECT device_id,last_seq,updated_at FROM sync_devices WHERE user_id=$1 ORDER BY updated_at DESC', [id])).rows;
            const playtime = (await db.query(`SELECT device_id,game_id,total_ms,updated_at FROM game_playtime
                WHERE user_id=$1 ORDER BY total_ms DESC,game_id,device_id`, [id])).rows;
            const games = Object.entries(saved.modules).map(([code, payload]) => {
                const schema = catalog.games.find(game => String(game.code) === code);
                if (!schema) return { code, name: '未识别的游戏模块 ' + code, error: '当前版本没有此模块的解释规则。' };
                try {
                    const decoded = decodeModule(payload, schema.numbers.length, schema.stars?.keys.length ?? 0);
                    return { code, gameId: schema.gameId, name: labels[schema.gameId] ?? schema.gameId,
                        fields: schema.numbers.map((field, i) => ({ path: field.path, value: decoded.numbers[i] })),
                        stars: decoded.stars.map((stars, i) => ({ level: schema.stars.keys[i], stars })).filter(level => level.stars > 0) };
                } catch { return { code, gameId: schema.gameId, name: labels[schema.gameId] ?? schema.gameId, error: '存档编码无法用当前规则解析。' }; }
            });
            let achievements;
            try {
                achievements = Object.entries(decodeAchievements(saved.achievements)).map(([code, day]) => {
                    const game = catalog.games.find(item => String(item.achievement?.code) === code);
                    return { name: game ? (labels[game.gameId] ?? game.gameId) : '成就 ' + code,
                        date: new Date(day * 86400000).toISOString().slice(0, 10) };
                });
            } catch { achievements = [{ name: '成就数据无法解析', date: '' }]; }
            return { user_id: saved.user_id, revision: saved.revision, updated_at: saved.updated_at, devices,
                games, achievements, playtime: playtime.map(row => ({ ...row, name: labels[row.game_id] ?? row.game_id })) };
        });
    }
}
module.exports = { ViewerStore };
