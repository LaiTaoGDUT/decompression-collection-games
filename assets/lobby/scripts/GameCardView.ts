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
    Layout,
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
import type { LobbyCardStatus } from './LobbyCardStatus';
import {
    calculateLobbyCardRows,
    LOBBY_CARD_LAYOUT as CARD_LAYOUT,
    LOBBY_CARD_SKIN,
    type LobbyCardRows,
} from './LobbyCardLayout';

const { ccclass } = _decorator;
export type GameCardClickHandler = (manifest: GameManifest) => void;
export interface GameCardSize {
    readonly width: number;
    readonly height: number;
}

const CARD_SKIN_PATH = LOBBY_CARD_SKIN.path;
const RECENT_BADGE_PATH = 'visual/ui/lobby-recently-played-v2/texture';
const HOT_BADGE_PATH = 'visual/ui/lobby-hot-v1/texture';
const NEW_BADGE_PATH = 'visual/ui/lobby-new-v1/texture';
/**
 * 卡片底板九宫格边距（纹理像素）：上下保留圆角与底部厚边，只拉伸中段，
 * 卡片变高时圆角和厚边不变形。
 */
const CARD_SKIN_INSETS = LOBBY_CARD_SKIN.insets;
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
    description: new Color(112, 55, 34, 255),
    statusTrack: new Color(236, 220, 200, 255),
    trophy: new Color(236, 172, 60, 255),
    trophyShade: new Color(190, 122, 34, 255),
};

type CardMode = 'game' | 'coming-soon';
/**
 * ready: 可点击；busy: 正在进入，不可点击；retry: 进入失败，可再次点击；disabled: 暂未开放。
 * 失败与未开放在简介行给出文案；进入中保持原内容，由加载层呈现进度。整张卡片是唯一的点击区域。
 */
type ActionState = 'ready' | 'busy' | 'retry' | 'disabled';

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
    private statusRoot?: Node;
    private statusLead?: Graphics;
    private statusLabel?: Label;
    private status?: LobbyCardStatus;
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
        for (const sprite of [this.cardSkin, this.recentBadge, this.hotBadge, this.newBadge]) {
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
        status: LobbyCardStatus | undefined,
        clickHandler: GameCardClickHandler,
        badge?: LobbyGameBadge,
        size?: GameCardSize,
    ): void {
        if (size) this.applyCardSize(size.width, size.height);
        this.ensureStructure();
        this.mode = 'game';
        this.manifest = manifest;
        this.status = status;
        this.badge = badge;
        this.clickHandler = clickHandler;
        this.node.name = `GameCard-${manifest.id}`;
        this.requireLabel('NameLabel').string = manifest.name;
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
        this.status = undefined;
        this.clickHandler = undefined;
        this.coverLoadToken += 1;
        this.releaseOwnedCoverFrame();
        this.node.name = 'ComingSoonCard';
        this.requireLabel('NameLabel').string = '敬请期待';
        this.requireLabel('DescriptionLabel').string = '';
        this.requireLabel('DescriptionLabel').node.active = false;
        if (this.statusRoot) this.statusRoot.active = false;
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
        this.applyActionState(this.actionState);
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
        this.applyActionState('busy');
    }

    setEnterFailed(): void {
        this.applyActionState('retry');
    }

    setIdle(): void {
        this.applyActionState(this.manifest?.enabled ? 'ready' : 'disabled');
    }

    /** 简介行在失败、未开放时显示状态文案，其余时候（含进入中）显示个人进度或游戏简介。 */
    private applyActionState(state: ActionState): void {
        this.actionState = state;
        if (this.mode !== 'game') return;
        const stateText = state === 'retry' ? '进入失败，点击重试'
            : state === 'disabled' ? '暂未开放'
                : undefined;
        const showStatus = !stateText && !!this.status;
        const description = this.requireLabel('DescriptionLabel');
        description.string = stateText ?? this.manifest?.description ?? '';
        description.node.active = !showStatus;
        if (this.statusRoot) this.statusRoot.active = showStatus;
        this.requireButton().interactable = state === 'ready' || state === 'retry';
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

        const legacyStatus = this.node.getChildByName('StatusLabel');
        if (legacyStatus) {
            legacyStatus.active = false;
        }
        this.ensureStatusRow(parentLayer);

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
        // The coming-soon card has no description: centre its title
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
        this.layoutStatusRow(rows);

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
            label.color = COLORS.description;
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

    /** 进度行：前导图形（进度条或奖杯）与文字由水平 Layout 居中排列，文字宽度随内容变化。 */
    private ensureStatusRow(parentLayer: number): void {
        let row = this.node.getChildByName('StatusRow');
        if (!row) {
            row = new Node('StatusRow');
            row.layer = parentLayer;
            this.node.addChild(row);
            row.addComponent(UITransform);
            const layout = row.addComponent(Layout);
            layout.type = Layout.Type.HORIZONTAL;
            layout.resizeMode = Layout.ResizeMode.CONTAINER;
            layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
            const lead = new Node('StatusLead');
            lead.layer = parentLayer;
            row.addChild(lead);
            lead.addComponent(UITransform);
            lead.addComponent(Graphics);
            const text = new Node('StatusText');
            text.layer = parentLayer;
            row.addChild(text);
            text.addComponent(UITransform);
            const label = text.addComponent(Label);
            label.horizontalAlign = HorizontalTextAlignment.LEFT;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.overflow = Label.Overflow.NONE;
            label.enableWrapText = false;
        }
        this.statusRoot = row;
        this.statusLead = row.getChildByName('StatusLead')?.getComponent(Graphics) ?? undefined;
        this.statusLabel = row.getChildByName('StatusText')?.getComponent(Label) ?? undefined;
    }

    /** 进度行与简介共用同一行；count 画累计进度条，best 画单局最佳的奖杯。 */
    private layoutStatusRow(rows: LobbyCardRows): void {
        const row = this.statusRoot;
        const lead = this.statusLead;
        const label = this.statusLabel;
        if (!row || !lead || !label) return;
        const scale = rows.scale;
        const height = CARD_LAYOUT.descriptionHeight * scale;
        row.setPosition(0, rows.descriptionY);
        row.getComponent(UITransform)?.setContentSize(rows.coverWidth, height);
        const layout = row.getComponent(Layout);
        if (layout) layout.spacingX = CARD_LAYOUT.statusGap * scale;
        label.fontSize = Math.round(CARD_LAYOUT.descriptionFontSize * scale);
        label.lineHeight = Math.round(height);
        label.color = COLORS.description;
        this.configurePlainText(label);
        const status = this.status;
        label.string = status?.text ?? '';
        lead.clear();
        if (!status) return;
        if (status.kind === 'count') {
            const width = CARD_LAYOUT.statusBarWidth * scale;
            const barHeight = CARD_LAYOUT.statusBarHeight * scale;
            lead.node.getComponent(UITransform)?.setContentSize(width, barHeight);
            lead.fillColor = COLORS.statusTrack;
            lead.roundRect(-width / 2, -barHeight / 2, width, barHeight, barHeight / 2);
            lead.fill();
            const ratio = Math.min(1, status.progress / Math.max(1, status.target));
            // 进度条至少露出一个圆头，刚开始的进度也看得见。
            const filled = Math.max(barHeight, width * ratio);
            lead.fillColor = new Color().fromHEX(status.color);
            lead.roundRect(-width / 2, -barHeight / 2, filled, barHeight, barHeight / 2);
            lead.fill();
        } else {
            const size = CARD_LAYOUT.statusIconSize * scale;
            lead.node.getComponent(UITransform)?.setContentSize(size, size);
            this.drawTrophyIcon(lead, size);
        }
        row.getComponent(Layout)?.updateLayout();
    }

    /** 小奖杯：杯身、两侧把手、杯柄与底座，以图标中心为原点。 */
    private drawTrophyIcon(g: Graphics, size: number): void {
        const s = size;
        g.strokeColor = COLORS.trophyShade;
        g.lineWidth = s * 0.09;
        g.lineCap = Graphics.LineCap.ROUND;
        g.circle(-s * 0.3, s * 0.2, s * 0.13);
        g.stroke();
        g.circle(s * 0.3, s * 0.2, s * 0.13);
        g.stroke();
        g.fillColor = COLORS.trophy;
        g.moveTo(-s * 0.32, s * 0.42);
        g.lineTo(s * 0.32, s * 0.42);
        g.lineTo(s * 0.26, s * 0.06);
        g.quadraticCurveTo(s * 0.2, -s * 0.12, 0, -s * 0.14);
        g.quadraticCurveTo(-s * 0.2, -s * 0.12, -s * 0.26, s * 0.06);
        g.close();
        g.fill();
        g.rect(-s * 0.06, -s * 0.3, s * 0.12, s * 0.18);
        g.fill();
        g.fillColor = COLORS.trophyShade;
        g.roundRect(-s * 0.24, -s * 0.46, s * 0.48, s * 0.16, s * 0.05);
        g.fill();
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
