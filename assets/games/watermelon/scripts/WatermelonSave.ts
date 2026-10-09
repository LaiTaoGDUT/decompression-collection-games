import type { GameSaveData } from '../../../services/storage/StorageService';
import type { WatermelonProgressSnapshot } from './WatermelonScoring';

export const WATERMELON_DATA_VERSION = 5;

export interface WatermelonRoundSaveStats {
    readonly continueOffered: boolean;
    readonly continueCompleted: boolean;
}

function readInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
    return typeof value === 'number' && Number.isInteger(value)
        ? Math.max(min, Math.min(max, value))
        : min;
}

function readCustomCount(data: GameSaveData | undefined, key: string): number {
    return readInteger(data?.dataVersion === WATERMELON_DATA_VERSION ? data.custom?.[key] : undefined, 0);
}

export function readSavedMaxLevel(data?: GameSaveData): number {
    return readInteger(data?.dataVersion === WATERMELON_DATA_VERSION ? data.custom?.maxFruitLevel : undefined, 0, 10);
}

/** 仅接受当前版本的进度；其他版本从新档开始。 */
export function normalizeWatermelonSave(
    previous: GameSaveData | undefined,
): GameSaveData {
    const current = previous?.dataVersion === WATERMELON_DATA_VERSION ? previous : undefined;
    return Object.freeze({
        dataVersion: WATERMELON_DATA_VERSION,
        playCount: readInteger(current?.playCount, 0),
        ...(current?.highScore === undefined
            ? {}
            : { highScore: Math.max(0, current.highScore) }),
        ...(current?.lastPlayedAt === undefined
            ? {}
            : { lastPlayedAt: Math.max(0, current.lastPlayedAt) }),
        custom: Object.freeze({
            maxFruitLevel: readSavedMaxLevel(current),
            continueOfferCount: readCustomCount(current, 'continueOfferCount'),
            continueCompletedCount: readCustomCount(current, 'continueCompletedCount'),
            ...(current?.custom?.activeRound === undefined ? {} : { activeRound: current.custom.activeRound }),
        }),
    });
}

export function createStartedWatermelonSave(
    previous: GameSaveData | undefined,
    now: number,
): GameSaveData {
    const current = normalizeWatermelonSave(previous);
    return Object.freeze({
        ...current,
        playCount: current.playCount + 1,
        lastPlayedAt: Math.max(0, now),
    });
}

/** 实时刷新最高分，不提前累计只属于正式结算的局末统计。 */
export function refreshWatermelonHighScore(
    previous: GameSaveData,
    score: number,
): GameSaveData {
    const current = normalizeWatermelonSave(previous);
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    return Object.freeze({
        ...current,
        highScore: Math.max(current.highScore ?? 0, safeScore),
    });
}

export function refreshCompletedWatermelonSave(
    previous: GameSaveData,
    result: WatermelonProgressSnapshot,
    stats: WatermelonRoundSaveStats = {
        continueOffered: false,
        continueCompleted: false,
    },
): GameSaveData {
    const current = normalizeWatermelonSave(previous);
    const highScore = Math.max(current.highScore ?? 0, result.score);
    const maxFruitLevel = Math.max(readSavedMaxLevel(current), result.maxFruitLevel);
    const offerCount = readCustomCount(current, 'continueOfferCount')
        + (stats.continueOffered ? 1 : 0);
    const completedCount = readCustomCount(current, 'continueCompletedCount')
        + (stats.continueCompleted ? 1 : 0);

    return Object.freeze({
        ...current,
        highScore,
        custom: Object.freeze({
            ...(current.custom ?? {}),
            maxFruitLevel,
            continueOfferCount: offerCount,
            continueCompletedCount: completedCount,
        }),
    });
}
