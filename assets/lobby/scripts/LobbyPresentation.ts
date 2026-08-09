import {
    assetManager,
    Color,
    find,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    VerticalTextAlignment,
    view,
    Widget,
} from 'cc';
import { calculateLobbyBackgroundCover } from './LobbyVisualLayout';

const BACKGROUND_ASSET_PATH = 'visual/backgrounds/l1-soft-light-gallery-v1/texture';
const BACKGROUND_FALLBACK = new Color(241, 238, 232, 255);
const PRIMARY_TEXT = new Color(54, 42, 34, 255);
const SECONDARY_TEXT = new Color(108, 94, 81, 255);
const BRASS_ACCENT = new Color(169, 133, 77, 255);
const SAGE_ACCENT = new Color(100, 132, 109, 255);
const CORAL_ACCENT = new Color(238, 133, 103, 255);
const BUTTER_ACCENT = new Color(246, 199, 84, 255);

/** Builds the L1 lobby as a warm independent game gallery. */
export class LobbyPresentation {
    private backgroundRoot: Node | null = null;
    private fallbackNode: Node | null = null;
    private artworkNode: Node | null = null;
    private atmosphereNode: Node | null = null;
    private ownedBackgroundFrame?: SpriteFrame;
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
        if (this.ownedBackgroundFrame?.isValid) {
            this.ownedBackgroundFrame.destroy();
        }
        this.ownedBackgroundFrame = undefined;
        this.backgroundRoot = null;
        this.fallbackNode = null;
        this.artworkNode = null;
        this.atmosphereNode = null;
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
        transform.setContentSize(670, 190);
        transform.setAnchorPoint(0.5, 1);
        const widget = brand.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 28;
        widget.left = 40;
        widget.right = 40;
        widget.updateAlignment();

        const plaque = brand.addComponent(Graphics);
        plaque.fillColor = new Color(255, 252, 245, 224);
        plaque.roundRect(-335, -178, 670, 168, 28);
        plaque.fill();
        plaque.strokeColor = new Color(207, 191, 166, 210);
        plaque.lineWidth = 3;
        plaque.roundRect(-335, -178, 670, 168, 28);
        plaque.stroke();
        plaque.fillColor = new Color(58, 48, 38, 25);
        plaque.roundRect(-327, -185, 654, 18, 9);
        plaque.fill();
        plaque.fillColor = CORAL_ACCENT;
        plaque.roundRect(-335, -178, 10, 168, 5);
        plaque.fill();

        this.drawBrandMark(brand);
        this.createLabel(brand, 'CollectionNo', 'COLLECTION 01  ·  PLAY GALLERY', 15, 24, BRASS_ACCENT, -252, -42, 440);
        this.createLabel(brand, 'BrandTitle', '解压小游戏展厅', 44, 56, PRIMARY_TEXT, -252, -88, 500);
        this.createLabel(brand, 'BrandSubtitle', '挑一件展品，给情绪松松绑', 21, 30, SECONDARY_TEXT, -252, -138, 510);

        const dots = new Node('BrandDots');
        dots.layer = brand.layer;
        brand.addChild(dots);
        dots.setPosition(238, -139);
        const graphics = dots.addComponent(Graphics);
        [CORAL_ACCENT, BUTTER_ACCENT, SAGE_ACCENT].forEach((color, index) => {
            graphics.fillColor = color;
            graphics.circle(index * 24, 0, 6);
            graphics.fill();
        });
    }

    private drawBrandMark(parent: Node): void {
        const markNode = new Node('CollectionMark');
        markNode.layer = parent.layer;
        parent.addChild(markNode);
        markNode.setPosition(-286, -94);
        const graphics = markNode.addComponent(Graphics);
        graphics.fillColor = new Color(249, 199, 84, 255);
        graphics.roundRect(-30, -30, 60, 60, 16);
        graphics.fill();
        graphics.strokeColor = PRIMARY_TEXT;
        graphics.lineWidth = 5;
        graphics.moveTo(-15, 14);
        graphics.lineTo(-15, -13);
        graphics.bezierCurveTo(-15, 5, 15, 5, 15, -13);
        graphics.stroke();
        graphics.fillColor = CORAL_ACCENT;
        graphics.circle(-15, 14, 4);
        graphics.fill();
        graphics.fillColor = SAGE_ACCENT;
        graphics.circle(15, -13, 4);
        graphics.fill();
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        fontSize: number,
        lineHeight: number,
        color: Color,
        x: number,
        y: number,
        width: number,
    ): void {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, lineHeight);
        transform.setAnchorPoint(0, 0.5);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.color = color;
        label.horizontalAlign = HorizontalTextAlignment.LEFT;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
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

        graphics.fillColor = new Color(249, 199, 84, 28);
        graphics.circle(-halfWidth + 70, halfHeight - 220, 190);
        graphics.fill();
        graphics.fillColor = new Color(238, 133, 103, 22);
        graphics.circle(halfWidth - 30, 60, 210);
        graphics.fill();
        graphics.fillColor = new Color(100, 132, 109, 25);
        graphics.circle(-halfWidth + 10, -halfHeight + 160, 180);
        graphics.fill();

        graphics.strokeColor = new Color(169, 133, 77, 70);
        graphics.lineWidth = 3;
        graphics.moveTo(-halfWidth, -halfHeight + 94);
        graphics.bezierCurveTo(-width * 0.22, -halfHeight + 142, width * 0.22, -halfHeight + 142, halfWidth, -halfHeight + 94);
        graphics.stroke();

        const frameY = halfHeight - 285;
        graphics.strokeColor = new Color(169, 133, 77, 72);
        graphics.lineWidth = 2;
        graphics.roundRect(-halfWidth + 18, frameY - 48, 44, 96, 5);
        graphics.stroke();
        graphics.roundRect(halfWidth - 62, frameY - 30, 44, 76, 5);
        graphics.stroke();

        graphics.fillColor = new Color(238, 133, 103, 120);
        graphics.circle(-halfWidth + 40, frameY + 64, 5);
        graphics.fill();
        graphics.fillColor = new Color(100, 132, 109, 120);
        graphics.circle(halfWidth - 40, frameY + 54, 5);
        graphics.fill();
    }
}
