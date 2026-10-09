import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, EnemyBullet } from '../../SfTypes';
import { BossScript, TIER_SCORE, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, aimAngle, aimed, fan, ring, shoot, stream, wall } from '../../SfPatterns';

/** 第 3 章 Boss 信息（图鉴、警报横幅）。 */
export const CH3_BOSS_INFO: Record<string, BossInfo> = {
    rhino: { id: 'rhino', name: '铁犀重炮艇', tier: 'small', chapter: 3, frame: 'boss/rhino', intro: '主炮缓慢转向，预警线指向哪里就向哪里轰出重弹，击毁炮塔可解除主炮。' },
    emship: { id: 'emship', name: '双体电磁舰', tier: 'mid', chapter: 3, frame: 'boss/emship', intro: '两座线圈蓄力后释放横向电束，逐个击毁线圈可削弱电网。' },
    rodship: { id: 'rodship', name: '避雷飞艇', tier: 'small', chapter: 3, frame: 'boss/rodship', intro: '把附近落雷吸引到自身，在飞艇附近引雷后横移可让雷暴重创它。' },
    steelwhale: { id: 'steelwhale', name: '钢鲸潜舰', tier: 'mid', chapter: 3, frame: 'boss/steelwhale', intro: '潜航期间免疫攻击，浮出时背部导弹井齐射，追踪一小段后锁定航向。' },
    typhon: { id: 'typhon', name: '风暴要塞·提丰', tier: 'big', chapter: 3, frame: 'boss/typhon', intro: '四塔雷笼、旋转十字和风暴眼依次展开，击破电塔能打开牢笼缺口。' },
    'typhon-hidden': { id: 'typhon-hidden', name: '暴怒提丰', tier: 'hidden', chapter: 3, frame: 'boss/typhon', intro: '暴走电塔十秒后重生，击破会反噬核心，追加连锁落雷网格与全屏风暴漩涡。' },
};

/** 直接构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number, ground = false): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body: 'metal', chapter: 3, contact: false, ground, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

function angleDiff(a: number, b: number): number {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** 电束用线段距离，与视图绘制的光束共用两端坐标。 */
function beamHit(c: SfCombat, a: Enemy, b: Enemy): void {
    if (a.dead || b.dead || !a.entered || !b.entered) return;
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 < 1) return;
    const u = Math.max(0, Math.min(1, ((c.player.x - a.x) * dx + (c.player.y - a.y) * dy) / len2));
    if (Math.hypot(c.player.x - a.x - dx * u, c.player.y - a.y - dy * u) < 16) c.hurtPlayer();
}

// ───────────────────────────── 3-1 铁犀重炮艇 ─────────────────────────────

class Rhino extends BossScript {
    readonly id = 'rhino';
    readonly name = '铁犀重炮艇';
    readonly tier: BossTier = 'small';
    private turret: Enemy;
    private home: number;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        const hp = this.hpFor('small');
        const core = this.spawnBody(def(this.id, this.name, 'boss/rhino', 'boss', 70, true), 0, c.bounds.top + 190, hp * 0.95);
        this.turret = this.spawnPart(def('rhino-turret', '铁犀主炮', 'boss/rhino-turret', 'part', 33, true), core, 0, -90, hp * 0.15);
        this.turret.partTag = 'rhino-turret';
        this.turret.drop = 'main';
        this.home = ch(c, 0.72);
        this.start(this.enter(0, this.home, 2.5), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        const p = this.turret;
        if (p.dead || this.entering) return;
        const want = aimAngle(c, p.x, p.y) - DOWN;
        const step = (this.phase ? 0.52 : 0.38) * dt;
        p.angle += Math.max(-step, Math.min(step, angleDiff(want, p.angle)));
        if (p.windup > 0) { p.aimX = Math.cos(p.angle + DOWN); p.aimY = Math.sin(p.angle + DOWN); }
    }

    onPhase(phase: number): void {
        this.c.scrollSpeed = 24;
        this.turret.aimX = this.turret.aimY = 0;
        this.stop('move');
        this.start(this.sway(this.core, phase ? 100 : 45, 0.35, this.home, 6), 'move');
        this.start(this.cannon(), 'attack');
        if (phase) this.start(this.broadside(), 'attack');
    }

    private *cannon(): Generator<number> {
        yield 1;
        while (!this.core.dead) {
            const p = this.turret;
            if (p.dead) {
                warn(this.c, this.core, 0.5, 'broken-cannon');
                yield 0.5;
                aimed(this.c, this.core.x, this.core.y - 58, 3, 34, 225, STYLE.orange);
                yield 2.8;
                continue;
            }
            warn(this.c, p, 0.8, 'heavy-cannon');
            yield 0.8;
            if (!p.dead) {
                const a = p.angle + DOWN;
                p.aimX = p.aimY = 0;
                const x = p.x + Math.cos(a) * 38, y = p.y + Math.sin(a) * 38;
                stream(this.c, x, y, a, this.phase ? 4 : 2, 265, 310, STYLE.large);
                this.c.emit({ type: 'boss-attack', x, y, kind: 'heavy-cannon' });
            }
            yield this.phase ? 1.9 : 2.6;
        }
    }

    private *broadside(): Generator<number> {
        yield 1.8;
        while (!this.core.dead) {
            warn(this.c, this.core, 0.55, 'rhino-broadside');
            yield 0.55;
            for (const side of [-1, 1]) fan(this.c, this.core.x + side * 55, this.core.y - 48, DOWN + side * 0.22, 4, 50, 205, STYLE.small);
            yield 2.2;
        }
    }
}

// ───────────────────────────── 3-2 双体电磁舰 ─────────────────────────────

interface ElectricBeam { a: Enemy; b: Enemy; coil: Enemy; until: number }

class EmShip extends BossScript {
    readonly id = 'emship';
    readonly name = '双体电磁舰';
    readonly tier: BossTier = 'mid';
    private coils: Enemy[];
    private beams: ElectricBeam[] = [];
    private home: number;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.32);
        const hp = this.hpFor('mid');
        const core = this.spawnBody(def(this.id, this.name, 'boss/emship', 'boss', 82, true), 0, c.bounds.top + 240, hp);
        const coilDef = def('tesla-coil', '特斯拉线圈', 'boss/tesla-coil', 'part', 32, true);
        this.coils = [this.spawnPart(coilDef, core, -116, -82, hp * 0.09), this.spawnPart(coilDef, core, 116, -82, hp * 0.09)];
        this.coils.forEach((p, i) => { p.partTag = 'tesla-coil'; p.drop = i ? 'wing' : 'main'; });
        this.home = ch(c, 0.7);
        this.start(this.enter(0, this.home, 2.7), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        for (const beam of this.beams) {
            if (this.core.dead || beam.coil.dead || this.time >= beam.until || this.core.damageScale <= 0) {
                this.clearBeam(beam);
            } else if (c.phase === 'boss') beamHit(c, beam.a, beam.b);
        }
        this.beams = this.beams.filter(b => !b.a.dead && !b.b.dead);
    }

    private clearBeam(beam: ElectricBeam): void {
        beam.a.link = beam.b.link = undefined;
        if (!beam.a.dead) this.c.killEnemy(beam.a, 'mechanic', false);
        if (!beam.b.dead) this.c.killEnemy(beam.b, 'mechanic', false);
    }

    onPhase(phase: number): void {
        this.beams.forEach(b => this.clearBeam(b));
        this.coils.forEach(p => { p.aimX = p.aimY = 0; });
        this.stop('move');
        this.c.scrollSpeed = 20;
        this.start(this.sway(this.core, 75, 0.27, this.home, 5), 'move');
        this.start(this.coilShots(), 'attack');
        if (phase === 0) this.start(this.aimedShots(), 'attack');
        else if (phase === 1) this.start(this.needleWalls(), 'attack');
        else this.start(this.overloadFans(), 'attack');
    }

    private *coilShots(): Generator<number> {
        yield 1.4;
        let turn = 0;
        while (!this.core.dead) {
            const coil = this.coils[turn++ % this.coils.length];
            if (coil.dead) { yield 1.1; continue; }
            const direction = coil.ox < 0 ? 1 : -1;
            coil.aimX = direction; coil.aimY = 0;
            warn(this.c, coil, 1.0, 'tesla-charge');
            yield 1.0;
            coil.aimX = coil.aimY = 0;
            if (!coil.dead) {
                const anchorDef = def('emship-beam', '电束锚点', '', 'part', 1, true);
                const a = this.c.spawnEnemy(anchorDef, this.c.bounds.left + 8, coil.y, null, { boss: true, persistent: true, frame: '' });
                const b = this.c.spawnEnemy(anchorDef, this.c.bounds.right - 8, coil.y, null, { boss: true, persistent: true, frame: '' });
                a.entered = b.entered = true;
                a.wreck = b.wreck = true;
                a.damageScale = b.damageScale = 0;
                a.link = b; b.link = a;
                this.beams.push({ a, b, coil, until: this.time + 0.6 });
                this.c.emit({ type: 'boss-attack', x: coil.x, y: coil.y, kind: 'tesla-beam' });
            }
            yield this.phase >= 2 ? 1.4 : 2.0;
        }
    }

    private *aimedShots(): Generator<number> {
        yield 2.1;
        while (!this.core.dead) {
            warn(this.c, this.core, 0.45, 'emship-aim');
            yield 0.45;
            aimed(this.c, this.core.x, this.core.y - 70, 3, 32, 235, STYLE.orange);
            yield 2.5;
        }
    }

    private *needleWalls(): Generator<number> {
        yield 1;
        while (!this.core.dead) {
            const gap = Math.max(this.c.bounds.left + 100, Math.min(this.c.bounds.right - 100, this.c.player.x));
            warn(this.c, this.core, 0.7, 'emship-wall');
            yield 0.7;
            wall(this.c, this.core.y - 72, gap, 170, 44, 280, STYLE.needle);
            yield 2.3;
        }
    }

    private *overloadFans(): Generator<number> {
        yield 0.9;
        let offset = 0;
        while (!this.core.dead) {
            warn(this.c, this.core, 0.65, 'emship-overload');
            yield 0.65;
            for (const side of [-1, 1]) fan(this.c, this.core.x + side * 95, this.core.y - 70, DOWN + side * 0.35, 5, 75, 210, STYLE.diamond);
            ring(this.c, this.core.x, this.core.y, 12, 170, offset, STYLE.small);
            offset += 0.23;
            yield 2.5;
        }
    }

    onPartDestroyed(part: Enemy): void {
        for (const beam of this.beams) if (beam.coil === part) this.clearBeam(beam);
    }

    protected onBodyKilled(): void { this.beams.forEach(b => this.clearBeam(b)); }
}

// ───────────────────────────── 3-3 避雷飞艇 ─────────────────────────────

class RodShip extends BossScript {
    readonly id = 'rodship';
    readonly name = '避雷飞艇';
    readonly tier: BossTier = 'small';

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.spawnBody(def(this.id, this.name, 'boss/rodship', 'boss', 72), 0, c.bounds.top + 180, this.hpFor('small') * 1.25);
        this.start(this.enter(0, ch(c, 0.73), 2.4), 'move');
    }

    onPhase(phase: number): void {
        this.c.scrollSpeed = 25;
        this.stop('move');
        this.start(this.sway(this.core, 90, 0.3, ch(this.c, 0.73), 12), 'move');
        this.start(phase === 0 ? this.chargeRings() : this.windShear(), 'attack');
    }

    private *chargeRings(): Generator<number> {
        yield 1;
        let offset = 0;
        while (!this.core.dead) {
            warn(this.c, this.core, 0.65, 'rodship-ring');
            yield 0.65;
            ring(this.c, this.core.x, this.core.y, 14, 175, offset, STYLE.orange);
            offset += 0.18;
            yield 0.8;
            aimed(this.c, this.core.x, this.core.y - 55, 3, 34, 235, STYLE.small);
            yield 1.5;
        }
    }

    private *windShear(): Generator<number> {
        yield 1;
        let side = 1;
        while (!this.core.dead) {
            warn(this.c, this.core, 0.65, 'rodship-shear');
            yield 0.65;
            wall(this.c, this.core.y - 60, this.core.x + side * 90, 180, 48, 215, STYLE.needle);
            fan(this.c, this.core.x, this.core.y - 60, DOWN - side * 0.3, 5, 70, 190, { ...STYLE.small, turn: side * 0.22, life: 6 });
            side = -side;
            yield 2.2;
        }
    }
}

// ───────────────────────────── 3-4 钢鲸潜舰 ─────────────────────────────

interface GuidedMissile { bullet: EnemyBullet; until: number }

class SteelWhale extends BossScript {
    readonly id = 'steelwhale';
    readonly name = '钢鲸潜舰';
    readonly tier: BossTier = 'mid';
    private missiles: GuidedMissile[] = [];

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.32);
        const body = def(this.id, this.name, 'boss/steelwhale', 'boss', 90, true);
        body.behavior = { damage(e, _combat, amount) { return e.data.submerged ? 0 : amount; } };
        // 按推荐战力下的浮出输出窗口校准；潜航免疫始终由伤害钩子保证。
        this.spawnBody(body, 0, c.bounds.top + 240, this.hpFor('mid') * 0.98);
        this.core.data.submerged = 0;
        this.start(this.enter(0, ch(c, 0.72), 2.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        for (const missile of this.missiles) {
            const b = missile.bullet;
            if (b.dead) continue;
            if (this.time >= missile.until || Math.hypot(c.player.x - b.x, c.player.y - b.y) < 165 || !c.player.alive) {
                b.turn = 0;
                missile.until = 0;
                continue;
            }
            const wanted = Math.atan2(c.player.y - b.y, c.player.x - b.x);
            const current = Math.atan2(b.vy, b.vx);
            b.turn = Math.max(-0.65, Math.min(0.65, angleDiff(wanted, current) / Math.max(dt, 0.0001)));
        }
        this.missiles = this.missiles.filter(m => !m.bullet.dead && m.until > 0);
    }

    onPhase(): void {
        this.core.data.submerged = 0;
        this.core.alpha = 1;
        this.missiles.forEach(m => { m.bullet.turn = 0; });
        this.missiles = [];
        this.c.scrollSpeed = 22;
        this.stop('move');
        this.start(this.sway(this.core, 75, 0.25, ch(this.c, 0.72), 5), 'move');
        this.start(this.diveCycle(), 'attack');
    }

    private launch(x: number, y: number, offset: number): void {
        const bullet = shoot(this.c, x, y, aimAngle(this.c, x, y) + offset, this.phase >= 2 ? 260 : 225,
            { ...STYLE.needle, radius: 7, turn: 0.65, delay: 0.2, life: 7 });
        this.missiles.push({ bullet, until: this.time + 1.6 });
    }

    private *diveCycle(): Generator<number> {
        yield 0.7;
        while (!this.core.dead) {
            const core = this.core;
            core.data.submerged = 0; core.alpha = 1; core.damageScale = 1;
            warn(this.c, core, 0.7, 'whale-surface');
            yield 0.7;
            // 阶段 1：导弹井齐射；阶段 2：导弹与鱼雷交错；阶段 3：两轮错时饱和弹。
            const volleys = this.phase >= 2 ? 4 : 3;
            for (let salvo = 0; salvo < volleys; salvo++) {
                for (const ox of [-66, 0, 66]) this.launch(core.x + ox, core.y - 48, ox / 260 + (salvo % 2 ? 0.12 : -0.12));
                this.c.emit({ type: 'boss-attack', x: core.x, y: core.y, kind: 'missile-salvo' });
                if (this.phase === 1) fan(this.c, core.x, core.y - 76, DOWN, 5, 86, 185, STYLE.orange);
                if (this.phase >= 2) {
                    yield 0.35;
                    for (const ox of [-38, 38]) this.launch(core.x + ox, core.y - 48, -ox / 120);
                }
                yield this.phase >= 2 ? 0.9 : 1.45;
            }
            warn(this.c, core, 0.5, 'whale-dive');
            yield 0.5;
            core.data.submerged = 1; core.alpha = 0.3; core.damageScale = 0;
            yield 2.4;
            warn(this.c, core, 0.6, 'whale-rise');
            yield 0.6;
        }
    }
}

// ───────────────────────────── 3-5 风暴要塞（含隐藏版） ─────────────────────────────

interface EyeBullet { bullet: EnemyBullet; x: number; y: number; angle: number; radius: number; spin: number; pull: number }

const TOWER_OFFSETS = [[-146, -128], [146, -128], [146, 106], [-146, 106]];

class Typhon extends BossScript {
    readonly id: string;
    readonly name: string;
    readonly tier: BossTier;
    private towers: Enemy[] = [];
    private edges: (Enemy | undefined)[] = [];
    private laser?: Enemy;
    private eye: EyeBullet[] = [];
    private units: number;
    private cageClock = 0;
    private cageCycle = -1;

    constructor(c: SfCombat, private readonly hidden = false) {
        super(c);
        this.id = hidden ? 'typhon-hidden' : 'typhon';
        this.name = hidden ? '暴怒提丰' : '风暴要塞·提丰';
        this.tier = hidden ? 'hidden' : 'big';
        if (hidden) this.tint = '#FF7A6A';
        this.thresholds.push(0.67, 0.34);
        if (hidden) this.thresholds.push(0.17);
        this.units = this.hpFor(this.tier);
        // 四塔与激光部件会提供必杀能量，核心血量按完整三阶段实测校准。
        this.spawnBody(def(this.id, this.name, 'boss/typhon', 'boss', 98), 0, c.bounds.top + 280, this.units * 1.3);
        this.core.scoreValue = TIER_SCORE[this.tier];
        for (let i = 0; i < TOWER_OFFSETS.length; i++) this.makeTower(i);
        this.start(this.enter(0, ch(c, 0.63), 3), 'move');
    }

    private makeTower(index: number, reborn = false): void {
        const [ox, oy] = TOWER_OFFSETS[index];
        // 重生只恢复六成装甲，保留断网机制而不让玩家反复消耗整座电塔的火力预算。
        const p = this.spawnPart(def('typhon-tower', '提丰电塔', 'boss/typhon-tower', 'part', 31), this.core, ox, oy, this.units * 0.035 * (reborn ? 0.6 : 1));
        p.partTag = 'typhon-tower'; p.data.slot = index;
        p.drop = index % 2 ? 'wing' : 'special';
        p.windup = 0.8;
        if (!this.entering && this.core.damageScale > 0) p.damageScale = 1;
        this.towers[index] = p;
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        const active = !this.entering && !this.core.dead && this.core.damageScale > 0 && c.phase === 'boss';
        if (active) this.cageClock += dt;
        // 后三阶段雷笼间歇通电，留下输出与收件窗口；每轮恢复前仍有独立充能预警。
        if (active && this.hidden && this.phase > 0) {
            const cycle = Math.floor(this.cageClock / 8);
            if (cycle !== this.cageCycle) {
                this.cageCycle = cycle;
                for (const tower of this.towers) if (!tower.dead) warn(c, tower, 0.8, 'cage-recharge');
            }
        }
        const cage = active && (this.phase === 0 || (this.hidden && this.cageClock % 8 >= 0.8 && this.cageClock % 8 < 3));
        // 重生若恰好发生在阶段护盾期间，塔也随本体恢复，不能永久残留零伤害倍率。
        for (const tower of this.towers) if (!tower.dead && !this.entering) tower.damageScale = this.core.damageScale > 0 ? 1 : 0;
        // 每条边用一个不可见锚点，塔与锚点互相 link。这样四条边都满足视图的 ID 去重规则。
        for (let i = 0; i < this.towers.length; i++) {
            const from = this.towers[i], to = this.towers[(i + 1) % this.towers.length];
            let edge = this.edges[i];
            if (!cage || from.dead || to.dead || from.windup > 0 || to.windup > 0) {
                from.link = undefined;
                if (edge) edge.link = undefined;
                continue;
            }
            if (!edge || edge.dead || edge.parent !== to) {
                edge = c.spawnEnemy(def('typhon-edge', '雷笼锚点', '', 'part', 1), to.x, to.y, null,
                    { parent: to, ox: 0, oy: 0, persistent: true, boss: true, frame: '' });
                edge.wreck = true; edge.damageScale = 0;
                this.edges[i] = edge;
            }
            edge.x = to.x; edge.y = to.y; edge.entered = to.entered;
            from.link = edge; edge.link = from;
            beamHit(c, from, edge);
        }
        if (this.laser && !this.laser.dead && this.phase === 1) this.laser.angle += dt * (this.hidden ? 0.7 : 0.48);
        for (const point of this.eye) {
            const b = point.bullet;
            if (b.dead || b.delay > 0) continue;
            point.radius = Math.max(0, point.radius - point.pull * dt);
            point.angle += point.spin * dt;
            if (point.radius < 18 || !active) { b.dead = true; continue; }
            const x = point.x + Math.cos(point.angle) * point.radius;
            const y = point.y + Math.sin(point.angle) * point.radius;
            // 极坐标收缩，转向与半径一起改变，形成真正的内收螺旋。
            b.vx = (x - b.x) / Math.max(dt, 0.0001); b.vy = (y - b.y) / Math.max(dt, 0.0001);
            b.turn = 0;
        }
        this.eye = this.eye.filter(p => !p.bullet.dead);
    }

    onPhase(phase: number): void {
        this.eye.forEach(p => { p.bullet.dead = true; });
        this.eye = [];
        this.cageClock = 0; this.cageCycle = -1;
        this.towers.forEach(p => { p.link = undefined; });
        this.edges.forEach(p => { if (p) p.link = undefined; });
        this.stop('move');
        this.c.scrollSpeed = 16;
        this.start(this.sway(this.core, phase >= 2 ? 30 : 65, 0.22, ch(this.c, 0.63), 6), 'move');
        if (phase === 0) this.start(this.towerCage(), 'attack');
        else if (phase === 1) {
            if (!this.laser) {
                this.laser = this.spawnPart(def('typhon-laser', '十字激光机', 'boss/typhon-laser', 'part', 34), this.core, 0, -94, this.units * 0.04);
                this.laser.partTag = 'typhon-laser'; this.laser.drop = 'main'; this.laser.damageScale = 1;
            }
            this.start(this.crossLaser(), 'attack');
        } else if (phase === 2) this.start(this.stormEye(), 'attack');
        else this.start(this.fullVortex(), 'attack');
        if (this.hidden) this.start(this.lightningGrid(), 'attack');
    }

    private *towerCage(): Generator<number> {
        yield 1.4;
        let turn = 0;
        while (!this.core.dead) {
            const live = this.towers.filter(p => !p.dead);
            if (live.length) {
                const tower = live[turn++ % live.length];
                warn(this.c, tower, 0.6, 'tower-charge');
                yield 0.6;
                if (!tower.dead) aimed(this.c, tower.x, tower.y - 20, 4, 52, 205, STYLE.diamond);
            } else {
                warn(this.c, this.core, 0.6, 'cage-broken');
                yield 0.6;
                fan(this.c, this.core.x, this.core.y - 70, DOWN, 5, 72, 185, STYLE.orange);
            }
            yield 1.5;
        }
    }

    private *crossLaser(): Generator<number> {
        yield 1;
        while (!this.core.dead) {
            const laser = this.laser;
            if (!laser || laser.dead) {
                warn(this.c, this.core, 0.65, 'laser-broken');
                yield 0.65;
                fan(this.c, this.core.x, this.core.y - 70, DOWN, 7, 100, 210, STYLE.orange);
                yield 2.1;
                continue;
            }
            warn(this.c, laser, 0.8, 'cross-laser');
            yield 0.8;
            for (let i = 0; i < 22 && !laser.dead; i++) {
                for (let arm = 0; arm < 4; arm++) {
                    const a = laser.angle + DOWN + arm * Math.PI / 2;
                    shoot(this.c, laser.x + Math.cos(a) * 28, laser.y + Math.sin(a) * 28, a, 290, { ...STYLE.needle, life: 4 });
                }
                yield 0.12;
            }
            yield 1.1;
        }
    }

    private inward(x: number, y: number, count: number, radius: number, spin: number, offset: number, delay = 0): void {
        for (let i = 0; i < count; i++) {
            const a = offset + Math.PI * 2 * i / count;
            const b = shoot(this.c, x + Math.cos(a) * radius, y + Math.sin(a) * radius, a + Math.PI, 190,
                { ...STYLE.orangeSmall, delay, life: 5 });
            this.eye.push({ bullet: b, x, y, angle: a, radius, spin, pull: 100 });
        }
    }

    private burstEye(x: number, y: number, count: number, offset: number): void {
        this.eye.forEach(p => { p.bullet.dead = true; });
        this.eye = [];
        ring(this.c, x, y, count, 210, offset, STYLE.orange);
        this.c.emit({ type: 'boss-attack', x, y, kind: 'eye-burst' });
    }

    private *stormEye(): Generator<number> {
        yield 1;
        let offset = 0;
        while (!this.core.dead) {
            const x = this.core.x, y = this.core.y - 42;
            warn(this.c, this.core, 0.8, 'eye-inward');
            yield 0.8;
            this.inward(x, y, 18, 275, 0.65, offset);
            this.inward(x, y, 18, 230, -0.7, offset + 0.12, 0.35);
            yield 2.8;
            warn(this.c, this.core, 0.5, 'eye-burst');
            yield 0.5;
            this.burstEye(x, y, 26, offset + 0.2);
            offset += 0.23;
            yield 2.0;
        }
    }

    /** 隐藏版第四阶段：漩涡中心移到战场中段，两层反向雷暴覆盖整屏。 */
    private *fullVortex(): Generator<number> {
        yield 1;
        let offset = 0;
        while (!this.core.dead) {
            const y = ch(this.c, 0.43);
            warn(this.c, this.core, 1, 'full-vortex');
            this.c.emit({ type: 'telegraph', x: 0, y, kind: 'vortex-center' });
            yield 1;
            this.inward(0, y, 28, 325, 0.62, offset);
            this.inward(0, y, 24, 265, -0.72, -offset, 0.45);
            yield 3.2;
            this.burstEye(0, y, 32, offset + 0.12);
            yield 0.7;
            wall(this.c, this.core.y - 60, Math.max(-230, Math.min(230, this.c.player.x)), 180, 52, 175, STYLE.needle);
            offset += 0.22;
            yield 2.2;
        }
    }

    /** 连锁网格保留一整列通路；每一轮都重新给足一秒预警。 */
    private *lightningGrid(): Generator<number> {
        yield 5.5;
        while (!this.core.dead) {
            const width = this.c.bounds.right - this.c.bounds.left - 140;
            const gap = Math.max(0, Math.min(4, Math.round((this.c.player.x - this.c.bounds.left - 70) * 4 / width)));
            const shift = this.c.rng.sign();
            for (let wave = 0; wave < 2; wave++) {
                const columns: number[] = [];
                const safe = wave === 0 ? gap : (gap + shift + 5) % 5;
                for (let i = 0; i < 5; i++) {
                    if (i === safe) continue;
                    const x = this.c.bounds.left + 70 + (this.c.bounds.right - this.c.bounds.left - 140) * i / 4;
                    columns.push(x);
                    this.c.emit({ type: 'strike-warn', x, value: 1 });
                }
                yield 1;
                for (const x of columns) {
                    this.c.emit({ type: 'strike', x });
                    if (Math.abs(this.c.player.x - x) < 46) this.c.hurtPlayer();
                }
                yield 0.65;
            }
            yield this.phase >= 3 ? 4.5 : 6.5;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag !== 'typhon-tower') return;
        const index = part.data.slot;
        for (let i = 0; i < this.edges.length; i++) {
            const edge = this.edges[i];
            if (edge && (i === index || edge.parent === part)) {
                edge.link = undefined;
                if (!edge.dead) this.c.killEnemy(edge, 'mechanic', false);
            }
        }
        this.towers.forEach(p => { p.link = undefined; });
        if (!this.hidden || this.core.dead || this.c.phase !== 'boss') return;
        // 暴走电塔过载时反噬核心，补偿重生目标占用的输出窗口，鼓励主动打开缺口。
        this.c.damageEnemy(this.core, this.core.maxHp * 0.01, 'mechanic', this.core.x, this.core.y);
        this.c.emit({ type: 'explosion', x: this.core.x, y: this.core.y, size: 48, kind: 'metal' });
        if (this.core.dead) return;
        this.c.schedule(10, () => {
            if (this.core.dead || this.c.boss !== this || this.c.phase !== 'boss' || this.towers[index] !== part) return;
            const [ox, oy] = TOWER_OFFSETS[index];
            this.c.emit({ type: 'telegraph', x: this.core.x + ox, y: this.core.y + oy, kind: 'tower-rebirth' });
            this.makeTower(index, true);
        });
    }

    protected onBodyKilled(): void {
        this.eye.forEach(p => { p.bullet.dead = true; });
        this.eye = [];
        for (const edge of this.edges) if (edge && !edge.dead) this.c.killEnemy(edge, 'mechanic', false);
    }
}

/** 创建第 3 章 Boss；不是本章的 id 返回 undefined。 */
export function createCh3Boss(id: string, c: SfCombat): BossScript | undefined {
    switch (id) {
        case 'rhino': return new Rhino(c);
        case 'emship': return new EmShip(c);
        case 'rodship': return new RodShip(c);
        case 'steelwhale': return new SteelWhale(c);
        case 'typhon': return new Typhon(c);
        case 'typhon-hidden': return new Typhon(c, true);
        default: return undefined;
    }
}
