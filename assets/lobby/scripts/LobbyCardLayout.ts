/**
 * 大厅游戏卡片版式契约（以 320 宽的设计单位表示，按实际卡宽等比缩放）。
 * 自上而下：4:3 完整封面 → 标题 → 进度/简介行，卡片高度由这条纵向流推导，
 * 因此加宽间距或更换封面比例时网格行高会同步变化。整张卡片即开始游戏的点击区域。
 */
export const LOBBY_CARD_LAYOUT = {
    designWidth: 320,
    inset: 12,
    coverAspect: 3 / 4,
    coverRadius: 18,
    coverTitleGap: 18,
    titleHeight: 40,
    titleFontSize: 34,
    titleDescriptionGap: 10,
    descriptionHeight: 28,
    descriptionFontSize: 21,
    bottomInset: 30,
    /** 进度行：累计进度条尺寸、单局最佳奖杯图标尺寸，以及它们与文字的间距。 */
    statusBarWidth: 120,
    statusBarHeight: 12,
    statusIconSize: 24,
    statusGap: 10,
} as const;

/** 游戏卡片与成就入口共用的九宫格底板，边距以原图纹理像素表示。 */
export const LOBBY_CARD_SKIN = {
    path: 'visual/ui/lobby-card-frame/texture',
    insets: { left: 64, right: 64, top: 64, bottom: 72 },
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

    return Object.freeze({
        scale,
        height: cardHeight,
        inset,
        coverWidth,
        coverHeight,
        coverY,
        titleY,
        descriptionY,
    });
}
