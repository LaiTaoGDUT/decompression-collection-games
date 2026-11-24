/** 黑白点仅约束已标出的边；没有点的相邻格不附带反向约束。6×6 的宫为 2 行 × 3 列。 */
export type RuleName = 'classic' | 'parity' | 'inequality' | 'diagonal' | 'kropki' | 'thermo' | 'arrow';
export type RuleConfig =
    | { readonly type: 'parity'; readonly cell: number; readonly parity: 'odd' | 'even' }
    | { readonly type: 'inequality'; readonly lowerCell: number; readonly upperCell: number }
    | { readonly type: 'diagonal'; readonly cells: readonly number[] }
    | { readonly type: 'kropki'; readonly cellA: number; readonly cellB: number; readonly dot: 'w' | 'b' }
    | { readonly type: 'thermo'; readonly path: readonly number[] }
    | { readonly type: 'arrow'; readonly circleCell: number; readonly pathCells: readonly number[] };
export interface CozySudokuLevelData {
    /** Stable puzzle identity; independent of its position in the campaign. */
    readonly id?: string;
    readonly title?: string;
    readonly challenge?: 'milestone' | 'finale';
    readonly levelNumber: number; readonly size: 4 | 6 | 9; readonly primaryRule: RuleName;
    readonly givens: string; readonly solution: string; readonly rules: readonly RuleConfig[];
}
export const RULE_NAMES: Readonly<Record<RuleName, string>> = {
    classic: '经典数独', kropki: '黑白点', thermo: '温度计', arrow: '箭头数独',
    parity: '奇偶格', inequality: '不等号', diagonal: '对角线',
};
export const RULE_HELP: Readonly<Record<RuleName, string>> = {
    classic: '每行、每列、每个粗线宫内，数字各出现一次。先点空格，再点下方数字。',
    kropki: '白点两边相差 1，黑点两边一个是另一个的 2 倍。没有点的边不作额外限制。',
    thermo: '从圆泡到温度计末端，数字必须严格递增，不必连续。',
    arrow: '圆圈里的数字，等于箭身经过的所有格子的数字之和。圆圈不计入箭身。',
    parity: '圆形底纹只能填奇数，方形底纹只能填偶数。没有底纹的格子不作奇偶限制。',
    inequality: '相邻两格满足标出的不等号：开口朝向较大的数，尖端朝向较小的数。',
    diagonal: '两条浅金色长对角线上，数字也必须各出现一次。行、列、宫的规则仍然有效。',
};
export function cozyPuzzleId(level: CozySudokuLevelData): string { return level.id ?? `v2-${level.levelNumber}`; }
export function boxShape(size: number): { rows: number; cols: number } {
    return { rows: size === 9 ? 3 : 2, cols: size === 4 ? 2 : 3 };
}
export function peers(a: number, b: number, size: number): boolean {
    const ar = Math.floor(a / size), br = Math.floor(b / size), ac = a % size, bc = b % size;
    const box = boxShape(size);
    return ar === br || ac === bc || (Math.floor(ar / box.rows) === Math.floor(br / box.rows)
        && Math.floor(ac / box.cols) === Math.floor(bc / box.cols));
}
export function ruleCells(rule: RuleConfig): readonly number[] {
    if (rule.type === 'parity') return [rule.cell];
    if (rule.type === 'inequality') return [rule.lowerCell, rule.upperCell];
    if (rule.type === 'diagonal') return rule.cells;
    if (rule.type === 'kropki') return [rule.cellA, rule.cellB];
    if (rule.type === 'thermo') return rule.path;
    return [rule.circleCell, ...rule.pathCells];
}
/** Diagonals are full all-different units, including for notes, highlights and hidden singles. */
export function levelPeers(level: CozySudokuLevelData, a: number, b: number): boolean {
    return topology(level).peers[a]?.has(b) ?? false;
}
export function allDifferentUnits(level: CozySudokuLevelData): readonly (readonly number[])[] {
    return topology(level).units;
}
interface SudokuTopology {
    readonly units: readonly (readonly number[])[];
    readonly peers: readonly ReadonlySet<number>[];
    readonly rules: readonly (readonly RuleConfig[])[];
}
// Puzzle geometry never changes during a round. Build it once, rather than
// scanning every rule for every pair of cells in each candidate/conflict query.
// The level bank keeps every level object alive. Bound this cache so visiting
// all 600 levels cannot retain 600 sets of peer tables after leaving them.
const topologies = new Map<CozySudokuLevelData, SudokuTopology>();
function topology(level: CozySudokuLevelData): SudokuTopology {
    const cached = topologies.get(level); if (cached) return cached;
    const n = level.size, box = boxShape(n), units: (readonly number[])[] = [];
    for (let r = 0; r < n; r++) units.push(Array.from({length:n}, (_, c) => r*n+c));
    for (let c = 0; c < n; c++) units.push(Array.from({length:n}, (_, r) => r*n+c));
    for (let r = 0; r < n; r += box.rows) for (let c = 0; c < n; c += box.cols) {
        const cells: number[] = [];
        for (let dr = 0; dr < box.rows; dr++) for (let dc = 0; dc < box.cols; dc++) cells.push((r+dr)*n+c+dc);
        units.push(cells);
    }
    for (const r of level.rules) if (r.type === 'diagonal') units.push(r.cells);
    const peers = Array.from({length:n*n}, () => new Set<number>());
    for (const unit of units) for (const a of unit) for (const b of unit) peers[a].add(b);
    const rules: RuleConfig[][] = Array.from({length:n*n}, () => []);
    for (const rule of level.rules) for (const cell of ruleCells(rule)) rules[cell].push(rule);
    const compiled = {units, peers, rules}; topologies.set(level, compiled);
    if(topologies.size>8)topologies.delete(Array.from(topologies.keys())[0]);
    return compiled;
}
/** Partial constraints are sound: they never reject a legal completion. */
export function ruleValid(rule: RuleConfig, cells: readonly number[], size: number): boolean {
    if (rule.type === 'parity') {
        const v = cells[rule.cell];
        return !v || v % 2 === (rule.parity === 'odd' ? 1 : 0);
    }
    if (rule.type === 'inequality') {
        const a = cells[rule.lowerCell], b = cells[rule.upperCell];
        return a ? (b ? a < b : a < size) : !b || b > 1;
    }
    if (rule.type === 'diagonal') {
        const filled = rule.cells.map(i => cells[i]).filter(v => v > 0);
        return new Set(filled).size === filled.length;
    }
    if (rule.type === 'kropki') {
        const a = cells[rule.cellA], b = cells[rule.cellB];
        return !a || !b || (rule.dot === 'w' ? Math.abs(a - b) === 1 : a === b * 2 || b === a * 2);
    }
    if (rule.type === 'thermo') {
        for (let i = 0; i < rule.path.length; i++) {
            const value = cells[rule.path[i]];
            if (!value) continue;
            if (value < i + 1 || value > size - (rule.path.length - 1 - i)) return false;
            for (let j = i + 1; j < rule.path.length; j++) {
                const next = cells[rule.path[j]];
                if (next && next - value < j - i) return false;
            }
        }
        return true;
    }
    const indexes = rule.pathCells;
    const values = indexes.map(i => cells[i]);
    const filled = values.filter(v => v > 0), missing = values.length - filled.length;
    const sum = filled.reduce((a, b) => a + b, 0);
    const circle = cells[rule.circleCell];
    return circle ? sum + missing <= circle && sum + missing * size >= circle : sum + missing <= size;
}
export function conflicts(level: CozySudokuLevelData, cells: readonly number[]): Set<number> {
    const bad = new Set<number>();
    cells.forEach((value, i) => {
        if (!value) return;
        if (!Number.isInteger(value) || value < 1 || value > level.size) bad.add(i);
    });
    for (const unit of topology(level).units) {
        const first = new Array<number>(level.size + 1).fill(-1);
        for (const i of unit) {
            const value = cells[i]; if (!value) continue;
            if (first[value] >= 0) { bad.add(first[value]); bad.add(i); }
            else first[value] = i;
        }
    }
    for (const rule of level.rules) if (rule.type !== 'diagonal' && !ruleValid(rule, cells, level.size)) {
        for (const i of ruleCells(rule)) if (cells[i]) bad.add(i);
    }
    return bad;
}
export function candidates(level: CozySudokuLevelData, cells: readonly number[], cell: number): number[] {
    if (!Number.isInteger(cell) || cell < 0 || cell >= level.size * level.size) return [];
    const working = cells.slice(); working[cell] = 0;
    const compiled = topology(level), related = compiled.rules[cell];
    let used = 0;
    compiled.peers[cell].forEach(i => { if (i !== cell && cells[i]) used |= 1 << cells[i]; });
    const result: number[] = [];
    for (let v = 1; v <= level.size; v++) {
        if (used & (1 << v)) continue;
        working[cell] = v;
        if (related.every(rule => ruleValid(rule, working, level.size))) result.push(v);
    }
    return result;
}
/** Offline bank validation and generation; bounded by solution count. Not used in the rendering loop. */
export function countSolutions(level: CozySudokuLevelData, limit = 2): number {
    const cells = level.givens.split('').map(Number);
    if (conflicts(level, cells).size) return 0;
    let count = 0;
    const search = (): void => {
        if (count >= limit) return;
        let best = -1, choices: number[] = [];
        for (let i = 0; i < cells.length; i++) if (!cells[i]) {
            const options = candidates(level, cells, i);
            if (!options.length) return;
            if (best < 0 || options.length < choices.length) { best = i; choices = options; }
            if (options.length === 1) break;
        }
        if (best < 0) { count++; return; }
        for (const value of choices) { cells[best] = value; search(); if (count >= limit) break; }
        cells[best] = 0;
    };
    search(); return count;
}
