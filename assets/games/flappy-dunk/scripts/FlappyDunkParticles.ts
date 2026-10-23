import { Color, gfx, Material, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { dunkCurve, type DunkCurveKey } from './FlappyDunkConfig';

interface Curve { mode: number; min: number; max: number; keys: DunkCurveKey[]; minKeys: DunkCurveKey[]; }
interface Gradient { colors: number[][]; alpha: number[][]; }
interface Tint { mode: number; min: number[]; max: number[]; gradient: Gradient; minGradient: Gradient; }
interface Transform { position: number[]; scale: number[]; rotation: number[]; }
interface Shape { enabled: boolean; type: number; radius: number; thickness: number; angle: number;
    arc: number; arcMode: number; donut: number; position: number[]; scale: number[]; rotation: number[]; }
interface Spec {
    name: string; source: number; active: boolean; frame: string; additive: boolean; aspect: number; transforms: Transform[];
    duration: number; loop: boolean; world: boolean; scaling: number; rate: Curve; distance: Curve;
    bursts: { time: number; count: Curve; cycles: number; interval: number; probability: number }[];
    life: Curve; speed: Curve; size: Curve; sizeY?: Curve; rotation: Curve; color: Tint; gravity: Curve;
    sizeLife?: Curve; sizeLifeY?: Curve; colorLife?: Tint; angular?: Curve;
    velocity?: Curve[]; velocityWorld: boolean; drag?: Curve; dragBySize: boolean; dragByVelocity: boolean;
    limit?: Curve; dampen: number; shape: Shape; order: number; renderMode: number; alignment: number;
    velocityScale: number; lengthScale: number;
    noise?: { strength: { scalar: number }; frequency: number; damping: boolean; octaves: number; octaveMultiplier: number; octaveScale: number };
}
export type DunkParticleConfig = Readonly<Record<string, readonly Spec[]>>;
export type DunkParticlePalette = Readonly<Record<string, { readonly tint: readonly string[]; readonly life?: readonly string[];
    readonly glow?: number; readonly size?: number; readonly spread?: number;
    /** Build this group from another source group instead (a recoloured copy, e.g. gold sparks from the moon sparks). */
    readonly source?: string }>>;

function rgb(value: string): number[] {
    return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
}
/** Spread palette colours over gradient keys by position; alpha keys and timing stay untouched. */
function recolorGradient(g: Gradient, colors: readonly string[]): Gradient {
    return { ...g, colors: g.colors.map((key, i) => {
        const c = rgb(colors[Math.round(i * (colors.length - 1) / Math.max(1, g.colors.length - 1))]);
        return [key[0], c[0], c[1], c[2], ...key.slice(4)];
    }) };
}
/** Scale a curve's values in every mode (constant, random-between, curve keys and their tangents). */
function scaleCurve(c: Curve, k: number): Curve {
    const keys = (list: DunkCurveKey[]) => list.map((key): DunkCurveKey => [key[0], key[1] * k, key[2] * k, key[3] * k, key[4], key[5], key[6]]);
    return { ...c, min: c.min * k, max: c.max * k, keys: keys(c.keys), minKeys: keys(c.minKeys) };
}
/** Restyle source particle groups to a theme palette; timing curves always stay the source values.
 * `glow` scales the start alpha of additive emitters, `size` the start size and `spread` how far
 * particles travel from their emitter (start speed, noise drift and emission radius). */
export function recolorDunkParticles(config: DunkParticleConfig, palette: DunkParticlePalette): DunkParticleConfig {
    const result: Record<string, readonly Spec[]> = {};
    const groups = Object.keys(config).concat(Object.keys(palette).filter(key => palette[key].source && !config[key]));
    groups.forEach(group => {
        const p = palette[group], source = config[p?.source ?? group];
        if (!source) throw new Error(`Unknown particle source group for ${group}`);
        result[group] = !p ? source : source.map(spec => {
            const low = rgb(p.tint[0]), high = rgb(p.tint[p.tint.length - 1]), glow = spec.additive ? p.glow ?? 1 : 1;
            const color: Tint = { ...spec.color, min: [...low, spec.color.min[3] * glow], max: [...high, spec.color.max[3] * glow],
                gradient: recolorGradient(spec.color.gradient, p.life ?? p.tint),
                minGradient: recolorGradient(spec.color.minGradient, p.life ?? p.tint) };
            const colorLife = spec.colorLife && p.life ? { ...spec.colorLife,
                gradient: recolorGradient(spec.colorLife.gradient, p.life),
                minGradient: recolorGradient(spec.colorLife.minGradient, p.life) } : spec.colorLife;
            const size = p.size ?? 1, spread = p.spread ?? 1;
            return { ...spec, color, colorLife,
                size: scaleCurve(spec.size, size), sizeY: spec.sizeY && scaleCurve(spec.sizeY, size),
                speed: scaleCurve(spec.speed, spread), shape: { ...spec.shape, radius: spec.shape.radius * spread },
                noise: spec.noise && { ...spec.noise, strength: { ...spec.noise.strength, scalar: spec.noise.strength.scalar * spread } } };
        });
    });
    return result;
}
export interface DunkParticleAnchor { x: number; y: number; angle?: number; scale?: number; }
interface Point { x: number; y: number; z: number; }
interface Prepared { spec: Spec; matrix: number[]; shape: number[]; }
interface Emitter { data: Prepared; anchor: DunkParticleAnchor; previous: DunkParticleAnchor; age: number;
    carry: number; emitting: boolean; pooled: boolean; touched: boolean; liveParticles: number; }
interface View { node: Node; sprite: Sprite; ui: UITransform; }
interface Particle { emitter: Emitter; pos: Point; velocity: Point; extra: Point; age: number; total: number;
    width: number; height: number; rotation: number; gravity: number; tint: number[]; random: number; view: View; }
const DEG = Math.PI / 180;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const value = (c: Curve, t: number, random = Math.random()): number => c.mode === 0 ? c.max : c.mode === 3 ? lerp(c.min, c.max, random)
    : c.mode === 1 ? c.max * dunkCurve(c.keys, t) : lerp(c.min * dunkCurve(c.minKeys, t), c.max * dunkCurve(c.keys, t), random);
const point = (x = 0, y = 0, z = 0): Point => ({ x, y, z });
function transform(m: number[], p: Point, vector = false): Point {
    return point(m[0] * p.x + m[1] * p.y + m[2] * p.z + (vector ? 0 : m[3]),
        m[4] * p.x + m[5] * p.y + m[6] * p.z + (vector ? 0 : m[7]),
        m[8] * p.x + m[9] * p.y + m[10] * p.z + (vector ? 0 : m[11]));
}
function multiply(a: number[], b: number[]): number[] {
    const out: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out[r * 4 + c] =
        a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
    return out;
}
function matrix(t: Transform): number[] {
    const [x, y, z, w] = t.rotation, [sx, sy, sz] = t.scale;
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y - z * w) * sy, 2 * (x * z + y * w) * sz, t.position[0],
        2 * (x * y + z * w) * sx, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z - x * w) * sz, t.position[1],
        2 * (x * z - y * w) * sx, 2 * (y * z + x * w) * sy, (1 - 2 * (x * x + y * y)) * sz, t.position[2]];
}
function shapeMatrix(s: Shape): number[] {
    // Unity's Z-X-Y Euler order. These prefabs use a single rotated axis.
    let out = IDENTITY;
    for (const axis of [1, 0, 2]) {
        const q = [0, 0, 0, Math.cos(s.rotation[axis] * DEG / 2)]; q[axis] = Math.sin(s.rotation[axis] * DEG / 2);
        out = multiply(out, matrix({ position: [0, 0, 0], scale: [1, 1, 1], rotation: q }));
    }
    out = multiply(out, matrix({ position: [0, 0, 0], scale: s.scale, rotation: [0, 0, 0, 1] }));
    out[3] = s.position[0]; out[7] = s.position[1]; out[11] = s.position[2]; return out;
}
function anchorPoint(p: Point, a: DunkParticleAnchor, vector = false, out = point()): Point {
    const c = Math.cos((a.angle ?? 0) * DEG), s = Math.sin((a.angle ?? 0) * DEG), scale = a.scale ?? 1;
    const x = (c * p.x - s * p.y) * scale + (vector ? 0 : a.x);
    const y = (s * p.x + c * p.y) * scale + (vector ? 0 : a.y);
    out.x = x; out.y = y; out.z = p.z * scale; return out;
}
function sampleGradient(keys: number[][], channel: number, t: number): number {
    if (t <= keys[0][0]) return keys[0][channel];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][channel], keys[i][channel],
        (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
    return keys[keys.length - 1][channel];
}
function gradient(g: Gradient, t: number, out: number[]): number[] {
    for (let i = 0; i < 4; i++) out[i] = sampleGradient(i === 3 ? g.alpha : g.colors, i === 3 ? 1 : i + 1, t);
    return out;
}
function tint(c: Tint, t: number, random: number, out = [0, 0, 0, 0]): number[] {
    if (c.mode === 1 || c.mode === 4) return gradient(c.gradient, c.mode === 4 ? random : t, out);
    for (let i = 0; i < 4; i++) {
        if (c.mode === 0) out[i] = c.max[i];
        else if (c.mode === 2) out[i] = lerp(c.min[i], c.max[i], random);
        else {
            const channel = i === 3 ? 1 : i + 1;
            const a = sampleGradient(i === 3 ? c.minGradient.alpha : c.minGradient.colors, channel, t);
            const b = sampleGradient(i === 3 ? c.gradient.alpha : c.gradient.colors, channel, t);
            out[i] = lerp(a, b, random);
        }
    }
    return out;
}

// Coherent gradient noise provides the motion of Unity's native NoiseModule.
// Its random field is renderer-specific; the original amplitudes, frequencies,
// damping and octave parameters remain serialized in the source config.
function noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (a: number, b: number, u: number, v: number) => {
        let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177);
        switch ((h ^ h >>> 16) & 7) {
            case 0: return u + v; case 1: return u - v; case 2: return -u + v; case 3: return -u - v;
            case 4: return u; case 5: return -u; case 6: return v; default: return -v;
        }
    };
    return lerp(lerp(grad(ix, iy, dx, dy), grad(ix + 1, iy, dx - 1, dy), fade(dx)),
        lerp(grad(ix, iy + 1, dx, dy - 1), grad(ix + 1, iy + 1, dx - 1, dy - 1), fade(dx)), fade(dy));
}

/** Source particle lifetimes, bursts, 3D emission planes and gradients projected
 * into the masked Cocos 2D world. All particle nodes share the game's owned atlas.
 */
export class FlappyDunkParticles {
    private readonly prepared = new Map<string, Prepared[]>();
    private readonly loops = new Map<string, Emitter[]>();
    private readonly emitters: Emitter[] = [];
    private readonly particles: Particle[] = [];
    private readonly free: View[] = [];
    private readonly layers = new Map<number, Node>();
    private readonly additive: Material;
    private readonly drawPosition = point();
    private readonly drawVelocity = point();
    private readonly noisePosition = point();
    private readonly drawTint = [1, 1, 1, 1];
    private readonly drawColor = new Color();
    get count(): number { return this.particles.length; }
    constructor(config: DunkParticleConfig, private readonly frames: Readonly<Record<string, SpriteFrame>>,
        private readonly back: Node, private readonly front: Node, baseMaterial: Material,
        private readonly assets: AssetService, private readonly bundle: string) {
        this.additive = assets.trackRuntimeAsset(bundle, new Material());
        // Copy the actual UI renderer shader. Engine effect names include their
        // asset directory in preview and cannot be guessed from the filename.
        this.additive.copy(baseMaterial, { states: { blendState: { targets: [{ blend: true,
            blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE,
            blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA, blendDstAlpha: gfx.BlendFactor.ONE }] } } });
        Object.keys(config).forEach(group => this.prepared.set(group, config[group].filter(s => s.active).map(spec => {
            if (!frames[spec.frame]) throw new Error(`Missing native Flappy Dunk particle sprite: ${spec.frame}`);
            let m = IDENTITY;
            spec.transforms.forEach((t, i) => { m = multiply(m, matrix(i === 0 && /^(jump|score|swish|power)$/.test(group)
                ? { ...t, position: [0, 0, 0] } : t)); });
            return { spec, matrix: m, shape: shapeMatrix(spec.shape) };
        })));
    }
    play(group: string, anchor: DunkParticleAnchor): void { this.create(group, anchor, false); }
    beginFrame(): void { this.loops.forEach(es => es.forEach(e => { e.touched = false; })); }
    loop(key: string, group: string, anchor: DunkParticleAnchor): void {
        let es = this.loops.get(key);
        if (es && es[0]?.data !== this.prepared.get(group)?.[0]) { es.forEach(e => { e.emitting = false; }); this.loops.delete(key); es = undefined; }
        if (!es) { es = this.create(group, anchor, true); if (es.length) this.loops.set(key, es); }
        es.forEach(e => { e.anchor = anchor; e.touched = true; });
    }
    advance(dt: number): void {
        this.loops.forEach((es, key) => {
            if (es.some(e => !e.touched)) { es.forEach(e => { e.emitting = false; }); this.loops.delete(key); }
        });
        for (const e of this.emitters) {
            if (!e.emitting) continue;
            const s = e.data.spec, before = e.age; e.age += dt;
            const end = e.pooled ? e.age : Math.min(s.duration, e.age), t = (before % s.duration) / s.duration;
            if (before <= end) {
                e.carry += value(s.rate, t) * (end - before) + value(s.distance, t) * Math.hypot(e.anchor.x - e.previous.x, e.anchor.y - e.previous.y);
                const count = Math.floor(e.carry); e.carry -= count;
                for (let j = 0; j < count; j++) this.emit(e, j, count, t, dt * (1 - j / Math.max(1, count)), dt);
                for (const b of s.bursts) for (let j = 0; j < b.cycles; j++) {
                    const at = b.time + j * b.interval;
                    if ((at > before || before === 0 && at === 0) && at <= end && Math.random() <= b.probability) {
                        const n = Math.round(value(b.count, at / s.duration));
                        for (let i = 0; i < n; i++) this.emit(e, i, n, at / s.duration, Math.max(0, e.age - at), dt);
                    }
                }
            }
            e.previous.x = e.anchor.x; e.previous.y = e.anchor.y;
            e.previous.angle = e.anchor.angle; e.previous.scale = e.anchor.scale;
            if (!e.pooled && e.age >= s.duration) e.emitting = false;
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i], s = p.emitter.data.spec, step = Math.max(0, Math.min(dt, dt + p.age)); p.age += dt;
            if (p.age >= p.total) { p.emitter.liveParticles--; this.recycle(p.view); this.particles.splice(i, 1); continue; }
            const t = p.age / p.total;
            const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
            if (s.drag) {
                let drag = value(s.drag, t, p.random);
                if (s.dragBySize) drag *= p.width;
                if (s.dragByVelocity) drag *= speed;
                const factor = Math.max(0, 1 - drag * step);
                p.velocity.x *= factor; p.velocity.y *= factor; p.velocity.z *= factor;
            }
            if (s.limit && s.dampen > 0 && speed > value(s.limit, t, p.random)) {
                const factor = lerp(1, value(s.limit, t, p.random) / speed, Math.min(1, s.dampen * step * 60));
                p.velocity.x *= factor; p.velocity.y *= factor; p.velocity.z *= factor;
            }
            p.velocity.y -= 9.8100004196167 * p.gravity * step;
            p.pos.x += (p.velocity.x + p.extra.x) * step; p.pos.y += (p.velocity.y + p.extra.y) * step; p.pos.z += (p.velocity.z + p.extra.z) * step;
            if (s.angular) p.rotation += value(s.angular, t, p.random) * step / DEG;
        }
        for (let i = this.emitters.length - 1; i >= 0; i--) {
            const e = this.emitters[i];
            if (!e.emitting && e.liveParticles === 0) this.emitters.splice(i, 1);
        }
    }
    draw(cameraX: number, unit: number): void {
        for (const p of this.particles) {
            const s = p.emitter.data.spec, t = p.age / p.total;
            let local = p.pos;
            if (s.noise) {
                const n = s.noise, seed = p.random * 1000; let amplitude = n.strength.scalar / (n.damping ? Math.max(.0001, n.frequency) : 1);
                let frequency = n.frequency, x = 0, y = 0;
                for (let i = 0; i < n.octaves; i++) {
                    x += noise(local.z * frequency + seed, local.y * frequency + seed) * amplitude;
                    y += noise(local.x * frequency + seed + 37, local.z * frequency + seed + 91) * amplitude;
                    frequency *= n.octaveScale; amplitude *= n.octaveMultiplier;
                }
                this.noisePosition.x = local.x + x; this.noisePosition.y = local.y + y; this.noisePosition.z = local.z;
                local = this.noisePosition;
            }
            const pos = s.world ? local : anchorPoint(local, p.emitter.anchor, false, this.drawPosition);
            const size = s.sizeLife ? value(s.sizeLife, t, p.random) : 1;
            const sizeY = s.sizeLifeY ? value(s.sizeLifeY, t, p.random) : size;
            let width = p.width * size, height = p.height * sizeY, angle = p.rotation;
            if (s.renderMode === 1) {
                const velocity = s.world ? p.velocity : anchorPoint(p.velocity, p.emitter.anchor, true, this.drawVelocity);
                height = Math.max(width, width * s.lengthScale + Math.hypot(velocity.x, velocity.y) * s.velocityScale);
                angle = Math.atan2(velocity.y, velocity.x) / DEG - 90;
            }
            if (s.alignment === 2) angle += p.emitter.anchor.angle ?? 0;
            const c = this.drawTint;
            if (s.colorLife) tint(s.colorLife, t, p.random, c); else c.fill(1);
            p.view.node.setPosition((pos.x - cameraX) * unit, pos.y * unit);
            p.view.node.angle = angle;
            p.view.ui.setContentSize(Math.max(0, width * unit), Math.max(0, height * unit));
            for (let i = 0; i < 4; i++) c[i] = Math.round(Math.max(0, Math.min(1, c[i] * p.tint[i])) * 255);
            this.drawColor.set(c[0], c[1], c[2], c[3]); p.view.sprite.color = this.drawColor;
        }
    }
    clear(): void {
        this.particles.forEach(p => this.recycle(p.view)); this.particles.length = this.emitters.length = 0; this.loops.clear();
    }
    dispose(): void {
        this.clear(); this.free.forEach(v => v.node.destroy()); this.free.length = 0;
        this.layers.forEach(n => n.destroy()); this.layers.clear(); this.prepared.clear();
        this.assets.releaseRuntimeAsset(this.additive);
    }
    private create(group: string, anchor: DunkParticleAnchor, pooled: boolean): Emitter[] {
        const es = (this.prepared.get(group) ?? []).map(data => ({ data, anchor, previous: { ...anchor }, age: 0,
            carry: 0, emitting: true, pooled, touched: true, liveParticles: 0 }));
        this.emitters.push(...es); return es;
    }
    private emit(e: Emitter, index: number, count: number, time: number, preAge: number, dt: number): void {
        const s = e.data.spec, shape = s.shape, random = Math.random();
        const a = (shape.arcMode === 3 ? index / count : Math.random()) * shape.arc * DEG;
        const radius = shape.radius * Math.sqrt(lerp((1 - shape.thickness) ** 2, 1, Math.random()));
        let pos = point(), velocity = point(0, 0, 1);
        if (shape.enabled) {
            if (shape.type === 0) {
                const z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z), distance = shape.radius * Math.cbrt(Math.random());
                velocity = point(Math.cos(a) * r, Math.sin(a) * r, z);
                pos = point(velocity.x * distance, velocity.y * distance, velocity.z * distance);
            } else {
                pos = point(Math.cos(a) * radius, Math.sin(a) * radius, 0);
                if (shape.type === 10) velocity = point(Math.cos(a), Math.sin(a), 0);
                else if (shape.type === 17) {
                    const b = Math.random() * Math.PI * 2, r = shape.donut * Math.sqrt(Math.random());
                    pos = point(Math.cos(a) * (shape.radius + r * Math.cos(b)), Math.sin(a) * (shape.radius + r * Math.cos(b)), r * Math.sin(b));
                } else {
                    const spread = Math.sin(shape.angle * DEG) * (radius / Math.max(.0001, shape.radius));
                    velocity = point(Math.cos(a) * spread, Math.sin(a) * spread, Math.sqrt(1 - spread * spread));
                }
            }
        }
        pos = transform(e.data.matrix, transform(e.data.shape, pos));
        velocity = transform(e.data.matrix, transform(e.data.shape, velocity, true), true);
        let extra = s.velocity ? transform(e.data.matrix, point(...s.velocity.map(c => value(c, 0, random)) as [number, number, number]), true) : point();
        const speed = value(s.speed, time), total = value(s.life, time);
        velocity.x *= speed; velocity.y *= speed; velocity.z *= speed;
        if (s.world) {
            pos = anchorPoint(pos, e.anchor); velocity = anchorPoint(velocity, e.anchor, true);
            if (!s.velocityWorld) extra = anchorPoint(extra, e.anchor, true);
        }
        const scale = s.scaling === 0 ? e.anchor.scale ?? 1 : 1;
        const width = value(s.size, time) * scale;
        const view = this.acquire(s);
        e.liveParticles++;
        this.particles.push({ emitter: e, pos, velocity, extra, age: preAge - dt, total,
            width, height: (s.sizeY ? value(s.sizeY, time) * scale : width * s.aspect), rotation: value(s.rotation, time) / DEG,
            gravity: value(s.gravity, time), tint: tint(s.color, time, random), random, view });
    }
    private acquire(s: Spec): View {
        let layer = this.layers.get(s.order);
        if (!layer) {
            layer = new Node(`ParticleOrder-${s.order}`); layer.layer = this.front.layer;
            (s.order < 0 ? this.back : this.front).addChild(layer); this.layers.set(s.order, layer);
            const siblings = Array.from(this.layers.entries()).filter(([order]) => (order < 0) === (s.order < 0)).sort((a, b) => a[0] - b[0]);
            siblings.forEach(([, n], i) => n.setSiblingIndex(i));
        }
        let v = this.free.pop();
        if (!v) {
            const node = new Node('NativeParticle'); node.layer = layer.layer;
            v = { node, ui: node.addComponent(UITransform), sprite: node.addComponent(Sprite) }; v.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        layer.addChild(v.node); v.node.active = true; v.sprite.spriteFrame = this.frames[s.frame];
        v.sprite.customMaterial = s.additive ? this.additive : null; return v;
    }
    private recycle(v: View): void { v.sprite.spriteFrame = null; v.sprite.customMaterial = null; v.node.active = false; this.free.push(v); }
}
