import { MiniGamePlatform } from './MiniGamePlatform';
import {
    adaptTapMiniGameApi,
    requireTapMiniGameApi,
    type TapMiniGameApi,
} from './TapMiniGameApi';
import { TapLoginSession } from './TapLoginSession';
import type { Unsubscribe } from '../core/types/CommonTypes';

export interface TapMiniGamePlatformOptions {
    readonly api?: TapMiniGameApi;
    readonly designWidth?: number;
}

/** Tap 平台生命周期、登录和布局；合集仍使用同一套应用状态机。 */
export class TapMiniGamePlatform extends MiniGamePlatform {
    private readonly resolveTapApi: () => TapMiniGameApi;
    private loginSession?: TapLoginSession;
    private unsubscribeLoginRefresh?: Unsubscribe;
    private starting?: Promise<void>;
    private generation = 0;
    private ready = false;

    constructor(options: TapMiniGamePlatformOptions = {}) {
        const resolveApi = (): TapMiniGameApi => options.api ?? requireTapMiniGameApi();
        super({ id: 'tap', designWidth: options.designWidth, getApi: () => adaptTapMiniGameApi(resolveApi()) });
        this.resolveTapApi = resolveApi;
    }

    initialize(): Promise<void> {
        if (this.ready) return Promise.resolve();
        if (this.starting) return this.starting;
        const generation = ++this.generation;
        const login = new TapLoginSession(this.resolveTapApi());
        this.loginSession = login;
        const operation = (async (): Promise<void> => {
            try {
                await super.initialize();
                await login.initialize();
                if (this.generation !== generation) throw new Error('Tap initialization was cancelled.');
                this.unsubscribeLoginRefresh = this.onShow(() => {
                    // 离线时继续允许本地玩法；需要账号的服务应自行等待有效登录态。
                    void login.refresh().catch(() => {});
                });
                this.ready = true;
            } catch (error: unknown) {
                login.dispose();
                if (this.generation === generation) super.dispose();
                throw error;
            }
        })();
        this.starting = operation;
        void operation.then(
            () => { if (this.starting === operation) this.starting = undefined; },
            () => { if (this.starting === operation) this.starting = undefined; },
        );
        return operation;
    }

    dispose(): void {
        ++this.generation;
        this.ready = false;
        this.starting = undefined;
        this.unsubscribeLoginRefresh?.();
        this.unsubscribeLoginRefresh = undefined;
        this.loginSession?.dispose();
        this.loginSession = undefined;
        super.dispose();
    }

    showShareMenu(): void {
        if (this.ready) this.resolveTapApi().setShareboardHidden?.({ hidden: false });
    }
}
