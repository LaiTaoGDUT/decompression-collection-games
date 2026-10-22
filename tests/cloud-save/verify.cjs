const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, root, plain } = require('../helpers/runtime.cjs');
const { fixture, seed, key, backupKey } = require('../storage/recovery.cjs');
const { CloudSaveService } = load('assets/services/cloud/CloudSaveService.ts');
const { projectGame } = load('assets/services/cloud/CloudSaveProjection.ts');
const { encodeAchievements, timestampToDay } = load('assets/services/cloud/CloudSaveCodec.ts');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/cloud-save.json'), 'utf8'));
const meow = catalog.games.find(g => g.gameId === 'meowdoku');
const catchGame = catalog.games.find(g => g.gameId === 'catch');
const now = new Date(2026, 9, 22, 12).getTime();
const emptyAwards = encodeAchievements({});
function damaged() {
    const data = seed(); data.games.meowdoku.playCount = 'broken';
    return data;
}
function response(level = 500, score = 100) {
    return { v: 1, ok: true, found: true, m: {
        [meow.code]: projectGame(meow, { dataVersion: 7, playCount: 0, custom: { meowdokuCleared: level } }),
        [catchGame.code]: projectGame(catchGame, { dataVersion: 1, playCount: 0, highScore: score }),
    }, a: encodeAchievements({ [meow.achievement.code]: timestampToDay(now) }) };
}
function createCloud(f, call, overrides = {}) {
    return new CloudSaveService({ storage: f.storage, catalog, call, activeGame: () => undefined,
        canRestore: () => true, now: () => now, autoTick: false, ...overrides });
}
async function withFixture(value, test) {
    const f = fixture(value), clouds = [];
    f.storage.load();
    const cloud = (call, overrides) => {
        const service = createCloud(f, call, overrides); clouds.push(service); return service;
    };
    try { await test(f, cloud); }
    finally { clouds.forEach(c => c.dispose()); f.storage.dispose(); }
}
async function main() {
    await withFixture(damaged(), async (f, make) => {
        const requests = [];
        const c = make(async request => {
            requests.push(plain(request));
            return request.op === 'load' ? response() : { v: 1, ok: true, seq: request.seq };
        });
        await c.initialize();
        assert.equal(requests[0].op, 'load', 'Damage overrides valid restore:done metadata and surviving local records');
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 500);
        assert.equal(f.storage.getGameData('catch').highScore, 999, 'Older cloud modules cannot lower valid local progress');
        assert.equal(f.storage.getAchievement('meowdoku').unlockedAt, 100);
        assert.equal(f.storage.needsCloudRestore, false);
        assert.equal(f.data.get(backupKey), f.original);
        assert.equal(JSON.parse(f.data.get(key)).cloudRestorePending, undefined);
    });

    await withFixture('{broken', async (f, make) => {
        const c = make(async request => request.op === 'load' ? response(501) : { v: 1, ok: true, seq: request.seq });
        await c.initialize();
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 501);
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuUnlocked, 502);
        assert.equal(f.storage.getAchievement('meowdoku').progress, 500);
        assert.equal(f.storage.needsCloudRestore, false);
        assert.equal(f.data.get(backupKey), '{broken');
    });

    // Network failure must neither upload the damaged replacement nor forget recovery across launches.
    let savedMemory, original;
    await withFixture(damaged(), async (f, make) => {
        const requests = [];
        const c = make(async request => { requests.push(request.op); throw new Error('offline'); });
        await c.initialize();
        assert.deepEqual(requests, ['load']);
        assert.equal(c.status.restorePending, true);
        assert.equal(f.storage.needsCloudRestore, true);
        f.storage.flush(); savedMemory = f.data; original = f.original;
        assert.equal(f.data.get(backupKey), original);
        assert.equal(JSON.parse(f.data.get(key)).cloudRestorePending, true);
    });
    const restarted = fixture(null, savedMemory); restarted.storage.load();
    const retryRequests = [];
    const retry = createCloud(restarted, async request => {
        retryRequests.push(request.op);
        return request.op === 'load' ? response() : { v: 1, ok: true, seq: request.seq };
    });
    try {
        await retry.initialize();
        assert.equal(retryRequests[0], 'load');
        assert.equal(restarted.storage.needsCloudRestore, false);
        assert.equal(restarted.data.get(backupKey), original);
    } finally { retry.dispose(); restarted.storage.dispose(); }

    await withFixture(damaged(), async (f, make) => {
        let online = false, clock = now;
        const c = make(async request => {
            if (!online) throw new Error('offline');
            return request.op === 'load' ? response() : { v: 1, ok: true, seq: request.seq };
        }, { now: () => clock });
        await c.initialize(); online = true; clock += 16000;
        await c.pump();
        assert.equal(c.status.restorePending, false);
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 500);
    });

    await withFixture(damaged(), async (f, make) => {
        const c = make(async request => request.op === 'load'
            ? { v: 1, ok: true, found: false } : { v: 1, ok: true, seq: request.seq });
        await c.initialize();
        assert.equal(c.status.restorePending, false);
        assert.equal(f.storage.needsCloudRestore, false);
        assert.equal(f.storage.getGameData('catch').highScore, 999);
        assert.equal(f.storage.getAchievement('meowdoku').progress, 500);
        assert.equal(f.data.get(backupKey), f.original, 'No cloud backup does not delete the original local backup');
    });

    await withFixture(damaged(), async (f, make) => {
        const requests = []; let corrected = false, clock = now;
        const c = make(async request => {
            requests.push(request.op);
            if (corrected) return request.op === 'load' ? response() : { v: 1, ok: true, seq: request.seq };
            return { v: 1, ok: true, found: true, m: { [meow.code]: 'bad' }, a: emptyAwards };
        }, { now: () => clock });
        await c.initialize();
        assert.deepEqual(requests, ['load']);
        assert.equal(c.status.restorePending, true);
        assert.equal(f.storage.needsCloudRestore, true);
        assert.equal(f.storage.getGameData('catch').highScore, 999);
        corrected = true; clock += 16000; await c.pump();
        assert.deepEqual(requests.slice(0, 2), ['load', 'load'], 'Invalid cloud responses must be fetched again');
        assert.equal(f.storage.needsCloudRestore, false);
    });

    await withFixture(damaged(), async (f, make) => {
        let allowed = false, loads = 0;
        const c = make(async request => {
            if (request.op === 'load') { loads++; return response(); }
            return { v: 1, ok: true, seq: request.seq };
        }, { canRestore: () => allowed });
        await c.initialize(); assert.equal(loads, 0);
        allowed = true; await c.pump();
        assert.equal(loads, 1);
        assert.equal(f.storage.needsCloudRestore, false);
    });

    await withFixture(damaged(), async (f, make) => {
        let allowed = true, release, loads = 0;
        const c = make(request => {
            if (request.op !== 'load') return Promise.resolve({ v: 1, ok: true, seq: request.seq });
            loads++; return new Promise(resolve => { release = resolve; });
        }, { canRestore: () => allowed });
        const initializing = c.initialize();
        assert.equal(typeof release, 'function');
        allowed = false; release(response(510)); await initializing;
        assert.equal(f.storage.getGameData('meowdoku').dataVersion, 1, 'Late responses cannot replace a playing board');
        assert.equal(f.storage.needsCloudRestore, true);
        // Offline play while recovery is pending must beat the older downloaded module.
        f.storage.writeGameData('meowdoku', { dataVersion: 7, playCount: 1, custom: { meowdokuCleared: 520 } });
        allowed = true; await c.pump();
        assert.equal(loads, 1, 'Retain the downloaded response until the lobby can apply it');
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 520);
        assert.equal(f.storage.needsCloudRestore, false);
    });

    await withFixture(seed(), async (f, make) => {
        const requests = [];
        const c = make(async request => { requests.push(request.op); return { v: 1, ok: true, seq: request.seq }; });
        await c.initialize(); await c.pump();
        assert.equal(requests.includes('load'), false, 'Healthy existing saves keep the original startup policy');
        assert.equal(f.data.has(backupKey), false);
    });
    await withFixture(null, async (f, make) => {
        const requests = [];
        const c = make(async request => { requests.push(request.op); return response(); });
        await c.initialize();
        assert.equal(requests[0], 'load', 'Fresh installs can still restore cloud progress');
        assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 500);
    });
    require('../../project-scripts/cloud-save/prepare.cjs').prepare(true);
    console.log('PASS: corruption-triggered cloud restore, retained healthy progress/awards, whole-root recovery, offline retry/relaunch, missing/invalid cloud backups, lobby-only application and healthy/fresh startup policies.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
