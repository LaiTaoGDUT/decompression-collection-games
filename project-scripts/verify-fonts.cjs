// Verify real font service/binding logic, without replacing engine prototypes.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
const ts = require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
const root = path.resolve(__dirname, '..');
class Component { enabled = true; isValid = true; }
class Font { constructor(name) { this.name = name; this._nativeAsset = name; } }
class JsonAsset {}
class Label extends Component {
    string = ''; isBold = false; fontFamily = 'Arial'; useSystemFont = true; font = null;
}
class Node extends EventEmitter {
    static EventType = { CHILD_ADDED: 'add', CHILD_REMOVED: 'remove', COMPONENT_ADDED: 'component', COMPONENT_REMOVED: 'component-remove', NODE_DESTROYED: 'destroy' };
    children = []; components = []; isValid = true;
    add(child) { this.children.push(child); this.emit('add', child); }
    remove(child) { this.children.splice(this.children.indexOf(child), 1); this.emit('remove', child); }
    addComponent(Type) { const c = new Type(); c.node = this; this.components.push(c); this.emit('component', c); return c; }
    getComponent(Type) { return this.components.find(c => c instanceof Type) ?? null; }
    getComponents(Type) { return this.components.filter(c => c instanceof Type); }
}
let scene = new Node();
const director = new EventEmitter(); director.getScene = () => scene;
const cc = { Component, Font, JsonAsset, Label, Node, director, Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene' }, _decorator: { ccclass: () => x => x, property: () => {} } };
const cache = new Map();
function load(file) {
    const full = path.resolve(root, file); if (cache.has(full)) return cache.get(full);
    const exports = {}; cache.set(full, exports);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
    vm.runInNewContext(code, { exports, require(name) { return name === 'cc' ? cc : load(path.resolve(path.dirname(full), name) + '.ts'); }, setTimeout, clearTimeout, console: { warn() {} } });
    return exports;
}
const { FontService } = load('assets/services/font/FontService.ts');
const { FontBinding, setLabelBold } = load('assets/services/font/FontBinding.ts');
const { normalizeAppConfig } = load('assets/app/AppConfig.ts');
function setup() {
    const calls = [], releases = [], regular = new Font('Regular'), bold = new Font('Bold');
    const bundle = { get(p) { return p.endsWith('regular') ? regular : p.endsWith('bold') ? bold : { json: { characters: '开始游戏再玩一次分数0123456789 ABC' } }; } };
    const assets = { prepareBundle: async (...args) => { calls.push(args); return bundle; }, releaseBundle: async name => { releases.push(name); } };
    return { service: new FontService(assets), assets, calls, releases, regular, bold };
}
function tick(node = scene) { node.getComponents(FontBinding).forEach(c => { if (c.enabled) c.lateUpdate(); }); node.children.forEach(tick); }
(async () => {
    assert.equal(normalizeAppConfig({ fonts: { enabled: false } }).fonts.enabled, false);
    assert.equal(normalizeAppConfig({}).fonts.enabled, false, 'missing config fails closed');
    const off = setup(); await off.service.initialize({ enabled: false, loadTimeoutMs: 100 });
    assert.equal(off.calls.length, 0); assert.equal(director.listenerCount('scene'), 0); off.service.dispose(); assert.equal(off.releases.length, 0);

    const staticNode = new Node(); const label = staticNode.addComponent(Label); label.string = '开始游戏'; label.isBold = true; scene.add(staticNode);
    const on = setup(); const init = on.service.initialize({ enabled: true, loadTimeoutMs: 100 });
    assert.equal(init, on.service.initialize({ enabled: true, loadTimeoutMs: 100 })); await init; tick();
    assert.equal(on.calls.length, 1); assert.equal(label.font, on.bold); assert.equal(label.isBold, false);
    setLabelBold(label, false); assert.equal(label.font, on.regular); setLabelBold(label, true); assert.equal(label.font, on.bold);
    label.string = '✦'; tick(); assert.equal(label.font, null); assert.equal(label.useSystemFont, true); assert.equal(label.isBold, true);
    label.string = '再玩一次'; tick(); assert.equal(label.font, on.bold);
    const binding = staticNode.getComponent(FontBinding); binding.systemFontOnly = true; tick(); assert.equal(label.font, null); binding.systemFontOnly = false; tick(); assert.equal(label.font, on.bold);

    const dynamic = new Node(); scene.add(dynamic); const d = dynamic.addComponent(Label); d.string = '分数'; d.fontFamily = 'PingFang SC'; setLabelBold(d, true); tick();
    assert.equal(d.font, on.bold); scene.remove(dynamic); assert.equal(d.font, null); assert.equal(d.fontFamily, 'PingFang SC'); assert.equal(dynamic.eventNames().length, 0);
    setLabelBold(d, false); scene.add(dynamic); tick(); assert.equal(d.font, on.regular);
    const dedicated = new Node(), custom = dedicated.addComponent(Label); custom.font = new Font('GameOwned'); custom.useSystemFont = false; scene.add(dedicated); tick(); assert.equal(custom.font.name, 'GameOwned'); setLabelBold(custom, true); assert.equal(custom.isBold, true, 'dedicated fonts retain their own bold behavior');
    const oldScene = scene; scene = new Node(); oldScene.remove(dynamic); scene.add(dynamic); director.emit('scene'); tick(); assert.equal(d.font, on.regular); assert.equal(oldScene.eventNames().length, 0);
    on.service.dispose(); assert.equal(d.font, null); assert.equal(d.isBold, false); assert.equal(scene.eventNames().length, 0); assert.equal(director.listenerCount('scene'), 0); assert.equal(on.releases.length, 1);

    const failed = setup(); failed.assets.prepareBundle = async () => { throw Error('offline'); }; await failed.service.initialize({ enabled: true, loadTimeoutMs: 100 }); assert.equal(failed.service.isReady, false); assert.equal(director.listenerCount('scene'), 0);
    // Creator's WeChat parser returns Arial instead of an error on registration
    // failure; equal families also collapse the two real weights on WeChat.
    for (const families of [['Arial', 'Bold'], ['Regular', 'Arial'], ['', 'Bold'], ['Shared', 'Shared']]) {
        const invalid = setup(); invalid.regular._nativeAsset = families[0]; invalid.bold._nativeAsset = families[1];
        await invalid.service.initialize({ enabled: true, loadTimeoutMs: 100 });
        assert.equal(invalid.service.isReady, false, `Invalid registration accepted: ${families}`);
        assert.equal(director.listenerCount('scene'), 0); assert.equal(invalid.releases.length, 1);
    }
    const late = setup(); let resolve; late.assets.prepareBundle = () => new Promise(r => resolve = r); const pending = late.service.initialize({ enabled: true, loadTimeoutMs: 100 }); late.service.dispose(); resolve({ get() { throw Error('disposed code accessed resources'); } }); await pending; assert.equal(late.service.isReady, false);
    const timeout = setup(); let resolveTimeout; timeout.assets.prepareBundle = () => new Promise(r => resolveTimeout = r); await timeout.service.initialize({ enabled: true, loadTimeoutMs: 2 }); resolveTimeout({ get() { throw Error('timed out code accessed resources'); } }); await Promise.resolve(); assert.equal(timeout.service.isReady, false); assert.equal(timeout.releases.length, 1);

    // Artifact invariants: isolated subpackage, no serialized font UUID references, real weight files.
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/shared-fonts.meta')));
    assert.equal(meta.userData.isSubpackage, true); assert.equal(meta.userData.bundleName, 'shared-fonts');
    const app = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/app.json')));
    assert.equal(typeof app.fonts.enabled, 'boolean');
    const sources = execFileSync('rg', ['--files', 'assets', '-g', '*.scene', '-g', '*.prefab'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
    const shippedFamilies = [];
    for (const weight of ['regular', 'bold']) {
        const base = path.join(root, `assets/shared-fonts/fonts/${weight}.ttf`);
        const fontMeta = JSON.parse(fs.readFileSync(base + '.meta'));
        assert.equal(fontMeta.importer, 'ttf-font'); assert(fs.statSync(base).size > 1000000);
        // Inspect the shipped binary, not filenames: wx.loadFont uses name ID 1.
        const data = fs.readFileSync(base);
        let nameTable;
        for (let index = 0; index < data.readUInt16BE(4); index++) {
            const record = 12 + 16 * index;
            if (data.toString('ascii', record, record + 4) === 'name') nameTable = data.readUInt32BE(record + 8);
        }
        assert.notEqual(nameTable, undefined, 'TTF must contain internal names');
        const storage = nameTable + data.readUInt16BE(nameTable + 4);
        const names = new Map();
        for (let index = 0; index < data.readUInt16BE(nameTable + 2); index++) {
            const record = nameTable + 6 + 12 * index;
            const platform = data.readUInt16BE(record), id = data.readUInt16BE(record + 6);
            if (platform !== 3 || ![1, 4, 6, 16].includes(id)) continue;
            const start = storage + data.readUInt16BE(record + 10), length = data.readUInt16BE(record + 8);
            const name = Buffer.from(data.subarray(start, start + length)).swap16().toString('utf16le');
            const variants = names.get(id) || []; variants.push(name); names.set(id, variants);
        }
        const expected = `DecompressionUIRounded${weight === 'regular' ? 'Regular' : 'Bold'}Level1`;
        for (const id of [1, 4, 6, 16]) {
            assert(names.get(id)?.length, `Missing internal font name ID ${id}`);
            assert(names.get(id).every(name => name === expected), `Inconsistent internal font name ID ${id}`);
        }
        shippedFamilies.push(expected);
        for (const file of sources) assert(!fs.readFileSync(path.join(root, file), 'utf8').includes(fontMeta.uuid), `Static reference loads font with switch off: ${file}`);
    }
    assert.notEqual(shippedFamilies[0], shippedFamilies[1], 'WeChat weights must register distinct families');
    console.log('fonts=passed: disabled zero-load, singleton load, real weights, dynamic text/labels, fallback, explicit opt-out, custom fonts, scene cleanup, disposal, failure, timeout and package isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
