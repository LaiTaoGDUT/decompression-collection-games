import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    Size,
    Texture2D,
    sys,
    UITransform,
    view,
} from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateTopRightControlPosition } from '../../../shared/ui/PlatformSafeLayout';
import { CAT_UI_SHAPE, catUiColor } from './WatermelonUiTheme';

const { ccclass } = _decorator;

export interface WatermelonLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly contentWidth: number;
    readonly contentX: number;
    readonly uiScale: number;
    readonly boardScale: number;
    readonly topY: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly scoreY: number;
    readonly dropY: number;
    readonly boardCenterY: number;
    readonly boardWidth: number;
    readonly boardHeight: number;
    readonly dangerY: number;
    readonly instructionY: number;
}

// Board artwork is wider and taller than the old playfield. The collision
// boundary stays inside the visible pink/teal frame so cat tokens never ride
// over the decorative border; the bottom edge has extra breathing room for
// the cat silhouette and its contrast backing.
export const WATERMELON_BOARD_WIDTH = 720;
export const WATERMELON_BOARD_HEIGHT = 930;
// Vertical padding follows the visible inner frame. The side walls need a
// little more inset because the cat sprite and its contrast ring extend past
// the physical circle by a few pixels.
export const WATERMELON_BOARD_INNER_PADDING = 34;
export const WATERMELON_BOARD_SIDE_PADDING = 40;
export const WATERMELON_BOARD_BOTTOM_PADDING = 46;
export const WATERMELON_BOARD_WALL_THICKNESS = 12;

const CAT_UI_ARTWORK_PATHS = Object.freeze({
    board: 'visual/ui/c1-cat-board-v2/texture',
    bubble: 'visual/ui/c1-cat-bubble-highlight-v2/texture',
    score: 'visual/ui/c1-cat-score-panel-v2/texture',
    highScore: 'visual/ui/c1-cat-high-score-panel-v2/texture',
    next: 'visual/ui/c1-cat-next-panel-v2/texture',
    instruction: 'visual/ui/c1-cat-instruction-strip-v2/texture',
    pause: 'visual/ui/c1-cat-pause-button-v2/texture',
} as const);

type CatUiArtworkKey = keyof typeof CAT_UI_ARTWORK_PATHS;

type HorizontalArtworkFrames = Readonly<{
    left: SpriteFrame;
    center: SpriteFrame;
    right: SpriteFrame;
}>;

// 这些比例表示原图中需要固定的左右装饰区；中间区域是唯一允许横向
// 拉伸的区域。上下不再参与这四张 HUD 背景的切分。
const CAT_UI_HORIZONTAL_SLICE_RATIOS: Readonly<
    Partial<Record<CatUiArtworkKey, readonly [number, number]>>
> = Object.freeze({
    score: [0.23, 0.23],
    highScore: [0.23, 0.23],
    next: [0.23, 0.23],
    instruction: [0.11, 0.11],
});

// HUD 两端给屏幕边缘留出额外呼吸空间，避免装饰叶片和文字贴到边界。
const CAT_HUD_SCORE_CENTER_OFFSET = 132;
const CAT_HUD_SCORE_PANEL_WIDTH = 206;
const CAT_HUD_HIGH_SCORE_PANEL_WIDTH = 190;
const CAT_HUD_NEXT_CENTER_OFFSET = 136;
const CAT_HUD_NEXT_PANEL_WIDTH = 226;
const CAT_HUD_NEXT_LABEL_OFFSET = 180;
const CAT_HUD_NEXT_PREVIEW_OFFSET = 86;
const CAT_HUD_CAPTION_FONT_SIZE = 18;
const CAT_HUD_SCORE_VALUE_FONT_SIZE = 26;
const CAT_HUD_HIGH_SCORE_VALUE_FONT_SIZE = 24;
const CAT_HUD_CAPTION_Y = 13;
const CAT_HUD_VALUE_Y = -14;
const CAT_BOARD_TOP_GAP = 10;
const CAT_BOARD_BOTTOM_GAP = 58;
const CAT_DANGER_LINE_TOP_OFFSET = 145;

/** 安全区只改变 HUD 与底部留白；玩法几何保持设计坐标，短屏整体缩放棋盘。 */
export function calculateWatermelonLayout(
    canvasWidth: number,
    canvasHeight: number,
    safeTop = 0,
    safeBottom = 0,
    platformLayout?: PlatformLayoutInfo,
    safeLeft = 0,
    safeRight = 0,
): WatermelonLayoutMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const left = Math.max(0, Math.min(width * 0.45, safeLeft));
    const right = Math.max(0, Math.min(width * 0.45, safeRight));
    const contentWidth = Math.max(1, width - left - right);
    const contentX = (left - right) / 2;
    const clampedTop = Math.max(0, Math.min(height * 0.45, safeTop));
    const clampedBottom = Math.max(0, Math.min(height * 0.45, safeBottom));
    const uiScale = Math.max(0.01, Math.min(1, contentWidth / 750));
    const pausePosition = calculateTopRightControlPosition(
        width,
        height,
        platformLayout,
        {
            controlWidth: 88,
            // 标题图片高于暂停按钮，两者共用中心线时按标题高度避让胶囊。
            controlHeight: 140 * uiScale,
            rightInset: Math.max(44, 58 * uiScale),
            defaultTopInset: clampedTop + 72 * uiScale,
            reservedGap: 10,
        },
    );
    const safeLeftEdge = -width / 2 + left;
    const safeRightEdge = width / 2 - right;
    const pauseX = Math.max(
        safeLeftEdge + 44,
        Math.min(safeRightEdge - 44, pausePosition.x),
    );
    // 标题与暂停按钮共用同一视觉基线，并一起落在平台胶囊下方。
    const topY = pausePosition.y;
    // 胶囊较低的机型会同步下移 HUD 第二行，避免“修好胶囊、又压住下一只猫”式局部补丁。
    const scoreY = topY - 134 * uiScale;
    const dropY = scoreY - 88 * uiScale;
    const instructionY = -height / 2 + clampedBottom + 54 * uiScale;
    // 收紧分数模块与棋盘面板之间的留白，把释放出的高度交给棋盘。
    const boardTop = dropY + CAT_BOARD_TOP_GAP * uiScale;
    const boardBottom = instructionY + CAT_BOARD_BOTTOM_GAP * uiScale;
    const availableBoardHeight = Math.max(1, boardTop - boardBottom);
    const boardScale = Math.max(
        0.01,
        Math.min(
            uiScale,
            contentWidth / WATERMELON_BOARD_WIDTH,
            availableBoardHeight / WATERMELON_BOARD_HEIGHT,
        ),
    );

    return Object.freeze({
        width,
        height,
        contentWidth,
        contentX,
        uiScale,
        boardScale,
        topY,
        pauseX,
        pauseY: pausePosition.y,
        scoreY,
        dropY,
        boardCenterY: (boardTop + boardBottom) / 2,
        boardWidth: WATERMELON_BOARD_WIDTH,
        boardHeight: WATERMELON_BOARD_HEIGHT,
        dangerY: WATERMELON_BOARD_HEIGHT / 2 - CAT_DANGER_LINE_TOP_OFFSET,
        instructionY,
    });
}

/** 萌系猫咪屋 HUD 与常见竖屏比例适配，不包含玩法状态。 */
@ccclass('WatermelonLayout')
export class WatermelonLayout extends Component {
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedTitleFrame?: SpriteFrame;
    private readonly ownedUiFrames = new Map<CatUiArtworkKey, SpriteFrame>();
    private readonly ownedHorizontalUiFrames = new Map<CatUiArtworkKey, HorizontalArtworkFrames>();
    private platformLayout?: PlatformLayoutInfo;
    private layoutChangeHandler?: () => void;
    private backgroundSourceAspect = 750 / 1334;

    protected onLoad(): void {
        this.applyLayout();
        view.on('canvas-resize', this.handleCanvasResize, this);
        void this.loadBackground();
        void this.loadTitleArtwork();
        void this.loadUiArtwork();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.layoutChangeHandler = undefined;
        this.releaseOwnedArtwork(false);
    }

    /**
     * Release runtime-created UI frames while the node hierarchy is still alive.
     * Cocos may clear a node's internal children array before component onDestroy,
     * so onDestroy must not call getComponentsInChildren there.
     */
    releaseOwnedArtwork(detachBindings = true): void {
        const ownedFrames = new Set<SpriteFrame>();
        this.ownedUiFrames.forEach((frame) => ownedFrames.add(frame));
        this.ownedHorizontalUiFrames.forEach((frames) => {
            ownedFrames.add(frames.left);
            ownedFrames.add(frames.center);
            ownedFrames.add(frames.right);
        });
        if (this.ownedBackgroundFrame) {
            ownedFrames.add(this.ownedBackgroundFrame);
        }
        if (this.ownedTitleFrame) {
            ownedFrames.add(this.ownedTitleFrame);
        }

        if (detachBindings && this.node.isValid) {
            for (const sprite of this.node.getComponentsInChildren(Sprite)) {
                if (sprite.spriteFrame && ownedFrames.has(sprite.spriteFrame)) {
                    sprite.spriteFrame = null;
                }
            }
        }

        for (const frame of ownedFrames) {
            if (frame.isValid) frame.destroy();
        }
        this.ownedUiFrames.clear();
        this.ownedHorizontalUiFrames.clear();
        this.ownedBackgroundFrame = undefined;
        this.ownedTitleFrame = undefined;
    }

    /** 由 MiniGameContext 注入平台原生 UI 约束，供初始化和后续 resize 共同使用。 */
    setPlatformLayout(layout: PlatformLayoutInfo): void {
        this.platformLayout = layout;
        this.applyLayout();
    }

    /** 让玩法在窗口变化后同步物理边界与预览位置。 */
    setLayoutChangeHandler(handler?: () => void): void {
        this.layoutChangeHandler = handler;
        handler?.();
    }

    applyLayout(): void {
        const canvasTransform = this.node.parent?.getComponent(UITransform);
        const canvasSize = canvasTransform?.contentSize ?? { width: 750, height: 1334 };
        const visible = view.getVisibleSize();
        // A scene Canvas can briefly keep the fixed design size while a wider
        // device/preview viewport is already visible. Follow the visible area
        // so the background and root UI never expose camera-clear bars.
        const viewportWidth = Math.max(
            1,
            visible.width > 0 ? visible.width : canvasSize.width,
        );
        const viewportHeight = Math.max(
            1,
            visible.height > 0 ? visible.height : canvasSize.height,
        );
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visible.width > 0 ? viewportWidth / visible.width : 1;
        const scaleY = visible.height > 0 ? viewportHeight / visible.height : 1;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height)
            * scaleY;
        const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
        const systemSafeLeft = Math.max(0, safeRect.x) * scaleX;
        const systemSafeRight = Math.max(0, visible.width - safeRect.x - safeRect.width)
            * scaleX;
        const safeTop = Math.max(systemSafeTop, this.platformLayout?.safeArea.top ?? 0);
        const platformSafeBottom = this.platformLayout
            ? Math.max(0, viewportHeight - this.platformLayout.safeArea.bottom)
            : 0;
        const safeBottom = Math.max(systemSafeBottom, platformSafeBottom);
        const safeLeft = Math.max(systemSafeLeft, this.platformLayout?.safeArea.left ?? 0);
        const platformSafeRight = this.platformLayout
            ? Math.max(0, viewportWidth - this.platformLayout.safeArea.right)
            : 0;
        const safeRight = Math.max(systemSafeRight, platformSafeRight);
        const metrics = calculateWatermelonLayout(
            viewportWidth,
            viewportHeight,
            safeTop,
            safeBottom,
            this.platformLayout,
            safeLeft,
            safeRight,
        );
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.ensureHudNodes();
        this.resizeBackground(metrics.width, metrics.height);
        this.applyUiArtworkLayout(metrics);
        this.node.getChildByName('Title')
            ?.getComponent(UITransform)
            ?.setContentSize(350 * metrics.uiScale, 140 * metrics.uiScale);
        this.node.getChildByName('Title')
            ?.getChildByName('TitleArtwork')
            ?.getComponent(UITransform)
            ?.setContentSize(350 * metrics.uiScale, 140 * metrics.uiScale);
        this.node.getChildByName('HighScoreLabel')
            ?.getComponent(UITransform)
            ?.setContentSize(CAT_HUD_HIGH_SCORE_PANEL_WIDTH * metrics.uiScale, 76 * metrics.uiScale);
        this.setContentSize('ScoreLabel', 114, 66, metrics.uiScale);
        this.setContentSize('NextLabel', 84, 66, metrics.uiScale);
        this.setContentSize('DropZone', 40, 66, metrics.uiScale);
        this.setContentSize('Instruction', 338, 66, metrics.uiScale);
        this.node.getChildByName('NextFruitPreview')?.setScale(
            metrics.uiScale,
            metrics.uiScale,
            1,
        );

        const contentLeft = metrics.contentX - metrics.contentWidth / 2;
        const contentRight = metrics.contentX + metrics.contentWidth / 2;
        this.setPosition('Title', metrics.contentX, metrics.topY);
        this.setPosition('PauseButton', metrics.pauseX, metrics.pauseY);
        this.setPosition('ScoreLabel', metrics.contentX, metrics.scoreY);
        this.setPosition(
            'HighScoreLabel',
            contentLeft + CAT_HUD_SCORE_CENTER_OFFSET * metrics.uiScale,
            metrics.scoreY,
        );
        this.setPosition(
            'NextLabel',
            contentRight - CAT_HUD_NEXT_LABEL_OFFSET * metrics.uiScale,
            metrics.scoreY + 14 * metrics.uiScale,
        );
        this.setPosition(
            'NextFruitPreview',
            contentRight - CAT_HUD_NEXT_PREVIEW_OFFSET * metrics.uiScale,
            metrics.scoreY,
        );
        this.setPosition('DropZone', metrics.contentX, metrics.dropY);
        this.setPosition('Instruction', metrics.contentX, metrics.instructionY);

        const container = this.node.getChildByName('FruitContainer');
        if (!container) {
            return;
        }

        this.ensureBoardBackground(container);
        container.setPosition(metrics.contentX, metrics.boardCenterY);
        container.getComponent(UITransform)?.setContentSize(metrics.boardWidth, metrics.boardHeight);
        container.setScale(metrics.boardScale, metrics.boardScale, 1);
        this.applyBoardArtwork(container, metrics.boardWidth, metrics.boardHeight);
        container.getChildByName('DangerLine')?.setPosition(0, metrics.dangerY);
        this.drawHudDecor(metrics);
        this.applyLabelStyles(metrics.uiScale);

        const graphics = container.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
            if (!this.hasUiArtwork('board')) {
                graphics.fillColor = catUiColor('ink', 30);
                graphics.roundRect(
                    -metrics.boardWidth / 2 + 9,
                    -metrics.boardHeight / 2 - 12,
                    metrics.boardWidth,
                    metrics.boardHeight,
                    CAT_UI_SHAPE.panelRadius,
                );
                graphics.fill();
                graphics.fillColor = catUiColor('surface', 232);
                graphics.strokeColor = catUiColor('blush');
                graphics.lineWidth = 9;
                graphics.roundRect(
                    -metrics.boardWidth / 2,
                    -metrics.boardHeight / 2,
                    metrics.boardWidth,
                    metrics.boardHeight,
                    CAT_UI_SHAPE.panelRadius,
                );
                graphics.fill();
                graphics.stroke();
                graphics.strokeColor = catUiColor('sky', 130);
                graphics.lineWidth = 3;
                graphics.roundRect(
                    -metrics.boardWidth / 2 + 13,
                    -metrics.boardHeight / 2 + 13,
                    metrics.boardWidth - 26,
                    metrics.boardHeight - 26,
                    26,
                );
                graphics.stroke();
                // Small edge decorations keep the center and lower playfield clear.
                graphics.fillColor = catUiColor('lavender', 105);
                graphics.circle(-metrics.boardWidth / 2 + 30, metrics.boardHeight / 2 - 30, 11);
                graphics.circle(metrics.boardWidth / 2 - 30, -metrics.boardHeight / 2 + 30, 11);
                graphics.fill();
            }
        }
        this.layoutChangeHandler?.();
    }

    private ensureHudNodes(): void {
        if (!this.node.getChildByName('HighScoreLabel')) {
            const highScore = new Node('HighScoreLabel');
            highScore.layer = this.node.layer;
            highScore.setParent(this.node);
            highScore.addComponent(UITransform).setContentSize(190, 76);
            const label = highScore.addComponent(Label);
            label.string = '最高\n0';
            label.horizontalAlign = 1;
            label.verticalAlign = 1;
        }

        this.ensureNumericHudLabels('ScoreLabel', '分数');
        this.ensureNumericHudLabels('HighScoreLabel', '最高');

        if (!this.node.getChildByName('HudDecorLayer')) {
            const decor = new Node('HudDecorLayer');
            decor.layer = this.node.layer;
            decor.setParent(this.node);
            decor.addComponent(UITransform).setContentSize(750, 1334);
            decor.addComponent(Graphics);
            decor.setSiblingIndex(0);
        }

        const obsoleteSubtitle = this.node.getChildByName('CozyEditionTag');
        if (obsoleteSubtitle) {
            obsoleteSubtitle.destroy();
        }

        const title = this.node.getChildByName('Title');
        title?.getComponent(UITransform)?.setContentSize(350, 140);
        const titleLabel = title?.getComponent(Label);
        if (titleLabel) titleLabel.string = '';

        const pause = this.node.getChildByName('PauseButton');
        if (!pause) {
            return;
        }

        // 触摸热区保持 88×88，内部纸片图标收在 68×68，兼顾易点与轻巧观感。
        pause.getComponent(UITransform)?.setContentSize(88, 88);
        const button = pause.getComponent(Button);
        if (button) {
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.94;
        }
        const oldLabel = pause.getChildByName('Label')?.getComponent(Label);
        if (oldLabel) {
            oldLabel.string = '';
        }

        let icon = pause.getChildByName('CozyPauseIcon');
        if (!icon) {
            icon = new Node('CozyPauseIcon');
            icon.layer = pause.layer;
            icon.setParent(pause);
            icon.addComponent(UITransform).setContentSize(68, 68);
            icon.addComponent(Graphics);
        }
        const graphics = icon.getComponent(Graphics)!;
        graphics.clear();
        graphics.fillColor = catUiColor('ink', 28);
        graphics.roundRect(-31, -38, 68, 68, 22);
        graphics.fill();
        graphics.fillColor = catUiColor('surface', 250);
        graphics.strokeColor = catUiColor('peach');
        graphics.lineWidth = 4;
        graphics.roundRect(-34, -34, 68, 68, 22);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = catUiColor('ink');
        graphics.roundRect(-13, -15, 8, 30, 4);
        graphics.roundRect(5, -15, 8, 30, 4);
        graphics.fill();

        const pauseArtwork = this.ensureSpriteNode(pause, 'PauseArtwork');
        pauseArtwork.node.active = this.hasUiArtwork('pause');
        pauseArtwork.sprite.spriteFrame = this.ownedUiFrames.get('pause') ?? null;
    }

    private loadBackground(): Promise<void> {
        const bundle = assetManager.getBundle('game-watermelon');
        if (!bundle) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            bundle.load(
                'visual/backgrounds/c1-cat-room-bg-v1/texture',
                Texture2D,
                (error, texture) => {
                    if (!error && texture && this.node.isValid) {
                        let background = this.node.getChildByName('CatRoomBackground');
                        if (!background) {
                            background = new Node('CatRoomBackground');
                            background.layer = this.node.layer;
                            background.setParent(this.node);
                            background.addComponent(UITransform);
                            background.addComponent(Sprite);
                            background.setSiblingIndex(0);
                        }
                        const sprite = background.getComponent(Sprite)!;
                        this.ownedBackgroundFrame?.destroy();
                        const spriteFrame = this.createTextureFrame(texture);
                        this.ownedBackgroundFrame = spriteFrame;
                        const sourceWidth = spriteFrame.originalSize.width;
                        const sourceHeight = spriteFrame.originalSize.height;
                        if (sourceWidth > 0 && sourceHeight > 0) {
                            this.backgroundSourceAspect = sourceWidth / sourceHeight;
                        }
                        sprite.spriteFrame = spriteFrame;
                        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                        const size = this.node.getComponent(UITransform)?.contentSize;
                        this.resizeBackground(size?.width ?? 750, size?.height ?? 1334);
                    } else if (error) {
                        console.warn('[WatermelonLayout] Cat-room background failed to load.', error);
                    }
                    resolve();
                },
            );
        });
    }

    private loadTitleArtwork(): Promise<void> {
        const bundle = assetManager.getBundle('game-watermelon');
        const title = this.node.getChildByName('Title');
        if (!bundle || !title) return Promise.resolve();

        return new Promise((resolve) => {
            bundle.load('visual/title/c1-cat-merge-title-v1/texture', Texture2D, (error, texture) => {
                if (!error && texture && this.node.isValid && title.isValid) {
                    let artwork = title.getChildByName('TitleArtwork');
                    if (!artwork) {
                        artwork = new Node('TitleArtwork');
                        artwork.layer = title.layer;
                        artwork.setParent(title);
                        artwork.addComponent(UITransform);
                        artwork.addComponent(Sprite);
                    }
                    const sprite = artwork.getComponent(Sprite)!;
                    const frame = this.createTextureFrame(texture);
                    this.ownedTitleFrame?.destroy();
                    this.ownedTitleFrame = frame;
                    sprite.spriteFrame = frame;
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    artwork.getComponent(UITransform)?.setContentSize(350, 140);
                    this.applyLayout();
                } else if (error) {
                    console.warn('[WatermelonLayout] Title artwork failed to load.', error);
                }
                resolve();
            });
        });
    }

    private resizeBackground(width: number, height: number): void {
        const background = this.node.getChildByName('CatRoomBackground');
        if (!background) {
            return;
        }
        const sourceAspect = this.backgroundSourceAspect;
        const targetAspect = width / height;
        const drawWidth = targetAspect > sourceAspect ? width : height * sourceAspect;
        const drawHeight = targetAspect > sourceAspect ? width / sourceAspect : height;
        background.getComponent(UITransform)?.setContentSize(drawWidth, drawHeight);
    }

    private loadUiArtwork(): Promise<void> {
        const bundle = assetManager.getBundle('game-watermelon');
        if (!bundle) {
            return Promise.resolve();
        }

        const artworkKeys = Object.keys(CAT_UI_ARTWORK_PATHS) as CatUiArtworkKey[];
        const entries: Array<[CatUiArtworkKey, string]> = artworkKeys
            .filter((key) => key !== 'bubble')
            .map((key): [CatUiArtworkKey, string] => [key, CAT_UI_ARTWORK_PATHS[key]]);
        return Promise.all(entries.map(([key, path]) => new Promise<void>((resolve) => {
            bundle.load(path, Texture2D, (error, texture) => {
                if (!error && texture && this.node.isValid) {
                    const frame = this.createTextureFrame(texture);
                    const previous = this.ownedUiFrames.get(key);
                    if (previous?.isValid) previous.destroy();
                    const previousHorizontalFrames = this.ownedHorizontalUiFrames.get(key);
                    this.destroyHorizontalArtworkFrames(previousHorizontalFrames);
                    this.ownedUiFrames.set(key, frame);
                    const sliceRatios = CAT_UI_HORIZONTAL_SLICE_RATIOS[key];
                    if (sliceRatios) {
                        this.ownedHorizontalUiFrames.set(
                            key,
                            this.createHorizontalArtworkFrames(
                                texture,
                                sliceRatios[0],
                                sliceRatios[1],
                            ),
                        );
                    } else {
                        this.ownedHorizontalUiFrames.delete(key);
                    }
                    this.applyLayout();
                } else if (error) {
                    console.warn(`[WatermelonLayout] UI artwork failed to load: ${key}.`, error);
                }
                resolve();
            });
        }))).then(() => undefined);
    }

    private hasUiArtwork(key: CatUiArtworkKey): boolean {
        return !!this.ownedUiFrames.get(key)?.isValid;
    }

    /**
     * Runtime-created frames do not infer originalSize from texture. Keeping
     * the source dimensions here is required by the board's Cocos SLICED
     * layout and by the three-piece HUD layout below.
     */
    private createTextureFrame(texture: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.originalSize = new Size(texture.width, texture.height);
        return frame;
    }

    /**
     * Cocos 3.8 的 Sprite.Type.SLICED 是九宫格，会同时处理上下左右四条
     * 边。HUD 这四张图只需要左、中、右三段，所以这里显式裁出三个
     * SpriteFrame：左右段保持原图比例，中段只把宽度交给 UITransform。
     */
    private createHorizontalArtworkFrames(
        texture: Texture2D,
        leftRatio: number,
        rightRatio: number,
    ): HorizontalArtworkFrames {
        const sourceWidth = Math.max(3, texture.width);
        const sourceHeight = Math.max(1, texture.height);
        const leftWidth = Math.max(
            1,
            Math.min(sourceWidth - 2, Math.round(sourceWidth * leftRatio)),
        );
        const rightWidth = Math.max(
            1,
            Math.min(sourceWidth - leftWidth - 1, Math.round(sourceWidth * rightRatio)),
        );
        const centerWidth = Math.max(1, sourceWidth - leftWidth - rightWidth);

        const createSlice = (x: number, width: number): SpriteFrame => {
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(x, 0, width, sourceHeight);
            frame.originalSize = new Size(width, sourceHeight);
            return frame;
        };

        return Object.freeze({
            left: createSlice(0, leftWidth),
            center: createSlice(leftWidth, centerWidth),
            right: createSlice(leftWidth + centerWidth, rightWidth),
        });
    }

    private destroyHorizontalArtworkFrames(frames?: HorizontalArtworkFrames): void {
        if (!frames) {
            return;
        }
        for (const frame of [frames.left, frames.center, frames.right]) {
            if (frame.isValid) frame.destroy();
        }
    }

    private ensureSpriteNode(
        parent: Node,
        name: string,
    ): { node: Node; sprite: Sprite; transform: UITransform } {
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = parent.layer;
            node.setParent(parent);
            node.addComponent(UITransform);
            node.addComponent(Sprite);
        }
        return {
            node,
            sprite: node.getComponent(Sprite)!,
            transform: node.getComponent(UITransform)!,
        };
    }

    private applyUiArtworkLayout(metrics: WatermelonLayoutMetrics): void {
        const decor = this.node.getChildByName('HudDecorLayer');
        if (!decor) {
            return;
        }

        const scale = metrics.uiScale;
        const left = metrics.contentX - metrics.contentWidth / 2;
        const right = metrics.contentX + metrics.contentWidth / 2;
        const placements: ReadonlyArray<[
            CatUiArtworkKey,
            string,
            number,
            number,
            number,
            number,
        ]> = [
            ['highScore', 'HighScoreBackground', left + CAT_HUD_SCORE_CENTER_OFFSET * scale, metrics.scoreY, CAT_HUD_HIGH_SCORE_PANEL_WIDTH * scale, 82 * scale],
            ['score', 'ScoreBackground', metrics.contentX, metrics.scoreY, CAT_HUD_SCORE_PANEL_WIDTH * scale, 82 * scale],
            ['next', 'NextBackground', right - CAT_HUD_NEXT_CENTER_OFFSET * scale, metrics.scoreY, CAT_HUD_NEXT_PANEL_WIDTH * scale, 82 * scale],
            ['instruction', 'InstructionBackground', metrics.contentX, metrics.instructionY, 460 * scale, 54 * scale],
        ];

        for (const [key, name, x, y, width, height] of placements) {
            const artwork = this.ensureSpriteNode(decor, name);
            artwork.node.setPosition(x, y);
            artwork.transform.setContentSize(width, height);
            // Parent is only a positioning container. Its Sprite component is
            // kept for compatibility with dynamically-created old nodes, but
            // the actual artwork is rendered by Left/Center/Right children.
            artwork.sprite.spriteFrame = null;
            artwork.sprite.enabled = false;
            this.applyHorizontalArtwork(
                artwork.node,
                this.ownedHorizontalUiFrames.get(key),
                width,
                height,
            );
            artwork.node.active = this.hasUiArtwork(key);
        }

        const pause = this.node.getChildByName('PauseButton');
        if (pause) {
            pause.getComponent(UITransform)?.setContentSize(88 * scale, 88 * scale);
            const pauseArtwork = this.ensureSpriteNode(pause, 'PauseArtwork');
            pauseArtwork.node.setPosition(0, 0);
            pauseArtwork.transform.setContentSize(64 * scale, 61 * scale);
            pauseArtwork.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            pauseArtwork.sprite.spriteFrame = this.ownedUiFrames.get('pause') ?? null;
            pauseArtwork.node.active = this.hasUiArtwork('pause');
            const fallback = pause.getChildByName('CozyPauseIcon');
            if (fallback) {
                fallback.active = !this.hasUiArtwork('pause');
                fallback.setScale(scale, scale, 1);
            }
        }
    }

    private applyHorizontalArtwork(
        parent: Node,
        frames: HorizontalArtworkFrames | undefined,
        targetWidth: number,
        targetHeight: number,
    ): void {
        const left = this.ensureSpriteNode(parent, 'Left');
        const center = this.ensureSpriteNode(parent, 'Center');
        const right = this.ensureSpriteNode(parent, 'Right');
        left.node.setSiblingIndex(0);
        center.node.setSiblingIndex(1);
        right.node.setSiblingIndex(2);
        const children = [left, center, right];

        if (!frames?.left.isValid || !frames.center.isValid || !frames.right.isValid) {
            children.forEach((child) => {
                child.node.active = false;
                child.sprite.spriteFrame = null;
            });
            return;
        }

        const sourceHeight = Math.max(1, frames.left.originalSize.height);
        const heightScale = Math.max(0.01, targetHeight / sourceHeight);
        let leftWidth = frames.left.originalSize.width * heightScale;
        let rightWidth = frames.right.originalSize.width * heightScale;
        let centerWidth = targetWidth - leftWidth - rightWidth;
        if (centerWidth < 1) {
            const edgeWidth = Math.max(1, leftWidth + rightWidth);
            const edgeScale = Math.max(0.01, (targetWidth - 1) / edgeWidth);
            leftWidth *= edgeScale;
            rightWidth *= edgeScale;
            centerWidth = 1;
        }

        this.applySimpleArtworkSlice(
            left,
            frames.left,
            leftWidth,
            targetHeight,
            -targetWidth / 2 + leftWidth / 2,
        );
        this.applySimpleArtworkSlice(
            center,
            frames.center,
            centerWidth,
            targetHeight,
            -targetWidth / 2 + leftWidth + centerWidth / 2,
        );
        this.applySimpleArtworkSlice(
            right,
            frames.right,
            rightWidth,
            targetHeight,
            targetWidth / 2 - rightWidth / 2,
        );
    }

    private applySimpleArtworkSlice(
        artwork: { node: Node; sprite: Sprite; transform: UITransform },
        frame: SpriteFrame,
        width: number,
        height: number,
        x: number,
    ): void {
        artwork.node.active = true;
        artwork.node.setPosition(x, 0);
        artwork.transform.setContentSize(Math.max(1, width), Math.max(1, height));
        artwork.sprite.enabled = true;
        artwork.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        artwork.sprite.type = Sprite.Type.SIMPLE;
        artwork.sprite.spriteFrame = frame;
    }

    private ensureBoardBackground(container: Node): void {
        const artwork = this.ensureSpriteNode(container, 'BoardBackground');
        artwork.node.setSiblingIndex(0);
        artwork.node.active = this.hasUiArtwork('board');
    }

    private applyBoardArtwork(container: Node, width: number, height: number): void {
        const artwork = this.ensureSpriteNode(container, 'BoardBackground');
        const frame = this.ownedUiFrames.get('board');
        artwork.node.setPosition(0, 0);
        artwork.transform.setContentSize(width, height);
        artwork.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        artwork.sprite.type = Sprite.Type.SLICED;
        if (frame?.isValid) {
            this.applyNineSliceInsets(frame, 0.12, 0.12, width, height);
        }
        artwork.sprite.spriteFrame = frame ?? null;
        artwork.node.active = !!frame?.isValid;
    }

    /**
     * Cocos SLICED keeps the four edge patches in source pixels; only the
     * center five patches expand when the target panel becomes wider/taller.
     */
    private applyNineSliceInsets(
        frame: SpriteFrame,
        horizontalRatio: number,
        verticalRatio: number,
        targetWidth: number,
        targetHeight: number,
    ): void {
        const width = Math.max(1, frame.originalSize.width || frame.rect.width);
        const height = Math.max(1, frame.originalSize.height || frame.rect.height);
        // Keep the source edge proportions fixed while reserving a non-zero
        // center patch for narrow devices and changed source dimensions.
        const horizontalInset = Math.min(
            width * 0.48,
            width * horizontalRatio,
            Math.max(0, targetWidth * 0.49),
        );
        const verticalInset = Math.min(
            height * 0.48,
            height * verticalRatio,
            Math.max(0, targetHeight * 0.49),
        );
        frame.insetLeft = horizontalInset;
        frame.insetRight = horizontalInset;
        frame.insetTop = verticalInset;
        frame.insetBottom = verticalInset;
    }

    private drawHudDecor(metrics: WatermelonLayoutMetrics): void {
        const layer = this.node.getChildByName('HudDecorLayer');
        layer?.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        const graphics = layer?.getComponent(Graphics);
        if (!graphics) {
            return;
        }

        const scale = metrics.uiScale;
        const left = metrics.contentX - metrics.contentWidth / 2;
        const right = metrics.contentX + metrics.contentWidth / 2;
        graphics.clear();
        if (!this.hasUiArtwork('score')) {
            this.drawSoftChip(
                graphics,
                metrics.contentX,
                metrics.scoreY,
                CAT_HUD_SCORE_PANEL_WIDTH * scale,
                82 * scale,
                catUiColor('blush'),
                scale,
            );
        }
        if (!this.hasUiArtwork('highScore')) {
            this.drawSoftChip(
                graphics,
                left + CAT_HUD_SCORE_CENTER_OFFSET * scale,
                metrics.scoreY,
                CAT_HUD_HIGH_SCORE_PANEL_WIDTH * scale,
                82 * scale,
                catUiColor('butter'),
                scale,
            );
        }
        if (!this.hasUiArtwork('next')) {
            this.drawSoftChip(
                graphics,
                right - CAT_HUD_NEXT_CENTER_OFFSET * scale,
                metrics.scoreY,
                CAT_HUD_NEXT_PANEL_WIDTH * scale,
                82 * scale,
                catUiColor('mint'),
                scale,
            );
        }
        if (!this.hasUiArtwork('instruction')) {
            graphics.fillColor = catUiColor('surface', 232);
            graphics.strokeColor = catUiColor('sky', 170);
            graphics.lineWidth = 3 * scale;
            graphics.roundRect(
                metrics.contentX - 230 * scale,
                metrics.instructionY - 27 * scale,
                460 * scale,
                54 * scale,
                27 * scale,
            );
            graphics.fill();
            graphics.stroke();
            graphics.fillColor = catUiColor('peach', 160);
            graphics.circle(metrics.contentX - 203 * scale, metrics.instructionY, 7 * scale);
            graphics.fill();
        }

        graphics.fillColor = catUiColor('peach', 165);
        graphics.circle(left + 32 * scale, metrics.dropY + 24 * scale, 6 * scale);
        graphics.fill();
        graphics.fillColor = catUiColor('mintDark', 165);
        graphics.circle(right - 34 * scale, metrics.dropY - 20 * scale, 6 * scale);
        graphics.fill();
    }

    private drawSoftChip(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        color: Color,
        scale = 1,
    ): void {
        graphics.fillColor = catUiColor('ink', 28);
        graphics.roundRect(
            x - width / 2 + 5 * scale,
            y - height / 2 - 6 * scale,
            width,
            height,
            CAT_UI_SHAPE.chipRadius * scale,
        );
        graphics.fill();
        graphics.fillColor = color;
        graphics.strokeColor = catUiColor('surface', 210);
        graphics.lineWidth = 3 * scale;
        graphics.roundRect(
            x - width / 2,
            y - height / 2,
            width,
            height,
            CAT_UI_SHAPE.chipRadius * scale,
        );
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = catUiColor('surface', 180);
        graphics.circle(
            x - width / 2 + 22 * scale,
            y + height / 2 - 21 * scale,
            5 * scale,
        );
        graphics.fill();
    }

    private applyLabelStyles(scale = 1): void {
        this.styleLabel('Title', 36 * scale, catUiColor('ink'), '');
        this.styleNumericHudLabels('ScoreLabel', scale);
        this.styleNumericHudLabels('HighScoreLabel', scale);
        this.styleLabel('NextLabel', CAT_HUD_CAPTION_FONT_SIZE * scale, catUiColor('ink'), '下一只');
        const nextLabel = this.node.getChildByName('NextLabel')?.getComponent(Label);
        if (nextLabel) {
            nextLabel.isBold = true;
            nextLabel.enableOutline = false;
        }
        this.styleLabel('DropZone', 21 * scale, catUiColor('ink', 220), '');
        this.styleLabel('Instruction', 23 * scale, catUiColor('ink', 230), '左右移动，松手投放');
        const danger = this.node.getChildByName('FruitContainer')
            ?.getChildByName('DangerLine')?.getComponent(Label);
        if (danger) {
            danger.color = catUiColor('ink', 205);
            danger.fontSize = 20;
            danger.lineHeight = 28;
        }
    }

    private ensureNumericHudLabels(parentName: string, caption: string): void {
        const parent = this.node.getChildByName(parentName);
        if (!parent) {
            return;
        }

        const legacyLabel = parent.getComponent(Label);
        if (legacyLabel) {
            legacyLabel.string = '';
            legacyLabel.enabled = false;
        }

        const captionLabel = this.ensureHudLabelNode(parent, 'Caption');
        captionLabel.string = caption;
        const valueLabel = this.ensureHudLabelNode(parent, 'Value');
        if (!valueLabel.string) {
            valueLabel.string = '0';
        }
    }

    private ensureHudLabelNode(parent: Node, name: string): Label {
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = parent.layer;
            node.setParent(parent);
            node.addComponent(UITransform);
            node.addComponent(Label);
        }
        return node.getComponent(Label)!;
    }

    private styleNumericHudLabels(parentName: string, scale: number): void {
        const parent = this.node.getChildByName(parentName);
        if (!parent) {
            return;
        }

        const parentSize = parent.getComponent(UITransform)?.contentSize;
        const width = parentSize?.width ?? 114 * scale;
        const caption = parent.getChildByName('Caption')?.getComponent(Label);
        const value = parent.getChildByName('Value')?.getComponent(Label);
        if (!caption || !value) {
            return;
        }

        const captionTransform = caption.node.getComponent(UITransform)!;
        captionTransform.setContentSize(width, 18 * scale);
        caption.node.setPosition(0, CAT_HUD_CAPTION_Y * scale);
        caption.fontSize = CAT_HUD_CAPTION_FONT_SIZE * scale;
        caption.lineHeight = 18 * scale;
        caption.color = catUiColor('ink', 230);
        caption.isBold = true;
        caption.enableOutline = false;
        caption.horizontalAlign = 1;
        caption.verticalAlign = 1;
        caption.overflow = Label.Overflow.SHRINK;

        const valueTransform = value.node.getComponent(UITransform)!;
        valueTransform.setContentSize(width, 30 * scale);
        value.node.setPosition(0, CAT_HUD_VALUE_Y * scale);
        value.fontSize = (parentName === 'ScoreLabel'
            ? CAT_HUD_SCORE_VALUE_FONT_SIZE
            : CAT_HUD_HIGH_SCORE_VALUE_FONT_SIZE) * scale;
        value.lineHeight = 28 * scale;
        value.color = catUiColor('ink');
        value.isBold = true;
        value.enableOutline = false;
        value.horizontalAlign = 1;
        value.verticalAlign = 1;
        value.overflow = Label.Overflow.SHRINK;
    }

    private styleLabel(
        name: string,
        fontSize: number,
        color: Color,
        text?: string,
    ): void {
        const label = this.node.getChildByName(name)?.getComponent(Label);
        if (!label) {
            return;
        }
        if (text !== undefined) {
            label.string = text;
        }
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 7;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
    }

    private setPosition(name: string, x: number, y: number): void {
        this.node.getChildByName(name)?.setPosition(x, y);
    }

    private setContentSize(name: string, width: number, height: number, scale: number): void {
        this.node.getChildByName(name)
            ?.getComponent(UITransform)
            ?.setContentSize(width * scale, height * scale);
    }

    private readonly handleCanvasResize = (): void => {
        if (this.node.isValid) {
            this.applyLayout();
        }
    };
}
