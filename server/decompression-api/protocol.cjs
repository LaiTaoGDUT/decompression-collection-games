'use strict';
const { createHash } = require('node:crypto');
const { decodeAchievements, encodeAchievements } = require('./generated/CloudSaveCodec');
const { moduleRank, mergeModule, validateCatalog } = require('./generated/CloudSaveProjection');
const catalog = validateCatalog(require('./generated/catalog.json'));
const games = new Set(require('./generated/games.json'));
const schemas = new Map(catalog.games.map(game => [String(game.code), game]));
const achievements = new Set(catalog.games.filter(game => game.achievement).map(game => String(game.achievement.code)));
const EMPTY = encodeAchievements({});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(code, status = 400) { throw Object.assign(new Error(code), { code, status }); }
function validateSave(value) {
    if (!object(value) || value.v !== 2 || value.op !== 'save' || typeof value.device !== 'string' || !/^[a-f0-9]{32}$/.test(value.device)
        || !Number.isSafeInteger(value.seq) || value.seq < 1 || !object(value.m) || !object(value.t)) fail('INVALID_REQUEST');
    if (Buffer.byteLength(JSON.stringify(value)) > 65536) fail('REQUEST_TOO_LARGE', 413);
    for (const [code, payload] of Object.entries(value.m)) {
        const schema = schemas.get(code);
        if (!schema || typeof payload !== 'string') fail('UNKNOWN_MODULE');
        try { moduleRank(schema, payload); } catch { fail('INVALID_MODULE'); }
    }
    if (value.a !== undefined) {
        let dates;
        try { dates = decodeAchievements(value.a); } catch { fail('INVALID_ACHIEVEMENTS'); }
        if (Object.keys(dates).some(code => !achievements.has(code))) fail('UNKNOWN_ACHIEVEMENT');
    }
    for (const [id, ms] of Object.entries(value.t)) {
        if (!games.has(id) || !Number.isSafeInteger(ms) || ms < 0) fail('INVALID_PLAYTIME');
    }
    return value;
}
function mergeProgress(previous, request) {
    const m = { ...(previous?.m ?? {}) };
    for (const [code, payload] of Object.entries(request.m)) m[code] = mergeModule(schemas.get(code), m[code], payload);
    const dates = decodeAchievements(previous?.a ?? EMPTY);
    if (request.a !== undefined) for (const [code, day] of Object.entries(decodeAchievements(request.a))) {
        dates[code] = dates[code] === undefined ? day : Math.min(day, dates[code]);
    }
    return { m, a: encodeAchievements(dates) };
}
function requestHash(request) {
    const sorted = map => Object.keys(map).sort().map(key => [key, map[key]]);
    return createHash('sha256').update(JSON.stringify([request.v, request.device, request.seq,
        sorted(request.m), request.a ?? null, sorted(request.t)])).digest('hex');
}
function serverTime(now = Date.now()) {
    return { serverTime: now, serverDay: new Date(now + 8 * 3600000).toISOString().slice(0, 10) };
}
function envelope(data, now) { return { v: 2, ok: true, ...data, ...serverTime(now) }; }
module.exports = { catalog, games, schemas, EMPTY, fail, validateSave, mergeProgress, requestHash, serverTime, envelope };
