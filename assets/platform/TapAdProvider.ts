import type {
    AdResult,
    RewardedAdProvider,
    RewardedAdRequest,
} from '../services/ads/AdService';

interface TapAdError {
    readonly errMsg?: string;
    readonly errCode?: number;
    readonly errno?: number;
}

interface TapRewardedVideoAd {
    load(): Promise<unknown>;
    show(): Promise<unknown>;
    onClose(callback: (result?: { readonly isEnded?: boolean }) => void): void;
    offClose(callback: (result?: { readonly isEnded?: boolean }) => void): void;
    onError(callback: (error: TapAdError) => void): void;
    offError(callback: (error: TapAdError) => void): void;
    destroy(): void;
}

export interface TapAdApi {
    createRewardedVideoAd(options: { readonly adUnitId: string }): TapRewardedVideoAd;
}

declare const tap: TapAdApi | undefined;

export interface TapAdOptions {
    readonly adUnitId: string;
    readonly placements: readonly string[];
    readonly api?: TapAdApi;
}

function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (!error || typeof error !== 'object') return String(error);
    const detail = error as TapAdError;
    const code = detail.errCode ?? detail.errno;
    return `${code === undefined ? '' : `${code}: `}${detail.errMsg ?? 'Tap rewarded ad failed.'}`;
}

/** Tap 广告为平台单例；合集所有奖励入口共用一个真实广告位及实例。 */
export class TapRewardedAdProvider implements RewardedAdProvider {
    private readonly adUnitId: string;
    private readonly placements: ReadonlySet<string>;
    private instance?: TapRewardedVideoAd;
    private loading?: Promise<void>;
    private cancelPending?: () => void;
    private disposed = false;

    constructor(private readonly options: TapAdOptions) {
        this.adUnitId = options.adUnitId.trim();
        this.placements = new Set(options.placements);
    }

    isConfigured(request: RewardedAdRequest): boolean {
        return !this.disposed && Boolean(this.adUnitId) && this.placements.has(request.placement);
    }

    async preload(request: RewardedAdRequest): Promise<void> {
        if (!this.isConfigured(request)) throw new Error('Tap rewarded ad is not configured.');
        // 正在展示时不能再次 load 平台单例，避免更换当前素材。
        if (!this.cancelPending) await this.load(this.getInstance());
    }

    show(request: RewardedAdRequest): Promise<AdResult> {
        if (!this.isConfigured(request)) return Promise.resolve({ outcome: 'failed', error: 'Tap rewarded ad is not configured.' });
        if (this.cancelPending) return Promise.resolve({ outcome: 'failed', error: 'Tap rewarded ad is already showing.' });
        let ad: TapRewardedVideoAd;
        try {
            ad = this.getInstance();
        } catch (error: unknown) {
            return Promise.resolve({ outcome: 'failed', error: describeError(error) });
        }
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => finish({ outcome: 'failed', error: 'Tap rewarded ad timed out.' }), 5 * 60 * 1000);
            const cancel = (): void => finish({ outcome: 'failed', error: 'Tap rewarded ad was disposed.' });
            const finish = (result: AdResult): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                // 某些客户端在原生广告销毁后会让 off 方法抛错，仍须完成结算和清理。
                try { ad.offClose(close); } catch (_error: unknown) {}
                try { ad.offError(fail); } catch (_error: unknown) {}
                if (this.cancelPending === cancel) this.cancelPending = undefined;
                resolve(Object.freeze(result));
            };
            const close = (result?: { readonly isEnded?: boolean }): void => finish({
                // Tap 不采用旧微信的 undefined 即完成兼容规则。
                outcome: result?.isEnded === true ? 'completed' : 'skipped',
            });
            const fail = (error: TapAdError): void => finish({ outcome: 'failed', error: describeError(error) });
            this.cancelPending = cancel;
            try {
                ad.onClose(close);
                ad.onError(fail);
            } catch (error: unknown) {
                finish({ outcome: 'failed', error: describeError(error) });
                return;
            }
            void (async (): Promise<void> => {
                // 与启动预加载共用同一请求，不能同时更换平台单例的素材。
                if (this.loading) await this.loading.catch(() => {});
                if (settled || this.disposed) return;
                try {
                    await ad.show();
                } catch (_firstError: unknown) {
                    if (settled || this.disposed) return;
                    await this.load(ad);
                    if (!settled && !this.disposed) await ad.show();
                }
            })().catch((error: unknown) => finish({ outcome: 'failed', error: describeError(error) }));
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.cancelPending?.();
        try {
            this.instance?.destroy();
        } finally {
            this.instance = undefined;
        }
    }

    private getInstance(): TapRewardedVideoAd {
        if (this.disposed) throw new Error('Tap rewarded ad provider is disposed.');
        if (this.instance) return this.instance;
        const api = this.options.api ?? (typeof tap === 'undefined' ? undefined : tap);
        if (!api?.createRewardedVideoAd) throw new Error('Tap rewarded ad API is unavailable.');
        this.instance = api.createRewardedVideoAd({ adUnitId: this.adUnitId });
        return this.instance;
    }

    private load(ad: TapRewardedVideoAd): Promise<void> {
        if (this.loading) return this.loading;
        const operation = (async (): Promise<void> => { await ad.load(); })();
        this.loading = operation;
        const clear = (): void => { if (this.loading === operation) this.loading = undefined; };
        void operation.then(clear, clear);
        return operation;
    }
}
