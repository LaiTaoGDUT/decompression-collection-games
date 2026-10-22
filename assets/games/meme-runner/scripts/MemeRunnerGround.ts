import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { V38_ART } from './MemeRunnerArtV38';
import { REGION_ART, type Region } from './MemeRunnerRegions';

/** The region's felt road: a seamless tile whose top edge is the running surface, over an opaque base. */
export class MemeRunnerGround {
    readonly root: Node;
    readonly tiles: Node[] = [];
    private readonly base: Graphics;
    private bounds = { left: 0, right: 0, bottom: 0 };
    private floor = 0;
    private region = '';
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('ContinuousGround'); this.root.layer = parent.layer; this.root.parent = parent;
        const base = new Node('RoadDepth'); base.layer = parent.layer; base.parent = this.root; this.base = base.addComponent(Graphics);
    }
    private get size(): [number, number] { return V38_ART['ground-street'].size; }
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
    render(x: number, region: Region): void {
        const [width, height] = this.size, first = Math.floor((this.bounds.left + x) / width) - 1;
        this.tiles.forEach((n, i) => n.setPosition((first + i + .5) * width - x, this.floor - height / 2));
        if (this.region === region) return;
        this.region = region;
        for (const n of this.tiles) n.getComponent(Sprite)!.spriteFrame = this.frames[`ground-${region}`];
        const { left, right, bottom } = this.bounds;
        this.base.clear(); this.base.fillColor = new Color(REGION_ART[region].groundBase);
        this.base.rect(left - 2, bottom - 2, right - left + 4, this.floor - height - bottom + 6); this.base.fill();
    }
    dispose(): void {
        this.tiles.forEach(n => { n.getComponent(Sprite)!.spriteFrame = null; }); this.tiles.length = 0; this.root.destroy();
    }
}
