#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exec } = require('node:child_process');
const { AnnouncementStore } = require('./core.cjs');
const { GameCatalogStore } = require('./games.cjs');
const { AppConfigurationStore } = require('./app.cjs');
const { refreshCocos } = require('../cocos-refresh.cjs');

const DEFAULT_PORT = 4318;

function htmlFor(baseUrl, token) {
    const boot = JSON.stringify({ baseUrl, token }).replace(/</g, '\\u003c');
    return fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('/*__BOOT__*/ null', boot);
}

async function readBody(req) {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (body.length > 256 * 1024) throw new Error('请求内容过大');
    }
    return JSON.parse(body || '{}');
}

async function startServer(options = {}) {
    const store = options.store || new AnnouncementStore();
    const gameStore = options.gameStore || new GameCatalogStore({ root: store.root, announcements: store });
    const appStore = options.appStore || new AppConfigurationStore({ root: store.root });
    const refresh = options.refresh || refreshCocos;
    const token = crypto.randomBytes(24).toString('hex');
    let baseUrl = '';
    let busy = false;

    /** 写入游戏配置后刷新 Cocos；明确区分保存成功与刷新失败，允许重试刷新。 */
    async function syncRuntime(result) {
        if (!result.runtimeChanged) return { ...result, refreshed: false };
        try {
            await refresh();
            return { ...result, refreshed: true };
        } catch (error) {
            return { ...result, refreshed: false, refreshError: error.message };
        }
    }

    const server = http.createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const send = (status, data) => {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data));
        };
        try {
            if (req.headers.host !== baseUrl.slice('http://'.length)) return send(403, { error: '访问地址不匹配' });
            if (req.headers.origin && req.headers.origin !== baseUrl) return send(403, { error: '不允许此页面调用本地服务' });
            const url = new URL(req.url, baseUrl);
            if (req.method === 'GET' && url.pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(htmlFor(baseUrl, token));
            }
            if (req.method === 'GET' && ['/games.js', '/app.js', '/editor.css'].includes(url.pathname)) {
                res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' });
                return res.end(fs.readFileSync(path.join(__dirname, url.pathname.slice(1)), 'utf8'));
            }
            if (req.headers.authorization !== 'Bearer ' + token) {
                return send(403, { error: '页面连接已失效，请刷新页面' });
            }
            if (req.method === 'GET' && url.pathname === '/api/state') return send(200, store.state());
            if (req.method === 'GET' && url.pathname === '/api/games') return send(200, gameStore.state());
            if (req.method === 'GET' && url.pathname === '/api/app') return send(200, appStore.state());
            if (req.method === 'GET' && url.pathname === '/api/cover') {
                const cover = store.cover(url.searchParams.get('id') || '');
                if (!cover) return send(404, { error: '没有封面' });
                res.writeHead(200, { 'Content-Type': cover.type });
                return res.end(fs.readFileSync(cover.file));
            }
            if (req.method !== 'POST') return send(404, { error: '接口不存在' });
            if (busy) return send(409, { error: '正在处理，请稍候' });
            busy = true;
            try {
                const data = await readBody(req);
                let result;
                if (url.pathname === '/api/save') result = store.save(data.id || null, data.announcement);
                else if (url.pathname === '/api/games/save') result = gameStore.save(data.catalog, data.revision);
                else if (url.pathname === '/api/app/save') result = appStore.save(data.section, data.value, data.revision);
                else if (url.pathname === '/api/refresh') result = { runtimeChanged: true };
                else if (url.pathname === '/api/activate') result = store.activate(String(data.id || ''));
                else if (url.pathname === '/api/delete') result = store.remove(String(data.id || ''));
                else return send(404, { error: '接口不存在' });
                return send(200, { ...(await syncRuntime(result)), state: store.state() });
            } finally {
                busy = false;
            }
        } catch (error) {
            send(error.status || 400, { error: error.message, ...(error.errors?.length ? { errors: error.errors } : {}) });
        }
    });
    const port = options.port ?? Number(process.env.CONFIG_EDITOR_PORT || process.env.ANNOUNCEMENTS_PORT || DEFAULT_PORT);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    return { server, store, gameStore, appStore, baseUrl, token };
}

if (require.main === module) {
    startServer().then(({ baseUrl }) => {
        console.log('合集配置编辑已启动（游戏配置 / 版本公告 / 广告配置 / 发布与调试）：' + baseUrl);
        console.log('按 Ctrl+C 停止。');
        if (process.argv.includes('--no-open')) return;
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
        exec(`${opener} ${baseUrl}`);
    }).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { startServer };
