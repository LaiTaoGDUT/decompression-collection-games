import { Graphics, Node, Sprite, UIOpacity } from 'cc';
import type { KitVisual } from '../core/SfKitVisual';
import { color, node, size, sprite, texScale, type UiContext } from './SfUi';

interface Item { node: Node; sprite: Sprite; op: UIOpacity; frame: string; tint: string }

/**
 * 机体套件的机制画面（读 `PlaneKit.visual`）：
 * - 下层 Graphics（子弹之下）：分身光束、激光；
 * - 上层精灵（玩家之下）：分身、护盾晶体、日轮、枪口光球。
 */
export class SfKitView {
    private readonly g: Graphics;
    private readonly items: Item[] = [];
    private used = 0;

    constructor(private readonly ui: UiContext, under: Node, private readonly actors: Node) {
        this.g = under.addComponent(Graphics);
    }

    render(v: KitVisual | undefined, planeId: string, time: number): void {
        const g = this.g;
        g.clear();
        this.used = 0;
        if (v) {
            for (const l of v.links) this.link(l.ax, l.ay, l.bx, l.by, l.width, l.color, time);
            for (const b of v.beams) this.beam(b.ax, b.ay, b.bx, b.by, b.width, b.alpha, b.color, time);
            for (const c of v.clones) {
                // 分身：柔光底 + 染色半透明机体。
                this.put('fx/glow', c.x, c.y, 0, 2.4, 2.4, 110 * c.alpha, c.tint);
                this.put(`plane/${planeId}/body`, c.x, c.y, 0, 1, 1, 170 * c.alpha, c.tint);
            }
            for (const a of v.actors) this.put(a.frame, a.x, a.y, a.angle, a.scale, a.scale, 255 * a.alpha, a.tint);
            for (const o of v.orbs) {
                const pulse = 1 + Math.sin(time * 6 + o.x * 0.05) * 0.08;
                const a = o.ready ? 1 : 0.3;
                this.put('fx/glow', o.x, o.y, 0, o.radius / 16 * pulse, o.radius / 16 * pulse, 150 * a, o.color);
                this.put(o.frame, o.x, o.y, time * 2, o.radius / 16, o.radius / 16, 255 * a, o.ready ? '#FFFFFF' : '#7FA8C0');
            }
            if (v.charge && v.charge.value > 0) {
                const k = v.charge.value;
                const flicker = 1 + Math.sin(time * 30) * 0.06 * k;
                this.put('fx/glow', v.charge.x, v.charge.y, 0, (0.6 + k * 1.6) * flicker, (0.6 + k * 1.6) * flicker, 120 + 120 * k, v.charge.color);
                if (k >= 0.99) {
                    g.strokeColor = color(v.charge.color, 150 + Math.sin(time * 16) * 90);
                    g.lineWidth = 3;
                    g.circle(v.charge.x, v.charge.y, 26 + Math.sin(time * 8) * 4);
                    g.stroke();
                }
            }
        }
        for (let i = this.used; i < this.items.length; i++) if (this.items[i].node.active) this.items[i].node.active = false;
    }

    private link(ax: number, ay: number, bx: number, by: number, width: number, hex: string, time: number): void {
        const g = this.g;
        const segs = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 36));
        for (const [w, hexc, a] of [[width * 2.2, hex, 90], [width, '#FFFFFF', 220]] as [number, string, number][]) {
            g.strokeColor = color(hexc, a);
            g.lineWidth = w;
            g.moveTo(ax, ay);
            for (let i = 1; i < segs; i++) {
                const k = i / segs;
                const wave = Math.sin(time * 24 + i * 1.7) * 6;
                g.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k + wave);
            }
            g.lineTo(bx, by);
            g.stroke();
        }
    }

    /**
     * 激光：外层柔光 → 主色光束 → 白色内芯（宽度高频抖动），再叠沿光束向前流动的亮色能量段，
     * 起点画一圈枪口光斑。像素风画面里光束是少数允许柔光的元素，保持边缘层次清楚。
     */
    private beam(ax: number, ay: number, bx: number, by: number, width: number, alpha: number, hex: string, time: number): void {
        if (alpha <= 0.01) return;
        const g = this.g;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len, uy = (by - ay) / len;
        const wobble = 1 + Math.sin(time * 47 + ax * 0.1) * 0.08;
        for (const [k, hexc, a] of [[2.2, hex, 34], [1.5, hex, 100], [1, hex, 235], [0.42, '#FFFFFF', 255]] as [number, string, number][]) {
            g.strokeColor = color(hexc, a * alpha);
            g.lineWidth = Math.max(1.5, width * k * wobble);
            g.moveTo(ax, ay);
            g.lineTo(bx, by);
            g.stroke();
        }
        // 流动能量段：每 90 像素一段，以 1500 像素/秒向前推进。
        const gap = 90, seg = Math.min(34, gap * 0.4);
        const offset = (time * 1500) % gap;
        g.strokeColor = color('#FFFFFF', 200 * alpha);
        g.lineWidth = Math.max(1, width * 0.7);
        for (let d = offset; d < len; d += gap) {
            const e = Math.min(len, d + seg);
            g.moveTo(ax + ux * d, ay + uy * d);
            g.lineTo(ax + ux * e, ay + uy * e);
        }
        g.stroke();
        g.fillColor = color(hex, 120 * alpha);
        g.circle(ax, ay, width * (1.1 + Math.sin(time * 31) * 0.12));
        g.fill();
        g.fillColor = color('#FFFFFF', 230 * alpha);
        g.circle(ax, ay, width * 0.55);
        g.fill();
    }

    private put(key: string, x: number, y: number, angle: number, sx: number, sy: number, alpha: number, tint: string): void {
        let item = this.items[this.used];
        if (!item) {
            const s = sprite(this.ui, this.actors, key, 10, 10, 0, 0, 'K');
            item = { node: s.node, sprite: s, op: s.node.addComponent(UIOpacity), frame: '', tint: '' };
            this.items.push(item);
        }
        this.used++;
        if (!item.node.active) item.node.active = true;
        if (item.frame !== key) {
            const f = this.ui.frame(key);
            if (f) {
                item.sprite.spriteFrame = f;
                size(item.node, f.originalSize.width * texScale(key), f.originalSize.height * texScale(key));
            }
            item.frame = key;
        }
        if (item.tint !== tint) { item.sprite.color = color(tint); item.tint = tint; }
        item.node.setPosition(x, y);
        item.node.setRotationFromEuler(0, 0, angle * 180 / Math.PI);
        item.node.setScale(sx, sy, 1);
        const a = Math.max(0, Math.min(255, Math.round(alpha)));
        if (item.op.opacity !== a) item.op.opacity = a;
    }

    clear(): void {
        this.g.clear();
        for (const it of this.items) it.node.active = false;
    }
}
