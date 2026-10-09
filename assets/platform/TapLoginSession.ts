import type { TapApiError, TapMiniGameApi } from './TapMiniGameApi';

const LOGIN_TIMEOUT_MS = 4500;

/** 获取平台登录凭证并检查过期；本地玩法不保存 code 或会话密钥。 */
export class TapLoginSession {
    private pending?: Promise<void>;
    private disposed = false;
    private readonly cancellations = new Set<() => void>();

    constructor(private readonly api: TapMiniGameApi) {}

    initialize(): Promise<void> {
        return this.run(false);
    }

    refresh(): Promise<void> {
        return this.run(true);
    }

    dispose(): void {
        this.disposed = true;
        Array.from(this.cancellations).forEach((cancel) => cancel());
        this.cancellations.clear();
    }

    private run(checkSession: boolean): Promise<void> {
        if (this.disposed) return Promise.reject(new Error('Tap login session is disposed.'));
        if (this.pending) return this.pending;
        const operation = this.authenticate(checkSession);
        this.pending = operation;
        void operation.then(
            () => { if (this.pending === operation) this.pending = undefined; },
            () => { if (this.pending === operation) this.pending = undefined; },
        );
        return operation;
    }

    private authenticate(checkSession: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            let settled = false;
            let loginRequested = false;
            const timer = setTimeout(() => finish(new Error('Tap login timed out.')), LOGIN_TIMEOUT_MS);
            const cancel = (): void => finish(new Error('Tap login was cancelled.'));
            const finish = (error?: Error): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.cancellations.delete(cancel);
                if (error) reject(error);
                else resolve();
            };
            const fail = (error: TapApiError): void => finish(new Error(
                error.errMsg ?? 'Tap login failed.',
            ));
            const login = (): void => {
                if (settled || this.disposed || loginRequested) return;
                loginRequested = true;
                try {
                    this.api.login({
                        timeout: LOGIN_TIMEOUT_MS,
                        success: (result) => finish(result.code?.trim()
                            ? undefined
                            : new Error('Tap login returned an empty code.')),
                        fail,
                    });
                } catch (error: unknown) {
                    finish(error instanceof Error ? error : new Error(String(error)));
                }
            };
            this.cancellations.add(cancel);
            if (checkSession && this.api.checkSession) {
                try {
                    this.api.checkSession({ success: () => finish(), fail: login });
                } catch (_error: unknown) {
                    login();
                }
            } else {
                login();
            }
        });
    }
}
