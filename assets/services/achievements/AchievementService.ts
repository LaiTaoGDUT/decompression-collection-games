import type { GameManifest } from '../../runtime/GameManifest';
import type { AchievementSaveData, StorageService } from '../storage/StorageService';

/** 已发布的同一奖杯。旧编号只用于识别领奖记录，不能用于恢复新版题库进度。 */
export const PREVIOUS_TROPHIES: Readonly<Partial<Record<string, readonly { id: string; code: number }[]>>> = {
    'meowdoku-trophy-v5': [{ id: 'meowdoku-trophy-v3', code: 2 }, { id: 'meowdoku-trophy-v4', code: 20 }],
    'rotate-rings-trophy-v2': [{ id: 'rotate-rings-trophy-v1', code: 11 }],
};

/** 成就属于合集存档，小游戏只上报自己的玩法指标，不持有 UI 或全局监听。 */
export class AchievementService {
    constructor(private readonly storage: StorageService, private readonly now: () => number = Date.now) {}

    collection(manifests: readonly GameManifest[]): GameManifest[] {
        return manifests.filter(manifest => !!manifest.achievement);
    }

    migrateEarned(manifests: readonly GameManifest[]): void {
        let changed = false;
        for (const manifest of manifests) {
            const achievement = manifest.achievement;
            if (!achievement) continue;
            const previous = PREVIOUS_TROPHIES[achievement.id];
            if (!previous) continue;
            const saved = this.storage.getAchievement(manifest.id);
            if (!saved?.unlockedAt || !previous.some(trophy => trophy.id === saved.achievementId)) continue;
            this.storage.writeAchievement(manifest.id, { achievementId: achievement.id, progress: achievement.target,
                unlockedAt: saved.unlockedAt, celebratedAt: saved.celebratedAt ?? saved.unlockedAt });
            changed = true;
        }
        if (changed) this.flush();
    }

    getRecord(manifest: GameManifest): AchievementSaveData | undefined {
        const definition = manifest.achievement;
        if (!definition) return undefined;
        const saved = this.storage.getAchievement(manifest.id);
        return saved?.achievementId === definition.id ? saved : undefined;
    }

    report(manifest: GameManifest, metric: string, value: number): boolean {
        const definition = manifest.achievement;
        if (!definition || definition.metric !== metric || !Number.isFinite(value) || value < 0) return false;
        const previous = this.getRecord(manifest);
        const progress = Math.min(definition.target, Math.max(previous?.progress ?? 0, value));
        // 这些奖杯可从上一版题库继承，新版的通关指标只取实际游玩上报。
        const metricValue = previous?.unlockedAt && PREVIOUS_TROPHIES[definition.id] ? Math.min(definition.target, value) : progress;
        this.storage.recordGameMetric(manifest.id, metric, metricValue);
        if (previous?.unlockedAt) return false;
        if (progress <= (previous?.progress ?? 0) && progress < definition.target) return false;
        const unlockedAt = progress >= definition.target ? Math.max(1, this.now()) : undefined;
        this.storage.writeAchievement(manifest.id, { achievementId: definition.id, progress,
            ...(unlockedAt ? { unlockedAt } : {}) });
        // 领奖前落盘；底层临时失败时 StorageService 保留待写快照并自动重试。
        if (unlockedAt) this.flush();
        return !!unlockedAt;
    }

    pending(manifests: readonly GameManifest[]): GameManifest | undefined {
        return this.collection(manifests).find(manifest => {
            const record = this.getRecord(manifest);
            return !!record?.unlockedAt && !record.celebratedAt;
        });
    }

    celebrate(manifest: GameManifest): void {
        const record = this.getRecord(manifest);
        if (!record?.unlockedAt || record.celebratedAt) return;
        this.storage.writeAchievement(manifest.id, { ...record, celebratedAt: Math.max(1, this.now()) });
        this.flush();
    }

    private flush(): void {
        try { this.storage.flush(); } catch { /* 保留待写快照，不中断游戏。 */ }
    }
}
