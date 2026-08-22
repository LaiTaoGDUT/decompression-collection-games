import { EventBus } from '../core/events/EventBus';
import type {
    DevicePerformanceTier,
    DeviceProfile,
    LaunchOptions,
    LocalImageSelection,
    PlatformLayoutInfo,
    PlatformUiRect,
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
    readonly SDKVersion?: string;
    readonly safeArea?: WeChatSafeArea;
    readonly pixelRatio?: number;
    readonly memorySize?: number;
    readonly benchmarkLevel?: number;
}

interface WeChatMenuButtonRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
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

interface WeChatMediaFile {
    /** chooseMedia 返回 tempFilePath，chooseImage 的 tempFiles 返回 path。 */
    readonly tempFilePath?: string;
    readonly path?: string;
    readonly fileType?: string;
    readonly size?: number;
}

interface WeChatChooseMediaResult {
    readonly tempFiles?: readonly WeChatMediaFile[];
}

interface WeChatChooseImageResult {
    readonly tempFilePaths?: readonly string[];
    readonly tempFiles?: readonly WeChatMediaFile[];
}

interface WeChatChooseMediaOptions {
    readonly count: number;
    readonly mediaType: readonly ['image'];
    readonly sourceType: readonly ['album'];
    readonly success?: (result: WeChatChooseMediaResult) => void;
    readonly fail?: (error?: WeChatApiError) => void;
}

interface WeChatChooseImageOptions {
    readonly count: number;
    readonly sizeType?: readonly ('original' | 'compressed')[];
    readonly sourceType: readonly ['album'];
    readonly success?: (result: WeChatChooseImageResult) => void;
    readonly fail?: (error?: WeChatApiError) => void;
}

interface WeChatApiError {
    readonly errMsg?: string;
}

interface WeChatApi {
    getSystemInfoSync(): WeChatSystemInfo;
    getMenuButtonBoundingClientRect?(): WeChatMenuButtonRect;
    getLaunchOptionsSync?(): WeChatLaunchOptions;
    vibrateShort?(options: {
        type: 'light' | 'medium' | 'heavy';
    }): void;
    showShareMenu?(options: {
        withShareTicket: boolean;
    }): void;
    chooseMedia?(options: WeChatChooseMediaOptions): void;
    chooseImage?(options: WeChatChooseImageOptions): void;
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

// 某些客户端会在原生相册回调前后错开派发生命周期事件；保留一个很短的
// 保护窗口，避免回调刚结束就被误判成小游戏真正切后台，进而打开暂停层。
const IMAGE_PICKER_LIFECYCLE_GRACE_MS = 1000;

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
    private layoutInfo?: PlatformLayoutInfo;
    private launchOptions?: LaunchOptions;
    private deviceProfile?: DeviceProfile;
    private initialized = false;
    private chooseMediaSupported = true;
    private imagePickerGeneration = 0;
    private cancelImagePicker?: () => void;
    private imagePickerActive = false;
    private imagePickerResultSettled = false;
    private imagePickerActivityResetTimer?: ReturnType<typeof setTimeout>;
    /** 原生相册会触发一对 hide/show；这对回调不应改变小游戏运行状态。 */
    private imagePickerLifecycleInterrupted = false;

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

        this.chooseMediaSupported = this.supportsChooseMedia(systemInfo.SDKVersion);
        this.safeArea = this.normalizeSafeArea(systemInfo);
        this.layoutInfo = this.normalizeLayoutInfo(systemInfo, api);
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
        this.cancelLocalImagePicker();
        this.api?.offShow?.(this.handleShow);
        this.api?.offHide?.(this.handleHide);
        this.events.clear();
        this.api = undefined;
        this.safeArea = undefined;
        this.layoutInfo = undefined;
        this.launchOptions = undefined;
        this.deviceProfile = undefined;
        this.chooseMediaSupported = true;
        this.imagePickerLifecycleInterrupted = false;
        this.initialized = false;
    }

    getSafeArea(): SafeArea {
        if (!this.safeArea) {
            throw new Error('WeChat platform is not initialized.');
        }

        return this.safeArea;
    }

    getLayoutInfo(): PlatformLayoutInfo {
        if (!this.layoutInfo) {
            throw new Error('WeChat platform is not initialized.');
        }

        return this.layoutInfo;
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

    async pickLocalImage(): Promise<LocalImageSelection | null> {
        const api = this.api;
        if (!api || (!api.chooseMedia && !api.chooseImage)) {
            return null;
        }

        // 重新选图前先完整取消并清空上一轮请求，不能只调用回调取消函数，
        // 否则上一轮的生命周期标记可能残留到下一次原生相册返回。
        this.cancelLocalImagePicker();
        const generation = ++this.imagePickerGeneration;
        this.imagePickerActive = true;
        this.imagePickerResultSettled = false;
        const isCurrent = (): boolean => this.initialized
            && this.api === api
            && this.imagePickerGeneration === generation;
        const normalize = (
            file: WeChatMediaFile | undefined,
            fallbackPath?: string,
        ): LocalImageSelection | null => {
            const uri = file?.tempFilePath ?? file?.path ?? fallbackPath;
            if (!uri || !isCurrent()) {
                return null;
            }

            return Object.freeze({
                uri,
                // chooseMedia 返回的 fileType 常见值是 image，而不是 image/jpeg。
                mimeType: file?.fileType === 'image' ? undefined : file?.fileType,
                sizeBytes: file?.size,
                // 微信临时文件由平台生命周期管理，业务层只需在会话结束时丢弃引用。
                release: (): void => {},
            });
        };

        return new Promise<LocalImageSelection | null>((resolve) => {
            let settled = false;
            const finish = (selection: LocalImageSelection | null): void => {
                if (settled) {
                    return;
                }

                settled = true;
                if (this.cancelImagePicker === cancel) {
                    this.cancelImagePicker = undefined;
                }
                if (this.imagePickerGeneration === generation) {
                    this.imagePickerResultSettled = true;
                    this.deferImagePickerActivityReset(generation);
                }
                resolve(isCurrent() ? selection : null);
            };
            const cancel = (): void => finish(null);
            this.cancelImagePicker = cancel;

            const chooseMedia = (): void => {
                if (typeof api.chooseMedia !== 'function'
                    || (!this.chooseMediaSupported && typeof api.chooseImage === 'function')) {
                    finish(null);
                    return;
                }

                try {
                    api.chooseMedia({
                        count: 1,
                        mediaType: ['image'],
                        sourceType: ['album'],
                        success: (result) => finish(normalize(result.tempFiles?.[0])),
                        fail: () => finish(null),
                    });
                } catch (_error: unknown) {
                    finish(null);
                }
            };

            const chooseImage = (): void => {
                if (typeof api.chooseImage !== 'function') {
                    chooseMedia();
                    return;
                }

                try {
                    api.chooseImage({
                        count: 1,
                        sizeType: ['original'],
                        sourceType: ['album'],
                        success: (result) => finish(normalize(
                            result.tempFiles?.[0],
                            result.tempFilePaths?.[0],
                        )),
                        fail: (error) => {
                            const message = error?.errMsg?.toLowerCase() ?? '';
                            if (typeof api.chooseMedia === 'function'
                                && this.chooseMediaSupported
                                && this.isUnsupportedImagePickerError(message)) {
                                chooseMedia();
                                return;
                            }

                            finish(null);
                        },
                    });
                } catch (_error: unknown) {
                    chooseMedia();
                }
            };

            try {
                // 这里只需要图片，优先使用重复调用行为更直接的 chooseImage；
                // 不可用时再回退到基础库 2.23.0+ 的 chooseMedia。
                chooseImage();
            } catch (_error: unknown) {
                finish(null);
            }
        });
    }

    cancelLocalImagePicker(): void {
        this.imagePickerGeneration += 1;
        this.imagePickerActive = false;
        this.imagePickerResultSettled = false;
        if (this.imagePickerActivityResetTimer !== undefined) {
            clearTimeout(this.imagePickerActivityResetTimer);
            this.imagePickerActivityResetTimer = undefined;
        }
        this.imagePickerLifecycleInterrupted = false;
        this.cancelImagePicker?.();
        this.cancelImagePicker = undefined;
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
        if (this.imagePickerLifecycleInterrupted) {
            this.imagePickerLifecycleInterrupted = false;
            if (this.imagePickerResultSettled) {
                this.imagePickerActive = false;
            }
            return;
        }

        // 有些客户端只回调 onShow、不回调 onHide；请求已完成时也要消费
        // 这次原生页面返回，不能把它当成小游戏重新前台并触发全局状态流转。
        if (this.imagePickerActive && this.imagePickerResultSettled) {
            this.imagePickerActive = false;
            return;
        }

        this.events.publish('show', undefined);
    };

    private readonly handleHide = (): void => {
        if (this.imagePickerActive || this.imagePickerLifecycleInterrupted) {
            this.imagePickerLifecycleInterrupted = true;
            return;
        }

        this.events.publish('hide', undefined);
    };

    private readonly deferImagePickerActivityReset = (generation: number): void => {
        if (this.imagePickerActivityResetTimer !== undefined) {
            clearTimeout(this.imagePickerActivityResetTimer);
        }

        this.imagePickerActivityResetTimer = setTimeout(() => {
            this.imagePickerActivityResetTimer = undefined;
            if (this.imagePickerGeneration !== generation) {
                return;
            }

            this.imagePickerActive = false;
            this.imagePickerResultSettled = false;
            this.imagePickerLifecycleInterrupted = false;
        }, IMAGE_PICKER_LIFECYCLE_GRACE_MS);
    };

    private isUnsupportedImagePickerError(message: string): boolean {
        return message.includes('not support')
            || message.includes('unsupported')
            || message.includes('not implemented');
    }

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

    private supportsChooseMedia(version?: string): boolean {
        if (!version) {
            return true;
        }

        const parts = version.split('.').map((part) => Number.parseInt(part, 10));
        const major = Number.isFinite(parts[0]) ? parts[0] : 0;
        const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
        return major > 2 || (major === 2 && minor >= 23);
    }

    private normalizeLayoutInfo(
        systemInfo: WeChatSystemInfo,
        api: WeChatApi,
    ): PlatformLayoutInfo {
        let topRightReservedArea: PlatformUiRect | undefined;

        try {
            const menuButton = api.getMenuButtonBoundingClientRect?.();
            if (menuButton && menuButton.width > 0 && menuButton.height > 0) {
                const scale = this.designWidth / systemInfo.screenWidth;
                topRightReservedArea = Object.freeze({
                    left: menuButton.left * scale,
                    top: menuButton.top * scale,
                    right: menuButton.right * scale,
                    bottom: menuButton.bottom * scale,
                    width: menuButton.width * scale,
                    height: menuButton.height * scale,
                });
            }
        } catch (error: unknown) {
            console.warn('[WeChatPlatform] Failed to read menu button bounds.', error);
        }

        return Object.freeze({
            safeArea: this.safeArea!,
            topRightReservedArea,
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
