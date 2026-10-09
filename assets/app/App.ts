import {
    _decorator,
    AudioSource,
    Component,
    director,
    find,
    Node,
    sys,
    view,
} from 'cc';
import {
    createServiceToken,
    ServiceContainer,
} from '../core/container/ServiceContainer';
import { AppStateMachine } from '../core/state/AppStateMachine';
import type { Unsubscribe } from '../core/types/CommonTypes';
import type { Platform } from '../platform/Platform';
import { WebPlatform } from '../platform/WebPlatform';
import { WeChatRewardedAdProvider } from '../platform/WeChatAdProvider';
import { WeChatPlatform } from '../platform/WeChatPlatform';
import { TapMiniGamePlatform } from '../platform/TapMiniGamePlatform';
import { isTapMiniGameEnvironment } from '../platform/TapMiniGameApi';
import { TapRewardedAdProvider } from '../platform/TapAdProvider';
import { GameRegistry } from '../runtime/GameRegistry';
import { GameLoader } from '../runtime/GameLoader';
import { GameRuntime, type PlatformSuspension } from '../runtime/GameRuntime';
import { FontService } from '../services/font/FontService';
import { AssetService } from '../services/asset/AssetService';
import { AudioService } from '../services/audio/AudioService';
import {
    AnalyticsService,
    ConsoleAnalyticsTransport,
} from '../services/analytics/AnalyticsService';
import {
    AD_PLACEMENTS,
    AdService,
    MockRewardedAdProvider,
    RewardedAdRouter,
    type RewardedAdProvider,
} from '../services/ads/AdService';
import { ConfigService } from '../services/config/ConfigService';
import { FeedbackService } from '../services/feedback/FeedbackService';
import { StorageService } from '../services/storage/StorageService';
import { AchievementService } from '../services/achievements/AchievementService';
import { AchievementArtService } from '../services/achievements/AchievementArtService';
import { AchievementAudioService } from '../services/achievements/AchievementAudioService';
import { AchievementCelebration } from '../shared/components/AchievementCelebration';
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
export const FONT_SERVICE = createServiceToken<FontService>('FontService');
export const ASSET_SERVICE = createServiceToken<AssetService>('AssetService');
export const GAME_LOADER_SERVICE = createServiceToken<GameLoader>('GameLoader');
export const GAME_RUNTIME_SERVICE = createServiceToken<GameRuntime>('GameRuntime');
export const STORAGE_SERVICE = createServiceToken<StorageService>('StorageService');
export const ACHIEVEMENT_SERVICE = createServiceToken<AchievementService>('AchievementService');
export const ACHIEVEMENT_ART_SERVICE = createServiceToken<AchievementArtService>('AchievementArtService');
export const ACHIEVEMENT_CELEBRATION_SERVICE = createServiceToken<AchievementCelebration>('AchievementCelebration');
export const ACHIEVEMENT_AUDIO_SERVICE = createServiceToken<AchievementAudioService>('AchievementAudioService');
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
    private platformHidden = false;
    /** 最近一次切后台时运行层的处理结果，回到前台按它决定是否自动继续。 */
    private platformSuspension: PlatformSuspension = 'none';
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
        // Publish the container before startup begins so asynchronous startup
        // failures can always be reported through the application services.
        this.container = container;
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
        const crossfadeMusicSource = this.createAudioSource(audioRoot, 'MusicCrossfadeChannel');
        const effectSource = this.createAudioSource(audioRoot, 'EffectChannel');
        let effectVoiceSequence = 0;
        const audioService = new AudioService(
            musicSource,
            effectSource,
            storageService,
            () => {
                const source = this.createAudioSource(audioRoot, `ScopedEffect-${effectVoiceSequence++}`);
                return { channel: source, dispose: () => { source.stop(); source.clip = null; source.node.destroy(); } };
            },
            crossfadeMusicSource,
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
        const gameLoader = new GameLoader();

        container.register(APP_STATE_MACHINE_SERVICE, stateMachine);
        container.register(PLATFORM_SERVICE, platform);
        container.register(CONFIG_SERVICE, configService);
        container.register(GAME_REGISTRY_SERVICE, new GameRegistry(platform.id === 'web'));
        container.register(ASSET_SERVICE, assetService);
        container.register(FONT_SERVICE, new FontService(assetService));
        container.register(GAME_LOADER_SERVICE, gameLoader);
        container.register(STORAGE_SERVICE, storageService);
        container.register(ACHIEVEMENT_SERVICE, new AchievementService(storageService));
        container.register(ACHIEVEMENT_ART_SERVICE, new AchievementArtService(assetService));
        container.register(ACHIEVEMENT_AUDIO_SERVICE, new AchievementAudioService(assetService, audioService));
        container.register(AUDIO_SERVICE, audioService);
        container.register(ANALYTICS_SERVICE, analyticsService);
        container.register(FEEDBACK_SERVICE, feedbackService);
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
        if (this.container?.has(ACHIEVEMENT_AUDIO_SERVICE)) {
            this.container.get(ACHIEVEMENT_AUDIO_SERVICE).dispose();
        }
        if (this.container?.has(ACHIEVEMENT_ART_SERVICE)) {
            this.container.get(ACHIEVEMENT_ART_SERVICE).dispose();
        }

        if (this.container?.has(STORAGE_SERVICE)) {
            this.container.get(STORAGE_SERVICE).dispose();
        }

        if (this.container?.has(AD_SERVICE)) {
            this.container.get(AD_SERVICE).dispose();
        }

        if (this.container?.has(PLATFORM_SERVICE)) {
            this.container.get(PLATFORM_SERVICE).dispose();
        }

        if (this.container?.has(AUDIO_SERVICE)) {
            this.container.get(AUDIO_SERVICE).dispose();
        }

        if (this.container?.has(FONT_SERVICE)) {
            this.container.get(FONT_SERVICE).dispose();
        }

        this.container = undefined;

        if (director.isPersistRootNode(this.node)) {
            director.removePersistRootNode(this.node);
        }
    }

    private createPlatform(): Platform {
        // Tap 的微信兼容环境可能仍报告 WECHAT_GAME，优先检测真实宿主能力。
        if (isTapMiniGameEnvironment()) {
            return new TapMiniGamePlatform();
        }
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            return new WeChatPlatform();
        }

        return new WebPlatform({ getViewportSize: () => view.getVisibleSize() });
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

        await this.services.get(FONT_SERVICE).initialize(configService.config.fonts);
        if (App.activeInstance !== this) return;

        // 广告 provider 依赖已经归一化的本地配置；Runtime 则依赖完整的
        // AdService，因此二者都在平台和配置完成后创建。
        this.registerAdService();
        this.registerGameRuntime();
        // 与清单/大厅并行准备两个短提示音；声音失败不会阻塞应用启动。
        void this.services.get(ACHIEVEMENT_AUDIO_SERVICE).prepare().catch(() => {});

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

        // 先接通应用暂停/恢复，再开放系统分享；大厅和各小游戏共用同一组回调。
        try {
            platform.showShareMenu(configService.config.sharing);
        } catch (error: unknown) {
            console.warn('[App] Failed to enable platform sharing.', error);
        }

        await this.runStartupStage(
            'lobby',
            // The persistent main-package loading surface stays visible while
            // WeChat downloads and launches the lobby subpackage.
            () => this.services.get(GAME_RUNTIME_SERVICE).enterLobby(true),
        );
    }

    private registerAdService(): void {
        const services = this.services;
        if (services.has(AD_SERVICE)) return;

        const platform = services.get(PLATFORM_SERVICE);
        const config = services.get(CONFIG_SERVICE).config;
        const wechatAds = config.ads.wechat;
        const useRealTapAds = platform.id === 'tap';
        const useMockAds = config.development.mockAds && !useRealTapAds;
        const useRealWeChatAds = platform.id === 'wechat'
            && !useMockAds;
        const mockRewarded = new MockRewardedAdProvider();
        const rewardedRoutes = Object.freeze([
            Object.freeze({
                gameId: 'watermelon',
                placement: AD_PLACEMENTS.watermelonRevive,
                adUnitId: wechatAds.watermelonReviveRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'chess-endless',
                placement: AD_PLACEMENTS.chessEndlessRevive,
                adUnitId: wechatAds.chessEndlessReviveRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'catch',
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                adUnitId: wechatAds.desktopCleanupRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'doodle-jump',
                placement: AD_PLACEMENTS.doodleJumpRevive,
                adUnitId: wechatAds.doodleJumpReviveRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'bubble-shooter',
                placement: AD_PLACEMENTS.bubbleShooterRevive,
                adUnitId: wechatAds.bubbleShooterReviveRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'game2048',
                placement: AD_PLACEMENTS.game2048ClearSmallTiles,
                adUnitId: wechatAds.game2048ClearSmallTilesRewarded.adUnitId,
            }),
            Object.freeze({
                gameId: 'meowdoku',
                placement: AD_PLACEMENTS.meowdokuTool,
                adUnitId: wechatAds.meowdokuToolRewarded.adUnitId,
            }),
        ]);
        const gameAdEnablement: Record<string, boolean> = {};
        Object.keys(config.ads.games).forEach((gameId) => {
            // Availability is owned by the per-game feature switch, not by
            // whether this game has a dedicated provider row.
            gameAdEnablement[gameId] = config.ads.games[gameId]?.enabled === true;
        });
        const providers: Record<string, RewardedAdProvider> = {};
        const tapRewarded = useRealTapAds ? new TapRewardedAdProvider({
            adUnitId: config.ads.tap.rewardedVideo.adUnitId,
            placements: rewardedRoutes.map((route) => route.placement),
        }) : undefined;
        rewardedRoutes.forEach((route) => {
            const configuredEnabled = config.ads.games[route.gameId]?.enabled === true;
            gameAdEnablement[route.gameId] = configuredEnabled;
            // 未配置的广告位在所有平台都不可用；只有显式开启模拟广告才允许模拟奖励。
            const adUnitId = useRealTapAds ? config.ads.tap.rewardedVideo.adUnitId : route.adUnitId;
            if (!adUnitId.trim() && !useMockAds) return;
            providers[route.placement] = tapRewarded ?? (useRealWeChatAds
                ? new WeChatRewardedAdProvider({
                    placement: route.placement,
                    adUnitId,
                })
                : mockRewarded);
        });
        const rewardedProvider = new RewardedAdRouter(providers);
        const adService = new AdService(
            services.get(APP_STATE_MACHINE_SERVICE),
            rewardedProvider,
            services.get(ANALYTICS_SERVICE),
            Object.freeze(gameAdEnablement),
            platform,
        );
        services.register(AD_SERVICE, adService);

        if (useRealTapAds) {
            // Tap 全平台共用一个激励视频实例，只预加载一次。
            const route = rewardedRoutes.find((entry) => adService.isEnabledForGame(entry.gameId));
            if (route) void adService.preloadRewarded({
                placement: route.placement,
                gameId: route.gameId,
            }).catch(() => {});
            return;
        }
        if (!useRealWeChatAds) return;

        rewardedRoutes.forEach((route) => {
            if (!adService.isEnabledForGame(route.gameId)) return;
            void adService.preloadRewarded({
                placement: route.placement,
                gameId: route.gameId,
            }).catch(() => {});
        });
    }

    private registerGameRuntime(): void {
        const services = this.services;

        if (services.has(GAME_RUNTIME_SERVICE)) {
            return;
        }

        const platform = services.get(PLATFORM_SERVICE);
        const loadingView = find('Canvas/LoadingLayer', this.node)
            ?.getComponent(LoadingView);
        loadingView?.setPlatformLayout(platform.getLayoutInfo());
        const errorView = find('Canvas/ErrorLayer', this.node)
            ?.getComponent(ErrorView);
        const pauseView = find('Canvas/PauseLayer', this.node)
            ?.getComponent(PauseView);
        const resultView = find('Canvas/ResultLayer', this.node)
            ?.getComponent(ResultView);
        const analytics = services.get(ANALYTICS_SERVICE);
        const runtime = new GameRuntime(
            services.get(APP_STATE_MACHINE_SERVICE),
            services.get(ASSET_SERVICE),
            services.get(GAME_LOADER_SERVICE),
            Object.freeze({
                assets: services.get(ASSET_SERVICE),
                fonts: services.get(FONT_SERVICE),
                audio: services.get(AUDIO_SERVICE),
                feedback: services.get(FEEDBACK_SERVICE),
                storage: services.get(STORAGE_SERVICE),
                achievements: services.get(ACHIEVEMENT_SERVICE),
                analytics,
                ads: services.get(AD_SERVICE),
                platform,
                deviceTier: platform.getDeviceProfile().tier,
            }),
            director,
            loadingView ?? undefined,
            errorView ?? undefined,
            pauseView ?? undefined,
            resultView ?? undefined,
            analytics,
        );

        services.register(GAME_RUNTIME_SERVICE, runtime);

        const canvas = find('Canvas', this.node);
        if (canvas) {
            const awardLayer = new Node('AchievementLayer');
            awardLayer.layer = canvas.layer;
            canvas.addChild(awardLayer);
            const celebration = awardLayer.addComponent(AchievementCelebration);
            celebration.configure({
                achievements: services.get(ACHIEVEMENT_SERVICE), runtime,
                art: services.get(ACHIEVEMENT_ART_SERVICE),
                audio: services.get(ACHIEVEMENT_AUDIO_SERVICE),
                stateMachine: services.get(APP_STATE_MACHINE_SERVICE), platform,
                feedback: services.get(FEEDBACK_SERVICE),
                manifests: () => services.get(GAME_REGISTRY_SERVICE).getPlayableGames(
                    platform.getDeviceProfile().tier, services.get(CONFIG_SERVICE).config.appVersion,
                    services.get(CONFIG_SERVICE).config.development.showDevelopmentGames),
            });
            services.register(ACHIEVEMENT_CELEBRATION_SERVICE, celebration);
        }
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
        this.platformHidden = true;
        this.platformSuspension = 'none';
        this.services.get(AD_SERVICE).onHide();
        const audio = this.services.get(AUDIO_SERVICE);
        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);

        if (stateMachine.currentState !== 'playing') {
            this.flushStorage();
            audio.onHide();
            return;
        }

        // 平台暂停要求当前 MiniGame 自行冻结，而不只是切换全局状态：
        // 小游戏可以拒绝暂停；一旦接受，运行层要么保留玩家可恢复的暂停界面，
        // 要么对声明 `backgroundPausePolicy === 'silent'` 的小游戏做无界面冻结，
        // 回到前台后由运行层自动继续。
        this.platformSuspension = this.suspendActiveGame();

        // 先暂停 MiniGame，让 AudioService 记录“游戏自身暂停”的来源，
        // 否则 onShow 会在暂停界面之下直接恢复音乐。
        this.flushStorage();
        audio.onHide();
    };

    private suspendActiveGame(): PlatformSuspension {
        try {
            return this.services.get(GAME_RUNTIME_SERVICE).suspendForPlatform();
        } catch (error: unknown) {
            // TODO: console.error('[App] Platform safety pause failed.', error);
            return 'none';
        }
    }

    private readonly handlePlatformShow = (): void => {
        const wasHidden = this.platformHidden;
        this.platformHidden = false;
        const audio = this.services.get(AUDIO_SERVICE);
        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);

        // 小游戏可能在切后台之后才加载完成：此时 hide 阶段没有可暂停的入口，
        // 因此要在前台音频恢复之前补做一次同样的安全暂停。
        if (wasHidden
            && this.platformSuspension === 'none'
            && stateMachine.currentState === 'playing') {
            this.platformSuspension = this.suspendActiveGame();
        }

        const suspension = this.platformSuspension;
        this.platformSuspension = 'none';

        // 静默冻结的对局没有可见的暂停界面，回到前台必须由运行层直接继续，
        // 否则玩家会看到一局无法操作的棋盘。
        if (suspension === 'suspended') {
            try {
                this.services.get(GAME_RUNTIME_SERVICE).resumeFromPlatformSuspension();
            } catch (error: unknown) {
                // TODO: console.error('[App] Silent platform resume failed.', error);
            }
        }

        // 玩家可见的暂停界面保留到玩家显式继续：前台恢复不关闭它，
        // 防止敌人、计时器或合成决策在屏幕就绪前推进。
        audio.onShow();
        this.services.get(AD_SERVICE).onShow();
    };

    private clearLifecycleListeners(): void {
        for (const unsubscribe of this.lifecycleUnsubscribes.splice(0)) {
            unsubscribe();
        }

        this.platformSuspension = 'none';
    }

    private flushStorage(): void {
        try {
            this.services.get(STORAGE_SERVICE).flush();
        } catch (error: unknown) {
            // 切后台不能因存储异常阻断音频暂停和平台生命周期。
            // TODO: console.error('[App] Storage flush failed.', error);
        }
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
        // TODO: console.error(`[App] Startup failed at ${stage}: ${message}`, cause);
    }

    private showStartupFailure(): void {
        const errorView = find('Canvas/ErrorLayer', this.node)?.getComponent(ErrorView);
        const loadingView = find('Canvas/LoadingLayer', this.node)?.getComponent(LoadingView);
        loadingView?.hide();
        if (!errorView) {
            // TODO: console.error('[App] Startup error dialog is missing.');
            return;
        }
        errorView.show(Object.freeze({
            title: '启动失败',
            message: "游戏暂时无法启动\n请稍后重新进入",
        }));
    }
}
