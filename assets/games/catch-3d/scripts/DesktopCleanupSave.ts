import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';

export const DESKTOP_CLEANUP_SAVE_VERSION = 1;
export const DESKTOP_CLEANUP_RULES_VERSION = 2;
const DESKTOP_CLEANUP_SAVE_KEY = 'catch-3d';

export interface DesktopCleanupSave {
    readonly playCount: number;
    readonly highScore: number;
    readonly wins: number;
    readonly bestClearMs?: number;
    readonly lastCompletedDate?: string;
    readonly rulesSeenVersion: number;
}

const EMPTY_SAVE: DesktopCleanupSave = Object.freeze({
    playCount: 0,
    highScore: 0,
    wins: 0,
    rulesSeenVersion: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : fallback;
}

export function readDesktopCleanupSave(storage: StorageService): DesktopCleanupSave {
    const data = storage.getGameData(DESKTOP_CLEANUP_SAVE_KEY);
    if (!data || data.dataVersion !== DESKTOP_CLEANUP_SAVE_VERSION) return EMPTY_SAVE;
    const custom = isRecord(data.custom) ? data.custom : {};
    const bestClearMs = typeof custom.bestClearMs === 'number'
        && Number.isFinite(custom.bestClearMs)
        && custom.bestClearMs >= 0
        ? custom.bestClearMs
        : undefined;
    const lastCompletedDate = typeof custom.lastCompletedDate === 'string'
        ? custom.lastCompletedDate
        : undefined;
    return Object.freeze({
        playCount: nonNegativeInteger(data.playCount),
        highScore: nonNegativeInteger(data.highScore),
        wins: nonNegativeInteger(custom.wins),
        ...(bestClearMs === undefined ? {} : { bestClearMs }),
        ...(lastCompletedDate ? { lastCompletedDate } : {}),
        rulesSeenVersion: nonNegativeInteger(custom.rulesSeenVersion),
    });
}

export function writeDesktopCleanupSave(
    storage: StorageService,
    save: DesktopCleanupSave,
): void {
    const data: GameSaveData = Object.freeze({
        dataVersion: DESKTOP_CLEANUP_SAVE_VERSION,
        playCount: save.playCount,
        highScore: save.highScore,
        lastPlayedAt: Date.now(),
        custom: Object.freeze({
            wins: save.wins,
            ...(save.bestClearMs === undefined ? {} : { bestClearMs: save.bestClearMs }),
            ...(save.lastCompletedDate ? { lastCompletedDate: save.lastCompletedDate } : {}),
            rulesSeenVersion: save.rulesSeenVersion,
        }),
    });
    storage.writeGameData(DESKTOP_CLEANUP_SAVE_KEY, data);
}
