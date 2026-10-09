import { Node, sys, UITransform, view } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';

export interface WatermelonViewportMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly contentWidth: number;
    readonly contentX: number;
}

export interface WatermelonOverlayMetrics extends WatermelonViewportMetrics {
    readonly panelWidth: number;
    readonly panelHeight: number;
    readonly panelY: number;
    readonly panelScale: number;
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
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const clampedTop = Math.max(0, Math.min(height * 0.45, safeTop));
    const clampedBottom = Math.max(0, Math.min(height * 0.45, safeBottom));
    const contentWidth = width;
    const availableHeight = Math.max(1, height - clampedTop - clampedBottom - 48);
    const panelWidth = 650;
    const panelHeight = Math.max(1, preferredPanelHeight);
    const panelScale = Math.max(
        0.01,
        Math.min(
            1,
            Math.max(1, contentWidth - 48) / panelWidth,
            availableHeight / panelHeight,
        ),
    );

    return Object.freeze({
        width,
        height,
        safeTop: clampedTop,
        safeBottom: clampedBottom,
        contentWidth,
        contentX: 0,
        panelWidth,
        panelHeight,
        panelY: (clampedBottom - clampedTop) / 2,
        panelScale,
        buttonWidth: Math.min(400, panelWidth - 130),
        buttonHeight: 66,
    });
}

export function readWatermelonViewport(owner: Node, platformLayout?: PlatformLayoutInfo): WatermelonViewportMetrics {
    const ownerSize = owner.getComponent(UITransform)?.contentSize
        ?? owner.parent?.getComponent(UITransform)?.contentSize
        ?? { width: 750, height: 1334 };
    const visible = view.getVisibleSize();
    const safeRect = sys.getSafeAreaRect();
    const scaleY = visible.height > 0 ? ownerSize.height / visible.height : 1;
    const platformBounds = calculateVerticalSafeBounds(ownerSize.height, platformLayout);
    const safeTop = Math.max(platformBounds.topInset,
        Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY);
    const safeBottom = Math.max(platformBounds.bottomInset, Math.max(0, safeRect.y) * scaleY);

    return Object.freeze({
        width: ownerSize.width,
        height: ownerSize.height,
        safeTop,
        safeBottom,
        contentWidth: ownerSize.width,
        contentX: 0,
    });
}
