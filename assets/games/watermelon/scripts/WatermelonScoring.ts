import { getFruitConfig } from './FruitCatalog';

export interface WatermelonProgressSnapshot {
    readonly score: number;
    readonly maxFruitLevel: number;
}

export interface WatermelonMergeScoreEvent {
    readonly resultLevel: number;
    readonly points: number;
    readonly chainDepth: number;
    readonly isChain: boolean;
    readonly isMilestone: boolean;
    readonly snapshot: WatermelonProgressSnapshot;
}

/**
 * 分数只由实际合成结果产生。同一次投放的第一次合成为普通得分，
 * 只有该合成结果继续合成才从连锁 ×2 开始展示；连锁和里程碑不加倍率。
 */
export class WatermelonRoundProgress {
    private currentScore = 0;
    private currentMaxLevel = 0;

    get snapshot(): WatermelonProgressSnapshot {
        return Object.freeze({
            score: this.currentScore,
            maxFruitLevel: this.currentMaxLevel,
        });
    }

    recordSpawn(level: number): WatermelonProgressSnapshot {
        getFruitConfig(level);
        this.currentMaxLevel = Math.max(this.currentMaxLevel, level);
        return this.snapshot;
    }

    recordMerge(resultLevel: number, chainDepth = 1): WatermelonMergeScoreEvent {
        const config = getFruitConfig(resultLevel);
        const previousMaxLevel = this.currentMaxLevel;
        this.currentScore += config.score;
        this.currentMaxLevel = Math.max(this.currentMaxLevel, resultLevel);

        return Object.freeze({
            resultLevel,
            points: config.score,
            chainDepth: Math.max(1, Math.floor(chainDepth)),
            isChain: chainDepth >= 2,
            isMilestone: resultLevel >= 5 && resultLevel > previousMaxLevel,
            snapshot: this.snapshot,
        });
    }

    reset(): WatermelonProgressSnapshot {
        this.currentScore = 0;
        this.currentMaxLevel = 0;
        return this.snapshot;
    }

    restore(snapshot: WatermelonProgressSnapshot): WatermelonProgressSnapshot {
        if (!Number.isInteger(snapshot.score) || snapshot.score < 0
            || !Number.isInteger(snapshot.maxFruitLevel)
            || snapshot.maxFruitLevel < 0
            || snapshot.maxFruitLevel > 10) {
            throw new Error('Invalid watermelon progress snapshot.');
        }
        this.currentScore = snapshot.score;
        this.currentMaxLevel = snapshot.maxFruitLevel;
        return this.snapshot;
    }
}
