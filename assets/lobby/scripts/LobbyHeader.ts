import { Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AssetService } from '../../services/asset/AssetService';
import {
    calculateLobbyBrandMetrics,
    LOBBY_BRAND_HEIGHT,
    LOBBY_BRAND_WIDTH,
    type LobbyBrandMetrics,
    type LobbySafeContentMetrics,
} from '../../shared/ui/LobbyBrandLayout';

const BRAND_EMBLEM_ASSET_PATH = 'visual/branding/lobby-cn-title-logo-v3/texture';
/** 标题独立下移，保持固定入口和游戏网格的几何不变。 */
const BRAND_VERTICAL_OFFSET = 32;

export const LOBBY_HEADER_SLOTS = ['Settings', 'Notice'] as const;
export type LobbyHeaderSlot = typeof LOBBY_HEADER_SLOTS[number];

/**
 * 大厅标题与顶部入口：标题随游戏列表滚动，设置和公告入口固定。
 * 各入口由对应面板挂到槽位里，槽位按设计尺寸排版后整体等比缩放。
 */
export class LobbyHeader {
    private root: Node | null = null;
    private emblem: Node | null = null;
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

    /** 固定入口避让安全区；滚动标题从列表顶边留出同样的顶部安全间距。 */
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
            emblem.setPosition(0, -topInset - metrics.centerFromTop - BRAND_VERTICAL_OFFSET * metrics.scale);
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
        this.root = null;
        this.assets = undefined;
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
