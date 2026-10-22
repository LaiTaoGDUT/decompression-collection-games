const assert = require('node:assert/strict');
const { load, plain } = require('../helpers/runtime.cjs');
const { StorageService } = load('assets/services/storage/StorageService.ts');
const key = 'storage-recovery-test';
const backupKey = `${key}.recovery`;
function seed() {
    return { schemaVersion: 3,
        settings: { musicEnabled: false, soundEnabled: true, vibrationEnabled: false },
        games: {
            meowdoku: { dataVersion: 7, playCount: 12, custom: { meowdokuCleared: 500, meowdokuProgress: { level: 501 } } },
            catch: { dataVersion: 1, playCount: 3, highScore: 999 },
        },
        achievements: { meowdoku: { achievementId: 'meowdoku-trophy-v3', progress: 500, unlockedAt: 100, celebratedAt: 101 } },
        cloudSave: { version: 1, device: '12345678'.repeat(4), seq: 7, enabled: true, restore: 'done' },
    };
}
function fixture(value = seed(), memory) {
    const original = typeof value === 'string' ? value : value === null ? null : JSON.stringify(value);
    const data = memory ?? new Map(original === null ? [] : [[key, original]]);
    const writes = [];
    let failedKey;
    const storage = new StorageService({ getItem: name => data.get(name) ?? null, setItem: (name, contents) => {
        if (name === failedKey) throw new Error('disk full');
        writes.push(name); data.set(name, contents);
    } }, key, { writeThrottleMs: 60000 });
    return { storage, data, original, writes, fail: name => { failedKey = name; } };
}
function run() {
    const healthy = fixture();
    healthy.storage.load();
    assert.equal(healthy.storage.needsCloudRestore, false);
    assert.deepEqual(plain(healthy.storage.getGameData('meowdoku')), seed().games.meowdoku);
    assert.deepEqual(healthy.writes, []);
    healthy.storage.dispose();

    const damaged = seed(); damaged.games.meowdoku.playCount = 'broken';
    const isolated = fixture(damaged);
    isolated.storage.load();
    assert.equal(isolated.storage.getGameData('meowdoku'), undefined);
    assert.deepEqual(plain(isolated.storage.getGameData('catch')), damaged.games.catch);
    assert.equal(isolated.storage.getAchievement('meowdoku').progress, 500);
    assert.equal(isolated.storage.needsCloudRestore, true);
    assert.equal(isolated.data.get(key), isolated.original, 'Loading never overwrites damaged source data');
    isolated.storage.writeGameData('catch', { dataVersion: 1, playCount: 4, highScore: 1000 });
    isolated.storage.flush();
    assert.equal(isolated.data.get(backupKey), isolated.original);
    assert.deepEqual(isolated.writes, [backupKey, key], 'Back up the original before replacing the active snapshot');
    assert.equal(JSON.parse(isolated.data.get(key)).cloudRestorePending, true);
    isolated.storage.dispose();
    const reloaded = fixture(null, isolated.data); reloaded.storage.load();
    assert.equal(reloaded.storage.needsCloudRestore, true);
    assert.equal(reloaded.storage.getGameData('catch').highScore, 1000);
    reloaded.storage.writeCloudState({ version: 1, restore: 'done' }); reloaded.storage.flush();
    assert.equal(reloaded.data.get(backupKey), isolated.original, 'Subsequent launches keep the original evidence');
    reloaded.storage.dispose();

    for (const field of ['settings', 'games', 'achievements']) {
        for (const bad of [undefined, null, [], 'broken']) {
            const data = seed(); data[field] = bad;
            const f = fixture(data); f.storage.load();
            assert.equal(f.storage.needsCloudRestore, true);
            if (field !== 'games') assert.equal(f.storage.getGameData('meowdoku').custom.meowdokuCleared, 500);
            if (field !== 'achievements') assert.equal(f.storage.getAchievement('meowdoku').progress, 500);
            if (field !== 'settings') assert.equal(f.storage.snapshot.settings.musicEnabled, false);
            assert.equal(f.data.get(key), f.original);
            f.storage.dispose();
        }
    }
    const settings = seed(); settings.settings.soundEnabled = 'broken';
    const s = fixture(settings); s.storage.load();
    assert.equal(s.storage.snapshot.settings.musicEnabled, false);
    assert.equal(s.storage.snapshot.settings.soundEnabled, true);
    assert.equal(s.storage.snapshot.settings.vibrationEnabled, false);
    s.storage.dispose();
    const award = seed(); award.achievements.catch = { progress: -1 };
    const a = fixture(award); a.storage.load();
    assert.equal(a.storage.getAchievement('meowdoku').progress, 500);
    assert.equal(a.storage.getGameData('catch').highScore, 999);
    assert.equal(a.storage.needsCloudRestore, true); a.storage.dispose();

    for (const original of ['{"schemaVersion":3,', 'null', '[]', '{"schemaVersion":2}']) {
        const f = fixture(original); f.storage.load();
        assert.equal(f.storage.needsCloudRestore, true);
        assert.deepEqual(f.writes, [], 'An unreadable root stays untouched on load');
        f.storage.writeGameData('catch', { dataVersion: 1, playCount: 1, highScore: 50 });
        f.storage.flush();
        assert.equal(f.data.get(backupKey), original);
        assert.equal(f.storage.getGameData('catch').highScore, 50);
        f.storage.dispose();
    }
    const blocked = fixture('{broken'); blocked.storage.load(); blocked.fail(backupKey);
    blocked.storage.writeGameData('catch', { dataVersion: 1, playCount: 1 });
    assert.throws(() => blocked.storage.flush(), /disk full/);
    assert.equal(blocked.data.get(key), blocked.original, 'Failed backup must block primary overwrite');
    assert.equal(blocked.storage.hasPendingWrites, true);
    blocked.fail(); blocked.storage.flush();
    assert.equal(blocked.data.get(backupKey), blocked.original);
    blocked.storage.dispose();

    const primaryFailure = fixture('{broken'); primaryFailure.storage.load(); primaryFailure.fail(key);
    primaryFailure.storage.writeGameData('catch', { dataVersion: 1, playCount: 1 });
    assert.throws(() => primaryFailure.storage.flush(), /disk full/);
    assert.equal(primaryFailure.data.get(backupKey), primaryFailure.original);
    assert.equal(primaryFailure.data.get(key), primaryFailure.original);
    primaryFailure.fail(); primaryFailure.storage.flush(); primaryFailure.storage.dispose();

    const fresh = fixture(null); fresh.storage.load();
    assert.equal(fresh.storage.needsCloudRestore, false);
    assert.equal(fresh.data.has(backupKey), false); fresh.storage.dispose();
    console.log('PASS: isolated corrupt records, independent sections/settings, original backup, persistent recovery intent, backup/write failure retries and fresh installs.');
}
module.exports = { fixture, seed, key, backupKey };
if (require.main === module) run();
