import { Color, Label, Material, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec2 } from 'cc';
import type { RingPoint } from './RotateRingsTypes';
import type { RingVisualMesh } from './RotateRingsVisuals';
import { ORIGINAL_RING_CONFIG as SOURCE } from './RotateRingsOriginalConfig';
import { RING_ENCOURAGEMENTS, RING_THEME, type RingEncouragementKey } from './RotateRingsTheme';
import { RotateRingsMeshSprite } from './RotateRingsMeshSprite';
import { FontBinding, setLabelBold } from '../../../services/font/FontBinding';

interface CurveKey {
    time: number; value: number; inSlope: number; outSlope: number;
    weightedMode?: number; inWeight?: number; outWeight?: number;
}
/** Unity AnimationCurve：普通切线用 Hermite，加权切线用时间反解的三次 Bézier。 */
export function ringCurve(keys: readonly CurveKey[], time: number): number {
    if (time <= keys[0].time) return keys[0].value;
    for (let i = 1; i < keys.length; i++) if (time <= keys[i].time) {
        const a = keys[i - 1], b = keys[i], span = b.time - a.time, t = (time - a.time) / span;
        if (time === b.time) return b.value;
        if (!Number.isFinite(a.outSlope) || !Number.isFinite(b.inSlope)) return a.value;
        if (((a.weightedMode || 0) & 2) || ((b.weightedMode || 0) & 1)) {
            const outWeight = ((a.weightedMode || 0) & 2) ? a.outWeight ?? 1 / 3 : 1 / 3;
            const inWeight = ((b.weightedMode || 0) & 1) ? b.inWeight ?? 1 / 3 : 1 / 3;
            let low = 0, high = 1, u = t;
            for (let step = 0; step < 28; step++) {
                const v = 1 - u, x = 3 * v * v * u * outWeight + 3 * v * u * u * (1 - inWeight) + u * u * u;
                if (x < t) low = u; else high = u;
                u = (low + high) / 2;
            }
            const v = 1 - u;
            return v * v * v * a.value + 3 * v * v * u * (a.value + outWeight * span * a.outSlope)
                + 3 * v * u * u * (b.value - inWeight * span * b.inSlope) + u * u * u * b.value;
        }
        const t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * a.value + (t3 - 2 * t2 + t) * a.outSlope * span
            + (-2 * t3 + 3 * t2) * b.value + (t3 - t2) * b.inSlope * span;
    }
    return keys[keys.length - 1].value;
}
export const RING_MOTION = SOURCE.RingLevelConfig;
interface Effect { node: Node; time: number; duration: number; update: (age: number) => void; }
interface RingReleasePose extends RingPoint { angle: number; scale: number; }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** 原网格三角面按面积采样，销和卡扣也参与发射，禁止用整圈随机点替代缺口与部件轮廓。 */
export function createRingMeshSampler(mesh: RingVisualMesh): (choose: number, u: number, v: number) => RingPoint {
    const triangles: { a: number; b: number; c: number; end: number }[] = [];
    let area = 0; const p = mesh.vertices;
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const a = mesh.indices[i] * 4, b = mesh.indices[i + 1] * 4, c = mesh.indices[i + 2] * 4;
        const size = Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2;
        if (size <= 0) continue;
        area += size;
        triangles.push({ a, b, c, end: area });
    }
    if (!triangles.length) throw new Error('RotateRings release mesh has no triangle area');
    // 一次消除只构建一次面积索引，避免 50 个粒子反复分配整份三角面列表。
    return (choose, u, v) => {
        let low = 0, high = triangles.length - 1;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (choose * area < triangles[middle].end) high = middle; else low = middle + 1;
        }
        const triangle = triangles[low], root = Math.sqrt(u), a = 1 - root, b = root * (1 - v), c = root * v;
        return { x: p[triangle.a] * a + p[triangle.b] * b + p[triangle.c] * c,
            y: p[triangle.a + 1] * a + p[triangle.b + 1] * b + p[triangle.c + 1] * c };
    };
}
/** 瓷环碎裂（瓷器而非塑料）：部件网格按 Voronoi 裂纹切成大小不一的尖角瓷片，每片衬一圈白色瓷胎断面；
 * 裂开瞬间一记短促白闪，瓷片迸开后受重力翻滚下坠，翻到迎光面时闪一下釉光；白色瓷粉向外喷散、慢慢落下化开，几粒小闪星点缀。
 * 迸开速度为棋盘单位（随部件大小），上抛与重力为屏幕像素（不同棋盘比例下坠落快慢一致）；时间为秒。 */
const RELEASE_FX = Object.freeze({
    duration: 1.3, sparkles: 3,
    /** count：随部件半径的片数；minGap：裂心最小间距（棋盘单位，小于环身宽度才会斜切出尖角）；
     * edge：白色断面相对瓷片放大的比例；drag：迸开速度的指数衰减率；lift/gravity：轻抛后加速下坠（像素）；
     * tumble：翻滚角速度（圈/秒），横向轻压缩并在迎光时 glint 提亮。 */
    shard: { count: [10, 24], perRadius: 6.5, minGap: .26, edge: 1.07, crack: .03, nudge: .035, flash: .35,
        speed: [3, 6.5], jitter: 1.4, drag: 5, lift: [240, 480], gravity: 2200, spin: [90, 420], tumble: [.7, 1.6], squash: .55, glint: .5,
        life: [.95, 1.25], fade: .65, shrink: .85 },
    flash: { scale: 1.3, life: .1, alpha: .6 },
    /** 瓷粉：环色调淡的细粉（纯白在奶油底上看不出），喷散后慢落、变大化开。 */
    dust: { count: 12, size: [.16, .32], whiten: .45, speed: [1.5, 4], drag: 4, gravity: 260, grow: 1.7, life: [.4, .7], alpha: .55 },
    sparkle: { size: [.4, .65], speed: [3, 5], life: [.18, .28], peak: .2 },
});
const between = (range: readonly number[], random: number) => range[0] + (range[1] - range[0]) * random;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
interface ReleaseParticle { sprite: Sprite; node: Node; x: number; y: number; vx: number; vy: number; life: number; spin: number; angle: number;
    color: Color; size: number; dust: boolean; }
interface ReleaseShard { sprites: RotateRingsMeshSprite[]; node: Node; x: number; y: number; vx: number; vy: number; life: number; spin: number; angle: number;
    lift: number; tumble: number; phase: number; }
/** 迸开位移：速度按 drag 指数衰减后的积分。 */
const burst = (velocity: number, drag: number, t: number) => velocity / drag * (1 - Math.exp(-drag * t));

type FractureVertex = number[]; // x, y, u, v, tx, ty, hand, length, style
/** 多边形按半平面 n·p <= d 裁剪；交点处全部顶点属性线性插值（同一三角面内路径信息一致）。 */
function clipFracture(polygon: FractureVertex[], nx: number, ny: number, d: number): FractureVertex[] {
    const out: FractureVertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push(a.map((value, k) => value + (b[k] - value) * t)); }
    }
    return out;
}

/** 按部件真实网格做 Voronoi 碎裂：在可见环带内（横向 v 0.3~0.7）随机取间距不小于 minGap 的裂心——间距小于环身宽度，
 * 环身横向也会被切开，裂缝斜着穿过管身形成尖角瓷片；每个原三角面按各裂心的平分线半平面裁剪，
 * 断面是干净的直线裂口，顶点数与原网格同级。各片顶点平移到自身可见部分的质心以便独立翻转。 */
export function splitRingMesh(mesh: RingVisualMesh, count: number, minGap = RELEASE_FX.shard.minGap): { mesh: RingVisualMesh; x: number; y: number }[] {
    const p = mesh.vertices, tangents = mesh.tangents!, paths = mesh.paths!;
    const vertex = (i: number): FractureVertex => [p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3],
        tangents[i * 3], tangents[i * 3 + 1], tangents[i * 3 + 2], paths[i * 2], paths[i * 2 + 1]];
    const triangles: { corners: FractureVertex[]; area: number }[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const corners = [vertex(mesh.indices[i]), vertex(mesh.indices[i + 1]), vertex(mesh.indices[i + 2])], [a, b, c] = corners;
        const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
        if (area > 0) triangles.push({ corners, area });
    }
    if (!triangles.length) throw new Error('RotateRings release mesh has no triangle area');
    // 裂心只取在可见环带：按面积选三角面、均匀取重心坐标，横向 v 落在带内才收下。
    const total = triangles.reduce((sum, t) => sum + t.area, 0), seeds: RingPoint[] = [];
    for (let attempt = 0; attempt < count * 40 && seeds.length < count; attempt++) {
        let pick = Math.random() * total, triangle = triangles[0];
        for (const t of triangles) { pick -= t.area; if (pick <= 0) { triangle = t; break; } }
        const r = Math.sqrt(Math.random()), w = Math.random(), weights = [1 - r, r * (1 - w), r * w];
        const point = [0, 1, 3].map(k => triangle.corners.reduce((sum, corner, i) => sum + corner[k] * weights[i], 0));
        if (point[2] < .3 || point[2] > .7) continue;
        if (seeds.every(seed => Math.hypot(seed.x - point[0], seed.y - point[1]) >= minGap)) seeds.push({ x: point[0], y: point[1] });
    }
    if (!seeds.length) seeds.push({ x: triangles[0].corners[0][0], y: triangles[0].corners[0][1] });
    const pieces: { mesh: RingVisualMesh; x: number; y: number }[] = [];
    seeds.forEach((seed, index) => {
        const polygons: FractureVertex[][] = [];
        let weight = 0, cx = 0, cy = 0;
        for (const triangle of triangles) {
            let polygon = triangle.corners;
            for (let j = 0; j < seeds.length && polygon.length >= 3; j++) {
                if (j === index) continue;
                const other = seeds[j], nx = other.x - seed.x, ny = other.y - seed.y;
                polygon = clipFracture(polygon, nx, ny, (nx * (seed.x + other.x) + ny * (seed.y + other.y)) / 2);
            }
            if (polygon.length < 3) continue;
            let area = 0, px = 0, py = 0, v = 0;
            for (let k = 1; k + 1 < polygon.length; k++) {
                const a = polygon[0], b = polygon[k], c = polygon[k + 1];
                const part = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
                area += part; px += (a[0] + b[0] + c[0]) / 3 * part; py += (a[1] + b[1] + c[1]) / 3 * part; v += (a[3] + b[3] + c[3]) / 3 * part;
            }
            if (area <= 1e-9) continue;
            polygons.push(polygon);
            // 质心只按可见环身计，透明边距不影响瓷片的翻转中心。
            const visible = v / area > .25 && v / area < .75 ? area : area * 1e-4;
            weight += visible; cx += px / area * visible; cy += py / area * visible;
        }
        if (!polygons.length || weight <= 0) return;
        const x = cx / weight, y = cy / weight;
        const part: RingVisualMesh = { vertices: [], indices: [], color: mesh.color, tangents: [], paths: [] };
        for (const polygon of polygons) {
            const base = part.vertices.length / 4;
            for (const corner of polygon) {
                part.vertices.push(corner[0] - x, corner[1] - y, corner[2], corner[3]);
                part.tangents!.push(corner[4], corner[5], corner[6]); part.paths!.push(corner[7], corner[8]);
            }
            for (let k = 1; k + 1 < polygon.length; k++) part.indices.push(base, base + k, base + k + 1);
        }
        pieces.push({ mesh: part, x, y });
    });
    return pieces;
}

/** 所有粒子与飘字由游戏 update 推进，暂停冻结，重开/退出直接释放，不留下补间或定时器。 */
export class RotateRingsEffects {
    private effects: Effect[] = [];
    private readonly particles: Node;
    private readonly encouragement: Node;
    constructor(private readonly parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>,
        private readonly ringMaterial?: Material) {
        // 渲染顺序由层级固定，消除回调晚于触摸结算时也不会把碎片画在连击文字上。
        this.particles = this.makeLayer('OriginalParticles');
        this.encouragement = this.makeLayer('OriginalEncouragement');
    }
    get active(): boolean { return this.effects.length > 0; }
    private makeLayer(name: string, parent = this.parent): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent); node.addComponent(UITransform);
        return node;
    }
    sprite(name: string, frame: string, x: number, y: number, width: number, parent = this.particles): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent); node.setPosition(x, y);
        const source = this.frames[frame], size = source.originalSize;
        node.addComponent(UITransform).setContentSize(width, width * size.height / size.width);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = source;
        return node;
    }
    release(mesh: RingVisualMesh, pose: () => RingReleasePose): void {
        const fx = RELEASE_FX, root = new Node('RingRelease'); root.layer = this.parent.layer; root.setParent(this.particles); root.addComponent(UITransform);
        const color = Color.fromHEX(new Color(), mesh.color), white = Color.WHITE, powder = color.clone().lerp(white, fx.dust.whiten);
        let radius = 0;
        for (let i = 0; i < mesh.vertices.length; i += 4) radius = Math.max(radius, Math.hypot(mesh.vertices[i], mesh.vertices[i + 1]));
        const flash = this.sprite('ReleaseFlash', 'fx_glow', 0, 0, radius * fx.flash.scale, root).getComponent(Sprite)!;
        // 重力按屏幕向下施加，再换算到随部件旋转的局部坐标。
        const down = (angle: number) => ({ x: -Math.sin(angle * Math.PI / 180), y: -Math.cos(angle * Math.PI / 180) });
        const sample = createRingMeshSampler(mesh), particles: ReleaseParticle[] = [];
        // 瓷粉先建在瓷片下层：白色细粉从裂处喷散后慢慢下落化开。
        for (let i = 0; i < fx.dust.count; i++) {
            const point = sample(Math.random(), Math.random(), Math.random()), angle = Math.random() * Math.PI * 2, speed = between(fx.dust.speed, Math.random());
            const size = between(fx.dust.size, Math.random()), node = this.sprite('ReleaseDust', 'fx_glow', point.x, point.y, size, root);
            particles.push({ sprite: node.getComponent(Sprite)!, node, x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: between(fx.dust.life, Math.random()), spin: 0, angle: 0, color: powder, size, dust: true });
        }
        // 部件本体切成瓷片，原位接替消失的部件；每片先画白色瓷胎断面，再画同材质同釉色的瓷片本身。
        const shards: ReleaseShard[] = [];
        if (this.ringMaterial && mesh.paths && mesh.tangents) {
            const count = Math.round(Math.max(fx.shard.count[0], Math.min(fx.shard.count[1], radius * fx.shard.perRadius)));
            for (const piece of splitRingMesh(mesh, count)) {
                const node = new Node('ReleaseShard'); node.layer = root.layer; node.setParent(root); node.setPosition(piece.x, piece.y);
                node.addComponent(UITransform).setContentSize(1, 1);
                const sprites = [true, false].map(edge => {
                    const layer = new Node(edge ? 'ShardEdge' : 'ShardGlaze'); layer.layer = root.layer; layer.setParent(node);
                    layer.addComponent(UITransform).setContentSize(1, 1); if (edge) layer.setScale(fx.shard.edge, fx.shard.edge, 1);
                    const sprite = layer.addComponent(RotateRingsMeshSprite);
                    sprite.configure(piece.mesh, this.frames['ring-texture'], this.ringMaterial!); sprite.color = edge ? white : color;
                    return sprite;
                });
                const length = Math.hypot(piece.x, piece.y), out = length > 1e-4 ? { x: piece.x / length, y: piece.y / length }
                    : { x: Math.cos(Math.random() * Math.PI * 2), y: Math.sin(Math.random() * Math.PI * 2) };
                const speed = between(fx.shard.speed, Math.random()), jitter = (Math.random() - .5) * 2 * fx.shard.jitter;
                shards.push({ sprites, node, x: piece.x, y: piece.y, vx: out.x * speed - out.y * jitter, vy: out.y * speed + out.x * jitter,
                    life: between(fx.shard.life, Math.random()), spin: (Math.random() < .5 ? -1 : 1) * between(fx.shard.spin, Math.random()), angle: 0,
                    lift: between(fx.shard.lift, Math.random()), tumble: between(fx.shard.tumble, Math.random()) * 360, phase: Math.random() * 360 });
            }
        }
        const gold = Color.fromHEX(new Color(), RING_THEME.gold);
        for (let i = 0; i < fx.sparkles; i++) {
            const point = sample(Math.random(), Math.random(), Math.random()), angle = Math.random() * Math.PI * 2, speed = between(fx.sparkle.speed, Math.random());
            const size = between(fx.sparkle.size, Math.random()), node = this.sprite('ReleaseSparkle', 'fx_sparkle', point.x, point.y, size, root);
            particles.push({ sprite: node.getComponent(Sprite)!, node, x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: between(fx.sparkle.life, Math.random()), spin: 90, angle: Math.random() * 360, color: i % 2 ? gold : white, size, dust: false });
        }
        const tint = new Color(), glaze = new Color(), edge = new Color();
        let previous = 0;
        const update = (age: number): void => {
            const placement = pose(), dt = age - previous, gravity = down(placement.angle), boardScale = Math.max(1e-4, placement.scale); previous = age;
            root.setPosition(placement.x, placement.y); root.setScale(placement.scale, placement.scale, 1); root.angle = placement.angle;
            const f = clamp(age / fx.flash.life);
            flash.node.setScale(.7 + .5 * f, .7 + .5 * f, 1);
            tint.set(255, 255, 255, Math.round(255 * fx.flash.alpha * (1 - f) * (1 - f))); flash.color = tint;
            // 瓷片：裂开瞬间原位一闪并微微撑开；随后迸开、轻轻上抛，再翻滚着加速下坠，后段淡出。
            shards.forEach(shard => {
                const t = clamp(age / shard.life);
                if (t >= 1) { shard.node.active = false; return; }
                const crack = clamp(age / fx.shard.crack);
                let glint = 0;
                if (age < fx.shard.crack) {
                    const length = Math.max(1e-4, Math.hypot(shard.x, shard.y)), nudge = fx.shard.nudge * crack;
                    shard.node.setPosition(shard.x + shard.x / length * nudge, shard.y + shard.y / length * nudge);
                    shard.node.setScale(1, 1, 1);
                } else {
                    const time = age - fx.shard.crack, fall = (fx.shard.gravity * time * time / 2 - shard.lift * time) / boardScale;
                    shard.node.setPosition(shard.x + burst(shard.vx, fx.shard.drag, time) + gravity.x * fall,
                        shard.y + burst(shard.vy, fx.shard.drag, time) + gravity.y * fall);
                    shard.node.angle = shard.angle + shard.spin * time;
                    // 翻滚：横向轻压缩表示侧过去，翻回正面迎光时釉面闪一下。
                    const turn = Math.cos((shard.phase + shard.tumble * time) * Math.PI / 180), size = 1 - (1 - fx.shard.shrink) * clamp((t - .3) / .7);
                    shard.node.setScale(size * (fx.shard.squash + (1 - fx.shard.squash) * Math.abs(turn)), size, 1);
                    glint = fx.shard.glint * Math.pow(Math.max(0, turn), 12);
                }
                const light = Math.max(fx.shard.flash * (1 - Math.abs(crack * 2 - 1)), glint);
                const alpha = Math.round(255 * (1 - clamp((t - fx.shard.fade) / (1 - fx.shard.fade))));
                glaze.set(lerp(color.r, 255, light), lerp(color.g, 255, light), lerp(color.b, 255, light), alpha);
                edge.set(255, 255, 255, alpha);
                shard.sprites[0].color = edge; shard.sprites[1].color = glaze;
            });
            particles.forEach(p => {
                const t = clamp(age / p.life);
                if (t >= 1) { p.node.active = false; return; }
                if (p.dust) {
                    const fall = fx.dust.gravity * age * age / 2 / boardScale;
                    p.node.setPosition(p.x + burst(p.vx, fx.dust.drag, age) + gravity.x * fall, p.y + burst(p.vy, fx.dust.drag, age) + gravity.y * fall);
                    const grow = 1 + (fx.dust.grow - 1) * Math.sqrt(t); p.node.setScale(grow, grow, 1);
                    tint.set(p.color.r, p.color.g, p.color.b, Math.round(255 * fx.dust.alpha * (t < .1 ? t / .1 : 1 - (t - .1) / .9)));
                } else {
                    p.vx *= Math.max(0, 1 - 3 * dt); p.vy *= Math.max(0, 1 - 3 * dt);
                    p.x += p.vx * dt; p.y += p.vy * dt; p.node.setPosition(p.x, p.y);
                    p.angle += p.spin * dt; p.node.angle = p.angle;
                    const scale = t < fx.sparkle.peak ? 1.1 * t / fx.sparkle.peak : 1.1 * (1 - (t - fx.sparkle.peak) / (1 - fx.sparkle.peak));
                    p.node.setScale(scale, scale, 1);
                    tint.set(p.color.r, p.color.g, p.color.b, 255);
                }
                p.sprite.color = tint;
            });
        };
        update(0);
        this.effects.push({ node: root, time: 0, duration: fx.duration, update });
    }
    combo(evaluation: RingEncouragementKey, point: RingPoint, bounds: { left: number; right: number; top: number; bottom: number }): void {
        const feedback = RING_ENCOURAGEMENTS.find(item => item.key === evaluation)!;
        const cfg = SOURCE.comboAnimation;
        const peakX = Math.max(1, ...cfg.scaleX.map(key => key.value)) + .05;
        const peakY = Math.max(1, ...cfg.scaleY.map(key => key.value)) + .05;
        const fontSize = 68, width = Math.min((bounds.right - bounds.left - 32) / peakX,
            fontSize * (feedback.text.length * .72 + .8)), height = 104;
        const node = new Node('OriginalCombo-' + evaluation); node.layer = this.encouragement.layer; node.setParent(this.encouragement);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label), color = new Color();
        Color.fromHEX(color, feedback.color);
        label.string = feedback.text; label.fontFamily = 'Arial';
        label.font = null; label.useSystemFont = true;
        (node.getComponent(FontBinding) ?? node.addComponent(FontBinding)).systemFontOnly = true;
        label.fontSize = fontSize; label.lineHeight = label.fontSize * 1.2;
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableWrapText = false; label.overflow = Label.Overflow.SHRINK; label.color = color; setLabelBold(label, true);
        label.enableOutline = true; label.outlineColor = new Color(255, 255, 255, 255); label.outlineWidth = 5;
        const shadow = Color.fromHEX(new Color(), RING_THEME.shadow); shadow.a = 150;
        label.enableShadow = true; label.shadowColor = shadow; label.shadowOffset = new Vec2(0, -3);
        const opacity = node.addComponent(UIOpacity);
        node.setPosition(Math.max(bounds.left + width * peakX / 2 + 8, Math.min(bounds.right - width * peakX / 2 - 8, point.x)),
            Math.max(bounds.bottom + height * peakY / 2 + 8, Math.min(bounds.top - height * peakY / 2 - 8, point.y)));
        const update = (age: number) => {
            node.setScale(ringCurve(cfg.scaleX, age), ringCurve(cfg.scaleY, age), 1);
            opacity.opacity = Math.round(255 * clamp(ringCurve(cfg.opacity, age)));
        };
        update(0); this.effects.push({ node, time: 0, duration: cfg.duration, update });
    }
    bomb(point: RingPoint): void {
        const node = this.sprite('OriginalExplosion', 'explosion_0', point.x, point.y, 140), sprite = node.getComponent(Sprite)!;
        const names = Object.keys(this.frames).filter(k => /^explosion_\d+$/.test(k)).sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
        const opacity = node.addComponent(UIOpacity);
        this.effects.push({ node, time: 0, duration: .9, update: age => {
            sprite.spriteFrame = this.frames[names[Math.min(names.length - 1, Math.floor(age / .9 * names.length))]];
            opacity.opacity = age < .65 ? 255 : Math.max(0, (1 - age / .9) * 255);
        } });
    }
    update(delta: number): void {
        // 推进中新增的效果先进入新列表，下一帧开始推进。
        const current = this.effects; this.effects = [];
        const kept = current.filter(effect => {
            effect.time += delta;
            if (!effect.node.isValid) return false;
            // 结束帧先按终点时间推进一次，保证终点状态不会因帧间隔过大被跳过。
            if (effect.time >= effect.duration) { effect.update(effect.duration); this.destroy(effect.node); return false; }
            if (effect.time >= 0) effect.update(effect.time); return true;
        });
        this.effects = kept.concat(this.effects);
    }
    dispose(): void {
        this.effects.forEach(e => this.destroy(e.node)); this.effects = [];
        this.destroy(this.particles); this.destroy(this.encouragement);
    }
    private destroy(node: Node): void { if (node.isValid) { node.removeFromParent(); node.destroy(); } }
}
