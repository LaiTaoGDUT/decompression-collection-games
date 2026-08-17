import {
    _decorator,
    Component,
    sys,
    UITransform,
    view,
    Widget,
} from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';

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
    readonly contentX: number;
    readonly contentWidth: number;
    readonly hudX: number;
    readonly hudY: number;
    readonly hudWidth: number;
    readonly hudHeight: number;
    readonly reinforcementX: number;
    readonly reinforcementWidth: number;
    readonly reinforcementScale: number;
    readonly reinforcementHeight: number;
    readonly reinforcementY: number;
    readonly dockX: number;
    readonly dockWidth: number;
    readonly dockHeight: number;
    readonly dockY: number;
    readonly boardX: number;
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
    maxNodeWidth: number,
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
    const nodeWidthScale = maxNodeWidth > 0 ? maxNodeWidth / BOARD_NODE_DESIGN_WIDTH : 0;
    const heightScale = slotHeight > 0 ? slotHeight / BOARD_NODE_DESIGN_HEIGHT : 0;
    const scale = Math.max(0, Math.min(nodeWidthScale, heightScale));

    const boardWidth = BOARD_DESIGN_WIDTH * scale;
    const boardHeight = BOARD_DESIGN_HEIGHT * scale;
    const boardNodeWidth = BOARD_NODE_DESIGN_WIDTH * scale;
    const boardNodeHeight = BOARD_NODE_DESIGN_HEIGHT * scale;
    const surfaceWidth = BOARD_SURFACE_DESIGN_WIDTH * scale;
    const surfaceHeight = BOARD_SURFACE_DESIGN_HEIGHT * scale;
    // 棋盘始终贴着增援模块向下排。高屏的额外空间留在棋盘与道具栏之间，
    // 只有矮屏才通过 heightScale 缩小棋盘。
    const boardY = boardTop - boardNodeHeight / 2;

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
    const contentX = (safeLeft - safeRight) / 2;
    // 背景依然按真实 viewport cover，但所有内容模块最宽只使用
    // 项目的 750 设计宽度，并在安全区内居中。
    const contentWidth = Math.min(750, availableWidth);
    const safeHeight = Math.max(1, height - clampedTop - clampedBottom);
    const uiScale = availableWidth / 750;

    const reservedBottom = clamp(
        platformLayout?.topRightReservedArea?.bottom ?? 0,
        0,
        height - clampedBottom,
    );
    const hudTopFromTop = Math.max(clampedTop, reservedBottom) + 12 * uiScale;
    const hudHeight = 104 * uiScale;
    const hudWidth = contentWidth;
    const hudX = contentX;
    const hudY = height / 2 - hudTopFromTop - hudHeight / 2;

    const reinforcementScale = Math.max(0, Math.min(
        1,
        uiScale,
        (contentWidth - 24 * uiScale) / 500,
    ));
    const reinforcementWidth = 500 * reinforcementScale;
    const reinforcementHeight = 121 * reinforcementScale;
    const reinforcementX = contentX;
    const reinforcementGap = 10 * uiScale;
    const reinforcementY = hudY - hudHeight / 2 - reinforcementGap - reinforcementHeight / 2;

    const dockWidth = contentWidth;
    const dockHeight = Math.max(1, Math.min(178 * uiScale, safeHeight * 0.22));
    const dockBottomGap = 0;
    const dockX = contentX;
    const dockY = -height / 2 + clampedBottom + dockBottomGap + dockHeight / 2;

    const boardGap = 12 * uiScale;
    const boardTop = reinforcementY - reinforcementHeight / 2 - boardGap;
    const boardBottom = dockY + dockHeight / 2 + boardGap;
    // 高度充足时棋盘外框直接铺满安全内容宽度；矮屏仍由
    // fitBoardMetrics 的高度约束等比缩小。
    // backplate 素材两侧约有 4.1% 的透明阴影边缘。放大节点后，实体
    // 棋盘边框恰好贴近左右安全边界，普通无横向安全区手机即为 0 边距。
    const maxNodeWidth = Math.max(0, contentWidth + 68 * uiScale);
    // 棋盘节点始终对齐安全内容区中心；素材透明边缘只通过宽度补偿处理，
    // 避免横向偏移在真机上造成明显的左右不对称。
    const boardX = contentX;
    const boardMetrics = fitBoardMetrics(boardTop, boardBottom, maxNodeWidth);
    const backgroundCover = calculateChessEndlessBackgroundCover(width, height);

    return Object.freeze({
        width,
        height,
        safeTop: clampedTop,
        safeBottom: clampedBottom,
        safeLeft,
        safeRight,
        contentX,
        contentWidth,
        hudX,
        hudY,
        hudWidth,
        hudHeight,
        reinforcementX,
        reinforcementWidth,
        reinforcementScale,
        reinforcementHeight,
        reinforcementY,
        dockX,
        dockWidth,
        dockHeight,
        dockY,
        boardX,
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
        const visible = view.getVisibleSize();
        // viewport 保留微信返回的真实尺寸，用于背景与安全区换算；
        // HUD、增援、棋盘和道具栏的 750 宽度上限由布局计算统一实施。
        const viewport = resolveChessEndlessViewportSize(
            visible.width > 0 ? visible.width : rootSize.width,
            visible.height > 0 ? visible.height : rootSize.height,
        );
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
