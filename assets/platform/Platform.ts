import type {
    DeviceProfile,
    LaunchOptions,
    LocalImageSelection,
    PlatformLayoutInfo,
    SafeArea,
    Unsubscribe,
} from '../core/types/CommonTypes';

export interface AccelerometerSample {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * 业务层允许使用的平台能力边界。
 * 具体平台 SDK 类型和全局变量不得越过该接口进入业务层。
 */
export interface Platform {
    /** 用于日志和统计公共字段的稳定平台标识。 */
    readonly id: string;

    initialize(): Promise<void>;
    dispose(): void;
    getDeviceProfile(): DeviceProfile;
    getSafeArea(): SafeArea;
    getLayoutInfo(): PlatformLayoutInfo;
    getLaunchOptions(): LaunchOptions;
    pickLocalImage(): Promise<LocalImageSelection | null>;
    /** 取消当前平台原生图片选择请求；没有请求时必须安全无副作用。 */
    cancelLocalImagePicker(): void;
    supportsVibration(): boolean;
    vibrate(type: 'light' | 'medium' | 'heavy'): void;
    supportsAccelerometer(): boolean;
    startAccelerometer(): void;
    stopAccelerometer(): void;
    onAccelerometerChange(callback: (sample: AccelerometerSample) => void): Unsubscribe;
    showShareMenu(): void;
    onShow(callback: () => void): Unsubscribe;
    onHide(callback: () => void): Unsubscribe;
}
