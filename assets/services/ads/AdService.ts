import type { AppStateMachine } from '../../core/state/AppStateMachine';
import type { Platform } from '../../platform/Platform';
import type { AnalyticsService } from '../analytics/AnalyticsService';
import type { InlineAd, InlineAdProvider, ManagedInlineAd } from './InlineAd';

export const AD_PLACEMENTS = Object.freeze({
    watermelonRevive: 'watermelon-revive',
    chessEndlessRevive: 'chess-endless-revive',
    desktopCleanupRewarded: 'desktop-cleanup-rewarded',
    doodleJumpRevive: 'doodle-jump-revive',
    bubbleShooterRevive: 'bubble-shooter-revive',
    flappyDunkRevive: 'flappy-dunk-revive',
    game2048ClearSmallTiles: 'game2048-clear-small-tiles',
    meowdokuTool: 'meowdoku-tool',
    multiColorFillHint: 'multi-color-fill-hint',
    cityBloxxRevive: 'city-bloxx-revive',
    rotateRingsHint: 'rotate-rings-hint',
    cubeAwayRevive: 'cube-away-revive',
} as const);

export const LOBBY_RETURN_INTERSTITIAL = 'return-to-lobby';

export type AdOutcome = 'completed' | 'skipped' | 'failed';

export interface AdResult {
    readonly outcome: AdOutcome;
    readonly error?: string;
    /** 公共服务已显示提示，或已安排在回到前台时显示，调用方无需重复弹提示。 */
    readonly feedbackShown?: boolean;
    readonly errorCode?: 'not-configured';
}

export interface AdRequest {
    readonly placement: string;
    readonly gameId: string;
    readonly sessionId?: string;
}

export type RewardedAdRequest = AdRequest;

export interface RewardedAdProvider {
    /** 返回当前请求是否有可实际展示的广告配置。 */
    isConfigured?(request: RewardedAdRequest): boolean;
    preload?(request: RewardedAdRequest): Promise<void>;
    show(request: RewardedAdRequest): Promise<AdResult>;
    dispose?(): void;
}

/** 插屏不发放奖励；关闭、失败或未配置均由运行层继续返回大厅。 */
export interface InterstitialAdProvider {
    isConfigured?(request: AdRequest): boolean;
    preload?(request: AdRequest): Promise<void>;
    show(request: AdRequest): Promise<AdResult>;
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

function failedRewarded(error: string, errorCode?: AdResult['errorCode']): AdResult {
    return Object.freeze({ outcome: 'failed', error, ...(errorCode ? { errorCode } : {}) });
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

    isConfigured(request: RewardedAdRequest): boolean {
        const provider = this.providers.get(request.placement);
        return Boolean(provider)
            && (provider?.isConfigured?.(request) ?? true);
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
                'not-configured',
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

/** 广告公共边界；串行化展示、协调状态机，并统一记录请求与结果。 */
export class AdService {
    private showingRewarded?: {
        readonly key: string;
        readonly promise: Promise<AdResult>;
    };
    private showingInterstitial?: {
        readonly key: string;
        readonly promise: Promise<AdResult>;
    };
    private appVisible = true;
    private pendingResume = false;
    private pendingRewardedFeedback?: string;
    private disposed = false;
    private readonly inlineAds = new Set<ManagedInlineAd>();
    private readonly unsubscribeState?: () => void;

    constructor(
        private readonly stateMachine: AppStateMachine,
        private readonly rewardedProvider: RewardedAdProvider,
        private readonly analytics?: AnalyticsService,
        private readonly gameEnablement?: Readonly<Record<string, boolean>>,
        private readonly platform?: Pick<Platform, 'showToast'>,
        private readonly interstitialProvider?: InterstitialAdProvider,
        private readonly inlineProvider?: InlineAdProvider,
    ) {
        if (inlineProvider) {
            this.unsubscribeState = stateMachine.subscribe('afterTransition', () => this.refreshInlineAds());
        }
    }

    createInlineAd(request: AdRequest, width = 1): InlineAd | undefined {
        if (this.disposed || !this.inlineProvider) return undefined;
        let ad: ManagedInlineAd | undefined;
        try { ad = this.inlineProvider.create(normalizeRequest(request), width); } catch { return undefined; }
        if (!ad) return undefined;
        this.inlineAds.add(ad);
        this.refreshInlineAds();
        const owned = ad;
        return {
            get ready() { return owned.ready; },
            get size() { return owned.size; },
            setWidth: (value) => owned.setWidth(value),
            setPosition: (left, top) => owned.setPosition(left, top),
            setVisible: (visible) => owned.setVisible(visible),
            subscribe: (listener) => owned.subscribe(listener),
            dispose: () => { this.inlineAds.delete(owned); owned.dispose(); },
        };
    }

    private refreshInlineAds(): void {
        const allowed = !this.disposed && this.appVisible && this.stateMachine.currentState === 'lobby';
        this.inlineAds.forEach(ad => ad.setAllowed(allowed));
    }

    isEnabledForGame(gameId: string): boolean {
        const normalized = gameId.trim();
        if (!normalized || this.disposed) return false;
        if (!this.gameEnablement) return true;
        return this.gameEnablement[normalized] === true;
    }

    private isRewardedConfigured(request: RewardedAdRequest): boolean {
        return this.rewardedProvider.isConfigured?.(request) ?? true;
    }

    async preloadRewarded(request: RewardedAdRequest): Promise<void> {
        if (this.disposed) return;
        const normalized = normalizeRequest(request);
        if (!this.isEnabledForGame(normalized.gameId)
            || !this.isRewardedConfigured(normalized)) return;
        await this.rewardedProvider.preload?.(normalized);
    }

    showRewarded(request: RewardedAdRequest): Promise<AdResult> {
        try {
            return this.requestRewarded(request);
        } catch (error: unknown) {
            return this.rejectRewarded(error instanceof Error ? error.message : String(error));
        }
    }

    private requestRewarded(request: RewardedAdRequest): Promise<AdResult> {
        if (this.disposed) {
            return this.rejectRewarded('Ad service has been disposed.');
        }

        const normalized = normalizeRequest(request);
        if (this.showingInterstitial) {
            return this.rejectRewarded('An interstitial ad is already showing.');
        }
        if (!this.isEnabledForGame(normalized.gameId)) {
            return this.rejectRewarded(
                `Ads are disabled for game "${normalized.gameId}".`,
            );
        }
        if (!this.isRewardedConfigured(normalized)) {
            return this.rejectRewarded('Rewarded ad placement is not configured.', 'not-configured');
        }
        const key = requestKey(normalized);

        if (this.showingRewarded) {
            return this.showingRewarded.key === key
                ? this.showingRewarded.promise
                : this.rejectRewarded('Another rewarded ad is already showing.');
        }

        if (!this.appVisible || this.stateMachine.currentState !== 'playing') {
            return this.rejectRewarded(
                `Rewarded ad is unavailable from state "${this.stateMachine.currentState}".`,
            );
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

    private rejectRewarded(error: string, errorCode?: AdResult['errorCode']): Promise<AdResult> {
        return Promise.resolve(this.notifyRewardedResult(failedRewarded(error, errorCode)));
    }

    /** 平台提示显示在游戏弹层之上；后台失败留到回前台再提示。 */
    private notifyRewardedResult(result: AdResult): AdResult {
        if (result.outcome === 'completed' || this.disposed || !this.platform) return result;
        const message = result.outcome === 'skipped'
            ? '广告未看完，未获得奖励'
            : result.errorCode === 'not-configured' ? '广告暂不可用' : '广告暂时无法播放，请稍后再试';
        if (this.appVisible) this.platform.showToast(message);
        else this.pendingRewardedFeedback = message;
        return Object.freeze({ ...result, feedbackShown: true });
    }

    async preloadInterstitial(request: AdRequest): Promise<void> {
        if (this.disposed || !this.interstitialProvider) return;
        const normalized = normalizeRequest(request);
        if (this.interstitialProvider.isConfigured?.(normalized) === false) return;
        await this.interstitialProvider.preload?.(normalized);
    }

    /** 仅运行层在主动返回、已显示大厅后调用；不恢复已结束的对局。 */
    showInterstitial(request: AdRequest): Promise<AdResult> {
        if (this.disposed || !this.appVisible || this.showingRewarded) {
            return Promise.resolve({ outcome: 'failed', error: 'Interstitial ad is unavailable.' });
        }
        const normalized = normalizeRequest(request);
        const provider = this.interstitialProvider;
        if (!provider || provider.isConfigured?.(normalized) === false) {
            return Promise.resolve({ outcome: 'failed', errorCode: 'not-configured' });
        }
        const key = requestKey(normalized);
        if (this.showingInterstitial) {
            return this.showingInterstitial.key === key
                ? this.showingInterstitial.promise
                : Promise.resolve({ outcome: 'failed', error: 'An interstitial ad is already showing.' });
        }
        if (this.stateMachine.currentState !== 'lobby') {
            return Promise.resolve({ outcome: 'failed', error: 'Interstitial ad requires the lobby to be ready.' });
        }
        const showing = this.performInterstitialShow(normalized, provider);
        this.showingInterstitial = Object.freeze({ key, promise: showing });
        const clear = (): void => {
            if (this.showingInterstitial?.promise === showing) this.showingInterstitial = undefined;
        };
        void showing.then(clear, clear);
        return showing;
    }

    onHide(): void {
        this.appVisible = false;
        this.refreshInlineAds();
    }

    onShow(): void {
        this.appVisible = true;
        this.refreshInlineAds();
        if (this.pendingResume) {
            if (this.stateMachine.currentState !== 'paused' || this.stateMachine.transition('playing')) {
                this.pendingResume = false;
            }
        }
        const message = this.pendingRewardedFeedback;
        this.pendingRewardedFeedback = undefined;
        if (message && !this.disposed) this.platform?.showToast(message);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unsubscribeState?.();
        this.inlineAds.forEach(ad => ad.dispose());
        this.inlineAds.clear();
        this.pendingResume = false;
        this.pendingRewardedFeedback = undefined;
        this.showingRewarded = undefined;
        this.showingInterstitial = undefined;
        this.rewardedProvider.dispose?.();
        this.interstitialProvider?.dispose?.();
    }

    private async performInterstitialShow(request: AdRequest, provider: InterstitialAdProvider): Promise<AdResult> {
        this.trackRequest('interstitial', request);
        let result: AdResult;
        try {
            result = Object.freeze({ ...await provider.show(request) });
        } catch (error: unknown) {
            result = Object.freeze({ outcome: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
        this.trackResult('interstitial', request, result.outcome);
        return result;
    }

    private async performRewardedShow(request: RewardedAdRequest): Promise<AdResult> {
        const pausedByAd = this.stateMachine.transition('paused');
        let result: AdResult;

        try {
            this.trackRequest('rewarded', request);
            const providerResult = await this.rewardedProvider.show(request);
            result = Object.freeze({
                outcome: providerResult.outcome,
                ...(providerResult.error ? { error: providerResult.error } : {}),
                ...(providerResult.errorCode ? { errorCode: providerResult.errorCode } : {}),
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
        return this.notifyRewardedResult(result);
    }

    private resumeAfterRewardedAd(): void {
        if (this.appVisible) {
            this.stateMachine.transition('playing');
            return;
        }

        this.pendingResume = true;
    }

    private trackRequest(format: 'rewarded' | 'interstitial', request: AdRequest): void {
        this.analytics?.track('ad_request', {
            format,
            placement: request.placement,
            gameId: request.gameId,
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        });
    }

    private trackResult(
        format: 'rewarded' | 'interstitial',
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
