import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import { getEnemyConfig, type EnemyType } from '../config/EnemyConfig';
import type { EnemyModel } from '../core/CombatModels';
import { ObjectPool, type ObjectPoolStats } from '../core/ObjectPool';

export type EnemyProjectileEmitter = (
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    damage: number,
    lifetimeSeconds: number,
) => void;

/** 纯逻辑敌人系统；不持有 Cocos 节点或纹理。 */
export class EnemySystem {
    private readonly pool: ObjectPool<EnemyModel>;
    private readonly retireQueue: EnemyModel[];
    private retireCount = 0;

    constructor(capacity: number = ENDLESS_SWORD_CONFIG.pools.enemies) {
        this.pool = new ObjectPool(
            capacity,
            (poolIndex) => createEnemyModel(poolIndex),
            resetEnemyModel,
        );
        this.retireQueue = new Array<EnemyModel>(capacity);
    }

    spawn(type: EnemyType, x: number, y: number): EnemyModel | undefined {
        const enemy = this.pool.acquire();
        if (!enemy) {
            return undefined;
        }
        const config = getEnemyConfig(type);
        enemy.generation += 1;
        enemy.type = type;
        enemy.state = 'alive';
        enemy.x = x;
        enemy.y = y;
        enemy.prevX = x;
        enemy.prevY = y;
        enemy.facingX = 1;
        enemy.hp = config.maxHp;
        enemy.maxHp = config.maxHp;
        enemy.attackCooldown = config.ranged
            ? config.ranged.attackIntervalSeconds * 0.5
            : 0;
        enemy.strafeSign = enemy.poolIndex % 2 === 0 ? 1 : -1;
        enemy.deathElapsed = 0;
        enemy.deathRotation = enemy.poolIndex % 2 === 0 ? 12 : -12;
        enemy.hitFlashRemaining = 0;
        return enemy;
    }

    step(
        dt: number,
        playerX: number,
        playerY: number,
        emitProjectile: EnemyProjectileEmitter,
    ): void {
        this.pool.forEachActive((enemy) => {
            if (enemy.state === 'dying') {
                enemy.deathElapsed += dt;
                if (enemy.deathElapsed >= ENDLESS_SWORD_CONFIG.combat.enemyDeathSeconds) {
                    this.queueRetirement(enemy);
                }
                return;
            }
            if (enemy.state !== 'alive') {
                return;
            }

            enemy.prevX = enemy.x;
            enemy.prevY = enemy.y;
            enemy.hitFlashRemaining = Math.max(0, enemy.hitFlashRemaining - dt);

            const config = getEnemyConfig(enemy.type);
            const dx = playerX - enemy.x;
            const dy = playerY - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const invDistance = distance > 0.0001 ? 1 / distance : 0;
            const towardX = distance > 0.0001 ? dx * invDistance : 1;
            const towardY = distance > 0.0001 ? dy * invDistance : 0;

            let moveX = towardX;
            let moveY = towardY;
            let speedScale = 1;

            if (config.ai === 'crossbow' && config.ranged) {
                if (distance < config.ranged.preferredMinDistance) {
                    moveX = -towardX;
                    moveY = -towardY;
                } else if (distance <= config.ranged.preferredMaxDistance) {
                    moveX = -towardY * enemy.strafeSign;
                    moveY = towardX * enemy.strafeSign;
                    speedScale = 0.45;
                }

                enemy.attackCooldown -= dt;
                if (enemy.attackCooldown <= 0 && distance > 0.0001) {
                    enemy.attackCooldown += config.ranged.attackIntervalSeconds;
                    emitProjectile(
                        enemy.x + towardX * 34,
                        enemy.y + towardY * 34,
                        towardX,
                        towardY,
                        config.ranged.projectileSpeed,
                        config.ranged.projectileDamage,
                        config.ranged.projectileLifetimeSeconds,
                    );
                }
            }

            const stepDistance = config.moveSpeed * speedScale * dt;
            enemy.x += moveX * stepDistance;
            enemy.y += moveY * stepDistance;
            if (Math.abs(moveX) > 0.001) {
                enemy.facingX = moveX > 0 ? 1 : -1;
            }
        });
    }

    damage(enemy: EnemyModel, damage: number): boolean {
        if (enemy.state !== 'alive' || damage <= 0) {
            return false;
        }
        enemy.hp = Math.max(0, enemy.hp - damage);
        enemy.hitFlashRemaining = ENDLESS_SWORD_CONFIG.combat.hitFlashSeconds;
        if (enemy.hp > 0) {
            return false;
        }

        // 策划案 §99：死亡、得分与掉落的逻辑状态立即确定；0.22s 仅是后续表现。
        enemy.state = 'dying';
        enemy.deathElapsed = 0;
        return true;
    }

    flushRetired(beforeRelease: (enemy: EnemyModel) => void): void {
        for (let index = 0; index < this.retireCount; index += 1) {
            const enemy = this.retireQueue[index];
            beforeRelease(enemy);
            this.pool.release(enemy);
        }
        this.retireCount = 0;
    }

    clear(beforeRelease?: (enemy: EnemyModel) => void): void {
        this.retireCount = 0;
        this.pool.clear(beforeRelease);
    }

    forEachActive(visitor: (enemy: EnemyModel) => void): void {
        this.pool.forEachActive(visitor);
    }

    forEachAlive(visitor: (enemy: EnemyModel) => void): void {
        this.pool.forEachActive((enemy) => {
            if (enemy.state === 'alive') {
                visitor(enemy);
            }
        });
    }

    getByPoolIndex(poolIndex: number): EnemyModel | undefined {
        const enemy = this.pool.getAt(poolIndex);
        return enemy && this.pool.isActive(enemy) ? enemy : undefined;
    }

    get stats(): ObjectPoolStats {
        return this.pool.stats;
    }

    private queueRetirement(enemy: EnemyModel): void {
        if (this.retireCount < this.retireQueue.length) {
            this.retireQueue[this.retireCount] = enemy;
            this.retireCount += 1;
        }
    }
}

function createEnemyModel(poolIndex: number): EnemyModel {
    return {
        poolIndex,
        generation: 0,
        type: 'demon-rat',
        state: 'inactive',
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        facingX: 1,
        hp: 0,
        maxHp: 0,
        attackCooldown: 0,
        strafeSign: 1,
        deathElapsed: 0,
        deathRotation: 0,
        hitFlashRemaining: 0,
    };
}

function resetEnemyModel(enemy: EnemyModel): void {
    enemy.state = 'inactive';
    enemy.hp = 0;
    enemy.maxHp = 0;
    enemy.attackCooldown = 0;
    enemy.deathElapsed = 0;
    enemy.hitFlashRemaining = 0;
}
