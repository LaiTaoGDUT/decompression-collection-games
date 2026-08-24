import type { EnemyType } from '../config/EnemyConfig';

export type EnemyLifeState = 'inactive' | 'alive' | 'dying';
export type ProjectileOwner = 'player' | 'enemy';

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
}

export interface XpOrbModel {
    readonly poolIndex: number;
    generation: number;
    active: boolean;
    x: number;
    y: number;
    value: number;
}
