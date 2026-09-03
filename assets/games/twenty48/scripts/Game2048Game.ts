import {
    _decorator,
    assetManager,
    AudioClip,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    LabelOutline,
    Node,
    Sprite,
    SpriteFrame,
    sys,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AudioService } from '../../../services/audio/AudioService';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { Platform } from '../../../platform/Platform';
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import {
    BOARD_SIZE,
    Game2048Model,
    MILESTONE_TILE,
    TARGET_TILE,
    type Game2048Direction,
    type Game2048MoveResult,
    type Game2048Snapshot,
} from './Game2048Model';
import {
    calculateGame2048BackgroundCover,
    calculateGame2048LayoutFromPlatform,
    GAME_2048_BOARD_NODE_SIZE,
    GAME_2048_BOARD_SIZE,
    GAME_2048_CHEAT_BUTTON_WIDTH,
    GAME_2048_CHEAT_BUTTON_HEIGHT,
    GAME_2048_PAUSE_ICON_SIZE,
    GAME_2048_PAUSE_TOUCH_SIZE,
    GAME_2048_SCORE_CARD_HEIGHT,
    GAME_2048_SCORE_CARD_WIDTH,
    GAME_2048_TITLE_HEIGHT,
    GAME_2048_TITLE_WIDTH,
    type Game2048LayoutMetrics,
} from './Game2048Layout';

const { ccclass } = _decorator;

const TILE_SLIDE_DURATION = 0.1;
const TILE_SETTLE_DURATION = 0.06;
const MERGE_CELEBRATION_DELAY = 0.55;
// 在现有合成特效基础上再放大一点，并让大数字反馈多停留一瞬间。
const HIGH_MERGE_EFFECT_SCALE = 1.12 * 1.4;
const HIGH_MERGE_EFFECT_DURATION_SCALE = 1.15;
const GAME_2048_DATA_VERSION = 4;
const GAME_2048_RESOURCE_BUNDLE = 'game-2048-assets';
const GAME_2048_BACKGROUND_ASSET_PATH = 'visual/backgrounds/t48-user-background-v1/texture';
const GAME_2048_TITLE_ASSET_PATH = 'visual/title/t48-user-title-v1/texture';
const GAME_2048_BOARD_ASSET_PATH = 'visual/boards/t48-user-board-v1/texture';
const GAME_2048_PAUSE_ICON_ASSET_PATH = 'visual/icons/t48-user-pause-v1/texture';
const GAME_2048_REWARDED_AD_ICON_ASSET_PATH = 'visual/ui/t48-rewarded-ad-icon-v1/texture';
const GAME_2048_POPUP_SYSTEM_ASSET_PATH = 'visual/ui/t48-popup-panel-system-v1/texture';
const GAME_2048_POPUP_RESULT_ASSET_PATH = 'visual/ui/t48-popup-panel-result-v1/texture';
const GAME_2048_POPUP_2048_ASSET_PATH = 'visual/ui/t48-popup-panel-2048-v1/texture';
const GAME_2048_POPUP_4096_ASSET_PATH = 'visual/ui/t48-popup-panel-4096-v1/texture';
const GAME_2048_POPUP_BUTTON_CYAN_ASSET_PATH = 'visual/ui/t48-popup-button-cyan-v1/texture';
const GAME_2048_POPUP_BUTTON_AMBER_ASSET_PATH = 'visual/ui/t48-popup-button-amber-v1/texture';
const GAME_2048_POPUP_BUTTON_VIOLET_ASSET_PATH = 'visual/ui/t48-popup-button-violet-v1/texture';
const GAME_2048_POPUP_SCORE_CYAN_ASSET_PATH = 'visual/ui/t48-popup-score-cyan-v1/texture';
const GAME_2048_POPUP_SCORE_AMBER_ASSET_PATH = 'visual/ui/t48-popup-score-amber-v1/texture';
const GAME_2048_SYSTEM_POPUP_ASPECT_RATIO = 700 / 520;
const GAME_2048_RESULT_POPUP_ASPECT_RATIO = 730 / 520;
const GAME_2048_TARGET_POPUP_ASPECT_RATIO = 780 / 548;
const GAME_2048_POPUP_BUTTON_BOTTOM_PADDING = 58;
const GAME_2048_TILE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096] as const;
const GAME_2048_TILE_ASSET_PREFIX = 'visual/pieces/t48-user-piece-';
// 新版棋盘图已去掉外圈留白；四列槽位连同内外间距约占 548/572，棋子间距略放宽为 9px。
const GAME_2048_BOARD_GRID_RATIO = 548 / 572;
const GAME_2048_BOARD_GAP_RATIO = 9 / 548;

type Game2048State = 'idle' | 'ready' | 'playing' | 'paused' | 'target' | 'completed' | 'disposed';
type AchievementTile = typeof MILESTONE_TILE | typeof TARGET_TILE;

export interface Game2048Services {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    readonly ads?: AdService;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'cyan' | 'amber' | 'dark';
    readonly action: () => void | Promise<void>;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: Button[];
    readonly rebuild: () => OverlayState;
    busy: boolean;
}

interface ResultOverlayContent {
    readonly score: number;
    readonly highestTile: number;
}

const COLORS = Object.freeze({
    void: new Color(2, 6, 22, 255),
    panel: new Color(11, 22, 54, 248),
    panelLight: new Color(21, 39, 82, 255),
    cyan: new Color(30, 245, 250, 255),
    cyanDim: new Color(30, 245, 250, 64),
    violet: new Color(181, 78, 255, 255),
    violetDim: new Color(181, 78, 255, 54),
    amber: new Color(255, 214, 55, 255),
    amberDim: new Color(255, 214, 55, 64),
    white: new Color(245, 252, 255, 255),
    muted: new Color(194, 220, 247, 255),
    overlay: new Color(1, 4, 22, 204),
});

type Rgb = readonly [number, number, number];

interface TileMaterial {
    readonly surface: Rgb;
    readonly facet: Rgb;
    readonly core: Rgb;
    readonly accent: Rgb;
    readonly glow: Rgb;
}

const TILE_COLORS: Readonly<Record<number, Rgb>> = Object.freeze({
    2: [57, 216, 246],
    4: [128, 191, 252],
    8: [30, 245, 250],
    16: [129, 237, 132],
    32: [181, 250, 112],
    64: [253, 243, 22],
    128: [233, 117, 9],
    256: [247, 71, 149],
    512: [247, 86, 80],
    1024: [183, 83, 255],
    2048: [255, 216, 55],
    4096: [255, 75, 197],
});

// 高阶合成与目标庆祝使用独立材质；棋子本身不再挂载常驻高阶视觉层。
const HIGH_TIER_LEVELS: Readonly<Record<number, number>> = Object.freeze({
    1024: 1,
    2048: 2,
    4096: 3,
});

const TILE_MATERIALS: Readonly<Record<number, TileMaterial>> = Object.freeze({
    1024: {
        surface: [42, 7, 112],
        facet: [218, 132, 255],
        core: [246, 232, 255],
        accent: [183, 83, 255],
        glow: [183, 83, 255],
    },
    2048: {
        surface: [111, 60, 1],
        facet: [255, 231, 82],
        core: [255, 245, 183],
        accent: [255, 170, 20],
        glow: [255, 216, 55],
    },
    4096: {
        // 与用户提供的 4096 品红棋子保持同一组颜色，不再叠加冰蓝/熔金材质。
        surface: [113, 11, 72],
        facet: [255, 112, 219],
        core: [255, 222, 246],
        accent: [255, 75, 197],
        glow: [255, 75, 197],
    },
});

function colorWithAlpha(rgb: Rgb, alpha: number): Color {
    return new Color(rgb[0], rgb[1], rgb[2], alpha);
}

export interface HighTierTileRect {
    readonly inset: number;
    readonly size: number;
    readonly radius: number;
}

export function calculateHighTierTileRect(tileSize: number, layer: number): HighTierTileRect {
    const safeSize = Number.isFinite(tileSize) ? Math.max(2, tileSize) : 2;
    const requestedInset = Math.max(0, safeSize * (0.16 + Math.max(0, layer) * 0.09));
    const maxInset = Math.max(0, (safeSize - 2) / 2);
    const inset = Math.min(requestedInset, maxInset);
    const innerSize = Math.max(2, safeSize - inset * 2);
    const radius = Math.max(0.5, Math.min(13 + Math.max(0, layer) * 2, innerSize / 2 - 0.5));
    return { inset, size: innerSize, radius };
}

@ccclass('Game2048Game')
export class Game2048Game extends Component implements MiniGame {
    private state: Game2048State = 'idle';
    private context?: MiniGameContext<Game2048Services>;
    private readonly model = new Game2048Model();
    private boardNode?: Node;
    private boardContent?: Node;
    private scoreLabel?: Label;
    private bestLabel?: Label;
    private titleButton?: Button;
    private pauseButton?: Button;
    private cheatButton?: Button;
    private pauseOverlay?: OverlayState;
    private cheatOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private completedResultModel?: MiniGameResultModel;
    private targetOverlay?: OverlayState;
    private audioBank?: BundleAudioBank;
    private normalMusicClip?: AudioClip;
    private dangerMusicClip?: AudioClip;
    private dangerLayer?: Node;
    private dangerMode = false;
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedTitleFrame?: SpriteFrame;
    private ownedBoardFrame?: SpriteFrame;
    private ownedPauseFrame?: SpriteFrame;
    private ownedRewardedAdIconFrame?: SpriteFrame;
    private ownedSystemPopupFrame?: SpriteFrame;
    private ownedResultPopupFrame?: SpriteFrame;
    private ownedMilestonePopupFrame?: SpriteFrame;
    private ownedTargetPopupFrame?: SpriteFrame;
    private ownedAchievementScoreFrame?: SpriteFrame;
    private ownedResultScoreFrame?: SpriteFrame;
    private readonly ownedPopupButtonFrames = new Map<OverlayAction['tone'], SpriteFrame>();
    private readonly ownedTileFrames = new Map<number, SpriteFrame>();
    private titleArtwork?: Sprite;
    private boardArtwork?: Sprite;
    private pauseFallback?: Node;
    private pauseArtwork?: Sprite;
    private inputLocked = false;
    private touchStartX = 0;
    private touchStartY = 0;
    private playCount = 0;
    private bestScore = 0;
    private historicalHighestTile = 0;
    private roundStartingBest = 0;
    private resumableRound?: Game2048Snapshot;
    private preservedCustom: Readonly<Record<string, unknown>> = Object.freeze({});
    private savedProgressDiscarded = false;
    private layoutMetrics?: Game2048LayoutMetrics;
    private resizeListening = false;
    private operationGeneration = 0;
    private titleClickCount = 0;
    private cheatUnlocked = false;
    private gameOverOverlay?: OverlayState;
    private hasShownGameOverAdOffer = false;

    setRandomSourceForTesting(random: () => number): void {
        this.model.setRandomSource(random);
    }

    async initialize(context: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize Game2048Game from ${this.state}.`);
        this.context = context;
        this.readSave();
        this.buildInterface();
        await Promise.all([this.loadBackground(), this.loadThemeAssets(), this.loadMusic()]);
        this.registerInput();
        this.audioBank = new BundleAudioBank({
            bundle: GAME_2048_RESOURCE_BUNDLE,
            cues: {
                uiButton: 'visual/audio/t48-button-v1',
                drop: 'visual/audio/t48-move-v1',
                collision: 'visual/audio/t48-invalid-v1',
                fold: 'visual/audio/t48-spawn-v1',
                merge: 'visual/audio/t48-merge-v1',
                chain: 'visual/audio/t48-combo-v1',
                milestone: 'visual/audio/t48-target-v1',
                failure: 'visual/audio/t48-gameover-v1',
                record: 'visual/audio/t48-record-v1',
            },
        }, context.services.audio, context.services.feedback);
        void this.audioBank.initialize().catch((error: unknown) => {
            console.error('[Game2048Game] Audio initialization failed.', error);
        });
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin Game2048Game from ${this.state}.`);
        this.operationGeneration += 1;
        this.startRound(true);
    }

    pause(): void {
        if (this.state !== 'playing' && this.state !== 'target') return;
        this.operationGeneration += 1;
        this.inputLocked = true;
        this.state = 'paused';
        // 平台 hide 会复用统一暂停路径；在这里同步落盘，避免只依赖最近一次移动。
        this.persistProgress(true);
        this.context?.services.audio.pauseMusic();
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.operationGeneration += 1;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.services.audio.resumeMusic();
        if (this.targetOverlay?.root.isValid) {
            this.state = 'target';
            this.inputLocked = true;
        } else if (this.model.needsTargetCelebration) {
            this.targetOverlay = undefined;
            this.showAchievementOverlay(TARGET_TILE);
        } else if (this.model.highestTile < TARGET_TILE && this.model.needsMilestoneCelebration) {
            this.targetOverlay = undefined;
            this.showAchievementOverlay(MILESTONE_TILE);
        }
    }

    async restart(context?: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state === 'disposed') throw new Error('Cannot restart a disposed Game2048Game.');
        if (context) this.context = context;
        this.operationGeneration += 1;
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.cheatOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.destroyOverlay(this.gameOverOverlay);
        this.pauseOverlay = undefined;
        this.cheatOverlay = undefined;
        this.resultOverlay = undefined;
        this.targetOverlay = undefined;
        this.gameOverOverlay = undefined;
        this.startRound();
    }

    discardSavedProgress(): void {
        this.savedProgressDiscarded = true;
        this.persistProgress(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.operationGeneration += 1;
        if (!this.savedProgressDiscarded
            && (this.state === 'playing' || this.state === 'paused' || this.state === 'target')) {
            this.persistProgress(true);
        }
        this.state = 'disposed';
        this.unscheduleAllCallbacks();
        this.unregisterInput();
        this.setDangerMode(false, false);
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.normalMusicClip = undefined;
        this.dangerMusicClip = undefined;
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.cheatOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.destroyOverlay(this.gameOverOverlay);
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        this.destroyOwnedThemeFrames();
        this.context = undefined;
    }

    private destroyOwnedThemeFrames(): void {
        this.ownedBackgroundFrame?.destroy();
        this.ownedBackgroundFrame = undefined;
        this.ownedTitleFrame?.destroy();
        this.ownedTitleFrame = undefined;
        this.ownedBoardFrame?.destroy();
        this.ownedBoardFrame = undefined;
        this.ownedPauseFrame?.destroy();
        this.ownedPauseFrame = undefined;
        this.ownedRewardedAdIconFrame?.destroy();
        this.ownedRewardedAdIconFrame = undefined;
        this.ownedSystemPopupFrame?.destroy();
        this.ownedSystemPopupFrame = undefined;
        this.ownedResultPopupFrame?.destroy();
        this.ownedResultPopupFrame = undefined;
        this.ownedMilestonePopupFrame?.destroy();
        this.ownedMilestonePopupFrame = undefined;
        this.ownedTargetPopupFrame?.destroy();
        this.ownedTargetPopupFrame = undefined;
        this.ownedAchievementScoreFrame?.destroy();
        this.ownedAchievementScoreFrame = undefined;
        this.ownedResultScoreFrame?.destroy();
        this.ownedResultScoreFrame = undefined;
        this.ownedPopupButtonFrames.forEach((frame) => frame.destroy());
        this.ownedPopupButtonFrames.clear();
        this.ownedTileFrames.forEach((frame) => frame.destroy());
        this.ownedTileFrames.clear();
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.hidePauseMenu();
        this.hideCheatOverlay();
        this.pauseOverlay = this.buildOverlay(
            'Game2048PauseOverlay',
            '信号暂停',
            `当前分数  ${this.model.score}\n棋盘状态已安全冻结`,
            [
                { name: 'ResumeButton', label: '继续连接', tone: 'cyan', action: model.resume },
                { name: 'RestartButton', label: '重新开局', tone: 'amber', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = model;
        this.destroyOverlay(this.targetOverlay);
        this.targetOverlay = undefined;
        this.destroyOverlay(this.gameOverOverlay);
        this.gameOverOverlay = undefined;
        const extra = model.result.extra ?? {};
        const highest = typeof extra.highestTile === 'number' ? Math.floor(extra.highestTile) : this.model.highestTile;
        const reason = extra.reason === 'target-complete' ? '目标达成' : '信号结束';
        const record = extra.newRecord === true;
        this.resultOverlay = this.buildOverlay(
            'Game2048ResultOverlay',
            record ? '新纪录' : reason,
            `最终分数  ${model.result.score}\n本局最高数字  ${highest}`,
            [
                { name: 'RestartButton', label: '再来一局', tone: 'amber', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.returnToLobby },
                {
                    name: 'InspectBoardButton',
                    label: '关闭并查看棋盘',
                    tone: 'cyan',
                    action: () => this.dismissResultOverlay(),
                },
            ],
            { score: model.result.score, highestTile: highest },
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = undefined;
    }

    private startRound(allowResume = false): void {
        this.hideCheatOverlay();
        this.titleClickCount = 0;
        this.cheatUnlocked = false;
        if (this.cheatButton?.node.isValid) this.cheatButton.node.active = false;
        this.savedProgressDiscarded = false;
        const savedRound = allowResume ? this.resumableRound : undefined;
        this.resumableRound = undefined;
        if (savedRound) {
            this.model.restore(savedRound);
        } else {
            this.model.reset();
            this.playCount += 1;
        }
        const resumedTarget = !!savedRound
            && this.model.needsTargetCelebration;
        const resumedMilestone = !!savedRound
            && !resumedTarget
            && this.model.highestTile < TARGET_TILE
            && this.model.needsMilestoneCelebration;
        const resumedDeadTarget = !!savedRound
            && this.model.highestTile >= TARGET_TILE
            && !this.model.hasAvailableMove;
        this.roundStartingBest = this.bestScore;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.reportScore(0);
        this.completedResultModel = undefined;
        this.persistProgress(true);
        this.renderBoard();
        this.refreshHud();
        if (resumedTarget) this.showAchievementOverlay(TARGET_TILE);
        else if (resumedMilestone) this.showAchievementOverlay(MILESTONE_TILE);
        else if (resumedDeadTarget) this.finishRound('target-complete');
        else this.updateDangerState();
    }

    private registerInput(): void {
        this.node.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.titleButton?.node.on(Button.EventType.CLICK, this.handleTitleClick, this);
        this.pauseButton?.node.on(Button.EventType.CLICK, this.handlePause, this);
        this.cheatButton?.node.on(Button.EventType.CLICK, this.handleCheatButton, this);
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = true;
        }
    }

    private unregisterInput(): void {
        this.node.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.titleButton?.node.off(Button.EventType.CLICK, this.handleTitleClick, this);
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        this.cheatButton?.node.off(Button.EventType.CLICK, this.handleCheatButton, this);
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
    }

    private readonly handleCanvasResize = (): void => {
        if (!this.node.isValid || this.state === 'disposed' || this.state === 'idle') return;

        const pauseRebuild = this.pauseOverlay?.rebuild;
        const cheatRebuild = this.cheatOverlay?.rebuild;
        const resultRebuild = this.resultOverlay?.rebuild;
        const targetRebuild = this.targetOverlay?.rebuild;
        const shouldRestoreDanger = this.dangerMode;
        const wasPaused = this.state === 'paused';
        const wasCheat = !!this.cheatOverlay;
        const wasCompleted = this.state === 'completed';
        const wasTarget = this.state === 'target';

        this.unregisterInput();
        this.pauseOverlay = undefined;
        this.cheatOverlay = undefined;
        this.resultOverlay = undefined;
        this.targetOverlay = undefined;
        this.dangerLayer = undefined;
        this.buildInterface();
        this.applyLoadedThemeAssets();
        this.renderBoard();
        this.refreshHud();
        if (shouldRestoreDanger) {
            const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
            this.createDangerLayer(emptyCount);
        }
        this.registerInput();
        void this.loadBackground();

        if (wasPaused && pauseRebuild) {
            this.pauseOverlay = pauseRebuild();
        } else if (wasCheat && cheatRebuild) {
            this.cheatOverlay = cheatRebuild();
        } else if (wasCompleted && resultRebuild) {
            this.resultOverlay = resultRebuild();
        } else if (wasTarget && targetRebuild) {
            this.targetOverlay = targetRebuild();
        }
    };

    private readonly handleTouchStart = (event: EventTouch): void => {
        const location = event.getUILocation();
        this.touchStartX = location.x;
        this.touchStartY = location.y;
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        const location = event.getUILocation();
        const deltaX = location.x - this.touchStartX;
        const deltaY = location.y - this.touchStartY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 42) return;
        const direction: Game2048Direction = Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'up' : 'down');
        this.performMove(direction);
    };

    private readonly handleKeyDown = (event: EventKeyboard): void => {
        const directions: Partial<Record<KeyCode, Game2048Direction>> = {
            [KeyCode.ARROW_LEFT]: 'left',
            [KeyCode.KEY_A]: 'left',
            [KeyCode.ARROW_RIGHT]: 'right',
            [KeyCode.KEY_D]: 'right',
            [KeyCode.ARROW_UP]: 'up',
            [KeyCode.KEY_W]: 'up',
            [KeyCode.ARROW_DOWN]: 'down',
            [KeyCode.KEY_S]: 'down',
        };
        const direction = directions[event.keyCode];
        if (direction) this.performMove(direction);
    };

    private readonly handlePause = (): void => {
        if (this.state === 'completed' && this.completedResultModel) {
            this.context?.services.feedback.play('uiButton');
            this.showResultView(this.completedResultModel);
            return;
        }
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private readonly handleTitleClick = (): void => {
        if (this.state !== 'playing' || this.cheatUnlocked) return;
        this.titleClickCount += 1;
        if (this.titleClickCount < 7) return;

        this.cheatUnlocked = true;
        if (this.cheatButton?.node.isValid) this.cheatButton.node.active = true;
        this.context?.services.feedback.play('uiButton');
    };

    private readonly handleCheatButton = (): void => {
        if (!this.cheatUnlocked || this.state !== 'playing' || this.inputLocked) return;
        if (this.cheatOverlay?.root.isValid) return;
        this.context?.services.feedback.play('uiButton');
        this.cheatOverlay = this.buildOverlay(
            'Game2048CheatOverlay',
            '作弊工具',
            '仅用于验证 256 及以上棋子的合成与显示',
            [
                {
                    name: 'PromoteTileButton',
                    label: '随机提升一枚棋子至 256',
                    tone: 'amber',
                    action: () => this.promoteRandomTileTo256(),
                },
                {
                    name: 'CloseCheatButton',
                    label: '关闭作弊弹窗',
                    tone: 'dark',
                    action: () => this.hideCheatOverlay(),
                },
            ],
        );
    };

    private promoteRandomTileTo256(): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        const index = this.model.promoteRandomTileTo256();
        if (index === undefined) {
            this.context?.services.feedback.play('collision');
            return;
        }

        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.renderBoard();
        this.refreshHud();
        this.updateDangerState();
        this.persistProgress();
        this.context?.services.feedback.play('milestone');
    }

    private hideCheatOverlay(): void {
        this.destroyOverlay(this.cheatOverlay);
        this.cheatOverlay = undefined;
    }

    private performMove(direction: Game2048Direction): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        const generation = this.operationGeneration;
        const result = this.model.move(direction);
        if (!result.changed) {
            this.context?.services.feedback.play('collision');
            if (result.gameOver) this.finishRound('no-moves');
            return;
        }

        this.inputLocked = true;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.context?.reportScore(this.model.score);
        this.playMoveFeedback(result);
        this.animateBoardMove(result);
        this.refreshHud();
        this.persistProgress();
        const achievementTile = this.achievementTileForMove(result);

        this.scheduleOnce(() => {
            if (!this.isOperationCurrent(generation)) return;
            this.renderBoard(result);
            this.playHighMergeFeedback(result, generation);
            this.updateDangerState(result.gameOver);
        }, TILE_SLIDE_DURATION);

        this.scheduleOnce(() => {
            if (!this.isOperationCurrent(generation) || this.state !== 'playing') return;
            if (achievementTile !== undefined) {
                this.scheduleOnce(() => {
                    if (!this.isOperationCurrent(generation)) return;
                    this.showAchievementOverlay(achievementTile);
                }, MERGE_CELEBRATION_DELAY);
                return;
            }
            this.inputLocked = false;
            this.refreshHud();
            if (result.gameOver) {
                this.finishRound('no-moves');
            }
        }, TILE_SLIDE_DURATION + TILE_SETTLE_DURATION);
    }

    private isOperationCurrent(generation: number): boolean {
        return this.state === 'playing'
            && this.operationGeneration === generation
            && this.node.isValid;
    }

    private achievementTileForMove(result: Game2048MoveResult): AchievementTile | undefined {
        if (result.reachedTarget) return TARGET_TILE;
        if (this.highestMergedValue(result) >= MILESTONE_TILE
            && this.model.needsMilestoneCelebration) {
            return MILESTONE_TILE;
        }
        return undefined;
    }

    private playMoveFeedback(result: Game2048MoveResult): void {
        if (result.mergedIndices.length > 1) this.context?.services.feedback.play('chain');
        else if (result.mergedIndices.length === 1) this.context?.services.feedback.play('merge');
        else this.context?.services.feedback.play('drop');
    }

    private playHighMergeFeedback(
        result: Game2048MoveResult,
        generation: number,
    ): void {
        const highest = this.highestMergedValue(result);
        if (highest < 128) {
            if (result.reachedTarget) this.context?.services.feedback.play('milestone');
            return;
        }

        const level = Math.min(5, Math.max(1, Math.log2(highest) - 6));
        const feedback = this.context?.services.feedback;
        if (!feedback) return;

        // 大数字合成的独立震感与方块落位动效同步，并随数字等级增强。
        feedback.vibrate(level >= 3 ? 'heavy' : 'medium');

        if (level === 1) {
            feedback.play('fold');
            return;
        }

        feedback.play('chain');
        if (level >= 3 && level !== 4) {
            this.scheduleOnce(() => {
                if (this.isOperationCurrent(generation)) feedback.play('fold');
            }, 0.035);
        }
        if (level >= 4) {
            this.scheduleOnce(() => {
                if (this.isOperationCurrent(generation)) feedback.play('milestone');
            }, level >= 5 ? 0.07 : 0.045);
        }
    }

    private highestMergedValue(result: Game2048MoveResult): number {
        return result.mergedIndices.reduce(
            (highest, index) => Math.max(highest, this.model.board[index] ?? 0),
            0,
        );
    }

    private showAchievementOverlay(tile: AchievementTile): void {
        const needsCelebration = tile === TARGET_TILE
            ? this.model.needsTargetCelebration
            : this.model.needsMilestoneCelebration;
        if (this.state !== 'playing' || !needsCelebration) return;
        this.state = 'target';
        this.inputLocked = true;
        this.targetOverlay = this.buildTargetOverlay(
            [
                {
                    name: 'ContinueButton',
                    label: '继续冲击更高纪录',
                    tone: 'cyan',
                    action: () => {
                        if (tile === TARGET_TILE) this.model.acknowledgeTarget();
                        else this.model.acknowledgeMilestone();
                        this.persistProgress(true);
        this.destroyOverlay(this.targetOverlay);
        this.destroyOverlay(this.gameOverOverlay);
                        this.targetOverlay = undefined;
                        if (!this.model.hasAvailableMove) {
                            this.finishRound('target-complete');
                            return;
                        }
                        this.state = 'playing';
                        this.inputLocked = false;
                        this.updateDangerState();
                    },
                },
                {
                    name: 'FinishButton',
                    label: '完成本局',
                    tone: 'amber',
                    action: () => this.finishRound('target-complete'),
                },
                {
                    name: 'LobbyButton',
                    label: '返回大厅',
                    tone: 'dark',
                    action: () => {
                        const result = this.createResult('target-complete');
                        this.persistProgress();
                        this.context?.requestLobby(result);
                    },
                },
            ],
            tile,
        );
    }

    private finishRound(reason: 'no-moves' | 'target-complete'): void {
        if (this.state === 'completed' || this.state === 'disposed') return;
        this.state = 'completed';
        this.inputLocked = true;
        this.setDangerMode(false, false);
        this.context?.services.audio.pauseMusic();
        const newRecord = this.model.score > this.roundStartingBest;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.persistProgress(false);
        if (reason === 'no-moves') this.context?.services.feedback.play('failure');
        if (newRecord) this.context?.services.feedback.play('record');
        if (reason === 'no-moves' && !this.hasShownGameOverAdOffer) {
            this.hasShownGameOverAdOffer = true;
            this.showGameOverAdOffer();
            return;
        }
        this.context?.requestExit(this.createResult(reason));
    }

    private showGameOverAdOffer(): void {
        this.gameOverOverlay = this.buildOverlay(
            'Game2048GameOverAdOverlay',
            '棋盘已满',
            '首次无可移动方块\n看视频清除2和4后继续游戏',
            [
                { name: 'WatchAdButton', label: '看视频清除2和4', tone: 'cyan', action: () => this.watchGameOverAd() },
                { name: 'SettleButton', label: '结算', tone: 'amber', action: () => this.context?.requestExit(this.createResult('no-moves')) },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: () => this.context?.requestLobby(this.createResult('no-moves')) },
            ],
        );
        const button = this.gameOverOverlay.buttons.find((candidate) => candidate.node.name === 'WatchAdButton');
        if (button && this.ownedRewardedAdIconFrame) {
            const iconNode = this.createNode(button.node, 'RewardedAdIcon', -124, 0, 52, 38);
            const icon = iconNode.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;
            icon.spriteFrame = this.ownedRewardedAdIconFrame;
            iconNode.setScale(0.62, 0.62, 1);
        }
    }

    private async watchGameOverAd(): Promise<void> {
        const context = this.context;
        const result = context?.services.ads
            ? await context.services.ads.showRewarded({ placement: AD_PLACEMENTS.game2048ClearSmallTiles, gameId: context.gameId, sessionId: context.sessionId })
            : { outcome: 'completed' as const };
        if (result.outcome !== 'completed') return;
        this.destroyOverlay(this.gameOverOverlay);
        this.gameOverOverlay = undefined;
        await this.playSmallTileClearEffect();
        this.model.clearSmallTiles();
        this.state = 'playing';
        this.inputLocked = false;
        this.renderBoard();
        this.refreshHud();
        this.persistProgress(true);
        this.updateDangerState();
    }

    private playSmallTileClearEffect(): Promise<void> {
        const content = this.boardContent;
        if (!content) return Promise.resolve();
        const targets = this.model.board
            .map((value, index) => (value === 2 || value === 4) ? content.getChildByName(`Tile-${index}`) : undefined)
            .filter((tile): tile is Node => !!tile && tile.isValid);
        if (targets.length === 0) return Promise.resolve();
        return new Promise((resolve) => {
            let remaining = targets.length;
            targets.forEach((tile) => {
                const opacity = tile.getComponent(UIOpacity) ?? tile.addComponent(UIOpacity);
                Tween.stopAllByTarget(tile);
                Tween.stopAllByTarget(opacity);
                tween(tile).to(0.22, { scale: new Vec3(0.55, 0.55, 1) }, { easing: 'quadIn' }).start();
                tween(opacity)
                    .to(0.22, { opacity: 0 }, { easing: 'quadIn' })
                    .call(() => {
                        remaining -= 1;
                        if (remaining === 0) resolve();
                    })
                    .start();
            });
        });
    }

    private createResult(reason: 'no-moves' | 'target-complete') {
        return Object.freeze({
            score: this.model.score,
            duration: 0,
            completed: true,
            extra: Object.freeze({
                reason,
                highestTile: this.model.highestTile,
                newRecord: this.model.score > this.roundStartingBest,
            }),
        });
    }

    private readSave(): void {
        const data = this.context?.services.storage.getGameData('game2048');
        const custom = data?.custom;
        this.preservedCustom = custom && typeof custom === 'object' && !Array.isArray(custom)
            ? Object.freeze({ ...custom })
            : Object.freeze({});
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        const highest = data?.custom?.highestTile;
        this.historicalHighestTile = typeof highest === 'number' && Number.isFinite(highest)
            ? Math.max(0, Math.floor(highest))
            : 0;
        this.resumableRound = this.readResumableRound(data);
    }

    private readResumableRound(data?: GameSaveData): Game2048Snapshot | undefined {
        const round = data?.custom?.activeRound;
        if (!round || typeof round !== 'object' || Array.isArray(round)) return undefined;
        const value = round as Record<string, unknown>;
        if (value.inProgress !== true
            || !Array.isArray(value.board)
            || typeof value.score !== 'number'
            || typeof value.targetAcknowledged !== 'boolean'
            || (value.milestoneAcknowledged !== undefined
                && typeof value.milestoneAcknowledged !== 'boolean')) {
            return undefined;
        }

        try {
            const dataVersion = data?.dataVersion ?? 1;
            const snapshot: Game2048Snapshot = {
                board: value.board as number[],
                score: value.score,
                targetAcknowledged: this.migrateTargetAcknowledgement(
                    dataVersion,
                    value.targetAcknowledged,
                ),
                milestoneAcknowledged: this.migrateMilestoneAcknowledgement(
                    dataVersion,
                    value.targetAcknowledged,
                    value.milestoneAcknowledged,
                ),
            };
            this.model.restore(snapshot);
            if (!this.model.hasAvailableMove && this.model.highestTile < TARGET_TILE) return undefined;
            return this.model.snapshot;
        } catch (error: unknown) {
            console.warn('[Game2048Game] Ignoring invalid round save.', error);
            return undefined;
        }
    }

    private migrateTargetAcknowledgement(dataVersion: number, acknowledged: boolean): boolean {
        // v1/v2 的 true 只代表“2048 目标层已确认”；v3 起才表示 4096 目标确认。
        return dataVersion < 3 ? false : acknowledged;
    }

    private migrateMilestoneAcknowledgement(
        dataVersion: number,
        legacyTargetAcknowledged: boolean,
        acknowledged: unknown,
    ): boolean {
        if (typeof acknowledged === 'boolean') return acknowledged;
        // v1/v2 的旧目标层就是 2048；v3 没有 2048 弹窗确认字段，需要补为未确认。
        return dataVersion < 3 ? legacyTargetAcknowledged : false;
    }

    private persistProgress(inProgress = true): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const previousRound = this.preservedCustom.activeRound;
        const previousRoundFields = previousRound
            && typeof previousRound === 'object'
            && !Array.isArray(previousRound)
            ? previousRound as Record<string, unknown>
            : {};
        const data: GameSaveData = {
            dataVersion: GAME_2048_DATA_VERSION,
            playCount: this.playCount,
            highScore: Math.max(this.bestScore, this.model.score),
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                ...this.preservedCustom,
                highestTile: Math.max(this.historicalHighestTile, this.model.highestTile),
                activeRound: Object.freeze({
                    ...previousRoundFields,
                    inProgress,
                    ...this.model.snapshot,
                }),
            }),
        };
        try {
            storage.writeGameData('game2048', data);
        } catch (error: unknown) {
            console.error('[Game2048Game] Save failed.', error);
        }
    }

    private buildInterface(): void {
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        const metrics = this.readLayoutMetrics();
        this.layoutMetrics = metrics;
        const { width, height } = metrics;
        this.node.getComponent(UITransform)?.setContentSize(width, height);

        const backdropBleed = 32;
        const backgroundImage = this.createNode(
            this.node,
            'BackgroundImage',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        backgroundImage.setSiblingIndex(0);
        const backdrop = this.createNode(
            this.node,
            'NeonBackdrop',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        const background = backdrop.addComponent(Graphics);
        // 用户背景本身已包含电路与环境光，运行时只保留一层很轻的可读性遮罩。
        background.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 18);
        background.rect(
            -(width + backdropBleed) / 2,
            -(height + backdropBleed) / 2,
            width + backdropBleed,
            height + backdropBleed,
        );
        background.fill();

        // Wide, low-alpha pools create a neon atmosphere without leaving bright hotspots.
        [
            { x: -width * 0.48, y: height * 0.35, radius: 310, color: COLORS.cyan, alpha: 9 },
            { x: -width * 0.48, y: height * 0.35, radius: 220, color: COLORS.cyan, alpha: 12 },
            { x: -width * 0.48, y: height * 0.35, radius: 145, color: COLORS.cyan, alpha: 15 },
            { x: width * 0.48, y: height * 0.22, radius: 270, color: COLORS.violet, alpha: 9 },
            { x: width * 0.48, y: height * 0.22, radius: 178, color: COLORS.violet, alpha: 12 },
            { x: width * 0.46, y: -height * 0.34, radius: 300, color: COLORS.amber, alpha: 7 },
            { x: width * 0.46, y: -height * 0.34, radius: 195, color: COLORS.amber, alpha: 10 },
        ].forEach((glow) => {
            background.fillColor = new Color(glow.color.r, glow.color.g, glow.color.b, glow.alpha);
            background.circle(glow.x, glow.y, glow.radius);
            background.fill();
        });

        background.strokeColor = new Color(65, 145, 163, 28);
        background.lineWidth = 1;
        const gridXs: number[] = [];
        const gridYs: number[] = [];
        for (let x = -width / 2 + 48; x < width / 2; x += 84) {
            gridXs.push(x);
            background.moveTo(x, -height / 2);
            background.lineTo(x, height / 2);
        }
        background.stroke();
        background.strokeColor = new Color(127, 102, 189, 22);
        for (let y = -height / 2 + 38; y < height / 2; y += 84) {
            gridYs.push(y);
            background.moveTo(-width / 2, y);
            background.lineTo(width / 2, y);
        }
        background.stroke();

        gridXs.forEach((x, column) => {
            gridYs.forEach((y, row) => {
                if ((column * 3 + row * 5) % 11 !== 0) return;
                const accent = (column + row) % 3 === 0 ? COLORS.violet : COLORS.cyan;
                background.fillColor = new Color(accent.r, accent.g, accent.b, 42);
                background.circle(x, y, 2.4);
                background.fill();
            });
        });

        const titleFrame = this.createNode(
            this.node,
            'TitleCircuit',
            metrics.titleX,
            metrics.titleY,
            GAME_2048_TITLE_WIDTH,
            GAME_2048_TITLE_HEIGHT,
        );
        titleFrame.setScale(metrics.fitScale, metrics.fitScale, 1);
        const titleArtworkNode = this.createNode(
            titleFrame,
            'TitleArtwork',
            0,
            0,
            GAME_2048_TITLE_WIDTH,
            GAME_2048_TITLE_HEIGHT,
        );
        const titleArtwork = titleArtworkNode.addComponent(Sprite);
        titleArtwork.sizeMode = Sprite.SizeMode.CUSTOM;
        titleArtworkNode.active = false;
        titleArtworkNode.setSiblingIndex(titleFrame.children.length - 1);
        this.titleArtwork = titleArtwork;
        this.titleButton = titleFrame.addComponent(Button);
        this.titleButton.transition = Button.Transition.SCALE;
        this.titleButton.zoomScale = 0.98;
        this.titleButton.duration = 0.08;
        this.pauseButton = this.createPauseButton(
            this.node,
            'PauseButton',
            metrics.pauseX,
            metrics.pauseY,
        );
        // 暂停按钮使用独立图标，触摸热区略大于图标本身。
        this.pauseButton.node.setScale(metrics.fitScale, metrics.fitScale, 1);

        this.cheatButton = this.createButton(
            this.node,
            'CheatButton',
            '作弊',
            metrics.cheatX,
            metrics.cheatY,
            GAME_2048_CHEAT_BUTTON_WIDTH,
            GAME_2048_CHEAT_BUTTON_HEIGHT,
            'amber',
        );
        this.cheatButton.node.setScale(metrics.fitScale, metrics.fitScale, 1);
        this.cheatButton.node.active = this.cheatUnlocked;

        this.scoreLabel = this.createHudCard(metrics.scoreLeftX, metrics.scoreY, '分数', COLORS.cyan, metrics.fitScale);
        this.bestLabel = this.createHudCard(metrics.scoreRightX, metrics.scoreY, '最高', COLORS.amber, metrics.fitScale);

        const boardSize = GAME_2048_BOARD_SIZE;
        this.boardNode = this.createNode(
            this.node,
            'BoardPanel',
            metrics.boardX,
            metrics.boardY,
            GAME_2048_BOARD_NODE_SIZE,
            GAME_2048_BOARD_NODE_SIZE,
        );
        this.boardNode.setScale(metrics.boardScale, metrics.boardScale, 1);
        const boardArtworkNode = this.createNode(
            this.boardNode,
            'BoardArtwork',
            0,
            0,
            boardSize,
            boardSize,
        );
        const boardArtwork = boardArtworkNode.addComponent(Sprite);
        boardArtwork.sizeMode = Sprite.SizeMode.CUSTOM;
        boardArtworkNode.active = false;
        const boardGridSize = this.boardGridSize(boardSize);
        this.boardContent = this.createNode(this.boardNode, 'BoardContent', 0, 0, boardGridSize, boardGridSize);
        this.boardContent.setSiblingIndex(this.boardNode.children.length - 1);
        this.boardArtwork = boardArtwork;

        this.createLabel(
            this.node,
            'Hint',
            '',
            metrics.hintX,
            metrics.hintY,
            25 * metrics.fitScale,
            COLORS.muted,
            metrics.hintWidth,
            metrics.hintHeight,
        );
        this.applyLoadedThemeAssets();
    }

    private readLayoutMetrics(): Game2048LayoutMetrics {
        const canvasSize = this.node.parent?.getComponent(UITransform)?.contentSize;
        const visible = view.getVisibleSize();
        const width = visible.width > 0 ? visible.width : canvasSize?.width ?? 750;
        const height = visible.height > 0 ? visible.height : canvasSize?.height ?? 1334;
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visible.width > 0 ? width / visible.width : 1;
        const scaleY = visible.height > 0 ? height / visible.height : 1;
        const systemSafeLeft = Math.max(0, safeRect.x) * scaleX;
        const systemSafeRight = Math.max(0, visible.width - safeRect.x - safeRect.width) * scaleX;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY;
        const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
        return calculateGame2048LayoutFromPlatform(
            width,
            height,
            this.context?.services.platform.getLayoutInfo(),
            {
                safeTop: systemSafeTop,
                safeBottom: systemSafeBottom,
                safeLeft: systemSafeLeft,
                safeRight: systemSafeRight,
            },
        );
    }

    private loadBackground(): Promise<void> {
        const bundle = assetManager.getBundle(GAME_2048_RESOURCE_BUNDLE);
        const background = this.node.getChildByName('BackgroundImage');
        if (!bundle || !background) return Promise.resolve();

        return new Promise((resolve) => {
            bundle.load(GAME_2048_BACKGROUND_ASSET_PATH, Texture2D, (error, texture) => {
                if (!error && texture && this.node.isValid && background.isValid) {
                    const sprite = background.addComponent(Sprite);
                    const spriteFrame = new SpriteFrame();
                    spriteFrame.texture = texture;
                    this.ownedBackgroundFrame?.destroy();
                    this.ownedBackgroundFrame = spriteFrame;
                    sprite.spriteFrame = spriteFrame;
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    sprite.color = new Color(255, 255, 255, 255);

                    const rootSize = this.node.getComponent(UITransform)?.contentSize;
                    const targetWidth = rootSize?.width ?? 750;
                    const targetHeight = rootSize?.height ?? 1334;
                    const cover = calculateGame2048BackgroundCover(
                        targetWidth,
                        targetHeight,
                        texture.width / Math.max(1, texture.height),
                    );
                    // Cover 只按统一比例放大，超出视口的部分交给 Camera 裁切，禁止非等比拉伸。
                    background.getComponent(UITransform)?.setContentSize(cover.width, cover.height);
                    const backdrop = this.node.getChildByName('NeonBackdrop');
                    if (backdrop) backdrop.active = false;
                } else if (error) {
                    console.warn('[Game2048Game] Neon background failed to load.', error);
                }
                resolve();
            });
        });
    }

    private async loadThemeAssets(): Promise<void> {
        const [
            title,
            board,
            pause,
            systemPopup,
            resultPopup,
            milestonePopup,
            targetPopup,
            cyanButton,
            amberButton,
            violetButton,
            achievementScore,
            resultScore,
            ...tiles
        ] = await Promise.all([
            this.loadTextureFrame(GAME_2048_TITLE_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_BOARD_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_PAUSE_ICON_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SYSTEM_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_RESULT_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_2048_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_4096_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_CYAN_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_AMBER_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_VIOLET_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SCORE_CYAN_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SCORE_AMBER_ASSET_PATH),
            ...GAME_2048_TILE_VALUES.map((value) => this.loadTextureFrame(
                `${GAME_2048_TILE_ASSET_PREFIX}${value}-v1/texture`,
            )),
        ]);

        if (!this.node.isValid || this.state === 'disposed') {
            title?.destroy();
            board?.destroy();
            pause?.destroy();
            systemPopup?.destroy();
            resultPopup?.destroy();
            milestonePopup?.destroy();
            targetPopup?.destroy();
            cyanButton?.destroy();
            amberButton?.destroy();
            violetButton?.destroy();
            achievementScore?.destroy();
            resultScore?.destroy();
            tiles.forEach((frame) => frame?.destroy());
            return;
        }

        this.ownedTitleFrame = title;
        this.ownedBoardFrame = board;
        this.ownedPauseFrame = pause;
        this.ownedRewardedAdIconFrame = await this.loadTextureFrame(GAME_2048_REWARDED_AD_ICON_ASSET_PATH);
        this.ownedSystemPopupFrame = systemPopup;
        this.ownedResultPopupFrame = resultPopup;
        this.ownedMilestonePopupFrame = milestonePopup;
        this.ownedTargetPopupFrame = targetPopup;
        if (cyanButton) this.ownedPopupButtonFrames.set('cyan', cyanButton);
        if (amberButton) this.ownedPopupButtonFrames.set('amber', amberButton);
        if (violetButton) this.ownedPopupButtonFrames.set('dark', violetButton);
        this.ownedAchievementScoreFrame = achievementScore;
        this.ownedResultScoreFrame = resultScore;
        GAME_2048_TILE_VALUES.forEach((value, index) => {
            const frame = tiles[index];
            if (frame) this.ownedTileFrames.set(value, frame);
        });
        this.applyLoadedThemeAssets();
    }

    private loadTextureFrame(assetPath: string): Promise<SpriteFrame | undefined> {
        const bundle = assetManager.getBundle(GAME_2048_RESOURCE_BUNDLE);
        if (!bundle) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            bundle.load(assetPath, Texture2D, (error, texture) => {
                if (error || !texture) {
                    console.warn(`[Game2048Game] Theme asset failed to load: ${assetPath}`, error);
                    resolve(undefined);
                    return;
                }
                const frame = new SpriteFrame();
                frame.texture = texture;
                resolve(frame);
            });
        });
    }

    private applyLoadedThemeAssets(): void {
        if (this.titleArtwork?.node.isValid) {
            this.titleArtwork.spriteFrame = this.ownedTitleFrame ?? null;
            this.titleArtwork.node.active = !!this.ownedTitleFrame;
        }
        if (this.boardArtwork?.node.isValid) {
            this.boardArtwork.spriteFrame = this.ownedBoardFrame ?? null;
            this.boardArtwork.node.active = !!this.ownedBoardFrame;
        }
        if (this.pauseArtwork?.node.isValid) {
            this.pauseArtwork.spriteFrame = this.ownedPauseFrame ?? null;
            this.pauseArtwork.node.active = !!this.ownedPauseFrame;
        }
        if (this.pauseFallback?.isValid) {
            this.pauseFallback.active = !this.ownedPauseFrame;
        }
    }

    private async loadMusic(): Promise<void> {
        const bundle = assetManager.getBundle(GAME_2048_RESOURCE_BUNDLE);
        if (!bundle) return;
        const loadClip = (assetPath: string): Promise<AudioClip> => new Promise((resolve, reject) => {
            bundle.load(assetPath, AudioClip, (error, clip) => error ? reject(error) : resolve(clip));
        });
        const [normal, danger] = await Promise.all([
            loadClip('visual/audio/t48-neon-loop-v1').catch((error: unknown) => {
                console.warn('[Game2048Game] Normal music failed to load.', error);
                return undefined;
            }),
            loadClip('visual/audio/t48-danger-loop-v1').catch((error: unknown) => {
                console.warn('[Game2048Game] Danger music failed to load.', error);
                return undefined;
            }),
        ]);
        if (!this.node.isValid || this.state === 'disposed') return;
        if (normal) {
            this.normalMusicClip = normal;
            this.context?.services.audio.playMusic(normal);
        }
        this.dangerMusicClip = danger;
    }

    private renderBoard(result?: Game2048MoveResult): void {
        const content = this.boardContent;
        const panel = this.boardNode?.getComponent(UITransform);
        if (!content || !panel) return;
        content.children.filter((child) => child.name.startsWith('Tile-')).forEach((child) => {
            this.destroyNodeWithTweens(child);
        });
        const boardSize = content.getComponent(UITransform)?.contentSize.width
            ?? panel.contentSize.width - 24;
        const gap = this.boardGap(boardSize);
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;

        this.model.board.forEach((value, index) => {
            if (value === 0) return;
            const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
            const tile = this.createNode(content, `Tile-${index}`, x, y, tileSize, tileSize);
            this.drawTile(tile, value, tileSize);
            if (result?.spawned?.index === index) {
                tile.setScale(0.45, 0.45, 1);
                tween(tile).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            } else if ((result?.mergedIndices.indexOf(index) ?? -1) >= 0) {
                const effectLevel = value >= 128
                    ? Math.min(5, Math.max(1, Math.log2(value) - 6))
                    : 0;
                const peakScale = 1.04 + effectLevel * 0.008;
                const startScale = effectLevel > 0 ? 0.82 : 0.8;
                tile.setScale(startScale, startScale, 1);
                tween(tile)
                    .to(0.07, { scale: new Vec3(peakScale, peakScale, 1) }, { easing: 'quadOut' })
                    .to(0.06, { scale: new Vec3(1, 1, 1) })
                    .start();
            }
        });

        result?.mergedIndices.forEach((index) => {
            const value = this.model.board[index] ?? 0;
            if (value >= 128) {
                this.createHighMergeEffect(content, index, value, boardSize, gap, tileSize);
            }
        });
    }

    private animateBoardMove(result: Game2048MoveResult): void {
        const content = this.boardContent;
        const panel = this.boardNode?.getComponent(UITransform);
        if (!content || !panel) return;
        const boardSize = content.getComponent(UITransform)?.contentSize.width
            ?? panel.contentSize.width - 24;
        const gap = this.boardGap(boardSize);
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;

        result.tileMotions.forEach((motion) => {
            const tile = content.getChildByName(`Tile-${motion.fromIndex}`);
            if (!tile || motion.fromIndex === motion.toIndex) return;
            const destination = this.tilePosition(motion.toIndex, boardSize, gap, tileSize);
            Tween.stopAllByTarget(tile);
            tile.setSiblingIndex(content.children.length - 1);
            tween(tile)
                .to(
                    TILE_SLIDE_DURATION,
                    { position: new Vec3(destination.x, destination.y, 0) },
                    { easing: 'quadOut' },
                )
                .start();
        });
    }

    private boardGap(boardSize: number): number {
        return Math.max(0.5, boardSize * GAME_2048_BOARD_GAP_RATIO);
    }

    private boardGridSize(boardSize: number): number {
        return boardSize * GAME_2048_BOARD_GRID_RATIO;
    }

    private createHighMergeEffect(
        content: Node,
        index: number,
        value: number,
        boardSize: number,
        gap: number,
        tileSize: number,
    ): void {
        const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
        const material = TILE_MATERIALS[value];
        const rgb: Rgb = material?.glow ?? TILE_COLORS[value] ?? [255, 220, 75];
        const accent: Rgb = material?.accent ?? rgb;
        const level = Math.min(5, Math.max(1, Math.log2(value) - 6));
        const tier = HIGH_TIER_LEVELS[value] ?? 0;
        const eliteBoost = (level >= 3 ? 1 + (level - 2) * 0.05 : 1) + tier * 0.025;
        const ringCount = Math.min(4, level);

        const flash = this.createNode(content, `MergeFlash-${index}-${value}`, x, y, tileSize, tileSize);
        flash.setSiblingIndex(content.children.length - 1);
        const flashOpacity = flash.addComponent(UIOpacity);
        flashOpacity.opacity = Math.min(200, (100 + level * 8) * eliteBoost);
        const flashGraphics = flash.addComponent(Graphics);
        flashGraphics.fillColor = colorWithAlpha(material?.surface ?? rgb, 30 + level * 4 + tier * 5);
        flashGraphics.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, 20);
        flashGraphics.fill();
        if (material) {
            flashGraphics.fillColor = colorWithAlpha(material.core, 30 + tier * 10);
            flashGraphics.moveTo(0, -tileSize * 0.22);
            flashGraphics.lineTo(tileSize * 0.22, 0);
            flashGraphics.lineTo(0, tileSize * 0.22);
            flashGraphics.lineTo(-tileSize * 0.22, 0);
            flashGraphics.close();
            flashGraphics.fill();
        }
        flash.setScale(0.84 * HIGH_MERGE_EFFECT_SCALE, 0.84 * HIGH_MERGE_EFFECT_SCALE, 1);
        tween(flash)
            .to(
                (0.11 + level * 0.01 + tier * 0.012) * HIGH_MERGE_EFFECT_DURATION_SCALE,
                {
                    scale: new Vec3(
                        (1.04 + level * 0.015 + tier * 0.025) * eliteBoost * HIGH_MERGE_EFFECT_SCALE,
                        (1.04 + level * 0.015 + tier * 0.025) * eliteBoost * HIGH_MERGE_EFFECT_SCALE,
                        1,
                    ),
                },
                { easing: 'quadOut' },
            )
            .start();
        tween(flashOpacity)
            .to(
                (0.12 + level * 0.012 + tier * 0.012) * HIGH_MERGE_EFFECT_DURATION_SCALE,
                { opacity: 0 },
            )
            .call(() => this.destroyNodeWithTweens(flash))
            .start();

        for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
            const ring = this.createNode(content, `MergeRing-${index}-${value}-${ringIndex}`, x, y, tileSize, tileSize);
            ring.setSiblingIndex(content.children.length - 1);
            const opacity = ring.addComponent(UIOpacity);
            opacity.opacity = Math.max(60, 145 - ringIndex * 14);
            const graphics = ring.addComponent(Graphics);
            graphics.strokeColor = colorWithAlpha(ringIndex % 3 === 0 ? accent : rgb, 155);
            graphics.lineWidth = (1 + Math.min(1.4, level * 0.22) + tier * 0.2) * eliteBoost;
            graphics.circle(0, 0, tileSize * (0.27 + ringIndex * 0.015));
            graphics.stroke();
            if (level >= 3 && ringIndex < 2) {
                graphics.moveTo(-tileSize * 0.28, 0);
                graphics.lineTo(tileSize * 0.28, 0);
                graphics.moveTo(0, -tileSize * 0.28);
                graphics.lineTo(0, tileSize * 0.28);
                graphics.stroke();
            }
            if (tier >= 2 && ringIndex === 0) {
                graphics.moveTo(-tileSize * 0.22, -tileSize * 0.22);
                graphics.lineTo(tileSize * 0.22, tileSize * 0.22);
                graphics.moveTo(-tileSize * 0.22, tileSize * 0.22);
                graphics.lineTo(tileSize * 0.22, -tileSize * 0.22);
                graphics.stroke();
            }
            const startScale = (0.82 + ringIndex * 0.04) * HIGH_MERGE_EFFECT_SCALE;
            const duration = (0.13 + level * 0.015 + ringIndex * 0.01 + tier * 0.012)
                * HIGH_MERGE_EFFECT_DURATION_SCALE;
            const endScale = (1.03 + level * 0.03 + ringIndex * 0.025 + tier * 0.02)
                * eliteBoost * HIGH_MERGE_EFFECT_SCALE;
            ring.setScale(startScale, startScale, 1);
            tween(ring)
                .delay(ringIndex * 0.014)
                .to(duration, { scale: new Vec3(endScale, endScale, 1) }, { easing: 'quadOut' })
                .start();
            tween(opacity)
                .delay(ringIndex * 0.014)
                .to(duration, { opacity: 0 })
                .call(() => this.destroyNodeWithTweens(ring))
                .start();
        }

        if (material) this.createHighTierMergeCore(content, index, value, x, y, tileSize, material, tier);
    }

    private createHighTierMergeCore(
        content: Node,
        index: number,
        value: number,
        x: number,
        y: number,
        tileSize: number,
        material: TileMaterial,
        tier: number,
    ): void {
        const core = this.createNode(content, `MergeCore-${index}-${value}`, x, y, tileSize, tileSize);
        core.setSiblingIndex(content.children.length - 1);
        const opacity = core.addComponent(UIOpacity);
        opacity.opacity = 150;
        const graphics = core.addComponent(Graphics);
        const radius = tileSize * (0.18 + tier * 0.018);
        graphics.fillColor = colorWithAlpha(material.core, 50 + tier * 12);
        graphics.moveTo(0, -radius);
        graphics.lineTo(radius, 0);
        graphics.lineTo(0, radius);
        graphics.lineTo(-radius, 0);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(material.accent, 150);
        graphics.lineWidth = 1.2 + tier * 0.3;
        graphics.stroke();
        core.setScale(0.72 * HIGH_MERGE_EFFECT_SCALE, 0.72 * HIGH_MERGE_EFFECT_SCALE, 1);
        tween(core)
            .to((0.12 + tier * 0.02) * HIGH_MERGE_EFFECT_DURATION_SCALE, {
                scale: new Vec3(
                    (1.02 + tier * 0.025) * HIGH_MERGE_EFFECT_SCALE,
                    (1.02 + tier * 0.025) * HIGH_MERGE_EFFECT_SCALE,
                    1,
                ),
            }, { easing: 'backOut' })
            .start();
        tween(opacity)
            .to((0.15 + tier * 0.02) * HIGH_MERGE_EFFECT_DURATION_SCALE, { opacity: 0 })
            .call(() => this.destroyNodeWithTweens(core))
            .start();
    }

    private drawTile(tile: Node, value: number, size: number): void {
        const spriteFrame = this.ownedTileFrames.get(value);
        if (spriteFrame) {
            const artwork = this.createNode(tile, 'Artwork', 0, 0, size, size);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = spriteFrame;
            return;
        }

        const rgb: Rgb = TILE_COLORS[value] ?? [214, 112, 188];
        const base = [10, 21, 38] as const;
        const fill = rgb.map((channel, index) => Math.round(base[index] + channel * 0.38));
        const graphics = tile.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 70);
        graphics.roundRect(-size / 2 - 2, -size / 2 - 7, size + 4, size + 4, 23);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 24);
        graphics.roundRect(-size / 2 - 7, -size / 2 - 7, size + 14, size + 14, 26);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 42);
        graphics.roundRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8, 24);
        graphics.fill();
        graphics.fillColor = new Color(fill[0], fill[1], fill[2], 218);
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], value >= 2048 ? 248 : 228);
        graphics.lineWidth = value >= 2048 ? 3 : 2;
        graphics.roundRect(-size / 2, -size / 2, size, size, 20);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 58);
        graphics.lineWidth = 1;
        graphics.roundRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10, 16);
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 162);
        graphics.moveTo(-size / 2 + 18, size / 2 - 9);
        graphics.lineTo(size / 2 - 18, size / 2 - 9);
        graphics.stroke();
        const digits = value.toString().length;
        const fontSize = digits <= 2 ? 59 : digits === 3 ? 52 : digits === 4 ? 43 : 35;
        const color = new Color(
            Math.round(COLORS.white.r * 0.88 + rgb[0] * 0.12),
            Math.round(COLORS.white.g * 0.88 + rgb[1] * 0.12),
            Math.round(COLORS.white.b * 0.88 + rgb[2] * 0.12),
            255,
        );
        const label = this.createLabel(tile, 'Value', String(value), 0, 2, fontSize, color, size - 12, size - 12);
        label.isBold = true;
    }

    private updateDangerState(gameOver = false): void {
        const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
        const shouldEnter = !gameOver && this.state === 'playing' && emptyCount <= 2;
        this.setDangerMode(shouldEnter, true, emptyCount);
    }

    private setDangerMode(enabled: boolean, restoreMusic: boolean, emptyCount = 0): void {
        if (enabled === this.dangerMode) {
            if (enabled) this.updateDangerHint(emptyCount);
            return;
        }
        this.dangerMode = enabled;
        if (enabled) {
            this.createDangerLayer(emptyCount);
            if (this.dangerMusicClip) this.context?.services.audio.playMusic(this.dangerMusicClip);
            return;
        }
        this.destroyDangerLayer();
        this.updateDangerHint();
        if (restoreMusic && this.normalMusicClip) this.context?.services.audio.playMusic(this.normalMusicClip);
    }

    private createDangerLayer(emptyCount: number): void {
        this.destroyDangerLayer();
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const root = this.createNode(this.node, 'CriticalSpaceEffect', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        this.dangerLayer = root;
        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 125;
        const graphics = root.addComponent(Graphics);
        [18, 10, 4].forEach((lineWidth, index) => {
            graphics.strokeColor = new Color(255, index === 2 ? 65 : 26, index === 0 ? 128 : 218, 38 + index * 35);
            graphics.lineWidth = lineWidth;
            const inset = 10 + index * 7;
            graphics.roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, 34);
            graphics.stroke();
        });
        graphics.fillColor = new Color(255, 28, 112, 28);
        graphics.rect(-width / 2, height / 2 - 82, width, 82);
        graphics.rect(-width / 2, -height / 2, width, 82);
        graphics.fill();
        const cornerLength = 92;
        graphics.strokeColor = new Color(255, 83, 177, 210);
        graphics.lineWidth = 4;
        [-1, 1].forEach((horizontal) => [-1, 1].forEach((vertical) => {
            const x = horizontal * (width / 2 - 35);
            const y = vertical * (height / 2 - 35);
            graphics.moveTo(x, y - vertical * cornerLength);
            graphics.lineTo(x, y);
            graphics.lineTo(x - horizontal * cornerLength, y);
        }));
        graphics.stroke();

        const scan = this.createNode(root, 'CriticalScanLine', 0, height / 2 - 130, width - 42, 6);
        const scanGraphics = scan.addComponent(Graphics);
        scanGraphics.fillColor = new Color(255, 46, 143, 62);
        scanGraphics.rect(-(width - 42) / 2, -3, width - 42, 6);
        scanGraphics.fill();
        tween(scan)
            .repeatForever(
                tween()
                    .to(1.25, { position: new Vec3(0, -height / 2 + 130, 0) }, { easing: 'quadIn' })
                    .call(() => scan.setPosition(0, height / 2 - 130)),
            )
            .start();
        tween(opacity)
            .repeatForever(
                tween()
                    .to(0.36, { opacity: 230 }, { easing: 'sineInOut' })
                    .to(0.36, { opacity: 118 }, { easing: 'sineInOut' }),
            )
            .start();
        this.updateDangerHint(emptyCount);
    }

    private destroyDangerLayer(): void {
        if (!this.dangerLayer) return;
        const opacity = this.dangerLayer.getComponent(UIOpacity);
        const scan = this.dangerLayer.getChildByName('CriticalScanLine');
        Tween.stopAllByTarget(this.dangerLayer);
        if (opacity) Tween.stopAllByTarget(opacity);
        if (scan) Tween.stopAllByTarget(scan);
        if (this.dangerLayer.isValid) this.destroyNodeWithTweens(this.dangerLayer);
        this.dangerLayer = undefined;
    }

    private updateDangerHint(emptyCount?: number): void {
        const hint = this.node.getChildByName('Hint')?.getComponent(Label);
        if (!hint) return;
        if (emptyCount !== undefined && emptyCount <= 2) {
            hint.string = `空间临界 · 仅剩 ${emptyCount} 格`;
            hint.color = new Color(255, 126, 184, 255);
            hint.isBold = true;
        } else {
            hint.string = '';
            hint.color = COLORS.muted;
            hint.isBold = false;
        }
    }

    private refreshHud(): void {
        if (this.scoreLabel) this.scoreLabel.string = String(this.model.score);
        if (this.bestLabel) this.bestLabel.string = String(Math.max(this.bestScore, this.model.score));
    }

    private dismissResultOverlay(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
    }

    private createHudCard(x: number, y: number, caption: string, accent: Color, scale = 1): Label {
        const card = this.createNode(
            this.node,
            `${caption}Card`,
            x,
            y,
            GAME_2048_SCORE_CARD_WIDTH,
            GAME_2048_SCORE_CARD_HEIGHT,
        );
        card.setScale(scale, scale, 1);
        const graphics = card.addComponent(Graphics);
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 14);
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2 - 5,
            -GAME_2048_SCORE_CARD_HEIGHT / 2 - 6,
            GAME_2048_SCORE_CARD_WIDTH + 10,
            GAME_2048_SCORE_CARD_HEIGHT + 10,
            24,
        );
        graphics.fill();
        graphics.fillColor = COLORS.panelLight;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 155);
        graphics.lineWidth = 2;
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2,
            -GAME_2048_SCORE_CARD_HEIGHT / 2,
            GAME_2048_SCORE_CARD_WIDTH,
            GAME_2048_SCORE_CARD_HEIGHT,
            20,
        );
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 48);
        graphics.lineWidth = 1;
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2 + 6,
            -GAME_2048_SCORE_CARD_HEIGHT / 2 + 6,
            GAME_2048_SCORE_CARD_WIDTH - 12,
            GAME_2048_SCORE_CARD_HEIGHT - 12,
            16,
        );
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 100);
        graphics.moveTo(-62, 45);
        graphics.lineTo(62, 45);
        graphics.stroke();
        this.createLabel(card, 'Caption', caption, 0, 28, 22, accent, 180, 30).spacingX = 2;
        const value = this.createLabel(card, 'Value', '0', 0, -13, 41, COLORS.white, 188, 52);
        value.isBold = true;
        return value;
    }

    /** 2048 里程碑与 4096 目标共用同一套庆祝层，而不是通用系统弹窗。 */
    private buildTargetOverlay(
        actions: readonly OverlayAction[],
        tile: AchievementTile,
    ): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, 'Game2048TargetOverlay', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);

        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(2, 5, 14, 232);
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        // 达成弹窗恢复原型的纵向节奏；矮屏或窄屏时整体等比缩小。
        // 不再使用“最小高度”顶回可用安全区，从根源上避免上下溢出。
        const panelWidth = 600;
        const panelHeight = panelWidth * GAME_2048_TARGET_POPUP_ASPECT_RATIO;
        const availableWidth = Math.max(1, layout.contentWidth - 32);
        const availableHeight = Math.max(1, height - layout.safeTop - layout.safeBottom - 48);
        const panelScale = Math.min(1, availableWidth / panelWidth, availableHeight / panelHeight);
        const panel = this.createNode(
            root,
            'AchievementPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        const targetMaterial = TILE_MATERIALS[tile] ?? TILE_MATERIALS[TARGET_TILE];
        const popupFrame = tile === TARGET_TILE
            ? this.ownedTargetPopupFrame
            : this.ownedMilestonePopupFrame;
        this.createPopupArtwork(panel, 'AchievementPanelArtwork', popupFrame, panelWidth, panelHeight);

        // 2048/4096 复用同一套庆祝构图，只根据目标数字切换材质和文案。
        graphics.fillColor = colorWithAlpha(targetMaterial.glow, 18);
        graphics.roundRect(-panelWidth / 2 - 14, -panelHeight / 2 - 14, panelWidth + 28, panelHeight + 28, 44);
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 62);
        graphics.lineWidth = 14;
        graphics.roundRect(-panelWidth / 2 - 7, -panelHeight / 2 - 7, panelWidth + 14, panelHeight + 14, 38);
        graphics.stroke();
        graphics.fillColor = new Color(14, 25, 48, 250);
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 232);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 32);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = colorWithAlpha(targetMaterial.accent, 92);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 25);
        graphics.stroke();
        graphics.enabled = !popupFrame;

        const crest = this.createNode(panel, `Target${tile}Crest`, 0, panelHeight / 2 - 8, 82, 82);
        const crestGraphics = crest.addComponent(Graphics);
        crestGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 255);
        crestGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 245);
        crestGraphics.lineWidth = 4;
        crestGraphics.moveTo(0, 38);
        crestGraphics.lineTo(38, 0);
        crestGraphics.lineTo(0, -38);
        crestGraphics.lineTo(-38, 0);
        crestGraphics.close();
        crestGraphics.fill();
        crestGraphics.stroke();
        crestGraphics.strokeColor = colorWithAlpha(targetMaterial.accent, 175);
        crestGraphics.lineWidth = 2;
        crestGraphics.moveTo(0, 27);
        crestGraphics.lineTo(27, 0);
        crestGraphics.lineTo(0, -27);
        crestGraphics.lineTo(-27, 0);
        crestGraphics.close();
        crestGraphics.stroke();
        crestGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 235);
        crestGraphics.rect(-10, -10, 8, 8);
        crestGraphics.fillColor = colorWithAlpha(targetMaterial.accent, 235);
        crestGraphics.rect(2, -10, 8, 8);
        crestGraphics.fillColor = COLORS.cyan;
        crestGraphics.rect(-10, 2, 8, 8);
        crestGraphics.fillColor = COLORS.violet;
        crestGraphics.rect(2, 2, 8, 8);
        crestGraphics.fill();
        crest.active = !popupFrame;

        const halo = this.createNode(panel, `Target${tile}Halo`, 0, 135, 312, 246);
        const haloGraphics = halo.addComponent(Graphics);
        [116, 99, 82, 66].forEach((radius, index) => {
            haloGraphics.strokeColor = colorWithAlpha(
                index % 2 === 0 ? targetMaterial.glow : targetMaterial.accent,
                52 + index * 18,
            );
            haloGraphics.lineWidth = 3 + index * 0.7;
            haloGraphics.circle(0, 0, radius);
            haloGraphics.stroke();
        });
        haloGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 176);
        haloGraphics.lineWidth = 2;
        for (let index = 0; index < 12; index += 1) {
            const angle = (Math.PI * 2 * index) / 12;
            haloGraphics.moveTo(Math.cos(angle) * 91, Math.sin(angle) * 91);
            haloGraphics.lineTo(Math.cos(angle) * 124, Math.sin(angle) * 124);
        }
        haloGraphics.stroke();
        halo.active = !popupFrame;
        halo.setScale(0.78, 0.78, 1);
        tween(halo)
            .repeatForever(
                tween()
                    .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                    .to(0.8, { scale: new Vec3(0.86, 0.86, 1) }, { easing: 'sineInOut' }),
            )
            .start();

        const crystalCore = this.createNode(panel, `Target${tile}CrystalCore`, 0, 135, 156, 156);
        const crystalOpacity = crystalCore.addComponent(UIOpacity);
        crystalOpacity.opacity = 210;
        const crystalGraphics = crystalCore.addComponent(Graphics);
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.core, 84);
        crystalGraphics.moveTo(0, -57);
        crystalGraphics.lineTo(57, 0);
        crystalGraphics.lineTo(0, 57);
        crystalGraphics.lineTo(-57, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        crystalCore.active = !popupFrame;
        crystalGraphics.strokeColor = colorWithAlpha(targetMaterial.accent, 210);
        crystalGraphics.lineWidth = 3;
        crystalGraphics.stroke();
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 112);
        crystalGraphics.moveTo(0, -40);
        crystalGraphics.lineTo(40, 0);
        crystalGraphics.lineTo(0, 40);
        crystalGraphics.lineTo(-40, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        tween(crystalCore)
            .repeatForever(
                tween()
                    .to(0.52, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .to(0.52, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        tween(crystalOpacity)
            .repeatForever(
                tween()
                    .to(0.52, { opacity: 255 }, { easing: 'sineInOut' })
                    .to(0.52, { opacity: 168 }, { easing: 'sineInOut' }),
            )
            .start();

        const burst = this.createNode(panel, 'AchievementBurst', 0, 135, 276, 216);
        const burstGraphics = burst.addComponent(Graphics);
        for (let index = 0; index < 20; index += 1) {
            const angle = (Math.PI * 2 * index) / 20;
            const inner = index % 2 === 0 ? 72 : 80;
            const outer = index % 2 === 0 ? 102 : 94;
            burstGraphics.strokeColor = index % 3 === 0
                ? colorWithAlpha(targetMaterial.accent, 112)
                : colorWithAlpha(targetMaterial.facet, 138);
            burstGraphics.lineWidth = index % 2 === 0 ? 3 : 2;
            burstGraphics.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            burstGraphics.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            burstGraphics.stroke();
        }
        burstGraphics.strokeColor = colorWithAlpha(targetMaterial.glow, 92);
        burstGraphics.lineWidth = 2;
        burstGraphics.circle(0, 0, 88);
        burstGraphics.stroke();
        burst.active = !popupFrame;

        const badgeSize = 190;
        // 两种达成态使用独立下移量：2048 文案较短，需要更明显的顶部留白；
        // 4096 标题较长，只做较小幅度下移。按钮仍由底部基线统一定位。
        const achievementContentOffsetY = tile === TARGET_TILE ? -18 : -32;
        const achievementTitleY = panelHeight / 2 - 132 + achievementContentOffsetY;
        const badgeCenterY = achievementTitleY - 135;
        const badge = this.createNode(panel, `Unlocked${tile}Tile`, 0, badgeCenterY, badgeSize, badgeSize);
        this.drawTile(badge, tile, badgeSize);

        const sparkColors = [
            colorWithAlpha(targetMaterial.facet, 255),
            colorWithAlpha(targetMaterial.accent, 255),
            colorWithAlpha(targetMaterial.glow, 255),
        ] as const;
        const sparkPositions = [
            [-144, 201], [-122, 111], [136, 204], [151, 119], [-172, 156], [177, 166],
        ] as const;
        sparkPositions.forEach(([x, y], index) => {
            const spark = this.createNode(panel, `CelebrationSpark-${index}`, x, y, 16, 16);
            const opacity = spark.addComponent(UIOpacity);
            const sparkGraphics = spark.addComponent(Graphics);
            const color = sparkColors[index % sparkColors.length];
            sparkGraphics.fillColor = new Color(color.r, color.g, color.b, 230);
            if (index % 2 === 0) {
                sparkGraphics.moveTo(0, 8);
                sparkGraphics.lineTo(3, 3);
                sparkGraphics.lineTo(8, 0);
                sparkGraphics.lineTo(3, -3);
                sparkGraphics.lineTo(0, -8);
                sparkGraphics.lineTo(-3, -3);
                sparkGraphics.lineTo(-8, 0);
                sparkGraphics.lineTo(-3, 3);
                sparkGraphics.close();
                sparkGraphics.fill();
            } else {
                sparkGraphics.circle(0, 0, 4);
                sparkGraphics.fill();
            }
            spark.active = !popupFrame;
            spark.setScale(0.35, 0.35, 1);
            tween(spark)
                .delay(0.08 + index * 0.035)
                .to(0.28, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
                .to(0.18, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'sineInOut' })
                .start();
            tween(opacity)
                .repeatForever(
                    tween()
                        .to(0.62 + index * 0.04, { opacity: 115 }, { easing: 'sineInOut' })
                        .to(0.62 + index * 0.04, { opacity: 255 }, { easing: 'sineInOut' }),
                )
                .start();
        });

        const achievementTitle = tile === TARGET_TILE ? '终极目标达成' : '恭喜你达成';
        const title = this.createLabel(
            panel,
            'Title',
            achievementTitle,
            0,
            achievementTitleY,
            tile === TARGET_TILE ? 46 : 50,
            colorWithAlpha(targetMaterial.facet, 255),
            panelWidth - 112,
            62,
        );
        title.isBold = true;
        const achievementTitleOutline = title.node.addComponent(LabelOutline);
        achievementTitleOutline.color = colorWithAlpha(targetMaterial.glow, 142);
        achievementTitleOutline.width = 3;
        const scoreChipWidth = 450;
        const scoreChipHeight = 78;
        const scoreChip = this.createNode(
            panel,
            'AchievementScore',
            0,
            badgeCenterY - 170,
            scoreChipWidth,
            scoreChipHeight,
        );
        const scoreGraphics = scoreChip.addComponent(Graphics);
        scoreGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 16);
        scoreGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 104);
        scoreGraphics.lineWidth = 1.5;
        scoreGraphics.roundRect(-scoreChipWidth / 2, -scoreChipHeight / 2, scoreChipWidth, scoreChipHeight, 13);
        scoreGraphics.fill();
        scoreGraphics.stroke();
        const scoreArtwork = this.createPopupArtwork(
            scoreChip,
            'AchievementScoreArtwork',
            this.ownedAchievementScoreFrame,
            scoreChipWidth,
            scoreChipHeight,
        );
        scoreGraphics.enabled = !scoreArtwork;
        const scoreCaption = this.createLabel(
            scoreChip, 'ScoreCaption', '本局得分', -98, 0, 26, COLORS.muted, 188, 46,
        );
        scoreCaption.isBold = true;
        const scoreValue = this.createLabel(
            scoreChip, 'ScoreValue', `${this.model.score}`, 115, 0, 30, COLORS.white, 205, 46,
        );
        scoreValue.isBold = true;

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildTargetOverlay(actions, tile),
            busy: false,
        };
        const buttonWidth = Math.min(460, panelWidth - 120);
        const buttonHeight = 86;
        const buttonGap = 90;
        const lastButtonCenterY = -panelHeight / 2
            + GAME_2048_POPUP_BUTTON_BOTTOM_PADDING
            + buttonHeight / 2;
        const buttonStartY = lastButtonCenterY + (actions.length - 1) * buttonGap;
        actions.forEach((action, index) => {
            const button = this.createOverlayButton(
                panel, action.name, action.label, 0, buttonStartY - index * buttonGap,
                buttonWidth, buttonHeight, action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });

        if (!popupFrame) {
            burst.setScale(0.55, 0.55, 1);
            tween(burst).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        panel.setScale(panelScale * 0.82, panelScale * 0.76, 1);
        tween(panel).to(0.28, { scale: new Vec3(panelScale, panelScale, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private buildOverlay(
        name: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
        resultContent?: ResultOverlayContent,
    ): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, name, 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = COLORS.overlay;
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        const panelWidth = resultContent ? 580 : 570;
        const panelHeight = panelWidth * (resultContent
            ? GAME_2048_RESULT_POPUP_ASPECT_RATIO
            : GAME_2048_SYSTEM_POPUP_ASPECT_RATIO);
        const availableWidth = Math.max(1, layout.contentWidth - 40);
        const availableHeight = Math.max(1, height - layout.safeTop - layout.safeBottom - 40);
        const panelScale = Math.min(1, availableWidth / panelWidth, availableHeight / panelHeight);
        const panel = this.createNode(
            root,
            'NeonPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        const popupFrame = resultContent ? this.ownedResultPopupFrame : this.ownedSystemPopupFrame;
        this.createPopupArtwork(panel, 'PopupPanelArtwork', popupFrame, panelWidth, panelHeight);
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 28);
        graphics.lineWidth = 16;
        graphics.roundRect(-panelWidth / 2 - 8, -panelHeight / 2 - 8, panelWidth + 16, panelHeight + 16, 38);
        graphics.stroke();
        graphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 16);
        graphics.roundRect(-panelWidth / 2 - 10, -panelHeight / 2 - 10, panelWidth + 20, panelHeight + 20, 34);
        graphics.fill();
        graphics.fillColor = COLORS.panel;
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 188);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 30);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 62);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 24);
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 112);
        graphics.moveTo(-72, panelHeight / 2 - 78);
        graphics.lineTo(72, panelHeight / 2 - 78);
        graphics.stroke();
        graphics.enabled = !popupFrame;

        // 原型顶部的悬浮菱形状态核，结算态切换为金色，暂停/开发层保持青紫。
        const crestAccent = resultContent ? COLORS.amber : COLORS.cyan;
        const crest = this.createNode(panel, 'OverlayCrest', 0, panelHeight / 2 - 8, 84, 84);
        const crestGraphics = crest.addComponent(Graphics);
        crestGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 255);
        crestGraphics.strokeColor = new Color(crestAccent.r, crestAccent.g, crestAccent.b, 245);
        crestGraphics.lineWidth = 4;
        crestGraphics.moveTo(0, 38);
        crestGraphics.lineTo(38, 0);
        crestGraphics.lineTo(0, -38);
        crestGraphics.lineTo(-38, 0);
        crestGraphics.close();
        crestGraphics.fill();
        crestGraphics.stroke();
        crestGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 210);
        crestGraphics.lineWidth = 2;
        crestGraphics.moveTo(0, 27);
        crestGraphics.lineTo(27, 0);
        crestGraphics.lineTo(0, -27);
        crestGraphics.lineTo(-27, 0);
        crestGraphics.close();
        crestGraphics.stroke();
        crestGraphics.fillColor = new Color(crestAccent.r, crestAccent.g, crestAccent.b, 230);
        crestGraphics.rect(-10, -10, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 230);
        crestGraphics.rect(2, -10, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 230);
        crestGraphics.rect(-10, 2, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 230);
        crestGraphics.rect(2, 2, 8, 8);
        crestGraphics.fill();
        crest.active = !popupFrame;

        const contentTop = panelHeight / 2 - (resultContent ? 160 : 150);
        const titleLabel = this.createLabel(
            panel,
            'Title',
            title,
            0,
            contentTop - 15,
            resultContent ? 60 : 56,
            COLORS.white,
            panelWidth - 112,
            70,
        );
        titleLabel.isBold = true;
        const titleOutline = titleLabel.node.addComponent(LabelOutline);
        titleOutline.color = resultContent
            ? new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 138)
            : new Color(77, 171, 255, 168);
        titleOutline.width = resultContent ? 4 : 3;
        if (resultContent) {
            const scoreCaption = this.createLabel(panel, 'ScoreCaption', '最终分数', 0, contentTop - 95, 26,
                COLORS.cyan, panelWidth - 128, 38);
            scoreCaption.isBold = true;
            const scoreChipWidth = 430;
            const scoreChipHeight = 130;
            const scoreChip = this.createNode(panel, 'ResultScoreChip', 0, contentTop - 190, scoreChipWidth, scoreChipHeight);
            const scoreGraphics = scoreChip.addComponent(Graphics);
            scoreGraphics.fillColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 22);
            scoreGraphics.strokeColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 220);
            scoreGraphics.lineWidth = 2;
            scoreGraphics.roundRect(-scoreChipWidth / 2, -scoreChipHeight / 2, scoreChipWidth, scoreChipHeight, 17);
            scoreGraphics.fill();
            scoreGraphics.stroke();
            const scoreArtwork = this.createPopupArtwork(
                scoreChip,
                'ResultScoreArtwork',
                this.ownedResultScoreFrame,
                scoreChipWidth,
                scoreChipHeight,
            );
            scoreGraphics.enabled = !scoreArtwork;
            const scoreLabel = this.createLabel(scoreChip, 'Score', `${resultContent.score}`, 0, 0, 54,
                COLORS.amber, scoreChipWidth - 54, 70);
            scoreLabel.isBold = true;
            const highestLabel = this.createLabel(
                panel,
                'HighestTile',
                `本局最高数字  ${resultContent.highestTile}`,
                0,
                contentTop - 287,
                25,
                COLORS.muted,
                panelWidth - 128,
                40,
            );
            highestLabel.isBold = true;
        } else {
            const [scoreLine = body, descriptionLine = ''] = body.split('\n');
            const scoreLineLabel = this.createLabel(
                panel, 'ScoreLine', scoreLine, 0, contentTop - 106, 30,
                new Color(112, 202, 255, 255), panelWidth - 132, 42,
            );
            scoreLineLabel.isBold = true;
            this.createLabel(
                panel, 'DescriptionLine', descriptionLine, 0, contentTop - 156, 25,
                COLORS.muted, panelWidth - 132, 40,
            );
        }

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildOverlay(name, title, body, actions, resultContent),
            busy: false,
        };
        const buttonGap = resultContent ? 90 : 98;
        const buttonWidth = Math.min(460, panelWidth - 120);
        const buttonHeight = 86;
        const lastButtonCenterY = -panelHeight / 2
            + GAME_2048_POPUP_BUTTON_BOTTOM_PADDING
            + buttonHeight / 2;
        const startY = lastButtonCenterY + (actions.length - 1) * buttonGap;
        actions.forEach((action, index) => {
            const button = this.createOverlayButton(
                panel,
                action.name,
                action.label,
                0,
                startY - index * buttonGap,
                buttonWidth,
                buttonHeight,
                action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });
        panel.setScale(panelScale * 0.86, panelScale * 0.78, 1);
        tween(panel).to(0.22, { scale: new Vec3(panelScale, panelScale, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 140;
        });
        try {
            await action.action();
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
            }
        } catch (error: unknown) {
            console.error(`[Game2048Game] ${action.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
            }
        }
    }

    private createPauseButton(parent: Node, name: string, x: number, y: number): Button {
        const node = this.createNode(
            parent,
            name,
            x,
            y,
            GAME_2048_PAUSE_TOUCH_SIZE,
            GAME_2048_PAUSE_TOUCH_SIZE,
        );
        node.addComponent(UIOpacity);

        // 资源加载失败时保留一个无文字的暂停符号，保证入口仍然可见可用。
        const fallback = this.createNode(
            node,
            'PauseFallback',
            0,
            0,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
        );
        const fallbackGraphics = fallback.addComponent(Graphics);
        fallbackGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 245);
        fallbackGraphics.roundRect(
            -GAME_2048_PAUSE_ICON_SIZE / 2,
            -GAME_2048_PAUSE_ICON_SIZE / 2,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
            11,
        );
        fallbackGraphics.fill();
        fallbackGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 210);
        fallbackGraphics.lineWidth = 2;
        fallbackGraphics.roundRect(
            -GAME_2048_PAUSE_ICON_SIZE / 2 + 1,
            -GAME_2048_PAUSE_ICON_SIZE / 2 + 1,
            GAME_2048_PAUSE_ICON_SIZE - 2,
            GAME_2048_PAUSE_ICON_SIZE - 2,
            10,
        );
        fallbackGraphics.stroke();
        fallbackGraphics.fillColor = COLORS.cyan;
        fallbackGraphics.roundRect(-11, -18, 6, 36, 3);
        fallbackGraphics.roundRect(5, -18, 6, 36, 3);
        fallbackGraphics.fill();

        const artworkNode = this.createNode(
            node,
            'PauseArtwork',
            0,
            0,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
        );
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artworkNode.active = false;
        this.pauseFallback = fallback;
        this.pauseArtwork = artwork;

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        return button;
    }

    private createPopupArtwork(
        parent: Node,
        name: string,
        frame: SpriteFrame | undefined,
        width: number,
        height: number,
    ): Sprite | undefined {
        if (!frame) return undefined;
        const artworkNode = this.createNode(parent, name, 0, 0, width, height);
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artwork.spriteFrame = frame;
        artworkNode.setSiblingIndex(0);
        return artwork;
    }

    /** 弹窗专用的晶体切角按钮，不影响 HUD 与开发入口的原有按钮皮肤。 */
    private createOverlayButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tone: 'cyan' | 'amber' | 'dark',
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        const accent = tone === 'cyan' ? COLORS.cyan
            : tone === 'amber' ? COLORS.amber
                : COLORS.violet;
        const fill = tone === 'dark'
            ? new Color(COLORS.panel.r, COLORS.panel.g, COLORS.panel.b, 252)
            : new Color(
                Math.round(COLORS.panel.r * 0.6 + accent.r * 0.4),
                Math.round(COLORS.panel.g * 0.6 + accent.g * 0.4),
                Math.round(COLORS.panel.b * 0.6 + accent.b * 0.4),
                255,
            );

        graphics.fillColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 14 : 32);
        this.drawChamferedRectPath(graphics, -width / 2 - 6, -height / 2 - 5, width + 12, height + 10, 15);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 170 : 235);
        graphics.lineWidth = tone === 'dark' ? 2 : 2.5;
        this.drawChamferedRectPath(graphics, -width / 2, -height / 2, width, height, 12);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 82);
        graphics.lineWidth = 1;
        this.drawChamferedRectPath(graphics, -width / 2 + 6, -height / 2 + 6, width - 12, height - 12, 8);
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 130);
        graphics.moveTo(-width / 2 + 30, height / 2 - 7);
        graphics.lineTo(width / 2 - 30, height / 2 - 7);
        graphics.stroke();

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        const artworkFrame = this.ownedPopupButtonFrames.get(tone);
        graphics.enabled = !artworkFrame;
        if (artworkFrame) {
            const artworkNode = this.createNode(node, 'ButtonArtwork', 0, 0, width, height);
            const artwork = artworkNode.addComponent(Sprite);
            artwork.sizeMode = Sprite.SizeMode.CUSTOM;
            artwork.spriteFrame = artworkFrame;
            artworkNode.setSiblingIndex(0);
        }
        const isRewardedAdButton = name === 'WatchAdButton';
        // 看视频按钮采用紧凑的文字盒，图标才能贴着文字左缘布局，避免按整块按钮宽度居中造成视觉间距过大。
        const labelWidth = isRewardedAdButton ? 240 : width - 24;
        const label = this.createLabel(node, 'Label', text, isRewardedAdButton ? 22 : 0, 0, height <= 54 ? 22 : 24,
            tone === 'dark' ? new Color(196, 156, 255, 255) : COLORS.white, labelWidth, height - 8);
        label.isBold = true;
        return button;
    }

    private drawChamferedRectPath(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        cut: number,
    ): void {
        const right = x + width;
        const top = y + height;
        const corner = Math.max(0, Math.min(cut, width / 2, height / 2));
        graphics.moveTo(x + corner, top);
        graphics.lineTo(right - corner, top);
        graphics.lineTo(right, top - corner);
        graphics.lineTo(right, y + corner);
        graphics.lineTo(right - corner, y);
        graphics.lineTo(x + corner, y);
        graphics.lineTo(x, y + corner);
        graphics.lineTo(x, top - corner);
        graphics.close();
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tone: 'cyan' | 'amber' | 'dark',
        flushRightEdge = false,
        matchScoreCardStyle = false,
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        const drawButtonShape = (
            shapeX: number,
            shapeY: number,
            shapeWidth: number,
            shapeHeight: number,
            radius: number,
            includeRightEdge: boolean,
        ): void => {
            if (flushRightEdge) {
                this.drawLeftRoundedButtonPath(
                    graphics,
                    shapeX,
                    shapeY,
                    shapeWidth,
                    shapeHeight,
                    radius,
                    includeRightEdge,
                );
                return;
            }
            graphics.roundRect(shapeX, shapeY, shapeWidth, shapeHeight, radius);
        };
        const accent = tone === 'cyan' ? COLORS.cyan
            : tone === 'amber' ? COLORS.amber
                : new Color(91, 157, 177, 255);
        if (matchScoreCardStyle) {
            // 暂停按钮与分数卡片复用同一套面板底色、外发光、主边框和内描边。
            graphics.fillColor = new Color(accent.r, accent.g, accent.b, 14);
            drawButtonShape(-width / 2 - 5, -height / 2 - 6, width + 10, height + 10, 24, true);
            graphics.fill();
            graphics.fillColor = COLORS.panelLight;
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 155);
            graphics.lineWidth = 2;
            drawButtonShape(-width / 2, -height / 2, width, height, 20, true);
            graphics.fill();
            drawButtonShape(-width / 2, -height / 2, width, height, 20, !flushRightEdge);
            graphics.stroke();
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 48);
            graphics.lineWidth = 1;
            drawButtonShape(
                -width / 2 + 6,
                -height / 2 + 6,
                width - 12,
                height - 12,
                16,
                !flushRightEdge,
            );
            graphics.stroke();
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 100);
            graphics.moveTo(-width / 2 + 22, height / 2 - 7);
            graphics.lineTo(width / 2 - 22, height / 2 - 7);
            graphics.stroke();
        } else {
            const fill = tone === 'dark' ? COLORS.panelLight : new Color(
                Math.round(COLORS.panel.r * 0.68 + accent.r * 0.32),
                Math.round(COLORS.panel.g * 0.68 + accent.g * 0.32),
                Math.round(COLORS.panel.b * 0.68 + accent.b * 0.32),
                255,
            );
            graphics.fillColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 9 : 16);
            drawButtonShape(-width / 2 - 5, -height / 2 - 5, width + 10, height + 10, 19, true);
            graphics.fill();
            graphics.fillColor = fill;
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 130 : 188);
            graphics.lineWidth = 2;
            drawButtonShape(-width / 2, -height / 2, width, height, 15, true);
            graphics.fill();
            drawButtonShape(-width / 2, -height / 2, width, height, 15, !flushRightEdge);
            graphics.stroke();
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 58);
            graphics.lineWidth = 1;
            drawButtonShape(
                -width / 2 + 5,
                -height / 2 + 5,
                flushRightEdge ? width - 5 : width - 10,
                height - 10,
                11,
                !flushRightEdge,
            );
            graphics.stroke();
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 112);
            graphics.moveTo(-width / 2 + 22, height / 2 - 7);
            graphics.lineTo(width / 2 - 22, height / 2 - 7);
            graphics.stroke();
        }
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        const label = this.createLabel(node, 'Label', text, 0, 0, height <= 58 ? 23 : 27,
            COLORS.white, width - 20, height - 8);
        label.isBold = true;
        return button;
    }

    private drawLeftRoundedButtonPath(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        includeRightEdge: boolean,
    ): void {
        const left = x;
        const right = x + width;
        const bottom = y;
        const top = y + height;
        const corner = Math.max(0, Math.min(radius, Math.min(width, height) / 2));

        graphics.moveTo(left + corner, top);
        graphics.lineTo(right, top);
        if (includeRightEdge) graphics.lineTo(right, bottom);
        else graphics.moveTo(right, bottom);
        graphics.lineTo(left + corner, bottom);
        graphics.quadraticCurveTo(left, bottom, left, bottom + corner);
        graphics.lineTo(left, top - corner);
        graphics.quadraticCurveTo(left, top, left + corner, top);
        graphics.close();
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
        label.lineHeight = fontSize + 9;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private tilePosition(index: number, boardSize: number, gap: number, tileSize: number): { x: number; y: number } {
        const row = Math.floor(index / BOARD_SIZE);
        const column = index % BOARD_SIZE;
        return {
            x: -boardSize / 2 + gap + tileSize / 2 + column * (tileSize + gap),
            y: boardSize / 2 - gap - tileSize / 2 - row * (tileSize + gap),
        };
    }

    private destroyOverlay(state?: OverlayState): void {
        if (state?.root.isValid) this.destroyNodeWithTweens(state.root);
    }

    private destroyNodeWithTweens(node: Node): void {
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        node.getComponents(UIOpacity).forEach((opacity) => Tween.stopAllByTarget(opacity));
        node.destroy();
    }

}
