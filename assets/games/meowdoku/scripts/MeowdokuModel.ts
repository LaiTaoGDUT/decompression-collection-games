import { MEOWDOKU_COLOR_MAP_RGB, meowdokuRegionPalette } from './MeowdokuTheme';
import type { MeowdokuLevelDefinition } from './MeowdokuLevels';

/**
 * 猫咪数独规则核心与单局状态。
 *
 * 规则与判定逻辑是原作 `scripts/module/gameplay/core/queendoku_core.gd` 的逐条移植：
 * 每行、每列、每种颜色各一只猫，且任意两只猫不能相邻（含对角）。
 *
 * 交互沿用原作 `game_page.gd` 的“不会失败”放置设计：只有解位能放下猫，
 * 放错位置只扣一点生命值并在该格留下红叉，因此棋盘上永远不会出现冲突的猫。
 * `findMeowdokuConflicts` 仍然保留，用于存档恢复和异常数据自检。
 *
 * 单局状态同时维护原作 `GameScoreModel` 的分数/连击，以及草稿模式下未提交的标记。
 */

/**
 * 真实格子状态。
 *
 * `error` 是原作 `CellState.ERROR`：放错位置后留下的**红叉**。
 * 它会一直留着（原作 `win_red_mark` 默认档 `KEEP_RED` 不会在通关时变白），
 * 而且点它没有任何反应——只有重开本关才会清掉。
 */
export type MeowdokuCellState = 'empty' | 'mark' | 'error' | 'cat';
/** 格子当前值（和 `MeowdokuCellState` 同义，保留别名便于阅读）。 */
export type MeowdokuCellValue = MeowdokuCellState;
export type MeowdokuDraftMark = 'mark' | 'cat';

/** 单击即时预览须等双击窗口结束才确认为手画叉；自动补叉独立统计。 */
export type MeowdokuMarkOrigin = 'manual' | 'auto' | 'tap-preview';

/** 与棋盘分开保存的操作记录；每关累计历史由游戏存档合并维护。 */
export interface MeowdokuChallengeHistory {
    readonly manualMarksUsed: boolean;
    readonly draftUsed: boolean;
    readonly wrongGuessMade: boolean;
}

/** 一次格子状态变更，供视图播放对应反馈。 */
export interface MeowdokuCellChange {
    readonly row: number;
    readonly col: number;
    readonly from: MeowdokuCellValue;
    readonly to: MeowdokuCellValue;
    /** `mark` 打叉、`unmark` 取消、`cat` 放猫、`wrong` 放错位置（红叉）。 */
    readonly kind: 'mark' | 'unmark' | 'cat' | 'wrong';
    /** 这个叉是手画还是自动补的。 */
    readonly origin?: MeowdokuMarkOrigin;
    /** 上一次的叉是自动补的（需要换一种画法重画）。 */
    readonly wasAuto?: boolean;
}

/** 关卡解码后的棋盘数据。 */
export interface MeowdokuLevelBoard {
    readonly level: number;
    readonly size: number;
    readonly rank: number;
    /** `regions[row][col]` 为颜色编号。 */
    readonly regions: readonly (readonly number[])[];
    /** `solution[row]` 为该行猫咪所在列。 */
    readonly solution: readonly number[];
    /** 颜色编号 → 区域色板槽位。 */
    readonly colorMap: readonly number[];
    /** 开局预置的猫咪位置（含难度助攻额外预置的那只）。 */
    readonly prefill: readonly (readonly [number, number])[];
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 原作 `health_points_rule` 默认档 `{1,end,3}`：每关 3 点生命值。 */
export const MEOWDOKU_DEFAULT_LIVES = 3;

function decodeDigit(char: string): number {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
        throw new Error(`Meowdoku level data contains an invalid digit "${char}".`);
    }
    return value;
}

/**
 * 区域配色映射：把颜色编号映射到色板槽位，尽量让相邻颜色在采样 RGB 空间里离得远。
 * 移植自原作 `LevelGenerator.compute_color_map`。
 */
export function computeMeowdokuColorMap(
    size: number,
    regions: readonly (readonly number[])[],
): readonly number[] {
    const rgb = MEOWDOKU_COLOR_MAP_RGB;
    const slotCount = rgb.length;
    const adjacency = new Map<number, Set<number>>();
    const touch = (a: number, b: number): void => {
        if (a === b) return;
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a)!.add(b);
        adjacency.get(b)!.add(a);
    };

    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            const current = regions[row]![col]!;
            if (col + 1 < size) touch(current, regions[row]![col + 1]!);
            if (row + 1 < size) touch(current, regions[row + 1]![col]!);
        }
    }

    // 原作按 `range(size)` 参与排序，没有相邻区域的编号同样要占一个槽位。
    const present = new Set<number>();
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) present.add(regions[row]![col]!);
    }
    const degreeOf = (id: number): number => adjacency.get(id)?.size ?? 0;
    const order = Array.from(present).sort((a, b) => {
        const da = degreeOf(a);
        const db = degreeOf(b);
        return da === db ? a - b : db - da;
    });

    const colorMap = new Map<number, number>();
    const used = new Set<number>();
    for (const regionId of order) {
        const neighborSlots = new Set<number>();
        (adjacency.get(regionId) ?? new Set<number>()).forEach((neighbor) => {
            const slot = colorMap.get(neighbor);
            if (slot !== undefined) neighborSlots.add(slot);
        });

        let bestSlot = 0;
        let bestDistance = -1;
        for (let slot = 0; slot < slotCount; slot += 1) {
            if (used.has(slot)) continue;
            let minDistance = Number.POSITIVE_INFINITY;
            if (neighborSlots.size > 0) {
                neighborSlots.forEach((other) => {
                    const dr = rgb[slot]![0] - rgb[other]![0];
                    const dg = rgb[slot]![1] - rgb[other]![1];
                    const db = rgb[slot]![2] - rgb[other]![2];
                    minDistance = Math.min(minDistance, Math.sqrt(dr * dr + dg * dg + db * db));
                });
            }
            if (minDistance > bestDistance) {
                bestDistance = minDistance;
                bestSlot = slot;
            }
        }
        colorMap.set(regionId, bestSlot);
        used.add(bestSlot);
    }

    const result: number[] = [];
    for (let index = 0; index < size; index += 1) {
        result.push(colorMap.get(index) ?? 0);
    }
    return Object.freeze(result);
}

/** 把关卡数据解码成棋盘结构，并校验题库合法性。 */
export function decodeMeowdokuLevel(
    definition: MeowdokuLevelDefinition,
    extraPrefill?: readonly [number, number],
): MeowdokuLevelBoard {
    const size = definition.size;
    if (size <= 0 || definition.regions.length !== size) {
        throw new Error(`Meowdoku level ${definition.level} has ${definition.regions.length} region rows for size ${size}.`);
    }
    const regions: number[][] = [];
    for (let row = 0; row < size; row += 1) {
        const encoded = definition.regions[row]!;
        if (encoded.length !== size) {
            throw new Error(`Meowdoku level ${definition.level} region row ${row} has ${encoded.length} columns for size ${size}.`);
        }
        regions.push(Array.from(encoded, decodeDigit));
    }
    if (definition.solution.length !== size) {
        throw new Error(`Meowdoku level ${definition.level} solution has ${definition.solution.length} rows for size ${size}.`);
    }
    const solution = Array.from(definition.solution, decodeDigit);
    for (let row = 0; row < size; row += 1) {
        const col = solution[row]!;
        if (col < 0 || col >= size) {
            throw new Error(`Meowdoku level ${definition.level} solution row ${row} points at column ${col}.`);
        }
    }

    const prefills: (readonly [number, number])[] = [];
    if (definition.prefill) {
        prefills.push(Object.freeze([definition.prefill[0], definition.prefill[1]] as [number, number]));
    }
    if (extraPrefill && !prefills.some(([r, c]) => r === extraPrefill[0] && c === extraPrefill[1])) {
        prefills.push(Object.freeze([extraPrefill[0], extraPrefill[1]] as [number, number]));
    }

    const board: MeowdokuLevelBoard = Object.freeze({
        level: definition.level,
        size,
        rank: definition.rank,
        regions: Object.freeze(regions.map((row) => Object.freeze(row))),
        solution: Object.freeze(solution),
        colorMap: computeMeowdokuColorMap(size, regions),
        prefill: Object.freeze(prefills),
    });

    if (!validateMeowdokuSolution(board)) {
        throw new Error(`Meowdoku level ${definition.level} solution violates the rules.`);
    }
    return board;
}

/** 两只猫是否互相冲突（同色/同行列/相邻），移植自 `QueendokuCore._classify_pair`。 */
export function areMeowdokuCatsInConflict(
    a: readonly [number, number],
    b: readonly [number, number],
    regions: readonly (readonly number[])[],
): boolean {
    if (regions[a[0]]![a[1]] === regions[b[0]]![b[1]]) return true;
    if (a[0] === b[0] || a[1] === b[1]) return true;
    return Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
}

/**
 * 一只猫排除掉的所有格子：同色、同行同列、周围八格。
 * 移植自 `QueendokuCore.cells_excluded_by_cat`。
 */
export function meowdokuCellsExcludedByCat(
    size: number,
    regions: readonly (readonly number[])[],
    cat: readonly [number, number],
): readonly (readonly [number, number])[] {
    const out: [number, number][] = [];
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            if (row === cat[0] && col === cat[1]) continue;
            if (areMeowdokuCatsInConflict([row, col], cat, regions)) out.push([row, col]);
        }
    }
    return out;
}

/** 找出所有冲突的猫；返回值是 `row,col` 键集合。移植自 `QueendokuCore.find_conflicts`。 */
export function findMeowdokuConflicts(
    size: number,
    regions: readonly (readonly number[])[],
    cats: readonly (readonly [number, number])[],
): ReadonlySet<string> {
    const conflicts = new Set<string>();
    for (let i = 0; i < cats.length; i += 1) {
        for (let j = i + 1; j < cats.length; j += 1) {
            if (!areMeowdokuCatsInConflict(cats[i]!, cats[j]!, regions)) continue;
            conflicts.add(`${cats[i]![0]},${cats[i]![1]}`);
            conflicts.add(`${cats[j]![0]},${cats[j]![1]}`);
        }
    }
    return conflicts;
}

/** 优先级最高的冲突猫，移植自 `QueendokuCore.find_priority_conflict_cat`。 */
export function findMeowdokuPriorityConflict(
    cell: readonly [number, number],
    placed: readonly (readonly [number, number])[],
    regions: readonly (readonly number[])[],
): readonly [number, number] | undefined {
    const rank = (a: readonly [number, number], b: readonly [number, number]): number => {
        if (regions[a[0]]![a[1]] === regions[b[0]]![b[1]]) return 1;
        if (a[0] === b[0] || a[1] === b[1]) return 2;
        if (Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1) return 3;
        return 0;
    };
    let best: readonly [number, number] | undefined;
    let bestRule = 0;
    let bestDistance = 0;
    let bestSameRow = false;
    for (const cat of placed) {
        const rule = rank(cell, cat);
        if (rule === 0) continue;
        const distance = Math.abs(cat[0] - cell[0]) + Math.abs(cat[1] - cell[1]);
        const sameRow = cat[0] === cell[0];
        const better = !best
            || rule < bestRule
            || (rule === bestRule && distance < bestDistance)
            || (rule === bestRule && distance === bestDistance && sameRow && !bestSameRow);
        if (better) {
            best = cat;
            bestRule = rule;
            bestDistance = distance;
            bestSameRow = sameRow;
        }
    }
    return best;
}

/** 题库自检：解位满足全部规则。移植自 `QueendokuCore.validate_solution_entry`。 */
export function validateMeowdokuSolution(board: MeowdokuLevelBoard): boolean {
    const cats: [number, number][] = [];
    for (let row = 0; row < board.size; row += 1) {
        cats.push([row, board.solution[row]!]);
    }
    if (cats.length !== board.size) return false;
    return findMeowdokuConflicts(board.size, board.regions, cats).size === 0;
}

/** 单局棋盘状态与操作。 */
export class MeowdokuModel {
    /** 草稿独立于正式棋盘；取消、离开关卡时丢弃，不写入存档。 */
    private readonly draft = new Map<number, MeowdokuDraftMark>();

    getDraft(row: number, col: number): MeowdokuDraftMark | undefined {
        return this.draft.get(row * this.size + col);
    }

    setDraft(row: number, col: number, mark?: MeowdokuDraftMark): boolean {
        if (!this.isInside(row, col) || this.getCell(row, col) !== 'empty') return false;
        const key = row * this.size + col;
        if (this.draft.get(key) === mark) return false;
        if (mark) {
            this.draftUsedValue = true;
            this.draft.set(key, mark);
        } else this.draft.delete(key);
        return true;
    }

    draftEntries(): readonly { row: number; col: number; mark: MeowdokuDraftMark }[] {
        return Array.from(this.draft.entries()).map(([key, mark]) => ({
            row: Math.floor(key / this.size), col: key % this.size, mark,
        }));
    }

    clearDraft(): void { this.draft.clear(); }

    /** 每个格子的叉是手点还是补出来的；只影响画法。 */
    private readonly markOrigins: (MeowdokuMarkOrigin | undefined)[];
    /** 只统计真实格子状态，草稿不进存档。 */
    private readonly cells: MeowdokuCellState[];

    private livesValue: number;
    private scoreValue = 0;
    private comboValue = 0;
    private maxComboValue = 0;
    private mistakesValue = 0;
    private elapsedMs = 0;
    /** 使用历史与当前格子分开保存，撤叉、取消草稿不能恢复专属奖励资格。 */
    private manualMarksUsedValue = false;
    private draftUsedValue = false;
    private wrongGuessMadeValue = false;

    get usedManualMarks(): boolean { return this.manualMarksUsedValue; }
    get usedDraft(): boolean { return this.draftUsedValue; }
    get hasWrongGuess(): boolean { return this.wrongGuessMadeValue; }

    recordDraftUse(): void { this.draftUsedValue = true; }

    restoreChallengeUsage(manualMarksUsed: boolean, draftUsed: boolean, wrongGuessMade = false): void {
        this.manualMarksUsedValue = this.manualMarksUsedValue || manualMarksUsed;
        this.draftUsedValue = this.draftUsedValue || draftUsed;
        this.wrongGuessMadeValue = this.wrongGuessMadeValue || wrongGuessMade;
    }

    private constructor(
        readonly board: MeowdokuLevelBoard,
        lives: number,
    ) {
        const total = board.size * board.size;
        this.cells = new Array(total).fill('empty') as MeowdokuCellState[];
        this.markOrigins = new Array(total).fill(undefined);
        this.livesValue = lives;
        for (const [row, col] of board.prefill) {
            this.cells[row * board.size + col] = 'cat';
        }
    }

    static fromLevel(board: MeowdokuLevelBoard, lives = MEOWDOKU_DEFAULT_LIVES): MeowdokuModel {
        return new MeowdokuModel(board, lives);
    }

    get size(): number {
        return this.board.size;
    }

    get level(): number {
        return this.board.level;
    }

    // ------------------------------------------------------------ 生命 / 分数

    get lives(): number {
        return this.livesValue;
    }

    get score(): number {
        return this.scoreValue;
    }

    get combo(): number {
        return this.comboValue;
    }

    get maxCombo(): number {
        return this.maxComboValue;
    }

    get mistakes(): number {
        return this.mistakesValue;
    }

    get elapsedSeconds(): number {
        return this.elapsedMs / 1000;
    }

    tick(deltaMs: number): void {
        this.elapsedMs += Math.max(0, deltaMs);
    }

    /** 原作 `_on_wrong_guess` 的计数部分：扣命、清连击、记错。 */
    loseLife(): boolean {
        this.wrongGuessMadeValue = true;
        this.mistakesValue += 1;
        this.comboValue = 0;
        this.livesValue = Math.max(0, this.livesValue - 1);
        return this.livesValue <= 0;
    }

    /** 恢复存档时把得分 / 连击接回来（原作 endgame snapshot 存了 score / combo）。 */
    restoreScore(score: number, combo: number): void {
        this.scoreValue = Math.max(0, Math.floor(score));
        this.comboValue = Math.max(0, Math.floor(combo));
        this.maxComboValue = Math.max(this.maxComboValue, this.comboValue);
    }

    restoreLives(value = MEOWDOKU_DEFAULT_LIVES): void {
        this.livesValue = Math.max(0, value);
    }

    /**
     * 放下一只正确的猫之后的计分：连击 +1，得分按原作默认档
     * （`score_encourage = NON_ROUND`）实际走的那条公式
     * `ScoreEncourageConfig.gain_for_combo` = `min(576 + (combo-1) * 96, 1440)`。
     */
    awardCombo(): number {
        this.comboValue += 1;
        this.maxComboValue = Math.max(this.maxComboValue, this.comboValue);
        const gain = Math.min(576 + Math.max(0, this.comboValue - 1) * 96, 1440);
        this.scoreValue += gain;
        return gain;
    }

    // ------------------------------------------------------------ 读取

    getCell(row: number, col: number): MeowdokuCellState {
        return this.cells[row * this.size + col] ?? 'empty';
    }

    isInside(row: number, col: number): boolean {
        return row >= 0 && col >= 0 && row < this.size && col < this.size;
    }

    isPrefill(row: number, col: number): boolean {
        return this.board.prefill.some(([r, c]) => r === row && c === col);
    }

    /** 该格的叉是自动补出来的。 */
    getMarkOrigin(row: number, col: number): MeowdokuMarkOrigin | undefined {
        return this.markOrigins[row * this.size + col];
    }

    /** 整块颜色的格子（原作 `BoardView._region_cells` 的角色）。 */
    regionCells(regionId: number): readonly (readonly [number, number])[] {
        const out: [number, number][] = [];
        for (let row = 0; row < this.size; row += 1) {
            for (let col = 0; col < this.size; col += 1) {
                if (this.board.regions[row]![col] === regionId) out.push([row, col]);
            }
        }
        return out;
    }

    /** 某块颜色是否已经找到猫（原作 `_refresh_region_dim` 的判定）。 */
    regionHasCat(regionId: number): boolean {
        return this.regionCells(regionId).some(([row, col]) => this.getCell(row, col) === 'cat');
    }

    get placedCount(): number {
        let count = 0;
        for (const cell of this.cells) {
            if (cell === 'cat') count += 1;
        }
        return count;
    }

    get remaining(): number {
        return this.size - this.placedCount;
    }

    get isComplete(): boolean {
        if (this.placedCount !== this.size) return false;
        return findMeowdokuConflicts(this.size, this.board.regions, this.placedCats()).size === 0;
    }

    /** 提示条与结算页共用：找齐猫且零失误；旧存档中的红叉同样代表失误。 */
    get isPerfectClear(): boolean {
        return this.isComplete && !this.wrongGuessMadeValue && this.mistakesValue === 0
            && !this.cells.some(cell => cell === 'error');
    }

    placedCats(): readonly (readonly [number, number])[] {
        const cats: [number, number][] = [];
        for (let row = 0; row < this.size; row += 1) {
            for (let col = 0; col < this.size; col += 1) {
                if (this.getCell(row, col) === 'cat') cats.push([row, col]);
            }
        }
        return cats;
    }

    /** 该格在解上是否是猫咪的家。 */
    isSolutionCell(row: number, col: number): boolean {
        return this.board.solution[row] === col;
    }

    // ------------------------------------------------------------ 标记

    /**
     * 单击：空格打叉、已打叉的取消。
     * 猫咪格和红叉不响应，与原作 `NormalTapOperation` 一致。
     */
    toggleMark(row: number, col: number): MeowdokuCellChange | undefined {
        return this.setMark(row, col, this.getCell(row, col) !== 'mark', 'manual');
    }

    /** 显式把格子设成“有叉 / 无叉”，单击、拖拽、老鼠、提示共用这条路径。 */
    setMark(
        row: number,
        col: number,
        marked: boolean,
        origin: MeowdokuMarkOrigin,
    ): MeowdokuCellChange | undefined {
        if (!this.isInside(row, col)) return undefined;
        const index = row * this.size + col;
        const current = this.cells[index]!;
        if (current === 'cat') return undefined;
        // 红叉不吃重复标记：原作里点它没有任何反应。
        if (current === 'error' && marked) return undefined;
        const next: MeowdokuCellState = marked ? 'mark' : 'empty';
        if (next === current && (current !== 'mark' || this.markOrigins[index] === origin)) {
            return undefined;
        }
        const wasAuto = current === 'mark' && this.markOrigins[index] === 'auto';
        if (marked && origin === 'manual') this.manualMarksUsedValue = true;
        this.setValue(index, next, next === 'mark' ? origin : undefined);
        return Object.freeze({
            row,
            col,
            from: current,
            to: next,
            kind: next === 'mark' ? 'mark' as const : 'unmark' as const,
            origin,
            wasAuto,
        });
    }

    /**
     * 把格子设成 ERROR（原作 `play_error_feedback` 的落点）。
     * 红叉不接受再次标记，也不吃草稿，只有重开本关才会消失。
     */
    markCellError(row: number, col: number): void {
        if (!this.isInside(row, col)) return;
        this.wrongGuessMadeValue = true;
        this.setValue(row * this.size + col, 'error', undefined);
    }

    // ------------------------------------------------------------ 自动标记

    /**
     * 自动补叉：把这只猫排除掉、且当前还是空白的格子补上叉。
     * 返回真正发生变化的格子，按“同一对角环”的顺序排列。
     */
    autoCrossEliminated(row: number, col: number): readonly MeowdokuCellChange[] {
        const changes: MeowdokuCellChange[] = [];
        const excluded = meowdokuCellsExcludedByCat(this.size, this.board.regions, [row, col]);
        const ordered = excluded.slice().sort((a, b) => this.winRing(a) - this.winRing(b));
        for (const [r, c] of ordered) {
            const change = this.setMark(r, c, true, 'auto');
            if (change) changes.push(change);
        }
        return Object.freeze(changes);
    }

    /**
     * 通关扫光的对角环编号，取自原作 `_run_auto_complete` 的
     * `ring = func(v) -> int: return v.y + (sz - 1 - v.x)`。
     */
    winRing(cell: readonly [number, number]): number {
        return cell[1] + (this.size - 1 - cell[0]);
    }

    /** 通关时剩下的空白格，按对角环顺序，用于依次补叉。 */
    blankCellsByRing(): readonly (readonly [number, number])[] {
        const blanks: [number, number][] = [];
        for (let row = 0; row < this.size; row += 1) {
            for (let col = 0; col < this.size; col += 1) {
                if (this.getCell(row, col) === 'empty') blanks.push([row, col]);
            }
        }
        return Object.freeze(blanks.sort((a, b) => this.winRing(a) - this.winRing(b)));
    }

    // ------------------------------------------------------------ 放猫

    /**
     * 找猫（双击 / 长按）：解位放猫，其余位置只打上错误标记。
     * 返回值区分三种结果，视图据此决定是否播放放猫动画或错误反馈。
     */
    placeCat(row: number, col: number): 'placed' | 'wrong' | 'blocked' {
        if (!this.isInside(row, col)) return 'blocked';
        if (this.getCell(row, col) === 'cat') return 'blocked';
        const index = row * this.size + col;
        if (!this.isSolutionCell(row, col)) {
            // 原作 `play_error_feedback`：错误格进入 ERROR 状态，红叉常驻。
            // 在错误动画扣命前记录，退出或重开也不能丢失这次找错。
            this.wrongGuessMadeValue = true;
            this.setValue(index, 'error', undefined);
            return 'wrong';
        }
        this.setValue(index, 'cat', undefined);
        return 'placed';
    }

    // ------------------------------------------------------------ 存档

    snapshot(): readonly MeowdokuCellState[] {
        return Object.freeze(this.cells.slice());
    }

    /** 手动打过的叉数量，只用于统计。 */
    countMarks(origin: MeowdokuMarkOrigin): number {
        let count = 0;
        for (let index = 0; index < this.cells.length; index += 1) {
            if (this.cells[index] === 'mark' && this.markOrigins[index] === origin) count += 1;
        }
        return count;
    }

    /** 恢复存档；数据不合法时返回 false 并由调用方回退到新开局。 */
    restore(snapshot: readonly MeowdokuCellState[], challenge?: MeowdokuChallengeHistory): boolean {
        if (snapshot.length !== this.cells.length) return false;
        for (const cell of snapshot) {
            if (cell !== 'empty' && cell !== 'mark' && cell !== 'error' && cell !== 'cat') return false;
        }
        if (challenge) {
            this.restoreChallengeUsage(challenge.manualMarksUsed, challenge.draftUsed, challenge.wrongGuessMade);
        }
        for (let index = 0; index < snapshot.length; index += 1) {
            const cell = snapshot[index]!;
            // 新快照有明确使用记录，自动补叉不能在续玩时被误记成手画叉。
            if (cell === 'mark' && challenge?.manualMarksUsed !== false) this.manualMarksUsedValue = true;
            // 明确记录优先；旧已通关关卡可保留上线前的红叉，但从新功能启用后重新计历史。
            if (cell === 'error' && challenge?.wrongGuessMade !== false) this.wrongGuessMadeValue = true;
            this.setValue(index, cell, cell === 'mark' ? 'manual' : undefined);
        }
        for (const [row, col] of this.board.prefill) {
            const index = row * this.size + col;
            this.setValue(index, 'cat', undefined);
        }
        // 只允许解位上的猫存在；存档被改坏时丢弃非法猫，避免出现无解局面。
        for (let row = 0; row < this.size; row += 1) {
            for (let col = 0; col < this.size; col += 1) {
                if (this.getCell(row, col) !== 'cat') continue;
                if (!this.isSolutionCell(row, col)) this.setValue(row * this.size + col, 'empty', undefined);
            }
        }
        return true;
    }

    private setValue(index: number, value: MeowdokuCellValue, origin: MeowdokuMarkOrigin | undefined): void {
        this.cells[index] = value;
        this.markOrigins[index] = origin;
    }
}
