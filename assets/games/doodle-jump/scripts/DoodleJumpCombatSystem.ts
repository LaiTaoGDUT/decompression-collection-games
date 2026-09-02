import type {
    DoodleJumpEnemyType,
    DoodleJumpGameplayConfig,
    DoodleJumpPlatformType,
} from './DoodleJumpConfig';
import type { DoodleJumpRandomStreams } from './DoodleJumpRandom';

export interface DoodleJumpCombatPlatform {
    readonly id: string;
    readonly type: DoodleJumpPlatformType;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly collisionEnabled: boolean;
    readonly consumed: boolean;
}

export interface DoodleJumpCombatOccupiedBody {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly anchorPlatformId?: string;
}

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
    readonly animationPhase: number;
    readonly anchorPlatformId: string;
}

export interface DoodleJumpCombatStats {
    readonly hitCount: number;
    readonly killCount: number;
    readonly stompCount: number;
    readonly smallMonsterKills: number;
    readonly largeMonsterKills: number;
    readonly hoverMonsterKills: number;
    readonly score: number;
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
    readonly width: number;
    readonly height: number;
    readonly headZoneHeight: number;
    readonly maximumHealth: number;
    readonly score: number;
    health: number;
    x: number;
    y: number;
    hurtUntil: number;
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

export class DoodleJumpCombatSystem {
    private readonly enemies: MutableEnemy[] = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpCombatEvent[] = [];
    private nextEnemyId = 1;
    private elapsedSeconds = 0;
    private hitCount = 0;
    private killCount = 0;
    private stompCount = 0;
    private smallMonsterKills = 0;
    private largeMonsterKills = 0;
    private hoverMonsterKills = 0;
    private score = 0;
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
        this.hoverMonsterKills = 0;
        this.score = 0;
        this.lastSpawnAnchorY = Number.NEGATIVE_INFINITY;
    }

    restore(
        snapshots: readonly DoodleJumpEnemySnapshot[],
        stats: DoodleJumpCombatStats,
        elapsedSeconds: number,
        platforms: readonly DoodleJumpCombatPlatform[],
    ): void {
        this.reset();
        this.elapsedSeconds = Math.max(0, elapsedSeconds);
        this.hitCount = Math.max(0, Math.floor(stats.hitCount));
        this.killCount = Math.max(0, Math.floor(stats.killCount));
        this.stompCount = Math.max(0, Math.floor(stats.stompCount));
        this.smallMonsterKills = Math.max(0, Math.floor(stats.smallMonsterKills));
        this.largeMonsterKills = Math.max(0, Math.floor(stats.largeMonsterKills));
        this.hoverMonsterKills = Math.max(0, Math.floor(stats.hoverMonsterKills));
        this.score = Math.max(0, Math.floor(stats.score));
        const platformById = new Map<string, DoodleJumpCombatPlatform>();
        platforms.forEach((platform) => {
            platformById.set(platform.id, platform);
            this.evaluatedPlatformIds.add(platform.id);
        });
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            const platform = platformById.get(snapshot.anchorPlatformId);
            const settings = this.config.enemies[snapshot.type];
            if (!platform || !settings || snapshot.health <= 0) return;
            const parsedId = Number(snapshot.id.replace(/^E/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            this.enemies.push({
                id: snapshot.id,
                type: snapshot.type,
                anchorPlatformId: snapshot.anchorPlatformId,
                anchorOffsetX: snapshot.type === 'hover' ? snapshot.x - platform.x : 0,
                phaseRadians: snapshot.animationPhase * Math.PI * 2,
                animationPhase: snapshot.animationPhase,
                width: settings.width,
                height: settings.height,
                headZoneHeight: settings.headZoneHeight,
                maximumHealth: settings.health,
                score: settings.killScore,
                health: Math.min(settings.health, Math.max(1, Math.floor(snapshot.health))),
                x: snapshot.x,
                y: snapshot.y,
                hurtUntil: snapshot.hurt ? this.elapsedSeconds + this.config.enemies.hitFlashSeconds : 0,
            });
            this.lastSpawnAnchorY = Math.max(this.lastSpawnAnchorY, platform.y);
        });
        this.nextEnemyId = maximumId + 1;
        this.events.length = 0;
    }

    syncWorld(
        elapsedSeconds: number,
        platforms: readonly DoodleJumpCombatPlatform[],
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpCombatOccupiedBody[] = [],
    ): void {
        this.elapsedSeconds = elapsedSeconds;
        const platformById = new Map<string, DoodleJumpCombatPlatform>();
        platforms.forEach((platform) => platformById.set(platform.id, platform));
        this.updateEnemyPositions(platformById);
        this.recycleEnemies(cameraBottomY);
        this.purgeEvaluatedPlatforms(platformById);
        this.evaluateNewPlatforms(platforms, cameraBottomY, cameraTopY, occupiedBodies);
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
        const stompCandidates = this.enemies.filter((enemy) => {
            const enemyTop = enemy.y + enemy.height / 2;
            return velocityY <= 0
                && previousFootY >= enemyTop
                && currentFootY <= enemyTop
                && currentFootY >= enemyTop - enemy.headZoneHeight
                && Math.abs(playerX - enemy.x) <= halfPlayerWidth + enemy.width / 2;
        }).sort((left, right) => {
            const leftTop = left.y + left.height / 2;
            const rightTop = right.y + right.height / 2;
            if (leftTop !== rightTop) return rightTop - leftTop;
            return left.id.localeCompare(right.id);
        });
        if (stompCandidates.length > 0) {
            const enemy = stompCandidates[0];
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
        const contacts = this.enemies.filter((enemy) => (
            playerRight >= enemy.x - enemy.width / 2
            && playerLeft <= enemy.x + enemy.width / 2
            && playerTop >= enemy.y - enemy.height / 2
            && playerBottom <= enemy.y + enemy.height / 2
        )).sort((left, right) => left.id.localeCompare(right.id));
        if (contacts.length === 0) return Object.freeze({ outcome: 'none' });
        return Object.freeze({ outcome: 'contact', enemyId: contacts[0].id });
    }

    hitByProjectileSweep(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        projectileRadius = 5,
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
        if (this.events.length === 0) return Object.freeze([]);
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
            animationPhase: enemy.animationPhase,
            anchorPlatformId: enemy.anchorPlatformId,
        })));
    }

    getStats(): DoodleJumpCombatStats {
        return Object.freeze({
            hitCount: this.hitCount,
            killCount: this.killCount,
            stompCount: this.stompCount,
            smallMonsterKills: this.smallMonsterKills,
            largeMonsterKills: this.largeMonsterKills,
            hoverMonsterKills: this.hoverMonsterKills,
            score: this.score,
        });
    }

    private evaluateNewPlatforms(
        platforms: readonly DoodleJumpCombatPlatform[],
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpCombatOccupiedBody[],
    ): void {
        if (!this.config.enemies.enabled) return;
        const ordered = platforms.slice().sort((left, right) => (
            left.y !== right.y ? left.y - right.y : left.id.localeCompare(right.id)
        ));
        for (let index = 0; index < ordered.length; index += 1) {
            const platform = ordered[index];
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            if (platform.y < cameraBottomY) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            // A monster may only enter the world while its anchor platform is
            // still fully above the visible playfield. Once a platform reaches
            // the screen, permanently consume the candidate instead of using it
            // as an immediate replacement after another monster dies.
            if (platform.y <= cameraTopY + this.config.enemies.spawnAboveScreenMargin) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            const platformMeters = Math.max(0, (platform.y - this.startWorldY()) / 100);
            if (platformMeters < 70) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            const activeLimit = Math.min(
                this.config.enemies.maximumActive,
                platformMeters < this.config.enemies.twoActiveHeightMeters ? 1
                    : platformMeters < this.config.enemies.threeActiveHeightMeters ? 2
                        : 3,
            );
            // Platforms waiting above the current camera remain eligible after an
            // older enemy recycles; do not consume their deterministic spawn roll
            // merely because the active budget is temporarily full.
            if (this.enemies.length >= activeLimit) continue;
            this.evaluatedPlatformIds.add(platform.id);
            if (!platform.collisionEnabled || platform.consumed) continue;
            if (platform.id === 'P0' || platform.id === 'P1' || platform.id === 'P2') continue;
            const difficulty = this.enemyDifficultyProgress(platformMeters);
            const spawnChance = this.config.enemies.spawnChanceAtUnlock
                + (this.config.enemies.spawnChancePerPlatform
                    - this.config.enemies.spawnChanceAtUnlock) * difficulty;
            const minimumSeparation = this.config.enemies.minimumVerticalSeparationAtUnlock
                + (this.config.enemies.minimumVerticalSeparation
                    - this.config.enemies.minimumVerticalSeparationAtUnlock) * difficulty;
            if (platform.y - this.lastSpawnAnchorY < minimumSeparation) continue;
            if (this.randomStreams.next('enemy') >= spawnChance) {
                continue;
            }
            const type = this.pickEnemyType(platformMeters);
            if (!type) continue;
            const enemy = this.createEnemy(type, platform, occupiedBodies);
            if (!enemy) continue;
            if (this.enemies.some((candidate) => (
                Math.abs(candidate.y - enemy.y)
                    < minimumSeparation
            ))) continue;
            this.enemies.push(enemy);
            this.lastSpawnAnchorY = platform.y;
        }
    }

    private enemyDifficultyProgress(heightMeters: number): number {
        const start = this.config.enemies.small.unlockHeightMeters;
        const end = this.config.enemies.difficultyCapHeightMeters;
        return Math.max(0, Math.min(1, (heightMeters - start) / Math.max(1, end - start)));
    }

    private pickEnemyType(heightMeters: number): DoodleJumpEnemyType | undefined {
        const weighted: Array<readonly [DoodleJumpEnemyType, number]> = [];
        if (heightMeters < 150) {
            weighted.push(['small', 1]);
        } else if (heightMeters < 220) {
            weighted.push(['small', 0.7], ['hover', 0.3]);
        } else if (heightMeters < 260) {
            weighted.push(['small', 0.55], ['large', 0.15], ['hover', 0.3]);
        } else if (heightMeters < 400) {
            weighted.push(['small', 0.45], ['large', 0.25], ['hover', 0.3]);
        } else {
            weighted.push(['small', 0.35], ['large', 0.35], ['hover', 0.3]);
        }
        let roll = this.randomStreams.next('enemy');
        for (let index = 0; index < weighted.length; index += 1) {
            roll -= weighted[index][1];
            if (roll < 0) return weighted[index][0];
        }
        return weighted.length > 0 ? weighted[weighted.length - 1][0] : undefined;
    }

    private createEnemy(
        type: DoodleJumpEnemyType,
        platform: DoodleJumpCombatPlatform,
        occupiedBodies: readonly DoodleJumpCombatOccupiedBody[],
    ): MutableEnemy | undefined {
        const settings = this.config.enemies[type];
        if (platform.type === 'moving' || platform.type === 'shifting') return undefined;
        if (type !== 'hover'
            && (platform.type === 'breakable'
                || platform.type === 'disappearing'
                || platform.type === 'exploding')) return undefined;
        const maximumGroundRange = Math.max(0, platform.width / 2 - settings.width / 2 - 8);
        if (type !== 'hover' && maximumGroundRange < 12) return undefined;
        const side = this.randomStreams.next('enemy') < 0.5 ? -1 : 1;
        const anchorOffsetX = type === 'hover'
            ? side * Math.min(118, platform.width / 2 + 62)
            : 0;
        const phaseRadians = this.randomStreams.next('enemy') * Math.PI * 2;
        const enemy: MutableEnemy = {
            id: `E${this.nextEnemyId}`,
            type,
            anchorPlatformId: platform.id,
            anchorOffsetX,
            phaseRadians,
            animationPhase: this.randomStreams.next('enemy'),
            width: settings.width,
            height: settings.height,
            headZoneHeight: settings.headZoneHeight,
            maximumHealth: settings.health,
            score: settings.killScore,
            health: settings.health,
            x: platform.x + anchorOffsetX,
            y: platform.y + settings.height / 2,
            hurtUntil: 0,
        };
        this.nextEnemyId += 1;
        this.positionEnemy(enemy, platform);
        if (occupiedBodies.some((body) => (
            body.anchorPlatformId === platform.id
            || (Math.abs(body.x - enemy.x) <= body.width / 2 + enemy.width / 2 + 12
                && Math.abs(body.y - enemy.y) <= body.height / 2 + enemy.height / 2 + 12)
        ))) return undefined;
        return enemy;
    }

    private updateEnemyPositions(
        platformById: ReadonlyMap<string, DoodleJumpCombatPlatform>,
    ): void {
        this.enemies.forEach((enemy) => {
            const platform = platformById.get(enemy.anchorPlatformId);
            if (platform) this.positionEnemy(enemy, platform);
        });
    }

    private positionEnemy(enemy: MutableEnemy, platform: DoodleJumpCombatPlatform): void {
        const settings = this.config.enemies[enemy.type];
        const cycleRadians = this.elapsedSeconds * Math.PI * 2 / settings.cycleSeconds
            + enemy.phaseRadians;
        if (enemy.type === 'hover') {
            const horizontal = Math.sin(cycleRadians) * settings.horizontalRange;
            enemy.x = Math.max(
                enemy.width / 2,
                Math.min(
                    this.config.design.width - enemy.width / 2,
                    platform.x + enemy.anchorOffsetX + horizontal,
                ),
            );
            enemy.y = platform.y + settings.anchorHeight
                + Math.sin(cycleRadians * 2) * settings.verticalRange;
            return;
        }
        const availableRange = Math.max(
            0,
            Math.min(settings.horizontalRange, platform.width / 2 - enemy.width / 2 - 8),
        );
        enemy.x = platform.x + Math.sin(cycleRadians) * availableRange;
        enemy.y = platform.y + enemy.height / 2;
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
        Array.from(this.evaluatedPlatformIds).forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
    }

    private killEnemy(enemy: MutableEnemy, source: 'projectile' | 'stomp'): void {
        const index = this.enemies.indexOf(enemy);
        if (index < 0) return;
        this.enemies.splice(index, 1);
        this.killCount += 1;
        this.score += enemy.score;
        if (enemy.type === 'small') this.smallMonsterKills += 1;
        if (enemy.type === 'large') this.largeMonsterKills += 1;
        if (enemy.type === 'hover') this.hoverMonsterKills += 1;
        if (source === 'stomp') {
            this.stompCount += 1;
            this.score += this.config.enemies.stompBonus;
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
