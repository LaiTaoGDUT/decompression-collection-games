import { CYBLOCKBEES_LEVELS, CYBLOCKBEES_REMOVED_LEGACY_LEVELS } from './CyBlockBeesLevels';

export interface CyBlockBeesSave {
    readonly version: number;
    /** 已解锁到第几关（1 起）。 */
    readonly unlocked: number;
    /** 已通关的最高关。 */
    readonly cleared: number;
    /** 每关的最高用墨评分（0～1000）。 */
    readonly best: Readonly<Record<string, number>>;
}

/** v3 使用精简后的 200 关编号；v1/v2 使用原 208 关编号。 */
export const CYBLOCKBEES_SAVE_VERSION = 3;
export const CYBLOCKBEES_DEFAULT_SAVE: CyBlockBeesSave = Object.freeze({
    version: CYBLOCKBEES_SAVE_VERSION, unlocked: 1, cleared: 0, best: Object.freeze({}),
});

/** 原作 UpdateSlider：剩余墨水达到 20%、40%、60% 分别保留一颗星。 */
export const CYBLOCKBEES_STAR_THRESHOLDS: readonly number[] = Object.freeze([.2, .4, .6]);

export function cyblockbeesStars(remaining: number): number {
    return CYBLOCKBEES_STAR_THRESHOLDS.filter(threshold => remaining + 1e-8 >= threshold).length;
}

const LEGACY_LEVEL_ORDER: readonly number[] = Object.freeze(
    Array.from({ length: CYBLOCKBEES_LEVELS.length + CYBLOCKBEES_REMOVED_LEGACY_LEVELS.length }, (_, i) => i + 1)
        .filter(level => CYBLOCKBEES_REMOVED_LEGACY_LEVELS.indexOf(level) < 0),
);

function boundedInteger(value: unknown, low: number, high: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(low, Math.min(high, Math.floor(number))) : low;
}

/** 旧记录按保留关卡迁移；删除关卡的评分丢弃，不把它转给相邻关卡。 */
export function readCyBlockBeesSave(custom: unknown): CyBlockBeesSave {
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return CYBLOCKBEES_DEFAULT_SAVE;
    const raw = custom as Partial<CyBlockBeesSave>;
    if (raw.version !== CYBLOCKBEES_SAVE_VERSION && raw.version !== 1 && raw.version !== 2)
        return CYBLOCKBEES_DEFAULT_SAVE;
    const legacy = raw.version !== CYBLOCKBEES_SAVE_VERSION;
    const levelCount = CYBLOCKBEES_LEVELS.length;
    const sourceCount = legacy ? levelCount + CYBLOCKBEES_REMOVED_LEGACY_LEVELS.length : levelCount;
    const sourceCleared = boundedInteger(raw.cleared, 0, sourceCount);
    const sourceUnlocked = boundedInteger(raw.unlocked, 1, sourceCount);
    const cleared = legacy ? LEGACY_LEVEL_ORDER.filter(level => level <= sourceCleared).length : sourceCleared;
    const unlocked = Math.max(Math.min(levelCount, cleared + 1), legacy
        ? Math.max(1, LEGACY_LEVEL_ORDER.filter(level => level <= sourceUnlocked).length) : sourceUnlocked);
    const best: Record<string, number> = {};
    if (raw.version !== 1 && raw.best && typeof raw.best === 'object' && !Array.isArray(raw.best)) {
        for (let level = 1; level <= cleared; level++) {
            const sourceLevel = legacy ? LEGACY_LEVEL_ORDER[level - 1] : level;
            const score = Number(raw.best[String(sourceLevel)]);
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
