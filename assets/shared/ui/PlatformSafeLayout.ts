import type { PlatformLayoutInfo } from '../../core/types/CommonTypes';

export interface TopRightControlPosition {
    readonly x: number;
    readonly y: number;
    readonly avoidedReservedArea: boolean;
}

export interface TopRightControlOptions {
    readonly controlWidth: number;
    readonly controlHeight: number;
    readonly rightInset: number;
    readonly defaultTopInset: number;
    readonly reservedGap?: number;
}

export interface VerticalSafeBounds {
    /** 从画布顶部向下量的安全内容起点。 */
    readonly topInset: number;
    /** 从画布底部向上量的安全内容起点。 */
    readonly bottomInset: number;
    /** 以画布中心为原点时，内容顶边的 Y。 */
    readonly topY: number;
    /** 以画布中心为原点时，内容底边的 Y。 */
    readonly bottomY: number;
}

export interface SafeContentBounds extends VerticalSafeBounds {
    readonly leftInset: number;
    readonly rightInset: number;
    /** 以画布中心为原点的安全内容左右边界。 */
    readonly leftX: number;
    readonly rightX: number;
    readonly width: number;
    readonly height: number;
    readonly centerX: number;
    readonly centerY: number;
}

/**
 * 将平台顶部安全区、微信胶囊和底部安全区统一换算为 Canvas 坐标。
 * 此函数只返回纵向边界；横屏布局使用 calculateSafeContentBounds 同时处理左右安全区。
 */
export function calculateVerticalSafeBounds(
    canvasHeight: number,
    layout: PlatformLayoutInfo | undefined,
    reservedGap = 12,
): VerticalSafeBounds {
    const gap = Math.max(0, reservedGap);
    const safeArea = layout?.safeArea;
    const reserved = layout?.topRightReservedArea;
    const topInset = Math.max(
        0,
        safeArea?.top ?? 0,
        reserved ? reserved.bottom + gap : 0,
    );
    const bottomInset = Math.max(
        0,
        safeArea ? canvasHeight - safeArea.bottom : 0,
    );

    return Object.freeze({
        topInset,
        bottomInset,
        topY: canvasHeight / 2 - topInset,
        bottomY: -canvasHeight / 2 + bottomInset,
    });
}

/** 竖屏保持完整屏幕宽度；横屏同时避让上下左右安全区及顶部胶囊。 */
export function calculateSafeContentBounds(
    canvasWidth: number,
    canvasHeight: number,
    layout: PlatformLayoutInfo | undefined,
    reservedGap = 12,
): SafeContentBounds {
    const vertical = calculateVerticalSafeBounds(canvasHeight, layout, reservedGap);
    const safeArea = layout?.safeArea;
    const landscape = layout?.orientation === 'landscape';
    const leftInset = landscape ? Math.max(0, Math.min(canvasWidth, safeArea?.left ?? 0)) : 0;
    const rightInset = landscape
        ? Math.max(0, Math.min(canvasWidth - leftInset, canvasWidth - (safeArea?.right ?? canvasWidth))) : 0;
    const leftX = -canvasWidth / 2 + leftInset;
    const rightX = canvasWidth / 2 - rightInset;
    return Object.freeze({
        ...vertical, leftInset, rightInset, leftX, rightX,
        width: Math.max(0, rightX - leftX),
        height: Math.max(0, vertical.topY - vertical.bottomY),
        centerX: (leftX + rightX) / 2,
        centerY: (vertical.topY + vertical.bottomY) / 2,
    });
}

/**
 * 计算右上角操作入口的位置。坐标返回为以画布中心为原点的 Cocos UI 坐标。
 * 所有新游戏的常驻右上角按钮都应通过此函数布局，禁止直接写死顶部坐标。
 */
export function calculateTopRightControlPosition(
    canvasWidth: number,
    canvasHeight: number,
    layout: PlatformLayoutInfo | undefined,
    options: TopRightControlOptions,
): TopRightControlPosition {
    const defaultCenterFromTop = Math.max(
        options.controlHeight / 2,
        options.defaultTopInset,
    );
    const reserved = layout?.topRightReservedArea;
    const gap = Math.max(0, options.reservedGap ?? 12);
    const centerFromTop = Math.max(
        defaultCenterFromTop,
        (layout?.safeArea.top ?? 0) + gap + options.controlHeight / 2,
        reserved ? reserved.bottom + gap + options.controlHeight / 2 : 0,
    );
    const effectiveRightInset = Math.max(options.controlWidth / 2, options.rightInset);
    const safe = calculateSafeContentBounds(canvasWidth, canvasHeight, layout, gap);

    return Object.freeze({
        x: safe.rightX - effectiveRightInset,
        y: canvasHeight / 2 - centerFromTop,
        avoidedReservedArea: Boolean(reserved),
    });
}
