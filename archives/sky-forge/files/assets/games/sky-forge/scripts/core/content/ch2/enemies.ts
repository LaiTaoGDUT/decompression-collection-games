import type { EnemyDef } from '../../SfEnemies';
import type { Enemy } from '../../SfEnemies';
import type { SfCombat } from '../../SfCombat';
import type { EnemyBullet } from '../../SfTypes';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { aimAngle, aimed, DOWN } from '../../SfPatterns';

const T = HP_UNITS;

/** 通用 turn 是匀速旋转；每 0.05 秒重新给出有限转向，才是真正的慢追踪。 */
function followSeed(c: SfCombat, b: EnemyBullet, rate: number, seconds: number): void {
    const until = c.time + seconds;
    const steer = () => {
        if (b.dead || b.life <= 0) return;
        if (c.time >= until || (c.phase !== 'waves' && c.phase !== 'warning' && c.phase !== 'boss')) {
            b.turn = 0;
            return;
        }
        if (b.delay <= 0 && c.player.alive) {
            const angle = Math.atan2(b.vy, b.vx);
            const want = aimAngle(c, b.x, b.y);
            const diff = Math.atan2(Math.sin(want - angle), Math.cos(want - angle));
            b.turn = Math.max(-rate, Math.min(rate, diff / 0.05));
            b.ax = Math.cos(angle) * 8; b.ay = Math.sin(angle) * 8;
        }
        c.schedule(0.05, steer);
    };
    c.schedule(0.05, steer);
}

function lock(e: Enemy, c: SfCombat): void {
    const a = aimAngle(c, e.x, e.y);
    e.aimX = Math.cos(a); e.aimY = Math.sin(a);
}

/** 抛出孢子雷：孢子雷自己按弧线飞向落点（不使用会让敌人“走完即离场”的路径运动）。 */
function lobMine(c: SfCombat, x: number, y: number, tx: number, ty: number): void {
    const m = c.spawnEnemy('sporemine', x, y, null);
    m.data.sx = x; m.data.sy = y; m.data.tx = tx; m.data.ty = ty; m.data.t = 0;
}

const SPORE_FLIGHT = 0.85;
const SPORE_FUSE = 2.6;

/** 孢子雷：0.85 秒弧线落地 → 随地面卷动，2.6 秒后炸成 8 向弹环；被打掉则不爆。 */
const sporemine: EnemyBehavior = {
    update(e, c, dt) {
        e.data.t += dt;
        const t = e.data.t;
        if (t < SPORE_FLIGHT) {
            const k = t / SPORE_FLIGHT;
            e.x = e.data.sx + (e.data.tx - e.data.sx) * k;
            e.y = e.data.sy + (e.data.ty - e.data.sy) * k + Math.sin(k * Math.PI) * 120;
            e.scale = 1 + Math.sin(k * Math.PI) * 0.5;
            e.data.ty -= c.scrollSpeed * dt;
            return;
        }
        e.scale = 1;
        e.y -= c.scrollSpeed * dt;
        const left = SPORE_FLIGHT + SPORE_FUSE - t;
        if (left < 0.8) e.windup = Math.max(e.windup, 0.1);
        if (left <= 0) {
            for (let i = 0; i < 8; i++) {
                const a = DOWN + i * Math.PI / 4 + 0.2;
                c.spawnEnemyBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, kind: 'orb-g', radius: 8, life: 6 });
            }
            c.emit({ type: 'explosion', x: e.x, y: e.y, size: 30, kind: 'bomb' });
            c.killEnemy(e, 'mechanic', false);
        }
    },
};

/** 吊丝蜘蛛：垂丝降到前方，左右轻荡；吐出的蛛网球落点处张开 4 秒的减速蛛网；9 秒后收丝离开。 */
const webs = new WeakMap<Enemy, EnemyBullet[]>();
const spider: EnemyBehavior = {
    spawn(e, c) {
        e.motion = null;
        e.data.baseX = e.x;
        // 悬停高度：编队可在生成后改写 data.home。
        e.data.home = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.72;
        e.data.spit = 1.6;
        webs.set(e, []);
    },
    update(e, c, dt) {
        const leaving = e.age > 9.5;
        const target = leaving ? c.bounds.top + 140 : e.data.home;
        const dy = target - e.y;
        e.y += Math.sign(dy) * Math.min(Math.abs(dy), (leaving ? 300 : 260) * dt);
        e.x = e.data.baseX + Math.sin(e.age * 1.6) * 28;
        e.vx = 0; e.vy = Math.sign(dy) * 200;
        c.addHazard({ kind: 'thread', ax: e.x, ay: c.bounds.top + 40, bx: e.x, by: e.y + 16, width: 1 });
        // 蛛网球到期（没有击中玩家）就张网。
        const list = webs.get(e) ?? [];
        for (let i = list.length - 1; i >= 0; i--) {
            const b = list[i];
            if (b.life <= 0.02 && !b.dead) b.dead = true;
            if (b.dead) {
                if (b.life <= 0.02) c.addHazard({ kind: 'web', ax: b.x, ay: b.y, bx: b.x, by: b.y, width: 78, life: 4 });
                list.splice(i, 1);
            }
        }
        if (leaving || Math.abs(dy) > 4 || !e.entered) return;
        e.data.spit -= dt;
        if (e.data.spit <= 0.5 && e.data.spit + dt > 0.5) { e.windup = 0.5; lock(e, c); }
        if (e.data.spit > 0) return;
        e.data.spit = 2.8;
        e.aimX = e.aimY = 0;
        const a = aimAngle(c, e.x, e.y);
        const dist = Math.hypot(c.player.x - e.x, c.player.y - e.y);
        const b = c.spawnEnemyBullet({ x: e.x, y: e.y - 14, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, kind: 'orb-l', radius: 11, life: Math.min(1.6, dist / 210 + 0.1) });
        list.push(b);
        c.emit({ type: 'shot', x: e.x, y: e.y, kind: 'web' });
    },
};

/** 孢子母菇：地面大蘑菇，每 2.4 秒孵出 2 只慢慢爬向玩家的孢子仔——优先打掉。 */
const sporemother: EnemyBehavior = {
    spawn(e) { e.data.hatch = 1.2; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 40 || e.y < c.bounds.bottom + 200) return;
        e.data.hatch -= dt;
        if (e.data.hatch <= 0.4 && e.data.hatch + dt > 0.4) e.windup = 0.4;
        if (e.data.hatch > 0) return;
        e.data.hatch = 2.4;
        for (const side of [-1, 1]) c.spawnEnemy('sporeling', e.x + side * 30, e.y - 20, null);
    },
};

/** 孢子仔：低速追踪（每秒最多转 1.6 弧度），碰到玩家自爆；8 秒后自行枯萎。 */
const sporeling: EnemyBehavior = {
    spawn(e, c) { e.motion = null; const a = aimAngle(c, e.x, e.y); e.data.a = a; },
    update(e, c, dt) {
        if (e.age > 8) { c.killEnemy(e, 'mechanic', false); return; }
        const want = aimAngle(c, e.x, e.y);
        const d = Math.atan2(Math.sin(want - e.data.a), Math.cos(want - e.data.a));
        e.data.a += Math.max(-1.6 * dt, Math.min(1.6 * dt, d));
        const speed = e.age < 0.4 ? 60 : 125;
        e.vx = Math.cos(e.data.a) * speed; e.vy = Math.sin(e.data.a) * speed - c.scrollSpeed * 0.2;
        e.x += e.vx * dt; e.y += e.vy * dt;
    },
};

/** 鳞粉蛾：飞过的路径每 0.14 秒留下一粒鳞粉，0.9 秒后鳞粉亮起成弹并缓缓下落。 */
const dustmoth: EnemyBehavior = {
    spawn(e) { e.data.dust = 0.3; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 20 || e.y < c.bounds.bottom + 260) return;
        e.data.dust -= dt;
        if (e.data.dust > 0) return;
        e.data.dust = 0.14;
        c.spawnEnemyBullet({ x: e.x, y: e.y + 6, vx: 0, vy: -55, kind: 'orb-s', radius: 6, delay: 0.9, life: 9 });
    },
};

/** 第 2 章 · 蘑菇森林 · 妖精与虫群。生物弹幕先蓄光，再出手。 */
export const CH2_ENEMIES: EnemyDef[] = [
    {
        id: 'firefly', name: '萤火虫群', frame: 'enemy/firefly', size: 'small', hp: T.small * 0.55,
        radius: 19, score: 120, energy: 1, coins: 1, body: 'flesh', contact: true, chapter: 2,
        intro: '沿正弦长链穿过森林，一击即坠；整条虫链全歼会留下零件。',
    },
    {
        id: 'shroom-gunner', name: '蘑菇炮手', frame: 'enemy/shroom-gunner', size: 'medium', hp: T.medium,
        radius: 32, score: 350, energy: 3, coins: 3, body: 'flesh', ground: true, chapter: 2,
        intro: '随树冠卷动，菌盖亮起后把孢子雷抛到你附近；孢子雷落地 2.6 秒后炸开，可以先打掉。',
        behavior: {
            spawn(e) { e.data.lob = 1.6; },
            update(e, c, dt) {
                if (!e.entered || e.y > c.bounds.top - 25 || e.y < c.bounds.bottom + 140) return;
                e.data.lob -= dt;
                if (e.data.lob <= 0.55 && e.data.lob + dt > 0.55) { e.windup = 0.55; lock(e, c); }
                if (e.data.lob > 0) return;
                e.data.lob = 3.4;
                e.aimX = e.aimY = 0;
                // 落点：玩家附近（偏离一点，给出走位空间）。
                const tx = Math.max(c.flight.left, Math.min(c.flight.right, c.player.x + c.rng.range(-90, 90)));
                const ty = Math.max(c.flight.bottom + 40, Math.min(e.y - 120, c.player.y + c.rng.range(40, 160)));
                lobMine(c, e.x, e.y - 10, tx, ty);
                c.emit({ type: 'shot', x: e.x, y: e.y, kind: 'spore' });
            },
        },
    },
    {
        id: 'dandelion', name: '蒲公英精', frame: 'enemy/dandelion', size: 'small', hp: T.small,
        radius: 25, score: 180, energy: 2, coins: 2, body: 'flesh', contact: true, chapter: 2,
        intro: '被击破后散开三颗种子，停顿一瞬，再缓缓追向飞机。',
        behavior: {
            death(e, c, reward) {
                if (!reward) return;
                c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'seed', value: 0.4 });
                const center = aimAngle(c, e.x, e.y);
                for (let i = -1; i <= 1; i++) {
                    const a = center + i * 0.65;
                    const b = c.spawnEnemyBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 82, vy: Math.sin(a) * 82,
                        kind: 'orb-g', radius: 7, delay: 0.4, maxSpeed: 110, life: 7 });
                    followSeed(c, b, 1.2, 3.2);
                }
            },
        },
    },
    {
        id: 'beetle', name: '甲虫骑士', frame: 'enemy/beetle', size: 'medium', hp: T.medium * 0.85,
        radius: 32, score: 450, energy: 4, coins: 4, body: 'flesh', contact: true, chapter: 2,
        intro: '飞到前方后缩成甲壳球，斜着滚向下方并在屏幕两侧反弹；缩球时甲壳减伤一半。',
        behavior: {
            spawn(e, c) {
                e.motion = null;
                e.data.stage = 0;
                e.data.home = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.8;
            },
            damage(e, _c, amount) { return e.data.stage >= 1 ? amount * 0.5 : amount; },
            update(e, c, dt) {
                const stage = e.data.stage;
                if (stage === 0) {
                    const dy = e.data.home - e.y;
                    e.vy = -Math.min(320, Math.max(70, Math.abs(dy) * 4));
                    e.y += Math.sign(dy) * Math.min(Math.abs(dy), -e.vy * dt);
                    if (Math.abs(dy) < 3) {
                        e.data.stage = 1; e.data.wait = 0.55; e.windup = 0.55;
                        e.frame = 'enemy/beetle-ball';
                        c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'curl', value: 0.55 });
                    }
                } else if (stage === 1) {
                    e.data.wait -= dt;
                    e.angle += dt * 6;
                    if (e.data.wait <= 0) {
                        e.data.stage = 2;
                        // 朝玩家所在一侧斜滚，速度固定，可预判反弹。
                        e.data.dx = (c.player.x >= e.x ? 1 : -1) * 300;
                        e.data.dy = -230;
                    }
                } else {
                    e.x += e.data.dx * dt; e.y += e.data.dy * dt;
                    e.vx = e.data.dx; e.vy = e.data.dy;
                    e.angle += dt * Math.sign(e.data.dx) * -9;
                    const edge = c.bounds.right - e.radius - 8;
                    if (Math.abs(e.x) > edge) {
                        e.x = Math.sign(e.x) * edge;
                        e.data.dx = -e.data.dx;
                        c.emit({ type: 'explosion', x: e.x, y: e.y, size: 0, kind: 'bounce' });
                    }
                }
            },
        },
    },
    {
        id: 'maneater', name: '食人花', frame: 'enemy/maneater', size: 'medium', hp: T.medium * 1.1,
        radius: 34, score: 400, energy: 3, coins: 4, body: 'flesh', ground: true, chapter: 2,
        intro: '长在屏幕边缘，张口预警后甩出横扫整行的藤鞭；看到绿色虚线就离开那一行。',
        behavior: {
            spawn(e) { e.data.cd = 1.4; e.data.lash = -1; },
            update(e, c, dt) {
                if (!e.entered || e.y > c.bounds.top - 60 || e.y < c.bounds.bottom + 150) return;
                const toward = e.x < 0 ? 1 : -1;
                const far = toward * (c.bounds.right + 40);
                if (e.data.lash >= 0) {
                    e.data.lash += dt;
                    const t = e.data.lash;
                    if (t < 0.9) {
                        c.addHazard({ kind: 'vine', ax: e.x, ay: e.y, bx: far, by: e.y, width: 13, warn: 1 - t / 0.9 });
                    } else if (t < 1.25) {
                        // 鞭身从花口向外甩出。
                        const k = Math.min(1, (t - 0.9) / 0.12);
                        c.addHazard({ kind: 'vine', ax: e.x, ay: e.y, bx: e.x + (far - e.x) * k, by: e.y, width: 13 });
                    } else { e.data.lash = -1; e.data.cd = 2.6; }
                    return;
                }
                e.data.cd -= dt;
                if (e.data.cd <= 0) {
                    e.data.lash = 0; e.windup = 0.9;
                    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'mouth', value: 0.9 });
                }
            },
        },
    },
    {
        id: 'treant', name: '树精巫师', frame: 'enemy/treant', size: 'elite', hp: T.elite,
        radius: 52, score: 1800, energy: 6, coins: 14, body: 'wood', contact: true, chapter: 2,
        intro: '每四秒淡出并瞬移，在新位置布下先停顿后轻微追踪的弹环；击破掉两个零件。',
        behavior: {
            spawn(e, c) {
                e.motion = null; e.alpha = 1;
                e.extraDrops = ['wing', 'special'];
                e.data.home = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.75;
                e.data.hold = 18; e.data.depart = 0; e.data.blink = -1; e.data.next = 4;
            },
            damage(e, _c, amount) { return (e.alpha ?? 1) < 0.3 ? 0 : amount; },
            update(e, c, dt) {
                if (!(e.data.depart > 0)) {
                    const home = e.data.home ?? c.bounds.top - 300;
                    const dy = home - e.y;
                    e.vy = Math.sign(dy) * Math.min(240, Math.abs(dy) * 4 + 20);
                    e.y += Math.sign(dy) * Math.min(Math.abs(dy), Math.abs(e.vy) * dt);
                    if (Math.abs(dy) < 2) { e.data.depart = e.age + (e.data.hold ?? 18); e.vy = 0; }
                    return;
                }
                if (e.age >= e.data.depart) { e.alpha = 1; e.y += 220 * dt; e.vy = 220; return; }
                e.vx = e.vy = 0;
                if ((e.data.blink ?? -1) >= 0) {
                    e.data.blink += dt;
                    const t = e.data.blink;
                    if (t < 0.35) e.alpha = 1 - t / 0.35;
                    else if (t < 0.7) {
                        if (!e.data.jumped) {
                            e.x = c.rng.range(c.bounds.left + 90, c.bounds.right - 90);
                            e.y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * c.rng.range(0.67, 0.83);
                            e.data.jumped = 1;
                        }
                        e.alpha = (t - 0.35) / 0.35;
                    } else {
                        e.alpha = 1; e.data.blink = -1; e.data.next = 3.3;
                        for (let i = 0; i < 12; i++) {
                            const a = DOWN + Math.PI * 2 * i / 12;
                            const b = c.spawnEnemyBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95,
                                kind: 'orb-g', radius: 8, delay: 0.7, maxSpeed: 110, life: 8 });
                            followSeed(c, b, 0.45, 3.4);
                        }
                    }
                } else {
                    e.data.next = (e.data.next ?? 4) - dt;
                    if (e.data.next <= 0) {
                        e.data.blink = 0; e.data.jumped = 0; e.windup = 0.7;
                        c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'blink', value: 0.7 });
                    }
                }
            },
        },
    },
    {
        id: 'spider', name: '吊丝蜘蛛', frame: 'enemy/spider', size: 'medium', hp: T.medium * 0.9,
        radius: 34, score: 420, energy: 3, coins: 4, body: 'flesh', contact: true, chapter: 2, behavior: spider,
        intro: '垂着蛛丝降到前方，吐出的蛛网球落地张开蛛网，网里飞行会变慢。',
    },
    {
        id: 'sporemother', name: '孢子母菇', frame: 'enemy/sporemother', size: 'large', hp: T.large * 0.55,
        radius: 52, score: 900, energy: 5, coins: 8, body: 'flesh', ground: true, chapter: 2, behavior: sporemother,
        intro: '不断孵出爬向你的孢子仔，放着不管会越聚越多——优先打掉它。',
    },
    {
        id: 'sporeling', name: '孢子仔', frame: 'enemy/sporeling', size: 'small', hp: T.small * 0.4,
        radius: 16, score: 60, energy: 1, coins: 0, body: 'flesh', contact: true, chapter: 2, behavior: sporeling,
        intro: '孢子母菇孵出的小东西，慢慢追着你爬，碰到就会自爆。',
    },
    {
        id: 'dustmoth', name: '鳞粉蛾', frame: 'enemy/dustmoth', size: 'small', hp: T.small * 1.2,
        radius: 28, score: 200, energy: 2, coins: 2, face: true, body: 'flesh', contact: true, chapter: 2, behavior: dustmoth,
        intro: '飞过的路线会留下一串鳞粉，鳞粉亮起后变成慢速弹幕下落。',
    },
    {
        id: 'sporemine', name: '孢子雷', frame: 'enemy/sporemine', size: 'small', hp: T.small * 0.6,
        radius: 18, score: 80, energy: 1, coins: 0, body: 'flesh', ground: true, contact: false, chapter: 2, behavior: sporemine,
        intro: '蘑菇炮手抛出的孢子雷，落地后不久炸成一圈孢子弹。',
    },
];
