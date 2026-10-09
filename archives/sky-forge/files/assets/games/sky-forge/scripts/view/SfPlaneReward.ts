import { Graphics, Node } from 'cc';
import { unlockText, type PlaneDef } from '../core/SfPlaneDefs';
import type { SfShell } from './SfShell';
import { SfShowcase, showcaseLevel } from './SfShowcase';
import {
    COLORS, blocker, button, cap, color, drawPanel, easeOutBack, easeOutCubic, mixHex, node, opacity, size, text, verticalGradient,
} from './SfUi';

const INTRO = 1.45;
const CONTENT_HEIGHT = 930;

/** 获得机体：金线展开、剪影放大着色、主色放射光、瞄准框收拢，最后展示名称与操作。 */
export class SfPlaneReward {
    readonly root: Node;
    private readonly content: Node;
    private readonly backdrop: Graphics;
    private readonly fx: Graphics;
    private readonly show: Node;
    private readonly showcase: SfShowcase;
    private readonly reveals: { node: Node; at: number; x: number; y: number }[] = [];
    private readonly levels;
    private time = 0;
    private closing = -1;
    private toHangar = false;
    private tinted = false;
    private completed = false;

    constructor(private readonly shell: SfShell, parent: Node, private readonly plane: PlaneDef,
        private readonly onClose: (toHangar: boolean) => void) {
        const ui = shell.ui;
        this.root = node(parent, 'PlaneReward', shell.width, shell.height);
        blocker(this.root, shell.width, shell.height, 0).on(Node.EventType.TOUCH_END, () => {
            if (this.time < INTRO) this.time = INTRO;
        });
        this.backdrop = node(this.root, 'Backdrop').addComponent(Graphics);
        this.content = node(this.root, 'Content', 690, CONTENT_HEIGHT);
        this.layout();
        const panel = this.content.addComponent(Graphics);
        drawPanel(panel, 690, CONTENT_HEIGHT, { fill: '#062234', fillAlpha: 210, border: plane.color, borderAlpha: 160, skew: 16 });
        this.fx = node(this.content, 'Fx').addComponent(Graphics);
        const heading = text(ui, this.content, '获得新机体', 0, 383, { size: 46, color: COLORS.gold, outline: 3 });
        this.reveal(heading.node, 0.08);
        const sub = text(ui, this.content, '新战机已加入机库', 0, 327, { size: 24, color: COLORS.foam });
        this.reveal(sub.node, 0.18);
        this.show = node(this.content, 'Show', 0, 0, 0, 68);
        this.showcase = new SfShowcase(ui, this.show, 2.1);
        this.showcase.trailBoost = 0.38;
        const parts = shell.progress.plane(plane.id).parts;
        this.levels = { main: showcaseLevel(parts.main), wing: showcaseLevel(parts.wing), special: showcaseLevel(parts.special) };
        this.showcase.show(plane.id, this.levels, '#0A1A2A');
        const name = text(ui, this.content, plane.name, 0, -208, { size: 64, color: plane.color, outline: 3 });
        this.reveal(name.node, 0.74);
        const tag = text(ui, this.content, plane.tag, 0, -267, { size: 28, color: COLORS.cream });
        this.reveal(tag.node, 0.84);
        const source = text(ui, this.content, unlockText(plane.unlock), 0, -318, { size: 22, color: COLORS.foam, width: 620, wrap: true });
        this.reveal(source.node, 0.94);
        const buttons = node(this.content, 'Buttons', 0, 0, 0, -403);
        button(ui, buttons, { w: 292, h: 92, x: -160, y: 0, skin: 'dark', label: '关闭', size: 32, sound: 'back', onTap: () => this.close(false) });
        button(ui, buttons, { w: 292, h: 92, x: 160, y: 0, skin: 'gold', label: '前往机库', size: 32, sound: 'confirm', onTap: () => this.close(true) });
        this.reveal(buttons, 1.12);
        opacity(this.root, 0);
        shell.sfx('ui-unlock');
    }

    layout(width = this.shell.width, height = this.shell.height, safeTop = this.shell.safeTop, safeBottom = this.shell.safeBottom): void {
        size(this.root, width, height);
        this.backdrop.clear();
        verticalGradient(this.backdrop, -width / 2, height / 2, width, height, 32,
            k => [mixHex('#03192B', '#010C19', k), 238 + k * 14]);
        const scale = Math.min(1, width / 750, Math.max(1, safeTop - safeBottom - 40) / CONTENT_HEIGHT);
        this.content.setPosition(0, (safeTop + safeBottom) / 2);
        this.content.setScale(scale, scale, 1);
    }

    private reveal(n: Node, at: number): void {
        this.reveals.push({ node: n, at, x: n.position.x, y: n.position.y });
        opacity(n, 0);
    }

    private close(toHangar: boolean): void {
        if (this.closing >= 0) return;
        if (this.time < INTRO) { this.time = INTRO; return; }
        this.toHangar = toHangar;
        this.closing = 0;
    }

    update(dt: number): void {
        if (this.completed) return;
        this.time += dt;
        if (this.closing >= 0) {
            this.closing += dt;
            const k = cap(this.closing / 0.2);
            opacity(this.root, 255 * (1 - k));
            if (k >= 1) {
                this.completed = true;
                this.dispose();
                this.onClose(this.toHangar);
            }
            return;
        }
        const t = this.time, py = 68;
        opacity(this.root, 255 * cap(t / 0.18));
        const grow = 0.35 + 0.65 * easeOutBack(cap((t - 0.15) / 0.4));
        this.show.setScale(grow, grow, 1);
        this.show.setPosition(0, py + (t > INTRO ? Math.sin((t - INTRO) * 2.2) * 7 : 0));
        if (!this.tinted) {
            const tint = cap((t - 0.4) / 0.2);
            this.showcase.show(this.plane.id, this.levels, mixHex('#0A1A2A', '#FFFFFF', tint));
            this.tinted = tint >= 1;
        }
        this.showcase.update(dt, t > 0.4);
        const g = this.fx;
        g.clear();
        const open = easeOutCubic(cap(t / 0.32));
        g.fillColor = color(COLORS.gold, t > INTRO ? 90 : 220);
        g.rect(-300, py + 202 * open, 600, 2);
        g.rect(-300, py - 202 * open, 600, 2);
        g.fill();
        const rays = Math.sin(cap((t - 0.12) / 0.65) * Math.PI);
        if (rays > 0) {
            g.fillColor = color(this.plane.color, rays * 66);
            for (let i = 0; i < 16; i++) {
                const a = i * Math.PI / 8 + t * 0.8;
                g.moveTo(Math.cos(a - 0.07) * 26, py + Math.sin(a - 0.07) * 26);
                g.lineTo(Math.cos(a) * 270, py + Math.sin(a) * 194);
                g.lineTo(Math.cos(a + 0.07) * 26, py + Math.sin(a + 0.07) * 26);
                g.close();
            }
            g.fill();
        }
        if (t > 0.55) {
            const snap = easeOutCubic(cap((t - 0.55) / 0.25));
            const bx = 210 - 24 * snap, by = 186 - 20 * snap;
            g.fillColor = color(this.plane.color, 220);
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                const x = sx * bx, y = py + sy * by;
                g.rect(sx > 0 ? x - 28 : x, y - 2, 28, 4);
                g.rect(x - 2, sy > 0 ? y - 28 : y, 4, 28);
            }
            g.fill();
        }
        const pulse = Math.sin(cap((t - 0.48) / 0.42) * Math.PI);
        g.fillColor = color(this.plane.color, 26 * pulse);
        g.ellipse(0, py, 180, 170);
        g.fill();
        for (let i = 0; i < 20; i++) {
            const phase = (t * 0.32 + i * 0.618) % 1;
            g.fillColor = color(i % 3 ? this.plane.color : COLORS.gold, 115 * Math.sin(phase * Math.PI) * cap(t - 0.6));
            g.rect(-260 + (i * 113 % 520), py - 160 + phase * 330, i % 3 ? 3 : 5, i % 3 ? 8 : 5);
            g.fill();
        }
        for (const r of this.reveals) {
            const k = easeOutCubic(cap((t - r.at) / 0.28));
            opacity(r.node, 255 * k);
            r.node.setPosition(r.x, r.y - (1 - k) * 16);
        }
    }

    dispose(): void {
        if (this.root.isValid) this.root.destroy();
    }
}
