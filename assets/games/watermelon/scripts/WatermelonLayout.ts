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
import { CAT_UI_SHAPE, catUiColor } from './WatermelonUiTheme';

const { ccclass } = _decorator;

export interface WatermelonLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly topY: number;
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
): WatermelonLayoutMetrics {
    const width = Math.max(600, canvasWidth);
    const height = Math.max(1100, canvasHeight);
    const clampedTop = Math.max(0, Math.min(160, safeTop));
    const clampedBottom = Math.max(0, Math.min(120, safeBottom));
    const topY = height / 2 - clampedTop - 68;
    const scoreY = topY - 116;
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

    protected onLoad(): void {
        this.applyLayout();
        view.on('canvas-resize', this.handleCanvasResize, this);
        void this.loadBackground();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        const sprite = this.node.getChildByName('CatRoomBackground')?.getComponent(Sprite);
        if (sprite) {
            sprite.spriteFrame = null;
        }
        this.ownedBackgroundFrame?.destroy();
        this.ownedBackgroundFrame = undefined;
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
        const safeTop = Math.max(0, visible.height - safeRect.y - safeRect.height)
            * designScale;
        const safeBottom = Math.max(0, safeRect.y) * designScale;
        const metrics = calculateWatermelonLayout(
            viewportWidth,
            viewportHeight,
            safeTop,
            safeBottom,
        );
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.ensureHudNodes();
        this.resizeBackground(metrics.width, metrics.height);

        this.setPosition('Title', 0, metrics.topY);
        this.setPosition('PauseButton', metrics.width / 2 - 58, metrics.topY);
        this.setPosition('ScoreLabel', -metrics.width / 2 + 125, metrics.scoreY);
        this.setPosition('HighScoreLabel', 0, metrics.scoreY);
        this.setPosition('NextLabel', metrics.width / 2 - 182, metrics.scoreY + 14);
        this.setPosition('NextFruitPreview', metrics.width / 2 - 78, metrics.scoreY - 6);
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

        this.node.getChildByName('Title')
            ?.getComponent(UITransform)?.setContentSize(320, 64);

        const pause = this.node.getChildByName('PauseButton');
        if (!pause) {
            return;
        }

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
            icon.addComponent(UITransform).setContentSize(88, 88);
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
        // Compact single-line title: calm, centered, and aligned with pause.
        graphics.fillColor = catUiColor('ink', 24);
        graphics.roundRect(-157, metrics.topY - 37, 320, 66, 30);
        graphics.fill();
        graphics.fillColor = catUiColor('surface', 248);
        graphics.strokeColor = catUiColor('blush');
        graphics.lineWidth = 3;
        graphics.roundRect(-160, metrics.topY - 33, 320, 64, 30);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = catUiColor('peach', 175);
        graphics.circle(-133, metrics.topY - 1, 5);
        graphics.fill();
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
        this.styleLabel('Title', 34, catUiColor('ink'), '合成大胖橘');
        this.styleLabel('ScoreLabel', 30, catUiColor('ink'));
        this.styleLabel('HighScoreLabel', 27, catUiColor('ink'));
        this.styleLabel('NextLabel', 23, catUiColor('ink'), '下一只');
        this.styleLabel('DropZone', 21, catUiColor('mutedInk', 220), '拖动猫咪，松手投放');
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
