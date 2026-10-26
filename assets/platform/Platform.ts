import type {
    DeviceProfile,
    LaunchOptions,
    LocalImageCropRequest,
    LocalImageSelection,
    PlatformLayoutInfo,
    SafeArea,
    ScreenOrientation,
    Unsubscribe,
} from '../core/types/CommonTypes';
import type { PlatformAudioContext } from './PlatformAudio';

export interface AccelerometerSample {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface ShareContent {
    readonly title?: string;
    /** 非空时每次分享随机选择一句；没有可用文案时使用 title。 */
    readonly titles?: readonly string[];
    /** 自定义图片须为平台可访问的网络或代码包路径；微信优先使用地址而非编号。 */
    readonly imageUrl?: string;
    /** 微信后台审核通过的分享图片编号；地址和编号都留空时使用平台默认图片。 */
    readonly imageUrlId?: string;
    /** 未指定图片地址时，每次分享随机选择一个编号；没有可用编号时使用 imageUrlId。 */
    readonly imageUrlIds?: readonly string[];
    readonly query?: string;
}

export interface TimelineShareContent extends ShareContent {
    readonly imagePreviewUrl?: string;
    /** 微信朋友圈预览图编号；未指定预览图时沿用当次分享图片编号。 */
    readonly imagePreviewUrlId?: string;
}

export interface ShareMenuOptions {
    readonly enableTimeline?: boolean;
    readonly appMessage?: ShareContent;
    readonly timeline?: TimelineShareContent;
}

/** 更新提醒订阅状态；blocked 表示用户关闭总开关或平台禁用。 */
export type UpdateSubscriptionState =
    | 'accepted' | 'rejected' | 'blocked' | 'unknown' | 'unsupported' | 'failed';

export interface PlatformJsonRequest {
    readonly url: string;
    readonly method: 'GET' | 'POST';
    readonly data?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
}

/** 平台适配层取得的临时票据；账号身份与 AppID 由服务端验证，不能由客户端指定。 */
export interface CloudLoginCredential {
    readonly platform: string;
    readonly code: string;
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
    /** 等待原生方向与窗口尺寸就绪，并将安全区换算到当前 Fit Width 设计宽度。 */
    setScreenOrientation(orientation: ScreenOrientation, designWidth: number): Promise<void>;
    onLayoutChange(callback: (layout: PlatformLayoutInfo) => void): Unsubscribe;
    getLaunchOptions(): LaunchOptions;
    /** 公共音频服务拥有上下文和生命周期；业务代码不访问平台音频 SDK。 */
    createAudioContext?(): PlatformAudioContext | undefined;
    requestJson?(request: PlatformJsonRequest): Promise<unknown>;
    getCloudLoginCredential?(): Promise<CloudLoginCredential>;
    getUpdateSubscription?(): Promise<UpdateSubscriptionState>;
    /** 必须在真实 touchend 回调内同步调用；实现不得先异步查询授权状态。 */
    requestUpdateSubscription?(): Promise<UpdateSubscriptionState>;
    pickLocalImage(): Promise<LocalImageSelection | null>;
    /** 将本地图片裁成正方形并按请求尺寸输出 JPEG 临时文件。 */
    cropLocalImage(request: LocalImageCropRequest): Promise<LocalImageSelection | null>;
    persistLocalImage(uri: string, id: string): Promise<string | null>;
    openPersistedLocalImage(uri: string): Promise<LocalImageSelection | null>;
    deletePersistedLocalImage(uri: string): Promise<void>;
    /** 取消当前平台原生图片选择请求；没有请求时必须安全无副作用。 */
    cancelLocalImagePicker(): void;
    supportsVibration(): boolean;
    vibrate(type: 'light' | 'medium' | 'heavy'): void;
    supportsAccelerometer(): boolean;
    startAccelerometer(): void;
    stopAccelerometer(): void;
    onAccelerometerChange(callback: (sample: AccelerometerSample) => void): Unsubscribe;
    /** 在当前游戏之上显示不阻塞操作的全局文字提示。 */
    showToast(message: string): void;
    /** 开启系统分享入口；重复调用更新内容，不重复注册平台回调。 */
    showShareMenu(options?: ShareMenuOptions): void;
    /** 从用户点击事件打开原生客服会话；不支持的平台可不实现，失败由平台统一提示。 */
    openCustomerServiceConversation?(sessionFrom?: string): void;
    onShow(callback: () => void): Unsubscribe;
    onHide(callback: () => void): Unsubscribe;
}
