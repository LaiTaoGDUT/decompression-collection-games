import type { MultiColorFillLevel } from './MultiColorFillLevels';

export interface MultiColorFillSnapshot {
    readonly levelId: string;
    readonly paths: readonly (readonly number[])[];
    readonly activated?: readonly boolean[];
    readonly elapsed: number;
    readonly strokes: number;
    readonly hints: number;
}

export type FillMove = 'extended' | 'backtracked' | 'blocked' | 'unchanged';
interface FillRouteState { readonly paths: number[][]; readonly activated: boolean[]; }

/** 路线的统一校验入口，续玩、提示和题库验收都遵守相同的棋盘规则。 */
export function validateFillPaths(level: MultiColorFillLevel, value: unknown, complete = false): value is number[][] {
    if (!Array.isArray(value) || value.length !== level.starts.length) return false;
    const occupied = new Set<number>();
    const blocked = new Set(level.blocked);
    for (let color = 0; color < value.length; color += 1) {
        const path = value[color];
        if (!Array.isArray(path) || !path.length || path[0] !== level.starts[color]) return false;
        for (let i = 0; i < path.length; i += 1) {
            const cell = path[i];
            if (!Number.isInteger(cell) || cell < 0 || cell >= level.width * level.height
                || occupied.has(cell) || blocked.has(cell)) return false;
            if (i > 0 && !fillCellsAdjacent(level.width, path[i - 1], cell)) return false;
            occupied.add(cell);
        }
    }
    return !complete || occupied.size === level.width * level.height - level.blocked.length;
}

export function fillCellsAdjacent(width: number, a: number, b: number): boolean {
    return Math.abs(a % width - b % width) + Math.abs(Math.floor(a / width) - Math.floor(b / width)) === 1;
}

function copyPaths(paths: readonly (readonly number[])[]): number[][] {
    return paths.map(path => Array.from(path));
}

function counter(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 纯玩法模型。沿上下左右铺满棋盘；题库的每色长度只用于已验证答案和提示。 */
export class MultiColorFillModel {
    private routes: number[][];
    private activated: boolean[];
    private readonly owners: number[];
    private beforeStroke?: FillRouteState;
    private readonly history: FillRouteState[] = [];
    private activeColor = -1;
    private selectedColor = 0;
    elapsed = 0;
    strokes = 0;
    hints = 0;

    constructor(readonly level: MultiColorFillLevel, saved?: unknown) {
        if (!validateFillPaths(level, level.solution, true)) throw new Error(`Invalid Fill level: ${level.id}`);
        this.routes = level.starts.map(cell => [cell]);
        this.activated = level.starts.map(() => false);
        this.owners = Array(level.width * level.height).fill(-1);
        if (saved && typeof saved === 'object') {
            const record = saved as Record<string, unknown>;
            if (record.levelId === level.id && validateFillPaths(level, record.paths)) {
                this.routes = copyPaths(record.paths);
                const flags = record.activated;
                this.activated = this.routes.map((path, c) => path.length > 1
                    || (Array.isArray(flags) && flags.length === this.routes.length && flags[c] === true));
                this.elapsed = counter(record.elapsed);
                this.strokes = Math.floor(counter(record.strokes));
                this.hints = Math.floor(counter(record.hints));
            }
        }
        this.rebuildOwners();
    }

    get paths(): readonly (readonly number[])[] { return this.routes; }
    get drawingColor(): number { return this.activeColor; }
    get canUndo(): boolean { return this.history.length > 0 || !!this.beforeStroke; }
    get filled(): number { return this.routes.reduce((sum, path) => sum + path.length, 0); }
    get total(): number { return this.level.width * this.level.height - this.level.blocked.length; }
    get completed(): boolean {
        return this.filled === this.total && this.activated.every(Boolean);
    }

    ownerAt(cell: number): number { return this.owners[cell] ?? -1; }
    remainingFor(color: number): number { return Math.max(0, this.level.solution[color].length - this.routes[color].length); }

    startStroke(cell: number): boolean {
        if (this.completed || this.beforeStroke || !Number.isInteger(cell)) return false;
        const color = this.ownerAt(cell);
        if (color < 0) return false;
        this.beforeStroke = this.copyState();
        // 原版选中起点即建立路线；即使只剩起点本身，也不额外要求两格长度。
        this.activated[color] = true;
        this.activeColor = color;
        this.selectedColor = color;
        // 从已有路线中途接着画，后半段立即退回；整个手势可一次撤销。
        this.routes[color].length = this.routes[color].indexOf(cell) + 1;
        this.rebuildOwners();
        return true;
    }

    moveTo(cell: number): FillMove {
        const color = this.activeColor;
        if (color < 0 || !Number.isInteger(cell)) return 'unchanged';
        const path = this.routes[color];
        const end = path[path.length - 1];
        if (cell === end) return 'unchanged';
        if (cell < 0 || cell >= this.owners.length || this.level.blocked.indexOf(cell) >= 0
            || !fillCellsAdjacent(this.level.width, end, cell)) return 'blocked';
        const owner = this.ownerAt(cell);
        if (owner === color) {
            path.length = path.indexOf(cell) + 1;
            this.rebuildOwners();
            return 'backtracked';
        }
        if (this.level.starts.indexOf(cell) >= 0) return 'blocked';
        // 原作允许重画经过别的路线，交点以后的旧路线退回；其他颜色的起点始终保留。
        if (owner >= 0) this.routes[owner].length = this.routes[owner].indexOf(cell);
        path.push(cell);
        this.rebuildOwners();
        return 'extended';
    }

    endStroke(): boolean {
        const before = this.beforeStroke;
        this.beforeStroke = undefined;
        this.activeColor = -1;
        if (!before || (this.pathsEqual(before.paths, this.routes)
            && before.activated.every((flag, c) => flag === this.activated[c]))) return false;
        this.remember(before);
        this.strokes += 1;
        return true;
    }

    cancelStroke(): void {
        if (this.beforeStroke) this.restoreState(this.beforeStroke);
        this.beforeStroke = undefined;
        this.activeColor = -1;
        this.rebuildOwners();
    }

    undo(): boolean {
        this.endStroke();
        const previous = this.history.pop();
        if (!previous) return false;
        this.restoreState(previous);
        this.strokes += 1;
        this.rebuildOwners();
        return true;
    }

    /** 校正与已验证解法不一致的后缀，再补一格；无运行时随机题或阻塞式求解。 */
    hint(): { readonly applied: boolean; readonly corrected: boolean; readonly color: number } {
        this.endStroke();
        if (this.completed) return { applied: false, corrected: false, color: -1 };
        const before = this.copyState();
        let corrected = false;
        for (let c = 0; c < this.routes.length; c += 1) {
            const path = this.routes[c], solution = this.level.solution[c];
            let prefix = 1;
            while (prefix < path.length && path[prefix] === solution[prefix]) prefix += 1;
            if (prefix < path.length) { path.length = prefix; corrected = true; }
        }
        let color = this.selectedColor;
        if (this.remainingFor(color) === 0) color = this.routes.findIndex((path, c) => path.length < this.level.lengths[c]);
        if (color < 0) return { applied: false, corrected, color };
        this.routes[color].push(this.level.solution[color][this.routes[color].length]);
        this.activated[color] = true;
        this.selectedColor = color;
        this.remember(before);
        this.hints += 1;
        this.strokes += 1;
        this.rebuildOwners();
        return { applied: true, corrected, color };
    }

    snapshot(): MultiColorFillSnapshot {
        return { levelId: this.level.id, paths: copyPaths(this.routes), activated: Array.from(this.activated),
            elapsed: this.elapsed, strokes: this.strokes, hints: this.hints };
    }

    private rebuildOwners(): void {
        this.owners.fill(-1);
        this.routes.forEach((path, color) => path.forEach(cell => { this.owners[cell] = color; }));
    }

    private copyState(): FillRouteState { return { paths: copyPaths(this.routes), activated: Array.from(this.activated) }; }
    private restoreState(state: FillRouteState): void { this.routes = state.paths; this.activated = state.activated; }
    private remember(state: FillRouteState): void {
        this.history.push(state);
        if (this.history.length > 64) this.history.shift();
    }

    private pathsEqual(a: number[][], b: number[][]): boolean {
        return a.every((path, c) => path.length === b[c].length && path.every((cell, i) => cell === b[c][i]));
    }
}
