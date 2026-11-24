import type {
    AdRequest,
    AdResult,
    InterstitialAdProvider,
    RewardedAdProvider,
    RewardedAdRequest,
} from '../services/ads/AdService';

interface WeChatAdError {
    readonly errCode?: number;
    readonly code?: number;
    readonly errMsg?: string;
    readonly message?: string;
}

interface WeChatRewardedCloseResult {
    readonly isEnded?: boolean;
}

type RewardedCloseListener = (result?: WeChatRewardedCloseResult) => void;
type AdErrorListener = (error: WeChatAdError) => void;

interface WeChatRewardedVideoAd {
    load(): Promise<unknown>;
    show(): Promise<unknown>;
    destroy?(): void;
    onClose(listener: RewardedCloseListener): void;
    offClose?(listener: RewardedCloseListener): void;
    onError(listener: AdErrorListener): void;
    offError?(listener: AdErrorListener): void;
}

interface WeChatInterstitialAd {
    load?(): Promise<unknown>;
    show(): Promise<unknown>;
    destroy?(): void;
    onClose(listener: () => void): void;
    offClose?(listener: () => void): void;
    onError(listener: AdErrorListener): void;
    offError?(listener: AdErrorListener): void;
}

export interface WeChatAdApi {
    createInterstitialAd?(options: {
        readonly adUnitId: string;
    }): WeChatInterstitialAd;
    createRewardedVideoAd?(options: {
        readonly adUnitId: string;
    }): WeChatRewardedVideoAd;
}

declare const wx: WeChatAdApi | undefined;

export interface WeChatAdPlacementOptions {
    readonly placements: readonly string[];
    readonly adUnitId: string;
    /** 测试注入入口；正式环境直接解析全局 wx。 */
    readonly api?: WeChatAdApi;
}

const AD_CLOSE_TIMEOUT_MS = 5 * 60 * 1000;
const REWARDED_OPERATION_TIMEOUT_MS = 15000;
const INTERSTITIAL_SHOW_TIMEOUT_MS = 2000;

function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error !== 'object' || error === null) return String(error);

    const source = error as WeChatAdError;
    const code = source.errCode ?? source.code;
    const message = source.errMsg ?? source.message ?? 'Unknown WeChat ad error.';
    return code === undefined ? message : `${code}: ${message}`;
}

abstract class WeChatAdPlacement {
    protected readonly placements: ReadonlySet<string>;
    protected readonly adUnitId: string;
    private readonly providedApi?: WeChatAdApi;

    protected constructor(options: WeChatAdPlacementOptions) {
        this.placements = new Set(options.placements.map((placement) => placement.trim()).filter(Boolean));
        this.adUnitId = options.adUnitId.trim();
        this.providedApi = options.api;
    }

    protected requirePlacement(request: RewardedAdRequest): void {
        if (!this.placements.has(request.placement)) {
            throw new Error(`WeChat ad placement "${request.placement}" is not configured.`);
        }
        if (!this.adUnitId) {
            throw new Error(`WeChat ad unit for "${request.placement}" is not configured.`);
        }
    }

    protected resolveApi(): WeChatAdApi {
        if (this.providedApi) return this.providedApi;
        if (typeof wx === 'undefined') {
            throw new Error('WeChat ad API is unavailable in the current environment.');
        }
        return wx;
    }

    isConfigured(request: RewardedAdRequest): boolean {
        return this.placements.has(request.placement)
            && Boolean(this.adUnitId);
    }
}

/** 同一广告单元的奖励入口共用实例；show 失败时显式 load 后重试一次。 */
export class WeChatRewardedAdProvider extends WeChatAdPlacement
    implements RewardedAdProvider {
    private instance?: WeChatRewardedVideoAd;
    private readonly pendingFailures = new Set<(reason: string) => void>();
    private disposed = false;

    constructor(options: WeChatAdPlacementOptions) {
        super(options);
    }

    async preload(request: RewardedAdRequest): Promise<void> {
        this.requirePlacement(request);
        await this.getInstance().load();
    }

    async show(request: RewardedAdRequest): Promise<AdResult> {
        if (this.disposed) {
            return Object.freeze({
                outcome: 'failed',
                error: 'WeChat rewarded ad provider is disposed.',
            });
        }

        try {
            this.requirePlacement(request);
        } catch (error: unknown) {
            return Object.freeze({ outcome: 'failed', error: describeError(error) });
        }

        let ad: WeChatRewardedVideoAd;
        try {
            ad = this.getInstance();
        } catch (error: unknown) {
            return Object.freeze({ outcome: 'failed', error: describeError(error) });
        }

        return new Promise<AdResult>((resolve) => {
            let settled = false;
            let latestError: string | undefined;
            let rejectOperation: ((error: Error) => void) | undefined;
            const timeout = setTimeout(() => {
                settle(Object.freeze({
                    outcome: 'failed',
                    error: latestError ?? 'WeChat rewarded ad close event timed out.',
                }));
            }, AD_CLOSE_TIMEOUT_MS);

            const cleanup = (): void => {
                clearTimeout(timeout);
                try { ad.offClose?.(handleClose); } catch (_error: unknown) {}
                try { ad.offError?.(handleError); } catch (_error: unknown) {}
                this.pendingFailures.delete(failPending);
            };
            const settle = (result: AdResult): void => {
                if (settled) return;
                settled = true;
                rejectOperation?.(new Error(result.error ?? 'WeChat rewarded ad has closed.'));
                cleanup();
                resolve(result);
            };
            const handleClose: RewardedCloseListener = (result) => {
                // 2.1.0 之前 close 回调没有参数；官方兼容规则视为完整观看。
                settle(Object.freeze({
                    outcome: result === undefined || result.isEnded === true
                        ? 'completed'
                        : 'skipped',
                }));
            };
            const handleError: AdErrorListener = (error) => {
                latestError = describeError(error);
                // show/load 期间的错误交给重试流程；播放中单独上报的错误立即结束请求。
                if (rejectOperation) rejectOperation(new Error(latestError));
                else settle(Object.freeze({ outcome: 'failed', error: latestError }));
            };
            const failPending = (reason: string): void => {
                settle(Object.freeze({ outcome: 'failed', error: reason }));
            };

            this.pendingFailures.add(failPending);
            try {
                ad.onClose(handleClose);
                ad.onError(handleError);
            } catch (error: unknown) {
                failPending(describeError(error));
                return;
            }
            if (settled) return;
            const runOperation = async (operation: () => Promise<unknown>): Promise<void> => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    await new Promise<void>((complete, reject) => {
                        rejectOperation = reject;
                        timer = setTimeout(() => failPending('WeChat rewarded ad load/show timed out.'),
                            REWARDED_OPERATION_TIMEOUT_MS);
                        try {
                            Promise.resolve(operation()).then(() => complete(), reject);
                        } catch (error: unknown) {
                            reject(error);
                        }
                    });
                } finally {
                    clearTimeout(timer);
                    rejectOperation = undefined;
                }
            };
            void (async (): Promise<void> => {
                try {
                    await runOperation(() => ad.show());
                } catch (_firstError: unknown) {
                    if (settled || this.disposed) return;
                    await runOperation(() => ad.load());
                    if (settled || this.disposed) return;
                    await runOperation(() => ad.show());
                }
            })().catch((error: unknown) => {
                settle(Object.freeze({
                    outcome: 'failed',
                    error: latestError ?? describeError(error),
                }));
            });
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const fail of Array.from(this.pendingFailures)) {
            fail('WeChat rewarded ad provider was disposed.');
        }
        this.pendingFailures.clear();
        this.instance?.destroy?.();
        this.instance = undefined;
    }

    private getInstance(): WeChatRewardedVideoAd {
        if (this.disposed) {
            throw new Error('WeChat rewarded ad provider is disposed.');
        }
        if (this.instance) return this.instance;

        const api = this.resolveApi();
        if (!api.createRewardedVideoAd) {
            throw new Error('wx.createRewardedVideoAd is unsupported.');
        }
        this.instance = api.createRewardedVideoAd({ adUnitId: this.adUnitId });
        return this.instance;
    }
}

/** 提前创建隐藏插屏；仅显式 show 展示，失败和频控不自动重放返回操作。 */
export class WeChatInterstitialAdProvider extends WeChatAdPlacement implements InterstitialAdProvider {
    private instance?: WeChatInterstitialAd;
    private cancelPending?: (reason: string) => void;
    private disposed = false;

    constructor(options: WeChatAdPlacementOptions) {
        super(options);
    }

    async preload(request: AdRequest): Promise<void> {
        this.requirePlacement(request);
        if (!this.cancelPending) await this.getInstance().load?.();
    }

    show(request: AdRequest): Promise<AdResult> {
        if (this.disposed || this.cancelPending) {
            return Promise.resolve({ outcome: 'failed', error: 'WeChat interstitial ad is unavailable.' });
        }
        let ad: WeChatInterstitialAd;
        try {
            this.requirePlacement(request);
            ad = this.getInstance();
        } catch (error: unknown) {
            return Promise.resolve({ outcome: 'failed', error: describeError(error) });
        }

        return new Promise<AdResult>((resolve) => {
            let settled = false;
            const timeout = (): void => {
                finish({ outcome: 'failed', error: 'WeChat interstitial ad timed out.' });
                // 取消悬挂的原生实例，避免返回大厅后才迟到展示。
                this.destroyInstance();
            };
            let timer = setTimeout(timeout, INTERSTITIAL_SHOW_TIMEOUT_MS);
            const finish = (result: AdResult): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { ad.offClose?.(close); } catch (_error: unknown) {}
                if (this.cancelPending === cancel) this.cancelPending = undefined;
                resolve(Object.freeze(result));
            };
            const close = (): void => finish({ outcome: 'completed' });
            const cancel = (reason: string): void => finish({ outcome: 'failed', error: reason });
            this.cancelPending = cancel;
            try {
                ad.onClose(close);
                void ad.show().then(() => {
                    if (settled) return;
                    clearTimeout(timer);
                    timer = setTimeout(timeout, AD_CLOSE_TIMEOUT_MS);
                }, (error: unknown) => {
                    finish({ outcome: 'failed', error: describeError(error) });
                    // 仅为下次主动返回准备素材，不在本次退出中重试展示。
                    if (!this.disposed && this.instance === ad) {
                        try { void ad.load?.().catch(() => {}); } catch (_error: unknown) {}
                    }
                });
            } catch (error: unknown) {
                finish({ outcome: 'failed', error: describeError(error) });
            }
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPending?.('WeChat interstitial ad provider was disposed.');
        this.destroyInstance();
    }

    private readonly handleError: AdErrorListener = (error) => {
        this.cancelPending?.(describeError(error));
    };

    private getInstance(): WeChatInterstitialAd {
        if (this.disposed) throw new Error('WeChat interstitial ad provider is disposed.');
        if (this.instance) return this.instance;
        const api = this.resolveApi();
        if (!api.createInterstitialAd) throw new Error('wx.createInterstitialAd is unsupported.');
        const ad = api.createInterstitialAd({ adUnitId: this.adUnitId });
        // 创建后会自动拉取广告；始终接住后台预加载的错误回调。
        ad.onError(this.handleError);
        this.instance = ad;
        return ad;
    }

    private destroyInstance(): void {
        const ad = this.instance;
        this.instance = undefined;
        if (!ad) return;
        try { ad.offError?.(this.handleError); } catch (_error: unknown) {}
        try { ad.destroy?.(); } catch (_error: unknown) {}
    }
}
