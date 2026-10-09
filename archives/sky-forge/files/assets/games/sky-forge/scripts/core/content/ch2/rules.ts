import type { LevelRule } from '../SfContentTypes';

/** 萤火之夜：黑暗、飞机光圈和虫群荧光由视图按 rule 绘制，不改变战斗时间。 */
export const CH2_RULES: Record<string, LevelRule> = {
    night: { update() { } },
};
