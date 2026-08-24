export interface FruitPhysicsConfig {
    readonly radius: number;
    readonly mass: number;
    readonly friction: number;
    readonly restitution: number;
}

export interface WatermelonGameplayConfig {
    readonly schemaVersion: 1;
    readonly initialSpawnWeights: readonly number[];
    readonly dropCooldownSeconds: number;
    readonly dropEdgePadding: number;
    readonly dangerStableSpeedSquared: number;
    readonly dangerOverflowSeconds: number;
    readonly continueSettleSeconds: number;
    readonly gravityScale: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly wallFriction: number;
    readonly wallRestitution: number;
    readonly mergeScores: readonly number[];
    readonly fruits: readonly FruitPhysicsConfig[];
}

export interface GameplayConfigValidationResult {
    readonly valid: boolean;
    readonly config?: WatermelonGameplayConfig;
    readonly errors: readonly string[];
}

const EXPECTED_FRUIT_COUNT = 11;
const EXPECTED_INITIAL_COUNT = 5;

export const DEFAULT_WATERMELON_GAMEPLAY_CONFIG: WatermelonGameplayConfig = deepFreeze({
    schemaVersion: 1,
    initialSpawnWeights: [30, 25, 20, 15, 10],
    dropCooldownSeconds: 0.45,
    dropEdgePadding: 2,
    dangerStableSpeedSquared: 0.25,
    dangerOverflowSeconds: 3.5,
    continueSettleSeconds: 0.6,
    gravityScale: 2.35,
    linearDamping: 0.75,
    angularDamping: 1,
    wallFriction: 0.42,
    wallRestitution: 0.02,
    mergeScores: [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66],
    // Mass now grows faster than circular area, making higher-level cats
    // progressively denser so they can dislodge smaller cats beneath them.
    fruits: [
        { radius: 26.88, mass: 1, friction: 0.32, restitution: 0.08 },
        { radius: 33.6, mass: 1.8, friction: 0.32, restitution: 0.08 },
        { radius: 42.56, mass: 3, friction: 0.32, restitution: 0.08 },
        { radius: 51.52, mass: 4.9, friction: 0.32, restitution: 0.08 },
        { radius: 62.72, mass: 7.7, friction: 0.32, restitution: 0.08 },
        { radius: 76.16, mass: 11.8, friction: 0.32, restitution: 0.08 },
        { radius: 91.84, mass: 18, friction: 0.32, restitution: 0.08 },
        { radius: 109.76, mass: 27.6, friction: 0.32, restitution: 0.08 },
        { radius: 129.92, mass: 41.2, friction: 0.32, restitution: 0.08 },
        { radius: 152.32, mass: 62.4, friction: 0.32, restitution: 0.08 },
        { radius: 176.96, mass: 92.4, friction: 0.32, restitution: 0.08 },
    ],
});

type UnknownRecord = Readonly<Record<string, unknown>>;

function deepFreeze<T>(value: T): T {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
        return value;
    }

    Object.keys(value as Record<string, unknown>).forEach((key) => {
        deepFreeze((value as Record<string, unknown>)[key]);
    });
    return Object.freeze(value);
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(
    source: UnknownRecord,
    key: string,
    errors: string[],
    options: { min: number; max: number; allowZero?: boolean },
): number | undefined {
    const value = source[key];
    const lowerValid = options.allowZero ? value as number >= options.min : value as number > options.min;

    if (typeof value !== 'number'
        || !Number.isFinite(value)
        || !lowerValid
        || value > options.max) {
        errors.push(`${key} must be a finite number in the supported range.`);
        return undefined;
    }

    return value;
}

function readNumberArray(
    source: UnknownRecord,
    key: string,
    expectedLength: number,
    errors: string[],
    allowZero = false,
): readonly number[] | undefined {
    const value = source[key];

    if (!Array.isArray(value) || value.length !== expectedLength) {
        errors.push(`${key} must contain exactly ${expectedLength} numbers.`);
        return undefined;
    }

    const numbers = value.map((item, index) => {
        if (typeof item !== 'number'
            || !Number.isFinite(item)
            || (allowZero ? item < 0 : item <= 0)) {
            errors.push(`${key}[${index}] must be ${allowZero ? 'non-negative' : 'positive'}.`);
            return 0;
        }
        return item;
    });

    return numbers;
}

export function validateWatermelonGameplayConfig(
    value: unknown,
): GameplayConfigValidationResult {
    const errors: string[] = [];

    if (!isRecord(value)) {
        return Object.freeze({ valid: false, errors: Object.freeze(['config must be an object.']) });
    }

    if (value.schemaVersion !== 1) {
        errors.push('schemaVersion must equal 1.');
    }

    const initialSpawnWeights = readNumberArray(
        value,
        'initialSpawnWeights',
        EXPECTED_INITIAL_COUNT,
        errors,
        true,
    );
    if (initialSpawnWeights && initialSpawnWeights.every((weight) => weight === 0)) {
        errors.push('initialSpawnWeights must contain at least one positive weight.');
    }

    const mergeScores = readNumberArray(
        value,
        'mergeScores',
        EXPECTED_FRUIT_COUNT,
        errors,
    );
    const fruitValues = value.fruits;
    const fruits: FruitPhysicsConfig[] = [];

    if (!Array.isArray(fruitValues) || fruitValues.length !== EXPECTED_FRUIT_COUNT) {
        errors.push(`fruits must contain exactly ${EXPECTED_FRUIT_COUNT} entries.`);
    } else {
        fruitValues.forEach((fruit, level) => {
            if (!isRecord(fruit)) {
                errors.push(`fruits[${level}] must be an object.`);
                return;
            }

            const localErrors: string[] = [];
            const radius = readNumber(fruit, 'radius', localErrors, { min: 8, max: 220 });
            const mass = readNumber(fruit, 'mass', localErrors, { min: 0, max: 100 });
            const friction = readNumber(fruit, 'friction', localErrors, {
                min: 0,
                max: 1,
                allowZero: true,
            });
            const restitution = readNumber(fruit, 'restitution', localErrors, {
                min: 0,
                max: 1,
                allowZero: true,
            });
            errors.push(...localErrors.map((error) => `fruits[${level}].${error}`));

            if ([radius, mass, friction, restitution].every((item) => item !== undefined)) {
                fruits.push({ radius: radius!, mass: mass!, friction: friction!, restitution: restitution! });
            }
        });
    }

    const configValues = {
        dropCooldownSeconds: readNumber(value, 'dropCooldownSeconds', errors, { min: 0, max: 2 }),
        dropEdgePadding: readNumber(value, 'dropEdgePadding', errors, { min: 0, max: 40, allowZero: true }),
        dangerStableSpeedSquared: readNumber(value, 'dangerStableSpeedSquared', errors, { min: 0, max: 9 }),
        dangerOverflowSeconds: readNumber(value, 'dangerOverflowSeconds', errors, { min: 0, max: 10 }),
        continueSettleSeconds: readNumber(value, 'continueSettleSeconds', errors, { min: 0, max: 3 }),
        gravityScale: readNumber(value, 'gravityScale', errors, { min: 0, max: 4 }),
        linearDamping: readNumber(value, 'linearDamping', errors, { min: 0, max: 5, allowZero: true }),
        angularDamping: readNumber(value, 'angularDamping', errors, { min: 0, max: 5, allowZero: true }),
        wallFriction: readNumber(value, 'wallFriction', errors, { min: 0, max: 1, allowZero: true }),
        wallRestitution: readNumber(value, 'wallRestitution', errors, { min: 0, max: 1, allowZero: true }),
    };

    if (errors.length > 0
        || !initialSpawnWeights
        || !mergeScores
        || fruits.length !== EXPECTED_FRUIT_COUNT
        || Object.keys(configValues).some((key) => (
            configValues[key as keyof typeof configValues] === undefined
        ))) {
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }

    return Object.freeze({
        valid: true,
        config: deepFreeze({
            schemaVersion: 1 as const,
            initialSpawnWeights: [...initialSpawnWeights],
            dropCooldownSeconds: configValues.dropCooldownSeconds!,
            dropEdgePadding: configValues.dropEdgePadding!,
            dangerStableSpeedSquared: configValues.dangerStableSpeedSquared!,
            dangerOverflowSeconds: configValues.dangerOverflowSeconds!,
            continueSettleSeconds: configValues.continueSettleSeconds!,
            gravityScale: configValues.gravityScale!,
            linearDamping: configValues.linearDamping!,
            angularDamping: configValues.angularDamping!,
            wallFriction: configValues.wallFriction!,
            wallRestitution: configValues.wallRestitution!,
            mergeScores: [...mergeScores],
            fruits,
        }),
        errors: Object.freeze([] as string[]),
    });
}

export function requireWatermelonGameplayConfig(value: unknown): WatermelonGameplayConfig {
    const result = validateWatermelonGameplayConfig(value);

    if (!result.valid || !result.config) {
        throw new Error(`Invalid watermelon gameplay config: ${result.errors.join(' ')}`);
    }

    return result.config;
}

export function chooseWeightedInitialLevel(
    randomValue: number,
    weights: readonly number[],
): number {
    const safeRandom = Number.isFinite(randomValue)
        ? Math.max(0, Math.min(0.999999999, randomValue))
        : 0;
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

    if (weights.length !== EXPECTED_INITIAL_COUNT || total <= 0) {
        return 0;
    }

    let cursor = safeRandom * total;
    for (let level = 0; level < weights.length; level += 1) {
        cursor -= Math.max(0, weights[level]);
        if (cursor < 0) {
            return level;
        }
    }

    return weights.length - 1;
}
