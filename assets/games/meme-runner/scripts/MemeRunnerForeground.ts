import { Color, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { REGION_ART, type Region } from './MemeRunnerRegions';

const PROPS = ['fg-0', 'fg-1', 'fg-2'];
const STEP = 760, PARALLAX = 1.3;

/** Sparse dark foreground props in front of the road, faster than the street. They stay below the
 * running surface, so they never hide a hazard or the runner's footing. */
export class MemeRunnerForeground {
    readonly root: Node;
    private readonly props: Node[] = [];
    private bounds = { left: -640, right: 640, bottom: -375 };
    private region = '';

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('RunnerForeground'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform);
    }

    layout(left: number, right: number, bottom: number): void {
        this.bounds = { left, right, bottom };
        const count = Math.ceil((right - left) / STEP) + 2;
        while (this.props.length < count) {
            const n = new Node('ForegroundProp'); n.layer = this.root.layer; n.parent = this.root;
            n.addComponent(UITransform).setAnchorPoint(.5, 0);
            const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; this.props.push(n);
        }
        while (this.props.length > count) { const n = this.props.pop()!; n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); }
        this.region = '';
    }

    render(x: number, region: Region, floor: number): void {
        const distance = x * PARALLAX, first = Math.floor((this.bounds.left + distance) / STEP) - 1;
        const tint = this.region === region ? undefined : new Color(REGION_ART[region].foregroundTint);
        this.region = region;
        this.props.forEach((n, i) => {
            const slot = first + i, hash = ((slot * 2654435761) >>> 0) % 97;
            // About two slots in three carry a prop; the rest leave the corner open.
            n.active = hash % 3 !== 0;
            if (!n.active) return;
            const s = n.getComponent(Sprite)!, frame = this.frames[PROPS[hash % PROPS.length]];
            if (s.spriteFrame !== frame) { s.spriteFrame = frame; n.getComponent(UITransform)!.setContentSize(frame.originalSize); }
            if (tint) s.color = tint;
            const height = frame.originalSize.height;
            // The top sits just under the running surface; the rest falls off the screen's bottom edge.
            n.setPosition(slot * STEP - distance + STEP / 2 + (hash % 5) * 30, floor - 6 - height);
        });
        if (tint) for (const n of this.props) n.getComponent(Sprite)!.color = tint;
    }

    dispose(): void { for (const n of this.props) n.getComponent(Sprite)!.spriteFrame = null; this.props.length = 0; this.root.destroy(); }
}
