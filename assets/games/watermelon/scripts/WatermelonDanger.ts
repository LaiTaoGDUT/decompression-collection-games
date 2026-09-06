import { DEFAULT_WATERMELON_GAMEPLAY_CONFIG } from './WatermelonGameplayConfig';

/** 只累计连续稳定越线时间；离开危险状态立即清零且只完成一次。 */
export class OverflowGuard {
    private elapsed = 0;
    private finished = false;

    constructor(
        private readonly requiredSeconds = DEFAULT_WATERMELON_GAMEPLAY_CONFIG.dangerOverflowSeconds,
    ) {}

    get isTiming(): boolean {
        return this.elapsed > 0 && !this.finished;
    }

    get elapsedSeconds(): number {
        return this.elapsed;
    }

    get remainingSeconds(): number {
        return Math.max(0, this.requiredSeconds - this.elapsed);
    }

    advance(deltaSeconds: number, stableOverflow: boolean): boolean {
        if (this.finished) {
            return false;
        }

        if (!stableOverflow) {
            this.elapsed = 0;
            return false;
        }

        this.elapsed += Math.max(0, deltaSeconds);

        if (this.elapsed < this.requiredSeconds) {
            return false;
        }

        this.finished = true;
        return true;
    }

    /** Mirror an external solver's accumulated danger time without double-counting it. */
    synchronize(elapsedSeconds: number): boolean {
        if (this.finished) return false;
        this.elapsed = Math.max(0, elapsedSeconds);
        if (this.elapsed < this.requiredSeconds) return false;
        this.finished = true;
        return true;
    }

    reset(): void {
        this.elapsed = 0;
        this.finished = false;
    }
}
