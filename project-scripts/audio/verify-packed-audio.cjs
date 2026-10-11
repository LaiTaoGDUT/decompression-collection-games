// Verify file integrity, cue coverage and the real audio/resource lifecycle code.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
const ts = require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
const root = path.resolve(__dirname, '../..');
class Asset {
    isValid = true; refCount = 0;
    addRef() { this.refCount++; }
    decRef() { this.refCount--; }
    destroy() { this.isValid = false; return true; }
}
class AudioClip extends Asset {}
class BufferAsset extends Asset { constructor(data) { super(); this.data = data; } buffer() { return this.data; } }
const cc = { Asset, AudioClip, BufferAsset, assetManager: {},
    _decorator: { ccclass: () => value => value, property: () => {} } };
const modules = new Map();
function load(file) {
    const full = path.resolve(root, file);
    if (modules.has(full)) return modules.get(full);
    const exports = {}; modules.set(full, exports);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
    }).outputText;
    vm.runInNewContext(code, { exports, require(name) {
        return name === 'cc' ? cc : load(path.resolve(path.dirname(full), name) + '.ts');
    }, setTimeout, clearTimeout, setInterval, clearInterval, console }, { filename: full });
    return exports;
}
const { PackedAudioBank, readPackedAudioIndex } = load('assets/services/audio/PackedAudioBank.ts');
const { AudioService } = load('assets/services/audio/AudioService.ts');
const { AssetService } = load('assets/services/asset/AssetService.ts');
const { bubbleAudioEntries } = load('assets/games/bubble-shooter/scripts/BubbleShooterAudioCatalog.ts');
const { BubbleShooterAudio } = load('assets/games/bubble-shooter/scripts/BubbleShooterAudio.ts');
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const channels = () => ({ clip: null, loop: false, volume: 1, playing: false,
    play() { this.playing = true; }, stop() { this.playing = false; }, pause() { this.playing = false; }, playOneShot() {} });
function context() {
    return { state: 'running', destination: {}, sources: [], gains: [], requests: [], active: 0, peak: 0, closed: false,
        decodeAudioData(data, success) {
            this.requests.push(data); this.active++; this.peak = Math.max(this.peak, this.active);
            setTimeout(() => { this.active--; success({ duration: .2 }); }, 0);
        },
        createBufferSource() {
            const source = { buffer: null, onended: null, starts: 0, stops: 0, disconnected: false,
                connect() {}, disconnect() { this.disconnected = true; },
                start() { this.starts++; }, stop() { this.stops++; } };
            this.sources.push(source); return source;
        },
        createGain() {
            const gain = { gain: { value: 0 }, disconnected: false, connect() {}, disconnect() { this.disconnected = true; } };
            this.gains.push(gain); return gain;
        },
        resume() { this.state = 'running'; return Promise.resolve(); },
        close() { this.closed = true; this.state = 'closed'; },
    };
}
function service(ctx) {
    const audio = new AudioService(channels(), channels(), {
        snapshot: { settings: { soundEnabled: true, musicEnabled: true } }, updateSettings() {},
    }, () => ({ channel: channels(), dispose() {} }), undefined, () => ctx);
    audio.initialize(); return audio;
}
async function main() {
    const groups = ['common', 'cloud', 'ocean', 'toy', 'magic'], indexes = {}, data = {};
    let total = 0;
    for (const group of groups) {
        const bytes = fs.readFileSync(path.join(root, `assets/game-assets/bubble-shooter/audio-banks/${group}.bin`));
        data[group] = arrayBuffer(bytes);
        const { entries, payloadOffset } = readPackedAudioIndex(data[group]); indexes[group] = entries;
        for (const [key, entry] of Object.entries(entries)) {
            const source = fs.readFileSync(path.join(root, `audio-bank-sources/bubble-shooter/${key}.mp3`));
            assert.deepEqual(bytes.subarray(payloadOffset + entry.offset, payloadOffset + entry.offset + entry.length), source);
            assert.equal(key.endsWith('-music'), false); total++;
        }
    }
    assert.equal(total, 112);
    for (const region of groups.slice(1)) {
        for (const { cue, paths } of bubbleAudioEntries(region)) {
            for (const key of paths) {
                if (cue.endsWith('-music')) assert.ok(fs.existsSync(path.join(root, `assets/game-assets/bubble-shooter/${key}.mp3`)));
                else assert.ok((key.startsWith('visual/common/') ? indexes.common : indexes[region])[key], key);
            }
        }
    }
    for (const tier of [6, 7, 8, 9, 10]) assert.ok(indexes.common[`visual/common/combo/combo-${tier}`]);
    const invalid = data.common.slice(0); new Uint8Array(invalid)[0] = 0;
    assert.throws(() => readPackedAudioIndex(invalid), /signature/);
    assert.throws(() => readPackedAudioIndex(data.common.slice(0, -1)), /range|trailing/);

    const ctx = context(), audio = service(ctx), bank = await audio.decodePackedAudio(data.cloud);
    assert.equal(ctx.requests.length, 21); assert.equal(ctx.peak, 4); assert.equal(ctx.active, 0);
    const effect = bank.effect('visual/regions/cloud/audio/shot'), scope = audio.createEffectScope();
    for (let i = 0; i < 7; i++) scope.play(effect, .6);
    assert.equal(ctx.sources.filter(source => source.buffer !== null).length, 6);
    assert.equal(ctx.sources[0].stops, 1); assert.ok(ctx.sources[0].disconnected);
    assert.equal(ctx.gains[1].gain.value, .6);
    ctx.sources[1].onended(); assert.equal(ctx.sources[1].buffer, null); assert.ok(ctx.gains[1].disconnected);
    audio.onHide(); assert.ok(ctx.sources.every(source => source.buffer === null));
    scope.play(effect, .6); assert.equal(ctx.sources.length, 7);
    audio.onShow(); scope.play(effect, .6); assert.equal(ctx.sources.length, 8);
    audio.setSoundEnabled(false, false); assert.equal(ctx.sources[7].buffer, null);
    scope.play(effect, .6); assert.equal(ctx.sources.length, 8);
    audio.setSoundEnabled(true, false);

    // A pending browser unlock must never start audio after the game pauses/exits.
    ctx.state = 'suspended'; let resume;
    ctx.resume = () => new Promise(resolve => { resume = resolve; });
    scope.play(effect, .6); const waiting = ctx.sources.at(-1);
    scope.stop(); resume(); await tick(); assert.equal(waiting.starts, 0); assert.equal(waiting.buffer, null);
    ctx.state = 'running'; scope.dispose(); scope.play(effect, .6); assert.equal(ctx.sources.length, 9);

    // Variant rotation and regional overrides continue to use the original cue paths.
    const bubble = new BubbleShooterAudio();
    bubble.bind(audio, [{ cue: 'shot', volume: .5, clips: [], packedClips: [1, 2, 3].map(i =>
        bank.effect(`visual/regions/cloud/audio/shot${i === 1 ? '' : '-' + i}`)) }]);
    const played = [];
    const original = ctx.createBufferSource;
    ctx.createBufferSource = function () {
        const source = original.call(this); source.start = () => { played.push(source.buffer); source.starts++; }; return source;
    };
    for (let i = 0; i < 4; i++) { bubble.play('shot'); bubble.last.clear(); }
    assert.equal(played[0], played[3]); assert.notEqual(played[0], played[1]); assert.notEqual(played[1], played[2]);
    bubble.pause(); assert.ok(ctx.sources.every(source => source.buffer === null));
    bubble.dispose(); bank.destroy(); assert.equal(effect.buffer, undefined);
    audio.dispose(); assert.equal(ctx.closed, true);

    // Loading is deduplicated, and bundle release waits for decoding before destroying buffers.
    const resourceContext = context(), resourceAudio = service(resourceContext), source = new BufferAsset(data.common);
    let available = true, loads = 0, released = false, decode;
    const bundle = { load(_path, _type, callback) { loads++; callback(null, source); }, releaseAll() { released = true; } };
    const assets = new AssetService({ getBundle() { return available ? bundle : null; },
        loadBundle(_name, callback) { callback(null, bundle); }, removeBundle() { available = false; } });
    const first = assets.loadPackedAudio('test', 'audio-banks/common', () => new Promise(resolve => { decode = resolve; }));
    const second = assets.loadPackedAudio('test', 'audio-banks/common', () => { throw new Error('Duplicate decode'); });
    assert.equal(first, second); await tick(); assert.equal(loads, 1);
    const release = assets.releaseBundle('test'); await tick(); assert.equal(released, false);
    const resourceBank = await resourceAudio.decodePackedAudio(data.common); decode(resourceBank);
    await first; await release; assert.equal(released, true); assert.equal(source.refCount, 0);
    assert.equal(resourceBank.getBuffer('visual/common/audio/ui'), undefined);
    resourceAudio.dispose();

    // Callback + Promise APIs settle once; decode failure drains all in-flight requests.
    const dual = context();
    dual.decodeAudioData = (_data, success) => { const buffer = { duration: .2 }; success(buffer); return Promise.resolve(buffer); };
    const dualBank = await PackedAudioBank.decode(data.common, dual); dualBank.destroy();
    const failing = context(); let calls = 0, inFlight = 0;
    failing.decodeAudioData = (_data, success, fail) => {
        const current = ++calls; inFlight++;
        setTimeout(() => { inFlight--; current === 1 ? fail(new Error('Native decoder failed')) : success({ duration: .2 }); }, current);
    };
    await assert.rejects(PackedAudioBank.decode(data.common, failing), /Native decoder failed/);
    assert.equal(inFlight, 0); assert.equal(calls, 4);
    const closing = context(), closingAudio = service(closing), callbacks = [];
    closing.decodeAudioData = (_data, success) => { callbacks.push(success); };
    const pending = closingAudio.decodePackedAudio(data.common);
    closingAudio.dispose(); await assert.rejects(pending, /cancelled/);
    callbacks.forEach(success => success({ duration: .2 }));
    assert.equal(closing.closed, true);
    console.log('packed_audio=passed; 112 original MP3s preserved, all regional/combo cues covered, lifecycle and release verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
