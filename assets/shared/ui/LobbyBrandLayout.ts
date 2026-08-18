import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';

export const LOBBY_DESIGN_WIDTH = 750;
export const LOBBY_DESIGN_HEIGHT = 1334;
export const LOBBY_BRAND_WIDTH = 450;
export const LOBBY_BRAND_HEIGHT = 300;
export const LOBBY_BRAND_TOP_GAP = 12;
export const LOBBY_VIEWPORT_TOP_GAP = 12;
export const LOBBY_BRAND_TO_GRID_GAP = 8;
export const LOBBY_BRAND_AREA_HEIGHT = 330;
export const LOBBY_SETTINGS_ENTRY_SIZE = 92;
export const LOBBY_SETTINGS_ENTRY_TOP_GAP = 20;
export const LOBBY_SETTINGS_ENTRY_RIGHT_GAP = 28;

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

export interface LobbyBrandMetrics {
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly topGap: number;
    readonly centerFromTop: number;
    readonly areaHeight: number;
    readonly gridTop: number;
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
 * 将大厅滚动 viewport 从安全内容矩形扩展到屏幕底部。
 * 顶部和左右仍然遵循安全区，底部安全区改由列表尾部 spacer 占位。
 */
export function calculateLobbyScrollViewportMetrics(
    safeContent: LobbySafeContentMetrics,
): LobbySafeContentMetrics {
    const contentHeight = Math.max(1, safeContent.height - safeContent.safeTop);

    return Object.freeze({
        ...safeContent,
        safeBottom: 0,
        contentHeight,
        contentY: safeContent.contentY - safeContent.safeBottom / 2,
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

/** 将平台以 750 设计宽度提供的安全区转换到当前 Canvas 坐标。 */
export function calculateLobbySafeContentFromPlatform(
    canvasWidth: number,
    canvasHeight: number,
    platformLayout?: PlatformLayoutInfo,
    systemInsets: LobbySystemSafeInsets = {},
): LobbySafeContentMetrics {
    const width = Math.max(1, canvasWidth);
    const scale = width / LOBBY_DESIGN_WIDTH;
    const platformSafeArea = platformLayout?.safeArea;

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
        left: Math.max(
            normalizeNonNegative(systemInsets.left),
            normalizeNonNegative(platformSafeArea?.left) * scale,
        ),
        right: Math.max(
            normalizeNonNegative(systemInsets.right),
            platformSafeArea
                ? Math.max(0, width - platformSafeArea.right * scale)
                : 0,
        ),
        topRightReservedBottom: platformLayout?.topRightReservedArea
            ? platformLayout.topRightReservedArea.bottom * scale
            : 0,
    });
}

export interface LobbySettingsEntryMetrics {
    readonly scale: number;
    readonly size: number;
    readonly x: number;
    readonly y: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly topInset: number;
    readonly rightInset: number;
}

/** 将大厅设置入口固定在当前 Canvas 右上角安全区之外，不依赖品牌区或滚动列表。 */
export function calculateLobbySettingsEntryMetrics(
    canvasWidth: number,
    canvasHeight: number,
    platformLayout?: PlatformLayoutInfo,
    systemInsets: LobbySystemSafeInsets = {},
): LobbySettingsEntryMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const designScale = width / LOBBY_DESIGN_WIDTH;
    const safeContent = calculateLobbySafeContentFromPlatform(
        width,
        height,
        platformLayout,
        systemInsets,
    );
    const scale = Math.max(0.75, Math.min(1, designScale));
    const size = LOBBY_SETTINGS_ENTRY_SIZE * scale;
    const topGap = LOBBY_SETTINGS_ENTRY_TOP_GAP * scale;
    const rightGap = LOBBY_SETTINGS_ENTRY_RIGHT_GAP * scale;
    const capsuleBottom = normalizeNonNegative(
        platformLayout?.topRightReservedArea?.bottom,
    ) * designScale;
    const topInset = Math.max(
        safeContent.safeTop + topGap,
        capsuleBottom + topGap,
    );
    const rightInset = safeContent.safeRight + rightGap;
    const x = width / 2 - rightInset - size / 2;
    const y = height / 2 - topInset - size / 2;

    return Object.freeze({
        scale,
        size,
        x,
        y,
        left: x - size / 2,
        right: x + size / 2,
        top: y + size / 2,
        bottom: y - size / 2,
        topInset,
        rightInset,
    });
}

/**
 * 大厅页和大厅启动页的品牌几何契约。
 * 短屏或非对称安全区变窄时只等比缩小，不放大正式 logo。
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
    const topGap = LOBBY_BRAND_TOP_GAP * scale;
    const centerFromTop = topGap + height / 2;
    const areaHeight = Math.max(
        LOBBY_BRAND_AREA_HEIGHT * scale,
        centerFromTop + height / 2 + LOBBY_BRAND_TO_GRID_GAP * scale,
    );

    return Object.freeze({
        scale,
        width,
        height,
        topGap,
        centerFromTop,
        areaHeight,
        gridTop: centerFromTop + height / 2 + LOBBY_BRAND_TO_GRID_GAP * scale,
    });
}
