import type {
    GameSaveData,
    StorageService,
} from '../../../services/storage/StorageService';
import type { DoodleJumpSimulationSnapshot } from './DoodleJumpSimulation';
import { DOODLE_JUMP_RULES_VERSION } from './DoodleJumpReferenceRules';

export const DOODLE_JUMP_GAME_ID = 'doodle-jump';
export const DOODLE_JUMP_SAVE_DATA_VERSION = 1;
export const DOODLE_JUMP_GAME_DATA_VERSION = 4;
export const DOODLE_JUMP_SETTINGS_VERSION = 1;

export type DoodleJumpSensorSensitivity = 0.75 | 1 | 1.25;

export interface DoodleJumpRunHistoryBaseline {
    readonly playCount: number;
    readonly bestCarrotCount: number;
    readonly lastPlayedAt: number;
    readonly bestHeightMeters: number;
    readonly bestKillCount: number;
    readonly totalShots: number;
    readonly totalKills: number;
    readonly totalCarrots: number;
}

export interface DoodleJumpActiveRound {
    readonly version: 1;
    readonly savedAt: number;
    readonly historyBaseline: DoodleJumpRunHistoryBaseline;
    readonly runShotCount: number;
    readonly successfulRevives: number;
    readonly snapshot: DoodleJumpSimulationSnapshot;
}

export interface DoodleJumpSaveState {
    readonly playCount: number;
    readonly bestCarrotCount: number;
    readonly lastPlayedAt: number;
    readonly bestHeightMeters: number;
    readonly bestKillCount: number;
    readonly totalShots: number;
    readonly totalKills: number;
    readonly totalCarrots: number;
    readonly sensorInvert: boolean;
    readonly sensorSensitivity: DoodleJumpSensorSensitivity;
    readonly tutorialCompleted: boolean;
    readonly headStartCount: number;
    readonly settingsVersion: number;
    readonly activeRound?: DoodleJumpActiveRound;
}

export interface DoodleJumpRunHistory {
    readonly shots: number;
    readonly kills: number;
    readonly carrots: number;
    readonly maxHeightMeters: number;
    readonly completed: boolean;
    readonly playedAt: number;
    readonly activeRound?: DoodleJumpActiveRound;
}

export interface DoodleJumpRunSaveResult {
    readonly save: DoodleJumpSaveState;
    readonly isNewBestCarrotCount: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
    if (typeof value !== 'number'
        || !Number.isFinite(value)
        || !Number.isInteger(value)
        || value < 0) {
        throw new Error(`${field} must be a non-negative integer.`);
    }
    return value;
}

function finiteTimestamp(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${field} must be a non-negative timestamp.`);
    }
    return Math.floor(value);
}

function booleanField(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${field} must be boolean.`);
    return value;
}

function sensitivityField(value: unknown): DoodleJumpSensorSensitivity {
    if (value === 0.75 || value === 1 || value === 1.25) return value;
    throw new Error('custom.sensorSensitivity must be 0.75, 1, or 1.25.');
}

function parseActiveRound(value: unknown): DoodleJumpActiveRound | undefined {
    if (value === undefined) return undefined;
    try {
        if (!isRecord(value)
            || value.version !== 1
            || !isRecord(value.historyBaseline)
            || !isRecord(value.snapshot)) return undefined;
        const snapshot = value.snapshot;
        if (snapshot.rulesVersion !== DOODLE_JUMP_RULES_VERSION
            || !isRecord(snapshot.generationState)
            || !Array.isArray(snapshot.platforms)
            || !Array.isArray(snapshot.enemies)
            || !Array.isArray(snapshot.hazards)
            || !Array.isArray(snapshot.items)
            || !Array.isArray(snapshot.collectibles)
            || !isRecord(snapshot.collectibleState)
            || !isRecord(snapshot.randomStreams)) return undefined;
        const baseline = value.historyBaseline;
        return Object.freeze({
            version: 1,
            savedAt: finiteTimestamp(value.savedAt, 'custom.activeRound.savedAt'),
            historyBaseline: Object.freeze({
                playCount: nonNegativeInteger(baseline.playCount, 'activeRound.historyBaseline.playCount'),
                bestCarrotCount: nonNegativeInteger(baseline.bestCarrotCount, 'activeRound.historyBaseline.bestCarrotCount'),
                lastPlayedAt: finiteTimestamp(baseline.lastPlayedAt, 'activeRound.historyBaseline.lastPlayedAt'),
                bestHeightMeters: nonNegativeInteger(baseline.bestHeightMeters, 'activeRound.historyBaseline.bestHeightMeters'),
                bestKillCount: nonNegativeInteger(baseline.bestKillCount, 'activeRound.historyBaseline.bestKillCount'),
                totalShots: nonNegativeInteger(baseline.totalShots, 'activeRound.historyBaseline.totalShots'),
                totalKills: nonNegativeInteger(baseline.totalKills, 'activeRound.historyBaseline.totalKills'),
                totalCarrots: nonNegativeInteger(baseline.totalCarrots, 'activeRound.historyBaseline.totalCarrots'),
            }),
            runShotCount: nonNegativeInteger(value.runShotCount, 'custom.activeRound.runShotCount'),
            successfulRevives: nonNegativeInteger(
                value.successfulRevives,
                'custom.activeRound.successfulRevives',
            ),
            snapshot: snapshot as unknown as DoodleJumpSimulationSnapshot,
        });
    } catch (error: unknown) {
        // TODO: console.warn('[DoodleJumpSave] Ignored invalid active round.', error);
        return undefined;
    }
}

function defaultSave(): DoodleJumpSaveState {
    return Object.freeze({
        playCount: 0,
        bestCarrotCount: 0,
        lastPlayedAt: 0,
        bestHeightMeters: 0,
        bestKillCount: 0,
        totalShots: 0,
        totalKills: 0,
        totalCarrots: 0,
        sensorInvert: false,
        sensorSensitivity: 1,
        tutorialCompleted: false,
        headStartCount: 0,
        settingsVersion: DOODLE_JUMP_SETTINGS_VERSION,
    });
}

function parseSave(data: GameSaveData): DoodleJumpSaveState {
    if (data.dataVersion !== DOODLE_JUMP_SAVE_DATA_VERSION) {
        throw new Error(`Unsupported dataVersion ${data.dataVersion}.`);
    }
    const custom = data.custom;
    if (!isRecord(custom) || (custom.gameDataVersion !== DOODLE_JUMP_GAME_DATA_VERSION && custom.gameDataVersion !== 3)
        || custom.settingsVersion !== DOODLE_JUMP_SETTINGS_VERSION) {
        throw new Error('Unsupported Doodle Jump save version.');
    }
    return Object.freeze({
            playCount: nonNegativeInteger(data.playCount, 'playCount'),
            bestCarrotCount: custom.gameDataVersion === 3 ? 0 : nonNegativeInteger(data.highScore, 'bestCarrotCount'),
            lastPlayedAt: finiteTimestamp(data.lastPlayedAt, 'lastPlayedAt'),
            bestHeightMeters: nonNegativeInteger(
                custom.bestHeightMeters,
                'custom.bestHeightMeters',
            ),
            bestKillCount: nonNegativeInteger(
                custom.bestKillCount,
                'custom.bestKillCount',
            ),
            totalShots: nonNegativeInteger(custom.totalShots, 'custom.totalShots'),
            totalKills: nonNegativeInteger(custom.totalKills, 'custom.totalKills'),
            totalCarrots: custom.gameDataVersion === 3 ? 0 : nonNegativeInteger(custom.totalCarrots, 'custom.totalCarrots'),
            sensorInvert: booleanField(custom.sensorInvert, 'custom.sensorInvert'),
            sensorSensitivity: sensitivityField(custom.sensorSensitivity),
            tutorialCompleted: booleanField(
                custom.tutorialCompleted,
                'custom.tutorialCompleted',
            ),
            headStartCount: nonNegativeInteger(
                custom.headStartCount,
                'custom.headStartCount',
            ),
            settingsVersion: DOODLE_JUMP_SETTINGS_VERSION,
            activeRound: parseActiveRound(custom.activeRound),
    });
}

export function toDoodleJumpGameSaveData(save: DoodleJumpSaveState): GameSaveData {
    return Object.freeze({
        dataVersion: DOODLE_JUMP_SAVE_DATA_VERSION,
        playCount: save.playCount,
        // The shared storage contract calls its numeric record highScore; here it stores a carrot count only.
        highScore: save.bestCarrotCount,
        lastPlayedAt: save.lastPlayedAt,
        custom: Object.freeze({
            gameDataVersion: DOODLE_JUMP_GAME_DATA_VERSION,
            bestHeightMeters: save.bestHeightMeters,
            bestKillCount: save.bestKillCount,
            totalShots: save.totalShots,
            totalKills: save.totalKills,
            totalCarrots: save.totalCarrots,
            sensorInvert: save.sensorInvert,
            sensorSensitivity: save.sensorSensitivity,
            tutorialCompleted: save.tutorialCompleted,
            headStartCount: save.headStartCount,
            settingsVersion: save.settingsVersion,
            activeRound: save.activeRound,
        }),
    });
}

export function readDoodleJumpSave(storage: StorageService): DoodleJumpSaveState {
    const data = storage.getGameData(DOODLE_JUMP_GAME_ID);
    if (!data) return defaultSave();
    try {
        return parseSave(data);
    } catch {
        const fallback = defaultSave();
        try {
            storage.writeGameData(DOODLE_JUMP_GAME_ID, toDoodleJumpGameSaveData(fallback));
            storage.flush();
        } catch {
            // The current session can still start with defaults if persistence is unavailable.
        }
        return fallback;
    }
}

export function buildDoodleJumpRunSave(
    baseline: DoodleJumpSaveState,
    history: DoodleJumpRunHistory,
): DoodleJumpRunSaveResult {
    const shots = Math.max(0, Math.floor(history.shots));
    const kills = Math.max(0, Math.floor(history.kills));
    const carrots = Math.max(0, Math.floor(history.carrots));
    const height = Math.max(0, Math.floor(history.maxHeightMeters));
    const playedAt = Math.max(0, Math.floor(history.playedAt));
    const isNewBestCarrotCount = history.completed && carrots > baseline.bestCarrotCount;
    return Object.freeze({
        save: Object.freeze({
            ...baseline,
            playCount: baseline.playCount + 1,
            bestCarrotCount: Math.max(baseline.bestCarrotCount, carrots),
            lastPlayedAt: playedAt,
            bestHeightMeters: Math.max(baseline.bestHeightMeters, height),
            bestKillCount: Math.max(baseline.bestKillCount, kills),
            totalShots: baseline.totalShots + shots,
            totalKills: baseline.totalKills + kills,
            totalCarrots: baseline.totalCarrots + carrots,
            activeRound: history.completed ? undefined : history.activeRound,
        }),
        isNewBestCarrotCount,
    });
}

export function writeDoodleJumpSave(
    storage: StorageService,
    save: DoodleJumpSaveState,
    flush: boolean,
): void {
    storage.writeGameData(DOODLE_JUMP_GAME_ID, toDoodleJumpGameSaveData(save));
    if (flush) storage.flush();
}

export function updateDoodleJumpSettings(
    save: DoodleJumpSaveState,
    settings: Readonly<{
        sensorInvert?: boolean;
        sensorSensitivity?: DoodleJumpSensorSensitivity;
        tutorialCompleted?: boolean;
        headStartCount?: number;
    }>,
): DoodleJumpSaveState {
    return Object.freeze({
        ...save,
        sensorInvert: settings.sensorInvert ?? save.sensorInvert,
        sensorSensitivity: settings.sensorSensitivity ?? save.sensorSensitivity,
        tutorialCompleted: settings.tutorialCompleted ?? save.tutorialCompleted,
        headStartCount: settings.headStartCount === undefined
            ? save.headStartCount
            : Math.max(0, Math.floor(settings.headStartCount)),
        settingsVersion: DOODLE_JUMP_SETTINGS_VERSION,
    });
}
