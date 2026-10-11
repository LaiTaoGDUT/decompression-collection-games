import type { Game2048MoveResult } from './Game2048Model';

export interface Game2048ChainState {
    /** 连续递进合成的次数：同一块棋子每一步都再合成翻倍一次就 +1。 */
    readonly count: number;
    /** 链头棋子（最近一次合成结果）所在格。 */
    readonly index: number;
    readonly value: number;
}

/**
 * 追踪"连续递进合成"：上一步合成出的棋子，这一步再次参与合并（4 → 8 → 16 → 32），连击数递增。
 * 链头这一步没有参与合并（或这一步完全没有合并）时连击中断；若这一步有其他合并，则以其中最大的
 * 合成结果重新计 1。只依赖移动结果与移动后的棋盘，不持有任何引擎对象。
 */
export class Game2048MergeChain {
    private state?: Game2048ChainState;

    get current(): Game2048ChainState | undefined {
        return this.state;
    }

    reset(): void {
        this.state = undefined;
    }

    /** 根据一次已生效的移动更新连击，返回更新后的状态（没有任何合并时为 undefined）。 */
    advance(result: Game2048MoveResult, board: readonly number[]): Game2048ChainState | undefined {
        if (result.mergedIndices.length === 0) {
            this.state = undefined;
            return undefined;
        }

        const previous = this.state;
        if (previous) {
            const motion = result.tileMotions.find((candidate) => candidate.fromIndex === previous.index);
            const value = motion ? board[motion.toIndex] ?? 0 : 0;
            if (motion?.merges && value === previous.value * 2) {
                this.state = Object.freeze({ count: previous.count + 1, index: motion.toIndex, value });
                return this.state;
            }
        }

        let index = result.mergedIndices[0];
        result.mergedIndices.forEach((candidate) => {
            if ((board[candidate] ?? 0) > (board[index] ?? 0)) index = candidate;
        });
        this.state = Object.freeze({ count: 1, index, value: board[index] ?? 0 });
        return this.state;
    }
}
