import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { Bubble, Point } from './BubbleShooterModel';

interface Particle { node: Node; x: number; y: number; vx: number; vy: number; spin: number; age: number; life: number; }
/** Bounded decorative particles never alter board state or use background timers. */
export class BubbleShooterParticles {
    private active: Particle[] = [];
    private pool: Node[] = [];
    constructor(private readonly parent: Node, private readonly frames: ReadonlyMap<string, SpriteFrame>) {}
    get count(): number { return this.active.length; }
    burst(bubble: Bubble, point: Point, frost = false): void {
        const count = frost ? 4 : 3;
        for (let i = 0; i < count && this.active.length < 64; i++) {
            const key = frost ? `frost-${1 + i % 7}` : `shard-${bubble.color}-${1 + i % 2}`;
            const frame = this.frames.get(key); if (!frame) continue;
            const node = this.pool.pop() ?? this.create(); node.active = true;
            node.setSiblingIndex(this.parent.children.length - 1);
            const sprite = node.getComponent(Sprite)!; sprite.spriteFrame = frame;
            const size = frost ? 22 : 18, ratio = size / Math.max(frame.rect.width, frame.rect.height);
            node.getComponent(UITransform)!.setContentSize(frame.rect.width * ratio, frame.rect.height * ratio);
            node.setPosition(point.x, point.y); node.setScale(1, 1, 1); node.angle = i * 83;
            node.getComponent(UIOpacity)!.opacity = 255;
            const variation = ((bubble.row ?? 0) * 17 + (bubble.col ?? 0) * 31 + i * 13) % 23 / 23;
            const angle = (i / count * 2 + variation * .3) * Math.PI;
            this.active.push({ node, x: point.x, y: point.y, vx: Math.cos(angle) * (135 + variation * 75),
                vy: 45 + Math.sin(angle) * (140 + variation * 65), spin: i % 2 ? 220 : -180, age: 0, life: .42 + i * .025 });
        }
    }
    update(dt: number): void {
        const remaining: Particle[] = [];
        this.active.forEach(p => {
            p.age += dt; const t = Math.min(1, p.age / p.life);
            if (t >= 1) { this.recycle(p.node); return; }
            p.node.setPosition(p.x + p.vx * p.age, p.y + p.vy * p.age - 360 * p.age * p.age);
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
        node.addComponent(UIOpacity); return node;
    }
}
