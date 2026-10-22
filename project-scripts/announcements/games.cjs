'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rules } = require('./runtime-rules.cjs');
const { ROOT, GAMES_FILE, RUNTIME_FILE, AnnouncementStore, writeJsonAtomic, writeFileAtomic } = require('./core.cjs');

const EDITABLE_FIELDS = Object.freeze([
    'name', 'description', 'version', 'enabled', 'visibility', 'lobbyTags', 'lobbyTag',
    'tags', 'minAppVersion',
]);
const revisionOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

class CatalogEditError extends Error {
    constructor(message, status = 400, errors = []) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

class GameCatalogStore {
    constructor(options = {}) {
        this.root = options.root || ROOT;
        this.announcements = options.announcements || new AnnouncementStore({ root: this.root });
    }

    state() {
        const text = fs.readFileSync(path.join(this.root, GAMES_FILE), 'utf8');
        const catalog = JSON.parse(text);
        if (!catalog || !Array.isArray(catalog.games)) throw new Error('games.json 中的 games 必须是数组');
        return {
            catalog,
            revision: revisionOf(text),
            options: {
                lobbyTags: Array.from(rules().LOBBY_PROMOTION_TAGS),
            },
        };
    }

    /** 保存整个清单以支持调整默认顺序；游戏 ID 固定，保留未来增加的非编辑字段。 */
    save(input, revision) {
        const target = path.join(this.root, GAMES_FILE);
        const previousText = fs.readFileSync(target, 'utf8');
        if (revision !== revisionOf(previousText)) {
            throw new CatalogEditError('游戏配置已被其他页面或编辑器修改。请重新读取配置后再保存；当前修改仍保留在页面中。', 409);
        }
        const previous = JSON.parse(previousText);
        if (!input || !Array.isArray(input.games)) throw new CatalogEditError('游戏清单格式不正确');
        if (input.schemaVersion !== previous.schemaVersion) throw new CatalogEditError('不能修改游戏清单的 schemaVersion');
        const registered = new Map(previous.games.map((game) => [game.id, game]));
        const ids = input.games.map((game) => game?.id);
        if (ids.length !== registered.size || new Set(ids).size !== ids.length || ids.some((id) => !registered.has(id))) {
            throw new CatalogEditError('只能编辑已注册游戏，不能在配置页修改游戏 ID、添加或删除游戏');
        }
        const catalog = { ...previous, games: input.games.map((inputGame) => {
            const game = { ...registered.get(inputGame.id) };
            for (const key of EDITABLE_FIELDS) {
                if (Object.hasOwn(inputGame, key)) game[key] = inputGame[key];
                else delete game[key];
            }
            return game;
        }) };
        const validation = rules().validateGameCatalog(catalog);
        if (!validation.valid) {
            const errors = Array.from(validation.errors, (error) => ({ ...error }));
            throw new CatalogEditError('游戏配置校验失败，请检查标出的字段', 400, errors);
        }

        // 游戏改名时同步生效公告里的名称快照；写入异常时还原两个文件。
        const runtimePath = path.join(this.root, RUNTIME_FILE);
        const previousRuntime = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath) : null;
        const namesChanged = catalog.games.some((game) => game.name !== registered.get(game.id).name);
        let catalogWritten = false;
        try {
            const indent = previousText.match(/\n([ \t]+)"/)?.[1] ?? 4;
            writeJsonAtomic(this.root, GAMES_FILE, catalog, indent);
            catalogWritten = true;
            if (namesChanged) {
                const state = this.announcements.state();
                if (state.activeId) this.announcements.writeRuntime({
                    activeId: state.activeId, announcements: state.announcements,
                }, state.games);
            }
        } catch (error) {
            // 未完成原子替换时原文件仍然完整；恢复也必须原子写入，不能先截断原文件。
            if (catalogWritten) writeFileAtomic(this.root, GAMES_FILE, previousText);
            const runtimeNow = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath) : null;
            if (previousRuntime && (!runtimeNow || !previousRuntime.equals(runtimeNow))) writeFileAtomic(this.root, RUNTIME_FILE, previousRuntime);
            else if (!previousRuntime && runtimeNow) fs.unlinkSync(runtimePath);
            throw error;
        }
        return { runtimeChanged: true, gameConfig: this.state() };
    }
}

module.exports = { GameCatalogStore, CatalogEditError };
