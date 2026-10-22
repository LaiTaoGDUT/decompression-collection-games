import { dunkCurve, type DunkConfig, type DunkDifficulty } from './FlappyDunkConfig';
import Box2D from './vendor/Box2D.js';
const { b2World, b2Vec2, b2CircleShape, b2PolygonShape, b2ContactListener } = Box2D;

export type DunkFailure = 'floor' | 'roof' | 'miss' | 'direction' | 'hazard';
export interface DunkHoop {
    readonly id: number;
    readonly baseX: number; readonly baseY: number;
    x: number; y: number;
    readonly angle: number; readonly scale: number;
    shield: boolean;
    readonly hazard: boolean; readonly inverted: boolean;
    readonly moveX: number; readonly moveY: number;
    readonly moveSpeed: number; readonly moveStart: number;
    age: number; hit: boolean; contacts: number; entered: boolean; resolved: boolean; fade: number;
}
export type DunkEvent =
    | { type: 'jump' }
    | { type: 'rim'; hoop: number; first: boolean }
    | { type: 'score'; hoop: number; x: number; y: number; points: number; swish: boolean }
    | { type: 'shield' | 'shieldLost' | 'wallWarning' }
    | { type: 'failure'; reason: DunkFailure };

type WallPhase = 'open' | 'queued' | 'warning' | 'closing' | 'closed' | 'opening';
const WALL_PHASES: readonly WallPhase[] = ['open', 'queued', 'warning', 'closing', 'closed', 'opening'];
const HOOP_NUMBERS = ['id', 'baseX', 'baseY', 'x', 'y', 'angle', 'scale', 'moveX', 'moveY', 'moveSpeed', 'moveStart', 'age', 'contacts', 'fade'] as const;
const HOOP_FLAGS = ['shield', 'hazard', 'inverted', 'hit', 'entered', 'resolved'] as const;
const STATE_NUMBERS = ['x', 'y', 'vx', 'rotation', 'time', 'score', 'multiplier', 'cleared', 'bestCombo', 'invincible',
    'wallInset', 'randomState', 'nextX', 'spawnCount', 'serial', 'shieldCooldown', 'hazardCooldown', 'wallCooldown',
    'wallQueue', 'wallClock', 'wallAmount', 'wallDuration', 'wallStay', 'wallFrom', 'wallDelay'] as const;

/** A live round, saved so the player can leave and carry on later. Plain JSON numbers and flags only;
 * the Box2D world is rebuilt from it. The ball resumes level (vertical speed 0) after the countdown. */
export interface DunkRoundSnapshot {
    readonly version: 1;
    readonly difficulty: number;
    readonly state: Readonly<Record<typeof STATE_NUMBERS[number], number>>;
    readonly shield: boolean; readonly lastMoving: boolean;
    readonly wallPhase: WallPhase; readonly group: readonly number[];
    readonly hoops: readonly Readonly<DunkHoop>[];
}

/** Validate untrusted save data; anything malformed is dropped rather than half-restored. */
export function readDunkRoundSnapshot(value: unknown): DunkRoundSnapshot | undefined {
    const v = value as Partial<DunkRoundSnapshot> | null;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (!v || typeof v !== 'object' || v.version !== 1 || !finite(v.difficulty) || !v.state || typeof v.state !== 'object'
        || typeof v.shield !== 'boolean' || typeof v.lastMoving !== 'boolean' || WALL_PHASES.indexOf(v.wallPhase as WallPhase) < 0
        || !Array.isArray(v.group) || !v.group.every(finite) || !Array.isArray(v.hoops) || v.hoops.length > 8) return undefined;
    if (!STATE_NUMBERS.every(key => finite((v.state as Record<string, unknown>)[key]))) return undefined;
    if (!v.hoops.every(h => h && typeof h === 'object' && HOOP_NUMBERS.every(k => finite((h as Record<string, unknown>)[k]))
        && HOOP_FLAGS.every(k => typeof (h as Record<string, unknown>)[k] === 'boolean'))) return undefined;
    return v as DunkRoundSnapshot;
}

// Serialized Unity camera, colliders and TimeManager, in original Unity world units.
export const DUNK_WORLD = Object.freeze({ width: 7.5, height: 10, wall: 3.7,
    cameraHalfHeight: 5, wallDefaultOffset: .8, wallHalfHeight: .5,
    rimHalfWidth: .782000005, rimY: -.0209999997, rimRadius: .479999989 * .367090255,
    triggerHalfWidth: .25, triggerHalfHeight: .05, fixedStep: .02, fadeSeconds: .5 });
const RAD = Math.PI / 180;
type Contact = { kind: 'rim' | 'trigger' | 'floor' | 'roof'; hoop?: number; begin: boolean };

/** Private Box2D world with the source collider shapes, materials, 50 Hz step and
 * 8/3 solver iterations. No global physics state or Cocos physics callbacks.
 * Rule branches are traced to bounded .s methods, not decompiler spillover.
 */
export class FlappyDunkModel {
    x = 0; y = 0; vx = 0; vy = 0; rotation = 0; angularVelocity = 0;
    time = 0; score = 0; multiplier = 1; cleared = 0; bestCombo = 1;
    shield = false; invincible = 0; started = false; alive = true;
    failure?: DunkFailure;
    wingRotation = 0;
    wings?: { x: number; y: number; rotation: number }[];
    wallInset = 0;
    wallPhase: WallPhase = 'open';
    readonly hoops: DunkHoop[] = [];
    private events: DunkEvent[] = [];
    private accumulator = 0;
    private randomState: number;
    private readonly difficulty: DunkDifficulty;
    private group: readonly number[];
    private nextX = 4;
    private spawnCount = 0;
    private serial = 0;
    private shieldCooldown = 0; private hazardCooldown = 0; private wallCooldown = 0;
    private wallQueue = 0; private wallClock = 0; private wallAmount = 0; private wallDuration = 0; private wallStay = 0;
    private wallFrom = 0; private wallDelay = 0; private lastMoving = false;
    /** Ball centre before the current physics step: the side of the hoop plane it came from. */
    private stepFromX = 0; private stepFromY = 0;
    private world: any;
    private ballBody: any;
    private floorBody: any;
    private roofBody: any;
    private readonly bodies = new Map<number, any>();
    private contacts: Contact[] = [];
    private wingBodies: any[] = [];

    constructor(readonly config: DunkConfig, readonly difficultyIndex = 0, seed = 0x42d00d) {
        this.randomState = seed >>> 0 || 1;
        this.difficulty = config.difficulties[difficultyIndex];
        if (!this.difficulty) throw new Error('Unknown Dunk difficulty');
        this.group = this.chooseGroup();
        this.world = new b2World(new b2Vec2(0, config.ball.gravity));
        this.ballBody = this.world.CreateBody({ type: 2, bullet: true, angularDamping: .05, allowSleep: false });
        this.ballBody.CreateFixture({ shape: new b2CircleShape(this.radius), density: 1, friction: .4, restitution: 0 });
        this.ballBody.SetMassData({ mass: 1, center: new b2Vec2(), I: .5 * this.radius * this.radius });
        const shape = new b2PolygonShape(); shape.SetAsBox(10, DUNK_WORLD.wallHalfHeight);
        this.floorBody = this.world.CreateBody({ type: 0 });
        this.floorBody.CreateFixture({ shape, friction: .6, restitution: .5, userData: { kind: 'floor' } });
        this.roofBody = this.world.CreateBody({ type: 0 });
        const roof = new b2PolygonShape(); roof.SetAsBox(5, DUNK_WORLD.wallHalfHeight);
        this.roofBody.CreateFixture({ shape: roof, friction: .6, restitution: .5, userData: { kind: 'roof' } });
        const listener = new b2ContactListener();
        listener.BeginContact = (c: any) => this.queueContact(c, true);
        listener.EndContact = (c: any) => this.queueContact(c, false);
        this.world.SetContactListener(listener);
        this.wallCooldown = Math.trunc(this.curve('ShrinkingWallsCooldown'));
        for (let i = 0; i < 3; i++) this.spawnHoop(i === 0);
        this.positionWalls();
    }

    get radius(): number { return this.config.ball.radius * this.config.ball.size; }
    get wallLimit(): number { return DUNK_WORLD.wall - this.wallInset; }
    get hasWallLimits(): boolean { return this.wallPhase !== 'open' && this.wallPhase !== 'opening'; }

    jump(): boolean {
        if (!this.alive || !this.world) return false;
        this.started = true;
        // Jump 0x27CDB24: both ordinary branches use .75, including subsequent taps.
        this.vx = this.config.ball.speeds[this.difficultyIndex][0] * .75;
        this.vy = this.config.ball.speeds[this.difficultyIndex][1] * .75;
        if (this.angularVelocity >= 0) this.angularVelocity = this.range(-45, -90);
        this.events.push({ type: 'jump' });
        return true;
    }

    advance(delta: number): void {
        if (!this.world || !Number.isFinite(delta) || delta <= 0) return;
        this.accumulator += Math.min(delta, .1);
        while (this.accumulator + 1e-10 >= DUNK_WORLD.fixedStep) {
            this.accumulator -= DUNK_WORLD.fixedStep;
            this.step(DUNK_WORLD.fixedStep);
        }
    }

    /** StartGame(extraLife): retain score, X, difficulty progress and feature cooldowns. */
    revive(): boolean {
        if (this.alive || !this.world) return false;
        this.clearHoops();
        this.clearWings();
        this.y = this.vx = this.vy = this.rotation = this.angularVelocity = 0;
        this.multiplier = 1; this.shield = false; this.invincible = 0;
        this.started = false; this.alive = true; this.failure = undefined;
        this.accumulator = 0; this.events.length = this.contacts.length = 0;
        this.wallPhase = 'open'; this.wallInset = this.wallClock = 0;
        this.wallCooldown = Math.trunc(this.curve('ShrinkingWallsCooldown'));
        this.nextX = this.x + 4; this.group = this.chooseGroup();
        this.ballBody.SetLinearDamping(0); this.ballBody.SetAngularDamping(.05);
        this.syncBall(); this.positionWalls();
        for (let i = 0; i < 3; i++) this.spawnHoop(i === 0);
        return true;
    }

    /** Controller.Restart calls StartGame(false) on the existing prefab: X and
     * feature cooldowns survive, while score and procedural difficulty restart. */
    restart(): boolean {
        if (!this.world) return false;
        this.alive = false; this.score = this.cleared = this.spawnCount = this.time = 0; this.bestCombo = 1;
        return this.revive();
    }

    /** The live round, or undefined when there is nothing to carry on (not started, or already lost). */
    snapshot(): DunkRoundSnapshot | undefined {
        if (!this.world || !this.started || !this.alive) return undefined;
        const state = {} as Record<typeof STATE_NUMBERS[number], number>;
        for (const key of STATE_NUMBERS) state[key] = this[key];
        return { version: 1, difficulty: this.difficultyIndex, state, shield: this.shield, lastMoving: this.lastMoving,
            wallPhase: this.wallPhase, group: Array.from(this.group), hoops: this.hoops.map(h => ({ ...h })) };
    }

    /** Rebuild a saved round on this freshly constructed model (same difficulty). The ball waits, not
     * started, until `resumeRound()`; the walls, hoop colliders and random stream continue exactly. */
    restore(snapshot: DunkRoundSnapshot): boolean {
        if (!this.world || snapshot.difficulty !== this.difficultyIndex) return false;
        this.clearHoops(); this.clearWings();
        for (const key of STATE_NUMBERS) this[key] = snapshot.state[key];
        this.vy = this.angularVelocity = 0;
        this.shield = snapshot.shield; this.lastMoving = snapshot.lastMoving;
        this.wallPhase = snapshot.wallPhase; this.group = Array.from(snapshot.group);
        this.started = false; this.alive = true; this.failure = undefined;
        this.accumulator = 0; this.events.length = this.contacts.length = 0;
        for (const saved of snapshot.hoops) {
            const hoop: DunkHoop = { ...saved };
            this.hoops.push(hoop); this.createHoopBody(hoop);
            if (hoop.resolved) this.bodies.get(hoop.id)?.SetActive(false);
        }
        this.syncBall(); this.positionWalls();
        return true;
    }

    /** End of the resume countdown: the round carries on from the restored state. */
    resumeRound(): void { if (this.world && this.alive) this.started = true; }

    drainEvents(): DunkEvent[] { const events = this.events; this.events = []; return events; }

    dispose(): void {
        if (!this.world) return;
        this.world.SetContactListener(new b2ContactListener());
        this.clearWings();
        this.clearHoops();
        this.world.DestroyBody(this.ballBody); this.world.DestroyBody(this.floorBody); this.world.DestroyBody(this.roofBody);
        this.world = this.ballBody = this.floorBody = this.roofBody = undefined;
        this.events.length = this.contacts.length = 0;
    }

    private step(dt: number): void {
        if (this.alive && this.started) this.time += dt;
        this.invincible = Math.max(0, this.invincible - dt);
        if (this.alive) this.advanceWalls(dt);
        for (const hoop of this.hoops) {
            hoop.age += dt; if (this.alive) this.moveHoop(hoop);
            if (hoop.resolved) hoop.fade += dt;
            this.bodies.get(hoop.id)?.SetTransformVec(new b2Vec2(hoop.x, hoop.y), hoop.angle * RAD);
        }
        if (!this.started) return;
        this.syncBall(); this.positionWalls();
        this.stepFromX = this.x; this.stepFromY = this.y;
        this.world.Step(dt, 8, 3);
        const p = this.ballBody.GetPosition(), v = this.ballBody.GetLinearVelocity();
        this.x = p.x; this.y = p.y; this.vx = v.x; this.vy = v.y;
        this.rotation = this.ballBody.GetAngle() / RAD;
        this.angularVelocity = this.ballBody.GetAngularVelocity() / RAD;
        this.wingBodies.forEach((body, i) => {
            const p = body.GetPosition();
            this.wings![i] = { x: p.x, y: p.y, rotation: body.GetAngle() / RAD };
        });
        const contacts = this.contacts; this.contacts = [];
        for (const contact of contacts) {
            if (this.alive) this.handleContact(contact);
            // A ball already lost (missed or wrong-way hoop) still sheds its wings when it lands or hits the roof.
            else if (contact.begin && (contact.kind === 'floor' || contact.kind === 'roof') && !this.wings) this.detachWings();
        }
        for (const hoop of this.hoops) {
            if (!hoop.resolved && this.x > hoop.x + this.config.missOffset) {
                this.resolve(hoop); // LateUpdate despawns before reporting a miss.
                if (this.alive) this.damage('miss');
            }
        }
        for (let i = this.hoops.length - 1; i >= 0; i--) {
            const hoop = this.hoops[i];
            if (!hoop.resolved || hoop.fade + 1e-9 < DUNK_WORLD.fadeSeconds) continue;
            this.world.DestroyBody(this.bodies.get(hoop.id)); this.bodies.delete(hoop.id);
            this.hoops.splice(i, 1);
            if (this.alive) this.spawnHoop();
        }
    }

    private syncBall(): void {
        const p = this.ballBody.GetPosition();
        if (p.x !== this.x || p.y !== this.y || this.ballBody.GetAngle() !== this.rotation * RAD)
            this.ballBody.SetTransformVec(new b2Vec2(this.x, this.y), this.rotation * RAD);
        this.ballBody.SetLinearVelocity(new b2Vec2(this.vx, this.vy));
        this.ballBody.SetAngularVelocity(this.angularVelocity * RAD); this.ballBody.SetAwake(true);
    }

    private positionWalls(): void {
        const center = this.x + this.config.cameraOffset[0], y = this.wallLimit + DUNK_WORLD.wallHalfHeight;
        this.floorBody.SetTransformVec(new b2Vec2(center, -y), 0);
        this.roofBody.SetTransformVec(new b2Vec2(center, y), 0);
    }

    private queueContact(contact: any, begin: boolean): void {
        const a = contact.GetFixtureA(), b = contact.GetFixtureB();
        const other = a.GetBody() === this.ballBody ? b : b.GetBody() === this.ballBody ? a : undefined;
        const data = other?.GetUserData();
        if (data) this.contacts.push({ ...data, begin });
    }

    private handleContact(contact: Contact): void {
        if (contact.kind === 'roof' || contact.kind === 'floor') {
            if (contact.begin) this.damage(contact.kind);
            return;
        }
        const hoop = this.hoops.find(h => h.id === contact.hoop);
        if (!hoop || hoop.resolved) return;
        if (contact.kind === 'rim') {
            if (!contact.begin) return;
            if (hoop.hazard && !this.damage('hazard')) return;
            this.multiplier = 1;
            this.events.push({ type: 'rim', hoop: hoop.id, first: !hoop.hit }); hoop.hit = true;
        } else {
            const angle = hoop.angle * RAD;
            const local = (x: number, y: number) => -Math.sin(angle) * (x - hoop.x) + Math.cos(angle) * (y - hoop.y);
            const localY = local(this.x, this.y);
            if (contact.begin) {
                // Judge the entry side from where the ball was before this step: a fast drop can cross
                // the hoop plane within the very step that first touches the trigger.
                hoop.entered = local(this.stepFromX, this.stepFromY) > 0;
                if (!hoop.entered && this.damage('direction')) this.resolve(hoop);
            } else if (hoop.entered && localY < 0) this.scoreHoop(hoop);
        }
    }

    private scoreHoop(hoop: DunkHoop): void {
        if (hoop.resolved || !this.alive) return;
        this.resolve(hoop);
        const swish = !hoop.hit;
        this.multiplier = swish ? this.multiplier + 1 : 1;
        this.score += this.multiplier; this.cleared++;
        this.bestCombo = Math.max(this.bestCombo, this.multiplier);
        this.events.push({ type: 'score', hoop: hoop.id, x: hoop.x, y: hoop.y, points: this.multiplier, swish });
        if (hoop.shield) { this.shield = true; hoop.shield = false; this.events.push({ type: 'shield' }); }
    }

    private damage(reason: DunkFailure): boolean {
        if (!this.alive) return false;
        if (reason === 'hazard' && this.invincible > 0) return true;
        if (this.shield) {
            this.shield = false; this.invincible = this.config.ball.invincibleSeconds;
            this.events.push({ type: 'shieldLost' }); return true;
        }
        if (this.invincible > 0) return true;
        this.failure = reason; this.alive = false;
        if (reason === 'floor' || reason === 'roof' || reason === 'hazard') this.detachWings();
        this.events.push({ type: 'failure', reason }); return false;
    }

    private resolve(hoop: DunkHoop): void {
        hoop.resolved = true; hoop.entered = false; hoop.fade = 0;
        this.bodies.get(hoop.id)?.SetActive(false);
    }

    private moveHoop(hoop: DunkHoop): void {
        const distance = Math.hypot(hoop.moveX, hoop.moveY);
        if (!distance) return;
        const firstTime = distance * (1 - hoop.moveStart) / hoop.moveSpeed;
        let t: number;
        if (hoop.age < firstTime) {
            const p = hoop.age / firstTime;
            t = hoop.moveStart + (1 - hoop.moveStart) * (1 - (1 - p) ** 2);
        } else {
            const leg = (hoop.age - firstTime) * hoop.moveSpeed / distance;
            const p = leg % 1, eased = 1 - (1 - p) ** 2;
            t = Math.floor(leg) % 2 === 0 ? 1 - eased : eased;
        }
        hoop.x = hoop.baseX + hoop.moveX * t; hoop.y = hoop.baseY + hoop.moveY * t;
    }

    private spawnHoop(first = false): void {
        if (!first && !this.lastMoving) this.tryWalls();
        const count = this.spawnCount;
        let minY = this.curve('HoopMinY'), maxY = this.curve('HoopMaxY');
        if (this.hasWallLimits) { maxY = Math.max(0, 2.7 - Math.max(0, this.curve('HoopMinWallDist'))); minY = -maxY; }
        const baseX = this.nextX, baseY = first ? 0 : this.range(minY, maxY);
        let scale = this.curve('HoopScale');
        this.nextX += this.range(this.curve('HoopDistMin'), this.curve('HoopDistMax'));
        let shield = false, hazard = false, inverted = false, angle = 0;
        let moveX = 0, moveY = 0, moveSpeed = 0, moveStart = 0;
        if (!first && !this.shield && this.shieldCooldown <= 0 && count > this.group[2] && this.chance('HoopShieldChance')) {
            shield = true; this.shieldCooldown = Math.trunc(this.curve('HoopShieldCooldown')); this.hazardCooldown--;
        } else {
            this.shieldCooldown--;
            if (!first && this.hazardCooldown <= 0 && count > this.group[3] && this.chance('HoopHazardChance')) {
                hazard = true; scale = this.curve('HoopHazardScale');
                this.hazardCooldown = Math.trunc(this.curve('HoopHazardCooldown'));
            } else {
                this.hazardCooldown--;
                if (!first && count > this.group[4] && this.chance('HoopInvertedChance')) {
                    inverted = true; angle = 180 + this.range(this.curve('HoopInvertedRotMin'), this.curve('HoopInvertedRotMax'));
                }
            }
        }
        if (!first && !shield && !hazard && !inverted) {
            if (count > this.group[0] && this.chance('HoopTiltChance')) angle = this.range(this.curve('HoopRotMin'), this.curve('HoopRotMax'));
            if (!this.hasWallLimits && count > this.group[1] && this.chance('HoopMoveChance')) {
                let direction = this.random() < .5 ? 1 : -1;
                const horizontal = this.chance('HoopMoveHorizontalChance');
                const distance = this.range(this.curve('HoopMoveDistMin'), this.curve('HoopMoveDistMax'));
                moveStart = this.integer(15, 85) * .01;
                moveSpeed = this.range(this.curve('HoopMoveSpeedMin'), this.curve('HoopMoveSpeedMax'));
                if (horizontal) direction = 1;
                const a = (angle + (horizontal ? 0 : 90)) * RAD;
                let dx = Math.cos(a) * distance * direction, dy = Math.sin(a) * distance * direction;
                let valid = minY < baseY + dy && baseY + dy < maxY;
                if (!valid) { dx = -dx; dy = -dy; valid = !horizontal && minY < baseY + dy && baseY + dy < maxY; }
                if (valid) { moveX = dx; moveY = dy; }
                this.nextX += Math.abs(dx);
            }
        }
        this.lastMoving = moveX !== 0 || moveY !== 0;
        const hoop: DunkHoop = { id: this.serial++, baseX, baseY, x: baseX, y: baseY, angle, scale, shield, hazard, inverted,
            moveX, moveY, moveSpeed, moveStart, age: 0, hit: false, contacts: 0, entered: false, resolved: false, fade: 0 };
        this.moveHoop(hoop); this.hoops.push(hoop); this.spawnCount++;
        this.createHoopBody(hoop);
    }

    private createHoopBody(hoop: DunkHoop): void {
        const scale = hoop.scale;
        const body = this.world.CreateBody({ type: 1, position: new b2Vec2(hoop.x, hoop.y), angle: hoop.angle * RAD });
        for (const sign of [-1, 1]) {
            const shape = new b2CircleShape(DUNK_WORLD.rimRadius * scale);
            shape.m_p.Set(sign * DUNK_WORLD.rimHalfWidth * scale, DUNK_WORLD.rimY * scale);
            body.CreateFixture({ shape, friction: .4, restitution: 0, userData: { kind: 'rim', hoop: hoop.id } });
        }
        const shape = new b2PolygonShape(); shape.SetAsBox(DUNK_WORLD.triggerHalfWidth * scale, DUNK_WORLD.triggerHalfHeight * scale);
        body.CreateFixture({ shape, isSensor: true, userData: { kind: 'trigger', hoop: hoop.id } });
        this.bodies.set(hoop.id, body);
    }

    private tryWalls(): void {
        if (this.hasWallLimits) {
            if (--this.wallQueue === 0) {
                this.wallPhase = 'warning'; this.wallClock = 0;
                this.wallDelay = this.curve('ShrinkingWallsStartDelay');
                this.wallAmount = this.curve('ShrinkingWallsAmount') - DUNK_WORLD.wallDefaultOffset;
                this.wallDuration = Math.max(.01, this.curve('ShrinkingWallsTime'));
                this.events.push({ type: 'wallWarning' });
            }
        } else if (this.wallCooldown <= 0 && this.spawnCount > this.group[5] && this.chance('ShrinkingWallsChance')) {
            this.wallPhase = 'queued'; this.wallQueue = 2;
        } else this.wallCooldown--;
    }

    private advanceWalls(dt: number): void {
        if (this.wallPhase === 'open' || this.wallPhase === 'queued') return;
        this.wallClock += dt;
        if (this.wallPhase === 'warning' && this.wallClock >= this.wallDelay) {
            this.wallPhase = 'closing'; this.wallClock -= this.wallDelay;
        }
        if (this.wallPhase === 'closing') {
            this.wallInset = this.wallAmount * Math.min(1, this.wallClock / this.wallDuration);
            if (this.wallClock >= this.wallDuration) {
                this.wallPhase = 'closed'; this.wallClock = 0; this.wallStay = this.curve('ShrinkingWallsStayTime');
            }
        } else if (this.wallPhase === 'closed') {
            if (this.wallClock >= this.wallStay) {
                this.wallPhase = 'opening'; this.wallClock = 0; this.wallFrom = this.wallInset;
                this.wallDuration = Math.max(.01, this.curve('ShrinkingWallsTime'));
            }
        } else if (this.wallPhase === 'opening') {
            this.wallInset = this.wallFrom * (1 - Math.min(1, this.wallClock / this.wallDuration));
            if (this.wallClock >= this.wallDuration) {
                this.wallPhase = 'open'; this.wallInset = this.wallClock = 0;
                this.wallCooldown = Math.trunc(this.curve('ShrinkingWallsCooldown'));
            }
        }
    }

    /** OnDefeat: damp the ball, then give each wing its own body so it drops and flutters away. */
    private detachWings(): void {
        this.ballBody.SetLinearDamping(1);
        this.wings = [];
        for (const [x, y] of [[-.063, .199], [-.203, .111]]) {
            const px = this.x + x * this.config.ball.size, py = this.y + y * this.config.ball.size;
            const body = this.world.CreateBody({ type: 2, position: new b2Vec2(px, py),
                angle: this.wingRotation * RAD, linearDamping: 1, angularDamping: .05, gravityScale: 1 / 1.8 });
            const shape = new b2CircleShape(.705 * .27 * this.config.ball.size);
            shape.m_p.Set(-.220097512 * .27 * this.config.ball.size, 0);
            body.CreateFixture({ shape, density: 1, friction: .4, restitution: 0 });
            this.wingBodies.push(body); this.wings.push({ x: px, y: py, rotation: this.wingRotation });
        }
    }

    private clearHoops(): void {
        for (const body of Array.from(this.bodies.values())) this.world.DestroyBody(body);
        this.bodies.clear(); this.hoops.length = 0;
    }
    private clearWings(): void {
        for (const body of this.wingBodies) this.world.DestroyBody(body);
        this.wingBodies.length = 0; this.wings = undefined;
    }
    private chooseGroup(): readonly number[] { return this.difficulty.groups[this.integer(0, this.difficulty.groups.length)]; }
    private curve(name: string): number { return dunkCurve(this.difficulty.curves[name], this.spawnCount); }
    private chance(name: string): boolean { return this.random() * 100 < this.curve(name); }
    private range(a: number, b: number): number { return Math.min(a, b) + this.random() * Math.abs(b - a); }
    private integer(a: number, b: number): number { return a + Math.floor(this.random() * (b - a)); }
    private random(): number {
        let x = this.randomState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.randomState = x >>> 0; return this.randomState / 0x100000000;
    }
}
