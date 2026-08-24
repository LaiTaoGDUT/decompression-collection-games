import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { ProjectileModel, ProjectileOwner } from '../core/CombatModels';
import { ObjectPool, type ObjectPoolStats } from '../core/ObjectPool';

/** 玩家与敌方投射物共用固定容量基础池；T1.6 技能系统直接复用 spawn。 */
export class ProjectileSystem {
    private readonly pool: ObjectPool<ProjectileModel>;
    private readonly retireQueue: ProjectileModel[];
    private retireCount = 0;

    constructor(capacity: number = ENDLESS_SWORD_CONFIG.pools.projectiles) {
        this.pool = new ObjectPool(
            capacity,
            (poolIndex) => createProjectileModel(poolIndex),
            resetProjectileModel,
        );
        this.retireQueue = new Array<ProjectileModel>(capacity);
    }

    spawn(
        owner: ProjectileOwner,
        x: number,
        y: number,
        dirX: number,
        dirY: number,
        speed: number,
        damage: number,
        lifetimeSeconds: number,
        width: number = ENDLESS_SWORD_CONFIG.combat.enemyArrowWidth,
        height: number = ENDLESS_SWORD_CONFIG.combat.enemyArrowHeight,
        remainingHits: number = 1,
    ): ProjectileModel | undefined {
        const projectile = this.pool.acquire();
        if (!projectile) {
            return undefined;
        }
        projectile.generation += 1;
        projectile.owner = owner;
        projectile.active = true;
        projectile.expired = false;
        projectile.x = x;
        projectile.y = y;
        projectile.prevX = x;
        projectile.prevY = y;
        projectile.velocityX = dirX * speed;
        projectile.velocityY = dirY * speed;
        projectile.damage = damage;
        projectile.width = width;
        projectile.height = height;
        projectile.remainingHits = remainingHits;
        projectile.lifetimeRemaining = lifetimeSeconds;
        return projectile;
    }

    step(dt: number): void {
        this.pool.forEachActive((projectile) => {
            if (projectile.expired) {
                return;
            }
            projectile.prevX = projectile.x;
            projectile.prevY = projectile.y;
            projectile.x += projectile.velocityX * dt;
            projectile.y += projectile.velocityY * dt;
            projectile.lifetimeRemaining -= dt;
            if (projectile.lifetimeRemaining <= 0) {
                projectile.expired = true;
            }
        });
    }

    consumeHit(projectile: ProjectileModel): void {
        if (projectile.expired) {
            return;
        }
        projectile.remainingHits -= 1;
        if (projectile.remainingHits <= 0) {
            projectile.expired = true;
        }
    }

    flushExpired(beforeRelease: (projectile: ProjectileModel) => void): void {
        this.retireCount = 0;
        this.pool.forEachActive((projectile) => {
            if (projectile.expired && this.retireCount < this.retireQueue.length) {
                this.retireQueue[this.retireCount] = projectile;
                this.retireCount += 1;
            }
        });
        for (let index = 0; index < this.retireCount; index += 1) {
            const projectile = this.retireQueue[index];
            beforeRelease(projectile);
            this.pool.release(projectile);
        }
        this.retireCount = 0;
    }

    clear(beforeRelease?: (projectile: ProjectileModel) => void): void {
        this.retireCount = 0;
        this.pool.clear(beforeRelease);
    }

    forEachActive(visitor: (projectile: ProjectileModel) => void): void {
        this.pool.forEachActive(visitor);
    }

    get stats(): ObjectPoolStats {
        return this.pool.stats;
    }
}

function createProjectileModel(poolIndex: number): ProjectileModel {
    return {
        poolIndex,
        generation: 0,
        owner: 'enemy',
        active: false,
        expired: false,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        velocityX: 0,
        velocityY: 0,
        damage: 0,
        width: 0,
        height: 0,
        remainingHits: 0,
        lifetimeRemaining: 0,
    };
}

function resetProjectileModel(projectile: ProjectileModel): void {
    projectile.active = false;
    projectile.expired = false;
    projectile.damage = 0;
    projectile.remainingHits = 0;
    projectile.lifetimeRemaining = 0;
}
