import type { LevelRule } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';

interface BlizzardState { target: number; left: number }

// 状态属于每一局；同时运行模拟或切换无尽区段不会共享计时器。
const blizzards = new WeakMap<SfCombat, BlizzardState>();

const WIND = 160;
const PERIOD = 8;
const RAMP = 1.5;

/**
 * 第 5 章 5-3：暴风雪。6 秒后起风，每 8 秒换一次方向；风向切换时风力在 1.5 秒内渐变
 * （屏幕上的雪线随之改变方向和密度，就是预警）。侧风吹偏所有敌弹，并把玩家轻轻推向下风处。
 */
const blizzard: LevelRule = {
    start(c) { blizzards.set(c, { target: 0, left: 6 }); c.wind = 0; },
    update(c, dt) {
        let state = blizzards.get(c);
        if (!state) { state = { target: 0, left: 6 }; blizzards.set(c, state); }
        state.left -= dt;
        if (state.left <= 0) {
            state.left = PERIOD;
            state.target = state.target === 0 ? (c.rng.next() < 0.5 ? -WIND : WIND) : -state.target;
        }
        const step = WIND * 2 / RAMP * dt;
        c.wind += Math.max(-step, Math.min(step, state.target - c.wind));
    },
};

/** 第 5 章关卡规则。 */
export const CH5_RULES: Record<string, LevelRule> = { blizzard };
