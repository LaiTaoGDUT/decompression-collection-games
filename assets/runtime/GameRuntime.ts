import {
    director,
    type AssetManager,
    type Director,
    type Scene,
    type SceneAsset,
} from 'cc';
import type { AppStateMachine } from '../core/state/AppStateMachine';
import type { GameResult } from '../core/types/CommonTypes';
import type { AssetService } from '../services/asset/AssetService';
import type { AnalyticsService } from '../services/analytics/AnalyticsService';
import type { StorageService } from '../services/storage/StorageService';
import type { GameLoader } from './GameLoader';
import type { GameManifest } from './GameManifest';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from './MiniGame';
import { GameSession } from './GameSession';

export interface SceneDirector {
    runScene(
        scene: Scene | SceneAsset,
        onBeforeLoadScene: Director.OnBeforeLoadScene | undefined,
        onLaunched: Director.OnSceneLaunched,
    ): void;
}

export interface LoadingModel {
    readonly variant?: 'game' | 'lobby';
    readonly gameName?: string;
    readonly cover?: string;
    readonly message: string;
    readonly progress: number;
}

export interface LoadingPresenter {
    show(model: LoadingModel): void;
    showRestart?(message: string): void;
    updateProgress(message: string, progress: number): void;
    hideRestart?(): void;
    hide(): void;
}

export interface GameErrorModel {
    readonly title?: string;
    readonly message: string;
    readonly retry?: () => Promise<void>;
    readonly returnToLobby?: () => Promise<void>;
}

export interface GameErrorPresenter {
    show(model: GameErrorModel): void;
    hide(): void;
}

interface ExitOptions {
    readonly skipSessionFinalization?: boolean;
    readonly bestEffortDiscard?: boolean;
}

export interface PauseMenuModel extends MiniGamePauseModel {}

export interface PausePresenter {
    show(model: PauseMenuModel): void;
    hide(): void;
}

export interface ResultViewModel extends MiniGameResultModel {}

export interface ResultPresenter {
    show(model: ResultViewModel): void;
    hide(): void;
}

export interface GameRuntimeTimeouts {
    readonly sceneLoadMs: number;
    readonly initializeMs: number;
}

interface GameRuntimeServices {
    readonly storage?: StorageService;
}

const DEFAULT_RUNTIME_TIMEOUTS: GameRuntimeTimeouts = Object.freeze({
    sceneLoadMs: 15000,
    initializeMs: 10000,
});

export class GameRuntimeError extends Error {
    constructor(
        readonly stage:
            | 'state'
            | 'bundle'
            | 'scene'
            | 'entry'
            | 'initialize'
            | 'begin'
            | 'pause'
            | 'resume'
            | 'restart'
            | 'finish'
            | 'dispose'
            | 'lobby'
            | 'release',
        readonly gameId: string,
        readonly cause: unknown,
    ) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to enter game "${gameId}" at ${stage}: ${reason}`);
        this.name = 'GameRuntimeError';
    }
}

/** 编排大厅启动和单局游戏进入流程。 */
export class GameRuntime {
    private entering?: Promise<void>;
    private leaving?: Promise<void>;
    private restarting?: Promise<void>;
    private session?: GameSession;
    private entry?: MiniGame;
    private manifest?: GameManifest;
    private score = 0;
    private completedResult?: GameResult;
    private failedManifest?: GameManifest;

    constructor(
        private readonly stateMachine: AppStateMachine,
        private readonly assets: AssetService,
        private readonly loader: GameLoader,
        private readonly services: GameRuntimeServices = Object.freeze({}),
        private readonly sceneDirector: SceneDirector = director,
        private readonly loading?: LoadingPresenter,
        private readonly errors?: GameErrorPresenter,
        private readonly pauseMenu?: PausePresenter,
        private readonly results?: ResultPresenter,
        private readonly analytics?: AnalyticsService,
        private readonly timeouts: GameRuntimeTimeouts = DEFAULT_RUNTIME_TIMEOUTS,
    ) {
        if (timeouts.sceneLoadMs <= 0 || timeouts.initializeMs <= 0) {
            throw new Error('Game runtime timeouts must be greater than zero.');
        }
    }

    get currentSession(): GameSession | undefined {
        return this.session;
    }

    get currentEntry(): MiniGame | undefined {
        return this.entry;
    }

    get lastResult(): GameResult | undefined {
        return this.completedResult;
    }

    async enterLobby(showLoading = true): Promise<void> {
        if (!showLoading) {
            await this.enterLobbyScene();
            return;
        }

        this.loading?.show({
            variant: 'lobby',
            gameName: '休闲解压小游戏大全',
            message: '正在加载游戏大厅',
            progress: 0.04,
        });

        try {
            const bundle = await this.assets.loadBundle('lobby');
            this.loading?.updateProgress('大厅资源准备完成', 0.68);
            await this.loadAndLaunchBundleScene(bundle, 'scenes/Lobby');
            this.loading?.updateProgress('欢迎回来，马上开始放松', 1);
            await new Promise<void>((resolve) => setTimeout(resolve, 160));

            if (!this.stateMachine.transition('lobby')) {
                throw new Error(
                    `Cannot enter lobby from state "${this.stateMachine.currentState}".`,
                );
            }
        } finally {
            this.loading?.hide();
        }
    }

    private async enterLobbyScene(): Promise<void> {
        await this.loadAndLaunchScene('lobby', 'scenes/Lobby');

        if (!this.stateMachine.transition('lobby')) {
            throw new Error(
                `Cannot enter lobby from state "${this.stateMachine.currentState}".`,
            );
        }
    }

    enterGame(manifest: GameManifest): Promise<void> {
        if (this.entering) {
            return this.entering;
        }

        if (!this.stateMachine.transition('loading-game')) {
            return Promise.reject(new GameRuntimeError(
                'state',
                manifest.id,
                new Error(
                    `Cannot enter from state "${this.stateMachine.currentState}".`,
                ),
            ));
        }

        this.errors?.hide();

        const entering = this.performEnter(manifest);
        this.entering = entering;
        const clearEntering = (): void => {
            if (this.entering === entering) {
                this.entering = undefined;
            }
        };
        void entering.then(clearEntering, clearEntering);
        return entering;
    }

    exitGame(
        result?: GameResult,
        intent: 'exit' | 'restart' | 'completed' = 'exit',
    ): Promise<void> {
        if (this.leaving) {
            return this.leaving;
        }

        const leaving = this.performExit(result, intent);
        this.leaving = leaving;
        const clearLeaving = (): void => {
            if (this.leaving === leaving) {
                this.leaving = undefined;
            }
        };
        void leaving.then(clearLeaving, clearLeaving);
        return leaving;
    }

    openPauseMenu(): void {
        const entry = this.entry;
        const manifest = this.manifest;
        const state = this.stateMachine.currentState;

        if (!entry
            || !manifest
            || this.completedResult
            || (state !== 'playing' && state !== 'paused')) {
            throw new GameRuntimeError(
                'state',
                manifest?.id ?? 'unknown',
                new Error(`Cannot pause from state "${state}".`),
            );
        }

        if (state === 'playing') {
            try {
                entry.pause();
            } catch (cause: unknown) {
                throw new GameRuntimeError('pause', manifest.id, cause);
            } finally {
                this.flushStorage('pause');
            }

            if (!this.stateMachine.transition('paused')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to paused.'),
                );
            }
        } else {
            this.flushStorage('pause');
        }

        const model = Object.freeze({
            resume: this.resumeFromPause,
            restart: this.restartFromPause,
            exit: this.exitFromPause,
        });
        if (entry.showPauseMenu) {
            this.pauseMenu?.hide();
            entry.showPauseMenu(model);
        } else {
            this.pauseMenu?.show(model);
        }
    }

    finishGame(result: GameResult): GameResult {
        const entry = this.entry;
        const session = this.session;
        const manifest = this.manifest;
        const state = this.stateMachine.currentState;

        if (!entry
            || !session
            || !manifest
            || this.completedResult
            || (state !== 'playing' && state !== 'paused')) {
            throw new GameRuntimeError(
                'finish',
                manifest?.id ?? 'unknown',
                new Error('No active unfinished game can be completed.'),
            );
        }

        if (state === 'playing') {
            try {
                entry.pause();
            } catch (cause: unknown) {
                throw new GameRuntimeError('pause', manifest.id, cause);
            } finally {
                this.flushStorage('finish');
            }

            if (!this.stateMachine.transition('paused')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to paused for results.'),
                );
            }
        } else {
            this.flushStorage('finish');
        }

        try {
            this.completedResult = session.finish(result);
        } catch (cause: unknown) {
            throw new GameRuntimeError('finish', manifest.id, cause);
        }

        this.trackSessionEnd(session, manifest, 'completed');

        this.hidePausePresenter();
        const resultModel = Object.freeze({
            result: this.completedResult,
            restart: this.restartFromResult,
            returnToLobby: this.returnToLobbyFromResult,
        });
        if (entry.showResultView) {
            this.results?.hide();
            entry.showResultView(resultModel);
        } else {
            this.results?.show(resultModel);
        }
        return this.completedResult;
    }

    private readonly resumeFromPause = async (): Promise<void> => {
        const entry = this.entry;
        const manifest = this.manifest;

        if (!entry || !manifest || this.stateMachine.currentState !== 'paused') {
            throw new GameRuntimeError(
                'state',
                manifest?.id ?? 'unknown',
                new Error('No paused game can be resumed.'),
            );
        }

        try {
            entry.resume();
        } catch (cause: unknown) {
            throw new GameRuntimeError('resume', manifest.id, cause);
        }

        if (!this.stateMachine.transition('playing')) {
            throw new GameRuntimeError(
                'state',
                manifest.id,
                new Error('Cannot transition to playing.'),
            );
        }

        this.hidePausePresenter();
    };

    private readonly restartFromPause = async (): Promise<void> => {
        const manifest = this.manifest;

        if (!manifest || this.stateMachine.currentState !== 'paused') {
            throw new GameRuntimeError(
                'restart',
                manifest?.id ?? 'unknown',
                new Error('No paused game can be restarted.'),
            );
        }

        this.hidePausePresenter();
        await this.restartInPlace(
            'pause',
            { score: this.score, duration: 0, completed: false },
        );
    };

    private readonly exitFromPause = async (): Promise<void> => {
        this.hidePausePresenter();
        await this.exitGame({ score: this.score, duration: 0, completed: false });
    };

    private readonly restartFromResult = async (): Promise<void> => {
        const manifest = this.manifest;
        const result = this.completedResult;

        if (!manifest || !result) {
            throw new GameRuntimeError(
                'restart',
                manifest?.id ?? 'unknown',
                new Error('No completed game can be restarted.'),
            );
        }

        this.hideResultPresenter();
        await this.restartInPlace('result', result);
    };

    private readonly returnToLobbyFromResult = async (): Promise<void> => {
        const result = this.completedResult;

        if (!result) {
            throw new GameRuntimeError(
                'finish',
                this.manifest?.id ?? 'unknown',
                new Error('No completed game can return to lobby.'),
            );
        }

        this.hideResultPresenter();
        await this.exitGame(result, 'completed');
    };

    private async performEnter(manifest: GameManifest): Promise<void> {
        this.loading?.show({
            gameName: manifest.name,
            cover: manifest.cover,
            message: '即将进入游戏',
            progress: 0.04,
        });
        const session = new GameSession(manifest.id);
        this.session = session;
        this.manifest = manifest;
        this.score = 0;
        this.completedResult = undefined;

        try {
            let bundle: AssetManager.Bundle;

            try {
                bundle = await this.assets.loadBundle(manifest.bundle);
                this.loading?.updateProgress('游戏资源准备完成', 0.28);
            } catch (cause: unknown) {
                throw new GameRuntimeError('bundle', manifest.id, cause);
            }

            let scene: Scene;

            try {
                scene = await this.loadAndLaunchBundleScene(bundle, manifest.scene);
                this.loading?.updateProgress('正在布置游戏场景', 0.58);
            } catch (cause: unknown) {
                throw new GameRuntimeError('scene', manifest.id, cause);
            }

            let entry: MiniGame;

            try {
                entry = this.loader.locateEntry(scene, manifest);
                this.entry = entry;
                this.loading?.updateProgress('正在启动游戏组件', 0.7);
            } catch (cause: unknown) {
                throw new GameRuntimeError('entry', manifest.id, cause);
            }

            const context = this.createContext(manifest, session);

            try {
                await this.withTimeout(
                    entry.initialize(context),
                    this.timeouts.initializeMs,
                    'game initialization',
                );
                this.loading?.updateProgress('马上就可以开始啦', 0.92);
            } catch (cause: unknown) {
                throw new GameRuntimeError('initialize', manifest.id, cause);
            }

            try {
                entry.begin();
                this.flushStorage('game begin');
                this.loading?.updateProgress('加载完成', 1);
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 180);
                });
            } catch (cause: unknown) {
                throw new GameRuntimeError('begin', manifest.id, cause);
            }

            if (!this.stateMachine.transition('playing')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to playing.'),
                );
            }

            this.failedManifest = undefined;
            this.analytics?.track('game_start', {
                gameId: manifest.id,
                sessionId: session.id,
            });
        } catch (error: unknown) {
            this.entry = undefined;
            this.session = undefined;
            this.manifest = undefined;

            if (this.stateMachine.currentState === 'loading-game') {
                this.stateMachine.transition('error');
            }

            this.presentGameLoadError(manifest, error);

            throw error;
        } finally {
            this.loading?.hide();
        }
    }

    private async performExit(
        result?: GameResult,
        intent: 'exit' | 'restart' | 'completed' = 'exit',
        options: ExitOptions = {},
    ): Promise<void> {
        const entry = this.entry;
        const session = this.session;
        const manifest = this.manifest;

        if (!entry || !session || !manifest) {
            throw new GameRuntimeError(
                'state',
                manifest?.id ?? 'unknown',
                new Error('No active game can be exited.'),
            );
        }

        const state = this.stateMachine.currentState;

        if (state !== 'playing' && state !== 'paused' && state !== 'restarting-game') {
            throw new GameRuntimeError(
                'state',
                manifest.id,
                new Error(`Cannot exit from state "${state}".`),
            );
        }

        try {
            if (state === 'playing') {
                try {
                    entry.pause();
                } catch (cause: unknown) {
                    throw new GameRuntimeError('pause', manifest.id, cause);
                } finally {
                    this.flushStorage('game exit');
                }
            } else {
                this.flushStorage('game exit');
            }

            if (!this.stateMachine.transition('leaving-game')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to leaving-game.'),
                );
            }

            if (!options.skipSessionFinalization) {
                if (session.state === 'finished' && session.result) {
                    this.completedResult = session.result;
                } else {
                    try {
                        this.completedResult = session.finish(result ?? {
                            score: this.score,
                            duration: 0,
                            completed: false,
                        });
                    } catch (cause: unknown) {
                        throw new GameRuntimeError('finish', manifest.id, cause);
                    }
                }

                this.trackSessionEnd(session, manifest, intent);
            }

            if (intent === 'restart') {
                try {
                    entry.discardSavedProgress?.();
                } catch (cause: unknown) {
                    if (options.bestEffortDiscard) {
                        console.warn(
                            '[GameRuntime] Failed to discard progress during restart fallback.',
                            cause,
                        );
                    } else {
                        throw new GameRuntimeError('restart', manifest.id, cause);
                    }
                } finally {
                    this.flushStorage('restart discard');
                }
            }

            try {
                await entry.dispose();
            } catch (cause: unknown) {
                throw new GameRuntimeError('dispose', manifest.id, cause);
            } finally {
                this.flushStorage('game dispose');
            }

            try {
                await this.enterLobbyScene();
            } catch (cause: unknown) {
                throw new GameRuntimeError('lobby', manifest.id, cause);
            }

            let releaseError: GameRuntimeError | undefined;

            this.flushStorage('before bundle release');
            try {
                await this.assets.releaseBundle(manifest.bundle);
            } catch (cause: unknown) {
                releaseError = new GameRuntimeError('release', manifest.id, cause);
            }

            this.clearActiveGame();

            if (releaseError) {
                throw releaseError;
            }
        } catch (error: unknown) {
            if (this.stateMachine.currentState === 'playing') {
                this.stateMachine.transition('leaving-game');
            }

            if (this.stateMachine.currentState === 'restarting-game') {
                this.stateMachine.transition('error');
            }

            if (this.stateMachine.currentState === 'leaving-game') {
                this.stateMachine.transition('error');
            }

            throw error;
        }
    }

    private clearActiveGame(): void {
        this.entry = undefined;
        this.session = undefined;
        this.manifest = undefined;
        this.score = 0;
    }

    private flushStorage(reason: string): void {
        try {
            this.services.storage?.flush();
        } catch (error: unknown) {
            // 存储失败不能阻断暂停、退出、重开或 Bundle 释放；服务会保留
            // pending 快照，后续普通写入或下一次关键 flush 继续重试。
            console.error(`[GameRuntime] Storage flush failed at ${reason}.`, error);
        }
    }

    /**
     * 在保留当前场景和 Bundle 的前提下创建新一局。
     * 失败时回退到既有的完整退出/重新进入流程，避免继续使用半重置实例。
     */
    private restartInPlace(
        source: 'pause' | 'result' | 'direct',
        result: GameResult,
    ): Promise<void> {
        if (this.restarting) {
            return this.restarting;
        }

        const restarting = this.performRestartInPlace(source, result);
        this.restarting = restarting;
        const clearRestarting = (): void => {
            if (this.restarting === restarting) {
                this.restarting = undefined;
            }
        };
        void restarting.then(clearRestarting, clearRestarting);
        return restarting;
    }

    private async performRestartInPlace(
        source: 'pause' | 'result' | 'direct',
        result: GameResult,
    ): Promise<void> {
        const entry = this.entry;
        const previousSession = this.session;
        const manifest = this.manifest;

        if (!entry || !previousSession || !manifest) {
            throw new GameRuntimeError(
                'restart',
                manifest?.id ?? 'unknown',
                new Error('No active game can be restarted.'),
            );
        }

        const state = this.stateMachine.currentState;
        if (state !== 'playing' && state !== 'paused') {
            throw new GameRuntimeError(
                'restart',
                manifest.id,
                new Error(`Cannot restart from state "${state}".`),
            );
        }

        try {
            if (state === 'playing') {
                try {
                    entry.pause();
                } finally {
                    this.flushStorage('restart');
                }
            } else {
                this.flushStorage('restart');
            }
            if (!this.stateMachine.transition('restarting-game')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to restarting-game.'),
                );
            }

            this.loading?.showRestart?.('正在重新开始');
            this.trackRestart(source);
            if (previousSession.state === 'active') {
                const previousResult = previousSession.finish(result);
                this.completedResult = previousResult;
                this.trackSessionEnd(previousSession, manifest, 'restart');
            } else if (previousSession.result) {
                this.completedResult = previousSession.result;
            }

            const nextSession = new GameSession(manifest.id);
            this.session = nextSession;
            this.score = 0;
            this.completedResult = undefined;

            try {
                await entry.restart(this.createContext(manifest, nextSession));
            } finally {
                this.flushStorage('restart begin');
            }

            if (!this.stateMachine.transition('playing')) {
                throw new GameRuntimeError(
                    'state',
                    manifest.id,
                    new Error('Cannot transition to playing after restart.'),
                );
            }

            this.failedManifest = undefined;
            this.analytics?.track('game_start', {
                gameId: manifest.id,
                sessionId: nextSession.id,
            });
        } catch (error: unknown) {
            console.warn(
                '[GameRuntime] In-place restart failed; falling back to full reload.',
                error,
            );

            // The entry may have been partially reset. The standard exit path
            // disposes that instance and releases the Bundle before retrying.
            await this.performExit(
                undefined,
                'restart',
                {
                    skipSessionFinalization: true,
                    bestEffortDiscard: true,
                },
            );
            await this.enterGame(manifest);
        } finally {
            this.loading?.hideRestart?.();
        }
    }

    private createContext(
        manifest: GameManifest,
        session: GameSession,
    ): MiniGameContext {
        const isCurrentSession = (): boolean => this.session === session;
        const reportScore = (score: number): void => {
            if (isCurrentSession()) this.handleScore(score);
        };
        const requestPause = (): void => {
            if (isCurrentSession()) this.handlePauseRequest();
        };
        const requestExit = (result?: GameResult): void => {
            if (isCurrentSession()) this.handleExitRequest(result);
        };
        const requestRestart = (result?: GameResult): void => {
            if (isCurrentSession()) this.handleRestartRequest(result);
        };
        const requestLobby = (result?: GameResult): void => {
            if (isCurrentSession()) this.handleLobbyRequest(result);
        };

        return Object.freeze({
            gameId: manifest.id,
            sessionId: session.id,
            services: this.services,
            reportScore,
            requestPause,
            requestExit,
            requestRestart,
            requestLobby,
        });
    }

    private presentGameLoadError(
        manifest: GameManifest,
        error: unknown,
    ): void {
        this.failedManifest = manifest;
        const reason = error instanceof Error ? error.message : String(error);
        const failure = this.describeLoadFailure(error);
        console.error('[GameRuntime] Game load failed.', {
            gameId: manifest.id,
            diagnosticId: failure.diagnosticId,
            reason,
            error,
        });
        this.errors?.show(Object.freeze({
            title: '游戏加载失败',
            message: `${failure.message}\n诊断码：${failure.diagnosticId}`,
            retry: this.retryFailedGame,
            returnToLobby: this.returnToLobbyAfterError,
        }));
    }

    private readonly retryFailedGame = async (): Promise<void> => {
        const manifest = this.failedManifest;

        if (!manifest) {
            throw new Error('There is no failed game to retry.');
        }

        await this.enterGame(manifest);
    };

    private readonly returnToLobbyAfterError = async (): Promise<void> => {
        const manifest = this.failedManifest;
        this.errors?.hide();

        try {
            await this.enterLobby();
            this.failedManifest = undefined;
            if (manifest) {
                try {
                    await this.assets.releaseBundle(manifest.bundle);
                } catch (releaseError: unknown) {
                    console.warn(
                        '[GameRuntime] Failed bundle cleanup did not block lobby recovery.',
                        releaseError,
                    );
                }
            }
        } catch (error: unknown) {
            if (manifest) {
                this.presentGameLoadError(manifest, error);
            }

            throw error;
        }
    };

    private async loadAndLaunchScene(
        bundleName: string,
        scenePath: string,
    ): Promise<Scene> {
        const bundle = await this.assets.loadBundle(bundleName);
        return this.loadAndLaunchBundleScene(bundle, scenePath);
    }

    private async loadAndLaunchBundleScene(
        bundle: AssetManager.Bundle,
        scenePath: string,
    ): Promise<Scene> {
        const sceneAsset = await this.withTimeout(new Promise<SceneAsset>((resolve, reject) => {
            bundle.loadScene(
                scenePath,
                (error, asset) => error ? reject(error) : resolve(asset),
            );
        }), this.timeouts.sceneLoadMs, 'scene asset loading');

        return this.withTimeout(new Promise<Scene>((resolve, reject) => {
            this.sceneDirector.runScene(sceneAsset, undefined, (error, scene) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!scene) {
                    reject(new Error('Director launched no scene.'));
                    return;
                }

                resolve(scene);
            });
        }), this.timeouts.sceneLoadMs, 'scene launch');
    }

    private withTimeout<TValue>(
        operation: Promise<TValue>,
        timeoutMs: number,
        label: string,
    ): Promise<TValue> {
        return new Promise<TValue>((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new Error(`${label} timed out after ${timeoutMs} ms.`));
            }, timeoutMs);
            void operation.then(
                (value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timeout);
                    resolve(value);
                },
                (error: unknown) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timeout);
                    reject(error);
                },
            );
        });
    }

    private describeLoadFailure(error: unknown): {
        readonly message: string;
        readonly diagnosticId: string;
    } {
        const stage = error instanceof GameRuntimeError ? error.stage : 'state';
        const code = stage.toUpperCase();
        const messages: Readonly<Record<string, string>> = {
            bundle: '游戏资源暂时不可用，请检查网络后重试。',
            scene: '游戏场景没有完整加载，请稍后重试。',
            entry: '游戏内容校验失败，请返回大厅。',
            initialize: '游戏初始化未完成，请重试。',
            begin: '游戏启动失败，请重试。',
            state: '当前操作尚未完成，请稍后重试。',
        };
        return Object.freeze({
            message: messages[stage] ?? '游戏暂时无法进入，请稍后重试。',
            diagnosticId: `GAME-${code}`,
        });
    }

    private readonly handleScore = (score: number): void => {
        if (Number.isFinite(score)) {
            this.score = score;
        }

        console.info('[GameRuntime] Score reported.', {
            gameId: this.manifest?.id,
            sessionId: this.session?.id,
            score,
        });
    };

    private trackRestart(source: 'pause' | 'result' | 'direct'): void {
        const manifest = this.manifest;
        const session = this.session;

        if (manifest && session) {
            this.analytics?.track('game_restart', {
                gameId: manifest.id,
                sessionId: session.id,
                source,
            });
        }
    }

    private trackSessionEnd(
        session: GameSession,
        manifest: GameManifest,
        intent: 'exit' | 'restart' | 'completed',
    ): void {
        const result = session.result;

        if (!result) {
            return;
        }

        const resultReason = result.extra?.reason;
        const reason = typeof resultReason === 'string' ? resultReason : intent;
        this.analytics?.trackGameEnd(session.id, {
            gameId: manifest.id,
            score: result.score,
            completed: result.completed,
            reason,
        });

        if (intent === 'exit') {
            this.analytics?.track('game_exit', {
                gameId: manifest.id,
                sessionId: session.id,
                score: result.score,
                reason: 'manual',
            });
        }
    }

    private readonly handlePauseRequest = (): void => {
        try {
            this.openPauseMenu();
        } catch (error: unknown) {
            console.error('[GameRuntime] Pause request failed.', error);
        }
    };

    private readonly handleExitRequest = (result?: GameResult): void => {
        if (result?.completed) {
            try {
                this.finishGame(result);
            } catch (error: unknown) {
                console.error('[GameRuntime] Finish request failed.', error);
            }

            return;
        }

        void this.exitGame(result).catch((error: unknown) => {
            console.error('[GameRuntime] Exit request failed.', error);
        });
    };

    private readonly handleRestartRequest = (result?: GameResult): void => {
        if (!this.manifest) return;
        this.hidePausePresenter();
        this.hideResultPresenter();
        void this.restartInPlace(
            'direct',
            result ?? { score: this.score, duration: 0, completed: false },
        )
            .catch((error: unknown) => {
                console.error('[GameRuntime] In-place restart request failed.', error);
            });
    };

    private readonly handleLobbyRequest = (result?: GameResult): void => {
        this.hidePausePresenter();
        this.hideResultPresenter();
        void this.exitGame(result, result?.completed ? 'completed' : 'exit')
            .catch((error: unknown) => {
                console.error('[GameRuntime] Direct lobby request failed.', error);
            });
    };

    private hidePausePresenter(): void {
        this.entry?.hidePauseMenu?.();
        this.pauseMenu?.hide();
    }

    private hideResultPresenter(): void {
        this.entry?.hideResultView?.();
        this.results?.hide();
    }
}
