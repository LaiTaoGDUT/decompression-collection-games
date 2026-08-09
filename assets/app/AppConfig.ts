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
    readonly debugLogs: boolean;
    readonly mockAds: boolean;
    readonly showDevelopmentGames: boolean;
}

export interface AppConfig {
    readonly schemaVersion: number;
    readonly appVersion: string;
    readonly defaultLanguage: string;
    readonly designResolution: DesignResolutionConfig;
    readonly renderLayers: RenderLayerConfig;
    readonly qualityProfiles: Readonly<Record<QualityLevel, QualityProfileConfig>>;
    readonly timeouts: TimeoutConfig;
    readonly development: DevelopmentConfig;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function normalizeValue<T>(fallback: T, value: unknown): T {
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
    schemaVersion: 1,
    appVersion: '0.1.0',
    defaultLanguage: 'zh-CN',
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
        bundleLoadMs: 15000,
        sceneLoadMs: 15000,
        gameInitializationMs: 10000,
    },
    development: {
        debugLogs: false,
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
