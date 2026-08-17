export const BOARD_SIZE = 4;
export const TARGET_TILE = 4096;

export type Game2048Direction = 'left' | 'right' | 'up' | 'down';

export interface Game2048Spawn {
    readonly index: number;
    readonly value: 2 | 4;
}

export interface Game2048TileMotion {
    readonly fromIndex: number;
    readonly toIndex: number;
    readonly value: number;
    readonly merges: boolean;
}

export interface Game2048MoveResult {
    readonly changed: boolean;
    readonly scoreGained: number;
    readonly mergedIndices: readonly number[];
    readonly tileMotions: readonly Game2048TileMotion[];
    readonly spawned?: Game2048Spawn;
    readonly reachedTarget: boolean;
    readonly gameOver: boolean;
}

export interface Game2048Snapshot {
    readonly board: readonly number[];
    readonly score: number;
    readonly targetAcknowledged: boolean;
}

interface LineResult {
    readonly values: readonly number[];
    readonly score: number;
    readonly mergedOffsets: readonly number[];
    readonly motions: readonly {
        readonly fromOffset: number;
        readonly toOffset: number;
        readonly value: number;
        readonly merges: boolean;
    }[];
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
    const compact = line
        .map((value, offset) => ({ value, offset }))
        .filter(({ value }) => value !== 0);
    const values: number[] = [];
    const mergedOffsets: number[] = [];
    const motions: {
        fromOffset: number;
        toOffset: number;
        value: number;
        merges: boolean;
    }[] = [];
    let score = 0;

    for (let index = 0; index < compact.length; index += 1) {
        const { value, offset } = compact[index];
        const toOffset = values.length;
        if (index + 1 < compact.length && compact[index + 1].value === value) {
            const merged = value * 2;
            values.push(merged);
            mergedOffsets.push(values.length - 1);
            motions.push({ fromOffset: offset, toOffset, value, merges: true });
            motions.push({
                fromOffset: compact[index + 1].offset,
                toOffset,
                value,
                merges: true,
            });
            score += merged;
            index += 1;
        } else {
            values.push(value);
            motions.push({ fromOffset: offset, toOffset, value, merges: false });
        }
    }

    while (values.length < BOARD_SIZE) values.push(0);
    return { values, score, mergedOffsets, motions };
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
    private targetAcknowledgedState = false;

    constructor(private random: () => number = Math.random) {}

    get board(): readonly number[] {
        return Object.freeze([...this.cells]);
    }

    get score(): number {
        return this.currentScore;
    }

    get highestTile(): number {
        return this.cells.reduce((highest, value) => Math.max(highest, value), 0);
    }

    get targetAcknowledged(): boolean {
        return this.targetAcknowledgedState;
    }

    get needsTargetCelebration(): boolean {
        return this.highestTile >= TARGET_TILE && !this.targetAcknowledgedState;
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

    get snapshot(): Game2048Snapshot {
        return Object.freeze({
            board: Object.freeze([...this.cells]),
            score: this.currentScore,
            targetAcknowledged: this.targetAcknowledgedState,
        });
    }

    setRandomSource(random: () => number): void {
        this.random = random;
    }

    reset(): readonly Game2048Spawn[] {
        this.cells = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
        this.currentScore = 0;
        this.targetAcknowledgedState = false;
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
        this.targetAcknowledgedState = targetAcknowledged;
    }

    restore(snapshot: Game2048Snapshot): void {
        if (typeof snapshot.targetAcknowledged !== 'boolean') {
            throw new Error('2048 target acknowledgement must be boolean.');
        }
        this.loadForTesting(snapshot.board, snapshot.score, snapshot.targetAcknowledged);
    }

    acknowledgeTarget(): void {
        if (this.highestTile >= TARGET_TILE) this.targetAcknowledgedState = true;
    }

    move(direction: Game2048Direction): Game2048MoveResult {
        const next = [...this.cells];
        const mergedIndices: number[] = [];
        const tileMotions: Game2048TileMotion[] = [];
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
            result.motions.forEach((motion) => {
                tileMotions.push({
                    fromIndex: indices[motion.fromOffset],
                    toIndex: indices[motion.toOffset],
                    value: motion.value,
                    merges: motion.merges,
                });
            });
        }

        const changed = next.some((value, index) => value !== this.cells[index]);
        if (!changed) {
            return Object.freeze({
                changed: false,
                scoreGained: 0,
                mergedIndices: Object.freeze([]),
                tileMotions: Object.freeze([]),
                reachedTarget: false,
                gameOver: !this.hasAvailableMove,
            });
        }

        this.cells = next;
        this.currentScore += scoreGained;
        const spawned = this.spawn();
        const reachedTarget = this.needsTargetCelebration;

        return Object.freeze({
            changed: true,
            scoreGained,
            mergedIndices: Object.freeze([...mergedIndices]),
            tileMotions: Object.freeze(tileMotions.map((motion) => Object.freeze({ ...motion }))),
            ...(spawned ? { spawned } : {}),
            reachedTarget,
            gameOver: !this.hasAvailableMove,
        });
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
