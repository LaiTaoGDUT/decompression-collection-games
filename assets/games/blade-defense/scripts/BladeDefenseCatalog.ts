export const BLADE_DEFENSE_MAX_PET_LEVEL = 8;

export interface BladeDefensePoint {
    readonly x: number;
    readonly y: number;
}

export interface BladeDefensePetLevelConfig {
    readonly level: number;
    readonly id: string;
    readonly displayName: string;
    readonly damage: number;
    readonly bladeCount: number;
    /** Blade rotation speed in radians per second. */
    readonly spinSpeed: number;
    /** Distance from the pet center to each blade tip, in normalized board units. */
    readonly bladeOrbitRadius: number;
    /** Collision radius of a blade tip, in normalized board units. */
    readonly bladeHitRadius: number;
    /** The same blade cannot hurt the same target again before this time elapses. */
    readonly hitCooldownSeconds: number;
}

export type BladeDefenseBonusChoiceId = 'plus-2' | 'plus-3';

export interface BladeDefenseBonusChoiceConfig {
    readonly id: BladeDefenseBonusChoiceId;
    readonly levelDelta: 2 | 3;
    readonly successChance: number;
}

/**
 * Shared deterministic rules. Coordinates use a normalized board centered at
 * (0, 0); the enemy track is a circle with radius 1.
 */
export const BLADE_DEFENSE_RULES = Object.freeze({
    initialLives: 10,
    petSlotCount: 12,
    trackRadius: 1,
    petRingRadius: 0.58,
    entityHitRadius: 0.065,
    maxSimulationStepSeconds: 1 / 120,
    bonusOfferChance: 0.3,
    chestDropChancePerEnemy: 0.18,
    guaranteedEarlyChestDrops: 2,
    waveSpawnIntervalSeconds: 0.9,
    baseWaveEnemyCount: 4,
    enemiesAddedPerWave: 2,
    baseEnemyHp: 2,
    enemyHpPerWave: 2,
    baseEnemySpeed: 0.052,
    enemySpeedPerWave: 0.003,
    baseEnemyScore: 10,
    enemyScorePerWave: 2,
    baseChestHp: 2,
    chestHpPerWave: 1,
    chestScore: 25,
    waveClearScorePerWave: 20,
});

export const BLADE_DEFENSE_BONUS_CHOICES: readonly BladeDefenseBonusChoiceConfig[] =
    Object.freeze([
        Object.freeze({
            id: 'plus-2' as const,
            levelDelta: 2 as const,
            successChance: 0.55,
        }),
        Object.freeze({
            id: 'plus-3' as const,
            levelDelta: 3 as const,
            successChance: 0.3,
        }),
    ]);

/**
 * Levels are intentionally one-based so product copy can say L1 ... L8
 * without translating an internal zero-based index. Every level changes
 * damage, blade count, spin frequency, orbit radius and hit cooldown.
 */
export const BLADE_DEFENSE_PET_LEVELS: readonly BladeDefensePetLevelConfig[] =
    Object.freeze([
        Object.freeze({
            level: 1,
            id: 'sprout-pup',
            displayName: '芽芽犬',
            damage: 1,
            bladeCount: 1,
            spinSpeed: 2.4,
            bladeOrbitRadius: 0.35,
            bladeHitRadius: 0.055,
            hitCooldownSeconds: 0.2,
        }),
        Object.freeze({
            level: 2,
            id: 'scout-cat',
            displayName: '巡逻猫',
            damage: 2,
            bladeCount: 2,
            spinSpeed: 2.75,
            bladeOrbitRadius: 0.365,
            bladeHitRadius: 0.056,
            hitCooldownSeconds: 0.19,
        }),
        Object.freeze({
            level: 3,
            id: 'guard-rabbit',
            displayName: '守卫兔',
            damage: 4,
            bladeCount: 3,
            spinSpeed: 3.1,
            bladeOrbitRadius: 0.38,
            bladeHitRadius: 0.057,
            hitCooldownSeconds: 0.18,
        }),
        Object.freeze({
            level: 4,
            id: 'blade-fox',
            displayName: '刃刃狐',
            damage: 7,
            bladeCount: 4,
            spinSpeed: 3.5,
            bladeOrbitRadius: 0.395,
            bladeHitRadius: 0.058,
            hitCooldownSeconds: 0.17,
        }),
        Object.freeze({
            level: 5,
            id: 'storm-bear',
            displayName: '风暴熊',
            damage: 11,
            bladeCount: 5,
            spinSpeed: 3.9,
            bladeOrbitRadius: 0.41,
            bladeHitRadius: 0.059,
            hitCooldownSeconds: 0.16,
        }),
        Object.freeze({
            level: 6,
            id: 'moon-wolf',
            displayName: '月轮狼',
            damage: 16,
            bladeCount: 6,
            spinSpeed: 4.35,
            bladeOrbitRadius: 0.425,
            bladeHitRadius: 0.06,
            hitCooldownSeconds: 0.15,
        }),
        Object.freeze({
            level: 7,
            id: 'royal-lion',
            displayName: '皇家狮',
            damage: 22,
            bladeCount: 7,
            spinSpeed: 4.8,
            bladeOrbitRadius: 0.44,
            bladeHitRadius: 0.061,
            hitCooldownSeconds: 0.14,
        }),
        Object.freeze({
            level: 8,
            id: 'star-dragon',
            displayName: '星刃龙',
            damage: 30,
            bladeCount: 8,
            spinSpeed: 5.3,
            bladeOrbitRadius: 0.455,
            bladeHitRadius: 0.062,
            hitCooldownSeconds: 0.13,
        }),
    ]);

export function getBladeDefensePetConfig(
    level: number,
): BladeDefensePetLevelConfig {
    const config = BLADE_DEFENSE_PET_LEVELS[level - 1];

    if (!config || config.level !== level) {
        throw new Error(`Unknown blade-defense pet level: ${level}.`);
    }

    return config;
}

/** Progress 0 is the bottom of the track; progress increases clockwise. */
export function pointOnBladeDefenseTrack(progress: number): BladeDefensePoint {
    const normalized = Number.isFinite(progress)
        ? ((progress % 1) + 1) % 1
        : 0;
    const angle = normalized * Math.PI * 2 - Math.PI / 2;
    return Object.freeze({
        x: Math.cos(angle) * BLADE_DEFENSE_RULES.trackRadius,
        y: Math.sin(angle) * BLADE_DEFENSE_RULES.trackRadius,
    });
}

/** Slot 0 faces track progress 0; all 12 tower slots sit evenly on the inner ring. */
export function getBladeDefensePetSlotPosition(
    slotIndex: number,
): BladeDefensePoint {
    if (!Number.isInteger(slotIndex)
        || slotIndex < 0
        || slotIndex >= BLADE_DEFENSE_RULES.petSlotCount) {
        throw new Error(`Invalid blade-defense pet slot: ${slotIndex}.`);
    }

    const angle = slotIndex / BLADE_DEFENSE_RULES.petSlotCount
        * Math.PI * 2
        - Math.PI / 2;
    return Object.freeze({
        x: Math.cos(angle) * BLADE_DEFENSE_RULES.petRingRadius,
        y: Math.sin(angle) * BLADE_DEFENSE_RULES.petRingRadius,
    });
}

export function getBladeDefensePetSlotFacing(slotIndex: number): number {
    getBladeDefensePetSlotPosition(slotIndex);
    return slotIndex / BLADE_DEFENSE_RULES.petSlotCount
        * Math.PI * 2
        - Math.PI / 2;
}

export function getAvailableBladeDefenseBonusChoices(
    sourceLevel: number,
): readonly BladeDefenseBonusChoiceConfig[] {
    getBladeDefensePetConfig(sourceLevel);
    return Object.freeze(BLADE_DEFENSE_BONUS_CHOICES.filter((choice) => (
        sourceLevel + choice.levelDelta <= BLADE_DEFENSE_MAX_PET_LEVEL
    )));
}

export function validateBladeDefenseCatalog(
    catalog: readonly BladeDefensePetLevelConfig[] = BLADE_DEFENSE_PET_LEVELS,
): readonly string[] {
    const errors: string[] = [];
    const ids = new Set<string>();

    if (catalog.length !== BLADE_DEFENSE_MAX_PET_LEVEL) {
        errors.push(`Catalog must contain ${BLADE_DEFENSE_MAX_PET_LEVEL} levels.`);
    }

    catalog.forEach((pet, index) => {
        const expectedLevel = index + 1;
        const previous = catalog[index - 1];

        if (pet.level !== expectedLevel) {
            errors.push(`Pet level ${expectedLevel} is missing or out of order.`);
        }

        if (!pet.id || ids.has(pet.id)) {
            errors.push(`Pet ID at level ${expectedLevel} is empty or duplicated.`);
        }
        ids.add(pet.id);

        if (!pet.displayName
            || !Number.isInteger(pet.damage)
            || pet.damage <= 0
            || !Number.isInteger(pet.bladeCount)
            || pet.bladeCount <= 0
            || pet.spinSpeed <= 0
            || pet.bladeOrbitRadius <= 0
            || pet.bladeHitRadius <= 0
            || pet.hitCooldownSeconds <= 0) {
            errors.push(`Pet level ${expectedLevel} has incomplete combat data.`);
        }

        if (previous
            && (pet.damage <= previous.damage
                || pet.bladeCount <= previous.bladeCount
                || pet.spinSpeed <= previous.spinSpeed
                || pet.bladeOrbitRadius <= previous.bladeOrbitRadius
                || pet.hitCooldownSeconds >= previous.hitCooldownSeconds)) {
            errors.push(`Pet level ${expectedLevel} must improve every combat axis.`);
        }
    });

    if (catalog[0]?.damage !== 1) {
        errors.push('Level 1 pet damage must equal 1.');
    }

    return Object.freeze(errors);
}
