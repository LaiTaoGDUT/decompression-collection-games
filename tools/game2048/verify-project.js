const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const gameRoot = path.join(root, 'assets/games/twenty48');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/games.json'), 'utf8'));
const entry = manifest.games.find((game) => game.id === 'game2048');
assert(entry, '2048 manifest entry is missing.');
assert.strictEqual(entry.bundle, 'game-2048');
assert.strictEqual(entry.scene, 'scenes/Game2048');
assert.strictEqual(entry.entryComponent, 'Game2048Game');
assert.strictEqual(entry.visibility, 'public');

const bundleMeta = JSON.parse(fs.readFileSync(`${gameRoot}.meta`, 'utf8'));
assert.strictEqual(bundleMeta.userData.bundleName, 'game-2048');
assert.strictEqual(bundleMeta.userData.isBundle, true);
const scriptMeta = JSON.parse(fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Game.ts.meta'), 'utf8'));
const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const source = scriptMeta.uuid.replace(/-/g, '');
let compressed = source.slice(0, 5);
for (let index = 5; index < 32; index += 3) {
    compressed += key[parseInt(source[index], 16) * 4 + (parseInt(source[index + 1], 16) >> 2)];
    compressed += key[(parseInt(source[index + 1], 16) & 3) * 16 + parseInt(source[index + 2], 16)];
}
const scene = fs.readFileSync(path.join(gameRoot, 'scenes/Game2048.scene'), 'utf8');
assert(scene.includes(`"__type__": "${compressed}"`), 'Scene does not reference Game2048Game meta UUID.');

const audioFiles = fs.readdirSync(path.join(gameRoot, 'visual/audio')).filter((name) => name.endsWith('.mp3'));
assert.strictEqual(audioFiles.length, 10);
audioFiles.forEach((name) => {
    assert(fs.existsSync(path.join(gameRoot, 'visual/audio', `${name}.meta`)), `Missing meta for ${name}.`);
});
assert(fs.existsSync(path.join(root, 'assets/lobby/visual/covers/game2048/t48-neon-cover-v1.png')));

const sourceCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Game.ts'), 'utf8');
['requestPause()', 'requestExit(', 'requestLobby(', 'showPauseMenu', 'showResultView', 'handleUndo'].forEach((needle) => {
    assert(sourceCode.includes(needle), `Missing 2048 lifecycle feature: ${needle}`);
});
assert(!/猫咪|paper|纸片|cat-room|game-watermelon/i.test(sourceCode), '2048 visual language leaked from cat game.');

const catCatalog = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/FruitCatalog.ts'), 'utf8');
assert(catCatalog.includes("['blue-scottish-fold', '蓝灰折耳'"));
assert(!catCatalog.includes('斯芬克斯猫'));
const catGame = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/WatermelonGame.ts'), 'utf8');
assert(catGame.includes('const buttonHeight = 66;'));
assert(catGame.includes('Math.min(400, panelWidth - 130)'));

console.log(`game2048_project=passed, manifest=public, audio=${audioFiles.length}, cover=present, scene_component=${compressed}`);
