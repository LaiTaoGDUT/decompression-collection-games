'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function loadTypeScript() {
    try { return require('typescript'); } catch (_) { /* use the project's existing tsc */ }
    const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
    return require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
}
const ts = loadTypeScript();
const ROOT = path.resolve(__dirname, '../..');
const GROUPS = [
    { id: 'lobby', name: '游戏大厅', color: '#b76542' },
    { id: 'shared', name: '启动、加载与公共弹窗', color: '#6a768f' },
    { id: 'watermelon', name: '合成大西瓜果冻', color: '#5e8d60' },
    { id: 'chess-endless', name: '棋逢对手', color: '#7c7254' },
    { id: 'game2048', name: '霓虹 2048', color: '#7c69b4' },
    { id: 'sliding-puzzle', name: '木框拼图', color: '#a58459' },
    { id: 'catch', name: '桌面大清理', color: '#a87582' },
    { id: 'doodle-jump', name: '纸片跳跃', color: '#638ca6' },
    { id: 'bubble-shooter', name: '泡泡奇境', color: '#8c7cb5' },
    { id: 'meowdoku', name: '猫咪数独', color: '#c39056' },
];
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function filesUnder(root, relative = 'assets') {
    const result = [];
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        const name = relative + '/' + entry.name;
        if (name === 'assets/shared-fonts' || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) result.push(...filesUnder(root, name));
        else if (/\.(ts|json|scene|prefab)$/.test(name)) result.push(name);
    }
    return result.sort();
}
function scopeFor(file) {
    const game = file.match(/^assets\/games\/([^/]+)\//)?.[1];
    if (game) return game === 'twenty48' ? 'game2048' : game;
    return file.startsWith('assets/lobby/') ? 'lobby' : 'shared';
}
function contextFor(node, sf) {
    const parts = [];
    for (let parent = node.parent; parent; parent = parent.parent) {
        if ((ts.isMethodDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent)) && parent.name) {
            parts.unshift(parent.name.getText(sf));
            if (parts.length === 2) break;
        } else if (ts.isPropertyAssignment(parent)) parts.unshift(parent.name.getText(sf));
    }
    return parts.join(' / ').slice(0, 150);
}
function nonCopy(node, sf, file) {
    if (typeof node.text === 'string' && !/\p{Script=Han}/u.test(node.text) && /[\\/]|^state=/.test(node.text)) return true;
    if (ts.isLiteralTypeNode(node.parent)) return true;
    if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return true;
    // Frozen visual metadata is not player-facing text.
    if (file.endsWith('MeowdokuTheme.ts') && contextFor(node, sf).includes('MEOWDOKU_THEME /')) return true;
    if (file.endsWith('DesktopCleanupTheme.ts') && ts.isPropertyAssignment(node.parent) && node.parent.name.getText(sf) === 'name') return true;
    for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
        if (ts.isCallExpression(p) && /^(console\.|assert\b|debug\b)/.test(p.expression.getText(sf))) return true;
    }
    return false;
}
function englishCopy(node, sf) {
    const p = node.parent;
    if (ts.isPropertyAssignment(p) && /^(label|text|title|message|body|caption)$/.test(p.name.getText(sf))) return true;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && /\.string$/.test(p.left.getText(sf))) return true;
    if (ts.isCallExpression(p) && /(?:createLabel|label|createButton)$/.test(p.expression.getText(sf))) {
        const index = p.arguments.indexOf(node);
        if (index === 2 && /createLabel$/.test(p.expression.getText(sf))) return true;
    }
    return false;
}
function kindFor(text, context, file) {
    if (file === 'assets/resources/configs/games.json') return context.endsWith('.name') ? '游戏名称' : '大厅简介';
    if (/scene|prefab/.test(path.extname(file))) return '场景 / 预制体';
    if (/rule|tutorial|help|hint|explain|desc/i.test(context) || text.length > 55) return '规则 / 引导';
    if (/button|action|resume|restart|exit|close|next|cancel|apply/i.test(context) || /^(返回|继续|重新|开始|下一步|上一步|知道了|明白了|取消|关闭|结束|再来|看视频|看广告)/.test(text)) return '操作 / 按钮';
    if (/score|record|height|level|progress|title|stat|display|name/i.test(context)) return '标题 / 信息';
    return '状态 / 提示';
}
function scan(root = ROOT, recommendations = {}) {
    const occurrences = [], hashes = {}, sources = {};
    let ignored = 0;
    for (const file of filesUnder(root)) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const json = /\.(json|scene|prefab)$/.test(file);
        if (json && !/\.(scene|prefab)$/.test(file) && file !== 'assets/resources/configs/games.json') continue;
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, json ? ts.ScriptKind.JSON : ts.ScriptKind.TS);
        if (sf.parseDiagnostics.length) throw new Error('源文件解析失败：' + file);
        const local = [];
        function add(node, text, segments, scope, context) {
            const start = node.getStart(sf), line = sf.getLineAndCharacterOfPosition(start).line + 1;
            const lineStart = source.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = source.indexOf('\n', node.end);
            local.push({ file, line, start, end: node.end, text, scope, context, segments,
                syntax: json ? 'json' : ts.isTemplateExpression(node) ? 'template' : ts.isNoSubstitutionTemplateLiteral(node) ? 'backtick' : 'string',
                code: source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim().slice(0, 400) });
        }
        function visit(node, jsonPath = []) {
            if (json && ts.isPropertyAssignment(node)) {
                const key = node.name.text;
                const nextPath = jsonPath.concat(key);
                if (ts.isStringLiteral(node.initializer)) {
                    if (key === '_string' && node.initializer.text.trim()) {
                        // Cocos stores the node reference on the label object; record its serialized path too.
                        add(node.initializer, node.initializer.text, null, scopeFor(file), nextPath.join('.'));
                    } else if (file === 'assets/resources/configs/games.json' && (key === 'name' || key === 'description')) {
                        const id = node.parent.properties.find(p => p.name?.text === 'id')?.initializer?.text;
                        add(node.initializer, node.initializer.text, null, id ?? 'lobby', `${id}.${key}`);
                    }
                }
                ts.forEachChild(node.initializer, child => visit(child, nextPath));
                return;
            }
            if (!json && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
                let text = node.text, segments = null;
                if (ts.isTemplateExpression(node)) {
                    text = node.head.text + node.templateSpans.map((span, i) => `{${i}}` + span.literal.text).join('');
                    const literals = [node.head, ...node.templateSpans.map(span => span.literal)];
                    segments = literals.map((literal, i) => ({
                        start: literal.getStart(sf) + 1,
                        end: literal.end - (i === literals.length - 1 ? 1 : 2),
                        expression: i < node.templateSpans.length ? node.templateSpans[i].expression.getText(sf) : null,
                    }));
                }
                const hasChinese = /\p{Script=Han}/u.test(text);
                if (hasChinese || (/\p{L}/u.test(text) && englishCopy(node, sf))) {
                    if (nonCopy(node, sf, file)) ignored++;
                    else add(node, text, segments, scopeFor(file), contextFor(node, sf));
                }
            }
            ts.forEachChild(node, child => visit(child, jsonPath));
        }
        visit(sf);
        if (local.length) { hashes[file] = hash(source); sources[file] = source; occurrences.push(...local); }
    }
    const grouped = new Map();
    for (const location of occurrences) {
        const key = location.scope + '\0' + location.text;
        let entry = grouped.get(key);
        if (!entry) {
            const rec = recommendations[location.scope]?.[location.text] ?? recommendations.all?.[location.text];
            entry = { id: hash(key).slice(0, 20), scope: location.scope, original: location.text,
                recommendation: rec?.text && rec.text !== location.text ? rec.text : null,
                reason: rec?.text && rec.text !== location.text ? rec.reason : null,
                kind: kindFor(location.text, location.context, location.file), locations: [] };
            grouped.set(key, entry);
        }
        entry.locations.push(location);
    }
    const entries = Array.from(grouped.values());
    entries.sort((a, b) => GROUPS.findIndex(g => g.id === a.scope) - GROUPS.findIndex(g => g.id === b.scope)
        || a.locations[0].file.localeCompare(b.locations[0].file) || a.locations[0].start - b.locations[0].start);
    return { entries, groups: GROUPS, version: hash(JSON.stringify(hashes)), hashes, sources,
        stats: { entries: entries.length, occurrences: occurrences.length, files: Object.keys(hashes).length,
            recommendations: entries.filter(e => e.recommendation).length, ignored }, scannedAt: new Date().toISOString() };
}
function publicCatalog(catalog) {
    return { version: catalog.version, groups: catalog.groups, stats: catalog.stats, scannedAt: catalog.scannedAt,
        entries: catalog.entries.map(e => ({ ...e, locations: e.locations.map(({ file, line, context, code, segments, syntax }) =>
            ({ file, line, context, code, syntax, expressions: segments?.slice(0, -1).map(s => s.expression) ?? [] })) })) };
}
function placeholders(text) { return text.match(/\{(?:\d+|[A-Z][A-Z_\d]*)\}/g) ?? []; }
function validateText(entry, value) {
    if (typeof value !== 'string' || value.length > 4000 || !value.trim()) throw new Error('文案不能为空，且不得超过 4000 字：' + entry.original);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('文案包含不可见控制字符');
    if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(entry.original))) {
        throw new Error('请按原顺序保留动态占位符 ' + placeholders(entry.original).join('、') + '：' + entry.original);
    }
}
function escapeTemplate(text) { return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n'); }
function prepare(catalog, changes, root = ROOT) {
    if (!Array.isArray(changes)) throw new Error('changes 必须是数组');
    const entries = new Map(catalog.entries.map(e => [e.id, e]));
    const seen = new Set(), edits = new Map();
    let changedEntries = 0;
    for (const change of changes) {
        const entry = entries.get(change.id);
        if (!entry || seen.has(change.id)) throw new Error('文案条目不存在或重复，请刷新清单');
        seen.add(change.id); validateText(entry, change.value);
        if (entry.original === change.value) continue;
        changedEntries++;
        for (const loc of entry.locations) {
            if (!edits.has(loc.file)) edits.set(loc.file, []);
            const patches = edits.get(loc.file);
            if (loc.syntax === 'template') {
                const chunks = change.value.split(/\{\d+\}/);
                if (chunks.length !== loc.segments.length) throw new Error('模板格式不匹配');
                loc.segments.forEach((seg, i) => patches.push({ start: seg.start, end: seg.end, value: escapeTemplate(chunks[i]) }));
            } else patches.push({ start: loc.start, end: loc.end, value: loc.syntax === 'backtick' ? '`' + escapeTemplate(change.value) + '`' : JSON.stringify(change.value) });
        }
    }
    const files = [];
    for (const [file, patches] of edits) {
        const original = fs.readFileSync(path.join(root, file), 'utf8');
        if (hash(original) !== catalog.hashes[file]) throw new Error('源码已被其他操作修改，请重新扫描：' + file);
        patches.sort((a, b) => b.start - a.start);
        let value = original, lastStart = original.length + 1;
        for (const patch of patches) {
            if (patch.end > lastStart) throw new Error('文案修改范围重叠：' + file);
            value = value.slice(0, patch.start) + patch.value + value.slice(patch.end); lastStart = patch.start;
        }
        if (/\.(json|scene|prefab)$/.test(file)) JSON.parse(value);
        else {
            const parsed = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true);
            if (parsed.parseDiagnostics.length) throw new Error('修改后的 TypeScript 无法解析：' + file);
        }
        files.push({ file, original, value, occurrences: patches.length });
    }
    return { files, changedEntries };
}
module.exports = { ROOT, GROUPS, ts, hash, scan, publicCatalog, prepare, placeholders, validateText };
