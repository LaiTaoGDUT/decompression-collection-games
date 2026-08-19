import type { LocalImageSelection } from '../../../core/types/CommonTypes';

export const SLIDING_PUZZLE_BOARD_SIZES = [3, 4, 5, 6] as const;

export type SlidingPuzzleBoardSize = typeof SLIDING_PUZZLE_BOARD_SIZES[number];
export type SlidingPuzzleDirection = 'up' | 'down' | 'left' | 'right';
export type SlidingPuzzleImageSource = 'preset' | 'local';

export interface SlidingPuzzleCrop {
    readonly scale: number;
    readonly offsetX: number;
    readonly offsetY: number;
}

export interface SlidingPuzzleRoundConfig {
    readonly boardSize: SlidingPuzzleBoardSize;
    readonly imageSource: SlidingPuzzleImageSource;
    readonly imageUri?: string;
    readonly presetAssetPath?: string;
    readonly crop?: SlidingPuzzleCrop;
}

export interface SlidingPuzzleMoveResult {
    readonly changed: boolean;
    readonly direction: SlidingPuzzleDirection;
    readonly movedTile?: number;
    readonly fromIndex?: number;
    readonly toIndex?: number;
    readonly emptyIndex: number;
    readonly moves: number;
    readonly completed: boolean;
}

export interface SlidingPuzzleSnapshot {
    readonly size: SlidingPuzzleBoardSize;
    readonly board: readonly number[];
    readonly emptyIndex: number;
    readonly moves: number;
    readonly completed: boolean;
}

export interface SlidingPuzzleCropResult {
    readonly selection: LocalImageSelection;
    readonly crop: SlidingPuzzleCrop;
}
