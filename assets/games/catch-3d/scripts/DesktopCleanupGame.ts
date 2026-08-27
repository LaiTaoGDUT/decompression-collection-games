import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Camera,
    Canvas,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    input,
    Input,
    JsonAsset,
    KeyCode,
    Label,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
    view,
    Quat,
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { DevicePerformanceTier } from '../../../core/types/CommonTypes';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { AccelerometerSample, Platform } from '../../../platform/Platform';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    attachRewardedVideoIcon,
    layoutRewardedVideoIconBeforeLabel,
    loadRewardedVideoIcon,
} from '../../../shared/ui/RewardedVideoIcon';
import {
    DEFAULT_DESKTOP_CLEANUP_CONFIG,
    parseDesktopCleanupGameplayConfig,
    type DesktopCleanupGameplayConfig,
} from './DesktopCleanupConfig';
import {
    DesktopCleanupModel,
    desktopCleanupDateKey,
    type DesktopCleanupActionResult,
    type DesktopCleanupMagnetEffect,
    type DesktopCleanupItemSnapshot,
    type DesktopCleanupItemType,
    type DesktopCleanupPendingSelection,
    type DesktopCleanupShakeInput,
    type DesktopCleanupSnapshot,
    type DesktopCleanupTool,
} from './DesktopCleanupModel';
import {
    DEFAULT_DESKTOP_CLEANUP_THEME_ID,
    getDesktopCleanupTheme,
    selectDesktopCleanupTheme,
    type DesktopCleanupThemeDefinition,
} from './DesktopCleanupTheme';
import {
    readDesktopCleanupLayout,
    type DesktopCleanupLayoutMetrics,
} from './DesktopCleanupLayout';
import {
    DESKTOP_CLEANUP_RULES_VERSION,
    readDesktopCleanupSave,
    writeDesktopCleanupSave,
    type DesktopCleanupSave,
} from './DesktopCleanupSave';
import { DesktopCleanupPhysicsWorld } from './DesktopCleanupPhysicsWorld';

const { ccclass, property } = _decorator;

const BUNDLE = 'game-catch-3d';
const BACKGROUND_PATH = 'visual/backgrounds/desktop-cleanup-backdrop-v2/texture';
const PLAYMAT_PATH = 'visual/backgrounds/desktop-cleanup-playmat-v2/texture';
const PICKUP_ANIMATION_DURATION_SECONDS = 0.2;
const PICKUP_ANIMATION_WATCHDOG_SECONDS = PICKUP_ANIMATION_DURATION_SECONDS + 0.16;
const MATCH_SMOKE_INITIAL_SCALE = 0.24;
const MATCH_SMOKE_PEAK_SCALE = 0.96;
const MATCH_SMOKE_FINAL_SCALE = 1.14;
const SLOT_CLEAR_ITEM_STAGGER_SECONDS = 0.055;
const SLOT_CLEAR_ITEM_DURATION_SECONDS = 0.28;
const SLOT_CLEAR_EFFECT_DURATION_SECONDS = 0.22;
const SLOT_CLEAR_EFFECT_SIZE = 156;
const PILE_BIRTH_RADIAL_BAND_SIZE = 0.08;
const PILE_BIRTH_RADIAL_BAND_DELAY_SECONDS = 0.065;
const PILE_BIRTH_ITEM_STAGGER_SECONDS = 0.006;
const PILE_BIRTH_ITEM_DURATION_SECONDS = 0.22;
const PILE_BIRTH_START_SCALE = 0.68;
const PILE_BIRTH_START_CENTER_RATIO = 0;
const PILE_BIRTH_START_ANGLE = 8;
// 加速度计读数包含重力分量。先用慢速基线滤掉姿态变化，再把短时间内的
// 有效运动量累计到阈值，避免轻轻倾斜手机就触发一次颠锅。
const ACCELEROMETER_GRAVITY_SMOOTHING = 0.88;
const ACCELEROMETER_SHAKE_DEADZONE = 0.1;
const ACCELEROMETER_SHAKE_TRIGGER = 0.5;
const ACCELEROMETER_SHAKE_WINDOW_MS = 280;
const ACCELEROMETER_SHAKE_COOLDOWN_MS = 240;
const ACCELEROMETER_SHAKE_MIN_SAMPLES = 3;
const ACCELEROMETER_SHAKE_ENERGY_DECAY = 0.82;
const ACCELEROMETER_SHAKE_DIRECTION_DECAY = 0.45;
const ACCELEROMETER_SHAKE_MIN_STRENGTH = 0.72;
const ACCELEROMETER_SHAKE_MAX_STRENGTH = 1.25;
const THEME_TEXTURE_PATHS = Object.freeze({
    playmat: PLAYMAT_PATH,
    help: 'visual/ui/desktop-cleanup-hud-help-v2/texture',
    pause: 'visual/ui/desktop-cleanup-hud-pause-v2/texture',
    title: 'visual/ui/desktop-cleanup-title-emblem-v2/texture',
    timer: 'visual/ui/desktop-cleanup-timer-plate-v2/texture',
    tray: 'visual/ui/desktop-cleanup-slot-tray-7-v2/texture',
    return: 'visual/ui/desktop-cleanup-tool-return-v2/texture',
    magnet: 'visual/ui/desktop-cleanup-tool-magnet-v2/texture',
    shuffle: 'visual/ui/desktop-cleanup-tool-shuffle-v2/texture',
    popupPanel: 'visual/ui/desktop-cleanup-popup-panel-v1/texture',
    popupButtonTeal: 'visual/ui/desktop-cleanup-popup-button-teal-v1/texture',
    popupButtonCoral: 'visual/ui/desktop-cleanup-popup-button-coral-v1/texture',
    popupButtonPaper: 'visual/ui/desktop-cleanup-popup-button-paper-v1/texture',
    smoke: 'visual/vfx/desktop-cleanup-match-smoke-v1/texture',
} as const);
type ThemeFrameKey = keyof typeof THEME_TEXTURE_PATHS;
const THEME_FRAME_KEYS: readonly ThemeFrameKey[] = Object.freeze([
    'playmat',
    'help',
    'pause',
    'title',
    'timer',
    'tray',
    'return',
    'magnet',
    'shuffle',
    'popupPanel',
    'popupButtonTeal',
    'popupButtonCoral',
    'popupButtonPaper',
    'smoke',
]);
const POPUP_BUTTON_FRAME_RECTS: Readonly<Partial<Record<ThemeFrameKey, Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
}>>>> = Object.freeze({
    // Tight alpha crop (threshold 8) removes transparent padding that would
    // otherwise make equal-size sliced buttons render at different sizes.
    popupButtonTeal: Object.freeze({ x: 20, y: 30, width: 459, height: 118 }),
    popupButtonCoral: Object.freeze({ x: 33, y: 30, width: 433, height: 105 }),
    popupButtonPaper: Object.freeze({ x: 24, y: 18, width: 452, height: 126 }),
});
const POPUP_BUTTON_HORIZONTAL_INSET_RATIO = 0.2;
const TOOL_TITLES: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '清除夹',
    magnet: '磁吸盒',
    shuffle: '桌面风暴',
});

const TOOL_DESCRIPTIONS: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '从收纳槽中清除最近放入的最多 3 件物品，适合在槽位快满时直接腾出空间。',
    magnet: '自动寻找最容易凑齐的一类物品，并直接完成一组三件收纳。',
    shuffle: '将桌面上仍未收纳的物品重新压叠成一座紧凑物件堆，并改变露出顺序。',
});

const COLORS = Object.freeze({
    ink: new Color(39, 48, 69, 255),
    inkSoft: new Color(65, 77, 103, 255),
    cream: new Color(248, 232, 199, 255),
    paper: new Color(255, 248, 229, 255),
    desk: new Color(135, 90, 62, 255),
    deskDark: new Color(78, 51, 44, 255),
    coral: new Color(235, 119, 100, 255),
    teal: new Color(86, 177, 166, 255),
    mustard: new Color(232, 180, 69, 255),
    lilac: new Color(155, 126, 176, 255),
    overlay: new Color(28, 30, 42, 210),
    muted: new Color(112, 105, 101, 255),
    white: new Color(255, 253, 244, 255),
});

type GameState = 'idle' | 'ready' | 'rules' | 'tool-help' | 'playing' | 'paused' | 'failed' | 'completed' | 'disposed';

export interface DesktopCleanupServices {
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    readonly ads: AdService;
    readonly deviceTier?: DevicePerformanceTier;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'coral' | 'teal' | 'paper' | 'mustard';
    readonly action: () => void | Promise<void>;
    readonly adIcon?: boolean;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

interface PendingPileTap {
    readonly touchId: number;
    readonly itemId?: string;
    readonly type?: DesktopCleanupItemType;
    readonly node?: Node;
}

interface DesktopCleanupMatchAnimation {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
    readonly root: Node;
    readonly leftNode: Node;
    readonly middleNode: Node;
    readonly rightNode: Node;
    smoke?: Node;
}

interface DesktopCleanupPickupAnimation {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
    readonly node: Node;
}

interface DesktopCleanupPendingMatch {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
}

interface DesktopCleanupSlotMove {
    readonly node: Node;
    readonly target: Vec3;
    readonly finish: () => void;
}

interface DesktopCleanupPileBirthEntry {
    readonly node: Node;
    readonly position: Vec3;
    readonly angle: number;
    readonly scale: number;
    readonly delay: number;
}

interface DesktopCleanupPileBirthAnimation {
    readonly token: number;
    readonly generation: number;
    readonly entries: readonly DesktopCleanupPileBirthEntry[];
    readonly finish: () => void;
}

interface DesktopCleanupSlotClearAnimation {
    readonly token: number;
    readonly generation: number;
    readonly root: Node;
    readonly itemIds: readonly string[];
    readonly itemNodes: readonly Node[];
    readonly effectRoot?: Node;
    readonly effectNodes: readonly Node[];
    readonly finish: () => void;
}

interface DesktopCleanupSelectionHighlight {
    readonly itemId: string;
    readonly source: Node;
    readonly node: Node;
    readonly graphics: Graphics;
}

@ccclass('DesktopCleanupGame3D')
export class DesktopCleanupGame3D extends Component implements MiniGame<DesktopCleanupServices> {
    @property(Node)
    private worldRoot: Node | null = null;

    @property(Camera)
    private worldCamera: Camera | null = null;

    private state: GameState = 'idle';
    private stateBeforePause: GameState = 'playing';
    private context?: MiniGameContext<DesktopCleanupServices>;
    private config: DesktopCleanupGameplayConfig = DEFAULT_DESKTOP_CLEANUP_CONFIG;
    private theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme();
    private model?: DesktopCleanupModel;
    private readonly physicsWorld = new DesktopCleanupPhysicsWorld();
    private save: DesktopCleanupSave = Object.freeze({
        playCount: 0,
        highScore: 0,
        wins: 0,
        rulesSeenVersion: 0,
    });
    private roundStartedAt = 0;
    private layout?: DesktopCleanupLayoutMetrics;
    private pileRoot?: Node;
    private selectionRoot?: Node;
    private slotRoot?: Node;
    private pickupRoot?: Node;
    private timerLabel?: Label;
    private headerLogoRoot?: Node;
    private hintRoot?: Node;
    private hintLabel?: Label;
    private pileItemNodes = new Map<string, Node>();
    private pileItemTypes = new Map<string, DesktopCleanupItemType>();
    private slotItemNodes = new Map<string, Node>();
    private readonly slotMoveTokens = new Map<string, DesktopCleanupSlotMove>();
    private toolButtons = new Map<DesktopCleanupTool, Button>();
    private pauseButton?: Button;
    private helpButton?: Button;
    private rulesOverlay?: OverlayState;
    private toolHelpOverlay?: OverlayState;
    private activeToolHelp?: DesktopCleanupTool;
    private failureOverlay?: OverlayState;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private pauseModel?: MiniGamePauseModel;
    private resultModel?: MiniGameResultModel;
    private backgroundFrame?: SpriteFrame;
    private readonly themeFrames = new Map<ThemeFrameKey, SpriteFrame>();
    private presentationOpacity?: UIOpacity;
    private readonly popupButtonFrames = new Set<SpriteFrame>();
    private resizeListening = false;
    private inputLocked = false;
    private rulesFirstTime = false;
    private adBusy = false;
    private terminalPending = false;
    private operationGeneration = 0;
    private pileBirthAnimationPending = false;
    private pileBirthToken = 0;
    private pileBirthAnimation?: DesktopCleanupPileBirthAnimation;
    private readonly pickupAnimations = new Map<number, DesktopCleanupPickupAnimation>();
    private readonly matchAnimations = new Map<number, DesktopCleanupMatchAnimation>();
    private readonly magnetAnimationTokens = new Set<number>();
    private readonly slotClearAnimations = new Map<number, DesktopCleanupSlotClearAnimation>();
    private slotClearToken = 0;
    private magnetAnimationToken = 0;
    private readonly pendingMatchSelections = new Map<number, DesktopCleanupPendingMatch>();
    private readonly destroyedNodes = new WeakSet<Node>();
    private rendering = false;
    private renderQueued = false;
    private readonly pendingPileTaps = new Map<number, PendingPileTap>();
    private readonly selectionHighlights = new Map<string, DesktopCleanupSelectionHighlight>();
    private stopAccelerometer?: () => void;
    private lastAccelerometerSample?: AccelerometerSample;
    private accelerometerGravity?: AccelerometerSample;
    private accelerometerShakeEnergy = 0;
    private accelerometerShakeDirectionX = 0;
    private accelerometerShakeDirectionY = 0;
    private accelerometerShakeSampleCount = 0;
    private lastAccelerometerMotionAt = 0;
    private lastAccelerometerShakeAt = 0;
    private rewardedVideoIconFrame?: SpriteFrame;
    private lastHudSecond = -1;
    private lastReportedScore?: number;
    private readonly physicsFreezeReasons = new Set<string>();

    protected onLoad(): void {
        // The scene is intentionally only a bootstrap container. Hide the
        // root immediately so neither stale serialized nodes nor procedural
        // fallback graphics can flash while the formal theme loads.
        this.setPresentationVisible(false);
        this.node.children.slice().forEach((child) => this.destroyNode(child));
    }

    async initialize(context: MiniGameContext<DesktopCleanupServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize DesktopCleanupGame from ${this.state}.`);
        this.context = context;
        this.config = await this.loadGameplayConfig();
        this.theme = getDesktopCleanupTheme(DEFAULT_DESKTOP_CLEANUP_THEME_ID);
        this.save = readDesktopCleanupSave(context.services.storage);
        // Resolve the formal visual set before creating any gameplay nodes.
        // A missing theme must fail through the runtime's recoverable load
        // error path instead of exposing an obsolete procedural interface.
        await this.loadThemeAssets();
        if (this.isAdsEnabled()) {
            this.rewardedVideoIconFrame = await loadRewardedVideoIcon();
        }
        this.buildInterface();
        await this.initializePhysicsWorld();
        this.registerGlobalInput();
        this.stopAccelerometer = context.services.platform.onAccelerometerChange(this.handleAccelerometerChange);
        this.applyThemeAssets();
        this.setPresentationVisible(true);
        this.state = 'ready';
        this.ensureFrameDriver();
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin DesktopCleanupGame from ${this.state}.`);
        try {
            this.startRound();
        } catch (error: unknown) {
            const detail = error instanceof Error
                ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
                : String(error);
            console.error(`[DesktopCleanupGame] begin.failed\n${detail}`);
            throw error;
        }
    }

    private advanceFrame(deltaTime: number): void {
        if (this.state !== 'playing' || !this.model) return;
        this.physicsWorld.update(Math.max(0, deltaTime));
        // 物品按波次进入物理世界。物理节点一旦出生就立即补入逻辑→视图索引，
        // 否则射线虽然能命中碰撞体，但抬起时无法解析类型而不能拾取。
        this.renderPile(this.model.snapshot);
        this.syncSelectionHighlights();
        if (this.pileBirthAnimationPending && this.physicsWorld.isReady()) {
            this.pileBirthAnimationPending = false;
            this.inputLocked = false;
            this.startDeviceMotion();
            this.refreshTools();
        }
        if (this.inputLocked) return;
        this.model.tick(Math.max(0, deltaTime) * 1000);
        const second = Math.max(0, Math.ceil(this.model.remainingMs / 1000));
        if (second > 0 && second <= 30 && this.lastHudSecond > 30) {
            this.context?.services.feedback.play('danger');
        }
        if (second !== this.lastHudSecond) this.refreshHud();
        if (this.model.phase !== 'playing') this.syncTerminalPhase();
    }

    pause(): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready') return;
        this.clearPendingPileTaps();
        this.settlePendingImmediately();
        this.stopDeviceMotion();
        this.freezePhysics('lifecycle');
        if (this.state !== 'paused') this.stateBeforePause = this.state;
        this.state = 'paused';
        this.inputLocked = true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        if (this.adBusy) {
            this.unfreezePhysics('lifecycle');
            return;
        }
        this.state = this.stateBeforePause === 'paused' ? 'playing' : this.stateBeforePause;
        this.inputLocked = this.state !== 'playing';
        this.unfreezePhysics('lifecycle');
        if (this.state === 'playing') {
            this.startDeviceMotion();
        }
    }

    async restart(context?: MiniGameContext<DesktopCleanupServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') {
            throw new Error(`Cannot restart DesktopCleanupGame from ${this.state}.`);
        }
        if (context) this.context = context;
        this.resetOperations();
        this.destroyAllOverlays();
        this.startRound();
    }

    discardSavedProgress(): void {
        // This game intentionally stores records only; no in-progress round is persisted.
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.setPresentationVisible(false);
        this.operationGeneration += 1;
        this.pileBirthAnimationPending = false;
        this.cancelPileBirthAnimation();
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotClearAnimations();
        this.cancelSlotMoves();
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.stopAccelerometer?.();
        this.stopAccelerometer = undefined;
        this.physicsWorld.dispose();
        this.physicsFreezeReasons.clear();
        this.unregisterGlobalInput();
        this.unscheduleAllCallbacks();
        this.destroyAllOverlays();
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        this.backgroundFrame?.destroy();
        this.backgroundFrame = undefined;
        this.themeFrames.forEach((frame) => frame.destroy());
        this.themeFrames.clear();
        this.popupButtonFrames.forEach((frame) => frame.destroy());
        this.popupButtonFrames.clear();
        this.rewardedVideoIconFrame?.destroy();
        this.rewardedVideoIconFrame = undefined;
        this.pileItemNodes.clear();
        this.pileItemTypes.clear();
        this.slotItemNodes.clear();
        this.slotMoveTokens.clear();
        this.selectionHighlights.clear();
        this.lastAccelerometerSample = undefined;
        this.selectionRoot = undefined;
        this.pickupRoot = undefined;
        this.model = undefined;
        this.context = undefined;
        this.lastReportedScore = undefined;
        this.state = 'disposed';
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.stopDeviceMotion();
        this.pauseModel = model;
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = this.buildOverlay(
            'DesktopPauseOverlay',
            '先歇一会儿',
            '倒计时已经暂停，回来后会从当前时间继续',
            [
                { name: 'ResumeButton', label: '继续整理', tone: 'teal', action: model.resume },
                { name: 'RestartButton', label: '重新开局', tone: 'mustard', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
        this.pauseModel = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.resultModel = model;
        this.stopDeviceMotion();
        this.freezePhysics('result');
        this.state = 'completed';
        this.inputLocked = true;
        const extra = model.result.extra ?? {};
        const newRecord = extra.newRecord === true;
        const remaining = typeof extra.remainingSeconds === 'number'
            ? Math.max(0, Math.floor(extra.remainingSeconds))
            : 0;
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = this.buildOverlay(
            'DesktopResultOverlay',
            newRecord ? '最快清理！' : '桌面清爽啦',
            `剩余时间  ${remaining} 秒\n幸运徽章全部找回`,
            [
                { name: 'RestartButton', label: '再清一桌', tone: 'coral', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: model.returnToLobby },
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.resultModel = undefined;
    }

    private startRound(): void {
        this.ensureFrameDriver();
        const key = desktopCleanupDateKey();
        this.theme = selectDesktopCleanupTheme(this.config.themeId);
        this.activateItemThemeAssets();
        this.model = new DesktopCleanupModel(key, this.config, this.theme);
        this.roundStartedAt = Date.now();
        this.save = Object.freeze({ ...this.save, playCount: this.save.playCount + 1 });
        this.persistSave();
        this.terminalPending = false;
        this.inputLocked = true;
        this.pileBirthAnimationPending = true;
        this.lastHudSecond = -1;
        this.lastReportedScore = 0;
        this.lastAccelerometerSample = undefined;
        this.context?.reportScore(0);
        this.state = 'playing';
        this.stopDeviceMotion();
        this.physicsFreezeReasons.clear();
        this.physicsWorld.resume();
        this.physicsWorld.beginRound(this.model.snapshot.items);
        this.renderAll();
        this.setHint('');
        if (this.save.rulesSeenVersion < DESKTOP_CLEANUP_RULES_VERSION) {
            this.showRules(true);
        } else this.playPileBirthAnimation();
    }

    private ensureFrameDriver(): void {
        this.unschedule(this.advanceFrame);
        this.schedule(this.advanceFrame, 0);
    }

    private freezePhysics(reason: string): void {
        this.physicsFreezeReasons.add(reason);
        this.physicsWorld.pause();
    }

    private unfreezePhysics(reason: string): void {
        this.physicsFreezeReasons.delete(reason);
        if (this.physicsFreezeReasons.size === 0) this.physicsWorld.resume();
    }

    private resetOperations(): void {
        this.operationGeneration += 1;
        this.pileBirthAnimationPending = false;
        this.cancelPileBirthAnimation();
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotClearAnimations();
        this.cancelSlotMoves();
        this.adBusy = false;
        this.terminalPending = false;
        this.inputLocked = false;
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.unscheduleAllCallbacks();
    }

    private async loadGameplayConfig(): Promise<DesktopCleanupGameplayConfig> {
        const bundle = assetManager.getBundle(BUNDLE);
        if (!bundle) return DEFAULT_DESKTOP_CLEANUP_CONFIG;
        return new Promise((resolve) => {
            bundle.load('configs/gameplay', JsonAsset, (error, asset) => {
                if (error || !asset) {
                    console.warn('[DesktopCleanupGame] Gameplay config unavailable; using defaults.', error);
                    resolve(DEFAULT_DESKTOP_CLEANUP_CONFIG);
                    return;
                }
                resolve(parseDesktopCleanupGameplayConfig(asset.json));
            });
        });
    }

    private async initializePhysicsWorld(): Promise<void> {
        const worldRoot = this.worldRoot;
        const worldCamera = this.worldCamera;
        const backdropTexture = this.backgroundFrame?.texture;
        const playmatTexture = this.themeFrames.get('playmat')?.texture;
        const trayTexture = this.themeFrames.get('tray')?.texture;
        if (!worldRoot
            || !worldCamera
            || !(backdropTexture instanceof Texture2D)
            || !(playmatTexture instanceof Texture2D)
            || !(trayTexture instanceof Texture2D)) {
            throw new Error('Desktop cleanup 3D world references or textures are missing.');
        }
        const uiCamera = this.node.scene?.getComponentInChildren(Canvas)?.cameraComponent;
        if (!uiCamera) throw new Error('Desktop cleanup Canvas camera is missing.');
        uiCamera.priority = 1;
        uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        await this.physicsWorld.initialize({
            host: this.node,
            worldRoot,
            worldCamera,
            worldLayer: worldRoot.layer,
            backdropTexture,
            playmatTexture,
            trayTexture,
            config: this.config,
            deviceTier: this.context?.services.deviceTier ?? 'medium',
        });
        this.syncPhysicsLayout();
    }

    private syncPhysicsLayout(): void {
        const visible = view.getVisibleSize();
        const layout = this.layout;
        const trayTransform = this.node.getChildByName('SlotTray')?.getComponent(UITransform);
        this.physicsWorld.setCameraLayout(
            visible.width,
            visible.height,
            layout?.boardHeight ?? visible.width,
            layout?.boardY ?? 0,
            layout?.slotY ?? 0,
            trayTransform?.contentSize.width ?? 644,
            trayTransform?.contentSize.height ?? 155,
        );
    }

    private async loadThemeAssets(): Promise<void> {
        const [background, themeTextures] = await Promise.all([
            this.loadTexture(BACKGROUND_PATH),
            Promise.all(THEME_FRAME_KEYS.map(async (key) => (
                [key, await this.loadTexture(THEME_TEXTURE_PATHS[key])] as const
            ))),
        ]);
        if (!background
            || themeTextures.some(([, texture]) => !texture)) {
            throw new Error('Desktop cleanup formal theme assets are incomplete.');
        }
        if (this.state === 'disposed' || !this.node.isValid) return;
        if (background) {
            this.backgroundFrame?.destroy();
            const frame = new SpriteFrame();
            frame.texture = background;
            this.backgroundFrame = frame;
        }
        themeTextures.forEach(([key, texture]) => {
            if (!texture) return;
            this.themeFrames.get(key)?.destroy();
            const frame = this.createThemeFrame(key, texture);
            this.themeFrames.set(key, frame);
        });
    }

    private setPresentationVisible(visible: boolean): void {
        const opacity = this.presentationOpacity
            ?? this.node.getComponent(UIOpacity)
            ?? this.node.addComponent(UIOpacity);
        this.presentationOpacity = opacity;
        opacity.opacity = visible ? 255 : 0;
        // Keep the world hierarchy active once it exists: Cocos physics
        // components created below an inactive root never receive a complete
        // backend lifecycle. Camera visibility is enough to prevent flashes.
        if (this.worldCamera?.isValid) this.worldCamera.enabled = visible;
    }

    private loadTexture(path: string): Promise<Texture2D | undefined> {
        const bundle = assetManager.getBundle(BUNDLE);
        if (!bundle) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture) {
                    console.warn(`[DesktopCleanupGame] Theme asset unavailable: ${path}`, error);
                    resolve(undefined);
                    return;
                }
                resolve(texture);
            });
        });
    }

    private activateItemThemeAssets(): void {
        this.applyHeaderLogo();
    }

    private createThemeFrame(key: ThemeFrameKey, texture: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        const crop = POPUP_BUTTON_FRAME_RECTS[key];
        if (crop) {
            frame.rect = new Rect(crop.x, crop.y, crop.width, crop.height);
            frame.originalSize = new Size(crop.width, crop.height);
            if (this.isPopupButtonFrameKey(key)) {
                // Buttons use horizontal slicing: preserve each rounded end and
                // stretch only the center strip to the shared target width.
                const horizontalInset = Math.min(
                    crop.width * POPUP_BUTTON_HORIZONTAL_INSET_RATIO,
                    crop.width / 2 - 1,
                );
                frame.insetLeft = horizontalInset;
                frame.insetRight = horizontalInset;
                frame.insetTop = 0;
                frame.insetBottom = 0;
            }
        } else {
            frame.originalSize = new Size(texture.width, texture.height);
        }
        frame.offset = new Vec2();
        return frame;
    }

    private buildInterface(): void {
        this.slotItemNodes.clear();
        this.slotMoveTokens.clear();
        this.selectionHighlights.clear();
        this.selectionRoot = undefined;
        this.pickupRoot = undefined;
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        const metrics = readDesktopCleanupLayout(
            this.node,
            this.context?.services.platform.getLayoutInfo(),
        );
        this.layout = metrics;
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.buildHeader(metrics);
        this.pileItemNodes.clear();
        this.pileItemTypes.clear();

        const board = this.createNode(
            this.node,
            'DeskPilePanel',
            0,
            metrics.boardY,
            metrics.boardWidth,
            metrics.boardHeight,
        );
        this.pileRoot = this.createNode(board, 'PileRoot', 0, 0, metrics.boardWidth, metrics.boardHeight);
        this.selectionRoot = this.createNode(
            board,
            'SelectionRoot',
            0,
            0,
            metrics.boardWidth,
            metrics.boardHeight,
        );

        this.buildSlotTray(metrics);
        this.buildTools(metrics);
        this.buildHintToast(metrics);
        this.buildPickupAnimationRoot();
        this.applyThemeAssets();

        // Listen on the full game surface rather than only the UI rectangle
        // of the cream desk.  A tall 3D model can project a few pixels beyond
        // that rectangle while still being a valid visible collider; the old
        // board-only listener made those pixels impossible to pick.  Controls
        // below explicitly ignore their bubbled events.
        this.node.off(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
        this.node.on(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
    }

    private buildPickupAnimationRoot(): void {
        // The pointer dispatcher requires every node with touch listeners to
        // have a UITransform so it can resolve cameraPriority. Keep the root
        // at the minimum size so it does not become a full-screen hit target;
        // only its animated children participate in touch forwarding.
        const root = this.createNode(this.node, 'PickupAnimationRoot', 0, 0, 1, 1);
        this.pickupRoot = root;
    }

    private buildHeader(metrics: DesktopCleanupLayoutMetrics): void {
        this.headerLogoRoot = this.createNode(
            this.node,
            'GamePictureLogo',
            0,
            metrics.titleY,
            274 * metrics.scale,
            108 * metrics.scale,
        );

        this.helpButton = this.createHeaderIconButton(
            'HelpButton',
            -metrics.width / 2 + 54 * metrics.scale,
            metrics.titleY,
            'help',
            COLORS.coral,
            this.handleHelp,
        );
        this.pauseButton = this.createHeaderIconButton(
            'PauseButton',
            metrics.width / 2 - 54 * metrics.scale,
            metrics.titleY,
            'pause',
            COLORS.coral,
            this.handlePause,
        );
        this.timerLabel = this.createTimerCard(metrics);
        this.applyHeaderLogo();
    }

    private createTimerCard(metrics: DesktopCleanupLayoutMetrics): Label {
        const width = 252 * metrics.scale;
        const height = 94 * metrics.scale;
        const card = this.createNode(this.node, 'CountdownCard', 0, metrics.statsY, width, height);
        const fallbackNode = this.createNode(card, 'Fallback', 0, 0, width, height);
        const graphics = fallbackNode.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = COLORS.coral;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.roundRect(-width / 2, -height / 2, width, height, 34 * metrics.scale);
        graphics.fill();
        graphics.stroke();
        const label = this.createLabel(
            card,
            'Value',
            '03:00',
            0,
            2 * metrics.scale,
            50 * metrics.scale,
            COLORS.ink,
            210 * metrics.scale,
            72 * metrics.scale,
        );
        label.isBold = true;
        return label;
    }

    private buildBackground(metrics: DesktopCleanupLayoutMetrics): void {
        const backgroundNode = this.createNode(
            this.node,
            'BackgroundImage',
            0,
            0,
            metrics.width + 36,
            metrics.height + 36,
        );
        backgroundNode.setSiblingIndex(0);
        const fallbackNode = this.createNode(
            backgroundNode,
            'BackgroundFallback',
            0,
            0,
            metrics.width + 36,
            metrics.height + 36,
        );
        const fallback = fallbackNode.addComponent(Graphics);
        fallback.fillColor = COLORS.deskDark;
        fallback.rect(
            -(metrics.width + 36) / 2,
            -(metrics.height + 36) / 2,
            metrics.width + 36,
            metrics.height + 36,
        );
        fallback.fill();
        fallback.strokeColor = new Color(174, 119, 78, 36);
        fallback.lineWidth = 2;
        for (let y = -metrics.height / 2; y < metrics.height / 2; y += 72) {
            fallback.moveTo(-metrics.width / 2, y);
            fallback.bezierCurveTo(-140, y + 18, 160, y - 14, metrics.width / 2, y + 6);
        }
        fallback.stroke();
        const shadeNode = this.createNode(this.node, 'ReadabilityShade', 0, 0, metrics.width, metrics.height);
        const shade = shadeNode.addComponent(Graphics);
        shade.fillColor = new Color(37, 38, 47, 20);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();
    }

    private applyThemeAssets(): void {
        this.applyThemeFrame(this.node.getChildByName('HelpButton'), 'help');
        this.applyThemeFrame(this.node.getChildByName('PauseButton'), 'pause');
        this.applyThemeFrame(this.node.getChildByName('CountdownCard'), 'timer');
        const dock = this.node.getChildByName('ToolDock');
        this.applyThemeFrame(dock?.getChildByName('Tool-return'), 'return');
        this.applyThemeFrame(dock?.getChildByName('Tool-magnet'), 'magnet');
        this.applyThemeFrame(dock?.getChildByName('Tool-shuffle'), 'shuffle');
        this.applyHeaderLogo();
        if (this.model) this.renderAll();
    }

    private applyThemeFrame(node: Node | null | undefined, key: ThemeFrameKey): boolean {
        const frame = this.themeFrames.get(key);
        if (!node?.isValid || !frame) return false;
        const transform = node.getComponent(UITransform);
        const width = transform?.contentSize.width ?? 1;
        const height = transform?.contentSize.height ?? 1;
        const fallback = node.getChildByName('Fallback');
        if (fallback) fallback.active = false;
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = this.isPopupButtonFrameKey(key) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;
        transform?.setContentSize(width, height);
        return true;
    }

    private isPopupButtonFrameKey(key: ThemeFrameKey): boolean {
        return key === 'popupButtonTeal'
            || key === 'popupButtonCoral'
            || key === 'popupButtonPaper';
    }

    private applyHeaderLogo(): void {
        const root = this.headerLogoRoot;
        if (!root) return;
        if (this.applyThemeFrame(root, 'title')) {
            root.children.slice().forEach((child) => this.destroyNode(child));
        }
    }

    private buildTools(metrics: DesktopCleanupLayoutMetrics): void {
        const specs: readonly DesktopCleanupTool[] = ['return', 'magnet', 'shuffle'];
        this.toolButtons.clear();
        const cardSize = 150 * metrics.scale;
        const cardStep = 162 * metrics.scale;
        const dockWidth = cardStep * 2 + cardSize;
        const dockHeight = cardSize;
        const dock = this.createNode(this.node, 'ToolDock', 0, metrics.toolY, dockWidth, dockHeight);
        specs.forEach((tool, index) => {
            const x = (index - 1) * cardStep;
            const card = this.createNode(dock, `Tool-${tool}`, x, 0, cardSize, cardSize);
            card.addComponent(UIOpacity);
            const fallback = this.createNode(card, 'Fallback', 0, 0, cardSize, cardSize);
            const fallbackGraphics = fallback.addComponent(Graphics);
            fallbackGraphics.fillColor = COLORS.cream;
            fallbackGraphics.strokeColor = COLORS.coral;
            fallbackGraphics.lineWidth = 4 * metrics.scale;
            fallbackGraphics.roundRect(-58 * metrics.scale, -54 * metrics.scale, 116 * metrics.scale, 108 * metrics.scale, 24 * metrics.scale);
            fallbackGraphics.fill();
            fallbackGraphics.stroke();
            const icon = this.createNode(fallback, 'ToolIcon', 0, 0, 58 * metrics.scale, 58 * metrics.scale);
            this.drawToolIcon(icon, tool, tool === 'return' ? COLORS.teal : tool === 'magnet' ? COLORS.coral : COLORS.lilac);
            const count = this.createLabel(
                card,
                'Count',
                '1',
                48 * metrics.scale,
                -48 * metrics.scale,
                28 * metrics.scale,
                COLORS.white,
                46 * metrics.scale,
                46 * metrics.scale,
            );
            // Keep the number centered on the origin of the red count badge in
            // the formal tool artwork. The label has its own centered transform
            // so the glyph does not drift with font metrics or card scaling.
            count.node.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
            count.node.setPosition(48 * metrics.scale, -48 * metrics.scale);
            count.lineHeight = 32 * metrics.scale;
            count.isBold = true;
            const helpTarget = this.createNode(
                card,
                'Help',
                53 * metrics.scale,
                53 * metrics.scale,
                46 * metrics.scale,
                46 * metrics.scale,
            );
            helpTarget.addComponent(BlockInputEvents);
            helpTarget.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.showToolHelp(tool);
            }, this);

            const button = card.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.95;
            button.duration = 0.08;
            card.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                if (button.interactable) void this.handleTool(tool);
            }, this);
            this.toolButtons.set(tool, button);
        });
    }

    private buildSlotTray(metrics: DesktopCleanupLayoutMetrics): void {
        const trayWidth = Math.min(metrics.width - 46 * metrics.scale, 644 * metrics.scale);
        const trayHeight = 155 * metrics.scale;
        const tray = this.createNode(this.node, 'SlotTray', 0, metrics.slotY, trayWidth, trayHeight);
        const rootWidth = Math.min(trayWidth - 28 * metrics.scale, 600 * metrics.scale);
        this.slotRoot = this.createNode(tray, 'SlotRoot', 0, 3 * metrics.scale, rootWidth, 94 * metrics.scale);
        const cellWidth = rootWidth / this.config.slotCapacity;
        for (let index = 0; index < this.config.slotCapacity; index += 1) {
            const x = -rootWidth / 2 + cellWidth * (index + 0.5);
            this.createNode(this.slotRoot, `Cell-${index}`, x, 0, cellWidth, 92 * metrics.scale);
        }
    }

    private buildHintToast(metrics: DesktopCleanupLayoutMetrics): void {
        const width = Math.min(metrics.width - 120 * metrics.scale, 460 * metrics.scale);
        const height = 48 * metrics.scale;
        const root = this.createNode(
            this.node,
            'HintToast',
            0,
            metrics.slotY + 82 * metrics.scale,
            width,
            height,
        );
        root.addComponent(UIOpacity);
        const graphics = root.addComponent(Graphics);
        graphics.fillColor = new Color(39, 48, 69, 218);
        graphics.strokeColor = new Color(248, 232, 199, 155);
        graphics.lineWidth = 2 * metrics.scale;
        graphics.roundRect(-width / 2, -height / 2, width, height, height / 2);
        graphics.fill();
        graphics.stroke();
        this.hintLabel = this.createLabel(
            root,
            'HintLabel',
            '',
            0,
            0,
            21 * metrics.scale,
            COLORS.cream,
            width - 34 * metrics.scale,
            height - 8 * metrics.scale,
        );
        root.active = false;
        this.hintRoot = root;
    }

    private renderAll(): void {
        if (this.rendering) {
            this.renderQueued = true;
            return;
        }
        this.rendering = true;
        try {
            do {
                this.renderQueued = false;
                // A snapshot clones every model item. Share one immutable
                // snapshot across this render pass instead of rebuilding the
                // full 144-item snapshot for every presentation subsystem.
                const snapshot = this.model?.snapshot;
                const repaired = this.repairPresentationState(snapshot);
                this.renderPile(snapshot);
                this.renderSlots(snapshot);
                this.promotePickupAnimations();
                this.refreshHud(snapshot);
                this.refreshTools(snapshot);
                // Match startup can settle another pending selection and ask
                // for a render again. Keep that mutation outside the current
                // slot snapshot, then render the resulting state once more.
                this.startReadyMatchAnimations(snapshot);
                if (repaired) this.syncTerminalPhase();
            } while (this.renderQueued);
        } finally {
            this.rendering = false;
        }
    }

    /**
     * Reconcile presentation owners without making them a second gameplay
     * state machine. Ordinary pickups are already logical slot items and are
     * owned only by pickupAnimations until their view transaction completes.
     * The model pending set owns triples exclusively, from pickup arrival to
     * merge commit.
     */
    private repairPresentationState(snapshot?: DesktopCleanupSnapshot): boolean {
        const model = this.model;
        const worldRoot = this.worldRoot;
        if (!model) return false;
        let repaired = false;
        const pendingTokens = new Set(
            (snapshot ?? model.snapshot).pendingSelections.map((selection) => selection.token),
        );

        this.slotMoveTokens.forEach((move, itemId) => {
            if (move.node.isValid
                && move.node.parent === worldRoot
                && this.slotItemNodes.get(itemId) === move.node) return;
            this.slotMoveTokens.delete(itemId);
            repaired = true;
        });

        const interruptedPickups: DesktopCleanupPickupAnimation[] = [];
        this.pickupAnimations.forEach((animation) => {
            if (!this.isCurrent(animation.generation) || !animation.node.isValid) {
                interruptedPickups.push(animation);
                return;
            }
            if (!worldRoot?.isValid || animation.node.parent !== worldRoot) {
                interruptedPickups.push(animation);
            }
        });
        interruptedPickups.forEach((animation) => {
            if (this.completePickupAnimation(animation, false, false)) repaired = true;
        });

        this.pendingMatchSelections.forEach((pending, token) => {
            if (pendingTokens.has(token) && this.isCurrent(pending.generation)) return;
            this.pendingMatchSelections.delete(token);
            repaired = true;
        });

        this.matchAnimations.forEach((animation, token) => {
            const ownsMatchNodes = animation.root.isValid
                && animation.root.parent === worldRoot
                && [animation.leftNode, animation.middleNode, animation.rightNode]
                    .every((node) => node.isValid && node.parent === animation.root);
            if (ownsMatchNodes) return;

            this.matchAnimations.delete(token);
            this.pendingMatchSelections.delete(token);
            animation.selection.triple?.itemIds.forEach((itemId) => this.slotMoveTokens.delete(itemId));
            repaired = true;
            if (pendingTokens.has(token)) this.releaseMatchSelection(animation, false);
            if (animation.smoke?.isValid) this.destroyNode(animation.smoke);
            if (animation.root.isValid) this.destroyNode(animation.root);
        });

        // A triple is committed to the model before the view queues its merge.
        // If that handoff is interrupted, reconstruct the merge owner from the
        // immutable model selection. Ordinary pickups never enter this path.
        const presentationTokens = new Set<number>();
        this.pickupAnimations.forEach((_animation, token) => presentationTokens.add(token));
        this.pendingMatchSelections.forEach((_pending, token) => presentationTokens.add(token));
        this.matchAnimations.forEach((_animation, token) => presentationTokens.add(token));
        (snapshot ?? model.snapshot).pendingSelections.forEach((selection) => {
            if (presentationTokens.has(selection.token)) return;
            repaired = true;
            this.pendingMatchSelections.set(selection.token, {
                selection,
                generation: this.operationGeneration,
            });
        });
        return repaired;
    }

    private renderPile(snapshot = this.model?.snapshot): void {
        if (!snapshot) return;
        const activeIds = new Set(snapshot.items.filter((item) => item.active).map((item) => item.id));
        this.pileItemNodes.forEach((_node, itemId) => {
            if (!activeIds.has(itemId)) this.pileItemNodes.delete(itemId);
        });
        this.pileItemTypes.forEach((_type, itemId) => {
            if (!activeIds.has(itemId)) this.pileItemTypes.delete(itemId);
        });
        snapshot.items.filter((item) => item.active).forEach((item) => {
            const node = this.physicsWorld.getItemNode(item.id);
            if (!node?.isValid) return;
            this.pileItemNodes.set(item.id, node);
            this.pileItemTypes.set(item.id, item.type);
        });
        this.rebindPendingPileTapNodes();
        return;
        /* Legacy Sprite pile path retained only as commented migration context.
        const pile = this.pileRoot;
        const metrics = this.layout;
        if (!pile || !snapshot || !metrics) return;
        const active = snapshot.items
            .filter((item) => item.active)
            .sort(compareDesktopCleanupItems);
        const activeItemIds = new Set(active.map((item) => item.id));

        // Pickups only change a handful of nodes. Reuse every still-active
        // item instead of destroying and rebuilding the complete pile (each
        // item owns a UITransform, UIOpacity, Artwork node and Sprite).
        this.pileItemNodes.forEach((node, itemId) => {
            if (activeItemIds.has(itemId) && node.isValid && node.parent === pile) return;
            this.pileItemNodes.delete(itemId);
            this.pileItemTypes.delete(itemId);
            if (node.isValid && node.parent === pile) this.destroyNode(node);
        });
        pile.children.slice().forEach((child) => {
            if (!child.name.startsWith('Item-')) return;
            const itemId = child.name.slice('Item-'.length);
            if (activeItemIds.has(itemId)) return;
            this.pileItemNodes.delete(itemId);
            this.pileItemTypes.delete(itemId);
            this.destroyNode(child);
        });

        active.forEach((item) => {
            let existing = this.pileItemNodes.get(item.id);
            if (!existing?.isValid || existing.parent !== pile) {
                const namedNode = pile.getChildByName(`Item-${item.id}`);
                existing = namedNode?.isValid ? namedNode : undefined;
            }
            if (existing?.isValid && existing.parent === pile) {
                this.syncPileItemVisual(existing, item, metrics.scale);
                this.updatePileItemTransform(existing, item);
                if (this.pileBirthAnimationPending) this.preparePileBirthItem(existing, item);
                this.pileItemNodes.set(item.id, existing);
                this.pileItemTypes.set(item.id, item.type);
                return;
            }
            const size = this.itemDisplaySize(item.type, metrics.scale);
            const position = this.pilePosition(item, metrics);
            const node = this.createNode(
                pile,
                `Item-${item.id}`,
                position.x,
                position.y,
                size.width,
                size.height,
            );
            node.angle = item.angle;
            node.setScale(1, 1, 1);
            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = 255;
            this.drawItem(node, item, size.width, size.height);
            this.updatePileItemTransform(node, item);
            if (this.pileBirthAnimationPending) this.preparePileBirthItem(node, item);
            this.pileItemNodes.set(item.id, node);
            this.pileItemTypes.set(item.id, item.type);
        });
        // Preserved touch candidates keep their node instance across a
        // rebuild, but newly created nodes are appended after them. Restore
        // the model's layer order explicitly; otherwise a held item can be
        // rendered underneath a newly created item and the release hit test
        // will select that item instead.
        const orderedItemNodes = active
            .map((item) => this.pileItemNodes.get(item.id))
            .filter((node): node is Node => Boolean(node?.isValid && node.parent === pile));
        orderedItemNodes.forEach((node, index) => {
            if (node.getSiblingIndex() !== index) node.setSiblingIndex(index);
        });
        this.rebindPendingPileTapNodes();
        // Rebuilding settled pile items appends them after preserved pickup
        // nodes. Promote every in-flight pickup again so concurrent pickup
        // animations always render above the entire desktop stack.
        this.pickupAnimations.forEach((animation) => {
            if (animation.node.isValid && animation.node.parent === pile) {
                animation.node.setSiblingIndex(pile.children.length - 1);
            }
        });
        */
    }

    private preparePileBirthItem(node: Node, item: DesktopCleanupItemSnapshot): void {
        void node;
        void item;
        return;
        /* Legacy Sprite birth preparation.
        const metrics = this.layout;
        if (!metrics || !node.isValid) return;
        const target = this.pilePosition(item, metrics);
        const targetScale = 1 + item.elevation * 0.14;
        const popAngle = item.layer % 2 === 0 ? -PILE_BIRTH_START_ANGLE : PILE_BIRTH_START_ANGLE;
        node.setPosition(
            target.x * PILE_BIRTH_START_CENTER_RATIO,
            target.y * PILE_BIRTH_START_CENTER_RATIO,
            target.z,
        );
        node.angle = item.angle + popAngle;
        node.setScale(
            targetScale * PILE_BIRTH_START_SCALE,
            targetScale * PILE_BIRTH_START_SCALE,
            1,
        );
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        */
    }

    private playPileBirthAnimation(): void {
        this.cancelPileBirthAnimation();
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.inputLocked = !this.physicsWorld.isReady();
        this.pileBirthAnimationPending = this.inputLocked;
        this.refreshTools();
        return;
        /* Legacy Sprite birth tween.
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        const pile = this.pileRoot;
        this.pileBirthAnimationPending = false;
        if (!snapshot || !metrics || !pile?.isValid) {
            this.inputLocked = false;
            if (this.state === 'playing') {
                this.startDeviceMotion();
                this.refreshTools();
            }
            return;
        }

        this.cancelPileBirthAnimation();
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.inputLocked = true;
        this.refreshTools();

        const activeItems = snapshot.items.filter((item) => item.active);
        const radialDistances = new Map(
            activeItems.map((item) => [item.id, Math.hypot(item.x, item.y)] as const),
        );
        const animationItems = activeItems.slice().sort((left, right) => (
            (radialDistances.get(left.id) ?? 0) - (radialDistances.get(right.id) ?? 0)
            || compareDesktopCleanupItems(left, right)
        ));
        const radialBandItemCounts = new Map<number, number>();
        const entries: DesktopCleanupPileBirthEntry[] = [];
        animationItems.forEach((item) => {
            const node = this.pileItemNodes.get(item.id);
            if (!node?.isValid || node.parent !== pile) return;
            const target = this.pilePosition(item, metrics);
            const targetScale = 1 + item.elevation * 0.14;
            const radialBand = Math.floor(
                (radialDistances.get(item.id) ?? 0) / PILE_BIRTH_RADIAL_BAND_SIZE,
            );
            const itemIndex = radialBandItemCounts.get(radialBand) ?? 0;
            radialBandItemCounts.set(radialBand, itemIndex + 1);
            const delay = radialBand * PILE_BIRTH_RADIAL_BAND_DELAY_SECONDS
                + itemIndex * PILE_BIRTH_ITEM_STAGGER_SECONDS;
            this.preparePileBirthItem(node, item);
            entries.push({
                node,
                position: target,
                angle: item.angle,
                scale: targetScale,
                delay,
            });
        });

        if (entries.length === 0) {
            this.inputLocked = false;
            if (this.state === 'playing') {
                this.startDeviceMotion();
                this.refreshTools();
            }
            return;
        }

        const token = ++this.pileBirthToken;
        let animation: DesktopCleanupPileBirthAnimation;
        const finish = (): void => this.finishPileBirthAnimation(animation);
        animation = {
            token,
            generation: this.operationGeneration,
            entries,
            finish,
        };
        this.pileBirthAnimation = animation;
        entries.forEach((entry) => {
            Tween.stopAllByTarget(entry.node);
            tween(entry.node)
                .delay(entry.delay)
                .to(
                    PILE_BIRTH_ITEM_DURATION_SECONDS,
                    {
                        position: entry.position.clone(),
                        scale: new Vec3(entry.scale, entry.scale, 1),
                        angle: entry.angle,
                    },
                    { easing: 'backOut' },
                )
                .start();
            const opacity = entry.node.getComponent(UIOpacity);
            if (!opacity) return;
            Tween.stopAllByTarget(opacity);
            tween(opacity)
                .delay(entry.delay)
                .to(0.08, { opacity: 255 }, { easing: 'quadOut' })
                .start();
        });
        const lastDelay = Math.max(...entries.map((entry) => entry.delay));
        this.scheduleOnce(
            finish,
            lastDelay + PILE_BIRTH_ITEM_DURATION_SECONDS + 0.02,
        );
        */
    }

    private finishPileBirthAnimation(animation: DesktopCleanupPileBirthAnimation): void {
        void animation;
        return;
        /* Legacy Sprite birth completion.
        if (this.pileBirthAnimation !== animation || !this.isCurrent(animation.generation)) return;
        this.unschedule(animation.finish);
        this.pileBirthAnimation = undefined;
        animation.entries.forEach((entry) => {
            if (!entry.node.isValid) return;
            Tween.stopAllByTarget(entry.node);
            entry.node.setPosition(entry.position);
            entry.node.setScale(entry.scale, entry.scale, 1);
            entry.node.angle = entry.angle;
            const opacity = entry.node.getComponent(UIOpacity);
            if (opacity) {
                Tween.stopAllByTarget(opacity);
                opacity.opacity = 255;
            }
        });
        if (this.state !== 'playing') return;
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
        this.syncTerminalPhase();
        */
    }

    private cancelPileBirthAnimation(): void {
        this.pileBirthAnimation = undefined;
        return;
        /* Legacy Sprite birth cancellation.
        const animation = this.pileBirthAnimation;
        if (!animation) return;
        this.unschedule(animation.finish);
        this.pileBirthAnimation = undefined;
        animation.entries.forEach((entry) => {
            if (!entry.node.isValid) return;
            Tween.stopAllByTarget(entry.node);
            entry.node.setPosition(entry.position);
            entry.node.setScale(entry.scale, entry.scale, 1);
            entry.node.angle = entry.angle;
            const opacity = entry.node.getComponent(UIOpacity);
            if (opacity) {
                Tween.stopAllByTarget(opacity);
                opacity.opacity = 255;
            }
        });
        */
    }

    private syncPileTransforms(): void {
        return;
        /* 3D transforms are owned by DesktopCleanupPhysicsWorld.
        const pile = this.pileRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!pile || !snapshot || !metrics) return;
        const active = snapshot.items
            .filter((item) => item.active)
            .sort(compareDesktopCleanupItems);
        active.forEach((item, index) => {
            const node = this.pileItemNodes.get(item.id);
            if (!node?.isValid || node.parent !== pile) return;
            this.updatePileItemTransform(node, item);
            if (node.getSiblingIndex() !== index) node.setSiblingIndex(index);
        });
        this.promotePickupAnimations();
        */
    }

    private updatePileItemTransform(node: Node, item: DesktopCleanupItemSnapshot): void {
        void node;
        void item;
        return;
        /* 3D transforms are owned by DesktopCleanupPhysicsWorld.
        const baseScale = 1 + item.elevation * 0.14;
        const metrics = this.layout!;
        node.setPosition(
            item.x * metrics.boardWidth * DESKTOP_CLEANUP_STACK_RENDER_SCALE,
            item.y * metrics.boardHeight * DESKTOP_CLEANUP_STACK_RENDER_SCALE,
            0,
        );
        node.angle = item.angle;
        node.setScale(baseScale, baseScale, 1);
        */
    }

    private syncPileItemVisual(
        node: Node,
        item: Pick<DesktopCleanupItemSnapshot, 'type'>,
        scale: number,
    ): void {
        void node;
        void item;
        void scale;
    }

    private drawItem(
        node: Node,
        item: Pick<DesktopCleanupItemSnapshot, 'type'>,
        width: number,
        height: number,
    ): void {
        void node;
        void item;
        void width;
        void height;
    }

    private renderSlots(snapshot = this.model?.snapshot): void {
        if (!snapshot) return;
        const pickupItemIds = new Set(
            Array.from(this.pickupAnimations.values())
                .map((animation) => animation.selection.selectedItemId),
        );
        const matchItemIds = new Set<string>();
        this.matchAnimations.forEach((animation) => {
            animation.selection.triple?.itemIds.forEach((itemId) => matchItemIds.add(itemId));
        });
        const desiredIds = new Set<string>();
        snapshot.slots.forEach((slot, index) => {
            if (pickupItemIds.has(slot.itemId) || matchItemIds.has(slot.itemId)) return;
            const node = this.physicsWorld.getItemNode(slot.itemId);
            const target = this.slotTargetWorld(index);
            if (!node?.isValid || !target) return;
            desiredIds.add(slot.itemId);
            this.physicsWorld.markSlot(slot.itemId);
            node.name = `SlotItem-${slot.itemId}`;
            this.slotItemNodes.set(slot.itemId, node);
            this.animateSlotItemTo(node, target, slot.itemId);
        });
        this.slotItemNodes.forEach((_node, itemId) => {
            if (!desiredIds.has(itemId) && !matchItemIds.has(itemId)) {
                this.slotItemNodes.delete(itemId);
                this.slotMoveTokens.delete(itemId);
            }
        });
        return;
        /* Legacy Sprite slot path.
        const root = this.slotRoot;
        const metrics = this.layout;
        if (!root || !snapshot || !metrics) return;
        const pickupItemIds = new Set(
            Array.from(this.pickupAnimations.values())
                .filter((animation) => animation.node.isValid)
                .map((animation) => animation.selection.selectedItemId),
        );
        const matchItemIds = new Set<string>();
        this.matchAnimations.forEach((animation) => {
            if (!animation.root.isValid
                || animation.root.parent !== root
                || ![animation.leftNode, animation.middleNode, animation.rightNode]
                    .every((node) => node.isValid && node.parent === animation.root)) return;
            animation.selection.triple?.itemIds.forEach((itemId) => matchItemIds.add(itemId));
        });
        const trayWidth = root.getComponent(UITransform)?.contentSize.width ?? 640;
        const cellWidth = trayWidth / this.config.slotCapacity;
        const desiredSlots: Array<{
            readonly slot: (typeof snapshot.slots)[number];
            readonly position: Vec3;
            readonly size: Size;
        }> = [];
        snapshot.slots.forEach((slot, index) => {
            if (pickupItemIds.has(slot.itemId) || matchItemIds.has(slot.itemId)) return;
            const natural = this.itemDisplaySize(slot.type, metrics.scale);
            const fitted = this.fitSize(
                natural.width,
                natural.height,
                cellWidth - 10 * metrics.scale,
                78 * metrics.scale,
            );
            desiredSlots.push({
                slot,
                position: new Vec3(-trayWidth / 2 + cellWidth * (index + 0.5), 0, 0),
                size: fitted,
            });
        });
        const desiredItemIds = new Set(desiredSlots.map(({ slot }) => slot.itemId));

        // Keep regular slot nodes by item ID. Removing and recreating the
        // whole tray made every compressed item flash to its new position.
        this.slotItemNodes.forEach((node, itemId) => {
            if (desiredItemIds.has(itemId)) return;
            this.slotItemNodes.delete(itemId);
            this.slotMoveTokens.delete(itemId);
            if (node.isValid && node.parent === root) this.destroyNode(node);
        });
        root.children
            .filter((child) => {
                if (!child.name.startsWith('SlotItem-')) return false;
                const itemId = child.name.slice('SlotItem-'.length);
                return !desiredItemIds.has(itemId);
            })
            .forEach((child) => {
                this.slotMoveTokens.delete(child.name.slice('SlotItem-'.length));
                this.destroyNode(child);
            });

        desiredSlots.forEach(({ slot, position, size }) => {
            let node = this.slotItemNodes.get(slot.itemId);
            if (!node?.isValid || node.parent !== root) {
                const existing = root.getChildByName(`SlotItem-${slot.itemId}`);
                node = existing?.isValid ? existing : undefined;
            }
            if (!node) {
                // Any move ownership belonged to a previous node instance.
                // A newly created thumbnail starts at its final position.
                this.slotMoveTokens.delete(slot.itemId);
                node = this.createNode(
                    root,
                    `SlotItem-${slot.itemId}`,
                    position.x,
                    position.y,
                    size.width,
                    size.height,
                );
                node.addComponent(UIOpacity);
                this.drawItem(node, { type: slot.type }, size.width, size.height);
            } else {
                node.getComponent(UITransform)?.setContentSize(size.width, size.height);
                this.animateSlotItemTo(node, position, slot.itemId);
            }
            this.slotItemNodes.set(slot.itemId, node);
        });
        // Newly created thumbnails append after the existing tray content.
        // Keep every active merge presentation above the tray content.
        this.matchAnimations.forEach((animation) => {
            if (animation.root.isValid && animation.root.parent === root) {
                animation.root.setSiblingIndex(root.children.length - 1);
            }
        });
        */
    }

    private startMagnetAnimation(effect: DesktopCleanupMagnetEffect): boolean {
        const worldRoot = this.worldRoot;
        if (!worldRoot?.isValid || effect.itemIds.length !== 3) return false;
        const boardItemIds = new Set(effect.boardItemIds);
        const sourceNodes = effect.itemIds.map((itemId) => this.physicsWorld.getItemNode(itemId));
        if (sourceNodes.some((node): node is undefined => !node)) return false;
        const nodes = sourceNodes as Node[];
        const animationRoot = new Node(`MagnetAnimation-${this.magnetAnimationToken + 1}`);
        animationRoot.layer = worldRoot.layer;
        animationRoot.setParent(worldRoot);

        const token = -(++this.magnetAnimationToken);
        const selection: DesktopCleanupPendingSelection = Object.freeze({
            token,
            selectedItemId: effect.boardItemIds[0] ?? effect.slotItemIds[0] ?? effect.itemIds[0],
            insertionIndex: 0,
            triple: Object.freeze({
                type: effect.type,
                itemIds: effect.itemIds,
            }),
        });
        nodes.forEach((node, index) => {
            const itemId = effect.itemIds[index];
            if (boardItemIds.has(itemId)) this.physicsWorld.takeForAnimation(itemId);
            else this.physicsWorld.markSlot(itemId);
            this.pileItemNodes.delete(itemId);
            this.slotItemNodes.delete(itemId);
            this.slotMoveTokens.delete(itemId);
            Tween.stopAllByTarget(node);
            node.setParent(animationRoot, true);
            node.name = `MagnetAnimationItem-${itemId}`;
        });

        const animation: DesktopCleanupMatchAnimation = {
            selection,
            generation: this.operationGeneration,
            root: animationRoot,
            leftNode: nodes[0],
            middleNode: nodes[1],
            rightNode: nodes[2],
        };
        this.matchAnimations.set(token, animation);
        this.magnetAnimationTokens.add(token);
        const center = this.slotTargetWorld(Math.floor(this.config.slotCapacity / 2))
            ?? nodes[1].position.clone();
        const gatherDuration = 0.28;
        nodes.forEach((node, index) => {
            const itemId = effect.itemIds[index];
            const isBoardItem = boardItemIds.has(itemId);
            const start = node.position.clone();
            const arc = new Vec3(
                (start.x + center.x) / 2,
                Math.max(start.y, center.y) + (isBoardItem ? 0.72 : 0.24),
                (start.z + center.z) / 2,
            );
            const liftDuration = isBoardItem ? 0.12 : 0.06;
            tween(node)
                .to(liftDuration, {
                    position: arc,
                    scale: new Vec3(0.78, 0.78, 0.78),
                    angle: index % 2 === 0 ? -6 : 6,
                }, { easing: 'quadOut' })
                .to(gatherDuration - liftDuration, {
                    position: center.clone(),
                    scale: new Vec3(0.62, 0.62, 0.62),
                    angle: 0,
                }, { easing: 'quadInOut' })
                .start();
        });

        const beginBurst = (): void => {
            if (this.matchAnimations.get(token) !== animation) return;
            this.beginMatchBurst(animation, center);
        };
        tween(animationRoot)
            .delay(gatherDuration + 0.04)
            .call(beginBurst)
            .start();
        this.scheduleOnce(() => {
            if (this.matchAnimations.get(token) === animation) this.finishMatchAnimation(animation);
        }, gatherDuration + 0.04 + 0.65);
        return true;
    }

    private startSlotClearAnimation(itemIds: readonly string[]): boolean {
        const worldRoot = this.worldRoot;
        const slotRoot = this.slotRoot;
        if (!worldRoot?.isValid || !slotRoot?.isValid || itemIds.length === 0) return false;
        const animationRoot = new Node(`SlotClearAnimation-${this.slotClearToken + 1}`);
        animationRoot.layer = worldRoot.layer;
        animationRoot.setParent(worldRoot);
        const slotTransform = slotRoot.getComponent(UITransform);
        const effectRoot = this.createNode(
            slotRoot,
            `SlotClearEffects-${this.slotClearToken + 1}`,
            0,
            0,
            slotTransform?.contentSize.width ?? 1,
            slotTransform?.contentSize.height ?? 1,
        );
        effectRoot.setSiblingIndex(slotRoot.children.length - 1);

        const itemNodes: Node[] = [];
        const clearedItemIds: string[] = [];
        const effectNodes: Node[] = [];
        itemIds.forEach((itemId, index) => {
            const node = this.slotItemNodes.get(itemId) ?? this.physicsWorld.getItemNode(itemId);
            if (!node?.isValid) return;

            this.slotItemNodes.delete(itemId);
            this.slotMoveTokens.delete(itemId);
            Tween.stopAllByTarget(node);
            node.setParent(animationRoot, true);
            node.name = `ClearingSlotItem-${itemId}`;
            itemNodes.push(node);
            clearedItemIds.push(itemId);
            const effectPosition = this.worldToUiPosition(node.worldPosition, effectRoot);
            if (effectPosition) {
                effectNodes.push(this.createSlotClearEffect(effectRoot, effectPosition, index));
            }
        });

        if (itemNodes.length === 0) {
            this.destroyNode(animationRoot);
            this.destroyNode(effectRoot);
            return false;
        }

        const token = ++this.slotClearToken;
        let animation: DesktopCleanupSlotClearAnimation;
        const finish = (): void => this.finishSlotClearAnimation(animation);
        animation = {
            token,
            generation: this.operationGeneration,
            root: animationRoot,
            itemIds: Object.freeze(clearedItemIds.slice()),
            itemNodes: Object.freeze(itemNodes.slice()),
            effectRoot,
            effectNodes: Object.freeze(effectNodes.slice()),
            finish,
        };
        this.slotClearAnimations.set(token, animation);

        itemNodes.forEach((node, index) => {
            const delay = index * SLOT_CLEAR_ITEM_STAGGER_SECONDS;
            const start = node.position.clone();
            tween(node)
                .delay(delay)
                .to(0.08, {
                    position: new Vec3(start.x, start.y + 0.18, start.z),
                    scale: new Vec3(0.80, 0.80, 0.80),
                    angle: index % 2 === 0 ? -5 : 5,
                }, { easing: 'backOut' })
                .to(SLOT_CLEAR_ITEM_DURATION_SECONDS - 0.08, {
                    position: new Vec3(start.x, start.y + 0.72, start.z),
                    scale: new Vec3(0.04, 0.04, 0.04),
                    angle: index % 2 === 0 ? 14 : -14,
                }, { easing: 'quadIn' })
                .start();
        });
        effectNodes.forEach((node, index) => {
            const delay = index * SLOT_CLEAR_ITEM_STAGGER_SECONDS;
            const opacity = node.getComponent(UIOpacity);
            tween(node)
                .delay(delay)
                .to(0.06, { scale: new Vec3(1.16, 1.16, 1), angle: index % 2 === 0 ? -8 : 8 }, { easing: 'backOut' })
                .to(SLOT_CLEAR_EFFECT_DURATION_SECONDS - 0.06, { scale: new Vec3(0.58, 0.58, 1) }, { easing: 'quadIn' })
                .start();
            if (opacity) {
                tween(opacity)
                    .delay(delay)
                    .to(0.04, { opacity: 255 }, { easing: 'quadOut' })
                    .to(SLOT_CLEAR_EFFECT_DURATION_SECONDS - 0.04, { opacity: 0 }, { easing: 'quadIn' })
                    .start();
            }
        });

        const lastDelay = (itemNodes.length - 1) * SLOT_CLEAR_ITEM_STAGGER_SECONDS;
        this.scheduleOnce(
            finish,
            lastDelay + Math.max(SLOT_CLEAR_ITEM_DURATION_SECONDS, SLOT_CLEAR_EFFECT_DURATION_SECONDS) + 0.04,
        );
        return true;
    }

    private createSlotClearEffect(parent: Node, position: Vec3, index: number): Node {
        const scale = this.layout?.scale ?? 1;
        const size = SLOT_CLEAR_EFFECT_SIZE * scale;
        const effect = this.createNode(
            parent,
            `ClearBurst-${index}`,
            position.x,
            position.y,
            size,
            size,
        );
        effect.setScale(0.2, 0.2, 1);
        const opacity = effect.addComponent(UIOpacity);
        opacity.opacity = 0;
        const graphics = effect.addComponent(Graphics);
        graphics.fillColor = new Color(232, 180, 69, 255);
        [
            [-35, -13, 9],
            [32, -18, 8],
            [-23, 29, 7],
            [25, 31, 8],
        ].forEach(([x, y, radius]) => graphics.circle(x * scale, y * scale, radius * scale));
        graphics.fill();
        graphics.strokeColor = new Color(235, 119, 100, 255);
        graphics.lineWidth = Math.max(2, 5 * scale);
        [
            [-56, 0, -36, 0],
            [56, 0, 36, 0],
            [0, -56, 0, -36],
            [0, 56, 0, 36],
        ].forEach(([fromX, fromY, toX, toY]) => {
            graphics.moveTo(fromX * scale, fromY * scale);
            graphics.lineTo(toX * scale, toY * scale);
        });
        graphics.stroke();
        return effect;
    }

    private finishSlotClearAnimation(animation: DesktopCleanupSlotClearAnimation): void {
        if (this.slotClearAnimations.get(animation.token) !== animation) return;
        this.unschedule(animation.finish);
        this.slotClearAnimations.delete(animation.token);
        animation.itemIds.forEach((itemId) => this.physicsWorld.removeItem(itemId));
        if (animation.root.isValid) this.destroyNode(animation.root);
        if (animation.effectRoot?.isValid) this.destroyNode(animation.effectRoot);
        if (!this.isCurrent(animation.generation)) return;
        if (this.state !== 'playing') return;
        this.renderAll();
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
        this.syncTerminalPhase();
    }

    private cancelSlotClearAnimations(): void {
        const animations = Array.from(this.slotClearAnimations.values());
        this.slotClearAnimations.clear();
        animations.forEach((animation) => {
            this.unschedule(animation.finish);
            animation.itemNodes.forEach((node) => {
                if (node.isValid && this.worldRoot?.isValid) node.setParent(this.worldRoot, true);
            });
            if (animation.root.isValid) this.destroyNode(animation.root);
            if (animation.effectRoot?.isValid) this.destroyNode(animation.effectRoot);
        });
    }

    private animateSlotItemTo(node: Node, target: Vec3, itemId: string): void {
        if (!node.isValid || node.parent !== this.worldRoot) return;
        const existing = this.slotMoveTokens.get(itemId);
        if (existing
            && existing.node === node
            && Vec3.squaredDistance(existing.target, target) <= 0.000001) return;
        if (existing) this.unschedule(existing.finish);
        const current = node.position;
        const distance = Vec3.distance(current, target);
        const faceUpRotation = Quat.fromEuler(new Quat(), 0, node.eulerAngles.y, 0);
        Tween.stopAllByTarget(node);
        let move: DesktopCleanupSlotMove;
        const finish = (): void => {
            if (this.slotMoveTokens.get(itemId) !== move) return;
            this.unschedule(finish);
            if (node.isValid) {
                Tween.stopAllByTarget(node);
                node.setPosition(target);
                node.setRotation(faceUpRotation);
                node.setScale(0.72, 0.72, 0.72);
            }
            this.slotMoveTokens.delete(itemId);
            this.startReadyMatchAnimations();
            // Tool buttons are gated while any slot compression is in flight.
            // Refresh after the token is released so a completed 140ms move
            // cannot leave the controls permanently disabled.
            this.refreshTools();
        };
        move = { node, target: target.clone(), finish };
        this.slotMoveTokens.set(itemId, move);
        if (distance <= 0.01) {
            node.setPosition(target);
            node.setRotation(faceUpRotation);
            node.setScale(0.72, 0.72, 0.72);
            // Even an already-centered pickup must remain visibly settled for
            // one rendered frame before a three-item gather can begin.
            this.scheduleOnce(finish, 0);
        } else {
            tween(node)
                .to(0.14, {
                    position: target.clone(),
                    rotation: faceUpRotation,
                    scale: new Vec3(0.72, 0.72, 0.72),
                }, { easing: 'quadInOut' })
                .call(() => this.scheduleOnce(finish, 0))
                .start();
            // Complete atomically if an engine-side tween callback is lost.
            this.scheduleOnce(finish, 0.24);
        }
    }

    private refreshHud(snapshot = this.model?.snapshot): void {
        if (!snapshot) return;
        const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
        this.lastHudSecond = seconds;
        const minutes = Math.floor(seconds / 60);
        const minuteText = minutes < 10 ? `0${minutes}` : `${minutes}`;
        const remainderValue = seconds % 60;
        const remainder = remainderValue < 10 ? `0${remainderValue}` : `${remainderValue}`;
        if (this.timerLabel) {
            this.timerLabel.string = `${minuteText}:${remainder}`;
            this.timerLabel.color = seconds <= 30 ? COLORS.coral : COLORS.ink;
        }
        if (snapshot.score !== this.lastReportedScore) {
            this.lastReportedScore = snapshot.score;
            this.context?.reportScore(snapshot.score);
        }
    }

    private refreshTools(snapshot = this.model?.snapshot): void {
        if (!snapshot) return;
        const adsEnabled = this.isAdsEnabled();
        const controlsEnabled = this.state === 'playing' && !this.inputLocked && !this.adBusy;
        if (this.pauseButton) this.pauseButton.interactable = controlsEnabled;
        if (this.helpButton) this.helpButton.interactable = controlsEnabled;
        this.toolButtons.forEach((button, tool) => {
            const charge = snapshot.toolCharges[tool];
            const needsAd = adsEnabled && charge <= 0 && !snapshot.boostAdAttempted;
            const count = button.node.getChildByName('Count')?.getComponent(Label);
            // Do not create the rewarded-ad node while the free charge is
            // still visible. WeChat's first frame can run this refresh before
            // the card's render components have completed their native-side
            // setup; lazy creation keeps the normal free-use path free of
            // unnecessary cross-bundle Sprite work.
            const adIcon = needsAd
                ? this.ensureToolAdCountIcon(button.node)
                : button.node.getChildByName('AdCountIcon') ?? undefined;
            if (count) {
                count.string = `${charge}`;
                count.node.active = !needsAd || !adIcon?.isValid;
            }
            if (adIcon?.isValid) adIcon.active = needsAd;
            button.interactable = controlsEnabled
                && snapshot.pendingSelections.length === 0
                && this.pickupAnimations.size === 0
                && this.pendingMatchSelections.size === 0
                && this.matchAnimations.size === 0
                && this.slotClearAnimations.size === 0
                && this.slotMoveTokens.size === 0
                && (charge > 0 || (adsEnabled && !snapshot.boostAdAttempted));
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
        });
    }

    private ensureToolAdCountIcon(card: Node): Node | undefined {
        const existing = card.getChildByName('AdCountIcon');
        if (existing?.isValid) return existing;
        const frame = this.rewardedVideoIconFrame;
        const scale = this.layout?.scale ?? 1;
        if (!frame) return undefined;
        const icon = attachRewardedVideoIcon(
            card,
            frame,
            48 * scale,
            -48 * scale,
            30 * scale,
        );
        if (!icon) return undefined;
        icon.name = 'AdCountIcon';
        icon.active = false;
        return icon;
    }

    private handleItemTap(itemId: string, node: Node): void {
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        if (!node.isValid || !this.physicsWorld.canTakeItem(itemId)) return;
        // A pickup request during an active merge must release that merge
        // before the model performs its capacity check. Otherwise a full tray
        // rejects the request before the three visual merge cells can free up.
        this.releaseActiveMatchesForPickup();
        let result = this.model.selectItem(itemId);
        if (!result.accepted && result.reason === 'full') {
            if (this.releaseActiveMatchesForPickup()) {
                result = this.model.selectItem(itemId);
            }
        }
        const selection = result.selection;
        if (!result.accepted || !selection) return;
        const physicsNode = this.physicsWorld.takeForAnimation(itemId);
        if (!physicsNode?.isValid) return;
        const generation = this.operationGeneration;
        const animation: DesktopCleanupPickupAnimation = {
            selection,
            generation,
            node: physicsNode,
        };
        this.pickupAnimations.set(selection.token, animation);
        this.movePickupNodeToAnimationLayer(animation);
        // Releasing the first merge can synchronously refresh the tray and
        // start another queued merge. Catch that newly active merge after the
        // current pickup has been registered as well.
        this.releaseActiveMatchesForPickup();
        // The model has already inserted the item into its target slot. Move
        // existing thumbnails out of the way while the pickup is still flying
        // so the destination is reserved before the item arrives.
        this.renderSlots();
        this.promotePickupAnimations();
        this.startReadyMatchAnimations();
        this.refreshTools();
        this.context?.services.feedback.play('drop', { vibrate: false });
        const currentSlotIndex = this.model.snapshot.slots.findIndex(
            (slot) => slot.itemId === selection.selectedItemId,
        );
        const destination = this.slotTargetWorld(
            currentSlotIndex >= 0 ? currentSlotIndex : selection.insertionIndex,
        ) ?? physicsNode.position.clone();
        const yaw = physicsNode.eulerAngles.y;
        const faceUpRotation = Quat.fromEuler(new Quat(), 0, yaw, 0);
        const midRotation = Quat.fromEuler(new Quat(), 14, yaw + 18, -8);
        const midpoint = Vec3.lerp(
            new Vec3(),
            physicsNode.position,
            destination,
            0.52,
        );
        tween(physicsNode)
            // Keep the established 200ms flight, but visibly roll the same
            // 3D node into a level, face-up pose before it lands in the slot.
            .to(PICKUP_ANIMATION_DURATION_SECONDS * 0.52, {
                position: midpoint,
                rotation: midRotation,
                scale: new Vec3(0.86, 0.86, 0.86),
            }, { easing: 'quadOut' })
            .to(PICKUP_ANIMATION_DURATION_SECONDS * 0.48, {
                position: destination,
                rotation: faceUpRotation,
                scale: new Vec3(0.72, 0.72, 0.72),
            }, { easing: 'quadInOut' })
            .call(() => this.finishPickupAnimation(animation))
            .start();
        // The normal callback and interruption deadline share the same atomic
        // transaction completion, so neither path can settle or remove twice.
        this.scheduleOnce(
            () => this.finishPickupAnimation(animation),
            PICKUP_ANIMATION_WATCHDOG_SECONDS,
        );
    }

    private finishPickupAnimation(animation: DesktopCleanupPickupAnimation): void {
        this.completePickupAnimation(animation, true, true);
    }

    private completePickupAnimation(
        animation: DesktopCleanupPickupAnimation,
        render: boolean,
        pulse: boolean,
    ): boolean {
        const selection = animation.selection;
        if (this.pickupAnimations.get(selection.token) !== animation) return false;
        this.pickupAnimations.delete(selection.token);
        if (animation.node.isValid) {
            this.physicsWorld.markSlot(selection.selectedItemId);
        }

        const model = this.model;
        if (!this.isCurrent(animation.generation) || !model || model.phase !== 'playing') return true;
        const stillPending = model.snapshot.pendingSelections.some(
            (pending) => pending.token === selection.token,
        );
        if (selection.triple && stillPending) {
            this.pendingMatchSelections.set(selection.token, {
                selection,
                generation: animation.generation,
            });
        }
        if (this.pickupAnimations.size === 0) model.finalizeSelectionBatch();
        if (!render) return true;

        this.renderAll();
        if (pulse) {
            const settledSlotIndex = model.snapshot.slots.findIndex(
                (slot) => slot.itemId === selection.selectedItemId,
            );
            this.pulseSlot(settledSlotIndex >= 0 ? settledSlotIndex : selection.insertionIndex);
        }
        this.syncTerminalPhase();
        return true;
    }

    private movePickupNodeToAnimationLayer(animation: DesktopCleanupPickupAnimation): void {
        const source = animation.node;
        if (!source.isValid) return;
        this.pileItemNodes.delete(animation.selection.selectedItemId);
        this.pileItemTypes.delete(animation.selection.selectedItemId);
        source.name = `PickupAnimation-${animation.selection.token}`;
    }

    private settleSelection(
        selection: DesktopCleanupPendingSelection,
        generation: number,
        render = true,
    ): boolean {
        if (!this.isCurrent(generation) || !this.model) return false;
        const settled = this.model.settleSelection(selection.token);
        if (!settled.accepted) return false;
        if (render) {
            this.renderAll();
            this.syncTerminalPhase();
        }
        return true;
    }

    private animateTripleSelection(selection: DesktopCleanupPendingSelection, generation: number): void {
        const triple = selection.triple;
        const root = this.worldRoot;
        if (!triple || !root?.isValid || !this.isCurrent(generation)) {
            this.settleSelection(selection, generation);
            return;
        }
        const nodes = triple.itemIds
            .map((itemId) => this.slotItemNodes.get(itemId) ?? this.physicsWorld.getItemNode(itemId))
            .filter((node): node is Node => Boolean(node?.isValid));
        if (nodes.length !== 3) {
            if (triple.itemIds.some((itemId) => this.isPickupInFlight(itemId))) return;
            this.settleSelection(selection, generation);
            return;
        }
        // The model stores the matching item IDs by selection order. The
        // presentation must use the actual slot positions, because tools or
        // insertion of another type can make that order differ from the
        // visible left-to-right arrangement.
        const orderedNodes = nodes.slice().sort((left, right) => (
            (this.physicsWorld.worldToScreen(left.worldPosition)?.x ?? 0)
                - (this.physicsWorld.worldToScreen(right.worldPosition)?.x ?? 0)
            || left.name.localeCompare(right.name)
        ));
        const leftNode = orderedNodes[0];
        const middleNode = orderedNodes[1];
        const rightNode = orderedNodes[2];
        const center = middleNode.worldPosition.clone();
        const animationRoot = new Node(`MatchAnimation-${selection.token}`);
        animationRoot.layer = root.layer;
        animationRoot.setParent(root);
        const leftAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, leftNode);
        const middleAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, middleNode);
        const rightAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, rightNode);
        const animation: DesktopCleanupMatchAnimation = {
            selection,
            generation,
            root: animationRoot,
            leftNode: leftAnimationNode,
            middleNode: middleAnimationNode,
            rightNode: rightAnimationNode,
        };
        this.matchAnimations.set(selection.token, animation);
        // If another pickup is already flying when this merge starts, release
        // the three logical cells now while keeping their views in this upper
        // animation root.
        if (this.hasConcurrentPickup(selection.token)) {
            this.releaseMatchSelection(animation);
        }

        const gatherDuration = 0.24;
        const overlapDuration = 0.06;
        const centerPosition = center.clone();
        const leftGather = tween(leftAnimationNode)
            .to(gatherDuration, {
                position: centerPosition.clone(),
                scale: new Vec3(0.64, 0.64, 0.64),
                angle: 7,
            }, { easing: 'quadInOut' });
        const rightGather = tween(rightAnimationNode)
            .to(gatherDuration, {
                position: centerPosition.clone(),
                scale: new Vec3(0.64, 0.64, 0.64),
                angle: -7,
            }, { easing: 'quadInOut' });
        leftGather.start();
        rightGather.start();
        tween(middleAnimationNode)
            .to(0.07, {
                scale: new Vec3(0.78, 0.78, 0.78),
                angle: -2,
            }, { easing: 'backOut' })
            .to(gatherDuration - 0.07, {
                scale: new Vec3(0.68, 0.68, 0.68),
                angle: 0,
            }, { easing: 'quadIn' })
            .start();

        const beginBurst = (): void => {
            if (this.matchAnimations.get(selection.token) !== animation) return;
            this.beginMatchBurst(animation, centerPosition);
        };
        tween(animationRoot)
            .delay(gatherDuration + overlapDuration)
            .call(beginBurst)
            .start();
        // A watchdog prevents an interrupted presentation tween from leaving
        // the model pending and the board input-locked forever.
        this.scheduleOnce(() => {
            if (this.matchAnimations.get(selection.token) === animation) this.finishMatchAnimation(animation);
        }, gatherDuration + overlapDuration + 0.65);
    }

    private moveMatchNodeToAnimationLayer(
        parent: Node,
        node: Node,
    ): Node {
        const itemId = node.name.startsWith('SlotItem-')
            ? node.name.slice('SlotItem-'.length)
            : '';
        if (itemId) {
            this.slotItemNodes.delete(itemId);
            // A slot move tween can otherwise survive the reparenting. If the
            // match root is destroyed before that tween's callback, the token
            // remains forever and blocks every later merge/slot refresh.
            this.slotMoveTokens.delete(itemId);
        }
        Tween.stopAllByTarget(node);
        node.setParent(parent, true);
        return node;
    }

    private beginMatchBurst(animation: DesktopCleanupMatchAnimation, center: Vec3): void {
        if (!this.isCurrent(animation.generation) || !animation.root.isValid) {
            this.finishMatchAnimation(animation);
            return;
        }
        Tween.stopAllByTarget(animation.root);
        [animation.leftNode, animation.middleNode, animation.rightNode].forEach((node) => {
            if (!node.isValid) return;
            Tween.stopAllByTarget(node);
            node.setPosition(center);
            node.setScale(0.68, 0.68, 0.68);
            node.angle = 0;
        });
        const metrics = this.layout;
        const extent = 192 * (metrics?.scale ?? 1);
        const smokeParent = this.slotRoot;
        const smokePosition = smokeParent
            ? this.worldToUiPosition(animation.middleNode.worldPosition, smokeParent)
            : undefined;
        if (!smokeParent?.isValid || !smokePosition) {
            this.finishMatchAnimation(animation);
            return;
        }
        const smoke = this.createNode(
            smokeParent,
            `MatchSmoke-${animation.selection.token}`,
            smokePosition.x,
            smokePosition.y,
            extent,
            extent,
        );
        smoke.setSiblingIndex(smokeParent.children.length - 1);
        smoke.setScale(MATCH_SMOKE_INITIAL_SCALE, MATCH_SMOKE_INITIAL_SCALE, 1);
        const smokeOpacity = smoke.addComponent(UIOpacity);
        smokeOpacity.opacity = 0;
        const smokeFrame = this.themeFrames.get('smoke');
        if (smokeFrame) {
            const sprite = smoke.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = smokeFrame;
            smoke.getComponent(UITransform)?.setContentSize(extent, extent);
        } else {
            const fallback = smoke.addComponent(Graphics);
            fallback.fillColor = new Color(255, 245, 213, 232);
            [-38, -17, 8, 34].forEach((offset, index) => {
                fallback.circle(offset * (metrics?.scale ?? 1), (index % 2 === 0 ? 8 : -5) * (metrics?.scale ?? 1), 34 * (metrics?.scale ?? 1));
            });
            fallback.fill();
        }
        animation.smoke = smoke;
        this.context?.services.feedback.play('merge', { vibrate: false });

        const finish = (): void => this.finishMatchAnimation(animation);
        [animation.leftNode, animation.middleNode, animation.rightNode].forEach((node) => {
            tween(node)
                .to(0.03, { scale: new Vec3(0.78, 0.78, 0.78) }, { easing: 'backOut' })
                .to(0.09, { scale: new Vec3(0.04, 0.04, 0.04) }, { easing: 'quadIn' })
                .start();
        });
        tween(smokeOpacity)
            .to(0.03, { opacity: 255 }, { easing: 'quadOut' })
            .delay(0.03)
            .to(0.11, { opacity: 0 }, { easing: 'quadIn' })
            .start();
        tween(smoke)
            .to(0.03, { scale: new Vec3(MATCH_SMOKE_PEAK_SCALE, MATCH_SMOKE_PEAK_SCALE, 1), angle: -5 }, { easing: 'backOut' })
            .to(0.11, { scale: new Vec3(MATCH_SMOKE_FINAL_SCALE, MATCH_SMOKE_FINAL_SCALE, 1), angle: 8 }, { easing: 'quadOut' })
            .start();
        tween(animation.root)
            .delay(0.18)
            .call(finish)
            .start();
    }

    private finishMatchAnimation(animation: DesktopCleanupMatchAnimation): void {
        if (this.matchAnimations.get(animation.selection.token) !== animation) return;
        const isMagnetAnimation = this.magnetAnimationTokens.delete(animation.selection.token);
        this.matchAnimations.delete(animation.selection.token);
        animation.selection.triple?.itemIds.forEach((itemId) => {
            this.slotMoveTokens.delete(itemId);
            this.slotItemNodes.delete(itemId);
            this.pileItemNodes.delete(itemId);
            this.physicsWorld.removeItem(itemId);
        });
        if (animation.smoke?.isValid) this.destroyNode(animation.smoke);
        if (animation.root.isValid) this.destroyNode(animation.root);
        // The model token is the only source of truth for commit state. If a
        // pickup released it early this is a render-only reconciliation;
        // otherwise animation completion commits it here.
        this.releaseMatchSelection(animation);
        if (isMagnetAnimation && this.isCurrent(animation.generation) && this.state === 'playing') {
            this.inputLocked = false;
            this.startDeviceMotion();
            this.refreshTools();
        }
    }

    private releaseMatchSelection(
        animation: DesktopCleanupMatchAnimation,
        render = true,
    ): boolean {
        const pending = this.model?.snapshot.pendingSelections.some(
            (selection) => selection.token === animation.selection.token,
        );
        if (!pending) {
            if (render) {
                this.renderAll();
                this.syncTerminalPhase();
            }
            return true;
        }
        if (!this.settleSelection(animation.selection, animation.generation, false)) return false;
        if (render) {
            this.renderAll();
            this.syncTerminalPhase();
        }
        return true;
    }

    private releaseActiveMatchesForPickup(): boolean {
        let released = false;
        // Settling merges can promote another queued merge during the unified
        // tray render. Keep draining until no unreleased animation remains so
        // consecutive merges cannot leave a logical cell behind.
        while (true) {
            const pendingTokens = new Set(
                this.model?.snapshot.pendingSelections.map((selection) => selection.token) ?? [],
            );
            const active = Array.from(this.matchAnimations.values())
                .filter((animation) => pendingTokens.has(animation.selection.token));
            if (active.length === 0) break;
            let releasedThisPass = false;
            active.forEach((animation) => {
                if (!this.releaseMatchSelection(animation, false)) return;
                released = true;
                releasedThisPass = true;
            });
            if (!releasedThisPass) {
                // A stale/invalid animation is repaired by the next render;
                // never spin here and block the pickup request forever.
                this.renderAll();
                break;
            }
            this.renderAll();
            this.syncTerminalPhase();
        }
        return released;
    }

    private cancelMatchAnimation(): void {
        this.pendingMatchSelections.clear();
        this.magnetAnimationTokens.clear();
        const animations = Array.from(this.matchAnimations.values());
        this.matchAnimations.clear();
        animations.forEach((animation) => {
            animation.selection.triple?.itemIds.forEach((itemId) => this.slotMoveTokens.delete(itemId));
            [animation.leftNode, animation.middleNode, animation.rightNode].forEach((node) => {
                if (node.isValid && this.worldRoot?.isValid) node.setParent(this.worldRoot, true);
            });
            if (animation.smoke?.isValid) this.destroyNode(animation.smoke);
            if (animation.root.isValid) this.destroyNode(animation.root);
        });
    }

    private cancelPickupAnimations(): void {
        const animations = Array.from(this.pickupAnimations.values());
        this.pickupAnimations.clear();
        animations.forEach((animation) => {
            if (animation.node.isValid) Tween.stopAllByTarget(animation.node);
        });
    }

    private cancelSlotMoves(): void {
        this.slotMoveTokens.forEach((move) => this.unschedule(move.finish));
        this.slotMoveTokens.clear();
        this.slotItemNodes.forEach((node) => {
            if (node.isValid) Tween.stopAllByTarget(node);
        });
    }

    private startReadyMatchAnimations(snapshot = this.model?.snapshot): void {
        if (this.state !== 'playing' || !this.model || this.model.phase !== 'playing') return;
        if (this.slotMoveTokens.size > 0) return;
        const pendingTokens = new Set(
            snapshot?.pendingSelections.map((selection) => selection.token) ?? [],
        );
        Array.from(this.pendingMatchSelections.values()).forEach((pending) => {
            if (!this.isCurrent(pending.generation)) return;
            if (!pendingTokens.has(pending.selection.token)) {
                this.pendingMatchSelections.delete(pending.selection.token);
                return;
            }
            const triple = pending.selection.triple;
            if (!triple || triple.itemIds.some((itemId) => this.isPickupInFlight(itemId))) return;
            this.pendingMatchSelections.delete(pending.selection.token);
            this.animateTripleSelection(pending.selection, pending.generation);
        });
    }

    private hasConcurrentPickup(selectionToken: number): boolean {
        return Array.from(this.pickupAnimations.values()).some(
            (animation) => animation.selection.token !== selectionToken,
        );
    }

    private isPickupInFlight(itemId: string): boolean {
        return Array.from(this.pickupAnimations.values()).some(
            (animation) => animation.selection.selectedItemId === itemId,
        );
    }

    private promotePickupAnimations(): void {
        const root = this.pickupRoot;
        if (!root?.isValid) return;
        this.pickupAnimations.forEach((animation) => {
            if (animation.node.isValid && animation.node.parent === root) {
                animation.node.setSiblingIndex(root.children.length - 1);
            }
        });
    }

    private async handleTool(tool: DesktopCleanupTool): Promise<void> {
        if (this.state !== 'playing' || this.inputLocked || this.adBusy || !this.model) return;
        const result = this.model.useTool(tool);
        // Reflect the charge transition immediately. In particular, the
        // first free use changes the next action from a free press to a
        // rewarded-ad press, so the count badge must switch in this same
        // interaction before any longer tool animation starts.
        this.refreshTools();
        if (result.reason === 'needs-ad') {
            if (!this.isAdsEnabled()) {
                this.setHint('本局工具次数已用完');
                this.refreshTools();
                return;
            }
            await this.requestBoostAd(tool);
            return;
        }
        if (!result.accepted) {
            this.setHint(result.reason === 'empty' ? '当前还用不上这个工具' : '本局工具次数已用完');
            return;
        }
        const cue = tool === 'magnet' && result.magnet
            ? 'drop'
            : result.triple ? 'merge' : 'fold';
        this.context?.services.feedback.play(cue, {
            vibrate: cue !== 'drop' && cue !== 'merge',
        });
        this.presentToolResult(tool, true, result.removedItemIds ?? [], result.magnet);
    }

    private presentToolResult(
        tool: DesktopCleanupTool,
        showHint = true,
        removedItemIds: readonly string[] = [],
        magnetEffect?: DesktopCleanupMagnetEffect,
    ): void {
        const isStorm = tool === 'shuffle';
        const clearStarted = removedItemIds.length > 0 && this.startSlotClearAnimation(removedItemIds);
        const magnetStarted = tool === 'magnet'
            && Boolean(magnetEffect)
            && this.startMagnetAnimation(magnetEffect!);
        if (isStorm || clearStarted || magnetStarted) {
            this.inputLocked = true;
            this.stopDeviceMotion();
        } else {
            this.inputLocked = false;
            this.startDeviceMotion();
        }
        this.renderAll();
        if (showHint) {
            if (tool === 'return' || tool === 'shuffle' || tool === 'magnet') {
                this.setHint('');
            }
        }
        if (isStorm) {
            this.physicsWorld.shuffle(this.model?.snapshot.items ?? []);
            this.playPileBirthAnimation();
        }
        if (!clearStarted && !magnetStarted && !isStorm) this.syncTerminalPhase();
    }

    private async requestBoostAd(tool: DesktopCleanupTool): Promise<void> {
        const model = this.model;
        const context = this.context;
        if (!model
            || !context
            || !this.isAdsEnabled()
            || !model.beginBoostAd(tool)) return;
        const generation = this.operationGeneration;
        this.adBusy = true;
        this.inputLocked = true;
        this.stopDeviceMotion();
        this.freezePhysics('rewarded-tool');
        this.state = 'paused';
        this.setHint('正在播放视频…');
        this.refreshTools();
        let acceptedAction: DesktopCleanupActionResult | undefined;
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            const action = model.resolveBoostAd(result.outcome === 'completed');
            if (action.accepted) {
                acceptedAction = action;
                const cue = tool === 'magnet' && action.magnet
                    ? 'drop'
                    : action.triple ? 'merge' : 'continue';
                this.context?.services.feedback.play(cue, {
                    vibrate: cue !== 'drop' && cue !== 'merge',
                });
                this.setHint('');
            } else {
                this.setHint('失败，请重试');
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveBoostAd(false);
            console.warn('[DesktopCleanupGame] Rewarded tool ad failed.', error);
            this.setHint('失败，请重试');
        } finally {
            if (this.isCurrent(generation)) {
                this.adBusy = false;
                this.refreshTools();
                this.state = 'playing';
                this.unfreezePhysics('rewarded-tool');
                if (acceptedAction) {
                    this.presentToolResult(
                        tool,
                        false,
                        acceptedAction.removedItemIds ?? [],
                        acceptedAction.magnet,
                    );
                }
                else {
                    this.inputLocked = false;
                    this.startDeviceMotion();
                    this.renderAll();
                    this.syncTerminalPhase();
                }
            }
        }
    }

    private syncTerminalPhase(): void {
        const phase = this.model?.snapshot.phase;
        if (phase === 'failed' && this.state === 'playing') {
            this.state = 'failed';
            this.inputLocked = true;
            this.freezePhysics('failure');
            this.context?.services.feedback.play('failure');
            this.showFailure();
        } else if (phase === 'won' && !this.terminalPending) {
            this.finishWin();
        }
    }

    private showFailure(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        this.stopDeviceMotion();
        const reason = snapshot.failureReason === 'timeout'
            ? '时间到了，桌面还没清空'
            : '收纳槽已经放满了';
        const actions: OverlayAction[] = [];
        if (this.isAdsEnabled() && !snapshot.continueAdAttempted) {
            const label = snapshot.failureReason === 'slots'
                ? '看广告清除 3 格'
                : `加时 ${this.config.continueSeconds} 秒继续`;
            actions.push({ name: 'ContinueButton', label, tone: 'teal', action: () => this.requestContinueAd(), adIcon: true });
        }
        actions.push(
            { name: 'RestartButton', label: '重新挑战', tone: 'mustard', action: () => this.restartFromFailure() },
            { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: () => this.lobbyFromFailure() },
        );
        this.destroyOverlay(this.failureOverlay);
        this.failureOverlay = this.buildOverlay(
            'DesktopFailureOverlay',
            '还差一点',
            reason,
            actions,
        );
    }

    private async requestContinueAd(): Promise<void> {
        const model = this.model;
        const context = this.context;
        if (!model
            || !context
            || this.adBusy
            || !this.isAdsEnabled()
            || !model.beginContinueAd()) return;
        const failureReason = model.snapshot.failureReason;
        const generation = this.operationGeneration;
        this.adBusy = true;
        this.freezePhysics('continue-ad');
        this.setOverlayBusy(this.failureOverlay, true, '正在播放视频…');
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            const action = model.resolveContinueAd(result.outcome === 'completed');
            if (action.accepted) {
                this.destroyOverlay(this.failureOverlay);
                this.failureOverlay = undefined;
                this.state = 'playing';
                this.unfreezePhysics('failure');
                this.context?.services.feedback.play('continue');
                this.setHint('');
                this.presentContinueResult(action.removedItemIds ?? []);
            } else {
                this.setHint('失败，请重试');
                this.showFailure();
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveContinueAd(false);
            console.warn('[DesktopCleanupGame] Continue ad failed.', error);
            this.setHint('失败，请重试');
            this.showFailure();
        } finally {
            if (this.isCurrent(generation)) {
                this.adBusy = false;
                this.unfreezePhysics('continue-ad');
                this.refreshTools();
            }
        }
    }

    private presentContinueResult(removedItemIds: readonly string[]): void {
        const clearStarted = removedItemIds.length > 0 && this.startSlotClearAnimation(removedItemIds);
        if (clearStarted) {
            this.inputLocked = true;
            this.stopDeviceMotion();
        } else {
            this.inputLocked = false;
            this.startDeviceMotion();
        }
        this.renderAll();
        if (!clearStarted) this.syncTerminalPhase();
    }

    private restartFromFailure(): void {
        if (this.terminalPending) return;
        this.terminalPending = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在重新摆桌…');
        this.context?.requestRestart(this.makeFailureResult('failure_restart'));
    }

    private lobbyFromFailure(): void {
        if (this.terminalPending) return;
        this.terminalPending = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在返回大厅…');
        this.context?.requestLobby(this.makeFailureResult('failure_lobby'));
    }

    private makeFailureResult(reason: string) {
        const snapshot = this.model?.snapshot;
        return Object.freeze({
            score: snapshot?.score ?? 0,
            duration: this.currentDurationSeconds(),
            completed: false,
            extra: Object.freeze({
                reason,
                failureReason: snapshot?.failureReason ?? 'unknown',
                challengeDate: this.model?.dateKey ?? desktopCleanupDateKey(),
            }),
        });
    }

    private finishWin(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot || snapshot.phase !== 'won' || this.terminalPending) return;
        this.terminalPending = true;
        this.state = 'completed';
        this.inputLocked = true;
        this.stopDeviceMotion();
        this.freezePhysics('result');
        const durationMs = Math.round(this.currentDurationSeconds() * 1000);
        const newRecord = snapshot.score > this.save.highScore;
        this.save = Object.freeze({
            ...this.save,
            highScore: Math.max(this.save.highScore, snapshot.score),
            wins: this.save.wins + 1,
            bestClearMs: this.save.bestClearMs === undefined
                ? durationMs
                : Math.min(this.save.bestClearMs, durationMs),
            lastCompletedDate: this.model?.dateKey,
        });
        this.persistSave();
        this.context?.services.feedback.play(newRecord ? 'record' : 'milestone');
        this.context?.requestExit(Object.freeze({
            score: snapshot.score,
            duration: durationMs / 1000,
            completed: true,
            extra: Object.freeze({
                newRecord,
                remainingSeconds: Math.floor(snapshot.remainingMs / 1000),
                challengeDate: this.model?.dateKey,
                continued: snapshot.continued,
            }),
        }));
    }

    private currentDurationSeconds(): number {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return Math.max(0, (Date.now() - this.roundStartedAt) / 1000);
        const total = this.config.timeLimitSeconds * 1000
            + (snapshot.continuedWithTime ? this.config.continueSeconds * 1000 : 0);
        return Math.max(0, (total - snapshot.remainingMs) / 1000);
    }

    private isAdsEnabled(): boolean {
        const context = this.context;
        return Boolean(context?.services.ads.isEnabledForGame(context.gameId));
    }

    private showToolHelp(tool: DesktopCleanupTool): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.stopDeviceMotion();
        this.freezePhysics('tool-help');
        this.activeToolHelp = tool;
        this.state = 'tool-help';
        this.inputLocked = true;
        const adRule = this.isAdsEnabled()
            ? '三种道具都用完免费次数后，本局可看视频补充任意一种；未配置广告时点击后直接补充，视频失败可继续尝试，完整播放成功后不再补充。'
            : '当前未开启视频补充次数。';
        this.destroyOverlay(this.toolHelpOverlay);
        this.toolHelpOverlay = this.buildOverlay(
            'DesktopToolHelpOverlay',
            TOOL_TITLES[tool],
            `${TOOL_DESCRIPTIONS[tool]}\n\n每局免费 ${this.config.freeUsesPerTool} 次。${adRule}`,
            [
                { name: 'CloseButton', label: '知道了', tone: 'teal', action: () => this.closeToolHelp() },
            ],
            tool,
        );
    }

    private closeToolHelp(): void {
        this.destroyOverlay(this.toolHelpOverlay);
        this.toolHelpOverlay = undefined;
        this.activeToolHelp = undefined;
        this.state = 'playing';
        this.unfreezePhysics('tool-help');
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
    }

    private showRules(firstTime: boolean): void {
        if (this.state !== 'playing' && this.state !== 'ready') return;
        this.stopDeviceMotion();
        this.freezePhysics('rules');
        this.rulesFirstTime = firstTime;
        this.state = 'rules';
        this.inputLocked = true;
        this.destroyOverlay(this.rulesOverlay);
        this.rulesOverlay = this.buildOverlay(
            'DesktopRulesOverlay',
            firstTime ? '今天也来清清桌面' : '整理规则',
            '点击物件露出的部分，把它放入 7 格收纳槽\n同类三件会自动收好，清掉上层会露出更深的物件\n在 180 秒内清空桌面',
            [
                { name: 'StartButton', label: firstTime ? '开始整理' : '知道了', tone: 'teal', action: () => this.closeRules(firstTime) },
            ],
        );
    }

    private closeRules(markSeen: boolean): void {
        this.destroyOverlay(this.rulesOverlay);
        this.rulesOverlay = undefined;
        this.rulesFirstTime = false;
        if (markSeen && this.save.rulesSeenVersion < DESKTOP_CLEANUP_RULES_VERSION) {
            this.save = Object.freeze({ ...this.save, rulesSeenVersion: DESKTOP_CLEANUP_RULES_VERSION });
            this.persistSave();
        }
        this.state = 'playing';
        this.unfreezePhysics('rules');
        if (this.pileBirthAnimationPending) {
            this.playPileBirthAnimation();
            return;
        }
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
    }

    private readonly handlePause = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private readonly handleHelp = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.showRules(false);
    };

    private startDeviceMotion(): void {
        const platform = this.context?.services.platform;
        if (!platform?.supportsAccelerometer()) return;
        this.resetAccelerometerTracking();
        platform.startAccelerometer();
    }

    private stopDeviceMotion(): void {
        this.context?.services.platform.stopAccelerometer();
        this.resetAccelerometerTracking();
    }

    private resetAccelerometerShakeBurst(): void {
        this.accelerometerShakeEnergy = 0;
        this.accelerometerShakeDirectionX = 0;
        this.accelerometerShakeDirectionY = 0;
        this.accelerometerShakeSampleCount = 0;
        this.lastAccelerometerMotionAt = 0;
    }

    private resetAccelerometerTracking(): void {
        this.lastAccelerometerSample = undefined;
        this.accelerometerGravity = undefined;
        this.resetAccelerometerShakeBurst();
        this.lastAccelerometerShakeAt = 0;
    }

    private readonly handleAccelerometerChange = (sample: AccelerometerSample): void => {
        const previous = this.lastAccelerometerSample;
        this.lastAccelerometerSample = sample;
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        if (!previous) {
            this.accelerometerGravity = sample;
            return;
        }

        const previousGravity = this.accelerometerGravity ?? previous;
        const gravitySmoothing = ACCELEROMETER_GRAVITY_SMOOTHING;
        const gravity: AccelerometerSample = {
            x: previousGravity.x * gravitySmoothing + sample.x * (1 - gravitySmoothing),
            y: previousGravity.y * gravitySmoothing + sample.y * (1 - gravitySmoothing),
            z: previousGravity.z * gravitySmoothing + sample.z * (1 - gravitySmoothing),
        };
        this.accelerometerGravity = gravity;

        // 高通后的读数代表短促运动，z 轴参与判断是否真的在摇晃，但只用
        // x/y 决定桌面上的推动方向，避免把手机前后抖动变成随机横向移动。
        const motionX = sample.x - gravity.x;
        const motionY = sample.y - gravity.y;
        const motionZ = sample.z - gravity.z;
        const magnitude = Math.hypot(motionX, motionY, motionZ);
        const now = Date.now();
        if (now - this.lastAccelerometerShakeAt < ACCELEROMETER_SHAKE_COOLDOWN_MS) {
            // 一次颠锅只产生一个离散冲量；冷却期间不继续积累，避免持续晃动
            // 变成高频连发，把物品推得像漂移一样。
            this.resetAccelerometerShakeBurst();
            return;
        }
        if (now - this.lastAccelerometerMotionAt > ACCELEROMETER_SHAKE_WINDOW_MS) {
            this.resetAccelerometerShakeBurst();
        }
        if (magnitude <= ACCELEROMETER_SHAKE_DEADZONE) {
            this.accelerometerShakeEnergy *= ACCELEROMETER_SHAKE_ENERGY_DECAY;
            this.accelerometerShakeDirectionX *= ACCELEROMETER_SHAKE_DIRECTION_DECAY;
            this.accelerometerShakeDirectionY *= ACCELEROMETER_SHAKE_DIRECTION_DECAY;
            return;
        }

        this.lastAccelerometerMotionAt = now;
        this.accelerometerShakeEnergy = Math.min(
            ACCELEROMETER_SHAKE_TRIGGER * 2,
            this.accelerometerShakeEnergy * ACCELEROMETER_SHAKE_ENERGY_DECAY
                + magnitude - ACCELEROMETER_SHAKE_DEADZONE,
        );
        this.accelerometerShakeDirectionX = this.accelerometerShakeDirectionX
            * ACCELEROMETER_SHAKE_DIRECTION_DECAY + motionX;
        this.accelerometerShakeDirectionY = this.accelerometerShakeDirectionY
            * ACCELEROMETER_SHAKE_DIRECTION_DECAY + motionY;
        this.accelerometerShakeSampleCount += 1;

        if (this.accelerometerShakeSampleCount < ACCELEROMETER_SHAKE_MIN_SAMPLES
            || this.accelerometerShakeEnergy < ACCELEROMETER_SHAKE_TRIGGER) return;

        const directionLength = Math.hypot(
            this.accelerometerShakeDirectionX,
            this.accelerometerShakeDirectionY,
        );
        if (directionLength <= 0.000001) {
            this.resetAccelerometerShakeBurst();
            return;
        }

        this.lastAccelerometerShakeAt = now;
        const strength = Math.min(
            ACCELEROMETER_SHAKE_MAX_STRENGTH,
            ACCELEROMETER_SHAKE_MIN_STRENGTH
                + (this.accelerometerShakeEnergy - ACCELEROMETER_SHAKE_TRIGGER)
                / ACCELEROMETER_SHAKE_TRIGGER * 0.53,
        );
        const shake: DesktopCleanupShakeInput = {
            // 微信加速度计的 x/y 轴与竖屏桌面方向相反/相同的设备存在差异，
            // 只取变化量并使用相反的 x 方向，保证“向右晃”能把物品向右推。
            x: -this.accelerometerShakeDirectionX,
            y: this.accelerometerShakeDirectionY,
            strength,
        };
        this.resetAccelerometerShakeBurst();
        // 设备摇晃只改变物品运动，不提供额外触感反馈。
        this.physicsWorld.applyToss(shake);
    };

    private readonly handleBoardTouchStart = (event: EventTouch): void => {
        if (this.isNonGameplayTouchTarget(event.target)) return;
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        const touchId = event.getID();
        this.pendingPileTaps.set(touchId, { touchId });
        this.updatePendingPileTap(touchId, event.getLocation(), event.windowId);
    };

    private readonly handleBoardTouchMove = (event: EventTouch): void => {
        if (this.isNonGameplayTouchTarget(event.target)) {
            this.clearPendingPileTap(event.getID());
            return;
        }
        if (this.state !== 'playing' || this.inputLocked || !this.model) {
            this.clearPendingPileTap(event.getID());
            return;
        }
        this.updatePendingPileTap(event.getID(), event.getLocation(), event.windowId);
    };

    private readonly handleBoardTouchEnd = (event: EventTouch): void => {
        const touchId = event.getID();
        if (this.isNonGameplayTouchTarget(event.target)) {
            this.clearPendingPileTap(touchId);
            return;
        }
        if (this.state !== 'playing'
            || this.inputLocked
            || !this.model) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // Resolve one final time at release so the item under the finger at
        // the exact moment of lifting is the one that gets picked up.
        this.updatePendingPileTap(touchId, event.getLocation(), event.windowId);
        const target = this.pendingPileTaps.get(touchId);
        if (!target
            || target.touchId !== touchId
            || !target.itemId
            || !target.type
            || !target.node) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // A previous rapid pickup may have rebuilt the pile and destroyed the
        // node captured on touch start. Resolve the current node by item ID so
        // the click is not lost just because its view was refreshed.
        const currentNode = this.pileItemNodes.get(target.itemId);
        const node = currentNode?.isValid ? currentNode : target.node;
        if (!node.isValid || this.physicsWorld.getItemNode(target.itemId) !== node) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // Keep the exact live node protected until handleItemTap either hands
        // it to pickupAnimations or rejects the selection. Releasing an active
        // merge can synchronously renderPile; dropping this owner before that
        // render destroyed the clicked node and made the accepted item appear
        // directly in the tray with no flight animation.
        this.pendingPileTaps.set(touchId, {
            touchId,
            itemId: target.itemId,
            type: target.type,
            node,
        });
        try {
            this.handleItemTap(target.itemId, node);
        } finally {
            this.clearPendingPileTap(touchId);
        }
    };

    private readonly handleBoardTouchCancel = (event: EventTouch): void => {
        this.clearPendingPileTap(event.getID());
    };

    private isNonGameplayTouchTarget(target: unknown): boolean {
        let node = target instanceof Node ? target : undefined;
        while (node && node !== this.node) {
            const name = node.name;
            if (name === 'SlotTray'
                || name === 'ToolDock'
                || name === 'HelpButton'
                || name === 'PauseButton'
                || name.includes('Overlay')
                || name.includes('Button')
                || name.includes('ToolCard')) {
                return true;
            }
            node = node.parent;
        }
        return false;
    }

    private updatePendingPileTap(touchId: number, screenLocation: Vec2, windowId: number): void {
        this.rebindPendingPileTapNodes();
        const previous = this.pendingPileTaps.get(touchId);
        if (!previous) return;
        // If the logical candidate is still active but its view is between
        // render generations, do not let hit testing fall through to a lower
        // item for this move/end event. The next render will rebind it by ID.
        if (this.isPendingPileTapCandidateUnbound(previous)) return;
        const target = this.findPileItemAt(screenLocation, windowId);
        const sameTarget = Boolean(
            target
            && previous.itemId === target.itemId,
        );
        if (sameTarget && target) {
            // The item node may have been recreated during a render while the
            // finger stayed down. Keep the logical candidate and refresh only
            // its view reference instead of allowing a lower item to win.
            if (previous.node !== target.node) {
                if (previous.node?.isValid && previous.type) {
                    this.setItemHighlight(previous.node, previous.type, false);
                }
                this.setItemHighlight(target.node, target.type, true);
                this.pendingPileTaps.set(touchId, {
                    touchId,
                    itemId: target.itemId,
                    type: target.type,
                    node: target.node,
                });
            }
            return;
        }
        if (previous.node?.isValid && previous.type) {
            this.setItemHighlight(previous.node, previous.type, false);
        }
        if (!target) {
            this.pendingPileTaps.set(touchId, { touchId });
            return;
        }
        this.setItemHighlight(target.node, target.type, true);
        this.pendingPileTaps.set(touchId, {
            touchId,
            itemId: target.itemId,
            type: target.type,
            node: target.node,
        });
    }

    private isPendingPileTapCandidateUnbound(pending: PendingPileTap): boolean {
        if (!pending.itemId) return false;
        if (!this.model?.isItemActive(pending.itemId)) return false;
        const node = this.pileItemNodes.get(pending.itemId);
        return !node?.isValid || this.physicsWorld.getItemNode(pending.itemId) !== node;
    }

    private rebindPendingPileTapNodes(): void {
        const pile = this.pileRoot;
        const model = this.model;
        if (!pile || !model) return;
        this.pendingPileTaps.forEach((pending, touchId) => {
            if (!pending.itemId || !pending.type) return;
            // Another touch may have legitimately picked this candidate. Do
            // not keep a stale hold alive against an item that is no longer
            // part of the active desktop pile.
            if (!model.isItemActive(pending.itemId)) {
                this.clearPendingPileTap(touchId);
                return;
            }
            const currentNode = this.pileItemNodes.get(pending.itemId);
            if (!currentNode?.isValid
                || this.physicsWorld.getItemNode(pending.itemId) !== currentNode) return;
            if (pending.node === currentNode) return;
            if (pending.node?.isValid) {
                this.setItemHighlight(pending.node, pending.type, false);
            }
            this.setItemHighlight(currentNode, pending.type, true);
            this.pendingPileTaps.set(touchId, {
                ...pending,
                node: currentNode,
            });
        });
    }

    private clearPendingPileTap(touchId: number): void {
        const pending = this.pendingPileTaps.get(touchId);
        const node = pending?.itemId
            ? (this.pileItemNodes.get(pending.itemId) ?? pending.node)
            : pending?.node;
        if (node?.isValid && pending?.type) {
            this.setItemHighlight(node, pending.type, false);
        }
        this.pendingPileTaps.delete(touchId);
    }

    private clearPendingPileTaps(): void {
        Array.from(this.pendingPileTaps.keys()).forEach((touchId) => this.clearPendingPileTap(touchId));
    }

    private findPileItemAt(
        screenLocation: Vec2,
        windowId: number,
    ): { readonly itemId: string; readonly type: DesktopCleanupItemType; readonly node: Node } | undefined {
        void windowId;
        const itemId = this.physicsWorld.raycastItem(screenLocation.x, screenLocation.y);
        if (!itemId) return undefined;
        const type = this.pileItemTypes.get(itemId);
        const node = this.physicsWorld.getItemNode(itemId);
        return type && node?.isValid ? { itemId, type, node } : undefined;
        /* Legacy Sprite polygon hit testing.
        const pile = this.pileRoot;
        if (!pile) return undefined;
        const children = pile.children;
        for (let index = children.length - 1; index >= 0; index -= 1) {
            const node = children[index];
            if (!node?.isValid || !node.name.startsWith('Item-')) continue;
            const itemId = node.name.slice('Item-'.length);
            if (this.pileItemNodes.get(itemId) !== node) continue;
            const type = this.pileItemTypes.get(itemId);
            const transform = node.getComponent(UITransform);
            if (type
                && transform?.hitTest(screenLocation, windowId)
                && this.hitTestItemPolygon(transform, type, screenLocation)) {
                return { itemId, type, node };
            }
        }
        return undefined;
        */
    }

    private setItemHighlight(node: Node, type: DesktopCleanupItemType, highlighted: boolean): void {
        const itemId = Array.from(this.pileItemNodes.entries())
            .find(([, candidate]) => candidate === node)?.[0];
        if (!itemId) return;
        this.physicsWorld.setHighlighted(itemId, highlighted);
        const existing = this.selectionHighlights.get(itemId);
        if (!highlighted) {
            if (existing?.node.isValid) this.destroyNode(existing.node);
            this.selectionHighlights.delete(itemId);
            return;
        }
        if (existing?.source === node && existing.node.isValid) {
            this.syncSelectionHighlight(existing);
            return;
        }
        if (existing?.node.isValid) this.destroyNode(existing.node);
        const selectionRoot = this.selectionRoot;
        if (!selectionRoot?.isValid || !node.isValid) return;
        const outline = this.createNode(
            selectionRoot,
            `SelectionHighlight-${itemId}`,
            0,
            0,
            80,
            80,
        );
        // A graphics node has no input listener and therefore remains a pure
        // visual layer.  Its translucent fill restores the old “pressed mask”
        // while the warm border makes the actual raycast candidate obvious.
        const graphics = outline.addComponent(Graphics);
        graphics.fillColor = new Color(255, 248, 178, 48);
        graphics.strokeColor = new Color(255, 248, 178, 238);
        const highlight: DesktopCleanupSelectionHighlight = {
            itemId,
            source: node,
            node: outline,
            graphics,
        };
        this.selectionHighlights.set(itemId, highlight);
        this.syncSelectionHighlight(highlight);
    }

    private syncSelectionHighlights(): void {
        this.selectionHighlights.forEach((highlight, itemId) => {
            const node = this.pileItemNodes.get(itemId) ?? highlight.source;
            if (!node?.isValid || !this.model?.isItemActive(itemId)) {
                if (highlight.node.isValid) this.destroyNode(highlight.node);
                this.selectionHighlights.delete(itemId);
                return;
            }
            if (highlight.source !== node) {
                this.selectionHighlights.set(itemId, {
                    ...highlight,
                    source: node,
                });
            }
            this.syncSelectionHighlight(this.selectionHighlights.get(itemId)!);
        });
    }

    private syncSelectionHighlight(highlight: DesktopCleanupSelectionHighlight): void {
        const source = highlight.source;
        const outline = highlight.node;
        const root = this.selectionRoot;
        if (!source?.isValid || !outline?.isValid || !root?.isValid) return;
        const center = source.worldPosition;
        const screenPoints = [
            center,
            new Vec3(center.x - 0.72, center.y, center.z),
            new Vec3(center.x + 0.72, center.y, center.z),
            new Vec3(center.x, center.y + 0.72, center.z),
            new Vec3(center.x, center.y - 0.48, center.z),
            new Vec3(center.x, center.y, center.z - 0.72),
            new Vec3(center.x, center.y, center.z + 0.72),
        ]
            .map((point) => this.physicsWorld.worldToScreen(point))
            .filter((point): point is Vec3 => Boolean(point));
        if (screenPoints.length === 0) return;
        const centerUi = this.worldToUiPosition(center, root);
        if (!centerUi) return;
        const minX = Math.min(...screenPoints.map((point) => point.x));
        const maxX = Math.max(...screenPoints.map((point) => point.x));
        const minY = Math.min(...screenPoints.map((point) => point.y));
        const maxY = Math.max(...screenPoints.map((point) => point.y));
        const scale = this.layout?.scale ?? 1;
        const width = Math.max(48 * scale, maxX - minX + 22 * scale);
        const height = Math.max(48 * scale, maxY - minY + 22 * scale);
        outline.setPosition(centerUi.x, centerUi.y);
        outline.getComponent(UITransform)?.setContentSize(width, height);
        const graphics = highlight.graphics;
        graphics.clear();
        graphics.lineWidth = Math.max(3, 5 * scale);
        graphics.roundRect(-width * 0.5, -height * 0.5, width, height, Math.min(18 * scale, width * 0.18));
        graphics.fill();
        graphics.stroke();
    }

    private settlePendingImmediately(): void {
        const model = this.model;
        const pending = model?.snapshot.pendingSelections ?? [];
        this.cancelPileBirthAnimation();
        if (!model && this.pickupAnimations.size === 0 && this.matchAnimations.size === 0) return;
        this.operationGeneration += 1;
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotClearAnimations();
        this.cancelSlotMoves();
        pending.forEach((selection) => model?.settleSelection(selection.token));
        model?.finalizeSelectionBatch();
        this.inputLocked = false;
        if (this.node.isValid) this.renderAll();
    }

    private registerGlobalInput(): void {
        input.on(Input.EventType.KEY_UP, this.handleKeyUp, this);
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleResize, this);
            this.resizeListening = true;
        }
    }

    private unregisterGlobalInput(): void {
        input.off(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.node.off(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleResize, this);
            this.resizeListening = false;
        }
    }

    private readonly handleKeyUp = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE && this.state === 'playing') this.handlePause();
    };

    private readonly handleResize = (): void => {
        if (this.state === 'idle' || this.state === 'disposed') return;
        this.clearPendingPileTaps();
        this.settlePendingImmediately();
        const wasRules = this.state === 'rules';
        const rulesFirstTime = this.rulesFirstTime;
        const toolHelp = this.state === 'tool-help' ? this.activeToolHelp : undefined;
        const wasFailure = this.state === 'failed';
        const pauseModel = this.pauseModel;
        const resultModel = this.resultModel;
        this.rulesOverlay = undefined;
        this.toolHelpOverlay = undefined;
        this.failureOverlay = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.buildInterface();
        this.syncPhysicsLayout();
        this.renderAll();
        if (wasRules) {
            this.state = 'playing';
            this.showRules(rulesFirstTime);
        }
        else if (toolHelp) {
            this.state = 'playing';
            this.inputLocked = false;
            this.showToolHelp(toolHelp);
        }
        else if (wasFailure) this.showFailure();
        else if (pauseModel) this.showPauseMenu(pauseModel);
        else if (resultModel) this.showResultView(resultModel);
        else if (this.state === 'playing') this.syncTerminalPhase();
    };

    private buildOverlay(
        name: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
        toolIcon?: DesktopCleanupTool,
    ): OverlayState {
        const metrics = this.layout ?? readDesktopCleanupLayout(this.node, this.context?.services.platform.getLayoutInfo());
        const root = this.createNode(this.node, name, 0, 0, metrics.width, metrics.height);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(15, 21, 32, 232);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();
        const panelWidth = Math.min(metrics.width - 76 * metrics.scale, 610 * metrics.scale);
        const prototypePanelRatio = 1402 / 1122;
        const panelHeight = Math.min(
            metrics.height - metrics.safeTop - metrics.safeBottom - 48 * metrics.scale,
            panelWidth * prototypePanelRatio,
        );
        const panelY = (metrics.safeBottom - metrics.safeTop) / 2;
        const panel = this.createNode(root, 'ClayPanel', 0, panelY, panelWidth, panelHeight);
        const panelFallback = this.createNode(panel, 'Fallback', 0, 0, panelWidth, panelHeight);
        const panelGraphics = panelFallback.addComponent(Graphics);
        panelGraphics.fillColor = COLORS.paper;
        panelGraphics.strokeColor = COLORS.mustard;
        panelGraphics.lineWidth = 6 * metrics.scale;
        panelGraphics.roundRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            42 * metrics.scale,
        );
        panelGraphics.fill();
        panelGraphics.stroke();
        this.applyThemeFrame(panel, 'popupPanel');

        // The approved prototype uses the same game emblem as a tactile tab
        // that sits over the popup's top edge. Tool help keeps this universal
        // shell so every popup state reads as one visual system.
        void toolIcon;
        const emblem = this.createNode(
            panel,
            'PopupEmblem',
            0,
            panelHeight / 2 - 32 * metrics.scale,
            300 * metrics.scale,
            150 * metrics.scale,
        );
        const emblemFallback = this.createNode(emblem, 'Fallback', 0, 0, 300 * metrics.scale, 150 * metrics.scale);
        const emblemGraphics = emblemFallback.addComponent(Graphics);
        emblemGraphics.fillColor = COLORS.mustard;
        emblemGraphics.roundRect(-76 * metrics.scale, -24 * metrics.scale, 152 * metrics.scale, 48 * metrics.scale, 24 * metrics.scale);
        emblemGraphics.fill();
        this.applyThemeFrame(emblem, 'title');

        const top = panelHeight / 2;
        const titleY = top - 164 * metrics.scale;
        const dividerY = top - 226 * metrics.scale;
        const titleLabel = this.createLabel(panel, 'Title', title, 0, titleY, 50 * metrics.scale, COLORS.ink, panelWidth - 80 * metrics.scale, 70 * metrics.scale);
        titleLabel.isBold = true;
        const divider = this.createNode(panel, 'Divider', 0, dividerY, 420 * metrics.scale, 18 * metrics.scale);
        const dividerGraphics = divider.addComponent(Graphics);
        dividerGraphics.fillColor = COLORS.mustard;
        for (let x = -192 * metrics.scale; x <= 192 * metrics.scale; x += 13 * metrics.scale) {
            if (Math.abs(x) < 10 * metrics.scale) continue;
            dividerGraphics.circle(x, 0, 1.8 * metrics.scale);
        }
        dividerGraphics.circle(0, 0, 6 * metrics.scale);
        dividerGraphics.fill();
        const bodyWidth = Math.max(1, panelWidth - 144 * metrics.scale);
        const bodyLabel = this.createLabel(panel, 'Body', body, 0, 0, 24 * metrics.scale, COLORS.inkSoft, bodyWidth, Math.max(1, metrics.scale));
        const bodyTransform = bodyLabel.node.getComponent(UITransform);
        bodyTransform?.setAnchorPoint(0.5, 1);
        bodyLabel.node.setPosition(0, top - 260 * metrics.scale);
        bodyLabel.verticalAlign = 0;
        bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        bodyLabel.lineHeight = 36 * metrics.scale;
        bodyLabel.enableWrapText = true;
        bodyLabel.updateRenderData(true);
        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        const buttonWidth = Math.min(420 * metrics.scale, panelWidth - 112 * metrics.scale);
        const buttonHeight = 104 * metrics.scale;
        const gap = 120 * metrics.scale;
        const bottomButtonY = -panelHeight / 2 + 122 * metrics.scale;
        const startY = bottomButtonY + (actions.length - 1) * gap;
        actions.forEach((action, index) => {
            const button = this.createPillButton(
                panel,
                action.name,
                0,
                startY - index * gap,
                buttonWidth,
                buttonHeight,
                action.label,
                action.tone,
                () => { void this.runOverlayAction(state, action); },
                action.adIcon === true,
            );
            buttons.push(button);
        });
        panel.setScale(0.94, 0.94, 1);
        tween(panel).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => { button.interactable = false; });
        try {
            await action.action();
        } catch (error: unknown) {
            console.error(`[DesktopCleanupGame] Overlay action ${action.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => { button.interactable = true; });
            }
        }
    }

    private setOverlayBusy(overlay: OverlayState | undefined, busy: boolean, label: string): void {
        if (!overlay?.root.isValid) return;
        overlay.busy = busy;
        overlay.buttons.forEach((button) => { button.interactable = !busy; });
        const first = overlay.buttons[0]?.node.getChildByName('Label')?.getComponent(Label);
        if (first && busy) first.string = label;
    }

    private createHeaderIconButton(
        name: string,
        x: number,
        y: number,
        icon: 'help' | 'pause',
        color: Color,
        handler: () => void,
    ): Button {
        const metrics = this.layout!;
        const size = 82 * metrics.scale;
        const node = this.createNode(this.node, name, x, y, size, size);
        node.addComponent(UIOpacity);
        const fallback = this.createNode(node, 'Fallback', 0, 0, size, size);
        const graphics = fallback.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = color;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.circle(0, 0, size * 0.44);
        graphics.fill();
        graphics.stroke();
        const glyph = this.createNode(fallback, 'Glyph', 0, 0, 38 * metrics.scale, 38 * metrics.scale);
        if (icon === 'help') this.drawHelpIcon(glyph, COLORS.ink);
        else this.drawPauseIcon(glyph, COLORS.ink);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler, this);
        return button;
    }

    private createSmallHelpButton(
        parent: Node,
        x: number,
        y: number,
        size: number,
        handler: () => void,
    ): Button {
        const node = this.createNode(parent, 'Help', x, y, size, size);
        const background = node.addComponent(Graphics);
        background.fillColor = new Color(255, 247, 220, 244);
        background.strokeColor = new Color(38, 45, 64, 165);
        background.lineWidth = Math.max(1.5, size * 0.06);
        background.circle(0, 0, size * 0.46);
        background.fill();
        background.stroke();
        const glyph = this.createNode(node, 'Glyph', 0, 0, size * 0.66, size * 0.66);
        this.drawHelpIcon(glyph, COLORS.ink);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.88;
        button.duration = 0.07;
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            handler();
        }, this);
        return button;
    }

    private drawHelpIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 32;
        const unit = size / 32;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(2, 3.8 * unit);
        graphics.moveTo(-7 * unit, 6 * unit);
        graphics.bezierCurveTo(-6 * unit, 14 * unit, 8 * unit, 14 * unit, 8 * unit, 5 * unit);
        graphics.bezierCurveTo(8 * unit, 0, 1 * unit, 0, 1 * unit, -5 * unit);
        graphics.stroke();
        graphics.circle(1 * unit, -11 * unit, 2.5 * unit);
        graphics.fill();
    }

    private drawPauseIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 32;
        const unit = size / 32;
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-10 * unit, -12 * unit, 7 * unit, 24 * unit, 3 * unit);
        graphics.roundRect(3 * unit, -12 * unit, 7 * unit, 24 * unit, 3 * unit);
        graphics.fill();
    }

    private drawClockIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 40;
        const unit = size / 40;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(2, 3.5 * unit);
        graphics.circle(0, -1 * unit, 15 * unit);
        graphics.stroke();
        graphics.moveTo(0, -1 * unit);
        graphics.lineTo(0, 8 * unit);
        graphics.moveTo(0, -1 * unit);
        graphics.lineTo(7 * unit, -6 * unit);
        graphics.stroke();
        graphics.roundRect(-6 * unit, 15 * unit, 12 * unit, 4 * unit, 2 * unit);
        graphics.fill();
    }

    private drawToolIcon(node: Node, tool: DesktopCleanupTool, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 60;
        const unit = size / 60;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(3, 5 * unit);
        if (tool === 'return') {
            graphics.moveTo(21 * unit, -16 * unit);
            graphics.bezierCurveTo(21 * unit, 13 * unit, -9 * unit, 20 * unit, -19 * unit, 2 * unit);
            graphics.stroke();
            graphics.moveTo(-23 * unit, 7 * unit);
            graphics.lineTo(-20 * unit, -8 * unit);
            graphics.lineTo(-8 * unit, 1 * unit);
            graphics.close();
            graphics.fill();
            return;
        }
        if (tool === 'magnet') {
            graphics.moveTo(-20 * unit, 18 * unit);
            graphics.lineTo(-20 * unit, -4 * unit);
            graphics.bezierCurveTo(-20 * unit, -27 * unit, 20 * unit, -27 * unit, 20 * unit, -4 * unit);
            graphics.lineTo(20 * unit, 18 * unit);
            graphics.stroke();
            graphics.fillColor = new Color(255, 235, 174, 255);
            graphics.roundRect(-25 * unit, 12 * unit, 11 * unit, 11 * unit, 3 * unit);
            graphics.roundRect(14 * unit, 12 * unit, 11 * unit, 11 * unit, 3 * unit);
            graphics.fill();
            return;
        }
        graphics.moveTo(-22 * unit, 15 * unit);
        graphics.bezierCurveTo(-5 * unit, 15 * unit, 4 * unit, -15 * unit, 20 * unit, -15 * unit);
        graphics.moveTo(-22 * unit, -15 * unit);
        graphics.bezierCurveTo(-5 * unit, -15 * unit, 4 * unit, 15 * unit, 20 * unit, 15 * unit);
        graphics.stroke();
        graphics.moveTo(14 * unit, 22 * unit);
        graphics.lineTo(25 * unit, 15 * unit);
        graphics.lineTo(14 * unit, 8 * unit);
        graphics.close();
        graphics.moveTo(14 * unit, -8 * unit);
        graphics.lineTo(25 * unit, -15 * unit);
        graphics.lineTo(14 * unit, -22 * unit);
        graphics.close();
        graphics.fill();
    }

    private createPillButton(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        tone: OverlayAction['tone'],
        handler: () => void,
        showAdIcon = false,
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const fallback = this.createNode(node, 'Fallback', 0, 0, width, height);
        const graphics = fallback.addComponent(Graphics);
        const color = this.actionColor(tone);
        graphics.fillColor = new Color(30, 33, 45, 72);
        graphics.roundRect(-width / 2 + 4, -height / 2 - 6, width, height, height * 0.38);
        graphics.fill();
        graphics.fillColor = color;
        graphics.strokeColor = COLORS.paper;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, height * 0.38);
        graphics.fill();
        graphics.stroke();
        this.applyPopupButtonSlices(node, this.popupButtonFrameKey(tone), width, height);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const iconSize = Math.min(42, height - 22);
        const labelFontSize = Math.min(30, height * 0.34);
        const label = this.createLabel(
            node,
            'Label',
            text,
            0,
            0,
            labelFontSize,
            tone === 'paper' ? COLORS.ink : COLORS.paper,
            width - 20,
            height - 10,
        );
        // Button copy is always a single line. Label.SHRINK scales the glyphs
        // down when a longer action label exceeds the available text width.
        label.enableWrapText = false;
        label.overflow = Label.Overflow.SHRINK;
        if (showAdIcon) {
            const icon = attachRewardedVideoIcon(
                node,
                this.rewardedVideoIconFrame,
                0,
                0,
                iconSize,
            );
            layoutRewardedVideoIconBeforeLabel(
                icon,
                label,
                text,
                labelFontSize,
                iconSize,
                width,
            );
        }
        label.isBold = true;
        return button;
    }

    private applyPopupButtonSlices(node: Node, key: ThemeFrameKey, width: number, height: number): boolean {
        const frame = this.themeFrames.get(key);
        const sourceRect = frame?.rect;
        const texture = frame?.texture;
        if (!frame || !sourceRect || !texture) return false;
        const fallback = node.getChildByName('Fallback');
        if (fallback) fallback.active = false;

        // Keep the rounded ends at a fixed visual width and stretch only the
        // center strip. All three button tones use the same target geometry.
        const capWidth = Math.min(height * 0.78, width / 2 - 1);
        const centerWidth = Math.max(1, width - capWidth * 2);
        const sourceCapWidth = Math.min(
            sourceRect.width * POPUP_BUTTON_HORIZONTAL_INSET_RATIO,
            sourceRect.width / 2 - 1,
        );
        const sourceCenterWidth = Math.max(1, sourceRect.width - sourceCapWidth * 2);
        const slices = [
            {
                name: 'Left',
                x: -width / 2 + capWidth / 2,
                width: capWidth,
                sourceX: sourceRect.x,
                sourceWidth: sourceCapWidth,
            },
            {
                name: 'Center',
                x: 0,
                width: centerWidth,
                sourceX: sourceRect.x + sourceCapWidth,
                sourceWidth: sourceCenterWidth,
            },
            {
                name: 'Right',
                x: width / 2 - capWidth / 2,
                width: capWidth,
                sourceX: sourceRect.x + sourceRect.width - sourceCapWidth,
                sourceWidth: sourceCapWidth,
            },
        ] as const;

        slices.forEach((slice) => {
            const artwork = this.createNode(node, `Artwork${slice.name}`, slice.x, 0, slice.width, height);
            const partFrame = new SpriteFrame();
            partFrame.texture = texture;
            partFrame.rect = new Rect(slice.sourceX, sourceRect.y, slice.sourceWidth, sourceRect.height);
            partFrame.originalSize = new Size(slice.sourceWidth, sourceRect.height);
            partFrame.offset = new Vec2();
            this.popupButtonFrames.add(partFrame);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.spriteFrame = partFrame;
        });
        return true;
    }

    private popupButtonFrameKey(tone: OverlayAction['tone']): ThemeFrameKey {
        if (tone === 'teal') return 'popupButtonTeal';
        if (tone === 'paper') return 'popupButtonPaper';
        return 'popupButtonCoral';
    }

    private createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(Math.max(1, width), Math.max(1, height));
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
        label.fontSize = Math.max(10, fontSize);
        label.lineHeight = Math.max(14, fontSize + 8);
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return label;
    }

    private actionColor(tone: OverlayAction['tone']): Color {
        if (tone === 'coral') return COLORS.coral;
        if (tone === 'teal') return COLORS.teal;
        if (tone === 'mustard') return COLORS.mustard;
        return new Color(116, 110, 110, 255);
    }

    private itemDisplaySize(type: DesktopCleanupItemType, scale: number): Size {
        const extent = 192 * (this.theme.itemSizeMultipliers[type] ?? 1) * scale;
        return new Size(extent, extent);
    }

    private fitItemSize(type: DesktopCleanupItemType, maximumWidth: number, maximumHeight: number): Size {
        void type;
        const edge = Math.min(maximumWidth, maximumHeight);
        return new Size(edge, edge);
    }

    private pilePosition(item: DesktopCleanupItemSnapshot, metrics: DesktopCleanupLayoutMetrics): Vec3 {
        void item;
        void metrics;
        return new Vec3();
    }

    private fitSize(width: number, height: number, maximumWidth: number, maximumHeight: number): Size {
        const scale = Math.min(maximumWidth / Math.max(1, width), maximumHeight / Math.max(1, height));
        return new Size(Math.max(1, width * scale), Math.max(1, height * scale));
    }

    private slotTargetInParent(parent: Node | null, index: number): Vec3 {
        const root = this.slotRoot;
        const rootTransform = root?.getComponent(UITransform);
        const parentTransform = parent?.getComponent(UITransform);
        if (!root || !rootTransform || !parent) return new Vec3();
        const width = rootTransform.contentSize.width;
        const cellWidth = width / this.config.slotCapacity;
        const clampedIndex = Math.max(0, Math.min(this.config.slotCapacity - 1, index));
        const local = new Vec3(-width / 2 + cellWidth * (clampedIndex + 0.5), 0, 0);
        const world = rootTransform.convertToWorldSpaceAR(local);
        if (parentTransform) return parentTransform.convertToNodeSpaceAR(world);
        // PickupAnimationRoot is a direct child of the game UI root, so this
        // conversion also works for its minimal UITransform.
        const ancestorTransform = parent.parent?.getComponent(UITransform);
        return ancestorTransform?.convertToNodeSpaceAR(world) ?? world;
    }

    private slotTargetWorld(index: number): Vec3 | undefined {
        const root = this.slotRoot;
        const transform = root?.getComponent(UITransform);
        const trayTransform = this.node.getChildByName('SlotTray')?.getComponent(UITransform);
        if (!root || !transform || !trayTransform) return undefined;
        const trayWidth = Math.max(1, trayTransform.contentSize.width);
        const slotWidthRatio = transform.contentSize.width / trayWidth;
        return this.physicsWorld.getTraySlotWorld(
            index,
            this.config.slotCapacity,
            slotWidthRatio,
            0.58,
        );
    }

    private worldToUiPosition(worldPosition: Readonly<Vec3>, parent: Node): Vec3 | undefined {
        const parentTransform = parent.getComponent(UITransform);
        const canvasCamera = this.node.scene?.getComponentInChildren(Canvas)?.cameraComponent;
        const screen = this.physicsWorld.worldToScreen(worldPosition);
        if (!parentTransform || !canvasCamera || !screen) return undefined;
        const uiWorld = canvasCamera.screenToWorld(new Vec3(screen.x, screen.y, 0));
        const local = parentTransform.convertToNodeSpaceAR(uiWorld);
        return new Vec3(local.x, local.y, 0);
    }

    private pulseSlot(index: number): void {
        const clampedIndex = Math.max(0, Math.min(this.config.slotCapacity - 1, index));
        const cell = this.slotRoot?.getChildByName(`Cell-${clampedIndex}`);
        if (!cell?.isValid) return;
        Tween.stopAllByTarget(cell);
        cell.setScale(1, 1, 1);
        tween(cell)
            .to(0.08, { scale: new Vec3(1.10, 1.10, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private readonly hideHintToast = (): void => {
        const root = this.hintRoot;
        const opacity = root?.getComponent(UIOpacity);
        if (!root?.isValid || !opacity) return;
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(0.16, { opacity: 0 })
            .call(() => {
                if (root.isValid) root.active = false;
            })
            .start();
    };

    private setHint(message: string): void {
        this.unschedule(this.hideHintToast);
        const root = this.hintRoot;
        const label = this.hintLabel;
        const opacity = root?.getComponent(UIOpacity);
        if (!root || !label || !opacity) return;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;
        if (!message.trim()) {
            root.active = false;
            label.string = '';
            return;
        }
        label.string = message;
        root.active = true;
        this.scheduleOnce(this.hideHintToast, 1.8);
    }

    private persistSave(): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        try {
            writeDesktopCleanupSave(storage, this.save);
        } catch (error: unknown) {
            console.error('[DesktopCleanupGame] Save failed.', error);
        }
    }

    private destroyAllOverlays(): void {
        this.destroyOverlay(this.rulesOverlay);
        this.destroyOverlay(this.toolHelpOverlay);
        this.destroyOverlay(this.failureOverlay);
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.rulesOverlay = undefined;
        this.toolHelpOverlay = undefined;
        this.activeToolHelp = undefined;
        this.failureOverlay = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
    }

    private destroyOverlay(overlay?: OverlayState): void {
        if (overlay?.root.isValid) this.destroyNode(overlay.root);
    }

    private destroyNode(node: Node): void {
        if (!node.isValid || this.destroyedNodes.has(node)) return;
        this.destroyedNodes.add(node);
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        const spriteFrame = node.getComponent(Sprite)?.spriteFrame;
        if (spriteFrame && this.popupButtonFrames.delete(spriteFrame)) spriteFrame.destroy();
        node.children.slice().forEach((child) => this.destroyNode(child));
        node.removeFromParent();
        node.destroy();
    }

    private isCurrent(generation: number): boolean {
        return generation === this.operationGeneration
            && this.state !== 'disposed'
            && this.node.isValid;
    }
}
