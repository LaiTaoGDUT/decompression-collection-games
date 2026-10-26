import { Color, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { REGION_ART, type Region } from './MemeRunnerRegions';

/** A continuous painted front border, independent of safe-stage height and road holes.
 * Its top stays 50 px below the footing. Tall screens uniformly cover-scale the painted
 * border until its base reaches the viewport bottom; horizontal tiling handles the width. */
export class MemeRunnerForeground {
    readonly root: Node;
    private readonly tiles: Node[] = [];
    private bounds = { left: -640, right: 640, bottom: -375 };
    private scale = 1;
    private region = '';
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('RunnerForeground'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform);
    }
    layout(left: number, right: number, bottom: number, floor: number): void {
        this.bounds = { left, right, bottom };
        const size = this.frames['town-foreground'].originalSize;
        this.scale = Math.max(1, (floor - 50 - bottom + 2) / size.height);
        const width = size.width * this.scale, count = Math.ceil((right - left) / width) + 2;
        while (this.tiles.length < count) {
            const n = new Node('ForegroundTile'); n.layer = this.root.layer; n.parent = this.root;
            const t = n.addComponent(UITransform); t.setAnchorPoint(.5, 1); t.setContentSize(this.frames['town-foreground'].originalSize);
            const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false;
            s.spriteFrame = this.frames['town-foreground']; this.tiles.push(n);
        }
        while (this.tiles.length > count) { const n = this.tiles.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
        this.region = '';
    }
    render(x: number, region: Region, floor: number): void {
        const width = this.frames['town-foreground'].originalSize.width * this.scale;
        const distance = x * 1.3, first = Math.floor((this.bounds.left + distance) / width) - 1, top = floor - 50;
        this.tiles.forEach((n, i) => {
            const slot = first + i; n.setPosition((slot + .5) * width - distance, top);
            n.setScale(Math.abs(slot % 2) ? -this.scale : this.scale, this.scale, 1);
        });
        if (this.region === region) return;
        this.region = region;
        for (const n of this.tiles) n.getComponent(Sprite)!.color = new Color(REGION_ART[region].foregroundTint);
    }
    dispose(): void { for (const n of this.tiles) n.getComponent(Sprite)!.spriteFrame = null; this.tiles.length = 0; this.root.destroy(); }
}
