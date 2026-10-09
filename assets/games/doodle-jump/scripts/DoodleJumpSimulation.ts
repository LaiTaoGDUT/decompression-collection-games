import { DoodleJumpLevelGenerator } from './DoodleJumpLevelGenerator';
import {
    DOODLE_JUMP_RULES_VERSION,
    reflectedPlatformX,
    referenceMovingSpeed,
    stepDoodleJumpVertical,
    type DoodleJumpGenerationState,
    type DoodleJumpSpawnPlan,
} from './DoodleJumpReferenceRules';
import type {
    DoodleJumpFixedPlatformConfig,
    DoodleJumpGameplayConfig,
    DoodleJumpPlatformType,
} from './DoodleJumpConfig';
import {
    DoodleJumpRandomStreams,
    hashDoodleJumpSeed,
    type DoodleJumpRandomStreamsSnapshot,
} from './DoodleJumpRandom';
import {
    DoodleJumpCombatSystem,
    type DoodleJumpCombatEvent,
    type DoodleJumpCombatStats,
    type DoodleJumpEnemySnapshot,
    type DoodleJumpProjectileHitResult,
} from './DoodleJumpCombatSystem';
import {
    DoodleJumpHazardSystem,
    type DoodleJumpHazardEvent,
    type DoodleJumpHazardFailureReason,
    type DoodleJumpHazardSnapshot,
    type DoodleJumpHazardStats,
} from './DoodleJumpHazardSystem';
import {
    DoodleJumpItemSystem,
    type DoodleJumpItemEvent,
    type DoodleJumpItemSnapshot,
    type DoodleJumpItemStatusSnapshot,
} from './DoodleJumpItemSystem';
import type {
    DoodleJumpWorldIndex,
    DoodleJumpWorldOccupiedBody,
    DoodleJumpWorldPlatform,
} from './DoodleJumpWorld';

export type DoodleJumpFailureReason =
    | 'fall'
    | 'monster-contact'
    | 'spikes'
    | DoodleJumpHazardFailureReason;

export interface DoodleJumpProjectileTargetHit {
    readonly targetType: 'enemy' | 'ufo';
    readonly enemyHit?: DoodleJumpProjectileHitResult;
    readonly x: number;
    readonly y: number;
}

export interface DoodleJumpPlatformSnapshot {
    readonly id: string;
    readonly type: DoodleJumpPlatformType;
    readonly x: number;
    readonly y: number;
    readonly baseX?: number;
    readonly baseY?: number;
    readonly movingVelocity?: number;
    readonly motionStartSeconds?: number;
    readonly spawnPlan?: DoodleJumpSpawnPlan;
    readonly width: number;
    readonly collisionEnabled: boolean;
    readonly consumed: boolean;
    readonly warningProgress: number;
    readonly consumeAt?: number;
    readonly effectStartedAt?: number;
    readonly predecessorId?: string;
    readonly generationAttempts: number;
    readonly degraded: boolean;
    readonly mainRoute: boolean;
    readonly layerIndex: number;
}

export interface DoodleJumpSimulationSnapshot {
    readonly rulesVersion: number;
    readonly generationState: DoodleJumpGenerationState;
    readonly playerX: number;
    readonly playerY: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly cameraBottomY: number;
    readonly maxAbsoluteWorldY: number;
    readonly elapsedSeconds: number;
    readonly droppedFrameSeconds: number;
    readonly lastLandedPlatformId?: string;
    readonly landingCount: number;
    readonly combat: DoodleJumpCombatStats;
    readonly hazards: readonly DoodleJumpHazardSnapshot[];
    readonly hazardStats: DoodleJumpHazardStats;
    readonly items: readonly DoodleJumpItemSnapshot[];
    readonly itemStatus: DoodleJumpItemStatusSnapshot;
    readonly fatalFocusX?: number;
    readonly fatalFocusY?: number;
    readonly seed: number;
    readonly generatorCursor: number;
    readonly degradedGenerationCount: number;
    readonly randomStreams: DoodleJumpRandomStreamsSnapshot;
    readonly platforms: readonly DoodleJumpPlatformSnapshot[];
    readonly enemies: readonly DoodleJumpEnemySnapshot[];
}

export interface DoodleJumpSimulationPresentationView {
    readonly playerX: number;
    readonly playerY: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly cameraBottomY: number;
    readonly maxAbsoluteWorldY: number;
    readonly elapsedSeconds: number;
    readonly droppedFrameSeconds: number;
    readonly lastLandedPlatformId?: string;
    readonly landingCount: number;
    readonly combat: DoodleJumpCombatStats;
    readonly hazards: readonly DoodleJumpHazardSnapshot[];
    readonly hazardStats: DoodleJumpHazardStats;
    readonly items: readonly DoodleJumpItemSnapshot[];
    readonly itemStatus: DoodleJumpItemStatusSnapshot;
    readonly seed: number;
    readonly generatorCursor: number;
    readonly degradedGenerationCount: number;
    readonly itemRandomCursor: number;
    readonly platforms: readonly DoodleJumpPlatformSnapshot[];
    readonly enemies: readonly DoodleJumpEnemySnapshot[];
}

interface MutablePlatformPresentation {
    id: string;
    type: DoodleJumpPlatformType;
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    width: number;
    collisionEnabled: boolean;
    consumed: boolean;
    warningProgress: number;
    predecessorId?: string;
    generationAttempts: number;
    degraded: boolean;
    mainRoute: boolean;
    layerIndex: number;
}

interface MutableSimulationPresentationView {
    playerX: number;
    playerY: number;
    velocityX: number;
    velocityY: number;
    cameraBottomY: number;
    maxAbsoluteWorldY: number;
    elapsedSeconds: number;
    droppedFrameSeconds: number;
    lastLandedPlatformId?: string;
    landingCount: number;
    combat: DoodleJumpCombatStats;
    hazards: readonly DoodleJumpHazardSnapshot[];
    hazardStats: DoodleJumpHazardStats;
    items: readonly DoodleJumpItemSnapshot[];
    itemStatus: DoodleJumpItemStatusSnapshot;
    seed: number;
    generatorCursor: number;
    degradedGenerationCount: number;
    itemRandomCursor: number;
    platforms: readonly DoodleJumpPlatformSnapshot[];
    enemies: readonly DoodleJumpEnemySnapshot[];
}

export interface DoodleJumpResurrectionResult {
    readonly platformId: string;
    readonly safePlatformGenerated: boolean;
}

interface MutablePlatform {
    readonly config: DoodleJumpFixedPlatformConfig;
    readonly generated: boolean;
    width: number;
    x: number;
    y: number;
    collisionEnabled: boolean;
    consumed: boolean;
    consumeAt: number;
    effectStartedAt: number;
    warningProgress: number;
    predecessorId?: string;
    generationAttempts: number;
    degraded: boolean;
    mainRoute: boolean;
    layerIndex: number;
}

interface IndexedWorldPlatform extends DoodleJumpWorldPlatform {
    readonly source: MutablePlatform;
    revision: number;
}

interface InterpolationOrigin {
    x: number;
    y: number;
    stamp: number;
}

interface PresentedPosition {
    readonly id: string;
    x: number;
    y: number;
}

const SHIFTING_PLATFORM_HOLD_SECONDS = 0.65;
const SHIFTING_PLATFORM_TRANSITION_SECONDS = 0.28;
const SHIFTING_PLATFORM_CYCLE_SECONDS = SHIFTING_PLATFORM_HOLD_SECONDS * 4
    + SHIFTING_PLATFORM_TRANSITION_SECONDS * 4;

function moveTowards(current: number, target: number, maximumDelta: number): number {
    if (current < target) return Math.min(target, current + maximumDelta);
    if (current > target) return Math.max(target, current - maximumDelta);
    return current;
}

function shiftingPlatformSegmentAt(elapsedSeconds: number): number {
    const cycle = elapsedSeconds % SHIFTING_PLATFORM_CYCLE_SECONDS;
    const hold = SHIFTING_PLATFORM_HOLD_SECONDS;
    const transition = SHIFTING_PLATFORM_TRANSITION_SECONDS;
    const firstTransitionEnd = hold + transition;
    const secondHoldEnd = firstTransitionEnd + hold;
    const secondTransitionEnd = secondHoldEnd + transition;
    const thirdHoldEnd = secondTransitionEnd + hold;
    const returnToSecondEnd = thirdHoldEnd + transition;
    const secondReturnHoldEnd = returnToSecondEnd + hold;

    if (cycle < hold) return 0;
    if (cycle < firstTransitionEnd) return (cycle - hold) / transition;
    if (cycle < secondHoldEnd) return 1;
    if (cycle < secondTransitionEnd) return 1 + (cycle - secondHoldEnd) / transition;
    if (cycle < thirdHoldEnd) return 2;
    if (cycle < returnToSecondEnd) return 2 - (cycle - thirdHoldEnd) / transition;
    if (cycle < secondReturnHoldEnd) return 1;
    return 1 - (cycle - secondReturnHoldEnd) / transition;
}

export class DoodleJumpSimulation {
    // 配置不可变；弱引用缓存同时覆盖正式平台与可达性预测的临时候选，
    // 被淘汰的平台/候选不会因为缓存而在长局中一直驻留。
    private readonly motionProfiles = new WeakMap<DoodleJumpFixedPlatformConfig, Readonly<{
        amplitude: number;
        periodSeconds: number;
        phaseRadians: number;
    }>>();
    private readonly platforms: MutablePlatform[];
    private readonly worldPlatforms: IndexedWorldPlatform[] = [];
    private readonly platformById = new Map<string, IndexedWorldPlatform>();
    private readonly worldIndex: DoodleJumpWorldIndex;
    private readonly combatOccupiedScratch: DoodleJumpWorldOccupiedBody[] = [];
    private readonly hazardOccupiedScratch: DoodleJumpWorldOccupiedBody[] = [];
    private readonly itemOccupiedScratch: DoodleJumpWorldOccupiedBody[] = [];
    private readonly presentationPlatforms: MutablePlatformPresentation[] = [];
    private readonly presentationView: MutableSimulationPresentationView;
    private readonly initialSeed: number;
    private readonly randomStreams: DoodleJumpRandomStreams;
    private readonly combat: DoodleJumpCombatSystem;
    private readonly hazards: DoodleJumpHazardSystem;
    private readonly items: DoodleJumpItemSystem;
    private readonly levelGenerator: DoodleJumpLevelGenerator;
    private generatorCursor = 0;
    private generatedLayerCount = 0;
    private latestMainLayer: MutablePlatform[] = [];
    private degradedGenerationCount = 0;
    private nextGeneratedId = 8;
    private accumulator = 0;
    private elapsedSeconds = 0;
    private droppedFrameSeconds = 0;
    private playerX = 375;
    private playerY = 114;
    private velocityX = 0;
    private velocityY = 1000;
    private cameraBottomY = 0;
    private maxAbsoluteWorldY = 114;
    private lastLandedPlatformId?: string;
    private landingCount = 0;
    private fatalReason?: Exclude<DoodleJumpFailureReason, 'fall'>;
    private fatalFocusX?: number;
    private fatalFocusY?: number;
    private monsterContactGraceRemaining = 0;
    private worldNeedsPreStepReconcile = false;
    private worldIndexRevision = 0;
    // Render interpolation: the fixed-step state before the latest step. The
    // presentation view blends it with the current state by the leftover
    // accumulator, so display frames that run 0 or 2 fixed steps still move
    // smoothly instead of freezing and then jumping.
    private interpolationReady = false;
    private interpolationStamp = 0;
    private previousPlayerX = 0;
    private previousPlayerY = 0;
    private previousCameraBottomY = 0;
    private readonly previousPlatformPositions = new Map<string, InterpolationOrigin>();
    private readonly previousEnemyPositions = new Map<string, InterpolationOrigin>();
    private readonly previousItemPositions = new Map<string, InterpolationOrigin>();
    private readonly previousHazardPositions = new Map<string, InterpolationOrigin>();

    constructor(private readonly config: DoodleJumpGameplayConfig, seed: string | number = 1) {
        this.initialSeed = hashDoodleJumpSeed(seed) || 1;
        this.randomStreams = new DoodleJumpRandomStreams(this.initialSeed);
        this.levelGenerator = new DoodleJumpLevelGenerator(config, this.randomStreams);
        this.combat = new DoodleJumpCombatSystem(config, this.randomStreams);
        this.hazards = new DoodleJumpHazardSystem(config, this.randomStreams);
        this.items = new DoodleJumpItemSystem(config, this.randomStreams);
        this.platforms = [];
        this.worldIndex = {
            platforms: this.worldPlatforms,
            platformById: this.platformById,
        };
        this.presentationView = {
            playerX: this.playerX,
            playerY: this.playerY,
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            cameraBottomY: this.cameraBottomY,
            maxAbsoluteWorldY: this.maxAbsoluteWorldY,
            elapsedSeconds: this.elapsedSeconds,
            droppedFrameSeconds: this.droppedFrameSeconds,
            landingCount: this.landingCount,
            combat: this.combat.getPresentationStats(),
            hazards: this.hazards.getPresentationHazards(),
            hazardStats: this.hazards.getPresentationStats(),
            items: this.items.getPresentationItems(),
            itemStatus: this.items.getPresentationStatus(),
            seed: this.initialSeed,
            generatorCursor: this.generatorCursor,
            degradedGenerationCount: this.degradedGenerationCount,
            itemRandomCursor: this.randomStreams.getCursor('item'),
            platforms: this.presentationPlatforms,
            enemies: this.combat.getPresentationEnemies(),
        };
        this.reset();
        this.validateFixedRoute();
    }

    reset(): void {
        this.accumulator = 0;
        this.interpolationReady = false;
        this.elapsedSeconds = 0;
        this.droppedFrameSeconds = 0;
        const start = this.config.fixedPlatforms[0];
        this.playerX = start.x;
        this.playerY = start.y + this.config.player.collisionHeight / 2;
        this.velocityX = 0;
        this.velocityY = this.config.player.bounceVelocity;
        this.cameraBottomY = 0;
        this.maxAbsoluteWorldY = this.playerY;
        this.lastLandedPlatformId = start.id;
        this.landingCount = 0;
        this.fatalReason = undefined;
        this.fatalFocusX = undefined;
        this.fatalFocusY = undefined;
        this.monsterContactGraceRemaining = 0;
        this.randomStreams.reset();
        this.levelGenerator.reset();
        this.combat.reset();
        this.hazards.reset();
        this.items.reset();
        this.generatorCursor = 0;
        this.generatedLayerCount = 0;
        this.degradedGenerationCount = 0;
        this.nextGeneratedId = 8;
        this.platforms.length = 0;
        this.config.fixedPlatforms.forEach((platform, index) => {
            this.platforms.push({
                config: platform,
                generated: false,
                width: platform.width,
                x: platform.x,
                y: platform.y,
                collisionEnabled: true,
                consumed: false,
                consumeAt: 0,
                effectStartedAt: 0,
                warningProgress: 0,
                predecessorId: index > 0
                    ? this.config.fixedPlatforms[index - 1].id
                    : undefined,
                generationAttempts: 0,
                degraded: false,
                mainRoute: true,
                layerIndex: index - 7,
            });
        });
        this.platforms.forEach((platform, index) => {
            platform.width = platform.config.width;
            platform.x = platform.config.x;
            platform.y = platform.config.y;
            platform.collisionEnabled = true;
            platform.consumed = false;
            platform.consumeAt = 0;
            platform.effectStartedAt = 0;
            platform.warningProgress = 0;
            platform.predecessorId = index > 0 ? this.platforms[index - 1].config.id : undefined;
            platform.generationAttempts = 0;
            platform.degraded = false;
            platform.mainRoute = true;
            platform.layerIndex = index - 7;
        });
        const fixedMainPlatforms = this.platforms.slice();
        this.generatedLayerCount = 0;
        this.latestMainLayer = fixedMainPlatforms.length > 0
            ? [fixedMainPlatforms[fixedMainPlatforms.length - 1]]
            : [];
        this.syncWorldIndex();
        this.updateWorldSystems(
            0,
            this.cameraBottomY,
            this.cameraBottomY + this.config.design.height,
            true,
        );
        this.worldNeedsPreStepReconcile = false;
    }

    restore(snapshot: DoodleJumpSimulationSnapshot): void {
        const finite = (value: number, field: string): number => {
            if (!Number.isFinite(value)) throw new Error(`Invalid restored ${field}.`);
            return value;
        };
        if (snapshot.rulesVersion !== DOODLE_JUMP_RULES_VERSION
            || snapshot.seed !== this.initialSeed
            || snapshot.platforms.length === 0
            || snapshot.platforms.length > this.config.generation.maxActivePlatforms) {
            throw new Error('Invalid Doodle Jump active-round snapshot.');
        }
        this.accumulator = 0;
        this.interpolationReady = false;
        this.elapsedSeconds = Math.max(0, finite(snapshot.elapsedSeconds, 'elapsedSeconds'));
        this.droppedFrameSeconds = Math.max(
            0,
            finite(snapshot.droppedFrameSeconds, 'droppedFrameSeconds'),
        );
        this.playerX = finite(snapshot.playerX, 'playerX');
        this.playerY = finite(snapshot.playerY, 'playerY');
        this.velocityX = finite(snapshot.velocityX, 'velocityX');
        this.velocityY = finite(snapshot.velocityY, 'velocityY');
        this.cameraBottomY = finite(snapshot.cameraBottomY, 'cameraBottomY');
        this.maxAbsoluteWorldY = Math.max(
            this.playerY,
            finite(snapshot.maxAbsoluteWorldY, 'maxAbsoluteWorldY'),
        );
        this.lastLandedPlatformId = snapshot.lastLandedPlatformId;
        this.landingCount = Math.max(0, Math.floor(snapshot.landingCount));
        this.fatalReason = undefined;
        this.fatalFocusX = undefined;
        this.fatalFocusY = undefined;
        this.monsterContactGraceRemaining = 0.35;
        this.generatorCursor = Math.max(0, Math.floor(snapshot.generatorCursor));
        this.degradedGenerationCount = Math.max(
            0,
            Math.floor(snapshot.degradedGenerationCount),
        );
        this.platforms.length = 0;
        let maximumGeneratedId = 7;
        snapshot.platforms.forEach((platform) => {
            const generatedId = Number(/^(?:G|resurrect-safe-)(\d+)$/.exec(platform.id)?.[1]);
            if (Number.isInteger(generatedId)) maximumGeneratedId = Math.max(
                maximumGeneratedId,
                generatedId,
            );
            const restoredX = finite(platform.x, `platform ${platform.id} x`);
            const restoredY = finite(platform.y, `platform ${platform.id} y`);
            // Width is a rule, not per-platform state; rebuild it from the current config.
            // Large-monster widening is re-applied after combat is restored.
            const restoredWidth = this.baseWidthFor(platform.id);
            const zeroOriginConfig: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: platform.id,
                x: 0,
                y: 0,
                width: restoredWidth,
                type: platform.type,
            });
            const config: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: platform.id,
                x: finite(
                    platform.baseX
                        ?? restoredX - this.platformXAt(zeroOriginConfig, this.elapsedSeconds),
                    `platform ${platform.id} baseX`,
                ),
                y: finite(
                    platform.baseY
                        ?? restoredY - this.platformYAt(zeroOriginConfig, this.elapsedSeconds),
                    `platform ${platform.id} baseY`,
                ),
                width: restoredWidth,
                type: platform.type,
                movingVelocity: platform.movingVelocity,
                motionStartSeconds: platform.motionStartSeconds,
                spawnPlan: platform.spawnPlan ? Object.freeze({ ...platform.spawnPlan }) : undefined,
            });
            this.platforms.push({
                config,
                generated: /^G/.test(platform.id) || /^resurrect-safe-/.test(platform.id),
                width: restoredWidth,
                x: restoredX,
                y: restoredY,
                collisionEnabled: platform.collisionEnabled,
                consumed: platform.consumed,
                consumeAt: finite(platform.consumeAt ?? 0, `platform ${platform.id} consumeAt`),
                effectStartedAt: finite(platform.effectStartedAt ?? 0, `platform ${platform.id} effectStartedAt`),
                warningProgress: Math.max(0, platform.warningProgress),
                predecessorId: platform.predecessorId,
                generationAttempts: Math.max(0, Math.floor(platform.generationAttempts)),
                degraded: platform.degraded,
                mainRoute: platform.mainRoute,
                layerIndex: Math.floor(platform.layerIndex),
            });
        });
        this.nextGeneratedId = maximumGeneratedId + 1;
        this.generatedLayerCount = this.platforms.reduce(
            (maximum, platform) => Math.max(maximum, platform.layerIndex),
            0,
        );
        const restoredMainRoute = this.platforms.filter((platform) => platform.mainRoute);
        this.latestMainLayer = [restoredMainRoute.length > 0
            ? restoredMainRoute.reduce((highest, platform) => platform.config.y > highest.config.y ? platform : highest)
            : this.findHighestPlatform()];
        this.randomStreams.restore(snapshot.randomStreams);
        this.levelGenerator.restore(snapshot.generationState);
        this.syncWorldIndex();
        this.combat.restore(
            snapshot.enemies,
            snapshot.combat,
            this.elapsedSeconds,
            this.worldIndex,
        );
        this.applyLargeMonsterPlatformWidths();
        this.hazards.restore(
            snapshot.hazards,
            snapshot.hazardStats,
            this.elapsedSeconds,
            this.worldIndex,
        );
        this.items.restore(
            snapshot.items,
            snapshot.itemStatus,
            this.worldIndex,
        );
        this.worldNeedsPreStepReconcile = false;
    }

    advance(frameSeconds: number, horizontalInput: number, visibleHeight: number): void {
        const safeFrameSeconds = Number.isFinite(frameSeconds)
            ? Math.max(0, frameSeconds)
            : 0;
        this.accumulator += safeFrameSeconds;
        const fixedDelta = this.config.fixedStep.seconds;
        let steps = 0;
        while (this.accumulator >= fixedDelta
            && steps < this.config.fixedStep.maxSubSteps
            && !this.fatalReason) {
            this.captureInterpolationOrigin();
            this.step(fixedDelta, Math.max(-1, Math.min(1, horizontalInput)), visibleHeight);
            this.accumulator -= fixedDelta;
            steps += 1;
        }
        if (this.accumulator >= fixedDelta) {
            this.droppedFrameSeconds += this.accumulator;
            this.accumulator = 0;
        }
    }

    /**
     * Builds the round's initial world for the real viewport before play
     * starts. Without this the first gameplay step would generate every layer
     * above the fixed route and spawn its monsters, hazards and items in one
     * frame, which is the hitch on the first jump after spawning.
     */
    prepareWorld(visibleHeight: number): void {
        const safeVisibleHeight = Math.max(1, visibleHeight);
        this.recyclePlatforms();
        this.ensureGenerated(safeVisibleHeight);
        this.syncWorldIndex();
        this.reconcileWorldSystems(
            this.cameraBottomY,
            this.cameraBottomY + safeVisibleHeight,
        );
        this.worldNeedsPreStepReconcile = false;
    }

    isBelowDeathLine(visibleHeight: number): boolean {
        const playerTopY = this.playerY + this.config.player.collisionHeight / 2;
        return playerTopY < this.cameraBottomY && visibleHeight > 0;
    }

    getCameraBottomY(): number {
        return this.cameraBottomY;
    }

    hitEnemyByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
    ): DoodleJumpProjectileTargetHit | undefined {
        if (this.fatalReason) return undefined;
        const ufoHit = this.hazards.hitUfoByProjectileSweep(fromX, fromY, toX, toY);
        if (ufoHit) {
            return Object.freeze({
                targetType: 'ufo',
                x: ufoHit.x,
                y: ufoHit.y,
            });
        }
        const enemyHit = this.combat.hitByProjectileSweep(fromX, fromY, toX, toY);
        if (!enemyHit) return undefined;
        return Object.freeze({
            targetType: 'enemy',
            enemyHit,
            x: enemyHit.x,
            y: enemyHit.y,
        });
    }

    drainCombatEvents(): readonly DoodleJumpCombatEvent[] {
        return this.combat.drainEvents();
    }

    drainHazardEvents(): readonly DoodleJumpHazardEvent[] {
        return this.hazards.drainEvents();
    }

    drainItemEvents(): readonly DoodleJumpItemEvent[] {
        return this.items.drainEvents();
    }

    activateHeadStart(): void {
        this.items.activateHeadStart();
    }

    takeFatalReason(): Exclude<DoodleJumpFailureReason, 'fall'> | undefined {
        const reason = this.fatalReason;
        this.fatalReason = undefined;
        return reason;
    }

    debugGenerateNext(): boolean {
        if (!this.config.generation.enabled) return false;
        const highest = this.findHighestPlatform();
        const next = this.generateReachablePlatform(highest);
        this.platforms.push(next);
        this.enforcePlatformBudget();
        this.syncWorldIndex();
        this.worldNeedsPreStepReconcile = true;
        return true;
    }

    resurrect(visibleHeight: number): DoodleJumpResurrectionResult {
        const screenTop = this.cameraBottomY + Math.max(0, visibleHeight);
        const isSafe = (platform: MutablePlatform): boolean => !this.config.resurrection.forceGeneratedSafePlatform
            && platform.collisionEnabled
            && platform.config.type === 'normal'
            && platform.y > this.cameraBottomY
            && this.combat.isAreaClear(
                platform.x,
                platform.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            )
            && this.hazards.isAreaClear(
                platform.x,
                platform.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            )
            && this.items.isAreaClear(
                platform.x,
                platform.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            );
        let target: MutablePlatform | undefined;

        this.platforms.forEach((platform) => {
            if (!isSafe(platform) || platform.y > screenTop) return;
            if (!target || platform.y < target.y) target = platform;
        });

        if (!target) {
            this.platforms.forEach((platform) => {
                if (!isSafe(platform) || platform.y <= screenTop) return;
                if (!target || platform.y < target.y) target = platform;
            });
        }

        let safePlatformGenerated = false;
        if (!target) {
            const highestY = this.platforms.reduce(
                (highest, platform) => Math.max(highest, platform.y),
                this.cameraBottomY,
            );
            const minimumSafeY = Math.max(screenTop + 180, highestY + 120);
            const generatedConfig: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: `resurrect-safe-${this.nextGeneratedId++}`,
                x: this.config.design.width / 2,
                y: minimumSafeY,
                width: this.config.platformBehavior.standardWidth,
                type: 'normal',
            });
            target = {
                config: generatedConfig,
                generated: true,
                width: generatedConfig.width,
                x: generatedConfig.x,
                y: generatedConfig.y,
                collisionEnabled: true,
                consumed: false,
                consumeAt: 0,
                effectStartedAt: 0,
                warningProgress: 0,
                predecessorId: undefined,
                generationAttempts: 0,
                degraded: true,
                mainRoute: true,
                layerIndex: this.generatedLayerCount + 1,
            };
            this.platforms.push(target);
            safePlatformGenerated = true;
            this.syncWorldIndex();
            this.worldNeedsPreStepReconcile = true;
        }

        const targetScreenY = this.cameraAnchorHeight(visibleHeight);
        this.cameraBottomY = Math.max(this.cameraBottomY, target.y - targetScreenY);
        this.playerX = target.x;
        this.playerY = target.y + this.config.player.collisionHeight / 2;
        this.velocityX = 0;
        this.velocityY = this.config.resurrection.launchVelocity;
        this.accumulator = 0;
        this.interpolationReady = false;
        this.items.cancelTrampolineJump();
        this.lastLandedPlatformId = target.config.id;
        this.maxAbsoluteWorldY = Math.max(this.maxAbsoluteWorldY, this.playerY);
        this.fatalReason = undefined;
        this.fatalFocusX = undefined;
        this.fatalFocusY = undefined;
        this.monsterContactGraceRemaining = 0.32;
        this.combat.clearNear(
            target.x,
            target.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.hazards.clearNear(
            target.x,
            target.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.items.clearNear(
            target.x,
            target.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.items.grantShield(this.config.resurrection.shieldSeconds);

        return Object.freeze({
            platformId: target.config.id,
            safePlatformGenerated,
        });
    }

    getSnapshot(): DoodleJumpSimulationSnapshot {
        // Lifecycle and persistence boundary: callers may retain this deeply
        // frozen value without observing later simulation mutations.
        return Object.freeze({
            rulesVersion: DOODLE_JUMP_RULES_VERSION,
            generationState: this.levelGenerator.getSnapshot(),
            playerX: this.playerX,
            playerY: this.playerY,
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            cameraBottomY: this.cameraBottomY,
            maxAbsoluteWorldY: this.maxAbsoluteWorldY,
            elapsedSeconds: this.elapsedSeconds,
            droppedFrameSeconds: this.droppedFrameSeconds,
            lastLandedPlatformId: this.lastLandedPlatformId,
            landingCount: this.landingCount,
            combat: this.combat.getStats(),
            hazards: this.hazards.getSnapshots(),
            hazardStats: this.hazards.getStats(),
            items: this.items.getSnapshots(),
            itemStatus: this.items.getStatus(),
            fatalFocusX: this.fatalFocusX,
            fatalFocusY: this.fatalFocusY,
            seed: this.initialSeed,
            generatorCursor: this.generatorCursor,
            degradedGenerationCount: this.degradedGenerationCount,
            randomStreams: this.randomStreams.getSnapshot(),
            platforms: Object.freeze(this.platforms.map((platform) => Object.freeze({
                id: platform.config.id,
                type: platform.config.type,
                x: platform.x,
                y: platform.y,
                baseX: platform.config.x,
                baseY: platform.config.y,
                movingVelocity: platform.config.movingVelocity,
                motionStartSeconds: platform.config.motionStartSeconds,
                spawnPlan: platform.config.spawnPlan,
                width: platform.width,
                collisionEnabled: platform.collisionEnabled,
                consumed: platform.consumed,
                warningProgress: platform.warningProgress,
                consumeAt: platform.consumeAt,
                effectStartedAt: platform.effectStartedAt,
                predecessorId: platform.predecessorId,
                generationAttempts: platform.generationAttempts,
                degraded: platform.degraded,
                mainRoute: platform.mainRoute,
                layerIndex: platform.layerIndex,
            }))),
            enemies: this.combat.getSnapshots(),
        });
    }

    getPresentationView(): DoodleJumpSimulationPresentationView {
        // Render-frame view: the object, arrays, and records are reused and
        // must only be consumed synchronously before the next view refresh.
        for (let index = 0; index < this.platforms.length; index += 1) {
            const platform = this.platforms[index];
            let presentation = this.presentationPlatforms[index];
            if (!presentation) {
                presentation = {
                    id: platform.config.id,
                    type: platform.config.type,
                    x: platform.x,
                    y: platform.y,
                    baseX: platform.config.x,
                    baseY: platform.config.y,
                    width: platform.width,
                    collisionEnabled: platform.collisionEnabled,
                    consumed: platform.consumed,
                    warningProgress: platform.warningProgress,
                    predecessorId: platform.predecessorId,
                    generationAttempts: platform.generationAttempts,
                    degraded: platform.degraded,
                    mainRoute: platform.mainRoute,
                    layerIndex: platform.layerIndex,
                };
                this.presentationPlatforms[index] = presentation;
            }
            presentation.id = platform.config.id;
            presentation.type = platform.config.type;
            presentation.x = platform.x;
            presentation.y = platform.y;
            presentation.baseX = platform.config.x;
            presentation.baseY = platform.config.y;
            presentation.width = platform.width;
            presentation.collisionEnabled = platform.collisionEnabled;
            presentation.consumed = platform.consumed;
            presentation.warningProgress = platform.warningProgress;
            presentation.predecessorId = platform.predecessorId;
            presentation.generationAttempts = platform.generationAttempts;
            presentation.degraded = platform.degraded;
            presentation.mainRoute = platform.mainRoute;
            presentation.layerIndex = platform.layerIndex;
        }
        this.presentationPlatforms.length = this.platforms.length;
        this.presentationView.playerX = this.playerX;
        this.presentationView.playerY = this.playerY;
        this.presentationView.velocityX = this.velocityX;
        this.presentationView.velocityY = this.velocityY;
        this.presentationView.cameraBottomY = this.cameraBottomY;
        this.presentationView.maxAbsoluteWorldY = this.maxAbsoluteWorldY;
        this.presentationView.elapsedSeconds = this.elapsedSeconds;
        this.presentationView.droppedFrameSeconds = this.droppedFrameSeconds;
        this.presentationView.lastLandedPlatformId = this.lastLandedPlatformId;
        this.presentationView.landingCount = this.landingCount;
        this.presentationView.combat = this.combat.getPresentationStats();
        this.presentationView.hazards = this.hazards.getPresentationHazards();
        this.presentationView.hazardStats = this.hazards.getPresentationStats();
        this.presentationView.items = this.items.getPresentationItems();
        this.presentationView.itemStatus = this.items.getPresentationStatus();
        this.presentationView.seed = this.initialSeed;
        this.presentationView.generatorCursor = this.generatorCursor;
        this.presentationView.degradedGenerationCount = this.degradedGenerationCount;
        this.presentationView.itemRandomCursor = this.randomStreams.getCursor('item');
        this.presentationView.platforms = this.presentationPlatforms;
        this.presentationView.enemies = this.combat.getPresentationEnemies();
        this.applyPresentationInterpolation();
        return this.presentationView;
    }

    private captureInterpolationOrigin(): void {
        this.interpolationStamp += 1;
        const stamp = this.interpolationStamp;
        this.previousPlayerX = this.playerX;
        this.previousPlayerY = this.playerY;
        this.previousCameraBottomY = this.cameraBottomY;
        for (let index = 0; index < this.platforms.length; index += 1) {
            const platform = this.platforms[index];
            this.recordInterpolationOrigin(
                this.previousPlatformPositions,
                platform.config.id,
                platform.x,
                platform.y,
                stamp,
            );
        }
        this.recordInterpolationOrigins(
            this.previousEnemyPositions,
            this.combat.getPresentationEnemies(),
            stamp,
        );
        this.recordInterpolationOrigins(
            this.previousItemPositions,
            this.items.getPresentationItems(),
            stamp,
        );
        this.recordInterpolationOrigins(
            this.previousHazardPositions,
            this.hazards.getPresentationHazards(),
            stamp,
        );
        this.pruneInterpolationOrigins(this.previousPlatformPositions, stamp);
        this.pruneInterpolationOrigins(this.previousEnemyPositions, stamp);
        this.pruneInterpolationOrigins(this.previousItemPositions, stamp);
        this.pruneInterpolationOrigins(this.previousHazardPositions, stamp);
        this.interpolationReady = true;
    }

    private recordInterpolationOrigins(
        origins: Map<string, InterpolationOrigin>,
        entities: readonly { readonly id: string; readonly x: number; readonly y: number }[],
        stamp: number,
    ): void {
        for (let index = 0; index < entities.length; index += 1) {
            const entity = entities[index];
            this.recordInterpolationOrigin(origins, entity.id, entity.x, entity.y, stamp);
        }
    }

    private recordInterpolationOrigin(
        origins: Map<string, InterpolationOrigin>,
        id: string,
        x: number,
        y: number,
        stamp: number,
    ): void {
        const origin = origins.get(id);
        if (origin) {
            origin.x = x;
            origin.y = y;
            origin.stamp = stamp;
            return;
        }
        origins.set(id, { x, y, stamp });
    }

    private pruneInterpolationOrigins(
        origins: Map<string, InterpolationOrigin>,
        stamp: number,
    ): void {
        origins.forEach((origin, id) => {
            if (origin.stamp !== stamp) origins.delete(id);
        });
    }

    private applyPresentationInterpolation(): void {
        if (!this.interpolationReady) return;
        const alpha = Math.max(0, Math.min(1, this.accumulator / this.config.fixedStep.seconds));
        if (alpha >= 1) return;
        const view = this.presentationView;
        view.playerX = this.interpolateContinuous(this.previousPlayerX, this.playerX, alpha);
        view.playerY = this.interpolateContinuous(this.previousPlayerY, this.playerY, alpha);
        view.cameraBottomY = this.interpolateContinuous(
            this.previousCameraBottomY,
            this.cameraBottomY,
            alpha,
        );
        this.interpolatePositions(this.presentationPlatforms, this.previousPlatformPositions, alpha);
        // Subsystem presentation records are rebuilt from simulation state on
        // every view refresh, so blending their positions here is render-only.
        this.interpolatePositions(
            view.enemies as unknown as PresentedPosition[],
            this.previousEnemyPositions,
            alpha,
        );
        this.interpolatePositions(
            view.items as unknown as PresentedPosition[],
            this.previousItemPositions,
            alpha,
        );
        this.interpolatePositions(
            view.hazards as unknown as PresentedPosition[],
            this.previousHazardPositions,
            alpha,
        );
    }

    private interpolatePositions(
        entities: readonly PresentedPosition[],
        origins: ReadonlyMap<string, InterpolationOrigin>,
        alpha: number,
    ): void {
        for (let index = 0; index < entities.length; index += 1) {
            const entity = entities[index];
            const origin = origins.get(entity.id);
            // Entities spawned during the latest step have no origin yet and
            // are shown at their current position.
            if (!origin) continue;
            entity.x = this.interpolateContinuous(origin.x, entity.x, alpha);
            entity.y = this.interpolateContinuous(origin.y, entity.y, alpha);
        }
    }

    private interpolateContinuous(from: number, to: number, alpha: number): number {
        // Screen wrap and other teleports are shown immediately, never swept.
        if (Math.abs(to - from) > this.config.design.width / 2) return to;
        return from + (to - from) * alpha;
    }

    private step(delta: number, input: number, visibleHeight: number): void {
        this.elapsedSeconds += delta;
        this.monsterContactGraceRemaining = Math.max(
            0,
            this.monsterContactGraceRemaining - delta,
        );
        this.updatePlatforms(delta);
        this.items.updateTimers(delta, this.playerX, this.playerY, this.velocityY);
        this.updateWorldSystems(
            delta,
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.worldNeedsPreStepReconcile,
        );
        this.worldNeedsPreStepReconcile = false;
        const player = this.config.player;
        if (Math.abs(input) > 0.0001) {
            this.velocityX = moveTowards(
                this.velocityX,
                input * player.maxHorizontalSpeed,
                player.horizontalAcceleration * delta,
            );
        } else {
            this.velocityX = moveTowards(
                this.velocityX,
                0,
                player.horizontalDeceleration * delta,
            );
        }
        const previousFootY = this.playerY - player.collisionHeight / 2;
        const itemPhysics = this.items.getPhysics();
        const blackHoleAttraction = this.hazards.resolveBlackHoleAttraction(this.playerX, this.playerY);
        this.velocityX += blackHoleAttraction.accelerationX * delta;
        this.velocityY += blackHoleAttraction.accelerationY * delta;
        let verticalDisplacement: number;
        if (itemPhysics.fixedVerticalVelocity !== undefined) {
            this.velocityY = itemPhysics.fixedVerticalVelocity;
            verticalDisplacement = this.velocityY * delta;
        } else {
            const vertical = stepDoodleJumpVertical(
                this.velocityY, itemPhysics.gravity, delta, player.terminalFallVelocity,
            );
            verticalDisplacement = vertical.displacement;
            this.velocityY = vertical.velocity;
            if (itemPhysics.minimumVerticalVelocity !== undefined) {
                this.velocityY = Math.max(itemPhysics.minimumVerticalVelocity, this.velocityY);
            }
        }
        this.playerX += this.velocityX * delta;
        this.playerY += verticalDisplacement;
        if (this.playerX < player.wrapLeft) this.playerX += player.wrapDistance;
        if (this.playerX > player.wrapRight) this.playerX -= player.wrapDistance;
        const collisionVelocityY = this.velocityY;
        const collisionPlayerY = this.playerY;
        // Platform-anchored landing items must be collected before resolving
        // the same downward platform contact. Otherwise spring/trampoline is
        // stored until a later landing and appears to do nothing on pickup.
        this.items.resolvePickups(
            this.playerX,
            this.playerY,
            player.collisionWidth,
            player.collisionHeight,
        );
        if (this.velocityY <= 0 && itemPhysics.platformCollisionEnabled) {
            this.resolveLanding(previousFootY);
        }
        const combatResult = this.combat.resolvePlayerCollision(
            this.playerX,
            collisionPlayerY,
            previousFootY,
            collisionVelocityY,
            player.collisionWidth,
            player.collisionHeight,
        );
        if (combatResult.outcome === 'stomp') {
            this.playerY = (combatResult.bounceSurfaceY ?? collisionPlayerY)
                + player.collisionHeight / 2;
            this.velocityY = player.bounceVelocity;
        }
        const playerInvincible = this.items.hasFlightInvincibility()
            || this.items.hasTrampolineInvincibility()
            || this.items.hasShield();
        const spikedPlatform = this.findSpikedPlatformContact(
            previousFootY + player.collisionHeight / 2,
            collisionPlayerY,
        );
        if (spikedPlatform && !playerInvincible) {
            this.fatalReason = 'spikes';
            this.fatalFocusX = spikedPlatform.x;
            this.fatalFocusY = spikedPlatform.y - this.config.platformBehavior.spiked.collisionDepth;
            return;
        }
        const hazardResult = this.hazards.resolvePlayer(
            delta,
            this.playerX,
            this.playerY,
            previousFootY,
            player.collisionWidth,
            player.collisionHeight,
            playerInvincible,
        );
        this.velocityX += hazardResult.accelerationX * delta;
        this.velocityY += hazardResult.accelerationY * delta;
        if (hazardResult.fatalReason) {
            this.fatalReason = hazardResult.fatalReason;
            this.fatalFocusX = hazardResult.focusX;
            this.fatalFocusY = hazardResult.focusY;
            return;
        }
        if (combatResult.outcome === 'contact'
            && !playerInvincible
            && this.monsterContactGraceRemaining <= 0) {
            this.fatalReason = 'monster-contact';
            return;
        }
        this.maxAbsoluteWorldY = Math.max(this.maxAbsoluteWorldY, this.playerY);
        const targetScreenY = this.cameraAnchorHeight(visibleHeight);
        if (this.velocityY >= 0) {
            this.cameraBottomY = Math.max(this.cameraBottomY, this.playerY - targetScreenY);
        }
        this.recyclePlatforms();
        this.ensureGenerated(visibleHeight);
        this.syncWorldIndex();
        this.reconcileWorldSystems(
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
        );
    }

    private updatePlatforms(_delta: number): void {
        this.platforms.forEach((platform) => {
            if (platform.config.type === 'moving') {
                platform.x = this.platformXAt(platform.config, this.elapsedSeconds);
            } else if (platform.config.type === 'shifting') {
                const segment = shiftingPlatformSegmentAt(this.elapsedSeconds);
                platform.x = platform.config.x + (segment - 1) * 70;
            } else {
                platform.x = platform.config.x;
            }
            platform.y = this.platformYAt(platform.config, this.elapsedSeconds);
            if (platform.consumed) return;
            if (platform.config.type === 'exploding' && platform.effectStartedAt > 0) {
                const effectProgress = Math.max(
                    0,
                    Math.min(1, (this.elapsedSeconds - platform.effectStartedAt) / 0.32),
                );
                platform.warningProgress = 1 + effectProgress;
                if (effectProgress >= 1) platform.consumed = true;
                return;
            }
            if (platform.consumeAt <= 0) return;
            const remaining = platform.consumeAt - this.elapsedSeconds;
            const warningDuration = platform.config.type === 'breakable' ? 0.45
                : platform.config.type === 'disappearing' ? 0.35
                    : platform.config.type === 'exploding'
                        ? this.config.platformBehavior.explodingDelaySeconds
                        : 0.15;
            platform.warningProgress = remaining <= warningDuration
                ? Math.max(0, Math.min(1, 1 - remaining / warningDuration))
                : 0;
            if (remaining > 0) return;
            platform.collisionEnabled = false;
            if (platform.config.type === 'exploding') {
                platform.effectStartedAt = this.elapsedSeconds;
                platform.warningProgress = 1.001;
                return;
            }
            platform.consumed = true;
            platform.warningProgress = 1;
        });
    }

    private resolveLanding(previousFootY: number): void {
        const currentFootY = this.playerY - this.config.player.collisionHeight / 2;
        const halfPlayerWidth = this.config.player.collisionWidth / 2;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            const platform = this.platforms[index];
            if (!platform.collisionEnabled) continue;
            const topY = platform.y;
            if (topY < this.cameraBottomY) continue;
            if (previousFootY < topY || currentFootY > topY) continue;
            // A landing needs at least one quarter of the player's body width
            // to overlap the platform. More than three quarters hanging outside
            // is treated as a miss instead of an edge catch.
            const horizontalReach = platform.width / 2 + halfPlayerWidth / 2;
            if (Math.abs(this.playerX - platform.x) > horizontalReach) continue;
            if (platform.config.type === 'breakable') {
                platform.collisionEnabled = false;
                platform.consumeAt = this.elapsedSeconds + 0.45;
                platform.warningProgress = 0;
                this.lastLandedPlatformId = platform.config.id;
                return;
            }
            this.playerY = topY + this.config.player.collisionHeight / 2;
            this.velocityY = this.items.consumeLandingPower(this.playerX, topY)
                ?? this.config.player.bounceVelocity;
            this.lastLandedPlatformId = platform.config.id;
            this.landingCount += 1;
            if (platform.consumeAt <= 0 && platform.config.type === 'disappearing') {
                platform.consumeAt = this.elapsedSeconds + 0.35;
            }
            if (platform.consumeAt <= 0 && platform.config.type === 'exploding') {
                platform.consumeAt = this.elapsedSeconds
                    + this.config.platformBehavior.explodingDelaySeconds;
            }
            return;
        }
    }

    private findSpikedPlatformContact(
        previousPlayerY: number,
        currentPlayerY: number,
    ): MutablePlatform | undefined {
        const halfPlayerWidth = this.config.player.collisionWidth / 2;
        const halfPlayerHeight = this.config.player.collisionHeight / 2;
        const collisionDepth = this.config.platformBehavior.spiked.collisionDepth;
        const previousTopY = previousPlayerY + halfPlayerHeight;
        const currentTopY = currentPlayerY + halfPlayerHeight;
        const previousBottomY = previousPlayerY - halfPlayerHeight;
        const currentBottomY = currentPlayerY - halfPlayerHeight;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            const platform = this.platforms[index];
            if (platform.config.type !== 'spiked'
                || !platform.collisionEnabled
                || platform.consumed) continue;
            if (previousPlayerY >= platform.y && currentPlayerY >= platform.y) continue;
            if (Math.abs(this.playerX - platform.x)
                > platform.width / 2 + halfPlayerWidth) continue;
            const spikeBaseY = platform.y - 12;
            const spikeTipY = platform.y - collisionDepth;
            const sweptTopY = Math.max(previousTopY, currentTopY);
            const sweptBottomY = Math.min(previousBottomY, currentBottomY);
            if (sweptTopY < spikeTipY || sweptBottomY > spikeBaseY) continue;
            return platform;
        }
        return undefined;
    }

    private ensureGenerated(visibleHeight: number): void {
        if (!this.config.generation.enabled) return;
        const generationTop = this.cameraBottomY
            + Math.max(1, visibleHeight)
            + this.config.generation.preloadAboveScreen;
        let highest = this.findHighestPlatform();
        while (highest.config.y < generationTop
            && this.platforms.length < this.config.generation.maxActivePlatforms) {
            highest = this.generateReachablePlatform(highest);
            this.platforms.push(highest);
        }
    }

    private generateReachablePlatform(previous: MutablePlatform): MutablePlatform {
        const planned = this.levelGenerator.next(previous.config.y, this.cameraBottomY);
        const nextLayer = this.generatedLayerCount + 1;
        const routePrevious = this.latestMainLayer[0] ?? previous;
        const jumpHeight = this.config.player.bounceVelocity ** 2 / (-2 * this.config.player.gravity)
            + this.config.player.bounceVelocity * this.config.fixedStep.seconds / 2;
        let type = this.config.generation.platformTypeOverride === 'auto'
            ? planned.type : this.config.generation.platformTypeOverride;
        // A broken platform is optional scenery. Recover before a run of fragile
        // platforms can consume the entire ordinary-jump height budget.
        if (type === 'breakable' && planned.y - routePrevious.config.y > jumpHeight * 0.65) type = 'normal';
        const width = this.config.platformBehavior.standardWidth;
        const limit = this.config.generation.forceDegradedFallback ? 0 : this.config.generation.maxCandidateAttempts;
        for (let attempt = 1; attempt <= limit; attempt += 1) {
            const candidate: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: `G${this.nextGeneratedId}`,
                x: this.clampPlatformX(attempt === 1 ? planned.x : this.nextPlatformRandom() * this.config.design.width, width, type),
                y: planned.y,
                width,
                type,
                movingVelocity: planned.movingVelocity,
                motionStartSeconds: this.elapsedSeconds,
                spawnPlan: planned.spawnPlan,
            });
            if (!this.isCandidateReachable(routePrevious, candidate)) continue;
            const platform = this.createGeneratedPlatform(candidate, routePrevious.config.id, attempt, false,
                type !== 'breakable', nextLayer);
            this.nextGeneratedId += 1;
            this.generatorCursor += 1;
            this.generatedLayerCount = nextLayer;
            if (platform.mainRoute) this.latestMainLayer = [platform];
            return platform;
        }
        // A deterministic recovery is checked with the same solver as the live
        // player; retain segment ownership even when adapting its geometry.
        const candidate: DoodleJumpFixedPlatformConfig = Object.freeze({
            id: `G${this.nextGeneratedId}`,
            x: this.clampPlatformX(routePrevious.x, width, 'normal'),
            y: Math.min(planned.y, previous.config.y + 40),
            width,
            type: 'normal',
            spawnPlan: planned.spawnPlan,
        });
        if (!this.isCandidateReachable(routePrevious, candidate)) {
            throw new Error(`Unreachable level recovery after ${routePrevious.config.id}.`);
        }
        const platform = this.createGeneratedPlatform(candidate, routePrevious.config.id, limit, true, true, nextLayer);
        this.nextGeneratedId += 1;
        this.generatorCursor += 1;
        this.generatedLayerCount = nextLayer;
        this.degradedGenerationCount += 1;
        this.latestMainLayer = [platform];
        return platform;
    }

    private cameraAnchorHeight(visibleHeight: number): number {
        return Math.min(this.config.camera.anchorHeight,
            Math.max(1, visibleHeight) * this.config.camera.maximumAnchorHeightRatio);
    }

    private findHighestPlatform(): MutablePlatform {
        return this.platforms.reduce(
            (candidate, platform) => platform.config.y > candidate.config.y ? platform : candidate,
            this.platforms[0],
        );
    }

    private validateFixedRoute(): void {
        for (let index = 1; index < this.config.fixedPlatforms.length; index += 1) {
            if (!this.isCandidateReachable(this.platforms[index - 1], this.config.fixedPlatforms[index])) {
                throw new Error(`Unreachable initial platform ${this.config.fixedPlatforms[index].id}.`);
            }
        }
    }

    private createGeneratedPlatform(
        config: DoodleJumpFixedPlatformConfig,
        predecessorId: string,
        generationAttempts: number,
        degraded: boolean,
        mainRoute: boolean,
        layerIndex: number,
    ): MutablePlatform {
        return {
            config,
            generated: true,
            width: config.width,
            x: config.x,
            y: config.y,
            collisionEnabled: true,
            consumed: false,
            consumeAt: 0,
            effectStartedAt: 0,
            warningProgress: 0,
            predecessorId,
            generationAttempts,
            degraded,
            mainRoute,
            layerIndex,
        };
    }

    private clampPlatformX(x: number, width: number, type: DoodleJumpPlatformType): number {
        const padding = type === 'shifting' ? 70 : 0;
        return Math.max(width / 2 + padding, Math.min(this.config.design.width - width / 2 - padding, x));
    }

    private applyLargeMonsterPlatformWidths(): void {
        this.platforms.forEach((platform) => {
            if (platform.config.type !== 'normal'
                || !this.combat.hasLargeMonsterOnPlatform(platform.config.id)) return;
            platform.width = Math.max(
                platform.width,
                this.config.platformBehavior.largeMonsterWidth,
            );
        });
    }

    private updateWorldSystems(
        delta: number,
        cameraBottomY: number,
        cameraTopY: number,
        reconcile: boolean,
    ): void {
        this.combat.updateExisting(this.elapsedSeconds, this.worldIndex, cameraBottomY);
        if (reconcile) {
            this.fillCombatOccupiedScratch();
            this.combat.reconcileWorld(
                this.worldIndex,
                cameraBottomY,
                cameraTopY,
                this.combatOccupiedScratch,
            );
        }
        this.applyLargeMonsterPlatformWidths();
        this.hazards.updateExisting(
            delta,
            this.elapsedSeconds,
            this.worldIndex,
            this.playerX,
            cameraBottomY,
        );
        if (reconcile) {
            this.fillHazardOccupiedScratch();
            this.hazards.reconcileWorld(
                this.worldIndex,
                this.playerX,
                this.playerY,
                cameraBottomY,
                cameraTopY,
                this.hazardOccupiedScratch,
            );
        }
        this.items.updateExisting(this.worldIndex, cameraBottomY);
        if (reconcile) {
            this.fillItemOccupiedScratch();
            this.items.reconcileWorld(
                this.worldIndex,
                cameraBottomY,
                cameraTopY,
                this.itemOccupiedScratch,
            );
        }
    }

    private reconcileWorldSystems(cameraBottomY: number, cameraTopY: number): void {
        this.fillCombatOccupiedScratch();
        this.combat.reconcileWorld(
            this.worldIndex,
            cameraBottomY,
            cameraTopY,
            this.combatOccupiedScratch,
        );
        this.applyLargeMonsterPlatformWidths();
        this.fillHazardOccupiedScratch();
        this.hazards.reconcileWorld(
            this.worldIndex,
            this.playerX,
            this.playerY,
            cameraBottomY,
            cameraTopY,
            this.hazardOccupiedScratch,
        );
        this.fillItemOccupiedScratch();
        this.items.reconcileWorld(
            this.worldIndex,
            cameraBottomY,
            cameraTopY,
            this.itemOccupiedScratch,
        );
    }

    private baseWidthFor(platformId: string): number {
        const fixed = this.config.fixedPlatforms.find((platform) => platform.id === platformId);
        return fixed ? fixed.width : this.config.platformBehavior.standardWidth;
    }

    private isCandidateReachable(
        previous: MutablePlatform,
        candidate: DoodleJumpFixedPlatformConfig,
    ): boolean {
        const direction = candidate.x >= previous.x ? 1 : -1;
        const strategies: readonly number[] = [
            0,
            direction * 0.25,
            direction * 0.5,
            direction * 0.75,
            direction,
            -direction * 0.25,
            -direction * 0.5,
            -direction * 0.75,
            -direction,
            2,
        ];
        return this.isCandidateReachableWithStrategies(previous, candidate, strategies);
    }

    private isCandidateReachableWithStrategies(
        previous: MutablePlatform,
        candidate: DoodleJumpFixedPlatformConfig,
        strategies: readonly number[],
    ): boolean {
        const verticalGap = candidate.y - previous.config.y;
        if (verticalGap <= 0) return false;
        const player = this.config.player;
        const delta = this.config.fixedStep.seconds;
        const direction = candidate.x >= previous.x ? 1 : -1;
        for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
            let x = previous.x;
            let y = previous.y + player.collisionHeight / 2;
            let velocityX = 0;
            let velocityY = player.bounceVelocity;
            let elapsed = 0;
            while (elapsed < 2) {
                const previousFootY = y - player.collisionHeight / 2;
                const strategy = strategies[strategyIndex];
                const input = strategy === 2
                    ? (elapsed < 0.55 ? direction : -direction)
                    : strategy;
                if (Math.abs(input) > 0.0001) {
                    velocityX = moveTowards(
                        velocityX,
                        input * player.maxHorizontalSpeed,
                        player.horizontalAcceleration * delta,
                    );
                } else {
                    velocityX = moveTowards(
                        velocityX,
                        0,
                        player.horizontalDeceleration * delta,
                    );
                }
                const vertical = stepDoodleJumpVertical(velocityY, player.gravity, delta, player.terminalFallVelocity);
                velocityY = vertical.velocity;
                x += velocityX * delta;
                y += vertical.displacement;
                if (x < player.wrapLeft) x += player.wrapDistance;
                if (x > player.wrapRight) x -= player.wrapDistance;
                elapsed += delta;
                const targetX = this.platformXAt(candidate, this.elapsedSeconds + elapsed);
                const targetY = this.platformYAt(candidate, this.elapsedSeconds + elapsed);
                const previousTargetY = this.platformYAt(
                    candidate,
                    this.elapsedSeconds + elapsed - delta,
                );
                const currentFootY = y - player.collisionHeight / 2;
                const safeLandingReach = Math.max(
                    24,
                    candidate.width / 2 - player.collisionWidth * 0.15,
                );
                if (velocityY <= 0
                    && previousFootY >= previousTargetY
                    && currentFootY <= targetY) {
                    if (Math.abs(x - targetX) <= safeLandingReach) return true;
                    break;
                }
            }
        }
        return false;
    }

    private platformXAt(config: DoodleJumpFixedPlatformConfig, elapsedSeconds: number): number {
        if (config.type === 'moving') {
            const scale = this.config.design.width / 320;
            const velocity = config.movingVelocity ?? referenceMovingSpeed(
                config.y / scale, (hashDoodleJumpSeed(`${config.id}:moving`) % 1000) / 1000,
            ) * 60 * scale;
            return reflectedPlatformX(config.x, velocity,
                elapsedSeconds - (config.motionStartSeconds ?? 0), this.config.design.width);
        }
        if (config.type !== 'shifting') return config.x;
        const segment = shiftingPlatformSegmentAt(elapsedSeconds);
        return config.x + (segment - 1) * 70;
    }

    private platformYAt(config: DoodleJumpFixedPlatformConfig, elapsedSeconds: number): number {
        if (config.type !== 'vertical-moving') return config.y;
        const profile = this.verticalMovingPlatformProfile(config);
        return config.y + Math.sin(
            elapsedSeconds * Math.PI * 2 / profile.periodSeconds + profile.phaseRadians,
        ) * profile.amplitude;
    }

    private verticalMovingPlatformProfile(config: DoodleJumpFixedPlatformConfig): Readonly<{
        amplitude: number;
        periodSeconds: number;
        phaseRadians: number;
    }> {
        const cached = this.motionProfiles.get(config);
        if (cached) return cached;
        const settings = this.config.platformBehavior.verticalMoving;
        const hash = hashDoodleJumpSeed(`${config.id}:vertical-moving`);
        const amplitudeRange = settings.maximumAmplitude - settings.minimumAmplitude;
        const periodRange = settings.maximumPeriodSeconds - settings.minimumPeriodSeconds;
        const profile = Object.freeze({
            amplitude: settings.minimumAmplitude + (hash % 1001) / 1000 * amplitudeRange,
            periodSeconds: (settings.minimumPeriodSeconds
                + ((hash >>> 10) % 1001) / 1000 * periodRange)
                / this.platformSpeedMultiplier(config.y),
            phaseRadians: ((hash >>> 20) % 1001) / 1000 * Math.PI * 2,
        });
        this.motionProfiles.set(config, profile);
        return profile;
    }

    private platformChallengeProgress(heightMeters: number): number {
        const settings = this.config.platformBehavior.challenge;
        return Math.max(0, Math.min(1,
            (heightMeters - settings.startHeightMeters)
                / (settings.capHeightMeters - settings.startHeightMeters),
        ));
    }

    private platformSpeedMultiplier(worldY: number): number {
        const heightMeters = Math.max(0, (worldY - 114) / 100);
        return 1 + this.platformChallengeProgress(heightMeters)
            * this.config.platformBehavior.challenge.movingSpeedBonus;
    }

    private recyclePlatforms(): void {
        const recycleY = this.cameraBottomY - this.config.camera.recycleBelow;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            const platform = this.platforms[index];
            if (platform.config.y >= recycleY) continue;
            this.platforms.splice(index, 1);
        }
        this.enforcePlatformBudget();
    }

    private enforcePlatformBudget(): void {
        while (this.platforms.length > this.config.generation.maxActivePlatforms) {
            let removalIndex = -1;
            for (let index = 0; index < this.platforms.length; index += 1) {
                const platform = this.platforms[index];
                if (removalIndex < 0
                    || platform.config.y < this.platforms[removalIndex].config.y) {
                    removalIndex = index;
                }
            }
            if (removalIndex < 0) break;
            this.platforms.splice(removalIndex, 1);
        }
    }

    private nextPlatformRandom(): number {
        return this.randomStreams.next('platform');
    }

    private syncWorldIndex(): void {
        this.worldIndexRevision += 1;
        for (let index = 0; index < this.platforms.length; index += 1) {
            const source = this.platforms[index];
            const id = source.config.id;
            let worldPlatform = this.platformById.get(id);
            if (!worldPlatform || worldPlatform.source !== source) {
                worldPlatform = {
                    source,
                    revision: this.worldIndexRevision,
                    get id(): string { return source.config.id; },
                    get type(): DoodleJumpPlatformType { return source.config.type; },
                    get x(): number { return source.x; },
                    get y(): number { return source.y; },
                    get width(): number { return source.width; },
                    get collisionEnabled(): boolean { return source.collisionEnabled; },
                    get consumed(): boolean { return source.consumed; },
                    get spawnPlan(): DoodleJumpSpawnPlan | undefined { return source.config.spawnPlan; },
                };
                this.platformById.set(id, worldPlatform);
            }
            worldPlatform.revision = this.worldIndexRevision;
            this.worldPlatforms[index] = worldPlatform;
        }
        this.worldPlatforms.length = this.platforms.length;
        this.platformById.forEach((worldPlatform, id) => {
            if (worldPlatform.revision !== this.worldIndexRevision) this.platformById.delete(id);
        });
        for (let index = 1; index < this.worldPlatforms.length; index += 1) {
            const value = this.worldPlatforms[index];
            let cursor = index - 1;
            while (cursor >= 0) {
                const candidate = this.worldPlatforms[cursor];
                if (candidate.y < value.y
                    || (candidate.y === value.y && candidate.id.localeCompare(value.id) <= 0)) {
                    break;
                }
                this.worldPlatforms[cursor + 1] = candidate;
                cursor -= 1;
            }
            this.worldPlatforms[cursor + 1] = value;
        }
    }

    private fillCombatOccupiedScratch(): void {
        let cursor = this.items.writeOccupiedBodies(this.combatOccupiedScratch);
        cursor = this.hazards.writeOccupiedBodies(this.combatOccupiedScratch, cursor);
        this.combatOccupiedScratch.length = cursor;
    }

    private fillHazardOccupiedScratch(): void {
        let cursor = this.combat.writeOccupiedBodies(this.hazardOccupiedScratch);
        cursor = this.items.writeOccupiedBodies(this.hazardOccupiedScratch, cursor);
        this.hazardOccupiedScratch.length = cursor;
    }

    private fillItemOccupiedScratch(): void {
        let cursor = this.combat.writeOccupiedBodies(this.itemOccupiedScratch);
        cursor = this.hazards.writeOccupiedBodies(this.itemOccupiedScratch, cursor);
        this.itemOccupiedScratch.length = cursor;
    }
}
