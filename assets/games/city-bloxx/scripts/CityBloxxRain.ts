import { Color, EffectAsset, gfx, Material, Node, Sprite, SpriteFrame, Texture2D, UITransform, Vec3, Vec4 } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { cityHermite } from './CityBloxxModel';
import { CITY_ASSETS } from './CityBloxxView';

export interface CityRainConfig {
    activation: { drawMax: number; threshold: number };
    origin: number[]; basis: number[][]; shape: number[]; scale: number[];
    life: number; rate: number; capacity: number; speed: number[]; velocity: number[][];
    size: number[]; sizeCurve: number[][]; colors: number[][]; alpha: number[][];
    tint: number[]; velocityScale: number; lengthScale: number; sortingOrder: number;
}
interface RainParticle { slot: number; position: number[]; velocity: number[]; size: number; color: number[]; age: number; }

/** Original camera-local rain. Samples are birth-local, so rendering/culling never consumes gameplay RNG. */
export class CityBloxxRain {
    private readonly root: Node;
    private readonly frame: SpriteFrame;
    private readonly material: Material;
    private readonly nodes = new Map<number, Node>();
    private enabled = false;
    private clock = 0;

    constructor(parent: Node, private readonly data: CityRainConfig,
        private readonly project: (x: number, y: number, z: number) => Vec3,
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
    }

    private sample(serial: number, channel: number): number {
        let v = Math.imul(serial + 1, 0x45d9f3b) ^ Math.imul(channel + 1, 0x27d4eb2d);
        v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
        return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
    }

    private particles(time: number): RainParticle[] {
        const d = this.data, result: RainParticle[] = [];
        // A full system skips births until a slot's lifetime ends. This bounded
        // schedule also supports camera/time jumps without simulating old drops.
        const period = Math.max(d.life, d.capacity / d.rate);
        for (let slot = 0; slot < d.capacity; slot++) {
            const firstBirth = (slot + 1) / d.rate, cycle = Math.floor((time - firstBirth) / period);
            if (cycle < 0) continue;
            const age = time - firstBirth - cycle * period;
            if (age >= d.life) continue;
            const serial = cycle * d.capacity + slot;
            const range = (r: number[], channel: number) => r[0] + (r[1] - r[0]) * this.sample(serial, channel);
            const velocity = d.velocity.map((r, i) => range(r, i + 3)); velocity[2] += range(d.speed, 6);
            const local = d.shape.map((size, i) => (this.sample(serial, i) - .5) * size + velocity[i] * age);
            const position = d.origin.slice(), worldVelocity = [0, 0, 0];
            for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
                position[b] += d.basis[a][b] * local[a]; worldVelocity[b] += d.basis[a][b] * velocity[a];
            }
            const phase = age / d.life, colorMix = this.sample(serial, 8);
            const color = d.colors[0].map((v, i) => v + (d.colors[1][i] - v) * colorMix);
            let alpha = d.alpha[d.alpha.length - 1][1];
            for (let i = 1; i < d.alpha.length; i++) if (phase <= d.alpha[i][0]) {
                const a = d.alpha[i - 1], b = d.alpha[i];
                alpha = a[1] + (b[1] - a[1]) * (phase - a[0]) / (b[0] - a[0]); break;
            }
            color[3] *= alpha * d.tint[3] * 2;
            result.push({ slot, position, velocity: worldVelocity, age, color,
                size: range(d.size, 7) * Math.max(0, cityHermite(d.sizeCurve, phase)) });
        }
        return result;
    }

    advance(dt: number): void { if (Number.isFinite(dt) && dt > 0) this.clock += Math.min(dt, .25); }

    update(cameraY: number, cameraDistance: number, width: number, height: number, center: number): void {
        this.root.active = this.enabled;
        if (!this.enabled) return;
        const visible = new Set<number>(), d = this.data;
        for (const p of this.particles(this.clock)) {
            const [x, y, depth] = p.position, z = cameraDistance - depth;
            const point = this.project(x, cameraY + y, z);
            const next = this.project(x + p.velocity[0], cameraY + y + p.velocity[1], z - p.velocity[2]);
            const unit = this.project(x + 1, cameraY + y, z).x - point.x;
            const length = (Math.hypot(...p.velocity) * d.velocityScale + p.size * d.lengthScale) * unit;
            const thickness = p.size * d.scale[0] * unit;
            if (point.x + length < -width/2 || point.x - length > width/2 || point.y + length < -height/2 || point.y - length > height/2) continue;
            visible.add(p.slot);
            let n = this.nodes.get(p.slot);
            if (!n) {
                n = new Node('CityRainDrop'); n.layer = this.root.layer; this.root.addChild(n); n.addComponent(UITransform);
                const sprite = n.addComponent(Sprite); sprite.spriteFrame = this.frame;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.customMaterial = this.material; this.nodes.set(p.slot, n);
            }
            n.active = true; n.setPosition(point.x, point.y - center);
            n.setRotationFromEuler(0, 0, Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI);
            n.getComponent(UITransform)!.setContentSize(length, thickness);
            n.getComponent(Sprite)!.color = new Color(...p.color.map(c => Math.round(c * 255)) as [number, number, number, number]);
        }
        this.nodes.forEach((n, slot) => { if (!visible.has(slot)) n.active = false; });
    }

    private clear(): void { this.nodes.forEach(n => n.destroy()); this.nodes.clear(); }

    // UIFightPanel.OnClickRetry reloads Endless: Ctrl.Awake rolls new weather.
    // Video revival raises TryAgain in the existing scene and never calls reset.
    reset(): void {
        this.clear(); this.clock = 0;
        this.enabled = Math.floor(Math.random() * this.data.activation.drawMax) < this.data.activation.threshold;
        this.root.active = this.enabled;
    }
    dispose(): void {
        this.clear(); this.root.destroy(); this.assets.releaseRuntimeAsset(this.frame); this.assets.releaseRuntimeAsset(this.material);
    }
}
