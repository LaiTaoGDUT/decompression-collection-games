/**
 * 种子随机（策划案 §112）：mulberry32。
 * 所有影响玩法的随机统一走本类；生产 seed 为进入本局的 timestamp，QA 可固定。
 */
export class SeededRandom {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    static fromTimestamp(): SeededRandom {
        return new SeededRandom(Date.now());
    }

    /** 返回 [0, 1)。 */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** 返回 [min, max) 浮点。 */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** 返回 [min, max] 整数。 */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }
}
