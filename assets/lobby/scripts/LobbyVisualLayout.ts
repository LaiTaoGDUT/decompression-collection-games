export const LOBBY_BACKGROUND_WIDTH = 750;
export const LOBBY_BACKGROUND_HEIGHT = 1334;

export interface LobbyVisualSize {
    readonly width: number;
    readonly height: number;
}

/** Returns a distortion-free cover size for the generated lobby artwork. */
export function calculateLobbyBackgroundCover(
    containerWidth: number,
    containerHeight: number,
    artworkWidth = LOBBY_BACKGROUND_WIDTH,
    artworkHeight = LOBBY_BACKGROUND_HEIGHT,
): LobbyVisualSize {
    if (
        containerWidth <= 0
        || containerHeight <= 0
        || artworkWidth <= 0
        || artworkHeight <= 0
    ) {
        return { width: 0, height: 0 };
    }

    const scale = Math.max(
        containerWidth / artworkWidth,
        containerHeight / artworkHeight,
    );

    return {
        width: artworkWidth * scale,
        height: artworkHeight * scale,
    };
}
