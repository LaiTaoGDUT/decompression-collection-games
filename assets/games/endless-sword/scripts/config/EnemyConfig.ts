/** T1.5 首批普通敌人。后续敌人继续在本文件注册，系统不写类型分支数值。 */
export const ENEMY_TYPES = [
    'demon-rat',
    'ghost-flame',
    'rotting-corpse',
    'crossbow-puppet',
] as const;

export type EnemyType = typeof ENEMY_TYPES[number];

export interface EnemySpriteConfig {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly frameCount: number;
    readonly displayScale: number;
    readonly framesPerSecond: number;
    /** hurtbox 使用源图单帧左上角坐标系。 */
    readonly hurtbox: Readonly<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export interface EnemyConfig {
    readonly type: EnemyType;
    readonly displayName: string;
    readonly maxHp: number;
    readonly moveSpeed: number;
    readonly contactDamage: number;
    readonly xp: number;
    readonly score: number;
    readonly ai: 'chase' | 'crossbow';
    readonly sprite: EnemySpriteConfig;
    readonly ranged?: Readonly<{
        preferredMinDistance: number;
        preferredMaxDistance: number;
        attackIntervalSeconds: number;
        projectileSpeed: number;
        projectileDamage: number;
        projectileLifetimeSeconds: number;
    }>;
}

const FOUR_FRAMES = 4;
const ANIMATION_FPS = 6;

/** 策划案 §42/§43；帧与 hurtbox 来自 art_sources 文件名。 */
export const ENEMY_CONFIGS: Readonly<Record<EnemyType, EnemyConfig>> = Object.freeze({
    'demon-rat': Object.freeze({
        type: 'demon-rat',
        displayName: '妖鼠',
        maxHp: 28,
        moveSpeed: 115,
        contactDamage: 8,
        xp: 3,
        score: 10,
        ai: 'chase',
        sprite: Object.freeze({
            frameWidth: 256,
            frameHeight: 171,
            frameCount: FOUR_FRAMES,
            displayScale: 0.34,
            framesPerSecond: ANIMATION_FPS,
            hurtbox: Object.freeze({ x: 71, y: 47, width: 163, height: 88 }),
        }),
    }),
    'ghost-flame': Object.freeze({
        type: 'ghost-flame',
        displayName: '鬼火',
        maxHp: 20,
        moveSpeed: 175,
        contactDamage: 7,
        xp: 3,
        score: 12,
        ai: 'chase',
        sprite: Object.freeze({
            frameWidth: 256,
            frameHeight: 256,
            frameCount: FOUR_FRAMES,
            displayScale: 0.30,
            framesPerSecond: ANIMATION_FPS,
            hurtbox: Object.freeze({ x: 79, y: 109, width: 96, height: 80 }),
        }),
    }),
    'rotting-corpse': Object.freeze({
        type: 'rotting-corpse',
        displayName: '腐尸',
        maxHp: 80,
        moveSpeed: 72,
        contactDamage: 13,
        xp: 6,
        score: 22,
        ai: 'chase',
        sprite: Object.freeze({
            frameWidth: 256,
            frameHeight: 256,
            frameCount: FOUR_FRAMES,
            displayScale: 0.34,
            framesPerSecond: ANIMATION_FPS,
            hurtbox: Object.freeze({ x: 78, y: 61, width: 87, height: 154 }),
        }),
    }),
    'crossbow-puppet': Object.freeze({
        type: 'crossbow-puppet',
        displayName: '魔弩傀儡',
        maxHp: 55,
        moveSpeed: 75,
        contactDamage: 10,
        xp: 6,
        score: 28,
        ai: 'crossbow',
        sprite: Object.freeze({
            frameWidth: 256,
            frameHeight: 256,
            frameCount: FOUR_FRAMES,
            displayScale: 0.34,
            framesPerSecond: ANIMATION_FPS,
            hurtbox: Object.freeze({ x: 95, y: 54, width: 73, height: 135 }),
        }),
        ranged: Object.freeze({
            preferredMinDistance: 280,
            preferredMaxDistance: 360,
            attackIntervalSeconds: 2.4,
            projectileSpeed: 220,
            projectileDamage: 12,
            projectileLifetimeSeconds: 5,
        }),
    }),
});

export function getEnemyConfig(type: EnemyType): EnemyConfig {
    return ENEMY_CONFIGS[type];
}
