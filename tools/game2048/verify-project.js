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
assert.strictEqual(audioFiles.length, 11);
audioFiles.forEach((name) => {
    assert(fs.existsSync(path.join(gameRoot, 'visual/audio', `${name}.meta`)), `Missing meta for ${name}.`);
});
assert(fs.existsSync(path.join(root, 'assets/lobby/visual/covers/game2048/t48-neon-cover-v1.png')));
assert(fs.existsSync(path.join(gameRoot, 'visual/backgrounds/t48-neon-v2.jpg')));
assert(fs.existsSync(path.join(gameRoot, 'visual/backgrounds/t48-neon-v2.jpg.meta')));

const sourceCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Game.ts'), 'utf8');
['requestPause()', 'requestExit(', 'requestLobby(', 'showPauseMenu', 'showResultView'].forEach((needle) => {
    assert(sourceCode.includes(needle), `Missing 2048 lifecycle feature: ${needle}`);
});
assert(!/猫咪|paper|纸片|cat-room|game-watermelon/i.test(sourceCode), '2048 visual language leaked from cat game.');
assert(!sourceCode.includes('DIGITAL MERGE CIRCUIT'), 'Removed 2048 subtitle returned.');
assert(!sourceCode.includes('NO ADS · PURE FLOW'), 'Removed 2048 footer returned.');
assert(!sourceCode.includes('滑动屏幕或使用方向键'), 'Removed 2048 control hint returned.');
assert(sourceCode.includes('animateBoardMove(result)'), 'Per-tile move animation is missing.');
assert(sourceCode.includes("bundle.load('visual/backgrounds/t48-neon-v2/texture'"), 'Neon background is not loaded.');
assert(sourceCode.includes('const TILE_SLIDE_DURATION = 0.1;'), 'Tile slide speed regressed.');
assert(sourceCode.includes('Math.min(596, width - 132)'), 'Board side padding regressed.');
assert(sourceCode.includes('4: [137, 112, 255]'), 'Low-level tile color separation regressed.');
assert(!sourceCode.includes('UndoButton'), 'Undo UI returned.');
assert(!sourceCode.includes('handleUndo'), 'Undo input returned.');
assert(sourceCode.includes('createHighMergeEffect('), 'High-level merge effect is missing.');
assert(sourceCode.includes('playHighMergeFeedback(result)'), 'High-level merge audio is missing.');
assert(sourceCode.includes('createPersistentTileGlow('), '512+ persistent neon glow is missing.');
assert(sourceCode.includes('emptyCount <= 2'), 'Critical-space threshold is missing.');
assert(sourceCode.includes('t48-danger-loop-v1'), 'Critical-space music route is missing.');
assert(sourceCode.includes('关闭并查看棋盘'), 'Result overlay cannot be dismissed to inspect the final board.');
assert(sourceCode.includes("setPauseButtonLabel('结算')"), 'Dismissed result cannot be reopened.');

const modelCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Model.ts'), 'utf8');
assert(!modelCode.includes('undoSnapshot'), 'Undo snapshot returned.');
assert(!modelCode.includes('undo()'), 'Undo model API returned.');

const catCatalog = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/FruitCatalog.ts'), 'utf8');
assert(catCatalog.includes("['blue-scottish-fold', '蓝灰折耳'"));
assert(!catCatalog.includes('斯芬克斯猫'));
const catGame = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/WatermelonGame.ts'), 'utf8');
assert(catGame.includes('const buttonHeight = 66;'));
assert(catGame.includes('Math.min(400, panelWidth - 130)'));

console.log(`game2048_project=passed, manifest=public, audio=${audioFiles.length}, cover=present, background=present, tile_motion=present, scene_component=${compressed}`);
