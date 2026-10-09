import type { SfCombat } from '../../SfCombat';
import type { BossInfo, BossScript } from '../../SfBossBase';
import { CH5_BOSS_INFO_A, createCh5BossA } from './bosses-a';
import { CH5_BOSS_INFO_B, createCh5BossB } from './bosses-b';

/** 第 5 章 Boss：bosses-a（雪豹机甲、风暴雪人、极光鲸）与 bosses-b（猛犸战车、霜翼冰晶龙及隐藏版）。 */
export const CH5_BOSS_INFO: Record<string, BossInfo> = { ...CH5_BOSS_INFO_A, ...CH5_BOSS_INFO_B };

export function createCh5Boss(id: string, c: SfCombat): BossScript | null {
    return createCh5BossA(id, c) ?? createCh5BossB(id, c);
}
