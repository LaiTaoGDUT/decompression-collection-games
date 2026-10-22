import { Color, type Graphics } from 'cc';
import {
    DUNK_SKYLINE_DESATURATE, DUNK_SKYLINE_SHADE, DUNK_THEME as T, DUNK_TIME_STAGES, DUNK_TIME_TRANSITION, DUNK_WINDOW_ALPHA,
    type DunkTimeStage,
} from './FlappyDunkTheme';

/** Silhouettes stand on the default floor line; shrinking walls never move the city. */
const GROUND = -3.7;
/** Windows that flip on or off by themselves, per check of their own period. */
const WINDOW_FLICKER = .04;

interface Span { x: number; w: number; }
interface Rect extends Span { y: number; h: number; }
interface Path extends Span { pts: number[]; }
interface Line extends Path { width: number; }
/** 0 lamp, 1 dim lamp, 2 warm white: the only window colours a sleeping city shows. */
type Warmth = 0 | 1 | 2;
interface Window extends Rect { rank: number; delay: number; seed: number; period: number; warmth: Warmth; }
interface Piece { rects: Rect[]; polys: Path[]; lines: Line[]; }
interface Layer {
    speed: number; shade: number; period: number; windowAlpha: number;
    /** Three silhouette tones per layer so neighbouring buildings never read as one flat wall. */
    tones: Piece[]; windows: Window[];
    /** Street lamps (glow), the clock face and moonlit edges are drawn over the silhouettes. */
    glows: { x: number; y: number }[]; faces: { x: number; y: number; r: number }[]; edges: Line[];
}

/** Time-of-day values blended between two stages. */
export interface DunkSky {
    top: Color; bottom: Color; far: Color; mid: Color; near: Color;
    stars: number; moonHeight: number; moonAlpha: number;
}

/** Deterministic mulberry32 so the city is identical on every device and round. */
function random(seed: number): () => number {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
/** Stateless hash for time slots: the same window flips at the same moment on every frame. */
function hash(n: number): number { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }
function hex(value: string): Color { return Color.fromHEX(new Color(), value); }
function span(pts: number[]): Span {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { min = Math.min(min, pts[i]); max = Math.max(max, pts[i]); }
    return { x: min, w: max - min };
}

class LayerBuilder {
    readonly tones: Piece[] = [0, 1, 2].map(() => ({ rects: [], polys: [], lines: [] }));
    readonly windows: Window[] = [];
    readonly glows: { x: number; y: number }[] = [];
    readonly faces: { x: number; y: number; r: number }[] = [];
    readonly edges: Line[] = [];
    tone = 1;
    constructor(readonly r: () => number) {}
    rect(x: number, y: number, w: number, h: number): void { this.tones[this.tone].rects.push({ x, y, w, h }); }
    poly(...pts: number[]): void { this.tones[this.tone].polys.push({ pts, ...span(pts) }); }
    line(width: number, ...pts: number[]): void { this.tones[this.tone].lines.push({ pts, width, ...span(pts) }); }
    edge(width: number, ...pts: number[]): void { this.edges.push({ pts, width, ...span(pts) }); }
    window(x: number, y: number, w: number, h: number, rank = this.r(), warmth?: Warmth): void {
        const r = this.r;
        this.windows.push({ x, y, w, h, rank, delay: r() * .8, seed: r() * 1000, period: 7 + r() * 11,
            warmth: warmth ?? (r() < .78 ? 0 : r() < .6 ? 1 : 2) });
    }
    /** Remove windows hidden behind a landmark standing in front of them. */
    clearWindows(x: number, w: number): void {
        for (let i = this.windows.length - 1; i >= 0; i--) {
            const v = this.windows[i];
            if (v.x + v.w > x && v.x < x + w) this.windows.splice(i, 1);
        }
    }
}

/** Each building picks its own facade: punched grid, paired sashes, tall stair strips or office floor bands. */
function facade(b: LayerBuilder, x: number, w: number, h: number, s: number): void {
    const r = b.r, pick = r(), top = GROUND + h;
    if (pick < .45) {
        const columns = Math.max(1, Math.floor((w - s) / (s * 2.6))), rows = Math.max(1, Math.floor((h - s * 3) / (s * 2.8)));
        const gap = (w - columns * s) / (columns + 1);
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++)
            b.window(x + gap + col * (s + gap), top - s * 3 - row * s * 2.8, s, s * 1.2);
    } else if (pick < .67) {
        const pairs = Math.max(1, Math.floor((w - s) / (s * 4.4))), rows = Math.max(1, Math.floor((h - s * 3) / (s * 3)));
        const gap = (w - pairs * s * 2.5) / (pairs + 1);
        for (let row = 0; row < rows; row++) for (let p = 0; p < pairs; p++) {
            const px = x + gap + p * (s * 2.5 + gap), rank = r();
            b.window(px, top - s * 3 - row * s * 3, s, s * 1.3, rank); b.window(px + s * 1.5, top - s * 3 - row * s * 3, s, s * 1.3, rank);
        }
    } else if (pick < .87) {
        const columns = Math.max(1, Math.floor((w - s) / (s * 2.2))), rows = Math.max(1, Math.floor((h - s * 4) / (s * 3.4)));
        const gap = (w - columns * s * .7) / (columns + 1);
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++)
            b.window(x + gap + col * (s * .7 + gap), top - s * 4.2 - row * s * 3.4, s * .7, s * 2.4);
    } else {
        // A lit band is a whole office floor working late: every pane on the floor shares one rank.
        const rows = Math.max(1, Math.floor((h - s * 3) / (s * 2.6))), panes = w > 1.6 ? 2 : 1;
        const pane = (w - s * (panes + 1)) / panes;
        for (let row = 0; row < rows; row++) {
            const rank = r(), warmth: Warmth = r() < .5 ? 1 : 0;
            for (let p = 0; p < panes; p++) b.window(x + s + p * (pane + s), top - s * 2.6 - row * s * 2.6, pane, s * .9, rank, warmth);
        }
    }
}

/** Roof line: parapet, setback, spire, pitched roof or stair hut, so the skyline never reads as plain boxes. */
function roof(b: LayerBuilder, x: number, w: number, top: number): void {
    const r = b.r, pick = r();
    if (pick < .3) b.rect(x - .03, top, w + .06, .05);
    else if (pick < .5) { const h = .25 + r() * .5; b.rect(x + w * .2, top, w * .6, h); b.rect(x + w * .35, top + h, w * .3, h * .5); }
    else if (pick < .62 && w < 1.6) b.poly(x + w * .3, top, x + w * .5, top + .6 + r() * .6, x + w * .7, top);
    else if (pick < .78) b.poly(x, top, x + w / 2, top + Math.min(.55, w * .3), x + w, top);
    else if (pick < .9) b.rect(x + r() * Math.max(0, w - .5), top, .4, .3);
}

function waterTower(b: LayerBuilder, x: number, top: number): void {
    b.rect(x - .02, top, .05, .32); b.rect(x + .42, top, .05, .32);
    b.rect(x - .06, top + .3, .58, .46); b.rect(x - .1, top + .74, .66, .07); b.rect(x + .06, top + .8, .34, .1);
}

function antenna(b: LayerBuilder, x: number, top: number, height: number): void {
    b.rect(x, top, .04, height); b.rect(x - .14, top + height * .7, .32, .03);
}

interface LayerSpec {
    seed: number; period: number; speed: number; shade: number; windowAlpha: number;
    widths: [number, number]; heights: [number, number]; window: number;
    props(b: LayerBuilder, x: number, w: number, top: number): void;
    landmarks(b: LayerBuilder): void;
}

function build(spec: LayerSpec): Layer {
    const b = new LayerBuilder(random(spec.seed)), r = b.r;
    for (let x = 0; x < spec.period;) {
        // The final building absorbs the remainder so the copy tiles without a seam.
        let w = spec.widths[0] + r() * (spec.widths[1] - spec.widths[0]);
        if (spec.period - x - w < spec.widths[0]) w = spec.period - x;
        const h = spec.heights[0] + r() * (spec.heights[1] - spec.heights[0]);
        b.tone = Math.floor(r() * 3);
        b.rect(x, GROUND, w, h);
        if (spec.window > 0) { roof(b, x, w, GROUND + h); facade(b, x, w, h, spec.window * (.85 + r() * .3)); }
        spec.props(b, x, w, GROUND + h);
        x += w;
    }
    b.tone = 1; spec.landmarks(b);
    return { speed: spec.speed, shade: spec.shade, period: spec.period, windowAlpha: spec.windowAlpha,
        tones: b.tones, windows: b.windows, glows: b.glows, faces: b.faces, edges: b.edges };
}

/** Far landmark: an old clock tower whose lit face is the brightest thing on the horizon. */
function clockTower(b: LayerBuilder, x: number): void {
    b.clearWindows(x - .1, 1.1);
    b.rect(x, GROUND, .9, 5.6); b.rect(x - .08, GROUND + 5.6, 1.06, .12); b.rect(x + .1, GROUND + 5.72, .7, .9);
    b.poly(x + .05, GROUND + 6.62, x + .45, GROUND + 7.6, x + .85, GROUND + 6.62);
    b.faces.push({ x: x + .45, y: GROUND + 6.17, r: .27 });
}

/** Mid landmark: a lattice radio mast, see-through so the windows behind it stay visible. */
function radioMast(b: LayerBuilder, x: number): void {
    const height = 5.4, w = .05;
    b.line(w, x - .55, GROUND, x - .07, GROUND + height); b.line(w, x + .55, GROUND, x + .07, GROUND + height);
    for (let y = .5; y < height - .3; y += .55) {
        const k0 = 1 - y / height, k1 = 1 - (y + .55) / height;
        b.line(.025, x - .07 - .48 * k0, GROUND + y, x + .07 + .48 * k1, GROUND + y + .55);
        b.line(.025, x + .07 + .48 * k0, GROUND + y, x - .07 - .48 * k1, GROUND + y + .55);
    }
    b.rect(x - .25, GROUND + height * .55, .5, .05); b.rect(x - .02, GROUND + height, .04, 1.1);
}

/** Near props: AC units and railings on every roof, then one of lamp, laundry, solar panels or stair hut. */
function rooftop(b: LayerBuilder, x: number, w: number, top: number): void {
    const r = b.r;
    if (r() < .6) b.rect(x + .3 + r() * Math.max(0, w - 1), top, .5, .32);
    for (let px = x + .1; px < x + w - .1; px += .32) b.rect(px, top, .03, .22);
    b.rect(x, top + .2, w, .03);
    const pick = r(), at = x + .4 + r() * Math.max(0, w - 1.8);
    if (pick < .35) {
        b.rect(at, top, .04, .78); b.rect(at, top + .75, .24, .03); b.rect(at + .17, top + .69, .1, .07);
        b.glows.push({ x: at + .22, y: top + .67 });
    } else if (pick < .55) {
        // Laundry line between two posts, sagging, with a few pieces pegged on it.
        const x2 = at + 1.2, y = top + .44;
        b.rect(at, top, .03, .46); b.rect(x2, top, .03, .46);
        const pts: number[] = [];
        for (let i = 0; i <= 6; i++) pts.push(at + (x2 - at) * i / 6, y - .09 * Math.sin(Math.PI * i / 6));
        b.line(.015, ...pts);
        for (let i = 1; i < 6; i += 1 + Math.floor(r() * 2)) {
            const cw = .1 + r() * .1, ch = .12 + r() * .12, cx = at + (x2 - at) * i / 6;
            b.rect(cx - cw / 2, y - .09 * Math.sin(Math.PI * i / 6) - ch, cw, ch);
        }
    } else if (pick < .8) {
        for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
            const px = at + i * .62;
            b.poly(px, top + .06, px + .5, top + .06, px + .42, top + .3, px - .08, top + .3);
            b.edge(.02, px - .08, top + .3, px + .42, top + .3);
        }
    } else {
        b.rect(at, top, .56, .44); b.rect(at - .04, top + .44, .64, .04);
        b.window(at + .2, top + .02, .15, .28, .02, 0);
    }
}

/** Near landmarks: a rooftop tank farm and the bare scaffold of an unlit billboard. */
function nearLandmarks(b: LayerBuilder): void {
    for (const dx of [0, .8, 1.6]) waterTower(b, 22 + dx, GROUND + .55);
    b.rect(21.8, GROUND, 2.6, .55);
    const x = 52;
    b.rect(x, GROUND, .06, 1); b.rect(x + 2.3, GROUND, .06, 1);
    b.line(.025, x, GROUND + .1, x + 2.36, GROUND + .9); b.line(.025, x + 2.36, GROUND + .1, x, GROUND + .9);
    b.rect(x - .1, GROUND + 1, 2.56, 1.05); b.rect(x - .14, GROUND + .95, 2.64, .05);
    b.edge(.02, x - .1, GROUND + 2.05, x + 2.46, GROUND + 2.05);
}

interface Cloud { x: number; y: number; scale: number; speed: number; puffs: { dx: number; dy: number; rx: number; ry: number }[]; }

export class FlappyDunkSkyline {
    private readonly layers: Layer[];
    private readonly stars: { x: number; y: number; size: number; twinkle: number }[];
    private readonly clouds: Cloud[];
    private from: DunkSky;
    private target: DunkTimeStage;
    private stage = 0;
    private litFrom = DUNK_TIME_STAGES[0].lit;
    private started = -Infinity;
    readonly sky: DunkSky;

    constructor() {
        // Periods differ per layer so the layers never line up into the same picture twice.
        this.layers = [
            build({ seed: 7, period: 48, speed: .1, shade: DUNK_SKYLINE_SHADE.far, windowAlpha: DUNK_WINDOW_ALPHA[0],
                widths: [.7, 1.5], heights: [3.2, 6.6], window: .06,
                props: (b, x, w, top) => { if (b.r() < .3) antenna(b, x + w * .5, top, .5 + b.r() * .5); },
                landmarks: b => clockTower(b, 20) }),
            build({ seed: 19, period: 64, speed: .2, shade: DUNK_SKYLINE_SHADE.mid, windowAlpha: DUNK_WINDOW_ALPHA[1],
                widths: [1.4, 2.8], heights: [1.6, 3.6], window: .09,
                props: (b, x, w, top) => {
                    const pick = b.r();
                    if (pick < .35) waterTower(b, x + .2 + b.r() * Math.max(0, w - .8), top);
                    else if (pick < .55) antenna(b, x + w * (.2 + b.r() * .6), top, .35 + b.r() * .35);
                },
                landmarks: b => radioMast(b, 40) }),
            build({ seed: 31, period: 80, speed: .4, shade: DUNK_SKYLINE_SHADE.near, windowAlpha: DUNK_WINDOW_ALPHA[2],
                widths: [2.6, 4.6], heights: [.25, .7], window: 0, props: rooftop, landmarks: nearLandmarks }),
        ];
        const r = random(53);
        this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: .35 + r() * .65, size: .6 + r() * 1.4, twinkle: r() * Math.PI * 2 }));
        this.clouds = Array.from({ length: 3 }, (_, k) => ({ x: k / 3 + r() * .2, y: .5 + r() * .2, scale: .6 + r() * .5, speed: .003 + r() * .004,
            puffs: Array.from({ length: 3 + Math.floor(r() * 2) }, (_, i) => ({ dx: (i - 1.5) * .8 + r() * .3, dy: (r() - .5) * .12,
                rx: .7 + r() * .6, ry: .1 + r() * .08 })) }));
        this.target = DUNK_TIME_STAGES[0];
        this.sky = this.resolve(this.target);
        this.from = this.copy(this.sky);
    }

    /** Advance towards the stage of `score`; transitions blend over DUNK_TIME_TRANSITION seconds. */
    update(score: number, time: number): void {
        let index = 0;
        DUNK_TIME_STAGES.forEach((s, i) => { if (score >= s.score) index = i; });
        if (index !== this.stage) {
            this.litFrom = this.litAt(time);
            this.from = this.copy(this.sky); this.stage = index; this.target = DUNK_TIME_STAGES[index]; this.started = time;
        }
        const t = Math.min(1, Math.max(0, (time - this.started) / DUNK_TIME_TRANSITION));
        const to = this.resolve(this.target);
        for (const key of ['top', 'bottom', 'far', 'mid', 'near'] as const) Color.lerp(this.sky[key], this.from[key], to[key], t);
        this.sky.stars = this.from.stars + (to.stars - this.from.stars) * t;
        this.sky.moonHeight = this.from.moonHeight + (to.moonHeight - this.from.moonHeight) * t;
        this.sky.moonAlpha = this.from.moonAlpha + (to.moonAlpha - this.from.moonAlpha) * t;
    }

    /** Jump straight to the stage of `score` without a transition: dusk for a new round, or the saved
     * time of night when a round is resumed. */
    reset(score = 0): void {
        let index = 0;
        DUNK_TIME_STAGES.forEach((s, i) => { if (score >= s.score) index = i; });
        this.stage = index; this.target = DUNK_TIME_STAGES[index]; this.started = -Infinity; this.litFrom = this.target.lit;
        const sky = this.resolve(this.target);
        Object.assign(this.sky, this.copy(sky)); this.from = this.copy(sky);
    }

    /** Screen-space sky gradient and stars behind everything. */
    drawSky(g: Graphics, width: number, height: number, time: number): void {
        const bands = 120, top = height / 2, step = height / bands, c = new Color();
        for (let i = 0; i < bands; i++) {
            Color.lerp(c, this.sky.top, this.sky.bottom, i / (bands - 1));
            g.fillColor = c; g.rect(-width / 2, top - (i + 1) * step - 1, width, step + 2); g.fill();
        }
        if (this.sky.stars <= .01) return;
        for (const s of this.stars) {
            const alpha = this.sky.stars * (.55 + .45 * Math.sin(time * 1.3 + s.twinkle));
            g.fillColor = new Color(244, 235, 208, Math.round(alpha * 220));
            g.circle((s.x - .5) * width, -height / 2 + s.y * height, s.size); g.fill();
        }
    }

    /** Thin cloud streaks behind the moon, lit warm from below at dusk and silvered by the moon at night.
     * The caller draws each puff as nested faint ellipses behind the moon, so clouds have no hard outline
     * and never cut an elliptical shape out of the moon. */
    cloudPuffs(width: number, height: number, time: number): { x: number; y: number; w: number; h: number; color: Color }[] {
        const unit = height / 14, lit = new Color(), color = new Color();
        Color.lerp(lit, this.sky.bottom, hex(T.moonlight), Math.min(1, this.sky.stars * 1.4));
        Color.lerp(color, this.sky.top, lit, .45); color.a = 22;
        const puffs: { x: number; y: number; w: number; h: number; color: Color }[] = [];
        for (const c of this.clouds) {
            const cx = ((((c.x + time * c.speed) % 1.4) + 1.4) % 1.4 - .2 - .5) * width, cy = -height / 2 + c.y * height;
            for (const p of c.puffs) puffs.push({ x: cx + p.dx * unit * c.scale, y: cy + p.dy * unit * c.scale,
                w: p.rx * 2.6 * unit * c.scale, h: p.ry * 3.2 * unit * c.scale, color });
        }
        return puffs;
    }

    /** In front of the moon: at dusk or dawn a flock crossing the sky. */
    drawSkyFront(g: Graphics, width: number, height: number, time: number): void {
        const flock = time % 26, visible = Math.max(0, Math.min(1, (.5 - this.sky.stars) / .25));
        if (flock > 11 || visible <= 0) return;
        const s = height / 1334, fx = -width / 2 - 60 * s + flock / 11 * (width + 120 * s), fy = .3 * height + Math.sin(flock * .7) * 20 * s;
        g.strokeColor = new Color(5, 7, 15, Math.round(190 * visible * Math.min(1, flock, 11 - flock))); g.lineWidth = 2.2 * s;
        [[0, 0], [-26, -14], [-22, 16], [-50, -26], [-46, 30], [-72, 6]].forEach(([dx, dy], i) => {
            const x = fx + dx * s, y = fy + dy * s, flap = Math.sin(time * 9 + i * 1.7) * 5 * s, span = 8 * s;
            g.moveTo(x - span, y + flap); g.quadraticCurveTo(x - span / 2, y + 2 * s, x, y);
            g.quadraticCurveTo(x + span / 2, y + 2 * s, x + span, y + flap);
        });
        g.stroke();
    }

    /** World-space parallax city, drawn behind hoops; `unit` converts world units to pixels. */
    drawCity(g: Graphics, cameraX: number, unit: number, halfWidth: number, time: number): void {
        const lit = this.litAt(time), colors = [this.sky.far, this.sky.mid, this.sky.near];
        this.layers.forEach((layer, index) => {
            this.drawLayer(g, layer, colors[index], cameraX, unit, halfWidth, time, lit);
            if (index === 1) this.drawRail(g, cameraX, unit, halfWidth, time);
        });
    }

    private drawLayer(g: Graphics, layer: Layer, base: Color, cameraX: number, unit: number, halfWidth: number,
        time: number, lit: number): void {
        const scroll = ((cameraX * layer.speed) % layer.period + layer.period) % layer.period;
        const shade = hex(T.silhouetteShade), moonlight = hex(T.moonlight), tone = new Color();
        const windowColors = [hex(T.lamp), hex(T.lampDim), hex(T.moon)];
        for (const copy of [-layer.period, 0, layer.period]) {
            const dx = copy - scroll;
            const visible = (s: Span) => (s.x + dx + s.w) * unit >= -halfWidth && (s.x + dx) * unit <= halfWidth;
            if ((dx + layer.period) * unit < -halfWidth || dx * unit > halfWidth) continue;
            layer.tones.forEach((piece, i) => {
                // Tone 0 catches a little moonlight, tone 2 sits a step deeper in shadow.
                if (i === 0) Color.lerp(tone, base, moonlight, .05); else Color.lerp(tone, base, shade, i === 2 ? .08 : 0);
                g.fillColor = tone; g.strokeColor = tone;
                // Graphics.fill() with no new path re-fills the previous paths, so fill only when something was added.
                let any = false;
                for (const s of piece.rects) if (visible(s)) { g.rect((s.x + dx) * unit, s.y * unit, s.w * unit, s.h * unit); any = true; }
                for (const p of piece.polys) if (visible(p)) { this.path(g, p.pts, dx, unit, true); any = true; }
                if (any) g.fill();
                for (const l of piece.lines) if (visible(l)) { g.lineWidth = Math.max(1, l.width * unit); this.path(g, l.pts, dx, unit, false); g.stroke(); }
            });
            // Each window switches on its own delay so the city wakes and sleeps gradually; a few flip by themselves.
            windowColors.forEach((c, warmth) => {
                c.a = Math.round(layer.windowAlpha * (warmth === 2 ? .8 : 1) * 255); g.fillColor = c;
                let any = false;
                for (const w of layer.windows) {
                    if (w.warmth !== warmth || !visible(w)) continue;
                    const share = this.litFrom + (lit - this.litFrom) * Math.min(1, Math.max(0, (time - this.started - w.delay) / .4));
                    const flicker = hash(w.seed + Math.floor((time + w.seed) / w.period)) < WINDOW_FLICKER;
                    if ((w.rank < share) === flicker) continue;
                    g.rect((w.x + dx) * unit, w.y * unit, w.w * unit, w.h * unit); any = true;
                }
                if (any) g.fill();
            });
            const lamp = hex(T.lamp);
            for (const f of layer.faces) if (visible({ x: f.x - f.r, w: f.r * 2 })) {
                lamp.a = 150; g.fillColor = lamp; g.circle((f.x + dx) * unit, f.y * unit, f.r * unit); g.fill();
                g.strokeColor = base; g.lineWidth = Math.max(1, .03 * unit);
                g.moveTo((f.x + dx) * unit, f.y * unit); g.lineTo((f.x + dx) * unit, (f.y + f.r * .7) * unit);
                g.moveTo((f.x + dx) * unit, f.y * unit); g.lineTo((f.x + dx + f.r * .5) * unit, f.y * unit); g.stroke();
            }
            for (const l of layer.glows) if (visible({ x: l.x - .3, w: .6 })) {
                for (const [radius, alpha] of [[.3, 16], [.18, 26], [.09, 44], [.035, 235]]) {
                    lamp.a = alpha; g.fillColor = lamp; g.circle((l.x + dx) * unit, l.y * unit, radius * unit); g.fill();
                }
            }
            const edge = hex(T.moonlight); edge.a = 70; g.strokeColor = edge;
            for (const e of layer.edges) if (visible(e)) { g.lineWidth = Math.max(1, e.width * unit); this.path(g, e.pts, dx, unit, false); g.stroke(); }
        }
    }

    /** Light-rail viaduct between the mid and near layers; every 30 s a train with lit carriages crosses it. */
    private drawRail(g: Graphics, cameraX: number, unit: number, halfWidth: number, time: number): void {
        const deck = GROUND + 1.25, colour = new Color(), half = halfWidth / unit;
        Color.lerp(colour, this.sky.mid, this.sky.near, .5);
        g.fillColor = colour;
        g.rect(-halfWidth, deck * unit, halfWidth * 2, .08 * unit);
        const offset = ((cameraX * .3) % 3 + 3) % 3;
        for (let x = -half - offset; x < half + 3; x += 3) g.rect(x * unit, GROUND * unit, .1 * unit, (deck - GROUND) * unit);
        g.fill();
        const cycle = time % 30, crossing = 10, cars = 4, car = 1.3, length = cars * (car + .06);
        if (cycle > crossing) return;
        const head = -half - length + cycle / crossing * (half * 2 + length * 2);
        g.fillColor = colour;
        for (let i = 0; i < cars; i++) g.roundRect((head - i * (car + .06) - car) * unit, (deck + .1) * unit, car * unit, .28 * unit, .06 * unit);
        g.fill();
        const lamp = hex(T.lamp); lamp.a = 170; g.fillColor = lamp;
        for (let i = 0; i < cars; i++) for (let k = 0; k < 6; k++)
            g.rect((head - i * (car + .06) - car + .1 + k * .2) * unit, (deck + .22) * unit, .12 * unit, .09 * unit);
        g.fill();
        lamp.a = 40; g.fillColor = lamp; g.circle(head * unit, (deck + .22) * unit, .22 * unit); g.fill();
    }

    private path(g: Graphics, pts: number[], dx: number, unit: number, close: boolean): void {
        g.moveTo((pts[0] + dx) * unit, pts[1] * unit);
        for (let i = 2; i < pts.length; i += 2) g.lineTo((pts[i] + dx) * unit, pts[i + 1] * unit);
        if (close) g.close();
    }

    private litAt(time: number): number {
        const t = Math.min(1, Math.max(0, (time - this.started) / DUNK_TIME_TRANSITION));
        return this.litFrom + (this.target.lit - this.litFrom) * t;
    }

    private resolve(stage: DunkTimeStage): DunkSky {
        const top = hex(stage.skyTop), bottom = hex(stage.skyBottom), shade = hex(T.silhouetteShade);
        // Silhouettes start from the mid-sky hue so dusk stays a dark violet city, not an orange wall.
        const horizon = new Color(); Color.lerp(horizon, bottom, top, .55);
        const grey = Math.round((horizon.r + horizon.g + horizon.b) / 3);
        Color.lerp(horizon, horizon, new Color(grey, grey, grey + 6, 255), DUNK_SKYLINE_DESATURATE);
        const layer = (amount: number) => { const c = new Color(); Color.lerp(c, horizon, shade, amount); return c; };
        return { top, bottom, far: layer(DUNK_SKYLINE_SHADE.far), mid: layer(DUNK_SKYLINE_SHADE.mid),
            near: layer(DUNK_SKYLINE_SHADE.near), stars: stage.stars, moonHeight: stage.moonHeight, moonAlpha: stage.moonAlpha };
    }

    private copy(s: DunkSky): DunkSky {
        return { top: s.top.clone(), bottom: s.bottom.clone(), far: s.far.clone(), mid: s.mid.clone(), near: s.near.clone(),
            stars: s.stars, moonHeight: s.moonHeight, moonAlpha: s.moonAlpha };
    }
}
