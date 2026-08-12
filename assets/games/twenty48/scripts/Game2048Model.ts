export const BOARD_SIZE = 4;
export const TARGET_TILE = 2048;

export type Game2048Direction = 'left' | 'right' | 'up' | 'down';

export interface Game2048Spawn {
    readonly index: number;
    readonly value: 2 | 4;
}

export interface Game2048MoveResult {
    readonly changed: boolean;
    readonly scoreGained: number;
    readonly mergedIndices: readonly number[];
    readonly spawned?: Game2048Spawn;
    readonly reachedTarget: boolean;
    readonly gameOver: boolean;
}

interface Game2048Snapshot {
    readonly board: readonly number[];
    readonly score: number;
    readonly targetAcknowledged: boolean;
}

interface LineResult {
    readonly values: readonly number[];
    readonly score: number;
    readonly mergedOffsets: readonly number[];
}

function requireBoard(board: readonly number[]): number[] {
    if (board.length !== BOARD_SIZE * BOARD_SIZE) {
        throw new Error(`2048 board must contain ${BOARD_SIZE * BOARD_SIZE} cells.`);
    }

    return board.map((value) => {
        if (!Number.isInteger(value) || value < 0 || (value !== 0 && (value & (value - 1)) !== 0)) {
            throw new Error(`Invalid 2048 tile value: ${value}.`);
        }
        return value;
    });
}

function slideLine(line: readonly number[]): LineResult {
    const compact = line.filter((value) => value !== 0);
    const values: number[] = [];
    const mergedOffsets: number[] = [];
    let score = 0;

    for (let index = 0; index < compact.length; index += 1) {
        const value = compact[index];
        if (index + 1 < compact.length && compact[index + 1] === value) {
            const merged = value * 2;
            values.push(merged);
            mergedOffsets.push(values.length - 1);
            score += merged;
            index += 1;
        } else {
            values.push(value);
        }
    }

    while (values.length < BOARD_SIZE) values.push(0);
    return { values, score, mergedOffsets };
}

function lineIndices(direction: Game2048Direction, outer: number): number[] {
    const indices: number[] = [];
    for (let inner = 0; inner < BOARD_SIZE; inner += 1) {
        if (direction === 'left') indices.push(outer * BOARD_SIZE + inner);
        if (direction === 'right') indices.push(outer * BOARD_SIZE + (BOARD_SIZE - 1 - inner));
        if (direction === 'up') indices.push(inner * BOARD_SIZE + outer);
        if (direction === 'down') indices.push((BOARD_SIZE - 1 - inner) * BOARD_SIZE + outer);
    }
    return indices;
}

export class Game2048Model {
    private cells: number[] = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
    private currentScore = 0;
    private targetAcknowledged = false;
    private undoSnapshot?: Game2048Snapshot;

    constructor(private random: () => number = Math.random) {}

    get board(): readonly number[] {
        return Object.freeze([...this.cells]);
    }

    get score(): number {
        return this.currentScore;
    }

    get canUndo(): boolean {
        return this.undoSnapshot !== undefined;
    }

    get highestTile(): number {
        return this.cells.reduce((highest, value) => Math.max(highest, value), 0);
    }

    get hasAvailableMove(): boolean {
        if (this.cells.some((value) => value === 0)) return true;
        for (let row = 0; row < BOARD_SIZE; row += 1) {
            for (let column = 0; column < BOARD_SIZE; column += 1) {
                const index = row * BOARD_SIZE + column;
                if (column + 1 < BOARD_SIZE && this.cells[index] === this.cells[index + 1]) return true;
                if (row + 1 < BOARD_SIZE && this.cells[index] === this.cells[index + BOARD_SIZE]) return true;
            }
        }
        return false;
    }

    setRandomSource(random: () => number): void {
        this.random = random;
    }

    reset(): readonly Game2048Spawn[] {
        this.cells = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
        this.currentScore = 0;
        this.targetAcknowledged = false;
        this.undoSnapshot = undefined;
        return Object.freeze([this.spawn(), this.spawn()].filter((spawn): spawn is Game2048Spawn => !!spawn));
    }

    loadForTesting(
        board: readonly number[],
        score = 0,
        targetAcknowledged = false,
    ): void {
        if (!Number.isFinite(score) || score < 0) throw new Error('2048 score must be non-negative.');
        this.cells = requireBoard(board);
        this.currentScore = Math.floor(score);
        this.targetAcknowledged = targetAcknowledged;
        this.undoSnapshot = undefined;
    }

    move(direction: Game2048Direction): Game2048MoveResult {
        const before: Game2048Snapshot = {
            board: [...this.cells],
            score: this.currentScore,
            targetAcknowledged: this.targetAcknowledged,
        };
        const next = [...this.cells];
        const mergedIndices: number[] = [];
        let scoreGained = 0;

        for (let outer = 0; outer < BOARD_SIZE; outer += 1) {
            const indices = lineIndices(direction, outer);
            const line = indices.map((index) => this.cells[index]);
            const result = slideLine(line);
            scoreGained += result.score;
            result.values.forEach((value, offset) => {
                next[indices[offset]] = value;
            });
            result.mergedOffsets.forEach((offset) => mergedIndices.push(indices[offset]));
        }

        const changed = next.some((value, index) => value !== this.cells[index]);
        if (!changed) {
            return Object.freeze({
                changed: false,
                scoreGained: 0,
                mergedIndices: Object.freeze([]),
                reachedTarget: false,
                gameOver: !this.hasAvailableMove,
            });
        }

        this.undoSnapshot = before;
        this.cells = next;
        this.currentScore += scoreGained;
        const spawned = this.spawn();
        const reachedTarget = !this.targetAcknowledged
            && this.cells.some((value) => value >= TARGET_TILE);
        if (reachedTarget) this.targetAcknowledged = true;

        return Object.freeze({
            changed: true,
            scoreGained,
            mergedIndices: Object.freeze([...mergedIndices]),
            ...(spawned ? { spawned } : {}),
            reachedTarget,
            gameOver: !this.hasAvailableMove,
        });
    }

    undo(): boolean {
        const snapshot = this.undoSnapshot;
        if (!snapshot) return false;
        this.cells = [...snapshot.board];
        this.currentScore = snapshot.score;
        this.targetAcknowledged = snapshot.targetAcknowledged;
        this.undoSnapshot = undefined;
        return true;
    }

    private spawn(): Game2048Spawn | undefined {
        const empty = this.cells
            .map((value, index) => value === 0 ? index : -1)
            .filter((index) => index >= 0);
        if (empty.length === 0) return undefined;

        const locationRoll = Math.max(0, Math.min(0.999999, this.random()));
        const index = empty[Math.floor(locationRoll * empty.length)];
        const value: 2 | 4 = this.random() < 0.9 ? 2 : 4;
        this.cells[index] = value;
        return Object.freeze({ index, value });
    }
}
