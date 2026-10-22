'use strict';

const { createHash } = require('node:crypto');
const { decodeAchievements, encodeAchievements } = require('./generated/CloudSaveCodec');
const { moduleRank, validateCatalog } = require('./generated/CloudSaveProjection');
const catalog = validateCatalog(require('./generated/catalog.json'));
const schemas = new Map(catalog.games.map(game => [String(game.code), game]));
const achievementCodes = new Set(catalog.games.filter(game => game.achievement).map(game => String(game.achievement.code)));
const EMPTY = encodeAchievements({});
const COLLECTION = 'cloud_saves';

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }

function identityFromContext(context) {
    if (!object(context)) fail('UNAUTHENTICATED');
    let env;
    try {
        if (context.environment) env = typeof context.environment === 'string' ? JSON.parse(context.environment) : context.environment;
        else if (typeof context.environ === 'string') {
            env = {};
            context.environ.split(';').forEach(entry => {
                const index = entry.indexOf('=');
                if (index > 0) Object.defineProperty(env, entry.slice(0, index), { value: entry.slice(index + 1), enumerable: true, configurable: true });
            });
        } else env = context.environ;
    } catch { fail('UNAUTHENTICATED'); }
    if (!object(env) || typeof env.WX_APPID !== 'string' || !/^wx[0-9a-f]{16}$/.test(env.WX_APPID)
        || typeof env.WX_OPENID !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(env.WX_OPENID)) fail('UNAUTHENTICATED');
    return { appId: env.WX_APPID, openId: env.WX_OPENID };
}

function validateRequest(event) {
    if (!object(event) || event.v !== 1 || !['load', 'save'].includes(event.op)) fail('INVALID_REQUEST');
    if (Buffer.byteLength(JSON.stringify(event), 'utf8') > 65536) fail('REQUEST_TOO_LARGE');
    if (event.op === 'load') return;
    if (typeof event.device !== 'string' || !/^[a-f0-9]{32}$/.test(event.device)
        || !Number.isSafeInteger(event.seq) || event.seq < 1 || !object(event.m)) fail('INVALID_REQUEST');
    for (const [code, payload] of Object.entries(event.m)) {
        const schema = schemas.get(code);
        if (!schema || typeof payload !== 'string') fail('UNKNOWN_MODULE');
        moduleRank(schema, payload);
    }
    if (event.a !== undefined) {
        const dates = decodeAchievements(event.a);
        for (const code of Object.keys(dates)) if (!achievementCodes.has(code)) fail('UNKNOWN_ACHIEVEMENT');
    }
    if (!Object.keys(event.m).length && event.a === undefined) fail('EMPTY_SAVE');
}

function validateDocument(document) {
    if (!document) return;
    if (document.v !== 1 || !object(document.m) || !object(document.c) || typeof document.a !== 'string') fail('UNSUPPORTED_SAVE');
    decodeAchievements(document.a);
    // 未知模块保留；旧版函数不能丢掉后来增加的游戏模块。
    for (const [code, payload] of Object.entries(document.m)) {
        if (schemas.has(code)) moduleRank(schemas.get(code), payload);
    }
    for (const [device, seq] of Object.entries(document.c)) {
        if (!/^[a-f0-9]{32}$/.test(device) || !Number.isSafeInteger(seq) || seq < 1) fail('INVALID_RECEIPTS');
    }
}

/** 每位玩家一个小文档；一次事务原子保存这次变化的多个逻辑模块。 */
function createHandler(db) {
    return async (event, identity) => {
        if (!identity || !identity.appId || !identity.openId) fail('UNAUTHENTICATED');
        validateRequest(event);
        const id = createHash('sha256').update(`${identity.appId}:${identity.openId}`).digest('hex');
        if (event.op === 'load') {
            const { data } = await db.collection(COLLECTION).doc(id).get();
            validateDocument(data);
            return data ? { v: 1, ok: true, found: true, m: data.m, a: data.a } : { v: 1, ok: true, found: false };
        }
        // 不使用事务回调的 SDK 包装返回值；只有提交成功后才返回 ACK。
        await db.runTransaction(async transaction => {
            const ref = transaction.collection(COLLECTION).doc(id);
            const { data } = await ref.get();
            validateDocument(data);
            const previous = data || { v: 1, m: {}, a: EMPTY, c: {} };
            if ((previous.c[event.device] || 0) >= event.seq) return;
            // 不淘汰旧设备回执，否则很久以前的重试仍可能覆盖同分新存档。
            if (!previous.c[event.device] && Object.keys(previous.c).length >= 128) fail('DEVICE_LIMIT');
            const modules = { ...previous.m };
            for (const [code, payload] of Object.entries(event.m)) {
                const schema = schemas.get(code), old = modules[code];
                if (!old || moduleRank(schema, payload) >= moduleRank(schema, old)) modules[code] = payload;
            }
            const dates = decodeAchievements(previous.a);
            if (event.a !== undefined) {
                for (const [code, day] of Object.entries(decodeAchievements(event.a))) {
                    dates[code] = dates[code] === undefined ? day : Math.min(dates[code], day);
                }
            }
            await ref.set({ data: { v: 1, m: modules, a: encodeAchievements(dates),
                c: { ...previous.c, [event.device]: event.seq }, updatedAt: db.serverDate() } });
        }, 3);
        return { v: 1, ok: true, seq: event.seq };
    };
}

module.exports = { createHandler, identityFromContext };
