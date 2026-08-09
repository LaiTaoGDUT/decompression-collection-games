import type {
    GameResult,
    GameServices,
} from '../core/types/CommonTypes';

export interface MiniGamePauseModel {
    readonly resume: () => Promise<void>;
    readonly restart: () => Promise<void>;
    readonly exit: () => Promise<void>;
}

export interface MiniGameResultModel {
    readonly result: GameResult;
    readonly restart: () => Promise<void>;
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
    requestPause(): void;
    requestExit(result?: GameResult): void;
    requestRestart(result?: GameResult): void;
    requestLobby(result?: GameResult): void;
}

/**
 * 所有小游戏入口组件必须实现的生命周期协议。
 *
 * 正常调用顺序：
 * `initialize → begin → pause/resume/restart → dispose`。
 * `dispose` 完成后，该实例不得继续持有运行层资源或监听。
 */
export interface MiniGame<TServices extends object = object> {
    initialize(context: MiniGameContext<TServices>): Promise<void>;
    begin(): void;
    pause(): void;
    resume(): void;
    restart(): Promise<void>;
    dispose(): Promise<void>;
    showPauseMenu?(model: MiniGamePauseModel): void;
    hidePauseMenu?(): void;
    showResultView?(model: MiniGameResultModel): void;
    hideResultView?(): void;
}
