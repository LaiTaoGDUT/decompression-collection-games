import {
    Color,
    find,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
    Widget,
} from 'cc';
import { calculateLobbyBackgroundCover } from './LobbyVisualLayout';
import type { AssetService } from '../../services/asset/AssetService';
import { LOBBY_BACKGROUND_BUNDLE, LOBBY_BACKGROUND_PATH } from '../../shared/ui/LobbyArtwork';
import {
    calculateLobbyBrandMetrics,
    LOBBY_BRAND_HEIGHT,
    LOBBY_BRAND_WIDTH,
    LOBBY_DESIGN_HEIGHT,
    LOBBY_DESIGN_WIDTH,
} from '../../shared/ui/LobbyBrandLayout';

const BRAND_EMBLEM_ASSET_PATH = 'visual/branding/lobby-cn-title-logo-v3/texture';
const BACKGROUND_FALLBACK = new Color(249, 210, 170, 255);

/** Builds a light, playful mini-game lobby while keeping the L1 palette. */
export class LobbyPresentation {
    private backgroundRoot: Node | null = null;
    private fallbackNode: Node | null = null;
    private artworkNode: Node | null = null;
    private atmosphereNode: Node | null = null;
    private brandEmblemNode: Node | null = null;
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedBrandFrame?: SpriteFrame;
    private assets?: AssetService;
    private generation = 0;
    private mounted = false;

    mount(contentRoot: Node, assets?: AssetService): void {
        if (this.mounted) {
            return;
        }
        const scene = contentRoot.scene;
        const backgroundRoot = scene ? find('Canvas/SceneLayer/Background', scene) : null;
        if (!backgroundRoot) {
            // TODO: console.error('[LobbyPresentation] Background node is missing.');
            return;
        }

        this.mounted = true;
        this.assets = assets;
        this.generation++;
        this.backgroundRoot = backgroundRoot;
        this.createFallback(backgroundRoot);
        this.createArtwork(backgroundRoot);
        this.createAtmosphere(backgroundRoot);
        this.createBrandArea(contentRoot);
        this.layoutBackground();
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.loadBackgroundArtwork();
        this.loadBrandArtwork();
    }

    unmount(): void {
        if (!this.mounted) {
            return;
        }
        this.mounted = false;
        this.generation++;
        view.off('canvas-resize', this.handleCanvasResize, this);
        const sprite = this.artworkNode?.isValid
            ? this.artworkNode.getComponent(Sprite)
            : null;
        if (sprite) {
            sprite.spriteFrame = null;
        }
        const brandSprite = this.brandEmblemNode?.isValid
            ? this.brandEmblemNode.getComponent(Sprite)
            : null;
        if (brandSprite) {
            brandSprite.spriteFrame = null;
        }
        if (this.ownedBackgroundFrame) this.assets?.releaseRuntimeAsset(this.ownedBackgroundFrame);
        this.ownedBackgroundFrame = undefined;
        if (this.ownedBrandFrame) this.assets?.releaseRuntimeAsset(this.ownedBrandFrame);
        this.ownedBrandFrame = undefined;
        this.backgroundRoot = null;
        this.fallbackNode = null;
        this.artworkNode = null;
        this.atmosphereNode = null;
        this.brandEmblemNode = null;
        this.assets = undefined;
    }

    private createFallback(parent: Node): void {
        const existing = parent.getChildByName('L1BackgroundFallback');
        const node = existing ?? new Node('L1BackgroundFallback');
        if (!existing) {
            node.layer = parent.layer;
            parent.addChild(node);
            node.setSiblingIndex(0);
            node.addComponent(UITransform);
            node.addComponent(Graphics);
        }
        this.fallbackNode = node;
    }

    private createArtwork(parent: Node): void {
        const existing = parent.getChildByName('L1GalleryArtwork');
        const node = existing ?? new Node('L1GalleryArtwork');
        if (!existing) {
            node.layer = parent.layer;
            parent.addChild(node);
            node.setSiblingIndex(1);
            node.addComponent(UITransform);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        this.artworkNode = node;
    }

    private createAtmosphere(parent: Node): void {
        const existing = parent.getChildByName('L1GalleryAtmosphere');
        const node = existing ?? new Node('L1GalleryAtmosphere');
        if (!existing) {
            node.layer = parent.layer;
            parent.addChild(node);
            node.setSiblingIndex(2);
            node.addComponent(UITransform);
            node.addComponent(Graphics);
        }
        this.atmosphereNode = node;
    }

    private createBrandArea(contentRoot: Node): void {
        const existing = contentRoot.getChildByName('BrandArea');
        if (existing) {
            this.brandEmblemNode = existing.getChildByName('BrandEmblem');
            this.layoutBrand(LOBBY_DESIGN_WIDTH, LOBBY_DESIGN_HEIGHT);
            return;
        }
        const brand = new Node('BrandArea');
        brand.layer = contentRoot.layer;
        contentRoot.addChild(brand);
        brand.setSiblingIndex(0);
        const transform = brand.addComponent(UITransform);
        transform.setContentSize(670, 330);
        transform.setAnchorPoint(0.5, 1);
        const widget = brand.addComponent(Widget);
        widget.enabled = false;

        const emblem = new Node('BrandEmblem');
        emblem.layer = brand.layer;
        brand.addChild(emblem);
        emblem.setPosition(0, 0);
        emblem.addComponent(UITransform).setContentSize(
            LOBBY_BRAND_WIDTH,
            LOBBY_BRAND_HEIGHT,
        );
        const emblemSprite = emblem.addComponent(Sprite);
        emblemSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.brandEmblemNode = emblem;
        this.layoutBrand(LOBBY_DESIGN_WIDTH, LOBBY_DESIGN_HEIGHT);
    }

    /** 将品牌区固定在 ScrollView content 顶部，并与启动页共享 logo 几何。 */
    layoutBrand(contentWidth: number, contentHeight: number): void {
        const emblem = this.brandEmblemNode;
        const brand = emblem?.parent;
        const brandTransform = brand?.getComponent(UITransform);
        const emblemTransform = emblem?.getComponent(UITransform);
        if (!brand || !brandTransform || !emblem || !emblemTransform) {
            return;
        }

        const metrics = calculateLobbyBrandMetrics(contentWidth, contentHeight);
        const widget = brand.getComponent(Widget);
        if (widget) {
            widget.enabled = false;
        }
        brandTransform.setAnchorPoint(0.5, 1);
        brandTransform.setContentSize(Math.max(1, contentWidth), metrics.areaHeight);
        brand.setPosition(0, 0);
        emblemTransform.setAnchorPoint(0.5, 0.5);
        emblemTransform.setContentSize(metrics.width, metrics.height);
        emblem.setPosition(0, -metrics.centerFromTop);
    }

    private loadBackgroundArtwork(): void {
        const assets = this.assets;
        if (!assets) return;
        const generation = this.generation;
        void assets.loadSpriteFrame(LOBBY_BACKGROUND_BUNDLE, LOBBY_BACKGROUND_PATH, 'texture').then(frame => {
            const artworkNode = this.artworkNode;
            if (!this.mounted || generation !== this.generation || !artworkNode?.isValid) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            const sprite = artworkNode.getComponent(Sprite);
            if (!sprite) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            if (this.ownedBackgroundFrame) assets.releaseRuntimeAsset(this.ownedBackgroundFrame);
            this.ownedBackgroundFrame = frame;
            sprite.spriteFrame = frame;
            this.layoutBackground();
        }).catch(() => {});
    }

    private loadBrandArtwork(): void {
        const assets = this.assets;
        if (!assets) return;
        const generation = this.generation;
        void assets.loadSpriteFrame('lobby-covers', BRAND_EMBLEM_ASSET_PATH, 'texture').then(frame => {
            const node = this.brandEmblemNode;
            if (!this.mounted || generation !== this.generation || !node?.isValid) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            const sprite = node.getComponent(Sprite);
            if (!sprite) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            if (this.ownedBrandFrame) assets.releaseRuntimeAsset(this.ownedBrandFrame);
            this.ownedBrandFrame = frame;
            sprite.spriteFrame = frame;
        }).catch(() => {});
    }

    private readonly handleCanvasResize = (): void => {
        this.layoutBackground();
    };

    private layoutBackground(): void {
        const visibleSize = view.getVisibleSize();
        if (this.fallbackNode?.isValid) {
            const transform = this.fallbackNode.getComponent(UITransform);
            const graphics = this.fallbackNode.getComponent(Graphics);
            transform?.setContentSize(visibleSize.width, visibleSize.height);
            graphics?.clear();
            if (graphics) {
                graphics.fillColor = BACKGROUND_FALLBACK;
                graphics.rect(-visibleSize.width / 2, -visibleSize.height / 2, visibleSize.width, visibleSize.height);
                graphics.fill();
            }
        }
        if (this.artworkNode?.isValid) {
            const cover = calculateLobbyBackgroundCover(visibleSize.width, visibleSize.height);
            this.artworkNode.getComponent(UITransform)?.setContentSize(cover.width, cover.height);
            this.artworkNode.setPosition(0, 0);
        }
        this.drawAtmosphere(visibleSize.width, visibleSize.height);
    }

    private drawAtmosphere(width: number, height: number): void {
        const node = this.atmosphereNode;
        const graphics = node?.getComponent(Graphics);
        if (!node || !graphics) {
            return;
        }
        node.getComponent(UITransform)?.setContentSize(width, height);
        graphics.clear();
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        // Keep the warm cloud artwork quiet behind the game cards;
        // the runtime layer intentionally adds no extra decoration.
        void halfWidth;
        void halfHeight;
    }
}
