import { Node, sys, UITransform, view } from 'cc';

export const CHESS_MODAL_PANEL_ASPECT = 300 / 430;
export const CHESS_MODAL_SAFE_X = 28 / 300;
export const CHESS_MODAL_SAFE_Y = 26 / 430;

export interface ChessEndlessViewportMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
}

export interface ChessEndlessOverlayMetrics extends ChessEndlessViewportMetrics {
    readonly panelWidth: number;
    readonly panelHeight: number;
    readonly panelY: number;
    readonly buttonWidth: number;
    readonly buttonHeight: number;
}

export function calculateChessEndlessOverlayMetrics(
    canvasWidth: number,
    canvasHeight: number,
    safeTop = 0,
    safeBottom = 0,
    preferredPanelHeight = 650,
): ChessEndlessOverlayMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    let clampedTop = Math.max(0, Math.min(height * 0.45, safeTop));
    let clampedBottom = Math.max(0, Math.min(height * 0.45, safeBottom));
    if (clampedTop + clampedBottom > height - 1) {
        const ratio = (height - 1) / Math.max(1, clampedTop + clampedBottom);
        clampedTop *= ratio;
        clampedBottom *= ratio;
    }
    const availableHeight = Math.max(0, height - clampedTop - clampedBottom - 48);
    const panelWidth = Math.max(0, Math.min(610, width - 48));
    const panelHeight = Math.max(0, Math.min(preferredPanelHeight, availableHeight));

    return Object.freeze({
        width,
        height,
        safeTop: clampedTop,
        safeBottom: clampedBottom,
        panelWidth,
        panelHeight,
        panelY: (clampedBottom - clampedTop) / 2,
        buttonWidth: Math.max(0, Math.min(400, panelWidth - 130)),
        buttonHeight: Math.min(66, Math.max(0, panelHeight * 0.14)),
    });
}

export function chessEndlessModalContentRect(
    panelWidth: number,
    panelHeight: number,
): {
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly bottom: number;
} {
    const verticalSafe = panelHeight * CHESS_MODAL_SAFE_Y;
    return Object.freeze({
        width: Math.max(0, panelWidth - panelWidth * CHESS_MODAL_SAFE_X * 2),
        height: Math.max(0, panelHeight - verticalSafe * 2),
        top: panelHeight / 2 - verticalSafe,
        bottom: -panelHeight / 2 + verticalSafe,
    });
}

export function readChessEndlessViewport(owner: Node): ChessEndlessViewportMetrics {
    const ownerSize = owner.getComponent(UITransform)?.contentSize
        ?? owner.parent?.getComponent(UITransform)?.contentSize
        ?? { width: 750, height: 1334 };
    const visible = view.getVisibleSize();
    const safeRect = sys.getSafeAreaRect();
    const scaleY = visible.height > 0 ? ownerSize.height / visible.height : 1;

    return Object.freeze({
        width: Math.max(1, ownerSize.width),
        height: Math.max(1, ownerSize.height),
        safeTop: Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY,
        safeBottom: Math.max(0, safeRect.y) * scaleY,
    });
}

export function resolveChessEndlessModalPanelSize(
    preferredContentWidth: number,
    preferredContentHeight: number,
    viewport: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
    const viewportWidth = Math.max(1, viewport.width);
    const viewportHeight = Math.max(1, viewport.height);
    const maxPanelWidth = Math.max(1, Math.min(580, viewportWidth - 32));
    const maxPanelHeight = Math.max(1, viewportHeight - 96);
    const contentWidth = Math.max(1, preferredContentWidth) / (1 - 2 * CHESS_MODAL_SAFE_X);
    const contentHeight = Math.max(1, preferredContentHeight) / (1 - 2 * CHESS_MODAL_SAFE_Y);
    let panelHeight = Math.min(
        maxPanelHeight,
        Math.max(contentHeight, contentWidth / CHESS_MODAL_PANEL_ASPECT),
    );
    let panelWidth = panelHeight * CHESS_MODAL_PANEL_ASPECT;
    if (panelWidth > maxPanelWidth) {
        panelWidth = maxPanelWidth;
        panelHeight = panelWidth / CHESS_MODAL_PANEL_ASPECT;
    }
    if (panelHeight > maxPanelHeight) {
        panelHeight = maxPanelHeight;
        panelWidth = panelHeight * CHESS_MODAL_PANEL_ASPECT;
    }
    return {
        width: Math.max(1, Math.round(panelWidth)),
        height: Math.max(1, Math.round(panelHeight)),
    };
}
