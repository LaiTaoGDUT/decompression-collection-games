'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, GAMES_FILE, writeJsonAtomic } = require('./core.cjs');
const { rules } = require('./runtime-rules.cjs');

const APP_FILE = 'assets/resources/configs/app.json';
const PLACEMENTS = Object.freeze([
    { key: 'watermelonReviveRewarded', gameId: 'watermelon', label: '复活' },
    { key: 'chessEndlessReviveRewarded', gameId: 'chess-endless', label: '复活' },
    { key: 'desktopCleanupRewarded', gameId: 'catch', label: '道具 / 续玩' },
    { key: 'doodleJumpReviveRewarded', gameId: 'doodle-jump', label: '复活' },
    { key: 'game2048ClearSmallTilesRewarded', gameId: 'game2048', label: '清除小方块' },
    { key: 'bubbleShooterReviveRewarded', gameId: 'bubble-shooter', label: '复活' },
    { key: 'meowdokuToolRewarded', gameId: 'meowdoku', label: '道具' },
    { key: 'multiColorFillHintRewarded', gameId: 'multi-color-fill', label: '提示' },
    { key: 'rotateRingsHintRewarded', gameId: 'rotate-rings', label: '提示' },
]);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const revisionOf = (value) => crypto.createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex');
const sectionSource = (config, section) => section === 'ads' ? config.ads : {
    appVersion: config.appVersion, development: config.development, fonts: config.fonts,
};

class AppEditError extends Error {
    constructor(message, status = 400, errors = []) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

class AppConfigurationStore {
    constructor(options = {}) { this.root = options.root || ROOT; }

    read() {
        const text = fs.readFileSync(path.join(this.root, APP_FILE), 'utf8');
        const config = JSON.parse(text);
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('app.json 必须是配置对象');
        return { text, config };
    }

    state() {
        const { config } = this.read();
        const normalized = rules().normalizeAppConfig(config);
        const gameKeys = Object.keys(rules().DEFAULT_APP_CONFIG.ads.games);
        const placementKeys = Object.keys(rules().DEFAULT_APP_CONFIG.ads.wechat);
        const games = JSON.parse(fs.readFileSync(path.join(this.root, GAMES_FILE), 'utf8')).games;
        return {
            ads: { revision: revisionOf(sectionSource(config, 'ads')), value: {
                games: Object.fromEntries(gameKeys.map((id) => [id, normalized.ads.games[id].enabled])),
                wechat: Object.fromEntries(placementKeys.map((key) => [key, normalized.ads.wechat[key].adUnitId])),
                tapAdUnitId: normalized.ads.tap.rewardedVideo.adUnitId,
            } },
            release: { revision: revisionOf(sectionSource(config, 'release')), value: {
                appVersion: normalized.appVersion,
                mockAds: normalized.development.mockAds,
                showDevelopmentGames: normalized.development.showDevelopmentGames,
                fontsEnabled: normalized.fonts.enabled,
                validateFontCoverage: normalized.fonts.validateCoverage,
                fontLoadTimeoutMs: normalized.fonts.loadTimeoutMs,
            } },
            games: games.map((game) => ({ id: game.id, name: game.name, supportsAds: gameKeys.includes(game.id) })),
            placements: PLACEMENTS.filter((placement) => placementKeys.includes(placement.key)),
        };
    }

    /** 同文件按分区校验和合并，只保存当前页，保留其他配置及未知字段。 */
    save(section, input, revision) {
        if (!['ads', 'release'].includes(section)) throw new AppEditError('配置类型不正确');
        const { text, config } = this.read();
        if (revision !== revisionOf(sectionSource(config, section))) {
            throw new AppEditError('此页配置已被其他页面或编辑器修改。请重新读取后再保存；当前修改仍保留在页面中。', 409);
        }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppEditError('配置格式不正确');
        const errors = [];
        const invalid = (field, reason) => errors.push({ field, reason });
        const boolean = (field, value) => {
            if (typeof value !== 'boolean') invalid(field, '必须是开关值');
            return value;
        };
        const adUnit = (field, value) => {
            if (typeof value !== 'string' || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) {
                invalid(field, '请填写单行广告单元 ID，最多 256 个字符；可以留空');
                return '';
            }
            return value.trim();
        };
        let next;
        if (section === 'ads') {
            const previousAds = record(config.ads);
            const games = { ...record(previousAds.games) };
            const wechat = { ...record(previousAds.wechat) };
            for (const id of Object.keys(rules().DEFAULT_APP_CONFIG.ads.games)) {
                games[id] = { ...record(games[id]), enabled: boolean('games.' + id, input.games?.[id]) };
            }
            for (const key of Object.keys(rules().DEFAULT_APP_CONFIG.ads.wechat)) {
                wechat[key] = { ...record(wechat[key]), adUnitId: adUnit('wechat.' + key, input.wechat?.[key]) };
            }
            const tap = record(previousAds.tap);
            next = { ...config, ads: { ...previousAds, games, wechat, tap: {
                ...tap, rewardedVideo: { ...record(tap.rewardedVideo), adUnitId: adUnit('tapAdUnitId', input.tapAdUnitId) },
            } } };
        } else {
            const version = typeof input.appVersion === 'string' ? input.appVersion.trim() : '';
            if (!rules().isSemanticVersion(version)) invalid('appVersion', '请使用有效版本号，如 0.2.0');
            const timeout = input.fontLoadTimeoutMs;
            if (!Number.isSafeInteger(timeout) || timeout <= 0) invalid('fontLoadTimeoutMs', '必须是大于 0 的整数（毫秒）');
            next = { ...config, appVersion: version,
                development: { ...record(config.development),
                    mockAds: boolean('mockAds', input.mockAds),
                    showDevelopmentGames: boolean('showDevelopmentGames', input.showDevelopmentGames),
                },
                fonts: { ...record(config.fonts),
                    enabled: boolean('fontsEnabled', input.fontsEnabled),
                    validateCoverage: boolean('validateFontCoverage', input.validateFontCoverage),
                    loadTimeoutMs: timeout,
                },
            };
        }
        if (errors.length) throw new AppEditError('配置校验失败，请检查标出的字段', 400, errors);
        writeJsonAtomic(this.root, APP_FILE, next, text.match(/\n([ \t]+)"/)?.[1] ?? 4);
        return { runtimeChanged: true, appConfig: this.state() };
    }
}

module.exports = { AppConfigurationStore, AppEditError, APP_FILE };
