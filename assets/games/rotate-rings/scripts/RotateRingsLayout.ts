/** 所有页面共用安全边界；关内与选关按各自内容布局，弹窗保持完整居中。 */
export const RING_MAX_BOARD_SCALE = 64;
export function calculateRingLayout(height: number, safeTop = 0, safeBottom = 0, capsuleBottom = 0): {
    height: number; top: number; bottom: number; centerY: number; scale: number;
} {
    const top = height / 2 - Math.max(16, safeTop, capsuleBottom > 0 ? capsuleBottom + 12 : 0);
    const bottom = -height / 2 + Math.max(16, safeBottom);
    return { height, top, bottom, centerY: (top + bottom) / 2, scale: Math.min(1, Math.max(.1, top - bottom) / 1100) };
}

export function calculateRingSelectionLayout(top: number, bottom: number): {
    titleY: number; subtitleY: number; tabsY: number; progressY: number;
    firstRowY: number; rowStep: number; rows: number; pageSize: number; gridY: number; gridHeight: number;
    pageNumberY: number; trayY: number; toastY: number;
} {
    // 底栏：两端翻页箭头 + 中间「当前关卡」「最新解锁」两个跳转按钮；页码在底栏上方。
    const titleY = top - 52, subtitleY = titleY - 60, tabsY = subtitleY - 70, progressY = tabsY - 64;
    const trayY = bottom + 52, pageNumberY = trayY + 84;
    const gridTop = progressY - 52, gridBottom = pageNumberY + 34, gridHeight = Math.max(84, gridTop - gridBottom);
    const rows = Math.max(1, Math.min(8, Math.floor((gridHeight + 20) / 104)));
    return { titleY, subtitleY, tabsY, progressY, firstRowY: gridTop - 42,
        rowStep: rows > 1 ? (gridHeight - 84) / (rows - 1) : 0, rows, pageSize: rows * 5,
        gridY: (gridTop + gridBottom) / 2, gridHeight, pageNumberY, trayY, toastY: progressY - 37 };
}

/** 指尖保持在真实触点，按整张手图的锚点选择向内的朝向并等比适配。 */
export function fitRingGuideHand(point: { x: number; y: number }, width: number, height: number,
    bounds: { left: number; right: number; bottom: number; top: number }): { x: number; y: number } {
    const inward = point.x >= (bounds.left + bounds.right) / 2 ? -1 : 1;
    let best = { x: inward, y: 1 }, bestScale = -1;
    for (const y of [1, -1]) for (const x of [inward, -inward]) {
        const left = width * (x > 0 ? .15 : .85), right = width - left;
        const bottom = height * (y > 0 ? .90 : .10), top = height - bottom;
        const scale = Math.max(0, Math.min(1, (point.x - bounds.left) / left, (bounds.right - point.x) / right,
            (point.y - bounds.bottom) / bottom, (bounds.top - point.y) / top));
        if (scale > bestScale + .0001) { bestScale = scale; best = { x: x * scale, y: y * scale }; }
    }
    return best;
}

export interface RingPlayLayout {
    headerY: number; propsY: number; boardY: number; boardWidth: number; boardHeight: number;
    boardSafetyWidth: number; boardSafetyHeight: number;
}

/** HUD 按自身半高贴近安全区，避让胶囊；不再保留固定 183/201 的顶底空白。 */
export function calculateRingPlayLayout(height: number, top: number, bottom: number): RingPlayLayout {
    const headerY = top - 58, propsY = bottom + 86;
    const boardTop = headerY - 86, boardBottom = propsY + 140;
    const boardY = (boardTop + boardBottom) / 2;
    return { headerY, propsY, boardY, boardWidth: 694, boardHeight: Math.max(1, boardTop - boardBottom),
        boardSafetyWidth: 718, boardSafetyHeight: Math.max(1, Math.min(headerY - 70 - boardY, boardY - propsY - 128) * 2) };
}

/** 标题牌骑在面板上边缘居中（上沿伸出 headerOverhang）；正文与按钮始终位于面板内边距之内。
 * 返回值均相对弹窗内容节点中心；内容高度包含标题牌伸出部分，矮屏缩放按完整外形计算。 */
export const RING_DIALOG = Object.freeze({
    width: 654, inset: 16, headerWidth: 460, headerHeight: 90, headerOverhang: 42, titleWidth: 330,
});
export function calculateRingDialogLayout(buttonHeights: readonly number[]): {
    height: number; panelHeight: number; panelY: number; headerY: number; titleY: number; subtitleY: number; buttonYs: number[];
} {
    const gap = 16, introHeight = 170, bottomPadding = 44, overhang = RING_DIALOG.headerOverhang;
    const panelHeight = introHeight + buttonHeights.reduce((sum, h) => sum + h, 0)
        + Math.max(0, buttonHeights.length - 1) * gap + bottomPadding;
    const height = panelHeight + overhang, panelTop = height / 2 - overhang;
    const headerY = panelTop + overhang - RING_DIALOG.headerHeight / 2, headerBottom = headerY - RING_DIALOG.headerHeight / 2;
    let cursor = panelTop - introHeight;
    const buttonYs = buttonHeights.map(h => { const y = cursor - h / 2; cursor -= h + gap; return y; });
    return { height, panelHeight, panelY: -overhang / 2, headerY, titleY: headerY + 5, subtitleY: headerBottom - 52, buttonYs };
}
