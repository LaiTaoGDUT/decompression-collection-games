#!/usr/bin/env node
'use strict';
// 在临时项目里验证公告编辑的规则、生效文件、纯文本与本地服务访问控制，不修改真实项目文件。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AnnouncementStore, HISTORY_FILE, RUNTIME_FILE, normalizeDraft, plainText } = require('./core.cjs');
const { startServer } = require('./server.cjs');

const GAMES = [
    { id: 'meowdoku', name: '猫咪数独', cover: 'visual/covers/meowdoku/cover/texture' },
    { id: 'catch', name: '桌面大清理', cover: '../../outside/texture' },
];

function tempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'announcements-'));
    const configs = path.join(root, 'assets/resources/configs');
    fs.mkdirSync(configs, { recursive: true });
    fs.writeFileSync(path.join(configs, 'games.json'), JSON.stringify({ schemaVersion: 3, games: GAMES }));
    fs.writeFileSync(path.join(configs, 'app.json'), JSON.stringify({ appVersion: '1.2.3' }));
    const covers = path.join(root, 'assets/lobby-covers/visual/covers/meowdoku');
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(covers, 'cover.jpg'), 'jpg');
    fs.mkdirSync(path.join(root, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(root, 'outside.png'), 'png');
    return root;
}

function draft(overrides = {}) {
    return { version: '1.2.3', date: '2026-10-11', newGames: [], features: [], fixes: [], ...overrides };
}

async function main() {
    // 校验规则
    assert.throws(() => normalizeDraft(draft(), GAMES), /至少填写一条/);
    assert.throws(() => normalizeDraft(draft({ fixes: [{ gameId: '', text: '修复' }] }), GAMES), /请选择游戏/);
    assert.throws(() => normalizeDraft(draft({ newGames: [{ gameId: 'collection', text: '新游戏' }] }), GAMES), /请选择游戏/);
    assert.throws(() => normalizeDraft(draft({ fixes: [{ gameId: 'catch', text: '' }] }), GAMES), /请填写内容/);
    assert.throws(() => normalizeDraft(draft({ fixes: [{ gameId: 'catch', text: '长'.repeat(61) }] }), GAMES), /超过 60 字/);
    assert.throws(() => normalizeDraft(draft({
        fixes: [{ gameId: 'catch', text: 'a' }, { gameId: 'catch', text: 'b' }],
    }), GAMES), /只写一条/);
    assert.throws(() => normalizeDraft(draft({ date: '2026/10/11', fixes: [{ gameId: 'catch', text: 'a' }] }), GAMES), /日期/);
    const normalized = normalizeDraft(draft({
        features: [{ gameId: 'collection', text: '  大厅新增   版本公告 ', extra: 1 }],
    }), GAMES);
    assert.deepEqual(normalized.features, [{ gameId: 'collection', text: '大厅新增 版本公告' }]);

    // 纯文本跳过空模块
    assert.equal(plainText(draft({
        newGames: [{ gameId: 'meowdoku', text: '上线' }],
        fixes: [{ gameId: 'catch', text: '修复卡顿' }, { gameId: 'collection', text: '修复闪退' }],
    }), GAMES), '【新游戏】\n1. 猫咪数独：上线\n\n【问题修复】\n1. 桌面大清理：修复卡顿\n2. 通用：修复闪退');

    // 保存、生效、编辑生效中的公告会重写游戏内文件
    const root = tempProject();
    let tick = 0;
    const store = new AnnouncementStore({ root, now: () => `2026-10-11T00:00:0${tick++}.000Z` });
    const first = store.save(null, draft({ newGames: [{ gameId: 'meowdoku', text: '上线' }] }));
    assert.equal(first.runtimeChanged, false);
    assert.ok(!fs.existsSync(path.join(root, RUNTIME_FILE)));
    const second = store.save(null, draft({ version: '1.3.0', fixes: [{ gameId: 'catch', text: '修复卡顿' }] }));
    assert.equal(store.state().announcements[0].id, second.id, '最新创建的公告排在最前');
    assert.deepEqual(store.activate(first.id), { id: first.id, runtimeChanged: true });
    const runtime = () => JSON.parse(fs.readFileSync(path.join(root, RUNTIME_FILE), 'utf8'));
    assert.deepEqual(runtime().announcement.newGames, [{ gameId: 'meowdoku', gameName: '猫咪数独', text: '上线' }]);
    assert.deepEqual(runtime().announcement.fixes, []);
    assert.equal(store.save(second.id, draft({ fixes: [{ gameId: 'catch', text: '改' }] })).runtimeChanged, false);
    assert.equal(store.save(first.id, draft({ newGames: [{ gameId: 'meowdoku', text: '正式上线' }] })).runtimeChanged, true);
    assert.equal(runtime().announcement.newGames[0].text, '正式上线');
    assert.equal(runtime().announcement.id, first.id, '编辑不改变公告 ID，已读公告不会重新显示红点');
    assert.throws(() => store.activate('missing'), /不存在/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, HISTORY_FILE), 'utf8')).activeId, first.id);

    // 本地服务访问控制与刷新
    let refreshes = 0;
    const { server, baseUrl, token } = await startServer({ store, port: 0, refresh: async () => { refreshes++; } });
    try {
        const call = (pathname, init = {}) => fetch(baseUrl + pathname, init).then(async (response) => ({
            status: response.status, body: await response.json().catch(() => null),
        }));
        assert.equal((await call('/api/state')).status, 403, '缺少页面令牌');
        const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
        assert.equal((await call('/api/state', { headers: { ...auth, Origin: 'http://evil.test' } })).status, 403);
        const state = await call('/api/state', { headers: auth });
        assert.equal(state.status, 200);
        assert.equal(state.body.activeId, first.id);
        const cover = (id, headers = auth) => fetch(baseUrl + '/api/cover?id=' + id, { headers });
        assert.equal((await cover('meowdoku', {})).status, 403, '封面同样需要页面令牌');
        const coverResponse = await cover('meowdoku');
        assert.equal(coverResponse.status, 200);
        assert.equal(coverResponse.headers.get('content-type'), 'image/jpeg');
        assert.equal(await coverResponse.text(), 'jpg');
        assert.equal((await cover('catch')).status, 404, '封面路径不能离开 lobby-covers');
        assert.equal((await cover('missing')).status, 404);
        const page = await fetch(baseUrl + '/').then((response) => response.text());
        assert.ok(page.includes(token) && !page.includes('/*__BOOT__*/ null'));
        const saved = await call('/api/save', { method: 'POST', headers: auth, body: JSON.stringify({
            id: first.id, announcement: draft({ features: [{ gameId: 'collection', text: '新增公告' }] }),
        }) });
        assert.equal(saved.status, 200);
        assert.equal(saved.body.refreshed, true);
        const invalid = await call('/api/save', { method: 'POST', headers: auth, body: JSON.stringify({ announcement: draft() }) });
        assert.equal(invalid.status, 400);
        assert.match(invalid.body.error, /至少填写一条/);
        const activated = await call('/api/activate', { method: 'POST', headers: auth, body: JSON.stringify({ id: second.id }) });
        assert.equal(activated.body.refreshed, true);
        assert.equal(runtime().announcement.id, second.id);
        assert.equal(refreshes, 2);

        const extra = store.save(null, draft({ version: '1.4.0', fixes: [{ gameId: 'catch', text: '多余' }] }));
        assert.equal(store.remove(extra.id).runtimeChanged, false);
        assert.equal(runtime().announcement.id, second.id);
        assert.throws(() => store.remove(extra.id), /不存在/);
        const removed = await call('/api/delete', { method: 'POST', headers: auth, body: JSON.stringify({ id: first.id }) });
        assert.equal(removed.status, 200);
        assert.equal(removed.body.runtimeChanged, false);
        assert.equal(removed.body.refreshed, false);
        assert.equal(runtime().announcement.id, second.id);
        assert.equal(removed.body.state.announcements.some((item) => item.id === first.id), false);
        const cleared = await call('/api/delete', { method: 'POST', headers: auth, body: JSON.stringify({ id: second.id }) });
        assert.equal(cleared.status, 200);
        assert.equal(cleared.body.refreshed, true);
        assert.equal(cleared.body.state.activeId, null);
        assert.equal(runtime().announcement, null);
        assert.equal(refreshes, 3);
        const missing = await call('/api/delete', { method: 'POST', headers: auth, body: JSON.stringify({ id: 'missing' }) });
        assert.equal(missing.status, 400);
        assert.match(missing.body.error, /不存在/);
    } finally {
        server.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
    console.log('版本公告编辑校验通过');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
