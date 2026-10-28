import { GAIT } from './MemeRunnerGait';
/** Action clock shared by the continuous runner and painted special poses. */
export interface RunnerMotionInput {
    y: number; vy: number; grounded: boolean; sliding: boolean;
    jumps: number; jumpAge: number; landAge: number;
    mounted?: number; hurtAge?: number; feverTime?: number; time?: number;
    speed?: number;
}

/** Painted animation baseline. Running cadence follows speed; other actors keep the 12 Hz clock. */
export const STOP_MOTION_FPS = 12;
export const STOP_MOTION_STEP = 1 / STOP_MOTION_FPS;
export function stopMotionFrame(seconds: number, count: number): number {
    return Math.floor(Math.max(0, seconds) * STOP_MOTION_FPS + 1e-8) % count;
}
export const RUN_FRAME_COUNT = 8;
/** One complete left/right stride in world pixels, shared at every running speed. */
export const RUN_STRIDE = GAIT.stride;
export const KANGAROO_RUN_FRAME_COUNT = 6;
export const DOUBLE_JUMP_FRAME_COUNT = 4;
const HERO_KEYS = [
    ...Array.from({ length: RUN_FRAME_COUNT }, (_, i) => `run-${i}`),
    'air-0', 'air-1', 'air-2', 'air-3', 'land-0',
    ...Array.from({ length: DOUBLE_JUMP_FRAME_COUNT }, (_, i) => `double-${i}`),
    'slide-0', 'slide-1', 'hurt', 'dash-0', 'dash-1', 'ride-0', 'ride-1', 'win-0', 'win-1', 'lose-0', 'lose-1',
];
export const RUNNER_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> =
    HERO_KEYS.map(key => ({ key, path: `visual/${key.startsWith('run-') ? 'v51' : 'v50'}/frames/${key}/spriteFrame` }));

export class MemeRunnerMotion {
    frame = 'run-0';
    /** Run-cycle progress 0..1; one cycle covers RUN_STRIDE world pixels. */
    phase = 0;
    jumpAge = 1;
    landAge = 1;
    grounded = true;
    private clock = 0;
    private wasSliding = false;
    private slideAge = 1;
    private slideExitAge = 1;
    private wasGrounded = true;

    reset(model: RunnerMotionInput): void {
        this.jumpAge = model.jumpAge; this.landAge = model.landAge; this.grounded = model.grounded;
        this.phase = this.clock = 0; this.wasSliding = model.sliding;
        this.wasGrounded = model.grounded;
        this.slideAge = model.sliding ? 0 : 1; this.slideExitAge = 1;
        this.frame = (model.feverTime ?? 0) > 0 ? 'dash-0' : !model.grounded ? this.airFrame(model) : model.sliding ? 'slide-1' : 'run-0';
    }

    /** A looping effect drawn in step with the character's stop-motion clock. */
    loop(count: number): number { return stopMotionFrame(this.clock, count); }

    /** Travel is measured in the drawing's local space, including entry motion and size changes. */
    advance(model: RunnerMotionInput, delta: number, travel?: number): void {
        if (!Number.isFinite(delta) || delta <= 0) return;
        const dt = Math.min(.25, delta);
        this.jumpAge = model.jumpAge; this.landAge = model.landAge; this.grounded = model.grounded;
        this.clock += dt;
        this.slideAge = model.sliding ? (this.wasSliding ? this.slideAge + dt : 0) : 0;
        this.slideExitAge = model.sliding || this.wasSliding ? 0 : this.slideExitAge + dt;
        if (!model.sliding && this.wasSliding) this.phase = 0;
        this.wasSliding = model.sliding;
        if (model.grounded && !this.wasGrounded) this.phase = this.phase < .5 ? 0 : .5;
        this.wasGrounded = model.grounded;

        if ((model.feverTime ?? 0) > 0) {
            this.frame = `dash-${this.loop(2)}`;
        } else if (model.mounted) {
            // The rider bobs with the cart's wheels, both on the model clock.
            this.frame = `ride-${stopMotionFrame(model.time ?? this.clock, 2)}`;
        } else if (model.hurtAge !== undefined && model.hurtAge < .24) {
            this.frame = 'hurt';
        } else if (!model.grounded) {
            this.frame = this.airFrame(model);
        } else if (model.sliding) {
            this.frame = this.slideAge < STOP_MOTION_STEP ? 'slide-0' : 'slide-1';
        } else if (model.landAge < .05) {
            this.frame = 'land-0';
        } else if (this.slideExitAge < STOP_MOTION_STEP) {
            this.frame = 'slide-0';
        } else {
            // Travel, not an unrelated 12 Hz clock, determines how quickly each foot plants.
            const distance = travel ?? dt * (model.speed ?? 470);
            this.phase = (this.phase + Math.max(0, distance) / RUN_STRIDE) % 1;
            this.frame = `run-${Math.floor(this.phase * RUN_FRAME_COUNT + 1e-8) % RUN_FRAME_COUNT}`;
        }
    }

    finish(won: boolean, age: number): void {
        this.grounded = true;
        // Victory holds its cheer drawing; a loss moves from shock to a disappointed hunch.
        this.frame = won ? `win-${Math.floor(age * STOP_MOTION_FPS / 2) % 2}` : age < .3 ? 'lose-0' : 'lose-1';
    }

    private airFrame(model: RunnerMotionInput): string {
        // The second impulse (and the spring launch) plays a whole forward roll, then rejoins the
        // velocity-driven rise/apex/fall poses. Ground contact always takes priority.
        const roll = Math.floor(model.jumpAge * STOP_MOTION_FPS + 1e-8);
        if (model.jumps === 2 && roll < DOUBLE_JUMP_FRAME_COUNT) return `double-${roll}`;
        if (model.jumpAge < STOP_MOTION_STEP && model.vy > 0) return 'air-0';
        return model.vy > 250 ? 'air-1' : model.vy > -250 ? 'air-2' : 'air-3';
    }
}

/** Both actors travel together at constant speed until the camera starts following. */
export const RUN_IN_DURATION = 1.2;
export function runnerEntry(age: number, left: number, heroX: number): { heroX: number; pursuerX: number } {
    const start = left - 130, progress = Math.max(0, Math.min(1, age / RUN_IN_DURATION));
    const x = start + (heroX - start) * progress;
    return { heroX: x, pursuerX: x - 155 };
}
