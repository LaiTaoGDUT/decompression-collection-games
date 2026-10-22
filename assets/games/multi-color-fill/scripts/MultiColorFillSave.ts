import { MULTI_COLOR_FILL_CATALOG_VERSION, MULTI_COLOR_FILL_LEVELS, MULTI_COLOR_FILL_NORMAL_LEGACY_LEVELS,
    type MultiColorFillMode } from './MultiColorFillLevels';
import { MultiColorFillModel, validateFillSnapshot, type MultiColorFillSnapshot } from './MultiColorFillModel';

export const MULTI_COLOR_FILL_DATA_VERSION = 1;

export interface FillModeProgress {
    cleared: number;
    current: number;
    draft?: MultiColorFillSnapshot;
}

export interface MultiColorFillSave {
    catalogVersion: number;
    mode: MultiColorFillMode;
    modes: Record<MultiColorFillMode, FillModeProgress>;
    hints: number;
    hintDay: string;
    hardModeDiscovered: boolean;
}

export function fillDayStamp(now = new Date()): string {
    const month = now.getMonth() + 1, day = now.getDate();
    return `${now.getFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}

/** 新存档当天零库存；从次日起每天首次登录加三个，回拨日期不重复发放。 */
export function grantFillDailyHints(save: MultiColorFillSave, today = fillDayStamp()): number {
    if (save.hintDay >= today) return 0;
    save.hintDay = today;
    save.hints = Math.min(99999, save.hints + 3);
    return 3;
}

function integer(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function fillUnlocked(mode: MultiColorFillMode, progress: FillModeProgress): number {
    return Math.min(MULTI_COLOR_FILL_LEVELS[mode].length, progress.cleared + 1);
}

/** 模式各有一个可续玩的棋盘。旧关重玩不会倒退解锁进度。 */
export function readFillSave(value: unknown, today = fillDayStamp()): MultiColorFillSave {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const modes = record.modes && typeof record.modes === 'object' ? record.modes as Record<string, unknown> : {};
    const readMode = (mode: MultiColorFillMode): FillModeProgress => {
        const raw = modes[mode] && typeof modes[mode] === 'object' ? modes[mode] as Record<string, unknown> : {};
        const total = MULTI_COLOR_FILL_LEVELS[mode].length;
        let cleared = Math.min(total, Math.max(0, integer(raw.cleared, 0)));
        let current = Math.min(total, cleared + 1, Math.max(1, integer(raw.current, cleared + 1)));
        if (mode === 'normal' && record.catalogVersion !== MULTI_COLOR_FILL_CATALOG_VERSION) {
            // 新编排不按旧关号排序：仅沿用连续已完成的前缀，不能把未玩过的题当作通关。
            const oldCleared = Math.max(0, integer(raw.cleared, 0));
            const firstUncleared = MULTI_COLOR_FILL_NORMAL_LEGACY_LEVELS.findIndex(number => number > oldCleared);
            cleared = firstUncleared < 0 ? total : firstUncleared;
            const mapped = MULTI_COLOR_FILL_NORMAL_LEGACY_LEVELS.indexOf(integer(raw.current, oldCleared + 1)) + 1;
            current = mapped > 0 && mapped <= cleared + 1 ? mapped : Math.min(total, cleared + 1);
        }
        const level = MULTI_COLOR_FILL_LEVELS[mode].get(current - 1);
        const hasDraft = validateFillSnapshot(level, raw.draft);
        const model = new MultiColorFillModel(level, hasDraft ? raw.draft : undefined);
        return { cleared, current, ...(hasDraft ? { draft: model.snapshot() } : {}) };
    };
    const hintDay = typeof record.hintDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.hintDay) ? record.hintDay : today;
    const hints = Math.min(99999, Math.max(0, integer(record.hints, 0)));
    const normal = readMode('normal'), hard = readMode('hard');
    return { catalogVersion: MULTI_COLOR_FILL_CATALOG_VERSION,
        mode: record.mode === 'hard' ? 'hard' : 'normal', modes: { normal, hard }, hints, hintDay,
        hardModeDiscovered: record.hardModeDiscovered === true };
}

export function completeFillLevel(mode: MultiColorFillMode, progress: FillModeProgress, levelNumber: number): void {
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > fillUnlocked(mode, progress)) return;
    progress.cleared = Math.max(progress.cleared, levelNumber);
    progress.current = Math.min(MULTI_COLOR_FILL_LEVELS[mode].length, progress.cleared + 1);
    progress.draft = undefined;
}
