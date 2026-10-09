import { Node, Sprite, UIOpacity } from 'cc';
import { color, node, size, texScale, type UiContext } from './SfUi';

interface Particle {
    node: Node;
    sprite: Sprite;
    op: UIOpacity;
    active: boolean;
    x: number; y: number;
    vx: number; vy: number;
    drag: number;
    gravity: number;
    t: number;
    delay: number;
    life: number;
    frames?: string[];
    frameIndex: number;
    sx0: number; sx1: number;
    sy0: number; sy1: number;
    rot: number;
    spin: number;
    fade: boolean;
    alpha: number;
}

export type SparkColor = 'metal' | 'wood' | 'balloon' | 'flesh' | 'shield' | 'graze' | 'gold' | 'fire' | 'buff' | 'hurt';

const SPARK_HEX: Record<SparkColor, string[]> = {
    metal: ['#FFF6C8', '#FFD45C', '#FF9A3C'],
    wood: ['#FFC37A', '#C9773A', '#7A4422'],
    balloon: ['#FFB0A8', '#FF5A5A', '#B02A3A'],
    flesh: ['#D7FF9A', '#7BE07A', '#3A9A5A'],
    shield: ['#E8FBFF', '#8FE3FF', '#3F9BFF'],
    graze: ['#FFFFFF', '#C8F4FF', '#8CECFF'],
    gold: ['#FFF7B0', '#FFD45C', '#E8A020'],
    fire: ['#FFF3B0', '#FFB040', '#FF5A2A'],
    buff: ['#FFB43C', '#FFE38A', '#FFFFFF'],
    hurt: ['#FF3A5A', '#FF8A9A', '#FFFFFF'],
};

const EXPLO = ['fx/explo-0', 'fx/explo-1', 'fx/explo-2', 'fx/explo-3', 'fx/explo-4', 'fx/explo-5', 'fx/explo-6', 'fx/explo-7'];
const SMOKE = ['fx/smoke-0', 'fx/smoke-1', 'fx/smoke-2', 'fx/smoke-3'];
const SPARK = ['fx/spark-0', 'fx/spark-1', 'fx/spark-2', 'fx/spark-3'];
/** tidal-wings 主爆炸直径（360 宽参考 × 750/360）与时长。 */
const BLAST_SIZE = [0, 72, 100, 138, 200, 300];
const BLAST_LIFE = [0, 0.26, 0.34, 0.4, 0.5, 0.62];

/** 战斗特效：对象池化的帧动画、碎片、光晕、冲击环（贴图 1:1 平滑显示）。 */
export class SfFx {
    private readonly particles: Particle[] = [];
    private readonly layer: Node;

    constructor(private readonly ui: UiContext, parent: Node) {
        this.layer = node(parent, 'Fx');
    }

    private take(): Particle {
        for (const p of this.particles) if (!p.active) return p;
        if (this.particles.length >= 480) {
            let oldest = this.particles[0];
            for (const p of this.particles) if (p.t / p.life > oldest.t / oldest.life) oldest = p;
            return oldest;
        }
        const n = node(this.layer, 'P', 8, 8);
        const s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM;
        s.trim = false;
        const op = n.addComponent(UIOpacity);
        const p: Particle = {
            node: n, sprite: s, op, active: false, x: 0, y: 0, vx: 0, vy: 0, drag: 0, gravity: 0, t: 0, delay: 0, life: 1,
            frameIndex: -1, sx0: 1, sx1: 1, sy0: 1, sy1: 1, rot: 0, spin: 0, fade: true, alpha: 1,
        };
        this.particles.push(p);
        return p;
    }

    /** w/h 为显示尺寸（设计像素）；不传则按贴图原始尺寸。 */
    spawn(key: string, x: number, y: number, opts: {
        vx?: number; vy?: number; life?: number; w?: number; h?: number; scale?: number; scaleEnd?: number;
        flatten?: number; frames?: string[]; drag?: number; gravity?: number; rot?: number; spin?: number;
        tint?: string; fade?: boolean; alpha?: number; delay?: number;
    } = {}): void {
        const frameKey = opts.frames ? opts.frames[0] : key;
        const frame = this.ui.frame(frameKey);
        if (!frame) return;
        const p = this.take();
        p.active = true;
        p.node.active = (opts.delay ?? 0) <= 0;
        p.sprite.spriteFrame = frame;
        const k = texScale(frameKey);
        const w = opts.w ?? frame.originalSize.width * k;
        const h = opts.h ?? frame.originalSize.height * k;
        size(p.node, w, h);
        p.sprite.color = color(opts.tint ?? '#FFFFFF');
        p.x = x; p.y = y;
        p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0;
        p.drag = opts.drag ?? 0;
        p.gravity = opts.gravity ?? 0;
        p.t = 0;
        p.delay = opts.delay ?? 0;
        p.life = opts.life ?? 0.5;
        p.frames = opts.frames;
        p.frameIndex = 0;
        const s0 = opts.scale ?? 1, s1 = opts.scaleEnd ?? s0, fl = opts.flatten ?? 1;
        p.sx0 = s0; p.sx1 = s1; p.sy0 = s0 * fl; p.sy1 = s1 * fl;
        p.rot = opts.rot ?? 0;
        p.spin = opts.spin ?? 0;
        p.fade = opts.fade ?? !opts.frames;
        p.alpha = opts.alpha ?? 1;
        p.op.opacity = Math.round(p.alpha * 255);
        p.node.setSiblingIndex(this.layer.children.length - 1);
        this.place(p);
    }

    private place(p: Particle): void {
        const k = Math.min(1, p.t / p.life);
        const e = 1 - Math.pow(1 - k, 3);
        p.node.setPosition(p.x, p.y);
        p.node.setScale(p.sx0 + (p.sx1 - p.sx0) * e, p.sy0 + (p.sy1 - p.sy0) * e, 1);
        p.node.setRotationFromEuler(0, 0, p.rot);
    }

    /** 分级爆炸：size 0 = 清弹闪光，1～5 = 小怪到 Boss（tidal-wings 尺寸表）。 */
    explosion(x: number, y: number, level: number, palette: SparkColor = 'fire', delay = 0): void {
        if (level <= 0) {
            this.spawn(SPARK[0], x, y, { frames: SPARK, life: 0.2, w: 22, h: 22, tint: '#FFD8EC', delay });
            return;
        }
        const l = Math.min(5, level);
        const d = BLAST_SIZE[l];
        this.spawn('fx/flash', x, y, { life: 0.14, w: d * 1.1, h: d * 1.1, scale: 0.7, scaleEnd: 1.25, alpha: 0.9, delay });
        this.spawn(EXPLO[0], x, y, { frames: EXPLO, life: BLAST_LIFE[l] + 0.12, w: d, h: d, rot: Math.random() * 360, delay });
        if (l >= 2) {
            for (let i = 0; i < l - 1; i++) {
                const a = Math.random() * Math.PI * 2, r = d * 0.25 * Math.random();
                this.spawn(EXPLO[0], x + Math.cos(a) * r, y + Math.sin(a) * r, { frames: EXPLO, life: 0.32, w: d * 0.6, h: d * 0.6, rot: Math.random() * 360, delay: delay + 0.03 * i });
            }
            for (let i = 0; i < 2 + l; i++) {
                const a = Math.random() * Math.PI * 2;
                this.spawn(SMOKE[0], x, y, {
                    frames: SMOKE, life: 0.8 + Math.random() * 0.5, vx: Math.cos(a) * 46, vy: Math.sin(a) * 46 + 26, drag: 1.4,
                    w: d * 0.42, h: d * 0.42, scale: 1, scaleEnd: 1.6, fade: true, alpha: 0.85, delay,
                });
            }
        }
        this.debris(x, y, [0, 8, 14, 22, 30, 44][l], 150 + l * 70, palette, delay);
    }

    debris(x: number, y: number, count: number, speed: number, palette: SparkColor, delay = 0): void {
        const hex = SPARK_HEX[palette];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = speed * (0.35 + Math.random() * 0.85);
            const big = Math.random() < 0.3;
            this.spawn(Math.random() < 0.5 ? 'fx/dot' : 'fx/chip', x, y, {
                vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: 0.35 + Math.random() * 0.45, gravity: 120,
                tint: hex[i % hex.length], scale: big ? 1.6 : 1, spin: (Math.random() - 0.5) * 900, delay,
            });
        }
    }

    spark(x: number, y: number, palette: SparkColor, big = false): void {
        const hex = SPARK_HEX[palette];
        this.spawn(SPARK[0], x, y, { frames: SPARK, life: 0.14, w: big ? 40 : 26, h: big ? 40 : 26, tint: hex[0], rot: Math.random() * 360 });
        for (let i = 0; i < (big ? 4 : 2); i++) {
            const a = Math.PI / 2 + (Math.random() - 0.5) * 2.6;
            const v = 120 + Math.random() * 180;
            this.spawn('fx/dot', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4, life: 0.22, tint: hex[1 + (i % 2)] });
        }
    }

    /** tidal-wings 的压力波：扁平椭圆环随 easeOutCubic 扩张并淡出。 */
    wave(x: number, y: number, radius: number, life: number, flatten: number, tint: string, delay = 0): void {
        this.spawn('fx/wave', x, y, { life, w: radius * 2, h: radius * 2, scale: 0.05, scaleEnd: 1, flatten, tint, alpha: 0.82, delay, fade: true });
    }

    ring(x: number, y: number, from: number, to: number, life = 0.35, tint = '#FFFFFF'): void {
        this.spawn('fx/ring', x, y, { life, w: 128, h: 128, scale: from / 128, scaleEnd: to / 128, tint });
    }

    glow(x: number, y: number, diameter: number, tint: string, life = 0.25, alpha = 0.8): void {
        this.spawn('fx/glow', x, y, { life, w: diameter, h: diameter, scale: 0.6, scaleEnd: 1.2, tint, alpha });
    }

    update(dt: number): void {
        for (const p of this.particles) {
            if (!p.active) continue;
            if (p.delay > 0) {
                p.delay -= dt;
                if (p.delay > 0) continue;
                p.node.active = true;
            }
            p.t += dt;
            if (p.t >= p.life) { p.active = false; p.node.active = false; continue; }
            const damp = Math.exp(-p.drag * dt);
            p.vx *= damp; p.vy *= damp;
            p.vy -= p.gravity * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.rot += p.spin * dt;
            if (p.frames) {
                const index = Math.min(p.frames.length - 1, Math.floor(p.t / p.life * p.frames.length));
                if (index !== p.frameIndex) {
                    p.frameIndex = index;
                    const f = this.ui.frame(p.frames[index]);
                    if (f) p.sprite.spriteFrame = f;
                }
            }
            if (p.fade) p.op.opacity = Math.round(255 * p.alpha * Math.min(1, (1 - p.t / p.life) * 1.6));
            this.place(p);
        }
    }

    clear(): void {
        for (const p of this.particles) { p.active = false; p.node.active = false; }
    }
}

/**
 * tidal-wings 镜头（fs / Nn）：shake 每秒衰减 26，踢动乘 max(0,1-dt×18)，
 * 曝光每秒衰减 2.6；数值按参考 360 宽乘 750/360。
 */
export class Camera2D {
    shake = 0;
    kickX = 0;
    kickY = 0;
    flash = 0;
    gold = false;
    hit = 0;
    x = 0;
    y = 0;
    private readonly unit = 750 / 360;

    killShake(combo: number, tier: number, boss: boolean, chain: number): void {
        const comboTier = combo >= 15 ? 3 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0;
        const extra = Math.min(3, Math.max(0, chain - 1));
        this.shake = Math.max(this.shake, boss ? 13 : 4 + comboTier * 0.7 + tier * 0.8 + extra * 0.35);
        this.flash = Math.max(this.flash, boss ? 0.46 : 0.035 + tier * 0.025 + extra * 0.006);
        this.gold = boss || tier >= 2;
    }

    kickToward(fromX: number, fromY: number, toX: number, toY: number, strength: number): void {
        const dx = fromX - toX, dy = fromY - toY, len = Math.max(1, Math.hypot(dx, dy));
        this.kickX = Math.max(-7, Math.min(7, this.kickX + dx / len * strength));
        this.kickY = Math.max(-7, Math.min(7, this.kickY + dy / len * strength));
    }

    update(dt: number): void {
        this.shake = Math.max(0, this.shake - dt * 26);
        const decay = Math.max(0, 1 - dt * 18);
        this.kickX *= decay;
        this.kickY *= decay;
        if (dt > 0) {
            this.x = Math.round((this.kickX + (this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0)) * this.unit);
            this.y = Math.round((this.kickY + (this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0)) * this.unit);
        }
        this.flash = Math.max(0, this.flash - dt * 2.6);
        this.hit = Math.max(0, this.hit - dt * 3.6);
    }

    reset(): void {
        this.shake = this.kickX = this.kickY = this.flash = this.hit = this.x = this.y = 0;
    }
}

/** tidal-wings 受击果冻：cos(t×4π)×(1-t)^1.35，±0.18×力度，竖直位移 sin(πt)×6×力度。 */
export function jelly(remaining: number, duration: number, strength: number, boss = false): { x: number; y: number; offsetY: number } {
    if (remaining <= 0 || duration <= 0) return { x: 1, y: 1, offsetY: 0 };
    const t = Math.max(0, Math.min(1, 1 - remaining / duration));
    const force = Math.max(0, Math.min(1, strength)) * (boss ? 0.5 : 1);
    const wave = Math.cos(t * Math.PI * 4) * Math.pow(1 - t, 1.35);
    const amount = 0.18 * force;
    return { x: 1 + amount * wave, y: 1 - amount * wave, offsetY: Math.sin(t * Math.PI) * 6 * force };
}

/** tidal-wings 侧偏：目标 clamp(vx/speed, ±0.92)，进入 / 回正速率 20 / 13。 */
export function bankToward(current: number, vx: number, speed: number, dt: number): number {
    const target = Math.max(-0.92, Math.min(0.92, vx / Math.max(1, speed)));
    const rate = Math.abs(target) > Math.abs(current) ? 20 : 13;
    return current + (target - current) * (1 - Math.exp(-rate * dt));
}
