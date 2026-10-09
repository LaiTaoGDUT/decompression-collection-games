import type { SfCombat } from '../../SfCombat';
import type { BossInfo, BossScript } from '../../SfBossBase';
import { CH4_BOSS_INFO_A, createCh4BossA } from './bosses-a';
import { CH4_BOSS_INFO_B, createCh4BossB } from './bosses-b';

/** 第 4 章 Boss：bosses-a（熔岩蟾蜍、熔岩蠕虫、岩浆鳐）与 bosses-b（炼狱钻探机、炎刃武神及隐藏版）。 */
export const CH4_BOSS_INFO: Record<string, BossInfo> = { ...CH4_BOSS_INFO_A, ...CH4_BOSS_INFO_B };

export function createCh4Boss(id: string, c: SfCombat): BossScript | null {
    return createCh4BossA(id, c) ?? createCh4BossB(id, c);
}
