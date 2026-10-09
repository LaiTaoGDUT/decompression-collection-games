import type { SfCombat } from './SfCombat';
import { bossPartDef, type Enemy, type EnemyDef } from './SfEnemies';
import { HP_UNITS } from './SfBalance';
import type { BossTier } from './SfTypes';
import { BossScript, TIER_SCORE, ch, type BossInfo } from './SfBossBase';
import { CH2_BOSS_INFO, createCh2Boss } from './content/ch2/bosses';
import { CH3_BOSS_INFO, createCh3Boss } from './content/ch3/bosses';
import { CH4_BOSS_INFO, createCh4Boss } from './content/ch4/bosses';
import { CH5_BOSS_INFO, createCh5Boss } from './content/ch5/bosses';
import { CH6_BOSS_INFO, createCh6Boss } from './content/ch6/bosses';

export { BossScript, type BossInfo };
import { ChargeMotion, LinearMotion, PathMotion } from './SfMotion';
import { aimAngle, aimed, fan, lerpAngle, ring, shoot, stream, wall, DOWN, STYLE, type ShotStyle } from './SfPatterns';

export const BOSS_INFO: Readonly<Record<string, BossInfo>> = {
    hummingtwins: { id: 'hummingtwins', name: '蜂鸟双子机', tier: 'small', chapter: 1, frame: 'boss/humming-a', intro: '两架交替突刺的快速战机；击落一架，另一架会暴怒。' },
    pelican: { id: 'pelican', name: '巨嘴鹈鹕号', tier: 'mid', chapter: 1, frame: 'boss/pelican', intro: '张嘴吞气后喷出散弹或小贼；打掉螺旋桨后会加速冲撞。' },
    powderkeg: { id: 'powderkeg', name: '火药桶飞艇', tier: 'small', chapter: 1, frame: 'boss/powderkeg', intro: '打爆船身上的火药桶会炸伤飞艇本体，也会炸出弹环。' },
    redhawk: { id: 'redhawk', name: '王牌战机·赤鹰', tier: 'mid', chapter: 1, frame: 'boss/redhawk', intro: '机枪瞄准你将要到达的位置，变向才能躲开；虚线标出俯冲路线，打掉翼下机枪舱可减少扫射。' },
    blacksail: { id: 'blacksail', name: '黑帆女王号', tier: 'big', chapter: 1, frame: 'boss/blacksail-hull', intro: '空贼旗舰。主帆挡住子弹，烧掉主帆才能打到船身。' },
    'blacksail-hidden': { id: 'blacksail-hidden', name: '幽灵女王号', tier: 'hidden', chapter: 1, frame: 'boss/blacksail-hull', intro: '隐藏 Boss。沉没的旗舰化作幽灵归来，弹墙会从两侧同时压来。' },
    ...CH2_BOSS_INFO,
    ...CH3_BOSS_INFO,
    ...CH4_BOSS_INFO,
    ...CH5_BOSS_INFO,
    ...CH6_BOSS_INFO,
};


// ───────────────────────────── 1-1 蜂鸟双子机 ─────────────────────────────

class HummingTwins extends BossScript {
    readonly id = 'hummingtwins';
    readonly name = '蜂鸟双子机';
    readonly tier: BossTier = 'small';
    private enraged = false;

    constructor(c: SfCombat) {
        super(c);
        const units = this.hpFor('small') / 2;
        const a = this.spawnBody(bossPartDef('humming-a', '蜂鸟双子机·赤', 'boss/humming-a', 'boss', 30, 'metal', 1, ''), -160, c.bounds.top + 120, units, 0.5);
        const b = this.spawnBody(bossPartDef('humming-b', '蜂鸟双子机·青', 'boss/humming-b', 'boss', 30, 'metal', 1, ''), 160, c.bounds.top + 120, units, 0.5);
        a.face = b.face = true;
        this.start(this.entry(), 'move');
    }

    private *entry(): Generator<number> {
        const [a, b] = this.bodies;
        const top = this.c.bounds.top;
        let t = 0;
        while (t < 2.0) {
            t += this.dt;
            const u = Math.min(1, t / 2);
            a.y = top + 120 - u * 380; b.y = a.y;
            a.vy = b.vy = -200;
            yield 0;
        }
        this.entering = false;
        for (const e of this.bodies) e.damageScale = 1;
        this.onPhase(0);
    }

    onPhase(phase: number): void {
        if (phase === 0) {
            this.bodies.forEach((e, i) => {
                this.start(this.orbit(e, i), `orbit-${i}`);
                this.start(this.shooter(e, i), 'attack');
            });
            this.start(this.dasher(), 'attack');
        }
    }

    private *orbit(e: Enemy, index: number): Generator<number> {
        let a = index * Math.PI;
        for (; ;) {
            if ((e as Enemy & { dashing?: boolean }).dashing || e.dead) { yield 0; continue; }
            a += this.dt * (this.enraged ? 2.4 : 1.4);
            const cx = 0, cy = ch(this.c, 0.72);
            const tx = cx + Math.cos(a) * 230 * (index === 0 ? 1 : -1);
            const ty = cy + Math.sin(a * 2) * 90;
            e.vx = (tx - e.x) * 6; e.vy = (ty - e.y) * 6;
            e.x += (tx - e.x) * Math.min(1, this.dt * 6);
            e.y += (ty - e.y) * Math.min(1, this.dt * 6);
            yield 0;
        }
    }

    private *shooter(e: Enemy, index: number): Generator<number> {
        yield 1 + index * 0.7;
        for (; ;) {
            if (!e.dead && !(e as Enemy & { dashing?: boolean }).dashing) {
                aimed(this.c, e.x, e.y - 20, this.enraged ? 5 : 3, this.enraged ? 40 : 24, 230, STYLE.small);
                this.c.emit({ type: 'shot', kind: 'enemy', x: e.x, y: e.y });
            }
            yield this.enraged ? 1.0 : 1.5;
        }
    }

    private *dasher(): Generator<number> {
        yield 3.5;
        let turn = 0;
        for (; ;) {
            const alive = this.bodies.filter(e => !e.dead);
            if (alive.length === 0) return;
            const e = alive[turn++ % alive.length] as Enemy & { dashing?: boolean };
            e.dashing = true;
            // 锁定线预警。
            let t = 0;
            let dirX = 0, dirY = -1;
            while (t < 0.8) {
                t += this.dt;
                const dx = this.c.player.x - e.x, dy = this.c.player.y - e.y, len = Math.hypot(dx, dy) || 1;
                dirX = dx / len; dirY = dy / len;
                e.aimX = dirX; e.aimY = dirY; e.windup = 0.1;
                e.vx = dirX * 10; e.vy = dirY * 10;
                yield 0;
            }
            e.aimX = e.aimY = 0;
            this.c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'dash' });
            const speed = this.enraged ? 1100 : 900;
            while (!e.dead && e.y > this.c.bounds.bottom - 80 && e.x > this.c.bounds.left - 80 && e.x < this.c.bounds.right + 80) {
                e.x += dirX * speed * this.dt; e.y += dirY * speed * this.dt;
                e.vx = dirX * speed; e.vy = dirY * speed;
                yield 0;
            }
            if (e.dead) continue;
            if (this.enraged) fan(this.c, e.x, Math.max(e.y, this.c.bounds.bottom + 40), Math.PI / 2, 8, 140, 200, STYLE.diamond);
            // 从顶部重新入场。
            e.x = this.c.rng.range(-250, 250); e.y = this.c.bounds.top + 80;
            e.damageScale = 0;
            yield* this.moveTo(e, e.x, ch(this.c, 0.75), 0.8);
            e.damageScale = 1;
            e.dashing = false;
            yield this.enraged ? 2.4 : 4.2;
        }
    }

    protected onBodyKilled(): void {
        if (this.bodies.some(e => !e.dead) && !this.enraged) {
            this.enraged = true;
            this.c.emit({ type: 'boss-phase', value: 1, x: this.core.x, y: this.core.y, text: '暴怒' });
        }
    }
}

// ───────────────────────────── 1-3 火药桶飞艇 ─────────────────────────────

class PowderKeg extends BossScript {
    readonly id = 'powderkeg';
    readonly name = '火药桶飞艇';
    readonly tier: BossTier = 'small';
    private kegs: Enemy[] = [];

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        const core = this.spawnBody(bossPartDef('powderkeg', '火药桶飞艇', 'boss/powderkeg', 'boss', 70, 'balloon', 1, ''), 0, c.bounds.top + 200, this.hpFor('small'));
        core.radius = 70;
        const kegDef = bossPartDef('powderkeg-keg', '火药桶', 'boss/keg', 'part', 18, 'wood', 1, '');
        const slots = [[-78, 60], [78, 60], [-92, 0], [92, 0], [-78, -60], [78, -60]];
        for (const [x, y] of slots) {
            const keg = this.spawnPart(kegDef, core, x, y, 0.9);
            keg.partTag = 'keg';
            this.kegs.push(keg);
        }
        this.start(this.enter(0, ch(c, 0.76)), 'move');
    }

    onPhase(phase: number): void {
        if (phase === 0) {
            this.start(this.sway(this.core, 150, 0.7, ch(this.c, 0.76)), 'move');
            this.start(this.bombs(), 'attack');
            this.start(this.fanShots(), 'attack');
        } else {
            this.start(this.bombs(), 'attack');
            this.start(this.spiral(), 'attack');
            this.start(this.kegSparks(), 'attack');
        }
    }

    private *bombs(): Generator<number> {
        yield 1.2;
        for (; ;) {
            const core = this.core;
            shoot(this.c, core.x, core.y - 60, DOWN, 110, {
                kind: 'bomb', radius: 11, fuse: 1.2, burst: { count: 6, speed: 170, kind: 'orb-os', radius: 7 },
            });
            yield this.phase ? 1.3 : 1.7;
        }
    }

    private *fanShots(): Generator<number> {
        yield 2;
        for (; ;) {
            this.core.windup = 0.4;
            yield 0.4;
            aimed(this.c, this.core.x, this.core.y - 40, 3, 30, 240, STYLE.medium);
            yield 2.0;
        }
    }

    private *spiral(): Generator<number> {
        let a = 0;
        for (; ;) {
            for (let i = 0; i < 40; i++) {
                a += 0.23;
                shoot(this.c, this.core.x, this.core.y, a, 190, STYLE.orangeSmall);
                shoot(this.c, this.core.x, this.core.y, a + Math.PI, 190, STYLE.orangeSmall);
                yield 0.075;
            }
            yield 1.6;
        }
    }

    private *kegSparks(): Generator<number> {
        for (; ;) {
            for (const keg of this.kegs) if (!keg.dead) aimed(this.c, keg.x, keg.y, 1, 0, 260, STYLE.small);
            yield 2.0;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag !== 'keg') return;
        const core = this.core;
        core.hp -= core.maxHp * 0.07;
        core.hitFlash = 0.2;
        ring(this.c, part.x, part.y, 10, 190, this.c.rng.next(), STYLE.star);
        this.c.emit({ type: 'explosion', x: part.x, y: part.y, size: 70, kind: 'keg' });
        if (core.hp <= 0) this.c.killEnemy(core, 'mechanic', true);
    }
}

// ───────────────────────────── 1-2 巨嘴鹈鹕号 ─────────────────────────────

class Pelican extends BossScript {
    readonly id = 'pelican';
    readonly name = '巨嘴鹈鹕号';
    readonly tier: BossTier = 'mid';
    private props: Enemy[] = [];
    private home = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.6, 0.3);
        const core = this.spawnBody(bossPartDef('pelican', '巨嘴鹈鹕号', 'boss/pelican', 'boss', 92, 'balloon', 1, ''), 0, c.bounds.top + 220, this.hpFor('mid'));
        core.radius = 92;
        const propDef = bossPartDef('pelican-prop', '螺旋桨', 'boss/pelican-prop', 'part', 28, 'metal', 1, '');
        this.props = [this.spawnPart(propDef, core, -118, 20, 4.5), this.spawnPart(propDef, core, 118, 20, 4.5)];
        this.props.forEach((p, i) => { p.partTag = 'prop'; p.scale = i === 0 ? -1 : 1; });
        this.home = ch(c, 0.74);
        this.start(this.enter(0, this.home), 'move');
    }

    private get speed(): number { return this.props.every(p => p.dead) ? 1.45 : 1; }

    onPhase(phase: number): void {
        this.stop('move');
        this.start(this.sway(this.core, 170, 0.55 * this.speed, this.home), 'move');
        this.start(this.mouth(), 'attack');
        this.start(this.propShots(), 'attack');
        if (phase >= 1) this.start(this.bellyRings(), 'attack');
        if (phase >= 2) { this.stop('move'); this.start(this.rams(), 'attack'); }
    }

    private *mouth(): Generator<number> {
        yield 1.5;
        let n = 0;
        for (; ;) {
            const core = this.core;
            core.frame = 'boss/pelican-open';
            core.windup = 0.8;
            this.c.emit({ type: 'telegraph', x: core.x, y: core.y - 80, kind: 'inhale' });
            yield 0.8;
            if (n++ % 3 === 2) {
                for (let i = 0; i < 3; i++) {
                    const side = i - 1;
                    const path = [
                        { x: core.x, y: core.y - 90 }, { x: core.x + side * 140, y: core.y - 280 },
                        { x: side * 260, y: ch(this.c, 0.25) }, { x: side * 330, y: this.c.bounds.bottom - 120 },
                    ];
                    this.c.spawnEnemy('raider', core.x, core.y - 90, new PathMotion(path, 3.4));
                }
            } else {
                for (let i = 0; i < 18; i++) {
                    shoot(this.c, core.x, core.y - 90, DOWN + this.c.rng.range(-0.95, 0.95), this.c.rng.range(170, 300), STYLE.medium);
                }
            }
            this.c.emit({ type: 'boss-attack', x: core.x, y: core.y - 90, kind: 'spit' });
            yield 0.35;
            core.frame = 'boss/pelican';
            yield this.phase >= 1 ? 2.6 : 3.2;
        }
    }

    private *propShots(): Generator<number> {
        yield 2.3;
        for (; ;) {
            for (const p of this.props) if (!p.dead) aimed(this.c, p.x, p.y - 20, 1, 0, 250, STYLE.small);
            yield 1.4;
        }
    }

    private *bellyRings(): Generator<number> {
        let offset = 0;
        yield 1.2;
        for (; ;) {
            offset += 0.2;
            ring(this.c, this.core.x, this.core.y, 16, 160, offset, STYLE.orange);
            yield 2.6;
        }
    }

    private *rams(): Generator<number> {
        const core = this.core;
        yield 1;
        for (; ;) {
            yield* this.moveTo(core, Math.max(-250, Math.min(250, this.c.player.x)), this.home, 0.9 / this.speed);
            core.aimX = 0; core.aimY = -1; core.windup = 0.7;
            this.c.emit({ type: 'telegraph', x: core.x, y: core.y, kind: 'ram' });
            yield 0.7;
            const targetY = Math.max(this.c.bounds.bottom + 260, this.c.player.y + 160);
            yield* this.moveTo(core, core.x, targetY, 0.55 / this.speed);
            core.aimY = 0;
            ring(this.c, core.x, core.y, 20, 180, this.c.rng.next(), STYLE.ring);
            yield 0.3;
            yield* this.moveTo(core, core.x, this.home, 1.1 / this.speed);
            fan(this.c, core.x, core.y - 80, DOWN, 7, 70, 230, STYLE.small);
            yield 1.2;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag === 'prop' && this.props.every(p => p.dead)) {
            this.c.emit({ type: 'boss-phase', value: this.phase, x: this.core.x, y: this.core.y, text: '加速' });
            if (this.phase < 2) { this.stop('move'); this.start(this.sway(this.core, 190, 0.55 * this.speed, this.home), 'move'); }
        }
    }
}

// ───────────────────────────── 1-4 王牌战机·赤鹰 ─────────────────────────────

/** 挂在机体上、随机体朝向一起旋转的部件（机枪舱、残骸、螺旋桨）：bx / by 为机头朝下时的偏移。 */
interface HawkMount { e: Enemy; bx: number; by: number }

const HAWK_GUN_X = 80, HAWK_GUN_Y = -80, HAWK_PROP_Y = -60;
/** 机枪舱炮口（相对舱体中心，机头朝下时）与机头炮口。 */
const HAWK_MUZZLE = -32, HAWK_NOSE = -96;
/** 俯冲路线的出入点：屏幕上沿外 160 像素、左右 330 像素。 */
const HAWK_DIVE_X = 330, HAWK_DIVE_ABOVE = 160;

/**
 * 空贼王牌的超大螺旋桨战斗机，和玩家一对一缠斗（第 1 章动词“冲”）：
 * - 盘旋：在上方左右游走，两翼机枪舱轮流打预判连发——瞄准玩家按当前速度将要到达的位置，只有变向才能躲开；
 * - 俯冲扫射：拉升出屏 → 虚线预告 U 形俯冲路线 → 沿路线高速俯冲穿场、机枪一路预判扫射，再从另一侧拉出屏幕；
 * - 阶段 2（60%）：每轮两次俯冲，沿途投下落地炸成十字的炸弹；
 * - 阶段 3（25%）：王牌连斩——左右交替连续三次俯冲，路线压得更低。
 * 两翼机枪舱可逐个打掉（各掉一种零件）；两个都没了改由机头炮单发预判。
 */
class RedHawk extends BossScript {
    readonly id = 'redhawk';
    readonly name = '王牌战机·赤鹰';
    readonly tier: BossTier = 'mid';
    private readonly guns: Enemy[];
    private readonly mounts: HawkMount[] = [];
    private readonly prop: Enemy;
    private propSpin = 0;
    /** 俯冲中机头沿速度方向；其余时间机头朝下，按横移速度侧倾。 */
    private diving = false;
    private home = 0;
    private lastX = 0;
    private lastY = 0;
    /** 玩家平滑速度（预判射击用）。 */
    private pvx = 0;
    private pvy = 0;
    private lastPx = 0;
    private lastPy = 0;
    private gunTurn = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.6, 0.25);
        // 俯冲与拉升时约四成时间在屏外，血量取常规中 Boss 的 72%，击破时长与同章中 Boss 持平。
        const core = this.spawnBody(bossPartDef('redhawk', '王牌战机·赤鹰', 'boss/redhawk', 'boss', 86, 'metal', 1, ''), 0, c.bounds.top + 200, this.hpFor('mid') * 0.72);
        core.radius = 86;
        const gunDef = bossPartDef('redhawk-gun', '翼下机枪舱', 'boss/redhawk-gun', 'part', 26, 'metal', 1, '');
        this.guns = [-1, 1].map(side => {
            const gun = this.spawnPart(gunDef, core, side * HAWK_GUN_X, HAWK_GUN_Y, 5);
            gun.partTag = 'gun';
            gun.scale = side;
            gun.drop = side < 0 ? 'wing' : 'special';
            this.mounts.push({ e: gun, bx: side * HAWK_GUN_X, by: HAWK_GUN_Y });
            return gun;
        });
        // 螺旋桨只做显示：转动的半透明虚影，不参与碰撞和伤害。
        this.prop = this.spawnPart(bossPartDef('redhawk-prop', '螺旋桨', 'boss/redhawk-prop', 'part', 1, 'metal', 1, ''), core, 0, HAWK_PROP_Y, 1);
        this.prop.wreck = this.prop.decor = true;
        this.prop.alpha = 0.72;
        this.mounts.push({ e: this.prop, bx: 0, by: HAWK_PROP_Y });
        this.home = ch(c, 0.76);
        this.lastX = core.x; this.lastY = core.y;
        this.lastPx = c.player.x; this.lastPy = c.player.y;
        this.start(this.enter(0, this.home, 2.6), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (dt <= 0 || this.core.dead) return;
        const p = c.player, k = Math.min(1, dt * 5);
        this.pvx += ((p.x - this.lastPx) / dt - this.pvx) * k;
        this.pvy += ((p.y - this.lastPy) / dt - this.pvy) * k;
        this.lastPx = p.x; this.lastPy = p.y;
        const core = this.core;
        core.vx = (core.x - this.lastX) / dt;
        core.vy = (core.y - this.lastY) / dt;
        this.lastX = core.x; this.lastY = core.y;
        const target = this.diving && Math.hypot(core.vx, core.vy) > 40
            ? Math.atan2(core.vy, core.vx) + Math.PI / 2
            : Math.max(-0.3, Math.min(0.3, core.vx * 0.0012));
        core.angle = lerpAngle(core.angle, target, Math.min(1, dt * 8));
        this.propSpin += dt * 26;
        const cos = Math.cos(core.angle), sin = Math.sin(core.angle);
        for (const m of this.mounts) {
            if (m.e.dead) continue;
            m.e.ox = m.bx * cos - m.by * sin;
            m.e.oy = m.bx * sin + m.by * cos;
            m.e.angle = core.angle + (m.e === this.prop ? this.propSpin : 0);
        }
    }

    onPhase(phase: number): void {
        this.c.scrollSpeed = 22;
        this.start(this.dogfight(phase), 'attack');
    }

    /** 一轮：回到上方 → 盘旋射击 → 连续俯冲（阶段 1/2/3 分别 1/2/3 次）。阶段切换时这条任务被停止，新阶段从回位开始。 */
    private *dogfight(phase: number): Generator<number> {
        let side = this.c.rng.sign();
        for (; ;) {
            yield* this.returnHome();
            yield* this.hover(phase >= 2 ? 2.2 : 3.2);
            for (let i = 0; i <= phase; i++) {
                yield* this.dive(side, phase, i > 0);
                side = -side;
            }
        }
    }

    /** 从任意位置（含屏外）飞回上方盘旋高度。 */
    private *returnHome(): Generator<number> {
        const core = this.core;
        this.diving = false;
        if (core.y > this.c.bounds.top) {
            core.x = Math.max(-200, Math.min(200, core.x));
            this.lastX = core.x; this.lastY = core.y;
        }
        yield* this.moveTo(core, Math.max(-160, Math.min(160, core.x * 0.5)), this.home, 0.8);
    }

    /** 盘旋：左右游走，两翼机枪舱轮流打 4 连发预判弹（舱体闪烁 0.3 秒预警）。 */
    private *hover(duration: number): Generator<number> {
        const core = this.core;
        this.diving = false;
        let t = 0, fire = 0.8;
        const sway = this.c.rng.range(0, Math.PI * 2);
        while (t < duration) {
            t += this.dt;
            const tx = Math.sin(this.time * 0.9 + sway) * 190;
            core.x += (tx - core.x) * Math.min(1, this.dt * 2.2);
            core.y += (this.home + Math.sin(t * 1.7) * 12 - core.y) * Math.min(1, this.dt * 3);
            fire -= this.dt;
            if (fire <= 0) {
                fire = this.phase >= 1 ? 0.85 : 1.1;
                this.start(this.burst(this.phase >= 1 ? 4 : 3), 'attack');
            }
            yield 0;
        }
    }

    /** 一个机枪舱的预判连发：每发都按玩家当前速度重新预判。 */
    private *burst(count: number): Generator<number> {
        const gun = this.nextGun();
        if (gun) gun.windup = 0.3;
        yield 0.3;
        for (let i = 0; i < count; i++) {
            if (this.diving) return;
            this.fireLead(gun && !gun.dead ? gun : null, 290, STYLE.orange);
            yield 0.08;
        }
    }

    /** 俯冲扫射：拉升出屏 → 预告 U 形路线 → 沿路线俯冲并一路预判扫射（阶段 2 起投弹）→ 从另一侧拉出屏幕。 */
    private *dive(side: number, phase: number, chained: boolean): Generator<number> {
        const c = this.c, core = this.core;
        this.diving = true;
        const outY = c.bounds.top + HAWK_DIVE_ABOVE;
        if (core.y < c.bounds.top + 40) yield* this.moveTo(core, core.x - side * 80, outY, chained ? 0.35 : 0.55);
        // 路线最低点压在玩家上方（阶段 3 压到玩家高度附近），横向偏向玩家。
        const p = c.player;
        const lowY = Math.max(c.flight.bottom + 160, Math.min(ch(c, 0.62), p.y + (phase >= 2 ? 50 : 150)));
        const shift = Math.max(-150, Math.min(150, p.x * 0.6));
        const at = (u: number) => {
            const arc = Math.sin(Math.PI * u);
            return { x: side * HAWK_DIVE_X * (1 - 2 * u) + shift * arc, y: outY - (outY - lowY) * arc };
        };
        core.x = side * HAWK_DIVE_X; core.y = outY;
        this.lastX = core.x; this.lastY = core.y + 1;
        core.angle = 0;
        // 预告：虚线路线由淡到实，最后闪一下俯冲入口。
        const warn = chained ? 0.6 : 0.85;
        let t = 0;
        while (t < warn) {
            t += this.dt;
            this.drawPath(at, 0, 1 - t / warn);
            yield 0;
        }
        const entry = at(0.12);
        c.emit({ type: 'telegraph', x: entry.x, y: Math.min(entry.y, c.bounds.top - 60), kind: 'dash', value: 0.3 });
        const duration = phase >= 2 ? 1.7 : 1.9;
        let u = 0, gunT = 0, bombT = 0.3;
        while (u < 1) {
            u = Math.min(1, u + this.dt / duration);
            const pos = at(u);
            core.x = pos.x; core.y = pos.y;
            this.drawPath(at, u, 0);
            const onScreen = core.y < c.bounds.top - 30;
            gunT -= this.dt;
            if (onScreen && gunT <= 0) {
                gunT = phase >= 2 ? 0.18 : phase >= 1 ? 0.2 : 0.22;
                const gun = this.nextGun();
                this.fireLead(gun, 300, STYLE.orangeSmall);
            }
            bombT -= this.dt;
            if (phase >= 1 && onScreen && bombT <= 0 && core.y > p.y + 80) {
                bombT = 0.36;
                shoot(c, core.x, core.y - 30, DOWN, 80, {
                    kind: 'bomb', radius: 11, fuse: 0.75, burst: { count: 4, speed: 140, kind: 'orb-os', radius: 7, offset: Math.PI / 4 },
                });
            }
            yield 0;
        }
    }

    /** 俯冲路线虚线（只做显示）：从进度 from 往后画。warn > 0 时为预告阶段（由淡到实）。 */
    private drawPath(at: (u: number) => { x: number; y: number }, from: number, warn: number): void {
        const steps = 22;
        let prev = at(from);
        for (let i = 1; i <= steps; i++) {
            const u = from + (1 - from) * i / steps;
            const next = at(u);
            this.c.addHazard({ kind: 'path', ax: prev.x, ay: prev.y, bx: next.x, by: next.y, width: 9, warn: warn > 0 ? warn : undefined });
            prev = next;
        }
    }

    /** 轮流取一个存活的机枪舱；都被打掉时返回 null（改用机头炮）。 */
    private nextGun(): Enemy | null {
        const live = this.guns.filter(g => !g.dead);
        if (live.length === 0) return null;
        return live[this.gunTurn++ % live.length];
    }

    /** 预判射击：瞄准玩家按平滑速度在子弹飞到时会到达的位置（限制在可活动区域内）。 */
    private fireLead(gun: Enemy | null, speed: number, style: ShotStyle): void {
        const c = this.c, core = this.core;
        const ox = gun ? gun.x : core.x, oy = gun ? gun.y : core.y;
        const reach = gun ? HAWK_MUZZLE : HAWK_NOSE - HAWK_PROP_Y;
        const x = ox + Math.sin(core.angle) * -reach, y = oy + Math.cos(core.angle) * reach;
        const p = c.player, f = c.flight, v = speed * c.bulletSpeedScale;
        let tx = p.x, ty = p.y;
        for (let i = 0; i < 2; i++) {
            const t = Math.hypot(tx - x, ty - y) / v;
            tx = Math.max(f.left, Math.min(f.right, p.x + this.pvx * t));
            ty = Math.max(f.bottom, Math.min(f.top, p.y + this.pvy * t));
        }
        shoot(c, x, y, Math.atan2(ty - y, tx - x), speed, style);
        c.emit({ type: 'shot', kind: 'enemy', x, y });
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag !== 'gun') return;
        const mount = this.mounts.find(m => m.e === part);
        const wreck = this.c.spawnEnemy(bossPartDef('redhawk-gun-wreck', '残骸', 'boss/redhawk-gun-broken', 'part', 1, 'metal', 1, ''),
            part.x, part.y, null, { parent: this.core, ox: part.ox, oy: part.oy, persistent: true, scale: part.scale });
        wreck.wreck = true;
        wreck.angle = part.angle;
        if (mount) this.mounts.push({ e: wreck, bx: mount.bx, by: mount.by });
        if (this.guns.every(g => g.dead)) this.c.emit({ type: 'boss-phase', value: this.phase, x: this.core.x, y: this.core.y, text: '机枪舱全毁 · 改用机头炮' });
    }
}

// ───────────────────────────── 1-5 黑帆女王号（含隐藏版） ─────────────────────────────

class BlackSail extends BossScript {
    readonly id: string = 'blacksail';
    readonly name: string = '黑帆女王号';
    readonly tier: BossTier = 'big';
    protected sail!: Enemy;
    protected batteries: Enemy[] = [];
    protected home = 0;
    protected ghost = false;

    constructor(c: SfCombat, ghost = false) {
        super(c);
        this.ghost = ghost;
        if (ghost) this.tint = 'ghost';
        // 阶段 0→1 由主帆被烧毁触发（见 update），不按血量。
        this.thresholds.push(-1, 0.35);
        if (ghost) this.thresholds.push(0.18);
        const units = this.hpFor(ghost ? 'hidden' : 'big');
        const core = this.spawnBody(bossPartDef('blacksail', '黑帆女王号', 'boss/blacksail-hull', 'boss', 100, 'wood', 1, ''), 0, c.bounds.top + 300, units * 0.72);
        core.radius = 96;
        // 隐藏版的 tier 字段在父类构造之后才赋值，这里直接按隐藏级别给分。
        if (ghost) core.scoreValue = TIER_SCORE.hidden;
        this.sail = this.spawnPart(bossPartDef('blacksail-sail', '主帆', 'boss/blacksail-sail', 'part', 70, 'wood', 1, ''), core, 0, 26, units * 0.16);
        this.sail.partTag = 'sail';
        core.coveredBy = this.sail;
        const batteryDef = bossPartDef('blacksail-battery', '舷炮排', 'boss/blacksail-battery', 'part', 40, 'metal', 1, '');
        this.batteries = [this.spawnPart(batteryDef, core, -132, 10, units * 0.12), this.spawnPart(batteryDef, core, 132, 10, units * 0.12)];
        this.batteries.forEach((b, i) => { b.partTag = 'battery'; b.scale = i === 0 ? -1 : 1; b.radius = 44; });
        this.home = ch(c, 0.66);
        this.start(this.enter(0, this.home, 3.0), 'move');
    }

    /** 阶段 0 以主帆存活为准：主帆被烧掉时强制进入阶段 1。 */
    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (!this.entering && this.phase === 0 && this.sail.dead) this.setPhase(1);
    }

    onPhase(phase: number): void {
        this.stop('move');
        this.start(this.sway(this.core, 110, 0.4, this.home, 8), 'move');
        this.start(this.walls(), 'attack');
        this.start(this.captain(), 'attack');
        if (this.ghost) this.start(this.sideWalls(), 'attack');
        if (phase >= 1) { this.start(this.anchorChain(), 'attack'); this.start(this.summons(), 'attack'); }
        if (phase >= 2) this.start(this.spiral(), 'attack');
        if (phase >= 3) this.start(this.vortex(), 'attack');
    }

    protected *walls(): Generator<number> {
        yield 1.2;
        let gap = 0;
        for (; ;) {
            const alive = this.batteries.filter(b => !b.dead);
            if (alive.length) {
                gap = Math.max(-260, Math.min(260, gap + this.c.rng.range(-170, 170)));
                for (const b of alive) b.windup = 0.4;
                yield 0.4;
                wall(this.c, this.core.y - 70, gap, alive.length === 2 ? 140 : 190, 46, 175, this.style(STYLE.medium));
                this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'broadside' });
            }
            yield this.phase >= 2 ? 2.1 : 2.8;
        }
    }

    protected *captain(): Generator<number> {
        yield 2.2;
        for (; ;) {
            const x = this.core.x, y = this.core.y - 104;
            aimed(this.c, x, y, this.phase >= 1 ? 5 : 3, this.phase >= 1 ? 36 : 22, 220, this.style(STYLE.large));
            yield 2.0;
        }
    }

    protected *anchorChain(): Generator<number> {
        yield 1.0;
        let t = 0;
        for (; ;) {
            for (let i = 0; i < 70; i++) {
                t += 0.07;
                const a = DOWN + Math.sin(t * 1.25) * 1.05;
                shoot(this.c, this.core.x, this.core.y - 60, a, 330, this.style(STYLE.chain));
                yield 0.07;
            }
            yield 2.2;
        }
    }

    protected *summons(): Generator<number> {
        yield 4;
        for (; ;) {
            const side = this.c.rng.sign();
            for (let i = 0; i < 5; i++) {
                const ox = (i - 2) * 60;
                const e = this.c.spawnEnemy('raider', side * 200 + ox, this.c.bounds.top + 40 + Math.abs(i - 2) * 40, new LinearMotion(0, -260), { tint: this.tint });
                e.face = true;
            }
            yield 8;
        }
    }

    protected *spiral(): Generator<number> {
        let a = 0;
        for (; ;) {
            for (let i = 0; i < 46; i++) {
                a += 0.19;
                for (let k = 0; k < 2; k++) shoot(this.c, this.core.x, this.core.y - 40, a + k * Math.PI, 200, this.style(STYLE.orangeSmall));
                yield 0.09;
            }
            aimed(this.c, this.core.x, this.core.y - 100, 7, 50, 260, this.style(STYLE.diamond));
            yield 1.3;
        }
    }

    // ── 隐藏版专属 ──

    protected *sideWalls(): Generator<number> {
        yield 3;
        for (; ;) {
            const y = ch(this.c, this.c.rng.range(0.2, 0.55));
            const gapY = y + this.c.rng.range(-80, 80);
            for (const side of [-1, 1]) {
                for (let k = 0; k < 9; k++) {
                    const by = y - 160 + k * 40;
                    if (Math.abs(by - gapY) < 60) continue;
                    shoot(this.c, side * (this.c.bounds.right + 10), by, side > 0 ? Math.PI : 0, 150, this.style(STYLE.medium));
                }
            }
            this.c.emit({ type: 'boss-attack', x: 0, y, kind: 'ghost-wall' });
            yield 4.2;
        }
    }

    protected *vortex(): Generator<number> {
        let a = 0;
        for (; ;) {
            for (let i = 0; i < 36; i++) {
                a += 0.35;
                shoot(this.c, this.core.x, this.core.y, a, 170, { ...this.style(STYLE.medium), turn: 1.1 });
                shoot(this.c, this.core.x, this.core.y, -a, 170, { ...this.style(STYLE.medium), turn: -1.1 });
                yield 0.1;
            }
            for (let i = 0; i < 2; i++) {
                const side = this.c.rng.sign();
                const crew = this.c.spawnEnemy('raider', side * 280, this.c.bounds.top + 40, new ChargeMotion(ch(this.c, 0.7), 0.6, 820), { tint: 'ghost' });
                crew.face = true;
            }
            yield 1.5;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag === 'sail') this.c.emit({ type: 'boss-phase', value: 1, x: part.x, y: part.y, text: '主帆烧毁' });
    }
}

class GhostQueen extends BlackSail {
    readonly id = 'blacksail-hidden';
    readonly name = '幽灵女王号';
    readonly tier: BossTier = 'hidden';
    constructor(c: SfCombat) { super(c, true); }
}

export function createBoss(id: string, c: SfCombat): BossScript {
    switch (id) {
        case 'hummingtwins': return new HummingTwins(c);
        case 'powderkeg': return new PowderKeg(c);
        case 'pelican': return new Pelican(c);
        case 'redhawk': return new RedHawk(c);
        case 'blacksail': return new BlackSail(c);
        case 'blacksail-hidden': return new GhostQueen(c);
        default: {
            const boss = createCh2Boss(id, c) ?? createCh3Boss(id, c) ?? createCh4Boss(id, c) ?? createCh5Boss(id, c) ?? createCh6Boss(id, c);
            if (!boss) throw new Error(`Unknown boss: ${id}`);
            return boss;
        }
    }
}
