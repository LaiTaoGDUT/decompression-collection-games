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
    const centerFromTop = reserved
        ? Math.max(defaultCenterFromTop, reserved.bottom + gap + options.controlHeight / 2)
        : defaultCenterFromTop;
    const effectiveRightInset = Math.max(options.controlWidth / 2, options.rightInset);

    return Object.freeze({
        x: canvasWidth / 2 - effectiveRightInset,
        y: canvasHeight / 2 - centerFromTop,
        avoidedReservedArea: Boolean(reserved),
    });
}
