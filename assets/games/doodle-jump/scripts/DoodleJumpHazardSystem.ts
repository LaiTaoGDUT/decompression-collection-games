import type {
    DoodleJumpGameplayConfig,
    DoodleJumpHazardType,
} from './DoodleJumpConfig';
import type { DoodleJumpRandomStreams } from './DoodleJumpRandom';
import type {
    DoodleJumpWorldIndex,
    DoodleJumpWorldOccupiedBody,
    DoodleJumpWorldPlatform,
} from './DoodleJumpWorld';

export type DoodleJumpHazardFailureReason = 'ufo-abduction' | 'black-hole' | 'bear-trap';

export type DoodleJumpHazardPlatform = DoodleJumpWorldPlatform;
export type DoodleJumpHazardOccupiedBody = DoodleJumpWorldOccupiedBody;

export interface DoodleJumpHazardSnapshot {
    readonly id: string;
    readonly type: DoodleJumpHazardType;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly anchorPlatformId?: string;
    readonly lockProgress: number;
    readonly abductionProgress: number;
    readonly paused: boolean;
    readonly triggered: boolean;
    readonly phase: number;
}

export interface DoodleJumpHazardStats {
    readonly ufoInterruptCount: number;
    readonly score: number;
}

export interface DoodleJumpHazardResolution {
    readonly accelerationX: number;
    readonly accelerationY: number;
    readonly fatalReason?: DoodleJumpHazardFailureReason;
    readonly fatalHazardId?: string;
    readonly focusX?: number;
    readonly focusY?: number;
}

export interface DoodleJumpHazardEvent {
    readonly type: 'ufo-interrupt' | 'bear-trap-trigger';
    readonly hazardId: string;
    readonly x: number;
    readonly y: number;
}

interface MutableHazardBase {
    readonly id: string;
    readonly type: DoodleJumpHazardType;
    readonly width: number;
    readonly height: number;
    readonly phase: number;
    x: number;
    y: number;
    triggered: boolean;
}

interface MutableUfo extends MutableHazardBase {
    readonly type: 'ufo';
    lockSeconds: number;
    abductionSeconds: number;
    leaveSeconds: number;
    pausedUntil: number;
}

interface MutableBlackHole extends MutableHazardBase {
    readonly type: 'black-hole';
}

interface MutableBearTrap extends MutableHazardBase {
    readonly type: 'bear-trap';
    readonly anchorPlatformId: string;
    readonly anchorOffsetX: number;
}

interface MutableHazardPresentation {
    id: string;
    type: DoodleJumpHazardType;
    x: number;
    y: number;
    width: number;
    height: number;
    anchorPlatformId?: string;
    lockProgress: number;
    abductionProgress: number;
    paused: boolean;
    triggered: boolean;
    phase: number;
}

interface MutableHazardStats {
    ufoInterruptCount: number;
    score: number;
}

type MutableHazard = MutableUfo | MutableBlackHole | MutableBearTrap;

interface ProjectileUfoHit {
    readonly hazardId: string;
    readonly x: number;
    readonly y: number;
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
    if (current < target) return Math.min(target, current + maximumDelta);
    if (current > target) return Math.max(target, current - maximumDelta);
    return current;
}

function segmentAabbTime(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    left: number,
    right: number,
    bottom: number,
    top: number,
): number | undefined {
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    let entry = 0;
    let exit = 1;
    const clip = (origin: number, delta: number, minimum: number, maximum: number): boolean => {
        if (Math.abs(delta) < 0.000001) return origin >= minimum && origin <= maximum;
        let near = (minimum - origin) / delta;
        let far = (maximum - origin) / delta;
        if (near > far) {
            const swap = near;
            near = far;
            far = swap;
        }
        entry = Math.max(entry, near);
        exit = Math.min(exit, far);
        return entry <= exit;
    };
    if (!clip(fromX, deltaX, left, right)) return undefined;
    if (!clip(fromY, deltaY, bottom, top)) return undefined;
    return entry >= 0 && entry <= 1 ? entry : undefined;
}

export class DoodleJumpHazardSystem {
    private readonly hazards: MutableHazard[] = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpHazardEvent[] = [];
    private readonly presentationHazards: MutableHazardPresentation[] = [];
    private readonly orderedUfos: MutableUfo[] = [];
    private readonly orderedBlackHoles: MutableBlackHole[] = [];
    private readonly orderedBearTraps: MutableBearTrap[] = [];
    private readonly presentationStats: MutableHazardStats = {
        ufoInterruptCount: 0,
        score: 0,
    };
    private nextHazardId = 1;
    private elapsedSeconds = 0;
    private ufoInterruptCount = 0;
    private score = 0;
    private lastSpawnAnchorY = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly config: DoodleJumpGameplayConfig,
        private readonly randomStreams: DoodleJumpRandomStreams,
    ) {}

    reset(): void {
        this.hazards.length = 0;
        this.evaluatedPlatformIds.clear();
        this.events.length = 0;
        this.nextHazardId = 1;
        this.elapsedSeconds = 0;
        this.ufoInterruptCount = 0;
        this.score = 0;
        this.lastSpawnAnchorY = Number.NEGATIVE_INFINITY;
    }

    restore(
        snapshots: readonly DoodleJumpHazardSnapshot[],
        stats: DoodleJumpHazardStats,
        elapsedSeconds: number,
        world: DoodleJumpWorldIndex,
    ): void {
        this.reset();
        this.elapsedSeconds = Math.max(0, elapsedSeconds);
        this.ufoInterruptCount = Math.max(0, Math.floor(stats.ufoInterruptCount));
        this.score = Math.max(0, Math.floor(stats.score));
        world.platforms.forEach((platform) => {
            this.evaluatedPlatformIds.add(platform.id);
        });
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            const parsedId = Number(snapshot.id.replace(/^[UBT]/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            if (snapshot.type === 'ufo') {
                this.hazards.push({
                    id: snapshot.id,
                    type: 'ufo',
                    x: snapshot.x,
                    y: snapshot.y,
                    width: this.config.hazards.ufo.width,
                    height: this.config.hazards.ufo.height,
                    phase: snapshot.phase,
                    triggered: snapshot.triggered,
                    lockSeconds: Math.max(0, Math.min(1, snapshot.lockProgress))
                        * this.config.hazards.ufo.lockSeconds,
                    abductionSeconds: Math.max(0, Math.min(1, snapshot.abductionProgress))
                        * this.config.hazards.ufo.abductionSeconds,
                    leaveSeconds: 0,
                    pausedUntil: snapshot.paused
                        ? this.elapsedSeconds + this.config.hazards.ufo.hitPauseSeconds
                        : 0,
                });
                this.lastSpawnAnchorY = Math.max(this.lastSpawnAnchorY, snapshot.y);
                return;
            }
            if (snapshot.type === 'black-hole') {
                this.hazards.push({
                    id: snapshot.id,
                    type: 'black-hole',
                    x: snapshot.x,
                    y: snapshot.y,
                    width: this.config.hazards.blackHole.outerRadius * 2,
                    height: this.config.hazards.blackHole.outerRadius * 2,
                    phase: snapshot.phase,
                    triggered: snapshot.triggered,
                });
                this.lastSpawnAnchorY = Math.max(this.lastSpawnAnchorY, snapshot.y);
                return;
            }
            const anchorId = snapshot.anchorPlatformId;
            const platform = anchorId ? world.platformById.get(anchorId) : undefined;
            if (!anchorId || !platform) return;
            this.hazards.push({
                id: snapshot.id,
                type: 'bear-trap',
                x: snapshot.x,
                y: snapshot.y,
                width: this.config.hazards.bearTrap.width,
                height: this.config.hazards.bearTrap.height,
                phase: snapshot.phase,
                triggered: snapshot.triggered,
                anchorPlatformId: anchorId,
                anchorOffsetX: snapshot.x - platform.x,
            });
            this.lastSpawnAnchorY = Math.max(this.lastSpawnAnchorY, platform.y);
        });
        this.nextHazardId = maximumId + 1;
        this.events.length = 0;
    }

    updateExisting(
        deltaSeconds: number,
        elapsedSeconds: number,
        world: DoodleJumpWorldIndex,
        playerX: number,
        cameraBottomY: number,
    ): void {
        this.elapsedSeconds = elapsedSeconds;
        this.updateAttachedTraps(world.platformById);
        this.updateUfos(Math.max(0, deltaSeconds), playerX);
        this.recycleHazards(cameraBottomY);
    }

    reconcileWorld(
        world: DoodleJumpWorldIndex,
        playerX: number,
        playerY: number,
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpHazardOccupiedBody[],
    ): void {
        this.recycleHazards(cameraBottomY);
        this.purgeEvaluatedPlatforms(world.platformById);
        this.evaluateNewPlatforms(
            world.platforms,
            playerX,
            playerY,
            cameraBottomY,
            cameraTopY,
            occupiedBodies,
        );
    }

    resolvePlayer(
        deltaSeconds: number,
        playerX: number,
        playerY: number,
        previousFootY: number,
        playerWidth: number,
        playerHeight: number,
        playerInvincible = false,
    ): DoodleJumpHazardResolution {
        const delta = Math.max(0, deltaSeconds);
        if (playerInvincible) {
            this.hazards.forEach((hazard) => {
                if (hazard.type !== 'ufo') return;
                hazard.lockSeconds = 0;
                hazard.abductionSeconds = 0;
                hazard.leaveSeconds = 0;
            });
        }
        let accelerationX = 0;
        let accelerationY = 0;
        const ufos = this.collectHazardsByType('ufo', this.orderedUfos);
        for (let index = 0; index < ufos.length; index += 1) {
            const ufo = ufos[index];
            if (playerInvincible) continue;
            if (ufo.triggered || ufo.pausedUntil > this.elapsedSeconds) continue;
            const beamBottom = ufo.y - this.config.hazards.ufo.beamLength;
            const playerBottom = playerY - playerHeight / 2;
            const playerTop = playerY + playerHeight / 2;
            const insideBeam = playerBottom <= ufo.y - ufo.height / 2
                && playerTop >= beamBottom
                && Math.abs(playerX - ufo.x)
                    <= this.config.hazards.ufo.beamWidth / 2 + playerWidth / 2;
            if (!insideBeam) {
                ufo.leaveSeconds += delta;
                if (ufo.leaveSeconds > this.config.hazards.ufo.leaveResetSeconds) {
                    ufo.lockSeconds = 0;
                    ufo.abductionSeconds = 0;
                }
                continue;
            }
            ufo.leaveSeconds = 0;
            if (ufo.lockSeconds < this.config.hazards.ufo.lockSeconds) {
                ufo.lockSeconds = Math.min(
                    this.config.hazards.ufo.lockSeconds,
                    ufo.lockSeconds + delta,
                );
                continue;
            }
            const directionX = ufo.x - playerX;
            const directionY = ufo.y - playerY;
            const distance = Math.max(0.0001, Math.sqrt(directionX * directionX + directionY * directionY));
            accelerationX += directionX / distance * this.config.hazards.ufo.pullAcceleration;
            accelerationY += directionY / distance * this.config.hazards.ufo.pullAcceleration;
            ufo.abductionSeconds += delta;
            if (ufo.abductionSeconds >= this.config.hazards.ufo.abductionSeconds) {
                ufo.triggered = true;
                return Object.freeze({
                    accelerationX,
                    accelerationY,
                    fatalReason: 'ufo-abduction',
                    fatalHazardId: ufo.id,
                    focusX: ufo.x,
                    focusY: ufo.y,
                });
            }
        }

        const blackHoles = this.collectHazardsByType('black-hole', this.orderedBlackHoles);
        for (let index = 0; index < blackHoles.length; index += 1) {
            const blackHole = blackHoles[index];
            if (blackHole.triggered) continue;
            const directionX = blackHole.x - playerX;
            const directionY = blackHole.y - playerY;
            const distance = Math.sqrt(directionX * directionX + directionY * directionY);
            if (distance > this.config.hazards.blackHole.outerRadius) continue;
            if (!playerInvincible && distance <= this.config.hazards.blackHole.coreRadius) {
                blackHole.triggered = true;
                return Object.freeze({
                    accelerationX,
                    accelerationY,
                    fatalReason: 'black-hole',
                    fatalHazardId: blackHole.id,
                    focusX: blackHole.x,
                    focusY: blackHole.y,
                });
            }
        }

        if (playerInvincible) {
            return Object.freeze({ accelerationX, accelerationY });
        }

        const playerLeft = playerX - playerWidth / 2;
        const playerRight = playerX + playerWidth / 2;
        const playerBottom = playerY - playerHeight / 2;
        const playerTop = playerY + playerHeight / 2;
        const traps = this.collectHazardsByType('bear-trap', this.orderedBearTraps);
        for (let index = 0; index < traps.length; index += 1) {
            const trap = traps[index];
            if (trap.triggered) continue;
            const trapLeft = trap.x - trap.width / 2;
            const trapRight = trap.x + trap.width / 2;
            const trapBottom = trap.y - trap.height / 2;
            const trapTop = trap.y + trap.height / 2;
            const fromAbove = previousFootY >= trapBottom - 0.001;
            if (fromAbove
                && playerRight >= trapLeft
                && playerLeft <= trapRight
                && playerTop >= trapBottom
                && playerBottom <= trapTop) {
                trap.triggered = true;
                this.events.push(Object.freeze({
                    type: 'bear-trap-trigger',
                    hazardId: trap.id,
                    x: trap.x,
                    y: trap.y,
                }));
                return Object.freeze({
                    accelerationX,
                    accelerationY,
                    fatalReason: 'bear-trap',
                    fatalHazardId: trap.id,
                    focusX: trap.x,
                    focusY: trap.y,
                });
            }
        }
        return Object.freeze({
            accelerationX,
            accelerationY,
        });
    }

    resolveBlackHoleAttraction(
        playerX: number,
        playerY: number,
    ): Readonly<{ accelerationX: number; accelerationY: number }> {
        let accelerationX = 0;
        let accelerationY = 0;
        const blackHoles = this.collectHazardsByType('black-hole', this.orderedBlackHoles);
        for (let index = 0; index < blackHoles.length; index += 1) {
            const blackHole = blackHoles[index];
            if (blackHole.triggered) continue;
            const directionX = blackHole.x - playerX;
            const directionY = blackHole.y - playerY;
            const distance = Math.sqrt(directionX * directionX + directionY * directionY);
            if (distance > this.config.hazards.blackHole.outerRadius) continue;
            const normalized = 1 - distance / this.config.hazards.blackHole.outerRadius;
            // The rim pull must exceed normal steering acceleration, otherwise
            // moveTowards cancels it on the following fixed step.
            // Keep a meaningful lateral pull across the full outer ring. The
            // previous curve became too weak near the rim, especially when the
            // player was offset to the left/right of the hole.
            const pullRatio = 0.52 + 0.48 * Math.pow(Math.max(0, normalized), 1.25);
            const force = this.config.hazards.blackHole.maximumPullAcceleration * pullRatio;
            accelerationX += directionX / Math.max(0.0001, distance) * force;
            accelerationY += directionY / Math.max(0.0001, distance) * force;
        }
        return Object.freeze({ accelerationX, accelerationY });
    }

    hitUfoByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        projectileRadius = 5,
    ): ProjectileUfoHit | undefined {
        let target: MutableUfo | undefined;
        let targetTime = Number.POSITIVE_INFINITY;
        this.hazards.forEach((hazard) => {
            if (hazard.type !== 'ufo' || hazard.triggered) return;
            const time = segmentAabbTime(
                fromX,
                fromY,
                toX,
                toY,
                hazard.x - hazard.width / 2 - projectileRadius,
                hazard.x + hazard.width / 2 + projectileRadius,
                hazard.y - hazard.height / 2 - projectileRadius,
                hazard.y + hazard.height / 2 + projectileRadius,
            );
            if (time === undefined || time >= targetTime) return;
            target = hazard;
            targetTime = time;
        });
        if (!target) return undefined;
        const ufo = target as MutableUfo;
        ufo.pausedUntil = this.elapsedSeconds + this.config.hazards.ufo.hitPauseSeconds;
        ufo.lockSeconds = 0;
        ufo.abductionSeconds = 0;
        ufo.leaveSeconds = 0;
        this.ufoInterruptCount += 1;
        this.score += this.config.hazards.ufo.interruptScore;
        this.events.push(Object.freeze({
            type: 'ufo-interrupt',
            hazardId: ufo.id,
            x: ufo.x,
            y: ufo.y,
        }));
        return Object.freeze({ hazardId: ufo.id, x: ufo.x, y: ufo.y });
    }

    drainEvents(): readonly DoodleJumpHazardEvent[] {
        if (this.events.length === 0) return Object.freeze([]);
        return Object.freeze(this.events.splice(0, this.events.length));
    }

    getSnapshots(): readonly DoodleJumpHazardSnapshot[] {
        return Object.freeze(this.hazards.map((hazard) => {
            const ufo = hazard.type === 'ufo' ? hazard : undefined;
            return Object.freeze({
                id: hazard.id,
                type: hazard.type,
                x: hazard.x,
                y: hazard.y,
                width: hazard.width,
                height: hazard.height,
                anchorPlatformId: hazard.type === 'bear-trap'
                    ? hazard.anchorPlatformId
                    : undefined,
                lockProgress: ufo
                    ? Math.min(1, ufo.lockSeconds / this.config.hazards.ufo.lockSeconds)
                    : 0,
                abductionProgress: ufo
                    ? Math.min(1, ufo.abductionSeconds / this.config.hazards.ufo.abductionSeconds)
                    : 0,
                paused: ufo ? ufo.pausedUntil > this.elapsedSeconds : false,
                triggered: hazard.triggered,
                phase: hazard.phase,
            });
        }));
    }

    getPresentationHazards(): readonly DoodleJumpHazardSnapshot[] {
        for (let index = 0; index < this.hazards.length; index += 1) {
            const hazard = this.hazards[index];
            const ufo = hazard.type === 'ufo' ? hazard : undefined;
            let presentation = this.presentationHazards[index];
            if (!presentation) {
                presentation = {
                    id: hazard.id,
                    type: hazard.type,
                    x: hazard.x,
                    y: hazard.y,
                    width: hazard.width,
                    height: hazard.height,
                    lockProgress: 0,
                    abductionProgress: 0,
                    paused: false,
                    triggered: hazard.triggered,
                    phase: hazard.phase,
                };
                this.presentationHazards[index] = presentation;
            }
            presentation.id = hazard.id;
            presentation.type = hazard.type;
            presentation.x = hazard.x;
            presentation.y = hazard.y;
            presentation.width = hazard.width;
            presentation.height = hazard.height;
            presentation.anchorPlatformId = hazard.type === 'bear-trap'
                ? hazard.anchorPlatformId
                : undefined;
            presentation.lockProgress = ufo
                ? Math.min(1, ufo.lockSeconds / this.config.hazards.ufo.lockSeconds)
                : 0;
            presentation.abductionProgress = ufo
                ? Math.min(1, ufo.abductionSeconds / this.config.hazards.ufo.abductionSeconds)
                : 0;
            presentation.paused = ufo ? ufo.pausedUntil > this.elapsedSeconds : false;
            presentation.triggered = hazard.triggered;
            presentation.phase = hazard.phase;
        }
        this.presentationHazards.length = this.hazards.length;
        return this.presentationHazards;
    }

    getStats(): DoodleJumpHazardStats {
        return Object.freeze({
            ufoInterruptCount: this.ufoInterruptCount,
            score: this.score,
        });
    }

    getPresentationStats(): DoodleJumpHazardStats {
        this.presentationStats.ufoInterruptCount = this.ufoInterruptCount;
        this.presentationStats.score = this.score;
        return this.presentationStats;
    }

    writeOccupiedBodies(
        target: DoodleJumpHazardOccupiedBody[],
        startIndex = 0,
    ): number {
        let cursor = startIndex;
        for (let index = 0; index < this.hazards.length; index += 1) {
            const hazard = this.hazards[index];
            let body = target[cursor];
            if (!body) {
                body = { x: 0, y: 0, width: 0, height: 0 };
                target[cursor] = body;
            }
            body.x = hazard.x;
            body.y = hazard.y;
            body.width = hazard.width;
            body.height = hazard.height;
            body.anchorPlatformId = hazard.type === 'bear-trap'
                ? hazard.anchorPlatformId
                : undefined;
            cursor += 1;
        }
        return cursor;
    }

    private collectHazardsByType(
        type: 'ufo',
        target: MutableUfo[],
    ): MutableUfo[];
    private collectHazardsByType(
        type: 'black-hole',
        target: MutableBlackHole[],
    ): MutableBlackHole[];
    private collectHazardsByType(
        type: 'bear-trap',
        target: MutableBearTrap[],
    ): MutableBearTrap[];
    private collectHazardsByType(
        type: DoodleJumpHazardType,
        target: MutableHazard[],
    ): MutableHazard[] {
        target.length = 0;
        for (let index = 0; index < this.hazards.length; index += 1) {
            const hazard = this.hazards[index];
            if (hazard.type === type) target.push(hazard);
        }
        for (let index = 1; index < target.length; index += 1) {
            const value = target[index];
            let cursor = index - 1;
            while (cursor >= 0 && target[cursor].id.localeCompare(value.id) > 0) {
                target[cursor + 1] = target[cursor];
                cursor -= 1;
            }
            target[cursor + 1] = value;
        }
        return target;
    }

    clearNear(x: number, y: number, radius: number): void {
        for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
            const hazard = this.hazards[index];
            if (Math.abs(hazard.x - x) <= radius && Math.abs(hazard.y - y) <= radius) {
                this.hazards.splice(index, 1);
            }
        }
        this.events.length = 0;
    }

    isAreaClear(x: number, y: number, radius: number): boolean {
        return !this.hazards.some((hazard) => (
            Math.abs(hazard.x - x) <= radius && Math.abs(hazard.y - y) <= radius
        ));
    }

    private updateUfos(deltaSeconds: number, playerX: number): void {
        this.hazards.forEach((hazard) => {
            if (hazard.type !== 'ufo' || hazard.triggered) return;
            if (hazard.pausedUntil > this.elapsedSeconds) return;
            hazard.x = moveTowards(
                hazard.x,
                playerX,
                this.config.hazards.ufo.horizontalSpeed * deltaSeconds,
            );
        });
    }

    private updateAttachedTraps(
        platformById: ReadonlyMap<string, DoodleJumpHazardPlatform>,
    ): void {
        this.hazards.forEach((hazard) => {
            if (hazard.type !== 'bear-trap') return;
            const platform = platformById.get(hazard.anchorPlatformId);
            if (!platform || !platform.collisionEnabled || platform.consumed) {
                hazard.triggered = true;
                return;
            }
            hazard.x = platform.x + hazard.anchorOffsetX;
            hazard.y = platform.y + hazard.height / 2;
        });
    }

    private evaluateNewPlatforms(
        platforms: readonly DoodleJumpHazardPlatform[],
        playerX: number,
        playerY: number,
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpHazardOccupiedBody[],
    ): void {
        if (!this.config.hazards.enabled) return;
        for (let index = 0; index < platforms.length; index += 1) {
            const platform = platforms[index];
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            if (platform.y < cameraBottomY
                || platform.y <= cameraTopY + this.config.hazards.spawnAboveScreenMargin) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            const heightMeters = Math.max(0, (platform.y - this.startWorldY()) / 100);
            if (heightMeters < this.earliestUnlockHeightMeters()) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            const activeLimit = Math.min(
                this.config.hazards.maximumActive,
                heightMeters < this.config.hazards.twoActiveHeightMeters ? 1
                    : 2,
            );
            if (this.hazards.length >= activeLimit) continue;
            this.evaluatedPlatformIds.add(platform.id);
            if (!platform.collisionEnabled || platform.consumed) continue;
            if (platform.id === 'P0' || platform.id === 'P1' || platform.id === 'P2') continue;
            const difficulty = this.hazardDifficultyProgress(heightMeters);
            const spawnChance = this.config.hazards.spawnChanceAtUnlock
                + (this.config.hazards.spawnChancePerPlatform
                    - this.config.hazards.spawnChanceAtUnlock) * difficulty;
            const minimumSeparation = this.config.hazards.minimumVerticalSeparationAtUnlock
                + (this.config.hazards.minimumVerticalSeparation
                    - this.config.hazards.minimumVerticalSeparationAtUnlock) * difficulty;
            if (platform.y - this.lastSpawnAnchorY < minimumSeparation) continue;
            if (this.randomStreams.next('enemy') >= spawnChance) {
                continue;
            }
            const type = this.pickHazardType(heightMeters);
            const hazard = type
                ? this.createHazard(
                    type,
                    platform,
                    playerX,
                    playerY,
                    cameraTopY,
                    platforms,
                    occupiedBodies,
                )
                : undefined;
            if (!hazard) continue;
            if (this.hazards.some((candidate) => (
                Math.abs(candidate.y - hazard.y) < minimumSeparation
            ))) continue;
            this.hazards.push(hazard);
            this.lastSpawnAnchorY = platform.y;
        }
    }

    private hazardDifficultyProgress(heightMeters: number): number {
        const start = this.earliestUnlockHeightMeters();
        const end = this.config.hazards.difficultyCapHeightMeters;
        return Math.max(0, Math.min(1, (heightMeters - start) / Math.max(1, end - start)));
    }

    private pickHazardType(heightMeters: number): DoodleJumpHazardType | undefined {
        const override = this.config.hazards.typeOverride;
        if (override !== 'auto') {
            const unlocked = override === 'ufo'
                ? heightMeters >= this.config.hazards.ufo.unlockHeightMeters
                    && this.countType(override) < this.config.hazards.ufo.maximumActive
                : override === 'black-hole'
                    ? heightMeters >= this.config.hazards.blackHole.unlockHeightMeters
                        && this.countType(override) < this.config.hazards.blackHole.maximumActive
                    : heightMeters >= this.config.hazards.bearTrap.unlockHeightMeters
                        && this.countType(override) < this.config.hazards.bearTrap.maximumActive;
            return unlocked ? override : undefined;
        }
        const ufoWeight = heightMeters >= this.config.hazards.ufo.unlockHeightMeters
            && this.countType('ufo') < this.config.hazards.ufo.maximumActive
            ? heightMeters < 250 ? 1 : 0.38
            : 0;
        const blackHoleWeight = heightMeters >= this.config.hazards.blackHole.unlockHeightMeters
            && this.countType('black-hole') < this.config.hazards.blackHole.maximumActive
            ? 0.3
            : 0;
        const bearTrapWeight = heightMeters >= this.config.hazards.bearTrap.unlockHeightMeters
            && this.countType('bear-trap') < this.config.hazards.bearTrap.maximumActive
            ? heightMeters < 250 ? 0.4 : 0.32
            : 0;
        const total = ufoWeight + blackHoleWeight + bearTrapWeight;
        if (total <= 0) return undefined;
        let roll = this.randomStreams.next('enemy') * total;
        if (ufoWeight > 0) {
            roll -= ufoWeight;
            if (roll < 0) return 'ufo';
        }
        if (blackHoleWeight > 0) {
            roll -= blackHoleWeight;
            if (roll < 0) return 'black-hole';
        }
        return bearTrapWeight > 0 ? 'bear-trap'
            : blackHoleWeight > 0 ? 'black-hole'
                : 'ufo';
    }

    private createHazard(
        type: DoodleJumpHazardType,
        platform: DoodleJumpHazardPlatform,
        playerX: number,
        playerY: number,
        cameraTopY: number,
        platforms: readonly DoodleJumpHazardPlatform[],
        occupiedBodies: readonly DoodleJumpHazardOccupiedBody[],
    ): MutableHazard | undefined {
        const phase = this.randomStreams.next('enemy');
        if (type === 'ufo') {
            const settings = this.config.hazards.ufo;
            const spawnRange = settings.spawnMaximumAbovePlayer - settings.spawnMinimumAbovePlayer;
            return {
                id: this.allocateId('U'),
                type,
                x: Math.max(settings.width / 2, Math.min(
                    this.config.design.width - settings.width / 2,
                    playerX + (this.randomStreams.next('enemy') * 2 - 1) * 190,
                )),
                y: Math.max(
                    cameraTopY + this.config.hazards.spawnAboveScreenMargin + settings.height / 2,
                    playerY + settings.spawnMinimumAbovePlayer
                        + this.randomStreams.next('enemy') * spawnRange,
                ),
                width: settings.width,
                height: settings.height,
                phase,
                triggered: false,
                lockSeconds: 0,
                abductionSeconds: 0,
                leaveSeconds: 0,
                pausedUntil: 0,
            };
        }
        if (type === 'black-hole') {
            const settings = this.config.hazards.blackHole;
            const side = this.randomStreams.next('enemy') < 0.5 ? -1 : 1;
            const candidates: Array<readonly [number, number]> = [
                [side, 2],
                [-side, 2],
                [side, 3],
                [-side, 3],
            ];
            let placement: readonly [number, number] | undefined;
            for (let index = 0; index < candidates.length; index += 1) {
                const x = Math.max(
                    settings.outerRadius * 0.55,
                    Math.min(
                        this.config.design.width - settings.outerRadius * 0.55,
                        platform.x + candidates[index][0]
                            * (platform.width / 2 + settings.outerRadius * 0.62),
                    ),
                );
                const y = platform.y + this.config.generation.verticalStep * candidates[index][1];
                if (!this.isBlackHolePlacementClear(x, y, platforms, occupiedBodies)) continue;
                placement = [x, y];
                break;
            }
            if (!placement) return undefined;
            return {
                id: this.allocateId('B'),
                type,
                x: placement[0],
                y: placement[1],
                width: settings.outerRadius * 2,
                height: settings.outerRadius * 2,
                phase,
                triggered: false,
            };
        }
        const settings = this.config.hazards.bearTrap;
        const requiredWidth = settings.width + settings.minimumRemainingLandingWidth + 18;
        if (platform.width < requiredWidth
            || occupiedBodies.some((body) => body.anchorPlatformId === platform.id)
            || platform.type === 'breakable'
            || platform.type === 'disappearing'
            || platform.type === 'exploding') return undefined;
        const side = this.randomStreams.next('enemy') < 0.5 ? -1 : 1;
        const edgePadding = 8;
        const offset = side * (platform.width / 2 - settings.width / 2 - edgePadding);
        return {
            id: this.allocateId('T'),
            type,
            x: platform.x + offset,
            y: platform.y + settings.height / 2,
            width: settings.width,
            height: settings.height,
            phase,
            triggered: false,
            anchorPlatformId: platform.id,
            anchorOffsetX: offset,
        };
    }

    private recycleHazards(cameraBottomY: number): void {
        const recycleY = cameraBottomY - this.config.hazards.recycleBelow;
        for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
            const hazard = this.hazards[index];
            if (hazard.y + hazard.height / 2 < recycleY || (hazard.triggered && hazard.type !== 'ufo')) {
                this.hazards.splice(index, 1);
            }
        }
    }

    private isBlackHolePlacementClear(
        x: number,
        y: number,
        platforms: readonly DoodleJumpHazardPlatform[],
        occupiedBodies: readonly DoodleJumpHazardOccupiedBody[],
    ): boolean {
        const coreClearance = this.config.hazards.blackHole.coreRadius + 18;
        const intersectsRect = (
            centerX: number,
            centerY: number,
            width: number,
            height: number,
        ): boolean => {
            const closestX = Math.max(centerX - width / 2, Math.min(x, centerX + width / 2));
            const closestY = Math.max(centerY - height / 2, Math.min(y, centerY + height / 2));
            const deltaX = x - closestX;
            const deltaY = y - closestY;
            return deltaX * deltaX + deltaY * deltaY < coreClearance * coreClearance;
        };
        if (platforms.some((platform) => (
            platform.collisionEnabled
            && !platform.consumed
            && intersectsRect(platform.x, platform.y - 10, platform.width, 24)
        ))) return false;
        return !occupiedBodies.some((body) => (
            intersectsRect(body.x, body.y, body.width, body.height)
        ));
    }

    private purgeEvaluatedPlatforms(
        platformById: ReadonlyMap<string, DoodleJumpHazardPlatform>,
    ): void {
        this.evaluatedPlatformIds.forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
    }

    private countType(type: DoodleJumpHazardType): number {
        let count = 0;
        for (let index = 0; index < this.hazards.length; index += 1) {
            const hazard = this.hazards[index];
            if (hazard.type === type && !hazard.triggered) count += 1;
        }
        return count;
    }

    private earliestUnlockHeightMeters(): number {
        return Math.min(
            this.config.hazards.ufo.unlockHeightMeters,
            this.config.hazards.blackHole.unlockHeightMeters,
            this.config.hazards.bearTrap.unlockHeightMeters,
        );
    }

    private allocateId(prefix: string): string {
        const id = `${prefix}${this.nextHazardId}`;
        this.nextHazardId += 1;
        return id;
    }

    private startWorldY(): number {
        return this.config.fixedPlatforms[0].y + this.config.player.collisionHeight / 2;
    }
}
