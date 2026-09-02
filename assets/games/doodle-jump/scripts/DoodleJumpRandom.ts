export type DoodleJumpRandomStreamName = 'platform' | 'enemy' | 'item' | 'cosmetic';

export interface DoodleJumpRandomStreamSnapshot {
    readonly seed: number;
    readonly cursor: number;
}

export interface DoodleJumpRandomStreamsSnapshot {
    readonly platform: DoodleJumpRandomStreamSnapshot;
    readonly enemy: DoodleJumpRandomStreamSnapshot;
    readonly item: DoodleJumpRandomStreamSnapshot;
    readonly cosmetic: DoodleJumpRandomStreamSnapshot;
}

export function hashDoodleJumpSeed(value: string | number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

class DoodleJumpRandomStream {
    readonly seed: number;
    private state: number;
    private cursor = 0;

    constructor(seed: number) {
        this.seed = seed || 1;
        this.state = this.seed;
    }

    reset(): void {
        this.state = this.seed;
        this.cursor = 0;
    }

    next(): number {
        let value = this.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.state = value >>> 0;
        this.cursor += 1;
        return this.state / 4294967296;
    }

    getSnapshot(): DoodleJumpRandomStreamSnapshot {
        return Object.freeze({ seed: this.seed, cursor: this.cursor });
    }

    restore(snapshot: DoodleJumpRandomStreamSnapshot): void {
        if (snapshot.seed !== this.seed
            || !Number.isInteger(snapshot.cursor)
            || snapshot.cursor < 0
            || snapshot.cursor > 1000000) {
            throw new Error('Invalid Doodle Jump random stream snapshot.');
        }
        this.reset();
        for (let index = 0; index < snapshot.cursor; index += 1) this.next();
    }
}

export class DoodleJumpRandomStreams {
    private readonly streams: Readonly<Record<DoodleJumpRandomStreamName, DoodleJumpRandomStream>>;

    constructor(rootSeed: number) {
        const derive = (name: DoodleJumpRandomStreamName): number => (
            hashDoodleJumpSeed(`${rootSeed}:${name}`) || 1
        );
        this.streams = Object.freeze({
            platform: new DoodleJumpRandomStream(derive('platform')),
            enemy: new DoodleJumpRandomStream(derive('enemy')),
            item: new DoodleJumpRandomStream(derive('item')),
            cosmetic: new DoodleJumpRandomStream(derive('cosmetic')),
        });
    }

    reset(): void {
        this.streams.platform.reset();
        this.streams.enemy.reset();
        this.streams.item.reset();
        this.streams.cosmetic.reset();
    }

    next(name: DoodleJumpRandomStreamName): number {
        return this.streams[name].next();
    }

    getSnapshot(): DoodleJumpRandomStreamsSnapshot {
        return Object.freeze({
            platform: this.streams.platform.getSnapshot(),
            enemy: this.streams.enemy.getSnapshot(),
            item: this.streams.item.getSnapshot(),
            cosmetic: this.streams.cosmetic.getSnapshot(),
        });
    }

    restore(snapshot: DoodleJumpRandomStreamsSnapshot): void {
        this.streams.platform.restore(snapshot.platform);
        this.streams.enemy.restore(snapshot.enemy);
        this.streams.item.restore(snapshot.item);
        this.streams.cosmetic.restore(snapshot.cosmetic);
    }
}
