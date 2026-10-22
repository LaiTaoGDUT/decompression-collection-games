/** Native 1_PINGPONG rules in Unity world coordinates (Y = height, Z = court).
 * Verified against Pallina 0x2716F44/0x2717340, Racchetta 0x271831C/0x2718854
 * and LevelController 0x25715B8. See tools/pingpong/verify-model.cjs.
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
    private cpuSpeed: number;
    private cpuOffset = point();
    private randomState: number;
    private events: PingPongEvent[] = [];
    private paddleBounds: PingPongPaddleBounds = {
        sideLimit: PINGPONG_WORLD.sideLimit,
        backLimit: PINGPONG_WORLD.paddleMaxZ + PINGPONG_WORLD.cpuOffsetRadius,
    };

    constructor(readonly config: PingPongConfig, readonly mode: PingPongMode = 'cpu', readonly difficulty = 0, seed = Date.now()) {
        this.randomState = seed >>> 0 || 1;
        this.cpuSpeed = config.cpuSpeed[0];
    }

    get difficultyCalculated(): number {
        const range = this.config.difficulties[clamp(this.difficulty, 0, 2)];
        const t = (clamp((this.scores.red - this.scores.blue) / this.config.scoreDifference, -1, 1) + 1) / 2;
        return range[0] + (range[1] - range[0]) * t;
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
        for (const player of ['red', 'blue'] as const) {
            const p = this.paddles[player];
            p.x = clamp(p.x, -sideLimit, sideLimit);
            p.z = player === 'red' ? clamp(p.z, -Math.min(w.paddleMaxZ, backLimit), -w.paddleMinZ)
                : clamp(p.z, w.paddleMinZ, Math.min(w.paddleMaxZ + (this.mode === 'cpu' ? w.cpuOffsetRadius : 0), backLimit));
        }
    }

    /** OnKeep runs once per touch frame, including stationary holds. Delta is finger motion, not paddle velocity. */
    keep(player: Player, x: number, z: number, dx: number, dz: number): void {
        if (this.phase === 'finished' || this.phase === 'disposed' || (player === 'blue' && this.mode === 'cpu')
            || ![x, z, dx, dz].every(Number.isFinite)) return;
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
        const players: Player[] = ['red', 'blue'];
        for (const name of players) {
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

    drainEvents(): PingPongEvent[] { const events = this.events; this.events = []; return events; }
    dispose(): void { this.phase = 'disposed'; this.release(); this.flight = undefined; this.events.length = 0; this.accumulator = 0; }

    private step(dt: number): void {
        this.time += dt;
        if (this.mode === 'cpu') this.moveCPU();
        if (this.phase === 'point') {
            this.pointDelay -= dt;
            if (this.pointDelay <= 1e-8) this.serve();
            return;
        }
        const old = { ...this.ball }, flight = this.flight;
        if (flight) {
            // Native FixedUpdate mutates CurvaBezier.puntoFinale, NOT its handles.
            flight.p3.x += this.paddles[this.lastStriker!].shot.spin * this.config.spin;
            flight.elapsed = Math.min(flight.duration, flight.elapsed + dt);
            const u = pingPongCurve(this.config.curve, flight.elapsed / flight.duration), v = 1 - u;
            const weights = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
            for (const axis of ['x', 'y', 'z'] as const) {
                this.ball[axis] = flight.p0[axis] * weights[0] + flight.p1[axis] * weights[1]
                    + flight.p2[axis] * weights[2] + flight.p3[axis] * weights[3];
            }
        }
        const dx = this.ball.x - old.x, dy = this.ball.y - old.y, dz = this.ball.z - old.z, length = Math.hypot(dx, dy, dz);
        this.direction = length > 1e-5 ? point(dx / length, dy / length, dz / length) : point();
        const contact = this.overlap();
        if (contact && contact !== this.previousContact) this.collide(contact, dy);
        this.previousContact = contact;
        if (flight && flight === this.flight && flight.elapsed >= flight.duration) this.fall();
    }

    private moveCPU(): void {
        const p = this.paddles.blue, b = this.ball;
        const z = this.phase === 'serve' ? 8 : b.z < 0 ? 15 : clamp(b.z + 4, 10, PINGPONG_WORLD.paddleMaxZ);
        const x = clamp(clamp(b.x, -PINGPONG_WORLD.sideLimit, PINGPONG_WORLD.sideLimit) + this.cpuOffset.x,
            -this.paddleBounds.sideLimit, this.paddleBounds.sideLimit);
        const targetZ = clamp(z + this.cpuOffset.z, PINGPONG_WORLD.paddleMinZ, this.paddleBounds.backLimit);
        const t = clamp(this.difficultyCalculated * this.cpuSpeed, 0, 1);
        p.x += (x - p.x) * t; p.y += (this.cpuOffset.y - p.y) * t; p.z += (targetZ - p.z) * t;
    }

    private overlap(): Contact {
        const b = this.ball, w = PINGPONG_WORLD, r = this.config.ballRadius;
        const tableDistance = Math.hypot(b.x - clamp(b.x, -w.tableHalfX, w.tableHalfX),
            b.y - clamp(b.y, w.tableBottom, 0), b.z - clamp(b.z, -w.tableHalfZ, w.tableHalfZ));
        if (tableDistance <= r) return 'table';
        // The source BoxColliders are disabled. The active capsules have vertical Y axes.
        for (const player of ['red', 'blue'] as const) {
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
            if (contact === 'blue' && this.mode === 'cpu') this.randomCPUShot();
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

    private randomCPUShot(): void {
        this.cpuOffset = point();
        // 87.5% Vector3.zero; 12.5% Random.insideUnitSphere * 2 with Y discarded.
        if (this.random() < .125) {
            let x: number, y: number, z: number;
            do { x = this.random() * 2 - 1; y = this.random() * 2 - 1; z = this.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
            this.cpuOffset = point(x * PINGPONG_WORLD.cpuOffsetRadius, 0, z * PINGPONG_WORLD.cpuOffsetRadius);
        }
        this.paddles.blue.shot.direction = this.random() * 1.6 - .8;
        this.cpuSpeed = this.config.cpuSpeed[0] + this.random() * (this.config.cpuSpeed[1] - this.config.cpuSpeed[0]);
        this.random(); // Original consumes a random power, then overwrites it with difficultyCalculated.
        this.paddles.blue.shot.power = this.difficultyCalculated;
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
    }

    private emit(type: PingPongEvent['type'], player?: Player): void {
        this.events.push({ type, player, x: this.ball.x, z: this.ball.z, dx: this.direction.x, dz: this.direction.z });
    }
    private random(): number {
        let v = this.randomState; v ^= v << 13; v ^= v >>> 17; v ^= v << 5; this.randomState = v >>> 0;
        return this.randomState / 4294967296;
    }
}
