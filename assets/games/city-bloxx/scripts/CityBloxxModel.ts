/** Endless mode: Ctrl + House + GlobalParam, City Bloxx 0.7.8.
 * World units and 60 Hz release momentum match the supplied scene. No engine or service dependencies.
 * TowerGame / OtherGame.StackGame is a different game and is deliberately not used here.
 */
export type CityPhase = 'intro' | 'swing' | 'falling' | 'settling' | 'recovering' | 'result' | 'disposed';
export interface CityCurve { duration: number; channels: number[][][]; }
export interface CityConfig {
    camera: { verticalFov: number; distance: number; referenceWidth: number; referenceHeight: number; };
    houseDropSpeed: number;
    rotRate: number;
    powValue: number;
    bornCameraSpeed: number;
    shakes: Record<'foundation' | 'drop', { duration: number; from: number; to: number; keys: number[][] }>;
    curves: Readonly<Record<string, CityCurve>>;
    chains: { first: CityTransform[]; normal: CityTransform[] };
    rigSprites: Record<'arm' | 'line' | 'first' | 'normal', { width: number; height: number; pivot: number[] }>;
}
export interface CityTransform { x: number; y: number; sx: number; sy: number; angle: number; }
export interface CityPose { x: number; y: number; angle: number; }
interface CityMotion extends CityPose { previousPose?: CityPose; }
export interface CityFloor extends CityMotion {
    id: number; index: number; base: boolean; x: number; y: number; angle: number;
    /** Offset to the next floor belongs to its support, as in House.LinkPoint. */
    linkOffset: number; people: number; perfect: boolean; age: number; impact: number;
}
export interface CityFalling extends CityMotion { base: boolean; speed: number; drift: number; }
export interface CityDebris extends CityFalling { id: number; age: number; direction: number; originX: number; originY: number; }
export type CityEvent =
    | { type: 'land'; floor: CityFloor; people: number; perfect: boolean }
    | { type: 'miss'; lives: number }
    | { type: 'collapse'; floor: CityFloor }
    | { type: 'bonus'; people: number; combo: number }
    | { type: 'result' | 'release' | 'revive' };

export const CITY_RULES = Object.freeze({
    step: 1 / 60, height: .8, width: .7, perfect: .06, stable: .35,
    collapse: .2, acceleration: 50, lives: 3, revives: 3,
    comboSeconds: 8, nextDelay: .35, missDelay: 1, collapseDelay: .2,
});
const SNAPSHOT_NUMBERS = ['time', 'animationTime', 'normalTime', 'lives', 'revives', 'people', 'totalIndex',
    'maxFloors', 'maxCombo', 'combo', 'comboTime', 'pendingPeople', 'moveY', 'baseX', 'introY', 'shakeY',
    'remainder', 'previousMoveY', 'previousSkyFloors', 'previousAnimationTime', 'previousNormalTime',
    'serial', 'delay', 'collapseLeft', 'collapseDirection', 'moveFrom', 'moveTarget', 'moveAge', 'moveDuration'] as const;
export interface CitySnapshot {
    version: 1;
    phase: 'intro' | 'swing' | 'falling' | 'settling' | 'recovering';
    values: Record<typeof SNAPSHOT_NUMBERS[number], number>;
    shakeAge: number | null;
    shakeKind: 'foundation' | 'drop';
    previousCameraY: number | null;
    collapseHud?: { tower: number; people: number };
    floors: CityFloor[];
    debris: CityDebris[];
    active?: CityFalling;
    chaos: number[];
}
const DEG = Math.PI / 180;

/** House.TweenStable affects HouseModel only, never the support Link or collider. */
export function cityImpactAngle(impact: number, age: number): number {
    return impact * (age < .3 ? 1 - (1 - Math.max(0, age) / .3) ** 3
        : age < .5 ? 1 - ((age - .3) / .2) ** 3 : 0);
}

/** Unity streamed key stores a cubic polynomial in seconds since the key. */
export function cityCurve(clip: CityCurve, channel: number, time: number, loop = true): number {
    const keys = clip.channels[channel];
    if (!keys?.length) return 0;
    const t = loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.max(0, Math.min(clip.duration, time));
    let key = keys[0];
    for (let i = 1; i < keys.length && keys[i][0] <= t; i++) key = keys[i];
    const dt = t - key[0];
    return ((key[1] * dt + key[2]) * dt + key[3]) * dt + key[4];
}

/** The animation's two separate swings are evaluated through the original transform chain. */
export function cityCrane(config: CityConfig, first: boolean, time: number,
    out = { x: 0, y: 0, angle: 0 }, rig: CityTransform[] = []): { x: number; y: number; angle: number } {
    const joints = cityCraneRig(config, first, time, rig), last = joints[joints.length - 1];
    out.x = last.x; out.y = last.y; out.angle = first ? 0 : last.x * config.rotRate; return out;
}

export function cityCraneRig(config: CityConfig, first: boolean, time: number, joints: CityTransform[] = []): CityTransform[] {
    const clip = config.curves[first ? 'FirstLoop' : 'NormalLoop'];
    const chain = first ? config.chains.first : config.chains.normal;
    // A full affine transform preserves the scene's slightly nonuniform scales.
    let a = 1, b = 0, c = 0, d = 1, x = 0, y = 0;
    for (let i = 0; i < chain.length; i++) {
        const p = chain[i]; let px = p.x, py = p.y, angle = p.angle;
        if (i === 1) { px = cityCurve(clip, 0, time); py = cityCurve(clip, 1, time); angle = cityCurve(clip, first ? 5 : 8, time); }
        if (first && i === 2) angle = cityCurve(clip, 8, time);
        if (!first && i === 3) { px = cityCurve(clip, 3, time); py = cityCurve(clip, 4, time); }
        x += a * px + c * py; y += b * px + d * py;
        const cos = Math.cos(angle * DEG), sin = Math.sin(angle * DEG);
        const na = (a * cos + c * sin) * p.sx, nb = (b * cos + d * sin) * p.sx;
        c = (-a * sin + c * cos) * p.sy; d = (-b * sin + d * cos) * p.sy;
        a = na; b = nb;
        const joint = joints[i] ?? (joints[i] = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 });
        joint.x = x; joint.y = y; joint.angle = Math.atan2(b, a) / DEG; joint.sx = Math.hypot(a, b); joint.sy = Math.hypot(c, d);
    }
    joints.length = chain.length; return joints;
}

export class CityBloxxModel {
    phase: CityPhase = 'swing';
    readonly floors: CityFloor[] = [];
    readonly debris: CityDebris[] = [];
    readonly events: CityEvent[] = [];
    active?: CityFalling;
    time = 0;
    /** Unity's scene animations keep running behind the result panel; round duration does not. */
    animationTime = 0;
    normalTime = 0;
    lives: number = CITY_RULES.lives;
    revives = 0;
    people = 0;
    totalIndex = 0;
    maxFloors = 0;
    maxCombo = 0;
    combo = 0;
    comboTime = 0;
    pendingPeople = 0;
    moveY = 0;
    baseX = 0;
    introY = 5;
    shakeY = -.128;
    private shakeAge = Infinity;
    private shakeKind: 'foundation' | 'drop' = 'foundation';
    private remainder = 0;
    private previousCameraY?: number;
    private previousMoveY = 0;
    private previousSkyFloors = 0;
    private previousAnimationTime = 0;
    private previousNormalTime = 0;
    private serial = 0;
    private delay = 0;
    private collapseLeft = 0;
    private collapseDirection = 1;
    private collapseHud?: { tower: number; people: number };
    private moveFrom = 0;
    private moveTarget = 0;
    private moveAge = 1;
    private moveDuration = .5;
    private readonly chaos: number[] = [];
    private readonly craneJoints: CityTransform[] = [];
    private readonly cranePose = { x: 0, y: 0, angle: 0 };

    constructor(readonly config: CityConfig, intro = true) {
        this.phase = intro ? 'intro' : 'swing'; this.introY = intro ? 5 : 0; this.attach();
    }
    get cameraY(): number { return this.moveY + 1.58 + this.introY + this.shakeY; }
    get tower(): number { return this.floors.length; }
    /** Continuous camera altitude in floors; it eases with the camera instead of stepping per landing. */
    get skyFloors(): number { return Math.max(0, (this.moveY + this.introY) / CITY_RULES.height); }
    /** UIFightPanel publishes collapsed floor/population totals together with the life deduction. */
    get hudTower(): number { return this.collapseHud?.tower ?? this.tower; }
    get hudPeople(): number { return this.collapseHud?.people ?? this.people; }
    get canRevive(): boolean { return this.phase === 'result' && this.revives < CITY_RULES.revives; }
    get rotChaos(): number { return this.chaos.reduce((a, b) => a + b, 0) * 1.4; }

    /** A detached, JSON-safe continuation, including the in-flight tick and camera tweens. */
    snapshot(): CitySnapshot | undefined {
        if (this.lives <= 0 || this.phase === 'result' || this.phase === 'disposed') return undefined;
        const values = {} as CitySnapshot['values'];
        for (const key of SNAPSHOT_NUMBERS) values[key] = this[key];
        const copy = <T extends CityMotion>(f: T): T => ({ ...f,
            ...(f.previousPose ? { previousPose: { ...f.previousPose } } : {}) });
        return { version: 1, phase: this.phase, values,
            shakeAge: Number.isFinite(this.shakeAge) ? this.shakeAge : null, shakeKind: this.shakeKind,
            previousCameraY: this.previousCameraY ?? null, collapseHud: this.collapseHud ? { ...this.collapseHud } : undefined,
            floors: this.floors.map(copy), debris: this.debris.map(copy), active: this.active ? copy(this.active) : undefined,
            chaos: this.chaos.slice() };
    }

    static restore(config: CityConfig, saved: unknown): CityBloxxModel | undefined {
        if (!validSnapshot(saved, config)) return undefined;
        const m = new CityBloxxModel(config, false), copy = <T extends CityMotion>(f: T): T => ({ ...f,
            ...(f.previousPose ? { previousPose: { ...f.previousPose } } : {}) });
        for (const key of SNAPSHOT_NUMBERS) m[key] = saved.values[key];
        m.phase = saved.phase; m.shakeAge = saved.shakeAge ?? Infinity; m.shakeKind = saved.shakeKind;
        m.previousCameraY = saved.previousCameraY ?? undefined;
        m.collapseHud = saved.collapseHud ? { ...saved.collapseHud } : undefined;
        for (const f of saved.floors) m.floors.push(copy(f));
        for (const f of saved.debris) m.debris.push(copy(f));
        m.active = saved.active ? copy(saved.active) : undefined;
        for (const error of saved.chaos) m.chaos.push(error);
        // Keep rounds saved by the withdrawn smoothing implementation. Restore
        // native poses under the loading cover, without restarting the round.
        if ('sway' in saved) {
            m.updateTower(0, false);
            for (const f of m.floors) m.rememberPose(f);
        }
        return m;
    }

    // Fixed simulation ticks are not display frames: 16/17 ms pacing otherwise
    // repeats a pose then jumps two ticks. Interpolate presentation. On input,
    // release latches that displayed pose once; rendering itself never mutates physics.
    get renderAlpha(): number { return Math.max(0, Math.min(1, this.remainder / CITY_RULES.step)); }
    private interpolate(previous: number, current: number): number { return previous + (current - previous) * this.renderAlpha; }
    get renderCameraY(): number { return this.interpolate(this.previousCameraY ?? this.cameraY, this.cameraY); }
    get renderMoveY(): number { return this.interpolate(this.previousMoveY, this.moveY); }
    get renderSkyFloors(): number { return this.interpolate(this.previousCameraY === undefined ? this.skyFloors : this.previousSkyFloors, this.skyFloors); }
    get renderAnimationTime(): number { return this.interpolate(this.previousAnimationTime, this.animationTime); }
    get renderNormalTime(): number { return this.interpolate(this.previousNormalTime, this.normalTime); }
    samplePose(source: CityMotion, out: CityPose): CityPose {
        const before = source.previousPose ?? source, alpha = this.renderAlpha;
        out.x = before.x + (source.x - before.x) * alpha;
        out.y = before.y + (source.y - before.y) * alpha;
        out.angle = before.angle + (source.angle - before.angle) * alpha;
        return out;
    }
    renderAge(age: number): number { return Math.max(0, age - CITY_RULES.step * (1 - this.renderAlpha)); }
    private rememberPose(source: CityMotion): void {
        const before = source.previousPose ?? (source.previousPose = { x: 0, y: 0, angle: 0 });
        before.x = source.x; before.y = source.y; before.angle = source.angle;
    }

    release(): boolean {
        if (this.phase !== 'swing' || !this.active) return false;
        const first = this.tower === 0, t = first ? this.animationTime : this.normalTime;
        const f = this.active, before = f.previousPose;
        // Ctrl.Update releases the visible locking object and carries half of
        // its last-frame displacement. Our display lies between fixed ticks:
        // latch both pose and the matching displacement at that same fraction,
        // instead of launching from the simulation's one-tick-ahead position.
        const older = cityCrane(this.config, first, Math.max(0, t - CITY_RULES.step * (before ? 2 : 1)), this.cranePose, this.craneJoints);
        const displacement = before ? this.interpolate(before.x - older.x, f.x - before.x) : f.x - older.x;
        f.drift = first ? 0 : displacement * .5;
        this.samplePose(f, f); this.rememberPose(f);
        this.active.speed = 0; this.phase = 'falling'; this.events.push({ type: 'release' });
        return true;
    }

    advance(dt: number): void {
        if (this.phase === 'disposed' || !Number.isFinite(dt) || dt <= 0) return;
        // The runtime pauses on background; discard only long foreground stalls, never accumulate catch-up drops.
        this.remainder += Math.min(dt, .25);
        while (this.remainder + 1e-10 >= CITY_RULES.step) {
            this.remainder -= CITY_RULES.step; this.step(CITY_RULES.step);
        }
    }

    private step(dt: number): void {
        this.previousCameraY = this.cameraY; this.previousMoveY = this.moveY; this.previousSkyFloors = this.skyFloors;
        this.previousAnimationTime = this.animationTime; this.previousNormalTime = this.normalTime;
        if (this.active) this.rememberPose(this.active);
        this.animationTime += dt; if (this.tower) this.normalTime += dt;
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const f = this.debris[i]; this.rememberPose(f); f.age += dt;
            // House.PlayDrop: DOMove(±1.3, -7, 0), .9 seconds, Ease.Linear.
            const progress = Math.min(1, f.age / .9);
            f.x = f.originX + f.direction * 1.3 * progress; f.y = f.originY - 7 * progress;
            if (f.age >= .9) this.debris.splice(i, 1);
        }
        if (this.phase === 'result') { this.updateTower(dt); return; }
        this.time += dt;
        if (this.phase === 'intro') {
            this.introY = Math.max(0, this.introY - this.config.bornCameraSpeed * dt);
            if (this.introY < 1e-8) { this.introY = 0; this.phase = 'swing'; }
            this.attach(); return;
        }
        if (Number.isFinite(this.shakeAge)) {
            this.shakeAge += dt;
            const shake = this.config.shakes[this.shakeKind];
            const t = Math.min(1, this.shakeAge / shake.duration);
            this.shakeY = shake.from + (shake.to - shake.from) * cityHermite(shake.keys, t);
            if (t === 1) this.shakeAge = Infinity;
        }
        if (this.comboTime > 0) {
            this.comboTime -= dt * (1 + Math.min(this.combo / 15, 1) * 3);
            if (this.comboTime <= 0) this.bankCombo();
        }
        this.moveAge += dt;
        const progress = Math.min(1, this.moveAge / this.moveDuration);
        this.moveY = this.moveFrom + (this.moveTarget - this.moveFrom) * (1 - (1 - progress) ** 2);
        this.updateTower(dt);
        if (this.phase === 'swing') { this.attach(); return; }
        if (this.phase === 'settling') {
            this.delay -= dt;
            if (this.delay <= 1e-8) { this.phase = 'swing'; this.attach(); }
            return;
        }
        if (this.phase === 'recovering') {
            this.delay -= dt;
            if (this.delay > 1e-8) return;
            if (this.collapseLeft > 0) {
                this.collapse();
                if (this.canCollapse()) this.delay = CITY_RULES.collapseDelay;
                else this.loseLife();
                return;
            }
            if (this.lives > 0) { this.phase = 'swing'; this.attach(); }
            else { this.bankCombo(); this.phase = 'result'; this.events.push({ type: 'result' }); }
            return;
        }
        const f = this.active;
        if (!f) return;
        const beforeY = f.y;
        f.speed = Math.min(this.config.houseDropSpeed, f.speed + CITY_RULES.acceleration * dt);
        f.y -= f.speed * dt; f.x += f.drift;
        f.angle = Math.sign(f.angle) * Math.max(0, Math.abs(f.angle) - dt * 30);
        const top = this.floors[this.tower - 1];
        // The original trigger is on House, not its visual RotAnchor. Sway
        // moves the root through the previous Link but never tilts its collider.
        const surface = top ? top.y + CITY_RULES.height : 0;
        const targetX = top?.x ?? 0;
        const contactWidth = top ? CITY_RULES.width : 1.5;
        if (beforeY >= surface && f.y <= surface && Math.abs(f.x - targetX) < contactWidth) {
            this.resolveLanding(f.x, top ? f.x - top.x : 0); return;
        }
        if (f.y < this.moveY - 5) {
            this.dropVisual(f, f.x < targetX ? -1 : 1); this.active = undefined;
            this.phase = 'recovering'; this.loseLife();
        }
    }

    /** Called by the falling collision path; exposed for rule parity fixtures at exact boundary offsets. */
    resolveLanding(x: number, offset: number): void {
        if (this.phase !== 'falling' || !this.active) return;
        const first = this.tower === 0, perfect = first || Math.abs(offset) < CITY_RULES.perfect;
        if (!first && Math.abs(offset) > CITY_RULES.stable) {
            this.shake('drop');
            this.bankCombo(); this.collapseDirection = offset < 0 ? -1 : 1;
            this.dropVisual(this.active, this.collapseDirection); this.active = undefined;
            this.phase = 'recovering'; this.collapseLeft = 2;
            this.collapseHud = { tower: this.tower, people: this.people };
            // Ctrl.DoDrop waits before EACH unstable support, then immediately starts DoDeduct.
            if (this.canCollapse()) this.delay = CITY_RULES.collapseDelay;
            else this.loseLife();
            return;
        }
        const previous = this.floors[this.tower - 1];
        const normalized = Math.min(Math.abs(offset) / CITY_RULES.stable, 1);
        const people = first ? 0 : 4 - Math.floor(normalized * 4);
        if (first) { this.baseX = x; this.shake('foundation'); }
        else {
            if (perfect) {
                x = previous.x; offset = 0; this.comboTime = CITY_RULES.comboSeconds;
            }
            // GlobalParam.TriggerStackHouse: an ordinary stable landing also
            // continues SuperTime, but only a perfect landing refills its timer.
            if (this.comboTime > 0) {
                this.combo++; this.maxCombo = Math.max(this.combo, this.maxCombo);
                // Native TriggerSupperTime/TriggerStackHouse use ARM64 FCVTPS (ceiling).
                // The decompiled C cast loses that rounding mode: floors 1–10 already award 2 per combo.
                this.pendingPeople += this.combo * Math.ceil(this.tower / 10) * 2;
            }
            previous.linkOffset = offset;
            this.chaos.push(Math.abs(offset)); if (this.chaos.length > 5) this.chaos.shift();
        }
        const floor: CityFloor = { id: ++this.serial, index: this.totalIndex, base: first,
            x, y: this.tower * CITY_RULES.height, angle: 0, linkOffset: 0, people, perfect,
            age: 0, impact: perfect ? 0 : -Math.sign(offset) * this.config.powValue ** Math.abs(offset * 10) };
        // House.SetIndexAndPos first follows the support Link. Preserve the
        // previous display tick for this newly created floor as well, so its
        // interpolation stays attached to the already rendered support.
        if (previous) this.followSupport(floor, previous);
        floor.angle = floor.index * this.swayScale(cityCurve(this.config.curves.GlobalParam, 0, this.animationTime));
        if (previous) {
            const before = previous.previousPose ?? previous, a = before.angle * DEG;
            floor.previousPose = {
                x: before.x + offset * Math.cos(a) - CITY_RULES.height * Math.sin(a),
                y: before.y + offset * Math.sin(a) + CITY_RULES.height * Math.cos(a),
                angle: previous.index > 0 ? before.angle * floor.index / previous.index : 0,
            };
        }
        this.floors.push(floor); this.totalIndex++;
        // In Unity the collision handler changes Chaos/TotalIndex before the
        // frame's House.Update callbacks are rendered. Finish that same update
        // here; otherwise one display frame mixes the new floor's coefficient
        // with every older floor's previous coefficient.
        this.updateTower(0, false);
        this.people += people; this.maxFloors = Math.max(this.maxFloors, this.tower);
        this.active = undefined; this.events.push({ type: 'land', floor, people, perfect });
        if (first) { this.phase = 'swing'; this.normalTime = 0; this.attach(); }
        else { this.moveTo((this.tower - 1) * CITY_RULES.height, .5); this.phase = 'settling'; this.delay = CITY_RULES.nextDelay; }
    }

    private updateTower(dt: number, remember = true): void {
        const rate = cityCurve(this.config.curves.GlobalParam, 0, this.animationTime);
        const baseSway = (Math.max(6, Math.min(100, this.totalIndex)) - 6) / 166 * rate;
        const sway = this.swayScale(rate);
        for (let i = 0; i < this.tower; i++) {
            const f = this.floors[i]; if (remember) this.rememberPose(f); f.age += dt;
            f.angle = f.index * sway;
            if (!i) { f.x = this.baseX + baseSway; f.y = 0; continue; }
            this.followSupport(f, this.floors[i - 1]);
        }
    }

    private swayScale(rate: number): number {
        return rate * Math.min(.32, this.rotChaos) * -6 / Math.max(20, this.totalIndex);
    }

    /** Link is a child of RotAnchor; HouseModel's impact tween never moves it. */
    private followSupport(floor: CityFloor, support: CityFloor): void {
        const a = support.angle * DEG, cos = Math.cos(a), sin = Math.sin(a);
        floor.x = support.x + support.linkOffset * cos - CITY_RULES.height * sin;
        floor.y = support.y + support.linkOffset * sin + CITY_RULES.height * cos;
    }

    private attach(): void {
        const base = !this.tower, p = cityCrane(this.config, base, base ? this.animationTime : this.normalTime, this.cranePose, this.craneJoints);
        const active = this.active ?? (this.active = { x: 0, y: 0, angle: 0, base, speed: 0, drift: 0 });
        active.x = p.x; active.y = p.y + this.moveY - (base ? CITY_RULES.height : 0); active.angle = p.angle;
        active.base = base; active.speed = active.drift = 0;
    }
    private moveTo(y: number, duration: number): void {
        this.moveFrom = this.moveY; this.moveTarget = y; this.moveAge = 0; this.moveDuration = duration;
    }
    private dropVisual(f: CityFalling, direction: number): void {
        this.debris.push({ ...f, id: ++this.serial, age: 0, speed: 0, direction, originX: f.x, originY: f.y });
    }
    private canCollapse(): boolean {
        return this.collapseLeft > 0 && this.tower > 1
            && Math.abs(this.floors[this.tower - 2].linkOffset) >= CITY_RULES.collapse;
    }
    private collapse(): void {
        this.shake('drop');
        const f = this.floors.pop()!, support = this.floors[this.tower - 1];
        this.people -= f.people; support.linkOffset = 0; this.chaos.pop();
        this.dropVisual({ ...f, speed: 0, drift: 0 }, this.collapseLeft === 2 ? -this.collapseDirection : this.collapseDirection);
        this.events.push({ type: 'collapse', floor: f }); this.collapseLeft--;
        this.moveTo((this.tower - 1) * CITY_RULES.height, .3);
        // At most two supporting floors fall. Preserve TotalIndex, which controls sway difficulty.
    }
    private loseLife(): void {
        this.bankCombo();
        this.lives = Math.max(0, this.lives - 1); this.collapseLeft = 0; this.delay = CITY_RULES.missDelay;
        this.collapseHud = undefined;
        this.events.push({ type: 'miss', lives: this.lives });
    }
    private shake(kind: 'foundation' | 'drop'): void {
        this.shakeKind = kind; this.shakeAge = 0; this.shakeY = this.config.shakes[kind].from;
    }
    private bankCombo(): void {
        if (this.combo > 0) this.events.push({ type: 'bonus', people: this.pendingPeople, combo: this.combo });
        this.people += this.pendingPeople; this.pendingPeople = 0; this.combo = 0; this.comboTime = 0;
    }
    revive(): boolean {
        if (!this.canRevive) return false;
        this.revives++; this.lives = CITY_RULES.lives; this.phase = 'swing'; this.attach();
        this.events.push({ type: 'revive' }); return true;
    }
    finish(): void { if (this.phase !== 'disposed') { this.bankCombo(); this.active = undefined; this.collapseHud = undefined; this.phase = 'result'; } }
    dispose(): void { this.phase = 'disposed'; this.active = undefined; this.collapseHud = undefined; this.floors.length = this.debris.length = this.events.length = 0; }
}

function validSnapshot(value: unknown, config: CityConfig): value is CitySnapshot {
    if (!value || typeof value !== 'object') return false;
    const s = value as CitySnapshot, v = s.values;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    const uint = (n: unknown): n is number => finite(n) && Number.isSafeInteger(n) && n >= 0;
    const pose = (p: CityPose): boolean => !!p && finite(p.x) && finite(p.y) && finite(p.angle);
    const motion = (p: CityMotion): boolean => pose(p) && (!p.previousPose || pose(p.previousPose));
    const falling = (p: CityFalling): boolean => motion(p) && typeof p.base === 'boolean' && finite(p.drift)
        && finite(p.speed) && p.speed >= 0 && p.speed <= config.houseDropSpeed;
    if (s.version !== 1 || ['intro', 'swing', 'falling', 'settling', 'recovering'].indexOf(s.phase) < 0
        || !v || !SNAPSHOT_NUMBERS.every(k => finite(v[k]))
        || !['lives', 'revives', 'people', 'totalIndex', 'maxFloors', 'maxCombo', 'combo', 'pendingPeople', 'serial', 'collapseLeft']
            .every(k => uint(v[k as keyof typeof v]))
        || v.lives < 1 || v.lives > CITY_RULES.lives || v.revives > CITY_RULES.revives
        || v.time < 0 || v.animationTime < 0 || v.normalTime < 0 || v.moveDuration <= 0
        || v.remainder < -1e-8 || v.remainder >= CITY_RULES.step || v.collapseLeft > 2
        || Math.abs(v.collapseDirection) !== 1 || v.comboTime < 0 || v.comboTime > CITY_RULES.comboSeconds
        || v.maxCombo < v.combo || v.introY < 0 || v.introY > 5
        || (s.shakeAge !== null && (!finite(s.shakeAge) || s.shakeAge < 0))
        || (s.previousCameraY !== null && !finite(s.previousCameraY))
        || ['foundation', 'drop'].indexOf(s.shakeKind) < 0
        || !Array.isArray(s.floors) || !Array.isArray(s.debris) || !Array.isArray(s.chaos)
        || s.chaos.length > 5 || !s.chaos.every(n => finite(n) && n >= 0 && n <= CITY_RULES.stable)) return false;
    const ids = new Set<number>();
    if (!s.floors.every((f, i) => {
        if (!f || !motion(f) || !uint(f.id) || !f.id || ids.has(f.id) || f.id > v.serial
            || !uint(f.index) || f.index >= v.totalIndex || (i > 0 && f.index <= s.floors[i - 1].index)
            || f.base !== (i === 0) || !finite(f.linkOffset) || Math.abs(f.linkOffset) > CITY_RULES.stable
            || !uint(f.people) || f.people > 4 || typeof f.perfect !== 'boolean'
            || !finite(f.age) || f.age < 0 || !finite(f.impact)) return false;
        ids.add(f.id); return true;
    }) || !s.debris.every(f => {
        if (!f || !falling(f) || !uint(f.id) || !f.id || ids.has(f.id) || f.id > v.serial
            || !finite(f.age) || f.age < 0 || f.age >= .9 || Math.abs(f.direction) !== 1
            || !finite(f.originX) || !finite(f.originY)) return false;
        ids.add(f.id); return true;
    })) return false;
    const needsActive = s.phase === 'intro' || s.phase === 'swing' || s.phase === 'falling';
    return v.maxFloors >= s.floors.length && v.totalIndex >= v.maxFloors
        && (needsActive ? !!s.active && falling(s.active) && s.active.base === !s.floors.length : !s.active)
        && (!s.collapseHud || (s.phase === 'recovering' && uint(s.collapseHud.tower) && uint(s.collapseHud.people)))
        && (s.phase !== 'intro' || s.floors.length === 0);
}

/** NGUI's unweighted AnimationCurve keys: time, value, incoming slope, outgoing slope. */
export function cityHermite(keys: number[][], time: number): number {
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1][0] <= time) i++;
    if (i === keys.length - 1) return keys[i][1];
    const a = keys[i], b = keys[i + 1], span = b[0] - a[0], t = (time - a[0]) / span;
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] + (t ** 3 - 2 * t ** 2 + t) * span * a[3]
        + (-2 * t ** 3 + 3 * t ** 2) * b[1] + (t ** 3 - t ** 2) * span * b[2];
}
