import {
    Camera, Color, EffectAsset, Mask, Material, Mesh, MeshRenderer, Node, Quat, Rect, RenderTexture,
    Size, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, utils, Vec3, Vec4, view,
} from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import type { CubeAwayBoard } from './CubeAwayEngine';
import { paintSnake, snakeHeadArtwork, type HeadArtwork } from './CubeAwaySnakeMesh';
import { CUBE_AWAY_THEME } from './CubeAwayTheme';
import {
    CUBE_FRAME,
    FACE_NORMAL,
    formatCellId,
    parseCellId,
    resolveSplitExits,
    type ArrowRuntime,
    type DirName,
    type FaceName,
    type PathStep,
} from './CubeAwayTypes';

export const CUBE_ASSETS_BUNDLE = 'game-cube-away-assets';
export const CUBE_WORLD_LAYER = 1 << 20;

interface SpotlightPoint { readonly x: number; readonly y: number; }

export interface MechanicSpotlightTarget extends SpotlightPoint {
    readonly radius: number;
    readonly highlightedArrowIds?: readonly number[];
    readonly routes?: readonly { readonly start: SpotlightPoint; readonly end: SpotlightPoint }[];
}
const MAX_RT_SIZE = 2048;
const CUBE_EDGE_RADIUS = .18;

const RIBBON_SURFACE_OFFSET = 0.503;

function snakeUploadBuffers(vertices: number, indices: number) {
    return {
        positions: new Float32Array(vertices * 3), normals: new Float32Array(vertices * 3),
        colors: new Float32Array(vertices * 4), tangents: new Float32Array(vertices * 4),
        uvs: new Float32Array(vertices * 2), indices16: new Uint16Array(indices),
    };
}

interface FlyPathSample {
    readonly p: V3;
    readonly n: V3;
    readonly tang: V3;
    readonly left: V3;
    readonly s: number;
}

interface FlyRunnerTrack {
    readonly node: Node;
    readonly mr: MeshRenderer;
    readonly samples: FlyPathSample[];
    readonly foldDistances: number[];
    readonly bodyArcLen: number;
    readonly exitArcS: number;
    readonly totalArcLen: number;
    readonly isDouble: boolean;
    readonly artwork: readonly [HeadArtwork, HeadArtwork];
    readonly colorIndex: number;
    readonly linked: boolean;
    emphasis: 'none' | 'hint' | 'blocked';
    hintTail: boolean;
    hintFocus: boolean;
    currentMesh: Mesh | null;
    outline?: MeshRenderer;
    startDistance: number;
}

interface ActiveFlyAnim {
    readonly arrowId: number;
    travelDist: number;
    readonly node: Node;
    readonly tracks: FlyRunnerTrack[];
}

interface ActiveBounceAnim {
    readonly arrowId: number;
    elapsed: number;
    readonly outDuration: number;
    readonly backDuration: number;
    readonly impactDist: number;
    impacted: boolean;
    readonly node: Node;
    readonly track: FlyRunnerTrack;
}

interface ActiveSmashAnim {
    readonly arrowId: number;
    elapsed: number;
    readonly duration: number;
    readonly node: Node;
    readonly stars: Node[];
    readonly meshes: Mesh[];
}

interface ActiveSparkleBurst {
    elapsed: number;
    readonly duration: number;
    readonly node: Node;
    readonly dots: Array<{ node: Node; vx: number; vy: number; vz: number }>;
    readonly meshes: Mesh[];
}

interface ArrowSegmentHit {
    readonly cellIndex: number;
    readonly center: V3;
    readonly normal: V3;
    readonly radius: number;
}

interface ReverseIndicator {
    readonly cellId: string;
    readonly node: Node;
    readonly face: FaceName;
}

type V3 = readonly [number, number, number];

function hexToRgbTuple(hex: string): V3 {
    const clean = hex.startsWith('#') ? hex.slice(1) : hex;
    const n = parseInt(clean, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function vSub(a: V3, b: V3): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vAdd(a: V3, b: V3, scale = 1): [number, number, number] {
    return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
}

function vCross(a: V3, b: V3): [number, number, number] {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function vDot(a: V3, b: V3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vNorm(v: V3): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
}

// Positive radii follow an outside edge, negative radii turn into a recessed corner.
function surfaceFold(edge: V3, from: V3, to: V3, radius: number, lift: number): Array<{ p: V3; n: V3 }> {
    const center = vAdd(edge, vAdd(from, to), -radius);
    const points: Array<{ p: V3; n: V3 }> = [];
    for (let i = 0; i <= 8; i++) {
        const angle = i * Math.PI / 16;
        const n = vAdd(vAdd([0, 0, 0], from, Math.cos(angle)), to, Math.sin(angle));
        points.push({ p: vAdd(center, n, radius + lift), n });
    }
    return points;
}

const CUBE_SURFACE_COLOR = hexToRgbTuple(CUBE_AWAY_THEME.cubeSurface);

function pushOrientedTri(
    positions: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    a: V3,
    b: V3,
    c: V3,
    outDir: V3,
    color: V3,
): void {
    const ab = vSub(b, a);
    const ac = vSub(c, a);
    let nx = ab[1] * ac[2] - ab[2] * ac[1];
    let ny = ab[2] * ac[0] - ab[0] * ac[2];
    let nz = ab[0] * ac[1] - ab[1] * ac[0];
    const flip = nx * outDir[0] + ny * outDir[1] + nz * outDir[2] < 0;
    if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
    }
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const base = positions.length / 3;
    const pts = flip ? [a, c, b] : [a, b, c];
    for (const p of pts) {
        positions.push(p[0], p[1], p[2]);
        normals.push(nx, ny, nz);
        colors.push(...color, 1);
    }
    indices.push(base, base + 1, base + 2);
}

function pushOrientedQuad(
    positions: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    a: V3,
    b: V3,
    c: V3,
    d: V3,
    outDir: V3,
    colorA: V3,
    colorB: V3 = colorA,
    colorC: V3 = colorA,
    colorD: V3 = colorA,
): void {
    const ab = vSub(b, a);
    const ac = vSub(c, a);
    let nx = ab[1] * ac[2] - ab[2] * ac[1];
    let ny = ab[2] * ac[0] - ab[0] * ac[2];
    let nz = ab[0] * ac[1] - ab[1] * ac[0];
    const flip = nx * outDir[0] + ny * outDir[1] + nz * outDir[2] < 0;
    if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
    }
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const base = positions.length / 3;
    const pts = [a, b, c, d];
    const cols = [colorA, colorB, colorC, colorD];
    for (let i = 0; i < 4; i++) {
        const p = pts[i];
        const cl = cols[i];
        positions.push(p[0], p[1], p[2]);
        normals.push(nx, ny, nz);
        colors.push(cl[0], cl[1], cl[2], 1);
    }
    if (flip) {
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    } else {
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
}

function addBoxGeometry(
    positions: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    baseColor: V3,
): void {
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const faceDefs: ReadonlyArray<{
        n: [number, number, number];
        v: [number, number, number][];
    }> = [
        { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
        { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
        { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
        { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
        { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
        { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    ];
    for (const f of faceDefs) {
        const baseIdx = positions.length / 3;
        for (const pt of f.v) {
            positions.push(cx + pt[0], cy + pt[1], cz + pt[2]);
            normals.push(f.n[0], f.n[1], f.n[2]);
            colors.push(...baseColor, 1);
        }
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }
}

/** A rounded colored patch or an ivory glyph lying flat on the cube face. */
function addFlatGlyph(
    geometry: { positions: number[]; normals: number[]; colors: number[]; indices: number[] },
    origin: V3, right: V3, up: V3, normal: V3,
    color: V3, points: readonly (readonly [number, number])[],
): void {
    const { positions, normals, colors, indices } = geometry;
    const toSurface = ([x, y]: readonly [number, number]): V3 => vAdd(vAdd(origin, right, x), up, y);
    for (let i = 0; i < points.length; i++) {
        pushOrientedTri(positions, normals, colors, indices,
            origin, toSurface(points[i]), toSurface(points[(i + 1) % points.length]), normal, color);
    }
}

function roundTile(width: number, height: number, radius: number): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    for (let corner = 0; corner < 4; corner++) {
        const middle = (corner + .5) * Math.PI / 2;
        const x = Math.sign(Math.cos(middle)) * (width / 2 - radius);
        const y = Math.sign(Math.sin(middle)) * (height / 2 - radius);
        for (let step = 0; step <= 5; step++) {
            const theta = (corner + step / 5) * Math.PI / 2;
            points.push([x + Math.cos(theta) * radius, y + Math.sin(theta) * radius]);
        }
    }
    return points;
}

const TILE_ARROW = [[-.092, -.27], [.092, -.27], [.092, 0], [.245, 0], [0, .28], [-.245, 0], [-.092, 0]] as const;
const TILE_FORK_ARM = [[-.068, -.245], [.068, -.245], [.068, 0], [.152, 0], [0, .16], [-.152, 0], [-.068, 0]] as const;
const TILE_IVORY: V3 = [1, .984, .91];

function addSplitGlyph(
    geometry: Parameters<typeof addFlatGlyph>[0], center: V3, normal: V3,
    first: V3, second: V3,
): void {
    const exits = vAdd(first, second);
    const stem = vDot(exits, exits) < .01 ? vCross(first, normal) : vNorm(vAdd([0, 0, 0], exits, -1));
    addFlatGlyph(geometry, vAdd(center, stem, .14), vCross(stem, normal), stem, normal, TILE_IVORY, roundTile(.14, .41, .07));
    for (const direction of [first, second]) {
        addFlatGlyph(geometry, vAdd(center, direction, .216), vCross(direction, normal), direction, normal, TILE_IVORY, TILE_FORK_ARM);
    }
}

function buildMesh(
    assets: AssetService,
    positions: number[],
    normals: number[],
    colors: number[],
    indices: number[],
    tracked: Mesh[],
): Mesh {
    const mesh = assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, utils.createMesh({
        positions,
        normals,
        colors,
        indices,
    }));
    tracked.push(mesh);
    return mesh;
}

export class CubeAwayView3D {
    readonly root = new Node('CubeAwayWorld');
    readonly camera: Camera;
    readonly projection: Node;
    private readonly projectionImage: Node;
    private readonly projectionOpacity: UIOpacity;
    private readonly pivot = new Node('CubePivot');
    private readonly staticGroup = new Node('CubeStatic');
    private readonly arrowsGroup = new Node('CubeArrows');
    private readonly fxGroup = new Node('CubeFx');

    private readonly target: RenderTexture;
    private readonly frame: SpriteFrame;
    private readonly displayMaterial: Material;
    private readonly shadowProjection = new Vec4();
    private readonly shadowRotation = new Vec4();
    private readonly solidMaterial: Material;
    private readonly boardMaterial: Material;
    private readonly arrowNormalMat: Material;
    private readonly mutedSnakeMat: Material;
    private readonly arrowHintMat: Material;
    private readonly arrowBlockedMat: Material;
    private readonly hintOutlineMat: Material;
    private readonly focusOutlineMat: Material;
    private readonly hintPulse = new Vec4();
    private readonly focusPulse = new Vec4();
    private hintClock = 0;

    private readonly meshes: Mesh[] = [];
    private readonly staticTracks = new Map<number, FlyRunnerTrack>();
    private readonly arrowNodes = new Map<number, Node>();
    private readonly reverseIndicators: ReverseIndicator[] = [];
    private readonly segmentHits = new Map<number, ArrowSegmentHit[]>();
    private readonly uploadBuffers = new WeakMap<MeshRenderer, ReturnType<typeof snakeUploadBuffers>>();
    private readonly flyAnims: ActiveFlyAnim[] = [];
    private readonly bounceAnims: ActiveBounceAnim[] = [];
    private readonly blockedFlashUntil = new Map<number, number>();
    private readonly smashAnims: ActiveSmashAnim[] = [];
    private readonly sparkleBursts: ActiveSparkleBurst[] = [];

    private readonly boardRotation = new Quat();
    private readonly rotationStep = new Quat();
    private readonly dragAxis = new Vec3();
    private velYaw = 0;
    private velPitch = 0;
    private cameraDist = 11.5;
    private targetCameraDist = 11.5;
    private minDist = 7.2;
    private maxDist = 20.0;
    private baseFitDist = 11.5;

    private readonly hintedArrowIds = new Set<number>();
    private focusHintArrowId = -1;
    private animClock = 0;
    private viewWidth = 680;
    private viewHeight = 760;
    private board?: CubeAwayBoard;
    private disposed = false;
    private needsRedraw = true;

    constructor(
        worldParent: Node, uiParent: Node, private readonly assets: AssetService, private readonly flatEffect: EffectAsset,
        private readonly sideHead: SpriteFrame, private readonly frontHead: SpriteFrame, private readonly headDistance: Texture2D,
    ) {
        if (!sideHead?.texture || sideHead.texture !== frontHead?.texture) {
            throw new Error('Cube Away snake head frames must share an atlas');
        }
        this.root.layer = CUBE_WORLD_LAYER;
        this.pivot.layer = CUBE_WORLD_LAYER;
        this.staticGroup.layer = CUBE_WORLD_LAYER;
        this.arrowsGroup.layer = CUBE_WORLD_LAYER;
        this.fxGroup.layer = CUBE_WORLD_LAYER;
        this.root.addChild(this.pivot);
        this.pivot.addChild(this.staticGroup);
        this.pivot.addChild(this.arrowsGroup);
        this.pivot.addChild(this.fxGroup);
        worldParent.addChild(this.root);

        this.target = assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new RenderTexture());
        this.target.reset({ width: 720, height: 820 });
        this.frame = assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new SpriteFrame());
        this.frame.texture = this.target;
        this.frame.packable = false;

        this.solidMaterial = this.createMaterial(new Color(255, 255, 255, 255));
        this.boardMaterial = assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new Material());
        this.boardMaterial.initialize({ effectAsset: flatEffect, defines: { USE_BOARD_SKIN: true } });
        this.arrowNormalMat = this.createMaterial(new Color(255, 255, 255, 255), 'snake');
        this.mutedSnakeMat = this.createMaterial(new Color(255, 255, 255, 255), 'muted');
        this.arrowHintMat = this.createMaterial(new Color(24, 148, 255, 255), 'snake');
        this.arrowBlockedMat = this.createMaterial(new Color(244, 91, 107, 255), 'feedback');
        this.hintOutlineMat = this.createMaterial(new Color(105, 73, 153, 255), 'hint');
        this.focusOutlineMat = this.createMaterial(new Color(83, 39, 163, 255), 'hint');

        const camNode = new Node('CubeAwayCamera');
        camNode.layer = CUBE_WORLD_LAYER;
        this.root.addChild(camNode);
        camNode.setPosition(0, 0, 80);
        this.camera = camNode.addComponent(Camera);
        this.camera.visibility = CUBE_WORLD_LAYER;
        this.camera.projection = Camera.ProjectionType.ORTHO;
        this.camera.fovAxis = Camera.FOVAxis.HORIZONTAL;
        this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera.clearColor = new Color(0, 0, 0, 0);
        this.camera.fov = 38;
        this.camera.near = 0.5;
        this.camera.far = 200;
        this.camera.priority = -5;
        this.camera.targetTexture = this.target;

        this.projection = new Node('CubeViewportProjection');
        this.projection.layer = uiParent.layer;
        uiParent.addChild(this.projection);
        const maskUi = this.projection.addComponent(UITransform);
        maskUi.setContentSize(this.viewWidth, this.viewHeight);
        this.projection.addComponent(Mask);

        this.projectionImage = new Node('CubeViewportSprite');
        this.projectionImage.layer = uiParent.layer;
        this.projection.addChild(this.projectionImage);
        this.projectionImage.addComponent(UITransform).setContentSize(this.viewWidth, this.viewHeight);
        this.projectionOpacity = this.projectionImage.addComponent(UIOpacity);
        const sp = this.projectionImage.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = this.frame;
        this.displayMaterial = assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new Material());
        this.displayMaterial.initialize({ effectAsset: flatEffect, technique: 1 });
        sp.customMaterial = this.displayMaterial;
    }

    setRewardBackdropStrength(strength: number): void {
        this.projectionOpacity.opacity = Math.round(255 - 180 * strength);
    }

    prepareRender(): void {
        const visible = this.projection.activeInHierarchy;
        this.camera.enabled = visible && this.needsRedraw;
        if (this.camera.enabled) {
            const texelX = 1 / this.target.width, texelY = 1 / this.target.height;
            const cellHeight = this.pivot.scale.y / (2 * this.camera.orthoHeight);
            const cellWidth = cellHeight * this.viewHeight / this.viewWidth;
            const p = this.shadowProjection;
            if (p.x !== texelX || p.y !== texelY || p.z !== cellWidth || p.w !== cellHeight) {
                p.set(texelX, texelY, cellWidth, cellHeight);
                this.displayMaterial.setProperty('shadowProjection', p);
            }
        }
        if (visible) this.needsRedraw = false;
    }

    invalidate(): void {
        this.needsRedraw = true;
    }

    setEntranceProgress(progress: number): void {
        // Give the smaller, turned board time to read before it rises and settles.
        const landing = .7;
        const rise = .5 - .5 * Math.cos(Math.PI * Math.min(1, progress / landing));
        const settle = Math.min(1, Math.max(0, (progress - landing) / (1 - landing)));
        const bounce = rise * (.5 + .5 * Math.cos(Math.PI * settle));
        const scale = 1 - .48 * (1 - rise) + .02 * bounce;
        this.pivot.setScale(scale, scale, scale);
        this.pivot.setPosition(0, this.cameraDist * (-.32 * (1 - rise) + .015 * bounce), 0);
        const turn = progress * progress * (3 - 2 * progress);
        this.applyPivotRotation(-Math.PI / 3 * (1 - turn));
        this.projectionOpacity.opacity = Math.round(255 * (.8 + .2 * Math.min(1, progress / .15)));
    }

    private createMaterial(mainColor: Color, ink?: 'snake' | 'muted' | 'feedback' | 'hint'): Material {
        const mat = this.assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, new Material());
        mat.initialize({
            effectAsset: this.flatEffect,
            defines: {
                USE_SNAKE_HEAD: !!ink, USE_MUTED_INK: ink === 'muted',
                USE_FEEDBACK_INK: ink === 'feedback' || ink === 'hint', USE_HINT_OUTLINE: ink === 'hint',
            },
        });
        mat.setProperty('mainColor', mainColor);
        if (ink) {
            const texture = this.sideHead.texture;
            const uvRect = (frame: SpriteFrame): Vec4 => {
                const { x, y, width, height } = frame.rect;
                return new Vec4(x / texture.width, y / texture.height, width / texture.width, height / texture.height);
            };
            mat.setProperty('headAtlas', texture);
            mat.setProperty('headDistance', this.headDistance);
            mat.setProperty('sideFrame', uvRect(this.sideHead));
            mat.setProperty('frontFrame', uvRect(this.frontHead));
        }
        return mat;
    }

    layout(viewportWidth: number, viewportHeight: number, viewportCenterY: number, centerX = 0): void {
        if (this.disposed) return;
        this.needsRedraw = true;
        this.viewWidth = Math.max(240, Math.round(viewportWidth));
        this.viewHeight = Math.max(240, Math.round(viewportHeight));

        // Fit Width already converts design units to physical pixels. Allow a small
        // oversample for thin snake edges, with one scale for both texture axes.
        const density = Math.min(view.getScaleX() * 1.25, 2, MAX_RT_SIZE / Math.max(this.viewWidth, this.viewHeight));
        const rtW = Math.max(1, Math.round(this.viewWidth * density));
        const rtH = Math.max(1, Math.round(this.viewHeight * density));
        if (this.target.width !== rtW || this.target.height !== rtH) {
            this.target.resize(rtW, rtH);
            this.frame.rect = new Rect(0, 0, rtW, rtH);
            this.frame.originalSize = new Size(rtW, rtH);
        }

        this.projection.setPosition(centerX, viewportCenterY, 0);
        this.projection.getComponent(UITransform)?.setContentSize(this.viewWidth, this.viewHeight);
        this.projectionImage.setScale(1, 1, 1);
        this.projectionImage.getComponent(UITransform)?.setContentSize(this.viewWidth, this.viewHeight);

        this.updateFramingDistance();
    }

    bindBoard(board: CubeAwayBoard, skin?: SpriteFrame): void {
        if (this.disposed) return;
        this.board = board;
        this.clearSceneMeshes();
        this.hintedArrowIds.clear();
        this.focusHintArrowId = -1;
        this.blockedFlashUntil.clear();

        this.resetCamera();
        this.boardMaterial.setProperty('boardAtlas', skin?.texture ?? null);
        this.boardMaterial.setProperty('boardInvSize', new Vec4(1 / board.sizeX, 1 / board.sizeY, 1 / board.sizeZ, 0));
        this.buildStaticCubeMesh(board, !!skin);
        for (const arrow of board.arrows) {
            if (!arrow.removed) {
                this.buildArrowNode(arrow);
            }
        }
    }

    resetCamera(): void {
        const cam = this.board?.defaultCamera;
        this.stopRotation();
        this.updateFramingDistance();
        this.targetCameraDist = this.baseFitDist;
        this.cameraDist = this.baseFitDist;
        if (cam && cam[2] > 0.1) this.setViewAngles(cam[0], cam[1]);
        else this.setViewAngles(.68, .44);
        this.camera.node.setPosition(0, 0, 80);
    }

    rotateByDelta(dx: number, dy: number): void {
        const sens = 0.0085;
        const yaw = dx * sens, pitch = -dy * sens;
        this.rotateInView(yaw, pitch);
        this.velYaw = yaw * 26;
        this.velPitch = pitch * 26;
        this.applyPivotRotation();
    }

    stopRotation(): void {
        this.velYaw = 0;
        this.velPitch = 0;
    }

    zoomByFactor(factor: number): void {
        if (!Number.isFinite(factor) || factor <= 0) return;
        this.targetCameraDist = Math.max(this.minDist, Math.min(this.maxDist, this.targetCameraDist / factor));
    }

    setHintedArrow(arrowId: number): void {
        if (arrowId < 0) {
            this.setHintedArrows([]);
        } else {
            this.setHintedArrows([arrowId], arrowId);
        }
    }

    setHintedArrows(arrowIds: readonly number[], focusArrowId = -1, autoFocus = true, focusCellIndex = 0): void {
        this.hintedArrowIds.clear();
        for (const id of arrowIds) {
            if (id >= 0) this.hintedArrowIds.add(id);
        }
        this.hintClock = 0;
        if (this.hintedArrowIds.size > 0) this.updateHintBreath(0);
        this.focusHintArrowId = focusArrowId >= 0 ? focusArrowId : arrowIds[0] ?? -1;
        const legalMoves = arrowIds.length > 0 ? this.board?.collectLegalMoves() ?? [] : [];
        this.staticTracks.forEach((track, id) => {
            const cell = id === focusArrowId ? focusCellIndex : this.hintedArrowIds.has(id)
                ? legalMoves.find(move => move.arrowId === id)?.tappedCellIndex ?? 0 : 0;
            const tail = track.isDouble && cell > 0;
            if (track.hintTail !== tail) { track.hintTail = tail; this.renderFlyTrackMesh(track, 0, true); }
        });
        this.refreshAllArrowMaterials();

        if (autoFocus) {
            const targetFocus = focusArrowId >= 0 ? focusArrowId : arrowIds[0] ?? -1;
            if (targetFocus >= 0) {
                this.focusOnHint(targetFocus, focusCellIndex);
            }
        }
    }

    private focusOnHint(arrowId: number, cellIndex: number): void {
        const board = this.board;
        const arrow = board?.arrows[arrowId];
        if (!board || !arrow) return;
        this.focusOnArrow(arrowId, cellIndex);
        const end = arrow.cells[cellIndex];
        const pos = this.cellSurfaceWorldPos(end, .515);
        const canTap = (): boolean => {
            const p = this.projectLocalToStage(pos);
            const x = p.x - this.projection.position.x, y = p.y - this.projection.position.y;
            if (Math.abs(x) >= this.viewWidth / 2 || Math.abs(y) >= this.viewHeight / 2) return false;
            const hit = this.pickAtLocalPoint(x, y);
            return hit?.arrowId === arrowId && board.isTailSideTap(arrow, hit.cellIndex) === board.isTailSideTap(arrow, cellIndex);
        };
        if (canTap()) return;

        // A recessed head may only be visible through the mouth or side of its channel.
        // Keep the preferred three-quarter view when possible, then try the face straight on.
        if (this.cameraDist < this.baseFitDist) {
            this.cameraDist = this.targetCameraDist = this.baseFitDist;
            this.applyPivotRotation();
            if (canTap()) return;
        }
        const n = FACE_NORMAL[parseCellId(end).face];
        const baseYaw = Math.atan2(-n[0], n[2]);
        for (const pitch of [n[1] * 1.25, .65, -.65, 1.25, -1.25]) {
            for (const offset of [0, .45, -.45, 1.05, -1.05, Math.PI / 2, -Math.PI / 2, Math.PI]) {
                this.setViewAngles(baseYaw + offset, pitch);
                if (canTap()) return;
            }
        }
        this.focusOnArrow(arrowId, cellIndex);
    }

    private focusOnArrow(arrowId: number, cellIndex = 0): void {
        const arrow = this.board?.arrows[arrowId];
        if (!arrow || arrow.cells.length === 0) return;
        const head = parseCellId(arrow.cells[Math.min(cellIndex, arrow.cells.length - 1)]);
        this.focusOnFaceNormal(FACE_NORMAL[head.face], 0.34);
    }

    private focusOnFaceNormal(n: V3, tiltYaw = 0.24, forcedPitch?: number): void {
        const yaw = Math.atan2(-n[0], n[2]) + tiltYaw;
        const pitch = forcedPitch ?? (n[1] > 0.5 ? 0.85 : n[1] < -0.5 ? -0.85 : 0.32);
        this.stopRotation();
        this.cameraDist = this.targetCameraDist;
        this.camera.node.setPosition(0, 0, 80);
        this.setViewAngles(yaw, pitch);
    }

    /**
     * 自动将棋盘旋转至新机制最清晰可见的一侧，并把该目标的三维区域精确投影到根 UI 坐标系，
     * 供全屏遮罩聚光灯高亮使用。
     */
    focusAndLocateMechanic(mechKey: string): MechanicSpotlightTarget | null {
        if (this.disposed || !this.board) return null;
        if (mechKey === 'basic') {
            return this.locateBasicSpotlight();
        }
        if (mechKey === 'pause' || mechKey === 'changer' || mechKey === 'reverse_changer' || mechKey === 'split_changer') {
            return this.locateGimmickSpotlight(mechKey);
        }
        if (mechKey === 'cornerless') {
            return this.locateCornerlessSpotlight();
        }
        if (mechKey === 'carved') {
            return this.locateCarvedSpotlight();
        }
        if (mechKey === 'double' || mechKey === 'branch') {
            return this.locateArrowGroupSpotlight(mechKey);
        }
        return {
            x: 0,
            y: this.projection.position.y,
            radius: 108,
        };
    }

    private projectLocalToStage(pos: V3): { x: number; y: number; depth: number; worldZ: number } {
        const worldPt = Vec3.transformQuat(new Vec3(), new Vec3(pos[0], pos[1], pos[2]), this.pivot.rotation);
        const depth = Math.max(0.25, 80 - worldPt.z);
        const aspect = this.viewWidth / Math.max(1, this.viewHeight);
        const halfV = this.camera.orthoHeight;
        const ndcX = worldPt.x / (halfV * aspect);
        const ndcY = worldPt.y / halfV;
        return {
            x: this.projection.position.x + ndcX * (this.viewWidth * 0.5),
            y: this.projection.position.y + ndcY * (this.viewHeight * 0.5),
            depth,
            worldZ: worldPt.z,
        };
    }

    private projectSpanFootprint(
        center: V3,
        uAxis: V3,
        vAxis: V3,
        halfU: number,
        halfV: number,
        minRadius: number,
        maxRadius: number,
    ): MechanicSpotlightTarget {
        const c = this.projectLocalToStage(center);
        const corners = [
            this.projectLocalToStage(vAdd(vAdd(center, uAxis, halfU), vAxis, halfV)),
            this.projectLocalToStage(vAdd(vAdd(center, uAxis, -halfU), vAxis, halfV)),
            this.projectLocalToStage(vAdd(vAdd(center, uAxis, halfU), vAxis, -halfV)),
            this.projectLocalToStage(vAdd(vAdd(center, uAxis, -halfU), vAxis, -halfV)),
        ];
        let maxR = 0;
        for (const p of corners) {
            maxR = Math.max(maxR, Math.hypot(p.x - c.x, p.y - c.y));
        }
        return {
            x: c.x,
            y: c.y,
            radius: Math.max(minRadius, Math.min(maxRadius, Math.round(maxR * 1.18))),
        };
    }

    private facePriority(face: FaceName): number {
        const order: Record<FaceName, number> = {
            '+z': 60, '+x': 50, '+y': 40, '-x': 30, '-y': 20, '-z': 10,
        };
        return order[face];
    }

    private locateGimmickSpotlight(type: string): MechanicSpotlightTarget | null {
        const b = this.board!;
        const list = Array.from(b.gimmicks.values()).filter((g) => {
            if (g.type !== type) return false;
            if (!b.exposedCells.has(g.cellId)) return false;
            if (g.type === 'changer' && !g.exitDir) return false;
            if (g.type === 'split_changer' && !g.exitDir) return false;
            return true;
        });
        if (list.length === 0) return null;

        const cx = (b.sizeX - 1) * 0.5;
        const cy = (b.sizeY - 1) * 0.5;
        const cz = (b.sizeZ - 1) * 0.5;
        let best = list[0];
        let bestScore = -Infinity;
        for (const g of list) {
            const unoccupied = !b.cellOccupancy.has(g.cellId) ? 1000 : 0;
            const centerBias = -(Math.abs(g.x - cx) + Math.abs(g.y - cy) + Math.abs(g.z - cz));
            const perpendicularExits = g.type === 'split_changer' && g.exitDir && g.exitDir2
                && vDot(CUBE_FRAME[g.face][g.exitDir], CUBE_FRAME[g.face][g.exitDir2]) === 0;
            const score = unoccupied + (perpendicularExits ? 75 : 0) + this.facePriority(g.face) + centerBias;
            if (score > bestScore) {
                bestScore = score;
                best = g;
            }
        }

        const n = FACE_NORMAL[best.face];
        const f = CUBE_FRAME[best.face];
        this.focusOnFaceNormal(n, 0.22);
        const p = this.cellSurfaceWorldPos(best.cellId, 0.52);
        const target = this.projectSpanFootprint(p, f.right, f.up, 0.56, 0.56, 60, 128);
        if (type !== 'split_changer' || !best.exitDir) return target;
        const routes = resolveSplitExits(best.exitDir, best.exitDir2).map(direction => ({
            start: this.projectLocalToStage(vAdd(p, f[direction], .48)),
            end: this.projectLocalToStage(vAdd(p, f[direction], 1.34)),
        }));
        return { ...target, radius: Math.max(102, target.radius), routes };
    }

    private locateCornerlessSpotlight(): MechanicSpotlightTarget | null {
        const b = this.board!;
        if (b.cornerlessEdges.size === 0) return null;

        // Collect pairs bridged by any visible arrow to prefer a live crossing edge
        const arrowCrossingKeys = new Set<string>();
        for (const arrow of b.arrows) {
            if (arrow.removed) continue;
            for (let i = 0; i < arrow.cells.length - 1; i++) {
                const ca = parseCellId(arrow.cells[i]);
                const cb = parseCellId(arrow.cells[i + 1]);
                if (ca.face !== cb.face) {
                    const pairA = ca.face < cb.face ? `${ca.face}|${cb.face}` : `${cb.face}|${ca.face}`;
                    arrowCrossingKeys.add(`${ca.x},${ca.y},${ca.z}:${pairA}`);
                    arrowCrossingKeys.add(`${cb.x},${cb.y},${cb.z}:${pairA}`);
                }
            }
        }

        const entries = Array.from(b.cornerlessEdges);
        let best: { x: number; y: number; z: number; f1: FaceName; f2: FaceName } | null = null;
        let bestScore = -Infinity;
        const cx = (b.sizeX - 1) * 0.5;
        const cy = (b.sizeY - 1) * 0.5;
        const cz = (b.sizeZ - 1) * 0.5;

        for (const key of entries) {
            const [coordPart, facePart] = key.split(':');
            const [xs, ys, zs] = coordPart.split(',');
            const [f1s, f2s] = facePart.split('|');
            const x = Number(xs);
            const y = Number(ys);
            const z = Number(zs);
            const f1 = f1s as FaceName;
            const f2 = f2s as FaceName;
            const hasExposed = b.exposedCells.has(formatCellId(x, y, z, f1)) && b.exposedCells.has(formatCellId(x, y, z, f2));
            const arrowBonus = arrowCrossingKeys.has(key) ? 2000 : 0;
            const centerBias = -(Math.abs(x - cx) + Math.abs(y - cy) + Math.abs(z - cz)) * 4;
            const score = (hasExposed ? 500 : 0) + arrowBonus + this.facePriority(f1) + this.facePriority(f2) + centerBias;
            if (score > bestScore) {
                bestScore = score;
                best = { x, y, z, f1, f2 };
            }
        }
        if (!best) return null;

        const n1 = FACE_NORMAL[best.f1];
        const n2 = FACE_NORMAL[best.f2];
        const bisector = vNorm([n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]]);
        const pitchTilt = bisector[1] > 0.35 ? 0.54 : bisector[1] < -0.35 ? -0.54 : 0.24;
        this.focusOnFaceNormal(bisector, 0.08, pitchTilt);

        const c = this.voxelOffsetCenter(best.x, best.y, best.z);
        const edgeMid: V3 = [
            c[0] + (n1[0] + n2[0]) * 0.54,
            c[1] + (n1[1] + n2[1]) * 0.54,
            c[2] + (n1[2] + n2[2]) * 0.54,
        ];
        const edgeTang = vNorm(vCross(n1, n2));
        const perpAxis = vNorm([n1[0] - n2[0], n1[1] - n2[1], n1[2] - n2[2]]);
        return this.projectSpanFootprint(edgeMid, edgeTang, perpAxis, 0.92, 0.58, 68, 136);
    }

    private locateCarvedSpotlight(): MechanicSpotlightTarget | null {
        const crossing = this.board!.findHollowCrossing();
        if (!crossing) return null;
        const normal = FACE_NORMAL[parseCellId(crossing.from).face];
        this.targetCameraDist = this.baseFitDist;
        this.focusOnFaceNormal(normal, .32, normal[1] ? normal[1] * 1.07 : .42);

        // Project the two lips at the playable surface, not the floor inside the recess.
        const start = this.projectLocalToStage(this.cellSurfaceWorldPos(crossing.from, .5));
        const end = this.projectLocalToStage(this.cellSurfaceWorldPos(crossing.to, .5));
        return {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
            radius: Math.hypot(end.x - start.x, end.y - start.y) / 2 + 16,
            routes: [{ start, end }],
        };
    }

    private locateBasicSpotlight(): MechanicSpotlightTarget | null {
        const b = this.board!;
        const fireable = b.collectFireableArrowIds();
        if (fireable.length === 0) return null;

        let chosen = b.arrows[fireable[0]];
        let bestScore = -Infinity;
        for (const id of fireable) {
            const a = b.arrows[id];
            if (!a || a.removed || a.cells.length === 0) continue;
            const headFace = parseCellId(a.cells[0]).face;
            const score = this.facePriority(headFace) + Math.max(0, 10 - a.cells.length) * 2;
            if (score > bestScore) {
                bestScore = score;
                chosen = a;
            }
        }
        if (!chosen) return null;
        this.focusOnArrow(chosen.id);
        this.setHintedArrows([chosen.id], chosen.id, false);
        const p = this.projectLocalToStage(this.cellSurfaceWorldPos(chosen.cells[0], .54));
        return { x: p.x, y: p.y, radius: 78, highlightedArrowIds: [chosen.id] };
    }

    private locateArrowGroupSpotlight(mechKey: 'double' | 'branch'): MechanicSpotlightTarget | null {
        const b = this.board!;
        const candidates = b.arrows.filter((a) => !a.removed && (mechKey === 'double' ? a.isDouble : a.linkGroup > 0));
        if (candidates.length === 0) return null;

        let chosen = candidates[0];
        let bestScore = -Infinity;
        for (const a of candidates) {
            const headFace = parseCellId(a.cells[0]).face;
            const lenScore = mechKey === 'double' ? Math.max(0, 12 - a.cells.length) * 3 : 0;
            const score = this.facePriority(headFace) + lenScore;
            if (score > bestScore) {
                bestScore = score;
                chosen = a;
            }
        }

        const groupIds = mechKey === 'branch' && chosen.linkGroup > 0
            ? (b.linkGroups.get(chosen.linkGroup) ?? [chosen.id])
            : [chosen.id];
        return this.projectArrowSpotlight(groupIds, chosen, 70, 152);
    }

    private projectArrowSpotlight(
        groupIds: readonly number[],
        chosen: ArrowRuntime,
        minRadius: number,
        maxRadius: number,
    ): MechanicSpotlightTarget {
        const b = this.board!;
        this.focusOnArrow(chosen.id);
        this.cameraDist = this.targetCameraDist;
        this.camera.node.setPosition(0, 0, 80);
        this.setHintedArrows(groupIds, chosen.id, false);

        const headFace = parseCellId(chosen.cells[0]).face;
        const pts: Array<{ x: number; y: number }> = [];
        for (const id of groupIds) {
            const arr = b.arrows[id];
            if (!arr || arr.removed) continue;
            for (const cid of arr.cells) {
                const parsed = parseCellId(cid);
                if (parsed.face !== headFace && groupIds.length === 1) continue;
                const sp = this.projectLocalToStage(this.cellSurfaceWorldPos(cid, 0.54));
                if (sp.worldZ > -0.25) {
                    pts.push({ x: sp.x, y: sp.y });
                }
            }
        }
        if (pts.length === 0) {
            const sp = this.projectLocalToStage(this.cellSurfaceWorldPos(chosen.cells[0], 0.54));
            pts.push({ x: sp.x, y: sp.y });
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
        const midX = (minX + maxX) * 0.5;
        const midY = (minY + maxY) * 0.5;
        const halfDiag = Math.hypot((maxX - minX) * 0.5, (maxY - minY) * 0.5);
        return {
            x: midX,
            y: midY,
            radius: Math.max(minRadius, Math.min(maxRadius, Math.round(halfDiag + 44))),
            highlightedArrowIds: groupIds,
        };
    }

    private refreshAllArrowMaterials(): void {
        this.staticTracks.forEach((track, id) => {
            const emphasis = (this.blockedFlashUntil.get(id) ?? 0) > this.animClock ? 'blocked'
                : this.hintedArrowIds.has(id) ? 'hint' : 'none';
            const focus = emphasis === 'hint' && id === this.focusHintArrowId;
            const fill = emphasis === 'none' && this.hintedArrowIds.size ? this.mutedSnakeMat : this.arrowNormalMat;
            if (track.mr.getSharedMaterial(0) !== fill) track.mr.setSharedMaterial(fill, 0);
            if (track.emphasis !== emphasis) {
                track.hintFocus = focus;
                track.emphasis = emphasis;
                this.renderFlyTrackMesh(track, 0, true);
            } else if (track.hintFocus !== focus) {
                track.hintFocus = focus;
                track.outline?.setSharedMaterial(focus ? this.focusOutlineMat : this.hintOutlineMat, 0);
                this.needsRedraw = true;
            }
        });
    }

    rebuildArrow(arrowId: number): void {
        if (!this.board) return;
        this.releaseStaticSnakeMesh(arrowId);
        const old = this.arrowNodes.get(arrowId);
        if (old) {
            old.destroy();
            this.arrowNodes.delete(arrowId);
        }
        const arrow = this.board.arrows[arrowId];
        if (arrow && !arrow.removed) {
            this.buildArrowNode(arrow);
        }
        this.refreshAllArrowMaterials();
    }

    refreshReverseGimmick(cellId: string, dir: DirName): void {
        const ind = this.reverseIndicators.find((r) => r.cellId === cellId);
        if (!ind) return;
        let angleDeg = 0;
        if (dir === 'up') angleDeg = 0;
        else if (dir === 'right') angleDeg = -90;
        else if (dir === 'down') angleDeg = 180;
        else if (dir === 'left') angleDeg = 90;
        ind.node.setRotationFromEuler(0, 0, angleDeg);
        this.needsRedraw = true;
    }

    animateFly(
        arrowId: number,
        primarySteps: readonly PathStep[],
        primaryFinalDir?: DirName,
        useTail = false,
        secondarySteps: readonly PathStep[] = [],
        secondaryFinalDir?: DirName,
        secondaryOriginCell?: string,
    ): void {
        const node = this.arrowNodes.get(arrowId);
        const arrow = this.board?.arrows[arrowId];
        if (!node || !this.board || !arrow) return;
        this.cancelBounceAnim(arrowId);
        node.destroy();
        this.arrowNodes.delete(arrowId);
        this.releaseStaticSnakeMesh(arrowId);
        this.hintedArrowIds.delete(arrowId);
        if (this.focusHintArrowId === arrowId) this.focusHintArrowId = -1;
        this.blockedFlashUntil.delete(arrowId);
        this.refreshAllArrowMaterials();

        const rootAnim = new Node(`FlyAnim_${arrowId}`);
        rootAnim.layer = CUBE_WORLD_LAYER;
        this.fxGroup.addChild(rootAnim);

        const tracks: FlyRunnerTrack[] = [];
        const primaryTrack = this.buildFlyRunnerTrack(
            rootAnim,
            arrow,
            primarySteps,
            primaryFinalDir ?? arrow.fireDir,
            useTail,
            true,
            undefined,
        );
        if (primaryTrack) tracks.push(primaryTrack);

        if (secondarySteps.length > 0 || secondaryOriginCell) {
            const secTrack = this.buildFlyRunnerTrack(
                rootAnim,
                arrow,
                secondarySteps,
                secondaryFinalDir ?? arrow.fireDir,
                false,
                false,
                secondaryOriginCell,
            );
            if (secTrack && primaryTrack) {
                const fork = this.cellSurfaceWorldPos(secondaryOriginCell ?? secondarySteps[0].cellId, RIBBON_SURFACE_OFFSET);
                let nearest = Infinity;
                for (const sample of primaryTrack.samples) {
                    if (sample.s < primaryTrack.bodyArcLen) continue;
                    const delta = vSub(sample.p, fork);
                    const distance = vDot(delta, delta);
                    if (distance >= nearest) continue;
                    nearest = distance;
                    secTrack.startDistance = sample.s - primaryTrack.bodyArcLen;
                }
                secTrack.node.active = secTrack.startDistance === 0;
                tracks.push(secTrack);
            } else if (secTrack) {
                tracks.push(secTrack);
            }
        }

        if (tracks.length === 0) {
            rootAnim.destroy();
            return;
        }

        this.flyAnims.push({
            arrowId,
            travelDist: 0,
            node: rootAnim,
            tracks,
        });
    }

    private buildFlyRunnerTrack(
        rootAnim: Node,
        arrow: ArrowRuntime,
        steps: readonly PathStep[],
        finalDir: DirName,
        useTail: boolean,
        includeFullBody: boolean,
        overrideOriginCell?: string,
        bounceTargetCellId?: string,
        extendRunway = true,
    ): FlyRunnerTrack | null {
        const board = this.board;
        if (!board || arrow.cells.length === 0) return null;

        const projTang = (fromP: V3, toP: V3, n: V3): V3 => {
            const d = vSub(toP, fromP);
            const dn = vDot(d, n);
            return vNorm([d[0] - dn * n[0], d[1] - dn * n[1], d[2] - dn * n[2]]);
        };

        // Ordered body cells from tail -> active exiting head; `steps` contains strictly
        // cells ahead of the exiting head (may be [] when head sits on cube boundary).
        let bodyCells: string[];
        if (includeFullBody) {
            bodyCells = useTail ? arrow.cells.slice() : arrow.cells.slice().reverse();
        } else if (overrideOriginCell) {
            bodyCells = [overrideOriginCell];
        } else if (steps.length > 0) {
            bodyCells = [steps[0].cellId];
        } else {
            return null;
        }

        const exitCells = steps.map((s) => s.cellId);
        if (bounceTargetCellId && exitCells[exitCells.length - 1] !== bounceTargetCellId && bodyCells[bodyCells.length - 1] !== bounceTargetCellId) {
            exitCells.push(bounceTargetCellId);
        }
        const allCellIds = bodyCells.concat(exitCells);
        const bodyEndCellIdx = bodyCells.length - 1;

        const cellPos = allCellIds.map((id) => this.cellSurfaceWorldPos(id, RIBBON_SURFACE_OFFSET));
        const cellParsed = allCellIds.map((id) => parseCellId(id));
        const cellNorm = cellParsed.map((p) => FACE_NORMAL[p.face]);

        const lastCellId = allCellIds[allCellIds.length - 1];
        const lastFace = parseCellId(lastCellId).face;
        const lastN = FACE_NORMAL[lastFace];
        const lastDirName = steps.length > 0 ? steps[steps.length - 1].dir : finalDir;
        const lastDir = CUBE_FRAME[lastFace][lastDirName];
        const lastP = cellPos[cellPos.length - 1];

        const rawPts: Array<{ p: V3; n: V3 }> = [];
        const addPt = (p: V3, n: V3) => {
            const prev = rawPts[rawPts.length - 1];
            if (prev) {
                const d = vSub(p, prev.p);
                if (Math.hypot(d[0], d[1], d[2]) < 1e-6) return;
            }
            rawPts.push({ p, n });
        };

        const totalCells = allCellIds.length;
        const cornerR = 0.20;
        const roundedBoard = board.voxels.size === board.sizeX * board.sizeY * board.sizeZ;

        const prevEndPt: Array<V3 | null> = new Array(totalCells).fill(null);
        const nextStartPt: Array<V3 | null> = new Array(totalCells).fill(null);

        // Compute arc corners at all interior 90-deg same-plane bends (including exit head bend)
        const interiorArcs = new Map<number, Array<{ p: V3; n: V3 }>>();
        const virtualNextP = vAdd(lastP, lastDir, 1.0);
        for (let k = 0; k < totalCells; k++) {
            const cP = cellPos[k];
            const cN = cellNorm[k];
            if (k === 0) {
                nextStartPt[0] = cP;
            } else {
                const inD = projTang(cellPos[k - 1], cellPos[k], cN);
                const outD = k < totalCells - 1
                    ? projTang(cellPos[k], cellPos[k + 1], cN)
                    : projTang(cellPos[k], virtualNextP, cN);
                if (Math.abs(vDot(inD, outD)) < 0.25) {
                    const entryPt = vAdd(cP, inD, -cornerR);
                    const exitPt = vAdd(cP, outD, cornerR);
                    prevEndPt[k] = entryPt;
                    nextStartPt[k] = exitPt;
                    const piv: V3 = [
                        cP[0] - inD[0] * cornerR + outD[0] * cornerR,
                        cP[1] - inD[1] * cornerR + outD[1] * cornerR,
                        cP[2] - inD[2] * cornerR + outD[2] * cornerR,
                    ];
                    const arcPts: Array<{ p: V3; n: V3 }> = [];
                    const segs = 5;
                    for (let s = 1; s < segs; s++) {
                        const ang = (s / segs) * Math.PI * 0.5;
                        const c = Math.cos(ang);
                        const sn = Math.sin(ang);
                        arcPts.push({
                            p: [
                                piv[0] + (-outD[0] * c + inD[0] * sn) * cornerR,
                                piv[1] + (-outD[1] * c + inD[1] * sn) * cornerR,
                                piv[2] + (-outD[2] * c + inD[2] * sn) * cornerR,
                            ],
                            n: cN,
                        });
                    }
                    interiorArcs.set(k, arcPts);
                } else {
                    prevEndPt[k] = cP;
                    nextStartPt[k] = cP;
                }
            }
        }

        if (bodyCells.length === 1) {
            const headD = totalCells > 1
                ? projTang(cellPos[0], cellPos[1], cellNorm[0])
                : lastDir;
            addPt(vAdd(cellPos[0], headD, -0.55), cellNorm[0]);
        }

        let bodyEndRawIdx = 0;
        let cubeExitRawIdx = 0;

        for (let k = 0; k < totalCells; k++) {
            const arc = interiorArcs.get(k);
            const pIn = prevEndPt[k] ?? cellPos[k];
            const pOut = nextStartPt[k] ?? cellPos[k];
            if (k > 0) addPt(pIn, cellNorm[k]);
            if (arc) {
                for (const ap of arc) addPt(ap.p, ap.n);
            }
            addPt(pOut, cellNorm[k]);
            if (k === bodyEndCellIdx) {
                bodyEndRawIdx = rawPts.length - 1;
            }
            if (k === totalCells - 1) {
                cubeExitRawIdx = rawPts.length - 1;
            }

            if (k < totalCells - 1 && cellParsed[k].face !== cellParsed[k + 1].face) {
                const vcA = this.voxelOffsetCenter(cellParsed[k].x, cellParsed[k].y, cellParsed[k].z);
                const vcB = this.voxelOffsetCenter(cellParsed[k + 1].x, cellParsed[k + 1].y, cellParsed[k + 1].z);
                const vcDiff = vSub(vcB, vcA);
                const nA = cellNorm[k], nB = cellNorm[k + 1];
                const sameVoxel = vcDiff.every(d => d === 0);
                // On an inner fold the adjoining voxel is one step along nA and one against nB.
                // A flight across open space can also end on another face; it stays straight.
                const inner = vcDiff.every((d, i) => d === nA[i] - nB[i]);
                if (vDot(nA, nB) === 0 && (sameVoxel || inner)) {
                    const edge = vAdd(vAdd(vcA, nA, .5), nB, inner ? -.5 : .5);
                    const radius = inner ? -.075 : roundedBoard ? CUBE_EDGE_RADIUS : 0;
                    for (const pt of surfaceFold(edge, nA, nB, radius, RIBBON_SURFACE_OFFSET - .5)) {
                        addPt(pt.p, pt.n);
                    }
                }
            }
        }

        if (extendRunway) {
            // Extend flight straight off the cube edge far enough so long arrows slide
            // completely clear without bunching up at the end of the path.
            const flyClearDist = Math.max(8.5, bodyCells.length * 1.15 + 5.5);
            addPt(vAdd(lastP, lastDir, 1.5), lastN);
            addPt(vAdd(lastP, lastDir, flyClearDist), lastN);
        } else if (!bounceTargetCellId) {
            // Virtual forward target for fallback bounce when no blocker cell is specified
            addPt(vAdd(lastP, lastDir, 0.85), lastN);
            cubeExitRawIdx = rawPts.length - 1;
        }

        return this.finalizeFlyTrack(rootAnim, rawPts, bodyEndRawIdx, cubeExitRawIdx, arrow.isDouble, arrow.colorIndex, arrow.linkGroup > 0);
    }

    private finalizeFlyTrack(
        rootAnim: Node,
        rawPts: Array<{ p: V3; n: V3 }>,
        bodyEndIdx: number,
        cubeExitIdx: number,
        isDouble: boolean,
        colorIndex: number,
        linked: boolean,
    ): FlyRunnerTrack | null {
        if (rawPts.length < 2) return null;
        const samples: FlyPathSample[] = [];
        const foldDistances: number[] = [];
        let accS = 0;
        let bodyArcLen = 0.5;
        let exitArcS = 0.5;

        for (let i = 0; i < rawPts.length; i++) {
            const p = rawPts[i].p;
            const n = rawPts[i].n;
            if (i > 0) {
                const d = vSub(p, rawPts[i - 1].p);
                accS += Math.hypot(d[0], d[1], d[2]);
            }
            if ((i > 0 && vDot(rawPts[i - 1].n, n) < .999999)
                || (i + 1 < rawPts.length && vDot(n, rawPts[i + 1].n) < .999999)) {
                foldDistances.push(accS);
            }
            const pPrev = rawPts[Math.max(0, i - 1)].p;
            const pNext = rawPts[Math.min(rawPts.length - 1, i + 1)].p;
            const rawTang = vNorm(vSub(pNext, pPrev));
            const dn = vDot(rawTang, n);
            const flatTang = vNorm([rawTang[0] - dn * n[0], rawTang[1] - dn * n[1], rawTang[2] - dn * n[2]]);
            const tang = Math.hypot(flatTang[0], flatTang[1], flatTang[2]) > 0.1 ? flatTang : rawTang;
            const left = vNorm(vCross(n, tang));
            samples.push({ p, n, tang, left, s: accS });
            if (i === bodyEndIdx) bodyArcLen = accS;
            if (i === cubeExitIdx) exitArcS = accS;
        }

        const runnerNode = new Node('FlySnake');
        runnerNode.layer = CUBE_WORLD_LAYER;
        rootAnim.addChild(runnerNode);
        const mr = runnerNode.addComponent(MeshRenderer);
        mr.setSharedMaterial(this.arrowNormalMat, 0);

        const track: FlyRunnerTrack = {
            node: runnerNode,
            mr,
            samples,
            foldDistances,
            bodyArcLen: Math.max(0.4, bodyArcLen),
            exitArcS,
            totalArcLen: accS,
            artwork: [snakeHeadArtwork(samples[bodyEndIdx], 1), snakeHeadArtwork(samples[0], -1)],
            isDouble, colorIndex, linked, emphasis: 'none', hintTail: false, hintFocus: false,
            currentMesh: null,
            startDistance: 0,
        };
        this.renderFlyTrackMesh(track, 0);
        return track;
    }

    private sampleTrackAtS(samples: readonly FlyPathSample[], s: number): FlyPathSample {
        if (s <= samples[0].s) return samples[0];
        const last = samples[samples.length - 1];
        if (s >= last.s) return last;

        let lo = 0;
        let hi = samples.length - 1;
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            if (samples[mid].s <= s) lo = mid;
            else hi = mid;
        }
        const a = samples[lo];
        const b = samples[hi];
        const span = Math.max(1e-5, b.s - a.s);
        const t = (s - a.s) / span;
        const p: V3 = [
            a.p[0] + (b.p[0] - a.p[0]) * t,
            a.p[1] + (b.p[1] - a.p[1]) * t,
            a.p[2] + (b.p[2] - a.p[2]) * t,
        ];
        const n = vNorm([a.n[0] + (b.n[0] - a.n[0]) * t, a.n[1] + (b.n[1] - a.n[1]) * t, a.n[2] + (b.n[2] - a.n[2]) * t]);
        const tang = vNorm([a.tang[0] + (b.tang[0] - a.tang[0]) * t, a.tang[1] + (b.tang[1] - a.tang[1]) * t, a.tang[2] + (b.tang[2] - a.tang[2]) * t]);
        const left = vNorm([a.left[0] + (b.left[0] - a.left[0]) * t, a.left[1] + (b.left[1] - a.left[1]) * t, a.left[2] + (b.left[2] - a.left[2]) * t]);
        return { p, n, tang, left, s };
    }

    private renderFlyTrackMesh(track: FlyRunnerTrack, travelDist: number, keepFullScale = false): void {
        const sHead = Math.min(track.totalArcLen, track.bodyArcLen + travelDist);
        const sTail = Math.min(sHead - 0.12, travelDist);
        if (sHead - sTail < 0.08) return;

        const pastTail = keepFullScale ? 0 : Math.max(0, sTail - (track.exitArcS + 0.5));
        const scaleMult = Math.max(0.08, 1 - pastTail / 2.2);
        const geometry = paintSnake(s => this.sampleTrackAtS(track.samples, s), sTail, sHead,
            track.colorIndex, track.isDouble, track.linked, scaleMult, track.emphasis, track.hintTail, track.artwork, track.foldDistances);
        this.needsRedraw = true;
        const moving = track.node.parent !== this.arrowsGroup;
        track.currentMesh = this.uploadSnakeMesh(track.mr, geometry, moving);
        if (geometry.outline) {
            if (!track.outline) {
                const node = new Node('SnakeOutline');
                node.layer = CUBE_WORLD_LAYER;
                track.node.addChild(node);
                track.outline = node.addComponent(MeshRenderer);
            }
            const material = track.emphasis === 'blocked' ? this.arrowBlockedMat : track.hintFocus ? this.focusOutlineMat : this.hintOutlineMat;
            if (track.outline.getSharedMaterial(0) !== material) track.outline.setSharedMaterial(material, 0);
            this.uploadSnakeMesh(track.outline, geometry.outline, moving);
        } else {
            this.releaseTrackOutline(track);
        }
    }

    private uploadSnakeMesh(renderer: MeshRenderer, geometry: ReturnType<typeof paintSnake>, moving: boolean): Mesh {
        const old = renderer.mesh;
        let mesh: Mesh;
        if (moving) {
            const vertices = geometry.positions.length / 3;
            const indices = geometry.indices.length;
            let buffers = this.uploadBuffers.get(renderer);
            if (!buffers || buffers.positions.length !== geometry.positions.length || buffers.indices16.length !== indices) {
                buffers = snakeUploadBuffers(vertices, indices);
                this.uploadBuffers.set(renderer, buffers);
            }
            buffers.positions.set(geometry.positions);
            buffers.normals.set(geometry.normals);
            buffers.uvs.set(geometry.uvs);
            buffers.colors.set(geometry.colors);
            buffers.tangents.set(geometry.tangents);
            buffers.indices16.set(geometry.indices);
            const capacity = old?.struct.dynamic?.info;
            if (old && capacity && vertices <= capacity.maxSubMeshVertices && indices <= capacity.maxSubMeshIndices) {
                old.updateSubMesh(0, buffers);
                renderer.onGeometryChanged();
                return old;
            }
            mesh = utils.MeshUtils.createDynamicMesh(0, buffers, undefined, {
                maxSubMeshes: 1, maxSubMeshVertices: vertices + 32, maxSubMeshIndices: indices + 96,
            });
        } else {
            mesh = utils.createMesh(geometry);
        }
        this.assets.trackRuntimeAsset(CUBE_ASSETS_BUNDLE, mesh);
        renderer.mesh = mesh;
        if (old) this.assets.releaseRuntimeAsset(old);
        return mesh;
    }

    private releaseTrackOutline(track: FlyRunnerTrack): void {
        const renderer = track.outline;
        if (!renderer) return;
        const mesh = renderer.mesh;
        renderer.mesh = null;
        renderer.node.destroy();
        track.outline = undefined;
        if (mesh) this.assets.releaseRuntimeAsset(mesh);
    }

    private releaseTrackMeshes(track: FlyRunnerTrack): void {
        this.releaseTrackOutline(track);
        if (track.currentMesh) {
            this.assets.releaseRuntimeAsset(track.currentMesh);
            track.currentMesh = null;
        }
    }

    private cancelBounceAnim(arrowId: number, restoreStatic = false): void {
        for (let i = this.bounceAnims.length - 1; i >= 0; i--) {
            const anim = this.bounceAnims[i];
            if (anim.arrowId !== arrowId) continue;
            anim.node.destroy();
            this.releaseTrackMeshes(anim.track);
            this.bounceAnims.splice(i, 1);
        }
        if (restoreStatic) {
            const node = this.arrowNodes.get(arrowId);
            if (node) node.active = true;
        }
    }

    /**
     * Play original blocked-arrow bounce: slide forward along the path until hitting
     * the blocking arrow, flash red with an impact spark, then retract cleanly back.
     */
    animateBounce(
        arrowId: number,
        steps: readonly PathStep[] = [],
        finalDir?: DirName,
        useTail = false,
        blockerCellId?: string,
    ): void {
        const node = this.arrowNodes.get(arrowId);
        const arrow = this.board?.arrows[arrowId];
        if (!node || !this.board || !arrow) return;

        this.cancelBounceAnim(arrowId, false);
        node.active = false;

        const bounceRoot = new Node(`BounceAnim_${arrowId}`);
        bounceRoot.layer = CUBE_WORLD_LAYER;
        this.fxGroup.addChild(bounceRoot);

        const track = this.buildFlyRunnerTrack(
            bounceRoot,
            arrow,
            steps,
            finalDir ?? arrow.fireDir,
            useTail,
            true,
            undefined,
            blockerCellId,
            false,
        );
        if (!track) {
            bounceRoot.destroy();
            node.active = true;
            this.blockedFlashUntil.set(arrowId, this.animClock + 0.40);
            this.refreshAllArrowMaterials();
            return;
        }

        const impactDist = Math.max(0.28, track.exitArcS - 0.43 - track.bodyArcLen);
        const outDuration = Math.min(0.26, 0.10 + impactDist * 0.045);
        const backDuration = Math.min(0.30, 0.13 + impactDist * 0.05);
        this.blockedFlashUntil.set(arrowId, this.animClock + outDuration + backDuration + 0.16);
        this.refreshAllArrowMaterials();

        this.bounceAnims.push({
            arrowId,
            elapsed: 0,
            outDuration,
            backDuration,
            impactDist,
            impacted: false,
            node: bounceRoot,
            track,
        });
    }

    showPauseStop(arrowId: number): void {
        const head = this.board?.arrows[arrowId]?.cells[0];
        if (head) this.spawnSparkleBurst(this.cellSurfaceWorldPos(head, .55), new Color(245, 196, 91), 4);
    }

    animateSmash(arrowId: number): void {
        const node = this.arrowNodes.get(arrowId);
        if (!node) return;
        this.hintedArrowIds.delete(arrowId);
        if (this.focusHintArrowId === arrowId) this.focusHintArrowId = -1;
        this.arrowNodes.delete(arrowId);

        const arrow = this.board?.arrows[arrowId];
        if (arrow && arrow.cells.length > 0) {
            const p = this.cellSurfaceWorldPos(arrow.cells[0], RIBBON_SURFACE_OFFSET + 0.05);
            this.spawnSparkleBurst(p, new Color(255, 200, 70, 255), 8);
        }

        const mr = node.getComponent(MeshRenderer);
        if (mr) mr.setSharedMaterial(this.arrowHintMat, 0);
        this.smashAnims.push({
            arrowId,
            elapsed: 0,
            duration: 0.30,
            node,
            stars: [],
            meshes: [],
        });
    }

    private spawnSparkleBurst(origin: V3, color: Color, count: number, size = .14): void {
        const burstNode = new Node('SparkleBurst');
        burstNode.layer = CUBE_WORLD_LAYER;
        burstNode.setPosition(origin[0], origin[1], origin[2]);
        this.fxGroup.addChild(burstNode);

        const meshes: Mesh[] = [];
        const dots: Array<{ node: Node; vx: number; vy: number; vz: number }> = [];
        const mat = this.solidMaterial;
        const cTuple: V3 = [color.r / 255, color.g / 255, color.b / 255];

        const pos: number[] = [];
        const norm: number[] = [];
        const col: number[] = [];
        const ind: number[] = [];
        addBoxGeometry(pos, norm, col, ind, 0, 0, 0, size, size, size, cTuple);
        const sharedMesh = buildMesh(this.assets, pos, norm, col, ind, meshes);

        const outNormal = vNorm(origin);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const d = new Node(`Star_${i}`);
            d.layer = CUBE_WORLD_LAYER;
            burstNode.addChild(d);
            const mr = d.addComponent(MeshRenderer);
            mr.mesh = sharedMesh;
            mr.setSharedMaterial(mat, 0);
            const t1 = Math.abs(outNormal[1]) < 0.8
                ? vNorm(vCross([0, 1, 0], outNormal))
                : vNorm(vCross([1, 0, 0], outNormal));
            const t2 = vCross(outNormal, t1);
            const spd = 2.6 + (i % 3) * 0.7;
            dots.push({
                node: d,
                vx: outNormal[0] * 2.2 + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * spd,
                vy: outNormal[1] * 2.2 + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * spd,
                vz: outNormal[2] * 2.2 + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * spd,
            });
        }

        this.sparkleBursts.push({
            elapsed: 0,
            duration: 0.42,
            node: burstNode,
            dots,
            meshes,
        });
    }

    pickAtLocalPoint(localX: number, localY: number): { arrowId: number; cellIndex: number } | null {
        if (!this.board || this.segmentHits.size === 0) return null;
        const halfH = Math.max(1, this.viewHeight * 0.5);
        const halfW = Math.max(1, this.viewWidth * 0.5);
        const ndcX = localX / halfW;
        const ndcY = localY / halfH;

        const aspect = this.viewWidth / this.viewHeight;
        const dirCam = new Vec3(0, 0, -1);
        const originCam = new Vec3(ndcX * this.camera.orthoHeight * aspect, ndcY * this.camera.orthoHeight, 80);

        const invPivot = Quat.invert(new Quat(), this.pivot.rotation);
        const rayOrigin = Vec3.transformQuat(new Vec3(), originCam, invPivot);
        const rayDir = Vec3.transformQuat(new Vec3(), dirCam, invPivot).normalize();

        const nearestVoxelT = this.nearestBlockDepth(rayOrigin, rayDir);
        let bestDepth = Infinity;
        let bestOffset = Infinity;
        let bestArrowId = -1;
        let bestCellIndex = 0;
        this.segmentHits.forEach((hits, id) => {
            if (!this.arrowNodes.get(id)?.active) return;
            for (const hit of hits) {
                const n = hit.normal;
                const facing = rayDir.x * n[0] + rayDir.y * n[1] + rayDir.z * n[2];
                if (facing >= -1e-5) continue;
                const x = hit.center[0] - rayOrigin.x, y = hit.center[1] - rayOrigin.y, z = hit.center[2] - rayOrigin.z;
                const t = (x * n[0] + y * n[1] + z * n[2]) / facing;
                if (t <= 0 || t > nearestVoxelT + .015 || t > bestDepth + .001) continue;
                const dx = x - t * rayDir.x, dy = y - t * rayDir.y, dz = z - t * rayDir.z;
                const offset = dx * dx + dy * dy + dz * dz;
                if (offset > hit.radius * hit.radius || (Math.abs(t - bestDepth) < .001 && offset >= bestOffset)) continue;
                bestDepth = t;
                bestOffset = offset;
                bestArrowId = id;
                bestCellIndex = hit.cellIndex;
            }
        });
        return bestArrowId >= 0 ? { arrowId: bestArrowId, cellIndex: bestCellIndex } : null;
    }

    private nearestBlockDepth(rayOrigin: Vec3, rayDir: Vec3): number {
        const board = this.board;
        if (!board?.solidSpans) return Infinity;
        // Work in voxel-boundary coordinates. Intersecting the packed boxes gives
        // the same front surface as intersecting every occupied voxel of a recess.
        const origin = [rayOrigin.x + board.sizeX / 2, rayOrigin.y + board.sizeY / 2, rayOrigin.z + board.sizeZ / 2];
        const direction = [rayDir.x, rayDir.y, rayDir.z];
        let nearestVoxelT = Infinity;
        for (const span of board.solidSpans) {
            let near = 0, far = nearestVoxelT;
            for (let axis = 0; axis < 3; axis++) {
                const low = span[axis], high = span[axis + 3] + 1;
                if (Math.abs(direction[axis]) < 1e-7) {
                    if (origin[axis] < low || origin[axis] > high) { far = -1; break; }
                    continue;
                }
                const t0 = (low - origin[axis]) / direction[axis];
                const t1 = (high - origin[axis]) / direction[axis];
                near = Math.max(near, Math.min(t0, t1));
                far = Math.min(far, Math.max(t0, t1));
                if (far < near) break;
            }
            if (near <= far) nearestVoxelT = near;
        }
        return nearestVoxelT;
    }

    update(dt: number, allowInertia = true): void {
        if (this.disposed) return;
        const clampedDt = Math.min(0.05, Math.max(0, dt));
        this.animClock += clampedDt;
        if (this.hintedArrowIds.size > 0) this.updateHintBreath(clampedDt);
        if (this.flyAnims.length || this.bounceAnims.length || this.smashAnims.length || this.sparkleBursts.length) {
            this.needsRedraw = true;
        }

        // Expire any red blocked flash after its window ends
        let flashChanged = false;
        this.blockedFlashUntil.forEach((until, id) => {
            if (until <= this.animClock) {
                this.blockedFlashUntil.delete(id);
                flashChanged = true;
            }
        });
        if (flashChanged) {
            this.refreshAllArrowMaterials();
        }

        const hasMomentum = Math.abs(this.velYaw) > 0.002 || Math.abs(this.velPitch) > 0.002;
        const rotating = allowInertia && hasMomentum;
        if (rotating) this.rotateInView(this.velYaw * clampedDt, this.velPitch * clampedDt);
        if (hasMomentum) {
            const damp = Math.exp(-7.5 * clampedDt);
            this.velYaw *= damp;
            this.velPitch *= damp;
        }
        if (rotating || this.targetCameraDist !== this.cameraDist) {
            const distance = this.targetCameraDist - this.cameraDist;
            this.cameraDist = Math.abs(distance) < .001 ? this.targetCameraDist : this.cameraDist + distance * Math.min(1, clampedDt * 11);
            this.applyPivotRotation();
        }

        for (let i = this.bounceAnims.length - 1; i >= 0; i--) {
            const anim = this.bounceAnims[i];
            anim.elapsed += clampedDt;
            const totalDur = anim.outDuration + anim.backDuration;
            if (anim.elapsed < anim.outDuration) {
                const p = anim.elapsed / Math.max(1e-4, anim.outDuration);
                const easeIn = p * p * (1.2 - 0.2 * p);
                this.renderFlyTrackMesh(anim.track, anim.impactDist * easeIn, true);
            } else {
                if (!anim.impacted) {
                    anim.impacted = true;
                    anim.track.emphasis = 'blocked';
                    const impactS = Math.min(anim.track.totalArcLen, anim.track.bodyArcLen + anim.impactDist);
                    const hitSmp = this.sampleTrackAtS(anim.track.samples, impactS);
                    const tipPos = vAdd(hitSmp.p, hitSmp.tang, .43);
                    this.spawnSparkleBurst(tipPos, new Color(255, 103, 116, 255), 5, .08);
                }
                const backP = Math.min(1, (anim.elapsed - anim.outDuration) / Math.max(1e-4, anim.backDuration));
                const easeOut = 1 - Math.pow(1 - backP, 2.4);
                const dist = anim.impactDist * (1 - easeOut);
                this.renderFlyTrackMesh(anim.track, dist, true);
            }

            if (anim.elapsed >= totalDur) {
                anim.node.destroy();
                this.releaseTrackMeshes(anim.track);
                const node = this.arrowNodes.get(anim.arrowId);
                if (node) {
                    node.active = true;
                    node.setPosition(0, 0, 0);
                    node.setScale(1, 1, 1);
                }
                this.refreshAllArrowMaterials();
                this.bounceAnims.splice(i, 1);
            }
        }

        for (let i = this.flyAnims.length - 1; i >= 0; i--) {
            const anim = this.flyAnims[i];
            const speed = 13.5 + 17.5 * Math.min(1, anim.travelDist / 2.0);
            anim.travelDist += clampedDt * speed;

            let allFinished = true;
            for (const track of anim.tracks) {
                const distance = anim.travelDist - track.startDistance;
                const finishDist = Math.min(track.totalArcLen - 0.15, track.exitArcS + 2.8);
                if (distance < finishDist) {
                    allFinished = false;
                    if (distance < 0) continue;
                    track.node.active = true;
                    this.renderFlyTrackMesh(track, distance);
                } else {
                    track.node.active = false;
                }
            }

            if (allFinished) {
                anim.node.destroy();
                for (const track of anim.tracks) this.releaseTrackMeshes(track);
                this.flyAnims.splice(i, 1);
            }
        }

        for (let i = this.smashAnims.length - 1; i >= 0; i--) {
            const anim = this.smashAnims[i];
            anim.elapsed += clampedDt;
            const t = Math.min(1, anim.elapsed / anim.duration);
            const scale = t < 0.25 ? 1 + t * 0.35 : Math.max(0.01, 1.09 - (t - 0.25) * 1.45);
            anim.node.setScale(scale, scale, scale);
            if (t >= 1) {
                anim.node.destroy();
                this.releaseStaticSnakeMesh(anim.arrowId);
                this.smashAnims.splice(i, 1);
            }
        }

        for (let i = this.sparkleBursts.length - 1; i >= 0; i--) {
            const b = this.sparkleBursts[i];
            b.elapsed += clampedDt;
            const t = Math.min(1, b.elapsed / b.duration);
            const shrink = Math.max(0.01, 1 - t);
            for (const d of b.dots) {
                d.node.setPosition(d.vx * b.elapsed, d.vy * b.elapsed, d.vz * b.elapsed);
                d.node.setScale(shrink, shrink, shrink);
            }
            if (t >= 1) {
                b.node.destroy();
                for (const m of b.meshes) this.assets.releaseRuntimeAsset(m);
                this.sparkleBursts.splice(i, 1);
            }
        }
    }

    get isCollisionAnimating(): boolean {
        return this.bounceAnims.length > 0 || this.blockedFlashUntil.size > 0 || this.sparkleBursts.length > 0;
    }

    private updateFramingDistance(): void {
        if (!this.board) return;
        const aspect = this.viewWidth / Math.max(1, this.viewHeight);
        const radius = Math.hypot(this.board.sizeX, this.board.sizeY, this.board.sizeZ) * .5;
        const oldFit = this.baseFitDist;
        this.baseFitDist = Math.max(radius * .98, radius / aspect * .98);
        const zoom = oldFit ? this.targetCameraDist / oldFit : 1;
        const longestSide = Math.max(this.board.sizeX, this.board.sizeY, this.board.sizeZ);
        this.minDist = this.baseFitDist * Math.min(.72, 7 / longestSide);
        this.maxDist = this.baseFitDist * 1.6;
        this.targetCameraDist = Math.max(this.minDist, Math.min(this.maxDist, this.baseFitDist * zoom));
        this.cameraDist = this.targetCameraDist;
        this.camera.orthoHeight = this.cameraDist;
    }

    private setViewAngles(yaw: number, pitch: number): void {
        Quat.fromAxisAngle(this.boardRotation, Vec3.RIGHT, pitch);
        Quat.rotateY(this.boardRotation, this.boardRotation, yaw);
        this.applyPivotRotation();
    }

    private rotateInView(yaw: number, pitch: number): void {
        const angle = Math.hypot(pitch, yaw);
        if (!angle) return;
        // Apply the drag about the screen axes, including when the cube is upside down.
        this.dragAxis.set(pitch / angle, yaw / angle, 0);
        Quat.fromAxisAngle(this.rotationStep, this.dragAxis, angle);
        Quat.multiply(this.boardRotation, this.rotationStep, this.boardRotation);
        Quat.normalize(this.boardRotation, this.boardRotation);
    }

    private applyPivotRotation(entranceYaw = 0): void {
        this.needsRedraw = true;
        this.pivot.setRotation(entranceYaw ? Quat.rotateY(this.rotationStep, this.boardRotation, entranceYaw) : this.boardRotation);
        const q = this.pivot.rotation;
        this.shadowRotation.set(q.x, q.y, q.z, q.w);
        this.displayMaterial.setProperty('shadowRotation', this.shadowRotation);
        this.camera.orthoHeight = this.cameraDist;
    }

    private voxelOffsetCenter(vx: number, vy: number, vz: number): [number, number, number] {
        const b = this.board!;
        return [vx - (b.sizeX - 1) * 0.5, vy - (b.sizeY - 1) * 0.5, vz - (b.sizeZ - 1) * 0.5];
    }

    private cellSurfaceWorldPos(cellId: string, heightOffset = 0.56): [number, number, number] {
        const p = parseCellId(cellId);
        const c = this.voxelOffsetCenter(p.x, p.y, p.z);
        const n = FACE_NORMAL[p.face];
        return [
            c[0] + n[0] * heightOffset,
            c[1] + n[1] * heightOffset,
            c[2] + n[2] * heightOffset,
        ];
    }

    /** Continuous matte surfaces; only the outside silhouette is gently rounded. */
    private roundedCubeGeometry(board: CubeAwayBoard, positions: number[], normals: number[], colors: number[], indices: number[]): void {
        const half = [board.sizeX / 2, board.sizeY / 2, board.sizeZ / 2];
        const radius = CUBE_EDGE_RADIUS;
        const range = (h: number): number[] => {
            const values: number[] = [];
            for (let i = 0; i <= 8; i++) values.push(-h + radius * i / 8);
            for (let i = 0; i <= 8; i++) values.push(h - radius + radius * i / 8);
            return values;
        };
        for (const face of ['+x', '-x', '+y', '-y', '+z', '-z'] as FaceName[]) {
            const normal = FACE_NORMAL[face], frame = CUBE_FRAME[face];
            const axis = normal.findIndex(v => v !== 0), uAxis = frame.right.findIndex(v => v !== 0), vAxis = frame.up.findIndex(v => v !== 0);
            const us = range(half[uAxis]), vs = range(half[vAxis]);
            for (const v of vs) for (const u of us) {
                const point = normal.map((n, i) => n * half[axis] + frame.right[i] * u + frame.up[i] * v);
                const inner = point.map((n, i) => Math.max(-half[i] + radius, Math.min(half[i] - radius, n)));
                const n = vNorm(vSub(point as unknown as V3, inner as unknown as V3));
                const position = inner.map((p, i) => p + n[i] * radius);
                positions.push(...position); normals.push(...n); colors.push(...CUBE_SURFACE_COLOR, 1);
            }
            const base = positions.length / 3 - us.length * vs.length;
            for (let y = 0; y < vs.length - 1; y++) for (let x = 0; x < us.length - 1; x++) {
                const a = base + y * us.length + x, d = a + us.length;
                indices.push(a, a + 1, d + 1, a, d + 1, d);
            }
        }
    }

    private buildStaticCubeMesh(board: CubeAwayBoard, skinned: boolean): void {
        const positions: number[] = [];
        const normals: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        const turquoise = hexToRgbTuple(CUBE_AWAY_THEME.cornerlessBridge);

        const roundedBoard = board.voxels.size === board.sizeX * board.sizeY * board.sizeZ;
        if (roundedBoard) {
            this.roundedCubeGeometry(board, positions, normals, colors, indices);
        } else {
            // Exposed quads meet on exact half-cell coordinates, including the inside
            // walls of a recess. Buried voxels contribute no visible triangles.
            board.exposedCells.forEach((cellId) => {
                const p = parseCellId(cellId);
                const f = CUBE_FRAME[p.face];
                const n = FACE_NORMAL[p.face];
                const center = this.cellSurfaceWorldPos(cellId, 0.5);
                const u = f.right;
                const v = f.up;
                const hOut = 0.5;
                const pt = (sU: number, sV: number): [number, number, number] => [
                    center[0] + u[0] * sU + v[0] * sV,
                    center[1] + u[1] * sU + v[1] * sV,
                    center[2] + u[2] * sU + v[2] * sV,
                ];
                pushOrientedQuad(
                    positions, normals, colors, indices,
                    pt(-hOut, -hOut), pt(hOut, -hOut), pt(hOut, hOut), pt(-hOut, hOut),
                    n, CUBE_SURFACE_COLOR,
                );
            });

        }

        // Only the board can receive contact shadows, including the plain fallback.
        // The bridge and mechanic meshes appended below keep their own opaque ink.
        for (let i = 0; i < colors.length; i += 4) {
            if (skinned) colors[i] = colors[i + 1] = colors[i + 2] = 1;
            colors[i + 3] = 0;
        }

        // A bridge marks only a real traversable edge segment, never the whole cube rim.
        board.cornerlessEdges.forEach(key => {
            const [xyz, pair] = key.split(':');
            const [x, y, z] = xyz.split(',').map(Number);
            const faces = pair.split('|') as FaceName[];
            const center = this.voxelOffsetCenter(x, y, z);
            const n1 = FACE_NORMAL[faces[0]], n2 = FACE_NORMAL[faces[1]], axis = vNorm(vCross(n1, n2));
            const edge = vAdd(center, vAdd(n1, n2), .5);
            const strip = surfaceFold(edge, n1, n2, roundedBoard ? CUBE_EDGE_RADIUS : 0, .003);
            const first = strip[0], last = strip[strip.length - 1];
            strip.unshift({ p: vAdd(first.p, n2, -.09), n: n1 });
            strip.push({ p: vAdd(last.p, n1, -.09), n: n2 });
            for (let i = 0; i < strip.length; i++) {
                const { p, n } = strip[i];
                const base = positions.length / 3;
                positions.push(...vAdd(p, axis, -.47), ...vAdd(p, axis, .47));
                normals.push(...n, ...n);
                colors.push(...turquoise, 1, ...turquoise, 1);
                if (i > 0) indices.push(base - 2, base, base - 1, base - 1, base, base + 1);
            }
        });

        const geometry = { positions, normals, colors, indices };
        board.gimmicks.forEach(g => {
            const frame = CUBE_FRAME[g.face];
            const normal = FACE_NORMAL[g.face];
            const tile = this.cellSurfaceWorldPos(g.cellId, .502);
            const ink = vAdd(tile, normal, .003);
            const palette = { pause: CUBE_AWAY_THEME.pauseColor, changer: CUBE_AWAY_THEME.changerColor,
                split_changer: CUBE_AWAY_THEME.splitColor, reverse_changer: CUBE_AWAY_THEME.reverseColor };
            const size = g.type === 'split_changer' ? .90 : .82;
            addFlatGlyph(geometry, tile, frame.right, frame.up, normal, hexToRgbTuple(palette[g.type]), roundTile(size, size, .14));
            if (g.type === 'pause') {
                for (const side of [-1, 1]) {
                    addFlatGlyph(geometry, vAdd(ink, frame.right, side * .127), frame.right, frame.up, normal, TILE_IVORY, roundTile(.14, .48, .05));
                }
            } else if (g.type === 'reverse_changer') {
                const glyph = { positions: [], normals: [], colors: [], indices: [] };
                addFlatGlyph(glyph, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], TILE_IVORY, TILE_ARROW);
                const mount = new Node('ReverseTile');
                mount.layer = CUBE_WORLD_LAYER;
                this.staticGroup.addChild(mount);
                mount.setPosition(ink[0], ink[1], ink[2]);
                mount.setRotation(Quat.fromViewUp(new Quat(), new Vec3(...normal), new Vec3(...frame.up)));
                const indicator = new Node('ReverseDirection');
                indicator.layer = CUBE_WORLD_LAYER;
                mount.addChild(indicator);
                const renderer = indicator.addComponent(MeshRenderer);
                renderer.mesh = buildMesh(this.assets, glyph.positions, glyph.normals, glyph.colors, glyph.indices, this.meshes);
                renderer.setSharedMaterial(this.solidMaterial, 0);
                this.reverseIndicators.push({ cellId: g.cellId, node: indicator, face: g.face });
                this.refreshReverseGimmick(g.cellId, g.currentReverseDir ?? g.exitDir ?? 'right');
            } else if (g.type === 'split_changer') {
                const [first, second] = resolveSplitExits(g.exitDir ?? 'up', g.exitDir2);
                addSplitGlyph(geometry, ink, normal, frame[first], frame[second]);
            } else if (g.exitDir) {
                const up = frame[g.exitDir];
                addFlatGlyph(geometry, ink, vCross(up, normal), up, normal, TILE_IVORY, TILE_ARROW);
            }
        });

        const cubeMesh = buildMesh(this.assets, positions, normals, colors, indices, this.meshes);
        const baseNode = new Node('CubeBody');
        baseNode.layer = CUBE_WORLD_LAYER;
        this.staticGroup.addChild(baseNode);
        const mr = baseNode.addComponent(MeshRenderer);
        mr.mesh = cubeMesh;
        mr.setSharedMaterial(skinned ? this.boardMaterial : this.solidMaterial, 0);
    }

    /** Static and moving snakes share one sampled path and one illustration painter. */
    private buildArrowNode(arrow: ArrowRuntime): void {
        const track = this.buildFlyRunnerTrack(this.arrowsGroup, arrow, [], arrow.fireDir, false, true);
        if (!track) return;
        track.node.name = `Snake_${arrow.id}`;
        this.staticTracks.set(arrow.id, track);
        this.arrowNodes.set(arrow.id, track.node);

        // Use the same surface path as the painted ribbon, including bends and hollow jumps.
        // Preserve which half was tapped for double-headed snakes.
        const cells = arrow.cells.map(cell => this.cellSurfaceWorldPos(cell, RIBBON_SURFACE_OFFSET));
        const hits: ArrowSegmentHit[] = [];
        const steps = Math.ceil(track.bodyArcLen / .22);
        for (let i = 0; i <= steps; i++) {
            const sample = this.sampleTrackAtS(track.samples, track.bodyArcLen * i / steps);
            let cellIndex = 0, nearest = Infinity;
            for (let k = 0; k < cells.length; k++) {
                const delta = vSub(sample.p, cells[k]);
                const dist = vDot(delta, delta);
                if (dist < nearest) { cellIndex = k; nearest = dist; }
            }
            const head = i === steps || (i === 0 && arrow.isDouble);
            hits.push({ cellIndex, center: vAdd(sample.p, sample.n, .012), normal: sample.n, radius: head ? .51 : .36 });
        }
        this.segmentHits.set(arrow.id, hits);
    }

    private updateHintBreath(dt: number): void {
        this.needsRedraw = true;
        const period = 1.4;
        this.hintClock = (this.hintClock + dt) % period;
        const beat = .5 + .5 * Math.cos(this.hintClock / period * Math.PI * 2);
        this.hintPulse.set(.55 + .17 * beat, .28, 0, 0);
        this.hintOutlineMat.setProperty('hintPulse', this.hintPulse);
        this.focusPulse.set(.70 + .30 * beat, .30, 0, 0);
        this.focusOutlineMat.setProperty('hintPulse', this.focusPulse);
    }

    private releaseStaticSnakeMesh(arrowId: number): void {
        const track = this.staticTracks.get(arrowId);
        if (track) this.releaseTrackMeshes(track);
        this.staticTracks.delete(arrowId);
        this.segmentHits.delete(arrowId);
    }

    private clearSceneMeshes(): void {
        for (const anim of this.flyAnims) {
            anim.node.destroy();
            for (const track of anim.tracks) this.releaseTrackMeshes(track);
        }
        this.flyAnims.length = 0;
        for (const anim of this.bounceAnims) {
            anim.node.destroy();
            this.releaseTrackMeshes(anim.track);
        }
        this.bounceAnims.length = 0;
        this.smashAnims.length = 0;
        for (const b of this.sparkleBursts) {
            b.node.destroy();
            for (const m of b.meshes) this.assets.releaseRuntimeAsset(m);
        }
        this.sparkleBursts.length = 0;

        this.staticGroup.destroyAllChildren();
        this.arrowsGroup.destroyAllChildren();
        this.fxGroup.destroyAllChildren();
        this.staticTracks.forEach(track => this.releaseTrackMeshes(track));
        this.staticTracks.clear();
        this.arrowNodes.clear();
        this.reverseIndicators.length = 0;
        this.segmentHits.clear();

        for (const m of this.meshes) {
            this.assets.releaseRuntimeAsset(m);
        }
        this.meshes.length = 0;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearSceneMeshes();
        this.camera.targetTexture = null;
        this.root.destroy();
        this.projection.destroy();
        this.assets.releaseRuntimeAsset(this.frame);
        this.assets.releaseRuntimeAsset(this.target);
        this.assets.releaseRuntimeAsset(this.displayMaterial);
        this.assets.releaseRuntimeAsset(this.solidMaterial);
        this.assets.releaseRuntimeAsset(this.boardMaterial);
        this.assets.releaseRuntimeAsset(this.arrowNormalMat);
        this.assets.releaseRuntimeAsset(this.mutedSnakeMat);
        this.assets.releaseRuntimeAsset(this.arrowHintMat);
        this.assets.releaseRuntimeAsset(this.arrowBlockedMat);
        this.assets.releaseRuntimeAsset(this.hintOutlineMat);
        this.assets.releaseRuntimeAsset(this.focusOutlineMat);
    }
}
