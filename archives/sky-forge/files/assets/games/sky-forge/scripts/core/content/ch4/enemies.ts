import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { SfCombat } from '../../SfCombat';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { DOWN, STYLE, aimAngle, aimed, fan, lob, ring, shoot } from '../../SfPatterns';

const T = HP_UNITS;

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
const clampX = (c: SfCombat, x: number, margin: number) => Math.max(c.bounds.left + margin, Math.min(c.bounds.right - margin, x));
const active = (c: SfCombat) => c.phase === 'waves' || c.phase === 'warning' || c.phase === 'boss';

/** 火蝠：走位由群聚编队控制；出生时打散开火计时，避免整群同时吐火。 */
const firebat: EnemyBehavior = {
    spawn(e, c) { e.fires.forEach(f => { f.timer += c.rng.range(0, 4.5); }); },
};

const SLIME_REST = 0.75;
const SLIME_AIR = 0.75;
const SLIME_HOPS = 5;

/**
 * 熔岩史莱姆：在地面上休息（随地面卷动）→ 落点亮阴影圈 → 抛物线跳过去 → 落地留下 3 秒熔岩滩。
 * 跳满 5 次后从侧边跳出场。data：dir 横向方向、rest 剩余休息、air 已滞空、sx/sy 起点、tx/ty 落点、hops 已跳次数。
 */
const lavaslime: EnemyBehavior = {
    spawn(e) {
        e.data.dir = e.data.dir || (e.x >= 0 ? -1 : 1);
        e.data.rest = e.data.rest ?? 0.3;
        e.data.air = -1;
        e.data.hops = 0;
    },
    update(e, c, dt) {
        if (e.data.air < 0) {
            // 休息：首跳前从屏幕上方落下，之后贴地随卷动。
            if (e.data.hops > 0) e.y -= c.scrollSpeed * dt;
            e.data.rest -= dt;
            if (e.data.rest > 0) return;
            const leaving = e.data.hops >= SLIME_HOPS;
            let tx: number, ty: number;
            if (e.data.hops === 0) {
                tx = e.x; ty = yAt(c, e.data.firstY || 0.8);
            } else if (leaving) {
                tx = e.data.dir * (c.bounds.right + 220); ty = e.y + 60;
            } else {
                tx = e.x + e.data.dir * c.rng.range(90, 150);
                if (Math.abs(tx) > c.bounds.right - 60) { e.data.dir = -e.data.dir; tx = e.x + e.data.dir * c.rng.range(90, 150); }
                ty = Math.max(yAt(c, 0.34), e.y - c.rng.range(60, 110));
            }
            e.data.sx = e.x; e.data.sy = e.y; e.data.tx = tx; e.data.ty = ty; e.data.air = 0;
            if (!leaving) c.addHazard({ kind: 'mark', ax: tx, ay: ty, bx: tx, by: ty, width: 34, warn: 1, warnTime: SLIME_AIR, life: SLIME_AIR });
            return;
        }
        e.data.air += dt;
        const k = Math.min(1, e.data.air / SLIME_AIR);
        const px = e.x, py = e.y;
        e.x = e.data.sx + (e.data.tx - e.data.sx) * k;
        e.y = e.data.sy + (e.data.ty - e.data.sy) * k + Math.sin(k * Math.PI) * 90;
        e.scale = 1 + Math.sin(k * Math.PI) * 0.3;
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        if (k < 1) return;
        e.scale = 1;
        e.data.air = -1;
        e.data.hops++;
        e.data.rest = SLIME_REST;
        if (e.data.hops <= SLIME_HOPS && e.data.hops > 1 && active(c)) {
            c.addLava(e.x, e.y, 36, 3);
            c.emit({ type: 'explosion', x: e.x, y: e.y, size: 36, kind: 'lava' });
        }
    },
};

/** 钻岩矿车：沿轨道高速通过（轨道编队控制走位），车斗向轨道两侧抛碎石；靠近玩家所在高度后停止抛石。 */
const minecart: EnemyBehavior = {
    spawn(e) { e.data.throwAt = 0.15; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 20 || e.y < c.player.y + 120) return;
        e.data.throwAt -= dt;
        if (e.data.throwAt > 0) return;
        e.data.throwAt = 0.2;
        const heading = Math.atan2(e.vy, e.vx);
        for (const side of [-1, 1]) {
            shoot(c, e.x, e.y, heading + side * Math.PI / 2 + c.rng.range(-0.15, 0.15), 125, STYLE.rock);
        }
    },
};

/** 熔岩间歇泉：每 3.6 秒冒泡 1 秒，然后向四周抛出 5 团熔岩，落点变成熔岩滩。 */
const geyser: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(0.5, 1.6); },
    update(e, c, dt) {
        if (!e.entered) return;
        e.data.t += dt;
        const cycle = e.data.t % 3.6;
        if (cycle >= 2.6 && cycle - dt < 2.6) e.windup = 1;
        if (cycle >= dt || e.data.t < 3.6) return;
        if (e.y > c.bounds.top - 30 || e.y < c.bounds.bottom + 200 || !active(c)) return;
        for (let i = 0; i < 5; i++) {
            const a = DOWN + (i - 2) * 0.62 + c.rng.range(-0.15, 0.15);
            const d = c.rng.range(130, 260);
            lob(c, e.x, e.y, clampX(c, e.x + Math.cos(a) * d, 30), e.y + Math.sin(a) * d * 0.9,
                c.rng.range(1.0, 1.3), 180, { ...STYLE.ember, pool: { radius: 34, life: 3 } });
        }
        c.emit({ type: 'boss-attack', x: e.x, y: e.y, kind: 'geyser' });
    },
};

const BOULDER_FALL = 1.6;

/**
 * 火山落石：从屏幕上方落向预定落点，落点阴影圈提前亮起；落地炸成一圈碎石。
 * 空中被打碎则只碎成 3 块慢速碎石。data：tx/ty 落点、sy 起始高度、t 已下落时间。
 */
const boulder: EnemyBehavior = {
    spawn(e) { e.data.t = 0; e.data.sy = e.y; },
    update(e, c, dt) {
        // 落点由编队在生成后写入 data.tx / data.ty，所以阴影圈在第一帧才登记。
        if (e.data.t === 0) {
            e.data.tx = e.data.tx ?? e.x;
            e.data.ty = e.data.ty ?? yAt(c, 0.35);
            c.addHazard({ kind: 'mark', ax: e.data.tx, ay: e.data.ty, bx: e.data.tx, by: e.data.ty, width: 44, warn: 1, warnTime: BOULDER_FALL, life: BOULDER_FALL });
        }
        e.data.t += dt;
        const k = Math.min(1, e.data.t / BOULDER_FALL);
        const py = e.y;
        e.x = e.data.tx;
        e.y = e.data.sy + (e.data.ty - e.data.sy) * k * k;
        e.vy = (e.y - py) / Math.max(dt, 1e-4); e.vx = 0;
        e.scale = 1.3 - 0.3 * k;
        e.angle += dt * 2.4;
        if (k < 1) return;
        if (active(c)) {
            ring(c, e.x, e.y, 8, 150, c.rng.next() * Math.PI, STYLE.rock);
            c.emit({ type: 'explosion', x: e.x, y: e.y, size: 40, kind: 'keg' });
        }
        c.killEnemy(e, 'mechanic', false);
    },
    death(e, c, reward) {
        if (!reward || !active(c)) return;
        fan(c, e.x, e.y, DOWN, 3, 70, 115, STYLE.rock);
    },
};

/** 熔炉矿工机：悬停稳定后炉口蓄热 1.5 秒，喷出持续 2 秒的扇形火焰，每第 5 团火焰落地留下熔岩滩。 */
const furnace: EnemyBehavior = {
    spawn(e) { e.data.state = 0; e.data.t = 0; e.data.shot = 0; e.data.n = 0; },
    update(e, c, dt) {
        if (!e.entered || e.data.state === 3) return;
        if (e.data.state === 0) {
            if (Math.abs(e.vy) > 25 || e.y > c.bounds.top - 60) return;
            e.data.state = 1; e.data.t = 0; e.windup = 1.5;
            c.emit({ type: 'telegraph', x: e.x, y: e.y - 30, kind: 'furnace' });
            return;
        }
        e.data.t += dt;
        if (e.data.state === 1) {
            if (e.data.t >= 1.5) { e.data.state = 2; e.data.t = 0; }
            return;
        }
        if (e.data.t >= 2) { e.data.state = 3; e.angle = 0; return; }
        // 火焰锥缓慢转向玩家，最多偏离正下方 0.5 弧度。
        const want = Math.max(DOWN - 0.5, Math.min(DOWN + 0.5, aimAngle(c, e.x, e.y)));
        e.data.aim = e.data.aim === undefined ? DOWN : e.data.aim + Math.max(-0.6 * dt, Math.min(0.6 * dt, want - e.data.aim));
        e.angle = e.data.aim - DOWN;
        e.data.shot -= dt;
        while (e.data.shot <= 0 && c.player.y < e.y + 40) {
            e.data.shot += 0.06;
            const pool = ++e.data.n % 5 === 0;
            shoot(c, e.x, e.y - 34, e.data.aim + c.rng.range(-0.35, 0.35), c.rng.range(240, 280), {
                kind: 'orb-o', radius: 8, life: 1.1,
                ...(pool ? { fuse: 1.0, pool: { radius: 30, life: 2.5 } } : {}),
            });
        }
    },
};

const crystals = new WeakMap<Enemy, Enemy[]>();

/** 黑曜石魔像（精英）：四块护盾水晶绕身旋转，还有水晶存活时本体几乎打不动；定时砸地震出一圈碎石。 */
const golem: EnemyBehavior = {
    spawn(e, c) {
        const list: Enemy[] = [];
        for (let i = 0; i < 4; i++) {
            const p = c.spawnEnemy('golem-crystal', e.x, e.y, null, { parent: e, persistent: true });
            p.partTag = 'golem-crystal';
            p.data.a = i * Math.PI / 2;
            list.push(p);
        }
        crystals.set(e, list);
        e.shieldParts = list;
        e.data.slam = 2.2;
    },
    update(e, c, dt) {
        for (const p of crystals.get(e) ?? []) {
            if (p.dead) continue;
            p.data.a += dt * 0.9;
            p.ox = Math.cos(p.data.a) * 96;
            p.oy = Math.sin(p.data.a) * 70;
            p.angle = p.data.a;
        }
        if (!e.entered || Math.abs(e.vy) > 30) return;
        e.data.slam -= dt;
        if (e.data.slam <= 0.6 && e.data.slam + dt > 0.6) e.windup = 0.6;
        if (e.data.slam > 0) return;
        e.data.slam = 2.8;
        if (!active(c) || c.player.y > e.y) return;
        ring(c, e.x, e.y - 30, 12, 160, c.rng.next() * Math.PI, STYLE.rock);
        aimed(c, e.x, e.y - 40, 3, 26, 210, STYLE.ember);
        c.emit({ type: 'boss-attack', x: e.x, y: e.y, kind: 'golem-slam' });
    },
};

/** 护盾水晶被打碎时，三块碎片朝玩家弹回。 */
const golemCrystal: EnemyBehavior = {
    death(e, c, reward) {
        if (!reward || !active(c)) return;
        aimed(c, e.x, e.y, 3, 24, 200, STYLE.rock);
    },
};

/** 第 4 章 · 熔岩火山 · 炎魔与矿械。 */
export const CH4_ENEMIES: EnemyDef[] = [
    {
        id: 'firebat', name: '火蝠', frame: 'enemy/firebat', size: 'small', hp: T.small * 0.7,
        radius: 25, score: 90, energy: 1, coins: 1, face: true, body: 'flesh', contact: true, chapter: 4, behavior: firebat,
        fire: [{ pattern: 'aimed', interval: 5.5, speed: 170, kind: 'orb-os', radius: 7, delay: 2, windup: 0.3 }],
        intro: '成群结队地游走，子弹打进群里时会散开躲避火线，散开后又重新聚拢。',
    },
    {
        id: 'lavaslime', name: '熔岩史莱姆', frame: 'enemy/lavaslime', size: 'small', hp: T.small * 1.4,
        radius: 26, score: 160, energy: 2, coins: 2, body: 'flesh', contact: true, chapter: 4, behavior: lavaslime,
        intro: '跳着穿过战场，落点先亮起阴影圈，每次落地留下一摊烧三秒的熔岩。',
    },
    {
        id: 'minecart', name: '钻岩矿车', frame: 'enemy/minecart', size: 'medium', hp: T.medium * 0.6,
        radius: 26, score: 220, energy: 2, coins: 2, face: true, body: 'metal', ground: true, contact: false, chapter: 4, behavior: minecart,
        intro: '轨道先亮起，矿车随后沿轨道冲过，向两侧抛出碎石——别待在轨道旁边。',
    },
    {
        id: 'geyser', name: '熔岩间歇泉', frame: 'enemy/geyser', size: 'medium', hp: T.medium * 0.9,
        radius: 32, score: 300, energy: 3, coins: 3, body: 'metal', ground: true, contact: false, chapter: 4, behavior: geyser,
        intro: '地面裂口冒泡一秒后向四周喷出熔岩团，落点变成熔岩滩；可以先打掉。',
    },
    {
        id: 'boulder', name: '火山落石', frame: 'enemy/boulder', size: 'small', hp: T.small * 1.5,
        radius: 26, score: 120, energy: 1, coins: 1, body: 'metal', contact: true, chapter: 4, behavior: boulder,
        intro: '阴影圈标出落点，落地炸成一圈碎石；在空中打碎只会剩三块慢速碎石。',
    },
    {
        id: 'furnace', name: '熔炉矿工机', frame: 'enemy/furnace', size: 'medium', hp: T.medium * 1.4,
        radius: 40, score: 480, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 4, behavior: furnace,
        intro: '悬停后炉口越烧越亮，随后喷出两秒扇形火焰并留下熔岩滩，趁蓄热时打掉它。',
    },
    {
        id: 'golem', name: '黑曜石魔像', frame: 'enemy/golem', size: 'elite', hp: T.elite * 0.7,
        radius: 58, score: 2000, energy: 8, coins: 14, body: 'metal', contact: true, chapter: 4, behavior: golem,
        intro: '精英。四块旋转的护盾水晶挡住子弹，全部打碎才能真正伤到本体，水晶碎片会朝你弹回。',
    },
    {
        id: 'golem-crystal', name: '护盾水晶', frame: 'enemy/golem-crystal', size: 'part', hp: T.elite * 0.1,
        radius: 18, score: 200, energy: 2, coins: 1, body: 'metal', contact: false, chapter: 4, behavior: golemCrystal,
        intro: '黑曜石魔像的护盾来源。',
    },
];
