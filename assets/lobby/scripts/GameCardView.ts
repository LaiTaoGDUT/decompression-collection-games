import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UITransform,
    Vec3,
    VerticalTextAlignment,
} from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';

const { ccclass } = _decorator;
export type GameCardClickHandler = (manifest: GameManifest) => void;

const COLORS = {
    surface: new Color(255, 239, 205, 255),
    mutedSurface: new Color(218, 234, 221, 255),
    border: new Color(174, 145, 110, 255),
    primary: new Color(54, 42, 34, 255),
    secondary: new Color(108, 94, 81, 255),
    action: new Color(63, 107, 78, 255),
    disabled: new Color(184, 180, 169, 255),
    brass: new Color(169, 133, 77, 255),
    sage: new Color(113, 131, 117, 255),
    coral: new Color(238, 133, 103, 255),
    butter: new Color(246, 199, 84, 255),
    paper: new Color(255, 247, 226, 255),
    shadow: new Color(58, 48, 38, 35),
};

type CardMode = 'game' | 'coming-soon';

/** Lobby collectible card with an animated artwork window and paper details. */
@ccclass('GameCardView')
export class GameCardView extends Component {
    private manifest?: GameManifest;
    private clickHandler?: GameCardClickHandler;
    private mode: CardMode = 'game';
    private cardWidth = 323;
    private cardHeight = 430;
    private coverRoot?: Node;
    private coverSprite?: Sprite;
    private cardSurface?: Graphics;
    private actionBackground?: Graphics;
    private decorRoot?: Node;
    private ownedCoverFrame?: SpriteFrame;
    private coverLoadToken = 0;
    private idleScoreText = '';

    protected onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.handleClick, this);
        this.ensureStructure();
        this.setCardSize(this.cardWidth, this.cardHeight);
    }

    protected onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.handleClick, this);
        this.stopCoverMotion();
        this.releaseOwnedCoverFrame();
    }

    bind(
        manifest: GameManifest,
        highScore: number | undefined,
        clickHandler: GameCardClickHandler,
    ): void {
        this.ensureStructure();
        this.mode = 'game';
        this.manifest = manifest;
        this.clickHandler = clickHandler;
        this.node.name = `GameCard-${manifest.id}`;
        this.requireLabel('NameLabel').string = manifest.name;
        this.requireLabel('DescriptionLabel').string = manifest.description;
        this.idleScoreText = highScore === undefined
            ? '尚无记录 · 等你来挑战'
            : `最高分 ${Math.max(0, Math.floor(highScore))}`;
        this.requireLabel('ScoreLabel').string = this.idleScoreText;
        this.configureBadge('PAPER MERGE');
        this.setIdle();
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(false);
        this.loadCover(manifest.cover);
    }

    bindComingSoon(): void {
        this.ensureStructure();
        this.mode = 'coming-soon';
        this.manifest = undefined;
        this.clickHandler = undefined;
        this.coverLoadToken += 1;
        this.releaseOwnedCoverFrame();
        this.node.name = 'ComingSoonCard';
        this.requireLabel('NameLabel').string = '更多游戏';
        this.requireLabel('DescriptionLabel').string = '下一件解压展品正在制作中';
        this.requireLabel('ScoreLabel').string = '敬请期待';
        this.requireActionNode().active = false;
        this.requireButton().interactable = false;
        this.configureBadge('NEXT EXHIBIT');
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(true);
    }

    setCardSize(width: number, height: number): void {
        this.ensureStructure();
        this.cardWidth = Math.max(240, width);
        this.cardHeight = Math.max(360, height);
        this.node.getComponent(UITransform)?.setContentSize(
            this.cardWidth,
            this.cardHeight,
        );
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(this.mode === 'coming-soon');
        this.requireActionNode().active = false;
    }

    setLoading(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireLabel('ScoreLabel').string = '正在打开这件展品…';
        this.requireButton().interactable = false;
        this.requireActionNode().active = false;
    }

    setEnterFailed(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireLabel('ScoreLabel').string = '进入失败 · 点击卡片重试';
        this.requireButton().interactable = true;
        this.requireActionNode().active = false;
    }

    setIdle(): void {
        if (this.mode !== 'game') {
            return;
        }
        const enabled = this.manifest?.enabled ?? false;
        this.requireActionNode().active = false;
        this.requireLabel('ScoreLabel').string = enabled ? this.idleScoreText : '暂未开放';
        this.requireButton().interactable = enabled;
    }

    private ensureStructure(): void {
        const parentLayer = this.node.parent?.layer ?? this.node.layer;
        this.applyLayer(this.node, parentLayer);

        const rootSprite = this.getComponent(Sprite);
        if (rootSprite) {
            rootSprite.enabled = false;
        }
        const button = this.requireButton();
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.965;
        button.duration = 0.12;

        if (!this.getComponent(Graphics)) {
            this.node.addComponent(Graphics);
        }
        this.getComponent(Graphics)?.clear();

        let surface = this.node.getChildByName('CardSurface');
        if (!surface) {
            surface = new Node('CardSurface');
            surface.layer = parentLayer;
            this.node.addChild(surface);
            surface.addComponent(UITransform);
            surface.addComponent(Graphics);
        }
        surface.setSiblingIndex(0);
        this.cardSurface = surface.getComponent(Graphics) ?? undefined;

        const legacyIcon = this.node.getChildByName('Icon');
        this.coverRoot = this.node.getChildByName('Cover') ?? legacyIcon ?? undefined;
        if (!this.coverRoot) {
            this.coverRoot = new Node('Cover');
            this.coverRoot.layer = parentLayer;
            this.node.addChild(this.coverRoot);
            this.coverRoot.addComponent(UITransform);
        } else {
            this.coverRoot.name = 'Cover';
        }
        const legacySprite = this.coverRoot.getComponent(Sprite);
        if (legacySprite) {
            legacySprite.enabled = false;
        }
        if (!this.coverRoot.getComponent(Graphics)) {
            this.coverRoot.addComponent(Graphics);
        }

        let artwork = this.coverRoot.getChildByName('CoverArtwork');
        if (!artwork) {
            artwork = new Node('CoverArtwork');
            artwork.layer = parentLayer;
            this.coverRoot.addChild(artwork);
            artwork.addComponent(UITransform);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        this.coverSprite = artwork.getComponent(Sprite) ?? undefined;

        this.ensureLabel('ScoreLabel');
        let action = this.node.getChildByName('ActionBackground');
        if (!action) {
            action = new Node('ActionBackground');
            action.layer = parentLayer;
            this.node.addChild(action);
            action.addComponent(UITransform);
            action.addComponent(Graphics);
        }
        this.actionBackground = action.getComponent(Graphics) ?? undefined;
        const legacyStatus = this.node.getChildByName('StatusLabel');
        if (legacyStatus) {
            legacyStatus.active = false;
        }
        if (!action.getChildByName('ActionLabel')) {
            const actionLabelNode = new Node('ActionLabel');
            actionLabelNode.layer = parentLayer;
            action.addChild(actionLabelNode);
            actionLabelNode.addComponent(UITransform);
            const actionLabel = actionLabelNode.addComponent(Label);
            actionLabel.fontSize = 24;
            actionLabel.lineHeight = 34;
            actionLabel.color = Color.WHITE;
            actionLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
            actionLabel.verticalAlign = VerticalTextAlignment.CENTER;
            actionLabel.overflow = Label.Overflow.SHRINK;
        }

        let decor = this.node.getChildByName('CardDecor');
        if (!decor) {
            decor = new Node('CardDecor');
            decor.layer = parentLayer;
            this.node.addChild(decor);
            decor.addComponent(UITransform);
            decor.addComponent(Graphics);
        }
        this.decorRoot = decor;
        let badge = decor.getChildByName('GenreBadge');
        if (!badge) {
            badge = new Node('GenreBadge');
            badge.layer = parentLayer;
            decor.addChild(badge);
            badge.addComponent(UITransform);
            const label = badge.addComponent(Label);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.overflow = Label.Overflow.SHRINK;
        }
    }

    private layoutChildren(): void {
        const halfHeight = this.cardHeight / 2;
        const innerWidth = this.cardWidth - 48;
        const coverHeight = Math.min(206, innerWidth * 0.75);
        const coverY = halfHeight - 24 - coverHeight / 2;

        if (this.coverRoot) {
            this.coverRoot.setPosition(0, coverY);
            this.coverRoot.getComponent(UITransform)?.setContentSize(innerWidth, coverHeight);
            const artwork = this.coverRoot.getChildByName('CoverArtwork');
            artwork?.setPosition(0, 0);
            artwork?.getComponent(UITransform)?.setContentSize(
                innerWidth - 8,
                coverHeight - 8,
            );
        }

        this.layoutLabel('NameLabel', -innerWidth / 2, halfHeight - 254, innerWidth, 40);
        this.layoutLabel('DescriptionLabel', -innerWidth / 2, halfHeight - 302, innerWidth, 52);
        this.layoutLabel('ScoreLabel', -innerWidth / 2, halfHeight - 350, innerWidth, 28);
        const action = this.requireActionNode();
        action.setPosition(0, -halfHeight + 53);
        action.getComponent(UITransform)?.setContentSize(innerWidth, 58);
        const actionLabel = action.getChildByName('ActionLabel');
        actionLabel?.setPosition(0, 0);
        actionLabel?.getComponent(UITransform)?.setContentSize(innerWidth, 38);

        if (this.decorRoot) {
            this.decorRoot.setPosition(0, 0);
            this.decorRoot.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
            const badge = this.decorRoot.getChildByName('GenreBadge');
            badge?.setPosition(-innerWidth / 2 + 61, coverY + coverHeight / 2 - 18);
            badge?.getComponent(UITransform)?.setContentSize(122, 28);
            this.drawDecor();
        }
    }

    private layoutLabel(
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        anchorX = 0,
    ): void {
        const label = this.requireLabel(name);
        label.node.setPosition(x, y);
        const transform = label.node.getComponent(UITransform);
        transform?.setContentSize(width, height);
        transform?.setAnchorPoint(anchorX, 0.5);

        if (name === 'NameLabel') {
            label.fontSize = 31;
            label.lineHeight = 38;
            label.color = COLORS.primary;
        } else if (name === 'DescriptionLabel') {
            label.fontSize = 20;
            label.lineHeight = 25;
            label.color = COLORS.secondary;
        } else if (name === 'ScoreLabel') {
            label.fontSize = 18;
            label.lineHeight = 26;
            label.color = COLORS.secondary;
        } else {
            label.fontSize = 24;
            label.lineHeight = 34;
            label.color = Color.WHITE;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
        }
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = name === 'DescriptionLabel';
    }

    private drawCard(): void {
        const graphics = this.cardSurface;
        if (!graphics) {
            return;
        }
        const width = this.cardWidth;
        const height = this.cardHeight;
        graphics.node.getComponent(UITransform)?.setContentSize(width, height);
        graphics.clear();
        graphics.fillColor = COLORS.shadow;
        graphics.roundRect(-width / 2 + 7, -height / 2 - 10, width, height, 24);
        graphics.fill();
        graphics.fillColor = this.mode === 'coming-soon' ? COLORS.mutedSurface : COLORS.surface;
        graphics.strokeColor = COLORS.border;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, 24);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = this.mode === 'coming-soon' ? COLORS.sage : COLORS.coral;
        graphics.roundRect(-width / 2, -height / 2, 10, height, 5);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 135);
        graphics.roundRect(-width / 2 + 14, -height / 2 + 14, width - 28, 170, 18);
        graphics.fill();

        if (this.mode === 'coming-soon') {
            const innerWidth = width - 48;
            const coverHeight = Math.min(206, innerWidth * 0.75);
            const coverY = height / 2 - 24 - coverHeight / 2;
            graphics.fillColor = new Color(195, 220, 202, 255);
            graphics.roundRect(
                -innerWidth / 2,
                coverY - coverHeight / 2,
                innerWidth,
                coverHeight,
                18,
            );
            graphics.fill();
            graphics.strokeColor = new Color(100, 132, 109, 170);
            graphics.lineWidth = 3;
            graphics.circle(0, coverY, 54);
            graphics.stroke();
            graphics.fillColor = new Color(255, 252, 245, 255);
            graphics.roundRect(-44, coverY - 30, 66, 82, 10);
            graphics.fill();
            graphics.fillColor = COLORS.butter;
            graphics.roundRect(-18, coverY - 48, 66, 82, 10);
            graphics.fill();
            graphics.strokeColor = COLORS.primary;
            graphics.lineWidth = 4;
            graphics.moveTo(-3, coverY - 8);
            graphics.lineTo(31, coverY - 8);
            graphics.moveTo(14, coverY - 25);
            graphics.lineTo(14, coverY + 9);
            graphics.stroke();
        }
    }

    private drawCoverFallback(comingSoon: boolean): void {
        const root = this.coverRoot;
        const graphics = root?.getComponent(Graphics);
        const transform = root?.getComponent(UITransform);
        if (!root || !graphics || !transform) {
            return;
        }
        const width = transform.contentSize.width;
        const height = transform.contentSize.height;
        graphics.clear();
        graphics.fillColor = new Color(58, 48, 38, 30);
        graphics.roundRect(-width / 2 + 4, -height / 2 - 6, width, height, 18);
        graphics.fill();
        graphics.fillColor = comingSoon ? new Color(230, 233, 224, 255) : COLORS.paper;
        graphics.strokeColor = COLORS.border;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, 18);
        graphics.fill();
        graphics.stroke();

        if (comingSoon) {
            graphics.strokeColor = new Color(113, 131, 117, 130);
            graphics.lineWidth = 2;
            graphics.circle(0, 0, 56);
            graphics.stroke();
            graphics.fillColor = new Color(255, 252, 245, 255);
            graphics.roundRect(-42, -32, 66, 82, 10);
            graphics.fill();
            graphics.strokeColor = COLORS.sage;
            graphics.roundRect(-42, -32, 66, 82, 10);
            graphics.stroke();
            graphics.fillColor = COLORS.butter;
            graphics.roundRect(-20, -50, 66, 82, 10);
            graphics.fill();
            graphics.strokeColor = COLORS.primary;
            graphics.roundRect(-20, -50, 66, 82, 10);
            graphics.stroke();
            graphics.lineWidth = 4;
            graphics.moveTo(-4, -10);
            graphics.lineTo(26, -10);
            graphics.moveTo(11, -25);
            graphics.lineTo(11, 5);
            graphics.stroke();
            graphics.fillColor = COLORS.brass;
            graphics.circle(66, 44, 5);
            graphics.fill();
            graphics.fillColor = COLORS.coral;
            graphics.circle(-70, -42, 5);
            graphics.fill();
        }
        const artwork = root.getChildByName('CoverArtwork');
        if (artwork) {
            artwork.active = !comingSoon;
        }
    }

    private drawActionBackground(disabled = false): void {
        const action = this.requireActionNode();
        const graphics = this.actionBackground;
        const transform = action.getComponent(UITransform);
        if (!graphics || !transform || this.mode === 'coming-soon') {
            return;
        }
        const width = transform.contentSize.width;
        const height = transform.contentSize.height;
        graphics.clear();
        graphics.fillColor = new Color(58, 48, 38, 34);
        graphics.roundRect(-width / 2 + 3, -height / 2 - 4, width, height, 16);
        graphics.fill();
        graphics.fillColor = disabled ? COLORS.disabled : COLORS.action;
        graphics.roundRect(-width / 2, -height / 2, width, height, 16);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 40);
        graphics.roundRect(-width / 2 + 4, 4, width - 8, height / 2 - 8, 10);
        graphics.fill();
    }

    private drawDecor(): void {
        const graphics = this.decorRoot?.getComponent(Graphics);
        if (!graphics) {
            return;
        }
        const halfWidth = this.cardWidth / 2;
        const halfHeight = this.cardHeight / 2;
        graphics.clear();
        graphics.fillColor = this.mode === 'coming-soon'
            ? new Color(201, 232, 213, 245)
            : new Color(249, 199, 84, 245);
        graphics.roundRect(-halfWidth + 24, halfHeight - 55, 122, 30, 8);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 110);
        graphics.moveTo(halfWidth - 62, halfHeight - 24);
        graphics.lineTo(halfWidth - 24, halfHeight - 24);
        graphics.lineTo(halfWidth - 24, halfHeight - 62);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = new Color(122, 101, 74, 70);
        graphics.lineWidth = 2;
        graphics.moveTo(halfWidth - 62, halfHeight - 24);
        graphics.lineTo(halfWidth - 24, halfHeight - 62);
        graphics.stroke();
        graphics.fillColor = this.mode === 'coming-soon' ? COLORS.brass : COLORS.sage;
        graphics.circle(halfWidth - 28, -halfHeight + 30, 5);
        graphics.fill();
    }

    private configureBadge(text: string): void {
        const label = this.decorRoot?.getChildByName('GenreBadge')?.getComponent(Label);
        if (!label) {
            return;
        }
        label.string = text;
        label.fontSize = 13;
        label.lineHeight = 20;
        label.color = COLORS.primary;
    }

    private loadCover(path: string): void {
        const token = ++this.coverLoadToken;
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) {
            console.error('[GameCardView] Lobby bundle is unavailable.');
            return;
        }
        bundle.load(path, Texture2D, (error: Error | null, texture: Texture2D) => {
            if (token !== this.coverLoadToken || !this.node.isValid) {
                return;
            }
            if (error || !texture) {
                console.warn('[GameCardView] Cover failed to load.', path, error);
                return;
            }
            this.releaseOwnedCoverFrame();
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.ownedCoverFrame = frame;
            if (this.coverSprite) {
                this.coverSprite.spriteFrame = frame;
                this.coverSprite.node.active = true;
                this.startCoverMotion();
            }
        });
    }

    private startCoverMotion(): void {
        const artwork = this.coverSprite?.node;
        if (!artwork) {
            return;
        }
        this.stopCoverMotion();
        artwork.setScale(1, 1, 1);
        tween(artwork)
            .repeatForever(
                tween()
                    .to(2.4, { scale: new Vec3(1.025, 1.025, 1) }, { easing: 'sineInOut' })
                    .to(2.4, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }),
            )
            .start();
    }

    private stopCoverMotion(): void {
        if (this.coverSprite) {
            Tween.stopAllByTarget(this.coverSprite.node);
        }
    }

    private releaseOwnedCoverFrame(): void {
        this.stopCoverMotion();
        if (this.coverSprite) {
            this.coverSprite.spriteFrame = null;
        }
        this.ownedCoverFrame?.destroy();
        this.ownedCoverFrame = undefined;
    }

    private ensureLabel(name: string): Label {
        let node = this.node.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = this.node.layer;
            this.node.addChild(node);
            node.addComponent(UITransform);
            node.addComponent(Label);
        }
        const label = node.getComponent(Label);
        if (!label) {
            throw new Error(`GameCard is missing ${name}.`);
        }
        return label;
    }

    private requireLabel(nodeName: string): Label {
        const child = this.node.getChildByName(nodeName);
        const label = child?.getComponent(Label);
        if (!child || !label) {
            throw new Error(`GameCard is missing ${nodeName}.`);
        }
        return label;
    }

    private requireButton(): Button {
        const button = this.getComponent(Button);
        if (!button) {
            throw new Error('GameCard is missing Button.');
        }
        return button;
    }

    private requireActionNode(): Node {
        const action = this.node.getChildByName('ActionBackground');
        if (!action) {
            throw new Error('GameCard is missing ActionBackground.');
        }
        return action;
    }

    private requireActionLabel(): Label {
        const label = this.requireActionNode().getChildByName('ActionLabel')?.getComponent(Label);
        if (!label) {
            throw new Error('GameCard is missing ActionLabel.');
        }
        return label;
    }

    private applyLayer(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) {
            this.applyLayer(child, layer);
        }
    }

    private readonly handleClick = (): void => {
        if (this.manifest && this.clickHandler && this.requireButton().interactable) {
            this.clickHandler(this.manifest);
        }
    };
}
