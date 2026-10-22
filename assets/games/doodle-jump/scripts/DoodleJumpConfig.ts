import type { DoodleJumpSpawnPlan } from './DoodleJumpReferenceRules';
export const DOODLE_JUMP_BUNDLE = 'game-doodle-jump';
export const DOODLE_JUMP_RESOURCE_BUNDLE = 'game-doodle-jump-assets';
export const DOODLE_JUMP_GAME_ID = 'doodle-jump';

export type DoodleJumpPlatformType =
    | 'normal'
    | 'moving'
    | 'vertical-moving'
    | 'breakable'
    | 'disappearing'
    | 'shifting'
    | 'exploding'
    | 'teleport';

export const DOODLE_JUMP_ENEMY_TYPES = ['small', 'hopper', 'hover', 'weaver', 'large', 'flyer', 'bouncer', 'runner', 'tall'] as const;
export type DoodleJumpEnemyType = typeof DOODLE_JUMP_ENEMY_TYPES[number];

export function isDoodleJumpFlyingEnemy(type: DoodleJumpEnemyType): boolean {
    return type !== 'bouncer' && type !== 'runner' && type !== 'tall';
}
export type DoodleJumpHazardType = 'ufo' | 'black-hole' | 'bear-trap';
export type DoodleJumpItemType =
    | 'spring'
    | 'trampoline'
    | 'jetpack'
    | 'propeller-hat'
    | 'spring-shoes'
    | 'shield';
export type DoodleJumpPowerPreset = DoodleJumpItemType | 'head-start' | 'none';

export interface DoodleJumpEnemyTypeConfig {
    readonly health: number;
    readonly width: number;
    readonly height: number;
}

export interface DoodleJumpVisualQualityProfile {
    readonly decorNodeCount: number;
    readonly secondaryEffects: boolean;
    readonly effectScale: number;
    readonly uiMotion: boolean;
}

export interface DoodleJumpFixedPlatformConfig {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly type: DoodleJumpPlatformType;
    readonly movingVelocity?: number;
    readonly motionStartSeconds?: number;
    readonly spawnPlan?: DoodleJumpSpawnPlan;
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
        terminalFallVelocity: number;
        /** Speed at keyboard/H5 full input; physical sensor tilt remains proportional beyond fullTilt. */
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
        anchorHeight: number;
        maximumAnchorHeightRatio: number;
        recycleBelow: number;
    }>;
    readonly shooting: Readonly<{
        cooldownMs: number;
        speed: number;
        lifetimeSeconds: number;
        nearAimFallbackDistance: number;
        poolSoftTarget: number;
    }>;
    readonly collectibles: Readonly<{
        enabled: boolean;
        hoverOffsetY: number;
        gatherSeconds: number;
        headHoldSeconds: number;
        flightSeconds: number;
    }>;
    readonly platformBehavior: Readonly<{
        /** Every platform except the starter floor uses this width. */
        standardWidth: number;
        visualHeight: number;
        teleport: Readonly<{ fadeSeconds: number }>;
    }>;
    readonly visualQuality: Readonly<Record<
        'low' | 'medium' | 'high',
        DoodleJumpVisualQualityProfile
    >>;
    readonly enemies: Readonly<{
        enabled: boolean;

        maximumActive: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        hitFlashSeconds: number;
        small: DoodleJumpEnemyTypeConfig;
        large: DoodleJumpEnemyTypeConfig;
        hover: DoodleJumpEnemyTypeConfig;
        hopper: DoodleJumpEnemyTypeConfig;
        weaver: DoodleJumpEnemyTypeConfig;
        flyer: DoodleJumpEnemyTypeConfig;
        bouncer: DoodleJumpEnemyTypeConfig;
        runner: DoodleJumpEnemyTypeConfig;
        tall: DoodleJumpEnemyTypeConfig;
    }>;
    readonly hazards: Readonly<{
        enabled: boolean;
        typeOverride: DoodleJumpHazardType | 'auto';

        maximumActive: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        ufo: Readonly<{
            width: number;
            height: number;
            beamWidth: number;
            beamLength: number;
            lockSeconds: number;
            abductionSeconds: number;
        }>;
        blackHole: Readonly<{
            outerRadius: number;
            coreRadius: number;
        }>;
        bearTrap: Readonly<{
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
        maximumActive: number;
        recycleBelow: number;
        spawnAboveScreenMargin: number;
        spring: Readonly<{ bounceVelocity: number }>;
        trampoline: Readonly<{ bounceVelocity: number }>;
        jetpack: Readonly<{
            durationSeconds: number;
            verticalVelocity: number;
        }>;
        propellerHat: Readonly<{
            durationSeconds: number;
            minimumVerticalVelocity: number;
        }>;
        shield: Readonly<{ durationSeconds: number }>;
        springShoes: Readonly<{ durationSeconds: number; bounceVelocity: number }>;
        headStart: Readonly<{ durationSeconds: number; verticalVelocity: number }>;
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
        forceDegradedFallback: boolean;
        seedOverride: number;
        platformTypeOverride: DoodleJumpPlatformType | 'auto';
        preloadAboveScreen: number;
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
    'teleport',
]);

const ITEM_TYPES: readonly DoodleJumpItemType[] = Object.freeze([
    'spring',
    'trampoline',
    'jetpack',
    'propeller-hat',
    'shield',
    'spring-shoes',
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
    return Object.freeze({
        decorNodeCount,
        secondaryEffects: booleanValue(value.secondaryEffects, `${path}.secondaryEffects`),
        effectScale,
        uiMotion: booleanValue(value.uiMotion, `${path}.uiMotion`),
    });
}

function parsePlatform(
    value: unknown,
    index: number,
    starterFloorWidth: number,
    standardWidth: number,
): DoodleJumpFixedPlatformConfig {
    const path = `fixedPlatforms[${index}]`;
    const record = asRecord(value, path);
    const type = nonEmptyString(record.type, `${path}.type`) as DoodleJumpPlatformType;
    if (PLATFORM_TYPES.indexOf(type) < 0) {
        throw new Error(`${path}.type is unsupported: ${type}.`);
    }
    if (record.width !== undefined) {
        throw new Error(`${path}.width is derived from platformBehavior.standardWidth.`);
    }
    return Object.freeze({
        id: nonEmptyString(record.id, `${path}.id`),
        x: finiteNumber(record.x, `${path}.x`),
        y: finiteNumber(record.y, `${path}.y`),
        // P0 is the starter floor spanning the design width; every other
        // platform shares one width so the route reads consistently.
        width: index === 0 ? starterFloorWidth : standardWidth,
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
    const collectibles = asRecord(root.collectibles, 'collectibles');
    const platformBehavior = asRecord(root.platformBehavior, 'platformBehavior');
    const teleport = asRecord(platformBehavior.teleport, 'platformBehavior.teleport');
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
    const shield = asRecord(items.shield, 'items.shield');
    const springShoes = asRecord(items.springShoes, 'items.springShoes');
    const headStart = asRecord(items.headStart, 'items.headStart');
    const resurrection = asRecord(root.resurrection, 'resurrection');
    const generation = asRecord(root.generation, 'generation');
    if (!Array.isArray(root.fixedPlatforms) || root.fixedPlatforms.length === 0) {
        throw new Error('fixedPlatforms must contain a starter floor.');
    }
    const designWidth = positiveNumber(design.width, 'design.width');
    const standardPlatformWidth = positiveNumber(
        platformBehavior.standardWidth,
        'platformBehavior.standardWidth',
    );
    if (standardPlatformWidth > designWidth) throw new Error('Platform width exceeds the playfield.');
    const platforms = root.fixedPlatforms.map((platform, index) => parsePlatform(
        platform,
        index,
        designWidth,
        standardPlatformWidth,
    ));
    const ids = new Set<string>();
    platforms.forEach((platform) => {
        if (ids.has(platform.id)) throw new Error(`Duplicate platform id: ${platform.id}.`);
        ids.add(platform.id);
    });
    const schemaVersion = positiveInteger(root.schemaVersion, 'schemaVersion');
    if (schemaVersion !== 5) throw new Error(`Unsupported gameplay schemaVersion ${schemaVersion}.`);
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
    const terminalFallVelocity = finiteNumber(player.terminalFallVelocity, 'player.terminalFallVelocity');
    if (gravity >= 0 || terminalFallVelocity >= 0) {
        throw new Error('Player gravity and terminal fall velocity must be negative.');
    }
    const jumpHeight = bounceVelocity * bounceVelocity / (-2 * gravity)
        + bounceVelocity * positiveNumber(fixedStep.seconds, 'fixedStep.seconds') / 2;
    const largestFixedGap = platforms.reduce((gap, platform, index) => index === 0 ? gap
        : Math.max(gap, platform.y - platforms[index - 1].y), 0);
    if (largestFixedGap + 10 >= jumpHeight || 90 * designWidth / 320 >= jumpHeight) {
        throw new Error('Initial platforms and original random gaps must fit the jump trajectory.');
    }
    if (Math.abs(launchVelocity - bounceVelocity) > 0.001) {
        throw new Error('resurrection.launchVelocity must match player.bounceVelocity.');
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
    if (maxActivePlatforms < 8 || maxActivePlatforms > 100) {
        throw new Error('generation.maxActivePlatforms must fit the 8-100 platform pool.');
    }
    const platformTypeOverride = nonEmptyString(
        generation.platformTypeOverride,
        'generation.platformTypeOverride',
    ) as DoodleJumpPlatformType | 'auto';
    if (platformTypeOverride !== 'auto'
        && PLATFORM_TYPES.indexOf(platformTypeOverride) < 0) {
        throw new Error(`Unsupported generation.platformTypeOverride: ${platformTypeOverride}.`);
    }
    const smallEnemy = parseEnemyTypeConfig(enemies.small, 'enemies.small');
    const largeEnemy = parseEnemyTypeConfig(enemies.large, 'enemies.large');
    const hoverEnemy = parseEnemyTypeConfig(enemies.hover, 'enemies.hover');
    const hopperEnemy = parseEnemyTypeConfig(enemies.hopper, 'enemies.hopper');
    const weaverEnemy = parseEnemyTypeConfig(enemies.weaver, 'enemies.weaver');
    const flyerEnemy = parseEnemyTypeConfig(enemies.flyer, 'enemies.flyer');
    const maximumActiveEnemies = positiveInteger(enemies.maximumActive, 'enemies.maximumActive');
    const maximumActiveHazards = positiveInteger(hazards.maximumActive, 'hazards.maximumActive');
    if (maximumActiveEnemies > 8 || maximumActiveHazards > 8) throw new Error('Entity pools must not exceed 8.');
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
    const itemMaximumActive = positiveInteger(items.maximumActive, 'items.maximumActive');
    if (itemMaximumActive > 8) throw new Error('items.maximumActive must not exceed 8.');
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
    const propellerHatMinimumVelocity = positiveNumber(
        propellerHat.minimumVerticalVelocity,
        'items.propellerHat.minimumVerticalVelocity',
    );

    return Object.freeze({
        schemaVersion,
        design: Object.freeze({
            width: designWidth,
            height: positiveNumber(design.height, 'design.height'),
        }),
        fixedStep: Object.freeze({
            seconds: positiveNumber(fixedStep.seconds, 'fixedStep.seconds'),
            maxSubSteps: positiveInteger(fixedStep.maxSubSteps, 'fixedStep.maxSubSteps'),
        }),
        player: Object.freeze({
            gravity,
            bounceVelocity,
            terminalFallVelocity,
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
            deadZone: unitRatio(sensor.deadZone, 'sensor.deadZone'),
            fullTilt: positiveNumber(sensor.fullTilt, 'sensor.fullTilt'),
            smoothingSeconds: positiveNumber(sensor.smoothingSeconds, 'sensor.smoothingSeconds'),
        }),
        camera: Object.freeze({
            anchorHeight: positiveNumber(camera.anchorHeight, 'camera.anchorHeight'),
            maximumAnchorHeightRatio: ratio(camera.maximumAnchorHeightRatio, 'camera.maximumAnchorHeightRatio'),
            recycleBelow: positiveNumber(camera.recycleBelow, 'camera.recycleBelow'),
        }),
        shooting: Object.freeze({
            cooldownMs: positiveNumber(shooting.cooldownMs, 'shooting.cooldownMs'),
            speed: positiveNumber(shooting.speed, 'shooting.speed'),
            lifetimeSeconds: positiveNumber(shooting.lifetimeSeconds, 'shooting.lifetimeSeconds'),
            nearAimFallbackDistance: positiveNumber(shooting.nearAimFallbackDistance, 'shooting.nearAimFallbackDistance'),
            poolSoftTarget: positiveInteger(shooting.poolSoftTarget, 'shooting.poolSoftTarget'),
        }),
        collectibles: Object.freeze({
            enabled: booleanValue(collectibles.enabled, 'collectibles.enabled'),
            hoverOffsetY: positiveNumber(collectibles.hoverOffsetY, 'collectibles.hoverOffsetY'),
            gatherSeconds: positiveNumber(collectibles.gatherSeconds, 'collectibles.gatherSeconds'),
            headHoldSeconds: positiveNumber(collectibles.headHoldSeconds, 'collectibles.headHoldSeconds'),
            flightSeconds: positiveNumber(collectibles.flightSeconds, 'collectibles.flightSeconds'),
        }),
        platformBehavior: Object.freeze({ standardWidth: standardPlatformWidth,
            visualHeight: positiveNumber(platformBehavior.visualHeight, 'platformBehavior.visualHeight'),
            teleport: Object.freeze({ fadeSeconds: positiveNumber(teleport.fadeSeconds, 'platformBehavior.teleport.fadeSeconds') }),
        }),
        visualQuality: Object.freeze({
            low: parseVisualQualityProfile(lowVisualQuality, 'visualQuality.low'),
            medium: parseVisualQualityProfile(mediumVisualQuality, 'visualQuality.medium'),
            high: parseVisualQualityProfile(highVisualQuality, 'visualQuality.high'),
        }),
        enemies: Object.freeze({
            enabled: booleanValue(enemies.enabled, 'enemies.enabled'), maximumActive: maximumActiveEnemies,
            recycleBelow: positiveNumber(enemies.recycleBelow, 'enemies.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(enemies.spawnAboveScreenMargin, 'enemies.spawnAboveScreenMargin'),
            hitFlashSeconds: positiveNumber(enemies.hitFlashSeconds, 'enemies.hitFlashSeconds'),
            small: smallEnemy, large: largeEnemy, hover: hoverEnemy, hopper: hopperEnemy, weaver: weaverEnemy, flyer: flyerEnemy,
            bouncer: parseEnemyTypeConfig(enemies.bouncer, 'enemies.bouncer'),
            runner: parseEnemyTypeConfig(enemies.runner, 'enemies.runner'),
            tall: parseEnemyTypeConfig(enemies.tall, 'enemies.tall'),
        }),
        hazards: Object.freeze({
            enabled: booleanValue(hazards.enabled, 'hazards.enabled'), typeOverride: hazardTypeOverride,
            maximumActive: maximumActiveHazards,
            recycleBelow: positiveNumber(hazards.recycleBelow, 'hazards.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(hazards.spawnAboveScreenMargin, 'hazards.spawnAboveScreenMargin'),
            ufo: Object.freeze({
                width: positiveNumber(ufo.width, 'hazards.ufo.width'), height: positiveNumber(ufo.height, 'hazards.ufo.height'),
                beamWidth: positiveNumber(ufo.beamWidth, 'hazards.ufo.beamWidth'), beamLength: positiveNumber(ufo.beamLength, 'hazards.ufo.beamLength'),
                lockSeconds: positiveNumber(ufo.lockSeconds, 'hazards.ufo.lockSeconds'),
                abductionSeconds: positiveNumber(ufo.abductionSeconds, 'hazards.ufo.abductionSeconds'),
            }),
            blackHole: Object.freeze({ outerRadius: blackHoleOuterRadius, coreRadius: blackHoleCoreRadius }),
            bearTrap: Object.freeze({
                width: positiveNumber(bearTrap.width, 'hazards.bearTrap.width'), height: positiveNumber(bearTrap.height, 'hazards.bearTrap.height'),
                minimumRemainingLandingWidth: positiveNumber(bearTrap.minimumRemainingLandingWidth, 'hazards.bearTrap.minimumRemainingLandingWidth'),
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
            maximumActive: itemMaximumActive,
            recycleBelow: positiveNumber(items.recycleBelow, 'items.recycleBelow'),
            spawnAboveScreenMargin: positiveNumber(
                items.spawnAboveScreenMargin,
                'items.spawnAboveScreenMargin',
            ),
            spring: Object.freeze({
                bounceVelocity: positiveNumber(
                    spring.bounceVelocity,
                    'items.spring.bounceVelocity',
                ),
            }),
            trampoline: Object.freeze({
                bounceVelocity: positiveNumber(
                    trampoline.bounceVelocity,
                    'items.trampoline.bounceVelocity',
                ),
            }),
            jetpack: Object.freeze({
                durationSeconds: jetpackDurationSeconds,
                verticalVelocity: jetpackVerticalVelocity,
            }),
            propellerHat: Object.freeze({
                durationSeconds: propellerHatDurationSeconds,
                minimumVerticalVelocity: propellerHatMinimumVelocity,
            }),
            shield: Object.freeze({
                durationSeconds: positiveNumber(
                    shield.durationSeconds,
                    'items.shield.durationSeconds',
                ),
            }),
            springShoes: Object.freeze({
                durationSeconds: positiveNumber(springShoes.durationSeconds, 'items.springShoes.durationSeconds'),
                bounceVelocity: positiveNumber(springShoes.bounceVelocity, 'items.springShoes.bounceVelocity'),
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
            forceDegradedFallback: booleanValue(
                generation.forceDegradedFallback,
                'generation.forceDegradedFallback',
            ),
            seedOverride: nonNegativeInteger(generation.seedOverride, 'generation.seedOverride'),
            platformTypeOverride,
            preloadAboveScreen: positiveNumber(
                generation.preloadAboveScreen,
                'generation.preloadAboveScreen',
            ),
            maxCandidateAttempts,
            maxActivePlatforms,
        }),
        fixedPlatforms: Object.freeze(platforms),
    });
}
