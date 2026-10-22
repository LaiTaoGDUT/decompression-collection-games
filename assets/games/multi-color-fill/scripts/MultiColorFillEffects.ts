export interface FillHeadMotion { readonly from: number; readonly to: number; readonly progress: number; readonly length: number; }

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ENTRY = .3, RELEASE = .18, BUMP = .32;
const WIN = .5, BULGE_GROW = .5, BULGE_HOLD = .3, BULGE_RETURN = .5;
const BULGE_END = BULGE_GROW + BULGE_HOLD + BULGE_RETURN;
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
    private releaseAt: number[] = [];
    private releaseColor: number[] = [];
    private bumpAt: number[] = [];
    private entryDelay: number[] = [];
    private entryEnd = 0;
    private completedAt = -1;
    private revealAfter = BULGE_END;
    private animationUntil = 0;
    private routesUntil = 0;

    /** width 用于开局沿对角线逐格弹入；不传时不播放开局动效（例如单元验证）。 */
    reset(paths: readonly (readonly number[])[], cells: number, width = 0): void {
        this.clock = 0; this.previous = paths.map(path => Array.from(path));
        this.hoverAt = Array(cells).fill(-1); this.hintAt = Array(cells).fill(-1);
        this.winAt = Array(cells).fill(-1); this.headAt = [];
        this.releaseAt = Array(cells).fill(-1); this.releaseColor = Array(cells).fill(-1);
        this.bumpAt = Array(cells).fill(-1);
        const rows = width > 0 ? Math.ceil(cells / width) : 0, diagonals = Math.max(1, width + rows - 2);
        // 整盘弹入控制在 0.5 秒内：越大的棋盘每条对角线间隔越短。
        this.entryDelay = Array.from({ length: width > 0 ? cells : 0 },
            (_, cell) => (cell % width + Math.floor(cell / width)) / diagonals * .22);
        this.entryEnd = width > 0 ? .22 + ENTRY : 0;
        this.animationUntil = this.entryEnd; this.routesUntil = this.entryEnd;
        this.completedAt = -1; this.revealAfter = BULGE_END;
    }

    sync(paths: readonly (readonly number[])[]): void {
        paths.forEach((path, color) => {
            const old = this.previous[color] ?? [];
            if (old.length === path.length && old.every((cell, index) => cell === path[index])) return;
            const grows = path.length > old.length && old.every((cell, index) => cell === path[index]);
            for (let i = 1; i < path.length; i += 1) {
                if (old[i] !== path[i]) {
                    this.hoverAt[path[i]] = this.clock; this.releaseAt[path[i]] = -1;
                    this.animationUntil = Math.max(this.animationUntil, this.clock + .5);
                }
            }
            // 退回或被他色截断的格子保留原色收缩淡出；随后被别的颜色占用时由那边的 hover 接管。
            for (let i = 1; i < old.length; i += 1) {
                if (path[i] !== old[i] && path.indexOf(old[i]) < 0) {
                    this.releaseAt[old[i]] = this.clock; this.releaseColor[old[i]] = color;
                    this.animationUntil = Math.max(this.animationUntil, this.clock + RELEASE);
                }
            }
            // 后一格在前一格动画结束前到达时，从当前可见线头继续，避免快速拖动跳头。
            const previousHead = this.headAt[color];
            const from = previousHead?.at >= 0
                ? previousHead.from + (previousHead.to - previousHead.from) * outCubic((this.clock - previousHead.at) / .08)
                : Math.max(0, old.length - 1);
            this.headAt[color] = grows ? { from, to: path.length - 1, at: this.clock }
                : { from: path.length - 1, to: path.length - 1, at: -1 };
            if (grows) this.routesUntil = Math.max(this.routesUntil, this.clock + .08);
            this.previous[color] = Array.from(path);
        });
    }

    hint(cell: number): void {
        this.hintAt[cell] = this.clock;
        this.animationUntil = Math.max(this.animationUntil, this.clock + .3);
        this.routesUntil = Math.max(this.routesUntil, this.clock + .3);
    }
    /** 拖进墙或他色起点：同一障碍在晃动结束前不重复触发。 */
    bump(cell: number): boolean {
        if (!(cell >= 0 && cell < this.bumpAt.length) || (this.bumpAt[cell] >= 0 && this.clock - this.bumpAt[cell] < BUMP)) return false;
        this.bumpAt[cell] = this.clock;
        this.animationUntil = Math.max(this.animationUntil, this.clock + BUMP);
        this.routesUntil = Math.max(this.routesUntil, this.clock + BUMP);
        return true;
    }

    complete(paths: readonly (readonly number[])[]): void {
        if (this.completedAt >= 0) return;
        this.sync(paths); this.completedAt = this.clock;
        const longest = Math.max(...paths.map(path => path.length));
        // FillController 序列化参数：0.08 / (0.045 * 最长路线格数 + 1)。
        const delay = .08 / (.045 * longest + 1);
        paths.forEach(path => path.forEach((cell, index) => { this.winAt[cell] = this.clock + index * delay; }));
        // 等路线鼓动和最后一格亮波结束，无须再等待中央烟花。
        this.revealAfter = Math.max(BULGE_END, delay * (longest - 1) + WIN);
        this.animationUntil = Math.max(this.animationUntil, this.clock + this.revealAfter);
        this.routesUntil = Math.max(this.routesUntil, this.clock + BULGE_END);
    }

    advance(seconds: number): boolean {
        if (Number.isFinite(seconds)) this.clock += Math.max(0, seconds);
        return this.animating;
    }

    get completed(): boolean { return this.completedAt >= 0; }
    get completionAge(): number { return this.completedAt < 0 ? -1 : this.clock - this.completedAt; }
    get readyToReveal(): boolean { return this.completed && this.completionAge >= this.revealAfter; }
    get animating(): boolean { return this.clock < this.animationUntil; }
    get routesAnimating(): boolean { return this.clock < this.routesUntil; }

    /** 包含尚未开始的开局/亮波及其收尾帧，渲染层只重画受影响的行。 */
    tileAnimating(cell: number): boolean {
        return (this.entryDelay[cell] !== undefined && this.clock < this.entryDelay[cell] + ENTRY)
            || (this.releaseAt[cell] >= 0 && this.clock - this.releaseAt[cell] < RELEASE)
            || (this.bumpAt[cell] >= 0 && this.clock - this.bumpAt[cell] < BUMP)
            || (this.hoverAt[cell] >= 0 && this.clock - this.hoverAt[cell] < .5)
            || (this.winAt[cell] >= 0 && this.clock - this.winAt[cell] < WIN);
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
        if (at < 0 || age < 0 || age >= WIN) return 0;
        return Math.max(0, curve(age / WIN, 1, 0, -1, -2.23594));
    }
    winScale(cell: number): number {
        const t = clamp((this.clock - this.winAt[cell]) / WIN);
        return .4 + .6 * curve(t, 1.00183, 1, 1.60284, -.051145);
    }
    /** 开局弹入比例：0→1，带少量过冲。 */
    entry(cell: number): number {
        const delay = this.entryDelay[cell];
        return delay === undefined ? 1 : outBack((this.clock - delay) / ENTRY, 1.6);
    }
    /** 已有路线随整盘最后一条对角线一起长出。 */
    get entryAll(): number { return this.entryEnd > 0 ? outBack((this.clock - (this.entryEnd - ENTRY)) / ENTRY, 1.6) : 1; }
    /** 退回格的原色收缩进度：返回 [颜色, 0→1]，未在播放时为 undefined。 */
    release(cell: number): readonly [number, number] | undefined {
        const at = this.releaseAt[cell];
        if (at < 0 || this.clock - at >= RELEASE) return undefined;
        return [this.releaseColor[cell], clamp((this.clock - at) / RELEASE)];
    }
    /** 障碍晃动：横向位移比例，-1..1 衰减正弦。 */
    bumpShake(cell: number): number {
        const at = this.bumpAt[cell], age = this.clock - at;
        if (at < 0 || age >= BUMP) return 0;
        return Math.sin(age / BUMP * Math.PI * 4) * (1 - age / BUMP);
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
        if (age < BULGE_GROW) return 1 + .22 * outBack(age / BULGE_GROW);
        if (age < BULGE_GROW + BULGE_HOLD) return 1.22;
        if (age < BULGE_END) {
            return 1.22 - .22 * outBack((age - BULGE_GROW - BULGE_HOLD) / BULGE_RETURN);
        }
        return 1;
    }

    dispose(): void { this.reset([], 0); }
}
