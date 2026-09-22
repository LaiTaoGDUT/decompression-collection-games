// Verify the production transition lifecycle without opening a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
const ts = require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
class UITransform { setContentSize() {} setAnchorPoint() {} }
class Graphics { clear() {} rect() {} fill() {} }
class Label {}
Label.HorizontalAlign = { CENTER: 1, LEFT: 0 }; Label.VerticalAlign = { CENTER: 1 };
class Sprite {}
Sprite.SizeMode = { CUSTOM: 0 };
class Color {}
Color.WHITE = new Color();
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.handlers = {}; this.active = true; }
    setParent(parent) { this.parent = parent; parent.children.push(this); }
    addComponent(Type) { const component = new Type(); component.node = this; this.components.set(Type, component); return component; }
    getComponent(Type) { return this.components.get(Type); }
    getComponentsInChildren(Type) { return [this.getComponent(Type), ...this.children.flatMap(n => n.getComponentsInChildren(Type))].filter(Boolean); }
    setPosition(x, y) { this.position = { x, y }; }
    setScale() {} setSiblingIndex() {} destroy() { this.destroyed = true; }
    on(event, callback) { this.handlers[event] = callback; }
}
Node.EventType = { TOUCH_END: 'end' };
const listeners = new Set();
const cc = { Node, UITransform, Graphics, Label, Sprite, Color, UIOpacity: class {}, BlockInputEvents: class {},
    Director: { EVENT_AFTER_DRAW: 'draw' }, director: { on: (_, fn) => listeners.add(fn), off: (_, fn) => listeners.delete(fn) } };
const exportsObject = {};
const source = fs.readFileSync(path.resolve(__dirname, '../../assets/games/bubble-shooter/scripts/BubbleShooterTransitionView.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: exportsObject, require: () => cc, console: { warn() {} } });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
(async () => {
    const frame = { originalSize: { width: 600, height: 200 } };
    const view = new exportsObject.BubbleShooterTransitionView(new Node('Parent'), frame, frame, frame, () => {});
    view.layout(750, 1334, 0);
    assert(view.loadingRoot.position.y < 0);
    let resolve, commits = 0;
    view.start(() => new Promise(done => { resolve = done; }), () => commits++);
    await flush(); assert.equal(resolve, undefined, 'no resource preparation before coverage');
    for (let i = 0; i < 11; i++) view.update(.05);
    assert.equal(view.phase, 'closing'); assert(!view.loadingRoot.active);
    view.update(.05); assert.equal(view.phase, 'covered'); assert.equal(view.coveredWait, 0); await flush();
    view.update(.99); assert(!view.loadingRoot.active);
    view.update(.02); assert(view.loadingRoot.active); assert.equal(view.loadingDots.string, '.');
    view.update(1); assert.equal(view.loadingDots.string, '..');
    view.update(1); assert.equal(view.loadingDots.string, '...');
    view.update(1); assert.equal(view.loadingDots.string, '.');
    resolve(); await flush(); view.update(.01);
    assert.equal(view.phase, 'rendering'); assert.equal(commits, 1); assert(view.loadingRoot.active);
    view.afterDraw(); view.afterDraw(); view.update(.01);
    assert.equal(view.phase, 'opening'); assert(!view.loadingRoot.active);
    view.cancel(); assert.equal(view.coveredWait, 0);
    view.start(async () => {}, () => commits++); await flush();
    for (let i = 0; i < 12; i++) view.update(.05); await flush(); view.update(.01);
    assert.equal(commits, 2); assert(!view.loadingRoot.active, 'fast load never flashes loading text');
    view.cancel();
    view.start(async () => { throw Error('expected failure'); }, () => commits++); await flush();
    for (let i = 0; i < 12; i++) view.update(.05); await flush(); view.update(.01);
    assert.equal(view.phase, 'error'); assert(!view.loadingRoot.active); assert(view.errorRoot.active);
    view.prepare = () => new Promise(() => {});
    view.errorRoot.children.find(n => n.name === '重试').handlers.end({});
    assert.equal(view.coveredWait, 0); view.update(.99); assert(!view.loadingRoot.active);
    view.update(.02); assert(view.loadingRoot.active);
    view.cancel(); assert(!view.loadingRoot.active);
    view.start(() => new Promise(done => { resolve = done; }), () => commits++); await flush();
    for(let i=0;i<12;i++)view.update(.05); await flush();
    view.dispose(); resolve(); await flush();
    assert.equal(commits, 2); assert.equal(listeners.size, 0); assert(view.root.destroyed);
    console.log('Transition loading: full coverage + 1s delay, real-time dot cycle, render gate, fast loads, retry, cancellation and disposal passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
