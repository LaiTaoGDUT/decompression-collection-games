import type {
    MiniGameApi,
    MiniGameChooseMediaOptions,
    MiniGameSystemInfo,
} from './MiniGamePlatform';

export interface TapApiError {
    readonly errMsg?: string;
    readonly errCode?: number;
    readonly errno?: number;
}

/** 只声明本项目使用的 Tap 能力；SDK 类型不进入小游戏业务层。 */
export interface TapMiniGameApi extends MiniGameApi {
    getWindowInfo?(): Partial<MiniGameSystemInfo>;
    login(options: {
        timeout?: number;
        success: (result: { readonly code?: string }) => void;
        fail: (error: TapApiError) => void;
    }): void;
    checkSession?(options: {
        success: () => void;
        fail: (error: TapApiError) => void;
    }): void;
    chooseImage?(options: {
        count: number;
        sourceType: readonly ['album'];
        success: (result: {
            readonly tempFilePaths?: readonly string[];
            readonly tempFiles?: readonly { readonly path?: string; readonly size?: number }[];
        }) => void;
        fail?: (error: TapApiError) => void;
    }): void;
    setShareboardHidden?(options: { readonly hidden: boolean }): void;
    createHomeScreenWidget?(options: {
        success: () => void;
        fail: (error: TapApiError) => void;
    }): void;
}

declare const tap: TapMiniGameApi | undefined;

export function getTapMiniGameApi(): TapMiniGameApi | undefined {
    return typeof tap === 'undefined' ? undefined : tap;
}

export function isTapMiniGameEnvironment(): boolean {
    const api = getTapMiniGameApi();
    return typeof api?.getSystemInfoSync === 'function'
        && typeof api?.login === 'function';
}

export function requireTapMiniGameApi(): TapMiniGameApi {
    const api = getTapMiniGameApi();
    if (!api) throw new Error('Tap mini-game API is unavailable.');
    return api;
}

/** 保留 SDK 方法的 this；Tap 的版本号与微信版本号分别判断。 */
export function adaptTapMiniGameApi(api: TapMiniGameApi): MiniGameApi {
    const bind = <K extends keyof MiniGameApi>(key: K): MiniGameApi[K] => {
        const value = api[key];
        return (typeof value === 'function' ? value.bind(api) : value) as MiniGameApi[K];
    };
    let chooseMedia = bind('chooseMedia');
    if (!chooseMedia && api.chooseImage) {
        chooseMedia = (options: MiniGameChooseMediaOptions): void => api.chooseImage!({
            count: options.count,
            sourceType: options.sourceType,
            success: (result) => options.success?.({
                tempFiles: result.tempFilePaths?.map((path, index) => ({
                    tempFilePath: path,
                    size: result.tempFiles?.[index]?.size,
                })) ?? result.tempFiles?.map((file) => ({
                    tempFilePath: file.path,
                    size: file.size,
                })),
            }),
            fail: options.fail,
        });
    }

    return {
        getSystemInfoSync: () => ({
            ...api.getSystemInfoSync(),
            // 新版 Tap 将安全区放在 getWindowInfo；保留旧版系统信息作为后备。
            ...(api.getWindowInfo?.() ?? {}),
        }),
        getMenuButtonBoundingClientRect: bind('getMenuButtonBoundingClientRect'),
        getLaunchOptionsSync: bind('getLaunchOptionsSync'),
        vibrateShort: bind('vibrateShort'),
        startAccelerometer: bind('startAccelerometer'),
        stopAccelerometer: bind('stopAccelerometer'),
        onAccelerometerChange: bind('onAccelerometerChange'),
        offAccelerometerChange: bind('offAccelerometerChange'),
        showToast: bind('showToast'),
        chooseMedia,
        createImage: bind('createImage'),
        createCanvas: bind('createCanvas'),
        createWebAudioContext: bind('createWebAudioContext'),
        env: api.env,
        getFileSystemManager: bind('getFileSystemManager'),
        onShow: bind('onShow'),
        onHide: bind('onHide'),
        offShow: bind('offShow'),
        offHide: bind('offHide'),
    };
}
