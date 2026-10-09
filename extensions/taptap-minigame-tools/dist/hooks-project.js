// 项目准备在官方压缩前执行；转换和 ZIP 生成均只执行一次。
const official = require('./hooks');
const projectPath = require.resolve('../../../scripts/tap/prepare.cjs');

function beforePack(game) {
    delete require.cache[projectPath];
    return require(projectPath).prepare(game);
}

exports.throwError = official.throwError;
exports.onBeforeBuild = official.onBeforeBuild;
exports.onAfterBuild = async function (options, result) {
    await official.onAfterBuild({ ...options, tapBeforePack: beforePack }, result);
};
