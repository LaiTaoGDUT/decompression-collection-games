import type { Platform } from '../../platform/Platform';

/** 只有获取/保存两个请求；平台身份验证随请求完成，门槛前匿名获取只返回时间。 */
export class CloudSaveClient {
    private token?: string;
    private pending: Promise<void> = Promise.resolve();

    constructor(private readonly platform: Platform, private readonly baseUrl: string, private readonly timeoutMs: number) {
        if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9/_-]*)?$/i.test(baseUrl)) throw new Error('Invalid cloud server HTTPS URL.');
    }

    async call(value: unknown): Promise<unknown> {
        const request = value as { v: number; op: string; clockOnly?: boolean };
        if (request?.v !== 2 || ['load', 'save'].indexOf(request.op) < 0) throw new Error('Invalid cloud operation.');
        if (request.op === 'load' && request.clockOnly === true) return this.send('/v1/load', request);
        // 串行获取凭证，避免并发 wx.login 使尚未提交的一次性票据失效。
        const result = this.pending.then(() => this.authorized(request));
        this.pending = result.then(() => {}, () => {});
        return result;
    }

    private async authorized(request: { op: string }): Promise<unknown> {
        try { return await this.sendAuthorized(request); }
        catch (error) {
            if ((error as { statusCode?: number })?.statusCode !== 401) throw error;
            this.token = undefined;
            return this.sendAuthorized(request);
        }
    }

    private async sendAuthorized(request: { op: string }): Promise<unknown> {
        let auth;
        if (!this.token) {
            if (!this.platform.getCloudLoginCredential) throw new Error('Cloud login is unsupported.');
            const credential = await this.platform.getCloudLoginCredential();
            if (!credential || !/^[a-z][a-z0-9-]{1,31}$/.test(credential.platform)
                || typeof credential.code !== 'string' || !credential.code || credential.code.length > 2048) {
                throw new Error('Invalid platform login credential.');
            }
            auth = { platform: credential.platform, code: credential.code };
        }
        // 凭证只附加在网络副本上，不写进可重试的进度/时长快照。
        const response = await this.send(request.op === 'load' ? '/v1/load' : '/v1/save',
            auth ? { ...request, auth } : request, this.token ? { Authorization: 'Bearer ' + this.token } : undefined);
        if (auth) {
            const token = (response as { token?: unknown })?.token;
            if (typeof token !== 'string' || !token) throw new Error('Invalid cloud login response.');
            this.token = token;
        }
        return response;
    }

    private send(path: string, data: unknown, headers?: Readonly<Record<string, string>>): Promise<unknown> {
        if (!this.platform.requestJson) return Promise.reject(new Error('Cloud network is unsupported.'));
        return this.platform.requestJson({ url: this.baseUrl.replace(/\/$/, '') + path, method: 'POST', data, headers, timeoutMs: this.timeoutMs });
    }
}
