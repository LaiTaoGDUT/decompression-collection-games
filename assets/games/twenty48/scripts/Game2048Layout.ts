import type { PlatformLayoutInfo, PlatformUiRect } from '../../../core/types/CommonTypes';

export const GAME_2048_DESIGN_WIDTH = 750;
export const GAME_2048_DESIGN_HEIGHT = 1334;
export const GAME_2048_BACKGROUND_ASPECT = GAME_2048_DESIGN_WIDTH / GAME_2048_DESIGN_HEIGHT;
// 顶部 HUD 使用全屏可见宽度；棋盘外框仍保留约 23 个设计坐标的横向间距。
export const GAME_2048_BOARD_SIZE = 680;
export const GAME_2048_BOARD_NODE_SIZE = GAME_2048_BOARD_SIZE + 24;
// 标题节点保留霓虹灯管的原始构图比例（约 3.43:1）；实际显示由 titleScale 缩放。
export const GAME_2048_TITLE_WIDTH = 472;
export const GAME_2048_TITLE_HEIGHT = 472 * 275 / 944;
export const GAME_2048_SCORE_CARD_WIDTH = 220;
export const GAME_2048_SCORE_CARD_HEIGHT = 104;
export const GAME_2048_PAUSE_TOUCH_SIZE = 88;
/** 暂停图标（切角霓虹框，含外发光）的显示尺寸；触摸热区仍为 GAME_2048_PAUSE_TOUCH_SIZE。 */
export const GAME_2048_PAUSE_ICON_SIZE = 80;
export const GAME_2048_PAUSE_EDGE_INSET = 24;
/** 顶栏标题高度；宽度按素材 3:1 比例。标题与暂停按钮同一行，位于胶囊下方。 */
export const GAME_2048_TOP_BAR_TITLE_HEIGHT = 104;
/** 分数卡与棋盘之间的距离；顶排棋子上方的 "+N" 和连击标记会飘进这段留白。 */
const GAME_2048_HUD_BOARD_MIN_GAP = 80;
/** 棋盘下方危险提示的高度与间距。 */
const GAME_2048_HINT_HEIGHT = 42;
const GAME_2048_HINT_GAP = 14;
/** 底部操作栏：居中的撤销按钮，位于危险提示下方。 */
export const GAME_2048_ACTION_BAR_ITEM_WIDTH = 300;
export const GAME_2048_ACTION_BAR_ITEM_HEIGHT = 80;
const GAME_2048_ACTION_BAR_GAP = 10;
// 屏幕底部避让系统上滑退出手势的保护带（设计像素）：起点落在其中的滑动不再参与合成。
export const GAME_2048_BOTTOM_SWIPE_EXCLUSION = 128;

export interface Game2048LayoutInsets {
    readonly safeTop?: number;
    readonly safeBottom?: number;
    readonly safeLeft?: number;
    readonly safeRight?: number;
    /** 微信右上角胶囊按钮区域（设计坐标，自屏幕顶部量起）。 */
    readonly topRightReserved?: PlatformUiRect;
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
    /** 标题节点（按 GAME_2048_TITLE_WIDTH × HEIGHT 搭建）的整体缩放。 */
    readonly titleScale: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly scoreLeftX: number;
    readonly scoreRightX: number;
    readonly scoreY: number;
    readonly boardX: number;
    readonly boardY: number;
    readonly boardScale: number;
    readonly boardWorldSize: number;
    /** 底部操作栏（撤销按钮）的中心。 */
    readonly actionBarY: number;
    readonly undoButtonX: number;
    readonly hintX: number;
    readonly hintY: number;
    readonly hintWidth: number;
    readonly hintHeight: number;
    readonly backgroundWidth: number;
    readonly backgroundHeight: number;
    /** 屏幕底部不参与棋盘滑动的高度，避免与系统上滑退出手势抢事件。 */
    readonly bottomSwipeExclusion: number;
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
 * 2048 的布局自上而下分三段，所有尺寸按宽度基准（fitWidth）缩放：
 * 1. 顶栏：位于微信胶囊下方，居中标题与右侧暂停按钮在同一行、竖直居中对齐；
 * 2. 玩法组：分数卡 + 留白 + 棋盘 + 危险提示 + 底部操作栏，作为一个整体在顶栏下方到底部安全区之间竖直居中；
 *    高度不足时只等比缩小棋盘，高屏把富余空间均分到玩法组上下。
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
    // 横向按屏幕可见宽度布局，不额外扣除左右系统安全区；纵向避让顶部胶囊和上下安全区。
    const contentWidth = width;
    const contentX = 0;
    const fitScale = Math.max(0.001, contentWidth / GAME_2048_DESIGN_WIDTH);
    const toY = (fromTop: number) => height / 2 - fromTop;

    // 1. 顶栏：整行位于胶囊下方（无胶囊时贴着顶部安全区），标题居中、暂停按钮贴右边缘，两者竖直居中对齐。
    const capsule = insets.topRightReserved;
    const pauseHeight = GAME_2048_PAUSE_TOUCH_SIZE * fitScale;
    const titleTargetHeight = GAME_2048_TOP_BAR_TITLE_HEIGHT * fitScale;
    const rowHeight = Math.max(pauseHeight, titleTargetHeight);
    const rowTop = Math.max(normalized.safeTop, capsule ? capsule.bottom : 0) + 10 * fitScale;
    const barCenterFromTop = rowTop + rowHeight / 2;
    const pauseX = contentX + contentWidth / 2 - GAME_2048_PAUSE_EDGE_INSET * fitScale - pauseHeight / 2;
    // 标题宽度不超过到暂停按钮左缘的两倍，避免与按钮相碰。
    const pauseLeftFromCenter = pauseX - pauseHeight / 2 - contentX;
    const titleMaxWidth = Math.max(0, 2 * (pauseLeftFromCenter - 16 * fitScale));
    const titleHeight = Math.min(titleTargetHeight, titleMaxWidth * GAME_2048_TITLE_HEIGHT / GAME_2048_TITLE_WIDTH);
    const titleScale = Math.max(0.001, titleHeight / GAME_2048_TITLE_HEIGHT);
    const barBottomFromTop = rowTop + rowHeight;
    const pauseCenterFromTop = barCenterFromTop;

    // 2. 玩法组整体居中：分数卡与棋盘之间保持固定间距，不随屏幕高度拉开。
    const scoreHeight = GAME_2048_SCORE_CARD_HEIGHT * fitScale;
    const hudGap = GAME_2048_HUD_BOARD_MIN_GAP * fitScale;
    const hintHeight = GAME_2048_HINT_HEIGHT * fitScale;
    const hintBlock = (GAME_2048_HINT_GAP + GAME_2048_HINT_HEIGHT) * fitScale;
    const actionBarHeight = GAME_2048_ACTION_BAR_ITEM_HEIGHT * fitScale;
    const actionBarBlock = GAME_2048_ACTION_BAR_GAP * fitScale + actionBarHeight;
    const regionTop = barBottomFromTop + 24 * fitScale;
    const regionBottom = height - normalized.safeBottom - 12 * fitScale;
    const regionHeight = Math.max(1, regionBottom - regionTop);
    const fixedHeight = scoreHeight + hudGap + hintBlock + actionBarBlock;
    const boardScale = Math.max(
        0.01,
        Math.min(fitScale, (regionHeight - fixedHeight) / GAME_2048_BOARD_NODE_SIZE),
    );
    const boardOuter = GAME_2048_BOARD_NODE_SIZE * boardScale;
    const groupTop = regionTop + Math.max(0, (regionHeight - (fixedHeight + boardOuter)) / 2);
    const scoreCenterFromTop = groupTop + scoreHeight / 2;
    const scoreBottomFromTop = groupTop + scoreHeight;
    const boardTopFromTop = scoreBottomFromTop + hudGap;
    const boardCenterFromTop = boardTopFromTop + boardOuter / 2;
    const boardBottomFromTop = boardTopFromTop + boardOuter;
    const boardSurfaceBottomFromTop = boardCenterFromTop + (GAME_2048_BOARD_SIZE / 2) * boardScale;
    const hintCenterFromTop = boardSurfaceBottomFromTop + GAME_2048_HINT_GAP * fitScale + hintHeight / 2;
    const actionBarCenterFromTop = hintCenterFromTop + hintHeight / 2
        + GAME_2048_ACTION_BAR_GAP * fitScale + actionBarHeight / 2;

    // 底部手势保护带从屏幕下沿向上计算，且不允许越过棋盘下沿，保证最后一排棋子仍可正常滑动。
    const bottomSwipeExclusion = Math.min(
        GAME_2048_BOTTOM_SWIPE_EXCLUSION * fitScale,
        Math.max(0, height - boardBottomFromTop),
    );

    const background = calculateGame2048BackgroundCover(width, height);
    return Object.freeze({
        width,
        height,
        ...normalized,
        contentX,
        contentWidth,
        fitScale,
        titleX: contentX,
        titleY: toY(barCenterFromTop),
        titleScale,
        pauseX,
        pauseY: toY(pauseCenterFromTop),
        scoreLeftX: contentX - 126 * fitScale,
        scoreRightX: contentX + 126 * fitScale,
        scoreY: toY(scoreCenterFromTop),
        boardX: contentX,
        boardY: toY(boardCenterFromTop),
        boardScale,
        boardWorldSize: GAME_2048_BOARD_SIZE * boardScale,
        actionBarY: toY(actionBarCenterFromTop),
        undoButtonX: contentX,
        hintX: contentX,
        hintY: toY(hintCenterFromTop),
        hintWidth: Math.max(1, contentWidth - 64 * fitScale),
        hintHeight,
        backgroundWidth: background.width,
        backgroundHeight: background.height,
        bottomSwipeExclusion,
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
        topRightReserved: platformLayout?.topRightReservedArea,
    });
}
