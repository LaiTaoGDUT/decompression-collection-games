const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const gameRoot = path.join(root, 'assets/games/chess-endless');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/games.json'), 'utf8'));
const entry = manifest.games.find((game) => game.id === 'chess-endless');
assert(entry, 'Chess Endless manifest entry is missing.');
assert.strictEqual(entry.bundle, 'game-chess-endless');
assert.strictEqual(entry.scene, 'scenes/ChessEndless');
assert.strictEqual(entry.entryComponent, 'ChessEndlessGame');
assert.strictEqual(entry.visibility, 'public');
assert.strictEqual(entry.orientation, 'portrait');

const bundleMeta = JSON.parse(fs.readFileSync(`${gameRoot}.meta`, 'utf8'));
assert.strictEqual(bundleMeta.userData.bundleName, 'game-chess-endless');
assert.strictEqual(bundleMeta.userData.isBundle, true);

const scriptMeta = JSON.parse(fs.readFileSync(path.join(gameRoot, 'scripts/ChessEndlessGame.ts.meta'), 'utf8'));
const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const source = scriptMeta.uuid.replace(/-/g, '');
let compressed = source.slice(0, 5);
for (let index = 5; index < 32; index += 3) {
    compressed += key[parseInt(source[index], 16) * 4 + (parseInt(source[index + 1], 16) >> 2)];
    compressed += key[(parseInt(source[index + 1], 16) & 3) * 16 + parseInt(source[index + 2], 16)];
}
const scene = fs.readFileSync(path.join(gameRoot, 'scenes/ChessEndless.scene'), 'utf8');
assert(scene.includes(`"__type__": "${compressed}"`), 'Scene does not reference ChessEndlessGame meta UUID.');

const audioRoot = path.join(gameRoot, 'visual/audio');
const audioFiles = fs.readdirSync(audioRoot).filter((name) => (
    name.endsWith('.mp3') && name !== 'chess-reinforcement-ready-v1.mp3'
));
assert.strictEqual(audioFiles.length, 27, 'Expected 2 BGM loops and 25 active event sounds.');
audioFiles.forEach((name) => {
    const filePath = path.join(audioRoot, name);
    const bytes = fs.readFileSync(filePath);
    assert(bytes.length >= 1024, `Audio file is unexpectedly small: ${name}`);
    const isId3 = bytes.subarray(0, 3).toString('ascii') === 'ID3';
    const isMpegFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert(isId3 || isMpegFrame, `Audio file has no MP3 header/frame sync: ${name}`);
    assert(fs.existsSync(`${filePath}.meta`), `Missing audio meta: ${name}`);
});

const requiredImages = [
    'visual/backgrounds/img_home_background.png',
    'visual/boards/img_board_main.png',
    'visual/boards/img_board_backplate.png',
    'visual/boards/img_board_frame.png',
    'visual/pieces/piece_player_rook.png',
    'visual/pieces/piece_enemy_pawn.png',
    'visual/pieces/piece_enemy_advisor.png',
    'visual/pieces/piece_enemy_elephant.png',
    'visual/pieces/piece_enemy_horse.png',
    'visual/pieces/piece_enemy_cannon.png',
    'visual/pieces/piece_enemy_rook.png',
    'visual/pieces/piece_enemy_general.png',
    'visual/icons/icon_item_cross_slash.png',
    'visual/icons/icon_item_freeze.png',
    'visual/icons/icon_item_delay.png',
    'visual/icons/icon_item_banish.png',
    'visual/icons/icon_item_teleport.png',
    'visual/icons/icon_revive.png',
    'visual/ui/img_logo.png',
    'visual/ui/icon_rules.png',
    'visual/ui/icon_pause.png',
    'visual/ui/icon_help.png',
    'visual/ui/icon_close.png',
    'visual/ui/ui_hud_ribbon.png',
    'visual/ui/ui_item_card_bg.png',
    'visual/ui/ui_item_slot.png',
    'visual/ui/ui_reinforcement_panel_v1.png',
    'visual/ui/ui_modal_panel.png',
    'visual/ui/ui_reward_card.png',
    'visual/vfx/vfx_capture_burst.png',
    'visual/vfx/vfx_general_arrival.png',
    'visual/vfx/vfx_general_kill.png',
    'visual/vfx/vfx_general_guard.png',
    'visual/vfx/vfx_cross_slash.png',
    'visual/vfx/vfx_reward_chest_closed.png',
    'visual/vfx/vfx_reward_chest_open.png',
    'visual/vfx/vfx_spawn_shadow.png',
    'visual/vfx/vfx_danger_marker.png',
    'visual/vfx/vfx_item_cross.png',
    'visual/vfx/vfx_item_freeze.png',
    'visual/vfx/vfx_item_delay.png',
    'visual/vfx/vfx_item_banish.png',
    'visual/vfx/vfx_item_teleport.png',
    'visual/vfx/vfx_ink_particle.png',
    'visual/vfx/vfx_light_particle.png',
    'visual/vfx/vfx_talisman.png',
    'visual/vfx/vfx_wood_chip.png',
];
requiredImages.forEach((relative) => {
    assert(fs.existsSync(path.join(gameRoot, relative)), `Missing image ${relative}`);
    assert(fs.existsSync(path.join(gameRoot, `${relative}.meta`)), `Missing image meta ${relative}`);
});
assert(fs.existsSync(path.join(root, 'assets/lobby/visual/covers/chess-endless/chess-endless-cover-v1.png')));
assert(fs.existsSync(path.join(root, 'assets/lobby/visual/icons/chess-endless/chess-endless-icon-v1.png')));

assert(fs.existsSync(path.join(gameRoot, 'scripts/ChessEndlessLayout.ts')), 'Missing ChessEndlessLayout.ts');
assert(fs.existsSync(path.join(gameRoot, 'scripts/ChessEndlessResponsiveRules.ts')), 'Missing ChessEndlessResponsiveRules.ts');
const layoutCode = fs.readFileSync(path.join(gameRoot, 'scripts/ChessEndlessLayout.ts'), 'utf8');
assert(layoutCode.includes('calculateChessEndlessLayout('), 'ChessEndlessLayout must export calculateChessEndlessLayout.');
assert(layoutCode.includes('calculateTopRightControlPosition('), 'ChessEndlessLayout must route top-right controls through PlatformSafeLayout.');
const sourceCode = fs.readFileSync(path.join(gameRoot, 'scripts/ChessEndlessGame.ts'), 'utf8');
const routedAudio = [...sourceCode.matchAll(/'visual\/audio\/([^']+)'/g)].map((match) => `${match[1]}.mp3`);
assert.strictEqual(new Set(routedAudio).size, audioFiles.length, 'Every runtime MP3 must have one AUDIO_PATHS route.');
audioFiles.forEach((name) => assert(routedAudio.includes(name), `Unrouted runtime audio ${name}.`));
[
    'requestPause()', 'requestExit(', 'showPauseMenu', 'showResultView',
    'showCrossSlash(', 'showGeneralArrival(', 'handleRevive(', 'showRewardOverlay(',
    'showRewardChestSequence(', 'showCenterVfx(', 'showRulesPage(', 'showItemHelp(',
    'renderDangerPositions(', 'showPieceInfo(',
    'updatePressureMusic(', 'ChessEndlessLayout', 'readChessEndlessViewport(',
    'setPlatformLayout(',
].forEach((needle) => assert(sourceCode.includes(needle), `Missing runtime feature: ${needle}`));
assert(sourceCode.includes('backgroundWidth'), 'The full-screen background must use cover sizing from layout metrics.');
assert(sourceCode.includes('resolveFullscreenOverlaySize('), 'Modal overlays must size against the visible viewport.');
assert(
    sourceCode.includes('this.applySprite(piece, PIECE_TEXTURE_KEY[type]);'),
    'Reinforcement preview must render the baked piece PNG mapped for each type.',
);
assert(
    !sourceCode.includes("this.createLabel(preview"),
    'Reinforcement preview must not render piece glyphs as runtime text labels.',
);
assert(sourceCode.includes("'下一批增援'"), 'Normal reinforcement title is missing.');
assert(sourceCode.includes("'将军来袭'"), 'General alert title is missing.');
assert(sourceCode.includes("'reinforcementV1'"), 'The first-version compact reinforcement panel must be used.');
assert(sourceCode.includes("this.applySprite(this.reinforcementArtwork, 'reinforcementV1')"), 'General reinforcement must reuse the normal panel without a red alert frame.');
assert(!sourceCode.includes('reinforcementGeneralV1'), 'The general reinforcement panel must not swap in a separate red-framed artwork.');
assert(sourceCode.includes('reinforcementArtworkWidth = 232 * reinforcementScale'), 'Reinforcement artwork must scale with the fitted panel width.');
assert(sourceCode.includes('reinforcementContentCenterY = 14 * reinforcementScale'), 'Reinforcement copy must center on the measured panel parchment area.');
assert(sourceCode.includes('this.reinforcementArtwork,'), 'Reinforcement copy must share the panel artwork coordinate space.');
assert(sourceCode.includes('reinforcementLabelTitleY'), 'Reinforcement title position must be derived from the centered two-line block.');
assert(sourceCode.includes('reinforcementLabelStatusY'), 'Reinforcement countdown position must be derived from the centered two-line block.');
assert(sourceCode.includes('let gap = 10'), 'Reinforcement preview spacing must stay compact for small waves.');
assert(sourceCode.includes('reinforcementTitle.horizontalAlign = 2'), 'The reinforcement title must align tightly to the panel edge.');
assert(sourceCode.includes('LabelOutline'), 'Reinforcement text needs a contrast outline over the tabletop.');
assert(sourceCode.includes("'PreviewPieces'") && sourceCode.includes('reinforcementContentCenterY'), 'The preview row must share the panel content center with the copy block.');
assert(sourceCode.includes('pieceSize = 60'), 'Reinforcement preview pieces must render larger for small waves.');
assert(sourceCode.includes("this.reinforcementTitle.color = general ? COLORS.cinnabar : COLORS.goldLight"), 'Reinforcement title must stay readable over the dark tabletop.');
assert(sourceCode.includes("'查看最后残局'"), 'The final result must allow board inspection.');
assert(!sourceCode.includes("'点击己方車查看可走位置'"), 'The obsolete bottom-board text hint must be removed.');
['items', 'general', 'reward', 'guard', 'fullInventory', 'noRevive']
    .forEach((scenario) => assert(sourceCode.includes(`scenario === '${scenario}'`), `Missing preview QA scenario ${scenario}.`));

const modelCode = fs.readFileSync(path.join(gameRoot, 'scripts/ChessEndlessModel.ts'), 'utf8');
[
    'BOARD_COLUMNS = 9', 'BOARD_ROWS = 10', 'enemyCanCapturePlayer(',
    'findNormalPlacements(', 'findGeneralPlacements(', 'safePlayerMoves(',
    'pendingCrossSlash', 'reviveSnapshot', 'generalTargetN', 'getDangerPositions()',
    'immediateSpawned', 'createRewardChoices()', 'weights = pool.map(',
].forEach((needle) => assert(modelCode.includes(needle), `Missing model feature: ${needle}`));
assert(modelCode.includes("rook: '車'"), 'Rook display must use 車 rather than 车.');
assert(modelCode.includes('index + 2'), 'Every normal reinforcement wave must contain at least two pieces.');

console.log(`chess_endless_project=passed, manifest=public, audio=${audioFiles.length}, images=${requiredImages.length}, scene_component=${compressed}`);
