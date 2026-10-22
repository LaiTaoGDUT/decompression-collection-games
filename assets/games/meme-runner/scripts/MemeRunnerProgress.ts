import type { MemeRunnerModel } from './MemeRunnerModel';

/** Personal records for the delivery course. Endless-mode records (v2) measured a different game and are not carried over. */
export interface RunnerProgress { version: 3; best: { score: number; stars: number; deliveries: number; fastest: number }; }
const count = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export function readRunnerProgress(value: unknown): RunnerProgress {
    const saved = object(value), best = Number(saved.version) === 3 ? object(saved.best) : {};
    return { version: 3, best: { score: count(best.score), stars: Math.min(3, count(best.stars)), deliveries: count(best.deliveries), fastest: count(best.fastest) } };
}
export function recordRunnerResult(progress: RunnerProgress, model: MemeRunnerModel): RunnerProgress {
    const next = readRunnerProgress(progress), seconds = Math.ceil(model.time);
    next.best.score = Math.max(next.best.score, model.score);
    if (model.delivered) {
        next.best.stars = Math.max(next.best.stars, model.stars); next.best.deliveries++;
        next.best.fastest = next.best.fastest ? Math.min(next.best.fastest, seconds) : seconds;
    }
    return next;
}
