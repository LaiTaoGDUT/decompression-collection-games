import type { DevicePerformanceTier } from '../core/types/CommonTypes';
import { compareSemanticVersions } from '../core/version/SemanticVersion';
import type { GameManifest } from './GameManifest';

const DEVICE_TIER_RANK: Readonly<Record<DevicePerformanceTier, number>> = {
    low: 0,
    medium: 1,
    high: 2,
};

/** 保存已校验的游戏清单，并提供稳定的查询入口。 */
export class GameRegistry {
    private manifests = new Map<string, GameManifest>();

    /** 原子替换全部清单；输入中有重复 ID 时保留原有数据并抛错。 */
    load(manifests: readonly GameManifest[]): void {
        const next = new Map<string, GameManifest>();

        for (const manifest of manifests) {
            if (next.has(manifest.id)) {
                throw new Error(`Game "${manifest.id}" is duplicated.`);
            }

            next.set(manifest.id, manifest);
        }

        this.manifests = next;
    }

    /** 保存一条已校验清单；已存在的 ID 不允许被静默覆盖。 */
    register(manifest: GameManifest): void {
        if (this.manifests.has(manifest.id)) {
            throw new Error(`Game "${manifest.id}" is already registered.`);
        }

        this.manifests.set(manifest.id, manifest);
    }

    getById(id: string): GameManifest | undefined {
        return this.manifests.get(id);
    }

    getPlayableGames(
        deviceTier: DevicePerformanceTier,
        appVersion: string,
        includeDevelopment = false,
    ): readonly GameManifest[] {
        const deviceRank = DEVICE_TIER_RANK[deviceTier];
        // Cocos' WeChat production transform can compile a spread over a Map
        // iterator into `[].concat(iterator)`, leaving the lobby with no valid
        // manifests. Materialize the iterator explicitly for stable output.
        const playable = Array.from(this.manifests.values()).filter(
            (manifest) => (
                manifest.enabled
                && (manifest.visibility === 'public' || includeDevelopment)
                && DEVICE_TIER_RANK[manifest.minimumDeviceTier] <= deviceRank
                && compareSemanticVersions(appVersion, manifest.minAppVersion) >= 0
            ),
        );

        return Object.freeze(playable);
    }
}
