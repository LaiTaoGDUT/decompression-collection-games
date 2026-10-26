import { Color, Graphics, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerModel } from './MemeRunnerModel';
import { REGION_ART, REGIONS, regionIndex, type Region } from './MemeRunnerRegions';

/** Parallax of the far and near strips; the road moves at 1. */
const STRIP_PARALLAX = [.3];
/** The strips reach this far under the road's top edge: their faded bottom rows show only through pits. */
const STRIP_TUCK = 20;

/** A strip's tiles live under their own node, so a relayout can add tiles without breaking the depth order. */
interface Strip { node: Node; tiles: Node[]; }
interface Layer { sky: Node; root: Node; strips: Strip[]; }

/** Painted depth layers per region (visual spec v46): a fixed cover-scaled sky, then a far and a near
 * scenery strip, each tiled seamlessly at its own parallax and standing on the road line.
 * Regions cross-fade over 1.2 s. Actor/UI coordinates remain owned by the safe stage. */
export class MemeRunnerWorld {
    private readonly layers: Layer[] = [];
    private left = -800;
    private right = 800;
    private current = 0;
    private previous = 0;
    private transitionStart = -2;
    private disposed = false;
    private readonly mist: Graphics;

    constructor(parent: Node, private readonly stage: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        REGIONS.forEach((region, i) => {
            const sky = this.sprite(REGION_ART[region].sky, parent);
            sky.setSiblingIndex(i); sky.addComponent(UIOpacity);
            const root = new Node(`Parallax-${region}`); root.layer = stage.layer; root.parent = stage;
            root.addComponent(UIOpacity);
            const strips = REGION_ART[region].strips.map((key): Strip => {
                const node = new Node(key); node.layer = root.layer; node.parent = root; return { node, tiles: [] };
            });
            this.layers.push({ sky, root, strips });
        });
        const veil = new Node('BackgroundAtmosphere'); veil.layer = stage.layer; veil.parent = stage;
        this.mist = veil.addComponent(Graphics);
    }

    get theme(): Region { return REGIONS[this.current]; }

    reset(m: MemeRunnerModel): void {
        this.current = this.previous = regionIndex(m.meters); this.transitionStart = -2;
    }

    layout(width: number, height: number, left: number, right: number): void {
        this.left = left; this.right = right;
        // Lift the background's shadows and soften its fine edges; actors, coins and decks stay crisp.
        this.mist.clear(); this.mist.fillColor = new Color(255, 246, 224, 62);
        this.mist.rect(left - 2, -height / this.stage.scale.y - 2, right - left + 4, height * 2 / this.stage.scale.y + 4); this.mist.fill();
        this.layers.forEach((layer, i) => {
            const sky = this.frames[REGION_ART[REGIONS[i]].sky].originalSize;
            const cover = Math.max(width / sky.width, height / sky.height); layer.sky.setScale(cover, cover, 1);
            REGION_ART[REGIONS[i]].strips.forEach((key, j) => {
                const { node, tiles } = layer.strips[j], count = Math.ceil((right - left) / this.frames[key].originalSize.width) + 2;
                while (tiles.length < count) {
                    const n = this.sprite(key, node); n.getComponent(UITransform)!.setAnchorPoint(.5, 0);
                    n.getComponent(Sprite)!.color = new Color(REGION_ART[REGIONS[i]].sceneryTint); tiles.push(n);
                }
                while (tiles.length > count) { const n = tiles.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
            });
        });
    }

    render(m: MemeRunnerModel, floor: number): void {
        if (this.disposed) return;
        const next = regionIndex(m.meters);
        if (next !== this.current) {
            this.previous = this.current; this.current = next; this.transitionStart = m.time;
            // Ordering changes only at a transition. Reordering the same sky
            // node twice each frame invalidates the whole UI traversal.
            this.layers[this.previous].sky.setSiblingIndex(0);
            this.layers[this.current].sky.setSiblingIndex(1);
        }
        const t = Math.min(1, Math.max(0, (m.time - this.transitionStart) / 1.2));
        this.layers.forEach((layer, i) => {
            const active = i === this.current || (t < 1 && i === this.previous);
            layer.sky.active = layer.root.active = active;
            if (!active) return;
            const opacity = this.current === this.previous ? 1 : i === this.current ? t : 1 - t;
            layer.root.getComponent(UIOpacity)!.opacity = Math.round(opacity * 255);
            layer.sky.getComponent(UIOpacity)!.opacity = i === this.current && this.current !== this.previous ? Math.round(t * 255) : 255;
            const base = floor - STRIP_TUCK;
            REGION_ART[REGIONS[i]].strips.forEach((key, j) => {
                const width = this.frames[key].originalSize.width, distance = m.x * STRIP_PARALLAX[j];
                const first = Math.floor((this.left + distance) / width) - 1;
                layer.strips[j].tiles.forEach((n, k) => {
                    const slot = first + k;
                    n.setPosition((slot + .5) * width - distance, base);
                    // Alternating mirrored strips share the exact edge pixels at every join.
                    n.setScale(Math.abs(slot % 2) ? -1 : 1, 1, 1);
                });
            });
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const l of this.layers) {
            l.sky.getComponent(Sprite)!.spriteFrame = null;
            for (const s of l.root.getComponentsInChildren(Sprite)) s.spriteFrame = null;
            l.sky.destroy(); l.root.destroy(); l.strips.length = 0;
        }
        this.layers.length = 0;
        this.mist.node.destroy();
    }

    private sprite(key: string, parent: Node): Node {
        const n = new Node(key); n.layer = parent.layer; n.parent = parent;
        const frame = this.frames[key]; n.addComponent(UITransform).setContentSize(frame.originalSize);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame;
        return n;
    }
}
