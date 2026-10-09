import { EventTouch, Graphics, Mask, Node } from 'cc';
import { PLANES, unlockText, type PlaneDef } from '../core/SfPlaneDefs';
import type { PlaneId } from '../core/SfTypes';
import type { SfShell } from './SfShell';
import {
    COLORS, blocker, button, cap, color, drawPanel, easeOutCubic, node, num, opacity, pixelSprite, size, sprite, tappable, text,
} from './SfUi';

const DRAWER_W = 560;
const ROW_W = 516;
const ROW_H = 150;
const ROW_GAP = 14;
const HEAD_H = 128;

/**
 * 机库「机体列表」：右侧抽屉，一行一架飞机（大缩略图、名称、类型、等级与战力或解锁条件），上下拖动浏览，带惯性与回弹。
 * 打开时自动滚到当前浏览的机体；当前机体金色描边，出战机体带“出战”角标；点击行关闭抽屉并让机库切到该机体。
 * 点击左侧露出的机库区域或关闭按钮收起抽屉。
 */
export class SfPlaneList {
    readonly root: Node;
    private readonly dim: Node;
    private readonly drawer: Node;
    private readonly view: Node;
    private readonly list: Node;
    private readonly viewH: number;
    private readonly maxScroll: number;
    private scroll = 0;
    private velocity = 0;
    private dragY: number | null = null;
    private dragTime = 0;
    private slide = 1;
    private closing = false;
    private picked?: PlaneId;

    constructor(private readonly shell: SfShell, parent: Node, current: PlaneId,
        private readonly onPick: (id: PlaneId) => void, private readonly onClose: () => void) {
        const ui = shell.ui, progress = shell.progress;
        const w = shell.width, h = shell.height;
        this.root = node(parent, 'PlaneList', w, h);
        this.dim = blocker(this.root, w, h, 150);
        tappable(this.dim, () => this.close(), ui);
        // 抽屉底板铺满屏幕高度（背景允许越过安全区），内容只排在胶囊下方与底部安全区之间。
        this.drawer = node(this.root, 'Drawer', DRAWER_W, h, w / 2 - DRAWER_W / 2, 0);
        blocker(this.drawer, DRAWER_W, h, 0);
        const bg = this.drawer.addComponent(Graphics);
        bg.fillColor = color(COLORS.deep, 246);
        bg.rect(-DRAWER_W / 2, -h / 2, DRAWER_W, h);
        bg.fill();
        bg.fillColor = color(COLORS.foam, 200);
        bg.rect(-DRAWER_W / 2, -h / 2, 4, h);
        bg.fill();
        bg.fillColor = color(COLORS.foam, 40);
        bg.rect(-DRAWER_W / 2 + 4, -h / 2, 10, h);
        bg.fill();

        const headY = shell.safeTop - HEAD_H / 2;
        const owned = PLANES.filter(p => progress.plane(p.id).owned).length;
        text(ui, this.drawer, '机体列表', -DRAWER_W / 2 + 36, headY + 16, { size: 40, color: COLORS.cream, align: 'left' });
        text(ui, this.drawer, `已拥有 ${owned} / ${PLANES.length}`, -DRAWER_W / 2 + 36, headY - 28, { size: 22, color: COLORS.foam, align: 'left' });
        button(ui, this.drawer, { w: 70, h: 64, x: DRAWER_W / 2 - 58, y: headY + 2, skin: 'red', label: '✕', size: 30, sound: 'back', onTap: () => this.close() });
        const rule = node(this.drawer, 'Rule').addComponent(Graphics);
        rule.fillColor = color(COLORS.foam, 70);
        rule.rect(-DRAWER_W / 2 + 24, shell.safeTop - HEAD_H, DRAWER_W - 48, 2);
        rule.fill();

        // 可拖动的列表区域（Mask 裁切）。
        const viewTop = shell.safeTop - HEAD_H - 4, viewBottom = shell.safeBottom;
        this.viewH = viewTop - viewBottom;
        this.view = node(this.drawer, 'View', DRAWER_W, this.viewH, 0, (viewTop + viewBottom) / 2);
        this.view.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.list = node(this.view, 'List');
        const contentH = PLANES.length * (ROW_H + ROW_GAP) + ROW_GAP;
        this.maxScroll = Math.max(0, contentH - this.viewH);
        // 捕获阶段监听：行会阻止冒泡，从行上开始拖动也能滚动（行自身按位移判断是否算点击）。
        this.view.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            this.dragY = e.getUILocation().y;
            this.dragTime = Date.now();
            this.velocity = 0;
        }, this, true);
        this.view.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (this.dragY === null) return;
            const y = e.getUILocation().y, now = Date.now();
            const dy = y - this.dragY;
            // 越界时阻尼拖动，松手后回弹。
            const over = this.scroll < 0 || this.scroll > this.maxScroll;
            this.scroll += over ? dy * 0.4 : dy;
            const dt = Math.max(1, now - this.dragTime) / 1000;
            this.velocity = this.velocity * 0.3 + (dy / dt) * 0.7;
            this.dragY = y;
            this.dragTime = now;
        }, this, true);
        const release = () => {
            if (this.dragY !== null && Date.now() - this.dragTime > 80) this.velocity = 0;
            this.dragY = null;
        };
        this.view.on(Node.EventType.TOUCH_END, release, this, true);
        this.view.on(Node.EventType.TOUCH_CANCEL, release, this, true);

        PLANES.forEach((p, i) => this.buildRow(p, i, current));
        // 打开时让当前机体所在行处于视口中部。
        const index = Math.max(0, PLANES.findIndex(p => p.id === current));
        this.scroll = cap(index * (ROW_H + ROW_GAP) + ROW_GAP + ROW_H / 2 - this.viewH / 2, 0, this.maxScroll);
        this.list.setPosition(0, this.scroll);
        opacity(this.dim, 0);
        this.drawer.setPosition(w / 2 + DRAWER_W / 2, 0);
    }

    private buildRow(p: PlaneDef, i: number, current: PlaneId): void {
        const shell = this.shell, ui = shell.ui, progress = shell.progress;
        const save = progress.plane(p.id);
        const has = save.owned;
        const active = p.id === current;
        const flying = p.id === progress.data.selected;
        const y = this.viewH / 2 - ROW_GAP - ROW_H / 2 - i * (ROW_H + ROW_GAP);
        const row = node(this.list, `Plane-${p.id}`, ROW_W, ROW_H, 0, y);
        const g = row.addComponent(Graphics);
        drawPanel(g, ROW_W, ROW_H, {
            fill: has ? '#0B3049' : '#111B25', fillAlpha: 240,
            border: active ? COLORS.gold : has ? p.color : '#45596A', borderAlpha: active ? 255 : has ? 150 : 110,
            accent: has ? p.color : '#45596A', skew: 10, corners: active,
        });
        // 缩略图：主色斜切底块 + 光晕，未拥有时压暗为剪影。
        const tx = -ROW_W / 2 + 92;
        g.fillColor = color(has ? p.color : '#2A3A48', has ? 52 : 34);
        g.circle(tx, 0, 62);
        g.fill();
        g.fillColor = color(has ? p.color : '#2A3A48', has ? 26 : 18);
        g.circle(tx, 0, 74);
        g.fill();
        const body = sprite(ui, row, `plane/${p.id}/body`, 10, 10, tx, 0, 'Body');
        const f = body.spriteFrame;
        if (f) {
            const s = Math.min(1, 126 / Math.max(f.originalSize.width, f.originalSize.height));
            size(body.node, Math.round(f.originalSize.width * s), Math.round(f.originalSize.height * s));
        }
        body.color = color(has ? '#FFFFFF' : '#1C2C44');
        if (!has) pixelSprite(ui, row, 'icon/lock', 1.2, tx, 0, 'Lock');

        // 文字区：名称、类型标签、等级与战力 / 解锁条件。
        const lx = -ROW_W / 2 + 180;
        text(ui, row, p.name, lx, 38, { size: 36, color: has ? COLORS.cream : COLORS.grey, align: 'left' });
        const pill = node(row, 'Pill', 0, 0, lx + 62, -4).addComponent(Graphics);
        pill.fillColor = color(has ? p.color : '#3A4C58', has ? 230 : 200);
        pill.moveTo(-58, 14); pill.lineTo(66, 14); pill.lineTo(58, -14); pill.lineTo(-66, -14); pill.close();
        pill.fill();
        text(ui, row, p.tag, lx + 62, -4, { size: 20, color: has ? COLORS.ink : COLORS.grey, shadow: false });
        const footY = -44;
        if (!p.implemented) {
            text(ui, row, '研发中', lx, footY, { size: 22, color: COLORS.grey, align: 'left' });
        } else if (has) {
            text(ui, row, `Lv.${save.level}`, lx, footY, { size: 24, color: COLORS.foam, align: 'left' });
            text(ui, row, '战力', lx + 96, footY, { size: 20, color: '#9CC4D2', align: 'left', bold: false });
            num(ui, row, String(progress.power(p.id)), lx + 146, footY, { size: 24, color: '#FF8A7A', align: 'left' });
        } else if (p.unlock.type === 'gold') {
            pixelSprite(ui, row, 'icon/coin', 0.8, lx + 12, footY, 'Coin');
            num(ui, row, String(p.unlock.value), lx + 34, footY, { size: 26, color: COLORS.gold, align: 'left' });
        } else {
            text(ui, row, unlockText(p.unlock), lx, footY, { size: 20, color: COLORS.gold, align: 'left' });
        }
        if (flying) {
            g.fillColor = color(COLORS.gold);
            g.moveTo(ROW_W / 2 - 88, ROW_H / 2); g.lineTo(ROW_W / 2, ROW_H / 2); g.lineTo(ROW_W / 2, ROW_H / 2 - 46); g.close();
            g.fill();
            text(ui, row, '出战', ROW_W / 2 - 28, ROW_H / 2 - 16, { size: 18, color: COLORS.ink, shadow: false }).node.angle = -28;
        }
        tappable(row, () => {
            if (this.closing) return;
            this.picked = p.id;
            this.close();
        }, ui);
        // 行依次从右侧滑入。
        opacity(row, 0);
        shell.tweens.add(0.24, t => {
            if (!row.isValid) return;
            opacity(row, 255 * t);
            row.setPosition(60 * (1 - easeOutCubic(t)), y);
        }, { delay: 0.08 + Math.min(i, 8) * 0.03 });
    }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        this.slide = 0;
    }

    update(dt: number): void {
        if (!this.root.isValid) return;
        // 惯性滚动与越界回弹。
        if (this.dragY === null) {
            if (this.scroll < 0 || this.scroll > this.maxScroll) {
                const edge = this.scroll < 0 ? 0 : this.maxScroll;
                this.scroll += (edge - this.scroll) * Math.min(1, dt * 14);
                this.velocity *= 0.5;
                if (Math.abs(edge - this.scroll) < 0.5) this.scroll = edge;
            } else if (Math.abs(this.velocity) > 5) {
                this.scroll += this.velocity * dt;
                this.velocity *= Math.exp(-dt * 4.5);
            } else {
                this.velocity = 0;
            }
        }
        this.list.setPosition(0, this.scroll);
        // 抽屉从右侧滑入 / 滑出，左侧遮罩同步淡入淡出。
        const w = this.shell.width;
        if (this.closing) {
            this.slide = Math.min(1, this.slide + dt / 0.22);
            const k = easeOutCubic(this.slide);
            this.drawer.setPosition(w / 2 - DRAWER_W / 2 + DRAWER_W * k, 0);
            opacity(this.dim, 255 * (1 - k));
            if (this.slide >= 1) {
                this.root.destroy();
                this.onClose();
                if (this.picked) this.onPick(this.picked);
            }
        } else if (this.slide > 0) {
            this.slide = Math.max(0, this.slide - dt / 0.28);
            const k = easeOutCubic(1 - this.slide);
            this.drawer.setPosition(w / 2 - DRAWER_W / 2 + DRAWER_W * (1 - k), 0);
            opacity(this.dim, 255 * k);
        }
    }
}
