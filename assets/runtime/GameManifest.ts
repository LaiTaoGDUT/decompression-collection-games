import type { DevicePerformanceTier } from '../core/types/CommonTypes';

/**
 * 大厅展示和运行层加载小游戏时共同使用的唯一清单结构。
 * 清单只描述游戏，不包含任何具体游戏实现或运行状态。
 */
export interface GameManifest {
    /** 项目内永久唯一且发布后不可随意修改的游戏标识。 */
    readonly id: string;

    /** 当前小游戏内容版本，采用语义化版本格式。 */
    readonly version: string;

    readonly name: string;
    readonly description: string;

    /** Cocos Creator Asset Bundle 名称。 */
    readonly bundle: string;

    /** Bundle 内的入口场景路径。 */
    readonly scene: string;

    /** 入口场景中实现 MiniGame 协议的组件类名。 */
    readonly entryComponent: string;

    /** 大厅卡片使用的资源路径。 */
    readonly icon: string;
    readonly cover: string;

    /**
     * 游戏加载页使用的资源路径；省略时沿用大厅封面，显式为 null 时不展示封面。
     */
    readonly loadingCover?: string | null;

    readonly orientation: 'portrait' | 'landscape';
    readonly renderMode: '2d' | '3d';
    readonly minimumDeviceTier: DevicePerformanceTier;
    readonly minAppVersion: string;
    readonly enabled: boolean;
    readonly visibility: 'public' | 'development';

    /** 进入场景前必须完成加载的 Bundle 内资源路径。 */
    readonly preload: readonly string[];

    /** 用于大厅筛选和内容分组，不参与运行逻辑。 */
    readonly tags: readonly string[];
}
