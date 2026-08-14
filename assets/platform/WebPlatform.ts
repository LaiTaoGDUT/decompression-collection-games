import { EventBus } from '../core/events/EventBus';
import type {
    DeviceProfile,
    LaunchOptions,
    PlatformLayoutInfo,
    PlatformUiRect,
    SafeArea,
    Unsubscribe,
} from '../core/types/CommonTypes';
import type { Platform } from './Platform';

interface WebPlatformEvents {
    readonly show: void;
    readonly hide: void;
}

export interface WebPlatformOptions {
    readonly safeArea?: SafeArea;
    /** 浏览器预览胶囊避让效果时可注入模拟区域。 */
    readonly topRightReservedArea?: PlatformUiRect;
    readonly launchOptions?: LaunchOptions;
    readonly deviceProfile?: DeviceProfile;
}

const DEFAULT_SAFE_AREA: SafeArea = Object.freeze({
    left: 0,
    top: 0,
    right: 750,
    bottom: 1334,
    width: 750,
    height: 1334,
});

const DEFAULT_LAUNCH_OPTIONS: LaunchOptions = Object.freeze({
    query: Object.freeze({}),
});

const DEFAULT_DEVICE_PROFILE: DeviceProfile = Object.freeze({
    tier: 'medium',
    pixelRatio: 1,
});

/** Creator 浏览器预览和普通 Web 环境使用的平台实现。 */
export class WebPlatform implements Platform {
    readonly id = 'web';

    private readonly events = new EventBus<WebPlatformEvents>();
    private readonly safeArea: SafeArea;
    private readonly layoutInfo: PlatformLayoutInfo;
    private readonly launchOptions: LaunchOptions;
    private readonly deviceProfile: DeviceProfile;
    private initialized = false;
    private visible = true;

    constructor(options: WebPlatformOptions = {}) {
        this.safeArea = Object.freeze({
            ...(options.safeArea ?? DEFAULT_SAFE_AREA),
        });
        this.layoutInfo = Object.freeze({
            safeArea: this.safeArea,
            topRightReservedArea: options.topRightReservedArea
                ? Object.freeze({ ...options.topRightReservedArea })
                : undefined,
        });
        this.launchOptions = this.freezeLaunchOptions(
            options.launchOptions ?? DEFAULT_LAUNCH_OPTIONS,
        );
        this.deviceProfile = Object.freeze({
            ...(options.deviceProfile ?? DEFAULT_DEVICE_PROFILE),
        });
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.initialized = true;

        if (typeof document !== 'undefined') {
            this.visible = document.visibilityState !== 'hidden';
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }
    }

    dispose(): void {
        if (this.initialized && typeof document !== 'undefined') {
            document.removeEventListener(
                'visibilitychange',
                this.handleVisibilityChange,
            );
        }

        this.initialized = false;
        this.events.clear();
    }

    getSafeArea(): SafeArea {
        return this.safeArea;
    }

    getLayoutInfo(): PlatformLayoutInfo {
        return this.layoutInfo;
    }

    getDeviceProfile(): DeviceProfile {
        return this.deviceProfile;
    }

    getLaunchOptions(): LaunchOptions {
        return this.launchOptions;
    }

    supportsVibration(): boolean {
        return false;
    }

    vibrate(_type: 'light' | 'medium' | 'heavy'): void {
        // 浏览器预览不模拟设备振动。
    }

    showShareMenu(): void {
        // 浏览器预览没有平台分享菜单。
    }

    onShow(callback: () => void): Unsubscribe {
        return this.events.subscribe('show', callback);
    }

    onHide(callback: () => void): Unsubscribe {
        return this.events.subscribe('hide', callback);
    }

    /** 供浏览器调试和自动化测试模拟应用返回前台。 */
    simulateShow(): void {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.events.publish('show', undefined);
    }

    /** 供浏览器调试和自动化测试模拟应用进入后台。 */
    simulateHide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.events.publish('hide', undefined);
    }

    private readonly handleVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
            this.simulateHide();
            return;
        }

        this.simulateShow();
    };

    private freezeLaunchOptions(options: LaunchOptions): LaunchOptions {
        const referrerInfo = options.referrerInfo
            ? Object.freeze({ ...options.referrerInfo })
            : undefined;

        return Object.freeze({
            ...options,
            query: Object.freeze({ ...options.query }),
            referrerInfo,
        });
    }
}
