/**
 * 固定时间步调度（开发计划 §4.4）：逻辑固定 30Hz，渲染帧用 alpha 插值。
 * 帧率波动不改变玩法速度；长时间卡顿丢弃欠账，避免螺旋追赶。
 */
export class GameLoop {
    private readonly logicDt: number;
    private accumulator = 0;

    constructor(
        logicHz: number,
        private readonly maxFrameSeconds: number,
        private readonly maxCatchUpSteps: number,
        private readonly step: (dt: number) => void,
    ) {
        this.logicDt = 1 / logicHz;
    }

    /** 推进一帧，返回当前插值 alpha ∈ [0,1)。 */
    tick(frameSeconds: number): number {
        this.accumulator += Math.min(frameSeconds, this.maxFrameSeconds);
        let stepped = 0;
        while (this.accumulator >= this.logicDt && stepped < this.maxCatchUpSteps) {
            this.step(this.logicDt);
            this.accumulator -= this.logicDt;
            stepped += 1;
        }
        if (stepped >= this.maxCatchUpSteps) {
            this.accumulator = 0;
        }
        return this.alpha;
    }

    get alpha(): number {
        return this.accumulator / this.logicDt;
    }

    reset(): void {
        this.accumulator = 0;
    }
}
