/** Engine-independent sling puck simulation. Units: 34 design pixels per original world unit.
 * A lifted puck is a ghost; pulling locks an anchor, and release follows an analytic band stroke.
 * Both the live game and the bot's whole-board rollouts use this same fixed-step solver.
 */
export type Side = 'south' | 'north';
export const SIDES: readonly Side[] = ['south', 'north'];
export type Phase = 'countdown' | 'play' | 'roundEnd' | 'matchEnd';
export const SLING_WORLD = Object.freeze({
    halfWidth: 323, halfLength: 527, puckRadius: 34,
    dividerHalf: 13.6, gateHalf: 44.2, bandY: 391, bandPostX: 323,
    launchY: 357, startY: 217.6, startSpacing: 108.8,
});
export const SLING_RULES = Object.freeze({
    pucksPerSide: 5, roundSeconds: 180, overtimeSeconds: 60, roundsToWin: 1,
    countdownSeconds: 3, roundEndSeconds: 1.5, clearHoldSeconds: .8, comboWindow: 1.4,
});
export const SLING_PHYSICS = Object.freeze({
    step: 1 / 120, friction: 306, drag: .35, wallBounce: .66, dividerBounce: .6, puckBounce: .82,
    maxShotSpeed: 1258, maxGrabSpeed: 170, shotCooldown: .3, minimumPull: 13.6,
    angleLimit: 68 * Math.PI / 180, directionCompression: .8,
});
export const MAX_PULL = 132.6;
const W = SLING_WORLD, P = SLING_PHYSICS, R = W.puckRadius;
export function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
export function sideSign(side: Side): number { return side === 'south' ? -1 : 1; }
export function otherSide(side: Side): Side { return side === 'south' ? 'north' : 'south'; }
interface Stroke { x: number; y: number; dx: number; dy: number; distance: number; speed: number; omega: number; duration: number; age: number }
export interface Puck {
    readonly id: number;
    x: number; y: number; prevX?: number; prevY?: number; vx: number; vy: number; a: number; av: number; color: number;
    holder?: Side; targetX: number; targetY: number; anchorX?: number; pulling: boolean;
    shooter?: Side; clean: boolean; side: Side; jam: number; stroke?: Stroke;
    sigmaSouth?: number; sigmaNorth?: number;
}
export type SlingEvent =
    | { type: 'countdown'; value: number } | { type: 'start'; round: number; suddenDeath: boolean }
    | { type: 'grab'; side: Side; id: number }
    | { type: 'launch'; side: Side; id: number; x: number; y: number; power: number }
    | { type: 'puckHit'; x: number; y: number; impulse: number }
    | { type: 'wallHit'; x: number; y: number; impulse: number; divider: boolean }
    | { type: 'bandHit'; side: Side; x: number; impulse: number }
    | { type: 'gate'; from: Side; id: number; x: number; y: number; speed: number; clean: boolean; combo: number; own: boolean }
    | { type: 'finalSeconds' } | { type: 'suddenDeath' }
    | { type: 'roundEnd'; winner?: Side; reason: 'clear' | 'time' | 'sudden' }
    | { type: 'matchEnd'; winner?: Side };
export interface Trace { readonly path: number[]; readonly gate: boolean; readonly gateX: number; readonly travel: number; readonly bounces: number }
export interface LaunchPrediction {
    readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
    readonly trace: Trace; readonly power: number;
}
export type GrabDenial = 'notPlaying' | 'alreadyHolding' | 'otherHalf' | 'held' | 'moving';
export type ShotDenial = 'notPulling' | 'weak' | 'blocked' | 'cooldown';
export interface ShotFeedback { readonly mode: 'idle' | 'hold' | 'pull'; readonly power: number; readonly valid: boolean; readonly reason?: ShotDenial; }
export interface Pull { x: number; y: number; anchorX: number; valid: boolean; power: number }

/** Clamp the finger to a 68-degree, radius-limited pull sector, retaining its locked contact point. */
export function constrainPull(side: Side, anchorX: number, x: number, y: number): Pull {
    const s = sideSign(side), anchor = s * W.launchY;
    anchorX = clamp(anchorX, -272, 272);
    let dx = x - anchorX, back = s * (y - anchor);
    if (back <= 1e-6) return { x: clamp(x, -289, 289), y: anchor, anchorX, valid: false, power: 0 };
    const angle = Math.atan2(dx, back);
    if (Math.abs(angle) > P.angleLimit) {
        const along = Math.hypot(dx, back) * Math.cos(Math.abs(angle) - P.angleLimit);
        dx = Math.sign(angle) * Math.sin(P.angleLimit) * along; back = Math.cos(P.angleLimit) * along;
    }
    const length = Math.hypot(dx, back);
    if (length > MAX_PULL) { dx *= MAX_PULL / length; back *= MAX_PULL / length; }
    x = clamp(anchorX + dx, -W.halfWidth + R, W.halfWidth - R);
    y = s * clamp(W.launchY + back, W.launchY, W.halfLength - R);
    const pull = Math.hypot(x - anchorX, y - anchor);
    return { x, y, anchorX, valid: pull >= P.minimumPull && P.maxShotSpeed * Math.pow(pull / MAX_PULL, 1.15) >= 102, power: Math.pow(pull / MAX_PULL, 1.15) };
}

function stroke(side: Side, anchorX: number, x: number, y: number): Stroke | undefined {
    const forward = -sideSign(side), back = forward * (sideSign(side) * W.launchY - y);
    const pull = Math.hypot(x - anchorX, back), speed = P.maxShotSpeed * Math.pow(clamp(pull / MAX_PULL, 0, 1), 1.15);
    if (back <= 1e-6 || pull < P.minimumPull || speed < 102) return undefined;
    const angle = -P.directionCompression * Math.atan2(forward * (x - anchorX), back);
    const dx = forward * Math.sin(angle), dy = forward * Math.cos(angle), distance = back / Math.cos(angle);
    const omega = speed / distance, duration = Math.PI / (2 * omega);
    return { x, y, dx, dy, distance, speed, omega, duration, age: 0 };
}

export class SlingPuckModel {
    readonly pucks: Puck[] = [];
    phase: Phase = 'countdown'; round = 1;
    readonly roundWins: Record<Side, number> = { south: 0, north: 0 };
    roundWinner?: Side; winner?: Side; suddenDeath = false;
    timeLeft: number = SLING_RULES.roundSeconds; phaseTime = 0; elapsed = 0;
    readonly stats: Record<Side, { shots: number; through: number; clean: number; bestCombo: number }> = {
        south: { shots: 0, through: 0, clean: 0, bestCombo: 0 }, north: { shots: 0, through: 0, clean: 0, bestCombo: 0 },
    };
    private events: SlingEvent[] = [];
    private accumulator = 0;
    private readonly launched: Puck[] = [];
    private clearHold: Record<Side, number> = { south: 0, north: 0 };
    private lastShot: Record<Side, number> = { south: -99, north: -99 };
    private combo: Record<Side, { count: number; at: number }> = { south: { count: 0, at: -99 }, north: { count: 0, at: -99 } };
    private lead?: Side; private leadTime = 0; private finalAnnounced = false; private countdownShown = 0;
    constructor(private readonly emitEvents = true, setup = true) { if (setup) this.setup(); }
    private emit(e: SlingEvent): void { if (this.emitEvents) this.events.push(e); }
    drainEvents(): SlingEvent[] { const result = this.events; this.events = []; return result; }
    count(side: Side): number { let n = 0; for (const p of this.pucks) if (p.side === side) n++; return n; }
    grabDenial(side: Side, puck: Puck): GrabDenial | undefined {
        if (this.phase !== 'play') return 'notPlaying';
        if (this.pucks.some(p => p.holder === side)) return 'alreadyHolding';
        if (puck.side !== side) return 'otherHalf';
        if (puck.holder) return 'held';
        if (puck.stroke || Math.hypot(puck.vx, puck.vy) > P.maxGrabSpeed) return 'moving';
        return undefined;
    }
    canGrab(side: Side, puck: Puck): boolean { return this.grabDenial(side, puck) === undefined; }
    /** The HUD and release validation share the exact speed/pull/obstacle/cooldown criteria. */
    shotFeedback(side: Side): ShotFeedback { return this.feedbackForPuck(this.pucks.find(p => p.holder === side)); }
    private feedbackForPuck(p: Puck | undefined): ShotFeedback {
        if (!p?.holder) return { mode: 'idle', power: 0, valid: false };
        const side = p.holder;
        if (!p.pulling) return { mode: 'hold', power: 0, valid: false, reason: 'notPulling' };
        const pull = this.pull(side, p.anchorX ?? p.x, p.x, p.y, p.id);
        const geometry = constrainPull(side, p.anchorX ?? p.x, p.x, p.y);
        const reason: ShotDenial | undefined = !geometry.valid ? 'weak' : !pull.valid ? 'blocked'
            : this.elapsed - this.lastShot[side] < P.shotCooldown ? 'cooldown' : undefined;
        return { mode: 'pull', power: clamp(pull.power, 0, 1), valid: reason === undefined, reason };
    }
    grab(side: Side, x: number, y: number): number {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
        let best: Puck | undefined, distance = R * 1.75;
        for (const p of this.pucks) if (this.canGrab(side, p)) {
            const d = Math.hypot(p.x - x, p.y - y); if (d < distance) { best = p; distance = d; }
        }
        if (!best) return -1;
        best.holder = side; best.vx = best.vy = best.av = 0; best.pulling = false; best.anchorX = undefined;
        best.sigmaSouth = best.sigmaNorth = undefined; best.targetX = best.x; best.targetY = best.y;
        this.emit({ type: 'grab', side, id: best.id }); return best.id;
    }
    drag(id: number, x: number, y: number): void {
        const p = this.pucks[id];
        if (!p?.holder || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const s = sideSign(p.holder);
        if (s * y > W.launchY) {
            if (!p.pulling) p.anchorX = clamp(p.x, -272, 272);
            p.pulling = true;
            const pull = this.pull(p.holder, p.anchorX!, x, y, id);
            p.x = pull.x; p.y = pull.y;
        } else {
            p.pulling = false; p.anchorX = undefined;
            p.x = clamp(x, -W.halfWidth + R, W.halfWidth - R);
            p.y = s * clamp(s * y, W.dividerHalf + R, W.launchY);
        }
        p.targetX = p.x; p.targetY = p.y;
    }
    /** Validate a pull against every free puck; a lifted puck never pushes its neighbours. */
    pull(side: Side, anchorX: number, x: number, y: number, except = -1): Pull {
        let target = constrainPull(side, anchorX, x, y), overlaps = false;
        for (let k = 0; k < 5; k++) {
            overlaps = false; let px = target.x, py = target.y;
            for (const p of this.pucks) {
                if (p.id === except || p.holder) continue;
                const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy), separation = R * 2.01;
                if (d < separation) {
                    if (d < 1e-6) py = p.y + sideSign(side) * separation;
                    else { px = p.x + dx / d * separation; py = p.y + dy / d * separation; }
                    overlaps = true;
                }
            }
            if (!overlaps) break;
            target = constrainPull(side, anchorX, px, py);
        }
        if (overlaps && this.pucks.some(p => p.id !== except && !p.holder && Math.hypot(p.x - target.x, p.y - target.y) < R * 2.005)) {
            target.valid = false;
        }
        return target;
    }
    release(id: number): boolean {
        const p = this.pucks[id]; if (!p?.holder) return false;
        const side = p.holder;
        const pull = this.pull(side, p.anchorX ?? p.x, p.x, p.y, id);
        if (!this.feedbackForPuck(p).valid) { this.drop(id); return false; }
        const plan = stroke(side, pull.anchorX, pull.x, pull.y);
        if (!plan) { this.drop(id); return false; }
        p.holder = undefined; p.pulling = false; p.x = pull.x; p.y = pull.y; p.vx = p.vy = p.av = 0;
        p.stroke = plan; p.shooter = side; p.clean = true;
        this.stats[side].shots++; this.lastShot[side] = this.elapsed;
        this.emit({ type: 'launch', side, id, x: p.x, y: p.y, power: pull.power }); return true;
    }
    /** Cancel, pause and layout changes place a held puck without firing it. */
    drop(id: number): void {
        const p = this.pucks[id]; if (!p?.holder) return;
        const side = p.holder, x = p.x, y = p.y, s = sideSign(side);
        const free = (px: number, py: number) => this.pucks.every(q => q === p || !!q.holder || Math.hypot(q.x - px, q.y - py) >= R * 2.02);
        if (!free(x, y)) outer: for (let radius = R * .4; radius <= R * 10; radius += R * .4) {
            for (let k = 0; k < 16; k++) {
                const a = k / 16 * Math.PI * 2;
                const px = clamp(x + Math.cos(a) * radius, -W.halfWidth + R, W.halfWidth - R);
                const py = s * clamp(s * (y + Math.sin(a) * radius), W.dividerHalf + R, W.halfLength - R);
                if (free(px, py)) { p.x = px; p.y = py; break outer; }
            }
        }
        p.holder = undefined; p.pulling = false; p.anchorX = undefined; p.vx = p.vy = p.av = 0; p.stroke = undefined;
    }
    releaseAll(side?: Side): void { for (const p of this.pucks) if (p.holder && (!side || p.holder === side)) this.drop(p.id); }
    pullDepth(p: { x: number; y: number }, side: Side): number { return Math.max(0, sideSign(side) * p.y - W.launchY); }
    bandContact(side: Side): { x: number; y: number } | undefined {
        let best: Puck | undefined, depth = 0;
        for (const p of this.pucks) {
            if (p.holder && !p.pulling) continue;
            const d = this.pullDepth(p, side); if (d > depth) { depth = d; best = p; }
        }
        return best ? { x: best.x, y: best.y + sideSign(side) * R } : undefined;
    }
    predict(side: Side, x: number, y: number, length = 900, anchorX = x): LaunchPrediction | undefined {
        const plan = stroke(side, anchorX, x, y); if (!plan) return undefined;
        const ex = x + plan.dx * plan.distance, ey = y + plan.dy * plan.distance;
        const vx = plan.dx * plan.speed, vy = plan.dy * plan.speed;
        return { x: ex, y: ey, vx, vy, power: plan.speed / P.maxShotSpeed, trace: traceStraight(ex, ey, vx, vy, length) };
    }
    advance(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'matchEnd') return;
        this.phaseTime += dt;
        if (this.phase === 'countdown') {
            const left = Math.ceil(SLING_RULES.countdownSeconds - this.phaseTime);
            if (left !== this.countdownShown && left > 0) { this.countdownShown = left; this.emit({ type: 'countdown', value: left }); }
            if (this.phaseTime >= SLING_RULES.countdownSeconds) { this.phase = 'play'; this.phaseTime = 0; this.emit({ type: 'start', round: 1, suddenDeath: false }); }
            return;
        }
        if (this.phase === 'roundEnd') {
            if (this.phaseTime >= SLING_RULES.roundEndSeconds) { this.phase = 'matchEnd'; this.emit({ type: 'matchEnd', winner: this.winner }); }
            return;
        }
        this.accumulator = Math.min(this.accumulator + dt, .2);
        while (this.accumulator + 1e-10 >= P.step && this.phase === 'play') {
            this.accumulator -= P.step; this.step(); this.elapsed += P.step;
            this.timeLeft = Math.max(0, this.timeLeft - P.step);
            if (this.timeLeft < 1e-7) this.timeLeft = 0;
            if (!this.finalAnnounced && this.timeLeft <= 10) { this.finalAnnounced = true; this.emit({ type: 'finalSeconds' }); }
            this.checkWin();
        }
    }
    private step(): void {
        const launched = this.launched; launched.length = 0;
        let maxSpeed = 0;
        for (const p of this.pucks) {
            if (p.holder) continue;
            p.prevX = p.x; p.prevY = p.y;
            if (p.stroke) {
                const a = p.stroke; a.age += P.step;
                const travel = a.distance * (1 - Math.cos(a.omega * Math.min(a.age, a.duration)));
                const tx = a.x + a.dx * travel, ty = a.y + a.dy * travel;
                p.vx = (tx - p.x) / P.step; p.vy = (ty - p.y) / P.step;
                p.targetX = tx; p.targetY = ty; launched.push(p);
            } else {
                this.passiveBand(p, 'south'); this.passiveBand(p, 'north');

            }
            maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
        }
        // Sweep fast discs through small spatial increments. A full 1/120 move can skip a
        // second gate-end contact, producing a completely different glancing rebound.
        const slices = Math.max(1, Math.ceil(maxSpeed * P.step / (R / 16))), dt = P.step / slices;
        for (let slice = 0; slice < slices; slice++) {
            for (const p of this.pucks) if (!p.holder) { p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.av * dt; }
            for (let pass = 0; pass < 8; pass++) {
                let contact = false;
                for (let i = 0; i < this.pucks.length; i++) for (let j = i + 1; j < this.pucks.length; j++) {
                    if (this.puckContact(this.pucks[i], this.pucks[j], true)) contact = true;
                }
                for (const p of this.pucks) if (!p.holder && this.wallContacts(p, true)) contact = true;
                if (!contact) break;
            }
        }
        for (const p of launched) {
            const a = p.stroke!;
            if (Math.abs(p.x - p.targetX) > .034 || Math.abs(p.y - p.targetY) > .034) p.stroke = undefined;
            else if (a.age + 1e-9 >= a.duration) { p.vx = a.dx * a.speed; p.vy = a.dy * a.speed; p.stroke = undefined; }
        }
        for (const p of this.pucks) {
            if (p.holder) continue;
            if (launched.indexOf(p) < 0) {
                const damping = 1 / (1 + P.drag * P.step); p.vx *= damping; p.vy *= damping;
                const speed = Math.hypot(p.vx, p.vy), next = Math.max(0, speed - P.friction * P.step);
                if (speed) { p.vx *= next / speed; p.vy *= next / speed; }
                p.av = Math.sign(p.av) * Math.max(0, Math.abs(p.av) / (1 + 1.2 * P.step) - 5 * P.step);
            }
            this.trackSide(p);
        }
    }
    private puckContact(a: Puck, b: Puck, impulse: boolean): boolean {
        if (a.holder || b.holder) return false;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R - 1e-6) return false;
        const d = Math.sqrt(d2), nx = d > 1e-7 ? dx / d : 1, ny = d > 1e-7 ? dy / d : 0, overlap = 2 * R - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (!impulse || closing <= 0) return overlap > 1e-5;
        const normal = (1 + P.puckBounce) * closing / 2;
        a.vx -= normal * nx; a.vy -= normal * ny; b.vx += normal * nx; b.vy += normal * ny;
        const tangent = (a.vx - b.vx) * -ny + (a.vy - b.vy) * nx + (a.av + b.av) * R;
        const friction = clamp(tangent / 6, -.06 * normal, .06 * normal);
        a.vx += friction * ny; a.vy -= friction * nx; b.vx -= friction * ny; b.vy += friction * nx;
        a.av -= 2 * friction / R; b.av -= 2 * friction / R; a.clean = b.clean = false;
        if (closing > 10) this.emit({ type: 'puckHit', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, impulse: closing });
        return overlap > 1e-5;
    }
    private wallImpulse(p: Puck, nx: number, ny: number, bounce: number, divider: boolean, impulse: boolean): void {
        if (!impulse) return;
        const into = p.vx * nx + p.vy * ny; if (into >= 0) return;
        const normal = -(1 + bounce) * into;
        p.vx += normal * nx; p.vy += normal * ny;
        const tangent = p.vx * -ny + p.vy * nx - p.av * R;
        const friction = clamp(tangent / 3, -.06 * normal, .06 * normal);
        p.vx += friction * ny; p.vy -= friction * nx; p.av += 2 * friction / R;
        if (divider) p.clean = false;
        if (-into > 10) this.emit({ type: 'wallHit', x: p.x - nx * R, y: p.y - ny * R, impulse: -into, divider });
    }
    private wallContacts(p: Puck, impulse: boolean): boolean {
        let contact = false;
        if (p.x < -W.halfWidth + R) { contact = true; p.x = -W.halfWidth + R; this.wallImpulse(p, 1, 0, P.wallBounce, false, impulse); }
        if (p.x > W.halfWidth - R) { contact = true; p.x = W.halfWidth - R; this.wallImpulse(p, -1, 0, P.wallBounce, false, impulse); }
        if (p.y < -W.halfLength + R) { contact = true; p.y = -W.halfLength + R; this.wallImpulse(p, 0, 1, P.wallBounce, false, impulse); }
        if (p.y > W.halfLength - R) { contact = true; p.y = W.halfLength - R; this.wallImpulse(p, 0, -1, P.wallBounce, false, impulse); }
        // Divider is a rectangle with round inner end caps, not a square doorway.
        for (const sign of [-1, 1]) {
            const inner = W.gateHalf + W.dividerHalf;
            const cx = sign * clamp(sign * p.x, inner, W.halfWidth);
            const dx = p.x - cx, dy = p.y, d = Math.hypot(dx, dy), radius = R + W.dividerHalf;
            if (d >= radius - 1e-7) continue;
            contact = true;
            const nx = d > 1e-7 ? dx / d : 0, ny = d > 1e-7 ? dy / d : p.side === 'north' ? 1 : -1;
            p.x += nx * (radius - d); p.y += ny * (radius - d);
            const oldX = p.prevX ?? p.x, oldY = p.prevY ?? p.y;
            const oldDX = oldX - sign * clamp(sign * oldX, inner, W.halfWidth), oldD = Math.hypot(oldDX, oldY);
            const speculative = oldD > 1e-7 && oldD < radius + R * .6;
            this.wallImpulse(p, speculative ? oldDX / oldD : nx, speculative ? oldY / oldD : ny, P.dividerBounce, true, impulse);
        }
        return contact;
    }
    /** Tangent legs, wrap angle and capstan slip of the passive rubber band (in original world units). */
    private passiveBand(p: Puck, side: Side): void {
        const s = -sideSign(side), x = s * p.x / R, y = s * p.y / R, key = side === 'south' ? 'sigmaSouth' : 'sigmaNorth';
        if (y >= -10.5) { p[key] = undefined; return; }
        const tangent = (post: number, sign: number) => {
            const ax = x - post, ay = y + 11.5, distance = Math.max(1.0001, Math.hypot(ax, ay));
            const leg = Math.sqrt(distance * distance - 1), sin = 1 / distance, cos = leg / distance;
            const ux = ax / distance * cos + sign * ay / distance * sin;
            const uy = ay / distance * cos - sign * ax / distance * sin;
            return { ux: -ux, uy: -uy, cx: post + ux * leg - x, cy: -11.5 + uy * leg - y, leg };
        };
        const l = tangent(-9.5, 1), r = tangent(9.5, -1);
        const phi = Math.max(0, Math.atan2(l.cx * r.cy - l.cy * r.cx, l.cx * r.cx + l.cy * r.cy));
        const ll = l.leg + phi / 2, lr = r.leg + phi / 2, rest = 19 / 1.25;
        const left = (sigma: number) => 4800 * Math.max(0, ll / (sigma * rest) - 1);
        const right = (sigma: number) => 4800 * Math.max(0, lr / ((1 - sigma) * rest) - 1);
        const engaged = p[key] !== undefined;
        let sigma = p[key] ?? clamp((x + 9.5) / 19, .02, .98), lo = .02, hi = .98;
        const ratio = Math.exp(.6 * phi);
        if (right(sigma) > ratio * left(sigma)) {
            hi = sigma; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (right(mid) > ratio * left(mid)) hi = mid; else lo = mid; } sigma = (lo + hi) / 2;
        } else if (left(sigma) > ratio * right(sigma)) {
            lo = sigma; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (left(mid) > ratio * right(mid)) lo = mid; else hi = mid; } sigma = (lo + hi) / 2;
        }
        p[key] = sigma;
        const tl = left(sigma), tr = right(sigma);
        let fx = tl * l.ux + tr * r.ux, fy = tl * l.uy + tr * r.uy;
        const force = Math.hypot(fx, fy);
        if (force > 1e-9) {
            const nx = fx / force, ny = fy / force, into = (s * p.vx * nx + s * p.vy * ny) / R;
            if (into < 0) { fx -= 12 * into * nx; fy -= 12 * into * ny; }
        }
        if (!engaged && sideSign(side) * p.vy > 13.6) this.emit({ type: 'bandHit', side, x: p.x, impulse: Math.abs(p.vy) });
        p.vx += s * fx / Math.PI * R * P.step; p.vy += s * fy / Math.PI * R * P.step;
    }
    private trackSide(p: Puck): void {
        const side: Side = p.y < 0 ? 'south' : 'north'; if (side === p.side) return;
        const from = p.side; p.side = side;
        if (!this.emitEvents) return;
        const own = p.shooter === from; let combo = 0;
        if (own) {
            const c = this.combo[from]; c.count = this.elapsed - c.at <= SLING_RULES.comboWindow ? c.count + 1 : 1; c.at = this.elapsed; combo = c.count;
            const stats = this.stats[from]; stats.through++; if (p.clean) stats.clean++; stats.bestCombo = Math.max(stats.bestCombo, combo);
        }
        this.emit({ type: 'gate', from, id: p.id, x: p.x, y: p.y, speed: Math.hypot(p.vx, p.vy), clean: own && p.clean, combo, own }); p.shooter = undefined;
    }
    private checkWin(): void {
        for (const side of SIDES) {
            if (this.count(side) === 0) { this.clearHold[side] += P.step; if (this.clearHold[side] + 1e-9 >= .8) { this.end(side, 'clear'); return; } }
            else this.clearHold[side] = 0;
        }
        if (this.suddenDeath) {
            const south = this.count('south'), north = this.count('north'), leader = south === north ? undefined : south < north ? 'south' : 'north';
            if (leader !== this.lead) { this.lead = leader; this.leadTime = 0; }
            if (leader) { this.leadTime += P.step; if (this.leadTime + 1e-9 >= .8) { this.end(leader, 'sudden'); return; } }
        }
        if (this.timeLeft > 1e-7) return;
        const a = this.count('south'), b = this.count('north');
        if (a === b && !this.suddenDeath) { this.suddenDeath = true; this.timeLeft = SLING_RULES.overtimeSeconds; this.finalAnnounced = false; this.emit({ type: 'suddenDeath' }); }
        else this.end(a === b ? undefined : a < b ? 'south' : 'north', 'time');
    }
    private end(winner: Side | undefined, reason: 'clear' | 'time' | 'sudden'): void {
        if (this.phase !== 'play') return;
        this.releaseAll(); this.winner = this.roundWinner = winner;
        if (winner) this.roundWins[winner]++;
        this.phase = 'roundEnd'; this.phaseTime = 0; this.emit({ type: 'roundEnd', winner, reason });
    }
    private setup(): void {
        const xs = [-217.6, -108.8, 0, 108.8, 217.6], ys = [272, 238, 217.6, 238, 272];
        for (const side of SIDES) for (let i = 0; i < 5; i++) {
            const x = side === 'south' ? xs[i] : -xs[i], y = sideSign(side) * ys[i], id = this.pucks.length;
            this.pucks.push({ id, x, y, vx: 0, vy: 0, a: 0, av: 0, color: side === 'south' ? 1 : 0,
                targetX: x, targetY: y, pulling: false, clean: false, side, jam: 0 });
        }
    }
    /** Freeze a decision board once; candidates must be compared against the same positions. */
    snapshotForPlanning(): SlingPuckModel {
        const snapshot = new SlingPuckModel(false, false);
        snapshot.phase = 'play'; snapshot.elapsed = this.elapsed; snapshot.timeLeft = this.timeLeft; snapshot.suddenDeath = this.suddenDeath;
        for (const p of this.pucks) snapshot.pucks.push({ ...p, stroke: p.stroke ? { ...p.stroke } : undefined });
        return snapshot;
    }
    /** A rollout owns independent puck/stroke/band state; it cannot mutate the live match. */
    *evaluateShot(side: Side, id: number, anchorX: number, x: number, y: number): Generator<void, number, unknown> {
        const pull = this.pull(side, anchorX, x, y, id); if (!pull.valid) return -1e6;
        const simulation = new SlingPuckModel(false, false);
        for (const p of this.pucks) if (!p.holder || p.id === id) simulation.pucks.push({ ...p, holder: undefined,
            stroke: p.stroke ? { ...p.stroke } : undefined });
        const shot = simulation.pucks.find(p => p.id === id); if (!shot) return -1e6;
        shot.x = pull.x; shot.y = pull.y; shot.vx = shot.vy = shot.av = 0; shot.stroke = stroke(side, anchorX, pull.x, pull.y);
        let settled = 0;
        for (let i = 0; i < 840; i++) {
            simulation.step();
            if (simulation.pucks.every(p => !p.stroke && Math.hypot(p.vx, p.vy) < .51 && Math.abs(p.av) < .08)) settled++; else settled = 0;
            if (settled >= 8) break;
            if ((i + 1) % 6 === 0) yield;
        }
        const own = simulation.count(side), opponent = simulation.pucks.length - own;
        let score = -100 * own + (own === 0 ? 100000 : 0) - (opponent === 0 ? 100000 : 0);
        for (const p of simulation.pucks) if (Math.abs(p.x) < 78.2 && Math.abs(p.y) < 68) score -= p.side === side ? 4 : 8;
        return score;
    }
}

/** Conservative guide: both edges of a travelling disc must clear the doorway, not just its centre. */
export function traceStraight(x: number, y: number, vx: number, vy: number, length: number): Trace {
    const speed = Math.hypot(vx, vy), path = [x, y];
    if (speed < 1) return { path, gate: false, gateX: 0, travel: 0, bounces: 0 };
    let dx = vx / speed, dy = vy / speed, remaining = length;
    for (let bounces = 0; bounces < 5 && remaining > 0; bounces++) {
        let t = remaining, nx = 0, ny = 0, gate = false;
        const consider = (time: number, ax: number, ay: number) => { if (time > 1e-3 && time < t) { t = time; nx = ax; ny = ay; } };
        if (dx < 0) consider((-W.halfWidth + R - x) / dx, 1, 0);
        if (dx > 0) consider((W.halfWidth - R - x) / dx, -1, 0);
        if (dy < 0) consider((-W.halfLength + R - y) / dy, 0, 1);
        if (dy > 0) consider((W.halfLength - R - y) / dy, 0, -1);
        if (y * dy < 0) {
            const face = -Math.sign(dy) * (W.dividerHalf + R), time = (face - y) / dy;
            if (time > 1e-3 && time < t) {
                const entryX = x + dx * time, exitX = entryX + dx / dy * Math.sign(dy) * 2 * (W.dividerHalf + R);
                t = time;
                if (Math.max(Math.abs(entryX), Math.abs(exitX)) <= W.gateHalf - R) gate = true;
                else { nx = 0; ny = -Math.sign(dy); }
            }
        }
        x += dx * t; y += dy * t; remaining -= t; path.push(x, y);
        if (gate) { path.push(x + dx * 95.2, y + dy * 95.2); return { path, gate: true, gateX: x, travel: length - remaining, bounces }; }
        if (!nx && !ny) break;
        const dot = dx * nx + dy * ny; dx -= 2 * dot * nx; dy -= 2 * dot * ny;
    }
    return { path, gate: false, gateX: 0, travel: length - remaining, bounces: 5 };
}
export function slideDistance(speed: number): number { return speed / P.drag - P.friction / (P.drag * P.drag) * Math.log(1 + P.drag * speed / P.friction); }
