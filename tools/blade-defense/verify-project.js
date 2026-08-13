const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const gameRoot = path.join(root, 'assets/games/blade-defense');
const manifestPath = path.join(root, 'assets/resources/configs/games.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest.games.find((game) => game.id === 'blade-defense');

assert(entry, 'blade-defense manifest entry is missing.');
assert.strictEqual(entry.bundle, 'game-blade-defense');
assert.strictEqual(entry.scene, 'scenes/BladeDefense');
assert.strictEqual(entry.entryComponent, 'BladeDefenseGame');
assert.strictEqual(entry.visibility, 'public');
assert.strictEqual(entry.enabled, true);
assert.strictEqual(
    entry.cover,
    'visual/covers/blade-defense/bd2-spring-guard-cover-v1/texture',
);
assert.strictEqual(entry.icon, entry.cover, 'Lobby icon must resolve to a real lobby asset.');

const bundleMeta = JSON.parse(fs.readFileSync(`${gameRoot}.meta`, 'utf8'));
assert.strictEqual(bundleMeta.userData.bundleName, 'game-blade-defense');
assert.strictEqual(bundleMeta.userData.isBundle, true);
assert.strictEqual(bundleMeta.userData.isSubpackage, true);

const scriptMeta = JSON.parse(fs.readFileSync(
    path.join(gameRoot, 'scripts/BladeDefenseGame.ts.meta'),
    'utf8',
));
const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const sourceUuid = scriptMeta.uuid.replace(/-/g, '');
let compressed = sourceUuid.slice(0, 5);
for (let index = 5; index < 32; index += 3) {
    compressed += key[
        parseInt(sourceUuid[index], 16) * 4
        + (parseInt(sourceUuid[index + 1], 16) >> 2)
    ];
    compressed += key[
        (parseInt(sourceUuid[index + 1], 16) & 3) * 16
        + parseInt(sourceUuid[index + 2], 16)
    ];
}

const scenePath = path.join(gameRoot, 'scenes/BladeDefense.scene');
const scene = fs.readFileSync(scenePath, 'utf8');
assert(
    scene.includes(`"__type__": "${compressed}"`),
    'BladeDefense scene does not reference BladeDefenseGame meta UUID.',
);

const requiredScripts = [
    'BladeDefenseCatalog.ts',
    'BladeDefenseModel.ts',
    'BladeDefenseGame.ts',
];
requiredScripts.forEach((name) => {
    const asset = path.join(gameRoot, 'scripts', name);
    assert(fs.existsSync(asset), `Missing script ${name}.`);
    assert(fs.existsSync(`${asset}.meta`), `Missing script meta ${name}.meta.`);
});

const audioRoot = path.join(gameRoot, 'visual/audio');
const audioFiles = fs.readdirSync(audioRoot)
    .filter((name) => name.endsWith('.mp3'))
    .sort();
assert.strictEqual(audioFiles.length, 9, 'Blade defense must ship exactly nine MP3 files.');
audioFiles.forEach((name) => {
    const asset = path.join(audioRoot, name);
    assert(fs.statSync(asset).size > 1024, `${name} is unexpectedly small.`);
    assert(fs.existsSync(`${asset}.meta`), `Missing meta for ${name}.`);
});
assert(audioFiles.includes('bd1-moon-guard-loop-v1.mp3'));

const coverPath = path.join(
    root,
    'assets/lobby/visual/covers/blade-defense/bd2-spring-guard-cover-v1.png',
);
assert(fs.existsSync(coverPath), 'Blade defense lobby cover is missing.');
assert(fs.existsSync(`${coverPath}.meta`), 'Blade defense lobby cover meta is missing.');
const png = fs.readFileSync(coverPath);
assert.strictEqual(png.toString('ascii', 1, 4), 'PNG');
assert.strictEqual(png.readUInt32BE(16), 920);
assert.strictEqual(png.readUInt32BE(20), 690);

const readPngSize = (asset) => {
    const data = fs.readFileSync(asset);
    assert.strictEqual(data.toString('ascii', 1, 4), 'PNG', `${asset} must be a PNG.`);
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
const visualPngs = [
    ['visual/backgrounds/bd2-spring-camp-bg-v1.png', 750, 1334],
    ['visual/boards/bd2-spring-ring-board-v1.png', 1024, 1024],
    ['visual/weapons/carrot-blade-v1.png', 256, 256],
    ['visual/weapons/fish-boomerang-v1.png', 256, 256],
    ...['puppy-l1', 'kitten-l2'].flatMap((pet) => [1, 2, 3, 4].map((frame) => [
        `visual/pets/${pet}/${String(frame).padStart(2, '0')}.png`, 256, 256,
    ])),
    ...['turnip-imp', 'acorn-boar'].flatMap((enemy) => [1, 2, 3, 4].map((frame) => [
        `visual/enemies/${enemy}/${String(frame).padStart(2, '0')}.png`, 256, 256,
    ])),
];
visualPngs.forEach(([relative, width, height]) => {
    const asset = path.join(gameRoot, relative);
    assert(fs.existsSync(asset), `Missing BD2 visual ${relative}.`);
    assert(fs.existsSync(`${asset}.meta`), `Missing BD2 visual meta ${relative}.meta.`);
    assert.deepStrictEqual(readPngSize(asset), [width, height], `${relative} has wrong dimensions.`);
});

const gameCode = fs.readFileSync(
    path.join(gameRoot, 'scripts/BladeDefenseGame.ts'),
    'utf8',
);
[
    'requestPause()',
    'requestExit(',
    'showPauseMenu',
    'showResultView',
    'movePet(',
    'mergePets(',
    'claimPendingPets()',
    'Input.EventType.TOUCH_MOVE',
    'Input.EventType.MOUSE_MOVE',
    'bd2-spring-camp-bg-v1',
    'String(Math.ceil(entity.hp))',
    "resolveBonusOffer(",
    'MAX_WAVES = 12',
].forEach((needle) => {
    assert(gameCode.includes(needle), `Missing gameplay/lifecycle feature: ${needle}`);
});

const catalogCode = fs.readFileSync(
    path.join(gameRoot, 'scripts/BladeDefenseCatalog.ts'),
    'utf8',
);
assert(catalogCode.includes('petSlotCount: 12'));
assert(catalogCode.includes('damage: 1'));
assert(catalogCode.includes('BLADE_DEFENSE_MAX_PET_LEVEL = 8'));
assert(catalogCode.includes('chestDropChancePerEnemy: 0.18'));
assert(catalogCode.includes('guaranteedEarlyChestDrops: 2'));

const appCode = fs.readFileSync(path.join(root, 'assets/app/App.ts'), 'utf8');
assert(appCode.includes('GAME_RUNTIME_SERVICE).openPauseMenu()'));
assert(appCode.includes('audio.onHide()'));
const audioServiceCode = fs.readFileSync(
    path.join(root, 'assets/services/audio/AudioService.ts'),
    'utf8',
);
assert(audioServiceCode.includes('this.pausedByBackground = true;'));
assert(audioServiceCode.includes('this.pausedByGame = true;'));

const buildRoot = process.argv[2];
if (buildRoot) {
    const outputRoot = path.resolve(buildRoot);
    const bundleRoot = path.join(outputRoot, 'assets/game-blade-defense');
    assert(fs.existsSync(path.join(outputRoot, 'index.html')), 'Build index.html is missing.');
    assert(fs.existsSync(path.join(bundleRoot, 'config.json')), 'Built bundle config is missing.');
    assert(fs.existsSync(path.join(bundleRoot, 'index.js')), 'Built bundle script is missing.');
    const builtScript = fs.readFileSync(path.join(bundleRoot, 'index.js'), 'utf8');
    assert(builtScript.includes('BladeDefenseGame'));
    assert(builtScript.includes(compressed));
}

console.log([
    'blade_defense_project=passed',
    'manifest=public',
    'slots=12',
    'levels=8',
    `audio=${audioFiles.length}`,
    'cover=920x690',
    `scene_component=${compressed}`,
    `build=${buildRoot ? 'verified' : 'skipped'}`,
].join(', '));
