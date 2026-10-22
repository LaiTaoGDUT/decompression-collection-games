import type { Platform, UpdateSubscriptionState } from '../../platform/Platform';
import type { StorageService, UpdateReminderSaveData } from '../storage/StorageService';

export const UPDATE_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface UpdateReminderOptions {
    readonly platform: Platform;
    readonly storage: StorageService;
    /** 点击返回大厅时应用仍在前台；对局/退出状态由运行层校验。 */
    readonly canRequest: () => boolean;
    readonly now?: () => number;
}

/** 提前查询订阅状态；完整结算后，由返回大厅按钮的 touchend 同步申请微信订阅。 */
export class UpdateReminderService {
    private roundFinished = false;
    private attemptedThisLaunch = false;
    private disposed = false;
    private setting?: UpdateSubscriptionState;
    private preparation?: Promise<void>;
    private readonly now: () => number;

    constructor(private readonly options: UpdateReminderOptions) {
        this.now = options.now ?? Date.now;
    }

    /** 启动时预取，只读取权限；查询完成不能自动申请或重放之前的点击。 */
    prepare(): Promise<void> {
        const { platform } = this.options;
        if (this.disposed || platform.id !== 'wechat' || !platform.getUpdateSubscription
            || !platform.requestUpdateSubscription) return Promise.resolve();
        if (!this.preparation) this.preparation = this.readSetting();
        return this.preparation;
    }

    recordRoundFinished(): void {
        if (!this.disposed) this.roundFinished = true;
    }

    /** 必须在返回按钮的真实 touchend 内同步调用，不能先 await 查询或切换场景。 */
    requestFromLobbyClick(): void {
        const { platform, storage } = this.options;
        if (this.disposed || this.attemptedThisLaunch || !this.roundFinished || !this.options.canRequest()
            || platform.id !== 'wechat' || !platform.requestUpdateSubscription || this.setting !== 'unknown'
            || storage.snapshot.updateReminder?.accepted
            || this.now() < (storage.snapshot.updateReminder?.nextPromptAt ?? 0)) return;

        this.attemptedThisLaunch = true;
        try {
            // 同步落盘，避免用户在微信面板中直接结束游戏后再次被打扰。
            this.save({ accepted: false, nextPromptAt: this.now() + UPDATE_REMINDER_COOLDOWN_MS });
        } catch (error: unknown) {
            console.warn('[UpdateReminder] Failed to persist subscription attempt.', error);
            return;
        }

        let request: Promise<UpdateSubscriptionState>;
        try {
            // 此调用之前没有 Promise/计时器/动画回调，保持真实触摸上下文。
            request = platform.requestUpdateSubscription();
        } catch (error: unknown) {
            console.warn('[UpdateReminder] Subscription request failed.', error);
            request = Promise.resolve('failed');
        }
        void this.finishRequest(request);
    }

    dispose(): void {
        this.disposed = true;
    }

    private async readSetting(): Promise<void> {
        try {
            const setting = await this.options.platform.getUpdateSubscription!();
            if (this.disposed) return;
            this.setting = setting;
            if (setting === 'accepted') this.save({ accepted: true, nextPromptAt: 0 });
            else if (setting === 'rejected' || setting === 'blocked') {
                // 微信保存的明确拒绝/总开关优先于本地曾接受的回执，不自动打开设置。
                this.save({ accepted: false, nextPromptAt: this.now() + UPDATE_REMINDER_COOLDOWN_MS });
            }
        } catch (error: unknown) {
            this.setting = 'failed';
            console.warn('[UpdateReminder] Failed to read subscription setting.', error);
        }
    }

    private async finishRequest(request: Promise<UpdateSubscriptionState>): Promise<void> {
        try {
            const result = await request.catch((): UpdateSubscriptionState => 'failed');
            if (this.disposed) return;
            if (result === 'accepted') {
                this.save({ accepted: true, nextPromptAt: 0 });
            } else if (result === 'rejected' || result === 'blocked') {
                this.save({ accepted: false, nextPromptAt: this.now() + UPDATE_REMINDER_COOLDOWN_MS });
            } else {
                // 失败不影响返回大厅；下次启动仍须再次真实点击返回按钮，绝不自动重试。
                this.save({ accepted: false, nextPromptAt: 0 });
            }
        } catch (error: unknown) {
            console.warn('[UpdateReminder] Failed to save subscription result.', error);
        }
    }

    private save(state: UpdateReminderSaveData): void {
        this.options.storage.writeUpdateReminder(state);
        this.options.storage.flush();
    }
}
