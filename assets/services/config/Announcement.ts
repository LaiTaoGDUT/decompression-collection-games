/** 版本更新公告的固定三段结构；顺序即弹窗与纯文本的展示顺序。 */
export const ANNOUNCEMENT_SECTION_KEYS = ['newGames', 'features', 'fixes'] as const;
export type AnnouncementSectionKey = typeof ANNOUNCEMENT_SECTION_KEYS[number];

export const ANNOUNCEMENT_SECTION_TITLES: Readonly<Record<AnnouncementSectionKey, string>> = Object.freeze({
    newGames: '新游戏',
    features: '新功能',
    fixes: '问题修复',
});

/** 合集大厅本身的改动使用的虚拟游戏 ID，与公告编辑工具的 COLLECTION_TARGET 一致。 */
export const ANNOUNCEMENT_COLLECTION_ID = 'collection';

/** 一条公告条目：一个游戏（或合集大厅）配一句话。gameName 是生效时写入的名称快照。 */
export interface AnnouncementEntry {
    readonly gameId: string;
    readonly gameName: string;
    readonly text: string;
}

export interface Announcement {
    readonly id: string;
    readonly version: string;
    readonly date: string;
    readonly newGames: readonly AnnouncementEntry[];
    readonly features: readonly AnnouncementEntry[];
    readonly fixes: readonly AnnouncementEntry[];
}

export const ANNOUNCEMENT_CONFIG_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readEntries(value: unknown): readonly AnnouncementEntry[] {
    if (!Array.isArray(value)) return Object.freeze([]);
    const entries: AnnouncementEntry[] = [];
    for (const item of value) {
        if (!isRecord(item)) continue;
        const gameId = readText(item.gameId);
        const gameName = readText(item.gameName);
        const text = readText(item.text);
        if (gameId && gameName && text) entries.push(Object.freeze({ gameId, gameName, text }));
    }
    return Object.freeze(entries);
}

/** 解析 configs/announcement.json；没有生效公告或三段皆空时返回 null。 */
export function parseAnnouncementConfig(value: unknown): Announcement | null {
    if (!isRecord(value) || value.schemaVersion !== ANNOUNCEMENT_CONFIG_SCHEMA_VERSION) return null;
    const source = value.announcement;
    if (!isRecord(source)) return null;
    const id = readText(source.id);
    if (!id) return null;
    const announcement: Announcement = Object.freeze({
        id,
        version: readText(source.version),
        date: readText(source.date),
        newGames: readEntries(source.newGames),
        features: readEntries(source.features),
        fixes: readEntries(source.fixes),
    });
    return hasAnnouncementContent(announcement) ? announcement : null;
}

export function hasAnnouncementContent(announcement: Announcement): boolean {
    return ANNOUNCEMENT_SECTION_KEYS.some((key) => announcement[key].length > 0);
}
