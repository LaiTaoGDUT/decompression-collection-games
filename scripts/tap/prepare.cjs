const fs = require('node:fs');
const path = require('node:path');

const extension = path.resolve(__dirname, '../../extensions/taptap-minigame-tools');

function filesIn(folder) {
    return fs.readdirSync(folder, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.')).flatMap(entry => {
        const file = path.join(folder, entry.name);
        return entry.isDirectory() ? filesIn(file) : [file];
    });
}

/** 只列出 Cocos 启动、引擎和官方版本检查文件；业务 Bundle 由平台服务区分宿主。 */
function engineScripts(game) {
    const names = ['game.js', 'web-adapter.js', 'engine-adapter.js', 'first-screen.js', 'cache-manager.js', 'check-version.js'];
    const files = names.map(name => path.join(game, name)).filter(file => fs.existsSync(file));
    const engine = path.join(game, 'cocos-js');
    if (fs.existsSync(engine)) files.push(...filesIn(engine).filter(file => file.endsWith('.js')));
    return files;
}

/** 转换引擎的全局 API 引用，不替换字符串或局部同名变量，也不再执行语法降级。 */
function adaptEngineJavaScript(source, filename, babel) {
    return babel.transformSync(source, {
        filename, configFile: false, babelrc: false, sourceType: 'unambiguous',
        compact: true, comments: false,
        plugins: [({ types: t }) => ({ visitor: {
            ReferencedIdentifier(nodePath) {
                if (nodePath.node.name === 'wx' && !nodePath.scope.hasBinding('wx')) nodePath.node.name = 'tap';
            },
            CallExpression: { exit(nodePath) {
                const callee = nodePath.node.callee;
                if (t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'tap' })
                    && t.isIdentifier(callee.property, { name: 'getSystemInfoSync' }) && !nodePath.scope.hasBinding('tap')) {
                    nodePath.node.callee = t.memberExpression(t.identifier('GameGlobal'), t.identifier('__tapCocosGetSystemInfo'));
                }
            } },
            AssignmentExpression(nodePath) {
                const left = nodePath.node.left;
                if (path.basename(filename).startsWith('web-adapter')
                    && t.isMemberExpression(left) && t.isIdentifier(left.property, { name: 'isSubContext' })) {
                    // Tap 没有微信开放数据域，getOpenDataContext 缺失不代表当前是子域。
                    nodePath.node.right = t.booleanLiteral(false);
                }
            },
        } })],
    }).code;
}

/** 官方转换器压缩前处理最终 game 目录；目录创建、版本、语法转换和 ZIP 均由官方负责。 */
function prepare(game) {
    const remote = path.join(game, 'remote');
    if (fs.existsSync(remote)) fs.renameSync(remote, path.join(path.dirname(game), 'remote'));

    const configPath = path.join(game, 'game.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.subPackages = Array.from(config.subpackages ?? config.subPackages ?? []);
    delete config.subpackages;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const babel = require(path.join(extension, 'converter/node_modules/@babel/core'));
    for (const file of engineScripts(game)) {
        const source = fs.readFileSync(file, 'utf8');
        if (/\bwx\b/.test(source) || /tap\.getSystemInfoSync\(/.test(source) || path.basename(file).startsWith('web-adapter')) {
            fs.writeFileSync(file, adaptEngineJavaScript(source, file, babel));
        }
    }
    fs.copyFileSync(path.join(__dirname, 'engine-compat.js'), path.join(game, 'tap-cocos-compat.js'));
    const entry = path.join(game, 'game.js');
    fs.writeFileSync(entry, `require('./tap-cocos-compat.js');\n${fs.readFileSync(entry, 'utf8')}`);
    console.log('[Tap项目] CDN 目录及 Cocos 兼容处理完成，交由官方生成 game.zip');
}

module.exports = { prepare, adaptEngineJavaScript, engineScripts };
