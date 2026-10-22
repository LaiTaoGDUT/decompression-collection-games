import { CYBLOCKBEES_LEVELS } from './CyBlockBeesLevels';

export interface CyBlockBeesSave {
    readonly version: number;
    /** 已解锁到第几关（1 起）。 */
    readonly unlocked: number;
    /** 已通关的最高关。 */
    readonly cleared: number;
    /** 每关的最高用墨评分（0～1000）。 */
    readonly best: Readonly<Record<string, number>>;
}

/** 当前关卡序列的存档格式；开发期间的其他版本不迁移。 */
export const CYBLOCKBEES_SAVE_VERSION = 4;
export const CYBLOCKBEES_DEFAULT_SAVE: CyBlockBeesSave = Object.freeze({
    version: CYBLOCKBEES_SAVE_VERSION, unlocked: 1, cleared: 0, best: Object.freeze({}),
});

/** 原作 UpdateSlider：剩余墨水达到 20%、40%、60% 分别保留一颗星。 */
export const CYBLOCKBEES_STAR_THRESHOLDS: readonly number[] = Object.freeze([.2, .4, .6]);

export function cyblockbeesStars(remaining: number): number {
    return CYBLOCKBEES_STAR_THRESHOLDS.filter(threshold => remaining + 1e-8 >= threshold).length;
}

function boundedInteger(value: unknown, low: number, high: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(low, Math.min(high, Math.floor(number))) : low;
}

/** 只读取当前版本，关卡进度和评分直接使用当前编号。 */
export function readCyBlockBeesSave(custom: unknown): CyBlockBeesSave {
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return CYBLOCKBEES_DEFAULT_SAVE;
    const raw = custom as Partial<CyBlockBeesSave>;
    if (raw.version !== CYBLOCKBEES_SAVE_VERSION) return CYBLOCKBEES_DEFAULT_SAVE;
    const levelCount = CYBLOCKBEES_LEVELS.length;
    const cleared = boundedInteger(raw.cleared, 0, levelCount);
    const unlocked = Math.max(Math.min(levelCount, cleared + 1), boundedInteger(raw.unlocked, 1, levelCount));
    const best: Record<string, number> = {};
    if (raw.best && typeof raw.best === 'object' && !Array.isArray(raw.best)) {
        for (let level = 1; level <= cleared; level++) {
            const score = Number(raw.best[String(level)]);
            if (Number.isFinite(score)) best[String(level)] = boundedInteger(score, 0, 1000);
        }
    }
    return Object.freeze({ version: CYBLOCKBEES_SAVE_VERSION, unlocked, cleared, best: Object.freeze(best) });
}

/** 只统计正式关卡的历史最高三星成绩，每关最多计一次。 */
export function countCyBlockBeesThreeStarLevels(save: CyBlockBeesSave): number {
    return CYBLOCKBEES_LEVELS.filter(level => level.level <= save.cleared
        && cyblockbeesStars((save.best[String(level.level)] ?? 0) / 1000) === 3).length;
}
