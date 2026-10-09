import type { LevelRule } from '../SfContentTypes';
import type { SfCombat } from '../../SfCombat';
import { STYLE, lob } from '../../SfPatterns';

interface EruptionState { left: number }

// 状态属于每一局；同时运行模拟或切换无尽区段不会共享计时器。
const eruptions = new WeakMap<SfCombat, EruptionState>();

const WARN = 1.2;
const RADIUS = 54;

/**
 * 第 4 章 4-3：火山喷发。地面在玩家附近亮起 1～2 个预警圈，1.2 秒后喷出岩浆柱：
 * 预警圈原地变成熔岩滩，并向外抛出 3 团小熔岩（落点也成滩）；岩浆柱会重创圈内的普通敌人。
 */
const eruption: LevelRule = {
    start(c) { eruptions.set(c, { left: 8 }); },
    update(c, dt) {
        let state = eruptions.get(c);
        if (!state) { state = { left: 8 }; eruptions.set(c, state); }
        state.left -= dt;
        if (c.levelTime <= 8 || state.left > 0) return;
        state.left = c.rng.range(4, 5.5);
        const count = c.phase === 'boss' ? 1 : c.rng.next() < 0.45 ? 2 : 1;
        const level = c.level;
        for (let i = 0; i < count; i++) {
            const x = Math.max(c.bounds.left + 60, Math.min(c.bounds.right - 60, c.player.x + c.rng.range(-180, 180)));
            const y = Math.min(c.bounds.top - 160, c.player.y + c.rng.range(-20, 200));
            const pool = c.addLava(x, y, RADIUS, 3.2, WARN);
            c.emit({ type: 'telegraph', x, y, kind: 'eruption' });
            c.schedule(WARN, () => {
                if (c.level !== level || eruptions.get(c) !== state) return;
                if (c.phase !== 'waves' && c.phase !== 'warning' && c.phase !== 'boss') return;
                // 预警圈随地面下移过，喷发点取熔岩滩当前的位置。
                const px = pool.ax, py = pool.ay;
                c.emit({ type: 'explosion', x: px, y: py, size: RADIUS, kind: 'lava' });
                for (let k = 0; k < 3; k++) {
                    const a = c.rng.range(0, Math.PI * 2), d = c.rng.range(110, 190);
                    lob(c, px, py, px + Math.cos(a) * d, py + Math.sin(a) * d, 0.9, 150, { ...STYLE.ember, pool: { radius: 30, life: 2.5 } });
                }
                for (const e of c.enemies.slice()) {
                    if (e.dead || !e.entered || e.boss || e.def.size === 'boss' || e.parent?.boss) continue;
                    if (Math.hypot(e.x - px, e.y - py) < RADIUS + e.radius * 0.5) c.damageEnemy(e, e.maxHp * 0.5, 'mechanic', e.x, e.y);
                }
            });
        }
    },
};

/** 第 4 章关卡规则。 */
export const CH4_RULES: Record<string, LevelRule> = { eruption };
