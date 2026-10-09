import type { EnemyDef } from '../../SfEnemies';
import type { SfCombat } from '../../SfCombat';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { DOWN, STYLE, aimAngle, aimed, fan, lob, ring, shoot } from '../../SfPatterns';

const T = HP_UNITS;
const UP = Math.PI / 2;

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
const active = (c: SfCombat) => c.phase === 'waves' || c.phase === 'warning' || c.phase === 'boss';

/** 雪鸮：掠过时每 0.4 秒向左下、右下交替撒一片冰片，冰片碰到屏幕边会反弹一次。 */
const snowowl: EnemyBehavior = {
    spawn(e, c) { e.data.drop = c.rng.range(0.3, 0.7); e.data.side = c.rng.sign(); },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 40 || e.y < c.player.y + 140 || !active(c)) return;
        e.data.drop -= dt;
        if (e.data.drop > 0) return;
        e.data.drop = 0.4;
        e.data.side = -e.data.side;
        shoot(c, e.x, e.y - 14, DOWN + e.data.side * 0.8, 170, { ...STYLE.shard, bounces: 1 });
    },
};

/**
 * 冰晶棱镜：被我方子弹击中时把这一发折射成 3 发我方碎光（向上扇形，伤害各为原弹 60%）——
 * 打水晶能“借力”。自身很硬（只受 35% 伤害），每 3.2 秒向两侧斜下方射出会弹墙的冰片。
 */
const prism: EnemyBehavior = {
    spawn(e, c) { e.data.shot = c.rng.range(1, 2.5); e.data.cd = 0; },
    update(e, c, dt) {
        e.data.cd = Math.max(0, e.data.cd - dt);
        if (!e.entered || e.y > c.bounds.top - 30 || e.y < c.player.y + 160 || !active(c)) return;
        e.data.shot -= dt;
        if (e.data.shot <= 0.5 && e.data.shot + dt > 0.5) e.windup = 0.5;
        if (e.data.shot > 0) return;
        e.data.shot = 3.2;
        for (const side of [-1, 1]) shoot(c, e.x, e.y, DOWN + side * 0.75, 180, { ...STYLE.shard, bounces: 1 });
    },
    damage(e, c, amount, hx, hy) {
        if (e.data.cd <= 0) {
            e.data.cd = 0.06;
            for (const a of [UP - 0.32, UP, UP + 0.32]) {
                c.firePlayer({
                    x: hx, y: hy + 10, vx: Math.cos(a) * 1300, vy: Math.sin(a) * 1300, radius: 8, damage: amount * 0.6,
                    kind: 'prism-shard', pierce: 0, life: 1.4, slot: 'mechanic', speed: 1300, hitIds: [e.id],
                });
            }
        }
        return amount * 0.35;
    },
};

/** 冰镜哨兵（走位由镜像编队控制）：每 2.4 秒蓄力 0.5 秒，两只同时朝玩家射出三连冰片，形成交叉火力。 */
const mirror: EnemyBehavior = {
    spawn(e) { e.data.shot = 1.8; },
    update(e, c, dt) {
        if (!e.entered || !active(c) || e.y < c.player.y + 120) return;
        e.data.shot -= dt;
        if (e.data.shot <= 0.5 && e.data.shot + dt > 0.5) e.windup = 0.5;
        if (e.data.shot > 0) return;
        e.data.shot = 2.4;
        const a = aimAngle(c, e.x, e.y);
        for (let i = 0; i < 3; i++) shoot(c, e.x, e.y - 20, a, 230 + i * 30, STYLE.shard);
    },
};

/** 雪球雪人：随地面卷入，每 3.4 秒把大雪球抛到玩家上方附近，落地变成会让飞机打滑的冰面。 */
const snowman: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(1.2, 2.2); },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 30 || e.y < c.player.y + 200 || !active(c)) return;
        e.data.t -= dt;
        if (e.data.t <= 0.6 && e.data.t + dt > 0.6) e.windup = 0.6;
        if (e.data.t > 0) return;
        e.data.t = 3.4;
        const tx = Math.max(c.bounds.left + 70, Math.min(c.bounds.right - 70, c.player.x + c.rng.range(-130, 130)));
        const ty = c.player.y + c.rng.range(70, 200);
        c.addHazard({ kind: 'mark', ax: tx, ay: ty, bx: tx, by: ty, width: 60, warn: 1, warnTime: 1.2, life: 1.2 });
        lob(c, e.x, e.y - 20, tx, ty, 1.2, 200, { ...STYLE.snowball, pool: { radius: 60, life: 5, kind: 'ice' } });
    },
};

/** 霜冻炮台：每 2.8 秒射出 5 发冰弹，飞 0.55 秒后原地冻结成一道弹墙，再过 1 秒碎成慢速冰片。 */
const frostturret: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(1, 1.8); },
    update(e, c, dt) {
        if (!e.entered || Math.abs(e.vy) > 30 || e.y < c.player.y + 160 || !active(c)) return;
        e.data.t -= dt;
        if (e.data.t <= 0.6 && e.data.t + dt > 0.6) e.windup = 0.6;
        if (e.data.t > 0) return;
        e.data.t = 2.8;
        fan(c, e.x, e.y - 30, aimAngle(c, e.x, e.y), 5, 70, 240, {
            ...STYLE.shard, stop: 0.55, fuse: 1.55, burst: { count: 3, speed: 90, kind: 'iceshard', radius: 8, offset: -Math.PI / 2 },
        });
    },
};

const WITCH_CYCLE = 6;

/**
 * 冰霜女巫（精英）：自己控制走位。入场后每 6 秒瞬移到新位置并在身下竖起一道冰墙（敌我子弹都挡），
 * 躲在墙后向两侧射出会弹墙绕回来的冰片，第 3 秒放一圈冰环；玩家要绕到墙侧面打她。14 秒后向上离场。
 */
const frostwitch: EnemyBehavior = {
    spawn(e, c) {
        e.motion = null;
        e.data.home = yAt(c, 0.8);
        e.data.t = 0;
        e.data.cycle = WITCH_CYCLE - 1.2;
        e.data.cast = 1;
        e.drop = e.drop ?? 'wing';
        e.extraDrops = ['special'];
    },
    update(e, c, dt) {
        e.data.t += dt;
        const py = e.y;
        if (e.data.t > 16) {
            e.y += 260 * dt;
            e.vy = 260;
            return;
        }
        if (e.y > e.data.home + 2) { e.y = Math.max(e.data.home, e.y - 280 * dt); e.vy = (e.y - py) / Math.max(dt, 1e-4); return; }
        e.vy = 0;
        e.alpha = Math.min(1, (e.alpha ?? 1) + dt * 3);
        if (!active(c)) return;
        e.data.cycle += dt;
        if (e.data.cycle >= WITCH_CYCLE) {
            e.data.cycle = 0;
            e.data.cast = 1;
            e.data.nova = 0;
            // 瞬移：淡出到新位置，再在身下 130 像素竖起冰墙。
            e.x = Math.max(c.bounds.left + 140, Math.min(c.bounds.right - 140, c.rng.range(-220, 220)));
            e.alpha = 0;
            const wy = e.y - 130;
            c.addHazard({ kind: 'icewall', ax: e.x - 120, ay: wy, bx: e.x + 120, by: wy, width: 10, warn: 1, warnTime: 0.5, life: 5.5 });
            c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'witch-blink' });
            return;
        }
        e.data.cast -= dt;
        if (e.data.cast <= 0.4 && e.data.cast + dt > 0.4) e.windup = 0.4;
        if (e.data.cast <= 0) {
            e.data.cast = 1.2;
            for (const side of [-1, 1]) shoot(c, e.x + side * 30, e.y - 10, DOWN + side * 0.95, 240, { ...STYLE.shard, bounces: 2 });
        }
        if (!e.data.nova && e.data.cycle >= 3) {
            e.data.nova = 1;
            ring(c, e.x, e.y, 10, 160, c.rng.next() * Math.PI, STYLE.shard);
        }
    },
};

/** 第 5 章 · 冰晶峡谷 · 霜灵与雪原兵器。 */
export const CH5_ENEMIES: EnemyDef[] = [
    {
        id: 'snowowl', name: '雪鸮', frame: 'enemy/snowowl', size: 'small', hp: T.small,
        radius: 24, score: 120, energy: 1, coins: 1, face: true, body: 'flesh', contact: true, chapter: 5, behavior: snowowl,
        intro: '掠过时撒下冰片，冰片碰到屏幕边会反弹一次——注意从侧面弹回来的那一片。',
    },
    {
        id: 'snowtrooper', name: '雪原兵', frame: 'enemy/snowtrooper', size: 'small', hp: T.small * 1.1,
        radius: 22, score: 110, energy: 1, coins: 1, body: 'metal', contact: true, chapter: 5,
        intro: '排成方阵整体平移、到边下压一格，只有最前排开火；打穿一列，方阵会收拢补位。',
    },
    {
        id: 'prism', name: '冰晶棱镜', frame: 'enemy/prism', size: 'medium', hp: T.medium * 1.6,
        radius: 32, score: 400, energy: 3, coins: 3, body: 'metal', ground: true, contact: false, chapter: 5, behavior: prism,
        intro: '打中水晶的子弹会折射成三发向上的碎光——借它的力打上方的敌人；它本身很硬。',
    },
    {
        id: 'mirror', name: '冰镜哨兵', frame: 'enemy/mirror', size: 'medium', hp: T.medium * 1.1,
        radius: 36, score: 420, energy: 3, coins: 3, body: 'metal', contact: true, chapter: 5, behavior: mirror,
        intro: '成对出现、以你为轴镜像移动，蓄力后两侧同时射击形成交叉火力，横移别停在中间。',
    },
    {
        id: 'snowman', name: '雪球雪人', frame: 'enemy/snowman', size: 'medium', hp: T.medium * 1.4,
        radius: 38, score: 450, energy: 4, coins: 4, body: 'flesh', ground: true, contact: false, chapter: 5, behavior: snowman,
        intro: '把大雪球扔到你附近，落地变成冰面——在冰面上飞行会打滑、松手还会继续滑一段。',
    },
    {
        id: 'frostturret', name: '霜冻炮台', frame: 'enemy/frostturret', size: 'medium', hp: T.medium * 1.3,
        radius: 36, score: 460, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 5, behavior: frostturret,
        intro: '冰弹飞到一半会停住结成弹墙，一秒后碎成慢速冰片，趁停住时从缝隙穿过。',
    },
    {
        id: 'frostwitch', name: '冰霜女巫', frame: 'enemy/frostwitch', size: 'elite', hp: T.elite * 0.7,
        radius: 50, score: 2000, energy: 8, coins: 14, body: 'flesh', contact: true, chapter: 5, behavior: frostwitch,
        intro: '精英。瞬移后在身下竖起冰墙，冰墙敌我子弹都挡；绕到墙的侧面打她，小心弹墙绕回的冰片。',
    },
];
