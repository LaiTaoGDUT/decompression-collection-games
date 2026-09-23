import { Color, Graphics, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { Bubble, Point } from './BubbleShooterModel';

interface Particle { node: Node; x: number; y: number; vx: number; vy: number; spin: number; age: number; life: number; gravity: number; }
/** Bounded decorative particles never alter board state or use background timers. */
export class BubbleShooterParticles {
    theme: 'cloud' | 'ocean' = 'cloud';
    private active: Particle[] = [];
    private pool: Node[] = [];
    constructor(private readonly parent: Node, private readonly frames: ReadonlyMap<string, SpriteFrame>) {}
    get count(): number { return this.active.length; }
    burst(bubble: Bubble, point: Point, frost = false): void {
        const ocean = this.theme === 'ocean' && !frost;
        const count = ocean ? 8 : 5;
        for (let i = 0; i < count && this.active.length < 64; i++) {
            const key = frost ? `frost-${1 + i % 7}` : `shard-${bubble.color}-${1 + i % 2}`;
            const water = ocean && i >= 5;
            const frame = this.frames.get(key); if (!water && !frame) continue;
            const node = this.pool.pop() ?? this.create(); node.active = true;
            node.setSiblingIndex(this.parent.children.length - 1);
            const sprite = node.getComponent(Sprite)!; sprite.spriteFrame = frame ?? null;
            sprite.enabled=!water;
            // Separate renderers: Sprite and Graphics cannot share one UI render node.
            const waterNode = node.getChildByName('Water');
            const ink = waterNode!.getComponent(Graphics)!; waterNode!.active = water; ink.clear();
            if(water){ink.lineWidth=2.5;ink.strokeColor=new Color(190,250,255,255);ink.fillColor=new Color(65,190,235,150);ink.circle(0,0,7+i%3);ink.fill();ink.stroke();
                ink.fillColor=new Color(230,255,255,220);ink.circle(-2,3,1.5);ink.fill();}
            const size = frost ? 22 : (ocean ? 20 : 14) + i % 3 * 4;
            const width=frame?.rect.width??size,height=frame?.rect.height??size,ratio=size/Math.max(width,height);
            node.getComponent(UITransform)!.setContentSize(width * ratio, height * ratio);
            node.setPosition(point.x, point.y); node.setScale(1, 1, 1); node.angle = i * 83;
            node.getComponent(UIOpacity)!.opacity = 255;
            const variation = ((bubble.row ?? 0) * 17 + (bubble.col ?? 0) * 31 + i * 13) % 23 / 23;
            const angle = (i / count * 2 + variation * .3) * Math.PI;
            this.active.push({ node, x: point.x, y: point.y, vx: Math.cos(angle) * (135 + variation * 75),
                vy: 45 + Math.sin(angle) * (140 + variation * 65), spin: water ? 0 : i % 2 ? 220 : -180, age: 0, life: (water ? .62 : .46) + i * .025, gravity: water ? -70 : 360 });
        }
    }
    update(dt: number): void {
        const remaining: Particle[] = [];
        this.active.forEach(p => {
            p.age += dt; const t = Math.min(1, p.age / p.life);
            if (t >= 1) { this.recycle(p.node); return; }
            p.node.setPosition(p.x + p.vx * p.age, p.y + p.vy * p.age - p.gravity * p.age * p.age);
            p.node.angle += p.spin * dt; p.node.setScale(1 - .45 * t, 1 - .45 * t, 1);
            p.node.getComponent(UIOpacity)!.opacity = 255 * Math.min(1, (1 - t) / .72); remaining.push(p);
        });
        this.active = remaining;
    }
    clear(): void { this.active.forEach(p => this.recycle(p.node)); this.active = []; }
    dispose(): void { this.clear(); this.pool.forEach(n => n.destroy()); this.pool = []; }
    private recycle(node: Node): void {
        node.active = false; node.getComponent(Sprite)!.spriteFrame = null; this.pool.push(node);
    }
    private create(): Node {
        const node = new Node('CandyFragment'); node.layer = this.parent.layer; node.setParent(this.parent);
        node.addComponent(UITransform); const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.addComponent(UIOpacity);
        const water = new Node('Water'); water.layer = node.layer; water.setParent(node);
        water.addComponent(UITransform); water.addComponent(Graphics); water.active = false;
        return node;
    }
}
