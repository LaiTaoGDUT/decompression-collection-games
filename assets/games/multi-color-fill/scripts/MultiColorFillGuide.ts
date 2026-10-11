export interface FillGuideFrame {
    readonly color: number;
    readonly route: readonly number[];
    readonly position: number;
    readonly opacity: number;
    readonly press: number;
}

/** 首关示范的独立视觉时钟；只读正确路线，不向棋盘模型写入拖动或存档。 */
export class MultiColorFillGuide {
    private clock = 0;
    private routes: number[][] = [];
    private enabled = false;

    reset(solution: readonly (readonly number[])[], enabled: boolean): void {
        this.clock = 0; this.enabled = enabled;
        this.routes = enabled ? solution.map(route => Array.from(route)) : [];
    }
    get active(): boolean { return this.enabled; }
    advance(seconds: number): void {
        if (this.enabled && Number.isFinite(seconds)) this.clock += Math.max(0, seconds);
    }
    get frame(): FillGuideFrame | undefined {
        if (!this.enabled || !this.routes.length || this.clock < .45) return undefined;
        const durations = this.routes.map(route => .35 + (route.length - 1) * .58 + .35 + .3 + .45);
        const cycle = durations.reduce((sum, value) => sum + value, 0);
        let age = (this.clock - .45) % cycle, color = 0;
        while (age >= durations[color] && color < durations.length - 1) age -= durations[color++];
        const route = this.routes[color], motion = (route.length - 1) * .58, liftAt = .35 + motion + .35;
        if (age >= liftAt + .3) return undefined;
        const position = Math.min(route.length - 1, Math.max(0, (age - .35) / .58));
        return { color, route, position,
            opacity: Math.min(1, age / .2) * Math.max(0, 1 - (age - liftAt) / .3),
            press: Math.min(1, age / .25) * Math.max(0, 1 - (age - liftAt) / .2) };
    }
    dismiss(): void { this.enabled = false; this.routes = []; }
    dispose(): void { this.reset([], false); }
}
