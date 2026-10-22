import { DoodleJumpLevelGenerator } from './DoodleJumpLevelGenerator';
import { DoodleJumpCollectibleSystem, type DoodleJumpCollectibleSnapshot,
    type DoodleJumpCollectibleState, type DoodleJumpCollectibleEvent } from './DoodleJumpCollectibleSystem';
import {
    DOODLE_JUMP_RULES_VERSION,
    reflectedPlatformX,
    referenceMovingSpeed,
    stepDoodleJumpVertical,
    stepDoodleJumpHorizontal,
    referenceFootTouchesPlatform,
    referenceFootPlatformContact,
    referenceFootMidpointX,
    referenceFootNeedsSweep,
    referenceSine,
    referenceShiftEasing,
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
    | DoodleJumpHazardFailureReason;

export interface DoodleJumpProjectileTargetHit {
    readonly targetType: 'enemy' | 'ufo';
    readonly enemyHit?: DoodleJumpProjectileHitResult;
    readonly x: number;
    readonly y: number;
}

export interface DoodleJumpProjectileSnapshot {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly remainingSeconds: number;
}
interface MutableProjectile {
    id: number; x: number; y: number; previousX: number; previousY: number;
    velocityX: number; velocityY: number; remainingSeconds: number;
}

export interface DoodleJumpPlatformEffectState {
    motionActivatedAt: number;
    restX: number;
    restY: number;
    shiftStartedAt: number;
    shiftFromX: number;
    shiftFromY: number;
    shiftTargetX: number;
    shiftTargetY: number;
    shiftDurationSeconds: number;
    portalFadingIn: boolean;
    shiftProgress: number;
    shakePhase: number;
    shakeRate: number;
    shiftTimerFrames: number;
}

function initialPlatformEffect(config: DoodleJumpFixedPlatformConfig): DoodleJumpPlatformEffectState {
    return { motionActivatedAt: -1, restX: config.x, restY: config.y, shiftStartedAt: -1,
        shiftFromX: config.x, shiftFromY: config.y, shiftTargetX: config.x, shiftTargetY: config.y,
        shiftDurationSeconds: 0, portalFadingIn: false, shiftProgress: 0, shakePhase: -1,
        shakeRate: 12 + hashDoodleJumpSeed(config.id) % 5, shiftTimerFrames: -1 };
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
    readonly effectState?: Readonly<DoodleJumpPlatformEffectState>;
    readonly predecessorId?: string;
    readonly generationAttempts: number;
    readonly degraded: boolean;
    readonly mainRoute: boolean;
    readonly layerIndex: number;
}

export interface DoodleJumpSimulationSnapshot {
    readonly collectibles: readonly DoodleJumpCollectibleSnapshot[];
    readonly collectibleState: DoodleJumpCollectibleState;
    readonly rulesVersion: number;
    readonly filteredTilt: number;
    readonly projectiles: readonly DoodleJumpProjectileSnapshot[];
    readonly nextProjectileId: number;
    readonly shotCooldownFrames: number;
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
    readonly collectibles: readonly DoodleJumpCollectibleSnapshot[];
    readonly collectedCarrotCount: number;
    readonly projectiles: readonly DoodleJumpProjectileSnapshot[];
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
    spawnPlan?: DoodleJumpSpawnPlan;
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
    collectibles: readonly DoodleJumpCollectibleSnapshot[];
    collectedCarrotCount: number;
    projectiles: readonly DoodleJumpProjectileSnapshot[];
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
    effectState: DoodleJumpPlatformEffectState;
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

export class DoodleJumpSimulation {
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
    private readonly collectibles: DoodleJumpCollectibleSystem;
    private readonly levelGenerator: DoodleJumpLevelGenerator;
    private presentationVisibleHeight = 1334;
    private generatorCursor = 0;
    private generatedLayerCount = 0;
    private latestMainLayer: MutablePlatform[] = [];
    private degradedGenerationCount = 0;
    private nextGeneratedId = 1;
    private accumulator = 0;
    private elapsedSeconds = 0;
    private droppedFrameSeconds = 0;
    private playerX = 375;
    private playerY = 114;
    private velocityX = 0;
    private filteredTilt = 0;
    private readonly projectiles: MutableProjectile[] = [];
    private readonly presentationProjectiles: MutableProjectile[] = [];
    private nextProjectileId = 1;
    private shotCooldownFrames = 0;
    private shotsFired = 0;
    private fireHeld = false;
    private fireAimX = 0;
    private fireAimY = 1;
    private queuedShot?: { x: number; y: number };

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
    private readonly previousCollectiblePositions = new Map<string, InterpolationOrigin>();

    constructor(private readonly config: DoodleJumpGameplayConfig, seed: string | number = 1) {
        this.initialSeed = hashDoodleJumpSeed(seed) || 1;
        this.randomStreams = new DoodleJumpRandomStreams(this.initialSeed);
        this.levelGenerator = new DoodleJumpLevelGenerator(config, this.randomStreams);
        this.combat = new DoodleJumpCombatSystem(config, this.randomStreams);
        this.hazards = new DoodleJumpHazardSystem(config, this.randomStreams);
        this.items = new DoodleJumpItemSystem(config, this.randomStreams);
        this.collectibles = new DoodleJumpCollectibleSystem(config);
        this.platforms = [];
        this.worldIndex = {
            platforms: this.worldPlatforms,
            platformById: this.platformById,
        };
        this.presentationView = {
            collectibles: this.collectibles.getPresentationCollectibles(),
            collectedCarrotCount: 0,
            projectiles: this.presentationProjectiles,
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
        this.clearProjectiles();
        this.nextProjectileId = 1;
        const start = this.config.fixedPlatforms[0];
        this.playerX = start.x;
        this.playerY = start.y + this.config.player.collisionHeight / 2;
        this.velocityX = 0;
        this.filteredTilt = 0;
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
        this.collectibles.reset();
        this.generatorCursor = 0;
        this.generatedLayerCount = 0;
        this.degradedGenerationCount = 0;
        this.nextGeneratedId = this.config.fixedPlatforms.length;
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
                effectState: initialPlatformEffect(platform),
                warningProgress: 0,
                predecessorId: index > 0
                    ? this.config.fixedPlatforms[index - 1].id
                    : undefined,
                generationAttempts: 0,
                degraded: false,
                mainRoute: true,
                layerIndex: index + 1 - this.config.fixedPlatforms.length,
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
            platform.effectState = initialPlatformEffect(platform.config);
            platform.warningProgress = 0;
            platform.predecessorId = index > 0 ? this.platforms[index - 1].config.id : undefined;
            platform.generationAttempts = 0;
            platform.degraded = false;
            platform.mainRoute = true;
            platform.layerIndex = index + 1 - this.config.fixedPlatforms.length;
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
        // Existing classic saves remain valid; removed-theme rounds cannot
        // be replayed with a different deck and collision model.
        const legacyTheme = (snapshot as DoodleJumpSimulationSnapshot & { themeId?: unknown }).themeId;
        if ((legacyTheme !== undefined && legacyTheme !== 'classic')
            || snapshot.rulesVersion !== DOODLE_JUMP_RULES_VERSION
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
        this.filteredTilt = finite(snapshot.filteredTilt, 'filteredTilt');
        this.clearProjectiles();
        if (!Array.isArray(snapshot.projectiles) || snapshot.projectiles.length > 128
            || !Number.isSafeInteger(snapshot.nextProjectileId) || snapshot.nextProjectileId < 1
            || !Number.isSafeInteger(snapshot.shotCooldownFrames) || snapshot.shotCooldownFrames < 0) {
            throw new Error('Invalid restored projectile state.');
        }
        this.nextProjectileId = snapshot.nextProjectileId;
        this.shotCooldownFrames = snapshot.shotCooldownFrames;
        const projectileIds = new Set<number>();
        for (const projectile of snapshot.projectiles) {
            if (!Number.isSafeInteger(projectile.id) || projectile.id < 1
                || projectile.id >= this.nextProjectileId || projectileIds.has(projectile.id)) {
                throw new Error('Invalid restored projectile ID.');
            }
            projectileIds.add(projectile.id);
            const x = finite(projectile.x, 'projectile.x'), y = finite(projectile.y, 'projectile.y');
            this.projectiles.push({ id: projectile.id, x, y, previousX: x, previousY: y,
                velocityX: finite(projectile.velocityX, 'projectile.velocityX'),
                velocityY: finite(projectile.velocityY, 'projectile.velocityY'),
                remainingSeconds: Math.max(0, finite(projectile.remainingSeconds, 'projectile.remainingSeconds')) });
        }
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
        let maximumGeneratedId = this.config.fixedPlatforms.length - 1;
        snapshot.platforms.forEach((platform) => {
            const generatedId = Number(/^(?:G|resurrect-safe-)(\d+)$/.exec(platform.id)?.[1]);
            if (Number.isInteger(generatedId)) maximumGeneratedId = Math.max(
                maximumGeneratedId,
                generatedId,
            );
            const restoredX = finite(platform.x, `platform ${platform.id} x`);
            const restoredY = finite(platform.y, `platform ${platform.id} y`);
            // Native platforms share one width, except the starter floor.
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
                effectState: { ...initialPlatformEffect(config), ...platform.effectState },
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
        this.collectibles.restore(snapshot.collectibles, snapshot.collectibleState, this.worldIndex);
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
            this.step(fixedDelta, Number.isFinite(horizontalInput)
                ? Math.max(-1 / this.config.sensor.fullTilt, Math.min(1 / this.config.sensor.fullTilt, horizontalInput)) : 0, visibleHeight);
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
     * above the starting floor and spawn its monsters, hazards and items in one
     * frame, which is the hitch on the first jump after spawning.
     */
    prepareWorld(visibleHeight: number): void {
        const safeVisibleHeight = Math.max(1, visibleHeight);
        this.presentationVisibleHeight = safeVisibleHeight;
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

    queueShot(aimX: number, aimY: number): void {
        if (!this.fatalReason) this.queuedShot = this.normalizedAim(aimX, aimY);
    }

    setFireHeld(held: boolean, aimX: number, aimY: number): void {
        this.fireHeld = held;
        const aim = this.normalizedAim(aimX, aimY);
        this.fireAimX = aim.x; this.fireAimY = aim.y;
    }

    clearFireInput(discardQueuedShot = true): void {
        this.fireHeld = false;
        if (discardQueuedShot) this.queuedShot = undefined;
    }

    clearProjectiles(): void {
        this.projectiles.length = 0; this.presentationProjectiles.length = 0;
        this.shotCooldownFrames = 0; this.shotsFired = 0; this.clearFireInput();
    }

    drainShotsFired(): number { const count = this.shotsFired; this.shotsFired = 0; return count; }

    private normalizedAim(x: number, y: number): { x: number; y: number } {
        const length = Math.hypot(x, y);
        return Number.isFinite(length) && length > 1e-6 ? { x: x / length, y: y / length } : { x: 0, y: 1 };
    }

    private updateProjectiles(delta: number, visibleHeight: number): void {
        if (this.shotCooldownFrames > 0) this.shotCooldownFrames -= 1;
        // Resolve existing bullets before player contact, using the same physics clock.
        for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
            const projectile = this.projectiles[index];
            projectile.previousX = projectile.x; projectile.previousY = projectile.y;
            projectile.x += projectile.velocityX * delta; projectile.y += projectile.velocityY * delta;
            projectile.remainingSeconds -= delta;
            const hit = this.hitEnemyByProjectileSweep(projectile.previousX, projectile.previousY, projectile.x, projectile.y);
            if (hit || projectile.remainingSeconds <= 1e-8
                || projectile.y <= this.cameraBottomY - 160
                || projectile.y >= this.cameraBottomY + visibleHeight + 160) this.projectiles.splice(index, 1);
        }
        const queued = this.queuedShot;
        this.queuedShot = undefined;
        if ((!queued && !this.fireHeld) || this.shotCooldownFrames > 0 || this.hazards.isPlayerCaptured()) return;
        const aim = queued ?? { x: this.fireAimX, y: this.fireAimY };
        const x = this.playerX + aim.x * 34, y = this.playerY + aim.y * 34;
        this.projectiles.push({ id: this.nextProjectileId++, x, y, previousX: x, previousY: y,
            velocityX: aim.x * this.config.shooting.speed, velocityY: aim.y * this.config.shooting.speed,
            remainingSeconds: this.config.shooting.lifetimeSeconds });
        this.shotCooldownFrames = Math.ceil(this.config.shooting.cooldownMs / (delta * 1000));
        this.shotsFired += 1;
    }

    hitEnemyByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
    ): DoodleJumpProjectileTargetHit | undefined {
        if (this.fatalReason || this.hazards.isPlayerCaptured()) return undefined;
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
                effectState: initialPlatformEffect(generatedConfig),
                warningProgress: 0,
                predecessorId: undefined,
                generationAttempts: 0,
                degraded: true,
                mainRoute: true,
                layerIndex: this.generatedLayerCount + 1,
            };
            this.platforms.push(target);
            this.levelGenerator.acceptRecoveryAnchor(generatedConfig);
            this.latestMainLayer = [target];
            this.generatedLayerCount = target.layerIndex;
            safePlatformGenerated = true;
            this.syncWorldIndex();
            this.worldNeedsPreStepReconcile = true;
        }

        const targetScreenY = this.cameraAnchorHeight(visibleHeight);
        this.cameraBottomY = Math.max(this.cameraBottomY, target.y - targetScreenY);
        this.playerX = target.x;
        this.playerY = target.y + this.config.player.collisionHeight / 2;
        this.velocityX = 0;
        this.filteredTilt = 0;
        this.clearProjectiles();
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
            collectibles: this.collectibles.getSnapshots(),
            collectibleState: this.collectibles.getState(),
            rulesVersion: DOODLE_JUMP_RULES_VERSION,
            filteredTilt: this.filteredTilt,
            projectiles: Object.freeze(this.projectiles.map(({ id, x, y, velocityX, velocityY, remainingSeconds }) =>
                Object.freeze({ id, x, y, velocityX, velocityY, remainingSeconds }))),
            nextProjectileId: this.nextProjectileId,
            shotCooldownFrames: this.shotCooldownFrames,
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
                effectState: Object.freeze({ ...platform.effectState }),
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
                    spawnPlan: platform.config.spawnPlan,
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
            presentation.spawnPlan = platform.config.spawnPlan;
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
        this.presentationView.collectibles = this.collectibles.getPresentationCollectibles();
        this.presentationView.collectedCarrotCount = this.collectibles.getCount();
        this.presentationView.seed = this.initialSeed;
        this.presentationView.generatorCursor = this.generatorCursor;
        this.presentationView.degradedGenerationCount = this.degradedGenerationCount;
        this.presentationView.itemRandomCursor = this.randomStreams.getCursor('item');
        this.presentationView.platforms = this.presentationPlatforms;
        this.presentationView.enemies = this.combat.getPresentationEnemies();
        const alpha = this.interpolationReady ? Math.min(1, this.accumulator / this.config.fixedStep.seconds) : 1;
        for (let index = 0; index < this.projectiles.length; index += 1) {
            const projectile = this.projectiles[index];
            const presented = this.presentationProjectiles[index] ?? { ...projectile };
            Object.assign(presented, projectile);
            presented.x = projectile.previousX + (projectile.x - projectile.previousX) * alpha;
            presented.y = projectile.previousY + (projectile.y - projectile.previousY) * alpha;
            this.presentationProjectiles[index] = presented;
        }
        this.presentationProjectiles.length = this.projectiles.length;
        this.applyPresentationInterpolation();
        return this.presentationView;
    }

    /** Input only needs the displayed player X, without rebuilding every entity's render view. */
    getPresentedPlayerX(): number {
        if (!this.interpolationReady) return this.playerX;
        const alpha = Math.max(0, Math.min(1, this.accumulator / this.config.fixedStep.seconds));
        return this.interpolateContinuous(this.previousPlayerX, this.playerX, alpha);
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
        this.recordInterpolationOrigins(this.previousCollectiblePositions, this.collectibles.getPresentationCollectibles(), stamp);
        this.pruneInterpolationOrigins(this.previousCollectiblePositions, stamp);
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
        this.interpolatePositions(view.collectibles as unknown as PresentedPosition[],
            this.previousCollectiblePositions, alpha);
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

    drainCollectibleEvents(): readonly DoodleJumpCollectibleEvent[] {
        return this.collectibles.drainEvents();
    }

    /** Presentation uses the same body height as landing and hazard contact. */
    get playerCollisionHeight(): number { return this.config.player.collisionHeight; }

    private step(delta: number, input: number, visibleHeight: number): void {
        this.presentationVisibleHeight = visibleHeight;
        this.elapsedSeconds += delta;
        this.monsterContactGraceRemaining = Math.max(
            0,
            this.monsterContactGraceRemaining - delta,
        );
        this.updatePlatforms(delta, visibleHeight);
        this.updateWorldSystems(
            delta,
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.worldNeedsPreStepReconcile,
        );
        this.worldNeedsPreStepReconcile = false;
        this.updateProjectiles(delta, visibleHeight);
        const player = this.config.player;
        const scale = this.config.design.width / 320;
        const itemPhysics = this.items.getPhysics(this.velocityY);
        const steering = stepDoodleJumpHorizontal(this.filteredTilt, input * this.config.sensor.fullTilt,
            delta, this.config.sensor.smoothingSeconds,
            player.maxHorizontalSpeed / (this.config.sensor.fullTilt * 60 * scale), scale);
        this.filteredTilt = steering.filteredTilt;
        this.velocityX = steering.velocity;
        const previousPlayerX = this.playerX;
        const previousPlayerY = this.playerY;
        const previousFootY = this.playerY - player.collisionHeight / 2;
        const captured = this.hazards.isPlayerCaptured();
        if (itemPhysics.initialVerticalVelocity !== undefined) this.velocityY = itemPhysics.initialVerticalVelocity;
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
        if (captured) { this.velocityX = 0; this.velocityY = 0; }
        else { this.playerX += this.velocityX * delta; this.playerY += verticalDisplacement; }
        const shoeStepVelocity = this.items.updateTimers(delta, this.playerX, this.playerY, this.velocityY);
        if (shoeStepVelocity !== undefined) this.velocityY = shoeStepVelocity;
        if (this.playerX < player.wrapLeft) this.playerX += player.wrapDistance;
        if (this.playerX > player.wrapRight) this.playerX -= player.wrapDistance;
        this.collectibles.reconcileWorld(this.worldIndex, this.cameraBottomY);
        if (!captured) this.collectibles.resolvePickups(previousPlayerX, previousPlayerY, this.playerX, this.playerY);
        const collisionVelocityY = this.velocityY;
        const collisionPlayerY = this.playerY;
        // Platform-anchored landing items must be collected before resolving
        // the same downward platform contact. Otherwise spring/trampoline is
        // stored until a later landing and appears to do nothing on pickup.
        const pickup = captured ? undefined : this.items.resolvePickups(
            this.playerX,
            this.playerY,
            player.collisionWidth,
            player.collisionHeight, previousFootY, this.velocityY,
        );
        if (pickup) {
            this.velocityY = pickup.velocityY;
            if (pickup.surfaceY !== undefined) this.playerY = pickup.surfaceY + player.collisionHeight / 2;
            if (pickup.playerX !== undefined) this.playerX = pickup.playerX;
            if (pickup.playerY !== undefined) this.playerY = pickup.playerY;
        }
        if (!captured && !pickup && this.velocityY <= 0 && itemPhysics.platformCollisionEnabled) {
            this.resolveLanding(previousFootY, previousPlayerX);
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
            this.velocityY = 11 * 60 * this.config.design.width / 320;
        }
        const playerInvincible = this.items.hasFlightInvincibility()
            || this.items.hasTrampolineInvincibility()
            || this.items.hasShield();
        const hazardResult = this.hazards.resolvePlayer(
            delta,
            this.playerX,
            this.playerY,
            previousFootY,
            player.collisionWidth,
            player.collisionHeight,
            playerInvincible,
        );
        if (hazardResult.capturedPlayerX !== undefined && hazardResult.capturedPlayerY !== undefined) {
            this.playerX = hazardResult.capturedPlayerX; this.playerY = hazardResult.capturedPlayerY;
            this.velocityX = 0; this.velocityY = 0;
        }
        if (hazardResult.bounceSurfaceY !== undefined) {
            this.playerY = hazardResult.bounceSurfaceY + player.collisionHeight / 2;
            this.velocityY = 11 * 60 * this.config.design.width / 320;
        }
        if (combatResult.outcome === 'contact' && playerInvincible && combatResult.enemyId) {
            this.combat.defeatContactEnemy(combatResult.enemyId);
        }
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

    private updatePlatforms(delta: number, visibleHeight: number): void {
        const scale = this.config.design.width / 320;
        for (const platform of this.platforms) {
            if (platform.config.spawnPlan?.entityOnly || platform.consumed) continue;
            const state = platform.effectState;
            const type = platform.config.type;
            if (type === 'moving') platform.x = this.platformXAt(platform.config, this.elapsedSeconds);
            if (type === 'vertical-moving') {
                const raw = platform.config.spawnPlan?.referenceRawType ?? 12;
                const downwardRange = raw % 2 === 1 ? (raw >= 14 ? 130 : 200) * scale : 0;
                if (state.motionActivatedAt < 0 && platform.config.y - downwardRange - this.cameraBottomY < visibleHeight + 10 * scale)
                    state.motionActivatedAt = this.elapsedSeconds;
                if (state.motionActivatedAt >= 0) platform.y = this.verticalPlatformY(platform.config,
                    this.elapsedSeconds - state.motionActivatedAt);
            }
            const shaking = type === 'shifting' && platform.config.spawnPlan?.referenceRawType === 41;
            if (shaking && state.shiftTimerFrames >= 400) {
                // Native shaking moves toward the target from the PREVIOUS position,
                // with a shrinking ratio, then snaps once the per-frame change is <0.2.
                const f = Math.fround;
                state.shiftTimerFrames = f(state.shiftTimerFrames - delta * 60);
                const previousX = f(platform.x / scale), targetX = f(state.shiftTargetX / scale);
                const ratio = f(f(state.shiftTimerFrames - 400) * f(0.012658228));
                let x = f(targetX + f(previousX - targetX) * ratio);
                if (state.shiftTimerFrames < 470 && Math.abs(previousX - x) < 0.2) {
                    x = targetX; state.shakePhase = previousX <= targetX ? 180 : 0;
                    state.shiftTimerFrames = -1; state.shiftStartedAt = -1; state.restX = state.shiftTargetX;
                }
                platform.x = x * scale;
            } else if (state.shiftStartedAt >= 0) {
                const progress = Math.min(1, state.shiftProgress);
                const eased = referenceShiftEasing(progress);
                platform.x = Math.fround(state.shiftFromX / scale
                    + Math.fround((state.shiftTargetX - state.shiftFromX) / scale) * eased) * scale;
                platform.y = Math.fround(state.shiftFromY / scale
                    + Math.fround((state.shiftTargetY - state.shiftFromY) / scale) * eased) * scale;
                state.shiftProgress = Math.min(1, Math.fround(state.shiftProgress + Math.fround(delta / state.shiftDurationSeconds)));
                if (state.shiftProgress >= 1) {
                    state.restX = platform.x; state.restY = platform.y; state.shiftStartedAt = -1;
                    if (type === 'teleport') platform.collisionEnabled = true;
                }
            } else if (type === 'shifting') {
                if (shaking) {
                    if (state.shakePhase < 0) { state.restX = Math.trunc(platform.x / scale) * scale; state.shakePhase = 0; }
                    platform.x = Math.fround(state.restX / scale + Math.fround(referenceSine(state.shakePhase) * 5)) * scale;
                    state.shakePhase = Math.fround(state.shakePhase + delta * 60 * state.shakeRate);
                    if (state.shakePhase >= 360) state.shakePhase -= 360;
                } else platform.x = state.restX;
            }
            if (type === 'exploding') {
                if (platform.effectStartedAt > 0) {
                    const progress = Math.min(1, (this.elapsedSeconds - platform.effectStartedAt) / (13 / 60));
                    platform.warningProgress = 1 + progress;
                    if (progress >= 1) platform.consumed = true;
                    continue;
                }
                const threshold = platform.config.spawnPlan?.referenceRawType === 16 ? 150 * scale : visibleHeight + 10 * scale;
                if (platform.consumeAt <= 0 && platform.y - this.cameraBottomY < threshold)
                    platform.consumeAt = this.elapsedSeconds + (platform.config.spawnPlan?.referenceRawType === 16 ? 60
                        : 60 + hashDoodleJumpSeed(platform.config.id) % 120) / 60;
                if (platform.consumeAt <= 0) continue;
                const remaining = platform.consumeAt - this.elapsedSeconds;
                platform.warningProgress = Math.max(0, Math.min(1, 1 - remaining));
                if (remaining <= 3 / 60) {
                    platform.collisionEnabled = false; platform.effectStartedAt = this.elapsedSeconds; platform.warningProgress = 1.001;
                }
                continue;
            }
            if (platform.consumeAt <= 0) continue;
            if (type === 'breakable') platform.y -= 3.5 * scale * delta * 60;
            const duration = type === 'breakable' ? 50 / 60 : this.config.platformBehavior.teleport.fadeSeconds;
            const progress = Math.max(0, Math.min(1, 1 - (platform.consumeAt - this.elapsedSeconds) / duration));
            platform.warningProgress = state.portalFadingIn ? 1 - progress : progress;
            if (this.elapsedSeconds + 1e-7 < platform.consumeAt) continue;
            if (state.portalFadingIn) {
                state.portalFadingIn = false; platform.consumeAt = 0; platform.collisionEnabled = true; platform.warningProgress = 0;
            } else {
                platform.collisionEnabled = false; platform.consumed = true; platform.warningProgress = 1;
            }
        }
    }

    private activatePlatformLandingEffect(platform: MutablePlatform): void {
        if (platform.config.type === 'shifting') {
            const scale = this.config.design.width / 320;
            const shaking = platform.config.spawnPlan?.referenceRawType === 41;
            const challenge = Math.min(1, this.cameraBottomY / scale / 25000);
            for (const target of this.platforms) {
                if (target.config.type !== 'shifting' || target.consumed
                    || (target.config.spawnPlan?.referenceRawType === 41) !== shaking) continue;
                const state = target.effectState;
                const minimumDistance = shaking ? 50 : Math.trunc(5 + challenge * 45);
                const maximumDistance = shaking ? 115 : Math.trunc(50 + challenge * 65);
                const distance = minimumDistance + Math.floor(this.nextPlatformRandom() * (maximumDistance - minimumDistance));
                const origin = Math.trunc((shaking
                    ? state.shiftTimerFrames >= 400 ? state.shiftTargetX : state.restX
                    : target.x) / scale);
                let x: number;
                if (shaking) {
                    x = origin + (this.nextPlatformRandom() < 0.5 ? distance : -distance);
                    if (x <= 32) x += 225; else if (x >= 259) x -= 225;
                } else {
                    const moveLeft = origin + distance > 287 || this.nextPlatformRandom() < 0.5;
                    x = origin + (moveLeft ? -distance : distance);
                    if (x <= 33) x = Math.min(origin + distance, 287);
                }
                state.shiftProgress = 0;
                if (shaking) { state.shiftTimerFrames = 480; state.shakeRate = 12 + Math.floor(this.nextPlatformRandom() * 5); }
                state.shiftStartedAt = this.elapsedSeconds; state.shiftFromX = target.x; state.shiftFromY = target.y;
                state.shiftTargetX = x * scale; state.shiftTargetY = target.y;
                state.shiftDurationSeconds = shaking ? 79 / 60 : 1 / ((0.025 + 0.035 * challenge) * 60);
            }
        }
        if (platform.config.type !== 'teleport') return;
        const plan = platform.config.spawnPlan;
        const next = this.platforms.find((candidate) => candidate !== platform && candidate.config.type === 'teleport'
            && candidate.config.spawnPlan?.patternId === plan?.patternId
            && candidate.config.spawnPlan?.segmentId === plan?.segmentId && !candidate.consumed
            && !candidate.collisionEnabled && candidate.consumeAt <= 0 && candidate.config.spawnPlan?.initialHidden);
        const moving = plan?.referenceRawType === 53;
        if (moving && next) {
            const state = platform.effectState;
            state.shiftProgress = 0;
            state.shiftStartedAt = this.elapsedSeconds; state.shiftFromX = platform.x; state.shiftFromY = platform.y;
            state.shiftTargetX = next.x; state.shiftTargetY = next.y; state.shiftDurationSeconds = 1 / (0.06 * 60);
            platform.collisionEnabled = false; next.consumed = true;
            return;
        }
        if (moving) return;
        platform.collisionEnabled = false;
        platform.consumeAt = this.elapsedSeconds + this.config.platformBehavior.teleport.fadeSeconds;
        if (next) {
            next.effectState.portalFadingIn = true;
            next.consumeAt = this.elapsedSeconds + this.config.platformBehavior.teleport.fadeSeconds;
        }
    }

    private resolveLanding(previousFootY: number, previousPlayerX: number): void {
        const scale = this.config.design.width / 320;
        const shoes = this.items.hasSpringShoes();
        // Native ordinary shoes (world+0x85e0): foot left +4, width -4,
        // foot bottom -15. The previous sweep point keeps the ordinary body offset.
        const currentFootY = this.playerY - this.config.player.collisionHeight / 2 - (shoes ? 15 * scale : 0);
        const footX = this.playerX + (shoes ? 2 * scale : 0);
        const previousFootX = previousPlayerX - (shoes ? 2 * scale : 0);
        const footWidth = this.config.player.collisionWidth - (shoes ? 4 * scale : 0);
        const sweep = referenceFootNeedsSweep(this.velocityX * this.config.fixedStep.seconds,
            this.velocityY, this.config.fixedStep.seconds, scale);
        for (let index = 0; index < this.platforms.length; index += 1) {
            const platform = this.platforms[index];
            if (!platform.collisionEnabled) continue;
            const topY = platform.y;
            if (topY < this.cameraBottomY) continue;
            const contact = referenceFootPlatformContact(previousFootX, footX, previousFootY, currentFootY,
                footWidth, platform.x, topY, platform.width, scale, sweep);
            if (!contact) continue;
            if (contact === 2) {
                this.playerX = referenceFootMidpointX(previousFootX, footX, scale) + (shoes ? 2 * scale : 0);
                this.playerY = (previousFootY + currentFootY) / 2 + this.config.player.collisionHeight / 2;
            }
            if (platform.config.type === 'breakable') {
                platform.collisionEnabled = false;
                platform.consumeAt = this.elapsedSeconds + 50 / 60;
                platform.warningProgress = 0;
                this.lastLandedPlatformId = platform.config.id;
                return;
            }
            this.velocityY = this.items.consumeLandingPower(this.playerX, topY)
                ?? this.config.player.bounceVelocity;
            this.lastLandedPlatformId = platform.config.id;
            this.landingCount += 1;
            if (platform.consumeAt <= 0 && platform.config.type === 'disappearing') {
                platform.collisionEnabled = false;
                platform.consumeAt = this.elapsedSeconds + 10 / 60;
            }
            this.activatePlatformLandingEffect(platform);
            return;
        }
    }

    private ensureGenerated(visibleHeight: number): void {
        if (!this.config.generation.enabled) return;
        const generationTop = this.cameraBottomY
            + Math.max(500 * this.config.design.width / 320,
                Math.max(1, visibleHeight) + this.config.generation.preloadAboveScreen);
        let highest = this.findHighestPlatform();
        if (highest.config.y >= generationTop) return;
        this.levelGenerator.beginGenerationPass();
        const apex = this.items.forecastFlightApex(this.playerY, this.velocityY);
        const flightLandingWindow = apex === undefined ? undefined : {
            minimumY: Math.max(this.cameraBottomY, apex - this.cameraAnchorHeight(visibleHeight))
                + this.config.player.collisionHeight / 2,
            maximumY: apex - this.config.player.collisionHeight,
        };
        while (highest.config.y < generationTop
            && this.platforms.length < this.config.generation.maxActivePlatforms) {
            this.platforms.push(this.generateReachablePlatform(highest, flightLandingWindow));
            highest = this.findHighestPlatform();
        }
    }

    private generateReachablePlatform(
        previous: MutablePlatform,
        flightLandingWindow?: Readonly<{ minimumY: number; maximumY: number }>,
    ): MutablePlatform {
        const itemStatus = this.items.getStatus();
        const planned = this.levelGenerator.next(previous.config.y, this.cameraBottomY, {
            flightPower: itemStatus.flightPower,
            flightLandingWindow,
            shieldActive: itemStatus.shieldRemainingSeconds > 0,
            jetpackPickupCount: itemStatus.jetpackPickupCount,
            nativeThemeMode: 0,
        });
        const nextLayer = this.generatedLayerCount + 1;
        // Authored relay chains and vertical platforms can advance through
        // positions that an ordinary-jump-only validator cannot mark mainRoute.
        // Base the next procedural row on the highest landing anchor in the
        // current chunk, rather than retaining a predecessor from an old chunk.
        const anchors = this.platforms.filter((platform) => !platform.config.spawnPlan?.entityOnly
            && platform.config.type !== 'breakable');
        const routePrevious = anchors.length > 0 ? anchors.reduce((highest, platform) =>
            platform.config.y > highest.config.y ? platform : highest) : previous;
        const jumpHeight = this.config.player.bounceVelocity ** 2 / (-2 * this.config.player.gravity)
            + this.config.player.bounceVelocity * this.config.fixedStep.seconds / 2;
        let type = this.config.generation.platformTypeOverride === 'auto'
            ? planned.type : this.config.generation.platformTypeOverride;
        // A broken platform is optional scenery. Recover before a run of fragile
        // platforms can consume the entire ordinary-jump height budget.
        if (type === 'breakable'
            && planned.y - routePrevious.config.y > jumpHeight) type = 'normal';
        const width = this.config.platformBehavior.standardWidth;
        if (planned.spawnPlan.patternId !== undefined || planned.spawnPlan.entityOnly) {
            const candidate: DoodleJumpFixedPlatformConfig = Object.freeze({ id: `G${this.nextGeneratedId++}`,
                x: planned.x, y: planned.y, width, type: planned.type, movingVelocity: planned.movingVelocity,
                motionStartSeconds: this.elapsedSeconds, spawnPlan: planned.spawnPlan });
            const mainRoute = !planned.spawnPlan.entityOnly && !planned.spawnPlan.initialHidden && type !== 'breakable'
                && planned.y > routePrevious.config.y && this.isCandidateReachable(routePrevious, candidate);
            const platform = this.createGeneratedPlatform(candidate, routePrevious.config.id, 1, false, mainRoute, nextLayer);
            this.generatorCursor += 1; this.generatedLayerCount = nextLayer;
            if (mainRoute) this.latestMainLayer = [platform];
            return platform;
        }
        const limit = this.config.generation.forceDegradedFallback ? 0 : this.config.generation.maxCandidateAttempts;
        for (let attempt = 1; attempt <= limit; attempt += 1) {
            const candidate: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: `G${this.nextGeneratedId}`,
                x: attempt === 1 ? planned.x : (Math.floor(this.nextPlatformRandom()
                    * (320 - Math.floor(width / (this.config.design.width / 320))))
                    + Math.floor(width / (this.config.design.width / 320) / 2)) * this.config.design.width / 320,
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
            x: this.clampPlatformX(routePrevious.x, width),
            y: Math.min(planned.y, routePrevious.config.y + 40),
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
        // The next segment must start at this accepted position, including a
        // recovery's lower Y. Advancing from the rejected proposal accumulates
        // height debt and eventually places an authored chunk above an empty gap.
        this.levelGenerator.acceptPlacement(config);
        return {
            config,
            generated: true,
            width: config.width,
            x: config.x,
            y: config.y,
            collisionEnabled: !config.spawnPlan?.entityOnly && !config.spawnPlan?.initialHidden,
            consumed: false,
            consumeAt: 0,
            effectStartedAt: 0,
            effectState: initialPlatformEffect(config),
            warningProgress: config.spawnPlan?.initialHidden ? 1 : 0,
            predecessorId,
            generationAttempts,
            degraded,
            mainRoute,
            layerIndex,
        };
    }

    private clampPlatformX(x: number, width: number): number {
        const halfWidth = Math.floor(width / (this.config.design.width / 320) / 2) * this.config.design.width / 320;
        return Math.max(halfWidth, Math.min(this.config.design.width - halfWidth, x));
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
        this.collectibles.reconcileWorld(this.worldIndex, cameraBottomY);
        this.fillCombatOccupiedScratch();
        this.combat.reconcileWorld(
            this.worldIndex,
            cameraBottomY,
            cameraTopY,
            this.combatOccupiedScratch,
        );
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
        // Validate an achievable launch with the same steering/foot logic as
        // the live player. A bad edge landing is player difficulty, not a reason
        // to reroll every otherwise playable native platform arrangement.
        return this.isCandidateReachableWithStrategies(previous, candidate, strategies);
    }

    private isCandidateReachableWithStrategies(
        previous: MutablePlatform,
        candidate: DoodleJumpFixedPlatformConfig,
        strategies: readonly number[],
        maximumInput = 1,
        launchX = previous.x,
        launchVelocityX = 0,
    ): boolean {
        const verticalGap = candidate.y - previous.config.y;
        if (verticalGap <= 0) return false;
        const player = this.config.player;
        const delta = this.config.fixedStep.seconds;
        const direction = candidate.x >= previous.x ? 1 : -1;
        const scale = this.config.design.width / 320;
        const gain = player.maxHorizontalSpeed / (this.config.sensor.fullTilt * 60 * scale);
        for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
            let x = launchX;
            let y = previous.y + player.collisionHeight / 2;
            let velocityX = launchVelocityX;
            let filteredTilt = launchVelocityX / (gain * 60 * scale);
            let velocityY = player.bounceVelocity;
            let elapsed = 0;
            while (elapsed < 2) {
                const previousFootY = y - player.collisionHeight / 2;
                const strategy = strategies[strategyIndex];
                const requestedInput = strategy === 2
                    ? (elapsed < 0.55 ? direction : -direction)
                    : strategy;
                const targetInput = Math.max(-maximumInput, Math.min(maximumInput, requestedInput));
                const horizontal = stepDoodleJumpHorizontal(filteredTilt, targetInput * this.config.sensor.fullTilt,
                    delta, this.config.sensor.smoothingSeconds, gain, scale);
                filteredTilt = horizontal.filteredTilt;
                velocityX = horizontal.velocity;
                const previousX = x;
                const vertical = stepDoodleJumpVertical(velocityY, player.gravity, delta, player.terminalFallVelocity);
                velocityY = vertical.velocity;
                x += velocityX * delta;
                y += vertical.displacement;
                if (x < player.wrapLeft) x += player.wrapDistance;
                if (x > player.wrapRight) x -= player.wrapDistance;
                elapsed += delta;
                const targetX = this.platformXAt(candidate, this.elapsedSeconds + elapsed);
                const targetY = this.platformYAt(candidate, this.elapsedSeconds + elapsed);
                const currentFootY = y - player.collisionHeight / 2;
                const sweep = referenceFootNeedsSweep(velocityX * delta, velocityY, delta, scale);
                if (velocityY <= 0 && referenceFootTouchesPlatform(previousX, x, previousFootY, currentFootY,
                    player.collisionWidth, targetX, targetY, candidate.width, scale, sweep)) return true;
                if (velocityY <= 0 && currentFootY + 2 * scale < targetY) break;
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
        return config.x;
    }

    private platformYAt(config: DoodleJumpFixedPlatformConfig, elapsedSeconds: number): number {
        if (config.type !== 'vertical-moving') return config.y;
        const platform = this.platforms.find((candidate) => candidate.config.id === config.id);
        const activatedAt = platform?.effectState.motionActivatedAt;
        return this.verticalPlatformY(config, elapsedSeconds - (activatedAt !== undefined && activatedAt >= 0
            ? activatedAt : this.elapsedSeconds));
    }

    private verticalPlatformY(config: DoodleJumpFixedPlatformConfig, seconds: number): number {
        const rawType = config.spawnPlan?.referenceRawType ?? 12;
        const range = rawType === 14 || rawType === 15 ? 130 : 200;
        const phase = ((Math.max(0, seconds) * 60) % (range * 2));
        const offset = phase <= range ? phase : range * 2 - phase;
        return config.y + (rawType % 2 === 0 ? 1 : -1) * offset * this.config.design.width / 320;
    }

    private recyclePlatforms(): void {
        const recycleY = this.cameraBottomY - this.config.camera.recycleBelow;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            const platform = this.platforms[index];
            if (Math.max(platform.config.y, platform.y) >= recycleY) continue;
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
