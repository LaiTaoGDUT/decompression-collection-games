import {
    MiniGamePlatform,
    type MiniGameApi,
} from './MiniGamePlatform';
import type { ShareContent, ShareMenuOptions, TimelineShareContent, UpdateSubscriptionState } from './Platform';

type ShareHandler = () => ShareContent;
type TimelineShareHandler = () => TimelineShareContent;
const UPDATE_MESSAGE_TYPE = 'SYS_MSG_TYPE_WHATS_NEW';

export interface WeChatApi extends MiniGameApi {
    cloud?: {
        init(options: { env: string; traceUser?: boolean }): void | Promise<void>;
        callFunction(options: { name: string; data: unknown; config: { env: string }; success(result: { result: unknown }): void;
            fail(error: unknown): void }): unknown;
    };
    canIUse?(schema: string): boolean;
    getSetting?(options: {
        withSubscriptions: true;
        success(result: { subscriptionsSetting?: { mainSwitch?: boolean; itemSettings?: Record<string, string> } }): void;
        fail(error: unknown): void;
    }): void;
    requestSubscribeSystemMessage?(options: {
        msgTypeList: string[];
        success(result: Record<string, string>): void;
        fail(error: { errCode?: number; errMsg?: string }): void;
    }): void;
    onShareAppMessage?(callback: ShareHandler): void;
    offShareAppMessage?(callback: ShareHandler): void;
    onShareTimeline?(callback: TimelineShareHandler): void;
    offShareTimeline?(callback: TimelineShareHandler): void;
    openCustomerServiceConversation?(options: {
        sessionFrom?: string;
        showMessageCard: boolean;
        fail(error?: { errMsg?: string }): void;
    }): void;
}

declare const wx: WeChatApi | undefined;

export interface WeChatPlatformOptions {
    readonly api?: WeChatApi;
    readonly designWidth?: number;
}

/** 微信专有 API 解析和版本约束；共享能力由小游戏平台基类实现。 */
export class WeChatPlatform extends MiniGamePlatform {
    private cloudEnvironment?: string;
    private readonly cloudOperations = new Set<() => void>();
    private readonly subscriptionOperations = new Set<() => void>();
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
    private customerServiceGeneration = 0;
    private lastCustomerServiceRequestAt = -Infinity;

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

    getUpdateSubscription(): Promise<UpdateSubscriptionState> {
        const api = this.api as WeChatApi | undefined;
        if (!this.supportsUpdateSubscription(api)) return Promise.resolve('unsupported');
        return this.runSubscriptionOperation(api!, 8000, (finish) => {
            api!.getSetting!({
                withSubscriptions: true,
                success: ({ subscriptionsSetting: setting }) => {
                    if (setting?.mainSwitch === false) finish('blocked');
                    else finish(this.normalizeSubscriptionState(setting?.itemSettings?.[UPDATE_MESSAGE_TYPE]));
                },
                fail: () => finish('failed'),
            });
        });
    }

    requestUpdateSubscription(): Promise<UpdateSubscriptionState> {
        const api = this.api as WeChatApi | undefined;
        if (!this.supportsUpdateSubscription(api)) return Promise.resolve('unsupported');
        // Promise executor 和 start 都同步执行，保留用户 touchend 的调用上下文。
        return this.runSubscriptionOperation(api!, 120000, (finish) => {
            api!.requestSubscribeSystemMessage!({
                msgTypeList: [UPDATE_MESSAGE_TYPE],
                success: (result) => {
                    const state = this.normalizeSubscriptionState(result[UPDATE_MESSAGE_TYPE]);
                    // success 只表示接口调用成功，缺少明确 accept 不能记录为已订阅。
                    finish(state === 'unknown' ? 'failed' : state);
                },
                fail: (error) => {
                    console.warn('[WeChatPlatform] Update subscription failed.', error);
                    finish(error?.errCode === 20004 || error?.errCode === 20005 ? 'blocked' : 'failed');
                },
            });
        });
    }

    private supportsUpdateSubscription(api?: WeChatApi): boolean {
        if (!api?.getSetting || !api.requestSubscribeSystemMessage) return false;
        try {
            // 系统订阅 API 早于“游戏更新”类型上线；检查类型所需基础库，避免旧版弹升级提示。
            const version = api.getSystemInfoSync().SDKVersion;
            if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false;
            const [major, minor, patch] = version.split('.').map(Number);
            return (major > 2 || (major === 2 && (minor > 32 || (minor === 32 && patch >= 1))))
                && (api.canIUse?.('requestSubscribeSystemMessage') ?? true);
        } catch { return false; }
    }

    private normalizeSubscriptionState(value?: string): UpdateSubscriptionState {
        if (value === 'accept') return 'accepted';
        if (value === 'reject') return 'rejected';
        if (value === 'ban') return 'blocked';
        return 'unknown';
    }

    /** 原生请求不阻塞游戏；丢失回调或应用销毁时结束 Promise 并清除计时器。 */
    private runSubscriptionOperation(
        api: WeChatApi,
        timeoutMs: number,
        start: (finish: (state: UpdateSubscriptionState) => void) => void,
    ): Promise<UpdateSubscriptionState> {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (state: UpdateSubscriptionState): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.subscriptionOperations.delete(cancel);
                resolve(this.api === api ? state : 'failed');
            };
            const cancel = (): void => finish('failed');
            const timer = setTimeout(cancel, timeoutMs);
            this.subscriptionOperations.add(cancel);
            try { start(finish); }
            catch (error: unknown) {
                console.warn('[WeChatPlatform] Update subscription unavailable.', error);
                finish('failed');
            }
        });
    }

    openCustomerServiceConversation(sessionFrom?: string): void {
        const api = this.api as WeChatApi | undefined;
        if (!api) return;
        if (!api.openCustomerServiceConversation) {
            this.showToast('更新一下微信，再来找我聊聊吧～');
            return;
        }
        // 原生页面打开前拦住快速连点；不依赖返回回调解锁，取消后仍可再次进入。
        const now = Date.now();
        if (now - this.lastCustomerServiceRequestAt < 1000) return;
        this.lastCustomerServiceRequestAt = now;
        const generation = ++this.customerServiceGeneration;
        let failed = false;
        const fail = (error?: unknown): void => {
            if (failed || this.api !== api || generation !== this.customerServiceGeneration) return;
            failed = true;
            const message = typeof error === 'object' && error !== null && 'errMsg' in error
                ? String(error.errMsg) : String(error ?? '');
            if (/cancel/i.test(message)) return;
            console.warn('[WeChatPlatform] Failed to open customer service.', error);
            this.showToast('没能打开客服，稍后再来聊聊吧～');
        };
        try {
            // 前后台事件继续交给 App 状态机处理音频和暂停恢复。
            api.openCustomerServiceConversation({ sessionFrom, showMessageCard: false, fail });
        } catch (error: unknown) {
            fail(error);
        }
    }

    async initializeCloud(environmentId: string): Promise<void> {
        const api = this.api as WeChatApi | undefined;
        if (!api?.cloud || !environmentId.trim()) throw new Error('WeChat CloudBase is unavailable or unconfigured.');
        await api.cloud.init({ env: environmentId.trim(), traceUser: false });
        if (this.api !== api) throw new Error('CloudBase initialization cancelled.');
        this.cloudEnvironment = environmentId.trim();
    }

    callCloudFunction(name: string, data: unknown, timeoutMs: number): Promise<unknown> {
        const api = this.api as WeChatApi | undefined, env = this.cloudEnvironment;
        if (!api?.cloud || !env) return Promise.reject(new Error('CloudBase has not been initialized.'));
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown, result?: unknown): void => {
                if (settled) return;
                settled = true; clearTimeout(timer); this.cloudOperations.delete(cancel);
                if (error || this.api !== api) reject(error ?? new Error('Cloud request cancelled.'));
                else resolve(result);
            };
            const cancel = (): void => finish(new Error('Cloud request cancelled.'));
            const timer = setTimeout(() => finish(new Error('Cloud request timed out.')), timeoutMs);
            this.cloudOperations.add(cancel);
            try { api.cloud!.callFunction({ name, data, config:{env}, success: response => finish(undefined,response.result), fail: error => finish(error) }); }
            catch (error: unknown) { finish(error); }
        });
    }

    dispose(): void {
        ++this.customerServiceGeneration;
        this.lastCustomerServiceRequestAt = -Infinity;
        this.subscriptionOperations.forEach(cancel => cancel());
        this.subscriptionOperations.clear();
        this.cloudOperations.forEach(cancel => cancel());
        this.cloudOperations.clear(); this.cloudEnvironment = undefined;
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
