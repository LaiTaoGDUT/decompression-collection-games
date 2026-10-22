import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerModel } from './MemeRunnerModel';
import { runnerScenery, sceneryCount } from './MemeRunnerScenery';
import { REGION_ART, REGIONS, regionIndex, type Region } from './MemeRunnerRegions';

/** Fraction of the plaza's height in front of the shop fronts. */
const PLAZA_SETBACK = .6;

interface Layer { far: Node; root: Node; plaza: Node[]; mid: Node[]; }

/** Painted depth layers per region: a cover-scaled backdrop, then a plaza and the midground pieces
 * standing set back on it, both at .22 parallax.
 * Regions cross-fade over 1.2 s. Actor/UI coordinates remain owned by the safe stage. */
export class MemeRunnerWorld {
    private readonly layers: Layer[] = [];
    private left = -800;
    private right = 800;
    private current = 0;
    private previous = 0;
    private transitionStart = -2;
    private disposed = false;

    constructor(parent: Node, stage: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        REGIONS.forEach((region, i) => {
            const far = this.sprite(REGION_ART[region].backdrop, parent);
            far.setSiblingIndex(i); far.addComponent(UIOpacity);
            const root = new Node(`Parallax-${region}`); root.layer = stage.layer; root.parent = stage;
            root.addComponent(UIOpacity);
            this.layers.push({ far, root, plaza: [], mid: [] });
        });
    }

    get theme(): Region { return REGIONS[this.current]; }

    reset(m: MemeRunnerModel): void {
        this.current = this.previous = regionIndex(m.meters); this.transitionStart = -2;
    }

    layout(width: number, height: number, left: number, right: number): void {
        this.left = left; this.right = right;
        this.layers.forEach((layer, i) => {
            const far = this.frames[REGION_ART[REGIONS[i]].backdrop].originalSize;
            const cover = Math.max(width / far.width, height / far.height); layer.far.setScale(cover, cover, 1);
            const plaza = REGION_ART[REGIONS[i]].plaza;
            const tiles = Math.ceil((right - left) / this.frames[plaza].originalSize.width) + 2;
            while (layer.plaza.length < tiles) {
                const n = this.sprite(plaza, layer.root); n.setSiblingIndex(0);
                n.getComponent(UITransform)!.setAnchorPoint(.5, 0); layer.plaza.push(n);
            }
            while (layer.plaza.length > tiles) { const n = layer.plaza.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
            const count = sceneryCount(left, right);
            while (layer.mid.length < count) {
                const n = this.sprite(REGION_ART[REGIONS[i]].buildings[0], layer.root);
                n.getComponent(UITransform)!.setAnchorPoint(.5, 0); layer.mid.push(n);
            }
            while (layer.mid.length > count) { const n = layer.mid.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
        });
    }

    render(m: MemeRunnerModel, floor: number, cameraY: number): void {
        if (this.disposed) return;
        const next = regionIndex(m.meters);
        if (next !== this.current) {
            this.previous = this.current; this.current = next; this.transitionStart = m.time;
            // Ordering changes only at a transition. Reordering the same far
            // node twice each frame invalidates the whole UI traversal.
            this.layers[this.previous].far.setSiblingIndex(0);
            this.layers[this.current].far.setSiblingIndex(1);
        }
        const t = Math.min(1, Math.max(0, (m.time - this.transitionStart) / 1.2));
        this.layers.forEach((layer, i) => {
            const active = i === this.current || (t < 1 && i === this.previous);
            layer.far.active = layer.root.active = active;
            if (!active) return;
            const opacity = this.current === this.previous ? 1 : i === this.current ? t : 1 - t;
            layer.root.getComponent(UIOpacity)!.opacity = Math.round(opacity * 255);
            layer.far.getComponent(UIOpacity)!.opacity = i === this.current && this.current !== this.previous ? Math.round(t * 255) : 255;
            // The plaza tucks under the road's top edge; the pieces stand on its back part. Both
            // follow the camera exactly: vertical parallax would expose the plaza's lower edge.
            const distance = m.x * .22, base = floor - 4 - cameraY, plaza = REGION_ART[REGIONS[i]].plaza;
            const size = this.frames[plaza].originalSize, first = Math.floor((this.left + distance) / size.width) - 1;
            layer.plaza.forEach((n, k) => n.setPosition((first + k + .5) * size.width - distance, base));
            const setback = Math.round(size.height * PLAZA_SETBACK);
            const placements = runnerScenery(distance, this.left, this.right, REGIONS[i]);
            layer.mid.forEach((n, j) => { const p = placements[j]; this.show(n, p.key); n.setPosition(p.x, base + setback - p.sink); });
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const l of this.layers) {
            l.far.getComponent(Sprite)!.spriteFrame = null;
            for (const s of l.root.getComponentsInChildren(Sprite)) s.spriteFrame = null;
            l.far.destroy(); l.root.destroy(); l.mid.length = 0;
        }
        this.layers.length = 0;
    }

    /** Sprites take their painted frame's own size, so regions may mix building widths. */
    private show(n: Node, key: string): void {
        const sprite = n.getComponent(Sprite)!, frame = this.frames[key];
        if (sprite.spriteFrame === frame) return;
        sprite.spriteFrame = frame; n.getComponent(UITransform)!.setContentSize(frame.originalSize);
    }
    private sprite(key: string, parent: Node): Node {
        const n = new Node(key); n.layer = parent.layer; n.parent = parent; n.addComponent(UITransform);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false;
        this.show(n, key); return n;
    }
}
