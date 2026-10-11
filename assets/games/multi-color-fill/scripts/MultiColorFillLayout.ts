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
    const boardPitch = Math.min(110, 636 / columns, 690 / rows);
    const centerY = (top + bottom) / 2;
    return { width, height, top, bottom, scale, centerY,
        headerY: (top - centerY) / scale - 54, controlsY: (bottom - centerY) / scale + 166,
        boardPitch, boardWidth: columns * boardPitch, boardHeight: rows * boardPitch };
}
