import type { FormationFn } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';
import type { Enemy } from '../../SfEnemies';
import type { WaveEvent } from '../../SfLevelTypes';
import type { Motion } from '../../SfMotion';

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;

interface Point { x: number; y: number }

/** 折线上按弧长取点（路径点之间做 smoothstep 过渡，拐角不生硬）。 */
function along(points: Point[], lengths: number[], d: number): Point {
    let i = 0;
    while (i < lengths.length - 1 && lengths[i] < d) i++;
    const start = i === 0 ? 0 : lengths[i - 1];
    const k = Math.max(0, Math.min(1, (d - start) / Math.max(1, lengths[i] - start)));
    const a = points[i], b = points[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function cumulative(points: Point[]): number[] {
    const out: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        out.push(total);
    }
    return out;
}

// ───────────────────────────── 群聚 flock ─────────────────────────────

/** 一群火蝠共享的“鸟群中心”：每个模拟步只由第一只更新一次。 */
interface Flock {
    points: Point[];
    lengths: number[];
    speed: number;
    d: number;
    stamp: number;
    cx: number; cy: number;
    members: Enemy[];
}

/**
 * 群聚走位（boids）：每只朝“鸟群中心 + 自己的槽位”弹簧靠拢，与同伴保持间距；
 * 我方子弹从下方逼近时横向闪开火线，子弹过去后再被弹簧拉回群里。中心走完路径后整群离场。
 */
class FlockMotion implements Motion {
    private vx = 0;
    private vy = -120;
    constructor(private readonly flock: Flock, private readonly slotX: number, private readonly slotY: number) { }

    update(e: Enemy, dt: number, c: SfCombat): boolean {
        const f = this.flock;
        if (f.stamp !== c.time) {
            f.stamp = c.time;
            f.d += f.speed * dt;
            const p = along(f.points, f.lengths, f.d);
            f.cx = p.x; f.cy = p.y;
        }
        if (f.d >= f.lengths[f.lengths.length - 1]) return false;
        let ax = (f.cx + this.slotX - e.x) * 7 - this.vx * 2.6;
        let ay = (f.cy + this.slotY - e.y) * 7 - this.vy * 2.6;
        for (const o of f.members) {
            if (o === e || o.dead) continue;
            const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
            if (d2 < 34 * 34 && d2 > 0.01) { const d = Math.sqrt(d2); ax += dx / d * 900; ay += dy / d * 900; }
        }
        // 躲火线：下方 240 像素内、横向 56 像素内正在上行的我方子弹。
        for (const b of c.pbullets) {
            if (b.dead || b.vy <= 0) continue;
            const dy = e.y - b.y, dx = e.x - b.x;
            if (dy > 0 && dy < 240 && Math.abs(dx) < 56) ax += (dx >= 0 ? 1 : -1) * 2600 * (1 - dy / 240);
        }
        this.vx += ax * dt; this.vy += ay * dt;
        const s = Math.hypot(this.vx, this.vy);
        if (s > 420) { this.vx *= 420 / s; this.vy *= 420 / s; }
        e.x += this.vx * dt; e.y += this.vy * dt;
        e.vx = this.vx; e.vy = this.vy;
        return true;
    }
}

function spawnFlock(c: SfCombat, ev: WaveEvent, side: number, count: number, group: number | undefined): void {
    const top = c.bounds.top;
    const s = side;
    const points: Point[] = [
        { x: s * 200, y: top + 90 },
        { x: s * 140, y: yAt(c, 0.74) },
        { x: -s * 170, y: yAt(c, 0.6) },
        { x: -s * 40, y: yAt(c, 0.48) },
        { x: s * 210, y: yAt(c, 0.6) },
        { x: s * 520, y: yAt(c, 0.76) },
    ];
    const flock: Flock = { points, lengths: cumulative(points), speed: ev.speed ?? 170, d: 0, stamp: -1, cx: points[0].x, cy: points[0].y, members: [] };
    for (let i = 0; i < count; i++) {
        // 槽位：黄金角螺旋排布，群形圆润、不成规整阵列。
        const a = i * 2.4, r = 16 + Math.sqrt(i) * 24;
        const sx = Math.cos(a) * r, sy = Math.sin(a) * r * 0.75;
        const e = c.spawnEnemy(ev.e, points[0].x + sx, points[0].y + sy + 30, new FlockMotion(flock, sx, sy), { group, fireScale: ev.fireScale });
        flock.members.push(e);
    }
}

/** 一群火蝠从一侧上方入场、在中上部绕 S 形游走后从同侧离场。 */
const flock: FormationFn = (c, ev) => {
    const n = Math.max(4, Math.min(16, ev.n ?? 12));
    spawnFlock(c, ev, ev.side ?? (ev.x !== undefined && ev.x > 0 ? 1 : -1), n, c.newGroup(ev.drop));
};

/** 两群从左右同时入场，路径镜像交错（同一整队奖励）。 */
const flockPincer: FormationFn = (c, ev) => {
    const n = Math.max(8, Math.min(24, ev.n ?? 16));
    const group = c.newGroup(ev.drop);
    spawnFlock(c, ev, -1, Math.floor(n / 2), group);
    spawnFlock(c, ev, 1, Math.ceil(n / 2), group);
};

// ───────────────────────────── 弹跳 hop ─────────────────────────────

/** 一排史莱姆从上方落下后同时开跳，相邻的跳向相反方向。 */
const hop: FormationFn = (c, ev) => {
    const n = Math.max(1, Math.min(6, ev.n ?? 3));
    const spacing = ev.gap ?? 200;
    const group = n >= 3 || ev.drop ? c.newGroup(ev.drop) : undefined;
    for (let i = 0; i < n; i++) {
        const x = Math.max(c.bounds.left + 60, Math.min(c.bounds.right - 60, (ev.x ?? 0) + (i - (n - 1) / 2) * spacing));
        const e = c.spawnEnemy(ev.e, x, c.bounds.top + 50, null, { group, fireScale: ev.fireScale });
        e.data.dir = i % 2 === 0 ? -1 : 1;
        e.data.rest = 0.2 + i * 0.15;
        e.data.firstY = (ev.y ?? 0.82) - (i % 2) * 0.04;
    }
};

/** 阶梯弹跳：从一侧逐只入场、依次落在越来越低的位置，整串朝另一侧跳。 */
const hopStair: FormationFn = (c, ev) => {
    const n = Math.max(2, Math.min(6, ev.n ?? 4));
    const s = ev.side ?? -1;
    const group = c.newGroup(ev.drop);
    for (let i = 0; i < n; i++) {
        c.schedule(i * 0.45, () => {
            const x = s * (c.bounds.right - 70 - i * 70);
            const e = c.spawnEnemy(ev.e, x, c.bounds.top + 50, null, { group, fireScale: ev.fireScale });
            e.data.dir = -s;
            e.data.rest = 0.2;
            e.data.firstY = (ev.y ?? 0.86) - i * 0.05;
        });
    }
};

// ───────────────────────────── 轨道 rail ─────────────────────────────

const RAIL_WARN = 1.2;

/** 沿轨道折线高速行驶；轨道属于地面，行驶时叠加地面卷动的位移。 */
class RailMotion implements Motion {
    private d = 0;
    private shift = 0;
    private readonly lengths: number[];
    constructor(private readonly points: Point[], private readonly speed: number) { this.lengths = cumulative(points); }
    update(e: Enemy, dt: number, c: SfCombat): boolean {
        this.d += this.speed * dt;
        this.shift += c.scrollSpeed * dt;
        const p = along(this.points, this.lengths, this.d);
        const px = e.x, py = e.y;
        e.x = p.x; e.y = p.y - this.shift;
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return this.d < this.lengths[this.lengths.length - 1];
    }
}

/** 画出一条轨道（预警高亮 1.2 秒），然后 n 辆矿车沿轨道依次冲过。 */
function layRail(c: SfCombat, ev: WaveEvent, points: Point[], group: number | undefined, delay = 0): void {
    const level = c.level;
    const speed = ev.speed ?? 560;
    const n = Math.max(1, Math.min(4, ev.n ?? 2));
    const gap = ev.gap ?? 0.45;
    const travel = cumulative(points).slice(-1)[0] / speed;
    c.schedule(delay, () => {
        if (c.level !== level) return;
        const life = RAIL_WARN + (n - 1) * gap + travel + 1.2;
        for (let i = 1; i < points.length; i++) {
            c.addHazard({ kind: 'rail', ax: points[i - 1].x, ay: points[i - 1].y, bx: points[i].x, by: points[i].y,
                width: 14, warn: 1, warnTime: RAIL_WARN, life, scroll: true });
        }
        c.emit({ type: 'telegraph', x: points[0].x, y: c.bounds.top - 40, kind: 'rail' });
        for (let i = 0; i < n; i++) {
            c.schedule(RAIL_WARN + i * gap, () => {
                if (c.level !== level) return;
                // 轨道在预警期间已经随地面下移，矿车从同样下移后的起点出发。
                const shifted = points.map(p => ({ x: p.x, y: p.y - c.scrollSpeed * (RAIL_WARN + i * gap) }));
                c.spawnEnemy(ev.e, shifted[0].x, shifted[0].y, new RailMotion(shifted, speed), { group, fireScale: ev.fireScale });
            });
        }
    });
}

/** 直轨：从顶部竖直通到底部。 */
const rail: FormationFn = (c, ev) => {
    const x = Math.max(c.bounds.left + 60, Math.min(c.bounds.right - 60, ev.x ?? 0));
    const top = c.bounds.top + 60, bottom = c.bounds.bottom - 80;
    layRail(c, ev, [{ x, y: top }, { x, y: bottom }], ev.drop ? c.newGroup(ev.drop) : undefined);
};

/** S 弯轨道：左右摆动两次，矿车会横扫过中路。 */
const railS: FormationFn = (c, ev) => {
    const s = ev.side ?? -1, amp = ev.amp ?? 200, x = ev.x ?? 0;
    const top = c.bounds.top + 60, h = c.bounds.top - c.bounds.bottom + 140;
    const points: Point[] = [];
    for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        points.push({ x: x + Math.sin(k * Math.PI * 2) * amp * s, y: top - h * k });
    }
    layRail(c, ev, points, ev.drop ? c.newGroup(ev.drop) : undefined);
};

/** 交叉双轨：两条斜轨从上方两角交叉穿过中路，第二条稍晚亮起。 */
const railX: FormationFn = (c, ev) => {
    const top = c.bounds.top + 60, bottom = c.bounds.bottom - 80;
    const w = c.bounds.right - 70;
    const group = c.newGroup(ev.drop);
    layRail(c, ev, [{ x: -w, y: top }, { x: w, y: bottom }], group);
    layRail(c, ev, [{ x: w, y: top }, { x: -w, y: bottom }], group, 0.8);
};

// ───────────────────────────── 落石 rockfall ─────────────────────────────

/** 落石沿玩家前进方向连落：每块瞄准玩家当时位置附近（横向错开），落点在玩家上方一段距离。 */
const rockfall: FormationFn = (c, ev) => {
    const n = Math.max(1, Math.min(10, ev.n ?? 5));
    const level = c.level;
    for (let i = 0; i < n; i++) {
        c.schedule(i * (ev.gap ?? 0.55), () => {
            if (c.level !== level) return;
            const tx = Math.max(c.bounds.left + 50, Math.min(c.bounds.right - 50, c.player.x + c.rng.range(-150, 150)));
            const e = c.spawnEnemy(ev.e, tx, c.bounds.top + 60, null, { fireScale: ev.fireScale });
            e.data.tx = tx;
            e.data.ty = Math.max(c.player.y + 120, yAt(c, c.rng.range(0.28, 0.46)));
        });
    }
};

/** 第 4 章新增编队：群聚、弹跳、轨道、落石。 */
export const CH4_FORMATIONS: Record<string, FormationFn> = {
    flock,
    'flock-pincer': flockPincer,
    hop,
    'hop-stair': hopStair,
    rail,
    'rail-s': railS,
    'rail-x': railX,
    rockfall,
};
