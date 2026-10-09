import type { FormationFn } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';
import type { Enemy } from '../../SfEnemies';
import type { WaveEvent } from '../../SfLevelTypes';
import { GroundMotion, type Motion } from '../../SfMotion';

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
const clampX = (c: SfCombat, x: number, margin = 60) => Math.max(c.bounds.left + margin, Math.min(c.bounds.right - margin, x));

/** 传送标记的显示色（虚空紫）。 */
const BLINK_TINT = '#C77DFF';

// ───────────────────────────── 闪现 blink ─────────────────────────────

/** 闪现出来的敌人原地停留，1.4 秒后离场（不算击杀、不掉落）。 */
class BlinkMotion implements Motion {
    private t = 0;
    update(e: Enemy, dt: number): boolean {
        this.t += dt;
        e.vx = 0; e.vy = 0;
        return this.t < 1.4;
    }
}

/** 先在 points 上依次亮出传送标记（全部一次亮出，越晚闪现的标记越晚消失），再按 gap 秒的间隔逐个闪现。 */
function blinkSequence(c: SfCombat, ev: WaveEvent, points: { x: number; y: number }[], gap: number): void {
    const group = points.length >= 3 || ev.drop ? c.newGroup(ev.drop) : undefined;
    const level = c.level;
    const lead = 0.7;
    points.forEach((p, i) => {
        const wait = lead + i * gap;
        c.addHazard({ kind: 'mark', ax: p.x, ay: p.y, bx: p.x, by: p.y, width: 30, warn: 1, warnTime: wait, life: wait, tint: BLINK_TINT });
        c.schedule(wait, () => {
            if (c.level !== level || (c.phase !== 'waves' && c.phase !== 'warning')) return;
            const e = c.spawnEnemy(ev.e, p.x, p.y, new BlinkMotion(), { group, fireScale: ev.fireScale });
            e.data.blink = 1;
            e.alpha = 0;
            c.emit({ type: 'telegraph', x: p.x, y: p.y, kind: 'blink' });
        });
    });
}

/**
 * 闪现阵：从上方一侧开始，标记沿折线一路逼近玩家当前位置的上方（越后面的越靠近玩家）。
 * n 为人数，gap 为相邻两次闪现的间隔秒数。
 */
const blink: FormationFn = (c, ev) => {
    const n = Math.max(3, Math.min(8, ev.n ?? 5));
    const s = ev.side ?? (c.rng.next() < 0.5 ? -1 : 1);
    const top = yAt(c, 0.86), near = Math.max(c.player.y + 230, yAt(c, 0.42));
    const px = c.player.x;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        // 左右交替的锯齿路线，从 s 侧的屏幕上方收向玩家上方。
        const x = clampX(c, (1 - k) * s * 260 + k * px + (i % 2 ? 1 : -1) * 90 * (1 - k * 0.5));
        points.push({ x, y: top + (near - top) * k });
    }
    blinkSequence(c, ev, points, ev.gap ?? 0.45);
};

/** 闪现包围：标记在玩家当前位置上方的半圆上依次亮起（从一侧绕到另一侧），每个闪现都朝玩家开火，形成合围的交叉火力。 */
const blinkRing: FormationFn = (c, ev) => {
    const n = Math.max(3, Math.min(8, ev.n ?? 6));
    const s = ev.side ?? 1;
    const r = ev.amp ?? 280;
    const cx = c.player.x, cy = Math.min(c.player.y + 60, yAt(c, 0.5));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.12 + 0.76 * i / (n - 1));
        points.push({ x: clampX(c, cx + Math.cos(s > 0 ? a : Math.PI - a) * r), y: Math.min(yAt(c, 0.9), cy + Math.sin(a) * r) });
    }
    blinkSequence(c, ev, points, ev.gap ?? 0.3);
};

// ───────────────────────────── 轮转 orbit ─────────────────────────────

/** 轮转编队共享状态：核心的位置由核心自己的 Motion 决定，卫星每帧读取。 */
interface Orbit { core: Enemy; angle: number; spin: number; radius: number }

/** 核心：从上方入场悬停到 y，横向缓慢漂移，hold 秒后向下斜出场。 */
class OrbitCoreMotion implements Motion {
    private t = 0;
    constructor(private readonly x: number, private readonly y: number, private readonly hold: number, private readonly side: number) { }
    update(e: Enemy, dt: number, c: SfCombat): boolean {
        this.t += dt;
        const px = e.x, py = e.y;
        if (this.t < this.hold) {
            e.x += (this.x + Math.sin(this.t * 0.6) * 120 * this.side - e.x) * Math.min(1, dt * 1.6);
            e.y += (this.y - e.y) * Math.min(1, dt * 1.4);
        } else {
            e.x += this.side * 120 * dt;
            e.y -= 160 * dt;
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return e.y > c.bounds.bottom - 120;
    }
}

/** 卫星：核心存活时绕核心公转（入场时半径从 0 展开）；核心死亡后沿切线以 3 倍线速度甩飞。 */
class SatelliteMotion implements Motion {
    private flungVx = 0;
    private flungVy = 0;
    private flung = false;
    private t = 0;
    constructor(private readonly o: Orbit, private readonly phase: number) { }
    update(e: Enemy, dt: number, c: SfCombat): boolean {
        this.t += dt;
        const px = e.x, py = e.y;
        if (!this.flung && !this.o.core.dead) {
            const a = this.o.angle + this.phase;
            const r = this.o.radius * Math.min(1, 0.2 + this.t * 0.8);
            e.x = this.o.core.x + Math.cos(a) * r;
            e.y = this.o.core.y + Math.sin(a) * r;
        } else {
            if (!this.flung) {
                this.flung = true;
                const a = this.o.angle + this.phase;
                const speed = Math.max(300, Math.abs(this.o.spin) * this.o.radius * 3);
                const dir = Math.sign(this.o.spin) || 1;
                this.flungVx = -Math.sin(a) * speed * dir;
                this.flungVy = Math.cos(a) * speed * dir;
            }
            e.x += this.flungVx * dt;
            e.y += this.flungVy * dt;
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return this.flung ? e.y > c.bounds.bottom - 80 && e.y < c.bounds.top + 200 : true;
    }
}

/** 公转角由核心的 Motion 推进（每帧一次），卫星只读取。 */
class SpinningCore implements Motion {
    constructor(private readonly inner: OrbitCoreMotion, private readonly o: Orbit) { }
    update(e: Enemy, dt: number, c: SfCombat): boolean {
        this.o.angle += this.o.spin * dt;
        return this.inner.update(e, dt, c);
    }
}

function spawnOrbit(c: SfCombat, ev: WaveEvent, x: number, spin: number, side: number, group: number): void {
    const n = Math.max(3, Math.min(8, ev.n ?? 6));
    const radius = ev.gap ?? 74;
    const core = c.spawnEnemy(ev.escort ?? 'satcore', x, c.bounds.top + 80, null, { group, fireScale: ev.fireScale });
    const o: Orbit = { core, angle: 0, spin, radius };
    core.motion = new SpinningCore(new OrbitCoreMotion(x, yAt(c, ev.y ?? 0.74), ev.hold ?? 10, side), o);
    for (let i = 0; i < n; i++) {
        c.spawnEnemy(ev.e, x, c.bounds.top + 80, new SatelliteMotion(o, Math.PI * 2 * i / n), { group, fireScale: ev.fireScale });
    }
}

/** 轮转：n 颗卫星（ev.e）绕一个核心（ev.escort，默认卫星核心）公转；gap 为公转半径。 */
const orbit: FormationFn = (c, ev) => {
    const s = ev.side ?? 1;
    spawnOrbit(c, ev, ev.x ?? 0, (ev.speed ?? 1.5) * s, s, c.newGroup(ev.drop));
};

/** 双轮转：左右两组反向公转，第二组晚 1 秒入场。 */
const orbitPair: FormationFn = (c, ev) => {
    const group = c.newGroup(ev.drop);
    const level = c.level;
    const spin = ev.speed ?? 1.5;
    spawnOrbit(c, ev, -170, spin, 1, group);
    c.schedule(1, () => { if (c.level === level) spawnOrbit(c, ev, 170, -spin, -1, group); });
};

// ───────────────────────────── 裂缝 rift ─────────────────────────────

/** 一对裂缝随地面卷动；由前一个裂缝每帧登记传送危险物（两端都还在场上时）。 */
class RiftMotion extends GroundMotion {
    partner: Enemy | null = null;
    update(e: Enemy, dt: number, c: SfCombat): void {
        super.update(e, dt, c);
        const p = this.partner;
        if (p && !p.dead && e.entered && p.entered) {
            c.addHazard({ kind: 'portal', ax: e.x, ay: e.y, bx: p.x, by: p.y, width: e.radius });
        }
    }
}

/**
 * 边缘成对的虚空裂缝：x 为左裂缝位置（默认贴左边），gap 为两裂缝的水平距离，amp 为右裂缝比左裂缝高出的距离
 * （0 = 同高，正值时射进低处裂缝的子弹会从高处冒出）。
 */
const rift: FormationFn = (c, ev) => {
    const left = ev.x ?? c.bounds.left + 90;
    const right = Math.min(c.bounds.right - 90, left + (ev.gap ?? (c.bounds.right - c.bounds.left - 180)));
    const y = c.bounds.top + 70;
    const m1 = new RiftMotion(), m2 = new RiftMotion();
    c.spawnEnemy(ev.e, left, y, m1);
    const b = c.spawnEnemy(ev.e, right, y + (ev.amp ?? 0), m2);
    m1.partner = b;
};

/** 第 6 章新增编队：闪现、闪现包围、轮转、双轮转、裂缝。 */
export const CH6_FORMATIONS: Record<string, FormationFn> = {
    blink,
    'blink-ring': blinkRing,
    orbit,
    'orbit-pair': orbitPair,
    rift,
};
