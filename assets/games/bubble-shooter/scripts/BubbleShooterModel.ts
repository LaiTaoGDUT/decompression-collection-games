/** Engine-independent cloud prototype. Numbers are tuning defaults, not frozen balance. */
export type BubbleColor = 'red' | 'yellow' | 'blue' | 'purple';
export interface Cell { row: number; col: number; }
export interface Bubble extends Cell {
    /** Campaign identity survives movement, recoloring and board reconstruction. */
    id?: string;
    color: BubbleColor;
    frosted: boolean;
    /** Alternate active palette color; switching never invokes matching. */
    runeNext?: BubbleColor;
    /** Neutral solid cells retain a color for rendering, but never participate in color matching. */
    indestructible?: true;
    /** Scattered ocean stones, distinct from complete pressure support rows. */
    solidKind?: 'ocean';
}
export interface Point { x: number; y: number; }
export interface Shot { points: Point[]; cell: Cell; }
export interface ShotResult { removed: Bubble[]; dropped: Bubble[]; thawed: Bubble[]; }
export const COLUMNS = 13;
export const DIAMETER = 720 / COLUMNS;
export const ROW_HEIGHT = DIAMETER * Math.sqrt(3) / 2;
// The playfield can be wider than the fixed 13-column hex grid without enlarging bubbles.
export const BOARD_WIDTH = 750;
// Center limit: the projectile outer edge touches the playfield boundary.
export const WALL = (BOARD_WIDTH - DIAMETER) / 2;
export const TOP = 410;
export const DANGER = -280;
export const MAX_ROW = Math.ceil((TOP - DANGER - DIAMETER / 2) / ROW_HEIGHT);
export const PIVOT = { x: 0, y: -398 };
export const MUZZLE_OFFSET = 0;
export const SHOT_SPEED = 1550;
export const MAX_AIM_ANGLE = 70;
export const COLORS: readonly BubbleColor[] = ['red', 'yellow', 'blue', 'purple'];
const key = (c: Cell): string => `${c.row}:${c.col}`;
export function position(c: Cell, phase = 0): Point {
    return { x: (c.col - (COLUMNS - 1 - (c.row + phase) % 2) / 2) * DIAMETER, y: TOP - c.row * ROW_HEIGHT };
}
export function valid(c: Cell, phase = 0): boolean {
    return Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row <= MAX_ROW && c.col >= 0 && c.col < COLUMNS - (c.row + phase) % 2;
}
export function neighbors(c: Cell, phase = 0): Cell[] {
    const shift = (c.row + phase) % 2 === 0 ? -1 : 0;
    return [
        { row: c.row, col: c.col - 1 }, { row: c.row, col: c.col + 1 },
        { row: c.row - 1, col: c.col + shift }, { row: c.row - 1, col: c.col + shift + 1 },
        { row: c.row + 1, col: c.col + shift }, { row: c.row + 1, col: c.col + shift + 1 },
    ].filter(cell => valid(cell, phase));
}
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export class BubbleShooterModel {
    private readonly cells = new Map<string, Bubble>();
    private phase = 0;
    private version = 0;
    private geometryVersion = -1;
    private geometry: { bubble: Bubble; center: Point }[] = [];
    /** Changes invalidate aim results even when only color or support changes. */
    get revision(): number { return this.version; }
    private traceGeometry(): { bubble: Bubble; center: Point }[] {
        if (this.geometryVersion !== this.version) {
            this.geometry = Array.from(this.cells.values()).sort((a, b) => a.row - b.row || a.col - b.col)
                .map(bubble => ({ bubble, center: this.position(bubble) }));
            this.geometryVersion = this.version;
        }
        return this.geometry;
    }
    get rowPhase(): number { return this.phase; }
    position(cell: Cell): Point { return position(cell, this.phase); }
    neighbors(cell: Cell): Cell[] { return neighbors(cell, this.phase); }
    constructor(bubbles: readonly Bubble[] = []) { this.reset(bubbles); }
    reset(bubbles: readonly Bubble[], phase = 0): void {
        if (phase !== 0 && phase !== 1) throw new Error('Invalid row phase.');
        const next = new Map<string, Bubble>();
        bubbles.forEach(b => {
            if (!Number.isInteger(b.row) || !Number.isInteger(b.col) || !valid(b, phase) || next.has(key(b))
                || COLORS.indexOf(b.color) < 0 || typeof b.frosted !== 'boolean'
                || (b.indestructible !== undefined && b.indestructible !== true)
                || (b.solidKind !== undefined && (b.solidKind !== 'ocean' || !b.indestructible))
                || (b.indestructible && b.frosted)
                || (b.runeNext !== undefined && (COLORS.indexOf(b.runeNext)<0 || b.runeNext===b.color || b.indestructible || b.frosted))
                || 'support' in b) throw new Error('Invalid or duplicate bubble cell.');
            next.set(key(b), { ...b });
        });
        this.version++;
        this.geometry = [];
        this.phase = phase;
        this.cells.clear(); next.forEach((b, k) => this.cells.set(k, b));
    }
    get bubbles(): Bubble[] { return Array.from(this.cells.values(), b => ({ ...b })); }
    get removableBubbles(): Bubble[] { return this.bubbles.filter(b => !b.indestructible); }
    get nearDanger(): boolean {
        if (this.danger) return false;
        for (const b of this.cells.values()) {
            if (TOP - b.row * ROW_HEIGHT - DIAMETER / 2 - ROW_HEIGHT <= DANGER) return true;
        }
        return false;
    }
    get danger(): boolean {
        for (const b of this.cells.values()) {
            if (TOP - b.row * ROW_HEIGHT - DIAMETER / 2 <= DANGER) return true;
        }
        return false;
    }
    supply(random: () => number = Math.random): BubbleColor {
        const choices = this.removableBubbles.map(b => b.color);
        return choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]! : 'red';
    }

    insertRow(random: () => number = Math.random, palette: readonly BubbleColor[] = COLORS): void {
        if (this.danger) throw new Error('Cannot insert after danger crossing.');
        const shifted = this.bubbles.map(b => ({ ...b, row: b.row + 1 }));
        const nextPhase = 1 - this.phase;
        for (let col = 0; col < COLUMNS - nextPhase; col++) {
            shifted.push({ row: 0, col, color: palette[Math.min(palette.length-1, Math.floor(random() * palette.length))]!, frosted: false });
        }
        this.reset(shifted, nextPhase);
    }

    insertSupportRow(): void {
        if (this.danger) throw new Error('Cannot insert support after danger.');
        const phase = 1 - this.phase;
        const shifted = this.bubbles.map(b => ({ ...b, row: b.row + 1 }));
        for (let col = 0; col < COLUMNS - phase; col++) {
            shifted.push({ row: 0, col, color: 'red', frosted: false, indestructible: true });
        }
        this.reset(shifted, phase);
    }

    matchingCount(cell: Cell, color: BubbleColor): number {
        return this.flood(this.neighbors(cell), b => !b.indestructible && !b.frosted && b.color === color).size;
    }

    /** Trace real rays around geometric visibility boundaries, including narrow reflected openings. */
    reachableShots(): Shot[] {
        const limit = MAX_AIM_ANGLE * Math.PI / 180;
        const angles = new Set<number>([-limit, 0, limit]);
        const centers = this.traceGeometry().map(entry => entry.center);
        const cells = new Map<string, Cell>();
        this.bubbles.forEach(b => this.neighbors(b).forEach(c => cells.set(key(c), c)));
        for (let col = 0; col < COLUMNS - this.phase; col++) cells.set(`0:${col}`, { row: 0, col });
        const add = (angle: number) => { if (Number.isFinite(angle) && Math.abs(angle) <= limit) angles.add(angle); };
        // Unfold the wall reflections. Circle tangencies and intersections bound exposed arcs.
        const copies = Math.ceil((TOP - PIVOT.y) * Math.tan(limit) / (WALL * 2)) + 1;
        for (let copy = -copies; copy <= copies; copy++) {
            const imageX = (x: number) => copy * WALL * 2 + (copy % 2 === 0 ? x : -x);
            const images = centers.map(p => ({ x: imageX(p.x), y: p.y }));
            Array.from(cells.values()).forEach(c => { const p = this.position(c); add(Math.atan2(imageX(p.x), p.y - PIVOT.y)); });
            images.forEach((p, i) => {
                const length = Math.hypot(p.x, p.y - PIVOT.y), angle = Math.atan2(p.x, p.y - PIVOT.y);
                if (length > DIAMETER) { const tangent = Math.asin(DIAMETER / length); add(angle - tangent); add(angle + tangent); }
                for (let j = i + 1; j < images.length; j++) {
                    const q = images[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
                    if (d === 0 || d > DIAMETER * 2) continue;
                    const h = Math.sqrt(Math.max(0, DIAMETER * DIAMETER - d * d / 4));
                    for (const sign of [-1, 1]) add(Math.atan2((p.x + q.x) / 2 - sign * dy * h / d,
                        (p.y + q.y) / 2 + sign * dx * h / d - PIVOT.y));
                }
            });
        }
        const boundaries = Array.from(angles).sort((a, b) => a - b);
        const result = new Map<string, Shot>();
        const trace = (angle: number) => { const shot = this.trace({ x: Math.sin(angle), y: Math.cos(angle) }); if (shot) result.set(key(shot.cell), shot); };
        for (let i = 0; i < boundaries.length; i++) {
            trace(boundaries[i]);
            if (i + 1 < boundaries.length) {
                const from = boundaries[i], to = boundaries[i + 1];
                // Subdivide within each visible arc to cover snapping transitions, rather than a coarse fixed cone.
                const slices = Math.max(2, Math.ceil((to - from) / .002));
                for (let j = 1; j < slices; j++) trace(from + (to - from) * j / slices);
                trace(from + Math.min(1e-7, (to - from) / 4)); trace(to - Math.min(1e-7, (to - from) / 4));
            }
        }
        return Array.from(result.values()).sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col);
    }

    /** Continuous ray / expanded-circle intersection. All wall reflections up to the ceiling within the supported aim cone. */
    trace(direction: Point): Shot | undefined {
        const length = Math.hypot(direction.x, direction.y);
        if (!Number.isFinite(length) || length === 0 || direction.y <= 0 || Math.abs(direction.x) > direction.y * Math.tan(MAX_AIM_ANGLE * Math.PI / 180) + 1e-8) return undefined;
        let dx = direction.x / length;
        const dy = direction.y / length;
        let origin = { x: PIVOT.x + dx * MUZZLE_OFFSET, y: PIVOT.y + dy * MUZZLE_OFFSET };
        const points: Point[] = [{ ...origin }];
        const bubbles = this.traceGeometry();
        if (bubbles.some(({ center }) => distance(center, origin) < DIAMETER - 1e-6)) return undefined;
        // Bound by total horizontal travel before TOP; include the first partial wall span.
        const maxBounces = Math.ceil((TOP-origin.y) * Math.abs(dx) / (dy * WALL * 2)) + 1;
        for (let bounce = 0; bounce <= maxBounces; bounce++) {
            const wallTime = Math.abs(dx) < 1e-10 ? Infinity : ((dx > 0 ? WALL : -WALL) - origin.x) / dx;
            const topTime = (TOP - origin.y) / dy;
            let time = topTime;
            let hit: Bubble | undefined;
            for (const { bubble: b, center } of bubbles) {
                const rx = origin.x - center.x, ry = origin.y - center.y;
                const projection = rx * dx + ry * dy;
                const discriminant = projection * projection - (rx * rx + ry * ry - DIAMETER * DIAMETER);
                if (discriminant < 0) continue;
                const t = -projection - Math.sqrt(discriminant);
                if (t >= -1e-7 && t < time) { time = Math.max(0, t); hit = b; }
            }
            if (wallTime < time - 1e-7) {
                origin = { x: origin.x + dx * wallTime, y: origin.y + dy * wallTime };
                points.push({ ...origin });
                dx = -dx;
                continue;
            }
            const contact = { x: origin.x + dx * time, y: origin.y + dy * time };
            const candidates = hit ? this.neighbors(hit) : Array.from({ length: COLUMNS - this.phase }, (_, col) => ({ row: 0, col }));
            const reachable = candidates.filter(c => {
                if (this.cells.has(key(c))) return false;
                const target = this.position(c);
                // Snap may project around the contacted bubble, but cannot cross a different bubble.
                const vx = target.x - contact.x, vy = target.y - contact.y;
                const squared = vx * vx + vy * vy;
                return bubbles.every(({ bubble: b, center }) => {
                    if (b === hit) return true;
                    const t = squared ? Math.max(0, Math.min(1, ((center.x-contact.x)*vx+(center.y-contact.y)*vy)/squared)) : 0;
                    return distance(center, { x: contact.x + vx*t, y: contact.y + vy*t }) >= DIAMETER - 1e-5;
                });
            }).sort((a,b) => distance(this.position(a), contact) - distance(this.position(b), contact) || a.row-b.row || a.col-b.col);
            if (!reachable.length) return undefined;
            points.push(contact);
            points.push(this.position(reachable[0]!));
            return { points, cell: { ...reachable[0]! } };
        }
        return undefined;
    }

    settle(cell: Cell, color: BubbleColor, id?: string): ShotResult {
        if (!valid(cell, this.phase) || this.cells.has(key(cell))) throw new Error('Cannot settle into occupied/invalid cell.');
        if (cell.row !== 0 && !this.neighbors(cell).some(c => this.cells.has(key(c)))) throw new Error('Bubble requires support on landing.');
        this.version++;
        this.cells.set(key(cell), { ...cell, color, frosted: false, ...(id ? { id } : {}) });
        const group = this.flood([cell], b => !b.indestructible && !b.frosted && b.color === color);
        const result: ShotResult = { removed: [], dropped: [], thawed: [] };
        if (group.size < 3) return result;
        group.forEach(k => {
            const bubble = this.cells.get(k)!;
            result.removed.push({ ...bubble });
            this.neighbors(bubble).forEach(c => {
                const neighbor = this.cells.get(key(c));
                if (neighbor?.frosted) {
                    neighbor.frosted = false;
                    result.thawed.push({ ...neighbor });
                }
            });
        });
        group.forEach(k => this.cells.delete(k));
        result.dropped = this.collectUnsupported();
        return result;
    }
    applyFrost(targets: readonly Cell[]): Bubble[] {
        this.version++;
        const changed: Bubble[] = [];
        targets.forEach(cell => {
            const bubble = this.cells.get(key(cell));
            if (bubble && !bubble.indestructible && !bubble.frosted) { bubble.frosted = true; changed.push({ ...bubble }); }
        });
        return changed;
    }

    bombTargets(cell: Cell): Bubble[] {
        // Two hexagonal rings; preview and detonation share this exact footprint.
        const first = this.neighbors(cell);
        const targets = new Set([key(cell), ...first.map(key)]);
        first.forEach(center=>this.neighbors(center).forEach(next=>targets.add(key(next))));
        return this.removableBubbles.filter(b => targets.has(key(b)));
    }

    bottomTargets(): Bubble[] {
        const removable = this.removableBubbles;
        const rows = Array.from(new Set(removable.map(b => b.row))).sort((a, b) => b - a).slice(0, 2);
        return removable.filter(b => rows.indexOf(b.row) >= 0);
    }

    wildcardColor(cell: Cell, fallback: BubbleColor): BubbleColor {
        let chosen = fallback;
        let count = 0;
        for (const color of COLORS) {
            const candidate = this.matchingCount(cell, color);
            if (candidate > count) { count = candidate; chosen = color; }
        }
        return chosen;
    }

    clearTargets(targets: readonly Cell[]): ShotResult {
        this.version++;
        const removed: Bubble[] = [];
        for (const cell of targets) {
            const bubble = this.cells.get(key(cell));
            if (bubble && !bubble.indestructible) { removed.push({ ...bubble }); this.cells.delete(key(cell)); }
        }
        if (!removed.length) return { removed: [], dropped: [], thawed: [] };
        return { removed, dropped: this.collectUnsupported(), thawed: [] };
    }

    /** Convert existing colored cells into permanent neutral support, without moving the grid. */
    petrify(targets: readonly Cell[], cap: number): Bubble[] {
        if (!Number.isInteger(cap) || cap < 0) throw new Error('Invalid ocean stone cap.');
        this.version++;
        let count=this.bubbles.filter(b=>b.solidKind==='ocean').length;
        const changed: Bubble[]=[];
        for(const target of targets){
            if(count>=cap)break;
            const bubble=this.cells.get(key(target));
            if(!bubble || bubble.indestructible)continue;
            bubble.indestructible=true; bubble.solidKind='ocean'; bubble.color='red'; bubble.frosted=false;
            count++;changed.push({...bubble});
        }
        return changed;
    }

    switchRunes(): Bubble[] {
        this.version++;
        const changed: Bubble[]=[];
        this.cells.forEach(b=>{if(b.runeNext){const previous=b.color;b.color=b.runeNext;b.runeNext=previous;changed.push({...b});}});
        return changed;
    }

    /** Move each segment simultaneously, from its leading edge; no wrap or auto-match. */
    slideRails(rails: readonly { row: number; start: number; end: number; direction: number }[]): { moved: { from: Cell; to: Cell; id?: string }[]; dropped: Bubble[] } {
        this.version++;
        const moved: { from: Cell; to: Cell; id?: string }[] = [];
        for (const rail of rails) {
            const step = rail.direction;
            for (let col = step > 0 ? rail.end : rail.start; col >= rail.start && col <= rail.end; col -= step) {
                const from = { row: rail.row, col }, to = { row: rail.row, col: col + step };
                const bubble = this.cells.get(key(from));
                if (!bubble || bubble.indestructible || to.col < rail.start || to.col > rail.end || this.cells.has(key(to))) continue;
                this.cells.delete(key(from));
                this.cells.set(key(to), { ...bubble, ...to });
                moved.push({ from, to, ...(bubble.id ? { id: bubble.id } : {}) });
            }
        }
        return { moved, dropped: this.collectUnsupported() };
    }

    private collectUnsupported(): Bubble[] {
        // Scattered ocean stones conduct support through neighbors; they are not floating roots.
        // Complete pressure rows remain support roots.
        const supported = this.flood(this.bubbles.filter(b => b.row === 0
            || (b.indestructible && b.solidKind !== 'ocean')), () => true);
        const dropped = this.bubbles.filter(b => !supported.has(key(b)));
        dropped.forEach(b => this.cells.delete(key(b)));
        return dropped;
    }

    private flood(seeds: Cell[], accepts: (bubble: Bubble) => boolean): Set<string> {
        const found = new Set<string>();
        const queue = seeds.slice();
        for (let i=0; i<queue.length; i++) {
            const cell = queue[i]!;
            const k = key(cell), bubble = this.cells.get(k);
            if (!bubble || found.has(k) || !accepts(bubble)) continue;
            found.add(k);
            queue.push(...this.neighbors(cell));
        }
        return found;
    }
}
