import type { FormationFn } from '../SfContentTypes';
import { GroundMotion } from '../../SfMotion';

/** 电网成对入场；n 是浮标总数，奇数向上补成完整的一对。 */
const buoyPair: FormationFn = (c, ev) => {
    const pairs = Math.max(1, Math.min(4, Math.ceil((ev.n ?? 2) / 2)));
    const half = Math.max(70, Math.min((ev.gap ?? 420) / 2, (c.bounds.right - c.bounds.left) / 2 - 40));
    const cx = Math.max(c.bounds.left + half + 34, Math.min(c.bounds.right - half - 34, ev.x ?? 0));
    const group = pairs > 1 ? c.newGroup(ev.drop) : undefined;
    const level = c.level;
    for (let i = 0; i < pairs; i++) {
        c.schedule(i * 1.6, () => {
            if (c.level !== level || (c.phase !== 'waves' && c.phase !== 'boss')) return;
            const y = c.bounds.top + 55;
            const a = c.spawnEnemy(ev.e, cx - half, y, new GroundMotion(), { group });
            const b = c.spawnEnemy(ev.e, cx + half, y, new GroundMotion(), { group });
            a.link = b; b.link = a;
            if (pairs === 1) a.drop = ev.drop;
        });
    }
};

/** 鲨艇自行潜航和发射鱼雷，不套用只为铁锚飞艇配置的 elite 护航逻辑。 */
const sharkPatrol: FormationFn = (c, ev) => {
    const n = Math.max(1, Math.min(3, ev.n ?? 1));
    const group = n >= 3 ? c.newGroup(ev.drop) : undefined;
    for (let i = 0; i < n; i++) {
        const x = Math.max(c.bounds.left + 72, Math.min(c.bounds.right - 72,
            (ev.x ?? 0) + (i - (n - 1) / 2) * (ev.gap ?? 240)));
        c.spawnEnemy(ev.e, x, c.bounds.top + 90, new GroundMotion(ev.speed ?? 0), { group });
    }
};

/** 第 3 章专属电网与海面精英编队。 */
export const CH3_FORMATIONS: Record<string, FormationFn> = {
    'buoy-pair': buoyPair,
    'shark-patrol': sharkPatrol,
};
