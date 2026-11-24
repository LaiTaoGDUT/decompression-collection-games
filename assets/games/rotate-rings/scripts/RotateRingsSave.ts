import type { RingLevelBank, RingMode, RingSnapshot, RingProp } from './RotateRingsTypes';
import { canReceiveDailyReward } from '../../../services/cloud/ServerTimeService';

export const ROTATE_RINGS_SAVE_VERSION = 2;
export interface RingBest { moves: number; seconds: number; levelId?: number; }
export interface RingModeProgress { cleared: number; current: number; draft?: RingSnapshot; best: Record<string, RingBest>; }
export interface RotateRingsSave {
    mode: RingMode; modes: Record<RingMode, RingModeProgress>; completed: Record<string, number>; props: Record<RingProp, number>;
    hintDay: string; tutorialCompleted: boolean;
}
export const RING_PROP_START = 3;
const integer = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;

/** 旧存档可能越关通关，只有从第一关起连续完成的关卡才能解锁后续关卡。 */
export function ringUnlockedLevel(completed: RotateRingsSave['completed'], mode: RingMode, total: number): number {
    for (let number = 1; number < total; number++) {
        if (completed[`${mode}-${number}`] !== 1) return number;
    }
    return total;
}

export function ringDayStamp(now = new Date()): string {
    const month = now.getMonth() + 1, day = now.getDate();
    return `${now.getFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}
/** 按本次冷启动取得的服务器日期赠送；同日重进和重开均不重复发放。 */
export function grantRingDailyHints(save: RotateRingsSave, today?: string): number {
    if (!canReceiveDailyReward(save.hintDay, today)) return 0;
    save.hintDay = today;
    const before = save.props.hint;
    save.props.hint = Math.min(999, before + 3);
    return save.props.hint - before;
}
export function readRingSave(value: unknown, bank: RingLevelBank, today?: string): RotateRingsSave {
    const raw = value && typeof value === 'object' ? value as Partial<RotateRingsSave> : {};
    const completed: Record<string, number> = {};
    const modeProgress = (mode: RingMode): RingModeProgress => {
        const p = raw.modes?.[mode];
        const total = bank.modes[mode].length;
        // 原创题库早期存档只能按顺序通关，旧计数恰好对应前 N 关。
        const prefix = raw.completed ? 0 : integer(p?.cleared, 0);
        let cleared = 0;
        for (let number = 1; number <= total; number++) {
            const key = `${mode}-${number}`;
            if (number <= prefix || raw.completed?.[key] === 1) {
                completed[key] = 1;
                cleared++;
            }
        }
        const unlocked = ringUnlockedLevel(completed, mode, total);
        const current = Math.min(unlocked, Math.max(1, integer(p?.current, unlocked)));
        const best: Record<string, RingBest> = {};
        for (const key of Object.keys(p?.best || {})) {
            const level = integer(Number(key), 0), b = p.best[key];
            if (!completed[`${mode}-${key}`] || !b || !Number.isFinite(b.moves) || b.moves < 0 || !Number.isFinite(b.seconds) || b.seconds < 0) continue;
            const levelId = bank.modes[mode][level - 1].id;
            // Untagged scores came from the first original campaign, whose IDs were sequential.
            if ((b.levelId ?? (mode === 'normal' ? 810000 : 820000) + level) !== levelId) continue;
            best[key] = { levelId, moves: Math.floor(b.moves), seconds: Math.min(999999, b.seconds) };
        }
        const sourceDraft = p?.draft && p.draft.levelId === bank.modes[mode][current - 1].id ? p.draft : undefined;
        const draft = sourceDraft ? { ...sourceDraft } : undefined;
        // 旧存档保留全部棋盘进度，只清理已经移除的视觉收集字段；不提升版本号或重置关卡。
        if (draft) delete (draft as RingSnapshot & { acornTargets?: unknown }).acornTargets;
        return { cleared, current, best, draft };
    };
    const normal = modeProgress('normal'), hard = modeProgress('hard');
    const props = { hint: Math.max(0, Math.min(999, integer(raw.props?.hint, RING_PROP_START))) };
    // 旧存档保留已有提示与关内状态；首次使用每日奖励时领取当天三个，初次创建存档的三个已在初始库存中。
    let hintDay = typeof raw.hintDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.hintDay) ? raw.hintDay : raw.modes ? '' : today ?? '';
    if (today && hintDay > today) hintDay = today;
    return { mode: raw.mode === 'hard' ? 'hard' : 'normal', modes: { normal, hard }, completed, props, hintDay,
        tutorialCompleted: raw.tutorialCompleted === true || completed['normal-1'] === 1 };
}
export function completeRingLevel(save: RotateRingsSave, bank: RingLevelBank, mode: RingMode, number: number, best: RingBest): boolean {
    const progress = save.modes[mode];
    const total = bank.modes[mode].length;
    const unlocked = ringUnlockedLevel(save.completed, mode, total);
    if (!Number.isInteger(number) || number < 1 || number > unlocked) return false;
    const previous = progress.best[String(number)];
    if (!previous || best.moves < previous.moves || (best.moves === previous.moves && best.seconds < previous.seconds)) progress.best[String(number)] = { ...best, levelId: bank.modes[mode][number - 1].id };
    const key = `${mode}-${number}`;
    if (!save.completed[key]) {
        save.completed[key] = 1;
        progress.cleared++;
    }
    if (mode === 'normal') save.tutorialCompleted = true;
    progress.current = number === unlocked ? ringUnlockedLevel(save.completed, mode, total) : number + 1;
    progress.draft = undefined;
    return true;
}
