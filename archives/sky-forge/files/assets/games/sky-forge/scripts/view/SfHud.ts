import { Graphics, Label, Node, Sprite, UIOpacity } from 'cc';
import type { SfCombat } from '../core/SfCombat';
import type { CombatEvent } from '../core/SfTypes';
import { SLOTS } from '../core/SfBalance';
import { PLANE_BY_ID } from '../core/SfPlaneDefs';
import { PLANE_ART } from '../core/SfPlaneArt';
import {
    COLORS, button, cap, color, drawPauseGlyph, easeOutBack, easeOutCubic, node, num, opacity, pad6, pixelSprite, popScale, size,
    sprite, text, type UiContext,
} from './SfUi';

const U = 750 / 360;
const LAYER_COLORS = ['#FF4A5E', '#FF8A3D', '#FFC23A', '#C77DFF', '#5AB4FF'];
const SLOT_HEX = ['#FF6A5A', '#5AB4FF', '#6AE07A'];
const PHASE_TEXT = ['', '第一阶段', '第二阶段', '第三阶段', '第四阶段', '第五阶段'];
/** 顶部第一行（金币 / 分数 / 暂停）的纵向位置（相对胶囊下沿）；下面左侧是装甲与必杀格，右侧是装备。 */
const ROW1 = -40;
const ARMOR_Y = -98;
const SPECIAL_Y = -130;
const GEAR_Y = [-116, -146, -176];

interface Popup {
    root: Node;
    chain: Label;
    score: Label;
    echoA: Label;
    echoB: Label;
    coinRow: Node;
    coinText: Label;
    active: boolean;
    age: number;
    life: number;
    x: number; y: number;
    chainCount: number;
}

interface CoinFly { node: Node; t: number; delay: number; x0: number; y0: number }
interface FloatText { node: Node; t: number; x: number; y: number }

/**
 * 战斗 HUD：信息全部集中在顶部，不铺压暗底板；层次靠像素数字的烘焙描边 / 投影与文字投影。
 * 第一行：金币 | 分数 | 暂停；第二行：生命与零件 | （无尽距离）| 必杀能量。
 * 机体机制量表跟随在玩家飞机下方。屏幕坐标，不随世界层震动。
 */
export class SfHud {
    readonly root: Node;
    private readonly vignette: Graphics;
    private readonly top: Node;
    private readonly topG: Graphics;
    private readonly coins: Label;
    private readonly coinIcon: Sprite;
    private readonly coinGain: Label;
    private readonly score: Label;
    private readonly scoreEchoA: Label;
    private readonly scoreEchoB: Label;
    private readonly scoreGain: Label;
    private readonly distance: Label;
    private readonly gearIcons: Sprite[] = [];
    private readonly gauge: Graphics;
    private readonly combo: Node;
    private readonly comboG: Graphics;
    private readonly comboLabel: Label;
    private readonly comboValue: Label;
    private readonly comboEchoA: Label;
    private readonly comboEchoB: Label;
    private readonly bossBar: Node;
    private readonly bossG: Graphics;
    private readonly bossName: Label;
    private readonly bossLayers: Label;
    private readonly bossBreak: Label;
    private readonly notice: Node;
    private readonly noticeG: Graphics;
    private readonly noticeTitle: Label;
    private readonly noticeSub: Label;
    private readonly banner: Node;
    private readonly bannerG: Graphics;
    private readonly bannerTitle: Label;
    private readonly bannerSub: Label;
    private readonly warning: Node;
    private readonly warningG: Graphics;
    private readonly warningLabel: Label;
    private readonly toast: Label;
    private readonly popupLayer: Node;
    private readonly popups: Popup[] = [];
    private readonly coinFlies: CoinFly[] = [];
    private readonly floats: FloatText[] = [];
    private width = 750;
    private height = 1334;
    private safeTop = 600;
    private safeBottom = -600;
    private time = 0;
    private shownScore = 0;
    private shownCoins = 0;
    private scorePulse = 0;
    private coinPulse = 0;
    private lastScoreGain = 0;
    private lastCoinGain = 0;
    private comboPulse = 0;
    private lastCombo = 0;
    private bossChip = 1;
    private bossBounds: number[] = [1, 0];
    private bossLayerShown = 0;
    private breakClock = 0;
    private noticeClock = 0;
    private bannerClock = -1;
    private toastClock = 0;
    private warningClock = -1;
    private warningHidden = false;
    private heartPulse = 0;
    private lastHp = -1;
    private gearKeys: string[] = ['', '', ''];

    constructor(private readonly ui: UiContext, parent: Node, private readonly onPause: () => void,
        private readonly toScreen: (x: number, y: number) => { x: number; y: number }) {
        this.root = node(parent, 'Hud');
        this.vignette = node(this.root, 'Vignette').addComponent(Graphics);
        this.gauge = node(this.root, 'MechanicGauge').addComponent(Graphics);
        this.popupLayer = node(this.root, 'Popups');
        // 第一行：金币 | 分数 | 暂停。
        this.top = node(this.root, 'Top');
        this.topG = node(this.top, 'G').addComponent(Graphics);
        this.coinIcon = pixelSprite(ui, this.top, 'icon/coin', 0.85, -334, ROW1, 'CoinIcon');
        this.coins = num(ui, this.top, '0', -306, ROW1, { size: 48, color: COLORS.gold, align: 'left' });
        this.coinGain = num(ui, this.top, '', -306, ROW1 + 34, { size: 24, color: COLORS.cream, align: 'left' });
        this.scoreEchoA = num(ui, this.top, '', 0, ROW1, { size: 72, color: COLORS.foam });
        this.scoreEchoB = num(ui, this.top, '', 0, ROW1, { size: 72, color: COLORS.pink });
        this.score = num(ui, this.top, '000000', 0, ROW1, { size: 72, color: COLORS.gold });
        this.scoreGain = num(ui, this.top, '', 0, ROW1 + 44, { size: 24, color: COLORS.gold });
        this.distance = num(ui, this.top, '', 0, ROW1 - 58, { size: 24, color: COLORS.foam });
        // 暂停：与界面其他按钮同款的深色斜切按钮 + 两道竖条。
        const pause = button(ui, this.top, { w: 64, h: 60, x: 314, y: ROW1, skin: 'dark', sound: 'back', onTap: () => this.onPause() });
        drawPauseGlyph(node(pause.node, 'Glyph').addComponent(Graphics));
        // 左侧：装甲格、必杀格（文字标签 + 分段格）；右侧：三个挂点的装备（真实零件图 + 级数格）。
        text(ui, this.top, '装甲', -345, ARMOR_Y, { size: 20, color: COLORS.foam, align: 'left' });
        text(ui, this.top, '必杀', -345, SPECIAL_Y, { size: 20, color: COLORS.foam, align: 'left' });
        SLOTS.forEach((slot, i) => {
            this.gearIcons.push(sprite(ui, this.top, 'plane/vanguard/main-1', 10, 10, 330, GEAR_Y[i], `Gear-${slot}`));
        });
        // 右侧连击。
        this.combo = node(this.root, 'Combo');
        this.comboG = node(this.combo, 'G').addComponent(Graphics);
        this.comboLabel = text(ui, this.combo, '连击', 0, 56, { size: 24, color: COLORS.gold, align: 'right' });
        this.comboEchoA = num(ui, this.combo, '', 0, 0, { size: 96, color: COLORS.foam, align: 'right' });
        this.comboEchoB = num(ui, this.combo, '', 0, 0, { size: 96, color: COLORS.pink, align: 'right' });
        this.comboValue = num(ui, this.combo, '', 0, 0, { size: 96, color: COLORS.gold, align: 'right' });
        // Boss 血条（无阶级文字，用骷髅图标标识）。
        this.bossBar = node(this.root, 'BossBar');
        this.bossG = node(this.bossBar, 'G').addComponent(Graphics);
        pixelSprite(ui, this.bossBar, 'icon/skull', 0.8, -318, 22, 'Skull');
        this.bossName = text(ui, this.bossBar, '', -290, 22, { size: 28, color: COLORS.cream, align: 'left' });
        this.bossLayers = num(ui, this.bossBar, '', 346, 22, { size: 48, color: COLORS.cream, align: 'right' });
        this.bossBreak = text(ui, this.bossBar, '击破一层', 0, -34, { size: 24, color: COLORS.cream });
        // 阶段提示、开场横幅、Boss 预警、提示语。
        this.notice = node(this.root, 'Notice');
        this.noticeG = node(this.notice, 'G').addComponent(Graphics);
        this.noticeTitle = text(ui, this.notice, '', 0, 6, { size: 52, color: COLORS.cream, outline: 3 });
        this.noticeSub = text(ui, this.notice, '', 0, -46, { size: 24, color: COLORS.red });
        this.banner = node(this.root, 'Banner');
        this.bannerG = node(this.banner, 'G').addComponent(Graphics);
        this.bannerTitle = num(ui, this.banner, '', 0, 24, { size: 96, color: COLORS.cream });
        this.bannerSub = text(ui, this.banner, '', 0, -46, { size: 28, color: COLORS.foam });
        this.warning = node(this.root, 'Warning');
        this.warningG = node(this.warning, 'G').addComponent(Graphics);
        this.warningLabel = text(ui, this.warning, '首领来袭', 0, 0, { size: 56, color: COLORS.red, outline: 3 });
        this.toast = text(ui, this.root, '', 0, 0, { size: 30, color: COLORS.cream, outline: 3 });
        this.reset();
    }

    layout(width: number, height: number, safeTop: number, safeBottom: number): void {
        this.width = width; this.height = height; this.safeTop = safeTop; this.safeBottom = safeBottom;
        size(this.root, width, height);
        this.top.setPosition(0, safeTop);
        this.combo.setPosition(width / 2 - 26, safeTop - Math.min(height * 0.34, safeTop - safeBottom - 420));
        this.bossBar.setPosition(0, safeTop - 236);
        this.notice.setPosition(0, safeTop - 330);
        this.banner.setPosition(0, (safeTop + safeBottom) / 2 + 100);
        this.warning.setPosition(0, (safeTop + safeBottom) / 2 + 160);
        this.toast.node.setPosition(0, safeTop - 420);
    }

    reset(): void {
        this.bossBar.active = false;
        this.notice.active = false;
        this.banner.active = false;
        this.combo.active = false;
        this.warning.active = false;
        this.toast.node.active = false;
        this.coinGain.string = '';
        this.scoreGain.string = '';
        this.shownScore = 0;
        this.shownCoins = 0;
        this.bannerClock = -1;
        this.warningClock = -1;
        this.lastHp = -1;
        for (const p of this.popups) { p.active = false; p.root.active = false; }
        for (const c of this.coinFlies) c.node.destroy();
        this.coinFlies.length = 0;
    }

    showToast(value: string, seconds = 1.6): void {
        this.toast.string = value;
        this.toast.node.active = true;
        this.toastClock = seconds;
    }

    setVisible(value: boolean): void { this.root.active = value; }

    consume(c: SfCombat, events: CombatEvent[]): void {
        for (const e of events) {
            switch (e.type) {
                case 'level-intro':
                case 'sector':
                    this.bannerTitle.string = c.config.endless ? String(c.sector) : c.level.id;
                    this.bannerSub.string = c.config.endless ? `无尽模式 · 第 ${c.sector} 段` : c.level.name;
                    this.bannerClock = 0;
                    this.banner.active = true;
                    break;
                case 'score':
                    this.spawnPopup(e.x ?? 0, e.y ?? 0, e.value ?? 0, e.coins ?? 0, e.chain ?? 1);
                    this.scorePulse = 1;
                    this.lastScoreGain = e.value ?? 0;
                    if ((e.coins ?? 0) > 0) this.flyCoins(e.x ?? 0, e.y ?? 0, Math.min(6, e.coins ?? 0), e.coins ?? 0);
                    break;
                case 'boss-warning':
                    this.warningClock = 0;
                    this.warning.active = true;
                    // 隐藏首领：警示带与文字改为紫色调。
                    this.warningHidden = e.text === 'hidden';
                    this.warningLabel.string = this.warningHidden ? '隐藏首领来袭' : '首领来袭';
                    break;
                case 'boss-enter': {
                    const boss = c.boss;
                    this.bossName.string = e.text ?? '';
                    this.bossBounds = boss ? boss.layerBounds : [1, 0];
                    this.bossLayerShown = this.bossBounds.length - 1;
                    this.bossChip = 1;
                    this.bossBar.active = true;
                    this.warning.active = false;
                    break;
                }
                case 'boss-defeated':
                    this.bossBar.active = false;
                    this.noticeClock = 0;
                    this.notice.active = false;
                    this.warningClock = -1;
                    this.warning.active = false;
                    break;
                case 'fire-buff':
                    this.floatText(e.x ?? c.player.x, e.y ?? c.player.y, '火力强化', '', '#FFB43C');
                    break;
                case 'repair':
                    // value = 1 回复了装甲；0 为满血拾取。
                    if ((e.value ?? 0) > 0) this.floatText(e.x ?? c.player.x, e.y ?? c.player.y, '装甲 +1', '', '#7BF08A');
                    else this.floatText(e.x ?? c.player.x, e.y ?? c.player.y, '装甲已满', '', '#7BF08A');
                    break;
                case 'boss-phase':
                    if (c.phase === 'boss' && (e.value ?? 0) >= 1) {
                        this.noticeTitle.string = PHASE_TEXT[Math.min(5, (e.value ?? 1) + 1)];
                        this.noticeSub.string = e.text && e.text !== c.boss?.name ? e.text : '首领暴怒';
                        this.noticeClock = 2;
                        this.notice.active = true;
                    }
                    break;
            }
        }
    }

    // ───────────────────────────── 飘字 ─────────────────────────────

    private takePopup(): Popup {
        for (const p of this.popups) if (!p.active) return p;
        if (this.popups.length >= 14) {
            let oldest = this.popups[0];
            for (const p of this.popups) if (p.age / p.life > oldest.age / oldest.life) oldest = p;
            return oldest;
        }
        const root = node(this.popupLayer, 'Popup');
        root.addComponent(UIOpacity);
        const chain = text(this.ui, root, '', 0, 38, { size: 24, color: COLORS.orange, outline: 2 });
        const echoA = num(this.ui, root, '', 0, 0, { size: 48, color: COLORS.foam });
        const echoB = num(this.ui, root, '', 0, 0, { size: 48, color: COLORS.pink });
        const score = num(this.ui, root, '', 0, 0, { size: 48, color: COLORS.gold });
        const coinRow = node(root, 'CoinRow', 0, 0, 0, -40);
        pixelSprite(this.ui, coinRow, 'icon/coin', 0.5, -18, 0, 'Coin');
        const coinText = num(this.ui, coinRow, '', 2, 0, { size: 24, color: COLORS.gold, align: 'left' });
        const p: Popup = { root, chain, score, echoA, echoB, coinRow, coinText, active: false, age: 0, life: 0.92, x: 0, y: 0, chainCount: 0 };
        this.popups.push(p);
        return p;
    }

    /** tidal-wings 击杀飘字：七个候选位置避让重叠；连杀 / +分数 / 金币三行。 */
    private spawnPopup(wx: number, wy: number, value: number, coins: number, chain: number): void {
        const s = this.toScreen(wx, wy);
        const p = this.takePopup();
        const halfW = 110, halfH = 56;
        const minY = this.safeTop - 260, maxY = this.safeBottom + 160;
        let bx = cap(s.x, -this.width / 2 + halfW, this.width / 2 - halfW), by = cap(s.y + 40, maxY, minY);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const candidates = [[0, 0], [0, 112 * dir], [0, -112 * dir], [150 * dir, 0], [-150 * dir, 0], [126 * dir, 100 * dir], [-126 * dir, -100 * dir]];
        let best = [bx, by], bestOverlap = Infinity;
        for (const [ox, oy] of candidates) {
            const x = cap(bx + ox, -this.width / 2 + halfW, this.width / 2 - halfW), y = cap(by + oy, maxY, minY);
            let overlap = 0;
            for (const q of this.popups) {
                if (!q.active || q === p) continue;
                const ax = halfW * 2 - Math.abs(x - q.x), ay = halfH * 2 - Math.abs(y - q.y);
                if (ax > 0 && ay > 0) overlap += ax * ay;
            }
            if (overlap < bestOverlap) { bestOverlap = overlap; best = [x, y]; if (overlap === 0) break; }
        }
        bx = best[0]; by = best[1];
        p.active = true;
        p.root.active = true;
        p.age = 0;
        p.chainCount = chain;
        p.life = 0.92 + Math.min(0.3, (chain - 1) * 0.06);
        p.x = bx; p.y = by;
        const str = `+${value}`;
        p.score.string = str;
        p.echoA.string = str;
        p.echoB.string = str;
        p.score.color = color(chain >= 4 ? COLORS.cream : COLORS.gold);
        p.chain.string = chain >= 2 ? `连杀 ×${chain}` : '';
        p.chain.color = color(chain >= 4 ? COLORS.cream : COLORS.orange);
        p.coinRow.active = coins > 0;
        p.coinText.string = `+${coins}`;
        p.root.setSiblingIndex(this.popupLayer.children.length - 1);
    }

    /** 拾取提示：飞机上方弹出主文字（放大回弹）与说明，上浮后淡出。 */
    private floatText(wx: number, wy: number, title: string, sub: string, tone: string): void {
        const s = this.toScreen(wx, wy);
        const n = node(this.popupLayer, 'Float', 0, 0, s.x, s.y + 120);
        n.addComponent(UIOpacity);
        text(this.ui, n, title, 0, 0, { size: 40, color: tone, outline: 3 });
        if (sub) text(this.ui, n, sub, 0, -38, { size: 22, color: COLORS.cream, outline: 2 });
        this.floats.push({ node: n, t: 0, x: cap(s.x, -this.width / 2 + 200, this.width / 2 - 200), y: s.y + 120 });
    }

    private updateFloats(dt: number): void {
        for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.t += dt;
            const k = cap(f.t / 1.3);
            const sc = 0.6 + easeOutBack(cap(f.t / 0.22)) * 0.4;
            f.node.setScale(sc, sc, 1);
            f.node.setPosition(f.x, f.y + easeOutCubic(k) * 70);
            opacity(f.node, 255 * (1 - cap((k - 0.65) / 0.35)));
            if (k >= 1) { f.node.destroy(); this.floats.splice(i, 1); }
        }
    }

    /** 金币从击杀点飞向左上角金币栏（tidal-wings 的 coinBurst）。 */
    private flyCoins(wx: number, wy: number, count: number, total: number): void {
        const s = this.toScreen(wx, wy);
        for (let i = 0; i < count; i++) {
            const n = pixelSprite(this.ui, this.root, 'icon/coin', 0.42, s.x, s.y, 'CoinFly').node;
            this.coinFlies.push({ node: n, t: 0, delay: i * 0.035, x0: s.x + (Math.random() - 0.5) * 40, y0: s.y + (Math.random() - 0.5) * 30 });
        }
        this.lastCoinGain = total;
    }

    // ───────────────────────────── 每帧 ─────────────────────────────

    update(c: SfCombat, dt: number, cameraHit: number): void {
        this.time += dt;
        this.updateTop(c, dt);
        this.updateStatus(c, dt);
        this.updateGauge(c);
        this.updateCombo(c, dt);
        this.updateBoss(c, dt);
        this.updatePopups(dt);
        this.updateCoins(dt);
        this.updateFloats(dt);
        this.updateOverlays(dt, cameraHit, c);
    }

    private updateTop(c: SfCombat, dt: number): void {
        this.shownScore += (c.score - this.shownScore) * Math.min(1, dt * 12);
        if (Math.abs(c.score - this.shownScore) < 1) this.shownScore = c.score;
        this.shownCoins += (c.coins - this.shownCoins) * Math.min(1, dt * 8);
        if (Math.abs(c.coins - this.shownCoins) < 0.05) this.shownCoins = c.coins;
        this.coins.string = String(Math.round(this.shownCoins));
        // 分数跳动（tidal-wings xn）：横向拉伸 + 青粉错位残影 + 上方“+增量”。
        this.scorePulse = Math.max(0, this.scorePulse - dt * 3.2);
        const j = this.scorePulse, k = 1 - j, se = Math.sin(k * Math.PI * 5) * j;
        const scoreText = pad6(this.shownScore);
        this.score.string = scoreText;
        this.score.node.setScale(1 + j * 0.14 + Math.max(0, se) * 0.18, 1 - j * 0.06 + Math.max(0, -se) * 0.1, 1);
        this.score.color = color(j > 0.05 ? COLORS.cream : COLORS.gold);
        this.scoreEchoA.string = j > 0.02 ? scoreText : '';
        this.scoreEchoB.string = j > 0.02 ? scoreText : '';
        this.scoreEchoA.node.setPosition(-j * 10 * U, ROW1);
        this.scoreEchoB.node.setPosition(j * 6 * U, ROW1);
        opacity(this.scoreEchoA.node, j * 0.36 * 255);
        opacity(this.scoreEchoB.node, j * 0.36 * 255);
        this.scoreGain.string = j > 0.04 ? `+${this.lastScoreGain}` : '';
        this.scoreGain.node.setPosition(130, ROW1 + 26 + easeOutCubic(k) * 18);
        opacity(this.scoreGain.node, cap(j * 1.7) * 255);
        this.coinPulse = Math.max(0, this.coinPulse - dt * 3);
        const cj = this.coinPulse, cs = 1 + cj * 0.16 + Math.max(0, Math.sin((1 - cj) * Math.PI * 4) * cj) * 0.18;
        this.coins.node.setScale(cs, cs, 1);
        this.coins.color = color(cj > 0.05 ? COLORS.cream : COLORS.gold);
        this.coinIcon.node.setScale(cs, cs, 1);
        this.coinGain.string = cj > 0.04 ? `+${this.lastCoinGain}` : '';
        opacity(this.coinGain.node, cap(cj * 1.7) * 255);
        this.distance.string = c.config.endless ? `${Math.floor(c.distance)}M` : '';
        // 分数下方的细亮线：加分时向两侧拉开（替代面板边框）。
        const g = this.topG;
        g.clear();
        const lineW = 90 + j * 70;
        g.fillColor = color(j > 0.05 ? COLORS.cream : COLORS.gold, 110 + j * 120);
        g.rect(-lineW, ROW1 - 40, lineW * 2, 2);
        g.fill();
    }

    /** 左侧装甲 / 必杀分段格，右侧装备；外侧各有一道驾驶舱式细框线。 */
    private updateStatus(c: SfCombat, dt: number): void {
        const p = c.player;
        if (this.lastHp >= 0 && p.hp !== this.lastHp) this.heartPulse = 1;
        this.lastHp = p.hp;
        this.heartPulse = Math.max(0, this.heartPulse - dt * 3);
        const g = this.topG;
        const low = p.hp <= 1 && p.alive;
        const blink = low && Math.floor(this.time * 8) % 2 === 0;
        // 装甲：每点生命一格；刚受伤时最新失去的一格闪红。
        const ax = -290, aw = 30, gap = 5;
        for (let i = 0; i < p.maxHp; i++) {
            const x = ax + i * (aw + gap);
            const lit = i < p.hp;
            const lost = i === p.hp && this.heartPulse > 0;
            g.fillColor = color(COLORS.ink, 230);
            g.rect(x - 2, ARMOR_Y - 9, aw + 4, 18);
            g.fill();
            g.fillColor = color(lit ? (low ? (blink ? '#FFD0D8' : COLORS.red) : '#6BE07A') : lost ? '#FF8A9A' : '#24485E', lost ? 255 * this.heartPulse : 255);
            g.rect(x, ARMOR_Y - 7, aw, 14);
            g.fill();
            if (lit) {
                g.fillColor = color('#FFFFFF', 90);
                g.rect(x, ARMOR_Y + 4, aw, 3);
                g.fill();
            }
        }
        // 必杀：十格，满能量时整排金色闪烁。
        const energy = cap(p.energy / 100);
        const full = energy >= 1 && !c.ultimate;
        const plane = PLANE_BY_ID[c.config.plane];
        const flash = full && Math.floor(this.time * 8) % 2 === 0;
        const sw = 11, sg = 3;
        for (let i = 0; i < 10; i++) {
            const x = ax + i * (sw + sg);
            const fill = cap(energy * 10 - i);
            g.fillColor = color(COLORS.ink, 230);
            g.rect(x - 1, SPECIAL_Y - 8, sw + 2, 16);
            g.fill();
            g.fillColor = color('#24485E');
            g.rect(x, SPECIAL_Y - 6, sw, 12);
            g.fill();
            if (fill > 0) {
                g.fillColor = color(full ? (flash ? '#FFF5AD' : COLORS.gold) : plane.color);
                g.rect(x, SPECIAL_Y - 6, sw * fill, 12);
                g.fill();
            }
        }
        // 驾驶舱式细框线：左右两侧竖线 + 端点短横。
        g.fillColor = color(COLORS.foam, 120);
        g.rect(-356, SPECIAL_Y - 12, 2, ARMOR_Y - SPECIAL_Y + 24);
        g.rect(-356, ARMOR_Y + 10, 10, 2);
        g.rect(-356, SPECIAL_Y - 12, 10, 2);
        g.rect(354, GEAR_Y[2] - 14, 2, GEAR_Y[0] - GEAR_Y[2] + 28);
        g.rect(346, GEAR_Y[0] + 12, 10, 2);
        g.rect(346, GEAR_Y[2] - 14, 10, 2);
        g.fill();
        // 装备：真实零件图（未拾取时显示 1 级外形并压暗）+ 左侧三格级数。
        SLOTS.forEach((slot, i) => {
            const level = c.fieldParts[slot];
            const key = `plane/${c.config.plane}/${slot}-${Math.max(1, level)}`;
            const icon = this.gearIcons[i];
            if (this.gearKeys[i] !== key) {
                const f = this.ui.frame(key);
                icon.spriteFrame = f ?? null;
                if (f) {
                    const k = Math.min(36 / f.originalSize.width, 28 / f.originalSize.height);
                    size(icon.node, f.originalSize.width * k, f.originalSize.height * k);
                }
                this.gearKeys[i] = key;
            }
            icon.color = color(level > 0 ? '#FFFFFF' : '#4A6070', level > 0 ? 255 : 200);
            for (let k = 0; k < 3; k++) {
                const x = 296 - (2 - k) * 15;
                g.fillColor = color(COLORS.ink, 230);
                g.rect(x - 1, GEAR_Y[i] - 7, 13, 14);
                g.fill();
                g.fillColor = color(k < level ? SLOT_HEX[i] : '#24485E');
                g.rect(x, GEAR_Y[i] - 6, 11, 12);
                g.fill();
            }
        });
    }

    /** 机体机制量表（热度 / 连锁 / 锁定）与火力强化剩余时间：小条跟随在玩家飞机下方。 */
    private updateGauge(c: SfCombat): void {
        const g = this.gauge;
        g.clear();
        const p = c.player;
        const kit = c.kit;
        if (!p.alive || (kit.gauge === undefined && !c.buffActive)) return;
        const art = PLANE_ART[c.config.plane];
        const s = this.toScreen(p.x, p.y - (art ? art.size[1] / 2 : 60) - 22);
        const w = 96, h = 7;
        // 飞机贴着底部安全区时，量表上移压在机尾，不越出安全区。
        s.y = Math.max(s.y, this.safeBottom + 4);
        const value = c.buffActive ? cap(c.buff / 10) : cap(kit.gauge ?? 0);
        const tone = c.buffActive ? '#FFB43C' : PLANE_BY_ID[c.config.plane].color;
        g.fillColor = color(COLORS.ink, 200);
        g.rect(s.x - w / 2 - 2, s.y - 2, w + 4, h + 4);
        g.fill();
        g.fillColor = color(tone, 235);
        g.rect(s.x - w / 2, s.y, w * value, h);
        g.fill();
    }

    /** tidal-wings 连击读数（右侧）：脉冲伸缩、5π 摆动、呼吸、青粉残影、速线、倒计时条与五格进度。 */
    private updateCombo(c: SfCombat, dt: number): void {
        const combo = c.combo;
        if (combo !== this.lastCombo) {
            if (combo > this.lastCombo) this.comboPulse = 1;
            this.lastCombo = combo;
        }
        this.combo.active = combo >= 2 && c.comboTimer > 0;
        if (!this.combo.active) return;
        this.comboPulse = Math.max(0, this.comboPulse - dt * 4.6);
        const tier = combo >= 15 ? 3 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0;
        const tone = tier === 3 ? COLORS.cream : tier === 2 ? COLORS.foam : tier === 1 ? COLORS.orange : COLORS.gold;
        const j = this.comboPulse, phase = 1 - j;
        const wobble = Math.sin(phase * Math.PI * 5) * j;
        const breathe = (Math.sin(this.time * 5.2) + 1) * 0.5;
        const windowRatio = cap(c.comboTimer / 1.5);
        const warn = windowRatio < 0.25;
        opacity(this.combo, warn && Math.floor(this.time * 15) % 2 ? 107 : 255);
        const value = `X${combo}`;
        const fs = tier >= 2 ? 96 : 72;
        for (const l of [this.comboValue, this.comboEchoA, this.comboEchoB]) { l.string = value; l.fontSize = fs; l.lineHeight = fs; }
        this.comboValue.color = color(warn ? COLORS.red : tone);
        this.comboValue.node.setPosition((-j * 4 + wobble * 3) * U, 8);
        this.comboValue.node.angle = -wobble * 0.018 * 180 / Math.PI;
        this.comboValue.node.setScale(1 + j * 0.5 + breathe * 0.015, 1 - j * 0.12 + breathe * 0.01, 1);
        this.comboEchoA.node.setPosition((-12 - j * 7) * U, 8);
        this.comboEchoB.node.setPosition((7 + j * 4) * U, 8);
        opacity(this.comboEchoA.node, j * 0.4 * 255);
        opacity(this.comboEchoB.node, j * 0.4 * 255);
        this.comboEchoA.node.setScale(this.comboValue.node.scale);
        this.comboEchoB.node.setScale(this.comboValue.node.scale);
        this.comboLabel.string = tier === 3 ? '王牌连击' : '连击';
        this.comboLabel.color = color(warn ? COLORS.red : tone);
        this.comboLabel.node.setPosition(0, 26 + fs * 0.5);
        const g = this.comboG;
        g.clear();
        if (j > 0.02) {
            g.fillColor = color(tone, (0.28 + j * 0.4) * 255);
            for (let i = 0; i < 7; i++) {
                const len = (22 + j * (52 + i * 9)) * U;
                g.rect(-len - (i * 6 + phase * 14) * U - fs * 1.4, (27 - i * 9) * U - 20, len, i % 2 ? 2 : 4);
            }
            g.fill();
        }
        // 倒计时条放在数字下方，留出间距。
        const len = (112 + tier * 8) * U, y = -fs * 0.62 - 26;
        g.fillColor = color('#051F31', 194);
        g.rect(-len, y, len, 8 * U);
        g.fill();
        const fillW = Math.max(5, Math.round(len * windowRatio));
        g.fillColor = color(warn ? COLORS.red : tone);
        g.rect(-fillW, y, fillW, 8 * U);
        g.fill();
        g.fillColor = color(COLORS.cream, 173);
        g.rect(-fillW, y + 4 * U, fillW, 2 * U);
        g.fill();
    }

    /** tidal-wings Boss 血条：分层颜色（每层对应一个攻击阶段）、滞后掉血条、十等分刻度、剩余层数与“击破一层”。 */
    private updateBoss(c: SfCombat, dt: number): void {
        if (!this.bossBar.active || !c.boss) return;
        const ratio = c.boss.hpRatio;
        const bounds = this.bossBounds;
        // 层号从底部数起：最后一层 = 1。
        const layerOf = (r: number) => {
            let i = 0;
            while (i < bounds.length - 2 && r <= bounds[i + 1]) i++;
            return bounds.length - 1 - i;
        };
        const layer = layerOf(ratio);
        if (layer < this.bossLayerShown) { this.breakClock = 0.6; this.bossLayerShown = layer; }
        this.breakClock = Math.max(0, this.breakClock - dt);
        this.bossChip = Math.max(ratio, this.bossChip - dt * 0.35);
        const hi = bounds[bounds.length - 1 - layer], lo = bounds[bounds.length - layer];
        const inLayer = cap((ratio - lo) / Math.max(1e-6, hi - lo));
        const chip = layerOf(this.bossChip) > layer ? 1 : cap((this.bossChip - lo) / Math.max(1e-6, hi - lo));
        const enraged = c.boss.phase >= 1;
        const k = cap(this.breakClock / 0.3);
        const shake = this.breakClock > 0.3 ? Math.round(Math.sin((0.6 - this.breakClock) * 92) * k * 8) : 0;
        const g = this.bossG;
        g.clear();
        const x0 = -340 + shake, w = 680, h = 18, y0 = -12;
        g.fillColor = color(COLORS.ink, 230);
        g.rect(x0 - 3, y0 - 3, w + 6, h + 6);
        g.fill();
        g.fillColor = color(layer > 1 ? LAYER_COLORS[(layer - 2) % LAYER_COLORS.length] : '#451728');
        g.rect(x0, y0, w, h);
        g.fill();
        g.fillColor = color(COLORS.cream, 214);
        g.rect(x0, y0, w * chip, h);
        g.fill();
        g.fillColor = color(LAYER_COLORS[(layer - 1) % LAYER_COLORS.length]);
        g.rect(x0, y0, w * inLayer, h);
        g.fill();
        g.fillColor = color(enraged ? COLORS.orange : COLORS.cream, 173);
        g.rect(x0, y0 + h - 3, w * inLayer, 2);
        g.fill();
        g.fillColor = color(COLORS.ink, 70);
        for (let i = 1; i < 10; i++) g.rect(x0 + w * i / 10, y0 + 2, 2, h - 4);
        g.fill();
        this.bossLayers.string = bounds.length > 2 ? `X${layer}` : '';
        const bs = 1 + (this.breakClock > 0.3 ? k : 0) * 0.28;
        this.bossLayers.node.setScale(bs, bs, 1);
        this.bossBreak.node.active = this.breakClock > 0;
        opacity(this.bossBreak.node, Math.min(1, this.breakClock / 0.6 * 1.8) * 255);
        this.bossName.color = color(enraged ? COLORS.orange : COLORS.cream);
    }

    private updatePopups(dt: number): void {
        for (const p of this.popups) {
            if (!p.active) continue;
            p.age += dt;
            const d = cap(p.age / p.life);
            if (d >= 1) { p.active = false; p.root.active = false; continue; }
            const fade = 1 - cap((d - 0.6) / 0.4);
            const s = popScale(p.age);
            p.root.setPosition(p.x, p.y + easeOutCubic(d) * 24 * U);
            p.root.setScale(s, s, 1);
            opacity(p.root, fade * 255);
            const echo = p.age < 0.3 ? (1 - p.age / 0.3) * (p.chainCount >= 2 ? 0.34 : 0.24) : 0;
            p.echoA.node.active = p.echoB.node.active = echo > 0;
            p.echoA.node.setPosition(-6 - p.chainCount * 0.7, 0);
            p.echoB.node.setPosition(5 + p.chainCount * 0.5, 0);
            opacity(p.echoA.node, echo * 255);
            opacity(p.echoB.node, echo * 255);
            const cs = 0.74 + easeOutBack(cap((p.age - 0.045) / 0.2)) * 0.26;
            p.coinRow.setScale(cs, cs, 1);
        }
    }

    private updateCoins(dt: number): void {
        const tx = -334, ty = this.safeTop + ROW1;
        for (let i = this.coinFlies.length - 1; i >= 0; i--) {
            const f = this.coinFlies[i];
            if (f.delay > 0) { f.delay -= dt; f.node.active = false; continue; }
            f.node.active = true;
            f.t += dt;
            const k = cap(f.t / 0.55);
            const e = k * k * (3 - 2 * k);
            const mx = (f.x0 + tx) / 2 + 60, my = Math.max(f.y0, ty) + 80;
            const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * tx;
            const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * ty;
            f.node.setPosition(x, y);
            const sc = 1 - e * 0.4;
            f.node.setScale(sc, sc, 1);
            if (k >= 1) {
                f.node.destroy();
                this.coinFlies.splice(i, 1);
                this.coinPulse = 1;
            }
        }
    }

    private updateOverlays(dt: number, cameraHit: number, c: SfCombat): void {
        const w = this.width, h = this.height;
        // 受击 / 残血：屏幕四周红色渐层。
        const low = c.player.hp <= 1 && c.player.alive;
        const strength = Math.max(cameraHit, low ? 0.25 + Math.sin(this.time * 6) * 0.08 : 0);
        const g = this.vignette;
        g.clear();
        if (strength > 0.01) {
            for (let i = 0; i < 8; i++) {
                const a = 150 * strength * (1 - i / 8);
                const t = 10 + i * 10;
                g.fillColor = color('#F64B42', a / 2);
                g.rect(-w / 2, h / 2 - t, w, 10);
                g.rect(-w / 2, -h / 2 + t - 10, w, 10);
                g.rect(-w / 2 + t - 10, -h / 2, 10, h);
                g.rect(w / 2 - t, -h / 2, 10, h);
                g.fill();
            }
        }
        // 开场横幅：从右侧滑入，停留后向左滑出；只有关卡号与关卡名，两侧细线。
        if (this.bannerClock >= 0) {
            this.bannerClock += dt;
            const t = this.bannerClock;
            const x = t < 0.35 ? (1 - easeOutBack(t / 0.35)) * w : t > 2.2 ? -(t - 2.2) / 0.35 * w : 0;
            this.banner.setPosition(x, this.banner.position.y);
            const bg = this.bannerG;
            bg.clear();
            const lw = 140 * easeOutCubic(t / 0.5);
            bg.fillColor = color(COLORS.foam, 200);
            bg.rect(-110 - lw, 20, lw, 3);
            bg.rect(110, 20, lw, 3);
            bg.fill();
            if (t > 2.6) { this.banner.active = false; this.bannerClock = -1; }
        }
        // Boss 预警：红色警示带 + 文字闪烁。
        if (this.warningClock >= 0) {
            this.warningClock += dt;
            const t = this.warningClock;
            const a = t < 0.2 ? t / 0.2 : t > 2.6 ? Math.max(0, (3 - t) / 0.4) : 1;
            opacity(this.warning, a * 255);
            const wg = this.warningG;
            wg.clear();
            const band = this.warningHidden ? '#1E0A33' : '#2A0A14', stripe = this.warningHidden ? '#A65CFF' : COLORS.red;
            for (const y of [64, -64]) {
                wg.fillColor = color(band, 210);
                wg.rect(-w / 2, y - 14, w, 28);
                wg.fill();
                wg.fillColor = color(stripe, 220);
                const off = (t * 160) % 52;
                for (let x = -w / 2 - 52; x < w / 2 + 52; x += 52) {
                    wg.moveTo(x + off, y - 14); wg.lineTo(x + off + 22, y - 14); wg.lineTo(x + off + 8, y + 14); wg.lineTo(x + off - 14, y + 14); wg.close();
                }
                wg.fill();
            }
            const on = Math.floor(t * 6) % 2 === 0;
            this.warningLabel.color = color(this.warningHidden ? (on ? '#C58CFF' : '#F0E0FF') : (on ? COLORS.red : '#FFD0D8'));
            if (t > 3) { this.warning.active = false; this.warningClock = -1; }
        }
        // 阶段提示（tidal-wings Nr）：两侧红线展开。
        if (this.noticeClock > 0) {
            this.noticeClock -= dt;
            const t = cap(1 - this.noticeClock / 2);
            const e = easeOutCubic(cap(t / 0.16));
            const a = Math.min(cap(t / 0.055), cap(this.noticeClock / 0.34));
            opacity(this.notice, a * 255);
            const jitter = Math.round(Math.sin(this.time * 76) * (1 - Math.min(1, t * 5)) * 6);
            this.notice.setPosition(jitter, this.safeTop - 330);
            this.notice.setScale(0.9 + e * 0.1, 0.94 + e * 0.06, 1);
            const ng = this.noticeG;
            ng.clear();
            const len = 88 * e;
            ng.fillColor = color(COLORS.red);
            ng.rect(-160 - len, 4, len, 4);
            ng.rect(160, 4, len, 4);
            ng.fill();
            if (this.noticeClock <= 0) this.notice.active = false;
        }
        if (this.toastClock > 0) {
            this.toastClock -= dt;
            opacity(this.toast.node, 255 * Math.min(1, this.toastClock / 0.3));
            if (this.toastClock <= 0) this.toast.node.active = false;
        }
    }

    dispose(): void {
        for (const c of this.coinFlies) c.node.destroy();
        this.coinFlies.length = 0;
        this.root.destroy();
    }
}
