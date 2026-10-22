import type {
    GameResult,
    GameServices,
} from '../core/types/CommonTypes';
import type { AnalyticsProperties } from '../services/analytics/AnalyticsService';

/**
 * 平台切到后台时小游戏的自动暂停策略。
 *
 * - `menu`（默认）：冻结本局并展示暂停界面，回到前台后由玩家显式继续。
 * - `silent`：只冻结本局，不展示暂停界面；回到前台由运行层自动继续。
 *
 * 策略只约束平台触发的暂停；玩家点按暂停入口时始终展示暂停界面。
 */
export type MiniGameBackgroundPausePolicy = 'menu' | 'silent';

export interface MiniGamePauseModel {
    readonly resume: () => Promise<void>;
    readonly restart: () => Promise<void>;
    /** 从返回按钮的触摸回调同步调用，运行层会延后销毁 UI。 */
    readonly exit: () => Promise<void>;
}

export interface MiniGameResultModel {
    readonly result: GameResult;
    readonly restart: () => Promise<void>;
    /** 从返回按钮的触摸回调同步调用，不能先等待动画或 Promise。 */
    readonly returnToLobby: () => Promise<void>;
}

/**
 * 由运行层为每一局游戏创建并注入的上下文。
 * 小游戏通过该上下文使用公共能力、报告分数和请求退出，
 * 不直接操作大厅、场景或平台 API。
 */
export interface MiniGameContext<TServices extends object = object> {
    readonly gameId: string;
    readonly sessionId: string;
    readonly difficulty?: string;
    readonly services: GameServices<TServices>;

    reportScore(score: number): void;
    /** 上报本局玩法里程碑；运行层根据 Manifest 判定并记录最高进度。 */
    reportAchievementProgress(metric: string, value: number): void;
    /** 场景内自行结算的游戏上报完整一局结束（通关或放弃复活后的失败）；中途退出不调用。 */
    reportRoundFinished?(): void;
    /** Generic game events use the public analytics service; eventId deduplicates retries. */
    reportEvent?(name: string, properties: AnalyticsProperties, eventId?: string): void;
    requestPause(): void;
    requestExit(result?: GameResult): void;
    requestRestart(result?: GameResult): void;
    /** 玩家点击返回大厅时同步调用，以保留平台订阅能力需要的 touchend 上下文。 */
    requestLobby(result?: GameResult): void;
}

/**
 * 所有小游戏入口组件必须实现的生命周期协议。
 *
 * 正常调用顺序：
 * `initialize → begin → pause/resume/restart → dispose`。
 * 运行层执行局内重开时，会通过 `restart` 注入新的本局上下文；小游戏
 * 必须保留已加载的场景资源，只重置本局状态。
 * `dispose` 完成后，该实例不得继续持有运行层资源或监听。
 */
export interface MiniGame<TServices extends object = object> {
    /** 云存档门槛只累计真实玩法时间，游戏内选关、结算和说明页不计入。 */
    isGameplayActive?(): boolean;
    initialize(context: MiniGameContext<TServices>): Promise<void>;
    begin(): void;
    /**
     * 尝试暂停当前小游戏。只有小游戏确实进入了可恢复的暂停态时才返回 true。
     * 准备页、原生选择器等非游玩阶段应返回 false，避免运行层与小游戏状态分叉。
     */
    pause(): boolean;
    resume(): void;
    restart(context?: MiniGameContext<TServices>): Promise<void>;
    /**
     * 平台切后台时的自动暂停策略，缺省为 `menu`。
     * 静态声明而不是运行时切换，保证运行层的暂停/恢复流程可以提前确定。
     */
    readonly backgroundPausePolicy?: MiniGameBackgroundPausePolicy;
    /** 运行层准备执行“重新开局”时，清除当前局的可恢复标记。 */
    discardSavedProgress?(): void;
    dispose(): Promise<void>;
    showPauseMenu?(model: MiniGamePauseModel): void;
    hidePauseMenu?(): void;
    showResultView?(model: MiniGameResultModel): void;
    hideResultView?(): void;
}
