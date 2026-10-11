import type { GameManifest } from '../../runtime/GameManifest';
import type { AchievementSaveData } from '../../services/storage/StorageService';

/**
 * 卡片简介行位置上的个人进度。count：累计进度条与“47/500 关”；
 * best：奖杯图标与“最高 812 米”。没有进度时卡片沿用游戏简介。
 */
export type LobbyCardStatus =
    | {
        readonly kind: 'count';
        readonly progress: number;
        readonly target: number;
        readonly text: string;
        readonly color: string;
    }
    | {
        readonly kind: 'best';
        readonly text: string;
        readonly color: string;
    };

/** 进度来自合集存档中的成就记录；清单未声明展示方式或尚无进度时返回 undefined。 */
export function buildLobbyCardStatus(
    manifest: GameManifest,
    record: AchievementSaveData | undefined,
): LobbyCardStatus | undefined {
    const definition = manifest.achievement;
    const style = definition?.lobbyProgress;
    if (!definition || !style || !record) return undefined;
    const value = Math.floor(Math.min(definition.target, Math.max(0, record.progress)));
    if (value <= 0) return undefined;
    const unit = definition.unit ? ` ${definition.unit}` : '';
    if (style === 'count') {
        return Object.freeze({
            kind: 'count',
            progress: value,
            target: definition.target,
            text: `${value}/${definition.target}${unit}`,
            color: definition.color,
        });
    }
    return Object.freeze({ kind: 'best', text: `最高 ${value}${unit}`, color: definition.color });
}
