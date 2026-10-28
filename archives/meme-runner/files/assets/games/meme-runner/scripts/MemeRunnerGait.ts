/** Continuous two-bone gait. The model's y=0 is the visible sole plane. */
export interface GaitPoint { x: number; y: number; }
export const GAIT = Object.freeze({ stride: 168, stance: .56, thigh: 32, shin: 32, ankle: 9 });
export interface GaitFoot extends GaitPoint { planted: boolean; angle: number; }
export function gaitFoot(phase: number): GaitFoot {
    const p = ((phase % 1) + 1) % 1, reach = GAIT.stride * GAIT.stance / 2;
    if (p < GAIT.stance) return { x: reach - GAIT.stride * p, y: 0, planted: true, angle: 0 };
    const u = (p - GAIT.stance) / (1 - GAIT.stance), smooth = u * u * (3 - 2 * u);
    const lift = Math.sin(Math.PI * u) ** 2;
    // Match ground velocity at both takeoff and touchdown instead of abruptly stopping the foot.
    const tangent = -GAIT.stride * (1 - GAIT.stance);
    return { x: -reach + 2 * reach * smooth + tangent * (2 * u ** 3 - 3 * u ** 2 + u),
        y: 25 * lift, planted: false, angle: 16 * lift };
}
/** Knee/elbow bends on the chosen side; length is preserved even at extreme target positions. */
export function gaitJoint(origin: GaitPoint, target: GaitPoint, upper: number, lower: number, bend = 1): GaitPoint {
    const dx = target.x - origin.x, dy = target.y - origin.y, length = Math.max(.001, Math.hypot(dx, dy));
    const distance = Math.max(Math.abs(upper - lower) + .001, Math.min(upper + lower - .001, length));
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const across = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend;
    return { x: origin.x + (dx * along - dy * across) / length, y: origin.y + (dy * along + dx * across) / length };
}
