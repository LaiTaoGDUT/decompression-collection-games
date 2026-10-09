#!/usr/bin/env node
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { ROOT, scan, publicCatalog, prepare, hash } = require('./core.cjs');
const recommendations = require('./recommendations.cjs');

async function command(root, executable, args) {
    try { return await run(executable, args, { cwd: root, timeout: 180000, maxBuffer: 2 * 1024 * 1024 }); }
    catch (error) { throw new Error((error.stdout || error.stderr || error.message).trim().slice(0, 6000)); }
}
async function refreshCocos() {
    const bridgeConfig = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));
    const url = bridgeConfig.mcpServers?.cocos_creator_stdio?.env?.COCOS_MCP_HTTP_URL ?? 'http://127.0.0.1:3001/mcp';
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: {
            name: 'assetAdvanced_asset_system', arguments: { action: 'refresh', folder: 'db://assets' },
        } }), signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error('Cocos MCP HTTP ' + response.status);
    const result = await response.json();
    if (result.error || result.result?.isError) throw new Error('Cocos 资源刷新失败：' + JSON.stringify(result));
    const blocks = result.result?.content;
    if (!Array.isArray(blocks)) throw new Error('Cocos MCP 返回内容不完整');
    let confirmed = false;
    for (const block of blocks) {
        if (block.type !== 'text') continue;
        try { const data = JSON.parse(block.text); if (data.success === false) throw new Error(data.message); if (data.success === true) confirmed = true; }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    if (!confirmed) throw new Error('Cocos 未确认资源刷新成功');
}
function fontSettings(root) {
    const file = path.join(root, 'local/copy-review/config.json');
    const local = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return { source: process.env.COPY_REVIEW_FONT_SOURCE || local.fontSource,
        python: process.env.COPY_REVIEW_PYTHON || local.python || 'python3' };
}
async function updateFontsIfNeeded(root) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/configs/app.json'), 'utf8'));
    if (!config.fonts?.enabled) return;
    try { await command(root, process.execPath, ['project-scripts/fonts/verify-coverage.cjs']); return; }
    catch (error) {
        if (!error.message.includes('字体缺字')) throw error;
        const settings = fontSettings(root);
        if (!settings.source) throw new Error(error.message + '\n请配置 COPY_REVIEW_FONT_SOURCE（完整字体目录）和 COPY_REVIEW_PYTHON（装有 fontTools 的 Python），再应用。原文件会恢复。');
        await command(root, settings.python, ['project-scripts/fonts/update-fonts.py', settings.source]);
        await command(root, process.execPath, ['project-scripts/fonts/verify-coverage.cjs']);
    }
}
async function validateProject(root) {
    await command(root, 'tsc', ['--noEmit', '-p', 'tsconfig.json']);
    await command(root, 'git', ['-C', root, 'diff', '--check']);
}

class ApplyService {
    constructor(options = {}) {
        this.root = options.root || ROOT;
        this.validate = options.validate || (() => validateProject(this.root));
        this.refresh = options.refresh || refreshCocos;
        this.fonts = options.fonts || (() => updateFontsIfNeeded(this.root));
        this.busy = false; this.phase = '就绪'; this.lastApplication = null;
    }
    catalog() { return scan(this.root, recommendations); }
    status() { return { busy: this.busy, phase: this.phase, canUndo: !!this.lastApplication }; }
    async apply(version, changes) {
        if (this.busy) throw new Error('正在应用文案，请稍候');
        this.busy = true; this.phase = '校验文案与源码版本';
        try {
            const catalog = this.catalog();
            if (version !== catalog.version) throw new Error('源码已变化，请重新扫描。你的草稿会保留，冲突条目会单独显示。');
            const plan = prepare(catalog, changes, this.root);
            if (!plan.files.length) return { changedEntries: 0, changedFiles: 0, catalog: publicCatalog(catalog), ...this.status() };
            const result = await this.commit(plan.files, { changedEntries: plan.changedEntries, changes }, true);
            this.lastApplication = result.backupDirectory;
            return { ...result, catalog: publicCatalog(this.catalog()), canUndo: true };
        } finally { this.busy = false; this.phase = '就绪'; }
    }
    async commit(files, detail, updateFonts) {
        this.phase = '备份原文件';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
        const backupDirectory = path.join(this.root, 'local/copy-review/backups', stamp);
        fs.mkdirSync(backupDirectory, { recursive: true });
        const originals = new Map(files.map(f => [f.file, Buffer.from(f.original)]));
        if (updateFonts) for (const file of ['assets/shared-fonts/fonts/regular.ttf', 'assets/shared-fonts/fonts/bold.ttf', 'assets/shared-fonts/fonts/coverage.json']) {
            if (fs.existsSync(path.join(this.root, file))) originals.set(file, fs.readFileSync(path.join(this.root, file)));
        }
        for (const [file, original] of originals) {
            const target = path.join(backupDirectory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, original);
        }
        const manifest = { ...detail, createdAt: new Date().toISOString(), status: 'pending', files: [] };
        const written = new Map();
        try {
            this.phase = '写入文案';
            // Check all files together before the first mutation.
            for (const file of files) if (hash(fs.readFileSync(path.join(this.root, file.file))) !== hash(file.original)) throw new Error('文件发生冲突：' + file.file);
            for (const file of files) { fs.writeFileSync(path.join(this.root, file.file), file.value); written.set(file.file, hash(file.value)); }
            if (updateFonts) {
                this.phase = '检查字体覆盖';
                try { await this.fonts(); }
                finally {
                    for (const [file, original] of originals) if (!written.has(file) && hash(fs.readFileSync(path.join(this.root, file))) !== hash(original)) written.set(file, hash(fs.readFileSync(path.join(this.root, file))));
                }
            }
            this.phase = '检查 TypeScript 和差异格式'; await this.validate();
            for (const [file, expected] of written) if (hash(fs.readFileSync(path.join(this.root, file))) !== expected) throw new Error('校验期间文件发生冲突：' + file);
            this.phase = '刷新 Cocos 资源'; await this.refresh();
            manifest.status = 'applied';
            manifest.files = Array.from(written, ([file, newHash]) => ({ file, oldHash: hash(originals.get(file)), newHash }));
            fs.writeFileSync(path.join(backupDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
            return { changedEntries: detail.changedEntries, changedFiles: written.size, backupDirectory,
                validation: 'TypeScript、git diff --check、字体覆盖与 Cocos 资源刷新已通过' };
        } catch (error) {
            this.phase = '恢复原文件';
            const conflicts = [];
            for (const [file, expected] of written) {
                if (hash(fs.readFileSync(path.join(this.root, file))) === expected) fs.writeFileSync(path.join(this.root, file), originals.get(file));
                else conflicts.push(file);
            }
            let refreshError = '';
            try { await this.refresh(); } catch (failure) { refreshError = '\n恢复后的 Cocos 刷新尚未成功：' + failure.message; }
            manifest.status = 'rolled-back'; manifest.error = error.message; manifest.conflicts = conflicts;
            fs.writeFileSync(path.join(backupDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
            throw new Error((conflicts.length ? '应用失败，以下文件被外部修改，未覆盖：' + conflicts.join('、') : '应用失败，已恢复全部原文件。') + '\n' + error.message + refreshError);
        }
    }
    async undo() {
        if (this.busy || !this.lastApplication) throw new Error('当前没有可撤销的应用');
        this.busy = true;
        try {
            const directory = this.lastApplication;
            const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
            const files = manifest.files.map(item => {
                const original = fs.readFileSync(path.join(this.root, item.file));
                if (hash(original) !== item.newHash) throw new Error('应用后源码已变化，无法自动撤销：' + item.file);
                return { file: item.file, original, value: fs.readFileSync(path.join(directory, item.file)) };
            });
            const result = await this.commit(files, { changedEntries: manifest.changedEntries, undoOf: directory }, false);
            this.lastApplication = null;
            return { ...result, catalog: publicCatalog(this.catalog()), canUndo: false };
        } finally { this.busy = false; this.phase = '就绪'; }
    }
}
function htmlFor(catalog, baseUrl, token, status) {
    const boot = JSON.stringify({ catalog: publicCatalog(catalog), baseUrl, token, status }).replace(/</g, '\\u003c');
    return fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('/*__BOOT__*/ null', boot);
}
function saveSnapshot(service, baseUrl, token) {
    const target = path.join(service.root, 'local/copy-review/review.html');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, htmlFor(service.catalog(), baseUrl, token, service.status()));
    return target;
}
async function startServer(options = {}) {
    const service = options.service || new ApplyService();
    const token = crypto.randomBytes(32).toString('hex');
    let baseUrl = '';
    const allowedOrigin = origin => !origin || origin === 'null' || origin === baseUrl;
    const server = http.createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
        try {
            if (req.headers.host !== baseUrl.slice(7)) return send(403, { error: '访问地址不匹配' });
            if (!allowedOrigin(req.headers.origin)) return send(403, { error: '不允许此页面调用本地服务' });
            if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
            if (req.method === 'OPTIONS') {
                res.writeHead(204, { 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' }); return res.end();
            }
            if (req.method === 'GET' && req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(htmlFor(service.catalog(), baseUrl, token, service.status()));
            }
            if (req.headers.authorization !== 'Bearer ' + token) return send(403, { error: '页面连接已失效，请重新打开本地文案页面' });
            if (req.method === 'GET' && req.url === '/api/status') return send(200, service.status());
            if (req.method === 'GET' && req.url === '/api/catalog') {
                if (service.busy) return send(409, { error: '应用中，请稍候再扫描' });
                return send(200, { catalog: publicCatalog(service.catalog()), ...service.status() });
            }
            if (req.method === 'POST' && (req.url === '/api/apply' || req.url === '/api/undo')) {
                let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2 * 1024 * 1024) throw new Error('请求内容过大'); }
                const data = JSON.parse(body || '{}');
                const result = req.url === '/api/undo' ? await service.undo() : await service.apply(data.version, data.changes);
                if (options.saveSnapshot !== false) saveSnapshot(service, baseUrl, token);
                return send(200, result);
            }
            send(404, { error: '接口不存在' });
        } catch (error) { send(400, { error: error.message }); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? Number(process.env.COPY_REVIEW_PORT || 4317), '127.0.0.1', resolve); });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    if (options.saveSnapshot !== false) saveSnapshot(service, baseUrl, token);
    return { server, service, baseUrl, token };
}
if (require.main === module) {
    startServer().then(({ baseUrl }) => {
        console.log('文案审校已启动：' + baseUrl);
        console.log('HTML 文件：' + path.join(ROOT, 'local/copy-review/review.html'));
        console.log('按 Ctrl+C 停止；再次运行 npm run copy:review 可恢复。');
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { ApplyService, startServer, htmlFor, refreshCocos };
