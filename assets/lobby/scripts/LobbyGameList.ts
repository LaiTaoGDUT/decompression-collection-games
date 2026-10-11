import type { GameManifest, LobbyPromotionTag } from '../../runtime/GameManifest';
import type { StorageService } from '../../services/storage/StorageService';

export type LobbyGameBadge = 'recent' | LobbyPromotionTag;

export interface LobbyGameListItem {
    readonly manifest: GameManifest;
    readonly badge?: LobbyGameBadge;
}

/** 每个游戏显示一个标签，NEW 优先于 HOT；最近游玩的排序独立于推广标签。 */
export function buildLobbyGameList(
    manifests: readonly GameManifest[],
    storage: Pick<StorageService, 'getGameData' | 'hasDismissedNewBadge' | 'hasPlayedAnyGame'>,
): readonly LobbyGameListItem[] {
    const hasPlayedAnyGame = storage.hasPlayedAnyGame;
    const entries = manifests.map((manifest, index) => ({
        manifest,
        index,
        lastPlayedAt: storage.getGameData(manifest.id)?.lastPlayedAt ?? 0,
    }));
    let mostRecentId: string | undefined;
    let mostRecentAt = 0;
    for (const entry of entries) {
        if (entry.lastPlayedAt > mostRecentAt) {
            mostRecentId = entry.manifest.id;
            mostRecentAt = entry.lastPlayedAt;
        }
    }

    return Object.freeze(entries.map(({ manifest, index, lastPlayedAt }) => {
        const isRecent = manifest.id === mostRecentId;
        const tags = manifest.lobbyTags ?? [];
        const promotion: LobbyPromotionTag | undefined = tags.indexOf('new') >= 0
            && !storage.hasDismissedNewBadge(manifest.id, manifest.version) ? 'new'
            : tags.indexOf('hot') >= 0 ? 'hot' : undefined;
        const badge: LobbyGameBadge | undefined = promotion ?? (isRecent ? 'recent' : undefined);
        // 最近游玩仍在首位；NEW 随后；HOT 只影响从未游玩时的默认顺序。
        const priority = isRecent ? 0 : promotion === 'new' ? 1
            : promotion === 'hot' && !hasPlayedAnyGame ? 2 : 3;
        return { manifest, index, lastPlayedAt, badge, priority };
    }).sort((left, right) => (
        left.priority - right.priority
        || right.lastPlayedAt - left.lastPlayedAt
        || left.index - right.index
    )).map(({ manifest, badge }) => Object.freeze({ manifest, badge })));
}
