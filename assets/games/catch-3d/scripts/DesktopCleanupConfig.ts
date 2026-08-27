import {
    DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION,
    parseDesktopCleanupThemeSelection,
    type DesktopCleanupThemeSelection,
} from './DesktopCleanupTheme';

export interface DesktopCleanupGameplayConfig {
    readonly schemaVersion: 2;
    /** random = 每次开始新局重新抽取主题；固定 ID 仅用于调试或定向活动。 */
    readonly themeId: DesktopCleanupThemeSelection;
    readonly timeLimitSeconds: number;
    readonly continueSeconds: number;
    readonly slotCapacity: number;
    readonly pointsPerTriple: number;
    readonly remainingSecondBonus: number;
    readonly unusedToolBonus: number;
    readonly noContinueBonus: number;
    readonly freeUsesPerTool: number;
    readonly spawnBatchSize: number;
    /** 3D 物品从桌板下方出生时的缩放与节奏。 */
    readonly spawnPopDurationSeconds: number;
    readonly spawnPopStaggerSeconds: number;
    readonly spawnPopStartScale: number;
    readonly spawnPopStartHeight: number;
    readonly spawnPopTargetHeight: number;
    readonly spawnBatchTimeoutSeconds: number;
    readonly settleLinearSpeed: number;
    readonly settleAngularSpeed: number;
    readonly settleHoldSeconds: number;
    readonly physicsFriction: number;
    readonly physicsBounce: number;
    readonly physicsLinearDamping: number;
    readonly physicsAngularDamping: number;
    readonly tossHorizontalImpulse: number;
    readonly tossVerticalImpulse: number;
    readonly recycleBelowY: number;
    readonly recycleMaxSpeed: number;
    readonly recycleHeight: number;
    readonly wakeLimitLow: number;
    readonly wakeLimitMedium: number;
    readonly wakeLimitHigh: number;
}

export const DEFAULT_DESKTOP_CLEANUP_CONFIG: DesktopCleanupGameplayConfig = Object.freeze({
    schemaVersion: 2,
    themeId: DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION,
    timeLimitSeconds: 180,
    continueSeconds: 60,
    slotCapacity: 7,
    pointsPerTriple: 100,
    remainingSecondBonus: 10,
    unusedToolBonus: 200,
    noContinueBonus: 500,
    freeUsesPerTool: 1,
    // Three dense waves keep the “从桌板下方冒出并放大”的开场连续而
    // 轻快；每件仍保留可见的成长时间，但不再像高空落物一样拖沓。
    spawnBatchSize: 54,
    spawnPopDurationSeconds: 0.14,
    spawnPopStaggerSeconds: 0.010,
    spawnPopStartScale: 0.18,
    spawnPopStartHeight: -0.34,
    spawnPopTargetHeight: 0.58,
    spawnBatchTimeoutSeconds: 0.42,
    settleLinearSpeed: 0.08,
    settleAngularSpeed: 0.16,
    settleHoldSeconds: 0.14,
    physicsFriction: 0.72,
    physicsBounce: 0.08,
    physicsLinearDamping: 0.22,
    physicsAngularDamping: 0.28,
    tossHorizontalImpulse: 1.45,
    tossVerticalImpulse: 1.65,
    recycleBelowY: -1.2,
    recycleMaxSpeed: 14,
    recycleHeight: 0.78,
    wakeLimitLow: 32,
    wakeLimitMedium: 64,
    wakeLimitHigh: 96,
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPositiveInteger(
    source: Record<string, unknown>,
    key: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
): number {
    const value = source[key];
    if (typeof value !== 'number'
        || !Number.isFinite(value)
        || !Number.isInteger(value)
        || value <= 0
        || value > maximum) {
        return fallback;
    }
    return value;
}

function readPositiveNumber(
    source: Record<string, unknown>,
    key: string,
    fallback: number,
    maximum = Number.MAX_VALUE,
): number {
    const value = source[key];
    if (typeof value !== 'number'
        || !Number.isFinite(value)
        || value <= 0
        || value > maximum) {
        return fallback;
    }
    return value;
}

function readFiniteNumber(
    source: Record<string, unknown>,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    const value = source[key];
    if (typeof value !== 'number'
        || !Number.isFinite(value)
        || value < minimum
        || value > maximum) {
        return fallback;
    }
    return value;
}

export function parseDesktopCleanupGameplayConfig(
    value: unknown,
): DesktopCleanupGameplayConfig {
    if (!isRecord(value)
        || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
        return DEFAULT_DESKTOP_CLEANUP_CONFIG;
    }

    const isV2 = value.schemaVersion === 2;
    const defaults = DEFAULT_DESKTOP_CLEANUP_CONFIG;
    const spawnPopDurationSeconds = isV2
        ? readPositiveNumber(value, 'spawnPopDurationSeconds', defaults.spawnPopDurationSeconds, 2)
        : defaults.spawnPopDurationSeconds;
    const spawnPopStaggerSeconds = isV2
        ? readFiniteNumber(value, 'spawnPopStaggerSeconds', defaults.spawnPopStaggerSeconds, 0, 0.5)
        : defaults.spawnPopStaggerSeconds;
    const spawnPopStartScale = isV2
        ? readFiniteNumber(value, 'spawnPopStartScale', defaults.spawnPopStartScale, 0.04, 1)
        : defaults.spawnPopStartScale;
    const spawnPopStartHeight = isV2
        ? readFiniteNumber(value, 'spawnPopStartHeight', defaults.spawnPopStartHeight, -8, -0.01)
        : defaults.spawnPopStartHeight;
    const spawnPopTargetHeight = isV2
        ? readPositiveNumber(value, 'spawnPopTargetHeight', defaults.spawnPopTargetHeight, 4)
        : defaults.spawnPopTargetHeight;
    const wakeLimitLow = isV2
        ? readPositiveInteger(value, 'wakeLimitLow', defaults.wakeLimitLow, 162)
        : defaults.wakeLimitLow;
    const wakeLimitMedium = isV2
        ? Math.max(
            wakeLimitLow,
            readPositiveInteger(value, 'wakeLimitMedium', defaults.wakeLimitMedium, 162),
        )
        : defaults.wakeLimitMedium;
    const wakeLimitHigh = isV2
        ? Math.max(
            wakeLimitMedium,
            readPositiveInteger(value, 'wakeLimitHigh', defaults.wakeLimitHigh, 162),
        )
        : defaults.wakeLimitHigh;

    return Object.freeze({
        schemaVersion: 2,
        themeId: parseDesktopCleanupThemeSelection(value.themeId),
        timeLimitSeconds: readPositiveInteger(value, 'timeLimitSeconds', defaults.timeLimitSeconds, 900),
        continueSeconds: readPositiveInteger(value, 'continueSeconds', defaults.continueSeconds, 300),
        slotCapacity: readPositiveInteger(value, 'slotCapacity', defaults.slotCapacity, 12),
        pointsPerTriple: readPositiveInteger(value, 'pointsPerTriple', defaults.pointsPerTriple, 10000),
        remainingSecondBonus: readPositiveInteger(value, 'remainingSecondBonus', defaults.remainingSecondBonus, 1000),
        unusedToolBonus: readPositiveInteger(value, 'unusedToolBonus', defaults.unusedToolBonus, 10000),
        noContinueBonus: readPositiveInteger(value, 'noContinueBonus', defaults.noContinueBonus, 10000),
        freeUsesPerTool: readPositiveInteger(value, 'freeUsesPerTool', defaults.freeUsesPerTool, 3),
        spawnBatchSize: isV2
            ? readPositiveInteger(value, 'spawnBatchSize', defaults.spawnBatchSize, 162)
            : defaults.spawnBatchSize,
        spawnPopDurationSeconds,
        spawnPopStaggerSeconds,
        spawnPopStartScale,
        spawnPopStartHeight,
        spawnPopTargetHeight,
        spawnBatchTimeoutSeconds: isV2
            ? readPositiveNumber(value, 'spawnBatchTimeoutSeconds', defaults.spawnBatchTimeoutSeconds, 8)
            : defaults.spawnBatchTimeoutSeconds,
        settleLinearSpeed: isV2
            ? readPositiveNumber(value, 'settleLinearSpeed', defaults.settleLinearSpeed, 2)
            : defaults.settleLinearSpeed,
        settleAngularSpeed: isV2
            ? readPositiveNumber(value, 'settleAngularSpeed', defaults.settleAngularSpeed, 4)
            : defaults.settleAngularSpeed,
        settleHoldSeconds: isV2
            ? readPositiveNumber(value, 'settleHoldSeconds', defaults.settleHoldSeconds, 2)
            : defaults.settleHoldSeconds,
        physicsFriction: isV2
            ? readFiniteNumber(value, 'physicsFriction', defaults.physicsFriction, 0, 1)
            : defaults.physicsFriction,
        physicsBounce: isV2
            ? readFiniteNumber(value, 'physicsBounce', defaults.physicsBounce, 0, 1)
            : defaults.physicsBounce,
        physicsLinearDamping: isV2
            ? readFiniteNumber(value, 'physicsLinearDamping', defaults.physicsLinearDamping, 0, 1)
            : defaults.physicsLinearDamping,
        physicsAngularDamping: isV2
            ? readFiniteNumber(value, 'physicsAngularDamping', defaults.physicsAngularDamping, 0, 1)
            : defaults.physicsAngularDamping,
        tossHorizontalImpulse: isV2
            ? readPositiveNumber(value, 'tossHorizontalImpulse', defaults.tossHorizontalImpulse, 10)
            : defaults.tossHorizontalImpulse,
        tossVerticalImpulse: isV2
            ? readPositiveNumber(value, 'tossVerticalImpulse', defaults.tossVerticalImpulse, 12)
            : defaults.tossVerticalImpulse,
        recycleBelowY: isV2
            ? readFiniteNumber(value, 'recycleBelowY', defaults.recycleBelowY, -20, 0)
            : defaults.recycleBelowY,
        recycleMaxSpeed: isV2
            ? readPositiveNumber(value, 'recycleMaxSpeed', defaults.recycleMaxSpeed, 40)
            : defaults.recycleMaxSpeed,
        recycleHeight: isV2
            ? readPositiveNumber(value, 'recycleHeight', defaults.recycleHeight, 16)
            : defaults.recycleHeight,
        wakeLimitLow,
        wakeLimitMedium,
        wakeLimitHigh,
    });
}
