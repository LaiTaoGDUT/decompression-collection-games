'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const HISTORY_FILE = 'announcement-sources/announcements.json';
const RUNTIME_FILE = 'assets/resources/configs/announcement.json';
const GAMES_FILE = 'assets/resources/configs/games.json';
const APP_FILE = 'assets/resources/configs/app.json';
const SCHEMA_VERSION = 1;

/** 固定三段，顺序与游戏内 Announcement.ts 的 ANNOUNCEMENT_SECTION_KEYS 一致。 */
const SECTIONS = Object.freeze([
    { key: 'newGames', title: '新游戏', allowCollection: false },
    { key: 'features', title: '新功能', allowCollection: true },
    { key: 'fixes', title: '问题修复', allowCollection: true },
]);
/** 合集大厅本身的改动（如大厅新功能、通用修复）用这个虚拟目标；ID 与游戏内 Announcement.ts 的 ANNOUNCEMENT_COLLECTION_ID 一致。 */
const COLLECTION_TARGET = Object.freeze({ id: 'collection', name: '通用' });
const MAX_ENTRY_LENGTH = 60;
/** 编辑页预览封面：与游戏内弹窗一致，读 lobby-covers 包里的大厅封面，合集大厅用大厅标志。 */
const COVER_BUNDLE_DIR = 'assets/lobby-covers';
const COLLECTION_COVER = 'visual/branding/lobby-cn-title-logo-v3/texture';
const COVER_TYPES = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' });
const MAX_VERSION_LENGTH = 24;

function readJson(root, file) {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function writeFileAtomic(root, file, content) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temp, content);
        fs.renameSync(temp, target);
    } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
}

function writeJsonAtomic(root, file, value, indent = 2) {
    writeFileAtomic(root, file, JSON.stringify(value, null, indent) + '\n');
}

function loadGames(root) {
    const catalog = readJson(root, GAMES_FILE);
    return catalog.games.map((game) => ({ id: game.id, name: game.name }));
}

/** 按游戏 ID 找到封面原图；只允许读取 lobby-covers 包内的图片。 */
function coverFile(root, gameId) {
    const cover = gameId === COLLECTION_TARGET.id
        ? COLLECTION_COVER
        : readJson(root, GAMES_FILE).games.find((game) => game.id === gameId)?.cover;
    if (typeof cover !== 'string') return null;
    const bundle = path.resolve(root, COVER_BUNDLE_DIR);
    const base = path.resolve(bundle, cover.replace(/\/texture$/, ''));
    if (!base.startsWith(bundle + path.sep)) return null;
    for (const [extension, type] of Object.entries(COVER_TYPES)) {
        if (fs.existsSync(base + extension)) return { file: base + extension, type };
    }
    return null;
}

function appVersion(root) {
    return String(readJson(root, APP_FILE).appVersion || '');
}

function emptyHistory() {
    return { schemaVersion: SCHEMA_VERSION, activeId: null, announcements: [] };
}

function loadHistory(root) {
    const file = path.join(root, HISTORY_FILE);
    if (!fs.existsSync(file)) return emptyHistory();
    const history = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (history.schemaVersion !== SCHEMA_VERSION || !Array.isArray(history.announcements)) {
        throw new Error(`${HISTORY_FILE} 格式不正确`);
    }
    return history;
}

function targetsFor(games, section) {
    return section.allowCollection ? [COLLECTION_TARGET, ...games] : games;
}

/** 校验并规整客户端提交的公告内容；只接受固定字段，错误信息直接给编辑页显示。 */
function normalizeDraft(input, games) {
    if (!input || typeof input !== 'object') throw new Error('公告内容为空');
    const version = String(input.version ?? '').trim();
    const date = String(input.date ?? '').trim();
    if (!version) throw new Error('请填写版本号');
    if (version.length > MAX_VERSION_LENGTH) throw new Error('版本号过长');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式应为 YYYY-MM-DD');
    const draft = { version, date };
    for (const section of SECTIONS) {
        const allowed = new Set(targetsFor(games, section).map((target) => target.id));
        const entries = Array.isArray(input[section.key]) ? input[section.key] : [];
        const seen = new Set();
        draft[section.key] = entries.map((entry, index) => {
            const label = `「${section.title}」第 ${index + 1} 条`;
            const gameId = String(entry?.gameId ?? '').trim();
            const text = String(entry?.text ?? '').trim().replace(/\s+/g, ' ');
            if (!allowed.has(gameId)) throw new Error(`${label}：请选择游戏`);
            if (seen.has(gameId)) throw new Error(`${label}：同一模块里一个游戏只写一条`);
            if (!text) throw new Error(`${label}：请填写内容`);
            if (text.length > MAX_ENTRY_LENGTH) throw new Error(`${label}：超过 ${MAX_ENTRY_LENGTH} 字，请精简为一句话`);
            seen.add(gameId);
            return { gameId, text };
        });
    }
    if (SECTIONS.every((section) => draft[section.key].length === 0)) throw new Error('至少填写一条内容');
    return draft;
}

function gameName(games, gameId) {
    if (gameId === COLLECTION_TARGET.id) return COLLECTION_TARGET.name;
    return games.find((game) => game.id === gameId)?.name ?? gameId;
}

/** 写入游戏内读取的生效公告；条目附带当前游戏名快照，运行时不依赖编辑器数据。 */
function runtimeConfig(announcement, games) {
    if (!announcement) return { schemaVersion: SCHEMA_VERSION, announcement: null };
    const runtime = { id: announcement.id, version: announcement.version, date: announcement.date };
    for (const section of SECTIONS) {
        runtime[section.key] = announcement[section.key].map((entry) => ({
            gameId: entry.gameId,
            gameName: gameName(games, entry.gameId),
            text: entry.text,
        }));
    }
    return { schemaVersion: SCHEMA_VERSION, announcement: runtime };
}

/** 供审核信息填写的纯文本：没有内容的模块不输出。 */
function plainText(announcement, games) {
    const blocks = [];
    for (const section of SECTIONS) {
        const entries = announcement[section.key];
        if (!entries.length) continue;
        blocks.push([`【${section.title}】`, ...entries.map((entry, index) => (
            `${index + 1}. ${gameName(games, entry.gameId)}：${entry.text}`
        ))].join('\n'));
    }
    return blocks.join('\n\n');
}

function createId(draft) {
    return `v${draft.version}-${draft.date.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
}

class AnnouncementStore {
    constructor(options = {}) {
        this.root = options.root || ROOT;
        this.now = options.now || (() => new Date().toISOString());
    }

    cover(gameId) {
        return coverFile(this.root, gameId);
    }

    state() {
        const history = loadHistory(this.root);
        const games = loadGames(this.root);
        return {
            activeId: history.activeId,
            appVersion: appVersion(this.root),
            sections: SECTIONS,
            games,
            collection: COLLECTION_TARGET,
            maxEntryLength: MAX_ENTRY_LENGTH,
            announcements: history.announcements
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((item) => ({ ...item, plainText: plainText(item, games) })),
        };
    }

    /** 新增或编辑；返回是否需要重新同步游戏内生效文件。 */
    save(id, input) {
        const history = loadHistory(this.root);
        const games = loadGames(this.root);
        const draft = normalizeDraft(input, games);
        const time = this.now();
        let saved;
        if (id) {
            const index = history.announcements.findIndex((item) => item.id === id);
            if (index < 0) throw new Error('公告不存在，请刷新页面');
            saved = { ...history.announcements[index], ...draft, updatedAt: time };
            history.announcements[index] = saved;
        } else {
            saved = { id: createId(draft), ...draft, createdAt: time, updatedAt: time };
            history.announcements.push(saved);
        }
        writeJsonAtomic(this.root, HISTORY_FILE, history);
        const republish = history.activeId === saved.id;
        if (republish) this.writeRuntime(history, games);
        return { id: saved.id, runtimeChanged: republish };
    }

    activate(id) {
        const history = loadHistory(this.root);
        if (!history.announcements.some((item) => item.id === id)) throw new Error('公告不存在，请刷新页面');
        history.activeId = id;
        writeJsonAtomic(this.root, HISTORY_FILE, history);
        this.writeRuntime(history, loadGames(this.root));
        return { id, runtimeChanged: true };
    }

    /** 从历史中移除。删掉正在生效的公告时清空游戏内文件，大厅不再展示公告。 */
    remove(id) {
        const history = loadHistory(this.root);
        const index = history.announcements.findIndex((item) => item.id === id);
        if (index < 0) throw new Error('公告不存在，请刷新页面');
        history.announcements.splice(index, 1);
        const wasActive = history.activeId === id;
        if (wasActive) history.activeId = null;
        writeJsonAtomic(this.root, HISTORY_FILE, history);
        if (wasActive) this.writeRuntime(history, loadGames(this.root));
        return { id, runtimeChanged: wasActive };
    }

    writeRuntime(history, games) {
        const active = history.announcements.find((item) => item.id === history.activeId) ?? null;
        writeJsonAtomic(this.root, RUNTIME_FILE, runtimeConfig(active, games));
    }
}

module.exports = {
    ROOT, HISTORY_FILE, RUNTIME_FILE, GAMES_FILE, SECTIONS, COLLECTION_TARGET, MAX_ENTRY_LENGTH,
    AnnouncementStore, normalizeDraft, plainText, runtimeConfig, writeJsonAtomic, writeFileAtomic,
};
