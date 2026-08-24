import type { ProjectileVisual } from '../core/CombatModels';

/** M1 P0 当前接入的四个主动技能；后续技能按同一数据结构追加。 */
export const ACTIVE_SKILL_IDS = [
    'fly-sword',
    'sword-array',
    'thunder-talisman',
    'fire-art',
] as const;

export type ActiveSkillId = typeof ACTIVE_SKILL_IDS[number];

export type SkillVfxId =
    | 'hit-spark'
    | 'sword-slash'
    | 'lightning'
    | 'fire-explode'
    | 'fire-field';

export interface SkillLevelConfig {
    readonly damage: number;
    readonly cooldownSeconds: number;
    readonly quantity: number;
    readonly range: number;
    readonly projectileSpeed?: number;
    readonly projectileWidth?: number;
    readonly projectileHeight?: number;
    readonly penetration?: number;
    readonly orbitRadius?: number;
    readonly orbitHitIntervalSeconds?: number;
    readonly explosionRadius?: number;
    readonly burnDamagePerTick?: number;
    readonly fireFieldDurationSeconds?: number;
    readonly chainCount?: number;
    readonly chainDamageRatio?: number;
}

export interface ActiveSkillDefinition {
    readonly id: ActiveSkillId;
    readonly displayName: string;
    readonly mode: 'projectile' | 'orbit' | 'strike' | 'fireball';
    readonly iconRect: Readonly<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }>;
    readonly projectileVisual?: ProjectileVisual;
    readonly impactVfx?: SkillVfxId;
    readonly levels: readonly SkillLevelConfig[];
}

const level = (
    damage: number,
    cooldownSeconds: number,
    quantity: number,
    range: number,
    extra: Omit<SkillLevelConfig, 'damage' | 'cooldownSeconds' | 'quantity' | 'range'> = {},
): SkillLevelConfig => Object.freeze({
    damage,
    cooldownSeconds,
    quantity,
    range,
    ...extra,
});

/**
 * P0 技能完整保留 Lv1～Lv5 数值，T1.7 升级系统只消费这里的配置，
 * 不在 SkillSystem 内复制伤害、CD 或数量等魔法数。
 */
export const ACTIVE_SKILL_CONFIGS: Readonly<Record<ActiveSkillId, ActiveSkillDefinition>> = Object.freeze({
    'fly-sword': Object.freeze({
        id: 'fly-sword',
        displayName: '飞剑',
        mode: 'projectile',
        iconRect: Object.freeze({ x: 0, y: 0, width: 256, height: 256 }),
        projectileVisual: 'sword-blue',
        impactVfx: 'hit-spark',
        levels: Object.freeze([
            level(24, 0.72, 1, 900, {
                projectileSpeed: 900,
                projectileWidth: 88,
                projectileHeight: 34,
                penetration: 0,
            }),
            level(31, 0.72, 1, 900, {
                projectileSpeed: 900,
                projectileWidth: 88,
                projectileHeight: 34,
                penetration: 0,
            }),
            level(31, 0.72, 2, 900, {
                projectileSpeed: 900,
                projectileWidth: 88,
                projectileHeight: 34,
                penetration: 0,
            }),
            level(31, 0.58, 2, 900, {
                projectileSpeed: 900,
                projectileWidth: 88,
                projectileHeight: 34,
                penetration: 0,
            }),
            level(43, 0.58, 2, 900, {
                projectileSpeed: 900,
                projectileWidth: 88,
                projectileHeight: 34,
                penetration: 1,
            }),
        ]),
    }),
    'sword-array': Object.freeze({
        id: 'sword-array',
        displayName: '周天剑阵',
        mode: 'orbit',
        iconRect: Object.freeze({ x: 256, y: 0, width: 256, height: 256 }),
        projectileVisual: 'sword-blue',
        impactVfx: 'sword-slash',
        levels: Object.freeze([
            level(14, 0, 2, 180, {
                orbitRadius: 130,
                orbitHitIntervalSeconds: 0.55,
                projectileWidth: 76,
                projectileHeight: 28,
            }),
            level(19, 0, 2, 180, {
                orbitRadius: 130,
                orbitHitIntervalSeconds: 0.55,
                projectileWidth: 76,
                projectileHeight: 28,
            }),
            level(19, 0, 3, 180, {
                orbitRadius: 130,
                orbitHitIntervalSeconds: 0.55,
                projectileWidth: 76,
                projectileHeight: 28,
            }),
            level(19, 0, 3, 205, {
                orbitRadius: 155,
                orbitHitIntervalSeconds: 0.45,
                projectileWidth: 76,
                projectileHeight: 28,
            }),
            level(25, 0, 4, 205, {
                orbitRadius: 155,
                orbitHitIntervalSeconds: 0.45,
                projectileWidth: 76,
                projectileHeight: 28,
            }),
        ]),
    }),
    'thunder-talisman': Object.freeze({
        id: 'thunder-talisman',
        displayName: '天雷符',
        mode: 'strike',
        iconRect: Object.freeze({ x: 512, y: 0, width: 256, height: 256 }),
        impactVfx: 'lightning',
        levels: Object.freeze([
            level(32, 1.4, 1, 720, { chainCount: 0, chainDamageRatio: 0.65 }),
            level(32, 1.4, 2, 720, { chainCount: 0, chainDamageRatio: 0.65 }),
            level(44, 1.4, 2, 720, { chainCount: 0, chainDamageRatio: 0.65 }),
            level(44, 1.4, 3, 720, { chainCount: 1, chainDamageRatio: 0.65 }),
            level(55, 1.1, 3, 720, { chainCount: 1, chainDamageRatio: 0.65 }),
        ]),
    }),
    'fire-art': Object.freeze({
        id: 'fire-art',
        displayName: '离火诀',
        mode: 'fireball',
        iconRect: Object.freeze({ x: 768, y: 0, width: 256, height: 256 }),
        projectileVisual: 'fireball',
        impactVfx: 'fire-explode',
        levels: Object.freeze([
            level(18, 1.2, 1, 720, {
                projectileSpeed: 520,
                projectileWidth: 54,
                projectileHeight: 54,
                explosionRadius: 90,
                burnDamagePerTick: 6,
                fireFieldDurationSeconds: 0,
            }),
            level(18, 1.2, 1, 720, {
                projectileSpeed: 520,
                projectileWidth: 54,
                projectileHeight: 54,
                explosionRadius: 110,
                burnDamagePerTick: 6,
                fireFieldDurationSeconds: 0,
            }),
            level(26, 1.2, 1, 720, {
                projectileSpeed: 520,
                projectileWidth: 54,
                projectileHeight: 54,
                explosionRadius: 110,
                burnDamagePerTick: 8,
                fireFieldDurationSeconds: 0,
            }),
            level(26, 1.2, 1, 720, {
                projectileSpeed: 520,
                projectileWidth: 54,
                projectileHeight: 54,
                explosionRadius: 110,
                burnDamagePerTick: 8,
                fireFieldDurationSeconds: 3,
            }),
            level(34, 0.9, 1, 720, {
                projectileSpeed: 520,
                projectileWidth: 54,
                projectileHeight: 54,
                explosionRadius: 110,
                burnDamagePerTick: 10,
                fireFieldDurationSeconds: 3,
            }),
        ]),
    }),
});

export function getActiveSkillConfig(id: ActiveSkillId): ActiveSkillDefinition {
    return ACTIVE_SKILL_CONFIGS[id];
}

export function getSkillLevelConfig(
    id: ActiveSkillId,
    levelNumber: number,
): SkillLevelConfig {
    const definition = getActiveSkillConfig(id);
    const index = Math.max(1, Math.min(definition.levels.length, Math.floor(levelNumber))) - 1;
    return definition.levels[index];
}

export function isActiveSkillId(value: unknown): value is ActiveSkillId {
    return typeof value === 'string'
        && (ACTIVE_SKILL_IDS as readonly string[]).indexOf(value) >= 0;
}
