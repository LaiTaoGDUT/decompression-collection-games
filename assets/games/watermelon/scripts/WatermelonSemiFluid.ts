/**
 * 60 Hz equivalents of melon-lab's 120 Hz `MODES.fluid` parameters.
 * Distance-constraint stiffness uses `1 - (1 - referenceStiffness) ** 2`,
 * damping is squared, and the per-step speed cap is doubled so their
 * per-second response stays aligned with the reference simulation.
 */
export const WATERMELON_SEMI_FLUID = Object.freeze({
    simulationHz: 60,
    edge: 0.91,
    bend: 0.4224,
    shape: 0.033711,
    damping: 0.984064,
    pressure: 0.96,
    referencePlayfieldWidth: 450,
    gravity: 980,
    tiltAcceleration: 760,
    maxPointSpeedPerStep: 10,
    iterations: 6,
    restoreDepenetrationSeconds: 0.2,
});
