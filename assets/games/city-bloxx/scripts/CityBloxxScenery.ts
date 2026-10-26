import { Color, EffectAsset, gfx, Graphics, Mask, Material, Node, Sprite, SpriteAtlas, SpriteFrame, Texture2D, UITransform, Vec3, Vec4 } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { CITY_RULES, CityBloxxModel, cityCraneRig, cityHermite, type CityEvent, type CityFloor } from './CityBloxxModel';
import { CITY_ASSETS } from './CityBloxxView';
import type { CityHudConfig } from './CityBloxxHud';
import { CityBloxxRain, type CityRainConfig } from './CityBloxxRain';
import { cityComboMilestone, cityComboStage } from './CityBloxxFeedback';
import { CITY_GROUND } from './CityBloxxGround';
import { cityBackdropInView } from './CityBloxxBackdrop';

interface Decoration {
    id: number; name: string; frame: string; x: number; y: number; z: number;
    width: number; height: number; flipX: boolean; angle: number; color: number[]; loop?: number[];
    sortingLayer: number; sortingOrder: number;
}
interface Effect {
    life: number; speed: number; size: number[][]; scale: number; startSize: number; radius: number; count: number; position: number[];
    limitSpeed: number; dampen: number; dampenReferenceHz: number; births: number[][]; rotation: number[][]; rotationScale: number;
    trail: { life: number; minDistance: number; width: number; color: number[]; emission: number; noiseScale: number[] };
}
interface ResidentConfig { width: number; height: number; flipX: boolean; life: number; frames: number; frameCurve: number[][]; frameScale: number; }
interface FloorEffect { life: number; frames: number; frameCurve: number[][]; frameScale: number; startSize: number; position: number[]; color: number[]; emission: number; }
interface AmbientStars {
    id: number; name: string; origin: number[]; vertices: number[][]; size: number[]; life: number;
    rate: number; prewarm: number; alpha: number[][]; bounds: number[]; meshSpeed: number;
    sortingLayer: number; sortingOrder: number;
}
interface SceneryOrder { node: Node; layer: number; order: number; distance: number; id: number; }
export interface CityEnvironment {
    bands: { y: number; height: number; z: number; color: number[] }[];
    items: Decoration[];
    effects: { match_star: Effect; star_3: FloorEffect };
    residents: Record<'red' | 'blue', ResidentConfig>;
    hud: CityHudConfig;
    ambient: { stars: AmbientStars[]; rain: CityRainConfig };
}
interface Resident { node: Node; floor: CityFloor; x: number; y: number; age: number; startedAt: number; duration: number; color: 'red' | 'blue'; sign: number; }
interface Spark {
    node: Node; trail: Node; floor: CityFloor; age: number; startedAt: number; angle: number; radius: number; speed: number; rotation: number;
    history: { age: number; radius: number }[];
}
interface FloorGlow { node: Node; floor: CityFloor; startedAt: number; }
interface Contact { graphics: Graphics; floor: CityFloor; startedAt: number; life: number; level: number; color: string; }

/** Scene sprites use the same perspective camera as the original meshes and suspended floor. */
export class CityBloxxScenery {
    private readonly background: Node;
    private readonly gradient: Graphics;
    private readonly rearPavement: Graphics;
    private readonly streetBackZ: number;
    private readonly city: Node;
    private readonly decorations: Node;
    private readonly rig: Node;
    private readonly foreground: Node;
    private readonly crane: Node;
    private readonly hook: Node;
    private readonly sling: Node;
    private readonly cables: Graphics;
    private readonly floorGlows: Node;
    private readonly trails: Node;
    private readonly contactLayer: Node;
    private readonly trailFrame: SpriteFrame;
    private readonly trailMaterial: Material;
    private readonly glowMaterial: Material;
    private readonly items = new Map<number, Node>();
    private readonly ambientStars = new Map<number, Graphics>();
    private readonly rain: CityBloxxRain;
    private readonly residents: Resident[] = [];
    private readonly sparks: Spark[] = [];
    private readonly glows = new Map<number, FloorGlow>();
    private readonly contacts: Contact[] = [];
    private width = 750;
    private height = 1334;
    private center = 0;
    private lastBand = -Infinity;

    constructor(parent: Node, worldProjection: Node, private readonly atlas: SpriteAtlas, private readonly cityFrame: SpriteFrame,
        private readonly data: CityEnvironment, skyLayer: number, private readonly project: (x: number, y: number, z: number) => Vec3,
        private readonly assets: AssetService, particleEffect: EffectAsset, trailLine: Texture2D, trailMask: Texture2D, rainLine: Texture2D) {
        this.background = this.make('CityAltitudeSky', parent); this.background.layer = skyLayer; this.background.setSiblingIndex(0);
        this.gradient = this.background.addComponent(Graphics);
        const rearPavement = this.make('CityRearPavement', parent); rearPavement.layer = skyLayer;
        this.rearPavement = rearPavement.addComponent(Graphics);
        this.decorations = this.make('CityAltitudeScenery', parent); this.decorations.layer = skyLayer;
        this.city = this.make('CityCloudlineBackdrop', this.decorations);
        const citySprite = this.city.addComponent(Sprite);
        citySprite.sizeMode = Sprite.SizeMode.CUSTOM; citySprite.spriteFrame = cityFrame;
        const skyline = data.items.find(item => item.frame === 'skyline');
        if (!skyline) throw Error('City skyline configuration is missing');
        this.streetBackZ = Math.min(CITY_GROUND.backZ, -skyline.z);
        this.city.active = false; this.items.set(skyline.id, this.city);
        // The projected opaque floor faces must occlude the rig. Residents and
        // effects keep their separate foreground pass in front of those faces.
        this.rig = this.make('CityRigBehindFloors', parent);
        this.rig.setSiblingIndex(worldProjection.getSiblingIndex());
        this.rig.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.foreground = this.make('CityResidentsAndEffects', parent);
        this.foreground.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.cables = this.make('CitySuspension', this.rig).addComponent(Graphics);
        this.crane = this.sprite('CityCrane', 'crane-arm', this.rig);
        this.hook = this.sprite('CityHook', 'hook', this.rig);
        this.hook.getComponent(UITransform)!.setAnchorPoint(.5, 0);
        this.sling = this.sprite('CitySling', 'sling', this.rig);
        this.sling.getComponent(UITransform)!.setAnchorPoint(.5, 1);
        this.rain = new CityBloxxRain(this.foreground, data.ambient.rain, project, assets, particleEffect, rainLine);
        // Native floor glows have Sorting Order 50; residents and the perfect burst use 10000.
        this.floorGlows = this.make('CityFloorGlows', this.foreground);
        this.trails = this.make('CityStarTrails', this.foreground);
        this.contactLayer = this.make('CityLandingContacts', this.foreground);
        this.trailFrame = assets.trackRuntimeAsset(CITY_ASSETS, new SpriteFrame());
        this.trailFrame.texture = trailLine; this.trailFrame.packable = false;
        this.glowMaterial = assets.trackRuntimeAsset(CITY_ASSETS, new Material());
        this.glowMaterial.initialize({ effectAsset: particleEffect });
        this.glowMaterial.setProperty('particleParams', new Vec4(data.effects.star_3.emission, 1, 1, 0));
        this.trailMaterial = assets.trackRuntimeAsset(CITY_ASSETS, new Material());
        this.trailMaterial.initialize({ effectAsset: particleEffect, defines: { USE_TRAIL: true },
            states: { blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.ONE, blendDst: gfx.BlendFactor.ONE,
                blendColorMask: gfx.ColorMask.R | gfx.ColorMask.G | gfx.ColorMask.B }] } } });
        const trail = data.effects.match_star.trail;
        this.trailMaterial.setProperty('particleParams', new Vec4(trail.emission, trail.noiseScale[0], trail.noiseScale[1], 0));
        this.trailMaterial.setProperty('noiseTexture', trailMask);
    }
    layout(width: number, height: number, bottom: number, top: number): void {
        this.width = width; this.height = height; this.center = (top + bottom) / 2;
        for (const layer of [this.rig, this.foreground]) {
            layer.setPosition(0, this.center); layer.getComponent(UITransform)!.setContentSize(width, top - bottom);
        }
        this.decorations.getComponent(UITransform)!.setContentSize(width, height); this.lastBand = -Infinity;
    }
    advance(dt: number): void { this.rain.advance(dt); }
    placeBelowEffects(node: Node): void {
        // Keep the original upward stars and trails visible over the new
        // landing notice, while the notice remains above the floor meshes.
        node.setSiblingIndex(this.foreground.getSiblingIndex());
    }
    event(event: CityEvent, model: CityBloxxModel): void {
        if (event.type === 'bonus') { this.clearGlows(); return; }
        if (event.type === 'collapse') { this.glows.get(event.floor.id)?.node.destroy(); this.glows.delete(event.floor.id); return; }
        if (event.type !== 'land') return;
        // Ctrl.SetOneHouse: perfect/foundation spawn two; ordinary placement spawns one, independent of population.
        const sides = event.perfect ? [-1, 1] : [Math.random() < .5 ? -1 : 1];
        for (const sign of sides) {
            const color = Math.random() < .5 ? 'blue' : 'red';
            const node = this.sprite('CityResident', `resident-${color}-0`, this.foreground);
            this.residents.push({ node, floor: event.floor, x: sign * 3, y: houseRootY(event.floor) + 1.6,
                age: 0, startedAt: model.animationTime, duration: 3 + Math.random(), color, sign });
        }
        const stage = cityComboStage(event.perfect ? model.combo : 0);
        if (this.contacts.length >= 6) this.contacts.shift()!.graphics.node.destroy();
        this.contacts.push({ graphics: this.make('CityLandingContact', this.contactLayer).addComponent(Graphics),
            floor: event.floor, startedAt: model.animationTime, level: event.perfect ? stage.level : 0,
            color: event.perfect ? stage.color : '#E8F3EF',
            life: event.perfect ? cityComboMilestone(model.combo) ? .44 : .34 : .22 });
        if (event.floor.base || !event.perfect) return;
        this.burst(event.floor, model.animationTime);
        for (const floor of model.floors.slice(-9)) if (!this.glows.has(floor.id)) {
            const node = this.sprite('CityFloorGlow', 'combo-star-0', this.floorGlows), c = this.data.effects.star_3.color;
            node.getComponent(Sprite)!.color = new Color(c[0], c[1], c[2], c[3]);
            node.getComponent(Sprite)!.customMaterial = this.glowMaterial;
            this.glows.set(floor.id, { node, floor, startedAt: model.animationTime });
        }
    }
    private burst(floor: CityFloor, startedAt: number): void {
        const effect = this.data.effects.match_star;
        // The native prefab has a fixed seed and always emits the same three
        // particles. Import its measured batch positions instead of consuming
        // the unrelated random stream used by residents and gameplay.
        for (const birth of effect.births) {
            const radius = Math.hypot(birth[0], birth[1]);
            const trail = this.make('CityPerfectTrail', this.trails), sprite = trail.addComponent(Sprite), c = effect.trail.color;
            sprite.spriteFrame = this.trailFrame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = new Color(c[0], c[1], c[2], c[3]); sprite.customMaterial = this.trailMaterial; trail.active = false;
            this.sparks.push({ node: this.sprite('CityPerfectStar', 'star', this.foreground), trail, floor, age: 0, startedAt,
                angle: Math.atan2(birth[1], birth[0]), radius, speed: effect.speed, rotation: 0,
                history: [{ age: 0, radius }] });
        }
    }
    update(model: CityBloxxModel): void {
        if (Math.abs(model.cameraY - this.lastBand) > .015) {
            this.paintSky(); this.paintRearPavement(); this.lastBand = model.cameraY;
        }
        const visible = new Set<number>();
        const drawOrder: SceneryOrder[] = [];
        for (const d of this.data.items) {
            let x = d.x, y = d.y, z = d.z;
            if (d.loop) {
                const p = (d.loop[6] + model.animationTime * d.loop[7]) % 1;
                x += d.loop[0] + (d.loop[3] - d.loop[0]) * p;
                y += d.loop[1] + (d.loop[4] - d.loop[1]) * p;
                z += d.loop[2] + (d.loop[5] - d.loop[2]) * p;
            }
            const pos = this.project(x, y, -z);
            const edge = this.project(x + d.width, y + d.height, -z);
            const w = Math.abs(edge.x - pos.x), h = Math.abs(edge.y - pos.y);
            if (d.frame === 'skyline') {
                if (!cityBackdropInView(this.project, this.height)) continue;
            } else if (pos.y + h / 2 < -this.height / 2 || pos.y - h / 2 > this.height / 2
                || pos.x + w / 2 < -this.width / 2 || pos.x - w / 2 > this.width / 2) continue;
            let frame = d.frame;
            if (frame === 'cloud-bank' && d.width / d.height > 6) frame = 'cloud-bank-thin';
            if (frame === 'flyman-0') frame = 'flyman-' + Math.floor(model.animationTime * 12) % 2;
            if (frame === 'whale-0') frame = 'whale-' + Math.floor(model.animationTime) % 2;
            const spriteFrame = this.getFrame(frame);
            if (!spriteFrame) continue;
            visible.add(d.id); let node = this.items.get(d.id);
            if (!node) { node = this.sprite(d.name, frame, this.decorations); this.items.set(d.id, node); }
            node.active = true;
            node.getComponent(Sprite)!.spriteFrame = spriteFrame;
            node.getComponent(Sprite)!.color = new Color(d.color[0], d.color[1], d.color[2], d.color[3]);
            if (d.frame === 'skyline') {
                // The neighbors have their own 3D pass, sharing the gameplay
                // camera. Composite that pass below the crane and floor pass.
                node.getComponent(UITransform)!.setContentSize(this.width, this.height + Math.abs(this.center) * 2);
                node.setPosition(0, this.center);
            } else {
                // Native dimensions describe placement bounds. New artwork
                // keeps its own aspect ratio within those bounds.
                const ratio = Math.min(w / spriteFrame.rect.width, h / spriteFrame.rect.height);
                node.getComponent(UITransform)!.setContentSize(spriteFrame.rect.width * ratio, spriteFrame.rect.height * ratio);
                node.setPosition(pos.x, pos.y);
            }
            node.setScale(d.flipX ? -1 : 1, 1, 1); node.setRotationFromEuler(0, 0, d.angle);
            drawOrder.push({ node, layer: d.sortingLayer, order: d.sortingOrder,
                distance: x * x + (y - model.cameraY) ** 2 + (z + model.config.camera.distance) ** 2, id: d.id });
        }
        this.items.forEach((node, id) => {
            if (!visible.has(id)) {
                if (node === this.city) node.active = false;
                else { node.destroy(); this.items.delete(id); }
            }
        });
        this.updateAmbientStars(model, drawOrder);
        // Unity sorts transparent scenery by Sorting Layer, Order, then perspective distance.
        // Include the skyline in this pass so clouds cannot cover its facades. Re-created
        // nodes must regain their original order after culling or a collapse camera return.
        drawOrder.sort((a, b) => a.layer - b.layer || a.order - b.order || b.distance - a.distance || a.id - b.id);
        drawOrder.forEach((entry, index) => { if (entry.node.getSiblingIndex() !== index) entry.node.setSiblingIndex(index); });
        this.drawRig(model);
        this.rain.update(model.cameraY, model.config.camera.distance, this.width, this.height, this.center);
        for (let i = this.residents.length - 1; i >= 0; i--) {
            const r = this.residents[i]; r.age = Math.max(0, model.animationTime - r.startedAt);
            if (r.age >= r.duration || model.floors.indexOf(r.floor) < 0) { r.node.destroy(); this.residents.splice(i, 1); continue; }
            const t = 1 - (1 - r.age / r.duration) ** 2;
            const x = r.x + (r.floor.x - r.x) * t;
            const y = r.y + (houseRootY(r.floor) + (r.floor.base ? -.3 : .3) - r.y) * t;
            const config = this.data.residents[r.color];
            const pos = this.project(x, y, .4 * t);
            const edge = this.project(x + config.width, y + config.height, .4 * t);
            r.node.setPosition(pos.x, pos.y - this.center);
            r.node.getComponent(UITransform)!.setContentSize(Math.abs(edge.x - pos.x), Math.abs(edge.y - pos.y));
            // Ctrl flips the left emitter; the red prefab has an additional negative X scale.
            r.node.setScale(r.sign * (config.flipX ? -1 : 1), 1, 1);
            const frame = Math.min(config.frames - 1, Math.floor(cityHermite(config.frameCurve, r.age % config.life / config.life) * config.frameScale * config.frames));
            r.node.getComponent(Sprite)!.spriteFrame = this.atlas.getSpriteFrame(`resident-${r.color}-${frame}`);
        }
        this.updateGlows(model);
        this.updateContacts(model);
        const effect = this.data.effects.match_star;
        // Original 60 Hz captures retain sqrt(1-dampen) of excess speed each
        // step; the serialized value is normalized to a 30 Hz reference clock.
        const speedRetention = Math.pow(1 - effect.dampen, CITY_RULES.step * effect.dampenReferenceHz);
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i], age = Math.max(0, model.animationTime - s.startedAt);
            if (age + 1e-7 >= effect.life || model.floors.indexOf(s.floor) < 0) {
                s.node.destroy(); s.trail.removeFromParent(); s.trail.destroy(); this.sparks.splice(i, 1); continue;
            }
            // Use the same fixed clock as gameplay; render frequency must not change damping.
            while (s.age + CITY_RULES.step <= age + 1e-8) {
                // Native billboard rotation is clockwise and samples angular
                // velocity at the start of the simulation step.
                s.rotation -= cityHermite(effect.rotation, s.age / effect.life) * effect.rotationScale * CITY_RULES.step;
                s.age += CITY_RULES.step;
                // Unity damps the excess above the limit, approaching it each simulation step.
                if (s.speed > effect.limitSpeed) s.speed = effect.limitSpeed + (s.speed - effect.limitSpeed) * speedRetention;
                s.radius += s.speed * CITY_RULES.step;
                const last = s.history[s.history.length - 1];
                if (!last || s.radius - last.radius >= effect.trail.minDistance) s.history.push({ age: s.age, radius: s.radius });
                while (s.history.length && s.history[0].age + effect.trail.life < s.age) s.history.shift();
            }
            const radius = effect.scale * s.radius, angle = s.angle;
            const x = s.floor.x + effect.position[0] + Math.cos(angle) * radius, y = s.floor.y + effect.position[1] + Math.sin(angle) * radius, z = effect.position[2];
            const pos = this.project(x, y, z);
            const size = effect.scale * effect.startSize * (effect.size.length ? Math.max(0, cityHermite(effect.size, s.age / effect.life)) : 1);
            const width = Math.abs(this.project(x, y + size, z).y - pos.y);
            s.node.setPosition(pos.x, pos.y - this.center); s.node.getComponent(UITransform)!.setContentSize(width, width);
            s.node.setRotationFromEuler(0, 0, s.rotation * 180 / Math.PI);
            const tail = s.history[0];
            s.trail.active = false;
            if (!tail) continue;
            const length = effect.scale * (s.radius - tail.radius);
            const last = this.project(x - Math.cos(angle) * length, y - Math.sin(angle) * length, z);
            const dx = pos.x - last.x, dy = pos.y - last.y, distance = Math.hypot(dx, dy);
            if (distance < .001) continue;
            // Native stretched UV runs from the particle (U=0) to its oldest retained vertex (U=1).
            s.trail.active = true; s.trail.setPosition((pos.x + last.x) / 2, (pos.y + last.y) / 2 - this.center);
            s.trail.setRotationFromEuler(0, 0, Math.atan2(-dy, -dx) * 180 / Math.PI);
            s.trail.getComponent(UITransform)!.setContentSize(distance, width * effect.trail.width);
        }
    }
    private updateContacts(model: CityBloxxModel): void {
        for (let i = this.contacts.length - 1; i >= 0; i--) {
            const c = this.contacts[i], age = Math.max(0, model.animationTime - c.startedAt);
            if (age >= c.life || model.floors.indexOf(c.floor) < 0) {
                c.graphics.node.destroy(); this.contacts.splice(i, 1); continue;
            }
            const a = c.floor.angle * Math.PI / 180, t = age / c.life;
            const left = this.project(c.floor.x - .36 * Math.cos(a), c.floor.y - .36 * Math.sin(a) + .015, .61);
            const right = this.project(c.floor.x + .36 * Math.cos(a), c.floor.y + .36 * Math.sin(a) + .015, .61);
            const span = Math.hypot(right.x - left.x, right.y - left.y), half = span * (.5 + t * .12);
            const g = c.graphics, alpha = Math.round(255 * (1 - t) ** 1.4);
            g.node.setPosition((left.x + right.x) / 2, (left.y + right.y) / 2 - this.center);
            g.node.setRotationFromEuler(0, 0, Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI);
            g.clear();
            const color = new Color(c.color); color.a = Math.round(alpha * .35);
            g.strokeColor = color; g.lineWidth = 7 + c.level;
            g.moveTo(-half, 0); g.lineTo(half, 0); g.stroke();
            g.strokeColor = new Color(255, 255, 240, alpha); g.lineWidth = 2.2;
            g.moveTo(-half, 0); g.lineTo(half, 0); g.stroke();
            color.a = alpha; g.strokeColor = color; g.lineWidth = 2;
            for (const sign of [-1, 1]) {
                const x = sign * (half + 6 + t * 14);
                g.moveTo(x, 2); g.lineTo(x + sign * (5 + c.level * 2), 6 + c.level * 2); g.stroke();
                if (c.level >= 2) {
                    g.moveTo(x - sign * 3, 10); g.lineTo(x - sign * 3, 15 + c.level); g.stroke();
                }
            }
        }
    }
    private starParticles(e: AmbientStars, elapsed: number): { position: number[]; size: number; alpha: number }[] {
        // Native prewarm covers the three-second particle lifetime. Loop mesh
        // emission advances one vertex per birth (10/s), wrapping after 17.
        const time = Math.max(0, elapsed) + e.prewarm, last = Math.floor(time * e.rate + 1e-7) - 1;
        const result: { position: number[]; size: number; alpha: number }[] = [];
        for (let serial = Math.max(0, last - Math.ceil(e.life * e.rate) + 1); serial <= last; serial++) {
            const age = time - (serial + 1) / e.rate;
            if (age < 0 || age >= e.life) continue;
            const phase = age / e.life;
            let alpha = e.alpha[e.alpha.length - 1][1];
            for (let i = 1; i < e.alpha.length; i++) if (phase <= e.alpha[i][0]) {
                const a = e.alpha[i - 1], b = e.alpha[i];
                alpha = a[1] + (b[1] - a[1]) * (phase - a[0]) / (b[0] - a[0]); break;
            }
            // Stable birth-local randomness keeps size independent of rendering
            // frequency and viewport culling; Unity's private RNG is not copied.
            let hash = Math.imul(serial + 1, 0x45d9f3b) ^ e.id;
            hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
            const random = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
            result.push({ position: e.vertices[Math.floor(serial * e.meshSpeed) % e.vertices.length],
                size: e.size[0] + (e.size[1] - e.size[0]) * random, alpha });
        }
        return result;
    }
    private updateAmbientStars(model: CityBloxxModel, drawOrder: SceneryOrder[]): void {
        const visible = new Set<number>();
        for (const e of this.data.ambient.stars) {
            const [x, y, z] = e.origin, margin = Math.max(...e.size);
            const bottom = this.project(x, e.bounds[0] - margin, -z).y;
            const top = this.project(x, e.bounds[1] + margin, -z).y;
            if (top < -this.height / 2 || bottom > this.height / 2) continue;
            visible.add(e.id);
            let g = this.ambientStars.get(e.id);
            if (!g) { g = this.make(e.name, this.decorations).addComponent(Graphics); this.ambientStars.set(e.id, g); }
            g.clear();
            // Original whitestar_little is a solid white 3x3 nearest texture.
            // Drawing the projected quad preserves its crisp square shape at
            // any pixel density, with native SrcAlpha/OneMinusSrcAlpha blending.
            for (const p of this.starParticles(e, model.animationTime)) {
                const [px, py, pz] = p.position, center = this.project(px, py, -pz);
                const size = Math.abs(this.project(px, py + p.size, -pz).y - center.y);
                g.fillColor = new Color(255, 255, 255, Math.round(p.alpha * 255));
                g.rect(center.x - size / 2, center.y - size / 2, size, size); g.fill();
            }
            drawOrder.push({ node: g.node, layer: e.sortingLayer, order: e.sortingOrder,
                distance: x*x + (y-model.cameraY)**2 + (z+model.config.camera.distance)**2, id: e.id });
        }
        this.ambientStars.forEach((g, id) => { if (!visible.has(id)) { g.node.destroy(); this.ambientStars.delete(id); } });
    }
    private updateGlows(model: CityBloxxModel): void {
        const e = this.data.effects.star_3;
        this.glows.forEach((glow, id) => {
            // House.Update rotates RotAnchor, while StarEffect is parented to the unrotated House root.
            const f = glow.floor, x = f.x + e.position[0], y = f.y + e.position[1], z = e.position[2];
            const pos = this.project(x, y, z), unit = Math.abs(this.project(x, y + 1, z).y - pos.y);
            // Keep three world units below the viewport for the two-floor collapse/camera return.
            if (model.floors.indexOf(f) < 0 || pos.y + unit / 2 < -this.height / 2 - 3 * unit) {
                glow.node.destroy(); this.glows.delete(id); return;
            }
            const phase = (model.animationTime - glow.startedAt) % e.life / e.life;
            const frame = Math.min(e.frames - 1, Math.floor(cityHermite(e.frameCurve, phase) * e.frameScale * e.frames));
            const spriteFrame = this.atlas.getSpriteFrame(`combo-star-${frame}`);
            glow.node.active = !!spriteFrame; // The native sheet's last quarter is empty.
            if (spriteFrame) glow.node.getComponent(Sprite)!.spriteFrame = spriteFrame;
            glow.node.setPosition(pos.x, pos.y - this.center);
            glow.node.getComponent(UITransform)!.setContentSize(unit * e.startSize, unit * e.startSize);
        });
    }
    private clearGlows(): void {
        this.glows.forEach(glow => glow.node.destroy()); this.glows.clear();
    }
    private drawRig(model: CityBloxxModel): void {
        const first = !model.tower;
        const joints = cityCraneRig(model.config, first, first ? model.animationTime : model.normalTime);
        const p = joints[joints.length - 1], angle = (first ? 0 : p.x * model.config.rotRate) * Math.PI / 180;
        const bottomY = p.y + model.moveY - (first ? CITY_RULES.height : 0);
        const floorTop = this.project(p.x - CITY_RULES.height * Math.sin(angle),
            bottomY + CITY_RULES.height * Math.cos(angle), 0);
        const unit = Math.abs(this.project(0, 1, 0).y - this.project(0, 0, 0).y);
        const armFrame = this.atlas.getSpriteFrame('crane-arm')!;
        // The native rig root sits outside a portrait viewport. Keep its
        // decorative boom inside the safe playfield; the hook and load still
        // use the unchanged animated world joints and collision geometry.
        const safeHeight = this.rig.getComponent(UITransform)!.height;
        const uiScale = Math.min(1, this.width / 750, safeHeight / 960);
        const armWidth = 300 * uiScale, armHeight = armWidth * armFrame.rect.height / armFrame.rect.width;
        const armTop = this.center + safeHeight / 2 - 235 * uiScale;
        const armX = this.width / 2 - 24 * uiScale - armWidth / 2;
        this.crane.getComponent(UITransform)!.setAnchorPoint(.5, .5);
        this.crane.getComponent(UITransform)!.setContentSize(armWidth, armHeight);
        this.crane.setPosition(armX, armTop - armHeight / 2 - this.center);
        this.crane.setScale(-1, 1, 1);
        this.crane.setRotationFromEuler(0, 0, 0);
        // Suspension continues to use the original animated joint in world
        // coordinates; decorative artwork never moves the playable floor.
        const tipX = armX - armWidth * .43, tipY = armTop - armHeight * .1;
        const slingFrame = this.atlas.getSpriteFrame('sling')!;
        const slingWidth = unit * 1.04, slingHeight = slingWidth * slingFrame.rect.height / slingFrame.rect.width;
        const apexX = floorTop.x - slingHeight * Math.sin(angle), apexY = floorTop.y + slingHeight * Math.cos(angle);
        this.sling.getComponent(UITransform)!.setContentSize(slingWidth, slingHeight);
        this.sling.setPosition(apexX, apexY - this.center);
        this.sling.setRotationFromEuler(0, 0, angle * 180 / Math.PI);
        const hookFrame = this.atlas.getSpriteFrame('hook')!, hookHeight = unit * .25;
        this.hook.getComponent(UITransform)!.setContentSize(hookHeight * hookFrame.rect.width / hookFrame.rect.height, hookHeight);
        this.hook.setPosition(apexX, apexY - this.center);
        const g = this.cables; g.clear();
        g.strokeColor = new Color('#70818B'); g.lineWidth = Math.max(1, unit * .014);
        g.moveTo(tipX, tipY - this.center); g.lineTo(apexX, apexY + hookHeight - this.center); g.stroke();
        g.strokeColor = new Color(226, 217, 198, 170); g.lineWidth = Math.max(.5, unit * .004);
        g.moveTo(tipX + .8, tipY - this.center); g.lineTo(apexX + .8, apexY + hookHeight - this.center); g.stroke();
    }
    skyColorAt(screenY: number): Color {
        const bands = this.data.bands;
        const origin = this.project(0, 0, -5), unit = this.project(0, 1, -5).y - origin.y;
        const altitude = (screenY - origin.y) / unit;
        let a = bands[0].color, b = a, t = 0;
        for (let i = 0; i < bands.length - 1; i++) {
            const low = bands[i], high = bands[i + 1];
            if (altitude < low.y) break;
            a = low.color; b = high.color;
            t = Math.max(0, Math.min(1, (altitude - low.y) / (high.y - low.y)));
            if (altitude <= high.y) break;
        }
        return new Color(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    private paintSky(): void {
        const g = this.gradient; g.clear();
        // Continuous color interpolation keeps the entire ascent readable.
        for (let y = -this.height / 2; y < this.height / 2; y += 8) {
            g.fillColor = this.skyColorAt(y);
            g.rect(-this.width / 2, y, this.width, 9); g.fill();
        }
    }
    private paintRearPavement(): void {
        // Keep the background street joined to the actual building depth.
        // The original city is made of neighboring full-height facades;
        // a separate distant horizon would expose an empty strip on ascent.
        const y = CITY_GROUND.surfaceY, farZ = this.streetBackZ, nearZ = 9.5;
        const far = this.project(0, y, farZ), near = this.project(0, y, nearZ), g = this.rearPavement;
        g.node.active = far.y >= -this.height / 2 && near.y <= this.height / 2;
        g.clear(); if (!g.node.active) return;
        // Continue the background under the bottom safe inset as well. The
        // interactive world is safely clipped, but the plaza must cover the screen.
        g.fillColor = new Color(CITY_GROUND.pavingColor);
        g.rect(-this.width / 2, -this.height / 2, this.width, far.y + this.height / 2); g.fill();
        g.strokeColor = new Color(151, 169, 162, 70); g.lineWidth = .65;
        for (let z = farZ; z < nearZ; z += CITY_GROUND.cell) {
            const a = this.project(-12, y, z), b = this.project(12, y, z);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        for (let x = -9; x <= 9; x += CITY_GROUND.cell) {
            const a = this.project(x, y, nearZ), b = this.project(x, y, farZ);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        g.stroke();
    }
    private make(name: string, parent: Node): Node { const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform); return n; }
    private getFrame(frame: string): SpriteFrame | null {
        return frame === 'skyline' ? this.cityFrame : this.atlas.getSpriteFrame(frame);
    }
    private sprite(name: string, frame: string, parent: Node): Node {
        const n = this.make(name, parent), s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.spriteFrame = this.getFrame(frame); return n;
    }
    reset(): void {
        this.rain.reset(); this.clearEffects();
    }
    private clearEffects(): void {
        this.ambientStars.forEach(g => g.node.destroy()); this.ambientStars.clear();
        this.residents.forEach(r => r.node.destroy()); this.residents.length = 0;
        this.sparks.forEach(s => { s.node.destroy(); s.trail.removeFromParent(); s.trail.destroy(); }); this.sparks.length = 0;
        this.contacts.forEach(c => c.graphics.node.destroy()); this.contacts.length = 0;
        this.clearGlows(); this.lastBand = -Infinity;
    }
    dispose(): void {
        this.clearEffects(); this.rain.dispose(); this.items.clear(); this.background.destroy(); this.rearPavement.node.destroy();
        this.decorations.destroy(); this.rig.destroy(); this.foreground.destroy();
        this.assets.releaseRuntimeAsset(this.trailFrame);
        this.assets.releaseRuntimeAsset(this.trailMaterial); this.assets.releaseRuntimeAsset(this.glowMaterial);
    }
}

function houseRootY(floor: CityFloor): number {
    // FirstHouse's mesh anchor is local Y=-.8; normal floors use Y=0.
    // The model stores mesh-bottom positions, while native resident paths use
    // the House root: first entry is therefore .8-.3=.5 above the foundation.
    return floor.y + (floor.base ? CITY_RULES.height : 0);
}
