import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, Hazard, Vec } from '../../SfTypes';
import type { Motion } from '../../SfMotion';
import { BossScript, TIER_SCORE, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, aimAngle, fan, lob, ring, shoot } from '../../SfPatterns';

/** 第 6 章虚空母舰、终焉吞噬者及隐藏版的信息（图鉴、警报横幅）。 */
export const CH6_BOSS_INFO_B: Record<string, BossInfo> = {
    voidcarrier: { id: 'voidcarrier', name: '虚空母舰', tier: 'mid', chapter: 6, frame: 'boss/voidcarrier', intro: '先打掉两侧机库减少闪现兵，主炮扫过后留下的牵引区会把你拉过去——顶着拉力趁 +30% 火力输出。' },
    devourer: { id: 'devourer', name: '终焉吞噬者', tier: 'big', chapter: 6, frame: 'boss/devourer', intro: '依次躲开熔岩雨、弹墙与传送弹流；最后的吞噬阶段一直往下飞，别被吸进巨口。' },
    'devourer-hidden': { id: 'devourer-hidden', name: '终焉·虚无', tier: 'hidden', chapter: 6, frame: 'boss/devourer', intro: '回声弹幕会复刻你两秒前的路线，别在原地兜圈；黑白世界里只看轮廓躲弹。' },
};

/** 直接构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number, body: EnemyDef['body']): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0, body, chapter: 6, contact: false, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

const BLINK_TINT = '#C77DFF';

/** 闪现出来的虚空兵原地停留 1.4 秒后离场（不算击杀）。 */
class BlinkStay implements Motion {
    private t = 0;
    update(e: Enemy, dt: number): boolean {
        this.t += dt;
        e.vx = 0; e.vy = 0;
        return this.t < 1.4;
    }
}

/**
 * 第 6 章 Boss 公共部分：自己登记的持续型危险物与召唤的小怪归实例所有，换阶段时清掉；
 * 闪现出兵（先亮传送标记再按顺序闪现）。
 */
abstract class VoidBossB extends BossScript {
    private owned: Hazard[] = [];
    protected minions: Enemy[] = [];

    protected hazard(h: Hazard): Hazard {
        this.owned.push(h);
        return this.c.addHazard(h);
    }

    protected setPhase(phase: number): void {
        const owned = this.owned;
        this.c.hazards = this.c.hazards.filter(h => owned.indexOf(h) < 0);
        this.owned = [];
        for (const m of this.minions) if (!m.dead) this.c.killEnemy(m, 'mechanic', false);
        this.minions = [];
        super.setPhase(phase);
    }

    protected get alive(): boolean { return !this.core.dead && this.c.phase === 'boss'; }

    /** 在 points 上依次亮出传送标记，gap 秒一个地闪现虚空兵。 */
    protected blink(points: Vec[], gap: number): void {
        const c = this.c, phase = this.phase;
        points.forEach((p, i) => {
            const wait = 0.7 + i * gap;
            this.hazard({ kind: 'mark', ax: p.x, ay: p.y, bx: p.x, by: p.y, width: 30, warn: 1, warnTime: wait, life: wait, tint: BLINK_TINT });
            c.schedule(wait, () => {
                if (!this.alive || this.phase !== phase) return;
                const e = c.spawnEnemy('voidtrooper', p.x, p.y, new BlinkStay(), { tint: this.tint });
                e.data.blink = 1;
                e.alpha = 0;
                this.minions.push(e);
                c.emit({ type: 'telegraph', x: p.x, y: p.y, kind: 'blink' });
            });
        });
    }

    /** 从 (sx, sy) 一路逼近玩家上方 230 像素处的折线标记（越后面越靠近玩家）。 */
    protected blinkLine(sx: number, sy: number, n: number): Vec[] {
        const c = this.c, p = c.player;
        const ex = p.x, ey = Math.max(p.y + 230, ch(c, 0.42));
        const pts: Vec[] = [];
        for (let i = 0; i < n; i++) {
            const k = i / Math.max(1, n - 1);
            pts.push({ x: this.clampX(sx + (ex - sx) * k), y: sy + (ey - sy) * k });
        }
        return pts;
    }

    /** 玩家上方半圆（半径 r）上的 n 个标记。 */
    protected blinkRing(n: number, r: number): Vec[] {
        const c = this.c, p = c.player;
        const cy = Math.min(p.y + 60, ch(c, 0.5));
        const pts: Vec[] = [];
        for (let i = 0; i < n; i++) {
            const a = Math.PI * (0.12 + 0.76 * i / Math.max(1, n - 1));
            pts.push({ x: this.clampX(p.x + Math.cos(a) * r), y: Math.min(ch(c, 0.9), cy + Math.sin(a) * r) });
        }
        return pts;
    }

    protected clampX(x: number, margin = 60): number {
        return Math.max(this.c.bounds.left + margin, Math.min(this.c.bounds.right - margin, x));
    }
}

// ───────────────────────────── 6-4 虚空母舰 ─────────────────────────────

const CANNON_REACH = 520;

class VoidCarrier extends VoidBossB {
    readonly id = 'voidcarrier';
    readonly name = '虚空母舰';
    readonly tier: BossTier = 'mid';
    private readonly home: number;
    private bays: Enemy[] = [];
    /** 牵引区剩余秒数：期间机库加快开火。 */
    private tractorLeft = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        this.home = ch(c, 0.8);
        const core = this.spawnBody(def(this.id, this.name, 'boss/voidcarrier', 'boss', 100, 'metal'), 0, c.bounds.top + 220, this.hpFor('mid'));
        const bay = def('voidcarrier-bay', '机库', '', 'part', 34, 'metal');
        for (const side of [-1, 1]) {
            const b = this.spawnPart(bay, core, side * 110, 10, this.hpFor('mid') * 0.09);
            b.partTag = 'hangar';
            this.bays.push(b);
        }
        this.start(this.enter(0, this.home, 2.4), 'move');
    }

    private get nose(): Vec { return { x: this.core.x, y: this.core.y - 160 }; }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.tractorLeft > 0) this.tractorLeft -= dt;
    }

    onPhase(phase: number): void {
        this.c.scrollSpeed = 20;
        if (phase === 0) this.start(this.sway(this.core, 120, 0.5, this.home, 8), 'move');
        this.start(this.bayFire());
        this.start(this.launches());
        this.start(this.cannon());
        if (phase >= 2) this.start(this.rings());
    }

    /** 两侧机库轮流打 3 发扇形虚空针；牵引区存在时加快。 */
    private *bayFire(): Generator<number> {
        let i = 0;
        for (; ;) {
            const live = this.bays.filter(b => !b.dead);
            if (live.length) {
                const b = live[i++ % live.length];
                fan(this.c, b.x, b.y - 20, aimAngle(this.c, b.x, b.y - 20), 3, 24, 220, STYLE.voidneedle);
            }
            yield this.tractorLeft > 0 ? 0.45 : 0.7;
        }
    }

    /** 机库出兵：每个存活机库从自己一侧闪现 4 名虚空兵；阶段 1 起再加一圈包围。 */
    private *launches(): Generator<number> {
        yield 2;
        for (; ;) {
            for (let i = 0; i < this.bays.length; i++) {
                if (this.bays[i].dead) continue;
                const side = i === 0 ? -1 : 1;
                this.blink(this.blinkLine(side * 300, ch(this.c, 0.86), 4), 0.45);
            }
            if (this.phase >= 1) {
                yield 2.5;
                this.blink(this.blinkRing(6, 280), 0.3);
                yield 4.5;
            } else yield 7;
        }
    }

    /** 主炮：充能 1.2 秒（预警线）→ 扫射 1.6 秒 → 扫过的扇面留下 3 道牵引光束。 */
    private *cannon(): Generator<number> {
        yield 3;
        const c = this.c;
        for (; ;) {
            warn(c, this.core, 1.2, 'charge');
            for (let t = 0; t < 1.2; t += this.dt) {
                const n = this.nose;
                c.addHazard({ kind: 'laser', ax: n.x, ay: n.y, bx: n.x, by: Math.max(c.bounds.bottom - 40, n.y - CANNON_REACH), width: 22, warn: Math.max(0.02, 1 - t / 1.2) });
                yield 0;
            }
            c.emit({ type: 'boss-attack', x: this.nose.x, y: this.nose.y, kind: 'cannon' });
            const sweep = 40 * Math.PI / 180;
            for (let t = 0; t < 1.6; t += this.dt) {
                const k = t / 1.6;
                this.beam(-sweep + 2 * sweep * k);
                if (this.phase >= 2) this.beam(sweep - 2 * sweep * k);
                yield 0;
            }
            const life = this.phase >= 2 ? 3.5 : 2.5;
            const n = this.nose;
            for (const deg of [-30, 0, 30]) {
                const a = DOWN + deg * Math.PI / 180;
                const len = (n.y - c.bounds.bottom + 40) / Math.abs(Math.sin(a));
                this.hazard({ kind: 'tractor', ax: n.x, ay: n.y, bx: n.x + Math.cos(a) * len, by: n.y + Math.sin(a) * len, width: 60, pull: 140, life });
            }
            this.tractorLeft = life;
            yield 8 - 1.2 - 1.6;
        }
    }

    /** 主炮光束只射到 520 像素远：扫射覆盖整个横向，躲法是退到下半场，而不是穿过光束。 */
    private beam(offset: number): void {
        const c = this.c, n = this.nose;
        const a = DOWN + offset;
        const len = Math.min(CANNON_REACH, (n.y - c.bounds.bottom + 40) / Math.abs(Math.sin(a)));
        c.addHazard({ kind: 'laser', ax: n.x, ay: n.y, bx: n.x + Math.cos(a) * len, by: n.y + Math.sin(a) * len, width: 22 });
    }

    private *rings(): Generator<number> {
        for (; ;) {
            yield 3;
            ring(this.c, this.core.x, this.core.y - 40, 14, 130, this.c.rng.next() * Math.PI, STYLE.voidorb);
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag === 'hangar') this.c.emit({ type: 'boss-phase', value: this.phase, x: part.x, y: part.y, text: '机库被毁' });
    }
}

// ───────────────────────────── 6-5 终焉吞噬者 ─────────────────────────────

/**
 * 终焉吞噬者：前三阶段分别是“地形 / 反弹 / 空间”三种章节动词的终极版（熔岩雨、冰墙弹墙、传送弹流），
 * 第 4 阶段巨口把敌弹、小怪和玩家一起往中心吸。隐藏版把吞噬反转为排斥，并全程复刻玩家 2 秒前的路线（回声），
 * 第 5 阶段进入黑白世界。
 */
class Devourer extends VoidBossB {
    readonly id: string = 'devourer';
    readonly name: string = '终焉吞噬者';
    readonly tier: BossTier = 'big';
    private readonly home: number;
    private readonly hidden: boolean;
    private mandibles: Enemy[] = [];
    /** 空间阶段：传送裂缝出口的位置与放置时刻。 */
    private exit: Vec | null = null;
    private exitAt = 0;
    /** 隐藏版：最近 3 秒的玩家位置（每 0.1 秒一个）。 */
    private trail: { x: number; y: number; t: number }[] = [];
    private sample = 0;

    constructor(c: SfCombat, hidden = false) {
        super(c);
        this.hidden = hidden;
        if (hidden) {
            this.tint = '#C8C8D8';
            this.thresholds.push(0.8, 0.6, 0.4, 0.2);
        } else this.thresholds.push(0.75, 0.5, 0.25);
        this.home = ch(c, 0.8);
        const tier: BossTier = hidden ? 'hidden' : 'big';
        const core = this.spawnBody(def(hidden ? 'devourer-hidden' : 'devourer', hidden ? '终焉·虚无' : '终焉吞噬者', 'boss/devourer', 'boss', 120, 'flesh'),
            0, c.bounds.top + 240, this.hpFor(tier));
        const jaw = def('devourer-mandible', '吞噬颚', 'boss/devourer-mandible', 'part', 40, 'flesh');
        for (const side of [-1, 1]) {
            const m = this.spawnPart(jaw, core, side * 95, -70, this.hpFor(tier) * (hidden ? 0.05 : 0.06));
            m.partTag = 'mandible';
            m.scale = side < 0 ? 1 : -1;
            m.data.side = side;
            this.mandibles.push(m);
        }
        this.start(this.enter(0, this.home, 2.6), 'move');
    }

    private get maw(): Vec { return { x: this.core.x, y: this.core.y - 60 }; }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead || this.entering) return;
        if (this.hidden) {
            this.sample -= dt;
            if (this.sample <= 0) {
                this.sample = 0.1;
                this.trail.push({ x: c.player.x, y: c.player.y, t: this.time });
                while (this.trail.length && this.trail[0].t < this.time - 3) this.trail.shift();
            }
        }
        const m = this.maw;
        if (this.phase === 2 && !this.hidden) this.portal(c, dt, m);
        if (this.phase === 2 && this.hidden) c.addHazard({ kind: 'well', ax: m.x, ay: m.y, bx: m.x, by: m.y, width: 900, pull: -900, drag: -80 });
        if (this.phase >= 3) this.devour(c, dt, m);
    }

    /** 传送裂缝：入口在巨口下方，出口跟着玩家（在离屏幕边更远的一侧 220 像素处）。 */
    private portal(c: SfCombat, dt: number, m: Vec): void {
        const p = c.player;
        const side = p.x > 0 ? -1 : 1;
        const want = { x: this.clampX(p.x + side * 220, 80), y: p.y + 60 };
        if (!this.exit) { this.exit = want; this.exitAt = this.time; }
        const dx = want.x - this.exit.x, dy = want.y - this.exit.y, d = Math.hypot(dx, dy);
        const step = 120 * dt;
        if (d > step) { this.exit.x += dx / d * step; this.exit.y += dy / d * step; } else { this.exit.x = want.x; this.exit.y = want.y; }
        const age = this.time - this.exitAt;
        c.addHazard({ kind: 'portal', ax: m.x, ay: m.y - 160, bx: this.exit.x, by: this.exit.y, width: 46, warn: age < 0.8 ? 1 - age / 0.8 : undefined });
    }

    /** 吞噬：巨口处一口覆盖全场的引力井；进入巨口的敌弹被吃掉，玩家贴近巨口受伤，小怪被拖向巨口（隐藏版反向）。 */
    private devour(c: SfCombat, dt: number, m: Vec): void {
        const sign = this.hidden ? -1 : 1;
        c.addHazard({ kind: 'well', ax: m.x, ay: m.y, bx: m.x, by: m.y, width: 1100, pull: 700 * sign, drag: 95 * sign });
        if (!this.hidden) {
            for (const b of c.ebullets) {
                if (b.dead || (b.x - m.x) * (b.x - m.x) + (b.y - m.y) * (b.y - m.y) > 60 * 60) continue;
                b.dead = true;
                c.emit({ type: 'explosion', x: b.x, y: b.y, size: 0, kind: 'cancel' });
            }
            if (Math.hypot(c.player.x - m.x, c.player.y - m.y) < 150) c.hurtPlayer();
        }
        for (const j of this.minions) {
            if (j.dead || j.def.id !== 'voidjelly') continue;
            const dx = m.x - j.x, dy = m.y - j.y, d = Math.hypot(dx, dy) || 1;
            j.x += dx / d * 60 * dt * sign;
            j.y += dy / d * 60 * dt * sign;
            if (!this.hidden && d < 80) c.killEnemy(j, 'mechanic', false);
        }
    }

    onPhase(phase: number): void {
        this.c.scrollSpeed = 20;
        if (phase === 0) this.start(this.sway(this.core, 90, 0.4, this.home, 8), 'move');
        this.exit = null;
        this.start(this.jaws());
        if (this.hidden) this.start(this.echo());
        switch (phase) {
            case 0: this.start(this.lavaRain()); break;
            case 1: this.start(this.iceWalls()); this.start(this.ricochet()); break;
            case 2: this.start(this.streams()); this.start(this.troopers()); break;
            case 3: this.start(this.pulses(2.4)); this.start(this.jellies()); break;
            default:
                // 隐藏版第 5 阶段：黑白世界。
                this.c.monochrome = true;
                this.start(this.pulses(2.4));
                this.start(this.spiral());
        }
    }

    protected onBodyKilled(): void { this.c.monochrome = false; }

    /** 两只下颚轮流合拢（0.25 秒）后打出 5 发扇形虚空针。 */
    private *jaws(): Generator<number> {
        let i = 0;
        for (; ;) {
            yield 1.05;
            const live = this.mandibles.filter(m => !m.dead);
            if (!live.length) { yield 1.5; continue; }
            const m = live[i++ % live.length];
            const side = m.data.side;
            for (let t = 0; t < 0.25; t += this.dt) { m.angle = side * 0.3 * (t / 0.25); yield 0; }
            const tx = m.x + side * 20, ty = m.y - 80;
            fan(this.c, tx, ty, aimAngle(this.c, tx, ty), 5, 50, 230, STYLE.voidneedle);
            m.angle = 0;
        }
    }

    /** 地形：5 团熔岩落到玩家附近一排（7 个槽位跳过相邻两个，留出 ≥ 200 像素的缺口），落地成熔岩滩。 */
    private *lavaRain(): Generator<number> {
        const c = this.c;
        for (; ;) {
            warn(c, this.core, 0.6, 'lava');
            yield 0.6;
            const skip = c.rng.int(0, 5);
            const m = this.maw;
            for (let k = 0; k < 7; k++) {
                if (k === skip || k === skip + 1) continue;
                const x = -312 + k * 104, y = c.player.y + c.rng.range(40, 260);
                this.hazard({ kind: 'mark', ax: x, ay: y, bx: x, by: y, width: 56, warn: 1, warnTime: 1.1, life: 1.1, tint: '#FF7A2A' });
                lob(c, m.x, m.y, x, y, 1.1, 220, { ...STYLE.ember, pool: { radius: 56, life: 4 } });
            }
            yield 1.6;
            fan(c, this.maw.x, this.maw.y, aimAngle(c, this.maw.x, this.maw.y), 3, 30, 150, STYLE.voidstar);
            yield 1.6;
        }
    }

    /** 反弹：两段冰墙（掩体）每 6 秒换位置。 */
    private *iceWalls(): Generator<number> {
        const c = this.c;
        for (; ;) {
            const a = c.rng.range(-250, -60), b = a + c.rng.range(260, 420);
            for (const x of [a, Math.min(250, b)]) {
                const y = ch(c, 0.38);
                this.hazard({ kind: 'icewall', ax: x - 100, ay: y, bx: x + 100, by: y, width: 10, warn: 1, warnTime: 0.6, life: 6 });
            }
            yield 6;
        }
    }

    /** 反弹：9 发会弹两次墙的冰片扇面；每 3 秒一排冻结后碎裂的虚空弹。 */
    private *ricochet(): Generator<number> {
        const c = this.c;
        let n = 0;
        for (; ;) {
            const m = this.maw;
            fan(c, m.x, m.y, DOWN, 9, 120, 210, { ...STYLE.shard, bounces: 2 });
            yield 1.8;
            if (++n % 2 === 0) {
                warn(c, this.core, 0.4, 'freeze');
                yield 0.4;
                for (let i = 0; i < 6; i++) {
                    shoot(c, this.maw.x, this.maw.y, DOWN + (i - 2.5) * 0.28, 200,
                        { ...STYLE.voidorb, stop: 0.6, fuse: 1.6, burst: { count: 4, speed: 90, kind: 'voidneedle', radius: 6 } });
                }
            }
        }
    }

    /** 空间：巨口朝裂缝入口喷 2 秒弹流（从玩家身旁的出口冒出来），停 1.5 秒；隐藏版改为被排斥井吹散的扇形弹流。 */
    private *streams(): Generator<number> {
        const c = this.c;
        for (; ;) {
            warn(c, this.core, 0.5, 'stream');
            yield 0.5;
            for (let t = 0; t < 2; t += 0.12) {
                const m = this.maw;
                const wobble = Math.sin(this.time * 7) * 0.15;
                if (this.hidden) {
                    for (const off of [-0.5, 0, 0.5]) shoot(c, m.x, m.y, DOWN + off + wobble, 200, STYLE.voidorb);
                } else shoot(c, m.x, m.y, DOWN + wobble, 230, STYLE.voidorb);
                yield 0.12;
            }
            fan(c, this.maw.x, this.maw.y, aimAngle(c, this.maw.x, this.maw.y), 5, 50, 200, STYLE.voidneedle);
            yield 1.5;
        }
    }

    private *troopers(): Generator<number> {
        yield 2;
        for (; ;) {
            this.blink(this.blinkLine(this.c.rng.sign() * 300, ch(this.c, 0.86), 5), 0.45);
            yield 8;
        }
    }

    /** 吞噬：巨口吐出带缺口的脉冲波（缺口大致朝着玩家）。 */
    private *pulses(every: number): Generator<number> {
        const c = this.c;
        for (; ;) {
            warn(c, this.core, 0.5, 'pulse');
            yield 0.5;
            const m = this.maw;
            const gap = aimAngle(c, m.x, m.y) + c.rng.range(-0.8, 0.8);
            this.hazard({ kind: 'pulse', ax: m.x, ay: m.y, bx: m.x, by: m.y, width: 10, radius: 120, speed: 170, gap, gapWidth: 0.5, life: 6 });
            yield every - 0.5;
        }
    }

    /** 吞噬：每 6 秒从上方两角放出两只虚空水母，被引力拖向巨口（隐藏版被推开）。 */
    private *jellies(): Generator<number> {
        const c = this.c;
        for (; ;) {
            yield 6;
            for (const side of [-1, 1]) {
                const j = c.spawnEnemy('voidjelly', side * (c.bounds.right - 80), c.bounds.top - 60, null, { tint: this.tint });
                this.minions.push(j);
            }
        }
    }

    /** 隐藏版：回声——2 秒前的路线上按顺序亮起一串静止的虚空弹。 */
    private *echo(): Generator<number> {
        const c = this.c;
        for (; ;) {
            yield this.phase >= 4 ? 2 : 3;
            const path = this.trail.filter(q => q.t >= this.time - 3 && q.t <= this.time - 1);
            if (path.length < 2) continue;
            c.emit({ type: 'telegraph', x: path[0].x, y: path[0].y, kind: 'echo' });
            for (let i = 0; i < path.length; i += 2) {
                c.spawnEnemyBullet({ x: path[i].x, y: path[i].y, vx: 0, vy: 0, radius: STYLE.voidorb.radius, kind: STYLE.voidorb.kind, delay: 0.5 + i * 0.05, life: 2.5 });
            }
        }
    }

    /** 隐藏版第 5 阶段：8 臂旋转虚空针。 */
    private *spiral(): Generator<number> {
        let a = 0;
        for (; ;) {
            const m = this.maw;
            ring(this.c, m.x, m.y, 8, 160, a, STYLE.voidneedle);
            a += 0.17;
            yield 0.25;
        }
    }
}

class DevourerHidden extends Devourer {
    readonly id = 'devourer-hidden';
    readonly name = '终焉·虚无';
    readonly tier: BossTier = 'hidden';
    constructor(c: SfCombat) {
        super(c, true);
        // 基类构造时 tier 仍是父类的 'big'，这里按隐藏 Boss 重新给分。
        this.core.scoreValue = TIER_SCORE.hidden;
    }
}

export function createCh6BossB(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'voidcarrier': return new VoidCarrier(c);
        case 'devourer': return new Devourer(c);
        case 'devourer-hidden': return new DevourerHidden(c);
        default: return null;
    }
}
