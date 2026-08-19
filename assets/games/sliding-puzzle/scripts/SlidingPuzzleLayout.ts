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
    /** 顶部安全区与微信胶囊下沿中较大的那个边界。 */
    readonly topReserved: number;
    readonly headerY: number;
    readonly titleY: number;
    readonly boardCenterY: number;
    readonly boardSize: number;
    readonly cellSize: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly footerY: number;
    readonly safeContentCenterY: number;
    readonly setupPanelCenterY: number;
    readonly setupPanelWidth: number;
    readonly setupPanelHeight: number;
}

export interface SlidingPuzzleTileSourceRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
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
    const capsuleBottom = platformLayout?.topRightReservedArea?.bottom ?? 0;
    // Web 预览可能没有平台胶囊数据，但仍给顶部控件保留一小段基线留白，
    // 这样浏览器里模拟刘海/胶囊时不会把 HUD 顶到屏幕边缘。
    const topReserved = clamp(Math.max(safeTop, capsuleBottom), 0, height * 0.32);
    // 顶部图标的触控热区也必须落在胶囊下方；在安全边界外再留一圈
    // 余量，标题和计时信息随后排在图标下方。
    const headerTopInset = Math.max(96, topReserved + SLIDING_PUZZLE_TOUCH_SIZE / 2 + 16);
    const headerY = height / 2 - headerTopInset;
    const titleY = height / 2 - (headerTopInset + 102);
    const footerY = -height / 2 + safeBottom + 54;

    const boardTopFromTop = headerTopInset + 154;
    const boardBottomLimit = height - safeBottom - 90;
    const boardAvailableHeight = Math.max(180, boardBottomLimit - boardTopFromTop);
    const boardMaxByWidth = Math.max(180, width - 48);
    const board = Math.min(
        Math.max(180, boardAvailableHeight),
        boardMaxByWidth,
    );
    const boardCenterY = height / 2 - (boardTopFromTop + board / 2);
    const pauseX = width / 2 - 64;

    const setupPanelTop = headerTopInset + 132;
    const setupPanelBottom = height - safeBottom - 54;
    const setupPanelHeight = Math.min(
        900,
        Math.max(520, setupPanelBottom - setupPanelTop),
    );
    const setupPanelWidth = Math.min(680, Math.max(280, width - 48));

    return Object.freeze({
        viewportWidth: width,
        viewportHeight: height,
        safeTop,
        safeBottom,
        topReserved,
        headerY,
        titleY,
        boardCenterY,
        boardSize: board,
        cellSize: board / Math.max(3, Math.min(6, boardSize)),
        pauseX,
        pauseY: headerY,
        footerY,
        safeContentCenterY: (safeBottom - topReserved) / 2,
        setupPanelCenterY: height / 2 - (setupPanelTop + setupPanelHeight / 2),
        setupPanelWidth,
        setupPanelHeight,
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

/**
 * Cocos SpriteFrame 的纹理矩形以左上角为原点；棋盘索引也按从上到下、
 * 从左到右排列。两边保持同一行序，最后一个索引才会对应原图右下角。
 */
export function calculateSlidingPuzzleTileSourceRect(
    cropX: number,
    cropY: number,
    cropSize: number,
    boardSize: number,
    tileIndex: number,
): SlidingPuzzleTileSourceRect {
    const size = Math.max(1, Math.floor(boardSize));
    const index = Math.max(0, Math.min(size * size - 1, Math.floor(tileIndex)));
    const cellSize = cropSize / size;
    const row = Math.floor(index / size);
    const column = index % size;

    return Object.freeze({
        x: cropX + column * cellSize,
        y: cropY + row * cellSize,
        width: cellSize,
        height: cellSize,
    });
}
