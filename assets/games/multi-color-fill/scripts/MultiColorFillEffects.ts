export interface FillHeadMotion { readonly from: number; readonly to: number; readonly progress: number; readonly length: number; }

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const outCubic = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
function outBack(value: number, overshoot = 3): number {
    const t = clamp(value) - 1;
    return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}
function curve(value: number, from: number, to: number, slopeFrom: number, slopeTo: number): number {
    const t = clamp(value), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * from + (t3 - 2 * t2 + t) * slopeFrom
        + (-2 * t3 + 3 * t2) * to + (t3 - t2) * slopeTo;
}

/** 原版 Fill2 的视觉时间线；不修改棋盘规则，也不注册计时器或持有 Cocos 节点。 */
export class MultiColorFillEffects {
    private clock = 0;
    private previous: number[][] = [];
    private hoverAt: number[] = [];
    private headAt: { from: number; to: number; at: number }[] = [];
    private hintAt: number[] = [];
    private winAt: number[] = [];
    private completedAt = -1;
    private revealAfter = 2.15;

    reset(paths: readonly (readonly number[])[], cells: number): void {
        this.clock = 0; this.previous = paths.map(path => Array.from(path));
        this.hoverAt = Array(cells).fill(-1); this.hintAt = Array(cells).fill(-1);
        this.winAt = Array(cells).fill(-1); this.headAt = [];
        this.completedAt = -1; this.revealAfter = 2.15;
    }

    sync(paths: readonly (readonly number[])[]): void {
        paths.forEach((path, color) => {
            const old = this.previous[color] ?? [];
            if (old.length === path.length && old.every((cell, index) => cell === path[index])) return;
            const grows = path.length > old.length && old.every((cell, index) => cell === path[index]);
            for (let i = 1; i < path.length; i += 1) {
                if (old[i] !== path[i]) this.hoverAt[path[i]] = this.clock;
            }
            // 后一格在前一格动画结束前到达时，从当前可见线头继续，避免快速拖动跳头。
            const previousHead = this.headAt[color];
            const from = previousHead?.at >= 0
                ? previousHead.from + (previousHead.to - previousHead.from) * outCubic((this.clock - previousHead.at) / .08)
                : Math.max(0, old.length - 1);
            this.headAt[color] = grows ? { from, to: path.length - 1, at: this.clock }
                : { from: path.length - 1, to: path.length - 1, at: -1 };
            this.previous[color] = Array.from(path);
        });
    }

    hint(cell: number): void { this.hintAt[cell] = this.clock; }

    complete(paths: readonly (readonly number[])[]): void {
        if (this.completedAt >= 0) return;
        this.sync(paths); this.completedAt = this.clock;
        const longest = Math.max(...paths.map(path => path.length));
        // FillController 序列化参数：0.08 / (0.045 * 最长路线格数 + 1)。
        const delay = .08 / (.045 * longest + 1);
        paths.forEach(path => path.forEach((cell, index) => { this.winAt[cell] = this.clock + index * delay; }));
        this.revealAfter = Math.max(2.15, delay * longest + .5);
    }

    advance(seconds: number): boolean {
        if (Number.isFinite(seconds)) this.clock += Math.max(0, seconds);
        return this.animating;
    }

    get completed(): boolean { return this.completedAt >= 0; }
    get completionAge(): number { return this.completedAt < 0 ? -1 : this.clock - this.completedAt; }
    get readyToReveal(): boolean { return this.completed && this.completionAge >= this.revealAfter; }
    get animating(): boolean {
        return (this.completed && !this.readyToReveal)
            || this.hoverAt.some(at => at >= 0 && this.clock - at < .5)
            || this.hintAt.some(at => at >= 0 && this.clock - at < .3)
            || this.headAt.some(head => head.at >= 0 && this.clock - head.at < .08);
    }

    head(color: number): FillHeadMotion | undefined {
        const head = this.headAt[color];
        if (this.completed || !head || head.at < 0 || this.clock - head.at >= .08) return undefined;
        const position = head.from + (head.to - head.from) * outCubic((this.clock - head.at) / .08);
        const route = this.previous[color], index = Math.min(route.length - 2, Math.floor(position));
        return { from: route[index], to: route[index + 1], progress: position - index, length: index + 2 };
    }
    hover(cell: number): number {
        const at = this.hoverAt[cell], age = this.clock - at;
        // 原版 Hover 的 JTransition：0.4 秒扩张，0.5 秒淡出。
        return at < 0 || age >= .5 ? 0 : Math.max(0, curve(age / .5, .51091, 0, -.51045, -.49778));
    }
    hoverScale(cell: number): number {
        const t = clamp((this.clock - this.hoverAt[cell]) / .4);
        return .4 + .6 * (2 * t - t * t);
    }
    win(cell: number): number {
        const at = this.winAt[cell], age = this.clock - at;
        if (at < 0 || age < 0 || age >= .5) return 0;
        return Math.max(0, curve(age / .5, 1, 0, -1, -2.23594));
    }
    winScale(cell: number): number {
        const t = clamp((this.clock - this.winAt[cell]) / .5);
        return .4 + .6 * curve(t, 1.00183, 1, 1.60284, -.051145);
    }
    hintAlpha(cell: number): number {
        const at = this.hintAt[cell];
        return at < 0 ? 0 : clamp((this.clock - at - .1) / .2);
    }
    get endAlpha(): number { return this.completed ? clamp(this.completionAge / .2) : 0; }
    get starScale(): number {
        const t = clamp(this.completionAge / .3), c = 1.70158;
        return this.completed ? 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) : 0;
    }
    get bulge(): number {
        const age = this.completionAge;
        if (age < 0) return 1;
        // 原版 Bulge：放大 1.22 倍，0.5 秒长大、0.3 秒停留、0.5 秒弹回。
        // DOTween Ease 枚举 27 是 OutBack；overshoot=3，不是 OutElastic。
        if (age < .5) return 1 + .22 * outBack(age / .5);
        if (age < .8) return 1.22;
        if (age < 1.3) {
            return 1.22 - .22 * outBack((age - .8) / .5);
        }
        return 1;
    }

    dispose(): void { this.reset([], 0); }
}
