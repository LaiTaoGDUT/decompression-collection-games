/** Selects whole-character drawings. This class does not animate or deform body parts. */
export interface RunnerMotionInput {
    y: number; vy: number; grounded: boolean; sliding: boolean;
    jumps: number; jumpAge: number; landAge: number;
    mounted?: number; hurtAge?: number; feverTime?: number; time?: number;
}

/** Felt stop-motion: every character holds each painted pose for 1/12 s ("on twos"), whatever the speed. */
export const STOP_MOTION_FPS = 12;
export const STOP_MOTION_STEP = 1 / STOP_MOTION_FPS;
export function stopMotionFrame(seconds: number, count: number): number {
    return Math.floor(Math.max(0, seconds) * STOP_MOTION_FPS + 1e-8) % count;
}
export const RUN_FRAME_COUNT = 8;
export const KANGAROO_RUN_FRAME_COUNT = 6;
export const BULL_RUN_FRAME_COUNT = 4;
export function bullRunFrame(seconds: number): number { return stopMotionFrame(seconds, BULL_RUN_FRAME_COUNT); }
/** Stomped: squash, rebound, then a laugh that alternates two drawings. */
export const DRAGON_REACTION_DURATION = 8 * STOP_MOTION_STEP;
export function dragonReactionFrame(age: number): number {
    const tick = Math.floor(Math.max(0, age) * STOP_MOTION_FPS + 1e-8);
    return tick < 2 ? 2 : tick < 4 ? 3 : 4 + tick % 2;
}
export const SPINNER_FRAME_COUNT = 8;
export const DOUBLE_JUMP_FRAME_COUNT = 4;
const HERO_KEYS = [
    ...Array.from({ length: RUN_FRAME_COUNT }, (_, i) => `run-${i}`),
    'air-0', 'air-1', 'air-2', 'air-3', 'land-0',
    ...Array.from({ length: DOUBLE_JUMP_FRAME_COUNT }, (_, i) => `double-${i}`),
    'slide-0', 'slide-1', 'hurt', 'dash-0', 'dash-1', 'ride-0', 'ride-1', 'win-0', 'win-1', 'lose-0', 'lose-1',
];
export const RUNNER_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> =
    HERO_KEYS.map(key => ({ key, path: `visual/v42/frames/${key}/spriteFrame` }));

export class MemeRunnerMotion {
    frame = 'run-0';
    /** Run-cycle progress 0..1; the cycle lasts RUN_FRAME_COUNT stop-motion steps. */
    phase = 0;
    private clock = 0;
    private wasSliding = false;
    private slideAge = 1;
    private slideExitAge = 1;

    reset(model: RunnerMotionInput): void {
        this.phase = this.clock = 0; this.wasSliding = model.sliding;
        this.slideAge = model.sliding ? 0 : 1; this.slideExitAge = 1;
        this.frame = (model.feverTime ?? 0) > 0 ? 'dash-0' : !model.grounded ? this.airFrame(model) : model.sliding ? 'slide-1' : 'run-0';
    }

    /** A looping effect drawn in step with the character's stop-motion clock. */
    loop(count: number): number { return stopMotionFrame(this.clock, count); }

    advance(model: RunnerMotionInput, delta: number): void {
        if (!Number.isFinite(delta) || delta <= 0) return;
        const dt = Math.min(.25, delta);
        this.clock += dt;
        this.slideAge = model.sliding ? (this.wasSliding ? this.slideAge + dt : 0) : 0;
        this.slideExitAge = model.sliding || this.wasSliding ? 0 : this.slideExitAge + dt;
        this.wasSliding = model.sliding;

        if ((model.feverTime ?? 0) > 0) {
            this.frame = `dash-${this.loop(2)}`;
        } else if (model.mounted) {
            // The rider bobs with the bull's trot, both on the model clock.
            this.frame = `ride-${model.grounded ? bullRunFrame(model.time ?? this.clock) % 2 : 1}`;
        } else if (model.hurtAge !== undefined && model.hurtAge < .24) {
            this.frame = 'hurt';
        } else if (!model.grounded) {
            this.frame = this.airFrame(model);
        } else if (model.sliding) {
            this.frame = this.slideAge < STOP_MOTION_STEP ? 'slide-0' : 'slide-1';
        } else if (model.landAge < 2 * STOP_MOTION_STEP) {
            this.frame = 'land-0';
        } else if (this.slideExitAge < STOP_MOTION_STEP) {
            this.frame = 'slide-0';
        } else {
            this.phase = (this.phase + dt * STOP_MOTION_FPS / RUN_FRAME_COUNT) % 1;
            this.frame = `run-${Math.floor(this.phase * RUN_FRAME_COUNT + 1e-8) % RUN_FRAME_COUNT}`;
        }
    }

    finish(won: boolean, age: number): void {
        // The win alternates belly laugh and cheer on fours; the loss is a shock, then a slump.
        this.frame = won ? `win-${Math.floor(age * STOP_MOTION_FPS / 2) % 2}` : age < .3 ? 'lose-0' : 'lose-1';
    }

    private airFrame(model: RunnerMotionInput): string {
        // The second impulse (and the dragon launch) plays a whole forward roll, then rejoins the
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
