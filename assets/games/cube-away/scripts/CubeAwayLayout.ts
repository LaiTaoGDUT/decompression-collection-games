import { Rect } from 'cc';

export interface CubeAwayLayoutMetrics {
    visibleWidth: number;
    visibleHeight: number;
    safeLeft: number;
    safeRight: number;
    safeTop: number;
    safeBottom: number;
    safeWidth: number;
    safeHeight: number;
    centerX: number;
    chromeScale: number;
    headerTopY: number;
    headerHeight: number;
    headerCenterY: number;
    footerBottomY: number;
    footerHeight: number;
    footerCenterY: number;
    viewportCenterY: number;
    viewportWidth: number;
    viewportHeight: number;
}

/**
 * Compute portrait safe layout metrics under Cocos Fit Width (750px base width).
 * Ensures HUD, 3D Cube Viewport, Journey Map, and Bottom Booster Dock sit cleanly inside safe bounds.
 */
export function computeCubeAwayLayout(
    visibleWidth: number,
    visibleHeight: number,
    safeBounds?: Rect,
): CubeAwayLayoutMetrics {
    const halfW = visibleWidth * 0.5;
    const halfH = visibleHeight * 0.5;

    const safeLeft = safeBounds ? safeBounds.x : -halfW;
    const safeRight = safeBounds ? safeBounds.x + safeBounds.width : halfW;
    const safeBottom = safeBounds ? safeBounds.y : -halfH;
    const safeTop = safeBounds ? safeBounds.y + safeBounds.height : halfH;

    const safeWidth = Math.max(320, safeRight - safeLeft);
    const safeHeight = Math.max(1, safeTop - safeBottom);
    const centerX = (safeLeft + safeRight) * 0.5;

    // Compact chrome scale on very short screens (e.g. 750x760 test / iPhone SE landscape-height)
    const chromeScale = Math.min(1, Math.max(0.76, safeHeight / 1000));

    const headerHeight = Math.round(170 * chromeScale);
    const headerTopY = safeTop - 10 * chromeScale;
    const headerCenterY = headerTopY - headerHeight * 0.5;

    const footerHeight = Math.round(166 * chromeScale);
    const footerBottomY = safeBottom + 18 * chromeScale;
    const footerCenterY = footerBottomY + footerHeight * 0.5;

    const middleTop = headerTopY - headerHeight - 8 * chromeScale;
    const middleBottom = footerBottomY + footerHeight + 8 * chromeScale;
    const viewportHeight = Math.max(80, middleTop - middleBottom);
    const viewportWidth = safeWidth;
    const viewportCenterY = (middleTop + middleBottom) * 0.5;

    return {
        visibleWidth,
        visibleHeight,
        safeLeft,
        safeRight,
        safeTop,
        safeBottom,
        safeWidth,
        safeHeight,
        centerX,
        chromeScale,
        headerTopY,
        headerHeight,
        headerCenterY,
        footerBottomY,
        footerHeight,
        footerCenterY,
        viewportCenterY,
        viewportWidth,
        viewportHeight,
    };
}
