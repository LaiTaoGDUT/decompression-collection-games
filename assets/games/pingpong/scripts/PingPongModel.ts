/** Native 1_PINGPONG ball/contact rules in Unity world coordinates (Y = height, Z = court).
 * Verified against Pallina 0x2716F44/0x2717340, Racchetta 0x271831C/0x2718854
 * and LevelController 0x25715B8. CPU strategy is tuned independently of those rules.
 */
export type Player = 'red' | 'blue';
export type PingPongMode = 'cpu' | 'local';
export interface Point3 { x: number; y: number; z: number; }
export interface Shot { spin: number; direction: number; power: number; }
export interface Paddle extends Point3 { shot: Shot; }
export interface PingPongPaddleBounds { sideLimit: number; backLimit: number; }
export interface PingPongConfig {
    version: number; fixedStep: number; scoreToWin: number; scoreDifference: number;
    difficulties: number[][]; shotSeconds: number; ballRadius: number; direction: number;
    spin: number; power: number; bounce: number; arc: number; floor: number;
    curve: number[][]; cpuSpeed: number[]; paddleLerp: number;
    ballScale: { a: number; b: number; scaleA: number; scaleB: number; curve: number[][] }[];
    impact: { seconds: number; size: number; width: number; height: number;
        parts: { position: number[][]; scale: number[][]; angle: number }[] };
}
export interface PingPongEvent { type: 'serve' | 'hit' | 'bounce' | 'point' | 'finished'; player?: Player; x: number; z: number; dx: number; dz: number; }
interface Flight { p0: Point3; p1: Point3; p2: Point3; p3: Point3; elapsed: number; duration: number; }
type Contact = Player | 'table' | undefined;
export const PINGPONG_WORLD = Object.freeze({
    tableHalfX: 6.08, tableHalfZ: 10.96, tableBottom: -1.2,
    paddleRadius: 1.67, paddleHeight: 10, paddleOffset: .66,
    paddleWidth: 4.64, paddleLength: 5.92, sideLimit: 9.241706,
    paddleStartZ: 12, paddleMinZ: 5, paddleMaxZ: 20, cpuOffsetRadius: 2,
    tableWidth: 12.27, tableLength: 22.05, fillWidth: 10.968911, fillLength: 20.755993,
});
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const point = (x = 0, y = 0, z = 0): Point3 => ({ x, y, z });
const opponent = (p: Player): Player => p === 'red' ? 'blue' : 'red';
const shot = (): Shot => ({ spin: 0, direction: 0, power: 0 });
const PLAYERS: readonly Player[] = ['red', 'blue'];
const NO_EVENTS: readonly PingPongEvent[] = Object.freeze([]);
interface CPUSettings {
    reaction: number; speed: number; follow: number; prediction: number;
    trackingError: number; placement: number; aimError: number; power: number;
}
/** Separate reaction, reach and placement; match scores never weaken the selected level.
 * Speed is world units/second; follow applies once per fixed physics tick.
 */
const CPU_LEVELS: readonly CPUSettings[] = [
    { reaction: .18, speed: 18, follow: .14, prediction: 0, trackingError: 1.1, placement: 1.4, aimError: 1.1, power: .35 },
    { reaction: .12, speed: 25, follow: .22, prediction: .06, trackingError: .55, placement: 2.9, aimError: .6, power: .65 },
    { reaction: .08, speed: 27, follow: .24, prediction: .06, trackingError: .35, placement: 4.6, aimError: .12, power: 1 },
];

/** Unity unweighted AnimationCurve Hermite evaluation; all imported keys are unweighted. */
export function pingPongCurve(keys: number[][], t: number): number {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1], b = keys[i];
        if (t > b[0]) continue;
        const span = b[0] - a[0], u = (t - a[0]) / span, u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * span * a[3]
            + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * span * b[2];
    }
    return keys[keys.length - 1][1];
}

export function validatePingPongConfig(value: unknown): PingPongConfig {
    const c = value as PingPongConfig;
    if (!c || c.version !== 1 || !Number.isInteger(c.scoreToWin) || c.scoreToWin <= 0 || c.fixedStep !== .02
        || !Array.isArray(c.difficulties) || c.difficulties.length !== 3
        || !Array.isArray(c.curve) || c.curve.length !== 2 || !Array.isArray(c.ballScale)
        || !c.impact || !(c.impact.seconds > 0) || c.impact.parts?.length !== 8) throw Error('Invalid PingPong source settings');
    for (const key of ['shotSeconds', 'ballRadius', 'direction', 'spin', 'power', 'bounce', 'arc', 'scoreDifference', 'paddleLerp']) {
        if (!Number.isFinite(c[key]) || c[key] <= 0) throw Error(`Invalid PingPong ${key}`);
    }
    for (const keys of [c.curve, ...c.ballScale.map(r => r.curve)]) {
        if (keys.some(k => k.length !== 7 || k.some(v => !Number.isFinite(v)) || k[4] !== 0)) throw Error('Invalid PingPong curve');
    }
    return c;
}

export class PingPongModel {
    readonly paddles: Record<Player, Paddle> = {
        red: { ...point(0, 2, -PINGPONG_WORLD.paddleStartZ), shot: shot() },
        blue: { ...point(0, 2.89, PINGPONG_WORLD.paddleStartZ), shot: shot() },
    };
    readonly scores: Record<Player, number> = { red: 0, blue: 0 };
    ball = point(0, 2, -8);
    direction = point();
    phase: 'serve' | 'rally' | 'point' | 'finished' | 'disposed' = 'serve';
    server: Player = 'red';
    lastStriker?: Player;
    lastContact: Contact = 'table';
    winner?: Player;
    time = 0;
    hits = 0;
    rally = 0;
    bestRally = 0;
    private flight?: Flight;
    private previousContact?: Contact;
    private accumulator = 0;
    private pointDelay = 0;
    private readonly cpu: CPUSettings;
    private cpuThinkIn = 0;
    private cpuTargetX = 0;
    private cpuTargetZ: number = PINGPONG_WORLD.paddleStartZ;
    private cpuErrorX = 0;
    private randomState: number;
    private events: PingPongEvent[] = [];
    private paddleBounds: PingPongPaddleBounds = {
        sideLimit: PINGPONG_WORLD.sideLimit,
        backLimit: PINGPONG_WORLD.paddleMaxZ + PINGPONG_WORLD.cpuOffsetRadius,
    };

    constructor(readonly config: PingPongConfig, readonly mode: PingPongMode = 'cpu', readonly difficulty = 0, seed = Date.now()) {
        this.randomState = seed >>> 0 || 1;
        this.cpu = CPU_LEVELS[clamp(Math.trunc(difficulty), 0, CPU_LEVELS.length - 1)];
    }

    get difficultyCalculated(): number {
        return this.cpu.power;
    }

    /** Apply viewport limits to simulation positions as well as input/AI targets,
     * so resizing cannot leave a visible paddle detached from its collider.
     */
    setPaddleBounds(bounds: PingPongPaddleBounds): void {
        const w = PINGPONG_WORLD;
        this.paddleBounds = {
            sideLimit: clamp(bounds.sideLimit, 0, w.sideLimit),
            backLimit: clamp(bounds.backLimit, w.paddleMinZ, w.paddleMaxZ + w.cpuOffsetRadius),
        };
        const { sideLimit, backLimit } = this.paddleBounds;
        for (const player of PLAYERS) {
            const p = this.paddles[player];
            p.x = clamp(p.x, -sideLimit, sideLimit);
            p.z = player === 'red' ? clamp(p.z, -Math.min(w.paddleMaxZ, backLimit), -w.paddleMinZ)
                : clamp(p.z, w.paddleMinZ, Math.min(w.paddleMaxZ + (this.mode === 'cpu' ? w.cpuOffsetRadius : 0), backLimit));
        }
    }

    /** OnKeep runs once per touch frame, including stationary holds. Delta is finger motion, not paddle velocity. */
    keep(player: Player, x: number, z: number, dx: number, dz: number): void {
        if (this.phase === 'finished' || this.phase === 'disposed' || (player === 'blue' && this.mode === 'cpu')
            || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
        // Touchable's original half-court trigger is 30 x 25, centered at Z +/-13.
        // Crossing the net suspends OnKeep until this finger returns to its own half.
        if (Math.abs(x) > 15 || Math.abs(z) > 25.5 || (player === 'red' ? z > -.5 : z < .5)) return;
        const p = this.paddles[player], t = this.config.paddleLerp;
        x = clamp(x, -this.paddleBounds.sideLimit, this.paddleBounds.sideLimit);
        const w = PINGPONG_WORLD;
        const backLimit = Math.min(w.paddleMaxZ, this.paddleBounds.backLimit);
        z = player === 'red' ? clamp(z, -backLimit, -w.paddleMinZ) : clamp(z, w.paddleMinZ, backLimit);
        p.x += (x - p.x) * t; p.y += (2 - p.y) * t; p.z += (z - p.z) * t;
        p.shot.spin = clamp(dx, -1, 1);
        p.shot.power = player === 'red' ? clamp(dz, -.5, 1) : -clamp(dz, -1, .5);
        const magnitude = Math.hypot(dx, dz);
        p.shot.direction = magnitude > 1e-5 ? dx / magnitude : 0;
    }

    release(player?: Player): void {
        // A conditional typed array directly in for-of triggers the Creator 3.8.8
        // WeChat Babel transform's Flow/TypeScript union inference bug.
        for (const name of PLAYERS) {
            if (!player || player === name) {
                const s = this.paddles[name].shot; s.spin = s.direction = s.power = 0;
            }
        }
    }

    advance(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'finished' || this.phase === 'disposed') return;
        this.accumulator += Math.min(dt, .1);
        while (this.accumulator + 1e-9 >= this.config.fixedStep) {
            this.accumulator -= this.config.fixedStep;
            this.step(this.config.fixedStep);
            if (this.winner) { this.accumulator = 0; break; }
        }
    }

    drainEvents(): readonly PingPongEvent[] {
        if (!this.events.length) return NO_EVENTS;
        const events = this.events; this.events = []; return events;
    }
    dispose(): void { this.phase = 'disposed'; this.release(); this.flight = undefined; this.events.length = 0; this.accumulator = 0; }

    private step(dt: number): void {
        this.time += dt;
        if (this.mode === 'cpu') this.moveCPU(dt);
        if (this.phase === 'point') {
            this.pointDelay -= dt;
            if (this.pointDelay <= 1e-8) this.serve();
            return;
        }
        const b = this.ball, oldX = b.x, oldY = b.y, oldZ = b.z, flight = this.flight;
        if (flight) {
            // Native FixedUpdate mutates CurvaBezier.puntoFinale, NOT its handles.
            flight.p3.x += this.paddles[this.lastStriker!].shot.spin * this.config.spin;
            flight.elapsed = Math.min(flight.duration, flight.elapsed + dt);
            const u = pingPongCurve(this.config.curve, flight.elapsed / flight.duration), v = 1 - u;
            // Keep the original operation order without allocating tick-local vectors/arrays.
            const a0 = v * v * v, a1 = 3 * v * v * u, a2 = 3 * v * u * u, a3 = u * u * u;
            b.x = flight.p0.x * a0 + flight.p1.x * a1 + flight.p2.x * a2 + flight.p3.x * a3;
            b.y = flight.p0.y * a0 + flight.p1.y * a1 + flight.p2.y * a2 + flight.p3.y * a3;
            b.z = flight.p0.z * a0 + flight.p1.z * a1 + flight.p2.z * a2 + flight.p3.z * a3;
        }
        const dx = b.x - oldX, dy = b.y - oldY, dz = b.z - oldZ, length = Math.hypot(dx, dy, dz);
        const direction = this.direction;
        direction.x = length > 1e-5 ? dx / length : 0;
        direction.y = length > 1e-5 ? dy / length : 0;
        direction.z = length > 1e-5 ? dz / length : 0;
        const contact = this.overlap();
        if (contact && contact !== this.previousContact) this.collide(contact, dy);
        this.previousContact = contact;
        if (flight && flight === this.flight && flight.elapsed >= flight.duration) this.fall();
    }

    private moveCPU(dt: number): void {
        const p = this.paddles.blue, b = this.ball, c = this.cpu;
        this.cpuThinkIn -= dt;
        if (this.cpuThinkIn <= 1e-8) {
            this.cpuThinkIn = c.reaction;
            let x = 0, z: number = PINGPONG_WORLD.paddleStartZ;
            if (this.phase === 'serve' && this.server === 'blue') z = 8;
            else if (this.phase === 'rally' && this.lastStriker === 'red') {
                x = b.x; z = b.z;
                const f = this.flight;
                if (f && c.prediction > 0) {
                    const ahead = Math.min(c.prediction, f.duration - f.elapsed);
                    const u = pingPongCurve(this.config.curve, (f.elapsed + ahead) / f.duration), v = 1 - u;
                    const a0 = v * v * v, a1 = 3 * v * v * u, a2 = 3 * v * u * u, a3 = u * u * u;
                    // Extrapolate only the currently visible spin, never future finger input.
                    const endX = f.p3.x + this.paddles.red.shot.spin * this.config.spin * ahead / this.config.fixedStep;
                    x = f.p0.x * a0 + f.p1.x * a1 + f.p2.x * a2 + endX * a3;
                    z = f.p0.z * a0 + f.p1.z * a1 + f.p2.z * a2 + f.p3.z * a3;
                }
                x += this.cpuErrorX;
                // Stay within reach of the incoming ball instead of fleeing four units behind it.
                z += 1.1;
            }
            this.cpuTargetX = clamp(x, -this.paddleBounds.sideLimit, this.paddleBounds.sideLimit);
            this.cpuTargetZ = clamp(z, PINGPONG_WORLD.paddleMinZ, this.paddleBounds.backLimit);
        }
        // Limits can shrink between decisions. Enforce them on positions as well as targets.
        const dx = (clamp(this.cpuTargetX, -this.paddleBounds.sideLimit, this.paddleBounds.sideLimit) - p.x) * c.follow;
        const dz = (clamp(this.cpuTargetZ, PINGPONG_WORLD.paddleMinZ, this.paddleBounds.backLimit) - p.z) * c.follow;
        const distance = Math.hypot(dx, dz), fraction = distance > c.speed * dt ? c.speed * dt / distance : 1;
        p.x += dx * fraction; p.z += dz * fraction;
        // Use the same paddle height as a held human paddle and the same capsule collider.
        p.y += (2 - p.y) * c.follow;
    }

    private overlap(): Contact {
        const b = this.ball, w = PINGPONG_WORLD, r = this.config.ballRadius;
        const tableDistance = Math.hypot(b.x - clamp(b.x, -w.tableHalfX, w.tableHalfX),
            b.y - clamp(b.y, w.tableBottom, 0), b.z - clamp(b.z, -w.tableHalfZ, w.tableHalfZ));
        if (tableDistance <= r) return 'table';
        // The source BoxColliders are disabled. The active capsules have vertical Y axes.
        for (const player of PLAYERS) {
            const p = this.paddles[player], centerZ = p.z + (player === 'red' ? w.paddleOffset : -w.paddleOffset);
            const halfSegment = w.paddleHeight / 2 - w.paddleRadius;
            if (Math.hypot(b.x - p.x, b.z - centerZ, b.y - clamp(b.y, p.y - halfSegment, p.y + halfSegment)) <= r + w.paddleRadius) return player;
        }
        return undefined;
    }

    private collide(contact: Exclude<Contact, undefined>, dy: number): void {
        const c = this.config, b = this.ball;
        let end: Point3, duration = this.flight?.duration ?? c.shotSeconds;
        if (contact === 'table') {
            if (dy > 0 || !this.lastStriker) return;
            end = point(b.x + this.direction.x * c.bounce, b.y + c.floor, b.z + this.direction.z * c.bounce);
            this.lastContact = 'table';
            this.emit('bounce');
        } else {
            if (this.lastContact !== 'table') return;
            this.lastStriker = contact;
            if (this.mode === 'cpu') {
                if (contact === 'blue') this.chooseCPUShot();
                else this.cpuErrorX = (this.random() * 2 - 1) * this.cpu.trackingError;
            }
            const s = this.paddles[contact].shot;
            end = point(s.direction * c.direction * (.7 + s.power * .3), c.floor,
                (contact === 'red' ? 1 : -1) * (5 + s.power * c.power));
            duration = c.shotSeconds - s.power * .2;
            this.lastContact = contact;
            this.phase = 'rally'; this.hits++; this.rally++; this.bestRally = Math.max(this.bestRally, this.rally);
            this.emit('hit', contact);
        }
        // 0x2717788: first handle lerps 20%; 0x27177E8 loads the END transform for the second.
        this.flight = { p0: { ...b }, p1: point(b.x + (end.x - b.x) * .2, c.arc, b.z + (end.z - b.z) * .2),
            p2: point(end.x, c.arc, end.z), p3: end, elapsed: 0, duration };
    }

    private chooseCPUShot(): void {
        const c = this.config, level = this.cpu, s = this.paddles.blue.shot, b = this.ball;
        s.power = level.power; s.spin = 0;
        const redX = this.paddles.red.x;
        const side = Math.abs(redX) > .6 ? redX > 0 ? -1 : 1 : this.random() < .5 ? -1 : 1;
        const landingX = side * level.placement + (this.random() * 2 - 1) * level.aimError;
        // Solve placement at the first legal table contact, using the real shot curve
        // and discrete physics step. This changes the shot choice, never ball physics.
        const duration = c.shotSeconds - s.power * .2;
        let blend = 1;
        for (let elapsed = c.fixedStep; elapsed <= duration; elapsed += c.fixedStep) {
            const u = pingPongCurve(c.curve, elapsed / duration), v = 1 - u;
            const a0 = v * v * v, a1 = 3 * v * v * u, a2 = 3 * v * u * u, a3 = u * u * u;
            if (b.y * a0 + c.arc * (a1 + a2) + c.floor * a3 <= c.ballRadius) {
                blend = .2 * a1 + a2 + a3; break;
            }
        }
        const endX = (landingX - b.x * (1 - blend)) / blend;
        s.direction = clamp(endX / (c.direction * (.7 + s.power * .3)), -1, 1);
    }

    private fall(): void {
        if (!this.lastStriker || this.phase !== 'rally') return;
        const scorer = this.lastContact === 'table' ? this.lastStriker : opponent(this.lastStriker);
        this.flight = undefined; this.scores[scorer]++; this.emit('point', scorer);
        if (this.scores[scorer] >= this.config.scoreToWin) {
            this.winner = scorer; this.phase = 'finished'; this.emit('finished', scorer); return;
        }
        if ((this.scores.red + this.scores.blue) % 2 === 0) this.server = opponent(this.server);
        this.phase = 'point'; this.pointDelay = 1;
    }

    private serve(): void {
        this.phase = 'serve'; this.ball = point(0, 2, this.server === 'red' ? -8 : 8);
        this.flight = undefined; this.lastStriker = undefined; this.lastContact = 'table'; this.previousContact = undefined;
        this.direction = point(); this.rally = 0; this.emit('serve', this.server);
        this.cpuThinkIn = 0; this.cpuErrorX = 0;
    }

    private emit(type: PingPongEvent['type'], player?: Player): void {
        this.events.push({ type, player, x: this.ball.x, z: this.ball.z, dx: this.direction.x, dz: this.direction.z });
    }
    private random(): number {
        let v = this.randomState; v ^= v << 13; v ^= v >>> 17; v ^= v << 5; this.randomState = v >>> 0;
        return this.randomState / 4294967296;
    }
}
