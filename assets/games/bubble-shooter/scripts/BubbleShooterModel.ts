/** Engine-independent cloud prototype. Numbers are tuning defaults, not frozen balance. */
export type BubbleColor = 'red' | 'yellow' | 'blue' | 'purple';
export interface Cell { row: number; col: number; }
export type BubbleSupport = 'seaweed' | 'tentacle';
export interface Bubble extends Cell { color: BubbleColor; frosted: boolean; support?: BubbleSupport; }
export interface Point { x: number; y: number; }
export interface Shot { points: Point[]; cell: Cell; }
export interface ShotResult { removed: Bubble[]; dropped: Bubble[]; thawed: Bubble[]; }
export const COLUMNS = 13;
export const DIAMETER = 720 / COLUMNS;
export const ROW_HEIGHT = DIAMETER * Math.sqrt(3) / 2;
export const BOARD_WIDTH = COLUMNS * DIAMETER;
// Center limit: the projectile outer edge touches the same boundary as a full row.
export const WALL = (BOARD_WIDTH - DIAMETER) / 2;
export const TOP = 410;
export const DANGER = -280;
export const MAX_ROW = Math.ceil((TOP - DANGER - DIAMETER / 2) / ROW_HEIGHT);
export const PIVOT = { x: 0, y: -398 };
export const MUZZLE_OFFSET = 0;
export const COLORS: readonly BubbleColor[] = ['red', 'yellow', 'blue', 'purple'];
const key = (c: Cell): string => `${c.row}:${c.col}`;
export function position(c: Cell, phase = 0): Point {
    return { x: (c.col - (COLUMNS - 1 - (c.row + phase) % 2) / 2) * DIAMETER, y: TOP - c.row * ROW_HEIGHT };
}
export function valid(c: Cell, phase = 0): boolean {
    return c.row >= 0 && c.row <= MAX_ROW && c.col >= 0 && c.col < COLUMNS - (c.row + phase) % 2;
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
    private ceiling = 0;
    get ceilingRow(): number { return this.ceiling; }
    get rowPhase(): number { return this.phase; }
    position(cell: Cell): Point { return position(cell, this.phase); }
    neighbors(cell: Cell): Cell[] { return neighbors(cell, this.phase).filter(c=>c.row>=this.ceiling); }
    constructor(bubbles: readonly Bubble[] = []) { this.reset(bubbles); }
    reset(bubbles: readonly Bubble[], phase = 0, ceiling = 0): void {
        if(!Number.isInteger(ceiling) || ceiling<0 || ceiling>MAX_ROW)throw new Error('Invalid ceiling.');
        this.ceiling=ceiling;
        this.phase = phase;
        this.cells.clear();
        bubbles.forEach(b => {
            if (b.row<this.ceiling || !valid(b, this.phase) || this.cells.has(key(b))
                || (b.support !== undefined && b.support !== 'seaweed' && b.support !== 'tentacle')) throw new Error('Invalid or duplicate bubble cell.');
            this.cells.set(key(b), { ...b });
        });
    }
    get bubbles(): Bubble[] { return Array.from(this.cells.values(), b => ({ ...b })); }
    get nearDanger(): boolean {
        return !this.danger && this.bubbles.some(b => this.position(b).y - DIAMETER / 2 - ROW_HEIGHT <= DANGER);
    }
    get danger(): boolean { return this.bubbles.some(b => this.position(b).y - DIAMETER / 2 <= DANGER); }
    supply(random: () => number = Math.random): BubbleColor {
        const choices = this.bubbles.map(b => b.color);
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

    descend(): void {
        if(this.danger || this.ceiling>=MAX_ROW)throw new Error('Cannot descend after danger.');
        this.reset(this.bubbles.map(b=>({...b,row:b.row+1})),1-this.phase,this.ceiling+1);
    }

    matchingCount(cell: Cell, color: BubbleColor): number {
        return this.flood(this.neighbors(cell), b => !b.frosted && b.color === color).size;
    }

    /** Continuous ray / expanded-circle intersection. One reflection in this prototype. */
    trace(direction: Point): Shot | undefined {
        const length = Math.hypot(direction.x, direction.y);
        if (!Number.isFinite(length) || length === 0 || direction.y <= 0) return undefined;
        let dx = direction.x / length;
        const dy = direction.y / length;
        let origin = { x: PIVOT.x + dx * MUZZLE_OFFSET, y: PIVOT.y + dy * MUZZLE_OFFSET };
        const points: Point[] = [{ ...origin }];
        const bubbles = this.bubbles;
        if (bubbles.some(b => distance(this.position(b), origin) < DIAMETER - 1e-6)) return undefined;
        for (let bounce = 0; bounce <= 1; bounce++) {
            const wallTime = Math.abs(dx) < 1e-10 ? Infinity : ((dx > 0 ? WALL : -WALL) - origin.x) / dx;
            const topTime = (TOP - this.ceiling*ROW_HEIGHT - origin.y) / dy;
            let time = topTime;
            let hit: Bubble | undefined;
            for (const b of bubbles) {
                const center = this.position(b);
                const rx = origin.x - center.x, ry = origin.y - center.y;
                const projection = rx * dx + ry * dy;
                const discriminant = projection * projection - (rx * rx + ry * ry - DIAMETER * DIAMETER);
                if (discriminant < 0) continue;
                const t = -projection - Math.sqrt(discriminant);
                if (t >= -1e-7 && t < time) { time = Math.max(0, t); hit = b; }
            }
            if (wallTime < time - 1e-7) {
                if (bounce === 1) return undefined;
                origin = { x: origin.x + dx * wallTime, y: origin.y + dy * wallTime };
                points.push({ ...origin });
                dx = -dx;
                continue;
            }
            const contact = { x: origin.x + dx * time, y: origin.y + dy * time };
            const candidates = hit ? this.neighbors(hit) : Array.from({ length: COLUMNS - (this.ceiling+this.phase)%2 }, (_, col) => ({ row: this.ceiling, col }));
            const reachable = candidates.filter(c => {
                if (this.cells.has(key(c))) return false;
                const target = this.position(c);
                // Snap may project around the contacted bubble, but cannot cross a different bubble.
                const vx = target.x - contact.x, vy = target.y - contact.y;
                const squared = vx * vx + vy * vy;
                return bubbles.every(b => {
                    if (b === hit) return true;
                    const center = this.position(b);
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

    settle(cell: Cell, color: BubbleColor): ShotResult {
        if (cell.row<this.ceiling || !valid(cell, this.phase) || this.cells.has(key(cell))) throw new Error('Cannot settle into occupied/invalid cell.');
        if (cell.row !== this.ceiling && !this.neighbors(cell).some(c => this.cells.has(key(c)))) throw new Error('Bubble requires support on landing.');
        this.cells.set(key(cell), { ...cell, color, frosted: false });
        const group = this.flood([cell], b => !b.frosted && b.color === color);
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
        const changed: Bubble[] = [];
        targets.forEach(cell => {
            const bubble = this.cells.get(key(cell));
            if (bubble && !bubble.frosted) { bubble.frosted = true; changed.push({ ...bubble }); }
        });
        return changed;
    }

    bombTargets(cell: Cell): Bubble[] {
        const targets = new Set(this.neighbors(cell).map(key));
        return this.bubbles.filter(b => targets.has(key(b)));
    }

    bottomTargets(): Bubble[] {
        const rows = Array.from(new Set(this.bubbles.map(b => b.row))).sort((a, b) => b - a).slice(0, 2);
        return this.bubbles.filter(b => rows.indexOf(b.row) >= 0);
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
        const removed: Bubble[] = [];
        for (const cell of targets) {
            const bubble = this.cells.get(key(cell));
            if (bubble) { removed.push({ ...bubble }); this.cells.delete(key(cell)); }
        }
        if (!removed.length) return { removed: [], dropped: [], thawed: [] };
        return { removed, dropped: this.collectUnsupported(), thawed: [] };
    }

    /** Ocean roots remain normal matching bubbles. Roots cannot attach to empty cells or exceed the cap. */
    applySupport(targets: readonly Cell[], support: BubbleSupport, cap: number): Bubble[] {
        if ((support !== 'seaweed' && support !== 'tentacle') || !Number.isInteger(cap) || cap < 0)
            throw new Error('Invalid bubble support configuration.');
        let count = this.bubbles.filter(b => b.support !== undefined).length;
        const changed: Bubble[] = [];
        for (const target of targets) {
            if (count >= cap) break;
            const bubble = this.cells.get(key(target));
            if (!bubble || bubble.frosted || bubble.support) continue;
            bubble.support = support; count++; changed.push({ ...bubble });
        }
        return changed;
    }

    /** Release roots atomically, then evaluate all remaining roots before any bubble drops. */
    releaseSupport(targets: readonly Cell[]): Bubble[] {
        let changed = false;
        for (const target of targets) {
            const bubble = this.cells.get(key(target));
            if (bubble?.support) { delete bubble.support; changed = true; }
        }
        return changed ? this.collectUnsupported() : [];
    }

    private collectUnsupported(): Bubble[] {
        const supported = this.flood(this.bubbles.filter(b => b.row === this.ceiling || b.support !== undefined), () => true);
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
