import type { AppStateMachine } from '../../core/state/AppStateMachine';
import type { AnalyticsService } from '../analytics/AnalyticsService';

export const AD_PLACEMENTS = Object.freeze({
    watermelonRevive: 'watermelon-revive',
    chessEndlessRevive: 'chess-endless-revive',
    desktopCleanupRewarded: 'desktop-cleanup-rewarded',
} as const);

export type AdOutcome = 'completed' | 'skipped' | 'failed';

export interface AdResult {
    readonly outcome: AdOutcome;
    readonly error?: string;
}

export interface AdRequest {
    readonly placement: string;
    readonly gameId: string;
    readonly sessionId?: string;
}

export type RewardedAdRequest = AdRequest;

export interface RewardedAdProvider {
    preload?(request: RewardedAdRequest): Promise<void>;
    show(request: RewardedAdRequest): Promise<AdResult>;
    dispose?(): void;
}

function normalizeRequest<TRequest extends AdRequest>(request: TRequest): TRequest {
    const placement = request.placement.trim();
    if (!placement) {
        throw new Error('Ad placement must not be empty.');
    }

    const gameId = request.gameId.trim();
    if (!gameId) {
        throw new Error('Ad game ID must not be empty.');
    }
    const sessionId = request.sessionId?.trim();
    return Object.freeze({
        placement,
        gameId,
        ...(sessionId ? { sessionId } : {}),
    }) as TRequest;
}

function requestKey(request: AdRequest): string {
    return [request.placement, request.gameId, request.sessionId ?? ''].join('|');
}

function failedRewarded(error: string): AdResult {
    return Object.freeze({ outcome: 'failed', error });
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

    async show(_request?: RewardedAdRequest): Promise<AdResult> {
        const result = this.nextResult;
        this.nextResult = Object.freeze({ outcome: 'completed' });
        return result;
    }
}

/** 按 placement 分发激励广告，避免多个小游戏误投到其他游戏的广告位。 */
export class RewardedAdRouter implements RewardedAdProvider {
    private readonly providers = new Map<string, RewardedAdProvider>();

    constructor(entries: Readonly<Record<string, RewardedAdProvider>>) {
        Object.keys(entries).forEach((placement) => {
            const normalized = placement.trim();
            if (!normalized) throw new Error('Rewarded ad route placement must not be empty.');
            this.providers.set(normalized, entries[placement]);
        });
    }

    async preload(request: RewardedAdRequest): Promise<void> {
        const provider = this.providers.get(request.placement);
        if (!provider) throw new Error(`Rewarded ad placement "${request.placement}" is not configured.`);
        await provider.preload?.(request);
    }

    show(request: RewardedAdRequest): Promise<AdResult> {
        const provider = this.providers.get(request.placement);
        return provider
            ? provider.show(request)
            : Promise.resolve(failedRewarded(
                `Rewarded ad placement "${request.placement}" is not configured.`,
            ));
    }

    dispose(): void {
        const disposed = new Set<RewardedAdProvider>();
        this.providers.forEach((provider) => {
            if (disposed.has(provider)) return;
            disposed.add(provider);
            provider.dispose?.();
        });
        this.providers.clear();
    }
}

/** 激励广告公共边界；串行化展示、协调状态机，并统一记录请求与结果。 */
export class AdService {
    private showingRewarded?: {
        readonly key: string;
        readonly promise: Promise<AdResult>;
    };
    private appVisible = true;
    private pendingResume = false;
    private disposed = false;

    constructor(
        private readonly stateMachine: AppStateMachine,
        private readonly rewardedProvider: RewardedAdProvider,
        private readonly analytics?: AnalyticsService,
        private readonly gameEnablement?: Readonly<Record<string, boolean>>,
    ) {}

    isEnabledForGame(gameId: string): boolean {
        const normalized = gameId.trim();
        if (!normalized || this.disposed) return false;
        if (!this.gameEnablement) return true;
        return this.gameEnablement[normalized] === true;
    }

    async preloadRewarded(request: RewardedAdRequest): Promise<void> {
        if (this.disposed) return;
        const normalized = normalizeRequest(request);
        if (!this.isEnabledForGame(normalized.gameId)) return;
        await this.rewardedProvider.preload?.(normalized);
    }

    showRewarded(request: RewardedAdRequest): Promise<AdResult> {
        if (this.disposed) {
            return Promise.resolve(failedRewarded('Ad service has been disposed.'));
        }

        const normalized = normalizeRequest(request);
        if (!this.isEnabledForGame(normalized.gameId)) {
            return Promise.resolve(failedRewarded(
                `Ads are disabled for game "${normalized.gameId}".`,
            ));
        }
        const key = requestKey(normalized);

        if (this.showingRewarded) {
            return this.showingRewarded.key === key
                ? this.showingRewarded.promise
                : Promise.resolve(failedRewarded('Another rewarded ad is already showing.'));
        }

        if (this.stateMachine.currentState !== 'playing') {
            return Promise.resolve(failedRewarded(
                `Rewarded ad is unavailable from state "${this.stateMachine.currentState}".`,
            ));
        }

        const showing = this.performRewardedShow(normalized);
        this.showingRewarded = Object.freeze({ key, promise: showing });
        const clear = (): void => {
            if (this.showingRewarded?.promise === showing) {
                this.showingRewarded = undefined;
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
        if (!this.pendingResume) return;

        if (this.stateMachine.currentState !== 'paused') {
            this.pendingResume = false;
            return;
        }

        if (this.stateMachine.transition('playing')) {
            this.pendingResume = false;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.pendingResume = false;
        this.showingRewarded = undefined;
        this.rewardedProvider.dispose?.();
    }

    private async performRewardedShow(request: RewardedAdRequest): Promise<AdResult> {
        const pausedByAd = this.stateMachine.transition('paused');
        this.trackRequest('rewarded', request);
        let result: AdResult;

        try {
            const providerResult = await this.rewardedProvider.show(request);
            result = Object.freeze({
                outcome: providerResult.outcome,
                ...(providerResult.error ? { error: providerResult.error } : {}),
            });
        } catch (error: unknown) {
            result = failedRewarded(
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            if (pausedByAd && this.stateMachine.currentState === 'paused') {
                this.resumeAfterRewardedAd();
            }
        }

        this.trackResult('rewarded', request, result.outcome);
        return result;
    }

    private resumeAfterRewardedAd(): void {
        if (this.appVisible) {
            this.stateMachine.transition('playing');
            return;
        }

        this.pendingResume = true;
    }

    private trackRequest(format: 'rewarded', request: AdRequest): void {
        this.analytics?.track('ad_request', {
            format,
            placement: request.placement,
            gameId: request.gameId,
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        });
    }

    private trackResult(
        format: 'rewarded',
        request: AdRequest,
        outcome: AdOutcome,
    ): void {
        this.analytics?.track('ad_result', {
            format,
            placement: request.placement,
            outcome,
            gameId: request.gameId,
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        });
    }
}
