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
const sceneData = JSON.parse(scene);
const canvasComponent = sceneData.find((entry) => entry.__type__ === 'cc.Canvas');
assert(canvasComponent, 'Chess scene must contain a Canvas component.');
assert(canvasComponent._cameraComponent?.__id__ !== undefined, 'Chess Canvas must bind its UI Camera so layout and visible width use the same coordinate space.');
const boundCamera = sceneData[canvasComponent._cameraComponent.__id__];
assert.strictEqual(boundCamera?.__type__, 'cc.Camera', 'Chess Canvas camera binding must resolve to a Camera component.');

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
    'visual/vfx/vfx_combo_burst.png',
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
['contentX', 'hudWidth', 'hudHeight', 'reinforcementX', 'dockWidth', 'boardX']
    .forEach((metric) => assert(layoutCode.includes(`readonly ${metric}: number`), `Missing responsive layout metric ${metric}.`));
assert(layoutCode.includes('topRightReservedArea?.bottom'), 'The full HUD must be positioned below the WeChat menu capsule.');
assert(layoutCode.includes('boardTop - boardNodeHeight / 2'), 'The board must stay top-aligned below reinforcement.');
assert(layoutCode.includes('const contentWidth = Math.min(750, availableWidth)'), 'All main content modules must be capped to the 750 design width.');
assert(layoutCode.includes('visible.width > 0 ? visible.width : rootSize.width'), 'The background viewport must retain the actual visible width.');
const sourceCode = fs.readFileSync(path.join(gameRoot, 'scripts/ChessEndlessGame.ts'), 'utf8');
const routedAudio = [...sourceCode.matchAll(/'visual\/audio\/([^']+)'/g)].map((match) => `${match[1]}.mp3`);
assert.strictEqual(new Set(routedAudio).size, audioFiles.length, 'Every runtime MP3 must have one AUDIO_PATHS route.');
audioFiles.forEach((name) => assert(routedAudio.includes(name), `Unrouted runtime audio ${name}.`));
[
    'requestPause()', 'requestExit(', 'showPauseMenu', 'showResultView',
    'showCrossSlash(', 'showComboVfx(', 'showGeneralArrival(', 'handleRevive(', 'showRewardOverlay(',
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
assert(sourceCode.includes("'TopHud'"), 'The title, score and menu controls must share one full-width HUD container.');
assert(sourceCode.includes('new Color(22, 66, 52, 190)'), 'Available item cards must use the translucent ink-green background.');
assert(sourceCode.includes('new Color(18, 50, 42, 115)'), 'Unavailable item cards must keep a translucent ink-green background.');
assert(!sourceCode.includes('new Color(12, 38, 30, 178)'), 'The full HUD must not have a green fill.');
assert(!sourceCode.includes('new Color(10, 34, 27, 168)'), 'The full item dock must not have a green fill.');
assert(sourceCode.includes('overlay: new Color(0, 0, 0, 77)'), 'Modal overlays must use a 30% translucent black full-screen mask.');
assert(sourceCode.includes('width: metrics.width') && sourceCode.includes('height: metrics.height'), 'Modal overlays must use the complete calculated viewport.');
assert(sourceCode.includes('headerBrandBackground.fillColor = new Color(56, 56, 56, 77)'), 'The title and best-score block must use the 0.3-alpha gray background.');
assert(sourceCode.includes('headerBrandBackground.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 220)'), 'The title and best-score block must use a clearly visible gold outline.');
assert(sourceCode.includes('headerBrandBackground.lineWidth = Math.max(1.5, 2 * headerBrandScale)'), 'The title and best-score block gold outline must remain visible after responsive scaling.');
assert(!sourceCode.includes("'Backplate', 0, 0, headerBrandWidth"), 'The HUD must not render the green ribbon backplate.');
assert(!sourceCode.includes("'SlotArtwork'"), 'Item cards must not render an extra opaque green slot background.');
assert(sourceCode.includes('resolveSafeContentRect()'), 'Modal content must be constrained to the safe area.');
assert(sourceCode.includes("this.createNode(this.effectLayer ?? this.node, 'CaptureBurst'") && sourceCode.includes("this.createNode(this.effectLayer ?? this.node, 'CaptureChip'"), 'Capture artwork must render above chess pieces.');
assert(sourceCode.includes("this.playSound(result.captured ? 'playerCapture' : 'playerMove');"), 'Normal captures must reuse one stable capture sound without combo pitch progression.');
assert(sourceCode.includes('const VFX_TEXT_OUTLINE = new Color(64, 64, 64, 230)'), 'Gold VFX titles must use the shared neutral-gray outline.');
assert((sourceCode.match(/outline\.color = VFX_TEXT_OUTLINE/g) ?? []).length === 2, 'Center and combo VFX titles must both use the gray outline.');
assert(sourceCode.includes("showCenterVfx('generalArrivalVfx', '将 军 来 袭', COLORS.goldLight, 0.95, 620, 320, -26)"), 'The general-arrival title must sit lower at the artwork visual center.');
assert(sourceCode.includes('const helpSize = 31 * visualScale'), 'Item-list help icons must use the enlarged responsive size.');
assert(sourceCode.includes("cardWidth * 0.31, cardHeight * 0.34, 32, 32"), 'Reward-item help icons must match the enlarged rule-icon treatment.');
assert(sourceCode.includes('(general ? 1.18 : 1.13)'), 'Board pieces must use the slightly enlarged responsive diameter.');
const chessMusicVolumeMatch = sourceCode.match(/const CHESS_MUSIC_VOLUME = ([0-9.]+);/);
assert(chessMusicVolumeMatch, 'Chess must define a dedicated background-music volume.');
const chessMusicVolume = Number(chessMusicVolumeMatch[1]);
assert(chessMusicVolume > 0 && chessMusicVolume < 1 && sourceCode.includes('playMusic(clip, CHESS_MUSIC_VOLUME)'), 'Chess background music must use its dedicated attenuated volume without changing effects.');
assert(!sourceCode.includes("this.setHint('复活成功，轮到你走棋')"), 'Reviving must not show the obsolete success hint.');
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
    'comboMultiplier(', 'maxCombo', 'this.state.combo += 1',
].forEach((needle) => assert(modelCode.includes(needle), `Missing model feature: ${needle}`));
assert(modelCode.includes("rook: '車'"), 'Rook display must use 車 rather than 车.');
assert(modelCode.includes('index + 2'), 'Every normal reinforcement wave must contain at least two pieces.');

console.log(`chess_endless_project=passed, manifest=public, audio=${audioFiles.length}, images=${requiredImages.length}, scene_component=${compressed}`);
