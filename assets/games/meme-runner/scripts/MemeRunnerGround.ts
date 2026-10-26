import { Color, Graphics, Mask, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { V48_ART } from './MemeRunnerArtV48';
import { REGION_ART, type Region } from './MemeRunnerRegions';

/** The region's felt road: a seamless tile whose top edge is the running surface, over an opaque base.
 * Pits are cut out of both by an inverted stencil, so the full-screen background shows through them. */
export class MemeRunnerGround {
    readonly root: Node;
    readonly tiles: Node[] = [];
    private readonly base: Graphics;
    private readonly cutouts: Graphics;
    private bounds = { left: 0, right: 0, bottom: 0 };
    private floor = 0;
    private region = '';
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('ContinuousGround'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform);
        const mask = this.root.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL; mask.inverted = true;
        this.cutouts = this.root.getComponent(Graphics)!;
        const base = new Node('RoadDepth'); base.layer = parent.layer; base.parent = this.root; this.base = base.addComponent(Graphics);
    }
    private get size(): [number, number] { return V48_ART['town-road'].size; }
    layout(left: number, right: number, bottom: number, floor: number): void {
        this.bounds = { left, right, bottom }; this.floor = floor;
        const [width, height] = this.size, count = Math.ceil((right - left) / width) + 2;
        while (this.tiles.length < count) {
            const n = new Node(`FeltRoad-${this.tiles.length}`); n.layer = this.root.layer; n.parent = this.root;
            n.addComponent(UITransform).setContentSize(width, height);
            const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; this.tiles.push(n);
        }
        while (this.tiles.length > count) { const n = this.tiles.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
        this.region = '';
    }
    /** `pits` are [left, width] spans in stage coordinates. */
    render(x: number, region: Region, pits: ReadonlyArray<readonly [number, number]>): void {
        const [width, height] = this.size, first = Math.floor((this.bounds.left + x) / width) - 1;
        this.tiles.forEach((n, i) => {
            const slot = first + i; n.setPosition((slot + .5) * width - x, this.floor - height / 2);
            n.setScale(Math.abs(slot % 2) ? -1 : 1, 1, 1);
        });
        const g = this.cutouts; g.clear(); g.fillColor = Color.WHITE;
        // The cut reaches above the road's fuzzy top edge and below the screen's bottom.
        for (const [left, span] of pits) g.rect(left, this.bounds.bottom - 4, span, this.floor - this.bounds.bottom + 16);
        if (pits.length) g.fill();
        if (this.region === region) return;
        this.region = region;
        for (const n of this.tiles) n.getComponent(Sprite)!.spriteFrame = this.frames['town-road'];
        const { left, right, bottom } = this.bounds;
        this.base.clear(); this.base.fillColor = new Color(REGION_ART[region].groundBase);
        this.base.rect(left - 2, bottom - 2, right - left + 4, this.floor - height - bottom + 6); this.base.fill();
    }
    dispose(): void {
        this.tiles.forEach(n => { n.getComponent(Sprite)!.spriteFrame = null; }); this.tiles.length = 0; this.root.destroy();
    }
}
