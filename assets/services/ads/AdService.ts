import type { AppStateMachine } from '../../core/state/AppStateMachine';

export type AdOutcome = 'completed' | 'skipped' | 'failed';

export interface AdResult {
    readonly outcome: AdOutcome;
    readonly error?: string;
}

export interface RewardedAdProvider {
    show(): Promise<AdResult>;
}

/** 可由开发菜单或测试直接配置下一次结果的模拟广告。 */
export class MockRewardedAdProvider implements RewardedAdProvider {
    private nextResult: AdResult = Object.freeze({ outcome: 'completed' });

    setNextResult(outcome: AdOutcome, error?: string): void {
        this.nextResult = Object.freeze({
            outcome,
            ...(error ? { error } : {}),
        });
    }

    async show(): Promise<AdResult> {
        const result = this.nextResult;
        this.nextResult = Object.freeze({ outcome: 'completed' });
        return result;
    }
}

/** 激励广告公共边界；负责暂停恢复，但不决定业务奖励。 */
export class AdService {
    private showing?: Promise<AdResult>;
    private appVisible = true;
    private pendingResume = false;

    constructor(
        private readonly stateMachine: AppStateMachine,
        private readonly provider: RewardedAdProvider,
    ) {}

    showRewarded(): Promise<AdResult> {
        if (this.showing) {
            return this.showing;
        }

        const showing = this.performShow();
        this.showing = showing;
        const clear = (): void => {
            if (this.showing === showing) {
                this.showing = undefined;
            }
        };
        void showing.then(clear, clear);
        return showing;
    }

    onHide(): void {
        this.appVisible = false;
    }

    onShow(): void {
        this.appVisible = true;

        if (this.pendingResume && this.stateMachine.currentState === 'paused') {
            this.pendingResume = false;
            this.stateMachine.transition('playing');
        }
    }

    private async performShow(): Promise<AdResult> {
        const pausedByAd = this.stateMachine.currentState === 'playing'
            && this.stateMachine.transition('paused');

        try {
            return Object.freeze(await this.provider.show());
        } catch (error: unknown) {
            return Object.freeze({
                outcome: 'failed' as const,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            if (pausedByAd && this.isPaused()) {
                if (this.appVisible) {
                    this.stateMachine.transition('playing');
                } else {
                    this.pendingResume = true;
                }
            }
        }
    }

    private isPaused(): boolean {
        return this.stateMachine.currentState === 'paused';
    }
}
