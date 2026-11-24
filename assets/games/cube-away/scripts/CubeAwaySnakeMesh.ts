import { ARROW_PALETTE } from './CubeAwayTheme';

type V = readonly [number, number, number];
type Point = readonly [number, number];
export interface SnakeSample { readonly p: V; readonly n: V; readonly tang: V; readonly left: V; readonly s: number; }

interface SnakeGeometry {
    positions: number[];
    normals: number[];
    colors: number[];
    indices: number[];
    uvs: number[];
    tangents: number[];
}

const BODY_HALF_WIDTH = .165;
const SURFACE_LIFT = .008;
const rgb = (hex: string): number[] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const geometry = (): SnakeGeometry => ({ positions: [], normals: [], colors: [], indices: [], uvs: [], tangents: [] });

export type HeadArtwork = -1 | 1 | 2;

/** The pose and mirror sign follow the direction on the face of the cube. */
export function snakeHeadArtwork(sample: SnakeSample, direction: 1 | -1): HeadArtwork {
    const up: V = Math.abs(sample.n[1]) > .5 ? [0, 0, -Math.sign(sample.n[1])] : [0, 1, 0];
    if (Math.abs(dot(up, sample.tang)) >= Math.SQRT1_2) return 2;
    return dot(up, sample.left) * direction >= 0 ? 1 : -1;
}

function vertex(geo: SnakeGeometry, p: V, normal: V, color: readonly number[]): number {
    const index = geo.positions.length / 3;
    geo.positions.push(p[0], p[1], p[2]);
    geo.normals.push(normal[0], normal[1], normal[2]);
    geo.colors.push(color[0], color[1], color[2], 1);
    geo.uvs.push(0, 0);
    geo.tangents.push(0, 0, 0, 0);
    return index;
}

function triangle(geo: SnakeGeometry, a: number, b: number, c: number, n: V): void {
    const p = geo.positions, i = a * 3, j = b * 3, k = c * 3;
    const abx = p[j] - p[i], aby = p[j + 1] - p[i + 1], abz = p[j + 2] - p[i + 2];
    const acx = p[k] - p[i], acy = p[k + 1] - p[i + 1], acz = p[k + 2] - p[i + 2];
    const facing = (aby * acz - abz * acy) * n[0] + (abz * acx - abx * acz) * n[1] + (abx * acy - aby * acx) * n[2];
    if (facing >= 0) geo.indices.push(a, b, c);
    else geo.indices.push(a, c, b);
}

function outward(a: Point, b: Point): Point {
    const dx = b[0] - a[0], ds = b[1] - a[1];
    const length = Math.hypot(dx, ds);
    return [ds / length, -dx / length];
}

/** The head is an atlas decal on the end of the same ribbon. */
export function paintSnake(
    sample: (s: number) => SnakeSample, tail: number, head: number,
    colorIndex: number, double: boolean, linked: boolean, scale = 1,
    emphasis: 'none' | 'hint' | 'blocked' = 'none', hintTail = false,
    artwork?: readonly [HeadArtwork, HeadArtwork],
    foldDistances: readonly number[] = [],
): SnakeGeometry & { outline?: SnakeGeometry } {
    const geo = geometry();
    const pal = ARROW_PALETTE[colorIndex % ARROW_PALETTE.length];
    const main = rgb(pal.main);
    const endInset = Math.min(.098 * scale, (head - tail) * .22);
    const start = double ? tail + endInset : tail;
    const end = head - endInset;
    // Both ribbon edges, their outline and winding checks use the same path cross-sections.
    const frames = new Map<number, SnakeSample>();
    const frame = (s: number): SnakeSample => {
        const at = Math.max(tail, Math.min(head, s));
        let value = frames.get(at);
        if (!value) { value = sample(at); frames.set(at, value); }
        return value;
    };
    const drawPoint = (target: SnakeGeometry, x: number, s: number, lift: number, color: readonly number[], roundBody = false): number => {
        const v = frame(s);
        const overhang = s - Math.max(tail, Math.min(head, s));
        const index = vertex(target, [
            v.p[0] + v.tang[0] * overhang + v.left[0] * x + v.n[0] * lift,
            v.p[1] + v.tang[1] * overhang + v.left[1] * x + v.n[1] * lift,
            v.p[2] + v.tang[2] * overhang + v.left[2] * x + v.n[2] * lift,
        ], v.n, color);
        if (roundBody) {
            const slope = .58 * x / (BODY_HALF_WIDTH * scale);
            for (let axis = 0; axis < 3; axis++) target.tangents[index * 4 + axis] = v.left[axis] * slope;
        }
        return index;
    };

    const plus: Point[] = [], minus: Point[] = [];
    const addSection = (s: number): void => {
        // Round the neck into the decal and overlap its attachment edge.
        const neck = (distance: number): number => .66 + .34 * Math.min(1, distance / (.25 * scale));
        const rear = double ? neck(s - start) : Math.min(1, (s - start) / (.46 * scale));
        const width = BODY_HALF_WIDTH * Math.min(rear, neck(end - s)) * scale;
        plus.push([width, s]);
        minus.push([-width, s]);
        const a = drawPoint(geo, width, s, SURFACE_LIFT, main, true);
        const b = drawPoint(geo, -width, s, SURFACE_LIFT, main, true);
        if (a > 0) {
            const n = frame(s).n;
            triangle(geo, a - 2, b - 2, b, n);
            triangle(geo, a - 2, b, a, n);
        }
    };
    // A uniform step can skip a whole sharp edge. Keep each fold's cross-sections in
    // both the ribbon and its perimeter, even as the moving tail slides past them.
    addSection(start);
    let from = start;
    const addSpan = (to: number): void => {
        const steps = Math.max(from === start && to === end ? 2 : 1, Math.ceil((to - from) / .072));
        for (let i = 1; i < steps; i++) addSection(from + (to - from) * i / steps);
        addSection(to);
        from = to;
    };
    for (const fold of foldDistances) {
        if (fold >= end - 1e-6) break;
        if (fold > from + 1e-6) addSpan(fold);
    }
    addSpan(end);

    const outline = emphasis === 'none' ? undefined : geometry();
    const edge = outline ?? geo;
    const perimeter = plus.concat(minus.slice(double ? 0 : 1).reverse());
    const hint = emphasis === 'hint';
    const strokeSize = hint ? .135 : emphasis === 'blocked' ? .060 : .034;
    const edgeColor = outline ? [1, 1, 1] : rgb(pal.shadow);
    const strokeRibbon = (lift: number, color: readonly number[]): void => {
        const first = edge.positions.length / 3;
        const sections: number[] = [];
        const append = (point: Point, dx: number, ds: number): void => {
            const inner = drawPoint(edge, point[0], point[1], lift, color);
            const width = strokeSize * scale;
            const outer = drawPoint(edge, point[0] + dx * width, point[1] + ds * width, lift, color);
            if (hint) {
                for (let axis = 0; axis < 3; axis++) {
                    edge.tangents[outer * 4 + axis] = edge.positions[outer * 3 + axis] - edge.positions[inner * 3 + axis];
                }
            }
            sections.push(point[1]);
        };
        for (let i = 0; i < perimeter.length; i++) {
            const prev = perimeter[(i + perimeter.length - 1) % perimeter.length];
            const current = perimeter[i];
            const next = perimeter[(i + 1) % perimeter.length];
            const a = outward(prev, current), b = outward(current, next);
            const cosine = a[0] * b[0] + a[1] * b[1];
            const turn = a[0] * b[1] - a[1] * b[0];
            if (hint && turn > 0 && cosine < .94) {
                // A rounded offset stays one stroke width from a pointed tail.
                const startAngle = Math.atan2(a[1], a[0]);
                const sweep = Math.atan2(turn, cosine);
                const steps = Math.ceil(sweep / (Math.PI / 10));
                for (let j = 0; j <= steps; j++) {
                    const angle = startAngle + sweep * j / steps;
                    append(current, Math.cos(angle), Math.sin(angle));
                }
            } else {
                const miter = 1 / Math.max(1, 1 + cosine);
                append(current, (a[0] + b[0]) * miter, (a[1] + b[1]) * miter);
            }
        }
        for (let i = 0; i < sections.length; i++) {
            const a = first + i * 2, b = first + ((i + 1) % sections.length) * 2, n = frame(sections[i]).n;
            triangle(edge, a, a + 1, b, n);
            triangle(edge, a + 1, b + 1, b, n);
        }
    };

    const stamp = (s: number, rx: number, ry: number, hex: string, diamond = false): void => {
        const color = rgb(hex), n = frame(s).n;
        const center = drawPoint(geo, 0, s, .016, color);
        const count = diamond ? 4 : 16;
        let prev = center;
        for (let i = 0; i <= count; i++) {
            const t = i / count * Math.PI * 2;
            const next = drawPoint(geo, Math.cos(t) * rx * scale, s + Math.sin(t) * ry * scale, .016, color, true);
            if (i) triangle(geo, center, prev, next, n);
            prev = next;
        }
    };
    for (let s = tail + .64; s < head - .43; s += .58) {
        stamp(s, .060, .096, pal.highlight, colorIndex % 3 === 2);
    }
    if (linked && head - tail > .65) {
        const s = Math.max(tail + .3, head - .55);
        const n = frame(s).n;
        const band = (at: number, w: number, hex: string, lift: number): void => {
            const color = rgb(hex);
            const a = drawPoint(geo, -.147 * scale, at - w / 2, lift, color, true);
            const b = drawPoint(geo, .147 * scale, at - w / 2, lift, color, true);
            const c = drawPoint(geo, .147 * scale, at + w / 2, lift, color, true);
            const d = drawPoint(geo, -.147 * scale, at + w / 2, lift, color, true);
            triangle(geo, a, b, c, n);
            triangle(geo, a, c, d, n);
        };
        band(s - .045 * scale, .065 * scale, '#D7AD58', .018);
        band(s - .015 * scale, .020 * scale, '#FFF0AE', .021);
    }
    if (double && emphasis === 'hint') {
        stamp(hintTail ? tail + .33 * scale : head - .33 * scale, .058, .066, '#FFF1A9', true);
    }

    const decal = (target: SnakeGeometry, s: number, direction: 1 | -1, backing: boolean, lift: number, color: readonly number[]): void => {
        const v = frame(s), anchor = add(v.p, v.n, lift);
        const pose = artwork?.[direction === 1 ? 0 : 1] ?? snakeHeadArtwork(v, direction);
        const front = pose === 2;
        const width = front ? .64 : .78, height = front ? .70 : .64;
        const padU = backing ? strokeSize / width : 0, padV = backing ? strokeSize / height : 0;
        const base = target.positions.length / 3;
        for (const [x, y] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
            const u = x + (2 * x - 1) * padU, t = y + (2 * y - 1) * padV;
            const along = front ? (t - .53) * height : (u - .55) * width;
            const across = front ? (u - .5) * width : (.59 - t) * height * pose;
            const p = add(add(anchor, v.tang, along * direction * scale), v.left, across * direction * scale);
            const index = vertex(target, p, v.n, color);
            if (backing) {
                // Each distance tile spans 1.28 cells; its full alpha is a quarter-cell offset.
                target.uvs[index * 2] = ((u - .5) * width / 1.28 + .5 + (front ? 1 : 0)) * .5;
                target.uvs[index * 2 + 1] = (t - .5) * height / 1.28 + .5;
                target.tangents[index * 4 + 2] = strokeSize / .25;
            } else {
                target.uvs[index * 2] = u;
                target.uvs[index * 2 + 1] = t;
                for (let axis = 0; axis < 3; axis++) {
                    target.tangents[index * 4 + axis] = direction * (.95 * across * v.left[axis] + .65 * along * v.tang[axis]);
                }
            }
            target.tangents[index * 4 + 3] = backing ? -Math.abs(pose) : Math.abs(pose);
        }
        triangle(target, base, base + 1, base + 2, v.n);
        triangle(target, base, base + 2, base + 3, v.n);
    };
    const stroke = (lift: number, color: readonly number[]): void => {
        strokeRibbon(lift, color);
        decal(edge, head, 1, true, lift, color);
        if (double) decal(edge, tail, -1, true, lift, color);
    };
    // Each band contains the union of head and ribbon at the same depth.
    // The narrower band covers the wider one everywhere along the neck.
    stroke(.004, edgeColor);
    if (hint) stroke(.006, [0, 0, 0]);
    decal(geo, head, 1, false, .022, main);
    if (double) decal(geo, tail, -1, false, .022, main);
    return { ...geo, outline };
}
