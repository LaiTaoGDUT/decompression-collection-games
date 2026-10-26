'use strict';
const { fail } = require('./protocol.cjs');

async function fetchSession(url, fetchImpl) {
    try {
        const response = await fetchImpl(url, { method: 'GET', headers: { 'content-type': 'application/json' },
            redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) fail('PLATFORM_LOGIN_UNAVAILABLE', 502);
        return await response.json();
    } catch { fail('PLATFORM_LOGIN_UNAVAILABLE', 502); }
}

function createWeChatProvider({ appId, appSecret, fetchImpl = fetch }) {
    if (!/^wx[0-9a-f]{16}$/.test(appId)) throw new Error('WX_APP_ID is invalid');
    return Object.freeze({
        platform: 'wechat', appId, configured: typeof appSecret === 'string' && appSecret.length >= 16,
        async exchangeCode(code) {
            if (!/^[A-Za-z0-9_-]{8,512}$/.test(code)) fail('INVALID_LOGIN_CODE');
            const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
            url.search = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' });
            const value = await fetchSession(url, fetchImpl);
            if (!value || value.errcode || typeof value.openid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value.openid)) {
                fail('PLATFORM_LOGIN_FAILED', 401);
            }
            return { subject: value.openid };
        },
    });
}

function createDouyinProvider({ appId, appSecret, fetchImpl = fetch }) {
    if (!/^tt[A-Za-z0-9]{8,64}$/.test(appId)) throw new Error('TT_APP_ID is invalid');
    return Object.freeze({
        platform: 'douyin', appId, configured: typeof appSecret === 'string' && appSecret.length >= 16,
        async exchangeCode(code) {
            // 小游戏接口；小程序 v2 POST 接口与此协议不同。
            // https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/log-in/code-2-session
            const url = new URL('https://minigame.zijieapi.com/mgplatform/api/apps/jscode2session');
            url.search = new URLSearchParams({ appid: appId, secret: appSecret, code });
            const value = await fetchSession(url, fetchImpl);
            // 不把 anonymous_openid 当成可跨设备同步的账号身份。
            if (!value || value.error !== 0 || value.errcode || typeof value.openid !== 'string' || !value.openid) {
                fail('PLATFORM_LOGIN_FAILED', 401);
            }
            return { subject: value.openid };
        },
    });
}

function createLoginProviders(env, options = {}) {
    const providers = [];
    if (env.WX_APP_SECRET && !env.WX_APP_ID) throw new Error('WX_APP_ID is required');
    if (env.TT_APP_SECRET && !env.TT_APP_ID) throw new Error('TT_APP_ID is required');
    if (env.WX_APP_ID) providers.push(createWeChatProvider({ appId: env.WX_APP_ID, appSecret: env.WX_APP_SECRET, ...options }));
    if (env.TT_APP_ID) providers.push(createDouyinProvider({ appId: env.TT_APP_ID, appSecret: env.TT_APP_SECRET, ...options }));
    return providers;
}

module.exports = { createWeChatProvider, createDouyinProvider, createLoginProviders };
