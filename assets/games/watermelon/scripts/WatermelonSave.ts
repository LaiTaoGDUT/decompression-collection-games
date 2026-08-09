import type { GameSaveData } from '../../../services/storage/StorageService';
import type { WatermelonProgressSnapshot } from './WatermelonScoring';

export const WATERMELON_DATA_VERSION = 2;

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
    return readInteger(data?.custom?.[key], 0);
}

export function readSavedMaxLevel(data?: GameSaveData): number {
    return readInteger(data?.custom?.maxFruitLevel, 0, 10);
}

/** 将旧游戏存档按字段迁移；未知自定义字段保留，缺失统计安全补零。 */
export function normalizeWatermelonSave(
    previous: GameSaveData | undefined,
): GameSaveData {
    return Object.freeze({
        dataVersion: WATERMELON_DATA_VERSION,
        playCount: readInteger(previous?.playCount, 0),
        ...(previous?.highScore === undefined
            ? {}
            : { highScore: Math.max(0, previous.highScore) }),
        ...(previous?.lastPlayedAt === undefined
            ? {}
            : { lastPlayedAt: Math.max(0, previous.lastPlayedAt) }),
        custom: Object.freeze({
            ...(previous?.custom ?? {}),
            maxFruitLevel: readSavedMaxLevel(previous),
            continueOfferCount: readCustomCount(previous, 'continueOfferCount'),
            continueCompletedCount: readCustomCount(previous, 'continueCompletedCount'),
        }),
    });
}

export function createStartedWatermelonSave(
    previous: GameSaveData | undefined,
    now: number,
): GameSaveData {
    const migrated = normalizeWatermelonSave(previous);
    return Object.freeze({
        ...migrated,
        playCount: migrated.playCount + 1,
        lastPlayedAt: Math.max(0, now),
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
    const migrated = normalizeWatermelonSave(previous);
    const highScore = Math.max(migrated.highScore ?? 0, result.score);
    const maxFruitLevel = Math.max(readSavedMaxLevel(migrated), result.maxFruitLevel);
    const offerCount = readCustomCount(migrated, 'continueOfferCount')
        + (stats.continueOffered ? 1 : 0);
    const completedCount = readCustomCount(migrated, 'continueCompletedCount')
        + (stats.continueCompleted ? 1 : 0);

    return Object.freeze({
        ...migrated,
        highScore,
        custom: Object.freeze({
            ...(migrated.custom ?? {}),
            maxFruitLevel,
            continueOfferCount: offerCount,
            continueCompletedCount: completedCount,
        }),
    });
}
