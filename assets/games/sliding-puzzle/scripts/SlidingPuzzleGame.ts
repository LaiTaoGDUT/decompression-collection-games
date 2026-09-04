import {
    assetManager,
    _decorator,
    BlockInputEvents,
    Color,
    Component,
    EventTouch,
    EventMouse,
    Graphics,
    ImageAsset,
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
    Vec3,
    view,
} from 'cc';
import type { Touch } from 'cc';
import type { Platform } from '../../../platform/Platform';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AudioService } from '../../../services/audio/AudioService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { GameResult, LocalImageSelection } from '../../../core/types/CommonTypes';
import {
    autoAtlasFrameName,
    loadAutoAtlasFrames,
} from '../../../services/asset/AutoAtlasLoader';
import { SlidingPuzzleCropController } from './SlidingPuzzleCropController';
import { SlidingPuzzleModel } from './SlidingPuzzleModel';
import {
    calculateSlidingPuzzleBackgroundCover,
    calculateSlidingPuzzleLayout,
    calculateSlidingPuzzleTileSourceRect,
    SLIDING_PUZZLE_TOUCH_SIZE,
    type SlidingPuzzleLayoutMetrics,
} from './SlidingPuzzleLayout';
import {
    SLIDING_PUZZLE_BOARD_SIZES,
    type SlidingPuzzleBoardSize,
    type SlidingPuzzleDirection,
    type SlidingPuzzleMoveResult,
    type SlidingPuzzleRoundConfig,
} from './SlidingPuzzleTypes';

const { ccclass } = _decorator;
const SLIDING_PUZZLE_RESOURCE_BUNDLE = 'game-sliding-puzzle-assets';
const SLIDING_PUZZLE_ICON_ATLAS_PATH = 'visual/icons/sliding-icons';

type SlidingPuzzleState =
    | 'idle'
    | 'ready'
    | 'setup'
    | 'picking-image'
    | 'crop-editing'
    | 'starting'
    | 'playing'
    | 'paused'
    | 'reference-preview'
    | 'completed'
    | 'disposed';

export interface SlidingPuzzleServices {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly platform: Platform;
    readonly storage: StorageService;
}

const COLORS = Object.freeze({
    woodDark: new Color(74, 44, 32, 255),
    wood: new Color(201, 137, 75, 255),
    woodLight: new Color(226, 170, 103, 255),
    paper: new Color(243, 226, 189, 255),
    paperLight: new Color(255, 243, 211, 255),
    teal: new Color(91, 138, 120, 255),
    tealDark: new Color(55, 91, 80, 255),
    red: new Color(166, 92, 69, 255),
    ink: new Color(45, 37, 32, 255),
    muted: new Color(139, 121, 104, 255),
    shadow: new Color(45, 37, 32, 44),
    overlay: new Color(45, 37, 32, 178),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SWIPE_THRESHOLD = 34;
const PREVIEW_PAN_EPSILON = 0.0001;
const TILE_SKIN_INSET_RATIO = 0.018;
const TILE_CORNER_RADIUS_RATIO = 0.035;
const TILE_EDGE_INSET = 2;
const BUTTON_PRESS_SCALE = 0.96;
const BUTTON_PRESS_OFFSET = 4;
const COMPLETION_CELEBRATION_DURATION = 1.2;
const COMPLETION_IMAGE_REVEAL_DELAY = 0.62;
const COMPLETION_IMAGE_REVEAL_DURATION = 0.28;
const POPUP_LIFT = 36;
// PZ1 弹窗素材的木框/绿色内框约占 60～64px。九宫格边缘必须使用
// 素材真实边框宽度，否则内框会被拉到内容区域里，按钮和参考图就会压住边框。
const POPUP_BACKGROUND_BORDER_INSET_X = 64;
const POPUP_BACKGROUND_BORDER_INSET_Y = 64;
// 内容在内框之外再留一圈统一安全边距，所有弹窗都从这组值计算布局。
const POPUP_CONTENT_PADDING_X = 72;
const POPUP_CONTENT_PADDING_TOP = 72;
const POPUP_CONTENT_PADDING_BOTTOM = 96;
const POPUP_BUTTON_FONT_SIZE = 28;
const REFERENCE_PREVIEW_SIZE = 360;
const REFERENCE_PREVIEW_TOP_GAP = 24;
const CROP_PREVIEW_MAX_SIZE = 560;
const CROP_PREVIEW_MIN_SIZE = 240;
const SETUP_BACK_ICON_SIZE = 68;
const SETUP_TITLE_FONT_SIZE = 42;
const CROP_TITLE_FONT_SIZE = 42;
const CROP_HINT_FONT_SIZE = 26;
const SETUP_PREVIEW_MAX_SIZE = 320;
const SETUP_COMPACT_PREVIEW_MAX_SIZE = 240;
const SETUP_SIZE_BUTTON_FONT_SIZE = 30;
const SETUP_COMPACT_SIZE_BUTTON_FONT_SIZE = 28;
const SETUP_SOURCE_BUTTON_FONT_SIZE = 30;
const SETUP_COMPACT_SOURCE_BUTTON_FONT_SIZE = 28;
const SETUP_START_BUTTON_FONT_SIZE = 36;
const SETUP_COMPACT_START_BUTTON_FONT_SIZE = 34;
const PLAY_HUD_FONT_SIZE = 34;
const PLAY_SIDE_ICON_SIZE = 70;
// 裁切预览的外框只保留极窄边缘；图片不再被 28px 的通用预览内缩挤小。
const CROP_PREVIEW_FRAME_GAP = 12;
// 棋盘背景素材为 512×512，实际木框内槽从约 32px 处开始。
// 用素材比例计算，确保不同屏幕尺寸下拼图外沿仍与内槽边界对齐。
const BOARD_INNER_INSET_RATIO = 32 / 512;

export const SLIDING_PUZZLE_BACKGROUND_ASSET_PATH =
    'visual/backgrounds/sliding-puzzle-background-v1/texture';

export const SLIDING_PUZZLE_BOARD_ASSET_PATH =
    'visual/boards/sliding-puzzle-board-v1/texture';

const SLIDING_PUZZLE_PRESET_ASSET_PATHS: readonly string[] = Object.freeze([
    // 当前仓库已实际交付的预置图；后续新增图片进入 Bundle 后只需在这里登记。
    'visual/presets/preset-08-bedroom-night-v1/texture',
    'visual/presets/preset-09-newspaper-v1/texture',
]);

export const SLIDING_PUZZLE_POPUP_BACKGROUND_ASSET_PATH =
    'visual/popups/pz1-popup-background-v1/texture';

export const SLIDING_PUZZLE_TILE_SKIN_ASSET_PATH =
    'visual/tiles/sliding-puzzle-tile-skin-v1/texture';

const SLIDING_PUZZLE_VISUAL_ASSET_PATHS = Object.freeze({
    background: SLIDING_PUZZLE_BACKGROUND_ASSET_PATH,
    board: SLIDING_PUZZLE_BOARD_ASSET_PATH,
    tileSkin: SLIDING_PUZZLE_TILE_SKIN_ASSET_PATH,
    popup: SLIDING_PUZZLE_POPUP_BACKGROUND_ASSET_PATH,
    backIcon: 'visual/icons/pz1-back-v1/texture',
    pauseIcon: 'visual/icons/pz1-pause-v1/texture',
    cropIcon: 'visual/icons/pz1-crop-v1/texture',
    referenceIcon: 'visual/icons/pz1-reference-v1/texture',
    albumIcon: 'visual/icons/pz1-album-v1/texture',
    closeIcon: 'visual/icons/pz1-close-v1/texture',
});

type SlidingPuzzleVisualKey = keyof typeof SLIDING_PUZZLE_VISUAL_ASSET_PATHS;

const BUTTON_ICON_ASSET_KEYS: Readonly<Record<string, SlidingPuzzleVisualKey>> = Object.freeze({
    ReferenceButton: 'referenceIcon',
    PauseButton: 'pauseIcon',
    ImageButton: 'albumIcon',
    CancelCrop: 'closeIcon',
    ConfirmCrop: 'cropIcon',
    CloseReference: 'closeIcon',
});

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function colorWithAlpha(color: Color, alpha: number): Color {
    return new Color(color.r, color.g, color.b, alpha);
}

function isSupportedImageMimeType(mimeType?: string): boolean {
    if (!mimeType) {
        return true;
    }

    const normalized = mimeType.toLowerCase();
    return normalized === 'image'
        || normalized === 'image/png'
        || normalized === 'image/jpg'
        || normalized === 'image/jpeg';
}

/**
 * 复古木质拼图的独立入口。
 * 图片加载、裁剪和切片链路已接通；木纹、棋盘、弹窗和按钮素材从独立 Bundle 动态加载，缺失时保留程序化回退。
 */
@ccclass('SlidingPuzzleGame')
export class SlidingPuzzleGame extends Component implements MiniGame<SlidingPuzzleServices> {
    private state: SlidingPuzzleState = 'idle';
    private context?: MiniGameContext<SlidingPuzzleServices>;
    private readonly model = new SlidingPuzzleModel();
    private readonly cropController = new SlidingPuzzleCropController();

    private selectedSize: SlidingPuzzleBoardSize = 4;
    private selectedPresetIndex = 0;
    private selectedConfig: SlidingPuzzleRoundConfig = Object.freeze({
        boardSize: 4,
        imageSource: 'preset',
        presetAssetPath: SLIDING_PUZZLE_PRESET_ASSET_PATHS[this.selectedPresetIndex],
    });
    private elapsedSeconds = 0;
    private inputLocked = false;
    private completionRequested = false;
    private completionTransitionPending = false;
    /** 当前棋盘只接受一个触摸会话，避免多指或重绘时串用坐标。 */
    private activeTouchId: number | null = null;
    private touchStartX = 0;
    private touchStartY = 0;
    private touchStartTileIndex = -1;
    private layout?: SlidingPuzzleLayoutMetrics;
    private timerLabel?: Label;
    private movesLabel?: Label;
    private boardNode?: Node;
    private pauseButtonNode?: Node;
    /** 以实际渲染出来的方块节点为准，避免 Canvas 适配后手动坐标换算产生偏移。 */
    private readonly tileIndexByNode = new Map<Node, number>();
    private backgroundNode?: Node;
    private dynamicNode?: Node;
    private overlayNode?: Node;
    private completionEffectNode?: Node;
    private completedBoardImageNode?: Node;
    private completionImageRevealed = false;
    private activePauseModel?: MiniGamePauseModel;
    private activeResultModel?: MiniGameResultModel;
    /** 完成弹窗关闭后仍保留结果，让完成态暂停按钮可以再次打开它。 */
    private completedResultModel?: MiniGameResultModel;
    private referenceReturnState: 'playing' | 'paused' | 'completed' = 'playing';
    private unsubscribeShow?: () => void;
    private unsubscribeHide?: () => void;
    private resizeListening = false;
    private imageTexture?: Texture2D;
    private imageAsset?: ImageAsset;
    private imageTextureOwned = false;
    /** 当前纹理对应的预置图路径；换图加载期间旧图仍保持可见。 */
    private loadedPresetAssetPath?: string;
    /** 预置图异步加载中的目标路径，用于使连续点击正确失效旧请求。 */
    private loadingPresetAssetPath?: string;
    private pendingImageTexture?: Texture2D;
    private pendingImageAsset?: ImageAsset;
    private pendingImageTextureOwned = false;
    private imageLoadToken = 0;
    private readonly visualTextures = new Map<SlidingPuzzleVisualKey, Texture2D>();
    private readonly visualFrames = new Map<SlidingPuzzleVisualKey, SpriteFrame>();
    private visualLoadToken = 0;
    private readonly tileFrames: SpriteFrame[] = [];
    private readonly transientFrames = new Set<SpriteFrame>();
    private readonly pendingAssetLoads = new Set<Promise<unknown>>();
    private disposePromise?: Promise<void>;
    private uiActionPending = false;
    /**
     * Cocos 在触摸事件后可能补发一组合成 mouse 事件。页面重建时，
     * mouseup 可能命中新页面中同一位置的按钮，造成“取消”后立即开始。
     */
    private syntheticMouseEventsBlockedUntil = 0;
    private restartToSetupAfterRuntimeRestart = false;
    private cropPreviewNode?: Node;
    private cropPreviewSprite?: Sprite;
    private cropPreviewFrame?: SpriteFrame;
    private cropLastX = 0;
    private cropLastY = 0;
    private cropPinchDistance = 0;
    private cropPinchCenterX = 0;
    private cropPinchCenterY = 0;
    private cropPinchTouchIds: readonly [number, number] | undefined;
    private readonly cropActiveTouchIds = new Set<number>();

    async initialize(context: MiniGameContext<SlidingPuzzleServices>): Promise<void> {
        if (this.state === 'disposed') {
            throw new Error('Sliding puzzle entry has already been disposed.');
        }

        this.context = context;
        this.state = 'ready';
        this.unsubscribeShow = context.services.platform.onShow(() => {
            context.services.audio.onShow();
        });
        this.unsubscribeHide = context.services.platform.onHide(() => {
            context.services.audio.onHide();
            if (this.state === 'playing') {
                context.requestPause();
            }
        });
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.resizeListening = true;
        this.buildBackground();
        this.showSetup();
        // 视觉素材和预置图都异步预热；任一资源缺失都不阻塞进入游戏。
        void this.trackAssetLoad(this.loadVisualAssets());
        void this.trackAssetLoad(this.loadPresetImage(true));
    }

    begin(): void {
        if (this.state !== 'ready' && this.state !== 'setup') {
            return;
        }

        this.state = 'setup';
        this.showSetup();
    }

    update(deltaTime: number): void {
        if (this.state !== 'playing' || this.inputLocked) {
            return;
        }

        this.elapsedSeconds += Math.max(0, Math.min(0.25, deltaTime));
        this.refreshHud();
    }

    pause(): void {
        if (this.state !== 'playing') {
            return;
        }

        this.state = 'paused';
        this.inputLocked = true;
        this.pauseButtonNode && (this.pauseButtonNode.active = false);
    }

    resume(): void {
        if (this.state !== 'paused') {
            return;
        }

        this.state = 'playing';
        this.inputLocked = false;
        if (this.pauseButtonNode?.isValid) {
            this.pauseButtonNode.active = true;
        }
        this.hidePauseMenu();
    }

    async restart(context?: MiniGameContext<SlidingPuzzleServices>): Promise<void> {
        if (context) {
            this.context = context;
        }

        if (this.state === 'disposed') {
            throw new Error('Cannot restart a disposed sliding puzzle.');
        }

        this.completedResultModel = undefined;
        this.hidePauseMenu();
        this.hideResultView();
        this.hideReferencePreview();
        const restartToSetup = this.restartToSetupAfterRuntimeRestart;
        this.restartToSetupAfterRuntimeRestart = false;
        if (restartToSetup) {
            this.state = 'setup';
            this.elapsedSeconds = 0;
            this.completionRequested = false;
            this.completionTransitionPending = false;
            this.completionImageRevealed = false;
            this.inputLocked = false;
            this.showSetup();
            return;
        }
        await this.startRound();
    }

    discardSavedProgress(): void {
        // 本作暂不保存局内进度；保留生命周期钩子，便于未来接入版本化存档。
    }

    async dispose(): Promise<void> {
        if (this.disposePromise) {
            return this.disposePromise;
        }

        this.disposePromise = this.disposeInternal();
        return this.disposePromise;
    }

    private async disposeInternal(): Promise<void> {
        if (this.state === 'disposed') {
            return;
        }

        // 先把状态切到 disposed，令所有晚到的异步回调进入清理分支，
        // 再等待它们结束，避免回调和 Bundle release 并发操作同一份纹理。
        this.state = 'disposed';
        this.context?.services.platform.cancelLocalImagePicker();
        this.imageLoadToken += 1;
        this.visualLoadToken += 1;
        this.uiActionPending = true;

        this.unsubscribeShow?.();
        this.unsubscribeHide?.();
        this.unsubscribeShow = undefined;
        this.unsubscribeHide = undefined;
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
        this.unscheduleAllCallbacks();
        this.clearSpriteFrameReferences(this.node);
        this.destroyOverlay();
        this.destroyDynamicView();
        if (this.backgroundNode?.isValid) {
            this.backgroundNode.destroy();
        }
        this.backgroundNode = undefined;
        this.cropController.dispose();

        const pendingLoads = [...this.pendingAssetLoads];
        await Promise.all(pendingLoads.map(async (load) => {
            try {
                await load;
            } catch (error: unknown) {
                // 单个资源失败不应阻断其余资源的释放和返回大厅。
                console.warn('[SlidingPuzzleGame] Pending asset load finished with an error during dispose.', error);
            }
        }));

        this.releaseImageResources();
        this.releasePendingImageResources();
        this.releaseVisualAssets();
        this.activePauseModel = undefined;
        this.activeResultModel = undefined;
        this.completedResultModel = undefined;
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') {
            return;
        }

        this.destroyOverlay();
        // 暂停菜单可能是在上一层异步 UI 操作刚结束、运行层重新呈现时创建的。
        // 新弹窗必须拥有自己的点击窗口，不能被旧操作锁遗留状态挡住。
        this.uiActionPending = false;
        this.activePauseModel = model;
        this.inputLocked = true;
        const overlay = this.createOverlay('SlidingPuzzlePauseOverlay');
        const panelWidth = 640;
        const contentWidth = this.getPopupContentWidth(panelWidth);
        const titleHeight = 58;
        const bodyHeight = 94;
        const buttonHeight = 84;
        const titleBodyGap = 14;
        const bodyButtonGap = 24;
        const buttonGap = 16;
        const panelHeight = this.getPopupHeight(
            titleHeight
            + titleBodyGap
            + bodyHeight
            + bodyButtonGap
            + buttonHeight * 4
            + buttonGap * 3,
        );
        const panel = this.createPopupPanel(overlay, 'PausePanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        let cursorY = panelHeight / 2 - POPUP_CONTENT_PADDING_TOP;
        const titleY = cursorY - titleHeight / 2;
        cursorY -= titleHeight + titleBodyGap;
        const bodyY = cursorY - bodyHeight / 2;
        cursorY -= bodyHeight + bodyButtonGap;
        let buttonY = cursorY - buttonHeight / 2;

        this.createLabel(panel, 'PauseKicker', '拼图暂停', 0, titleY, 40, COLORS.tealDark, contentWidth, titleHeight);
        this.createLabel(
            panel,
            'PauseBody',
            '棋盘和计时已停住\n回来后继续寻找下一块空位',
            0,
            bodyY,
            24,
            COLORS.ink,
            contentWidth,
            bodyHeight,
        );
        this.createButton(panel, 'ResumeButton', '继续拼图', 0, buttonY, contentWidth, buttonHeight, COLORS.teal, () => {
            this.runUiAction('resume', model.resume);
        }, POPUP_BUTTON_FONT_SIZE);
        buttonY -= buttonHeight + buttonGap;
        this.createButton(panel, 'RestartButton', '重新开局', 0, buttonY, contentWidth, buttonHeight, COLORS.wood, () => {
            this.runUiAction('restart', model.restart);
        }, POPUP_BUTTON_FONT_SIZE);
        buttonY -= buttonHeight + buttonGap;
        this.createButton(panel, 'ChooseImageButton', '重新选图', 0, buttonY, contentWidth, buttonHeight, COLORS.teal, () => {
            this.runUiAction('choose-image', async () => {
                this.restartToSetupAfterRuntimeRestart = true;
                try {
                    await model.restart();
                } finally {
                    this.restartToSetupAfterRuntimeRestart = false;
                }
            });
        }, POPUP_BUTTON_FONT_SIZE);
        buttonY -= buttonHeight + buttonGap;
        this.createButton(panel, 'LobbyButton', '返回大厅', 0, buttonY, contentWidth, buttonHeight, COLORS.red, () => {
            this.runUiAction('exit', model.exit);
        }, POPUP_BUTTON_FONT_SIZE);
    }

    hidePauseMenu(): void {
        this.activePauseModel = undefined;
        if (this.state !== 'reference-preview') {
            this.destroyOverlay();
        }
        if (this.state === 'playing') {
            this.inputLocked = false;
        }
    }

    showResultView(model: MiniGameResultModel): void {
        this.state = 'completed';
        this.activeResultModel = model;
        this.completedResultModel = model;
        this.inputLocked = true;
        if (this.pauseButtonNode?.isValid) {
            this.pauseButtonNode.active = true;
        }
        this.completionTransitionPending = false;
        this.destroyCompletionEffect();
        this.destroyOverlay();
        const overlay = this.createOverlay('SlidingPuzzleResultOverlay');
        const panelWidth = 640;
        const contentWidth = this.getPopupContentWidth(panelWidth);
        const titleHeight = 56;
        const statsHeight = 84;
        const previewSize = 280;
        const buttonHeight = 84;
        const titleStatsGap = 16;
        const statsPreviewGap = 20;
        const previewButtonGap = 24;
        const buttonGap = 16;
        const panelHeight = this.getPopupHeight(
            titleHeight
            + titleStatsGap
            + statsHeight
            + statsPreviewGap
            + previewSize
            + previewButtonGap
            + buttonHeight * 2
            + buttonGap,
        );
        const panel = this.createPopupPanel(overlay, 'ResultPanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        let cursorY = panelHeight / 2 - POPUP_CONTENT_PADDING_TOP;
        const titleY = cursorY - titleHeight / 2;
        cursorY -= titleHeight + titleStatsGap;
        const statsY = cursorY - statsHeight / 2;
        cursorY -= statsHeight + statsPreviewGap;
        const previewY = cursorY - previewSize / 2;
        cursorY -= previewSize + previewButtonGap;
        let buttonY = cursorY - buttonHeight / 2;
        const closeIconSize = 50;
        const closeButtonSize = Math.max(SLIDING_PUZZLE_TOUCH_SIZE, closeIconSize + 28);

        const closeResultButton = this.createIconButton(
            panel,
            'CloseResult',
            panelWidth / 2 - POPUP_CONTENT_PADDING_X - closeButtonSize / 2,
            panelHeight / 2 - POPUP_CONTENT_PADDING_TOP - closeButtonSize / 2,
            'closeIcon',
            closeIconSize,
            () => {
                this.runUiAction('close-result', async () => {
                    this.hideResultView();
                });
            },
        );
        if (!this.visualFrames.get('closeIcon')) {
            this.createLabel(
                closeResultButton,
                'FallbackCloseLabel',
                '×',
                0,
                0,
                38,
                COLORS.woodDark,
                closeButtonSize,
                closeButtonSize,
            );
        }

        const title = model.result.completed ? '拼图完成' : '本局结束';
        const titleWidth = Math.max(1, contentWidth - closeButtonSize - 40);
        this.createLabel(
            panel,
            'ResultTitle',
            title,
            -closeButtonSize / 4,
            titleY,
            36,
            COLORS.woodDark,
            titleWidth,
            titleHeight,
        );
        this.createLabel(
            panel,
            'ResultStats',
            `用时 ${this.formatDuration(this.elapsedSeconds)}  ·  步数 ${this.model.moves}`,
            0,
            statsY,
            26,
            COLORS.ink,
            contentWidth,
            statsHeight,
        );
        if (this.imageTexture) {
            this.createImagePreview(panel, 0, previewY, previewSize, previewSize, '');
        } else {
            this.createPlaceholderPreview(panel, 0, previewY, previewSize, previewSize, '');
        }
        this.createButton(panel, 'RestartButton', '再来一局', 0, buttonY, contentWidth, buttonHeight, COLORS.teal, () => {
            this.runUiAction('restart', async () => {
                // 结算页的“再来一局”按产品流程回到选图页，
                // 由运行层注入新会话后再展示 setup，而不是直接开新盘。
                this.restartToSetupAfterRuntimeRestart = true;
                try {
                    await model.restart();
                } finally {
                    this.restartToSetupAfterRuntimeRestart = false;
                }
            });
        }, POPUP_BUTTON_FONT_SIZE);
        buttonY -= buttonHeight + buttonGap;
        this.createButton(panel, 'LobbyButton', '返回大厅', 0, buttonY, contentWidth, buttonHeight, COLORS.red, () => {
            this.runUiAction('exit', model.returnToLobby);
        }, POPUP_BUTTON_FONT_SIZE);
    }

    hideResultView(): void {
        this.activeResultModel = undefined;
        if (this.state === 'completed') {
            this.inputLocked = false;
        }
        this.destroyOverlay();
    }

    private buildBackground(): void {
        this.destroyDynamicView();
        const previousBackground = this.backgroundNode ?? this.node.getChildByName('SlidingPuzzleBackground');
        if (previousBackground?.isValid) {
            this.clearSpriteFrameReferences(previousBackground);
            previousBackground.destroy();
        }
        const background = new Node('SlidingPuzzleBackground');
        background.layer = this.node.layer;
        background.setParent(this.node);
        background.setSiblingIndex(0);
        this.backgroundNode = background;
        const transform = background.addComponent(UITransform);
        const size = view.getVisibleSize();
        transform.setContentSize(Math.max(750, size.width), Math.max(1334, size.height));
        const graphics = background.addComponent(Graphics);
        this.drawBackground(graphics, transform.width, transform.height);

        const frame = this.visualFrames.get('background');
        if (frame) {
            const textureWidth = Math.max(1, frame.texture.width);
            const textureHeight = Math.max(1, frame.texture.height);
            const cover = calculateSlidingPuzzleBackgroundCover(
                textureWidth,
                textureHeight,
                size.width,
                size.height,
            );
            const artwork = new Node('Artwork');
            artwork.layer = this.node.layer;
            artwork.setParent(background);
            artwork.setSiblingIndex(0);
            const artworkTransform = artwork.addComponent(UITransform);
            artworkTransform.setContentSize(cover.width, cover.height);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
        }
    }

    private showSetup(): void {
        if (this.state === 'disposed') {
            return;
        }

        // 选择页是可重复进入的入口；无论上一次选图是取消、失败还是
        // 页面重建，都要清掉遗留的输入锁，保证“从相册选择”可以再次触发。
        this.inputLocked = false;
        this.destroyDynamicView();
        this.layout = this.getLayout();
        const root = new Node('SlidingPuzzleSetup');
        root.layer = this.node.layer;
        root.setParent(this.node);
        this.dynamicNode = root;

        const metrics = this.layout;
        this.createIconButton(
            root,
            'BackButton',
            -metrics.viewportWidth / 2 + 58,
            metrics.headerY,
            'backIcon',
            SETUP_BACK_ICON_SIZE,
            () => this.requestLobbyFromSetup(),
        );
        const setupTitle = this.createLabel(
            root,
            'Title',
            '木框拼图',
            0,
            metrics.headerY - 22,
            SETUP_TITLE_FONT_SIZE,
            COLORS.paperLight,
            460,
            64,
        );
        setupTitle.isBold = true;

        // 选择页直接落在木桌背景上，保留图片框和按钮层级，去掉整块浅色底板。
        const content = new Node('SetupContent');
        content.layer = this.node.layer;
        content.setParent(root);
        content.setPosition(0, metrics.setupPanelCenterY, 0);
        const panelTop = metrics.setupPanelHeight / 2;
        const compact = metrics.setupPanelHeight < 760;
        const previewSize = clamp(
            Math.min(
                compact ? SETUP_COMPACT_PREVIEW_MAX_SIZE : SETUP_PREVIEW_MAX_SIZE,
                metrics.setupPanelHeight * 0.36,
            ),
            compact ? 180 : 240,
            compact ? SETUP_COMPACT_PREVIEW_MAX_SIZE : SETUP_PREVIEW_MAX_SIZE,
        );
        const previewY = panelTop - (compact ? 142 : 220);
        if (this.imageTexture) {
            this.createImagePreview(
                content,
                0,
                previewY,
                previewSize,
                previewSize,
                '',
            );
        } else {
            this.createPlaceholderPreview(content, 0, previewY, previewSize, previewSize, '正在准备图片');
        }

        const sizeCaptionY = previewY - previewSize / 2 - (compact ? 28 : 36);
        const sizeButtonWidth = Math.min(
            compact ? 106 : 120,
            Math.max(64, (metrics.setupPanelWidth - 64) / 4 - 4),
        );
        const sizeButtonHeight = compact ? 80 : 86;
        const sizeSpacing = sizeButtonWidth + 10;
        const sizeY = sizeCaptionY - (compact ? 56 : 66);
        SLIDING_PUZZLE_BOARD_SIZES.forEach((size, index) => {
            const x = (index - 1.5) * sizeSpacing;
            this.createButton(
                content,
                `Size${size}`,
                `${size} × ${size}`,
                x,
                sizeY,
                sizeButtonWidth,
                sizeButtonHeight,
                size === this.selectedSize ? COLORS.teal : COLORS.wood,
                () => {
                    this.selectedSize = size;
                    this.selectedConfig = Object.freeze({
                        ...this.selectedConfig,
                        boardSize: size,
                    });
                    this.context?.services.feedback.play('toggle');
                    this.showSetup();
                },
                compact ? SETUP_COMPACT_SIZE_BUTTON_FONT_SIZE : SETUP_SIZE_BUTTON_FONT_SIZE,
            );
        });

        const sourceButtonWidth = Math.min(
            compact ? 264 : 284,
            Math.max(132, (metrics.setupPanelWidth - 48) / 2),
        );
        const sourceButtonHeight = compact ? 84 : 90;
        const sourceOffset = sourceButtonWidth / 2 + 16;
        const defaultSourceY = sizeY - (compact ? 108 : 128);
        const startHeight = compact ? 80 : 100;
        const startGap = 24;
        const sourceY = compact
            ? Math.max(
                defaultSourceY,
                metrics.footerY
                + startHeight / 2
                + sourceButtonHeight / 2
                + startGap
                - metrics.setupPanelCenterY,
            )
            : defaultSourceY;
        this.createButton(content, 'PresetButton', '随机一张拼图', -sourceOffset, sourceY, sourceButtonWidth, sourceButtonHeight, COLORS.wood, () => {
            const nextPresetIndex = this.getRandomPresetIndex();
            const nextPresetAssetPath = SLIDING_PUZZLE_PRESET_ASSET_PATHS[nextPresetIndex];
            const keepsCurrentImage = this.selectedConfig.imageSource === 'preset'
                && this.selectedConfig.presetAssetPath === nextPresetAssetPath
                && this.imageTexture !== undefined
                && this.loadedPresetAssetPath === nextPresetAssetPath
                && this.loadingPresetAssetPath === undefined;
            this.selectedPresetIndex = nextPresetIndex;
            this.selectedConfig = Object.freeze({
                boardSize: this.selectedSize,
                imageSource: 'preset',
                presetAssetPath: nextPresetAssetPath,
            });
            this.cropController.cancel();
            this.context?.services.feedback.play('uiButton');
            if (!keepsCurrentImage) {
                // 换图时保留当前预览，直到新纹理加载完成后再原子替换，
                // 避免“先清空旧图 -> 显示占位 -> 再重建整页”造成闪烁。
                void this.trackAssetLoad(this.loadPresetImage(true));
            }
        }, compact ? SETUP_COMPACT_SOURCE_BUTTON_FONT_SIZE : SETUP_SOURCE_BUTTON_FONT_SIZE);
        this.createButton(content, 'ImageButton', '从相册选择', sourceOffset, sourceY, sourceButtonWidth, sourceButtonHeight, COLORS.teal, () => {
            void this.pickLocalImage();
        }, compact ? SETUP_COMPACT_SOURCE_BUTTON_FONT_SIZE : SETUP_SOURCE_BUTTON_FONT_SIZE);

        const startWidth = Math.min(compact ? 440 : 480, metrics.setupPanelWidth - 32);
        this.createButton(root, 'StartButton', '开始拼图', 0, metrics.footerY, startWidth, startHeight, COLORS.red, () => {
            void this.startRound();
        }, compact ? SETUP_COMPACT_START_BUTTON_FONT_SIZE : SETUP_START_BUTTON_FONT_SIZE);
    }

    private async pickLocalImage(): Promise<void> {
        if (!this.context
            || this.state === 'disposed'
            || this.inputLocked
            || this.state === 'picking-image') {
            return;
        }

        this.state = 'picking-image';
        this.inputLocked = true;
        // 必须先在当前触摸回调中启动微信原生选择器，再销毁页面节点。
        const platform = this.context.services.platform;
        const selectionPromise = platform.pickLocalImage();
        this.destroyDynamicView();
        let selection: LocalImageSelection | null = null;
        try {
            selection = await selectionPromise;
        } catch (error: unknown) {
            // 平台选图接口偶发抛错时也要回到可重试的选择页，不能让
            // picking-image 状态和已销毁的动态节点一起卡住入口。
            console.warn('[SlidingPuzzleGame] Failed to pick local image.', error);
        }

        this.inputLocked = false;
        if ((this.state as SlidingPuzzleState) === 'disposed') {
            selection?.release();
            return;
        }

        if (this.state !== 'picking-image') {
            selection?.release();
            return;
        }

        if (!selection) {
            this.state = 'setup';
            this.context.services.feedback.play('collision');
            this.showSetup();
            return;
        }

        if (!isSupportedImageMimeType(selection.mimeType)
            || (selection.sizeBytes !== undefined && selection.sizeBytes > MAX_IMAGE_BYTES)) {
            selection.release();
            this.state = 'setup';
            this.showSetup();
            return;
        }

        this.cropController.begin(selection);
        this.releasePendingImageResources();
        if (!await this.trackAssetLoad(this.loadLocalImage(selection.uri, selection.mimeType))) {
            this.cropController.cancel();
            this.state = 'setup';
            this.context.services.feedback.play('collision');
            this.showSetup();
            return;
        }

        this.state = 'crop-editing';
        this.showCropEditor();
    }

    private async loadLocalImage(uri: string, mimeType?: string): Promise<boolean> {
        this.imageLoadToken += 1;
        const token = this.imageLoadToken;
        const extension = mimeType?.toLowerCase().includes('png') || uri.toLowerCase().includes('.png')
            ? '.png'
            : '.jpg';
        const imageAsset = await new Promise<ImageAsset | undefined>((resolve) => {
            try {
                assetManager.loadRemote<ImageAsset>(
                    uri,
                    { ext: extension },
                    (error: Error | null, asset: ImageAsset) => resolve(error ? undefined : asset),
                );
            } catch (error: unknown) {
                console.warn('[SlidingPuzzleGame] Failed to load local image.', error);
                resolve(undefined);
            }
        });

        if (!imageAsset
            || token !== this.imageLoadToken
            || (this.state as SlidingPuzzleState) === 'disposed') {
            if (imageAsset) {
                imageAsset.destroy();
            }
            return false;
        }

        try {
            const texture = new Texture2D();
            texture.image = imageAsset;
            // 新图先进入待确认区；只有裁剪页点击确认后才替换当前有效图片。
            this.releasePendingImageResources();
            this.pendingImageAsset = imageAsset;
            this.pendingImageTexture = texture;
            this.pendingImageTextureOwned = true;
            return true;
        } catch (error: unknown) {
            console.warn('[SlidingPuzzleGame] Failed to create local texture.', error);
            imageAsset.destroy();
            return false;
        }
    }

    private async loadPresetImage(refreshSetup: boolean): Promise<boolean> {
        if (this.state === 'disposed') {
            return false;
        }

        const path = this.selectedConfig.presetAssetPath;
        const bundle = assetManager.getBundle(SLIDING_PUZZLE_RESOURCE_BUNDLE);
        if (!path || !bundle) {
            return false;
        }
        if (this.imageTexture
            && !this.imageTextureOwned
            && this.loadedPresetAssetPath === path) {
            return true;
        }

        this.imageLoadToken += 1;
        const token = this.imageLoadToken;
        this.loadingPresetAssetPath = path;
        this.releasePendingImageResources();
        // 不要在异步加载开始前释放当前纹理。选图页需要继续显示旧图，
        // 待新纹理准备好后再切换，避免出现一帧空白或占位图。
        const previousImageAsset = this.imageAsset;
        const previousTexture = this.imageTexture;
        const previousTextureOwned = this.imageTextureOwned;
        const texture = await new Promise<Texture2D | undefined>((resolve) => {
            try {
                bundle.load(
                    path,
                    Texture2D,
                    (error: Error | null, loadedTexture: Texture2D) => resolve(
                        error ? undefined : loadedTexture,
                    ),
                );
            } catch (error: unknown) {
                console.warn('[SlidingPuzzleGame] Failed to load preset image.', path, error);
                resolve(undefined);
            }
        });

        if (token !== this.imageLoadToken || (this.state as SlidingPuzzleState) === 'disposed') {
            if (token === this.imageLoadToken) {
                this.loadingPresetAssetPath = undefined;
            }
            if (texture) {
                // 这次请求已经拿到 Bundle 资源，但所属局面已经失效，
                // 必须在 Bundle 释放前平衡本次 load 的引用。
                this.releaseBundleTexture(texture);
            }
            return false;
        }

        if (!texture) {
            // 加载失败时继续保留旧图，选图页仍可操作和重试，
            // 不要把当前预览替换成空白占位。
            this.loadingPresetAssetPath = undefined;
            return false;
        }

        this.imageAsset = undefined;
        this.imageTexture = texture;
        this.imageTextureOwned = false;
        this.loadedPresetAssetPath = path;
        this.loadingPresetAssetPath = undefined;
        if (refreshSetup && this.state === 'setup') {
            this.showSetup();
        } else {
            // 开始新局时当前仍是选图页，先解除旧 Sprite 对旧纹理的引用，
            // 再释放旧资源；随后 startRound() 会创建棋盘视图。
            this.destroyDynamicView();
        }
        // 新预览已经建立后再释放旧纹理，保证旧 Sprite 不会引用已销毁资源。
        this.releaseImageResourceSet(previousImageAsset, previousTexture, previousTextureOwned);
        return texture !== undefined;
    }

    private async loadVisualAssets(): Promise<void> {
        const bundle = assetManager.getBundle(SLIDING_PUZZLE_RESOURCE_BUNDLE);
        if (!bundle || this.state === 'disposed') {
            return;
        }

        const token = ++this.visualLoadToken;
        const entries = (Object.keys(SLIDING_PUZZLE_VISUAL_ASSET_PATHS) as SlidingPuzzleVisualKey[])
            .map((key): [SlidingPuzzleVisualKey, string] => [
                key,
                SLIDING_PUZZLE_VISUAL_ASSET_PATHS[key],
            ]);
        const iconKeys: SlidingPuzzleVisualKey[] = [
            'backIcon',
            'pauseIcon',
            'cropIcon',
            'referenceIcon',
            'albumIcon',
            'closeIcon',
        ];
        const atlasFrames = await loadAutoAtlasFrames(
            bundle,
            SLIDING_PUZZLE_ICON_ATLAS_PATH,
            iconKeys.map((key) => ({
                key,
                frameName: autoAtlasFrameName(SLIDING_PUZZLE_VISUAL_ASSET_PATHS[key]),
                fallbackTexturePath: SLIDING_PUZZLE_VISUAL_ASSET_PATHS[key],
            })),
        );
        if (token !== this.visualLoadToken || (this.state as SlidingPuzzleState) === 'disposed') {
            Object.keys(atlasFrames).forEach((key) => atlasFrames[key]?.destroy());
            return;
        }
        Object.keys(atlasFrames).forEach((key) => {
            const frame = atlasFrames[key];
            if (frame) this.visualFrames.set(key as SlidingPuzzleVisualKey, frame);
        });
        const loaded = await Promise.all(entries.map(async ([key, path]) => {
            if (iconKeys.indexOf(key) >= 0) {
                return { key, texture: undefined };
            }
            const texture = await new Promise<Texture2D | undefined>((resolve) => {
                try {
                    bundle.load(
                        path,
                        Texture2D,
                        (error: Error | null, loadedTexture: Texture2D) => resolve(
                            error ? undefined : loadedTexture,
                        ),
                    );
                } catch (error: unknown) {
                    console.warn('[SlidingPuzzleGame] Failed to load visual asset.', path, error);
                    resolve(undefined);
                }
            });
            return { key, texture };
        }));

        if (token !== this.visualLoadToken || (this.state as SlidingPuzzleState) === 'disposed') {
            loaded.forEach(({ texture }) => {
                if (texture) {
                    this.releaseBundleTexture(texture);
                }
            });
            return;
        }

        loaded.forEach(({ key, texture }) => {
            if (!texture) {
                return;
            }
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.originalSize = new Size(texture.width, texture.height);
            this.visualTextures.set(key, texture);
            this.visualFrames.set(key, frame);
        });

        if (this.state === 'ready' || this.state === 'picking-image' || this.state === 'starting') {
            this.buildBackground();
            return;
        }
        if ((this.state as SlidingPuzzleState) !== 'disposed') {
            this.handleCanvasResize();
        }
    }

    private releaseVisualAssets(): void {
        this.visualFrames.forEach((frame) => frame.destroy());
        this.visualFrames.clear();
        this.visualTextures.forEach((texture) => this.releaseBundleTexture(texture));
        this.visualTextures.clear();
    }

    private trackAssetLoad<T>(load: Promise<T>): Promise<T> {
        this.pendingAssetLoads.add(load);
        const clear = (): void => {
            this.pendingAssetLoads.delete(load);
        };
        void load.then(clear, clear);
        return load;
    }

    private releaseBundleTexture(texture: Texture2D): void {
        try {
            assetManager.releaseAsset(texture);
        } catch (error: unknown) {
            texture.destroy();
        }
    }

    private releaseImageResources(): void {
        // Sprite 必须先解除对图片帧的引用，再销毁帧/纹理；如果先 destroy
        // 帧，Cocos 可能在同一渲染帧继续提交旧 Sprite，Batcher2D 就会从
        // null 纹理读取 hash。
        this.clearSpriteFrameReferences(this.dynamicNode);
        this.clearSpriteFrameReferences(this.overlayNode);
        this.destroyTileFrames();
        this.destroyTransientFrames();
        const imageAsset = this.imageAsset;
        const texture = this.imageTexture;
        const ownsTexture = this.imageTextureOwned;
        this.imageAsset = undefined;
        this.imageTexture = undefined;
        this.imageTextureOwned = false;
        this.loadedPresetAssetPath = undefined;
        this.loadingPresetAssetPath = undefined;

        this.releaseImageResourceSet(imageAsset, texture, ownsTexture);
    }

    private releaseImageResourceSet(
        imageAsset: ImageAsset | undefined,
        texture: Texture2D | undefined,
        ownsTexture: boolean,
    ): void {
        if (ownsTexture) {
            texture?.destroy();
        } else if (texture) {
            // 预置图来自 Bundle.load，必须平衡对应的资源引用；本地图片
            // 纹理由本组件拥有，上面的 destroy 分支负责释放。
            this.releaseBundleTexture(texture);
        }
        if (imageAsset) {
            try {
                assetManager.releaseAsset(imageAsset);
            } catch (error: unknown) {
                imageAsset.destroy();
            }
        }
    }

    private releasePendingImageResources(): void {
        const imageAsset = this.pendingImageAsset;
        const texture = this.pendingImageTexture;
        const ownsTexture = this.pendingImageTextureOwned;
        this.pendingImageAsset = undefined;
        this.pendingImageTexture = undefined;
        this.pendingImageTextureOwned = false;

        if (ownsTexture) {
            texture?.destroy();
        }
        if (imageAsset) {
            try {
                assetManager.releaseAsset(imageAsset);
            } catch (error: unknown) {
                imageAsset.destroy();
            }
        }
    }

    private promotePendingImage(): boolean {
        if (!this.pendingImageTexture) {
            return false;
        }

        const imageAsset = this.pendingImageAsset;
        const texture = this.pendingImageTexture;
        const ownsTexture = this.pendingImageTextureOwned;
        this.pendingImageAsset = undefined;
        this.pendingImageTexture = undefined;
        this.pendingImageTextureOwned = false;

        this.releaseImageResources();
        this.imageAsset = imageAsset;
        this.imageTexture = texture;
        this.imageTextureOwned = ownsTexture;
        return true;
    }

    private getPreviewTexture(): Texture2D | undefined {
        return this.state === 'crop-editing'
            ? (this.pendingImageTexture ?? this.imageTexture)
            : this.imageTexture;
    }

    private destroyTileFrames(): void {
        while (this.tileFrames.length > 0) {
            this.tileFrames.pop()?.destroy();
        }
    }

    private destroyTransientFrames(): void {
        this.transientFrames.forEach((frame) => frame.destroy());
        this.transientFrames.clear();
        this.cropPreviewFrame = undefined;
    }

    private rebuildTileFrames(): void {
        this.destroyTileFrames();
        if (!this.imageTexture) {
            return;
        }

        const boardSize = this.selectedSize;
        const cropRect = this.getCropRect(this.imageTexture, this.getActiveCrop());
        for (let index = 0; index < boardSize * boardSize - 1; index += 1) {
            const sourceRect = calculateSlidingPuzzleTileSourceRect(
                cropRect.x,
                cropRect.y,
                cropRect.width,
                boardSize,
                index,
            );
            const frame = new SpriteFrame();
            frame.texture = this.imageTexture;
            frame.rect = new Rect(
                sourceRect.x,
                sourceRect.y,
                sourceRect.width,
                sourceRect.height,
            );
            frame.originalSize = new Size(sourceRect.width, sourceRect.height);
            this.tileFrames.push(frame);
        }
    }

    private getActiveCrop(): { readonly scale: number; readonly offsetX: number; readonly offsetY: number } {
        if (this.state === 'crop-editing') {
            return this.cropController.currentCrop;
        }

        return this.selectedConfig.crop ?? Object.freeze({
            scale: 1,
            offsetX: 0,
            offsetY: 0,
        });
    }

    private getCropRect(
        texture: Texture2D,
        crop: { readonly scale: number; readonly offsetX: number; readonly offsetY: number },
    ): Rect {
        const width = Math.max(1, texture.width);
        const height = Math.max(1, texture.height);
        const scale = clamp(Number.isFinite(crop.scale) ? crop.scale : 1, 1, 3);
        const size = Math.min(width, height) / scale;
        const availableX = Math.max(0, (width - size) / 2);
        const availableY = Math.max(0, (height - size) / 2);
        const centerX = width / 2 + clamp(crop.offsetX, -1, 1) * availableX;
        const centerY = height / 2 + clamp(crop.offsetY, -1, 1) * availableY;
        return new Rect(
            clamp(centerX - size / 2, 0, width - size),
            clamp(centerY - size / 2, 0, height - size),
            size,
            size,
        );
    }

    private showCropEditor(): void {
        this.destroyDynamicView();
        this.layout = this.getLayout();
        const root = new Node('SlidingPuzzleCropEditor');
        root.layer = this.node.layer;
        root.setParent(this.node);
        this.dynamicNode = root;
        const metrics = this.layout;
        const cropTitle = this.createLabel(
            root,
            'CropTitle',
            '选择图片',
            0,
            metrics.titleY,
            CROP_TITLE_FONT_SIZE,
            COLORS.paperLight,
            680,
            68,
        );
        cropTitle.isBold = true;
        this.createLabel(
            root,
            'CropBody',
            '拖动图片调整位置，双指操作放大缩小',
            0,
            metrics.titleY - 68,
            CROP_HINT_FONT_SIZE,
            COLORS.paper,
            680,
            54,
        );
        const actionHeight = 88;
        const actionY = metrics.footerY + 38;
        const bodyY = metrics.titleY - 68;
        const bodyHeight = 54;
        const previewTop = bodyY - bodyHeight / 2 - 28;
        const previewBottom = actionY + actionHeight / 2 + 32;
        const availablePreviewSize = Math.max(CROP_PREVIEW_MIN_SIZE, previewTop - previewBottom);
        const previewSize = Math.min(CROP_PREVIEW_MAX_SIZE, availablePreviewSize);
        const previewY = (previewTop + previewBottom) / 2;
        if (this.getPreviewTexture()) {
            this.createImagePreview(
                root,
                0,
                previewY,
                previewSize,
                previewSize,
                '',
                true,
            );
        } else {
            this.createPlaceholderPreview(root, 0, previewY, previewSize, previewSize, '图片准备中');
        }
        this.createButton(root, 'CancelCrop', '取消', -126, actionY, 220, actionHeight, COLORS.red, () => {
            this.state = 'setup';
            this.cropController.cancel();
            this.showSetup();
            this.releasePendingImageResources();
        });
        this.createButton(root, 'ConfirmCrop', '使用这张图', 126, actionY, 250, actionHeight, COLORS.teal, () => {
            const crop = this.cropController.confirm();
            if (!crop || !this.promotePendingImage()) {
                return;
            }

            this.selectedConfig = Object.freeze({
                boardSize: this.selectedSize,
                imageSource: 'local',
                imageUri: crop.selection.uri,
                crop: crop.crop,
            });
            this.state = 'setup';
            this.context?.services.feedback.play('uiButton');
            this.showSetup();
        });
    }

    private async startRound(): Promise<void> {
        if (this.state === 'disposed'
            || this.state === 'starting'
            || this.state === 'playing') {
            return;
        }

        // restart() 由运行层在 UI 操作锁仍然生效时注入新会话；不能用
        // uiActionPending 阻断这次真正的棋盘初始化。starting 状态本身已
        // 足够防止开始按钮重复触发。
        this.state = 'starting';
        this.inputLocked = true;
        this.completionRequested = false;
        this.completionTransitionPending = false;
        this.completionImageRevealed = false;
        this.elapsedSeconds = 0;
        this.selectedConfig = Object.freeze({
            ...this.selectedConfig,
            boardSize: this.selectedSize,
        });
        if (this.selectedConfig.imageSource === 'preset') {
            await this.trackAssetLoad(this.loadPresetImage(false));
        }
        if ((this.state as SlidingPuzzleState) === 'disposed') {
            return;
        }
        this.model.reset(this.selectedSize);
        this.context?.reportScore(0);
        this.state = 'playing';
        this.inputLocked = false;
        this.showPlay();
        this.context?.services.feedback.play('uiButton');
    }

    private showPlay(): void {
        this.destroyDynamicView();
        this.layout = this.getLayout();
        const root = new Node('SlidingPuzzlePlay');
        root.layer = this.node.layer;
        root.setParent(this.node);
        this.dynamicNode = root;
        const metrics = this.layout;
        this.timerLabel = this.createLabel(root, 'Timer', '用时 00:00', -132, metrics.headerY - 60, PLAY_HUD_FONT_SIZE, COLORS.paperLight, 260, 52);
        this.movesLabel = this.createLabel(root, 'Moves', '步数 000', 132, metrics.headerY - 60, PLAY_HUD_FONT_SIZE, COLORS.paperLight, 260, 52);
        this.createIconButton(
            root,
            'ReferenceButton',
            -metrics.viewportWidth / 2 + 64,
            metrics.headerY,
            'referenceIcon',
            PLAY_SIDE_ICON_SIZE,
            () => {
                this.showReferencePreview();
            },
        );
        this.pauseButtonNode = this.createIconButton(root, 'PauseButton', metrics.pauseX, metrics.pauseY, 'pauseIcon', PLAY_SIDE_ICON_SIZE, () => {
            if (this.state === 'playing') {
                this.context?.services.feedback.play('uiButton');
                this.context?.requestPause();
                return;
            }

            if (this.state === 'completed') {
                const resultModel = this.activeResultModel ?? this.completedResultModel;
                if (!resultModel) {
                    return;
                }

                this.context?.services.feedback.play('uiButton');
                this.showResultView(resultModel);
            }
        });
        this.pauseButtonNode.active = this.state === 'playing' || this.state === 'completed';

        const board = new Node('Board');
        board.layer = this.node.layer;
        board.setParent(root);
        board.setPosition(0, metrics.boardCenterY, 0);
        const boardTransform = board.addComponent(UITransform);
        boardTransform.setContentSize(metrics.boardSize, metrics.boardSize);
        board.addComponent(Graphics);
        board.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        board.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        board.on(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.boardNode = board;
        this.rebuildTileFrames();
        this.renderBoard();
        this.refreshHud();
    }

    private renderBoard(): void {
        const board = this.boardNode;
        const metrics = this.layout;
        if (!board || !metrics) {
            return;
        }

        const graphics = board.getComponent(Graphics) ?? board.addComponent(Graphics);
        const boardSize = metrics.boardSize;
        graphics.clear();
        graphics.fillColor = COLORS.shadow;
        graphics.roundRect(-boardSize / 2 + 6, -boardSize / 2 - 7, boardSize, boardSize, 26);
        graphics.fill();
        graphics.fillColor = COLORS.woodDark;
        graphics.roundRect(-boardSize / 2, -boardSize / 2, boardSize, boardSize, 26);
        graphics.fill();
        graphics.fillColor = COLORS.wood;
        graphics.roundRect(-boardSize / 2 + 12, -boardSize / 2 + 12, boardSize - 24, boardSize - 24, 18);
        graphics.fill();

        this.tileIndexByNode.clear();
        this.destroyCompletedBoardImage();
        board.children.slice().forEach((child) => child.destroy());
        const boardFrame = this.visualFrames.get('board');
        if (boardFrame) {
            const boardArtwork = new Node('BoardArtwork');
            boardArtwork.layer = this.node.layer;
            boardArtwork.setParent(board);
            boardArtwork.setSiblingIndex(0);
            boardArtwork.addComponent(UITransform).setContentSize(boardSize, boardSize);
            const boardSprite = boardArtwork.addComponent(Sprite);
            boardSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            boardSprite.spriteFrame = boardFrame;
        }
        const innerSize = boardSize * (1 - BOARD_INNER_INSET_RATIO * 2);
        const tileAreaSize = Math.max(1, innerSize - TILE_EDGE_INSET * 2);
        const size = this.model.boardSize;
        const cellSize = tileAreaSize / size;
        // 方块之间完全贴合，网格外沿向内槽四边各收 2px。
        const tileGap = 0;
        const tileSize = (tileAreaSize - tileGap * (size - 1)) / size;
        const tileRadius = Math.min(6, Math.max(2, tileSize * TILE_CORNER_RADIUS_RATIO));
        this.model.snapshot.board.forEach((value, index) => {
            const row = Math.floor(index / size);
            const column = index % size;
            const x = -tileAreaSize / 2 + tileSize / 2 + column * (tileSize + tileGap);
            const y = tileAreaSize / 2 - tileSize / 2 - row * (tileSize + tileGap);
            // 空位不创建独立模块，直接露出棋盘内槽的木质底色。
            if (value === 0) {
                return;
            }

            const tile = new Node(`Tile${value}`);
            tile.layer = this.node.layer;
            tile.setParent(board);
            tile.setPosition(x, y, 0);
            tile.addComponent(UITransform).setContentSize(tileSize, tileSize);
            this.tileIndexByNode.set(tile, index);
            // V13 皮肤始终是每个非空方块的底层；有真实图片时再把切片贴到皮肤上方。
            const skin = new Node('TileSkin');
            skin.layer = this.node.layer;
            skin.setParent(tile);
            skin.addComponent(UITransform).setContentSize(tileSize, tileSize);
            const tileSkinFrame = this.visualFrames.get('tileSkin');
            if (tileSkinFrame) {
                const skinSprite = skin.addComponent(Sprite);
                skinSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                skinSprite.spriteFrame = tileSkinFrame;
            } else {
                const skinGraphics = skin.addComponent(Graphics);
                skinGraphics.fillColor = COLORS.paper;
                skinGraphics.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, tileRadius);
                skinGraphics.fill();
                skinGraphics.lineWidth = 2;
                skinGraphics.strokeColor = colorWithAlpha(COLORS.woodDark, 120);
                skinGraphics.roundRect(
                    -tileSize / 2 + 1,
                    -tileSize / 2 + 1,
                    tileSize - 2,
                    tileSize - 2,
                    Math.max(2, tileRadius - 1),
                );
                skinGraphics.stroke();
            }

            const tileFrame = this.tileFrames[value - 1];
            if (tileFrame) {
                const imageInset = clamp(tileSize * TILE_SKIN_INSET_RATIO, 2, 4);
                const artworkSize = tileSize - imageInset * 2;
                const artwork = new Node('TileImage');
                artwork.layer = this.node.layer;
                artwork.setParent(tile);
                artwork.addComponent(UITransform).setContentSize(artworkSize, artworkSize);
                const sprite = artwork.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = tileFrame;
            } else {
                // 开发阶段没有预置图时仍保留木片皮肤，编号仅作为可操作性回退提示。
                this.createLabel(
                    tile,
                    'TileLabel',
                    String(value),
                    0,
                    0,
                    Math.max(20, tileSize * 0.15),
                    COLORS.ink,
                    tileSize - 16,
                    tileSize - 16,
                );
            }

            const bevel = new Node('TileBevel');
            bevel.layer = this.node.layer;
            bevel.setParent(tile);
            bevel.addComponent(UITransform).setContentSize(tileSize, tileSize);
            const bevelGraphics = bevel.addComponent(Graphics);
            bevelGraphics.lineWidth = 2;
            bevelGraphics.strokeColor = colorWithAlpha(COLORS.woodDark, 96);
            bevelGraphics.roundRect(
                -tileSize / 2 + 2,
                -tileSize / 2 + 2,
                tileSize - 4,
                tileSize - 4,
                Math.max(2, tileRadius - 1),
            );
            bevelGraphics.stroke();
        });

        // 完成过渡期间画布重建时，仍将已揭示的整图恢复到棋盘内槽，
        // 不让旋转屏幕或视觉资源异步刷新把完成画面还原成分块状态。
        if (this.completionImageRevealed) {
            this.showCompletedBoardImage(false);
        }
    }

    private readonly handleTouchStart = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked || this.activeTouchId !== null) {
            return;
        }

        const location = event.getUILocation();
        const touchId = event.getID();
        if (touchId === null) {
            return;
        }

        this.activeTouchId = touchId;
        this.touchStartX = location.x;
        this.touchStartY = location.y;
        // 点击时使用按下瞬间的格子，而不是抬起瞬间的格子。
        // 手指轻微漂移到边界另一侧时，仍应操作用户实际按下的方块。
        this.touchStartTileIndex = this.getTileIndexFromEvent(event);
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        const touchId = event.getID();
        if (this.activeTouchId === null || touchId !== this.activeTouchId) {
            return;
        }

        const startTileIndex = this.touchStartTileIndex;
        const startX = this.touchStartX;
        const startY = this.touchStartY;
        const location = event.getUILocation();
        this.resetTouchState();

        if (this.state !== 'playing' || this.inputLocked) {
            return;
        }

        const deltaX = location.x - startX;
        const deltaY = location.y - startY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD) {
            this.handleBoardTap(startTileIndex);
            return;
        }

        const direction: SlidingPuzzleDirection = Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'up' : 'down');
        this.performMove(direction);
    };

    private handleBoardTap(tileIndex: number): void {
        if (tileIndex < 0) {
            return;
        }

        const result = this.model.moveTileAt(tileIndex);
        if (result.changed) {
            this.applyMoveResult(result);
        }
    }

    private getTileIndexFromEvent(event: EventTouch): number {
        const board = this.boardNode;
        if (!board) {
            return -1;
        }

        // 事件目标通常是 Board（只有 Board 注册了事件），所以不能只依赖
        // event.target。先处理目标链，再用 Cocos 的屏幕坐标 hitTest 检查每个
        // 实际方块 UITransform；这会自动包含 Canvas/UI Camera 的缩放和偏移。
        let target = event.target as Node | null;
        while (target && target !== board) {
            const tileIndex = this.tileIndexByNode.get(target);
            if (tileIndex !== undefined) {
                return tileIndex;
            }
            target = target.parent;
        }

        const screenLocation = event.getLocation();
        for (const [tile, tileIndex] of this.tileIndexByNode) {
            const transform = tile.getComponent(UITransform);
            if (transform?.hitTest(screenLocation, event.windowId)) {
                return tileIndex;
            }
        }

        return -1;
    }

    private readonly handleTouchCancel = (event: EventTouch): void => {
        if (this.activeTouchId !== null && event.getID() === this.activeTouchId) {
            this.resetTouchState();
        }
    };

    private resetTouchState(): void {
        this.activeTouchId = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTileIndex = -1;
    }

    private performMove(direction: SlidingPuzzleDirection): void {
        if (this.state !== 'playing' || this.inputLocked) {
            return;
        }

        const result = this.model.move(direction);
        if (!result.changed) {
            this.context?.services.feedback.play('collision');
            return;
        }

        this.applyMoveResult(result);
    }

    private applyMoveResult(result: SlidingPuzzleMoveResult): void {
        if (!result.changed) {
            return;
        }

        this.context?.services.feedback.play('drop');
        this.renderBoard();
        this.refreshHud();

        if (result.completed) {
            this.finishRound();
        }
    }

    private finishRound(): void {
        if (this.completionRequested) {
            return;
        }

        this.completionRequested = true;
        this.completionTransitionPending = true;
        this.state = 'completed';
        this.inputLocked = true;
        if (this.pauseButtonNode?.isValid) {
            this.pauseButtonNode.active = true;
        }
        this.context?.services.feedback.play('milestone');
        const score = Math.max(1, Math.round(100000 - this.elapsedSeconds * 20 - this.model.moves * 45));
        const result: GameResult = Object.freeze({
            score,
            duration: Math.round(this.elapsedSeconds * 1000),
            completed: true,
            extra: Object.freeze({
                boardSize: this.model.boardSize,
                moves: this.model.moves,
                imageSource: this.selectedConfig.imageSource,
            }),
        });
        this.context?.reportScore(score);
        this.showCompletionEffect();
        // 闪耀先给最后一块一个完整的“拼上去”反馈，随后用同一裁剪参数的
        // 原图覆盖棋盘内槽；弹窗仍等整段庆祝动画结束后再出现。
        this.scheduleOnce(() => {
            if (this.state === 'disposed' || !this.completionRequested) {
                return;
            }
            this.showCompletedBoardImage(true);
        }, COMPLETION_IMAGE_REVEAL_DELAY);
        // 先让最后一块落位后的闪耀效果完整播放，再交给运行层展示结算弹窗。
        this.scheduleOnce(() => {
            if (this.state === 'disposed' || !this.completionRequested) {
                return;
            }
            this.completionTransitionPending = false;
            this.destroyCompletionEffect();
            this.context?.requestExit(result);
        }, COMPLETION_CELEBRATION_DURATION);
    }

    private showCompletionEffect(): void {
        this.destroyCompletionEffect();
        const parent = this.dynamicNode;
        const board = this.boardNode;
        const metrics = this.layout;
        if (!parent || !board || !metrics) {
            return;
        }

        const effect = new Node('CompletionCelebration');
        effect.layer = this.node.layer;
        effect.setParent(parent);
        effect.setPosition(board.position.x, board.position.y, 0);
        effect.addComponent(UITransform).setContentSize(
            metrics.boardSize + 180,
            metrics.boardSize + 180,
        );
        this.completionEffectNode = effect;

        const boardSize = metrics.boardSize;
        const frameSize = boardSize + 24;
        const frame = new Node('WarmFrameGlow');
        frame.layer = this.node.layer;
        frame.setParent(effect);
        frame.addComponent(UITransform).setContentSize(frameSize, frameSize);
        const frameGraphics = frame.addComponent(Graphics);
        frameGraphics.lineWidth = Math.max(7, boardSize * 0.014);
        frameGraphics.strokeColor = colorWithAlpha(COLORS.paperLight, 235);
        frameGraphics.roundRect(
            -frameSize / 2,
            -frameSize / 2,
            frameSize,
            frameSize,
            Math.min(34, frameSize * 0.06),
        );
        frameGraphics.stroke();
        const frameOpacity = frame.addComponent(UIOpacity);
        frameOpacity.opacity = 0;
        tween(frameOpacity)
            .to(0.16, { opacity: 235 }, { easing: 'sineOut' })
            .to(0.24, { opacity: 92 }, { easing: 'sineInOut' })
            .to(0.22, { opacity: 220 }, { easing: 'sineInOut' })
            .to(0.42, { opacity: 0 }, { easing: 'sineIn' })
            .start();

        const flash = new Node('CompletionFlash');
        flash.layer = this.node.layer;
        flash.setParent(effect);
        flash.addComponent(UITransform).setContentSize(boardSize, boardSize);
        const flashGraphics = flash.addComponent(Graphics);
        flashGraphics.fillColor = colorWithAlpha(COLORS.paperLight, 130);
        flashGraphics.roundRect(-boardSize / 2, -boardSize / 2, boardSize, boardSize, 24);
        flashGraphics.fill();
        const flashOpacity = flash.addComponent(UIOpacity);
        flashOpacity.opacity = 0;
        tween(flashOpacity)
            .to(0.12, { opacity: 100 }, { easing: 'sineOut' })
            .to(0.36, { opacity: 0 }, { easing: 'sineIn' })
            .start();

        const edgeDefinitions = [
            { x: 0, y: boardSize / 2 + 10, width: boardSize * 0.68, height: 12 },
            { x: boardSize / 2 + 10, y: 0, width: 12, height: boardSize * 0.68 },
            { x: 0, y: -boardSize / 2 - 10, width: boardSize * 0.68, height: 12 },
            { x: -boardSize / 2 - 10, y: 0, width: 12, height: boardSize * 0.68 },
        ];
        edgeDefinitions.forEach((definition, index) => {
            const edge = new Node(`EdgeShimmer${index}`);
            edge.layer = this.node.layer;
            edge.setParent(effect);
            edge.setPosition(definition.x, definition.y, 0);
            edge.addComponent(UITransform).setContentSize(definition.width, definition.height);
            const edgeGraphics = edge.addComponent(Graphics);
            edgeGraphics.fillColor = colorWithAlpha(COLORS.paperLight, 235);
            edgeGraphics.roundRect(
                -definition.width / 2,
                -definition.height / 2,
                definition.width,
                definition.height,
                Math.min(definition.width, definition.height) / 2,
            );
            edgeGraphics.fill();
            const edgeOpacity = edge.addComponent(UIOpacity);
            edgeOpacity.opacity = 0;
            tween(edgeOpacity)
                .delay(index * 0.07)
                .to(0.16, { opacity: 220 }, { easing: 'sineOut' })
                .to(0.34, { opacity: 0 }, { easing: 'sineIn' })
                .start();
        });

        const sparkleRadius = boardSize / 2 + 34;
        const sparkleSize = clamp(boardSize * 0.055, 22, 34);
        const sparkleColors = [COLORS.paperLight, COLORS.woodLight, COLORS.teal] as const;
        for (let index = 0; index < 12; index += 1) {
            const angle = (Math.PI * 2 * index) / 12 + Math.PI / 12;
            this.createCompletionSparkle(
                effect,
                `Sparkle${index}`,
                Math.cos(angle) * sparkleRadius,
                Math.sin(angle) * sparkleRadius,
                sparkleSize * (index % 3 === 0 ? 1.2 : 0.78),
                sparkleColors[index % sparkleColors.length],
                0.08 + index * 0.035,
            );
        }

        const baseScale = board.scale.clone();
        Tween.stopAllByTarget(board);
        tween(board)
            .to(0.16, {
                scale: new Vec3(baseScale.x * 1.025, baseScale.y * 1.025, baseScale.z),
            }, { easing: 'backOut' })
            .to(0.34, { scale: baseScale }, { easing: 'sineInOut' })
            .start();
    }

    /**
     * 在棋盘内槽中显示完整裁剪图。节点追加在所有拼图块之后，
     * 因而是“替换”分块，而不是在分块之间再叠一层装饰。
     */
    private showCompletedBoardImage(animate: boolean): void {
        const board = this.boardNode;
        const metrics = this.layout;
        if (!board || !metrics || !this.imageTexture) {
            return;
        }

        const existing = this.completedBoardImageNode;
        if (existing?.isValid) {
            const opacity = existing.getComponent(UIOpacity);
            if (opacity && !animate) {
                opacity.opacity = 255;
            }
            this.completionImageRevealed = true;
            return;
        }

        const innerSize = metrics.boardSize * (1 - BOARD_INNER_INSET_RATIO * 2);
        const imageSize = Math.max(1, innerSize - TILE_EDGE_INSET * 2);
        const frame = this.createPreviewFrame();
        if (!frame) {
            return;
        }

        const image = new Node('CompletedBoardImage');
        image.layer = this.node.layer;
        image.setParent(board);
        image.addComponent(UITransform).setContentSize(imageSize, imageSize);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        this.completedBoardImageNode = image;
        this.completionImageRevealed = true;

        if (!animate) {
            return;
        }

        const opacity = image.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(COMPLETION_IMAGE_REVEAL_DURATION, { opacity: 255 }, { easing: 'sineOut' })
            .start();
    }

    private destroyCompletedBoardImage(): void {
        const image = this.completedBoardImageNode;
        if (!image) {
            return;
        }

        Tween.stopAllByTarget(image);
        const opacity = image.getComponent(UIOpacity);
        if (opacity) {
            Tween.stopAllByTarget(opacity);
        }
        const sprite = image.getComponent(Sprite);
        const frame = sprite?.spriteFrame;
        if (frame && this.transientFrames.delete(frame)) {
            frame.destroy();
        }
        if (image.isValid) {
            this.clearSpriteFrameReferences(image);
            image.destroy();
        }
        this.completedBoardImageNode = undefined;
    }

    private createCompletionSparkle(
        parent: Node,
        name: string,
        x: number,
        y: number,
        size: number,
        color: Color,
        delay: number,
    ): Node {
        const sparkle = new Node(name);
        sparkle.layer = this.node.layer;
        sparkle.setParent(parent);
        sparkle.setPosition(x, y, 0);
        sparkle.addComponent(UITransform).setContentSize(size, size);
        const graphics = sparkle.addComponent(Graphics);
        const half = size / 2;
        graphics.fillColor = colorWithAlpha(color, 245);
        graphics.moveTo(0, half);
        graphics.lineTo(half * 0.28, half * 0.28);
        graphics.lineTo(half, 0);
        graphics.lineTo(half * 0.28, -half * 0.28);
        graphics.lineTo(0, -half);
        graphics.lineTo(-half * 0.28, -half * 0.28);
        graphics.lineTo(-half, 0);
        graphics.lineTo(-half * 0.28, half * 0.28);
        graphics.close();
        graphics.fill();

        const opacity = sparkle.addComponent(UIOpacity);
        opacity.opacity = 0;
        sparkle.setScale(0.2, 0.2, 1);
        tween(sparkle)
            .delay(delay)
            .to(0.22, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'backOut' })
            .to(0.2, { scale: new Vec3(0.82, 0.82, 1) }, { easing: 'sineInOut' })
            .start();
        tween(opacity)
            .delay(delay)
            .to(0.12, { opacity: 255 }, { easing: 'sineOut' })
            .to(0.34, { opacity: 0 }, { easing: 'sineIn' })
            .start();
        return sparkle;
    }

    private destroyCompletionEffect(): void {
        const effect = this.completionEffectNode;
        if (!effect) {
            return;
        }

        const stopTweens = (node: Node): void => {
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) {
                Tween.stopAllByTarget(opacity);
            }
            node.children.forEach(stopTweens);
        };
        stopTweens(effect);
        if (effect.isValid) {
            effect.destroy();
        }
        this.completionEffectNode = undefined;
    }

    private showReferencePreview(): void {
        if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'completed') {
            return;
        }

        this.referenceReturnState = this.state;
        this.state = 'reference-preview';
        this.inputLocked = true;
        this.destroyOverlay();
        const overlay = this.createOverlay('SlidingPuzzleReferenceOverlay');
        const panelWidth = 640;
        const closeIconSize = 56;
        const closeButtonSize = Math.max(SLIDING_PUZZLE_TOUCH_SIZE, closeIconSize + 28);
        const panelHeight = this.getPopupHeight(
            closeButtonSize + REFERENCE_PREVIEW_TOP_GAP + REFERENCE_PREVIEW_SIZE,
        );
        const panel = this.createPopupPanel(overlay, 'ReferencePanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        const titleHeight = 52;
        const headerY = panelHeight / 2 - POPUP_CONTENT_PADDING_TOP - closeButtonSize / 2;
        const titleWidth = Math.max(
            1,
            this.getPopupContentWidth(panelWidth) - closeButtonSize - 40,
        );
        this.createLabel(
            panel,
            'ReferenceTitle',
            '参考图',
            0,
            headerY,
            34,
            COLORS.woodDark,
            titleWidth,
            titleHeight,
        );
        const previewY = panelHeight / 2
            - POPUP_CONTENT_PADDING_TOP
            - closeButtonSize
            - REFERENCE_PREVIEW_TOP_GAP
            - REFERENCE_PREVIEW_SIZE / 2;

        this.createIconButton(
            panel,
            'CloseReference',
            panelWidth / 2 - POPUP_CONTENT_PADDING_X - closeButtonSize / 2,
            headerY,
            'closeIcon',
            closeIconSize,
            () => this.hideReferencePreview(),
        );
        if (this.imageTexture) {
            this.createImagePreview(
                panel,
                0,
                previewY,
                REFERENCE_PREVIEW_SIZE,
                REFERENCE_PREVIEW_SIZE,
                '',
            );
        } else {
            this.createPlaceholderPreview(
                panel,
                0,
                previewY,
                REFERENCE_PREVIEW_SIZE,
                REFERENCE_PREVIEW_SIZE,
                '图片准备中',
            );
        }
    }

    private hideReferencePreview(): void {
        if (this.state !== 'reference-preview') {
            this.destroyOverlay();
            return;
        }

        this.destroyOverlay();
        this.state = this.referenceReturnState;
        this.inputLocked = this.state !== 'playing';
    }

    private createOverlay(name: string): Node {
        const overlay = new Node(name);
        overlay.layer = this.node.layer;
        overlay.setParent(this.node);
        const size = view.getVisibleSize();
        overlay.addComponent(UITransform).setContentSize(size.width, size.height);
        const graphics = overlay.addComponent(Graphics);
        graphics.fillColor = COLORS.overlay;
        graphics.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        graphics.fill();
        overlay.addComponent(BlockInputEvents);
        this.overlayNode = overlay;
        return overlay;
    }

    private createPanel(parent: Node, name: string, width: number, height: number, color: Color, radius: number): Node {
        const panel = new Node(name);
        panel.layer = this.node.layer;
        panel.setParent(parent);
        panel.addComponent(UITransform).setContentSize(width, height);
        const graphics = panel.addComponent(Graphics);
        graphics.fillColor = COLORS.shadow;
        graphics.roundRect(-width / 2 + 6, -height / 2 - 7, width, height, radius);
        graphics.fill();
        graphics.fillColor = color;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.lineWidth = 4;
        graphics.strokeColor = COLORS.woodDark;
        graphics.roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, Math.max(4, radius - 3));
        graphics.stroke();
        return panel;
    }

    private createPopupPanel(parent: Node, name: string, width: number, height: number): Node {
        // 弹窗容器只使用 PZ1 的九宫格背景图；不再在图片下面叠一层
        // Graphics 绘制的“假面板”，避免边框和图片边缘出现双层错位。
        const panel = new Node(name);
        panel.layer = this.node.layer;
        panel.setParent(parent);
        panel.addComponent(UITransform).setContentSize(width, height);
        const frame = this.visualFrames.get('popup');
        if (frame) {
            const artwork = new Node('PopupArtwork');
            artwork.layer = this.node.layer;
            artwork.setParent(panel);
            artwork.setSiblingIndex(0);
            artwork.addComponent(UITransform).setContentSize(width, height);
            const sprite = artwork.addComponent(Sprite);
            sprite.type = Sprite.Type.SLICED;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            frame.insetLeft = Math.min(POPUP_BACKGROUND_BORDER_INSET_X, frame.originalSize.width / 2 - 1);
            frame.insetRight = Math.min(POPUP_BACKGROUND_BORDER_INSET_X, frame.originalSize.width / 2 - 1);
            frame.insetTop = Math.min(POPUP_BACKGROUND_BORDER_INSET_Y, frame.originalSize.height / 2 - 1);
            frame.insetBottom = Math.min(POPUP_BACKGROUND_BORDER_INSET_Y, frame.originalSize.height / 2 - 1);
            sprite.spriteFrame = frame;
        }
        return panel;
    }

    private getPopupContentWidth(panelWidth: number, preferredWidth = 480): number {
        return Math.max(
            1,
            Math.min(preferredWidth, panelWidth - POPUP_CONTENT_PADDING_X * 2),
        );
    }

    private getPopupHeight(contentHeight: number): number {
        return Math.max(
            POPUP_CONTENT_PADDING_TOP + POPUP_CONTENT_PADDING_BOTTOM + 1,
            Math.ceil(contentHeight + POPUP_CONTENT_PADDING_TOP + POPUP_CONTENT_PADDING_BOTTOM),
        );
    }

    private getPopupCenterY(): number {
        const metrics = this.layout ?? this.getLayout();
        return metrics.safeContentCenterY + POPUP_LIFT;
    }

    private setPopupScale(panel: Node, designWidth: number, designHeight: number): void {
        const metrics = this.layout ?? this.getLayout();
        const availableHeight = Math.max(
            320,
            metrics.viewportHeight - metrics.topReserved - metrics.safeBottom - 96,
        );
        const availableWidth = Math.max(280, metrics.viewportWidth - 40);
        const scale = Math.max(
            0.5,
            Math.min(
                1,
                availableHeight / Math.max(1, designHeight),
                availableWidth / Math.max(1, designWidth),
            ),
        );
        panel.setScale(scale, scale, 1);
    }

    private createPlaceholderPreview(parent: Node, x: number, y: number, width: number, height: number, caption: string): Node {
        const preview = this.createPanel(parent, 'ImagePlaceholder', width, height, COLORS.paperLight, 20);
        preview.setPosition(x, y, 0);
        const graphics = preview.getComponent(Graphics)!;
        graphics.fillColor = colorWithAlpha(COLORS.teal, 90);
        graphics.rect(-width / 2 + 14, -height / 2 + 14, width - 28, height - 28);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = colorWithAlpha(COLORS.woodDark, 90);
        for (let index = -3; index <= 3; index += 1) {
            graphics.moveTo(-width / 2 + 18, index * 28);
            graphics.lineTo(width / 2 - 18, index * 28);
            graphics.stroke();
        }
        if (caption) {
            this.createLabel(preview, 'PlaceholderCaption', caption, 0, 0, 24, COLORS.ink, width - 34, 70);
        }
        return preview;
    }

    /**
     * 使用当前纹理创建真实图片预览。预览和棋盘切片共用同一份裁剪参数，
     * 因此确认裁剪后，棋盘看到的内容与预览保持一致。
     */
    private createImagePreview(
        parent: Node,
        x: number,
        y: number,
        width: number,
        height: number,
        caption: string,
        interactiveCrop = false,
    ): Node {
        const preview = this.createPanel(parent, 'ImagePreview', width, height, COLORS.paperLight, 20);
        preview.setPosition(x, y, 0);
        const imageSize = Math.max(
            1,
            Math.min(width, height) - (interactiveCrop ? CROP_PREVIEW_FRAME_GAP : 28),
        );
        const imageNode = new Node('Image');
        imageNode.layer = this.node.layer;
        imageNode.setParent(preview);
        imageNode.addComponent(UITransform).setContentSize(imageSize, imageSize);
        const sprite = imageNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const frame = this.createPreviewFrame();
        if (frame) {
            sprite.spriteFrame = frame;
        }

        const frameNode = new Node('CropFrame');
        frameNode.layer = this.node.layer;
        frameNode.setParent(preview);
        frameNode.addComponent(UITransform).setContentSize(imageSize, imageSize);
        const frameGraphics = frameNode.addComponent(Graphics);
        frameGraphics.lineWidth = interactiveCrop ? 5 : 3;
        frameGraphics.strokeColor = interactiveCrop ? COLORS.paperLight : colorWithAlpha(COLORS.woodDark, 120);
        frameGraphics.roundRect(-imageSize / 2 + 2, -imageSize / 2 + 2, imageSize - 4, imageSize - 4, 14);
        frameGraphics.stroke();

        if (caption) {
            this.createLabel(
                preview,
                'ImageCaption',
                caption,
                0,
                -height / 2 + 18,
                Math.min(18, Math.max(14, height * 0.11)),
                COLORS.ink,
                width - 28,
                28,
            );
        }

        if (interactiveCrop) {
            this.cropPreviewNode = preview;
            this.cropPreviewSprite = sprite;
            this.cropPreviewFrame = frame;
            preview.on(Node.EventType.TOUCH_START, this.handleCropTouchStart, this);
            preview.on(Node.EventType.TOUCH_MOVE, this.handleCropTouchMove, this);
            preview.on(Node.EventType.TOUCH_END, this.handleCropTouchEnd, this);
            preview.on(Node.EventType.TOUCH_CANCEL, this.handleCropTouchCancel, this);
            preview.on(Node.EventType.MOUSE_WHEEL, this.handleCropMouseWheel, this);
        }
        return preview;
    }

    private createPreviewFrame(): SpriteFrame | undefined {
        const texture = this.getPreviewTexture();
        if (!texture) {
            return undefined;
        }

        const frame = new SpriteFrame();
        const rect = this.getCropRect(texture, this.getActiveCrop());
        frame.texture = texture;
        frame.rect = rect;
        frame.originalSize = new Size(rect.width, rect.height);
        this.transientFrames.add(frame);
        return frame;
    }

    private refreshCropPreview(): void {
        if (!this.cropPreviewSprite || !this.getPreviewTexture()) {
            return;
        }

        const previousFrame = this.cropPreviewFrame;
        const nextFrame = this.createPreviewFrame();
        if (!nextFrame) {
            return;
        }

        this.cropPreviewFrame = nextFrame;
        this.cropPreviewSprite.spriteFrame = nextFrame;
        if (previousFrame && previousFrame !== nextFrame) {
            this.transientFrames.delete(previousFrame);
            previousFrame.destroy();
        }
    }

    private readonly handleCropTouchStart = (event: EventTouch): void => {
        if (this.state !== 'crop-editing' || this.inputLocked) {
            return;
        }

        const touchId = event.getID();
        if (touchId === null) {
            return;
        }
        this.cropActiveTouchIds.add(touchId);

        const touches = this.getCropTouchPair(event);
        if (touches) {
            this.beginCropPinch(touches[0], touches[1]);
            return;
        }

        const location = event.getUILocation();
        this.cropLastX = location.x;
        this.cropLastY = location.y;
    };

    private readonly handleCropTouchMove = (event: EventTouch): void => {
        if (this.state !== 'crop-editing' || this.inputLocked || !this.cropPreviewNode) {
            return;
        }

        const previewTransform = this.cropPreviewNode.getComponent(UITransform);
        const previewWidth = Math.max(1, previewTransform?.width ?? 1);
        const texture = this.getPreviewTexture();
        const touches = this.getCropTouchPair(event);
        if (touches) {
            const nextDistance = this.getTouchDistance(touches[0], touches[1]);
            const center = this.getTouchCenter(touches[0], touches[1]);
            const firstId = touches[0].getID();
            const secondId = touches[1].getID();
            const pinchIds = this.cropPinchTouchIds;
            if (!pinchIds
                || !((pinchIds[0] === firstId && pinchIds[1] === secondId)
                    || (pinchIds[0] === secondId && pinchIds[1] === firstId))) {
                this.beginCropPinch(touches[0], touches[1]);
                return;
            }

            const previousCrop = this.cropController.currentCrop;
            const previousDistance = this.cropPinchDistance;
            if (texture && previousDistance > PREVIEW_PAN_EPSILON) {
                const previousCenter = {
                    x: this.cropPinchCenterX,
                    y: this.cropPinchCenterY,
                };
                const zoomDelta = previousCrop.scale
                    * (nextDistance / previousDistance - 1);
                if (Math.abs(zoomDelta) >= PREVIEW_PAN_EPSILON) {
                    // 以双指中心的上一帧位置为锚点，再处理中心位移，
                    // 这样缩放比例和双指平移可以连续组合，不会因中心漂移跳图。
                    const anchor = this.getCropAnchor(previousCenter);
                    this.cropController.zoomAt(
                        zoomDelta,
                        anchor.x,
                        anchor.y,
                        texture.width,
                        texture.height,
                    );
                }

                const centerDeltaX = center.x - previousCenter.x;
                const centerDeltaY = center.y - previousCenter.y;
                if (Math.abs(centerDeltaX) >= PREVIEW_PAN_EPSILON
                    || Math.abs(centerDeltaY) >= PREVIEW_PAN_EPSILON) {
                    this.cropController.panByViewportDelta(
                        centerDeltaX,
                        centerDeltaY,
                        previewWidth,
                        texture.width,
                        texture.height,
                    );
                }

                const nextCrop = this.cropController.currentCrop;
                if (nextCrop.scale !== previousCrop.scale
                    || nextCrop.offsetX !== previousCrop.offsetX
                    || nextCrop.offsetY !== previousCrop.offsetY) {
                    this.refreshCropPreview();
                }
            }

            this.cropPinchDistance = nextDistance;
            this.cropPinchCenterX = center.x;
            this.cropPinchCenterY = center.y;
            return;
        }

        // 两指状态丢失时等待 TOUCH_END/CANCEL 重建单指基准，
        // 不能把这一帧当成从坐标原点开始的单指拖动。
        if (this.cropPinchTouchIds) {
            return;
        }

        const location = event.getUILocation();

        const deltaX = (location.x - this.cropLastX) / previewWidth;
        const deltaY = (location.y - this.cropLastY) / previewWidth;
        if (Math.abs(deltaX) < PREVIEW_PAN_EPSILON && Math.abs(deltaY) < PREVIEW_PAN_EPSILON) {
            return;
        }

        this.cropLastX = location.x;
        this.cropLastY = location.y;
        // X 轴的取景窗口偏移与图片视觉方向相反；Y 轴则已处于 Cocos UI
        // 坐标系，触摸位置向上增加，因此只反转 X 轴即可让图片跟手移动。
        this.cropController.pan(-deltaX, deltaY);
        this.refreshCropPreview();
    };

    private readonly handleCropTouchEnd = (event: EventTouch): void => {
        const touchId = event.getID();
        if (touchId !== null) {
            this.cropActiveTouchIds.delete(touchId);
        }

        this.cropPinchTouchIds = undefined;
        this.cropPinchDistance = 0;
        const remainingTouch = this.getRemainingCropTouch(event);
        if (remainingTouch) {
            const location = remainingTouch.getUILocation();
            this.cropLastX = location.x;
            this.cropLastY = location.y;
            return;
        }

        this.cropLastX = 0;
        this.cropLastY = 0;
        this.cropActiveTouchIds.clear();
    };

    private readonly handleCropTouchCancel = (): void => {
        this.resetCropGestureState();
    };

    private readonly handleCropMouseWheel = (event: EventMouse): void => {
        if (this.state !== 'crop-editing' || this.inputLocked) {
            return;
        }

        const scrollY = event.getScrollY();
        if (Math.abs(scrollY) < PREVIEW_PAN_EPSILON) {
            return;
        }
        const location = event.getUILocation();
        const anchor = this.getCropAnchor(location);
        this.zoomCropAt(scrollY > 0 ? 0.12 : -0.12, anchor.x, anchor.y);
    };

    private zoomCropAt(delta: number, anchorX: number, anchorY: number): void {
        const texture = this.getPreviewTexture();
        if (!texture) {
            return;
        }

        const previousScale = this.cropController.currentCrop.scale;
        this.cropController.zoomAt(delta, anchorX, anchorY, texture.width, texture.height);
        if (this.cropController.currentCrop.scale !== previousScale) {
            this.refreshCropPreview();
        }
    }

    private getCropAnchor(location: { readonly x: number; readonly y: number }): { x: number; y: number } {
        const transform = this.cropPreviewNode?.getComponent(UITransform);
        const local = transform?.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
        const previewSize = Math.max(1, Math.min(transform?.width ?? 1, transform?.height ?? 1));
        const imageSize = Math.max(1, previewSize - CROP_PREVIEW_FRAME_GAP);
        return {
            x: clamp((local?.x ?? 0) / imageSize, -0.5, 0.5),
            y: clamp((local?.y ?? 0) / imageSize, -0.5, 0.5),
        };
    }

    private getTouchDistance(first: { getUILocation: () => { x: number; y: number } }, second: { getUILocation: () => { x: number; y: number } }): number {
        const firstLocation = first.getUILocation();
        const secondLocation = second.getUILocation();
        return Math.hypot(
            secondLocation.x - firstLocation.x,
            secondLocation.y - firstLocation.y,
        );
    }

    private getTouchCenter(first: { getUILocation: () => { x: number; y: number } }, second: { getUILocation: () => { x: number; y: number } }): { x: number; y: number } {
        const firstLocation = first.getUILocation();
        const secondLocation = second.getUILocation();
        return {
            x: (firstLocation.x + secondLocation.x) / 2,
            y: (firstLocation.y + secondLocation.y) / 2,
        };
    }

    private getCropTouchPair(event: EventTouch): readonly [Touch, Touch] | undefined {
        const touches = event.getAllTouches().filter((touch) => {
            return this.cropActiveTouchIds.has(touch.getID());
        });
        if (touches.length < 2) {
            return undefined;
        }

        if (this.cropPinchTouchIds) {
            const first = touches.find((touch) => touch.getID() === this.cropPinchTouchIds![0]);
            const second = touches.find((touch) => touch.getID() === this.cropPinchTouchIds![1]);
            if (first && second) {
                return [first, second];
            }
        }

        return [touches[0], touches[1]];
    }

    private getRemainingCropTouch(event: EventTouch): Touch | undefined {
        return event.getAllTouches().find((touch) => this.cropActiveTouchIds.has(touch.getID()));
    }

    private beginCropPinch(first: Touch, second: Touch): void {
        const center = this.getTouchCenter(first, second);
        this.cropPinchTouchIds = [first.getID(), second.getID()];
        this.cropPinchDistance = this.getTouchDistance(first, second);
        this.cropPinchCenterX = center.x;
        this.cropPinchCenterY = center.y;
        this.cropLastX = center.x;
        this.cropLastY = center.y;
    }

    private resetCropGestureState(): void {
        this.cropActiveTouchIds.clear();
        this.cropPinchTouchIds = undefined;
        this.cropLastX = 0;
        this.cropLastY = 0;
        this.cropPinchDistance = 0;
        this.cropPinchCenterX = 0;
        this.cropPinchCenterY = 0;
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        color: Color,
        onClick: () => void,
        fontSize?: number,
    ): Node {
        const button = this.createPanel(parent, name, width, height, color, 16);
        button.getComponent(UITransform)?.setContentSize(
            Math.max(width, SLIDING_PUZZLE_TOUCH_SIZE),
            Math.max(height, SLIDING_PUZZLE_TOUCH_SIZE),
        );
        button.setPosition(x, y, 0);
        const label = this.createLabel(
            button,
            'Label',
            text,
            0,
            0,
            fontSize ?? Math.min(26, height * 0.3),
            COLORS.paperLight,
            width - 12,
            height - 10,
        );
        const iconKey = BUTTON_ICON_ASSET_KEYS[name];
        const iconFrame = iconKey ? this.visualFrames.get(iconKey) : undefined;
        if (iconFrame) {
            const iconSize = Math.min(62, height - 16);
            const iconNode = new Node('Icon');
            iconNode.layer = this.node.layer;
            iconNode.setParent(button);
            iconNode.setPosition(width <= 160 ? 0 : -width / 2 + iconSize / 2 + 16, 0, 0);
            iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
            const iconSprite = iconNode.addComponent(Sprite);
            iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            iconSprite.spriteFrame = iconFrame;

            if (width <= 160) {
                label.node.active = false;
            } else {
                const labelWidth = width - iconSize - 36;
                const labelTransform = label.node.getComponent(UITransform);
                label.node.setPosition(
                    -width / 2 + iconSize + 18 + labelWidth / 2,
                    0,
                    0,
                );
                labelTransform?.setContentSize(labelWidth, height - 10);
            }
        }
        this.bindButtonInteraction(button, onClick);
        return button;
    }

    private createIconButton(
        parent: Node,
        name: string,
        x: number,
        y: number,
        iconKey: SlidingPuzzleVisualKey,
        iconSize: number,
        onClick: () => void,
    ): Node {
        const button = new Node(name);
        button.layer = this.node.layer;
        button.setParent(parent);
        const hitSize = Math.max(SLIDING_PUZZLE_TOUCH_SIZE, iconSize + 28);
        button.addComponent(UITransform).setContentSize(hitSize, hitSize);
        button.setPosition(x, y, 0);

        const frame = this.visualFrames.get(iconKey);
        if (frame) {
            const icon = new Node('Icon');
            icon.layer = this.node.layer;
            icon.setParent(button);
            icon.addComponent(UITransform).setContentSize(iconSize, iconSize);
            const sprite = icon.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
        }

        this.bindButtonInteraction(button, onClick);
        return button;
    }

    private bindButtonInteraction(button: Node, onClick: () => void): void {
        const baseX = button.position.x;
        const baseY = button.position.y;
        const baseScaleX = button.scale.x;
        const baseScaleY = button.scale.y;
        let touchEndedAt = 0;
        const press = (): void => {
            if (!button.isValid) {
                return;
            }
            button.setScale(baseScaleX * BUTTON_PRESS_SCALE, baseScaleY * BUTTON_PRESS_SCALE, 1);
            button.setPosition(baseX, baseY - BUTTON_PRESS_OFFSET, 0);
        };
        const release = (): void => {
            if (!button.isValid) {
                return;
            }
            button.setScale(baseScaleX, baseScaleY, 1);
            button.setPosition(baseX, baseY, 0);
        };
        button.on(Node.EventType.TOUCH_START, press, this);
        button.on(Node.EventType.TOUCH_CANCEL, () => {
            touchEndedAt = Date.now();
            this.syntheticMouseEventsBlockedUntil = Math.max(
                this.syntheticMouseEventsBlockedUntil,
                touchEndedAt + 500,
            );
            release();
        }, this);
        button.on(Node.EventType.TOUCH_END, () => {
            touchEndedAt = Date.now();
            this.syntheticMouseEventsBlockedUntil = Math.max(
                this.syntheticMouseEventsBlockedUntil,
                touchEndedAt + 500,
            );
            release();
            onClick();
        }, this);
        // 浏览器/桌面预览有时只派发鼠标事件；补上同一套交互，且短时间内
        // 忽略触摸后跟随的合成 mouse 事件，避免页面重建后新按钮被同一次
        // 点击命中（例如裁剪页“取消”后直接触发“开始拼图”）。
        button.on(Node.EventType.MOUSE_DOWN, () => {
            if (Date.now() < this.syntheticMouseEventsBlockedUntil) {
                return;
            }
            press();
        }, this);
        button.on(Node.EventType.MOUSE_UP, () => {
            const now = Date.now();
            if (now < this.syntheticMouseEventsBlockedUntil
                || now - touchEndedAt < 500) {
                release();
                return;
            }
            release();
            onClick();
        }, this);
    }

    private runUiAction(label: string, action: () => Promise<void>): void {
        if (this.uiActionPending || this.state === 'disposed') {
            return;
        }

        this.uiActionPending = true;
        // 延迟到当前触摸/鼠标事件完成后再切换场景、销毁弹窗或重建动态节点，
        // 避免 Cocos 在事件传播期间重排节点导致偶发的点击无效。
        void Promise.resolve()
            .then(action)
            .then(
                () => {
                    if (this.state !== 'disposed') {
                        this.uiActionPending = false;
                    }
                },
                (error: unknown) => {
                    console.error(`[SlidingPuzzleGame] ${label} action failed.`, error);
                    if (this.state !== 'disposed') {
                        this.uiActionPending = false;
                    }
                },
            );
    }

    private requestLobbyFromSetup(): void {
        if (this.uiActionPending || this.state === 'disposed' || !this.context) {
            return;
        }

        this.uiActionPending = true;
        this.inputLocked = true;
        try {
            this.context.requestLobby(Object.freeze({
                score: 0,
                duration: 0,
                completed: false,
                extra: Object.freeze({ reason: 'setup_lobby' }),
            }));
            // requestLobby 是跨运行层的 fire-and-forget 契约；成功时组件会被
            // dispose，失败时给开始页一个可恢复的重试窗口，避免按钮永久锁死。
            this.scheduleOnce(() => {
                if (this.state !== 'disposed' && this.state === 'setup') {
                    this.uiActionPending = false;
                    this.inputLocked = false;
                }
            }, 1.5);
        } catch (error: unknown) {
            console.error('[SlidingPuzzleGame] Failed to return to lobby from setup.', error);
            this.uiActionPending = false;
            this.inputLocked = false;
        }
    }

    private getRandomPresetIndex(): number {
        const count = SLIDING_PUZZLE_PRESET_ASSET_PATHS.length;
        if (count <= 1) {
            return 0;
        }

        let next = this.selectedPresetIndex;
        while (next === this.selectedPresetIndex) {
            next = Math.floor(Math.random() * count);
        }
        return next;
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
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.35);
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        return label;
    }

    private refreshHud(): void {
        if (this.timerLabel) {
            this.timerLabel.string = `用时 ${this.formatDuration(this.elapsedSeconds)}`;
        }
        if (this.movesLabel) {
            this.movesLabel.string = `步数 ${this.padThree(this.model.moves)}`;
        }
    }

    private getLayout(): SlidingPuzzleLayoutMetrics {
        const size = view.getVisibleSize();
        return calculateSlidingPuzzleLayout(
            size.width,
            size.height,
            this.context?.services.platform.getLayoutInfo(),
            this.selectedSize,
        );
    }

    private formatDuration(seconds: number): string {
        const total = Math.max(0, Math.floor(seconds));
        const minutes = this.padTwo(Math.floor(total / 60));
        const remaining = this.padTwo(total % 60);
        return `${minutes}:${remaining}`;
    }

    private padTwo(value: number): string {
        const text = Math.max(0, Math.floor(value)).toString();
        return text.length >= 2 ? text : `0${text}`;
    }

    private padThree(value: number): string {
        const text = Math.max(0, Math.floor(value)).toString();
        return text.length >= 3 ? text : `${'0'.repeat(3 - text.length)}${text}`;
    }

    private drawBackground(graphics: Graphics, width: number, height: number): void {
        graphics.clear();
        graphics.fillColor = COLORS.woodDark;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
        graphics.fillColor = new Color(125, 78, 45, 255);
        graphics.rect(-width / 2, -height / 2, width, height * 0.58);
        graphics.fill();
        graphics.fillColor = colorWithAlpha(COLORS.woodLight, 36);
        for (let index = -6; index <= 6; index += 1) {
            const y = index * 112;
            graphics.rect(-width / 2, y, width, 20);
            graphics.fill();
        }
        graphics.fillColor = colorWithAlpha(COLORS.paper, 12);
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }

    private readonly handleCanvasResize = (): void => {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready') {
            return;
        }

        const previousState = this.state;
        const pauseModel = this.activePauseModel;
        const resultModel = this.activeResultModel;
        const referenceReturnState = this.referenceReturnState;
        this.destroyOverlay();
        this.buildBackground();

        if (previousState === 'setup') {
            this.showSetup();
            return;
        }
        if (previousState === 'crop-editing') {
            this.showCropEditor();
            return;
        }

        if (previousState === 'reference-preview') {
            this.state = referenceReturnState;
        }
        this.showPlay();
        if (previousState === 'paused' && pauseModel) {
            this.showPauseMenu(pauseModel);
        } else if (previousState === 'completed' && resultModel) {
            this.showResultView(resultModel);
        } else if (previousState === 'completed' && this.completionTransitionPending) {
            // 结算请求尚在闪耀过渡期间时，重建棋盘后恢复一次同样的效果。
            this.showCompletionEffect();
        } else if (previousState === 'reference-preview') {
            this.showReferencePreview();
        }
    };

    private destroyDynamicView(): void {
        this.boardNode?.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.boardNode?.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.boardNode?.off(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.resetTouchState();
        this.tileIndexByNode.clear();
        this.cropPreviewNode?.off(Node.EventType.TOUCH_START, this.handleCropTouchStart, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_MOVE, this.handleCropTouchMove, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_END, this.handleCropTouchEnd, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_CANCEL, this.handleCropTouchCancel, this);
        this.cropPreviewNode?.off(Node.EventType.MOUSE_WHEEL, this.handleCropMouseWheel, this);
        this.destroyCompletionEffect();
        this.destroyCompletedBoardImage();
        this.clearSpriteFrameReferences(this.dynamicNode);
        this.destroyTransientFrames();
        this.boardNode = undefined;
        this.pauseButtonNode = undefined;
        this.cropPreviewNode = undefined;
        this.cropPreviewSprite = undefined;
        this.resetCropGestureState();
        this.timerLabel = undefined;
        this.movesLabel = undefined;
        const dynamicNode = this.dynamicNode;
        this.dynamicNode = undefined;
        if (dynamicNode?.isValid) {
            // Cocos 的 destroy 会延迟到帧末执行；先停用节点，避免本帧的
            // Batcher2D 仍提交已经准备释放的 Sprite/纹理。
            dynamicNode.active = false;
            dynamicNode.destroy();
        }
    }

    private destroyOverlay(): void {
        if (this.overlayNode?.isValid) {
            this.clearSpriteFrameReferences(this.overlayNode);
            this.overlayNode.active = false;
            this.overlayNode.destroy();
        }
        this.overlayNode = undefined;
    }

    private clearSpriteFrameReferences(node?: Node): void {
        if (!node?.isValid) {
            return;
        }

        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.spriteFrame = null;
        }
        node.children.slice().forEach((child) => this.clearSpriteFrameReferences(child));
    }
}
