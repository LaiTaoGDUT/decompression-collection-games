import { Graphics, Label, Node, UITransform } from 'cc';
import type { PlaneDef } from '../core/SfPlaneDefs';
import { MAX_PART_LEVEL, SLOTS, type SlotId } from '../core/SfBalance';
import type { SfShell } from './SfShell';
import { SfShowcase, showcaseLevel } from './SfShowcase';
import { SfPlaneStats } from './SfPlaneStats';
import { openUpgradeSheet } from './SfUpgrade';
import {
    COLORS, blocker, button, cap, color, coverSprite, drawPanel, easeOutBack, easeOutCubic, mixHex, node, num, opacity, size,
    sprite, text, verticalGradient,
} from './SfUi';

const SLOT_COLOR: Record<SlotId, string> = { main: '#FF6A5A', wing: '#5AB4FF', special: '#6AE07A' };
const SLOT_NAME: Record<SlotId, string> = { main: '主炮', wing: '翼炮', special: '特装' };
/** 入场演出总时长；点击屏幕可跳到结尾。 */
const INTRO = 1.45;
const CONTENT_HEIGHT = 1080;

interface Reveal { node: Node; at: number; dy: number; x: number; y: number }

/**
 * 机体详情（单机档案，参考 tidal-wings 的 AIRCRAFT CARD）：只展示当前机体的属性，不能切换机体或设置出战。
 * 入场演出：压暗 → 两道金线从机体中心上下拉开 → 机体剪影在柔和光芒中放大 → 局部主色光晕 → 瞄准框收拢 →
 * 名称、数值条（逐格点亮）、机制 / 必杀、零件依次出现 → 底部按钮滑入。点击屏幕跳过演出。
 */
export class SfPlaneDetail {
    readonly root: Node;
    private readonly fx: Graphics;
    private readonly flash: Graphics;
    private readonly showRoot: Node;
    private readonly showcase: SfShowcase;
    private readonly stats: SfPlaneStats;
    private readonly skip: Label;
    private readonly reveals: Reveal[] = [];
    private readonly buttons: Node;
    private readonly planeX = -185;
    private readonly planeY: number;
    private readonly levels: Record<SlotId, number>;
    private readonly refreshes: (() => void)[] = [];
    private time = 0;
    private closing = -1;
    private sheet?: Node;
    /** 已经着色完成（剪影阶段结束后不再每帧重设贴图颜色）。 */
    private tinted = false;

    constructor(private readonly shell: SfShell, parent: Node, private readonly plane: PlaneDef, private readonly onClose: () => void) {
        const ui = shell.ui;
        const w = shell.width, h = shell.height;
        const progress = shell.progress;
        const save = progress.plane(plane.id);
        this.levels = { main: showcaseLevel(save.parts.main), wing: showcaseLevel(save.parts.wing), special: showcaseLevel(save.parts.special) };
        this.root = node(parent, 'PlaneDetail', w, h);
        const block = blocker(this.root, w, h, 0);
        block.on(Node.EventType.TOUCH_END, () => { if (this.time < INTRO) this.time = INTRO; });
        const bg = sprite(ui, this.root, 'bg/hangar', 10, 10, 0, 0, 'Bg');
        coverSprite(bg, w, h);
        const shade = node(this.root, 'Shade').addComponent(Graphics);
        verticalGradient(shade, -w / 2, h / 2, w, h, 32, k => ['#03121F', 215 + k * 30]);
        // 顶部：返回 + 档案标题；名称与类型在左上。
        const top = shell.safeTop;
        const back = button(ui, this.root, { w: 132, h: 64, x: -282, y: top - 44, skin: 'dark', label: '返回', size: 26, icon: 'icon/arrow-left', sound: 'back', onTap: () => this.close() });
        this.reveal(back.node, 0.05, 0);
        const cap1 = text(ui, this.root, '机体档案', 345, top - 44, { size: 22, color: COLORS.foam, align: 'right' });
        this.reveal(cap1.node, 0.05, 0);
        // 正文在顶部导航和底部按钮之间整体适配；矮屏等比缩小，高屏保留自然留白。
        const contentTop = top - 94, contentBottom = shell.safeBottom + 160;
        const contentScale = Math.min(1, w / 750, (contentTop - contentBottom) / CONTENT_HEIGHT);
        const content = node(this.root, 'Content', 690, CONTENT_HEIGHT, 0, (contentTop + contentBottom) / 2);
        content.setScale(contentScale, contentScale, 1);
        this.fx = node(content, 'Fx').addComponent(Graphics);
        const name = text(ui, content, plane.name, -330, 486, { size: 64, color: plane.color, align: 'left', outline: 4 });
        this.reveal(name.node, 0.62, 10);
        // 类型 / 等级标签（与机库首页同款斜切标签）。
        const pills = node(content, 'Pills', 0, 0, -330, 420);
        const pg = pills.addComponent(Graphics);
        const pill = (x0: number, w0: number, fill: string) => {
            pg.fillColor = color(COLORS.ink, 230);
            pg.moveTo(x0 - 3, 20); pg.lineTo(x0 + w0 + 9, 20); pg.lineTo(x0 + w0 + 1, -20); pg.lineTo(x0 - 11, -20); pg.close();
            pg.fill();
            pg.fillColor = color(fill);
            pg.moveTo(x0, 17); pg.lineTo(x0 + w0 + 6, 17); pg.lineTo(x0 + w0, -17); pg.lineTo(x0 - 6, -17); pg.close();
            pg.fill();
        };
        pill(0, 126, save.owned ? plane.color : '#3A4C58');
        pill(146, 100, '#0E3A52');
        text(ui, pills, plane.tag, 63, 0, { size: 22, color: COLORS.white, shadow: false });
        const levelTag = text(ui, pills, '', 196, 0, { size: 22, color: COLORS.cream, shadow: false });
        this.refreshes.push(() => { levelTag.string = save.owned ? `Lv.${save.level}` : '未拥有'; });
        this.reveal(pills, 0.68, 10);
        // 展示台：机体下方的透视光环与刻度线，衬托大图。
        this.planeY = 210;
        const bay = node(content, 'Bay', 0, 0, this.planeX, this.planeY - 66).addComponent(Graphics);
        for (let i = 0; i < 3; i++) {
            bay.strokeColor = color(plane.color, 150 - i * 40);
            bay.lineWidth = 3 - i * 0.6;
            bay.ellipse(0, 0, 100 + i * 22, 32 + i * 10);
            bay.stroke();
        }
        bay.fillColor = color(plane.color, 30);
        bay.ellipse(0, 0, 100, 32);
        bay.fill();
        bay.fillColor = color(COLORS.foam, 70);
        for (let i = -3; i <= 3; i++) bay.rect(i * 44 - 1, -58 - Math.abs(i) * 2, 2, 10);
        bay.fill();
        this.reveal(bay.node, 0.5, 0);
        this.showRoot = node(content, 'Show', 0, 0, this.planeX, this.planeY);
        this.showcase = new SfShowcase(ui, this.showRoot, 1.85);
        this.showcase.trailBoost = 0.45;
        this.showcase.show(plane.id, this.levels, '#0A1A2A');
        this.flash = node(content, 'Flash').addComponent(Graphics);
        // 机体在左侧，右侧性能卡沿用横向数值条，火力、装甲各占一行。
        const statsCard = node(content, 'StatsCard', 326, 252, 176, this.planeY);
        drawPanel(statsCard.addComponent(Graphics), 326, 252, { fillAlpha: 205, border: COLORS.foam, borderAlpha: 110, skew: 10 });
        text(ui, statsCard, '机体性能', -140, 96, { size: 24, color: COLORS.foam, align: 'left' });
        this.stats = new SfPlaneStats(ui, statsCard, 0, 0, 280, 'rows');
        this.reveal(statsCard, 0.8, 8);
        // 机制、必杀：两张带徽记的说明卡。
        const infoCard = (cy: number, badge: string, tone: string, title: string, body: string, at: number) => {
            const c = node(content, 'Info', 690, 112, 0, cy);
            const g = c.addComponent(Graphics);
            drawPanel(g, 690, 108, { fillAlpha: 205, border: tone, borderAlpha: 150, skew: 10 });
            g.fillColor = color(COLORS.ink, 240);
            g.moveTo(-326, 36); g.lineTo(-262, 36); g.lineTo(-270, -36); g.lineTo(-334, -36); g.close();
            g.fill();
            g.fillColor = color(tone);
            g.moveTo(-323, 32); g.lineTo(-266, 32); g.lineTo(-273, -32); g.lineTo(-330, -32); g.close();
            g.fill();
            text(ui, c, badge, -298, 0, { size: 30, color: COLORS.ink, shadow: false });
            const heading = text(ui, c, title, -246, 0, { size: 24, color: tone, align: 'left' });
            const description = text(ui, c, body, -246, 0, { size: 20, color: COLORS.cream, align: 'left', width: 560, wrap: true, bold: false });
            // 按实际换行高度将标题与说明作为整体居中，单行和多行文案都留出对称的上下空间。
            heading.updateRenderData(true);
            description.updateRenderData(true);
            const headingHeight = heading.node.getComponent(UITransform)!.height;
            const descriptionHeight = description.node.getComponent(UITransform)!.height;
            const gap = 8;
            heading.node.setPosition(-246, (descriptionHeight + gap) / 2);
            description.node.setPosition(-246, -(headingHeight + gap) / 2);
            this.reveal(c, at, 10);
        };
        const mech = plane.mechanic.split('：');
        infoCard(-90, '机', plane.color, `机制 · ${mech[0]}`, mech.slice(1).join('：') || plane.mechanic, 0.92);
        infoCard(-210, '杀', COLORS.gold, `必杀 · ${plane.ultimate.name}`, plane.ultimate.desc, 0.98);
        // 三个零件：方形图标槽 + 名称与说明 + 右侧等级与 10 格进度。
        SLOTS.forEach((slot, i) => {
            const row = node(content, `Part-${slot}`, 690, 68, 0, -320 - i * 80);
            const g = row.addComponent(Graphics);
            g.fillColor = color('#062234', 200);
            g.rect(-345, -34, 690, 68);
            g.fill();
            g.fillColor = color(SLOT_COLOR[slot]);
            g.rect(-345, -34, 5, 68);
            g.fill();
            g.fillColor = color(COLORS.ink, 240);
            g.rect(-326, -28, 56, 56);
            g.fill();
            g.strokeColor = color(SLOT_COLOR[slot], 180);
            g.lineWidth = 2;
            g.rect(-324, -26, 52, 52);
            g.stroke();
            const key = `plane/${plane.id}/${slot}-${showcaseLevel(save.parts[slot])}`;
            const icon = sprite(ui, row, key, 10, 10, -298, 0, 'Icon');
            const f = ui.frame(key);
            if (f) { const k = Math.min(40 / f.originalSize.width, 44 / f.originalSize.height); size(icon.node, f.originalSize.width * k, f.originalSize.height * k); }
            text(ui, row, `${SLOT_NAME[slot]} · ${plane.slots[slot].name}`, -256, 13, { size: 24, color: COLORS.cream, align: 'left' });
            const detail = text(ui, row, '', -256, -16, { size: 19, color: '#9CC4D0', align: 'left', bold: false });
            const partLevel = num(ui, row, '', 330, 14, { size: 24, color: SLOT_COLOR[slot], align: 'right' });
            const bar = node(row, 'LevelBar').addComponent(Graphics);
            this.refreshes.push(() => {
                const level = save.parts[slot];
                const next = [4, 7, 10].find(l => l > level);
                detail.string = next ? `下一特性 Lv${next}：${plane.features[slot][[4, 7, 10].indexOf(next)]}` : '全部特性已解锁';
                partLevel.string = String(level);
                const frame = ui.frame(`plane/${plane.id}/${slot}-${showcaseLevel(level)}`);
                icon.spriteFrame = frame ?? null;
                if (frame) { const k = Math.min(40 / frame.originalSize.width, 44 / frame.originalSize.height); size(icon.node, frame.originalSize.width * k, frame.originalSize.height * k); }
                bar.clear();
                for (let k = 0; k < MAX_PART_LEVEL; k++) {
                    bar.fillColor = color(k < level ? SLOT_COLOR[slot] : '#24485E');
                    bar.rect(222 + k * 11, -20, 8, 8);
                }
                bar.fill();
            });
            this.reveal(row, 1.05 + i * 0.06, 10);
        });
        // 底部：返回 | 改装（已拥有且已实现时）。
        this.buttons = node(this.root, 'Buttons', 0, 0, 0, shell.safeBottom + 84);
        const owned = save.owned && plane.implemented;
        button(ui, this.buttons, { w: owned ? 300 : 620, h: 100, x: owned ? -170 : 0, y: 0, skin: 'dark', label: '返回机库', size: 34, sound: 'back', onTap: () => this.close() });
        if (owned) {
            button(ui, this.buttons, {
                w: 300, h: 100, x: 170, y: 0, skin: 'pink', label: '改装', size: 38,
                onTap: () => {
                    if (this.sheet) return;
                    this.sheet = openUpgradeSheet(shell, this.root, plane, () => this.refresh(), () => { this.sheet = undefined; });
                },
            });
        }
        this.reveal(this.buttons, 1.2, -60);
        this.skip = text(ui, this.root, '点击跳过', 0, shell.safeBottom + 30, { size: 20, color: '#6F99A6' });
        this.refresh();
        opacity(this.root, 0);
    }

    private refresh(): void {
        const progress = this.shell.progress;
        const save = progress.plane(this.plane.id);
        for (const slot of SLOTS) this.levels[slot] = showcaseLevel(save.parts[slot]);
        if (this.tinted) this.showcase.show(this.plane.id, this.levels);
        this.refreshes.forEach(refresh => refresh());
        this.stats.show(progress, this.plane.id, save.owned);
    }

    private reveal(n: Node, at: number, dy: number): void {
        this.reveals.push({ node: n, at, dy, x: n.position.x, y: n.position.y });
        opacity(n, 0);
    }

    private close(): void {
        if (this.closing >= 0 || this.sheet) return;
        this.closing = 0;
    }

    update(dt: number): void {
        this.time += dt;
        this.showcase.update(dt, this.time > 0.4);
        if (this.closing >= 0) {
            this.closing += dt;
            const k = cap(this.closing / 0.2);
            opacity(this.root, 255 * (1 - k));
            this.root.setScale(1 + 0.04 * k, 1 + 0.04 * k, 1);
            if (k >= 1) { this.root.destroy(); this.onClose(); }
            return;
        }
        const t = this.time, px = this.planeX, py = this.planeY;
        opacity(this.root, 255 * cap(t / 0.18));
        // 机体：剪影 → 放大 → 着色。
        const grow = easeOutBack(cap((t - 0.15) / 0.4));
        const s = 0.35 + 0.65 * grow;
        const bob = t > INTRO ? Math.sin((t - INTRO) * 2.2) * 8 : 0;
        this.showRoot.setScale(s, s, 1);
        this.showRoot.setPosition(px, py + bob);
        const tint = cap((t - 0.4) / 0.2);
        if (!this.tinted) {
            this.showcase.show(this.plane.id, this.levels, mixHex('#0A1A2A', '#FFFFFF', tint));
            this.tinted = tint >= 1;
        }
        this.stats.show(this.shell.progress, this.plane.id, this.shell.progress.plane(this.plane.id).owned, cap((t - 0.85) / 0.4));
        const g = this.fx;
        g.clear();
        // 两道金线从机体中心上下拉开，框住机体。
        const open = easeOutCubic(cap(t / 0.32));
        const lineA = t < INTRO + 0.3 ? 255 * (1 - cap((t - INTRO) / 0.3) * 0.6) : 100;
        g.fillColor = color(COLORS.gold, lineA);
        g.rect(-345, py + 194 * open, 320, 2);
        g.rect(-345, py - 194 * open, 320, 2);
        g.fill();
        // 放射光芒：剪影放大期间旋转并淡出。
        const rays = Math.sin(cap((t - 0.12) / 0.6) * Math.PI);
        if (rays > 0.01) {
            g.fillColor = color(this.plane.color, 60 * rays);
            for (let i = 0; i < 16; i++) {
                const a = i * Math.PI / 8 + t * 0.8;
                const r0 = 32, rx = 120 + (i % 2) * 24, ry = 150 + (i % 2) * 24;
                const da = 0.05;
                g.moveTo(px + Math.cos(a - da) * r0, py + Math.sin(a - da) * r0);
                g.lineTo(px + Math.cos(a) * rx, py + Math.sin(a) * ry);
                g.lineTo(px + Math.cos(a + da) * r0, py + Math.sin(a + da) * r0);
                g.close();
            }
            g.fill();
        }
        // 瞄准框：四个角从外收拢到机体边缘，之后保持细框。
        const snap = easeOutCubic(cap((t - 0.55) / 0.25));
        if (t > 0.55) {
            const bx = 156 - 18 * snap, by = 194 - 28 * snap, L = 26;
            g.fillColor = color(this.plane.color, 230);
            for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
                const x = px + sx * bx, yy = py + sy * by;
                g.rect(sx > 0 ? x - L : x, yy - 2, L, 4);
                g.rect(x - 2, sy > 0 ? yy - L : yy, 4, L);
            }
            g.fill();
        }
        // 参考演出的主色光效：局部光晕平滑亮起再退去，避免突然叠加高亮全屏白色。
        const fl = this.flash;
        fl.clear();
        const fk = Math.sin(cap((t - 0.48) / 0.42) * Math.PI);
        if (fk > 0.01) {
            fl.fillColor = color(this.plane.color, 24 * fk);
            fl.ellipse(px, py, 146, 174);
            fl.fill();
            fl.strokeColor = color(COLORS.cream, 65 * fk);
            fl.lineWidth = 2;
            fl.ellipse(px, py, 144 + 12 * fk, 170 + 20 * fk);
            fl.stroke();
        }
        for (const r of this.reveals) {
            const k = easeOutCubic(cap((t - r.at) / 0.28));
            opacity(r.node, 255 * k);
            r.node.setPosition(r.x, r.y - (1 - k) * r.dy);
        }
        this.skip.node.active = t < INTRO;
    }
}
