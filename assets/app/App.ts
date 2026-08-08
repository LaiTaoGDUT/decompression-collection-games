import {
    _decorator,
    Component,
    director,
    find,
    Label,
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
import { ConfigService } from '../services/config/ConfigService';

const { ccclass } = _decorator;

export const PLATFORM_SERVICE = createServiceToken<Platform>('Platform');
export const APP_STATE_MACHINE_SERVICE = createServiceToken<AppStateMachine>(
    'AppStateMachine',
);
export const CONFIG_SERVICE = createServiceToken<ConfigService>('ConfigService');
export const GAME_REGISTRY_SERVICE = createServiceToken<GameRegistry>(
    'GameRegistry',
);

type AppStartupStage = 'startup' | 'platform-lifecycle' | 'game-catalog';

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

        container.register(APP_STATE_MACHINE_SERVICE, stateMachine);
        container.register(PLATFORM_SERVICE, platform);
        container.register(CONFIG_SERVICE, new ConfigService());
        container.register(GAME_REGISTRY_SERVICE, new GameRegistry());
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
        const stateMachine = this.services.get(APP_STATE_MACHINE_SERVICE);

        if (stateMachine.currentState !== 'playing') {
            return;
        }

        this.pausedByPlatform = stateMachine.transition('paused');
    };

    private readonly handlePlatformShow = (): void => {
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
        const labelNode = find('Canvas/LoadingLayer/StartupErrorLabel', this.node);
        const label = labelNode?.getComponent(Label);

        if (!labelNode || !label) {
            console.error('[App] Startup error label is missing.');
            return;
        }

        label.string = '启动失败\n请重新进入小游戏';
        labelNode.active = true;
    }
}
