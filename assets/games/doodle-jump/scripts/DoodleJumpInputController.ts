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
    private horizontalInput = 0;
    private lastSampleAt = 0;
    private keyboardLeft = false;
    private keyboardRight = false;
    private keyboardFire = false;
    private keyboardMode = false;
    private pointerStartX = 0;
    private pointerStartPlayerX = 0;
    private pointerTargetX = 0;
    private pointerActive = false;
    private pointerMoved = false;
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
        this.horizontalInput = 0;
        this.endPointerDrag();
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
                // 校准完成后只保留最新输入，避免整局持续积累无用采样。
                if (!this.calibrationFinish) return;
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
            this.horizontalInput = 0;
            this.keyboardFire = false;
            this.endPointerDrag();
        }
    }

    supportsPointerControl(): boolean {
        return this.platform.id === 'web';
    }

    beginPointerDrag(pointerX: number, playerX: number): void {
        if (!this.enabled || !this.supportsPointerControl()) return;
        this.pointerStartX = pointerX;
        this.pointerStartPlayerX = playerX;
        this.pointerTargetX = playerX;
        this.pointerActive = true;
        this.pointerMoved = false;
    }

    movePointerDrag(pointerX: number): boolean {
        if (!this.pointerActive) return false;
        const displacement = pointerX - this.pointerStartX;
        this.pointerMoved = this.pointerMoved || Math.abs(displacement) >= 8;
        if (this.pointerMoved) {
            const halfWidth = this.config.player.collisionWidth / 2;
            this.pointerTargetX = Math.max(halfWidth, Math.min(
                this.config.design.width - halfWidth,
                this.pointerStartPlayerX + displacement,
            ));
        }
        return this.pointerMoved;
    }

    endPointerDrag(): boolean {
        const moved = this.pointerMoved;
        if (this.pointerActive) this.horizontalInput = 0;
        this.pointerActive = false;
        this.pointerMoved = false;
        return moved;
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

    update(_deltaSeconds: number, sensitivity: number, invert: boolean, playerX?: number): number {
        if (!this.enabled) return 0;
        if (this.pointerActive && this.pointerMoved && playerX !== undefined) {
            // Follow the finger's displacement without teleporting on press.
            // Feed the same fixed-step steering filter used by tilt and keyboard input.
            const distance = this.pointerTargetX - playerX;
            this.horizontalInput = Math.abs(distance) < 1 ? 0 : Math.max(-1, Math.min(
                1,
                distance / (this.config.player.maxHorizontalSpeed * 0.125),
            ));
            return this.horizontalInput;
        }
        let target = 0;
        if (this.keyboardMode) {
            target = (this.keyboardRight ? 1 : 0) - (this.keyboardLeft ? 1 : 0);
        } else {
            let tilt = (this.rawX - this.neutralX) * sensitivity;
            if (invert) tilt = -tilt;
            // The platform service reports g. Preserve stronger tilts instead of
            // saturating at fullTilt; that value sets the H5/keyboard steering scale.
            if (Math.abs(tilt) > this.config.sensor.deadZone) {
                target = Math.max(-1, Math.min(1, tilt)) / this.config.sensor.fullTilt;
            }
        }
        // Filtering belongs to the 60-Hz simulation, never the render/sensor cadence.
        this.horizontalInput = target;
        return target;
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
        this.endPointerDrag();
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
