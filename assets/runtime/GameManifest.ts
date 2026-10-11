import type { DevicePerformanceTier } from '../core/types/CommonTypes';

export const LOBBY_PROMOTION_TAGS = ['hot', 'new'] as const;
export type LobbyPromotionTag = (typeof LOBBY_PROMOTION_TAGS)[number];

export const TROPHY_STYLES = ['watermelon', 'rook', 'neon', 'puzzle', 'tidy', 'rocket', 'bubble', 'cat'] as const;
export type TrophyStyle = (typeof TROPHY_STYLES)[number];

/** 成就的展示与判定配置，不引用游戏实现或游戏 Bundle 资源。 */
export interface AchievementDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly metric: string;
    readonly target: number;
    readonly unit: string;
    readonly trophy: TrophyStyle;
    readonly color: string;
}

/**
 * 大厅展示和运行层加载小游戏时共同使用的唯一清单结构。
 * 清单只描述游戏，不包含任何具体游戏实现或运行状态。
 */
export interface GameManifest {
    readonly achievement?: AchievementDefinition;
    /** 项目内永久唯一且发布后不可随意修改的游戏标识。 */
    readonly id: string;

    /** 当前小游戏内容版本，采用语义化版本格式。 */
    readonly version: string;

    readonly name: string;
    readonly description: string;

    /** Cocos Creator Asset Bundle 名称。 */
    readonly bundle: string;

    /** 小游戏独立的远程资源 Asset Bundle；画面按目录准备，音频按用户设置加载。 */
    readonly resourceBundle: string;

    /** 启动画面资源目录，默认 visual；其中的 AudioClip 始终由音频加载流程单独准备。 */
    readonly resourceDirectories?: readonly string[];

    /** Optional initialization budget for games loading save-dependent assets. */
    readonly initializeTimeoutMs?: number;

    /** Bundle 内的入口场景路径。 */
    readonly scene: string;

    /** 入口场景中实现 MiniGame 协议的组件类名。 */
    readonly entryComponent: string;

    /** 大厅卡片使用的封面资源路径，位于 lobby-covers 远程资源包中。 */
    readonly cover: string;

    /**
     * lobby-covers 包内游戏加载页使用的资源路径；省略时沿用大厅封面，显式为 null 时不展示封面。
     */
    readonly loadingCover?: string | null;

    readonly orientation: 'portrait' | 'landscape';
    readonly renderMode: '2d' | '3d';
    readonly minimumDeviceTier: DevicePerformanceTier;
    readonly minAppVersion: string;
    readonly enabled: boolean;
    readonly visibility: 'public' | 'development';

    /** 代码 Bundle 中额外需要预加载的资源路径；游戏画面由 resourceBundle 按 resourceDirectories 加载。 */
    readonly preload: readonly string[];

    /** 用于大厅筛选和内容分组，不参与运行逻辑。 */
    readonly tags: readonly string[];

    /** 大厅推广标签可同时配置 NEW、HOT；优先显示 NEW，成功打开当前内容版本后回退到 HOT。 */
    readonly lobbyTags?: readonly LobbyPromotionTag[];
}
