import type { AdRequest } from '../services/ads/AdService';
import type { InlineAdProvider, InlineAdSize, ManagedInlineAd } from '../services/ads/InlineAd';

interface NativeAdError { readonly errMsg?: string; readonly errCode?: number; }
interface NativeAdSize { readonly width: number; readonly height: number; }
interface WeChatCustomAd {
    readonly style: { left: number; top: number };
    show(): Promise<unknown>;
    hide(): Promise<unknown>;
    isShow?(): boolean;
    destroy(): void;
    onLoad(listener: () => void): void;
    offLoad?(listener: () => void): void;
    onError(listener: (error: NativeAdError) => void): void;
    offError?(listener: (error: NativeAdError) => void): void;
    onResize?(listener: (size: NativeAdSize) => void): void;
    offResize?(listener: (size: NativeAdSize) => void): void;
    onClose?(listener: () => void): void;
    offClose?(listener: () => void): void;
}

export interface WeChatInlineAdApi {
    getWindowInfo?(): { readonly windowWidth?: number; readonly screenWidth?: number };
    getSystemInfoSync?(): { readonly windowWidth?: number; readonly screenWidth?: number };
    createCustomAd?(options: {
        readonly adUnitId: string;
        readonly adIntervals: number;
        readonly style: { readonly left: number; readonly top: number; readonly width: number };
    }): WeChatCustomAd;
}

declare const wx: WeChatInlineAdApi | undefined;

export interface WeChatInlineAdOptions {
    readonly placement: string;
    readonly adUnitId: string;
    readonly api?: WeChatInlineAdApi;
}

/** 工厂只持有配置；每次大厅拥有独立实例，经 AdService 追踪与释放。 */
export class WeChatInlineAdProvider implements InlineAdProvider {
    constructor(private readonly options: WeChatInlineAdOptions) {}

    create(request: AdRequest, width = 1): ManagedInlineAd | undefined {
        if (request.placement !== this.options.placement || !this.options.adUnitId.trim()) return undefined;
        if (!Number.isFinite(width) || width <= 0 || width > 1) return undefined;
        const api = this.options.api ?? (typeof wx === 'undefined' ? undefined : wx);
        if (!api?.createCustomAd) return undefined;
        return new WeChatInlineAd(api, this.options.adUnitId.trim(), width);
    }
}

/** 原生层不受 Canvas 蒙版约束，由大厅同步滚动坐标及完整可见性。 */
class WeChatInlineAd implements ManagedInlineAd {
    private ad?: WeChatCustomAd;
    private loaded = false;
    private disposed = false;
    private allowed = false;
    private requested = false;
    private visible = false;
    private showing = false;
    private loadTimer?: ReturnType<typeof setTimeout>;
    private showTimer?: ReturnType<typeof setTimeout>;
    private dimensions: InlineAdSize = Object.freeze({ width: 1, height: 7 / 20 });
    private readonly listeners = new Set<() => void>();
    private lastLeft = Number.NaN;
    private lastTop = Number.NaN;
    private nativeWidth = 0;
    private nativeWindowWidth = 0;
    private detachNative?: () => void;

    constructor(private readonly api: WeChatInlineAdApi, private readonly adUnitId: string, width: number) {
        this.createNative(width, this.windowWidth());
    }

    private createNative(width: number, windowWidth: number): void {
        this.nativeWindowWidth = windowWidth;
        this.nativeWidth = width * windowWidth;
        this.dimensions = Object.freeze({ width, height: width * 7 / 20 });
        // width 仅在微信支持的模板上生效；不能用 Canvas 蒙版裁切原生层。
        const ad = this.api.createCustomAd!({
            adUnitId: this.adUnitId, adIntervals: 60,
            style: { left: (windowWidth - this.nativeWidth) / 2, top: 0, width: this.nativeWidth },
        });
        this.ad = ad;
        const current = (): boolean => !this.disposed && this.ad === ad;
        const onLoad = (): void => { if (current()) this.handleLoad(); };
        const onResize = (size: NativeAdSize): void => { if (current()) this.handleResize(size); };
        const onEnd = (): void => { if (current()) this.dispose(); };
        this.detachNative = () => {
            try { ad.offLoad?.(onLoad); } catch {}
            try { ad.offError?.(onEnd); } catch {}
            try { ad.offResize?.(onResize); } catch {}
            try { ad.offClose?.(onEnd); } catch {}
            try { ad.destroy(); } catch {}
        };
        try {
            this.loadTimer = setTimeout(onEnd, 10000);
            ad.onError(onEnd);
            if (this.disposed) return;
            ad.onLoad(onLoad);
            if (this.disposed) return;
            ad.onResize?.(onResize);
            if (this.disposed) return;
            ad.onClose?.(onEnd);
        } catch (error: unknown) {
            this.dispose();
            throw error;
        }
    }

    get ready(): boolean { return this.loaded && !this.disposed; }
    get size(): InlineAdSize { return this.dimensions; }

    setWidth(width: number): void {
        if (this.disposed || !Number.isFinite(width) || width <= 0 || width > 1) return;
        try {
            const windowWidth = this.windowWidth();
            if (Math.abs(width * windowWidth - this.nativeWidth) < 0.25
                && Math.abs(windowWidth - this.nativeWindowWidth) < 0.25) return;
            // CustomAd 只公开 left/top 的运行时修改；尺寸改变时重新创建并释放旧实例。
            this.releaseNative();
            this.createNative(width, windowWidth);
            this.notify();
        } catch { this.dispose(); }
    }

    setPosition(left: number, top: number): void {
        const ad = this.ad;
        if (!ad || this.disposed || !Number.isFinite(left) || !Number.isFinite(top)) return;
        try {
            const width = this.windowWidth();
            const x = left * width, y = top * width;
            if (Math.abs(x - this.lastLeft) < 0.25 && Math.abs(y - this.lastTop) < 0.25) return;
            ad.style.left = x;
            ad.style.top = y;
            this.lastLeft = x; this.lastTop = y;
        } catch { this.dispose(); }
    }

    setVisible(visible: boolean): void {
        if (this.requested === visible) return;
        this.requested = visible;
        this.syncVisibility();
    }

    setAllowed(allowed: boolean): void {
        if (this.allowed === allowed) return;
        this.allowed = allowed;
        this.syncVisibility();
    }

    subscribe(listener: () => void): () => void {
        if (this.disposed) return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.releaseNative();
        this.notify();
        this.listeners.clear();
    }

    private releaseNative(): void {
        this.loaded = false;
        clearTimeout(this.loadTimer); clearTimeout(this.showTimer);
        this.ad = undefined;
        this.detachNative?.();
        this.detachNative = undefined;
        this.visible = false;
        this.showing = false;
        this.lastLeft = Number.NaN;
        this.lastTop = Number.NaN;
    }

    private syncVisibility(): void {
        const ad = this.ad;
        if (!ad || this.disposed) return;
        if (!this.ready || !this.requested || !this.allowed) {
            if (this.visible || this.showing) this.hide(ad);
            this.visible = false;
            return;
        }
        if (this.visible || this.showing) return;
        this.showing = true;
        this.showTimer = setTimeout(() => { if (this.ad === ad) this.dispose(); }, 2000);
        try {
            void ad.show().then(() => {
                if (this.disposed || this.ad !== ad) return;
                clearTimeout(this.showTimer);
                this.showing = false;
                this.visible = true;
                // show 回执可能晚于滚出屏幕、打开弹窗或离开大厅。
                if (!this.requested || !this.allowed) { this.hide(ad); this.visible = false; }
            }, () => { if (this.ad === ad) this.dispose(); });
        } catch { this.dispose(); }
    }

    private hide(ad: WeChatCustomAd): void {
        try {
            void ad.hide().then(() => {
                // 个别模板不支持隐藏；销毁仍显示的实例，避免跨场景覆盖游戏或弹窗。
                if (!this.disposed && this.ad === ad && (!this.requested || !this.allowed) && ad.isShow?.()) this.dispose();
            }).catch(() => { if (this.ad === ad) this.dispose(); });
        } catch { this.dispose(); }
    }

    private readonly handleLoad = (): void => {
        if (this.disposed) return;
        clearTimeout(this.loadTimer);
        this.loaded = true;
        this.notify();
        this.syncVisibility();
    };

    private readonly handleResize = (size: NativeAdSize): void => {
        if (this.disposed || !Number.isFinite(size.width) || !Number.isFinite(size.height)
            || size.width <= 0 || size.height <= 0) return;
        let width: number;
        try { width = this.windowWidth(); } catch { this.dispose(); return; }
        if (size.width > width + 0.5) { this.dispose(); return; }
        const next = { width: Math.min(1, size.width / width), height: size.height / width };
        if (Math.abs(next.width - this.dimensions.width) < 0.0001
            && Math.abs(next.height - this.dimensions.height) < 0.0001) return;
        this.dimensions = Object.freeze(next);
        this.notify();
    };

    private windowWidth(): number {
        const info = this.api.getWindowInfo?.() ?? this.api.getSystemInfoSync?.();
        const width = info?.windowWidth ?? info?.screenWidth;
        if (!Number.isFinite(width) || width! <= 0) throw new Error('WeChat window width is unavailable.');
        return width!;
    }

    private notify(): void { this.listeners.forEach(listener => listener()); }
}
