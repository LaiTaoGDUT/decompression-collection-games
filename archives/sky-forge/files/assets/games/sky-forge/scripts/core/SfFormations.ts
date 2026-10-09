import type { SfCombat } from './SfCombat';
import type { Enemy } from './SfEnemies';
import type { WaveEvent } from './SfLevelTypes';
import type { FormationFn } from './content/SfContentTypes';
import { CH1_FORMATIONS } from './content/ch1/formations';
import { CH2_FORMATIONS } from './content/ch2/formations';
import { CH3_FORMATIONS } from './content/ch3/formations';
import { CH4_FORMATIONS } from './content/ch4/formations';
import { CH5_FORMATIONS } from './content/ch5/formations';
import { CH6_FORMATIONS } from './content/ch6/formations';

/** 章节专属编队（注册名 → 生成函数）。 */
const CONTENT_FORMATIONS: Record<string, FormationFn> = { ...CH1_FORMATIONS, ...CH2_FORMATIONS, ...CH3_FORMATIONS, ...CH4_FORMATIONS, ...CH5_FORMATIONS, ...CH6_FORMATIONS };
import {
    ChargeMotion, GroundMotion, HoverMotion, LinearMotion, PathMotion, SineMotion, type Motion,
} from './SfMotion';

/** 环绕编队：一组敌人围绕下降中的圆心旋转。 */
class OrbitMotion implements Motion {
    private t = 0;
    constructor(private cx: number, private cy: number, private radius: number, private phase: number,
        private spin: number, private vy: number) { }
    update(e: Enemy, dt: number): void {
        this.t += dt;
        this.cy += this.vy * dt;
        const a = this.phase + this.t * this.spin;
        const r = this.radius * Math.min(1, 0.4 + this.t * 0.6);
        const px = e.x, py = e.y;
        e.x = this.cx + Math.cos(a) * r;
        e.y = this.cy + Math.sin(a) * r;
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
    }
}

/** 宝箱怪：在上半屏左右乱窜，6 秒后向上逃走。 */
class FleeMotion implements Motion {
    private t = 0;
    constructor(private side: number) { }
    update(e: Enemy, dt: number, c: SfCombat): void {
        this.t += dt;
        const px = e.x, py = e.y;
        const top = c.bounds.top;
        if (this.t < 7) {
            const targetY = top - 260 - Math.sin(this.t * 1.3) * 80;
            e.y += (targetY - e.y) * Math.min(1, dt * 2.5);
            e.x = Math.sin(this.t * 1.9 + this.side) * (c.bounds.right - 80);
        } else {
            e.y += 520 * dt;
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
    }
}

function yAt(c: SfCombat, frac: number): number {
    return c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
}

/** 根据编排事件生成编队（DESIGN.md §7.1 的 16 种模板中第 1 章用到的部分）。 */
export function spawnFormation(c: SfCombat, ev: WaveEvent): void {
    const top = c.bounds.top;
    const n = ev.n ?? 1;
    const fireScale = ev.fireScale ?? 1;
    const side = ev.side ?? (ev.x !== undefined && ev.x > 0 ? 1 : -1);
    // 3 只以上的编队计整队全歼；带奖励的小编队（1～2 只的重装单位）同样全歼即掉落。
    const group = n >= 3 || ev.drop ? c.newGroup(ev.drop) : undefined;
    const spawnTop = (def: string) => top + 40 + (def === 'bomber' ? 30 : 0);

    switch (ev.f) {
        case 'column': {
            const x = ev.x ?? 0;
            const speed = ev.speed ?? 250;
            for (let i = 0; i < n; i++) {
                c.schedule(i * (ev.gap ?? 0.32), () => {
                    c.spawnEnemy(ev.e, x, spawnTop(ev.e), new LinearMotion(0, -speed), { group, fireScale });
                });
            }
            break;
        }
        case 'v': {
            const x = ev.x ?? 0;
            const speed = ev.speed ?? 240;
            const spacing = ev.gap ?? 62;
            for (let i = 0; i < n; i++) {
                const rank = Math.ceil(i / 2);
                const dir = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1);
                c.spawnEnemy(ev.e, x + dir * rank * spacing, spawnTop(ev.e) + rank * 46,
                    new LinearMotion(0, -speed), { group, fireScale });
            }
            break;
        }
        case 'row': {
            const x = ev.x ?? 0;
            const spacing = ev.gap ?? 96;
            const targetY = yAt(c, ev.y ?? 0.72);
            for (let i = 0; i < n; i++) {
                const ox = x + (i - (n - 1) / 2) * spacing;
                c.schedule(Math.abs(i - (n - 1) / 2) * 0.08, () => {
                    const e = c.spawnEnemy(ev.e, ox, spawnTop(ev.e), null, { group, fireScale });
                    e.motion = new HoverMotion(e, targetY, ev.hold ?? 1.6, -(ev.speed ?? 200), 0, 6);
                });
            }
            break;
        }
        case 'snake': {
            const s = side;
            const amp = ev.amp ?? 170;
            const path = [
                { x: s * 460, y: top - 60 },
                { x: s * amp, y: top - 200 },
                { x: -s * amp, y: top - 420 },
                { x: s * amp, y: top - 640 },
                { x: -s * amp, y: top - 860 },
                { x: s * amp, y: top - 1080 },
                { x: -s * 200, y: top - 1400 },
            ];
            const duration = (ev.speed ? 1500 / ev.speed : 6.2);
            for (let i = 0; i < n; i++) {
                c.schedule(i * (ev.gap ?? 0.26), () => {
                    c.spawnEnemy(ev.e, path[0].x, path[0].y, new PathMotion(path, duration), { group, fireScale });
                });
            }
            break;
        }
        case 'swoop': {
            const s = side;
            const path = [
                { x: s * 320, y: top + 40 },
                { x: s * 220, y: top - 260 },
                { x: 0, y: top - 520 },
                { x: -s * 220, y: top - 700 },
                { x: -s * 470, y: top - 760 },
            ];
            for (let i = 0; i < n; i++) {
                c.schedule(i * (ev.gap ?? 0.3), () => {
                    c.spawnEnemy(ev.e, path[0].x, path[0].y, new PathMotion(path, ev.speed ? 1300 / ev.speed : 4.4), { group, fireScale });
                });
            }
            break;
        }
        case 'cross': {
            const y = yAt(c, ev.y ?? 0.78);
            const speed = ev.speed ?? 150;
            for (let i = 0; i < n; i++) {
                const s = (ev.side ?? (i % 2 === 0 ? -1 : 1)) as number;
                c.schedule(i * (ev.gap ?? 1.2), () => {
                    const e = c.spawnEnemy(ev.e, s * 470, y - (i % 2) * 70, new LinearMotion(-s * speed, -16), { group, fireScale });
                    e.angle = s > 0 ? -Math.PI / 2 : Math.PI / 2;
                });
            }
            break;
        }
        case 'hover': {
            const spacing = ev.gap ?? 180;
            const x = ev.x ?? 0;
            for (let i = 0; i < n; i++) {
                const ox = x + (i - (n - 1) / 2) * spacing;
                c.schedule(i * 0.25, () => {
                    const e = c.spawnEnemy(ev.e, ox, spawnTop(ev.e), null, { group, fireScale });
                    e.motion = new HoverMotion(e, yAt(c, (ev.y ?? 0.7) - (i % 2) * 0.05), ev.hold ?? 4, 230, 0, 14);
                });
            }
            break;
        }
        case 'float': {
            const spacing = ev.gap ?? 200;
            const x = ev.x ?? 0;
            for (let i = 0; i < n; i++) {
                const ox = x + (i - (n - 1) / 2) * spacing;
                c.schedule(i * 0.45, () => {
                    c.spawnEnemy(ev.e, ox, spawnTop(ev.e), new SineMotion(ox, -(ev.speed ?? 75), ev.amp ?? 26, 0.28, i), { group, fireScale });
                });
            }
            break;
        }
        case 'ground': {
            const spacing = ev.gap ?? 260;
            const x = ev.x ?? 0;
            for (let i = 0; i < n; i++) {
                const ox = x + (i - (n - 1) / 2) * spacing;
                c.schedule(i * 0.9, () => {
                    c.spawnEnemy(ev.e, ox, top + 60, new GroundMotion(ev.speed ?? 0), { group, fireScale });
                });
            }
            break;
        }
        case 'circle': {
            const cx = ev.x ?? 0;
            const cy = top + 140;
            for (let i = 0; i < n; i++) {
                const e = c.spawnEnemy(ev.e, cx, cy, new OrbitMotion(cx, cy, ev.amp ?? 120, Math.PI * 2 * i / n, side * 1.6, -(ev.speed ?? 120)), { group, fireScale });
                e.face = false;
            }
            break;
        }
        case 'scatter': {
            for (let i = 0; i < n; i++) {
                c.schedule(i * (ev.gap ?? 0.4), () => {
                    const x = c.rng.range(c.bounds.left + 60, c.bounds.right - 60);
                    c.spawnEnemy(ev.e, x, spawnTop(ev.e), new LinearMotion(c.rng.range(-30, 30), -(ev.speed ?? 260) * c.rng.range(0.85, 1.15)), { group, fireScale });
                });
            }
            break;
        }
        case 'charge': {
            const spacing = ev.gap ?? 150;
            const x = ev.x ?? 0;
            for (let i = 0; i < n; i++) {
                const ox = x + (i - (n - 1) / 2) * spacing;
                c.schedule(i * 0.35, () => {
                    c.spawnEnemy(ev.e, ox, spawnTop(ev.e), new ChargeMotion(yAt(c, ev.y ?? 0.78) - (i % 2) * 50, 0.8), { group, fireScale });
                });
            }
            break;
        }
        case 'carrier': {
            const s = side;
            const y = yAt(c, ev.y ?? 0.8);
            const e = c.spawnEnemy(ev.e, s * 470, y, new LinearMotion(-s * (ev.speed ?? 120), -10), { drop: ev.drop ?? 'main', fireScale });
            e.angle = s > 0 ? -Math.PI / 2 : Math.PI / 2;
            break;
        }
        case 'elite': {
            const x = ev.x ?? 0;
            const e = c.spawnEnemy(ev.e, x, top + 110, null, { fireScale, drop: ev.drop });
            e.motion = new HoverMotion(e, yAt(c, ev.y ?? 0.74), ev.hold ?? 16, 160, 0, 40, 220);
            if (ev.e === 'anchorship') {
                const left = c.spawnEnemy('anchorship-gen', x, top, null, { parent: e, ox: -62, oy: 6, persistent: true });
                const right = c.spawnEnemy('anchorship-gen', x, top, null, { parent: e, ox: 62, oy: 6, persistent: true });
                left.partTag = right.partTag = 'shield';
                e.shieldParts = [left, right];
            }
            // 精英必掉 2 个零件（DESIGN.md §3）。
            e.drop = e.drop ?? 'wing';
            e.extraDrops = ['special'];
            for (let i = 0; i < n - 1; i++) {
                const s = i % 2 === 0 ? -1 : 1;
                c.schedule(0.6 + i * 0.3, () => {
                    const escort = c.spawnEnemy('raider', x + s * 150, top + 60, null, { fireScale });
                    escort.motion = new HoverMotion(escort, yAt(c, (ev.y ?? 0.74) + 0.06), 6, -240, s * 120, 20);
                });
            }
            break;
        }
        case 'solo': {
            // 只负责放出敌人，走位由敌人自己的行为决定（蜘蛛、布雷机等）；y 可改写悬停高度。
            const spacing = ev.gap ?? 220;
            const x = ev.x ?? 0;
            for (let i = 0; i < n; i++) {
                const ox = Math.max(c.bounds.left + 60, Math.min(c.bounds.right - 60, x + (i - (n - 1) / 2) * spacing));
                c.schedule(i * 0.5, () => {
                    const e = c.spawnEnemy(ev.e, ox, spawnTop(ev.e), null, { group, fireScale });
                    if (ev.y !== undefined) e.data.home = yAt(c, ev.y - (i % 2) * 0.05);
                });
            }
            break;
        }
        case 'pincer': {
            // 左右夹击：两列从两侧上角斜插向中线下方，交错穿过。
            const speed = ev.speed ?? 300;
            for (let i = 0; i < n; i++) {
                const s = i % 2 === 0 ? -1 : 1;
                c.schedule(Math.floor(i / 2) * (ev.gap ?? 0.3), () => {
                    const sx = s * (c.bounds.right + 30), sy = top - 60;
                    const tx = -s * 120, ty = yAt(c, ev.y ?? 0.25);
                    const len = Math.hypot(tx - sx, ty - sy);
                    c.spawnEnemy(ev.e, sx, sy, new LinearMotion((tx - sx) / len * speed, (ty - sy) / len * speed), { group, fireScale });
                });
            }
            break;
        }
        case 'stair': {
            // 阶梯：自一侧起逐个错位下压，形成斜排，停顿后整排下移。
            const s = side;
            const spacing = ev.gap ?? 92;
            for (let i = 0; i < n; i++) {
                const ox = s * (c.bounds.right - 70 - i * spacing);
                c.schedule(i * 0.22, () => {
                    const e = c.spawnEnemy(ev.e, ox, spawnTop(ev.e), null, { group, fireScale });
                    e.motion = new HoverMotion(e, yAt(c, (ev.y ?? 0.82) - i * 0.035), ev.hold ?? 1.6, -(ev.speed ?? 220), 0, 6);
                });
            }
            break;
        }
        case 'escort': {
            // 护航：中间一架主机（ev.e）悬停开火，两侧小贼保持编队同进同退（护航机 ev.escort，默认纸翼小贼）。
            const x = ev.x ?? 0;
            const y = yAt(c, ev.y ?? 0.76);
            const hold = ev.hold ?? 6;
            const lead = c.spawnEnemy(ev.e, x, spawnTop(ev.e) + 30, null, { group, fireScale, drop: ev.drop });
            lead.motion = new HoverMotion(lead, y, hold, 200, 0, 14);
            const escorts = Math.max(0, n - 1);
            for (let i = 0; i < escorts; i++) {
                const s = i % 2 === 0 ? -1 : 1;
                const rank = Math.floor(i / 2) + 1;
                const e = c.spawnEnemy(ev.escort ?? 'raider', x + s * rank * 86, spawnTop(ev.escort ?? 'raider') + rank * 40, null, { group, fireScale });
                e.motion = new HoverMotion(e, y + 40 - rank * 30, hold, 200, 0, 14);
            }
            break;
        }
        case 'edge': {
            // 屏幕左右边缘的地面单位（食人花）：左右交替，随地面卷入。
            for (let i = 0; i < n; i++) {
                const sideX = (ev.side ?? (i % 2 === 0 ? -1 : 1)) * (c.bounds.right - (ev.gap ?? 58));
                c.schedule(i * (ev.hold ?? 1.6), () => {
                    c.spawnEnemy(ev.e, sideX, top + 60, new GroundMotion(0), { group, fireScale });
                });
            }
            break;
        }
        case 'mimic': {
            const s = side;
            c.spawnEnemy(ev.e, s * 300, top + 60, new FleeMotion(s));
            break;
        }
        default: {
            const fn = CONTENT_FORMATIONS[ev.f];
            if (!fn) throw new Error(`Unknown formation: ${ev.f}`);
            fn(c, ev);
        }
    }
}
