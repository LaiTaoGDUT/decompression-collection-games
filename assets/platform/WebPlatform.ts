import { EventBus } from '../core/events/EventBus';
import type {
    DeviceProfile,
    LaunchOptions,
    LocalImageSelection,
    PlatformLayoutInfo,
    PlatformUiRect,
    SafeArea,
    Unsubscribe,
} from '../core/types/CommonTypes';
import type { AccelerometerSample, Platform } from './Platform';

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
    private activeImagePicker?: {
        readonly cancel: () => void;
    };

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
        this.cancelLocalImagePicker();

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

    async pickLocalImage(): Promise<LocalImageSelection | null> {
        if (typeof document === 'undefined') {
            return null;
        }

        this.activeImagePicker?.cancel();

        const host = document.body ?? document.documentElement;
        if (!host) {
            return null;
        }

        return new Promise<LocalImageSelection | null>((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg';
            input.multiple = false;
            input.style.display = 'none';

            let settled = false;
            const settle = (selection: LocalImageSelection | null): void => {
                if (settled) {
                    return;
                }

                settled = true;
                if (this.activeImagePicker?.cancel === cancel) {
                    this.activeImagePicker = undefined;
                }
                input.remove();
                resolve(selection);
            };
            const cancel = (): void => settle(null);

            this.activeImagePicker = { cancel };
            input.addEventListener('change', () => {
                const file = input.files?.[0];
                if (!file
                    || typeof URL === 'undefined'
                    || typeof URL.createObjectURL !== 'function') {
                    settle(null);
                    return;
                }

                const uri = URL.createObjectURL(file);
                let released = false;
                settle({
                    uri,
                    mimeType: file.type || undefined,
                    sizeBytes: file.size,
                    release: (): void => {
                        if (released) {
                            return;
                        }

                        released = true;
                        URL.revokeObjectURL(uri);
                    },
                });
            });
            input.addEventListener('cancel', cancel);
            host.appendChild(input);

            try {
                input.click();
            } catch (_error: unknown) {
                settle(null);
            }
        });
    }

    cancelLocalImagePicker(): void {
        this.activeImagePicker?.cancel();
        this.activeImagePicker = undefined;
    }

    supportsVibration(): boolean {
        return false;
    }

    vibrate(_type: 'light' | 'medium' | 'heavy'): void {
        // 浏览器预览不模拟设备振动。
    }

    supportsAccelerometer(): boolean {
        return false;
    }

    startAccelerometer(): void {
        // 浏览器预览使用桌面触摸/鼠标滑动模拟颠锅。
    }

    stopAccelerometer(): void {
        // 浏览器预览没有原生加速度计。
    }

    onAccelerometerChange(_callback: (sample: AccelerometerSample) => void): () => void {
        return () => {};
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
