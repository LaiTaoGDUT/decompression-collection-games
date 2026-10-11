#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exec } = require('node:child_process');
const { AnnouncementStore } = require('./core.cjs');
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
    const refresh = options.refresh || refreshCocos;
    const token = crypto.randomBytes(24).toString('hex');
    let baseUrl = '';
    let busy = false;

    /** 写入游戏内生效文件后刷新 Cocos；刷新失败只提示，不回滚已保存的公告。 */
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
            if (req.headers.authorization !== 'Bearer ' + token) {
                return send(403, { error: '页面连接已失效，请刷新页面' });
            }
            if (req.method === 'GET' && url.pathname === '/api/state') return send(200, store.state());
            if (req.method === 'GET' && url.pathname === '/api/cover') {
                const cover = store.cover(url.searchParams.get('id') || '');
                if (!cover) return send(404, { error: '没有封面' });
                res.writeHead(200, { 'Content-Type': cover.type });
                return res.end(fs.readFileSync(cover.file));
            }
            if (req.method !== 'POST') return send(404, { error: '接口不存在' });
            if (busy) return send(409, { error: '正在保存，请稍候' });
            busy = true;
            try {
                const data = await readBody(req);
                let result;
                if (url.pathname === '/api/save') result = store.save(data.id || null, data.announcement);
                else if (url.pathname === '/api/activate') result = store.activate(String(data.id || ''));
                else return send(404, { error: '接口不存在' });
                return send(200, { ...(await syncRuntime(result)), state: store.state() });
            } finally {
                busy = false;
            }
        } catch (error) {
            send(400, { error: error.message });
        }
    });
    const port = options.port ?? Number(process.env.ANNOUNCEMENTS_PORT || DEFAULT_PORT);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    return { server, store, baseUrl, token };
}

if (require.main === module) {
    startServer().then(({ baseUrl }) => {
        console.log('版本公告编辑已启动：' + baseUrl);
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
