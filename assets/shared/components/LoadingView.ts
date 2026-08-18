import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Color,
    Component,
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
    UITransform,
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

const STARTUP_BACKGROUND_PATH = 'loading/loading-lobby-background-v1/texture';
const STARTUP_TITLE_PATH = 'loading/loading-lobby-title-v1/texture';
const LEGACY_LOADING_RESERVED_GAP = 12;
const LEGACY_LOADING_TITLE_WIDTH = 450;
const LEGACY_LOADING_TITLE_HEIGHT = 300;
const LEGACY_LOADING_TITLE_TOP_GAP = 12;
const LOBBY_STARTUP_PROGRESS_SIDE_INSET = 48;
const LOBBY_STARTUP_PROGRESS_NODE_HEIGHT = 40;
const LOBBY_STARTUP_PROGRESS_BAR_HEIGHT = 30;
const LOBBY_STARTUP_PROGRESS_FILL_HEIGHT = 24;
const LOBBY_STARTUP_TEXT_SIZE = 28;
const LOBBY_STARTUP_TEXT_BOX_HEIGHT = 50;
const LOBBY_STARTUP_TIP_SIZE = 22;
const LOBBY_STARTUP_TIP_BOX_HEIGHT = 38;
const LOBBY_STARTUP_PERCENT_WIDTH = 88;

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
        ?? clamp(Math.max(0, safeLeft), 0, width * 0.45);
    const normalizedRight = lobbyContent?.safeRight
        ?? clamp(Math.max(0, safeRight), 0, width * 0.45);
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
        ? Math.max(0.01, Math.min(widthScale, contentHeight / 822))
        : lobbyBrand!.scale;
    const panelWidth = 640 * scale;
    const panelHeight = 790 * scale;
    const coverWidth = Math.max(1, panelWidth - 64 * scale);
    const coverHeight = coverWidth * 0.75;
    const trackWidth = Math.max(
        1,
        panelWidth - (
            variant === 'lobby'
                ? LOBBY_STARTUP_PROGRESS_SIDE_INSET
                : 96
        ) * scale,
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

/** 持久化游戏加载页：展示当前游戏封面与真实分阶段进度。 */
@ccclass('LoadingView')
export class LoadingView extends Component implements LoadingPresenter {
    private messageLabel?: Label;
    private percentLabel?: Label;
    private nameLabel?: Label;
    private coverSprite?: Sprite;
    private ownedCoverFrame?: SpriteFrame;
    private startupBackgroundSprite?: Sprite;
    private startupTitleSprite?: Sprite;
    private startupSafeAreaNode?: Node;
    private startupContentNode?: Node;
    private ownedStartupFrames: SpriteFrame[] = [];
    private variant: 'game' | 'lobby' = 'game';
    private progress = 0;
    private progressTweenState?: { value: number };
    private progressLoadToken = 0;
    private realProgress = 0;
    private layoutMetrics?: LoadingLayoutMetrics;
    private platformLayout?: PlatformLayoutInfo;

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
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.hide();
    }

    show(model: LoadingModel): void {
        this.node.active = true;
        this.node.setSiblingIndex(this.node.parent?.children.length ?? 0);
        this.node.getComponent(Widget)?.updateAlignment();
        this.ensureStructure();
        this.variant = model.variant ?? 'game';
        this.layoutAndDraw();
        if (this.nameLabel) {
            this.nameLabel.string = model.gameName ?? '休闲解压小游戏大全';
        }
        this.progress = 0;
        this.realProgress = Math.max(0, Math.min(1, model.progress));
        this.setMessage(model.message);
        this.setProgress(Math.min(0.08, Math.max(0.03, model.progress)), false);
        this.unschedule(this.advanceFakeProgress);
        this.schedule(this.advanceFakeProgress, 0.06);
        if (this.variant === 'lobby') {
            this.loadStartupArtwork();
        } else {
            this.loadCover(model.cover);
        }
    }

    /** 由应用组合根注入真实平台安全区和微信胶囊边界。 */
    setPlatformLayout(layout: PlatformLayoutInfo): void {
        this.platformLayout = layout;
        if (this.node.active) {
            this.layoutAndDraw();
        }
    }

    updateProgress(message: string, progress: number): void {
        if (!this.node.active) return;
        this.setMessage(message);
        this.realProgress = Math.max(this.realProgress, Math.min(1, Math.max(0, progress)));
        if (this.realProgress >= 1) {
            this.unschedule(this.advanceFakeProgress);
            this.setProgress(1, true);
        }
    }

    hide(): void {
        this.progressLoadToken += 1;
        this.unschedule(this.advanceFakeProgress);
        this.stopProgressTween();
        this.releaseCoverFrame();
        this.releaseStartupFrames();
        this.node.active = false;
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.hide();
    }

    private readonly handleCanvasResize = (): void => {
        if (this.node.active) {
            this.layoutAndDraw();
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
        this.startupBackgroundSprite = ensureSprite('StartupBackground');
        this.startupTitleSprite = ensureSprite(
            'StartupTitle',
            this.startupContentNode ?? this.node,
        );
        if (this.startupTitleSprite.node.parent !== this.startupContentNode) {
            this.startupTitleSprite.node.setParent(this.startupContentNode ?? this.node);
        }
        ensureGraphics('LoadingBackdrop');
        ensureGraphics('LoadingPanel');
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

        ensureGraphics('ProgressTrack');
        ensureGraphics('ProgressFill');
        this.nameLabel = ensureLabel('LoadingGameName');
        this.messageLabel = this.findManagedNode('LoadingMessage')
            ?.getComponent(Label) ?? ensureLabel('LoadingMessage');
        this.percentLabel = ensureLabel('LoadingPercent');
        const tip = ensureLabel('LoadingTip');
        tip.string = '正在为你准备轻松时刻';

        const order = [
            'StartupBackground',
            'LoadingBackdrop',
            'StartupSafeArea',
            'LoadingPanel',
            'LoadingCoverFrame',
            'LoadingGameName',
            'LoadingMessage',
            'LoadingPercent',
            'ProgressTrack',
            'ProgressFill',
            'LoadingTip',
        ];
        order.forEach((name, index) => this.node.getChildByName(name)?.setSiblingIndex(index));
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

        const targetParent = startup ? content : this.node;
        for (const name of [
            'LoadingMessage',
            'LoadingPercent',
            'ProgressTrack',
            'ProgressFill',
            'LoadingTip',
        ]) {
            const node = this.findManagedNode(name);
            if (node && node.parent !== targetParent) {
                node.setParent(targetParent);
            }
        }
    }

    private findManagedNode(name: string): Node | null {
        return this.node.getChildByName(name)
            ?? this.startupContentNode?.getChildByName(name)
            ?? null;
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
        const platformSafeRight = platformSafeArea
            ? Math.max(0, width - platformSafeArea.right)
            : 0;
        const startup = this.variant === 'lobby';
        const platformScale = startup ? width / LOBBY_DESIGN_WIDTH : 1;
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
            startup
                ? Math.max(safeLeft, startupPlatformSafeLeft)
                : Math.max(safeLeft, platformSafeArea?.left ?? 0),
            startup
                ? Math.max(safeRight, startupPlatformSafeRight)
                : Math.max(safeRight, platformSafeRight),
            this.variant,
            startup ? startupCapsuleBottom : 0,
        );
        this.layoutMetrics = metrics;
        this.node.getComponent(UITransform)?.setContentSize(width, height);
        this.layoutStartupContainer(startup, metrics);
        const contentHeight = metrics.contentHeight;
        const scale = metrics.scale;
        const centerX = startup ? 0 : metrics.contentX;
        const centerY = startup ? 0 : metrics.contentY;
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
            startupTitle.setPosition(
                0,
                contentHeight / 2 - (
                    brand?.centerFromTop
                    ?? (LEGACY_LOADING_TITLE_TOP_GAP + LEGACY_LOADING_TITLE_HEIGHT / 2) * scale
                ),
            );
            startupTitle.getComponent(UITransform)?.setContentSize(
                brand?.width ?? LEGACY_LOADING_TITLE_WIDTH * scale,
                brand?.height ?? LEGACY_LOADING_TITLE_HEIGHT * scale,
            );
        }

        const backdrop = this.graphics('LoadingBackdrop');
        backdrop.node.getComponent(UITransform)?.setContentSize(width, height);
        backdrop.clear();
        backdrop.fillColor = startup
            ? this.startupBackgroundSprite?.spriteFrame
                ? new Color(255, 244, 218, 24)
                : new Color(246, 173, 106, 255)
            : new Color(18, 22, 32, 92);
        backdrop.rect(-width / 2, -height / 2, width, height);
        backdrop.fill();

        const panel = this.graphics('LoadingPanel');
        panel.node.active = !startup;
        panel.node.setPosition(centerX, centerY);
        panel.node.getComponent(UITransform)?.setContentSize(
            metrics.panelWidth,
            metrics.panelHeight,
        );
        panel.clear();
        panel.fillColor = new Color(8, 22, 74, 74);
        panel.roundRect(
            -metrics.panelWidth / 2 + 8 * scale,
            -metrics.panelHeight / 2 - 14 * scale,
            metrics.panelWidth - 16 * scale,
            metrics.panelHeight,
            42 * scale,
        );
        panel.fill();
        panel.fillColor = COLORS.panel;
        panel.strokeColor = new Color(255, 255, 255, 210);
        panel.lineWidth = 3 * scale;
        panel.roundRect(
            -metrics.panelWidth / 2,
            -metrics.panelHeight / 2,
            metrics.panelWidth,
            metrics.panelHeight,
            42 * scale,
        );
        panel.fill();
        panel.stroke();

        const frame = this.graphics('LoadingCoverFrame');
        frame.node.active = !startup;
        // Keep a visible breathing space between the panel top and cover.
        frame.node.setPosition(centerX, centerY + 155 * scale);
        frame.node.getComponent(UITransform)?.setContentSize(
            metrics.coverWidth,
            metrics.coverHeight,
        );
        frame.clear();
        frame.fillColor = new Color(221, 233, 249, 255);
        frame.roundRect(
            -metrics.coverWidth / 2,
            -metrics.coverHeight / 2,
            metrics.coverWidth,
            metrics.coverHeight,
            28 * scale,
        );
        frame.fill();
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
                28 * scale,
            );
            mask.fill();
        }
        this.layoutCover(metrics.coverWidth, metrics.coverHeight);

        this.styleLabel(
            'LoadingGameName',
            40 * scale,
            COLORS.ink,
            centerX,
            centerY - 112 * scale,
            Math.max(1, metrics.panelWidth - 70 * scale),
            58 * scale,
            true,
        );
        const trackWidth = metrics.trackWidth;
        const trackLeft = centerX - trackWidth / 2;
        this.styleLabel(
            'LoadingMessage',
            (startup ? LOBBY_STARTUP_TEXT_SIZE : 23) * scale,
            startup ? new Color(123, 75, 74, 235) : COLORS.secondary,
            trackLeft,
            startup
                ? -contentHeight / 2 + 182 * scale
                : centerY - 194 * scale,
            Math.max(1, trackWidth - (startup ? 108 : 90) * scale),
            (startup ? LOBBY_STARTUP_TEXT_BOX_HEIGHT : 42) * scale,
            false,
            HorizontalTextAlignment.LEFT,
        );
        this.styleLabel(
            'LoadingPercent',
            (startup ? LOBBY_STARTUP_TEXT_SIZE : 23) * scale,
            startup ? new Color(155, 77, 73, 255) : COLORS.blue,
            startup
                ? trackLeft + trackWidth - LOBBY_STARTUP_PERCENT_WIDTH * scale / 2
                : centerX + metrics.panelWidth / 2 - 72 * scale,
            startup
                ? -contentHeight / 2 + 182 * scale
                : centerY - 194 * scale,
            (startup ? LOBBY_STARTUP_PERCENT_WIDTH : 72) * scale,
            (startup ? LOBBY_STARTUP_TEXT_BOX_HEIGHT : 42) * scale,
            true,
        );
        this.styleLabel(
            'LoadingTip',
            (startup ? LOBBY_STARTUP_TIP_SIZE : 19) * scale,
            startup ? new Color(123, 75, 74, 220) : new Color(121, 133, 165, 210),
            centerX,
            startup
                ? -contentHeight / 2 + 80 * scale
                : centerY - 308 * scale,
            Math.max(1, metrics.panelWidth - 90 * scale),
            (startup ? LOBBY_STARTUP_TIP_BOX_HEIGHT : 32) * scale,
            false,
        );
        this.node.getChildByName('LoadingGameName')!.active = !startup;

        const track = this.graphics('ProgressTrack');
        track.node.setPosition(
            startup ? 0 : centerX,
            startup ? -contentHeight / 2 + 130 * scale : centerY - 254 * scale,
        );
        track.node.getComponent(UITransform)?.setContentSize(
            trackWidth,
            (startup ? LOBBY_STARTUP_PROGRESS_NODE_HEIGHT : 32) * scale,
        );
        track.clear();
        track.fillColor = startup
            ? new Color(255, 248, 228, 220)
            : new Color(198, 211, 231, 255);
        const trackHeight = (startup ? LOBBY_STARTUP_PROGRESS_BAR_HEIGHT : 24) * scale;
        track.roundRect(
            -trackWidth / 2,
            -trackHeight / 2,
            trackWidth,
            trackHeight,
            trackHeight / 2,
        );
        track.fill();
        this.drawProgressFill();
    }

    private readonly advanceFakeProgress = (): void => {
        if (!this.node.active || this.realProgress >= 1 || this.progress >= 0.99) {
            this.unschedule(this.advanceFakeProgress);
            return;
        }
        const increment = this.progress < 0.45
            ? 0.012
            : this.progress < 0.75
                ? 0.008
                : this.progress < 0.9
                    ? 0.006
                    : this.progress < 0.97
                        ? 0.003
                        : 0.001;
        this.progress = Math.min(0.99, this.progress + increment);
        this.drawProgressFill();
    };

    private setMessage(message: string): void {
        if (this.messageLabel) this.messageLabel.string = message;
    }

    private setProgress(value: number, animated: boolean): void {
        const target = Math.max(this.progress, Math.min(1, Math.max(0, value)));
        if (!animated) {
            this.progress = target;
            this.drawProgressFill();
            return;
        }
        const fillNode = this.findManagedNode('ProgressFill');
        if (!fillNode) return;
        Tween.stopAllByTarget(fillNode);
        const start = this.progress;
        const state = { value: start };
        this.progressTweenState = state;
        tween(state)
            .to(0.24, { value: target }, {
                easing: 'quadOut',
                onUpdate: () => {
                    this.progress = state.value;
                    this.drawProgressFill();
                },
            })
            .call(() => {
                this.progress = target;
                if (this.progressTweenState === state) {
                    this.progressTweenState = undefined;
                }
                this.drawProgressFill();
            })
            .start();
    }

    private drawProgressFill(): void {
        const metrics = this.layoutMetrics;
        if (!metrics) return;
        const scale = metrics.scale;
        const trackWidth = metrics.trackWidth;
        const fill = this.graphics('ProgressFill');
        const contentHeight = this.variant === 'lobby'
            ? metrics.contentHeight
            : metrics.contentHeight;
        fill.node.setPosition(
            this.variant === 'lobby' ? 0 : metrics.contentX,
            this.variant === 'lobby'
                ? -contentHeight / 2 + 130 * scale
                : metrics.contentY - 254 * scale,
        );
        const fillNodeHeight = (
            this.variant === 'lobby'
                ? LOBBY_STARTUP_PROGRESS_NODE_HEIGHT
                : 32
        ) * scale;
        fill.node.getComponent(UITransform)?.setContentSize(trackWidth, fillNodeHeight);
        const fillHeight = (
            this.variant === 'lobby'
                ? LOBBY_STARTUP_PROGRESS_FILL_HEIGHT
                : 18
        ) * scale;
        fill.clear();
        const inset = 3 * scale;
        const available = trackWidth - inset * 2;
        const filled = available * this.progress;
        if (filled > 0.5) {
            fill.fillColor = this.variant === 'lobby'
                ? new Color(239, 116, 105, 255)
                : COLORS.blue;
            fill.roundRect(
                -trackWidth / 2 + inset,
                -fillHeight / 2,
                filled,
                fillHeight,
                fillHeight / 2,
            );
            fill.fill();
            if (filled > 28 * scale) {
                fill.fillColor = this.variant === 'lobby'
                    ? new Color(255, 225, 145, 210)
                    : new Color(100, 220, 247, 175);
                fill.roundRect(
                    -trackWidth / 2 + inset + 5 * scale,
                    1 * scale,
                    Math.max(0, filled - 10 * scale),
                    3 * scale,
                    1.5 * scale,
                );
                fill.fill();
            }
        }
        if (this.percentLabel) this.percentLabel.string = `${Math.round(this.progress * 100)}%`;
    }

    private loadCover(path?: string): void {
        const token = ++this.progressLoadToken;
        this.releaseCoverFrame();
        if (!path) return;
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) return;
        bundle.load(path, Texture2D, (error, texture) => {
            if (token !== this.progressLoadToken || !this.node.isValid || error || !texture) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.ownedCoverFrame = frame;
            if (this.coverSprite) {
                this.coverSprite.spriteFrame = frame;
                this.coverSprite.node.active = true;
                const viewport = this.node.getChildByName('LoadingCoverFrame')?.getComponent(UITransform)?.contentSize;
                if (viewport) this.layoutCover(viewport.width, viewport.height);
            }
        });
    }

    private loadStartupArtwork(): void {
        const token = ++this.progressLoadToken;
        this.releaseStartupFrames();
        const bundle = assetManager.getBundle('resources');
        if (!bundle) return;

        const load = (path: string, sprite?: Sprite): void => {
            if (!sprite) return;
            bundle.load(path, Texture2D, (error, texture) => {
                if (token !== this.progressLoadToken || !this.node.isValid || error || !texture) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.ownedStartupFrames.push(frame);
                sprite.spriteFrame = frame;
                sprite.node.active = this.variant === 'lobby';
                this.layoutAndDraw();
            });
        };

        load(STARTUP_BACKGROUND_PATH, this.startupBackgroundSprite);
        load(STARTUP_TITLE_PATH, this.startupTitleSprite);
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

    private stopProgressTween(): void {
        if (this.progressTweenState) {
            Tween.stopAllByTarget(this.progressTweenState);
            this.progressTweenState = undefined;
        }
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
    ): void {
        const label = this.findManagedNode(name)?.getComponent(Label);
        if (!label) return;
        label.node.setPosition(x, y);
        const transform = label.node.getComponent(UITransform);
        transform?.setContentSize(width, height);
        // A left-aligned label must also use a left anchor; otherwise its box
        // expands half a width to the left of the progress track start.
        transform?.setAnchorPoint(
            align === HorizontalTextAlignment.LEFT ? 0 : 0.5,
            0.5,
        );
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.35);
        label.color = color;
        label.isBold = bold;
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
