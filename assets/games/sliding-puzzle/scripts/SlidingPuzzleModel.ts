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
    });

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

    get shuffleSteps(): number {
        return this.shuffleCount;
    }

    reset(size: SlidingPuzzleBoardSize = 4, shuffleSteps?: number): SlidingPuzzleSnapshot {
        if (!isBoardSize(size)) {
            throw new Error(`Sliding puzzle board size must be one of ${SLIDING_PUZZLE_BOARD_SIZES.join(', ')}.`);
        }

        this.size = size;
        this.tiles = Array.from(
            { length: size * size },
            (_value, index) => index === size * size - 1 ? 0 : index + 1,
        );
        this.empty = this.tiles.length - 1;
        this.moveCount = 0;
        this.shuffleCount = Math.max(
            0,
            Math.floor(shuffleSteps ?? SLIDING_PUZZLE_SHUFFLE_STEPS[size]),
        );
        this.shuffle();
        this.moveCount = 0;
        return this.snapshot;
    }

    /** 测试和回放使用；正式流程使用 reset 生成可解局面。 */
    loadForTesting(board: readonly number[], moves = 0): SlidingPuzzleSnapshot {
        const size = Math.sqrt(board.length);
        if (!Number.isInteger(size) || !isBoardSize(size)) {
            throw new Error('Sliding puzzle test board must be a square with size 3 to 6.');
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

    private shuffle(): void {
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
            const direction = choices[this.randomIndex(choices.length)];
            if (!direction) {
                break;
            }

            const result = this.move(direction);
            if (result.changed) {
                previous = direction;
                remaining -= 1;
            }
        }

        // 选关页约定空位落在右下角，但这不代表空位是固定的：
        // 开局后玩家仍可把相邻方块滑入空位。把空位沿合法移动带回目标角，
        // 既保留从完成局面生成的可解性，也让玩家一眼知道最终缺口在哪。
        this.returnEmptyToBottomRight();

        // 极端的固定随机源也不能让开始按钮得到一个已完成的“乱序”局面。
        if (this.isSolved && this.tiles.length > 1) {
            this.createNonSolvedBottomRightState();
        }
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
        // 3×3～6×6 都满足这些方向的邻接条件。
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

    private randomIndex(length: number): number {
        if (length <= 1) {
            return 0;
        }

        const randomValue = this.random();
        const value = Number.isFinite(randomValue) ? randomValue : 0;
        return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
    }
}
