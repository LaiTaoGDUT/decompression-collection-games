'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function isWeChatRelease(options) {
    // TapTap 复用微信构建器，但最终发布到独立的运行环境。
    return options.platform === 'wechatgame'
        && !options.packages?.['taptap-minigame-tools']?.enableTapConvert;
}

exports.throwError = true;

exports.onBeforeBuild = async function (options) {
    if (!isWeChatRelease(options)) return;

    options.packages ??= {};
    options.packages.wechatgame ??= {};
    options.packages.wechatgame.highPerformanceMode = true;
};

exports.onAfterBuild = async function (options, result) {
    if (!isWeChatRelease(options)) return;

    const gameJsonPath = path.join(result.dest, 'game.json');
    const gameConfig = JSON.parse(await fs.readFile(gameJsonPath, 'utf8'));
    if (!gameConfig || typeof gameConfig !== 'object' || Array.isArray(gameConfig)) {
        throw new Error(`[微信高性能] ${gameJsonPath} 必须是 JSON 对象。`);
    }

    // 在引擎生成方向、分包和插件配置后合并，避免构建覆盖发布开关。
    gameConfig.iOSHighPerformance = true;
    gameConfig['iOSHighPerformance+'] = true;
    await fs.writeFile(gameJsonPath, `${JSON.stringify(gameConfig, null, 4)}\n`, 'utf8');
    console.log('[微信高性能] 已开启 iOSHighPerformance 和 iOSHighPerformance+。');
};
