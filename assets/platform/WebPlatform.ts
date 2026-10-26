import { EventBus } from '../core/events/EventBus';
import type {
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
import type { AccelerometerSample, Platform, PlatformJsonRequest } from './Platform';
import type { PlatformAudioContext } from './PlatformAudio';

interface WebPlatformEvents {
    readonly show: void;
    readonly hide: void;
    readonly layout: PlatformLayoutInfo;
}

export interface WebPlatformOptions {
    readonly safeArea?: SafeArea;
    /** 普通预览使用当前设计画布尺寸；显式注入 safeArea 时优先保留测试安全区。 */
    readonly getViewportSize?: () => { readonly width: number; readonly height: number };
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
    private readonly networkControllers = new Set<AbortController>();

    async requestJson(request: PlatformJsonRequest): Promise<unknown> {
        const controller = new AbortController(); this.networkControllers.add(controller);
        const timer = setTimeout(() => controller.abort(), request.timeoutMs);
        try {
            const response = await fetch(request.url, { method: request.method,
                headers: { ...(request.data === undefined ? {} : { 'content-type': 'application/json' }), ...request.headers },
                ...(request.data === undefined ? {} : { body: JSON.stringify(request.data) }), signal: controller.signal });
            if (!response.ok) throw Object.assign(new Error('Cloud HTTP ' + response.status), { statusCode: response.status });
            return await response.json();
        } finally { clearTimeout(timer); this.networkControllers.delete(controller); }
    }

    createAudioContext(): PlatformAudioContext | undefined {
        if (typeof window === 'undefined') return undefined;
        const ctor = window.AudioContext
            ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        return ctor ? new ctor() as unknown as PlatformAudioContext : undefined;
    }

    private readonly events = new EventBus<WebPlatformEvents>();
    private readonly safeArea: SafeArea;
    private readonly getViewportSize?: WebPlatformOptions['getViewportSize'];
    private readonly layoutInfo: PlatformLayoutInfo;
    private readonly launchOptions: LaunchOptions;
    private readonly deviceProfile: DeviceProfile;
    private initialized = false;
    private orientation: ScreenOrientation = 'portrait';
    private visible = true;
    private toastElement?: HTMLDivElement;
    private toastTimer?: ReturnType<typeof setTimeout>;
    private orientationFrame?: {
        readonly node: HTMLElement;
        readonly position: string;
        readonly left: string;
        readonly top: string;
    };
    private activeImagePicker?: {
        readonly cancel: () => void;
    };

    constructor(options: WebPlatformOptions = {}) {
        this.getViewportSize = options.safeArea ? undefined : options.getViewportSize;
        this.safeArea = Object.freeze({
            ...(options.safeArea ?? DEFAULT_SAFE_AREA),
        });
        this.layoutInfo = Object.freeze({
            orientation: 'portrait',
            designWidth: DEFAULT_SAFE_AREA.width,
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
        this.networkControllers.forEach(controller => controller.abort()); this.networkControllers.clear();
        this.restoreOrientationFrame();
        this.cancelLocalImagePicker();
        this.clearToast();

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
        const size = this.getViewportSize?.();
        if (size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0) {
            return Object.freeze({ left: 0, top: 0, right: size.width, bottom: size.height, width: size.width, height: size.height });
        }
        return this.safeArea;
    }

    getLayoutInfo(): PlatformLayoutInfo {
        const safeArea = this.getSafeArea();
        return safeArea === this.safeArea && this.orientation === 'portrait' ? this.layoutInfo
            : Object.freeze({ ...this.layoutInfo, orientation: this.orientation,
                designWidth: safeArea === this.safeArea ? this.layoutInfo.designWidth : safeArea.right, safeArea });
    }

    async setScreenOrientation(orientation: ScreenOrientation, _designWidth: number): Promise<void> {
        this.orientation = orientation;
        // Cocos 使用视口左上角作为旋转原点；预览模板的 flex 居中会叠加偏移。
        // 横屏时让引擎游戏容器直接定位到视口，尺寸与旋转仍由 Cocos API 管理。
        const frame = typeof document === 'undefined' ? null : document.getElementById('GameDiv');
        if (orientation === 'landscape' && frame) {
            if (this.orientationFrame?.node !== frame) {
                this.restoreOrientationFrame();
                this.orientationFrame = { node: frame, position: frame.style.position,
                    left: frame.style.left, top: frame.style.top };
            }
            frame.style.position = 'fixed';
            frame.style.left = frame.style.top = '0px';
        } else this.restoreOrientationFrame();
    }

    private restoreOrientationFrame(): void {
        const frame = this.orientationFrame;
        if (!frame) return;
        frame.node.style.position = frame.position;
        frame.node.style.left = frame.left;
        frame.node.style.top = frame.top;
        this.orientationFrame = undefined;
    }

    onLayoutChange(callback: (layout: PlatformLayoutInfo) => void): Unsubscribe {
        return this.events.subscribe('layout', callback);
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

    async cropLocalImage(request: LocalImageCropRequest): Promise<LocalImageSelection | null> {
        if (typeof document === 'undefined' || typeof Image === 'undefined') {
            return null;
        }

        const outputSize = Math.max(1, Math.floor(request.outputSize));
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }

        const image = new Image();
        const loaded = await new Promise<boolean>((resolve) => {
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = request.uri;
        });
        if (!loaded) {
            return null;
        }

        try {
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
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', request.quality);
            });
            if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
                return null;
            }

            const uri = URL.createObjectURL(blob);
            let released = false;
            return Object.freeze({
                uri,
                mimeType: 'image/jpeg',
                sizeBytes: blob.size,
                release: (): void => {
                    if (released) return;
                    released = true;
                    URL.revokeObjectURL(uri);
                },
            });
        } catch (error: unknown) {
            // TODO: console.warn('[WebPlatform] Failed to crop local image.', error);
            return null;
        }
    }

    async persistLocalImage(uri: string, id: string): Promise<string | null> {
        if (typeof localStorage === 'undefined') return null;
        try {
            const blob = await fetch(uri).then((response) => response.blob());
            const dataUrl = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
            if (!dataUrl) return null;
            const key = `sliding-puzzle.local-image.${id}`;
            localStorage.setItem(key, dataUrl);
            return key;
        } catch (error: unknown) {
            // TODO: console.warn('[WebPlatform] Failed to persist local image.', error);
            return null;
        }
    }

    async openPersistedLocalImage(uri: string): Promise<LocalImageSelection | null> {
        if (typeof localStorage === 'undefined') return null;
        const dataUrl = localStorage.getItem(uri);
        return dataUrl ? Object.freeze({ uri: dataUrl, mimeType: 'image/jpeg', release: (): void => {} }) : null;
    }

    async deletePersistedLocalImage(uri: string): Promise<void> {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(uri);
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

    showToast(message: string): void {
        if (typeof document === 'undefined') return;
        const host = document.body ?? document.documentElement;
        if (!host) return;

        this.clearToast();
        const toast = document.createElement('div');
        toast.dataset.platformToast = '';
        toast.textContent = message;
        toast.setAttribute('role', 'status');
        Object.assign(toast.style, {
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '2147483647',
            maxWidth: 'calc(100vw - 48px)',
            boxSizing: 'border-box',
            padding: '12px 20px',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.78)',
            color: '#ffffff',
            font: '16px/1.5 sans-serif',
            textAlign: 'center',
            pointerEvents: 'none',
        });
        host.appendChild(toast);
        this.toastElement = toast;
        this.toastTimer = setTimeout(() => this.clearToast(), 2000);
    }

    private clearToast(): void {
        if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
        this.toastTimer = undefined;
        this.toastElement?.remove();
        this.toastElement = undefined;
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
