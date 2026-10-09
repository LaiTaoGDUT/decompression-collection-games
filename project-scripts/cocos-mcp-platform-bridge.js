#!/usr/bin/env node
'use strict';

/**
 * Cross-platform STDIO bridge for the legacy Cocos MCP HTTP server.
 *
 * Windows keeps using the checked-in PowerShell bridge. macOS/Linux use the
 * Node implementation below, so the project config does not contain an
 * OS-specific executable or absolute working directory.
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const readline = require('node:readline');

const endpoint = process.env.COCOS_MCP_HTTP_URL || 'http://127.0.0.1:3001/mcp';
const timeoutMs = Number.parseInt(process.env.COCOS_MCP_HTTP_TIMEOUT_MS || '180000', 10);
const supportedProtocolVersions = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

function log(message) {
    process.stderr.write(`[cocos-mcp-platform-bridge] ${message}\n`);
}

function getHealthEndpoint(rawEndpoint) {
    const target = new URL(rawEndpoint);
    target.pathname = target.pathname.replace(/\/mcp\/?$/i, '') + '/health';
    target.search = '';
    target.hash = '';
    return target;
}

function requestHttp(method, body) {
    const target = new URL(endpoint);
    const transport = target.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const request = transport.request(target, {
            method,
            headers: {
                Accept: 'application/json',
                ...(body === undefined ? {} : {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                }),
            },
        }, (response) => {
            const chunks = [];
            response.setEncoding('utf8');
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const responseBody = chunks.join('').trim();
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`Cocos MCP returned HTTP ${response.statusCode}: ${responseBody}`));
                    return;
                }
                if (!responseBody) {
                    reject(new Error('Cocos MCP returned an empty response'));
                    return;
                }
                resolve(responseBody);
            });
        });

        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`Cocos MCP request timed out after ${timeoutMs}ms`));
        });
        request.on('error', reject);
        if (body !== undefined) {
            request.write(body);
        }
        request.end();
    });
}

async function assertCocosServerReady() {
    const healthEndpoint = getHealthEndpoint(endpoint);
    const responseBody = await new Promise((resolve, reject) => {
        const transport = healthEndpoint.protocol === 'https:' ? https : http;
        const request = transport.get(healthEndpoint, (response) => {
            const chunks = [];
            response.setEncoding('utf8');
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const body = chunks.join('').trim();
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`health check returned HTTP ${response.statusCode}: ${body}`));
                    return;
                }
                resolve(body);
            });
        });
        request.setTimeout(timeoutMs, () => {
            request.destroy(new Error(`health check timed out after ${timeoutMs}ms`));
        });
        request.on('error', reject);
    });

    const health = JSON.parse(responseBody);
    if (health.status !== 'ok') {
        throw new Error(`health check returned an unexpected status: ${responseBody}`);
    }
}

function writeMessage(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeRawJson(rawJson) {
    const parsed = JSON.parse(rawJson);
    writeMessage(parsed);
}

function writeJsonRpcError(id, code, message) {
    writeMessage({
        jsonrpc: '2.0',
        id: id === undefined ? null : id,
        error: { code, message },
    });
}

async function handleMessage(message) {
    const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
    const id = hasId ? message.id : null;
    const method = typeof message.method === 'string' ? message.method : '';

    if (!method) {
        if (hasId) {
            writeJsonRpcError(id, -32600, 'Invalid Request: method is required');
        }
        return;
    }

    // MCP notifications do not need a response. Swallow them so the legacy
    // Cocos HTTP server never emits an invalid STDIO response.
    if (!hasId) {
        return;
    }

    switch (method) {
        case 'initialize': {
            await assertCocosServerReady();
            const requestedVersion = message.params && message.params.protocolVersion;
            const protocolVersion = supportedProtocolVersions.has(requestedVersion)
                ? requestedVersion
                : '2025-06-18';

            writeMessage({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: {
                        name: 'cocos-creator-stdio-bridge',
                        version: '1.0.0',
                    },
                    instructions: 'Keep Cocos Creator open with the project MCP server running on port 3001. Use the exposed tools for editor operations.',
                },
            });
            return;
        }
        case 'ping':
            writeMessage({ jsonrpc: '2.0', id, result: {} });
            return;
        case 'tools/list':
        case 'tools/call': {
            const responseBody = await requestHttp('POST', JSON.stringify(message));
            writeRawJson(responseBody);
            return;
        }
        default:
            writeJsonRpcError(id, -32601, `Method not found: ${method}`);
    }
}

function runWindowsBridge() {
    const scriptPath = path.join(__dirname, 'cocos-mcp-stdio-bridge.ps1');
    const candidates = [process.env.COCOS_MCP_POWERSHELL, 'powershell.exe', 'pwsh']
        .filter(Boolean);
    let candidateIndex = 0;

    const startNext = () => {
        const executable = candidates[candidateIndex++];
        if (!executable) {
            log('Unable to find PowerShell (tried COCOS_MCP_POWERSHELL, powershell.exe, pwsh).');
            process.exitCode = 1;
            return;
        }

        const child = spawn(executable, [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
        ], {
            env: process.env,
            stdio: 'inherit',
        });

        child.once('error', (error) => {
            if (candidateIndex < candidates.length) {
                startNext();
                return;
            }
            log(`PowerShell bridge failed to start: ${error.message}`);
            process.exitCode = 1;
        });
        child.once('exit', (code, signal) => {
            if (signal) {
                process.kill(process.pid, signal);
                return;
            }
            process.exitCode = code === null ? 1 : code;
        });
    };

    startNext();
}

function runNodeBridge() {
    const input = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
    });
    let queue = Promise.resolve();

    input.on('line', (line) => {
        if (!line.trim()) {
            return;
        }

        queue = queue.then(async () => {
            let message;
            try {
                message = JSON.parse(line);
            } catch (error) {
                writeJsonRpcError(null, -32700, `Parse error: ${error.message}`);
                return;
            }

            try {
                await handleMessage(message);
            } catch (error) {
                writeJsonRpcError(
                    Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null,
                    -32603,
                    `Cocos Creator MCP bridge error: ${error.message}`,
                );
            }
        });
    });
}

if (process.platform === 'win32') {
    runWindowsBridge();
} else {
    runNodeBridge();
}
