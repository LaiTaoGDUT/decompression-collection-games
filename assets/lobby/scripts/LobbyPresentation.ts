import {
    assetManager,
    Color,
    find,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    view,
    Widget,
} from 'cc';
import { calculateLobbyBackgroundCover } from './LobbyVisualLayout';

const BACKGROUND_ASSET_PATH = 'visual/backgrounds/lobby-arcade-warm-rays-v3/texture';
const BRAND_EMBLEM_ASSET_PATH = 'visual/branding/lobby-cn-title-logo-v3/texture';
const BACKGROUND_FALLBACK = new Color(246, 173, 106, 255);
// SettingsEntry is 92 px high with a 36 px top offset, so its center is 82 px
// below the safe-area top. BrandArea itself starts 18 px below that edge.
const BRAND_EMBLEM_CENTER_Y = -(36 + 92 / 2 - 18);

/** Builds a light, playful mini-game lobby while keeping the L1 palette. */
export class LobbyPresentation {
    private backgroundRoot: Node | null = null;
    private fallbackNode: Node | null = null;
    private artworkNode: Node | null = null;
    private atmosphereNode: Node | null = null;
    private brandEmblemNode: Node | null = null;
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedBrandFrame?: SpriteFrame;
    private mounted = false;

    mount(contentRoot: Node): void {
        if (this.mounted) {
            return;
        }
        const scene = contentRoot.scene;
        const backgroundRoot = scene ? find('Canvas/SceneLayer/Background', scene) : null;
        if (!backgroundRoot) {
            console.error('[LobbyPresentation] Background node is missing.');
            return;
        }

        this.mounted = true;
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
        if (this.ownedBackgroundFrame?.isValid) {
            this.ownedBackgroundFrame.destroy();
        }
        this.ownedBackgroundFrame = undefined;
        this.ownedBrandFrame?.destroy();
        this.ownedBrandFrame = undefined;
        this.backgroundRoot = null;
        this.fallbackNode = null;
        this.artworkNode = null;
        this.atmosphereNode = null;
        this.brandEmblemNode = null;
        this.mounted = false;
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
        if (contentRoot.getChildByName('BrandArea')) {
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
        widget.isAlignTop = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 18;
        widget.left = 40;
        widget.right = 40;
        widget.updateAlignment();

        const emblem = new Node('BrandEmblem');
        emblem.layer = brand.layer;
        brand.addChild(emblem);
        emblem.setPosition(0, BRAND_EMBLEM_CENTER_Y);
        emblem.addComponent(UITransform).setContentSize(450, 300);
        const emblemSprite = emblem.addComponent(Sprite);
        emblemSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.brandEmblemNode = emblem;

    }

    private loadBackgroundArtwork(): void {
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) {
            console.error('[LobbyPresentation] Lobby bundle is unavailable.');
            return;
        }
        bundle.load(BACKGROUND_ASSET_PATH, Texture2D, (error: Error | null, texture: Texture2D) => {
            const artworkNode = this.artworkNode;
            if (error || !texture || !artworkNode?.isValid) {
                console.error('[LobbyPresentation] Formal background failed to load.', error);
                return;
            }
            const sprite = artworkNode.getComponent(Sprite);
            if (!sprite) {
                return;
            }
            this.ownedBackgroundFrame?.destroy();
            const spriteFrame = new SpriteFrame();
            spriteFrame.texture = texture;
            this.ownedBackgroundFrame = spriteFrame;
            sprite.spriteFrame = spriteFrame;
            this.layoutBackground();
        });
    }

    private loadBrandArtwork(): void {
        const bundle = assetManager.getBundle('lobby');
        if (!bundle) {
            return;
        }
        bundle.load(BRAND_EMBLEM_ASSET_PATH, Texture2D, (error: Error | null, texture: Texture2D) => {
            const node = this.brandEmblemNode;
            if (error || !texture || !node?.isValid) {
                console.error('[LobbyPresentation] Brand emblem failed to load.', error);
                return;
            }
            const sprite = node.getComponent(Sprite);
            if (!sprite) {
                return;
            }
            this.ownedBrandFrame?.destroy();
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.ownedBrandFrame = frame;
            sprite.spriteFrame = frame;
        });
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

        // The production background already contains its own light rays and
        // sparkles; the runtime layer intentionally adds no extra geometry.
        void halfWidth;
        void halfHeight;
    }
}
