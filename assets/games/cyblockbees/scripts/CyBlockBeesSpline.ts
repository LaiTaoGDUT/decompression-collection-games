import { Vec2 } from 'cc';

/**
 * 画线的点序列平滑，逐行对齐原作 `Assets/CasualGame/CyBlockBees/Lua/*.txt` 里的
 * `cyblockbees_spline`（原作注释写的是「chatGPT3.5 gen」）。
 *
 * 调用点也照抄 `cyblockbees_comp_drawLine:InputMgrOnDrag`：
 *
 * ```lua
 * if self.drawingPosIndex > 4 then
 *     self.smootherTable = smoother:smoothCatmullRom(self.drawingPosTable, 0.5)
 *     self.smootherTable = smoother:interpolatePoints(self.smootherTable, 0.1)
 * else
 *     self.smootherTable = self.drawingPosTable
 * end
 * ```
 *
 * 也就是**采样点超过 4 个才平滑**，平滑系数 0.5，插值阈值 0.1。
 * 原作会带回若干重复点（每段的 t=0 与首点重合），这里刻意保留，
 * 因为线宽渲染对重复点不敏感，而少一次去重就少一处和原作不一致的地方。
 */

export const SPLINE_SMOOTH_FACTOR = 0.5;
export const SPLINE_INTERPOLATE_THRESHOLD = 0.1;
/** 采样点超过这个数量才做平滑（原作 `drawingPosIndex > 4`）。 */
export const SPLINE_MIN_POINTS = 4;
type SegmentValidator = (to: Vec2, from: Vec2) => boolean;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    const a = 0.5 * (2 * p1);
    const b = 0.5 * (p2 - p0);
    const c = 0.5 * (2 * p0 - 5 * p1 + 4 * p2 - p3);
    const d = 0.5 * (-p0 + 3 * p1 - 3 * p2 + p3);
    return a + b * t + c * t2 + d * t3;
}

/** 原作 `spline:smoothCatmullRom`：逐段按 `smoothFactor` 采样。 */
export function smoothCatmullRom(input: readonly Vec2[], smoothFactor = SPLINE_INTERPOLATE_THRESHOLD): Vec2[] {
    const numPoints = input.length;
    if (numPoints < 2) return input.slice();
    const factor = smoothFactor > 0 ? smoothFactor : 0.1;
    const output: Vec2[] = [input[0]];

    for (let i = 0; i < numPoints - 1; i += 1) {
        const p0 = input[i === 0 ? 0 : i - 1];
        const p1 = input[i];
        const p2 = input[i + 1];
        const p3 = input[Math.min(i + 2, numPoints - 1)];
        const tEnd = i === numPoints - 2 ? 1 : 1 - factor;
        // Lua 的 `for t = 0, t_end, factor`：起点含、按步长递增、超过上界停。
        for (let t = 0; t <= tEnd + 1e-9; t += factor) {
            output.push(new Vec2(
                catmullRom(p0.x, p1.x, p2.x, p3.x, t),
                catmullRom(p0.y, p1.y, p2.y, p3.y, t),
            ));
        }
    }
    output.push(input[numPoints - 1]);
    return output;
}

/**
 * 原作 `spline:interpolatePoints`：相邻点距超过 threshold 时按等分线性补点。
 *
 * 原作是 1-based `for i = 1, n - c do`（未闭合时 `c = 1`，闭合时 `c = 0`），
 * 对应 0-based 就是 `i` 走 `0 .. n-2`（未闭合）或 `0 .. n-1`（闭合）。
 * 这里曾把它写成 `i < n - last`（`last = n - 1`），结果只跑一轮、只剩一个点，
 * 画出来的线是空的 —— 由 `verify-browser.cjs` 的画线用例发现的。
 */
export function interpolatePoints(points: readonly Vec2[], threshold: number, isClosed = false): Vec2[] {
    const interpolated: Vec2[] = [];
    const n = points.length;
    const limit = isClosed ? n : n - 1;
    for (let i = 0; i < limit; i += 1) {
        const pointA = points[i];
        const pointB = points[(i + 1) % n];
        interpolated.push(pointA);
        const distance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
        if (distance <= threshold) continue;
        const insertCount = Math.floor(distance / threshold);
        const step = 1.0 / (insertCount + 1);
        for (let j = 1; j <= insertCount; j += 1) {
            const t = j * step;
            interpolated.push(new Vec2(
                pointA.x + (pointB.x - pointA.x) * t,
                pointA.y + (pointB.y - pointA.y) * t,
            ));
        }
    }
    return interpolated;
}

/** 平滑后、未插值的点 —— 物理碰撞链用这一份，避免为 0.1 像素的点距建上千个碰撞体。 */
export function buildDrawnSpine(points: readonly Vec2[], canUseSegment?: SegmentValidator): Vec2[] {
    if (points.length <= SPLINE_MIN_POINTS) return points.slice();
    const smoothed = smoothCatmullRom(points, SPLINE_SMOOTH_FACTOR);
    if (!canUseSegment) return smoothed;
    const safe: Vec2[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const midpoint = smoothed[2 * i + 2], a = points[i], b = points[i + 1];
        // 控制点和原折线合法，不代表 Catmull-Rom 外插后的弧线也合法。
        // 只将越过禁画区域的这一段恢复为合法直线，其余段保持相同平滑。
        safe.push(a, canUseSegment(midpoint, a) && canUseSegment(b, midpoint)
            ? midpoint : new Vec2((a.x + b.x) / 2, (a.y + b.y) / 2));
        if (i === points.length - 2) safe.push(b);
    }
    safe.push(points[points.length - 1]);
    return safe;
}

/** 草稿只重算被新控制点影响的尾段。Catmull-Rom 的一段只依赖前后四个点，
 * 追加点会改变旧的最后一段，其余段的平滑与禁画检查可直接复用。
 * 保存数值快照，兼容输入数组原地追加、改点和缩短；障碍变化用 revision 使验证失效。
 * 输入/输出均为 UI 坐标，中间仍按原作世界单位计算，保持批量平滑的浮点运算顺序。
 */
export class DrawnSpineCache {
    private readonly points: Vec2[] = [];
    private readonly output: Vec2[] = [];
    private scale = NaN;
    private revision = NaN;

    clear(): void { this.points.length = 0; this.output.length = 0; this.scale = this.revision = NaN; }

    update(input: readonly Vec2[], scale: number, canUseSegment: SegmentValidator, revision: number): readonly Vec2[] {
        const oldCount = this.points.length;
        const inverseScale = 1 / scale;
        let changed = Math.min(oldCount, input.length);
        for (let i = 0; i < input.length; i++) {
            const x = input[i].x * inverseScale, y = input[i].y * inverseScale, old = this.points[i];
            if (!old || old.x !== x || old.y !== y) {
                changed = Math.min(changed, i); this.points[i] = new Vec2(x, y);
            }
        }
        this.points.length = input.length;
        const invalidated = this.scale !== scale || this.revision !== revision;
        if (changed === input.length && oldCount === input.length && !invalidated) return this.output;
        this.scale = scale; this.revision = revision;
        const local = (p: Vec2): Vec2 => new Vec2(p.x * scale, p.y * scale);
        if (input.length <= SPLINE_MIN_POINTS) {
            this.output.length = 0;
            for (const p of this.points) this.output.push(local(p));
            return this.output;
        }
        const start = invalidated || oldCount <= SPLINE_MIN_POINTS ? 0 : Math.max(0, changed - 2);
        this.output.length = start ? 1 + start * 2 : 0;
        if (!start) this.output.push(local(this.points[0]));
        for (let i = start; i < this.points.length - 1; i++) {
            const p0 = this.points[Math.max(0, i - 1)], a = this.points[i], b = this.points[i + 1];
            const p3 = this.points[Math.min(i + 2, this.points.length - 1)];
            const midpoint = new Vec2(catmullRom(p0.x, a.x, b.x, p3.x, .5), catmullRom(p0.y, a.y, b.y, p3.y, .5));
            const safe = canUseSegment(midpoint, a) && canUseSegment(b, midpoint)
                ? midpoint : new Vec2((a.x + b.x) / 2, (a.y + b.y) / 2);
            this.output.push(local(a), local(safe));
        }
        const last = this.points[this.points.length - 1];
        this.output.push(local(last), local(last));
        return this.output;
    }
}

/**
 * 原作落笔过程中的那条线：>4 点先 Catmull-Rom 平滑，再按 0.1 阈值插值。
 * 少于等于 4 点原样返回（原作走的就是 `self.drawingPosTable`）。
 */
export function buildDrawnLine(points: readonly Vec2[], canUseSegment?: SegmentValidator): Vec2[] {
    if (points.length <= SPLINE_MIN_POINTS) return points.slice();
    const smoothed = buildDrawnSpine(points, canUseSegment);
    return interpolatePoints(smoothed, SPLINE_INTERPOLATE_THRESHOLD);
}
