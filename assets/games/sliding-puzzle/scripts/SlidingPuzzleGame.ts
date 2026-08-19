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
    UITransform,
    Vec3,
    view,
} from 'cc';
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
import type { GameResult } from '../../../core/types/CommonTypes';
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
const POPUP_LIFT = 36;
// 棋盘背景素材为 512×512，实际木框内槽从约 32px 处开始。
// 用素材比例计算，确保不同屏幕尺寸下拼图外沿仍与内槽边界对齐。
const BOARD_INNER_INSET_RATIO = 32 / 512;

export const SLIDING_PUZZLE_BACKGROUND_ASSET_PATH =
    'visual/backgrounds/sliding-puzzle-background-v1/texture';

export const SLIDING_PUZZLE_BOARD_ASSET_PATH =
    'visual/boards/sliding-puzzle-board-v1/texture';

const SLIDING_PUZZLE_PRESET_ASSET_PATHS: readonly string[] = Object.freeze([
    // 当前仓库已实际交付的预置图；后续 V01～V06 进入 Bundle 后只需在这里登记。
    'visual/presets/preset-07-cats-cover-v1/texture',
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
    private touchStartX = 0;
    private touchStartY = 0;
    private layout?: SlidingPuzzleLayoutMetrics;
    private timerLabel?: Label;
    private movesLabel?: Label;
    private boardNode?: Node;
    private backgroundNode?: Node;
    private dynamicNode?: Node;
    private overlayNode?: Node;
    private activePauseModel?: MiniGamePauseModel;
    private activeResultModel?: MiniGameResultModel;
    private referenceReturnState: 'playing' | 'paused' | 'completed' = 'playing';
    private unsubscribeShow?: () => void;
    private unsubscribeHide?: () => void;
    private resizeListening = false;
    private imageTexture?: Texture2D;
    private imageAsset?: ImageAsset;
    private imageTextureOwned = false;
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
    private restartToSetupAfterRuntimeRestart = false;
    private cropPreviewNode?: Node;
    private cropPreviewSprite?: Sprite;
    private cropPreviewFrame?: SpriteFrame;
    private cropLastX = 0;
    private cropLastY = 0;
    private cropPinchDistance = 0;

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
    }

    resume(): void {
        if (this.state !== 'paused') {
            return;
        }

        this.state = 'playing';
        this.inputLocked = false;
        this.hidePauseMenu();
    }

    async restart(context?: MiniGameContext<SlidingPuzzleServices>): Promise<void> {
        if (context) {
            this.context = context;
        }

        if (this.state === 'disposed') {
            throw new Error('Cannot restart a disposed sliding puzzle.');
        }

        this.hidePauseMenu();
        this.hideResultView();
        this.hideReferencePreview();
        const restartToSetup = this.restartToSetupAfterRuntimeRestart;
        this.restartToSetupAfterRuntimeRestart = false;
        if (restartToSetup) {
            this.state = 'setup';
            this.elapsedSeconds = 0;
            this.completionRequested = false;
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
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') {
            return;
        }

        this.destroyOverlay();
        this.activePauseModel = model;
        this.inputLocked = true;
        const overlay = this.createOverlay('SlidingPuzzlePauseOverlay');
        const panelWidth = 640;
        const panelHeight = 720;
        const panel = this.createPopupPanel(overlay, 'PausePanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        this.createLabel(panel, 'PauseKicker', '拼图暂停', 0, 290, 40, COLORS.tealDark, 520, 58);
        this.createLabel(
            panel,
            'PauseBody',
            '棋盘和计时已停住\n回来后继续寻找下一块空位',
            0,
            202,
            24,
            COLORS.ink,
            540,
            94,
        );
        this.createButton(panel, 'ResumeButton', '继续拼图', 0, 68, 480, 84, COLORS.teal, () => {
            this.runUiAction('resume', model.resume);
        });
        this.createButton(panel, 'RestartButton', '重新开局', 0, -40, 480, 84, COLORS.wood, () => {
            this.runUiAction('restart', model.restart);
        });
        this.createButton(panel, 'ChooseImageButton', '重新选图', 0, -148, 480, 84, COLORS.wood, () => {
            this.runUiAction('choose-image', async () => {
                this.restartToSetupAfterRuntimeRestart = true;
                try {
                    await model.restart();
                } finally {
                    this.restartToSetupAfterRuntimeRestart = false;
                }
            });
        });
        this.createButton(panel, 'LobbyButton', '返回大厅', 0, -256, 480, 84, COLORS.red, () => {
            this.runUiAction('exit', model.exit);
        });
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
        this.inputLocked = true;
        this.destroyOverlay();
        const overlay = this.createOverlay('SlidingPuzzleResultOverlay');
        const panelWidth = 640;
        const panelHeight = 650;
        const panel = this.createPopupPanel(overlay, 'ResultPanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        const title = model.result.completed ? '拼图完成' : '本局结束';
        this.createLabel(panel, 'ResultTitle', title, 0, 258, 36, COLORS.woodDark, 540, 56);
        this.createLabel(
            panel,
            'ResultStats',
            `用时 ${this.formatDuration(this.elapsedSeconds)}  ·  步数 ${this.model.moves}\n${this.selectedConfig.imageSource === 'local' ? '自选图片' : '预设图片'}`,
            0,
            154,
            26,
            COLORS.ink,
            540,
            84,
        );
        if (this.imageTexture) {
            this.createImagePreview(panel, 0, -32, 280, 280, '');
        } else {
            this.createPlaceholderPreview(panel, 0, -32, 280, 280, '完成图片占位');
        }
        this.createButton(panel, 'RestartButton', '再来一局', -140, -248, 240, 84, COLORS.teal, () => {
            this.runUiAction('restart', model.restart);
        });
        this.createButton(panel, 'LobbyButton', '返回大厅', 140, -248, 240, 84, COLORS.red, () => {
            this.runUiAction('exit', model.returnToLobby);
        });
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
            58,
            () => this.requestLobbyFromSetup(),
        );
        this.createLabel(root, 'Title', '木框拼图', 0, metrics.headerY - 22, 38, COLORS.paperLight, 420, 56);

        const panel = this.createPanel(
            root,
            'SetupCard',
            metrics.setupPanelWidth,
            metrics.setupPanelHeight,
            COLORS.paper,
            32,
        );
        panel.setPosition(0, metrics.setupPanelCenterY, 0);
        const panelTop = metrics.setupPanelHeight / 2;
        const compact = metrics.setupPanelHeight < 760;
        const previewSize = clamp(
            Math.min(compact ? 220 : 292, metrics.setupPanelHeight * (compact ? 0.34 : 0.34)),
            compact ? 160 : 220,
            compact ? 220 : 292,
        );
        const previewY = panelTop - (compact ? 130 : 210);
        if (this.imageTexture) {
            this.createImagePreview(
                panel,
                0,
                previewY,
                previewSize,
                previewSize,
                '',
            );
        } else {
            this.createPlaceholderPreview(panel, 0, previewY, previewSize, previewSize, '正在准备图片');
        }

        const sizeCaptionY = previewY - previewSize / 2 - (compact ? 26 : 34);
        this.createLabel(
            panel,
            'SizeCaption',
            '选择棋盘尺寸',
            0,
            sizeCaptionY,
            compact ? 24 : 28,
            COLORS.ink,
            440,
            compact ? 36 : 42,
        );
        const sizeButtonWidth = Math.min(compact ? 94 : 108, Math.max(64, (metrics.setupPanelWidth - 64) / 4 - 4));
        const sizeButtonHeight = compact ? 72 : 76;
        const sizeSpacing = sizeButtonWidth + 8;
        const sizeY = sizeCaptionY - (compact ? 52 : 60);
        SLIDING_PUZZLE_BOARD_SIZES.forEach((size, index) => {
            const x = (index - 1.5) * sizeSpacing;
            this.createButton(
                panel,
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
            );
        });

        const sourceButtonWidth = Math.min(compact ? 240 : 258, Math.max(132, (metrics.setupPanelWidth - 48) / 2));
        const sourceButtonHeight = compact ? 74 : 78;
        const sourceOffset = sourceButtonWidth / 2 + 16;
        const sourceY = sizeY - (compact ? 96 : 116);
        this.createButton(panel, 'PresetButton', '随机一张拼图', -sourceOffset, sourceY, sourceButtonWidth, sourceButtonHeight, COLORS.wood, () => {
            this.selectedPresetIndex = this.getRandomPresetIndex();
            this.imageLoadToken += 1;
            this.releaseImageResources();
            this.selectedConfig = Object.freeze({
                boardSize: this.selectedSize,
                imageSource: 'preset',
                presetAssetPath: SLIDING_PUZZLE_PRESET_ASSET_PATHS[this.selectedPresetIndex],
            });
            this.cropController.cancel();
            this.context?.services.feedback.play('uiButton');
            this.showSetup();
            void this.trackAssetLoad(this.loadPresetImage(true));
        });
        this.createButton(panel, 'ImageButton', '选择图片', sourceOffset, sourceY, sourceButtonWidth, sourceButtonHeight, COLORS.teal, () => {
            void this.pickLocalImage();
        });

        const startWidth = Math.min(compact ? 440 : 480, metrics.setupPanelWidth - 32);
        const startHeight = compact ? 80 : 100;
        const startY = compact
            ? Math.max(-panelTop + startHeight / 2 + 4, sourceY - 92)
            : sourceY - 130;
        this.createButton(panel, 'StartButton', '开始拼图', 0, startY, startWidth, startHeight, COLORS.red, () => {
            void this.startRound();
        }, compact ? 28 : 30);
    }

    private async pickLocalImage(): Promise<void> {
        if (!this.context || this.state === 'disposed') {
            return;
        }

        this.state = 'picking-image';
        this.inputLocked = true;
        // 选择器打开期间移除开始页点击层，避免用户在异步回调返回前重复开局或切换图片。
        this.destroyDynamicView();
        const selection = await this.context.services.platform.pickLocalImage();
        this.inputLocked = false;
        if ((this.state as SlidingPuzzleState) === 'disposed') {
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
        const bundle = assetManager.getBundle('game-sliding-puzzle');
        if (!path || !bundle) {
            return false;
        }
        if (this.imageTexture && !this.imageTextureOwned) {
            return true;
        }

        this.imageLoadToken += 1;
        const token = this.imageLoadToken;
        this.releasePendingImageResources();
        this.releaseImageResources();
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
            if (texture) {
                // 这次请求已经拿到 Bundle 资源，但所属局面已经失效，
                // 必须在 Bundle 释放前平衡本次 load 的引用。
                this.releaseBundleTexture(texture);
            }
            return false;
        }

        this.imageTexture = texture;
        this.imageTextureOwned = false;
        if (refreshSetup && this.state === 'setup') {
            this.showSetup();
        }
        return texture !== undefined;
    }

    private async loadVisualAssets(): Promise<void> {
        const bundle = assetManager.getBundle('game-sliding-puzzle');
        if (!bundle || this.state === 'disposed') {
            return;
        }

        const token = ++this.visualLoadToken;
        const entries = (Object.keys(SLIDING_PUZZLE_VISUAL_ASSET_PATHS) as SlidingPuzzleVisualKey[])
            .map((key): [SlidingPuzzleVisualKey, string] => [
                key,
                SLIDING_PUZZLE_VISUAL_ASSET_PATHS[key],
            ]);
        const loaded = await Promise.all(entries.map(async ([key, path]) => {
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
        this.destroyTileFrames();
        this.destroyTransientFrames();
        const imageAsset = this.imageAsset;
        const texture = this.imageTexture;
        const ownsTexture = this.imageTextureOwned;
        this.imageAsset = undefined;
        this.imageTexture = undefined;
        this.imageTextureOwned = false;

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
        this.createLabel(root, 'CropTitle', '调整图片', 0, metrics.titleY, 40, COLORS.paperLight, 650, 60);
        this.createLabel(
            root,
            'CropBody',
            '拖动图片调整取景位置\n使用下方按钮缩放正方形取景框',
            0,
            metrics.titleY - 62,
            21,
            COLORS.paper,
            650,
            80,
        );
        if (this.getPreviewTexture()) {
            this.createImagePreview(
                root,
                0,
                metrics.titleY - 270,
                430,
                300,
                '本地图片',
                true,
            );
        } else {
            this.createPlaceholderPreview(root, 0, metrics.titleY - 270, 430, 300, '本地图片占位');
        }
        this.createButton(root, 'ZoomOut', '−', -150, metrics.footerY + 150, 100, 88, COLORS.wood, () => {
            this.cropController.zoom(-0.2);
            this.refreshCropPreview();
            this.context?.services.feedback.play('toggle');
        });
        this.createButton(root, 'ZoomIn', '+', 150, metrics.footerY + 150, 100, 88, COLORS.wood, () => {
            this.cropController.zoom(0.2);
            this.refreshCropPreview();
            this.context?.services.feedback.play('toggle');
        });
        this.createButton(root, 'CancelCrop', '取消', -126, metrics.footerY + 38, 220, 88, COLORS.red, () => {
            this.state = 'setup';
            this.cropController.cancel();
            this.showSetup();
            this.releasePendingImageResources();
        });
        this.createButton(root, 'ConfirmCrop', '使用这张图', 126, metrics.footerY + 38, 250, 88, COLORS.teal, () => {
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
            || this.state === 'playing'
            || this.uiActionPending) {
            return;
        }

        this.state = 'starting';
        this.inputLocked = true;
        this.completionRequested = false;
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
        this.timerLabel = this.createLabel(root, 'Timer', '用时 00:00', -112, metrics.headerY - 58, 28, COLORS.paperLight, 240, 44);
        this.movesLabel = this.createLabel(root, 'Moves', '步数 000', 112, metrics.headerY - 58, 28, COLORS.paperLight, 240, 44);
        this.createIconButton(
            root,
            'ReferenceButton',
            -metrics.viewportWidth / 2 + 64,
            metrics.headerY,
            'referenceIcon',
            58,
            () => {
                this.showReferencePreview();
            },
        );
        this.createIconButton(root, 'PauseButton', metrics.pauseX, metrics.pauseY, 'pauseIcon', 58, () => {
            if (this.state === 'playing') {
                this.context?.services.feedback.play('uiButton');
                this.context?.requestPause();
            }
        });

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
    }

    private readonly handleTouchStart = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked) {
            return;
        }

        const location = event.getUILocation();
        this.touchStartX = location.x;
        this.touchStartY = location.y;
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked) {
            return;
        }

        const location = event.getUILocation();
        const deltaX = location.x - this.touchStartX;
        const deltaY = location.y - this.touchStartY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_THRESHOLD) {
            this.handleBoardTap(location);
            return;
        }

        const direction: SlidingPuzzleDirection = Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'up' : 'down');
        this.performMove(direction);
    };

    private handleBoardTap(location: { readonly x: number; readonly y: number }): void {
        const tileIndex = this.getBoardTileIndex(location);
        if (tileIndex < 0) {
            return;
        }

        const result = this.model.moveTileAt(tileIndex);
        if (result.changed) {
            this.applyMoveResult(result);
        }
    }

    private getBoardTileIndex(location: { readonly x: number; readonly y: number }): number {
        const board = this.boardNode;
        const metrics = this.layout;
        if (!board || !metrics) {
            return -1;
        }

        const transform = board.getComponent(UITransform);
        if (!transform) {
            return -1;
        }

        const local = transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
        const innerSize = metrics.boardSize * (1 - BOARD_INNER_INSET_RATIO * 2);
        const tileAreaSize = Math.max(1, innerSize - TILE_EDGE_INSET * 2);
        const size = this.model.boardSize;
        const cellSize = tileAreaSize / size;
        if (local.x < -tileAreaSize / 2 || local.x > tileAreaSize / 2
            || local.y < -tileAreaSize / 2 || local.y > tileAreaSize / 2) {
            return -1;
        }

        const column = Math.min(size - 1, Math.floor((local.x + tileAreaSize / 2) / cellSize));
        const row = Math.min(size - 1, Math.floor((tileAreaSize / 2 - local.y) / cellSize));
        return row * size + column;
    }

    private readonly handleTouchCancel = (): void => {
        this.touchStartX = 0;
        this.touchStartY = 0;
    };

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

        this.inputLocked = true;
        this.context?.services.feedback.play('drop');
        this.renderBoard();
        this.refreshHud();
        this.scheduleOnce(() => {
            this.inputLocked = false;
        }, 0.08);

        if (result.completed) {
            this.finishRound();
        }
    }

    private finishRound(): void {
        if (this.completionRequested) {
            return;
        }

        this.completionRequested = true;
        this.state = 'completed';
        this.inputLocked = true;
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
        this.context?.requestExit(result);
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
        const panelHeight = 650;
        const panel = this.createPopupPanel(overlay, 'ReferencePanel', panelWidth, panelHeight);
        panel.setPosition(0, this.getPopupCenterY(), 0);
        this.setPopupScale(panel, panelWidth, panelHeight);
        this.createLabel(panel, 'ReferenceTitle', '参考图', 0, 244, 34, COLORS.woodDark, 480, 52);
        this.createIconButton(
            panel,
            'CloseReference',
            panelWidth / 2 - 92,
            panelHeight / 2 - 92,
            'closeIcon',
            56,
            () => this.hideReferencePreview(),
        );
        if (this.imageTexture) {
            this.createImagePreview(
                panel,
                0,
                4,
            430,
            430,
                '',
            );
        } else {
            this.createPlaceholderPreview(
                panel,
                0,
                4,
                430,
                430,
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
            frame.insetLeft = Math.min(180, frame.originalSize.width * 0.24);
            frame.insetRight = Math.min(180, frame.originalSize.width * 0.24);
            frame.insetTop = Math.min(150, frame.originalSize.height * 0.24);
            frame.insetBottom = Math.min(150, frame.originalSize.height * 0.24);
            sprite.spriteFrame = frame;
        }
        return panel;
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
        this.createLabel(preview, 'PlaceholderCaption', caption, 0, 0, 24, COLORS.ink, width - 34, 70);
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
        const imageSize = Math.max(1, Math.min(width, height) - 28);
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
            preview.on(Node.EventType.TOUCH_CANCEL, this.handleCropTouchEnd, this);
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

        const touches = event.getAllTouches();
        if (touches.length >= 2) {
            this.cropPinchDistance = this.getTouchDistance(touches[0], touches[1]);
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
        const touches = event.getAllTouches();
        if (touches.length >= 2) {
            const nextDistance = this.getTouchDistance(touches[0], touches[1]);
            if (this.cropPinchDistance > 0) {
                const zoomDelta = (nextDistance - this.cropPinchDistance) / (previewWidth * 2);
                if (Math.abs(zoomDelta) >= PREVIEW_PAN_EPSILON) {
                    this.cropController.zoom(zoomDelta);
                    this.refreshCropPreview();
                }
            }
            this.cropPinchDistance = nextDistance;
            return;
        }

        const location = event.getUILocation();
        if (this.cropPinchDistance > 0) {
            this.cropPinchDistance = 0;
            this.cropLastX = location.x;
            this.cropLastY = location.y;
            return;
        }

        const deltaX = (location.x - this.cropLastX) / previewWidth;
        const deltaY = (location.y - this.cropLastY) / previewWidth;
        if (Math.abs(deltaX) < PREVIEW_PAN_EPSILON && Math.abs(deltaY) < PREVIEW_PAN_EPSILON) {
            return;
        }

        this.cropLastX = location.x;
        this.cropLastY = location.y;
        this.cropController.pan(deltaX, deltaY);
        this.refreshCropPreview();
    };

    private readonly handleCropTouchEnd = (): void => {
        this.cropLastX = 0;
        this.cropLastY = 0;
        this.cropPinchDistance = 0;
    };

    private readonly handleCropMouseWheel = (event: EventMouse): void => {
        if (this.state !== 'crop-editing' || this.inputLocked) {
            return;
        }

        const scrollY = event.getScrollY();
        if (Math.abs(scrollY) < PREVIEW_PAN_EPSILON) {
            return;
        }
        this.cropController.zoom(scrollY > 0 ? 0.12 : -0.12);
        this.refreshCropPreview();
    };

    private getTouchDistance(first: { getUILocation: () => { x: number; y: number } }, second: { getUILocation: () => { x: number; y: number } }): number {
        const firstLocation = first.getUILocation();
        const secondLocation = second.getUILocation();
        return Math.hypot(
            secondLocation.x - firstLocation.x,
            secondLocation.y - firstLocation.y,
        );
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
        button.on(Node.EventType.TOUCH_CANCEL, release, this);
        button.on(Node.EventType.TOUCH_END, () => {
            release();
            onClick();
        }, this);
    }

    private runUiAction(label: string, action: () => Promise<void>): void {
        if (this.uiActionPending || this.state === 'disposed') {
            return;
        }

        this.uiActionPending = true;
        let pendingAction: Promise<void>;
        try {
            pendingAction = action();
        } catch (error: unknown) {
            console.error(`[SlidingPuzzleGame] ${label} action failed.`, error);
            this.uiActionPending = false;
            return;
        }
        void pendingAction.then(
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
        } else if (previousState === 'reference-preview') {
            this.showReferencePreview();
        }
    };

    private destroyDynamicView(): void {
        this.boardNode?.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.boardNode?.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.boardNode?.off(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_START, this.handleCropTouchStart, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_MOVE, this.handleCropTouchMove, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_END, this.handleCropTouchEnd, this);
        this.cropPreviewNode?.off(Node.EventType.TOUCH_CANCEL, this.handleCropTouchEnd, this);
        this.cropPreviewNode?.off(Node.EventType.MOUSE_WHEEL, this.handleCropMouseWheel, this);
        this.clearSpriteFrameReferences(this.dynamicNode);
        this.destroyTransientFrames();
        this.boardNode = undefined;
        this.cropPreviewNode = undefined;
        this.cropPreviewSprite = undefined;
        this.cropLastX = 0;
        this.cropLastY = 0;
        this.cropPinchDistance = 0;
        this.timerLabel = undefined;
        this.movesLabel = undefined;
        if (this.dynamicNode?.isValid) {
            this.dynamicNode.destroy();
        }
        this.dynamicNode = undefined;
    }

    private destroyOverlay(): void {
        if (this.overlayNode?.isValid) {
            this.clearSpriteFrameReferences(this.overlayNode);
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
