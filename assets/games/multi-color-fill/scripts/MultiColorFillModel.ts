import type { MultiColorFillLevel } from './MultiColorFillLevels';

export interface MultiColorFillSnapshot {
    readonly levelId: string;
    readonly paths: readonly (readonly number[])[];
    readonly activated: readonly boolean[];
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

/** 续玩只接受完整棋盘快照；损坏或开发期缺字段的棋盘直接丢弃。 */
export function validateFillSnapshot(level: MultiColorFillLevel, value: unknown): value is MultiColorFillSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (record.levelId !== level.id || !validateFillPaths(level, record.paths)
        || !Array.isArray(record.activated) || record.activated.length !== level.starts.length) return false;
    const flags = record.activated;
    return record.paths.every((path, color) => typeof flags[color] === 'boolean' && (path.length === 1 || flags[color]))
        && typeof record.elapsed === 'number' && Number.isFinite(record.elapsed) && record.elapsed >= 0
        && Number.isInteger(record.strokes) && (record.strokes as number) >= 0
        && Number.isInteger(record.hints) && (record.hints as number) >= 0;
}

/** 纯玩法模型。沿上下左右铺满棋盘；题库的每色长度只用于已验证答案和提示。 */
export class MultiColorFillModel {
    private routes: number[][];
    private activated: boolean[];
    private readonly owners: Int16Array;
    private readonly positions: Int16Array;
    private readonly blocked: Uint8Array;
    private readonly starts: Uint8Array;
    private filledCells = 0;
    private pathRevision = 0;
    private beforeStroke?: FillRouteState;
    private readonly history: FillRouteState[] = [];
    private activeColor = -1;
    private selectedColor = 0;
    private assistingColor = -1;
    elapsed = 0;
    strokes = 0;
    hints = 0;

    constructor(readonly level: MultiColorFillLevel, saved?: unknown) {
        if (!validateFillPaths(level, level.solution, true)) throw new Error(`Invalid Fill level: ${level.id}`);
        this.routes = level.starts.map(cell => [cell]);
        this.activated = level.starts.map(() => false);
        const cells = level.width * level.height;
        this.owners = new Int16Array(cells);
        this.positions = new Int16Array(cells);
        this.blocked = new Uint8Array(cells);
        this.starts = new Uint8Array(cells);
        level.blocked.forEach(cell => { this.blocked[cell] = 1; });
        level.starts.forEach(cell => { this.starts[cell] = 1; });
        if (validateFillSnapshot(level, saved)) {
            this.routes = copyPaths(saved.paths);
            this.activated = Array.from(saved.activated);
            this.elapsed = saved.elapsed;
            this.strokes = saved.strokes;
            this.hints = saved.hints;
        }
        this.rebuildOwners();
    }

    get paths(): readonly (readonly number[])[] { return this.routes; }
    /** 只有路线/激活状态变化时递增，渲染层据此复用静止几何。 */
    get revision(): number { return this.pathRevision; }
    get drawingColor(): number { return this.activeColor; }
    get canUndo(): boolean { return this.history.length > 0 || !!this.beforeStroke; }
    get filled(): number { return this.filledCells; }
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
        this.truncateRoute(color, this.positions[cell] + 1);
        this.pathRevision += 1;
        return true;
    }

    moveTo(cell: number): FillMove {
        const color = this.activeColor;
        if (color < 0 || !Number.isInteger(cell)) return 'unchanged';
        const path = this.routes[color];
        const end = path[path.length - 1];
        if (cell === end) return 'unchanged';
        if (cell < 0 || cell >= this.owners.length || this.blocked[cell]
            || !fillCellsAdjacent(this.level.width, end, cell)) return 'blocked';
        const owner = this.ownerAt(cell);
        if (owner === color) {
            this.truncateRoute(color, this.positions[cell] + 1);
            this.pathRevision += 1;
            return 'backtracked';
        }
        if (this.starts[cell]) return 'blocked';
        // 原作允许重画经过别的路线，交点以后的旧路线退回；其他颜色的起点始终保留。
        if (owner >= 0) this.truncateRoute(owner, this.positions[cell]);
        this.owners[cell] = color;
        this.positions[cell] = path.length;
        path.push(cell);
        this.filledCells += 1;
        this.pathRevision += 1;
        return 'extended';
    }

    /**
     * 手指拖动入口：斜穿格角时先补一个拐角格，再进入目标格；所有落格仍走 moveTo 的同一套规则。
     * 拐角优先空格，其次本色回退，最后覆盖他色，墙和起点不作拐角。
     */
    dragTo(cell: number): FillMove {
        const color = this.activeColor;
        if (color < 0 || !Number.isInteger(cell) || cell < 0 || cell >= this.owners.length) return this.moveTo(cell);
        const path = this.routes[color], end = path[path.length - 1], width = this.level.width;
        const dx = cell % width - end % width, dy = Math.floor(cell / width) - Math.floor(end / width);
        if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return this.moveTo(cell);
        const horizontal = end + dx, vertical = end + dy * width;
        const hRank = this.cornerRank(horizontal, color), vRank = this.cornerRank(vertical, color);
        // 同优先级仍先横后竖，与原有稳定排序一致；每个采样点不再创建数组和排序回调。
        const firstCorner = hRank >= 0 && (vRank < 0 || hRank <= vRank) ? horizontal : vRank >= 0 ? vertical : -1;
        const secondCorner = firstCorner === horizontal ? vertical : horizontal;
        for (let i = 0; i < 2; i++) {
            const corner = i === 0 ? firstCorner : secondCorner;
            if (corner < 0 || this.cornerRank(corner, color) < 0) continue;
            const first = this.moveTo(corner);
            if (first !== 'extended' && first !== 'backtracked') continue;
            const second = this.moveTo(cell);
            return second === 'extended' || second === 'backtracked' ? second : first;
        }
        return 'blocked';
    }

    private cornerRank(cell: number, color: number): number {
        if (this.blocked[cell] || this.starts[cell]) return -1;
        const owner = this.owners[cell];
        return owner < 0 ? 0 : owner === color ? 1 : 2;
    }

    endStroke(): boolean {
        if (this.assistingColor >= 0) {
            const path = this.routes[this.assistingColor], answer = this.level.solution[this.assistingColor];
            for (let index = path.length; index < answer.length; index++) this.moveTo(answer[index]);
            this.assistingColor = -1;
        }
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
        if (this.assistingColor >= 0) { this.hints -= 1; this.assistingColor = -1; }
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

    nextHintColor(): number {
        if (this.completed) return -1;
        const unfinished = (c: number): boolean => !this.activated[c]
            || this.routes[c].length !== this.level.solution[c].length
            || this.routes[c].some((cell, index) => cell !== this.level.solution[c][index]);
        return unfinished(this.selectedColor) ? this.selectedColor : this.routes.findIndex((_, c) => unfinished(c));
    }

    /** 提示复用真实拖动规则；只重画选中的颜色，碰到旧路线时按正常规则退回它的后缀。 */
    beginHint(): { readonly applied: boolean; readonly color: number; readonly route: readonly number[] } {
        this.endStroke();
        const color = this.nextHintColor();
        if (color < 0 || !this.startStroke(this.level.starts[color])) return { applied: false, color: -1, route: [] };
        this.assistingColor = color;
        this.hints += 1;
        return { applied: true, color, route: this.level.solution[color] };
    }

    hint(): { readonly applied: boolean; readonly color: number } {
        const result = this.beginHint();
        if (result.applied) this.endStroke();
        return result;
    }

    snapshot(completeHint = false): MultiColorFillSnapshot {
        const snapshot = { levelId: this.level.id, paths: copyPaths(this.routes), activated: Array.from(this.activated),
            elapsed: this.elapsed, strokes: this.strokes, hints: this.hints };
        if (!completeHint || this.assistingColor < 0) return snapshot;
        // 扣库存时就落盘完整的付费路线；意外退出/强杀后不会只拿到动画途中几格。
        const projected = new MultiColorFillModel(this.level, snapshot), color = this.assistingColor;
        projected.startStroke(this.level.starts[color]);
        this.level.solution[color].slice(1).forEach(cell => projected.moveTo(cell));
        projected.endStroke();
        return { ...projected.snapshot(), strokes: this.strokes + 1 };
    }

    private rebuildOwners(): void {
        this.owners.fill(-1);
        this.positions.fill(-1);
        this.filledCells = 0;
        this.routes.forEach((path, color) => {
            this.filledCells += path.length;
            path.forEach((cell, index) => { this.owners[cell] = color; this.positions[cell] = index; });
        });
        this.pathRevision += 1;
    }

    /** 只释放被截断的后缀；单格扩展不再清空并重扫整盘路线。 */
    private truncateRoute(color: number, length: number): void {
        const path = this.routes[color];
        for (let i = length; i < path.length; i++) {
            this.owners[path[i]] = -1;
            this.positions[path[i]] = -1;
        }
        this.filledCells -= path.length - length;
        path.length = length;
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
