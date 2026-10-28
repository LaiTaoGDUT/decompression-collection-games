import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerModel } from './MemeRunnerModel';
import { REGION_ART, REGIONS, regionIndex, type Region } from './MemeRunnerRegions';

/** One depth plane: a complete town painting covers the screen without stretching.
 * Two plates overlap only during the region dissolve. */
export class MemeRunnerWorld {
    private readonly plates: Node[] = [];
    private current = 0;
    private previous = 0;
    private transitionStart = -2;
    private disposed = false;

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        for (const region of REGIONS) {
            const frame = frames[REGION_ART[region].sky];
            const n = new Node(`Background-${region}`); n.layer = parent.layer; n.parent = parent;
            n.addComponent(UITransform).setContentSize(frame.originalSize);
            const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame;
            n.addComponent(UIOpacity); n.setSiblingIndex(this.plates.length); this.plates.push(n);
        }
    }
    get theme(): Region { return REGIONS[this.current]; }
    reset(m: MemeRunnerModel): void {
        this.current = this.previous = regionIndex(m.meters); this.transitionStart = -2;
    }
    layout(width: number, height: number): void {
        this.plates.forEach((n, i) => {
            const size = this.frames[REGION_ART[REGIONS[i]].sky].originalSize;
            const cover = Math.max(width / size.width, height / size.height); n.setScale(cover, cover, 1);
        });
    }
    render(m: MemeRunnerModel): void {
        if (this.disposed) return;
        const next = regionIndex(m.meters);
        if (next !== this.current) {
            this.previous = this.current; this.current = next; this.transitionStart = m.time;
            this.plates[this.previous].setSiblingIndex(0); this.plates[this.current].setSiblingIndex(1);
        }
        const t = Math.min(1, Math.max(0, (m.time - this.transitionStart) / 1.2));
        this.plates.forEach((n, i) => {
            n.active = i === this.current || (t < 1 && i === this.previous);
            n.getComponent(UIOpacity)!.opacity = i === this.current && this.current !== this.previous ? Math.round(t * 255) : 255;
        });
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const n of this.plates) { n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
        this.plates.length = 0;
    }
}
