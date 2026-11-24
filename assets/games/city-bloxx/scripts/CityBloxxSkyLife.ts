import { Color, Node, Sprite, SpriteAtlas, UIOpacity, UITransform } from 'cc';
import type { CityBloxxSky } from './CityBloxxSky';

type Range = readonly [number, number];
/** Panel-pixel coordinates: x across the 750 px design width (0 = center), y up from the panel bottom as a fraction of its height. */
type LifeSpec =
    /** Fixed stars that swell and fade. */
    | { kind: 'twinkle'; count: number; y: Range; size: Range; color: string; period: Range }
    /** Soft light motes drifting upward with a slow sway. */
    | { kind: 'mote'; count: number; y: Range; size: Range; color: string; rise: number; alpha: number }
    /** A V of flapping birds crossing the panel, alternating direction each pass. */
    | { kind: 'flock'; count: number; y: Range; size: number; color: string; period: number; crossing: number; flap: number; frames: readonly string[] }
    /** One sprite crossing on a gentle wave, tilted along its path; optional flap frames and a blinking light. */
    | { kind: 'glider'; frame: readonly string[]; y: Range; size: number; period: number; crossing: number; wave: number; flap?: number;
        drop?: number; blink?: string; phase: number; color?: string }
    /** Glowing lanterns rising through the panel, flickering. */
    | { kind: 'riser'; count: number; y: Range; size: Range; period: number; glow: string }
    /** Brief diagonal streaks. */
    | { kind: 'meteor'; count: number; y: Range; length: number; period: number; color: string; angle: number }
    /** Slowly breathing light shafts falling from above. */
    | { kind: 'shaft'; count: number; y: number; color: string; alpha: number };

const BIRD = ['sky-bird-0', 'sky-bird-1'], GULL = ['sky-gull-0', 'sky-gull-1'];
/** Region order follows CITY_ALTITUDES; every sky owns a distinct, quiet motion that belongs to its painting. */
const REGION_LIFE: readonly (readonly LifeSpec[])[] = [
    // 城市街区: pigeons over the morning city, dust glinting in the low sun.
    [{ kind: 'flock', count: 5, y: [.5, .72], size: 26, color: '#A4B0D0', period: 17, crossing: 9, flap: 7, frames: BIRD },
        { kind: 'mote', count: 10, y: [.24, .78], size: [12, 26], color: '#FFE7B0', rise: 9, alpha: .7 }],
    // 摩天之巅: paper planes riding the updraft between towers, a far flock.
    [{ kind: 'glider', frame: ['sky-plane'], y: [.42, .7], size: 44, period: 13, crossing: 8, wave: 46, phase: 0 },
        { kind: 'glider', frame: ['sky-plane'], y: [.3, .5], size: 34, period: 19, crossing: 11, wave: 30, phase: .55 },
        { kind: 'flock', count: 3, y: [.62, .76], size: 16, color: '#8E9CC2', period: 23, crossing: 14, flap: 5, frames: BIRD }],
    // 云海之上: sun shafts through the cloud gaps, gulls gliding over the cloud sea.
    [{ kind: 'shaft', count: 3, y: .8, color: '#FFF4D6', alpha: .2 },
        { kind: 'glider', frame: GULL, y: [.45, .66], size: 50, period: 16, crossing: 10, wave: 26, flap: 2.2, phase: 0 },
        { kind: 'glider', frame: GULL, y: [.3, .5], size: 36, period: 23, crossing: 14, wave: 18, flap: 1.8, phase: .4 }],
    // 金色晚霞: sky lanterns drifting up into the dusk, birds heading home.
    [{ kind: 'riser', count: 5, y: [.22, .78], size: [40, 60], period: 28, glow: '#FFB45C' },
        { kind: 'flock', count: 6, y: [.55, .74], size: 22, color: '#B07898', period: 21, crossing: 12, flap: 6, frames: BIRD }],
    // 平流层: the first stars, an occasional meteor.
    [{ kind: 'twinkle', count: 14, y: [.3, .78], size: [10, 22], color: '#FFF1CC', period: [1.8, 3.4] },
        { kind: 'meteor', count: 2, y: [.5, .78], length: 170, period: 7, color: '#FFF6E0', angle: -28 }],
    // 近地轨道: satellites sailing past with blinking beacons.
    [{ kind: 'glider', frame: ['sky-satellite'], y: [.45, .7], size: 46, period: 26, crossing: 20, wave: 10, drop: -60, blink: '#FF7A6E', phase: 0 },
        { kind: 'glider', frame: ['sky-satellite'], y: [.28, .42], size: 32, period: 37, crossing: 28, wave: 6, drop: 40, blink: '#9EE7FF', phase: .5 },
        { kind: 'twinkle', count: 12, y: [.24, .78], size: [8, 18], color: '#DCE8FF', period: [2, 3.6] }],
    // 月光航道: a fine meteor shower falling past the moon, silver moon dust.
    [{ kind: 'meteor', count: 4, y: [.45, .78], length: 130, period: 4.6, color: '#E6F0FF', angle: -36 },
        { kind: 'mote', count: 12, y: [.24, .78], size: [10, 22], color: '#DCE6FF', rise: 6, alpha: .7 }],
    // 星云深处: pink and cyan nebula dust breathing in the clouds of gas.
    [{ kind: 'mote', count: 9, y: [.24, .78], size: [18, 38], color: '#FF9BD8', rise: 5, alpha: .75 },
        { kind: 'mote', count: 9, y: [.24, .78], size: [18, 38], color: '#8EE6FF', rise: 4, alpha: .75 },
        { kind: 'twinkle', count: 8, y: [.24, .78], size: [8, 16], color: '#FFFFFF', period: [2.2, 4] }],
    // 银河彼方: a comet sweeping past, dense starlight. The galaxy fills the top 56 % of this
    // tall panel above its deep-space approach; the ascent stops with the panel top at the screen top.
    [{ kind: 'glider', frame: ['sky-comet'], y: [.72, .84], size: 130, period: 22, crossing: 9, wave: 0, drop: -90, phase: 0 },
        { kind: 'twinkle', count: 34, y: [.14, .9], size: [8, 20], color: '#FFFFFF', period: [1.6, 3.2] },
        { kind: 'meteor', count: 2, y: [.3, .82], length: 150, period: 9, color: '#F0E6FF', angle: -24 }],
];
const HALF_WIDTH = 375;

/** `node` carries position, flip and fade; `body` is the sprite; `light` is a halo behind it or a beacon over it. */
interface Actor { node: Node; body: Node; sprite: Sprite; opacity: UIOpacity; spec: LifeSpec; index: number; light?: Node }
interface Region { actors: Actor[] }

/** Stable per-actor randomness: life must never consume the gameplay random stream. */
function hash(a: number, b: number, c: number): number {
    const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return v - Math.floor(v);
}
const lerp = (r: Range, t: number) => r[0] + (r[1] - r[0]) * t;
const frac = (v: number) => v - Math.floor(v);

/** Animated decorations living inside each painted sky region, created when the region first comes on screen. */
export class CityBloxxSkyLife {
    private readonly regions = new Map<number, Region>();

    constructor(private readonly sky: CityBloxxSky, private readonly atlas: SpriteAtlas) {}

    dispose(): void { this.regions.clear(); }

    update(time: number): void {
        this.sky.visitRegions((index, node, height) => {
            let region = this.regions.get(index);
            if (!region) { region = this.build(index, node); this.regions.set(index, region); }
            for (const actor of region.actors) this.animate(actor, index, height, time);
        });
    }

    private build(index: number, parent: Node): Region {
        const actors: Actor[] = [];
        (REGION_LIFE[index] ?? []).forEach((spec, s) => {
            const count = 'count' in spec ? spec.count : 1;
            for (let i = 0; i < count; i++) {
                const frame = spec.kind === 'glider' ? spec.frame[0] : spec.kind === 'flock' ? spec.frames[0]
                    : spec.kind === 'twinkle' ? 'fx-sparkle' : spec.kind === 'meteor' ? 'sky-streak'
                        : spec.kind === 'shaft' ? 'sky-shaft' : spec.kind === 'riser' ? 'sky-lantern' : 'sky-glow';
                const node = new Node(`CitySkyLife-${spec.kind}`); node.layer = parent.layer; parent.addChild(node);
                node.addComponent(UITransform);
                const halo = spec.kind === 'riser' ? this.make('CitySkyLifeHalo', node, 'sky-glow', spec.glow) : undefined;
                const body = this.make('CitySkyLifeBody', node, frame, spec.kind === 'glider' || spec.kind === 'riser' ? undefined : spec.color);
                if (spec.kind === 'shaft') body.getComponent(UITransform)!.setAnchorPoint(.5, 1);
                const beacon = spec.kind === 'glider' && spec.blink ? this.make('CitySkyLifeBeacon', node, 'sky-glow', spec.blink) : undefined;
                actors.push({ node, body, sprite: body.getComponent(Sprite)!, opacity: node.addComponent(UIOpacity), spec, index: s * 100 + i, light: halo ?? beacon });
            }
        });
        return { actors };
    }

    private animate(a: Actor, region: number, height: number, time: number): void {
        const spec = a.spec, r = (k: number) => hash(region + 1, a.index, k);
        const node = a.node;
        let alpha = 1;
        switch (spec.kind) {
            case 'twinkle': {
                const period = lerp(spec.period, r(0)), tw = Math.sin(Math.PI * frac(time / period + r(1))) ** 2;
                const size = lerp(spec.size, r(2)) * (.45 + .55 * tw);
                node.setPosition((r(3) * 2 - 1) * (HALF_WIDTH - 20), lerp(spec.y, r(4)) * height);
                this.size(a, size, size); a.body.setRotationFromEuler(0, 0, time * 20 * (r(5) - .5));
                alpha = .25 + .75 * tw; break;
            }
            case 'mote': {
                const span = (spec.y[1] - spec.y[0]) * height, v = frac(r(0) + time * spec.rise / span);
                const size = lerp(spec.size, r(1)) * (.8 + .2 * Math.sin(time * (1 + r(2)) + r(3) * 6.28));
                node.setPosition((r(4) * 2 - 1) * (HALF_WIDTH - 20) + Math.sin(time * .4 + r(5) * 6.28) * 18, spec.y[0] * height + v * span);
                this.size(a, size, size);
                alpha = spec.alpha * Math.min(1, v * 6, (1 - v) * 6) * (.6 + .4 * Math.sin(time * (1.3 + r(6)) + r(7) * 6.28)); break;
            }
            case 'flock': {
                const cycle = Math.floor(time / spec.period), u = (time - cycle * spec.period) / spec.crossing;
                if (u >= 1) { node.active = false; return; }
                const dir = cycle % 2 ? -1 : 1, lead = -dir * (HALF_WIDTH + 120) + dir * u * (2 * HALF_WIDTH + 240);
                const y = lerp(spec.y, hash(region, cycle, 9)) * height + Math.sin(u * Math.PI * 2) * 14;
                // V formation behind the leader; each bird keeps its own wingbeat.
                const rank = Math.ceil(a.index % 100 / 2), side = a.index % 2 ? 1 : -1;
                node.setPosition(lead - dir * rank * spec.size * 1.3, y + side * rank * spec.size * .55 + Math.sin(time * 2 + rank) * 3);
                const frames = spec.frames, beat = Math.floor((time + r(0)) * spec.flap) % frames.length;
                this.frame(a, frames[beat], spec.size * (1 - rank * .06));
                node.setScale(dir, 1, 1);
                break;
            }
            case 'glider': {
                const t = time + spec.phase * spec.period, cycle = Math.floor(t / spec.period), u = (t - cycle * spec.period) / spec.crossing;
                if (u >= 1) { node.active = false; return; }
                const comet = !!spec.drop && spec.wave === 0;
                const dir = comet || spec.blink ? 1 : cycle % 2 ? -1 : 1;
                const x = -dir * (HALF_WIDTH + spec.size) + dir * u * (2 * HALF_WIDTH + 2 * spec.size);
                const wave = Math.sin(u * Math.PI * 3) * spec.wave, y = lerp(spec.y, hash(region, cycle, 11)) * height + wave + (spec.drop ?? 0) * u;
                const slope = (Math.cos(u * Math.PI * 3) * Math.PI * 3 * spec.wave + (spec.drop ?? 0)) / (2 * HALF_WIDTH + 2 * spec.size);
                node.setPosition(x, y);
                const frames = spec.frame, beat = spec.flap ? Math.floor(time * spec.flap) % frames.length : 0;
                this.frame(a, frames[beat], spec.size);
                node.setScale(dir, 1, 1); node.setRotationFromEuler(0, 0, Math.atan(slope) * 180 / Math.PI * .8);
                if (a.light) {
                    const on = frac(time * .8 + r(0)) < .18;
                    a.light.active = on; a.light.setPosition(spec.size * .05, spec.size * .32);
                    a.light.getComponent(UITransform)!.setContentSize(spec.size * .4, spec.size * .4);
                }
                alpha = Math.min(1, u * 12, (1 - u) * 12); break;
            }
            case 'riser': {
                const v = frac(r(0) + time / spec.period), size = lerp(spec.size, r(1));
                const x = (r(2) * 2 - 1) * (HALF_WIDTH - 50) + Math.sin(time * .35 + r(3) * 6.28) * 24;
                node.setPosition(x, lerp(spec.y, v) * height);
                this.frame(a, 'sky-lantern', size); node.setRotationFromEuler(0, 0, Math.sin(time * .8 + r(4) * 6.28) * 5);
                const flicker = .82 + .18 * Math.sin(time * 9 + r(5) * 6.28) * Math.sin(time * 5.3 + r(6) * 6.28);
                const halo = size * 1.8 * flicker;
                a.light!.setPosition(0, -size * .1); a.light!.getComponent(UITransform)!.setContentSize(halo, halo);
                const glow = new Color(spec.glow); glow.a = Math.round(110 * flicker); a.light!.getComponent(Sprite)!.color = glow;
                alpha = Math.min(1, v * 8, (1 - v) * 8); break;
            }
            case 'meteor': {
                const t = time / spec.period + r(0), cycle = Math.floor(t), u = (t - cycle) * spec.period / .9;
                if (u >= 1) { node.active = false; return; }
                const angle = spec.angle * Math.PI / 180;
                const x0 = (hash(region, cycle, a.index) * 1.4 - .5) * HALF_WIDTH, y0 = lerp(spec.y, hash(region, cycle, a.index + 7)) * height;
                const travel = spec.length * 1.6 * u;
                node.setPosition(x0 + Math.cos(angle) * travel, y0 + Math.sin(angle) * travel);
                node.setRotationFromEuler(0, 0, spec.angle);
                this.size(a, spec.length * (.5 + .5 * Math.min(1, u * 3)), 8);
                alpha = Math.min(1, u * 6, (1 - u) * 2.5); break;
            }
            case 'shaft': {
                const x = (a.index % 100 - (spec.count - 1) / 2) * 210 + (r(0) - .5) * 60;
                node.setPosition(x, spec.y * height);
                this.size(a, 150 + 40 * r(1), 520 + 80 * r(2));
                node.setRotationFromEuler(0, 0, -14 + Math.sin(time * .15 + r(3) * 6.28) * 2.5);
                alpha = spec.alpha * (.55 + .45 * Math.sin(time * (.25 + .1 * r(4)) + r(5) * 6.28)); break;
            }
        }
        node.active = true;
        a.opacity.opacity = Math.round(255 * Math.max(0, Math.min(1, alpha)));
    }

    private make(name: string, parent: Node, frame: string, tint?: string): Node {
        const node = new Node(name); node.layer = parent.layer; parent.addChild(node);
        node.addComponent(UITransform);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.atlas.getSpriteFrame(frame);
        if (tint) sprite.color = new Color(tint);
        return node;
    }
    private size(a: Actor, w: number, h: number): void { a.body.getComponent(UITransform)!.setContentSize(w, h); }
    /** Width-driven size that keeps the frame's own aspect ratio. */
    private frame(a: Actor, name: string, width: number): void {
        const frame = this.atlas.getSpriteFrame(name);
        if (!frame) return;
        if (a.sprite.spriteFrame !== frame) a.sprite.spriteFrame = frame;
        this.size(a, width, width * frame.rect.height / frame.rect.width);
    }
}
