import {
    MiniGamePlatform,
    type MiniGameApi,
} from './MiniGamePlatform';
import type { ShareContent, ShareMenuOptions, TimelineShareContent } from './Platform';

type ShareHandler = () => ShareContent;
type TimelineShareHandler = () => TimelineShareContent;

export interface WeChatApi extends MiniGameApi {
    canIUse?(schema: string): boolean;
    onShareAppMessage?(callback: ShareHandler): void;
    offShareAppMessage?(callback: ShareHandler): void;
    onShareTimeline?(callback: TimelineShareHandler): void;
    offShareTimeline?(callback: TimelineShareHandler): void;
}

declare const wx: WeChatApi | undefined;

export interface WeChatPlatformOptions {
    readonly api?: WeChatApi;
    readonly designWidth?: number;
}

/** 微信专有 API 解析和版本约束；共享能力由小游戏平台基类实现。 */
export class WeChatPlatform extends MiniGamePlatform {
    private appMessageContent: ShareContent = Object.freeze({});
    private timelineContent: TimelineShareContent = Object.freeze({});
    private lastAppMessageTitle?: string;
    private lastTimelineTitle?: string;
    private lastAppMessageImageUrlId?: string;
    private lastTimelineImageUrlId?: string;
    private enableTimeline = true;
    private appMessageRegistered = false;
    private timelineRegistered = false;
    private shareMenuGeneration = 0;

    constructor(options: WeChatPlatformOptions = {}) {
        super({
            ...options,
            id: 'wechat',
            getApi: () => {
                if (typeof wx === 'undefined') {
                    throw new Error('WeChat API is unavailable in the current environment.');
                }
                return wx;
            },
            supportsChooseMedia: (version) => {
                // 微信旧版 chooseMedia 可能静默不回调，且不回退到停止维护的 chooseImage。
                if (!version) return true;
                const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));
                return major > 2 || (major === 2 && minor >= 23);
            },
        });
    }

    showShareMenu(options?: ShareMenuOptions): void {
        const api = this.api as WeChatApi | undefined;
        if (!api) return;
        const generation = ++this.shareMenuGeneration;

        if (options) {
            this.appMessageContent = this.normalizeShareContent(options.appMessage);
            this.timelineContent = this.normalizeShareContent(options.timeline ?? options.appMessage);
            this.lastAppMessageTitle = undefined;
            this.lastTimelineTitle = undefined;
            this.lastAppMessageImageUrlId = undefined;
            this.lastTimelineImageUrlId = undefined;
            this.enableTimeline = options.enableTimeline ?? true;
        }

        if (!this.appMessageRegistered && api.onShareAppMessage && api.offShareAppMessage) {
            // 先标记，以便原生注册部分成功后抛错时仍能移除本实例的监听。
            this.appMessageRegistered = true;
            try {
                api.onShareAppMessage(this.handleShareAppMessage);
            } catch (error: unknown) {
                this.removeShareAppMessage(api);
                console.warn('[WeChatPlatform] Failed to register friend sharing.', error);
            }
        }

        if (this.supportsTimeline(api)) {
            if (!this.timelineRegistered) {
                this.timelineRegistered = true;
                try {
                    api.onShareTimeline!(this.handleShareTimeline);
                } catch (error: unknown) {
                    this.removeShareTimeline(api);
                    console.warn('[WeChatPlatform] Failed to register timeline sharing.', error);
                }
            }
        } else {
            this.removeShareTimeline(api);
        }

        this.showNativeShareMenu(api, this.timelineRegistered, generation);
    }

    dispose(): void {
        ++this.shareMenuGeneration;
        const api = this.api as WeChatApi | undefined;
        if (api) {
            this.removeShareAppMessage(api);
            this.removeShareTimeline(api);
        }
        this.appMessageContent = Object.freeze({});
        this.timelineContent = Object.freeze({});
        this.lastAppMessageTitle = undefined;
        this.lastTimelineTitle = undefined;
        this.lastAppMessageImageUrlId = undefined;
        this.lastTimelineImageUrlId = undefined;
        this.enableTimeline = true;
        super.dispose();
    }

    private readonly handleShareAppMessage: ShareHandler = () => {
        const content = this.createSharePayload(
            this.appMessageContent, this.lastAppMessageTitle, this.lastAppMessageImageUrlId,
        );
        this.lastAppMessageTitle = content.title;
        this.lastAppMessageImageUrlId = content.imageUrlId;
        return content;
    };

    private readonly handleShareTimeline: TimelineShareHandler = () => {
        const content = this.createSharePayload(
            this.timelineContent, this.lastTimelineTitle, this.lastTimelineImageUrlId,
        );
        this.lastTimelineTitle = content.title;
        this.lastTimelineImageUrlId = content.imageUrlId;
        // 朋友圈发布预览与卡片使用同一张素材；显式配置的预览图优先。
        if (!content.imagePreviewUrl && !content.imagePreviewUrlId && !content.imageUrl && content.imageUrlId) {
            return { ...content, imagePreviewUrlId: content.imageUrlId };
        }
        return content;
    };

    private createSharePayload(
        content: TimelineShareContent, previousTitle?: string, previousImageUrlId?: string,
    ): TimelineShareContent {
        // 备选池仅供应用选择，不传给微信；每次真正触发分享时才抽取。
        const { titles, imageUrlIds, ...payload } = content;
        if (titles?.length) {
            payload.title = this.chooseRandom(titles, previousTitle);
        }
        if (!payload.imageUrl && imageUrlIds?.length) {
            payload.imageUrlId = this.chooseRandom(imageUrlIds, previousImageUrlId);
        }
        return payload;
    }

    private chooseRandom(values: readonly string[], previousValue?: string): string {
        const candidates = values.filter((value) => value !== previousValue);
        const choices = candidates.length ? candidates : values;
        return choices[Math.floor(Math.random() * choices.length)];
    }

    private normalizeShareContent(content: TimelineShareContent = {}): TimelineShareContent {
        const normalized: {
            title?: string;
            titles?: readonly string[];
            imageUrl?: string;
            imageUrlId?: string;
            imageUrlIds?: readonly string[];
            query?: string;
            imagePreviewUrl?: string;
            imagePreviewUrlId?: string;
        } = {};
        for (const field of ['title', 'imageUrl', 'imageUrlId', 'query', 'imagePreviewUrl', 'imagePreviewUrlId'] as const) {
            const value = content[field]?.trim();
            if (value) normalized[field] = value;
        }
        for (const field of ['titles', 'imageUrlIds'] as const) {
            const values = content[field];
            if (!Array.isArray(values)) continue;
            const strings = Array.from(new Set(values
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .map((value) => value.trim())));
            if (strings.length) normalized[field] = Object.freeze(strings);
        }
        return Object.freeze(normalized);
    }

    private supportsTimeline(api: WeChatApi): boolean {
        if (!this.enableTimeline || !api.onShareTimeline || !api.offShareTimeline) return false;
        try {
            return api.canIUse?.('onShareTimeline') ?? true;
        } catch (_error: unknown) {
            return false;
        }
    }

    private showNativeShareMenu(api: WeChatApi, withTimeline: boolean, generation: number): void {
        const fail = (error?: unknown): void => {
            // 已销毁的应用不能被迟到的原生失败回调重新开启分享菜单。
            if (this.api !== api || this.shareMenuGeneration !== generation) return;
            console.warn('[WeChatPlatform] Failed to show share menu.', error);
            if (withTimeline) {
                this.removeShareTimeline(api);
                this.showNativeShareMenu(api, false, generation);
            }
        };
        try {
            api.showShareMenu?.({
                withShareTicket: true,
                menus: withTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'],
                fail,
            });
        } catch (error: unknown) {
            fail(error);
        }
    }

    private removeShareAppMessage(api: WeChatApi): void {
        if (!this.appMessageRegistered) return;
        this.appMessageRegistered = false;
        try {
            api.offShareAppMessage?.(this.handleShareAppMessage);
        } catch (error: unknown) {
            console.warn('[WeChatPlatform] Failed to remove friend sharing.', error);
        }
    }

    private removeShareTimeline(api: WeChatApi): void {
        if (!this.timelineRegistered) return;
        this.timelineRegistered = false;
        try {
            api.offShareTimeline?.(this.handleShareTimeline);
        } catch (error: unknown) {
            console.warn('[WeChatPlatform] Failed to remove timeline sharing.', error);
        }
    }
}
