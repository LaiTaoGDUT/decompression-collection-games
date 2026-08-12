import { Node, sys, UITransform, view } from 'cc';

export interface WatermelonViewportMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
}

export interface WatermelonOverlayMetrics extends WatermelonViewportMetrics {
    readonly panelWidth: number;
    readonly panelHeight: number;
    readonly panelY: number;
    readonly buttonWidth: number;
    readonly buttonHeight: number;
}

/**
 * 弹层使用设计坐标计算；像素密度只影响渲染采样，不得改变触摸尺寸或玩法几何。
 */
export function calculateWatermelonOverlayMetrics(
    canvasWidth: number,
    canvasHeight: number,
    safeTop = 0,
    safeBottom = 0,
    preferredPanelHeight = 650,
): WatermelonOverlayMetrics {
    const width = Math.max(600, canvasWidth);
    const height = Math.max(1100, canvasHeight);
    const clampedTop = Math.max(0, Math.min(160, safeTop));
    const clampedBottom = Math.max(0, Math.min(120, safeBottom));
    const availableHeight = height - clampedTop - clampedBottom - 48;
    const panelWidth = Math.min(610, width - 48);
    const panelHeight = Math.min(preferredPanelHeight, availableHeight);

    return Object.freeze({
        width,
        height,
        safeTop: clampedTop,
        safeBottom: clampedBottom,
        panelWidth,
        panelHeight,
        panelY: (clampedBottom - clampedTop) / 2,
        buttonWidth: Math.min(400, panelWidth - 130),
        buttonHeight: 66,
    });
}

export function readWatermelonViewport(owner: Node): WatermelonViewportMetrics {
    const ownerSize = owner.getComponent(UITransform)?.contentSize
        ?? owner.parent?.getComponent(UITransform)?.contentSize
        ?? { width: 750, height: 1334 };
    const visible = view.getVisibleSize();
    const safeRect = sys.getSafeAreaRect();
    const designScale = visible.width > 0 ? ownerSize.width / visible.width : 1;

    return Object.freeze({
        width: ownerSize.width,
        height: ownerSize.height,
        safeTop: Math.max(0, visible.height - safeRect.y - safeRect.height) * designScale,
        safeBottom: Math.max(0, safeRect.y) * designScale,
    });
}
