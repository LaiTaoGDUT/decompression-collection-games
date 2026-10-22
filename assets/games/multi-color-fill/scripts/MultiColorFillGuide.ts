export interface FillGuideFrame {
    readonly color: number;
    readonly route: readonly number[];
    readonly position: number;
    readonly opacity: number;
    readonly press: number;
}

/** 首关只读示范与道具自动绘制共用手势时钟；棋盘写入由游戏驱动真实拖动规则。 */
export class MultiColorFillGuide {
    private clock = 0;
    private routes: number[][] = [];
    private enabled = false;
    private assistedColor = -1;
    private durations: number[] = [];
    private cycle = 0;

    reset(solution: readonly (readonly number[])[], enabled: boolean): void {
        this.clock = 0; this.enabled = enabled; this.assistedColor = -1;
        this.routes = enabled ? solution.map(route => Array.from(route)) : [];
        this.prepareDurations(.58);
    }
    get active(): boolean { return this.enabled; }
    get assisting(): boolean { return this.enabled && this.assistedColor >= 0; }
    play(color: number, route: readonly number[]): void {
        this.reset([route], true); this.assistedColor = color;
        this.prepareDurations(.12);
    }
    get finished(): boolean {
        return this.assisting && this.clock >= .15 + .35 + (this.routes[0].length - 1) * .12 + .35 + .3;
    }
    advance(seconds: number): void {
        if (this.enabled && Number.isFinite(seconds)) this.clock += Math.max(0, seconds);
    }
    get frame(): FillGuideFrame | undefined {
        const delay = this.assisting ? .15 : .45, step = this.assisting ? .12 : .58;
        if (!this.enabled || !this.routes.length || this.clock < delay) return undefined;
        const durations = this.durations;
        let age = this.assisting ? this.clock - delay : (this.clock - delay) % this.cycle, color = 0;
        while (age >= durations[color] && color < durations.length - 1) age -= durations[color++];
        const route = this.routes[color], motion = (route.length - 1) * step, liftAt = .35 + motion + .35;
        if (age >= liftAt + .3) return undefined;
        const position = Math.min(route.length - 1, Math.max(0, (age - .35) / step));
        return { color: this.assisting ? this.assistedColor : color, route, position,
            opacity: Math.min(1, age / .2) * Math.max(0, 1 - (age - liftAt) / .3),
            press: Math.min(1, age / .25) * Math.max(0, 1 - (age - liftAt) / .2) };
    }
    private prepareDurations(step: number): void {
        this.durations = this.routes.map(route => .35 + (route.length - 1) * step + .35 + .3 + .45);
        this.cycle = this.durations.reduce((sum, value) => sum + value, 0);
    }
    dismiss(): void { this.enabled = false; this.routes = []; this.durations = []; this.cycle = 0; this.assistedColor = -1; }
    dispose(): void { this.reset([], false); }
}
