import { dunkCurve, type DunkCurveKey } from './FlappyDunkConfig';

interface NativeAnimation<T> {
    readonly delay: number;
    readonly duration: number;
    readonly curve: readonly DunkCurveKey[];
    readonly value: T;
}
interface NativeTransitionPhase {
    readonly scale?: NativeAnimation<readonly number[]>;
    readonly opacity?: NativeAnimation<number>;
}
export interface DunkTransitionConfig {
    readonly entry: NativeTransitionPhase;
    readonly exit: NativeTransitionPhase | null;
    readonly autoExit: boolean;
    readonly deactivate: boolean;
}
export interface DunkHudItem {
    readonly rect: { readonly position: readonly number[]; readonly size: readonly number[]; readonly rotation: readonly number[] };
    readonly parent?: { readonly position: readonly number[] };
    readonly text?: string;
    readonly fontSize?: number;
    readonly italic?: boolean;
    readonly upperCase?: boolean;
    readonly color: readonly number[];
    readonly margin?: readonly number[];
    readonly lineSpacing?: number;
    readonly transition?: DunkTransitionConfig;
}
export interface DunkPresentationConfig {
    readonly canvas: { readonly reference: readonly number[] };
    readonly Score: DunkHudItem;
    readonly SwishText: DunkHudItem;
    readonly SwishCombo: DunkHudItem;
    readonly Shield: DunkHudItem;
    readonly Failed: DunkHudItem;
}

function duration(phase: NativeTransitionPhase): number {
    return Math.max(0, ...[phase.scale, phase.opacity].map(a => a ? a.delay + a.duration : 0));
}
function progress(animation: NativeAnimation<unknown>, age: number): number {
    return dunkCurve(animation.curve, Math.max(0, Math.min(1, (age - animation.delay) / animation.duration)));
}

/** OnEnable starts once; SetActive(true) while already visible does not restart JTransition. */
export class FlappyDunkTransition {
    active = false;
    age = 0;
    scale = 1;
    opacity = 1;
    constructor(readonly config: DunkTransitionConfig) {}

    show(): void {
        if (this.active) return;
        this.active = true; this.age = 0; this.sample();
    }
    hide(): void { this.active = false; this.age = 0; this.scale = this.opacity = 1; }
    advance(dt: number): void {
        if (!this.active) return;
        this.age += Math.max(0, dt); this.sample();
    }
    private sample(): void {
        const c = this.config, entryTime = duration(c.entry);
        const exiting = c.autoExit && c.exit && this.age >= entryTime;
        const phase = exiting ? c.exit! : c.entry;
        const age = exiting ? this.age - entryTime : this.age;
        this.scale = phase.scale ? exiting
            ? 1 + (phase.scale.value[0] - 1) * progress(phase.scale, age)
            : phase.scale.value[0] + (1 - phase.scale.value[0]) * progress(phase.scale, age) : 1;
        this.opacity = phase.opacity ? exiting
            ? 1 + (phase.opacity.value - 1) * progress(phase.opacity, age)
            : phase.opacity.value + (1 - phase.opacity.value) * progress(phase.opacity, age) : 1;
        if (exiting && c.deactivate && age >= duration(phase)) this.active = false;
    }
}
