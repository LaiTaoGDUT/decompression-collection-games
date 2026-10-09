/** One shot's result, including detached and rail-dropped bubbles, owns the celebration. */
export function celebrationTier(directCount: number, droppedCount = 0): number {
    const count = Math.max(0, directCount) + Math.max(0, droppedCount);
    return count < 6 ? 0 : Math.min(10, Math.floor(count));
}

export const POP_SPEED = 1.3;
export const POP_BURST_TIME = .14;
export const POP_CHAIN_INTERVAL = .032;
export const POP_MAX_CHAIN_DELAY = .36;
export const CLOUD_CAST_DURATION = 1.35;

/** Large groups ripple in order within a bounded beat, rather than adding delay per bubble forever. */
export function popStartTime(order: number): number {
    return Math.min(POP_MAX_CHAIN_DELAY, Math.max(0, order) * POP_CHAIN_INTERVAL);
}
