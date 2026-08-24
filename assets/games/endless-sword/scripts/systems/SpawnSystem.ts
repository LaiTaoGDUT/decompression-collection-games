import {
    ENDLESS_SWORD_DIFFICULTY,
    getEnemyTimeScaling,
    getSpawnRate,
    getSpawnWeights,
    type SpawnWeight,
} from '../config/DifficultyConfig';
import { SeededRandom } from '../core/SeededRandom';
import { EnemySystem } from './EnemySystem';

export interface SpawnVisibleSize {
    readonly width: number;
    readonly height: number;
}

export interface SpawnSystemStats {
    readonly spawnRate: number;
    readonly pendingFraction: number;
    readonly lastSpawned: number;
    readonly totalSpawned: number;
}

/**
 * 数据驱动的普通敌人刷怪导演（策划案 §55/§56）。
 * 只持有随机序列与生成计时，不持有 Cocos 节点；敌人仍由 EnemySystem 固定池管理。
 */
export class SpawnSystem {
    private random = new SeededRandom(1);
    private pendingFraction = 0;
    private lastSpawnRate = 0;
    private lastSpawnedCount = 0;
    private totalSpawnedCount = 0;

    reset(seed: number): void {
        this.random = new SeededRandom((seed ^ 0x4f1bbcdc) >>> 0);
        this.pendingFraction = 0;
        this.lastSpawnRate = 0;
        this.lastSpawnedCount = 0;
        this.totalSpawnedCount = 0;
    }

    /**
     * 按固定逻辑步累加生成预算。达到对象池上限时直接清空欠账，避免回落后瞬间补刷。
     */
    step(
        dt: number,
        elapsedSeconds: number,
        playerX: number,
        playerY: number,
        visibleSize: SpawnVisibleSize,
        enemies: EnemySystem,
    ): number {
        this.lastSpawnedCount = 0;
        if (!Number.isFinite(dt) || dt <= 0) {
            this.lastSpawnRate = getSpawnRate(elapsedSeconds);
            return 0;
        }

        this.lastSpawnRate = getSpawnRate(elapsedSeconds);
        if (enemies.stats.active >= ENDLESS_SWORD_DIFFICULTY.spawn.maxEnemyCount) {
            this.pendingFraction = 0;
            return 0;
        }

        this.pendingFraction += dt * this.lastSpawnRate;
        const spawnCount = Math.floor(this.pendingFraction);
        if (spawnCount <= 0) {
            return 0;
        }
        this.pendingFraction -= spawnCount;

        const weights = getSpawnWeights(elapsedSeconds);
        for (let index = 0; index < spawnCount; index += 1) {
            if (enemies.stats.active >= ENDLESS_SWORD_DIFFICULTY.spawn.maxEnemyCount) {
                // §55：上限期间不保留剩余预算。
                this.pendingFraction = 0;
                break;
            }
            const type = this.pickType(weights);
            const point = this.pickSpawnPoint(playerX, playerY, visibleSize);
            const enemy = enemies.spawn(
                type,
                point.x,
                point.y,
                getEnemyTimeScaling(elapsedSeconds),
            );
            if (!enemy) {
                // 固定池借不到时同样丢弃本次欠账，不允许池恢复后突然补刷。
                this.pendingFraction = 0;
                break;
            }
            this.lastSpawnedCount += 1;
            this.totalSpawnedCount += 1;
        }
        return this.lastSpawnedCount;
    }

    get stats(): SpawnSystemStats {
        return {
            spawnRate: this.lastSpawnRate,
            pendingFraction: this.pendingFraction,
            lastSpawned: this.lastSpawnedCount,
            totalSpawned: this.totalSpawnedCount,
        };
    }

    private pickType(weights: readonly SpawnWeight[]): SpawnWeight['type'] {
        let totalWeight = 0;
        for (const entry of weights) {
            totalWeight += Math.max(0, entry.weight);
        }
        if (totalWeight <= 0) {
            return 'demon-rat';
        }

        let cursor = this.random.range(0, totalWeight);
        for (const entry of weights) {
            cursor -= Math.max(0, entry.weight);
            if (cursor < 0) {
                return entry.type;
            }
        }
        return weights[weights.length - 1].type;
    }

    private pickSpawnPoint(
        playerX: number,
        playerY: number,
        visibleSize: SpawnVisibleSize,
    ): { x: number; y: number } {
        const halfWidth = Math.max(1, Math.abs(visibleSize.width) * 0.5);
        const halfHeight = Math.max(1, Math.abs(visibleSize.height) * 0.5);
        const margin = ENDLESS_SWORD_DIFFICULTY.spawn.edgeMargin;
        const side = this.random.int(0, 3);

        if (side === 0) {
            return {
                x: playerX - halfWidth - margin,
                y: playerY + this.random.range(-halfHeight, halfHeight),
            };
        }
        if (side === 1) {
            return {
                x: playerX + halfWidth + margin,
                y: playerY + this.random.range(-halfHeight, halfHeight),
            };
        }
        if (side === 2) {
            return {
                x: playerX + this.random.range(-halfWidth, halfWidth),
                y: playerY - halfHeight - margin,
            };
        }
        return {
            x: playerX + this.random.range(-halfWidth, halfWidth),
            y: playerY + halfHeight + margin,
        };
    }
}
