import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';

export const SLIDING_PUZZLE_DESIGN_WIDTH = 750;
export const SLIDING_PUZZLE_DESIGN_HEIGHT = 1334;
export const SLIDING_PUZZLE_TOUCH_SIZE = 88;

export interface SlidingPuzzleBackgroundCover {
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly x: number;
    readonly y: number;
}

export interface SlidingPuzzleLayoutMetrics {
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly headerY: number;
    readonly titleY: number;
    readonly boardCenterY: number;
    readonly boardSize: number;
    readonly cellSize: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly footerY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

/** 按 Cocos Canvas 坐标计算，左右不额外缩窄，纵向仅使用平台安全区。 */
export function calculateSlidingPuzzleLayout(
    viewportWidth: number,
    viewportHeight: number,
    platformLayout?: PlatformLayoutInfo,
    boardSize = 4,
): SlidingPuzzleLayoutMetrics {
    const width = Math.max(1, viewportWidth);
    const height = Math.max(1, viewportHeight);
    const safeTop = clamp(platformLayout?.safeArea.top ?? 0, 0, height * 0.32);
    const safeBottom = clamp(
        height - (platformLayout?.safeArea.bottom ?? height),
        0,
        height * 0.32,
    );
    const headerY = height / 2 - safeTop - 76;
    const titleY = headerY - 68;
    const footerY = -height / 2 + safeBottom + 54;
    const boardAvailableHeight = Math.max(260, height - safeTop - safeBottom - 390);
    const board = clamp(
        Math.min(width - 56, boardAvailableHeight),
        Math.min(292, width - 32),
        Math.min(620, width - 32),
    );
    const boardTopFromTop = safeTop + 226;
    const boardBottomFromTop = boardTopFromTop + board;
    const usableTop = safeTop + 178;
    const usableBottom = height - safeBottom - 124;
    const centeredTop = Math.max(
        usableTop,
        Math.min(boardTopFromTop, (usableTop + usableBottom - board) / 2),
    );
    const boardCenterY = height / 2 - (centeredTop + board / 2);
    const pauseX = width / 2 - 58;

    return Object.freeze({
        viewportWidth: width,
        viewportHeight: height,
        safeTop,
        safeBottom,
        headerY,
        titleY,
        boardCenterY,
        boardSize: board,
        cellSize: board / Math.max(3, Math.min(6, boardSize)),
        pauseX,
        pauseY: headerY,
        footerY,
    });
}

export function calculateSlidingPuzzleBackgroundCover(
    textureWidth: number,
    textureHeight: number,
    viewportWidth: number,
    viewportHeight: number,
): SlidingPuzzleBackgroundCover {
    const sourceWidth = Math.max(1, textureWidth);
    const sourceHeight = Math.max(1, textureHeight);
    const width = Math.max(1, viewportWidth);
    const height = Math.max(1, viewportHeight);
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;

    return Object.freeze({
        scale,
        width: renderedWidth,
        height: renderedHeight,
        x: (width - renderedWidth) / 2,
        y: (height - renderedHeight) / 2,
    });
}
