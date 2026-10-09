import type { SfCombat } from '../../SfCombat';
import type { BossInfo, BossScript } from '../../SfBossBase';
import { CH6_BOSS_INFO_A, createCh6BossA } from './bosses-a';
import { CH6_BOSS_INFO_B, createCh6BossB } from './bosses-b';

/** 第 6 章 Boss：bosses-a（星光海葵、千眼之主、引力球体）与 bosses-b（虚空母舰、终焉吞噬者及隐藏版）。 */
export const CH6_BOSS_INFO: Record<string, BossInfo> = { ...CH6_BOSS_INFO_A, ...CH6_BOSS_INFO_B };

export function createCh6Boss(id: string, c: SfCombat): BossScript | null {
    return createCh6BossA(id, c) ?? createCh6BossB(id, c);
}
