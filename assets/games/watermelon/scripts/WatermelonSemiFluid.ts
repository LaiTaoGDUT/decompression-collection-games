/** Parameters copied from melon-lab's `MODES.fluid`. Keep these together so
 * gameplay tuning cannot drift from the reference simulation. */
export const WATERMELON_SEMI_FLUID = Object.freeze({
    edge: 0.7,
    bend: 0.24,
    shape: 0.017,
    damping: 0.992,
    pressure: 0.8,
    referencePlayfieldWidth: 450,
    gravity: 980,
    tiltAcceleration: 760,
    maxPointSpeedPerStep: 5,
    iterations: 6,
    restoreDepenetrationSeconds: 0.2,
});
