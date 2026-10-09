import { EventTouch, Graphics, Label, Node, Sprite } from 'cc';
import { PLANES, unlockText, type PlaneDef } from '../core/SfPlaneDefs';
import { levelById } from '../core/SfLevels';
import type { PlaneId } from '../core/SfTypes';
import type { SfShell } from './SfShell';
import { HANGAR_PAD_Y, SfShowcase, showcaseLevel } from './SfShowcase';
import { SfPlaneStats } from './SfPlaneStats';
import { SfPlaneDetail } from './SfPlaneDetail';
import { SfCodex } from './SfCodex';
import { openUpgradeSheet } from './SfUpgrade';
import { SfPlaneList } from './SfPlaneList';
import {
    COLORS, blocker, button, color, coverSprite, drawPanel, easeOutCubic, formatNumber, node, num, panel, pixelSprite, sheetIn, sheetOut,
    sprite, tappable, text, verticalGradient, type UiButton, type UiPriceButton,
} from './SfUi';

/** 已完成贴图预热的资源集合（以 SfAssets.frame 区分，每次进入游戏重新加载资源后需要重新预热）。 */
const WARMED = new WeakSet<object>();

/**
 * 机库首页（参考 tidal-wings 首页）：只保留机体名称、类型与等级、火力 / 装甲条、出击模式；
 * 机制、必杀、零件与改装放到「机体详情」页。左右切换机体为直接平移。
 */
export class SfHangar {
    readonly root: Node;
    private index = 0;
    private readonly showcase: SfShowcase;
    private readonly showRoot: Node;
    private readonly lock: Sprite;
    private readonly nameLabel: Label;
    private readonly tagLabel: Label;
    private readonly unlockLabel: Label;
    private readonly goldLabel: Label;
    private readonly dots: Graphics;
    private readonly stats: SfPlaneStats;
    private readonly modeTitle: Label;
    private readonly modeSub: Label;
    private readonly modeIcon: Graphics;
    private readonly modeG: Graphics;
    private readonly modeSwitch: Label;
    private readonly pills: Node;
    private readonly pillG: Graphics;
    private readonly levelLabel: Label;
    private upgradeButton!: UiButton;
    private codex?: SfCodex;
    private readonly padY: number;
    private mainButton!: UiPriceButton;
    private sheet?: Node;
    private detail?: SfPlaneDetail;
    private list?: SfPlaneList;
    private time = 0;
    private swipeStart: { x: number; y: number } | null = null;
    private slide = 0;
    private slideDir = 0;
    private warm?: Node;
    private warmFrames = 0;

    constructor(private readonly shell: SfShell, parent: Node) {
        const ui = shell.ui;
        const w = shell.width, h = shell.height;
        this.root = node(parent, 'Hangar', w, h);
        const bg = sprite(ui, this.root, 'bg/hangar', 10, 10, 0, 0, 'Bg');
        const cover = coverSprite(bg, w, h);
        this.padY = HANGAR_PAD_Y * cover;
        // 深海军蓝压暗：上下更深，中间透出机库场景。
        const shade = node(this.root, 'Shade').addComponent(Graphics);
        verticalGradient(shade, -w / 2, h / 2, w, h, 32, k => ['#04182A', 50 + Math.abs(k - 0.5) * 2 * 130]);
        // 顶栏：返回大厅 | 金币。
        const top = node(this.root, 'Top', 0, 0, 0, shell.safeTop - 44);
        button(ui, top, { w: 132, h: 64, x: -282, y: 0, skin: 'dark', label: '大厅', size: 26, icon: 'icon/arrow-left', sound: 'back', onTap: () => shell.exitToLobby() });
        const goldBox = panel(top, 230, 64, 248, 0);
        pixelSprite(ui, goldBox, 'icon/coin', 0.85, -84, 0, 'Coin');
        this.goldLabel = num(ui, goldBox, '0', 96, 0, { size: 48, color: COLORS.gold, align: 'right' });
        // 布局自下而上：底部按钮 → 模式卡 → 性能卡；飞机对齐背景起飞台圆环中心，名称在其上方。
        const py = this.padY;
        const bottomY = shell.safeBottom + 92;
        const modeY = shell.safeBottom + 254;
        const statsY = Math.max(py - 300, modeY + 150);
        const glow = sprite(ui, this.root, 'fx/aura', 420, 420, 0, py, 'PadGlow');
        glow.color = color('#4FB8FF', 60);
        this.showRoot = node(this.root, 'Show', 0, 0, 0, py);
        this.showcase = new SfShowcase(ui, this.showRoot, 2);
        this.lock = pixelSprite(ui, this.root, 'icon/lock', 2.2, 0, py, 'Lock');
        button(ui, this.root, { w: 64, h: 84, x: -310, y: py, skin: 'dark', icon: 'icon/arrow-left', onTap: () => this.step(-1) });
        button(ui, this.root, { w: 64, h: 84, x: 310, y: py, skin: 'dark', icon: 'icon/arrow-right', onTap: () => this.step(1) });
        // 名称 + 类型 / 等级两枚标签。
        const titleY = Math.min(py + 320, shell.safeTop - 140);
        this.nameLabel = text(ui, this.root, '', 0, titleY, { size: 60, color: COLORS.cream, outline: 4 });
        this.pills = node(this.root, 'Pills', 0, 0, 0, titleY - 58);
        this.pillG = this.pills.addComponent(Graphics);
        this.tagLabel = text(ui, this.pills, '', -70, 0, { size: 22, color: COLORS.white, shadow: false });
        this.levelLabel = text(ui, this.pills, '', 70, 0, { size: 22, color: COLORS.cream, shadow: false });
        // 机体列表入口：名称右侧，展开全部机体网格快速切换。
        const listButton = button(ui, this.root, { w: 150, h: 62, x: 272, y: titleY - 26, skin: 'dark', label: '机体列表', size: 24, onTap: () => this.openList() });
        listButton.label?.node.setPosition(14, 0);
        drawGridGlyph(node(listButton.node.getChildByName('Content') ?? listButton.node, 'Glyph', 0, 0, -56, 0).addComponent(Graphics));
        this.dots = node(this.root, 'Dots', 0, 0, 0, statsY + 92).addComponent(Graphics);
        // 性能卡：标题行（左“机体性能”，右“查看详情 ›”）+ 火力 / 装甲分段条。
        const card = node(this.root, 'StatsCard', 680, 136, 0, statsY);
        drawPanel(card.addComponent(Graphics), 680, 136, { fillAlpha: 205, border: COLORS.foam, borderAlpha: 110, skew: 10 });
        text(ui, card, '机体性能', -320, 42, { size: 20, color: COLORS.foam, align: 'left' });
        const link = node(card, 'DetailLink', 190, 44, 248, 42);
        const lg = link.addComponent(Graphics);
        lg.fillColor = color(COLORS.foam, 40);
        lg.moveTo(-86, 18); lg.lineTo(96, 18); lg.lineTo(86, -18); lg.lineTo(-96, -18); lg.close();
        lg.fill();
        text(ui, link, '查看详情  ›', 0, 0, { size: 22, color: COLORS.foam });
        tappable(card, () => this.openDetail(), ui);
        this.stats = new SfPlaneStats(ui, card, 0, 0, 620);
        this.unlockLabel = text(ui, this.root, '', 0, statsY - 94, { size: 24, color: COLORS.gold, width: 620, outline: 2 });
        // 出击模式卡：点击打开模式选择。
        const mode = node(this.root, 'Mode', 680, 120, 0, modeY);
        this.modeG = mode.addComponent(Graphics);
        this.modeIcon = node(mode, 'Icon', 0, 0, -272, 0).addComponent(Graphics);
        this.modeTitle = text(ui, mode, '', -206, 18, { size: 34, color: COLORS.cream, align: 'left' });
        this.modeSub = text(ui, mode, '', -206, -24, { size: 20, color: COLORS.foam, align: 'left' });
        this.modeSwitch = text(ui, mode, '切换模式', 236, 0, { size: 22, color: COLORS.ink, shadow: false });
        tappable(mode, () => this.openModes(), ui);
        // 底部：改装 | 出击 | 图鉴。
        const bottom = node(this.root, 'Bottom', 0, 0, 0, bottomY);
        this.upgradeButton = button(ui, bottom, { w: 176, h: 104, x: -266, y: 0, skin: 'pink', label: '改装', size: 34, onTap: () => this.openUpgrade() });
        this.mainButton = button(ui, bottom, { w: 300, h: 124, x: 0, y: 4, skin: 'green', label: '出击', sub: '', size: 50, sound: 'confirm', onTap: () => this.onMain() });
        button(ui, bottom, { w: 176, h: 104, x: 266, y: 0, skin: 'blue', label: '图鉴', size: 34, onTap: () => this.openCodex() });
        // 预览区共用同一套手势：轻点进入详情，横向滑动切换机体。
        const swipe = node(this.root, 'Swipe', 520, 420, 0, py);
        swipe.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            e.propagationStopped = true;
            const p = e.getUILocation();
            this.swipeStart = { x: p.x, y: p.y };
        });
        swipe.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            if (this.swipeStart === null) return;
            const p = e.getUILocation();
            const dx = p.x - this.swipeStart.x, dy = p.y - this.swipeStart.y;
            this.swipeStart = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1);
            else if (Math.hypot(dx, dy) < 20) { ui.click?.('tap'); this.openDetail(); }
        });
        swipe.on(Node.EventType.TOUCH_CANCEL, () => { this.swipeStart = null; });
        swipe.setSiblingIndex(2);
        if (!shell.progress.endlessUnlocked) shell.progress.data.mode = 'campaign';
        if (!WARMED.has(ui.frame)) this.buildWarmup();
        const owned = PLANES.findIndex(p => p.id === shell.progress.data.selected);
        this.index = Math.max(0, owned);
        this.refresh();
    }

    private buildWarmup(): void {
        const ui = this.shell.ui;
        this.warm = node(this.root, 'Warmup');
        for (const p of PLANES) {
            const keys = [`plane/${p.id}/body`];
            for (const slot of ['main', 'wing', 'special']) for (let lv = 1; lv <= 3; lv++) keys.push(`plane/${p.id}/${slot}-${lv}`);
            for (const key of keys) sprite(ui, this.warm, key, 8, 8, 0, 0, 'W').color = color('#FFFFFF', 1);
        }
        this.warmFrames = 2;
    }

    private get plane(): PlaneDef { return PLANES[this.index]; }

    private step(dir: number): void {
        this.index = (this.index + dir + PLANES.length) % PLANES.length;
        this.slide = 1;
        this.slideDir = dir;
        this.shell.sfx('ui-swipe', 0.6);
        this.select();
        this.refresh();
    }

    /** 浏览到已拥有且已实现的机体时设为出战机体。 */
    private select(): void {
        const p = this.plane;
        if (this.shell.progress.plane(p.id).owned && p.implemented) {
            this.shell.progress.data.selected = p.id;
            this.shell.save();
        }
    }

    refresh(): void {
        const progress = this.shell.progress;
        const p = this.plane;
        const save = progress.plane(p.id);
        const owned = save.owned;
        this.goldLabel.string = formatNumber(progress.data.gold);
        this.showcase.show(p.id, {
            main: showcaseLevel(save.parts.main), wing: showcaseLevel(save.parts.wing), special: showcaseLevel(save.parts.special),
        }, owned ? '#FFFFFF' : '#1C2C44');
        this.lock.node.active = !owned;
        this.nameLabel.string = p.name;
        this.nameLabel.color = color(owned ? COLORS.cream : COLORS.grey);
        this.tagLabel.string = p.tag;
        this.levelLabel.string = owned ? `Lv.${save.level}` : '未拥有';
        const pg = this.pillG;
        pg.clear();
        pg.fillColor = color(COLORS.ink, 230);
        pg.moveTo(-138, 20); pg.lineTo(6, 20); pg.lineTo(-2, -20); pg.lineTo(-146, -20); pg.close();
        pg.moveTo(2, 20); pg.lineTo(146, 20); pg.lineTo(138, -20); pg.lineTo(-6, -20); pg.close();
        pg.fill();
        pg.fillColor = color(owned ? p.color : '#3A4C58');
        pg.moveTo(-135, 17); pg.lineTo(3, 17); pg.lineTo(-3, -17); pg.lineTo(-141, -17); pg.close();
        pg.fill();
        pg.fillColor = color('#0E3A52');
        pg.moveTo(5, 17); pg.lineTo(143, 17); pg.lineTo(137, -17); pg.lineTo(-1, -17); pg.close();
        pg.fill();
        this.stats.show(progress, p.id, owned);
        const g = this.dots;
        g.clear();
        PLANES.forEach((q, i) => {
            const x = (i - (PLANES.length - 1) / 2) * 24;
            const on = i === this.index;
            g.fillColor = color(on ? COLORS.gold : progress.plane(q.id).owned ? COLORS.foam : '#6F8C9C');
            g.rect(x - (on ? 8 : 5), -3, on ? 16 : 10, 6);
            g.fill();
        });
        const state = progress.unlockState(p.id);
        const endless = progress.data.mode === 'endless';
        const run = endless ? progress.data.endlessRun : undefined;
        this.unlockLabel.string = '';
        this.mainButton.setPrice(null);
        this.mainButton.setSkin('green');
        if (!p.implemented) {
            this.unlockLabel.string = owned ? '研发中 · 将在后续章节开放' : `${unlockText(p.unlock)} · 研发中`;
            this.mainButton.setLabel('研发中');
            this.mainButton.setSub('');
            this.mainButton.setEnabled(false);
        } else if (owned) {
            this.mainButton.setLabel(run ? '继续' : endless ? '起飞' : '出击');
            this.mainButton.setSub(run ? `${PLANES.find(p => p.id === run.plane)!.name} · ${formatNumber(run.distance)} 米` : endless ? '无尽模式' : '');
            this.mainButton.setEnabled(true);
        } else if (p.unlock.type === 'gold') {
            this.unlockLabel.string = unlockText(p.unlock);
            this.mainButton.setLabel('购买');
            this.mainButton.setSub('');
            this.mainButton.setPrice(p.unlock.value);
            this.mainButton.setSkin('gold');
            this.mainButton.setEnabled(state.canBuy);
        } else {
            this.unlockLabel.string = `${unlockText(p.unlock)} · ${state.progress}`;
            this.mainButton.setLabel('未解锁');
            this.mainButton.setSub('');
            this.mainButton.setEnabled(false);
        }
        this.upgradeButton.setEnabled(owned && p.implemented);
        this.drawModeCard(endless);
        if (endless) {
            this.modeTitle.string = '无尽模式';
            this.modeSub.string = run ? `第 ${run.sector} 段 · ${formatNumber(run.distance)} 米` : `最远 ${formatNumber(progress.data.endlessBest)} 米 · 飞得越远奖励越多`;
        } else {
            const level = levelById(progress.latestLevel())!;
            this.modeTitle.string = '战役模式';
            this.modeSub.string = `${level.id} · ${level.name}`;
        }
    }

    private onMain(): void {
        const p = this.plane;
        const progress = this.shell.progress;
        if (!progress.plane(p.id).owned) {
            if (progress.buyPlane(p.id)) {
                progress.data.selected = p.id;
                this.shell.save();
                this.refresh();
            }
            return;
        }
        progress.data.selected = p.id;
        this.shell.save();
        // 战役模式先进入选关页；无尽模式直接起飞。
        if (progress.data.mode === 'endless') this.shell.startEndless();
        else this.shell.openMap();
    }

    /** 模式卡：主色描边的斜切卡片 + 左侧六边形徽记 + 斜纹底 + 右侧“切换模式”双箭头标签（战役金色、无尽青色）。 */
    private drawModeCard(endless: boolean): void {
        const g = this.modeG, tone = endless ? '#5ADCFF' : COLORS.gold;
        g.clear();
        drawPanel(g, 680, 116, { fill: endless ? '#0A3346' : '#2A2410', fillAlpha: 225, border: tone, borderAlpha: 200, skew: 14, corners: true });
        g.fillColor = color(tone, 22);
        for (let x = -240; x < 200; x += 34) { g.moveTo(x, 50); g.lineTo(x + 14, 50); g.lineTo(x - 6, -50); g.lineTo(x - 20, -50); g.close(); }
        g.fill();
        hexagon(g, -272, 0, 44, color(COLORS.ink, 240));
        hexagon(g, -272, 0, 38, color(endless ? '#0F5068' : '#5A4510'));
        g.fillColor = color(tone);
        g.moveTo(170, 24); g.lineTo(318, 24); g.lineTo(308, -24); g.lineTo(160, -24); g.close();
        g.fill();
        g.fillColor = color(COLORS.ink, 200);
        for (let i = 0; i < 2; i++) {
            const x = 290 + i * 10;
            g.moveTo(x, 9); g.lineTo(x + 7, 0); g.lineTo(x, -9); g.lineTo(x - 3, -9); g.lineTo(x + 4, 0); g.lineTo(x - 3, 9); g.close();
        }
        g.fill();
        this.modeSwitch.node.setPosition(222, 0);
        drawModeIcon(this.modeIcon, endless ? 'endless' : 'campaign', 1.1, endless ? '#8CECFF' : '#FFE08A');
    }

    // ───────────────────────────── 模式选择 ─────────────────────────────

    /**
     * 模式选择弹窗：标题条 + 两张大模式卡。每张卡左侧是带光晕的六边形徽记，右侧标题、说明与进度行；
     * 当前模式金色描边 + 右上角“当前”斜角标，未解锁的置灰并显示锁与解锁条件。
     */
    private openModes(): void {
        if (this.busy) return;
        const shell = this.shell, ui = shell.ui, progress = shell.progress;
        const sheet = node(this.root, 'ModeSheet', shell.width, shell.height);
        this.sheet = sheet;
        blocker(sheet, shell.width, shell.height, 200);
        const holder = node(sheet, 'Holder', 0, 0, 0, (shell.safeTop + shell.safeBottom) / 2);
        const card = panel(holder, 660, 620, 0, 0, { corners: true, accent: COLORS.foam });
        const close = () => { if (this.sheet !== sheet) return; this.sheet = undefined; sheetOut(shell.tweens, sheet, holder); };
        const head = node(card, 'Head').addComponent(Graphics);
        head.fillColor = color(COLORS.foam, 30);
        head.rect(-326, 214, 652, 92);
        head.fill();
        head.fillColor = color(COLORS.foam);
        head.rect(-326, 214, 6, 92);
        head.fill();
        text(ui, card, '选择模式', -292, 272, { size: 40, color: COLORS.cream, align: 'left' });
        text(ui, card, '战役逐关推进，无尽挑战最远航程', -292, 232, { size: 20, color: COLORS.foam, align: 'left' });
        button(ui, card, { w: 70, h: 64, x: 270, y: 260, skin: 'red', label: '✕', size: 30, sound: 'back', onTap: close });
        const latest = levelById(progress.latestLevel())!;
        const rows: { mode: 'campaign' | 'endless'; title: string; desc: string; foot: string; open: boolean; tone: string }[] = [
            { mode: 'campaign', title: '战役模式', desc: '逐关挑战首领，赢取星级与金币', foot: `当前进度 ${latest.id} · ${latest.name}`, open: true, tone: COLORS.gold },
            {
                mode: 'endless', title: '无尽模式', desc: '无限航程，飞得越远奖励越多', open: progress.endlessUnlocked, tone: '#5ADCFF',
                foot: progress.endlessUnlocked ? `最远纪录 ${formatNumber(progress.data.endlessBest)} 米` : '通关第 1 章后解锁',
            },
        ];
        rows.forEach((r, i) => {
            const selected = progress.data.mode === r.mode;
            const tone = r.open ? r.tone : '#5C7280';
            const row = node(card, `Mode-${r.mode}`, 600, 186, 0, 82 - i * 206);
            const g = row.addComponent(Graphics);
            drawPanel(g, 600, 182, {
                fill: r.open ? (r.mode === 'endless' ? '#0A3346' : '#2A2410') : '#18222A', fillAlpha: 235,
                border: selected ? COLORS.gold : tone, borderAlpha: selected ? 255 : 140, skew: 14, corners: selected,
            });
            g.fillColor = color(tone, 18);
            for (let x = -120; x < 280; x += 34) { g.moveTo(x, 80); g.lineTo(x + 14, 80); g.lineTo(x - 10, -80); g.lineTo(x - 24, -80); g.close(); }
            g.fill();
            // 徽记：光晕 + 墨色描边六边形 + 主色底。
            g.fillColor = color(tone, r.open ? 46 : 20);
            g.circle(-212, 4, 74);
            g.fill();
            hexagon(g, -212, 4, 58, color(COLORS.ink, 240));
            hexagon(g, -212, 4, 50, color(r.open ? (r.mode === 'endless' ? '#0F5068' : '#5A4510') : '#26323A'));
            drawModeIcon(node(row, 'Icon', 0, 0, -212, 4).addComponent(Graphics), r.mode, 1.5, r.open ? (r.mode === 'endless' ? '#8CECFF' : '#FFE08A') : '#5C7280');
            if (!r.open) pixelSprite(ui, row, 'icon/lock', 0.8, -176, -34, 'Lock');
            text(ui, row, r.title, -128, 44, { size: 38, color: r.open ? COLORS.cream : COLORS.grey, align: 'left' });
            text(ui, row, r.desc, -128, 2, { size: 22, color: r.open ? '#C9E6F0' : '#6F8C9C', align: 'left', bold: false });
            g.fillColor = color(tone, 60);
            g.rect(-128, -36, 400, 2);
            g.fill();
            text(ui, row, r.foot, -128, -58, { size: 20, color: r.open ? tone : '#6F8C9C', align: 'left' });
            if (selected) {
                g.fillColor = color(COLORS.gold);
                g.moveTo(196, 91); g.lineTo(300, 91); g.lineTo(300, 38); g.close();
                g.fill();
                const tag = text(ui, row, '当前', 262, 72, { size: 18, color: COLORS.ink, shadow: false });
                tag.node.angle = -27;
            }
            tappable(row, () => {
                if (!r.open) { shell.sfx('ui-deny'); shell.toast(r.foot); return; }
                progress.data.mode = r.mode;
                shell.save();
                this.refresh();
                close();
            }, ui);
        });
        sheetIn(shell.tweens, sheet, holder);
    }

    // ───────────────────────────── 机体列表 ─────────────────────────────

    private openList(): void {
        if (this.busy) return;
        this.list = new SfPlaneList(this.shell, this.root, this.plane.id, id => {
            const target = PLANES.findIndex(p => p.id === id);
            if (target < 0 || target === this.index) return;
            this.slideDir = target > this.index ? 1 : -1;
            this.index = target;
            this.slide = 1;
            this.shell.sfx('ui-swipe', 0.6);
            this.select();
            this.refresh();
        }, () => { this.list = undefined; });
    }

    /** 已有子界面（详情、弹窗、图鉴、机体列表）打开时，不再响应新的打开请求。 */
    private get busy(): boolean {
        return !!(this.detail || this.sheet || this.codex || this.list);
    }

    // ───────────────────────────── 机体详情 ─────────────────────────────

    private openDetail(): void {
        if (this.busy) return;
        this.detail = new SfPlaneDetail(this.shell, this.root, this.plane, () => {
            this.detail = undefined;
            this.refresh();
        });
    }

    private openCodex(): void {
        if (this.busy) return;
        this.codex = new SfCodex(this.shell, this.root, () => { this.codex = undefined; });
    }

    private openUpgrade(): void {
        if (this.busy) return;
        this.sheet = openUpgradeSheet(this.shell, this.root, this.plane, () => this.refresh(), () => { this.sheet = undefined; });
    }

    update(dt: number): void {
        this.time += dt;
        if (this.warm && --this.warmFrames <= 0) {
            this.warm.destroy();
            this.warm = undefined;
            WARMED.add(this.shell.ui.frame);
        }
        const bob = Math.sin(this.time * 2.2) * 10;
        // 切换：新机体从切换方向平移进场。
        if (this.slide > 0) this.slide = Math.max(0, this.slide - dt / 0.26);
        const x = (1 - easeOutCubic(1 - this.slide)) * 320 * this.slideDir;
        this.showRoot.setPosition(x, this.padY + bob);
        this.showcase.update(dt, this.shell.progress.plane(this.plane.id).owned);
        this.lock.node.setPosition(x, this.padY + bob);
        this.detail?.update(dt);
        this.codex?.update(dt);
        this.list?.update(dt);
    }

    selected(): PlaneId { return this.plane.id; }

    dispose(): void {
        this.root.destroy();
    }
}

/** 模式图标：战役为三层向上的 V 形，无尽为无限符号；scale 缩放，tone 覆盖颜色（未解锁置灰）。 */
function drawModeIcon(g: Graphics, mode: 'campaign' | 'endless', scale: number, tone?: string): void {
    g.clear();
    const k = scale;
    if (mode === 'campaign') {
        g.fillColor = color(tone ?? COLORS.gold);
        for (let i = 0; i < 3; i++) {
            const y = (i - 1) * 13 * k;
            g.moveTo(-20 * k, y - 6 * k); g.lineTo(0, y + 8 * k); g.lineTo(20 * k, y - 6 * k);
            g.lineTo(20 * k, y - 13 * k); g.lineTo(0, y + 1 * k); g.lineTo(-20 * k, y - 13 * k); g.close();
        }
        g.fill();
    } else {
        g.strokeColor = color(tone ?? COLORS.foam);
        g.lineWidth = 6 * k;
        g.circle(-11 * k, 0, 11 * k);
        g.circle(11 * k, 0, 11 * k);
        g.stroke();
    }
}

/** 列表图标：2×2 小方格（按钮左侧）。 */
function drawGridGlyph(g: Graphics): void {
    g.fillColor = color(COLORS.foam);
    for (const [x, y] of [[-9, 1], [1, 1], [-9, -9], [1, -9]]) g.rect(x, y, 8, 8);
    g.fill();
}

/** 尖顶朝上的六边形填充。 */
function hexagon(g: Graphics, cx: number, cy: number, r: number, fill: ReturnType<typeof color>): void {
    g.fillColor = fill;
    for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3;
        if (k === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.close();
    g.fill();
}
