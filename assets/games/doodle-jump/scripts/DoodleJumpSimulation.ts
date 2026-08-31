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
    type DoodleJumpCombatPlatform,
    type DoodleJumpCombatStats,
    type DoodleJumpEnemySnapshot,
    type DoodleJumpProjectileHitResult,
} from './DoodleJumpCombatSystem';
import {
    DoodleJumpHazardSystem,
    type DoodleJumpHazardEvent,
    type DoodleJumpHazardFailureReason,
    type DoodleJumpHazardPlatform,
    type DoodleJumpHazardSnapshot,
    type DoodleJumpHazardStats,
} from './DoodleJumpHazardSystem';
import {
    DoodleJumpItemSystem,
    type DoodleJumpItemEvent,
    type DoodleJumpItemOccupiedBody,
    type DoodleJumpItemPlatform,
    type DoodleJumpItemSnapshot,
    type DoodleJumpItemStatusSnapshot,
} from './DoodleJumpItemSystem';

export type DoodleJumpFailureReason = 'fall' | 'monster-contact' | DoodleJumpHazardFailureReason;

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
    readonly width: number;
    readonly collisionEnabled: boolean;
    readonly consumed: boolean;
    readonly warningProgress: number;
    readonly predecessorId?: string;
    readonly generationAttempts: number;
    readonly degraded: boolean;
    readonly mainRoute: boolean;
    readonly layerIndex: number;
}

export interface DoodleJumpSimulationSnapshot {
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

export interface DoodleJumpResurrectionResult {
    readonly platformId: string;
    readonly safePlatformGenerated: boolean;
}

interface MutablePlatform {
    readonly config: DoodleJumpFixedPlatformConfig;
    readonly generated: boolean;
    x: number;
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

function moveTowards(current: number, target: number, maximumDelta: number): number {
    if (current < target) return Math.min(target, current + maximumDelta);
    if (current > target) return Math.max(target, current - maximumDelta);
    return current;
}

export class DoodleJumpSimulation {
    private readonly platforms: MutablePlatform[];
    private readonly initialSeed: number;
    private readonly randomStreams: DoodleJumpRandomStreams;
    private readonly combat: DoodleJumpCombatSystem;
    private readonly hazards: DoodleJumpHazardSystem;
    private readonly items: DoodleJumpItemSystem;
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

    constructor(private readonly config: DoodleJumpGameplayConfig, seed: string | number = 1) {
        this.initialSeed = hashDoodleJumpSeed(seed) || 1;
        this.randomStreams = new DoodleJumpRandomStreams(this.initialSeed);
        this.combat = new DoodleJumpCombatSystem(config, this.randomStreams);
        this.hazards = new DoodleJumpHazardSystem(config, this.randomStreams);
        this.items = new DoodleJumpItemSystem(config, this.randomStreams);
        this.platforms = config.fixedPlatforms.map((platform, index) => ({
            config: platform,
            generated: false,
            x: platform.x,
            collisionEnabled: true,
            consumed: false,
            consumeAt: 0,
            effectStartedAt: 0,
            warningProgress: 0,
            predecessorId: index > 0 ? config.fixedPlatforms[index - 1].id : undefined,
            generationAttempts: 0,
            degraded: false,
            mainRoute: true,
            layerIndex: index - 7,
        }));
        this.reset();
        this.validateFixedRoute();
    }

    reset(): void {
        this.accumulator = 0;
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
        this.combat.reset();
        this.hazards.reset();
        this.items.reset();
        this.generatorCursor = 0;
        this.generatedLayerCount = 0;
        this.degradedGenerationCount = 0;
        this.nextGeneratedId = 8;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            if (this.platforms[index].generated) this.platforms.splice(index, 1);
        }
        this.platforms.forEach((platform, index) => {
            platform.x = platform.config.x;
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
        for (let index = 2; index < fixedMainPlatforms.length; index += 1) {
            this.generatedLayerCount = index - 7;
            this.addInsertedPlatforms(
                [fixedMainPlatforms[index - 1]],
                fixedMainPlatforms[index].config,
                0,
                false,
            );
        }
        this.generatedLayerCount = 0;
        this.latestMainLayer = fixedMainPlatforms.length > 0
            ? [fixedMainPlatforms[fixedMainPlatforms.length - 1]]
            : [];
        this.combat.syncWorld(
            this.elapsedSeconds,
            this.getCombatPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + this.config.design.height,
        );
        this.hazards.syncWorld(
            0,
            this.elapsedSeconds,
            this.getHazardPlatforms(),
            this.playerX,
            this.playerY,
            this.cameraBottomY,
            this.cameraBottomY + this.config.design.height,
            this.combat.getSnapshots(),
        );
        this.items.syncWorld(
            this.getItemPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + this.config.design.height,
            this.getItemOccupiedBodies(),
        );
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
            this.step(fixedDelta, Math.max(-1, Math.min(1, horizontalInput)), visibleHeight);
            this.accumulator -= fixedDelta;
            steps += 1;
        }
        if (this.accumulator >= fixedDelta) {
            this.droppedFrameSeconds += this.accumulator;
            this.accumulator = 0;
        }
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
        return true;
    }

    resurrect(visibleHeight: number): DoodleJumpResurrectionResult {
        const screenTop = this.cameraBottomY + Math.max(0, visibleHeight);
        const isSafe = (platform: MutablePlatform): boolean => !this.config.resurrection.forceGeneratedSafePlatform
            && platform.collisionEnabled
            && platform.config.type === 'normal'
            && platform.config.y > this.cameraBottomY
            && this.combat.isAreaClear(
                platform.x,
                platform.config.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            )
            && this.hazards.isAreaClear(
                platform.x,
                platform.config.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            )
            && this.items.isAreaClear(
                platform.x,
                platform.config.y + this.config.player.collisionHeight / 2,
                this.config.resurrection.safeHorizontalRadius,
            );
        let target: MutablePlatform | undefined;

        this.platforms.forEach((platform) => {
            if (!isSafe(platform) || platform.config.y > screenTop) return;
            if (!target || platform.config.y < target.config.y) target = platform;
        });

        if (!target) {
            this.platforms.forEach((platform) => {
                if (!isSafe(platform) || platform.config.y <= screenTop) return;
                if (!target || platform.config.y < target.config.y) target = platform;
            });
        }

        let safePlatformGenerated = false;
        if (!target) {
            const highestY = this.platforms.reduce(
                (highest, platform) => Math.max(highest, platform.config.y),
                this.cameraBottomY,
            );
            const verticalStep = this.config.generation.verticalStep;
            const mainRouteGap = verticalStep * this.config.generation.mainRouteStepCount;
            const latticeOriginY = this.config.fixedPlatforms[0].y;
            const minimumSafeY = Math.max(screenTop + 180, highestY + mainRouteGap);
            const generatedConfig: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: `resurrect-safe-${this.platforms.length}`,
                x: this.config.design.width / 2,
                y: latticeOriginY + Math.ceil(
                    (minimumSafeY - latticeOriginY) / verticalStep,
                ) * verticalStep,
                width: 190,
                type: 'normal',
            });
            target = {
                config: generatedConfig,
                generated: true,
                x: generatedConfig.x,
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
        }

        const targetScreenY = Math.max(1, visibleHeight) * this.config.camera.targetHeightRatio;
        this.cameraBottomY = Math.max(this.cameraBottomY, target.config.y - targetScreenY);
        this.playerX = target.x;
        this.playerY = target.config.y + this.config.player.collisionHeight / 2;
        this.velocityX = 0;
        this.velocityY = this.config.resurrection.launchVelocity;
        this.accumulator = 0;
        this.items.cancelTrampolineJump();
        this.lastLandedPlatformId = target.config.id;
        this.maxAbsoluteWorldY = Math.max(this.maxAbsoluteWorldY, this.playerY);
        this.fatalReason = undefined;
        this.fatalFocusX = undefined;
        this.fatalFocusY = undefined;
        this.monsterContactGraceRemaining = 0.32;
        this.combat.clearNear(
            target.x,
            target.config.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.hazards.clearNear(
            target.x,
            target.config.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.items.clearNear(
            target.x,
            target.config.y + this.config.player.collisionHeight / 2,
            this.config.resurrection.safeHorizontalRadius,
        );
        this.items.grantShield(this.config.resurrection.shieldSeconds);

        return Object.freeze({
            platformId: target.config.id,
            safePlatformGenerated,
        });
    }

    getSnapshot(): DoodleJumpSimulationSnapshot {
        return Object.freeze({
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
                y: platform.config.y,
                width: platform.config.width,
                collisionEnabled: platform.collisionEnabled,
                consumed: platform.consumed,
                warningProgress: platform.warningProgress,
                predecessorId: platform.predecessorId,
                generationAttempts: platform.generationAttempts,
                degraded: platform.degraded,
                mainRoute: platform.mainRoute,
                layerIndex: platform.layerIndex,
            }))),
            enemies: this.combat.getSnapshots(),
        });
    }

    private step(delta: number, input: number, visibleHeight: number): void {
        this.elapsedSeconds += delta;
        this.monsterContactGraceRemaining = Math.max(
            0,
            this.monsterContactGraceRemaining - delta,
        );
        this.updatePlatforms(delta);
        this.items.updateTimers(delta, this.playerX, this.playerY);
        this.combat.syncWorld(
            this.elapsedSeconds,
            this.getCombatPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
        );
        this.hazards.syncWorld(
            delta,
            this.elapsedSeconds,
            this.getHazardPlatforms(),
            this.playerX,
            this.playerY,
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.getHazardOccupiedBodies(),
        );
        this.items.syncWorld(
            this.getItemPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.getItemOccupiedBodies(),
        );
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
        if (itemPhysics.fixedVerticalVelocity !== undefined) {
            this.velocityY = itemPhysics.fixedVerticalVelocity;
        } else {
            this.velocityY += itemPhysics.gravity * delta;
            if (itemPhysics.minimumVerticalVelocity !== undefined) {
                this.velocityY = Math.max(
                    itemPhysics.minimumVerticalVelocity,
                    this.velocityY,
                );
            }
        }
        this.playerX += this.velocityX * delta;
        this.playerY += this.velocityY * delta;
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
        const targetScreenY = visibleHeight * this.config.camera.targetHeightRatio;
        this.cameraBottomY = Math.max(this.cameraBottomY, this.playerY - targetScreenY);
        this.recyclePlatforms();
        this.ensureGenerated(visibleHeight);
        this.combat.syncWorld(
            this.elapsedSeconds,
            this.getCombatPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
        );
        this.hazards.syncWorld(
            0,
            this.elapsedSeconds,
            this.getHazardPlatforms(),
            this.playerX,
            this.playerY,
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.getHazardOccupiedBodies(),
        );
        this.items.syncWorld(
            this.getItemPlatforms(),
            this.cameraBottomY,
            this.cameraBottomY + visibleHeight,
            this.getItemOccupiedBodies(),
        );
    }

    private updatePlatforms(_delta: number): void {
        this.platforms.forEach((platform) => {
            if (platform.config.type === 'moving') {
                platform.x = this.platformXAt(platform.config, this.elapsedSeconds);
            } else if (platform.config.type === 'shifting') {
                const cycle = this.elapsedSeconds % 2.79;
                const segment = cycle < 0.65 ? 0
                    : cycle < 0.93 ? (cycle - 0.65) / 0.28
                        : cycle < 1.58 ? 1
                            : cycle < 1.86 ? 1 + (cycle - 1.58) / 0.28
                                : cycle < 2.51 ? 2
                                    : 2 - ((cycle - 2.51) / 0.28) * 2;
                platform.x = platform.config.x + (segment - 1) * 70;
            }
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
            const topY = platform.config.y;
            if (topY < this.cameraBottomY) continue;
            if (previousFootY < topY || currentFootY > topY) continue;
            // A landing needs at least one quarter of the player's body width
            // to overlap the platform. More than three quarters hanging outside
            // is treated as a miss instead of an edge catch.
            const horizontalReach = platform.config.width / 2 + halfPlayerWidth / 2;
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

    private ensureGenerated(visibleHeight: number): void {
        if (!this.config.generation.enabled || this.config.generation.singleStep) return;
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
        const generation = this.config.generation;
        const nextLayer = this.generatedLayerCount + 1;
        const recoveryLayer = nextLayer % generation.recoveryLayerInterval === 0;
        const previousLayer = this.latestMainLayer.length > 0
            ? this.latestMainLayer
            : [previous];
        const routePrevious = previousLayer[0];
        const candidateAttemptLimit = generation.forceDegradedFallback
            ? 0
            : generation.maxCandidateAttempts;
        for (let attempt = 1; attempt <= candidateAttemptLimit; attempt += 1) {
            const widened = attempt > 8 ? Math.min(42, (attempt - 8) * 4.2) : 0;
            const lowered = attempt > 8 ? Math.min(24, (attempt - 8) * 2.4) : 0;
            const difficulty = this.generationDifficulty(routePrevious.config.y);
            const verticalGap = generation.verticalStep * generation.mainRouteStepCount;
            const layerBaseY = previousLayer.reduce(
                (highest, platform) => Math.max(highest, platform.config.y),
                routePrevious.config.y,
            );
            const heightMeters = Math.max(0, Math.floor((layerBaseY + verticalGap - 114) / 100));
            const routeType = attempt > 16 || recoveryLayer
                ? 'normal'
                : this.pickAnchorPlatformType(heightMeters);
            const widthRange = this.anchorWidthRange(routeType, difficulty, recoveryLayer);
            const width = Math.min(
                recoveryLayer ? 230 : 220,
                widthRange[0] + this.nextPlatformRandom() * (widthRange[1] - widthRange[0]) + widened,
            );
            const baseHorizontalRange = recoveryLayer
                ? 95
                : 112 + difficulty * Math.max(0, generation.maxHorizontalGap - 112);
            const horizontalRange = Math.max(78, baseHorizontalRange - lowered * 2);
            const requiresSteering = !recoveryLayer && nextLayer % 4 !== 0;
            const horizontalGap = requiresSteering
                ? (this.nextPlatformRandom() < 0.5 ? -1 : 1)
                    * (88 + difficulty * 24
                        + this.triangularPlatformRandom()
                        * Math.max(0, horizontalRange - 88 - difficulty * 24))
                : (this.triangularPlatformRandom() * 2 - 1) * horizontalRange;
            const x = this.clampPlatformX(routePrevious.x + horizontalGap, width, routeType);
            const config: DoodleJumpFixedPlatformConfig = Object.freeze({
                id: `G${this.nextGeneratedId}`,
                x,
                y: layerBaseY + verticalGap,
                width,
                type: routeType,
            });
            if (!previousLayer.every((candidate) => this.isCandidateReachable(candidate, config))) {
                continue;
            }
            if (requiresSteering && this.isCandidateReachableWithoutSteering(routePrevious, config)) {
                continue;
            }
            const anchor = this.createGeneratedPlatform(
                config,
                routePrevious.config.id,
                attempt,
                false,
                true,
                nextLayer,
            );
            this.nextGeneratedId += 1;
            this.generatorCursor += 1;
            this.generatedLayerCount = nextLayer;
            this.addInsertedPlatforms(
                previousLayer,
                config,
                attempt,
                recoveryLayer,
            );
            this.latestMainLayer = [anchor];
            return anchor;
        }

        const fallbackWidth = Math.max(175, Math.min(210, generation.normalFallbackWidth));
        const fallbackGap = generation.verticalStep * generation.mainRouteStepCount;
        const fallbackX = this.clampPlatformX(
            routePrevious.x + (this.nextPlatformRandom() * 2 - 1) * 120,
            fallbackWidth,
            'normal',
        );
        const fallbackConfig: DoodleJumpFixedPlatformConfig = Object.freeze({
            id: `G${this.nextGeneratedId}`,
            x: fallbackX,
            y: routePrevious.config.y + fallbackGap,
            width: fallbackWidth,
            type: 'normal',
        });
        this.nextGeneratedId += 1;
        this.generatorCursor += 1;
        this.generatedLayerCount = nextLayer;
        this.degradedGenerationCount += 1;
        const fallback = this.createGeneratedPlatform(
            fallbackConfig,
            routePrevious.config.id,
            generation.maxCandidateAttempts,
            true,
            true,
            nextLayer,
        );
        this.latestMainLayer = [fallback];
        return fallback;
    }

    private findHighestPlatform(): MutablePlatform {
        return this.platforms.reduce(
            (candidate, platform) => platform.config.y > candidate.config.y ? platform : candidate,
            this.platforms[0],
        );
    }

    private validateFixedRoute(): void {
        for (let index = 1; index < this.config.fixedPlatforms.length; index += 1) {
            const previous = this.platforms[index - 1];
            const candidate = this.platforms[index].config;
            if (!this.isCandidateReachable(previous, candidate)) {
                throw new Error(
                    `Fixed platform route is unreachable: ${previous.config.id} -> ${candidate.id}.`,
                );
            }
            if (index === 1 && this.isCandidateReachableWithoutSteering(previous, candidate)) {
                throw new Error(
                    'Fixed second platform must be horizontally offset and require steering.',
                );
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
            x: config.x,
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

    private addInsertedPlatforms(
        previousLayer: readonly MutablePlatform[],
        routeConfig: DoodleJumpFixedPlatformConfig,
        generationAttempts: number,
        recoveryLayer: boolean,
    ): void {
        if (recoveryLayer) return;
        const routePrevious = previousLayer[0];
        const verticalStep = this.config.generation.verticalStep;
        const capacity = this.config.generation.mainRouteStepCount - 1;
        const maximumCount = Math.min(
            this.config.generation.maxInsertedPlatforms,
            capacity,
        );
        if (maximumCount <= 0) return;

        const override = this.config.generation.platformTypeOverride;
        const roll = this.nextPlatformRandom();
        const desiredCount = override !== 'auto'
            ? 1
            : roll < 0.16 ? 0
                : roll < 0.52 ? 1
                    : roll < 0.84 ? 2
                        : 3;
        const insertedCount = Math.min(maximumCount, desiredCount);
        if (insertedCount <= 0) return;

        const availableSlots: number[] = [];
        for (let slot = 1; slot <= capacity; slot += 1) availableSlots.push(slot);
        for (let index = availableSlots.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(this.nextPlatformRandom() * (index + 1));
            const value = availableSlots[index];
            availableSlots[index] = availableSlots[swapIndex];
            availableSlots[swapIndex] = value;
        }
        const selectedSlots = availableSlots.slice(0, insertedCount).sort((a, b) => a - b);
        for (let index = 0; index < selectedSlots.length; index += 1) {
            const y = routePrevious.config.y + selectedSlots[index] * verticalStep;
            const type = this.pickInsertedPlatformType();
            const widthRange = this.widthRange(type);
            const width = widthRange[0]
                + this.nextPlatformRandom() * (widthRange[1] - widthRange[0]);
            let config: DoodleJumpFixedPlatformConfig | undefined;
            let predecessor: MutablePlatform | undefined;
            for (let attempt = 0; attempt < 14; attempt += 1) {
                const x = this.clampPlatformX(
                    width / 2 + this.nextPlatformRandom() * (this.config.design.width - width),
                    width,
                    type,
                );
                const candidate: DoodleJumpFixedPlatformConfig = Object.freeze({
                    id: `G${this.nextGeneratedId}`,
                    x,
                    y,
                    width,
                    type,
                });
                predecessor = previousLayer.find((platform) => (
                    this.isCandidateReachable(platform, candidate)
                ));
                if (!predecessor) continue;
                config = candidate;
                break;
            }
            if (!config || !predecessor) continue;
            this.nextGeneratedId += 1;
            this.generatorCursor += 1;
            this.platforms.push(this.createGeneratedPlatform(
                config,
                predecessor.config.id,
                generationAttempts,
                false,
                false,
                this.generatedLayerCount,
            ));
        }
    }

    private clampPlatformX(x: number, width: number, type: DoodleJumpPlatformType): number {
        const movementPadding = type === 'moving' ? 90 : type === 'shifting' ? 70 : 0;
        const minimum = width / 2 + movementPadding;
        const maximum = this.config.design.width - width / 2 - movementPadding;
        return Math.max(minimum, Math.min(maximum, x));
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

    private isCandidateReachableWithoutSteering(
        previous: MutablePlatform,
        candidate: DoodleJumpFixedPlatformConfig,
    ): boolean {
        return this.isCandidateReachableWithStrategies(previous, candidate, [0]);
    }

    private isCandidateReachableWithStrategies(
        previous: MutablePlatform,
        candidate: DoodleJumpFixedPlatformConfig,
        strategies: readonly number[],
    ): boolean {
        const verticalGap = candidate.y - previous.config.y;
        const verticalStep = this.config.generation.verticalStep;
        const stepCount = verticalGap / verticalStep;
        if (verticalGap < verticalStep
            || Math.abs(stepCount - Math.round(stepCount)) > 0.0001
            || stepCount > this.config.generation.mainRouteStepCount) return false;
        const player = this.config.player;
        const delta = this.config.fixedStep.seconds;
        const direction = candidate.x >= previous.x ? 1 : -1;
        for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
            let x = previous.x;
            let y = previous.config.y + player.collisionHeight / 2;
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
                velocityY += player.gravity * delta;
                x += velocityX * delta;
                y += velocityY * delta;
                if (x < player.wrapLeft) x += player.wrapDistance;
                if (x > player.wrapRight) x -= player.wrapDistance;
                elapsed += delta;
                const targetX = this.platformXAt(candidate, this.elapsedSeconds + elapsed);
                const currentFootY = y - player.collisionHeight / 2;
                const safeLandingReach = Math.max(
                    24,
                    candidate.width / 2 - player.collisionWidth * 0.15,
                );
                if (velocityY <= 0
                    && previousFootY >= candidate.y
                    && currentFootY <= candidate.y) {
                    if (Math.abs(x - targetX) <= safeLandingReach) return true;
                    break;
                }
            }
        }
        return false;
    }

    private platformXAt(config: DoodleJumpFixedPlatformConfig, elapsedSeconds: number): number {
        if (config.type === 'moving') {
            const profile = this.movingPlatformProfile(config);
            return config.x + Math.sin(
                elapsedSeconds * Math.PI * 2 / profile.periodSeconds + profile.phaseRadians,
            ) * profile.amplitude;
        }
        if (config.type !== 'shifting') return config.x;
        const cycle = elapsedSeconds % 2.79;
        const segment = cycle < 0.65 ? 0
            : cycle < 0.93 ? (cycle - 0.65) / 0.28
                : cycle < 1.58 ? 1
                    : cycle < 1.86 ? 1 + (cycle - 1.58) / 0.28
                        : cycle < 2.51 ? 2
                            : 2 - ((cycle - 2.51) / 0.28) * 2;
        return config.x + (segment - 1) * 70;
    }

    private movingPlatformProfile(config: DoodleJumpFixedPlatformConfig): Readonly<{
        amplitude: number;
        periodSeconds: number;
        phaseRadians: number;
    }> {
        const hash = hashDoodleJumpSeed(`${config.id}:moving`);
        return Object.freeze({
            amplitude: 60 + hash % 31,
            periodSeconds: 1.55 + ((hash >>> 8) % 101) / 100,
            phaseRadians: ((hash >>> 16) & 1) === 0 ? 0 : Math.PI,
        });
    }

    private generationDifficulty(worldY: number): number {
        const heightMeters = Math.max(0, (worldY - 114) / 100);
        return Math.max(0, Math.min(1, heightMeters / 400));
    }

    private triangularPlatformRandom(): number {
        return (this.nextPlatformRandom() + this.nextPlatformRandom()) / 2;
    }

    private pickAnchorPlatformType(heightMeters: number): 'normal' | 'moving' | 'shifting' {
        const override = this.config.generation.platformTypeOverride;
        if (override === 'normal' || override === 'moving' || override === 'shifting') {
            return override;
        }
        if (override !== 'auto') return 'normal';
        const difficulty = Math.max(0, Math.min(1, heightMeters / 400));
        const recentAnchors = this.platforms.filter((platform) => (
            platform.mainRoute
        )).slice(-2);
        if (recentAnchors.length === 2
            && recentAnchors.every((platform) => platform.config.type !== 'normal')) {
            return 'normal';
        }
        const movingChance = 0.14 + difficulty * 0.19;
        const shiftingChance = heightMeters < 170 ? 0 : 0.06 + difficulty * 0.08;
        const roll = this.nextPlatformRandom();
        if (roll < shiftingChance) return 'shifting';
        if (roll < shiftingChance + movingChance) return 'moving';
        return 'normal';
    }

    private pickInsertedPlatformType(): DoodleJumpPlatformType {
        const override = this.config.generation.platformTypeOverride;
        if (override !== 'auto') return override;
        const types: readonly DoodleJumpPlatformType[] = [
            'normal',
            'moving',
            'breakable',
            'disappearing',
            'shifting',
            'exploding',
        ];
        const weights: readonly number[] = [0.34, 0.17, 0.13, 0.12, 0.13, 0.11];
        let roll = this.nextPlatformRandom();
        for (let index = 0; index < weights.length; index += 1) {
            roll -= weights[index];
            if (roll < 0) return types[index];
        }
        return types[types.length - 1];
    }

    private anchorWidthRange(
        type: 'normal' | 'moving' | 'shifting',
        difficulty: number,
        recoveryLayer: boolean,
    ): readonly [number, number] {
        if (recoveryLayer) return [185, 215];
        if (type === 'moving') return [135 - difficulty * 10, 180 - difficulty * 8];
        if (type === 'shifting') return [125 - difficulty * 8, 165 - difficulty * 8];
        return [155 - difficulty * 25, 210 - difficulty * 20];
    }

    private widthRange(type: DoodleJumpPlatformType): readonly [number, number] {
        if (type === 'normal') return [125, 210];
        if (type === 'moving') return [120, 180];
        if (type === 'breakable' || type === 'disappearing') return [110, 160];
        if (type === 'shifting') return [110, 150];
        return [105, 150];
    }

    private recyclePlatforms(): void {
        const recycleY = this.cameraBottomY - this.config.camera.recycleBelow;
        for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
            const platform = this.platforms[index];
            if (!platform.generated || platform.config.y >= recycleY) continue;
            this.platforms.splice(index, 1);
        }
        this.enforcePlatformBudget();
    }

    private enforcePlatformBudget(): void {
        while (this.platforms.length > this.config.generation.maxActivePlatforms) {
            let removalIndex = -1;
            for (let index = 0; index < this.platforms.length; index += 1) {
                const platform = this.platforms[index];
                if (!platform.generated) continue;
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

    private getCombatPlatforms(): readonly DoodleJumpCombatPlatform[] {
        return this.platforms.map((platform) => Object.freeze({
            id: platform.config.id,
            type: platform.config.type,
            x: platform.x,
            y: platform.config.y,
            width: platform.config.width,
            collisionEnabled: platform.collisionEnabled,
            consumed: platform.consumed,
        }));
    }

    private getHazardPlatforms(): readonly DoodleJumpHazardPlatform[] {
        return this.platforms.map((platform) => Object.freeze({
            id: platform.config.id,
            type: platform.config.type,
            x: platform.x,
            y: platform.config.y,
            width: platform.config.width,
            collisionEnabled: platform.collisionEnabled,
            consumed: platform.consumed,
        }));
    }

    private getItemPlatforms(): readonly DoodleJumpItemPlatform[] {
        return this.platforms.map((platform) => Object.freeze({
            id: platform.config.id,
            type: platform.config.type,
            x: platform.x,
            y: platform.config.y,
            width: platform.config.width,
            collisionEnabled: platform.collisionEnabled,
            consumed: platform.consumed,
        }));
    }

    private getHazardOccupiedBodies(): readonly DoodleJumpItemOccupiedBody[] {
        const occupied: DoodleJumpItemOccupiedBody[] = [];
        this.combat.getSnapshots().forEach((enemy) => occupied.push(Object.freeze({
            x: enemy.x,
            y: enemy.y,
            width: enemy.width,
            height: enemy.height,
            anchorPlatformId: enemy.anchorPlatformId,
        })));
        this.items.getOccupiedBodies().forEach((item) => occupied.push(item));
        return Object.freeze(occupied);
    }

    private getItemOccupiedBodies(): readonly DoodleJumpItemOccupiedBody[] {
        const occupied: DoodleJumpItemOccupiedBody[] = [];
        this.combat.getSnapshots().forEach((enemy) => occupied.push(Object.freeze({
            x: enemy.x,
            y: enemy.y,
            width: enemy.width,
            height: enemy.height,
            anchorPlatformId: enemy.anchorPlatformId,
        })));
        this.hazards.getSnapshots().forEach((hazard) => occupied.push(Object.freeze({
            x: hazard.x,
            y: hazard.y,
            width: hazard.width,
            height: hazard.height,
            anchorPlatformId: hazard.anchorPlatformId,
        })));
        return Object.freeze(occupied);
    }
}
