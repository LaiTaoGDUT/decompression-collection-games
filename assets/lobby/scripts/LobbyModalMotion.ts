import { Color, Graphics, Node, UITransform } from 'cc';

/** 公告与设置共用弹出时的原地缩放回弹及遮罩淡入。 */
export const LOBBY_MODAL_MOTION = {
    collapsedScaleX: 0.88,
    collapsedScaleY: 0.74,
    openDuration: 0.24,
    openEasing: 'backOut',
    overlayOpenEasing: 'sineOut',
} as const;

/** Graphics 使用顶点填充色，重绘实际 alpha；遮罩透明度独立于面板内容。 */
export function drawLobbyModalOverlay(root: Node, color: Color, opacity: number): void {
    const { width, height } = root.getComponent(UITransform)!;
    const overlay = root.getComponent(Graphics)!;
    const fillColor = color.clone();
    fillColor.a = Math.round(fillColor.a * opacity);
    overlay.clear();
    overlay.fillColor = fillColor;
    overlay.rect(-width / 2, -height / 2, width, height);
    overlay.fill();
}
