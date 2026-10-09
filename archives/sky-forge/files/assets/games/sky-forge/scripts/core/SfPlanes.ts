import type { SfCombat } from './SfCombat';
import type { Enemy, EnemyDef } from './SfEnemies';
import type { Motion } from './SfMotion';
import type { BossScript } from './SfBossBase';
import type { EnemyBullet, PlaneId, PlayerBullet } from './SfTypes';
import type { SlotId } from './SfBalance';
import { PLANE_ART } from './SfPlaneArt';
import { emptyKitVisual, resetKitVisual, type KitVisual } from './SfKitVisual';
import { segmentDistance } from './SfPatterns';
import { LinearMotion } from './SfMotion';

/** 必杀：由战斗循环每帧驱动，返回 false 表示结束。 */
export interface Ultimate {
    name: string;
    duration: number;
    update(c: SfCombat, dt: number): boolean;
}

/** 机体武器套件：主炮 / 翼炮 / 特装 + 核心机制 + 必杀。 */
export interface PlaneKit {
    update(c: SfCombat, dt: number): void;
    createUltimate(c: SfCombat): Ultimate;
    onEnemyKilled?(c: SfCombat, e: Enemy, slot: string): void;
    onBulletHit?(c: SfCombat, e: Enemy, b: PlayerBullet): void;
    onGraze?(c: SfCombat, b: EnemyBullet): void;
    tryRebirth?(c: SfCombat): boolean;
    /** 视图读取：机制状态（热度、锁定数等）。 */
    readonly gauge?: number;
    readonly gaugeLabel?: string;
    /** 视图读取：子弹之外的机制画面（分身、护盾晶体、蓄力等），见 `SfKitVisual`。 */
    readonly visual?: KitVisual;
}

const UP = Math.PI / 2;

function mount(c: SfCombat, slot: SlotId, side: number): { x: number; y: number } {
    const m = PLANE_ART[c.config.plane][slot];
    return { x: c.player.x + m[0] * side, y: c.player.y + m[1] };
}

function bullet(c: SfCombat, slot: PlayerBullet['slot'], x: number, y: number, angle: number, speed: number,
    damage: number, kind: string, radius: number, extra: Partial<PlayerBullet> = {}): PlayerBullet {
    return c.firePlayer({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius, damage, kind,
        pierce: 0, life: 2.2, slot, speed, ...extra,
    });
}

function feature(c: SfCombat, slot: SlotId, level: 4 | 7 | 10): boolean {
    return c.partLevels[slot] >= level;
}

/** 视觉上出现在全屏的必杀：持续计时，按时间点触发伤害。 */
abstract class TimedUltimate implements Ultimate {
    protected t = 0;
    constructor(readonly name: string, readonly duration: number) { }
    get elapsed(): number { return this.t; }
    update(c: SfCombat, dt: number): boolean {
        this.t += dt;
        this.tick(c, dt);
        return this.t < this.duration;
    }
    protected abstract tick(c: SfCombat, dt: number): void;
}

// ───────────────────────────── 先锋 ─────────────────────────────

class VanguardKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 0 };
    private heat = 0;
    private heatTarget = -1;
    private lastHit = -9;
    private heavyTimer = 0;
    private secondVolley = -1;
    gaugeLabel = '热度';
    get gauge(): number { return this.heat; }

    update(c: SfCombat, dt: number): void {
        if (c.time - this.lastHit > 0.35) this.heat = Math.max(0, this.heat - dt * 0.9);
        const heatCap = feature(c, 'main', 4) ? 0.8 : 0.6;
        const rate = 1 + heatCap * this.heat;
        this.fireMain(c, dt, rate);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
    }

    private fireMain(c: SfCombat, dt: number, rate: number): void {
        this.timers.main -= dt * rate;
        if (this.timers.main > 0) return;
        const interval = 0.14;
        // 火力强化只增加弹道与射速，单发伤害仍按基础弹数和间隔计算。
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const level = c.fieldParts.main;
        const baseCount = [2, 3, 4, 5][level];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const dps = c.slotDps('main');
        const damage = dps * interval / baseCount;
        const pierce = feature(c, 'main', 7) && this.heat >= 0.95 ? 1 : 0;
        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2);
            const x = c.player.x + offset * 16;
            const angle = UP + offset * 0.035;
            bullet(c, 'main', x, c.player.y + 56, angle, 1500, damage, level >= 2 ? 'vanguard-main-2' : 'vanguard-main', 9, { pierce });
        }
        c.emit({ type: 'shot', kind: 'vanguard-main', slot: 'main' });
        if (feature(c, 'main', 10) && this.heat >= 0.95) {
            this.heavyTimer -= interval;
            if (this.heavyTimer <= 0) {
                this.heavyTimer = 0.5;
                bullet(c, 'main', c.player.x, c.player.y + 60, UP, 1300, dps * 0.5, 'vanguard-heavy', 14, { pierce: 3 });
            }
        }
    }

    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt * (feature(c, 'wing', 4) ? 1.15 : 1);
        if (this.timers.wing > 0) return;
        const interval = 0.22;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const level = c.fieldParts.wing;
        const angles = level === 1 ? [0.18] : level === 2 ? [0.12, 0.26] : [0.08, 0.18, 0.3];
        const baseCount = angles.length * 2;
        const damage = c.slotDps('wing') * interval / baseCount;
        if (c.buffActive) angles.push(angles[angles.length - 1] + 0.12);
        for (const side of [-1, 1]) {
            const m = mount(c, 'wing', side);
            for (const a of angles) {
                bullet(c, 'wing', m.x, m.y + 18, UP - side * a, 1350, damage, 'vanguard-wing', 8, { pierce: feature(c, 'wing', 10) ? 1 : 0 });
            }
        }
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        if (this.secondVolley > 0) {
            this.secondVolley -= dt;
            if (this.secondVolley <= 0) this.rockets(c);
        }
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const level = c.fieldParts.special;
        this.timers.special += [0, 1.2, 1.0, 0.85][level];
        this.rockets(c);
        if (feature(c, 'special', 10)) this.secondVolley = 0.4;
    }

    private rockets(c: SfCombat): void {
        const level = c.fieldParts.special;
        if (level <= 0) return;
        const interval = [0, 1.2, 1.0, 0.85][level];
        const perSide = (level >= 3 ? 2 : 1) + (feature(c, 'special', 4) ? 1 : 0);
        const volleys = feature(c, 'special', 10) ? 2 : 1;
        const damage = c.slotDps('special') * interval / (perSide * 2 * volleys);
        for (const side of [-1, 1]) {
            const m = mount(c, 'special', side);
            for (let i = 0; i < perSide; i++) {
                const target = c.nearestEnemy(m.x, m.y + 300, 900);
                bullet(c, 'special', m.x, m.y + 10, UP + side * (0.5 + i * 0.25), 620, damage, 'rocket', 9, {
                    target: target?.id, turn: 6, life: 2.6, splash: feature(c, 'special', 7) ? 48 : 0, splashRatio: 0.5,
                });
            }
        }
        c.emit({ type: 'missile', x: c.player.x, y: c.player.y });
    }

    onBulletHit(c: SfCombat, e: Enemy, b: PlayerBullet): void {
        if (b.slot !== 'main' && !(b.slot === 'wing' && feature(c, 'wing', 7))) return;
        const since = Math.min(0.15, c.time - this.lastHit);
        if (e.id !== this.heatTarget) {
            this.heat *= 0.5;
            this.heatTarget = e.id;
        }
        this.heat = Math.min(1, this.heat + since / 2);
        this.lastHit = c.time;
    }

    createUltimate(c: SfCombat): Ultimate {
        return new VanguardStrike(c);
    }
}

class VanguardStrike extends TimedUltimate {
    private launched = 0;
    private readonly phantoms: PlayerBullet[] = [];
    constructor(private readonly c: SfCombat) { super('先锋突击', 2.4); }
    protected tick(c: SfCombat): void {
        while (this.launched < 12 && this.t >= this.launched * 0.13) {
            const lane = [-3, 1, -1, 3, -2, 2, 0, -3, 3, -1, 1, 0][this.launched];
            const x = lane * 92;
            this.phantoms.push(bullet(c, 'ultimate', x, c.bounds.top + 80, -UP, 1500, c.totalDps() * 0.5, 'phantom', 46, {
                pierce: 999, life: 2.5,
            }));
            this.launched++;
        }
        for (const p of this.phantoms) {
            if (!p.dead) c.cancelBullets(true, p.x, p.y, 70);
        }
    }
}

// ───────────────────────────── 雷霆 ─────────────────────────────

const THUNDER_IMPACT_SHARE = 0.78;
const THUNDER_BLAST_SHARE = 0.22;
const THUNDER_SHELL_SPEED = 1800;

/** 先计算前方落点；在途引信由距离触发，寿命只作为无人命中时的上限。 */
function thunderTrajectory(c: SfCombat, x: number, y: number, speed: number, fallback: number): { angle: number; life: number; target?: number } {
    const forward = (e: Enemy): boolean => e.y > y + 40 && e.damageScale >= 0.5;
    const target = c.nearestEnemy(x, y + 500, 1400, forward);
    if (!target) return { angle: fallback, life: 1.5 };
    const travel = Math.hypot(target.x - x, target.y - y) / speed;
    const dx = target.x + target.vx * travel - x;
    const dy = target.y + target.vy * travel - y;
    return { angle: Math.atan2(dy, dx), life: 2.2, target: target.id };
}

class ThunderKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0.3, special: 0.6 };
    private chain = 0;
    private chainTime = -9;
    gaugeLabel = '连锁';
    get gauge(): number { return Math.min(1, this.chain / 10); }

    update(c: SfCombat, dt: number): void {
        if (c.time - this.chainTime > 0.8) this.chain = 0;
        this.guideExplosives(c, dt);
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.24;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const level = c.fieldParts.main;
        const baseCount = [1, 2, 2, 3][level];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const splash = (level >= 2 ? 56 : 46) * (feature(c, 'main', 4) ? 1.2 : 1);
        const damage = c.slotDps('main') * interval / baseCount * THUNDER_IMPACT_SHARE;
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            const x = c.player.x + offset * 26, y = c.player.y + 60;
            const trajectory = thunderTrajectory(c, x, y, THUNDER_SHELL_SPEED, UP);
            bullet(c, 'main', x, y, trajectory.angle + offset * 0.015, THUNDER_SHELL_SPEED, damage,
                level >= 3 ? 'shell-big' : 'shell', 11, { splash, splashRatio: THUNDER_BLAST_SHARE / THUNDER_IMPACT_SHARE, tag: 'thunder-shell' });
        }
        c.emit({ type: 'shot', kind: 'thunder-main', slot: 'main' });
    }

    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.72;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const level = c.fieldParts.wing;
        const baseCount = (level >= 3 ? 2 : 1) + (feature(c, 'wing', 4) ? 1 : 0);
        const perSide = baseCount + (c.buffActive ? 1 : 0);
        // 榴弹碰撞只触发爆炸，不另结算碰撞伤害；完整预算都分配给爆炸。
        const damage = c.slotDps('wing') * interval / (baseCount * 2);
        for (const side of [-1, 1]) {
            const m = mount(c, 'wing', side);
            for (let i = 0; i < perSide; i++) {
                const trajectory = thunderTrajectory(c, m.x, m.y + 10, 800, UP - side * (0.08 + i * 0.12));
                bullet(c, 'wing', m.x, m.y + 10, trajectory.angle, 800, damage, 'grenade', 10, {
                    life: trajectory.life, target: trajectory.target, turn: 3, splash: level >= 2 ? 78 : 64, splashRatio: 1, tag: 'burst', spin: 12,
                });
            }
        }
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const level = c.fieldParts.special;
        const interval = [0, 2.4, 2.0, 1.7][level] * (feature(c, 'special', 7) ? 0.8 : 1);
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = level >= 3 ? 2 : 1;
        const bombs = baseCount + (c.buffActive ? 1 : 0);
        const damage = c.slotDps('special') * interval / baseCount;
        for (let i = 0; i < bombs; i++) {
            const side = bombs === 1 ? 0 : i * 2 / (bombs - 1) - 1;
            const trajectory = thunderTrajectory(c, c.player.x + side * 40, c.player.y + 30, 700, UP + side * 0.1);
            bullet(c, 'special', c.player.x + side * 40, c.player.y + 30, trajectory.angle, 700, damage, 'cluster', 12, {
                life: trajectory.life, target: trajectory.target, turn: 3, tag: 'cluster', spin: 4,
            });
        }
    }

    onBulletHit(c: SfCombat, e: Enemy, b: PlayerBullet): void {
        e.volatile = c.time;
        // 主炮 78% 是碰撞伤害，22% 是爆炸份额；爆心目标也应承受后者。
        if (b.tag === 'thunder-shell' && targetable(e)) {
            c.damageEnemy(e, b.damage * (THUNDER_BLAST_SHARE / THUNDER_IMPACT_SHARE), b.slot, b.x, b.y);
        }
    }

    private guideExplosives(c: SfCombat, dt: number): void {
        const immune = c.enemies.filter(e => !e.dead && e.entered && e.damageScale <= 0).map(e => e.id);
        for (const b of c.pbullets) {
            if (b.dead) continue;
            // 免疫部位不应提前吃掉弹体；恢复可受伤后下一帧重新参与碰撞。
            if (b.tag === 'thunder-shell' || b.tag === 'burst' || b.tag === 'cluster' || b.tag === 'burst-mini') b.hitIds = immune;
            if (!(b.tag === 'burst' || b.tag === 'cluster' || b.tag === 'burst-mini')) continue;
            let target = c.enemies.find(e => e.id === b.target && targetable(e) && e.damageScale >= 0.5);
            if (!target) target = c.nearestEnemy(b.x, b.y + 200, 1400, e => e.damageScale >= 0.5);
            b.target = target?.id;
            b.turn = 3;
            if (!target) continue;
            const reach = b.tag === 'cluster' ? 65 : (b.splash ?? 46) * 0.7;
            if (Math.hypot(target.x - b.x, target.y - b.y) <= reach + target.radius * 0.55) b.life = Math.min(b.life, dt);
        }
    }

    /** 殉爆：被雷霆武器打死的敌人延迟 0.08 秒爆炸，爆炸可继续连锁。 */
    onEnemyKilled(c: SfCombat, e: Enemy, slot: string): void {
        if (slot === 'ultimate') return;
        if (e.boss || (e.def.size === 'part' && !feature(c, 'main', 10))) return;
        this.chain = c.time - this.chainTime < 0.8 ? this.chain + 1 : 1;
        this.chainTime = c.time;
        const count = this.chain;
        const radius = 80 + e.radius;
        const damage = (0.6 * e.maxHp + 0.4 * c.slotDps('main')) * (feature(c, 'main', 7) ? 1.3 : 1);
        const x = e.x, y = e.y;
        c.schedule(0.08, () => {
            c.emit({ type: 'chain', x, y, value: count, size: radius });
            for (const other of c.enemies) {
                if (other.dead || !other.entered || other.id === e.id) continue;
                if ((other.boss || other.def.size === 'part') && !feature(c, 'main', 10)) continue;
                if (Math.hypot(other.x - x, other.y - y) < radius + other.radius * 0.5) {
                    other.volatile = c.time;
                    c.damageEnemy(other, other.boss ? damage * 0.25 : damage, 'mechanic', other.x, other.y);
                }
            }
        });
    }

    createUltimate(c: SfCombat): Ultimate {
        return new CarpetBombing(c);
    }
}

/** 榴弹、集束炸弹的到期爆炸由战斗循环通过 tag 处理（见 resolveExpiredBullet）。 */
export function resolveExpiredBullet(c: SfCombat, b: PlayerBullet): void {
    if (b.tag === 'lightning-orb') {
        if (feature(c, 'wing', 10)) c.splash(b.x, b.y, 70, b.damage * 0.6, 'wing');
    } else if (b.tag === 'burst' && b.splash) {
        c.splash(b.x, b.y, b.splash, b.damage, b.slot);
        if (c.config.plane === 'thunder') {
            if (feature(c, 'wing', 7)) c.schedule(0.45, () => c.splash(b.x, b.y + 10, b.splash! * 0.8, b.damage * 0.4, 'wing'));
            if (feature(c, 'wing', 10)) {
                for (let i = 0; i < 3; i++) {
                    const a = UP + (i - 1) * 0.9;
                    bullet(c, 'wing', b.x, b.y, a, 300, b.damage * 0.3, 'grenade', 8, { life: 0.35, splash: 40, splashRatio: 1, tag: 'burst-mini', spin: 12 });
                }
            }
        }
    } else if (b.tag === 'burst-mini' && b.splash) {
        c.splash(b.x, b.y, b.splash, b.damage, b.slot);
    } else if (b.tag === 'cluster') {
        const count = 6 + (feature(c, 'special', 4) ? 2 : 0);
        for (let i = 0; i < count; i++) {
            const a = UP + (i / (count - 1) - 0.5) * 2.4;
            bullet(c, 'special', b.x, b.y, a, c.rng.range(220, 340), b.damage / count, 'bomblet', 8, {
                life: c.rng.range(0.28, 0.42), splash: 46, splashRatio: 1, tag: 'burst-mini',
            });
        }
        c.emit({ type: 'explosion', x: b.x, y: b.y, size: 30, kind: 'cluster' });
        if (feature(c, 'special', 10)) c.cancelBullets(true, b.x, b.y, 110);
    }
}

class CarpetBombing extends TimedUltimate {
    private rows = 0;
    constructor(private readonly c: SfCombat) { super('地毯轰炸', 2.6); }
    protected tick(c: SfCombat): void {
        const total = 16;
        while (this.rows < total && this.t >= 0.25 + this.rows * 0.13) {
            const y = c.bounds.bottom + 120 + (c.bounds.top - c.bounds.bottom - 160) * this.rows / (total - 1);
            for (let x = -300; x <= 300; x += 100) {
                const jitter = (this.rows % 2) * 50;
                c.splash(x + jitter, y, 72, c.totalDps() * 0.16, 'ultimate');
                c.cancelBullets(true, x + jitter, y, 80);
            }
            this.rows++;
        }
    }
}

// ───────────────────────────── 猎鹰 ─────────────────────────────

class FalconKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 0.5 };
    private lockTimer = 0;
    private salvoTimer = 1.5;
    private locked: Enemy[] = [];
    gaugeLabel = '锁定';
    get gauge(): number { return this.locked.length / Math.max(1, this.maxLocks); }
    private maxLocks = 2;

    update(c: SfCombat, dt: number): void {
        this.maxLocks = Math.min(8, 2 + c.fieldParts.wing * 2);
        this.guideMissiles(c);
        this.fireMain(c, dt);
        this.updateLocks(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.12;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const level = c.fieldParts.main;
        const baseCount = [1, 2, 2, 3][level];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('main') * 0.7 * interval / baseCount;
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', c.player.x + offset * 14, c.player.y + 60, UP + offset * 0.025, level >= 2 ? 1800 : 1600, damage,
                level >= 3 ? 'fneedle-2' : 'fneedle', 7);
        }
        c.emit({ type: 'shot', kind: 'falcon-main', slot: 'main' });
    }

    private updateLocks(c: SfCombat, dt: number): void {
        this.locked = this.locked.filter(e => targetable(e) && e.y < c.bounds.top);
        for (const e of c.enemies) if (e.locks > 0 && this.locked.indexOf(e) < 0) e.locks = 0;
        this.lockTimer -= dt * (feature(c, 'main', 4) ? 1.3 : 1);
        if (this.lockTimer <= 0 && this.locked.length < this.maxLocks) {
            this.lockTimer = 0.28;
            const p = c.player;
            const repeat = feature(c, 'main', 10);
            const target = c.nearestEnemy(p.x, p.y + 500, 1200, e => {
                const dx = e.x - p.x, dy = e.y - p.y;
                if (dy < 40 || e.damageScale < 0.5) return false;
                if (Math.abs(Math.atan2(dx, dy)) > 0.7) return false;
                return e.locks === 0 || (repeat && (e.boss || e.def.size === 'part') && e.locks < 2);
            });
            if (target) {
                target.locks++;
                this.locked.push(target);
                c.emit({ type: 'lock', x: target.x, y: target.y, id: target.id });
            }
        }
        this.salvoTimer -= dt;
        if (this.salvoTimer <= 0) {
            this.salvoTimer = 1.5 * (c.buffActive ? 0.75 : 1);
            if (this.locked.length > 0) this.salvo(c);
        }
    }

    private salvo(c: SfCombat): void {
        const targets = this.locked.slice();
        if (feature(c, 'main', 7)) targets.push(targets[0], targets[targets.length - 1]);
        const pool = (c.slotDps('wing', Math.max(1, c.fieldParts.wing)) * (c.fieldParts.wing > 0 ? 1 : 0.5) + c.slotDps('main') * 0.3) * 1.5;
        const damage = pool / targets.length * (feature(c, 'wing', 4) ? 1.15 : 1);
        if (c.buffActive) targets.push(targets[0], targets[targets.length - 1]);
        targets.forEach((t, i) => {
            const side = i % 2 === 0 ? -1 : 1;
            c.schedule(i * 0.05, () => {
                const m = mount(c, 'wing', side);
                const target = targetable(t) ? t : c.nearestEnemy(m.x, m.y + 500, 1400);
                const angle = target ? Math.atan2(target.y - m.y, target.x - m.x) : UP;
                bullet(c, 'wing', m.x, m.y, angle + side * 0.3, 1100, damage, 'missile', 9, {
                    target: target?.id, turn: 9, life: 2.4, splash: feature(c, 'wing', 7) ? 56 : 0, splashRatio: 0.5, tag: 'homing',
                });
            });
        });
        for (const t of this.locked) t.locks = 0;
        this.locked = [];
        c.emit({ type: 'missile', x: c.player.x, y: c.player.y, value: targets.length });
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const level = c.fieldParts.special;
        const interval = [0, 1.1, 0.9, 0.75][level] * (feature(c, 'special', 7) ? 0.8 : 1);
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [0, 3, 5, 7][level] + (feature(c, 'special', 4) ? 2 : 0);
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('special') * interval / baseCount;
        const homing = feature(c, 'special', 10);
        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            c.schedule(i * 0.03, () => {
                const m = mount(c, 'special', side);
                const target = c.nearestEnemy(m.x, m.y + 400, 1400, e => e.y > m.y + 40 && e.damageScale >= 0.5);
                const distance = target ? Math.hypot(target.x - m.x, target.y - m.y) : 600;
                const travel = distance / 900;
                const angle = target ? Math.atan2(target.y + target.vy * travel - m.y, target.x + target.vx * travel - m.x) : UP;
                const spread = (i / Math.max(1, count - 1) - 0.5) * (target ? Math.min(0.6, target.radius / distance) : 0.6);
                bullet(c, 'special', m.x, m.y + 6, angle + spread, 900, damage, 'micro', 7, {
                    target: homing ? target?.id : undefined, turn: homing ? 3 : 0, life: 1.6, tag: homing ? 'falcon-homing' : undefined,
                });
            });
        }
    }

    /** 在途火力先占用目标血量；死亡、遮挡和阶段免疫后重新分配。 */
    private guideMissiles(c: SfCombat): void {
        const reserved = new Map<number, number>();
        for (const b of c.pbullets) {
            if (b.dead || !(b.kind === 'missile' || b.tag === 'homing' || b.tag === 'falcon-homing')) continue;
            let target = c.enemies.find(e => e.id === b.target && targetable(e) && e.damageScale >= 0.5);
            if (!target || (reserved.get(target.id) ?? 0) >= target.hp) {
                target = c.nearestEnemy(b.x, b.y, 1600, e => e.damageScale >= 0.5 && (reserved.get(e.id) ?? 0) < e.hp);
            }
            b.target = target?.id;
            b.turn = b.tag === 'falcon-homing' ? 3 : 9;
            if (target) reserved.set(target.id, (reserved.get(target.id) ?? 0) + b.damage);
        }
    }

    onEnemyKilled(c: SfCombat, e: Enemy, slot: string): void {
        if (slot !== 'wing' || !feature(c, 'wing', 10)) return;
        for (const side of [-1, 1]) {
            const target = c.nearestEnemy(e.x, e.y, 600, other => other.id !== e.id);
            bullet(c, 'wing', e.x, e.y, UP + side * 1.1, 640, c.slotDps('wing') * 0.25, 'micro', 7, { target: target?.id, turn: 6, life: 1.5 });
        }
    }

    createUltimate(c: SfCombat): Ultimate {
        return new SaturationStrike(c);
    }
}

class SaturationStrike extends TimedUltimate {
    private fired = 0;
    private targets: Enemy[] = [];
    constructor(private readonly c: SfCombat) {
        super('饱和打击', 1.9);
        this.targets = c.enemies.filter(e => !e.dead && e.entered && e.damageScale > 0);
        for (const e of this.targets) c.emit({ type: 'lock', x: e.x, y: e.y, id: e.id });
    }
    protected tick(c: SfCombat): void {
        const total = 48;
        while (this.fired < total && this.t >= 0.3 + this.fired * 0.03) {
            const alive = this.targets.filter(e => !e.dead);
            if (alive.length === 0) this.targets = c.enemies.filter(e => !e.dead && e.entered && e.damageScale > 0);
            const target = alive.length ? alive[this.fired % alive.length] : undefined;
            const side = this.fired % 2 === 0 ? -1 : 1;
            bullet(c, 'ultimate', c.player.x + side * 30, c.player.y, UP + side * (0.6 + (this.fired % 5) * 0.2), 700,
                c.totalDps() * 0.17, 'missile', 9, { target: target?.id, turn: 9, life: 2.4, splash: 50, splashRatio: 0.4 });
            this.fired++;
        }
        if (this.t < 0.4) c.cancelBullets(true, c.player.x, c.player.y, 260);
    }
}

// ───────────────────────────── 闪电 ─────────────────────────────

/** 机制伤害也走公共伤害入口，护盾、本体遮挡和击杀结算只由战斗核心决定。 */
function targetable(e: Enemy): boolean {
    return !e.dead && !e.wreck && e.entered && e.damageScale > 0 && !(e.coveredBy && !e.coveredBy.dead);
}

class LightningKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0.2, special: 0.4 };
    private shockGauge = 0;
    gaugeLabel = '电击';
    get gauge(): number { return this.shockGauge; }

    update(c: SfCombat, dt: number): void {
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.shockGauge = c.enemies.reduce((max, e) => e.dead ? max : Math.max(max, e.data.shock ?? 0), 0) / 10;
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.16;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0);
        // 预留过载的火力份额；电弧的收益取决于附近是否有其他目标。
        const damage = c.slotDps('main') * interval / baseCount * 1.11
            * (feature(c, 'main', 4) ? 1.15 : 1) * (feature(c, 'main', 10) ? 2 : 1);
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            // 平行射出：电浆长弹之间保持 22 像素间距，远处既不挤成一团也不散开漏打。
            bullet(c, 'main', c.player.x + offset * 22, c.player.y + 58, UP,
                1500, damage, 'lightning-main', 9, { tag: 'lightning-plasma' });
        }
        c.emit({ type: 'shot', kind: 'lightning-main', slot: 'main' });
    }

    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.55;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = (c.fieldParts.wing >= 2 ? 2 : 1) + (feature(c, 'wing', 4) ? 1 : 0);
        const count = baseCount + (c.buffActive ? 1 : 0);
        const damage = c.slotDps('wing') * interval / (baseCount * 2) * 0.85;
        const large = feature(c, 'wing', 7);
        for (const side of [-1, 1]) {
            const m = mount(c, 'wing', side);
            for (let i = 0; i < count; i++) {
                bullet(c, 'wing', m.x, m.y + 20, UP - side * (0.12 + i * 0.1), 680, damage, 'lightning-orb',
                    large ? 21 : 14, { pierce: 1, life: 1.8, scale: large ? 1.4 : 1, spin: 3, tag: 'lightning-orb' });
            }
        }
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = 0.65;
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = c.fieldParts.special;
        const count = baseCount + (c.buffActive ? 1 : 0);
        const damage = c.slotDps('special') * interval / baseCount * 0.8;
        const targets = c.enemies.filter(e => targetable(e) && Math.hypot(e.x - c.player.x, e.y - c.player.y) <= 650).sort((a, b) =>
            Math.hypot(a.x - c.player.x, a.y - c.player.y) - Math.hypot(b.x - c.player.x, b.y - c.player.y));
        for (let i = 0; i < count && targets.length > 0; i++) {
            const e = targets[i % targets.length];
            if (e.dead) continue;
            c.emit({ type: 'weapon-fire', kind: 'tesla', slot: 'special' });
            c.emit({ type: 'chain', x: e.x, y: e.y, size: 24, value: 1, kind: 'tesla' });
            c.damageEnemy(e, damage, 'special', e.x, e.y);
            this.addShock(c, e, damage);
        }
    }

    onBulletHit(c: SfCombat, e: Enemy, b: PlayerBullet): void {
        if (b.tag !== 'lightning-plasma' && b.tag !== 'lightning-orb') return;
        // 命中致死也会放电；只向可受伤的其他目标传递，不递归触发命中回调。
        if (b.tag === 'lightning-plasma') {
            const count = feature(c, 'main', 10) ? 4 : feature(c, 'main', 4) ? 3 : 2;
            const ratio = 0.35 * (feature(c, 'main', 7) ? 1.25 : 1);
            const targets = c.enemies.filter(other => other.id !== e.id && targetable(other)
                && Math.hypot(other.x - e.x, other.y - e.y) <= 180)
                .sort((a, other) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(other.x - e.x, other.y - e.y))
                .slice(0, count);
            for (const other of targets) {
                c.emit({ type: 'chain', x: other.x, y: other.y, size: 24, value: 1, kind: 'arc' });
                c.damageEnemy(other, b.damage * ratio, 'main', other.x, other.y);
                this.addShock(c, other, b.damage * ratio);
            }
        }
        this.addShock(c, e, b.damage);
    }

    private addShock(c: SfCombat, e: Enemy, damage: number): void {
        if (!targetable(e)) return;
        const enhanced = c.fieldParts.special > 0;
        const threshold = enhanced && feature(c, 'special', 4) ? 8 : 10;
        e.data.shock = (e.data.shock ?? 0) + 1;
        if (e.data.shock < threshold) return;
        const queue = [e];
        const overloaded = new Set<number>();
        const radius = 120 * (enhanced && feature(c, 'special', 7) ? 1.3 : 1);
        while (queue.length > 0) {
            const source = queue.shift()!;
            if (source.dead || overloaded.has(source.id)) continue;
            overloaded.add(source.id);
            source.data.shock = 0;
            c.emit({ type: 'explosion', x: source.x, y: source.y, size: radius, kind: 'overload' });
            for (const other of c.enemies) {
                if (!targetable(other) || Math.hypot(other.x - source.x, other.y - source.y) > radius) continue;
                c.damageEnemy(other, damage * 3, 'mechanic', other.x, other.y);
                if (other.id !== source.id && !other.dead && enhanced && feature(c, 'special', 10)) {
                    other.data.shock = (other.data.shock ?? 0) + 2;
                    if (other.data.shock >= threshold && !overloaded.has(other.id)) queue.push(other);
                }
            }
        }
    }

    createUltimate(): Ultimate { return new LightningStorm(); }
}

class LightningStorm extends TimedUltimate {
    private strikes = 0;
    constructor() { super('雷暴领域', 3); }
    protected tick(c: SfCombat): void {
        while (this.strikes < 16 && this.t >= this.strikes * 0.18) {
            const targets = c.enemies.filter(targetable).sort((a, b) => b.hp - a.hp);
            const target = this.strikes % 2 === 0 ? targets[0] : c.rng.pick(targets);
            const x = target?.x ?? c.rng.range(c.bounds.left + 30, c.bounds.right - 30);
            c.emit({ type: 'strike', x, kind: 'lightning' });
            if (target) c.damageEnemy(target, c.totalDps() * 0.35, 'ultimate', target.x, target.y);
            for (const b of c.ebullets) if (!b.dead && Math.abs(b.x - x) < 36) b.dead = true;
            this.strikes++;
        }
    }
}

// ───────────────────────────── 寒冰 ─────────────────────────────

interface FrozenEnemy {
    motion: Motion | null;
    parent: Enemy | undefined;
    def: EnemyDef;
    frozenDef: EnemyDef;
    vx: number;
    vy: number;
}

const FROZEN_MOTION: Motion = { update(e) { e.vx = 0; e.vy = 0; } };

class FrostKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0.2, special: 0.3 };
    private readonly frozen = new Map<Enemy, FrozenEnemy>();
    private readonly slowed = new Set<number>();
    private readonly crystals: number[] = [];
    private bossPause: { boss: BossScript; update: BossScript['update']; paused: BossScript['update'] } | null = null;
    private coldGauge = 0;
    gaugeLabel = '寒冷';
    get gauge(): number { return this.coldGauge; }
    readonly visual = emptyKitVisual();

    update(c: SfCombat, dt: number): void {
        this.updateFrozen(c);
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        this.updateMist(c);
        this.updateCrystals(c);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        const target = c.nearestEnemy(c.player.x, c.player.y + 400, 1600);
        this.coldGauge = Math.min(1, (target?.data.cold ?? 0) / 5);
        // 环绕水晶护盾：位置与 updateCrystals 的判定一致，再生冷却中显示为暗淡。
        resetKitVisual(this.visual);
        const count = this.crystals.length;
        for (let i = 0; i < count; i++) {
            const a = c.time * 1.8 + i * Math.PI * 2 / count;
            this.visual.orbs.push({ x: c.player.x + Math.cos(a) * 64, y: c.player.y + Math.sin(a) * 64, radius: 15, ready: this.crystals[i] <= c.time, color: '#9FE8FF', frame: 'shot/frost-shard' });
        }
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt * (feature(c, 'main', 4) ? 1.1 : 1);
        if (this.timers.main > 0) return;
        const interval = 0.15;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('main') * interval / baseCount * 1.06 * (feature(c, 'main', 10) ? 1.7 : 1);
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', c.player.x + offset * 17, c.player.y + 58, UP + offset * 0.025,
                1500, damage, 'frost-icicle', 8, { tag: 'frost-icicle' });
        }
        c.emit({ type: 'shot', kind: 'frost-main', slot: 'main' });
    }

    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.38;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = c.fieldParts.wing >= 2 ? 2 : 1;
        const count = baseCount + (c.buffActive ? 1 : 0);
        const damage = c.slotDps('wing') * interval / (baseCount * 2) * 0.7;
        for (const side of [-1, 1]) {
            const m = mount(c, 'wing', side);
            for (let i = 0; i < count; i++) {
                bullet(c, 'wing', m.x, m.y + 24, UP - side * (0.1 + i * 0.12), 760, damage,
                    'frost-mist', 12, { pierce: 1, life: 1.9, scale: 1.6, tag: 'frost-mist' });
            }
        }
    }

    private updateMist(c: SfCombat): void {
        const live = new Set<number>();
        const mist = c.pbullets.filter(b => !b.dead && b.tag === 'frost-mist');
        const radius = 54 * (feature(c, 'wing', 4) ? 1.2 : 1);
        const speed = feature(c, 'wing', 7) ? 0.45 : 0.6;
        for (const b of c.ebullets) {
            if (b.dead) continue;
            live.add(b.id);
            if (this.slowed.has(b.id)) continue;
            if (!mist.some(cloud => Math.hypot(cloud.x - b.x, cloud.y - b.y) < radius + b.radius)) continue;
            this.slowed.add(b.id);
            // 加速度和速度上限同步缩放，避免加速弹下一帧立即抵消寒雾。
            b.vx *= speed; b.vy *= speed; b.ax *= speed; b.ay *= speed; b.maxSpeed *= speed;
            if (feature(c, 'wing', 10)) {
                b.dead = true;
                c.emit({ type: 'explosion', x: b.x, y: b.y, size: 0, kind: 'cancel' });
            }
        }
        for (const id of Array.from(this.slowed)) if (!live.has(id)) this.slowed.delete(id);
    }

    private updateCrystals(c: SfCombat): void {
        const count = c.fieldParts.special > 0 ? c.fieldParts.special + 1 + (feature(c, 'special', 4) ? 1 : 0) : 0;
        this.crystals.length = Math.min(this.crystals.length, count);
        while (this.crystals.length < count) this.crystals.push(0);
        for (let i = 0; i < this.crystals.length; i++) {
            if (this.crystals[i] > c.time) continue;
            const a = c.time * 1.8 + i * Math.PI * 2 / count;
            const x = c.player.x + Math.cos(a) * 64, y = c.player.y + Math.sin(a) * 64;
            const hit = c.ebullets.find(b => !b.dead && Math.hypot(b.x - x, b.y - y) <= 15 + b.radius);
            if (!hit) continue;
            hit.dead = true;
            this.crystals[i] = c.time + (feature(c, 'special', 7) ? 4 : 6);
            c.emit({ type: 'shield-hit', x, y, kind: 'ice' });
            if (feature(c, 'special', 10)) {
                for (let j = 0; j < 3; j++) bullet(c, 'special', x, y, UP + (j - 1) * 0.35, 1250,
                    c.slotDps('special') * 0.08, 'frost-shard', 8, { tag: 'frost-shard' });
            }
        }
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = 0.3;
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = this.crystals.length;
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('special') * interval / baseCount * 0.72;
        for (let i = 0; i < count; i++) {
            if (this.crystals[i % baseCount] > c.time) continue;
            const a = c.time * 1.8 + (i % baseCount) * Math.PI * 2 / baseCount;
            const x = c.player.x + Math.cos(a) * 64, y = c.player.y + Math.sin(a) * 64;
            bullet(c, 'special', x, y, UP, 1350, damage, 'frost-shard', 8,
                { tag: 'frost-crystal' });
        }
    }

    onBulletHit(c: SfCombat, e: Enemy, b: PlayerBullet): void {
        if (!b.tag?.startsWith('frost-') || !targetable(e)) return;
        // 核心已经扣过基础伤害，此处只结算冻结增伤，保持原伤害入口的护盾规则。
        if ((e.data.frozenUntil ?? 0) > c.time) {
            const bonus = 0.5 + (feature(c, 'main', 7) ? 0.2 : 0);
            c.damageEnemy(e, b.damage * bonus, b.slot, b.x, b.y);
            return;
        }
        e.data.cold = Math.min(5, (e.data.cold ?? 0) + 1);
        if (e.data.cold >= 5) this.freeze(c, e, 1.5 + (feature(c, 'main', 4) ? 0.5 : 0));
    }

    freeze(c: SfCombat, e: Enemy, duration: number): void {
        if (e.dead || e.wreck || !e.entered) return;
        const until = Math.max(e.data.frozenUntil ?? 0, c.time + duration);
        if (!this.frozen.has(e)) {
            // 专属行为保留伤害、死亡回调，仅暂停每帧移动与开火；不改共享的 EnemyDef。
            const frozenDef: EnemyDef = e.def.behavior ? {
                ...e.def, behavior: { ...e.def.behavior, update: () => { } },
            } : e.def;
            this.frozen.set(e, { motion: e.motion, parent: e.parent, def: e.def, frozenDef, vx: e.vx, vy: e.vy });
            e.def = frozenDef;
            // 通用循环优先按 parent 更新坐标；冻结期间暂时解除跟随，解冻再归位。
            e.parent = undefined;
            e.motion = FROZEN_MOTION;
            e.vx = 0; e.vy = 0;
            c.emit({ type: 'shield-hit', x: e.x, y: e.y, kind: 'freeze' });
        }
        e.data.frozenUntil = until;
        e.data.cold = 5;
        this.delayFire(c, e);
        // Boss 生成器在 motion 之外驱动；零步长暂停动作计时，仍保留血量阶段判断。
        if (c.boss && (e.boss || c.boss.parts.indexOf(e) >= 0) && !this.bossPause) {
            const boss = c.boss;
            const update = boss.update;
            const paused: BossScript['update'] = (combat, dt) => {
                const members = boss.bodies.concat(boss.parts);
                const frozen = members.filter(body => !body.dead && (body.data.frozenUntil ?? 0) > combat.time);
                if (frozen.length === 0) {
                    update.call(boss, combat, dt);
                    return;
                }
                const positions = frozen.map(body => ({ body, x: body.x, y: body.y }));
                const bulletCount = combat.ebullets.length;
                update.call(boss, combat, 0);
                // 等待为零的生成器可先执行一次；屏蔽这次开火，并固定冻结对象的位置。
                for (let i = bulletCount; i < combat.ebullets.length; i++) combat.ebullets[i].dead = true;
                for (const pos of positions) {
                    pos.body.x = pos.x; pos.body.y = pos.y;
                    pos.body.vx = 0; pos.body.vy = 0;
                }
            };
            this.bossPause = { boss, update, paused };
            boss.update = paused;
        }
    }

    private delayFire(c: SfCombat, e: Enemy): void {
        const remaining = Math.max(0, e.data.frozenUntil - c.time) + 0.05;
        for (const f of e.fires) {
            f.timer = Math.max(f.timer, remaining * c.fireRateScale);
            f.burstTimer = Math.max(f.burstTimer, remaining);
        }
    }

    private updateFrozen(c: SfCombat): void {
        for (const [e, saved] of Array.from(this.frozen.entries())) {
            if (!e.dead && saved.parent?.dead) c.killEnemy(e, 'mechanic', false);
            if (!e.dead && c.enemies.indexOf(e) >= 0 && e.data.frozenUntil > c.time) {
                this.delayFire(c, e);
                continue;
            }
            if (e.motion === FROZEN_MOTION) e.motion = saved.motion;
            if (!e.parent) e.parent = saved.parent;
            if (e.def === saved.frozenDef) e.def = saved.def;
            e.vx = saved.vx; e.vy = saved.vy;
            e.data.cold = 0;
            e.data.frozenUntil = 0;
            this.frozen.delete(e);
        }
        const pause = this.bossPause;
        if (pause && (c.boss !== pause.boss || !pause.boss.bodies.concat(pause.boss.parts).some(e => !e.dead && e.data.frozenUntil > c.time))) {
            if (pause.boss.update === pause.paused) pause.boss.update = pause.update;
            this.bossPause = null;
        }
    }

    onEnemyKilled(c: SfCombat, e: Enemy, slot: string): void {
        if (slot === 'ultimate' || !feature(c, 'main', 10) || !(e.data.frozenUntil > c.time)) return;
        c.splash(e.x, e.y, 90, c.slotDps('main') * 0.12, 'mechanic', e.id);
    }

    createUltimate(): Ultimate { return new AbsoluteZero(this); }
}

class AbsoluteZero extends TimedUltimate {
    private fired = false;
    constructor(private readonly kit: FrostKit) { super('绝对零度', 3); }
    protected tick(c: SfCombat): void {
        if (this.fired) return;
        this.fired = true;
        for (const e of c.enemies) this.kit.freeze(c, e, 3);
        const targets = c.enemies.filter(targetable);
        const incoming = c.ebullets.filter(b => !b.dead);
        // 固定总伤害池，弹幕越密只增加冰片数量；无敌弹时也有一轮冰棱。
        const count = Math.max(12, incoming.length);
        const damage = c.totalDps() * 4 / count;
        for (let i = 0; i < count; i++) {
            const source = incoming[i];
            const x = source?.x ?? c.player.x + (i - (count - 1) / 2) * 17;
            const y = source?.y ?? c.player.y + 60;
            if (source) {
                source.dead = true;
                c.emit({ type: 'explosion', x, y, size: 0, kind: 'cancel' });
            }
            const target = targets.length > 0 ? targets[i % targets.length] : undefined;
            const a = target ? Math.atan2(target.y - y, target.x - x) : UP;
            const ice = bullet(c, 'ultimate', x, y, a, 1350, damage, 'frost-icicle', 9,
                { target: target?.id, turn: 6, life: 2.9, tag: 'frost-zero' });
            // 公共发射接口达到弹体上限时只返回对象；替换最老弹体，确保转换完整且不突破上限。
            if (c.pbullets.indexOf(ice) < 0) {
                const oldest = c.pbullets.shift();
                if (oldest) oldest.dead = true;
                c.pbullets.push(ice);
            }
        }
    }
}

// ───────────────────────────── 幻影 ─────────────────────────────

class PhantomKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 0.2 };
    private mirrorTimer = 0;
    private spread = 0;
    gaugeLabel = '集火↔覆盖';
    get gauge(): number { return this.spread; }
    readonly visual = emptyKitVisual();

    update(c: SfCombat, dt: number): void {
        this.spread = Math.min(1, Math.abs(c.player.x) / Math.max(1, c.flight.right));
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.updateVisual(c);
    }

    /** 镜像分身在 x 轴对称位置；与本体靠得太近时淡出，避免叠影。翼炮光束连接本体与分身；万花镜期间显示 4 个环绕分身。 */
    private updateVisual(c: SfCombat): void {
        const v = this.visual, p = c.player;
        resetKitVisual(v);
        v.clones.push({ x: -p.x, y: p.y, alpha: Math.min(1, Math.abs(p.x) / 60), tint: '#E2C6FF' });
        if (c.fieldParts.wing > 0 && Math.abs(p.x) > 20) {
            v.links.push({ ax: p.x, ay: p.y, bx: -p.x, by: p.y, width: feature(c, 'wing', 4) ? 6 : 4, color: '#8FF4FF' });
        }
        if (c.ultimate instanceof Kaleidoscope) {
            for (const pos of c.ultimate.positions) v.clones.push({ x: pos.x, y: pos.y, alpha: 0.9, tint: '#E2C6FF' });
        }
    }

    private fireMain(c: SfCombat, dt: number): void {
        const interval = 0.14;
        this.timers.main -= dt * 1.5;
        this.mirrorTimer -= dt * 1.5 * (feature(c, 'main', 7) ? 1.2 : 1);
        if (this.timers.main <= 0) {
            this.timers.main += interval * (c.buffActive ? 0.75 : 1);
            this.mainVolley(c, c.player.x, false, interval);
            c.emit({ type: 'shot', kind: 'phantom-main', slot: 'main' });
        }
        if (this.mirrorTimer <= 0) {
            this.mirrorTimer += interval * (c.buffActive ? 0.75 : 1);
            this.mainVolley(c, -c.player.x, true, interval);
        }
    }

    private mainVolley(c: SfCombat, x: number, mirror: boolean, interval: number): void {
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('main') * interval / baseCount * 0.5 * (feature(c, 'main', 10) ? 1.9 : 1)
            * (mirror && feature(c, 'main', 4) ? 1.2 : 1);
        // 分身与本体对同一个前方目标会聚，拉开时仍保留两条独立飞行路径。
        const target = c.nearestEnemy(c.player.x, c.player.y + 450, 1500, e => e.y > c.player.y + 40);
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', x + offset * 16, c.player.y + 58, UP + offset * 0.025, 1500, damage,
                'phantom-star', 9, { target: target?.id, turn: 1.2, pierce: mirror && feature(c, 'main', 10) ? 1 : 0 });
        }
    }

    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.1;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const p = c.player;
        const width = feature(c, 'wing', 4) ? 25 : 16;
        const damage = c.slotDps('wing') * interval * (feature(c, 'wing', 7) ? 1.3 : 1);
        for (const e of c.enemies) {
            if (targetable(e) && segmentDistance(e.x, e.y, p.x, p.y, -p.x, p.y) < e.radius + width) {
                c.damageEnemy(e, damage * 0.3, 'wing', e.x, e.y);
            }
        }
        if (feature(c, 'wing', 10)) {
            for (const b of c.ebullets) {
                if (!b.dead && segmentDistance(b.x, b.y, p.x, p.y, -p.x, p.y) <= b.radius + width) {
                    b.dead = true;
                    c.emit({ type: 'shield-hit', x: b.x, y: b.y, kind: 'mirror' });
                }
            }
        }
        // 光束端点持续前射，让防御连线挂点也贡献远距离火力。
        const baseCount = 2;
        const count = baseCount + (c.buffActive ? 2 : 0);
        const target = c.nearestEnemy(p.x, p.y + 400, 1400, e => e.y > p.y + 40);
        for (let i = 0; i < count; i++) {
            const x = i % 2 === 0 ? p.x : -p.x;
            bullet(c, 'wing', x, p.y + 35, UP, 1450, damage / baseCount, 'phantom-bolt', 8,
                { target: target?.id, turn: 1.2 });
        }
    }

    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt * (feature(c, 'special', 10) ? 1.3 : 1);
        if (this.timers.special > 0) return;
        const interval = 0.28;
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = c.fieldParts.special + 1 + (feature(c, 'special', 4) ? 1 : 0);
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('special') * interval / baseCount;
        for (let i = 0; i < count; i++) {
            const a = c.time * 1.5 + (i % baseCount) * Math.PI * 2 / baseCount;
            const x = -c.player.x + Math.cos(a) * 54, y = c.player.y + Math.sin(a) * 54;
            const target = feature(c, 'special', 7) ? c.nearestEnemy(x, y + 400, 1400) : undefined;
            bullet(c, 'special', x, y, UP, 1400, damage, 'phantom-star', 8,
                { target: target?.id, turn: target ? 4 : 0, scale: 0.7 });
        }
    }

    createUltimate(): Ultimate { return new Kaleidoscope(); }
}

class Kaleidoscope extends TimedUltimate {
    private timer = 0;
    /** 4 个环绕分身的当前位置（视图读取）。 */
    readonly positions: { x: number; y: number }[] = [];
    constructor() { super('万花镜', 4); }
    protected tick(c: SfCombat, dt: number): void {
        this.positions.length = 0;
        for (let i = 0; i < 4; i++) {
            const a = this.t * 1.2 + i * Math.PI / 2;
            this.positions.push(c.clampTarget(c.player.x + Math.cos(a) * 110, c.player.y + Math.sin(a) * 110));
        }
        this.timer -= dt;
        if (this.timer > 0) return;
        const interval = 0.16;
        this.timer += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = 2;
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.totalDps() * 1.5 * interval / (baseCount * 4);
        const targets = c.enemies.filter(targetable);
        for (let i = 0; i < 4; i++) {
            const pos = this.positions[i];
            const target = targets.length ? targets[i % targets.length] : undefined;
            for (let j = 0; j < count; j++) {
                bullet(c, 'ultimate', pos.x + (j - (count - 1) / 2) * 16, pos.y + 48, UP, 1500,
                    damage, 'phantom-star', 10, { target: target?.id, turn: 5, life: 2.5 });
            }
            c.cancelBullets(true, pos.x, pos.y, 34);
        }
    }
}

// ───────────────────────────── 曙光 ─────────────────────────────

/** 激光照射判定：命中点在光束线段上的投影（光束以 0.1 秒为一跳结算伤害）。 */
const LASER_TICK = 0.1;
const DAWN_GOLD = '#FFC83A';

/**
 * 曙光（激光型）：主炮是一道持续向前的激光，贯穿整列敌人；
 * 贯穿聚焦——光束上每多穿过一个敌人，后方目标伤害 +15%（Lv4 +25%），鼓励对准纵队。
 * 翼炮是两道斜向细激光，随左右移动摆动扫射；特装是环绕机体的日轮，对附近敌人放短激光。
 */
class DawnKit implements PlaneKit {
    private tick = 0;
    private sway = 0;
    private wingTick = 0.05;
    private orbTimers = [0.2, 0.4, 0.6, 0.8];
    private orbAngle = 0;
    private bolts: { ax: number; ay: number; bx: number; by: number; life: number }[] = [];
    private pierced = 0;
    private shotTimer = 0;
    gaugeLabel = '贯穿';
    get gauge(): number { return Math.min(1, this.pierced / 5); }
    readonly visual = emptyKitVisual();

    update(c: SfCombat, dt: number): void {
        const p = c.player;
        // 翼光束摆角跟随水平速度（低通），停下后缓慢回正。
        const swing = feature(c, 'wing', 4) ? 0.5 : 0.34;
        const want = Math.max(-1, Math.min(1, -p.vx / 520)) * swing;
        this.sway += (want - this.sway) * Math.min(1, dt * 6);
        this.orbAngle += dt * 2.4;
        if (p.alive) {
            this.tick -= dt;
            if (this.tick <= 0) {
                this.tick += LASER_TICK;
                this.fireMain(c);
                if (c.fieldParts.wing > 0) this.fireWing(c);
            }
            if (c.fieldParts.special > 0) this.fireOrbs(c, dt);
            this.shotTimer -= dt;
            if (this.shotTimer <= 0) { this.shotTimer = 0.16; c.emit({ type: 'shot', kind: 'dawn-main', slot: 'main' }); }
        }
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            this.bolts[i].life -= dt;
            if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
        }
        this.updateVisual(c);
    }

    /** 主光束宽度：零件 0～3 级逐级加宽，Lv7 再 +30%；火力强化时 +50%。 */
    private mainWidth(c: SfCombat): number {
        return [16, 22, 28, 34][c.fieldParts.main] * (feature(c, 'main', 7) ? 1.3 : 1) * (c.buffActive ? 1.5 : 1);
    }

    /** 光束被拖网截断：返回 x 处主光束能照到的最高 y。 */
    private beamTop(c: SfCombat, x: number, y0: number): number {
        let top = c.bounds.top + 80;
        for (const h of c.hazards) {
            if (h.kind !== 'net' || (h.warn ?? 0) > 0) continue;
            const lo = Math.min(h.ax, h.bx), hi = Math.max(h.ax, h.bx);
            if (x < lo || x > hi || hi - lo < 1) continue;
            const y = h.ay + (h.by - h.ay) * (x - h.ax) / (h.bx - h.ax);
            if (y > y0 && y < top) top = y;
        }
        return top;
    }

    private fireMain(c: SfCombat): void {
        const p = c.player;
        const x = p.x, y0 = p.y + 60;
        const half = this.mainWidth(c) / 2;
        const top = this.beamTop(c, x, y0);
        const bonus = feature(c, 'main', 4) ? 0.25 : 0.15;
        // 激光必须正对目标（不追踪），基础系数 1.25 补偿瞄准要求。
        const damage = c.slotDps('main') * LASER_TICK * 1.25 * (feature(c, 'main', 7) ? 1.15 : 1) * (feature(c, 'main', 10) ? 1.6 : 1);
        const hits = c.enemies.filter(e => targetable(e) && e.y > y0 - e.radius && e.y < top + e.radius && Math.abs(e.x - x) <= half + e.radius * 0.7);
        hits.sort((a, b) => a.y - b.y);
        hits.forEach((e, i) => c.damageEnemy(e, damage * (1 + bonus * i), 'main', x, e.y - e.radius * 0.6));
        this.pierced += (hits.length - this.pierced) * 0.35;
        if (feature(c, 'main', 10)) {
            for (const b of c.ebullets) {
                if (!b.dead && b.y > y0 && b.y < top && Math.abs(b.x - x) <= half + b.radius) {
                    b.dead = true;
                    c.emit({ type: 'explosion', x: b.x, y: b.y, size: 0, kind: 'cancel' });
                }
            }
        }
    }

    /** 两道斜向细激光的终点（从翼挂点出发，射到战场顶部之外）。 */
    private wingBeams(c: SfCombat): { ax: number; ay: number; bx: number; by: number }[] {
        const out: { ax: number; ay: number; bx: number; by: number }[] = [];
        const spread = [0, 0.1, 0.13, 0.16][c.fieldParts.wing];
        for (const side of [-1, 1]) {
            const m = mount(c, 'wing', side);
            const a = UP - side * spread + this.sway;
            const len = c.bounds.top - m.y + 200;
            out.push({ ax: m.x, ay: m.y + 20, bx: m.x + Math.cos(a) * len / Math.max(0.3, Math.sin(a)), by: m.y + 20 + len });
        }
        return out;
    }

    private fireWing(c: SfCombat): void {
        c.emit({ type: 'weapon-fire', kind: 'dawn-wing', slot: 'wing' });
        const width = [0, 6, 8, 10][c.fieldParts.wing] * (c.buffActive ? 1.5 : 1);
        const damage = c.slotDps('wing') * LASER_TICK / 2 * (feature(c, 'wing', 7) ? 1.3 : 1);
        const bonus = feature(c, 'wing', 10) ? (feature(c, 'main', 4) ? 0.25 : 0.15) : 0;
        for (const beam of this.wingBeams(c)) {
            const hits = c.enemies.filter(e => targetable(e) && segmentDistance(e.x, e.y, beam.ax, beam.ay, beam.bx, beam.by) < e.radius * 0.8 + width);
            hits.sort((a, b) => a.y - b.y);
            hits.forEach((e, i) => c.damageEnemy(e, damage * (1 + bonus * i), 'wing', e.x, e.y - e.radius * 0.5));
        }
    }

    /** 日轮位置：零件级数 1～3 个（Lv4 +1），绕机体旋转。 */
    private orbs(c: SfCombat): { x: number; y: number }[] {
        const n = c.fieldParts.special + (feature(c, 'special', 4) ? 1 : 0);
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
            const a = this.orbAngle + i * Math.PI * 2 / n;
            out.push({ x: c.player.x + Math.cos(a) * 78, y: c.player.y + 10 + Math.sin(a) * 52 });
        }
        return out;
    }

    private fireOrbs(c: SfCombat, dt: number): void {
        const orbs = this.orbs(c);
        const interval = 0.6 * (feature(c, 'special', 7) ? 0.75 : 1) * (c.buffActive ? 0.75 : 1);
        const baseCount = c.fieldParts.special + (feature(c, 'special', 4) ? 1 : 0);
        const damage = c.slotDps('special') * 0.6 / Math.max(1, baseCount - (feature(c, 'special', 4) ? 1 : 0));
        orbs.forEach((o, i) => {
            this.orbTimers[i] -= dt;
            if (this.orbTimers[i] > 0) return;
            this.orbTimers[i] += interval;
            const t = c.nearestEnemy(o.x, o.y + 200, 460);
            if (!t) return;
            c.emit({ type: 'weapon-fire', kind: 'dawn-orb', slot: 'special' });
            c.damageEnemy(t, damage, 'special', t.x, t.y);
            this.bolts.push({ ax: o.x, ay: o.y, bx: t.x, by: t.y, life: 0.12 });
            if (feature(c, 'special', 10)) {
                const next = c.nearestEnemy(t.x, t.y, 260, e => e !== t);
                if (next) {
                    c.damageEnemy(next, damage * 0.6, 'special', next.x, next.y);
                    this.bolts.push({ ax: t.x, ay: t.y, bx: next.x, by: next.y, life: 0.12 });
                }
            }
        });
    }

    /** 主光束、翼光束、日轮与日轮短激光；超新星期间主光束换成必杀光柱。 */
    private updateVisual(c: SfCombat): void {
        const v = this.visual, p = c.player;
        resetKitVisual(v);
        if (!p.alive) return;
        if (c.ultimate instanceof Supernova) {
            const u = c.ultimate;
            v.beams.push({ ax: p.x, ay: p.y + 60, bx: p.x, by: c.bounds.top + 80, width: 120, alpha: Math.min(1, u.elapsed / 0.15, (u.duration - u.elapsed) / 0.3), color: DAWN_GOLD });
        } else {
            v.beams.push({ ax: p.x, ay: p.y + 60, bx: p.x, by: this.beamTop(c, p.x, p.y + 60), width: this.mainWidth(c), alpha: 1, color: DAWN_GOLD });
        }
        if (c.fieldParts.wing > 0) {
            const width = [0, 6, 8, 10][c.fieldParts.wing] * (c.buffActive ? 1.5 : 1);
            for (const b of this.wingBeams(c)) v.beams.push({ ...b, width, alpha: 0.9, color: '#FFB347' });
        }
        v.charge = { x: p.x, y: p.y + 60, value: 0.55 + Math.min(0.45, this.pierced * 0.1), color: DAWN_GOLD };
        for (const o of this.orbs(c)) {
            v.orbs.push({ x: o.x, y: o.y, radius: 11, ready: true, color: DAWN_GOLD, frame: 'shot/dawn-sun' });
        }
        for (const b of this.bolts) v.beams.push({ ax: b.ax, ay: b.ay, bx: b.bx, by: b.by, width: 5, alpha: b.life / 0.12, color: '#FFE27A' });
    }

    createUltimate(): Ultimate { return new Supernova(); }
}

class Supernova extends TimedUltimate {
    private timer = 0;
    constructor() { super('超新星炮', 3); }
    protected tick(c: SfCombat, dt: number): void {
        this.timer -= dt;
        if (this.timer > 0) return;
        const interval = 0.1;
        this.timer += interval;
        const x = c.player.x;
        for (const e of c.enemies) {
            if (targetable(e) && Math.abs(e.x - x) <= 60 + e.radius * 0.6) {
                c.damageEnemy(e, c.totalDps() * 2.2 * interval, 'ultimate', x, e.y);
            }
        }
        for (const b of c.ebullets) if (!b.dead && Math.abs(b.x - x) <= 60 + b.radius) {
            b.dead = true;
            c.emit({ type: 'explosion', x: b.x, y: b.y, size: 0, kind: 'cancel' });
        }
    }
}

// ───────────────────────────── 雁阵 ─────────────────────────────

type GooseForm = 'line' | 'arrow' | 'guard';

/** 三种队形的僚机槽位（相对长机，按僚机序号取前 n 个）。 */
const GOOSE_SLOTS: Record<GooseForm, [number, number][]> = {
    // 横排：左右移动时展开成一字，覆盖宽度。
    line: [[-82, -4], [82, -4], [-164, -12], [164, -12]],
    // 箭头：向上推进时收在身后两侧，火力会聚到正前方。
    arrow: [[-54, -44], [54, -44], [-104, -88], [104, -88]],
    // 护卫：向下后撤时挡到长机前上方，替长机吃子弹。
    guard: [[-44, 76], [44, 76], [-96, 52], [96, 52]],
};
const GOOSE_TINT = '#E8FFE0';

interface Wingman { x: number; y: number; down: number; blocks: number }

class WildGooseKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0.1, special: 0.8 };
    private form: GooseForm = 'arrow';
    private vx = 0;
    private vy = 0;
    private lastX = NaN;
    private lastY = NaN;
    private readonly men: Wingman[] = [];
    readonly visual = emptyKitVisual();

    /** 僚机数量：裸机 2 架，特装 2 级 3 架、3 级 4 架。 */
    private count(c: SfCombat): number { return [2, 2, 3, 4][c.fieldParts.special]; }

    update(c: SfCombat, dt: number): void {
        const p = c.player;
        if (Number.isNaN(this.lastX)) { this.lastX = p.x; this.lastY = p.y; }
        // 队形取决于近 0.2 秒的平均移动方向；停下时保持最后的队形。
        const k = Math.min(1, dt * 6);
        this.vx += ((p.x - this.lastX) / Math.max(dt, 1e-4) - this.vx) * k;
        this.vy += ((p.y - this.lastY) / Math.max(dt, 1e-4) - this.vy) * k;
        this.lastX = p.x; this.lastY = p.y;
        if (Math.hypot(this.vx, this.vy) > 160) {
            this.form = Math.abs(this.vx) > Math.abs(this.vy) * 1.2 ? 'line' : this.vy > 0 ? 'arrow' : 'guard';
        }
        const n = this.count(c);
        while (this.men.length < n) this.men.push({ x: p.x, y: p.y, down: 0, blocks: this.maxBlocks(c) });
        this.men.length = n;
        const follow = Math.min(1, dt * 9);
        GOOSE_SLOTS[this.form].slice(0, n).forEach(([ox, oy], i) => {
            const m = this.men[i];
            const t = c.clampTarget(p.x + ox, p.y + oy);
            m.x += (t.x - m.x) * follow;
            m.y += (t.y - m.y) * follow;
            if (m.down > 0) {
                m.down -= dt;
                if (m.down <= 0) m.blocks = this.maxBlocks(c);
            }
        });
        this.block(c);
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.updateVisual(c);
    }

    private maxBlocks(c: SfCombat): number { return feature(c, 'special', 10) ? 2 : 1; }

    /** 僚机挡弹：碰到敌弹即抵消，挡满次数后脱队 6 秒（特装 4 级 4 秒）再归队。 */
    private block(c: SfCombat): void {
        for (const m of this.men) {
            if (m.down > 0) continue;
            for (const b of c.ebullets) {
                if (b.dead || b.delay > 0) continue;
                const r = b.radius * 0.6 + 15;
                if ((b.x - m.x) * (b.x - m.x) + (b.y - m.y) * (b.y - m.y) > r * r) continue;
                b.dead = true;
                c.emit({ type: 'shield-hit', x: b.x, y: b.y, kind: 'wingman' });
                if (feature(c, 'special', 7)) {
                    const target = c.nearestEnemy(m.x, m.y + 300, 1200);
                    for (let i = 0; i < 3; i++) {
                        bullet(c, 'special', m.x, m.y + 10, UP + (i - 1) * 0.3, 1100, c.slotDps('special') * 0.25, 'goose-wing', 7,
                            { target: target?.id, turn: 5 });
                    }
                }
                if (--m.blocks <= 0) {
                    m.down = feature(c, 'special', 4) ? 4 : 6;
                    c.emit({ type: 'explosion', x: m.x, y: m.y, size: 20, kind: 'splash' });
                    break;
                }
            }
        }
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt * (feature(c, 'main', 4) ? 1.15 : 1);
        if (this.timers.main > 0) return;
        const interval = 0.13;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0) + (feature(c, 'main', 10) ? 2 : 0);
        const damage = c.slotDps('main') * interval / baseCount;
        const pierce = feature(c, 'main', 7) ? 1 : 0;
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', c.player.x + offset * 16, c.player.y + 54, UP, 1500, damage, 'goose-main', 9, { pierce });
        }
        c.emit({ type: 'shot', kind: 'goose-main', slot: 'main' });
    }

    /** 僚机机枪：横排 / 护卫直射，箭头队形会聚到长机正前方 420 像素处。 */
    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.2;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const alive = this.men.filter(m => m.down <= 0);
        const damage = c.slotDps('wing') * interval / Math.max(2, this.men.length) * (feature(c, 'wing', 4) ? 1.2 : 1);
        const p = c.player;
        for (const m of alive) {
            const angle = this.form === 'arrow' ? Math.atan2(p.y + 420 - m.y, p.x - m.x) : UP;
            const target = feature(c, 'wing', 7) ? c.nearestEnemy(m.x, m.y + 400, 1200, e => e.y > m.y) : undefined;
            bullet(c, 'wing', m.x, m.y + 24, angle, 1400, damage, 'goose-wing', 7, {
                target: target?.id, turn: target ? 2.5 : 0, pierce: feature(c, 'wing', 10) ? 1 : 0,
                scale: feature(c, 'wing', 10) ? 1.25 : 1,
            });
        }
    }

    /** 编队导弹：每架在队的僚机各射一枚追踪导弹；箭头队形集火同一个目标并 +30% 伤害。 */
    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = [0, 1.6, 1.4, 1.2][c.fieldParts.special];
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const alive = this.men.filter(m => m.down <= 0);
        if (!alive.length) return;
        const focus = this.form === 'arrow';
        const damage = c.slotDps('special') * interval / this.men.length * (focus ? 1.3 : 1);
        const targets = c.enemies.filter(e => targetable(e) && e.y > c.player.y);
        alive.forEach((m, i) => {
            const target = focus ? c.nearestEnemy(c.player.x, c.player.y + 450, 1400) : targets[i % Math.max(1, targets.length)];
            bullet(c, 'special', m.x, m.y + 16, UP, 900, damage, 'micro', 8, { target: target?.id, turn: 4.5, life: 2.6 });
        });
        c.emit({ type: 'missile', x: c.player.x, y: c.player.y });
    }

    /** 僚机是缩小的长机：在队全亮，脱队时半透明闪烁；必杀期间全部化作光镖飞出。 */
    private updateVisual(c: SfCombat): void {
        const v = this.visual;
        resetKitVisual(v);
        if (c.ultimate instanceof GooseCharge) return;
        const blink = Math.floor(c.time * 8) % 2 === 0;
        for (const m of this.men) {
            const down = m.down > 0;
            v.actors.push({ frame: 'plane/wildgoose/body', x: m.x, y: m.y, angle: -c.player.bank * 0.25, scale: 0.42,
                alpha: down ? (blink ? 0.3 : 0.12) : 1, tint: down ? '#9AB8A0' : GOOSE_TINT });
        }
    }

    get formation(): GooseForm { return this.form; }

    createUltimate(): Ultimate { return new GooseCharge(this.men.length); }
}

/** 全队冲锋：僚机与 6 架幻影僚机化作光镖，4 秒内不断冲向敌人，沿途清除身边敌弹。 */
class GooseCharge extends TimedUltimate {
    private timer = 0;
    constructor(private readonly wingmen: number) { super('全队冲锋', 4); }
    protected tick(c: SfCombat, dt: number): void {
        this.timer -= dt;
        c.cancelBullets(true, c.player.x, c.player.y + 60, 150);
        if (this.timer > 0) return;
        const interval = 0.2;
        this.timer += interval;
        const darts = this.wingmen + 6;
        const damage = c.totalDps() * 1.6 * interval / darts;
        const targets = c.enemies.filter(targetable);
        for (let i = 0; i < darts; i++) {
            const side = i % 2 ? 1 : -1;
            const x = c.player.x + side * (40 + (i >> 1) * 36), y = c.player.y - 10 - (i >> 1) * 14;
            const target = targets.length ? targets[(i + Math.floor(this.t * 5)) % targets.length] : undefined;
            bullet(c, 'ultimate', x, y, UP + side * 0.35, 1300, damage, 'goose-dart', 12,
                { target: target?.id, turn: 7, pierce: 2, life: 2.4 });
        }
    }
}

// ───────────────────────────── 黑洞 ─────────────────────────────

interface Hole { x: number; y: number; r: number; t: number; life: number; big: boolean; ult: boolean }

/** 被黑洞吸住的敌人：脱离原路线，绕着黑洞中心盘旋收拢。 */
class CapturedMotion implements Motion {
    constructor(readonly hole: Hole) { }
    update(e: Enemy, dt: number): void {
        const h = this.hole;
        const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
        const pull = Math.min(260, d * 3.2);
        // 向心 + 切向：被卷成一团而不是直线吸到同一点。
        e.vx = dx / d * pull - dy / d * 90;
        e.vy = dy / d * pull + dx / d * 90;
        e.x += e.vx * dt; e.y += e.vy * dt;
    }
}

function capturable(e: Enemy): boolean {
    return !e.dead && e.entered && !e.boss && !e.parent && !e.def.ground
        && (e.def.size === 'small' || e.def.size === 'medium') && !e.persistent;
}

class BlackHoleKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 1.2 };
    private holeCd = 0;
    private rayHoleCd = 0;
    private readonly holes: Hole[] = [];
    private readonly boosted = new WeakSet<PlayerBullet>();
    private readonly singularities: PlayerBullet[] = [];
    readonly visual = emptyKitVisual();

    update(c: SfCombat, dt: number): void {
        this.holeCd -= dt;
        this.rayHoleCd -= dt;
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.updateSingularities(c);
        this.updateHoles(c, dt);
        this.updateVisual(c);
    }

    private holeRadius(c: SfCombat): number { return 100 * (feature(c, 'main', 7) ? 1.25 : 1); }

    private addHole(x: number, y: number, r: number, life: number, big = false, ult = false): void {
        // 小黑洞同时最多 3 个，超出时替换最旧的一个。
        if (!big && !ult) {
            const small = this.holes.filter(h => !h.big && !h.ult);
            if (small.length >= 3) small[0].t = small[0].life;
        }
        this.holes.push({ x, y, r, t: 0, life, big, ult });
    }

    onBulletHit(c: SfCombat, _e: Enemy, b: PlayerBullet): void {
        if (b.tag !== 'gravity' || this.holeCd > 0) return;
        this.holeCd = 0.45;
        this.addHole(b.x, b.y, this.holeRadius(c), 1.5 + (feature(c, 'main', 4) ? 0.5 : 0));
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.16;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const damage = c.slotDps('main') * interval / baseCount * 0.92;
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', c.player.x + offset * 20, c.player.y + 56, UP, 1250, damage, 'blackhole-main', 11, { tag: 'gravity' });
        }
        c.emit({ type: 'shot', kind: 'blackhole-main', slot: 'main' });
    }

    /** 两道引力射线从翼尖斜向会聚到正前方：伤害射线上的敌人并把它们拉向中线。 */
    private rays(c: SfCombat): { ax: number; ay: number; bx: number; by: number }[] {
        const p = c.player;
        // 会聚点在玩家正前方 760 像素（4 级 900），能扫到悬停在上方的 Boss。
        const reach = feature(c, 'wing', 4) ? 900 : 760;
        return [-1, 1].map(side => {
            const m = mount(c, 'wing', side);
            return { ax: m.x, ay: m.y + 10, bx: p.x, by: p.y + reach };
        });
    }

    private fireWing(c: SfCombat, dt: number): void {
        const rays = this.rays(c);
        const p = c.player;
        for (const e of c.enemies) {
            if (!capturable(e) || e.motion instanceof CapturedMotion) continue;
            if (rays.some(r => segmentDistance(e.x, e.y, r.ax, r.ay, r.bx, r.by) < e.radius + 18)) {
                e.x += Math.max(-200 * dt, Math.min(200 * dt, p.x - e.x));
            }
        }
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.1;
        this.timers.wing += interval;
        c.emit({ type: 'weapon-fire', kind: 'gravity-ray', slot: 'wing' });
        const damage = c.slotDps('wing') * interval * (feature(c, 'wing', 7) ? 1.25 : 1);
        for (const e of c.enemies) {
            if (!targetable(e)) continue;
            const r = rays.find(ray => segmentDistance(e.x, e.y, ray.ax, ray.ay, ray.bx, ray.by) < e.radius + 18);
            if (!r) continue;
            c.damageEnemy(e, damage, 'wing', e.x, e.y);
            if (feature(c, 'wing', 10) && this.rayHoleCd <= 0) {
                this.rayHoleCd = 1.5;
                this.addHole(e.x, e.y, this.holeRadius(c) * 0.8, 1.2);
            }
        }
    }

    /** 奇点弹：缓慢追向前方最近的敌人，撞上大型目标（Boss、精英、大型敌人）或飞满 1.2 秒后展开成持续 2 秒的大黑洞。 */
    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = [0, 2.8, 2.4, 2.0][c.fieldParts.special];
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const angles = feature(c, 'special', 10) ? [UP - 0.28, UP + 0.28] : [UP];
        const target = c.nearestEnemy(c.player.x, c.player.y + 500, 1400, e => e.y > c.player.y);
        for (const a of angles) {
            this.singularities.push(bullet(c, 'special', c.player.x, c.player.y + 50, a, 520,
                c.slotDps('special') * interval * 0.25 / angles.length, 'blackhole-orb', 14,
                { pierce: 99, life: 1.2, spin: 2, target: target?.id, turn: 2.5 }));
        }
    }

    private updateSingularities(c: SfCombat): void {
        for (let i = this.singularities.length - 1; i >= 0; i--) {
            const b = this.singularities[i];
            const hitBig = !b.dead && c.enemies.some(e => targetable(e) && e.radius >= 40 && Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius);
            if (!b.dead && b.life > 0.02 && !hitBig) continue;
            b.dead = true;
            this.singularities.splice(i, 1);
            this.addHole(b.x, b.y, 150 * (feature(c, 'special', 4) ? 1.2 : 1), 2, true);
        }
    }

    private updateHoles(c: SfCombat, dt: number): void {
        const mainTick = c.slotDps('main') * 0.15 * dt;
        const bigTick = c.slotDps('special') * 0.75 * dt;
        for (let i = this.holes.length - 1; i >= 0; i--) {
            const h = this.holes[i];
            h.t += dt;
            if (h.t >= h.life) {
                this.holes.splice(i, 1);
                this.release(c, h);
                if (!h.ult && (h.big ? feature(c, 'special', 7) : feature(c, 'main', 10))) {
                    c.splash(h.x, h.y, h.r * 0.8, h.big ? c.slotDps('special') * 0.9 : c.slotDps('main') * 0.6, h.big ? 'special' : 'main');
                }
                continue;
            }
            // 黑洞属于空中，不随地面卷动；吸住范围内的小怪。
            for (const e of c.enemies) {
                if (!capturable(e) || e.motion instanceof CapturedMotion) continue;
                if (Math.hypot(e.x - h.x, e.y - h.y) < h.r) e.motion = new CapturedMotion(h);
            }
            if (h.big || h.ult) {
                const tick = h.ult ? c.totalDps() * 1.8 * dt : bigTick;
                for (const e of c.enemies) {
                    if (targetable(e) && Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.radius * 0.5) c.damageEnemy(e, tick, h.ult ? 'ultimate' : 'special', e.x, e.y);
                }
            } else {
                for (const e of c.enemies) {
                    if (targetable(e) && Math.hypot(e.x - h.x, e.y - h.y) < h.r * 0.5) c.damageEnemy(e, mainTick, 'main', e.x, e.y);
                }
            }
            if (h.ult) c.cancelBullets(true, h.x, h.y, h.r);
            // 弯曲我方子弹：经过黑洞旁的子弹 +50% 伤害、加速，并转向黑洞外最近的敌人。
            for (const b of c.pbullets) {
                if (b.dead || b.slot === 'ultimate' || b.tag === 'gravity' || this.boosted.has(b) || this.singularities.indexOf(b) >= 0) continue;
                if (Math.hypot(b.x - h.x, b.y - h.y) > h.r * 0.9) continue;
                this.boosted.add(b);
                b.damage *= 1.5;
                b.speed = Math.hypot(b.vx, b.vy) * 1.15;
                b.target = c.nearestEnemy(b.x, b.y, 900)?.id;
                b.turn = b.target === undefined ? 0 : 9;
                b.scale = (b.scale ?? 1) * 1.2;
                b.life = Math.max(b.life, 1.2);
            }
        }
    }

    /** 黑洞结束：被吸住的敌人恢复为缓慢下沉离场。 */
    private release(c: SfCombat, h: Hole): void {
        for (const e of c.enemies) {
            if (e.motion instanceof CapturedMotion && e.motion.hole === h) e.motion = new LinearMotion(0, -150);
        }
    }

    private updateVisual(c: SfCombat): void {
        const v = this.visual;
        resetKitVisual(v);
        for (const h of this.holes) {
            const grow = Math.min(1, h.t / 0.2), fade = Math.min(1, (h.life - h.t) / 0.3);
            v.actors.push({ frame: 'fx/blackhole', x: h.x, y: h.y, angle: c.time * (h.big || h.ult ? 2.2 : 3.2),
                scale: h.r * 2.1 / 64 * grow, alpha: fade, tint: '#FFFFFF' });
        }
        if (c.fieldParts.wing > 0) {
            for (const r of this.rays(c)) v.beams.push({ ...r, width: feature(c, 'wing', 4) ? 7 : 5, alpha: 0.75, color: '#A070FF' });
        }
    }

    createUltimate(c: SfCombat): Ultimate {
        const y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.62;
        this.addHole(0, y, 320, 4, false, true);
        return new SingularityCollapse();
    }
}

/** 奇点坍缩：屏幕中上方的巨型黑洞持续 4 秒（吸入、伤害与清弹由黑洞套件处理）。 */
class SingularityCollapse extends TimedUltimate {
    constructor() { super('奇点坍缩', 4); }
    protected tick(): void { }
}

// ───────────────────────────── 剑鱼 ─────────────────────────────

const SWORD_RANGE = 600;

/**
 * 剑鱼：擦弹积攒剑意（自己的擦弹判定，范围随翼炮等级变大），攒满自动斩出贯穿全屏、斩断敌弹的月牙剑气；
 * 主炮是短程扇形刀光，飞得越远伤害越低（贴脸约 1.7 倍、射程尽头约 0.7 倍）——敢贴近打的人收益最高。
 */
class SwordfishKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 1 };
    private intent = 0;
    private readonly grazed = new WeakSet<EnemyBullet>();
    /** 自己射出的刀光（逐帧按飞行距离衰减伤害）与剑气（逐帧斩断敌弹）。 */
    private slashes: { b: PlayerBullet; base: number; x0: number; y0: number }[] = [];
    private waves: { b: PlayerBullet; width: number }[] = [];
    gaugeLabel = '剑意';
    get gauge(): number { return this.intent; }

    update(c: SfCombat, dt: number): void {
        this.detectGrazes(c);
        this.fireMain(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        if (this.intent >= 1) {
            this.intent = 0;
            const count = feature(c, 'special', 7) ? 2 : 1;
            for (let i = 0; i < count; i++) this.wave(c, c.player.x + (i - (count - 1) / 2) * 60, c.totalDps() * 1.6, 1);
            c.emit({ type: 'shot', kind: 'sword-wave', slot: 'special', x: c.player.x, y: c.player.y });
        }
        this.updateBullets(c);
    }

    private grazeRadius(c: SfCombat): number {
        return [44, 56, 64, 72][c.fieldParts.wing] * (feature(c, 'wing', 4) ? 1.2 : 1);
    }

    /** 敌弹从机体旁经过（进入擦弹圈但没有命中）时攒剑意；每颗子弹只算一次。 */
    private detectGrazes(c: SfCombat): void {
        const p = c.player;
        if (!p.alive) return;
        const r = this.grazeRadius(c);
        for (const b of c.ebullets) {
            if (b.dead || b.delay > 0 || b.lofted || this.grazed.has(b)) continue;
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d > r + b.radius || d < b.radius * 0.6 + 8) continue;
            this.grazed.add(b);
            this.intent = Math.min(1, this.intent + 0.1 * (feature(c, 'wing', 7) ? 1.3 : 1));
            if (feature(c, 'wing', 10)) this.wave(c, p.x, c.slotDps('wing') * 0.6, 0.5);
            if (c.ultimate instanceof SwordRain) c.ultimate.extra(c, b.x);
        }
    }

    /** 月牙剑气：贯穿全屏，斩断宽度范围内的敌弹。scale 为体积（小剑气 0.5）。 */
    private wave(c: SfCombat, x: number, damage: number, scale: number): void {
        const width = (feature(c, 'special', 4) ? 78 : 60) * scale;
        const b = bullet(c, 'special', x, c.player.y + 60, UP, 1100, damage, 'sword-wave', 26 * scale,
            { pierce: 99, life: 1.4, scale: (feature(c, 'special', 4) ? 1.3 : 1) * scale });
        this.waves.push({ b, width });
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.12;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [3, 4, 5, 6][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0);
        const base = c.slotDps('main') * interval / baseCount;
        const range = SWORD_RANGE * (feature(c, 'main', 4) ? 1.2 : 1);
        for (let i = 0; i < count; i++) {
            const a = UP + (i - (count - 1) / 2) * (0.46 / Math.max(1, count - 1));
            const b = bullet(c, 'main', c.player.x, c.player.y + 50, a, 1300, base * 1.7, 'sword-slash', 12,
                { life: range / 1300, pierce: feature(c, 'main', 7) ? 1 : 0 });
            this.slashes.push({ b, base, x0: b.x, y0: b.y });
        }
        c.emit({ type: 'shot', kind: 'sword-slash', slot: 'main' });
    }

    /** 特装：定时自动斩出一道小剑气。 */
    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = [0, 2.4, 2.0, 1.6][c.fieldParts.special];
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        this.wave(c, c.player.x, c.slotDps('special') * interval, 0.6);
    }

    private updateBullets(c: SfCombat): void {
        const range = SWORD_RANGE * (feature(c, 'main', 4) ? 1.2 : 1);
        this.slashes = this.slashes.filter(s => !s.b.dead);
        for (const s of this.slashes) {
            const k = Math.min(1, Math.hypot(s.b.x - s.x0, s.b.y - s.y0) / range);
            const near = feature(c, 'main', 10) && k * range < 150 ? 1.4 : 1;
            s.b.damage = s.base * (1.7 - k) * near;
        }
        this.waves = this.waves.filter(w => !w.b.dead);
        for (const w of this.waves) {
            for (const e of c.ebullets) {
                if (!e.dead && Math.abs(e.x - w.b.x) < w.width && Math.abs(e.y - w.b.y) < 22) {
                    e.dead = true;
                    c.emit({ type: 'explosion', x: e.x, y: e.y, size: 0, kind: 'cancel' });
                }
            }
        }
    }

    onBulletHit(c: SfCombat, _e: Enemy, b: PlayerBullet): void {
        if (b.kind === 'sword-wave' && feature(c, 'special', 10)) this.intent = Math.min(1, this.intent + 0.04);
    }

    createUltimate(): Ultimate { return new SwordRain(); }
}

/** 万剑齐落：4 秒内每 0.08 秒从屏幕上方落下一把剑（偏向敌人所在的列），落剑斩断沿途敌弹。 */
class SwordRain extends TimedUltimate {
    private timer = 0;
    private swords: PlayerBullet[] = [];
    constructor() { super('万剑齐落', 4); }

    /** 必杀期间擦弹：在擦过的子弹所在列再落一把。 */
    extra(c: SfCombat, x: number): void { this.drop(c, x); }

    private drop(c: SfCombat, x: number): void {
        const damage = c.totalDps() * 1.6 * 0.08 / 1.5;
        this.swords.push(bullet(c, 'ultimate', x, c.bounds.top + 40, -UP, 1500, damage, 'sword-fall', 14, { pierce: 4, life: 1.2 }));
    }

    protected tick(c: SfCombat, dt: number): void {
        this.timer -= dt;
        while (this.timer <= 0) {
            this.timer += 0.08;
            const targets = c.enemies.filter(targetable);
            const t = targets.length && c.rng.next() < 0.7 ? c.rng.pick(targets) : undefined;
            this.drop(c, t ? t.x + c.rng.range(-20, 20) : c.rng.range(c.bounds.left + 30, c.bounds.right - 30));
        }
        this.swords = this.swords.filter(s => !s.dead);
        for (const s of this.swords) c.cancelBullets(true, s.x, s.y, 30);
    }
}

// ───────────────────────────── 苍龙 ─────────────────────────────

const DRAGON_SPACING = 38;

interface DragonSegment { x: number; y: number; angle: number; down: number; fire: number }

/**
 * 苍龙：机体是龙头，身后节段沿玩家实际飞过的路线跟随（按路程取点，停下时龙身保持原样）。
 * 每节龙身向前开火——左右蛇行时弹幕铺成一片；节段挡下敌弹后暗掉一段时间。
 */
class DragonKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0, special: 1 };
    /** 龙头走过的路线（最新在末尾），按路程截断。 */
    private trail: { x: number; y: number }[] = [];
    private segments: DragonSegment[] = [];
    readonly visual = emptyKitVisual();

    private count(c: SfCombat): number { return [5, 5, 6, 8][c.fieldParts.special]; }

    update(c: SfCombat, dt: number): void {
        this.updateTrail(c, dt);
        this.layout(c, dt);
        this.block(c);
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.updateVisual(c);
    }

    private updateTrail(c: SfCombat, dt: number): void {
        const p = c.player;
        // 世界一直在向前飞：走过的路线随卷动向后（向下）漂，悬停时龙身也会顺势拖在身后。
        // 贴近飞行区底部时不再漂移（否则龙身会漂出屏幕），此时也不可能再往下飞、龙身不会盖住龙头。
        const room = Math.max(0, Math.min(1, (p.y - c.flight.bottom - 120) / 240));
        const drift = Math.max(c.scrollSpeed, 140) * dt * room;
        for (const q of this.trail) q.y -= drift;
        if (!this.trail.length) {
            // 初始龙身竖直拖在机头下方。
            for (let i = 14; i >= 0; i--) this.trail.push({ x: p.x, y: p.y - 30 - i * DRAGON_SPACING });
        }
        const last = this.trail[this.trail.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) >= 4) this.trail.push({ x: p.x, y: p.y });
        // 只保留够 12 节（必杀长度）的路程。
        let length = 0;
        for (let i = this.trail.length - 1; i > 0; i--) {
            length += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
            if (length > DRAGON_SPACING * 14 + 60) { this.trail.splice(0, i - 1); break; }
        }
    }

    /** 沿路线回溯 d 像素处的点与朝向。 */
    private pointBack(c: SfCombat, d: number): { x: number; y: number; angle: number } {
        let prev = { x: c.player.x, y: c.player.y - 30 };
        let left = d;
        for (let i = this.trail.length - 1; i >= 0; i--) {
            const q = this.trail[i];
            const seg = Math.hypot(prev.x - q.x, prev.y - q.y);
            if (seg >= left && seg > 0) {
                const k = left / seg;
                return { x: prev.x + (q.x - prev.x) * k, y: prev.y + (q.y - prev.y) * k, angle: Math.atan2(prev.y - q.y, prev.x - q.x) - UP };
            }
            left -= seg;
            prev = q;
        }
        return { x: prev.x, y: prev.y - left, angle: 0 };
    }

    private layout(c: SfCombat, dt: number): void {
        const n = c.ultimate instanceof DragonStorm ? 0 : this.count(c);
        while (this.segments.length < n) this.segments.push({ x: c.player.x, y: c.player.y, angle: 0, down: 0, fire: c.rng.range(0, 0.2) });
        this.segments.length = n;
        this.segments.forEach((s, i) => {
            const p = this.pointBack(c, (i + 1) * DRAGON_SPACING);
            s.x = p.x; s.y = p.y; s.angle = p.angle;
            if (s.down > 0) s.down -= dt;
        });
    }

    /** 节段挡弹：每节挡一发后暗掉 4 秒（特装 4 级 2 秒）；7 级起挡下的子弹化作龙鳞反击。 */
    private block(c: SfCombat): void {
        for (const s of this.segments) {
            if (s.down > 0) continue;
            for (const b of c.ebullets) {
                if (b.dead || b.delay > 0) continue;
                const r = b.radius * 0.6 + 16;
                if ((b.x - s.x) * (b.x - s.x) + (b.y - s.y) * (b.y - s.y) > r * r) continue;
                b.dead = true;
                s.down = feature(c, 'special', 4) ? 2 : 4;
                c.emit({ type: 'shield-hit', x: b.x, y: b.y, kind: 'dragon' });
                if (feature(c, 'special', 7)) {
                    const target = c.nearestEnemy(s.x, s.y + 300, 1200);
                    bullet(c, 'special', s.x, s.y + 10, UP, 1200, c.slotDps('special') * 0.5, 'dragon-scale', 7, { target: target?.id, turn: 6 });
                }
                break;
            }
        }
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt * (feature(c, 'main', 4) ? 1.15 : 1);
        if (this.timers.main > 0) return;
        const interval = 0.14;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [2, 3, 4, 5][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 2 : 0) + (feature(c, 'main', 10) ? 2 : 0);
        const damage = c.slotDps('main') * interval / baseCount;
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            bullet(c, 'main', c.player.x + offset * 18, c.player.y + 56, UP, 1400, damage, 'dragon-breath', 10,
                { pierce: feature(c, 'main', 7) ? 1 : 0 });
        }
        c.emit({ type: 'shot', kind: 'dragon-breath', slot: 'main' });
    }

    /** 龙鳞炮：每节龙身（未暗掉的）朝正前方射一发，节段越多铺得越开。 */
    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.2;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const damage = c.slotDps('wing') * interval / Math.max(5, this.segments.length) * (feature(c, 'wing', 4) ? 1.2 : 1);
        for (const s of this.segments) {
            if (s.down > 0) continue;
            const target = feature(c, 'wing', 7) ? c.nearestEnemy(s.x, s.y + 400, 1200, e => e.y > s.y) : undefined;
            bullet(c, 'wing', s.x, s.y + 16, UP, 1300, damage, 'dragon-scale', 8, {
                target: target?.id, turn: target ? 2.5 : 0, pierce: feature(c, 'wing', 10) ? 1 : 0, scale: feature(c, 'wing', 10) ? 1.3 : 1,
            });
        }
    }

    /** 龙尾：定时放出追踪火球。 */
    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = [0, 1.6, 1.4, 1.2][c.fieldParts.special];
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const tail = this.segments[this.segments.length - 1];
        if (!tail) return;
        const n = feature(c, 'special', 10) ? 4 : 2;
        const targets = c.enemies.filter(e => targetable(e) && e.y > c.player.y);
        for (let i = 0; i < n; i++) {
            const target = targets.length ? targets[i % targets.length] : undefined;
            bullet(c, 'special', tail.x, tail.y, UP + (i - (n - 1) / 2) * 0.5, 800, c.slotDps('special') * interval / n,
                'dragon-fire', 10, { target: target?.id, turn: 4, life: 2.6 });
        }
    }

    private updateVisual(c: SfCombat): void {
        const v = this.visual;
        resetKitVisual(v);
        const blink = Math.floor(c.time * 8) % 2 === 0;
        const storm = c.ultimate instanceof DragonStorm ? c.ultimate : undefined;
        const list = storm ? storm.positions : this.segments;
        // 从尾到头画，让靠近龙头的节段压在上面。
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            const down = !storm && (s as DragonSegment).down > 0;
            v.actors.push({ frame: i === list.length - 1 ? 'plane/dragon/tail' : 'plane/dragon/segment', x: s.x, y: s.y, angle: s.angle,
                scale: 1, alpha: down ? (blink ? 0.45 : 0.25) : 1, tint: down ? '#7A9A90' : '#FFFFFF' });
        }
    }

    createUltimate(): Ultimate { return new DragonStorm(); }
}

/** 龙卷天穹：12 节龙身在屏幕中上方绕成一圈盘旋 4 秒，每节持续向敌人射出追踪龙鳞，并吞掉身边的敌弹。 */
class DragonStorm extends TimedUltimate {
    private timer = 0;
    readonly positions: { x: number; y: number; angle: number }[] = [];
    constructor() { super('龙卷天穹', 4); }
    protected tick(c: SfCombat, dt: number): void {
        this.positions.length = 0;
        const cx = 0, cy = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.55;
        const r = Math.min(300, (c.bounds.right - c.bounds.left) / 2 - 50) * Math.min(1, this.t / 0.5);
        for (let i = 0; i < 12; i++) {
            const a = this.t * 1.6 + i * Math.PI * 2 / 12;
            this.positions.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: a + Math.PI });
        }
        for (const p of this.positions) c.cancelBullets(true, p.x, p.y, 34);
        this.timer -= dt;
        if (this.timer > 0) return;
        this.timer += 0.12;
        const damage = c.totalDps() * 1.6 * 0.12 / 12;
        const targets = c.enemies.filter(targetable);
        this.positions.forEach((p, i) => {
            const target = targets.length ? targets[i % targets.length] : undefined;
            bullet(c, 'ultimate', p.x, p.y, UP, 1100, damage, 'dragon-scale', 9, { target: target?.id, turn: 6, life: 2 });
        });
    }
}

// ───────────────────────────── 星环 ─────────────────────────────

/** 一枚飞行中的星环：去程沿发射方向匀减速，停下后折返、全速追向机体，回到机体时收回。 */
interface Ring {
    b: PlayerBullet;
    back: boolean;
    dirX: number;
    dirY: number;
    speed: number;
    decel: number;
    /** 每次命中的伤害（去程 / 回程）。 */
    out: number;
    ret: number;
    /** 斩断沿途敌弹的半径（0 = 不斩）。 */
    cut: number;
}

const RING_SPEED = 1300;
const RING_RETURN = 1500;

/**
 * 星环：主炮射出旋转的星环，飞出一段后折返、追着机体飞回来，去程和回程各命中同一个敌人一次（命中表在折返时清空）。
 * 回程总是朝机体当前的位置飞——星环在外面时左右移动，就能把回程路线“甩”过一片敌群。
 */
class ChakramKit implements PlaneKit {
    private timers: Record<SlotId, number> = { main: 0, wing: 0.2, special: 1 };
    private rings: Ring[] = [];

    update(c: SfCombat, dt: number): void {
        this.fireMain(c, dt);
        if (c.fieldParts.wing > 0) this.fireWing(c, dt);
        if (c.fieldParts.special > 0) this.fireSpecial(c, dt);
        this.steer(c, dt);
    }

    /** 星环体积随特装等级变大（判定半径同步）。 */
    private size(c: SfCombat): number { return 1 + c.fieldParts.special * 0.15; }

    private throwRing(c: SfCombat, slot: SlotId | 'ultimate', x: number, y: number, angle: number, range: number, hit: number,
        kind: string, radius: number, scale: number, cut = 0): void {
        const b = bullet(c, slot, x, y, angle, RING_SPEED, hit, kind, radius, { pierce: 999, life: 4, scale, spin: 14, angle: 0 });
        const ret = slot === 'main' && feature(c, 'main', 7) ? hit * 1.5 : hit;
        this.rings.push({ b, back: false, dirX: Math.cos(angle), dirY: Math.sin(angle), speed: RING_SPEED,
            decel: RING_SPEED * RING_SPEED / (2 * range), out: hit, ret, cut });
    }

    private fireMain(c: SfCombat, dt: number): void {
        this.timers.main -= dt;
        if (this.timers.main > 0) return;
        const interval = 0.3;
        this.timers.main += interval * (c.buffActive ? 0.75 : 1);
        const baseCount = [1, 2, 2, 3][c.fieldParts.main];
        const count = baseCount + (c.buffActive ? 1 : 0) + (feature(c, 'main', 10) ? 1 : 0);
        // 去程 + 回程两次命中，每次约为常规单发伤害的 0.6 倍（射程外的敌人只吃得到一程或吃不到）。
        const hit = c.slotDps('main') * interval / baseCount * 0.6;
        const range = 760 + (feature(c, 'main', 4) ? 120 : 0);
        const scale = this.size(c);
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) / 2;
            this.throwRing(c, 'main', c.player.x + offset * 26, c.player.y + 50, UP + offset * 0.1, range, hit, 'chakram-main', 15 * scale, scale);
        }
        c.emit({ type: 'shot', kind: 'chakram-main', slot: 'main' });
    }

    /** 侧翼小星环：向左右斜前方飞出，折返时同样追向机体，扫过两侧。 */
    private fireWing(c: SfCombat, dt: number): void {
        this.timers.wing -= dt;
        if (this.timers.wing > 0) return;
        const interval = 0.5;
        this.timers.wing += interval * (c.buffActive ? 0.75 : 1);
        const pairs = feature(c, 'wing', 10) ? 2 : 1;
        const hit = c.slotDps('wing') * interval / (pairs * 2) * 0.6 * (feature(c, 'wing', 4) ? 1.2 : 1);
        const spread = feature(c, 'wing', 7) ? 0.75 : 0.55;
        for (let k = 0; k < pairs; k++) {
            for (const side of [-1, 1]) {
                const m = mount(c, 'wing', side);
                this.throwRing(c, 'wing', m.x, m.y, UP - side * (spread + k * 0.25), 480, hit, 'chakram-mini', 10, 1);
            }
        }
    }

    /** 大星环：定时朝最近的敌人掷出一枚大星环（飞得更远）。 */
    private fireSpecial(c: SfCombat, dt: number): void {
        this.timers.special -= dt;
        if (this.timers.special > 0) return;
        const interval = [0, 1.5, 1.3, 1.1][c.fieldParts.special];
        this.timers.special += interval * (c.buffActive ? 0.75 : 1);
        const n = feature(c, 'special', 10) ? 2 : 1;
        const p = c.player;
        const target = c.nearestEnemy(p.x, p.y + 400, 1100, e => e.y > p.y);
        const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : UP;
        const scale = feature(c, 'special', 4) ? 2.1 : 1.6;
        for (let i = 0; i < n; i++) {
            this.throwRing(c, 'special', p.x, p.y + 40, aim + (i - (n - 1) / 2) * 0.35, 860, c.slotDps('special') * interval / n * 0.6,
                'chakram-big', 15 * scale, scale, feature(c, 'special', 7) ? 18 * scale : 0);
        }
    }

    private steer(c: SfCombat, dt: number): void {
        const p = c.player;
        this.rings = this.rings.filter(r => !r.b.dead);
        for (const r of this.rings) {
            const b = r.b;
            if (!r.back) {
                r.speed -= r.decel * dt;
                if (r.speed <= 80) {
                    // 折返：清空命中表，回程可以再命中一次。
                    r.back = true;
                    r.speed = 80;
                    b.hitIds = [];
                    b.damage = r.ret;
                } else {
                    b.vx = r.dirX * r.speed; b.vy = r.dirY * r.speed;
                }
            }
            if (r.back) {
                const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
                if (d < 36 || !p.alive) { b.dead = true; continue; }
                r.speed = Math.min(RING_RETURN, r.speed + 2600 * dt);
                b.vx = dx / d * r.speed; b.vy = dy / d * r.speed;
            }
            if (r.cut > 0) {
                for (const e of c.ebullets) {
                    if (e.dead || (e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) > r.cut * r.cut) continue;
                    e.dead = true;
                    c.emit({ type: 'explosion', x: e.x, y: e.y, size: 0, kind: 'cancel' });
                }
            }
        }
    }

    createUltimate(): Ultimate { return new RingStorm(); }
}

/**
 * 星环风暴：6 个巨型星环绕机体高速公转 4 秒，公转半径在 140～320 之间呼吸，吞掉碰到的敌弹并切割敌人；
 * 每个星环每 0.15 秒向敌人甩出一枚追踪小星环（远处的 Boss 也打得到）。
 */
class RingStorm extends TimedUltimate {
    private timer = 0;
    private rings: PlayerBullet[] = [];
    private reset = 0;
    constructor() { super('星环风暴', 4); }
    protected tick(c: SfCombat, dt: number): void {
        const p = c.player;
        if (!this.rings.length) {
            const hit = c.totalDps() * 1.6 * 0.25 / 6 * 0.5;
            for (let i = 0; i < 6; i++) {
                this.rings.push(bullet(c, 'ultimate', p.x, p.y, 0, 0, hit, 'chakram-big', 46, { pierce: 9999, life: 4.2, scale: 3, spin: 18, angle: 0 }));
            }
        }
        const r = 230 + Math.sin(this.t * 3) * 90;
        this.rings.forEach((b, i) => {
            const a = this.t * 4.2 + i * Math.PI / 3;
            const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            // 速度设为“下一步正好到达公转位置”，由子弹更新统一移动与判定。
            b.vx = (x - b.x) / Math.max(dt, 1e-4); b.vy = (y - b.y) / Math.max(dt, 1e-4);
            c.cancelBullets(true, x, y, 56);
        });
        // 公转的星环每 0.25 秒可以再次命中同一个敌人。
        this.reset -= dt;
        if (this.reset <= 0) { this.reset += 0.25; for (const b of this.rings) b.hitIds = []; }
        this.timer -= dt;
        if (this.timer > 0) return;
        this.timer += 0.15;
        const damage = c.totalDps() * 1.6 * 0.15 / 6 * 0.5;
        const targets = c.enemies.filter(targetable);
        this.rings.forEach((b, i) => {
            const target = targets.length ? targets[i % targets.length] : undefined;
            bullet(c, 'ultimate', b.x + b.vx * dt, b.y + b.vy * dt, UP, 1100, damage, 'chakram-mini', 10, { target: target?.id, turn: 7, life: 2, spin: 14, angle: 0 });
        });
    }
}

export function createPlaneKit(id: PlaneId, c: SfCombat): PlaneKit {
    void c;
    switch (id) {
        case 'thunder': return new ThunderKit();
        case 'falcon': return new FalconKit();
        case 'lightning': return new LightningKit();
        case 'frost': return new FrostKit();
        case 'phantom': return new PhantomKit();
        case 'dawn': return new DawnKit();
        case 'wildgoose': return new WildGooseKit();
        case 'blackhole': return new BlackHoleKit();
        case 'swordfish': return new SwordfishKit();
        case 'dragon': return new DragonKit();
        case 'chakram': return new ChakramKit();
        default: return new VanguardKit();
    }
}
