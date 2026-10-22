'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('./core.cjs');

function loadTypeScript() {
    try { return require('typescript'); } catch (_) { /* 使用项目现有的 tsc。 */ }
    try {
        const location = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['tsc'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
        const compiler = fs.realpathSync(location);
        for (const candidate of [
            path.resolve(path.dirname(compiler), '../lib/typescript.js'),
            path.resolve(path.dirname(compiler), 'node_modules/typescript/lib/typescript.js'),
        ]) if (fs.existsSync(candidate)) return require(candidate);
    } catch (_) { /* 下面给出可操作的错误。 */ }
    throw new Error('找不到 TypeScript 编译器，请先安装 TypeScript 并确保 tsc 可以运行');
}

/** 与游戏运行时共用纯数据规则，依赖范围固定，不能加载业务脚本。 */
function createRulesLoader(root = ROOT) {
    const modules = [
        'assets/runtime/GameManifest.ts',
        'assets/runtime/GameManifestValidator.ts',
        'assets/core/version/SemanticVersion.ts',
        'assets/app/AppConfig.ts',
    ].map((file) => path.join(root, file));
    const allowed = new Set(modules);
    let cachedSources;
    let cachedRules;
    return function rules() {
        const sources = modules.map((file) => fs.readFileSync(file, 'utf8'));
        if (cachedSources && sources.every((source, index) => source === cachedSources[index])) return cachedRules;

        // 任一依赖变化都从同一份源码快照重建整个模块图，避免校验器仍引用旧枚举。
        const ts = loadTypeScript();
        const snapshot = new Map(modules.map((file, index) => [file, sources[index]]));
        const cache = new Map();
        function load(file) {
            if (!allowed.has(file)) throw new Error('配置校验依赖了非数据模块：' + file);
            if (cache.has(file)) return cache.get(file);
            const exports = {};
            cache.set(file, exports);
            const code = ts.transpileModule(snapshot.get(file), {
                compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
                fileName: file,
            }).outputText;
            vm.runInNewContext(code, {
                exports,
                require: (name) => load(path.resolve(path.dirname(file), name + '.ts')),
            }, { filename: file });
            return exports;
        }
        const loadedRules = Object.assign({}, ...modules.map(load));
        // 仅成功加载后替换缓存；源码读取或执行失败时不能继续使用过期规则。
        cachedSources = sources;
        cachedRules = loadedRules;
        return cachedRules;
    };
}

module.exports = { rules: createRulesLoader(), createRulesLoader };
