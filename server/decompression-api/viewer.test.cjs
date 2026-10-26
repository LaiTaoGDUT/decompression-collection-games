'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createViewerServer } = require('./viewer/app.cjs');

test('local viewer serves only fixed assets and GET reports, validates input and rejects foreign origins', async () => {
    const calls = [], store = {
        overview: async () => { calls.push('overview'); return { counts: { accounts: '1' }, games: [] }; },
        saves: async args => { calls.push(args); return { rows: [], total: '0' }; },
        account: async id => { calls.push(id); return id.startsWith('a') ? { user_id: id } : undefined; },
    };
    const server = createViewerServer({ store });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const request = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }); req.on('error', reject); req.end();
    });
    try {
        let result = await request('/'); assert.equal(result.status, 200); assert.match(result.body, /游戏数据/);
        assert.equal(result.headers['cache-control'], 'no-store'); assert.match(result.headers['content-security-policy'], /frame-ancestors 'none'/);
        assert.equal((await request('/', { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' })).status, 200,
            'A browser may navigate from another site to the public shell; data requests still require same origin');
        assert.equal((await request('/viewer.js')).status, 200); assert.equal((await request('/viewer.css')).status, 200);
        assert.equal((await request('/api/overview')).status, 200); assert.deepEqual(calls, ['overview']);
        for (const headers of [{ Host: 'evil.example:' + port }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }])
            assert.equal((await request('/api/overview', headers)).status, 403);
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal((await request('/api/overview', {}, method)).status, 405);
        assert.deepEqual(calls, ['overview'], 'Blocked requests never reach the database');
        assert.equal((await request('/api/saves?page=2&prefix=abc')).status, 200); assert.deepEqual(calls[1], { page: 2, prefix: 'abc' });
        for (const path of ['/api/saves?page=0', '/api/saves?page=1e3', '/api/saves?prefix=%27%3BDROP', '/api/saves?page=1000000'])
            assert.equal((await request(path)).status, 400);
        assert.equal((await request('/api/saves/' + 'a'.repeat(64))).status, 200);
        assert.equal((await request('/api/saves/' + 'b'.repeat(64))).status, 404);
        for (const path of ['/.env', '/viewer/../index.cjs', '/api/query?sql=SELECT', '/api/saves/x']) assert.equal((await request(path)).status, 404);
        store.overview = async () => { throw Error('database password must never be sent'); };
        result = await request('/api/overview'); assert.equal(result.status, 503); assert.ok(!result.body.includes('password'));
    } finally { await new Promise(resolve => server.close(resolve)); }
});
