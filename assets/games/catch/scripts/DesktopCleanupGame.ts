import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
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
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { Platform } from '../../../platform/Platform';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    DEFAULT_DESKTOP_CLEANUP_CONFIG,
    parseDesktopCleanupGameplayConfig,
    type DesktopCleanupGameplayConfig,
} from './DesktopCleanupConfig';
import {
    DESKTOP_CLEANUP_ITEM_TYPES,
    DESKTOP_CLEANUP_RUMMAGE_LAYER_WEIGHTS,
    DesktopCleanupModel,
    desktopCleanupDateKey,
    runDesktopCleanupLayoutSelfCheck,
    type DesktopCleanupActionResult,
    type DesktopCleanupItemSnapshot,
    type DesktopCleanupItemType,
    type DesktopCleanupPendingSelection,
    type DesktopCleanupTool,
} from './DesktopCleanupModel';
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

const { ccclass } = _decorator;

const BUNDLE = 'game-catch';
const BACKGROUND_PATH = 'visual/backgrounds/desktop-cleanup-backdrop-v2/texture';
const PLAYMAT_PATH = 'visual/backgrounds/desktop-cleanup-playmat-v2/texture';
const ITEM_ATLAS_PATH = 'visual/items/desktop-cleanup-items-atlas-v2/texture';
const ITEM_HITMASK_PATH = 'visual/items/desktop-cleanup-items-hitmask-v2';
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
    'smoke',
]);
const ITEM_LABELS: Readonly<Record<DesktopCleanupItemType, string>> = Object.freeze({
    'blue-pen': '蓝笔',
    'red-pencil': '铅笔',
    'yellow-eraser': '橡皮',
    'mint-notes': '便签',
    'binder-clip': '夹子',
    'orange-tape': '胶带',
    'teal-usb': 'U盘',
    'cream-earbuds': '耳机',
    'coral-keycap': '键帽',
    'purple-stress-ball': '软球',
    'round-coaster': '杯垫',
    'spiral-notebook': '线圈本',
    'clear-ruler': '直尺',
    'lucky-badge': '★',
});

const ITEM_COLORS: Readonly<Record<DesktopCleanupItemType, Color>> = Object.freeze({
    'blue-pen': new Color(76, 139, 194, 255),
    'red-pencil': new Color(222, 103, 89, 255),
    'yellow-eraser': new Color(238, 190, 77, 255),
    'mint-notes': new Color(111, 191, 167, 255),
    'binder-clip': new Color(54, 65, 84, 255),
    'orange-tape': new Color(229, 136, 71, 255),
    'teal-usb': new Color(67, 160, 164, 255),
    'cream-earbuds': new Color(240, 223, 187, 255),
    'coral-keycap': new Color(229, 119, 114, 255),
    'purple-stress-ball': new Color(151, 115, 174, 255),
    'round-coaster': new Color(167, 116, 77, 255),
    'spiral-notebook': new Color(95, 124, 155, 255),
    'clear-ruler': new Color(141, 200, 201, 255),
    'lucky-badge': new Color(241, 184, 50, 255),
});

interface ItemAlphaMask {
    readonly gridSize: number;
    readonly rows: readonly string[];
}

interface ItemHitmaskPayload {
    readonly version?: number;
    readonly gridSize?: number;
    readonly types?: Partial<Record<DesktopCleanupItemType, { readonly rows?: readonly string[] }>>;
}

const TOOL_TITLES: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '归位夹',
    magnet: '磁吸盒',
    shuffle: '桌面风暴',
});

const TOOL_DESCRIPTIONS: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '把收纳槽中最近放入的最多 3 件物品送回桌面，适合在槽位快满时腾出空间。',
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
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'coral' | 'teal' | 'paper' | 'mustard';
    readonly action: () => void | Promise<void>;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

interface PileDragItem {
    readonly itemId: string;
    readonly node: Node;
    readonly basePosition: Vec3;
    readonly baseAngle: number;
    readonly weight: number;
}

interface PileDragSession {
    readonly touchId: number;
    readonly start: Vec2;
    readonly candidateItemId?: string;
    readonly items: readonly PileDragItem[];
    delta: Vec2;
    dragging: boolean;
}

@ccclass('DesktopCleanupGame')
export class DesktopCleanupGame extends Component implements MiniGame<DesktopCleanupServices> {
    private state: GameState = 'idle';
    private stateBeforePause: GameState = 'playing';
    private context?: MiniGameContext<DesktopCleanupServices>;
    private config: DesktopCleanupGameplayConfig = DEFAULT_DESKTOP_CLEANUP_CONFIG;
    private model?: DesktopCleanupModel;
    private save: DesktopCleanupSave = Object.freeze({
        playCount: 0,
        highScore: 0,
        wins: 0,
        rulesSeenVersion: 0,
    });
    private roundStartedAt = 0;
    private layout?: DesktopCleanupLayoutMetrics;
    private pileRoot?: Node;
    private slotRoot?: Node;
    private timerLabel?: Label;
    private headerLogoRoot?: Node;
    private hintRoot?: Node;
    private hintLabel?: Label;
    private pileItemNodes = new Map<string, Node>();
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
    private itemAtlasTexture?: Texture2D;
    private itemFrames = new Map<DesktopCleanupItemType, SpriteFrame>();
    private itemHitmasks = new Map<DesktopCleanupItemType, ItemAlphaMask>();
    private resizeListening = false;
    private inputLocked = false;
    private rulesFirstTime = false;
    private adBusy = false;
    private terminalPending = false;
    private operationGeneration = 0;
    private pileDragSession?: PileDragSession;
    private dragSettleGeneration = 0;
    private dragSettling = false;
    private lastHudSecond = -1;
    private lastReportedScore?: number;

    async initialize(context: MiniGameContext<DesktopCleanupServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize DesktopCleanupGame from ${this.state}.`);
        this.context = context;
        this.config = await this.loadGameplayConfig();
        const selfCheck = runDesktopCleanupLayoutSelfCheck(365, this.config.dailySeedSalt);
        if (!selfCheck.valid) throw new Error(`Desktop cleanup self-check failed: ${selfCheck.errors.join('; ')}`);
        this.save = readDesktopCleanupSave(context.services.storage);
        this.buildInterface();
        this.registerGlobalInput();
        await this.loadThemeAssets();
        this.applyThemeAssets();
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin DesktopCleanupGame from ${this.state}.`);
        this.startRound();
    }

    protected update(deltaTime: number): void {
        if (this.state !== 'playing' || !this.model) return;
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
        this.cancelActivePileDrag();
        this.cancelDragSettlement();
        this.settlePendingImmediately();
        if (this.state !== 'paused') this.stateBeforePause = this.state;
        this.state = 'paused';
        this.inputLocked = true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.stateBeforePause === 'paused' ? 'playing' : this.stateBeforePause;
        this.inputLocked = this.state !== 'playing';
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
        this.operationGeneration += 1;
        this.unregisterGlobalInput();
        this.unscheduleAllCallbacks();
        this.destroyAllOverlays();
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        this.backgroundFrame?.destroy();
        this.backgroundFrame = undefined;
        this.themeFrames.forEach((frame) => frame.destroy());
        this.themeFrames.clear();
        this.itemFrames.forEach((frame) => frame.destroy());
        this.itemFrames.clear();
        this.itemHitmasks.clear();
        this.pileItemNodes.clear();
        this.itemAtlasTexture = undefined;
        this.model = undefined;
        this.context = undefined;
        this.lastReportedScore = undefined;
        this.state = 'disposed';
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.pauseModel = model;
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = this.buildOverlay(
            'DesktopPauseOverlay',
            '先歇一会儿',
            '倒计时已经暂停\n回来后会从当前时间继续',
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
        const key = desktopCleanupDateKey();
        this.model = new DesktopCleanupModel(key, this.config);
        this.roundStartedAt = Date.now();
        this.save = Object.freeze({ ...this.save, playCount: this.save.playCount + 1 });
        this.persistSave();
        this.terminalPending = false;
        this.inputLocked = false;
        this.lastHudSecond = -1;
        this.lastReportedScore = 0;
        this.context?.reportScore(0);
        this.state = 'playing';
        this.renderAll();
        this.setHint('');
        if (this.save.rulesSeenVersion < DESKTOP_CLEANUP_RULES_VERSION) {
            this.showRules(true);
        }
    }

    private resetOperations(): void {
        this.operationGeneration += 1;
        this.adBusy = false;
        this.terminalPending = false;
        this.inputLocked = false;
        this.pileDragSession = undefined;
        this.dragSettleGeneration += 1;
        this.dragSettling = false;
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

    private async loadThemeAssets(): Promise<void> {
        const [background, atlas, hitmask, themeTextures] = await Promise.all([
            this.loadTexture(BACKGROUND_PATH),
            this.loadTexture(ITEM_ATLAS_PATH),
            this.loadJson(ITEM_HITMASK_PATH),
            Promise.all(THEME_FRAME_KEYS.map(async (key) => (
                [key, await this.loadTexture(THEME_TEXTURE_PATHS[key])] as const
            ))),
        ]);
        if (this.state === 'disposed' || !this.node.isValid) return;
        if (background) {
            this.backgroundFrame?.destroy();
            const frame = new SpriteFrame();
            frame.texture = background;
            this.backgroundFrame = frame;
        }
        if (atlas) this.sliceItemAtlas(atlas);
        if (hitmask) this.readItemHitmasks(hitmask);
        themeTextures.forEach(([key, texture]) => {
            if (!texture) return;
            this.themeFrames.get(key)?.destroy();
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.themeFrames.set(key, frame);
        });
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

    private loadJson(path: string): Promise<JsonAsset | undefined> {
        const bundle = assetManager.getBundle(BUNDLE);
        if (!bundle) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            bundle.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    console.warn(`[DesktopCleanupGame] Data asset unavailable: ${path}`, error);
                    resolve(undefined);
                    return;
                }
                resolve(asset);
            });
        });
    }

    private readItemHitmasks(asset: JsonAsset): void {
        const payload = asset.json as ItemHitmaskPayload;
        const gridSize = Number.isInteger(payload?.gridSize) && (payload.gridSize ?? 0) > 0
            ? payload.gridSize!
            : 96;
        const packedRowLength = Math.ceil(gridSize / 4);
        this.itemHitmasks.clear();
        DESKTOP_CLEANUP_ITEM_TYPES.forEach((type) => {
            const rows = payload?.types?.[type]?.rows;
            if (!Array.isArray(rows)
                || rows.length !== gridSize
                || rows.some((row) => typeof row !== 'string' || row.length !== packedRowLength)) return;
            this.itemHitmasks.set(type, Object.freeze({
                gridSize,
                rows: Object.freeze([...rows]),
            }));
        });
        if (this.itemHitmasks.size !== DESKTOP_CLEANUP_ITEM_TYPES.length) {
            console.warn(`[DesktopCleanupGame] Loaded ${this.itemHitmasks.size}/${DESKTOP_CLEANUP_ITEM_TYPES.length} item alpha masks.`);
        }
    }

    private sliceItemAtlas(texture: Texture2D): void {
        this.itemFrames.forEach((frame) => frame.destroy());
        this.itemFrames.clear();
        this.itemAtlasTexture = texture;
        const cellWidth = Math.floor(texture.width / 4);
        const cellHeight = Math.floor(texture.height / 4);
        DESKTOP_CLEANUP_ITEM_TYPES.forEach((type, index) => {
            const column = index % 4;
            const row = Math.floor(index / 4);
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(
                column * cellWidth,
                row * cellHeight,
                cellWidth,
                cellHeight,
            );
            frame.originalSize = new Size(cellWidth, cellHeight);
            frame.offset = new Vec2();
            this.itemFrames.set(type, frame);
        });
    }

    private buildInterface(): void {
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        const metrics = readDesktopCleanupLayout(
            this.node,
            this.context?.services.platform.getLayoutInfo(),
        );
        this.layout = metrics;
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.buildBackground(metrics);
        this.buildHeader(metrics);
        this.pileItemNodes.clear();

        const board = this.createNode(
            this.node,
            'DeskPilePanel',
            0,
            metrics.boardY,
            metrics.boardWidth,
            metrics.boardHeight,
        );
        board.on(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        board.on(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        board.on(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        board.on(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
        const playmat = this.createNode(board, 'PlaymatImage', 0, 0, metrics.boardWidth, metrics.boardHeight);
        const fallbackNode = this.createNode(playmat, 'Fallback', 0, 0, metrics.boardWidth, metrics.boardHeight);
        const fallback = fallbackNode.addComponent(Graphics);
        const inset = 12 * metrics.scale;
        fallback.fillColor = new Color(247, 231, 198, 255);
        fallback.strokeColor = new Color(235, 119, 100, 235);
        fallback.lineWidth = 5 * metrics.scale;
        fallback.roundRect(
            -metrics.boardWidth / 2 + inset,
            -metrics.boardHeight / 2 + inset,
            metrics.boardWidth - inset * 2,
            metrics.boardHeight - inset * 2,
            34 * metrics.scale,
        );
        fallback.fill();
        fallback.stroke();
        this.pileRoot = this.createNode(board, 'PileRoot', 0, 0, metrics.boardWidth, metrics.boardHeight);

        this.buildSlotTray(metrics);
        this.buildTools(metrics);
        this.buildHintToast(metrics);
        this.applyThemeAssets();
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
        const background = this.node.getChildByName('BackgroundImage');
        if (background && this.backgroundFrame) {
            const fallback = background.getChildByName('BackgroundFallback');
            if (fallback) fallback.active = false;
            const sprite = background.getComponent(Sprite) ?? background.addComponent(Sprite);
            sprite.spriteFrame = this.backgroundFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const texture = this.backgroundFrame.texture;
            const metrics = this.layout;
            if (texture && metrics) {
                const artAspect = texture.width / Math.max(1, texture.height);
                const viewportAspect = metrics.width / metrics.height;
                const width = viewportAspect > artAspect ? metrics.width : metrics.height * artAspect;
                const height = viewportAspect > artAspect ? metrics.width / artAspect : metrics.height;
                background.getComponent(UITransform)?.setContentSize(width + 8, height + 8);
            }
        }
        this.applyThemeFrame(
            this.node.getChildByName('DeskPilePanel')?.getChildByName('PlaymatImage'),
            'playmat',
        );
        this.applyThemeFrame(this.node.getChildByName('HelpButton'), 'help');
        this.applyThemeFrame(this.node.getChildByName('PauseButton'), 'pause');
        this.applyThemeFrame(this.node.getChildByName('CountdownCard'), 'timer');
        this.applyThemeFrame(this.node.getChildByName('SlotTray'), 'tray');
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
        sprite.spriteFrame = frame;
        transform?.setContentSize(width, height);
        return true;
    }

    private applyHeaderLogo(): void {
        const root = this.headerLogoRoot;
        const metrics = this.layout;
        if (!root || !metrics) return;
        if (this.applyThemeFrame(root, 'title')) {
            root.children.slice().forEach((child) => this.destroyNode(child));
            return;
        }
        if (this.itemFrames.size === 0) return;
        root.children.slice().forEach((child) => this.destroyNode(child));
        const addArtwork = (
            name: string,
            type: DesktopCleanupItemType,
            x: number,
            y: number,
            maximumWidth: number,
            maximumHeight: number,
            angle: number,
        ): void => {
            const size = this.fitItemSize(type, maximumWidth, maximumHeight);
            const node = this.createNode(root, name, x, y, size.width, size.height);
            node.angle = angle;
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.itemFrames.get(type)!;
            node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        };
        addArtwork(
            'LogoNotes',
            'mint-notes',
            -42 * metrics.scale,
            -4 * metrics.scale,
            66 * metrics.scale,
            62 * metrics.scale,
            -7,
        );
        addArtwork(
            'LogoBadge',
            'lucky-badge',
            43 * metrics.scale,
            1 * metrics.scale,
            62 * metrics.scale,
            62 * metrics.scale,
            7,
        );
        addArtwork(
            'LogoPencil',
            'red-pencil',
            4 * metrics.scale,
            -1 * metrics.scale,
            86 * metrics.scale,
            68 * metrics.scale,
            -27,
        );
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
                52 * metrics.scale,
                -52 * metrics.scale,
                19 * metrics.scale,
                COLORS.white,
                34 * metrics.scale,
                34 * metrics.scale,
            );
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
        const fallback = this.createNode(tray, 'Fallback', 0, 0, trayWidth, trayHeight);
        const graphics = fallback.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = COLORS.coral;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.roundRect(-trayWidth / 2, -trayHeight / 2, trayWidth, trayHeight, 28 * metrics.scale);
        graphics.fill();
        graphics.stroke();
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
        this.renderPile();
        this.renderSlots();
        this.refreshHud();
        this.refreshTools();
    }

    private renderPile(): void {
        const pile = this.pileRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!pile || !snapshot || !metrics) return;
        pile.children.slice().forEach((child) => this.destroyNode(child));
        this.pileItemNodes.clear();
        const active = snapshot.items
            .filter((item) => item.active)
            .sort((left, right) => (
                Number(left.free) - Number(right.free)
                || left.layer - right.layer
                || left.id.localeCompare(right.id)
            ));
        active.forEach((item) => {
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
            this.pileItemNodes.set(item.id, node);
        });
    }

    private drawItem(
        node: Node,
        item: Pick<DesktopCleanupItemSnapshot, 'type'>,
        width: number,
        height: number,
    ): void {
        const frame = this.itemFrames.get(item.type);
        if (frame) {
            const artNode = this.createNode(node, 'Artwork', 0, 0, width, height);
            const sprite = artNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            // Assigning a SpriteFrame can restore its source pixel dimensions.
            // Reapply the gameplay size so pile items and slot thumbnails stay
            // inside their responsive layout bounds.
            artNode.getComponent(UITransform)?.setContentSize(width, height);
            sprite.color = Color.WHITE;
            return;
        }
        const body = node.addComponent(Graphics);
        const source = ITEM_COLORS[item.type];
        body.fillColor = source;
        body.roundRect(-width * 0.44, -height * 0.40, width * 0.88, height * 0.80, Math.min(22, height * 0.24));
        body.fill();
        const label = this.createLabel(node, 'FallbackLabel', ITEM_LABELS[item.type], 0, 0, Math.min(24, height * 0.25), COLORS.white, width * 0.78, height * 0.54);
        label.isBold = true;
    }

    private renderSlots(): void {
        const root = this.slotRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!root || !snapshot || !metrics) return;
        root.children.filter((child) => (
            child.name.startsWith('SlotItem-') || child.name.startsWith('MatchSmoke-')
        )).forEach((child) => this.destroyNode(child));
        const trayWidth = root.getComponent(UITransform)?.contentSize.width ?? 640;
        const cellWidth = trayWidth / this.config.slotCapacity;
        snapshot.slots.forEach((slot, index) => {
            const x = -trayWidth / 2 + cellWidth * (index + 0.5);
            const natural = this.itemDisplaySize(slot.type, metrics.scale);
            const fitted = this.fitSize(
                natural.width,
                natural.height,
                cellWidth - 10 * metrics.scale,
                78 * metrics.scale,
            );
            const node = this.createNode(
                root,
                `SlotItem-${slot.itemId}`,
                x,
                0,
                fitted.width,
                fitted.height,
            );
            node.addComponent(UIOpacity);
            this.drawItem(node, { type: slot.type }, fitted.width, fitted.height);
        });
    }

    private refreshHud(): void {
        const snapshot = this.model?.snapshot;
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

    private refreshTools(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        const adsEnabled = this.isAdsEnabled();
        this.toolButtons.forEach((button, tool) => {
            const charge = snapshot.toolCharges[tool];
            const count = button.node.getChildByName('Count')?.getComponent(Label);
            if (count) count.string = `${charge}`;
            button.interactable = this.state === 'playing'
                && !this.adBusy
                && (charge > 0 || (adsEnabled && !snapshot.boostAdAttempted));
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = button.interactable ? 255 : 150;
        });
    }

    private handleItemTap(itemId: string, node: Node): void {
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        const result = this.model.selectItem(itemId);
        const selection = result.selection;
        if (!result.accepted || !selection) return;
        const generation = this.operationGeneration;
        this.inputLocked = true;
        this.context?.services.feedback.play('drop');
        node.setSiblingIndex(Math.max(0, (node.parent?.children.length ?? 1) - 1));
        const destination = this.slotTargetInParent(node.parent, selection.insertionIndex);
        const start = node.position.clone();
        const arc = new Vec3(
            (start.x + destination.x) / 2,
            Math.max(start.y, destination.y) + 54 * (this.layout?.scale ?? 1),
            0,
        );
        tween(node)
            .to(0.07, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
            .to(0.12, { position: arc, scale: new Vec3(0.88, 0.88, 1), angle: 0 }, { easing: 'quadOut' })
            .to(0.15, { position: destination, scale: new Vec3(0.56, 0.56, 1), angle: 0 }, { easing: 'quadIn' })
            .call(() => {
                if (!this.isCurrent(generation) || this.state === 'disposed') return;
                this.renderPile();
                this.renderSlots();
                this.refreshHud();
                this.refreshTools();
                this.pulseSlot(selection.insertionIndex);
                if (selection.triple) {
                    this.animateTripleSelection(selection, generation);
                } else {
                    this.settleSelection(selection, generation);
                }
            })
            .start();
    }

    private settleSelection(selection: DesktopCleanupPendingSelection, generation: number): void {
        if (!this.isCurrent(generation) || !this.model) return;
        const settled = this.model.settleSelection(selection.token);
        if (!settled.accepted) return;
        this.inputLocked = false;
        this.renderAll();
        this.syncTerminalPhase();
    }

    private animateTripleSelection(selection: DesktopCleanupPendingSelection, generation: number): void {
        const triple = selection.triple;
        const root = this.slotRoot;
        if (!triple || !root?.isValid || !this.isCurrent(generation)) {
            this.settleSelection(selection, generation);
            return;
        }
        const nodes = triple.itemIds
            .map((itemId) => root.getChildByName(`SlotItem-${itemId}`))
            .filter((node): node is Node => Boolean(node?.isValid));
        if (nodes.length !== 3) {
            this.settleSelection(selection, generation);
            return;
        }
        const center = nodes.reduce(
            (sum, node) => sum.add(node.position.clone()),
            new Vec3(),
        ).multiplyScalar(1 / nodes.length);
        let arrived = 0;
        const onArrived = (): void => {
            arrived += 1;
            if (arrived !== nodes.length || !this.isCurrent(generation)) return;
            this.context?.services.feedback.play('merge');
            this.playMatchSmoke(selection, generation, center, nodes);
        };
        nodes.forEach((node) => {
            Tween.stopAllByTarget(node);
            tween(node)
                .delay(0.10)
                .to(0.18, {
                    position: center,
                    scale: new Vec3(0.84, 0.84, 1),
                    angle: 0,
                }, { easing: 'quadInOut' })
                .call(onArrived)
                .start();
        });
    }

    private playMatchSmoke(
        selection: DesktopCleanupPendingSelection,
        generation: number,
        center: Vec3,
        matchedNodes: readonly Node[],
    ): void {
        const root = this.slotRoot;
        const metrics = this.layout;
        if (!root?.isValid || !metrics || !this.isCurrent(generation)) {
            this.settleSelection(selection, generation);
            return;
        }
        const extent = 210 * metrics.scale;
        const smoke = this.createNode(root, `MatchSmoke-${selection.token}`, center.x, center.y, extent, extent);
        smoke.setSiblingIndex(root.children.length - 1);
        smoke.setScale(0.36, 0.36, 1);
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
                fallback.circle(offset * metrics.scale, (index % 2 === 0 ? 8 : -5) * metrics.scale, 34 * metrics.scale);
            });
            fallback.fill();
        }
        matchedNodes.forEach((node) => {
            if (!node.isValid) return;
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
            tween(node).to(0.16, { scale: new Vec3(0.12, 0.12, 1) }, { easing: 'quadIn' }).start();
            tween(opacity).to(0.14, { opacity: 0 }, { easing: 'quadIn' }).start();
        });
        tween(smokeOpacity)
            .to(0.08, { opacity: 255 }, { easing: 'quadOut' })
            .delay(0.10)
            .to(0.17, { opacity: 0 }, { easing: 'quadIn' })
            .start();
        tween(smoke)
            .to(0.10, { scale: new Vec3(0.96, 0.96, 1), angle: -3 }, { easing: 'backOut' })
            .to(0.25, { scale: new Vec3(1.28, 1.28, 1), angle: 7 }, { easing: 'quadOut' })
            .call(() => {
                if (smoke.isValid) this.destroyNode(smoke);
                this.settleSelection(selection, generation);
            })
            .start();
    }

    private async handleTool(tool: DesktopCleanupTool): Promise<void> {
        if (this.state !== 'playing' || this.inputLocked || this.adBusy || !this.model) return;
        const result = this.model.useTool(tool);
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
        this.context?.services.feedback.play(result.triple ? 'merge' : 'fold');
        this.renderAll();
        this.setHint(tool === 'return' ? '最近物件已放回堆顶' : tool === 'shuffle' ? '剩余文具已经重新叠好' : '磁吸盒凑齐了一组');
        this.syncTerminalPhase();
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
        this.state = 'paused';
        this.setHint('正在播放视频…');
        this.refreshTools();
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            const action = model.resolveBoostAd(result.outcome === 'completed');
            if (action.accepted) {
                this.context?.services.feedback.play(action.triple ? 'merge' : 'continue');
                this.setHint('视频完成，工具已生效');
            } else {
                this.setHint('视频未完整播放，本局不再补充工具');
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveBoostAd(false);
            console.warn('[DesktopCleanupGame] Rewarded tool ad failed.', error);
            this.setHint('视频暂不可用，本局不再补充工具');
        } finally {
            if (this.isCurrent(generation)) {
                this.adBusy = false;
                this.inputLocked = false;
                this.state = 'playing';
                this.renderAll();
                this.syncTerminalPhase();
            }
        }
    }

    private syncTerminalPhase(): void {
        const phase = this.model?.snapshot.phase;
        if (phase === 'failed' && this.state === 'playing') {
            this.state = 'failed';
            this.inputLocked = true;
            this.context?.services.feedback.play('failure');
            this.showFailure();
        } else if (phase === 'won' && !this.terminalPending) {
            this.finishWin();
        }
    }

    private showFailure(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        const reason = snapshot.failureReason === 'timeout'
            ? '时间到了，桌面还没清空'
            : '收纳槽已经放满了';
        const actions: OverlayAction[] = [];
        if (this.isAdsEnabled() && !snapshot.continueAdAttempted) {
            actions.push({ name: 'ContinueButton', label: '▶ 加时 60 秒继续', tone: 'coral', action: () => this.requestContinueAd() });
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
        const generation = this.operationGeneration;
        this.adBusy = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在播放视频…');
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            if (model.resolveContinueAd(result.outcome === 'completed')) {
                this.destroyOverlay(this.failureOverlay);
                this.failureOverlay = undefined;
                this.state = 'playing';
                this.inputLocked = false;
                this.context?.services.feedback.play('continue');
                this.setHint('加时成功，继续整理！');
                this.renderAll();
            } else {
                this.setHint('视频未完整播放，无法续玩');
                this.showFailure();
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveContinueAd(false);
            console.warn('[DesktopCleanupGame] Continue ad failed.', error);
            this.setHint('视频暂不可用，无法续玩');
            this.showFailure();
        } finally {
            if (this.isCurrent(generation)) this.adBusy = false;
        }
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
            + (snapshot.continued ? this.config.continueSeconds * 1000 : 0);
        return Math.max(0, (total - snapshot.remainingMs) / 1000);
    }

    private isAdsEnabled(): boolean {
        const context = this.context;
        return Boolean(context?.services.ads.isEnabledForGame(context.gameId));
    }

    private showToolHelp(tool: DesktopCleanupTool): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.activeToolHelp = tool;
        this.state = 'tool-help';
        this.inputLocked = true;
        const adRule = this.isAdsEnabled()
            ? '三种道具都用完免费次数后，本局总共还能看 1 次视频补充任意一种。'
            : '当前环境不提供视频补充次数。';
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
        this.inputLocked = false;
        this.refreshTools();
    }

    private showRules(firstTime: boolean): void {
        if (this.state !== 'playing' && this.state !== 'ready') return;
        this.rulesFirstTime = firstTime;
        this.state = 'rules';
        this.inputLocked = true;
        this.destroyOverlay(this.rulesOverlay);
        this.rulesOverlay = this.buildOverlay(
            'DesktopRulesOverlay',
            firstTime ? '今天也来清清桌面' : '整理规则',
            '点击物件露出的部分，把它放入 7 格收纳槽\n同类三件会自动收好，清掉上层会露出更深的文具\n在 180 秒内清空桌面并找回 3 枚幸运徽章\n在物件堆上滑动，可以把最上层轻轻拨开',
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
        this.inputLocked = false;
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

    private readonly handleBoardTouchStart = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked || !this.model || this.pileDragSession) return;
        const start = event.getUILocation();
        const target = this.findPileItemAt(event.getLocation(), event.windowId, start);
        this.pileDragSession = {
            touchId: event.getID(),
            start: start.clone(),
            ...(target ? { candidateItemId: target.itemId } : {}),
            items: this.collectPileDragItems(),
            delta: new Vec2(),
            dragging: false,
        };
    };

    private readonly handleBoardTouchMove = (event: EventTouch): void => {
        const session = this.pileDragSession;
        const metrics = this.layout;
        if (!session || event.getID() !== session.touchId || !metrics) return;
        const location = event.getUILocation();
        const rawX = location.x - session.start.x;
        const rawY = location.y - session.start.y;
        if (!session.dragging && Math.hypot(rawX, rawY) < 10 * metrics.scale) return;
        session.dragging = true;
        const maxOffset = Math.min(metrics.boardWidth * 0.18, 138 * metrics.scale);
        session.delta = new Vec2(
            Math.max(-maxOffset, Math.min(maxOffset, rawX)),
            Math.max(-maxOffset, Math.min(maxOffset, rawY)),
        );
        session.items.forEach((item) => {
            if (!item.node.isValid) return;
            item.node.setPosition(
                item.basePosition.x + session.delta.x * item.weight,
                item.basePosition.y + session.delta.y * item.weight,
                item.basePosition.z,
            );
            item.node.angle = item.baseAngle
                + session.delta.x / Math.max(1, metrics.boardWidth) * 8 * item.weight;
        });
    };

    private readonly handleBoardTouchEnd = (event: EventTouch): void => {
        const session = this.pileDragSession;
        if (!session || event.getID() !== session.touchId) return;
        this.handleBoardTouchMove(event);
        this.pileDragSession = undefined;
        if (this.state !== 'playing' || this.inputLocked || !this.model) {
            this.restoreDraggedItems(session.items);
            return;
        }
        if (!session.dragging) {
            const itemId = session.candidateItemId;
            const node = itemId ? this.pileItemNodes.get(itemId) : undefined;
            if (itemId && node?.isValid) this.handleItemTap(itemId, node);
            return;
        }
        const metrics = this.layout;
        if (!metrics) {
            this.restoreDraggedItems(session.items);
            return;
        }
        const changed = this.model.commitRummage(
            session.delta.x * 0.72 / Math.max(1, metrics.boardWidth * 0.86),
            session.delta.y * 0.72 / Math.max(1, metrics.boardHeight * 0.86),
        );
        this.context?.services.feedback.play('fold');
        this.inputLocked = true;
        this.settleDraggedItems(session.items, changed);
    };

    private readonly handleBoardTouchCancel = (): void => {
        const session = this.pileDragSession;
        this.pileDragSession = undefined;
        if (session) this.restoreDraggedItems(session.items);
    };

    private collectPileDragItems(): readonly PileDragItem[] {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return [];
        const active = snapshot.items.filter((item) => item.active);
        const topLayers = [...new Set(active.filter((item) => !item.free).map((item) => item.layer))]
            .sort((left, right) => right - left)
            .slice(0, DESKTOP_CLEANUP_RUMMAGE_LAYER_WEIGHTS.length);
        const result: PileDragItem[] = [];
        active.forEach((item) => {
            const depth = item.free ? 0 : topLayers.indexOf(item.layer);
            const node = this.pileItemNodes.get(item.id);
            if (depth < 0
                || depth >= DESKTOP_CLEANUP_RUMMAGE_LAYER_WEIGHTS.length
                || !node?.isValid) return;
            result.push({
                itemId: item.id,
                node,
                basePosition: node.position.clone(),
                baseAngle: node.angle,
                weight: DESKTOP_CLEANUP_RUMMAGE_LAYER_WEIGHTS[depth],
            });
        });
        return result;
    }

    private restoreDraggedItems(items: readonly PileDragItem[]): void {
        items.forEach((item) => {
            if (!item.node.isValid) return;
            Tween.stopAllByTarget(item.node);
            tween(item.node)
                .to(0.14, { position: item.basePosition, angle: item.baseAngle }, { easing: 'quadOut' })
                .start();
        });
    }

    private settleDraggedItems(items: readonly PileDragItem[], changed: boolean): void {
        const settleGeneration = ++this.dragSettleGeneration;
        this.dragSettling = true;
        const metrics = this.layout;
        const snapshot = this.model?.snapshot;
        if (!metrics || !snapshot) {
            this.dragSettling = false;
            this.inputLocked = false;
            return;
        }
        const targets = new Map(snapshot.items.map((item) => [item.id, item] as const));
        const valid = items.filter((item) => item.node.isValid);
        if (valid.length === 0) {
            this.dragSettling = false;
            this.inputLocked = false;
            this.renderPile();
            return;
        }
        let completed = 0;
        const finishOne = (): void => {
            if (settleGeneration !== this.dragSettleGeneration) return;
            completed += 1;
            if (completed !== valid.length) return;
            this.dragSettling = false;
            if (this.state === 'playing') this.inputLocked = false;
            this.renderPile();
        };
        valid.forEach((item) => {
            const snapshotItem = targets.get(item.itemId);
            const target = changed && snapshotItem
                ? this.pilePosition(snapshotItem, metrics)
                : item.basePosition;
            Tween.stopAllByTarget(item.node);
            tween(item.node)
                .to(0.18, {
                    position: target,
                    angle: snapshotItem?.angle ?? item.baseAngle,
                }, { easing: 'quadOut' })
                .call(finishOne)
                .start();
        });
    }

    private findPileItemAt(
        screenLocation: Vec2,
        windowId: number,
        uiLocation: Vec2,
    ): { readonly itemId: string; readonly node: Node } | undefined {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return undefined;
        const activeItems = new Map(
            snapshot.items.filter((item) => item.active).map((item) => [item.id, item] as const),
        );
        const ordered = [...this.pileItemNodes.entries()]
            .filter(([itemId, node]) => activeItems.has(itemId) && node.isValid)
            .sort((left, right) => right[1].getSiblingIndex() - left[1].getSiblingIndex());
        for (const [itemId, node] of ordered) {
            const item = activeItems.get(itemId);
            const transform = node.getComponent(UITransform);
            if (item
                && transform?.hitTest(screenLocation, windowId)
                && this.hitTestItemAlpha(transform, item.type, uiLocation)) {
                return { itemId, node };
            }
        }
        return undefined;
    }

    private hitTestItemAlpha(
        transform: UITransform,
        type: DesktopCleanupItemType,
        uiLocation: Vec2,
    ): boolean {
        const mask = this.itemHitmasks.get(type);
        if (!mask) return true;
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
        const width = Math.max(1, transform.contentSize.width);
        const height = Math.max(1, transform.contentSize.height);
        const u = local.x / width + 0.5;
        const v = 0.5 - local.y / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
        const column = Math.min(mask.gridSize - 1, Math.floor(u * mask.gridSize));
        const row = Math.min(mask.gridSize - 1, Math.floor(v * mask.gridSize));
        const nibble = Number.parseInt(mask.rows[row][Math.floor(column / 4)], 16);
        const bit = 1 << (3 - column % 4);
        return Number.isFinite(nibble) && (nibble & bit) !== 0;
    }

    private cancelActivePileDrag(): void {
        const session = this.pileDragSession;
        this.pileDragSession = undefined;
        session?.items.forEach((item) => {
            if (!item.node.isValid) return;
            Tween.stopAllByTarget(item.node);
            item.node.setPosition(item.basePosition);
            item.node.angle = item.baseAngle;
        });
    }

    private cancelDragSettlement(): void {
        if (!this.dragSettling) return;
        this.dragSettleGeneration += 1;
        this.dragSettling = false;
        this.pileItemNodes.forEach((node) => {
            if (node.isValid) Tween.stopAllByTarget(node);
        });
        this.inputLocked = false;
        if (this.node.isValid) this.renderPile();
    }

    private settlePendingImmediately(): void {
        const pending = this.model?.snapshot.pendingSelection;
        if (!pending || !this.model) return;
        this.operationGeneration += 1;
        this.model.settleSelection(pending.token);
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
        this.cancelActivePileDrag();
        this.cancelDragSettlement();
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
        shade.fillColor = COLORS.overlay;
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();
        const panelWidth = Math.min(metrics.width - 64 * metrics.scale, 610 * metrics.scale);
        const panelHeight = Math.min(metrics.height - metrics.safeTop - metrics.safeBottom - 64, (actions.length >= 3 ? 650 : 570) * metrics.scale);
        const panelY = (metrics.safeBottom - metrics.safeTop) / 2;
        const panel = this.createNode(root, 'ClayPanel', 0, panelY, panelWidth, panelHeight);
        const graphics = panel.addComponent(Graphics);
        graphics.fillColor = new Color(27, 30, 43, 86);
        graphics.roundRect(-panelWidth / 2 + 10, -panelHeight / 2 - 12, panelWidth, panelHeight, 42 * metrics.scale);
        graphics.fill();
        graphics.fillColor = COLORS.paper;
        graphics.strokeColor = COLORS.mustard;
        graphics.lineWidth = 6 * metrics.scale;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 40 * metrics.scale);
        graphics.fill();
        graphics.stroke();
        if (toolIcon) {
            const art = this.createNode(panel, 'ToolArtwork', 0, panelHeight / 2 - 86 * metrics.scale, 88 * metrics.scale, 88 * metrics.scale);
            const artBackground = art.addComponent(Graphics);
            const tone = toolIcon === 'return' ? COLORS.coral : toolIcon === 'magnet' ? COLORS.teal : COLORS.lilac;
            artBackground.fillColor = tone;
            artBackground.strokeColor = COLORS.paper;
            artBackground.lineWidth = 4 * metrics.scale;
            artBackground.circle(0, 0, 42 * metrics.scale);
            artBackground.fill();
            artBackground.stroke();
            const glyph = this.createNode(art, 'Glyph', 0, 0, 58 * metrics.scale, 58 * metrics.scale);
            this.drawToolIcon(glyph, toolIcon, COLORS.white);
        } else {
            const badge = this.createNode(panel, 'PanelBadge', 0, panelHeight / 2 - 54 * metrics.scale, 110 * metrics.scale, 38 * metrics.scale);
            const badgeGraphics = badge.addComponent(Graphics);
            badgeGraphics.fillColor = COLORS.mustard;
            badgeGraphics.roundRect(-55 * metrics.scale, -19 * metrics.scale, 110 * metrics.scale, 38 * metrics.scale, 19 * metrics.scale);
            badgeGraphics.fill();
        }
        const titleY = panelHeight / 2 - (toolIcon ? 164 : 116) * metrics.scale;
        const bodyY = panelHeight / 2 - (toolIcon ? 286 : 240) * metrics.scale;
        const titleLabel = this.createLabel(panel, 'Title', title, 0, titleY, 40 * metrics.scale, COLORS.ink, panelWidth - 64, 64 * metrics.scale);
        titleLabel.isBold = true;
        this.createLabel(panel, 'Body', body, 0, bodyY, 25 * metrics.scale, COLORS.inkSoft, panelWidth - 80, toolIcon ? 210 * metrics.scale : 190 * metrics.scale);
        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        const gap = 82 * metrics.scale;
        const startY = -panelHeight / 2 + (actions.length - 1) * gap + 72 * metrics.scale;
        actions.forEach((action, index) => {
            const button = this.createPillButton(
                panel,
                action.name,
                0,
                startY - index * gap,
                Math.min(410 * metrics.scale, panelWidth - 100),
                64 * metrics.scale,
                action.label,
                this.actionColor(action.tone),
                () => { void this.runOverlayAction(state, action); },
            );
            buttons.push(button);
        });
        panel.setScale(0.82, 0.76, 1);
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
        color: Color,
        handler: () => void,
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(30, 33, 45, 72);
        graphics.roundRect(-width / 2 + 4, -height / 2 - 6, width, height, height * 0.38);
        graphics.fill();
        graphics.fillColor = color;
        graphics.strokeColor = COLORS.paper;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, height * 0.38);
        graphics.fill();
        graphics.stroke();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const label = this.createLabel(node, 'Label', text, 0, 0, Math.min(23, height * 0.34), COLORS.white, width - 20, height - 10);
        label.isBold = true;
        return button;
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
        const extent = type === 'lucky-badge' ? 172 * scale : 180 * scale;
        return new Size(extent, extent);
    }

    private fitItemSize(type: DesktopCleanupItemType, maximumWidth: number, maximumHeight: number): Size {
        void type;
        const edge = Math.min(maximumWidth, maximumHeight);
        return new Size(edge, edge);
    }

    private pilePosition(item: Pick<DesktopCleanupItemSnapshot, 'x' | 'y'>, metrics: DesktopCleanupLayoutMetrics): Vec3 {
        return new Vec3(
            item.x * metrics.boardWidth * 0.86,
            item.y * metrics.boardHeight * 0.86,
            0,
        );
    }

    private fitSize(width: number, height: number, maximumWidth: number, maximumHeight: number): Size {
        const scale = Math.min(maximumWidth / Math.max(1, width), maximumHeight / Math.max(1, height));
        return new Size(Math.max(1, width * scale), Math.max(1, height * scale));
    }

    private slotTargetInParent(parent: Node | null, index: number): Vec3 {
        const root = this.slotRoot;
        const rootTransform = root?.getComponent(UITransform);
        const parentTransform = parent?.getComponent(UITransform);
        if (!root || !rootTransform || !parentTransform) return new Vec3();
        const width = rootTransform.contentSize.width;
        const cellWidth = width / this.config.slotCapacity;
        const clampedIndex = Math.max(0, Math.min(this.config.slotCapacity - 1, index));
        const local = new Vec3(-width / 2 + cellWidth * (clampedIndex + 0.5), 0, 0);
        const world = rootTransform.convertToWorldSpaceAR(local);
        return parentTransform.convertToNodeSpaceAR(world);
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
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.getComponents(UIOpacity).forEach((opacity) => Tween.stopAllByTarget(opacity));
        node.children.slice().forEach((child) => this.destroyNode(child));
        node.destroy();
    }

    private isCurrent(generation: number): boolean {
        return generation === this.operationGeneration
            && this.state !== 'disposed'
            && this.node.isValid;
    }
}
