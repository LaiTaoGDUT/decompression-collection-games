'use strict';

// 字体构建和构建守卫共用的源码扫描器，不依赖本机的制作文档。
const fs = require('node:fs');
const path = require('node:path');

function collectProjectText(root, compilerPath) {
    const ts = require(compilerPath);
    const characters = new Set();
    const origins = {};
    const files = [];

    function add(text, origin) {
        for (const character of text) {
            if (/\p{C}/u.test(character)) continue;
            characters.add(character);
            const locations = origins[character] ??= [];
            if (!locations.includes(origin)) locations.push(origin);
        }
    }

    // 动态分数、计时、格式化数值和英文不能只依靠静态字符串来收集。
    add(Array.from({ length: 95 }, (_, i) => String.fromCodePoint(i + 32)).join(''), 'ASCII 基线');

    function scanScript(file, source) {
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        if (sf.parseDiagnostics.length) throw new Error('字体扫描无法解析源码：' + file);

        function ignored(node) {
            if (ts.isLiteralTypeNode(node.parent)) return true;
            if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return true;
            for (let parent = node.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
                if (ts.isCallExpression(parent) && /^(console\.|assert\b|debug\b)/.test(parent.expression.getText(sf))) return true;
            }
            return false;
        }

        function visit(node) {
            if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ignored(node)) {
                add(node.text, file + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1));
            } else if (ts.isTemplateExpression(node) && !ignored(node)) {
                for (const literal of [node.head, ...node.templateSpans.map(span => span.literal)]) {
                    add(literal.text, file + ':' + (sf.getLineAndCharacterOfPosition(literal.getStart(sf)).line + 1));
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(sf);
    }

    function scanJson(file, source) {
        const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON);
        if (sf.parseDiagnostics.length) throw new Error('字体扫描无法解析 JSON：' + file);
        const scene = /\.(scene|prefab)$/.test(file);
        function visit(node) {
            if (ts.isStringLiteral(node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
                const key = ts.isPropertyAssignment(node.parent) ? node.parent.name.text : undefined;
                if (scene ? key === '_string' : /\p{Script=Han}/u.test(node.text) || /^(name|description|label|text|title|message|body|caption)$/.test(key)) {
                    add(node.text, file + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1));
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(sf);
    }

    function walk(relative) {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = relative + '/' + entry.name;
            if (entry.isSymbolicLink() || file === 'assets/shared-fonts') continue;
            if (entry.isDirectory()) walk(file);
            else if (/\.(ts|json|scene|prefab)$/.test(file)) {
                files.push(file);
                const source = fs.readFileSync(path.join(root, file), 'utf8');
                if (file.endsWith('.ts')) scanScript(file, source);
                else scanJson(file, source);
            }
        }
    }
    walk('assets');
    return { characters, origins, files };
}

module.exports = { collectProjectText };
if (require.main === module) {
    const [root, compilerPath, output] = process.argv.slice(2);
    if (!root || !compilerPath || !output) {
        console.error('用法：node project-scripts/fonts/collect-text.cjs <项目目录> <typescript.js> <输出 JSON>');
        process.exitCode = 1;
    } else {
        const result = collectProjectText(root, compilerPath);
        fs.writeFileSync(output, JSON.stringify({ ...result,
            characters: Array.from(result.characters).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)),
        }, null, 2) + '\n');
    }
}
