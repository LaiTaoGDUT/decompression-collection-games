import { setLabelBold } from '../../services/font/FontBinding';
import {
    _decorator,
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
    tween,
    Tween,
    Vec2,
    UITransform,
    Vec3,
    VerticalTextAlignment,
} from 'cc';
import type { GameManifest } from '../../runtime/GameManifest';
import type { AssetService } from '../../services/asset/AssetService';
import type { LobbyGameBadge } from './LobbyGameList';
import {
    calculateLobbyCardRows,
    LOBBY_CARD_LAYOUT as CARD_LAYOUT,
} from './LobbyCardLayout';

const { ccclass } = _decorator;
export type GameCardClickHandler = (manifest: GameManifest) => void;
export interface GameCardSize {
    readonly width: number;
    readonly height: number;
}

const CARD_SKIN_PATH = 'visual/ui/lobby-card-frame/texture';
const RECENT_BADGE_PATH = 'visual/ui/lobby-recently-played-v2/texture';
const HOT_BADGE_PATH = 'visual/ui/lobby-hot-v1/texture';
const NEW_BADGE_PATH = 'visual/ui/lobby-new-v1/texture';
const START_BUTTON_PATH = 'visual/ui/lobby-start-button/texture';
/**
 * 卡片底板九宫格边距（纹理像素）：上下保留圆角与底部厚边，只拉伸中段，
 * 卡片变高时圆角和厚边不变形。
 */
const CARD_SKIN_INSETS = { left: 64, right: 64, top: 64, bottom: 72 } as const;
/**
 * “最近游玩”贴纸：设计宽度、倾角（度，负值为顺时针）与探出卡片边缘的距离
 * （320 设计单位）。右侧紧邻 12 单位的网格间隙，横向只轻微探出。
 */
const RECENT_BADGE = { width: 160, angle: -8, overhangX: 4, overhangY: 8 } as const;
/** HOT／NEW 缩小并向卡片右上角内收，保留少量纸边探出和斜贴效果。 */
const PROMOTION_BADGE = { width: 100, angle: -14, overhangX: 8, overhangY: 18 } as const;

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
    actionText: new Color(255, 255, 255, 255),
    actionTextShadow: new Color(176, 42, 22, 235),
    actionDisabledTint: new Color(236, 228, 220, 255),
    actionDisabledShadow: new Color(112, 104, 98, 200),
    actionBusyTint: new Color(255, 226, 214, 255),
};

type CardMode = 'game' | 'coming-soon';
/** ready: 可点击；busy: 正在进入，保持品牌色但不可点击；disabled: 暂未开放。 */
type ActionState = 'ready' | 'busy' | 'disabled';

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
    private coverBorder?: Graphics;
    private titleOverlay?: Graphics;
    private actionBackground?: Graphics;
    private actionSkin?: Sprite;
    private decorRoot?: Node;
    private badgeRoot?: Node;
    private recentBadge?: Sprite;
    private hotBadge?: Sprite;
    private newBadge?: Sprite;
    private badge?: LobbyGameBadge;
    private actionState: ActionState = 'ready';
    private assets?: AssetService;
    private ownedCoverFrame?: SpriteFrame;
    private readonly ownedUiFrames: SpriteFrame[] = [];
    private uiLoadToken = 0;
    private coverLoadToken = 0;
    private structureReady = false;
    private configured = false;
    private uiArtworkReady: Promise<void> = Promise.resolve();
    private coverArtworkReady: Promise<void> = Promise.resolve();

    get artworkReady(): Promise<void> {
        return Promise.all([this.uiArtworkReady, this.coverArtworkReady]).then(() => {});
    }

    protected onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.handleClick, this);
        this.node.on(Node.EventType.TRANSFORM_CHANGED, this.syncBadgeTransform, this);
        // 大厅先在未激活节点上完成绑定和最终尺寸配置；激活时只接通生命周期。
        if (!this.configured) this.setCardSize(this.cardWidth, this.cardHeight);
        this.loadUiArtwork();
    }

    protected onEnable(): void {
        this.syncBadgeTransform();
    }

    protected onDisable(): void {
        if (this.badgeRoot?.isValid) this.badgeRoot.active = false;
    }

    protected onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.handleClick, this);
        this.node.off(Node.EventType.TRANSFORM_CHANGED, this.syncBadgeTransform, this);
        this.stopCoverMotion();
        this.releaseOwnedCoverFrame();
        this.uiLoadToken += 1;
        for (const sprite of [this.cardSkin, this.actionSkin, this.recentBadge, this.hotBadge, this.newBadge]) {
            if (sprite) sprite.spriteFrame = null;
        }
        this.ownedUiFrames.forEach((frame) => this.assets?.releaseRuntimeAsset(frame));
        this.ownedUiFrames.length = 0;
        if (this.badgeRoot?.isValid) this.badgeRoot.destroy();
        this.badgeRoot = undefined;
        this.assets = undefined;
    }

    setAssetService(assets: AssetService | undefined): void {
        this.assets = assets;
    }

    bind(
        manifest: GameManifest,
        _highScore: number | undefined,
        clickHandler: GameCardClickHandler,
        badge?: LobbyGameBadge,
        size?: GameCardSize,
    ): void {
        if (size) this.applyCardSize(size.width, size.height);
        this.ensureStructure();
        this.requireLabel('DescriptionLabel').node.active = true;
        this.mode = 'game';
        this.manifest = manifest;
        this.badge = badge;
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
        this.configured = true;
        this.loadUiArtwork();
        this.loadCover(manifest.cover);
    }

    bindComingSoon(size?: GameCardSize): void {
        if (size) this.applyCardSize(size.width, size.height);
        this.ensureStructure();
        this.mode = 'coming-soon';
        this.badge = undefined;
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
        this.configured = true;
        this.loadUiArtwork();
    }

    setCardSize(width: number, height: number): void {
        if (this.configured && this.cardWidth === Math.max(240, width)
            && this.cardHeight === Math.max(1, height)) return;
        this.applyCardSize(width, height);
        this.ensureStructure();
        this.layoutChildren();
        this.drawCard();
        this.drawCoverFallback(this.mode === 'coming-soon');
        this.requireActionNode().active = this.mode === 'game';
        if (this.mode === 'game') {
            this.drawActionBackground(this.actionState);
        }
    }

    private applyCardSize(width: number, height: number): void {
        this.cardWidth = Math.max(240, width);
        this.cardHeight = Math.max(1, height);
        this.node.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
    }

    setBadge(badge: LobbyGameBadge | undefined): void {
        this.badge = badge;
        this.layoutBadges();
    }

    /** 列表内的贴纸前景层与卡片共用坐标系，所有贴纸在卡片之后绘制。 */
    setBadgeLayer(layer: Node): void {
        const root = this.badgeRoot;
        if (!root?.isValid) return;
        if (root.parent !== layer) root.setParent(layer);
        root.name = `${this.node.name}-Badges`;
        this.applyLayer(root, layer.layer);
        this.syncBadgeTransform();
    }

    private syncBadgeTransform(): void {
        const root = this.badgeRoot;
        if (!root?.isValid) return;
        root.active = this.enabledInHierarchy;
        if (root.parent === this.decorRoot) return;
        root.setPosition(this.node.position);
        root.setRotation(this.node.rotation);
        root.setScale(this.node.scale);
    }

    setLoading(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireActionLabel().string = '正在进入…';
        this.requireButton().interactable = false;
        this.requireActionNode().active = true;
        this.drawActionBackground('busy');
    }

    setEnterFailed(): void {
        if (this.mode !== 'game') {
            return;
        }
        this.requireActionLabel().string = '重试';
        this.requireButton().interactable = true;
        this.requireActionNode().active = true;
        this.drawActionBackground('ready');
    }

    setIdle(): void {
        if (this.mode !== 'game') {
            return;
        }
        const enabled = this.manifest?.enabled ?? false;
        this.requireActionNode().active = true;
        this.requireActionLabel().string = enabled ? '开始游戏' : '暂未开放';
        this.requireLabel('ScoreLabel').string = '';
        this.requireLabel('ScoreLabel').node.active = false;
        this.requireButton().interactable = enabled;
        this.drawActionBackground(enabled ? 'ready' : 'disabled');
    }

    private ensureStructure(): void {
        if (this.structureReady) return;
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
        let border = this.coverRoot.getChildByName('CoverBorder');
        if (!border) {
            border = new Node('CoverBorder');
            border.layer = parentLayer;
            this.coverRoot.addChild(border);
            border.addComponent(UITransform);
            border.addComponent(Graphics);
        }
        border.setSiblingIndex(this.coverRoot.children.length - 1);
        this.coverBorder = border.getComponent(Graphics) ?? undefined;

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
        // The button art is text-free; the label carries every state
        // (开始游戏 / 正在进入… / 重试 / 暂未开放) above the skin.
        const actionLabel = action.getChildByName('ActionLabel')?.getComponent(Label);
        if (actionLabel) {
            actionLabel.node.active = true;
            actionLabel.node.setSiblingIndex(action.children.length - 1);
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
        let badgeRoot = this.badgeRoot;
        if (!badgeRoot?.isValid) {
            badgeRoot = new Node('CardBadges');
            badgeRoot.layer = parentLayer;
            decor.addChild(badgeRoot);
            badgeRoot.addComponent(UITransform);
            this.badgeRoot = badgeRoot;
        }
        let recentBadge = badgeRoot.getChildByName('RecentlyPlayedBadge')
            ?? decor.getChildByName('RecentlyPlayedBadge');
        if (!recentBadge) {
            recentBadge = new Node('RecentlyPlayedBadge');
            recentBadge.layer = parentLayer;
            badgeRoot.addChild(recentBadge);
            recentBadge.addComponent(UITransform);
            recentBadge.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
        }
        if (recentBadge.parent !== badgeRoot) recentBadge.setParent(badgeRoot);
        this.recentBadge = recentBadge.getComponent(Sprite) ?? undefined;
        const ensurePromotionBadge = (name: string): Sprite => {
            let node = badgeRoot.getChildByName(name) ?? decor.getChildByName(name);
            if (!node) {
                node = new Node(name);
                node.layer = parentLayer;
                badgeRoot.addChild(node);
                node.addComponent(UITransform);
                node.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
            }
            if (node.parent !== badgeRoot) node.setParent(badgeRoot);
            return node.getComponent(Sprite)!;
        };
        this.hotBadge = ensurePromotionBadge('HotBadge');
        this.newBadge = ensurePromotionBadge('NewBadge');
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
        this.structureReady = true;
    }

    private layoutChildren(): void {
        const rows = calculateLobbyCardRows(this.cardWidth, this.cardHeight);
        const skinScale = rows.scale;
        const innerWidth = rows.coverWidth;
        const coverWidth = rows.coverWidth;
        const coverHeight = rows.coverHeight;
        const coverY = rows.coverY;

        if (this.coverRoot) {
            this.coverRoot.setPosition(0, coverY);
            this.coverRoot.getComponent(UITransform)?.setContentSize(coverWidth, coverHeight);
            this.coverFallback?.node.setPosition(0, 0);
            this.coverFallback?.node.getComponent(UITransform)?.setContentSize(coverWidth, coverHeight);
            const coverClip = this.coverRoot.getChildByName('CoverClip');
            coverClip?.setPosition(0, 0);
            coverClip?.getComponent(UITransform)?.setContentSize(
                coverWidth,
                coverHeight,
            );
            const maskGraphics = coverClip?.getComponent(Graphics);
            maskGraphics?.clear();
            if (maskGraphics) {
                maskGraphics.roundRect(
                    -coverWidth / 2,
                    -coverHeight / 2,
                    coverWidth,
                    coverHeight,
                    CARD_LAYOUT.coverRadius * skinScale,
                );
                maskGraphics.fill();
            }
            const artwork = this.coverSprite?.node;
            artwork?.setPosition(0, 0);
            this.layoutCoverArtwork(coverWidth, coverHeight);
        }

        const titleHeight = CARD_LAYOUT.titleHeight * skinScale;
        const descriptionHeight = CARD_LAYOUT.descriptionHeight * skinScale;
        const actionWidth = rows.actionWidth;
        const actionHeight = rows.actionHeight;
        const actionY = rows.actionY;
        // The coming-soon card has no description or action: centre its title
        // in the whole area under the cover slot.
        const nameY = this.mode === 'game'
            ? rows.titleY
            : (coverY - coverHeight / 2 - this.cardHeight / 2 + CARD_LAYOUT.bottomInset * skinScale) / 2;
        this.layoutLabel('NameLabel', 0, nameY, innerWidth - 12 * skinScale, titleHeight, 0.5);
        this.layoutLabel(
            'DescriptionLabel',
            0,
            rows.descriptionY,
            innerWidth - 12 * skinScale,
            descriptionHeight,
            0.5,
        );
        const action = this.requireActionNode();
        action.setPosition(0, actionY);
        action.getComponent(UITransform)?.setContentSize(actionWidth, actionHeight);
        this.actionSkin?.node.setPosition(0, 0);
        this.actionSkin?.node.getComponent(UITransform)?.setContentSize(actionWidth, actionHeight);
        const actionLabel = this.requireActionLabel();
        // The skin's glossy face sits slightly above its bottom lip; centre
        // the text on the face rather than on the whole sprite.
        actionLabel.node.setPosition(0, actionHeight * 0.02);
        actionLabel.node.getComponent(UITransform)?.setContentSize(
            actionWidth - 36 * skinScale,
            actionHeight * 0.7,
        );
        actionLabel.fontSize = Math.round(CARD_LAYOUT.actionFontSize * skinScale);
        actionLabel.lineHeight = Math.round(CARD_LAYOUT.actionFontSize * 1.25 * skinScale);
        actionLabel.spacingX = Math.round(2 * skinScale);
        actionLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        actionLabel.verticalAlign = VerticalTextAlignment.CENTER;
        actionLabel.overflow = Label.Overflow.SHRINK;
        actionLabel.enableWrapText = false;
        setLabelBold(actionLabel, true);
        this.styleActionLabel(this.actionState);

        if (this.decorRoot) {
            this.decorRoot.setPosition(0, 0);
            this.decorRoot.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
            const badge = this.decorRoot.getChildByName('GenreBadge');
            badge?.setPosition(innerWidth / 2 - 30, coverY + coverHeight / 2 - 28);
            badge?.getComponent(UITransform)?.setContentSize(30, 30);
            this.drawDecor();
        }
        this.layoutBadges();
        this.drawTitleOverlay();
        this.raiseCardContent();
    }

    /**
     * “最近游玩”贴纸斜贴在卡片右上角：略微探出卡片边缘并顺时针倾斜，
     * 像随手贴上的标签，同时尽量少遮挡封面主体。最近游玩的卡片总在网格
     * 首位（左列首行），上方是品牌区留白；右侧只探入网格间隙，不压相邻卡片。
     */
    private layoutBadges(): void {
        this.badgeRoot?.getComponent(UITransform)?.setContentSize(this.cardWidth, this.cardHeight);
        this.syncBadgeTransform();
        this.layoutRecentBadge();
        this.layoutPromotionBadge('hot', this.hotBadge);
        this.layoutPromotionBadge('new', this.newBadge);
    }

    private layoutRecentBadge(): void {
        const badge = this.recentBadge;
        if (!badge) return;
        badge.node.active = this.mode === 'game' && this.badge === 'recent';
        if (!badge.node.active) return;
        const scale = this.cardWidth / CARD_LAYOUT.designWidth;
        const texture = badge.spriteFrame?.texture;
        const width = RECENT_BADGE.width * scale;
        const height = width * (texture ? texture.height / texture.width : 0.4);
        // Preserve the illustrated sticker's baked-in lettering, cream outline
        // and shadow at the original aspect ratio.
        badge.node.getComponent(UITransform)?.setContentSize(width, height);
        badge.node.angle = RECENT_BADGE.angle;
        badge.node.setPosition(
            this.cardWidth / 2 - width / 2 + RECENT_BADGE.overhangX * scale,
            this.cardHeight / 2 - height / 2 + RECENT_BADGE.overhangY * scale,
        );
    }

    /** HOT／NEW 随卡片等比缩放，向右上角内收并保留随手斜贴的效果。 */
    private layoutPromotionBadge(tag: 'hot' | 'new', sprite: Sprite | undefined): void {
        if (!sprite) return;
        const node = sprite.node;
        node.active = this.mode === 'game' && this.badge === tag;
        if (!node.active) return;
        const scale = this.cardWidth / CARD_LAYOUT.designWidth;
        const width = PROMOTION_BADGE.width * scale;
        const texture = sprite.spriteFrame?.texture;
        const height = width * (texture ? texture.height / texture.width : 1);
        node.getComponent(UITransform)?.setContentSize(width, height);
        node.angle = PROMOTION_BADGE.angle;
        node.setPosition(
            this.cardWidth / 2 - width / 2 + PROMOTION_BADGE.overhangX * scale,
            this.cardHeight / 2 - height / 2 + PROMOTION_BADGE.overhangY * scale,
        );
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
            label.fontSize = Math.round(CARD_LAYOUT.titleFontSize * this.cardWidth / CARD_LAYOUT.designWidth);
            label.lineHeight = Math.round(CARD_LAYOUT.titleHeight * this.cardWidth / CARD_LAYOUT.designWidth);
            // Give the Chinese game titles a little more breathing room while
            // keeping the spacing proportional to the card scale.
            label.spacingX = Math.round(4 * this.cardWidth / 320);
            label.color = new Color(91, 42, 24, 255);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            setLabelBold(label, true);
        } else if (name === 'DescriptionLabel') {
            label.fontSize = Math.round(CARD_LAYOUT.descriptionFontSize * this.cardWidth / CARD_LAYOUT.designWidth);
            label.lineHeight = Math.round(CARD_LAYOUT.descriptionHeight * this.cardWidth / CARD_LAYOUT.designWidth);
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
        this.layoutCardSkin(width, height);
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

    /**
     * 九宫格边框按纹理像素绘制；底板是 2 倍图，因此以纹理分辨率排布节点后
     * 再整体缩回卡片尺寸，让圆角与厚边保持原始比例，只拉伸中段。
     */
    private layoutCardSkin(width: number, height: number): void {
        const skin = this.cardSkin;
        if (!skin) return;
        const textureWidth = skin.spriteFrame?.texture.width ?? 0;
        const resolution = textureWidth > 0 ? textureWidth / Math.max(1, width) : 1;
        skin.node.setPosition(0, 0);
        skin.node.getComponent(UITransform)?.setContentSize(width * resolution, height * resolution);
        skin.node.setScale(1 / resolution, 1 / resolution, 1);
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
        const scale = this.cardWidth / CARD_LAYOUT.designWidth;
        const radius = CARD_LAYOUT.coverRadius * scale;
        graphics.clear();
        const border = this.coverBorder;
        border?.clear();
        border?.node.getComponent(UITransform)?.setContentSize(width, height);
        if (!comingSoon) {
            // Shadow stays behind the clipped artwork; the fine rim sits above it.
            for (const [offset, alpha] of [[4, 16], [2, 24]]) {
                graphics.fillColor = new Color(102, 61, 31, alpha);
                graphics.roundRect(-width / 2, -height / 2 - offset * scale,
                    width, height, radius);
                graphics.fill();
            }
            graphics.fillColor = COLORS.paper;
            graphics.roundRect(-width / 2, -height / 2, width, height, radius);
            graphics.fill();
            if (border) {
                const lineWidth = 1.5 * scale;
                border.lineWidth = lineWidth;
                border.strokeColor = new Color(173, 114, 65, 160);
                border.roundRect(-width / 2 + lineWidth / 2, -height / 2 + lineWidth / 2,
                    width - lineWidth, height - lineWidth, radius - lineWidth / 2);
                border.stroke();
            }
        }

        const artwork = this.coverSprite?.node;
        if (artwork) {
            artwork.active = !comingSoon;
        }
    }

    private drawActionBackground(state: ActionState): void {
        this.actionState = state;
        const action = this.requireActionNode();
        const graphics = this.actionBackground;
        const transform = action.getComponent(UITransform);
        if (!graphics || !transform || this.mode === 'coming-soon') {
            return;
        }
        const width = transform.contentSize.width;
        const height = transform.contentSize.height;
        const disabled = state === 'disabled';
        graphics.clear();
        this.styleActionLabel(state);
        if (this.actionSkin?.spriteFrame) {
            // Tinting cannot desaturate the coral art, so the unavailable
            // state uses the sprite's grayscale mode instead.
            this.actionSkin.grayscale = disabled;
            this.actionSkin.color = disabled
                ? COLORS.actionDisabledTint
                : state === 'busy'
                    ? COLORS.actionBusyTint
                    : Color.WHITE;
            return;
        }
        const radius = height / 2;
        graphics.fillColor = disabled
            ? new Color(150, 140, 132, 150)
            : new Color(160, 40, 20, 170);
        graphics.roundRect(-width / 2, -height / 2 - 4, width, height, radius);
        graphics.fill();
        graphics.fillColor = disabled ? COLORS.disabled : COLORS.action;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, disabled ? 40 : 70);
        graphics.roundRect(-width / 2 + radius / 2, height * 0.08,
            width - radius, height * 0.3, height * 0.15);
        graphics.fill();
    }

    private styleActionLabel(state: ActionState): void {
        const label = this.requireActionLabel();
        const disabled = state === 'disabled';
        label.color = disabled ? new Color(255, 255, 255, 235) : COLORS.actionText;
        label.enableShadow = true;
        label.shadowColor = disabled ? COLORS.actionDisabledShadow : COLORS.actionTextShadow;
        const offset = Math.max(1, Math.round(2 * this.cardWidth / 320));
        label.shadowOffset = new Vec2(0, -offset);
        label.shadowBlur = 1;
        const outline = label.node.getComponent(LabelOutline);
        if (outline) {
            outline.enabled = false;
        }
    }

    private drawDecor(): void {
        const graphics = this.decorRoot?.getComponent(Graphics);
        const cover = this.coverRoot;
        const coverSize = cover?.getComponent(UITransform)?.contentSize;
        if (!graphics || !cover || !coverSize) {
            return;
        }
        graphics.clear();
        if (this.mode !== 'coming-soon') {
            return;
        }
        // An empty cover slot with a small game-pad glyph, occupying exactly
        // the space a real cover would so the grid rhythm stays intact.
        const scale = this.cardWidth / CARD_LAYOUT.designWidth;
        const { width, height } = coverSize;
        const cx = cover.position.x;
        const cy = cover.position.y;
        const radius = CARD_LAYOUT.coverRadius * scale;
        graphics.fillColor = new Color(250, 228, 196, 150);
        graphics.strokeColor = new Color(226, 170, 112, 150);
        graphics.lineWidth = 2 * scale;
        graphics.roundRect(cx - width / 2, cy - height / 2, width, height, radius);
        graphics.fill();
        graphics.stroke();

        const pad = 46 * scale;
        graphics.fillColor = new Color(255, 248, 232, 245);
        graphics.strokeColor = new Color(236, 176, 112, 200);
        graphics.lineWidth = 3 * scale;
        graphics.roundRect(cx - pad * 2, cy - pad, pad * 4, pad * 2, pad);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(231, 131, 75, 235);
        graphics.lineWidth = 9 * scale;
        graphics.moveTo(cx - 58 * scale, cy);
        graphics.lineTo(cx - 26 * scale, cy);
        graphics.moveTo(cx - 42 * scale, cy - 16 * scale);
        graphics.lineTo(cx - 42 * scale, cy + 16 * scale);
        graphics.stroke();
        graphics.fillColor = new Color(231, 131, 75, 235);
        graphics.circle(cx + 37 * scale, cy - 8 * scale, 10 * scale);
        graphics.fill();
        graphics.fillColor = new Color(244, 176, 93, 235);
        graphics.circle(cx + 60 * scale, cy + 12 * scale, 10 * scale);
        graphics.fill();
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
        const assets = this.assets;
        if (!assets) return;
        this.coverArtworkReady = assets.loadSpriteFrame('lobby-covers', path, 'texture').then((frame) => {
            if (token !== this.coverLoadToken || !this.node?.isValid) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            this.releaseOwnedCoverFrame();
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
        void this.coverArtworkReady.catch(() => {});
    }

    private loadUiArtwork(): void {
        const assets = this.assets;
        if (!assets || this.uiLoadToken > 0) return;
        const token = ++this.uiLoadToken;
        const load = (path: string, sprite: Sprite | undefined, onLoaded: () => void): Promise<void> => {
            if (!sprite) return Promise.resolve();
            return assets.loadSpriteFrame('lobby-covers', path, 'texture').then((frame) => {
                if (token !== this.uiLoadToken || !this.node.isValid) {
                    assets.releaseRuntimeAsset(frame);
                    return;
                }
                if (sprite === this.cardSkin) {
                    frame.insetLeft = CARD_SKIN_INSETS.left;
                    frame.insetRight = CARD_SKIN_INSETS.right;
                    frame.insetTop = CARD_SKIN_INSETS.top;
                    frame.insetBottom = CARD_SKIN_INSETS.bottom;
                    sprite.type = Sprite.Type.SLICED;
                }
                this.ownedUiFrames.push(frame);
                sprite.spriteFrame = frame;
                onLoaded();
            });
        };
        this.uiArtworkReady = Promise.all([
            load(CARD_SKIN_PATH, this.cardSkin, () => this.drawCard()),
            load(START_BUTTON_PATH, this.actionSkin, () => this.drawActionBackground(this.actionState)),
            load(RECENT_BADGE_PATH, this.recentBadge, () => this.layoutRecentBadge()),
            load(HOT_BADGE_PATH, this.hotBadge, () => this.layoutBadges()),
            load(NEW_BADGE_PATH, this.newBadge, () => this.layoutBadges()),
        ]).then(() => {});
        void this.uiArtworkReady.catch(() => {});
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
        if (this.ownedCoverFrame) this.assets?.releaseRuntimeAsset(this.ownedCoverFrame);
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
