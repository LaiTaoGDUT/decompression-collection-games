import { ENDLESS_SWORD_CONFIG, getPlayerWorldHitbox } from '../config/GameConfig';
import { getEnemyConfig } from '../config/EnemyConfig';
import type { EnemyModel, ProjectileModel } from '../core/CombatModels';
import { SpatialHashGrid, type Aabb } from '../core/SpatialHashGrid';
import type { PlayerModel } from '../core/RunModel';
import type { EnemySystem } from './EnemySystem';
import type { ProjectileSystem } from './ProjectileSystem';

export type EnemyKilledHandler = (enemy: EnemyModel) => void;

/** T1.4 逻辑碰撞：空间哈希候选筛选、敌人分离、接触/投射物伤害。 */
export class CollisionSystem {
    private readonly enemyGrid = new SpatialHashGrid<EnemyModel>(
        ENDLESS_SWORD_CONFIG.collision.gridCellSize,
    );
    private readonly candidates: EnemyModel[] = [];
    private readonly enemyBounds: Aabb = createEmptyBounds();
    private readonly otherBounds: Aabb = createEmptyBounds();
    private readonly queryBounds: Aabb = createEmptyBounds();

    step(
        player: PlayerModel,
        enemies: EnemySystem,
        projectiles: ProjectileSystem,
        onEnemyKilled: EnemyKilledHandler,
    ): void {
        this.rebuildEnemyGrid(enemies);
        this.resolveEnemySeparation(enemies);
        this.rebuildEnemyGrid(enemies);
        this.resolveEnemyContact(player);
        this.resolveProjectiles(player, enemies, projectiles, onEnemyKilled);
    }

    damageEnemy(
        enemies: EnemySystem,
        enemy: EnemyModel,
        damage: number,
        onEnemyKilled: EnemyKilledHandler,
    ): boolean {
        const killed = enemies.damage(enemy, damage);
        if (killed) {
            onEnemyKilled(enemy);
        }
        return killed;
    }

    clear(): void {
        this.enemyGrid.clear();
        this.candidates.length = 0;
    }

    get occupiedCellCount(): number {
        return this.enemyGrid.occupiedCellCount;
    }

    private rebuildEnemyGrid(enemies: EnemySystem): void {
        this.enemyGrid.clear();
        enemies.forEachAlive((enemy) => {
            getEnemyWorldHurtbox(enemy, this.enemyBounds);
            this.enemyGrid.insert(enemy, this.enemyBounds);
        });
    }

    private resolveEnemySeparation(enemies: EnemySystem): void {
        enemies.forEachAlive((enemy) => {
            getEnemyWorldHurtbox(enemy, this.enemyBounds);
            this.enemyGrid.query(this.enemyBounds, this.candidates);
            const enemyRadius = Math.min(
                this.enemyBounds.maxX - this.enemyBounds.minX,
                this.enemyBounds.maxY - this.enemyBounds.minY,
            ) * 0.5;

            for (const other of this.candidates) {
                if (other.poolIndex <= enemy.poolIndex || other.state !== 'alive') {
                    continue;
                }
                getEnemyWorldHurtbox(other, this.otherBounds);
                const otherRadius = Math.min(
                    this.otherBounds.maxX - this.otherBounds.minX,
                    this.otherBounds.maxY - this.otherBounds.minY,
                ) * 0.5;
                let dx = other.x - enemy.x;
                let dy = other.y - enemy.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                const targetDistance = enemyRadius + otherRadius;
                if (distance >= targetDistance) {
                    continue;
                }
                if (distance <= 0.0001) {
                    dx = enemy.poolIndex % 2 === 0 ? 1 : -1;
                    dy = 0;
                    distance = 1;
                }
                const correction = (targetDistance - distance)
                    * ENDLESS_SWORD_CONFIG.collision.enemySeparationStrength
                    * 0.5;
                const nx = dx / distance;
                const ny = dy / distance;
                enemy.x -= nx * correction;
                enemy.y -= ny * correction;
                other.x += nx * correction;
                other.y += ny * correction;
            }
        });
    }

    private resolveEnemyContact(player: PlayerModel): void {
        getPlayerWorldBounds(player, this.queryBounds);
        this.enemyGrid.query(this.queryBounds, this.candidates);
        for (const enemy of this.candidates) {
            if (enemy.state !== 'alive') {
                continue;
            }
            getEnemyWorldHurtbox(enemy, this.enemyBounds);
            if (!aabbOverlaps(this.queryBounds, this.enemyBounds)) {
                continue;
            }
            if (this.damagePlayer(player, getEnemyConfig(enemy.type).contactDamage)) {
                return;
            }
        }
    }

    private resolveProjectiles(
        player: PlayerModel,
        enemies: EnemySystem,
        projectiles: ProjectileSystem,
        onEnemyKilled: EnemyKilledHandler,
    ): void {
        getPlayerWorldBounds(player, this.queryBounds);
        projectiles.forEachActive((projectile) => {
            if (projectile.expired) {
                return;
            }
            getProjectileBounds(projectile, this.otherBounds);
            if (projectile.owner === 'enemy') {
                if (aabbOverlaps(this.queryBounds, this.otherBounds)) {
                    this.damagePlayer(player, projectile.damage);
                    projectiles.consumeHit(projectile);
                }
                return;
            }

            this.enemyGrid.query(this.otherBounds, this.candidates);
            for (const enemy of this.candidates) {
                if (enemy.state !== 'alive') {
                    continue;
                }
                getEnemyWorldHurtbox(enemy, this.enemyBounds);
                if (!aabbOverlaps(this.otherBounds, this.enemyBounds)) {
                    continue;
                }
                this.damageEnemy(enemies, enemy, projectile.damage, onEnemyKilled);
                projectiles.consumeHit(projectile);
                if (projectile.expired) {
                    break;
                }
            }
        });
    }

    private damagePlayer(
        player: PlayerModel,
        damage: number,
    ): boolean {
        if (player.invincibilityRemaining > 0 || player.hp <= 0) {
            return false;
        }
        player.hp = Math.max(0, player.hp - damage);
        player.invincibilityRemaining = ENDLESS_SWORD_CONFIG.player.hurtInvincibleSeconds;
        return true;
    }
}

/** 将源图 hurtbox（左上原点）转换为世界坐标 AABB，并同步水平翻转偏移。 */
export function getEnemyWorldHurtbox(enemy: EnemyModel, output: Aabb): Aabb {
    const sprite = getEnemyConfig(enemy.type).sprite;
    const scale = sprite.displayScale;
    const source = sprite.hurtbox;
    const sourceCenterX = source.x + source.width * 0.5 - sprite.frameWidth * 0.5;
    const sourceCenterY = sprite.frameHeight * 0.5 - (source.y + source.height * 0.5);
    const centerX = enemy.x + sourceCenterX * scale * (enemy.facingX < 0 ? -1 : 1);
    const centerY = enemy.y + sourceCenterY * scale;
    const halfWidth = source.width * scale * 0.5;
    const halfHeight = source.height * scale * 0.5;
    output.minX = centerX - halfWidth;
    output.maxX = centerX + halfWidth;
    output.minY = centerY - halfHeight;
    output.maxY = centerY + halfHeight;
    return output;
}

export function getPlayerWorldBounds(player: PlayerModel, output: Aabb): Aabb {
    const size = getPlayerWorldHitbox();
    output.minX = player.x - size.width * 0.5;
    output.maxX = player.x + size.width * 0.5;
    output.minY = player.y - size.height * 0.5;
    output.maxY = player.y + size.height * 0.5;
    return output;
}

function getProjectileBounds(projectile: ProjectileModel, output: Aabb): Aabb {
    output.minX = projectile.x - projectile.width * 0.5;
    output.maxX = projectile.x + projectile.width * 0.5;
    output.minY = projectile.y - projectile.height * 0.5;
    output.maxY = projectile.y + projectile.height * 0.5;
    return output;
}

function aabbOverlaps(a: Readonly<Aabb>, b: Readonly<Aabb>): boolean {
    return a.minX <= b.maxX
        && a.maxX >= b.minX
        && a.minY <= b.maxY
        && a.maxY >= b.minY;
}

function createEmptyBounds(): Aabb {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
