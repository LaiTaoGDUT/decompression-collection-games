import { sys, UITransform, view, type Node } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';

export const DESKTOP_CLEANUP_DESIGN_WIDTH = 750;
export const DESKTOP_CLEANUP_DESIGN_HEIGHT = 1334;

export interface DesktopCleanupLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly scale: number;
    readonly topY: number;
    readonly titleY: number;
    readonly statsY: number;
    readonly boardY: number;
    readonly boardWidth: number;
    readonly boardHeight: number;
    readonly toolY: number;
    readonly slotY: number;
    readonly bottomY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

export function calculateDesktopCleanupLayout(
    widthValue: number,
    heightValue: number,
    platformLayout?: PlatformLayoutInfo,
    systemSafeTop = 0,
    systemSafeBottom = 0,
): DesktopCleanupLayoutMetrics {
    const width = Math.max(1, widthValue);
    const height = Math.max(1, heightValue);
    const platformTop = platformLayout?.safeArea.top ?? 0;
    const platformBottom = height - (platformLayout?.safeArea.bottom ?? height);
    const capsuleBottom = platformLayout?.topRightReservedArea?.bottom ?? 0;
    const safeTop = clamp(Math.max(systemSafeTop, platformTop, capsuleBottom), 0, height * 0.42);
    const safeBottom = clamp(Math.max(systemSafeBottom, platformBottom), 0, height * 0.30);
    const horizontalScale = width / DESKTOP_CLEANUP_DESIGN_WIDTH;
    const usableHeight = Math.max(1, height - safeTop - safeBottom);
    const scale = Math.max(0.42, Math.min(horizontalScale, usableHeight / 1258));
    const topY = height / 2 - safeTop - 12 * scale;
    const bottomY = -height / 2 + safeBottom + 12 * scale;
    const titleY = topY - 54 * scale;
    const statsY = topY - 148 * scale;
    const toolY = bottomY + 78 * scale;
    const slotY = toolY + 154 * scale;
    const middleTop = topY - 214 * scale;
    const bottomHudTop = slotY + 78 * scale;
    const availableBoardHeight = Math.max(1, middleTop - bottomHudTop);
    const boardSize = Math.min(width, availableBoardHeight);
    const boardY = (middleTop + bottomHudTop) / 2;
    return Object.freeze({
        width,
        height,
        safeTop,
        safeBottom,
        scale,
        topY,
        titleY,
        statsY,
        boardY,
        boardWidth: boardSize,
        boardHeight: boardSize,
        toolY,
        slotY,
        bottomY,
    });
}

export function readDesktopCleanupLayout(
    owner: Node,
    platformLayout?: PlatformLayoutInfo,
): DesktopCleanupLayoutMetrics {
    const parentSize = owner.parent?.getComponent(UITransform)?.contentSize;
    const visible = view.getVisibleSize();
    const width = visible.width > 0 ? visible.width : parentSize?.width ?? DESKTOP_CLEANUP_DESIGN_WIDTH;
    const height = visible.height > 0 ? visible.height : parentSize?.height ?? DESKTOP_CLEANUP_DESIGN_HEIGHT;
    const safeRect = sys.getSafeAreaRect();
    const scaleY = visible.height > 0 ? height / visible.height : 1;
    const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY;
    const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
    return calculateDesktopCleanupLayout(
        width,
        height,
        platformLayout,
        systemSafeTop,
        systemSafeBottom,
    );
}
