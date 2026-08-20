import { Color } from 'cc';

/**
 * Shared visual tokens for the cat merge game.
 *
 * These are the Cocos equivalent of CSS theme variables: every HUD surface,
 * overlay, and transient effect draws from the same soft picture-book palette.
 */
export const CAT_UI_PALETTE = Object.freeze({
    ink: [75, 45, 69],
    mutedInk: [75, 45, 69],
    // Warm oat-white: softer than pure white against the bright cat-room art.
    surface: [250, 243, 232],
    cream: [255, 244, 226],
    blush: [255, 214, 207],
    peach: [247, 139, 139],
    peachDark: [216, 99, 111],
    mint: [190, 229, 211],
    mintDark: [83, 157, 132],
    sky: [187, 221, 239],
    lavender: [218, 201, 236],
    butter: [255, 229, 143],
    danger: [224, 82, 105],
} as const);

export type CatUiColorName = keyof typeof CAT_UI_PALETTE;

export function catUiColor(name: CatUiColorName, alpha = 255): Color {
    const [r, g, b] = CAT_UI_PALETTE[name];
    return new Color(r, g, b, alpha);
}

export const CAT_UI_SHAPE = Object.freeze({
    panelRadius: 36,
    chipRadius: 24,
    // Keep the radius below half the 66px button height. A radius exactly
    // equal to half the height can leave roundRect seam dots at both ends.
    buttonRadius: 30,
});
