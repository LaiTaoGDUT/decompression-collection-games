#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, GAMES_FILE, RUNTIME_FILE, AnnouncementStore } = require('./core.cjs');
const { GameCatalogStore } = require('./games.cjs');
const { createRulesLoader } = require('./runtime-rules.cjs');
const { startServer } = require('./server.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

function verifyRuleReload() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-rules-'));
    try {
        for (const file of ['assets/runtime/GameManifest.ts', 'assets/runtime/GameManifestValidator.ts',
            'assets/core/version/SemanticVersion.ts', 'assets/app/AppConfig.ts']) {
            const target = path.join(root, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(ROOT, file), target);
        }
        const rules = createRulesLoader(root);
        const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, GAMES_FILE), 'utf8'));
        const manifestPath = path.join(root, 'assets/runtime/GameManifest.ts');
        const source = fs.readFileSync(manifestPath, 'utf8');
        const first = rules();
        assert.equal(first.validateGameCatalog(catalog).valid, true, '当前所有游戏的奖杯样式合法');
        assert.equal(rules(), first, '源码未变时复用已编译规则');

        // 复现服务启动后新增奖杯：仅修改依赖，原有校验器也必须使用最新枚举。
        catalog.games.find((game) => game.achievement).achievement.trophy = 'reload-test';
        const rejected = first.validateGameCatalog(catalog);
        assert.ok(rejected.errors.some((error) => error.field.endsWith('.achievement.trophy')));
        fs.writeFileSync(manifestPath, source.replace('export const TROPHY_STYLES = [',
            "export const TROPHY_STYLES = ['reload-test', "));
        const updated = rules();
        assert.notEqual(updated, first);
        assert.equal(updated.validateGameCatalog(catalog).valid, true, '无需重启即可识别新增奖杯');

        fs.writeFileSync(manifestPath, source);
        assert.equal(rules().validateGameCatalog(catalog).valid, false, '撤销样式后重新拒绝，不能沿用缓存');

        const versionPath = path.join(root, 'assets/core/version/SemanticVersion.ts');
        const versionSource = fs.readFileSync(versionPath, 'utf8');
        fs.writeFileSync(versionPath, versionSource + '\nthrow new Error("reload failed");\n');
        assert.throws(() => rules(), /reload failed/, '加载失败不得回退到过期规则');
        assert.throws(() => rules(), /reload failed/, '失败后再次请求仍需重新加载');
        fs.writeFileSync(versionPath, versionSource);
        assert.equal(rules().validateGameCatalog(catalog).valid, false, '恢复源码后可以继续校验');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

function tempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-editor-'));
    const configs = path.join(root, 'assets/resources/configs');
    fs.mkdirSync(configs, { recursive: true });
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, GAMES_FILE), 'utf8'));
    catalog.futureCatalogField = { keep: true };
    catalog.games[0].futureGameField = { keep: true };
    fs.writeFileSync(path.join(root, GAMES_FILE), JSON.stringify(catalog, null, 2) + '\n');
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/resources/configs/app.json'), 'utf8'));
    app.appVersion = '1.2.3';
    fs.writeFileSync(path.join(configs, 'app.json'), JSON.stringify(app, null, 2) + '\n');
    return root;
}

async function main() {
    verifyRuleReload();
    const root = tempProject();
    const announcements = new AnnouncementStore({ root });
    const store = new GameCatalogStore({ root, announcements });
    let server;
    try {
        const active = announcements.save(null, { version: '1.2.3', date: '2026-10-13',
            newGames: [{ gameId: 'meowdoku', text: '上线' }], features: [], fixes: [] });
        announcements.activate(active.id);
        const initial = store.state();
        assert.ok(initial.options.lobbyTags.includes('new'));
        assert.deepEqual(initial.options.lobbyTags.slice().sort(), ['hot', 'new'], '沿用运行时推广标签规则');
        assert.equal(Object.hasOwn(initial.options, 'trophies'), false, '不提供隐藏字段的编辑选项');
        const previousText = fs.readFileSync(path.join(root, GAMES_FILE), 'utf8');
        function reject(change, pattern) {
            const catalog = clone(initial.catalog);
            change(catalog);
            assert.throws(() => store.save(catalog, initial.revision), pattern);
            assert.equal(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'), previousText, '非法输入不能改写文件');
        }
        reject((catalog) => { catalog.games[0].version = 'v1'; }, /校验失败/);
        reject((catalog) => { catalog.games[0].lobbyTags = ['new', 'new']; }, /校验失败/);
        reject((catalog) => { catalog.games[0].lobbyTags = ['popular']; }, /校验失败/);
        reject((catalog) => { catalog.games[0].tags = 'puzzle'; }, /校验失败/);
        reject((catalog) => { catalog.games[0].enabled = 'true'; }, /校验失败/);
        reject((catalog) => { catalog.games[0].id = 'renamed'; }, /游戏 ID/);
        reject((catalog) => { catalog.games.pop(); }, /添加或删除/);
        reject((catalog) => { catalog.schemaVersion = 2; }, /schemaVersion/);
        assert.throws(() => store.save(initial.catalog, 'stale'), /其他页面/);

        const catalog = clone(initial.catalog);
        const cat = catalog.games.find((game) => game.id === 'meowdoku');
        cat.name = '猫咪数独新版';
        cat.lobbyTags = ['hot'];
        cat.loadingCover = null;
        cat.initializeTimeoutMs = 12000;
        delete cat.achievement.lobbyProgress;
        cat.cover = '../outside/texture';
        cat.bundle = 'wrong-bundle';
        cat.achievement.target = 0;
        delete catalog.games[0].futureGameField;
        delete catalog.futureCatalogField;
        catalog.games.reverse();
        store.save(catalog, initial.revision);
        const saved = store.state();
        assert.equal(saved.catalog.games[0].id, catalog.games[0].id, '保存默认顺序');
        assert.deepEqual(saved.catalog.futureCatalogField, { keep: true });
        assert.deepEqual(saved.catalog.games.find((game) => game.id === initial.catalog.games[0].id).futureGameField, { keep: true });
        const savedCat = saved.catalog.games.find((game) => game.id === 'meowdoku');
        assert.deepEqual(savedCat.lobbyTags, ['hot']);
        const originalCat = initial.catalog.games.find((game) => game.id === 'meowdoku');
        for (const key of ['cover', 'loadingCover', 'achievement', 'bundle', 'resourceBundle', 'scene', 'entryComponent', 'orientation', 'renderMode', 'minimumDeviceTier', 'initializeTimeoutMs', 'resourceDirectories', 'preload']) {
            assert.deepEqual(savedCat[key], originalCat[key], '保护隐藏字段：' + key);
        }
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, RUNTIME_FILE), 'utf8')).announcement.newGames[0].gameName, cat.name,
            '改名同步生效公告的名称快照');
        assert.throws(() => store.save(initial.catalog, initial.revision), /其他页面/);

        // 写入生效公告失败时，游戏清单和旧公告一并还原。
        const beforeFailure = fs.readFileSync(path.join(root, GAMES_FILE), 'utf8');
        const oldRuntime = fs.readFileSync(path.join(root, RUNTIME_FILE), 'utf8');
        const badAnnouncements = { state: () => announcements.state(), writeRuntime: () => { throw new Error('disk full'); } };
        const failing = new GameCatalogStore({ root, announcements: badAnnouncements });
        const failingCatalog = clone(saved.catalog);
        failingCatalog.games.find((game) => game.id === 'meowdoku').name = '不应保存';
        assert.throws(() => failing.save(failingCatalog, saved.revision), /disk full/);
        assert.equal(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'), beforeFailure);
        assert.equal(fs.readFileSync(path.join(root, RUNTIME_FILE), 'utf8'), oldRuntime);

        // 原子替换失败时原文件不被截断，也不残留临时文件。
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => {
            if (to === path.join(root, GAMES_FILE)) throw new Error('cannot rename');
            return rename(from, to);
        };
        try {
            assert.throws(() => store.save(saved.catalog, saved.revision), /cannot rename/);
            assert.equal(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'), beforeFailure);
            assert.ok(!fs.existsSync(path.join(root, GAMES_FILE) + '.' + process.pid + '.tmp'));
        } finally { fs.renameSync = rename; }

        let refreshes = 0;
        let failRefresh = false;
        let releaseRefresh;
        const service = await startServer({ store: announcements, gameStore: store, port: 0,
            refresh: async () => {
                refreshes++;
                if (failRefresh) throw new Error('Cocos 未打开');
                if (releaseRefresh) await releaseRefresh.promise;
            } });
        server = service.server;
        const auth = { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' };
        const call = async (url, body, headers = auth) => {
            const response = await fetch(service.baseUrl + url, { method: body ? 'POST' : 'GET', headers,
                ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: response.status, body: await response.json() };
        };
        assert.equal((await call('/api/games', null, {})).status, 403);
        assert.equal((await call('/api/games', null, { ...auth, Origin: 'http://evil.test' })).status, 403);
        let current = (await call('/api/games')).body;
        const invalid = clone(current.catalog);
        invalid.games[0].version = 'bad';
        const invalidResponse = await call('/api/games/save', { catalog: invalid, revision: current.revision });
        assert.equal(invalidResponse.status, 400);
        assert.ok(invalidResponse.body.errors.some((error) => error.field === 'games[0].version'));
        assert.equal(refreshes, 0, '校验失败不能刷新或写入');
        current.catalog.games[0].enabled = false;
        const response = await call('/api/games/save', { catalog: current.catalog, revision: current.revision });
        assert.equal(response.status, 200);
        assert.equal(response.body.refreshed, true);
        assert.equal(response.body.gameConfig.catalog.games[0].enabled, false);
        assert.equal(response.body.state.games.find((game) => game.id === 'meowdoku').name, cat.name);
        assert.equal((await call('/api/games/save', { catalog: current.catalog, revision: current.revision })).status, 409);

        // 外部编辑同样触发冲突保护，不丢失磁盘上的内容。
        current = store.state();
        fs.appendFileSync(path.join(root, GAMES_FILE), '\n');
        assert.equal((await call('/api/games/save', { catalog: current.catalog, revision: current.revision })).status, 409);
        current = store.state();
        failRefresh = true;
        current.catalog.games[0].enabled = true;
        const persisted = await call('/api/games/save', { catalog: current.catalog, revision: current.revision });
        assert.equal(persisted.status, 200);
        assert.equal(persisted.body.refreshed, false);
        assert.match(persisted.body.refreshError, /Cocos 未打开/);
        assert.equal(store.state().catalog.games[0].enabled, true, '刷新失败明确报告，配置仍然保存');
        failRefresh = false;
        assert.equal((await call('/api/refresh', {})).body.refreshed, true);
        releaseRefresh = {};
        releaseRefresh.promise = new Promise((resolve) => { releaseRefresh.resolve = resolve; });
        const refreshing = call('/api/refresh', {});
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal((await call('/api/games/save', { catalog: current.catalog, revision: current.revision })).status, 409, '并发写入互斥');
        releaseRefresh.resolve();
        await refreshing;
        console.log('游戏配置编辑校验通过：运行时规则自动重载、共享清单规则、保存、公告联动、冲突保护、访问控制与刷新重试');
    } finally {
        if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
        fs.rmSync(root, { recursive: true, force: true });
    }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { tempProject };
