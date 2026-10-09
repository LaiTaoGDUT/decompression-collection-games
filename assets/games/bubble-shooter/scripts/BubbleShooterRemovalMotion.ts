import { Bubble, DIAMETER, DANGER, Point, neighbors } from './BubbleShooterModel';
import { POP_SPEED, popStartTime } from './BubbleShooterFeedback';
export { POP_SPEED, POP_BURST_TIME, POP_CHAIN_INTERVAL, popStartTime } from './BubbleShooterFeedback';

export interface RemovalMotion {
    falling: boolean; x: number; y: number; delay: number;
    vx: number; speed: number; gravity: number; spin: number;
    fadeAt: number; fadeDuration: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const FALL_FADE_Y = DANGER + DIAMETER * 1.25;

/** Reproducible variation affects presentation only, never the round's random stream. */
export function removalMotion(bubble: Bubble, point: Point, falling: boolean, order: number): RemovalMotion {
    const seed = ((bubble.row + 1) * 73856093 ^ (bubble.col + 1) * 19349663 ^ (order + 1) * 83492791) >>> 0;
    const unit = (shift: number) => ((seed >>> shift) & 255) / 255;
    const speed = 20 + unit(8) * 75, gravity = 850 + unit(16) * 380;
    const distance = Math.max(0, point.y - FALL_FADE_Y);
    return { falling, x: point.x, y: point.y,
        delay: falling ? 0 : popStartTime(order),
        vx: (unit(0) - .5) * 76, speed, gravity, spin: (unit(16) - .5) * 150,
        fadeAt: (Math.sqrt(speed * speed + 2 * gravity * distance) - speed) / gravity,
        fadeDuration: .46 + unit(8) * .16 };
}

export function sampleRemoval(m: RemovalMotion, elapsed: number) {
    const age = Math.max(0, elapsed - m.delay);
    if (!m.falling) {
        const squash = smooth(age / .075), release = smooth((age - .075) / .065), collapse = smooth((age - .14) / .16);
        const sx = age < .075 ? 1 + .20 * squash : (1.20 + .12 * release) * (1 - .85 * collapse);
        const sy = age < .075 ? 1 - .23 * squash : (.77 + .55 * release) * (1 - .85 * collapse);
        return { x: m.x, y: m.y, sx, sy, angle: 0,
            opacity: 255 * (1 - smooth((age - .14) / .14)), done: age >= .30, age };
    }
    const fallTime = Math.min(age, m.fadeAt);
    const fade = clamp((age - m.fadeAt) / m.fadeDuration);
    // Fade affects opacity only; gravity continues through the threshold without braking.
    const y = m.y - m.speed * age - .5 * m.gravity * age * age;
    const settle = smooth(age / .13);
    return { x: Math.max(-336, Math.min(336, m.x + m.vx * (fallTime + Math.min(age - fallTime, .12)))),
        y, sx: 1 + .025 * Math.sin(age * 11) * (1 - settle), sy: 1 - .025 * Math.sin(age * 11) * (1 - settle),
        angle: m.spin * age, opacity: 255 * (1 - smooth(fade)), done: fade >= 1, age };
}

/** Replay visible removals, releasing a bubble only when its final ceiling path breaks. */
export function dropStartTimes(before: readonly Bubble[], removed: readonly Bubble[], dropped: readonly Bubble[], phase: number): Map<string, number> {
    const key = (b: {row: number; col: number}) => `${b.row}:${b.col}`;
    const cells = new Map(before.map(b => [key(b), b]));
    // Include the just-attached shot, which is absent from the pre-shot board.
    removed.forEach(b => cells.set(key(b), b));
    dropped.forEach(b => cells.set(key(b), b));
    const starts = new Map<string, number>();
    removed.forEach((bubble, index) => {
        cells.delete(key(bubble));
        const reached = new Set<string>();
        const queue = Array.from(cells.values()).filter(b => b.row === 0);
        queue.forEach(b => reached.add(key(b)));
        for (let i = 0; i < queue.length; i++) {
            for (const next of neighbors(queue[i], phase)) {
                const id = key(next), cell = cells.get(id);
                if (cell && !reached.has(id)) { reached.add(id); queue.push(cell); }
            }
        }
        dropped.forEach(b => {
            const id = key(b);
            if (!reached.has(id) && !starts.has(id)) starts.set(id, popStartTime(index) / POP_SPEED);
        });
    });
    return starts;
}
