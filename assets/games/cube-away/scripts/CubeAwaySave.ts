import { canReceiveDailyReward } from '../../../services/cloud/ServerTimeService';
import { readBoardSkinId, type BoardSkin } from './CubeAwayBoardSkins';
import { CUBE_AWAY_LEVEL_BANK, CUBE_AWAY_TOTAL_LEVELS, DIRS, hasCubeAwayDoubleChain, hasCubeAwayEdgeRelay, type PausedSnakePosition } from './CubeAwayTypes';

export const CUBE_AWAY_SAVE_VERSION = 1;
export const CUBE_AWAY_START_HINTS = 3;
export const CUBE_AWAY_START_SMASHES = 2;
export const CUBE_AWAY_START_CANES = 2;

export interface CubeAwayDraft {
    readonly level: number;
    readonly removedArrowIds: readonly number[];
    readonly pausedSnakes?: readonly PausedSnakePosition[];
    readonly mistakes?: number;
    readonly reverseDirs: Readonly<Record<string, string>>;
    readonly livesLeft: number;
    readonly moves: number;
    readonly elapsedSeconds: number;
}

export interface CubeAwaySave {
    version: number;
    levelBank: string;
    cleared: number;
    current: number;
    unlocked: number;
    hints: number;
    smashes: number;
    canes: number;
    hintDay: string;
    soundEnabled: boolean;
    seenMechanics: string[];
    bestMoves: Record<string, number>;
    boardSkin?: BoardSkin;
    draft?: CubeAwayDraft;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
}

export function readCubeAwaySave(
    rawCustom: unknown,
    today?: string,
    totalLevels = CUBE_AWAY_TOTAL_LEVELS,
): CubeAwaySave {
    const raw = rawCustom && typeof rawCustom === 'object'
        ? rawCustom as Partial<CubeAwaySave>
        : {};
    // Drafts and records refer to snake IDs and move counts in a particular puzzle.
    const sameBank = raw.levelBank === CUBE_AWAY_LEVEL_BANK;
    const canRestoreLevel = (level: number) => {
        if (sameBank) return true;
        if (hasCubeAwayDoubleChain(level)) return false;
        if (raw.levelBank === 'mint-original-v7') return true;
        if (hasCubeAwayEdgeRelay(level)) return false;
        return raw.levelBank === 'mint-original-v6' || (raw.levelBank === 'mint-original-v5' && level % 5 !== 0);
    };
    const cleared = clampInt(raw.cleared, 0, 0, totalLevels);
    const unlocked = Math.min(
        totalLevels,
        Math.max(cleared + 1, clampInt(raw.unlocked, cleared + 1, 1, totalLevels)),
    );
    const current = clampInt(raw.current, unlocked, 1, unlocked);
    const hints = clampInt(raw.hints, CUBE_AWAY_START_HINTS, 0, 999);
    const smashes = clampInt(raw.smashes, CUBE_AWAY_START_SMASHES, 0, 999);
    const canes = clampInt(raw.canes, CUBE_AWAY_START_CANES, 0, 999);

    let hintDay = typeof raw.hintDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.hintDay)
        ? raw.hintDay
        : (raw.cleared !== undefined || raw.current !== undefined ? '' : today ?? '');
    if (today && hintDay > today) hintDay = today;

    const seenMechanics: string[] = [];
    if (Array.isArray(raw.seenMechanics)) {
        for (const item of raw.seenMechanics) {
            if (typeof item === 'string' && item && seenMechanics.indexOf(item) < 0) {
                seenMechanics.push(item);
            }
        }
    }

    const bestMoves: Record<string, number> = {};
    if (raw.bestMoves && typeof raw.bestMoves === 'object') {
        for (const key of Object.keys(raw.bestMoves)) {
            const levelNum = Number(key);
            const val = raw.bestMoves[key];
            if (Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= cleared && canRestoreLevel(levelNum)
                && typeof val === 'number' && Number.isFinite(val) && val > 0) {
                bestMoves[String(levelNum)] = Math.floor(val);
            }
        }
    }

    let draft: CubeAwayDraft | undefined;
    if (canRestoreLevel(current) && raw.draft && typeof raw.draft === 'object' && raw.draft.level === current) {
        const d = raw.draft as Partial<CubeAwayDraft>;
        const removedArrowIds = Array.isArray(d.removedArrowIds)
            ? d.removedArrowIds.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)
            : [];
        const reverseDirs: Record<string, string> = {};
        if (d.reverseDirs && typeof d.reverseDirs === 'object') {
            for (const key of Object.keys(d.reverseDirs)) {
                const v = (d.reverseDirs as Record<string, unknown>)[key];
                if (typeof v === 'string') reverseDirs[key] = v;
            }
        }
        const pausedSnakes = Array.isArray(d.pausedSnakes) ? d.pausedSnakes.filter((pose): pose is PausedSnakePosition =>
            pose && Number.isInteger(pose.id) && pose.id >= 0 && DIRS.indexOf(pose.fireDir) >= 0
            && Array.isArray(pose.cells) && pose.cells.length > 0 && pose.cells.every((c: unknown) => typeof c === 'string')) : [];
        draft = {
            level: current,
            removedArrowIds,
            ...(pausedSnakes.length ? { pausedSnakes } : {}),
            ...(d.mistakes !== undefined ? { mistakes: clampInt(d.mistakes, 0, 0, 9999) } : {}),
            reverseDirs,
            livesLeft: clampInt(d.livesLeft, 5, 1, 5),
            moves: clampInt(d.moves, 0, 0, 9999),
            elapsedSeconds: typeof d.elapsedSeconds === 'number' && Number.isFinite(d.elapsedSeconds) && d.elapsedSeconds >= 0
                ? Math.min(86400, d.elapsedSeconds)
                : 0,
        };
    }

    const skinId = readBoardSkinId(raw.boardSkin?.id);
    return {
        version: CUBE_AWAY_SAVE_VERSION,
        levelBank: CUBE_AWAY_LEVEL_BANK,
        cleared,
        current,
        unlocked,
        hints,
        smashes,
        canes,
        hintDay,
        soundEnabled: raw.soundEnabled !== false,
        seenMechanics,
        bestMoves,
        boardSkin: skinId && Number.isInteger(raw.boardSkin.level)
            && raw.boardSkin.level >= 1 && raw.boardSkin.level <= totalLevels
            ? { level: raw.boardSkin.level, id: skinId } : undefined,
        draft,
    };
}

export function grantCubeAwayDailyTools(save: CubeAwaySave, today?: string): number {
    if (!canReceiveDailyReward(save.hintDay, today)) return 0;
    save.hintDay = today!;
    const before = save.hints;
    save.hints = Math.min(999, save.hints + 2);
    save.smashes = Math.min(999, save.smashes + 1);
    save.canes = Math.min(999, save.canes + 1);
    return save.hints - before;
}

export function completeCubeAwayLevel(
    save: CubeAwaySave,
    levelNumber: number,
    moves: number,
    totalLevels = CUBE_AWAY_TOTAL_LEVELS,
): boolean {
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > save.unlocked) return false;
    const prev = save.bestMoves[String(levelNumber)];
    if (!prev || moves < prev) {
        save.bestMoves[String(levelNumber)] = Math.max(1, Math.floor(moves));
    }
    if (levelNumber > save.cleared) {
        save.cleared = levelNumber;
    }
    save.unlocked = Math.min(totalLevels, Math.max(save.unlocked, save.cleared + 1));
    save.current = Math.min(totalLevels, Math.max(1, levelNumber + 1 <= totalLevels ? levelNumber + 1 : totalLevels));
    if (save.draft && save.draft.level === levelNumber) {
        save.draft = undefined;
    }
    return true;
}

export function serializeCubeAwaySave(save: CubeAwaySave): Record<string, unknown> {
    return {
        version: save.version,
        levelBank: save.levelBank,
        cleared: save.cleared,
        current: save.current,
        unlocked: save.unlocked,
        hints: save.hints,
        smashes: save.smashes,
        canes: save.canes,
        hintDay: save.hintDay,
        soundEnabled: save.soundEnabled,
        seenMechanics: save.seenMechanics.slice(),
        bestMoves: { ...save.bestMoves },
        ...(save.boardSkin ? { boardSkin: save.boardSkin } : {}),
        ...(save.draft ? { draft: save.draft } : {}),
    };
}
