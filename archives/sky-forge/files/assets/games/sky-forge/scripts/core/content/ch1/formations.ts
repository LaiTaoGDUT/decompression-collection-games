import type { FormationFn } from '../SfContentTypes';
import { HoverMotion } from '../../SfMotion';

/** 拖网飞艇成对入场：一对两艘悬停在同一高度，n 为对数（1～2），第二对稍后、更低。 */
const netPair: FormationFn = (c, ev) => {
    const pairs = Math.max(1, Math.min(2, ev.n ?? 1));
    const half = Math.max(90, Math.min((ev.gap ?? 360) / 2, (c.bounds.right - c.bounds.left) / 2 - 60));
    const cx = Math.max(c.bounds.left + half + 50, Math.min(c.bounds.right - half - 50, ev.x ?? 0));
    const group = c.newGroup(ev.drop);
    for (let i = 0; i < pairs; i++) {
        c.schedule(i * 2.2, () => {
            const y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * ((ev.y ?? 0.8) - i * 0.08);
            const blimps = [-1, 1].map(side => {
                const e = c.spawnEnemy(ev.e, cx + side * half, c.bounds.top + 60, null, { group, fireScale: ev.fireScale ?? 1 });
                e.motion = new HoverMotion(e, y, ev.hold ?? 9, 200, side * 60, 10, 260);
                return e;
            });
            blimps[0].link = blimps[1]; blimps[1].link = blimps[0];
        });
    }
};

/** 第 1 章专属编队。 */
export const CH1_FORMATIONS: Record<string, FormationFn> = {
    'net-pair': netPair,
};
