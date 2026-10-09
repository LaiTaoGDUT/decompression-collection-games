/**
 * 原作默认提示流程：已有猫补叉 → 纠正错叉 → R1 必然放置 → R2 行列/颜色锁定
 * → R3/R4 集合锁定（2～6 个颜色）→ 最短 R4_chain/R5_chain 矛盾链。
 * 提示只读取当前棋盘。答案仅用于原作的错叉纠正，不参与后续逻辑推理。
 */

export const SOLVER_UNKNOWN = 0;
export const SOLVER_CAT = 1;
export const SOLVER_EXCLUDED = 2;
/** 红叉不可撤销，不能与玩家手动叉混为一谈。 */
export const SOLVER_ERROR = 3;

export type MeowdokuSolverCell = number;
export type MeowdokuSolverBoard = readonly (readonly MeowdokuSolverCell[])[];

export type MeowdokuUnitType = 'row' | 'col' | 'region';

export interface MeowdokuSolverUnit {
    readonly type: MeowdokuUnitType;
    readonly index: number;
}

export type MeowdokuHintAction = 'mark' | 'place' | 'unmark';

/** 提示里的文案 key，对应原作本地化表的同名条目。 */
export type MeowdokuHintKey =
    | 'HINT_WRONG_MARK'
    | 'HINT_R1_MARK'
    | 'HINT_R1_MARK_COMBINE'
    | 'HINT_REGION_ONLY'
    | 'HINT_FULL_LINE'
    | 'HINT_R2A_ROW'
    | 'HINT_R2A_COL'
    | 'HINT_SET_LOCKING'
    | 'HINT_R3_ROW'
    | 'HINT_R3_COL'
    | 'HINT_CONTRADICTION';

export interface MeowdokuHint {
    readonly action: MeowdokuHintAction;
    /** `place` 时要放猫的格子。 */
    readonly cell: readonly [number, number];
    /** 要叉掉的格子。 */
    readonly markCells: readonly (readonly [number, number])[];
    /** 触发这条提示的推理单元。 */
    readonly unit: MeowdokuSolverUnit | null;
    readonly key: MeowdokuHintKey;
    /** 文案里 `%s` / `%d` 的替换值。 */
    readonly args: readonly (string | number)[];
    /** 原作策略码，用于规则回归和难度计算。 */
    readonly strategy?: string;
    /** 假设目标格放猫后，连续推导出的必然落点和最终矛盾单元。 */
    readonly chain?: {
        readonly steps: readonly (readonly [number, number])[];
        readonly contradiction: MeowdokuSolverUnit;
    };
}

type Cell = [number, number];

function keyOf(cell: Cell): number {
    return cell[0] * 100 + cell[1];
}

/** 每一行 / 每一列 / 每一种颜色。 */
export function meowdokuUnits(
    size: number,
    regions: readonly (readonly number[])[],
): readonly MeowdokuSolverUnit[] {
    const units: MeowdokuSolverUnit[] = [];
    for (let index = 0; index < size; index += 1) units.push({ type: 'row', index });
    for (let index = 0; index < size; index += 1) units.push({ type: 'col', index });
    for (let index = 0; index < size; index += 1) units.push({ type: 'region', index });
    return units;
}

export function meowdokuUnitCells(
    size: number,
    regions: readonly (readonly number[])[],
    unit: MeowdokuSolverUnit,
): readonly Cell[] {
    const cells: Cell[] = [];
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (unit.type === 'row' && row !== unit.index) continue;
            if (unit.type === 'col' && col !== unit.index) continue;
            if (unit.type === 'region' && regions[row]![col] !== unit.index) continue;
            cells.push([row, col]);
        }
    }
    return cells;
}

export function meowdokuUnitLabel(unit: MeowdokuSolverUnit): { key: string; args: (string | number)[] } {
    if (unit.type === 'row') return { key: 'HINT_ROW', args: [unit.index + 1] };
    if (unit.type === 'col') return { key: 'HINT_COL', args: [unit.index + 1] };
    return { key: 'HINT_REGION_UNIT', args: [''] };
}

interface SolverContext {
    readonly size: number;
    readonly regions: readonly (readonly number[])[];
    readonly board: number[][];
    /** 是否把「同色格」也一起排除（原作 `hint_func = VALUE_COLOR_EXCLUDE`，默认关）。 */
    readonly includeRegion?: boolean;
}

function buildContext(
    size: number,
    regions: readonly (readonly number[])[],
    board: MeowdokuSolverBoard,
): SolverContext {
    const work: number[][] = [];
    for (let row = 0; row < size; row += 1) {
        const source = board[row] ?? [];
        const line: number[] = [];
        for (let col = 0; col < size; col += 1) line.push(source[col] ?? SOLVER_UNKNOWN);
        work.push(line);
    }
    return { size, regions, board: work };
}

function placedCats(context: SolverContext): Cell[] {
    const cats: Cell[] = [];
    for (let row = 0; row < context.size; row += 1) {
        for (let col = 0; col < context.size; col += 1) {
            if (context.board[row]![col] === SOLVER_CAT) cats.push([row, col]);
        }
    }
    return cats;
}

/** 该格是否还能放猫：同行、同列、同色、八邻格都没有猫。 */
function canPlace(context: SolverContext, row: number, col: number): boolean {
    const regions = context.regions;
    const regionId = regions[row]![col]!;
    for (const [r, c] of placedCats(context)) {
        if (r === row && c === col) continue;
        if (regions[r]![c] === regionId) return false;
        if (r === row || c === col) return false;
        if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) return false;
    }
    return true;
}

function unitHasCat(context: SolverContext, unit: MeowdokuSolverUnit): boolean {
    return meowdokuUnitCells(context.size, context.regions, unit)
        .some(([row, col]) => context.board[row]![col] === SOLVER_CAT);
}

function unitCandidates(context: SolverContext, unit: MeowdokuSolverUnit): Cell[] {
    const out: Cell[] = [];
    for (const [row, col] of meowdokuUnitCells(context.size, context.regions, unit)) {
        if (context.board[row]![col] !== SOLVER_UNKNOWN) continue;
        if (!canPlace(context, row, col)) continue;
        out.push([row, col]);
    }
    return out;
}

/** 规则 1：某只猫的同行、同列、同色与八邻格都可以排除。 */
/**
 * 原作 `HintEngine.find_mark_hint`：按扫描顺序找到第一只猫，把它**所在行、所在列、
 * 八邻格**（以及开启颜色排除时的同色格）里还没被排除的空格作为要叉的格子。
 *
 * 注意原作只取「这一只猫周围」的格子，而不是整盘所有不可能放猫的格子 ——
 * 之前按整盘取最多格会高亮出一大片和原作完全不同的位置。
 */
function findMarkHint(context: SolverContext): MeowdokuHint | undefined {
    const size = context.size;
    const includeRegion = context.includeRegion ?? false;
    for (const [row, col] of placedCats(context)) {
        const seen = new Set<number>();
        const markCells: Cell[] = [];
        const push = (r: number, c: number): void => {
            if (r < 0 || r >= size || c < 0 || c >= size) return;
            if (r === row && c === col) return;
            if (context.board[r]![c] !== SOLVER_UNKNOWN) return;
            const key = r * 100 + c;
            if (seen.has(key)) return;
            seen.add(key);
            markCells.push([r, c]);
        };
        // 同行、同列
        for (let c = 0; c < size; c += 1) push(row, c);
        for (let r = 0; r < size; r += 1) push(r, col);
        // 八邻格（斜着相邻也不行）
        for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
                if (dr === 0 && dc === 0) continue;
                push(row + dr, col + dc);
            }
        }
        if (includeRegion) {
            const regionId = context.regions[row]![col]!;
            for (let r = 0; r < size; r += 1) {
                for (let c = 0; c < size; c += 1) {
                    if (context.regions[r]![c] === regionId) push(r, c);
                }
            }
        }
        if (markCells.length === 0) continue;
        return {
            action: 'mark',
            cell: [row, col],
            markCells,
            unit: { type: 'region', index: context.regions[row]![col]! },
            key: includeRegion ? 'HINT_R1_MARK_COMBINE' : 'HINT_R1_MARK',
            args: [],
            strategy: 'R1_mark',
        };
    }
    return undefined;
}

/** 原版在补叉之后、所有推理之前纠正玩家误叉的答案格。 */
function findWrongMarkHint(context: SolverContext, solution?: readonly number[]): MeowdokuHint | undefined {
    if (!solution) return undefined;
    for (let row = 0; row < context.size; row += 1) {
        const col = solution[row];
        if (col === undefined || context.board[row]![col] !== SOLVER_EXCLUDED) continue;
        return {
            action: 'unmark', cell: [row, col], markCells: [], unit: null,
            key: 'HINT_WRONG_MARK', args: [], strategy: 'R1',
        };
    }
    return undefined;
}

/** R1：同色完整行列的交点优先，再找行、列、颜色的唯一候选。 */
function findPlaceHint(context: SolverContext): MeowdokuHint | undefined {
    const { size, regions, board } = context;
    for (let row = 0; row < size; row += 1) {
        const region = regions[row]![0]!;
        if (!regions[row]!.every((id) => id === region)) continue;
        if (unitHasCat(context, { type: 'region', index: region })) continue;
        for (let col = 0; col < size; col += 1) {
            if (board[row]![col] !== SOLVER_UNKNOWN || !canPlace(context, row, col)) continue;
            if (!regions.every((line) => line[col] === region)) continue;
            return {
                action: 'place', cell: [row, col], markCells: [],
                unit: { type: 'region', index: region }, key: 'HINT_FULL_LINE', args: [], strategy: 'R1',
            };
        }
    }
    for (const unit of meowdokuUnits(size, regions)) {
        if (unitHasCat(context, unit)) continue;
        const candidates = unitCandidates(context, unit);
        if (candidates.length !== 1) continue;
        return {
            action: 'place', cell: candidates[0]!, markCells: [], unit,
            key: 'HINT_REGION_ONLY', args: [], strategy: 'R1',
        };
    }
    return undefined;
}

/** R2 扫描顺序与原版一致：颜色→行、颜色→列、行→颜色、列→颜色。 */
function findLockingHint(context: SolverContext): MeowdokuHint | undefined {
    const { size, regions, board } = context;
    const regionCandidates = Array.from({ length: size }, (_, index) => {
        const unit: MeowdokuSolverUnit = { type: 'region', index };
        return unitHasCat(context, unit) ? [] : unitCandidates(context, unit);
    });
    for (const axis of ['row', 'col'] as const) {
        const coordinate = axis === 'row' ? 0 : 1;
        for (let region = 0; region < size; region += 1) {
            const candidates = regionCandidates[region]!;
            if (candidates.length <= 1) continue;
            const line = candidates[0]![coordinate];
            if (!candidates.every((cell) => cell[coordinate] === line)) continue;
            const markCells = meowdokuUnitCells(size, regions, { type: axis, index: line })
                .filter(([r, c]) => regions[r]![c] !== region && board[r]![c] === SOLVER_UNKNOWN);
            if (!markCells.length) continue;
            return {
                action: 'mark', cell: candidates[0]!, markCells,
                unit: { type: 'region', index: region },
                key: axis === 'row' ? 'HINT_R2A_ROW' : 'HINT_R2A_COL',
                args: ['', line + 1], strategy: 'R2',
            };
        }
    }
    for (const axis of ['row', 'col'] as const) {
        const coordinate = axis === 'row' ? 0 : 1;
        for (let line = 0; line < size; line += 1) {
            const unit: MeowdokuSolverUnit = { type: axis, index: line };
            if (unitHasCat(context, unit)) continue;
            const candidates = unitCandidates(context, unit);
            if (candidates.length <= 1) continue;
            const region = regions[candidates[0]![0]]![candidates[0]![1]]!;
            if (!candidates.every(([r, c]) => regions[r]![c] === region)) continue;
            // 原版用合法候选判断是否有新结论，再把该颜色线外的所有空格标记。
            if (!regionCandidates[region]!.some((cell) => cell[coordinate] !== line)) continue;
            const markCells = meowdokuUnitCells(size, regions, { type: 'region', index: region })
                .filter((cell) => cell[coordinate] !== line && board[cell[0]]![cell[1]] === SOLVER_UNKNOWN);
            return {
                action: 'mark', cell: candidates[0]!, markCells, unit,
                key: 'HINT_SET_LOCKING', args: [], strategy: 'R2',
            };
        }
    }
    return undefined;
}

function subsets(values: readonly number[], count: number): number[][] {
    const result: number[][] = [];
    const selected: number[] = [];
    const visit = (start: number): void => {
        if (selected.length === count) {
            result.push(selected.slice());
            return;
        }
        for (let i = start; i <= values.length - (count - selected.length); i += 1) {
            selected.push(values[i]!);
            visit(i + 1);
            selected.pop();
        }
    };
    visit(0);
    return result;
}

/** R3/R4：k 种颜色必须占满 k 行/列，k 从 2 扫到 min(剩余颜色数 - 1, 6)。 */
function findSetHint(context: SolverContext): MeowdokuHint | undefined {
    const { size, regions, board } = context;
    const candidates = new Map<number, Cell[]>();
    for (let index = 0; index < size; index += 1) {
        const unit: MeowdokuSolverUnit = { type: 'region', index };
        if (!unitHasCat(context, unit)) candidates.set(index, unitCandidates(context, unit));
    }
    const ids = Array.from(candidates.keys());
    for (let count = 2; count <= Math.min(ids.length - 1, 6); count += 1) {
        for (const selected of subsets(ids, count)) {
            const selectedRegions = new Set(selected);
            const merged: Cell[] = [];
            for (const id of selected) merged.push(...candidates.get(id)!);
            for (const axis of ['row', 'col'] as const) {
                const coordinate = axis === 'row' ? 0 : 1;
                const lines = new Set(merged.map((cell) => cell[coordinate]));
                if (lines.size !== count) continue;
                const markCells: Cell[] = [];
                for (const line of lines) {
                    for (const [r, c] of meowdokuUnitCells(size, regions, { type: axis, index: line })) {
                        if (!selectedRegions.has(regions[r]![c]!) && board[r]![c] === SOLVER_UNKNOWN) {
                            markCells.push([r, c]);
                        }
                    }
                }
                if (!markCells.length) continue;
                return {
                    action: 'mark', cell: merged[0]!, markCells,
                    unit: { type: 'region', index: selected[0]! },
                    key: axis === 'row' ? 'HINT_R3_ROW' : 'HINT_R3_COL',
                    args: [count, count, count], strategy: count <= 3 ? 'R3' : 'R4',
                };
            }
        }
    }
    return undefined;
}

interface ChainState {
    candidates: boolean[][];
    rows: boolean[];
    cols: boolean[];
    regions: boolean[];
}

function placeChainCat(context: SolverContext, state: ChainState, row: number, col: number): void {
    const region = context.regions[row]![col]!;
    state.rows[row] = true;
    state.cols[col] = true;
    state.regions[region] = true;
    for (let r = 0; r < context.size; r += 1) {
        for (let c = 0; c < context.size; c += 1) {
            if (r === row && c === col) continue;
            if (r === row || c === col || context.regions[r]![c] === region
                || (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1)) {
                state.candidates[r]![c] = false;
            }
        }
    }
}

/** 原版矛盾链：每轮先检查零候选，再按行/列/颜色补一个唯一候选，直到停止或矛盾。 */
function findContradictionHint(context: SolverContext): MeowdokuHint | undefined {
    const { size, regions, board } = context;
    const base: ChainState = {
        candidates: board.map((line) => line.map((value) => value === SOLVER_UNKNOWN || value === SOLVER_CAT)),
        rows: new Array<boolean>(size).fill(false),
        cols: new Array<boolean>(size).fill(false),
        regions: new Array<boolean>(size).fill(false),
    };
    for (const [r, c] of placedCats(context)) placeChainCat(context, base, r, c);
    const units = meowdokuUnits(size, regions).map((unit) => ({
        unit, cells: meowdokuUnitCells(size, regions, unit),
    }));
    let best: MeowdokuHint | undefined;
    let bestDepth = Number.POSITIVE_INFINITY;
    for (let row = 0; row < size; row += 1) {
        if (base.rows[row]) continue;
        for (let col = 0; col < size; col += 1) {
            if (!base.candidates[row]![col]) continue;
            const state: ChainState = {
                candidates: base.candidates.map((line) => line.slice()),
                rows: base.rows.slice(), cols: base.cols.slice(), regions: base.regions.slice(),
            };
            placeChainCat(context, state, row, col);
            const steps: Cell[] = [];
            while (steps.length < bestDepth) {
                let single: Cell | undefined;
                let contradiction: MeowdokuSolverUnit | undefined;
                for (const { unit, cells } of units) {
                    const occupied = unit.type === 'row' ? state.rows : unit.type === 'col' ? state.cols : state.regions;
                    if (occupied[unit.index]) continue;
                    let count = 0;
                    let candidate: Cell | undefined;
                    for (const [r, c] of cells) {
                        if (!state.candidates[r]![c]) continue;
                        count += 1;
                        candidate = [r, c];
                    }
                    if (count === 0) {
                        contradiction = unit;
                        break;
                    }
                    if (count === 1 && !single) single = candidate;
                }
                if (contradiction) {
                    bestDepth = steps.length;
                    best = {
                        action: 'mark', cell: [row, col], markCells: [[row, col]], unit: contradiction,
                        key: 'HINT_CONTRADICTION', args: [bestDepth],
                        strategy: bestDepth <= 2 ? 'R4_chain' : 'R5_chain',
                        chain: { steps, contradiction },
                    };
                    break;
                }
                if (!single) break;
                steps.push(single);
                placeChainCat(context, state, single[0], single[1]);
            }
            // 深度 0 已是最短；相同深度仍优先行优先扫描到的第一个格子。
            if (bestDepth === 0) return best;
        }
    }
    return best;
}

/** solution 仅用于纠正手动错叉；纯推理和难度计算可不传。 */
export function solveMeowdokuHint(
    board: MeowdokuSolverBoard,
    size: number,
    regions: readonly (readonly number[])[],
    solution?: readonly number[],
): MeowdokuHint | undefined {
    const context = buildContext(size, regions, board);
    return findMarkHint(context)
        ?? findWrongMarkHint(context, solution)
        ?? findPlaceHint(context)
        ?? findLockingHint(context)
        ?? findSetHint(context)
        ?? findContradictionHint(context);
}

export interface MeowdokuRankResult {
    /** `row,col` → 该猫在第几步被推理出来；越大越难找。 */
    readonly ranks: ReadonlyMap<number, number>;
    readonly maxRank: number;
}

/**
 * 复现原作 `HintEngine.compute_cell_ranks` 的用途：在空棋盘上反复跑推理，
 * 记录每只猫是在第几步被“必然放置”推出来的。找不到（需要假设枚举）的猫记最大值。
 */
export function computeMeowdokuCellRanks(
    board: MeowdokuSolverBoard,
    size: number,
    regions: readonly (readonly number[])[],
    solution: readonly number[],
): MeowdokuRankResult {
    const context = buildContext(size, regions, board);
    const ranks = new Map<number, number>();
    for (let row = 0; row < size; row += 1) {
        const col = solution[row]!;
        if (context.board[row]![col] === SOLVER_CAT) ranks.set(keyOf([row, col]), 1);
    }

    let currentMax = 1;
    let guard = size * size * 8;
    while (guard > 0) {
        guard -= 1;
        const markHint = findMarkHint(context);
        if (markHint) {
            for (const [row, col] of markHint.markCells) {
                if (context.board[row]![col] === SOLVER_UNKNOWN) context.board[row]![col] = SOLVER_EXCLUDED;
            }
            continue;
        }
        const placeHint = findPlaceHint(context);
        if (placeHint) {
            const [row, col] = placeHint.cell;
            context.board[row]![col] = SOLVER_CAT;
            if (solution[row] === col && !ranks.has(keyOf([row, col]))) {
                ranks.set(keyOf([row, col]), currentMax);
            }
            currentMax = 1;
            continue;
        }
        const lockingHint = findLockingHint(context);
        if (lockingHint) {
            for (const [row, col] of lockingHint.markCells) {
                if (context.board[row]![col] === SOLVER_UNKNOWN) context.board[row]![col] = SOLVER_EXCLUDED;
            }
            currentMax = Math.max(currentMax, 2);
            continue;
        }
        const pairHint = findSetHint(context);
        if (pairHint?.strategy === 'R3') {
            for (const [row, col] of pairHint.markCells) {
                if (context.board[row]![col] === SOLVER_UNKNOWN) context.board[row]![col] = SOLVER_EXCLUDED;
            }
            currentMax = Math.max(currentMax, 3);
            continue;
        }
        break;
    }

    let maxRank = 1;
    for (let row = 0; row < size; row += 1) {
        const col = solution[row]!;
        const key = keyOf([row, col]);
        if (!ranks.has(key)) ranks.set(key, 4);
        maxRank = Math.max(maxRank, ranks.get(key)!);
    }
    return { ranks, maxRank };
}

/** 从棋盘状态数组构造求解器输入。 */
export function solverBoardFromCells(
    size: number,
    cells: readonly string[],
): MeowdokuSolverBoard {
    const board: number[][] = [];
    for (let row = 0; row < size; row += 1) {
        const line: number[] = [];
        for (let col = 0; col < size; col += 1) {
            const value = cells[row * size + col];
            line.push(value === 'cat'
                ? SOLVER_CAT
                : value === undefined || value === 'empty'
                    ? SOLVER_UNKNOWN
                    : value === 'error' ? SOLVER_ERROR : SOLVER_EXCLUDED);
        }
        board.push(line);
    }
    return board;
}
