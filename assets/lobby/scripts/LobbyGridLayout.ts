export const LOBBY_GRID_GAP = 24;
export const LOBBY_CARD_HEIGHT = 430;

export interface LobbyGridItemLayout {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly row: number;
    readonly column: 0 | 1;
}

export interface LobbyGridLayout {
    readonly cardWidth: number;
    readonly contentHeight: number;
    readonly items: readonly LobbyGridItemLayout[];
}

/** Row-major two-column layout; an odd tail always remains in the left column. */
export function calculateLobbyGridLayout(
    itemCount: number,
    containerWidth: number,
    gap = LOBBY_GRID_GAP,
    cardHeight = LOBBY_CARD_HEIGHT,
): LobbyGridLayout {
    const count = Math.max(0, Math.floor(itemCount));
    const safeWidth = Math.max(0, containerWidth);
    const safeGap = Math.max(0, gap);
    const safeCardHeight = Math.max(0, cardHeight);
    const cardWidth = Math.max(0, (safeWidth - safeGap) / 2);
    const rows = Math.ceil(count / 2);
    const contentHeight = rows === 0
        ? 0
        : rows * safeCardHeight + (rows - 1) * safeGap;
    const columnOffset = (cardWidth + safeGap) / 2;
    const items: LobbyGridItemLayout[] = [];

    for (let index = 0; index < count; index += 1) {
        const row = Math.floor(index / 2);
        const column = (index % 2) as 0 | 1;
        items.push(Object.freeze({
            x: column === 0 ? -columnOffset : columnOffset,
            y: -safeCardHeight / 2 - row * (safeCardHeight + safeGap),
            width: cardWidth,
            height: safeCardHeight,
            row,
            column,
        }));
    }

    return Object.freeze({
        cardWidth,
        contentHeight,
        items: Object.freeze(items),
    });
}
