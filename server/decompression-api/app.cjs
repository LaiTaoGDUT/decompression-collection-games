'use strict';
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { fail, envelope, validateSave } = require('./protocol.cjs');

async function readJson(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) fail('JSON_REQUIRED', 415);
    const chunks = []; let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > 65536) fail('REQUEST_TOO_LARGE', 413);
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('INVALID_JSON'); }
}

function createServer({ store, auth, now = Date.now, log = console.log }) {
    const server = http.createServer(async (request, response) => {
        const started = performance.now(), requestId = randomUUID();
        const path = (request.url ?? '/').split('?')[0];
        const business = path === '/v1/load' || path === '/v1/save';
        const send = (status, value) => {
            response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff', 'X-Request-Id': requestId,
                ...(business ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization' } : {}) });
            response.end(JSON.stringify(value));
        };
        try {
            if (request.method === 'GET' && (path === '/health' || path === '/ready')) {
                await store.ready();
                return send(path === '/ready' && !auth.configured ? 503 : 200,
                    envelope({ service: 'decompression-api', database: true, loginConfigured: auth.configured, loginPlatforms: auth.platforms }, now()));
            }
            if (!business) fail('NOT_FOUND', 404);
            if (request.method === 'OPTIONS') return send(204);
            if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED', 405);
            const body = await readJson(request);
            if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_REQUEST');
            const { auth: credential, ...operation } = body;
            if (path === '/v1/load') {
                if (operation.v !== 2 || operation.op !== 'load'
                    || Object.keys(operation).some(key => !['v', 'op', 'clockOnly'].includes(key))
                    || (operation.clockOnly !== undefined && typeof operation.clockOnly !== 'boolean')) fail('INVALID_REQUEST');
                // 门槛前只返回可信日期，不验证平台身份，也不访问玩家存档。
                if (operation.clockOnly === true) {
                    if (credential !== undefined || request.headers.authorization !== undefined) fail('INVALID_REQUEST');
                    return send(200, envelope({ clockOnly: true }, now()));
                }
            } else {
                // 先验证保存批次，再消耗平台的一次性登录票据。
                validateSave(operation);
            }
            if (credential !== undefined && request.headers.authorization !== undefined) fail('INVALID_REQUEST');
            const session = credential === undefined ? undefined : await auth.login(credential);
            const uid = auth.verify(session ? 'Bearer ' + session.token : request.headers.authorization);
            const result = path === '/v1/load' ? await store.load(uid) : await store.save(uid, operation);
            return send(200, envelope({ ...result, ...session }, now()));
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : 503;
            const code = Number.isInteger(error.status) ? error.code : 'SERVICE_UNAVAILABLE';
            send(status, { v: 2, ok: false, error: code, requestId });
        } finally {
            // 不记录请求正文、用户标识、登录 code、token 或平台接口 URL。
            log(JSON.stringify({ requestId, method: request.method, path, status: response.statusCode,
                durationMs: Math.round(performance.now() - started) }));
        }
    });
    server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
    return server;
}
module.exports = { createServer, readJson };
