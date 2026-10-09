import { Graphics, Node, Sprite } from 'cc';
import { SLOTS, type SlotId } from '../core/SfBalance';
import { PLANE_ART, partCenterY } from '../core/SfPlaneArt';
import { PLANE_BY_ID } from '../core/SfPlaneDefs';
import type { PlaneId } from '../core/SfTypes';
import { color, node, size, sprite, type UiContext } from './SfUi';

/**
 * 菜单里的展示飞机（机库、起飞转场）：机体 + 已改装的零件 + 发动机与翼尖尾迹。
 * 坐标以机体中心为原点，scale 为整体放大倍数（像素素材 1:1 存储）。
 */
export class SfShowcase {
    readonly root: Node;
    private readonly trails: Graphics;
    private readonly body: Sprite;
    private readonly parts: Record<SlotId, Sprite[]>;
    private plane: PlaneId = 'vanguard';
    private time = 0;
    /** 尾迹长度倍率：起飞时拉长。 */
    trailBoost = 1;

    constructor(private readonly ui: UiContext, parent: Node, private readonly scale: number) {
        this.root = node(parent, 'Showcase');
        this.trails = node(this.root, 'Trails').addComponent(Graphics);
        this.body = sprite(ui, this.root, 'plane/vanguard/body', 10, 10, 0, 0, 'Body');
        this.parts = { main: [], wing: [], special: [] };
        for (const slot of SLOTS) {
            for (let i = 0; i < 2; i++) this.parts[slot].push(sprite(ui, this.root, 'plane/vanguard/main-1', 10, 10, 0, 0, `${slot}${i}`));
        }
    }

    /** levels：每个挂点显示的零件级数（0 = 不显示）。 */
    show(plane: PlaneId, levels: Record<SlotId, number>, tint = '#FFFFFF'): void {
        this.plane = plane;
        const k = this.scale;
        const body = this.ui.frame(`plane/${plane}/body`);
        this.body.spriteFrame = body ?? null;
        if (body) size(this.body.node, body.originalSize.width * k, body.originalSize.height * k);
        this.body.color = color(tint);
        const art = PLANE_ART[plane];
        for (const slot of SLOTS) {
            const f = levels[slot] > 0 ? this.ui.frame(`plane/${plane}/${slot}-${Math.min(3, levels[slot])}`) : undefined;
            const m = art?.[slot] ?? [20, 0];
            const under = art?.fit[slot][1] ?? false;
            this.parts[slot].forEach((s, i) => {
                const side = i === 0 ? -1 : 1;
                s.node.active = !!f;
                if (!f) return;
                s.spriteFrame = f;
                size(s.node, f.originalSize.width * k, f.originalSize.height * k);
                s.node.setPosition(m[0] * side * k, partCenterY(plane, slot, f.originalSize.height) * k);
                s.node.setScale(side, 1, 1);
                s.color = color(tint);
                // 压在机体下层的零件排在机体之前（尾迹 Graphics 始终在最底层）。
                s.node.setSiblingIndex(under ? 1 : this.root.children.length - 1);
            });
        }
    }

    update(dt: number, visible = true): void {
        this.time += dt;
        const g = this.trails;
        g.clear();
        const art = PLANE_ART[this.plane];
        if (!art || !visible) return;
        const k = this.scale, w = art.size[0] * k, h = art.size[1] * k;
        const tone = PLANE_BY_ID[this.plane].color;
        const boost = this.trailBoost;
        // 发动机：主色宽流 + 白色细芯，长度轻微抖动。
        const engineLen = (150 + Math.sin(this.time * 17) * 10) * boost;
        // 每个喷口一条尾焰（喷口位置来自 PLANE_ART.nozzles）。
        const wide = art.nozzles.length > 1 ? 9 : 12;
        for (const [nx, ny] of art.nozzles) {
            this.streak(g, nx * k, ny * k, engineLen, wide * k / 2, tone, 150);
            this.streak(g, nx * k, ny * k, engineLen * 0.8, 3 * k / 2, '#FFFFFF', 200);
        }
        // 翼尖水汽：两条细白线。
        for (const side of [-1, 1]) {
            const len = (230 + Math.sin(this.time * 9 + side) * 14) * boost;
            this.streak(g, side * w * 0.44, -h * 0.12, len, 3, '#FFFFFF', 130);
        }
    }

    private streak(g: Graphics, x: number, y: number, len: number, width: number, hex: string, alpha: number): void {
        const steps = 12;
        for (let i = 0; i < steps; i++) {
            const a = 1 - i / steps;
            g.fillColor = color(hex, alpha * a * a);
            const wv = width * (0.5 + a * 0.5);
            g.rect(x - wv / 2, y - (i + 1) * len / steps, wv, len / steps + 1);
            g.fill();
        }
    }
}

/** 机库背景里起飞台圆环中心相对图片中心的偏移（图片像素，向上为正）；乘以背景 cover 倍数得到设计坐标。 */
export const HANGAR_PAD_Y = 41.5;

/** 改装等级 → 展示用零件外形（1～3 级）。 */
export function showcaseLevel(partLevel: number): number {
    return Math.min(3, 1 + Math.floor((partLevel - 1) / 3));
}
