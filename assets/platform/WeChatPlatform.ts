import { EventBus } from '../core/events/EventBus';
import type {
    DevicePerformanceTier,
    DeviceProfile,
    LaunchOptions,
    SafeArea,
    Unsubscribe,
} from '../core/types/CommonTypes';
import type { Platform } from './Platform';

interface WeChatSafeArea {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

interface WeChatSystemInfo {
    readonly screenWidth: number;
    readonly screenHeight: number;
    readonly safeArea?: WeChatSafeArea;
    readonly pixelRatio?: number;
    readonly memorySize?: number;
    readonly benchmarkLevel?: number;
}

interface WeChatLaunchOptions {
    readonly scene?: number;
    readonly path?: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly shareTicket?: string;
    readonly referrerInfo?: Readonly<{
        appId?: string;
        extraData?: unknown;
    }>;
}

interface WeChatApi {
    getSystemInfoSync(): WeChatSystemInfo;
    getLaunchOptionsSync?(): WeChatLaunchOptions;
    vibrateShort?(options: {
        type: 'light' | 'medium' | 'heavy';
    }): void;
    showShareMenu?(options: {
        withShareTicket: boolean;
    }): void;
    onShow(callback: () => void): void;
    onHide(callback: () => void): void;
    offShow?(callback: () => void): void;
    offHide?(callback: () => void): void;
}

declare const wx: WeChatApi | undefined;

interface WeChatPlatformEvents {
    readonly show: void;
    readonly hide: void;
}

export interface WeChatPlatformOptions {
    /** 用于测试时注入微信 API 模拟对象。正式环境无需传入。 */
    readonly api?: WeChatApi;

    /** FIXED_WIDTH 适配策略下的设计宽度。 */
    readonly designWidth?: number;
}

/** 微信小游戏环境使用的平台实现。 */
export class WeChatPlatform implements Platform {
    readonly id = 'wechat';

    private readonly events = new EventBus<WeChatPlatformEvents>();
    private readonly providedApi?: WeChatApi;
    private readonly designWidth: number;
    private api?: WeChatApi;
    private safeArea?: SafeArea;
    private launchOptions?: LaunchOptions;
    private deviceProfile?: DeviceProfile;
    private initialized = false;

    constructor(options: WeChatPlatformOptions = {}) {
        if ((options.designWidth ?? 750) <= 0) {
            throw new Error('WeChat platform design width must be greater than zero.');
        }

        this.providedApi = options.api;
        this.designWidth = options.designWidth ?? 750;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const api = this.resolveApi();
        const systemInfo = api.getSystemInfoSync();

        this.safeArea = this.normalizeSafeArea(systemInfo);
        this.deviceProfile = this.normalizeDeviceProfile(systemInfo);
        this.launchOptions = this.normalizeLaunchOptions(
            api.getLaunchOptionsSync?.() ?? {},
        );
        this.api = api;
        api.onShow(this.handleShow);
        api.onHide(this.handleHide);
        this.initialized = true;
    }

    dispose(): void {
        this.api?.offShow?.(this.handleShow);
        this.api?.offHide?.(this.handleHide);
        this.events.clear();
        this.api = undefined;
        this.safeArea = undefined;
        this.launchOptions = undefined;
        this.deviceProfile = undefined;
        this.initialized = false;
    }

    getSafeArea(): SafeArea {
        if (!this.safeArea) {
            throw new Error('WeChat platform is not initialized.');
        }

        return this.safeArea;
    }

    getDeviceProfile(): DeviceProfile {
        if (!this.deviceProfile) {
            throw new Error('WeChat platform is not initialized.');
        }

        return this.deviceProfile;
    }

    getLaunchOptions(): LaunchOptions {
        if (!this.launchOptions) {
            throw new Error('WeChat platform is not initialized.');
        }

        return this.launchOptions;
    }

    supportsVibration(): boolean {
        return typeof this.api?.vibrateShort === 'function';
    }

    vibrate(type: 'light' | 'medium' | 'heavy'): void {
        this.api?.vibrateShort?.({ type });
    }

    showShareMenu(): void {
        this.api?.showShareMenu?.({ withShareTicket: true });
    }

    onShow(callback: () => void): Unsubscribe {
        return this.events.subscribe('show', callback);
    }

    onHide(callback: () => void): Unsubscribe {
        return this.events.subscribe('hide', callback);
    }

    private readonly handleShow = (): void => {
        this.events.publish('show', undefined);
    };

    private readonly handleHide = (): void => {
        this.events.publish('hide', undefined);
    };

    private resolveApi(): WeChatApi {
        if (this.providedApi) {
            return this.providedApi;
        }

        if (typeof wx === 'undefined') {
            throw new Error('WeChat API is unavailable in the current environment.');
        }

        return wx;
    }

    private normalizeSafeArea(systemInfo: WeChatSystemInfo): SafeArea {
        if (systemInfo.screenWidth <= 0 || systemInfo.screenHeight <= 0) {
            throw new Error('WeChat returned an invalid screen size.');
        }

        const scale = this.designWidth / systemInfo.screenWidth;
        const source = systemInfo.safeArea ?? {
            left: 0,
            top: 0,
            right: systemInfo.screenWidth,
            bottom: systemInfo.screenHeight,
            width: systemInfo.screenWidth,
            height: systemInfo.screenHeight,
        };

        const left = source.left * scale;
        const top = source.top * scale;
        const right = source.right * scale;
        const bottom = source.bottom * scale;

        return Object.freeze({
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
        });
    }

    private normalizeLaunchOptions(options: WeChatLaunchOptions): LaunchOptions {
        const referrerInfo = options.referrerInfo?.appId
            ? Object.freeze({
                appId: options.referrerInfo.appId,
                extraData: options.referrerInfo.extraData,
            })
            : undefined;

        return Object.freeze({
            scene: options.scene,
            path: options.path,
            query: Object.freeze({ ...(options.query ?? {}) }),
            shareTicket: options.shareTicket,
            referrerInfo,
        });
    }

    private normalizeDeviceProfile(systemInfo: WeChatSystemInfo): DeviceProfile {
        const memoryMB = systemInfo.memorySize && systemInfo.memorySize > 0
            ? systemInfo.memorySize
            : undefined;
        const benchmarkLevel = systemInfo.benchmarkLevel && systemInfo.benchmarkLevel > 0
            ? systemInfo.benchmarkLevel
            : undefined;
        let tier: DevicePerformanceTier = 'medium';

        if (
            (memoryMB !== undefined && memoryMB <= 2048)
            || (benchmarkLevel !== undefined && benchmarkLevel <= 10)
        ) {
            tier = 'low';
        } else if (
            memoryMB !== undefined
            && memoryMB >= 6144
            && benchmarkLevel !== undefined
            && benchmarkLevel >= 30
        ) {
            tier = 'high';
        }

        return Object.freeze({
            tier,
            pixelRatio: systemInfo.pixelRatio && systemInfo.pixelRatio > 0
                ? systemInfo.pixelRatio
                : 1,
            memoryMB,
            benchmarkLevel,
        });
    }
}
