import { EffectAsset, gfx, Material, Node, SpriteFrame, Texture2D, UITransform, Vec3, Vec4 } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { cityHermite } from './CityBloxxModel';
import { CITY_ASSETS } from './CityBloxxView';
import { CityBloxxRainBatch } from './CityBloxxRainBatch';

export interface CityRainConfig {
    activation: { drawMax: number; threshold: number };
    origin: number[]; basis: number[][]; shape: number[]; scale: number[];
    life: number; rate: number; capacity: number; speed: number[]; velocity: number[][];
    size: number[]; sizeCurve: number[][]; colors: number[][]; alpha: number[][];
    tint: number[]; velocityScale: number; lengthScale: number; sortingOrder: number;
}
interface RainParticle {
    slot: number; serial: number; position: number[]; origin: number[]; velocity: number[];
    size: number; startSize: number; color: number[]; alpha: number; age: number;
}
export interface CityRainState { enabled: boolean; clock: number; }

/** Original camera-local rain. Samples are birth-local, so rendering/culling never consumes gameplay RNG. */
export class CityBloxxRain {
    private readonly root: Node;
    private readonly frame: SpriteFrame;
    private readonly material: Material;
    private readonly batch: CityBloxxRainBatch;
    private readonly particleSlots: RainParticle[] = [];
    private readonly liveParticles: RainParticle[] = [];
    private readonly point = new Vec3();
    private readonly next = new Vec3();
    private readonly edge = new Vec3();
    private enabled = false;
    private clock = 0;
    get isRaining(): boolean { return this.enabled; }

    constructor(parent: Node, private readonly data: CityRainConfig,
        private readonly project: (x: number, y: number, z: number, out?: Vec3) => Vec3,
        private readonly assets: AssetService, effect: EffectAsset, texture: Texture2D) {
        this.root = new Node('CityRain'); this.root.layer = parent.layer; parent.addChild(this.root);
        this.root.active = false;
        this.frame = assets.trackRuntimeAsset(CITY_ASSETS, new SpriteFrame());
        this.frame.texture = texture; this.frame.packable = false;
        this.material = assets.trackRuntimeAsset(CITY_ASSETS, new Material());
        this.material.initialize({ effectAsset: effect, states: { blendState: { targets: [{ blend: true,
            blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE,
            blendColorMask: gfx.ColorMask.R | gfx.ColorMask.G | gfx.ColorMask.B }] } } });
        // Legacy/Particles/Additive returns 2 * vertexColor * tint * texture;
        // source alpha is then applied by the blend stage. Native tint RGB is gray.
        this.material.setProperty('particleParams', new Vec4(data.tint[0] * 2, 1, 1, 0));
        this.root.addComponent(UITransform);
        this.batch = this.root.addComponent(CityBloxxRainBatch);
        this.batch.configure(data.capacity, this.frame, this.material);
    }

    private sample(serial: number, channel: number): number {
        let v = Math.imul(serial + 1, 0x45d9f3b) ^ Math.imul(channel + 1, 0x27d4eb2d);
        v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
        return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
    }

    private particles(time: number): RainParticle[] {
        const d = this.data, result = this.liveParticles;
        result.length = 0;
        // Birth randomness and basis transforms are constant for a slot's lifetime.
        // Reuse all particle storage; rendering only advances age, size and opacity.
        const period = Math.max(d.life, d.capacity / d.rate);
        for (let slot = 0; slot < d.capacity; slot++) {
            const firstBirth = (slot + 1) / d.rate, cycle = Math.floor((time - firstBirth) / period);
            if (cycle < 0) continue;
            const age = time - firstBirth - cycle * period;
            if (age >= d.life) continue;
            const serial = cycle * d.capacity + slot;
            let p = this.particleSlots[slot];
            if (!p) p = this.particleSlots[slot] = { slot, serial: -1, position: [0, 0, 0], origin: [0, 0, 0],
                velocity: [0, 0, 0], size: 0, startSize: 0, color: [0, 0, 0, 0], alpha: 0, age: 0 };
            if (p.serial !== serial) {
                p.serial = serial;
                for (let b = 0; b < 3; b++) { p.origin[b] = d.origin[b]; p.velocity[b] = 0; }
                for (let a = 0; a < 3; a++) {
                    const range = d.velocity[a];
                    let velocity = range[0] + (range[1] - range[0]) * this.sample(serial, a + 3);
                    if (a === 2) velocity += d.speed[0] + (d.speed[1] - d.speed[0]) * this.sample(serial, 6);
                    const local = (this.sample(serial, a) - .5) * d.shape[a];
                    for (let b = 0; b < 3; b++) {
                        p.origin[b] += d.basis[a][b] * local;
                        p.velocity[b] += d.basis[a][b] * velocity;
                    }
                }
                const colorMix = this.sample(serial, 8);
                for (let c = 0; c < 4; c++) p.color[c] = d.colors[0][c] + (d.colors[1][c] - d.colors[0][c]) * colorMix;
                p.alpha = p.color[3] * d.tint[3] * 2;
                p.startSize = d.size[0] + (d.size[1] - d.size[0]) * this.sample(serial, 7);
            }
            p.age = age;
            for (let a = 0; a < 3; a++) p.position[a] = p.origin[a] + p.velocity[a] * age;
            const phase = age / d.life;
            let alpha = d.alpha[d.alpha.length - 1][1];
            for (let i = 1; i < d.alpha.length; i++) if (phase <= d.alpha[i][0]) {
                const a = d.alpha[i - 1], b = d.alpha[i];
                alpha = a[1] + (b[1] - a[1]) * (phase - a[0]) / (b[0] - a[0]); break;
            }
            p.color[3] = p.alpha * alpha;
            p.size = p.startSize * Math.max(0, cityHermite(d.sizeCurve, phase));
            result.push(p);
        }
        return result;
    }

    advance(dt: number): void { if (Number.isFinite(dt) && dt > 0) this.clock += Math.min(dt, .25); }

    update(cameraY: number, cameraDistance: number, width: number, height: number, center: number): void {
        this.root.active = this.enabled; this.batch.count = 0;
        if (!this.enabled) return;
        const d = this.data;
        for (const p of this.particles(this.clock)) {
            const [x, y, depth] = p.position, z = cameraDistance - depth;
            const point = this.project(x, cameraY + y, z, this.point);
            const next = this.project(x + p.velocity[0], cameraY + y + p.velocity[1], z - p.velocity[2], this.next);
            const unit = this.project(x + 1, cameraY + y, z, this.edge).x - point.x;
            const length = (Math.hypot(...p.velocity) * d.velocityScale + p.size * d.lengthScale) * unit;
            const thickness = p.size * d.scale[0] * unit;
            const localY = point.y - center;
            if (point.x + length < -width/2 || point.x - length > width/2 || localY + length < -height/2 || localY - length > height/2) continue;
            this.batch.quad(point.x, localY, next.x - point.x, next.y - point.y, length, thickness, p.color);
        }
    }

    warmup(): () => void {
        this.root.active = true; this.batch.count = 0;
        this.batch.quad(0, 0, 1, 0, 24, 2, [1, 1, 1, 1]);
        this.particles(this.data.life * 2);
        return () => { this.batch.count = 0; this.root.active = this.enabled; };
    }

    // UIFightPanel.OnClickRetry reloads Endless: Ctrl.Awake rolls new weather.
    // Video revival raises TryAgain in the existing scene and never calls reset.
    snapshot(): CityRainState { return { enabled: this.enabled, clock: this.clock }; }
    reset(saved?: CityRainState): void {
        this.batch.count = 0; this.liveParticles.length = 0; this.clock = saved?.clock ?? 0;
        this.enabled = saved?.enabled ?? Math.floor(Math.random() * this.data.activation.drawMax) < this.data.activation.threshold;
        this.root.active = this.enabled;
    }
    dispose(): void {
        this.particleSlots.length = this.liveParticles.length = 0; this.root.destroy(); this.assets.releaseRuntimeAsset(this.frame); this.assets.releaseRuntimeAsset(this.material);
    }
}
