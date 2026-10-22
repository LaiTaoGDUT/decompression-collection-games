#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_ENDPOINT = 'http://127.0.0.1:3001/mcp';
const DEFAULT_FOLDER = 'db://assets';

function endpoint() {
    return process.env.COCOS_MCP_HTTP_URL || DEFAULT_ENDPOINT;
}

function timeoutMs() {
    const value = Number.parseInt(process.env.COCOS_MCP_HTTP_TIMEOUT_MS || '180000', 10);
    return Number.isFinite(value) && value > 0 ? value : 180000;
}

function requestJson(url, body) {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
        const request = transport.request(target, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (response) => {
            const chunks = [];
            response.setEncoding('utf8');
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const text = chunks.join('').trim();
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`Cocos MCP 返回 HTTP ${response.statusCode}: ${text}`));
                    return;
                }
                if (!text) {
                    reject(new Error('Cocos MCP 返回空响应'));
                    return;
                }
                try {
                    resolve(JSON.parse(text));
                } catch (error) {
                    reject(new Error(`Cocos MCP 响应无法解析: ${error.message}`));
                }
            });
        });

        request.setTimeout(timeoutMs(), () => {
            request.destroy(new Error(`Cocos 资源刷新超时（${timeoutMs()}ms）。请确认 Cocos Creator 已打开本项目。`));
        });
        request.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('无法连接 Cocos Creator。请先打开本项目，并确认编辑器 MCP 正在运行。'));
                return;
            }
            reject(error);
        });
        request.write(payload);
        request.end();
    });
}

function toolResult(response) {
    const text = response && response.result && response.result.content
        && response.result.content[0] && response.result.content[0].text;
    if (typeof text !== 'string') return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** 经项目 Cocos MCP 刷新资源。默认刷新 db://assets。 */
async function refreshCocos(folder = DEFAULT_FOLDER) {
    const response = await requestJson(endpoint(), {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
            name: 'assetAdvanced_asset_system',
            arguments: { action: 'refresh', folder },
        },
    });
    if (response.error) {
        throw new Error(response.error.message || 'Cocos 资源刷新失败');
    }
    const result = toolResult(response);
    if (!result || result.success === false) {
        throw new Error((result && result.error) || 'Cocos 资源刷新失败');
    }
    return result;
}

module.exports = { refreshCocos };
