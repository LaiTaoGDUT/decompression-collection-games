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
const sceneObjects = JSON.parse(scene);
const canvas = sceneObjects.find((item) => item.__type__ === 'cc.Canvas');
assert(canvas, 'Game2048 scene Canvas is missing.');
assert(canvas._cameraComponent && Number.isInteger(canvas._cameraComponent.__id__),
    'Game2048 Canvas must bind a serialized Camera component.');
const camera = sceneObjects[canvas._cameraComponent.__id__];
assert(camera && camera.__type__ === 'cc.Camera',
    'Game2048 Canvas camera reference must resolve to cc.Camera.');
assert.strictEqual(camera._projection, 0, 'Game2048 UI Camera must remain orthographic.');
assert.strictEqual(camera._visibility, sceneObjects[2]._layer,
    'Game2048 UI Camera visibility must match Canvas layer.');

const audioFiles = fs.readdirSync(path.join(gameRoot, 'visual/audio')).filter((name) => name.endsWith('.mp3'));
assert.strictEqual(audioFiles.length, 11);
audioFiles.forEach((name) => {
    assert(fs.existsSync(path.join(gameRoot, 'visual/audio', `${name}.meta`)), `Missing meta for ${name}.`);
});
assert(fs.existsSync(path.join(root, 'assets/lobby/visual/covers/game2048/t48-neon-cover-v1.png')));
assert(fs.existsSync(path.join(gameRoot, 'visual/backgrounds/t48-neon-v2.jpg')));
assert(fs.existsSync(path.join(gameRoot, 'visual/backgrounds/t48-neon-v2.jpg.meta')));

const sourceCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Game.ts'), 'utf8');
const layoutCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Layout.ts'), 'utf8');
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
assert(!sourceCode.includes('Math.max(600, Math.min(750'), '2048 root width must follow the real viewport.');
assert(!sourceCode.includes('Math.max(1100, Math.min(1624'), '2048 root height must follow the real viewport.');
assert(sourceCode.includes("view.on('canvas-resize'"), '2048 resize listener is missing.');
assert(sourceCode.includes("view.off('canvas-resize'"), '2048 resize listener cleanup is missing.');
assert(sourceCode.includes('calculateGame2048LayoutFromPlatform('), '2048 safe-area layout is not applied.');
assert(sourceCode.includes('this.boardNode.setScale(metrics.boardScale'), 'Short screens must scale the board uniformly.');
assert(sourceCode.includes('this.boardGap(boardSize)'), 'Board gap must follow the scaled board geometry.');
assert(sourceCode.includes('calculateGame2048BackgroundCover('), '2048 background cover helper is not used.');
assert(fs.existsSync(path.join(gameRoot, 'scripts/Game2048Layout.ts.meta')), 'Missing meta for Game2048Layout.ts.');
assert(layoutCode.includes('calculateGame2048BackgroundCover'), 'Background cover helper is missing.');
assert(layoutCode.includes('topRightReservedBottom'), 'Pause button capsule avoidance is missing.');
assert(layoutCode.includes('safeBottom'), 'Bottom safe-area input is missing.');
assert(layoutCode.includes('Math.min(fitScale, boardScaleForOuter, boardScaleForHint)'),
    'Board height fitting must be tied to the bottom safe area.');
assert(sourceCode.includes('4: [137, 112, 255]'), 'Low-level tile color separation regressed.');
assert(!sourceCode.includes('UndoButton'), 'Undo UI returned.');
assert(!sourceCode.includes('handleUndo'), 'Undo input returned.');
assert(sourceCode.includes('createHighMergeEffect('), 'High-level merge effect is missing.');
assert(sourceCode.includes('playHighMergeFeedback(result)'), 'High-level merge audio is missing.');
assert(sourceCode.includes('createPersistentTileGlow('), '512+ persistent neon glow is missing.');
assert(sourceCode.includes('const HIGH_TIER_LEVELS'), 'High-tier progression levels are missing.');
assert(sourceCode.includes('const TILE_MATERIALS'), 'High-tier tile materials are missing.');
['1024: {', '2048: {', '4096: {'].forEach((needle) => {
    assert(sourceCode.includes(needle), `Missing explicit high-tier material: ${needle}`);
});
['紫电', '熔金', '冰蓝', 'drawHighTierTileMaterial(', 'createHighTierMergeCore(', 'EnergyCore-', 'MaterialScan-']
    .forEach((needle) => assert(sourceCode.includes(needle), `Missing high-tier material structure: ${needle}`));
assert(sourceCode.includes('4096: [127, 52, 224]'), '4096 base color is not explicit.');
assert(sourceCode.includes('dataVersion: GAME_2048_DATA_VERSION'), 'Game2048 data version is not persisted.');
assert(sourceCode.includes('const GAME_2048_DATA_VERSION = 3;'), 'Game2048 save version must be 3.');
assert(sourceCode.includes('migrateTargetAcknowledgement('), 'Legacy target acknowledgement migration is missing.');
assert(sourceCode.includes('this.model.acknowledgeTarget()'), 'Resumed 4096 target acknowledgement is missing.');
assert(sourceCode.includes('const resumedTarget ='), 'Resumed target detection is missing.');
assert(sourceCode.includes('const resumedDeadTarget ='), 'Resumed dead 4096 target handling is missing.');
assert(sourceCode.includes('this.model.highestTile < TARGET_TILE'), 'Full resumed 4096 boards must remain resumable.');
assert(sourceCode.includes('if (resumedTarget) this.showTargetOverlay();'),
    'Resumed 4096 boards must enter the existing target overlay flow.');
assert(sourceCode.includes('if (!this.model.hasAvailableMove)'),
    'The 4096 continue action must handle a dead board safely.');
assert(sourceCode.includes("this.finishRound('target-complete');"),
    'A dead 4096 board must finish through the target result path.');
assert(sourceCode.includes('calculateHighTierTileRect('), 'High-tier tile geometry helper is missing.');
assert(sourceCode.includes('const safeSize ='), 'High-tier tile geometry must clamp tile size.');
assert(sourceCode.includes('const requestedInset = Math.max(0, safeSize *'),
    'High-tier inset must scale with the actual tile size.');
assert(sourceCode.includes('const inset = Math.min(requestedInset, maxInset);'),
    'High-tier inset must be capped by the available tile area.');
assert(sourceCode.includes('const innerSize = Math.max(2,'), 'High-tier roundRect size must stay positive.');
assert(sourceCode.includes('const radius = Math.max(0.5,'), 'High-tier roundRect radius must be clamped.');
assert(sourceCode.includes('...this.preservedCustom'), 'Unknown Game2048 custom fields are not preserved.');
assert(sourceCode.includes('Unlocked4096Tile'), '4096 target badge is missing.');
assert(sourceCode.includes('ACHIEVEMENT  //  4096'), '4096 celebration kicker is missing.');
assert(sourceCode.includes('成功点亮 4096'), '4096 celebration subtitle is missing.');
assert(sourceCode.includes('Target4096Halo'), '4096 celebration halo is missing.');
assert(sourceCode.includes('Target4096CrystalCore'), '4096 celebration crystal core is missing.');
assert(sourceCode.includes('继续冲击更高纪录'), '4096 celebration continue action is missing.');
assert(sourceCode.includes('完成本局'), '4096 celebration finish action is missing.');
assert(sourceCode.includes('返回大厅'), '4096 celebration lobby action is missing.');
assert(sourceCode.includes('emptyCount <= 2'), 'Critical-space threshold is missing.');
assert(sourceCode.includes('t48-danger-loop-v1'), 'Critical-space music route is missing.');
assert(sourceCode.includes('关闭并查看棋盘'), 'Result overlay cannot be dismissed to inspect the final board.');
assert(sourceCode.includes("setPauseButtonLabel('结算')"), 'Dismissed result cannot be reopened.');

const modelCode = fs.readFileSync(path.join(gameRoot, 'scripts/Game2048Model.ts'), 'utf8');
assert(modelCode.includes('export const TARGET_TILE = 4096;'), 'Game2048 target must be 4096.');
assert(modelCode.includes('get targetAcknowledged()'), 'Target acknowledgement read access is missing.');
assert(modelCode.includes('get needsTargetCelebration()'), 'Target celebration state read access is missing.');
assert(modelCode.includes('acknowledgeTarget()'), 'Explicit target acknowledgement is missing.');
assert(modelCode.includes('const reachedTarget = this.needsTargetCelebration;'),
    'Move detection must not acknowledge the target implicitly.');
assert(!modelCode.includes('if (reachedTarget) this.targetAcknowledgedState = true;'),
    'Move must not race target acknowledgement with celebration display.');
assert(!modelCode.includes('undoSnapshot'), 'Undo snapshot returned.');
assert(!modelCode.includes('undo()'), 'Undo model API returned.');

const catCatalog = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/FruitCatalog.ts'), 'utf8');
assert(catCatalog.includes("['blue-scottish-fold', '蓝灰折耳'"));
assert(!catCatalog.includes('斯芬克斯猫'));
const catGame = fs.readFileSync(path.join(root, 'assets/games/watermelon/scripts/WatermelonGame.ts'), 'utf8');
assert(catGame.includes('const buttonHeight = 66;'));
assert(catGame.includes('Math.min(400, panelWidth - 130)'));

console.log(`game2048_project=passed, manifest=public, audio=${audioFiles.length}, cover=present, background=present, tile_motion=present, scene_component=${compressed}`);
