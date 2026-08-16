import {
    _decorator,
    Component,
    sys,
    UITransform,
    view,
    Widget,
} from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateTopRightControlPosition } from '../../../shared/ui/PlatformSafeLayout';

const { ccclass } = _decorator;

const BACKGROUND_ARTWORK_ASPECT = 750 / 1334;
const BOARD_DESIGN_WIDTH = 540;
const BOARD_DESIGN_HEIGHT = BOARD_DESIGN_WIDTH * 9 / 8;
const BOARD_NODE_DESIGN_WIDTH = BOARD_DESIGN_WIDTH + 104;
const BOARD_NODE_DESIGN_HEIGHT = BOARD_DESIGN_HEIGHT + 104;
const BOARD_SURFACE_DESIGN_WIDTH = BOARD_DESIGN_WIDTH - 64;
const BOARD_SURFACE_DESIGN_HEIGHT = BOARD_SURFACE_DESIGN_WIDTH * 9 / 8;

export interface ChessEndlessLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeLeft: number;
    readonly safeRight: number;
    readonly pauseX: number;
    readonly pauseY: number;
    readonly topHudY: number;
    readonly contentWidth: number;
    readonly reinforcementWidth: number;
    readonly reinforcementScale: number;
    readonly reinforcementHeight: number;
    readonly reinforcementY: number;
    readonly dockHeight: number;
    readonly dockY: number;
    readonly boardY: number;
    readonly boardWidth: number;
    readonly boardHeight: number;
    readonly boardNodeWidth: number;
    readonly boardNodeHeight: number;
    readonly surfaceWidth: number;
    readonly surfaceHeight: number;
    readonly backgroundWidth: number;
    readonly backgroundHeight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

/** 按素材比例做 distortion-free cover，铺满当前可视区域。 */
export function calculateChessEndlessBackgroundCover(
    containerWidth: number,
    containerHeight: number,
    artworkAspect = BACKGROUND_ARTWORK_ASPECT,
): { readonly width: number; readonly height: number } {
    if (
        containerWidth <= 0
        || containerHeight <= 0
        || artworkAspect <= 0
    ) {
        return { width: 0, height: 0 };
    }

    const targetAspect = containerWidth / containerHeight;
    if (targetAspect > artworkAspect) {
        return Object.freeze({
            width: containerWidth,
            height: containerWidth / artworkAspect,
        });
    }

    return Object.freeze({
        width: containerHeight * artworkAspect,
        height: containerHeight,
    });
}

/**
 * Viewport 永远使用 GameRoot/Canvas 的真实 UI 尺寸。
 * 不再人为设置最小宽高，否则窄屏/矮屏会按一个比实际屏幕更大的尺寸排版。
 */
export function resolveChessEndlessViewportSize(
    rootWidth: number,
    rootHeight: number,
): { readonly width: number; readonly height: number } {
    return Object.freeze({
        width: Math.max(1, rootWidth),
        height: Math.max(1, rootHeight),
    });
}

function fitBoardMetrics(
    boardTop: number,
    boardBottom: number,
    contentWidth: number,
    maxGridWidth: number,
): Pick<
    ChessEndlessLayoutMetrics,
    | 'boardWidth'
    | 'boardHeight'
    | 'boardNodeWidth'
    | 'boardNodeHeight'
    | 'boardY'
    | 'surfaceWidth'
    | 'surfaceHeight'
> {
    const slotHeight = Math.max(0, boardTop - boardBottom);
    const maxNodeWidth = Math.max(0, contentWidth);
    const widthScale = maxGridWidth > 0 ? maxGridWidth / BOARD_DESIGN_WIDTH : 0;
    const nodeWidthScale = maxNodeWidth > 0 ? maxNodeWidth / BOARD_NODE_DESIGN_WIDTH : 0;
    const heightScale = slotHeight > 0 ? slotHeight / BOARD_NODE_DESIGN_HEIGHT : 0;
    const scale = Math.max(0, Math.min(1, widthScale, nodeWidthScale, heightScale));

    const boardWidth = BOARD_DESIGN_WIDTH * scale;
    const boardHeight = BOARD_DESIGN_HEIGHT * scale;
    const boardNodeWidth = BOARD_NODE_DESIGN_WIDTH * scale;
    const boardNodeHeight = BOARD_NODE_DESIGN_HEIGHT * scale;
    const surfaceWidth = BOARD_SURFACE_DESIGN_WIDTH * scale;
    const surfaceHeight = BOARD_SURFACE_DESIGN_HEIGHT * scale;
    const boardY = (boardTop + boardBottom) / 2;

    return {
        boardWidth,
        boardHeight,
        boardNodeWidth,
        boardNodeHeight,
        boardY,
        surfaceWidth,
        surfaceHeight,
    };
}

export function calculateChessEndlessLayout(
    canvasWidth: number,
    canvasHeight: number,
    safeTop = 0,
    safeBottom = 0,
    platformLayout?: PlatformLayoutInfo,
    systemSafeLeft = 0,
    systemSafeRight = 0,
): ChessEndlessLayoutMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);

    let clampedTop = clamp(safeTop, 0, height * 0.45);
    let clampedBottom = clamp(safeBottom, 0, height * 0.45);
    if (clampedTop + clampedBottom > height - 1) {
        const ratio = (height - 1) / Math.max(1, clampedTop + clampedBottom);
        clampedTop *= ratio;
        clampedBottom *= ratio;
    }

    const platformSafeLeft = Math.max(0, platformLayout?.safeArea.left ?? 0);
    const platformSafeRight = Math.max(0, width - (platformLayout?.safeArea.right ?? width));
    let safeLeft = clamp(Math.max(systemSafeLeft, platformSafeLeft), 0, width * 0.45);
    let safeRight = clamp(Math.max(systemSafeRight, platformSafeRight), 0, width * 0.45);
    if (safeLeft + safeRight > width - 1) {
        const ratio = (width - 1) / Math.max(1, safeLeft + safeRight);
        safeLeft *= ratio;
        safeRight *= ratio;
    }

    const availableWidth = Math.max(1, width - safeLeft - safeRight);
    const horizontalPadding = Math.min(16, Math.max(6, availableWidth * 0.035));
    const contentWidth = Math.max(1, Math.min(750, availableWidth - horizontalPadding * 2));

    const pausePosition = calculateTopRightControlPosition(
        width,
        height,
        platformLayout,
        {
            controlWidth: 58,
            controlHeight: 120,
            rightInset: 58,
            defaultTopInset: clampedTop + 68,
            reservedGap: 10,
        },
    );

    const controlHalf = 29;
    const controlGap = 8;
    const minPauseX = -width / 2 + safeLeft + controlHalf + controlGap;
    const maxPauseX = width / 2 - safeRight - controlHalf - controlGap;
    const pauseX = minPauseX <= maxPauseX
        ? clamp(pausePosition.x, minPauseX, maxPauseX)
        : 0;
    const minPauseY = -height / 2 + clampedBottom + controlHalf + controlGap;
    const maxPauseY = height / 2 - clampedTop - controlHalf - controlGap;
    const pauseY = minPauseY <= maxPauseY
        ? clamp(pausePosition.y, minPauseY, maxPauseY)
        : 0;
    const topHudY = pauseY;

    const safeHeight = Math.max(1, height - clampedTop - clampedBottom);
    const verticalScale = Math.min(1, Math.max(0.55, safeHeight / 980));

    const reinforcementWidth = Math.max(1, Math.min(480, contentWidth - 32));
    const reinforcementScale = Math.min(1, reinforcementWidth / 500);
    const reinforcementHeight = 121 * reinforcementScale;
    const hudGap = 108 * verticalScale;
    const reinforcementY = topHudY - hudGap;

    const dockHeight = Math.max(1, Math.min(176 * verticalScale, safeHeight * 0.24));
    const dockBottomGap = 14 * verticalScale;
    const dockY = -height / 2 + clampedBottom + dockBottomGap + dockHeight / 2;

    const boardTop = reinforcementY - 68 * verticalScale;
    const boardBottom = dockY + dockHeight / 2 + 24 * verticalScale;
    const maxGridWidth = Math.max(0, Math.min(BOARD_DESIGN_WIDTH, contentWidth));
    const boardMetrics = fitBoardMetrics(boardTop, boardBottom, contentWidth, maxGridWidth);
    const backgroundCover = calculateChessEndlessBackgroundCover(width, height);

    return Object.freeze({
        width,
        height,
        safeTop: clampedTop,
        safeBottom: clampedBottom,
        safeLeft,
        safeRight,
        pauseX,
        pauseY,
        topHudY,
        contentWidth,
        reinforcementWidth,
        reinforcementScale,
        reinforcementHeight,
        reinforcementY,
        dockHeight,
        dockY,
        ...boardMetrics,
        backgroundWidth: backgroundCover.width,
        backgroundHeight: backgroundCover.height,
    });
}

function layoutMetricsEqual(left: ChessEndlessLayoutMetrics, right: ChessEndlessLayoutMetrics): boolean {
    const keys = Object.keys(left) as Array<keyof ChessEndlessLayoutMetrics>;
    return keys.every((key) => Math.abs(left[key] - right[key]) < 0.01);
}

@ccclass('ChessEndlessLayout')
export class ChessEndlessLayout extends Component {
    private platformLayout?: PlatformLayoutInfo;
    private metrics: ChessEndlessLayoutMetrics = calculateChessEndlessLayout(750, 1334);
    private onLayoutChange?: (metrics: ChessEndlessLayoutMetrics) => void;

    protected onLoad(): void {
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.applyLayout();
        this.scheduleOnce(() => {
            if (this.node.isValid) {
                this.applyLayout();
            }
        }, 0);
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.onLayoutChange = undefined;
    }

    setPlatformLayout(layout: PlatformLayoutInfo): void {
        this.platformLayout = layout;
        this.applyLayout();
    }

    setLayoutChangeHandler(handler: (metrics: ChessEndlessLayoutMetrics) => void): void {
        this.onLayoutChange = handler;
    }

    getMetrics(): ChessEndlessLayoutMetrics {
        return this.metrics;
    }

    applyLayout(): void {
        this.ensureRootWidget();
        this.node.getComponent(Widget)?.updateAlignment();

        const rootSize = this.node.getComponent(UITransform)?.contentSize
            ?? this.node.parent?.getComponent(UITransform)?.contentSize
            ?? { width: 750, height: 1334 };
        const viewport = resolveChessEndlessViewportSize(rootSize.width, rootSize.height);
        const visible = view.getVisibleSize();
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visible.width > 0 ? viewport.width / visible.width : 1;
        const scaleY = visible.height > 0 ? viewport.height / visible.height : 1;
        const systemSafeLeft = Math.max(0, safeRect.x) * scaleX;
        const systemSafeRight = Math.max(0, visible.width - safeRect.x - safeRect.width) * scaleX;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY;
        const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
        const safeTop = Math.max(systemSafeTop, this.platformLayout?.safeArea.top ?? 0);
        const platformSafeBottom = this.platformLayout
            ? Math.max(0, viewport.height - this.platformLayout.safeArea.bottom)
            : 0;
        const safeBottom = Math.max(systemSafeBottom, platformSafeBottom);
        const nextMetrics = calculateChessEndlessLayout(
            viewport.width,
            viewport.height,
            safeTop,
            safeBottom,
            this.platformLayout,
            systemSafeLeft,
            systemSafeRight,
        );
        const changed = !layoutMetricsEqual(this.metrics, nextMetrics);
        this.metrics = nextMetrics;
        if (changed) {
            this.onLayoutChange?.(this.metrics);
        }
    }

    private ensureRootWidget(): void {
        this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        const widget = this.node.getComponent(Widget) ?? this.node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    }

    private readonly handleCanvasResize = (): void => {
        if (this.node.isValid) {
            this.applyLayout();
        }
    };
}
