import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';

export const LOBBY_DESIGN_WIDTH = 750;
export const LOBBY_DESIGN_HEIGHT = 1334;
/** 大厅顶部布局：标题与成就展柜随列表滚动，右侧固定设置与公告工具胶囊。 */
/** 标题图按原有 400 × 132 的比例等比放大。 */
export const LOBBY_BRAND_WIDTH = 432;
export const LOBBY_BRAND_HEIGHT = LOBBY_BRAND_WIDTH * 132 / 400;
export const LOBBY_VIEWPORT_TOP_GAP = 12;
export const LOBBY_HEADER_TOP_GAP = 16;
export const LOBBY_HEADER_SIDE_GAP = 24;
/** 低频的设置与公告并入一个竖向胶囊：设置在上、公告在下，每格等高、图标居中。 */
export const LOBBY_HEADER_TOOLBAR_WIDTH = 72;
export const LOBBY_HEADER_TOOL_CELL_HEIGHT = 70;
export const LOBBY_HEADER_TOOL_ICON_SIZE = 44;
/** 品牌 logo 与游戏网格之间的成就展柜条。 */
export const LOBBY_SHOWCASE_HEIGHT = 136;
export const LOBBY_BRAND_TO_SHOWCASE_GAP = 18;
export const LOBBY_SHOWCASE_TO_GRID_GAP = 24;
/** 首屏顶部布局下沿到游戏网格的间距，以及首行卡片的上留白。 */
export const LOBBY_HEADER_TO_GRID_GAP = 8;
export const LOBBY_GRID_TOP_PADDING = 24;

export interface LobbySystemSafeInsets {
    readonly top?: number;
    readonly bottom?: number;
    readonly left?: number;
    readonly right?: number;
}

export interface LobbySafeContentMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeLeft: number;
    readonly safeRight: number;
    readonly contentWidth: number;
    readonly contentHeight: number;
    readonly contentX: number;
    readonly contentY: number;
}

/** 顶部栏几何：y 均为距安全内容顶边的距离，x 均相对安全内容水平中心。 */
export interface LobbyBrandMetrics {
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly topGap: number;
    /** 标题与设置、公告工具胶囊共用的垂直中心。 */
    readonly centerFromTop: number;
    readonly sideColumnX: number;
    readonly toolbarCenterFromTop: number;
    readonly settingsCenterFromTop: number;
    readonly noticeCenterFromTop: number;
    /** 首屏顶部布局占用的高度，游戏网格从这里再向下留出间距。 */
    readonly headerHeight: number;
}

/** 将 resize/layout 前取得的 ScrollView 偏移限制到新的可滚动范围。 */
export function clampLobbyScrollOffset(
    offset: number,
    contentHeight: number,
    viewportHeight: number,
): number {
    const normalizedOffset = normalizeNonNegative(offset);
    const normalizedContentHeight = normalizeNonNegative(contentHeight);
    const normalizedViewportHeight = normalizeNonNegative(viewportHeight);
    const maxOffset = Math.max(
        0,
        normalizedContentHeight - normalizedViewportHeight,
    );
    return Math.min(normalizedOffset, maxOffset);
}

/**
 * 大厅滚动 viewport 覆盖整屏高度，标题和游戏卡片在屏幕边缘裁切。
 * 顶部与底部安全间距由滚动内容占位，固定入口仍按安全内容矩形排版。
 */
export function calculateLobbyScrollViewportMetrics(
    safeContent: LobbySafeContentMetrics,
): LobbySafeContentMetrics {
    return Object.freeze({
        ...safeContent,
        safeTop: 0,
        safeBottom: 0,
        contentHeight: safeContent.height,
        contentY: 0,
    });
}

function normalizeNonNegative(value: number | undefined): number {
    return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function fitInsets(
    first: number,
    second: number,
    available: number,
): { first: number; second: number } {
    const safeAvailable = Math.max(1, available);
    const total = first + second;
    if (total <= safeAvailable - 1) {
        return { first, second };
    }

    const ratio = (safeAvailable - 1) / Math.max(1, total);
    return {
        first: first * ratio,
        second: second * ratio,
    };
}

/**
 * 计算大厅 ScrollView 和启动页共用的安全内容矩形。
 * 所有输入和输出都使用绑定 UI Camera 后的 Canvas 坐标，原点在画布中心。
 */
export function calculateLobbySafeContent(
    canvasWidth: number,
    canvasHeight: number,
    insets: LobbySystemSafeInsets & { readonly topRightReservedBottom?: number } = {},
): LobbySafeContentMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const designScale = width / LOBBY_DESIGN_WIDTH;
    const reservedBottom = normalizeNonNegative(insets.topRightReservedBottom);

    let safeTop = normalizeNonNegative(insets.top);
    let safeBottom = normalizeNonNegative(insets.bottom);
    let safeLeft = normalizeNonNegative(insets.left);
    let safeRight = normalizeNonNegative(insets.right);

    if (reservedBottom > 0) {
        safeTop = Math.max(
            safeTop,
            reservedBottom + LOBBY_VIEWPORT_TOP_GAP * designScale,
        );
    }

    ({ first: safeTop, second: safeBottom } = fitInsets(
        safeTop,
        safeBottom,
        height,
    ));
    ({ first: safeLeft, second: safeRight } = fitInsets(
        safeLeft,
        safeRight,
        width,
    ));

    const contentWidth = Math.max(1, width - safeLeft - safeRight);
    const contentHeight = Math.max(1, height - safeTop - safeBottom);

    return Object.freeze({
        width,
        height,
        safeTop,
        safeBottom,
        safeLeft,
        safeRight,
        contentWidth,
        contentHeight,
        contentX: (safeLeft - safeRight) / 2,
        contentY: (safeBottom - safeTop) / 2,
    });
}

/** 将平台以当前设计宽度提供的安全区转换到 Canvas 坐标。 */
export function calculateLobbySafeContentFromPlatform(
    canvasWidth: number,
    canvasHeight: number,
    platformLayout?: PlatformLayoutInfo,
    systemInsets: LobbySystemSafeInsets = {},
): LobbySafeContentMetrics {
    const width = Math.max(1, canvasWidth);
    const scale = width / (platformLayout?.designWidth ?? LOBBY_DESIGN_WIDTH);
    const platformSafeArea = platformLayout?.safeArea;
    const landscape = platformLayout?.orientation === 'landscape';

    return calculateLobbySafeContent(width, canvasHeight, {
        top: Math.max(
            normalizeNonNegative(systemInsets.top),
            normalizeNonNegative(platformSafeArea?.top) * scale,
        ),
        bottom: Math.max(
            normalizeNonNegative(systemInsets.bottom),
            platformSafeArea
                ? Math.max(0, canvasHeight - platformSafeArea.bottom * scale)
                : 0,
        ),
        left: landscape ? Math.max(
            normalizeNonNegative(systemInsets.left),
            normalizeNonNegative(platformSafeArea?.left) * scale,
        ) : 0,
        right: landscape ? Math.max(
            normalizeNonNegative(systemInsets.right),
            platformSafeArea
                ? Math.max(0, width - platformSafeArea.right * scale)
                : 0,
        ) : 0,
        topRightReservedBottom: platformLayout?.topRightReservedArea
            ? platformLayout.topRightReservedArea.bottom * scale
            : 0,
    });
}

/**
 * 大厅顶部栏与大厅启动页共用的品牌几何契约。
 * 短屏或非对称安全区变窄时整栏等比缩小，不放大正式 logo。
 */
export function calculateLobbyBrandMetrics(
    contentWidth: number,
    contentHeight: number,
): LobbyBrandMetrics {
    const widthScale = Math.max(0.01, contentWidth / LOBBY_DESIGN_WIDTH);
    const heightScale = Math.max(0.01, contentHeight / LOBBY_DESIGN_HEIGHT);
    const scale = Math.max(0.01, Math.min(1, widthScale, heightScale));
    const width = LOBBY_BRAND_WIDTH * scale;
    const height = LOBBY_BRAND_HEIGHT * scale;
    const topGap = LOBBY_HEADER_TOP_GAP * scale;
    const cellHeight = LOBBY_HEADER_TOOL_CELL_HEIGHT * scale;
    const sideGap = LOBBY_HEADER_SIDE_GAP * scale;
    const toolbarHeight = cellHeight * 2;
    const headerHeight = Math.max(height, toolbarHeight);
    const centerFromTop = topGap + headerHeight / 2;

    return Object.freeze({
        scale,
        width,
        height,
        topGap,
        centerFromTop,
        sideColumnX: contentWidth / 2 - sideGap - LOBBY_HEADER_TOOLBAR_WIDTH * scale / 2,
        toolbarCenterFromTop: centerFromTop,
        settingsCenterFromTop: centerFromTop - cellHeight / 2,
        noticeCenterFromTop: centerFromTop + cellHeight / 2,
        headerHeight: topGap + headerHeight,
    });
}
