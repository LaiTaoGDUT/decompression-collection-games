import {
    _decorator,
    AudioSource,
    Component,
    director,
    find,
    Node,
    sys,
} from 'cc';
import {
    createServiceToken,
    ServiceContainer,
} from '../core/container/ServiceContainer';
import { AppStateMachine } from '../core/state/AppStateMachine';
import type { Unsubscribe } from '../core/types/CommonTypes';
import type { Platform } from '../platform/Platform';
import { WebPlatform } from '../platform/WebPlatform';
import { WeChatPlatform } from '../platform/WeChatPlatform';
import { GameRegistry } from '../runtime/GameRegistry';
import { GameLoader } from '../runtime/GameLoader';
import { GameRuntime } from '../runtime/GameRuntime';
import { AssetService } from '../services/asset/AssetService';
import { AudioService } from '../services/audio/AudioService';
import {
    AnalyticsService,
    ConsoleAnalyticsTransport,
} from '../services/analytics/AnalyticsService';
import {
    AdService,
    MockRewardedAdProvider,
} from '../services/ads/AdService';
import { ConfigService } from '../services/config/ConfigService';
import { FeedbackService } from '../services/feedback/FeedbackService';
import { StorageService } from '../services/storage/StorageService';
import { ErrorView } from '../shared/components/ErrorView';
import { LoadingView } from '../shared/components/LoadingView';
import { PauseView } from '../shared/components/PauseView';
import { ResultView } from '../shared/components/ResultView';

const { ccclass } = _decorator;

export const PLATFORM_SERVICE = createServiceToken<Platform>('Platform');
export const APP_STATE_MACHINE_SERVICE = createServiceToken<AppStateMachine>(
    'AppStateMachine',
);
export const CONFIG_SERVICE = createServiceToken<ConfigService>('ConfigService');
export const GAME_REGISTRY_SERVICE = createServiceToken<GameRegistry>(
    'GameRegistry',
);
export const ASSET_SERVICE = createServiceToken<AssetService>('AssetService');
export const GAME_LOADER_SERVICE = createServiceToken<GameLoader>('GameLoader');
export const GAME_RUNTIME_SERVICE = createServiceToken<GameRuntime>('GameRuntime');
export const STORAGE_SERVICE = createServiceToken<StorageService>('StorageService');
export const AUDIO_SERVICE = createServiceToken<AudioService>('AudioService');
export const ANALYTICS_SERVICE = createServiceToken<AnalyticsService>(
    'AnalyticsService',
);
export const AD_SERVICE = createServiceToken<AdService>('AdService');
export const FEEDBACK_SERVICE = createServiceToken<FeedbackService>(
    'FeedbackService',
);

type AppStartupStage =
    | 'startup'
    | 'platform-lifecycle'
    | 'storage'
    | 'audio'
    | 'game-catalog'
    | 'lobby';

export interface AppStartupFailure {
    readonly stage: AppStartupStage;
    readonly message: string;
    readonly cause: unknown;
}

class AppStartupStageError extends Error {
    constructor(
        readonly stage: AppStartupStage,
        readonly cause: unknown,
    ) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'AppStartupStageError';
    }
}

/** 应用唯一组合根，负责创建最基础的全局对象。 */
@ccclass('App')
export class App extends Component {
    private static activeInstance: App | null = null;

    private container?: ServiceContainer;
    private readonly lifecycleUnsubscribes: Unsubscribe[] = [];
    private startupInitialization?: Promise<void>;
    private pausedByPlatform = false;
    private startupFailure?: AppStartupFailure;

    static get instance(): App {
        if (!App.activeInstance) {
            throw new Error('App has not been initialized.');
        }

        return App.activeInstance;
    }

    /** 场景单独预览时允许调用方判断组合根是否存在。 */
    static get current(): App | undefined {
        return App.activeInstance ?? undefined;
    }

    get services(): ServiceContainer {
        if (!this.container) {
            throw new Error('App service container is not initialized.');
        }

        return this.container;
    }

    get startupError(): AppStartupFailure | undefined {
        return this.startupFailure;
    }

    protected onLoad(): void {
        if (App.activeInstance) {
            if (App.activeInstance !== this) {
                this.node.destroy();
            }

            return;
        }

        App.activeInstance = this;

        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }

        const container = new ServiceContainer();
        const stateMachine = new AppStateMachine('booting');
        const platform = this.createPlatform();
        const configService = new ConfigService();
        const assetService = new AssetService();
        const storageService = new StorageService();
        const audioRoot = find('AudioRoot', this.node);

        if (!audioRoot) {
            throw new Error('Persistent AudioRoot is missing.');
        }

        const musicSource = this.createAudioSource(audioRoot, 'MusicChannel');
        const effectSource = this.createAudioSource(audioRoot, 'EffectChannel');
        const audioService = new AudioService(
            musicSource,
            effectSource,
            storageService,
        );
        const feedbackService = new FeedbackService(
            audioService,
            platform,
            storageService,
        );
        const analyticsService = new AnalyticsService(
            () => ({
                appVersion: configService.config.appVersion,
                platformId: platform.id,
                deviceTier: platform.getDeviceProfile().tier,
            }),
            new ConsoleAnalyticsTransport(),
        );
        const adService = new AdService(
            stateMachine,
            new MockRewardedAdProvider(),
        );
        const gameLoader = new GameLoader();
        const loadingView = find('Canvas/LoadingLayer', this.node)
            ?.getComponent(LoadingView);
        const errorView = find('Canvas/ErrorLayer', this.node)
            ?.getComponent(ErrorView);
        const pauseView = find('Canvas/PauseLayer', this.node)
            ?.getComponent(PauseView);
        const resultView = find('Canvas/ResultLayer', this.node)
            ?.getComponent(ResultView);
        const gameRuntime = new GameRuntime(
            stateMachine,
            assetService,
            gameLoader,
            Object.freeze({
                audio: audioService,
                feedback: feedbackService,
                storage: storageService,
                analytics: analyticsService,
                ads: adService,
                deviceTier: platform.getDeviceProfile().tier,
            }),
            director,
            loadingView ?? undefined,
            errorView ?? undefined,
            pauseView ?? undefined,
            resultView ?? undefined,
            analyticsService,
        );

        container.register(APP_STATE_MACHINE_SERVICE, stateMachine);
        container.register(PLATFORM_SERVICE, platform);
        container.register(CONFIG_SERVICE, configService);
        container.register(GAME_REGISTRY_SERVICE, new GameRegistry());
        container.register(ASSET_SERVICE, assetService);
        container.register(GAME_LOADER_SERVICE, gameLoader);
        container.register(GAME_RUNTIME_SERVICE, gameRuntime);
        container.register(STORAGE_SERVICE, storageService);
        container.register(AUDIO_SERVICE, audioService);
        container.register(ANALYTICS_SERVICE, analyticsService);
        container.register(AD_SERVICE, adService);
        container.register(FEEDBACK_SERVICE, feedbackService);
        this.container = container;
    }

    protected start(): void {
        if (this.startupInitialization) {
            return;
        }

        this.startupInitialization = this.initializeApplication();
        void this.startupInitialization.catch((error: unknown) => {
            if (error instanceof AppStartupStageError) {
                this.handleStartupFailure(error.stage, error.cause);
                return;
            }

            this.handleStartupFailure('startup', error);
        });
    }

    protected onDestroy(): void {
        if (App.activeInstance !== this) {
            return;
        }

        App.activeInstance = null;
        this.clearLifecycleListeners();

        if (this.container?.has(PLATFORM_SERVICE)) {
            this.container.get(PLATFORM_SERVICE).dispose();
        }

        if (this.container?.has(AUDIO_SERVICE)) {
            this.container.get(AUDIO_SERVICE).dispose();
        }

        this.container = undefined;

        if (director.isPersistRootNode(this.node)) {
            director.removePersistRootNode(this.node);
        }
    }

    private createPlatform(): Platform {
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            return new WeChatPlatform();
        }

        return new WebPlatform();
    }

    private async initializeApplication(): Promise<void> {
        const platform = this.services.get(PLATFORM_SERVICE);

        await this.runStartupStage(
            'platform-lifecycle',
            () => platform.initialize(),
        );

        await this.runStartupStage('storage', async () => {
            this.services.get(STORAGE_SERVICE).load();
        });

        await this.runStartupStage('audio', async () => {
            this.services.get(AUDIO_SERVICE).initialize();
        });

        if (App.activeInstance !== this) {
            platform.dispose();
            return;
        }

        const configService = this.services.get(CONFIG_SERVICE);
        const gameRegistry = this.services.get(GAME_REGISTRY_SERVICE);

        await configService.load();

        if (App.activeInstance !== this) {
            platform.dispose();
            return;
        }

        await this.runStartupStage('game-catalog', async () => {
            const manifests = await configService.loadGameManifests();
            gameRegistry.load(manifests);
        });

        if (App.activeInstance !== this) {
            platform.dispose();
            return;
        }

        this.lifecycleUnsubscribes.push(
            platform.onHide(this.handlePlatformHide),
            platform.onShow(this.handlePlatformShow),
        );

        await this.runStartupStage(
            'lobby',
            // First paint goes directly to the lobby. Loading remains enabled
            // for later game entry, restart and return-to-lobby transitions.
            () => this.services.get(GAME_RUNTIME_SERVICE).enterLobby(false),
        );
    }

    private async runStartupStage<TValue>(
        stage: AppStartupStage,
        operation: () => Promise<TValue>,
    ): Promise<TValue> {
        try {
            return await operation();
        } catch (cause: unknown) {
            throw new AppStartupStageError(stage, cause);
        }
    }

    private readonly handlePlatformHide = (): void => {
        this.services.get(AUDIO_SERVICE).onHide();
        this.services.get(AD_SERVICE).onHide();
        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);

        if (stateMachine.currentState !== 'playing') {
            return;
        }

        this.pausedByPlatform = stateMachine.transition('paused');
    };

    private readonly handlePlatformShow = (): void => {
        this.services.get(AUDIO_SERVICE).onShow();
        this.services.get(AD_SERVICE).onShow();
        const shouldResume = this.pausedByPlatform;
        this.pausedByPlatform = false;

        if (!shouldResume) {
            return;
        }

        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);

        if (stateMachine.currentState === 'paused') {
            stateMachine.transition('playing');
        }
    };

    private clearLifecycleListeners(): void {
        for (const unsubscribe of this.lifecycleUnsubscribes.splice(0)) {
            unsubscribe();
        }

        this.pausedByPlatform = false;
    }

    private createAudioSource(root: Node, name: string): AudioSource {
        const existing = root.getChildByName(name);
        const node = existing ?? new Node(name);

        if (!existing) {
            node.parent = root;
        }

        return node.getComponent(AudioSource) ?? node.addComponent(AudioSource);
    }

    private handleStartupFailure(
        stage: AppStartupFailure['stage'],
        cause: unknown,
    ): void {
        if (App.activeInstance !== this || this.startupFailure) {
            return;
        }

        const message = cause instanceof Error ? cause.message : String(cause);
        this.startupFailure = Object.freeze({ stage, message, cause });

        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);
        stateMachine.transition('error');
        this.showStartupFailure();
        console.error(`[App] Startup failed at ${stage}: ${message}`, cause);
    }

    private showStartupFailure(): void {
        const errorView = find('Canvas/ErrorLayer', this.node)?.getComponent(ErrorView);
        const loadingView = find('Canvas/LoadingLayer', this.node)?.getComponent(LoadingView);
        loadingView?.hide();
        if (!errorView) {
            console.error('[App] Startup error dialog is missing.');
            return;
        }
        errorView.show(Object.freeze({
            title: '启动失败',
            message: '暂时无法完成初始化\n请稍后重新进入游戏',
        }));
    }
}
