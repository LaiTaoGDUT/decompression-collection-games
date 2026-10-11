import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AssetService } from '../../services/asset/AssetService';
import {
    calculateLobbyBrandMetrics,
    LOBBY_BRAND_HEIGHT,
    LOBBY_BRAND_WIDTH,
    LOBBY_HEADER_TOOL_CELL_HEIGHT,
    LOBBY_HEADER_TOOLBAR_WIDTH,
    type LobbyBrandMetrics,
    type LobbySafeContentMetrics,
} from '../../shared/ui/LobbyBrandLayout';

const BRAND_EMBLEM_ASSET_PATH = 'visual/branding/lobby-cn-title-logo-v3/texture';
/** 工具胶囊与成就展柜同属大厅的奶油色浮层：白色细边、奶油面、暖色软投影。 */
const TOOLBAR_COLORS = {
    shadow: new Color(196, 110, 60, 40),
    rim: new Color(255, 255, 255, 235),
    face: new Color(255, 244, 226, 255),
    divider: new Color(234, 214, 190, 255),
};

export const LOBBY_HEADER_SLOTS = ['Settings', 'Notice'] as const;
export type LobbyHeaderSlot = typeof LOBBY_HEADER_SLOTS[number];

/**
 * 大厅标题与顶部入口：标题随游戏列表滚动，设置和公告入口固定在同一个竖向胶囊里。
 * 胶囊底板由顶部栏绘制，各入口由对应面板挂到槽位里，槽位按设计尺寸排版后整体等比缩放。
 */
export class LobbyHeader {
    private root: Node | null = null;
    private emblem: Node | null = null;
    private toolbar: Node | null = null;
    private readonly slots = new Map<LobbyHeaderSlot, Node>();
    private ownedBrandFrame?: SpriteFrame;
    private assets?: AssetService;
    private generation = 0;

    get node(): Node | null {
        return this.root;
    }

    mount(parent: Node, scrollingContent: Node | null, assets?: AssetService): void {
        if (this.root?.isValid) return;
        this.assets = assets;
        this.generation++;
        const root = new Node('LobbyHeader');
        root.layer = parent.layer;
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(0, 0);
        this.root = root;

        const emblem = new Node('BrandEmblem');
        emblem.layer = root.layer;
        (scrollingContent ?? root).addChild(emblem);
        emblem.setSiblingIndex(0);
        emblem.addComponent(UITransform).setContentSize(LOBBY_BRAND_WIDTH, LOBBY_BRAND_HEIGHT);
        emblem.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
        this.emblem = emblem;
        // 底板先于槽位加入，绘制在两个入口之下。
        const toolbar = new Node('HeaderToolbar');
        toolbar.layer = root.layer;
        root.addChild(toolbar);
        toolbar.addComponent(UITransform).setContentSize(
            LOBBY_HEADER_TOOLBAR_WIDTH,
            LOBBY_HEADER_TOOL_CELL_HEIGHT * 2,
        );
        this.drawToolbar(toolbar.addComponent(Graphics));
        this.toolbar = toolbar;
        for (const slot of LOBBY_HEADER_SLOTS) {
            const node = new Node(`${slot}Slot`);
            node.layer = root.layer;
            root.addChild(node);
            node.addComponent(UITransform).setContentSize(0, 0);
            this.slots.set(slot, node);
        }
        this.loadBrandArtwork();
    }

    /** 入口按设计尺寸挂在槽位中心，槽位随顶部栏整体缩放。 */
    slot(name: LobbyHeaderSlot): Node | null {
        return this.slots.get(name) ?? null;
    }

    /** 标题与工具胶囊在顶部栏内垂直居中，并共同避让顶部安全区。 */
    layout(safe: LobbySafeContentMetrics): LobbyBrandMetrics {
        const metrics = calculateLobbyBrandMetrics(safe.contentWidth, safe.contentHeight);
        const root = this.root;
        if (!root?.isValid) return metrics;
        const top = safe.contentY + safe.contentHeight / 2;
        root.setPosition(safe.contentX, top);
        const emblem = this.emblem;
        if (emblem?.isValid) {
            emblem.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
            const topInset = emblem.parent === root ? 0 : safe.safeTop;
            emblem.setPosition(0, -topInset - metrics.centerFromTop);
        }
        const toolbar = this.toolbar;
        if (toolbar?.isValid) {
            toolbar.setPosition(metrics.sideColumnX, -metrics.toolbarCenterFromTop);
            toolbar.setScale(metrics.scale, metrics.scale, 1);
        }
        const place = (slot: LobbyHeaderSlot, x: number, fromTop: number): void => {
            const node = this.slots.get(slot);
            if (!node?.isValid) return;
            node.setPosition(x, -fromTop);
            node.setScale(metrics.scale, metrics.scale, 1);
        };
        place('Settings', metrics.sideColumnX, metrics.settingsCenterFromTop);
        place('Notice', metrics.sideColumnX, metrics.noticeCenterFromTop);
        return metrics;
    }

    unmount(): void {
        this.generation++;
        const sprite = this.emblem?.isValid ? this.emblem.getComponent(Sprite) : null;
        if (sprite) sprite.spriteFrame = null;
        if (this.ownedBrandFrame) this.assets?.releaseRuntimeAsset(this.ownedBrandFrame);
        this.ownedBrandFrame = undefined;
        this.slots.clear();
        this.emblem = null;
        this.toolbar = null;
        this.root = null;
        this.assets = undefined;
    }

    /** 竖向胶囊：两格之间一道短分隔线；坐标以胶囊中心为原点，按设计尺寸绘制。 */
    private drawToolbar(g: Graphics): void {
        const width = LOBBY_HEADER_TOOLBAR_WIDTH;
        const height = LOBBY_HEADER_TOOL_CELL_HEIGHT * 2;
        const radius = width / 2;
        g.clear();
        g.fillColor = TOOLBAR_COLORS.shadow;
        g.roundRect(-width / 2, -height / 2 - 5, width, height, radius);
        g.fill();
        g.fillColor = TOOLBAR_COLORS.rim;
        g.roundRect(-width / 2, -height / 2, width, height, radius);
        g.fill();
        g.fillColor = TOOLBAR_COLORS.face;
        g.roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, radius - 3);
        g.fill();
        g.strokeColor = TOOLBAR_COLORS.divider;
        g.lineWidth = 2;
        g.moveTo(-width * 0.26, 0);
        g.lineTo(width * 0.26, 0);
        g.stroke();
    }

    private loadBrandArtwork(): void {
        const assets = this.assets;
        if (!assets) return;
        const generation = this.generation;
        void assets.loadSpriteFrame('lobby-covers', BRAND_EMBLEM_ASSET_PATH, 'texture').then((frame) => {
            const sprite = this.emblem?.isValid ? this.emblem.getComponent(Sprite) : null;
            if (generation !== this.generation || !sprite) {
                assets.releaseRuntimeAsset(frame);
                return;
            }
            if (this.ownedBrandFrame) assets.releaseRuntimeAsset(this.ownedBrandFrame);
            this.ownedBrandFrame = frame;
            sprite.spriteFrame = frame;
        }).catch(() => {});
    }
}
