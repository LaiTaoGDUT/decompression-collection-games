export interface ObjectPoolStats {
    readonly capacity: number;
    readonly active: number;
    readonly available: number;
    readonly failedAcquires: number;
    readonly totalAcquires: number;
    readonly totalReleases: number;
}

/**
 * 固定容量、初始化时完全预热的对象池。运行中 acquire 绝不扩容；池耗尽时返回
 * undefined，让上层按性能预算丢弃生成请求。
 */
export class ObjectPool<T extends object> {
    private readonly items: T[] = [];
    private readonly indices = new Map<T, number>();
    private readonly activeFlags: boolean[] = [];
    private readonly availableIndices: number[] = [];
    private activeCountValue = 0;
    private failedAcquireCount = 0;
    private acquireCount = 0;
    private releaseCount = 0;

    constructor(
        readonly capacity: number,
        factory: (poolIndex: number) => T,
        private readonly resetItem?: (item: T) => void,
    ) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new Error('ObjectPool capacity must be a positive integer.');
        }
        for (let index = 0; index < capacity; index += 1) {
            const item = factory(index);
            this.items.push(item);
            this.indices.set(item, index);
            this.activeFlags.push(false);
        }
        for (let index = capacity - 1; index >= 0; index -= 1) {
            this.availableIndices.push(index);
        }
    }

    acquire(): T | undefined {
        const index = this.availableIndices.pop();
        if (index === undefined) {
            this.failedAcquireCount += 1;
            return undefined;
        }
        this.activeFlags[index] = true;
        this.activeCountValue += 1;
        this.acquireCount += 1;
        return this.items[index];
    }

    release(item: T): boolean {
        const index = this.indices.get(item);
        if (index === undefined || !this.activeFlags[index]) {
            return false;
        }
        this.resetItem?.(item);
        this.activeFlags[index] = false;
        this.availableIndices.push(index);
        this.activeCountValue -= 1;
        this.releaseCount += 1;
        return true;
    }

    clear(beforeRelease?: (item: T) => void): void {
        for (let index = 0; index < this.items.length; index += 1) {
            if (!this.activeFlags[index]) {
                continue;
            }
            const item = this.items[index];
            beforeRelease?.(item);
            this.resetItem?.(item);
            this.activeFlags[index] = false;
            this.releaseCount += 1;
        }
        this.availableIndices.length = 0;
        for (let index = this.capacity - 1; index >= 0; index -= 1) {
            this.availableIndices.push(index);
        }
        this.activeCountValue = 0;
    }

    forEachActive(visitor: (item: T) => void): void {
        for (let index = 0; index < this.items.length; index += 1) {
            if (this.activeFlags[index]) {
                visitor(this.items[index]);
            }
        }
    }

    getAt(poolIndex: number): T | undefined {
        return this.items[poolIndex];
    }

    isActive(item: T): boolean {
        const index = this.indices.get(item);
        return index !== undefined && this.activeFlags[index];
    }

    get activeCount(): number {
        return this.activeCountValue;
    }

    get stats(): ObjectPoolStats {
        return {
            capacity: this.capacity,
            active: this.activeCountValue,
            available: this.capacity - this.activeCountValue,
            failedAcquires: this.failedAcquireCount,
            totalAcquires: this.acquireCount,
            totalReleases: this.releaseCount,
        };
    }
}
