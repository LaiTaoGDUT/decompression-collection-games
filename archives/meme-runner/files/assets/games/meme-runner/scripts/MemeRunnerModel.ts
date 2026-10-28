/** Deterministic 120 Hz runner simulation. All coordinates are design pixels. */
export const DRONE = Object.freeze({ notice: 1550, warning: 1.15, speed: 200 });
export function dronePhase(age: number): 'hidden' | 'warning' | 'flight' { return age < 0 ? 'hidden' : age < DRONE.warning ? 'warning' : 'flight'; }
export type ObstacleKind = 'crate' | 'tower' | 'bar' | 'gap' | 'wall' | 'roller' | 'steam' | 'spikes' | 'drone-low' | 'drone-high' | 'wave' | 'drop-crate';
const OBSTACLE_KINDS: readonly ObstacleKind[] = ['crate', 'tower', 'bar', 'gap', 'wall', 'roller', 'steam', 'spikes', 'drone-low', 'drone-high', 'wave', 'drop-crate'];
/** A cargo winch flashes for .65 s, then lowers its crate before the runner's approach jump. */
export const DROP = Object.freeze({ notice: 1.25, warning: .65, fall: .25, height: 220 });
/** `ghosted` marks a pass made only by invulnerability or a launcher launch, which earns nothing. */
export interface RunnerObstacle { id: number; kind: ObstacleKind; x: number; width: number; height: number; hit: boolean; scored?: boolean; broken?: boolean; visibleAge?: number; originX?: number; bottom?: number; originBottom?: number; bridged?: boolean; bridgeable?: boolean; ghosted?: boolean; }
export interface RunnerCoin { id: number; x: number; y: number; taken: boolean; golden?: boolean; }
/** Pickups only assist; obstacle-clearing rewards are earned through Fever. */
export type PowerKind = 'magnet' | 'shield' | 'giant' | 'flight' | 'bridge' | 'convert';
export interface RunnerPower { id: number; kind: PowerKind; x: number; y: number; taken: boolean; }
export const POWER_DURATION = 7;
export const POWER_KINDS: readonly PowerKind[] = ['magnet', 'shield', 'giant', 'flight', 'bridge', 'convert'];
export const POWER_NAMES: Readonly<Record<PowerKind, string>> = { magnet: '磁铁', shield: '护盾', giant: '巨人', flight: '飞行', bridge: '浮桥', convert: '点金' };
export const GIANT = Object.freeze({ duration: 6, scale: 1.28 });
export const ENEMY = Object.freeze({ stomp: 680, height: 76, width: 84 });
/** Validated action fragments: stages add decision types before tightening their cadence. */
export const COURSE_PATTERNS = [
    { id: 'rhythm', tier: 0, family: 'jump', weight: 2 }, { id: 'alternating', tier: 0, family: 'switch', weight: 2 },
    { id: 'gaps', tier: 0, family: 'pit', weight: 2 }, { id: 'terraces', tier: 0, family: 'platform', weight: 3 },
    { id: 'thorns', tier: 0, family: 'jump', weight: 1 }, { id: 'loading-dock', tier: 0, family: 'fork', weight: 2 },
    { id: 'roof', tier: 1, family: 'fork', weight: 3 }, { id: 'skyway', tier: 1, family: 'platform', weight: 4 },
    { id: 'springChain', tier: 1, family: 'spring', weight: 3 }, { id: 'stomp-yard', tier: 1, family: 'enemy', weight: 3 },
    { id: 'pit-slide', tier: 1, family: 'switch', weight: 2 }, { id: 'slide-pit', tier: 1, family: 'switch', weight: 2 },
    { id: 'ride', tier: 1, family: 'vehicle', weight: 2 }, { id: 'cargo-yard', tier: 1, family: 'timed', weight: 2 },
    { id: 'moving', tier: 2, family: 'timed', weight: 1 }, { id: 'steam', tier: 2, family: 'timed', weight: 1 },
    { id: 'stomp-cross', tier: 2, family: 'enemy', weight: 2 },
    { id: 'drone', tier: 2, family: 'missile', weight: 2 }, { id: 'compressor', tier: 2, family: 'timed', weight: 1 },
    { id: 'hopper', tier: 2, family: 'enemy', weight: 1 }, { id: 'saw-slalom', tier: 2, family: 'timed', weight: 1 },
    { id: 'electric-yard', tier: 3, family: 'enemy', weight: 2 }, { id: 'air-freight', tier: 3, family: 'missile', weight: 2 },
    { id: 'steps', tier: 3, family: 'jump', weight: 1 }, { id: 'weave', tier: 3, family: 'switch', weight: 1 },
] as const;
export interface RunnerSection { id: number; pattern: string; tier: number; start: number; dangerEnd: number; end: number; }
export type HitCause = ObstacleKind | DeviceKind | 'fall' | '';
/** Skill loop: every hazard passed by the player's own move extends the chain and fills Fever; a mistake
 * breaks the chain. */
export const SKILL = Object.freeze({
    clearPoints: 20, clearGain: .1, stuntGain: .15, hitLoss: .5,
    // Fever skims just above ground hazards at a fixed altitude; the grace covers the drop back down
    // and the first stride after it, so a hazard at the landing spot is never unavoidable.
    feverDuration: 6, feverSpeed: 1.3, feverAltitude: 110, feverGrace: .9,
});
export function steamPhase(age: number): 'warning' | 'active' | 'rest' {
    const t = Math.max(0, age) % 4; return t < .8 ? 'warning' : t < 2.8 ? 'active' : 'rest';
}
export type DeviceKind = 'launcher' | 'cart' | 'saw' | 'hopper' | 'compressor' | 'stomper' | 'electric';
/** The launcher is a rescue trampoline at fixed course marks: a pad bounce launches the runner on a long,
 * uncontrolled, invulnerable arc (a short Fever without smashing or rewards for what it passes over) and
 * gives back one lost heart. With every heart left it is only a stunt. */
export const LAUNCHER = Object.freeze({ meters: [1300, 2600] as readonly number[], launch: 2, height: 240, speed: 1.3, grace: .9 });
/** Height above the launcher's pad `t` (0..1) of the way through the launch; coins trace this arc. */
export function launchHeight(t: number): number { return LAUNCHER.height * Math.sin(Math.PI * Math.max(0, Math.min(1, t))); }
/** Compressor blocks the road: it keeps pace at the screen's right edge, winds up, then POPs four
 * ground sound waves at the runner on a steady beat before settling on the road to be jumped. */
export const COMPRESSOR = Object.freeze({ hold: 780, windup: .6, period: .95, pops: 4, settle: 1, waveSpeed: 240, height: 84 });
export const COMPRESSOR_ATTACK = COMPRESSOR.windup + (COMPRESSOR.pops - 1) * COMPRESSOR.period + COMPRESSOR.settle;
/** Painted pose (0 calm, 1 opening, 2 wide, 3 POP) on the same clock that fires the waves. */
export function compressorPose(age: number): number {
    if (age < 0) return 0;
    const since = age - COMPRESSOR.windup;
    if (since < 0) return since < -.3 ? 0 : since < -.15 ? 1 : 2;
    const k = Math.floor(since / COMPRESSOR.period), t = since - k * COMPRESSOR.period;
    if (k >= COMPRESSOR.pops) return 0;
    if (t < .16) return 3;
    if (t < .3) return 2;
    if (k === COMPRESSOR.pops - 1) return 0;
    return t > COMPRESSOR.period - .15 ? 2 : t > COMPRESSOR.period - .3 ? 1 : 0;
}
export const HOPPER_JUMP = Object.freeze({ impulse: 650, rest: .25 });
/** The complete painted jump poses and the hitbox follow this same ballistic arc. */
export function hopperMotion(age: number): { y: number; vy: number; jumpAge: number; grounded: boolean } {
    const flight = HOPPER_JUMP.impulse * 2 / 1800, period = HOPPER_JUMP.rest + flight;
    const t = Math.max(0, age) % period - HOPPER_JUMP.rest;
    return t < 0 ? { y: 0, vy: 0, jumpAge: 0, grounded: true }
        : { y: Math.max(0, HOPPER_JUMP.impulse * t - 900 * t * t), vy: HOPPER_JUMP.impulse - 1800 * t, jumpAge: t, grounded: false };
}
export const SAW = Object.freeze({ travel: 70, period: 1.8 });
/** Horizontal sway on the visible trap clock; the supine spin itself is a stop-motion loop. */
export function sawMotion(age: number): { phase: 'hidden' | 'active'; offset: number } {
    if (age < 0) return { phase: 'hidden', offset: 0 };
    return { phase: 'active', offset: SAW.travel * Math.sin(age / SAW.period * Math.PI * 2) };
}
export interface RunnerDevice {
    id: number; kind: DeviceKind; x: number; y: number; width: number; height: number;
    age: number; visibleAge: number; actionAge: number; used: boolean; active: boolean; offset: number;
    originY?: number;
    /** Compressor: waves already fired. */
    pops?: number;
}
/** `bob` platforms float up and down around `baseY` (see platformHeight); a `spring` is a spring pad
 * trampoline standing on its host platform (or the road), `pressed` the time it last launched someone. */
export interface RunnerPlatform { id: number; x: number; y: number; width: number; oneWay?: true; baseY?: number; bob?: number; phase?: number; spring?: boolean; pressed?: number; }
export type RunnerEvent = 'jump' | 'double' | 'land' | 'slide' | 'hit' | 'fall' | 'coin' | 'bounce' | 'heal' | 'mount' | 'dismount' | 'break' | 'clear' | 'fever' | 'feverEnd' | 'warning' | 'power' | 'shield' | 'deliver' | 'pop' | 'spring' | 'streak' | 'stomp';
export interface RunnerFeedback { kind: RunnerEvent; x: number; y: number; value: number; }
export interface RunnerSnapshot { version: 49; model: Record<string, unknown>; }
export const RUNNER = Object.freeze({ speed: 470, gravity: 1800, jump: 720, halfWidth: 29,
    height: 90, slideHeight: 39, barBottom: 58, pixelsPerMeter: 20, step: 1 / 120,
    rideHeight: 64, rideDuration: 6 });
/** Landing and leaving a platform share the same foot support. Input grace is in seconds. */
export const CONTROL = Object.freeze({ footHalfWidth: 12, jumpBuffer: .12, coyote: .1 });
/** One delivery: the course ends at the customer's door; the last stretch before it stays clear for the hand-off.
 * The final score adds a delivery bonus and a customer rating (stars by mistakes) to the running score. */
export const COURSE = Object.freeze({ meters: 4000, runway: 60, tiers: 5, topSpeed: 820,
    deliveryBonus: 2000, starBonus: [0, 0, 800, 2000] as readonly number[] });
export const FINISH_X = COURSE.meters * RUNNER.pixelsPerMeter;
/** Two-route sections: rooftops at `roofY`, above a single jump's reach. The climb is a jump `climbLead`
 * seconds before the first roof with the second jump at its apex (`climbDouble` seconds in). */
export const ROUTE = Object.freeze({ roofY: 200, climbLead: .85, climbDouble: .4 });
/** Height of a ground jump `t` seconds after takeoff; coins trace this arc to show the timing. */
export function jumpHeight(t: number): number { return RUNNER.jump * t - RUNNER.gravity / 2 * t * t; }
/** Height along the rooftop climb: a jump, then the second jump at its apex. */
export function climbHeight(t: number): number { return t < ROUTE.climbDouble ? jumpHeight(t) : jumpHeight(ROUTE.climbDouble) + jumpHeight(t - ROUTE.climbDouble); }
/** Seconds after a single jump's takeoff at which it comes back down through height `rise`. */
export function singleLanding(rise: number): number { return (RUNNER.jump + Math.sqrt(RUNNER.jump * RUNNER.jump - 2 * RUNNER.gravity * rise)) / RUNNER.gravity; }
/** The same for a jump with the second jump at its apex. */
export function doubleLanding(rise: number): number { return ROUTE.climbDouble + singleLanding(rise - jumpHeight(ROUTE.climbDouble)); }
/** Coin guidance is derived from the complete collision span, including both player edges. */
export function obstacleJumpGuide(o: RunnerObstacle): { lead: number; second: number; height: (t: number) => number } {
    const speed = baseSpeedAt(o.originX ?? o.x), clearance = RUNNER.jump * RUNNER.jump - 2 * RUNNER.gravity * o.height;
    const above = clearance > 0 ? 2 * Math.sqrt(clearance) / RUNNER.gravity : 0;
    const double = o.kind === 'gap' ? o.width / speed > 2 * RUNNER.jump / RUNNER.gravity - .24
        : above < (o.width + 2 * RUNNER.halfWidth) / speed + .10;
    const second = double ? .28 : 0;
    const flight = 2 * RUNNER.jump / RUNNER.gravity;
    const lead = o.kind === 'gap' ? (double ? .16 : (flight - o.width / speed) / 2) - RUNNER.halfWidth / speed
        : double ? .48 : (flight - (o.width + 2 * RUNNER.halfWidth) / speed) / 2;
    return { lead, second,
        height: t => second > 0 && t > second ? jumpHeight(second) + jumpHeight(t - second) : jumpHeight(t) };
}
/** Floating-platform stretches with no road: platform levels (all within the fixed camera's view, low
 * enough that a double jump from the top one stays on screen) and the reaction margin left on every hop. */
export const SKYWAY = Object.freeze({ levels: [70, 130, 190] as readonly number[], margin: .16, doubleExtra: .14,
    // Floating platforms: amplitude, period and the highest climb (to their top) a single jump is asked for.
    bob: 26, bobPeriod: 2.2, bobReach: 110 });
export function platformHeight(p: RunnerPlatform, time: number): number {
    return p.bob ? (p.baseY ?? p.y) + p.bob * Math.sin((time / SKYWAY.bobPeriod + (p.phase ?? 0)) * Math.PI * 2) : p.y;
}
/** spring pad trampolines: running into the spring pad or coming down on them launches a big arc from the spring
 * pad, with one air jump left (it reaches golden coins on the way down). `pad` is the spring pad' width, `top`
 * the launch pad's height above the surface they stand on, `inset` their distance from the host platform's
 * end, `run` the seconds of platform before them, `extend` the most that air jump can stretch the flight.
 * The launch is low enough that an air jump at its apex still stays in the fixed camera's view. */
export const SPRING = Object.freeze({ launch: 900, pad: 96, top: 60, inset: 20, run: .55, extend: .9 });
export function springHeight(t: number): number { return SPRING.launch * t - RUNNER.gravity / 2 * t * t; }
export function springLanding(rise: number): number { return (SPRING.launch + Math.sqrt(SPRING.launch * SPRING.launch - 2 * RUNNER.gravity * rise)) / RUNNER.gravity; }
/** Every tenth link of a clean chain pays coins. */
export const STREAK = Object.freeze({ every: 10, coins: 10 });
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
    combo = 0; bestCombo = 0; bonus = 0; bounces = 0; mounts = 0; springs = 0; stomps = 0;
    fevers = 0; fever = 0; feverTime = 0;
    mounted = 0; rideTime = 0; hurtAge = 10; breakAge = 10; surfaceY = 0;
    magnetTime = 0; shieldCharges = 0;
    /** Seconds left of a launcher launch, the pad height it left from, and launchers placed so far. */
    launchTime = 0; launchY = 0; launchers = 0;
    readonly powers: RunnerPower[] = [];
    readonly obstacles: RunnerObstacle[] = [];
    readonly pickups: RunnerCoin[] = [];
    readonly events: RunnerEvent[] = [];
    readonly feedbacks: RunnerFeedback[] = [];
    readonly devices: RunnerDevice[] = [];
    readonly platforms: RunnerPlatform[] = [];
    private accumulated = 0;
    private sequence = 0;
    giantTime = 0; bridgeTime = 0;
    seed = 1977;
    lastHit: HitCause = '';
    lastPower: PowerKind = 'magnet';
    readonly sections: RunnerSection[] = [];
    private lastPowerSection = -3;
    private lastPowerKind = '';
    private nextX = 1100;
    private randomState: number;
    private section = 0;
    private jumpBuffer = 0;
    private coyote = 0;
    private pickupsDirty = false;
    private recentPatterns: string[] = [];
    private planning = false;

    constructor(seed = 1977) {
        this.seed = this.randomState = seed >>> 0 || 1;
        this.generateAhead();
    }
    /** Full local continuation, including RNG, trap clocks and the unfinished fixed step. */
    snapshot(): RunnerSnapshot {
        const model = JSON.parse(JSON.stringify(this)) as Record<string, unknown>;
        model.events = []; model.feedbacks = []; model.slideHeld = false; model.jumpBuffer = 0;
        return { version: 49, model };
    }
    /** Earlier checkpoints belong to retired rules (endless course, old powers) and start a fresh run. */
    static restore(value: unknown): MemeRunnerModel | undefined {
        const saved = value as RunnerSnapshot;
        if (Number(saved?.version) !== 49 || !saved.model || typeof saved.model !== 'object') return undefined;
        const data = JSON.parse(JSON.stringify(saved.model)) as Record<string, unknown>, model = new MemeRunnerModel(1);
        if (typeof data.accumulated === 'number' && data.accumulated > -1e-8) data.accumulated = Math.max(0, data.accumulated);
        const validNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e13;
        const optional = (v: unknown): boolean => v === undefined || validNumber(v);
        const rows = (key: string, limit: number, fields: string[], kinds?: string[]): boolean => {
            const list = data[key];
            return Array.isArray(list) && list.length <= limit && list.every(row => row && typeof row === 'object'
                && fields.every(field => validNumber(row[field])) && (!kinds || kinds.indexOf(row.kind) >= 0)
                && optional(row.originY) && optional(row.bottom) && optional(row.originBottom) && optional(row.pops)
                && optional(row.baseY) && optional(row.bob) && optional(row.phase) && optional(row.pressed)
                && (row.spring === undefined || typeof row.spring === 'boolean') && (row.oneWay === undefined || row.oneWay === true));
        };
        if (!rows('obstacles', 64, ['id', 'x', 'width', 'height'], OBSTACLE_KINDS as string[])
            || !rows('pickups', 768, ['id', 'x', 'y']) || !rows('powers', 32, ['id', 'x', 'y'], Array.from(POWER_KINDS))
            || !rows('platforms', 32, ['id', 'x', 'y', 'width'])
            || !rows('devices', 32, ['id', 'x', 'y', 'width', 'height', 'age', 'visibleAge', 'actionAge', 'offset'], ['launcher', 'cart', 'saw', 'hopper', 'compressor', 'stomper', 'electric'])
            || !rows('sections', 12, ['id', 'tier', 'start', 'dangerEnd', 'end'])
            || !Array.isArray(data.recentPatterns) || data.recentPatterns.length > 4 || !data.recentPatterns.every(v => typeof v === 'string')
            || data.ended !== false || data.delivered !== false) return undefined;
        for (const key of Object.keys(model)) {
            const original = model[key], incoming = data[key];
            if (typeof original === 'number' ? !validNumber(incoming) : typeof original === 'boolean' ? typeof incoming !== 'boolean'
                : typeof original === 'string' ? typeof incoming !== 'string' : !Array.isArray(incoming)) return undefined;
        }
        if (Number(data.x) < 0 || Number(data.time) < 0 || Number(data.mistakes) < 0 || Number(data.mistakes) > 2
            || !Number.isInteger(data.mistakes) || Number(data.x) >= FINISH_X || Number(data.nextX) < Number(data.x) || Number(data.accumulated) < 0 || Number(data.accumulated) >= RUNNER.step
            || Number(data.fever) < 0 || Number(data.fever) > 1 || Number(data.feverTime) < 0 || Number(data.feverTime) > SKILL.feverDuration
            || Number(data.launchTime) < 0 || Number(data.launchTime) > LAUNCHER.launch
            || Number(data.giantTime) < 0 || Number(data.giantTime) > GIANT.duration || Number(data.bridgeTime) < 0 || Number(data.bridgeTime) > POWER_DURATION
            || !Number.isInteger(data.shieldCharges) || Number(data.shieldCharges) < 0 || Number(data.shieldCharges) > 1
            || !Number.isInteger(data.seed) || Number(data.seed) <= 0 || Number(data.seed) > 0xFFFFFFFF || POWER_KINDS.indexOf(data.lastPower as PowerKind) < 0
            || !Number.isInteger(data.launchers) || Number(data.launchers) < 0 || Number(data.launchers) > LAUNCHER.meters.length) return undefined;
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
    get speed(): number { return this.baseSpeed * (this.feverTime > 0 ? SKILL.feverSpeed : this.launchTime > 0 ? LAUNCHER.speed : this.mounted ? 1.12 : 1); }
    /** Fever and the launcher launch are uncontrolled flights. */
    get flying(): boolean { return this.feverTime > 0 || this.launchTime > 0; }
    get baseSpeed(): number { return baseSpeedAt(this.x); }
    get multiplier(): number { return 1 + Math.min(4, Math.floor(this.combo / 5)); }
    get height(): number { return this.sliding ? RUNNER.slideHeight : RUNNER.height; }

    jump(): boolean {
        // Fever and the launcher launch are uncontrolled flights; inputs return once they end.
        if (this.ended || this.flying || (!this.grounded && this.y < -20)) return false;
        // A slide may be cancelled by jumping, only after the overhead obstacle is clear.
        // The next landing may be on a roof, so buffering must not depend on the old surface height.
        if (this.jumps >= 2 || !this.hasHeadroom()) { this.jumpBuffer = CONTROL.jumpBuffer; return false; }
        this.jumps = this.grounded || this.coyote > 0 ? 1 : Math.max(1, this.jumps) + 1;
        this.coyote = 0; this.jumpBuffer = 0;
        this.grounded = this.sliding = false;
        this.vy = RUNNER.jump; this.jumpAge = 0;
        this.events.push(this.jumps === 2 ? 'double' : 'jump');
        return true;
    }
    holdSlide(held: boolean): void { this.slideHeld = held; }
    clearInput(): void { this.slideHeld = false; this.jumpBuffer = 0; }
    hasHeadroom(): boolean {
        return !this.obstacles.some(o => !o.broken && (o.kind === 'bar' || o.kind === 'drone-high') && this.overlaps(o)
            && this.y < (o.bottom ?? RUNNER.barBottom) + o.height
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
        this.coyote = Math.max(0, this.coyote - dt);
        if (this.jumpBuffer > 0 && this.jumps < 2 && this.hasHeadroom()) this.jump();
        this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.magnetTime = Math.max(0, this.magnetTime - dt);
        const wasGiant = this.giantTime > 0;
        this.giantTime = Math.max(0, this.giantTime - dt); this.bridgeTime = Math.max(0, this.bridgeTime - dt);
        if (wasGiant && this.giantTime === 0) this.invulnerable = Math.max(this.invulnerable, .9);
        if (this.feverTime > 0) {
            this.feverTime = Math.max(0, this.feverTime - dt); this.fever = this.feverTime / SKILL.feverDuration;
            // A fixed-altitude flight: no gravity, no jumps or slides; everything passed beneath is smashed.
            this.grounded = this.sliding = false; this.vy = 0; this.jumps = 2; this.coyote = this.jumpBuffer = 0;
            this.y += (SKILL.feverAltitude - this.y) * Math.min(1, dt * 8);
            // The flight then falls freely; the grace covers the descent, and pits ahead were bridged in flight.
            if (this.feverTime === 0) { this.invulnerable = Math.max(this.invulnerable, SKILL.feverGrace); this.jumps = 1; this.events.push('feverEnd'); }
        }
        if (this.launchTime > 0) {
            // A scripted arc over whatever lies ahead; it hands back to gravity, descending, at pad height.
            this.launchTime = Math.max(0, this.launchTime - dt);
            this.grounded = this.sliding = false; this.jumps = 2; this.coyote = this.jumpBuffer = 0;
            const y = this.launchY + launchHeight(1 - this.launchTime / LAUNCHER.launch);
            this.vy = (y - this.y) / dt; this.y = y;
            if (this.launchTime === 0) this.jumps = 1;
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
        // Floating platforms carry whoever stands on them.
        for (const p of this.platforms) if (p.bob) {
            const y = platformHeight(p, this.time);
            if (this.grounded && !p.spring && Math.abs(p.y - this.surfaceY) < 1 && this.supportsFeet(p)) {
                this.surfaceY = y; this.y = y + (this.mounted ? RUNNER.rideHeight : 0);
            }
            p.y = y;
        }
        const pit = this.obstacles.find(o => o.kind === 'gap' && !o.bridged && this.x > o.x && this.x < o.x + o.width);
        const ledge = this.platforms.find(p => !p.spring && this.supportsFeet(p) && Math.abs(p.y - this.surfaceY) < 1);
        if (this.grounded && ((this.surfaceY > 0 && !ledge) || (this.surfaceY === 0 && pit))) {
            this.grounded = false; this.jumps = 1; this.vy = 0; this.coyote = CONTROL.coyote;
        }
        const spring = this.grounded && !this.mounted ? this.platforms.find(p => p.spring && Math.abs(p.y - this.surfaceY) < 1 && this.padAt(p)) : undefined;
        if (spring) this.launchSpring(spring);
        if (!this.grounded && !this.flying) {
            this.vy -= RUNNER.gravity * dt;
            this.y += this.vy * dt;
            const ride = this.mounted ? RUNNER.rideHeight : 0;
            const landings = this.platforms.filter(p => !p.spring && this.supportsFeet(p)
                // Compare each foot position with the surface at the SAME instant. An ascending
                // platform can cross the old foot position during this step; using its new height
                // for both samples loses that one-way crossing and drops the runner through it.
                && oldY >= platformHeight(p, this.time - dt) + ride && this.y <= p.y + ride);
            const floor = landings.length ? Math.max(...landings.map(p => p.y)) : !pit ? 0 : -Infinity;
            // In the air, touching the spring pad anywhere between their foot and their heads fires them.
            const pad = !this.mounted && !this.flying && this.platforms.find(p => p.spring && this.padAt(p) && this.y <= p.y + SPRING.top && this.y >= p.y - 2);
            if (this.touchDevice(oldY)) {
                // A pad bounce or mounting a cart replaces ordinary landing.
            } else if (pad) {
                this.launchSpring(pad);
            } else if (this.y <= floor + ride && oldY >= floor + ride - 12 && this.vy <= 0) {
                this.surfaceY = floor; this.y = floor + ride; this.vy = 0; this.grounded = true; this.jumps = 0;
                this.sliding = !this.mounted && this.slideHeld; this.landAge = 0; this.events.push('land');
                if (this.jumpBuffer > 0) this.jump();
            } else if (this.y < -150) {
                const fallen = pit ?? this.obstacles.find(o => o.kind === 'gap' && this.x >= o.x && this.x <= o.x + o.width + 200);
                // The pit that caught the runner is a mistake, never a clean pass.
                if (fallen) fallen.hit = fallen.scored = true;
                this.damage('fall');
                // A fall in a floating-platform stretch resumes on its next platform; elsewhere past the pit.
                const next = fallen && this.platforms.find(p => !p.spring && p.x > this.x && p.x < fallen.x + fallen.width);
                this.x = next ? next.x + 40 : Math.max(this.x, (fallen ? fallen.x + fallen.width : this.x) + 100);
                this.mounted = 0; this.rideTime = 0; this.surfaceY = next ? next.y : 0;
                this.y = this.surfaceY; this.vy = 0; this.grounded = true; this.jumps = 0; this.landAge = 0;
                this.sliding = this.slideHeld;
            }
        }
        // Synchronize ridden/following actors after physics, avoiding a one-step
        // vertical lag between the cart's back and its rider during a jump.
        if (this.sliding && !wasSliding) this.events.push('slide');
        this.updateDevices(dt, oldY);
        for (const o of this.obstacles) {
            // Fever and the cart smash what they touch (broken), the launcher launch and Fever's planks carry
            // the runner past (ghosted, bridged): only the player's own jumps and slides count as a clear.
            if (this.launchTime > 0 && !o.scored && (o.kind === 'gap' ? this.x >= o.x : this.overlaps(o))) o.ghosted = true;
            if (!o.scored && this.x - RUNNER.halfWidth >= o.x + o.width) {
                o.scored = true; if (!o.hit && !o.ghosted && !o.broken && !o.bridged) this.clear();
            }
            if (o.kind === 'gap' || o.hit || o.broken || o.kind.startsWith('drone-') && dronePhase(o.visibleAge ?? -1) !== 'flight' || !this.overlaps(o)) continue;
            if (o.kind === 'steam' && steamPhase(o.visibleAge ?? -1) !== 'active') continue;
            if (this.feverTime > 0) {
                o.broken = o.scored = true; this.breakAge = 0; this.reward('break', o.x + o.width / 2, Math.min(o.height, 100), 40, false); continue;
            }
            const bottom = o.bottom ?? (o.kind === 'bar' ? RUNNER.barBottom : 0);
            if (this.giantTime > 0 && this.giantBreaks(o.kind) && this.y < bottom + o.height && this.y + this.height > bottom) {
                o.broken = o.scored = true; this.breakAge = 0;
                this.reward('break', o.x + o.width / 2, Math.min(o.height, 100), 40, false); continue;
            }
            if (this.mounted && (o.kind === 'wall' || o.kind === 'crate' || o.kind === 'tower' || o.kind === 'roller' || o.kind === 'drop-crate')
                && this.y - RUNNER.rideHeight < bottom + o.height && this.y + this.height > bottom) {
                o.broken = o.scored = true; this.breakAge = 0; this.reward('break', o.x + o.width / 2, o.height / 2, 60, false); continue;
            }
            if (this.y < bottom + o.height && this.y + this.height > bottom) {
                if (this.invulnerable > 0) o.ghosted = true;
                else { o.hit = true; this.damage('hit', o.kind); }
            }
        }
        for (const power of this.powers) {
            // Only pickups and coins can be magnetized. Enemies, pads and warning events never move.
            if (!power.taken && this.magnetTime > 0 && Math.hypot(power.x - this.x, power.y - this.y - 45) < 270) {
                const pull = Math.min(1, dt * 12); power.x += (this.x - power.x) * pull; power.y += (this.y + 45 - power.y) * pull;
            }
            if (!power.taken && Math.abs(power.x - this.x) < 48 && Math.abs(power.y - this.y - this.height / 2) < 65) {
                power.taken = true;
                this.activatePower(power.kind);
                this.events.push('power'); this.feedbacks.push({ kind: 'power', x: power.x, y: power.y, value: POWER_KINDS.indexOf(power.kind) });
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
        // Compressor's waves are appended out of order, so cull every passed obstacle rather than just the head.
        for (let i = this.obstacles.length - 1; i >= 0; i--) if (this.obstacles[i].x + this.obstacles[i].width < this.x - 700) this.obstacles.splice(i, 1);
        for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].taken || this.pickups[i].x < this.x - 700) this.pickups.splice(i, 1);
        while (this.powers.length && (this.powers[0].taken || this.powers[0].x < this.x - 700)) this.powers.shift();
        for (let i = this.devices.length - 1; i >= 0; i--) if (!this.devices[i].active || this.devices[i].x + this.devices[i].width < this.x - 700) this.devices.splice(i, 1);
        while (this.platforms.length && this.platforms[0].x + this.platforms[0].width < this.x - 700) this.platforms.shift();
        while (this.sections.length && this.sections[0].end < this.x - 700) this.sections.shift();
    }
    /** A one-shot pickup changes capability, never grants the coins it has not actually collected. */
    private activatePower(kind: PowerKind): void {
        this.lastPower = kind;
        if (kind === 'magnet') this.magnetTime = POWER_DURATION;
        else if (kind === 'shield') this.shieldCharges = 1;
        else if (kind === 'giant') this.giantTime = GIANT.duration;
        else if (kind === 'bridge') this.bridgeTime = POWER_DURATION;
        else if (kind === 'flight') {
            if (this.feverTime > 0) { this.feverTime = SKILL.feverDuration; this.fever = 1; }
            else this.addFever(1);
        }
        else for (const coin of this.pickups) {
            if (!coin.taken && Math.abs(coin.x - this.x) <= 680) coin.golden = true;
        }
    }
    private giantBreaks(kind: ObstacleKind): boolean {
        return ['crate', 'tower', 'wall', 'roller', 'drop-crate', 'bar'].indexOf(kind) >= 0;
    }
    /** The runner's body overlaps the spring pad horizontally (and they have not just fired). */
    private padAt(p: RunnerPlatform): boolean {
        return this.x + RUNNER.halfWidth >= p.x && this.x - RUNNER.halfWidth <= p.x + p.width && this.time - (p.pressed ?? -10) > .2;
    }
    /** A compressed spring fires a big arc from its pad with one air jump left. */
    private launchSpring(p: RunnerPlatform): void {
        this.grounded = this.sliding = false; this.y = p.y + SPRING.top; this.vy = SPRING.launch; this.jumps = 1; this.jumpAge = 0;
        this.coyote = this.jumpBuffer = 0; p.pressed = this.time; this.springs++;
        this.events.push('spring'); this.feedbacks.push({ kind: 'spring', x: this.x, y: p.y + SPRING.top, value: 0 });
    }
    /** A hazard passed cleanly: the chain grows and Fever fills. Feedback rises from the runner. */
    private clear(x = this.x, y = Math.max(0, this.y) + this.height + 20): void {
        this.reward('clear', x, y, SKILL.clearPoints, true); this.addFever(SKILL.clearGain);
    }
    private addFever(amount: number): void {
        if (this.feverTime > 0 || this.ended) return;
        this.fever = Math.min(1, Math.round((this.fever + amount) * 1e8) / 1e8);
        if (this.fever < 1) return;
        // Fever pays in points and a safe smashing window; mistakes are never refunded,
        // which is what keeps a full delivery rare.
        // A stunt can fill the gauge mid-launch: Fever's own flight takes over from the launcher's arc.
        this.feverTime = SKILL.feverDuration; this.fevers++; this.launchTime = 0; this.dismount();
        this.events.push('fever'); this.feedbacks.push({ kind: 'fever', x: this.x, y: Math.max(0, this.y) + 60, value: 0 });
    }
    private dismount(): void {
        const ride = this.devices.find(c => c.id === this.mounted);
        if (!ride) return;
        this.mounted = 0; this.rideTime = 0; ride.actionAge = 0;
        if (this.grounded) { this.grounded = false; this.vy = 280; this.jumps = 1; this.jumpAge = .1; }
        this.events.push('dismount');
    }
    private overlaps(o: RunnerObstacle): boolean {
        return this.x + RUNNER.halfWidth > o.x && this.x - RUNNER.halfWidth < o.x + o.width;
    }
    private supportsFeet(p: RunnerPlatform): boolean {
        return this.x + CONTROL.footHalfWidth > p.x && this.x - CONTROL.footHalfWidth < p.x + p.width;
    }
    private damage(event: 'hit' | 'fall', cause: HitCause = event === 'fall' ? 'fall' : ''): void {
        if (this.flying || event === 'hit' && this.invulnerable > 0) return;
        if (event === 'hit' && this.shieldCharges > 0) {
            this.shieldCharges = 0; this.invulnerable = 1.2; this.events.push('shield');
            this.feedbacks.push({ kind: 'shield', x: this.x, y: Math.max(0, this.y) + 45, value: 0 }); return;
        }
        this.lastHit = cause; this.mistakes++; this.hits++; this.fever = Math.max(0, this.fever - SKILL.hitLoss);
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
            const previous = COURSE_PATTERNS.find(p => p.id === this.recentPatterns[this.recentPatterns.length - 1]);
            const choices = COURSE_PATTERNS.filter(p => p.tier <= tier && (this.section >= 2 || ['rhythm', 'terraces', 'loading-dock', 'gaps'].indexOf(p.id) >= 0)
                && this.recentPatterns.indexOf(p.id) < 0 && p.family !== previous?.family);
            const available: string[] = [];
            for (const p of choices) for (let i = 0; i < p.weight; i++) available.push(p.id);
            // The launcher is never left to chance: it comes up once at each fixed mark.
            const launcherDue = this.launchers < LAUNCHER.meters.length && start >= LAUNCHER.meters[this.launchers] * RUNNER.pixelsPerMeter;
            // The opening teaches one action at a time before randomized combinations take over.
            const opening = ['rhythm', 'alternating', 'gaps'];
            let pattern = this.section < opening.length ? opening[this.section] : launcherDue ? 'bounce' : this.section % 4 === 3 ? 'rest'
                : this.section % 7 === 5 ? 'power-run' : available[Math.floor(this.random() * available.length)] ?? 'rest';
            if (launcherDue) this.launchers++;
            this.section++;
            const lists = [this.obstacles, this.devices, this.platforms, this.pickups, this.powers];
            const counts = lists.map(list => list.length);
            this.planning = true;
            // Seconds of travel, rather than fixed pixels, keep combinations fair as speed increases.
            const at = (seconds: number): number => start + seconds * speed;
            const obstacle = (kind: ObstacleKind, seconds: number): void => {
                this.addObstacle(kind, at(seconds));
                const o = this.obstacles[this.obstacles.length - 1];
                if (kind === 'gap') o.width = speed * (.48 + Math.min(4, tier) * .035 + this.random() * .08);
                if (kind === 'bar') o.width = 224;
            };
            const tempo = 1.52 - tier * .09;
            let duration = 4.5;
            if (pattern === 'rest') {
                for (let i = 0; i < 14; i++) this.pickups.push({ id: ++this.sequence, x: at(i * .18), y: 45, taken: false, golden: i % 4 === 3 });
                duration = 3.1;
            } else if (pattern === 'power-run') {
                obstacle('crate', 0); obstacle('wall', 1.7); obstacle('bar', 3.5); obstacle('gap', 5.5);
                this.powers.push({ id: ++this.sequence, kind: this.section % 2 ? 'giant' : 'flight', x: at(-.75), y: 48, taken: false });
                duration = 7.6;
            } else if (pattern === 'terraces') {
                duration = this.addTerraces(at, speed, tier);
            } else if (pattern === 'stomp-yard') {
                // A stomp offers another arc; staying on the clear ground is also a complete route.
                this.addDevice('stomper', at(.45)); this.addDevice('stomper', at(2.5));
                this.addPlatform(at(3.4), 100, speed * 1.8, false);
                this.coinArc(at(.08), 0, speed, [.2, .4, .6], true);
                this.coinArc(at(2.15), 0, speed, [.2, .4, .6], true); duration = 6.8;
            } else if (pattern === 'electric-yard') {
                this.addDevice('stomper', at(0)); this.addDevice('electric', at(2.1));
                obstacle('bar', 4.1); duration = 6.6;
            } else if (pattern === 'stomp-cross') {
                this.addDevice('stomper', at(0)); obstacle('gap', .55);
                this.obstacles[this.obstacles.length - 1].width = speed * .35;
                obstacle('bar', 2.8); duration = 5.2;
            } else if (pattern === 'pit-slide') {
                obstacle('gap', 0); obstacle('bar', 2.0); obstacle('crate', 3.8); duration = 6;
            } else if (pattern === 'slide-pit') {
                obstacle('bar', 0); obstacle('gap', 1.5); obstacle('crate', 3.3); duration = 5.5;
            } else if (pattern === 'rhythm') {
                const count = tier === 0 ? 3 : 4;
                for (let i = 0; i < count; i++) obstacle(tier >= 2 && this.random() < .4 ? 'roller' : 'crate', i * tempo);
                duration = tempo * (count - 1) + 1.6;
            } else if (pattern === 'alternating' || pattern === 'weave') {
                const reverse = pattern === 'weave';
                obstacle(reverse ? 'bar' : 'crate', 0); obstacle(reverse ? 'crate' : 'bar', tempo);
                obstacle(reverse ? 'bar' : tier === 0 ? 'crate' : 'tower', tempo * 2); duration = tempo * 2 + 2;
            } else if (pattern === 'steps') {
                obstacle('tower', 0); obstacle(this.random() < .5 ? 'wall' : 'tower', 1.65);
                obstacle('gap', 3.3); duration = 5;
            } else if (pattern === 'gaps') {
                // Islands between pits shrink stretch by stretch, never below room to land and jump again;
                // from tier 2 there is a third pit.
                const isle = .95 - Math.min(4, tier) * .08, count = tier >= 2 ? 3 : 2;
                let t = 0;
                for (let i = 0; i < count; i++) { obstacle('gap', t); t += this.obstacles[this.obstacles.length - 1].width / speed + isle; }
                obstacle('crate', t + .25); duration = t + 1.7;
            } else if (pattern === 'moving') {
                obstacle('roller', 0); obstacle('crate', 1.5); this.addDevice('saw', at(3)); duration = 4.8;
            } else if (pattern === 'steam') {
                obstacle('steam', 0); obstacle('bar', 1.7); obstacle('roller', 3); duration = 4.7;
            } else if (pattern === 'roof') {
                duration = this.addSkyline(at, speed, tier);
            } else if (pattern === 'skyway') {
                duration = this.addSkyway(at, speed, tier);
            } else if (pattern === 'springChain') {
                duration = this.addSpringChain(at, speed, tier);
            } else if (pattern === 'thorns') {
                obstacle('spikes', 0); obstacle('bar', 1.6); obstacle('spikes', 3.1); duration = 5;
            } else if (pattern === 'drone') {
                obstacle('drone-low', 0); obstacle('drone-high', 2); obstacle('drone-low', 4); duration = 6;
            } else if (pattern === 'compressor') {
                // It settles at about at(COMPRESSOR_ATTACK): four pulses, the compressor itself, then a gate.
                this.addDevice('compressor', at(0)); obstacle('bar', COMPRESSOR_ATTACK + 1.3); duration = COMPRESSOR_ATTACK + 2.4;
            } else if (pattern === 'ride') {
                this.addDevice('cart', at(0)); obstacle('wall', 1.1); obstacle('wall', 2.65);
                obstacle('gap', 4.25); obstacle('wall', 5.8); duration = 9.5;
            } else if (pattern === 'hopper') {
                this.addDevice('hopper', at(0)); obstacle('crate', 1.3); obstacle('gap', 2.8);
                obstacle('bar', 4.3); duration = 5.8;
            } else if (pattern === 'cargo-yard') {
                obstacle('drop-crate', 0); obstacle('bar', 1.4); obstacle('drop-crate', 2.9);
                obstacle('gap', 4.4); duration = 6.2;
            } else if (pattern === 'saw-slalom') {
                this.addDevice('saw', at(0)); obstacle('bar', 1.5);
                this.addDevice('saw', at(3)); obstacle('tower', 4.6); duration = 6.2;
            } else if (pattern === 'air-freight') {
                obstacle('drone-high', 0); obstacle('drop-crate', 2.2);
                obstacle('drone-low', 4.4); duration = 6.3;
            } else if (pattern === 'loading-dock') {
                // Optional upper route: jump onto the loading dock for gold, or dodge cargo below.
                obstacle('drop-crate', 0); this.addPlatform(at(1), 100, speed * 2.2);
                this.addObstacle('bar', at(1.9), 100); this.coinArc(at(3.2), 100, speed, [.2, .4, .6], true);
                obstacle('roller', 4.3); duration = 6;
            } else {
                // Missing the launcher leaves an ordinary stretch the launch would have flown over.
                this.addLauncherSection(at(0), speed); obstacle('crate', 1.2); obstacle('gap', 2.5); obstacle('bar', 3.8);
                duration = 5.2;
            }
            this.planning = false;
            let dangerEnd = Math.max(start, ...this.obstacles.slice(counts[0]).map(o => o.x + o.width + (o.kind.startsWith('drone-') ? speed * DRONE.warning : 0)),
                ...this.devices.slice(counts[1]).map(d => d.x + d.width + (d.kind === 'compressor' ? speed * (COMPRESSOR_ATTACK + 1) : 0)),
                ...this.platforms.slice(counts[2]).map(p => p.x + p.width));
            const exitSpeed = baseSpeedAt(dangerEnd + COURSE.topSpeed * 1.5);
            let end = Math.max(at(duration), dangerEnd + exitSpeed * 1.5);
            // Reserve the fixed rescue stop before choosing a fragment; a long skyway must not
            // postpone it by an entire section. The fallback fills only the available safe approach.
            const sectionLimit = launcherDue || this.launchers >= LAUNCHER.meters.length ? limit
                : Math.min(limit, LAUNCHER.meters[this.launchers] * RUNNER.pixelsPerMeter);
            if (end > sectionLimit || !this.validFragment(counts, speed)) {
                // Commit a whole validated fragment. Never chop its last landing off at the finish line.
                lists.forEach((list, i) => { list.length = counts[i]; });
                if (pattern === 'bounce') this.launchers--;
                pattern = 'rest';
                dangerEnd = start; end = Math.min(sectionLimit, at(3));
                for (let cx = start; cx < end - 60; cx += 90) this.pickups.push({ id: ++this.sequence, x: cx, y: 45, taken: false });
            } else {
                // Terrain and danger are final before the guide is laid. Skyways own their multi-hop paths.
                for (const o of this.obstacles.slice(counts[0])) {
                    if (o.kind !== 'gap' || !this.platforms.slice(counts[2]).some(p => p.x > o.x && p.x < o.x + o.width)) this.guideCoins(o);
                }
                if (pattern === 'power-run') {
                    this.lastPowerSection = this.section; this.lastPowerKind = this.powers[this.powers.length - 1].kind;
                } else if (this.section > 3 && this.section - this.lastPowerSection >= 2 && this.random() < .7) {
                    const kinds: PowerKind[] = pattern === 'gaps' || pattern === 'slide-pit' || pattern === 'pit-slide' ? ['bridge', 'shield', 'magnet']
                        : ['roof', 'skyway', 'springChain', 'terraces', 'rest', 'stomp-yard'].indexOf(pattern) >= 0 ? ['magnet', 'convert', 'shield', 'flight']
                            : ['shield', 'giant', 'convert', 'magnet'];
                    const pool = kinds.filter(k => k !== this.lastPowerKind), kind = pool[Math.floor(this.random() * pool.length)];
                    this.powers.push({ id: ++this.sequence, kind, x: at(-.7), y: 48, taken: false });
                    this.lastPowerSection = this.section; this.lastPowerKind = kind;
                }
            }
            this.recentPatterns.push(pattern); if (this.recentPatterns.length > 4) this.recentPatterns.shift();
            this.sections.push({ id: this.section, pattern, tier, start, dangerEnd, end });
            while (this.sections.length > 12 || this.sections[0]?.end < this.x - 700) this.sections.shift();
            this.nextX = end;
            this.pickupsDirty = true;
        }
        // Sections never spill into the runway before the customer's door.
        if (generated) for (const list of [this.obstacles, this.devices, this.platforms] as Array<Array<{ x: number; width: number }>>) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].x + list[i].width > limit) list.splice(i, 1);
        }
        if (generated) for (const list of [this.pickups, this.powers] as Array<Array<{ x: number }>>) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].x > limit) list.splice(i, 1);
        }
        if (this.pickupsDirty) { this.pickups.sort((a, b) => a.x - b.x); this.pickupsDirty = false; }
    }
    /** Cheap generation guard; every authored compound is also exercised by the simulation tests. */
    private validFragment(counts: number[], speed: number): boolean {
        const obstacles = this.obstacles.slice(counts[0]), platforms = this.platforms.slice(counts[2]);
        for (const list of [obstacles, platforms, this.devices.slice(counts[1])]) {
            if (list.some(o => !Number.isFinite(o.x) || !Number.isFinite(o.width) || o.width <= 0)) return false;
        }
        if (platforms.some(p => !p.spring && p.width < 2 * RUNNER.halfWidth + speed * .28)) return false;
        for (const gap of obstacles.filter(o => o.kind === 'gap')) {
            const route = platforms.filter(p => !p.spring && p.x >= gap.x && p.x < gap.x + gap.width).sort((a, b) => a.x - b.x);
            let edge = gap.x, low = 0;
            for (const p of route) {
                const rise = p.y + (p.bob ?? 0) - low;
                if (rise > jumpHeight(ROUTE.climbDouble) + RUNNER.jump * RUNNER.jump / (2 * RUNNER.gravity)) return false;
                const pad = platforms.some(s => s.spring && s.x <= edge && s.x + s.width >= edge - 200);
                const reach = pad ? SPRING.launch / RUNNER.gravity + singleLanding(rise - SPRING.launch * SPRING.launch / (2 * RUNNER.gravity) - SPRING.top)
                    : doubleLanding(rise);
                if ((p.x - edge + 2 * RUNNER.halfWidth) / speed + .12 > reach) return false;
                edge = p.x + p.width; low = p.y - (p.bob ?? 0);
            }
            if ((gap.x + gap.width - edge + 2 * RUNNER.halfWidth) / speed + .12 > doubleLanding(-low)) return false;
        }
        return true;
    }
    /** Safe ground remains underneath; the upper stepping route pays gold for deliberate landings. */
    private addTerraces(at: (seconds: number) => number, speed: number, tier: number): number {
        const heights = [70, 130, 70], run = 1.35, gap = .32 + tier * .025;
        let s = .5;
        for (let i = 0; i < heights.length; i++) {
            const x = at(s), y = heights[i]; this.addPlatform(x, y, speed * run, false);
            for (let j = 0; j < 6; j++) this.pickups.push({ id: ++this.sequence, x: x + 70 + j * (speed * run - 140) / 5, y: y + 46, golden: true, taken: false });
            if (tier >= 3 && i === 1) this.addDevice('electric', at(s + .85), y);
            s += run + gap;
        }
        for (let i = 0; i < 8; i++) this.pickups.push({ id: ++this.sequence, x: at(i * .55), y: 45, taken: false });
        return s + 1.6;
    }
    /** Two routes through one stretch. The street below stays clear and coinless; the rooftops pay
     * in coins but need a climb, two hops and a hazard on the roof. Coins trace only the high route.
     * Returns the section's duration in seconds. */
    private addSkyline(at: (seconds: number) => number, speed: number, tier: number): number {
        const y = ROUTE.roofY, hop = .3 + Math.min(4, tier) * .03, land = singleLanding(0) - hop, runs = [1.1, land + 1.2, 1.1];
        // The middle roof's hazard waits half a second past the latest landing from the hop before it.
        const hazardKind: ObstacleKind = tier >= 3 ? 'spikes' : 'crate', hazardAt = land + .5;
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
    /** No road: a chasm crossed on floating platforms at SKYWAY.levels. Every hop is planned against its
     * worst case with SKYWAY.margin to spare: a climb is judged to the target's highest point from the
     * takeoff's lowest, the latest landing from the takeoff's highest to the target's lowest, so floating
     * platforms never make a hop impossible. A climb moves up at most one level. From tier 1 some platforms
     * float and some low ones end in a spring pad trampoline that fires the runner up to the top level far ahead;
     * from tier 2 some hops are too long for one jump and need the double jump; from tier 1 hazards (a crate,
     * then a banner to slide under, then spikes) stand on the longer platforms.
     * A fall costs a heart and resumes on the next platform (see step). Returns the duration in seconds. */
    private addSkyway(at: (seconds: number) => number, speed: number, tier: number): number {
        const levels = SKYWAY.levels, count = 4 + Math.min(2, tier >> 1), hazards: ObstacleKind[] = ['crate', 'bar', 'spikes'];
        const chasm = this.obstacles.length; this.addObstacle('gap', at(0), 0, false);
        this.obstacles[chasm].bridgeable = false;
        // `lo`/`hi`: the takeoff surface's lowest and highest heights; `spring`: it ends in a trampoline.
        let s = 0, lo = 0, hi = 0, level = -1, spring = false;
        for (let k = 0; k < count; k++) {
            let next: number, hop: number, land: number, bob = 0, golden = false;
            if (spring) {
                next = levels.length - 1;
                ({ hop, land } = this.springFlight(at, s, speed, lo, levels[next]));
            } else {
                const double = tier >= 2 && k > 0 && this.random() < .3 + tier * .05;
                // The first platform is the low or middle level; later ones wander one level at a time.
                next = k === 0 ? Math.floor(this.random() * 2)
                    : Math.max(0, Math.min(levels.length - 1, level + Math.floor(this.random() * 3) - 1));
                // Low and middle platforms may float, as long as a single jump still reaches their top.
                if (tier >= 1 && !double && next < levels.length - 1 && this.random() < .35
                    && levels[next] + SKYWAY.bob - lo <= SKYWAY.bobReach) bob = SKYWAY.bob;
                const reachRise = levels[next] + bob - lo, landRise = levels[next] - bob - hi;
                const reach = singleLanding(Math.max(0, reachRise));
                hop = double ? reach + SKYWAY.doubleExtra
                    : Math.max(.28, (reach - SKYWAY.margin) * (reachRise > 0 ? .55 + this.random() * .35 : .45 + this.random() * .4));
                // A jump taken at the very edge comes down this far into the platform: the latest landing.
                land = Math.max(0, (double ? doubleLanding(landRise) : singleLanding(landRise)) - hop);
                // Coins trace the hop that clears it: one jump, or a jump with the second at its apex.
                for (const t of [.15, .3, .45, .6, .75].filter(t => t < hop + .2)) {
                    this.pickups.push({ id: ++this.sequence, x: at(s) + speed * t, y: hi + (double ? climbHeight(t) : jumpHeight(t)) + 45, taken: false, golden: double });
                }
                golden = double;
            }
            s += hop; level = next;
            const y = levels[next], guarded = !bob && tier >= 1 && k > 0 && this.random() < .3 + tier * .1;
            // Some static low platforms end in a spring pad that fires to the top level (only from the low level,
            // so a launch with an air jump at its apex stays inside the fixed camera).
            spring = !bob && !guarded && tier >= 1 && k < count - 1 && next === 0 && this.random() < .45;
            const drum = (SPRING.pad + SPRING.inset) / speed;
            const run = land + (guarded ? 1.9 : spring ? SPRING.run + drum : Math.max(.4, .75 - tier * .08 + this.random() * .35));
            const left = at(s), width = run * speed;
            this.addPlatform(left, y, width, false);
            if (bob) Object.assign(this.platforms[this.platforms.length - 1], { baseY: y, bob, phase: this.random() });
            if (spring) this.addSpringPad(left + width - SPRING.inset - SPRING.pad, y);
            let skip = [Infinity, -Infinity];
            if (guarded) {
                // Land, then the hazard: a crate first, then a banner to slide under, then spikes.
                this.addObstacle(hazards[Math.floor(this.random() * Math.min(hazards.length, tier))], at(s + land + .5), y);
                const o = this.obstacles[this.obstacles.length - 1]; skip = [o.x - 120, o.x + o.width + 60];
            }
            if (spring) skip = [left + width - SPRING.inset - SPRING.pad - 60, Infinity];
            // Coins over a floating platform sit above its highest point, within reach all the way.
            for (let cx = left + 30; cx < left + width - 20; cx += 64) {
                if (cx < skip[0] || cx > skip[1]) this.pickups.push({ id: ++this.sequence, x: cx, y: y + bob + 46, taken: false, golden: golden && cx < left + 100 });
            }
            s += run; lo = y - bob; hi = y + bob;
            if (spring) s -= drum;
        }
        // Back down to the road beyond the chasm.
        const landing = .45; this.coinArc(at(s), hi, speed, [.15, .3], false);
        this.obstacles[chasm].width = at(s + landing) - at(0);
        return s + landing + 1.2;
    }
    /** Spring chain: a chasm crossed by bouncing from pad to pad. The first spring pad stands on the road at
     * the lip, each island is a platform with the next one at its end, and every launch's own arc lands on
     * the next island. An air jump on the way down reaches a golden trio; the island is long enough for
     * however late that jump comes. Returns the duration in seconds. */
    private addSpringChain(at: (seconds: number) => number, speed: number, tier: number): number {
        const levels = SKYWAY.levels, count = 3 + Math.min(2, tier >> 1), drum = (SPRING.pad + SPRING.inset) / speed;
        const chasm = this.obstacles.length; this.addObstacle('gap', at(0), 0, false);
        this.obstacles[chasm].bridgeable = false;
        this.addSpringPad(at(0) - SPRING.inset - SPRING.pad, 0);
        let s = -drum, lo = 0;
        for (let k = 0; k < count; k++) {
            // Drums stand only on the low level, so a launch with an air jump at its apex stays inside the
            // fixed camera; the last island may be the middle level.
            const last = k === count - 1, y = levels[last ? Math.floor(this.random() * 2) : 0];
            const { hop, land } = this.springFlight(at, s, speed, lo, y);
            s += hop;
            const run = land + (last ? .5 : .25 + drum), left = at(s), width = run * speed;
            this.addPlatform(left, y, width, false);
            for (let cx = left + 30; cx < left + width - (last ? 20 : SPRING.inset + SPRING.pad + 60); cx += 64) this.pickups.push({ id: ++this.sequence, x: cx, y: y + 46, taken: false });
            if (!last) this.addSpringPad(left + width - SPRING.inset - SPRING.pad, y);
            s += run - (last ? 0 : drum); lo = y;
        }
        const landing = .45; this.coinArc(at(s), lo, speed, [.15, .3], false);
        this.obstacles[chasm].width = at(s + landing) - at(0);
        return s + landing + 1.2;
    }
    private addSpringPad(x: number, y: number): void {
        this.platforms.push({ id: ++this.sequence, x, y, width: SPRING.pad, spring: true });
    }
    /** The flight from a spring pad whose spring pad start at time `s` on a surface at `from` to a platform at `to`:
     * the platform starts .3 s before the earliest landing (the runner fires the spring pad as soon as its front
     * touches them) and `land` is how far into it the latest landing can come (fired from the spring pad' far
     * end, then stretched by the air jump). Lays the arc's coins and the golden trio above the descent. */
    private springFlight(at: (seconds: number) => number, s: number, speed: number, from: number, to: number): { hop: number; land: number } {
        const base = from + SPRING.top, rise = to - base, flight = springLanding(rise), touch = RUNNER.halfWidth / speed;
        const launch = at(s) - RUNNER.halfWidth;
        for (let t = .15; t < flight - .08; t += .15) this.pickups.push({ id: ++this.sequence, x: launch + speed * t, y: base + springHeight(t) + 45, taken: false });
        // The trio: an air jump taken on the way down, 60 above the landing.
        const tj = springLanding(rise + 60);
        for (const dt of [.2, .32, .44]) {
            this.pickups.push({ id: ++this.sequence, x: launch + speed * (tj + dt), y: base + springHeight(tj) + jumpHeight(dt) + 45, taken: false, golden: true });
        }
        this.pickupsDirty = true;
        return { hop: flight - touch - .3, land: .3 + (SPRING.pad + 2 * RUNNER.halfWidth) / speed + SPRING.extend };
    }
    /** The launcher at `x`, with coins tracing the launch arc from its pad's centre. */
    private addLauncherSection(x: number, speed: number): void {
        this.addDevice('launcher', x);
        const c = this.devices[this.devices.length - 1], reach = speed * LAUNCHER.speed * LAUNCHER.launch;
        for (let t = .1; t < .95; t += .1) {
            this.pickups.push({ id: ++this.sequence, x: c.x + c.width / 2 + reach * t, y: c.height + launchHeight(t) + 45, taken: false, golden: t > .35 && t < .65 });
        }
        this.pickupsDirty = true;
    }
    private coinArc(takeoff: number, base: number, speed: number, times: number[], golden: boolean): void {
        for (const t of times) this.pickups.push({ id: ++this.sequence, x: takeoff + speed * t, y: base + jumpHeight(t) + 45, taken: false, golden });
        this.pickupsDirty = true;
    }
    /** Coins show how to pass: a well-timed jump arc over low hazards and pits, a low trail under
     * hanging gates, a line overhead elsewhere. Travelling sound waves carry none. */
    private guideCoins(o: RunnerObstacle): void {
        if (o.kind === 'wave') return;
        // The surface the hazard stands on (or hangs over): overhead ones keep their clearance above it.
        const clearance = o.kind === 'bar' ? RUNNER.barBottom : o.kind === 'drone-high' ? 58 : 0;
        const speed = baseSpeedAt(o.x), lift = (o.kind === 'drop-crate' ? o.originBottom ?? 0 : o.bottom ?? 0) - clearance;
        if (['crate', 'drop-crate', 'spikes', 'tower', 'wall', 'gap', 'steam'].indexOf(o.kind) >= 0) {
            const guide = obstacleJumpGuide(o), takeoff = o.x - RUNNER.halfWidth - guide.lead * speed;
            const times = guide.second ? [.18, .4, .62, .84, 1.06] : [.14, .27, .4, .53, .66];
            for (const t of times) this.pickups.push({ id: ++this.sequence, x: takeoff + speed * t,
                y: lift + guide.height(t) + 45, taken: false });
            this.pickupsDirty = true; return;
        }
        const y = o.kind === 'bar' || o.kind === 'drone-high' ? 28 : o.kind === 'tower' || o.kind === 'steam' ? 225 : 132;
        for (let i = 0; i < 5; i++) this.pickups.push({ id: ++this.sequence, x: o.x - 90 + i * 80, y: lift + y, taken: false });
        this.pickupsDirty = true;
    }
    private addObstacle(kind: ObstacleKind, x: number, lift = 0, guide = true): void {
        const width = kind === 'spikes' ? 200 : kind.startsWith('drone-') ? 90 : kind === 'steam' ? 110 : kind === 'roller' ? 84 : kind === 'gap' ? 230 : kind === 'bar' ? 220 : kind === 'wall' ? 168 : kind === 'wave' ? 56 : 84;
        const height = kind === 'spikes' ? 84 : kind.startsWith('drone-') ? 64 : kind === 'steam' ? 172 : kind === 'roller' ? 84 : kind === 'tower' ? 164 : kind === 'wall' ? 128 : kind === 'bar' ? 126 : kind === 'wave' ? 58 : 72;
        this.obstacles.push({ id: ++this.sequence, kind, x, width, height, hit: false, visibleAge: -1, originX: x, bridgeable: kind === 'gap',
            bottom: lift + (kind === 'drone-high' ? 58 : kind === 'bar' ? RUNNER.barBottom : 0), originBottom: lift });
        if (guide && !this.planning) this.guideCoins(this.obstacles[this.obstacles.length - 1]);
        if (kind === 'drop-crate') this.obstacles[this.obstacles.length - 1].bottom = lift + DROP.height;
    }

    private updateTraps(dt: number): void {
        // Fever and the launcher launch lay bridges ahead. Placed planks remain until offscreen;
        // expiration never removes the floor from under a running/jumping actor.
        if (this.flying || this.bridgeTime > 0) for (const o of this.obstacles) {
            if (o.kind === 'gap' && (this.flying || o.bridgeable) && o.x < this.x + 1200 && o.x + o.width > this.x - 30) o.bridged = true;
        }
        for (const o of this.obstacles) {
            if (o.kind === 'wave') { o.x -= COMPRESSOR.waveSpeed * dt; continue; }
            if (o.kind === 'drop-crate') {
                if ((o.visibleAge ?? -1) < 0 && o.x - this.x >= this.speed * DROP.notice) continue;
                if ((o.visibleAge ?? -1) < 0) this.events.push('warning');
                o.visibleAge = Math.max(0, o.visibleAge ?? -1) + dt;
                const t = Math.min(1, Math.max(0, (o.visibleAge - DROP.warning) / DROP.fall));
                o.bottom = (o.originBottom ?? 0) + DROP.height * (1 - t * t);
                continue;
            }
            if (o.kind !== 'steam' && o.kind !== 'roller' && !o.kind.startsWith('drone-')) continue;
            if ((o.visibleAge ?? -1) < 0 && o.x - this.x >= (o.kind.startsWith('drone-') ? DRONE.notice : 780)) continue;
            const entering = (o.visibleAge ?? -1) < 0;
            o.visibleAge = Math.max(0, o.visibleAge ?? -1) + dt;
            if (entering) this.events.push('warning');
            if (o.kind === 'roller' && o.visibleAge > .55) o.x -= 90 * dt;
            if (o.kind.startsWith('drone-')) {
                // Hold the drone beyond the viewport for a full telegraph before it flies in.
                // The lane marker, artwork and hitbox all use this phase clock.
                if (dronePhase(o.visibleAge) === 'warning') o.x += this.speed * dt;
                else o.x -= DRONE.speed * dt;
            }
        }
    }
    private addPlatform(x: number, y: number, width: number, coins = true): void {
        this.platforms.push({ id: ++this.sequence, x, y, width, oneWay: true });
        if (!coins) return;
        this.pickupsDirty = true;
        for (let i = 0; i < Math.floor(width / 60); i++) this.pickups.push({ id: ++this.sequence, x: x + i * 60 + 30, y: y + 46, taken: false });
    }
    private addDevice(kind: DeviceKind, x: number, y = 0): void {
        const width = kind === 'launcher' ? 156 : kind === 'cart' ? 176 : kind === 'saw' ? 100 : kind === 'compressor' ? 110 : kind === 'stomper' || kind === 'electric' ? ENEMY.width : 64;
        this.devices.push({ id: ++this.sequence, kind, x, y, width, height: kind === 'launcher' ? 112 : kind === 'cart' ? RUNNER.rideHeight : kind === 'saw' ? 90 : kind === 'hopper' ? 100 : kind === 'compressor' ? COMPRESSOR.height : kind === 'stomper' || kind === 'electric' ? ENEMY.height : 72,
            age: 0, visibleAge: -1, actionAge: 10, originY: y, used: false, active: true, offset: 0 });
    }
    /** Only skilful actions extend the chain; every reward uses the current chain multiplier. */
    private reward(kind: 'clear' | 'break' | 'bounce' | 'mount', x: number, y: number, points: number, chained: boolean): void {
        if (chained) { this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); }
        if (chained && this.combo % STREAK.every === 0) {
            this.coins += STREAK.coins; this.events.push('streak');
            this.feedbacks.push({ kind: 'streak', x, y: y + 40, value: this.combo });
        }
        const value = points * this.multiplier;
        this.bonus += value; this.events.push(kind); this.feedbacks.push({ kind, x, y, value });
    }
    private touchDevice(oldY: number): boolean {
        if (this.vy >= 0 || this.mounted) return false;
        for (const c of this.devices) {
            // Fever already smashes through; the cart waits for an ordinary run.
            if (!c.active || c.used || (c.kind !== 'launcher' && (c.kind !== 'cart' || this.feverTime > 0))) continue;
            const top = c.y + c.height;
            if (this.x < c.x + 24 || this.x > c.x + c.width - 24 || oldY < top || this.y > top) continue;
            c.used = true; c.actionAge = 0; this.sliding = false; this.y = top;
            if (c.kind === 'launcher') {
                this.launchTime = LAUNCHER.launch; this.launchY = top; this.jumps = 2; this.jumpAge = 0; this.grounded = false; this.bounces++;
                this.invulnerable = Math.max(this.invulnerable, LAUNCHER.launch + LAUNCHER.grace);
                this.reward('bounce', this.x, top, 80, true); this.addFever(SKILL.stuntGain);
                if (this.mistakes > 0) {
                    // The kangaroo drops back one stage; the customer's rating still remembers the crash.
                    this.mistakes--; this.events.push('heal'); this.feedbacks.push({ kind: 'heal', x: this.x, y: top + 60, value: 1 });
                }
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
    private reaches(c: RunnerDevice): boolean {
        return this.feverTime > 0 || this.y < c.y + c.height && this.y + this.height > c.y;
    }
    private updateDevices(dt: number, oldY: number): void {
        for (const c of this.devices) {
            c.age += dt; c.actionAge += dt;
            const hidden = c.visibleAge < 0;
            if (c.visibleAge >= 0 || c.x - this.x < 780) c.visibleAge = Math.max(0, c.visibleAge) + dt;
            if (c.kind === 'saw' && hidden && c.visibleAge >= 0 && !c.used && c.x + c.width > this.x) this.events.push('warning');
            if (c.kind === 'cart' && c.id === this.mounted) {
                c.x = this.x - c.width / 2; c.y = this.y - RUNNER.rideHeight;
                this.rideTime = Math.max(0, this.rideTime - dt);
                const unsafe = this.obstacles.some(o => o.x + o.width > this.x - 90 && o.x < this.x + 380 && !o.broken && !o.bridged);
                if (this.rideTime === 0 && this.grounded && this.surfaceY === 0 && !unsafe) this.dismount();
            } else if (c.kind === 'cart' && c.used) {
                c.x += this.speed * 1.1 * dt; if (c.actionAge > 1) c.active = false;
            } else if (c.kind === 'stomper' || c.kind === 'electric') {
                const overlaps = this.x + RUNNER.halfWidth > c.x && this.x - RUNNER.halfWidth < c.x + c.width;
                if (!c.used && overlaps && this.reaches(c)) {
                    const stomp = c.kind === 'stomper' && this.vy < 0 && oldY >= c.y + c.height && this.y <= c.y + c.height
                        && this.x >= c.x + 8 && this.x <= c.x + c.width - 8;
                    if (this.feverTime > 0 || c.kind === 'stomper' && this.giantTime > 0) {
                        c.used = true; c.active = false; this.reward('break', c.x, c.y + 40, 60, false);
                    } else if (stomp) {
                        c.used = true; c.active = false; this.y = c.y + c.height; this.vy = ENEMY.stomp;
                        this.stomps++;
                        this.grounded = this.sliding = false; this.jumps = 1; this.jumpAge = 0;
                        this.reward('bounce', this.x, this.y, 80, true); this.addFever(SKILL.stuntGain); this.events.push('stomp');
                    } else if (this.invulnerable <= 0) { c.used = true; this.damage('hit', c.kind); }
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.clear(c.x, c.y + 40); }
            } else if (c.kind === 'saw') {
                c.offset = sawMotion(c.visibleAge).offset;
                if (!c.used && Math.abs(this.x - (c.x + c.width / 2 + c.offset)) < 55 && this.reaches(c)) {
                    // Smashed in Fever, absorbed (without credit) while invulnerable.
                    c.used = true;
                    if (this.feverTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit', c.kind);
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.clear(c.x, c.y + 40); }
            } else if (c.kind === 'compressor') {
                if (hidden && c.visibleAge >= 0) this.events.push('warning');
                // It enters at the hold distance, so keeping pace never jumps the drawing.
                if (c.visibleAge >= 0 && c.visibleAge < COMPRESSOR_ATTACK) c.x = this.x + COMPRESSOR.hold;
                const due = c.visibleAge < COMPRESSOR.windup ? 0 : Math.min(COMPRESSOR.pops, Math.floor((c.visibleAge - COMPRESSOR.windup) / COMPRESSOR.period) + 1);
                while (!c.used && (c.pops ?? 0) < due) {
                    c.pops = (c.pops ?? 0) + 1; this.addObstacle('wave', c.x - 30);
                    this.events.push('pop'); this.feedbacks.push({ kind: 'pop', x: c.x + c.width / 2, y: 150, value: 0 });
                }
                if (!c.used && Math.abs(this.x - (c.x + c.width / 2)) < 50 && this.reaches(c)) {
                    // Smashed in Fever, absorbed (without credit) while invulnerable.
                    c.used = true;
                    if (this.feverTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit', c.kind);
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.clear(c.x, c.y + 40); }
            } else if (c.kind === 'hopper') {
                const jump = hopperMotion(c.visibleAge);
                c.y = (c.originY ?? 0) + jump.y;
                if (!c.used && Math.abs(this.x - c.x - c.width / 2) < 55 && this.reaches(c)) {
                    c.used = true;
                    if (this.feverTime > 0 || this.giantTime > 0) { c.active = false; this.reward('break', c.x, c.y + 40, 40, false); }
                    else if (this.invulnerable <= 0) this.damage('hit', c.kind);
                }
                if (!c.used && this.x > c.x + c.width + 60) { c.used = true; this.clear(c.x, c.y + 40); }
            }
        }
    }
}
