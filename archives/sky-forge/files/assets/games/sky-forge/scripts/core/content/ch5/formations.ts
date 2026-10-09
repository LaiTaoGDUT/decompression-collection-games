import type { FormationFn } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';
import type { Enemy } from '../../SfEnemies';
import type { WaveEvent } from '../../SfLevelTypes';
import { LinearMotion, type Motion } from '../../SfMotion';
import { STYLE, aimed } from '../../SfPatterns';

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;

// ───────────────────────────── 雪崩带 sweep ─────────────────────────────

/**
 * 雪崩带：一条斜向带状编队从一侧上方扫向另一侧下方，带内恰好空出一个缺口。
 * n 为带上的位置数（含缺口），gap 为缺口序号（默认中间）。
 */
const sweep: FormationFn = (c, ev) => {
    const n = Math.max(4, Math.min(9, ev.n ?? 7));
    const s = ev.side ?? -1;
    const hole = ev.amp ?? Math.floor(n / 2);
    const speed = ev.speed ?? 230;
    // 运动方向：从 s 侧上方斜向另一侧下方；带与运动方向垂直排列。
    const dx = -s * 0.62, dy = -0.78;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const cx = s * (c.bounds.right + 60), cy = c.bounds.top - 40;
    const group = c.newGroup(ev.drop);
    for (let i = 0; i < n; i++) {
        if (i === hole) continue;
        const k = (i - (n - 1) / 2) * (ev.gap ?? 66);
        c.spawnEnemy(ev.e, cx + nx * k, cy + ny * k, new LinearMotion(ux * speed, uy * speed), { group, fireScale: ev.fireScale });
    }
};

// ───────────────────────────── 方阵 phalanx ─────────────────────────────

/** 方阵共享状态：整体左右平移，到边下压一格；只有每列最前排开火；打穿一列后剩余列收拢。 */
interface Phalanx {
    cols: number;
    rows: number;
    members: { e: Enemy; col: number; row: number }[];
    cx: number;
    cy: number;
    dir: number;
    floor: number;
    t: number;
    fire: number;
    stamp: number;
    spacing: number;
}

class PhalanxMotion implements Motion {
    constructor(private readonly p: Phalanx, private readonly col: number, private readonly row: number) { }

    update(e: Enemy, dt: number, c: SfCombat): boolean {
        const p = this.p;
        if (p.stamp !== c.time) {
            p.stamp = c.time;
            this.tick(c, dt);
        }
        // 剩余列按原顺序重新编号，收拢到中心两侧。
        const alive = this.aliveCols();
        const rank = alive.indexOf(this.col);
        const tx = p.cx + (rank - (alive.length - 1) / 2) * p.spacing;
        const ty = p.cy - this.row * 52;
        const px = e.x, py = e.y;
        e.x += (tx - e.x) * Math.min(1, dt * 6);
        e.y += (ty - e.y) * Math.min(1, dt * 4);
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return p.t < 20 || e.y < c.bounds.top + 80;
    }

    private aliveCols(): number[] {
        const cols: number[] = [];
        for (let i = 0; i < this.p.cols; i++) if (this.p.members.some(m => m.col === i && !m.e.dead)) cols.push(i);
        return cols;
    }

    private tick(c: SfCombat, dt: number): void {
        const p = this.p;
        p.t += dt;
        if (p.t > 18) { p.cy += 220 * dt; return; }
        const alive = this.aliveCols();
        const half = (alive.length - 1) / 2 * p.spacing + 30;
        p.cx += p.dir * 70 * dt;
        if ((p.dir > 0 && p.cx + half > c.bounds.right - 20) || (p.dir < 0 && p.cx - half < c.bounds.left + 20)) {
            p.dir = -p.dir;
            p.cy = Math.max(p.floor, p.cy - 34);
        }
        p.fire -= dt;
        if (p.fire > 0 || c.phase !== 'waves' && c.phase !== 'warning') return;
        p.fire = 2.4;
        // 每列最前排（行号最大）的存活者依次开火。
        alive.forEach((col, i) => {
            const front = p.members.filter(m => m.col === col && !m.e.dead).sort((a, b) => b.row - a.row)[0];
            if (!front) return;
            c.schedule(i * 0.15, () => {
                const e = front.e;
                if (e.dead || !e.entered || e.y < c.player.y + 120) return;
                e.windup = 0.25;
                aimed(c, e.x, e.y - 16, 1, 0, 200, STYLE.small);
            });
        });
    }
}

function spawnPhalanx(c: SfCombat, ev: WaveEvent, x: number, y: number, dir: number, group: number | undefined): void {
    const cols = Math.max(2, Math.min(6, ev.n ?? 4)), rows = 3;
    const p: Phalanx = { cols, rows, members: [], cx: x, cy: y, dir, floor: yAt(c, 0.5), t: 0, fire: 1.6, stamp: -1, spacing: ev.gap ?? 74 };
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const sx = x + (col - (cols - 1) / 2) * p.spacing;
            const e = c.spawnEnemy(ev.e, sx, c.bounds.top + 60 + row * 30, new PhalanxMotion(p, col, row), { group, fireScale: ev.fireScale });
            p.members.push({ e, col, row });
        }
    }
}

/** 方阵：4×3 雪原兵整体移动（n 为列数）。 */
const phalanx: FormationFn = (c, ev) => {
    spawnPhalanx(c, ev, ev.x ?? 0, yAt(c, ev.y ?? 0.82), ev.side ?? 1, c.newGroup(ev.drop));
};

/** 双方阵错层：上下两个方阵反向平移，第二个晚 1.5 秒入场、错开半列。 */
const phalanxDouble: FormationFn = (c, ev) => {
    const group = c.newGroup(ev.drop);
    const level = c.level;
    spawnPhalanx(c, ev, -60, yAt(c, ev.y ?? 0.86), 1, group);
    c.schedule(1.5, () => { if (c.level === level) spawnPhalanx(c, ev, 60, yAt(c, (ev.y ?? 0.86) - 0.2), -1, group); });
};

// ───────────────────────────── 镜像 mirror ─────────────────────────────

/** 镜像走位：以玩家 x 为轴，与同伴对称地停在玩家两侧，左右间距缓慢呼吸；最快 180 像素/秒跟随。 */
class MirrorMotion implements Motion {
    private t = 0;
    constructor(private readonly side: number, private readonly y: number, private readonly hold: number) { }
    update(e: Enemy, dt: number, c: SfCombat): boolean {
        this.t += dt;
        const px = e.x, py = e.y;
        if (this.t > this.hold) {
            e.y += 240 * dt;
        } else {
            const gap = 150 + Math.sin(this.t * 0.9) * 55;
            const tx = Math.max(c.bounds.left + 50, Math.min(c.bounds.right - 50, c.player.x + this.side * gap));
            const step = 180 * dt;
            e.x += Math.max(-step, Math.min(step, tx - e.x));
            e.y += (this.y - e.y) * Math.min(1, dt * 3);
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return e.y < c.bounds.top + 120;
    }
}

/** 冰镜哨兵成对入场（n 为对数，每对错开 0.12 的高度）。 */
const mirror: FormationFn = (c, ev) => {
    const pairs = Math.max(1, Math.min(2, ev.n ?? 1));
    const group = pairs > 1 || ev.drop ? c.newGroup(ev.drop) : undefined;
    for (let i = 0; i < pairs; i++) {
        const y = yAt(c, (ev.y ?? 0.72) + i * 0.12);
        for (const side of [-1, 1]) {
            c.spawnEnemy(ev.e, side * 200, c.bounds.top + 60, new MirrorMotion(side, y, ev.hold ?? 10), { group, fireScale: ev.fireScale });
        }
    }
};

/** 第 5 章新增编队：雪崩带、方阵、双方阵错层、镜像。 */
export const CH5_FORMATIONS: Record<string, FormationFn> = {
    sweep,
    phalanx,
    'phalanx-double': phalanxDouble,
    mirror,
};
