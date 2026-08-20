import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';

export const GAME_2048_DESIGN_WIDTH = 750;
export const GAME_2048_DESIGN_HEIGHT = 1334;
export const GAME_2048_BACKGROUND_ASPECT = GAME_2048_DESIGN_WIDTH / GAME_2048_DESIGN_HEIGHT;
// 顶部 HUD 使用全屏可见宽度；棋盘外框仍保留约 23 个设计坐标的横向间距。
export const GAME_2048_BOARD_SIZE = 680;
export const GAME_2048_BOARD_NODE_SIZE = GAME_2048_BOARD_SIZE + 24;
// 标题 Logo 与两张分数卡片的整体视觉宽度对齐（220×2 + 两侧间距 32），保持素材约 3:1 比例。
export const GAME_2048_TITLE_WIDTH = 472;
export const GAME_2048_TITLE_HEIGHT = 472 / 3;
export const GAME_2048_SCORE_CARD_WIDTH = 220;
export const GAME_2048_SCORE_CARD_HEIGHT = 104;
export const GAME_2048_PAUSE_TOUCH_SIZE = 88;
export const GAME_2048_PAUSE_ICON_SIZE = 64;
export const GAME_2048_PAUSE_EDGE_INSET = 24;
export const GAME_2048_CHEAT_BUTTON_WIDTH = 104;
export const GAME_2048_CHEAT_BUTTON_HEIGHT = 52;
export const GAME_2048_CHEAT_BUTTON_GAP = 8;

export interface Game2048LayoutInsets {
    readonly safeTop?: number;
    readonly safeBottom?: number;
    readonly safeLeft?: number;
    readonly safeRight?: number;
    readonly topRightReservedBottom?: number;
}

export interface Game2048LayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeLeft: number;
    readonly safeRight: number;
    readonly contentX: number;
    readonly contentWidth: number;
    readonly fitScale: number;
    readonly titleX: number;
    readonly titleY: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly cheatX: number;
    readonly cheatY: number;
    readonly scoreLeftX: number;
    readonly scoreRightX: number;
    readonly scoreY: number;
    readonly boardX: number;
    readonly boardY: number;
    readonly boardScale: number;
    readonly boardWorldSize: number;
    readonly hintX: number;
    readonly hintY: number;
    readonly hintWidth: number;
    readonly hintHeight: number;
    readonly backgroundWidth: number;
    readonly backgroundHeight: number;
}

export function calculateGame2048BackgroundCover(
    containerWidth: number,
    containerHeight: number,
    artworkAspect = GAME_2048_BACKGROUND_ASPECT,
): { readonly width: number; readonly height: number } {
    const width = Math.max(0, containerWidth);
    const height = Math.max(0, containerHeight);
    if (width <= 0 || height <= 0 || artworkAspect <= 0) {
        return Object.freeze({ width: 0, height: 0 });
    }

    const targetAspect = width / height;
    if (targetAspect > artworkAspect) {
        return Object.freeze({ width, height: width / artworkAspect });
    }

    return Object.freeze({ width: height * artworkAspect, height });
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeInsets(
    width: number,
    height: number,
    insets: Game2048LayoutInsets,
): Pick<Game2048LayoutMetrics, 'safeTop' | 'safeBottom' | 'safeLeft' | 'safeRight'> {
    let safeTop = clamp(Math.max(0, insets.safeTop ?? 0), 0, height * 0.45);
    let safeBottom = clamp(Math.max(0, insets.safeBottom ?? 0), 0, height * 0.45);
    if (safeTop + safeBottom > height - 1) {
        const ratio = (height - 1) / Math.max(1, safeTop + safeBottom);
        safeTop *= ratio;
        safeBottom *= ratio;
    }

    let safeLeft = clamp(Math.max(0, insets.safeLeft ?? 0), 0, width * 0.45);
    let safeRight = clamp(Math.max(0, insets.safeRight ?? 0), 0, width * 0.45);
    if (safeLeft + safeRight > width - 1) {
        const ratio = (width - 1) / Math.max(1, safeLeft + safeRight);
        safeLeft *= ratio;
        safeRight *= ratio;
    }

    return { safeTop, safeBottom, safeLeft, safeRight };
}

/**
 * 2048 的 UI 使用宽度基准缩放；只有棋盘会继续受底部安全区约束而缩小。
 * 所有坐标均为绑定 UI Camera 后的 Canvas 坐标，原点在画布中心。
 */
export function calculateGame2048Layout(
    canvasWidth: number,
    canvasHeight: number,
    insets: Game2048LayoutInsets = {},
): Game2048LayoutMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const normalized = normalizeInsets(width, height, insets);
    // 2048 的标题、分数和暂停操作区按屏幕可见宽度布局，不额外扣除左右系统安全区。
    // 顶部胶囊和上下安全区仍由 safeTop/safeBottom 参与纵向计算。
    const contentWidth = width;
    const contentX = 0;
    const fitScale = Math.max(0.001, contentWidth / GAME_2048_DESIGN_WIDTH);

    const titleHeight = GAME_2048_TITLE_HEIGHT * fitScale;
    const pauseWidth = GAME_2048_PAUSE_TOUCH_SIZE * fitScale;
    const pauseHeight = GAME_2048_PAUSE_TOUCH_SIZE * fitScale;
    const reservedBottom = Math.max(0, insets.topRightReservedBottom ?? 0);
    // 标题需要同时避让顶部安全区和微信胶囊，额外留出 12 设计像素缓冲。
    const titleTopFromTop = Math.max(normalized.safeTop, reservedBottom) + 12 * fitScale;
    const titleCenterFromTop = titleTopFromTop + titleHeight / 2;
    const pauseDefaultCenterFromTop = normalized.safeTop + 116 * fitScale;
    const pauseReservedCenterFromTop = reservedBottom + 10 * fitScale + pauseHeight / 2;
    const pauseCenterFromTop = Math.max(pauseDefaultCenterFromTop, pauseReservedCenterFromTop);
    const titleY = height / 2 - titleCenterFromTop;
    const pauseY = height / 2 - pauseCenterFromTop;
    // 暂停图标独立于屏幕右边缘，触摸热区右侧保留 24 个设计像素。
    const pauseX = contentX + contentWidth / 2
        - pauseWidth / 2
        - GAME_2048_PAUSE_EDGE_INSET * fitScale;
    const cheatHeight = GAME_2048_CHEAT_BUTTON_HEIGHT * fitScale;
    const cheatGap = GAME_2048_CHEAT_BUTTON_GAP * fitScale;
    const cheatCenterFromTop = pauseCenterFromTop + pauseHeight / 2 + cheatGap + cheatHeight / 2;
    const cheatY = height / 2 - cheatCenterFromTop;

    const topBlockBottomFromTop = Math.max(
        titleCenterFromTop + titleHeight / 2,
        pauseCenterFromTop + pauseHeight / 2,
    );
    const scoreHeight = GAME_2048_SCORE_CARD_HEIGHT * fitScale;
    const scoreCenterFromTop = topBlockBottomFromTop + 24 * fitScale + scoreHeight / 2;
    const scoreY = height / 2 - scoreCenterFromTop;
    const scoreLeftX = contentX - 126 * fitScale;
    const scoreRightX = contentX + 126 * fitScale;

    const scoreBottomFromTop = scoreCenterFromTop + scoreHeight / 2;
    const boardTopFromTop = scoreBottomFromTop + 72 * fitScale;
    const hintHeight = 42 * fitScale;
    const hintBelowBoard = 70 * fitScale;
    const bottomPadding = 12 * fitScale;
    const availableToBottom = height - normalized.safeBottom - bottomPadding - boardTopFromTop;
    const boardOuterHalf = GAME_2048_BOARD_NODE_SIZE / 2;
    const boardSurfaceHalf = GAME_2048_BOARD_SIZE / 2;
    const hintHalf = hintHeight / 2;
    const boardScaleForOuter = availableToBottom / GAME_2048_BOARD_NODE_SIZE;
    const boardScaleForHint = (
        availableToBottom - hintBelowBoard - hintHalf
    ) / (boardOuterHalf + boardSurfaceHalf);
    const boardScale = Math.max(
        0.01,
        Math.min(fitScale, boardScaleForOuter, boardScaleForHint),
    );
    const boardWorldSize = GAME_2048_BOARD_SIZE * boardScale;
    const boardY = height / 2 - boardTopFromTop - boardOuterHalf * boardScale;
    const hintX = contentX;
    const hintY = boardY - boardSurfaceHalf * boardScale - hintBelowBoard;

    const background = calculateGame2048BackgroundCover(width, height);
    return Object.freeze({
        width,
        height,
        ...normalized,
        contentX,
        contentWidth,
        fitScale,
        titleX: contentX,
        titleY,
        pauseX,
        pauseY,
        cheatX: pauseX,
        cheatY,
        scoreLeftX,
        scoreRightX,
        scoreY,
        boardX: contentX,
        boardY,
        boardScale,
        boardWorldSize,
        hintX,
        hintY,
        hintWidth: Math.max(1, contentWidth - 64 * fitScale),
        hintHeight,
        backgroundWidth: background.width,
        backgroundHeight: background.height,
    });
}

export function calculateGame2048LayoutFromPlatform(
    canvasWidth: number,
    canvasHeight: number,
    platformLayout?: PlatformLayoutInfo,
    systemInsets: Pick<Game2048LayoutInsets, 'safeTop' | 'safeBottom' | 'safeLeft' | 'safeRight'> = {},
): Game2048LayoutMetrics {
    const safeArea = platformLayout?.safeArea;
    return calculateGame2048Layout(canvasWidth, canvasHeight, {
        safeTop: Math.max(systemInsets.safeTop ?? 0, safeArea?.top ?? 0),
        safeBottom: Math.max(systemInsets.safeBottom ?? 0, canvasHeight - (safeArea?.bottom ?? canvasHeight)),
        safeLeft: Math.max(systemInsets.safeLeft ?? 0, safeArea?.left ?? 0),
        safeRight: Math.max(systemInsets.safeRight ?? 0, canvasWidth - (safeArea?.right ?? canvasWidth)),
        topRightReservedBottom: platformLayout?.topRightReservedArea?.bottom,
    });
}
