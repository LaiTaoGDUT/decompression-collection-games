import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { setLabelBold } from '../../../services/font/FontBinding';
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
import type { Touch } from 'cc';
import type { Platform } from '../../../platform/Platform';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { AssetService } from '../../../services/asset/AssetService';
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import type { GameResult, LocalImageSelection } from '../../../core/types/CommonTypes';
import { SlidingPuzzleCropController } from './SlidingPuzzleCropController';
import { SlidingPuzzleModel } from './SlidingPuzzleModel';
import {
    calculateSlidingPuzzleBackgroundCover,
    calculateSlidingPuzzleLayout,
    calculateSlidingPuzzleSetupStack,
    calculateSlidingPuzzleTileSourceRect,
    SLIDING_PUZZLE_DISPLAY_SWITCH_HEIGHT,
    SLIDING_PUZZLE_DISPLAY_SWITCH_WIDTH,
    SLIDING_PUZZLE_FOOTER_BUTTON_HEIGHT,
    SLIDING_PUZZLE_HUD_HEIGHT,
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
/** PZ1「暖木纸卡」声音：音乐与音效都归本 Bundle 所有，生成脚本见 tools/audio/sliding-puzzle。 */
const SLIDING_PUZZLE_AUDIO = Object.freeze({
    music: 'visual/audio/sp-wooden-toy-loop-v1',
    cues: Object.freeze({
        uiButton: 'visual/audio/sp-ui-button-v1',
        toggle: 'visual/audio/sp-ui-select-v1',
        // 高频操作：三条真实木敲轮换，避免重复疲劳。
        drop: Object.freeze(['visual/audio/sp-piece-move-1-v1', 'visual/audio/sp-piece-move-2-v1', 'visual/audio/sp-piece-move-3-v1']),
        collision: 'visual/audio/sp-invalid-v1',
        popup: 'visual/audio/sp-preview-v1',
        milestone: 'visual/audio/sp-complete-v1',
    }),
});

type SlidingPuzzleState =
    | 'idle'
    | 'ready'
    | 'setup'
    | 'preset-library'
    | 'picking-image'
    | 'crop-editing'
    | 'starting'
    | 'playing'
    | 'paused'
    | 'reference-preview'
    | 'completed'
    | 'disposed';

export interface SlidingPuzzleServices {
    readonly assets: AssetService;
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
const MAX_LOCAL_IMAGE_PIXEL_SIZE = 1024;
const LOCAL_IMAGE_JPEG_QUALITY = 0.92;
const MAX_LOCAL_PUZZLE_HISTORY = 10;
const SLIDING_PUZZLE_DATA_VERSION = 2;
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
const POPUP_PRIMARY_BUTTON_FONT_SIZE = 32;
const POPUP_TITLE_FONT_SIZE = 40;
const POPUP_TITLE_HEIGHT = 64;
const POPUP_PRIMARY_BUTTON_HEIGHT = 96;
const POPUP_BUTTON_HEIGHT = 84;
const POPUP_BUTTON_GAP = 16;
const POPUP_CLOSE_ICON_SIZE = 52;
// 结算页完成图只做回顾，控制尺寸让弹窗整体保持紧凑。
const RESULT_PREVIEW_SIZE = 320;
// 参考图直接铺在遮罩上，不再套弹窗木框；图片与棋盘同宽，左右至少各留 32。
const REFERENCE_PREVIEW_SIDE_MARGIN = 32;
const REFERENCE_PREVIEW_TITLE_GAP = 20;
const REFERENCE_PREVIEW_VERTICAL_MARGIN = 48;
const CROP_PREVIEW_MAX_SIZE = 560;
const CROP_PREVIEW_MIN_SIZE = 240;
const SETUP_BACK_ICON_SIZE = 68;
const SETUP_TITLE_FONT_SIZE = 42;
const CROP_TITLE_FONT_SIZE = 42;
const CROP_HINT_FONT_SIZE = 26;
const SETUP_SIZE_BUTTON_FONT_SIZE = 30;
const SETUP_COMPACT_SIZE_BUTTON_FONT_SIZE = 28;
const SETUP_ROW_GAP = 12;
const SETUP_HINT_FONT_SIZE = 22;
const SETUP_SECTION_CAPTION_FONT_SIZE = 26;
const SETUP_SOURCE_ACTION_FONT_SIZE = 26;
const SETUP_SOURCE_ACTION_CONTENT_GAP = 8;
const SETUP_SOURCE_ACTION_SUBTITLE_FONT_SIZE = 17;
const SETUP_START_BUTTON_FONT_SIZE = 36;
const SETUP_START_BUTTON_MAX_WIDTH = 480;
const PLAY_HUD_CAPTION_FONT_SIZE = 20;
const PLAY_HUD_VALUE_FONT_SIZE = 34;
const PLAY_SIDE_ICON_SIZE = 70;
const DISPLAY_MODE_SWITCH_WIDTH = SLIDING_PUZZLE_DISPLAY_SWITCH_WIDTH;
const DISPLAY_MODE_SWITCH_HEIGHT = SLIDING_PUZZLE_DISPLAY_SWITCH_HEIGHT;
const TILE_NUMBER_OVERLAY_ALPHA = 120;
const IMAGE_PREVIEW_CORNER_RADIUS = 8;
const PRESET_LIBRARY_CARD_CORNER_RADIUS = 12;
const PRESET_SELECTED_ICON_SIZE = 64;
const PRESET_SELECTED_ICON_EDGE_INSET = 16;
// 裁切预览的外框只保留极窄边缘；图片不再被 28px 的通用预览内缩挤小。
const CROP_PREVIEW_FRAME_GAP = 12;
// 棋盘背景素材为 512×512，实际木框内槽从约 32px 处开始。
// 用素材比例计算，确保不同屏幕尺寸下拼图外沿仍与内槽边界对齐。
const BOARD_INNER_INSET_RATIO = 32 / 512;

function getBoardTileAreaSize(boardSize: number): number {
    return Math.max(1, boardSize * (1 - BOARD_INNER_INSET_RATIO * 2) - TILE_EDGE_INSET * 2);
}

export const SLIDING_PUZZLE_BACKGROUND_ASSET_PATH =
    'visual/backgrounds/sliding-puzzle-background-v1/texture';

export const SLIDING_PUZZLE_BOARD_ASSET_PATH =
    'visual/boards/sliding-puzzle-board-v1/texture';

const SLIDING_PUZZLE_PRESET_ASSET_PATHS: readonly string[] = Object.freeze([
    // 当前仓库已实际交付的预置图；后续新增图片进入 Bundle 后只需在这里登记。
    'visual/presets/preset-10-window-cats-v2/texture',
    'visual/presets/preset-12-anime-mage-v2/texture',
    'visual/presets/preset-13-greenhouse-v1/texture',
    'visual/presets/preset-14-space-observatory-v1/texture',
    'visual/presets/preset-15-rainy-tram-v1/texture',
    'visual/presets/preset-16-anime-violinist-v1/texture',
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
    displayModeOriginal: 'visual/ui/pz1-display-mode-original-v1/texture',
    displayModeNumber: 'visual/ui/pz1-display-mode-number-v1/texture',
    backIcon: 'visual/icons/pz1-back-v1/texture',
    pauseIcon: 'visual/icons/pz1-pause-v1/texture',
    cropIcon: 'visual/icons/pz1-crop-v1/texture',
    referenceIcon: 'visual/icons/pz1-reference-v1/texture',
    randomIcon: 'visual/icons/pz1-random-v1/texture',
    libraryIcon: 'visual/icons/pz1-library-v1/texture',
    albumIcon: 'visual/icons/pz1-album-v1/texture',
    selectedIcon: 'visual/icons/pz1-selected-v1/texture',
    closeIcon: 'visual/icons/pz1-close-v1/texture',
});

type SlidingPuzzleVisualKey = keyof typeof SLIDING_PUZZLE_VISUAL_ASSET_PATHS;

const BUTTON_ICON_ASSET_KEYS: Readonly<Record<string, SlidingPuzzleVisualKey>> = Object.freeze({
    ReferenceButton: 'referenceIcon',
    PauseButton: 'pauseIcon',
    PresetButton: 'randomIcon',
    PresetLibraryButton: 'libraryIcon',
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

function isRecordValue(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface PresetLibraryTexture {
    readonly kind: 'preset' | 'local';
    readonly path: string;
    readonly id?: string;
    readonly texture?: Texture2D;
    readonly imageAsset?: ImageAsset;
    /** 当前预览纹理由主图片状态持有，图库关闭时不能重复释放。 */
    readonly releaseOnClose: boolean;
}

interface LocalPuzzleRecord {
    readonly id: string;
    readonly path: string;
    readonly width: number;
    readonly height: number;
    readonly createdAt: number;
    readonly lastPlayedAt: number;
}

interface PuzzleLibrarySource {
    readonly kind: 'preset' | 'local';
    readonly path: string;
    readonly id?: string;
    readonly lastPlayedAt: number;
    readonly originalIndex: number;
    readonly selected: boolean;
}

function puzzleLibrarySourceKey(source: PuzzleLibrarySource): string {
    return source.kind === 'preset' ? `preset:${source.path}` : `local:${source.id ?? source.path}`;
}

interface SlidingPuzzleSavedImage {
    readonly kind: 'preset' | 'local';
    readonly id?: string;
    readonly path?: string;
}

interface SlidingPuzzleActiveRound {
    readonly version: 1;
    readonly inProgress: true;
    readonly boardSize: SlidingPuzzleBoardSize;
    readonly board: readonly number[];
    readonly emptyIndex: number;
    readonly moves: number;
    readonly elapsedSeconds: number;
    readonly showTileNumbers: boolean;
    readonly image: SlidingPuzzleSavedImage;
    readonly updatedAt: number;
}

/**
 * 复古木质拼图的独立入口。
 * 图片加载、裁剪和切片链路已接通；木纹、棋盘、弹窗和按钮素材从独立 Bundle 动态加载，缺失时保留程序化回退。
 */
@ccclass('SlidingPuzzleGame')
export class SlidingPuzzleGame extends Component implements MiniGame<SlidingPuzzleServices> {
    private state: SlidingPuzzleState = 'idle';
    private audioBank?: BundleAudioBank;
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
    /** 随机换图按洗牌队列逐张取；图片库变化时开始新一轮。 */
    private randomPuzzleQueue: PuzzleLibrarySource[] = [];
    private randomPuzzleSourceKeys: string[] = [];
    private elapsedSeconds = 0;
    private inputLocked = false;
    private completionRequested = false;
    private completionTransitionPending = false;
    /** 是否在每块拼图上显示半透明蒙层和原始序号。 */
    private showTileNumbers = false;
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
    private displayModeSwitchNode?: Node;
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
    private localImageSelection?: LocalImageSelection;
    private localPuzzleRecordId?: string;
    /** 当前纹理对应的预置图路径；换图加载期间旧图仍保持可见。 */
    private loadedPresetAssetPath?: string;
    /** 预置图异步加载中的目标路径，用于使连续点击正确失效旧请求。 */
    private pendingImageTexture?: Texture2D;
    private pendingImageAsset?: ImageAsset;
    private pendingImageTextureOwned = false;
    private imageLoadToken = 0;
    private readonly visualFrames = new Map<SlidingPuzzleVisualKey, SpriteFrame>();
    private visualLoadToken = 0;
    private presetLibraryLoadToken = 0;
    private presetLibraryTextures: PresetLibraryTexture[] = [];
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
    private savedProgressDiscarded = false;
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
            } else if (this.state === 'paused' || this.state === 'reference-preview') {
                this.persistProgress();
                try {
                    context.services.storage.flush();
                } catch (error: unknown) {
                    // TODO: console.warn('[SlidingPuzzleGame] Failed to flush progress while hiding.', error);
                }
            }
        });
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.resizeListening = true;
        this.buildBackground();
        // 与其他小游戏保持一致：initialize 完成前必须让正式视觉资源加载
        // 落定，不能把它留成无人等待的后台任务后先进入可交互页面。
        const visualLoad = this.trackAssetLoad(this.loadVisualAssets());
        if (!await this.restoreActiveRound()) {
            this.showSetup();
            void this.trackAssetLoad(this.loadPresetImage(true));
        }
        try {
            await visualLoad;
        } catch (error: unknown) {
            // 正式素材异常时保留程序化界面，但必须留下明确诊断，不能静默。
            // TODO: console.error('[SlidingPuzzleGame] Visual initialization failed.', error);
        }
        await this.initializeAudio(context);
    }

    /** 资源 Bundle 已由 loadVisualAssets 加载；音频失败只影响声音，不阻塞进入游戏。 */
    private async initializeAudio(context: MiniGameContext<SlidingPuzzleServices>): Promise<void> {
        if (this.state === 'disposed' || !assetManager.getBundle(SLIDING_PUZZLE_RESOURCE_BUNDLE)) return;
        this.audioBank = new BundleAudioBank({
            bundle: SLIDING_PUZZLE_RESOURCE_BUNDLE,
            music: SLIDING_PUZZLE_AUDIO.music,
            cues: SLIDING_PUZZLE_AUDIO.cues,
        }, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize().catch((error: unknown) => {
            // TODO: console.error('[SlidingPuzzleGame] Audio initialization failed.', error);
        });
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

    pause(): boolean {
        if (this.state !== 'playing') {
            return false;
        }

        this.state = 'paused';
        this.inputLocked = true;
        this.pauseButtonNode && (this.pauseButtonNode.active = false);
        this.persistProgress();
        this.context?.services.audio.pauseMusic();
        return true;
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
        this.context?.services.audio.resumeMusic();
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
        this.discardSavedProgress();
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
        this.savedProgressDiscarded = true;
        this.writeActiveRound(undefined);
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

        if (!this.savedProgressDiscarded
            && (this.state === 'playing'
                || this.state === 'paused'
                || this.state === 'reference-preview')) {
            this.persistProgress();
        }

        // 先把状态切到 disposed，令所有晚到的异步回调进入清理分支，
        // 再等待它们结束，避免回调和 Bundle release 并发操作同一份纹理。
        this.state = 'disposed';
        this.context?.services.platform.cancelLocalImagePicker();
        this.imageLoadToken += 1;
        this.visualLoadToken += 1;
        this.presetLibraryLoadToken += 1;
        this.uiActionPending = true;
        this.randomPuzzleQueue = [];
        this.randomPuzzleSourceKeys = [];

        this.unsubscribeShow?.();
        this.unsubscribeHide?.();
        this.unsubscribeShow = undefined;
        this.unsubscribeHide = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
        this.unscheduleAllCallbacks();
        this.clearSpriteFrameReferences(this.node);
        this.destroyOverlay();
        this.destroyDynamicView();
        this.releasePresetLibraryTextures();
        if (this.backgroundNode?.isValid) {
            this.backgroundNode.destroy();
        }
        this.backgroundNode = undefined;
        this.cropController.dispose();

        const pendingLoads = Array.from(this.pendingAssetLoads);
        await Promise.all(pendingLoads.map(async (load) => {
            try {
                await load;
            } catch (error: unknown) {
                // 单个资源失败不应阻断其余资源的释放和返回大厅。
                // TODO: console.warn('[SlidingPuzzleGame] Pending asset load finished with an error during dispose.', error);
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
        const titleStatsGap = 20;
        const statsActionsGap = 28;
        // 层级：继续拼图为唯一主按钮；重开与换图并排作为次要操作；
        // 返回大厅降为浅色按钮放在最下方。
        const panelHeight = this.getPopupHeight(
            POPUP_TITLE_HEIGHT
            + titleStatsGap
            + SLIDING_PUZZLE_HUD_HEIGHT
            + statsActionsGap
            + POPUP_PRIMARY_BUTTON_HEIGHT
            + POPUP_BUTTON_HEIGHT * 2
            + POPUP_BUTTON_GAP * 2,
        );
        const panel = this.createPopupPanel(overlay, 'PausePanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        let cursorY = panelHeight / 2 - POPUP_CONTENT_PADDING_TOP;
        this.createPopupTitle(panel, 'PauseTitle', '拼图暂停', cursorY - POPUP_TITLE_HEIGHT / 2, contentWidth);
        cursorY -= POPUP_TITLE_HEIGHT + titleStatsGap;
        this.createStatStrip(
            panel,
            'PauseStats',
            0,
            cursorY - SLIDING_PUZZLE_HUD_HEIGHT / 2,
            contentWidth,
            SLIDING_PUZZLE_HUD_HEIGHT,
        );
        cursorY -= SLIDING_PUZZLE_HUD_HEIGHT + statsActionsGap;

        this.createButton(panel, 'ResumeButton', '继续拼图', 0, cursorY - POPUP_PRIMARY_BUTTON_HEIGHT / 2, contentWidth, POPUP_PRIMARY_BUTTON_HEIGHT, COLORS.teal, () => {
            this.runUiAction('resume', model.resume);
        }, POPUP_PRIMARY_BUTTON_FONT_SIZE);
        cursorY -= POPUP_PRIMARY_BUTTON_HEIGHT + POPUP_BUTTON_GAP;

        const halfWidth = (contentWidth - POPUP_BUTTON_GAP) / 2;
        const halfOffset = (halfWidth + POPUP_BUTTON_GAP) / 2;
        const secondaryY = cursorY - POPUP_BUTTON_HEIGHT / 2;
        this.createButton(panel, 'RestartButton', "重新开始", -halfOffset, secondaryY, halfWidth, POPUP_BUTTON_HEIGHT, COLORS.wood, () => {
            this.runUiAction('restart', model.restart);
        }, POPUP_BUTTON_FONT_SIZE);
        this.createButton(panel, 'ChooseImageButton', '重新选图', halfOffset, secondaryY, halfWidth, POPUP_BUTTON_HEIGHT, COLORS.wood, () => {
            this.runUiAction('choose-image', async () => {
                this.restartToSetupAfterRuntimeRestart = true;
                try {
                    await model.restart();
                } finally {
                    this.restartToSetupAfterRuntimeRestart = false;
                }
            });
        }, POPUP_BUTTON_FONT_SIZE);
        cursorY -= POPUP_BUTTON_HEIGHT + POPUP_BUTTON_GAP;

        this.createButton(panel, 'LobbyButton', '返回大厅', 0, cursorY - POPUP_BUTTON_HEIGHT / 2, contentWidth, POPUP_BUTTON_HEIGHT, COLORS.paperLight, () => {
            this.runUiAction('exit', model.exit);
        }, POPUP_BUTTON_FONT_SIZE, COLORS.woodDark);
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
        const closeButtonSize = Math.max(SLIDING_PUZZLE_TOUCH_SIZE, POPUP_CLOSE_ICON_SIZE + 28);
        // 标题栏按关闭按钮的完整触控高度占位，让标题与按钮共用中心线，
        // 同时保证下方统计信息不会侵入关闭按钮的点击区域。
        const titleRowHeight = closeButtonSize;
        const previewSize = RESULT_PREVIEW_SIZE;
        const titleStatsGap = 12;
        const statsPreviewGap = 24;
        const previewButtonGap = 28;
        const panelHeight = this.getPopupHeight(
            titleRowHeight
            + titleStatsGap
            + SLIDING_PUZZLE_HUD_HEIGHT
            + statsPreviewGap
            + previewSize
            + previewButtonGap
            + POPUP_PRIMARY_BUTTON_HEIGHT
            + POPUP_BUTTON_GAP
            + POPUP_BUTTON_HEIGHT,
        );
        const panel = this.createPopupPanel(overlay, 'ResultPanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        let cursorY = panelHeight / 2 - POPUP_CONTENT_PADDING_TOP;
        const titleY = cursorY - titleRowHeight / 2;

        const closeResultButton = this.createIconButton(
            panel,
            'CloseResult',
            panelWidth / 2 - POPUP_CONTENT_PADDING_X - closeButtonSize / 2,
            titleY,
            'closeIcon',
            POPUP_CLOSE_ICON_SIZE,
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

        // 左右对称地为关闭按钮留位，标题才能以弹窗本身为基准真正居中。
        this.createPopupTitle(
            panel,
            'ResultTitle',
            model.result.completed ? '拼图完成' : '本局结束',
            titleY,
            Math.max(1, contentWidth - (closeButtonSize + 24) * 2),
        );
        cursorY -= titleRowHeight + titleStatsGap;
        this.createStatStrip(
            panel,
            'ResultStats',
            0,
            cursorY - SLIDING_PUZZLE_HUD_HEIGHT / 2,
            contentWidth,
            SLIDING_PUZZLE_HUD_HEIGHT,
        );
        cursorY -= SLIDING_PUZZLE_HUD_HEIGHT + statsPreviewGap;
        const previewY = cursorY - previewSize / 2;
        if (this.imageTexture) {
            this.createImagePreview(panel, 0, previewY, previewSize, previewSize, '', false, IMAGE_PREVIEW_CORNER_RADIUS);
        } else {
            this.createPlaceholderPreview(panel, 0, previewY, previewSize, previewSize, '');
        }
        cursorY -= previewSize + previewButtonGap;

        // 结算后按产品流程回到选图页，文案与实际去向保持一致。
        this.createButton(panel, 'RestartButton', '再拼一张', 0, cursorY - POPUP_PRIMARY_BUTTON_HEIGHT / 2, contentWidth, POPUP_PRIMARY_BUTTON_HEIGHT, COLORS.teal, () => {
            this.runUiAction('restart', async () => {
                // 由运行层注入新会话后再展示 setup，而不是直接开新盘。
                this.restartToSetupAfterRuntimeRestart = true;
                try {
                    await model.restart();
                } finally {
                    this.restartToSetupAfterRuntimeRestart = false;
                }
            });
        }, POPUP_PRIMARY_BUTTON_FONT_SIZE);
        cursorY -= POPUP_PRIMARY_BUTTON_HEIGHT + POPUP_BUTTON_GAP;
        this.createButton(panel, 'LobbyButton', '返回大厅', 0, cursorY - POPUP_BUTTON_HEIGHT / 2, contentWidth, POPUP_BUTTON_HEIGHT, COLORS.paperLight, () => {
            this.runUiAction('exit', model.returnToLobby);
        }, POPUP_BUTTON_FONT_SIZE, COLORS.woodDark);
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
        // 从暂停重开或完成后回到开局页时，音乐仍处于游戏暂停状态。
        this.context?.services.audio.resumeMusic();
        if (this.state === 'disposed') {
            return;
        }

        // 选择页是可重复进入的入口；无论上一次选图是取消、失败还是
        // 页面重建，都要清掉遗留的输入锁，保证“从相册选择”可以再次触发。
        this.inputLocked = false;
        this.destroyDynamicView();
        this.releasePresetLibraryTextures();
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
        setLabelBold(setupTitle, true);

        // 选择页直接落在木桌背景上，保留图片框和按钮层级，去掉整块浅色底板。
        // 所有纵向位置来自 calculateSlidingPuzzleSetupStack：内容整体居中，
        // 预览图随可用高度伸缩，矮屏自动切换紧凑排布。
        const stack = calculateSlidingPuzzleSetupStack(metrics);
        const content = new Node('SetupContent');
        content.layer = this.node.layer;
        content.setParent(root);
        const onRandomPuzzle = (): void => {
            void this.trackAssetLoad(this.selectRandomPuzzle());
        };
        let preview: Node;
        if (this.imageTexture) {
            preview = this.createImagePreview(
                content,
                0,
                stack.previewY,
                stack.previewSize,
                stack.previewSize,
                '',
                false,
                IMAGE_PREVIEW_CORNER_RADIUS,
            );
        } else {
            preview = this.createPlaceholderPreview(
                content,
                0,
                stack.previewY,
                stack.previewSize,
                stack.previewSize,
                '正在准备图片',
            );
        }
        this.bindButtonInteraction(preview, onRandomPuzzle);
        if (stack.hintY !== undefined) {
            this.createLabel(
                content,
                'PreviewHint',
                "点击图片换一张",
                0,
                stack.hintY,
                SETUP_HINT_FONT_SIZE,
                colorWithAlpha(COLORS.paper, 200),
                stack.contentWidth,
                30,
            );
        }

        if (stack.sizeCaptionY !== undefined) {
            this.createSectionCaption(content, 'SizeCaption', "拼图难度", stack.sizeCaptionY, stack.contentWidth);
        }
        const boardSizeOptionCount = SLIDING_PUZZLE_BOARD_SIZES.length;
        const sizeButtonWidth = (stack.contentWidth - SETUP_ROW_GAP * (boardSizeOptionCount - 1))
            / boardSizeOptionCount;
        const sizeSpacing = sizeButtonWidth + SETUP_ROW_GAP;
        SLIDING_PUZZLE_BOARD_SIZES.forEach((size, index) => {
            const x = (index - (boardSizeOptionCount - 1) / 2) * sizeSpacing;
            this.createButton(
                content,
                `Size${size}`,
                `${size} × ${size}`,
                x,
                stack.sizeRowY,
                sizeButtonWidth,
                stack.rowHeight,
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
                stack.compact ? SETUP_COMPACT_SIZE_BUTTON_FONT_SIZE : SETUP_SIZE_BUTTON_FONT_SIZE,
            );
        });

        if (stack.sourceCaptionY !== undefined) {
            this.createSectionCaption(content, 'SourceCaption', '选择图片', stack.sourceCaptionY, stack.contentWidth);
        }
        const sourceButtonWidth = (stack.contentWidth - SETUP_ROW_GAP) / 2;
        const sourceColumnX = (sourceButtonWidth + SETUP_ROW_GAP) / 2;
        this.createButton(content, 'PresetButton', '随机一张', -sourceColumnX, stack.sourceRowY, sourceButtonWidth, stack.rowHeight, COLORS.wood, onRandomPuzzle, SETUP_SOURCE_ACTION_FONT_SIZE);
        this.createButton(content, 'PresetLibraryButton', '选择拼图', sourceColumnX, stack.sourceRowY, sourceButtonWidth, stack.rowHeight, COLORS.teal, () => {
            this.context?.services.feedback.play('uiButton');
            this.showPresetLibrary();
        }, SETUP_SOURCE_ACTION_FONT_SIZE);
        this.createButton(content, 'ImageButton', '从相册选择', 0, stack.albumRowY, stack.contentWidth, stack.rowHeight, COLORS.paperLight, () => {
            void this.pickLocalImage();
        }, SETUP_SOURCE_ACTION_FONT_SIZE, COLORS.woodDark, "（图片仅在本机使用）");

        const startWidth = Math.min(SETUP_START_BUTTON_MAX_WIDTH, stack.contentWidth);
        this.createButton(root, 'StartButton', '开始拼图', 0, metrics.footerY, startWidth, SLIDING_PUZZLE_FOOTER_BUTTON_HEIGHT, COLORS.red, () => {
            this.context?.services.feedback.play('uiButton');
            void this.startRound();
        }, SETUP_START_BUTTON_FONT_SIZE);
    }

    /** 开局页分区标题：左对齐文字，右侧一条淡色细线延伸到内容宽度边缘。 */
    private createSectionCaption(parent: Node, name: string, text: string, y: number, width: number): void {
        const caption = new Node(name);
        caption.layer = this.node.layer;
        caption.setParent(parent);
        caption.setPosition(0, y, 0);
        caption.addComponent(UITransform).setContentSize(width, 34);
        const textWidth = SETUP_SECTION_CAPTION_FONT_SIZE * text.length + 4;
        const label = this.createLabel(
            caption,
            'Label',
            text,
            -width / 2 + textWidth / 2,
            0,
            SETUP_SECTION_CAPTION_FONT_SIZE,
            COLORS.paperLight,
            textWidth,
            34,
        );
        setLabelBold(label, true);
        const ruleLeft = -width / 2 + textWidth + 16;
        if (ruleLeft < width / 2) {
            const rule = new Node('Rule');
            rule.layer = this.node.layer;
            rule.setParent(caption);
            rule.addComponent(UITransform).setContentSize(width, 4);
            const graphics = rule.addComponent(Graphics);
            graphics.fillColor = colorWithAlpha(COLORS.paper, 72);
            graphics.roundRect(ruleLeft, -1.5, width / 2 - ruleLeft, 3, 1.5);
            graphics.fill();
        }
    }

    private showPresetLibrary(): void {
        if (this.state === 'disposed') {
            return;
        }

        this.inputLocked = false;
        this.destroyDynamicView();
        this.releasePresetLibraryTextures();
        this.state = 'preset-library';
        this.layout = this.getLayout();
        const root = new Node('SlidingPuzzlePresetLibrary');
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
            () => {
                if (this.state !== 'preset-library') return;
                this.context?.services.feedback.play('uiButton');
                this.state = 'setup';
                this.showSetup();
            },
        );
        const title = this.createLabel(
            root,
            'Title',
            '选择拼图',
            0,
            metrics.headerY - 22,
            SETUP_TITLE_FONT_SIZE,
            COLORS.paperLight,
            460,
            64,
        );
        setLabelBold(title, true);
        this.createLabel(
            root,
            'SortHint',
            '最近玩过的拼图排在前面',
            0,
            metrics.headerY - 78,
            23,
            COLORS.paper,
            520,
            42,
        );

        const viewportWidth = Math.min(680, Math.max(280, metrics.viewportWidth - 40));
        const viewportTop = metrics.headerY - 112;
        const viewportBottom = -metrics.viewportHeight / 2 + metrics.safeBottom + 32;
        // 视口严格使用标题下方到底部安全区之间的真实高度；矮屏只缩短
        // 可视窗口并通过滚动访问卡片，不能用最小高度把内容顶出安全区。
        const viewportHeight = Math.max(1, viewportTop - viewportBottom);
        const viewport = new Node('PresetLibraryViewport');
        viewport.layer = this.node.layer;
        viewport.setParent(root);
        viewport.setPosition(0, (viewportTop + viewportBottom) / 2, 0);
        viewport.addComponent(UITransform).setContentSize(viewportWidth, viewportHeight);
        const mask = viewport.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        const content = new Node('PresetLibraryContent');
        content.layer = this.node.layer;
        content.setParent(viewport);
        const contentTransform = content.addComponent(UITransform);
        contentTransform.setAnchorPoint(0.5, 1);
        contentTransform.setContentSize(viewportWidth, viewportHeight);
        content.setPosition(0, viewportHeight / 2, 0);

        const scrollView = viewport.addComponent(ScrollView);
        scrollView.content = content;
        scrollView.horizontal = false;
        scrollView.vertical = true;
        scrollView.inertia = true;
        scrollView.brake = 0.75;
        scrollView.elastic = true;
        scrollView.cancelInnerEvents = true;

        this.createLabel(
            content,
            'Loading',
            "正在加载拼图库…",
            0,
            -80,
            26,
            COLORS.paperLight,
            viewportWidth - 48,
            60,
        );

        const sources = this.getSortedPuzzleLibrarySources();
        const token = ++this.presetLibraryLoadToken;
        void this.trackAssetLoad(this.loadPresetLibraryTextures(sources, token)).then((loaded) => {
            if (token !== this.presetLibraryLoadToken
                || this.state !== 'preset-library'
                || !root.isValid
                || !content.isValid) {
                return;
            }
            if (!loaded) {
                const loadingLabel = content.getChildByName('Loading')?.getComponent(Label);
                if (loadingLabel) {
                    loadingLabel.string = "拼图库加载失败，请返回后重新打开";
                }
                return;
            }
            this.renderPresetLibraryGrid(content, viewportWidth, viewportHeight);
        }).catch((error: unknown) => {
            // TODO: console.warn('[SlidingPuzzleGame] Failed to build preset library.', error);
            if (token === this.presetLibraryLoadToken
                && this.state === 'preset-library'
                && content.isValid) {
                const loadingLabel = content.getChildByName('Loading')?.getComponent(Label);
                if (loadingLabel) {
                    loadingLabel.string = "拼图库加载失败，请返回后重新打开";
                }
            }
        });
    }

    private async loadPresetLibraryTextures(
        sources: readonly PuzzleLibrarySource[],
        token: number,
    ): Promise<boolean> {
        const bundle = await this.loadResourceBundle();
        if (!bundle
            || token !== this.presetLibraryLoadToken
            || this.state !== 'preset-library') {
            return false;
        }

        const entries = await Promise.all(sources.map(async (source): Promise<PresetLibraryTexture> => {
            if ((source.kind === 'preset' && source.path === this.loadedPresetAssetPath && this.imageTexture)
                || (source.kind === 'local' && source.id === this.localPuzzleRecordId && this.imageTexture)) {
                return Object.freeze({
                    kind: source.kind,
                    path: source.path,
                    id: source.id,
                    texture: this.imageTexture,
                    releaseOnClose: false,
                });
            }

            if (source.kind === 'local') {
                const selection = await this.context?.services.platform.openPersistedLocalImage(source.path);
                if (!selection) return Object.freeze({ ...source, releaseOnClose: false });
                const imageAsset = await new Promise<ImageAsset | undefined>((resolve) => {
                    assetManager.loadRemote<ImageAsset>(selection.uri, { ext: '.jpg' }, (error, asset) => resolve(error ? undefined : asset));
                });
                selection.release();
                if (!imageAsset) return Object.freeze({ ...source, releaseOnClose: false });
                try {
                    const texture = new Texture2D();
                    texture.image = imageAsset;
                    return Object.freeze({ ...source, imageAsset, texture, releaseOnClose: true });
                } catch (error: unknown) {
                    this.releaseRemoteImageAsset(imageAsset);
                    // TODO: console.warn('[SlidingPuzzleGame] Failed to create local library texture.', source.path, error);
                    return Object.freeze({ ...source, releaseOnClose: false });
                }
            }

            const texture = await new Promise<Texture2D | undefined>((resolve) => {
                try {
                    bundle.load(
                        source.path,
                        Texture2D,
                        (error: Error | null, loadedTexture: Texture2D) => resolve(
                            error ? undefined : loadedTexture,
                        ),
                    );
                } catch (error: unknown) {
                    // TODO: console.warn('[SlidingPuzzleGame] Failed to load preset library image.', source.path, error);
                    resolve(undefined);
                }
            });
            return Object.freeze({ ...source, texture, releaseOnClose: texture !== undefined });
        }));

        if (token !== this.presetLibraryLoadToken
            || this.state !== 'preset-library') {
            entries.forEach((entry) => {
                if (entry.releaseOnClose && entry.texture) {
                    if (entry.kind === 'local') {
                        entry.texture.destroy();
                        this.releaseRemoteImageAsset(entry.imageAsset);
                    } else {
                        this.releaseBundleTexture(entry.texture);
                    }
                }
            });
            return false;
        }

        this.presetLibraryTextures = entries;
        return true;
    }

    private renderPresetLibraryGrid(
        content: Node,
        viewportWidth: number,
        viewportHeight: number,
    ): void {
        content.children.slice().forEach((child) => {
            child.active = false;
            child.destroy();
        });

        const columnCount = 2;
        const sidePadding = 16;
        const columnGap = 18;
        const rowGap = 22;
        const cardSize = Math.min(
            306,
            (viewportWidth - sidePadding * 2 - columnGap) / columnCount,
        );
        const rowCount = Math.max(1, Math.ceil(this.presetLibraryTextures.length / columnCount));
        const contentHeight = Math.max(
            viewportHeight,
            sidePadding * 2 + rowCount * cardSize + Math.max(0, rowCount - 1) * rowGap,
        );
        content.getComponent(UITransform)?.setContentSize(viewportWidth, contentHeight);
        content.setPosition(0, viewportHeight / 2, 0);

        this.presetLibraryTextures.forEach((entry, index) => {
            const column = index % columnCount;
            const row = Math.floor(index / columnCount);
            const x = (column - (columnCount - 1) / 2) * (cardSize + columnGap);
            const y = -sidePadding - cardSize / 2 - row * (cardSize + rowGap);
            const selected = entry.kind === 'preset'
                ? this.selectedConfig.imageSource === 'preset' && this.selectedConfig.presetAssetPath === entry.path
                : this.selectedConfig.imageSource === 'local' && this.localPuzzleRecordId === entry.id;
            const card = this.createPanel(
                content,
                `PresetCard${index}`,
                cardSize,
                cardSize,
                COLORS.paper,
                PRESET_LIBRARY_CARD_CORNER_RADIUS,
            );
            card.setPosition(x, y, 0);

            if (entry.texture) {
                const imageSize = cardSize - 20;
                const frame = new SpriteFrame();
                const textureSize = Math.max(1, Math.min(entry.texture.width, entry.texture.height));
                frame.texture = entry.texture;
                frame.rect = new Rect(
                    (entry.texture.width - textureSize) / 2,
                    (entry.texture.height - textureSize) / 2,
                    textureSize,
                    textureSize,
                );
                frame.originalSize = new Size(textureSize, textureSize);
                this.transientFrames.add(frame);
                this.createRoundedSprite(
                    card,
                    'ImageClip',
                    imageSize,
                    imageSize,
                    frame,
                    IMAGE_PREVIEW_CORNER_RADIUS,
                );
            } else {
                this.createLabel(
                    card,
                    'Unavailable',
                    '图片暂不可用',
                    0,
                    0,
                    22,
                    COLORS.ink,
                    cardSize - 36,
                    60,
                );
            }

            if (selected) {
                const selectedIcon = this.visualFrames.get('selectedIcon');
                if (selectedIcon) {
                    const badge = this.createSpriteNode(
                        card,
                        'SelectedIcon',
                        PRESET_SELECTED_ICON_SIZE,
                        PRESET_SELECTED_ICON_SIZE,
                        selectedIcon,
                    );
                    const badgeOffset = PRESET_SELECTED_ICON_EDGE_INSET + PRESET_SELECTED_ICON_SIZE / 2;
                    badge.node.setPosition(
                        cardSize / 2 - badgeOffset,
                        cardSize / 2 - badgeOffset,
                        0,
                    );
                }
            }

            if (entry.kind === 'local') {
                const badgeWidth = 72;
                const badgeHeight = 40;
                const badge = this.createPanel(
                    card,
                    'LocalImageBadge',
                    badgeWidth,
                    badgeHeight,
                    colorWithAlpha(COLORS.woodDark, 224),
                    12,
                );
                const badgeInset = 14;
                badge.setPosition(
                    -cardSize / 2 + badgeInset + badgeWidth / 2,
                    cardSize / 2 - badgeInset - badgeHeight / 2,
                    0,
                );
                const badgeLabel = this.createLabel(
                    badge,
                    'Label',
                    '本地',
                    0,
                    0,
                    20,
                    COLORS.paperLight,
                    badgeWidth - 12,
                    badgeHeight,
                );
                setLabelBold(badgeLabel, true);
            }

            if (entry.texture) {
                this.bindButtonInteraction(card, () => this.selectPuzzleFromLibrary(entry));
            }
        });
    }

    private selectPuzzleFromLibrary(entry: PresetLibraryTexture): void {
        if (entry.kind === 'preset') {
            this.selectPresetFromLibrary(entry.path);
            return;
        }
        if (this.state !== 'preset-library' || this.inputLocked || !entry.texture || !entry.imageAsset || !entry.id) return;
        this.releaseImageResources();
        this.imageTexture = entry.texture;
        this.imageAsset = entry.imageAsset;
        this.imageTextureOwned = true;
        this.localPuzzleRecordId = entry.id;
        this.selectedConfig = Object.freeze({ boardSize: this.selectedSize, imageSource: 'local', imageUri: entry.path });
        const index = this.presetLibraryTextures.indexOf(entry);
        if (index >= 0) {
            this.presetLibraryTextures[index] = Object.freeze({ ...entry, releaseOnClose: false });
        }
        this.context?.services.feedback.play('uiButton');
        this.state = 'setup';
        this.showSetup();
    }

    private selectPresetFromLibrary(path: string): void {
        if (this.state !== 'preset-library' || this.inputLocked) {
            return;
        }
        const index = SLIDING_PUZZLE_PRESET_ASSET_PATHS.indexOf(path);
        if (index < 0) {
            return;
        }

        this.selectedPresetIndex = index;
        this.selectedConfig = Object.freeze({
            boardSize: this.selectedSize,
            imageSource: 'preset',
            presetAssetPath: path,
        });
        this.cropController.cancel();
        this.context?.services.feedback.play('uiButton');
        this.state = 'setup';
        this.showSetup();
        void this.trackAssetLoad(this.loadPresetImage(true));
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
            // TODO: console.warn('[SlidingPuzzleGame] Failed to pick local image.', error);
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
                // TODO: console.warn('[SlidingPuzzleGame] Failed to load local image.', error);
                resolve(undefined);
            }
        });

        if (!imageAsset
            || token !== this.imageLoadToken
            || (this.state as SlidingPuzzleState) === 'disposed') {
            if (imageAsset) {
                this.releaseRemoteImageAsset(imageAsset);
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
            // TODO: console.warn('[SlidingPuzzleGame] Failed to create local texture.', error);
            this.releaseRemoteImageAsset(imageAsset);
            return false;
        }
    }

    private async loadPresetImage(refreshSetup: boolean): Promise<boolean> {
        if (this.state === 'disposed') {
            return false;
        }

        const path = this.selectedConfig.presetAssetPath;
        const bundle = await this.loadResourceBundle();
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
                // TODO: console.warn('[SlidingPuzzleGame] Failed to load preset image.', path, error);
                resolve(undefined);
            }
        });

        if (token !== this.imageLoadToken || (this.state as SlidingPuzzleState) === 'disposed') {
            if (token === this.imageLoadToken) {
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
            return false;
        }

        this.imageAsset = undefined;
        this.imageTexture = texture;
        this.imageTextureOwned = false;
        this.localImageSelection?.release();
        this.localImageSelection = undefined;
        this.localPuzzleRecordId = undefined;
        this.loadedPresetAssetPath = path;
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
        const bundle = await this.loadResourceBundle();
        if (!bundle || this.state === 'disposed') return;
        const assets = this.context!.services.assets;
        const token = ++this.visualLoadToken;
        const keys = Object.keys(SLIDING_PUZZLE_VISUAL_ASSET_PATHS) as SlidingPuzzleVisualKey[];
        const frames = await assets.loadSpriteFrames(SLIDING_PUZZLE_RESOURCE_BUNDLE, keys.map(key => {
            const source = SLIDING_PUZZLE_VISUAL_ASSET_PATHS[key];
            const packed = PACKED_SPRITE_PATHS[source];
            return { key, path: packed ?? source, type: packed ? 'frame' as const : 'texture' as const };
        }));
        if (token !== this.visualLoadToken || (this.state as SlidingPuzzleState) === 'disposed') {
            Object.keys(frames).forEach(key => assets.releaseRuntimeAsset(frames[key]));
            return;
        }
        keys.forEach(key => this.visualFrames.set(key, frames[key]));
        if (this.state === 'ready' || this.state === 'picking-image' || this.state === 'starting') {
            this.buildBackground();
        } else if ((this.state as SlidingPuzzleState) !== 'disposed') {
            this.handleCanvasResize();
        }
    }

    private releaseVisualAssets(): void {
        this.visualFrames.forEach(frame => this.context?.services.assets.releaseRuntimeAsset(frame));
        this.visualFrames.clear();
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
        this.localImageSelection?.release();
        this.localImageSelection = undefined;
        this.localPuzzleRecordId = undefined;
        this.loadedPresetAssetPath = undefined;

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
            this.releaseRemoteImageAsset(imageAsset);
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
            this.releaseRemoteImageAsset(imageAsset);
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
        const metrics = this.layout;
        if (!this.imageTexture || !metrics) {
            return;
        }

        const boardSize = this.model.boardSize;
        const cropRect = this.getCropRect(this.imageTexture, this.getActiveCrop());
        const tileSize = getBoardTileAreaSize(metrics.boardSize) / boardSize;
        const imageInset = clamp(tileSize * TILE_SKIN_INSET_RATIO, 2, 4);
        // 图像先按完整格子的尺寸对齐，再从源图裁掉被木片边框遮住的边缘。
        // 可见图片仍绘制在内框大小的节点上，拼接时不会把整格图压缩进内框。
        for (let index = 0; index < boardSize * boardSize - 1; index += 1) {
            const sourceRect = calculateSlidingPuzzleTileSourceRect(
                cropRect.x,
                cropRect.y,
                cropRect.width,
                boardSize,
                index,
                imageInset / tileSize,
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
            '选择相册图片',
            0,
            metrics.titleY,
            CROP_TITLE_FONT_SIZE,
            COLORS.paperLight,
            680,
            68,
        );
        setLabelBold(cropTitle, true);
        this.createLabel(
            root,
            'CropBody',
            "拖动图片调整位置，双指捏合缩放",
            0,
            metrics.titleY - 68,
            CROP_HINT_FONT_SIZE,
            COLORS.paper,
            680,
            54,
        );
        const actionHeight = 88;
        const actionY = metrics.footerY;
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
            this.createPlaceholderPreview(root, 0, previewY, previewSize, previewSize, '图片准备中', 0);
        }
        this.createButton(root, 'CancelCrop', '取消', -126, actionY, 220, actionHeight, COLORS.red, () => {
            this.state = 'setup';
            this.cropController.cancel();
            this.showSetup();
            this.releasePendingImageResources();
        });
        this.createButton(root, 'ConfirmCrop', '使用这张图', 126, actionY, 250, actionHeight, COLORS.teal, () => {
            void this.trackAssetLoad(this.confirmLocalImageCrop());
        });
    }

    private async confirmLocalImageCrop(): Promise<void> {
        if (this.state !== 'crop-editing' || this.inputLocked || !this.context) {
            return;
        }

        const confirmed = this.cropController.confirm();
        const sourceTexture = this.pendingImageTexture;
        if (!confirmed || !sourceTexture) {
            return;
        }

        const cropRect = this.getCropRect(sourceTexture, confirmed.crop);
        // 小图保持裁切区域的原生像素边长；只有超过上限时才降采样，
        // 绝不把低分辨率相册图片反向放大到 1024。
        const outputSize = Math.min(
            MAX_LOCAL_IMAGE_PIXEL_SIZE,
            Math.max(1, Math.floor(cropRect.width)),
        );
        const token = ++this.imageLoadToken;
        this.inputLocked = true;
        const cropHint = this.dynamicNode?.getChildByName('CropBody')?.getComponent(Label);
        if (cropHint) cropHint.string = '正在处理图片，请稍候…';

        try {
            const encodedImage = await this.context.services.platform.cropLocalImage({
                uri: confirmed.selection.uri,
                sourceX: cropRect.x,
                sourceY: cropRect.y,
                sourceSize: cropRect.width,
                outputSize,
                quality: LOCAL_IMAGE_JPEG_QUALITY,
            });
            if (!encodedImage
                || token !== this.imageLoadToken
                || this.state !== 'crop-editing'
                || !this.pendingImageTexture) {
                encodedImage?.release();
                if (token === this.imageLoadToken && this.state === 'crop-editing') {
                    this.context.services.feedback.play('collision');
                }
                return;
            }

            const croppedImageAsset = await new Promise<ImageAsset | undefined>((resolve) => {
                try {
                    assetManager.loadRemote<ImageAsset>(
                        encodedImage.uri,
                        { ext: '.jpg' },
                        (error: Error | null, asset: ImageAsset) => resolve(
                            error ? undefined : asset,
                        ),
                    );
                } catch (error: unknown) {
                    // TODO: console.warn('[SlidingPuzzleGame] Failed to decode cropped JPEG.', error);
                    resolve(undefined);
                }
            });
            if (!croppedImageAsset
                || token !== this.imageLoadToken
                || this.state !== 'crop-editing'
                || !this.pendingImageTexture) {
                encodedImage.release();
                this.releaseRemoteImageAsset(croppedImageAsset);
                if (token === this.imageLoadToken && this.state === 'crop-editing') {
                    this.context.services.feedback.play('collision');
                }
                return;
            }

            let croppedTexture: Texture2D | undefined;
            try {
                croppedTexture = new Texture2D();
                croppedTexture.image = croppedImageAsset;
            } catch (error: unknown) {
                encodedImage.release();
                croppedTexture?.destroy();
                this.releaseRemoteImageAsset(croppedImageAsset);
                // TODO: console.warn('[SlidingPuzzleGame] Failed to create cropped local texture.', error);
                this.context.services.feedback.play('collision');
                return;
            }

            // 原始大图只服务于裁切编辑。新纹理创建成功后立即释放原图，
            // 当前会话之后只持有裁切完成、最大 1024×1024 的正方形纹理。
            this.releasePendingImageResources();
            this.pendingImageAsset = croppedImageAsset;
            this.pendingImageTexture = croppedTexture;
            this.pendingImageTextureOwned = true;
            if (!this.promotePendingImage()) {
                encodedImage.release();
                this.releasePendingImageResources();
                return;
            }

            this.selectedConfig = Object.freeze({
                boardSize: this.selectedSize,
                imageSource: 'local',
                imageUri: encodedImage.uri,
            });
            this.localImageSelection = encodedImage;
            this.cropController.cancel();
            this.state = 'setup';
            this.context.services.feedback.play('uiButton');
            this.showSetup();
        } catch (error: unknown) {
            // TODO: console.warn('[SlidingPuzzleGame] Failed to crop local image.', error);
            if (token === this.imageLoadToken && this.state === 'crop-editing') {
                this.context.services.feedback.play('collision');
            }
        } finally {
            // dispose() 会递增 imageLoadToken；令牌仍有效即可确认当前会话存活。
            if (token === this.imageLoadToken) {
                this.inputLocked = false;
                if (this.state === 'crop-editing') {
                    // TODO: console.warn('[SlidingPuzzleGame] Local image crop did not complete; retry is available.');
                    const hint = this.dynamicNode?.getChildByName('CropBody')?.getComponent(Label);
                    if (hint) hint.string = '图片处理失败，请重试或重新选择图片';
                }
            }
        }
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
        if (this.selectedConfig.imageSource === 'preset'
            && this.selectedConfig.presetAssetPath
            && this.loadedPresetAssetPath === this.selectedConfig.presetAssetPath) {
            this.recordPresetPlayed(this.selectedConfig.presetAssetPath);
        } else if (this.selectedConfig.imageSource === 'local') {
            await this.persistCurrentLocalPuzzle();
        }
        this.model.reset(this.selectedSize);
        this.savedProgressDiscarded = false;
        this.context?.reportScore(0);
        this.state = 'playing';
        this.inputLocked = false;
        this.showPlay();
        this.persistProgress();
        // 按钮音由发起开局的点击（开始拼图 / 弹窗按钮）即时播放，这里不再延迟补播。
        this.context?.services.audio.resumeMusic();
    }

    private showPlay(): void {
        this.destroyDynamicView();
        this.layout = this.getLayout();
        const root = new Node('SlidingPuzzlePlay');
        root.layer = this.node.layer;
        root.setParent(this.node);
        this.dynamicNode = root;
        const metrics = this.layout;
        this.createPlayHud(root, metrics);
        this.createIconButton(
            root,
            'ReferenceButton',
            -metrics.headerIconX,
            metrics.headerY,
            'referenceIcon',
            PLAY_SIDE_ICON_SIZE,
            () => {
                // 只在玩家操作时发声；画布重建恢复参考图时不重复播放。
                if (this.state === 'playing' || this.state === 'paused' || this.state === 'completed') {
                    this.context?.services.feedback.play('popup');
                }
                this.showReferencePreview();
            },
        );
        this.pauseButtonNode = this.createIconButton(root, 'PauseButton', metrics.headerIconX, metrics.headerY, 'pauseIcon', PLAY_SIDE_ICON_SIZE, () => {
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
        if (this.state === 'playing') {
            this.createDisplayModeSwitch(root);
        }
        this.refreshHud();
    }

    /** 顶栏中间的纸卡信息条，与左右两个图标按钮同处一行，把纵向空间留给棋盘。 */
    private createPlayHud(parent: Node, metrics: SlidingPuzzleLayoutMetrics): void {
        const [, timer, moves] = this.createStatStrip(
            parent,
            'Hud',
            0,
            metrics.headerY,
            metrics.hudWidth,
            SLIDING_PUZZLE_HUD_HEIGHT,
        );
        this.timerLabel = timer;
        this.movesLabel = moves;
    }

    /**
     * 规格 / 用时 / 步数三栏纸卡：小字说明在上、数值在下。对局顶栏、暂停和
     * 结算弹窗共用同一样式，返回三栏数值 Label 以便调用方刷新。
     */
    private createStatStrip(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): readonly [Label, Label, Label] {
        const strip = this.createPanel(parent, name, width, height, COLORS.paper, 24);
        strip.setPosition(x, y, 0);
        const columnWidth = width / 3;
        const graphics = strip.getComponent(Graphics)!;
        graphics.fillColor = colorWithAlpha(COLORS.woodDark, 56);
        [-1, 1].forEach((side) => {
            graphics.rect(side * columnWidth / 2 - 1, -height / 2 + 22, 2, height - 44);
        });
        graphics.fill();

        const createColumn = (columnName: string, caption: string, value: string, columnX: number): Label => {
            this.createLabel(
                strip,
                `${columnName}Caption`,
                caption,
                columnX,
                20,
                PLAY_HUD_CAPTION_FONT_SIZE,
                COLORS.muted,
                columnWidth - 12,
                26,
            );
            const label = this.createLabel(
                strip,
                columnName,
                value,
                columnX,
                -13,
                PLAY_HUD_VALUE_FONT_SIZE,
                COLORS.woodDark,
                columnWidth - 12,
                44,
            );
            label.isBold = true;
            return label;
        };
        const size = this.model.boardSize;
        return [
            createColumn('BoardSize', "网格", `${size}×${size}`, -columnWidth),
            createColumn('Timer', '用时', this.formatDuration(this.elapsedSeconds), 0),
            createColumn('Moves', '步数', `${this.model.moves}`, columnWidth),
        ];
    }

    private createDisplayModeSwitch(parent: Node): void {
        const metrics = this.layout;
        if (!metrics) {
            return;
        }

        const switchFrame = this.visualFrames.get(
            this.showTileNumbers ? 'displayModeNumber' : 'displayModeOriginal',
        );
        const switchRoot = switchFrame
            ? new Node('DisplayModeSwitch')
            : this.createPanel(
                parent,
                'DisplayModeSwitch',
                DISPLAY_MODE_SWITCH_WIDTH,
                DISPLAY_MODE_SWITCH_HEIGHT,
                COLORS.paper,
                18,
            );
        if (switchFrame) {
            switchRoot.layer = this.node.layer;
            switchRoot.setParent(parent);
            switchRoot.addComponent(UITransform).setContentSize(
                DISPLAY_MODE_SWITCH_WIDTH,
                DISPLAY_MODE_SWITCH_HEIGHT,
            );
            const artwork = new Node('Artwork');
            artwork.layer = this.node.layer;
            artwork.setParent(switchRoot);
            artwork.addComponent(UITransform).setContentSize(
                DISPLAY_MODE_SWITCH_WIDTH,
                DISPLAY_MODE_SWITCH_HEIGHT,
            );
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = switchFrame;
        }
        switchRoot.setPosition(0, metrics.displaySwitchY, 0);
        this.displayModeSwitchNode = switchRoot;

        const segmentWidth = DISPLAY_MODE_SWITCH_WIDTH / 2 - 6;
        const segmentHeight = DISPLAY_MODE_SWITCH_HEIGHT - 10;
        const createSegment = (
            name: string,
            text: string,
            x: number,
            selected: boolean,
            onClick: () => void,
        ): void => {
            const segment = new Node(name);
            segment.layer = this.node.layer;
            segment.setParent(switchRoot);
            segment.setPosition(x, 0, 0);
            segment.addComponent(UITransform).setContentSize(
                segmentWidth,
                Math.max(DISPLAY_MODE_SWITCH_HEIGHT, SLIDING_PUZZLE_TOUCH_SIZE),
            );
            if (!switchFrame) {
                const graphics = segment.addComponent(Graphics);
                graphics.fillColor = selected ? COLORS.teal : colorWithAlpha(COLORS.paper, 0);
                graphics.roundRect(
                    -segmentWidth / 2,
                    -segmentHeight / 2,
                    segmentWidth,
                    segmentHeight,
                    13,
                );
                graphics.fill();
            }
            const labelX = selected && switchFrame
                ? (text === '原图' ? 34 : -34)
                : 0;
            const label = this.createLabel(
                segment,
                'Label',
                selected && !switchFrame ? `${text} ✓` : text,
                labelX,
                0,
                28,
                selected ? COLORS.paperLight : COLORS.woodDark,
                segmentWidth - 20,
                segmentHeight,
            );
            setLabelBold(label, selected);
            this.bindButtonInteraction(segment, onClick, false);
        };

        const segmentOffset = DISPLAY_MODE_SWITCH_WIDTH / 4 - 3;
        createSegment('OriginalMode', '原图', -segmentOffset, !this.showTileNumbers, () => {
            this.setTileNumberDisplay(false);
        });
        createSegment('NumberMode', '序号', segmentOffset, this.showTileNumbers, () => {
            this.setTileNumberDisplay(true);
        });
    }

    private setTileNumberDisplay(showTileNumbers: boolean): void {
        if (this.state !== 'playing' || this.showTileNumbers === showTileNumbers) {
            return;
        }

        this.showTileNumbers = showTileNumbers;
        this.persistProgress();
        this.inputLocked = true;
        this.context?.services.feedback.play('toggle');
        // 序号蒙层在棋盘创建时已经缓存；切换时只改变可见性，并在当前
        // 点击事件派发结束后单独重建轻量切换器，不再重建棋盘或切片帧。
        this.scheduleOnce(() => {
            if (this.state !== 'playing') {
                return;
            }
            this.tileIndexByNode.forEach((_tileIndex, tile) => {
                const overlay = tile.getChildByName('TileNumberOverlay');
                if (overlay?.isValid) {
                    overlay.active = this.showTileNumbers;
                }
            });
            const previousSwitch = this.displayModeSwitchNode;
            const switchParent = previousSwitch?.parent ?? this.dynamicNode;
            if (previousSwitch?.isValid) {
                previousSwitch.active = false;
                previousSwitch.destroy();
            }
            this.displayModeSwitchNode = undefined;
            if (switchParent?.isValid) {
                this.createDisplayModeSwitch(switchParent);
            }
            this.inputLocked = false;
        }, 0);
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
        const tileAreaSize = getBoardTileAreaSize(boardSize);
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

            const imageInset = clamp(tileSize * TILE_SKIN_INSET_RATIO, 2, 4);
            const overlaySize = tileSize - imageInset * 2;
            const overlay = new Node('TileNumberOverlay');
            overlay.layer = this.node.layer;
            overlay.setParent(tile);
            overlay.addComponent(UITransform).setContentSize(overlaySize, overlaySize);
            const overlayGraphics = overlay.addComponent(Graphics);
            overlayGraphics.fillColor = colorWithAlpha(COLORS.ink, TILE_NUMBER_OVERLAY_ALPHA);
            overlayGraphics.roundRect(
                -overlaySize / 2,
                -overlaySize / 2,
                overlaySize,
                overlaySize,
                Math.max(2, tileRadius - 1),
            );
            overlayGraphics.fill();
            const numberLabel = this.createLabel(
                overlay,
                'Number',
                String(value),
                0,
                0,
                size === 4
                    ? clamp(tileSize * 0.36, 32, 56)
                    : clamp(tileSize * 0.4, 32, 64),
                COLORS.paperLight,
                overlaySize - 12,
                overlaySize - 12,
            );
            setLabelBold(numberLabel, true);
            overlay.active = this.shouldShowTileNumberOverlay();

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
        // 一次有效操作只会移动一个方块。复用现有节点可以避免 7×7 序号模式
        // 每步销毁并重建 48 套 Sprite、Graphics 和 Label。
        if (!this.moveRenderedTile(result)) {
            // 资源异步刷新或画布重建恰好发生在移动期间时，保留完整重建兜底。
            this.renderBoard();
        }
        this.refreshHud();
        this.persistProgress();

        if (result.completed) {
            this.finishRound();
        }
    }

    private moveRenderedTile(result: SlidingPuzzleMoveResult): boolean {
        const board = this.boardNode;
        const metrics = this.layout;
        const movedTile = result.movedTile;
        const targetIndex = result.toIndex;
        if (!board
            || !metrics
            || movedTile === undefined
            || targetIndex === undefined) {
            return false;
        }

        const tile = board.getChildByName(`Tile${movedTile}`);
        if (!tile?.isValid) {
            return false;
        }

        const size = this.model.boardSize;
        const tileAreaSize = getBoardTileAreaSize(metrics.boardSize);
        const tileSize = tileAreaSize / size;
        const row = Math.floor(targetIndex / size);
        const column = targetIndex % size;
        tile.setPosition(
            -tileAreaSize / 2 + tileSize / 2 + column * tileSize,
            tileAreaSize / 2 - tileSize / 2 - row * tileSize,
            0,
        );
        this.tileIndexByNode.set(tile, targetIndex);
        return true;
    }

    private finishRound(): void {
        if (this.completionRequested) {
            return;
        }

        this.completionRequested = true;
        this.completionTransitionPending = true;
        this.state = 'completed';
        this.discardSavedProgress();
        this.inputLocked = true;
        if (this.displayModeSwitchNode?.isValid) {
            this.displayModeSwitchNode.active = false;
        }
        // 完成特效需要直接作用在已经还原的图片上；序号模式的数字和半透明
        // 蒙层属于操作辅助信息，必须在特效创建前一起撤掉，避免它们被闪耀效果
        // 继续叠在棋盘上。completionRequested 同时让后续画布重建保持隐藏。
        this.setTileNumberOverlaysVisible(false);
        if (this.pauseButtonNode?.isValid) {
            this.pauseButtonNode.active = true;
        }
        // 音乐先收住，让完成和弦单独成立；再来一局 / 回到开局页时恢复。
        this.context?.services.audio.pauseMusic();
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
        if (this.model.boardSize === 7) this.context?.reportAchievementProgress('completed-7x7', 1);
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

    private shouldShowTileNumberOverlay(): boolean {
        return this.showTileNumbers && !this.completionRequested;
    }

    private setTileNumberOverlaysVisible(visible: boolean): void {
        this.tileIndexByNode.forEach((_tileIndex, tile) => {
            const overlay = tile.getChildByName('TileNumberOverlay');
            if (overlay?.isValid) {
                overlay.active = visible;
            }
        });
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

        const imageSize = getBoardTileAreaSize(metrics.boardSize);
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
        const metrics = this.layout ?? this.getLayout();
        // 参考图不套弹窗木框，直接铺在遮罩上并与棋盘同宽，方便对照细节；
        // 矮屏按上下安全区等比缩小。点击遮罩任意位置即可关闭。
        const closeButtonSize = Math.max(SLIDING_PUZZLE_TOUCH_SIZE, POPUP_CLOSE_ICON_SIZE + 28);
        const availableHeight = metrics.viewportHeight
            - metrics.topReserved
            - metrics.safeBottom
            - REFERENCE_PREVIEW_VERTICAL_MARGIN * 2
            - closeButtonSize
            - REFERENCE_PREVIEW_TITLE_GAP;
        const previewSize = Math.max(
            1,
            Math.min(
                metrics.boardSize,
                metrics.viewportWidth - REFERENCE_PREVIEW_SIDE_MARGIN * 2,
                availableHeight,
            ),
        );
        const groupHeight = closeButtonSize + REFERENCE_PREVIEW_TITLE_GAP + previewSize;
        const groupTop = metrics.safeContentCenterY + groupHeight / 2;
        const headerY = groupTop - closeButtonSize / 2;
        const previewY = groupTop - groupHeight + previewSize / 2;

        const closeReference = (): void => {
            if (this.state !== 'reference-preview') {
                return;
            }
            this.context?.services.feedback.play('popup');
            this.hideReferencePreview();
        };
        this.bindButtonInteraction(overlay, closeReference, false);
        const title = this.createPopupTitle(
            overlay,
            'ReferenceTitle',
            '参考图',
            headerY,
            Math.max(1, previewSize - closeButtonSize * 2),
        );
        title.color = COLORS.paperLight;
        this.createIconButton(
            overlay,
            'CloseReference',
            previewSize / 2 - closeButtonSize / 2,
            headerY,
            'closeIcon',
            POPUP_CLOSE_ICON_SIZE,
            closeReference,
        );
        if (this.imageTexture) {
            this.createImagePreview(
                overlay,
                0,
                previewY,
                previewSize,
                previewSize,
                '',
                false,
                IMAGE_PREVIEW_CORNER_RADIUS,
            );
        } else {
            this.createPlaceholderPreview(
                overlay,
                0,
                previewY,
                previewSize,
                previewSize,
                '图片准备中',
            );
        }
    }

    /** 弹窗统一标题样式：深木色粗体，居中。 */
    private createPopupTitle(parent: Node, name: string, text: string, y: number, width: number): Label {
        const title = this.createLabel(
            parent,
            name,
            text,
            0,
            y,
            POPUP_TITLE_FONT_SIZE,
            COLORS.woodDark,
            width,
            POPUP_TITLE_HEIGHT,
        );
        title.isBold = true;
        return title;
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

    private createPlaceholderPreview(
        parent: Node,
        x: number,
        y: number,
        width: number,
        height: number,
        caption: string,
        cornerRadius = 20,
    ): Node {
        const preview = this.createPanel(
            parent,
            'ImagePlaceholder',
            width,
            height,
            COLORS.paperLight,
            cornerRadius,
        );
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
        cornerRadius = 0,
    ): Node {
        const preview = this.createPanel(
            parent,
            'ImagePreview',
            width,
            height,
            COLORS.paperLight,
            interactiveCrop ? 0 : IMAGE_PREVIEW_CORNER_RADIUS,
        );
        preview.setPosition(x, y, 0);
        const imageSize = Math.max(
            1,
            Math.min(width, height) - (interactiveCrop ? CROP_PREVIEW_FRAME_GAP : 28),
        );
        const frame = this.createPreviewFrame();
        const sprite = cornerRadius > 0
            ? this.createRoundedSprite(
                preview,
                'ImageClip',
                imageSize,
                imageSize,
                frame,
                cornerRadius,
            )
            : this.createSpriteNode(preview, 'Image', imageSize, imageSize, frame);

        const frameNode = new Node('CropFrame');
        frameNode.layer = this.node.layer;
        frameNode.setParent(preview);
        frameNode.addComponent(UITransform).setContentSize(imageSize, imageSize);
        const frameGraphics = frameNode.addComponent(Graphics);
        frameGraphics.lineWidth = interactiveCrop ? 5 : 3;
        frameGraphics.strokeColor = interactiveCrop ? COLORS.paperLight : colorWithAlpha(COLORS.woodDark, 120);
        if (interactiveCrop) {
            frameGraphics.rect(-imageSize / 2 + 2, -imageSize / 2 + 2, imageSize - 4, imageSize - 4);
        } else {
            frameGraphics.roundRect(-imageSize / 2 + 2, -imageSize / 2 + 2, imageSize - 4, imageSize - 4, 14);
        }
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

    private createRoundedSprite(
        parent: Node,
        name: string,
        width: number,
        height: number,
        frame: SpriteFrame | undefined,
        radius: number,
    ): Sprite {
        const clip = new Node(name);
        clip.layer = this.node.layer;
        clip.setParent(parent);
        clip.addComponent(UITransform).setContentSize(width, height);
        // Mask 切换到 GRAPHICS_STENCIL 时会初始化它依赖的 Graphics。
        // 必须先完成 Mask 类型设置，再绘制路径，否则类型切换可能清掉
        // 之前画好的圆角模板，运行时图片仍会按矩形显示。
        const mask = clip.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        const stencil = clip.getComponent(Graphics) ?? clip.addComponent(Graphics);
        stencil.clear();
        stencil.fillColor = Color.WHITE;
        stencil.roundRect(-width / 2, -height / 2, width, height, radius);
        stencil.fill();
        return this.createSpriteNode(clip, 'Image', width, height, frame);
    }

    private createSpriteNode(
        parent: Node,
        name: string,
        width: number,
        height: number,
        frame?: SpriteFrame,
    ): Sprite {
        const image = new Node(name);
        image.layer = this.node.layer;
        image.setParent(parent);
        image.addComponent(UITransform).setContentSize(width, height);
        const sprite = image.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame ?? null;
        return sprite;
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
        labelColor: Color = COLORS.paperLight,
        subtitle?: string,
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
            labelColor,
            width - 12,
            height - 10,
        );
        const iconKey = BUTTON_ICON_ASSET_KEYS[name];
        const iconFrame = iconKey ? this.visualFrames.get(iconKey) : undefined;
        if (iconFrame) {
            const isSetupSourceAction = name === 'PresetButton'
                || name === 'PresetLibraryButton'
                || name === 'ImageButton';
            const iconSize = Math.min(isSetupSourceAction ? 54 : 62, height - 16);
            const iconNode = new Node('Icon');
            iconNode.layer = this.node.layer;
            iconNode.setParent(button);
            iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
            const iconSprite = iconNode.addComponent(Sprite);
            iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            iconSprite.spriteFrame = iconFrame;

            if (width <= 160) {
                iconNode.setPosition(0, 0, 0);
                label.node.active = false;
            } else if (isSetupSourceAction) {
                // 三个选图来源按钮都把“图标 + 文字”作为一个整体居中；
                // 文案宽度按当前字号和字符数计算，宽按钮不会把内容拉散。
                // 相册按钮的主副文案先组成一个垂直居中的文本块，再与图标对齐。
                const subtitleWidth = subtitle
                    ? SETUP_SOURCE_ACTION_SUBTITLE_FONT_SIZE * subtitle.length + 4
                    : 0;
                const labelWidth = Math.min(
                    width - iconSize - SETUP_SOURCE_ACTION_CONTENT_GAP - 16,
                    Math.ceil(Math.max(label.fontSize * text.length + 4, subtitleWidth)),
                );
                const contentWidth = iconSize + SETUP_SOURCE_ACTION_CONTENT_GAP + labelWidth;
                const contentLeft = -contentWidth / 2;
                iconNode.setPosition(contentLeft + iconSize / 2, 0, 0);
                label.node.setPosition(
                    contentLeft + iconSize + SETUP_SOURCE_ACTION_CONTENT_GAP + labelWidth / 2,
                    subtitle ? 12 : 0,
                    0,
                );
                label.node.getComponent(UITransform)?.setContentSize(
                    labelWidth,
                    subtitle ? 32 : height - 10,
                );
                if (subtitle) {
                    this.createLabel(
                        button,
                        'Subtitle',
                        subtitle,
                        contentLeft + iconSize + SETUP_SOURCE_ACTION_CONTENT_GAP + labelWidth / 2,
                        -16,
                        SETUP_SOURCE_ACTION_SUBTITLE_FONT_SIZE,
                        labelColor,
                        labelWidth,
                        24,
                    );
                }
            } else {
                iconNode.setPosition(-width / 2 + iconSize / 2 + 16, 0, 0);
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

    private bindButtonInteraction(
        button: Node,
        onClick: () => void,
        animatePress = true,
    ): void {
        const baseX = button.position.x;
        const baseY = button.position.y;
        const baseScaleX = button.scale.x;
        const baseScaleY = button.scale.y;
        let touchEndedAt = 0;
        const press = (): void => {
            if (!button.isValid || !animatePress) {
                return;
            }
            button.setScale(baseScaleX * BUTTON_PRESS_SCALE, baseScaleY * BUTTON_PRESS_SCALE, 1);
            button.setPosition(baseX, baseY - BUTTON_PRESS_OFFSET, 0);
        };
        const release = (): void => {
            if (!button.isValid || !animatePress) {
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

        // 暂停弹窗、结算弹窗的按钮都经由这里：接受点击的同时给出按钮音。
        this.context?.services.feedback.play('uiButton');
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
                    // TODO: console.error(`[SlidingPuzzleGame] ${label} action failed.`, error);
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
            // TODO: console.error('[SlidingPuzzleGame] Failed to return to lobby from setup.', error);
            this.uiActionPending = false;
            this.inputLocked = false;
        }
    }

    private async restoreActiveRound(): Promise<boolean> {
        const context = this.context;
        if (!context) return false;
        const raw = this.currentSave()?.custom?.activeRound;
        if (raw === undefined) return false;

        try {
            const activeRound = this.parseActiveRound(raw);
            if (!activeRound) {
                throw new Error('Active sliding puzzle save has an invalid structure.');
            }

            this.selectedSize = activeRound.boardSize;
            let imageLoaded = false;
            if (activeRound.image.kind === 'preset' && activeRound.image.path) {
                const presetIndex = SLIDING_PUZZLE_PRESET_ASSET_PATHS.indexOf(activeRound.image.path);
                if (presetIndex < 0) {
                    throw new Error('Saved preset image no longer exists in the puzzle library.');
                }
                this.selectedPresetIndex = presetIndex;
                this.selectedConfig = Object.freeze({
                    boardSize: activeRound.boardSize,
                    imageSource: 'preset',
                    presetAssetPath: activeRound.image.path,
                });
                imageLoaded = await this.trackAssetLoad(this.loadPresetImage(false));
            } else if (activeRound.image.kind === 'local' && activeRound.image.id) {
                const record = this.getLocalPuzzleRecords()
                    .find((item) => item.id === activeRound.image.id);
                if (!record) {
                    throw new Error('Saved local puzzle image is missing from the local library.');
                }
                imageLoaded = await this.trackAssetLoad(this.loadPersistedLocalPuzzleImage(record));
                if (imageLoaded) {
                    this.selectedConfig = Object.freeze({
                        boardSize: activeRound.boardSize,
                        imageSource: 'local',
                        imageUri: record.path,
                    });
                    this.localPuzzleRecordId = record.id;
                }
            }

            if (!imageLoaded || (this.state as SlidingPuzzleState) === 'disposed') {
                throw new Error('Saved sliding puzzle image could not be loaded.');
            }

            const restored = this.model.restore(Object.freeze({
                size: activeRound.boardSize,
                board: activeRound.board,
                emptyIndex: activeRound.emptyIndex,
                moves: activeRound.moves,
                completed: false,
            }));
            if (restored.completed) {
                throw new Error('Completed sliding puzzle saves are not recoverable.');
            }

            this.elapsedSeconds = activeRound.elapsedSeconds;
            this.showTileNumbers = activeRound.showTileNumbers;
            this.savedProgressDiscarded = false;
            this.completionRequested = false;
            this.completionTransitionPending = false;
            this.completionImageRevealed = false;
            this.state = 'playing';
            this.inputLocked = false;
            this.context?.reportScore(0);
            this.showPlay();
            return true;
        } catch (error: unknown) {
            if ((this.state as SlidingPuzzleState) === 'disposed') {
                return false;
            }
            // TODO: console.warn('[SlidingPuzzleGame] Invalid active round was discarded.', error);
            this.writeActiveRound(undefined);
            this.releaseImageResources();
            this.selectedSize = 4;
            this.selectedPresetIndex = 0;
            this.selectedConfig = Object.freeze({
                boardSize: 4,
                imageSource: 'preset',
                presetAssetPath: SLIDING_PUZZLE_PRESET_ASSET_PATHS[0],
            });
            this.state = 'ready';
            return false;
        }
    }

    private parseActiveRound(value: unknown): SlidingPuzzleActiveRound | undefined {
        if (!isRecordValue(value)
            || value.version !== 1
            || value.inProgress !== true
            || typeof value.boardSize !== 'number'
            || !SLIDING_PUZZLE_BOARD_SIZES.some((size) => size === value.boardSize)
            || !Array.isArray(value.board)
            || typeof value.emptyIndex !== 'number'
            || typeof value.moves !== 'number'
            || typeof value.elapsedSeconds !== 'number'
            || !Number.isFinite(value.elapsedSeconds)
            || value.elapsedSeconds < 0
            || typeof value.showTileNumbers !== 'boolean'
            || typeof value.updatedAt !== 'number'
            || !Number.isFinite(value.updatedAt)
            || !isRecordValue(value.image)
            || (value.image.kind !== 'preset' && value.image.kind !== 'local')) {
            return undefined;
        }

        const boardSize = value.boardSize as SlidingPuzzleBoardSize;
        const board = value.board;
        if (board.length !== boardSize * boardSize
            || board.some((tile) => typeof tile !== 'number' || !Number.isInteger(tile))) {
            return undefined;
        }

        const image = value.image;
        if ((image.kind === 'preset' && typeof image.path !== 'string')
            || (image.kind === 'local' && typeof image.id !== 'string')) {
            return undefined;
        }

        return Object.freeze({
            version: 1,
            inProgress: true,
            boardSize,
            board: Object.freeze(Array.from(board) as number[]),
            emptyIndex: value.emptyIndex,
            moves: value.moves,
            elapsedSeconds: value.elapsedSeconds,
            showTileNumbers: value.showTileNumbers,
            image: image.kind === 'preset'
                ? Object.freeze({ kind: 'preset' as const, path: image.path as string })
                : Object.freeze({ kind: 'local' as const, id: image.id as string }),
            updatedAt: value.updatedAt,
        });
    }

    private persistProgress(): void {
        if (this.savedProgressDiscarded) return;
        const snapshot = this.model.snapshot;
        if (snapshot.completed) {
            this.writeActiveRound(undefined);
            return;
        }

        let image: SlidingPuzzleSavedImage | undefined;
        if (this.selectedConfig.imageSource === 'preset'
            && this.selectedConfig.presetAssetPath
            && SLIDING_PUZZLE_PRESET_ASSET_PATHS.indexOf(this.selectedConfig.presetAssetPath) >= 0) {
            image = Object.freeze({
                kind: 'preset',
                path: this.selectedConfig.presetAssetPath,
            });
        } else if (this.selectedConfig.imageSource === 'local' && this.localPuzzleRecordId) {
            image = Object.freeze({ kind: 'local', id: this.localPuzzleRecordId });
        }
        if (!image) return;

        this.writeActiveRound(Object.freeze({
            version: 1,
            inProgress: true,
            boardSize: snapshot.size,
            board: Object.freeze(Array.from(snapshot.board)),
            emptyIndex: snapshot.emptyIndex,
            moves: snapshot.moves,
            elapsedSeconds: Math.max(0, this.elapsedSeconds),
            showTileNumbers: this.showTileNumbers,
            image,
            updatedAt: Date.now(),
        }));
    }

    private currentSave(): GameSaveData | undefined {
        const context = this.context;
        if (!context) return undefined;
        const data = context.services.storage.getGameData(context.gameId);
        return data?.dataVersion === SLIDING_PUZZLE_DATA_VERSION ? data : undefined;
    }

    private writeActiveRound(activeRound: SlidingPuzzleActiveRound | undefined): void {
        const context = this.context;
        if (!context) return;
        const storage = context.services.storage;
        const previous = this.currentSave();
        const previousCustom = isRecordValue(previous?.custom) ? previous.custom : {};
        const custom: Record<string, unknown> = {};
        Object.keys(previousCustom).forEach((key) => {
            if (key !== 'activeRound') custom[key] = previousCustom[key];
        });
        if (activeRound) custom.activeRound = activeRound;

        try {
            storage.writeGameData(context.gameId, Object.freeze({
                dataVersion: SLIDING_PUZZLE_DATA_VERSION,
                playCount: previous?.playCount ?? 0,
                ...(previous?.highScore === undefined ? {} : { highScore: previous.highScore }),
                ...(previous?.lastPlayedAt === undefined ? {} : { lastPlayedAt: previous.lastPlayedAt }),
                custom: Object.freeze(custom),
            }));
        } catch (error: unknown) {
            // TODO: console.warn('[SlidingPuzzleGame] Failed to update active round save.', error);
        }
    }

    private async loadPersistedLocalPuzzleImage(record: LocalPuzzleRecord): Promise<boolean> {
        const context = this.context;
        if (!context || this.state === 'disposed') return false;
        const selection = await context.services.platform.openPersistedLocalImage(record.path);
        if (!selection || (this.state as SlidingPuzzleState) === 'disposed') {
            selection?.release();
            return false;
        }

        const imageAsset = await new Promise<ImageAsset | undefined>((resolve) => {
            try {
                assetManager.loadRemote<ImageAsset>(
                    selection.uri,
                    { ext: '.jpg' },
                    (error, asset) => resolve(error ? undefined : asset),
                );
            } catch (error: unknown) {
                // TODO: console.warn('[SlidingPuzzleGame] Failed to decode persisted local image.', error);
                resolve(undefined);
            }
        });
        selection.release();
        if (!imageAsset || (this.state as SlidingPuzzleState) === 'disposed') {
            this.releaseRemoteImageAsset(imageAsset);
            return false;
        }

        let texture: Texture2D | undefined;
        try {
            texture = new Texture2D();
            texture.image = imageAsset;
        } catch (error: unknown) {
            texture?.destroy();
            this.releaseRemoteImageAsset(imageAsset);
            // TODO: console.warn('[SlidingPuzzleGame] Failed to create persisted local texture.', error);
            return false;
        }

        this.releaseImageResources();
        this.imageAsset = imageAsset;
        this.imageTexture = texture;
        this.imageTextureOwned = true;
        this.localPuzzleRecordId = record.id;
        return true;
    }

    private async selectRandomPuzzle(): Promise<void> {
        if (this.state !== 'setup' || this.inputLocked) return;
        const seenKeys = new Set<string>();
        const allSources = this.getSortedPuzzleLibrarySources().filter((source) => {
            const key = puzzleLibrarySourceKey(source);
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });
        if (allSources.length === 0) return;

        const sourceKeys = allSources.map(puzzleLibrarySourceKey);
        if (sourceKeys.length !== this.randomPuzzleSourceKeys.length
            || sourceKeys.some((key) => this.randomPuzzleSourceKeys.indexOf(key) < 0)) {
            this.randomPuzzleSourceKeys = sourceKeys;
            this.randomPuzzleQueue = [];
        }
        const isCurrent = (source: PuzzleLibrarySource): boolean => source.kind === 'preset'
            ? this.selectedConfig.imageSource === 'preset'
                && this.selectedConfig.presetAssetPath === source.path
            : this.selectedConfig.imageSource === 'local'
                && this.localPuzzleRecordId === source.id;
        this.inputLocked = true;
        this.cropController.cancel();

        try {
            // 一轮里每张图最多抽到一次；失效的本地文件或加载失败的预置图
            // 在本次点击中跳过，继续尝试队列里的其他图片。
            const attempted = new Set<string>();
            while (attempted.size < allSources.length && this.state === 'setup') {
                if (this.randomPuzzleQueue.length === 0) {
                    this.shuffleRandomPuzzleQueue(allSources);
                }
                const queue = this.randomPuzzleQueue;
                const lastIndex = queue.length - 1;
                if (queue.length > 1 && isCurrent(queue[lastIndex])) {
                    const alternativeIndex = queue.findIndex((source) => !isCurrent(source));
                    if (alternativeIndex >= 0) {
                        [queue[lastIndex], queue[alternativeIndex]] = [queue[alternativeIndex], queue[lastIndex]];
                    }
                }
                const source = queue.pop()!;
                const key = puzzleLibrarySourceKey(source);
                if (attempted.has(key)) continue;
                attempted.add(key);
                if (allSources.length > 1 && isCurrent(source)) continue;

                if (source.kind === 'local' && source.id) {
                    const record = this.getLocalPuzzleRecords().find((item) => item.id === source.id);
                    if (!record || !await this.loadPersistedLocalPuzzleImage(record)) {
                        continue;
                    }
                    if ((this.state as SlidingPuzzleState) === 'disposed') return;
                    this.selectedConfig = Object.freeze({
                        boardSize: this.selectedSize,
                        imageSource: 'local',
                        imageUri: record.path,
                    });
                    this.localPuzzleRecordId = record.id;
                    this.context?.services.feedback.play('uiButton');
                    this.showSetup();
                    return;
                }

                if (source.kind === 'preset') {
                    const presetIndex = SLIDING_PUZZLE_PRESET_ASSET_PATHS.indexOf(source.path);
                    if (presetIndex < 0) continue;
                    const previousConfig = this.selectedConfig;
                    const previousPresetIndex = this.selectedPresetIndex;
                    this.selectedPresetIndex = presetIndex;
                    this.selectedConfig = Object.freeze({
                        boardSize: this.selectedSize,
                        imageSource: 'preset',
                        presetAssetPath: source.path,
                    });
                    if (!await this.loadPresetImage(true)) {
                        this.selectedConfig = previousConfig;
                        this.selectedPresetIndex = previousPresetIndex;
                        continue;
                    }
                    this.context?.services.feedback.play('uiButton');
                    return;
                }
            }
            this.context?.services.feedback.play('collision');
        } finally {
            if (this.state === 'setup') this.inputLocked = false;
        }
    }

    private shuffleRandomPuzzleQueue(sources: readonly PuzzleLibrarySource[]): void {
        const queue = Array.from(sources);
        for (let index = queue.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
        }
        this.randomPuzzleQueue = queue;
    }

    private async loadResourceBundle() {
        const assets = this.context?.services.assets;
        if (!assets || this.state === 'disposed') return undefined;
        try {
            return await assets.loadBundle(SLIDING_PUZZLE_RESOURCE_BUNDLE);
        } catch (error: unknown) {
            // TODO: console.warn('[SlidingPuzzleGame] Failed to load resource bundle.', error);
            return undefined;
        }
    }

    private getLocalPuzzleRecords(): LocalPuzzleRecord[] {
        const value = this.currentSave()?.custom?.localPuzzleLibrary;
        if (!Array.isArray(value)) return [];
        const records: LocalPuzzleRecord[] = [];
        value.forEach((item) => {
            if (!isRecordValue(item)
                || typeof item.id !== 'string'
                || typeof item.path !== 'string'
                || typeof item.width !== 'number'
                || typeof item.height !== 'number'
                || typeof item.createdAt !== 'number'
                || typeof item.lastPlayedAt !== 'number') return;
            records.push(Object.freeze({
                id: item.id,
                path: item.path,
                width: item.width,
                height: item.height,
                createdAt: item.createdAt,
                lastPlayedAt: item.lastPlayedAt,
            }));
        });
        return records;
    }

    private getSortedPuzzleLibrarySources(): readonly PuzzleLibrarySource[] {
        const previous = this.currentSave();
        const historyValue = previous?.custom?.presetLastPlayedAt;
        const history = isRecordValue(historyValue) ? historyValue : {};
        const selectedPresetPath = this.selectedConfig.imageSource === 'preset'
            ? this.selectedConfig.presetAssetPath
            : undefined;
        const presets: PuzzleLibrarySource[] = SLIDING_PUZZLE_PRESET_ASSET_PATHS
            .map((path, originalIndex) => {
                const value = history[path];
                const lastPlayedAt = typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : 0;
                return Object.freeze({
                    kind: 'preset' as const,
                    path,
                    originalIndex,
                    lastPlayedAt,
                    selected: path === selectedPresetPath,
                });
            });
        const locals: PuzzleLibrarySource[] = this.getLocalPuzzleRecords().map((record, index) => Object.freeze({
            kind: 'local' as const,
            path: record.path,
            id: record.id,
            lastPlayedAt: record.lastPlayedAt,
            originalIndex: presets.length + index,
            selected: this.selectedConfig.imageSource === 'local' && this.localPuzzleRecordId === record.id,
        }));
        return presets.concat(locals)
            .sort((left, right) => {
                if (left.selected !== right.selected) {
                    return left.selected ? -1 : 1;
                }
                return right.lastPlayedAt - left.lastPlayedAt
                    || left.originalIndex - right.originalIndex;
            })
            ;
    }

    private async persistCurrentLocalPuzzle(): Promise<void> {
        const context = this.context;
        const texture = this.imageTexture;
        if (!context || !texture) return;
        const now = Date.now();
        const previousConfig = this.selectedConfig;
        const transientSelection = this.localImageSelection;
        let newRecord: LocalPuzzleRecord | undefined;
        let records = this.getLocalPuzzleRecords();
        try {
            if (this.localPuzzleRecordId) {
                records = records.map((record) => record.id === this.localPuzzleRecordId
                    ? Object.freeze({ ...record, lastPlayedAt: now })
                    : record);
            } else {
                const uri = transientSelection?.uri ?? this.selectedConfig.imageUri;
                if (!uri) return;
                const id = `custom-${now}-${Math.floor(Math.random() * 0x1000000).toString(16)}`;
                const path = await context.services.platform.persistLocalImage(uri, id);
                if (!path) return;
                newRecord = Object.freeze({ id, path, width: texture.width, height: texture.height, createdAt: now, lastPlayedAt: now });
                this.localPuzzleRecordId = id;
                this.selectedConfig = Object.freeze({ ...this.selectedConfig, imageUri: path });
                records.push(newRecord);
            }
            records.sort((left, right) => right.lastPlayedAt - left.lastPlayedAt);
            let retained = records.slice(0, MAX_LOCAL_PUZZLE_HISTORY);
            const activeRecord = this.localPuzzleRecordId
                ? records.find((record) => record.id === this.localPuzzleRecordId)
                : undefined;
            if (activeRecord && !retained.some((record) => record.id === activeRecord.id)) {
                retained = retained.slice(0, MAX_LOCAL_PUZZLE_HISTORY - 1).concat(activeRecord);
            }
            const removed = records.filter((record) => (
                !retained.some((retainedRecord) => retainedRecord.id === record.id)
            ));
            records = retained;
            const storage = context.services.storage;
            const previous = this.currentSave();
            const previousCustom = isRecordValue(previous?.custom) ? previous.custom : {};
            storage.writeGameData(context.gameId, Object.freeze({
                dataVersion: SLIDING_PUZZLE_DATA_VERSION,
                playCount: (previous?.playCount ?? 0) + 1,
                ...(previous?.highScore === undefined ? {} : { highScore: previous.highScore }),
                lastPlayedAt: now,
                custom: Object.freeze({ ...previousCustom, localPuzzleLibrary: Object.freeze(records) }),
            }));
            if (newRecord) {
                transientSelection?.release();
                this.localImageSelection = undefined;
            }
            await Promise.all(removed.map((record) => context.services.platform.deletePersistedLocalImage(record.path)));
        } catch (error: unknown) {
            if (newRecord) {
                await context.services.platform.deletePersistedLocalImage(newRecord.path);
                this.localPuzzleRecordId = undefined;
                this.selectedConfig = previousConfig;
            }
            // TODO: console.warn('[SlidingPuzzleGame] Failed to update local puzzle library.', error);
        }
    }

    private recordPresetPlayed(path: string): void {
        const context = this.context;
        if (!context || SLIDING_PUZZLE_PRESET_ASSET_PATHS.indexOf(path) < 0) {
            return;
        }

        const storage = context.services.storage;
        const previous = this.currentSave();
        const previousCustom = isRecordValue(previous?.custom) ? previous.custom : {};
        const historyValue = previousCustom.presetLastPlayedAt;
        const previousHistory = isRecordValue(historyValue) ? historyValue : {};
        const history: Record<string, number> = {};
        Object.keys(previousHistory).forEach((presetPath) => {
            const value = previousHistory[presetPath];
            if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                history[presetPath] = value;
            }
        });
        const now = Date.now();
        history[path] = now;
        const save: GameSaveData = Object.freeze({
            dataVersion: SLIDING_PUZZLE_DATA_VERSION,
            playCount: (previous?.playCount ?? 0) + 1,
            ...(previous?.highScore === undefined ? {} : { highScore: previous.highScore }),
            lastPlayedAt: now,
            custom: Object.freeze({
                ...previousCustom,
                presetLastPlayedAt: Object.freeze(history),
            }),
        });
        try {
            storage.writeGameData(context.gameId, save);
        } catch (error: unknown) {
            // 最近游玩记录失败不能阻断开局；下次仍按已有顺序展示。
            // TODO: console.warn('[SlidingPuzzleGame] Failed to save preset play history.', error);
        }
    }

    private releasePresetLibraryTextures(): void {
        this.presetLibraryLoadToken += 1;
        this.presetLibraryTextures.forEach((entry) => {
            if (entry.releaseOnClose && entry.texture) {
                if (entry.kind === 'local') {
                    entry.texture.destroy();
                    // loadRemote 的 ImageAsset 由 AssetManager 缓存。直接 destroy
                    // 会留下仍可命中、但 native 数据已经失效的缓存条目，导致
                    // 退出拼图库后再次随机或重进拼图库永久加载失败。
                    this.releaseRemoteImageAsset(entry.imageAsset);
                } else {
                    this.releaseBundleTexture(entry.texture);
                }
            }
        });
        this.presetLibraryTextures = [];
    }

    private releaseRemoteImageAsset(imageAsset: ImageAsset | undefined): void {
        if (!imageAsset) return;
        try {
            // 既释放 native 图片数据，也让 AssetManager 清除 loadRemote 缓存；
            // 所有本地图片加载分支统一走这里，避免缓存中残留已销毁对象。
            assetManager.releaseAsset(imageAsset);
        } catch (error: unknown) {
            imageAsset.destroy();
        }
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
            this.timerLabel.string = this.formatDuration(this.elapsedSeconds);
        }
        if (this.movesLabel) {
            this.movesLabel.string = `${this.model.moves}`;
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
        if (previousState === 'preset-library') {
            this.showPresetLibrary();
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
        this.displayModeSwitchNode = undefined;
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
