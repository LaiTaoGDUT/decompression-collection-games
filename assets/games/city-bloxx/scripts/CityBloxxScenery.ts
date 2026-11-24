import { Color, EffectAsset, gfx, Graphics, Mask, Material, Node, Rect, Size, Sprite, SpriteAtlas, SpriteFrame, Texture2D, UITransform, Vec3, Vec4 } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { CITY_RULES, CityBloxxModel, cityCraneRig, cityHermite, type CityEvent, type CityFloor, type CityFalling } from './CityBloxxModel';
import { CITY_ASSETS } from './CityBloxxView';
import type { CityHudConfig } from './CityBloxxHud';
import { CityBloxxRain, type CityRainConfig } from './CityBloxxRain';
import { cityComboMilestone, cityComboStage } from './CityBloxxFeedback';
import { CITY_GROUND } from './CityBloxxGround';
import { CityBloxxSky, type CitySkyPanels } from './CityBloxxSky';
import { CityBloxxSkyLife } from './CityBloxxSkyLife';

/** The painted skyline stands on the far end of the street, behind the plaza fence. */
export const CITY_SKYLINE = Object.freeze({ depth: 9, baseY: CITY_GROUND.surfaceY });
const PERFECT_GOLD = '#FFE6A8';
const PERFECT_TRAIL = '#FFC860B4';
const GLOW_COUNT = 6;

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
    items: Decoration[];
    effects: { match_star: Effect; star_3: FloorEffect };
    residents: Record<'red' | 'blue', ResidentConfig>;
    hud: CityHudConfig;
    ambient: { stars: AmbientStars[]; rain: CityRainConfig };
}
interface EffectSprite { node: Node; sprite: Sprite; transform: UITransform; color: Color; }
interface Resident { node: Node; floor: CityFloor; x: number; y: number; age: number; startedAt: number; duration: number; color: 'red' | 'blue'; sign: number; }
interface Spark {
    node: Node; trail: Node; floor: CityFloor; age: number; startedAt: number; angle: number; radius: number; speed: number; rotation: number;
    history: { age: number; radius: number }[];
}
/** One tiny twinkle orbiting a perfectly placed floor; offsets are in world units from its base centre. */
interface FloorGlow { node: Node; floor: CityFloor; startedAt: number; dx: number; dy: number; size: number; period: number; phase: number; }
/** One sprite of the landing impact: side dust puffs, a flattened shock ring or a burst sparkle. */
interface Impact { node: Node; kind: 'dust' | 'ring' | 'sparkle'; floor: CityFloor; startedAt: number; life: number; angle: number; reach: number; spin: number; }

/** Scene sprites use the same perspective camera as the original meshes and suspended floor. */
export class CityBloxxScenery {
    readonly sky: CityBloxxSky;
    private readonly skyLife: CityBloxxSkyLife;
    private readonly background: Node;
    private readonly rearPavement: Graphics;
    private readonly streetBackZ = -CITY_SKYLINE.depth;
    private readonly city: Node;
    private readonly cityFrame: SpriteFrame;
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
    private readonly fx: SpriteAtlas;
    private readonly trailFrame: SpriteFrame;
    private readonly trailMaterial: Material;
    private readonly glowMaterial: Material;
    private readonly items = new Map<number, Node>();
    private readonly ambientStars = new Map<number, Graphics>();
    private readonly rain: CityBloxxRain;
    private readonly residents: Resident[] = [];
    private readonly sparks: Spark[] = [];
    private readonly glows: FloorGlow[] = [];
    private readonly impacts: Impact[] = [];
    private readonly effectPools = new Map<string, Node[]>();
    private readonly effectViews = new Map<Node, EffectSprite>();
    private readonly roofLeft = new Vec3();
    private readonly roofRight = new Vec3();
    private readonly emptyLoad: CityFalling = { x: 0, y: 0, angle: 0, base: true, speed: 0, drift: 0 };
    private readonly rigJoints: ReturnType<typeof cityCraneRig> = [];
    private readonly renderPose = { x: 0, y: 0, angle: 0 };
    private readonly renderLoad: CityFalling = { x: 0, y: 0, angle: 0, base: true, speed: 0, drift: 0 };
    private readonly point = new Vec3();
    private readonly edge = new Vec3();
    private readonly visibleItems = new Set<number>();
    private readonly visibleStars = new Set<number>();
    private readonly drawOrder: SceneryOrder[] = [];
    private width = 750;
    private height = 1334;
    private playHeight = 1334;
    private center = 0;
    private lastCamera = -Infinity;

    constructor(parent: Node, worldProjection: Node, private readonly atlas: SpriteAtlas, skyline: Texture2D,
        private readonly data: CityEnvironment, skyLayer: number, private readonly project: (x: number, y: number, z: number, out?: Vec3) => Vec3,
        private readonly assets: AssetService, particleEffect: EffectAsset, trailLine: Texture2D, trailMask: Texture2D, rainLine: Texture2D,
        skyPanels: CitySkyPanels, fx: SpriteAtlas,
        private readonly projectRoof: (floor: CityFalling, left: Vec3, right: Vec3) => void) {
        this.fx = fx;
        this.background = this.make('CityAltitudeSky', parent); this.background.layer = skyLayer; this.background.setSiblingIndex(0);
        this.sky = new CityBloxxSky(this.background, CITY_ASSETS, assets, skyPanels);
        this.skyLife = new CityBloxxSkyLife(this.sky, fx);
        const rearPavement = this.make('CityRearPavement', parent); rearPavement.layer = skyLayer;
        this.rearPavement = rearPavement.addComponent(Graphics);
        this.decorations = this.make('CityAltitudeScenery', parent); this.decorations.layer = skyLayer;
        this.cityFrame = assets.createSpriteFrame(CITY_ASSETS, skyline);
        this.cityFrame.packable = false; this.cityFrame.rect = new Rect(0, 0, skyline.width, skyline.height);
        this.cityFrame.originalSize = new Size(skyline.width, skyline.height);
        this.city = this.make('CityPaintedSkyline', this.decorations);
        const citySprite = this.city.addComponent(Sprite);
        citySprite.sizeMode = Sprite.SizeMode.CUSTOM; citySprite.spriteFrame = this.cityFrame;
        this.city.getComponent(UITransform)!.setAnchorPoint(.5, 0);
        const item = data.items.find(d => d.frame === 'skyline');
        if (!item) throw Error('City skyline configuration is missing');
        this.city.active = false; this.items.set(item.id, this.city);
        // The projected opaque floor faces must occlude the rig. Residents and
        // effects keep their separate foreground pass in front of those faces.
        this.rig = this.make('CityRigBehindFloors', parent);
        this.rig.setSiblingIndex(worldProjection.getSiblingIndex());
        this.rig.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.foreground = this.make('CityResidentsAndEffects', parent);
        this.foreground.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.cables = this.make('CitySuspension', this.rig).addComponent(Graphics);
        // Unit cable geometry is immutable; transforms stretch it between its endpoints.
        this.cables.fillColor = new Color('#70818B'); this.cables.rect(0, -.5, 1, 1); this.cables.fill();
        this.cables.fillColor = new Color(226, 217, 198, 170); this.cables.rect(0, -.5, 1, .28); this.cables.fill();
        this.crane = this.sprite('CityCrane', 'crane-arm', this.rig);
        this.hook = this.sprite('CityHook', 'hook', this.rig);
        this.hook.getComponent(UITransform)!.setAnchorPoint(.45, .2);
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
        this.playHeight = top - bottom;
        this.sky.layout(width, height);
        for (const layer of [this.rig, this.foreground]) {
            layer.setPosition(0, this.center); layer.getComponent(UITransform)!.setContentSize(width, top - bottom);
        }
        this.decorations.getComponent(UITransform)!.setContentSize(width, height); this.lastCamera = -Infinity;
    }
    advance(dt: number): void { this.rain.advance(dt); }
    placeBelowEffects(node: Node): void {
        // Keep the original upward stars and trails visible over the new
        // landing notice, while the notice remains above the floor meshes.
        node.setSiblingIndex(this.foreground.getSiblingIndex());
    }
    event(event: CityEvent, model: CityBloxxModel): void {
        if (event.type === 'bonus') { this.clearGlows(); return; }
        if (event.type === 'collapse') { this.removeGlows(g => g.floor === event.floor); return; }
        if (event.type !== 'land') return;
        // Ctrl.SetOneHouse: perfect/foundation spawn two; ordinary placement spawns one, independent of population.
        const sides = event.perfect ? [-1, 1] : [Math.random() < .5 ? -1 : 1];
        for (const sign of sides) {
            const color = Math.random() < .5 ? 'blue' : 'red';
            const node = this.takeEffect('CityResident', this.atlas.getSpriteFrame(`resident-${color}-0`)!, this.foreground);
            this.residents.push({ node, floor: event.floor, x: sign * 3, y: houseRootY(event.floor) + 1.6,
                age: 0, startedAt: model.animationTime, duration: 3 + Math.random(), color, sign });
        }
        this.impact(event.floor, model, event.perfect);
        if (event.floor.base) return;
        if (event.perfect) this.burst(event.floor, model.animationTime);
        if (model.comboTime > 0) this.addGlows(event.floor, model.animationTime);
    }
    /** Native StarEffect also covers ordinary successful floors during SuperTime. */
    private addGlows(floor: CityFloor, startedAt: number): void {
        for (let i = 0; i < GLOW_COUNT; i++) {
            const r = (k: number) => { const v = Math.sin(floor.id * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
            const node = this.takeEffect('CityFloorGlow', this.fx.getSpriteFrame('fx-sparkle')!, this.floorGlows, this.glowMaterial, PERFECT_GOLD);
            // Alternate sides; one in three perches over the roof line.
            const roof = i % 3 === 2, side = i % 2 ? 1 : -1;
            this.glows.push({ node, floor, startedAt, size: .1 + .09 * r(0), period: .8 + .7 * r(1), phase: r(2),
                dx: roof ? (r(3) - .5) * .8 : side * (.42 + .16 * r(3)), dy: roof ? CITY_RULES.height + .04 + .08 * r(4) : .08 + .64 * r(4) });
        }
    }
    private removeGlows(match: (glow: FloorGlow) => boolean): void {
        for (let i = this.glows.length - 1; i >= 0; i--) if (match(this.glows[i])) { this.recycleEffect(this.glows[i].node); this.glows.splice(i, 1); }
    }
    private impact(floor: CityFloor, model: CityBloxxModel, perfect: boolean): void {
        const startedAt = model.animationTime;
        const add = (kind: Impact['kind'], life: number, angle = 0, reach = 0, spin = 0, color?: string) => {
            const node = this.takeEffect('CityImpact-' + kind, this.fx.getSpriteFrame('fx-' + kind)!, this.contactLayer, undefined, color);
            this.impacts.push({ node, kind, floor, startedAt, life, angle, reach, spin });
        };
        for (const side of [-1, 1]) add('dust', perfect ? .62 : .5, side > 0 ? 0 : Math.PI, 1);
        if (!perfect || floor.base) return;
        const stage = cityComboStage(model.combo), milestone = cityComboMilestone(model.combo);
        add('ring', milestone ? .62 : .48, 0, milestone ? 1.9 : 1.45, 0, '#FFF1C4');
        const count = 6 + stage.level * 2;
        for (let i = 0; i < count; i++) {
            // Evenly fanned upward with a fixed per-index jitter: stable, never random.
            const angle = Math.PI * (.08 + .84 * (i + .5) / count) + Math.sin(i * 12.9898) * .12;
            add('sparkle', .5 + (i % 3) * .07, angle, .75 + (i % 4) * .18 + stage.level * .1, (i % 2 ? 1 : -1) * (160 + i * 25));
        }
    }
    private burst(floor: CityFloor, startedAt: number): void {
        const effect = this.data.effects.match_star;
        // The native prefab has a fixed seed and always emits the same three
        // particles. Import its measured batch positions instead of consuming
        // the unrelated random stream used by residents and gameplay.
        for (const birth of effect.births) {
            const radius = Math.hypot(birth[0], birth[1]);
            const trail = this.takeEffect('CityPerfectTrail', this.trailFrame, this.trails, this.trailMaterial, PERFECT_TRAIL); trail.active = false;
            const star = this.takeEffect('CityPerfectStar', this.fx.getSpriteFrame('fx-sparkle')!, this.foreground);
            this.sparks.push({ node: star, trail, floor, age: 0, startedAt,
                angle: Math.atan2(birth[1], birth[0]), radius, speed: effect.speed, rotation: 0,
                history: [{ age: 0, radius }] });
        }
    }
    update(model: CityBloxxModel): void {
        this.sky.update(model.renderSkyFloors);
        this.skyLife.update(model.renderAnimationTime);
        if (Math.abs(model.renderCameraY - this.lastCamera) > .015) {
            this.paintRearPavement(); this.lastCamera = model.renderCameraY;
        }
        const visible = this.visibleItems, drawOrder = this.drawOrder;
        visible.clear(); drawOrder.length = 0;
        for (const d of this.data.items) {
            let x = d.x, y = d.y, z = d.z;
            if (d.loop) {
                const p = (d.loop[6] + model.renderAnimationTime * d.loop[7]) % 1;
                x += d.loop[0] + (d.loop[3] - d.loop[0]) * p;
                y += d.loop[1] + (d.loop[4] - d.loop[1]) * p;
                z += d.loop[2] + (d.loop[5] - d.loop[2]) * p;
            }
            if (d.frame === 'skyline') {
                if (!this.placeSkyline()) continue;
                visible.add(d.id); this.city.active = true;
                drawOrder.push({ node: this.city, layer: d.sortingLayer, order: d.sortingOrder,
                    distance: (CITY_SKYLINE.depth + model.config.camera.distance) ** 2, id: d.id });
                continue;
            }
            const pos = this.project(x, y, -z, this.point);
            const edge = this.project(x + d.width, y + d.height, -z, this.edge);
            const w = Math.abs(edge.x - pos.x), h = Math.abs(edge.y - pos.y);
            if (pos.y + h / 2 < -this.height / 2 || pos.y - h / 2 > this.height / 2
                || pos.x + w / 2 < -this.width / 2 || pos.x - w / 2 > this.width / 2) continue;
            let frame = d.frame;
            if (frame === 'flyman-0') frame = 'flyman-' + Math.floor(model.renderAnimationTime * 12) % 2;
            if (frame === 'whale-0') frame = 'whale-' + Math.floor(model.renderAnimationTime) % 2;
            const spriteFrame = this.getFrame(frame);
            if (!spriteFrame) continue;
            visible.add(d.id); let node = this.items.get(d.id);
            if (!node) {
                node = this.sprite(d.name, frame, this.decorations); this.items.set(d.id, node);
                node.getComponent(Sprite)!.color = new Color(d.color[0], d.color[1], d.color[2], d.color[3]);
                node.setScale(d.flipX ? -1 : 1, 1, 1); node.setRotationFromEuler(0, 0, d.angle);
            }
            node.active = true;
            node.getComponent(Sprite)!.spriteFrame = spriteFrame;
            // Native dimensions describe placement bounds. New artwork
            // keeps its own aspect ratio within those bounds.
            const ratio = Math.min(w / spriteFrame.rect.width, h / spriteFrame.rect.height);
            node.getComponent(UITransform)!.setContentSize(spriteFrame.rect.width * ratio, spriteFrame.rect.height * ratio);
            if (node.position.x !== pos.x || node.position.y !== pos.y) node.setPosition(pos.x, pos.y);
            drawOrder.push({ node, layer: d.sortingLayer, order: d.sortingOrder,
                distance: x * x + (y - model.renderCameraY) ** 2 + (z + model.config.camera.distance) ** 2, id: d.id });
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
        this.rain.update(model.renderCameraY, model.config.camera.distance, this.width, this.playHeight, this.center);
        for (let i = this.residents.length - 1; i >= 0; i--) {
            const r = this.residents[i]; r.age = Math.max(0, model.renderAnimationTime - r.startedAt);
            if (r.age >= r.duration || model.floors.indexOf(r.floor) < 0) { this.recycleEffect(r.node); this.residents.splice(i, 1); continue; }
            const t = 1 - (1 - r.age / r.duration) ** 2;
            const pose = model.samplePose(r.floor, this.renderPose);
            const x = r.x + (pose.x - r.x) * t;
            const y = r.y + (pose.y + (r.floor.base ? CITY_RULES.height - .3 : .3) - r.y) * t;
            const config = this.data.residents[r.color];
            const pos = this.project(x, y, .4 * t, this.point);
            const edge = this.project(x + config.width, y + config.height, .4 * t, this.edge);
            r.node.setPosition(pos.x, pos.y - this.center);
            r.node.getComponent(UITransform)!.setContentSize(Math.abs(edge.x - pos.x), Math.abs(edge.y - pos.y));
            // Ctrl flips the left emitter; the red prefab has an additional negative X scale.
            r.node.setScale(r.sign * (config.flipX ? -1 : 1), 1, 1);
            const frame = Math.min(config.frames - 1, Math.floor(cityHermite(config.frameCurve, r.age % config.life / config.life) * config.frameScale * config.frames));
            r.node.getComponent(Sprite)!.spriteFrame = this.atlas.getSpriteFrame(`resident-${r.color}-${frame}`);
        }
        this.updateGlows(model);
        this.updateImpacts(model);
        const effect = this.data.effects.match_star;
        // Original 60 Hz captures retain sqrt(1-dampen) of excess speed each
        // step; the serialized value is normalized to a 30 Hz reference clock.
        const speedRetention = Math.pow(1 - effect.dampen, CITY_RULES.step * effect.dampenReferenceHz);
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i], age = Math.max(0, model.renderAnimationTime - s.startedAt);
            if (age + 1e-7 >= effect.life || model.floors.indexOf(s.floor) < 0) {
                this.recycleEffect(s.node); this.recycleEffect(s.trail); this.sparks.splice(i, 1); continue;
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
            const pose = model.samplePose(s.floor, this.renderPose);
            const x = pose.x + effect.position[0] + Math.cos(angle) * radius, y = pose.y + effect.position[1] + Math.sin(angle) * radius, z = effect.position[2];
            const pos = this.project(x, y, z, this.point);
            const size = effect.scale * effect.startSize * (effect.size.length ? Math.max(0, cityHermite(effect.size, s.age / effect.life)) : 1);
            // The four-point sparkle has a smaller visual core than the native star.
            const width = Math.abs(this.project(x, y + size, z, this.edge).y - pos.y) * 1.35;
            s.node.setPosition(pos.x, pos.y - this.center); s.node.getComponent(UITransform)!.setContentSize(width, width);
            s.node.setRotationFromEuler(0, 0, s.rotation * 180 / Math.PI);
            const tail = s.history[0];
            s.trail.active = false;
            if (!tail) continue;
            const length = effect.scale * (s.radius - tail.radius);
            const last = this.project(x - Math.cos(angle) * length, y - Math.sin(angle) * length, z, this.edge);
            const dx = pos.x - last.x, dy = pos.y - last.y, distance = Math.hypot(dx, dy);
            if (distance < .001) continue;
            // Native stretched UV runs from the particle (U=0) to its oldest retained vertex (U=1).
            s.trail.active = true; s.trail.setPosition((pos.x + last.x) / 2, (pos.y + last.y) / 2 - this.center);
            s.trail.setRotationFromEuler(0, 0, Math.atan2(-dy, -dx) * 180 / Math.PI);
            s.trail.getComponent(UITransform)!.setContentSize(distance, width * effect.trail.width);
        }
    }
    private updateImpacts(model: CityBloxxModel): void {
        for (let i = this.impacts.length - 1; i >= 0; i--) {
            const c = this.impacts[i], age = Math.max(0, model.renderAnimationTime - c.startedAt);
            if (age >= c.life || model.floors.indexOf(c.floor) < 0) { this.recycleEffect(c.node); this.impacts.splice(i, 1); continue; }
            const t = age / c.life, ease = 1 - (1 - t) ** 3;
            const pose = model.samplePose(c.floor, this.renderPose);
            const base = this.project(pose.x, pose.y + .02, .4, this.point);
            const unit = Math.abs(this.project(pose.x, pose.y + 1, .4, this.edge).y - base.y);
            const sprite = c.node.getComponent(Sprite)!, ui = c.node.getComponent(UITransform)!;
            const color = this.effectViews.get(c.node)!.color;
            let x = base.x, y = base.y, w = 0, h = 0, alpha = 1;
            if (c.kind === 'dust') {
                // Puffs slide out from under both edges of the floor and fade.
                const dir = Math.cos(c.angle);
                x += dir * unit * (.3 + .38 * ease); y += unit * .06 * ease;
                w = unit * (.36 + .3 * ease); h = w * .57; alpha = (1 - t) ** 1.6;
                c.node.setScale(dir < 0 ? -1 : 1, 1, 1);
            } else if (c.kind === 'ring') {
                w = unit * c.reach * (.35 + .65 * ease); h = w * .3; alpha = (1 - t) ** 1.2;
            } else {
                const d = unit * c.reach * ease;
                x += Math.cos(c.angle) * d; y += Math.sin(c.angle) * d * .85 + unit * .1;
                w = h = unit * .2 * (1 - .45 * t) * (t < .12 ? t / .12 : 1); alpha = 1 - t * t;
                c.node.setRotationFromEuler(0, 0, c.spin * age);
            }
            c.node.setPosition(x, y - this.center); ui.setContentSize(w, h);
            color.a = Math.round(255 * alpha); sprite.color = color;
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
        const visible = this.visibleStars; visible.clear();
        for (const e of this.data.ambient.stars) {
            const [x, y, z] = e.origin, margin = Math.max(...e.size);
            const bottom = this.project(x, e.bounds[0] - margin, -z, this.point).y;
            const top = this.project(x, e.bounds[1] + margin, -z, this.point).y;
            if (top < -this.height / 2 || bottom > this.height / 2) continue;
            visible.add(e.id);
            let g = this.ambientStars.get(e.id);
            if (!g) { g = this.make(e.name, this.decorations).addComponent(Graphics); this.ambientStars.set(e.id, g); }
            g.clear();
            // Original whitestar_little is a solid white 3x3 nearest texture.
            // Drawing the projected quad preserves its crisp square shape at
            // any pixel density, with native SrcAlpha/OneMinusSrcAlpha blending.
            for (const p of this.starParticles(e, model.renderAnimationTime)) {
                const [px, py, pz] = p.position, center = this.project(px, py, -pz, this.point);
                const size = Math.abs(this.project(px, py + p.size, -pz, this.edge).y - center.y);
                g.fillColor = new Color(255, 255, 255, Math.round(p.alpha * 255));
                g.rect(center.x - size / 2, center.y - size / 2, size, size); g.fill();
            }
            drawOrder.push({ node: g.node, layer: e.sortingLayer, order: e.sortingOrder,
                distance: x*x + (y-model.renderCameraY)**2 + (z+model.config.camera.distance)**2, id: e.id });
        }
        this.ambientStars.forEach((g, id) => { if (!visible.has(id)) { g.node.destroy(); this.ambientStars.delete(id); } });
    }
    private updateGlows(model: CityBloxxModel): void {
        const z = this.data.effects.star_3.position[2];
        this.removeGlows(glow => {
            const f = glow.floor, pose = model.samplePose(f, this.renderPose), x = pose.x + glow.dx, y = pose.y + glow.dy;
            const pos = this.project(x, y, z, this.point), unit = Math.abs(this.project(x, y + 1, z, this.edge).y - pos.y);
            // Keep three world units below the viewport for the two-floor collapse/camera return.
            if (model.floors.indexOf(f) < 0 || pos.y < -this.height / 2 - 3 * unit) return true;
            const cycle = (model.renderAnimationTime - glow.startedAt) / glow.period + glow.phase;
            const twinkle = Math.sin(Math.PI * (cycle - Math.floor(cycle))) ** 2;
            const size = unit * glow.size * (.35 + .65 * twinkle);
            glow.node.setPosition(pos.x, pos.y - this.center);
            glow.node.setRotationFromEuler(0, 0, -120 * cycle);
            glow.node.getComponent(UITransform)!.setContentSize(size, size);
            const sprite = glow.node.getComponent(Sprite)!, color = this.effectViews.get(glow.node)!.color;
            color.a = Math.round(255 * (.25 + .75 * twinkle)); sprite.color = color;
            return false;
        });
    }
    private clearGlows(): void { this.removeGlows(() => true); }
    private drawRig(model: CityBloxxModel): void {
        const first = !model.tower;
        const attached = !!model.active && (model.phase === 'swing' || model.phase === 'intro');
        let load = this.renderLoad;
        if (attached) { model.samplePose(model.active!, load); load.base = model.active!.base; }
        if (!attached) {
            const joints = cityCraneRig(model.config, first, first ? model.renderAnimationTime : model.renderNormalTime, this.rigJoints);
            const p = joints[joints.length - 1]; load = this.emptyLoad;
            load.x = p.x; load.y = p.y + model.renderMoveY - (first ? CITY_RULES.height : 0);
            load.angle = first ? 0 : p.x * model.config.rotRate; load.base = first;
        }
        this.projectRoof(load, this.roofLeft, this.roofRight);
        const left = this.roofLeft, right = this.roofRight;
        const dx = right.x - left.x, dy = right.y - left.y, span = Math.hypot(dx, dy);
        const cos = dx / span, sin = dy / span, angle = Math.atan2(dy, dx);
        // Source sling: ring centers (8,82)/(140,82), top eye (74,11)
        // in its 148x90 canvas. Bind those pixels to the actual 3D roof rim.
        const scale = span / 132, midpointX = (left.x + right.x) / 2, midpointY = (left.y + right.y) / 2;
        const slingX = midpointX - sin * 82 * scale, slingY = midpointY + cos * 82 * scale;
        const eyeX = midpointX - sin * 71 * scale, eyeY = midpointY + cos * 71 * scale;
        this.sling.active = attached;
        if (attached) {
            this.sling.getComponent(UITransform)!.setContentSize(148 * scale, 90 * scale);
            this.sling.setPosition(slingX, slingY - this.center);
            this.sling.setRotationFromEuler(0, 0, angle * 180 / Math.PI);
        }
        const unit = Math.abs(this.project(0, 1, 0, this.point).y - this.project(0, 0, 0, this.edge).y);
        const armFrame = this.atlas.getSpriteFrame('crane-arm')!;
        const uiScale = Math.min(1, this.width / 750, this.playHeight / 960);
        const armWidth = 400 * uiScale, armHeight = armWidth * armFrame.rect.height / armFrame.rect.width;
        const armTop = this.center + this.playHeight / 2 - 235 * uiScale, armX = -this.width / 2 + armWidth * .3;
        this.crane.getComponent(UITransform)!.setContentSize(armWidth, armHeight);
        const armY = armTop - armHeight / 2 - this.center;
        if (this.crane.position.x !== armX || this.crane.position.y !== armY) this.crane.setPosition(armX, armY);
        const boomAngle = -(first ? 0 : load.x) * .12 * Math.PI / 180;
        this.crane.setRotationFromEuler(0, 0, boomAngle * 180 / Math.PI);
        // Anchor the cable on the arm artwork's pulley, including its flex.
        const tipLocalX = armWidth * (280 / 300 - .5), tipLocalY = armHeight * (.5 - 12 / 142);
        const tipX = armX + tipLocalX * Math.cos(boomAngle) - tipLocalY * Math.sin(boomAngle);
        const tipY = armTop - armHeight / 2 + tipLocalX * Math.sin(boomAngle) + tipLocalY * Math.cos(boomAngle);
        const hookHeight = unit * .25, hookWidth = hookHeight * 20 / 48;
        this.hook.getComponent(UITransform)!.setContentSize(hookWidth, hookHeight);
        this.hook.setPosition(eyeX, eyeY - this.center); this.hook.setRotationFromEuler(0, 0, angle * 180 / Math.PI);
        const cableX = eyeX + .05 * hookWidth * cos - .72 * hookHeight * sin;
        const cableY = eyeY + .05 * hookWidth * sin + .72 * hookHeight * cos;
        const cableDx = cableX - tipX, cableDy = cableY - tipY;
        this.cables.node.setPosition(tipX, tipY - this.center);
        this.cables.node.setRotationFromEuler(0, 0, Math.atan2(cableDy, cableDx) * 180 / Math.PI);
        this.cables.node.setScale(Math.hypot(cableDx, cableDy), Math.max(1, unit * .014), 1);
    }
    /** Returns false when the painted skyline is entirely outside the screen. */
    private placeSkyline(): boolean {
        const base = this.project(0, CITY_SKYLINE.baseY, -CITY_SKYLINE.depth, this.point);
        const frame = this.cityFrame.rect, height = this.width * frame.height / frame.width;
        if (base.y > this.height / 2 || base.y + height < -this.height / 2) return false;
        // Fit Width at 1:1 pixels; the base follows the street at its depth.
        this.city.getComponent(UITransform)!.setContentSize(this.width, height);
        if (this.city.position.y !== base.y) this.city.setPosition(0, base.y);
        return true;
    }
    private paintRearPavement(): void {
        // Keep the background street joined to the actual building depth.
        // The original city is made of neighboring full-height facades;
        // a separate distant horizon would expose an empty strip on ascent.
        const y = CITY_GROUND.surfaceY, farZ = this.streetBackZ, nearZ = 9.5;
        const far = this.project(0, y, farZ, this.point), near = this.project(0, y, nearZ, this.edge), g = this.rearPavement;
        g.node.active = far.y >= -this.height / 2 && near.y <= this.height / 2;
        g.clear(); if (!g.node.active) return;
        // Continue the background under the bottom safe inset as well. The
        // interactive world is safely clipped, but the plaza must cover the screen.
        g.fillColor = new Color(CITY_GROUND.pavingColor);
        g.rect(-this.width / 2, -this.height / 2, this.width, far.y + this.height / 2); g.fill();
        g.strokeColor = new Color(201, 183, 156, 110); g.lineWidth = .65;
        for (let z = farZ; z < nearZ; z += CITY_GROUND.cell) {
            const a = this.project(-12, y, z, this.point), b = this.project(12, y, z, this.edge);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        for (let x = -9; x <= 9; x += CITY_GROUND.cell) {
            const a = this.project(x, y, nearZ, this.point), b = this.project(x, y, farZ, this.edge);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        g.stroke();
    }
    private takeEffect(name: string, frame: SpriteFrame, parent: Node, material?: Material, tint = '#FFFFFF'): Node {
        let pool = this.effectPools.get(name);
        if (!pool) { pool = []; this.effectPools.set(name, pool); }
        let node = pool.pop();
        if (!node) {
            node = this.make(name, parent);
            const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.effectViews.set(node, { node, sprite, transform: node.getComponent(UITransform)!, color: new Color() });
        }
        const view = this.effectViews.get(node)!;
        view.sprite.spriteFrame = frame; view.sprite.customMaterial = material ?? null;
        view.color.fromHEX(tint); view.sprite.color = view.color;
        node.setScale(1, 1, 1); node.setRotationFromEuler(0, 0, 0); node.active = true;
        // Keep the ordering of newly born effects even when their nodes are reused.
        node.setSiblingIndex(parent.children.length - 1);
        return node;
    }
    private recycleEffect(node: Node): void {
        node.active = false;
        const pool = this.effectPools.get(node.name)!;
        if (pool.length < (node.name === 'CityFloorGlow' ? 128 : 32)) pool.push(node);
        else { this.effectViews.delete(node); node.destroy(); }
    }
    /** Prepare both sprite/material paths while the application loading cover is visible. */
    warmup(): () => void {
        const retireRain = this.rain.warmup();
        const borrowed: Node[] = [];
        const fill = (name: string, frame: SpriteFrame, parent: Node, count: number, material?: Material, tint?: string) => {
            for (let i = 0; i < count; i++) {
                const node = this.takeEffect(name, frame, parent, material, tint);
                node.setPosition(0, 0); node.getComponent(UITransform)!.setContentSize(24, 24); borrowed.push(node);
            }
        };
        fill('CityResident', this.atlas.getSpriteFrame('resident-blue-0')!, this.foreground, 16);
        fill('CityImpact-dust', this.fx.getSpriteFrame('fx-dust')!, this.contactLayer, 8);
        fill('CityImpact-ring', this.fx.getSpriteFrame('fx-ring')!, this.contactLayer, 4);
        fill('CityImpact-sparkle', this.fx.getSpriteFrame('fx-sparkle')!, this.contactLayer, 32);
        fill('CityPerfectStar', this.fx.getSpriteFrame('fx-sparkle')!, this.foreground, 6);
        fill('CityPerfectTrail', this.trailFrame, this.trails, 6, this.trailMaterial, PERFECT_TRAIL);
        fill('CityFloorGlow', this.fx.getSpriteFrame('fx-sparkle')!, this.floorGlows, 96, this.glowMaterial, PERFECT_GOLD);
        return () => { borrowed.forEach(node => this.recycleEffect(node)); retireRain(); };
    }
    private make(name: string, parent: Node): Node { const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform); return n; }
    private getFrame(frame: string): SpriteFrame | null { return this.atlas.getSpriteFrame(frame); }
    private sprite(name: string, frame: string, parent: Node): Node {
        const n = this.make(name, parent), s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.spriteFrame = this.getFrame(frame); return n;
    }
    get weather(): ReturnType<CityBloxxRain['snapshot']> { return this.rain.snapshot(); }
    reset(weather?: ReturnType<CityBloxxRain['snapshot']>, model?: CityBloxxModel): void {
        this.rain.reset(weather); this.clearEffects();
        // The last combo placements own the glows; transient landing bursts and
        // sounds are not replayed when loading a saved round.
        if (model && model.comboTime > 0) for (const floor of model.floors.slice(-model.combo)) {
            if (!floor.base) this.addGlows(floor, model.animationTime - floor.age);
        }
    }
    get isRaining(): boolean { return this.rain.isRaining; }
    private clearEffects(): void {
        this.ambientStars.forEach(g => g.node.destroy()); this.ambientStars.clear();
        this.residents.forEach(r => this.recycleEffect(r.node)); this.residents.length = 0;
        this.sparks.forEach(s => { this.recycleEffect(s.node); this.recycleEffect(s.trail); }); this.sparks.length = 0;
        this.impacts.forEach(c => this.recycleEffect(c.node)); this.impacts.length = 0;
        this.clearGlows(); this.lastCamera = -Infinity;
    }
    dispose(): void {
        this.clearEffects(); this.effectPools.clear(); this.effectViews.clear(); this.rain.dispose(); this.items.clear(); this.background.destroy(); this.rearPavement.node.destroy();
        this.visibleItems.clear(); this.visibleStars.clear(); this.drawOrder.length = 0;
        this.decorations.destroy(); this.rig.destroy(); this.foreground.destroy();
        this.skyLife.dispose(); this.sky.dispose(); this.assets.releaseRuntimeAsset(this.cityFrame);
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
