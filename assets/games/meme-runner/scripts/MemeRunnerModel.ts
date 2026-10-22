/** Deterministic 120 Hz runner simulation. All coordinates are design pixels. */
export const NYAN = Object.freeze({ notice: 1550, warning: 1.15, speed: 200 });
export function nyanPhase(age: number): 'hidden' | 'warning' | 'flight' { return age < 0 ? 'hidden' : age < NYAN.warning ? 'warning' : 'flight'; }
export type ObstacleKind = 'crate' | 'tower' | 'bar' | 'gap' | 'wall' | 'roller' | 'steam' | 'spikes' | 'nyan-low' | 'nyan-high' | 'wave';
const OBSTACLE_KINDS: readonly ObstacleKind[] = ['crate', 'tower', 'bar', 'gap', 'wall', 'roller', 'steam', 'spikes', 'nyan-low', 'nyan-high', 'wave'];
/** `lead` is the time from the avoiding input to first contact; `ghosted` marks a pass made only by invulnerability;
 * `judged` marks a Perfect already announced the moment its clearance became certain. */
export interface RunnerObstacle { id: number; kind: ObstacleKind; x: number; width: number; height: number; hit: boolean; scored?: boolean; broken?: boolean; visibleAge?: number; originX?: number; bottom?: number; bridged?: boolean; lead?: number; ghosted?: boolean; judged?: boolean; }
export interface RunnerCoin { id: number; x: number; y: number; taken: boolean; golden?: boolean; }
/** Pickups only assist; obstacle-clearing rewards are earned through Fever. */
export type PowerKind = 'magnet' | 'shield';
export interface RunnerPower { id: number; kind: PowerKind; x: number; y: number; taken: boolean; }
export const POWER_DURATION = 7;
/** Skill loop: last-moment avoidance is Perfect, Perfects chain combo and fill Fever. */
export const SKILL = Object.freeze({
    perfectLead: .24, gapLead: .16,
    perfectGain: .15, goodGain: .02, stuntGain: .15, hitLoss: .5,
    // Fever skims just above ground hazards at a fixed altitude; the grace covers the drop back down
    // and the first stride after it, so a hazard at the landing spot is never unavoidable.
    feverDuration: 6, feverSpeed: 1.3, feverAltitude: 110, feverGrace: .9, hitStop: .05,
});
export function steamPhase(age: number): 'warning' | 'active' | 'rest' {
    const t = Math.max(0, age) % 4; return t < .8 ? 'warning' : t < 2.8 ? 'active' : 'rest';
}
export type CompanionKind = 'dragon' | 'bull' | 'spinner' | 'banana' | 'popcat';
/** Popcat blocks the road: it keeps pace at the screen's right edge, winds up, then POPs four
 * ground sound waves at the runner on a steady beat before settling on the road to be jumped. */
export const POPCAT = Object.freeze({ hold: 780, windup: .6, period: .95, pops: 4, settle: 1, waveSpeed: 240, height: 84 });
export const POPCAT_ATTACK = POPCAT.windup + (POPCAT.pops - 1) * POPCAT.period + POPCAT.settle;
/** Painted pose (0 calm, 1 opening, 2 wide, 3 POP) on the same clock that fires the waves. */
export function popcatPose(age: number): number {
    if (age < 0) return 0;
    const since = age - POPCAT.windup;
    if (since < 0) return since < -.3 ? 0 : since < -.15 ? 1 : 2;
    const k = Math.floor(since / POPCAT.period), t = since - k * POPCAT.period;
    if (k >= POPCAT.pops) return 0;
    if (t < .16) return 3;
    if (t < .3) return 2;
    if (k === POPCAT.pops - 1) return 0;
    return t > POPCAT.period - .15 ? 2 : t > POPCAT.period - .3 ? 1 : 0;
}
export const BANANA_JUMP = Object.freeze({ impulse: 650, rest: .25 });
/** The complete painted jump poses and the hitbox follow this same ballistic arc. */
export function bananaMotion(age: number): { y: number; vy: number; jumpAge: number; grounded: boolean } {
    const flight = BANANA_JUMP.impulse * 2 / 1800, period = BANANA_JUMP.rest + flight;
    const t = Math.max(0, age) % period - BANANA_JUMP.rest;
    return t < 0 ? { y: 0, vy: 0, jumpAge: 0, grounded: true }
        : { y: Math.max(0, BANANA_JUMP.impulse * t - 900 * t * t), vy: BANANA_JUMP.impulse - 1800 * t, jumpAge: t, grounded: false };
}
export const SPINNER = Object.freeze({ travel: 70, period: 1.8, turn: 1 });
/** Continuous supine spin and horizontal sway share the visible trap clock. */
export function spinnerMotion(age: number): { phase: 'hidden' | 'active'; progress: number; offset: number } {
    if (age < 0) return { phase: 'hidden', progress: 0, offset: 0 };
    return { phase: 'active', progress: age % SPINNER.turn / SPINNER.turn,
        offset: SPINNER.travel * Math.sin(age / SPINNER.period * Math.PI * 2) };
}
export interface RunnerCompanion {
    id: number; kind: CompanionKind; x: number; y: number; width: number; height: number;
    age: number; visibleAge: number; actionAge: number; used: boolean; active: boolean; offset: number; stride: number;
    originY?: number;
    /** Popcat: waves already fired. */
    pops?: number;
}
export interface RunnerPlatform { id: number; x: number; y: number; width: number; }
export type RunnerEvent = 'jump' | 'double' | 'land' | 'slide' | 'hit' | 'fall' | 'coin' | 'bounce' | 'mount' | 'dismount' | 'break' | 'perfect' | 'good' | 'fever' | 'feverEnd' | 'warning' | 'power' | 'shield' | 'deliver' | 'pop';
export interface RunnerFeedback { kind: RunnerEvent; x: number; y: number; value: number; }
export interface RunnerSnapshot { version: 37; model: Record<string, unknown>; }
export const RUNNER = Object.freeze({ speed: 430, gravity: 1800, jump: 720, halfWidth: 29,
    height: 90, slideHeight: 39, barBottom: 58, pixelsPerMeter: 20, step: 1 / 120,
    rideHeight: 64, rideDuration: 6, bounce: 850 });
/** One delivery: the course ends at the customer's door; the last stretch before it stays clear for the hand-off.
 * The final score adds a delivery bonus and a customer rating (stars by mistakes) to the running score. */
export const COURSE = Object.freeze({ meters: 4000, runway: 60, tiers: 5, topSpeed: 760,
    deliveryBonus: 2000, starBonus: [0, 0, 800, 2000] as readonly number[] });
export const FINISH_X = COURSE.meters * RUNNER.pixelsPerMeter;
/** Two-route sections: rooftops at `roofY`, above a single jump's reach. The climb is a jump `climbLead`
 * seconds before the first roof with the second jump at its apex (`climbDouble` seconds in). */
export const ROUTE = Object.freeze({ roofY: 200, climbLead: .85, climbDouble: .4 });
/** Height of a ground jump `t` seconds after takeoff; coins trace this arc to show the timing. */
export function jumpHeight(t: number): number { return RUNNER.jump * t - RUNNER.gravity / 2 * t * t; }
/** Height along the rooftop climb: a jump, then the second jump at its apex. */
export function climbHeight(t: number): number { return t < ROUTE.climbDouble ? jumpHeight(t) : jumpHeight(ROUTE.climbDouble) + jumpHeight(t - ROUTE.climbDouble); }
/** Shared by the runner and the course generator so section spacing matches the actual pace; top speed at the door. */
export function baseSpeedAt(x: number): number { return RUNNER.speed + (COURSE.topSpeed - RUNNER.speed) * Math.min(1, Math.max(0, x) / FINISH_X); }
/** Five equal stretches; the last (tier 4) is the final sprint. */
export function courseTier(x: number): number { return Math.min(COURSE.tiers - 1, Math.floor(Math.max(0, x) / (FINISH_X / COURSE.tiers))); }
/** The customer's rating: every mistake on the way costs a star (three mistakes never arrive). */
export function deliveryStars(hits: number): number { return Math.max(1, 3 - hits); }

export class MemeRunnerModel {
    x = 0; y = 0; vy = 0; time = 0; jumps = 0; grounded = true; sliding = false;
    slideHeld = false; invulnerable = 0; coins = 0; hits = 0;
    ended = false; delivered = false; chase = 1; landAge = 1; jumpAge = 1;
    mistakes = 0;
    combo = 0; bestCombo = 0; bonus = 0; bounces = 0; mounts = 0;
    perfects = 0; fevers = 0; fever = 0; feverTime = 0; lastJumpAt = -10; lastSlideAt = -10;
    mounted = 0; rideTime = 0; hurtAge = 10; breakAge = 10; surfaceY = 0;
    magnetTime = 0; shieldTime = 0;
    readonly powers: RunnerPower[] = [];
    readonly obstacles: RunnerObstacle[] = [];
    readonly pickups: RunnerCoin[] = [];
    readonly events: RunnerEvent[] = [];
    readonly feedbacks: RunnerFeedback[] = [];
    readonly companions: RunnerCompanion[] = [];
    readonly platforms: RunnerPlatform[] = [];
    private accumulated = 0;
    private sequence = 0;
    private nextX = 850;
    private randomState: number;
    private section = 0;
    private jumpBuffer = 0;
    private coyote = 0;
    private pickupsDirty = false;
    private recentPatterns: string[] = [];

    constructor(seed = 1977) {
        this.randomState = seed >>> 0 || 1;
        this.generateAhead();
    }
    /** Full local continuation, including RNG, trap clocks and the unfinished fixed step. */
    snapshot(): RunnerSnapshot {
        const model = JSON.parse(JSON.stringify(this)) as Record<string, unknown>;
        model.events = []; model.feedbacks = []; model.slideHeld = false; model.jumpBuffer = 0;
        return { version: 37, model };
    }
    /** Earlier checkpoints belong to retired rules (endless course, old powers) and start a fresh run. */
    static restore(value: unknown): MemeRunnerModel | undefined {
        const saved = value as RunnerSnapshot;
        if (Number(saved?.version) !== 37 || !saved.model || typeof saved.model !== 'object') return undefined;
        const data = JSON.parse(JSON.stringify(saved.model)) as Record<string, unknown>, model = new MemeRunnerModel(1);
        if (typeof data.accumulated === 'number' && data.accumulated > -1e-8) data.accumulated = Math.max(0, data.accumulated);
        const validNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e13;
        const optional = (v: unknown): boolean => v === undefined || validNumber(v);
        const rows = (key: string, limit: number, fields: string[], kinds?: string[]): boolean => {
            const list = data[key];
            return Array.isArray(list) && list.length <= limit && list.every(row => row && typeof row === 'object'
                && fields.every(field => validNumber(row[field])) && (!kinds || kinds.indexOf(row.kind) >= 0)
                && optional(row.originY) && optional(row.bottom) && optional(row.lead) && optional(row.pops));
        };
        if (!rows('obstacles', 64, ['id', 'x', 'width', 'height'], OBSTACLE_KINDS as string[])
            || !rows('pickups', 512, ['id', 'x', 'y']) || !rows('powers', 32, ['id', 'x', 'y'], ['magnet', 'shield'])
            || !rows('platforms', 32, ['id', 'x', 'y', 'width'])
            || !rows('companions', 32, ['id', 'x', 'y', 'width', 'height', 'age', 'visibleAge', 'actionAge', 'offset', 'stride'], ['dragon', 'bull', 'spinner', 'banana', 'popcat'])
            || !Array.isArray(data.recentPatterns) || data.recentPatterns.length > 4 || !data.recentPatterns.every(v => typeof v === 'string')
            || data.ended !== false || data.delivered !== false) return undefined;
        for (const key of Object.keys(model)) {
            const original = model[key], incoming = data[key];
            if (typeof original === 'number' ? !validNumber(incoming) : typeof original === 'boolean' ? typeof incoming !== 'boolean'
                : typeof original === 'string' ? typeof incoming !== 'string' : !Array.isArray(incoming)) return undefined;
        }
        if (Number(data.x) < 0 || Number(data.time) < 0 || Number(data.mistakes) < 0 || Number(data.mistakes) > 2
            || !Number.isInteger(data.mistakes) || Number(data.x) >= FINISH_X || Number(data.nextX) < Number(data.x) || Number(data.accumulated) < 0 || Number(data.accumulated) >= RUNNER.step
            || Number(data.fever) < 0 || Number(data.fever) > 1 || Number(data.feverTime) < 0 || Number(data.feverTime) > SKILL.feverDuration) return undefined;
        // Only known constructor fields can be restored; foreign/prototype keys are never assigned.
        for (const key of Object.keys(model)) model[key] = JSON.parse(JSON.stringify(data[key]));
        model.clearInput(); model.events.length = model.feedbacks.length = 0;
        return model;
    }
    get meters(): number { return Math.floor(Math.min(this.x, FINISH_X) / RUNNER.pixelsPerMeter); }
    get remainingMeters(): number { return COURSE.meters - this.meters; }
    get progress(): number { return Math.min(1, this.x / FINISH_X); }
    /** Points earned on the way: distance, coins and skill bonuses. */
    get runScore(): number { return this.meters + this.coins * 10 + this.bonus; }
    get stars(): number { return this.delivered ? deliveryStars(this.hits) : 0; }
    get deliveryScore(): number { return this.delivered ? COURSE.deliveryBonus + COURSE.starBonus[this.stars] : 0; }
    get score(): number { return this.runScore + this.deliveryScore; }
    get speed(): number { return this.baseSpeed * (this.feverTime > 0 ? SKILL.feverSpeed : this.mounted ? 1.12 : 1); }
    get baseSpeed(): number { return baseSpeedAt(this.x); }
    get multiplier(): number { return 1 + Math.min(4, Math.floor(this.combo / 5)); }
    get rideStride(): number { return this.companions.find(c => c.id === this.mounted)?.stride ?? 0; }
    get height(): number { return this.sliding ? RUNNER.slideHeight : RUNNER.height; }

    jump(): boolean {
        // Fever is an uncontrolled flight; inputs return once it ends.
        if (this.ended || this.feverTime > 0 || (!this.grounded && this.y < -20)) return false;
        if (this.jumps >= 2) { if (this.vy < 0 && this.y - this.surfaceY < 65) this.jumpBuffer = .1; return false; }
        // A slide may be cancelled by jumping, only after the overhead obstacle is clear.
        if (!this.hasHeadroom()) return false;
        // A coyote jump leaves from the very lip of a pit: the latest possible, hence Perfect, takeoff.
        const lip = !this.grounded && this.coyote > 0 ? this.obstacles.find(o => o.kind === 'gap' && this.x > o.x && this.x < o.x + o.width) : undefined;
        if (lip) lip.lead = 0;
        this.jumps = this.grounded || this.coyote > 0 ? 1 : Math.max(1, this.jumps) + 1;
        this.coyote = 0; this.jumpBuffer = 0;
        this.grounded = this.sliding = false;
        this.vy = RUNNER.jump; this.jumpAge = 0; this.lastJumpAt = this.time;
        this.events.push(this.jumps === 2 ? 'double' : 'jump');
        return true;
    }
    holdSlide(held: boolean): void { this.slideHeld = held; }
    clearInput(): void { this.slideHeld = false; this.jumpBuffer = 0; }
    hasHeadroom(): boolean {
        return !this.obstacles.some(o => !o.broken && (o.kind === 'bar' || o.kind === 'nyan-high') && this.overlaps(o)
            && this.y + RUNNER.height > (o.bottom ?? RUNNER.barBottom));
    }
    advance(delta: number): void {
        if (this.ended || !Number.isFinite(delta) || delta <= 0) return;
        this.accumulated += Math.min(delta, .25);
        while (this.accumulated + 1e-9 >= RUNNER.step && !this.ended) {
            this.accumulated = Math.max(0, this.accumulated - RUNNER.step);
            this.step(RUNNER.step);
        }
    }
    private step(dt: number): void {
        const oldY = this.y, wasSliding = this.sliding;
        this.time += dt;
        // Each mistake owns a distinct distance. Approach it smoothly, never snap to the hero.
        const chaseTarget = this.ended ? 1 : [0, .42, .76][this.mistakes];
        this.chase += Math.max(-dt * .8, Math.min(dt * .7, chaseTarget - this.chase));
        this.landAge += dt; this.jumpAge += dt; this.hurtAge += dt; this.breakAge += dt;
        this.jumpBuffer = Math.max(0, this.jumpBuffer - dt); this.coyote = Math.max(0, this.coyote - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.magnetTime = Math.max(0, this.magnetTime - dt); this.shieldTime = Math.max(0, this.shieldTime - dt);
        if (this.feverTime > 0) {
            this.feverTime = Math.max(0, this.feverTime - dt); this.fever = this.feverTime / SKILL.feverDuration;
            // A fixed-altitude flight: no gravity, no jumps or slides; everything passed beneath is smashed.
            this.grounded = this.sliding = false; this.vy = 0; this.jumps = 2; this.coyote = this.jumpBuffer = 0;
            this.y += (SKILL.feverAltitude - this.y) * Math.min(1, dt * 8);
            // The flight then falls freely; the grace covers the descent, and pits ahead were bridged in flight.
            if (this.feverTime === 0) { this.invulnerable = Math.max(this.invulnerable, SKILL.feverGrace); this.jumps = 1; this.events.push('feverEnd'); }
        }
        this.updateTraps(dt);
        this.x += this.speed * dt;
        if (this.x >= FINISH_X) {
            // Reaching the door hands the order over: the run settles here, before any pursuit or hazard.
            this.x = FINISH_X; this.delivered = this.ended = true; this.events.push('deliver');
            this.feedbacks.push({ kind: 'deliver', x: this.x, y: Math.max(0, this.y) + 60, value: this.deliveryScore });
            return;
        }
        if (this.grounded) this.sliding = !this.mounted && (this.slideHeld || (this.sliding && !this.hasHeadroom()));
        if (this.sliding && !wasSliding) this.lastSlideAt = this.time;
        const pit = this.obstacles.find(o => o.kind === 'gap' && !o.bridged && this.x > o.x && this.x < o.x + o.width);
        const ledge = this.platforms.find(p => this.x >= p.x && this.x <= p.x + p.width && Math.abs(p.y - this.surfaceY) < 1);
        if (this.grounded && ((this.surfaceY > 0 && !ledge) || (this.surfaceY === 0 && pit))) {
            this.grounded = false; this.jumps = 1; this.vy = 0; this.coyote = .08;
        }
        if (!this.grounded && this.feverTime <= 0) {
            this.vy -= RUNNER.gravity * dt;
            this.y += this.vy * dt;
            const ride = this.mounted ? RUNNER.rideHeight : 0;
            const landings = this.platforms.filter(p => this.x >= p.x && this.x <= p.x + p.width && oldY >= p.y + ride && this.y <= p.y + ride);
            const floor = landings.length ? Math.max(...landings.map(p => p.y)) : !pit ? 0 : -Infinity;
            if (this.touchCompanion(oldY)) {
                // A belly bounce or mounting a bull replaces ordinary landing.
            } else if (this.y <= floor + ride && oldY >= floor + ride - 12 && this.vy <= 0) {
                this.surfaceY = floor; this.y = floor + ride; this.vy = 0; this.grounded = true; this.jumps = 0;
                this.sliding = !this.mounted && this.slideHeld; this.landAge = 0; this.events.push('land');
                if (this.sliding) this.lastSlideAt = this.time;
                if (this.jumpBuffer > 0) this.jump();
            } else if (this.y < -150) {
                const fallen = pit ?? this.obstacles.find(o => o.kind === 'gap' && this.x >= o.x && this.x <= o.x + o.width + 200);
                // The pit that caught the runner is a mistake, never a clean pass.
                if (fallen) fallen.hit = fallen.scored = true;
                this.damage('fall');
                this.x = Math.max(this.x, (fallen ? fallen.x + fallen.width : this.x) + 100);
                this.mounted = 0; this.rideTime = 0; this.surfaceY = 0;
                this.y = this.vy = 0; this.grounded = true; this.jumps = 0; this.landAge = 0;
                this.sliding = this.slideHeld;
            }
        }
        // Synchronize ridden/following actors after physics, avoiding a one-step
        // vertical lag between the bull's back and its rider during a jump.
        if (this.sliding && !wasSliding) this.events.push('slide');
        this.updateCompanions(dt);
        for (const o of this.obstacles) {
            if (o.lead === undefined && !o.broken && (o.kind === 'gap' ? this.x >= o.x : this.overlaps(o))) {
                const overhead = o.kind === 'bar' || o.kind === 'nyan-high';
                o.lead = this.time - (overhead ? this.lastSlideAt : this.lastJumpAt);
            }
            // Announce a Perfect as soon as the avoiding move is certain to succeed, while the
            // runner is still over (or under) the obstacle, rather than after it has passed.
            // Fever and the bull smash what they touch, so they are never judged as avoided.
            if (!o.judged && !o.scored && !o.hit && !o.broken && this.feverTime <= 0 && !this.mounted && this.perfectLead(o) && this.clears(o)) {
                o.judged = true; this.judge(o);
            }
            if (!o.scored && this.x - RUNNER.halfWidth >= o.x + o.width) {
                o.scored = true; if (!o.hit && !o.ghosted && !o.judged) this.judge(o);
            }
            if (o.kind === 'gap' || o.hit || o.broken || o.kind.startsWith('nyan-') && nyanPhase(o.visibleAge ?? -1) !== 'flight' || !this.overlaps(o)) continue;
            if (o.kind === 'steam' && steamPhase(o.visibleAge ?? -1) !== 'active') continue;
            if (this.feverTime > 0) {
                o.broken = o.scored = true; this.breakAge = 0; this.reward('break', o.x + o.width / 2, Math.min(o.height, 100), 40, false); continue;
            }
            if (this.mounted && (o.kind === 'wall' || o.kind === 'crate' || o.kind === 'tower' || o.kind === 'roller') && this.y - RUNNER.rideHeight < o.height) {
                o.broken = o.scored = true; this.breakAge = 0; this.reward('break', o.x + o.width / 2, o.height / 2, 60, false); continue;
            }
            const bottom = o.bottom ?? (o.kind === 'bar' ? RUNNER.barBottom : 0);
            if ((o.kind === 'bar' || this.y < bottom + o.height) && this.y + this.height > bottom) {
                if (this.invulnerable > 0) o.ghosted = true;
                else { o.hit = true; this.damage('hit'); }
            }
        }
        for (const power of this.powers) {
            if (!power.taken && Math.abs(power.x - this.x) < 48 && Math.abs(power.y - this.y - this.height / 2) < 65) {
                power.taken = true;
                if (power.kind === 'magnet') this.magnetTime = POWER_DURATION;
                else this.shieldTime = POWER_DURATION;
                this.events.push('power'); this.feedbacks.push({ kind: 'power', x: power.x, y: power.y, value: 0 });
            }
        }
        for (const coin of this.pickups) {
            if (!coin.taken && (this.magnetTime > 0 || this.feverTime > 0) && Math.hypot(coin.x - this.x, coin.y - this.y - 45) < 330) {
                const pull = Math.min(1, dt * 14); coin.x += (this.x - coin.x) * pull; coin.y += (this.y + 45 - coin.y) * pull;
            }
            if (!coin.taken && Math.abs(coin.x - this.x) < 47 && Math.abs(coin.y - (this.y + this.height / 2)) < 62) {
                coin.taken = true; const value = (coin.golden ? 3 : 1) * (this.feverTime > 0 ? 2 : 1); this.coins += value; this.events.push('coin');
                this.feedbacks.push({ kind: 'coin', x: coin.x, y: coin.y, value: value * 10 });
            }
        }
        this.generateAhead();
        // Popcat's waves are appended out of order, so cull every passed obstacle rather than just the head.
        for (let i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].x + this.obstacles[i].width < this.x - 700) this.obstacles.splice(i, 1);
        for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].taken || this.pickups[i].x < this.x - 700) this.pickups.splice(i, 1);
        while (this.powers.length && (this.powers[0].taken || this.powers[0].x < this.x - 700)) this.powers.shift();
        for (let i = this.companions.length - 1; i >= 0; i--) if (!this.companions[i].active || this.companions[i].x + this.companions[i].width < this.x - 700) this.companions.splice(i, 1);
        while (this.platforms.length && this.platforms[0].x + this.platforms[0].width < this.x - 700) this.platforms.shift();
    }
    /** The avoiding input came at the last viable moment. */
    private perfectLead(o: RunnerObstacle): boolean {
        const lead = o.lead ?? Infinity;
        return lead >= 0 && lead <= (o.kind === 'gap' ? SKILL.gapLead : SKILL.perfectLead);
    }
    /** Whether the current motion, with no further input, is guaranteed to get past the obstacle. */
    private clears(o: RunnerObstacle): boolean {
        // Under a hanging obstacle the slide cannot be released or cancelled until it is clear.
        if (o.kind === 'bar' || o.kind === 'nyan-high') return this.sliding && this.y + this.height <= (o.bottom ?? RUNNER.barBottom);
        if (this.grounded) return false;
        const half = RUNNER.gravity / 2, heightAt = (t: number): number => this.y + this.vy * t - half * t * t;
        if (o.kind === 'gap') return heightAt(Math.max(0, (o.x + o.width - this.x) / this.speed)) > 0;
        const closing = this.speed + (o.kind === 'roller' && (o.visibleAge ?? 0) > .55 ? 90 : o.kind.startsWith('nyan-') ? NYAN.speed : o.kind === 'wave' ? POPCAT.waveSpeed : 0);
        const top = (o.bottom ?? 0) + o.height, exit = Math.max(0, (o.x + o.width - (this.x - RUNNER.halfWidth)) / closing);
        // A ballistic arc is concave, so clearing both ends of the overlap clears all of it.
        return this.y >= top && heightAt(exit) >= top;
    }
    /** A clean pass is Perfect when its avoiding input came at the last viable moment. */
    private judge(o: RunnerObstacle): void {
        const perfect = this.perfectLead(o);
        // Feedback rises from the runner, the point the player is watching.
        const x = this.x, y = Math.max(0, this.y) + this.height + 20;
        if (perfect) { this.perfects++; this.reward('perfect', x, y, 50, true); this.addFever(SKILL.perfectGain); }
        else { this.reward('good', x, y, 10, false); this.addFever(SKILL.goodGain); }
    }
    private addFever(amount: number): void {
        if (this.feverTime > 0 || this.ended) return;
        this.fever = Math.min(1, this.fever + amount);
        if (this.fever < 1) return;
        // Fever pays in points and a safe smashing window; mistakes are never refunded,
        // which is what keeps a full delivery rare.
        this.feverTime = SKILL.feverDuration; this.fevers++; this.dismount();
        this.events.push('fever'); this.feedbacks.push({ kind: 'fever', x: this.x, y: Math.max(0, this.y) + 60, value: 0 });
    }
    private dismount(): void {
        const ride = this.companions.find(c => c.id === this.mounted);
        if (!ride) return;
        this.mounted = 0; this.rideTime = 0; ride.actionAge = 0;
        if (this.grounded) { this.grounded = false; this.vy = 280; this.jumps = 1; this.jumpAge = .1; }
        this.events.push('dismount');
    }
    private overlaps(o: RunnerObstacle): boolean {
        return this.x + RUNNER.halfWidth > o.x && this.x - RUNNER.halfWidth < o.x + o.width;
    }
    private damage(event: 'hit' | 'fall'): void {
        if (this.invulnerable > 0 || this.feverTime > 0) return;
        if (this.shieldTime > 0) {
            this.shieldTime = 0; this.invulnerable = 1.2; this.events.push('shield');
            this.feedbacks.push({ kind: 'shield', x: this.x, y: Math.max(0, this.y) + 45, value: 0 }); return;
        }
        this.mistakes++; this.hits++; this.fever = Math.max(0, this.fever - SKILL.hitLoss);
        this.invulnerable = 1.2; this.combo = 0; this.hurtAge = 0; this.events.push(event);
        this.feedbacks.push({ kind: event, x: this.x, y: Math.max(0, this.y) + 45, value: -1 });
        if (this.mistakes >= 3) this.ended = true;
    }
    private random(): number {
        this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
        return this.randomState / 4294967296;
    }
    private generateAhead(): void {
        const limit = FINISH_X - COURSE.runway * RUNNER.pixelsPerMeter;
        let generated = false;
        while (this.nextX < this.x + 3000 && this.nextX < limit) {
            generated = true;
            const start = this.nextX, speed = baseSpeedAt(start);
            // Each stretch tightens the rhythm and shortens the breathers.
            const tier = courseTier(start);
            // The two-route rooftop stretch is listed twice: route choice should come up a few times per delivery.
            const choices = ['rhythm', 'alternating', 'steps', 'gaps', 'moving', 'steam', 'roof', 'roof', 'thorns', 'nyan', 'popcat', 'ride', 'banana', 'bounce', 'weave'];
            // Popcat travels with the runner while it attacks, so it needs room before the runway.
            const available = choices.filter(name => this.recentPatterns.indexOf(name) < 0
                && (name !== 'popcat' || start + (POPCAT_ATTACK + 2.5) * COURSE.topSpeed < limit));
            const pattern = available[Math.floor(this.random() * available.length)];
            this.recentPatterns.push(pattern); if (this.recentPatterns.length > 4) this.recentPatterns.shift();
            this.section++;
            // Seconds of travel, rather than fixed pixels, keep combinations fair as speed increases.
            const at = (seconds: number): number => start + seconds * speed;
            const obstacle = (kind: ObstacleKind, seconds: number): void => {
                this.addObstacle(kind, at(seconds));
                const o = this.obstacles[this.obstacles.length - 1];
                if (kind === 'gap') o.width = speed * (.48 + Math.min(4, tier) * .035 + this.random() * .08);
                if (kind === 'bar') o.width = 224;
            };
            const tempo = 1.22 - tier * .1;
            let duration = 4.5;
            if (pattern === 'rhythm') {
                for (let i = 0; i < 4; i++) obstacle(this.random() < .5 ? 'crate' : 'roller', i * tempo);
                duration = tempo * 3 + 1.5;
            } else if (pattern === 'alternating' || pattern === 'weave') {
                const reverse = pattern === 'weave';
                obstacle(reverse ? 'bar' : 'crate', 0); obstacle(reverse ? 'crate' : 'bar', tempo);
                obstacle(reverse ? 'bar' : 'tower', tempo * 2); duration = tempo * 2 + 2;
            } else if (pattern === 'steps') {
                obstacle('tower', 0); obstacle(this.random() < .5 ? 'wall' : 'tower', 1.65);
                obstacle('gap', 3.3); duration = 5;
            } else if (pattern === 'gaps') {
                obstacle('gap', 0); obstacle('gap', 1.55); obstacle('crate', 3.05); duration = 4.5;
            } else if (pattern === 'moving') {
                obstacle('roller', 0); obstacle('crate', 1.5); this.addCompanion('spinner', at(3)); duration = 4.8;
            } else if (pattern === 'steam') {
                obstacle('steam', 0); obstacle('bar', 1.7); obstacle('roller', 3); duration = 4.7;
            } else if (pattern === 'roof') {
                duration = this.addSkyline(at, speed, tier);
            } else if (pattern === 'thorns') {
                obstacle('spikes', 0); obstacle('bar', 1.6); obstacle('spikes', 3.1); duration = 5;
            } else if (pattern === 'nyan') {
                obstacle('nyan-low', 0); obstacle('nyan-high', 2); obstacle('nyan-low', 4); duration = 6;
            } else if (pattern === 'popcat') {
                // It settles at about at(POPCAT_ATTACK): four waves, the cat itself, then a gate.
                this.addCompanion('popcat', at(0)); obstacle('bar', POPCAT_ATTACK + 1.3); duration = POPCAT_ATTACK + 2.4;
            } else if (pattern === 'ride') {
                this.addCompanion('bull', at(0)); obstacle('wall', 1.1); obstacle('wall', 2.65);
                obstacle('gap', 4.25); obstacle('wall', 5.8); duration = 9.5;
            } else if (pattern === 'banana') {
                this.addCompanion('banana', at(0)); obstacle('crate', 1.3); obstacle('gap', 2.8);
                obstacle('bar', 4.3); duration = 5.8;
            } else {
                duration = this.addDragonPerch(at, speed);
                obstacle('roller', 3); obstacle('bar', 4.35);
            }
            if (this.section % 3 === 2) {
                const kinds: PowerKind[] = ['magnet', 'shield'];
                this.powers.push({ id: ++this.sequence, kind: kinds[Math.floor(this.random() * kinds.length)], x: start - 170, y: 48, taken: false });
            }
            this.nextX += (duration - tier * .2 + this.random() * .28) * speed;
            this.pickupsDirty = true;
        }
        // Sections never spill into the runway before the customer's door.
        if (generated) for (const list of [this.obstacles, this.companions, this.platforms] as Array<Array<{ x: number; width: number }>>) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].x + list[i].width > limit) list.splice(i, 1);
        }
        if (generated) for (const list of [this.pickups, this.powers] as Array<Array<{ x: number }>>) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].x > limit) list.splice(i, 1);
        }
        if (this.pickupsDirty) { this.pickups.sort((a, b) => a.x - b.x); this.pickupsDirty = false; }
    }
    /** Two routes through one stretch. The street below stays clear and coinless; the rooftops pay
     * in coins but need a climb, two hops and a hazard on the roof. Coins trace only the high route.
     * Returns the section's duration in seconds. */
    private addSkyline(at: (seconds: number) => number, speed: number, tier: number): number {
        const y = ROUTE.roofY, hop = .3 + Math.min(4, tier) * .03, runs = [1.1, 1.5, 1.1];
        // A hazard at .75 s into the middle roof leaves room to land from the hop, jump it and land again.
        const hazardKind: ObstacleKind = tier >= 3 ? 'spikes' : 'crate', hazardAt = .75;
        let s = .75;
        // The climb's coins trace the double jump onto the first roof.
        for (const t of [.2, .4, .6, .8, 1]) this.pickups.push({ id: ++this.sequence, x: at(s - ROUTE.climbLead) + speed * t, y: climbHeight(t) + 45, taken: false });
        runs.forEach((run, k) => {
            const left = at(s), width = run * speed;
            this.addPlatform(left, y, width, false);
            let skip = [Infinity, -Infinity];
            if (k === 1) {
                this.addObstacle(hazardKind, at(s + hazardAt), y);
                const o = this.obstacles[this.obstacles.length - 1]; skip = [o.x - 120, o.x + o.width + 60];
            }
            for (let cx = left + 30; cx < left + width - 20; cx += 64) {
                if (cx < skip[0] || cx > skip[1]) this.pickups.push({ id: ++this.sequence, x: cx, y: y + 46, taken: false });
            }
            // Golden coins arc over each gap from the roof's edge.
            if (k < runs.length - 1) this.coinArc(left + width, y, speed, [.2, .4, .6], true);
            s += run + (k < runs.length - 1 ? hop : 0);
        });
        this.addObstacle('crate', at(s + .9));
        return s + 2;
    }
    /** A belly bounce on the dragon reaches a rooftop perch at the high-route height. The bounce
     * descends through roof height about .8–1.15 s of travel after the dragon wherever it lands on
     * its back, so the perch spans .65–1.85 s. Returns the section's duration in seconds. */
    private addDragonPerch(at: (seconds: number) => number, speed: number): number {
        this.addCompanion('dragon', at(0)); this.addPlatform(at(.65), ROUTE.roofY, speed * 1.2);
        return 5.8;
    }
    private coinArc(takeoff: number, base: number, speed: number, times: number[], golden: boolean): void {
        for (const t of times) this.pickups.push({ id: ++this.sequence, x: takeoff + speed * t, y: base + jumpHeight(t) + 45, taken: false, golden });
        this.pickupsDirty = true;
    }
    /** Coins show how to pass: a Perfect jump arc over low hazards and pits, a low trail under
     * hanging gates, a line overhead elsewhere. Travelling sound waves carry none. */
    private guideCoins(o: RunnerObstacle): void {
        if (o.kind === 'wave') return;
        const speed = baseSpeedAt(o.x), lift = o.kind === 'bar' || o.kind === 'nyan-high' ? 0 : o.bottom ?? 0;
        if (o.kind === 'crate' || o.kind === 'spikes' || o.kind === 'gap') {
            const takeoff = o.kind === 'gap' ? o.x - .08 * speed : o.x - RUNNER.halfWidth - .17 * speed;
            this.coinArc(takeoff, lift, speed, [.14, .27, .4, .53, .66], false); return;
        }
        const y = o.kind === 'bar' || o.kind === 'nyan-high' ? 28 : o.kind === 'tower' || o.kind === 'steam' ? 225 : 132;
        for (let i = 0; i < 5; i++) this.pickups.push({ id: ++this.sequence, x: o.x - 90 + i * 80, y: lift + y, taken: false });
        this.pickupsDirty = true;
    }
    private addObstacle(kind: ObstacleKind, x: number, lift = 0): void {
        const width = kind === 'spikes' ? 200 : kind.startsWith('nyan-') ? 90 : kind === 'steam' ? 110 : kind === 'roller' ? 84 : kind === 'gap' ? 230 : kind === 'bar' ? 220 : kind === 'wall' ? 168 : kind === 'wave' ? 56 : 84;
        const height = kind === 'spikes' ? 84 : kind.startsWith('nyan-') ? 64 : kind === 'steam' ? 172 : kind === 'roller' ? 84 : kind === 'tower' ? 164 : kind === 'wall' ? 128 : kind === 'bar' ? 126 : kind === 'wave' ? 58 : 72;
        this.obstacles.push({ id: ++this.sequence, kind, x, width, height, hit: false, visibleAge: -1, originX: x,
            bottom: lift + (kind === 'nyan-high' ? 58 : kind === 'bar' ? RUNNER.barBottom : 0) });
        this.guideCoins(this.obstacles[this.obstacles.length - 1]);
    }

    private updateTraps(dt: number): void {
        // Fever lays bridges ahead. Placed planks remain until offscreen;
        // expiration never removes the floor from under a running/jumping actor.
        if (this.feverTime > 0) for (const o of this.obstacles) {
            if (o.kind === 'gap' && o.x < this.x + 1200 && o.x + o.width > this.x - 30) o.bridged = true;
        }
        for (const o of this.obstacles) {
            if (o.kind === 'wave') { o.x -= POPCAT.waveSpeed * dt; continue; }
            if (o.kind !== 'steam' && o.kind !== 'roller' && !o.kind.startsWith('nyan-')) continue;
            if ((o.visibleAge ?? -1) < 0 && o.x - this.x >= (o.kind.startsWith('nyan-') ? NYAN.notice : 780)) continue;
            const entering = (o.visibleAge ?? -1) < 0;
            o.visibleAge = Math.max(0, o.visibleAge ?? -1) + dt;
            if (entering) this.events.push('warning');
            if (o.kind === 'roller' && o.visibleAge > .55) o.x -= 90 * dt;
            if (o.kind.startsWith('nyan-')) {
                // Hold the cat beyond the viewport for a full telegraph before it flies in.
                // The lane marker, artwork and hitbox all use this phase clock.
                if (nyanPhase(o.visibleAge) === 'warning') o.x += this.speed * dt;
                else o.x -= NYAN.speed * dt;
            }
        }
    }
    private addPlatform(x: number, y: number, width: number, coins = true): void {
        this.platforms.push({ id: ++this.sequence, x, y, width });
        if (!coins) return;
        this.pickupsDirty = true;
        for (let i = 0; i < Math.floor(width / 60); i++) this.pickups.push({ id: ++this.sequence, x: x + i * 60 + 30, y: y + 46, taken: false });
    }
    private addCompanion(kind: CompanionKind, x: number, y = 0): void {
        const width = kind === 'dragon' ? 188 : kind === 'bull' ? 176 : kind === 'spinner' ? 100 : kind === 'popcat' ? 90 : 64;
        this.companions.push({ id: ++this.sequence, kind, x, y, width, height: kind === 'dragon' ? 68 : kind === 'bull' ? RUNNER.rideHeight : kind === 'spinner' ? 80 : kind === 'banana' ? 100 : kind === 'popcat' ? POPCAT.height : 72,
            age: 0, visibleAge: -1, actionAge: 10, originY: y, used: false, active: true, offset: 0, stride: 0 });
    }
    /** Only skilful actions extend the chain; every reward uses the current chain multiplier. */
    private reward(kind: 'perfect' | 'good' | 'break' | 'bounce' | 'mount', x: number, y: number, points: number, chained: boolean): void {
        if (chained) { this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); }
        const value = points * this.multiplier;
        this.bonus += value; this.events.push(kind); this.feedbacks.push({ kind, x, y, value });
    }
    private touchCompanion(oldY: number): boolean {
        if (this.vy >= 0 || this.mounted) return false;
        for (const c of this.companions) {
            // Fever already smashes through; the bull waits for an ordinary run.
            if (!c.active || c.used || (c.kind !== 'dragon' && (c.kind !== 'bull' || this.feverTime > 0))) continue;
            const top = c.y + c.height;
            if (this.x < c.x + 24 || this.x > c.x + c.width - 24 || oldY < top || this.y > top) continue;
            c.used = true; c.actionAge = 0; this.sliding = false; this.y = top;
            if (c.kind === 'dragon') {
                this.vy = RUNNER.bounce; this.jumps = 1; this.jumpAge = .1; this.grounded = false; this.bounces++;
                this.reward('bounce', this.x, top, 80, true); this.addFever(SKILL.stuntGain);
            } else {
                this.mounted = c.id; this.rideTime = RUNNER.rideDuration; this.mounts++; this.surfaceY = c.y;
                this.y = c.y + RUNNER.rideHeight; this.vy = 0; this.grounded = true; this.jumps = 0; this.landAge = 1;
                this.reward('mount', this.x, top, 100, true); this.addFever(SKILL.stuntGain);
            }
            return true;
        }
        return false;
    }
    /** Vertical contact with a hazard companion; the Fever flight smashes whatever it passes over, like obstacles. */
    private reaches(c: RunnerCompanion): boolean {
        return this.feverTime > 0 || this.y < c.y + c.height && this.y + this.height > c.y;
    }
    private updateCompanions(dt: number): void {
        for (const c of this.companions) {
            c.age += dt; c.actionAge += dt;
            const hidden = c.visibleAge < 0;
            if (c.visibleAge >= 0 || c.x - this.x < 780) c.visibleAge = Math.max(0, c.visibleAge) + dt;
            if (c.kind === 'spinner' && hidden && c.visibleAge >= 0 && !c.used && c.x + c.width > this.x) this.events.push('warning');
            if (c.kind === 'bull' && c.id === this.mounted) {
                c.x = this.x - c.width / 2; c.y = this.y - RUNNER.rideHeight;
                if (this.grounded && this.landAge >= .09 && this.breakAge >= .15) c.stride += this.speed * dt;
                this.rideTime = Math.max(0, this.rideTime - dt);
                const unsafe = this.obstacles.some(o => o.x + o.width > this.x - 90 && o.x < this.x + 380 && !o.broken && !o.bridged);
                if (this.rideTime === 0 && this.grounded && this.surfaceY === 0 && !unsafe) this.dismount();
            } else if (c.kind === 'bull' && c.used) {
                c.x += this.speed * 1.1 * dt; c.stride += this.speed * 1.1 * dt; if (c.actionAge > 1) c.active = false;
            } else if (c.kind === 'spinner') {
                c.offset = spinnerMotion(c.visibleAge).offset;
                if (!c.used && Math.abs(this.x - (c.x + c.width / 2 + c.offset)) < 55 && this.reaches(c)) {
                    // Smashed in Fever, absorbed (without credit) while invulnerable.
                    c.used = true;
                    if (this.feverTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit');
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.reward('good', c.x, c.y + 40, 10, false); this.addFever(SKILL.goodGain); }
            } else if (c.kind === 'popcat') {
                if (hidden && c.visibleAge >= 0) this.events.push('warning');
                // It enters at the hold distance, so keeping pace never jumps the drawing.
                if (c.visibleAge >= 0 && c.visibleAge < POPCAT_ATTACK) c.x = this.x + POPCAT.hold;
                const due = c.visibleAge < POPCAT.windup ? 0 : Math.min(POPCAT.pops, Math.floor((c.visibleAge - POPCAT.windup) / POPCAT.period) + 1);
                while (!c.used && (c.pops ?? 0) < due) {
                    c.pops = (c.pops ?? 0) + 1; this.addObstacle('wave', c.x - 30);
                    this.events.push('pop'); this.feedbacks.push({ kind: 'pop', x: c.x + c.width / 2, y: 150, value: 0 });
                }
                if (!c.used && Math.abs(this.x - (c.x + c.width / 2)) < 50 && this.reaches(c)) {
                    // Smashed in Fever, absorbed (without credit) while invulnerable.
                    c.used = true;
                    if (this.feverTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit');
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.reward('good', c.x, c.y + 40, 10, false); this.addFever(SKILL.goodGain); }
            } else if (c.kind === 'banana') {
                const jump = bananaMotion(c.visibleAge);
                c.y = (c.originY ?? 0) + jump.y;
                if (!c.used && Math.abs(this.x - c.x - c.width / 2) < 55 && this.reaches(c)) {
                    c.used = true;
                    if (this.feverTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit');
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.reward('good', c.x, c.y + 40, 10, false); this.addFever(SKILL.goodGain); }
            }
        }
    }
}
