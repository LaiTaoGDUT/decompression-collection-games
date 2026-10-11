import type { DoodleJumpFixedPlatformConfig, DoodleJumpGameplayConfig, DoodleJumpItemType } from './DoodleJumpConfig';
import { DoodleJumpRandomStreams } from './DoodleJumpRandom';
import {
    DOODLE_JUMP_REFERENCE_PATTERNS, DOODLE_JUMP_EARLY_PATTERN_IDS, DOODLE_JUMP_LATE_PATTERN_IDS,
    DOODLE_JUMP_REFERENCE_WIDTH, DOODLE_JUMP_PATTERN_UNLOCK_HEIGHT, DOODLE_JUMP_LATE_PATTERN_HEIGHT,
    REFERENCE_BONUS_TYPES, referenceEnemyType, referenceEnemyOffset, referenceBonusOffset,
    referenceBearTrapChance, referenceJetpackBonus, referencePatternShieldChance,
    referenceMovingSpeed, referencePlatformGap, referencePlatformType,
    type DoodleJumpGenerationContext, type DoodleJumpGenerationState,
    type DoodleJumpPlannedPlatform, type DoodleJumpSpawnPlan,
} from './DoodleJumpReferenceRules';

/** Owns native pattern decks, height schedules and entity tickets. Entity systems never re-roll them. */
export class DoodleJumpLevelGenerator {
    private segmentId = 0;
    private previousRawType = 0;
    private previousBonusKind = -1;
    private previousPlatformY = 0;
    private nextJetpackHeight = 0;
    private nextPropellerHeight = 0;
    private earlyPatternOrder: number[] = [];
    private latePatternOrder: number[] = [];
    private earlyPatternCursor = 0;
    private latePatternCursor = 0;
    private patternRetryPending = false;
    private boostClearanceHeight = 0;
    private patternCheckedInPass?: boolean;
    private readonly pending: DoodleJumpPlannedPlatform[] = [];

    constructor(private readonly config: DoodleJumpGameplayConfig, private readonly random: DoodleJumpRandomStreams) {}

    reset(): void {
        this.segmentId = 0; this.previousRawType = 0; this.previousBonusKind = -1;
        this.previousPlatformY = 0; this.pending.length = 0;
        this.patternRetryPending = false; this.boostClearanceHeight = 0;
        this.patternCheckedInPass = undefined;
        this.earlyPatternCursor = 0; this.latePatternCursor = 0;
        // FUN_003f0090 shuffles each deck once. Wrapping a cursor does NOT reshuffle it.
        this.earlyPatternOrder = this.shuffle(DOODLE_JUMP_EARLY_PATTERN_IDS);
        this.latePatternOrder = this.shuffle(DOODLE_JUMP_LATE_PATTERN_IDS);
        // +0x7438 schedules hats; +0x7434 schedules jetpacks, despite the enum order.
        this.nextPropellerHeight = this.integer(1000, 3000, 'item');
        this.nextJetpackHeight = this.integer(this.nextPropellerHeight, 12000, 'item');
        if (this.nextJetpackHeight > this.nextPropellerHeight
            && this.nextJetpackHeight < this.nextPropellerHeight + 2000) this.nextJetpackHeight += 2000;
    }

    /** FUN_003fbdfc tests pattern entry once when replenishing the top of the world. */
    beginGenerationPass(): void {
        if (this.nextJetpackHeight === 0) this.reset();
        this.patternCheckedInPass = this.pending.length > 0;
    }

    getSnapshot(): DoodleJumpGenerationState {
        return Object.freeze({ segmentId: this.segmentId, previousRawType: this.previousRawType,
            previousBonusKind: this.previousBonusKind, previousPlatformY: this.previousPlatformY,
            nextJetpackHeight: this.nextJetpackHeight, nextPropellerHeight: this.nextPropellerHeight,
            earlyPatternOrder: Object.freeze(this.earlyPatternOrder.slice()),
            latePatternOrder: Object.freeze(this.latePatternOrder.slice()),
            earlyPatternCursor: this.earlyPatternCursor, latePatternCursor: this.latePatternCursor,
            patternRetryPending: this.patternRetryPending, boostClearanceHeight: this.boostClearanceHeight,
            pending: Object.freeze(this.pending.map((row) => Object.freeze({ ...row, spawnPlan: Object.freeze({ ...row.spawnPlan }) }))),
        });
    }

    restore(state: DoodleJumpGenerationState): void {
        const validDeck = (order: readonly number[], source: readonly number[], cursor: number): boolean =>
            Array.isArray(order) && order.length === source.length && new Set(order).size === source.length
            && order.every((id) => source.indexOf(id) >= 0) && Number.isInteger(cursor) && cursor >= 0 && cursor < source.length;
        if (!state || !Number.isInteger(state.segmentId) || state.segmentId < 0
            || !Number.isInteger(state.previousRawType) || !Number.isInteger(state.previousBonusKind)
            || !Number.isFinite(state.previousPlatformY) || !Number.isFinite(state.boostClearanceHeight)
            || typeof state.patternRetryPending !== 'boolean'
            || !Number.isFinite(state.nextJetpackHeight) || state.nextJetpackHeight <= 0
            || !Number.isFinite(state.nextPropellerHeight) || state.nextPropellerHeight <= 0
            || !validDeck(state.earlyPatternOrder, DOODLE_JUMP_EARLY_PATTERN_IDS, state.earlyPatternCursor)
            || !validDeck(state.latePatternOrder, DOODLE_JUMP_LATE_PATTERN_IDS, state.latePatternCursor)
            || !Array.isArray(state.pending) || state.pending.length > 50) throw new Error('Invalid level-generator state.');
        state.pending.forEach((row) => {
            if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || !row.spawnPlan
                || row.spawnPlan.segmentId !== state.segmentId || !Number.isInteger(row.rawType)) throw new Error('Invalid pending source pattern.');
        });
        this.segmentId = state.segmentId; this.previousRawType = state.previousRawType;
        this.previousBonusKind = state.previousBonusKind; this.previousPlatformY = state.previousPlatformY;
        this.nextJetpackHeight = state.nextJetpackHeight; this.nextPropellerHeight = state.nextPropellerHeight;
        this.earlyPatternOrder = state.earlyPatternOrder.slice(); this.latePatternOrder = state.latePatternOrder.slice();
        this.earlyPatternCursor = state.earlyPatternCursor; this.latePatternCursor = state.latePatternCursor;
        this.patternRetryPending = state.patternRetryPending; this.boostClearanceHeight = state.boostClearanceHeight;
        this.patternCheckedInPass = undefined; this.pending.length = 0;
        state.pending.forEach((row) => this.pending.push(Object.freeze({ ...row, spawnPlan: Object.freeze({ ...row.spawnPlan }) })));
    }

    next(previousY: number, climbY: number, context: DoodleJumpGenerationContext = {}): DoodleJumpPlannedPlatform {
        if (this.nextJetpackHeight === 0) this.reset();
        const scale = this.config.design.width / DOODLE_JUMP_REFERENCE_WIDTH;
        const height = Math.max(0, climbY / scale);
        if (this.pending.length === 0) this.prepare(this.previousPlatformY || previousY, height, scale, context);
        return this.pending.shift()!;
    }

    /** Commit the accepted layout before requesting another row. Safety checks can change its height/type. */
    acceptPlacement(platform: DoodleJumpFixedPlatformConfig): void {
        const plan = platform.spawnPlan;
        if (!plan || plan.entityOnly) return;
        const rawType = plan.referenceRawType ?? 0;
        this.previousPlatformY = platform.y;
        this.previousRawType = platform.type === referencePlatformType(rawType) ? rawType
            : platform.type === 'breakable' ? 2 : platform.type === 'moving' ? 1 : 0;
        // Raw 23 attaches shoes, but the native PLATFORM records bonus kind 0 for spacing.
        this.previousBonusKind = rawType === 23 ? 0 : plan.itemType
            ? REFERENCE_BONUS_TYPES.indexOf(plan.itemType) : plan.hazardType === 'bear-trap' ? 100 : -1;
        if (plan.patternId === undefined && (plan.itemType === 'spring' || plan.itemType === 'trampoline')) {
            const scale = this.config.design.width / DOODLE_JUMP_REFERENCE_WIDTH;
            this.boostClearanceHeight = Math.max(this.boostClearanceHeight,
                platform.y / scale + (plan.itemType === 'trampoline' ? 150 : 50));
        }
    }

    private prepare(previousY: number, height: number, scale: number, context: DoodleJumpGenerationContext): void {
        this.segmentId += 1;
        if (this.config.generation.platformTypeOverride === 'auto' && this.patternCheckedInPass !== true) {
            if (this.patternCheckedInPass !== undefined) this.patternCheckedInPass = true;
            if (height > DOODLE_JUMP_PATTERN_UNLOCK_HEIGHT && (this.patternRetryPending || this.integer(0, 18, 'platform') === 9)
                && context.flightPower !== 'jetpack' && context.flightPower !== 'rocket') {
                if (height <= this.boostClearanceHeight || this.previousRawType === 2) {
                    this.patternRetryPending = true;
                } else {
                    this.patternRetryPending = false;
                    this.preparePattern(previousY, height, scale, context);
                    return;
                }
            }
        }
        this.prepareProcedural(previousY, height, scale, context);
    }

    private preparePattern(previousY: number, height: number, scale: number, context: DoodleJumpGenerationContext): void {
        const late = height >= DOODLE_JUMP_LATE_PATTERN_HEIGHT;
        const order = late ? this.latePatternOrder : this.earlyPatternOrder;
        let pattern: typeof DOODLE_JUMP_REFERENCE_PATTERNS[number];
        let selectedCursor: number;
        do {
            const cursor = late ? this.latePatternCursor : this.earlyPatternCursor;
            selectedCursor = cursor;
            pattern = DOODLE_JUMP_REFERENCE_PATTERNS.find((entry) => entry.id === order[cursor])!;
            if (late) this.latePatternCursor = (cursor + 1) % order.length;
            else this.earlyPatternCursor = (cursor + 1) % order.length;
            // Native active state 2 is the hat. Only the late deck skips group 6.
        } while (late && context.flightPower === 'propeller-hat' && pattern.group === 6);
        const bonusGap = this.previousBonusKind === 2 ? 60 : this.previousBonusKind === 3 ? 20
            : this.previousBonusKind === 7 ? 112 : this.previousBonusKind === 100 ? 20 : 0;
        const baseline = previousY + (10 + bonusGap) * scale;
        if (context.flightLandingWindow && !this.patternSupportsFlightLanding(pattern, baseline, previousY,
            scale, context.flightLandingWindow)) {
            // Flying skips spring/shoe pickups. A power-dependent gap that
            // contains the predicted apex therefore cannot be traversed on
            // descent. Keep this deck entry for after the flight and fill the
            // current pass procedurally from the accepted platform origin.
            if (late) this.latePatternCursor = selectedCursor;
            else this.earlyPatternCursor = selectedCursor;
            this.patternRetryPending = true;
            this.prepareProcedural(previousY, height, scale, context);
            return;
        }
        let shieldPending = this.config.items.enabled && pattern.monsterSlots > 0 && !context.shieldActive
            && context.flightPower !== 'propeller-hat'
            && this.integer(0, 100, 'item') < referencePatternShieldChance(height) * 100;
        let portalActive = false;
        pattern.entries.forEach(([rawType, x, dy]) => {
            let plan: DoodleJumpSpawnPlan = { segmentId: this.segmentId, patternId: pattern.id, referenceRawType: rawType };
            const enemyType = referenceEnemyType(rawType);
            if (rawType === 20 || rawType === 21) plan = { ...plan, entityOnly: true };
            else if (rawType === 4 || rawType === 5) plan = { ...plan, content: 'hazard', hazardType: rawType === 4 ? 'black-hole' : 'ufo', entityOnly: true };
            else if (enemyType) {
                const [offsetX, offsetY] = referenceEnemyOffset(enemyType);
                plan = { ...plan, content: 'enemy', enemyType, enemyOffsetX: offsetX * scale,
                    enemyOffsetY: offsetY * scale, entityOnly: true };
            }
            else if ((rawType === 6 || rawType === 23) && this.config.items.enabled) {
                plan = this.attachItem(plan, rawType === 6 ? 'spring' : 'spring-shoes', scale);
            } else if (rawType === 42 || rawType === 53) {
                plan = { ...plan, initialHidden: portalActive }; portalActive = true;
            } else if (shieldPending && rawType <= 3) {
                plan = this.attachItem(plan, 'shield', scale); shieldPending = false;
            }
            const platformX = rawType === 41 || rawType === 52 ? this.integer(33, 258, 'platform') : x;
            this.pending.push(Object.freeze({ x: platformX * scale, y: baseline + dy * scale, rawType,
                type: referencePlatformType(rawType), spawnPlan: Object.freeze(plan),
                movingVelocity: rawType === 1 ? referenceMovingSpeed(height, this.random.next('platform')) * 60 * scale : undefined }));
        });
        // Preserve table order, including entities with a slightly lower Y than the preceding platform.
    }

    private patternSupportsFlightLanding(
        pattern: typeof DOODLE_JUMP_REFERENCE_PATTERNS[number], baseline: number,
        previousY: number, scale: number, window: Readonly<{ minimumY: number; maximumY: number }>,
    ): boolean {
        let highestExtent = previousY;
        const previousIsStable = this.previousRawType !== 42 && this.previousRawType !== 53
            && (this.previousRawType < 12 || this.previousRawType > 15);
        let hasSurface = previousIsStable && previousY >= window.minimumY && previousY <= window.maximumY;
        let portalActive = false;
        // A mixed relay chunk needs its hidden platforms activated from below.
        // Its monsters can be destroyed by flight contact, so a lone stomp top
        // cannot prove that the rest of this relay still connects after flight.
        const requiresRelayActivation = pattern.entries.some((entry: readonly number[]) => entry[0] === 42 || entry[0] === 53);
        for (let index = 0; index < pattern.entries.length; index += 1) {
            const [rawType, , dy]: readonly number[] = pattern.entries[index];
            const y = baseline + dy * scale;
            // Hidden relay rows and entity carriers still advance the native
            // chunk's extent. They cannot justify treating it as ending below
            // the landing window merely because its first visible row is low.
            highestExtent = Math.max(highestExtent, y);
            if (rawType === 2 || rawType === 4 || rawType === 5 || rawType === 20 || rawType === 21) continue;
            if (rawType === 42 || rawType === 53) {
                if (portalActive) continue;
                portalActive = true;
            }
            const enemyType = referenceEnemyType(rawType);
            if (enemyType && (requiresRelayActivation || !this.config.enemies.enabled)) continue;
            const surfaceY = y + (enemyType
                ? referenceEnemyOffset(enemyType)[1] * scale + this.config.enemies[enemyType].height / 2 : 0);
            highestExtent = Math.max(highestExtent, surfaceY);
            if (rawType >= 12 && rawType <= 15) {
                const range = (rawType <= 13 ? 200 : 130) * scale;
                const minimumY = surfaceY - (rawType % 2 === 1 ? range : 0);
                const maximumY = surfaceY + (rawType % 2 === 0 ? range : 0);
                if (minimumY >= window.minimumY && maximumY <= window.maximumY) hasSurface = true;
                continue;
            }
            if (surfaceY >= window.minimumY && surfaceY <= window.maximumY) hasSurface = true;
        }
        // A chunk that ends below the window leaves room for subsequent rows.
        return hasSurface || highestExtent < window.minimumY;
    }

    private prepareProcedural(previousY: number, height: number, scale: number, context: DoodleJumpGenerationContext): void {
        let rawType = height > 2500 && this.integer(0, 100, 'platform') < height / 400 ? 1 : 0;
        if (this.previousRawType !== 2 && this.integer(0, 100, 'platform') < 20) rawType = 2;
        const y = previousY + referencePlatformGap(height, this.previousRawType, this.random.next('platform'),
            this.previousBonusKind, this.random.next('platform')) * scale;
        const width = this.config.platformBehavior.standardWidth / scale;
        let x = this.integer(0, 320 - Math.floor(width), 'platform') + Math.floor(width / 2);
        let plan: DoodleJumpSpawnPlan = { segmentId: this.segmentId, referenceRawType: rawType };
        let canPlaceTrap = !this.config.items.enabled;
        if (this.config.items.enabled && rawType !== 2) {
            let item: DoodleJumpItemType | undefined;
            const pickupCount = context.jetpackRocketPickupCount ?? 0;
            const mode = context.nativeThemeMode ?? 0;
            if (pickupCount < 3 && height > this.nextJetpackHeight) {
                item = referenceJetpackBonus(mode, height, this.boostClearanceHeight, pickupCount,
                    mode === 16 ? this.integer(0, 100, 'item') : 99);
                if (item === 'rocket') { rawType = 0; x = Math.max(50, Math.min(270, x)); }
                this.nextJetpackHeight += this.integer(10000, 20000, 'item');
                if (this.nextJetpackHeight > this.nextPropellerHeight && this.nextJetpackHeight < this.nextPropellerHeight + 2000) this.nextJetpackHeight += 2000;
            } else if (height > this.nextPropellerHeight) {
                item = 'propeller-hat'; this.nextPropellerHeight += this.integer(10000, 20000, 'item');
                if (this.nextPropellerHeight > this.nextJetpackHeight && this.nextPropellerHeight < this.nextJetpackHeight + 3800) this.nextPropellerHeight += 3800;
            } else if (!this.patternRetryPending && this.integer(0, 100, 'item') > 90) {
                item = rawType === 0 && mode !== 13 && mode !== 15 && this.integer(0, 100, 'item') >= 81
                    && Math.abs(this.nextPropellerHeight - height) > 800 && Math.abs(this.nextJetpackHeight - height) > 800
                    ? 'trampoline' : 'spring';
            } else canPlaceTrap = true;
            if (item) plan = this.attachItem(plan, item, scale);
        }
        const trapChance = referenceBearTrapChance(context.nativeThemeMode ?? 0, height);
        if (canPlaceTrap && this.config.hazards.enabled && rawType <= 1 && trapChance > 0
            && this.random.next('enemy') < trapChance) plan = { ...plan, content: 'hazard', hazardType: 'bear-trap' };
        // FUN_003f5cb4, Bunny mode 6: 20% on an empty normal/moving platform.
        // Keep a separate stream so adding collectibles does not reorder the existing route or power-ups.
        if (canPlaceTrap && this.config.collectibles.enabled && rawType <= 1 && !plan.content
            && this.random.next('collectible') < 0.2) {
            const freeWidth = width - 23;
            const offset = Math.floor(this.random.next('collectible') * Math.max(1, Math.trunc(freeWidth))) - freeWidth / 2;
            plan = { ...plan, collectibleOffsetX: (offset - 0.5) * scale,
                collectibleVariant: Math.floor(this.random.next('collectible') * 8) };
        }
        const override = this.config.generation.platformTypeOverride;
        this.pending.push(Object.freeze({ x: x * scale, y, rawType,
            type: override === 'auto' ? referencePlatformType(rawType) : override,
            spawnPlan: Object.freeze({ ...plan, referenceRawType: rawType }),
            movingVelocity: rawType === 1 ? referenceMovingSpeed(height, this.random.next('platform')) * 60 * scale : undefined }));
    }

    private attachItem(plan: DoodleJumpSpawnPlan, itemType: DoodleJumpItemType, scale: number): DoodleJumpSpawnPlan {
        const [x, y] = referenceBonusOffset(itemType, this.config.platformBehavior.standardWidth / scale, this.random.next('item'));
        return { ...plan, content: 'item', itemType, itemOffsetX: x * scale, itemOffsetY: y * scale };
    }

    private shuffle(ids: readonly number[]): number[] {
        const order = ids.slice();
        for (let index = 1; index < order.length; index += 1) {
            const other = this.integer(0, index + 1, 'platform');
            const value = order[index]; order[index] = order[other]; order[other] = value;
        }
        return order;
    }

    private integer(minimum: number, maximum: number, stream: 'platform' | 'enemy' | 'item'): number {
        return minimum + Math.floor(this.random.next(stream) * Math.max(1, maximum - minimum));
    }
}
