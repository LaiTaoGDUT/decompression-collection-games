import {
    SLIDING_PUZZLE_BOARD_SIZES,
    type SlidingPuzzleBoardSize,
    type SlidingPuzzleDirection,
    type SlidingPuzzleMoveResult,
    type SlidingPuzzleSnapshot,
} from './SlidingPuzzleTypes';

export const SLIDING_PUZZLE_SHUFFLE_STEPS: Readonly<Record<SlidingPuzzleBoardSize, number>> =
    Object.freeze({
        3: 40,
        4: 80,
        5: 160,
        6: 280,
        7: 420,
    });

/** 以实际局面衡量开局难度；空位固定在右下角，不计入错位块数。 */
const SHUFFLE_QUALITY_FLOORS: Readonly<Record<SlidingPuzzleBoardSize, Readonly<{
    misplaced: number;
    manhattan: number;
}>>> = Object.freeze({
    3: { misplaced: 5, manhattan: 10 },
    4: { misplaced: 11, manhattan: 22 },
    5: { misplaced: 18, manhattan: 40 },
    6: { misplaced: 28, manhattan: 68 },
    7: { misplaced: 40, manhattan: 102 },
});
const MAX_SHUFFLE_ATTEMPTS = 16;
const EXTERNAL_RANDOM_ATTEMPTS = 8;

const ALL_DIRECTIONS: readonly SlidingPuzzleDirection[] = ['up', 'down', 'left', 'right'];

function isBoardSize(value: number): value is SlidingPuzzleBoardSize {
    return SLIDING_PUZZLE_BOARD_SIZES.some((size) => size === value);
}

function oppositeDirection(direction: SlidingPuzzleDirection): SlidingPuzzleDirection {
    switch (direction) {
        case 'up':
            return 'down';
        case 'down':
            return 'up';
        case 'left':
            return 'right';
        case 'right':
            return 'left';
    }
}

/** 无 Cocos 依赖的滑块拼图规则模型，方便单元测试和后续换皮。 */
export class SlidingPuzzleModel {
    private size: SlidingPuzzleBoardSize = 4;
    private tiles: number[] = [];
    private empty = 0;
    private moveCount = 0;
    private shuffleCount = SLIDING_PUZZLE_SHUFFLE_STEPS[4];

    constructor(private readonly random: () => number = Math.random) {
        this.reset(4);
    }

    get boardSize(): SlidingPuzzleBoardSize {
        return this.size;
    }

    get emptyIndex(): number {
        return this.empty;
    }

    get moves(): number {
        return this.moveCount;
    }

    get isSolved(): boolean {
        const last = this.tiles.length - 1;
        for (let index = 0; index < last; index += 1) {
            if (this.tiles[index] !== index + 1) {
                return false;
            }
        }

        return this.tiles[last] === 0;
    }

    get snapshot(): SlidingPuzzleSnapshot {
        return Object.freeze({
            size: this.size,
            board: Object.freeze([...this.tiles]),
            emptyIndex: this.empty,
            moves: this.moveCount,
            completed: this.isSolved,
        });
    }

    /** 从持久化快照恢复正式局面；任何不完整或不可解的数据都拒绝载入。 */
    restore(snapshot: SlidingPuzzleSnapshot): SlidingPuzzleSnapshot {
        if (!isBoardSize(snapshot.size)) {
            throw new Error(`Sliding puzzle board size must be one of ${SLIDING_PUZZLE_BOARD_SIZES.join(', ')}.`);
        }

        const tileCount = snapshot.size * snapshot.size;
        if (snapshot.board.length !== tileCount) {
            throw new Error('Sliding puzzle snapshot board length does not match its size.');
        }

        const expected = new Set(Array.from({ length: tileCount }, (_value, index) => index));
        if (snapshot.board.some((value) => !Number.isInteger(value) || !expected.delete(value))
            || expected.size !== 0) {
            throw new Error('Sliding puzzle snapshot must contain every tile exactly once.');
        }

        const emptyIndex = snapshot.board.indexOf(0);
        if (!Number.isInteger(snapshot.emptyIndex) || snapshot.emptyIndex !== emptyIndex) {
            throw new Error('Sliding puzzle snapshot empty index is inconsistent with its board.');
        }
        if (!Number.isFinite(snapshot.moves) || !Number.isInteger(snapshot.moves) || snapshot.moves < 0) {
            throw new Error('Sliding puzzle snapshot move count must be a non-negative integer.');
        }
        if (!this.isSolvable(snapshot.board, snapshot.size, emptyIndex)) {
            throw new Error('Sliding puzzle snapshot board is not solvable.');
        }

        const completed = snapshot.board.every((tile, index) => (
            index === tileCount - 1 ? tile === 0 : tile === index + 1
        ));
        if (snapshot.completed !== completed) {
            throw new Error('Sliding puzzle snapshot completion flag is inconsistent with its board.');
        }

        this.size = snapshot.size;
        this.tiles = Array.from(snapshot.board);
        this.empty = emptyIndex;
        this.moveCount = snapshot.moves;
        this.shuffleCount = SLIDING_PUZZLE_SHUFFLE_STEPS[snapshot.size];
        return this.snapshot;
    }

    get shuffleSteps(): number {
        return this.shuffleCount;
    }

    reset(size: SlidingPuzzleBoardSize = 4, shuffleSteps?: number): SlidingPuzzleSnapshot {
        if (!isBoardSize(size)) {
            throw new Error(`Sliding puzzle board size must be one of ${SLIDING_PUZZLE_BOARD_SIZES.join(', ')}.`);
        }

        this.size = size;
        this.shuffleCount = Math.max(
            0,
            Math.floor(shuffleSteps ?? SLIDING_PUZZLE_SHUFFLE_STEPS[size]),
        );
        this.shuffle(shuffleSteps === undefined);
        this.moveCount = 0;
        return this.snapshot;
    }

    /** 测试和回放使用；正式流程使用 reset 生成可解局面。 */
    loadForTesting(board: readonly number[], moves = 0): SlidingPuzzleSnapshot {
        const size = Math.sqrt(board.length);
        if (!Number.isInteger(size) || !isBoardSize(size)) {
            throw new Error(`Sliding puzzle test board must be a square with size ${SLIDING_PUZZLE_BOARD_SIZES.join(', ')}.`);
        }

        const expected = new Set(Array.from({ length: board.length }, (_value, index) => index));
        if (board.some((value) => !Number.isInteger(value) || !expected.delete(value))
            || expected.size !== 0) {
            throw new Error('Sliding puzzle test board must contain every tile exactly once.');
        }

        this.size = size;
        this.tiles = [...board];
        this.empty = this.tiles.indexOf(0);
        this.moveCount = Math.max(0, Math.floor(moves));
        this.shuffleCount = 0;
        return this.snapshot;
    }

    private isSolvable(
        board: readonly number[],
        size: SlidingPuzzleBoardSize,
        emptyIndex: number,
    ): boolean {
        let inversions = 0;
        for (let left = 0; left < board.length; left += 1) {
            if (board[left] === 0) continue;
            for (let right = left + 1; right < board.length; right += 1) {
                if (board[right] !== 0 && board[left] > board[right]) {
                    inversions += 1;
                }
            }
        }

        if (size % 2 === 1) {
            return inversions % 2 === 0;
        }
        const emptyRowFromBottom = size - Math.floor(emptyIndex / size);
        return (inversions + emptyRowFromBottom) % 2 === 1;
    }

    canMove(direction: SlidingPuzzleDirection): boolean {
        return this.findSourceIndex(direction) >= 0;
    }

    move(direction: SlidingPuzzleDirection): SlidingPuzzleMoveResult {
        const sourceIndex = this.findSourceIndex(direction);
        if (sourceIndex < 0) {
            return {
                changed: false,
                direction,
                emptyIndex: this.empty,
                moves: this.moveCount,
                completed: this.isSolved,
            };
        }

        const movedTile = this.tiles[sourceIndex];
        const targetIndex = this.empty;
        this.tiles[targetIndex] = movedTile;
        this.tiles[sourceIndex] = 0;
        this.empty = sourceIndex;
        this.moveCount += 1;

        return {
            changed: true,
            direction,
            movedTile,
            fromIndex: sourceIndex,
            toIndex: targetIndex,
            emptyIndex: this.empty,
            moves: this.moveCount,
            completed: this.isSolved,
        };
    }

    /** 点击方块时使用：只有与空位正交相邻的方块可以滑入空位。 */
    moveTileAt(index: number): SlidingPuzzleMoveResult {
        if (!Number.isInteger(index) || index < 0 || index >= this.tiles.length || index === this.empty) {
            return this.createNoMoveResult('up');
        }

        const emptyRow = Math.floor(this.empty / this.size);
        const emptyColumn = this.empty % this.size;
        const tileRow = Math.floor(index / this.size);
        const tileColumn = index % this.size;
        let direction: SlidingPuzzleDirection | undefined;

        if (tileRow === emptyRow && tileColumn === emptyColumn - 1) {
            direction = 'right';
        } else if (tileRow === emptyRow && tileColumn === emptyColumn + 1) {
            direction = 'left';
        } else if (tileColumn === emptyColumn && tileRow === emptyRow - 1) {
            direction = 'down';
        } else if (tileColumn === emptyColumn && tileRow === emptyRow + 1) {
            direction = 'up';
        }

        return direction ? this.move(direction) : this.createNoMoveResult('up');
    }

    private shuffle(enforceQuality: boolean): void {
        const floor = SHUFFLE_QUALITY_FLOORS[this.size];
        const attempts = enforceQuality ? MAX_SHUFFLE_ATTEMPTS : 1;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            this.tiles = Array.from(
                { length: this.size * this.size },
                (_value, index) => index === this.size * this.size - 1 ? 0 : index + 1,
            );
            this.empty = this.tiles.length - 1;
            this.moveCount = 0;
            const random = attempt < EXTERNAL_RANDOM_ATTEMPTS
                ? this.random
                : this.createFallbackRandom(attempt);
            this.shuffleWalk(random);
            this.returnEmptyToBottomRight();
            if (this.isSolved && this.tiles.length > 1) this.createNonSolvedBottomRightState();

            if (!enforceQuality) return;
            const quality = this.shuffleQuality();
            if (quality.misplaced >= floor.misplaced && quality.manhattan >= floor.manhattan) return;
        }

        // 有界重抽后仍无合格局面时，构造一个满足门槛的可解局面。
        this.createDeterministicFallback();
    }

    private shuffleWalk(random: () => number): void {
        let previous: SlidingPuzzleDirection | undefined;
        let remaining = this.shuffleCount;
        let guard = 0;

        while (remaining > 0 && guard < this.shuffleCount * 4 + 12) {
            guard += 1;
            const candidates = ALL_DIRECTIONS.filter((direction) => (
                direction !== (previous ? oppositeDirection(previous) : undefined)
                && this.canMove(direction)
            ));
            const choices = candidates.length > 0
                ? candidates
                : ALL_DIRECTIONS.filter((direction) => this.canMove(direction));
            const direction = choices[this.randomIndex(choices.length, random)];
            if (!direction) {
                break;
            }

            const result = this.move(direction);
            if (result.changed) {
                previous = direction;
                remaining -= 1;
            }
        }
    }

    private shuffleQuality(): { misplaced: number; manhattan: number } {
        let misplaced = 0;
        let manhattan = 0;
        for (let index = 0; index < this.tiles.length; index += 1) {
            const tile = this.tiles[index];
            if (tile === 0) continue;
            const target = tile - 1;
            if (index !== target) misplaced += 1;
            manhattan += Math.abs(Math.floor(index / this.size) - Math.floor(target / this.size))
                + Math.abs(index % this.size - target % this.size);
        }
        return { misplaced, manhattan };
    }

    private createFallbackRandom(attempt: number): () => number {
        // 注入的随机源可能恒定或无效；不同种子仍要能生成不同的合法移动序列。
        let state = (Math.imul(this.size, 0x85ebca6b)
            ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
        return () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    private createDeterministicFallback(): void {
        const numberedTiles = this.size * this.size - 1;
        const rotation = this.size % 2 === 0 ? 1 : 2;
        // 偶数宽移动 1 位、奇数宽移动 2 位，逆序数均为偶数；右下角仍为空位。
        this.tiles = Array.from(
            { length: numberedTiles },
            (_value, index) => (index + rotation) % numberedTiles + 1,
        );
        this.tiles.push(0);
        this.empty = numberedTiles;
    }

    private returnEmptyToBottomRight(): void {
        const target = this.tiles.length - 1;
        let guard = 0;
        const guardLimit = this.tiles.length * 4 + 4;

        while (this.empty !== target && guard < guardLimit) {
            guard += 1;
            const row = Math.floor(this.empty / this.size);
            const column = this.empty % this.size;

            // move() 的 direction 描述“方块滑入空位”的方向，
            // 所以空位向下/向右移动时分别要选择 up/left。
            const direction: SlidingPuzzleDirection = row < this.size - 1
                ? 'up'
                : column < this.size - 1
                    ? 'left'
                    : row > 0
                        ? 'down'
                        : 'right';
            if (!this.move(direction).changed) {
                break;
            }
        }
    }

    private createNonSolvedBottomRightState(): void {
        // 这条四步合法路径以右下角为空位结束，同时会扰动至少三块方块。
        // 3×3～7×7 都满足这些方向的邻接条件。
        const fallback: readonly SlidingPuzzleDirection[] = ['right', 'down', 'left', 'up'];
        fallback.forEach((direction) => {
            this.move(direction);
        });
    }

    private findSourceIndex(direction: SlidingPuzzleDirection): number {
        const row = Math.floor(this.empty / this.size);
        const column = this.empty % this.size;

        switch (direction) {
            case 'up':
                return row < this.size - 1 ? this.empty + this.size : -1;
            case 'down':
                return row > 0 ? this.empty - this.size : -1;
            case 'left':
                return column < this.size - 1 ? this.empty + 1 : -1;
            case 'right':
                return column > 0 ? this.empty - 1 : -1;
        }
    }

    private createNoMoveResult(direction: SlidingPuzzleDirection): SlidingPuzzleMoveResult {
        return {
            changed: false,
            direction,
            emptyIndex: this.empty,
            moves: this.moveCount,
            completed: this.isSolved,
        };
    }

    private randomIndex(length: number, random: () => number): number {
        if (length <= 1) {
            return 0;
        }

        const randomValue = random();
        const value = Number.isFinite(randomValue) ? randomValue : 0;
        return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
    }
}
