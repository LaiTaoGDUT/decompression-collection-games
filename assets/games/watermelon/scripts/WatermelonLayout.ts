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

/** C1 猫咪屋 HUD 与常见竖屏比例适配，不包含玩法状态。 */
@ccclass('WatermelonLayout')
export class WatermelonLayout extends Component {
    private ownedBackgroundFrame?: SpriteFrame;

    protected onLoad(): void {
        this.applyLayout();
        void this.loadBackground();
    }

    protected onDestroy(): void {
        const sprite = this.node.getChildByName('W1Background')?.getComponent(Sprite);
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
        const safeRect = sys.getSafeAreaRect();
        const designScale = visible.width > 0 ? canvasSize.width / visible.width : 1;
        const safeTop = Math.max(0, visible.height - safeRect.y - safeRect.height)
            * designScale;
        const safeBottom = Math.max(0, safeRect.y) * designScale;
        const metrics = calculateWatermelonLayout(
            canvasSize.width,
            canvasSize.height,
            safeTop,
            safeBottom,
        );
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.ensureHudNodes();
        this.resizeBackground(metrics.width, metrics.height);

        // Keep score/board geometry stable while lowering only the title plaque
        // away from browser preview crops that report no notch inset.
        this.setPosition('Title', 0, metrics.topY - 7);
        this.setPosition('PaperEditionTag', 0, metrics.topY - 39);
        this.node.getChildByName('PaperEditionTag')
            ?.getComponent(UITransform)?.setContentSize(240, 18);
        this.setPosition('PauseButton', metrics.width / 2 - 68, metrics.topY);
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
        this.drawHudPaper(metrics);
        this.applyLabelStyles();

        const graphics = container.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
            graphics.fillColor = new Color(75, 43, 32, 38);
            graphics.roundRect(
                -metrics.boardWidth / 2 + 9,
                -metrics.boardHeight / 2 - 12,
                metrics.boardWidth,
                metrics.boardHeight,
                26,
            );
            graphics.fill();
            graphics.fillColor = new Color(255, 242, 214, 245);
            graphics.strokeColor = new Color(238, 139, 102, 255);
            graphics.lineWidth = 10;
            graphics.roundRect(
                -metrics.boardWidth / 2,
                -metrics.boardHeight / 2,
                metrics.boardWidth,
                metrics.boardHeight,
                26,
            );
            graphics.fill();
            graphics.stroke();
            graphics.strokeColor = new Color(216, 154, 88, 110);
            graphics.lineWidth = 3;
            graphics.roundRect(
                -metrics.boardWidth / 2 + 13,
                -metrics.boardHeight / 2 + 13,
                metrics.boardWidth - 26,
                metrics.boardHeight - 26,
                18,
            );
            graphics.stroke();
            graphics.fillColor = new Color(249, 199, 79, 90);
            graphics.moveTo(metrics.boardWidth / 2 - 92, metrics.boardHeight / 2 - 5);
            graphics.lineTo(metrics.boardWidth / 2 - 5, metrics.boardHeight / 2 - 5);
            graphics.lineTo(metrics.boardWidth / 2 - 5, metrics.boardHeight / 2 - 92);
            graphics.close();
            graphics.fill();
            graphics.strokeColor = new Color(75, 43, 32, 55);
            graphics.lineWidth = 3;
            graphics.moveTo(metrics.boardWidth / 2 - 92, metrics.boardHeight / 2 - 5);
            graphics.lineTo(metrics.boardWidth / 2 - 5, metrics.boardHeight / 2 - 92);
            graphics.stroke();
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

        if (!this.node.getChildByName('HudPaperLayer')) {
            const paper = new Node('HudPaperLayer');
            paper.layer = this.node.layer;
            paper.setParent(this.node);
            paper.addComponent(UITransform).setContentSize(750, 1334);
            paper.addComponent(Graphics);
            paper.setSiblingIndex(0);
        }

        if (!this.node.getChildByName('PaperEditionTag')) {
            const tag = new Node('PaperEditionTag');
            tag.layer = this.node.layer;
            tag.setParent(this.node);
            tag.addComponent(UITransform).setContentSize(260, 28);
            const label = tag.addComponent(Label);
            label.string = 'W1 · PAPER MERGE';
            label.fontSize = 15;
            label.lineHeight = 22;
            label.color = new Color(128, 83, 59, 255);
            label.horizontalAlign = 1;
            label.verticalAlign = 1;
        }

        const pause = this.node.getChildByName('PauseButton');
        if (!pause) {
            return;
        }

        pause.getComponent(UITransform)?.setContentSize(96, 96);
        const button = pause.getComponent(Button);
        if (button) {
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.94;
        }
        const oldLabel = pause.getChildByName('Label')?.getComponent(Label);
        if (oldLabel) {
            oldLabel.string = '';
        }

        let icon = pause.getChildByName('PaperPauseIcon');
        if (!icon) {
            icon = new Node('PaperPauseIcon');
            icon.layer = pause.layer;
            icon.setParent(pause);
            icon.addComponent(UITransform).setContentSize(96, 96);
            icon.addComponent(Graphics);
        }
        const graphics = icon.getComponent(Graphics)!;
        graphics.clear();
        graphics.fillColor = new Color(242, 139, 102, 255);
        graphics.roundRect(-44, -44, 88, 88, 18);
        graphics.fill();
        graphics.fillColor = new Color(75, 43, 32, 255);
        graphics.rect(-17, -22, 10, 44);
        graphics.rect(7, -22, 10, 44);
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
                        let background = this.node.getChildByName('W1Background');
                        if (!background) {
                            background = new Node('W1Background');
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
        const background = this.node.getChildByName('W1Background');
        if (!background) {
            return;
        }
        const sourceAspect = 750 / 1334;
        const targetAspect = width / height;
        const drawWidth = targetAspect > sourceAspect ? width : height * sourceAspect;
        const drawHeight = targetAspect > sourceAspect ? width / sourceAspect : height;
        background.getComponent(UITransform)?.setContentSize(drawWidth, drawHeight);
    }

    private drawHudPaper(metrics: WatermelonLayoutMetrics): void {
        const graphics = this.node.getChildByName('HudPaperLayer')?.getComponent(Graphics);
        if (!graphics) {
            return;
        }

        graphics.clear();
        graphics.fillColor = new Color(75, 43, 32, 28);
        graphics.roundRect(-184, metrics.topY - 58, 368, 72, 22);
        graphics.fill();
        graphics.fillColor = new Color(255, 247, 226, 245);
        graphics.roundRect(-190, metrics.topY - 52, 368, 72, 22);
        graphics.fill();
        graphics.fillColor = new Color(242, 139, 102, 255);
        graphics.roundRect(-190, metrics.topY - 52, 9, 72, 5);
        graphics.fill();
        this.drawPaperTag(graphics, -metrics.width / 2 + 125, metrics.scoreY, 214, 82, new Color(255, 226, 168, 255));
        this.drawPaperTag(graphics, 0, metrics.scoreY, 190, 82, new Color(249, 199, 79, 255));
        this.drawPaperTag(graphics, metrics.width / 2 - 128, metrics.scoreY, 238, 82, new Color(201, 232, 213, 255));
        graphics.fillColor = new Color(255, 247, 226, 226);
        graphics.roundRect(-230, metrics.instructionY - 27, 460, 54, 16);
        graphics.fill();
        graphics.fillColor = new Color(249, 199, 79, 150);
        graphics.moveTo(-230, metrics.instructionY + 27);
        graphics.lineTo(-196, metrics.instructionY + 27);
        graphics.lineTo(-230, metrics.instructionY - 7);
        graphics.close();
        graphics.fill();

        graphics.fillColor = new Color(242, 139, 102, 165);
        graphics.circle(-metrics.width / 2 + 32, metrics.dropY + 24, 6);
        graphics.fill();
        graphics.fillColor = new Color(85, 151, 108, 165);
        graphics.circle(metrics.width / 2 - 34, metrics.dropY - 20, 6);
        graphics.fill();
    }

    private drawPaperTag(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        color: Color,
    ): void {
        graphics.fillColor = new Color(75, 43, 32, 38);
        graphics.roundRect(x - width / 2 + 6, y - height / 2 - 7, width, height, 16);
        graphics.fill();
        graphics.fillColor = color;
        graphics.roundRect(x - width / 2, y - height / 2, width, height, 16);
        graphics.fill();
        graphics.fillColor = new Color(75, 43, 32, 24);
        graphics.moveTo(x + width / 2 - 30, y + height / 2);
        graphics.lineTo(x + width / 2, y + height / 2 - 30);
        graphics.lineTo(x + width / 2 - 30, y + height / 2 - 30);
        graphics.close();
        graphics.fill();
    }

    private applyLabelStyles(): void {
        this.styleLabel('Title', 36, new Color(61, 33, 24, 255), '合成大胖橘');
        this.styleLabel('ScoreLabel', 30, new Color(75, 43, 32, 255));
        this.styleLabel('HighScoreLabel', 27, new Color(75, 43, 32, 255));
        this.styleLabel('NextLabel', 23, new Color(75, 43, 32, 255), '下一个');
        this.styleLabel('DropZone', 21, new Color(75, 43, 32, 210), '拖动猫咪，松手投放');
        this.styleLabel('Instruction', 23, new Color(75, 43, 32, 230), '左右移动，松手投放');
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
}
