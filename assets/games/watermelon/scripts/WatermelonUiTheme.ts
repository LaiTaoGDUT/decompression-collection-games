import { Color } from 'cc';

/**
 * Shared visual tokens for the fruit merge game.
 *
 * These are the Cocos equivalent of CSS theme variables: every HUD surface,
 * overlay, and transient effect draws from the same light neutral jelly palette.
 */
export const CAT_UI_PALETTE = Object.freeze({
    ink: [78, 67, 74],
    mutedInk: [111, 100, 105],
    scoreInk: [126, 68, 78],
    mergeInk: [113, 96, 184],
    bestScoreInk: [111, 78, 44],
    hintInk: [96, 67, 76],
    surface: [255, 250, 241],
    cream: [255, 247, 230],
    blush: [255, 229, 226],
    peach: [247, 180, 164],
    peachDark: [184, 110, 112],
    mint: [218, 241, 225],
    mintDark: [104, 165, 135],
    mintText: [62, 126, 92],
    sky: [200, 229, 237],
    lavender: [229, 219, 239],
    butter: [255, 235, 188],
    danger: [220, 94, 125],
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
