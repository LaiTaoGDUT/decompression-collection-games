import type { EnemyType } from './EnemyConfig';

/** 普通敌人随局内时间增长的数值倍率（策划案 §54）。 */
export interface EnemyTimeScaling {
    readonly hpMultiplier: number;
    readonly damageMultiplier: number;
    readonly speedMultiplier: number;
}

/** 当前 P0 已实现敌人的刷怪权重。M2 扩展敌人时只需追加配置项。 */
export interface SpawnWeight {
    readonly type: EnemyType;
    readonly weight: number;
}

const SPAWN_RATE_BY_MINUTE: readonly number[] = Object.freeze([
    1.25,
    1.55,
    1.90,
    2.25,
    2.60,
    3.00,
    3.35,
    3.70,
    4.05,
    4.40,
]);

const COMPOSITION_0_TO_1: readonly SpawnWeight[] = Object.freeze([
    { type: 'demon-rat', weight: 100 },
]);

const COMPOSITION_1_TO_2: readonly SpawnWeight[] = Object.freeze([
    { type: 'demon-rat', weight: 75 },
    { type: 'ghost-flame', weight: 25 },
]);

const COMPOSITION_2_TO_3: readonly SpawnWeight[] = Object.freeze([
    { type: 'demon-rat', weight: 55 },
    { type: 'ghost-flame', weight: 25 },
    { type: 'rotting-corpse', weight: 20 },
]);

const COMPOSITION_3_TO_5: readonly SpawnWeight[] = Object.freeze([
    { type: 'demon-rat', weight: 45 },
    { type: 'ghost-flame', weight: 20 },
    { type: 'rotting-corpse', weight: 18 },
    { type: 'crossbow-puppet', weight: 17 },
]);

/**
 * 5 分钟以后先沿用 P0 已交付的四种敌人构成。
 * 其余五种普通敌人属于 M2，接入 EnemyConfig 后再按策划案 §56 替换此段。
 */
const COMPOSITION_P0_LATE: readonly SpawnWeight[] = Object.freeze([
    { type: 'demon-rat', weight: 35 },
    { type: 'ghost-flame', weight: 18 },
    { type: 'rotting-corpse', weight: 17 },
    { type: 'crossbow-puppet', weight: 14 },
]);

export const ENDLESS_SWORD_DIFFICULTY = Object.freeze({
    spawn: Object.freeze({
        /** 策划案 §55：普通敌人固定对象池上限。 */
        maxEnemyCount: 160,
        /** 生成点在可视区域外的缓冲距离。 */
        edgeMargin: 96,
        /** 灾厄修正前后的最终刷怪速率上限（个/秒）。 */
        maxSpawnRate: 14,
    }),
    timeGrowth: Object.freeze({
        hpPerMinute: 0.20,
        hpQuadraticPerMinute: 0.012,
        damagePerMinute: 0.07,
        damageQuadraticPerMinute: 0.0025,
        speedPerMinute: 0.012,
        maxSpeedMultiplier: 1.35,
    }),
});

/** 返回普通敌人时间成长倍率；负时间按 0 秒处理。 */
export function getEnemyTimeScaling(elapsedSeconds: number): EnemyTimeScaling {
    const minute = getElapsedMinute(elapsedSeconds);
    const growth = ENDLESS_SWORD_DIFFICULTY.timeGrowth;
    return {
        hpMultiplier: 1
            + growth.hpPerMinute * minute
            + growth.hpQuadraticPerMinute * minute * minute,
        damageMultiplier: 1
            + growth.damagePerMinute * minute
            + growth.damageQuadraticPerMinute * minute * minute,
        speedMultiplier: Math.min(
            growth.maxSpeedMultiplier,
            1 + growth.speedPerMinute * minute,
        ),
    };
}

/** 返回指定时间的基础刷怪速率（个/秒）。 */
export function getBaseSpawnRate(elapsedSeconds: number): number {
    const minute = getElapsedMinute(elapsedSeconds);
    if (minute < SPAWN_RATE_BY_MINUTE.length) {
        return SPAWN_RATE_BY_MINUTE[minute];
    }
    if (minute < 15) {
        return 4.7 + 0.25 * (minute - 10);
    }
    return Math.min(9, 6 + 0.12 * (minute - 15));
}

/** 返回灾厄修正后的刷怪速率；灾厄系统接入前修正倍率默认为 1。 */
export function getSpawnRate(
    elapsedSeconds: number,
    disasterRateMultiplier = 1,
): number {
    const safeMultiplier = Number.isFinite(disasterRateMultiplier)
        ? Math.max(0, disasterRateMultiplier)
        : 1;
    return Math.min(
        ENDLESS_SWORD_DIFFICULTY.spawn.maxSpawnRate,
        getBaseSpawnRate(elapsedSeconds) * safeMultiplier,
    );
}

/**
 * 返回当前 P0 可生成的敌人构成。权重不要求预先归一化，SpawnSystem 会按总权重抽样。
 */
export function getSpawnWeights(elapsedSeconds: number): readonly SpawnWeight[] {
    const minute = getElapsedMinute(elapsedSeconds);
    if (minute < 1) {
        return COMPOSITION_0_TO_1;
    }
    if (minute < 2) {
        return COMPOSITION_1_TO_2;
    }
    if (minute < 3) {
        return COMPOSITION_2_TO_3;
    }
    if (minute < 5) {
        return COMPOSITION_3_TO_5;
    }
    return COMPOSITION_P0_LATE;
}

function getElapsedMinute(elapsedSeconds: number): number {
    const safeSeconds = Number.isFinite(elapsedSeconds)
        ? Math.max(0, elapsedSeconds)
        : 0;
    return Math.floor(safeSeconds / 60);
}
