import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';

export const SLIDING_PUZZLE_DESIGN_WIDTH = 750;
export const SLIDING_PUZZLE_DESIGN_HEIGHT = 1334;
export const SLIDING_PUZZLE_TOUCH_SIZE = 88;
/** 顶栏中间的规格 / 用时 / 步数信息条高度。 */
export const SLIDING_PUZZLE_HUD_HEIGHT = 96;
// 显示模式切换素材画布为 720 × 220，运行时按 1:2 等比缩放，禁止单独拉伸宽或高。
export const SLIDING_PUZZLE_DISPLAY_SWITCH_WIDTH = 360;
export const SLIDING_PUZZLE_DISPLAY_SWITCH_HEIGHT = 110;
/** 页脚主按钮（开始拼图、裁切确认）的统一高度。 */
export const SLIDING_PUZZLE_FOOTER_BUTTON_HEIGHT = 100;

const HEADER_ICON_EDGE_OFFSET = 64;
const HEADER_ICON_HALF_SIZE = 35;
const HUD_ICON_GAP = 20;
const HUD_TO_BOARD_GAP = 28;
const DISPLAY_SWITCH_GAP = 24;
const PLAY_BOTTOM_MARGIN = 32;
// 棋盘组在剩余空间里略微上提，视觉重心更稳，但仍保留单手可及的下半屏位置。
const PLAY_GROUP_VERTICAL_BIAS = 0.45;
const FOOTER_BOTTOM_MARGIN = 42;
const SETUP_TITLE_TO_CONTENT_GAP = 78;
const SETUP_CONTENT_TO_FOOTER_GAP = 32;
const MIN_BOARD_SIZE = 180;

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
    /** 顶栏左右图标按钮中心到屏幕中线的横向距离。 */
    readonly headerIconX: number;
    readonly hudWidth: number;
    readonly boardCenterY: number;
    readonly boardSize: number;
    readonly cellSize: number;
    readonly displaySwitchY: number;
    readonly footerY: number;
    readonly safeContentCenterY: number;
    /** 开局页可排布内容的上下边界（标题下方到开始按钮上方）。 */
    readonly setupContentTop: number;
    readonly setupContentBottom: number;
    readonly setupContentWidth: number;
}

/** 开局页纵向堆叠：预览图、规格、图片来源三段整体居中于可用区域。 */
export interface SlidingPuzzleSetupStack {
    readonly compact: boolean;
    readonly previewSize: number;
    readonly previewY: number;
    /** 紧凑模式不显示提示和分区标题，对应值为 undefined。 */
    readonly hintY?: number;
    readonly sizeCaptionY?: number;
    readonly sizeRowY: number;
    readonly sourceCaptionY?: number;
    readonly sourceRowY: number;
    readonly albumRowY: number;
    readonly rowHeight: number;
    readonly contentWidth: number;
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
    const footerY = -height / 2
        + safeBottom
        + FOOTER_BOTTOM_MARGIN
        + SLIDING_PUZZLE_FOOTER_BUTTON_HEIGHT / 2;
    const headerIconX = width / 2 - HEADER_ICON_EDGE_OFFSET;
    const hudWidth = Math.max(
        240,
        (headerIconX - HEADER_ICON_HALF_SIZE - HUD_ICON_GAP) * 2,
    );

    // 对局区：顶栏信息条下方到底部安全区之间。棋盘和“原图 / 序号”切换
    // 作为一个整体排布；宽度优先决定棋盘大小，只有矮屏才等比缩小棋盘。
    const playTop = headerTopInset + SLIDING_PUZZLE_HUD_HEIGHT / 2 + HUD_TO_BOARD_GAP;
    const playBottom = height - safeBottom - PLAY_BOTTOM_MARGIN;
    const switchBlock = DISPLAY_SWITCH_GAP + SLIDING_PUZZLE_DISPLAY_SWITCH_HEIGHT;
    const playAvailable = Math.max(MIN_BOARD_SIZE + switchBlock, playBottom - playTop);
    const board = Math.max(
        MIN_BOARD_SIZE,
        Math.min(playAvailable - switchBlock, width - 16),
    );
    const playGroupTop = playTop
        + (playAvailable - board - switchBlock) * PLAY_GROUP_VERTICAL_BIAS;
    const boardCenterY = height / 2 - (playGroupTop + board / 2);
    const displaySwitchY = boardCenterY
        - board / 2
        - DISPLAY_SWITCH_GAP
        - SLIDING_PUZZLE_DISPLAY_SWITCH_HEIGHT / 2;

    const setupContentTop = height / 2 - (headerTopInset + SETUP_TITLE_TO_CONTENT_GAP);
    const setupContentBottom = footerY
        + SLIDING_PUZZLE_FOOTER_BUTTON_HEIGHT / 2
        + SETUP_CONTENT_TO_FOOTER_GAP;

    return Object.freeze({
        viewportWidth: width,
        viewportHeight: height,
        safeTop,
        safeBottom,
        topReserved,
        headerY,
        titleY,
        headerIconX,
        hudWidth,
        boardCenterY,
        boardSize: board,
        cellSize: board / Math.max(3, Math.min(7, boardSize)),
        displaySwitchY,
        footerY,
        safeContentCenterY: (safeBottom - topReserved) / 2,
        setupContentTop,
        setupContentBottom: Math.min(setupContentTop, setupContentBottom),
        setupContentWidth: Math.min(640, Math.max(280, width - 80)),
    });
}

interface SetupStackSpec {
    readonly previewMin: number;
    readonly hintGap: number;
    readonly hintHeight: number;
    readonly sectionGap: number;
    readonly captionHeight: number;
    readonly captionGap: number;
    readonly rowHeight: number;
    readonly rowGap: number;
}

const SETUP_FULL_STACK: SetupStackSpec = Object.freeze({
    previewMin: 320,
    hintGap: 16,
    hintHeight: 30,
    sectionGap: 40,
    captionHeight: 34,
    captionGap: 14,
    rowHeight: 86,
    rowGap: 12,
});

const SETUP_COMPACT_STACK: SetupStackSpec = Object.freeze({
    previewMin: 180,
    hintGap: 0,
    hintHeight: 0,
    sectionGap: 28,
    captionHeight: 0,
    captionGap: 0,
    rowHeight: 76,
    rowGap: 12,
});

const SETUP_PREVIEW_MAX_SIZE = 480;

/**
 * 预览图吃掉其余元素排完后剩下的纵向空间；完整模式放不下最小预览时
 * 切换为紧凑模式（去掉提示与分区标题），仍放不下才缩小预览。
 * 整组内容在可用区域内居中，高屏只在上下留出均匀的自然留白。
 */
export function calculateSlidingPuzzleSetupStack(
    metrics: SlidingPuzzleLayoutMetrics,
): SlidingPuzzleSetupStack {
    const available = Math.max(1, metrics.setupContentTop - metrics.setupContentBottom);
    const previewMax = Math.min(SETUP_PREVIEW_MAX_SIZE, metrics.viewportWidth - 220);
    const fixedHeight = (spec: SetupStackSpec): number => spec.hintGap
        + spec.hintHeight
        + spec.sectionGap * 2
        + spec.captionHeight * 2
        + spec.captionGap * 2
        + spec.rowHeight * 3
        + spec.rowGap;
    const compact = available - fixedHeight(SETUP_FULL_STACK) < SETUP_FULL_STACK.previewMin;
    const spec = compact ? SETUP_COMPACT_STACK : SETUP_FULL_STACK;
    const previewSize = clamp(available - fixedHeight(spec), spec.previewMin, previewMax);
    const totalHeight = previewSize + fixedHeight(spec);
    let cursor = (metrics.setupContentTop + metrics.setupContentBottom) / 2 + totalHeight / 2;

    const previewY = cursor - previewSize / 2;
    cursor -= previewSize;
    let hintY: number | undefined;
    if (spec.hintHeight > 0) {
        cursor -= spec.hintGap;
        hintY = cursor - spec.hintHeight / 2;
        cursor -= spec.hintHeight;
    }
    const placeSection = (): { captionY?: number; rowY: number } => {
        cursor -= spec.sectionGap;
        let captionY: number | undefined;
        if (spec.captionHeight > 0) {
            captionY = cursor - spec.captionHeight / 2;
            cursor -= spec.captionHeight + spec.captionGap;
        }
        const rowY = cursor - spec.rowHeight / 2;
        cursor -= spec.rowHeight;
        return { captionY, rowY };
    };
    const sizeSection = placeSection();
    const sourceSection = placeSection();
    const albumRowY = sourceSection.rowY - spec.rowHeight - spec.rowGap;

    return Object.freeze({
        compact,
        previewSize,
        previewY,
        hintY,
        sizeCaptionY: sizeSection.captionY,
        sizeRowY: sizeSection.rowY,
        sourceCaptionY: sourceSection.captionY,
        sourceRowY: sourceSection.rowY,
        albumRowY,
        rowHeight: spec.rowHeight,
        contentWidth: metrics.setupContentWidth,
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
    visibleInsetRatio = 0,
): SlidingPuzzleTileSourceRect {
    const size = Math.max(1, Math.floor(boardSize));
    const index = Math.max(0, Math.min(size * size - 1, Math.floor(tileIndex)));
    const cellSize = cropSize / size;
    const row = Math.floor(index / size);
    const column = index % size;
    const inset = cellSize * clamp(visibleInsetRatio, 0, 0.49);

    return Object.freeze({
        x: cropX + column * cellSize + inset,
        y: cropY + row * cellSize + inset,
        width: cellSize - inset * 2,
        height: cellSize - inset * 2,
    });
}
