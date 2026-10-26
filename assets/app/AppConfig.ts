import type { ShareMenuOptions } from '../platform/Platform';

export type DesignResolutionPolicy = 'fixed-width';
export type QualityLevel = 'low' | 'medium' | 'high';

export interface DesignResolutionConfig {
    readonly width: number;
    readonly height: number;
    readonly policy: DesignResolutionPolicy;
}

export interface RenderLayerConfig {
    readonly systemUi: string;
    readonly gameUi: string;
    readonly game3d: string;
}

export interface QualityProfileConfig {
    readonly renderScale: number;
    readonly realtimeShadows: boolean;
    readonly postProcessing: boolean;
    readonly particleScale: number;
    readonly maxActivePhysicsBodies: number;
}

export interface TimeoutConfig {
    readonly platformInitializationMs: number;
    readonly bundleLoadMs: number;
    readonly sceneLoadMs: number;
    readonly gameInitializationMs: number;
}

export interface DevelopmentConfig {
    readonly mockAds: boolean;
    readonly showDevelopmentGames: boolean;
}

export interface AdPlacementConfig {
    readonly adUnitId: string;
}

export interface GameAdFeatureConfig {
    readonly enabled: boolean;
}

export interface WeChatAdConfig {
    readonly watermelonReviveRewarded: AdPlacementConfig;
    readonly chessEndlessReviveRewarded: AdPlacementConfig;
    readonly desktopCleanupRewarded: AdPlacementConfig;
    readonly doodleJumpReviveRewarded: AdPlacementConfig;
    readonly bubbleShooterReviveRewarded: AdPlacementConfig;
    readonly flappyDunkReviveRewarded: AdPlacementConfig;
    readonly game2048ClearSmallTilesRewarded: AdPlacementConfig;
    readonly meowdokuToolRewarded: AdPlacementConfig;
    readonly multiColorFillHintRewarded: AdPlacementConfig;
    readonly cityBloxxReviveRewarded: AdPlacementConfig;
    readonly rotateRingsHintRewarded: AdPlacementConfig;
}

export interface AdsConfig {
    /** 以 GameManifest.id 为键；关闭时隐藏广告入口，开启时允许进入广告流程。 */
    readonly games: Readonly<Record<string, GameAdFeatureConfig>>;
    readonly wechat: WeChatAdConfig;
    /** Tap 平台只支持一个激励视频实例，合集共用同一个广告单元。 */
    readonly tap: { readonly rewardedVideo: AdPlacementConfig };
}

export interface FontConfig {
    /** 启动开关：false 时不请求字体分包、不绑定字体。修改后重启生效。 */
    readonly enabled: boolean;
    /** 构建及命令行缺字校验开关；缺省为开启，不影响运行时字体加载。 */
    readonly validateCoverage?: boolean;
    readonly loadTimeoutMs: number;
}

export interface AppConfig {
    readonly cloudSave: {
        readonly enabled: boolean;
        readonly baseUrl: string;
        readonly requestTimeoutMs: number;
    };
    readonly schemaVersion: number;
    readonly appVersion: string;
    readonly defaultLanguage: string;
    readonly sharing: ShareMenuOptions;
    readonly designResolution: DesignResolutionConfig;
    readonly renderLayers: RenderLayerConfig;
    readonly qualityProfiles: Readonly<Record<QualityLevel, QualityProfileConfig>>;
    readonly timeouts: TimeoutConfig;
    readonly fonts: FontConfig;
    readonly ads: AdsConfig;
    readonly development: DevelopmentConfig;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function normalizeValue<T>(fallback: T, value: unknown): T {
    // 文案及图片编号数组独立校验，不能按对象键合并成 { "0": ... }。
    if (Array.isArray(fallback)) {
        const source = Array.isArray(value) ? value : fallback;
        const strings = source
            .filter((item) => typeof item === 'string' && item.trim().length > 0)
            .map((item: string) => item.trim());
        return Object.freeze(Array.from(new Set(strings))) as T;
    }

    if (typeof fallback === 'object' && fallback !== null) {
        const source = typeof value === 'object' && value !== null
            ? value as UnknownRecord
            : {};
        const normalized: Record<string, unknown> = {};

        for (const key of Object.keys(fallback)) {
            const fallbackValue = (fallback as UnknownRecord)[key];
            normalized[key] = normalizeValue(fallbackValue, source[key]);
        }

        return Object.freeze(normalized) as T;
    }

    if (typeof fallback === 'number') {
        return typeof value === 'number' && Number.isFinite(value) && value > 0
            ? value as T
            : fallback;
    }

    if (typeof fallback === 'string') {
        return typeof value === 'string' && value.trim().length > 0
            ? value as T
            : fallback;
    }

    return typeof value === typeof fallback ? value as T : fallback;
}

const APP_CONFIG_DEFAULTS: AppConfig = {
    cloudSave: { enabled: false, baseUrl: '', requestTimeoutMs: 10000 },
    schemaVersion: 3,
    appVersion: '0.1.0',
    defaultLanguage: 'zh-CN',
    sharing: {
        enableTimeline: true,
        appMessage: {
            title: '发现一个摸鱼宝藏，进来挑一款试试？',
            titles: [],
            imageUrl: '',
            imageUrlId: '',
            imageUrlIds: [],
            query: 'source=share_app_message',
        },
        timeline: {
            title: '说好只玩一把，怎么又开一局了？',
            titles: [],
            imageUrl: '',
            imageUrlId: '',
            imageUrlIds: [],
            imagePreviewUrl: '',
            imagePreviewUrlId: '',
            query: 'source=share_timeline',
        },
    },
    designResolution: {
        width: 750,
        height: 1334,
        policy: 'fixed-width',
    },
    renderLayers: {
        systemUi: 'UI_2D',
        gameUi: 'UI_3D',
        game3d: 'DEFAULT',
    },
    qualityProfiles: {
        low: {
            renderScale: 0.75,
            realtimeShadows: false,
            postProcessing: false,
            particleScale: 0.5,
            maxActivePhysicsBodies: 32,
        },
        medium: {
            renderScale: 1,
            realtimeShadows: false,
            postProcessing: false,
            particleScale: 0.75,
            maxActivePhysicsBodies: 64,
        },
        high: {
            renderScale: 1,
            realtimeShadows: true,
            postProcessing: true,
            particleScale: 1,
            maxActivePhysicsBodies: 96,
        },
    },
    timeouts: {
        platformInitializationMs: 5000,
        bundleLoadMs: 60000,
        sceneLoadMs: 15000,
        gameInitializationMs: 75000,
    },
    fonts: {
        enabled: false,
        validateCoverage: true,
        loadTimeoutMs: 10000,
    },
    ads: {
        games: {
            watermelon: { enabled: true },
            'chess-endless': { enabled: true },
            game2048: { enabled: true },
            'sliding-puzzle': { enabled: false },
            catch: { enabled: true },
            'doodle-jump': { enabled: true },
            'bubble-shooter': { enabled: true },
            'flappy-dunk': { enabled: true },
            meowdoku: { enabled: true },
            'multi-color-fill': { enabled: true },
            'city-bloxx': { enabled: true },
            'rotate-rings': { enabled: true },
        },
        wechat: {
            watermelonReviveRewarded: {
                adUnitId: '',
            },
            chessEndlessReviveRewarded: {
                adUnitId: '',
            },
            desktopCleanupRewarded: {
                adUnitId: '',
            },
            doodleJumpReviveRewarded: {
                adUnitId: '',
            },
            bubbleShooterReviveRewarded: {
                adUnitId: '',
            },
            flappyDunkReviveRewarded: {
                adUnitId: '',
            },
            game2048ClearSmallTilesRewarded: {
                adUnitId: '',
            },
            meowdokuToolRewarded: {
                adUnitId: '',
            },
            multiColorFillHintRewarded: {
                adUnitId: '',
            },
            cityBloxxReviveRewarded: { adUnitId: '' },
            rotateRingsHintRewarded: { adUnitId: '' },
        },
        tap: { rewardedVideo: { adUnitId: '' } },
    },
    development: {
        mockAds: false,
        showDevelopmentGames: false,
    },
};

export const DEFAULT_APP_CONFIG = normalizeValue(
    APP_CONFIG_DEFAULTS,
    APP_CONFIG_DEFAULTS,
);

/** 将不可信的 JSON 转换为完整、只读且可安全使用的应用配置。 */
export function normalizeAppConfig(value: unknown): AppConfig {
    return normalizeValue(DEFAULT_APP_CONFIG, value);
}
