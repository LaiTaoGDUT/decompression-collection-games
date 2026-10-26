'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, root, plain } = require('../helpers/runtime.cjs');
const { fixture } = require('../storage/recovery.cjs');
const { CloudSaveService } = load('assets/services/cloud/CloudSaveService.ts');
const { ServerTimeService, canReceiveDailyReward } = load('assets/services/cloud/ServerTimeService.ts');
const projection = load('assets/services/cloud/CloudSaveProjection.ts');
const { encodeModule, decodeModule, encodeAchievements } = load('assets/services/cloud/CloudSaveCodec.ts');
const { validateSave, mergeProgress, envelope, EMPTY } = require('../../server/decompression-api/protocol.cjs');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/cloud-save.json'), 'utf8'));
const meow = catalog.games.find(g => g.gameId === 'meowdoku');
const cy = catalog.games.find(g => g.gameId === 'cyblockbees');
const bubble = catalog.games.find(g => g.gameId === 'bubble-shooter');
const runner = catalog.games.find(g => g.gameId === 'meme-runner');
const stamp = Date.UTC(2026, 9, 24, 17);
const base = () => ({ schemaVersion: 3, settings: { musicEnabled: true, soundEnabled: true, vibrationEnabled: true }, games: {}, achievements: {} });
const game = (schema, values, extra = {}) => ({ dataVersion: schema.dataVersion, playCount: 0, ...extra,
    custom: { ...(extra.custom ?? {}), ...(schema === meow ? { meowdokuCleared: values[0], meowdokuHard: { cleared: values[1] ?? 0 } } : {}) } });
const meowGame = (normal, hard = 0, custom = {}) => game(meow, [normal, hard], { custom });
const pause = () => new Promise(resolve => setTimeout(resolve, 5));

function backend() {
    let saved = { m: {}, a: EMPTY }, found = false, serverNow = stamp;
    const requests = [], receipts = new Map(), totals = {};
    return {
        requests, totals, get saved() { return saved; }, set saved(value) { saved = value; found = true; },
        set serverNow(value) { serverNow = value; },
        async call(request) {
            requests.push(plain(request));
            if (request.op === 'load' && request.clockOnly) return envelope({ clockOnly: true }, serverNow);
            if (request.op === 'load') return envelope({ found, ...saved }, serverNow);
            validateSave(request);
            if ((receipts.get(request.device) ?? 0) < request.seq) {
                saved = mergeProgress(saved, request); found = true; receipts.set(request.device, request.seq);
                Object.keys(request.t).forEach(id => { totals[id] = (totals[id] ?? 0) + request.t[id]; });
            }
            return envelope({ found: true, ...saved, seq: request.seq }, serverNow);
        },
    };
}
async function use(data, body, options = {}) {
    const f = fixture(data), remote = options.remote ?? backend(); f.storage.load();
    let clock = 0, active;
    const time = new ServerTimeService();
    const c = new CloudSaveService({ storage: f.storage, catalog, time, call: request => remote.call(request),
        activeGame: () => active, canRestore: () => true, now: () => clock, autoTick: false, ...options });
    try {
        await c.initialize();
        await body({ f, remote, c, time, setClock: value => { clock = value; }, setActive: id => { active = id; c.checkActivity(); } });
    } finally { c.dispose(); f.storage.dispose(); }
}
const saves = remote => remote.requests.filter(request => request.op === 'save');

async function main() {
    await use(base(), async ({ c, remote, time }) => {
        assert.deepEqual(remote.requests, [{ v: 2, op: 'load', clockOnly: true }], 'Below threshold: anonymous clock only, no player data or analytics');
        assert.equal(c.status.enabled, false); assert.equal(time.day, '2026-10-25');
        c.setVisible(false); c.setVisible(true); await c.pump();
        assert.equal(remote.requests.length, 1, 'Warm resume does not refresh clock');
    });
    for (const levels of [19, 20]) {
        const data = base(); data.games.meowdoku = meowGame(levels);
        await use(data, async ({ c, remote }) => {
            assert.equal(c.status.enabled, levels === 20);
            assert.deepEqual(remote.requests.map(r => r.op), levels === 20 ? ['load', 'save'] : ['load']);
            assert.equal(remote.requests[0].clockOnly, levels === 20 ? undefined : true);
            if (levels === 20) assert.equal(saves(remote)[0].v, 2);
        });
    }
    for (const [total, perGame, enabled] of [[119 * 60000, 44 * 60000, false], [120 * 60000, 0, true], [0, 45 * 60000, true]]) {
        const data = base(); data.cloudSave = { version: 1, enabled: true, totalMs: total, gameMs: { 'meme-runner': perGame } };
        await use(data, async ({ c, remote }) => {
            assert.equal(c.status.enabled, enabled, 'Old CloudBase enabled flag is not a new-server acknowledgement');
            if (enabled) assert.deepEqual(saves(remote)[0].t, {}, 'Do not fabricate pre-upgrade analytics');
        });
    }
    const awarded = base();
    awarded.achievements.meowdoku = { achievementId: meow.achievement.id, progress: 500, unlockedAt: stamp };
    await use(awarded, async ({ c, remote }) => { assert.equal(c.status.enabled, true); assert.equal(saves(remote).length, 1); });

    let persistent = base();
    for (let day = 1; day <= 6; day++) {
        const remote = backend(); remote.serverNow = stamp + day * 86400000;
        await use(persistent, async ({ f, c }) => {
            assert.equal(c.status.enabled, day > 5, 'Six distinct trusted login dates enable sync');
            persistent = plain(f.storage.snapshot);
        }, { remote });
        if (day === 3) await use(persistent, async ({ f, c }) => {
            assert.equal(c.status.enabled, false); persistent = plain(f.storage.snapshot);
            assert.equal(persistent.cloudSave.loginDays.length, 3, 'Same server day is not another login day');
        }, { remote });
    }

    const initial = base(); initial.games.meowdoku = meowGame(20);
    let healthy;
    await use(initial, async ({ f, remote }) => {
        assert.equal(saves(remote).length, 1); healthy = plain(f.storage.snapshot);
    });
    await use(healthy, async ({ c, remote, f, setActive, setClock }) => {
        assert.deepEqual(remote.requests.map(r => r.op), ['load'], 'Every eligible cold start loads; it does not force a save');
        for (let n = 21; n <= 24; n++) f.storage.writeGameData('meowdoku', meowGame(n));
        await c.pump(); assert.equal(saves(remote).length, 0);
        f.storage.writeGameData('meowdoku', meowGame(25)); await c.pump();
        assert.equal(saves(remote).length, 1, 'Five new clears upload');
        setActive('meowdoku'); setClock(70000); c.tick();
        setActive(undefined); await c.pump();
        assert.equal(saves(remote).length, 1, 'Playtime alone and session changes do not add upload triggers');
        f.storage.writeGameData('meowdoku', meowGame(30)); await c.pump();
        assert.equal(saves(remote)[1].t.meowdoku, 70000, 'Count playtime after sync is enabled');
        assert.equal(f.storage.snapshot.cloudSave.playMs.meowdoku, 0);
        c.setVisible(false); setClock(90000); c.setVisible(true); c.tick();
        assert.equal(f.storage.snapshot.cloudSave.gameMs.meowdoku, 70000, 'Background is excluded');
    });

    // Seed several starred old levels; 1->3 is one improvement, and a new cleared level is not counted twice.
    const starData = base(); starData.games.meowdoku = meowGame(20);
    starData.games.cyblockbees = { dataVersion: 1, playCount: 0, custom: { version: 4, cleared: 5, best: { 1: 200, 2: 200, 3: 200, 4: 200, 5: 200 } } };
    await use(starData, async ({ f, c, remote }) => {
        const update = (best, cleared = 5) => f.storage.writeGameData('cyblockbees', { dataVersion: 1, playCount: 0, custom: { version: 4, cleared, best } });
        update({ 1: 600, 2: 200, 3: 200, 4: 200, 5: 200 });
        assert.equal(f.storage.snapshot.cloudSave.unsavedClears, 1);
        update({ 1: 600, 2: 200, 3: 200, 4: 200, 5: 200 });
        assert.equal(f.storage.snapshot.cloudSave.unsavedClears, 1, 'Repeated result is not an improvement');
        update({ 1: 600, 2: 600, 3: 600, 4: 600, 5: 200 });
        f.storage.writeGameData('meowdoku', meowGame(21)); await c.pump();
        assert.equal(saves(remote).length, 2, 'New clears and old-level stars accumulate across games');
        update({ 1: 600, 2: 600, 3: 600, 4: 600, 5: 200, 6: 600 }, 6);
        assert.equal(f.storage.snapshot.cloudSave.unsavedClears, 1, 'New clear with stars counts once');
    });

    await use(initial, async ({ f, c, remote }) => {
        f.storage.writeGameData('meme-runner', { dataVersion: 1, playCount: 0, highScore: 99 });
        await c.pump(); assert.equal(saves(remote).length, 1, 'Live score changes do not upload');
        c.recordRoundFinished('meme-runner'); c.recordRoundFinished('meme-runner'); await pause(); await c.pump();
        assert.equal(saves(remote).length, 2, 'A settled new record uploads once');
        c.recordRoundFinished('meme-runner'); await pause(); await c.pump();
        assert.equal(saves(remote).length, 2, 'Same record on duplicate settlement does not upload');
        f.storage.writeGameData('meme-runner', { dataVersion: 1, playCount: 0, highScore: 100 });
        c.recordRoundFinished('meme-runner'); await pause(); await c.pump();
        assert.equal(saves(remote).length, 3);
    });

    await use(initial, async ({ f, c, remote }) => {
        f.storage.writeGameData('sling-puck', { dataVersion: 1, playCount: 1,
            custom: { slingWins0: 1 } });
        c.recordRoundFinished('sling-puck'); await pause(); await c.pump();
        assert.equal(saves(remote).length, 1, 'Cumulative match/win counters are not a settled best record');
        f.storage.writeGameData('meowdoku', meowGame(25)); await c.pump();
        assert.ok(saves(remote)[1].m[16], 'Counters still accompany the next eligible upload');
    });

    await use(initial, async ({ c, f, setActive }) => {
        setActive('meowdoku');
        for (let i = 0; i < 20; i++) c.advance(0.5);
        c.tick();
        assert.equal(f.storage.snapshot.cloudSave.totalMs, 10000, 'Actual engine frames supply playtime');
        const original = Date.now;
        try { Date.now = () => original() + 30 * 86400000; c.tick(); }
        finally { Date.now = original; }
        assert.equal(f.storage.snapshot.cloudSave.totalMs, 10000, 'Changing wall-clock date adds no playtime');
        c.setVisible(false); c.advance(50000); c.setVisible(true); c.tick();
        assert.equal(f.storage.snapshot.cloudSave.totalMs, 10000, 'Suspended frames add no time');
    }, { now: undefined });

    const concurrent = backend(); let hold = false, release, signal;
    const inFlight = new Promise(resolve => { signal = resolve; });
    await use(initial, async ({ c, f, remote }) => {
        hold = true;
        f.storage.writeGameData('meme-runner', { dataVersion: 1, playCount: 0, highScore: 100 });
        c.recordRoundFinished('meme-runner'); await pause();
        const saving = c.pump(); await inFlight;
        f.storage.writeGameData('meme-runner', { dataVersion: 1, playCount: 0, highScore: 101 });
        c.recordRoundFinished('meme-runner'); await pause();
        hold = false; release(); await saving;
        assert.equal(f.storage.snapshot.cloudSave.requested, true, 'An in-flight ACK preserves a newer record trigger');
        await c.pump();
        assert.equal(saves(remote).length, 3);
        assert.equal(decodeModule(saves(remote)[2].m[runner.code], runner.numbers.length).numbers[0], 101);
    }, { remote: concurrent, call: async request => {
        const response = await concurrent.call(request);
        if (request.op === 'save' && hold) { signal(); await new Promise(resolve => { release = resolve; }); }
        return response;
    } });

    // Server committed, response lost, play continues, app restarts: replay exact batch and subtract only its snapshot.
    const lost = backend(); let failResponse = false, memory, lostBatch;
    await use(initial, async ({ f, c, setClock, setActive }) => {
        setActive('meowdoku'); setClock(90000); c.tick();
        f.storage.writeGameData('meowdoku', meowGame(25)); failResponse = true;
        await c.pump(); lostBatch = plain(f.storage.snapshot.cloudSave.pending.request);
        setClock(120000); c.tick(); f.storage.flush(); memory = plain(f.storage.snapshot);
        assert.equal(lost.totals.meowdoku, 90000);
    }, { remote: lost, call: async request => {
        const value = await lost.call(request);
        if (request.op === 'save' && failResponse) throw new Error('Simulated response loss');
        return value;
    } });
    failResponse = false;
    await use(memory, async ({ f, remote, c }) => {
        assert.equal(remote.totals.meowdoku, 90000, 'Replay does not duplicate analytics');
        assert.equal(f.storage.snapshot.cloudSave.playMs.meowdoku, 30000, 'New time remains pending');
        const retried = saves(remote).filter(r => r.seq === lostBatch.seq);
        assert.deepEqual(retried[retried.length - 1], lostBatch, 'Replay uses the original immutable request');
        f.storage.writeGameData('meowdoku', meowGame(30)); await c.pump();
        assert.equal(remote.totals.meowdoku, 120000);
    }, { remote: lost });

    const a = encodeModule([100, 10]), b = encodeModule([80, 30]);
    const merged = projection.mergeModule(meow, a, b);
    assert.deepEqual(plain(decodeModule(merged, 2).numbers), [100, 30]);
    const starsA = encodeModule([2, 4], [3, 1]), starsB = encodeModule([2, 4], [1, 3]);
    const starMerge = projection.mergeModule(cy, starsA, starsB);
    assert.deepEqual(plain(decodeModule(starMerge, 2, 200).stars), [3, 3]);
    assert.equal(projection.mergeModule(cy, starsA, starsB), projection.mergeModule(cy, starsB, starsA));
    assert.equal(projection.mergeModule(cy, starMerge, starsA), starMerge);
    const third = encodeModule([3, 4], [2, 2, 1]);
    assert.equal(projection.mergeModule(cy, projection.mergeModule(cy, starsA, starsB), third),
        projection.mergeModule(cy, starsA, projection.mergeModule(cy, starsB, third)));
    const restored = projection.restoreGame(meow, merged, meowGame(100, 10, { toolStock: { hint: 7, day: '2026-10-25' }, meowdokuProgress: { level: 5 } }));
    assert.equal(restored.custom.toolStock.hint, 7);
    assert.equal(restored.custom.meowdokuProgress.level, 5, 'Restore preserves local boards and daily stock');

    const remote = backend(); remote.saved = { m: { [meow.code]: b }, a: EMPTY };
    const local = base(); local.games.meowdoku = meowGame(100, 10, { toolStock: { hint: 7 } });
    await use(local, async ({ f, remote }) => {
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 100);
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuHard.cleared, 30);
        assert.equal(f.storage.getGameData('meowdoku').custom.toolStock.hint, 7);
        assert.equal(f.storage.snapshot.cloudSave.unsavedClears, 0, 'Imported progress never triggers five clears');
    }, { remote });

    let safeToRestore = true;
    await use(initial, async ({ f, c, remote, setClock }) => {
        remote.saved = { m: { [meow.code]: encodeModule([100, 30]) }, a: EMPTY };
        safeToRestore = false;
        f.storage.writeGameData('meowdoku', meowGame(25)); await c.pump();
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuHard.cleared, 0,
            'A save response arriving during gameplay waits for the lobby');
        safeToRestore = true;
        const restore = f.storage.restoreCloudProgress.bind(f.storage); let failed = false;
        f.storage.restoreCloudProgress = (...args) => {
            if (!failed) { failed = true; throw new Error('Temporary local restore failure'); }
            return restore(...args);
        };
        await c.pump();
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuHard.cleared, 0);
        setClock(15000); await c.pump();
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuHard.cleared, 30,
            'A temporary restore error retains the delayed response and retries safely');
        assert.equal(f.storage.snapshot.cloudSave.unsavedClears, 0);
    }, { canRestore: () => safeToRestore });

    const cold = new ServerTimeService(); cold.acceptColdStart(envelope({}, stamp));
    cold.acceptColdStart(envelope({}, stamp + 86400000));
    assert.equal(cold.day, '2026-10-25', 'Continuous run never advances reward date');
    assert.equal(canReceiveDailyReward('2026-10-25', cold.day), false);
    assert.equal(canReceiveDailyReward('', undefined), false);
    assert.equal(canReceiveDailyReward('2099-01-01', cold.day), false);
    const tomorrow = new ServerTimeService(); tomorrow.acceptColdStart(envelope({}, stamp + 86400000));
    assert.equal(canReceiveDailyReward('2026-10-25', tomorrow.day), true);
    assert.throws(() => new ServerTimeService().acceptColdStart({ serverTime: stamp, serverDay: '2099-01-01' }));

    const { grantFillDailyHints, readFillSave } = load('assets/games/multi-color-fill/scripts/MultiColorFillSave.ts');
    const { grantRingDailyHints } = load('assets/games/rotate-rings/scripts/RotateRingsSave.ts');
    const fillGift = { hintDay: '2026-10-24', hints: 0 }, ringGift = { hintDay: '2026-10-24', props: { hint: 0 } };
    for (const [save, grant, stock] of [[fillGift, grantFillDailyHints, () => fillGift.hints],
        [ringGift, grantRingDailyHints, () => ringGift.props.hint]]) {
        assert.equal(grant(save), 0, 'No trusted cold-start date means no daily gift');
        assert.equal(stock(), 0);
        assert.equal(grant(save, cold.day), 3);
        assert.equal(grant(save, cold.day), 0, 'Warm resumes reuse the same date');
        assert.equal(grant(save, '2026-10-23'), 0, 'Date rollback never grants again');
        assert.equal(grant(save, tomorrow.day), 3);
        assert.equal(stock(), 6);
    }
    const fill = catalog.games.find(g => g.gameId === 'multi-color-fill');
    const fillRestored = projection.restoreGame(fill, encodeModule([1750, 450, 2]));
    assert.equal(fillRestored.custom.fill.modes.normal.cleared, 1750, 'Cloud progress includes the current 2000-level normal bank');
    assert.equal(fillRestored.custom.fill.catalogVersion, 2, 'Restored progress must not be mistaken for the legacy level order');
    assert.equal(readFillSave(fillRestored.custom.fill).modes.normal.cleared, 1750,
        'The real game parser reads restored progress without a second level-order migration');
    console.log('PASS: thresholds, trusted login days, gated cold reads, no cold writes, five improvements, settled records, timing/retry/relaunch idempotency, best-field/star algebra, local-state preservation and cold-only daily dates.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
