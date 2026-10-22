/** 头部（模式、关卡名、进度条）自 headerY 向下占用的深度。 */
export const FILL_HEADER_DEPTH = 104;
/** 提示按钮中心向上留出按钮半高、引导文字卡及间距。 */
export const FILL_CONTROLS_CLEARANCE = 142;

export interface FillLayoutInsets { readonly top?: number; readonly bottom?: number; readonly capsuleBottom?: number; }

export interface MultiColorFillLayout {
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly bottom: number;
    readonly scale: number;
    readonly centerY: number;
    readonly headerY: number;
    readonly controlsY: number;
    /** 棋盘中心：头部进度条与提示按钮之间留白的正中。 */
    readonly boardY: number;
    readonly boardPitch: number;
    readonly boardWidth: number;
    readonly boardHeight: number;
}

/** 横向 Fit Width；核心模块在矮屏整体等比缩小，左右安全区不参与布局。 */
export function calculateFillLayout(width: number, height: number, columns: number, rows: number,
    insets: FillLayoutInsets = {}): MultiColorFillLayout {
    const top = height / 2 - Math.max(0, insets.top ?? 0, insets.capsuleBottom ?? 0);
    const bottom = -height / 2 + Math.max(0, insets.bottom ?? 0);
    const scale = Math.min(width / 750, Math.max(1, top - bottom - 24 * width / 750) / 1110);
    // 原作棋盘直接落在底色上，没有托盘；上下给头部进度条和提示按钮留出呼吸距离。
    const centerY = (top + bottom) / 2;
    // headerY 是 72px 暂停按钮的中心，按钮上沿距离安全区顶部 30px。
    const headerY = (top - centerY) / scale - 66, controlsY = (bottom - centerY) / scale + 112;
    const boardTop = headerY - FILL_HEADER_DEPTH, boardBottom = controlsY + FILL_CONTROLS_CLEARANCE;
    const boardPitch = Math.min(110, 636 / columns, 690 / rows, Math.max(1, boardTop - boardBottom) / rows);
    return { width, height, top, bottom, scale, centerY, headerY, controlsY,
        boardY: (headerY - FILL_HEADER_DEPTH + controlsY + FILL_CONTROLS_CLEARANCE) / 2,
        boardPitch, boardWidth: columns * boardPitch, boardHeight: rows * boardPitch };
}
