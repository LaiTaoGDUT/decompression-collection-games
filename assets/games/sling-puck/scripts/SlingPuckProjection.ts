/**
 * The rink is a physical table seen from the south player's seat: the board plane tilts away by
 * `tilt` degrees and a pinhole camera sits `distance` design px from its centre. Physics stays flat
 * (x, y on the ice, z up); this maps it to the screen and back. tools/sling-puck/render-art.py reads
 * these numbers so the pre-rendered frame, divider and posts line up with what is drawn live.
 */
export const SLING_VIEW = Object.freeze({
    tilt: 20,
    distance: 5000,
    /** Rounded pale maple frame, with a visible bevel above the ice. */
    frame: 38,
    railHeight: 42,
    dividerHeight: 26,
    puckHeight: 26,
    bandHeight: 9,
});

const T = SLING_VIEW.tilt * Math.PI / 180, SIN = Math.sin(T), COS = Math.cos(T), D = SLING_VIEW.distance;

export interface Projected { x: number; y: number; /** Screen scale of a small object at this point. */ s: number }

export function project(x: number, y: number, z = 0, out: Projected = { x: 0, y: 0, s: 1 }): Projected {
    const depth = D + y * SIN - z * COS, f = D / depth;
    out.x = x * f; out.y = (y * COS + z * SIN) * f; out.s = f;
    return out;
}

/** Point on the plane at height `z` under a screen position (rink-local, unscaled). */
export function unproject(sx: number, sy: number, z = 0): { x: number; y: number } {
    const y = (D * z * SIN - sy * (D - z * COS)) / (sy * SIN - D * COS);
    const depth = D + y * SIN - z * COS;
    return { x: sx * depth / D, y };
}

/** Vertical squash of a flat disc lying on the ice. */
export const DISC_SQUASH = COS;
/** How much of a vertical face of height 1 shows on screen. */
export const WALL_SHOW = SIN;
