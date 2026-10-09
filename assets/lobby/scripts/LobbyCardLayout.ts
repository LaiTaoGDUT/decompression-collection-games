/**
 * 大厅游戏卡片版式契约（以 320 宽的设计单位表示，按实际卡宽等比缩放）。
 * 自上而下：4:3 完整封面 → 标题 → 简介 → 按钮，卡片高度由这条纵向流推导，
 * 因此加宽间距或更换封面比例时网格行高会同步变化。
 */
export const LOBBY_CARD_LAYOUT = {
    designWidth: 320,
    inset: 12,
    coverAspect: 3 / 4,
    coverRadius: 18,
    coverTitleGap: 16,
    titleHeight: 40,
    titleFontSize: 34,
    titleDescriptionGap: 8,
    descriptionHeight: 28,
    descriptionFontSize: 21,
    descriptionActionGap: 18,
    actionWidth: 192,
    /** 按钮美术 320×99 的高宽比。 */
    actionAspect: 99 / 320,
    actionFontSize: 27,
    bottomInset: 22,
} as const;

export interface LobbyCardRows {
    readonly scale: number;
    readonly height: number;
    readonly inset: number;
    readonly coverWidth: number;
    readonly coverHeight: number;
    /** 以下均为各元素中心相对卡片中心的纵坐标。 */
    readonly coverY: number;
    readonly titleY: number;
    readonly descriptionY: number;
    readonly actionY: number;
    readonly actionWidth: number;
    readonly actionHeight: number;
}

function designHeight(): number {
    const layout = LOBBY_CARD_LAYOUT;
    const coverHeight = (layout.designWidth - layout.inset * 2) * layout.coverAspect;
    return layout.inset
        + coverHeight
        + layout.coverTitleGap
        + layout.titleHeight
        + layout.titleDescriptionGap
        + layout.descriptionHeight
        + layout.descriptionActionGap
        + layout.actionWidth * layout.actionAspect
        + layout.bottomInset;
}

/** 卡片高度随卡宽等比变化。 */
export function calculateLobbyCardHeight(cardWidth: number): number {
    const scale = Math.max(0, cardWidth) / LOBBY_CARD_LAYOUT.designWidth;
    return designHeight() * scale;
}

/** 计算卡片内各行的位置；卡片高度不足时整体沿用自上而下的流，底部余量自然收缩。 */
export function calculateLobbyCardRows(cardWidth: number, cardHeight: number): LobbyCardRows {
    const layout = LOBBY_CARD_LAYOUT;
    const scale = Math.max(0.01, cardWidth / layout.designWidth);
    const inset = layout.inset * scale;
    const coverWidth = Math.max(1, cardWidth - inset * 2);
    const coverHeight = coverWidth * layout.coverAspect;
    const top = cardHeight / 2;
    let cursor = top - inset;
    const coverY = cursor - coverHeight / 2;
    cursor -= coverHeight + layout.coverTitleGap * scale;
    const titleHeight = layout.titleHeight * scale;
    const titleY = cursor - titleHeight / 2;
    cursor -= titleHeight + layout.titleDescriptionGap * scale;
    const descriptionHeight = layout.descriptionHeight * scale;
    const descriptionY = cursor - descriptionHeight / 2;
    cursor -= descriptionHeight + layout.descriptionActionGap * scale;
    const actionWidth = layout.actionWidth * scale;
    const actionHeight = actionWidth * layout.actionAspect;
    const actionY = cursor - actionHeight / 2;

    return Object.freeze({
        scale,
        height: cardHeight,
        inset,
        coverWidth,
        coverHeight,
        coverY,
        titleY,
        descriptionY,
        actionY,
        actionWidth,
        actionHeight,
    });
}
