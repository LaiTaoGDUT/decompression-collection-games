import { allDifferentUnits, candidates, conflicts, cozyPuzzleId, levelPeers, ruleCells, type CozySudokuLevelData, type RuleConfig } from './CozySudokuRules';

export interface SudokuMove { cells: number[]; notes: number[][]; }
export interface SudokuSnapshot extends SudokuMove {
    levelNumber: number; puzzleId?: string; elapsed: number; hints: number; history: SudokuMove[];
}
export interface SudokuHint { cell: number; value: number; title: string; explanation: string; relatedCells?: readonly number[]; }
const copyMove = (move: SudokuMove): SudokuMove => ({ cells: move.cells.slice(), notes: move.notes.map(row => row.slice()) });

export class CozySudokuModel {
    cells: number[];
    notes: number[][];
    elapsed = 0;
    hints = 0;
    history: SudokuMove[] = [];
    constructor(readonly level: CozySudokuLevelData, snapshot?: unknown) {
        this.cells = level.givens.split('').map(Number);
        this.notes = this.cells.map(() => []);
        const raw = snapshot as Partial<SudokuSnapshot> | undefined;
        if (raw?.levelNumber !== level.levelNumber || raw.puzzleId !== cozyPuzzleId(level) || !this.validMove(raw)) return;
        this.cells = raw.cells.slice(); this.notes = raw.notes.map(n => n.slice());
        this.elapsed = typeof (snapshot as SudokuSnapshot).elapsed === 'number' && Number.isFinite((snapshot as SudokuSnapshot).elapsed) ? Math.max(0, (snapshot as SudokuSnapshot).elapsed) : 0;
        this.hints = Number.isInteger((snapshot as SudokuSnapshot).hints) ? Math.max(0, Math.min(99999, (snapshot as SudokuSnapshot).hints)) : 0;
        this.history = Array.isArray((snapshot as SudokuSnapshot).history) ? (snapshot as SudokuSnapshot).history.filter(m => this.validMove(m)).slice(-100).map(copyMove) : [];
    }
    private validMove(raw: Partial<SudokuMove>): raw is SudokuMove {
        const n = this.level.size;
        return !!raw && Array.isArray(raw.cells) && raw.cells.length === n * n
            && raw.cells.every((v, i) => Number.isInteger(v) && v >= 0 && v <= n
                && (!Number(this.level.givens[i]) || v === Number(this.level.givens[i])))
            && Array.isArray(raw.notes) && raw.notes.length === n * n
            && raw.notes.every((values, i) => Array.isArray(values) && values.length <= n
                && (!raw.cells![i] || values.length === 0) && new Set(values).size === values.length
                && values.every(v => Number.isInteger(v) && v >= 1 && v <= n));
    }
    get completed(): boolean { return this.cells.every(v => v > 0) && conflicts(this.level, this.cells).size === 0; }
    /** Row-major traversal wraps once and skips both givens and filled cells. */
    nextEmptyCell(after:number):number {
        const start=Number.isInteger(after)&&after>=0&&after<this.cells.length?after:-1;
        for(let step=1;step<=this.cells.length;step++) {
            const cell=(start+step)%this.cells.length;
            if(!this.cells[cell]&&this.level.givens[cell]==='0')return cell;
        }
        return -1;
    }
    private remember(): void { this.history.push(copyMove(this)); if (this.history.length > 100) this.history.shift(); }
    write(cell: number, value: number, pencil = false): boolean {
        if (!Number.isInteger(cell) || cell < 0 || cell >= this.cells.length || this.level.givens[cell] !== '0'
            || !Number.isInteger(value) || value < 0 || value > this.level.size || this.completed) return false;
        if (pencil && value && this.cells[cell]) return false;
        if (!pencil && this.cells[cell] === value && !this.notes[cell].length) return false;
        this.remember();
        if (pencil && value) {
            const row = this.notes[cell], index = row.indexOf(value);
            if (index < 0) row.push(value); else row.splice(index, 1);
            row.sort((a, b) => a - b);
        } else {
            this.cells[cell] = value; this.notes[cell] = [];
            if (value) this.notes.forEach((row, i) => {
                if (levelPeers(this.level, i, cell)) this.notes[i] = row.filter(v => v !== value);
            });
        }
        return true;
    }
    undo(): boolean {
        if (this.completed) return false;
        const move = this.history.pop(); if (!move) return false;
        this.cells = move.cells; this.notes = move.notes; return true;
    }
    hint(selected = -1): SudokuHint | undefined {
        // Explain a wrong entry before suggesting a deduction based on it.
        const wrong = this.cells.findIndex((v, i) => v > 0 && v !== Number(this.level.solution[i]));
        if (wrong >= 0) return { cell: wrong, value: Number(this.level.solution[wrong]), title: '先检查这一格',
            explanation: '当前数字会导致矛盾。先擦除再推理，或应用正确数字。' };
        const optionsByCell = this.cells.map((value, i) => value ? [] : candidates(this.level, this.cells, i));
        const withoutRule = new Map<RuleConfig['type'], CozySudokuLevelData>();
        for (let i = 0; i < this.cells.length; i++) if (!this.cells[i]) {
            const options = optionsByCell[i];
            if (options.length === 1) {
                const value=options[0];
                // Attribute a deduction only when removing that rule family
                // really reintroduces another candidate in this exact state.
                const cause=this.level.rules.find(r=>{
                    if(ruleCells(r).indexOf(i)<0)return false;
                    let reduced=withoutRule.get(r.type);
                    if(!reduced){reduced={...this.level,rules:this.level.rules.filter(other=>other.type!==r.type)};withoutRule.set(r.type,reduced);}
                    return candidates(reduced,this.cells,i).length>1;
                });
                if(cause) {
                    const copy=this.ruleHint(cause,value);
                    if(copy)return {cell:i,value,...copy,relatedCells:ruleCells(cause)};
                }
                return { cell: i, value, title: '唯一候选',
                    explanation: `结合行、列、宫及已标规则，这一格只能填 ${value}。` };
            }
        }
        for(const unit of allDifferentUnits(this.level))for(let value=1;value<=this.level.size;value++) {
            if(unit.some(i=>this.cells[i]===value))continue;
            const places=unit.filter(i=>!this.cells[i]&&optionsByCell[i].indexOf(value)>=0);
            if(places.length!==1)continue;
            const diagonal=this.level.rules.some(r=>r.type==='diagonal'&&r.cells===unit);
            return {cell:places[0],value,title:diagonal?'对角线唯一位置':'唯一位置',
                explanation:diagonal?`这条对角线上，数字 ${value} 只有这一格能填。`:`这一行、列或宫内，数字 ${value} 只有这一格能填。`,relatedCells:unit};
        }
        const cell = Number.isInteger(selected) && selected >= 0 && selected < this.cells.length && !this.cells[selected] ? selected : this.cells.findIndex(v => !v);
        if (cell < 0) return undefined;
        return { cell, value: Number(this.level.solution[cell]), title: '揭示一个数字',
            explanation: '暂时没有直接可用的单一候选，可以应用这个数字继续推理。' };
    }
    private ruleHint(rule:RuleConfig,value:number):Pick<SudokuHint,'title'|'explanation'>|undefined {
        if(rule.type==='parity')return {title:rule.parity==='odd'?'奇数格排除':'偶数格排除',
            explanation:`${rule.parity==='odd'?'圆形格只能填奇数':'方形格只能填偶数'}，结合行、列、宫，这格只能填 ${value}。`};
        if(rule.type==='inequality')return {title:'不等号排除',explanation:`开口朝大数，尖端朝小数；结合行、列、宫，这格只能填 ${value}。`};
        if(rule.type==='diagonal')return {title:'对角线排除',explanation:`这条对角线上的数字不能重复，结合行、列、宫，只剩 ${value}。`};
        if(rule.type==='thermo')return {title:'温度计排除',explanation:`从圆泡到末端必须严格递增，结合行、列、宫，这格只能填 ${value}。`};
        if(rule.type==='kropki')return {title:'黑白点排除',explanation:`${rule.dot==='w'?'白点两边相差 1':'黑点两边一个是另一个的 2 倍'}，结合行、列、宫，这格只能填 ${value}。`};
        if(rule.type==='arrow')return {title:'箭头求和',explanation:`圆圈等于箭身数字之和，结合行、列、宫，这格只能填 ${value}。`};
        return undefined;
    }
    adopt(hint: SudokuHint): boolean {
        if (!this.write(hint.cell, hint.value)) return false;
        this.hints++; return true;
    }
    snapshot(): SudokuSnapshot {
        return { ...copyMove(this), levelNumber: this.level.levelNumber, puzzleId: cozyPuzzleId(this.level), elapsed: this.elapsed,
            hints: this.hints, history: this.history.map(copyMove) };
    }
}
