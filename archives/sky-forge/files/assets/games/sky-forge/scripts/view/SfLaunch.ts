import { Graphics, Node } from 'cc';
import type { SlotId } from '../core/SfBalance';
import type { PlaneId } from '../core/SfTypes';
import type { SfShell } from './SfShell';
import { HANGAR_PAD_Y, SfShowcase } from './SfShowcase';
import { COLORS, blocker, button, cap, color, coverSprite, drawPanel, easeInCubic, easeOutCubic, node, opacity, sprite, text } from './SfUi';

type Phase = 'warmup' | 'takeoff' | 'open' | 'failed' | 'done';
const WARMUP = 0.3;
const TAKEOFF = 0.8;
const OPEN_TIME = 0.16;

/** 起飞台点火 → 飞机加速离台 → 直接显露关卡，由战斗画面完成底部入场。 */
export class SfLaunch {
    readonly root: Node;
    private readonly takeoff: SfShowcase;
    private readonly failNode: Node;
    private readonly padY: number;
    private phase: Phase = 'warmup';
    private t = 0;
    private ready: boolean;
    private prepareStarted = false;

    constructor(private readonly shell: SfShell, parent: Node, plane: PlaneId, levels: Record<SlotId, number>,
        private readonly handlers: { prepare?: () => void; enter: () => void; done: () => void; back: () => void }) {
        const ui = shell.ui, w = shell.width, h = shell.height;
        this.ready = !handlers.prepare;
        this.root = node(parent, 'Launch', w, h);
        blocker(this.root, w, h, 255, '#04182A');
        const scene = node(this.root, 'TakeoffPad', w, h);
        const bg = sprite(ui, scene, 'bg/hangar', 10, 10, 0, 0, 'Bg');
        this.padY = HANGAR_PAD_Y * coverSprite(bg, w, h);
        const shade = node(scene, 'Shade').addComponent(Graphics);
        shade.fillColor = color('#04182A', 70);
        shade.rect(-w / 2, -h / 2, w, h);
        shade.fill();
        this.takeoff = new SfShowcase(ui, scene, 2);
        this.takeoff.show(plane, levels);
        this.takeoff.root.setPosition(0, this.padY);

        // 仅恢复失败时显示操作入口；正常出击没有加载页、进度条或穿云场景。
        const midY = (shell.safeTop + shell.safeBottom) / 2;
        this.failNode = node(this.root, 'RestoreFailed', 0, 0, 0, midY);
        drawPanel(this.failNode.addComponent(Graphics), 560, 260, { corners: true, accent: COLORS.red, fillAlpha: 245 });
        text(ui, this.failNode, '航程恢复中断', 0, 70, { size: 34, color: COLORS.cream });
        button(ui, this.failNode, { w: 220, h: 84, x: -125, y: -60, skin: 'green', label: '重试', size: 34, onTap: () => this.onRetry() });
        button(ui, this.failNode, { w: 220, h: 84, x: 125, y: -60, skin: 'dark', label: '回机库', size: 34, sound: 'back', onTap: () => handlers.back() });
        this.failNode.active = false;
    }

    /** 无尽状态准备好后再离台，恢复过程与点火并行。 */
    prepared(): void { if (this.phase === 'warmup') this.ready = true; }

    fail(): void {
        if (this.phase === 'done') return;
        this.phase = 'failed';
        this.failNode.active = true;
    }

    private onRetry(): void {
        this.failNode.active = false;
        this.phase = 'warmup';
        this.t = 0;
        this.ready = !this.handlers.prepare;
        this.prepareStarted = false;
    }

    update(dt: number): void {
        if (this.phase === 'done' || this.phase === 'failed') return;
        this.t += dt;
        if (this.phase === 'warmup') {
            if (!this.prepareStarted) {
                this.prepareStarted = true;
                this.handlers.prepare?.();
            }
            if (this.ready && this.t >= WARMUP) {
                this.phase = 'takeoff';
                this.t = 0;
            }
        } else if (this.phase === 'takeoff' && this.t >= TAKEOFF) {
            this.phase = 'open';
            this.t = 0;
            this.handlers.enter();
        } else if (this.phase === 'open') {
            opacity(this.root, 255 * (1 - easeOutCubic(cap(this.t / OPEN_TIME))));
            if (this.t >= OPEN_TIME) {
                this.phase = 'done';
                this.handlers.done();
            }
            return;
        }

        const rise = this.phase === 'warmup' ? 0 : this.phase === 'open' ? 1 : easeInCubic(cap(this.t / TAKEOFF));
        const shake = this.phase === 'warmup' ? Math.sin(this.t * 90) * 3 : 0;
        const scale = 1 + rise * 0.3;
        this.takeoff.root.setPosition(shake, this.padY + rise * (this.shell.height / 2 + 260 - this.padY));
        this.takeoff.root.setScale(scale, scale, 1);
        this.takeoff.trailBoost = 1 + rise * 3;
        this.takeoff.update(dt);
    }

    dispose(): void {
        this.phase = 'done';
        this.root.destroy();
    }
}
