/** 可复现的 32 位随机数（mulberry32）；战斗逻辑全部使用它，便于回放与调试。 */
export class SfRandom {
    private state: number;

    constructor(seed: number) {
        this.state = (seed >>> 0) || 0x9e3779b9;
    }

    next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    int(min: number, maxInclusive: number): number {
        return Math.floor(this.range(min, maxInclusive + 1));
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    pick<T>(items: readonly T[]): T {
        return items[Math.floor(this.next() * items.length) % items.length];
    }

    sign(): number {
        return this.next() < 0.5 ? -1 : 1;
    }
}
