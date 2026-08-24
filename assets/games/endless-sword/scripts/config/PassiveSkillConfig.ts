/**
 * P0 心法配置（策划案 §16、§122）。心法和主动技能共用升级三选一，
 * 但不占用右侧常驻技能栏；所有数值集中在这里，运行时只读取配置。
 */
export const PASSIVE_SKILL_IDS = [
    'sword-heart',
    'wind-control',
    'spirit-sense',
    'domain',
] as const;

export type PassiveSkillId = typeof PASSIVE_SKILL_IDS[number];

export interface PassiveLevelConfig {
    readonly damageMultiplier: number;
    readonly moveSpeedMultiplier: number;
    readonly haste: number;
    readonly critChance: number;
    readonly critDamage: number;
    readonly rangeMultiplier: number;
}

export interface PassiveSkillDefinition {
    readonly id: PassiveSkillId;
    readonly displayName: string;
    readonly iconRect: Readonly<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }>;
    readonly levels: readonly PassiveLevelConfig[];
}

const passiveLevel = (
    damageMultiplier: number,
    moveSpeedMultiplier: number,
    haste: number,
    critChance: number,
    critDamage: number,
    rangeMultiplier: number,
): PassiveLevelConfig => Object.freeze({
    damageMultiplier,
    moveSpeedMultiplier,
    haste,
    critChance,
    critDamage,
    rangeMultiplier,
});

const fiveLevels = (
    perLevel: (
        level: number,
    ) => Omit<PassiveLevelConfig, 'damageMultiplier' | 'moveSpeedMultiplier' | 'haste' | 'critChance' | 'critDamage' | 'rangeMultiplier'> & Partial<PassiveLevelConfig>,
): readonly PassiveLevelConfig[] => Object.freeze(
    [1, 2, 3, 4, 5].map((level) => {
        const value = perLevel(level);
        return passiveLevel(
            value.damageMultiplier ?? 1,
            value.moveSpeedMultiplier ?? 1,
            value.haste ?? 0,
            value.critChance ?? 0,
            value.critDamage ?? 0,
            value.rangeMultiplier ?? 1,
        );
    }),
);

export const PASSIVE_SKILL_CONFIGS: Readonly<Record<PassiveSkillId, PassiveSkillDefinition>> = Object.freeze({
    'sword-heart': Object.freeze({
        id: 'sword-heart',
        displayName: '剑心诀',
        iconRect: Object.freeze({ x: 0, y: 0, width: 256, height: 256 }),
        levels: fiveLevels((level) => ({
            damageMultiplier: 1 + level * 0.08,
        })),
    }),
    'wind-control': Object.freeze({
        id: 'wind-control',
        displayName: '御风诀',
        iconRect: Object.freeze({ x: 256, y: 0, width: 256, height: 256 }),
        levels: fiveLevels((level) => ({
            moveSpeedMultiplier: 1 + level * 0.03,
            haste: level * 10,
        })),
    }),
    'spirit-sense': Object.freeze({
        id: 'spirit-sense',
        displayName: '灵识诀',
        iconRect: Object.freeze({ x: 512, y: 0, width: 256, height: 256 }),
        levels: fiveLevels((level) => ({
            critChance: level * 0.04,
            critDamage: level * 0.10,
        })),
    }),
    domain: Object.freeze({
        id: 'domain',
        displayName: '法域诀',
        iconRect: Object.freeze({ x: 768, y: 0, width: 256, height: 256 }),
        levels: fiveLevels((level) => ({
            rangeMultiplier: 1 + level * 0.08,
        })),
    }),
});

export function getPassiveSkillConfig(id: PassiveSkillId): PassiveSkillDefinition {
    return PASSIVE_SKILL_CONFIGS[id];
}

export function getPassiveLevelConfig(
    id: PassiveSkillId,
    levelNumber: number,
): PassiveLevelConfig {
    const definition = getPassiveSkillConfig(id);
    const index = Math.max(1, Math.min(definition.levels.length, Math.floor(levelNumber))) - 1;
    return definition.levels[index];
}

export function isPassiveSkillId(value: unknown): value is PassiveSkillId {
    return typeof value === 'string'
        && (PASSIVE_SKILL_IDS as readonly string[]).indexOf(value) >= 0;
}
