#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempProject } = require('./verify-games.cjs');
const { AnnouncementStore } = require('./core.cjs');
const { AppConfigurationStore, APP_FILE } = require('./app.cjs');
const { startServer } = require('./server.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

async function main() {
    const root = tempProject();
    const target = path.join(root, APP_FILE);
    let server;
    try {
        const config = JSON.parse(fs.readFileSync(target, 'utf8'));
        config.futureSetting = { keep: true };
        config.ads.futureSetting = { keep: true };
        config.ads.games.futureGame = { enabled: false, keep: true };
        config.ads.games.meowdoku.futureSetting = 'keep';
        config.ads.wechat.meowdokuToolRewarded.futureSetting = 'keep';
        config.development.futureSetting = 'keep';
        config.fonts.futureSetting = 'keep';
        fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
        const store = new AppConfigurationStore({ root });
        const initial = store.state();
        assert.equal(initial.release.value.appVersion, '1.2.3');
        assert.equal(initial.games.find((game) => game.id === 'cyblockbees').supportsAds, false, '未接入的游戏不能伪造启用入口');
        assert.equal(initial.games.find((game) => game.id === 'rotate-rings').supportsAds, true);
        assert.ok(initial.placements.some((placement) => placement.key === 'rotateRingsHintRewarded' && placement.gameId === 'rotate-rings'));
        const before = fs.readFileSync(target, 'utf8');
        function reject(section, change, field) {
            const input = clone(initial[section].value);
            change(input);
            assert.throws(() => store.save(section, input, initial[section].revision), (error) => error.errors.some((item) => item.field === field));
            assert.equal(fs.readFileSync(target, 'utf8'), before, '非法输入不写入文件');
        }
        reject('release', (input) => { input.appVersion = 'v2'; }, 'appVersion');
        reject('release', (input) => { input.appVersion = '1.0.0-01'; }, 'appVersion');
        reject('release', (input) => { input.mockAds = 'true'; }, 'mockAds');
        reject('release', (input) => { input.fontLoadTimeoutMs = 0; }, 'fontLoadTimeoutMs');
        reject('ads', (input) => { input.games.meowdoku = 'false'; }, 'games.meowdoku');
        reject('ads', (input) => { input.wechat.meowdokuToolRewarded = 'ad\nunit'; }, 'wechat.meowdokuToolRewarded');
        reject('ads', (input) => { input.wechat.rotateRingsHintRewarded = 'ad\nunit'; }, 'wechat.rotateRingsHintRewarded');
        assert.throws(() => store.save('sharing', {}, ''), /配置类型/);
        assert.throws(() => store.save('ads', initial.ads.value, 'stale'), /其他页面/);

        const ads = clone(initial.ads.value);
        ads.games.meowdoku = false;
        ads.wechat.meowdokuToolRewarded = '  adunit-meowdoku  ';
        ads.games['rotate-rings'] = false;
        ads.wechat.rotateRingsHintRewarded = '  adunit-rings-test  ';
        ads.tapAdUnitId = 'tap-rewarded';
        ads.games.futureGame = true;
        ads.cloudSave = { enabled: true };
        const adResult = store.save('ads', ads, initial.ads.revision);
        assert.equal(adResult.appConfig.ads.value.wechat.meowdokuToolRewarded, 'adunit-meowdoku');
        let saved = JSON.parse(fs.readFileSync(target, 'utf8'));
        assert.equal(saved.ads.games.meowdoku.enabled, false);
        assert.equal(saved.ads.games['rotate-rings'].enabled, false);
        assert.equal(saved.ads.wechat.rotateRingsHintRewarded.adUnitId, 'adunit-rings-test');
        assert.equal(saved.ads.games.meowdoku.futureSetting, 'keep');
        assert.deepEqual(saved.ads.games.futureGame, config.ads.games.futureGame, '未知广告条目保留原值');
        assert.equal(saved.ads.wechat.meowdokuToolRewarded.futureSetting, 'keep');
        assert.deepEqual(saved.ads.futureSetting, config.ads.futureSetting);
        for (const key of Object.keys(config).filter((key) => key !== 'ads')) assert.deepEqual(saved[key], config[key], '广告保存不修改 ' + key);

        // 两页同时读出后先保存广告，发布页仍可用自己的旧版本保存。
        const release = clone(initial.release.value);
        release.appVersion = '2.0.0-beta.1';
        release.mockAds = true;
        release.showDevelopmentGames = false;
        release.fontsEnabled = true;
        release.validateFontCoverage = false;
        release.fontLoadTimeoutMs = 15000;
        const releaseResult = store.save('release', release, initial.release.revision);
        saved = JSON.parse(fs.readFileSync(target, 'utf8'));
        assert.equal(saved.appVersion, '2.0.0-beta.1');
        assert.equal(saved.development.mockAds, true);
        assert.equal(saved.fonts.loadTimeoutMs, 15000);
        assert.equal(saved.development.futureSetting, 'keep');
        assert.equal(saved.fonts.futureSetting, 'keep');
        assert.equal(saved.ads.wechat.meowdokuToolRewarded.adUnitId, 'adunit-meowdoku', '发布保存不回滚已保存广告');
        for (const key of ['sharing', 'cloudSave', 'designResolution', 'timeouts', 'qualityProfiles', 'renderLayers', 'schemaVersion', 'futureSetting']) {
            assert.deepEqual(saved[key], config[key], '非编辑配置保留：' + key);
        }
        assert.throws(() => store.save('release', initial.release.value, initial.release.revision), /其他页面/);

        // 同文件的非编辑配置发生变化，应合并保留，而不是覆盖它。
        saved.sharing.appMessage.title = '外部编辑的分享文案';
        fs.writeFileSync(target, JSON.stringify(saved, null, 2));
        store.save('release', releaseResult.appConfig.release.value, releaseResult.appConfig.release.revision);
        assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).sharing.appMessage.title, saved.sharing.appMessage.title);
        const current = store.state();
        const beforeFailure = fs.readFileSync(target, 'utf8');
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => {
            if (to === target) throw new Error('cannot rename');
            return rename(from, to);
        };
        try {
            assert.throws(() => store.save('ads', current.ads.value, current.ads.revision), /cannot rename/);
            assert.equal(fs.readFileSync(target, 'utf8'), beforeFailure);
            assert.ok(!fs.existsSync(target + '.' + process.pid + '.tmp'));
        } finally { fs.renameSync = rename; }

        let refreshes = 0;
        const service = await startServer({ store: new AnnouncementStore({ root }), appStore: store, port: 0,
            refresh: async () => { refreshes++; throw new Error('Cocos 未打开'); } });
        server = service.server;
        const auth = { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' };
        const call = async (url, body, headers = auth) => {
            const response = await fetch(service.baseUrl + url, { method: body ? 'POST' : 'GET', headers,
                ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: response.status, body: await response.json() };
        };
        assert.equal((await call('/api/app', null, {})).status, 403);
        assert.equal((await call('/api/app', null, { ...auth, Origin: 'http://evil.test' })).status, 403);
        const apiState = (await call('/api/app')).body;
        const bad = clone(apiState.release.value);
        bad.appVersion = 'bad';
        const invalid = await call('/api/app/save', { section: 'release', value: bad, revision: apiState.release.revision });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.errors[0].field, 'appVersion');
        assert.equal(refreshes, 0);
        apiState.ads.value.wechat.meowdokuToolRewarded = '';
        const response = await call('/api/app/save', { section: 'ads', value: apiState.ads.value, revision: apiState.ads.revision });
        assert.equal(response.status, 200);
        assert.equal(response.body.refreshed, false);
        assert.match(response.body.refreshError, /Cocos 未打开/);
        assert.equal(store.state().ads.value.wechat.meowdokuToolRewarded, '', '刷新失败仍保留已保存的配置');
        assert.equal(response.body.state.appVersion, '2.0.0-beta.1', '公告默认版本读取最新合集版本');
        assert.equal((await call('/api/app/save', { section: 'ads', value: apiState.ads.value, revision: apiState.ads.revision })).status, 409);

        fs.writeFileSync(target, JSON.stringify({ appVersion: '1.0.0' }));
        assert.equal(store.state().release.value.mockAds, false, '旧配置按运行时默认值读取');
        assert.equal(store.state().release.value.validateFontCoverage, true);
        console.log('广告与发布配置验证通过：字段校验、独立分区保存、未知字段保留、冲突保护、原子写入、访问控制与刷新反馈');
    } finally {
        if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
