export const BOARD_SIZE = 4;
export const MILESTONE_TILE = 2048;
export const TARGET_TILE = 8192;
/** 依次各庆祝一次的档位：2048、4096 是里程碑，最后一档是终极目标。 */
export const CELEBRATION_TILES: readonly number[] = Object.freeze([MILESTONE_TILE, 4096, TARGET_TILE]);
/** v4 及更早存档的终极目标是 4096，迁移旧确认标记时用到。 */
const LEGACY_TARGET_TILE = 4096;

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
    /** 已庆祝过的最高档（CELEBRATION_TILES 之一，0 表示尚未庆祝）。 */
    readonly celebratedTile?: number;
    /** 旧版字段，仅用于迁移：终极目标（当时为 4096）是否已确认。 */
    readonly targetAcknowledged?: boolean;
    /** 旧版字段，仅用于迁移：2048 里程碑是否已确认。 */
    readonly milestoneAcknowledged?: boolean;
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
    private celebratedTileState = 0;

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

    /** 已达到但尚未庆祝的最高档；没有则为 undefined。 */
    get pendingCelebration(): number | undefined {
        const highest = this.highestTile;
        let pending: number | undefined;
        CELEBRATION_TILES.forEach((tile) => {
            if (tile <= highest && tile > this.celebratedTileState) pending = tile;
        });
        return pending;
    }

    get needsTargetCelebration(): boolean {
        return this.pendingCelebration === TARGET_TILE;
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
            celebratedTile: this.celebratedTileState,
        });
    }

    setRandomSource(random: () => number): void {
        this.random = random;
    }

    reset(): readonly Game2048Spawn[] {
        this.cells = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
        this.currentScore = 0;
        this.celebratedTileState = 0;
        return Object.freeze([this.spawn(), this.spawn()].filter((spawn): spawn is Game2048Spawn => !!spawn));
    }

    loadForTesting(board: readonly number[], score = 0, celebratedTile = 0): void {
        if (!Number.isFinite(score) || score < 0) throw new Error('2048 score must be non-negative.');
        if (!Number.isFinite(celebratedTile) || celebratedTile < 0) throw new Error('2048 celebrated tile must be non-negative.');
        this.cells = requireBoard(board);
        this.currentScore = Math.floor(score);
        // 已庆祝档位不能高于棋盘上实际达到的档位：撤销回到达成之前时，再次达成也应重新庆祝。
        const highest = this.highestTile;
        this.celebratedTileState = CELEBRATION_TILES.reduce(
            (celebrated, tile) => (tile <= celebratedTile && tile <= highest ? tile : celebrated),
            0,
        );
    }

    restore(snapshot: Game2048Snapshot): void {
        let celebrated = snapshot.celebratedTile;
        if (celebrated === undefined) {
            // v4 存档迁移：终极目标当时是 4096，里程碑是 2048。
            if (snapshot.targetAcknowledged !== undefined && typeof snapshot.targetAcknowledged !== 'boolean') {
                throw new Error('2048 target acknowledgement must be boolean.');
            }
            if (snapshot.milestoneAcknowledged !== undefined && typeof snapshot.milestoneAcknowledged !== 'boolean') {
                throw new Error('2048 milestone acknowledgement must be boolean.');
            }
            celebrated = snapshot.targetAcknowledged ? LEGACY_TARGET_TILE
                : snapshot.milestoneAcknowledged ? MILESTONE_TILE
                    : 0;
        } else if (typeof celebrated !== 'number') {
            throw new Error('2048 celebrated tile must be a number.');
        }
        this.loadForTesting(snapshot.board, snapshot.score, celebrated);
    }

    /** 确认当前待庆祝的档位（以及它之下的所有档位）。 */
    acknowledgeCelebration(): void {
        const pending = this.pendingCelebration;
        if (pending !== undefined) this.celebratedTileState = pending;
    }

    /** 激励广告奖励：清除棋盘上所有 2 和 4，并保留其余棋子继续游戏。 */
    clearSmallTiles(): number {
        let cleared = 0;
        this.cells = this.cells.map((value) => {
            if (value === 2 || value === 4) {
                cleared += 1;
                return 0;
            }
            return value;
        });
        return cleared;
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
