import {
    Color,
    Graphics,
    Label,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    Tween,
    UITransform,
    Vec2,
    Vec3,
    tween,
} from 'cc';
import type { UpgradeOption } from '../systems/UpgradeSystem';

const COLORS = Object.freeze({
    text: new Color(225, 245, 237, 255),
    muted: new Color(154, 195, 184, 255),
    gold: new Color(231, 198, 106, 255),
    panel: new Color(12, 26, 27, 238),
    button: new Color(35, 102, 104, 255),
});

const PANEL_WIDTH = 710;
const PANEL_HEIGHT = 532;
const CARD_WIDTH = 216;
const CARD_HEIGHT = 294;
const CARD_XS = [-212, 0, 212] as const;
const CARD_CONTENT_WIDTH = 174;
const CARD_EFFECT_WIDTH = 144;
const REFRESH_BUTTON_WIDTH = 292;
const REFRESH_BUTTON_HEIGHT = 84;

export interface UpgradeOverlayTextures {
    readonly panel?: Texture2D;
    readonly card?: Texture2D;
    readonly activeIcons?: Texture2D;
    readonly passiveIcons?: Texture2D;
    readonly buttons?: Texture2D;
}

export type UpgradeOptionHandler = (option: UpgradeOption) => void;
export type UpgradeRefreshHandler = () => void;

interface CardView {
    readonly node: Node;
    readonly iconNode: Node;
    readonly iconSprite: Sprite;
    readonly nameLabel: Label;
    readonly levelLabel: Label;
    readonly descriptionLabel: Label;
    readonly effectLabel: Label;
    iconFrame?: SpriteFrame;
}

/**
 * 无尽剑域自有升级视图。它只负责绘制和触摸回调，不决定升级结果，
 * 正式皮肤来自 game-endless-sword Bundle，不依赖 shared UI。
 */
export class UpgradeOverlay {
    readonly node: Node;

    private readonly panelNode: Node;
    private readonly panelSprite?: Sprite;
    private panelFrame?: SpriteFrame;
    private readonly cards: CardView[] = [];
    private readonly refreshButton: Node;
    private readonly refreshLabel: Label;
    private cardFrame?: SpriteFrame;
    private buttonFrame?: SpriteFrame;
    private readonly textures: UpgradeOverlayTextures;
    private readonly onSelect: UpgradeOptionHandler;
    private readonly onRefresh: UpgradeRefreshHandler;
    private currentWidth = 750;
    private currentHeight = 1334;

    constructor(
        parent: Node,
        textures: UpgradeOverlayTextures,
        onSelect: UpgradeOptionHandler,
        onRefresh: UpgradeRefreshHandler,
    ) {
        this.textures = textures;
        this.onSelect = onSelect;
        this.onRefresh = onRefresh;
        this.node = new Node('UpgradeOverlay');
        this.node.layer = parent.layer;
        parent.addChild(this.node);

        const blocker = new Node('Blocker');
        blocker.layer = this.node.layer;
        blocker.addComponent(UITransform).setContentSize(750, 1334);
        const blockerGraphics = blocker.addComponent(Graphics);
        blockerGraphics.fillColor = new Color(3, 10, 12, 188);
        blockerGraphics.rect(-375, -667, 750, 1334);
        blockerGraphics.fill();
        this.node.addChild(blocker);

        this.panelNode = new Node('Panel');
        this.panelNode.layer = this.node.layer;
        this.panelNode.addComponent(UITransform).setContentSize(PANEL_WIDTH, PANEL_HEIGHT);
        if (textures.panel) {
            this.panelSprite = this.panelNode.addComponent(Sprite);
            this.panelSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.panelFrame = createFullFrame(textures.panel);
            this.panelSprite.spriteFrame = this.panelFrame;
        } else {
            const panelGraphics = this.panelNode.addComponent(Graphics);
            panelGraphics.fillColor = COLORS.panel;
            panelGraphics.roundRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 24);
            panelGraphics.fill();
            panelGraphics.strokeColor = COLORS.gold;
            panelGraphics.lineWidth = 3;
            panelGraphics.roundRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 24);
            panelGraphics.stroke();
        }
        this.node.addChild(this.panelNode);

        const title = new Node('Title');
        title.layer = this.node.layer;
        title.addComponent(UITransform).setContentSize(520, 48);
        title.setPosition(0, 166, 0);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '境界感悟';
        titleLabel.fontSize = 34;
        titleLabel.lineHeight = 44;
        titleLabel.color = COLORS.gold;
        this.panelNode.addChild(title);

        for (let index = 0; index < 3; index += 1) {
            this.cards.push(this.createCard(index, CARD_XS[index]));
        }

        this.refreshButton = this.createButton(
            'RefreshButton',
            REFRESH_BUTTON_WIDTH,
            REFRESH_BUTTON_HEIGHT,
        );
        this.refreshButton.setPosition(0, -314, 0);
        this.refreshButton.on(Node.EventType.TOUCH_END, this.handleRefresh, this);
        this.panelNode.addChild(this.refreshButton);
        const refreshLabelNode = new Node('Label');
        refreshLabelNode.layer = this.node.layer;
        refreshLabelNode.addComponent(UITransform).setContentSize(
            REFRESH_BUTTON_WIDTH,
            REFRESH_BUTTON_HEIGHT,
        );
        this.refreshButton.addChild(refreshLabelNode);
        this.refreshLabel = refreshLabelNode.addComponent(Label);
        this.refreshLabel.fontSize = 23;
        this.refreshLabel.lineHeight = 30;
        this.refreshLabel.color = COLORS.text;
        this.node.active = false;
    }

    setOptions(options: readonly UpgradeOption[], refreshesRemaining: number): void {
        for (let index = 0; index < this.cards.length; index += 1) {
            const option = options[index];
            const card = this.cards[index];
            card.node.active = Boolean(option);
            if (option) {
                this.renderCard(card, option);
                card.node.targetOff(this);
                card.node.on(
                    Node.EventType.TOUCH_END,
                    () => this.onSelect(option),
                    this,
                );
            }
        }
        this.refreshLabel.string = refreshesRemaining > 0
            ? `刷新 ×${refreshesRemaining}`
            : '刷新已用尽';
        this.refreshButton.getComponent(UITransform)?.setContentSize(
            REFRESH_BUTTON_WIDTH,
            REFRESH_BUTTON_HEIGHT,
        );
    }

    setVisible(visible: boolean): void {
        if (!visible) {
            Tween.stopAllByTarget(this.panelNode);
            this.panelNode.setScale(1, 1, 1);
            this.node.active = false;
            return;
        }

        Tween.stopAllByTarget(this.panelNode);
        this.node.active = visible;
        this.panelNode.setScale(0.78, 0.78, 1);
        tween(this.panelNode)
            .to(0.28, {
                scale: new Vec3(1, 1, 1),
            }, { easing: 'backOut' })
            .start();
    }

    resize(width: number, height: number): void {
        this.currentWidth = width;
        this.currentHeight = height;
        this.node.getComponent(UITransform)?.setContentSize(width, height);
        const blocker = this.node.getChildByName('Blocker');
        blocker?.getComponent(UITransform)?.setContentSize(width, height);
        const graphics = blocker?.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
            graphics.fillColor = new Color(3, 10, 12, 188);
            graphics.rect(-width / 2, -height / 2, width, height);
            graphics.fill();
        }
        this.node.setPosition(0, 0, 0);
        this.panelNode.setPosition(0, Math.max(-70, Math.min(36, (height - 1334) * 0.08)), 0);
    }

    destroy(): void {
        Tween.stopAllByTarget(this.panelNode);
        for (const card of this.cards) {
            if (card.iconFrame?.isValid) {
                card.iconFrame.destroy();
            }
            card.iconFrame = undefined;
        }
        if (this.cardFrame?.isValid) {
            this.cardFrame.destroy();
        }
        if (this.panelFrame?.isValid) {
            this.panelFrame.destroy();
        }
        if (this.buttonFrame?.isValid) {
            this.buttonFrame.destroy();
        }
        if (this.panelNode.isValid) {
            this.panelNode.destroy();
        }
        if (this.node.isValid) {
            this.node.destroy();
        }
        void this.currentWidth;
        void this.currentHeight;
    }

    private createCard(index: number, x: number): CardView {
        const node = new Node(`UpgradeCard-${index}`);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        node.setPosition(x, -16, 0);
        if (this.textures.card) {
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.cardFrame ??= createFullFrame(this.textures.card);
            sprite.spriteFrame = this.cardFrame;
        } else {
            const graphics = node.addComponent(Graphics);
            graphics.fillColor = new Color(13, 31, 34, 245);
            graphics.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 18);
            graphics.fill();
            graphics.strokeColor = new Color(100, 214, 180, 255);
            graphics.lineWidth = 3;
            graphics.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 18);
            graphics.stroke();
        }
        this.panelNode.addChild(node);

        const iconNode = new Node('Icon');
        iconNode.layer = this.node.layer;
        iconNode.addComponent(UITransform).setContentSize(82, 82);
        iconNode.setPosition(0, 75, 0);
        const iconSprite = iconNode.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.addChild(iconNode);

        const nameLabel = this.createLabel(node, 'Name', 24, 24, COLORS.text, 0, 21);
        const levelLabel = this.createLabel(node, 'Level', 19, 22, COLORS.gold, 0, 1);
        const descriptionLabel = this.createLabel(
            node,
            'Description',
            15,
            28,
            COLORS.muted,
            0,
            -31,
        );
        const effectLabel = this.createLabel(
            node,
            'Effect',
            16,
            52,
            COLORS.text,
            0,
            -70,
            CARD_EFFECT_WIDTH,
        );
        return {
            node,
            iconNode,
            iconSprite,
            nameLabel,
            levelLabel,
            descriptionLabel,
            effectLabel,
        };
    }

    private createLabel(
        parent: Node,
        name: string,
        fontSize: number,
        height: number,
        color: Color,
        x: number,
        y: number,
        width = CARD_CONTENT_WIDTH,
    ): Label {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = Math.max(fontSize + 4, height / 2);
        label.color = color;
        label.overflow = Label.Overflow.SHRINK;
        parent.addChild(node);
        return label;
    }

    private renderCard(card: CardView, option: UpgradeOption): void {
        if (card.iconFrame?.isValid) {
            card.iconFrame.destroy();
        }
        card.iconFrame = undefined;
        const iconTexture = option.iconKind === 'active'
            ? this.textures.activeIcons
            : option.iconKind === 'passive'
                ? this.textures.passiveIcons
                : undefined;
        if (iconTexture && option.iconRect) {
            card.iconFrame = createAtlasFrame(iconTexture, option.iconRect);
            card.iconSprite.spriteFrame = card.iconFrame;
            card.iconSprite.enabled = true;
        } else {
            card.iconSprite.spriteFrame = null;
            card.iconSprite.enabled = false;
            drawPickupIcon(card.iconNode, option.iconKind === 'pickup');
        }
        card.nameLabel.string = option.displayName;
        card.levelLabel.string = option.kind === 'spring'
            ? '恢复'
            : `Lv${option.currentLevel} → Lv${option.nextLevel}`;
        card.descriptionLabel.string = option.description;
        card.effectLabel.string = option.effectText;
    }

    private createButton(name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        if (this.textures.buttons) {
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.buttonFrame ??= createAtlasFrame(this.textures.buttons, {
                x: 0,
                y: 0,
                width: 1024,
                height: 512,
            });
            sprite.spriteFrame = this.buttonFrame;
        } else {
            const graphics = node.addComponent(Graphics);
            graphics.fillColor = COLORS.button;
            graphics.roundRect(-width / 2, -height / 2, width, height, 16);
            graphics.fill();
        }
        return node;
    }

    private handleRefresh(): void {
        this.onRefresh();
    }
}

function createFullFrame(texture: Texture2D): SpriteFrame {
    return createAtlasFrame(texture, {
        x: 0,
        y: 0,
        width: texture.width,
        height: texture.height,
    });
}

function createAtlasFrame(
    texture: Texture2D,
    rect: Readonly<{ x: number; y: number; width: number; height: number }>,
): SpriteFrame {
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(rect.x, rect.y, rect.width, rect.height);
    frame.originalSize = new Size(rect.width, rect.height);
    frame.offset = new Vec2(0, 0);
    return frame;
}

function drawPickupIcon(node: Node, visible: boolean): void {
    let graphics = node.getComponent(Graphics);
    if (!graphics) {
        graphics = node.addComponent(Graphics);
    }
    graphics.clear();
    graphics.enabled = visible;
    if (!visible) {
        return;
    }
    graphics.fillColor = new Color(255, 199, 70, 255);
    graphics.circle(0, 0, 24);
    graphics.fill();
    graphics.strokeColor = COLORS.gold;
    graphics.lineWidth = 5;
    graphics.circle(0, 0, 30);
    graphics.stroke();
}
