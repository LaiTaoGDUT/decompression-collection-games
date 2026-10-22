import { _decorator, PolygonCollider2D } from 'cc';

const { ccclass } = _decorator;
const PTM = 32;
interface Point { x: number; y: number; }
interface Transform { p: Point; q: { c: number; s: number }; }
interface NativeVector extends Point { Copy(point: Point): void; }
interface Edge {
    m_radius: number; m_vertex0: NativeVector; m_vertex1: NativeVector; m_vertex2: NativeVector; m_vertex3: NativeVector;
    m_hasVertex0: boolean; m_hasVertex3: boolean;
}
interface Segment { a: Point; b: Point; before?: Point; after?: Point; deviation?: number; }
const pointKey = (p: Point): string => `${Math.round(p.x * PTM * 1e4)}:${Math.round(p.y * PTM * 1e4)}`;

/** 带宽度的连续边链，交给 Box2D 的 chain contact 处理相邻边的法线。
 * 质量积分沿用原复合线段/圆头的积分，替换接触表示不会改变质量、质心和惯量。
 * 只实现当前固定的 3.8.8 Box2D JS shape 协议，不修改引擎或其它游戏的 collider。
 */
class StrokeShape {
    readonly m_type = 3; // Box2D e_chainShape
    readonly m_vertices: Point[];
    readonly m_count: number;
    private readonly edges: Segment[];
    private area = 0;
    private weightedX = 0;
    private weightedY = 0;
    private inertia = 0;

    constructor(points: readonly Point[], readonly m_radius: number, copy?: StrokeShape) {
        // Shape.Clone 只复制不可变几何与积分结果，不能再次运行覆盖证明和几何构建。
        if (copy) {
            this.m_vertices = copy.m_vertices; this.m_count = copy.m_count; this.edges = copy.edges;
            this.area = copy.area; this.weightedX = copy.weightedX; this.weightedY = copy.weightedY; this.inertia = copy.inertia;
            return;
        }
        this.m_vertices = points.map(p => ({ x: p.x, y: p.y })); this.m_count = points.length;
        const edges: Segment[] = [];
        const seenEdges = new Set<string>(), seenPoints = new Set<string>();
        const closed = points.length > 2 && pointKey(points[0]) === pointKey(points[points.length - 1]);
        for (let i = 1; i < points.length; i++) {
            const a = this.m_vertices[i - 1], b = this.m_vertices[i], ak = pointKey(a), bk = pointKey(b);
            const key = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length < .1 / PTM || seenEdges.has(key)) continue;
            seenEdges.add(key);
            edges.push({ a, b, before: i > 1 ? this.m_vertices[i - 2] : closed ? this.m_vertices[points.length - 2] : undefined,
                after: i < points.length - 1 ? this.m_vertices[i + 1] : closed ? this.m_vertices[1] : undefined });
            const area = length * 2 * m_radius, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            this.area += area; this.weightedX += area * x; this.weightedY += area * y;
            this.inertia += area * (x * x + y * y + (length * length + 4 * m_radius * m_radius) / 12);
        }
        for (const p of this.m_vertices) {
            const key = pointKey(p); if (seenPoints.has(key)) continue; seenPoints.add(key);
            const area = Math.PI * m_radius * m_radius;
            this.area += area; this.weightedX += area * p.x; this.weightedY += area * p.y;
            this.inertia += area * (p.x * p.x + p.y * p.y + m_radius * m_radius / 2);
        }
        const resolved = compactResolvedEdges(edges);
        // chain fixture 和 child edge 必须使用相同半径，接触流形/CCD/求解器才能一致。
        this.m_radius += resolved.reduce((maximum, edge) => Math.max(maximum, edge.deviation ?? 0), 0);
        this.edges = compactCoveredEdges(resolved, this.m_radius);
    }
    Clone(): StrokeShape { return new StrokeShape(this.m_vertices, this.m_radius, this); }
    GetType(): number { return this.m_type; }
    GetChildCount(): number { return this.edges.length; }
    GetChildEdge(edge: Edge, index: number): void {
        const part = this.edges[index]; edge.m_radius = this.m_radius;
        edge.m_vertex1.Copy(part.a); edge.m_vertex2.Copy(part.b);
        edge.m_hasVertex0 = !!part.before; edge.m_hasVertex3 = !!part.after;
        edge.m_vertex0.Copy(part.before ?? part.a); edge.m_vertex3.Copy(part.after ?? part.b);
    }
    SetupDistanceProxy(proxy: { m_vertices: NativeVector[]; m_buffer: NativeVector[]; m_count: number; m_radius: number }, index: number): void {
        const part = this.edges[index]; proxy.m_vertices = proxy.m_buffer;
        proxy.m_vertices[0].Copy(part.a); proxy.m_vertices[1].Copy(part.b);
        proxy.m_count = 2; proxy.m_radius = this.m_radius;
    }
    ComputeAABB(bounds: { lowerBound: Point; upperBound: Point }, transform: Transform, index: number): void {
        const { a, b } = this.edges[index], { p, q } = transform;
        const ax = p.x + q.c * a.x - q.s * a.y, ay = p.y + q.s * a.x + q.c * a.y;
        const bx = p.x + q.c * b.x - q.s * b.y, by = p.y + q.s * b.x + q.c * b.y;
        bounds.lowerBound.x = Math.min(ax, bx) - this.m_radius; bounds.lowerBound.y = Math.min(ay, by) - this.m_radius;
        bounds.upperBound.x = Math.max(ax, bx) + this.m_radius; bounds.upperBound.y = Math.max(ay, by) + this.m_radius;
    }
    ComputeMass(data: { mass: number; center: Point; I: number }, density: number): void {
        data.mass = density * this.area; data.I = density * this.inertia;
        data.center.x = this.weightedX / this.area; data.center.y = this.weightedY / this.area;
    }
    private localPoint(transform: Transform, point: Point): Point {
        const x = point.x - transform.p.x, y = point.y - transform.p.y, q = transform.q;
        return { x: q.c * x + q.s * y, y: -q.s * x + q.c * y };
    }
    private nearest(part: Segment, p: Point): Point {
        const x = part.b.x - part.a.x, y = part.b.y - part.a.y;
        const t = Math.max(0, Math.min(1, ((p.x - part.a.x) * x + (p.y - part.a.y) * y) / (x * x + y * y)));
        return { x: part.a.x + x * t, y: part.a.y + y * t };
    }
    TestPoint(transform: Transform, point: Point): boolean {
        const p = this.localPoint(transform, point), radiusSquared = this.m_radius * this.m_radius;
        return this.edges.some(part => {
            const n = this.nearest(part, p); return (p.x - n.x) ** 2 + (p.y - n.y) ** 2 <= radiusSquared;
        });
    }
    ComputeDistance(transform: Transform, point: Point, normal: Point, index: number): number {
        const p = this.localPoint(transform, point), n = this.nearest(this.edges[index], p);
        const x = p.x - n.x, y = p.y - n.y, length = Math.hypot(x, y), q = transform.q;
        normal.x = length ? (q.c * x - q.s * y) / length : 0;
        normal.y = length ? (q.s * x + q.c * y) / length : 0;
        return length - this.m_radius;
    }
    RayCast(output: { normal: Point; fraction: number }, input: { p1: Point; p2: Point; maxFraction: number }, transform: Transform, index: number): boolean {
        const part = this.edges[index], from = this.localPoint(transform, input.p1), to = this.localPoint(transform, input.p2);
        const length = Math.hypot(part.b.x - part.a.x, part.b.y - part.a.y);
        const ux = (part.b.x - part.a.x) / length, uy = (part.b.y - part.a.y) / length;
        const x = (from.x - part.a.x) * ux + (from.y - part.a.y) * uy;
        const y = -(from.x - part.a.x) * uy + (from.y - part.a.y) * ux;
        const dx = (to.x - from.x) * ux + (to.y - from.y) * uy;
        const dy = -(to.x - from.x) * uy + (to.y - from.y) * ux;
        const radius = this.m_radius, nearestX = Math.max(0, Math.min(length, x));
        if ((x - nearestX) ** 2 + y * y <= radius * radius) return false;
        let fraction = Infinity, nx = 0, ny = 0;
        for (const side of [-1, 1]) if (dy !== 0) {
            const t = (side * radius - y) / dy, hitX = x + dx * t;
            if (t >= 0 && t <= input.maxFraction && t < fraction && hitX >= 0 && hitX <= length) {
                fraction = t; nx = 0; ny = side;
            }
        }
        const speedSquared = dx * dx + dy * dy;
        if (speedSquared > 0) for (const end of [0, length]) {
            const offset = x - end, dot = offset * dx + y * dy;
            const discriminant = dot * dot - speedSquared * (offset * offset + y * y - radius * radius);
            if (discriminant < 0) continue;
            const t = (-dot - Math.sqrt(discriminant)) / speedSquared, hitX = x + dx * t;
            if (t >= 0 && t <= input.maxFraction && t < fraction && (end === 0 ? hitX <= 0 : hitX >= length)) {
                fraction = t; nx = (hitX - end) / radius; ny = (y + dy * t) / radius;
            }
        }
        if (!Number.isFinite(fraction)) return false;
        const localX = ux * nx - uy * ny, localY = uy * nx + ux * ny, q = transform.q;
        output.fraction = fraction; output.normal.x = q.c * localX - q.s * localY; output.normal.y = q.s * localX + q.c * localY;
        return true;
    }
}

/** 插值/平滑采样用于显示和切线，不能把低于物理精度的每个弯折都变成接触代理。
 * 3.8.8 的 linearSlop 为 .008 m；合并边的中心线偏差不超过该接触精度。
 * 整条链按最大实际偏差增加半径，完整覆盖原胶囊；外扩最多 .016 m，
 * 等于引擎的 polygonRadius，即 .512 UI 像素。显示和切线仍使用原采样。
 * 投影必须单调，因此不能抹掉折返；断开的边也不能跨接。原质量积分保持不变。
 */
function compactResolvedEdges(edges: Segment[]): Segment[] {
    const toleranceSquared = .008 * .008, result: Segment[] = [];
    for (let first = 0; first < edges.length;) {
        let end = first + 1;
        while (end < edges.length && edges[end - 1].b.x === edges[end].a.x && edges[end - 1].b.y === edges[end].a.y) end++;
        const points = [edges[first].a];
        for (let i = first; i < end; i++) points.push(edges[i].b);
        const parts: { first: number; last: number; deviation: number }[] = [];
        const stack = [{ first: 0, last: points.length - 1 }];
        while (stack.length) {
            const range = stack.pop()!, a = points[range.first], b = points[range.last];
            const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
            let squared = 0, split = range.first + 1, projection = 0, monotone = lengthSquared > 0;
            for (let i = range.first + 1; i < range.last; i++) {
                const x = points[i].x - a.x, y = points[i].y - a.y;
                const t = lengthSquared ? (x * dx + y * dy) / lengthSquared : 0;
                const distance = (x - dx * Math.max(0, Math.min(1, t))) ** 2 + (y - dy * Math.max(0, Math.min(1, t))) ** 2;
                if (distance > squared) { squared = distance; split = i; }
                if (t < projection - 1e-12 || t > 1 + 1e-12) monotone = false;
                projection = t;
            }
            if (range.last > range.first + 1 && (!monotone || squared > toleranceSquared)) {
                stack.push({ first: split, last: range.last }, { first: range.first, last: split });
            } else parts.push({ ...range, deviation: Math.sqrt(squared) });
        }
        const closed = points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y;
        parts.forEach((part, i) => result.push({ a: points[part.first], b: points[part.last], deviation: part.deviation,
            before: i ? points[parts[i - 1].first] : closed ? points[parts[parts.length - 1].first] : edges[first].before,
            after: i + 1 < parts.length ? points[parts[i + 1].last] : closed ? points[parts[0].last] : edges[end - 1].after }));
        first = end;
    }
    return result;
}

/** 保留笔迹胶囊并集，只去掉完全埋在其它保留边内部的碰撞边。
 * 将每条胶囊的矩形和两个圆头的外接多边形分成凸三角形：三角形三个顶点
 * 都在同一条其它胶囊内，整个三角形才被证明覆盖；跨胶囊时递归细分。
 * 证明失败就保留原边。已提供覆盖证明的边不会再删除，避免循环依赖或误差累积。
 * 质量/质心/惯量使用上面的原始全量积分，不因接触表示减少而改变。
 */
function compactCoveredEdges(edges: Segment[], radius: number): Segment[] {
    if (edges.length < 16) return edges;
    const active = new Uint8Array(edges.length); active.fill(1);
    const protectedEdges = new Uint8Array(edges.length);
    const radiusSquared = radius * radius * (1 - 1e-12);
    const data = edges.map(edge => {
        const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
        return { ...edge, dx, dy, invLengthSquared: 1 / (dx * dx + dy * dy),
            minX: Math.min(edge.a.x, edge.b.x), maxX: Math.max(edge.a.x, edge.b.x),
            minY: Math.min(edge.a.y, edge.b.y), maxY: Math.max(edge.a.y, edge.b.y) };
    });
    const contains = (index: number, p: Point): boolean => {
        const edge = data[index], x = p.x - edge.a.x, y = p.y - edge.a.y;
        const t = Math.max(0, Math.min(1, (x * edge.dx + y * edge.dy) * edge.invLengthSquared));
        return (x - t * edge.dx) ** 2 + (y - t * edge.dy) ** 2 <= radiusSquared;
    };
    let candidates: number[] = [];
    const owners = new Set<number>();
    const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const covered = (a: Point, b: Point, c: Point, depth: number): boolean => {
        let corners = 0;
        for (const index of candidates) {
            const bits = (contains(index, a) ? 1 : 0) | (contains(index, b) ? 2 : 0) | (contains(index, c) ? 4 : 0);
            if (bits === 7) { owners.add(index); return true; }
            corners |= bits;
        }
        if (corners !== 7 || !depth) return false;
        const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
        return covered(a, ab, ca, depth - 1) && covered(ab, b, bc, depth - 1)
            && covered(ca, bc, c, depth - 1) && covered(ab, bc, ca, depth - 1);
    };
    const outsideRadius = radius / Math.cos(Math.PI / 16);
    const directions = Array.from({ length: 9 }, (_v, i) => ({
        x: Math.cos(-Math.PI / 2 + i * Math.PI / 8) * outsideRadius,
        y: Math.sin(-Math.PI / 2 + i * Math.PI / 8) * outsideRadius,
    }));
    for (let i = 0; i < edges.length; i++) {
        if (protectedEdges[i]) continue;
        const edge = data[i]; candidates = [];
        for (let j = 0; j < edges.length; j++) if (j !== i && active[j]) {
            const other = data[j];
            if (other.maxX + 2.02 * radius < edge.minX || other.minX - 2.02 * radius > edge.maxX
                || other.maxY + 2.02 * radius < edge.minY || other.minY - 2.02 * radius > edge.maxY) continue;
            candidates.push(j);
        }
        if (!candidates.length) continue;
        candidates.sort((a, b) => protectedEdges[b] - protectedEdges[a]); owners.clear();
        const inverseLength = Math.sqrt(edge.invLengthSquared), ux = edge.dx * inverseLength, uy = edge.dy * inverseLength;
        const nx = -uy * radius, ny = ux * radius, { a, b } = edge;
        const aa = { x: a.x + nx, y: a.y + ny }, bb = { x: b.x + nx, y: b.y + ny };
        const cc = { x: b.x - nx, y: b.y - ny }, dd = { x: a.x - nx, y: a.y - ny };
        if (!covered(aa, bb, cc, 3) || !covered(aa, cc, dd, 3)) continue;
        let complete = true;
        for (const [center, sign] of [[a, -1], [b, 1]] as const) {
            const cap = directions.map(d => ({ x: center.x + sign * (ux * d.x - uy * d.y),
                y: center.y + sign * (uy * d.x + ux * d.y) }));
            for (let j = 1; j < cap.length; j++) if (!covered(center, cap[j - 1], cap[j], 3)) { complete = false; break; }
            if (!complete) break;
        }
        if (!complete) continue;
        active[i] = 0; owners.forEach(index => { protectedEdges[index] = 1; });
    }
    return edges.filter((_edge, i) => !!active[i]);
}

/** Cocos 没有公开 ChainCollider2D；复用 collider 的注册、分组、回调与释放，
 * 在此实例的 Box2D shape 工厂提供连续边链，保留原笔迹宽度及完整采样。
 */
@ccclass('CyBlockBeesStrokeCollider2D')
export class CyBlockBeesStrokeCollider2D extends PolygonCollider2D {
    radius = 1;
    protected onLoad(): void {
        super.onLoad();
        const shape = this._shape as unknown as { _createShapes(x: number, y: number, offsetX: number, offsetY: number): unknown[] } | null;
        if (!shape) return;
        shape._createShapes = (x, y, offsetX, offsetY) => [new StrokeShape(this.points.map(p =>
            ({ x: (offsetX + (p.x + this.offset.x) * x) / PTM, y: (offsetY + (p.y + this.offset.y) * y) / PTM })),
        this.radius * Math.abs(x) / PTM)];
    }
}
