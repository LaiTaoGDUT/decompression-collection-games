import { EventBus } from '../core/events/EventBus';
import type {
    DevicePerformanceTier,
    DeviceProfile,
    LaunchOptions,
    LocalImageCropRequest,
    LocalImageSelection,
    PlatformLayoutInfo,
    PlatformUiRect,
    SafeArea,
    ScreenOrientation,
    Unsubscribe,
} from '../core/types/CommonTypes';
import type { AccelerometerSample, Platform } from './Platform';
import type { PlatformAudioContext } from './PlatformAudio';

interface MiniGameSafeArea {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

export interface MiniGameSystemInfo {
    readonly screenWidth: number;
    readonly screenHeight: number;
    readonly windowWidth?: number;
    readonly windowHeight?: number;
    readonly SDKVersion?: string;
    readonly safeArea?: MiniGameSafeArea;
    readonly pixelRatio?: number;
    readonly memorySize?: number;
    readonly benchmarkLevel?: number;
}

interface MiniGameMenuButtonRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

interface MiniGameLaunchOptions {
    readonly scene?: number;
    readonly path?: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly shareTicket?: string;
    readonly referrerInfo?: Readonly<{
        appId?: string;
        extraData?: unknown;
    }>;
}

interface MiniGameMediaFile {
    readonly tempFilePath?: string;
    readonly fileType?: string;
    readonly size?: number;
}

interface MiniGameChooseMediaResult {
    readonly tempFiles?: readonly MiniGameMediaFile[];
}

export interface MiniGameChooseMediaOptions {
    readonly count: number;
    readonly mediaType: readonly ['image'];
    readonly sourceType: readonly ['album'];
    readonly success?: (result: MiniGameChooseMediaResult) => void;
    readonly fail?: (error?: MiniGameApiError) => void;
}

interface MiniGameImage {
    src: string;
    onload?: (() => void) | null;
    onerror?: (() => void) | null;
}

interface MiniGameCanvas2DContext {
    clearRect(x: number, y: number, width: number, height: number): void;
    drawImage(
        image: MiniGameImage,
        sourceX: number,
        sourceY: number,
        sourceWidth: number,
        sourceHeight: number,
        destinationX: number,
        destinationY: number,
        destinationWidth: number,
        destinationHeight: number,
    ): void;
}

interface MiniGameCanvasFileResult {
    readonly tempFilePath?: string;
}

interface MiniGameCanvas {
    width: number;
    height: number;
    getContext(type: '2d'): MiniGameCanvas2DContext | null;
    createImage?(): MiniGameImage;
    toDataURL?(type?: string, encoderOptions?: number): string;
    toTempFilePath?(options: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        destWidth?: number;
        destHeight?: number;
        fileType?: 'jpg' | 'png';
        quality?: number;
        success?: (result: MiniGameCanvasFileResult) => void;
        fail?: (error?: MiniGameApiError) => void;
    }): string | void;
    toTempFilePathSync?(options: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        destWidth?: number;
        destHeight?: number;
        fileType?: 'jpg' | 'png';
        quality?: number;
    }): string | void;
}

interface MiniGameApiError {
    readonly errMsg?: string;
}

interface MiniGameAccelerometerChangeResult {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

interface MiniGameAccelerometerOptions {
    readonly interval?: 'game' | 'ui' | 'normal';
}

export interface MiniGameApi {
    createWebAudioContext?(): PlatformAudioContext;
    getSystemInfoSync(): MiniGameSystemInfo;
    getWindowInfo?(): Partial<MiniGameSystemInfo>;
    setDeviceOrientation?(options: {
        value: ScreenOrientation;
        success(): void;
        fail(error?: MiniGameApiError): void;
    }): void;
    onWindowResize?(callback: () => void): void;
    offWindowResize?(callback: () => void): void;
    onDeviceOrientationChange?(callback: () => void): void;
    offDeviceOrientationChange?(callback: () => void): void;
    getMenuButtonBoundingClientRect?(): MiniGameMenuButtonRect;
    getLaunchOptionsSync?(): MiniGameLaunchOptions;
    vibrateShort?(options: {
        type: 'light' | 'medium' | 'heavy';
    }): void;
    startAccelerometer?(options?: MiniGameAccelerometerOptions): void;
    stopAccelerometer?(): void;
    onAccelerometerChange?(callback: (result: MiniGameAccelerometerChangeResult) => void): void;
    offAccelerometerChange?(callback: (result: MiniGameAccelerometerChangeResult) => void): void;
    showToast?(options: {
        readonly title: string;
        readonly icon: 'none';
        readonly duration: number;
    }): void;
    showShareMenu?(options: {
        withShareTicket: boolean;
        menus?: readonly ('shareAppMessage' | 'shareTimeline')[];
        fail?: (error?: MiniGameApiError) => void;
    }): void;
    chooseMedia?(options: MiniGameChooseMediaOptions): void;
    createImage?(): MiniGameImage;
    createCanvas?(): MiniGameCanvas;
    env?: { readonly USER_DATA_PATH?: string };
    getFileSystemManager?(): {
        mkdir(options: { dirPath: string; recursive?: boolean; success?: () => void; fail?: (error?: MiniGameApiError) => void }): void;
        copyFile(options: { srcPath: string; destPath: string; success?: () => void; fail?: (error?: MiniGameApiError) => void }): void;
        writeFile(options: { filePath: string; data: string; encoding: 'base64'; success?: () => void; fail?: (error?: MiniGameApiError) => void }): void;
        access(options: { path: string; success?: () => void; fail?: () => void }): void;
        unlink(options: { filePath: string; success?: () => void; fail?: () => void }): void;
    };
    onShow(callback: () => void): void;
    onHide(callback: () => void): void;
    offShow?(callback: () => void): void;
    offHide?(callback: () => void): void;
}

interface MiniGamePlatformEvents {
    readonly show: void;
    readonly hide: void;
    readonly layout: PlatformLayoutInfo;
}

// 某些客户端会在原生相册回调前后错开派发生命周期事件；保留一个很短的
// 保护窗口，避免回调刚结束就被误判成小游戏真正切后台，进而打开暂停层。
const IMAGE_PICKER_LIFECYCLE_GRACE_MS = 1000;

export interface MiniGamePlatformOptions {
    readonly id: string;
    readonly getApi: () => MiniGameApi;
    readonly api?: MiniGameApi;
    /** 各平台按自身 SDK 版本判断媒体能力，版本号不能跨平台比较。 */
    readonly supportsChooseMedia?: (version?: string) => boolean;

    /** FIXED_WIDTH 适配策略下的设计宽度。 */
    readonly designWidth?: number;
    readonly orientationTimeoutMs?: number;
}

/** 小游戏共享能力；具体平台负责提供 API 和平台差异。 */
export class MiniGamePlatform implements Platform {
    readonly id: string;
    createAudioContext(): PlatformAudioContext | undefined {
        return this.api?.createWebAudioContext?.();
    }
    private readonly platformOptions: MiniGamePlatformOptions;

    private readonly events = new EventBus<MiniGamePlatformEvents>();
    private readonly providedApi?: MiniGameApi;
    private designWidth: number;
    private orientation: ScreenOrientation = 'portrait';
    private readonly orientationOperations = new Set<() => void>();
    protected api?: MiniGameApi;
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
    private accelerometerStarted = false;
    private readonly accelerometerListeners = new Set<(sample: AccelerometerSample) => void>();
    private readonly pendingImageOperations = new Set<() => void>();

    constructor(options: MiniGamePlatformOptions) {
        this.platformOptions = options;
        this.id = options.id;
        if ((options.designWidth ?? 750) <= 0) {
            throw new Error('MiniGame platform design width must be greater than zero.');
        }

        this.providedApi = options.api;
        this.designWidth = options.designWidth ?? 750;
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const api = this.resolveApi();
        const systemInfo = this.readSystemInfo(api);

        this.chooseMediaSupported = this.platformOptions.supportsChooseMedia?.(systemInfo.SDKVersion) ?? true;
        this.safeArea = this.normalizeSafeArea(systemInfo);
        this.layoutInfo = this.normalizeLayoutInfo(systemInfo, api);
        this.deviceProfile = this.normalizeDeviceProfile(systemInfo);
        this.launchOptions = this.normalizeLaunchOptions(
            api.getLaunchOptionsSync?.() ?? {},
        );
        this.api = api;
        try {
            api.onShow(this.handleShow);
            api.onHide(this.handleHide);
            api.onAccelerometerChange?.(this.handleAccelerometerChange);
            if (api.onWindowResize && api.offWindowResize) api.onWindowResize(this.handleWindowResize);
            if (api.onDeviceOrientationChange && api.offDeviceOrientationChange) {
                api.onDeviceOrientationChange(this.handleWindowResize);
            }
            this.initialized = true;
        } catch (error: unknown) {
            this.dispose();
            throw error;
        }
    }

    dispose(): void {
        Array.from(this.orientationOperations).forEach(cancel => cancel());
        this.orientationOperations.clear();
        this.cancelLocalImagePicker();
        Array.from(this.pendingImageOperations).forEach((cancel) => cancel());
        this.pendingImageOperations.clear();
        this.stopAccelerometer();
        this.api?.offAccelerometerChange?.(this.handleAccelerometerChange);
        this.api?.offShow?.(this.handleShow);
        this.api?.offHide?.(this.handleHide);
        this.api?.offWindowResize?.(this.handleWindowResize);
        this.api?.offDeviceOrientationChange?.(this.handleWindowResize);
        this.events.clear();
        this.accelerometerListeners.clear();
        this.api = undefined;
        this.safeArea = undefined;
        this.layoutInfo = undefined;
        this.orientation = 'portrait';
        this.launchOptions = undefined;
        this.deviceProfile = undefined;
        this.chooseMediaSupported = true;
        this.imagePickerLifecycleInterrupted = false;
        this.initialized = false;
    }

    getSafeArea(): SafeArea {
        this.refreshLayoutInfo();
        if (!this.safeArea) {
            throw new Error('MiniGame platform is not initialized.');
        }

        return this.safeArea;
    }

    getLayoutInfo(): PlatformLayoutInfo {
        this.refreshLayoutInfo();
        if (!this.layoutInfo) {
            throw new Error('MiniGame platform is not initialized.');
        }

        return this.layoutInfo;
    }

    onLayoutChange(callback: (layout: PlatformLayoutInfo) => void): Unsubscribe {
        return this.events.subscribe('layout', callback);
    }

    setScreenOrientation(orientation: ScreenOrientation, designWidth: number): Promise<void> {
        const api = this.api;
        if (!api) return Promise.reject(new Error('MiniGame platform is not initialized.'));
        if (!Number.isFinite(designWidth) || designWidth <= 0) {
            return Promise.reject(new Error('Screen design width must be greater than zero.'));
        }
        const matches = (): boolean => {
            const info = this.readSystemInfo(api);
            const width = info.windowWidth ?? info.screenWidth;
            const height = info.windowHeight ?? info.screenHeight;
            return orientation === 'landscape' ? width > height : height >= width;
        };
        const commit = (): void => {
            this.designWidth = designWidth;
            this.orientation = orientation;
            this.refreshLayoutInfo(true);
        };
        try {
            // 实际方向已正确时不请求原生旋转；旧客户端与 PC 全屏也能正常启动竖屏大厅。
            if (matches()) {
                commit();
                return Promise.resolve();
            }
        } catch (error: unknown) { return Promise.reject(error); }
        if (!api.setDeviceOrientation) {
            return Promise.reject(new Error(`Screen orientation "${orientation}" is unsupported on ${this.id}.`));
        }

        return new Promise<void>((resolve, reject) => {
            let settled = false;
            let succeeded = false;
            let poll: ReturnType<typeof setTimeout> | undefined;
            let unsubscribe: Unsubscribe | undefined;
            const finish = (error?: unknown): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (poll !== undefined) clearTimeout(poll);
                unsubscribe?.();
                this.orientationOperations.delete(cancel);
                if (error) {
                    reject(error);
                    return;
                }
                try { commit(); resolve(); }
                catch (cause: unknown) { reject(cause); }
            };
            const cancel = (): void => finish(new Error('Screen orientation change cancelled.'));
            const timeout = setTimeout(() => finish(new Error(`Screen orientation "${orientation}" timed out.`)),
                this.platformOptions.orientationTimeoutMs ?? 8000);
            const check = (): void => {
                if (settled || !succeeded) return;
                try { if (matches()) finish(); }
                catch (error: unknown) { finish(error); }
            };
            const tick = (): void => {
                check();
                // 部分客户端的 success 早于窗口更新；读取实际尺寸也兼容遗漏的 resize 事件。
                if (!settled) poll = setTimeout(tick, 50);
            };
            this.orientationOperations.add(cancel);
            unsubscribe = this.onLayoutChange(check);
            poll = setTimeout(tick, 50);
            try {
                api.setDeviceOrientation!({ value: orientation,
                    success: () => { succeeded = true; check(); },
                    fail: error => finish(new Error(error?.errMsg ?? 'Screen orientation change failed.')),
                });
            } catch (error: unknown) { finish(error); }
        });
    }

    getDeviceProfile(): DeviceProfile {
        if (!this.deviceProfile) {
            throw new Error('MiniGame platform is not initialized.');
        }

        return this.deviceProfile;
    }

    getLaunchOptions(): LaunchOptions {
        if (!this.launchOptions) {
            throw new Error('MiniGame platform is not initialized.');
        }

        return this.launchOptions;
    }

    async pickLocalImage(): Promise<LocalImageSelection | null> {
        const api = this.api;
        if (!api || typeof api.chooseMedia !== 'function') {
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
        const normalize = (file: MiniGameMediaFile | undefined): LocalImageSelection | null => {
            const uri = file?.tempFilePath;
            if (!uri || !isCurrent()) {
                return null;
            }

            return Object.freeze({
                uri,
                // chooseMedia 返回的 fileType 常见值是 image，而不是 image/jpeg。
                mimeType: file?.fileType === 'image' ? undefined : file?.fileType,
                sizeBytes: file?.size,
                // 小游戏临时文件由平台生命周期管理，业务层只需在会话结束时丢弃引用。
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

            // SDK 版本由具体平台判断，不能用小游戏版本号限制 Tap 媒体能力。
            if (!this.chooseMediaSupported) {
                finish(null);
                return;
            }

            try {
                api.chooseMedia({
                    count: 1,
                    mediaType: ['image'],
                    sourceType: ['album'],
                    success: (result) => finish(normalize(result.tempFiles?.[0])),
                    fail: (error) => {
                        const errMsg = error?.errMsg;
                        if (!errMsg?.toLowerCase().includes('cancel')) {
                            // TODO: console.warn('[MiniGamePlatform] chooseMedia failed.', errMsg);
                        }

                        finish(null);
                    },
                });
            } catch (_error: unknown) {
                finish(null);
            }
        });
    }

    async cropLocalImage(request: LocalImageCropRequest): Promise<LocalImageSelection | null> {
        const api = this.api;
        if (typeof api?.createCanvas !== 'function') {
            // TODO: console.warn('[MiniGamePlatform] Local image crop requires createCanvas.');
            return null;
        }

        const outputSize = Math.max(1, Math.floor(request.outputSize));
        try {
            // 小游戏通过 createCanvas 创建画布。Cocos 启动时已创建上屏
            // 画布，此时新建的是独立离屏画布，不依赖 createOffscreenCanvas。
            const canvas = api.createCanvas();
            canvas.width = outputSize;
            canvas.height = outputSize;
            const context = canvas.getContext('2d');
            const image = canvas.createImage?.() ?? api.createImage?.();
            const fs = api.getFileSystemManager?.();
            const userDataRoot = api.env?.USER_DATA_PATH;
            // 离屏画布可能只提供 toDataURL；完整计入可写入本地文件的导出路径。
            const canWriteDataUrl = typeof canvas.toDataURL === 'function' && !!fs && !!userDataRoot;
            if (!context
                || !image
                || (!canvas.toTempFilePath && !canvas.toTempFilePathSync && !canWriteDataUrl)) {
                // TODO: console.warn('[MiniGamePlatform] Local image crop capabilities unavailable.', {
                //     context: !!context, image: !!image, canWriteDataUrl,
                //     asyncExport: !!canvas.toTempFilePath, syncExport: !!canvas.toTempFilePathSync,
                // });
                return null;
            }

            const loaded = await this.runImageOperation<boolean>((finish) => {
                image.onload = () => finish(true);
                image.onerror = () => finish(false);
                image.src = request.uri;
            }, false, () => {
                image.onload = null;
                image.onerror = null;
            });
            if (!loaded || this.api !== api) {
                // TODO: console.warn('[MiniGamePlatform] Local image crop source failed to load or timed out.');
                return null;
            }

            context.clearRect(0, 0, outputSize, outputSize);
            context.drawImage(
                image,
                request.sourceX,
                request.sourceY,
                request.sourceSize,
                request.sourceSize,
                0,
                0,
                outputSize,
                outputSize,
            );
            const exportOptions = {
                x: 0,
                y: 0,
                width: outputSize,
                height: outputSize,
                destWidth: outputSize,
                destHeight: outputSize,
                fileType: 'jpg' as const,
                quality: request.quality,
            };
            if (canvas.toTempFilePathSync) {
                try {
                    const syncPath = canvas.toTempFilePathSync(exportOptions);
                    if (typeof syncPath === 'string' && syncPath) {
                        return Object.freeze({
                            uri: syncPath,
                            mimeType: 'image/jpeg',
                            release: (): void => {},
                        });
                    }
                } catch (error: unknown) {
                    // 部分基础库只实现异步版本；继续使用下面的回调接口。
                    // TODO: console.warn('[MiniGamePlatform] Synchronous canvas export failed.', error);
                }
            }
            let dataUrl: string | undefined;
            try {
                dataUrl = canvas.toDataURL?.('image/jpeg', request.quality);
            } catch (error: unknown) {
                // 部分客户端声明了 toDataURL 但不支持 2D 离屏画布导出；
                // 继续尝试异步临时文件接口。
                // TODO: console.warn('[MiniGamePlatform] Canvas data URL export failed.', error);
            }
            const dataSeparator = dataUrl?.indexOf(',') ?? -1;
            if (dataUrl
                && dataSeparator >= 0
                && fs
                && userDataRoot) {
                const filePath = `${userDataRoot}/sliding-puzzle-crop-${Date.now()}.jpg`;
                const written = await this.runImageOperation<boolean>((finish) => fs.writeFile({
                    filePath,
                    data: dataUrl.slice(dataSeparator + 1),
                    encoding: 'base64',
                    success: () => finish(true),
                    fail: () => finish(false),
                }), false);
                if (this.api !== api) return null;
                if (written) {
                    let released = false;
                    return Object.freeze({
                        uri: filePath,
                        mimeType: 'image/jpeg',
                        release: (): void => {
                            if (released) return;
                            released = true;
                            fs.unlink({ filePath, success: () => {}, fail: () => {} });
                        },
                    });
                }
            }
            if (!canvas.toTempFilePath) {
                // TODO: console.warn('[MiniGamePlatform] No remaining canvas export method succeeded.');
                return null;
            }
            const uri = await this.runImageOperation<string | null>((finish) => {
                const immediatePath = canvas.toTempFilePath?.({
                    ...exportOptions,
                    success: (result) => finish(result.tempFilePath ?? null),
                    fail: (error) => {
                        // TODO: console.warn('[MiniGamePlatform] Canvas export failed.', error?.errMsg);
                        finish(null);
                    },
                });
                if (typeof immediatePath === 'string' && immediatePath) {
                    finish(immediatePath);
                }
            }, null);
            if (!uri || this.api !== api) {
                return null;
            }
            return Object.freeze({
                uri,
                mimeType: 'image/jpeg',
                // 小游戏临时文件随平台生命周期回收，当前接口不主动删除。
                release: (): void => {},
            });
        } catch (error: unknown) {
            // TODO: console.warn('[MiniGamePlatform] Failed to crop local image.', error);
            return null;
        }
    }

    async persistLocalImage(uri: string, id: string): Promise<string | null> {
        const api = this.api;
        const fs = api?.getFileSystemManager?.();
        const root = api?.env?.USER_DATA_PATH;
        if (!fs || !root) return null;
        const directory = `${root}/sliding-puzzle-custom`;
        const destination = `${directory}/${id}.jpg`;
        const directoryReady = await this.runImageOperation<boolean>((finish) => fs.mkdir({
            dirPath: directory,
            recursive: true,
            success: () => finish(true),
            // 目录已存在和创建失败都交给 copyFile 给出最终结果。
            fail: () => finish(true),
        }), false);
        if (!directoryReady || this.api !== api) return null;
        return this.runImageOperation<string | null>((finish) => fs.copyFile({
            srcPath: uri,
            destPath: destination,
            success: () => finish(destination),
            fail: () => finish(null),
        }), null);
    }

    async openPersistedLocalImage(uri: string): Promise<LocalImageSelection | null> {
        const fs = this.api?.getFileSystemManager?.();
        if (!fs) return null;
        const exists = await this.runImageOperation<boolean>((finish) => fs.access({
            path: uri,
            success: () => finish(true),
            fail: () => finish(false),
        }), false);
        return exists ? Object.freeze({ uri, mimeType: 'image/jpeg', release: (): void => {} }) : null;
    }

    async deletePersistedLocalImage(uri: string): Promise<void> {
        const fs = this.api?.getFileSystemManager?.();
        if (!fs) return;
        await this.runImageOperation<void>((finish) => fs.unlink({
            filePath: uri,
            success: () => finish(),
            fail: () => finish(),
        }), undefined);
    }

    /** 平台销毁或原生回调丢失时，结束请求并清理计时器及图片事件。 */
    private runImageOperation<T>(
        start: (finish: (value: T) => void) => void,
        fallback: T,
        cleanup?: () => void,
    ): Promise<T> {
        const api = this.api;
        if (!this.initialized || !api) return Promise.resolve(fallback);
        return new Promise<T>((resolve) => {
            let settled = false;
            const timer = setTimeout(() => finish(fallback), 8000);
            const cancel = (): void => finish(fallback);
            const finish = (value: T): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.pendingImageOperations.delete(cancel);
                cleanup?.();
                resolve(this.initialized && this.api === api ? value : fallback);
            };
            this.pendingImageOperations.add(cancel);
            try {
                start(finish);
            } catch (_error: unknown) {
                finish(fallback);
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

    supportsAccelerometer(): boolean {
        return typeof this.api?.startAccelerometer === 'function'
            && typeof this.api?.onAccelerometerChange === 'function';
    }

    startAccelerometer(): void {
        if (!this.supportsAccelerometer() || this.accelerometerStarted) return;
        try {
            this.api?.startAccelerometer?.({ interval: 'game' });
            this.accelerometerStarted = true;
        } catch (error: unknown) {
            // TODO: console.warn('[MiniGamePlatform] Failed to start accelerometer.', error);
        }
    }

    stopAccelerometer(): void {
        if (!this.accelerometerStarted) return;
        try {
            this.api?.stopAccelerometer?.();
        } catch (error: unknown) {
            // TODO: console.warn('[MiniGamePlatform] Failed to stop accelerometer.', error);
        } finally {
            this.accelerometerStarted = false;
        }
    }

    onAccelerometerChange(callback: (sample: AccelerometerSample) => void): Unsubscribe {
        this.accelerometerListeners.add(callback);
        return () => this.accelerometerListeners.delete(callback);
    }

    showToast(message: string): void {
        this.api?.showToast?.({ title: message, icon: 'none', duration: 2000 });
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
        this.refreshLayoutInfo(true);
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

    private readonly handleAccelerometerChange = (sample: MiniGameAccelerometerChangeResult): void => {
        if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
            return;
        }
        const normalized: AccelerometerSample = Object.freeze({
            x: sample.x,
            y: sample.y,
            z: sample.z,
        });
        this.accelerometerListeners.forEach((listener) => listener(normalized));
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

    private resolveApi(): MiniGameApi {
        if (this.providedApi) {
            return this.providedApi;
        }

        return this.platformOptions.getApi();
    }

    private readSystemInfo(api: MiniGameApi): MiniGameSystemInfo {
        return { ...api.getSystemInfoSync(), ...(api.getWindowInfo?.() ?? {}) };
    }

    private refreshLayoutInfo(notify = false): void {
        if (!this.api) return;
        const info = this.readSystemInfo(this.api);
        this.safeArea = this.normalizeSafeArea(info);
        this.layoutInfo = this.normalizeLayoutInfo(info, this.api);
        if (notify) this.events.publish('layout', this.layoutInfo);
    }

    private readonly handleWindowResize = (): void => {
        this.refreshLayoutInfo(true);
    };

    private normalizeSafeArea(systemInfo: MiniGameSystemInfo): SafeArea {
        const width = systemInfo.windowWidth ?? systemInfo.screenWidth;
        const height = systemInfo.windowHeight ?? systemInfo.screenHeight;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            throw new Error('MiniGame returned an invalid screen size.');
        }

        const scale = this.designWidth / width;
        const source = systemInfo.safeArea ?? {
            left: 0,
            top: 0,
            right: width,
            bottom: height,
            width,
            height,
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

    private normalizeLayoutInfo(
        systemInfo: MiniGameSystemInfo,
        api: MiniGameApi,
    ): PlatformLayoutInfo {
        let topRightReservedArea: PlatformUiRect | undefined;

        try {
            const menuButton = api.getMenuButtonBoundingClientRect?.();
            if (menuButton && menuButton.width > 0 && menuButton.height > 0) {
                const scale = this.designWidth / (systemInfo.windowWidth ?? systemInfo.screenWidth);
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
            // TODO: console.warn('[MiniGamePlatform] Failed to read menu button bounds.', error);
        }

        return Object.freeze({
            designWidth: this.designWidth,
            orientation: this.orientation,
            safeArea: this.safeArea!,
            topRightReservedArea,
        });
    }

    private normalizeLaunchOptions(options: MiniGameLaunchOptions): LaunchOptions {
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

    private normalizeDeviceProfile(systemInfo: MiniGameSystemInfo): DeviceProfile {
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
