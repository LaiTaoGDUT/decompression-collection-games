const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const compiler = fs.realpathSync(execFileSync('which', ['tsc'], { encoding: 'utf8' }).trim());
const ts = require(path.resolve(path.dirname(compiler), '../lib/typescript.js'));
const cache = new Map();
function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, { exports, require: name => {
        if (name === 'cc') return { sys: {}, Director: {}, director: {} };
        assert.ok(name.startsWith('.'), `Unexpected runtime dependency: ${name}`);
        return load(path.resolve(path.dirname(file), name + '.ts'));
    }, Date, setTimeout, clearTimeout, setInterval, clearInterval, console });
    return exports;
}
module.exports = { load, root, plain: value => JSON.parse(JSON.stringify(value)) };
