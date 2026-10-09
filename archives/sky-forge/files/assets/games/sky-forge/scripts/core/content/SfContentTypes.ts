import type { SfCombat } from '../SfCombat';
import type { Enemy } from '../SfEnemies';
import type { WaveEvent } from '../SfLevelTypes';

/**
 * 章节内容扩展点：每章在 core/content/ch<N>/ 下提供敌人、编队、关卡、关卡规则与 Boss，
 * 核心模块（SfEnemies / SfFormations / SfLevels / SfCombat / SfBosses）汇总注册。
 * 依赖约束：enemies / formations / levels / rules 只能 import 类型、SfMotion、SfPatterns、SfBalance；
 * bosses 只能 import SfBossBase 与上述模块（不要 import SfBosses / SfCombat 实值，避免循环依赖）。
 */

/** 敌人的专属行为（在通用移动、开火之外）。所有回调都是可选的。 */
export interface EnemyBehavior {
    /** 生成后立即调用（初始化 e.data、生成附属部件等）。 */
    spawn?(e: Enemy, c: SfCombat): void;
    /** 每个模拟步调用（移动之后、开火之前）。 */
    update?(e: Enemy, c: SfCombat, dt: number): void;
    /** 受到伤害时调用，返回实际伤害（可减免、可为 0 表示免疫，hx/hy 为命中点）。 */
    damage?(e: Enemy, c: SfCombat, amount: number, hx: number, hy: number): number;
    /** 死亡时调用（reward = 是否被玩家击杀）。 */
    death?(e: Enemy, c: SfCombat, reward: boolean): void;
}

/** 自定义编队：根据编排事件生成敌人（WaveEvent.f 为注册名）。 */
export type FormationFn = (c: SfCombat, ev: WaveEvent) => void;

/** 关卡特殊规则（LevelDef.rule）：每个模拟步调用；视图根据 rule 名称绘制对应氛围（night / storm）。 */
export interface LevelRule {
    start?(c: SfCombat): void;
    update(c: SfCombat, dt: number): void;
}
