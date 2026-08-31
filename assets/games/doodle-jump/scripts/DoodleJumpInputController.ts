import {
    input,
    Input,
    EventKeyboard,
    KeyCode,
} from 'cc';
import type { Platform } from '../../../platform/Platform';
import type { Unsubscribe } from '../../../core/types/CommonTypes';
import type { DoodleJumpGameplayConfig } from './DoodleJumpConfig';

export interface DoodleJumpCalibrationResult {
    readonly mode: 'sensor' | 'keyboard' | 'error';
    readonly sampleCount: number;
    readonly calibrationMs: number;
    readonly degraded: boolean;
}

export interface DoodleJumpInputDebugState {
    readonly listenerCount: number;
    readonly timerCount: number;
    readonly sampleCount: number;
    readonly sensorSubscribed: boolean;
    readonly keyboardMode: boolean;
    readonly enabled: boolean;
}

export class DoodleJumpInputController {
    private unsubscribeSensor?: Unsubscribe;
    private calibrationTimer?: ReturnType<typeof setTimeout>;
    private calibrationWindowTimer?: ReturnType<typeof setTimeout>;
    private calibrationStartedAt = 0;
    private samples: number[] = [];
    private neutralX = 0;
    private rawX = 0;
    private smoothedInput = 0;
    private lastSampleAt = 0;
    private keyboardLeft = false;
    private keyboardRight = false;
    private keyboardFire = false;
    private keyboardMode = false;
    private enabled = false;
    private disposed = false;
    private calibrationFinish?: (result: DoodleJumpCalibrationResult) => void;

    constructor(
        private readonly platform: Platform,
        private readonly config: DoodleJumpGameplayConfig,
    ) {
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.handleKeyUp, this);
    }

    calibrate(): Promise<DoodleJumpCalibrationResult> {
        this.stopSensorSession();
        this.samples = [];
        this.rawX = 0;
        this.neutralX = 0;
        this.smoothedInput = 0;
        this.lastSampleAt = 0;
        this.calibrationStartedAt = Date.now();
        if (!this.platform.supportsAccelerometer()) {
            this.keyboardMode = true;
            return Promise.resolve(Object.freeze({
                mode: 'keyboard',
                sampleCount: 0,
                calibrationMs: 0,
                degraded: true,
            }));
        }
        this.keyboardMode = false;
        return new Promise((resolve) => {
            this.calibrationFinish = resolve;
            this.unsubscribeSensor = this.platform.onAccelerometerChange((sample) => {
                if (this.disposed) return;
                this.rawX = sample.x;
                this.lastSampleAt = Date.now();
                this.samples.push(sample.x);
                if (this.samples.length >= this.config.sensor.minimumSamples
                    && Date.now() - this.calibrationStartedAt >= this.config.sensor.calibrationWindowMs) {
                    this.finishCalibration(false);
                }
            });
            this.platform.startAccelerometer();
            this.calibrationWindowTimer = setTimeout(() => {
                this.calibrationWindowTimer = undefined;
                if (this.samples.length >= this.config.sensor.minimumSamples) {
                    this.finishCalibration(false);
                }
            }, this.config.sensor.calibrationWindowMs);
            this.calibrationTimer = setTimeout(() => {
                this.calibrationTimer = undefined;
                this.finishCalibration(this.samples.length < this.config.sensor.minimumSamples);
            }, this.config.sensor.timeoutMs);
        });
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.smoothedInput = 0;
            this.keyboardFire = false;
        }
    }

    isKeyboardFireHeld(): boolean {
        return this.enabled && this.keyboardMode && this.keyboardFire;
    }

    getDebugState(): DoodleJumpInputDebugState {
        return Object.freeze({
            listenerCount: this.disposed ? 0 : 2 + (this.unsubscribeSensor ? 1 : 0),
            timerCount: (this.calibrationTimer !== undefined ? 1 : 0)
                + (this.calibrationWindowTimer !== undefined ? 1 : 0),
            sampleCount: this.samples.length,
            sensorSubscribed: Boolean(this.unsubscribeSensor),
            keyboardMode: this.keyboardMode,
            enabled: this.enabled,
        });
    }

    update(deltaSeconds: number, sensitivity: number, invert: boolean): number {
        if (!this.enabled) return 0;
        let target = 0;
        if (this.keyboardMode) {
            target = (this.keyboardRight ? 1 : 0) - (this.keyboardLeft ? 1 : 0);
        } else {
            let tilt = this.rawX - this.neutralX;
            if (invert) tilt = -tilt;
            const absolute = Math.abs(tilt);
            if (absolute > this.config.sensor.deadZone) {
                target = absolute >= this.config.sensor.fullTilt
                    ? Math.sign(tilt)
                    : Math.sign(tilt) * (
                        (absolute - this.config.sensor.deadZone)
                        / (this.config.sensor.fullTilt - this.config.sensor.deadZone)
                    );
            }
            target = Math.max(-1, Math.min(1, target * sensitivity));
        }
        const alpha = 1 - Math.exp(
            -Math.max(0, deltaSeconds) / this.config.sensor.smoothingSeconds,
        );
        this.smoothedInput += (target - this.smoothedInput) * alpha;
        return this.smoothedInput;
    }

    hasStaleSensor(now = Date.now()): boolean {
        return !this.keyboardMode
            && this.lastSampleAt > 0
            && now - this.lastSampleAt >= this.config.sensor.staleTimeoutMs;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.enabled = false;
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.stopSensorSession();
    }

    private finishCalibration(degraded: boolean): void {
        const finish = this.calibrationFinish;
        if (!finish) return;
        this.calibrationFinish = undefined;
        this.clearCalibrationTimers();
        const count = this.samples.length;
        const elapsed = Date.now() - this.calibrationStartedAt;
        if (count === 0) {
            this.stopSensorSession();
            finish(Object.freeze({
                mode: 'error',
                sampleCount: 0,
                calibrationMs: elapsed,
                degraded: true,
            }));
            return;
        }
        this.neutralX = degraded
            ? 0
            : this.samples.reduce((total, sample) => total + sample, 0) / count;
        finish(Object.freeze({
            mode: 'sensor',
            sampleCount: count,
            calibrationMs: elapsed,
            degraded,
        }));
    }

    private stopSensorSession(): void {
        this.clearCalibrationTimers();
        this.unsubscribeSensor?.();
        this.unsubscribeSensor = undefined;
        this.platform.stopAccelerometer();
        const finish = this.calibrationFinish;
        this.calibrationFinish = undefined;
        if (finish) {
            finish(Object.freeze({
                mode: 'error',
                sampleCount: this.samples.length,
                calibrationMs: Date.now() - this.calibrationStartedAt,
                degraded: true,
            }));
        }
    }

    private clearCalibrationTimers(): void {
        if (this.calibrationTimer !== undefined) clearTimeout(this.calibrationTimer);
        if (this.calibrationWindowTimer !== undefined) clearTimeout(this.calibrationWindowTimer);
        this.calibrationTimer = undefined;
        this.calibrationWindowTimer = undefined;
    }

    private readonly handleKeyDown = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ARROW_LEFT || event.keyCode === KeyCode.KEY_A) {
            this.keyboardLeft = true;
        }
        if (event.keyCode === KeyCode.ARROW_RIGHT || event.keyCode === KeyCode.KEY_D) {
            this.keyboardRight = true;
        }
        if (event.keyCode === KeyCode.SPACE) this.keyboardFire = true;
    };

    private readonly handleKeyUp = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ARROW_LEFT || event.keyCode === KeyCode.KEY_A) {
            this.keyboardLeft = false;
        }
        if (event.keyCode === KeyCode.ARROW_RIGHT || event.keyCode === KeyCode.KEY_D) {
            this.keyboardRight = false;
        }
        if (event.keyCode === KeyCode.SPACE) this.keyboardFire = false;
    };
}
