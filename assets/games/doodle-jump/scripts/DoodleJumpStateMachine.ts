export type DoodleJumpState =
    | 'Loading'
    | 'SensorCalibrating'
    | 'Playing'
    | 'Paused'
    | 'ResumeCountdown'
    | 'Failing'
    | 'ResurrectPrompt'
    | 'Resurrecting'
    | 'Result'
    | 'Error'
    | 'Disposed';

function states(...values: DoodleJumpState[]): readonly DoodleJumpState[] {
    return Object.freeze(values);
}

const LEGAL_TRANSITIONS: Readonly<Record<DoodleJumpState, readonly DoodleJumpState[]>> = Object.freeze({
    Loading: states('SensorCalibrating', 'Error', 'Disposed'),
    SensorCalibrating: states('Playing', 'ResumeCountdown', 'Error', 'Disposed'),
    Playing: states('Paused', 'Failing', 'Error', 'Disposed'),
    Paused: states('ResumeCountdown', 'Disposed'),
    ResumeCountdown: states('Playing', 'Paused', 'Disposed'),
    Failing: states('ResurrectPrompt', 'Result', 'Disposed'),
    ResurrectPrompt: states('Resurrecting', 'Result', 'Disposed'),
    Resurrecting: states('ResumeCountdown', 'Result', 'Disposed'),
    Result: states('Disposed'),
    Error: states('SensorCalibrating', 'Disposed'),
    Disposed: states(),
});

export class DoodleJumpStateMachine {
    private current: DoodleJumpState = 'Loading';

    get state(): DoodleJumpState {
        return this.current;
    }

    canTransition(next: DoodleJumpState): boolean {
        return LEGAL_TRANSITIONS[this.current].indexOf(next) >= 0;
    }

    transition(next: DoodleJumpState): void {
        if (!this.canTransition(next)) {
            throw new Error(`Illegal Doodle Jump state transition: ${this.current} -> ${next}.`);
        }
        this.current = next;
    }

    reset(): void {
        if (this.current === 'Disposed') {
            throw new Error('Cannot reset a disposed Doodle Jump state machine.');
        }
        this.current = 'Loading';
    }
}
