import { setLabelBold } from '../../services/font/FontBinding';
import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Color,
    Component,
    easing,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Mask,
    Node,
    SafeArea,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    sys,
    view,
    Widget,
} from 'cc';
import type {
    LoadingModel,
    LoadingPresenter,
} from '../../runtime/GameRuntime';
import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';
import type { AssetService } from '../../services/asset/AssetService';
import { LOBBY_BACKGROUND_PATH } from '../ui/LobbyArtwork';
import {
    calculateLobbyBrandMetrics,
    calculateLobbySafeContent,
    LOBBY_DESIGN_WIDTH,
} from '../ui/LobbyBrandLayout';

const { ccclass } = _decorator;

const COLORS = {
    ink: new Color(33, 42, 76, 255),
    secondary: new Color(105, 117, 151, 255),
    blue: new Color(49, 112, 242, 255),
    cyan: new Color(72, 205, 242, 255),
    pink: new Color(241, 105, 174, 255),
    panel: new Color(250, 252, 255, 248),
};

const STARTUP_TITLE_PATH = 'loading/loading-lobby-title-v1/texture';
const LOADING_PANEL_BUNDLE = 'lobby-covers';
const LOADING_PANEL_PATH = 'visual/ui/loading-panel/texture';
/** 面板纹理减半后，以双倍节点缩放保持九宫格边框原有的显示尺寸。 */
const LOADING_PANEL_ART_SCALE = 2;
const LOADING_TRACK_PATH = 'loading/warm/loading-progress-track/texture';
const LOADING_FILL_PATH = 'loading/warm/loading-progress-fill/texture';
const LEGACY_LOADING_RESERVED_GAP = 12;
const LEGACY_LOADING_TITLE_WIDTH = 450;
const LEGACY_LOADING_TITLE_HEIGHT = 300;
const LEGACY_LOADING_TITLE_TOP_GAP = 12;
/** 启动页标题位于屏幕上方三分之一处，尺寸独立于大厅顶部栏里的小标题，只共用等比缩放。 */
const STARTUP_TITLE_WIDTH = 600;
const STARTUP_TITLE_HEIGHT = 198;
const LOBBY_STARTUP_PROGRESS_NODE_HEIGHT = 48;
const LOBBY_STARTUP_PROGRESS_BAR_HEIGHT = 42;
const LOBBY_STARTUP_PROGRESS_FILL_HEIGHT = 29;
const LOBBY_STARTUP_TEXT_SIZE = 28;
const LOBBY_STARTUP_TEXT_BOX_HEIGHT = 54;
const LOBBY_STARTUP_TIP_SIZE = 23;
const LOBBY_STARTUP_TIP_BOX_HEIGHT = 42;
const LOBBY_STARTUP_PERCENT_WIDTH = 88;
/**
 * 游戏加载弹窗版式（设计像素，弹窗宽 640）。自上而下单向排布，
 * 弹窗高度由内容推导，避免上下锚点混用导致间距不一致。
 */
const DIALOG = {
    width: 640,
    padding: 36,
    coverAspect: 3 / 4,
    coverRadius: 28,
    coverTitleGap: 28,
    titleHeight: 62,
    titleFontSize: 50,
    titleDescriptionGap: 6,
    descriptionHeight: 38,
    descriptionFontSize: 27,
    descriptionProgressGap: 34,
    messageHeight: 42,
    messageFontSize: 28,
    messageTrackGap: 8,
    trackHeight: 48,
    trackTipGap: 14,
    tipHeight: 34,
    tipFontSize: 23,
    tipCancelGap: 24,
    cancelWidth: 248,
    cancelHeight: 66,
    cancelFontSize: 28,
    cancelRadius: 22,
    bottomPadding: 32,
    percentWidth: 120,
    screenMargin: 86,
} as const;
const DIALOG_COVER_WIDTH = DIALOG.width - DIALOG.padding * 2;
const DIALOG_COVER_HEIGHT = DIALOG_COVER_WIDTH * DIALOG.coverAspect;
/** 各行中心相对弹窗顶边的距离。 */
const DIALOG_ROWS = (() => {
    let y = DIALOG.padding;
    const cover = y + DIALOG_COVER_HEIGHT / 2;
    y += DIALOG_COVER_HEIGHT + DIALOG.coverTitleGap;
    const title = y + DIALOG.titleHeight / 2;
    y += DIALOG.titleHeight + DIALOG.titleDescriptionGap;
    const description = y + DIALOG.descriptionHeight / 2;
    y += DIALOG.descriptionHeight + DIALOG.descriptionProgressGap;
    const message = y + DIALOG.messageHeight / 2;
    y += DIALOG.messageHeight + DIALOG.messageTrackGap;
    const track = y + DIALOG.trackHeight / 2;
    y += DIALOG.trackHeight + DIALOG.trackTipGap;
    const tip = y + DIALOG.tipHeight / 2;
    y += DIALOG.tipHeight + DIALOG.tipCancelGap;
    const cancel = y + DIALOG.cancelHeight / 2;
    y += DIALOG.cancelHeight + DIALOG.bottomPadding;
    return Object.freeze({ cover, title, description, message, track, tip, cancel, height: y });
})();
const GAME_BACKDROP_COLOR = new Color(46, 26, 16, 150);
const STARTUP_FALLBACK_COLOR = new Color(249, 210, 170, 255);
const STARTUP_TINT_COLOR = new Color(255, 244, 218, 24);
/** 收起：弹窗先缩小淡出（前 55%），遮罩随后完整淡出。 */
const DISMISS_SECONDS = 0.34;
const DISMISS_DIALOG_SHARE = 0.55;
const DIALOG_POP_SECONDS = 0.3;
const CANCEL_REVEAL_DELAY_MS = 3000;
const STARTUP_ART_FADE_SECONDS = 0.36;
const TITLE_FLOAT_PERIOD_SECONDS = 3.2;
const TITLE_FLOAT_AMPLITUDE = 7;
const PROGRESS_SHINE_PERIOD_SECONDS = 2.2;
/** 高光扫过所占周期比例，其余时间停顿，避免持续闪烁。 */
const PROGRESS_SHINE_SWEEP_SHARE = 0.62;
/**
 * 进度填充图（320×32）中橙色主体的纵向范围：顶部 0–3 行为白色釉光，
 * 底部 30–31 行为深色厚边。高光只允许出现在主体内。
 */
const PROGRESS_FILL_SOURCE_HEIGHT = 32;
const PROGRESS_FILL_BODY_TOP_ROWS = 4;
const PROGRESS_FILL_BODY_BOTTOM_ROWS = 2;
/** 高光由宽到窄叠加的斜带（设计像素宽度, alpha），叠出中间亮、两侧柔和的渐变。 */
const PROGRESS_SHINE_BANDS: readonly (readonly [number, number])[] = [
    [34, 14],
    [26, 16],
    [18, 20],
    [11, 26],
    [5, 36],
];
/** 弹窗内元素；游戏变体时挂在 GameDialog 下，以便整体弹出/缩放。 */
const DIALOG_ONLY_NODES = [
    'LoadingPanel',
    'LoadingCoverFrame',
    'LoadingGameName',
    'LoadingGameDescription',
    'LoadingCancelButton',
] as const;
/** 进度行元素；大厅启动页挂在 StartupContent，游戏变体挂在 GameDialog。 */
const PROGRESS_NODES = [
    'LoadingMessage',
    'LoadingPercent',
    'ProgressTrack',
    'ProgressFill',
    'LoadingTip',
] as const;

interface LoadingLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeLeft: number;
    readonly safeRight: number;
    readonly contentWidth: number;
    readonly contentHeight: number;
    readonly contentX: number;
    readonly contentY: number;
    readonly scale: number;
    readonly panelWidth: number;
    readonly panelHeight: number;
    readonly coverWidth: number;
    readonly coverHeight: number;
    readonly trackWidth: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function calculateLoadingLayout(
    width: number,
    height: number,
    safeTop: number,
    safeBottom: number,
    safeLeft: number,
    safeRight: number,
    variant: 'game' | 'lobby',
    topRightReservedBottom = 0,
): LoadingLayoutMetrics {
    const lobbyContent = variant === 'lobby'
        ? calculateLobbySafeContent(width, height, {
            top: safeTop,
            bottom: safeBottom,
            left: safeLeft,
            right: safeRight,
            topRightReservedBottom,
        })
        : undefined;
    const normalizedTop = lobbyContent?.safeTop
        ?? clamp(Math.max(0, safeTop), 0, height * 0.45);
    const normalizedBottom = lobbyContent?.safeBottom
        ?? clamp(Math.max(0, safeBottom), 0, height * 0.45);
    const normalizedLeft = lobbyContent?.safeLeft
        ?? clamp(Math.max(0, safeLeft), 0, width);
    const normalizedRight = lobbyContent?.safeRight
        ?? clamp(Math.max(0, safeRight), 0, Math.max(0, width - normalizedLeft));
    const contentWidth = lobbyContent?.contentWidth
        ?? Math.max(1, width - normalizedLeft - normalizedRight);
    const contentHeight = lobbyContent?.contentHeight
        ?? Math.max(1, height - normalizedTop - normalizedBottom);
    const contentX = lobbyContent?.contentX
        ?? (normalizedLeft - normalizedRight) / 2;
    const contentY = lobbyContent?.contentY
        ?? (normalizedBottom - normalizedTop) / 2;
    const widthScale = Math.min(1, contentWidth / 750);
    const lobbyBrand = variant === 'lobby'
        ? calculateLobbyBrandMetrics(contentWidth, contentHeight)
        : undefined;
    const scale = variant === 'game'
        ? Math.max(0.01, Math.min(
            widthScale,
            contentHeight / (DIALOG_ROWS.height + DIALOG.screenMargin * 2),
        ))
        : lobbyBrand!.scale;
    const panelWidth = DIALOG.width * scale;
    const panelHeight = DIALOG_ROWS.height * scale;
    const coverWidth = DIALOG_COVER_WIDTH * scale;
    const coverHeight = DIALOG_COVER_HEIGHT * scale;
    // In the dialog the progress bar shares the cover's edges.
    const trackWidth = Math.max(
        1,
        variant === 'lobby'
            ? Math.min(contentWidth, 620 * scale)
            : coverWidth,
    );

    return Object.freeze({
        width,
        height,
        safeTop: normalizedTop,
        safeBottom: normalizedBottom,
        safeLeft: normalizedLeft,
        safeRight: normalizedRight,
        contentWidth,
        contentHeight,
        contentX,
        contentY,
        scale,
        panelWidth,
        panelHeight,
        coverWidth,
        coverHeight,
        trackWidth,
    });
}

/** 弹窗行（距顶边的设计像素）转换为以弹窗中心为原点的纵坐标。 */
function dialogRowY(rowFromTop: number, scale: number): number {
    return (DIALOG_ROWS.height / 2 - rowFromTop) * scale;
}

/** 持久化游戏加载页：展示当前游戏封面与真实分阶段进度。 */
@ccclass('LoadingView')
export class LoadingView extends Component implements LoadingPresenter {
    private messageLabel?: Label;
    private percentLabel?: Label;
    private nameLabel?: Label;
    private descriptionLabel?: Label;
    private cancelButton?: Button;
    private cancelLabel?: Label;
    private cancelLoad?: () => Promise<void>;
    private cancelRevealAt = 0;
    private coverSprite?: Sprite;
    private ownedCoverFrame?: SpriteFrame;
    private startupBackgroundSprite?: Sprite;
    private startupTitleSprite?: Sprite;
    private loadingPanelSprite?: Sprite;
    private progressTrackSprite?: Sprite;
    private progressFillSprite?: Sprite;
    private startupSafeAreaNode?: Node;
    private startupContentNode?: Node;
    private dialogNode?: Node;
    private progressShine?: Graphics;
    private progressShineClip?: Graphics;
    private dismissing = false;
    /** Graphics 不受 UIOpacity 影响，淡入淡出时按这两个系数重绘其颜色。 */
    private layerFade = 1;
    private dialogFade = 1;
    private transition?: { kind: 'pop' | 'dismiss'; elapsed: number; duration: number };
    private ambientTime = 0;
    private startupTitleBaseY = 0;
    private ownedStartupFrames: SpriteFrame[] = [];
    private readonly ownedWarmFrames: SpriteFrame[] = [];
    private warmLoadToken = 0;
    private assets?: AssetService;
    private ownedPanelFrame?: SpriteFrame;
    private panelArtworkLoad?: Promise<void>;
    private variant: 'game' | 'lobby' = 'game';
    private gameDescription = '';
    private restartMode = false;
    private lobbyTransitionMode = false;
    private progress = 0;
    private progressTarget = 0;
    private progressAnimationStart = 0;
    private progressAnimationElapsed = 0;
    private progressAnimationDuration = 0;
    private progressLoadToken = 0;
    private realProgress = 0;
    private layoutMetrics?: LoadingLayoutMetrics;
    private platformLayout?: PlatformLayoutInfo;
    private readonly completionWaiters = new Set<() => void>();

    get isVisible(): boolean {
        return this.node.activeInHierarchy;
    }

    protected onLoad(): void {
        if (!this.node.getComponent(BlockInputEvents)) {
            this.node.addComponent(BlockInputEvents);
        }
        const widget = this.node.getComponent(Widget) ?? this.node.addComponent(Widget);
        widget.isAlignLeft = widget.isAlignRight = true;
        widget.isAlignTop = widget.isAlignBottom = true;
        widget.left = widget.right = widget.top = widget.bottom = 0;
        widget.updateAlignment();
        this.ensureStructure();
        this.loadWarmArtwork();
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.hide(false);
    }

    show(model: LoadingModel): void {
        this.restartMode = false;
        this.lobbyTransitionMode = false;
        this.presentLayer();
        this.ensureStructure();
        this.variant = model.variant ?? 'game';
        this.cancelLoad = this.variant === 'game' ? model.cancel : undefined;
        this.cancelRevealAt = this.cancelLoad ? Date.now() + CANCEL_REVEAL_DELAY_MS : 0;
        if (this.cancelButton) this.cancelButton.interactable = false;
        if (this.cancelLabel) this.cancelLabel.string = '取消';
        this.gameDescription = model.gameDescription?.trim() ?? '';
        const tip = this.findManagedNode('LoadingTip')?.getComponent(Label);
        if (tip) tip.string = this.variant === 'lobby'
            ? '挑一款，随手玩一把'
            : "首次加载可能需要较长时间，请稍候";
        this.layoutAndDraw();
        if (this.nameLabel) {
            this.nameLabel.string = model.gameName ?? '随手玩一把';
        }
        if (this.descriptionLabel) {
            this.descriptionLabel.string = this.gameDescription;
        }
        this.stopProgressAnimation();
        this.progress = 0;
        this.progressTarget = 0;
        this.realProgress = Math.max(0, Math.min(1, model.progress));
        this.setMessage(model.message);
        this.drawProgressFill();
        this.setProgress(Math.min(0.08, Math.max(0.03, model.progress)), true);
        this.unschedule(this.advanceFakeProgress);
        this.schedule(this.advanceFakeProgress, 0.06);
        const coverFrame = this.findManagedNode('LoadingCoverFrame');
        if (coverFrame && this.variant === 'game' && !model.cover) {
            coverFrame.active = false;
        }
        if (this.variant === 'lobby') {
            this.loadStartupArtwork();
        } else {
            this.loadPanelArtwork();
            this.loadCover(model.cover ?? undefined);
            this.popDialog();
        }
    }

    /**
     * 返回大厅时立即展示大厅的纯背景壳层。
     * 不展示品牌、进度动画、加载文案或其他控件。
     */
    showLobbyTransition(): void {
        this.clearCancelAction();
        this.restartMode = false;
        this.lobbyTransitionMode = true;
        this.presentLayer();
        this.ensureStructure();
        this.unschedule(this.advanceFakeProgress);
        this.stopProgressAnimation();
        this.releaseCoverFrame();
        this.variant = 'lobby';
        this.layoutAndDraw();
        this.loadStartupArtwork(false);
    }

    hideLobbyTransition(): void {
        if (!this.lobbyTransitionMode) return;
        this.hide();
    }

    /**
     * 局内重开只需要短暂拦截输入，不应展示完整资源加载面板。
     * 该遮罩复用常驻 LoadingLayer，但不会触发任何资源加载。
     */
    showRestart(message: string): void {
        this.clearCancelAction();
        this.restartMode = true;
        this.lobbyTransitionMode = false;
        this.presentLayer(false);
        this.ensureStructure();
        this.unschedule(this.advanceFakeProgress);
        this.stopProgressAnimation();
        this.progressLoadToken += 1;
        this.releaseCoverFrame();
        this.variant = 'game';
        this.layoutRestart();
        this.setMessage(message);
    }

    hideRestart(): void {
        if (!this.restartMode) return;
        this.restartMode = false;
        this.node.active = false;
    }

    /** 由应用组合根注入真实平台安全区和微信胶囊边界。 */
    setPlatformLayout(layout: PlatformLayoutInfo): void {
        this.platformLayout = layout;
        if (this.node.active) {
            if (this.restartMode) this.layoutRestart();
            else this.layoutAndDraw();
        }
    }

    /** 面板皮肤随大厅远程资源准备，由公共服务统一持有和释放。 */
    setAssetService(assets: AssetService): void {
        this.assets = assets;
    }

    updateProgress(message: string, progress: number): void {
        if (!this.node.active || this.restartMode || this.lobbyTransitionMode) return;
        this.setMessage(message);
        this.realProgress = Math.max(this.realProgress, Math.min(1, Math.max(0, progress)));
        this.setProgress(this.realProgress, true);
        if (this.realProgress >= 1) {
            this.unschedule(this.advanceFakeProgress);
        }
    }

    /** 等到完成态实际绘制，不用固定停留时间推测进度动画是否结束。 */
    waitForCompletion(): Promise<void> {
        if (!this.node.active || this.progress >= 1) return Promise.resolve();
        return new Promise<void>(resolve => this.completionWaiters.add(resolve));
    }

    private finishCompletionWaiters(): void {
        for (const finish of Array.from(this.completionWaiters)) finish();
        this.completionWaiters.clear();
    }

    /**
     * 收起加载层。默认先让弹窗缩小淡出，再淡出遮罩，柔和地露出下方已就绪的
     * 大厅/游戏画面；淡出期间不再拦截输入，再次 show 会立即打断淡出。
     */
    hide(animated = true): void {
        this.clearCancelAction();
        this.finishCompletionWaiters();
        const wasRestart = this.restartMode;
        this.restartMode = false;
        this.progressLoadToken += 1;
        this.unschedule(this.advanceFakeProgress);
        this.stopProgressAnimation();
        if (this.dismissing) return;
        if (!animated || wasRestart || !this.node.activeInHierarchy) {
            this.finishHide();
            return;
        }
        // Keep lobbyTransitionMode until the fade finishes so redraws during
        // the fade do not resurrect the hidden progress controls.
        this.dismissing = true;
        this.setInputBlocking(false);
        this.transition = { kind: 'dismiss', elapsed: 0, duration: DISMISS_SECONDS };
    }

    protected onDestroy(): void {
        this.cancelButton?.node.off(Button.EventType.CLICK, this.handleCancel, this);
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.hide(false);
        this.releaseStartupFrames();
        this.warmLoadToken += 1;
        if (this.loadingPanelSprite) this.loadingPanelSprite.spriteFrame = null;
        if (this.ownedPanelFrame) this.assets?.releaseRuntimeAsset(this.ownedPanelFrame);
        this.ownedPanelFrame = undefined;
        this.assets = undefined;
        this.ownedWarmFrames.forEach((frame) => frame.destroy());
        this.ownedWarmFrames.length = 0;
    }

    /** 将加载层置顶并恢复为完全可见、拦截输入的状态，同时打断未完成的淡出。 */
    private presentLayer(updateAlignment = true): void {
        this.finishCompletionWaiters();
        const interruptedDismiss = this.dismissing;
        this.resetTransition();
        if (interruptedDismiss) this.releaseCoverFrame();
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
        if (updateAlignment) this.node.getComponent(Widget)?.updateAlignment();
    }

    private finishHide(): void {
        this.finishCompletionWaiters();
        this.resetTransition();
        this.lobbyTransitionMode = false;
        this.releaseCoverFrame();
        this.node.active = false;
    }

    private resetTransition(): void {
        this.transition = undefined;
        this.dismissing = false;
        this.applyFade(1, 1, 1);
        this.setInputBlocking(true);
    }

    private setInputBlocking(enabled: boolean): void {
        const blocker = this.node.getComponent(BlockInputEvents);
        if (blocker) blocker.enabled = enabled;
    }

    /** 游戏加载弹窗轻弹入场；背景遮罩保持即时，避免场景切换时露出半透明画面。 */
    private popDialog(): void {
        this.transition = { kind: 'pop', elapsed: 0, duration: DIALOG_POP_SECONDS };
        this.applyFade(1, 0, 0.9);
    }

    private advanceTransition(deltaTime: number): void {
        const transition = this.transition;
        if (!transition) return;
        transition.elapsed += Math.max(0, deltaTime);
        const ratio = Math.min(1, transition.elapsed / transition.duration);
        if (transition.kind === 'pop') {
            this.applyFade(
                1,
                easing.quadOut(Math.min(1, ratio / 0.6)),
                0.9 + 0.1 * easing.backOut(ratio),
            );
        } else {
            const dialogRatio = Math.min(1, ratio / DISMISS_DIALOG_SHARE);
            this.applyFade(
                1 - easing.sineInOut(ratio),
                1 - easing.quadIn(dialogRatio),
                1 - 0.06 * easing.quadOut(dialogRatio),
            );
        }
        if (ratio < 1) return;
        this.transition = undefined;
        if (transition.kind === 'dismiss') this.finishHide();
    }

    /**
     * 统一应用淡入淡出：Sprite/Label 走 UIOpacity，Graphics 按同一系数重绘，
     * 保证遮罩、封面框与文字图片同步变化。
     */
    private applyFade(layerFade: number, dialogFade: number, dialogScale: number): void {
        const clampFade = (value: number): number => Math.min(1, Math.max(0, value));
        this.layerFade = clampFade(layerFade);
        this.dialogFade = this.variant === 'game' ? clampFade(dialogFade) : 1;
        const layerOpacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        layerOpacity.opacity = Math.round(255 * this.layerFade);
        const dialog = this.dialogNode;
        if (dialog) {
            const dialogOpacity = dialog.getComponent(UIOpacity) ?? dialog.addComponent(UIOpacity);
            dialogOpacity.opacity = Math.round(255 * this.dialogFade);
            const scale = this.variant === 'game' ? dialogScale : 1;
            dialog.setScale(scale, scale, 1);
        }
        if (this.node.active && !this.restartMode && this.layoutMetrics) {
            this.drawChrome();
            this.drawProgressFill();
        }
    }

    /** 按当前淡化系数返回 Graphics 颜色。 */
    private faded(color: Color, dialog: boolean): Color {
        const fade = this.layerFade * (dialog ? this.dialogFade : 1);
        return new Color(color.r, color.g, color.b, Math.round(color.a * fade));
    }

    /** 启动页美术异步到达时淡入，避免从纯色底突然跳变。 */
    private revealStartupArt(node: Node, pop: boolean): void {
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(STARTUP_ART_FADE_SECONDS, { opacity: 255 }, { easing: 'quadOut' })
            .start();
        if (!pop) return;
        Tween.stopAllByTarget(node);
        node.setScale(0.92, 0.92, 1);
        tween(node)
            .to(STARTUP_ART_FADE_SECONDS * 1.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private readonly handleCanvasResize = (): void => {
        if (this.node.active) {
            if (this.restartMode) this.layoutRestart();
            else this.layoutAndDraw();
        }
    };

    private ensureStructure(): void {
        const layer = this.node.layer;
        const ensureGraphics = (name: string, parent = this.node): Node => {
            let child = parent.getChildByName(name) ?? this.findManagedNode(name);
            if (!child) {
                child = new Node(name);
                child.layer = layer;
                child.setParent(parent);
                child.addComponent(UITransform);
                child.addComponent(Graphics);
            }
            return child;
        };
        const ensureLabel = (name: string): Label => {
            let child = this.findManagedNode(name);
            if (!child) {
                child = new Node(name);
                child.layer = layer;
                child.setParent(this.node);
                child.addComponent(UITransform);
                child.addComponent(Label);
            }
            return child.getComponent(Label)!;
        };

        const ensureSprite = (name: string, parent = this.node): Sprite => {
            let child = parent.getChildByName(name) ?? this.findManagedNode(name);
            if (!child) {
                child = new Node(name);
                child.layer = layer;
                child.setParent(parent);
                child.addComponent(UITransform);
                const sprite = child.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            }
            return child.getComponent(Sprite)!;
        };

        this.ensureStartupContainer();
        this.ensureDialogContainer();
        ensureGraphics('StartupFallback');
        this.startupBackgroundSprite = ensureSprite('StartupBackground');
        this.startupTitleSprite = ensureSprite(
            'StartupTitle',
            this.startupContentNode ?? this.node,
        );
        if (this.startupTitleSprite.node.parent !== this.startupContentNode) {
            this.startupTitleSprite.node.setParent(this.startupContentNode ?? this.node);
        }
        ensureGraphics('LoadingBackdrop');
        const loadingPanel = ensureGraphics('LoadingPanel');
        this.loadingPanelSprite = this.ensureSkinSprite(loadingPanel, 'LoadingPanelSkin');
        this.loadingPanelSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadingPanelSprite.type = Sprite.Type.SLICED;
        this.loadingPanelSprite.node.setScale(LOADING_PANEL_ART_SCALE, LOADING_PANEL_ART_SCALE, 1);
        const coverFrame = ensureGraphics('LoadingCoverFrame');
        let clip = coverFrame.getChildByName('CoverClip');
        if (!clip) {
            clip = new Node('CoverClip');
            clip.layer = layer;
            clip.setParent(coverFrame);
            clip.addComponent(UITransform);
            const mask = clip.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
        }
        let artwork = clip.getChildByName('CoverArtwork');
        if (!artwork) {
            artwork = new Node('CoverArtwork');
            artwork.layer = layer;
            artwork.setParent(clip);
            artwork.addComponent(UITransform);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        this.coverSprite = artwork.getComponent(Sprite) ?? undefined;
        const coverBorder = ensureGraphics('CoverBorder', coverFrame);
        coverBorder.setSiblingIndex(coverFrame.children.length - 1);

        const progressTrack = ensureGraphics('ProgressTrack');
        this.progressTrackSprite = this.ensureSkinSprite(progressTrack, 'ProgressTrackSkin');
        this.progressTrackSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.progressTrackSprite.type = Sprite.Type.SLICED;
        const progressFill = ensureGraphics('ProgressFill');
        this.progressFillSprite = this.ensureSkinSprite(progressFill, 'ProgressFillSkin');
        this.progressFillSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.progressFillSprite.type = Sprite.Type.SLICED;
        // The glint renders above the fill skin, clipped by a stencil shaped
        // like the fill art's orange body (excluding its top gloss and lip).
        let shineClip = progressFill.getChildByName('ProgressShineClip');
        if (!shineClip) {
            shineClip = new Node('ProgressShineClip');
            shineClip.layer = layer;
            shineClip.setParent(progressFill);
            shineClip.addComponent(UITransform);
            shineClip.addComponent(Mask).type = Mask.Type.GRAPHICS_STENCIL;
        }
        shineClip.setSiblingIndex(progressFill.children.length - 1);
        this.progressShineClip = shineClip.getComponent(Graphics) ?? undefined;
        const shine = ensureGraphics('ProgressShine', shineClip);
        this.progressShine = shine.getComponent(Graphics) ?? undefined;
        this.nameLabel = ensureLabel('LoadingGameName');
        this.descriptionLabel = ensureLabel('LoadingGameDescription');
        this.messageLabel = this.findManagedNode('LoadingMessage')
            ?.getComponent(Label) ?? ensureLabel('LoadingMessage');
        this.percentLabel = ensureLabel('LoadingPercent');
        const tip = ensureLabel('LoadingTip');
        tip.string = '正在为你准备轻松时刻';

        const cancelNode = ensureGraphics('LoadingCancelButton');
        this.cancelButton = cancelNode.getComponent(Button) ?? cancelNode.addComponent(Button);
        this.cancelButton.transition = Button.Transition.SCALE;
        this.cancelButton.zoomScale = 0.96;
        this.cancelButton.duration = 0.1;
        cancelNode.off(Button.EventType.CLICK, this.handleCancel, this);
        cancelNode.on(Button.EventType.CLICK, this.handleCancel, this);
        let cancelLabelNode = cancelNode.getChildByName('Label');
        if (!cancelLabelNode) {
            cancelLabelNode = new Node('Label');
            cancelLabelNode.layer = layer;
            cancelLabelNode.setParent(cancelNode);
            cancelLabelNode.addComponent(UITransform);
        }
        this.cancelLabel = cancelLabelNode.getComponent(Label) ?? cancelLabelNode.addComponent(Label);
        this.cancelLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.cancelLabel.verticalAlign = VerticalTextAlignment.CENTER;
        setLabelBold(this.cancelLabel, true);

        const dialog = this.dialogNode;
        if (dialog) {
            for (const name of DIALOG_ONLY_NODES) {
                const node = this.findManagedNode(name);
                if (node && node.parent !== dialog) node.setParent(dialog);
            }
        }
        const order = [
            'StartupFallback',
            'StartupBackground',
            'LoadingBackdrop',
            'StartupSafeArea',
            'GameDialog',
            ...PROGRESS_NODES,
        ];
        order.forEach((name, index) => this.node.getChildByName(name)?.setSiblingIndex(index));
        if (dialog) this.orderChildren(dialog);
        const legacyError = this.node.getChildByName('StartupErrorLabel');
        if (legacyError) legacyError.active = false;
    }

    private ensureStartupContainer(): void {
        const layer = this.node.layer;
        let safeAreaNode = this.node.getChildByName('StartupSafeArea');
        if (!safeAreaNode) {
            safeAreaNode = new Node('StartupSafeArea');
            safeAreaNode.layer = layer;
            safeAreaNode.setParent(this.node);
            safeAreaNode.addComponent(UITransform).setContentSize(750, 1334);
            const widget = safeAreaNode.addComponent(Widget);
            widget.isAlignTop = true;
            widget.isAlignBottom = true;
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.top = 0;
            widget.bottom = 0;
            widget.left = 0;
            widget.right = 0;
            const safeArea = safeAreaNode.addComponent(SafeArea);
            // Preserve asymmetric left/right insets on devices with a notch or
            // a cutout. The loading content must follow the actual safe rect.
            safeArea.symmetric = false;
        }

        let content = safeAreaNode.getChildByName('StartupContent');
        if (!content) {
            content = new Node('StartupContent');
            content.layer = layer;
            content.setParent(safeAreaNode);
            content.addComponent(UITransform).setContentSize(750, 1334);
            const widget = content.addComponent(Widget);
            widget.isAlignTop = true;
            widget.isAlignBottom = true;
            widget.isAlignLeft = true;
            widget.isAlignRight = true;
            widget.top = 0;
            widget.bottom = 0;
            widget.left = 0;
            widget.right = 0;
        }

        this.startupSafeAreaNode = safeAreaNode;
        this.startupContentNode = content;
    }

    private ensureDialogContainer(): void {
        let dialog = this.node.getChildByName('GameDialog');
        if (!dialog) {
            dialog = new Node('GameDialog');
            dialog.layer = this.node.layer;
            dialog.setParent(this.node);
            dialog.addComponent(UITransform);
            dialog.addComponent(UIOpacity);
        }
        this.dialogNode = dialog;
    }

    /** 按固定层级排列弹窗/启动内容中的元素（后者覆盖前者）。 */
    private orderChildren(parent: Node): void {
        for (const name of [...DIALOG_ONLY_NODES, ...PROGRESS_NODES]) {
            const node = parent.getChildByName(name);
            if (node) node.setSiblingIndex(parent.children.length - 1);
        }
    }

    private layoutStartupContainer(
        startup: boolean,
        metrics: LoadingLayoutMetrics,
    ): void {
        const safeAreaNode = this.startupSafeAreaNode;
        const content = this.startupContentNode;
        if (!safeAreaNode || !content) return;

        safeAreaNode.active = startup;
        if (startup) {
            // SafeArea's native calculation is useful for scene-authored UI,
            // but it does not know the WeChat capsule. Use the already
            // normalized platform metrics as the single source of truth so
            // the safe content size and the coordinates below cannot diverge.
            const safeAreaWidget = safeAreaNode.getComponent(Widget);
            if (safeAreaWidget) {
                safeAreaWidget.isAlignTop = false;
                safeAreaWidget.isAlignBottom = false;
                safeAreaWidget.isAlignLeft = false;
                safeAreaWidget.isAlignRight = false;
            }
            const safeArea = safeAreaNode.getComponent(SafeArea);
            if (safeArea) {
                safeArea.enabled = false;
            }
            safeAreaNode.getComponent(UITransform)?.setContentSize(
                metrics.width,
                metrics.height,
            );
            safeAreaNode.setPosition(0, 0);

            const contentWidget = content.getComponent(Widget);
            if (contentWidget) {
                contentWidget.isAlignTop = false;
                contentWidget.isAlignBottom = false;
                contentWidget.isAlignLeft = false;
                contentWidget.isAlignRight = false;
            }
            content.getComponent(UITransform)?.setContentSize(
                metrics.contentWidth,
                metrics.contentHeight,
            );
            content.setPosition(metrics.contentX, metrics.contentY);
        }

        const dialog = this.dialogNode;
        if (dialog) {
            dialog.active = !startup;
            dialog.setPosition(metrics.contentX, metrics.contentY);
            dialog.getComponent(UITransform)?.setContentSize(
                metrics.panelWidth,
                metrics.panelHeight,
            );
        }
        const targetParent = startup ? content : dialog ?? this.node;
        let reparented = false;
        for (const name of PROGRESS_NODES) {
            const node = this.findManagedNode(name);
            if (node && node.parent !== targetParent) {
                node.setParent(targetParent);
                reparented = true;
            }
        }
        if (reparented) this.orderChildren(targetParent);
    }

    private findManagedNode(name: string): Node | null {
        return this.node.getChildByName(name)
            ?? this.dialogNode?.getChildByName(name)
            ?? this.startupContentNode?.getChildByName(name)
            ?? null;
    }

    private layoutRestart(): void {
        this.layoutAndDraw();
        const metrics = this.layoutMetrics;
        if (!metrics) return;

        const scale = metrics.scale;
        const panelWidth = Math.min(
            500 * scale,
            Math.max(1, metrics.contentWidth - 36 * scale),
        );
        const panelHeight = Math.min(
            156 * scale,
            Math.max(1, metrics.contentHeight - 36 * scale),
        );
        // Restart panel lives in GameDialog, which is already centred on the
        // safe content rectangle by layoutAndDraw().
        const centerX = 0;
        const centerY = 0;
        const radius = Math.min(26 * scale, panelWidth / 2, panelHeight / 2);

        const backdrop = this.graphics('LoadingBackdrop');
        backdrop.node.active = true;
        backdrop.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        backdrop.clear();
        backdrop.fillColor = new Color(10, 18, 34, 156);
        backdrop.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        backdrop.fill();

        const panel = this.graphics('LoadingPanel');
        panel.node.active = true;
        if (this.loadingPanelSprite) this.loadingPanelSprite.enabled = false;
        panel.node.setPosition(centerX, centerY);
        panel.node.getComponent(UITransform)?.setContentSize(panelWidth, panelHeight);
        panel.clear();
        panel.fillColor = new Color(8, 22, 74, 82);
        panel.roundRect(
            -panelWidth / 2 + 6 * scale,
            -panelHeight / 2 - 8 * scale,
            Math.max(1, panelWidth - 12 * scale),
            panelHeight,
            radius,
        );
        panel.fill();
        panel.fillColor = COLORS.panel;
        panel.strokeColor = new Color(255, 255, 255, 220);
        panel.lineWidth = Math.max(1, 3 * scale);
        panel.roundRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            radius,
        );
        panel.fill();
        panel.stroke();

        for (const name of [
            'StartupFallback',
            'StartupBackground',
            'StartupTitle',
            'LoadingCoverFrame',
            'LoadingGameName',
            'LoadingGameDescription',
            'LoadingPercent',
            'ProgressTrack',
            'ProgressFill',
            'LoadingTip',
            'LoadingCancelButton',
        ]) {
            const node = this.findManagedNode(name);
            if (node) node.active = false;
        }
        this.styleLabel(
            'LoadingMessage',
            Math.max(12, 25 * scale),
            COLORS.ink,
            centerX,
            centerY,
            Math.max(1, panelWidth - 48 * scale),
            Math.max(1, panelHeight - 28 * scale),
            true,
        );
    }

    private layoutAndDraw(): void {
        const size = this.node.getComponent(UITransform)?.contentSize;
        const visibleSize = view.getVisibleSize();
        const width = Math.max(1, visibleSize.width || size?.width || 750);
        const height = Math.max(1, visibleSize.height || size?.height || 1334);
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visibleSize.width > 0 ? width / visibleSize.width : 1;
        const scaleY = visibleSize.height > 0 ? height / visibleSize.height : 1;
        const safeTop = Math.max(0, visibleSize.height - safeRect.y - safeRect.height) * scaleY;
        const safeBottom = Math.max(0, safeRect.y) * scaleY;
        const safeLeft = Math.max(0, safeRect.x) * scaleX;
        const safeRight = Math.max(0, visibleSize.width - safeRect.x - safeRect.width) * scaleX;
        const platformSafeArea = this.platformLayout?.safeArea;
        const platformSafeBottom = platformSafeArea
            ? Math.max(0, height - platformSafeArea.bottom)
            : 0;
        const startup = this.variant === 'lobby';
        const landscape = this.platformLayout?.orientation === 'landscape';
        const platformScale = startup ? width / (this.platformLayout?.designWidth ?? LOBBY_DESIGN_WIDTH) : 1;
        const startupPlatformSafeTop = platformSafeArea
            ? platformSafeArea.top * platformScale
            : 0;
        const startupPlatformSafeBottom = platformSafeArea
            ? Math.max(0, height - platformSafeArea.bottom * platformScale)
            : 0;
        const startupPlatformSafeLeft = platformSafeArea
            ? platformSafeArea.left * platformScale
            : 0;
        const startupPlatformSafeRight = platformSafeArea
            ? Math.max(0, width - platformSafeArea.right * platformScale)
            : 0;
        const startupCapsuleBottom = this.platformLayout?.topRightReservedArea?.bottom
            ? this.platformLayout.topRightReservedArea.bottom * platformScale
            : 0;

        const metrics = calculateLoadingLayout(
            width,
            height,
            startup
                ? Math.max(safeTop, startupPlatformSafeTop)
                : Math.max(
                    safeTop,
                    platformSafeArea?.top ?? 0,
                    (this.platformLayout?.topRightReservedArea?.bottom ?? 0) > 0
                        ? (this.platformLayout?.topRightReservedArea?.bottom ?? 0)
                            + LEGACY_LOADING_RESERVED_GAP
                        : 0,
                ),
            startup
                ? Math.max(safeBottom, startupPlatformSafeBottom)
                : Math.max(safeBottom, platformSafeBottom),
            landscape
                ? Math.max(safeLeft, startupPlatformSafeLeft)
                : 0,
            landscape
                ? Math.max(safeRight, startupPlatformSafeRight)
                : 0,
            this.variant,
            startup ? startupCapsuleBottom : 0,
        );
        this.layoutMetrics = metrics;
        this.node.getComponent(UITransform)?.setContentSize(width, height);
        this.layoutStartupContainer(startup, metrics);
        const contentHeight = metrics.contentHeight;
        const scale = metrics.scale;
        // Startup content and GameDialog are both centred containers, so the
        // controls below are laid out in their local coordinates.
        const centerX = 0;
        const centerY = 0;
        const startupBackground = this.startupBackgroundSprite?.node;
        if (startupBackground) {
            startupBackground.active = startup;
            startupBackground.setPosition(0, 0);
            const sourceWidth = this.startupBackgroundSprite?.spriteFrame?.texture.width ?? 750;
            const sourceHeight = this.startupBackgroundSprite?.spriteFrame?.texture.height ?? 1334;
            const scale = Math.max(width / sourceWidth, height / sourceHeight);
            startupBackground.getComponent(UITransform)?.setContentSize(
                sourceWidth * scale,
                sourceHeight * scale,
            );
        }
        const startupTitle = this.startupTitleSprite?.node;
        if (startupTitle) {
            const brand = startup
                ? calculateLobbyBrandMetrics(metrics.contentWidth, metrics.contentHeight)
                : undefined;
            startupTitle.active = startup;
            // 竖屏保留全屏三分之一处的品牌位置；横屏以四边安全内容矩形为基准。
            this.startupTitleBaseY = startup
                ? landscape ? contentHeight / 6 : metrics.height / 6 - metrics.contentY
                : contentHeight / 2 - (
                    brand?.centerFromTop
                    ?? (LEGACY_LOADING_TITLE_TOP_GAP + LEGACY_LOADING_TITLE_HEIGHT / 2) * scale
                );
            startupTitle.setPosition(
                startup && !landscape ? -metrics.contentX : 0,
                this.startupTitleBaseY + this.titleFloatOffset(),
            );
            startupTitle.getComponent(UITransform)?.setContentSize(
                brand ? STARTUP_TITLE_WIDTH * brand.scale : LEGACY_LOADING_TITLE_WIDTH * scale,
                brand ? STARTUP_TITLE_HEIGHT * brand.scale : LEGACY_LOADING_TITLE_HEIGHT * scale,
            );
        }

        // layoutRestart() temporarily hides the normal loading controls. Make
        // the regular loading layout restore every control explicitly so a
        // later game/lobby load cannot inherit the restart mask's visibility.
        for (const name of [
            'LoadingMessage',
            'LoadingPercent',
            'ProgressTrack',
            'ProgressFill',
            'LoadingTip',
        ]) {
            const node = this.findManagedNode(name);
            if (node) node.active = true;
        }

        // The flat fallback sits beneath the artwork so the background can
        // fade in over it without exposing the scene below the loading layer.
        const fallback = this.graphics('StartupFallback');
        fallback.node.active = startup;
        fallback.node.getComponent(UITransform)?.setContentSize(width, height);
        const backdrop = this.graphics('LoadingBackdrop');
        backdrop.node.active = true;
        backdrop.node.getComponent(UITransform)?.setContentSize(width, height);

        const panel = this.graphics('LoadingPanel');
        panel.node.active = !startup;
        panel.node.setPosition(centerX, centerY);
        panel.node.getComponent(UITransform)?.setContentSize(
            metrics.panelWidth,
            metrics.panelHeight,
        );
        this.loadingPanelSprite?.node.setPosition(0, 0);
        this.loadingPanelSprite?.node.getComponent(UITransform)?.setContentSize(
            metrics.panelWidth / LOADING_PANEL_ART_SCALE,
            metrics.panelHeight / LOADING_PANEL_ART_SCALE,
        );
        if (this.loadingPanelSprite?.spriteFrame) {
            this.loadingPanelSprite.enabled = true;
        }

        const frame = this.graphics('LoadingCoverFrame');
        frame.node.active = !startup;
        // The cover's top inset equals the panel's horizontal padding; every
        // row below follows one top-down flow (see DIALOG_ROWS).
        frame.node.setPosition(centerX, centerY + dialogRowY(DIALOG_ROWS.cover, scale));
        frame.node.getComponent(UITransform)?.setContentSize(
            metrics.coverWidth,
            metrics.coverHeight,
        );
        const clip = frame.node.getChildByName('CoverClip');
        clip?.getComponent(UITransform)?.setContentSize(
            metrics.coverWidth,
            metrics.coverHeight,
        );
        const mask = clip?.getComponent(Graphics);
        mask?.clear();
        if (mask) {
            mask.fillColor = Color.WHITE;
            mask.roundRect(
                -metrics.coverWidth / 2,
                -metrics.coverHeight / 2,
                metrics.coverWidth,
                metrics.coverHeight,
                DIALOG.coverRadius * scale,
            );
            mask.fill();
        }
        frame.node.getChildByName('CoverBorder')?.getComponent(UITransform)?.setContentSize(
            metrics.coverWidth,
            metrics.coverHeight,
        );
        this.layoutCover(metrics.coverWidth, metrics.coverHeight);

        this.styleLabel(
            'LoadingGameName',
            DIALOG.titleFontSize * scale,
            new Color(91, 42, 24, 255),
            centerX,
            centerY + dialogRowY(DIALOG_ROWS.title, scale),
            metrics.coverWidth,
            DIALOG.titleHeight * scale,
            true,
            HorizontalTextAlignment.CENTER,
            4 * scale,
        );
        this.styleLabel(
            'LoadingGameDescription',
            DIALOG.descriptionFontSize * scale,
            new Color(105, 52, 32, 210),
            centerX,
            centerY + dialogRowY(DIALOG_ROWS.description, scale),
            metrics.coverWidth,
            DIALOG.descriptionHeight * scale,
            false,
        );
        // Message and percentage share the progress bar's edges: the message
        // starts at its left edge, the percentage is right-aligned to its
        // right edge so the number never drifts as its digit count changes.
        const trackWidth = metrics.trackWidth;
        const trackLeft = centerX - trackWidth / 2;
        const messageY = startup
            ? -contentHeight / 2 + 182 * scale
            : centerY + dialogRowY(DIALOG_ROWS.message, scale);
        const textSize = (startup ? LOBBY_STARTUP_TEXT_SIZE : DIALOG.messageFontSize) * scale;
        const textBoxHeight = (startup ? LOBBY_STARTUP_TEXT_BOX_HEIGHT : DIALOG.messageHeight) * scale;
        const percentWidth = (startup ? LOBBY_STARTUP_PERCENT_WIDTH : DIALOG.percentWidth) * scale;
        this.styleLabel(
            'LoadingMessage',
            textSize,
            new Color(105, 52, 32, 235),
            trackLeft,
            messageY,
            Math.max(1, trackWidth - percentWidth - 12 * scale),
            textBoxHeight,
            false,
            HorizontalTextAlignment.LEFT,
        );
        this.styleLabel(
            'LoadingPercent',
            textSize,
            new Color(91, 42, 24, 255),
            trackLeft + trackWidth,
            messageY,
            percentWidth,
            textBoxHeight,
            true,
            HorizontalTextAlignment.RIGHT,
        );
        this.styleLabel(
            'LoadingTip',
            (startup ? LOBBY_STARTUP_TIP_SIZE : DIALOG.tipFontSize) * scale,
            new Color(105, 52, 32, startup ? 230 : 190),
            centerX,
            startup
                ? -contentHeight / 2 + 80 * scale
                : centerY + dialogRowY(DIALOG_ROWS.tip, scale),
            startup ? Math.max(1, metrics.panelWidth - 90 * scale) : metrics.coverWidth,
            (startup ? LOBBY_STARTUP_TIP_BOX_HEIGHT : DIALOG.tipHeight) * scale,
            false,
        );
        this.findManagedNode('LoadingGameName')!.active = !startup;
        this.findManagedNode('LoadingGameDescription')!.active = !startup
            && this.gameDescription.length > 0;

        const cancelNode = this.cancelButton?.node;
        if (cancelNode) {
            this.syncCancelButtonVisibility();
            cancelNode.setPosition(centerX, centerY + dialogRowY(DIALOG_ROWS.cancel, scale));
            cancelNode.getComponent(UITransform)?.setContentSize(
                DIALOG.cancelWidth * scale, DIALOG.cancelHeight * scale);
            this.cancelLabel?.node.getComponent(UITransform)?.setContentSize(
                DIALOG.cancelWidth * scale, DIALOG.cancelHeight * scale);
        }
        if (this.cancelLabel) {
            this.cancelLabel.fontSize = DIALOG.cancelFontSize * scale;
            this.cancelLabel.lineHeight = DIALOG.cancelHeight * scale;
            this.cancelLabel.color = new Color(105, 52, 32, 255);
        }

        const track = this.graphics('ProgressTrack');
        track.node.setPosition(
            startup ? 0 : centerX,
            startup ? -contentHeight / 2 + 130 * scale : centerY + dialogRowY(DIALOG_ROWS.track, scale),
        );
        track.node.getComponent(UITransform)?.setContentSize(
            trackWidth,
            LOBBY_STARTUP_PROGRESS_NODE_HEIGHT * scale,
        );
        this.progressTrackSprite?.node.setPosition(0, 0);
        this.progressTrackSprite?.node.getComponent(UITransform)?.setContentSize(
            trackWidth,
            LOBBY_STARTUP_PROGRESS_BAR_HEIGHT * scale,
        );
        if (this.progressTrackSprite) {
            this.progressTrackSprite.enabled = true;
        }
        this.drawChrome();
        this.drawProgressFill();
        this.applyLobbyTransitionVisibility();
    }

    /**
     * 绘制所有 Graphics 外观（兜底底色、遮罩、弹窗兜底面板、封面框、轨道兜底）。
     * 与节点布局分离，淡入淡出时每帧按当前系数重绘。
     */
    private drawChrome(): void {
        const metrics = this.layoutMetrics;
        if (!metrics) return;
        const startup = this.variant === 'lobby';
        const { width, height, scale } = metrics;

        const fallback = this.graphics('StartupFallback');
        fallback.clear();
        if (startup) {
            fallback.fillColor = this.faded(STARTUP_FALLBACK_COLOR, false);
            fallback.rect(-width / 2, -height / 2, width, height);
            fallback.fill();
        }

        const backdrop = this.graphics('LoadingBackdrop');
        backdrop.clear();
        backdrop.fillColor = this.faded(
            startup ? STARTUP_TINT_COLOR : GAME_BACKDROP_COLOR,
            false,
        );
        backdrop.rect(-width / 2, -height / 2, width, height);
        backdrop.fill();

        const panel = this.graphics('LoadingPanel');
        panel.clear();
        if (!startup && !this.loadingPanelSprite?.spriteFrame) {
            const radius = 42 * scale;
            panel.fillColor = this.faded(new Color(8, 22, 74, 74), true);
            panel.roundRect(
                -metrics.panelWidth / 2 + 8 * scale,
                -metrics.panelHeight / 2 - 14 * scale,
                metrics.panelWidth - 16 * scale,
                metrics.panelHeight,
                radius,
            );
            panel.fill();
            panel.fillColor = this.faded(COLORS.panel, true);
            panel.strokeColor = this.faded(new Color(255, 255, 255, 210), true);
            panel.lineWidth = 3 * scale;
            panel.roundRect(
                -metrics.panelWidth / 2,
                -metrics.panelHeight / 2,
                metrics.panelWidth,
                metrics.panelHeight,
                radius,
            );
            panel.fill();
            panel.stroke();
        }

        const frame = this.graphics('LoadingCoverFrame');
        const border = frame.node.getChildByName('CoverBorder')?.getComponent(Graphics);
        frame.clear();
        border?.clear();
        if (!startup) {
            const coverWidth = metrics.coverWidth;
            const coverHeight = metrics.coverHeight;
            const radius = DIALOG.coverRadius * scale;
            // Match the lobby card's warm rim and layered shadow. Keep the
            // shadow outside the mask and the rim above the artwork.
            for (const [offset, alpha] of [[4, 16], [2, 24]]) {
                frame.fillColor = this.faded(new Color(102, 61, 31, alpha), true);
                frame.roundRect(
                    -coverWidth / 2,
                    -coverHeight / 2 - offset * scale,
                    coverWidth,
                    coverHeight,
                    radius,
                );
                frame.fill();
            }
            frame.fillColor = this.faded(new Color(255, 246, 224, 255), true);
            frame.roundRect(-coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight, radius);
            frame.fill();
            if (border) {
                const lineWidth = 1.5 * scale;
                border.lineWidth = lineWidth;
                border.strokeColor = this.faded(new Color(173, 114, 65, 160), true);
                border.roundRect(
                    -coverWidth / 2 + lineWidth / 2,
                    -coverHeight / 2 + lineWidth / 2,
                    coverWidth - lineWidth,
                    coverHeight - lineWidth,
                    radius - lineWidth / 2,
                );
                border.stroke();
            }
        }

        const track = this.graphics('ProgressTrack');
        track.clear();
        if (!this.progressTrackSprite?.spriteFrame) {
            const trackWidth = metrics.trackWidth;
            const trackHeight = LOBBY_STARTUP_PROGRESS_BAR_HEIGHT * scale;
            track.fillColor = this.faded(startup
                ? new Color(255, 248, 228, 220)
                : new Color(198, 211, 231, 255), !startup);
            track.roundRect(
                -trackWidth / 2,
                -trackHeight / 2,
                trackWidth,
                trackHeight,
                trackHeight / 2,
            );
            track.fill();
        }

        const cancel = this.graphics('LoadingCancelButton');
        cancel.clear();
        if (cancel.node.active && !startup) {
            const buttonWidth = DIALOG.cancelWidth * scale;
            const buttonHeight = DIALOG.cancelHeight * scale;
            cancel.fillColor = this.faded(new Color(255, 245, 226, 255), true);
            cancel.strokeColor = this.faded(new Color(205, 158, 111, 235), true);
            cancel.lineWidth = 2 * scale;
            cancel.roundRect(-buttonWidth / 2, -buttonHeight / 2,
                buttonWidth, buttonHeight, DIALOG.cancelRadius * scale);
            cancel.fill();
            cancel.stroke();
        }
    }

    private applyLobbyTransitionVisibility(): void {
        if (!this.lobbyTransitionMode) return;
        for (const name of [
            'StartupTitle',
            'LoadingPanel',
            'LoadingCoverFrame',
            'LoadingGameName',
            'LoadingGameDescription',
            'LoadingMessage',
            'LoadingPercent',
            'ProgressTrack',
            'ProgressFill',
            'LoadingTip',
            'LoadingCancelButton',
        ]) {
            const node = this.findManagedNode(name);
            if (node) node.active = false;
        }
    }

    private clearCancelAction(): void {
        this.cancelLoad = undefined;
        this.cancelRevealAt = 0;
        if (this.cancelButton) {
            this.cancelButton.interactable = false;
            this.cancelButton.node.active = false;
        }
    }

    private get canShowCancel(): boolean {
        return Boolean(this.cancelLoad) && this.cancelRevealAt > 0
            && Date.now() > this.cancelRevealAt && this.node.active
            && this.variant === 'game' && !this.restartMode
            && !this.lobbyTransitionMode && !this.dismissing;
    }

    private syncCancelButtonVisibility(): void {
        const button = this.cancelButton;
        if (!button) return;
        const visible = this.canShowCancel;
        const changed = button.node.active !== visible;
        button.node.active = visible;
        button.interactable = visible;
        if (changed) this.drawChrome();
    }

    private readonly handleCancel = (): void => {
        const cancel = this.cancelLoad;
        if (!cancel || !this.canShowCancel || !this.cancelButton?.interactable) return;
        this.clearCancelAction();
        if (this.cancelLabel) this.cancelLabel.string = '正在取消…';
        this.unschedule(this.advanceFakeProgress);
        this.stopProgressAnimation();
        void cancel().catch(error => {
            console.warn('[LoadingView] Cancelled loading recovery failed.', error);
        });
    };

    private readonly advanceFakeProgress = (): void => {
        if (!this.node.active || this.realProgress >= 1 || this.progressTarget >= 0.99) {
            this.unschedule(this.advanceFakeProgress);
            return;
        }
        const increment = this.progressTarget < 0.45
            ? 0.012
            : this.progressTarget < 0.75
                ? 0.008
                : this.progressTarget < 0.9
                    ? 0.006
                    : this.progressTarget < 0.97
                        ? 0.003
                        : 0.001;
        this.setProgress(Math.min(0.99, this.progressTarget + increment), true);
    };

    private setMessage(message: string): void {
        if (this.messageLabel) this.messageLabel.string = message;
    }

    private setProgress(value: number, animated: boolean): void {
        const target = Math.max(this.progressTarget, Math.min(1, Math.max(0, value)));
        this.progressTarget = target;
        if (!animated) {
            this.progress = target;
            this.stopProgressAnimation();
            this.drawProgressFill();
            return;
        }
        if (target <= this.progress) return;

        this.progressAnimationStart = this.progress;
        this.progressAnimationElapsed = 0;
        const distance = target - this.progress;
        // 完成态通过 waitForCompletion 接通实际动画终点；其余阶段按距离调整时长。
        this.progressAnimationDuration = target >= 1
            ? 0.14
            : clamp(0.1 + distance * 0.22, 0.1, 0.24);
    }

    protected update(deltaTime: number): void {
        if (!this.node.active || this.restartMode) return;
        this.ambientTime += Math.max(0, deltaTime);
        this.advanceTransition(deltaTime);
        if (!this.node.active) return;
        this.syncCancelButtonVisibility();
        const title = this.startupTitleSprite?.node;
        if (this.variant === 'lobby' && title?.active) {
            title.setPosition(title.position.x, this.startupTitleBaseY + this.titleFloatOffset());
        }
        if (this.lobbyTransitionMode) return;
        if (this.progressAnimationDuration <= 0) {
            this.drawProgressShine();
            return;
        }

        this.progressAnimationElapsed += Math.max(0, deltaTime);
        const ratio = Math.min(1, this.progressAnimationElapsed / this.progressAnimationDuration);
        const eased = 1 - Math.pow(1 - ratio, 3);
        this.progress = this.progressAnimationStart
            + (this.progressTarget - this.progressAnimationStart) * eased;

        if (ratio >= 1) {
            this.progress = this.progressTarget;
            this.stopProgressAnimation();
        }
        this.drawProgressFill();
        if (this.progress >= 1) this.finishCompletionWaiters();
    }

    /** 进度轨道中心在所属容器（StartupContent 或 GameDialog）内的纵坐标。 */
    private progressTrackY(metrics: LoadingLayoutMetrics): number {
        return this.variant === 'lobby'
            ? -metrics.contentHeight / 2 + 130 * metrics.scale
            : dialogRowY(DIALOG_ROWS.track, metrics.scale);
    }

    private drawProgressFill(): void {
        const metrics = this.layoutMetrics;
        if (!metrics) return;
        const scale = metrics.scale;
        const trackWidth = metrics.trackWidth;
        const fill = this.graphics('ProgressFill');
        const trackY = this.progressTrackY(metrics);
        const fillHeight = LOBBY_STARTUP_PROGRESS_FILL_HEIGHT * scale;
        fill.clear();
        const inset = 7 * scale;
        const available = trackWidth - inset * 2;
        const filled = available * this.progress;
        // A sliced pill exactly as wide as its two caps makes the cap edges
        // meet and exposes a bright seam. Reserve a narrow center slice even
        // at the minimum visible progress so the caps never touch.
        const minimumFillWidth = fillHeight + 4 * scale;
        const visibleFillWidth = filled > 0
            ? Math.min(available, Math.max(minimumFillWidth, filled))
            : 0;
        if (this.percentLabel) this.percentLabel.string = `${Math.round(this.progress * 100)}%`;
        // The fill node is sized to exactly the visible pill in both render
        // paths so the glint can share one local coordinate system.
        fill.node.setPosition(-trackWidth / 2 + inset + visibleFillWidth / 2, trackY);
        fill.node.getComponent(UITransform)?.setContentSize(
            Math.max(1, visibleFillWidth),
            fillHeight,
        );
        if (this.progressFillSprite?.spriteFrame) {
            this.progressFillSprite.enabled = visibleFillWidth > 0.5;
            this.progressFillSprite.node.setPosition(0, 0);
            this.progressFillSprite.node.getComponent(UITransform)?.setContentSize(
                Math.max(1, visibleFillWidth),
                fillHeight,
            );
        } else if (visibleFillWidth > 0.5) {
            fill.fillColor = this.faded(this.variant === 'lobby'
                ? new Color(239, 116, 105, 255)
                : COLORS.blue, this.variant === 'game');
            fill.roundRect(
                -visibleFillWidth / 2,
                -fillHeight / 2,
                visibleFillWidth,
                fillHeight,
                fillHeight / 2,
            );
            fill.fill();
            if (visibleFillWidth > 28 * scale) {
                fill.fillColor = this.faded(this.variant === 'lobby'
                    ? new Color(255, 225, 145, 210)
                    : new Color(100, 220, 247, 175), this.variant === 'game');
                fill.roundRect(
                    -visibleFillWidth / 2 + 5 * scale,
                    1 * scale,
                    Math.max(0, visibleFillWidth - 10 * scale),
                    3 * scale,
                    1.5 * scale,
                );
                fill.fill();
            }
        }
        this.layoutProgressShineClip(visibleFillWidth, fillHeight);
        this.drawProgressShine();
    }

    /** 高光裁剪区：与填充图橙色主体重合的胶囊，排除顶部釉光与底部厚边。 */
    private layoutProgressShineClip(fillWidth: number, fillHeight: number): void {
        const clip = this.progressShineClip;
        if (!clip) return;
        const rowHeight = fillHeight / PROGRESS_FILL_SOURCE_HEIGHT;
        const top = fillHeight / 2 - PROGRESS_FILL_BODY_TOP_ROWS * rowHeight;
        const bottom = -fillHeight / 2 + PROGRESS_FILL_BODY_BOTTOM_ROWS * rowHeight;
        const bodyHeight = Math.max(0, top - bottom);
        const inset = rowHeight * 2;
        const bodyWidth = fillWidth - inset * 2;
        // Too short a fill has no straight body for the glint to travel along.
        clip.node.active = bodyWidth > bodyHeight * 2;
        clip.node.setPosition(0, 0);
        clip.node.getComponent(UITransform)?.setContentSize(Math.max(1, fillWidth), fillHeight);
        clip.clear();
        if (!clip.node.active) return;
        clip.fillColor = Color.WHITE;
        clip.roundRect(-bodyWidth / 2, bottom, bodyWidth, bodyHeight, bodyHeight / 2);
        clip.fill();
    }

    /**
     * 在填充条主体上扫过一道柔和的斜向高光；形状由裁剪区限定，
     * 因此高光可以完整穿过两端圆角而不会溢出。
     */
    private drawProgressShine(): void {
        const shine = this.progressShine;
        const clip = this.progressShineClip;
        const metrics = this.layoutMetrics;
        if (!shine || !clip || !metrics) return;
        shine.clear();
        if (!clip.node.active) return;
        const size = clip.node.getComponent(UITransform)?.contentSize;
        if (!size) return;
        const fillWidth = size.width;
        const fillHeight = size.height;
        const cycle = (this.ambientTime % PROGRESS_SHINE_PERIOD_SECONDS)
            / PROGRESS_SHINE_PERIOD_SECONDS;
        if (cycle >= PROGRESS_SHINE_SWEEP_SHARE) return;
        const sweep = easing.sineInOut(cycle / PROGRESS_SHINE_SWEEP_SHARE);

        const scale = metrics.scale;
        const skew = fillHeight * 0.55;
        const glowWidth = PROGRESS_SHINE_BANDS[0][0] * scale;
        const start = -fillWidth / 2 - glowWidth - skew;
        const end = fillWidth / 2 + glowWidth;
        const center = start + (end - start) * sweep;
        const top = fillHeight / 2;
        const bottom = -fillHeight / 2;
        // Nested translucent bands, widest and faintest first, approximate a
        // soft gradient that peaks at the core.
        for (const [width, alpha] of PROGRESS_SHINE_BANDS) {
            const bandWidth = width * scale;
            const left = center - bandWidth / 2;
            shine.fillColor = this.faded(
                new Color(255, 247, 228, alpha),
                this.variant === 'game',
            );
            shine.moveTo(left, bottom);
            shine.lineTo(left + bandWidth, bottom);
            shine.lineTo(left + bandWidth + skew, top);
            shine.lineTo(left + skew, top);
            shine.close();
            shine.fill();
        }
    }

    private titleFloatOffset(): number {
        const scale = this.layoutMetrics?.scale ?? 1;
        return Math.sin(this.ambientTime * Math.PI * 2 / TITLE_FLOAT_PERIOD_SECONDS)
            * TITLE_FLOAT_AMPLITUDE * scale;
    }

    private loadCover(path?: string): void {
        const token = ++this.progressLoadToken;
        this.releaseCoverFrame();
        if (!path) return;
        const bundle = assetManager.getBundle('lobby-covers');
        if (!bundle) return;
        bundle.load(path, Texture2D, (error, texture) => {
            if (token !== this.progressLoadToken || !this.node.isValid || error || !texture) return;
            const frame = new SpriteFrame();
            frame.packable = false;
            frame.texture = texture;
            this.ownedCoverFrame = frame;
            if (this.coverSprite) {
                this.coverSprite.spriteFrame = frame;
                this.coverSprite.node.active = true;
                const viewport = this.findManagedNode('LoadingCoverFrame')?.getComponent(UITransform)?.contentSize;
                if (viewport) this.layoutCover(viewport.width, viewport.height);
            }
        });
    }

    private loadStartupArtwork(loadTitle = true): void {
        const token = ++this.progressLoadToken;
        const bundle = assetManager.getBundle('resources');
        if (!bundle) return;

        const load = (path: string, sprite?: Sprite): void => {
            if (!sprite) return;
            bundle.load(path, Texture2D, (error, texture) => {
                if (token !== this.progressLoadToken || !this.node.isValid || error || !texture) return;
                const frame = new SpriteFrame();
                // 常驻启动页不能随场景动态图集重置而重复拷贝/上传大图。
                frame.packable = false;
                frame.texture = texture;
                this.ownedStartupFrames.push(frame);
                sprite.spriteFrame = frame;
                sprite.node.active = this.variant === 'lobby';
                this.layoutAndDraw();
                this.revealStartupArt(sprite.node, sprite === this.startupTitleSprite);
            });
        };

        if (!this.startupBackgroundSprite?.spriteFrame) {
            load(LOBBY_BACKGROUND_PATH, this.startupBackgroundSprite);
        }
        if (loadTitle && !this.startupTitleSprite?.spriteFrame) {
            load(STARTUP_TITLE_PATH, this.startupTitleSprite);
        }
    }

    private loadWarmArtwork(): void {
        const bundle = assetManager.getBundle('resources');
        if (!bundle) return;
        const token = ++this.warmLoadToken;
        const load = (
            path: string,
            sprite: Sprite | undefined,
            insets: readonly [number, number, number, number],
        ): void => {
            if (!sprite) return;
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture || token !== this.warmLoadToken || !this.node.isValid) return;
                const frame = new SpriteFrame();
                frame.packable = false;
                frame.texture = texture;
                [frame.insetLeft, frame.insetRight, frame.insetTop, frame.insetBottom] = insets;
                this.ownedWarmFrames.push(frame);
                sprite.spriteFrame = frame;
                if (this.node.active && !this.restartMode) this.layoutAndDraw();
            });
        };
        load(LOADING_TRACK_PATH, this.progressTrackSprite, [18, 18, 0, 0]);
        load(LOADING_FILL_PATH, this.progressFillSprite, [16, 16, 0, 0]);
    }

    private loadPanelArtwork(): void {
        const assets = this.assets;
        const sprite = this.loadingPanelSprite;
        if (!assets || !sprite || sprite.spriteFrame || this.panelArtworkLoad) return;
        const token = this.warmLoadToken;
        const load = assets.loadSpriteFrame(LOADING_PANEL_BUNDLE, LOADING_PANEL_PATH, 'texture')
            .then(frame => {
                if (token !== this.warmLoadToken || !this.node.isValid || this.assets !== assets) {
                    assets.releaseRuntimeAsset(frame);
                    return;
                }
                [frame.insetLeft, frame.insetRight, frame.insetTop, frame.insetBottom] = [15, 15, 34, 34];
                this.ownedPanelFrame = frame;
                sprite.spriteFrame = frame;
                if (this.node.active && !this.restartMode) this.layoutAndDraw();
            })
            // 皮肤失败时继续使用 Graphics 面板，下次展示允许重试。
            .catch(() => {});
        this.panelArtworkLoad = load;
        void load.then(() => {
            if (this.panelArtworkLoad === load) this.panelArtworkLoad = undefined;
        });
    }

    private ensureSkinSprite(parent: Node, name: string): Sprite {
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = parent.layer;
            parent.addChild(node);
            node.setSiblingIndex(0);
            node.addComponent(UITransform);
            node.addComponent(Sprite);
        }
        return node.getComponent(Sprite)!;
    }

    private layoutCover(viewportWidth: number, viewportHeight: number): void {
        const node = this.coverSprite?.node;
        if (!node) return;
        const texture = this.ownedCoverFrame?.texture;
        const sourceWidth = texture?.width ?? viewportWidth;
        const sourceHeight = texture?.height ?? viewportHeight;
        const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
        node.getComponent(UITransform)?.setContentSize(sourceWidth * scale, sourceHeight * scale);
    }

    private releaseCoverFrame(): void {
        if (this.coverSprite) {
            this.coverSprite.spriteFrame = null;
            this.coverSprite.node.active = false;
        }
        this.ownedCoverFrame?.destroy();
        this.ownedCoverFrame = undefined;
    }

    private releaseStartupFrames(): void {
        if (this.startupBackgroundSprite) this.startupBackgroundSprite.spriteFrame = null;
        if (this.startupTitleSprite) this.startupTitleSprite.spriteFrame = null;
        this.ownedStartupFrames.forEach((frame) => frame.destroy());
        this.ownedStartupFrames = [];
    }

    private stopProgressAnimation(): void {
        this.progressAnimationStart = this.progress;
        this.progressAnimationElapsed = 0;
        this.progressAnimationDuration = 0;
    }

    private styleLabel(
        name: string,
        fontSize: number,
        color: Color,
        x: number,
        y: number,
        width: number,
        height: number,
        bold: boolean,
        align = HorizontalTextAlignment.CENTER,
        spacingX = 0,
    ): void {
        const label = this.findManagedNode(name)?.getComponent(Label);
        if (!label) return;
        label.node.setPosition(x, y);
        const transform = label.node.getComponent(UITransform);
        transform?.setContentSize(width, height);
        // Edge-aligned labels anchor on that edge so their box grows away
        // from the progress bar edge they line up with.
        transform?.setAnchorPoint(
            align === HorizontalTextAlignment.LEFT
                ? 0
                : align === HorizontalTextAlignment.RIGHT ? 1 : 0.5,
            0.5,
        );
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.35);
        label.color = color;
        setLabelBold(label, bold);
        label.spacingX = spacingX;
        label.horizontalAlign = align;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
    }

    private graphics(name: string): Graphics {
        const graphics = this.findManagedNode(name)?.getComponent(Graphics);
        if (!graphics) throw new Error(`LoadingView is missing ${name}.`);
        return graphics;
    }
}
