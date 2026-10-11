import { MULTI_COLOR_FILL_LEVELS, type MultiColorFillMode } from './MultiColorFillLevels';
import { MultiColorFillModel, validateFillPaths, type MultiColorFillSnapshot } from './MultiColorFillModel';

export const MULTI_COLOR_FILL_DATA_VERSION = 1;

export interface FillModeProgress {
    cleared: number;
    current: number;
    draft?: MultiColorFillSnapshot;
}

export interface MultiColorFillSave {
    mode: MultiColorFillMode;
    modes: Record<MultiColorFillMode, FillModeProgress>;
}

function integer(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function fillUnlocked(mode: MultiColorFillMode, progress: FillModeProgress): number {
    return Math.min(MULTI_COLOR_FILL_LEVELS[mode].length, progress.cleared + 1);
}

/** 模式各有一个可续玩的棋盘。旧关重玩不会倒退解锁进度。 */
export function readFillSave(value: unknown): MultiColorFillSave {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const modes = record.modes && typeof record.modes === 'object' ? record.modes as Record<string, unknown> : {};
    const readMode = (mode: MultiColorFillMode): FillModeProgress => {
        const raw = modes[mode] && typeof modes[mode] === 'object' ? modes[mode] as Record<string, unknown> : {};
        const total = MULTI_COLOR_FILL_LEVELS[mode].length;
        const cleared = Math.min(total, Math.max(0, integer(raw.cleared, 0)));
        const current = Math.min(total, cleared + 1, Math.max(1, integer(raw.current, cleared + 1)));
        const level = MULTI_COLOR_FILL_LEVELS[mode].get(current - 1);
        const hasDraft = !!raw.draft && typeof raw.draft === 'object'
            && (raw.draft as Record<string, unknown>).levelId === level.id
            && validateFillPaths(level, (raw.draft as Record<string, unknown>).paths);
        const model = new MultiColorFillModel(level, hasDraft ? raw.draft : undefined);
        return { cleared, current, ...(hasDraft && !model.completed ? { draft: model.snapshot() } : {}) };
    };
    return { mode: record.mode === 'hard' ? 'hard' : 'normal', modes: { normal: readMode('normal'), hard: readMode('hard') } };
}

export function completeFillLevel(mode: MultiColorFillMode, progress: FillModeProgress, levelNumber: number): void {
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > fillUnlocked(mode, progress)) return;
    progress.cleared = Math.max(progress.cleared, levelNumber);
    progress.current = Math.min(MULTI_COLOR_FILL_LEVELS[mode].length, progress.cleared + 1);
    progress.draft = undefined;
}
