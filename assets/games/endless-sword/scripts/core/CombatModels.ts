import type { EnemyType } from '../config/EnemyConfig';

export type EnemyLifeState = 'inactive' | 'alive' | 'dying';
export type ProjectileOwner = 'player' | 'enemy';
export type ProjectileVisual =
    | 'enemy-arrow'
    | 'sword-blue'
    | 'sword-gold'
    | 'sword-silver'
    | 'fireball'
    | 'poison-orb'
    | 'void-orb';

export interface EnemyModel {
    readonly poolIndex: number;
    generation: number;
    type: EnemyType;
    state: EnemyLifeState;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    facingX: number;
    hp: number;
    maxHp: number;
    attackCooldown: number;
    strafeSign: number;
    deathElapsed: number;
    deathRotation: number;
    hitFlashRemaining: number;
}

export interface ProjectileModel {
    readonly poolIndex: number;
    generation: number;
    owner: ProjectileOwner;
    visual: ProjectileVisual;
    /** 产生该投射物的技能 ID；敌方投射物为空字符串。 */
    skillId: string;
    active: boolean;
    expired: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    velocityX: number;
    velocityY: number;
    damage: number;
    width: number;
    height: number;
    remainingHits: number;
    lifetimeRemaining: number;
    /** 大于 0 时，命中首个敌人后改为一次范围结算。 */
    impactRadius: number;
    impactDamage: number;
}

export interface XpOrbModel {
    readonly poolIndex: number;
    generation: number;
    active: boolean;
    x: number;
    y: number;
    value: number;
}
