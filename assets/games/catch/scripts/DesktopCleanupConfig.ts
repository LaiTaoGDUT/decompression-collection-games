export interface DesktopCleanupGameplayConfig {
    readonly schemaVersion: 1;
    readonly timeLimitSeconds: number;
    readonly continueSeconds: number;
    readonly slotCapacity: number;
    readonly pointsPerTriple: number;
    readonly remainingSecondBonus: number;
    readonly unusedToolBonus: number;
    readonly noContinueBonus: number;
    readonly freeUsesPerTool: number;
    readonly shakeImpulse: number;
    readonly physicsDamping: number;
    readonly physicsAngularDamping: number;
    readonly physicsBounce: number;
}

export const DEFAULT_DESKTOP_CLEANUP_CONFIG: DesktopCleanupGameplayConfig = Object.freeze({
    schemaVersion: 1,
    timeLimitSeconds: 180,
    continueSeconds: 60,
    slotCapacity: 7,
    pointsPerTriple: 100,
    remainingSecondBonus: 10,
    unusedToolBonus: 200,
    noContinueBonus: 500,
    freeUsesPerTool: 1,
    shakeImpulse: 0.42,
    physicsDamping: 4.2,
    physicsAngularDamping: 5.4,
    physicsBounce: 0.32,
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

export function parseDesktopCleanupGameplayConfig(
    value: unknown,
): DesktopCleanupGameplayConfig {
    if (!isRecord(value) || value.schemaVersion !== 1) {
        return DEFAULT_DESKTOP_CLEANUP_CONFIG;
    }

    return Object.freeze({
        schemaVersion: 1,
        timeLimitSeconds: readPositiveInteger(value, 'timeLimitSeconds', 180, 900),
        continueSeconds: readPositiveInteger(value, 'continueSeconds', 60, 300),
        slotCapacity: readPositiveInteger(value, 'slotCapacity', 7, 12),
        pointsPerTriple: readPositiveInteger(value, 'pointsPerTriple', 100, 10000),
        remainingSecondBonus: readPositiveInteger(value, 'remainingSecondBonus', 10, 1000),
        unusedToolBonus: readPositiveInteger(value, 'unusedToolBonus', 200, 10000),
        noContinueBonus: readPositiveInteger(value, 'noContinueBonus', 500, 10000),
        freeUsesPerTool: readPositiveInteger(value, 'freeUsesPerTool', 1, 3),
        shakeImpulse: readPositiveNumber(value, 'shakeImpulse', 0.42, 3),
        physicsDamping: readPositiveNumber(value, 'physicsDamping', 4.2, 20),
        physicsAngularDamping: readPositiveNumber(value, 'physicsAngularDamping', 5.4, 20),
        physicsBounce: readPositiveNumber(value, 'physicsBounce', 0.32, 1),
    });
}
