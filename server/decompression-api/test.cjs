'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./app.cjs');
const { createAuth } = require('./auth.cjs');
const { createHash, createHmac } = require('node:crypto');
const { createWeChatProvider, createDouyinProvider, createLoginProviders } = require('./login-providers.cjs');
const { EMPTY, validateSave, mergeProgress, requestHash, schemas, envelope } = require('./protocol.cjs');
const { encodeModule, decodeModule } = require('./generated/CloudSaveCodec');
const appId = 'wx2a5e707ed76bedae';
const clock = Date.UTC(2026, 9, 24, 17);
const config = { tokenSecret: '2'.repeat(64), now: () => clock };
const appSecret = '1'.repeat(32);
function makeAuth({ appId: id = appId, appSecret: secret = appSecret, fetchImpl, ...options } = {}) {
    return createAuth({ ...config, providers: [createWeChatProvider({ appId: id, appSecret: secret, fetchImpl })], ...options });
}
const request = (extra = {}) => ({ v: 2, op: 'save', device: '3'.repeat(32), seq: 1,
    m: { 2: encodeModule([100, 10]) }, a: EMPTY, t: { meowdoku: 60000 }, ...extra });

test('field/star maximums and earliest achievements retain both devices', () => {
    const best = mergeProgress({ m: { 2: encodeModule([80, 30]), 4: encodeModule([2, 4], [1, 3]) }, a: EMPTY },
        request({ m: { 2: encodeModule([100, 10]), 4: encodeModule([2, 4], [3, 1]) } }));
    assert.deepEqual(decodeModule(best.m[2], 2).numbers, [100, 30]);
    assert.deepEqual(decodeModule(best.m[4], 2, 200).stars, [3, 3]);
    assert.equal(mergeProgress(best, request({ m: best.m })).m[4], best.m[4]);
    assert.ok(schemas.size >= 13);
});
test('request validation rejects unknown fields and invalid timing; hashes ignore JSON key order', () => {
    assert.throws(() => validateSave(request({ v: 1 })), { code: 'INVALID_REQUEST' });
    assert.throws(() => validateSave(request({ m: { 999: 'AQ==' } })), { code: 'UNKNOWN_MODULE' });
    assert.throws(() => validateSave(request({ t: { meowdoku: -1 } })), { code: 'INVALID_PLAYTIME' });
    assert.throws(() => validateSave(request({ t: { unknown: 1 } })), { code: 'INVALID_PLAYTIME' });
    assert.throws(() => validateSave(request({ m: { 2: 'bad' } })), { code: 'INVALID_MODULE' });
    const a = request({ t: { meowdoku: 1, 'meme-runner': 2 } });
    const b = request({ t: { 'meme-runner': 2, meowdoku: 1 } });
    assert.equal(requestHash(a), requestHash(b));
    assert.notEqual(requestHash(a), requestHash(request({ t: { meowdoku: 2 } })));
});
test('authentication binds app, signature, expiry and trusted WeChat identity', async () => {
    const auth = makeAuth({ fetchImpl: async url => {
        assert.equal(url.hostname, 'api.weixin.qq.com');
        assert.equal(url.searchParams.get('appid'), appId);
        return { ok: true, json: async () => ({ openid: 'trusted_openid_12345', session_key: 'private-session-key' }) };
    } });
    const value = await auth.login({ platform: 'wechat', code: 'valid_code_123' });
    assert.equal(Object.keys(value).sort().join(','), 'expiresIn,token');
    const uid = auth.verify('Bearer ' + value.token); assert.match(uid, /^[a-f0-9]{64}$/);
    assert.throws(() => auth.verify('Bearer ' + value.token + 'x'), { status: 401 });
    assert.equal(uid, createHash('sha256').update(appId + ':trusted_openid_12345').digest('hex'), 'Existing WeChat save keys remain unchanged');
    assert.equal(auth.verify('Bearer ' + (await auth.login({ code: 'valid_code_123' })).token), uid, 'Old code-only clients remain compatible');
    assert.throws(() => makeAuth({ appId: 'wx0000000000000000' }).verify('Bearer ' + value.token), { status: 401 });
    assert.throws(() => makeAuth({ now: () => clock + 86400001 }).verify('Bearer ' + value.token), { status: 401 });
    await assert.rejects(auth.login({ code: 'bad' }), { code: 'INVALID_LOGIN_CODE' });
    const failed = makeAuth({ fetchImpl: async () => ({ ok: true, json: async () => ({ errcode: 40029 }) }) });
    await assert.rejects(failed.login({ code: 'valid_code_123' }), { code: 'PLATFORM_LOGIN_FAILED' });
    const oldBody = Buffer.from(JSON.stringify({ v: 1, sub: uid, app: appId, exp: clock / 1000 + 3600 })).toString('base64url');
    const oldToken = oldBody + '.' + createHmac('sha256', config.tokenSecret).update(oldBody).digest('base64url');
    assert.equal(auth.verify('Bearer ' + oldToken), uid, 'Unexpired deployed v1 tokens remain compatible');
    assert.throws(() => makeAuth({ appId: 'wx0000000000000000' }).verify('Bearer ' + oldToken), { status: 401 });
});
test('login providers isolate accounts and tokens by platform and AppID without changing WeChat IDs', async () => {
    const visited = [];
    const fetchImpl = async (url, options) => {
        visited.push(url.hostname);
        assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
        return { ok: true, json: async () => url.hostname === 'api.weixin.qq.com'
            ? { openid: 'same_subject_12345' } : { error: 0, openid: 'same_subject_12345', session_key: 'private' } };
    };
    const env = { WX_APP_ID: appId, WX_APP_SECRET: appSecret, TT_APP_ID: 'tt1234567890abcdef', TT_APP_SECRET: '5'.repeat(32) };
    const auth = createAuth({ ...config, providers: createLoginProviders(env, { fetchImpl }) });
    assert.deepEqual(auth.platforms, ['douyin', 'wechat']);
    const wx = await auth.login({ platform: 'wechat', code: 'shared_login_code' });
    const tt = await auth.login({ platform: 'douyin', code: 'shared_login_code' });
    const wxUid = auth.verify('Bearer ' + wx.token), ttUid = auth.verify('Bearer ' + tt.token);
    assert.notEqual(wxUid, ttUid, 'The same upstream subject cannot collide between platforms');
    assert.deepEqual(visited, ['api.weixin.qq.com', 'minigame.zijieapi.com']);
    const movedApp = createAuth({ ...config, providers: createLoginProviders({ ...env, TT_APP_ID: 'tt0000000000000000' }, { fetchImpl }) });
    assert.throws(() => movedApp.verify('Bearer ' + tt.token), { status: 401 });
    assert.equal(movedApp.verify('Bearer ' + wx.token), wxUid);
    assert.notEqual(movedApp.verify('Bearer ' + (await movedApp.login({ platform: 'douyin', code: 'another_code' })).token), ttUid);
    assert.ok(!JSON.stringify(wx).includes('same_subject') && !JSON.stringify(tt).includes('private'));

    let calls = 0;
    const extensible = createAuth({ ...config, providers: [{ platform: 'future-platform', appId: 'another-app', configured: true,
        async exchangeCode() { calls++; return { subject: 'verified:federated:account' }; } }] });
    assert.match(extensible.verify('Bearer ' + (await extensible.login({ platform: 'future-platform', code: 'opaque-code' })).token), /^[a-f0-9]{64}$/);
    await assert.rejects(extensible.login({ platform: 'wechat', code: 'opaque-code' }), { code: 'UNSUPPORTED_LOGIN_PLATFORM' });
    assert.equal(calls, 1, 'Missing or unknown platforms never fall back to another provider');
});
test('unconfigured and malformed platform logins never exchange credentials', async () => {
    let calls = 0;
    const providers = createLoginProviders({ WX_APP_ID: appId, WX_APP_SECRET: appSecret, TT_APP_ID: 'tt1234567890abcdef' },
        { fetchImpl: async () => { calls++; throw new Error('Must not be called'); } });
    const auth = createAuth({ ...config, providers });
    assert.deepEqual(auth.platforms, ['wechat']); assert.equal(auth.configured, true);
    await assert.rejects(auth.login({ platform: 'douyin', code: 'valid_code_123' }), { code: 'LOGIN_NOT_CONFIGURED', status: 503 });
    await assert.rejects(auth.login({ platform: 'unknown', code: 'valid_code_123' }), { code: 'UNSUPPORTED_LOGIN_PLATFORM' });
    for (const value of [null, [], 'valid_code_123', { platform: null, code: 'valid_code_123' },
        { platform: 'wechat', code: 'valid_code_123', openid: 'client_chosen_identity' }, { code: 'x'.repeat(2049) }]) {
        await assert.rejects(auth.login(value));
    }
    assert.equal(calls, 0);
    assert.equal(createAuth({ ...config, providers: [] }).configured, false);
    assert.throws(() => createLoginProviders({ TT_APP_SECRET: '5'.repeat(32) }), /TT_APP_ID/);
    assert.throws(() => createAuth({ ...config, providers: [providers[0], providers[0]] }), /duplicate/);
});
test('Douyin uses the official minigame exchange and requires a non-anonymous verified identity', async () => {
    let value = { error: 0, openid: 'trusted_douyin_subject', anonymous_openid: 'ignored-anonymous' };
    const provider = createDouyinProvider({ appId: 'tt1234567890abcdef', appSecret: '5'.repeat(32), fetchImpl: async (url, options) => {
        assert.equal(url.origin + url.pathname, 'https://minigame.zijieapi.com/mgplatform/api/apps/jscode2session');
        assert.equal(url.searchParams.get('appid'), 'tt1234567890abcdef');
        assert.equal(url.searchParams.get('secret'), '5'.repeat(32));
        assert.equal(url.searchParams.get('code'), 'valid_douyin_code');
        assert.equal(options.headers['content-type'], 'application/json');
        assert.equal(url.searchParams.has('anonymous_code'), false);
        return { ok: true, json: async () => value };
    } });
    const auth = createAuth({ ...config, providers: [provider] });
    assert.match(auth.verify('Bearer ' + (await auth.login({ platform: 'douyin', code: 'valid_douyin_code' })).token), /^[a-f0-9]{64}$/);
    for (const failure of [null, { error: 40018 }, { error: 0, anonymous_openid: 'anonymous-only' },
        { err_no: 0, data: { openid: 'wrong-miniprogram-protocol' } }]) {
        value = failure;
        await assert.rejects(auth.login({ platform: 'douyin', code: 'valid_douyin_code' }), { code: 'PLATFORM_LOGIN_FAILED' });
    }
    const unavailable = createAuth({ ...config, providers: [createDouyinProvider({ appId: provider.appId, appSecret,
        fetchImpl: async () => ({ ok: false }) })] });
    await assert.rejects(unavailable.login({ platform: 'douyin', code: 'valid_douyin_code' }), { code: 'PLATFORM_LOGIN_UNAVAILABLE', status: 502 });
});
test('two HTTP operations combine login and server time; anonymous load never accesses player data', async () => {
    let exchanges = 0;
    const logs = [], auth = makeAuth({ fetchImpl: async () => {
        exchanges++; return { ok: true, json: async () => ({ openid: 'trusted_openid_12345' }) };
    } });
    const calls = [];
    const store = {
        async ready() {},
        async load(id) { calls.push(['load', id]); return { found: false, m: {}, a: EMPTY }; },
        async save(id, value) {
            validateSave(value); assert.equal(value.auth, undefined, 'Login credentials never reach persistence');
            calls.push(['save', id]); return { found: true, ...mergeProgress(null, value), seq: value.seq };
        },
    };
    const server = createServer({ store, auth, now: () => clock, log: value => logs.push(value) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    const post = (path, body, headers = {}) => fetch(url + path, { method: 'POST',
        headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const load = { v: 2, op: 'load' }, credential = { platform: 'wechat', code: 'valid_code_123' };
    try {
        const time = await post('/v1/load', { ...load, clockOnly: true });
        assert.equal(time.headers.get('cache-control'), 'no-store');
        assert.equal(time.headers.get('access-control-allow-origin'), '*');
        const clockBody = await time.json();
        assert.deepEqual(clockBody, envelope({ clockOnly: true }, clock));
        assert.equal(calls.length, 0); assert.equal(exchanges, 0, 'Anonymous load never exchanges credentials');
        assert.equal((await fetch(url + '/v1/load', { method: 'OPTIONS' })).status, 204, 'Browser clock supports JSON preflight');
        assert.deepEqual((await (await fetch(url + '/ready')).json()).loginPlatforms, ['wechat']);
        assert.equal((await post('/v1/load', load)).status, 401);
        assert.equal((await post('/v1/save', request())).status, 401);
        for (const body of [{ ...load, clockOnly: true, auth: credential }, { ...load, clockOnly: 'true' },
            { ...load, openid: 'client-chosen' }, { ...load, auth: { ...credential, openid: 'client-chosen' } }]) {
            assert.equal((await post('/v1/load', body)).status, 400);
        }
        assert.equal((await post('/v1/save', { ...request(), v: 1, auth: credential })).status, 400);
        assert.equal(exchanges, 0, 'Malformed operations are rejected before consuming a one-use credential');
        const loaded = await post('/v1/load', { ...load, auth: credential });
        assert.equal(loaded.status, 200);
        const value = await loaded.json(), token = value.token, uid = auth.verify('Bearer ' + token);
        assert.equal(value.found, false); assert.equal(value.serverTime, clock); assert.equal(value.serverDay, '2026-10-25');
        assert.equal(value.expiresIn, 86400); assert.equal(exchanges, 1, 'One load verifies identity and returns the save');
        const headers = { Authorization: 'Bearer ' + token };
        const readAgain = await post('/v1/load', load, headers);
        assert.equal(readAgain.status, 200); assert.equal((await readAgain.json()).token, undefined);
        const saved = await post('/v1/save', request(), headers);
        assert.equal(saved.status, 200);
        const ack = await saved.json(); assert.equal(ack.seq, 1); assert.equal(ack.serverTime, clock);
        const freshSave = await post('/v1/save', { ...request(), auth: credential });
        assert.equal(freshSave.status, 200); assert.equal(typeof (await freshSave.json()).token, 'string',
            'A save can authenticate directly without a prior load');
        assert.equal(exchanges, 2);
        assert.equal((await post('/v1/load', { ...load, auth: credential }, headers)).status, 400);
        assert.equal((await post('/v1/load', { ...load, clockOnly: true }, headers)).status, 400);
        assert.equal((await post('/v1/load', load, { Authorization: 'Bearer invalid' })).status, 401);
        const malformed = await fetch(url + '/v1/save', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{broken' });
        assert.equal(malformed.status, 400);
        const huge = await post('/v1/save', { data: 'x'.repeat(70000) }, headers);
        assert.equal(huge.status, 413);
        for (const path of ['/v1/time', '/v1/login']) assert.equal((await fetch(url + path)).status, 404);
        assert.equal((await fetch(url + '/v1/save')).status, 405);
        assert.ok(calls.every(([, id]) => id === uid), 'Storage identity always comes from the verified platform identity');
        assert.ok(logs.every(line => !line.includes(uid) && !line.includes('Bearer') && !line.includes(appSecret) && !line.includes('valid_code_123')));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('the same two business endpoints keep platform accounts separate with identical upstream and device IDs', async () => {
    const verifiedSubject = 'identical_upstream_subject';
    const auth = createAuth({ ...config, providers: [
        { platform: 'wechat', appId, configured: true, async exchangeCode() { return { subject: verifiedSubject }; } },
        { platform: 'douyin', appId: 'tt1234567890abcdef', configured: true, async exchangeCode() { return { subject: verifiedSubject }; } },
    ] });
    const saves = new Map();
    const store = { async ready() {}, async load(uid) { return saves.get(uid) ?? { found: false, m: {}, a: EMPTY }; },
        async save(uid, body) { validateSave(body); const saved = { found: true, seq: body.seq, ...mergeProgress(saves.get(uid), body) };
            saves.set(uid, saved); return saved; } };
    const server = createServer({ auth, store, log() {} });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    const post = (path, body, headers = {}) => fetch(url + path, { method: 'POST',
        headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    try {
        const sessions = {};
        for (const platform of ['wechat', 'douyin']) {
            const response = await post('/v1/load', { v: 2, op: 'load', auth: { platform, code: 'opaque-login-code' } });
            assert.equal(response.status, 200);
            sessions[platform] = { Authorization: 'Bearer ' + (await response.json()).token };
        }
        const saved = await post('/v1/save', request(), sessions.wechat);
        assert.equal(saved.status, 200);
        const ttLoad = await post('/v1/load', { v: 2, op: 'load' }, sessions.douyin);
        assert.equal((await ttLoad.json()).found, false);
        const ttWrite = await post('/v1/save', request({ m: { 2: encodeModule([2, 1]) } }), sessions.douyin);
        assert.equal(ttWrite.status, 200);
        const wxLoad = await post('/v1/load', { v: 2, op: 'load' }, sessions.wechat);
        assert.deepEqual(decodeModule((await wxLoad.json()).m[2], 2).numbers, [100, 10]);
        assert.equal(saves.size, 2);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('database migration history protects completed SQL and the compatibility floor', () => {
    const { loadMigrations, plan, assertTransactional } = require('./migrate.cjs');
    const migrations = loadMigrations(), first = migrations[0];
    assert.deepEqual(plan(migrations, []).pending, [1]);
    const applied = [{ version: 1, file: first.file, sha256: first.sha256, min_app_version: 1 }];
    assert.deepEqual(plan(migrations, applied, { requireApplied: true }).pending, []);
    assert.throws(() => plan(migrations, [{ ...applied[0], sha256: '0'.repeat(64) }]), /modified/);
    const extended = migrations.concat({ version: 2, file: '0002_test.sql', sha256: '1'.repeat(64), minAppVersion: 2 });
    assert.throws(() => plan(extended, applied, { compatibleVersion: 1 }), /prevent rollback/);
    assert.throws(() => plan(migrations, applied.concat({ version: 2, file: '0002_test.sql', sha256: '1'.repeat(64), min_app_version: 2 })), /compatibility floor/);
    assert.throws(() => assertTransactional('SELECT 1; -- safe-looking comment\nCOMMIT;'), /transaction/);
    assert.doesNotThrow(() => assertTransactional("SELECT 'COMMIT;'; DO $$ BEGIN NULL; END; $$;"));
});
