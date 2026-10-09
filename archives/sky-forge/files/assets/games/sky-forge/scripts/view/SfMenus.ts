import { EventTouch, Graphics, Label, Node, Sprite } from 'cc';
import { CHAPTERS, levelById, nextLevel } from '../core/SfLevels';
import type { LevelDef } from '../core/SfLevelTypes';
import { PLANE_BY_ID } from '../core/SfPlaneDefs';
import { recommendedPower } from '../core/SfBalance';
import type { CombatResult } from '../core/SfCombat';
import type { PlaneId } from '../core/SfTypes';
import type { SfShell } from './SfShell';
import {
    COLORS, blocker, button, cap, color, coverSprite, easeOutBack, easeOutCubic, formatNumber, node, num, opacity, pad6, panel,
    mixHex, pixelSprite, reportButton, sheetIn, sheetOut, sprite, tappable, text, verticalGradient, type UiButton,
} from './SfUi';

/**
 * 各章 5 个关卡节点在地图上的位置（地图像素 375×666，原点在左上；显示时 ×2 并按屏幕压缩到安全区内）。
 * 第 1 章对应：港口灯塔 → 右侧小岛 → 左侧大岛 → 瀑布岛 → 骷髅城堡。
 */
const NODE_MAP: Record<number, [number, number][]> = {
    1: [[100, 540], [318, 488], [72, 330], [298, 238], [258, 72]],
    // 第 2 章：林间村落 → 蓝蘑菇林地 → 左岸蘑菇坡 → 瀑布崖 → 千年树王。
    2: [[110, 545], [300, 455], [80, 300], [300, 255], [275, 110]],
    // 第 3 章：港区 → 炼油平台 → 岸防炮台 → 沉船礁 → 风暴要塞。
    3: [[160, 565], [300, 420], [100, 320], [300, 265], [200, 95]],
    // 第 4 章：矿工营地 → 吊车矿场 → 左侧火山口 → 右侧矿井 → 熔岩巨岩。
    4: [[110, 560], [300, 500], [70, 395], [290, 335], [190, 95]],
    // 第 5 章：雪原小屋 → 右侧冰晶崖 → 左侧冰瀑 → 右侧冰桥 → 霜龙巢。
    5: [[80, 560], [300, 470], [80, 320], [300, 270], [290, 80]],
    // 第 6 章：观星台 → 右侧浮岛 → 左侧环形坑 → 右上水晶岛 → 裂隙之眼。
    6: [[150, 585], [300, 470], [70, 300], [300, 170], [210, 60]],
};
const DEFAULT_NODES: [number, number][] = [[110, 540], [280, 440], [100, 330], [280, 220], [190, 90]];
const TIER_TONE: Record<string, string> = { small: COLORS.blue, mid: COLORS.orange, big: COLORS.red, hidden: '#A65CFF' };

// ───────────────────────────── 选关地图 ─────────────────────────────

interface MapPage {
    root: Node;
    chapter: number;
    bg: Sprite;
    arrows: { node: Node; y: number }[];
}

/** 选关：每章独立地图背景；左右切换为整页滑动（背景随页移动，不经过黑屏淡入淡出）。顶部不铺压暗底板，文字靠投影分层。 */
export class SfMap {
    readonly root: Node;
    private readonly pages: Node;
    private page: MapPage;
    private leaving?: MapPage;
    private readonly pips: Graphics;
    private readonly quick: UiButton;
    private readonly chapterName: Label;
    private readonly chapterSub: Label;
    private swipeX: number | null = null;
    private swipeY = 0;
    private readonly prevBtn: Node;
    private readonly nextBtn: Node;
    private time = 0;
    private slide = 0;
    private slideDir = 0;
    private brief?: SfLevelBrief;

    constructor(private readonly shell: SfShell, parent: Node, private chapter = 1) {
        const ui = shell.ui;
        const w = shell.width, h = shell.height;
        this.root = node(parent, 'Map', w, h);
        this.pages = node(this.root, 'Pages', w, h);
        this.page = this.buildPage(chapter);
        // 顶栏：返回 | 章节标题 | 总星数。
        const top = node(this.root, 'Top', 0, 0, 0, shell.safeTop - 44);
        button(ui, top, { w: 132, h: 64, x: -282, y: 0, skin: 'dark', label: '机库', size: 26, icon: 'icon/arrow-left', sound: 'back', onTap: () => shell.openHangar() });
        this.chapterName = text(ui, top, '', 0, 8, { size: 44, color: COLORS.cream, outline: 3 });
        this.chapterSub = text(ui, top, '', 0, -42, { size: 22, color: COLORS.foam, outline: 2 });
        pixelSprite(ui, top, 'icon/star', 1, 248, 0, 'Star');
        num(ui, top, String(shell.progress.totalStars()), 276, 0, { size: 48, color: COLORS.gold, align: 'left' });
        // 底部：章节切换 + 章节指示点。
        const bottom = node(this.root, 'Bottom', 0, 0, 0, shell.safeBottom + 64);
        this.prevBtn = button(ui, bottom, { w: 100, h: 84, x: -290, y: 0, skin: 'dark', icon: 'icon/arrow-left', onTap: () => this.switchTo(this.chapter - 1) }).node;
        this.nextBtn = button(ui, bottom, { w: 100, h: 84, x: 290, y: 0, skin: 'dark', icon: 'icon/arrow-right', onTap: () => this.switchTo(this.chapter + 1) }).node;
        this.pips = node(bottom, 'Pips', 0, 0, 0, 74).addComponent(Graphics);
        // 快捷入口：直接打开当前最新关卡（等同点击地图上的那个关卡节点）。
        const latest = levelById(shell.progress.latestLevel())!;
        this.quick = button(ui, bottom, {
            w: 330, h: 88, x: 0, y: 0, skin: 'green', label: `最新关卡 ${latest.id}`, size: 32, sound: 'confirm',
            onTap: () => this.openLevel(latest),
        });
        // 左右滑动切换章节（捕获阶段：从关卡节点上开始滑动也有效，节点按位移判断是否算点击）。
        this.pages.on(Node.EventType.TOUCH_START, (e: EventTouch) => { const p = e.getUILocation(); this.swipeX = p.x; this.swipeY = p.y; }, this, true);
        this.pages.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            if (this.swipeX === null) return;
            const p = e.getUILocation();
            const dx = p.x - this.swipeX, dy = p.y - this.swipeY;
            this.swipeX = null;
            if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4) this.switchTo(this.chapter + (dx < 0 ? 1 : -1));
        }, this, true);
        this.pages.on(Node.EventType.TOUCH_CANCEL, () => { this.swipeX = null; }, this, true);
        this.refreshHeader();
    }

    private refreshHeader(): void {
        const ch = CHAPTERS.find(c => c.id === this.chapter)!;
        this.chapterName.string = ch.name;
        this.chapterSub.string = ch.subtitle;
        this.prevBtn.active = this.chapter > 1;
        this.nextBtn.active = this.chapter < CHAPTERS.length;
        const g = this.pips;
        g.clear();
        CHAPTERS.forEach((c, i) => {
            const on = c.id === this.chapter;
            const x = (i - (CHAPTERS.length - 1) / 2) * 34;
            g.fillColor = color(COLORS.ink, 200);
            g.rect(x - (on ? 14 : 10), -6, on ? 28 : 20, 12);
            g.fill();
            g.fillColor = color(on ? COLORS.gold : c.available ? COLORS.foam : '#6F8C9C');
            g.rect(x - (on ? 12 : 8), -4, on ? 24 : 16, 8);
            g.fill();
        });
    }

    private buildPage(chapter: number): MapPage {
        const shell = this.shell, ui = shell.ui;
        const w = shell.width, h = shell.height;
        const root = node(this.pages, `Chapter-${chapter}`, w, h);
        const fill = root.addComponent(Graphics);
        fill.fillColor = color('#0A3550');
        fill.rect(-w / 2, -h / 2, w, h);
        fill.fill();
        const bg = sprite(ui, root, `map/ch${chapter}/map`, w, h, 0, 0, 'Bg');
        coverSprite(bg, w, h);
        const page: MapPage = { root, chapter, bg, arrows: [] };
        const ch = CHAPTERS.find(c => c.id === chapter)!;
        if (ch.available) this.buildNodes(page, ch.levels);
        else {
            const shade = node(root, 'Shade').addComponent(Graphics);
            shade.fillColor = color('#04182A', 130);
            shade.rect(-w / 2, -h / 2, w, h);
            shade.fill();
            const midY = (shell.safeTop + shell.safeBottom) / 2;
            text(ui, root, '敬请期待', 0, midY + 30, { size: 56, color: COLORS.cream, outline: 3 });
            text(ui, root, '新章节研发中', 0, midY - 34, { size: 26, color: COLORS.foam, outline: 2 });
        }
        return page;
    }

    private buildNodes(page: MapPage, levels: LevelDef[]): void {
        const shell = this.shell, ui = shell.ui, progress = shell.progress;
        const pts = (NODE_MAP[page.chapter] ?? DEFAULT_NODES).map(([mx, my]) => ({ x: (mx - 187.5) * 2, y: (333 - my) * 2 }));
        // 纵向压缩到安全区内（矮屏不越界），横向保持与地图对齐。
        const top = shell.safeTop - 230, bottom = shell.safeBottom + 190;
        const ys = pts.map(p => p.y);
        const span = Math.max(...ys) - Math.min(...ys);
        const k = Math.min(1, (top - bottom) / span);
        const center = (Math.max(...ys) + Math.min(...ys)) / 2;
        const placed = pts.map(p => ({ x: p.x, y: (p.y - center) * k + (top + bottom) / 2 }));
        const path = node(page.root, 'Path').addComponent(Graphics);
        for (let i = 0; i < placed.length - 1; i++) {
            const a = placed[i], b = placed[i + 1];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const open = progress.levelUnlocked(levels[i + 1]?.id ?? '');
            for (let d = 70; d < len - 70; d += 24) {
                const x = a.x + (b.x - a.x) * d / len, y = a.y + (b.y - a.y) * d / len;
                path.fillColor = color(COLORS.ink, 200);
                path.circle(x, y, 7);
                path.fill();
                path.fillColor = color(open ? COLORS.cream : '#7A93A0');
                path.circle(x, y, 4);
                path.fill();
            }
        }
        levels.forEach((level, i) => {
            const { x, y } = placed[i];
            const unlocked = progress.levelUnlocked(level.id);
            const stars = progress.data.stars[level.id] ?? 0;
            const isNext = unlocked && stars === 0;
            const big = level.tier === 'big';
            const r = big ? 66 : 54;
            const tone = unlocked ? TIER_TONE[level.tier] : '#3A4C58';
            const holder = node(page.root, `Node-${level.id}`, r * 2 + 20, r * 2 + 60, x, y);
            const g = holder.addComponent(Graphics);
            // 六边形徽章：墨色外框 + 首领强度配色 + 亮色内线。
            const hex = (rad: number) => {
                for (let k = 0; k < 6; k++) {
                    const a = Math.PI / 6 + k * Math.PI / 3;
                    if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
                }
                g.close();
            };
            g.fillColor = color(COLORS.ink, 240);
            hex(r + 6);
            g.fill();
            g.fillColor = color(tone);
            hex(r);
            g.fill();
            g.strokeColor = color(unlocked ? COLORS.cream : '#5C7280', 200);
            g.lineWidth = 3;
            hex(r - 8);
            g.stroke();
            if (unlocked) {
                num(ui, holder, level.id, 0, 0, { size: 48, color: COLORS.cream });
                // 每关都有首领：骷髅图标，大首领关更大。
                pixelSprite(ui, holder, 'icon/skull', big ? 1.1 : 0.75, r * 0.72, r * 0.72, 'Boss');
            } else pixelSprite(ui, holder, 'icon/lock', 1.1, 0, 2, 'Lock');
            for (let s = 0; s < 3; s++) {
                pixelSprite(ui, holder, s < stars ? 'icon/star' : 'icon/star-empty', 0.75, -34 + s * 34, -r - 18, 'Star');
            }
            if (isNext) {
                const arrow = pixelSprite(ui, holder, 'icon/arrow-down', 1, 0, r + 50, 'Arrow');
                page.arrows.push({ node: arrow.node, y: r + 50 });
            }
            tappable(holder, () => {
                if (this.slide > 0 || this.brief) return;
                if (!unlocked) { shell.sfx('ui-deny'); shell.toast('先通关上一关'); return; }
                this.openLevel(level);
            }, ui);
        });
    }

    private switchTo(chapter: number): void {
        if (chapter < 1 || chapter > CHAPTERS.length || chapter === this.chapter || this.slide > 0 || this.brief) return;
        this.slideDir = chapter > this.chapter ? 1 : -1;
        this.chapter = chapter;
        this.leaving = this.page;
        this.page = this.buildPage(chapter);
        this.slide = 1;
        this.shell.sfx('ui-swipe', 0.6);
        // 左右滑动切换章节（捕获阶段：从关卡节点上开始滑动也有效，节点按位移判断是否算点击）。
        this.pages.on(Node.EventType.TOUCH_START, (e: EventTouch) => { const p = e.getUILocation(); this.swipeX = p.x; this.swipeY = p.y; }, this, true);
        this.pages.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            if (this.swipeX === null) return;
            const p = e.getUILocation();
            const dx = p.x - this.swipeX, dy = p.y - this.swipeY;
            this.swipeX = null;
            if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4) this.switchTo(this.chapter + (dx < 0 ? 1 : -1));
        }, this, true);
        this.pages.on(Node.EventType.TOUCH_CANCEL, () => { this.swipeX = null; }, this, true);
        this.refreshHeader();
    }

    /** 关卡简报：全屏战报风格（与暂停 / 结算同一视觉），入场依次出现，返回时淡出。 */
    private openLevel(level: LevelDef): void {
        if (this.brief) return;
        const brief = new SfLevelBrief(this.shell, this.root, level, {
            back: () => { if (this.brief === brief) { brief.close(); } },
            start: () => this.shell.startLevel(level.id),
        });
        this.brief = brief;
    }

    update(dt: number): void {
        this.time += dt;
        const w = this.shell.width;
        if (this.slide > 0) {
            this.slide = Math.max(0, this.slide - dt / 0.32);
            const k = easeOutCubic(1 - this.slide);
            this.page.root.setPosition((1 - k) * w * this.slideDir, 0);
            this.leaving?.root.setPosition(-k * w * this.slideDir, 0);
            if (this.slide <= 0 && this.leaving) {
                this.leaving.root.destroy();
                this.leaving = undefined;
            }
        }
        const bob = Math.abs(Math.sin(this.time * 4)) * 12;
        for (const a of this.page.arrows) a.node.setPosition(0, a.y + bob);
        if (this.brief) {
            this.brief.update(dt);
            if (this.brief.finished) { this.brief.dispose(); this.brief = undefined; }
        }
    }

    dispose(): void {
        this.root.destroy();
    }
}

// ───────────────────────────── 全屏战报界面（暂停 / 坠机 / 结算） ─────────────────────────────

type Emblem = 'pause' | 'star' | 'cross' | 'alert' | 'skull';

/**
 * 全屏战报界面：沿用 tidal-wings 的视觉语言（深色竖向渐变铺满、细亮线、色块强调、扁平渐变按钮、依次入场），
 * 版式改为居中构图：顶部六边形徽记 → 大标题 → 副标题 → 菱形分隔线 → 数据条 → 底部按钮组。
 */
export class ReportScreen {
    readonly root: Node;
    readonly content: Node;
    readonly fullW: number;
    private readonly reveals: { node: Node; at: number; dur: number; dy: number; x: number; y: number }[] = [];
    private closing = -1;
    time = 0;

    constructor(protected readonly shell: SfShell, parent: Node, name: string, protected readonly tone: string, dim: number) {
        const w = shell.width, h = shell.height;
        this.root = node(parent, name, w, h);
        blocker(this.root, w, h, 0);
        const g = node(this.root, 'Backdrop').addComponent(Graphics);
        const mid = Math.min(0.97, dim + 0.06);
        verticalGradient(g, -w / 2, h / 2, w, h, 48, k => [
            mixHex('#03192B', '#010C19', cap((k - 0.4) / 0.6)),
            255 * (k < 0.48 ? dim + (mid - dim) * (k / 0.48) : mid + (0.98 - mid) * ((k - 0.48) / 0.52)),
        ]);
        this.content = node(this.root, 'Content');
        // 内容横向铺满（两侧只留 24 像素边距），不做大面积左右留白。
        this.fullW = w - 48;
    }

    /** 顶部徽记：墨色描边六边形 + 主色底 + 图形。 */
    emblem(kind: Emblem, y: number, at = 0): void {
        const n = node(this.content, 'Emblem', 0, 0, 0, y);
        const g = n.addComponent(Graphics);
        const hex = (rad: number) => {
            for (let k = 0; k < 6; k++) {
                const a = k * Math.PI / 3;
                if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            g.close();
        };
        g.fillColor = color(this.tone, 50);
        hex(70);
        g.fill();
        g.fillColor = color(COLORS.ink, 240);
        hex(52);
        g.fill();
        g.strokeColor = color(this.tone);
        g.lineWidth = 4;
        hex(46);
        g.stroke();
        g.fillColor = color(COLORS.cream);
        if (kind === 'pause') {
            g.rect(-14, -16, 9, 32);
            g.rect(5, -16, 9, 32);
        } else if (kind === 'star') {
            for (let k = 0; k < 10; k++) {
                const a = Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 9 : 22;
                if (k === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            g.close();
        } else if (kind === 'cross') {
            for (const s of [1, -1]) {
                g.moveTo(-18, -18 * s + 5 * s); g.lineTo(-13, -18 * s); g.lineTo(18, 13 * s); g.lineTo(13, 18 * s); g.close();
            }
        } else if (kind === 'alert') {
            g.rect(-5, -4, 10, 24);
            g.rect(-5, -18, 10, 9);
        }
        g.fill();
        if (kind === 'skull') pixelSprite(this.shell.ui, n, 'icon/skull', 1.4, 0, 0, 'Skull');
        this.reveal(n, at, 0.34, 0, true);
    }

    /** 居中菱形分隔线：两侧渐隐细线 + 中间主色菱形。 */
    divider(y: number, at = 0): void {
        const n = node(this.content, 'Divider', 0, 0, 0, y);
        const g = n.addComponent(Graphics);
        const segs = Math.ceil((this.shell.width / 2 - 18) / 18);
        for (let i = 0; i < segs; i++) {
            g.fillColor = color('#84DBEB', 110 * (1 - i / segs) + 20);
            g.rect(18 + i * 18, -1, 18, 2);
            g.rect(-36 - i * 18, -1, 18, 2);
        }
        g.fill();
        g.fillColor = color(this.tone);
        g.moveTo(0, 9); g.lineTo(9, 0); g.lineTo(0, -9); g.lineTo(-9, 0); g.close();
        g.fill();
        this.reveal(n, at, 0.3, 0);
    }

    /** 居中标题 + 副标题。 */
    heading(title: string, sub: string, y: number, titleTone: string, at = 0): void {
        const t = text(this.shell.ui, this.content, title, 0, y, { size: 60, color: titleTone, outline: 3 });
        this.reveal(t.node, at, 0.34, 12);
        const s = text(this.shell.ui, this.content, sub, 0, y - 56, { size: 24, color: COLORS.foam });
        this.reveal(s.node, at + 0.04, 0.34, 12);
    }

    /** 数据条：带斜切两端的深色底板，内含若干等宽数据格（小标签 + 像素数字），格间细竖线。 */
    stats(cells: { label: string; value: string; tone?: string }[], y: number, at = 0): Label[] {
        const n = node(this.content, 'Stats', 0, 0, 0, y);
        const g = n.addComponent(Graphics);
        // 数据条横贯整屏（斜切两端伸出屏幕外），数据格按可见宽度等分。
        const vis = this.shell.width, w = vis + 40, h = 108, sk = 16;
        g.fillColor = color('#062234', 210);
        g.moveTo(-w / 2 + sk, h / 2); g.lineTo(w / 2, h / 2); g.lineTo(w / 2 - sk, -h / 2); g.lineTo(-w / 2, -h / 2); g.close();
        g.fill();
        g.fillColor = color(this.tone);
        g.rect(-vis / 2 + 24, h / 2 - 3, 60, 3);
        g.rect(vis / 2 - 84, -h / 2, 60, 3);
        g.fill();
        const cw = vis / cells.length;
        g.fillColor = color('#76D8EA', 46);
        for (let i = 1; i < cells.length; i++) g.rect(-vis / 2 + cw * i, -34, 2, 68);
        g.fill();
        const values = cells.map((c, i) => {
            const x = -vis / 2 + cw * (i + 0.5);
            text(this.shell.ui, n, c.label, x, 26, { size: 20, color: '#73BED0' });
            return num(this.shell.ui, n, c.value, x, -14, { size: 48, color: c.tone ?? COLORS.cream });
        });
        this.reveal(n, at, 0.32, 10);
        return values;
    }

    /** 依次入场：淡入 + 下方滑上 + 轻微回弹；pop 为从小放大弹出。 */
    reveal(n: Node, at: number, dur: number, dy: number, pop = false): void {
        this.reveals.push({ node: n, at, dur, dy, x: n.position.x, y: n.position.y });
        opacity(n, 0);
        if (pop) n.setScale(0.4, 0.4, 1);
    }

    /** 退场：整屏淡出后由宿主销毁（finished 为 true）。 */
    close(): void { if (this.closing < 0) this.closing = 0; }

    get finished(): boolean { return this.closing >= 0.18; }

    protected get introDuration(): number {
        return this.reveals.reduce((end, reveal) => Math.max(end, reveal.at + reveal.dur), 0);
    }

    update(dt: number): void {
        this.time += dt;
        if (this.closing >= 0) {
            this.closing += dt;
            opacity(this.root, 255 * (1 - cap(this.closing / 0.18)));
            return;
        }
        for (const r of this.reveals) {
            const k = cap((this.time - r.at) / r.dur);
            const e = easeOutCubic(k);
            opacity(r.node, 255 * e);
            const s = 0.96 + 0.04 * easeOutBack(k);
            r.node.setPosition(r.x, r.y - (1 - e) * r.dy);
            r.node.setScale(s, s, 1);
        }
    }

    dispose(): void { this.root.destroy(); }
}

// ───────────────────────────── 结算 ─────────────────────────────

export interface ResultData {
    /** 关卡模式；无尽模式为空。 */
    level?: LevelDef;
    result: CombatResult;
    stars: number;
    newStars: number;
    gold: number;
    firstClear: boolean;
    unlocked: PlaneId[];
    plane: PlaneId;
    canDouble: boolean;
    /** 本次结算之前的本关最佳分。 */
    bestScore?: number;
    endlessBest?: boolean;
}

/**
 * 结算：徽记 → 标题 → 三颗大星依次砸下（无尽为最远距离）→ 战斗得分滚动 + 新纪录标签 → 数据条 →
 * 金币收入（带明细）→ 底部一行按钮（胜利时上方可看广告翻倍）。各段间距按可用高度统一缩放。
 */
export class SfResult extends ReportScreen {
    private readonly starNodes: Node[] = [];
    private readonly score: Label;
    private readonly gold: Label;
    private doubled = false;
    private readonly navigation: UiButton[] = [];
    private navigationEnabled = true;

    /** 所有入场与数字滚动结束后再留 0.32 秒，让通关战报完整呈现。 */
    get rewardsReady(): boolean { return this.time >= Math.max(this.introDuration, 1.85) + 0.32; }

    constructor(shell: SfShell, parent: Node, private readonly data: ResultData,
        actions: { retry: () => void; next: (id: string) => void; map: () => void; hangar: () => void; double: () => Promise<boolean> }) {
        const r = data.result;
        const endless = !data.level;
        const win = r.victory || endless;
        super(shell, parent, 'Result', win ? COLORS.gold : COLORS.red, 0.88);
        const ui = shell.ui;
        const showAd = data.canDouble && data.gold > 0;
        // 按钮区（底部）高度：一行主按钮 + 可选广告按钮。
        const bottom = shell.safeBottom + 24;
        const buttonsTop = bottom + 100 + (showAd ? 96 : 0);
        // 上半部分各段的标准间距，可用高度不足时等比压缩。
        const gaps = endless ? [112, 120, 0, 150, 120, 104] : [112, 128, 118, 150, 120, 104];
        const need = 96 + gaps.reduce((a, b) => a + b, 0) + 60;
        const room = shell.safeTop - buttonsTop - 30;
        const f = Math.min(1, room / need);
        // 高屏时把内容块往下挪一部分，让上下留白更均衡。
        const slack = Math.max(0, room - need * f);
        let y = shell.safeTop - 96 * f - Math.min(140, slack * 0.45);
        this.emblem(win ? 'star' : 'cross', y, 0.02);
        y -= gaps[0] * f;
        this.heading(endless ? '飞行结束' : win ? '任务完成' : '任务失败',
            endless ? `无尽模式 · 到达第 ${r.sectors} 段` : `${data.level!.id} · ${data.level!.name}`, y, win ? COLORS.cream : '#FF8796', 0.1);
        y -= gaps[1] * f;
        if (!endless) {
            const row = node(this.content, 'Stars', 0, 0, 0, y);
            for (let i = 0; i < 3; i++) {
                const x = (i - 1) * 120, sy = i === 1 ? 12 : 0;
                pixelSprite(ui, row, 'icon/star-empty', 2, x, sy, 'Empty');
                const star = pixelSprite(ui, row, 'icon/star', 2, x, sy, 'Star').node;
                star.active = false;
                this.starNodes.push(star);
            }
            this.reveal(row, 0.2, 0.3, 0);
            y -= gaps[2] * f;
        }
        // 战斗得分（无尽：飞行距离），下方新纪录标签或历史最佳。
        const scoreBlock = node(this.content, 'Score', 0, 0, 0, y);
        text(ui, scoreBlock, endless ? '飞行距离' : '战斗得分', 0, 40, { size: 22, color: '#74BFD0' });
        this.score = num(ui, scoreBlock, endless ? '0M' : '000000', 0, -12, { size: 96, color: win ? COLORS.gold : COLORS.cream });
        const record = endless ? !!data.endlessBest : r.score > (data.bestScore ?? 0) && r.score > 0;
        if (record) {
            const tag = node(scoreBlock, 'Record', 0, 0, 0, -78);
            const tg = tag.addComponent(Graphics);
            tg.fillColor = color(COLORS.pink);
            tg.moveTo(-64, 16); tg.lineTo(72, 16); tg.lineTo(64, -16); tg.lineTo(-72, -16); tg.close();
            tg.fill();
            text(ui, tag, '新纪录', 0, 0, { size: 22, color: COLORS.white, shadow: false });
        } else {
            const best = endless ? shell.progress.data.endlessBest : Math.max(data.bestScore ?? 0, r.score);
            text(ui, scoreBlock, endless ? `最远 ${formatNumber(best)} 米` : `历史最佳 ${pad6(best)}`, 0, -78, { size: 22, color: '#6D9EAA' });
        }
        this.reveal(scoreBlock, 0.7, 0.42, 14);
        y -= gaps[3] * f;
        this.stats(endless
            ? [{ label: '击坠', value: String(r.kills) }, { label: '击败首领', value: String(r.bosses) }, { label: '最大连击', value: String(r.maxCombo) }, { label: '战斗得分', value: formatNumber(r.score) }]
            : [{ label: '击坠', value: String(r.kills) }, { label: '最大连击', value: String(r.maxCombo) }, { label: '擦弹', value: String(r.grazes) },
                { label: '被击中', value: String(r.hitsTaken), tone: r.hitsTaken <= 1 ? '#79E88B' : '#FF9AA6' }], y, 1.0);
        y -= gaps[4] * f;
        // 金币收入：金币图标 + 计数，下方一行明细。
        const goldRow = node(this.content, 'Gold', 0, 0, 0, y);
        pixelSprite(ui, goldRow, 'icon/coin', 1, -110, 6, 'Coin');
        this.gold = num(ui, goldRow, '+0', -76, 6, { size: 72, color: COLORS.gold, align: 'left' });
        const kill = r.coins, rest = Math.max(0, data.gold - kill);
        const detail = endless ? `击坠 +${kill}  ·  航程与首领 +${rest}`
            : `击坠 +${kill}  ·  通关 +${rest}${r.hiddenBoss && r.victory ? '（隐藏首领 ×3）' : data.firstClear ? '（含首通）' : ''}`;
        text(ui, goldRow, detail, 0, -42, { size: 20, color: '#91B2BA' });
        this.reveal(goldRow, 1.25, 0.36, 8);
        y -= gaps[5] * f;
        const notes: [string, string][] = [];
        for (const id of data.unlocked) {
            const plane = PLANE_BY_ID[id];
            notes.push([`解锁新机体：${plane.name}${plane.implemented ? '' : '（研发中）'}`, COLORS.gold]);
        }
        if (!win) notes.push(['提示：回机库改装能提高战斗力', COLORS.cream]);
        notes.slice(0, 2).forEach(([msg, c], i) => {
            const t = text(ui, this.content, msg, 0, y - i * 32, { size: 22, color: c });
            this.reveal(t.node, 1.5, 0.3, 6);
        });
        // 底部：可选广告翻倍（整行）+ 一行按钮。
        const w = this.fullW, left = -w / 2;
        const buttons = node(this.content, 'Buttons');
        this.navigationEnabled = shell.progress.data.pendingPlanes.length === 0;
        const navButton = (opts: Parameters<typeof reportButton>[2]): UiButton => {
            const b = reportButton(ui, buttons, opts);
            b.setEnabled(this.navigationEnabled);
            this.navigation.push(b);
            return b;
        };
        const next = !endless && win ? nextLevel(data.level!.id) : undefined;
        if (showAd) {
            const dbl: UiButton = reportButton(ui, buttons, {
                x: left, y: bottom + 196, w, h: 80, label: '看广告 金币翻倍', meta: '×2', fill: '#8A6418', fillEnd: '#5C3E12', accent: '#FFE47A',
                onTap: () => {
                    if (this.doubled) return;
                    dbl.setEnabled(false);
                    void actions.double().then(ok => {
                        if (ok) { this.doubled = true; dbl.setLabel('金币已翻倍'); shell.sfx('coin-big'); }
                        else dbl.setEnabled(true);
                    });
                },
            });
        }
        const gap = 14, by = bottom + 96;
        if (win && !endless) {
            const small = (w - gap * 2) * 0.28, big = w - gap * 2 - small * 2;
            // 主按钮“下一关”居中，两侧是返回地图 / 再来一次。
            navButton({ x: left, y: by, w: small, h: 96, label: '返回地图', accent: '#6EBFD1', size: 26, sound: 'back', onTap: actions.map });
            navButton({
                x: left + small + gap, y: by, w: big, h: 96, label: next ? `下一关 ${next.id}` : '返回地图', primary: true,
                fill: '#B56C1F', fillEnd: '#7C3928', accent: '#FFE47A', size: 34, sound: 'confirm', onTap: () => next ? actions.next(next.id) : actions.map(),
            });
            navButton({ x: left + small + gap + big + gap, y: by, w: small, h: 96, label: '再来一次', accent: '#6EBFD1', size: 26, onTap: actions.retry });
        } else {
            const small = (w - gap) * 0.36;
            navButton({ x: left, y: by, w: small, h: 96, label: endless ? '返回机库' : '返回地图', accent: '#6EBFD1', size: 28, sound: 'back', onTap: endless ? actions.hangar : actions.map });
            navButton({
                x: left + small + gap, y: by, w: w - small - gap, h: 96, label: '再试一次', primary: true,
                fill: endless ? '#176F7D' : '#A32F45', fillEnd: endless ? '#12495F' : '#64283E', accent: endless ? '#8CECFF' : '#FF9AA6', size: 34, sound: 'confirm', onTap: actions.retry,
            });
        }
        this.reveal(buttons, 1.7, 0.32, 13);
    }

    update(dt: number): void {
        super.update(dt);
        const enabled = this.shell.progress.data.pendingPlanes.length === 0 || this.rewardsReady;
        if (enabled !== this.navigationEnabled) {
            this.navigationEnabled = enabled;
            for (const b of this.navigation) b.setEnabled(enabled);
        }
        const d = this.data, t = this.time;
        this.starNodes.forEach((star, i) => {
            const at = 0.45 + i * 0.28;
            if (i < d.stars && t >= at && !star.active) {
                star.active = true;
                this.shell.sfx(`star-${i + 1}`);
                this.shell.tweens.add(0.4, k => {
                    if (!star.isValid) return;
                    const s = 2.2 - 1.2 * easeOutBack(k);
                    star.setScale(s, s, 1);
                    star.angle = (1 - k) * (i % 2 ? -18 : 18);
                    opacity(star, 255 * Math.min(1, k * 2.5));
                }, { ease: x => x });
            }
        });
        const k = easeOutCubic(cap((t - 0.7) / 1.0));
        this.score.string = d.level ? pad6(d.result.score * k) : `${formatNumber(d.result.distance * k)}M`;
        const gk = cap((t - 1.25) / 0.6);
        this.gold.string = `+${Math.round(d.gold * easeOutCubic(gk)) * (this.doubled ? 2 : 1)}`;
    }
}

// ───────────────────────────── 关卡简报（全屏） ─────────────────────────────

/** 关卡简报：首领徽记 → 关卡号与名称 → 数据条（本关最佳 / 推荐战力 / 当前战力）→ 星级目标 → 返回 / 出击。 */
export class SfLevelBrief extends ReportScreen {
    constructor(shell: SfShell, parent: Node, level: LevelDef, actions: { back: () => void; start: () => void }) {
        super(shell, parent, 'LevelBrief', TIER_TONE[level.tier], 0.86);
        const ui = shell.ui, progress = shell.progress;
        let y = shell.safeTop - 110;
        this.emblem('skull', y, 0.02);
        y -= 120;
        const id = num(ui, this.content, level.id, 0, y, { size: 96, color: COLORS.cream });
        this.reveal(id.node, 0.08, 0.34, 12);
        const name = text(ui, this.content, level.name, 0, y - 70, { size: 28, color: COLORS.foam });
        this.reveal(name.node, 0.12, 0.34, 12);
        y -= 130;
        this.divider(y, 0.14);
        y -= 92;
        const plane = PLANE_BY_ID[progress.data.selected];
        const power = progress.power(plane.id);
        const rec = recommendedPower(level.number);
        this.stats([
            { label: '本关最佳', value: pad6(progress.data.bestScore[level.id] ?? 0), tone: COLORS.gold },
            { label: '推荐战力', value: String(rec) },
            { label: `${plane.name} 战力`, value: String(power), tone: power >= rec ? '#7BF08A' : COLORS.red },
        ], y, 0.18);
        y -= 96;
        if (power < rec) {
            const warn = text(ui, this.content, '战力偏低，可回机库改装（仍可出击）', 0, y, { size: 22, color: '#FFB0B8' });
            this.reveal(warn.node, 0.22, 0.3, 6);
            y -= 54;
        }
        const stars = progress.data.stars[level.id] ?? 0;
        const goalsTitle = text(ui, this.content, '星级目标', 0, y, { size: 24, color: COLORS.foam });
        this.reveal(goalsTitle.node, 0.24, 0.3, 6);
        const goals = ['击败首领通关', '被击中不超过 1 次', `分数达到 ${formatNumber(level.starScore)}`];
        goals.forEach((goal, i) => {
            const row = node(this.content, 'Goal', 0, 0, 0, y - 52 - i * 50);
            pixelSprite(ui, row, i < stars ? 'icon/star' : 'icon/star-empty', 0.8, -150, 0, 'Star');
            text(ui, row, goal, -116, 0, { size: 26, color: i < stars ? COLORS.gold : COLORS.cream, align: 'left' });
            this.reveal(row, 0.28 + i * 0.05, 0.3, 6);
        });
        if (level.tier === 'big' && stars > 0) {
            const hint = text(ui, this.content, '再次挑战时有小概率遭遇隐藏首领', 0, y - 52 - 3 * 50, { size: 22, color: '#C77DFF' });
            this.reveal(hint.node, 0.45, 0.3, 6);
        }
        const w = this.fullW, left = -w / 2, gap = 14, by = shell.safeBottom + 120;
        const small = (w - gap) * 0.34;
        const buttons = node(this.content, 'Buttons');
        reportButton(ui, buttons, { x: left, y: by, w: small, h: 100, label: '返回', accent: '#6EBFD1', size: 30, sound: 'back', onTap: actions.back });
        reportButton(ui, buttons, {
            x: left + small + gap, y: by, w: w - small - gap, h: 100, label: '出击', primary: true,
            fill: '#2E9A4A', fillEnd: '#1C6232', accent: '#9CFFB0', size: 40, sound: 'confirm', onTap: actions.start,
        });
        this.reveal(buttons, 0.4, 0.3, 12);
    }
}

// ───────────────────────────── 暂停 / 复活 ─────────────────────────────

/** 暂停：暂停徽记 → 标题 → 数据条（分数 / 金币 / 生命）→ 继续（主按钮）+ 重开、地图与机库入口。 */
export class SfPause extends ReportScreen {
    constructor(shell: SfShell, parent: Node, info: { endless: boolean; stage: string; score: number; coins: number; hp: number; maxHp: number },
        actions: { resume: () => void; restart: () => void; map: () => void; hangar: () => void }) {
        super(shell, parent, 'Pause', COLORS.foam, 0.8);
        const ui = shell.ui;
        let y = shell.safeTop - 130;
        this.emblem('pause', y, 0);
        y -= 116;
        this.heading('暂停中', info.stage, y, COLORS.cream, 0.04);
        y -= 100;
        this.divider(y, 0.08);
        y -= 90;
        this.stats([
            { label: '分数', value: pad6(info.score) },
            { label: '金币', value: String(info.coins), tone: COLORS.gold },
            { label: '装甲', value: `${Math.max(0, info.hp)}/${info.maxHp}`, tone: info.hp > 1 ? '#79E88B' : COLORS.red },
        ], y, 0.12);
        const w = this.fullW, left = -w / 2;
        const by = Math.min(y - 200, shell.safeBottom + 330);
        const buttons = node(this.content, 'Buttons');
        reportButton(ui, buttons, {
            x: left, y: by, w, h: 104, label: '继续任务', primary: true, fill: '#178D87', fillEnd: '#12536A', accent: '#8AFFDF',
            size: 38, sound: 'confirm', onTap: actions.resume,
        });
        const bw = info.endless ? (w - 12) / 2 : (w - 24) / 3;
        reportButton(ui, buttons, { x: left, y: by - 124, w: bw, h: 84, label: '重新开始', accent: '#6BCCE0', size: 26, onTap: actions.restart });
        if (!info.endless) {
            reportButton(ui, buttons, { x: left + bw + 12, y: by - 124, w: bw, h: 84, label: '返回地图', accent: '#6BCCE0', size: 26, onTap: actions.map });
        }
        reportButton(ui, buttons, { x: left + w - bw, y: by - 124, w: bw, h: 84, label: '返回机库', fill: '#5C263A', fillEnd: '#3A1828', accent: COLORS.red, size: 26, sound: 'back', onTap: actions.hangar });
        this.reveal(buttons, 0.18, 0.3, 12);
    }
}

/** 坠机：红色警示徽记 → 标题 → 数据条 → 看广告复活（每关一次）/ 结束本局。 */
export class SfRevive extends ReportScreen {
    private readonly reviveButton: UiButton;
    private readonly canRevive: boolean;

    constructor(shell: SfShell, parent: Node, canRevive: boolean, info: { stage: string; score: number; coins: number },
        actions: { revive: () => void; giveUp: () => void }) {
        super(shell, parent, 'Revive', COLORS.red, 0.74);
        this.canRevive = canRevive;
        const ui = shell.ui;
        let y = shell.safeTop - 130;
        this.emblem('alert', y, 0);
        y -= 116;
        this.heading('战机坠毁', info.stage, y, '#FF8796', 0.04);
        y -= 100;
        this.divider(y, 0.08);
        y -= 90;
        this.stats([{ label: '当前分数', value: pad6(info.score) }, { label: '本局金币', value: String(info.coins), tone: COLORS.gold }], y, 0.12);
        const w = this.fullW, left = -w / 2;
        const by = Math.min(y - 200, shell.safeBottom + 330);
        const hint = text(ui, this.content, canRevive ? '观看广告原地复活：满血 + 4 秒无敌保护，每关一次' : '本关复活机会已用完',
            0, by + 40, { size: 22, color: canRevive ? '#91B2BA' : '#FF9AA6' });
        this.reveal(hint.node, 0.16, 0.3, 6);
        const buttons = node(this.content, 'Buttons');
        this.reviveButton = reportButton(ui, buttons, {
            x: left, y: by, w, h: 104, label: '看广告复活', primary: true, fill: '#1E8F55', fillEnd: '#145A3C', accent: '#8BFFB8',
            size: 38, sound: 'confirm', onTap: actions.revive,
        });
        this.reviveButton.setEnabled(canRevive);
        reportButton(ui, buttons, { x: left, y: by - 124, w, h: 84, label: '结束本局', fill: '#5C263A', fillEnd: '#3A1828', accent: COLORS.red, sound: 'back', onTap: actions.giveUp });
        this.reveal(buttons, 0.18, 0.3, 12);
    }

    setBusy(busy: boolean): void {
        this.reviveButton.setEnabled(!busy && this.canRevive);
        this.reviveButton.setLabel(busy ? '连接中…' : '看广告复活');
    }
}
