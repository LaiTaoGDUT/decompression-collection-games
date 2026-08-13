import {
    BLADE_DEFENSE_MAX_PET_LEVEL,
    BLADE_DEFENSE_RULES,
    type BladeDefenseBonusChoiceConfig,
    type BladeDefenseBonusChoiceId,
    getAvailableBladeDefenseBonusChoices,
    getBladeDefensePetConfig,
    getBladeDefensePetSlotFacing,
    getBladeDefensePetSlotPosition,
    pointOnBladeDefenseTrack,
} from './BladeDefenseCatalog';

const TWO_PI = Math.PI * 2;
const MAX_TICK_SECONDS = 10;
const MAX_QUEUED_EVENTS = 1024;

export type BladeDefenseEntityKind = 'enemy' | 'chest';
export type BladeDefenseState = 'running' | 'game-over';
export type BladeDefenseBonusDecision = 'safe' | BladeDefenseBonusChoiceId;

export interface BladeDefenseBladeSnapshot {
    readonly index: number;
    readonly angle: number;
    readonly x: number;
    readonly y: number;
}

export interface BladeDefensePetSnapshot {
    readonly id: string;
    readonly slotIndex: number;
    readonly level: number;
    readonly damage: number;
    readonly bladeCount: number;
    readonly spinSpeed: number;
    readonly bladeOrbitRadius: number;
    readonly hitCooldownSeconds: number;
    readonly rotation: number;
    readonly x: number;
    readonly y: number;
    readonly blades: readonly BladeDefenseBladeSnapshot[];
}

export interface BladeDefenseEntitySnapshot {
    readonly id: string;
    readonly kind: BladeDefenseEntityKind;
    readonly progress: number;
    readonly hp: number;
    readonly maxHp: number;
    /** Enemies move in progress units/second. Chests are fixed at speed 0. */
    readonly speed: number;
    readonly x: number;
    readonly y: number;
    readonly scoreValue: number;
    readonly lifeDamage?: number;
    readonly rewardLevel?: number;
    readonly wave: number;
}

export interface BladeDefenseBonusChoiceSnapshot {
    readonly id: BladeDefenseBonusChoiceId;
    readonly targetLevel: number;
    readonly successChance: number;
}

export interface BladeDefenseBonusOfferSnapshot {
    readonly id: string;
    readonly firstSlot: number;
    readonly secondSlot: number;
    readonly sourceLevel: number;
    readonly safeTargetLevel: number;
    readonly choices: readonly BladeDefenseBonusChoiceSnapshot[];
}

export interface BladeDefenseWaveSnapshot {
    readonly number: number;
    readonly active: boolean;
    readonly totalEnemies: number;
    readonly spawnedEnemies: number;
    readonly enemiesWaitingToSpawn: number;
    readonly timeUntilNextSpawn: number;
}

export interface BladeDefenseSnapshot {
    readonly state: BladeDefenseState;
    readonly elapsedSeconds: number;
    readonly lives: number;
    readonly score: number;
    /** Always contains exactly 12 inner-ring tower slots; null means empty. */
    readonly petSlots: readonly (BladeDefensePetSnapshot | null)[];
    readonly entities: readonly BladeDefenseEntitySnapshot[];
    readonly pendingPetLevels: readonly number[];
    readonly bonusOffer?: BladeDefenseBonusOfferSnapshot;
    readonly wave: BladeDefenseWaveSnapshot;
}

export type BladeDefenseEvent =
    | Readonly<{
        type: 'round-reset';
        atSeconds: number;
        lives: number;
        initialPetId: string;
    }>
    | Readonly<{
        type: 'wave-started';
        atSeconds: number;
        wave: number;
        enemyCount: number;
    }>
    | Readonly<{
        type: 'wave-completed';
        atSeconds: number;
        wave: number;
        scoreAwarded: number;
        score: number;
    }>
    | Readonly<{
        type: 'entity-spawned';
        atSeconds: number;
        entity: BladeDefenseEntitySnapshot;
    }>
    | Readonly<{
        type: 'entity-hit';
        atSeconds: number;
        entityId: string;
        entityKind: BladeDefenseEntityKind;
        petId: string;
        bladeIndex: number;
        damage: number;
        remainingHp: number;
    }>
    | Readonly<{
        type: 'entity-defeated';
        atSeconds: number;
        entityId: string;
        entityKind: BladeDefenseEntityKind;
        scoreAwarded: number;
        score: number;
    }>
    | Readonly<{
        type: 'entity-escaped';
        atSeconds: number;
        entityId: string;
        lifeDamage: number;
    }>
    | Readonly<{
        type: 'life-lost';
        atSeconds: number;
        amount: number;
        lives: number;
    }>
    | Readonly<{
        type: 'pet-awarded';
        atSeconds: number;
        source: 'chest' | 'pending';
        level: number;
        queued: boolean;
        petId?: string;
        slotIndex?: number;
    }>
    | Readonly<{
        type: 'pet-merged';
        atSeconds: number;
        mode: 'normal' | 'safe' | 'bonus-success';
        petId: string;
        consumedPetId: string;
        sourceLevel: number;
        resultLevel: number;
        slotIndex: number;
    }>
    | Readonly<{
        type: 'pet-moved';
        atSeconds: number;
        petId: string;
        fromSlot: number;
        toSlot: number;
    }>
    | Readonly<{
        type: 'pets-swapped';
        atSeconds: number;
        firstPetId: string;
        firstFromSlot: number;
        firstToSlot: number;
        secondPetId: string;
        secondFromSlot: number;
        secondToSlot: number;
    }>
    | Readonly<{
        type: 'bonus-offered';
        atSeconds: number;
        offer: BladeDefenseBonusOfferSnapshot;
    }>
    | Readonly<{
        type: 'bonus-resolved';
        atSeconds: number;
        offerId: string;
        decision: BladeDefenseBonusDecision;
        success: boolean;
        sourceLevel: number;
        resultLevel: number;
    }>
    | Readonly<{
        type: 'game-over';
        atSeconds: number;
        wave: number;
        score: number;
    }>;

export interface BladeDefenseEnemySpawnOptions {
    readonly progress?: number;
    readonly hp?: number;
    readonly speed?: number;
    readonly lifeDamage?: number;
    readonly scoreValue?: number;
    readonly wave?: number;
}

export interface BladeDefenseChestSpawnOptions {
    readonly progress?: number;
    readonly hp?: number;
    readonly rewardLevel?: number;
    readonly scoreValue?: number;
    readonly wave?: number;
}

export type BladeDefenseMergeRejectionReason =
    | 'game-over'
    | 'bonus-pending'
    | 'invalid-slot'
    | 'same-slot'
    | 'empty-slot'
    | 'different-levels'
    | 'max-level';

export type BladeDefenseMoveResult =
    | Readonly<{
        outcome: 'rejected';
        reason:
            | 'game-over'
            | 'bonus-pending'
            | 'invalid-slot'
            | 'same-slot'
            | 'empty-source'
            | 'same-level-target';
    }>
    | Readonly<{
        outcome: 'moved';
        fromSlot: number;
        toSlot: number;
        pet: BladeDefensePetSnapshot;
    }>
    | Readonly<{
        outcome: 'swapped';
        fromSlot: number;
        toSlot: number;
        pet: BladeDefensePetSnapshot;
        displacedPet: BladeDefensePetSnapshot;
    }>;

export type BladeDefenseMergeResult =
    | Readonly<{
        outcome: 'rejected';
        reason: BladeDefenseMergeRejectionReason;
    }>
    | Readonly<{
        outcome: 'merged';
        sourceLevel: number;
        resultLevel: number;
        pet: BladeDefensePetSnapshot;
    }>
    | Readonly<{
        outcome: 'bonus-offered';
        offer: BladeDefenseBonusOfferSnapshot;
    }>;

export type BladeDefenseBonusResolution =
    | Readonly<{
        outcome: 'rejected';
        reason: 'no-offer' | 'invalid-choice';
    }>
    | Readonly<{
        outcome: 'safe-merge' | 'bonus-success' | 'bonus-failed';
        decision: BladeDefenseBonusDecision;
        sourceLevel: number;
        resultLevel: number;
        pet: BladeDefensePetSnapshot;
    }>;

interface MutablePet {
    readonly id: string;
    slotIndex: number;
    level: number;
    rotation: number;
}

interface MutableEntity {
    readonly id: string;
    readonly kind: BladeDefenseEntityKind;
    progress: number;
    hp: number;
    readonly maxHp: number;
    readonly speed: number;
    readonly radius: number;
    readonly scoreValue: number;
    readonly lifeDamage?: number;
    readonly rewardLevel?: number;
    readonly wave: number;
}

interface ActiveBonusOffer {
    readonly id: string;
    readonly firstSlot: number;
    readonly secondSlot: number;
    readonly sourceLevel: number;
    readonly safeTargetLevel: number;
    readonly choices: readonly BladeDefenseBonusChoiceConfig[];
}

function normalizeAngle(angle: number): number {
    return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function requireFiniteInRange(
    value: number,
    field: string,
    minimum: number,
    maximum: number,
): number {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
    }
    return value;
}

function requirePositiveInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${field} must be a positive integer.`);
    }
    return value;
}

function requireNonNegativeInteger(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer.`);
    }
    return value;
}

function squaredDistance(
    first: Readonly<{ x: number; y: number }>,
    second: Readonly<{ x: number; y: number }>,
): number {
    const deltaX = first.x - second.x;
    const deltaY = first.y - second.y;
    return deltaX * deltaX + deltaY * deltaY;
}

/**
 * Renderer-independent simulation for the rotating-blade tower-defense game.
 * `tick` is the only operation that advances time; pausing is implemented by
 * the outer game component simply not calling it.
 */
export class BladeDefenseModel {
    private random: () => number;
    private currentState: BladeDefenseState = 'running';
    private elapsedSeconds = 0;
    private currentLives: number = BLADE_DEFENSE_RULES.initialLives;
    private currentScore = 0;
    private currentWave = 0;
    private waveActive = false;
    private waveTotalEnemies = 0;
    private waveSpawnedEnemies = 0;
    private enemiesWaitingToSpawn = 0;
    private timeUntilNextSpawn = 0;
    private guaranteedChestDropsRemaining = BLADE_DEFENSE_RULES.guaranteedEarlyChestDrops;
    private petSequence = 0;
    private entitySequence = 0;
    private bonusSequence = 0;
    private readonly petSlots: (MutablePet | undefined)[] = Array(
        BLADE_DEFENSE_RULES.petSlotCount,
    ).fill(undefined);
    private entities: MutableEntity[] = [];
    private pendingPetLevels: number[] = [];
    private activeBonus?: ActiveBonusOffer;
    private readonly lastBladeHits = new Map<string, number>();
    private pendingEvents: BladeDefenseEvent[] = [];
    private tickEventSink?: BladeDefenseEvent[];

    constructor(random: () => number = Math.random) {
        this.random = random;
        this.reset();
    }

    get snapshot(): BladeDefenseSnapshot {
        const petSlots = this.petSlots.map((pet) => (
            pet ? this.createPetSnapshot(pet) : null
        ));
        const entities = this.entities.map((entity) => (
            this.createEntitySnapshot(entity)
        ));

        return Object.freeze({
            state: this.currentState,
            elapsedSeconds: this.elapsedSeconds,
            lives: this.currentLives,
            score: this.currentScore,
            petSlots: Object.freeze(petSlots),
            entities: Object.freeze(entities),
            pendingPetLevels: Object.freeze([...this.pendingPetLevels]),
            ...(this.activeBonus
                ? { bonusOffer: this.createBonusOfferSnapshot(this.activeBonus) }
                : {}),
            wave: Object.freeze({
                number: this.currentWave,
                active: this.waveActive,
                totalEnemies: this.waveTotalEnemies,
                spawnedEnemies: this.waveSpawnedEnemies,
                enemiesWaitingToSpawn: this.enemiesWaitingToSpawn,
                timeUntilNextSpawn: this.timeUntilNextSpawn,
            }),
        });
    }

    setRandomSource(random: () => number): void {
        this.random = random;
    }

    reset(): BladeDefenseSnapshot {
        this.currentState = 'running';
        this.elapsedSeconds = 0;
        this.currentLives = BLADE_DEFENSE_RULES.initialLives;
        this.currentScore = 0;
        this.currentWave = 0;
        this.waveActive = false;
        this.waveTotalEnemies = 0;
        this.waveSpawnedEnemies = 0;
        this.enemiesWaitingToSpawn = 0;
        this.timeUntilNextSpawn = 0;
        this.guaranteedChestDropsRemaining = BLADE_DEFENSE_RULES.guaranteedEarlyChestDrops;
        this.petSequence = 0;
        this.entitySequence = 0;
        this.bonusSequence = 0;
        this.entities = [];
        this.pendingPetLevels = [];
        this.activeBonus = undefined;
        this.lastBladeHits.clear();
        this.pendingEvents = [];
        this.petSlots.fill(undefined);

        const initialPet = this.createPet(1, 0);
        this.petSlots[0] = initialPet;
        this.emit(Object.freeze({
            type: 'round-reset',
            atSeconds: 0,
            lives: this.currentLives,
            initialPetId: initialPet.id,
        }));
        return this.snapshot;
    }

    /** Starts a wave and immediately spawns its first enemy. */
    startNextWave(): boolean {
        if (this.currentState === 'game-over'
            || this.waveActive
            || this.entities.some((entity) => entity.kind === 'enemy')) {
            return false;
        }

        this.currentWave += 1;
        this.waveTotalEnemies = BLADE_DEFENSE_RULES.baseWaveEnemyCount
            + (this.currentWave - 1) * BLADE_DEFENSE_RULES.enemiesAddedPerWave;
        this.waveSpawnedEnemies = 0;
        this.enemiesWaitingToSpawn = this.waveTotalEnemies;
        this.timeUntilNextSpawn = 0;
        this.waveActive = true;
        this.emit(Object.freeze({
            type: 'wave-started',
            atSeconds: this.elapsedSeconds,
            wave: this.currentWave,
            enemyCount: this.waveTotalEnemies,
        }));
        this.spawnScheduledEnemy();
        return true;
    }

    spawnEnemy(
        options: BladeDefenseEnemySpawnOptions = {},
    ): BladeDefenseEntitySnapshot {
        this.requireRunning();
        const wave = requireNonNegativeInteger(
            options.wave ?? this.currentWave,
            'enemy wave',
        );
        const hp = requirePositiveInteger(
            options.hp ?? this.enemyHpForWave(wave),
            'enemy hp',
        );
        const progress = requireFiniteInRange(
            options.progress ?? 0,
            'enemy progress',
            0,
            0.999999999,
        );
        const speed = requireFiniteInRange(
            options.speed ?? this.enemySpeedForWave(wave),
            'enemy speed',
            0,
            1,
        );
        const lifeDamage = requirePositiveInteger(
            options.lifeDamage ?? 1,
            'enemy life damage',
        );
        const scoreValue = requireNonNegativeInteger(
            options.scoreValue ?? this.enemyScoreForWave(wave),
            'enemy score',
        );
        const entity: MutableEntity = {
            id: `enemy-${++this.entitySequence}`,
            kind: 'enemy',
            progress,
            hp,
            maxHp: hp,
            speed,
            radius: BLADE_DEFENSE_RULES.entityHitRadius,
            scoreValue,
            lifeDamage,
            wave,
        };
        this.entities.push(entity);
        const snapshot = this.createEntitySnapshot(entity);
        this.emit(Object.freeze({
            type: 'entity-spawned',
            atSeconds: this.elapsedSeconds,
            entity: snapshot,
        }));
        return snapshot;
    }

    /** Chests stay fixed at their chosen track progress until destroyed. */
    spawnChest(
        options: BladeDefenseChestSpawnOptions = {},
    ): BladeDefenseEntitySnapshot {
        this.requireRunning();
        const wave = requireNonNegativeInteger(
            options.wave ?? this.currentWave,
            'chest wave',
        );
        const hp = requirePositiveInteger(
            options.hp ?? this.chestHpForWave(wave),
            'chest hp',
        );
        const progress = requireFiniteInRange(
            options.progress ?? this.roll(),
            'chest progress',
            0,
            0.999999999,
        );
        const rewardLevel = options.rewardLevel ?? this.chestRewardLevelForWave(wave);
        getBladeDefensePetConfig(rewardLevel);
        const scoreValue = requireNonNegativeInteger(
            options.scoreValue ?? BLADE_DEFENSE_RULES.chestScore,
            'chest score',
        );
        const entity: MutableEntity = {
            id: `chest-${++this.entitySequence}`,
            kind: 'chest',
            progress,
            hp,
            maxHp: hp,
            speed: 0,
            radius: BLADE_DEFENSE_RULES.entityHitRadius,
            scoreValue,
            rewardLevel,
            wave,
        };
        this.entities.push(entity);
        const snapshot = this.createEntitySnapshot(entity);
        this.emit(Object.freeze({
            type: 'entity-spawned',
            atSeconds: this.elapsedSeconds,
            entity: snapshot,
        }));
        return snapshot;
    }

    /**
     * Advances the deterministic simulation. A single large delta is split
     * into fixed upper-bounded substeps so fast blades do not tunnel through
     * targets between rendered frames.
     */
    tick(deltaSeconds: number): readonly BladeDefenseEvent[] {
        requireFiniteInRange(
            deltaSeconds,
            'tick delta',
            0,
            MAX_TICK_SECONDS,
        );
        if (deltaSeconds === 0 || this.currentState === 'game-over') {
            return Object.freeze([]);
        }

        const emitted: BladeDefenseEvent[] = [];
        this.tickEventSink = emitted;
        let remaining = deltaSeconds;

        try {
            while (remaining > 1e-9 && this.currentState === 'running') {
                const step = Math.min(
                    remaining,
                    BLADE_DEFENSE_RULES.maxSimulationStepSeconds,
                );
                this.elapsedSeconds += step;
                this.advanceWaveSpawning(step);
                this.advanceEntities(step);

                if (this.currentState === 'running') {
                    this.rotatePetsAndResolveHits(step);
                    this.resolveWaveCompletion();
                }
                remaining -= step;
            }
        } finally {
            this.tickEventSink = undefined;
        }

        return Object.freeze([...emitted]);
    }

    /**
     * Moves to an empty slot or swaps with a different-level pet. Dropping on
     * a same-level pet is intentionally rejected so the UI can call
     * `mergePets(fromSlot, toSlot)` and enter the bonus flow instead.
     */
    movePet(fromSlot: number, toSlot: number): BladeDefenseMoveResult {
        if (this.currentState === 'game-over') {
            return Object.freeze({ outcome: 'rejected', reason: 'game-over' });
        }
        if (this.activeBonus) {
            return Object.freeze({ outcome: 'rejected', reason: 'bonus-pending' });
        }
        if (!this.isValidSlot(fromSlot) || !this.isValidSlot(toSlot)) {
            return Object.freeze({ outcome: 'rejected', reason: 'invalid-slot' });
        }
        if (fromSlot === toSlot) {
            return Object.freeze({ outcome: 'rejected', reason: 'same-slot' });
        }

        const pet = this.petSlots[fromSlot];
        if (!pet) {
            return Object.freeze({ outcome: 'rejected', reason: 'empty-source' });
        }
        const target = this.petSlots[toSlot];
        if (!target) {
            this.petSlots[fromSlot] = undefined;
            this.petSlots[toSlot] = pet;
            pet.slotIndex = toSlot;
            this.clearCooldownsForPet(pet.id);
            const snapshot = this.createPetSnapshot(pet);
            this.emit(Object.freeze({
                type: 'pet-moved',
                atSeconds: this.elapsedSeconds,
                petId: pet.id,
                fromSlot,
                toSlot,
            }));
            return Object.freeze({
                outcome: 'moved',
                fromSlot,
                toSlot,
                pet: snapshot,
            });
        }

        if (target.level === pet.level) {
            return Object.freeze({
                outcome: 'rejected',
                reason: 'same-level-target',
            });
        }

        this.petSlots[fromSlot] = target;
        this.petSlots[toSlot] = pet;
        pet.slotIndex = toSlot;
        target.slotIndex = fromSlot;
        this.clearCooldownsForPet(pet.id);
        this.clearCooldownsForPet(target.id);
        const snapshot = this.createPetSnapshot(pet);
        const displacedPet = this.createPetSnapshot(target);
        this.emit(Object.freeze({
            type: 'pets-swapped',
            atSeconds: this.elapsedSeconds,
            firstPetId: pet.id,
            firstFromSlot: fromSlot,
            firstToSlot: toSlot,
            secondPetId: target.id,
            secondFromSlot: toSlot,
            secondToSlot: fromSlot,
        }));
        return Object.freeze({
            outcome: 'swapped',
            fromSlot,
            toSlot,
            pet: snapshot,
            displacedPet,
        });
    }

    /** firstSlot is the dragged source; the merged pet remains in secondSlot. */
    mergePets(firstSlot: number, secondSlot: number): BladeDefenseMergeResult {
        if (this.currentState === 'game-over') {
            return this.rejectMerge('game-over');
        }
        if (this.activeBonus) {
            return this.rejectMerge('bonus-pending');
        }
        if (!this.isValidSlot(firstSlot) || !this.isValidSlot(secondSlot)) {
            return this.rejectMerge('invalid-slot');
        }
        if (firstSlot === secondSlot) {
            return this.rejectMerge('same-slot');
        }

        const source = this.petSlots[firstSlot];
        const target = this.petSlots[secondSlot];
        if (!source || !target) {
            return this.rejectMerge('empty-slot');
        }
        if (source.level !== target.level) {
            return this.rejectMerge('different-levels');
        }
        if (source.level >= BLADE_DEFENSE_MAX_PET_LEVEL) {
            return this.rejectMerge('max-level');
        }

        const sourceLevel = source.level;
        const bonusChoices = getAvailableBladeDefenseBonusChoices(sourceLevel);
        if (bonusChoices.length > 0
            && this.roll() < BLADE_DEFENSE_RULES.bonusOfferChance) {
            const offer: ActiveBonusOffer = {
                id: `bonus-${++this.bonusSequence}`,
                firstSlot,
                secondSlot,
                sourceLevel,
                safeTargetLevel: sourceLevel + 1,
                choices: bonusChoices,
            };
            this.activeBonus = offer;
            const snapshot = this.createBonusOfferSnapshot(offer);
            this.emit(Object.freeze({
                type: 'bonus-offered',
                atSeconds: this.elapsedSeconds,
                offer: snapshot,
            }));
            return Object.freeze({ outcome: 'bonus-offered', offer: snapshot });
        }

        const pet = this.completeMerge(
            source,
            target,
            sourceLevel + 1,
            'normal',
        );
        return Object.freeze({
            outcome: 'merged',
            sourceLevel,
            resultLevel: sourceLevel + 1,
            pet,
        });
    }

    resolveBonusOffer(
        decision: BladeDefenseBonusDecision,
    ): BladeDefenseBonusResolution {
        const offer = this.activeBonus;
        if (!offer) {
            return Object.freeze({ outcome: 'rejected', reason: 'no-offer' });
        }

        const source = this.petSlots[offer.firstSlot];
        const target = this.petSlots[offer.secondSlot];
        if (!source || !target
            || source.level !== offer.sourceLevel
            || target.level !== offer.sourceLevel) {
            throw new Error(`Bonus offer "${offer.id}" pet pair is no longer valid.`);
        }

        if (decision === 'safe') {
            this.activeBonus = undefined;
            const pet = this.completeMerge(
                source,
                target,
                offer.safeTargetLevel,
                'safe',
            );
            this.emit(Object.freeze({
                type: 'bonus-resolved',
                atSeconds: this.elapsedSeconds,
                offerId: offer.id,
                decision,
                success: true,
                sourceLevel: offer.sourceLevel,
                resultLevel: offer.safeTargetLevel,
            }));
            return Object.freeze({
                outcome: 'safe-merge',
                decision,
                sourceLevel: offer.sourceLevel,
                resultLevel: offer.safeTargetLevel,
                pet,
            });
        }

        const choice = offer.choices.find((candidate) => candidate.id === decision);
        if (!choice) {
            return Object.freeze({ outcome: 'rejected', reason: 'invalid-choice' });
        }

        this.activeBonus = undefined;
        const success = this.roll() < choice.successChance;
        const targetLevel = offer.sourceLevel + choice.levelDelta;
        let pet: BladeDefensePetSnapshot;

        if (success) {
            pet = this.completeMerge(
                source,
                target,
                targetLevel,
                'bonus-success',
            );
        } else {
            this.petSlots[offer.firstSlot] = undefined;
            this.clearCooldownsForPet(source.id);
            pet = this.createPetSnapshot(target);
        }

        this.emit(Object.freeze({
            type: 'bonus-resolved',
            atSeconds: this.elapsedSeconds,
            offerId: offer.id,
            decision,
            success,
            sourceLevel: offer.sourceLevel,
            resultLevel: success ? targetLevel : offer.sourceLevel,
        }));
        return Object.freeze({
            outcome: success ? 'bonus-success' : 'bonus-failed',
            decision,
            sourceLevel: offer.sourceLevel,
            resultLevel: success ? targetLevel : offer.sourceLevel,
            pet,
        });
    }

    /** Claims queued chest rewards after the UI/player has freed pet slots. */
    claimPendingPets(): readonly BladeDefensePetSnapshot[] {
        if (this.currentState === 'game-over') {
            return Object.freeze([]);
        }

        const claimed: BladeDefensePetSnapshot[] = [];
        while (this.pendingPetLevels.length > 0) {
            const slotIndex = this.petSlots.findIndex((pet) => pet === undefined);
            if (slotIndex < 0) break;
            const level = this.pendingPetLevels.shift()!;
            const pet = this.createPet(level, slotIndex);
            this.petSlots[slotIndex] = pet;
            const snapshot = this.createPetSnapshot(pet);
            claimed.push(snapshot);
            this.emit(Object.freeze({
                type: 'pet-awarded',
                atSeconds: this.elapsedSeconds,
                source: 'pending',
                level,
                queued: false,
                petId: pet.id,
                slotIndex,
            }));
        }
        return Object.freeze(claimed);
    }

    drainEvents(): readonly BladeDefenseEvent[] {
        const events = Object.freeze([...this.pendingEvents]);
        this.pendingEvents = [];
        return events;
    }

    private advanceWaveSpawning(deltaSeconds: number): void {
        if (!this.waveActive || this.enemiesWaitingToSpawn <= 0) {
            return;
        }

        this.timeUntilNextSpawn -= deltaSeconds;
        while (this.timeUntilNextSpawn <= 1e-9
            && this.enemiesWaitingToSpawn > 0) {
            this.spawnScheduledEnemy();
        }
    }

    private spawnScheduledEnemy(): void {
        if (this.enemiesWaitingToSpawn <= 0) return;
        this.spawnEnemy({ wave: this.currentWave });
        this.enemiesWaitingToSpawn -= 1;
        this.waveSpawnedEnemies += 1;
        this.timeUntilNextSpawn = this.enemiesWaitingToSpawn > 0
            ? this.timeUntilNextSpawn + BLADE_DEFENSE_RULES.waveSpawnIntervalSeconds
            : 0;
    }

    private advanceEntities(deltaSeconds: number): void {
        const escaped: MutableEntity[] = [];
        for (const entity of this.entities) {
            if (entity.kind !== 'enemy') continue;
            entity.progress += entity.speed * deltaSeconds;
            if (entity.progress >= 1) escaped.push(entity);
        }

        for (const entity of escaped) {
            this.removeEntity(entity);
            if (this.currentState === 'game-over') continue;
            const lifeDamage = entity.lifeDamage ?? 1;
            this.emit(Object.freeze({
                type: 'entity-escaped',
                atSeconds: this.elapsedSeconds,
                entityId: entity.id,
                lifeDamage,
            }));
            this.damageBase(lifeDamage);
        }
    }

    private rotatePetsAndResolveHits(deltaSeconds: number): void {
        for (const pet of this.petSlots) {
            if (!pet) continue;
            const config = getBladeDefensePetConfig(pet.level);
            pet.rotation = normalizeAngle(
                pet.rotation + config.spinSpeed * deltaSeconds,
            );
        }

        const targets = [...this.entities];
        for (const pet of this.petSlots) {
            if (!pet) continue;
            const config = getBladeDefensePetConfig(pet.level);
            const slotPosition = getBladeDefensePetSlotPosition(pet.slotIndex);

            for (let bladeIndex = 0; bladeIndex < config.bladeCount; bladeIndex += 1) {
                const bladeAngle = pet.rotation
                    + bladeIndex / config.bladeCount * TWO_PI;
                const bladePoint = {
                    x: slotPosition.x + Math.cos(bladeAngle) * config.bladeOrbitRadius,
                    y: slotPosition.y + Math.sin(bladeAngle) * config.bladeOrbitRadius,
                };

                for (const target of targets) {
                    if (target.hp <= 0 || !this.entities.includes(target)) continue;
                    const targetPoint = pointOnBladeDefenseTrack(target.progress);
                    const hitDistance = config.bladeHitRadius + target.radius;
                    if (squaredDistance(bladePoint, targetPoint) > hitDistance * hitDistance) {
                        continue;
                    }

                    const cooldownKey = `${pet.id}:${bladeIndex}:${target.id}`;
                    const lastHit = this.lastBladeHits.get(cooldownKey) ?? -Infinity;
                    if (this.elapsedSeconds - lastHit + 1e-9
                        < config.hitCooldownSeconds) {
                        continue;
                    }

                    this.lastBladeHits.set(cooldownKey, this.elapsedSeconds);
                    target.hp = Math.max(0, target.hp - config.damage);
                    this.emit(Object.freeze({
                        type: 'entity-hit',
                        atSeconds: this.elapsedSeconds,
                        entityId: target.id,
                        entityKind: target.kind,
                        petId: pet.id,
                        bladeIndex,
                        damage: config.damage,
                        remainingHp: target.hp,
                    }));

                    if (target.hp === 0) {
                        this.resolveEntityDefeat(target);
                    }
                }
            }
        }
    }

    private resolveEntityDefeat(entity: MutableEntity): void {
        this.removeEntity(entity);
        this.currentScore += entity.scoreValue;
        this.emit(Object.freeze({
            type: 'entity-defeated',
            atSeconds: this.elapsedSeconds,
            entityId: entity.id,
            entityKind: entity.kind,
            scoreAwarded: entity.scoreValue,
            score: this.currentScore,
        }));

        if (entity.kind === 'chest') {
            this.awardPet(entity.rewardLevel ?? 1);
            return;
        }

        const guaranteedDrop = this.guaranteedChestDropsRemaining > 0;
        if (guaranteedDrop) {
            this.guaranteedChestDropsRemaining -= 1;
        }
        if (guaranteedDrop
            || this.roll() < BLADE_DEFENSE_RULES.chestDropChancePerEnemy) {
            this.spawnChest({
                progress: Math.min(0.999999999, entity.progress),
                wave: entity.wave,
            });
        }
    }

    private awardPet(level: number): void {
        getBladeDefensePetConfig(level);
        const slotIndex = this.petSlots.findIndex((pet) => pet === undefined);

        if (slotIndex < 0) {
            this.pendingPetLevels.push(level);
            this.emit(Object.freeze({
                type: 'pet-awarded',
                atSeconds: this.elapsedSeconds,
                source: 'chest',
                level,
                queued: true,
            }));
            return;
        }

        const pet = this.createPet(level, slotIndex);
        this.petSlots[slotIndex] = pet;
        this.emit(Object.freeze({
            type: 'pet-awarded',
            atSeconds: this.elapsedSeconds,
            source: 'chest',
            level,
            queued: false,
            petId: pet.id,
            slotIndex,
        }));
    }

    private damageBase(amount: number): void {
        this.currentLives = Math.max(0, this.currentLives - amount);
        this.emit(Object.freeze({
            type: 'life-lost',
            atSeconds: this.elapsedSeconds,
            amount,
            lives: this.currentLives,
        }));

        if (this.currentLives > 0) return;
        this.currentState = 'game-over';
        this.waveActive = false;
        this.enemiesWaitingToSpawn = 0;
        this.timeUntilNextSpawn = 0;
        this.emit(Object.freeze({
            type: 'game-over',
            atSeconds: this.elapsedSeconds,
            wave: this.currentWave,
            score: this.currentScore,
        }));
    }

    private resolveWaveCompletion(): void {
        if (!this.waveActive
            || this.enemiesWaitingToSpawn > 0
            || this.entities.some((entity) => entity.kind === 'enemy')) {
            return;
        }

        this.waveActive = false;
        this.timeUntilNextSpawn = 0;
        const scoreAwarded = this.currentWave
            * BLADE_DEFENSE_RULES.waveClearScorePerWave;
        this.currentScore += scoreAwarded;
        this.emit(Object.freeze({
            type: 'wave-completed',
            atSeconds: this.elapsedSeconds,
            wave: this.currentWave,
            scoreAwarded,
            score: this.currentScore,
        }));
    }

    private completeMerge(
        source: MutablePet,
        target: MutablePet,
        targetLevel: number,
        mode: 'normal' | 'safe' | 'bonus-success',
    ): BladeDefensePetSnapshot {
        getBladeDefensePetConfig(targetLevel);
        const sourceLevel = target.level;
        target.level = targetLevel;
        this.petSlots[source.slotIndex] = undefined;
        this.clearCooldownsForPet(source.id);
        this.clearCooldownsForPet(target.id);
        const snapshot = this.createPetSnapshot(target);
        this.emit(Object.freeze({
            type: 'pet-merged',
            atSeconds: this.elapsedSeconds,
            mode,
            petId: target.id,
            consumedPetId: source.id,
            sourceLevel,
            resultLevel: targetLevel,
            slotIndex: target.slotIndex,
        }));
        return snapshot;
    }

    private createPet(level: number, slotIndex: number): MutablePet {
        getBladeDefensePetConfig(level);
        return {
            id: `pet-${++this.petSequence}`,
            slotIndex,
            level,
            rotation: normalizeAngle(getBladeDefensePetSlotFacing(slotIndex)),
        };
    }

    private createPetSnapshot(pet: MutablePet): BladeDefensePetSnapshot {
        const config = getBladeDefensePetConfig(pet.level);
        const position = getBladeDefensePetSlotPosition(pet.slotIndex);
        const blades: BladeDefenseBladeSnapshot[] = [];
        for (let index = 0; index < config.bladeCount; index += 1) {
            const angle = normalizeAngle(
                pet.rotation + index / config.bladeCount * TWO_PI,
            );
            blades.push(Object.freeze({
                index,
                angle,
                x: position.x + Math.cos(angle) * config.bladeOrbitRadius,
                y: position.y + Math.sin(angle) * config.bladeOrbitRadius,
            }));
        }

        return Object.freeze({
            id: pet.id,
            slotIndex: pet.slotIndex,
            level: pet.level,
            damage: config.damage,
            bladeCount: config.bladeCount,
            spinSpeed: config.spinSpeed,
            bladeOrbitRadius: config.bladeOrbitRadius,
            hitCooldownSeconds: config.hitCooldownSeconds,
            rotation: pet.rotation,
            x: position.x,
            y: position.y,
            blades: Object.freeze(blades),
        });
    }

    private createEntitySnapshot(
        entity: MutableEntity,
    ): BladeDefenseEntitySnapshot {
        const position = pointOnBladeDefenseTrack(entity.progress);
        return Object.freeze({
            id: entity.id,
            kind: entity.kind,
            progress: entity.progress,
            hp: entity.hp,
            maxHp: entity.maxHp,
            speed: entity.speed,
            x: position.x,
            y: position.y,
            scoreValue: entity.scoreValue,
            ...(entity.lifeDamage === undefined
                ? {}
                : { lifeDamage: entity.lifeDamage }),
            ...(entity.rewardLevel === undefined
                ? {}
                : { rewardLevel: entity.rewardLevel }),
            wave: entity.wave,
        });
    }

    private createBonusOfferSnapshot(
        offer: ActiveBonusOffer,
    ): BladeDefenseBonusOfferSnapshot {
        return Object.freeze({
            id: offer.id,
            firstSlot: offer.firstSlot,
            secondSlot: offer.secondSlot,
            sourceLevel: offer.sourceLevel,
            safeTargetLevel: offer.safeTargetLevel,
            choices: Object.freeze(offer.choices.map((choice) => Object.freeze({
                id: choice.id,
                targetLevel: offer.sourceLevel + choice.levelDelta,
                successChance: choice.successChance,
            }))),
        });
    }

    private rejectMerge(
        reason: BladeDefenseMergeRejectionReason,
    ): BladeDefenseMergeResult {
        return Object.freeze({ outcome: 'rejected', reason });
    }

    private removeEntity(entity: MutableEntity): void {
        const index = this.entities.indexOf(entity);
        if (index >= 0) this.entities.splice(index, 1);
        const suffix = `:${entity.id}`;
        for (const key of [...this.lastBladeHits.keys()]) {
            if (key.endsWith(suffix)) this.lastBladeHits.delete(key);
        }
    }

    private clearCooldownsForPet(petId: string): void {
        const prefix = `${petId}:`;
        for (const key of [...this.lastBladeHits.keys()]) {
            if (key.startsWith(prefix)) this.lastBladeHits.delete(key);
        }
    }

    private enemyHpForWave(wave: number): number {
        const waveIndex = Math.max(0, wave - 1);
        return BLADE_DEFENSE_RULES.baseEnemyHp
            + waveIndex * BLADE_DEFENSE_RULES.enemyHpPerWave;
    }

    private enemySpeedForWave(wave: number): number {
        const waveIndex = Math.max(0, wave - 1);
        return Math.min(
            0.16,
            BLADE_DEFENSE_RULES.baseEnemySpeed
                + waveIndex * BLADE_DEFENSE_RULES.enemySpeedPerWave,
        );
    }

    private enemyScoreForWave(wave: number): number {
        const waveIndex = Math.max(0, wave - 1);
        return BLADE_DEFENSE_RULES.baseEnemyScore
            + waveIndex * BLADE_DEFENSE_RULES.enemyScorePerWave;
    }

    private chestHpForWave(wave: number): number {
        const waveIndex = Math.max(0, wave - 1);
        return BLADE_DEFENSE_RULES.baseChestHp
            + waveIndex * BLADE_DEFENSE_RULES.chestHpPerWave;
    }

    private chestRewardLevelForWave(wave: number): number {
        return Math.min(
            BLADE_DEFENSE_MAX_PET_LEVEL,
            1 + Math.floor(Math.max(0, wave - 1) / 3),
        );
    }

    private isValidSlot(slotIndex: number): boolean {
        return Number.isInteger(slotIndex)
            && slotIndex >= 0
            && slotIndex < BLADE_DEFENSE_RULES.petSlotCount;
    }

    private roll(): number {
        const value = this.random();
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.min(0.999999999, value));
    }

    private requireRunning(): void {
        if (this.currentState === 'game-over') {
            throw new Error('Cannot mutate a finished blade-defense round.');
        }
    }

    private emit(event: BladeDefenseEvent): void {
        this.pendingEvents.push(event);
        if (this.pendingEvents.length > MAX_QUEUED_EVENTS) {
            this.pendingEvents.shift();
        }
        this.tickEventSink?.push(event);
    }
}
