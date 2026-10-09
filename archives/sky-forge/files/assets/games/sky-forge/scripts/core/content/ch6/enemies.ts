import type { EnemyDef } from '../../SfEnemies';
import type { SfCombat } from '../../SfCombat';
import type { EnemyBehavior } from '../SfContentTypes';
import { HP_UNITS } from '../../SfBalance';
import { DOWN, STYLE, aimAngle, aimed, ring, shoot } from '../../SfPatterns';

const T = HP_UNITS;

const yAt = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
const active = (c: SfCombat) => c.phase === 'waves' || c.phase === 'warning' || c.phase === 'boss';

/** 同屏脉冲波上限：多只水母同时放波时，后来的等前面的扩散出屏再放。 */
const MAX_PULSES = 4;

/**
 * 虚空水母：每 3.6 秒（出手前 0.6 秒鼓胀预警）放出一圈会扩散的环形脉冲波。
 * 波是一整道连续的光环，只在一个方向留出缺口（大致朝着玩家、但偏开一个角度），只能从缺口穿过。
 */
const voidjelly: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(1.2, 2.4); },
    update(e, c, dt) {
        if (!e.entered || e.y > c.bounds.top - 40 || e.y < c.player.y + 160 || !active(c)) return;
        e.data.t -= dt;
        if (e.data.t <= 0.6 && e.data.t + dt > 0.6) e.windup = 0.6;
        if (e.data.t > 0) return;
        if (c.hazards.filter(h => h.kind === 'pulse').length >= MAX_PULSES) { e.data.t = 0.5; return; }
        e.data.t = 3.6;
        const gap = aimAngle(c, e.x, e.y) + c.rng.sign() * c.rng.range(0.5, 1.1);
        c.addHazard({ kind: 'pulse', ax: e.x, ay: e.y, bx: e.x, by: e.y, width: 8, radius: e.radius, speed: 150, gap, gapWidth: 0.42, life: 6 });
        c.emit({ type: 'shot', kind: 'enemy', x: e.x, y: e.y });
    },
};

/**
 * 虚空兵：闪现编队里从传送标记中闪现（编队设置 data.blink），0.5 秒后朝玩家打一发三连虚空针，1.4 秒后闪回虚空（不算击杀）；
 * 普通编队里俯冲穿场，进入上半屏时打一次三连针。
 */
const voidtrooper: EnemyBehavior = {
    spawn(e) { e.data.t = 0; },
    update(e, c, dt) {
        e.data.t += dt;
        if (e.data.blink) {
            e.alpha = e.data.t < 1.2 ? Math.min(1, e.data.t / 0.2) : Math.max(0, 1 - (e.data.t - 1.2) / 0.2);
            if (e.data.t > 0.25 && e.data.t - dt <= 0.25) e.windup = 0.25;
            if (e.data.t >= 0.5 && e.data.t - dt < 0.5 && active(c) && e.y > c.player.y + 80) {
                aimed(c, e.x, e.y - 14, 3, 14, 250, STYLE.voidneedle);
                c.emit({ type: 'shot', kind: 'enemy', x: e.x, y: e.y });
            }
            return;
        }
        if (!e.data.fired && e.entered && e.y < yAt(c, 0.78) && e.y > c.player.y + 220 && active(c)) {
            e.data.fired = 1;
            aimed(c, e.x, e.y - 14, 3, 14, 240, STYLE.voidneedle);
        }
    },
};

/**
 * 异星飞碟：悬停时每 5.5 秒充能 1.2 秒，然后向正下方打出 2.6 秒的牵引光束，把光束里的玩家缓慢拉向它；
 * 同时朝四周放一圈慢速虚空弹。光束里我方火力 +30%——可以顶着拉力飞进去打它。
 */
const ufo: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(1.5, 2.5); e.data.beam = 0; },
    update(e, c, dt) {
        if (!e.entered || !active(c) || e.y < c.player.y + 160) { e.data.beam = 0; return; }
        if (e.data.beam > 0) {
            e.data.beam -= dt;
            c.addHazard({ kind: 'tractor', ax: e.x, ay: e.y - 24, bx: e.x, by: c.bounds.bottom - 40, width: 66, pull: 120 });
            e.data.ring -= dt;
            if (e.data.ring <= 0) {
                e.data.ring = 1.3;
                ring(c, e.x, e.y - 10, 10, 120, c.time, STYLE.voidorb);
            }
            return;
        }
        e.data.t -= dt;
        if (e.data.t <= 1.2 && e.data.t + dt > 1.2) e.windup = 1.2;
        if (e.data.t > 0) return;
        e.data.t = 5.5;
        e.data.beam = 2.6;
        e.data.ring = 0.3;
        c.emit({ type: 'telegraph', x: e.x, y: e.y, kind: 'tractor' });
    },
};

/** 卫星：轮转编队控制走位；每 2 秒沿公转切线方向射出一发虚空弹（整组像洒水器一样旋转喷弹）。 */
const satellite: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(0.6, 2); },
    update(e, c, dt) {
        if (!e.entered || !active(c) || e.y < c.player.y + 140 || e.y > c.bounds.top - 30) return;
        e.data.t -= dt;
        if (e.data.t > 0) return;
        e.data.t = 2;
        const speed = Math.hypot(e.vx, e.vy);
        if (speed < 10) return;
        shoot(c, e.x, e.y, Math.atan2(e.vy, e.vx), 170, STYLE.voidorb);
    },
};

/** 卫星核心：自身只会每 3 秒朝玩家打一发慢速大星弹；被打掉时，公转中的卫星沿切线甩飞。 */
const satcore: EnemyBehavior = {
    spawn(e, c) { e.data.t = c.rng.range(1.5, 2.5); },
    update(e, c, dt) {
        if (!e.entered || !active(c) || e.y < c.player.y + 160) return;
        e.data.t -= dt;
        if (e.data.t <= 0.5 && e.data.t + dt > 0.5) e.windup = 0.5;
        if (e.data.t > 0) return;
        e.data.t = 3;
        aimed(c, e.x, e.y - 20, 1, 0, 150, STYLE.voidstar);
    },
};

/** 虚空裂缝：场地物件，不可攻击；裂缝本身由传送危险物（两端都在场上时）画出，实体只负责随地面卷动。 */
const voidrift: EnemyBehavior = {
    spawn(e) { e.wreck = true; e.decor = true; e.damageScale = 0; e.alpha = 0; },
};

const GUARD_UP = 3.4;
const GUARD_DOWN = 2.2;

/**
 * 星界守卫（精英）：自己控制走位。镜盾举起 3.4 秒（打在盾上的我方子弹被原路反射回来）、放下 2.2 秒交替；
 * 盾放下时朝玩家打一扇虚空针，盾举起时每 1.6 秒打一发慢速三连弹。18 秒后向上离场。
 * 盾只遮住身体正下方——从侧面斜射、或趁盾放下时打本体。
 */
const starguard: EnemyBehavior = {
    spawn(e, c) {
        e.motion = null;
        e.data.home = yAt(c, 0.78);
        e.data.t = 0;
        e.data.cycle = 0;
        e.data.shot = 1.2;
        e.drop = e.drop ?? 'wing';
        e.extraDrops = ['special'];
        const shield = c.spawnEnemy('starguard-shield', e.x, e.y - 52, null, { parent: e, ox: 0, oy: -52, persistent: true });
        shield.base = true;
        e.data.shield = shield.id;
    },
    update(e, c, dt) {
        e.data.t += dt;
        const shield = c.enemies.find(s => s.id === e.data.shield);
        const px = e.x, py = e.y;
        if (e.data.t > 18) {
            e.y += 240 * dt;
        } else if (e.y > e.data.home + 2) {
            e.y = Math.max(e.data.home, e.y - 260 * dt);
        } else {
            // 缓慢左右巡游，追向玩家所在的一侧（盾总是挡在玩家正上方）。
            const tx = Math.max(c.bounds.left + 110, Math.min(c.bounds.right - 110, c.player.x * 0.6));
            e.x += Math.max(-70 * dt, Math.min(70 * dt, tx - e.x));
            e.y = e.data.home + Math.sin(e.data.t * 1.4) * 10;
        }
        e.vx = (e.x - px) / Math.max(dt, 1e-4); e.vy = (e.y - py) / Math.max(dt, 1e-4);
        if (!e.entered || !active(c)) return;
        e.data.cycle += dt;
        const up = e.data.cycle % (GUARD_UP + GUARD_DOWN) < GUARD_UP;
        if (shield) {
            shield.wreck = !up;
            shield.alpha = up ? Math.min(1, (shield.alpha ?? 0) + dt * 6) : Math.max(0, (shield.alpha ?? 1) - dt * 6);
        }
        if (e.y < c.player.y + 140) return;
        e.data.shot -= dt;
        if (e.data.shot <= 0.4 && e.data.shot + dt > 0.4) e.windup = 0.4;
        if (e.data.shot > 0) return;
        if (up) {
            e.data.shot = 1.6;
            aimed(c, e.x, e.y - 60, 3, 30, 150, STYLE.voidorb);
        } else {
            e.data.shot = 0.9;
            aimed(c, e.x, e.y - 30, 7, 70, 220, STYLE.voidneedle);
        }
    },
};

/** 镜盾：不受伤害；打在盾面上的我方子弹被沿原路反射成敌方虚空针（每 0.12 秒最多一发）。 */
const starguardShield: EnemyBehavior = {
    spawn(e) { e.data.cd = 0; e.alpha = 1; },
    update(e, _c, dt) { e.data.cd = Math.max(0, e.data.cd - dt); },
    damage(e, c, _amount, hx, hy) {
        if (e.data.cd <= 0 && active(c)) {
            e.data.cd = 0.12;
            shoot(c, hx, hy - 8, DOWN + (hx - e.x) / 260, 300, STYLE.voidneedle);
        }
        return 0;
    },
};

/** 第 6 章 · 星空裂隙 · 虚空异形。 */
export const CH6_ENEMIES: EnemyDef[] = [
    {
        id: 'voidjelly', name: '虚空水母', frame: 'enemy/voidjelly', size: 'small', hp: T.small * 1.3,
        radius: 26, score: 140, energy: 1, coins: 1, body: 'flesh', contact: true, chapter: 6, behavior: voidjelly,
        intro: '鼓胀后放出一整圈扩散的脉冲波，波只留一个缺口——看准缺口从里面穿过去。',
    },
    {
        id: 'voidtrooper', name: '虚空兵', frame: 'enemy/voidtrooper', size: 'small', hp: T.small * 0.8,
        radius: 22, score: 120, energy: 1, coins: 1, face: false, body: 'metal', contact: true, chapter: 6, behavior: voidtrooper,
        intro: '先亮出一串传送标记，再按顺序从标记里闪现、打一发三连针后消失；标记越往后越靠近你。',
    },
    {
        id: 'ufo', name: '异星飞碟', frame: 'enemy/ufo', size: 'medium', hp: T.medium * 1.6,
        radius: 40, score: 480, energy: 4, coins: 4, body: 'metal', contact: true, chapter: 6, behavior: ufo,
        intro: '牵引光束会把你慢慢拉向飞碟，可以顶着拉力飞；待在光束里火力 +30%。',
    },
    {
        id: 'satellite', name: '卫星', frame: 'enemy/satellite', size: 'small', hp: T.small * 0.75,
        radius: 16, score: 90, energy: 1, coins: 1, body: 'metal', contact: true, chapter: 6, behavior: satellite,
        intro: '绕核心公转，沿切线方向喷弹；核心被打掉时会沿切线甩飞撞向四周。',
    },
    {
        id: 'satcore', name: '卫星核心', frame: 'enemy/satcore', size: 'medium', hp: T.medium * 1.4,
        radius: 30, score: 420, energy: 3, coins: 3, body: 'flesh', contact: true, chapter: 6, behavior: satcore,
        intro: '卫星群的核心。先打掉它，卫星就会失控甩飞——注意躲开甩出来的卫星。',
    },
    {
        id: 'voidrift', name: '虚空裂缝', frame: 'enemy/voidrift', size: 'medium', hp: 99,
        radius: 46, score: 0, energy: 0, coins: 0, body: 'flesh', ground: true, contact: false, chapter: 6, behavior: voidrift,
        intro: '成对出现。子弹射进一边会从另一边以原方向射出——敌弹也一样；可以借它打到另一侧的敌人。',
    },
    {
        id: 'starguard', name: '星界守卫', frame: 'enemy/starguard', size: 'elite', hp: T.elite * 0.75,
        radius: 50, score: 2200, energy: 8, coins: 14, body: 'flesh', contact: true, chapter: 6, behavior: starguard,
        intro: '精英。镜盾举起时会把打在盾上的子弹反射回来；盾只遮住正下方，从侧面斜射或趁盾放下时打它。',
    },
    {
        id: 'starguard-shield', name: '镜盾', frame: 'enemy/starguard-shield', size: 'part', hp: 999,
        radius: 40, score: 0, energy: 0, coins: 0, body: 'metal', contact: false, chapter: 6, behavior: starguardShield,
        intro: '星界守卫的镜盾，打不坏，会反射子弹。',
    },
];

