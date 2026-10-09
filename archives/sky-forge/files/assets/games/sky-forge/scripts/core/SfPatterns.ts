import type { SfCombat } from './SfCombat';
import type { EnemyBullet } from './SfTypes';

/**
 * 弹幕原语。角度用弧度，0 = 向右，-π/2 = 向下（世界 y 轴向上）。
 * 速度会乘以关卡的弹速倍率；每个弹幕都保证留有缝隙（由调用方的 count/spread 决定）。
 */
export interface ShotStyle {
    kind: string;
    radius: number;
    delay?: number;
    accel?: number;
    turn?: number;
    maxSpeed?: number;
    life?: number;
    fuse?: number;
    burst?: EnemyBullet['burst'];
    /** 到期落地后留下熔岩滩（需要同时设置 fuse）。 */
    pool?: EnemyBullet['pool'];
    /** 碰到屏幕左右边反弹的次数。 */
    bounces?: number;
    /** 飞 stop 秒后原地停住（冻结），通常配合 fuse + burst 碎裂。 */
    stop?: number;
}

export const DOWN = -Math.PI / 2;

export function aimAngle(c: SfCombat, x: number, y: number): number {
    return Math.atan2(c.player.y - y, c.player.x - x);
}

/** 角度插值：沿最短方向从 a 转向 b，t 为比例。 */
export function lerpAngle(a: number, b: number, t: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

/** 点到线段的距离。 */
export function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

export function shoot(c: SfCombat, x: number, y: number, angle: number, speed: number, style: ShotStyle): EnemyBullet {
    const s = speed * c.bulletSpeedScale;
    const accel = style.accel ?? 0;
    return c.spawnEnemyBullet({
        x, y,
        vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        ax: Math.cos(angle) * accel, ay: Math.sin(angle) * accel,
        radius: style.radius, kind: style.kind,
        life: style.life ?? 12, delay: style.delay ?? 0, turn: style.turn ?? 0,
        maxSpeed: style.maxSpeed ?? 0, fuse: style.fuse, burst: style.burst, pool: style.pool,
        bounces: style.bounces, stop: style.stop,
    });
}

/**
 * 抛物线落弹：从 (x, y) 抛向 (tx, ty)，time 秒后落地。落地时按 style.pool 留下熔岩滩、按 style.burst 炸开。
 * 抛射期间子弹先升后降（重力加速度朝下），视图按速度方向旋转贴图；它在空中飞过玩家头顶，
 * 飞行中不伤人（lofted），危险只在落点（落点圈预警）。
 */
export function lob(c: SfCombat, x: number, y: number, tx: number, ty: number, time: number, arc: number,
    style: ShotStyle): EnemyBullet {
    // 竖直方向：y(t) = y + vy t + ½ g t²，要求 y(time) = ty，并在中途比直线高出 arc。
    const g = -8 * arc / (time * time);
    const vy = (ty - y) / time - g * time / 2;
    const vx = (tx - x) / time;
    return c.spawnEnemyBullet({
        x, y, vx, vy, ax: 0, ay: g, radius: style.radius, kind: style.kind, life: time + (style.delay ?? 0) + 0.5,
        delay: style.delay ?? 0, fuse: time, burst: style.burst, pool: style.pool, lofted: true,
    });
}

export function fan(c: SfCombat, x: number, y: number, center: number, count: number, spreadDeg: number,
    speed: number, style: ShotStyle): void {
    if (count <= 1) { shoot(c, x, y, center, speed, style); return; }
    const spread = spreadDeg * Math.PI / 180;
    for (let i = 0; i < count; i++) {
        shoot(c, x, y, center - spread / 2 + spread * i / (count - 1), speed, style);
    }
}

export function aimed(c: SfCombat, x: number, y: number, count: number, spreadDeg: number, speed: number,
    style: ShotStyle): void {
    fan(c, x, y, aimAngle(c, x, y), count, spreadDeg, speed, style);
}

export function ring(c: SfCombat, x: number, y: number, count: number, speed: number, offset: number,
    style: ShotStyle): void {
    for (let i = 0; i < count; i++) shoot(c, x, y, offset + Math.PI * 2 * i / count, speed, style);
}

/** 一条直线上速度递增的子弹串（看起来像一道快速射线）。 */
export function stream(c: SfCombat, x: number, y: number, angle: number, count: number, minSpeed: number,
    maxSpeed: number, style: ShotStyle): void {
    for (let i = 0; i < count; i++) {
        shoot(c, x, y, angle, minSpeed + (maxSpeed - minSpeed) * i / Math.max(1, count - 1), style);
    }
}

/**
 * 横向弹墙：从 y 高度向下推进，gapCenter 附近留出 gapWidth 宽的缺口。
 * spacing 为子弹间距；墙宽覆盖整个战场。
 */
export function wall(c: SfCombat, y: number, gapCenter: number, gapWidth: number, spacing: number, speed: number,
    style: ShotStyle): void {
    const left = c.bounds.left + 12, right = c.bounds.right - 12;
    for (let x = left; x <= right; x += spacing) {
        if (Math.abs(x - gapCenter) < gapWidth / 2) continue;
        shoot(c, x, y, DOWN, speed, style);
    }
}

/** 从顶部随机落下的弹雨。 */
export function rain(c: SfCombat, count: number, speed: number, style: ShotStyle, spreadDeg = 10): void {
    for (let i = 0; i < count; i++) {
        const x = c.rng.range(c.bounds.left + 20, c.bounds.right - 20);
        shoot(c, x, c.bounds.top + 20, DOWN + c.rng.range(-1, 1) * spreadDeg * Math.PI / 180,
            speed * c.rng.range(0.85, 1.15), style);
    }
}

export const STYLE = {
    small: { kind: 'orb-s', radius: 7 } as ShotStyle,
    medium: { kind: 'orb-m', radius: 9 } as ShotStyle,
    large: { kind: 'orb-l', radius: 14 } as ShotStyle,
    needle: { kind: 'needle', radius: 6 } as ShotStyle,
    orange: { kind: 'orb-o', radius: 9 } as ShotStyle,
    orangeSmall: { kind: 'orb-os', radius: 7 } as ShotStyle,
    bubble: { kind: 'bubble', radius: 13 } as ShotStyle,
    ghost: { kind: 'orb-g', radius: 9 } as ShotStyle,
    chain: { kind: 'chain', radius: 9 } as ShotStyle,
    diamond: { kind: 'diamond', radius: 8 } as ShotStyle,
    star: { kind: 'star', radius: 9 } as ShotStyle,
    ring: { kind: 'ring', radius: 10 } as ShotStyle,
    /** 第 4 章：熔岩团（落地成滩）与碎石。 */
    ember: { kind: 'ember', radius: 10 } as ShotStyle,
    rock: { kind: 'rock', radius: 8 } as ShotStyle,
    /** 第 5 章：冰片（会弹墙）与大雪球（落地成冰面）。 */
    shard: { kind: 'iceshard', radius: 8 } as ShotStyle,
    snowball: { kind: 'snowball', radius: 14 } as ShotStyle,
    /** 第 6 章：虚空弹（酸绿光球）、虚空针与大星弹（在深紫星空上最醒目的颜色）。 */
    voidorb: { kind: 'voidorb', radius: 9 } as ShotStyle,
    voidneedle: { kind: 'voidneedle', radius: 6 } as ShotStyle,
    voidstar: { kind: 'voidstar', radius: 12 } as ShotStyle,
};

/**
 * 公转弹：从 (cx, cy) 外 r 处、角度 a 出生，以角速度 w（弧度/秒，正值逆时针）绕圆心公转，
 * 半径每秒变化 dr（负值收缩，收到圆心消失）。delay 秒内停在出生点闪烁预警。
 */
export function orbitShot(c: SfCombat, cx: number, cy: number, r: number, a: number, w: number, dr: number,
    style: ShotStyle): EnemyBullet {
    return c.spawnEnemyBullet({
        x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, radius: style.radius, kind: style.kind,
        life: style.life ?? 12, delay: style.delay ?? 0, orbit: { cx, cy, r, a, w, dr },
    });
}
