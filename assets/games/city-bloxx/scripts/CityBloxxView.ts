import { Camera, Color, gfx, Mask, Material, Mesh, MeshRenderer, Node, Quat, Rect, RenderTexture, Size,
    Sprite, SpriteFrame, Texture2D, UITransform, utils, Vec3, view } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { cityCurve, cityImpactAngle, type CityBloxxModel, type CityConfig, type CityFalling, type CityFloor } from './CityBloxxModel';
import { CityBloxxGround } from './CityBloxxGround';

export const CITY_ASSETS = 'game-city-bloxx-assets';
export const CITY_WORLD_LAYER = 1 << 19;
const FLASH_LIFE = .45;
// Cocos Creator 3.8.8 RenderTexture.resize clamps each dimension to 2048.
const MAX_RENDER_TEXTURE_SIZE = 2048;
interface MeshData { positions: number[][]; normals?: number[][]; uvs: number[][]; triangles: number[][][]; }
export interface CityBuildingData {
    meshes: Record<string, MeshData>;
    prefabs: Record<string, { mesh: string; textures: string[] }>;
}

/** Native tower meshes and camera, with a miniature plaza at the original landing height. */
export class CityBloxxView {
    readonly root = new Node('CityBloxxWorld');
    readonly camera: Camera;
    readonly projection: Node;
    private readonly projectionImage: Node;
    private readonly meshes = new Map<string, Mesh>();
    private readonly materials = new Map<string, Material>();
    private readonly flashMaterials = new Map<string, Material>();
    private readonly floors = new Map<number, Node>();
    private flash?: { node: Node; floorId: number; material: Material };
    private readonly debris = new Map<number, Node>();
    private readonly floorPool: Node[] = [];
    private readonly angles = new Map<Node, number>();
    private readonly basePool: Node[] = [];
    private readonly buildingTypes = new Map<Node, boolean>();
    private readonly roofs = new Map<string, { halfWidth: number; y: number; z: number }>();
    private readonly flashColor = new Color(255, 226, 160, 0);
    private readonly ground: CityBloxxGround;
    private readonly target: RenderTexture;
    private readonly frame: SpriteFrame;
    private readonly screenPoint = new Vec3();
    private readonly worldPoint = new Vec3();
    private readonly debrisRotation = new Quat();
    private readonly debrisTilt = new Quat();
    private readonly renderPose = { x: 0, y: 0, angle: 0 };
    private readonly visibleFloors: CityFloor[] = [];
    private readonly visibleIds = new Set<number>();
    private readonly debrisIds = new Set<number>();
    private projectionX = 0;
    private projectionY = 0;
    private projectionUnitX = 1;
    private projectionUnitY = 1;
    private projectionCameraY = 0;
    private active?: Node;
    private activeBase?: boolean;
    private playWidth = 750;
    private playHeight = 800;
    private playCenter = 0;
    private worldHeight = 6;
    private skin: 'yellow' | 'blue' = 'yellow';

    constructor(scene: Node, uiParent: Node, private readonly assets: AssetService,
        private readonly buildings: CityBuildingData, textures: Readonly<Record<string, Texture2D>>,
        private readonly nativeCamera: CityConfig['camera']) {
        scene.addChild(this.root); this.root.layer = CITY_WORLD_LAYER;
        this.camera = this.make('CityCamera').addComponent(Camera);
        this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
        this.camera.fovAxis = Camera.FOVAxis.HORIZONTAL;
        this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera.clearColor = new Color(0, 0, 0, 0);
        this.camera.priority = 0; this.camera.near = .1; this.camera.far = 100;
        this.camera.visibility = CITY_WORLD_LAYER;
        this.target = assets.trackRuntimeAsset(CITY_ASSETS, new RenderTexture());
        this.target.reset({ width: 750, height: 800 }); this.camera.targetTexture = this.target;
        this.frame = assets.trackRuntimeAsset(CITY_ASSETS, new SpriteFrame());
        this.frame.texture = this.target; this.frame.packable = false;
        this.projection = new Node('CityWorldProjection'); this.projection.layer = uiParent.layer;
        uiParent.addChild(this.projection); this.projection.addComponent(UITransform).setContentSize(750, 800);
        this.projection.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.projectionImage = new Node('CityWorldImage'); this.projectionImage.layer = uiParent.layer;
        this.projection.addChild(this.projectionImage);
        this.projectionImage.addComponent(UITransform).setContentSize(750, 800);
        const sprite = this.projectionImage.addComponent(Sprite);
        sprite.spriteFrame = this.frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        Object.keys(buildings.meshes).forEach(name => {
            const data = buildings.meshes[name]; this.meshes.set(name, this.mesh(data, true));
            this.roofs.set(name, { halfWidth: Math.max(...data.positions.map(p => p[0])),
                y: Math.max(...data.positions.map(p => p[1])), z: Math.max(...data.positions.map(p => -p[2])) });
        });
        Object.keys(textures).filter(name => name !== 'ground').forEach(name => {
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true },
                states: {
                    rasterizerState: { cullMode: gfx.CullMode.BACK },
                } });
            material.setProperty('mainTexture', textures[name]);
            this.materials.set(name, assets.trackRuntimeAsset(CITY_ASSETS, material));
            // Additive copy drawn over the identical mesh: equal depth must pass.
            const flash = new Material();
            flash.initialize({ effectName: 'builtin-unlit', technique: 2, defines: { USE_TEXTURE: true },
                states: {
                    rasterizerState: { cullMode: gfx.CullMode.BACK },
                    depthStencilState: { depthTest: true, depthWrite: false, depthFunc: gfx.ComparisonFunc.LESS_EQUAL },
                } });
            flash.setProperty('mainTexture', textures[name]);
            this.flashMaterials.set(name, assets.trackRuntimeAsset(CITY_ASSETS, flash));
        });
        this.ground = new CityBloxxGround(this.root, assets, CITY_ASSETS, textures.ground);
    }

    private mesh(data: MeshData, facade = false): Mesh {
        return this.assets.trackRuntimeAsset(CITY_ASSETS, utils.createMesh({
            positions: flatten(data.positions, p => [p[0], p[1], -p[2]]),
            ...(data.normals ? { normals: flatten(data.normals, p => [p[0], p[1], -p[2]]) } : {}),
            uvs: flatten(data.uvs, p => [p[0], 1 - p[1]]),
            indices: flatten(data.triangles[0], t => [t[2], t[1], t[0]]),
            colors: facade ? facadeColors(data) : flatten(data.positions, () => [1, 1, 1, 1]),
        }));
    }

    setSkin(skin: 'yellow' | 'blue'): void {
        if (this.skin !== skin) { this.skin = skin; this.clearFloors(); }
    }

    layout(width: number, playBottom: number, playTop: number, screenBottom = playBottom): void {
        const playHeight = Math.max(1, playTop - playBottom);
        const nativeHeight = 2 * this.nativeCamera.distance * Math.tan(this.nativeCamera.verticalFov * Math.PI / 360);
        const nativeWidth = nativeHeight * this.nativeCamera.referenceWidth / this.nativeCamera.referenceHeight;
        // Fit Width remains the baseline. Short screens uniformly reduce the
        // entire playfield so the floating floor, rig and foundation fit.
        const unit = Math.min(width / nativeWidth, playHeight / 8.5);
        // Settled floors and terrain continue as scenery beneath the bottom
        // safe inset. Pad the camera view symmetrically to preserve the exact
        // gameplay centre, scale and perspective at every depth; crop only
        // the unused upper padding so nothing enters the capsule area.
        const padding = Math.max(0, playBottom - screenBottom);
        const renderHeight = playHeight + padding * 2, viewportHeight = playHeight + padding;
        this.worldHeight = renderHeight / unit;
        this.playWidth = width; this.playHeight = renderHeight; this.playCenter = (playBottom + playTop) / 2;
        this.projection.setPosition(0, this.playCenter - padding / 2);
        this.projection.getComponent(UITransform)!.setContentSize(width, viewportHeight);
        this.projection.getComponent(Mask)!.enabled = padding > 0;
        this.projectionImage.setPosition(0, padding / 2);
        this.projectionImage.getComponent(UITransform)!.setContentSize(width, renderHeight);
        // The tower pass needs at most one texel per design pixel. Supersampling
        // it by 1.5 costs 2.25x fill/bandwidth on dense phones; HUD/text still
        // render at the main canvas resolution. Fit both axes to the engine limit.
        const density = Math.min(1, view.getScaleX(),
            MAX_RENDER_TEXTURE_SIZE / width, MAX_RENDER_TEXTURE_SIZE / renderHeight);
        const rw = Math.max(1, Math.floor(width * density)), rh = Math.max(1, Math.floor(renderHeight * density));
        if (this.target.width !== rw || this.target.height !== rh) {
            this.target.resize(rw, rh);
            // Sample only the allocated pixels; out-of-range UVs repeat the
            // final row and smear the ground into vertical stripes.
            this.frame.rect = new Rect(0, 0, this.target.width, this.target.height);
            this.frame.originalSize = new Size(this.target.width, this.target.height);
        }
        this.camera.rect = new Rect(0, 0, 1, 1);
        this.camera.fov = 2 * Math.atan(width / unit / (2 * this.nativeCamera.distance)) * 180 / Math.PI;
    }

    update(model: CityBloxxModel): void {
        const centerY = model.renderCameraY;
        if (this.camera.node.position.y !== centerY) this.camera.node.setPosition(0, centerY, this.nativeCamera.distance);
        this.camera.camera?.update();
        // This camera only translates vertically. At every fixed depth its
        // projection is affine in x/y. Sample the engine once per frame so
        // render-texture Y conventions remain identical on every backend.
        this.projectionCameraY = centerY;
        this.camera.worldToScreen(this.worldPoint.set(0, centerY, 0), this.screenPoint);
        this.projectionX = (this.screenPoint.x / this.target.width - .5) * this.playWidth;
        this.projectionY = (this.screenPoint.y / this.target.height - .5) * this.playHeight + this.playCenter;
        this.camera.worldToScreen(this.worldPoint.set(1, centerY + 1, 0), this.screenPoint);
        this.projectionUnitX = (this.screenPoint.x / this.target.width - .5) * this.playWidth - this.projectionX;
        this.projectionUnitY = (this.screenPoint.y / this.target.height - .5) * this.playHeight + this.playCenter - this.projectionY;
        // The terrain leaves through the camera frustum; a fixed floor-count
        // cutoff would pop it out early on tall screens.
        const visible = this.visibleFloors, ids = this.visibleIds;
        visible.length = 0; ids.clear();
        const bottom = centerY - this.worldHeight / 2 - 1.6, top = centerY + this.worldHeight / 2 + 1;
        // Native sway is bounded below two degrees: support links always rise.
        // Find the visible interval without scanning the entire endless tower.
        let lo = 0, hi = model.floors.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (model.floors[mid].y <= bottom) lo = mid + 1; else hi = mid; }
        for (let i = lo; i < model.floors.length && model.floors[i].y < top; i++) {
            const floor = model.floors[i]; visible.push(floor); ids.add(floor.id);
        }
        this.floors.forEach((node, id) => {
            if (!ids.has(id)) { this.recycleBuilding(node); this.floors.delete(id); }
        });
        for (const f of visible) {
            const pose = model.samplePose(f, this.renderPose), age = model.renderAge(f.age);
            let node = this.floors.get(f.id);
            if (!node) { node = this.building('Floor-' + f.id, f.base); this.floors.set(f.id, node); }
            if (node.position.x !== pose.x || node.position.y !== pose.y || node.position.z !== 0) node.setPosition(pose.x, pose.y, 0);
            const impact = cityImpactAngle(f.impact, age);
            this.rotate(node, pose.angle + impact);
            // Landing feedback scales only the visual mesh; support links,
            // collision bounds and sway remain in the unscaled model.
            let sx = 1, sy = 1;
            if (age < .16) {
                const s = Math.sin(age / .16 * Math.PI) * (f.perfect ? .08 : .05);
                sx = 1 + s; sy = 1 - s;
            } else if (age < .36) {
                const s = Math.sin((age - .16) / .2 * Math.PI) * (f.perfect ? .04 : .025);
                sx = 1 - s; sy = 1 + s;
            }
            if (node.scale.x !== sx || node.scale.y !== sy) node.setScale(sx, sy, 1);
        }
        this.updateFlash(visible);
        const debrisIds = this.debrisIds; debrisIds.clear();
        for (const floor of model.debris) debrisIds.add(floor.id);
        this.debris.forEach((node, id) => {
            if (!debrisIds.has(id)) { this.recycleBuilding(node); this.debris.delete(id); }
        });
        for (const f of model.debris) {
            const pose = model.samplePose(f, this.renderPose), age = model.renderAge(f.age);
            let node = this.debris.get(f.id);
            if (!node) { node = this.building('FallingFloor-' + f.id, f.base); this.debris.set(f.id, node); }
            const clip = model.config.curves[f.direction < 0 ? 'DropLeft' : 'DropRight'];
            const rotation = this.debrisRotation.set(-cityCurve(clip, 0, age, false), -cityCurve(clip, 1, age, false),
                cityCurve(clip, 2, age, false), cityCurve(clip, 3, age, false));
            Quat.normalize(rotation, rotation);
            Quat.multiply(rotation, Quat.fromEuler(this.debrisTilt, 0, 0, f.angle), rotation);
            node.setRotation(rotation); node.setPosition(pose.x, pose.y, .4);
        }
        if (model.active) {
            const f = model.active;
            if (!this.active || this.activeBase !== f.base) {
                if (this.active) this.recycleBuilding(this.active);
                this.active = this.building('SuspendedFloor', f.base); this.activeBase = f.base;
            }
            this.active.active = true; this.pose(this.active, model.samplePose(f, this.renderPose));
        } else if (this.active) this.active.active = false;
    }

    project(x: number, y: number, z: number, out = new Vec3()): Vec3 {
        const perspective = this.nativeCamera.distance / (this.nativeCamera.distance - z);
        return out.set((this.projectionX + x * this.projectionUnitX) * perspective,
            this.playCenter + (this.projectionY - this.playCenter
                + (y - this.projectionCameraY) * this.projectionUnitY) * perspective, 0);
    }

    /** Sling rings attach inside the actual mesh's front roof rim, in its rotated pose. */
    projectRoof(f: CityFalling, left: Vec3, right: Vec3): void {
        const roof = this.roofs.get(this.buildings.prefabs[this.skin + '_house_' + (f.base ? 'b' : 'm')].mesh)!;
        const angle = f.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
        const half = roof.halfWidth * .88;
        this.project(f.x - half * cos - roof.y * sin, f.y - half * sin + roof.y * cos, roof.z, left);
        this.project(f.x + half * cos - roof.y * sin, f.y + half * sin + roof.y * cos, roof.z, right);
    }

    /** Render once under the loading screen to prepare meshes and the additive pipeline. */
    warmup(): () => void {
        const nodes: Node[] = [];
        for (let i = 0; i < 24; i++) nodes.push(this.building('CityWarmFloor', i < 2));
        this.ensureFlash(); this.flash!.node.active = true;
        return () => { nodes.forEach(node => this.recycleBuilding(node)); this.flash!.node.active = false; };
    }

    /** The newest perfect floor briefly glows warm white, following its squash and tilt. */
    private updateFlash(visible: CityFloor[]): void {
        let target: CityFloor | undefined;
        for (const f of visible) if (f.perfect && !f.base && f.age < FLASH_LIFE && (!target || f.id > target.id)) target = f;
        if (!target) { if (this.flash) this.flash.node.active = false; return; }
        this.ensureFlash();
        const parent = this.floors.get(target.id)!;
        this.flash!.node.active = true; this.flash!.floorId = target.id;
        this.flash!.node.setPosition(parent.position); this.flash!.node.setRotation(parent.rotation); this.flash!.node.setScale(parent.scale);
        const age = target.age;
        const strength = age < .05 ? age / .05 : (1 - (age - .05) / (FLASH_LIFE - .05)) ** 2;
        this.flashColor.a = Math.round(255 * .78 * strength);
        this.flash!.material.setProperty('mainColor', this.flashColor);
    }
    private ensureFlash(): void {
        const data = this.buildings.prefabs[this.skin + '_house_m'], material = this.flashMaterials.get(data.textures[0])!;
        if (!this.flash) this.flash = { node: this.meshNode('PerfectFlash', this.meshes.get(data.mesh)!, material), floorId: -1, material };
        else if (this.flash.material !== material) {
            // In 3.8.8 changing a disabled MeshRenderer's mesh leaves its
            // existing render model intact, including the previous skin's UVs.
            this.flash.node.active = true;
            const renderer = this.flash.node.getComponent(MeshRenderer)!;
            renderer.mesh = this.meshes.get(data.mesh)!; renderer.setSharedMaterial(material, 0); this.flash.material = material;
        }
    }
    private rotate(node: Node, angle: number): void {
        if (this.angles.get(node) === angle) return;
        this.angles.set(node, angle); node.setRotationFromEuler(0, 0, angle);
    }
    private pose(node: Node, f: { x: number; y: number; angle: number }): void {
        if (node.position.x !== f.x || node.position.y !== f.y || node.position.z !== 0) node.setPosition(f.x, f.y, 0);
        this.rotate(node, f.angle);
    }
    private building(name: string, base: boolean): Node {
        const data = this.buildings.prefabs[this.skin + '_house_' + (base ? 'b' : 'm')];
        let node = (base ? this.basePool : this.floorPool).pop();
        if (!node) { node = this.meshNode(name, this.meshes.get(data.mesh)!, this.materials.get(data.textures[0])!); this.buildingTypes.set(node, base); }
        else {
            // Activate before rebinding: onEnable reuses an existing render
            // model, so a mesh assigned while inactive would keep stale UVs.
            node.name = name; node.active = true;
            const renderer = node.getComponent(MeshRenderer)!;
            const mesh = this.meshes.get(data.mesh)!, material = this.materials.get(data.textures[0])!;
            if (renderer.mesh !== mesh) renderer.mesh = mesh;
            if (renderer.getSharedMaterial(0) !== material) renderer.setSharedMaterial(material, 0);
        }
        node.setScale(1, 1, 1); node.active = true; return node;
    }
    private recycleBuilding(node: Node): void {
        this.angles.delete(node);
        node.active = false;
        const pool = this.buildingTypes.get(node) ? this.basePool : this.floorPool;
        if (pool.length < 32) pool.push(node);
        else { this.buildingTypes.delete(node); node.destroy(); }
    }
    private meshNode(name: string, mesh: Mesh, material: Material): Node {
        const node = this.make(name), renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh; renderer.setSharedMaterial(material, 0); return node;
    }
    private make(name: string): Node {
        const node = new Node(name); node.layer = CITY_WORLD_LAYER; this.root.addChild(node); return node;
    }
    private clearFloors(): void {
        this.visibleFloors.length = 0; this.visibleIds.clear(); this.debrisIds.clear();
        if (this.flash) this.flash.node.active = false;
        this.floors.forEach(n => this.recycleBuilding(n)); this.floors.clear();
        this.debris.forEach(n => this.recycleBuilding(n)); this.debris.clear();
        if (this.active) this.recycleBuilding(this.active); this.active = undefined;
    }
    dispose(): void {
        this.clearFloors(); this.ground.dispose();
        this.camera.targetTexture = null; this.root.destroy(); this.projection.destroy();
        this.flash = undefined; this.floorPool.length = this.basePool.length = 0; this.buildingTypes.clear(); this.angles.clear(); this.roofs.clear();
        this.assets.releaseRuntimeAsset(this.frame); this.assets.releaseRuntimeAsset(this.target);
        this.meshes.forEach(m => this.assets.releaseRuntimeAsset(m)); this.meshes.clear();
        this.materials.forEach(m => this.assets.releaseRuntimeAsset(m)); this.materials.clear();
        this.flashMaterials.forEach(m => this.assets.releaseRuntimeAsset(m)); this.flashMaterials.clear();
    }
}
function flatten(rows: number[][], transform: (row: number[]) => number[]): number[] {
    const result: number[] = [];
    rows.forEach(row => result.push(...transform(row)));
    return result;
}

/** Baked face lighting changes only material color, never the original mesh. */
function facadeColors(data: MeshData): number[] {
    const normals = data.positions.map(() => new Vec3());
    for (const triangle of data.triangles[0]) {
        const [a, b, c] = triangle.map(index => {
            const p = data.positions[index]; return new Vec3(p[0], p[1], -p[2]);
        });
        // Indices are reversed when converting the original left-handed mesh.
        const normal = Vec3.cross(new Vec3(), Vec3.subtract(new Vec3(), b, c), Vec3.subtract(new Vec3(), a, c));
        triangle.forEach(index => Vec3.add(normals[index], normals[index], normal));
    }
    return flatten(normals.map(normal => {
        Vec3.normalize(normal, normal);
        // Bright warm facade/roof, cool side walls, dark undersides and cornices.
        if (normal.y > .65) return [1, 1, .98, 1];
        if (normal.y < -.65) return [.52, .57, .63, 1];
        if (normal.z > .65) return [1, .98, .96, 1];
        if (normal.x > .65) return [.62, .70, .78, 1];
        if (normal.x < -.65) return [.78, .82, .88, 1];
        return [.72, .78, .84, 1];
    }), color => color);
}
