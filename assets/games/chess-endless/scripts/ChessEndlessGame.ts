import {
    _decorator,
    assetManager,
    AudioClip,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventTouch,
    Graphics,
    Label,
    LabelOutline,
    Mask,
    Node,
    Rect,
    ScrollView,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import { DEV } from 'cc/env';
import type { Platform } from '../../../platform/Platform';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { AudioService } from '../../../services/audio/AudioService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import { ChessEndlessLayout } from './ChessEndlessLayout';
import {
    chessEndlessModalContentRect,
    readChessEndlessViewport,
    resolveChessEndlessModalPanelSize,
} from './ChessEndlessResponsiveRules';
import {
    BOARD_COLUMNS,
    BOARD_ROWS,
    ChessEndlessModel,
    ITEM_DISPLAY,
    ITEM_DESCRIPTIONS,
    PIECE_DISPLAY,
    type BoardPosition,
    type ChessEndlessSnapshot,
    type EnemyPiece,
    type EnemyPieceType,
    type ItemType,
    type KillRecord,
    type PlayerMoveResult,
} from './ChessEndlessModel';

const { ccclass } = _decorator;

const GAME_ID = 'chess-endless';
const RESOURCE_BUNDLE = 'game-chess-endless-assets';
const CHESS_DATA_VERSION = 2;
const MOVE_DURATION = 0.15;
const CAPTURE_DURATION = 0.24;
const CHESS_MUSIC_VOLUME = 0.5;
const CROSS_DURATION = 0.62;
const SPAWN_STAGGER = 0.055;
const REINFORCEMENT_PIECE_GAP = 0;
const PIECE_DIAMETER_SCALE = 1.24;
const GENERAL_PIECE_DIAMETER_SCALE = 1.29;
const PIECE_SHADOW_X_SCALE = 0.06;
const PIECE_SHADOW_WIDTH_SCALE = 0.88;
const PIECE_SHADOW_HEIGHT_SCALE = 0.30;
const PIECE_SHADOW_Y_SCALE = -0.21;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type LifecycleState = 'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'disposed';

export interface ChessEndlessServices {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly ads?: AdService;
    readonly platform: Platform;
}

interface OverlayAction {
    readonly label: string;
    readonly tone: 'jade' | 'cinnabar' | 'paper';
    readonly action: () => void | Promise<void>;
    readonly enabled?: boolean;
    readonly adIcon?: boolean;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: Button[];
}

interface ResumableChessRound {
    readonly snapshot: ChessEndlessSnapshot;
    readonly recoverySnapshot?: ChessEndlessSnapshot;
}

const COLORS = Object.freeze({
    ink: new Color(24, 43, 41, 255),
    inkSoft: new Color(52, 76, 70, 255),
    inkTransparent: new Color(21, 43, 39, 210),
    parchment: new Color(244, 231, 198, 255),
    parchmentDim: new Color(222, 199, 153, 242),
    wood: new Color(167, 106, 59, 255),
    woodDark: new Color(91, 53, 31, 255),
    cinnabar: new Color(164, 55, 43, 255),
    gold: new Color(203, 159, 76, 255),
    goldLight: new Color(245, 220, 157, 255),
    jade: new Color(41, 92, 81, 255),
    white: new Color(255, 248, 226, 255),
    muted: new Color(116, 96, 66, 255),
    overlay: new Color(0, 0, 0, 77),
});
const VFX_TEXT_OUTLINE = new Color(64, 64, 64, 230);

const TEXTURE_PATHS: Readonly<Record<string, string>> = Object.freeze({
    background: 'visual/backgrounds/img_home_background/texture',
    board: 'visual/boards/img_board_main/texture',
    boardFrame: 'visual/boards/img_board_frame/texture',
    boardBackplate: 'visual/boards/img_board_backplate/texture',
    piecePlayer: 'visual/pieces/piece_player_rook/texture',
    piecePawn: 'visual/pieces/piece_enemy_pawn/texture',
    pieceAdvisor: 'visual/pieces/piece_enemy_advisor/texture',
    pieceElephant: 'visual/pieces/piece_enemy_elephant/texture',
    pieceHorse: 'visual/pieces/piece_enemy_horse/texture',
    pieceCannon: 'visual/pieces/piece_enemy_cannon/texture',
    pieceRook: 'visual/pieces/piece_enemy_rook/texture',
    pieceGeneral: 'visual/pieces/piece_enemy_general/texture',
    logo: 'visual/ui/img_logo/texture',
    reinforcementV1: 'visual/ui/ui_reinforcement_panel_v1/texture',
    hudRibbon: 'visual/ui/ui_hud_ribbon/texture',
    modalPanel: 'visual/ui/ui_modal_panel/texture',
    rewardCard: 'visual/ui/ui_reward_card/texture',
    rulesIcon: 'visual/ui/icon_rules/texture',
    pauseIcon: 'visual/ui/icon_pause/texture',
    helpIcon: 'visual/ui/icon_help/texture',
    closeIcon: 'visual/ui/icon_close/texture',
    rewardedVideoIcon: 'visual/ui/chess-endless-rewarded-video-icon-v1/texture',
    itemCard: 'visual/ui/ui_item_card_bg/texture',
    itemSlot: 'visual/ui/ui_item_slot/texture',
    crossSlash: 'visual/icons/icon_item_cross_slash/texture',
    freeze: 'visual/icons/icon_item_freeze/texture',
    delay: 'visual/icons/icon_item_delay/texture',
    banish: 'visual/icons/icon_item_banish/texture',
    teleport: 'visual/icons/icon_item_teleport/texture',
    revive: 'visual/icons/icon_revive/texture',
    inkParticle: 'visual/vfx/vfx_ink_particle/texture',
    lightParticle: 'visual/vfx/vfx_light_particle/texture',
    talisman: 'visual/vfx/vfx_talisman/texture',
    woodChip: 'visual/vfx/vfx_wood_chip/texture',
    captureBurst: 'visual/vfx/vfx_capture_burst/texture',
    comboBurst: 'visual/vfx/vfx_combo_burst/texture',
    generalArrivalVfx: 'visual/vfx/vfx_general_arrival/texture',
    generalKillVfx: 'visual/vfx/vfx_general_kill/texture',
    generalGuardVfx: 'visual/vfx/vfx_general_guard/texture',
    crossSlashVfx: 'visual/vfx/vfx_cross_slash/texture',
    spawnShadow: 'visual/vfx/vfx_spawn_shadow/texture',
    dangerMarker: 'visual/vfx/vfx_danger_marker/texture',
    itemCrossVfx: 'visual/vfx/vfx_item_cross/texture',
    itemFreezeVfx: 'visual/vfx/vfx_item_freeze/texture',
    itemDelayVfx: 'visual/vfx/vfx_item_delay/texture',
    itemBanishVfx: 'visual/vfx/vfx_item_banish/texture',
    itemTeleportVfx: 'visual/vfx/vfx_item_teleport/texture',
    rewardChestClosed: 'visual/vfx/vfx_reward_chest_closed/texture',
    rewardChestOpen: 'visual/vfx/vfx_reward_chest_open/texture',
});
const CHESS_REWARDED_VIDEO_ICON_ASPECT = 120 / 115;

function attachChessRewardedVideoIcon(
    parent: Node,
    frame: SpriteFrame | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
): Node | undefined {
    if (!frame) return undefined;
    const node = new Node('ChessEndlessRewardedVideoIcon');
    node.layer = parent.layer;
    node.setParent(parent);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    return node;
}

function measureChessTextWidth(text: string, fontSize: number): number {
    let width = 0;
    for (const character of text) {
        if (character === ' ') width += fontSize * 0.35;
        else if (/^[\u0000-\u00ff]$/.test(character)) width += fontSize * 0.56;
        else width += fontSize;
    }
    return width;
}

function layoutChessRewardedVideoIconBeforeLabel(
    icon: Node | undefined,
    label: Label,
    text: string,
    fontSize: number,
    iconWidth: number,
    iconHeight: number,
    buttonWidth: number,
    gap = 4,
): void {
    if (!icon) return;
    const labelTransform = label.node.getComponent(UITransform);
    if (!labelTransform) return;
    const textWidth = Math.min(
        Math.max(fontSize, measureChessTextWidth(text, fontSize)),
        Math.max(fontSize, buttonWidth - iconWidth - gap - 28),
    );
    const totalWidth = iconWidth + gap + textWidth;
    const centerY = label.node.position.y;
    labelTransform.setContentSize(textWidth, labelTransform.contentSize.height);
    label.node.setPosition((iconWidth + gap) / 2, centerY);
    icon.setPosition(-totalWidth / 2 + iconWidth / 2, centerY);
    icon.getComponent(UITransform)?.setContentSize(iconWidth, iconHeight);
}

const AUDIO_PATHS: Readonly<Record<string, string>> = Object.freeze({
    musicNormal: 'visual/audio/chess-game-normal-loop-v1',
    musicPressure: 'visual/audio/chess-game-pressure-loop-v1',
    playerMove: 'visual/audio/chess-player-move-v1',
    playerCapture: 'visual/audio/chess-player-capture-v1',
    enemyMove: 'visual/audio/chess-enemy-move-v1',
    playerKilled: 'visual/audio/chess-player-killed-v1',
    reinforcementDrop: 'visual/audio/chess-reinforcement-drop-v1',
    reinforcementWait: 'visual/audio/chess-reinforcement-wait-v1',
    generalWait: 'visual/audio/chess-general-wait-v1',
    generalArrive: 'visual/audio/chess-general-arrive-v1',
    crossCharge: 'visual/audio/chess-cross-charge-v1',
    crossSlash: 'visual/audio/chess-cross-slash-v1',
    multiCapture: 'visual/audio/chess-multi-capture-v1',
    generalKill: 'visual/audio/chess-general-kill-v1',
    rewardOpen: 'visual/audio/chess-reward-open-v1',
    itemSelect: 'visual/audio/chess-item-select-v1',
    itemFreeze: 'visual/audio/chess-item-freeze-v1',
    itemDelay: 'visual/audio/chess-item-delay-v1',
    itemBanish: 'visual/audio/chess-item-banish-v1',
    itemTeleport: 'visual/audio/chess-item-teleport-v1',
    itemHelp: 'visual/audio/chess-item-help-v1',
    rewardClose: 'visual/audio/chess-reward-close-v1',
    revive: 'visual/audio/chess-revive-v1',
    gameOver: 'visual/audio/chess-game-over-v1',
    uiClick: 'visual/audio/chess-ui-click-v1',
    uiPopup: 'visual/audio/chess-ui-popup-v1',
    combo2: 'visual/audio/chess-combo-2-v1',
    combo3: 'visual/audio/chess-combo-3-v1',
    combo4: 'visual/audio/chess-combo-4-v1',
});

const OPTIONAL_AUDIO_KEYS = new Set(['combo2', 'combo3', 'combo4']);
const COMBO_AUDIO_KEYS: Readonly<Record<2 | 3 | 4, string>> = Object.freeze({
    2: 'combo2',
    3: 'combo3',
    4: 'combo4',
});
const COMBO_AUDIO_VOLUMES: Readonly<Record<2 | 3 | 4, number>> = Object.freeze({
    2: 0.78,
    3: 0.86,
    4: 0.94,
});

const ITEM_ICON_KEY: Readonly<Record<ItemType, string>> = Object.freeze({
    crossSlash: 'crossSlash',
    freeze: 'freeze',
    delay: 'delay',
    banish: 'banish',
    teleport: 'teleport',
});

const PIECE_TEXTURE_KEY: Readonly<Record<EnemyPieceType, string>> = Object.freeze({
    pawn: 'piecePawn',
    advisor: 'pieceAdvisor',
    elephant: 'pieceElephant',
    horse: 'pieceHorse',
    cannon: 'pieceCannon',
    rook: 'pieceRook',
    general: 'pieceGeneral',
});

const PIECE_RULES: Readonly<Record<EnemyPieceType, string>> = Object.freeze({
    pawn: '卒：上下左右移动 1 格。相邻时可吃车。',
    advisor: '士：全棋盘斜走 1 格，不受九宫限制。',
    elephant: '象：斜走 2 格；象眼被棋子挡住时不能走。',
    horse: '马：走日字；对应方向的马腿被挡时不能走。',
    cannon: '炮：平时同车；吃车时中间必须恰有 1 枚炮架。',
    rook: '敌车：横竖任意格，路径不可有棋。',
    general: '将：上下左右 1 格。斩将得 300 分并三选一道具。',
});

const RULE_PAGES: readonly Readonly<{ title: string; body: string }>[]= Object.freeze([
    Object.freeze({
        title: '玩法规则',
        body: [
            '目标：操控绿色「車」在 9 × 10 棋盘上尽可能久地生存并取得高分。',
            '',
            '· 玩家回合开始时会自动选中己方車并显示合法落点。車只能横向或纵向移动，路径不能跨过棋子；落到敌棋位置即完成击杀。',
            '· 每个玩家回合最多先使用 1 件道具，使用后仍必须完成一次正常走車。',
            '· 敌方回合只移动 1 枚棋。若有敌棋能够直接吃掉玩家，敌方一定优先执行击杀。',
            '· 所有可能被敌棋吃掉的格子会显示淡红危险标记，可在暂停面板关闭。',
            '· 增援的棋种和倒计时会提前公开。每批普通增援至少 2 枚；清空棋盘时下一批立即落场。',
            '· 连续用正常走車吃子会提高连斩倍率；走到空格会重置连斩，道具击杀不计入连斩。',
            '· 斩杀将军可得高分；背包未满时会获得一次道具奖励选择。',
            '· 当前版本开启广告时，每局最多一次视频复活机会。复活会回到致死行动前并自动释放十字斩。',
        ].join('\n'),
    }),
    Object.freeze({
        title: '敌棋走法',
        body: [
            '卒：上下左右移动 1 格，贴近玩家时可直接击杀。',
            '',
            '士：斜向移动 1 格，不受传统九宫限制。',
            '',
            '象：斜向移动 2 格；中心的「象眼」有棋子时不能通过。',
            '',
            '马：走日字；靠近出发点的「马腿」被挡时不能走。',
            '',
            '炮：平时沿横竖空线移动；吃玩家时中间必须恰好隔 1 枚棋作为炮架。',
            '',
            '敌車：沿横向或纵向移动任意格，路径不能有棋子。',
            '',
            '将：上下左右移动 1 格。',
            '',
            '点击棋盘上的任意敌棋，可随时打开对应走法说明。',
        ].join('\n'),
    }),
    Object.freeze({
        title: '道具用法',
        body: [
            `十字斩：${ITEM_DESCRIPTIONS.crossSlash} 先点道具，再点己方車确认蓄力；再次点击当前道具可取消选择。`,
            '',
            `定身符：${ITEM_DESCRIPTIONS.freeze} 先点道具，再点目标敌棋；再次点击当前道具可取消选择。`,
            '',
            `缓兵符：${ITEM_DESCRIPTIONS.delay} 连点道具两次确认使用。`,
            '',
            `驱逐令：${ITEM_DESCRIPTIONS.banish} 先点道具，再点普通敌棋；再次点击当前道具可取消选择，会播放驱逐法阵，不计击杀。`,
            '',
            `移形符：${ITEM_DESCRIPTIONS.teleport} 先点道具，再点任意空格，之后仍需走車；再次点击当前道具可取消选择。`,
            '',
            '每种道具最多持有 2 件。底部道具和斩将奖励卡上的「?」按钮都可打开单独说明。',
        ].join('\n'),
    }),
]);

@ccclass('ChessEndlessGame')
export class ChessEndlessGame extends Component implements MiniGame {
    private lifecycle: LifecycleState = 'idle';
    private context?: MiniGameContext<ChessEndlessServices>;
    private model = new ChessEndlessModel();
    private readonly frames = new Map<string, SpriteFrame>();
    private readonly clips = new Map<string, AudioClip>();
    private boardNode?: Node;
    private gridNode?: Node;
    private pieceLayer?: Node;
    private moveLayer?: Node;
    private dangerLayer?: Node;
    private underPieceEffectLayer?: Node;
    private effectLayer?: Node;
    private itemDock?: Node;
    private reinforcementNode?: Node;
    private reinforcementStatus?: Label;
    private reinforcementTitle?: Label;
    private reinforcementPreview?: Node;
    private reinforcementArtwork?: Node;
    private scoreLabel?: Label;
    private bestLabel?: Label;
    private hintLabel?: Label;
    private selectedPlayer = false;
    private selectedItem?: ItemType;
    private inputLocked = false;
    private bestScore = 0;
    private playCount = 0;
    private roundStartedAt = 0;
    private pressureMode = false;
    private deathOverlay?: OverlayState;
    private rewardOverlay?: OverlayState;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private rulesOverlay?: OverlayState;
    private infoOverlay?: OverlayState;
    private completedResultModel?: MiniGameResultModel;
    private resizeQueued = false;
    private layout?: ChessEndlessLayout;
    private dangerHintsEnabled = true;
    private rulesPageIndex = 0;
    private readonly rewardCardNodes = new Map<ItemType, Node>();
    private resumableRound?: ResumableChessRound;
    private savedProgressDiscarded = false;
    private operationGeneration = 0;
    private reviveAdPending = false;

    async initialize(context: MiniGameContext<ChessEndlessServices>): Promise<void> {
        if (this.lifecycle !== 'idle') throw new Error(`Cannot initialize ChessEndlessGame from ${this.lifecycle}.`);
        this.context = context;
        this.readSave();
        this.clearChildren(this.node);
        this.layout = this.node.getComponent(ChessEndlessLayout) ?? this.node.addComponent(ChessEndlessLayout);
        this.layout.setPlatformLayout(context.services.platform.getLayoutInfo());
        this.layout.setLayoutChangeHandler(this.handleLayoutChange);
        await Promise.all([this.loadTextures(), this.loadAudio()]);
        this.buildInterface();
        this.scheduleOnce(() => {
            if (this.lifecycle === 'disposed') return;
            this.layout?.applyLayout();
            this.buildInterface();
            this.renderAll();
        }, 0);
        this.lifecycle = 'ready';
        this.installQaBridge();
    }

    begin(): void {
        if (this.lifecycle !== 'ready') throw new Error(`Cannot begin ChessEndlessGame from ${this.lifecycle}.`);
        this.operationGeneration += 1;
        this.savedProgressDiscarded = false;
        this.reviveAdPending = false;
        this.lifecycle = 'playing';
        this.selectedItem = undefined;
        this.pressureMode = false;
        this.playMusic('musicNormal');

        const resumable = this.resumableRound;
        this.resumableRound = undefined;
        if (resumable) {
            this.roundStartedAt = Date.now();
            this.model.restoreSnapshot(resumable.snapshot, resumable.recoverySnapshot);
            this.context?.reportScore(this.model.snapshot.score);
            this.renderAll();
            this.persistProgress(false);
            this.resumeCurrentPhase();
            console.info('[ChessEndless] resumed saved round');
            return;
        }

        this.playCount += 1;
        this.roundStartedAt = Date.now();
        this.model.reset((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
        this.selectedPlayer = true;
        const qaScenario = this.applyPreviewQaScenario();
        this.context?.reportScore(0);
        this.renderAll();
        if (qaScenario === 'reward') void this.showRewardChestSequence();
        if (qaScenario === 'revive' || qaScenario === 'noRevive') void this.performEnemyTurn();
        this.persistProgress(false);
        console.info('[ChessEndless] ready');
    }

    pause(): void {
        if (this.lifecycle !== 'playing') return;
        this.operationGeneration += 1;
        this.lifecycle = 'paused';
        this.inputLocked = true;
        if (!this.savedProgressDiscarded) {
            this.persistProgress(false);
        }
        this.context?.services.audio.pauseMusic();
    }

    resume(): void {
        if (this.lifecycle !== 'paused') return;
        this.operationGeneration += 1;
        this.lifecycle = 'playing';
        this.context?.services.audio.resumeMusic();
        this.resumeCurrentPhase();
    }

    async restart(context?: MiniGameContext<ChessEndlessServices>): Promise<void> {
        if (this.lifecycle === 'disposed') throw new Error('Cannot restart a disposed game.');
        if (context) this.context = context;
        this.operationGeneration += 1;
        this.savedProgressDiscarded = false;
        this.reviveAdPending = false;
        this.destroyAllOverlays();
        this.lifecycle = 'playing';
        this.inputLocked = false;
        this.selectedItem = undefined;
        this.selectedPlayer = true;
        this.roundStartedAt = Date.now();
        this.model.reset((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
        const qaScenario = this.applyPreviewQaScenario();
        this.pressureMode = false;
        this.playCount += 1;
        this.context?.services.audio.resumeMusic();
        this.playMusic('musicNormal');
        this.renderAll();
        if (qaScenario === 'reward') void this.showRewardChestSequence();
        if (qaScenario === 'revive' || qaScenario === 'noRevive') void this.performEnemyTurn();
        this.persistProgress(false);
    }

    discardSavedProgress(): void {
        this.operationGeneration += 1;
        this.savedProgressDiscarded = true;
        this.persistProgress(false, false);
    }

    async dispose(): Promise<void> {
        if (this.lifecycle === 'disposed') return;
        this.operationGeneration += 1;
        if (!this.savedProgressDiscarded
            && (this.lifecycle === 'playing' || this.lifecycle === 'paused')) {
            this.persistProgress(false);
        }
        this.lifecycle = 'disposed';
        this.reviveAdPending = false;
        Tween.stopAll();
        this.destroyAllOverlays();
        this.context?.services.audio.stopMusic();
        this.frames.forEach((frame) => frame.destroy());
        this.frames.clear();
        this.clips.clear();
        this.clearChildren(this.node);
        this.removeQaBridge();
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.hidePauseMenu();
        const snapshot = this.model.snapshot;
        this.pauseOverlay = this.buildPauseModal(
            snapshot.score,
            model,
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.completedResultModel = model;
        this.destroyOverlay(this.resultOverlay);
        const extra = model.result.extra ?? {};
        const turns = typeof extra.turns === 'number' ? Math.floor(extra.turns) : 0;
        const generals = typeof extra.generalKills === 'number' ? Math.floor(extra.generalKills) : 0;
        const combo = typeof extra.maxCombo === 'number' ? Math.floor(extra.maxCombo) : 0;
        const newRecord = extra.newRecord === true;
        this.resultOverlay = this.buildModal(
            'ResultOverlay',
            '本局落幕',
            newRecord ? '新纪录' : '棋局结束',
            `${model.result.score.toLocaleString()} 分\n生存 ${turns} 回合 · 斩将 ${generals} · 最大连斩 ×${combo}`,
            [
                {
                    label: '查看最后残局', tone: 'jade', action: () => {
                        this.destroyOverlay(this.resultOverlay);
                        this.resultOverlay = undefined;
                    },
                },
                { label: '再来一局', tone: 'cinnabar', action: model.restart },
                { label: '返回游戏大厅', tone: 'paper', action: model.returnToLobby },
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = undefined;
    }

    private buildInterface(): void {
        this.clearChildren(this.node);
        const metrics = this.layout?.getMetrics();
        if (!metrics) {
            return;
        }

        const {
            hudX,
            hudY,
            hudWidth,
            hudHeight,
            reinforcementX,
            reinforcementWidth,
            reinforcementScale,
            reinforcementHeight,
            reinforcementY,
            dockX,
            dockWidth,
            dockHeight,
            dockY,
            boardX,
            boardY,
            boardNodeWidth,
            boardNodeHeight,
            surfaceWidth,
            surfaceHeight,
            backgroundWidth,
            backgroundHeight,
        } = metrics;

        const background = this.createNode(this.node, 'Background', 0, 0, backgroundWidth, backgroundHeight);
        background.setSiblingIndex(0);
        this.applySprite(background, 'background');

        const hud = this.createNode(this.node, 'TopHud', hudX, hudY, hudWidth, hudHeight);
        const hudScale = Math.max(0.1, Math.min(1, hudHeight / 104));

        const headerBrandWidth = Math.max(1, Math.min(214 * hudScale, hudWidth * 0.31 - 8 * hudScale));
        const headerBrandScale = headerBrandWidth / 214;
        const headerBrandHeight = Math.min(96 * headerBrandScale, hudHeight - 8 * hudScale);
        const headerBrandPaddingX = 18 * headerBrandScale;
        const headerBrandPaddingY = 14 * headerBrandScale;
        const headerLogoWidth = 166 * headerBrandScale;
        const headerLogoHeight = 50 * headerBrandScale;
        const innerTop = headerBrandHeight / 2 - headerBrandPaddingY;
        const innerBottom = -headerBrandHeight / 2 + headerBrandPaddingY;
        const headerBrandX = -hudWidth / 2 + headerBrandWidth / 2 + 20 * hudScale;
        const headerBrand = this.createNode(hud, 'HeaderBrand', headerBrandX, 0, headerBrandWidth, headerBrandHeight);
        const headerBrandBackground = headerBrand.addComponent(Graphics);
        headerBrandBackground.fillColor = new Color(224, 229, 232, 77);
        headerBrandBackground.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 220);
        headerBrandBackground.lineWidth = Math.max(1.5, 2 * headerBrandScale);
        headerBrandBackground.roundRect(
            -headerBrandWidth / 2,
            -headerBrandHeight / 2,
            headerBrandWidth,
            headerBrandHeight,
            12 * headerBrandScale,
        );
        headerBrandBackground.fill();
        headerBrandBackground.stroke();
        const headerLogo = this.createNode(
            headerBrand,
            'HeaderLogo',
            0,
            innerTop - headerLogoHeight / 2,
            headerLogoWidth,
            headerLogoHeight,
        );
        this.applySprite(headerLogo, 'logo');
        const bestLabelHeight = 24 * headerBrandScale;
        this.bestLabel = this.createLabel(
            headerBrand,
            'BestScore',
            `纪录 ${this.bestScore.toLocaleString()}`,
            0,
            innerBottom + bestLabelHeight / 2,
            Math.max(10, Math.round(16 * headerBrandScale)),
            COLORS.goldLight,
            headerBrandWidth - headerBrandPaddingX * 2,
            bestLabelHeight,
        );
        this.bestLabel.horizontalAlign = 1;
        const bestOutline = this.bestLabel.node.addComponent(LabelOutline);
        bestOutline.color = new Color(18, 36, 32, 235);
        bestOutline.width = 2;

        const controlSize = 58 * hudScale;
        const controlGap = 10 * hudScale;
        const controlRightPadding = 20 * hudScale;
        const pauseX = hudWidth / 2 - controlRightPadding - controlSize / 2;
        const rulesX = pauseX - controlSize - controlGap;
        this.createImageButtonOn(hud, 'PauseButton', 'pauseIcon', pauseX, 0, controlSize, () => {
            if (!this.inputLocked) {
                this.playSound('uiClick', 0.6);
                this.context?.requestPause();
            }
        });
        this.createImageButtonOn(
            hud,
            'RulesButton',
            'rulesIcon',
            rulesX,
            0,
            controlSize,
            () => this.showRules(),
        );

        const scoreBlockWidth = Math.max(1, hudWidth * 0.32);
        this.scoreLabel = this.createLabel(hud, 'Score', '0', 0, 11 * hudScale, Math.max(24, Math.round(48 * hudScale)), COLORS.goldLight, scoreBlockWidth, 58 * hudScale);
        const scoreOutline = this.scoreLabel.node.addComponent(LabelOutline);
        scoreOutline.color = new Color(45, 25, 12, 210);
        scoreOutline.width = 2;
        const scoreTitle = this.createLabel(hud, 'ScoreTitle', '本局得分', 0, -30 * hudScale, Math.max(12, Math.round(24 * hudScale)), COLORS.white, scoreBlockWidth, 28 * hudScale);
        scoreTitle.lineHeight = 28 * hudScale;
        const scoreTitleOutline = scoreTitle.node.addComponent(LabelOutline);
        scoreTitleOutline.color = new Color(45, 25, 12, 210);
        scoreTitleOutline.width = 2;

        this.reinforcementNode = this.createNode(
            this.node,
            'ReinforcementPanel',
            reinforcementX,
            reinforcementY,
            reinforcementWidth,
            reinforcementHeight,
        );
        const reinforcementArtworkWidth = 232 * reinforcementScale;
        this.reinforcementArtwork = this.createNode(
            this.reinforcementNode,
            'Artwork',
            0,
            0,
            reinforcementArtworkWidth,
            reinforcementHeight,
        );
        this.applySprite(this.reinforcementArtwork, 'reinforcementV1');
        const reinforcementLabelWidth = 112 * reinforcementScale;
        const reinforcementLabelGap = 4;
        const reinforcementTitleLine = Math.round(16 * 1.38 * reinforcementScale);
        const reinforcementStatusLine = Math.round(20 * 1.38 * reinforcementScale);
        const reinforcementLabelBlockHeight = reinforcementTitleLine + reinforcementLabelGap + reinforcementStatusLine;
        const reinforcementLabelTitleY = (reinforcementStatusLine + reinforcementLabelGap) / 2;
        const reinforcementLabelStatusY = -(reinforcementTitleLine + reinforcementLabelGap) / 2;
        const reinforcementContentCenterY = 14 * reinforcementScale;
        const reinforcementLabels = this.createNode(
            this.reinforcementArtwork,
            'Labels',
            -(reinforcementArtworkWidth / 2 + reinforcementLabelWidth / 2 + 8),
            reinforcementContentCenterY,
            reinforcementLabelWidth,
            reinforcementLabelBlockHeight,
        );
        this.reinforcementTitle = this.createLabel(
            reinforcementLabels,
            'Title',
            '下一批增援',
            0,
            reinforcementLabelTitleY,
            20,
            COLORS.goldLight,
            reinforcementLabelWidth,
            reinforcementTitleLine,
        );
        this.reinforcementTitle.lineHeight = reinforcementTitleLine;
        this.reinforcementTitle.horizontalAlign = 2;
        const titleOutline = this.reinforcementTitle.node.addComponent(LabelOutline);
        titleOutline.color = new Color(45, 25, 12, 235);
        titleOutline.width = 2;
        this.reinforcementStatus = this.createLabel(
            reinforcementLabels,
            'Status',
            '',
            0,
            reinforcementLabelStatusY,
            24,
            COLORS.white,
            reinforcementLabelWidth,
            reinforcementStatusLine,
        );
        this.reinforcementStatus.lineHeight = reinforcementStatusLine;
        this.reinforcementStatus.horizontalAlign = 2;
        const statusOutline = this.reinforcementStatus.node.addComponent(LabelOutline);
        statusOutline.color = new Color(45, 25, 12, 235);
        statusOutline.width = 2;
        this.reinforcementPreview = this.createNode(
            this.reinforcementArtwork,
            'PreviewPieces',
            0,
            reinforcementContentCenterY,
            196 * reinforcementScale,
            72 * reinforcementScale,
        );

        this.boardNode = this.createNode(this.node, 'Board', boardX, boardY, boardNodeWidth, boardNodeHeight);
        this.applySprite(this.boardNode, 'boardBackplate');
        const boardSurface = this.createNode(this.boardNode, 'BoardSurface', 0, 0, surfaceWidth, surfaceHeight);
        this.applySprite(boardSurface, 'board');
        this.gridNode = this.createNode(boardSurface, 'Grid', 0, 0, surfaceWidth, surfaceHeight);
        this.drawBoardGrid(this.gridNode, surfaceWidth, surfaceHeight);
        this.dangerLayer = this.createNode(boardSurface, 'DangerLayer', 0, 0, surfaceWidth, surfaceHeight);
        this.underPieceEffectLayer = this.createNode(boardSurface, 'UnderPieceEffectLayer', 0, 0, surfaceWidth, surfaceHeight);
        this.moveLayer = this.createNode(boardSurface, 'MoveLayer', 0, 0, surfaceWidth, surfaceHeight);
        this.pieceLayer = this.createNode(boardSurface, 'PieceLayer', 0, 0, surfaceWidth, surfaceHeight);
        this.effectLayer = this.createNode(boardSurface, 'EffectLayer', 0, 0, surfaceWidth, surfaceHeight);
        this.createBoardHitTargets(boardSurface, surfaceWidth, surfaceHeight);

        this.hintLabel = undefined;

        this.itemDock = this.createNode(this.node, 'ItemDock', dockX, dockY, dockWidth, dockHeight);
        const dockScale = Math.max(0.1, Math.min(1, dockWidth / 750));
        const dockTopPadding = 8 * dockScale;
        const dockTitleHeight = 24 * dockScale;
        const dockTitleY = dockHeight / 2 - dockTopPadding - dockTitleHeight / 2;
        const dockTitleFontSize = Math.max(12, Math.round(22 * dockScale));
        const dockTitle = this.createLabel(
            this.itemDock,
            'DockTitle',
            '每回合最多使用 1 件道具',
            0,
            dockTitleY,
            dockTitleFontSize,
            COLORS.goldLight,
            Math.max(1, dockWidth - 32 * dockScale),
            dockTitleHeight,
        );
        dockTitle.lineHeight = dockTitleHeight;
    }

    private drawBoardGrid(node: Node, width: number, height: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(224, 187, 118, 44);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        graphics.strokeColor = new Color(81, 47, 26, 176);
        graphics.lineWidth = 2.1;
        for (let column = 0; column < BOARD_COLUMNS; column += 1) {
            const x = -width / 2 + column * width / (BOARD_COLUMNS - 1);
            graphics.moveTo(x, -height / 2);
            graphics.lineTo(x, height / 2);
        }
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            const y = height / 2 - row * height / (BOARD_ROWS - 1);
            graphics.moveTo(-width / 2, y);
            graphics.lineTo(width / 2, y);
        }
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.woodDark.r, COLORS.woodDark.g, COLORS.woodDark.b, 210);
        graphics.lineWidth = 4;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.stroke();
    }

    private createBoardHitTargets(parent: Node, width: number, height: number): void {
        const cellWidth = width / (BOARD_COLUMNS - 1);
        const cellHeight = height / (BOARD_ROWS - 1);
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                const target = this.createNode(
                    parent,
                    `Cell-${column}-${row}`,
                    -width / 2 + column * cellWidth,
                    height / 2 - row * cellHeight,
                    cellWidth * 0.88,
                    cellHeight * 0.88,
                );
                target.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                    event.propagationStopped = true;
                    void this.handleCellTap(position(column, row));
                }, this);
            }
        }
    }

    private renderAll(): void {
        if (!this.node.isValid) return;
        const snapshot = this.model.snapshot;
        this.scoreLabel && (this.scoreLabel.string = snapshot.score.toLocaleString());
        this.bestLabel && (this.bestLabel.string = `纪录 ${Math.max(this.bestScore, snapshot.score).toLocaleString()}`);
        this.context?.reportScore(snapshot.score);
        this.renderReinforcement(snapshot);
        this.renderDangerPositions();
        this.renderPieces(snapshot);
        this.renderMoveTargets();
        this.renderItemDock(snapshot);
        this.updatePressureMusic(snapshot);
    }

    private renderReinforcement(snapshot: ChessEndlessSnapshot): void {
        const preview = this.reinforcementPreview;
        if (preview) {
            this.clearChildren(preview);
            const types = snapshot.queuedReinforcement.types;
            const count = types.length;
            let pieceSize = 60;
            // 增援预览始终使用最小棋子间隔，避免列表长度改变时横向节奏跳变。
            const gap = REINFORCEMENT_PIECE_GAP;
            if (count >= 5) {
                pieceSize = 34;
            } else if (count >= 4) {
                pieceSize = 44;
            } else if (count === 3) {
                pieceSize = 50;
            }
            types.forEach((type, index) => {
                const x = (index - (count - 1) / 2) * (pieceSize + gap);
                const piece = this.createNode(preview, `Preview-${type}-${index}`, x, 6, pieceSize, pieceSize);
                this.applySprite(piece, PIECE_TEXTURE_KEY[type]);
            });
        }
        const waiting = snapshot.reinforcementState === 'WAITING'
            || snapshot.reinforcementState === 'GENERAL_WAITING';
        const general = snapshot.queuedReinforcement.kind === 'general';
        if (this.reinforcementTitle) {
            this.reinforcementTitle.string = general ? '将军来袭' : '下一批增援';
            this.reinforcementTitle.color = general ? COLORS.cinnabar : COLORS.goldLight;
        }
        if (this.reinforcementArtwork) {
            this.applySprite(this.reinforcementArtwork, 'reinforcementV1');
        }
        if (this.reinforcementStatus) {
            this.reinforcementStatus.string = waiting
                ? (general ? '将军待降' : '等待入场')
                : `${snapshot.reinforcementTimer} 回合后`;
            this.reinforcementStatus.color = general || waiting ? COLORS.cinnabar : COLORS.white;
        }
    }

    private renderDangerPositions(): void {
        const layer = this.dangerLayer;
        if (!layer) return;
        this.clearChildren(layer);
        if (!this.dangerHintsEnabled || this.model.snapshot.phase !== 'player') return;
        this.model.getDangerPositions().forEach((target) => {
            const point = this.boardPoint(target);
            const marker = this.createNode(layer, `Danger-${target.column}-${target.row}`, point.x, point.y, 38, 38);
            this.applySprite(marker, 'dangerMarker');
            marker.getComponent(Sprite)!.color = new Color(255, 255, 255, 120);
        });
    }

    private renderPieces(snapshot: ChessEndlessSnapshot): void {
        const layer = this.pieceLayer;
        if (!layer) return;
        this.clearChildren(layer);
        const player = this.createPieceNode('Player', 'rook', snapshot.playerPosition, true, false);
        player.setParent(layer);
        snapshot.enemies.forEach((piece) => {
            const node = this.createPieceNode(`Enemy-${piece.id}`, piece.type, piece.position, false, piece.type === 'general');
            node.setParent(layer);
            if (piece.frozenTurns > 0) this.decorateFrozen(node);
        });
    }

    private createPieceNode(
        name: string,
        type: EnemyPieceType,
        at: BoardPosition,
        player: boolean,
        general: boolean,
    ): Node {
        const size = this.boardMetrics();
        // The generated discs keep a transparent safety margin for particles and
        // shadows. Size the sprite node above one grid interval so the visible
        // wooden disc still reads clearly within one cell without overlapping.
        const diameter = Math.min(size.cellWidth, size.cellHeight)
            * (general ? GENERAL_PIECE_DIAMETER_SCALE : PIECE_DIAMETER_SCALE);
        const point = this.boardPoint(at);
        const node = this.createNode(this.pieceLayer ?? this.node, name, point.x, point.y, diameter, diameter);
        // 棋子根节点只负责移动和缩放；阴影与棋面作为子节点，移动动画时会始终跟随棋子。
        const shadow = this.createNode(
            node,
            'Shadow',
            diameter * PIECE_SHADOW_X_SCALE,
            diameter * PIECE_SHADOW_Y_SCALE,
            diameter * PIECE_SHADOW_WIDTH_SCALE,
            diameter * PIECE_SHADOW_HEIGHT_SCALE,
        );
        this.drawPieceShadow(shadow);
        const visual = this.createNode(node, 'Visual', 0, 0, diameter, diameter);
        this.applySprite(visual, player ? 'piecePlayer' : PIECE_TEXTURE_KEY[type]);
        if (player && this.selectedPlayer) {
            const ring = this.createNode(node, 'SelectedRing', 0, 0, diameter + 8, diameter + 8);
            const graphics = ring.addComponent(Graphics);
            graphics.strokeColor = new Color(COLORS.goldLight.r, COLORS.goldLight.g, COLORS.goldLight.b, 132);
            graphics.lineWidth = 1.8;
            graphics.circle(0, 0, diameter / 2 + 3);
            graphics.stroke();
        }
        return node;
    }

    private drawPieceShadow(node: Node): void {
        const size = node.getComponent(UITransform)?.contentSize ?? { width: 0, height: 0 };
        const graphics = node.addComponent(Graphics);
        // 暖棕色多层椭圆模拟弱阳光下的柔和投影，避免使用纯黑造成脏重感。
        graphics.fillColor = new Color(92, 70, 48, 24);
        graphics.ellipse(0, 0, size.width / 2, size.height / 2);
        graphics.fill();
        graphics.fillColor = new Color(82, 60, 40, 30);
        graphics.ellipse(0, 0, size.width * 0.43, size.height * 0.40);
        graphics.fill();
        graphics.fillColor = new Color(72, 51, 34, 34);
        graphics.ellipse(0, 0, size.width * 0.34, size.height * 0.31);
        graphics.fill();
    }

    private decorateFrozen(node: Node): void {
        const seal = this.createNode(node, 'FreezeSeal', 0, 0, 50, 66);
        this.applySprite(seal, 'talisman');
        seal.setRotationFromEuler(0, 0, -8);
        const opacity = seal.addComponent(UIOpacity);
        opacity.opacity = 225;
    }

    private renderMoveTargets(): void {
        const layer = this.moveLayer;
        if (!layer) return;
        this.clearChildren(layer);
        let targets: readonly BoardPosition[] = [];
        if (this.selectedItem === 'teleport') {
            const occupied = new Set(this.model.snapshot.enemies.map((piece) => `${piece.position.column},${piece.position.row}`));
            targets = Array.from({ length: BOARD_COLUMNS * BOARD_ROWS }, (_, index) => position(index % BOARD_COLUMNS, Math.floor(index / BOARD_COLUMNS)))
                .filter((target) => !occupied.has(`${target.column},${target.row}`)
                    && (target.column !== this.model.snapshot.playerPosition.column || target.row !== this.model.snapshot.playerPosition.row));
        } else if (this.selectedPlayer) {
            targets = this.model.getPlayerLegalMoves();
        }
        const enemies = this.model.snapshot.enemies;
        targets.forEach((target) => {
            const point = this.boardPoint(target);
            const node = this.createNode(layer, `Move-${target.column}-${target.row}`, point.x, point.y, 22, 22);
            const graphics = node.addComponent(Graphics);
            const capture = enemies.some((piece) => same(piece.position, target));
            graphics.fillColor = capture ? new Color(164, 55, 43, 142) : new Color(80, 137, 111, 150);
            graphics.circle(0, 0, capture ? 7 : 4.5);
            graphics.fill();
            graphics.strokeColor = capture ? new Color(255, 221, 163, 135) : new Color(226, 208, 160, 118);
            graphics.lineWidth = 1.2;
            graphics.circle(0, 0, capture ? 11 : 8);
            graphics.stroke();
        });
    }

    private renderItemDock(snapshot: ChessEndlessSnapshot): void {
        const dock = this.itemDock;
        if (!dock) return;
        dock.children.filter((child) => child.name.startsWith('Item-')).forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        const types: readonly ItemType[] = ['crossSlash', 'freeze', 'delay', 'banish', 'teleport'];
        const width = dock.getComponent(UITransform)?.contentSize.width
            ?? this.layout?.getMetrics().dockWidth
            ?? 750;
        const dockHeight = dock.getComponent(UITransform)?.contentSize.height ?? 176;
        const dockScale = Math.max(0.1, Math.min(1, width / 750));
        const topPadding = 8 * dockScale;
        const titleHeight = 24 * dockScale;
        const titleGap = 10 * dockScale;
        const bottomPadding = 2 * dockScale;
        const listHeight = Math.max(1, dockHeight - topPadding - titleHeight - titleGap - bottomPadding);
        const totalWidth = Math.max(1, Math.min(750, width) - 48 * dockScale);
        const cellWidth = totalWidth / types.length;
        const visualScale = Math.max(0.1, Math.min(
            1,
            (cellWidth - 6) / 112,
            listHeight / 128,
        ));
        const buttonGap = Math.max(3, 9 * visualScale);
        const buttonWidth = Math.max(1, cellWidth - buttonGap);
        const buttonHeight = Math.max(1, 128 * visualScale);
        // 卡片贴着底部安全边界排列，多出的高度留在标题与卡片之间。
        const buttonY = -dockHeight / 2 + bottomPadding + buttonHeight / 2;
        const cornerRadius = Math.max(5, 14 * visualScale);
            const iconSize = 76 * visualScale;
        const badgeSize = 32 * visualScale;
        const helpSize = 31 * visualScale;
        const nameFontSize = Math.max(12, Math.round(22 * visualScale));
        const countFontSize = Math.max(10, Math.round(18 * visualScale));

        types.forEach((type, index) => {
            const x = -totalWidth / 2 + cellWidth / 2 + index * cellWidth;
            const button = this.createNode(dock, `Item-${type}`, x, buttonY, buttonWidth, buttonHeight);
            const graphics = button.addComponent(Graphics);
            const active = this.selectedItem === type;
            const available = snapshot.inventory[type] > 0 && !snapshot.usedItemThisTurn;
            graphics.fillColor = active
                ? new Color(28, 82, 60, 220)
                : available
                ? new Color(22, 66, 52, 190)
                : new Color(18, 50, 42, 115);
            graphics.strokeColor = active
                ? COLORS.goldLight
                : new Color(COLORS.goldLight.r, COLORS.goldLight.g, COLORS.goldLight.b, available ? 168 : 72);
            graphics.lineWidth = active ? 2.5 : 1.2;
            graphics.roundRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
            graphics.fill();
            graphics.stroke();

            const icon = this.createNode(button, 'Icon', 0, 19 * visualScale, iconSize, iconSize);
            this.applySprite(icon, ITEM_ICON_KEY[type]);
            icon.getComponent(Sprite)!.color = available ? Color.WHITE : new Color(188, 181, 163, 192);

            this.createLabel(
                button,
                'Name',
                ITEM_DISPLAY[type].replace('符', ''),
                0,
                -40 * visualScale,
                nameFontSize,
                available ? COLORS.white : new Color(205, 197, 174, 190),
                Math.max(1, buttonWidth - 10 * visualScale),
                Math.max(20, 34 * visualScale),
            );

            const badgeX = -buttonWidth / 2 + badgeSize / 2 + 4 * visualScale;
            const badgeY = buttonHeight / 2 - badgeSize / 2 - 4 * visualScale;
            const badge = this.createNode(button, 'CountBadge', badgeX, badgeY, badgeSize, badgeSize);
            const badgeGraphics = badge.addComponent(Graphics);
            badgeGraphics.fillColor = available ? COLORS.cinnabar : new Color(82, 80, 73, 210);
            badgeGraphics.circle(0, 0, badgeSize / 2);
            badgeGraphics.fill();
            this.createLabel(
                badge,
                'Count',
                String(snapshot.inventory[type]),
                0,
                0,
                countFontSize,
                COLORS.white,
                Math.max(1, badgeSize - 2),
                Math.max(1, badgeSize - 4),
            );

            const helpX = buttonWidth / 2 - helpSize / 2 - 4 * visualScale;
            const helpY = buttonHeight / 2 - helpSize / 2 - 5 * visualScale;
            const help = this.createNode(button, 'Help', helpX, helpY, helpSize, helpSize);
            this.applySprite(help, 'helpIcon');
            help.addComponent(Button);
            help.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.showItemHelp(type);
            }, this);

            button.addComponent(Button).interactable = available;
            button.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.handleItemTap(type);
            }, this);
        });
    }

    private async handleCellTap(target: BoardPosition): Promise<void> {
        if (this.inputLocked || this.lifecycle !== 'playing' || this.model.snapshot.phase !== 'player') return;
        const generation = this.operationGeneration;
        const snapshot = this.model.snapshot;
        const enemy = snapshot.enemies.find((piece) => same(piece.position, target));

        if (this.selectedItem === 'freeze' || this.selectedItem === 'banish') {
            if (!enemy) {
                this.setHint(`请选择一枚普通敌棋使用${ITEM_DISPLAY[this.selectedItem]}`);
                return;
            }
            if (enemy.type === 'general') {
                this.setHint('道具不能对「将」使用');
                return;
            }
            const item = this.selectedItem;
            const oldNode = this.pieceLayer?.getChildByName(`Enemy-${enemy.id}`);
            const result = this.model.useItem(item, enemy.id);
            this.persistProgress(false);
            this.selectedItem = undefined;
            this.selectedPlayer = true;
            this.playSound(item === 'freeze' ? 'itemFreeze' : 'itemBanish');
            this.context?.services.feedback.vibrate('medium');
            await this.showItemEffect(item, enemy.position);
            if (!this.isOperationCurrent(generation)) return;
            if (item === 'banish' && oldNode) {
                await this.tweenNode(oldNode, CAPTURE_DURATION, { scale: new Vec3(0.1, 0.1, 1) }, 'quadIn');
            }
            if (!this.isOperationCurrent(generation)) return;
            this.renderAll();
            this.setHint(item === 'freeze' ? '封印已生效；现在仍须正常走车' : `已驱逐${PIECE_DISPLAY[result.removed!.type]}；不计击杀分`);
            return;
        }

        if (this.selectedItem === 'teleport') {
            if (enemy || same(target, snapshot.playerPosition)) {
                this.setHint('移形符只能选择空格');
                return;
            }
            const from = snapshot.playerPosition;
            this.model.useItem('teleport', target);
            this.persistProgress(false);
            this.selectedItem = undefined;
            this.selectedPlayer = true;
            this.playSound('itemTeleport');
            await this.showTeleportEffect(from, target);
            if (!this.isOperationCurrent(generation)) return;
            this.renderAll();
            this.setHint('移形完成；本回合仍须正常走车一次');
            return;
        }

        if (same(target, snapshot.playerPosition)) {
            if (this.selectedItem === 'crossSlash') {
                this.model.useItem('crossSlash');
                this.persistProgress(false);
                this.selectedItem = undefined;
                this.selectedPlayer = true;
                this.playSound('crossCharge');
                this.context?.services.feedback.vibrate('heavy');
                void this.showItemEffect('crossSlash', target);
                this.renderAll();
                this.setHint('十字斩已蓄势，将在本次正常移动结束后释放');
                return;
            }
            this.selectedPlayer = true;
            if (this.selectedItem) {
                this.setHint(`${ITEM_DISPLAY[this.selectedItem]}需要按提示选择目标`);
                return;
            }
            this.playSound('uiClick', 0.55);
            this.renderAll();
            return;
        }

        if (this.selectedPlayer && this.model.getPlayerLegalMoves().some((candidate) => same(candidate, target))) {
            await this.performPlayerMove(target);
            return;
        }

        if (enemy) {
            this.showPieceInfo(enemy.type);
        }
    }

    private handleItemTap(type: ItemType): void {
        if (this.inputLocked || this.model.snapshot.phase !== 'player') return;
        if (this.model.snapshot.inventory[type] <= 0 || this.model.snapshot.usedItemThisTurn) return;
        this.playSound('uiClick', 0.58);
        if (this.selectedItem !== type) {
            this.selectedItem = type;
            this.selectedPlayer = type === 'crossSlash' || type === 'delay';
            this.renderAll();
            const instruction = type === 'freeze' || type === 'banish'
                ? '请选择一枚普通敌棋；再次点击取消'
                : type === 'teleport'
                    ? '请选择任意空格；再次点击取消，不会提示是否安全'
                    : type === 'crossSlash'
                        ? '请点击己方「車」确认蓄力；再次点击取消'
                        : `再次点击确认使用${ITEM_DISPLAY[type]}`;
            this.setHint(`${ITEM_DISPLAY[type]}：${instruction}`);
            return;
        }
        if (type !== 'delay') {
            this.selectedItem = undefined;
            this.selectedPlayer = true;
            this.renderAll();
            this.setHint(`${ITEM_DISPLAY[type]}已取消；可继续正常走車`);
            return;
        }
        try {
            this.model.useItem(type);
            this.persistProgress(false);
            this.selectedItem = undefined;
            this.selectedPlayer = true;
            this.playSound('itemDelay');
            this.context?.services.feedback.vibrate('medium');
            this.renderAll();
            void this.showItemEffect(type, this.model.snapshot.playerPosition);
            this.setHint('增援已延后 2 回合；现在仍须正常走車');
        } catch (error: unknown) {
            this.setHint(error instanceof Error ? error.message : String(error));
        }
    }

    private async performPlayerMove(target: BoardPosition): Promise<void> {
        const generation = this.operationGeneration;
        this.inputLocked = true;
        this.selectedPlayer = false;
        this.selectedItem = undefined;
        const before = this.model.snapshot;
        const playerNode = this.pieceLayer?.getChildByName('Player');
        if (this.moveLayer) this.clearChildren(this.moveLayer);
        const selectedRing = playerNode?.getChildByName('SelectedRing');
        if (selectedRing) {
            selectedRing.removeFromParent();
            selectedRing.destroy();
        }
        const targetEnemy = before.enemies.find((piece) => same(piece.position, target));
        const capturedNode = targetEnemy ? this.pieceLayer?.getChildByName(`Enemy-${targetEnemy.id}`) : undefined;
        const result = this.model.movePlayer(target);
        // 先保存逻辑快照，再播放移动/吃子动画；进程在动画期间退出也不会回退棋局。
        this.persistProgress(false);
        // 普通吃子音效保留为基础反馈；连斩里程碑音效在对应连斩特效出现时额外播放。
        this.playSound(result.captured ? 'playerCapture' : 'playerMove');
        this.context?.services.feedback.vibrate(result.captured ? 'medium' : 'light');

        if (playerNode) {
            const point = this.boardPoint(target);
            await this.tweenNode(playerNode, MOVE_DURATION, { position: new Vec3(point.x, point.y, 0) }, 'quadOut');
        } else {
            await this.waitSeconds(MOVE_DURATION);
        }
        if (!this.isOperationCurrent(generation)) return;
        if (capturedNode) await this.animateCapture(capturedNode, result.captured);
        if (!this.isOperationCurrent(generation)) return;
        if (result.crossSlashKills.length > 0 || before.pendingCrossSlash) {
            await this.showCrossSlash(
                result.crossSlashKills,
                result.crossSlashKills.reduce((sum, record) => sum + record.score, 0),
            );
        }
        if (!this.isOperationCurrent(generation)) return;
        this.renderAll();
        if (result.combo >= 2) {
            this.playComboMilestoneSound(result.combo);
            this.showComboVfx(result.combo);
        }
        if (result.generalKilled) await this.showGeneralKillMoment();
        if (!this.isOperationCurrent(generation)) return;
        if (result.immediateSpawned.length > 0) {
            this.playSound('reinforcementDrop');
            await this.animateSpawns(result.immediateSpawned, result.immediateReinforcementKind === 'general');
            if (!this.isOperationCurrent(generation)) return;
            if (result.immediateReinforcementKind === 'general') await this.showGeneralArrival();
            if (!this.isOperationCurrent(generation)) return;
        }
        if (this.model.snapshot.phase === 'reward') {
            await this.showRewardChestSequence();
            if (!this.isOperationCurrent(generation)) return;
            return;
        }
        await this.performEnemyTurn();
    }

    private async performEnemyTurn(): Promise<void> {
        const generation = this.operationGeneration;
        if (!this.isOperationCurrent(generation) || this.model.snapshot.phase !== 'enemy') return;
        await this.waitSeconds(0.1);
        if (!this.isOperationCurrent(generation)) return;
        const before = this.model.snapshot;
        const result = this.model.resolveEnemyTurn();
        // 敌方逻辑结算完成即落盘，后续移动动画不参与存档正确性。
        this.persistProgress(false);
        if (!this.isOperationCurrent(generation)) return;
        if (result.moved) {
            const moving = this.pieceLayer?.getChildByName(`Enemy-${result.moved.pieceId}`);
            this.playSound(result.killedPlayer ? 'playerKilled' : 'enemyMove', result.killedPlayer ? 1 : 0.72);
            if (moving) {
                const point = this.boardPoint(result.moved.to);
                await this.tweenNode(moving, MOVE_DURATION, { position: new Vec3(point.x, point.y, 0) }, 'quadOut');
            } else {
                await this.waitSeconds(MOVE_DURATION);
            }
            if (!this.isOperationCurrent(generation)) return;
        }
        if (result.killedPlayer) {
            await this.animatePlayerDeath();
            if (!this.isOperationCurrent(generation)) return;
            this.renderAll();
            this.showDeathOverlay();
            return;
        }

        this.renderAll();
        if (result.spawned.length > 0) {
            this.playSound('reinforcementDrop');
            await this.animateSpawns(result.spawned, result.reinforcementKind === 'general');
            if (result.reinforcementKind === 'general') {
                await this.showGeneralArrival();
                if (!this.isOperationCurrent(generation)) return;
            }
        } else if (result.enteredWaiting) {
            this.playSound(before.queuedReinforcement.kind === 'general' ? 'generalWait' : 'reinforcementWait', 0.75);
            this.setHint(before.queuedReinforcement.kind === 'general' ? '棋盘拥挤：将军待降' : '棋盘拥挤：本批增援等待入场');
        }
        if (!this.isOperationCurrent(generation)) return;
        this.renderAll();
        this.inputLocked = false;
        this.selectedPlayer = true;
        this.renderAll();
    }

    private async animateCapture(node: Node, record?: KillRecord): Promise<void> {
        if (!record) return;
        const generation = this.operationGeneration;
        const origin = node.position.clone();
        const burst = this.createNode(this.effectLayer ?? this.node, 'CaptureBurst', origin.x, origin.y, 136, 136);
        this.applySprite(burst, 'captureBurst');
        burst.setScale(0.2, 0.2, 1);
        const burstOpacity = burst.addComponent(UIOpacity);
        const chip = this.createNode(this.effectLayer ?? this.node, 'CaptureChip', origin.x, origin.y, 72, 72);
        this.applySprite(chip, 'woodChip');
        chip.setScale(0.4, 0.4, 1);
        const opacity = chip.addComponent(UIOpacity);
        await Promise.all([
            this.tweenNode(node, CAPTURE_DURATION, { scale: new Vec3(1.17, 1.17, 1), angle: 8 }, 'backOut'),
            this.tweenNode(chip, CAPTURE_DURATION, { scale: new Vec3(1, 1, 1), angle: -14 }, 'quadOut'),
            this.tweenNode(burst, CAPTURE_DURATION, { scale: new Vec3(1.18, 1.18, 1), angle: 12 }, 'backOut'),
        ]);
        if (!this.isGenerationCurrent(generation)) {
            if (burst.isValid) burst.destroy();
            if (chip.isValid) chip.destroy();
            return;
        }
        opacity.opacity = 0;
        tween(burstOpacity).to(0.18, { opacity: 0 }).call(() => burst.destroy()).start();
        chip.destroy();
        this.showFloatingText(`+${record.score}`, origin.x, origin.y + 26, COLORS.cinnabar, record.piece.type === 'general' ? 38 : 31);
    }

    private async showCrossSlash(kills: readonly KillRecord[], scoreDelta: number): Promise<void> {
        const layer = this.underPieceEffectLayer;
        if (!layer) return;
        const generation = this.operationGeneration;
        this.duckMusic('crossSlash', 0.55);
        if (kills.length > 1) this.playSound('multiCapture', 0.85);
        const metrics = this.boardMetrics();
        const center = this.boardPoint(this.model.snapshot.playerPosition);
        const horizontal = this.createNode(layer, 'CrossSlashHorizontal', 0, center.y, metrics.width + 46, 86);
        this.applySprite(horizontal, 'crossSlashVfx');
        const vertical = this.createNode(layer, 'CrossSlashVertical', center.x, 0, metrics.height + 46, 86);
        this.applySprite(vertical, 'crossSlashVfx');
        vertical.angle = 90;
        const ring = this.createNode(layer, 'CrossSlashRing', center.x, center.y, 170, 170);
        this.applySprite(ring, 'itemCrossVfx');
        [horizontal, vertical].forEach((slash) => slash.setScale(0.08, 0.72, 1));
        ring.setScale(0.2, 0.2, 1);
        const nodes = [horizontal, vertical, ring];
        nodes.forEach((entry) => {
            const opacity = entry.addComponent(UIOpacity);
            opacity.opacity = 0;
            tween(opacity).to(0.08, { opacity: 255 }).delay(0.25).to(0.18, { opacity: 0 }).start();
        });
        tween(horizontal).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        tween(vertical).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        tween(ring).to(0.24, { scale: new Vec3(1.18, 1.18, 1), angle: 32 }, { easing: 'backOut' }).start();
        kills.forEach((record, index) => {
            this.scheduleOnce(() => {
                if (!this.isGenerationCurrent(generation)) return;
                const point = this.boardPoint(record.piece.position);
                this.spawnParticle('inkParticle', point.x, point.y, 66, index % 2 ? 12 : -12);
            }, 0.2 + index * 0.025);
        });
        if (kills.length > 0) this.showFloatingText(`十字斩 +${scoreDelta}`, center.x, center.y + 55, COLORS.goldLight, 34);
        await this.waitSeconds(CROSS_DURATION);
        nodes.forEach((entry) => entry.isValid && entry.destroy());
    }

    private async showTeleportEffect(from: BoardPosition, to: BoardPosition): Promise<void> {
        const start = this.boardPoint(from);
        const end = this.boardPoint(to);
        await Promise.all([
            this.showBoardVfx('itemTeleportVfx', start.x, start.y, 126, 0.28),
            this.showBoardVfx('itemTeleportVfx', end.x, end.y, 146, 0.34),
        ]);
        await this.waitSeconds(0.25);
    }

    private async animateSpawns(spawned: readonly EnemyPiece[], general: boolean): Promise<void> {
        const generation = this.operationGeneration;
        spawned.forEach((piece, index) => {
            const node = this.pieceLayer?.getChildByName(`Enemy-${piece.id}`);
            if (!node) return;
            node.setScale(0.52, 0.52, 1);
            const point = this.boardPoint(piece.position);
            node.setPosition(point.x, point.y + 92);
            const shadow = this.createNode(this.underPieceEffectLayer ?? this.boardNode ?? this.node, `SpawnShadow-${piece.id}`, point.x, point.y - 15, 94, 52);
            this.applySprite(shadow, 'spawnShadow');
            shadow.setScale(0.35, 0.35, 1);
            const shadowOpacity = shadow.addComponent(UIOpacity);
            shadowOpacity.opacity = 80;
            this.scheduleOnce(() => {
                if (!this.isGenerationCurrent(generation) || !node.isValid) {
                    if (shadow.isValid) shadow.destroy();
                    return;
                }
                tween(node)
                    .to(general && piece.type === 'general' ? 0.34 : 0.27, {
                        position: new Vec3(point.x, point.y, 0),
                        scale: new Vec3(1.08, 0.9, 1),
                    }, { easing: 'quadIn' })
                    .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .start();
                tween(shadow).to(0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
                tween(shadowOpacity).to(0.24, { opacity: 210 }).delay(0.2).to(0.18, { opacity: 0 }).call(() => shadow.destroy()).start();
            }, index * SPAWN_STAGGER);
        });
        await this.waitSeconds(0.28 + spawned.length * SPAWN_STAGGER);
    }

    private async showGeneralArrival(): Promise<void> {
        const generation = this.operationGeneration;
        this.duckMusic('generalArrive', 1.45);
        this.context?.services.feedback.vibrate('heavy');
        await this.showCenterVfx('generalArrivalVfx', '将 军 来 袭', COLORS.goldLight, 0.95, 620, 320, -26);
        if (!this.isGenerationCurrent(generation)) return;
        const general = this.model.snapshot.enemies.find((piece) => piece.type === 'general');
        if (general) {
            const point = this.boardPoint(general.position);
            this.spawnParticle('lightParticle', point.x, point.y, 130, 0);
        }
    }

    private async showGeneralKillMoment(): Promise<void> {
        const generation = this.operationGeneration;
        this.duckMusic('generalKill', 1.0);
        this.context?.services.feedback.vibrate('heavy');
        await this.showCenterVfx('generalKillVfx', '斩 将', COLORS.goldLight, 0.9, 650, 350);
        if (!this.isGenerationCurrent(generation)) return;
    }

    private async animatePlayerDeath(): Promise<void> {
        this.duckMusic('gameOver', 1.1, true);
        const player = this.pieceLayer?.getChildByName('Player');
        if (this.boardNode) {
            const original = this.boardNode.position.clone();
            tween(this.boardNode)
                .by(0.05, { position: new Vec3(3, 0, 0) })
                .by(0.05, { position: new Vec3(-6, 1, 0) })
                .to(0.05, { position: original })
                .start();
        }
        if (player) {
            const opacity = player.addComponent(UIOpacity);
            tween(player).to(0.48, { angle: -18, scale: new Vec3(0.48, 0.48, 1) }, { easing: 'quadIn' }).start();
            tween(opacity).to(0.5, { opacity: 0 }).start();
            const point = player.position;
            this.spawnParticle('woodChip', point.x, point.y, 100, 14);
            this.spawnParticle('inkParticle', point.x, point.y, 100, -14);
        }
        await this.waitSeconds(0.62);
    }

    private showDeathOverlay(): void {
        this.inputLocked = true;
        const context = this.context;
        const ads = context?.services.ads;
        if (!this.model.canRevive
            || !context
            || (ads && !ads.isEnabledForGame(context.gameId))) {
            this.finishRound();
            return;
        }
        const snapshot = this.model.snapshot;
        this.deathOverlay = this.buildModal(
            'DeathOverlay',
            '一步失守',
            '棋局未尽',
            `当前得分 ${snapshot.score}\n复活将回到致死行动前，并自动释放十字斩`,
            [
                { label: '看视频复活', tone: 'cinnabar', action: () => this.handleRevive(), enabled: this.model.canRevive, adIcon: true },
                { label: '结束本局', tone: 'paper', action: () => this.finishRound() },
            ],
            'revive',
        );
    }

    private async handleRevive(): Promise<void> {
        if (!this.model.canRevive || this.reviveAdPending) return;
        const context = this.context;
        const ads = context?.services.ads;
        if (!context
            || (ads && !ads.isEnabledForGame(context.gameId))) {
            this.finishRound();
            return;
        }

        const generation = this.operationGeneration;
        this.reviveAdPending = true;
        this.deathOverlay?.buttons.forEach((button) => {
            button.interactable = false;
        });
        try {
            const adResult = ads
                ? await ads.showRewarded({
                    placement: AD_PLACEMENTS.chessEndlessRevive,
                    gameId: context.gameId,
                    sessionId: context.sessionId,
                })
                : { outcome: 'completed' as const };
            if (!this.isOperationCurrent(generation)) return;
            if (adResult.outcome !== 'completed') {
                this.setHint('视频未完整播放，暂未复活');
                return;
            }
            this.destroyOverlay(this.deathOverlay);
            this.deathOverlay = undefined;
            this.playSound('revive');
            const result = this.model.revive();
            this.persistProgress(false);
            this.renderAll();
            const revivePoint = this.boardPoint(this.model.snapshot.playerPosition);
            this.spawnParticle('lightParticle', revivePoint.x, revivePoint.y, 120, 0);
            await this.showCrossSlash(result.kills, result.scoreDelta);
            if (!this.isOperationCurrent(generation)) return;
            this.renderAll();
            if (this.model.snapshot.phase === 'reward') {
                await this.showRewardChestSequence();
                if (!this.isOperationCurrent(generation)) return;
            } else {
                this.inputLocked = false;
                this.selectedPlayer = true;
                this.renderAll();
            }
        } finally {
            this.reviveAdPending = false;
            if (this.isOperationCurrent(generation) && this.deathOverlay?.root.isValid) {
                this.deathOverlay.buttons.forEach((button) => {
                    button.interactable = true;
                });
            }
        }
    }

    private async showRewardChestSequence(): Promise<void> {
        if (this.model.snapshot.pendingRewardChoices.length === 0) return;
        const generation = this.operationGeneration;
        this.inputLocked = true;
        this.playSound('rewardOpen');
        const overlay = this.createOverlayRoot('RewardOverlay');
        const safeRect = this.resolveSafeContentRect();
        this.rewardOverlay = { root: overlay, buttons: [] };
        const closed = this.createNode(overlay, 'ChestClosed', safeRect.x, safeRect.y - 40, 320, 260);
        this.applySprite(closed, 'rewardChestClosed');
        closed.setScale(0.2, 0.2, 1);
        await this.tweenNode(closed, 0.3, { scale: new Vec3(1, 1, 1) }, 'backOut');
        if (!this.isOperationCurrent(generation)) {
            this.cancelRewardSequence(overlay);
            return;
        }
        await this.waitSeconds(0.16);
        if (!this.isOperationCurrent(generation)) {
            this.cancelRewardSequence(overlay);
            return;
        }
        const open = this.createNode(overlay, 'ChestOpen', safeRect.x, safeRect.y - 30, 350, 285);
        this.applySprite(open, 'rewardChestOpen');
        closed.destroy();
        for (let index = 0; index < 8; index += 1) {
            this.spawnScreenParticle(overlay, 'lightParticle', (index - 3.5) * 42, 28 + (index % 2) * 30, 48 + index * 3, index * 17);
        }
        await this.waitSeconds(0.38);
        if (!this.isOperationCurrent(generation)) {
            this.cancelRewardSequence(overlay);
            return;
        }
        this.buildRewardPanel(overlay, true);
        await this.waitSeconds(0.34);
        if (!this.isOperationCurrent(generation)) return;
        if (open.isValid) open.destroy();
    }

    private showRewardOverlay(): void {
        if (this.model.snapshot.pendingRewardChoices.length === 0) return;
        this.inputLocked = true;
        const overlay = this.createOverlayRoot('RewardOverlay');
        this.rewardOverlay = { root: overlay, buttons: [] };
        this.buildRewardPanel(overlay, false);
    }

    private cancelRewardSequence(overlay: Node): void {
        if (this.rewardOverlay?.root !== overlay) return;
        this.destroyOverlay(this.rewardOverlay);
        this.rewardOverlay = undefined;
        this.rewardCardNodes.clear();
    }

    private buildRewardPanel(overlay: Node, animateFromChest: boolean): void {
        const choices = this.model.snapshot.pendingRewardChoices;
        const safeRect = this.resolveSafeContentRect();
        const cardWidth = choices.length >= 3 ? 156 : 168;
        const cardHeight = Math.round(cardWidth * (430 / 300));
        const cardEdgeGap = choices.length >= 3 ? 10 : 16;
        const cardGap = choices.length <= 1 ? 0 : cardWidth + cardEdgeGap;
        const cardRowWidth = choices.length <= 1 ? cardWidth : (choices.length - 1) * cardGap + cardWidth;
        const cardRowHeight = cardHeight + 24;
        const headerHeight = 144;
        const cardsTopGap = 18;
        const bottomPadding = 22;
        const panelSize = resolveChessEndlessModalPanelSize(
            cardRowWidth,
            headerHeight + cardsTopGap + cardRowHeight + bottomPadding,
            safeRect,
        );
        const content = chessEndlessModalContentRect(panelSize.width, panelSize.height);
        const panel = this.createNode(overlay, 'Panel', safeRect.x, safeRect.y + 20, panelSize.width, panelSize.height);
        this.applySprite(panel, 'modalPanel');
        if (animateFromChest) {
            panel.setPosition(safeRect.x, safeRect.y - 44);
            panel.setScale(0.12, 0.12, 1);
            tween(panel).to(0.34, { position: new Vec3(safeRect.x, safeRect.y + 20, 0), scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        let cursorY = content.top - 18;
        this.createLabel(panel, 'Kicker', '斩将奖励', 0, cursorY, 22, COLORS.cinnabar, content.width - 24, 32);
        cursorY -= 42;
        this.createLabel(panel, 'Title', '择一道具', 0, cursorY, 40, COLORS.ink, content.width - 24, 56);
        cursorY -= 50;
        this.createLabel(panel, 'Description', '每种最多持有 2 件 · 点 ? 查看说明', 0, cursorY, 22, COLORS.muted, content.width - 24, 34);
        const cardCenterY = cursorY - 16 - cardsTopGap - cardHeight / 2;
        this.rewardCardNodes.clear();
        choices.forEach((item, index) => {
            const x = (index - (choices.length - 1) / 2) * cardGap;
            const card = this.createNode(panel, `Reward-${item}`, x, cardCenterY, cardWidth, cardHeight);
            this.applySprite(card, 'rewardCard');
            this.rewardCardNodes.set(item, card);
            const iconSize = Math.round(cardWidth * 0.58);
            const icon = this.createNode(card, 'Icon', 0, cardHeight * 0.17, iconSize, iconSize);
            this.applySprite(icon, ITEM_ICON_KEY[item]);
            this.createLabel(card, 'Name', ITEM_DISPLAY[item], 0, -cardHeight * 0.08, 24, COLORS.ink, cardWidth - 18, 38);
            const count = this.model.snapshot.inventory[item];
            this.createLabel(card, 'Count', `持有 ${count} / 2`, 0, -cardHeight * 0.28, 20, COLORS.jade, cardWidth - 18, 30);
            const help = this.createNode(card, 'Help', cardWidth * 0.31, cardHeight * 0.34, 32, 32);
            this.applySprite(help, 'helpIcon');
            help.addComponent(Button);
            help.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.showItemHelp(item, true);
            }, this);
            const button = card.addComponent(Button);
            card.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                void this.chooseReward(item);
            }, this);
            this.rewardOverlay?.buttons.push(button);
        });
    }

    private async chooseReward(item: ItemType): Promise<void> {
        const generation = this.operationGeneration;
        const overlay = this.rewardOverlay?.root;
        this.model.chooseReward(item);
        this.persistProgress(false);
        this.playSound('itemSelect');
        const panel = overlay?.getChildByName('Panel');
        if (panel) {
            const opacity = panel.addComponent(UIOpacity);
            tween(opacity).to(0.22, { opacity: 0 }).start();
            await this.tweenNode(panel, 0.24, { scale: new Vec3(0.08, 0.08, 1), position: new Vec3(0, -70, 0) }, 'quadIn');
        }
        if (!this.isOperationCurrent(generation)) return;
        this.playSound('rewardClose', 0.72);
        this.destroyOverlay(this.rewardOverlay);
        this.rewardOverlay = undefined;
        this.rewardCardNodes.clear();
        this.renderAll();
        if (this.model.snapshot.phase === 'enemy') await this.performEnemyTurn();
        else {
            this.inputLocked = false;
            this.selectedPlayer = true;
            this.renderAll();
        }
    }

    private resumeCurrentPhase(): void {
        if (this.lifecycle !== 'playing') return;
        const phase = this.model.snapshot.phase;
        if (phase !== 'reward' && this.rewardOverlay) {
            this.destroyOverlay(this.rewardOverlay);
            this.rewardOverlay = undefined;
            this.rewardCardNodes.clear();
        }
        if (phase !== 'dead' && this.deathOverlay) {
            this.destroyOverlay(this.deathOverlay);
            this.deathOverlay = undefined;
        }
        if (phase === 'enemy') {
            this.inputLocked = true;
            void this.performEnemyTurn();
            return;
        }
        if (phase === 'reward') {
            this.inputLocked = true;
            if (!this.rewardOverlay) this.showRewardOverlay();
            return;
        }
        if (phase === 'dead') {
            this.inputLocked = true;
            if (!this.deathOverlay) this.showDeathOverlay();
            return;
        }
        if (phase === 'ended') return;

        this.inputLocked = false;
        this.selectedPlayer = true;
        this.renderAll();
        if (this.model.snapshot.pendingCrossSlash) {
            this.setHint('十字斩已蓄势，将在本次正常移动结束后释放');
        }
    }

    private isOperationCurrent(generation: number): boolean {
        return this.lifecycle === 'playing'
            && this.operationGeneration === generation
            && this.node.isValid;
    }

    private isGenerationCurrent(generation: number): boolean {
        return this.operationGeneration === generation
            && this.lifecycle !== 'disposed'
            && this.node.isValid;
    }

    private finishRound(): void {
        if (this.lifecycle === 'completed' || this.lifecycle === 'disposed') return;
        this.operationGeneration += 1;
        this.model.endGame();
        const snapshot = this.model.snapshot;
        const newRecord = snapshot.score > this.bestScore;
        this.bestScore = Math.max(this.bestScore, snapshot.score);
        this.persistProgress(true);
        this.lifecycle = 'completed';
        this.inputLocked = true;
        this.context?.services.audio.pauseMusic();
        this.destroyOverlay(this.deathOverlay);
        this.deathOverlay = undefined;
        this.context?.requestExit(Object.freeze({
            score: snapshot.score,
            duration: Math.max(0, (Date.now() - this.roundStartedAt) / 1000),
            completed: true,
            extra: Object.freeze({
                turns: snapshot.turnNumber,
                generalKills: snapshot.generalKills,
                maxCombo: snapshot.maxCombo,
                totalKills: snapshot.totalKills,
                newRecord,
                seed: snapshot.seed,
            }),
        }));
    }

    private showRules(): void {
        if (this.inputLocked) return;
        this.playSound('uiPopup', 0.7);
        this.inputLocked = true;
        this.rulesPageIndex = 0;
        this.showRulesPage();
    }

    private showRulesPage(): void {
        this.destroyOverlay(this.rulesOverlay);
        const page = RULE_PAGES[this.rulesPageIndex]!;
        const overlay = this.createOverlayRoot('RulesOverlay');
        const safeRect = this.resolveSafeContentRect();
        const footerHeight = 148;
        const headerHeight = 144;
        const panelSize = resolveChessEndlessModalPanelSize(520, headerHeight + footerHeight + 320, safeRect);
        const content = chessEndlessModalContentRect(panelSize.width, panelSize.height);
        const panel = this.createNode(overlay, 'Panel', safeRect.x, safeRect.y, panelSize.width, panelSize.height);
        this.applySprite(panel, 'modalPanel');
        let cursorY = content.top - 18;
        this.createLabel(panel, 'Kicker', '入局须知', 0, cursorY, 22, COLORS.cinnabar, content.width - 24, 32);
        cursorY -= 42;
        this.createLabel(panel, 'Title', page.title, 0, cursorY, 38, COLORS.ink, content.width - 24, 54);
        cursorY -= 48;
        this.createLabel(panel, 'Pager', `${this.rulesPageIndex + 1} / ${RULE_PAGES.length}`, 0, cursorY, 20, COLORS.muted, 180, 28);

        const buttonWidth = Math.min(220, (content.width - 36) / 2);
        const buttonHeight = 62;
        const buttonY = content.bottom + 66;
        const viewportWidth = content.width - 8;
        const viewportTop = cursorY - 14;
        const viewportBottom = buttonY + 44;
        const viewportHeight = Math.max(180, viewportTop - viewportBottom);
        const viewportCenterY = (viewportTop + viewportBottom) / 2;
        const viewport = this.createNode(panel, 'ScrollViewport', 0, viewportCenterY, viewportWidth, viewportHeight);
        const maskGraphics = viewport.addComponent(Graphics);
        maskGraphics.fillColor = Color.WHITE;
        maskGraphics.roundRect(-viewportWidth / 2, -viewportHeight / 2, viewportWidth, viewportHeight, 14);
        maskGraphics.fill();
        const mask = viewport.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;

        const bodyLineHeight = 35;
        const bodyTextWidth = viewportWidth - 36;
        const bodyHeight = this.estimateScrollTextHeight(page.body, 24, bodyTextWidth, bodyLineHeight, viewportHeight + 12);
        const body = this.createNode(viewport, 'ScrollBody', 0, viewportHeight / 2, viewportWidth - 20, bodyHeight);
        body.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        const label = this.createLabel(body, 'Body', page.body, 0, -14, 24, COLORS.inkSoft, bodyTextWidth, bodyHeight - 28);
        label.verticalAlign = 0;
        label.horizontalAlign = 0;
        label.overflow = Label.Overflow.CLAMP;
        label.lineHeight = bodyLineHeight;
        label.node.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        label.node.setPosition(0, -14);

        const scrollView = viewport.addComponent(ScrollView);
        scrollView.content = body;
        scrollView.horizontal = false;
        scrollView.vertical = true;
        scrollView.inertia = true;
        scrollView.brake = 0.75;
        scrollView.elastic = true;
        scrollView.cancelInnerEvents = true;

        let swipeStartX = 0;
        let swipeStartY = 0;
        panel.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const point = event.getUILocation();
            swipeStartX = point.x;
            swipeStartY = point.y;
        }, this, true);
        panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            const point = event.getUILocation();
            const dx = point.x - swipeStartX;
            const dy = point.y - swipeStartY;
            if (Math.abs(dx) > 78 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                this.rulesPageIndex = (this.rulesPageIndex + (dx < 0 ? 1 : RULE_PAGES.length - 1)) % RULE_PAGES.length;
                this.showRulesPage();
            }
        }, this, true);

        const previous = this.createActionButton(panel, 'Previous', '‹ 上一页', -buttonWidth / 2 - 10, buttonY, buttonWidth, buttonHeight, 'paper', () => {
            this.rulesPageIndex = (this.rulesPageIndex + RULE_PAGES.length - 1) % RULE_PAGES.length;
            this.showRulesPage();
        });
        const next = this.createActionButton(panel, 'Next', '下一页 ›', buttonWidth / 2 + 10, buttonY, buttonWidth, buttonHeight, 'paper', () => {
            this.rulesPageIndex = (this.rulesPageIndex + 1) % RULE_PAGES.length;
            this.showRulesPage();
        });
        const closeSize = 52;
        const close = this.createImageButtonOn(
            panel,
            'Close',
            'closeIcon',
            content.width / 2 - closeSize / 2 - 7,
            content.top - 36,
            closeSize,
            () => {
                this.destroyOverlay(this.rulesOverlay);
                this.rulesOverlay = undefined;
                this.inputLocked = false;
                this.selectedPlayer = true;
                this.renderAll();
            },
        );
        this.rulesOverlay = { root: overlay, buttons: [previous, next, close] };
    }

    private showPieceInfo(type: EnemyPieceType): void {
        if (this.infoOverlay) return;
        this.inputLocked = true;
        this.playSound('uiPopup', 0.68);
        this.infoOverlay = this.buildModal('PieceInfoOverlay', '敌棋走法', PIECE_DISPLAY[type], PIECE_RULES[type], [{
            label: '知道了', tone: 'jade', action: () => {
                this.destroyOverlay(this.infoOverlay);
                this.infoOverlay = undefined;
                this.inputLocked = false;
                this.selectedPlayer = true;
                this.renderAll();
            },
        }], PIECE_TEXTURE_KEY[type]);
    }

    private showItemHelp(type: ItemType, keepLocked = false): void {
        if (this.infoOverlay) return;
        const wasLocked = this.inputLocked;
        this.inputLocked = true;
        this.playSound('itemHelp', 0.66);
        this.infoOverlay = this.buildModal('ItemHelpOverlay', '道具说明', ITEM_DISPLAY[type], ITEM_DESCRIPTIONS[type], [{
            label: '知道了', tone: 'jade', action: () => {
                this.destroyOverlay(this.infoOverlay);
                this.infoOverlay = undefined;
                this.inputLocked = keepLocked ? true : wasLocked;
                if (!this.inputLocked) {
                    this.selectedPlayer = true;
                    this.renderAll();
                }
            },
        }], ITEM_ICON_KEY[type]);
    }

    private buildModal(
        name: string,
        kicker: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
        artKey?: string,
    ): OverlayState {
        const overlay = this.createOverlayRoot(name);
        const safeRect = this.resolveSafeContentRect();
        const bodyLineHeight = 36;
        const bodyFontSize = 26;
        const headerHeight = artKey ? 204 : 118;
        const buttonHeight = 64;
        const buttonGap = 14;
        const footerHeight = actions.length * buttonHeight + Math.max(0, actions.length - 1) * buttonGap + 32;
        const innerWidth = 504;
        const panelSize = resolveChessEndlessModalPanelSize(
            innerWidth,
            headerHeight + 84 + footerHeight,
            safeRect,
        );
        const content = chessEndlessModalContentRect(panelSize.width, panelSize.height);
        const panel = this.createNode(overlay, 'Panel', safeRect.x, safeRect.y, panelSize.width, panelSize.height);
        this.applySprite(panel, 'modalPanel');

        let cursorY = content.top - 18;
        if (artKey) {
            const artSize = 96;
            const art = this.createNode(panel, 'Artwork', 0, cursorY - artSize / 2 + 6, artSize, artSize);
            this.applySprite(art, artKey);
            cursorY -= artSize + 14;
        }
        this.createLabel(panel, 'Kicker', kicker, 0, cursorY, 22, COLORS.cinnabar, content.width - 24, 32);
        cursorY -= 42;
        this.createLabel(panel, 'Title', title, 0, cursorY, 40, COLORS.ink, content.width - 24, 56);
        cursorY -= 58;
        const bodyLabel = this.createLabel(
            panel,
            'Body',
            body,
            0,
            cursorY + 8,
            bodyFontSize,
            COLORS.inkSoft,
            content.width - 24,
            1,
        );
        const bodyTransform = bodyLabel.node.getComponent(UITransform)!;
        bodyTransform.setAnchorPoint(0.5, 1);
        bodyLabel.verticalAlign = 0;
        bodyLabel.horizontalAlign = 1;
        bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        bodyLabel.enableWrapText = true;
        bodyLabel.lineHeight = bodyLineHeight;
        bodyLabel.updateRenderData(true);

        const buttons: Button[] = [];
        actions.forEach((action, index) => {
            const y = content.bottom + 38 + (actions.length - 1 - index) * (buttonHeight + buttonGap);
            const button = this.createActionButton(
                panel,
                `Action-${index}`,
                action.label,
                0,
                y,
                content.width - 16,
                buttonHeight,
                action.tone,
                action.action,
                action.adIcon === true,
            );
            button.interactable = action.enabled !== false;
            if (!button.interactable) button.node.getComponent(UIOpacity)!.opacity = 100;
            buttons.push(button);
        });
        return { root: overlay, buttons };
    }

    private buildPauseModal(score: number, model: MiniGamePauseModel): OverlayState {
        const overlay = this.createOverlayRoot('PauseOverlay');
        const safeRect = this.resolveSafeContentRect();
        const body = `当前得分 ${score}\n增援与棋局都已冻结`;
        const actions: readonly OverlayAction[] = [
            { label: '继续棋局', tone: 'jade', action: model.resume },
            { label: '重新开始', tone: 'cinnabar', action: model.restart },
            { label: '返回游戏大厅', tone: 'paper', action: model.exit },
        ];
        const bodyLineHeight = 36;
        const bodyFontSize = 26;
        const toggleRowHeight = 56;
        const copyGap = 14;
        const headerHeight = 118;
        const buttonHeight = 64;
        const buttonGap = 14;
        const footerHeight = actions.length * buttonHeight
            + Math.max(0, actions.length - 1) * buttonGap
            + 32;
        const innerWidth = 504;
        const panelSize = resolveChessEndlessModalPanelSize(
            innerWidth,
            headerHeight + 84 + copyGap + toggleRowHeight + footerHeight,
            safeRect,
        );
        const content = chessEndlessModalContentRect(panelSize.width, panelSize.height);
        const panel = this.createNode(overlay, 'Panel', safeRect.x, safeRect.y, panelSize.width, panelSize.height);
        this.applySprite(panel, 'modalPanel');

        let cursorY = content.top - 18;
        this.createLabel(panel, 'Kicker', '棋局暂歇', 0, cursorY, 22, COLORS.cinnabar, content.width - 24, 32);
        cursorY -= 42;
        this.createLabel(panel, 'Title', '暂停', 0, cursorY, 40, COLORS.ink, content.width - 24, 56);
        cursorY -= 58;
        const bodyLabel = this.createLabel(
            panel,
            'Body',
            body,
            0,
            cursorY + 8,
            bodyFontSize,
            COLORS.inkSoft,
            content.width - 24,
            1,
        );
        const bodyTransform = bodyLabel.node.getComponent(UITransform)!;
        bodyTransform.setAnchorPoint(0.5, 1);
        bodyLabel.verticalAlign = 0;
        bodyLabel.horizontalAlign = 1;
        bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        bodyLabel.enableWrapText = true;
        bodyLabel.lineHeight = bodyLineHeight;
        bodyLabel.updateRenderData(true);

        const bodyBottomY = bodyLabel.node.position.y - bodyTransform.contentSize.height;
        const toggleY = bodyBottomY - copyGap - toggleRowHeight / 2;
        const toggle = this.createToggleSwitch(
            panel,
            'DangerHintsToggle',
            0,
            toggleY,
            content.width - 16,
            toggleRowHeight,
            '危险点提示',
            this.dangerHintsEnabled,
            (enabled) => {
                this.dangerHintsEnabled = enabled;
                this.persistProgress(false);
                this.renderAll();
            },
        );

        const buttons: Button[] = [toggle];
        actions.forEach((action, index) => {
            const y = content.bottom + 38 + (actions.length - 1 - index) * (buttonHeight + buttonGap);
            const button = this.createActionButton(
                panel,
                `Action-${index}`,
                action.label,
                0,
                y,
                content.width - 16,
                buttonHeight,
                action.tone,
                action.action,
            );
            buttons.push(button);
        });
        return { root: overlay, buttons };
    }

    private createToggleSwitch(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        enabled: boolean,
        onChange: (enabled: boolean) => void,
    ): Button {
        const row = this.createNode(parent, name, x, y, width, height);
        const rowGraphics = row.addComponent(Graphics);
        rowGraphics.fillColor = new Color(236, 218, 178, 210);
        rowGraphics.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 150);
        rowGraphics.lineWidth = 1.5;
        rowGraphics.roundRect(-width / 2, -height / 2, width, height, 8);
        rowGraphics.fill();
        rowGraphics.stroke();

        const switchWidth = 68;
        const switchHeight = 34;
        const labelWidth = width - 108;
        const labelNode = this.createLabel(
            row,
            'Label',
            label,
            -width / 2 + 14 + labelWidth / 2,
            0,
            22,
            COLORS.ink,
            labelWidth,
            switchHeight,
        );
        labelNode.horizontalAlign = 0;
        labelNode.verticalAlign = 1;

        const switchNode = this.createNode(
            row,
            'Switch',
            width / 2 - switchWidth / 2 - 12,
            0,
            switchWidth,
            switchHeight,
        );
        const track = switchNode.addComponent(Graphics);
        const thumbNode = this.createNode(switchNode, 'Thumb', 0, 0, 28, 28);
        const thumb = thumbNode.addComponent(Graphics);
        let current = enabled;
        const refresh = (on: boolean, animate = false) => {
            current = on;
            track.clear();
            track.fillColor = on ? COLORS.jade : new Color(188, 171, 142, 255);
            track.roundRect(-switchWidth / 2, -switchHeight / 2, switchWidth, switchHeight, switchHeight / 2);
            track.fill();
            track.strokeColor = new Color(COLORS.ink.r, COLORS.ink.g, COLORS.ink.b, on ? 70 : 45);
            track.lineWidth = 1.5;
            track.stroke();
            thumb.clear();
            thumb.fillColor = COLORS.white;
            thumb.circle(0, 0, 12);
            thumb.fill();
            thumb.strokeColor = new Color(COLORS.woodDark.r, COLORS.woodDark.g, COLORS.woodDark.b, 55);
            thumb.lineWidth = 1;
            thumb.stroke();
            const targetX = on ? switchWidth / 2 - 18 : -switchWidth / 2 + 18;
            Tween.stopAllByTarget(thumbNode);
            if (animate) {
                tween(thumbNode).to(0.16, { position: new Vec3(targetX, 0, 0) }, { easing: 'quadOut' }).start();
            } else {
                thumbNode.setPosition(targetX, 0);
            }
        };
        refresh(enabled);

        const button = row.addComponent(Button);
        row.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            const next = !current;
            refresh(next, true);
            this.playSound('uiClick', 0.58);
            onChange(next);
        }, this);
        return button;
    }

    private estimateScrollTextHeight(
        text: string,
        fontSize: number,
        width: number,
        lineHeight: number,
        minHeight: number,
    ): number {
        const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.92)));
        const wrappedLines = text.split('\n').reduce((total, line) => (
            total + Math.max(1, Math.ceil(line.length / charsPerLine))
        ), 0);
        return Math.max(minHeight, wrappedLines * lineHeight + 28);
    }

    private resolveSafeContentRect(): {
        readonly width: number;
        readonly height: number;
        readonly x: number;
        readonly y: number;
    } {
        const metrics = this.layout?.getMetrics();
        if (metrics) {
            return Object.freeze({
                width: metrics.contentWidth,
                height: Math.max(1, metrics.height - metrics.safeTop - metrics.safeBottom),
                x: metrics.contentX,
                y: (metrics.safeBottom - metrics.safeTop) / 2,
            });
        }

        const viewport = readChessEndlessViewport(this.node);
        return Object.freeze({
            width: viewport.width,
            height: Math.max(1, viewport.height - viewport.safeTop - viewport.safeBottom),
            x: 0,
            y: (viewport.safeBottom - viewport.safeTop) / 2,
        });
    }

    private resolveFullscreenOverlaySize(): { readonly width: number; readonly height: number } {
        const metrics = this.layout?.getMetrics();
        if (metrics) {
            return Object.freeze({
                width: metrics.width,
                height: metrics.height,
            });
        }
        const viewport = readChessEndlessViewport(this.node);
        return Object.freeze({
            width: viewport.width,
            height: viewport.height,
        });
    }

    private createOverlayRoot(name: string): Node {
        const size = this.resolveFullscreenOverlaySize();
        const overlay = this.createNode(this.node, name, 0, 0, size.width, size.height);
        overlay.setSiblingIndex(this.node.children.length - 1);
        overlay.addComponent(BlockInputEvents);
        const graphics = overlay.addComponent(Graphics);
        graphics.fillColor = COLORS.overlay;
        graphics.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        graphics.fill();
        return overlay;
    }

    private createActionButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tone: OverlayAction['tone'],
        action: OverlayAction['action'],
        showAdIcon = false,
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        const graphics = node.addComponent(Graphics);
        const fill = tone === 'jade' ? COLORS.ink : tone === 'cinnabar' ? COLORS.cinnabar : new Color(236, 218, 178, 255);
        const textColor = tone === 'paper' ? COLORS.ink : COLORS.goldLight;
        graphics.fillColor = fill;
        graphics.strokeColor = tone === 'paper' ? COLORS.gold : new Color(255, 234, 183, 90);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -height / 2, width, height, 7);
        graphics.fill();
        graphics.stroke();
        const iconHeight = Math.min(40, height - 18);
        const iconWidth = iconHeight * CHESS_REWARDED_VIDEO_ICON_ASPECT;
        this.createLabel(
            node,
            'Label',
            text,
            0,
            0,
            24,
            textColor,
            width - 28,
            height - 8,
        );
        const label = node.getChildByName('Label')?.getComponent(Label);
        if (showAdIcon && label) {
            const icon = attachChessRewardedVideoIcon(
                node,
                this.frames.get('rewardedVideoIcon'),
                0,
                0,
                iconWidth,
                iconHeight,
            );
            layoutChessRewardedVideoIconBeforeLabel(
                icon,
                label,
                text,
                24,
                iconWidth,
                iconHeight,
                width,
                4,
            );
        }
        const opacity = node.addComponent(UIOpacity);
        const button = node.addComponent(Button);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            if (!button.interactable) return;
            this.playSound('uiClick', 0.64);
            void action();
        }, this);
        opacity.opacity = 255;
        return button;
    }

    private createRoundButton(name: string, label: string, x: number, y: number, action: () => void): Button {
        const node = this.createNode(this.node, name, x, y, 62, 62);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(244, 232, 201, 226);
        graphics.strokeColor = new Color(COLORS.ink.r, COLORS.ink.g, COLORS.ink.b, 115);
        graphics.lineWidth = 2;
        graphics.circle(0, 0, 29);
        graphics.fill();
        graphics.stroke();
        this.createLabel(node, 'Label', label, 0, 1, 23, COLORS.ink, 54, 50);
        const button = node.addComponent(Button);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            action();
        }, this);
        return button;
    }

    private createImageButton(name: string, key: string, x: number, y: number, size: number, action: () => void): Button {
        return this.createImageButtonOn(this.node, name, key, x, y, size, action);
    }

    private createImageButtonOn(parent: Node, name: string, key: string, x: number, y: number, size: number, action: () => void): Button {
        const node = this.createNode(parent, name, x, y, size, size);
        this.applySprite(node, key);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.93;
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            action();
        }, this);
        return button;
    }

    private drawPanel(node: Node, fill: Color, stroke: Color, radius: number): void {
        const size = node.getComponent(UITransform)!.contentSize;
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = fill;
        graphics.strokeColor = stroke;
        graphics.lineWidth = 3;
        graphics.roundRect(-size.width / 2, -size.height / 2, size.width, size.height, radius);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.woodDark.r, COLORS.woodDark.g, COLORS.woodDark.b, 48);
        graphics.lineWidth = 1;
        graphics.roundRect(-size.width / 2 + 9, -size.height / 2 + 9, size.width - 18, size.height - 18, Math.max(3, radius - 7));
        graphics.stroke();
    }

    private async showCenterVfx(
        key: string,
        text: string,
        color: Color,
        duration: number,
        width: number,
        height: number,
        textYOffset = 0,
    ): Promise<void> {
        const node = this.createNode(this.node, `CenterVfx-${key}`, 0, 24, width, height);
        this.applySprite(node, key);
        node.setScale(0.35, 0.35, 1);
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        const label = this.createLabel(node, 'Label', text, 0, textYOffset, 48, color, width - 110, 90);
        label.isBold = true;
        const outline = label.node.addComponent(LabelOutline);
        outline.color = VFX_TEXT_OUTLINE;
        outline.width = 2;
        tween(opacity).to(0.14, { opacity: 255 }).delay(Math.max(0.08, duration - 0.32)).to(0.18, { opacity: 0 }).start();
        await this.tweenNode(node, 0.22, { scale: new Vec3(1, 1, 1) }, 'backOut');
        await this.waitSeconds(Math.max(0.12, duration - 0.22));
        if (node.isValid) node.destroy();
    }

    private showComboVfx(combo: number): void {
        const safeRect = this.resolveSafeContentRect();
        const width = Math.max(1, Math.min(560, safeRect.width - 32));
        const tier = Math.min(combo, 5);
        const finalScale = tier === 2 ? 0.86 : tier === 3 ? 0.94 : 1;
        const fontSize = tier === 2 ? 38 : tier === 3 ? 42 : 46;
        const node = this.createNode(this.node, `ComboVfx-${combo}`, safeRect.x, safeRect.y + 78, width, 220);
        this.applySprite(node, 'comboBurst');
        node.setScale(finalScale * 0.34, finalScale * 0.34, 1);
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        const label = this.createLabel(node, 'Label', `连斩 ×${combo}`, 0, 0, fontSize, COLORS.goldLight, width - 100, 74);
        label.isBold = true;
        const outline = label.node.addComponent(LabelOutline);
        outline.color = VFX_TEXT_OUTLINE;
        outline.width = 2;
        tween(node)
            .to(0.2, { scale: new Vec3(finalScale, finalScale, 1), angle: combo % 2 ? 1.5 : -1.5 }, { easing: 'backOut' })
            .delay(0.56)
            .to(0.18, { scale: new Vec3(finalScale * 0.78, finalScale * 0.78, 1) })
            .start();
        tween(opacity)
            .to(0.1, { opacity: 255 })
            .delay(0.7)
            .to(0.16, { opacity: 0 })
            .call(() => node.destroy())
            .start();
    }

    private showTransientBanner(text: string, y: number, fontSize: number, color: Color, duration: number): void {
        const rootWidth = this.node.getComponent(UITransform)?.contentSize.width ?? 750;
        const width = Math.max(1, Math.min(590, rootWidth - 32));
        const node = this.createNode(this.node, `Banner-${Date.now()}`, 0, y, width, 58);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(14, 43, 37, 218);
        graphics.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 130);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -29, width, 58, 20);
        graphics.fill();
        graphics.stroke();
        this.createLabel(node, 'Label', text, 0, 0, fontSize, color, width - 36, 48);
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(0.86, 0.86, 1);
        tween(node).to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(opacity).to(0.1, { opacity: 255 }).delay(Math.max(0.1, duration - 0.24)).to(0.14, { opacity: 0 }).call(() => node.destroy()).start();
    }

    private showBoardVfx(key: string, x: number, y: number, size: number, duration: number): Promise<void> {
        const layer = this.effectLayer ?? this.node;
        const node = this.createNode(layer, `BoardVfx-${key}`, x, y, size, size);
        this.applySprite(node, key);
        node.setScale(0.2, 0.2, 1);
        const opacity = node.addComponent(UIOpacity);
        return new Promise((resolve) => {
            tween(node).to(duration * 0.55, { scale: new Vec3(1.12, 1.12, 1), angle: 28 }, { easing: 'backOut' }).to(duration * 0.45, { scale: new Vec3(1.3, 1.3, 1), angle: 48 }).start();
            tween(opacity).delay(duration * 0.55).to(duration * 0.45, { opacity: 0 }).call(() => {
                if (node.isValid) node.destroy();
                resolve();
            }).start();
        });
    }

    private showItemEffect(item: ItemType, target: BoardPosition): Promise<void> {
        const key: Readonly<Record<ItemType, string>> = {
            crossSlash: 'itemCrossVfx',
            freeze: 'itemFreezeVfx',
            delay: 'itemDelayVfx',
            banish: 'itemBanishVfx',
            teleport: 'itemTeleportVfx',
        };
        const point = this.boardPoint(target);
        return this.showBoardVfx(key[item], point.x, point.y, item === 'banish' ? 166 : 142, item === 'banish' ? 0.48 : 0.36);
    }

    private spawnScreenParticle(parent: Node, key: string, x: number, y: number, size: number, angle: number): void {
        const node = this.createNode(parent, `ScreenParticle-${key}`, x, y, size, size);
        this.applySprite(node, key);
        node.angle = angle;
        node.setScale(0.2, 0.2, 1);
        const opacity = node.addComponent(UIOpacity);
        tween(node).to(0.22, { scale: new Vec3(1.05, 1.05, 1), position: new Vec3(x + Math.sin(angle) * 44, y + 54, 0) }, { easing: 'backOut' }).start();
        tween(opacity).delay(0.18).to(0.26, { opacity: 0 }).call(() => node.destroy()).start();
    }

    private showCallout(text: string, color: Color, fontSize: number, duration: number): void {
        const safeRect = this.resolveSafeContentRect();
        const calloutWidth = Math.max(1, Math.min(560, safeRect.width - 32));
        const calloutY = safeRect.y + safeRect.height / 2 - 180;
        const node = this.createNode(this.node, `Callout-${text}`, safeRect.x, calloutY, calloutWidth, 90);
        const label = this.createLabel(node, 'Label', text, 0, 0, fontSize, color, calloutWidth, 80);
        label.isBold = true;
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(0.72, 0.72, 1);
        tween(opacity).to(0.12, { opacity: 255 }).delay(Math.max(0.1, duration - 0.26)).to(0.14, { opacity: 0 }).call(() => node.destroy()).start();
        tween(node).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    private showFloatingText(text: string, x: number, y: number, color: Color, fontSize = 22): void {
        const layer = this.effectLayer ?? this.node;
        const node = this.createNode(layer, `Float-${text}`, x, y, 260, 55);
        const label = this.createLabel(node, 'Label', text, 0, 0, fontSize, color, 250, 48);
        label.isBold = true;
        const opacity = node.addComponent(UIOpacity);
        tween(node).by(0.52, { position: new Vec3(0, 46, 0) }, { easing: 'quadOut' }).start();
        tween(opacity).delay(0.18).to(0.34, { opacity: 0 }).call(() => node.destroy()).start();
    }

    private spawnParticle(key: string, x: number, y: number, size: number, angle: number): void {
        const layer = this.effectLayer ?? this.node;
        const node = this.createNode(layer, `Particle-${key}`, x, y, size, size);
        this.applySprite(node, key);
        node.angle = angle;
        node.setScale(0.25, 0.25, 1);
        const opacity = node.addComponent(UIOpacity);
        tween(node).to(0.18, { scale: new Vec3(1.05, 1.05, 1), angle: angle * -0.5 }, { easing: 'backOut' }).to(0.28, { scale: new Vec3(1.3, 1.3, 1) }).start();
        tween(opacity).delay(0.2).to(0.28, { opacity: 0 }).call(() => node.destroy()).start();
    }

    private boardMetrics(): { width: number; height: number; cellWidth: number; cellHeight: number } {
        const surface = this.gridNode?.parent;
        const size = surface?.getComponent(UITransform)?.contentSize ?? { width: 650, height: 722 };
        return {
            width: size.width,
            height: size.height,
            cellWidth: size.width / (BOARD_COLUMNS - 1),
            cellHeight: size.height / (BOARD_ROWS - 1),
        };
    }

    private boardPoint(at: BoardPosition): { x: number; y: number } {
        const metrics = this.boardMetrics();
        return {
            x: -metrics.width / 2 + at.column * metrics.cellWidth,
            y: metrics.height / 2 - at.row * metrics.cellHeight,
        };
    }

    private setHint(text: string): void {
        if (this.hintLabel) {
            this.hintLabel.string = text;
            return;
        }
        this.showTransientBanner(text, -190, 20, COLORS.goldLight, 0.95);
    }

    private async loadTextures(): Promise<void> {
        const bundle = assetManager.getBundle(RESOURCE_BUNDLE);
        if (!bundle) throw new Error(`Bundle ${RESOURCE_BUNDLE} is unavailable.`);
        await Promise.all(Object.keys(TEXTURE_PATHS).map((key) => new Promise<void>((resolve, reject) => {
            const path = TEXTURE_PATHS[key]!;
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture) {
                    reject(error ?? new Error(`Missing texture ${path}`));
                    return;
                }
                const frame = new SpriteFrame();
                frame.texture = texture;
                if (key === 'rewardedVideoIcon') {
                    frame.packable = false;
                    frame.rect = new Rect(0, 0, texture.width, texture.height);
                    frame.originalSize = new Size(texture.width, texture.height);
                }
                this.frames.set(key, frame);
                resolve();
            });
        })));
    }

    private async loadAudio(): Promise<void> {
        const bundle = assetManager.getBundle(RESOURCE_BUNDLE);
        if (!bundle) throw new Error(`Bundle ${RESOURCE_BUNDLE} is unavailable.`);
        await Promise.all(Object.keys(AUDIO_PATHS).map((key) => new Promise<void>((resolve, reject) => {
            const path = AUDIO_PATHS[key]!;
            bundle.load(path, AudioClip, (error, clip) => {
                if (error || !clip) {
                    if (OPTIONAL_AUDIO_KEYS.has(key)) {
                        console.warn(`[ChessEndless] Optional audio unavailable: ${path}`);
                        resolve();
                        return;
                    }
                    reject(error ?? new Error(`Missing audio ${path}`));
                    return;
                }
                this.clips.set(key, clip);
                resolve();
            });
        })));
    }

    private applySprite(node: Node, key: string): void {
        const transform = node.getComponent(UITransform);
        const intendedWidth = transform?.contentSize.width ?? 100;
        const intendedHeight = transform?.contentSize.height ?? 100;
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        // Cocos applies the source texture size as soon as spriteFrame is assigned
        // while the component is still in TRIMMED mode. Select CUSTOM first so the
        // layout dimensions chosen by createNode remain authoritative.
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.frames.get(key) ?? null;
        transform?.setContentSize(intendedWidth, intendedHeight);
    }

    private playSound(key: string, volume = 0.8): void {
        const clip = this.clips.get(key);
        if (clip) this.context?.services.audio.playEffect(clip, volume);
    }

    private playComboMilestoneSound(combo: number): void {
        if (combo !== 2 && combo !== 3 && combo !== 4) return;
        const key = COMBO_AUDIO_KEYS[combo];
        this.playSound(key, COMBO_AUDIO_VOLUMES[combo]);
    }

    private playMusic(key: 'musicNormal' | 'musicPressure'): void {
        const clip = this.clips.get(key);
        if (clip) this.context?.services.audio.playMusic(clip, CHESS_MUSIC_VOLUME);
    }

    private updatePressureMusic(snapshot: ChessEndlessSnapshot): void {
        // 玩家走子后模型会短暂处于 enemy phase，敌方回合还没有完成结算。
        // 此时的棋盘/增援快照不是一个完整回合的稳定状态，不能用它切换
        // BGM，否则普通回合可能先误入高压层，下一回合又立刻被释放。
        if (snapshot.phase !== 'player') return;

        const generalOnBoard = snapshot.generalActive
            || snapshot.enemies.some((piece) => piece.type === 'general');
        const shouldPressure = generalOnBoard || snapshot.enemies.length >= 16;
        if (this.pressureMode === shouldPressure) return;

        this.pressureMode = shouldPressure;
        this.playMusic(shouldPressure ? 'musicPressure' : 'musicNormal');
    }

    private duckMusic(stinger: string, resumeAfter: number, stayPaused = false): void {
        const generation = this.operationGeneration;
        this.context?.services.audio.pauseMusic();
        this.playSound(stinger, 0.94);
        if (!stayPaused) {
            this.scheduleOnce(() => {
                if (this.isGenerationCurrent(generation) && this.lifecycle === 'playing') {
                    this.context?.services.audio.resumeMusic();
                }
            }, resumeAfter);
        }
    }

    private readSave(): void {
        const data = this.context?.services.storage.getGameData(GAME_ID);
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        this.dangerHintsEnabled = data?.custom?.dangerHintsEnabled !== false;
        this.resumableRound = this.readResumableRound(data);
    }

    private readResumableRound(data?: GameSaveData): ResumableChessRound | undefined {
        if (!data || data.dataVersion > CHESS_DATA_VERSION) return undefined;
        const raw = data.custom?.activeRound;
        if (!isRecord(raw) || raw.inProgress !== true) return undefined;

        const recovery = raw.recoverySnapshot;
        try {
            this.model.restoreSnapshot(
                raw as unknown as ChessEndlessSnapshot,
                recovery === undefined
                    ? undefined
                    : recovery as unknown as ChessEndlessSnapshot,
            );
            if (this.model.snapshot.phase === 'ended') return undefined;
            const recoverySnapshot = this.model.recoverySnapshot;
            return Object.freeze({
                snapshot: this.model.snapshot,
                ...(recoverySnapshot ? { recoverySnapshot } : {}),
            });
        } catch (error: unknown) {
            console.warn('[ChessEndless] Ignoring invalid active round save.', error);
            return undefined;
        }
    }

    private persistProgress(finished: boolean, inProgress = !finished): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const snapshot = this.model.snapshot;
        const previous = storage.getGameData(GAME_ID);
        const previousCustom = isRecord(previous?.custom)
            ? previous.custom
            : {};
        const previousCompletedRounds = typeof previousCustom.completedRounds === 'number'
            && Number.isFinite(previousCustom.completedRounds)
            ? Math.max(0, Math.floor(previousCustom.completedRounds))
            : 0;
        const activeRound = inProgress
            ? Object.freeze({
                inProgress: true,
                ...snapshot,
                ...(this.model.recoverySnapshot
                    ? { recoverySnapshot: this.model.recoverySnapshot }
                    : {}),
            })
            : Object.freeze({ inProgress: false });
        const save: GameSaveData = {
            dataVersion: CHESS_DATA_VERSION,
            playCount: this.playCount,
            highScore: Math.max(this.bestScore, snapshot.score),
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                ...previousCustom,
                totalKills: snapshot.totalKills,
                generalKills: snapshot.generalKills,
                maxCombo: snapshot.maxCombo,
                dangerHintsEnabled: this.dangerHintsEnabled,
                completedRounds: previousCompletedRounds + (finished ? 1 : 0),
                activeRound,
            }),
        };
        try {
            storage.writeGameData(GAME_ID, save);
        } catch (error: unknown) {
            console.error('[ChessEndless] Save failed.', error);
        }
    }

    private createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
    ): Label {
        const node = this.createNode(parent, name, x, y, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.38);
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return label;
    }

    private tweenNode(
        node: Node,
        duration: number,
        properties: Partial<Pick<Node, 'position' | 'scale' | 'angle'>>,
        easing: 'quadOut' | 'quadIn' | 'backOut' = 'quadOut',
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!node.isValid) {
                resolve();
                return;
            }
            tween(node).to(duration, properties as never, { easing }).call(() => resolve()).start();
        });
    }

    private waitSeconds(seconds: number): Promise<void> {
        return new Promise((resolve) => this.scheduleOnce(resolve, seconds));
    }

    private destroyOverlay(overlay?: OverlayState): void {
        if (overlay?.root.isValid) overlay.root.destroy();
    }

    private clearChildren(parent: Node): void {
        parent.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });
    }

    private destroyAllOverlays(): void {
        [this.deathOverlay, this.rewardOverlay, this.pauseOverlay, this.resultOverlay, this.rulesOverlay, this.infoOverlay]
            .forEach((overlay) => this.destroyOverlay(overlay));
        this.deathOverlay = undefined;
        this.rewardOverlay = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.rulesOverlay = undefined;
        this.infoOverlay = undefined;
    }

    private readonly handleLayoutChange = (): void => {
        if (this.resizeQueued || this.lifecycle === 'disposed') return;
        this.resizeQueued = true;
        const generation = this.operationGeneration;
        this.scheduleOnce(() => {
            this.resizeQueued = false;
            if (!this.isGenerationCurrent(generation)) return;
            const overlayOpen = Boolean(this.deathOverlay || this.rewardOverlay || this.pauseOverlay
                || this.resultOverlay || this.rulesOverlay || this.infoOverlay);
            if (!overlayOpen) {
                this.buildInterface();
                this.renderAll();
            }
        }, 0);
    };

    /** Preview-only deterministic states used by the browser QA pass. */
    private applyPreviewQaScenario(): string | undefined {
        if (!DEV || typeof location === 'undefined') return undefined;
        const scenario = new URLSearchParams(location.search).get('chessQa') ?? undefined;
        if (scenario === 'items') {
            this.model.loadForTesting({
                playerPosition: position(4, 4),
                enemies: Object.freeze([
                    { id: 1, type: 'pawn', position: position(4, 0), frozenTurns: 0, isNewlySpawned: false },
                    { id: 2, type: 'horse', position: position(7, 3), frozenTurns: 0, isNewlySpawned: false },
                    { id: 3, type: 'cannon', position: position(1, 7), frozenTurns: 0, isNewlySpawned: false },
                ]),
                inventory: Object.freeze({ crossSlash: 1, freeze: 1, delay: 1, banish: 1, teleport: 1 }),
                phase: 'player',
                nextPieceId: 4,
            });
        } else if (scenario === 'general') {
            this.model.loadForTesting({
                playerPosition: position(4, 5),
                enemies: Object.freeze([]),
                reinforcementTimer: 1,
                reinforcementState: 'GENERAL_COUNTDOWN',
                queuedReinforcement: Object.freeze({
                    kind: 'general',
                    types: Object.freeze(['advisor', 'general', 'advisor'] as EnemyPieceType[]),
                }),
                generalCounter: 8,
                generalTargetN: 8,
                phase: 'player',
                nextPieceId: 1,
            });
        } else if (scenario === 'reward') {
            this.model.loadForTesting({
                enemies: Object.freeze([]),
                phase: 'reward',
                pendingRewardChoices: Object.freeze(['crossSlash', 'freeze', 'teleport']),
                rewardResumePhase: 'player',
                inventory: Object.freeze({ crossSlash: 0, freeze: 1, delay: 0, banish: 0, teleport: 0 }),
            });
        } else if (scenario === 'guard') {
            this.model.loadForTesting({
                playerPosition: position(4, 4),
                enemies: Object.freeze([
                    { id: 1, type: 'general', position: position(4, 0), frozenTurns: 0, isNewlySpawned: false },
                    { id: 2, type: 'advisor', position: position(3, 0), frozenTurns: 0, isNewlySpawned: false },
                ]),
                phase: 'player',
                generalActive: true,
                difficultyLevel: 20,
                reinforcementTimer: 99,
                nextPieceId: 3,
            });
        } else if (scenario === 'fullInventory') {
            this.model.loadForTesting({
                playerPosition: position(4, 4),
                enemies: Object.freeze([
                    { id: 1, type: 'general', position: position(4, 0), frozenTurns: 0, isNewlySpawned: false },
                ]),
                phase: 'player',
                generalActive: true,
                inventory: Object.freeze({ crossSlash: 2, freeze: 2, delay: 2, banish: 2, teleport: 2 }),
                nextPieceId: 2,
            });
        } else if (scenario === 'revive' || scenario === 'noRevive') {
            this.model.loadForTesting({
                playerPosition: position(4, 4),
                enemies: Object.freeze([
                    { id: 1, type: 'rook', position: position(4, 0), frozenTurns: 0, isNewlySpawned: false },
                ]),
                phase: 'enemy',
                reviveUsed: scenario === 'noRevive',
                reinforcementTimer: 99,
                nextPieceId: 2,
            });
        }
        return scenario;
    }

    private installQaBridge(): void {
        const host = globalThis as unknown as Record<string, unknown>;
        host.__CHESS_ENDLESS_QA__ = Object.freeze({
            snapshot: () => this.model.snapshot,
            tapCell: (column: number, row: number) => this.handleCellTap(position(column, row)),
            tapItem: (item: ItemType) => this.handleItemTap(item),
            restart: () => this.restart(),
            layout: () => ({
                root: this.node.getComponent(UITransform)?.contentSize,
                parent: this.node.parent?.getComponent(UITransform)?.contentSize,
                visible: view.getVisibleSize(),
            }),
        });
    }

    private removeQaBridge(): void {
        const host = globalThis as unknown as Record<string, unknown>;
        delete host.__CHESS_ENDLESS_QA__;
    }
}

function position(column: number, row: number): BoardPosition {
    return Object.freeze({ column, row });
}

function same(left: BoardPosition, right: BoardPosition): boolean {
    return left.column === right.column && left.row === right.row;
}
