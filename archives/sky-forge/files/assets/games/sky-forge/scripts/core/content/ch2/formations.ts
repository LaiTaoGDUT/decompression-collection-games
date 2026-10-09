import type { FormationFn } from '../SfContentTypes';
import { SineMotion } from '../../SfMotion';

/** 第 2 章专属编队；其他飞行与地面编队复用公共模板。 */
export const CH2_FORMATIONS: Record<string, FormationFn> = {
    'firefly-chain'(c, ev) {
        const n = Math.max(1, ev.n ?? 9);
        const speed = ev.speed ?? 225, gap = ev.gap ?? 0.27, freq = 0.34;
        const amp = Math.min(ev.amp ?? 145, (c.bounds.right - c.bounds.left) * 0.35);
        const x = Math.max(c.bounds.left + amp + 24, Math.min(c.bounds.right - amp - 24, ev.x ?? 0));
        const group = c.newGroup(ev.drop);
        // 一次登记全链，不能让早到成员的死亡提前结算尚未生成的后半链。
        for (let i = 0; i < n; i++) {
            const phase = -i * gap * freq * Math.PI * 2;
            c.spawnEnemy(ev.e, x + Math.sin(phase) * amp, c.bounds.top + 40 + i * speed * gap,
                new SineMotion(x, -speed, amp, freq, phase), { group, fireScale: ev.fireScale ?? 1 });
        }
    },
    treant(c, ev) {
        const e = c.spawnEnemy(ev.e, ev.x ?? 0, c.bounds.top + 110, null, { fireScale: ev.fireScale ?? 1 });
        e.data.home = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * (ev.y ?? 0.75);
        e.data.hold = ev.hold ?? 18;
        e.extraDrops = [ev.drop ?? 'wing', 'special'];
    },
};
