import { _decorator, PolygonCollider2D } from 'cc';

const { ccclass } = _decorator;
interface Point { x: number; y: number; }
interface PolygonShape {
    m_vertices: readonly Point[];
    m_count: number;
    m_radius: number;
    Clone(): PolygonShape;
    Set(points: readonly Point[], count: number): PolygonShape;
}

function polygonArea(shape: PolygonShape): number {
    let twiceArea = 0;
    for (let i = 0; i < shape.m_count; i++) {
        const a = shape.m_vertices[i], b = shape.m_vertices[(i + 1) % shape.m_count];
        twiceArea += a.x * b.y - a.y * b.x;
    }
    return Math.abs(twiceArea) * .5;
}

function convexBoundary(a: PolygonShape, b: PolygonShape): Point[] | undefined {
    for (let i = 0; i < a.m_count; i++) {
        const start = a.m_vertices[i], end = a.m_vertices[(i + 1) % a.m_count];
        for (let j = 0; j < b.m_count; j++) {
            const otherStart = b.m_vertices[j], otherEnd = b.m_vertices[(j + 1) % b.m_count];
            if (start.x !== otherEnd.x || start.y !== otherEnd.y
                || end.x !== otherStart.x || end.y !== otherStart.y) continue;
            const points: Point[] = [];
            for (let k = 1; k <= a.m_count; k++) points.push(a.m_vertices[(i + k) % a.m_count]);
            for (let k = 2; k < b.m_count; k++) points.push(b.m_vertices[(j + k) % b.m_count]);
            // 先证明拼接后的外边界为凸形；不能仅凭近似面积相等填掉细窄凹口。
            for (let k = 0; k < points.length; k++) {
                const p = points[k], q = points[(k + 1) % points.length], r = points[(k + 2) % points.length];
                if ((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) < 0) return undefined;
            }
            return points;
        }
    }
    return undefined;
}

/** 恢复被 Cocos 适配层切开的完整凸形状，不用凸包填平原轮廓的凹口。
 * Creator 3.8.8 按 maxPolygonVertices=8 再切分凸片；它使用的 Box2D JS
 * 的 Set、Clone、距离、接触与 CCD 已按实际顶点数分配和遍历，可以保留完整凸片。
 * 仅合并具有反向公共边、半径相同、凸包面积等于两片面积之和的相邻片。
 * 原始并集、外边界、密度及质量积分保持不变，同时去掉无意义的内部接触边。
 */
function mergeConvexShapes(shapes: PolygonShape[]): PolygonShape[] {
    if (shapes.length < 2) return shapes;
    const result = shapes.slice(), areas = result.map(polygonArea);
    for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
            const a = result[i], b = result[j];
            if (a.m_radius !== b.m_radius) continue;
            const points = convexBoundary(a, b);
            if (!points) continue;
            const merged = a.Clone().Set(points, points.length), area = polygonArea(merged);
            const expected = areas[i] + areas[j];
            // native vertices 使用 Float32；容差只覆盖面积运算的舍入误差。
            if (Math.abs(area - expected) > Math.max(1e-10, expected * 1e-7)) continue;
            result[i] = merged; areas[i] = area;
            result.splice(j, 1); areas.splice(j, 1);
            // 合并后可能与此前拒绝的相邻片组成凸形，重新检查本片的所有邻居。
            j = i;
        }
    }
    return result;
}

/** 仅用于守护狗头的 Box2D JS 多边形，沿用 Cocos 的注册、过滤、回调与释放。 */
@ccclass('CyBlockBeesPolygonCollider2D')
export class CyBlockBeesPolygonCollider2D extends PolygonCollider2D {
    protected onLoad(): void {
        super.onLoad();
        const adapter = this._shape as unknown as {
            _createShapes(x: number, y: number, offsetX: number, offsetY: number): PolygonShape[];
        } | null;
        if (!adapter) return;
        const createShapes = adapter._createShapes;
        adapter._createShapes = function (x, y, offsetX, offsetY) {
            return mergeConvexShapes(createShapes.call(this, x, y, offsetX, offsetY));
        };
    }
}
