const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
class Asset {
    isValid = true; refs = 0;
    addRef() { this.refs++; }
    decRef() { this.refs--; }
    destroy() { this.isValid = false; }
}
class Rect {
    constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    clone() { return new Rect(this.x, this.y, this.width, this.height); }
}
class Size {
    constructor(width, height) { Object.assign(this, { width, height }); }
    clone() { return new Size(this.width, this.height); }
}
class Vec2 {
    constructor(x, y) { Object.assign(this, { x, y }); }
    clone() { return new Vec2(this.x, this.y); }
}
class SpriteFrame extends Asset {}
class Texture2D extends Asset { width = 64; height = 48; }
const exportsObject = {};
const source = fs.readFileSync(path.resolve(__dirname, '../assets/services/asset/AssetService.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, {
    exports: exportsObject, setTimeout, clearTimeout,
    require: name => name === 'cc' ? { Asset, Texture2D, SpriteFrame, Rect, Size, assetManager: {} } : {},
});
const { AssetService } = exportsObject;
function fixture() {
    let loaded = true;
    const pending = [], events = [];
    const bundle = { load(path, type, done) { pending.push({ path, type, done }); }, releaseAll() { events.push('release'); } };
    const assets = new AssetService({ getBundle: () => loaded ? bundle : null, removeBundle() { loaded = false; events.push('remove'); } });
    return { assets, pending, events };
}
function frame() {
    return Object.assign(new SpriteFrame(), {
        texture: new Texture2D(), rect: new Rect(11, 7, 24, 18), originalSize: new Size(40, 36), offset: new Vec2(-3, 2),
        rotated: true, insetLeft: 4, insetRight: 5, insetTop: 6, insetBottom: 3,
    });
}
(async () => {
    const a = fixture(), original = frame();
    const load = a.assets.loadSpriteFrame('game', 'atlas/button');
    a.pending[0].done(null, original);
    const copy = await load;
    for (const key of ['rect', 'originalSize', 'offset']) {
        assert.deepEqual(copy[key], original[key]); assert.notEqual(copy[key], original[key]);
    }
    for (const key of ['texture', 'rotated', 'insetLeft', 'insetRight', 'insetTop', 'insetBottom']) assert.equal(copy[key], original[key]);
    copy.rect.x = 0;
    assert.equal(original.rect.x, 11);
    a.assets.releaseRuntimeAsset(copy);
    assert(!copy.isValid && original.isValid, 'disposing a runtime copy destroys the atlas-owned frame');
    await a.assets.releaseBundle('game');
    assert.equal(original.refs, 0);

    const b = fixture();
    const inFlight = b.assets.loadSpriteFrames('game', [{ key: 'a', path: 'atlas/a' }, { key: 'b', path: 'atlas/b' }]);
    const release = b.assets.releaseBundle('game');
    b.pending[0].done(null, frame());
    await Promise.resolve();
    assert.equal(b.events.length, 0, 'bundle was released while a frame acquisition was pending');
    b.pending[1].done(null, frame());
    const frames = await inFlight;
    await release;
    assert(!frames.a.isValid && !frames.b.isValid);
    assert.equal(b.assets.runtimeAssets.size, 0);
    assert.equal(b.assets.pendingAssetGroups.size, 0);

    const c = fixture();
    const partial = c.assets.loadSpriteFrames('game', [{ key: 'a', path: 'atlas/a' }, { key: 'b', path: 'atlas/missing' }]);
    const rejection = assert.rejects(partial, /missing/);
    c.pending[0].done(null, frame());
    c.pending[1].done(new Error('missing'));
    await rejection;
    assert.equal(c.assets.runtimeAssets.size, 0, 'partial acquisition leaked a runtime frame');
    await c.assets.releaseBundle('game');
    console.log('SpriteFrame geometry, independent ownership, pending-release barrier and partial failure cleanup passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
