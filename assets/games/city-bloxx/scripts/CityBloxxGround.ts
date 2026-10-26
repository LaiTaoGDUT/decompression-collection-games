import { Color, gfx, Material, Mesh, MeshRenderer, Node, Texture2D, utils } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';

type Point = [number, number, number];
interface Geometry { positions: number[]; colors: number[]; uvs: number[]; indices: number[]; }
export const CITY_GROUND = Object.freeze({ surfaceY: -.22, backZ: -2.4, cell: .45, textureSpan: 1.8, pavingColor: '#D3D1C6' });
const PLAZA_Y = CITY_GROUND.surfaceY;

/** A paved plaza and beveled plinth. The playable foundation surface remains exactly y=0. */
export class CityBloxxGround {
    readonly root: Node;
    private readonly meshes: Mesh[] = [];
    private readonly materials: Material[] = [];

    constructor(parent: Node, private readonly assets: AssetService, private readonly bundle: string, texture: Texture2D) {
        this.root = new Node('CityGroundWorld'); this.root.layer = parent.layer; parent.addChild(this.root);
        const paving = geometry();
        // Start at the feet of the 2D boundary, so the 3D plaza cannot mask the
        // background facades. The near edge extends beyond even tall viewports.
        face(paving, [[-12, PLAZA_Y, CITY_GROUND.backZ], [-12, PLAZA_Y, 9.5], [12, PLAZA_Y, 9.5], [12, PLAZA_Y, CITY_GROUND.backZ]], '#FFFFFF', false);
        for (let i = 0; i < 4; i++) {
            paving.uvs[i * 2] = paving.positions[i * 3] / CITY_GROUND.textureSpan;
            paving.uvs[i * 2 + 1] = paving.positions[i * 3 + 2] / CITY_GROUND.textureSpan;
        }
        this.upload('CityPavedPlaza', paving, this.material(texture));

        const stone = geometry();
        slab(stone, 0, 0, 2.24, 1.84, PLAZA_Y, -.13, .11, '#BAC6C7');
        slab(stone, 0, 0, 2.10, 1.70, -.13, -.105, .11, '#C9A76A');
        slab(stone, 0, 0, 2.05, 1.65, -.105, 0, .12, '#F5F0E4');
        rect(stone, 0, 0, 1.48, 1.12, .001, '#E1E5DF');
        // Small inlaid corner marks make the landing pad intentional and keep
        // the center open for every position of the native foundation swing.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx * .72, z = sz * .54, y = .003;
            rect(stone, x - sx * .10, z, .22, .06, y, '#C5A564');
            rect(stone, x, z - sz * .10, .06, .22, y, '#C5A564');
            bolt(stone, sx * .88, sz * .66, .008);
        }
        // Narrow curb inlays add depth to the plaza without blocking the tower.
        for (const sx of [-1, 1]) {
            slab(stone, sx * 1.8, 3.1, .10, 8.4, PLAZA_Y, -.185, .035, '#A9BDBD');
            rect(stone, sx * 1.72, 3.1, .018, 8.4, -.213, '#D2B77E');
        }
        this.upload('CityFoundationPlinth', stone, this.material());
        this.upload('CityFoundationContactShadow', contactShadow(), this.material(undefined, true));
    }

    private material(texture?: Texture2D, transparent = false): Material {
        const material = this.assets.trackRuntimeAsset(this.bundle, new Material());
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true, USE_TEXTURE: !!texture },
            states: { rasterizerState: { cullMode: gfx.CullMode.BACK },
                ...(transparent ? { depthStencilState: { depthTest: true, depthWrite: false },
                    blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA,
                        blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                        // This shadow attenuates opaque paving. Preserve the
                        // render target's occupancy alpha for UI compositing.
                        blendColorMask: gfx.ColorMask.R | gfx.ColorMask.G | gfx.ColorMask.B }] } } : {}),
            } });
        if (texture) material.setProperty('mainTexture', texture);
        this.materials.push(material); return material;
    }
    private upload(name: string, data: Geometry, material: Material): void {
        const mesh = this.assets.trackRuntimeAsset(this.bundle, utils.createMesh(data)); this.meshes.push(mesh);
        const node = new Node(name); node.layer = this.root.layer; this.root.addChild(node);
        const renderer = node.addComponent(MeshRenderer); renderer.mesh = mesh; renderer.setSharedMaterial(material, 0);
    }
    dispose(): void {
        this.root.destroy();
        this.meshes.forEach(mesh => this.assets.releaseRuntimeAsset(mesh)); this.meshes.length = 0;
        this.materials.forEach(material => this.assets.releaseRuntimeAsset(material)); this.materials.length = 0;
    }
}

function geometry(): Geometry { return { positions: [], colors: [], uvs: [], indices: [] }; }
function face(g: Geometry, points: Point[], hex: string, lighting = true): void {
    const base = g.positions.length / 3, color = new Color(hex);
    const a = points[0], b = points[1], c = points[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    const light = !lighting || ny / length > .9 ? 1 : .70 + .30 * Math.max(0, (-nx * .48 + ny * .78 + nz * .4) / length);
    for (const p of points) {
        g.positions.push(p[0], p[1], p[2]); g.colors.push(color.r / 255 * light, color.g / 255 * light, color.b / 255 * light, 1);
        g.uvs.push(0, 0);
    }
    for (let i = 1; i + 1 < points.length; i++) g.indices.push(base, base + i, base + i + 1);
}
function outline(x: number, z: number, w: number, d: number, corner: number, y: number): Point[] {
    const hw = w / 2, hd = d / 2, c = Math.min(corner, hw * .8, hd * .8);
    return [[x-hw+c,y,z-hd],[x+hw-c,y,z-hd],[x+hw,y,z-hd+c],[x+hw,y,z+hd-c],
        [x+hw-c,y,z+hd],[x-hw+c,y,z+hd],[x-hw,y,z+hd-c],[x-hw,y,z-hd+c]];
}
function slab(g: Geometry, x: number, z: number, w: number, d: number, bottom: number, top: number, corner: number, color: string): void {
    const bevel = Math.min(.025, (top - bottom) / 3, w / 5, d / 5);
    const rings = [outline(x,z,w-bevel*2,d-bevel*2,corner,bottom), outline(x,z,w,d,corner,bottom+bevel),
        outline(x,z,w,d,corner,top-bevel), outline(x,z,w-bevel*2,d-bevel*2,corner,top)];
    for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8; face(g, [rings[row][i], rings[row+1][i], rings[row+1][j], rings[row][j]], color);
    }
    face(g, rings[rings.length - 1].slice().reverse(), color);
}
function rect(g: Geometry, x: number, z: number, w: number, d: number, y: number, color: string): void {
    face(g, [[x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2]], color, false);
}
function bolt(g: Geometry, x: number, z: number, y: number): void {
    const points: Point[] = [];
    for (let i = 0; i < 12; i++) { const a = -i * Math.PI / 6; points.push([x + Math.cos(a) * .027, y, z + Math.sin(a) * .027]); }
    face(g, points, '#A18A5F', false); rect(g, x, z, .019, .004, y + .001, '#E5D5AE');
}
function contactShadow(): Geometry {
    const g = geometry(), segments = 32;
    for (const [radius, alpha] of [[0, .24], [.78, .18], [1, 0]]) for (let i = 0; i < segments; i++) {
        const a = i * Math.PI * 2 / segments;
        g.positions.push(.04 + Math.cos(a) * 1.48 * radius, PLAZA_Y + .001, .08 + Math.sin(a) * 1.20 * radius);
        g.colors.push(.12, .17, .22, alpha); g.uvs.push(0, 0);
    }
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments, a = ring * segments + i, b = ring * segments + j;
        const c = (ring + 1) * segments + i, d = (ring + 1) * segments + j;
        g.indices.push(a, b, c, b, d, c);
    }
    return g;
}
