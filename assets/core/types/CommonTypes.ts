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
