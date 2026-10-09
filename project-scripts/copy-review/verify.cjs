'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ts, scan, prepare, ROOT, publicCatalog } = require('./core.cjs');
const { ApplyService, startServer } = require('./server.cjs');
const recommendations = require('./recommendations.cjs');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-review-check-'));
function put(file, value) { const target = path.join(temporary, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
const file = 'assets/games/watermelon/scripts/Text.ts';
const original = [
    "// 不要修改注释里的继续游戏",
    "type State = '继续游戏';",
    "const resource = { title: 'visual/ui/logo/texture' };",
    "const first = '继续游戏', second = \"继续游戏\";",
    "const score = 3, ready = true;",
    "const status = `当前${ready ? '已准备' : '未准备'}，得分${score}`;",
    "const staticTemplate = `静态提示`;",
    "const message = '包含\\n换行';",
].join('\n') + '\n';
put(file, original);
put('assets/games/watermelon/scenes/Game.scene', JSON.stringify([{ __type__: 'cc.Label', _string: '继续游戏' }]));
put('assets/resources/configs/games.json', JSON.stringify({ games: [{ id: 'watermelon', name: '游戏名称', description: '游戏描述', bundle: 'game-test' }] }));
const get = (catalog, text) => { const entry = catalog.entries.find(e => e.original === text); assert(entry, text); return entry; };

(async () => {
    const catalog = scan(temporary);
    assert.equal(get(catalog, '继续游戏').locations.length, 3, 'same scoped copy includes two scripts and a scene');
    assert(!catalog.entries.some(e => e.original.includes('visual/ui/')));
    assert.equal(get(catalog, '游戏名称').scope, 'watermelon');
    const patched = prepare(catalog, [
        { id: get(catalog, '继续游戏').id, value: '继续玩“这一局”' },
        { id: get(catalog, '当前{0}，得分{1}').id, value: '状态：{0}，分数：{1}，字面量 ${notCode}' },
        { id: get(catalog, '已准备').id, value: '已经就绪' },
        { id: get(catalog, '静态提示').id, value: '包含 `引号` 和 ${literal}' },
    ], temporary);
    const script = patched.files.find(f => f.file === file).value;
    assert(script.includes("// 不要修改注释里的继续游戏"));
    assert(script.includes("type State = '继续游戏'"));
    assert(script.includes("ready ? \"已经就绪\" : '未准备'"));
    assert(script.includes('字面量 \\${notCode}'));
    assert(script.includes('\\`引号\\`'));
    assert.equal(ts.createSourceFile(file, script, 99, true).parseDiagnostics.length, 0);
    const scene = JSON.parse(patched.files.find(f => f.file.endsWith('.scene')).value);
    assert.equal(scene[0]._string, '继续玩“这一局”');
    assert.throws(() => prepare(catalog, [{ id: get(catalog, '当前{0}，得分{1}').id, value: '得分{1}当前{0}' }], temporary), /占位符/);
    assert.throws(() => prepare(catalog, [{ id: get(catalog, '继续游戏').id, value: '   ' }], temporary), /不能为空/);
    put(file, original + '// 外部修改\n');
    assert.throws(() => prepare(catalog, [{ id: get(catalog, '继续游戏').id, value: '继续玩' }], temporary), /其他操作修改/);
    put(file, original);

    let refreshed = 0;
    const service = new ApplyService({ root: temporary, validate: async () => {}, fonts: async () => {}, refresh: async () => { refreshed++; } });
    const change = { id: get(service.catalog(), '继续游戏').id, value: '继续这一局' };
    const applied = await service.apply(service.catalog().version, [change]);
    assert.equal(applied.changedEntries, 1); assert.equal(applied.changedFiles, 2); assert.equal(refreshed, 1);
    assert(fs.existsSync(path.join(applied.backupDirectory, file)));
    assert.equal(fs.readFileSync(path.join(applied.backupDirectory, file), 'utf8'), original);
    assert.equal(get(service.catalog(), '继续这一局').locations.length, 3);
    await service.undo(); assert.equal(fs.readFileSync(path.join(temporary, file), 'utf8'), original); assert.equal(refreshed, 2);

    const failing = new ApplyService({ root: temporary, validate: async () => { throw new Error('模拟编译失败'); }, fonts: async () => {}, refresh: async () => { refreshed++; } });
    await assert.rejects(failing.apply(failing.catalog().version, [change]), /已恢复全部原文件[\s\S]*模拟编译失败/);
    assert.equal(fs.readFileSync(path.join(temporary, file), 'utf8'), original);
    assert.equal(get(failing.catalog(), '继续游戏').locations.length, 3);

    let release; const gate = new Promise(resolve => release = resolve);
    const concurrent = new ApplyService({ root: temporary, validate: () => gate, fonts: async () => {}, refresh: async () => {} });
    const pending = concurrent.apply(concurrent.catalog().version, [change]);
    await assert.rejects(concurrent.apply(catalog.version, [change]), /正在应用/);
    release(); await pending; await concurrent.undo();

    const running = await startServer({ port: 0, service, saveSnapshot: false });
    try {
        const headers = { Authorization: 'Bearer ' + running.token };
        assert.equal((await fetch(running.baseUrl + '/api/catalog')).status, 403);
        assert.equal((await fetch(running.baseUrl + '/api/catalog', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
        assert.equal((await fetch(running.baseUrl + '/api/catalog', { headers: { ...headers, Origin: 'null' } })).status, 200);
        const html = await (await fetch(running.baseUrl)).text();
        assert(html.includes('继续游戏')); assert(html.includes(running.token));
        const latest = await (await fetch(running.baseUrl + '/api/catalog', { headers })).json();
        const result = await fetch(running.baseUrl + '/api/apply', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: latest.catalog.version, changes: [change] }) });
        assert.equal(result.status, 200); assert.equal((await result.json()).changedFiles, 2);
        await service.undo();
    } finally { await new Promise(resolve => running.server.close(resolve)); }

    const real = scan(ROOT, recommendations);
    for (const group of real.groups) assert(real.entries.some(e => e.scope === group.id), 'missing group ' + group.id);
    const recommended = real.entries.filter(e => e.recommendation).map(e => ({ id: e.id, value: e.recommendation }));
    const plan = prepare(real, recommended);
    for (const item of plan.files) {
        if (item.file.endsWith('.ts')) assert.equal(ts.createSourceFile(item.file, item.value, 99, true).parseDiagnostics.length, 0);
        else JSON.parse(item.value);
    }
    assert.equal(plan.changedEntries, real.stats.recommendations);
    const renderedCatalog = JSON.stringify(publicCatalog(real));
    assert(!renderedCatalog.includes('"start":'), 'do not expose writable ranges to client');
    console.log(`copy-review=passed: ${real.stats.entries} entries, ${real.stats.occurrences} occurrences, ${real.stats.recommendations} recommendations; exact AST edits, nested templates, JSON, escaping, conflict rejection, rollback, undo, request authorization and real recommendation plan`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(temporary, { recursive: true, force: true }));
