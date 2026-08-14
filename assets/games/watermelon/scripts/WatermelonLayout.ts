import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
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

/** 安全区只改变 HUD 与底部留白；玩法宽度和危险线相对容器的规则保持不变。 */
export function calculateWatermelonLayout(
    canvasWidth: number,
    canvasHeight: number,
    safeTop = 0,
    safeBottom = 0,
    platformLayout?: PlatformLayoutInfo,
): WatermelonLayoutMetrics {
    const width = Math.max(600, canvasWidth);
    const height = Math.max(1100, canvasHeight);
    const clampedTop = Math.max(0, Math.min(160, safeTop));
    const clampedBottom = Math.max(0, Math.min(120, safeBottom));
    const pausePosition = calculateTopRightControlPosition(
        width,
        height,
        platformLayout,
        {
            controlWidth: 88,
            // 标题图片高于暂停按钮，两者共用中心线时按标题高度避让胶囊。
            controlHeight: 140,
            rightInset: 58,
            defaultTopInset: clampedTop + 68,
            reservedGap: 10,
        },
    );
    // 标题与暂停按钮共用同一视觉基线，并一起落在平台胶囊下方。
    const topY = pausePosition.y;
    // 胶囊较低的机型会同步下移 HUD 第二行，避免“修好胶囊、又压住下一只猫”式局部补丁。
    const scoreY = topY - 134;
    const dropY = scoreY - 88;
    const instructionY = -height / 2 + clampedBottom + 54;
    const boardTop = dropY - 42;
    const boardBottom = instructionY + 65;
    const boardHeight = Math.min(800, Math.max(580, boardTop - boardBottom));
    const boardWidth = Math.min(650, width - 70);

    return Object.freeze({
        width,
        height,
        topY,
        pauseX: pausePosition.x,
        pauseY: pausePosition.y,
        scoreY,
        dropY,
        boardCenterY: (boardTop + boardBottom) / 2,
        boardWidth,
        boardHeight,
        dangerY: boardHeight / 2 - 145,
        instructionY,
    });
}

/** 萌系猫咪屋 HUD 与常见竖屏比例适配，不包含玩法状态。 */
@ccclass('WatermelonLayout')
export class WatermelonLayout extends Component {
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedTitleFrame?: SpriteFrame;
    private platformLayout?: PlatformLayoutInfo;

    protected onLoad(): void {
        this.applyLayout();
        view.on('canvas-resize', this.handleCanvasResize, this);
        void this.loadBackground();
        void this.loadTitleArtwork();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        const sprite = this.node.getChildByName('CatRoomBackground')?.getComponent(Sprite);
        if (sprite) {
            sprite.spriteFrame = null;
        }
        this.ownedBackgroundFrame?.destroy();
        this.ownedBackgroundFrame = undefined;
        const titleSprite = this.node.getChildByName('Title')
            ?.getChildByName('TitleArtwork')?.getComponent(Sprite);
        if (titleSprite) titleSprite.spriteFrame = null;
        this.ownedTitleFrame?.destroy();
        this.ownedTitleFrame = undefined;
    }

    /** 由 MiniGameContext 注入平台原生 UI 约束，供初始化和后续 resize 共同使用。 */
    setPlatformLayout(layout: PlatformLayoutInfo): void {
        this.platformLayout = layout;
        this.applyLayout();
    }

    applyLayout(): void {
        const canvasTransform = this.node.parent?.getComponent(UITransform);
        const canvasSize = canvasTransform?.contentSize ?? { width: 750, height: 1334 };
        const visible = view.getVisibleSize();
        // A scene Canvas can briefly keep the fixed design size while a wider
        // device/preview viewport is already visible. Follow the visible area
        // so the background and root UI never expose camera-clear bars.
        const viewportWidth = Math.max(canvasSize.width, visible.width);
        const viewportHeight = Math.max(canvasSize.height, visible.height);
        const safeRect = sys.getSafeAreaRect();
        const designScale = visible.width > 0 ? viewportWidth / visible.width : 1;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height)
            * designScale;
        const systemSafeBottom = Math.max(0, safeRect.y) * designScale;
        const safeTop = Math.max(systemSafeTop, this.platformLayout?.safeArea.top ?? 0);
        const platformSafeBottom = this.platformLayout
            ? Math.max(0, viewportHeight - this.platformLayout.safeArea.bottom)
            : 0;
        const safeBottom = Math.max(systemSafeBottom, platformSafeBottom);
        const metrics = calculateWatermelonLayout(
            viewportWidth,
            viewportHeight,
            safeTop,
            safeBottom,
            this.platformLayout,
        );
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.ensureHudNodes();
        this.resizeBackground(metrics.width, metrics.height);

        this.setPosition('Title', 0, metrics.topY);
        this.setPosition('PauseButton', metrics.pauseX, metrics.pauseY);
        this.setPosition('ScoreLabel', -metrics.width / 2 + 125, metrics.scoreY);
        this.setPosition('HighScoreLabel', 0, metrics.scoreY);
        this.setPosition('NextLabel', metrics.width / 2 - 182, metrics.scoreY + 14);
        this.setPosition('NextFruitPreview', metrics.width / 2 - 78, metrics.scoreY);
        this.setPosition('DropZone', 0, metrics.dropY);
        this.setPosition('Instruction', 0, metrics.instructionY);

        const container = this.node.getChildByName('FruitContainer');
        if (!container) {
            return;
        }

        container.setPosition(0, metrics.boardCenterY);
        container.getComponent(UITransform)?.setContentSize(metrics.boardWidth, metrics.boardHeight);
        container.getChildByName('DangerLine')?.setPosition(0, metrics.dangerY);
        this.drawHudDecor(metrics);
        this.applyLabelStyles();

        const graphics = container.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
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
                        const spriteFrame = new SpriteFrame();
                        spriteFrame.texture = texture;
                        this.ownedBackgroundFrame = spriteFrame;
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
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    this.ownedTitleFrame?.destroy();
                    this.ownedTitleFrame = frame;
                    sprite.spriteFrame = frame;
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    artwork.getComponent(UITransform)?.setContentSize(350, 140);
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
        const sourceAspect = 750 / 1334;
        const targetAspect = width / height;
        const drawWidth = targetAspect > sourceAspect ? width : height * sourceAspect;
        const drawHeight = targetAspect > sourceAspect ? width / sourceAspect : height;
        background.getComponent(UITransform)?.setContentSize(drawWidth, drawHeight);
    }

    private drawHudDecor(metrics: WatermelonLayoutMetrics): void {
        const layer = this.node.getChildByName('HudDecorLayer');
        layer?.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        const graphics = layer?.getComponent(Graphics);
        if (!graphics) {
            return;
        }

        graphics.clear();
        this.drawSoftChip(graphics, -metrics.width / 2 + 125, metrics.scoreY, 214, 82, catUiColor('blush'));
        this.drawSoftChip(graphics, 0, metrics.scoreY, 190, 82, catUiColor('butter'));
        this.drawSoftChip(graphics, metrics.width / 2 - 128, metrics.scoreY, 238, 82, catUiColor('mint'));
        graphics.fillColor = catUiColor('surface', 232);
        graphics.strokeColor = catUiColor('sky', 170);
        graphics.lineWidth = 3;
        graphics.roundRect(-230, metrics.instructionY - 27, 460, 54, 27);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = catUiColor('peach', 160);
        graphics.circle(-203, metrics.instructionY, 7);
        graphics.fill();

        graphics.fillColor = catUiColor('peach', 165);
        graphics.circle(-metrics.width / 2 + 32, metrics.dropY + 24, 6);
        graphics.fill();
        graphics.fillColor = catUiColor('mintDark', 165);
        graphics.circle(metrics.width / 2 - 34, metrics.dropY - 20, 6);
        graphics.fill();
    }

    private drawSoftChip(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        color: Color,
    ): void {
        graphics.fillColor = catUiColor('ink', 28);
        graphics.roundRect(x - width / 2 + 5, y - height / 2 - 6, width, height, CAT_UI_SHAPE.chipRadius);
        graphics.fill();
        graphics.fillColor = color;
        graphics.strokeColor = catUiColor('surface', 210);
        graphics.lineWidth = 3;
        graphics.roundRect(x - width / 2, y - height / 2, width, height, CAT_UI_SHAPE.chipRadius);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = catUiColor('surface', 180);
        graphics.circle(x - width / 2 + 22, y + height / 2 - 21, 5);
        graphics.fill();
    }

    private applyLabelStyles(): void {
        this.styleLabel('Title', 36, catUiColor('ink'), '');
        this.styleLabel('ScoreLabel', 30, catUiColor('ink'));
        this.styleLabel('HighScoreLabel', 27, catUiColor('ink'));
        this.styleLabel('NextLabel', 23, catUiColor('ink'), '下一只');
        this.styleLabel('DropZone', 21, catUiColor('mutedInk', 220), '');
        this.styleLabel('Instruction', 23, catUiColor('ink', 230), '左右移动，松手投放');
        const danger = this.node.getChildByName('FruitContainer')
            ?.getChildByName('DangerLine')?.getComponent(Label);
        if (danger) {
            danger.color = catUiColor('peachDark', 205);
            danger.fontSize = 20;
            danger.lineHeight = 28;
        }
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

    private readonly handleCanvasResize = (): void => {
        if (this.node.isValid) {
            this.applyLayout();
        }
    };
}
