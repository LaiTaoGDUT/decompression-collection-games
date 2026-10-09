import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { SfCombat } from '../../SfCombat';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { ChargeMotion, GroundMotion, HoverMotion, LinearMotion } from '../../SfMotion';
import { DOWN, STYLE, aimAngle, fan, ring, shoot } from '../../SfPatterns';

const T = HP_UNITS;

/** 雷鱼只做一次锁定冲刺；各种入场编队共用同一套可读预警。 */
const thunderfish: EnemyBehavior = {
    spawn(e, c) {
        const y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.79;
        e.motion = new ChargeMotion(y, 0.7, 920);
        e.data.locked = 0;
    },
    update(e) {
        if (!e.data.locked && (e.aimX !== 0 || e.aimY !== 0)) {
            e.data.locked = 1;
            e.windup = 0.7;
        }
    },
};

/** 两端入场并充能后才有伤害；每对只判定一次，不叠加伤害。 */
const buoy: EnemyBehavior = {
    update(e, c, dt) {
        const other = e.link;
        if (!other || e.dead || other.dead) { e.link = undefined; return; }
        if (!e.entered || !other.entered) return;
        if (e.data.charge === undefined) {
            e.data.charge = 0.8;
            e.windup = other.windup = 0.8;
            c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'electric-net' });
        }
        e.data.charge = Math.max(0, e.data.charge - dt);
        if (e.data.charge > 0 || (other.data.charge ?? 1) > 0 || e.id > other.id) return;
        if (c.phase !== 'waves' && c.phase !== 'warning' && c.phase !== 'boss') return;
        const dx = other.x - e.x, dy = other.y - e.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return;
        const u = Math.max(0, Math.min(1, ((c.player.x - e.x) * dx + (c.player.y - e.y) * dy) / len2));
        if (Math.hypot(c.player.x - e.x - dx * u, c.player.y - e.y - dy * u) < 16) {
            // 核心已有统一受伤逻辑；当前类型将这个运行时接口标成了 private。
            c.hurtPlayer();
        }
    },
    death(e) {
        if (e.link) e.link.link = undefined;
        e.link = undefined;
    },
};

/** 炮塔已画在舰体帧内，这里只挂血条、判定和开火口。 */
const turret: EnemyDef = {
    id: 'destroyer-turret', name: '驱逐舰炮塔', frame: '', size: 'part', hp: T.large * 0.14,
    radius: 21, score: 220, energy: 2, coins: 2, body: 'metal', ground: true, contact: false, chapter: 3,
    fire: [{ pattern: 'aimed', interval: 2.8, speed: 260, kind: 'orb-s', radius: 7,
        burst: 3, burstGap: 0.16, delay: 1.8, windup: 0.55, muzzle: { x: 0, y: -12 } }],
    intro: '甲板上的三座独立炮塔，蓄力后发射瞄准三连弹。',
};

const destroyer: EnemyBehavior = {
    spawn(e, c) {
        const offsets = [[-24, -62], [0, 0], [24, 62]];
        for (let i = 0; i < offsets.length; i++) {
            const [ox, oy] = offsets[i];
            const p = c.spawnEnemy(turret, e.x + ox, e.y + oy, null,
                { parent: e, ox, oy, persistent: true, frame: '' });
            p.partTag = 'destroyer-turret';
            p.fires.forEach(f => { f.timer += i * 0.55; });
            if (i === 0) e.coveredBy = p;
        }
    },
    update(e, c) {
        // coveredBy 让舰体不拦截子弹，玩家能沿中线逐个击毁炮塔。
        e.coveredBy = c.enemies.find(p => p.parent === e && !p.dead && p.partTag === 'destroyer-turret');
    },
};

/** 定点扫射：停稳、亮灯、摆动弹流，结束后向上离场。 */
const heli: EnemyBehavior = {
    spawn(e, c) {
        const y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.72;
        e.motion = new HoverMotion(e, y, 6, 260, 0, 8);
        e.data.sweep = -1;
        e.data.shot = 0;
    },
    update(e, c, dt) {
        if (!e.entered || e.data.sweep === -2) return;
        if (e.data.sweep < 0) {
            if (Math.abs(e.vy) > 25) return;
            e.data.sweep = 0;
            e.windup = 0.65;
            c.emit({ type: 'telegraph', x: e.x, y: e.y - 24, kind: 'heli-sweep' });
        }
        e.data.sweep += dt;
        if (e.data.sweep < 0.65) return;
        if (e.data.sweep > 4.65) {
            e.data.sweep = -2;
            e.aimX = e.aimY = 0;
            e.motion = new LinearMotion(e.x > 0 ? 90 : -90, 280);
            return;
        }
        const a = DOWN + Math.sin((e.data.sweep - 0.65) * 2.1) * 0.68;
        e.angle = a - DOWN;
        e.data.shot -= dt;
        if (e.data.shot <= 0 && c.player.y < e.y + 40) {
            shoot(c, e.x, e.y - 28, a, 245, STYLE.small);
            e.data.shot = 0.16;
        }
    },
};

/** 海面精英：2.5 秒潜航、2 秒浮出，潜航期间不会碰撞玩家。 */
const sharksub: EnemyBehavior = {
    spawn(e) {
        e.alpha = 0.25;
        e.damageScale = 0;
        e.data.surface = 0;
        e.data.left = 2.5;
        e.data.shot = 0.45;
        e.extraDrops = ['wing', 'special'];
        e.motion = e.motion ?? new GroundMotion();
    },
    update(e, c, dt) {
        if (!e.entered) return;
        e.data.left -= dt;
        if (e.data.left <= 0) {
            e.data.surface = e.data.surface ? 0 : 1;
            e.data.left = e.data.surface ? 2 : 2.5;
            e.data.shot = 0.45;
            e.alpha = e.data.surface ? 1 : 0.25;
            e.windup = 0.45;
            c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: e.data.surface ? 'surface' : 'dive' });
        }
        e.damageScale = e.data.surface ? 1 : 0;
        if (!e.data.surface) {
            if (e.data.left < 0.5) e.windup = Math.max(e.windup, e.data.left);
            return;
        }
        e.data.shot -= dt;
        if (e.data.shot <= 0 && e.y > c.bounds.bottom + 60 && c.player.alive) {
            fan(c, e.x, e.y - 32, DOWN, 5, 64, 200, STYLE.orange);
            e.data.shot = 0.95;
            e.windup = 0.35;
        }
    },
    damage(e, _c, amount) { return e.data.surface ? amount : 0; },
};

/** 投放水雷：水雷自己沿弧线飞到落点，然后随海面卷动。 */
function dropMine(c: SfCombat, x: number, y: number, tx: number, ty: number, delay: number): void {
    const m = c.spawnEnemy('seamine', x, y, null);
    m.data.sx = x; m.data.sy = y; m.data.tx = tx; m.data.ty = ty; m.data.t = -delay;
    m.alpha = 0;
}

const MINE_FLIGHT = 0.7;

/** 布雷机：飞到前方悬停，亮灯后在下方投下 3×2 水雷阵，然后离场。 */
const minelayer: EnemyBehavior = {
    spawn(e, c) {
        const y = c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * 0.84;
        e.motion = new HoverMotion(e, y, 2.6, 240, 0, 6);
        e.data.laid = 0;
    },
    update(e, c, dt) {
        if (e.data.laid || !e.entered || Math.abs(e.vy) > 20 || e.y > c.bounds.top - 60) return;
        e.data.wait = (e.data.wait ?? 0.6) - dt;
        if (e.windup <= 0 && e.data.wait > 0.1) e.windup = e.data.wait;
        if (e.data.wait > 0) return;
        e.data.laid = 1;
        let i = 0;
        for (const ty of [e.y - 250, e.y - 420]) {
            for (const dx of [-170, 0, 170]) {
                const tx = Math.max(c.bounds.left + 50, Math.min(c.bounds.right - 50, e.x + dx));
                dropMine(c, e.x, e.y - 20, tx, ty, i++ * 0.08);
            }
        }
        c.emit({ type: 'shot', x: e.x, y: e.y, kind: 'mines' });
    },
};

/** 水雷：落水后随海面漂下；玩家靠近 110 像素亮灯 0.6 秒后炸成 10 向弹环，7 秒后也会自爆。 */
const seamine: EnemyBehavior = {
    update(e, c, dt) {
        e.data.t += dt;
        const t = e.data.t;
        if (t < 0) { e.damageScale = 0; return; }
        if (t < MINE_FLIGHT) {
            const k = t / MINE_FLIGHT;
            e.alpha = 1; e.damageScale = 1;
            e.x = e.data.sx + (e.data.tx - e.data.sx) * k;
            e.y = e.data.sy + (e.data.ty - e.data.sy) * k + Math.sin(k * Math.PI) * 60;
            e.scale = 1 + Math.sin(k * Math.PI) * 0.4;
            e.data.ty -= c.scrollSpeed * dt;
            return;
        }
        e.scale = 1;
        e.y -= c.scrollSpeed * dt;
        if (!e.data.arm && (Math.hypot(c.player.x - e.x, c.player.y - e.y) < 110 || t > MINE_FLIGHT + 7)) {
            e.data.arm = 0.6; e.windup = 0.6;
        }
        if (e.data.arm) {
            e.data.arm -= dt;
            if (e.data.arm <= 0) {
                ring(c, e.x, e.y, 10, 175, c.rng.next(), STYLE.orangeSmall);
                c.emit({ type: 'explosion', x: e.x, y: e.y, size: 32, kind: 'bomb' });
                c.killEnemy(e, 'mechanic', false);
            }
        }
    },
};

const guns = new WeakMap<Enemy, Enemy>();

/** 激光平台：底座被炮头遮挡（不受伤、不显示血条），炮头被毁时整座平台炸毁。 */
const laserdeck: EnemyBehavior = {
    spawn(e, c) {
        e.base = true;
        const g = c.spawnEnemy('laserdeck-gun', e.x, e.y + 4, null, { parent: e, ox: 0, oy: 4, persistent: true });
        g.drop = e.drop;
        e.drop = undefined;
        e.coveredBy = g;
        guns.set(e, g);
    },
    update(e, c) {
        const g = guns.get(e);
        if (g && g.dead) { e.coveredBy = undefined; c.killEnemy(e, 'mechanic', true); }
    },
};

/** 激光炮头：追踪 1.4 秒 → 锁定预警 0.8 秒 → 发射 1.1 秒（缓慢扫向玩家）→ 冷却 1 秒。 */
const laserGun: EnemyBehavior = {
    spawn(e) { e.data.a = DOWN; e.data.t = 0.6; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 30 || e.y < c.bounds.bottom + 160) { e.angle = e.data.a - DOWN; return; }
        e.data.t += dt;
        const t = e.data.t % 4.3;
        const want = aimAngle(c, e.x, e.y);
        const turn = (rate: number) => {
            const d = Math.atan2(Math.sin(want - e.data.a), Math.cos(want - e.data.a));
            e.data.a += Math.max(-rate * dt, Math.min(rate * dt, d));
        };
        if (t < 1.4) turn(1.5);
        else if (t >= 2.2 && t < 3.3) turn(0.22);
        e.angle = e.data.a - DOWN;
        const dx = Math.cos(e.data.a), dy = Math.sin(e.data.a);
        const ax = e.x + dx * 30, ay = e.y + dy * 30;
        if (t >= 1.4 && t < 2.2) {
            if (e.windup <= 0) e.windup = 2.2 - t;
            c.addHazard({ kind: 'laser', ax, ay, bx: ax + dx * 1500, by: ay + dy * 1500, width: 12, warn: (2.2 - t) / 0.8 });
        } else if (t >= 2.2 && t < 3.3) {
            c.addHazard({ kind: 'laser', ax, ay, bx: ax + dx * 1500, by: ay + dy * 1500, width: 12 });
        }
    },
};

const guarded = new WeakMap<Enemy, Enemy[]>();

/** 护盾无人机：给 300 像素内最近的 2 个普通敌人套上护罩（只受 20% 伤害），自身不开火。 */
const shielddrone: EnemyBehavior = {
    update(e, c) {
        const old = guarded.get(e) ?? [];
        for (const t of old) if (t.guard === e) t.guard = undefined;
        if (!e.entered) { guarded.set(e, []); return; }
        const picks = c.enemies
            // 只守护能被直接打到的单位（被炮塔遮挡的舰体不算，炮塔本身算）。
            .filter(t => !t.dead && t !== e && t.entered && !t.boss && !(t.parent && t.parent.boss) && t.def.id !== 'shielddrone'
                && !t.wreck && !(t.coveredBy && !t.coveredBy.dead) && Math.hypot(t.x - e.x, t.y - e.y) < 300)
            .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
            .slice(0, 2);
        for (const t of picks) t.guard = e;
        guarded.set(e, picks);
    },
    death(e) {
        for (const t of guarded.get(e) ?? []) if (t.guard === e) t.guard = undefined;
    },
};

/** 导弹快艇：随海面卷入，亮灯后从两条滑轨各射出 1 枚可被击落的慢速追踪导弹。 */
const missileboat: EnemyBehavior = {
    spawn(e) { e.data.launch = 1.6; },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 40 || e.y < c.bounds.bottom + 220) return;
        e.data.launch -= dt;
        if (e.data.launch <= 0.5 && e.data.launch + dt > 0.5) e.windup = 0.5;
        if (e.data.launch > 0) return;
        e.data.launch = 3.4;
        for (const side of [-1, 1]) {
            const m = c.spawnEnemy('emissile', e.x + side * 12, e.y - 30, null);
            m.data.a = DOWN + side * 0.5;
        }
        c.emit({ type: 'missile', x: e.x, y: e.y });
    },
};

/** 敌方导弹：前 2.2 秒以每秒 1.8 弧度追踪玩家，之后直飞；可以被击落。 */
const emissile: EnemyBehavior = {
    spawn(e) { e.motion = null; },
    update(e, c, dt) {
        if (e.age < 2.2) {
            const want = aimAngle(c, e.x, e.y);
            const d = Math.atan2(Math.sin(want - e.data.a), Math.cos(want - e.data.a));
            e.data.a += Math.max(-1.8 * dt, Math.min(1.8 * dt, d));
        }
        const speed = 170 + Math.min(1, e.age / 1.5) * 110;
        e.vx = Math.cos(e.data.a) * speed; e.vy = Math.sin(e.data.a) * speed;
        e.x += e.vx * dt; e.y += e.vy * dt;
    },
};

/** 第 3 章 · 雷暴钢海 · 铁潮舰队。 */
export const CH3_ENEMIES: EnemyDef[] = [
    {
        id: 'thunderfish', name: '雷鱼无人机', frame: 'enemy/thunderfish', size: 'small', hp: T.small,
        radius: 25, score: 140, energy: 1, coins: 1, face: true, body: 'metal', contact: true, chapter: 3,
        behavior: thunderfish, intro: '锁定线亮起后高速突刺，横移躲开已经锁定的方向。',
    },
    {
        id: 'buoy', name: '电磁浮标', frame: 'enemy/buoy', size: 'small', hp: T.small * 1.2,
        radius: 27, score: 180, energy: 2, coins: 2, body: 'metal', ground: true, contact: false, chapter: 3,
        behavior: buoy, intro: '两枚浮标充能后拉起电网，击破任意一端即可断电。',
    },
    {
        id: 'minelayer', name: '布雷机', frame: 'enemy/minelayer', size: 'medium', hp: T.medium * 1.2,
        radius: 40, score: 450, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 3, behavior: minelayer,
        intro: '飞到前方悬停，在下方投下 3×2 水雷阵；水雷在你靠近时引爆，可以先打掉。',
    },
    {
        id: 'destroyer', name: '驱逐舰', frame: 'enemy/destroyer', size: 'large', hp: T.large * 0.58,
        radius: 63, score: 1100, energy: 5, coins: 10, body: 'metal', ground: true, contact: false, chapter: 3,
        behavior: destroyer, intro: '随海面卷入的大型舰船，逐个击毁中线三座炮塔后舰体失去保护。',
    },
    {
        id: 'heli', name: '直升炮机', frame: 'enemy/heli', size: 'medium', hp: T.medium * 1.3,
        radius: 39, score: 480, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 3,
        behavior: heli, intro: '飞到定点悬停，亮灯预警后摆动扫射，打完向上离场。',
    },
    {
        id: 'sharksub', name: '潜航鲨艇', frame: 'enemy/sharksub', size: 'elite', hp: T.elite * 0.65,
        radius: 54, score: 2000, energy: 8, coins: 14, body: 'metal', ground: true, contact: false, chapter: 3,
        behavior: sharksub, intro: '潜航时只有阴影且免疫攻击，浮出时发射鱼雷扇面，击毁掉落两个零件。',
    },
    {
        id: 'seamine', name: '水雷', frame: 'enemy/seamine', size: 'small', hp: T.small * 0.8,
        radius: 20, score: 80, energy: 1, coins: 0, body: 'metal', ground: true, contact: false, chapter: 3, behavior: seamine,
        intro: '布雷机投下的水雷，靠近会引爆成一圈弹环。',
    },
    {
        id: 'laserdeck', name: '激光平台', frame: 'enemy/laserdeck', size: 'large', hp: T.large, radius: 56,
        score: 950, energy: 5, coins: 8, body: 'metal', ground: true, contact: false, chapter: 3, behavior: laserdeck,
        intro: '海上平台的激光炮头先追踪瞄准，红色虚线锁定后发射扫向你的激光；打掉炮头平台就会炸毁。',
    },
    {
        id: 'laserdeck-gun', name: '激光炮头', frame: 'enemy/laserdeck-gun', size: 'part', hp: T.large * 0.4, radius: 26,
        score: 300, energy: 3, coins: 2, body: 'metal', ground: true, contact: false, chapter: 3, behavior: laserGun,
        intro: '激光平台的炮头。',
    },
    {
        id: 'shielddrone', name: '护盾无人机', frame: 'enemy/shielddrone', size: 'medium', hp: T.medium * 0.7,
        radius: 30, score: 500, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 3, behavior: shielddrone,
        intro: '给附近两个敌人套上护罩，被罩住的敌人几乎打不动——先打无人机。',
    },
    {
        id: 'missileboat', name: '导弹快艇', frame: 'enemy/missileboat', size: 'large', hp: T.large * 0.5,
        radius: 40, score: 800, energy: 5, coins: 6, body: 'metal', ground: true, contact: false, chapter: 3, behavior: missileboat,
        intro: '甲板滑轨射出慢速追踪导弹，导弹可以击落。',
    },
    {
        id: 'emissile', name: '追踪导弹', frame: 'enemy/emissile', size: 'small', hp: T.small * 0.35,
        radius: 14, score: 60, energy: 1, coins: 0, face: true, body: 'metal', contact: true, chapter: 3, behavior: emissile,
        intro: '导弹快艇射出的导弹，会追着你转弯，击落或甩开它。',
    },
];
