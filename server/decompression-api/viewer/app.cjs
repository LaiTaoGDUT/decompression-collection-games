'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/viewer.js', ['viewer.js', 'text/javascript; charset=utf-8']],
    ['/viewer.css', ['viewer.css', 'text/css; charset=utf-8']],
].map(([url, [name, type]]) => [url, { body: fs.readFileSync(path.join(__dirname, name)), type }]));

function createViewerServer({ store, onError = () => {} }) {
    return http.createServer({ requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        const send = (status, value) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(value));
        };
        // Host/Origin 限制防止恶意网页通过 DNS rebinding 读取本机数据。
        const hosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
        if (!hosts.includes(req.headers.host) || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)
            || (req.url.startsWith('/api/') && req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])))
            return send(403, { error: '仅允许本机页面访问。' });
        if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: '此页面仅支持读取。' }); }
        try {
            const url = new URL(req.url, 'http://' + req.headers.host);
            if (url.pathname === '/health') return send(200, { ok: true, service: 'decompression-data', readOnly: true });
            const asset = assets.get(url.pathname);
            if (asset) { res.writeHead(200, { 'Content-Type': asset.type }); return res.end(asset.body); }
            if (url.pathname === '/api/overview') return send(200, await store.overview());
            if (url.pathname === '/api/saves') {
                const page = url.searchParams.get('page') ?? '1', prefix = (url.searchParams.get('prefix') ?? '').trim();
                if (!/^[1-9]\d{0,5}$/.test(page) || !/^[a-f0-9]{0,64}$/.test(prefix)) return send(400, { error: '页码或账号前缀无效。' });
                return send(200, await store.saves({ page: Number(page), prefix }));
            }
            const match = /^\/api\/saves\/([a-f0-9]{64})$/.exec(url.pathname);
            if (match) {
                const account = await store.account(match[1]);
                return send(account ? 200 : 404, account ?? { error: '账号存档不存在。' });
            }
            return send(404, { error: '页面不存在。' });
        } catch (error) { onError(error); return send(503, { error: '读取失败，请稍后刷新或查看服务日志。' }); }
    });
}
module.exports = { createViewerServer };
