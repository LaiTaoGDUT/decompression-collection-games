import { Camera, Color, gfx, Material, Mesh, MeshRenderer, Node, Quat, Rect, RenderTexture, Size,
    Sprite, SpriteFrame, Texture2D, UITransform, utils, Vec3, view } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { cityCurve, type CityBloxxModel, type CityConfig, type CityFalling, type CityFloor } from './CityBloxxModel';

export const CITY_ASSETS = 'game-city-bloxx-assets';
export const CITY_WORLD_LAYER = 1 << 19;
interface MeshData { positions: number[][]; normals?: number[][]; uvs: number[][]; triangles: number[][][]; }
export interface CityBuildingData {
    meshes: Record<string, MeshData>;
    prefabs: Record<string, { mesh: string; textures: string[] }>;
}
export interface CityGroundData {
    name: string; mesh: MeshData; textures: string[]; position: number[]; scale: number[]; rotation: number[];
}

/** Original 3D meshes, camera and world units. The skin changes textures only. */
export class CityBloxxView {
    readonly root = new Node('CityBloxxWorld');
    readonly camera: Camera;
    readonly projection: Node;
    private readonly meshes = new Map<string, Mesh>();
    private readonly materials = new Map<string, Material>();
    private readonly floors = new Map<number, Node>();
    private readonly debris = new Map<number, Node>();
    private readonly ground: Node[] = [];
    private readonly target: RenderTexture;
    private readonly frame: SpriteFrame;
    private readonly screenPoint = new Vec3();
    private active?: Node;
    private activeBase?: boolean;
    private playWidth = 750;
    private playHeight = 800;
    private playCenter = 0;
    private worldHeight = 6;
    private skin: 'yellow' | 'blue' = 'yellow';

    constructor(scene: Node, uiParent: Node, private readonly assets: AssetService,
        private readonly buildings: CityBuildingData, textures: Readonly<Record<string, Texture2D>>,
        ground: CityGroundData[],
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
        const sprite = this.projection.addComponent(Sprite);
        sprite.spriteFrame = this.frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        Object.keys(buildings.meshes).forEach(name => this.meshes.set(name, this.mesh(buildings.meshes[name], true)));
        Object.keys(textures).forEach(name => {
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true },
                states: {
                    rasterizerState: { cullMode: gfx.CullMode.BACK },
                } });
            material.setProperty('mainTexture', textures[name]);
            this.materials.set(name, assets.trackRuntimeAsset(CITY_ASSETS, material));
        });
        for (const data of ground) {
            const mesh = this.mesh(data.mesh); this.meshes.set(data.name, mesh);
            const node = this.meshNode(data.name, mesh, this.materials.get(data.textures[0])!);
            node.setPosition(data.position[0], data.position[1], -data.position[2]);
            node.setScale(data.scale[0], data.scale[1], data.scale[2]);
            node.setRotation(new Quat(-data.rotation[0], -data.rotation[1], data.rotation[2], data.rotation[3]));
            this.ground.push(node);
        }
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

    layout(width: number, height: number, playBottom: number, playTop: number): void {
        const playHeight = Math.max(1, playTop - playBottom);
        const nativeHeight = 2 * this.nativeCamera.distance * Math.tan(this.nativeCamera.verticalFov * Math.PI / 360);
        const nativeWidth = nativeHeight * this.nativeCamera.referenceWidth / this.nativeCamera.referenceHeight;
        // Fit Width remains the baseline. Short screens uniformly reduce the
        // entire playfield so the floating floor, rig and foundation fit.
        const unit = Math.min(width / nativeWidth, playHeight / 8.5);
        this.worldHeight = playHeight / unit;
        this.playWidth = width; this.playHeight = playHeight; this.playCenter = (playBottom + playTop) / 2;
        this.projection.setPosition(0, this.playCenter);
        this.projection.getComponent(UITransform)!.setContentSize(width, playHeight);
        const density = Math.max(1, Math.min(1.5, view.getScaleX()));
        const rw = Math.ceil(width * density), rh = Math.ceil(playHeight * density);
        if (this.target.width !== rw || this.target.height !== rh) {
            this.target.resize(rw, rh); this.frame.rect = new Rect(0, 0, rw, rh);
            this.frame.originalSize = new Size(rw, rh);
        }
        this.camera.rect = new Rect(0, 0, 1, 1);
        this.camera.fov = 2 * Math.atan(width / unit / (2 * this.nativeCamera.distance)) * 180 / Math.PI;
    }

    update(model: CityBloxxModel): void {
        const centerY = model.cameraY;
        this.camera.node.setPosition(0, centerY, this.nativeCamera.distance);
        this.camera.camera?.update(true);
        this.ground.forEach(n => { n.active = model.moveY < 8; });
        const visible = model.floors.filter(f => f.y > centerY - this.worldHeight / 2 - 1.6
            && f.y < centerY + this.worldHeight / 2 + 1);
        const ids = new Set(visible.map(f => f.id));
        this.floors.forEach((node, id) => {
            if (!ids.has(id)) { node.destroy(); this.floors.delete(id); }
        });
        for (const f of visible) {
            let node = this.floors.get(f.id);
            if (!node) { node = this.building('Floor-' + f.id, f.base); this.floors.set(f.id, node); }
            this.pose(node, f);
            const impact = f.impact * (f.age < .3 ? 1 - (1 - f.age / .3) ** 3
                : f.age < .5 ? 1 - ((f.age - .3) / .2) ** 3 : 0);
            node.setRotationFromEuler(0, 0, f.angle + impact);
        }
        const debrisIds = new Set(model.debris.map(f => f.id));
        this.debris.forEach((node, id) => {
            if (!debrisIds.has(id)) { node.destroy(); this.debris.delete(id); }
        });
        for (const f of model.debris) {
            let node = this.debris.get(f.id);
            if (!node) { node = this.building('FallingFloor-' + f.id, f.base); this.debris.set(f.id, node); }
            const clip = model.config.curves[f.direction < 0 ? 'DropLeft' : 'DropRight'];
            const rotation = new Quat(-cityCurve(clip, 0, f.age, false), -cityCurve(clip, 1, f.age, false),
                cityCurve(clip, 2, f.age, false), cityCurve(clip, 3, f.age, false));
            Quat.normalize(rotation, rotation);
            Quat.multiply(rotation, Quat.fromEuler(new Quat(), 0, 0, f.angle), rotation);
            node.setRotation(rotation); node.setPosition(f.x, f.y, .4);
        }
        if (model.active) {
            const f = model.active;
            if (!this.active || this.activeBase !== f.base) {
                this.active?.destroy(); this.active = this.building('SuspendedFloor', f.base); this.activeBase = f.base;
            }
            this.active.active = true; this.pose(this.active, f);
        } else if (this.active) this.active.active = false;
    }

    project(x: number, y: number, z: number): Vec3 {
        this.camera.worldToScreen(new Vec3(x, y, z), this.screenPoint);
        return new Vec3((this.screenPoint.x / this.target.width - .5) * this.playWidth,
            (this.screenPoint.y / this.target.height - .5) * this.playHeight + this.playCenter, 0);
    }

    private pose(node: Node, f: CityFalling | CityFloor): void {
        node.setPosition(f.x, f.y, 0); node.setRotationFromEuler(0, 0, f.angle);
    }
    private building(name: string, base: boolean): Node {
        const data = this.buildings.prefabs[this.skin + '_house_' + (base ? 'b' : 'm')];
        return this.meshNode(name, this.meshes.get(data.mesh)!, this.materials.get(data.textures[0])!);
    }
    private meshNode(name: string, mesh: Mesh, material: Material): Node {
        const node = this.make(name), renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh; renderer.setSharedMaterial(material, 0); return node;
    }
    private make(name: string): Node {
        const node = new Node(name); node.layer = CITY_WORLD_LAYER; this.root.addChild(node); return node;
    }
    private clearFloors(): void {
        this.floors.forEach(n => n.destroy()); this.floors.clear();
        this.debris.forEach(n => n.destroy()); this.debris.clear();
        this.active?.destroy(); this.active = undefined;
    }
    dispose(): void {
        this.clearFloors(); this.camera.targetTexture = null; this.root.destroy(); this.projection.destroy();
        this.ground.length = 0;
        this.assets.releaseRuntimeAsset(this.frame); this.assets.releaseRuntimeAsset(this.target);
        this.meshes.forEach(m => this.assets.releaseRuntimeAsset(m)); this.meshes.clear();
        this.materials.forEach(m => this.assets.releaseRuntimeAsset(m)); this.materials.clear();
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
