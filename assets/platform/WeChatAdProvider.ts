import type {
    AdResult,
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

export interface WeChatAdApi {
    createRewardedVideoAd?(options: {
        readonly adUnitId: string;
    }): WeChatRewardedVideoAd;
}

declare const wx: WeChatAdApi | undefined;

export interface WeChatAdPlacementOptions {
    readonly placement: string;
    readonly adUnitId: string;
    /** 测试注入入口；正式环境直接解析全局 wx。 */
    readonly api?: WeChatAdApi;
}

const REWARDED_CLOSE_TIMEOUT_MS = 5 * 60 * 1000;

function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error !== 'object' || error === null) return String(error);

    const source = error as WeChatAdError;
    const code = source.errCode ?? source.code;
    const message = source.errMsg ?? source.message ?? 'Unknown WeChat ad error.';
    return code === undefined ? message : `${code}: ${message}`;
}

abstract class WeChatAdPlacement {
    protected readonly placement: string;
    protected readonly adUnitId: string;
    private readonly providedApi?: WeChatAdApi;

    protected constructor(options: WeChatAdPlacementOptions) {
        this.placement = options.placement.trim();
        this.adUnitId = options.adUnitId.trim();
        this.providedApi = options.api;
    }

    protected requirePlacement(request: RewardedAdRequest): void {
        if (request.placement !== this.placement) {
            throw new Error(`WeChat ad placement "${request.placement}" is not configured.`);
        }
        if (!this.adUnitId) {
            throw new Error(`WeChat ad unit for "${this.placement}" is not configured.`);
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
        return request.placement === this.placement
            && Boolean(this.adUnitId);
    }
}

/** 微信激励视频实例复用；show 失败时按官方推荐显式 load 后重试一次。 */
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
            const timeout = setTimeout(() => {
                settle(Object.freeze({
                    outcome: 'failed',
                    error: latestError ?? 'WeChat rewarded ad close event timed out.',
                }));
            }, REWARDED_CLOSE_TIMEOUT_MS);

            const cleanup = (): void => {
                clearTimeout(timeout);
                ad.offClose?.(handleClose);
                ad.offError?.(handleError);
                this.pendingFailures.delete(failPending);
            };
            const settle = (result: AdResult): void => {
                if (settled) return;
                settled = true;
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
            };
            const failPending = (reason: string): void => {
                settle(Object.freeze({ outcome: 'failed', error: reason }));
            };

            ad.onClose(handleClose);
            ad.onError(handleError);
            this.pendingFailures.add(failPending);
            void this.showWithRetry(ad).catch((error: unknown) => {
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
        for (const fail of [...this.pendingFailures]) {
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

    private async showWithRetry(ad: WeChatRewardedVideoAd): Promise<void> {
        try {
            await ad.show();
        } catch (_firstError: unknown) {
            await ad.load();
            await ad.show();
        }
    }
}
