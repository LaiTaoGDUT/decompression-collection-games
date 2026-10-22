/** Selects whole-character drawings. This class does not animate or deform body parts. */
export interface RunnerMotionInput {
    x: number; y: number; vy: number; grounded: boolean; sliding: boolean;
    jumps: number; jumpAge: number; landAge: number;
    mounted?: number; rideStride?: number; hurtAge?: number; feverTime?: number; time?: number;
}

export const RUN_CYCLE_DISTANCE = 180;
export const BULL_CYCLE_DISTANCE = 160;
export const CAST_RUN_FRAME_COUNT = 16;
export const DRAGON_REACTION_DURATION = .48;
export function dragonReactionFrame(age: number): number {
    return age < DRAGON_REACTION_DURATION ? 4 + Math.min(11, Math.floor(Math.max(0, age) / .04 + 1e-8)) : 0;
}
export const BULL_RUN_FRAME_COUNT = 8;
export function bullRunFrame(x: number): number { return Math.floor(Math.max(0, x) / BULL_CYCLE_DISTANCE * BULL_RUN_FRAME_COUNT + 1e-8) % BULL_RUN_FRAME_COUNT; }
export const SPINNER_FRAME_COUNT = 8;
/** A complete supine yaw turn, repeated continuously. */
export function spinnerTurnFrame(progress: number): number {
    return Math.floor(Math.max(0, Math.min(1, progress)) * SPINNER_FRAME_COUNT + 1e-8) % SPINNER_FRAME_COUNT;
}
export const DOUBLE_JUMP_FRAME_COUNT = 8;
export const DOUBLE_JUMP_FRAME_DURATION = .04;
// The 16 approved drawings retain their cycle positions; eight generated
// inbetweens sit halfway between adjacent originals. Preserve those timings.
const RUN_DRAWING_ORDER = Array.from({ length: 24 }, (_, i) => i);
export const RUN_FRAME_COUNT = RUN_DRAWING_ORDER.length;
export const RUN_FRAME_PHASES: ReadonlyArray<number> = [
    0, 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 6, 7, 7.5,
    8, 9, 9.5, 10, 11, 11.5, 12, 13, 13.5, 14, 15, 15.5,
].map(phase => phase / 16);
const RUN_FRAME_BOUNDARIES = RUN_FRAME_PHASES.map((phase, i) =>
    (phase + (RUN_FRAME_PHASES[i + 1] === undefined ? 1 : RUN_FRAME_PHASES[i + 1])) / 2);
export const RUNNER_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> = [
    ...RUN_DRAWING_ORDER.map((drawing, i) => ({
        key: `run-${i}`,
        path: `visual/hero/lie-run-color-v15/run-${drawing}`,
    })),
    ...[
        { key: 'air-0', path: 'lie-air-color-v16/air-0' },
        { key: 'air-1', path: 'lie-air-extra-color-v16/air-1' },
        { key: 'air-2', path: 'lie-air-color-v16/air-1' },
        { key: 'air-3', path: 'lie-air-color-v16/air-2' },
        { key: 'air-6', path: 'lie-air-extra-color-v16/air-6' },
        { key: 'air-7', path: 'lie-air-color-v16/air-5' },
        { key: 'air-8', path: 'lie-air-extra-color-v16/air-8' },
        { key: 'air-9', path: 'lie-air-color-v16/air-6' },
        { key: 'air-10', path: 'lie-air-color-v16/air-7' },
        { key: 'air-11', path: 'lie-air-extra-color-v16/air-11' },
    ].map(({ key, path }) => ({ key, path: `visual/hero/${path}` })),
    ...[
        'lie-slide-extra-color-v16/slide-0', 'lie-slide-color-v16/slide-0', 'lie-slide-extra-color-v16/slide-2',
        'lie-slide-color-v16/slide-1', 'lie-slide-color-v16/slide-2', 'lie-slide-extra-color-v16/slide-5',
    ].map((path, i) => ({ key: `slide-${i}`, path: `visual/hero/${path}` })),
    ...Array.from({ length: DOUBLE_JUMP_FRAME_COUNT }, (_, i) => ({
        key: `double-${i}`, path: `visual/hero/lie-double-color-v16/double-${i}`,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({ key: `extra-${i}`, path: `visual/companions/extra-registered-v17/extra-${i}` })),
];

export class MemeRunnerMotion {
    frame = 'run-0';
    phase = 0;
    private lastX = 0;
    private wasSliding = false;
    private wasRunning = false;
    private slideAge = 1;
    private slideExitAge = 1;

    reset(model: RunnerMotionInput): void {
        this.phase = 0; this.lastX = model.x;
        this.wasSliding = model.sliding; this.wasRunning = model.grounded && !model.sliding;
        this.slideAge = model.sliding ? 0 : 1; this.slideExitAge = 1;
        this.frame = (model.feverTime ?? 0) > 0 ? `dash-${Math.floor((model.time ?? 0) * 12) % 4}` : !model.grounded ? this.airFrame(model) : model.sliding ? 'slide-0' : 'run-0';
    }

    /** Change the distance origin at camera handoff without restarting the painted run cycle. */
    rebase(x: number): void { this.lastX = x; }

    advance(model: RunnerMotionInput, delta: number): void {
        if (!Number.isFinite(delta) || delta <= 0) return;
        const dt = Math.min(.25, delta), distance = Math.max(0, model.x - this.lastX);
        this.slideAge = model.sliding ? (this.wasSliding ? this.slideAge + dt : 0) : 0;
        this.slideExitAge = model.sliding || this.wasSliding ? 0 : this.slideExitAge + dt;
        this.lastX = model.x; this.wasSliding = model.sliding;

        let running = false;
        if ((model.feverTime ?? 0) > 0) {
            this.frame = `dash-${Math.floor((model.time ?? 0) * 12) % 4}`;
        } else if (model.mounted) {
            // Rider and mount use one stride phase, including across frame-rate changes.
            const pose = model.grounded ? Math.floor(bullRunFrame(model.rideStride ?? model.x) / 2) : model.vy > 0 ? 2 : 0;
            this.frame = `extra-${pose}`;
        } else if (model.hurtAge !== undefined && model.hurtAge < .24) {
            this.frame = model.hurtAge < .12 ? 'extra-4' : 'extra-5';
        } else if (!model.grounded) {
            this.frame = this.airFrame(model);
        } else if (model.sliding) {
            this.frame = `slide-${Math.min(3, Math.floor((this.slideAge + 1e-8) / .035))}`;
        } else if (model.landAge < .15) {
            this.frame = model.landAge < .03 ? 'air-8' : model.landAge < .075 ? 'air-9' : model.landAge < .115 ? 'air-10' : 'air-11';
        } else if (this.slideExitAge < .09) {
            this.frame = this.slideExitAge < .045 ? 'slide-4' : 'slide-5';
        } else {
            running = true;
            // The same stride covers 180px, i.e. a 0.5s cycle at 360px/s.
            this.phase = this.wasRunning ? (this.phase + distance / RUN_CYCLE_DISTANCE) % 1 : 0;
            const drawing = RUN_FRAME_BOUNDARIES.findIndex(boundary => this.phase + 1e-8 < boundary);
            this.frame = `run-${drawing < 0 ? 0 : drawing}`;
        }
        this.wasRunning = running;
    }

    finish(won: boolean, age: number): void {
        this.frame = won ? `extra-${8 + Math.min(3, Math.floor(age / .2))}` : age < .3 ? 'extra-6' : 'extra-7';
    }

    private airFrame(model: RunnerMotionInput): string {
        // The second impulse plays a complete forward roll, then rejoins the
        // velocity-driven hang/fall poses. Ground contact always takes priority.
        const doubleFrame = Math.floor((model.jumpAge + 1e-8) / DOUBLE_JUMP_FRAME_DURATION);
        if (model.jumps === 2 && doubleFrame < DOUBLE_JUMP_FRAME_COUNT) return `double-${doubleFrame}`;
        if (model.vy < -300) return 'air-7';
        if (model.vy < -80) return 'air-6';
        if (model.jumpAge < .045) return 'air-0';
        if (model.jumpAge < .095) return 'air-1';
        if (model.jumpAge < .18) return 'air-2';
        return 'air-3';
    }
}

/** Both actors travel together at constant speed until the camera starts following. */
export const RUN_IN_DURATION = 1.2;
export function runnerEntry(age: number, left: number, heroX: number): { heroX: number; pursuerX: number; stride: number } {
    const start = left - 130, progress = Math.max(0, Math.min(1, age / RUN_IN_DURATION));
    const stride = (heroX - start) * progress;
    return { heroX: start + stride, pursuerX: start - 155 + stride, stride };
}
