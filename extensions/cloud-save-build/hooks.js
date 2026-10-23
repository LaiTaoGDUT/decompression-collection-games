'use strict';

exports.throwError = true;

exports.onAfterBuild = async function (options, result) {
    // Tap 复用微信构建器，但不使用微信 CloudBase。
    if (options.platform !== 'wechatgame'
        || options.packages?.['taptap-minigame-tools']?.enableTapConvert) return;

    // Creator 复用构建进程，每次构建读取最新的准备脚本。
    const preparePath = require.resolve('../../project-scripts/cloud-save/prepare.cjs');
    delete require.cache[preparePath];
    const { prepare, prepareWeChatProject } = require(preparePath);
    prepare();
    const destination = prepareWeChatProject(result.dest);
    console.log(`[云存档] 部署文件与工程配置已准备：${destination}`);
};
