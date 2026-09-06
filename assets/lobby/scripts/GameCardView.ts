import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    Label,
    LabelOutline,
    Mask,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    Vec2,
    UITransform,
    Vec3,
    VerticalTextAlignment,
} from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';

const { ccclass } = _decorator;
export type GameCardClickHandler = (manifest: GameManifest) => void;

const CARD_SKIN_PATH = 'visual/ui/lobby-card-frame/texture';
const START_BUTTON_PATH = 'visual/ui/lobby-start-button/texture';

const COLORS = {
    surface: new Color(241, 135, 84, 255),
    mutedSurface: new Color(250, 218, 176, 178),
    border: new Color(255, 255, 255, 196),
    primary: new Color(255, 255, 255, 255),
    secondary: new Color(255, 247, 231, 235),
    action: new Color(205, 79, 47, 255),
    disabled: new Color(215, 185, 157, 255),
    brass: new Color(169, 133, 77, 255),
    sage: new Color(113, 131, 117, 255),
    coral: new Color(238, 133, 103, 255),
    butter: new Color(246, 199, 84, 255),
    paper: new Color(255, 246, 224, 255),
    textShadow: new Color(66, 25, 15, 220),
};

type CardMode = 'game' | 'coming-soon';

/** Lobby collectible card with an animated artwork window and paper details. */
@ccclass('GameCardView')
export class GameCardView extends Component {
    private manifest?: GameManifest;
    private clickHandler?: GameCardClickHandler;
    private mode: CardMode = 'game';
    private cardWidth = 323;
    private cardHeight = 410;
    private coverRoot?: Node;
    private coverSprite?: Sprite;
    private cardSurface?: Graphics;
    private cardSkin?: Sprite;
    private coverFallback?: Graphics;
    private titleOverlay?: Graphics;
    private actionBackground?: Graphics;
    private actionSkin?: Sprite;
    private decorRoot?: Node;
    private ownedCoverFrame?: SpriteFrame;
    private readonly ownedUiFrames: SpriteFrame[] = [];
    private uiLoadToken = 0;
    private coverLoadToken = 0;
    protected onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.handleClick, this);
        this.ensureStructure();
        this.setCardSize(this.cardWidth, this.cardHeight);
        this.loadUiArtwork();
    }

    protected onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.handleClick, this);
        this.stopCoverMotion();
        this.releaseOwnedCoverFrame();
        this.uiLoadToken += 1;
        this.ownedUiFrames.forEach((frame) => frame.destroy());
        this.ownedUiFrames.length = 0;
    }

    bind(
        manifest: GameManifest,
        _highScore: number | undefined,
        clickHandler: GameCardClickHandler,
    ): void {
        this.ensureStructure();
        this.requireLabel('DescriptionLabel').node.active = true;
        this.mode = 'game';
        this.manifest = manifest;
        this.clickHandler = clickHandler;
        this.node.name = `GameCard-${manifest.id}`;
        this.requireLabel('NameLabel').string = manifest.name;
        this.requireLabel('DescriptionLabel').string = manifest.description;
        this.requireLabel('ScoreLabel').string = '';
        this.requireLabel('ScoreLabel').node.active = false;
        this.requireActionLabel().string = '开始游戏';
        this.configureBadge('');
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(false);
        this.setIdle();
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
        this.requireLabel('NameLabel').string = '敬请期待';
        this.requireLabel('DescriptionLabel').string = '';
        this.requireLabel('DescriptionLabel').node.active = false;
        this.requireLabel('ScoreLabel').string = '';
        this.requireLabel('ScoreLabel').node.active = false;
        this.requireActionNode().active = false;
        this.requireButton().interactable = false;
        this.configureBadge('');
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(true);
    }

    setCardSize(width: number, height: number): void {
        this.ensureStructure();
        this.cardWidth = Math.max(240, width);
        this.cardHeight = Math.max(350, height);
        this.node.getComponent(UITransform)?.setContentSize(
            this.cardWidth,
            this.cardHeight,
        );
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(this.mode === 'coming-soon');
        this.requireActionNode().active = this.mode === 'game' && (this.manifest?.enabled ?? false);
        if (this.mode === 'game') {
            this.drawActionBackground(!(this.manifest?.enabled ?? false));
        }
    }

    setLoading(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireActionLabel().string = '正在进入…';
        this.requireButton().interactable = false;
        this.requireActionNode().active = true;
        this.drawActionBackground(true);
    }

    setEnterFailed(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireActionLabel().string = '重试';
        this.requireButton().interactable = true;
        this.requireActionNode().active = true;
        this.drawActionBackground();
    }

    setIdle(): void {
        if (this.mode !== 'game') {
            return;
        }
        const enabled = this.manifest?.enabled ?? false;
        this.requireActionNode().active = enabled;
        this.requireActionLabel().string = enabled ? '开始游戏' : '暂未开放';
        this.requireLabel('ScoreLabel').string = '';
        this.requireLabel('ScoreLabel').node.active = false;
        this.requireButton().interactable = enabled;
        this.drawActionBackground(!enabled);
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
        let cardSkinNode = surface.getChildByName('CardSkin');
        if (!cardSkinNode) {
            cardSkinNode = new Node('CardSkin');
            cardSkinNode.layer = parentLayer;
            surface.addChild(cardSkinNode);
            cardSkinNode.addComponent(UITransform);
            cardSkinNode.addComponent(Sprite);
        }
        this.cardSkin = cardSkinNode.getComponent(Sprite) ?? undefined;
        cardSkinNode.setSiblingIndex(0);
        this.cardSkin.sizeMode = Sprite.SizeMode.CUSTOM;

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

        let coverFallback = this.coverRoot.getChildByName('CoverFallback');
        if (!coverFallback) {
            coverFallback = new Node('CoverFallback');
            coverFallback.layer = parentLayer;
            this.coverRoot.addChild(coverFallback);
            coverFallback.addComponent(UITransform);
            coverFallback.addComponent(Graphics);
        }
        coverFallback.setSiblingIndex(0);
        this.coverFallback = coverFallback.getComponent(Graphics) ?? undefined;

        let coverClip = this.coverRoot.getChildByName('CoverClip');
        if (!coverClip) {
            coverClip = new Node('CoverClip');
            coverClip.layer = parentLayer;
            this.coverRoot.addChild(coverClip);
            coverClip.addComponent(UITransform);
            const mask = coverClip.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
        }

        let artwork = coverClip.getChildByName('CoverArtwork')
            ?? this.coverRoot.getChildByName('CoverArtwork');
        if (!artwork) {
            artwork = new Node('CoverArtwork');
            artwork.layer = parentLayer;
            coverClip.addChild(artwork);
            artwork.addComponent(UITransform);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        } else if (artwork.parent !== coverClip) {
            artwork.setParent(coverClip);
        }
        this.coverSprite = artwork.getComponent(Sprite) ?? undefined;

        let titleOverlay = this.node.getChildByName('TitleOverlay');
        if (!titleOverlay) {
            titleOverlay = new Node('TitleOverlay');
            titleOverlay.layer = parentLayer;
            this.node.addChild(titleOverlay);
            titleOverlay.addComponent(UITransform);
            titleOverlay.addComponent(Graphics);
        }
        const nameLabelIndex = this.node.children.indexOf(this.requireLabel('NameLabel').node);
        titleOverlay.setSiblingIndex(Math.max(1, nameLabelIndex));
        this.titleOverlay = titleOverlay.getComponent(Graphics) ?? undefined;

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
        let actionSkinNode = action.getChildByName('ActionSkin');
        if (!actionSkinNode) {
            actionSkinNode = new Node('ActionSkin');
            actionSkinNode.layer = parentLayer;
            action.addChild(actionSkinNode);
            actionSkinNode.addComponent(UITransform);
            actionSkinNode.addComponent(Sprite);
        }
        this.actionSkin = actionSkinNode.getComponent(Sprite) ?? undefined;
        actionSkinNode.setSiblingIndex(0);
        this.actionSkin.sizeMode = Sprite.SizeMode.CUSTOM;
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
        const actionLabel = action.getChildByName('ActionLabel')?.getComponent(Label);
        if (actionLabel) {
            this.configurePlainText(actionLabel);
            actionLabel.node.active = false;
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
        const skinScale = this.cardWidth / 320;
        const innerWidth = this.cardWidth - 34 * skinScale;
        const coverHeight = this.mode === 'coming-soon'
            ? 180 * skinScale
            : 180 * skinScale;
        const coverTopInset = 20 * skinScale;
        const coverY = halfHeight - coverTopInset - coverHeight / 2;
        const coverVisualY = coverY + 5 * skinScale;

        if (this.coverRoot) {
            this.coverRoot.setPosition(0, coverVisualY);
            this.coverRoot.getComponent(UITransform)?.setContentSize(innerWidth, coverHeight);
            this.coverFallback?.node.setPosition(0, 0);
            this.coverFallback?.node.getComponent(UITransform)?.setContentSize(innerWidth, coverHeight);
            const coverClip = this.coverRoot.getChildByName('CoverClip');
            coverClip?.setPosition(0, 0);
            coverClip?.getComponent(UITransform)?.setContentSize(
                innerWidth,
                coverHeight,
            );
            const maskGraphics = coverClip?.getComponent(Graphics);
            maskGraphics?.clear();
            if (maskGraphics) {
                maskGraphics.roundRect(
                    -innerWidth / 2,
                    -coverHeight / 2,
                    innerWidth,
                    coverHeight,
                    20 * skinScale,
                );
                maskGraphics.fill();
            }
            const artwork = this.coverSprite?.node;
            artwork?.setPosition(0, 0);
            this.layoutCoverArtwork(innerWidth, coverHeight);
        }

        // Keep the three text/action groups on one deliberate rhythm below
        // the artwork slot: equal cover/title and title/description gaps,
        // followed by a slightly larger gap before the action button.
        const coverBottom = coverY - coverHeight / 2;
        const commonGap = 4 * skinScale;
        const actionGap = 12 * skinScale;
        const titleHeight = 44 * skinScale;
        const descriptionHeight = 30 * skinScale;
        const actionWidth = 180 * skinScale;
        const actionHeight = actionWidth * 99 / 320;
        const nameY = coverBottom - commonGap - titleHeight / 2;
        const descriptionY = nameY - titleHeight / 2 - commonGap - descriptionHeight / 2;
        const actionY = descriptionY - descriptionHeight / 2 - actionGap - actionHeight / 2;
        this.layoutLabel('NameLabel', 0, nameY, innerWidth - 24, 44, 0.5);
        this.layoutLabel('DescriptionLabel', 0, descriptionY, innerWidth - 32, 30, 0.5);
        const action = this.requireActionNode();
        action.setPosition(0, actionY);
        action.getComponent(UITransform)?.setContentSize(actionWidth, actionHeight);
        this.actionSkin?.node.setPosition(0, 0);
        this.actionSkin?.node.getComponent(UITransform)?.setContentSize(actionWidth, actionHeight);
        const actionLabel = action.getChildByName('ActionLabel');
        actionLabel?.setPosition(0, 0);
        actionLabel?.getComponent(UITransform)?.setContentSize(actionWidth, 40 * skinScale);

        if (this.decorRoot) {
            this.decorRoot.setPosition(0, 0);
            this.decorRoot.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
            const badge = this.decorRoot.getChildByName('GenreBadge');
            badge?.setPosition(innerWidth / 2 - 30, coverVisualY + coverHeight / 2 - 28);
            badge?.getComponent(UITransform)?.setContentSize(30, 30);
            this.drawDecor();
        }
        this.drawTitleOverlay();
        this.raiseCardContent();
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
            label.fontSize = Math.round((this.mode === 'coming-soon' ? 33 : 36) * this.cardWidth / 320);
            label.lineHeight = Math.round(44 * this.cardWidth / 320);
            // Give the Chinese game titles a little more breathing room while
            // keeping the spacing proportional to the card scale.
            label.spacingX = Math.round(4 * this.cardWidth / 320);
            label.color = new Color(91, 42, 24, 255);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.isBold = true;
        } else if (name === 'DescriptionLabel') {
            label.fontSize = Math.round(19 * this.cardWidth / 320);
            label.lineHeight = Math.round(24 * this.cardWidth / 320);
            label.spacingX = 0;
            label.color = new Color(112, 55, 34, 255);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
        } else if (name === 'ScoreLabel') {
            label.fontSize = 17;
            label.lineHeight = 24;
            label.spacingX = 0;
            label.color = Color.WHITE;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
        } else {
            label.fontSize = 24;
            label.lineHeight = 34;
            label.spacingX = 0;
            label.color = Color.WHITE;
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
        }
        this.configurePlainText(label);
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
    }

    private configurePlainText(label: Label): void {
        label.enableShadow = false;
        const outline = label.node.getComponent(LabelOutline);
        if (outline) {
            outline.enabled = false;
        }
    }

    private configureTextShadow(label: Label): void {
        label.enableShadow = true;
        label.shadowColor = COLORS.textShadow;
        label.shadowOffset = new Vec2(2, -3);
        label.shadowBlur = 1;
        const outline = label.node.getComponent(LabelOutline);
        if (outline) {
            outline.enabled = false;
        }
    }

    private raiseCardContent(): void {
        const moveToTop = (node: Node | undefined): void => {
            if (node?.isValid) {
                node.setSiblingIndex(this.node.children.length - 1);
            }
        };
        moveToTop(this.titleOverlay?.node);
        moveToTop(this.decorRoot);
        moveToTop(this.node.getChildByName('NameLabel') ?? undefined);
        moveToTop(this.requireActionNode());
    }

    private drawCard(): void {
        const graphics = this.cardSurface;
        if (!graphics) {
            return;
        }
        const width = this.cardWidth;
        const height = this.cardHeight;
        graphics.node.getComponent(UITransform)?.setContentSize(width, height);
        this.cardSkin?.node.setPosition(0, 0);
        this.cardSkin?.node.getComponent(UITransform)?.setContentSize(width, height);
        graphics.clear();
        if (this.cardSkin?.spriteFrame) {
            this.cardSkin.color = this.mode === 'game'
                ? Color.WHITE
                : new Color(255, 255, 255, 205);
            return;
        }
        if (this.mode === 'game') {
            graphics.fillColor = COLORS.surface;
            graphics.strokeColor = new Color(211, 77, 47, 255);
            graphics.lineWidth = 2;
            graphics.roundRect(-width / 2, -height / 2, width, height, 25);
            graphics.fill();
            graphics.stroke();
        } else {
            graphics.fillColor = COLORS.mutedSurface;
            graphics.roundRect(-width / 2, -height / 2, width, height, 24);
            graphics.fill();
            graphics.strokeColor = new Color(255, 255, 255, 92);
            graphics.lineWidth = 2;
            graphics.roundRect(-width / 2, -height / 2, width, height, 24);
            graphics.stroke();
        }
    }

    private layoutCoverArtwork(viewportWidth: number, viewportHeight: number): void {
        const artwork = this.coverSprite?.node;
        if (!artwork) {
            return;
        }
        const texture = this.ownedCoverFrame?.texture;
        const sourceWidth = texture?.width ?? viewportWidth;
        const sourceHeight = texture?.height ?? viewportHeight;
        const scale = Math.max(
            viewportWidth / Math.max(1, sourceWidth),
            viewportHeight / Math.max(1, sourceHeight),
        );
        artwork.getComponent(UITransform)?.setContentSize(
            sourceWidth * scale,
            sourceHeight * scale,
        );
    }

    private drawCoverFallback(comingSoon: boolean): void {
        const root = this.coverRoot;
        const graphics = this.coverFallback;
        const transform = root?.getComponent(UITransform);
        if (!root || !graphics || !transform) {
            return;
        }
        const width = transform.contentSize.width;
        const height = transform.contentSize.height;
        graphics.clear();
        if (!comingSoon) {
            graphics.fillColor = COLORS.paper;
            graphics.roundRect(-width / 2, -height / 2, width, height, 24);
            graphics.fill();
        }

        const artwork = this.coverSprite?.node;
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
        if (this.actionSkin?.spriteFrame) {
            this.actionSkin.color = disabled
                ? new Color(190, 190, 190, 255)
                : Color.WHITE;
            return;
        }
        graphics.fillColor = disabled
            ? new Color(170, 139, 112, 72)
            : new Color(145, 50, 25, 82);
        graphics.roundRect(-width / 2 + 1, -height / 2 - 4, width - 2, height, 24);
        graphics.fill();
        graphics.fillColor = disabled ? COLORS.disabled : new Color(255, 238, 207, 255);
        graphics.strokeColor = disabled ? COLORS.disabled : new Color(250, 253, 255, 255);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -height / 2, width, height, 24);
        graphics.fill();
        graphics.stroke();
        if (!disabled) {
            graphics.fillColor = new Color(255, 255, 255, 112);
            graphics.roundRect(-width / 2 + 8, 5, width - 16, 14, 7);
            graphics.fill();
        }
        const label = this.requireActionLabel();
        label.color = disabled ? COLORS.secondary : COLORS.action;
    }

    private drawDecor(): void {
        const graphics = this.decorRoot?.getComponent(Graphics);
        if (!graphics) {
            return;
        }
        graphics.clear();
        if (this.mode === 'coming-soon') {
            graphics.fillColor = new Color(255, 248, 230, 236);
            graphics.strokeColor = new Color(255, 255, 255, 238);
            graphics.lineWidth = 3;
            graphics.roundRect(-92, 8, 184, 100, 40);
            graphics.fill();
            graphics.stroke();
            graphics.strokeColor = new Color(231, 131, 75, 235);
            graphics.lineWidth = 9;
            graphics.moveTo(-58, 58);
            graphics.lineTo(-26, 58);
            graphics.moveTo(-42, 42);
            graphics.lineTo(-42, 74);
            graphics.stroke();
            graphics.fillColor = new Color(231, 131, 75, 235);
            graphics.circle(37, 68, 10);
            graphics.fill();
            graphics.fillColor = new Color(244, 176, 93, 235);
            graphics.circle(62, 44, 10);
            graphics.fill();
        }
    }

    private drawTitleOverlay(): void {
        const graphics = this.titleOverlay;
        if (!graphics) {
            return;
        }
        graphics.node.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
        graphics.clear();
    }

    private configureBadge(text: string): void {
        const label = this.decorRoot?.getChildByName('GenreBadge')?.getComponent(Label);
        if (!label) {
            return;
        }
        label.string = text;
        label.fontSize = 16;
        label.lineHeight = 20;
        label.color = Color.WHITE;
        this.configureTextShadow(label);
    }

    private loadCover(path: string): void {
        const token = ++this.coverLoadToken;
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) {
            console.error('[GameCardView] Lobby bundle is unavailable.');
            return;
        }
        bundle.load(path, Texture2D, (error: Error | null, texture: Texture2D) => {
            if (token !== this.coverLoadToken || !this.node?.isValid) {
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
                if (this.mode === 'coming-soon') {
                    this.coverFallback?.clear();
                }
                this.coverSprite.spriteFrame = frame;
                this.coverSprite.node.active = true;
                const viewport = this.coverRoot?.getComponent(UITransform)?.contentSize;
                if (viewport) {
                    this.layoutCoverArtwork(viewport.width, viewport.height);
                }
                this.startCoverMotion();
            }
        });
    }

    private loadUiArtwork(): void {
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) return;
        const token = ++this.uiLoadToken;
        const load = (path: string, sprite: Sprite | undefined, onLoaded: () => void): void => {
            if (!sprite) return;
            bundle.load(path, Texture2D, (error: Error | null, texture: Texture2D) => {
                if (error || !texture || token !== this.uiLoadToken || !this.node.isValid) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.ownedUiFrames.push(frame);
                sprite.spriteFrame = frame;
                onLoaded();
            });
        };
        load(CARD_SKIN_PATH, this.cardSkin, () => this.drawCard());
        load(START_BUTTON_PATH, this.actionSkin, () => this.drawActionBackground());
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
