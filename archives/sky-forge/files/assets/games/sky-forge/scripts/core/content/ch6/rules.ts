import type { LevelRule } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';

interface GravityState { t: number }

// 状态属于每一局；同时运行模拟或切换无尽区段不会共享计时器。
const gravities = new WeakMap<SfCombat, GravityState>();

/** 引力井：影响半径（像素）与子弹弯曲强度。 */
const WELL_RADIUS = 230;
const WELL_PULL = 1100;

/**
 * 第 6 章 6-3：引力井。场上有两口引力井沿缓慢的 8 字轨迹漂移（4 秒后出现，先闪烁 1.5 秒），
 * 经过的敌我子弹都被向井心弯曲：敌弹会绕着井拐弯，我方子弹贴着井边打出去会被甩向另一侧。
 * 引力井不拉玩家本身。
 */
const gravity: LevelRule = {
    start(c) { gravities.set(c, { t: 0 }); },
    update(c, dt) {
        let state = gravities.get(c);
        if (!state) { state = { t: 0 }; gravities.set(c, state); }
        state.t += dt;
        if (state.t < 4) return;
        const k = state.t - 4;
        const warn = Math.max(0, 1 - k / 1.5);
        const mid = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.55;
        for (const side of [-1, 1]) {
            const a = k * 0.32 + (side > 0 ? Math.PI : 0);
            const x = side * 150 + Math.sin(a) * 90;
            const y = mid + Math.sin(a * 2) * 150 * side;
            c.addHazard({ kind: 'well', ax: x, ay: y, bx: x, by: y, width: WELL_RADIUS, pull: WELL_PULL, warn: warn > 0 ? warn : undefined });
        }
    },
};

/** 第 6 章关卡规则。 */
export const CH6_RULES: Record<string, LevelRule> = { gravity };
