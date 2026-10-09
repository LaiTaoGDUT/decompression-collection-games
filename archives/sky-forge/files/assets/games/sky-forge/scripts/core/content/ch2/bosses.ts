import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { EnemyBehavior } from '../SfContentTypes';
import type { BossTier, EnemyBullet } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { HP_UNITS } from '../../SfBalance';
import { SineMotion } from '../../SfMotion';
import { aimAngle, aimed, fan, ring, shoot, wall, DOWN, STYLE, type ShotStyle } from '../../SfPatterns';

/** 第 2 章 Boss 信息（图鉴、警报横幅）。 */
export const CH2_BOSS_INFO: Record<string, BossInfo> = {
    moth: { id: 'moth', name: '月光蛾后', tier: 'small', chapter: 2, frame: 'boss/moth', intro: '扇翅洒下波浪形鳞粉帘幕，循着缺口穿行；眼斑睁开时它几乎刀枪不入，先打碎眼斑。' },
    hive: { id: 'hive', name: '女王蜂巢', tier: 'mid', chapter: 2, frame: 'boss/hive', intro: '蜜蜂不断孵化，巢心周期性打开；避开会拖慢飞机的蜂蜜。' },
    lanternshroom: { id: 'lanternshroom', name: '灯笼巨菇', tier: 'small', chapter: 2, frame: 'boss/lantern-shroom', intro: '灯笼越亮弹幕越密，打灭光源会让巨菇永久暴露弱点。' },
    twinshroom: { id: 'twinshroom', name: '双生蘑菇王', tier: 'mid', chapter: 2, frame: 'boss/shroom-king-a', intro: '共生的双王交替撒下孢子，须在八秒复活倒计时内先后击倒。' },
    treeking: { id: 'treeking', name: '千年树王', tier: 'big', chapter: 2, frame: 'boss/treeking', intro: '双臂扫下叶帘，双眼轮流睁开；树根破土后，古老树冠将绽放。' },
    'treeking-hidden': { id: 'treeking-hidden', name: '枯萎树王', tier: 'hidden', chapter: 2, frame: 'boss/treeking', intro: '隐藏 Boss，燃烧的枯叶与收缩荆棘封住去路，腐朽之花反向旋转。' },
};

/** 定义只在本章脚本内创建，不反向导入敌人或 Boss 注册器。 */
function def(id: string, name: string, frame: string, radius: number, part = false, behavior?: EnemyBehavior): EnemyDef {
    return { id, name, frame, radius, hp: 1, size: part ? 'part' : 'boss', score: part ? 1200 : 0,
        energy: part ? 8 : 0, coins: part ? 2 : 0, body: 'flesh', chapter: 2, intro: '', behavior };
}

function lock(e: Enemy, c: SfCombat, seconds: number): void {
    const a = aimAngle(c, e.x, e.y);
    e.aimX = Math.cos(a); e.aimY = Math.sin(a); e.windup = seconds;
}

// ───────────────────────────── 2-1 月光蛾后 ─────────────────────────────

/**
 * 巨型荧光蛾：扇翅洒下波浪形鳞粉帘幕（缺口随正弦移动，要找缝穿过）；
 * 阶段 2 翅上眼斑睁开并开火，眼斑存活时本体只受 35% 伤害，打碎眼斑本体受创并短暂失衡。
 */
class MothQueen extends BossScript {
    readonly id = 'moth';
    readonly name = '月光蛾后';
    readonly tier: BossTier = 'small';
    private wings: Enemy[] = [];
    private eyes: Enemy[] = [];
    private closedEyes: Enemy[] = [];
    private home = 0;
    private flap = 0;
    private stagger = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        const boss = this;
        const body = def('moth', this.name, 'boss/moth', 46, false, {
            damage(_e, _c, amount) { return boss.eyes.some(e => !e.dead) ? amount * 0.35 : amount; },
        });
        const core = this.spawnBody(body, 0, c.bounds.top + 200, this.hpFor('small'));
        const wingDef = def('moth-wing', '蛾翼', 'boss/moth-wing', 1, true);
        for (const side of [-1, 1]) {
            const w = this.c.spawnEnemy(wingDef, core.x + side * 130, core.y + 10, null, { parent: core, ox: side * 130, oy: 10, persistent: true });
            w.wreck = true; w.scale = side < 0 ? 1 : -1;
            this.wings.push(w);
            // 阶段 1 眼斑是闭合的装饰，阶段 2 换成可破坏的睁眼部件。
            const closed = this.c.spawnEnemy(def('moth-eye-closed', '闭合眼斑', 'boss/moth-eye-dead', 1, true), core.x + side * 149, core.y + 50, null,
                { parent: core, ox: side * 149, oy: 50, persistent: true });
            closed.wreck = true;
            this.closedEyes.push(closed);
        }
        this.home = ch(c, 0.75);
        this.start(this.enter(0, this.home, 2.4), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        this.stagger = Math.max(0, this.stagger - dt);
        // 扇翅：翅膀以翅根为支点横向收放（翅根固定在身体两侧）。
        this.flap += dt * (this.phase >= 1 ? 7 : 5);
        const k = 0.78 + 0.22 * Math.abs(Math.cos(this.flap));
        for (const w of this.wings) {
            const side = w.scale > 0 ? -1 : 1;
            w.scale = (side < 0 ? 1 : -1) * k;
            w.ox = side * (40 + 90 * k);
        }
    }

    onPhase(phase: number): void {
        this.stop('move');
        this.start(this.drift(), 'move');
        if (phase >= 1 && this.eyes.length === 0) {
            const eyeDef = def('moth-eye', '眼斑', 'boss/moth-eye', 22, true);
            this.closedEyes.forEach(e => this.c.killEnemy(e, 'mechanic', false));
            for (const side of [-1, 1]) {
                const e = this.spawnPart(eyeDef, this.core, side * 149, 50, 3);
                e.partTag = 'eye';
                e.drop = side < 0 ? 'wing' : 'special';
                // 阶段保护在 onPhase 之前已解除，新部件要自己恢复受伤。
                e.damageScale = 1;
                this.eyes.push(e);
            }
            this.c.emit({ type: 'boss-phase', value: 1, x: this.core.x, y: this.core.y, text: '眼斑睁开' });
        }
        this.start(this.curtain(), 'attack');
        this.start(this.sting(), 'attack');
        if (phase >= 1) this.start(this.eyeFire(), 'attack');
    }

    /** 8 字形缓慢漂移。 */
    private *drift(): Generator<number> {
        const core = this.core;
        let t = 0;
        for (; ;) {
            t += this.dt;
            core.x = Math.sin(t * 0.55) * 120;
            core.y = this.home + Math.sin(t * 1.1) * 26;
            yield 0;
        }
    }

    /** 鳞粉帘幕：横排慢弹，每排的缺口沿正弦左右移动，连成一条可穿行的波浪通道。 */
    private *curtain(): Generator<number> {
        yield 1.0;
        let row = 0;
        for (; ;) {
            if (this.stagger > 0) { yield 0.2; continue; }
            const gap = Math.sin(row * 0.55) * (this.c.bounds.right - 150);
            const width = this.phase >= 1 ? 150 : 170;
            this.core.windup = 0.2;
            for (let x = this.c.bounds.left + 20; x <= this.c.bounds.right - 20; x += 46) {
                if (Math.abs(x - gap) < width / 2) continue;
                shoot(this.c, x, this.core.y - 40, DOWN, 120, { ...STYLE.small, delay: 0.25 });
            }
            row++;
            yield this.phase >= 1 ? 0.95 : 0.8;
            if (row % 6 === 0) yield 1.6;
        }
    }

    /** 本体的瞄准三连。 */
    private *sting(): Generator<number> {
        yield 2.0;
        for (; ;) {
            if (this.stagger <= 0) {
                lock(this.core, this.c, 0.4);
                yield 0.4;
                this.core.aimX = this.core.aimY = 0;
                aimed(this.c, this.core.x, this.core.y - 60, 3, 24, 250, STYLE.medium);
            }
            yield 2.6;
        }
    }

    /** 阶段 2：两只眼斑轮流放出 8 向弹环与瞄准双发。 */
    private *eyeFire(): Generator<number> {
        yield 1.2;
        let turn = 0;
        for (; ;) {
            const eye = this.eyes[turn++ % this.eyes.length];
            if (eye && !eye.dead && this.stagger <= 0) {
                eye.windup = 0.4;
                yield 0.4;
                if (!eye.dead) {
                    ring(this.c, eye.x, eye.y, 8, 150, turn * 0.3, STYLE.diamond);
                    aimed(this.c, eye.x, eye.y, 2, 14, 260, STYLE.small);
                }
            }
            yield 1.3;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag !== 'eye') return;
        const dead = this.c.spawnEnemy(def('moth-eye-closed', '碎裂眼斑', 'boss/moth-eye-dead', 1, true), part.x, part.y, null,
            { parent: this.core, ox: part.ox, oy: part.oy, persistent: true });
        dead.wreck = true;
        // 打碎眼斑：本体受创 8% 并失衡 1.2 秒（停止出手）。
        this.stagger = 1.2;
        this.core.jelly = this.core.jellyMax = 0.3;
        this.core.jellyStrength = 1;
        this.c.damageEnemy(this.core, this.core.maxHp * 0.08, 'mechanic', this.core.x, this.core.y);
    }
}

// ───────────────────────────── 2-2 女王蜂巢 ─────────────────────────────

class Hive extends BossScript {
    readonly id = 'hive';
    readonly name = '女王蜂巢';
    readonly tier: BossTier = 'mid';
    private heart: Enemy;
    private open = false;
    private honey: EnemyBullet[] = [];
    private lastX: number;
    private lastY: number;

    constructor(c: SfCombat) {
        super(c);
        this.lastX = c.player.x; this.lastY = c.player.y;
        this.thresholds.push(0.62, 0.3);
        const core = this.spawnBody(def('hive', this.name, 'boss/hive', 84), 0, c.bounds.top + 210,
            this.hpFor('mid') * 0.68);
        this.heart = this.spawnPart(def('hive-core', '蜂巢巢心', 'boss/hive-core', 36, true, {
            damage: (_e, combat, amount, hx, hy) => {
                if (this.open && !core.dead && core.damageScale > 0) combat.damageEnemy(core, amount, 'mechanic', hx, hy);
                // 巢心是把伤害传给本体的开口，不是可重复刷奖励的独立血条。
                return 0;
            },
        }), core, 0, -88, 1);
        this.heart.alpha = 0;
        this.start(this.enter(0, ch(c, 0.75), 2.4), 'move');
        this.start(this.openCycle(), 'mechanic');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (!this.entering && !this.core.dead) {
            if (this.core.damageScale > 0) this.core.damageScale = this.open ? 1 : 0.1;
            this.heart.damageScale = this.open && this.core.damageScale > 0 ? 1 : 0;
            this.heart.alpha = this.open ? 1 : 0;
            this.heart.wreck = !this.open;
        }
        this.honey = this.honey.filter(b => !b.dead && b.life > 0);
        if (c.phase === 'boss' && c.player.alive && this.honey.some(b => b.delay <= 0 && Math.hypot(b.x - c.player.x, b.y - c.player.y) < 65)) {
            const p = c.clampTarget(this.lastX + (c.player.x - this.lastX) * 0.55,
                this.lastY + (c.player.y - this.lastY) * 0.55);
            c.player.x = p.x; c.player.y = p.y;
        }
        this.lastX = c.player.x; this.lastY = c.player.y;
    }

    onPhase(phase: number): void {
        // 移动只启动一次，入场任务自行结束；换阶段也不会重新锚定造成横向漂移。
        if (phase === 0) this.start(this.sway(this.core, 125, 0.45, ch(this.c, 0.75), 8), 'move');
        this.start(this.bees(), 'attack');
        this.start(this.honeyDrops(), 'attack');
        if (phase === 1) this.start(this.stingers(), 'attack');
        if (phase === 2) this.start(this.royalRings(), 'attack');
    }

    private *openCycle(): Generator<number> {
        while (this.entering) yield 0;
        for (; ;) {
            if (this.core.dead) return;
            this.core.windup = 0.65;
            this.c.emit({ type: 'telegraph', x: this.core.x, y: this.core.y - 88, kind: 'hive-open', value: 0.65 });
            yield 0.65;
            this.open = true;
            yield 5.5;
            this.open = false;
            yield 2.3;
        }
    }

    private *bees(): Generator<number> {
        yield 1;
        for (; ;) {
            const core = this.core;
            core.windup = 0.45;
            yield 0.45;
            const count = this.phase ? 4 : 3;
            for (let i = 0; i < count; i++) {
                const x = core.x + (i - (count - 1) / 2) * 42;
                this.c.spawnEnemy('firefly', x, core.y - 70, new SineMotion(x, -180, 36, 0.5, i));
            }
            this.c.emit({ type: 'boss-attack', x: core.x, y: core.y, kind: 'hatch' });
            yield this.phase === 2 ? 4.2 : 3.7;
        }
    }

    private *honeyDrops(): Generator<number> {
        yield 2.3;
        for (; ;) {
            this.core.windup = 0.5;
            yield 0.5;
            const count = this.phase ? 3 : 2;
            for (let i = 0; i < count; i++) {
                const b = shoot(this.c, this.core.x + (i - (count - 1) / 2) * 76, this.core.y - 95,
                    DOWN, 75, { ...STYLE.bubble, radius: 15, life: 10, delay: 0.2 });
                this.honey.push(b);
            }
            yield this.phase === 1 ? 2.5 : 3.4;
        }
    }

    private *stingers(): Generator<number> {
        yield 1.4;
        for (; ;) {
            lock(this.core, this.c, 0.5);
            yield 0.5;
            this.core.aimX = this.core.aimY = 0;
            aimed(this.c, this.core.x, this.core.y - 86, 5, 48, 245, STYLE.needle);
            yield 2.3;
        }
    }

    private *royalRings(): Generator<number> {
        let offset = 0;
        yield 1;
        for (; ;) {
            this.core.windup = 0.6;
            yield 0.6;
            ring(this.c, this.core.x, this.core.y - 70, 16, 175, offset, STYLE.orangeSmall);
            offset += 0.21;
            yield 2.2;
        }
    }
}

// ───────────────────────────── 2-3 灯笼巨菇 ─────────────────────────────

class LanternShroom extends BossScript {
    readonly id = 'lanternshroom';
    readonly name = '灯笼巨菇';
    readonly tier: BossTier = 'small';
    private glow: Enemy;
    private dark = false;
    private brightness = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        const core = this.spawnBody(def('lanternshroom', this.name, 'boss/lantern-shroom', 76, false, {
            damage: (_e, _c, amount) => amount * (this.dark ? 2 : 1),
        }), 0, c.bounds.top + 190, this.hpFor('small') * 1.7);
        this.glow = this.spawnPart(def('lantern-glow', '巨菇灯笼', 'boss/lantern-glow', 38, true), core, 0, -66,
            HP_UNITS.elite);
        this.glow.partTag = 'lantern'; this.glow.drop = 'special';
        this.start(this.enter(0, ch(c, 0.74), 2.2), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (!this.entering && !this.dark) {
            this.brightness = Math.min(1, this.brightness + dt / 18);
            this.glow.alpha = 0.45 + this.brightness * 0.55;
        }
    }

    onPhase(phase: number): void {
        if (phase === 0) this.start(this.sway(this.core, 125, 0.48, ch(this.c, 0.74), 8), 'move');
        if (phase === 0) this.start(this.lightRings(), 'attack');
        else this.start(this.lanternSpiral(), 'attack');
        this.start(this.sporeFans(), 'attack');
    }

    private *lightRings(): Generator<number> {
        let offset = 0;
        yield 1.2;
        for (; ;) {
            const source = this.dark ? this.core : this.glow;
            source.windup = 0.55;
            yield 0.55;
            const count = this.dark ? 8 : 10 + Math.floor(this.brightness * 12);
            ring(this.c, source.x, source.y, count, 165, offset, this.dark ? STYLE.ghost : STYLE.star);
            offset += 0.24;
            yield this.dark ? 2.8 : 2.5 - this.brightness * 0.6;
        }
    }

    private *lanternSpiral(): Generator<number> {
        let angle = 0;
        yield 0.8;
        for (; ;) {
            this.core.windup = 0.55;
            yield 0.55;
            const count = this.dark ? 14 : 20 + Math.floor(this.brightness * 10);
            for (let i = 0; i < count; i++) {
                angle += 0.3;
                shoot(this.c, this.core.x, this.core.y - 65, angle, 180, this.dark ? STYLE.ghost : STYLE.star);
                if (!this.dark) shoot(this.c, this.core.x, this.core.y - 65, angle + Math.PI, 180, STYLE.star);
                yield 0.1;
            }
            yield this.dark ? 1.8 : 1.3;
        }
    }

    private *sporeFans(): Generator<number> {
        yield 2;
        for (; ;) {
            lock(this.core, this.c, 0.5);
            yield 0.5;
            this.core.aimX = this.core.aimY = 0;
            aimed(this.c, this.core.x, this.core.y - 70, this.phase ? 5 : 3, this.phase ? 60 : 38, 210, STYLE.ghost);
            yield this.dark ? 2.6 : 2.1;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part !== this.glow || this.dark) return;
        this.dark = true;
        this.c.cancelBullets(true);
        this.c.emit({ type: 'boss-phase', value: this.phase, x: this.core.x, y: this.core.y, text: '灯笼熄灭 · 弱点伤害 ×2' });
    }
}

// ───────────────────────────── 2-4 双生蘑菇王 ─────────────────────────────

class TwinShroom extends BossScript {
    readonly id = 'twinshroom';
    readonly name = '双生蘑菇王';
    readonly tier: BossTier = 'mid';
    private fallen = [0, 0];
    private countdown = [-1, -1];
    private readonly units: number;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.65, 0.3);
        this.units = this.hpFor('mid') * 0.6;
        this.makeKing(0, -150, c.bounds.top + 160);
        this.makeKing(1, 150, c.bounds.top + 160);
        this.start(this.entry(), 'move');
        this.start(this.revivals(), 'mechanic');
    }

    private makeKing(index: number, x: number, y: number): Enemy {
        return this.spawnBody(def(`twinshroom-${index}`, index === 0 ? '双生王·赤' : '双生王·青',
            index === 0 ? 'boss/shroom-king-a' : 'boss/shroom-king-b', 62, false, {
                damage: (_e, _c, amount) => amount * (this.bodies[1 - index]?.dead ? 2.5 : 1),
            }), x, y, this.units, 0.5);
    }

    private *entry(): Generator<number> {
        const y = ch(this.c, 0.75);
        const start = this.bodies[0].y;
        let t = 0;
        while (t < 2.4) {
            t += this.dt;
            const u = Math.min(1, t / 2.4);
            for (const e of this.bodies) e.y = start + (y - start) * u;
            yield 0;
        }
        this.entering = false;
        for (const e of this.bodies) e.damageScale = 1;
        this.onPhase(0);
    }

    onPhase(phase: number): void {
        if (phase === 0) this.start(this.dance(), 'move');
        if (phase === 0) this.start(this.duetFans(), 'attack');
        else if (phase === 1) this.start(this.sporeRings(), 'attack');
        else { this.start(this.duetFans(), 'attack'); this.start(this.sporeRings(), 'attack'); }
    }

    private *dance(): Generator<number> {
        for (; ;) {
            this.bodies.forEach((e, i) => {
                if (e.dead) return;
                e.x = (i === 0 ? -1 : 1) * (145 + Math.sin(this.time * 0.55) * 65);
                e.y = ch(this.c, 0.75) + Math.sin(this.time * 0.8 + i * Math.PI) * 24;
            });
            yield 0;
        }
    }

    private *duetFans(): Generator<number> {
        let turn = 0;
        yield 1;
        for (; ;) {
            const alive = this.bodies.filter(e => !e.dead);
            if (!alive.length) return;
            const e = alive[turn++ % alive.length];
            lock(e, this.c, 0.55);
            yield 0.55;
            e.aimX = e.aimY = 0;
            if (!e.dead) aimed(this.c, e.x, e.y - 40, this.phase === 2 ? 7 : 5, 64, 215, STYLE.ghost);
            yield this.phase === 2 ? 0.9 : 1.3;
        }
    }

    private *sporeRings(): Generator<number> {
        let offset = 0;
        yield 1.2;
        for (; ;) {
            const alive = this.bodies.filter(e => !e.dead);
            for (const e of alive) e.windup = 0.6;
            yield 0.6;
            alive.forEach((e, i) => {
                if (!e.dead) ring(this.c, e.x, e.y - 30, this.phase === 2 ? 12 : 10, 170,
                    offset + i * 0.2, i === 0 ? STYLE.star : STYLE.ghost);
            });
            offset += 0.26;
            yield this.phase === 2 ? 2.0 : 2.5;
        }
    }

    protected onBodyKilled(e: Enemy): void {
        const index = this.bodies.indexOf(e);
        if (index < 0 || this.bodies.every(b => b.dead)) return;
        this.fallen[index] = this.c.time + 8;
        this.countdown[index] = 8;
        this.c.emit({ type: 'boss-phase', value: this.phase, x: e.x, y: e.y, text: '共生复苏 · 8 秒，孤王弱点 ×2.5' });
        this.c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'revive', value: 8 });
    }

    private *revivals(): Generator<number> {
        for (; ;) {
            for (let i = 0; i < 2; i++) {
                const e = this.bodies[i], other = this.bodies[1 - i];
                const at = this.fallen[i];
                if (!e || !other || !e.dead || other.dead || at <= 0) continue;
                const seconds = Math.max(0, Math.ceil(at - this.c.time));
                if (seconds !== this.countdown[i]) {
                    this.countdown[i] = seconds;
                    this.c.emit({ type: 'boss-phase', value: this.phase, x: e.x, y: e.y, text: `共生复苏 · ${seconds} 秒` });
                }
                if (this.c.time < at) continue;
                // 已死敌人已被 compact 移除，必须生成新实体并替换血条槽，不能只把 dead 改回 false。
                const revived = this.makeKing(i, e.x, ch(this.c, 0.75));
                this.bodies.pop(); this.bodies[i] = revived;
                revived.hp = revived.maxHp * 0.35;
                revived.damageScale = 1; revived.entered = true;
                // 复活体仍在 bodies 中参与胜负；不再领取本体的重复金币奖励。
                revived.boss = false; revived.bossTier = 'mid';
                revived.scoreValue = 0; revived.def.coins = 0;
                this.fallen[i] = 0; this.countdown[i] = -1;
                this.c.emit({ type: 'boss-phase', value: this.phase, x: revived.x, y: revived.y, text: '共生复苏 · 残血归来' });
            }
            yield 0;
        }
    }
}

// ───────────────────────────── 2-5 千年树王（含隐藏版） ─────────────────────────────

class TreeKing extends BossScript {
    readonly id: string;
    readonly name: string;
    readonly tier: BossTier;
    private trunk: Enemy;
    private arms: Enemy[] = [];
    private blossom?: Enemy;
    private openEye = 0;
    private eyeClosing = false;
    private guardUntil = 0;
    private readonly hidden: boolean;

    constructor(c: SfCombat, hidden = false) {
        super(c);
        this.hidden = hidden;
        this.id = hidden ? 'treeking-hidden' : 'treeking';
        this.name = hidden ? '枯萎树王' : '千年树王';
        this.tier = hidden ? 'hidden' : 'big';
        if (hidden) this.tint = '#C9A27A';
        if (hidden) this.thresholds.push(0.72, 0.45, 0.2);
        else this.thresholds.push(0.66, 0.33);
        const treeDef = def(this.id, this.name, 'boss/treeking', 96, false, { damage() { return 0; } });
        treeDef.body = 'wood';
        this.trunk = c.spawnEnemy(treeDef, 0, c.bounds.top + 250, null,
            { boss: true, persistent: true, tint: this.tint });
        this.trunk.damageScale = 0; this.trunk.scoreValue = 0;
        this.parts.push(this.trunk);
        // 双眼轮开使有效输出时间缩短，以总血量 0.62 倍补偿门控，隐藏版仍保持约 1.3 倍血量。
        const units = this.hpFor(this.tier) * 0.62;
        for (let i = 0; i < 2; i++) {
            const eyeDef = def(`${this.id}-eye-${i}`, '树王之眼', 'boss/treeking-eye-open', 34, false, {
                damage: (_e, combat, amount) => !this.entering && !this.eyeClosing && combat.time >= this.guardUntil && this.openEye === i ? amount : 0,
            });
            eyeDef.coins = hidden ? 40 : 0;
            const eye = this.spawnBody(eyeDef, 0, this.trunk.y, units / 2, 0.5);
            eye.parent = this.trunk; eye.ox = i === 0 ? -54 : 54; eye.oy = 22;
            eye.bossTier = this.tier;
        }
        const armDef = def(`${this.id}-arm`, '树枝手臂', 'boss/treeking-arm', 40, true);
        armDef.body = 'wood'; armDef.coins = hidden ? 6 : 2;
        this.arms = [this.spawnPart(armDef, this.trunk, -144, -44, HP_UNITS.elite),
            this.spawnPart(armDef, this.trunk, 144, -44, HP_UNITS.elite)];
        this.arms.forEach((e, i) => { e.partTag = 'arm'; e.scale = i === 0 ? 1 : -1; e.drop = i === 0 ? 'wing' : 'special'; });
        this.trunk.coveredBy = this.bodies[0];
        this.start(this.entry(), 'move');
        this.start(this.eyes(), 'mechanic');
    }

    protected setPhase(phase: number): void {
        this.guardUntil = this.c.time + 0.9;
        super.setPhase(phase);
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        this.trunk.damageScale = 0;
        if (this.bodies[this.openEye]?.dead) this.openEye = this.bodies.findIndex(e => !e.dead);
        const live = this.bodies.find(e => !e.dead);
        // 树干只是铠甲与部件挂点，不拦截射向眼睛的子弹；胜负只由双眼的血量决定。
        this.trunk.coveredBy = live;
        this.bodies.forEach((e, i) => {
            if (e.dead) return;
            const open = !this.entering && !this.eyeClosing && i === this.openEye;
            e.frame = open ? 'boss/treeking-eye-open' : 'boss/treeking-eye-closed';
            e.damageScale = open && c.time >= this.guardUntil ? 1 : 0;
        });
    }

    private *entry(): Generator<number> {
        yield* this.moveTo(this.trunk, 0, ch(this.c, 0.72), 2.8);
        this.entering = false;
        for (const e of this.parts) if (e !== this.trunk) e.damageScale = 1;
        this.onPhase(0);
    }

    private *eyes(): Generator<number> {
        while (this.entering) yield 0;
        for (; ;) {
            yield 4.5;
            if (this.bodies.every(e => e.dead)) return;
            this.eyeClosing = true;
            const next = this.bodies[1 - this.openEye];
            if (next && !next.dead) {
                next.windup = 0.6;
                this.c.emit({ type: 'telegraph', x: next.x, y: next.y, kind: 'eye-open', value: 0.6 });
            }
            yield 0.6;
            if (next && !next.dead) this.openEye = 1 - this.openEye;
            this.eyeClosing = false;
        }
    }

    onPhase(phase: number): void {
        if (phase === 0) this.start(this.sway(this.trunk, 75, 0.32, ch(this.c, 0.72), 6), 'move');
        this.arms.forEach((e, i) => { e.ox = i === 0 ? -144 : 144; });
        if (phase === 0) {
            this.start(this.leaves(), 'attack');
            this.start(this.roots(), 'attack');
        } else if (phase === 1) {
            this.start(this.roots(), 'attack');
            this.start(this.leaves(), 'attack');
            this.start(this.seedRings(), 'attack');
        } else {
            if (!this.blossom) {
                const flowerDef = def(`${this.id}-blossom`, '树冠之花', 'boss/treeking-blossom', 40, true);
                flowerDef.coins = this.hidden ? 6 : 2;
                this.blossom = this.spawnPart(flowerDef, this.trunk, 0, 112, HP_UNITS.elite);
                this.blossom.damageScale = 1; this.blossom.partTag = 'blossom'; this.blossom.drop = 'main';
            }
            this.start(this.petals(phase === 3), 'attack');
            this.start(this.leaves(), 'attack');
            this.start(this.roots(), 'attack');
        }
        if (this.hidden && phase >= 1) this.start(this.thornCages(), 'attack');
        if (phase === 3) this.c.emit({ type: 'boss-phase', value: 3, x: this.trunk.x, y: this.trunk.y, text: '腐朽之花' });
    }

    private get leafStyle(): ShotStyle { return this.hidden ? STYLE.orange : STYLE.ghost; }

    private *leaves(): Generator<number> {
        yield 1.3;
        let turn = 0;
        for (; ;) {
            const alive = this.arms.filter(e => !e.dead);
            if (alive.length) {
                const arm = alive[turn++ % alive.length];
                arm.windup = 0.65;
                this.c.emit({ type: 'telegraph', x: arm.x, y: arm.y, kind: 'leaf-sweep', value: 0.65 });
                let t = 0;
                const start = arm.ox;
                while (t < 0.65) {
                    t += this.dt;
                    arm.ox = start + Math.sin(Math.min(1, t / 0.65) * Math.PI) * (start < 0 ? 32 : -32);
                    yield 0;
                }
                arm.ox = start;
                if (!arm.dead) {
                    const gap = Math.max(this.c.bounds.left + 100, Math.min(this.c.bounds.right - 100, this.c.player.x));
                    wall(this.c, this.trunk.y - 88, gap, alive.length === 2 ? 150 : 210, 48, 180,
                        { ...this.leafStyle, delay: 0.15, life: 7 });
                }
            }
            // 断臂只留下少量落叶，不再生成整幅弹幕帘。
            else fan(this.c, this.trunk.x, this.trunk.y - 70, DOWN, 3, 54, 165, this.leafStyle);
            yield this.phase === 0 ? 2.5 : this.phase === 1 ? 3.4 : 4.0;
        }
    }

    private *roots(): Generator<number> {
        yield this.phase === 0 ? 4.4 : 1.2;
        for (; ;) {
            const lanes = this.phase === 0 ? 1 : 3;
            const x = Math.max(this.c.bounds.left + 80, Math.min(this.c.bounds.right - 80, this.c.player.x));
            for (let i = 0; i < lanes; i++) {
                const rx = Math.max(this.c.bounds.left + 40, Math.min(this.c.bounds.right - 40, x + (i - (lanes - 1) / 2) * 185));
                this.c.emit({ type: 'telegraph', x: rx, y: this.c.bounds.bottom + 24, kind: 'root', value: 0.85, angle: Math.PI / 2 });
                // 子弹停在地面闪烁就是破土预警，预警结束才向上推进。
                fan(this.c, rx, this.c.bounds.bottom + 24, Math.PI / 2, 3, 12, 230,
                    { ...STYLE.chain, delay: 0.85, life: 5.5 });
            }
            yield this.phase === 1 ? 4.3 : 6;
        }
    }

    private *seedRings(): Generator<number> {
        let offset = 0;
        yield 3;
        for (; ;) {
            this.trunk.windup = 0.65;
            yield 0.65;
            ring(this.c, this.trunk.x, this.trunk.y - 60, 12, 160, offset, { ...STYLE.ghost, delay: 0.4, life: 6 });
            offset += 0.29;
            yield 3.6;
        }
    }

    private *petals(reverse: boolean): Generator<number> {
        let angle = 0;
        yield 1;
        for (; ;) {
            const source = this.blossom && !this.blossom.dead ? this.blossom : this.trunk;
            source.windup = 0.6;
            yield 0.6;
            const intact = !!this.blossom && !this.blossom.dead;
            for (let i = 0; i < (intact ? 24 : 14); i++) {
                angle += reverse ? -0.29 : 0.25;
                const style = reverse ? STYLE.orangeSmall : STYLE.star;
                shoot(this.c, source.x, source.y, angle, 175, { ...style, life: 6 });
                if (intact) shoot(this.c, source.x, source.y, angle + Math.PI, 175, { ...style, life: 6 });
                yield reverse ? 0.09 : 0.11;
            }
            yield intact ? 1.4 : 2.2;
        }
    }

    private *thornCages(): Generator<number> {
        yield 5;
        for (; ;) {
            const p = this.c.clampTarget(this.c.player.x, this.c.player.y + 70);
            const cy = Math.max(this.c.bounds.bottom + 230, Math.min(this.c.bounds.top - 230, p.y));
            this.c.emit({ type: 'telegraph', x: p.x, y: cy, kind: 'thorn-cage', value: 0.9 });
            for (let i = 0; i < 18; i++) {
                const a = Math.PI * 2 * i / 18;
                // 朝下留出约 80° 的门，笼子也不生成越界的荆棘。
                if (Math.sin(a) < -0.72) continue;
                const x = p.x + Math.cos(a) * 250, y = cy + Math.sin(a) * 250;
                if (x < this.c.bounds.left + 20 || x > this.c.bounds.right - 20) continue;
                shoot(this.c, x, y, a + Math.PI, 95, { ...STYLE.chain, delay: 0.9, life: 3.1 });
            }
            yield this.phase === 3 ? 7.5 : 10;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag === 'arm') {
            this.c.emit({ type: 'boss-phase', value: this.phase, x: part.x, y: part.y, text: '断枝 · 叶帘缺口扩大' });
        } else if (part.partTag === 'blossom') {
            this.c.emit({ type: 'boss-phase', value: this.phase, x: part.x, y: part.y, text: '落花 · 花瓣螺旋减弱' });
        }
    }
}

/** 创建第 2 章 Boss；不是本章的 id 返回 undefined。 */
export function createCh2Boss(id: string, c: SfCombat): BossScript | undefined {
    switch (id) {
        case 'moth': return new MothQueen(c);
        case 'hive': return new Hive(c);
        case 'lanternshroom': return new LanternShroom(c);
        case 'twinshroom': return new TwinShroom(c);
        case 'treeking': return new TreeKing(c);
        case 'treeking-hidden': return new TreeKing(c, true);
        default: return undefined;
    }
}
