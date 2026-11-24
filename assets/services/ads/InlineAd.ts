import type { Unsubscribe } from '../../core/types/CommonTypes';
import type { AdRequest } from './AdService';

export const LOBBY_LIST_CUSTOM_AD = 'lobby-game-list';

/** 以窗口宽度为 1；跟随 Fit Width，独立于设备像素密度。 */
export interface InlineAdSize {
    readonly width: number;
    readonly height: number;
}

/** 原生广告的显示与占位契约，不将平台对象暴露给大厅。 */
export interface InlineAd {
    readonly ready: boolean;
    readonly size: InlineAdSize;
    /** 目标宽度，以窗口宽度为 1；实际尺寸仍以平台回报为准。 */
    setWidth(width: number): void;
    setPosition(left: number, top: number): void;
    setVisible(visible: boolean): void;
    subscribe(listener: () => void): Unsubscribe;
    dispose(): void;
}

/** 前后台和应用状态的最终显示权限仅由公共广告服务控制。 */
export interface ManagedInlineAd extends InlineAd {
    setAllowed(allowed: boolean): void;
}

export interface InlineAdProvider {
    create(request: AdRequest, width?: number): ManagedInlineAd | undefined;
}
