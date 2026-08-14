import type {
    DeviceProfile,
    LaunchOptions,
    PlatformLayoutInfo,
    SafeArea,
    Unsubscribe,
} from '../core/types/CommonTypes';

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
    supportsVibration(): boolean;
    vibrate(type: 'light' | 'medium' | 'heavy'): void;
    showShareMenu(): void;
    onShow(callback: () => void): Unsubscribe;
    onHide(callback: () => void): Unsubscribe;
}
