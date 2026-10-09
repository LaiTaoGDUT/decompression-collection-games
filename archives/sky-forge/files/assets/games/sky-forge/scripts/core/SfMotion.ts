import type { Enemy } from './SfEnemies';
import type { SfCombat } from './SfCombat';

/** 敌人移动控制器。返回 false 表示路径走完（敌人离场）。 */
export interface Motion {
    update(e: Enemy, dt: number, c: SfCombat): boolean | void;
}

/** 匀速直线，可选加速度。 */
export class LinearMotion implements Motion {
    constructor(private vx: number, private vy: number, private ax = 0, private ay = 0) { }
    update(e: Enemy, dt: number): void {
        this.vx += this.ax * dt; this.vy += this.ay * dt;
        e.x += this.vx * dt; e.y += this.vy * dt;
        e.vx = this.vx; e.vy = this.vy;
    }
}

/** 向下推进，同时左右正弦摆动（蛇形、飘落）。 */
export class SineMotion implements Motion {
    private t = 0;
    constructor(private baseX: number, private vy: number, private amp: number, private freq: number,
        private phase = 0, private vx = 0) { }
    update(e: Enemy, dt: number): void {
        this.t += dt;
        this.baseX += this.vx * dt;
        const px = e.x;
        const py = e.y;
        e.x = this.baseX + Math.sin(this.t * this.freq * Math.PI * 2 + this.phase) * this.amp;
        e.y += this.vy * dt;
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
    }
}

/**
 * 按路径点飞行（Catmull-Rom 平滑），duration 秒走完全程。
 * 用于 V 字俯冲、侧翼弧线、交叉飞行。路径坐标是世界坐标。
 */
export class PathMotion implements Motion {
    private t = 0;
    private readonly lengths: number[] = [];
    private readonly total: number;
    constructor(private readonly points: { x: number; y: number }[], private readonly duration: number,
        private readonly ease: 'linear' | 'inOut' = 'linear') {
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            this.lengths.push(total);
        }
        this.total = Math.max(1, total);
    }
    update(e: Enemy, dt: number): boolean {
        this.t += dt;
        let u = Math.min(1, this.t / this.duration);
        if (this.ease === 'inOut') u = u * u * (3 - 2 * u);
        const d = u * this.total;
        let seg = 0;
        while (seg < this.lengths.length - 1 && this.lengths[seg] < d) seg++;
        const start = seg === 0 ? 0 : this.lengths[seg - 1];
        const len = this.lengths[seg] - start || 1;
        const local = (d - start) / len;
        const p0 = this.points[Math.max(0, seg - 1)];
        const p1 = this.points[seg];
        const p2 = this.points[seg + 1];
        const p3 = this.points[Math.min(this.points.length - 1, seg + 2)];
        const px = e.x, py = e.y;
        e.x = catmull(p0.x, p1.x, p2.x, p3.x, local);
        e.y = catmull(p0.y, p1.y, p2.y, p3.y, local);
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        return this.t < this.duration;
    }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 进场到指定高度悬停一段时间（带轻微晃动），然后离场。 */
export class HoverMotion implements Motion {
    private t = 0;
    private phase: 'enter' | 'hold' | 'exit' = 'enter';
    private readonly startX: number;
    constructor(e: Enemy, private targetY: number, private hold: number, private exitVy = -260,
        private exitVx = 0, private wobble = 12, private enterSpeed = 340) {
        this.startX = e.x;
    }
    update(e: Enemy, dt: number): void {
        this.t += dt;
        const px = e.x, py = e.y;
        if (this.phase === 'enter') {
            const dy = this.targetY - e.y;
            const step = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(60, Math.abs(dy) * 4) * dt, this.enterSpeed * dt);
            e.y += step;
            if (Math.abs(dy) < 2) { this.phase = 'hold'; this.t = 0; }
        } else if (this.phase === 'hold') {
            e.x = this.startX + Math.sin(this.t * 1.7) * this.wobble;
            e.y = this.targetY + Math.sin(this.t * 2.3) * this.wobble * 0.4;
            if (this.t >= this.hold) { this.phase = 'exit'; this.t = 0; }
        } else {
            e.x += this.exitVx * dt * Math.min(1, this.t * 2);
            e.y += this.exitVy * dt * Math.min(1, this.t * 2);
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
    }
}

/** 地面 / 海面目标：跟随背景卷动，可横向缓慢漂移。 */
export class GroundMotion implements Motion {
    constructor(private drift = 0) { }
    update(e: Enemy, dt: number, c: SfCombat): void {
        e.x += this.drift * dt;
        e.y -= c.scrollSpeed * dt;
        e.vx = this.drift; e.vy = -c.scrollSpeed;
    }
}

/** 自爆冲锋：入场、停顿瞄准（显示锁定线）、高速冲向玩家当时的位置。 */
export class ChargeMotion implements Motion {
    private t = 0;
    private phase: 'enter' | 'aim' | 'dash' = 'enter';
    private dirX = 0;
    private dirY = -1;
    constructor(private targetY: number, private aim = 0.7, private dashSpeed = 760) { }
    update(e: Enemy, dt: number, c: SfCombat): void {
        this.t += dt;
        const px = e.x, py = e.y;
        if (this.phase === 'enter') {
            e.y += (this.targetY - e.y) * Math.min(1, dt * 4);
            if (Math.abs(this.targetY - e.y) < 6) { this.phase = 'aim'; this.t = 0; }
        } else if (this.phase === 'aim') {
            const dx = c.player.x - e.x, dy = c.player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            this.dirX = dx / len; this.dirY = dy / len;
            e.aimX = this.dirX; e.aimY = this.dirY;
            e.windup = Math.max(e.windup, 0.12);
            if (this.t >= this.aim) {
                this.phase = 'dash'; this.t = 0; e.aimX = 0; e.aimY = 0;
                c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'dash' });
            }
        } else {
            const speed = this.dashSpeed * Math.min(1, 0.35 + this.t * 2.5);
            e.x += this.dirX * speed * dt; e.y += this.dirY * speed * dt;
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
    }
}

/** 静止（由 Boss 脚本或父节点直接设置坐标）。 */
export class ScriptMotion implements Motion {
    update(): void { }
}
