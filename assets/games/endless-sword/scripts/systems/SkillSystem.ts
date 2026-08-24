import {
    ACTIVE_SKILL_IDS,
    getActiveSkillConfig,
    getSkillLevelConfig,
    type ActiveSkillId,
    type SkillVfxId,
} from '../config/SkillConfig';
import type { EnemyModel, ProjectileModel } from '../core/CombatModels';
import type { PlayerModel } from '../core/RunModel';
import type { CollisionSystem } from './CollisionSystem';
import type { EnemySystem } from './EnemySystem';
import type { ProjectileSystem } from './ProjectileSystem';

export interface SkillEffectEvent {
    readonly vfx: SkillVfxId;
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly durationSeconds: number;
    readonly angle?: number;
}

export interface OrbitBladeState {
    readonly active: boolean;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly width: number;
    readonly height: number;
}

export type SkillEffectHandler = (event: SkillEffectEvent) => void;

export interface SkillRuntimeModifiers {
    readonly damageMultiplier?: number;
    readonly cooldownMultiplier?: number;
    readonly rangeMultiplier?: number;
    readonly projectileSpeedMultiplier?: number;
}

/**
 * P0 主动技能执行器。只读写逻辑模型和系统，不持有 Cocos 节点。
 * 投射物技能走 ProjectileSystem，范围/环绕技能在这里请求 CollisionSystem 结算。
 */
export class SkillSystem {
    private readonly levels = new Map<ActiveSkillId, number>();
    private readonly cooldowns = new Map<ActiveSkillId, number>();
    private readonly orbitHitCooldowns = new Map<string, number>();
    private readonly orbitBlades: OrbitBladeState[] = [];
    private readonly targetBuffer: EnemyModel[] = [];
    private orbitAngle = 0;

    constructor() {
        for (const id of ACTIVE_SKILL_IDS) {
            this.levels.set(id, 0);
            this.cooldowns.set(id, 0);
        }
        for (let index = 0; index < 4; index += 1) {
            this.orbitBlades.push({
                active: false,
                x: 0,
                y: 0,
                angle: 0,
                width: 76,
                height: 28,
            });
        }
        this.reset();
    }

    /** 初始只拥有策划案规定的飞剑；其余技能由 T1.7 升级系统或 QA 命令授予。 */
    reset(): void {
        for (const id of ACTIVE_SKILL_IDS) {
            this.levels.set(id, 0);
            this.cooldowns.set(id, 0);
        }
        this.levels.set('fly-sword', 1);
        this.orbitHitCooldowns.clear();
        this.orbitAngle = 0;
        this.resetOrbitBlades();
    }

    clear(): void {
        this.orbitHitCooldowns.clear();
        this.resetOrbitBlades();
    }

    setSkillLevel(id: ActiveSkillId, level: number): void {
        const normalized = Number.isFinite(level)
            ? Math.max(0, Math.min(5, Math.floor(level)))
            : 0;
        this.levels.set(id, normalized);
        if (normalized <= 0 && id === 'sword-array') {
            this.resetOrbitBlades();
        }
    }

    getSkillLevel(id: ActiveSkillId): number {
        return this.levels.get(id) ?? 0;
    }

    getActiveSkillIds(): ActiveSkillId[] {
        const result: ActiveSkillId[] = [];
        for (const id of ACTIVE_SKILL_IDS) {
            if (this.getSkillLevel(id) > 0) {
                result.push(id);
            }
        }
        return result;
    }

    getOrbitBlades(): readonly OrbitBladeState[] {
        return this.orbitBlades;
    }

    step(
        dt: number,
        player: PlayerModel,
        enemies: EnemySystem,
        projectiles: ProjectileSystem,
        collision: CollisionSystem,
        onEnemyKilled: (enemy: EnemyModel) => void,
        emitEffect: SkillEffectHandler,
        modifiers: SkillRuntimeModifiers = {},
    ): void {
        this.tickCooldowns(dt);
        this.tickOrbitHitCooldowns(dt);

        const orbitLevel = this.getSkillLevel('sword-array');
        if (orbitLevel > 0) {
            this.updateOrbit(dt, player, orbitLevel);
            this.damageWithOrbit(
                player,
                enemies,
                collision,
                onEnemyKilled,
                emitEffect,
                orbitLevel,
                modifiers,
            );
        } else {
            this.resetOrbitBlades();
        }

        for (const id of ACTIVE_SKILL_IDS) {
            if (id === 'sword-array' || this.getSkillLevel(id) <= 0) {
                continue;
            }
            const cooldown = this.cooldowns.get(id) ?? 0;
            if (cooldown > 0) {
                continue;
            }
            const didFire = this.fireSkill(
                id,
                player,
                enemies,
                projectiles,
                collision,
                onEnemyKilled,
                emitEffect,
                modifiers,
            );
            if (didFire) {
                const config = getSkillLevelConfig(id, this.getSkillLevel(id));
                this.cooldowns.set(
                    id,
                    config.cooldownSeconds * (modifiers.cooldownMultiplier ?? 1),
                );
            }
        }
    }

    private fireSkill(
        id: ActiveSkillId,
        player: PlayerModel,
        enemies: EnemySystem,
        projectiles: ProjectileSystem,
        collision: CollisionSystem,
        onEnemyKilled: (enemy: EnemyModel) => void,
        emitEffect: SkillEffectHandler,
        modifiers: SkillRuntimeModifiers,
    ): boolean {
        const definition = getActiveSkillConfig(id);
        const config = getSkillLevelConfig(id, this.getSkillLevel(id));
        if (definition.mode === 'strike') {
            return this.fireThunder(
                player,
                enemies,
                collision,
                onEnemyKilled,
                emitEffect,
                config,
                modifiers,
            );
        }

        const range = config.range * (modifiers.rangeMultiplier ?? 1);
        const projectileSpeedMultiplier = modifiers.projectileSpeedMultiplier ?? 1;
        const damageMultiplier = modifiers.damageMultiplier ?? 1;
        const target = this.findNearestEnemy(enemies, player.x, player.y, range);
        if (!target) {
            return false;
        }
        const direction = normalize(target.x - player.x, target.y - player.y);
        if (definition.mode === 'fireball') {
            const projectile = projectiles.spawn(
                'player',
                player.x,
                player.y,
                direction.x,
                direction.y,
                (config.projectileSpeed ?? 520) * projectileSpeedMultiplier,
                0,
                range / ((config.projectileSpeed ?? 520) * projectileSpeedMultiplier),
                config.projectileWidth ?? 54,
                config.projectileHeight ?? 54,
                1,
                {
                    visual: definition.projectileVisual,
                    skillId: id,
                    impactRadius: config.explosionRadius ?? 0,
                    impactDamage: config.damage * damageMultiplier,
                },
            );
            return Boolean(projectile);
        }

        let spawned = 0;
        const perpendicularX = -direction.y;
        const perpendicularY = direction.x;
        const center = (config.quantity - 1) * 0.5;
        for (let index = 0; index < config.quantity; index += 1) {
            const offset = (index - center) * 18;
            const projectile = projectiles.spawn(
                'player',
                player.x + perpendicularX * offset,
                player.y + perpendicularY * offset,
                direction.x,
                direction.y,
                (config.projectileSpeed ?? 900) * projectileSpeedMultiplier,
                config.damage * damageMultiplier,
                range / ((config.projectileSpeed ?? 900) * projectileSpeedMultiplier),
                config.projectileWidth ?? 88,
                config.projectileHeight ?? 34,
                1 + (config.penetration ?? 0),
                {
                    visual: definition.projectileVisual,
                    skillId: id,
                },
            );
            if (projectile) {
                spawned += 1;
            }
        }
        return spawned > 0;
    }

    private fireThunder(
        player: PlayerModel,
        enemies: EnemySystem,
        collision: CollisionSystem,
        onEnemyKilled: (enemy: EnemyModel) => void,
        emitEffect: SkillEffectHandler,
        config: ReturnType<typeof getSkillLevelConfig>,
        modifiers: SkillRuntimeModifiers,
    ): boolean {
        this.collectNearestEnemies(
            enemies,
            player.x,
            player.y,
            config.range * (modifiers.rangeMultiplier ?? 1),
        );
        if (this.targetBuffer.length === 0) {
            return false;
        }
        const count = Math.min(config.quantity, this.targetBuffer.length);
        for (let index = 0; index < count; index += 1) {
            const target = this.targetBuffer[index];
            collision.damageEnemy(
                enemies,
                target,
                config.damage * (modifiers.damageMultiplier ?? 1),
                onEnemyKilled,
            );
            emitEffect({
                vfx: 'lightning',
                x: target.x,
                y: target.y,
                scale: 0.9,
                durationSeconds: 0.24,
            });
        }
        return true;
    }

    private updateOrbit(playerDt: number, player: PlayerModel, level: number): void {
        const config = getSkillLevelConfig('sword-array', level);
        this.orbitAngle += playerDt * 2.2;
        const quantity = Math.min(this.orbitBlades.length, config.quantity);
        for (let index = 0; index < this.orbitBlades.length; index += 1) {
            if (index >= quantity) {
                this.orbitBlades[index] = {
                    ...this.orbitBlades[index],
                    active: false,
                };
                continue;
            }
            const angle = this.orbitAngle + index * Math.PI * 2 / quantity;
            this.orbitBlades[index] = {
                active: true,
                x: player.x + Math.cos(angle) * (config.orbitRadius ?? 130),
                y: player.y + Math.sin(angle) * (config.orbitRadius ?? 130),
                angle: angle * 180 / Math.PI + 90,
                width: config.projectileWidth ?? 76,
                height: config.projectileHeight ?? 28,
            };
        }
    }

    private damageWithOrbit(
        player: PlayerModel,
        enemies: EnemySystem,
        collision: CollisionSystem,
        onEnemyKilled: (enemy: EnemyModel) => void,
        emitEffect: SkillEffectHandler,
        level: number,
        modifiers: SkillRuntimeModifiers,
    ): void {
        const config = getSkillLevelConfig('sword-array', level);
        const rangeMultiplier = modifiers.rangeMultiplier ?? 1;
        const hitRadius = Math.max(28, (config.projectileWidth ?? 76) * 0.42 * rangeMultiplier);
        const damage = config.damage * (modifiers.damageMultiplier ?? 1);
        const hitRadiusSquared = hitRadius * hitRadius;
        for (const blade of this.orbitBlades) {
            if (!blade.active) {
                continue;
            }
            enemies.forEachAlive((enemy) => {
                const dx = enemy.x - blade.x;
                const dy = enemy.y - blade.y;
                if (dx * dx + dy * dy > hitRadiusSquared) {
                    return;
                }
                const key = `${enemy.poolIndex}:${enemy.generation}`;
                if ((this.orbitHitCooldowns.get(key) ?? 0) > 0) {
                    return;
                }
                this.orbitHitCooldowns.set(
                    key,
                    config.orbitHitIntervalSeconds ?? 0.55,
                );
                collision.damageEnemy(enemies, enemy, damage, onEnemyKilled);
                emitEffect({
                    vfx: 'sword-slash',
                    x: blade.x,
                    y: blade.y,
                    scale: 0.42,
                    durationSeconds: 0.12,
                    angle: blade.angle,
                });
            });
        }
        // 保持参数显式使用，避免未来加入“离身剑阵”时误把玩家位置当作中心。
        void player;
    }

    private findNearestEnemy(
        enemies: EnemySystem,
        x: number,
        y: number,
        range: number,
    ): EnemyModel | undefined {
        let nearest: EnemyModel | undefined;
        let nearestDistanceSquared = range * range;
        enemies.forEachAlive((enemy) => {
            const dx = enemy.x - x;
            const dy = enemy.y - y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= nearestDistanceSquared) {
                nearestDistanceSquared = distanceSquared;
                nearest = enemy;
            }
        });
        return nearest;
    }

    private collectNearestEnemies(
        enemies: EnemySystem,
        x: number,
        y: number,
        range: number,
    ): void {
        this.targetBuffer.length = 0;
        enemies.forEachAlive((enemy) => {
            const dx = enemy.x - x;
            const dy = enemy.y - y;
            if (dx * dx + dy * dy <= range * range) {
                this.targetBuffer.push(enemy);
            }
        });
        this.targetBuffer.sort((left, right) => {
            const leftDistance = (left.x - x) ** 2 + (left.y - y) ** 2;
            const rightDistance = (right.x - x) ** 2 + (right.y - y) ** 2;
            return leftDistance - rightDistance;
        });
    }

    private tickCooldowns(dt: number): void {
        for (const [id, remaining] of this.cooldowns) {
            this.cooldowns.set(id, Math.max(0, remaining - dt));
        }
    }

    private tickOrbitHitCooldowns(dt: number): void {
        for (const [key, remaining] of this.orbitHitCooldowns) {
            const next = remaining - dt;
            if (next <= 0) {
                this.orbitHitCooldowns.delete(key);
            } else {
                this.orbitHitCooldowns.set(key, next);
            }
        }
    }

    private resetOrbitBlades(): void {
        for (let index = 0; index < this.orbitBlades.length; index += 1) {
            this.orbitBlades[index] = {
                ...this.orbitBlades[index],
                active: false,
            };
        }
    }
}

function normalize(x: number, y: number): { x: number; y: number } {
    const length = Math.sqrt(x * x + y * y);
    if (length <= 0.0001) {
        return { x: 1, y: 0 };
    }
    return { x: x / length, y: y / length };
}
