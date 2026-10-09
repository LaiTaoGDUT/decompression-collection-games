import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { aimed, shoot, STYLE } from '../../SfPatterns';

const T = HP_UNITS;

/** 拖网飞艇：成对出现，两艇之间拉起挡住我方子弹的绳网；打掉任意一艘网就落下。由编号较小的一艘登记拖网。 */
const netblimp: EnemyBehavior = {
    spawn(e) { e.data.shot = 2.2; },
    update(e, c, dt) {
        const o = e.link;
        if (o && (o.dead || e.dead)) { e.link = undefined; o.link = undefined; }
        if (e.link && e.entered && e.link.entered && e.id < e.link.id) {
            c.addHazard({ kind: 'net', ax: e.x, ay: e.y - 6, bx: e.link.x, by: e.link.y - 6, width: 7 });
        }
        if (!e.entered) return;
        e.data.shot -= dt;
        if (e.data.shot <= 0.4 && e.data.shot + dt > 0.4) e.windup = 0.4;
        if (e.data.shot <= 0) {
            e.data.shot = 3.2;
            aimed(c, e.x, e.y - 30, 1, 0, 220, STYLE.small);
        }
    },
    death(e) {
        if (e.link) e.link.link = undefined;
        e.link = undefined;
    },
};

const turrets = new WeakMap<Enemy, Enemy>();

/** 礁石要塞：底座被炮塔遮挡（不受伤、不显示血条），炮塔被打掉时底座随之炸毁并结算奖励。 */
const reeffort: EnemyBehavior = {
    spawn(e, c) {
        e.base = true;
        const t = c.spawnEnemy('reeffort-turret', e.x, e.y + 6, null, { parent: e, ox: 0, oy: 6, persistent: true });
        t.drop = e.drop;
        e.drop = undefined;
        e.coveredBy = t;
        turrets.set(e, t);
    },
    update(e, c) {
        const turret = turrets.get(e);
        if (turret && turret.dead) {
            e.coveredBy = undefined;
            c.killEnemy(e, 'mechanic', true);
        }
    },
};

/** 旋转炮台：转动炮塔，开火 2.4 秒（四向螺旋弹流）→ 停 1.4 秒；停火前后亮灯预警。 */
const reefTurret: EnemyBehavior = {
    spawn(e) { e.data.cycle = 1.2; e.data.shot = 0; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 30 || e.y < c.bounds.bottom + 120) return;
        e.data.cycle += dt;
        const firing = e.data.cycle % 3.8 < 2.4;
        e.angle += dt * (firing ? 1.5 : 0.4);
        if (!firing) {
            if (e.data.cycle % 3.8 > 3.2) e.windup = Math.max(e.windup, 0.1);
            return;
        }
        e.data.shot -= dt;
        if (e.data.shot > 0) return;
        e.data.shot = 0.17;
        for (let k = 0; k < 4; k++) {
            const a = e.angle - Math.PI / 2 + k * Math.PI / 2;
            shoot(c, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, a, 175, STYLE.orangeSmall);
        }
    },
};

/** 第 1 章新增敌人（其余第 1 章敌人定义在 SfEnemies）。 */
export const CH1_ENEMIES: EnemyDef[] = [
    {
        id: 'netblimp', name: '拖网飞艇', frame: 'enemy/netblimp', size: 'medium', hp: T.medium * 0.9, radius: 34,
        score: 350, energy: 3, coins: 3, body: 'balloon', contact: true, chapter: 1, behavior: netblimp,
        intro: '两艘一组拉起绳网，网会挡住你的子弹；打掉任意一艘，网就落下。',
    },
    {
        id: 'reeffort', name: '旋转炮台礁', frame: 'enemy/reeffort', size: 'large', hp: T.large, radius: 60,
        score: 900, energy: 5, coins: 8, body: 'wood', ground: true, contact: false, chapter: 1, behavior: reeffort,
        intro: '礁石上的转台，一边旋转一边喷出四向螺旋弹流；打掉炮塔整座礁堡就会炸毁。',
    },
    {
        id: 'reeffort-turret', name: '礁堡转台', frame: 'enemy/reeffort-turret', size: 'part', hp: T.large * 0.55, radius: 30,
        score: 300, energy: 3, coins: 2, body: 'metal', ground: true, contact: false, chapter: 1, behavior: reefTurret,
        intro: '旋转炮台礁的炮塔。',
    },
];
