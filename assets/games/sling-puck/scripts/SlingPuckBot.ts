import { clamp, constrainPull, MAX_PULL, sideSign, SLING_PHYSICS as P, SLING_WORLD as W, type Side, type SlingPuckModel } from './SlingPuckModel';

export interface BotProfile {
    readonly name: string; readonly react: readonly [number, number]; readonly animation: number;
    readonly angleSigma: number; readonly powerSigma: number; readonly budgetMs: number;
    readonly robustTop: number; readonly robustSamples: number; readonly sloppiness: number;
}
const DEG = Math.PI / 180;
export const BOT_PROFILES: readonly BotProfile[] = Object.freeze([
    { name: '简单', react: [1.8, 3.2], animation: 1.35, angleSigma: 4.8 * DEG, powerSigma: .12, budgetMs: 180, robustTop: 2, robustSamples: 2, sloppiness: .2 },
    { name: '普通', react: [.9, 1.7], animation: 1, angleSigma: 2.6 * DEG, powerSigma: .06, budgetMs: 320, robustTop: 4, robustSamples: 3, sloppiness: .05 },
    { name: '困难', react: [.5, 1.1], animation: .82, angleSigma: DEG, powerSigma: .03, budgetMs: 520, robustTop: 6, robustSamples: 4, sloppiness: 0 },
]);
interface Plan { id: number; cx: number; angle: number; pull: number; score: number }
type Stage = 'wait' | 'think' | 'lift' | 'move' | 'pull' | 'hold';
const smooth = (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const now = () => typeof performance === 'undefined' ? Date.now() : performance.now();

/** Whole-board search, refined and sampled with release errors, scheduled in 5 ms frame slices. */
export class SlingPuckBot {
    private stage: Stage = 'wait'; private t = 0; private wait = 0;
    private held = -1; private from = { x: 0, y: 0 }; private plan?: Plan;
    private search?: Generator<void, Plan | undefined, unknown>;
    private random: () => number;
    constructor(private readonly model: SlingPuckModel, readonly side: Side, private readonly profile: BotProfile, seed = Date.now()) {
        this.random = mulberry32(seed); this.wait = .4 + this.random() * .6;
    }
    get status(): string {
        return this.stage === 'think' ? '思考中…' : this.stage === 'wait' ? `AI · ${this.profile.name}` : '出手中';
    }
    reset(): void {
        this.search?.return(undefined); this.search = undefined;
        if (this.held >= 0) this.model.drop(this.held);
        this.held = -1; this.plan = undefined; this.stage = 'wait'; this.t = 0; this.wait = .4 + this.random() * .6;
    }
    update(dt: number): void {
        if (this.model.phase !== 'play') { if (this.held >= 0 || this.stage !== 'wait') this.reset(); return; }
        this.t += dt;
        const duration = this.profile.animation;
        if (this.stage === 'wait') {
            if (this.t >= this.wait) { this.search = this.choose(); this.next('think'); }
            return;
        }
        if (this.stage === 'think') {
            const deadline = now() + 5;
            while (this.search && now() < deadline) {
                const item = this.search.next();
                if (item.done) { this.plan = item.value; this.search = undefined; }
            }
            if (this.search) return;
            const plan = this.plan, p = plan && this.model.pucks[plan.id];
            if (!plan || !p || !this.model.canGrab(this.side, p)) { this.rest(.2, .5); return; }
            this.held = this.model.grab(this.side, p.x, p.y);
            if (this.held < 0) { this.rest(.15, .3); return; }
            this.from = { x: p.x, y: p.y }; this.next('lift'); return;
        }
        const p = this.model.pucks[this.held], plan = this.plan;
        if (!p || p.holder !== this.side || !plan) { this.reset(); return; }
        if (this.stage === 'lift') { if (this.t >= .14 * duration) this.next('move'); return; }
        if (this.stage === 'move') {
            const k = smooth(Math.min(1, this.t / (.42 * duration))), band = sideSign(this.side) * (W.launchY - .68);
            this.model.drag(this.held, this.from.x + (plan.cx - this.from.x) * k, this.from.y + (band - this.from.y) * k);
            if (k >= 1) this.next('pull'); return;
        }
        if (this.stage === 'pull') {
            const k = 1 - Math.pow(1 - Math.min(1, this.t / (.46 * duration)), 3), target = this.target(plan);
            this.model.drag(this.held, plan.cx + (target.x - plan.cx) * k,
                sideSign(this.side) * W.launchY + (target.y - sideSign(this.side) * W.launchY) * k);
            if (k >= 1) this.next('hold'); return;
        }
        if (this.t >= .12 * duration) { this.model.release(this.held); this.held = -1; this.rest(...this.profile.react); }
    }
    private next(stage: Stage): void { this.stage = stage; this.t = 0; }
    private rest(min: number, max = min): void { this.plan = undefined; this.wait = min + (max - min) * this.random(); this.next('wait'); }
    private target(p: Plan): { x: number; y: number } {
        return { x: p.cx + Math.sin(p.angle) * p.pull, y: sideSign(this.side) * (W.launchY + Math.cos(p.angle) * p.pull) };
    }
    private gateX(cx: number, angle: number, pull: number): number | undefined {
        const t = this.target({ id: 0, cx, angle, pull, score: 0 }), c = constrainPull(this.side, cx, t.x, t.y);
        const shot = this.model.predict(this.side, c.x, c.y, 1000, cx);
        if (!shot || Math.abs(shot.vy) < 1e-5) return undefined;
        const time = -shot.y / shot.vy; return time > 0 ? shot.x + shot.vx * time : undefined;
    }
    private aim(cx: number, pull: number, target: number): number | undefined {
        let previous: number | undefined, previousAngle = 0;
        for (let i = 0; i <= 16; i++) {
            const angle = -P.angleLimit + 2 * P.angleLimit * i / 16, x = this.gateX(cx, angle, pull);
            if (x !== undefined && previous !== undefined && (previous - target) * (x - target) <= 0) {
                let lo = previousAngle, hi = angle, value = previous - target;
                for (let k = 0; k < 18; k++) {
                    const mid = (lo + hi) / 2, mx = this.gateX(cx, mid, pull); if (mx === undefined) return undefined;
                    if ((mx - target) * value <= 0) hi = mid; else { lo = mid; value = mx - target; }
                }
                return (lo + hi) / 2;
            }
            previous = x; previousAngle = angle;
        }
        return undefined;
    }
    private choosePuck(cx: number, target: number, board = this.model): number {
        const anchorY = sideSign(this.side) * W.launchY, dx = target - cx, dy = -anchorY, length = Math.hypot(dx, dy);
        let first = -1, firstAlong = Infinity, nearest = -1, nearestDistance = Infinity;
        for (const p of board.pucks) {
            if (!board.canGrab(this.side, p)) continue;
            const x = p.x - cx, y = p.y - anchorY, distance = Math.hypot(x, y), along = (x * dx + y * dy) / length;
            if (distance < nearestDistance) { nearest = p.id; nearestDistance = distance; }
            if (along > -RADIUS && along < length && Math.abs(x * dy - y * dx) / length < 71.4 && along < firstAlong) { first = p.id; firstAlong = along; }
        }
        return first >= 0 ? first : nearest;
    }
    private jitter(p: Plan): Plan {
        const sigma = this.profile.angleSigma * (this.model.suddenDeath ? 1.5 : 1);
        // The launch direction is compressed by 0.8 relative to the pull direction.
        return { ...p, angle: clamp(p.angle + gaussian(this.random) * sigma / -.8, -P.angleLimit, P.angleLimit),
            pull: clamp(p.pull * (1 + gaussian(this.random) * this.profile.powerSigma), P.minimumPull, MAX_PULL) };
    }
    private *choose(): Generator<void, Plan | undefined, unknown> {
        const board = this.model.snapshotForPlanning();
        if (!board.pucks.some(p => board.canGrab(this.side, p))) return undefined;
        const start = now(), candidates: Plan[] = [], bank = (W.halfWidth - RADIUS) * (1 + 1 / P.wallBounce);
        const xs = [0, -51, 51, -102, 102, -153, 153, -204, 204, -255, 255];
        const trials: Plan[] = [];
        for (const target of [0, -bank, bank]) for (const cx of xs) {
            const pull = target === 0 ? .82 * MAX_PULL : MAX_PULL, angle = this.aim(cx, pull, target), id = this.choosePuck(cx, target, board);
            if (angle !== undefined && id >= 0) trials.push({ id, cx, angle, pull, score: -Infinity });
        }
        const evaluate = function* (bot: SlingPuckBot, p: Plan): Generator<void, number, unknown> {
            const target = bot.target(p); return yield* board.evaluateShot(bot.side, p.id, p.cx, target.x, target.y);
        };
        for (const p of trials) {
            p.score = (yield* evaluate(this, p)) + (this.random() - .5) * .5; candidates.push(p); yield;
            if (candidates.length >= 12 && now() - start > this.profile.budgetMs * .55) break;
        }
        for (let i = 0; i < 5 && now() - start < this.profile.budgetMs * .6; i++) {
            const cx = (this.random() * 2 - 1) * 272, id = this.choosePuck(cx, 0, board);
            if (id < 0) break;
            const p = { id, cx, angle: (this.random() * 2 - 1) * .9, pull: (.5 + this.random() * .5) * MAX_PULL, score: 0 };
            p.score = yield* evaluate(this, p); candidates.push(p); yield;
        }
        const best = candidates.slice().sort((a, b) => b.score - a.score).slice(0, 5);
        for (const p of best) for (const [da, dp] of [[-.02, 1], [.02, 1], [-.05, 1], [.05, 1], [0, .85], [0, 1.12]]) {
            if (now() - start > this.profile.budgetMs) break;
            const refined = { ...p, angle: clamp(p.angle + da, -P.angleLimit, P.angleLimit), pull: clamp(p.pull * dp, P.minimumPull, MAX_PULL) };
            refined.score = yield* evaluate(this, refined); candidates.push(refined); yield;
        }
        candidates.sort((a, b) => b.score - a.score);
        let chosen = candidates[0], robustBest = -Infinity;
        for (const p of candidates.slice(0, this.profile.robustTop)) {
            let total = p.score;
            for (let sample = 0; sample < this.profile.robustSamples; sample++) { total += yield* evaluate(this, this.jitter(p)); yield; }
            const mean = total / (this.profile.robustSamples + 1);
            if (mean > robustBest) { robustBest = mean; chosen = p; }
        }
        if (!chosen) return undefined;
        if (this.random() < this.profile.sloppiness && candidates.length > 1) chosen = candidates[1 + Math.floor(this.random() * Math.min(4, candidates.length - 1))];
        for (let attempt = 0; attempt < 6; attempt++) {
            const noisy = this.jitter(chosen), target = this.target(noisy);
            if (this.model.pull(this.side, noisy.cx, target.x, target.y, noisy.id).valid) return noisy;
        }
        return chosen;
    }
}
const RADIUS = W.puckRadius;
function gaussian(random: () => number): number { return Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random()); }
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
