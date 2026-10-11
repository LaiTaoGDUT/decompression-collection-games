import {
    Color,
    find,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
} from 'cc';
import { calculateLobbyBackgroundCover } from './LobbyVisualLayout';
import type { AssetService } from '../../services/asset/AssetService';
import { LOBBY_BACKGROUND_BUNDLE, LOBBY_BACKGROUND_PATH } from '../../shared/ui/LobbyArtwork';
const BACKGROUND_FALLBACK = new Color(249, 210, 170, 255);

/** Builds a light, playful mini-game lobby while keeping the L1 palette. */
export class LobbyPresentation {
    private backgroundRoot: Node | null = null;
    private fallbackNode: Node | null = null;
    private artworkNode: Node | null = null;
    private atmosphereNode: Node | null = null;
    private ownedBackgroundFrame?: SpriteFrame;
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
        this.layoutBackground();
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.loadBackgroundArtwork();
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
        if (this.ownedBackgroundFrame) this.assets?.releaseRuntimeAsset(this.ownedBackgroundFrame);
        this.ownedBackgroundFrame = undefined;
        this.backgroundRoot = null;
        this.fallbackNode = null;
        this.artworkNode = null;
        this.atmosphereNode = null;
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
