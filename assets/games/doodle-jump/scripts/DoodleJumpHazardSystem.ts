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

export type DoodleJumpHazardFailureReason = 'ufo-abduction' | 'ufo-contact' | 'black-hole' | 'bear-trap';

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
    readonly originX?: number;
    readonly originY?: number;
    readonly spawnedAt?: number;
    readonly captureStartX?: number;
    readonly captureStartY?: number;
}

export interface DoodleJumpHazardStats {
    readonly evaluatedPlatformIds?: readonly string[];
    readonly ufoInterruptCount: number;
}

export interface DoodleJumpHazardResolution {
    readonly accelerationX: number;
    readonly accelerationY: number;
    readonly fatalReason?: DoodleJumpHazardFailureReason;
    readonly fatalHazardId?: string;
    readonly focusX?: number;
    readonly focusY?: number;
    readonly capturedPlayerX?: number;
    readonly capturedPlayerY?: number;
    readonly bounceSurfaceY?: number;
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
    readonly originX: number;
    readonly originY: number;
    readonly spawnedAt: number;
    captureStartX: number;
    captureStartY: number;
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
}

type MutableHazard = MutableUfo | MutableBlackHole | MutableBearTrap;

interface ProjectileUfoHit {
    readonly hazardId: string;
    readonly x: number;
    readonly y: number;
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

const EMPTY_EVENTS: readonly DoodleJumpHazardEvent[] = Object.freeze([]);

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
    };
    private nextHazardId = 1;
    private elapsedSeconds = 0;
    private ufoInterruptCount = 0;
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
        const evaluatedIds = stats.evaluatedPlatformIds
            ?? world.platforms.map((platform) => platform.id);
        evaluatedIds.forEach((id) => {
            if (world.platformById.has(id)) this.evaluatedPlatformIds.add(id);
        });
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            if (snapshot.anchorPlatformId && world.platformById.has(snapshot.anchorPlatformId)) {
                this.evaluatedPlatformIds.add(snapshot.anchorPlatformId);
            }
            const parsedId = Number(snapshot.id.replace(/^[UBT]/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            if (snapshot.type === 'ufo') {
                this.hazards.push({
                    id: snapshot.id,
                    type: 'ufo',
                    originX: snapshot.originX ?? snapshot.x, originY: snapshot.originY ?? snapshot.y,
                    spawnedAt: snapshot.spawnedAt ?? this.elapsedSeconds,
                    captureStartX: snapshot.captureStartX ?? snapshot.x, captureStartY: snapshot.captureStartY ?? snapshot.y,
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
                    pausedUntil: 0,
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

    isPlayerCaptured(): boolean {
        return this.hazards.some((hazard) => hazard.type === 'ufo' && hazard.lockSeconds > 0 && !hazard.triggered);
    }

    resolvePlayer(deltaSeconds: number, playerX: number, playerY: number, previousFootY: number,
        playerWidth: number, playerHeight: number, playerInvincible = false): DoodleJumpHazardResolution {
        const neutral = { accelerationX: 0, accelerationY: 0 };
        const playerBottom = playerY - playerHeight / 2;
        const playerTop = playerY + playerHeight / 2;
        const intersects = (x: number, y: number, width: number, height: number): boolean =>
            Math.abs(playerX - x) <= (playerWidth + width) / 2
            && playerTop >= y - height / 2 && playerBottom <= y + height / 2;
        // Native holes are lethal contacts. They do not pull on movement, and
        // shield / equipment never grants immunity to their core.
        for (const hole of this.collectHazardsByType('black-hole', this.orderedBlackHoles)) {
            const size = this.config.hazards.blackHole.coreRadius * 2;
            if (!hole.triggered && intersects(hole.x, hole.y, size, size)) {
                hole.triggered = true;
                return { ...neutral, fatalReason: 'black-hole', fatalHazardId: hole.id, focusX: hole.x, focusY: hole.y };
            }
        }
        for (const ufo of this.collectHazardsByType('ufo', this.orderedUfos)) {
            if (ufo.triggered) continue;
            const topY = ufo.y + ufo.height / 2;
            if (ufo.lockSeconds === 0) {
                if (previousFootY >= topY && playerBottom <= topY && playerBottom < previousFootY
                    && Math.abs(playerX - ufo.x) <= (playerWidth + ufo.width) / 2) {
                    this.destroyUfo(ufo);
                    return { ...neutral, bounceSurfaceY: topY };
                }
                if (intersects(ufo.x, ufo.y, ufo.width, ufo.height)) {
                    if (playerInvincible) { this.destroyUfo(ufo); continue; }
                    return { ...neutral, fatalReason: 'ufo-contact', fatalHazardId: ufo.id, focusX: ufo.x, focusY: ufo.y };
                }
                const beamTop = ufo.y - ufo.height / 2;
                const beamBottom = beamTop - this.config.hazards.ufo.beamLength;
                const insideBeam = playerBottom <= beamTop && playerTop >= beamBottom
                    && Math.abs(playerX - ufo.x) <= (this.config.hazards.ufo.beamWidth + playerWidth) / 2;
                if (!insideBeam) continue;
                ufo.lockSeconds = this.config.hazards.ufo.lockSeconds;
                ufo.captureStartX = playerX; ufo.captureStartY = playerY;
            }
            ufo.abductionSeconds += Math.max(0, deltaSeconds);
            const progress = Math.min(1, ufo.abductionSeconds / this.config.hazards.ufo.abductionSeconds);
            const capturedPlayerX = ufo.captureStartX + (ufo.x - ufo.captureStartX) * progress;
            const capturedPlayerY = ufo.captureStartY + (ufo.y - ufo.captureStartY) * progress;
            if (progress >= 1 - 1e-7) {
                ufo.triggered = true;
                return { ...neutral, fatalReason: 'ufo-abduction', fatalHazardId: ufo.id, focusX: ufo.x, focusY: ufo.y,
                    capturedPlayerX, capturedPlayerY };
            }
            return { ...neutral, capturedPlayerX, capturedPlayerY };
        }
        if (!playerInvincible) {
            for (const trap of this.collectHazardsByType('bear-trap', this.orderedBearTraps)) {
                if (trap.triggered || playerBottom >= previousFootY || previousFootY < trap.y - trap.height / 2) continue;
                if (!intersects(trap.x, trap.y, trap.width, trap.height)) continue;
                trap.triggered = true;
                this.events.push(Object.freeze({ type: 'bear-trap-trigger', hazardId: trap.id, x: trap.x, y: trap.y }));
                return { ...neutral, fatalReason: 'bear-trap', fatalHazardId: trap.id, focusX: trap.x, focusY: trap.y };
            }
        }
        return neutral;
    }

    resolveBlackHoleAttraction(_playerX: number, _playerY: number): Readonly<{ accelerationX: number; accelerationY: number }> {
        return { accelerationX: 0, accelerationY: 0 };
    }

    hitUfoByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        projectileRadius = 6 * this.config.design.width / 320,
    ): ProjectileUfoHit | undefined {
        let target: MutableUfo | undefined;
        let targetTime = Number.POSITIVE_INFINITY;
        this.hazards.forEach((hazard) => {
            if (hazard.type !== 'ufo' || hazard.triggered || hazard.lockSeconds > 0) return;
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
        this.destroyUfo(ufo);
        return Object.freeze({ hazardId: ufo.id, x: ufo.x, y: ufo.y });
    }

    drainEvents(): readonly DoodleJumpHazardEvent[] {
        if (this.events.length === 0) return EMPTY_EVENTS;
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
                originX: ufo?.originX, originY: ufo?.originY, spawnedAt: ufo?.spawnedAt,
                captureStartX: ufo?.captureStartX, captureStartY: ufo?.captureStartY,
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
            evaluatedPlatformIds: Object.freeze(Array.from(this.evaluatedPlatformIds)),
            ufoInterruptCount: this.ufoInterruptCount,
        });
    }

    getPresentationStats(): DoodleJumpHazardStats {
        this.presentationStats.ufoInterruptCount = this.ufoInterruptCount;
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

    private destroyUfo(ufo: MutableUfo): void {
        const index = this.hazards.indexOf(ufo);
        if (index < 0) return;
        this.hazards.splice(index, 1);
        this.ufoInterruptCount += 1;
        this.events.push(Object.freeze({ type: 'ufo-interrupt', hazardId: ufo.id, x: ufo.x, y: ufo.y }));
    }

    private updateUfos(_deltaSeconds: number, _playerX: number): void {
        const scale = this.config.design.width / 320;
        for (const hazard of this.hazards) {
            if (hazard.type !== 'ufo' || hazard.triggered || hazard.lockSeconds > 0) continue;
            const frames = Math.max(0, this.elapsedSeconds - hazard.spawnedAt) * 60;
            hazard.x = hazard.originX + Math.sin(frames * 0.02 + hazard.phase * Math.PI * 2) * 20 * scale;
            hazard.y = hazard.originY + Math.sin(frames * 0.04 + hazard.phase * Math.PI * 2) * 10 * scale;
        }
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

    private evaluateNewPlatforms(platforms: readonly DoodleJumpHazardPlatform[], playerX: number, playerY: number,
        cameraBottomY: number, cameraTopY: number, occupiedBodies: readonly DoodleJumpHazardOccupiedBody[]): void {
        if (!this.config.hazards.enabled) return;
        for (const platform of platforms) {
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            if (platform.spawnPlan?.content !== 'hazard' || !platform.spawnPlan.hazardType
                || platform.y < cameraBottomY || platform.consumed) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            if (this.hazards.length >= this.config.hazards.maximumActive) continue;
            const type = this.config.hazards.typeOverride === 'auto' ? platform.spawnPlan.hazardType : this.config.hazards.typeOverride;
            const hazard = this.createHazard(type, platform, playerX, playerY, cameraTopY, platforms, occupiedBodies);
            this.evaluatedPlatformIds.add(platform.id);
            if (hazard) { this.hazards.push(hazard); this.lastSpawnAnchorY = platform.y; }
        }
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
            return { id: this.allocateId('U'), type, x: platform.x, y: platform.y,
                originX: platform.x, originY: platform.y, spawnedAt: this.elapsedSeconds, captureStartX: 0, captureStartY: 0,
                width: settings.width, height: settings.height, phase, triggered: false,
                lockSeconds: 0, abductionSeconds: 0, leaveSeconds: 0, pausedUntil: 0 };
        }
        if (type === 'black-hole') {
            const settings = this.config.hazards.blackHole;
            return { id: this.allocateId('B'), type, x: platform.x, y: platform.y,
                width: settings.outerRadius * 2, height: settings.outerRadius * 2, phase, triggered: false };
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

    private purgeEvaluatedPlatforms(
        platformById: ReadonlyMap<string, DoodleJumpHazardPlatform>,
    ): void {
        this.evaluatedPlatformIds.forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
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
