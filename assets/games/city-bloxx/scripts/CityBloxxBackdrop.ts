import { Color, gfx, Material, Mesh, MeshRenderer, Node, utils } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';

export const CITY_BACKDROP_LAYER = 1 << 18;
export const CITY_BACKDROP_HEIGHT = 29.2;
export const CITY_BACKDROP_BOUNDS = Object.freeze({ bottom: -.7, top: CITY_BACKDROP_HEIGHT + .95, nearZ: -2.3, farZ: -7.5 });
export function cityBackdropInView(project: (x: number, y: number, z: number) => { y: number }, height: number): boolean {
    const b = CITY_BACKDROP_BOUNDS;
    const top = Math.max(project(0, b.top, b.nearZ).y, project(0, b.top, b.farZ).y);
    const bottom = Math.min(project(0, b.bottom, b.nearZ).y, project(0, b.bottom, b.farZ).y);
    return top >= -height / 2 && bottom <= height / 2;
}
type Point = [number, number, number];
type RGB = [number, number, number];
interface Geometry { positions: number[]; colors: number[]; indices: number[]; }
interface Tower { x: number; z: number; width: number; depth: number; height: number; wall: string; glass: string; style: 'ribs' | 'windows' | 'bands'; crown?: boolean; }

/** Soft, beveled modern neighbors. One opaque mesh, with quiet facade detail behind the warm playable tower. */
export class CityBloxxBackdrop {
    readonly root = new Node('CityModernNeighbors');
    private readonly mesh: Mesh;
    private readonly material: Material;

    constructor(parent: Node, private readonly assets: AssetService, private readonly bundle: string) {
        this.root.layer = CITY_BACKDROP_LAYER; parent.addChild(this.root);
        const g: Geometry = { positions: [], colors: [], indices: [] };
        const towers: Tower[] = [
            { x: -4.0, z: -6.4, width: 1.5, depth: 1.1, height: 27.0, wall: '#9EBBC7', glass: '#85ADBF', style: 'ribs', crown: true },
            { x: -1.6, z: -6.8, width: 1.3, depth: 1.0, height: 24.2, wall: '#AAC2CB', glass: '#8CAFC0', style: 'ribs' },
            { x: 1.0, z: -6.5, width: 1.6, depth: 1.3, height: 26.4, wall: '#A3BDC7', glass: '#87A9BA', style: 'ribs' },
            { x: 4.0, z: -6.2, width: 1.5, depth: 1.1, height: CITY_BACKDROP_HEIGHT, wall: '#9EBAC7', glass: '#81A8BA', style: 'ribs', crown: true },
            { x: -3.8, z: -4.9, width: 1.5, depth: 1.3, height: 21.0, wall: '#BBCBCB', glass: '#92ADB6', style: 'windows' },
            { x: -.9, z: -4.7, width: 1.6, depth: 1.3, height: 20.0, wall: '#B6C8C9', glass: '#91AFBB', style: 'windows' },
            { x: 2.2, z: -4.8, width: 1.9, depth: 1.5, height: 22.5, wall: '#B1C6C5', glass: '#8EADB8', style: 'ribs' },
            { x: -2.8, z: -3.4, width: 1.8, depth: 1.3, height: 11.8, wall: '#A7BDC4', glass: '#7F9EAF', style: 'windows' },
            { x: .1, z: -3.9, width: 1.6, depth: 1.3, height: 6.2, wall: '#B7C6C8', glass: '#87A6B6', style: 'bands' },
            { x: 3.0, z: -3.5, width: 2.0, depth: 1.5, height: 17.2, wall: '#AFC2BB', glass: '#87A3AC', style: 'windows' },
            { x: 1.7, z: -3.1, width: 1.8, depth: 1.4, height: 5.1, wall: '#BACACC', glass: '#8BA9B5', style: 'bands' },
            { x: -5.7, z: -3.8, width: 2.5, depth: 1.5, height: 18.6, wall: '#BDCBCD', glass: '#9CB7C0', style: 'bands' },
            { x: 5.8, z: -4.0, width: 2.6, depth: 1.5, height: 19.2, wall: '#B6C8C9', glass: '#96B0B9', style: 'bands' },
        ];
        towers.forEach((tower, index) => buildTower(g, tower, index));
        this.material = assets.trackRuntimeAsset(bundle, new Material());
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true },
            states: { rasterizerState: { cullMode: gfx.CullMode.BACK } } });
        this.mesh = assets.trackRuntimeAsset(bundle, utils.createMesh(g));
        const renderer = this.root.addComponent(MeshRenderer);
        renderer.mesh = this.mesh; renderer.setSharedMaterial(this.material, 0);
    }

    dispose(): void {
        this.root.destroy(); this.assets.releaseRuntimeAsset(this.mesh); this.assets.releaseRuntimeAsset(this.material);
    }
}

function color(hex: string): RGB { const c = new Color(hex); return [c.r / 255, c.g / 255, c.b / 255]; }
function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function face(g: Geometry, points: Point[], fill: RGB, light = 1, glass = false): void {
    const start = g.positions.length / 3;
    for (let i = 0; i < points.length; i++) {
        const p = points[i], highlight = glass && i > 1 ? .035 : 0;
        g.positions.push(...p);
        g.colors.push(Math.min(1, fill[0] * light + highlight), Math.min(1, fill[1] * light + highlight), Math.min(1, fill[2] * light + highlight), 1);
    }
    for (let i = 1; i + 1 < points.length; i++) g.indices.push(start, start + i, start + i + 1);
}
function ring(x: number, y: number, z: number, width: number, depth: number, cut: number): Point[] {
    const w = width / 2, d = depth / 2, c = Math.min(cut, w / 3, d / 3);
    return [[x-w+c,y,z-d],[x+w-c,y,z-d],[x+w,y,z-d+c],[x+w,y,z+d-c],
        [x+w-c,y,z+d],[x-w+c,y,z+d],[x-w,y,z+d-c],[x-w,y,z-d+c]];
}
function box(g: Geometry, t: Tower, bottom: number, top: number, width: number, depth: number, fill: RGB): void {
    const bevel = .035;
    const rings = [ring(t.x,bottom,t.z,width,depth,.09), ring(t.x,top-bevel,t.z,width,depth,.09),
        ring(t.x,top,t.z,width-bevel*2,depth-bevel*2,.08)];
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8;
        // Front faces remain bright; side faces provide restrained volume.
        const light = k ? 1.035 : [ .85, .86, .87, .92, 1, .96, .89, .87 ][i];
        face(g, [rings[k][i], rings[k+1][i], rings[k+1][next], rings[k][next]], fill, light);
    }
    face(g, rings[2].slice().reverse(), fill, 1.045);
}
function panel(g: Geometry, x: number, bottom: number, width: number, height: number, z: number, fill: RGB, glass = false): void {
    face(g, [[x-width/2,bottom,z],[x+width/2,bottom,z],[x+width/2,bottom+height,z],[x-width/2,bottom+height,z]], fill, 1, glass);
}
function buildTower(g: Geometry, t: Tower, index: number): void {
    const fog = Math.max(.10, Math.min(.32, (-t.z - 3) * .075));
    const atmosphere = color('#B5CED6'), wall = mix(color(t.wall), atmosphere, fog), glass = mix(color(t.glass), atmosphere, fog);
    const trim = mix(wall, color('#E0E7DF'), .48), base = -.7, top = t.height;
    box(g, t, base, top, t.width, t.depth, wall);
    box(g, t, top-.10, top+.03, t.width+.055, t.depth+.055, trim);
    box(g, t, top+.03, top+.23, t.width*.66, t.depth*.65, wall);
    if (t.crown) {
        box(g, t, top+.23, top+.55, t.width*.43, t.depth*.44, trim);
        box(g, t, top+.55, top+.95, .055, .055, wall);
    }
    const front = t.z + t.depth / 2 + .008, left = t.x - t.width / 2 + .18, inner = t.width - .36;
    if (t.style === 'ribs') {
        panel(g, t.x, base+.25, inner, top-base-.55, front, glass, true);
        panel(g, t.x-inner*.20, base+.25, inner*.22, top-base-.55, front+.002, mix(glass, trim, .15), true);
        panel(g, t.x+inner*.24, base+.25, inner*.10, top-base-.55, front+.003, mix(glass, trim, .24), true);
        const columns = 5;
        for (let col = 0; col <= columns; col++) panel(g, left + inner*col/columns, base+.25, .032, top-base-.55, front+.008, trim);
        for (let y = base+.65; y < top-.35; y += .66) panel(g, t.x, y, inner, .027, front+.012, mix(glass, wall, .55));
    } else if (t.style === 'windows') {
        const columns = Math.max(3, Math.floor(inner/.27)), step = inner/columns, paneWidth = step*.64;
        for (let row = 0, y = base+.38; y < top-.45; y += .52, row++) {
            for (let col = 0; col < columns; col++) {
                const pane = mix(glass, wall, ((row*3+col*7+index)%11)/55);
                const x = left + step*(col+.5);
                panel(g, x, y, paneWidth, .28, front, mix(pane, wall, .18));
                panel(g, x, y+.012, paneWidth-.018, .257, front+.003, pane, true);
                if ((row+col+index)%4===0) panel(g, x-paneWidth*.24, y+.02, .014, .23, front+.005, mix(pane, trim, .32));
                panel(g, x, y-.018, paneWidth+.035, .018, front+.004, trim);
            }
        }
        for (let col = 1; col < columns; col++) panel(g, left+step*col, base+.18, .024, top-base-.35, front+.006, trim);
    } else {
        for (let y = base+.4; y < top-.4; y += .63) {
            panel(g, t.x, y, inner, .26, front, glass, true);
            panel(g, t.x, y+.27, inner+.04, .027, front+.006, trim);
            panel(g, t.x, y, .025, .26, front+.008, mix(trim, glass, .3));
        }
    }
    // A few rooftop mechanical blocks keep the skyline readable on ascent.
    if (!t.crown) {
        const unit = { ...t, x: t.x-t.width*.2, z: t.z-.08 };
        box(g, unit, top+.23, top+.42, t.width*.22, t.depth*.30, mix(wall, glass, .4));
    }
}
