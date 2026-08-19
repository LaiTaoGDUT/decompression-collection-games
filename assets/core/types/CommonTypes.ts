/** 取消订阅、事件监听或平台回调。重复调用应保持安全。 */
export type Unsubscribe = () => void;

/**
 * 以设计分辨率为坐标系的安全显示区域。
 * `right - left` 应等于 `width`，`bottom - top` 应等于 `height`。
 */
export interface SafeArea {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

/** 平台原生 UI 在设计坐标系中占据的矩形，原点位于屏幕左上角。 */
export interface PlatformUiRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

/**
 * 游戏界面必须遵守的平台布局边界。
 * `topRightReservedArea` 在微信环境中对应右上角胶囊，后续平台也可复用该约束。
 */
export interface PlatformLayoutInfo {
    readonly safeArea: SafeArea;
    readonly topRightReservedArea?: PlatformUiRect;
}

/** 平台启动时传入应用的标准化参数。 */
export interface LaunchOptions {
    readonly scene?: number;
    readonly path?: string;
    readonly query: Readonly<Record<string, string>>;
    readonly shareTicket?: string;
    readonly referrerInfo?: Readonly<{
        appId: string;
        extraData?: unknown;
    }>;
}

export type DevicePerformanceTier = 'low' | 'medium' | 'high';

/** 平台提供给画质策略和游戏兼容性判断的标准化设备信息。 */
export interface DeviceProfile {
    readonly tier: DevicePerformanceTier;
    readonly pixelRatio: number;
    readonly memoryMB?: number;
    readonly benchmarkLevel?: number;
}

/**
 * 平台返回给小游戏的本地图片选择结果。
 * `uri` 只在当前游戏会话内有效，释放时必须调用 `release`。
 */
export interface LocalImageSelection {
    readonly uri: string;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
    readonly release: () => void;
}

/** 一局小游戏结束后交给运行层的标准结果。 */
export interface GameResult {
    readonly score: number;
    readonly duration: number;
    readonly completed: boolean;
    readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * 注入小游戏的只读服务集合。
 * 具体服务键由后续服务契约组合，基础类型层不反向依赖服务实现。
 */
export type GameServices<TServices extends object = object> = Readonly<TServices>;
