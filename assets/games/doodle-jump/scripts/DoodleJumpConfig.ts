export const DOODLE_JUMP_BUNDLE = 'game-doodle-jump';
export const DOODLE_JUMP_GAME_ID = 'doodle-jump';

export type DoodleJumpPlatformType =
    | 'normal'
    | 'moving'
    | 'vertical-moving'
    | 'breakable'
    | 'disappearing'
    | 'shifting'
    | 'exploding'
    | 'spiked';

export type DoodleJumpEnemyType = 'small' | 'large' | 'hover';
export type DoodleJumpHazardType = 'ufo' | 'black-hole' | 'bear-trap';
export type DoodleJumpItemType =
    | 'spring'
    | 'trampoline'
    | 'jetpack'
    | 'propeller-hat'
    | 'rocket'
    | 'shield';
export type DoodleJumpPowerPreset = DoodleJumpItemType | 'head-start' | 'none';

export interface DoodleJumpItemWeightBand {
    readonly startMeters: number;
    readonly endMeters: number;
    readonly spring: number;
    readonly trampoline: number;
    readonly jetpack: number;
    readonly propellerHat: number;
    readonly rocket: number;
    readonly shield: number;
}

export interface DoodleJumpEnemyTypeConfig {
    readonly health: number;
    readonly width: number;
    readonly height: number;
    readonly unlockHeightMeters: number;
    readonly horizontalRange: number;
    readonly verticalRange: number;
    readonly anchorHeight: number;
    readonly cycleSeconds: number;
    readonly headZoneHeight: number;
    readonly killScore: number;
}

export interface DoodleJumpVisualQualityProfile {
    readonly decorNodeCount: number;
    readonly secondaryEffects: boolean;
    readonly effectScale: number;
    readonly uiMotion: boolean;
    readonly dynamicAtlasCount: number;
    readonly dynamicAtlasMaxFrameSize: number;
}

export interface DoodleJumpFixedPlatformConfig {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly type: DoodleJumpPlatformType;
}

export interface DoodleJumpGameplayConfig {
    readonly schemaVersion: number;
    readonly design: Readonly<{
        width: number;
        height: number;
    }>;
    readonly fixedStep: Readonly<{
        seconds: number;
        maxSubSteps: number;
    }>;
    readonly player: Readonly<{
        gravity: number;
        bounceVelocity: number;
        horizontalAcceleration: number;
        horizontalDeceleration: number;
        maxHorizontalSpeed: number;
        collisionWidth: number;
        collisionHeight: number;
        wrapLeft: number;
        wrapRight: number;
        wrapDistance: number;
    }>;
    readonly sensor: Readonly<{
        minimumSamples: number;
        calibrationWindowMs: number;
        timeoutMs: number;
        staleTimeoutMs: number;
        deadZone: number;
        fullTilt: number;
        smoothingSeconds: number;
    }>;
    readonly camera: Readonly<{
        targetHeightRatio: number;
        preGenerateJumpHeights: number;
        recycleBelow: number;
        floatingOriginThreshold: number;
    }>;
    readonly shooting: Readonly<{
        cooldownMs: number;
        speed: number;
        lifetimeSeconds: number;
        nearAimFallbackDistance: number;
        poolSoftTarget: number;
    }>;
    readonly platformBehavior: Readonly<{
        explodingDelaySeconds: number;
        verticalMoving: Readonly<{
            unlockHeightMeters: number;
            spawnChanceAtUnlock: number;
            spawnChanceAtCap: number;
            chanceCapHeightMeters: number;
            minimumAmplitude: number;
            maximumAmplitude: number;
            minimumPeriodSeconds: number;
            maximumPeriodSeconds: number;
        }>;
        spiked: Readonly<{
            unlockHeightMeters: number;
            spawnChance: number;
            collisionDepth: number;
        }>;
    }>;
    readonly visualQuality: Readonly<Record<
        'low' | 'medium' | 'high',
        DoodleJumpVisualQualityProfile
    >>;
    readonly enemies: Readonly<{
        enabled: boolean;
        spawnChanceAtUnlock: number;
        spawnChancePerPlatform: number;
        difficultyCapHeightMeters: number;
        maximumActive: number;
        twoActiveHeightMeters: number;
        threeActiveHeightMeters: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        minimumVerticalSeparationAtUnlock: number;
        minimumVerticalSeparation: number;
        hitFlashSeconds: number;
        stompBonus: number;
        small: DoodleJumpEnemyTypeConfig;
        large: DoodleJumpEnemyTypeConfig;
        hover: DoodleJumpEnemyTypeConfig;
    }>;
    readonly hazards: Readonly<{
        enabled: boolean;
        typeOverride: DoodleJumpHazardType | 'auto';
        spawnChanceAtUnlock: number;
        spawnChancePerPlatform: number;
        difficultyCapHeightMeters: number;
        maximumActive: number;
        twoActiveHeightMeters: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        minimumVerticalSeparationAtUnlock: number;
        minimumVerticalSeparation: number;
        ufo: Readonly<{
            unlockHeightMeters: number;
            maximumActive: number;
            width: number;
            height: number;
            beamWidth: number;
            beamLength: number;
            horizontalSpeed: number;
            lockSeconds: number;
            pullAcceleration: number;
            abductionSeconds: number;
            leaveResetSeconds: number;
            hitPauseSeconds: number;
            interruptScore: number;
            spawnMinimumAbovePlayer: number;
            spawnMaximumAbovePlayer: number;
        }>;
        blackHole: Readonly<{
            unlockHeightMeters: number;
            maximumActive: number;
            outerRadius: number;
            coreRadius: number;
            maximumPullAcceleration: number;
        }>;
        bearTrap: Readonly<{
            unlockHeightMeters: number;
            maximumActive: number;
            width: number;
            height: number;
            minimumRemainingLandingWidth: number;
        }>;
    }>;
    readonly items: Readonly<{
        enabled: boolean;
        typeOverride: DoodleJumpItemType | 'auto';
        debugPowerPreset: DoodleJumpPowerPreset;
        debugHeadStartCount: number;
        spawnChancePerPlatform: number;
        maximumActive: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        minimumVerticalSeparation: number;
        pickupRadius: number;
        minimumAbovePlatform: number;
        maximumAbovePlatform: number;
        spring: Readonly<{ unlockHeightMeters: number; bounceVelocity: number }>;
        trampoline: Readonly<{ unlockHeightMeters: number; bounceVelocity: number }>;
        jetpack: Readonly<{
            unlockHeightMeters: number;
            durationSeconds: number;
            verticalVelocity: number;
        }>;
        propellerHat: Readonly<{
            unlockHeightMeters: number;
            durationSeconds: number;
            gravity: number;
            minimumVerticalVelocity: number;
        }>;
        rocket: Readonly<{
            unlockHeightMeters: number;
            durationSeconds: number;
            verticalVelocity: number;
        }>;
        shield: Readonly<{ unlockHeightMeters: number; durationSeconds: number }>;
        headStart: Readonly<{ durationSeconds: number; verticalVelocity: number }>;
        weightBands: readonly DoodleJumpItemWeightBand[];
    }>;
    readonly resurrection: Readonly<{
        placement: string;
        maximumSuccessfulRevives: number;
        shieldSeconds: number;
        launchVelocity: number;
        safeHorizontalRadius: number;
        forceGeneratedSafePlatform: boolean;
        debugRewardedOutcome: 'auto' | 'completed' | 'skipped' | 'failed';
    }>;
    readonly generation: Readonly<{
        enabled: boolean;
        singleStep: boolean;
        showRouteDebug: boolean;
        exportFailureDebug: boolean;
        forceDegradedFallback: boolean;
        seedOverride: number;
        platformTypeOverride: DoodleJumpPlatformType | 'auto';
        verticalStep: number;
        mainRouteStepCount: number;
        maxInsertedPlatforms: number;
        recoveryLayerInterval: number;
        maxHorizontalGap: number;
        preloadAboveScreen: number;
        normalFallbackWidth: number;
        maxCandidateAttempts: number;
        maxActivePlatforms: number;
    }>;
    readonly fixedPlatforms: readonly DoodleJumpFixedPlatformConfig[];
}

const PLATFORM_TYPES: readonly DoodleJumpPlatformType[] = Object.freeze([
    'normal',
    'moving',
    'vertical-moving',
    'breakable',
    'disappearing',
    'shifting',
    'exploding',
    'spiked',
]);

const ITEM_TYPES: readonly DoodleJumpItemType[] = Object.freeze([
    'spring',
    'trampoline',
    'jetpack',
    'propeller-hat',
    'rocket',
    'shield',
]);

function asRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} must be an object.`);
    }
    return value as Readonly<Record<string, unknown>>;
}

function positiveNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${path} must be a finite number greater than zero.`);
    }
    return value;
}

function finiteNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${path} must be a finite number.`);
    }
    return value;
}

function booleanValue(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
    return value;
}

function positiveInteger(value: unknown, path: string): number {
    const parsed = positiveNumber(value, path);
    if (!Number.isInteger(parsed)) {
        throw new Error(`${path} must be an integer.`);
    }
    return parsed;
}

function nonNegativeInteger(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`${path} must be a non-negative integer.`);
    }
    return value;
}

function nonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${path} must be a non-empty string.`);
    }
    return value.trim();
}

function ratio(value: unknown, path: string): number {
    const parsed = finiteNumber(value, path);
    if (parsed <= 0 || parsed >= 1) {
        throw new Error(`${path} must be between zero and one.`);
    }
    return parsed;
}

function unitRatio(value: unknown, path: string): number {
    const parsed = finiteNumber(value, path);
    if (parsed < 0 || parsed > 1) {
        throw new Error(`${path} must be between zero and one inclusive.`);
    }
    return parsed;
}

function parseEnemyTypeConfig(value: unknown, path: string): DoodleJumpEnemyTypeConfig {
    const record = asRecord(value, path);
    return Object.freeze({
        health: positiveInteger(record.health, `${path}.health`),
        width: positiveNumber(record.width, `${path}.width`),
        height: positiveNumber(record.height, `${path}.height`),
        unlockHeightMeters: nonNegativeInteger(
            record.unlockHeightMeters,
            `${path}.unlockHeightMeters`,
        ),
        horizontalRange: positiveNumber(record.horizontalRange, `${path}.horizontalRange`),
        verticalRange: finiteNumber(record.verticalRange, `${path}.verticalRange`),
        anchorHeight: finiteNumber(record.anchorHeight, `${path}.anchorHeight`),
        cycleSeconds: positiveNumber(record.cycleSeconds, `${path}.cycleSeconds`),
        headZoneHeight: positiveNumber(record.headZoneHeight, `${path}.headZoneHeight`),
        killScore: positiveInteger(record.killScore, `${path}.killScore`),
    });
}

function parseVisualQualityProfile(
    value: Readonly<Record<string, unknown>>,
    path: string,
): DoodleJumpVisualQualityProfile {
    const decorNodeCount = positiveInteger(value.decorNodeCount, `${path}.decorNodeCount`);
    if (decorNodeCount > 8) {
        throw new Error(`${path}.decorNodeCount must not exceed 8.`);
    }
    const effectScale = positiveNumber(value.effectScale, `${path}.effectScale`);
    if (effectScale < 0.5 || effectScale > 1.25) {
        throw new Error(`${path}.effectScale must satisfy 0.5 <= scale <= 1.25.`);
    }
    const dynamicAtlasCount = positiveInteger(
        value.dynamicAtlasCount,
        `${path}.dynamicAtlasCount`,
    );
    const dynamicAtlasMaxFrameSize = positiveInteger(
        value.dynamicAtlasMaxFrameSize,
        `${path}.dynamicAtlasMaxFrameSize`,
    );
    if (dynamicAtlasCount > 4 || dynamicAtlasMaxFrameSize > 512) {
        throw new Error(`${path} dynamic atlas budget exceeds the stage 10 limit.`);
    }
    return Object.freeze({
        decorNodeCount,
        secondaryEffects: booleanValue(value.secondaryEffects, `${path}.secondaryEffects`),
        effectScale,
        uiMotion: booleanValue(value.uiMotion, `${path}.uiMotion`),
        dynamicAtlasCount,
        dynamicAtlasMaxFrameSize,
    });
}

function parseItemWeightBand(value: unknown, index: number): DoodleJumpItemWeightBand {
    const path = `items.weightBands[${index}]`;
    const record = asRecord(value, path);
    const readWeight = (key: string): number => {
        const weight = finiteNumber(record[key], `${path}.${key}`);
        if (weight < 0) throw new Error(`${path}.${key} must be non-negative.`);
        return weight;
    };
    const startMeters = nonNegativeInteger(record.startMeters, `${path}.startMeters`);
    const endMeters = positiveInteger(record.endMeters, `${path}.endMeters`);
    if (endMeters <= startMeters) throw new Error(`${path} must have endMeters > startMeters.`);
    const band = Object.freeze({
        startMeters,
        endMeters,
        spring: readWeight('spring'),
        trampoline: readWeight('trampoline'),
        jetpack: readWeight('jetpack'),
        propellerHat: readWeight('propellerHat'),
        rocket: readWeight('rocket'),
        shield: readWeight('shield'),
    });
    const total = band.spring + band.trampoline + band.jetpack
        + band.propellerHat + band.rocket + band.shield;
    if (total <= 0) throw new Error(`${path} must contain at least one positive weight.`);
    return band;
}

function parsePlatform(value: unknown, index: number): DoodleJumpFixedPlatformConfig {
    const path = `fixedPlatforms[${index}]`;
    const record = asRecord(value, path);
    const type = nonEmptyString(record.type, `${path}.type`) as DoodleJumpPlatformType;
    if (PLATFORM_TYPES.indexOf(type) < 0) {
        throw new Error(`${path}.type is unsupported: ${type}.`);
    }
    return Object.freeze({
        id: nonEmptyString(record.id, `${path}.id`),
        x: finiteNumber(record.x, `${path}.x`),
        y: finiteNumber(record.y, `${path}.y`),
        width: positiveNumber(record.width, `${path}.width`),
        type,
    });
}

export function parseDoodleJumpGameplayConfig(value: unknown): DoodleJumpGameplayConfig {
    const root = asRecord(value, 'gameplay');
    const design = asRecord(root.design, 'design');
    const fixedStep = asRecord(root.fixedStep, 'fixedStep');
    const player = asRecord(root.player, 'player');
    const sensor = asRecord(root.sensor, 'sensor');
    const camera = asRecord(root.camera, 'camera');
    const shooting = asRecord(root.shooting, 'shooting');
    const platformBehavior = asRecord(root.platformBehavior, 'platformBehavior');
    const verticalMoving = asRecord(
        platformBehavior.verticalMoving,
        'platformBehavior.verticalMoving',
    );
    const spiked = asRecord(platformBehavior.spiked, 'platformBehavior.spiked');
    const visualQuality = asRecord(root.visualQuality, 'visualQuality');
    const lowVisualQuality = asRecord(visualQuality.low, 'visualQuality.low');
    const mediumVisualQuality = asRecord(visualQuality.medium, 'visualQuality.medium');
    const highVisualQuality = asRecord(visualQuality.high, 'visualQuality.high');
    const enemies = asRecord(root.enemies, 'enemies');
    const hazards = asRecord(root.hazards, 'hazards');
    const ufo = asRecord(hazards.ufo, 'hazards.ufo');
    const blackHole = asRecord(hazards.blackHole, 'hazards.blackHole');
    const bearTrap = asRecord(hazards.bearTrap, 'hazards.bearTrap');
    const items = asRecord(root.items, 'items');
    const spring = asRecord(items.spring, 'items.spring');
    const trampoline = asRecord(items.trampoline, 'items.trampoline');
    const jetpack = asRecord(items.jetpack, 'items.jetpack');
    const propellerHat = asRecord(items.propellerHat, 'items.propellerHat');
    const rocket = asRecord(items.rocket, 'items.rocket');
    const shield = asRecord(items.shield, 'items.shield');
    const headStart = asRecord(items.headStart, 'items.headStart');
    const resurrection = asRecord(root.resurrection, 'resurrection');
    const generation = asRecord(root.generation, 'generation');
    if (!Array.isArray(root.fixedPlatforms) || root.fixedPlatforms.length !== 8) {
        throw new Error('fixedPlatforms must contain exactly P0-P7.');
    }
    const platforms = root.fixedPlatforms.map(parsePlatform);
    const ids = new Set<string>();
    platforms.forEach((platform) => {
        if (ids.has(platform.id)) throw new Error(`Duplicate platform id: ${platform.id}.`);
        ids.add(platform.id);
    });
    const schemaVersion = positiveInteger(root.schemaVersion, 'schemaVersion');
    if (schemaVersion !== 1) throw new Error(`Unsupported gameplay schemaVersion ${schemaVersion}.`);
    const wrapLeft = finiteNumber(player.wrapLeft, 'player.wrapLeft');
    const wrapRight = finiteNumber(player.wrapRight, 'player.wrapRight');
    const wrapDistance = positiveNumber(player.wrapDistance, 'player.wrapDistance');
    const gravity = finiteNumber(player.gravity, 'player.gravity');
    const bounceVelocity = positiveNumber(player.bounceVelocity, 'player.bounceVelocity');
    const launchVelocity = positiveNumber(
        resurrection.launchVelocity,
        'resurrection.launchVelocity',
    );
    if (Math.abs((wrapRight - wrapLeft) - wrapDistance) > 0.001) {
        throw new Error('player.wrapDistance must match wrapRight - wrapLeft.');
    }
    const verticalStep = positiveNumber(
        generation.verticalStep,
        'generation.verticalStep',
    );
    const mainRouteStepCount = positiveInteger(
        generation.mainRouteStepCount,
        'generation.mainRouteStepCount',
    );
    const maxInsertedPlatforms = nonNegativeInteger(
        generation.maxInsertedPlatforms,
        'generation.maxInsertedPlatforms',
    );
    const recoveryLayerInterval = positiveInteger(
        generation.recoveryLayerInterval,
        'generation.recoveryLayerInterval',
    );
    const maxHorizontalGap = positiveNumber(
        generation.maxHorizontalGap,
        'generation.maxHorizontalGap',
    );
    if (verticalStep < 42 || verticalStep > 90) {
        throw new Error('generation.verticalStep must satisfy 42 <= verticalStep <= 90.');
    }
    if (mainRouteStepCount < 2 || mainRouteStepCount > 6) {
        throw new Error('generation.mainRouteStepCount must satisfy 2 <= count <= 6.');
    }
    if (gravity >= 0) {
        throw new Error('player.gravity must be negative.');
    }
    const mainRouteGap = verticalStep * mainRouteStepCount;
    const theoreticalJumpHeight = bounceVelocity * bounceVelocity / (-2 * gravity);
    if (theoreticalJumpHeight < mainRouteGap + 10
        || theoreticalJumpHeight > mainRouteGap + 80) {
        throw new Error(
            'player.bounceVelocity must produce a jump peak 10-80 units above the fixed main-route gap.',
        );
    }
    if (Math.abs(launchVelocity - bounceVelocity) > 0.001) {
        throw new Error('resurrection.launchVelocity must match player.bounceVelocity.');
    }
    if (maxInsertedPlatforms > 3
        || maxInsertedPlatforms >= mainRouteStepCount) {
        throw new Error(
            'generation.maxInsertedPlatforms must not exceed 3 or the available intermediate steps.',
        );
    }
    if (recoveryLayerInterval < 4 || recoveryLayerInterval > 30) {
        throw new Error('generation.recoveryLayerInterval must satisfy 4 <= interval <= 30.');
    }
    if (maxHorizontalGap > 240) {
        throw new Error('generation.maxHorizontalGap must not exceed 240.');
    }
    const maxCandidateAttempts = positiveInteger(
        generation.maxCandidateAttempts,
        'generation.maxCandidateAttempts',
    );
    const maxActivePlatforms = positiveInteger(
        generation.maxActivePlatforms,
        'generation.maxActivePlatforms',
    );
    if (maxCandidateAttempts > 24) {
        throw new Error('generation.maxCandidateAttempts must not exceed 24.');
    }
    if (maxActivePlatforms < 8) {
        throw new Error('generation.maxActivePlatforms must keep at least the fixed P0-P7 set.');
    }
    const platformTypeOverride = nonEmptyString(
        generation.platformTypeOverride,
        'generation.platformTypeOverride',
    ) as DoodleJumpPlatformType | 'auto';
    if (platformTypeOverride !== 'auto'
        && PLATFORM_TYPES.indexOf(platformTypeOverride) < 0) {
        throw new Error(`Unsupported generation.platformTypeOverride: ${platformTypeOverride}.`);
    }
    const verticalMovingUnlock = nonNegativeInteger(
        verticalMoving.unlockHeightMeters,
        'platformBehavior.verticalMoving.unlockHeightMeters',
    );
    const verticalMovingChanceAtUnlock = unitRatio(
        verticalMoving.spawnChanceAtUnlock,
        'platformBehavior.verticalMoving.spawnChanceAtUnlock',
    );
    const verticalMovingChanceAtCap = unitRatio(
        verticalMoving.spawnChanceAtCap,
        'platformBehavior.verticalMoving.spawnChanceAtCap',
    );
    const verticalMovingChanceCapHeight = positiveNumber(
        verticalMoving.chanceCapHeightMeters,
        'platformBehavior.verticalMoving.chanceCapHeightMeters',
    );
    const verticalMovingMinimumAmplitude = positiveNumber(
        verticalMoving.minimumAmplitude,
        'platformBehavior.verticalMoving.minimumAmplitude',
    );
    const verticalMovingMaximumAmplitude = positiveNumber(
        verticalMoving.maximumAmplitude,
        'platformBehavior.verticalMoving.maximumAmplitude',
    );
    const verticalMovingMinimumPeriod = positiveNumber(
        verticalMoving.minimumPeriodSeconds,
        'platformBehavior.verticalMoving.minimumPeriodSeconds',
    );
    const verticalMovingMaximumPeriod = positiveNumber(
        verticalMoving.maximumPeriodSeconds,
        'platformBehavior.verticalMoving.maximumPeriodSeconds',
    );
    if (verticalMovingChanceAtCap < verticalMovingChanceAtUnlock
        || verticalMovingChanceCapHeight <= verticalMovingUnlock
        || verticalMovingMaximumAmplitude < verticalMovingMinimumAmplitude
        || verticalMovingMaximumPeriod < verticalMovingMinimumPeriod) {
        throw new Error('Vertical-moving platform difficulty and motion ranges are invalid.');
    }
    const smallEnemy = parseEnemyTypeConfig(enemies.small, 'enemies.small');
    const largeEnemy = parseEnemyTypeConfig(enemies.large, 'enemies.large');
    const hoverEnemy = parseEnemyTypeConfig(enemies.hover, 'enemies.hover');
    if (smallEnemy.unlockHeightMeters !== 70
        || largeEnemy.unlockHeightMeters !== 220
        || hoverEnemy.unlockHeightMeters !== 150) {
        throw new Error('Enemy unlock heights must remain Small 70m, Large 220m, Hover 150m.');
    }
    const maximumActiveEnemies = positiveInteger(
        enemies.maximumActive,
        'enemies.maximumActive',
    );
    if (maximumActiveEnemies > 3) {
        throw new Error('enemies.maximumActive must not exceed the three-enemy budget.');
    }
    const enemySpawnChanceAtUnlock = unitRatio(
        enemies.spawnChanceAtUnlock,
        'enemies.spawnChanceAtUnlock',
    );
    const enemySpawnChanceCap = unitRatio(
        enemies.spawnChancePerPlatform,
        'enemies.spawnChancePerPlatform',
    );
    const enemyDifficultyCapHeight = positiveNumber(
        enemies.difficultyCapHeightMeters,
        'enemies.difficultyCapHeightMeters',
    );
    const enemyTwoActiveHeight = positiveNumber(
        enemies.twoActiveHeightMeters,
        'enemies.twoActiveHeightMeters',
    );
    const enemyThreeActiveHeight = positiveNumber(
        enemies.threeActiveHeightMeters,
        'enemies.threeActiveHeightMeters',
    );
    const enemyInitialSeparation = positiveNumber(
        enemies.minimumVerticalSeparationAtUnlock,
        'enemies.minimumVerticalSeparationAtUnlock',
    );
    const enemyFinalSeparation = positiveNumber(
        enemies.minimumVerticalSeparation,
        'enemies.minimumVerticalSeparation',
    );
    if (enemySpawnChanceAtUnlock > enemySpawnChanceCap
        || enemyDifficultyCapHeight <= smallEnemy.unlockHeightMeters
        || enemyTwoActiveHeight >= enemyThreeActiveHeight
        || enemyThreeActiveHeight > enemyDifficultyCapHeight
        || enemyInitialSeparation < enemyFinalSeparation) {
        throw new Error('Enemy difficulty curve must rise gradually and stop at its configured cap.');
    }
    const ufoUnlockHeight = nonNegativeInteger(
        ufo.unlockHeightMeters,
        'hazards.ufo.unlockHeightMeters',
    );
    const blackHoleUnlockHeight = nonNegativeInteger(
        blackHole.unlockHeightMeters,
        'hazards.blackHole.unlockHeightMeters',
    );
    const bearTrapUnlockHeight = nonNegativeInteger(
        bearTrap.unlockHeightMeters,
        'hazards.bearTrap.unlockHeightMeters',
    );
    if (ufoUnlockHeight !== 600
        || blackHoleUnlockHeight !== 250
        || bearTrapUnlockHeight !== 180) {
        throw new Error('Hazard unlock heights must remain UFO 600m, Black Hole 250m, Bear Trap 180m.');
    }
    const ufoMaximumActive = positiveInteger(ufo.maximumActive, 'hazards.ufo.maximumActive');
    const blackHoleMaximumActive = positiveInteger(
        blackHole.maximumActive,
        'hazards.blackHole.maximumActive',
    );
    const bearTrapMaximumActive = positiveInteger(
        bearTrap.maximumActive,
        'hazards.bearTrap.maximumActive',
    );
    if (ufoMaximumActive > 2
        || blackHoleMaximumActive > 2
        || bearTrapMaximumActive > 2) {
        throw new Error('Each hazard type maximumActive must not exceed 2.');
    }
    const maximumActiveHazards = positiveInteger(
        hazards.maximumActive,
        'hazards.maximumActive',
    );
    const hazardSpawnChanceAtUnlock = unitRatio(
        hazards.spawnChanceAtUnlock,
        'hazards.spawnChanceAtUnlock',
    );
    const hazardSpawnChanceCap = unitRatio(
        hazards.spawnChancePerPlatform,
        'hazards.spawnChancePerPlatform',
    );
    const hazardDifficultyCapHeight = positiveNumber(
        hazards.difficultyCapHeightMeters,
        'hazards.difficultyCapHeightMeters',
    );
    const hazardTwoActiveHeight = positiveNumber(
        hazards.twoActiveHeightMeters,
        'hazards.twoActiveHeightMeters',
    );
    const hazardInitialSeparation = positiveNumber(
        hazards.minimumVerticalSeparationAtUnlock,
        'hazards.minimumVerticalSeparationAtUnlock',
    );
    const hazardFinalSeparation = positiveNumber(
        hazards.minimumVerticalSeparation,
        'hazards.minimumVerticalSeparation',
    );
    if (maximumActiveHazards > 2
        || hazardSpawnChanceAtUnlock > hazardSpawnChanceCap
        || hazardDifficultyCapHeight <= Math.min(
            ufoUnlockHeight,
            blackHoleUnlockHeight,
            bearTrapUnlockHeight,
        )
        || hazardTwoActiveHeight > hazardDifficultyCapHeight
        || hazardInitialSeparation < hazardFinalSeparation) {
        throw new Error('Hazard difficulty curve must rise gradually and stop at its configured cap.');
    }
    const ufoSpawnMinimum = positiveNumber(
        ufo.spawnMinimumAbovePlayer,
        'hazards.ufo.spawnMinimumAbovePlayer',
    );
    const ufoSpawnMaximum = positiveNumber(
        ufo.spawnMaximumAbovePlayer,
        'hazards.ufo.spawnMaximumAbovePlayer',
    );
    if (ufoSpawnMaximum <= ufoSpawnMinimum) {
        throw new Error('hazards.ufo.spawnMaximumAbovePlayer must exceed the minimum.');
    }
    const blackHoleOuterRadius = positiveNumber(
        blackHole.outerRadius,
        'hazards.blackHole.outerRadius',
    );
    const blackHoleCoreRadius = positiveNumber(
        blackHole.coreRadius,
        'hazards.blackHole.coreRadius',
    );
    if (blackHoleCoreRadius >= blackHoleOuterRadius) {
        throw new Error('hazards.blackHole.coreRadius must be smaller than outerRadius.');
    }
    const hazardTypeOverride = nonEmptyString(
        hazards.typeOverride,
        'hazards.typeOverride',
    ) as DoodleJumpHazardType | 'auto';
    if (hazardTypeOverride !== 'auto'
        && hazardTypeOverride !== 'ufo'
        && hazardTypeOverride !== 'black-hole'
        && hazardTypeOverride !== 'bear-trap') {
        throw new Error(`Unsupported hazards.typeOverride: ${hazardTypeOverride}.`);
    }
    const debugRewardedOutcome = nonEmptyString(
        resurrection.debugRewardedOutcome,
        'resurrection.debugRewardedOutcome',
    ) as 'auto' | 'completed' | 'skipped' | 'failed';
    if (debugRewardedOutcome !== 'auto'
        && debugRewardedOutcome !== 'completed'
        && debugRewardedOutcome !== 'skipped'
        && debugRewardedOutcome !== 'failed') {
        throw new Error(
            `Unsupported resurrection.debugRewardedOutcome: ${debugRewardedOutcome}.`,
        );
    }
    const itemTypeOverride = nonEmptyString(
        items.typeOverride,
        'items.typeOverride',
    ) as DoodleJumpItemType | 'auto';
    if (itemTypeOverride !== 'auto' && ITEM_TYPES.indexOf(itemTypeOverride) < 0) {
        throw new Error(`Unsupported items.typeOverride: ${itemTypeOverride}.`);
    }
    const debugPowerPreset = nonEmptyString(
        items.debugPowerPreset,
        'items.debugPowerPreset',
    ) as DoodleJumpPowerPreset;
    if (debugPowerPreset !== 'none'
        && debugPowerPreset !== 'head-start'
        && ITEM_TYPES.indexOf(debugPowerPreset as DoodleJumpItemType) < 0) {
        throw new Error(`Unsupported items.debugPowerPreset: ${debugPowerPreset}.`);
    }
    if (!Array.isArray(items.weightBands) || items.weightBands.length !== 6) {
        throw new Error('items.weightBands must contain exactly six height bands.');
    }
    const weightBands = items.weightBands.map(parseItemWeightBand);
    weightBands.forEach((band, index) => {
        if (index > 0 && weightBands[index - 1].endMeters !== band.startMeters) {
            throw new Error('items.weightBands must be contiguous and ordered.');
        }
    });
    const itemMaximumActive = positiveInteger(items.maximumActive, 'items.maximumActive');
    if (itemMaximumActive > 5) throw new Error('items.maximumActive must not exceed 5.');
    const minimumAbovePlatform = positiveNumber(
        items.minimumAbovePlatform,
        'items.minimumAbovePlatform',
    );
    const maximumAbovePlatform = positiveNumber(
        items.maximumAbovePlatform,
        'items.maximumAbovePlatform',
    );
    if (maximumAbovePlatform <= minimumAbovePlatform) {
        throw new Error('items.maximumAbovePlatform must exceed the minimum.');
    }
    const jetpackDurationSeconds = positiveNumber(
        jetpack.durationSeconds,
        'items.jetpack.durationSeconds',
    );
    const jetpackVerticalVelocity = positiveNumber(
        jetpack.verticalVelocity,
        'items.jetpack.verticalVelocity',
    );
    const propellerHatDurationSeconds = positiveNumber(
        propellerHat.durationSeconds,
        'items.propellerHat.durationSeconds',
    );
    const propellerHatGravity = positiveNumber(
        propellerHat.gravity,
        'items.propellerHat.gravity',
    );
    const propellerHatMinimumVelocity = positiveNumber(
        propellerHat.minimumVerticalVelocity,
        'items.propellerHat.minimumVerticalVelocity',
    );
    const rocketDurationSeconds = positiveNumber(
        rocket.durationSeconds,
        'items.rocket.durationSeconds',
    );
    const rocketVerticalVelocity = positiveNumber(
        rocket.verticalVelocity,
        'items.rocket.verticalVelocity',
    );
    if (Math.abs(jetpackDurationSeconds - propellerHatDurationSeconds) > 0.0001
        || Math.abs(jetpackDurationSeconds - rocketDurationSeconds) > 0.0001) {
        throw new Error('Jetpack, Propeller Hat, and Rocket durations must remain equal.');
    }
    const inheritedMaximumVelocity = positiveNumber(
        trampoline.bounceVelocity,
        'items.trampoline.bounceVelocity',
    );
    const propellerDecelerationSeconds = Math.min(
        propellerHatDurationSeconds,
        Math.max(
            0,
            (inheritedMaximumVelocity - propellerHatMinimumVelocity) / propellerHatGravity,
        ),
    );
    const propellerFinalVelocity = Math.max(
        propellerHatMinimumVelocity,
        inheritedMaximumVelocity
            - propellerHatGravity * propellerDecelerationSeconds,
    );
    const maximumPropellerHeight = (
        (inheritedMaximumVelocity + propellerFinalVelocity) / 2
        * propellerDecelerationSeconds
    ) + propellerHatMinimumVelocity
        * (propellerHatDurationSeconds - propellerDecelerationSeconds);
    const jetpackHeight = jetpackDurationSeconds * jetpackVerticalVelocity;
    const rocketHeight = rocketDurationSeconds * rocketVerticalVelocity;
    if (!(rocketHeight > jetpackHeight && jetpackHeight > maximumPropellerHeight)) {
        throw new Error(
            'Flight item heights must remain Rocket > Jetpack > maximum Propeller Hat.',
        );
    }
    return Object.freeze({
        schemaVersion,
        design: Object.freeze({
            width: positiveNumber(design.width, 'design.width'),
            height: positiveNumber(design.height, 'design.height'),
        }),
        fixedStep: Object.freeze({
            seconds: positiveNumber(fixedStep.seconds, 'fixedStep.seconds'),
            maxSubSteps: positiveInteger(fixedStep.maxSubSteps, 'fixedStep.maxSubSteps'),
        }),
        player: Object.freeze({
            gravity,
            bounceVelocity,
            horizontalAcceleration: positiveNumber(player.horizontalAcceleration, 'player.horizontalAcceleration'),
            horizontalDeceleration: positiveNumber(player.horizontalDeceleration, 'player.horizontalDeceleration'),
            maxHorizontalSpeed: positiveNumber(player.maxHorizontalSpeed, 'player.maxHorizontalSpeed'),
            collisionWidth: positiveNumber(player.collisionWidth, 'player.collisionWidth'),
            collisionHeight: positiveNumber(player.collisionHeight, 'player.collisionHeight'),
            wrapLeft,
            wrapRight,
            wrapDistance,
        }),
        sensor: Object.freeze({
            minimumSamples: positiveInteger(sensor.minimumSamples, 'sensor.minimumSamples'),
            calibrationWindowMs: positiveNumber(sensor.calibrationWindowMs, 'sensor.calibrationWindowMs'),
            timeoutMs: positiveNumber(sensor.timeoutMs, 'sensor.timeoutMs'),
            staleTimeoutMs: positiveNumber(sensor.staleTimeoutMs, 'sensor.staleTimeoutMs'),
            deadZone: positiveNumber(sensor.deadZone, 'sensor.deadZone'),
            fullTilt: positiveNumber(sensor.fullTilt, 'sensor.fullTilt'),
            smoothingSeconds: positiveNumber(sensor.smoothingSeconds, 'sensor.smoothingSeconds'),
        }),
        camera: Object.freeze({
            targetHeightRatio: ratio(camera.targetHeightRatio, 'camera.targetHeightRatio'),
            preGenerateJumpHeights: positiveNumber(camera.preGenerateJumpHeights, 'camera.preGenerateJumpHeights'),
            recycleBelow: positiveNumber(camera.recycleBelow, 'camera.recycleBelow'),
            floatingOriginThreshold: positiveNumber(camera.floatingOriginThreshold, 'camera.floatingOriginThreshold'),
        }),
        shooting: Object.freeze({
            cooldownMs: positiveNumber(shooting.cooldownMs, 'shooting.cooldownMs'),
            speed: positiveNumber(shooting.speed, 'shooting.speed'),
            lifetimeSeconds: positiveNumber(shooting.lifetimeSeconds, 'shooting.lifetimeSeconds'),
            nearAimFallbackDistance: positiveNumber(shooting.nearAimFallbackDistance, 'shooting.nearAimFallbackDistance'),
            poolSoftTarget: positiveInteger(shooting.poolSoftTarget, 'shooting.poolSoftTarget'),
        }),
        platformBehavior: Object.freeze({
            explodingDelaySeconds: positiveNumber(
                platformBehavior.explodingDelaySeconds,
                'platformBehavior.explodingDelaySeconds',
            ),
            verticalMoving: Object.freeze({
                unlockHeightMeters: verticalMovingUnlock,
                spawnChanceAtUnlock: verticalMovingChanceAtUnlock,
                spawnChanceAtCap: verticalMovingChanceAtCap,
                chanceCapHeightMeters: verticalMovingChanceCapHeight,
                minimumAmplitude: verticalMovingMinimumAmplitude,
                maximumAmplitude: verticalMovingMaximumAmplitude,
                minimumPeriodSeconds: verticalMovingMinimumPeriod,
                maximumPeriodSeconds: verticalMovingMaximumPeriod,
            }),
            spiked: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    spiked.unlockHeightMeters,
                    'platformBehavior.spiked.unlockHeightMeters',
                ),
                spawnChance: unitRatio(
                    spiked.spawnChance,
                    'platformBehavior.spiked.spawnChance',
                ),
                collisionDepth: positiveNumber(
                    spiked.collisionDepth,
                    'platformBehavior.spiked.collisionDepth',
                ),
            }),
        }),
        visualQuality: Object.freeze({
            low: parseVisualQualityProfile(lowVisualQuality, 'visualQuality.low'),
            medium: parseVisualQualityProfile(mediumVisualQuality, 'visualQuality.medium'),
            high: parseVisualQualityProfile(highVisualQuality, 'visualQuality.high'),
        }),
        enemies: Object.freeze({
            enabled: booleanValue(enemies.enabled, 'enemies.enabled'),
            spawnChanceAtUnlock: enemySpawnChanceAtUnlock,
            spawnChancePerPlatform: enemySpawnChanceCap,
            difficultyCapHeightMeters: enemyDifficultyCapHeight,
            maximumActive: maximumActiveEnemies,
            twoActiveHeightMeters: enemyTwoActiveHeight,
            threeActiveHeightMeters: enemyThreeActiveHeight,
            recycleBelow: positiveNumber(enemies.recycleBelow, 'enemies.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(
                enemies.spawnAboveScreenMargin,
                'enemies.spawnAboveScreenMargin',
            ),
            minimumVerticalSeparationAtUnlock: enemyInitialSeparation,
            minimumVerticalSeparation: enemyFinalSeparation,
            hitFlashSeconds: positiveNumber(enemies.hitFlashSeconds, 'enemies.hitFlashSeconds'),
            stompBonus: positiveInteger(enemies.stompBonus, 'enemies.stompBonus'),
            small: smallEnemy,
            large: largeEnemy,
            hover: hoverEnemy,
        }),
        hazards: Object.freeze({
            enabled: booleanValue(hazards.enabled, 'hazards.enabled'),
            typeOverride: hazardTypeOverride,
            spawnChanceAtUnlock: hazardSpawnChanceAtUnlock,
            spawnChancePerPlatform: hazardSpawnChanceCap,
            difficultyCapHeightMeters: hazardDifficultyCapHeight,
            maximumActive: maximumActiveHazards,
            twoActiveHeightMeters: hazardTwoActiveHeight,
            recycleBelow: positiveNumber(hazards.recycleBelow, 'hazards.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(
                hazards.spawnAboveScreenMargin,
                'hazards.spawnAboveScreenMargin',
            ),
            minimumVerticalSeparationAtUnlock: hazardInitialSeparation,
            minimumVerticalSeparation: hazardFinalSeparation,
            ufo: Object.freeze({
                unlockHeightMeters: ufoUnlockHeight,
                maximumActive: ufoMaximumActive,
                width: positiveNumber(ufo.width, 'hazards.ufo.width'),
                height: positiveNumber(ufo.height, 'hazards.ufo.height'),
                beamWidth: positiveNumber(ufo.beamWidth, 'hazards.ufo.beamWidth'),
                beamLength: positiveNumber(ufo.beamLength, 'hazards.ufo.beamLength'),
                horizontalSpeed: positiveNumber(
                    ufo.horizontalSpeed,
                    'hazards.ufo.horizontalSpeed',
                ),
                lockSeconds: positiveNumber(ufo.lockSeconds, 'hazards.ufo.lockSeconds'),
                pullAcceleration: positiveNumber(
                    ufo.pullAcceleration,
                    'hazards.ufo.pullAcceleration',
                ),
                abductionSeconds: positiveNumber(
                    ufo.abductionSeconds,
                    'hazards.ufo.abductionSeconds',
                ),
                leaveResetSeconds: positiveNumber(
                    ufo.leaveResetSeconds,
                    'hazards.ufo.leaveResetSeconds',
                ),
                hitPauseSeconds: positiveNumber(
                    ufo.hitPauseSeconds,
                    'hazards.ufo.hitPauseSeconds',
                ),
                interruptScore: positiveInteger(
                    ufo.interruptScore,
                    'hazards.ufo.interruptScore',
                ),
                spawnMinimumAbovePlayer: ufoSpawnMinimum,
                spawnMaximumAbovePlayer: ufoSpawnMaximum,
            }),
            blackHole: Object.freeze({
                unlockHeightMeters: blackHoleUnlockHeight,
                maximumActive: blackHoleMaximumActive,
                outerRadius: blackHoleOuterRadius,
                coreRadius: blackHoleCoreRadius,
                maximumPullAcceleration: positiveNumber(
                    blackHole.maximumPullAcceleration,
                    'hazards.blackHole.maximumPullAcceleration',
                ),
            }),
            bearTrap: Object.freeze({
                unlockHeightMeters: bearTrapUnlockHeight,
                maximumActive: bearTrapMaximumActive,
                width: positiveNumber(bearTrap.width, 'hazards.bearTrap.width'),
                height: positiveNumber(bearTrap.height, 'hazards.bearTrap.height'),
                minimumRemainingLandingWidth: positiveNumber(
                    bearTrap.minimumRemainingLandingWidth,
                    'hazards.bearTrap.minimumRemainingLandingWidth',
                ),
            }),
        }),
        items: Object.freeze({
            enabled: booleanValue(items.enabled, 'items.enabled'),
            typeOverride: itemTypeOverride,
            debugPowerPreset,
            debugHeadStartCount: nonNegativeInteger(
                items.debugHeadStartCount,
                'items.debugHeadStartCount',
            ),
            spawnChancePerPlatform: unitRatio(
                items.spawnChancePerPlatform,
                'items.spawnChancePerPlatform',
            ),
            maximumActive: itemMaximumActive,
            recycleBelow: positiveNumber(items.recycleBelow, 'items.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(
                items.spawnAboveScreenMargin,
                'items.spawnAboveScreenMargin',
            ),
            minimumVerticalSeparation: positiveNumber(
                items.minimumVerticalSeparation,
                'items.minimumVerticalSeparation',
            ),
            pickupRadius: positiveNumber(items.pickupRadius, 'items.pickupRadius'),
            minimumAbovePlatform,
            maximumAbovePlatform,
            spring: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    spring.unlockHeightMeters,
                    'items.spring.unlockHeightMeters',
                ),
                bounceVelocity: positiveNumber(
                    spring.bounceVelocity,
                    'items.spring.bounceVelocity',
                ),
            }),
            trampoline: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    trampoline.unlockHeightMeters,
                    'items.trampoline.unlockHeightMeters',
                ),
                bounceVelocity: positiveNumber(
                    trampoline.bounceVelocity,
                    'items.trampoline.bounceVelocity',
                ),
            }),
            jetpack: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    jetpack.unlockHeightMeters,
                    'items.jetpack.unlockHeightMeters',
                ),
                durationSeconds: jetpackDurationSeconds,
                verticalVelocity: jetpackVerticalVelocity,
            }),
            propellerHat: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    propellerHat.unlockHeightMeters,
                    'items.propellerHat.unlockHeightMeters',
                ),
                durationSeconds: propellerHatDurationSeconds,
                gravity: propellerHatGravity,
                minimumVerticalVelocity: propellerHatMinimumVelocity,
            }),
            rocket: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    rocket.unlockHeightMeters,
                    'items.rocket.unlockHeightMeters',
                ),
                durationSeconds: rocketDurationSeconds,
                verticalVelocity: rocketVerticalVelocity,
            }),
            shield: Object.freeze({
                unlockHeightMeters: nonNegativeInteger(
                    shield.unlockHeightMeters,
                    'items.shield.unlockHeightMeters',
                ),
                durationSeconds: positiveNumber(
                    shield.durationSeconds,
                    'items.shield.durationSeconds',
                ),
            }),
            headStart: Object.freeze({
                durationSeconds: positiveNumber(
                    headStart.durationSeconds,
                    'items.headStart.durationSeconds',
                ),
                verticalVelocity: positiveNumber(
                    headStart.verticalVelocity,
                    'items.headStart.verticalVelocity',
                ),
            }),
            weightBands: Object.freeze(weightBands),
        }),
        resurrection: Object.freeze({
            placement: nonEmptyString(resurrection.placement, 'resurrection.placement'),
            maximumSuccessfulRevives: positiveInteger(
                resurrection.maximumSuccessfulRevives,
                'resurrection.maximumSuccessfulRevives',
            ),
            shieldSeconds: positiveNumber(resurrection.shieldSeconds, 'resurrection.shieldSeconds'),
            launchVelocity,
            safeHorizontalRadius: positiveNumber(
                resurrection.safeHorizontalRadius,
                'resurrection.safeHorizontalRadius',
            ),
            forceGeneratedSafePlatform: booleanValue(
                resurrection.forceGeneratedSafePlatform,
                'resurrection.forceGeneratedSafePlatform',
            ),
            debugRewardedOutcome,
        }),
        generation: Object.freeze({
            enabled: booleanValue(generation.enabled, 'generation.enabled'),
            singleStep: booleanValue(generation.singleStep, 'generation.singleStep'),
            showRouteDebug: booleanValue(generation.showRouteDebug, 'generation.showRouteDebug'),
            exportFailureDebug: booleanValue(
                generation.exportFailureDebug,
                'generation.exportFailureDebug',
            ),
            forceDegradedFallback: booleanValue(
                generation.forceDegradedFallback,
                'generation.forceDegradedFallback',
            ),
            seedOverride: nonNegativeInteger(generation.seedOverride, 'generation.seedOverride'),
            platformTypeOverride,
            verticalStep,
            mainRouteStepCount,
            maxInsertedPlatforms,
            recoveryLayerInterval,
            maxHorizontalGap,
            preloadAboveScreen: positiveNumber(
                generation.preloadAboveScreen,
                'generation.preloadAboveScreen',
            ),
            normalFallbackWidth: positiveNumber(
                generation.normalFallbackWidth,
                'generation.normalFallbackWidth',
            ),
            maxCandidateAttempts,
            maxActivePlatforms,
        }),
        fixedPlatforms: Object.freeze(platforms),
    });
}
