export interface Aabb {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** 固定 cell 尺寸的 2D 空间哈希；实体跨 cell 时写入覆盖到的每个 cell。 */
export class SpatialHashGrid<T extends object> {
    private readonly buckets = new Map<string, T[]>();
    private readonly spareBuckets: T[][] = [];
    private readonly visitedAtQuery = new Map<T, number>();
    private queryId = 0;

    constructor(readonly cellSize: number) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialHashGrid cellSize must be greater than zero.');
        }
    }

    clear(): void {
        for (const bucket of this.buckets.values()) {
            bucket.length = 0;
            this.spareBuckets.push(bucket);
        }
        this.buckets.clear();
    }

    insert(item: T, bounds: Readonly<Aabb>): void {
        validateBounds(bounds);
        const minCellX = this.toCell(bounds.minX);
        const maxCellX = this.toCell(bounds.maxX);
        const minCellY = this.toCell(bounds.minY);
        const maxCellY = this.toCell(bounds.maxY);
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
            for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                const key = makeCellKey(cellX, cellY);
                let bucket = this.buckets.get(key);
                if (!bucket) {
                    bucket = this.spareBuckets.pop() ?? [];
                    this.buckets.set(key, bucket);
                }
                bucket.push(item);
            }
        }
    }

    /** 输出数组由调用方复用；跨 cell 的同一实体只返回一次。 */
    query(bounds: Readonly<Aabb>, output: T[]): T[] {
        validateBounds(bounds);
        output.length = 0;
        this.queryId += 1;
        if (this.queryId >= Number.MAX_SAFE_INTEGER) {
            this.queryId = 1;
            this.visitedAtQuery.clear();
        }
        const queryId = this.queryId;
        const minCellX = this.toCell(bounds.minX);
        const maxCellX = this.toCell(bounds.maxX);
        const minCellY = this.toCell(bounds.minY);
        const maxCellY = this.toCell(bounds.maxY);
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
            for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                const bucket = this.buckets.get(makeCellKey(cellX, cellY));
                if (!bucket) {
                    continue;
                }
                for (const item of bucket) {
                    if (this.visitedAtQuery.get(item) === queryId) {
                        continue;
                    }
                    this.visitedAtQuery.set(item, queryId);
                    output.push(item);
                }
            }
        }
        return output;
    }

    get occupiedCellCount(): number {
        return this.buckets.size;
    }

    private toCell(value: number): number {
        return Math.floor(value / this.cellSize);
    }
}

function makeCellKey(x: number, y: number): string {
    return `${x},${y}`;
}

function validateBounds(bounds: Readonly<Aabb>): void {
    if (
        !Number.isFinite(bounds.minX)
        || !Number.isFinite(bounds.minY)
        || !Number.isFinite(bounds.maxX)
        || !Number.isFinite(bounds.maxY)
        || bounds.minX > bounds.maxX
        || bounds.minY > bounds.maxY
    ) {
        throw new Error('SpatialHashGrid received invalid AABB bounds.');
    }
}
