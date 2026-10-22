import { referenceEnemyOffset, createReferenceMonsterMotion, stepReferenceMonsterMotion,
    type DoodleJumpMonsterMotionState } from './DoodleJumpReferenceRules';
import type {
    DoodleJumpEnemyType,
    DoodleJumpGameplayConfig,
} from './DoodleJumpConfig';
import type { DoodleJumpRandomStreams } from './DoodleJumpRandom';
import type {
    DoodleJumpWorldIndex,
    DoodleJumpWorldOccupiedBody,
    DoodleJumpWorldPlatform,
} from './DoodleJumpWorld';

export type DoodleJumpCombatPlatform = DoodleJumpWorldPlatform;
export type DoodleJumpCombatOccupiedBody = DoodleJumpWorldOccupiedBody;

export interface DoodleJumpEnemySnapshot {
    readonly id: string;
    readonly type: DoodleJumpEnemyType;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly health: number;
    readonly maximumHealth: number;
    readonly hurt: boolean;
    readonly hurtRemainingSeconds?: number;
    readonly animationPhase: number;
    readonly facing?: -1 | 1;
    readonly anchorPlatformId: string;
    readonly motionPhase: number;
    readonly anchorOffsetX: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly spawnedAt?: number;
    readonly verticalPhase?: number;
    readonly motionState?: Readonly<DoodleJumpMonsterMotionState>;
}

export interface DoodleJumpCombatStats {
    readonly evaluatedPlatformIds?: readonly string[];
    readonly hitCount: number;
    readonly killCount: number;
    readonly stompCount: number;
    readonly smallMonsterKills: number;
    readonly largeMonsterKills: number;
    readonly hopperMonsterKills: number;
    readonly weaverMonsterKills: number;
    readonly hoverMonsterKills: number;
    readonly flyerMonsterKills?: number;
    readonly tallMonsterKills?: number;
    readonly runnerMonsterKills?: number;
    readonly bouncerMonsterKills?: number;
}

export type DoodleJumpCombatEvent = Readonly<{
    type: 'hit' | 'kill' | 'stomp';
    enemyId: string;
    enemyType: DoodleJumpEnemyType;
    x: number;
    y: number;
}>;

export interface DoodleJumpProjectileHitResult {
    readonly enemyId: string;
    readonly enemyType: DoodleJumpEnemyType;
    readonly killed: boolean;
    readonly x: number;
    readonly y: number;
}

export interface DoodleJumpPlayerCombatResult {
    readonly outcome: 'none' | 'stomp' | 'contact';
    readonly enemyId?: string;
    readonly bounceSurfaceY?: number;
}

interface MutableEnemy {
    readonly id: string;
    readonly type: DoodleJumpEnemyType;
    readonly anchorPlatformId: string;
    readonly anchorOffsetX: number;
    readonly phaseRadians: number;
    readonly animationPhase: number;
    readonly originX: number;
    readonly originY: number;
    readonly spawnedAt: number;
    readonly verticalPhase: number;
    readonly width: number;
    readonly height: number;
    readonly maximumHealth: number;
    readonly motionState: DoodleJumpMonsterMotionState;
    health: number;
    x: number;
    y: number;
    facing: -1 | 1;
    hurtUntil: number;
    previousY: number;
}

interface MutableEnemyPresentation {
    id: string;
    type: DoodleJumpEnemyType;
    x: number;
    y: number;
    width: number;
    height: number;
    health: number;
    maximumHealth: number;
    hurt: boolean;
    animationPhase: number;
    facing: -1 | 1;
    anchorPlatformId: string;
    motionPhase: number;
    anchorOffsetX: number;
}

interface MutableCombatStats {
    hitCount: number;
    killCount: number;
    stompCount: number;
    smallMonsterKills: number;
    largeMonsterKills: number;
    hopperMonsterKills: number;
    weaverMonsterKills: number;
    hoverMonsterKills: number;
    flyerMonsterKills: number;
    tallMonsterKills: number;
    runnerMonsterKills: number;
    bouncerMonsterKills: number;
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

const EMPTY_EVENTS: readonly DoodleJumpCombatEvent[] = Object.freeze([]);

export class DoodleJumpCombatSystem {
    private readonly enemies: MutableEnemy[] = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpCombatEvent[] = [];
    private readonly presentationEnemies: MutableEnemyPresentation[] = [];
    private readonly presentationStats: MutableCombatStats = {
        hitCount: 0,
        killCount: 0,
        stompCount: 0,
        smallMonsterKills: 0,
        largeMonsterKills: 0,
        hopperMonsterKills: 0,
        weaverMonsterKills: 0,
        hoverMonsterKills: 0,
        flyerMonsterKills: 0,
        tallMonsterKills: 0,
        runnerMonsterKills: 0,
        bouncerMonsterKills: 0,
    };
    private nextEnemyId = 1;
    private elapsedSeconds = 0;
    private hitCount = 0;
    private killCount = 0;
    private stompCount = 0;
    private smallMonsterKills = 0;
    private largeMonsterKills = 0;
    private hopperMonsterKills = 0;
    private weaverMonsterKills = 0;
    private hoverMonsterKills = 0;
    private flyerMonsterKills = 0;
    private tallMonsterKills = 0;
    private runnerMonsterKills = 0;
    private bouncerMonsterKills = 0;
    private lastSpawnAnchorY = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly config: DoodleJumpGameplayConfig,
        private readonly randomStreams: DoodleJumpRandomStreams,
    ) {}

    reset(): void {
        this.enemies.length = 0;
        this.evaluatedPlatformIds.clear();
        this.events.length = 0;
        this.nextEnemyId = 1;
        this.elapsedSeconds = 0;
        this.hitCount = 0;
        this.killCount = 0;
        this.stompCount = 0;
        this.smallMonsterKills = 0;
        this.largeMonsterKills = 0;
        this.hopperMonsterKills = 0;
        this.weaverMonsterKills = 0;
        this.hoverMonsterKills = 0;
        this.flyerMonsterKills = 0;
        this.tallMonsterKills = 0;
        this.runnerMonsterKills = 0;
        this.bouncerMonsterKills = 0;
        this.lastSpawnAnchorY = Number.NEGATIVE_INFINITY;
    }

    restore(
        snapshots: readonly DoodleJumpEnemySnapshot[],
        stats: DoodleJumpCombatStats,
        elapsedSeconds: number,
        world: DoodleJumpWorldIndex,
    ): void {
        if (!Number.isInteger(stats.hopperMonsterKills) || stats.hopperMonsterKills < 0
            || !Number.isInteger(stats.weaverMonsterKills) || stats.weaverMonsterKills < 0
            || snapshots.some(snapshot => !Number.isFinite(snapshot.motionPhase) || !Number.isFinite(snapshot.anchorOffsetX))) {
            throw new Error('Invalid Doodle Jump combat snapshot.');
        }
        this.reset();
        this.elapsedSeconds = Math.max(0, elapsedSeconds);
        this.hitCount = Math.max(0, Math.floor(stats.hitCount));
        this.killCount = Math.max(0, Math.floor(stats.killCount));
        this.stompCount = Math.max(0, Math.floor(stats.stompCount));
        this.smallMonsterKills = Math.max(0, Math.floor(stats.smallMonsterKills));
        this.largeMonsterKills = Math.max(0, Math.floor(stats.largeMonsterKills));
        this.hoverMonsterKills = Math.max(0, Math.floor(stats.hoverMonsterKills));
        this.hopperMonsterKills = stats.hopperMonsterKills;
        this.weaverMonsterKills = stats.weaverMonsterKills;
        this.flyerMonsterKills = Math.max(0, Math.floor(stats.flyerMonsterKills ?? 0));
        this.tallMonsterKills = Math.max(0, Math.floor(stats.tallMonsterKills ?? 0));
        this.runnerMonsterKills = Math.max(0, Math.floor(stats.runnerMonsterKills ?? 0));
        this.bouncerMonsterKills = Math.max(0, Math.floor(stats.bouncerMonsterKills ?? 0));
        const evaluatedIds = stats.evaluatedPlatformIds
            ?? world.platforms.map((platform) => platform.id);
        evaluatedIds.forEach((id) => {
            if (world.platformById.has(id)) this.evaluatedPlatformIds.add(id);
        });
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            const platform = world.platformById.get(snapshot.anchorPlatformId);
            const settings = this.config.enemies[snapshot.type];
            if (!settings || snapshot.health <= 0) return;
            if (platform) this.evaluatedPlatformIds.add(snapshot.anchorPlatformId);
            const parsedId = Number(snapshot.id.replace(/^E/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            const motionState = snapshot.motionState ? { ...snapshot.motionState }
                : createReferenceMonsterMotion(snapshot.type,
                    snapshot.x / (this.config.design.width / 320) - referenceEnemyOffset(snapshot.type)[0],
                    snapshot.y / (this.config.design.width / 320) - referenceEnemyOffset(snapshot.type)[1],
                    Math.floor(snapshot.motionPhase * 180 / Math.PI),
                    Math.floor((snapshot.verticalPhase ?? 0) * 180 / Math.PI));
            this.enemies.push({
                id: snapshot.id,
                type: snapshot.type,
                anchorPlatformId: snapshot.anchorPlatformId,
                anchorOffsetX: snapshot.anchorOffsetX,
                phaseRadians: snapshot.motionPhase,
                animationPhase: snapshot.animationPhase,
                originX: snapshot.originX ?? platform?.x ?? snapshot.x,
                originY: snapshot.originY ?? platform?.y ?? snapshot.y,
                spawnedAt: snapshot.spawnedAt ?? this.elapsedSeconds,
                verticalPhase: snapshot.verticalPhase ?? 0,
                motionState,
                width: settings.width,
                height: settings.height,
                maximumHealth: settings.health,
                health: Math.min(settings.health, Math.max(1, Math.floor(snapshot.health))),
                x: snapshot.x,
                y: snapshot.y,
                facing: snapshot.facing === -1 || snapshot.facing === 1
                    ? snapshot.facing : this.initialEnemyFacing(snapshot.type, motionState),
                previousY: snapshot.y,
                hurtUntil: snapshot.hurt ? this.elapsedSeconds + (snapshot.hurtRemainingSeconds ?? this.config.enemies.hitFlashSeconds) : 0,
            });
            this.lastSpawnAnchorY = Math.max(this.lastSpawnAnchorY, snapshot.originY ?? platform?.y ?? snapshot.y);
        });
        this.nextEnemyId = maximumId + 1;
        this.events.length = 0;
    }

    updateExisting(
        elapsedSeconds: number,
        world: DoodleJumpWorldIndex,
        cameraBottomY: number,
    ): void {
        const frames = Math.max(0, Math.round((elapsedSeconds - this.elapsedSeconds) * 60));
        this.elapsedSeconds = elapsedSeconds;
        this.updateEnemyPositions(frames);
        this.recycleEnemies(cameraBottomY);
    }

    reconcileWorld(
        world: DoodleJumpWorldIndex,
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpCombatOccupiedBody[] = [],
    ): void {
        this.recycleEnemies(cameraBottomY);
        this.purgeEvaluatedPlatforms(world.platformById);
        this.evaluateNewPlatforms(
            world.platforms,
            cameraBottomY,
            cameraTopY,
            occupiedBodies,
        );
    }

    resolvePlayerCollision(
        playerX: number,
        playerY: number,
        previousFootY: number,
        velocityY: number,
        playerWidth: number,
        playerHeight: number,
    ): DoodleJumpPlayerCombatResult {
        const currentFootY = playerY - playerHeight / 2;
        const halfPlayerWidth = playerWidth / 2;
        let stompTarget: MutableEnemy | undefined;
        let stompTargetTop = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < this.enemies.length; index += 1) {
            const enemy = this.enemies[index];
            const enemyTop = enemy.y + enemy.height / 2;
            const isCandidate = velocityY <= 0
                && previousFootY >= enemy.previousY + enemy.height / 2
                && currentFootY <= enemyTop
                && Math.abs(playerX - enemy.x) <= halfPlayerWidth + enemy.width / 2;
            if (!isCandidate) continue;
            if (!stompTarget
                || enemyTop > stompTargetTop
                || (enemyTop === stompTargetTop && enemy.id.localeCompare(stompTarget.id) < 0)) {
                stompTarget = enemy;
                stompTargetTop = enemyTop;
            }
        }
        if (stompTarget) {
            const enemy = stompTarget;
            const bounceSurfaceY = enemy.y + enemy.height / 2;
            this.killEnemy(enemy, 'stomp');
            return Object.freeze({
                outcome: 'stomp',
                enemyId: enemy.id,
                bounceSurfaceY,
            });
        }

        const playerLeft = playerX - halfPlayerWidth;
        const playerRight = playerX + halfPlayerWidth;
        const playerBottom = currentFootY;
        const playerTop = playerY + playerHeight / 2;
        let contactTarget: MutableEnemy | undefined;
        for (let index = 0; index < this.enemies.length; index += 1) {
            const enemy = this.enemies[index];
            if (playerRight < enemy.x - enemy.width / 2
                || playerLeft > enemy.x + enemy.width / 2
                || playerTop < enemy.y - enemy.height / 2
                || playerBottom > enemy.y + enemy.height / 2) continue;
            if (!contactTarget || enemy.id.localeCompare(contactTarget.id) < 0) {
                contactTarget = enemy;
            }
        }
        if (!contactTarget) return Object.freeze({ outcome: 'none' });
        return Object.freeze({ outcome: 'contact', enemyId: contactTarget.id });
    }

    hitByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        projectileRadius = 6 * this.config.design.width / 320,
    ): DoodleJumpProjectileHitResult | undefined {
        let target: MutableEnemy | undefined;
        let targetTime = Number.POSITIVE_INFINITY;
        this.enemies.forEach((enemy) => {
            const halfWidth = enemy.width / 2 + projectileRadius;
            const halfHeight = enemy.height / 2 + projectileRadius;
            const time = segmentAabbTime(
                fromX,
                fromY,
                toX,
                toY,
                enemy.x - halfWidth,
                enemy.x + halfWidth,
                enemy.y - halfHeight,
                enemy.y + halfHeight,
            );
            if (time === undefined) return;
            if (time < targetTime
                || (Math.abs(time - targetTime) < 0.000001
                    && target !== undefined
                    && enemy.id.localeCompare(target.id) < 0)) {
                target = enemy;
                targetTime = time;
            }
        });
        if (!target) return undefined;
        const enemy = target as MutableEnemy;
        enemy.health -= 1;
        enemy.hurtUntil = this.elapsedSeconds + this.config.enemies.hitFlashSeconds;
        this.hitCount += 1;
        const killed = enemy.health <= 0;
        if (killed) {
            this.killEnemy(enemy, 'projectile');
        } else {
            this.events.push(Object.freeze({
                type: 'hit',
                enemyId: enemy.id,
                enemyType: enemy.type,
                x: enemy.x,
                y: enemy.y,
            }));
        }
        return Object.freeze({
            enemyId: enemy.id,
            enemyType: enemy.type,
            killed,
            x: enemy.x,
            y: enemy.y,
        });
    }

    clearNear(x: number, y: number, radius: number): void {
        for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
            const enemy = this.enemies[index];
            if (Math.abs(enemy.x - x) <= radius && Math.abs(enemy.y - y) <= radius) {
                this.enemies.splice(index, 1);
            }
        }
        this.events.length = 0;
    }

    isAreaClear(x: number, y: number, radius: number): boolean {
        return !this.enemies.some((enemy) => (
            Math.abs(enemy.x - x) <= radius && Math.abs(enemy.y - y) <= radius
        ));
    }

    drainEvents(): readonly DoodleJumpCombatEvent[] {
        if (this.events.length === 0) return EMPTY_EVENTS;
        const drained = this.events.splice(0, this.events.length);
        return Object.freeze(drained);
    }

    getSnapshots(): readonly DoodleJumpEnemySnapshot[] {
        return Object.freeze(this.enemies.map((enemy) => Object.freeze({
            id: enemy.id,
            type: enemy.type,
            x: enemy.x,
            y: enemy.y,
            width: enemy.width,
            height: enemy.height,
            health: enemy.health,
            maximumHealth: enemy.maximumHealth,
            hurt: enemy.hurtUntil > this.elapsedSeconds,
            hurtRemainingSeconds: Math.max(0, enemy.hurtUntil - this.elapsedSeconds),
            animationPhase: enemy.animationPhase,
            facing: enemy.facing,
            anchorPlatformId: enemy.anchorPlatformId,
            motionPhase: enemy.phaseRadians,
            anchorOffsetX: enemy.anchorOffsetX,
            originX: enemy.originX,
            originY: enemy.originY,
            spawnedAt: enemy.spawnedAt,
            verticalPhase: enemy.verticalPhase,
            motionState: Object.freeze({ ...enemy.motionState }),
        })));
    }

    getPresentationEnemies(): readonly DoodleJumpEnemySnapshot[] {
        for (let index = 0; index < this.enemies.length; index += 1) {
            const enemy = this.enemies[index];
            let presentation = this.presentationEnemies[index];
            if (!presentation) {
                presentation = {
                    id: enemy.id,
                    type: enemy.type,
                    x: enemy.x,
                    y: enemy.y,
                    width: enemy.width,
                    height: enemy.height,
                    health: enemy.health,
                    maximumHealth: enemy.maximumHealth,
                    hurt: false,
                    animationPhase: enemy.animationPhase,
                    facing: enemy.facing,
                    anchorPlatformId: enemy.anchorPlatformId,
                    motionPhase: enemy.phaseRadians,
                    anchorOffsetX: enemy.anchorOffsetX,
                };
                this.presentationEnemies[index] = presentation;
            }
            presentation.id = enemy.id;
            presentation.type = enemy.type;
            presentation.x = enemy.x;
            presentation.y = enemy.y;
            presentation.width = enemy.width;
            presentation.height = enemy.height;
            presentation.health = enemy.health;
            presentation.maximumHealth = enemy.maximumHealth;
            presentation.hurt = enemy.hurtUntil > this.elapsedSeconds;
            presentation.animationPhase = enemy.animationPhase;
            presentation.facing = enemy.facing;
            presentation.anchorPlatformId = enemy.anchorPlatformId;
            presentation.motionPhase = enemy.phaseRadians;
            presentation.anchorOffsetX = enemy.anchorOffsetX;
        }
        this.presentationEnemies.length = this.enemies.length;
        return this.presentationEnemies;
    }

    hasLargeMonsterOnPlatform(platformId: string): boolean {
        return this.enemies.some((enemy) => (
            enemy.type === 'large' && enemy.anchorPlatformId === platformId
        ));
    }

    getStats(): DoodleJumpCombatStats {
        return Object.freeze({
            evaluatedPlatformIds: Object.freeze(Array.from(this.evaluatedPlatformIds)),
            hitCount: this.hitCount,
            killCount: this.killCount,
            stompCount: this.stompCount,
            smallMonsterKills: this.smallMonsterKills,
            largeMonsterKills: this.largeMonsterKills,
            hopperMonsterKills: this.hopperMonsterKills,
            weaverMonsterKills: this.weaverMonsterKills,
            hoverMonsterKills: this.hoverMonsterKills,
            flyerMonsterKills: this.flyerMonsterKills,
            tallMonsterKills: this.tallMonsterKills,
            runnerMonsterKills: this.runnerMonsterKills,
            bouncerMonsterKills: this.bouncerMonsterKills,
        });
    }

    getPresentationStats(): DoodleJumpCombatStats {
        this.presentationStats.hitCount = this.hitCount;
        this.presentationStats.killCount = this.killCount;
        this.presentationStats.stompCount = this.stompCount;
        this.presentationStats.smallMonsterKills = this.smallMonsterKills;
        this.presentationStats.largeMonsterKills = this.largeMonsterKills;
        this.presentationStats.hopperMonsterKills = this.hopperMonsterKills;
        this.presentationStats.weaverMonsterKills = this.weaverMonsterKills;
        this.presentationStats.hoverMonsterKills = this.hoverMonsterKills;
        this.presentationStats.flyerMonsterKills = this.flyerMonsterKills;
        this.presentationStats.tallMonsterKills = this.tallMonsterKills;
        this.presentationStats.runnerMonsterKills = this.runnerMonsterKills;
        this.presentationStats.bouncerMonsterKills = this.bouncerMonsterKills;
        return this.presentationStats;
    }

    writeOccupiedBodies(
        target: DoodleJumpCombatOccupiedBody[],
        startIndex = 0,
    ): number {
        let cursor = startIndex;
        for (let index = 0; index < this.enemies.length; index += 1) {
            const enemy = this.enemies[index];
            let body = target[cursor];
            if (!body) {
                body = { x: 0, y: 0, width: 0, height: 0 };
                target[cursor] = body;
            }
            body.x = enemy.x;
            body.y = enemy.y;
            body.width = enemy.width;
            body.height = enemy.height;
            body.anchorPlatformId = enemy.anchorPlatformId;
            cursor += 1;
        }
        return cursor;
    }

    private evaluateNewPlatforms(
        platforms: readonly DoodleJumpCombatPlatform[],
        cameraBottomY: number,
        _cameraTopY: number,
        _occupiedBodies: readonly DoodleJumpCombatOccupiedBody[],
    ): void {
        if (!this.config.enemies.enabled) return;
        for (const platform of platforms) {
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            const type = platform.spawnPlan?.enemyType;
            // Native authored entities keep their coordinates and species. The
            // invisible carrier supplies ownership, never a required landing surface.
            if (platform.spawnPlan?.content !== 'enemy' || !type
                || platform.y < cameraBottomY || platform.consumed) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            if (this.enemies.length >= this.config.enemies.maximumActive) continue;
            const enemy = this.createEnemy(type, platform);
            this.enemies.push(enemy);
            this.evaluatedPlatformIds.add(platform.id);
            this.lastSpawnAnchorY = platform.y;
        }
    }

    private createEnemy(type: DoodleJumpEnemyType, platform: DoodleJumpCombatPlatform): MutableEnemy {
        const settings = this.config.enemies[type];
        const scale = this.config.design.width / 320;
        const [offsetX, offsetY] = referenceEnemyOffset(type);
        const bouncing = type === 'bouncer' || type === 'runner' || type === 'tall';
        const phaseX = bouncing || type === 'hover' ? 0 : Math.floor(this.randomStreams.next('enemy') * 360);
        const phaseY = bouncing || type === 'flyer' ? 0 : Math.floor(this.randomStreams.next('enemy') * 360);
        const originX = platform.x + (platform.spawnPlan?.enemyOffsetX ?? 0);
        const originY = platform.y + (platform.spawnPlan?.enemyOffsetY ?? 0);
        const motionState = createReferenceMonsterMotion(type, originX / scale - offsetX,
            originY / scale - offsetY, phaseX, phaseY);
        return {
            id: `E${this.nextEnemyId++}`, type, anchorPlatformId: platform.id, anchorOffsetX: 0,
            phaseRadians: phaseX * Math.PI / 180, verticalPhase: phaseY * Math.PI / 180,
            animationPhase: (phaseX || phaseY) / 360, originX, originY, spawnedAt: this.elapsedSeconds,
            width: settings.width, height: settings.height,
            maximumHealth: settings.health, health: settings.health,
            motionState, x: originX, y: originY, previousY: originY, hurtUntil: 0,
            facing: this.initialEnemyFacing(type, motionState),
        };
    }

    private initialEnemyFacing(type: DoodleJumpEnemyType, motionState: DoodleJumpMonsterMotionState): -1 | 1 {
        const next = { ...motionState };
        stepReferenceMonsterMotion(type, next);
        return next.x < motionState.x ? -1 : 1;
    }

    private updateEnemyPositions(frames: number): void {
        const scale = this.config.design.width / 320;
        for (const enemy of this.enemies) {
            enemy.previousY = enemy.y;
            for (let frame = 0; frame < frames; frame += 1) {
                const previousX = enemy.motionState.x;
                stepReferenceMonsterMotion(enemy.type, enemy.motionState);
                const displacementX = enemy.motionState.x - previousX;
                // Oscillation also moves species whose velocityX is zero. Keep
                // the last facing while stationary, and use each physics step.
                if (displacementX !== 0) enemy.facing = displacementX < 0 ? -1 : 1;
            }
            const [offsetX, offsetY] = referenceEnemyOffset(enemy.type);
            enemy.x = (enemy.motionState.x + offsetX) * scale;
            enemy.y = (enemy.motionState.y + offsetY) * scale;
        }
    }

    defeatContactEnemy(id: string): void {
        const enemy = this.enemies.find((candidate) => candidate.id === id);
        if (enemy) this.killEnemy(enemy, 'contact');
    }

    private recycleEnemies(cameraBottomY: number): void {
        const recycleY = cameraBottomY - this.config.enemies.recycleBelow;
        for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
            if (this.enemies[index].y < recycleY) this.enemies.splice(index, 1);
        }
    }

    private purgeEvaluatedPlatforms(
        platformById: ReadonlyMap<string, DoodleJumpCombatPlatform>,
    ): void {
        this.evaluatedPlatformIds.forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
    }

    private killEnemy(enemy: MutableEnemy, source: 'projectile' | 'stomp' | 'contact'): void {
        const index = this.enemies.indexOf(enemy);
        if (index < 0) return;
        this.enemies.splice(index, 1);
        this.killCount += 1;
        if (enemy.type === 'small') this.smallMonsterKills += 1;
        if (enemy.type === 'large') this.largeMonsterKills += 1;
        if (enemy.type === 'hopper') this.hopperMonsterKills += 1;
        if (enemy.type === 'weaver') this.weaverMonsterKills += 1;
        if (enemy.type === 'hover') this.hoverMonsterKills += 1;
        if (enemy.type === 'flyer') this.flyerMonsterKills += 1;
        if (enemy.type === 'tall') this.tallMonsterKills += 1;
        if (enemy.type === 'runner') this.runnerMonsterKills += 1;
        if (enemy.type === 'bouncer') this.bouncerMonsterKills += 1;
        if (source === 'stomp') {
            this.stompCount += 1;
        }
        this.events.push(Object.freeze({
            type: source === 'stomp' ? 'stomp' : 'kill',
            enemyId: enemy.id,
            enemyType: enemy.type,
            x: enemy.x,
            y: enemy.y,
        }));
    }

    private startWorldY(): number {
        return this.config.fixedPlatforms[0].y + this.config.player.collisionHeight / 2;
    }
}
