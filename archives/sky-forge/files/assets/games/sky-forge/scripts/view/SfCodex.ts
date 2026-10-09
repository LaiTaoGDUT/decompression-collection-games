import { EventTouch, Graphics, Label, Mask, Node, Sprite, UITransform } from 'cc';
import { ENEMY_DEFS } from '../core/SfEnemies';
import { BOSS_INFO } from '../core/SfBosses';
import { CHAPTERS } from '../core/SfLevels';
import type { SfShell } from './SfShell';
import {
    COLORS, blocker, button, cap, color, coverSprite, drawPanel, easeOutCubic, node, opacity, panel, sheetIn, sheetOut,
    size, sprite, tappable, text, verticalGradient, type UiButton,
} from './SfUi';

interface Entry {
    id: string;
    name: string;
    frame: string;
    intro: string;
    chapter: number;
    tag: string;
    tint?: string;
    seen: boolean;
}

const SIZE_TAG: Record<string, string> = { small: '小型', medium: '中型', large: '大型', elite: '精英' };
const TIER_TAG: Record<string, string> = { small: '首领', mid: '首领', big: '大首领', hidden: '隐藏首领' };
const COLS = 3;
const CARD_W = 210, CARD_H = 230;

/**
 * 图鉴：敌机 / 首领两个分页。遇到过的敌机、击败过的首领显示图像与名称，其余显示剪影与“？？？”。
 * 列表可上下拖动；点开条目查看大图与介绍。敌人贴图在章节资源里，打开图鉴时按需加载（经 AssetService）。
 */
export class SfCodex {
    readonly root: Node;
    private readonly view: Node;
    private readonly list: Node;
    private readonly count: Label;
    private readonly tabs: UiButton[] = [];
    private tab: 'enemy' | 'boss' = 'enemy';
    private scroll = 0;
    private maxScroll = 0;
    private dragY: number | null = null;
    private slide = 1;
    private closing = false;
    private sheet?: Node;
    private disposed = false;

    constructor(private readonly shell: SfShell, parent: Node, private readonly onClose: () => void) {
        const ui = shell.ui;
        const w = shell.width, h = shell.height;
        this.root = node(parent, 'Codex', w, h);
        blocker(this.root, w, h, 0);
        const bg = sprite(ui, this.root, 'bg/hangar', 10, 10, 0, 0, 'Bg');
        coverSprite(bg, w, h);
        const shade = node(this.root, 'Shade').addComponent(Graphics);
        verticalGradient(shade, -w / 2, h / 2, w, h, 32, k => ['#03121F', 215 + k * 30]);
        const top = node(this.root, 'Top', 0, 0, 0, shell.safeTop - 44);
        button(ui, top, { w: 132, h: 64, x: -282, y: 0, skin: 'dark', label: '返回', size: 26, icon: 'icon/arrow-left', sound: 'back', onTap: () => this.close() });
        text(ui, top, '图鉴', 0, 0, { size: 44, color: COLORS.cream, outline: 3 });
        this.count = text(ui, top, '', 345, 0, { size: 22, color: COLORS.foam, align: 'right' });
        // 分页按钮。
        const tabs = node(this.root, 'Tabs', 0, 0, 0, shell.safeTop - 140);
        (['enemy', 'boss'] as const).forEach((t, i) => {
            this.tabs.push(button(ui, tabs, { w: 300, h: 72, x: -160 + i * 320, y: 0, skin: 'dark', label: t === 'enemy' ? '敌机' : '首领', size: 30, onTap: () => this.setTab(t) }));
        });
        // 可拖动的列表区域（Mask 裁切）。
        const viewTop = shell.safeTop - 190, viewBottom = shell.safeBottom + 30;
        this.view = node(this.root, 'View', w, viewTop - viewBottom, 0, (viewTop + viewBottom) / 2);
        this.view.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.list = node(this.view, 'List');
        // 捕获阶段监听：卡片会阻止冒泡，拖动从卡片上开始也能滚动（卡片自身按位移判断是否算点击）。
        this.view.on(Node.EventType.TOUCH_START, (e: EventTouch) => { this.dragY = e.getUILocation().y; }, this, true);
        this.view.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (this.dragY === null) return;
            const y = e.getUILocation().y;
            this.scroll = cap(this.scroll + (y - this.dragY), 0, this.maxScroll);
            this.dragY = y;
        }, this, true);
        this.view.on(Node.EventType.TOUCH_END, () => { this.dragY = null; }, this, true);
        this.view.on(Node.EventType.TOUCH_CANCEL, () => { this.dragY = null; }, this, true);
        this.root.setPosition(w, 0);
        this.setTab('enemy');
    }

    private entries(): Entry[] {
        const data = this.shell.progress.data;
        const open = new Set(CHAPTERS.filter(c => c.available).map(c => c.id));
        if (this.tab === 'enemy') {
            const order = ['small', 'medium', 'large', 'elite'];
            return Object.keys(ENEMY_DEFS).map(k => ENEMY_DEFS[k])
                .filter(d => d.size !== 'part' && d.size !== 'boss' && open.has(d.chapter))
                .sort((a, b) => a.chapter - b.chapter || order.indexOf(a.size) - order.indexOf(b.size))
                .map(d => ({ id: d.id, name: d.name, frame: d.frame, intro: d.intro, chapter: d.chapter, tag: SIZE_TAG[d.size] ?? '', seen: data.seenEnemies.indexOf(d.id) >= 0 }));
        }
        return Object.keys(BOSS_INFO).map(k => BOSS_INFO[k]).filter(b => open.has(b.chapter)).map(b => ({
            id: b.id, name: b.name, frame: b.frame, intro: b.intro, chapter: b.chapter, tag: TIER_TAG[b.tier] ?? '首领',
            tint: b.tier === 'hidden' ? '#B98CFF' : undefined,
            seen: b.tier === 'hidden' ? data.hiddenKills.indexOf(b.id) >= 0 : data.bossKills.indexOf(b.id) >= 0,
        }));
    }

    private setTab(t: 'enemy' | 'boss'): void {
        this.tab = t;
        this.tabs.forEach((b, i) => b.setSkin((i === 0) === (t === 'enemy') ? 'blue' : 'dark'));
        this.scroll = 0;
        this.build();
    }

    private build(): void {
        const ui = this.shell.ui;
        this.list.removeAllChildren();
        const list = this.entries();
        const seen = list.filter(e => e.seen).length;
        this.count.string = `已发现 ${seen}/${list.length}`;
        const viewH = this.view.getComponent(UITransform)!.height;
        const rows = Math.ceil(list.length / COLS);
        this.maxScroll = Math.max(0, rows * (CARD_H + 18) - viewH + 20);
        list.forEach((e, i) => {
            const x = (i % COLS - (COLS - 1) / 2) * (CARD_W + 18);
            const y = viewH / 2 - CARD_H / 2 - 10 - Math.floor(i / COLS) * (CARD_H + 18);
            const card = node(this.list, `Card-${e.id}`, CARD_W, CARD_H, x, y);
            drawPanel(card.addComponent(Graphics), CARD_W, CARD_H, {
                fill: e.seen ? '#0A2C40' : '#0A1A26', border: e.seen ? (e.tint ?? COLORS.foam) : '#2E4C5C', borderAlpha: e.seen ? 200 : 140,
            });
            const img = sprite(ui, card, e.frame, 10, 10, 0, 22, 'Img');
            this.fit(img, e.frame, 150, 130);
            img.color = color(e.seen ? (e.tint ?? '#FFFFFF') : '#0B1C2A');
            text(ui, card, e.seen ? e.name : '？？？', 0, -74, { size: 24, color: e.seen ? COLORS.cream : COLORS.grey });
            text(ui, card, `${e.tag} · 第 ${e.chapter} 章`, 0, -100, { size: 18, color: '#6F99A6', bold: false });
            tappable(card, () => {
                if (!e.seen) { this.shell.toast(this.tab === 'enemy' ? '在关卡中遇到后解锁' : '击败该首领后解锁'); return; }
                this.openEntry(e);
            }, ui);
        });
    }

    private fit(s: Sprite, key: string, w: number, h: number): void {
        const f = this.shell.ui.frame(key);
        if (!f) { size(s.node, w * 0.6, h * 0.6); return; }
        const k = Math.min(w / f.originalSize.width, h / f.originalSize.height, 3);
        size(s.node, f.originalSize.width * k, f.originalSize.height * k);
    }

    private openEntry(e: Entry): void {
        if (this.sheet) return;
        const shell = this.shell, ui = shell.ui;
        const sheet = node(this.root, 'Entry', shell.width, shell.height);
        this.sheet = sheet;
        blocker(sheet, shell.width, shell.height, 190);
        const holder = node(sheet, 'Holder', 0, 0, 0, (shell.safeTop + shell.safeBottom) / 2);
        const card = panel(holder, 640, 640, 0, 0, { corners: true, accent: e.tint ?? COLORS.foam });
        const close = () => { if (this.sheet !== sheet) return; this.sheet = undefined; sheetOut(shell.tweens, sheet, holder); };
        button(ui, card, { w: 70, h: 64, x: 270, y: 272, skin: 'red', label: '✕', size: 30, sound: 'back', onTap: close });
        const img = sprite(ui, card, e.frame, 10, 10, 0, 110, 'Img');
        this.fit(img, e.frame, 360, 260);
        if (e.tint) img.color = color(e.tint);
        text(ui, card, e.name, 0, -60, { size: 40, color: COLORS.cream, outline: 3 });
        text(ui, card, `${e.tag} · 第 ${e.chapter} 章`, 0, -106, { size: 22, color: COLORS.foam });
        text(ui, card, e.intro, 0, -180, { size: 24, color: '#C9E6F0', width: 560, wrap: true, bold: false });
        sheetIn(shell.tweens, sheet, holder);
    }

    private close(): void {
        if (this.closing || this.sheet) return;
        this.closing = true;
        this.slide = 0;
    }

    update(dt: number): void {
        const w = this.shell.width;
        this.list.setPosition(0, this.scroll);
        if (this.closing) {
            this.slide = Math.min(1, this.slide + dt / 0.24);
            this.root.setPosition(easeOutCubic(this.slide) * w, 0);
            if (this.slide >= 1) { this.disposed = true; this.root.destroy(); this.onClose(); }
        } else if (this.slide > 0) {
            this.slide = Math.max(0, this.slide - dt / 0.28);
            this.root.setPosition((1 - easeOutCubic(1 - this.slide)) * w, 0);
            opacity(this.root, 255);
        }
    }
}
