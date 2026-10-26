'use strict';
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { fail } = require('./protocol.cjs');

const PLATFORM_ID = /^[a-z][a-z0-9-]{1,31}$/;

function createAuth({ providers, tokenSecret, now = Date.now }) {
    if (typeof tokenSecret !== 'string' || tokenSecret.length < 32) throw new Error('TOKEN_SECRET needs at least 32 characters');
    const registry = new Map();
    for (const provider of providers) {
        if (!PLATFORM_ID.test(provider.platform) || typeof provider.appId !== 'string' || !provider.appId
            || typeof provider.exchangeCode !== 'function' || typeof provider.configured !== 'boolean'
            || registry.has(provider.platform)) throw new Error('Invalid or duplicate login provider');
        registry.set(provider.platform, provider);
    }
    const platforms = Object.freeze(Array.from(registry.values()).filter(provider => provider.configured).map(provider => provider.platform).sort());
    const sign = data => createHmac('sha256', tokenSecret).update(data).digest('base64url');
    function issue(uid, provider) {
        const body = Buffer.from(JSON.stringify({ v: 2, sub: uid, platform: provider.platform,
            app: provider.appId, exp: Math.floor(now() / 1000) + 86400 })).toString('base64url');
        return body + '.' + sign(body);
    }
    function verify(header) {
        if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 2048) fail('UNAUTHENTICATED', 401);
        const parts = header.slice(7).split('.');
        if (parts.length !== 2) fail('UNAUTHENTICATED', 401);
        const expected = Buffer.from(sign(parts[0])), actual = Buffer.from(parts[1]);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('UNAUTHENTICATED', 401);
        let value;
        try { value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { fail('UNAUTHENTICATED', 401); }
        // 已上线的 v1 凭证只按微信 AppID 验证，不能推断成其他平台。
        const platform = value?.v === 1 ? 'wechat' : value?.v === 2 ? value.platform : undefined;
        const provider = typeof platform === 'string' ? registry.get(platform) : undefined;
        if (!provider || value.app !== provider.appId || !/^[a-f0-9]{64}$/.test(value.sub)
            || !Number.isSafeInteger(value.exp) || value.exp <= Math.floor(now() / 1000)) fail('UNAUTHENTICATED', 401);
        return value.sub;
    }
    async function login(request) {
        if (!request || typeof request !== 'object' || Array.isArray(request)
            || Object.keys(request).some(key => key !== 'platform' && key !== 'code')) fail('INVALID_LOGIN_REQUEST');
        // 老客户端只发送 code；仅缺省字段走兼容路径，错误平台值不能回退微信。
        const platform = request.platform === undefined ? 'wechat' : request.platform;
        if (typeof platform !== 'string' || !PLATFORM_ID.test(platform)) fail('INVALID_LOGIN_PLATFORM');
        const provider = registry.get(platform);
        if (!provider) fail('UNSUPPORTED_LOGIN_PLATFORM');
        if (typeof request.code !== 'string' || !request.code || request.code.length > 2048
            || /[\s\x00-\x1f\x7f]/.test(request.code)) fail('INVALID_LOGIN_CODE');
        if (!provider.configured) fail('LOGIN_NOT_CONFIGURED', 503);
        const identity = await provider.exchangeCode(request.code);
        if (typeof identity?.subject !== 'string' || !identity.subject || identity.subject.length > 512
            || /[\x00-\x1f\x7f]/.test(identity.subject)) fail('PLATFORM_LOGIN_FAILED', 401);
        // 保留微信已上线主键；其他平台使用独立且无分隔歧义的命名空间。
        const source = platform === 'wechat' ? provider.appId + ':' + identity.subject
            : JSON.stringify(['cloud-save', 1, platform, provider.appId, identity.subject]);
        const uid = createHash('sha256').update(source).digest('hex');
        // openid/session_key/AppSecret 均不返回客户端，也不写请求日志。
        return { token: issue(uid, provider), expiresIn: 86400 };
    }
    return { login, verify, platforms, configured: platforms.length > 0 };
}
module.exports = { createAuth };
