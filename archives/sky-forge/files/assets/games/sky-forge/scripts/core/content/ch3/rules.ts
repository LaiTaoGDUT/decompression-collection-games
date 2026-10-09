import type { LevelRule } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';

interface StormState { left: number }

// 状态属于每一局；同时运行模拟或切换无尽区段不会共享落雷计时器。
const storms = new WeakMap<SfCombat, StormState>();

const storm: LevelRule = {
    start(c) { storms.set(c, { left: 8.5 }); },
    update(c, dt) {
        let state = storms.get(c);
        if (!state) { state = { left: 8.5 }; storms.set(c, state); }
        state.left -= dt;
        if (c.levelTime <= 8 || state.left > 0) return;
        state.left = c.rng.range(3.5, 5);
        const x = Math.max(c.bounds.left + 46, Math.min(c.bounds.right - 46,
            c.player.x + c.rng.range(-200, 200)));
        const level = c.level;
        const token = state;
        c.emit({ type: 'strike-warn', x, value: 1.0 });
        c.schedule(1, () => {
            if (c.level !== level || storms.get(c) !== token) return;
            if (c.phase !== 'waves' && c.phase !== 'warning' && c.phase !== 'boss') return;
            let strikeX = x;
            let attracted = false;
            const boss = c.boss;
            const core = boss?.core;
            // 引雷只由关卡规则识别普通 Boss 接口，不要求飞艇暴露专属方法。
            if (boss?.id === 'rodship' && core && !core.dead && core.entered && Math.abs(x - core.x) < 220) {
                strikeX = core.x;
                attracted = true;
                c.emit({ type: 'telegraph', x: core.x, y: core.y, kind: 'lightning-rod' });
            }
            c.emit({ type: 'strike', x: strikeX });
            if (Math.abs(c.player.x - strikeX) < 46) c.hurtPlayer();
            if (attracted && core && !core.dead) {
                c.damageEnemy(core, core.maxHp * 0.06, 'mechanic', core.x, core.y);
            }
            for (const e of c.enemies.slice()) {
                if (e.dead || !e.entered || e.boss || e.def.size === 'boss' || e.parent?.boss) continue;
                if (Math.abs(e.x - strikeX) < 46) c.damageEnemy(e, e.maxHp * 0.5, 'mechanic', e.x, e.y);
            }
        });
    },
};

/** 第 3 章 3-3：预警一秒后落雷，敌我都会受伤。 */
export const CH3_RULES: Record<string, LevelRule> = { storm };
