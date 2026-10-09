import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, Vec } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, aimAngle, fan, lob, ring, shoot } from '../../SfPatterns';

/** 第 5 章雪豹、雪人与极光鲸的信息（图鉴、警报横幅）。 */
export const CH5_BOSS_INFO_A: Record<string, BossInfo> = {
    snowleopard: { id: 'snowleopard', name: '雪豹机甲', tier: 'small', chapter: 5, frame: 'boss/snowleopard', intro: '避开冲刺预告线与延迟碎冰，沿爪击扇形的空隙移动并持续攻击机甲。' },
    stormyeti: { id: 'stormyeti', name: '风暴雪人', tier: 'small', chapter: 5, frame: 'boss/stormyeti', intro: '顺着风向避开雪球落点与反弹冰片，在冰面之间留住退路并持续攻击雪人。' },
    aurorawhale: { id: 'aurorawhale', name: '极光鲸', tier: 'mid', chapter: 5, frame: 'boss/aurorawhale', intro: '浮出时沿极光帘幕的缺口输出，下潜时避开背鳍裂缝与破冰落点。' },
};

/** 直接构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number,
    ground = false, body: EnemyDef['body'] = 'flesh'): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body, chapter: 5, contact: false, ground, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

// ───────────────────────────── 5-1 雪豹机甲 ─────────────────────────────

class SnowLeopard extends BossScript {
    readonly id = 'snowleopard';
    readonly name = '雪豹机甲';
    readonly tier: BossTier = 'small';
    private readonly home: number;
    private ready = false;
    private roaming = false;
    private bounceNext = false;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.home = ch(c, 0.74);
        this.spawnBody(def(this.id, this.name, 'boss/snowleopard', 'boss', 56, false, 'metal'),
            (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 160, this.hpFor('small'));
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, this.home, 1.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        const core = this.core;
        if (core.dead) return;
        core.damageScale = !this.entering && this.ready ? 1 : 0;
        if (!this.ready || !this.roaming || this.entering) return;
        const home = this.homePoint();
        core.x = home.x;
        core.y = home.y;
        core.angle = 0;
    }

    private homePoint(time = this.time): Vec {
        const c = this.c, center = (c.bounds.left + c.bounds.right) / 2;
        const amp = Math.max(0, Math.min(180, (c.bounds.right - c.bounds.left) / 2 - 134));
        return { x: center + Math.sin(time * 0.55) * amp, y: this.home + Math.sin(time * 0.9) * 8 };
    }

    protected setPhase(phase: number): void {
        // 攻击生成器被取消时，不能留下冲刺朝向或持续抢写位置的移动状态。
        this.ready = this.roaming = false;
        this.core.aimX = this.core.aimY = 0;
        this.core.vx = this.core.vy = 0;
        this.core.windup = 0;
        this.core.angle = 0;
        super.setPhase(phase);
    }

    onPhase(phase: number): void {
        if (phase !== this.phase || this.core.dead) return;
        this.c.scrollSpeed = 20;
        const home = this.homePoint();
        this.core.x = home.x;
        this.core.y = home.y;
        this.core.angle = 0;
        this.ready = this.roaming = true;
        this.bounceNext = false;
        this.start(this.cycle(), 'attack');
    }

    private *cycle(): Generator<number> {
        yield 0.65;
        while (!this.core.dead) {
            if (this.phase && this.bounceNext) yield* this.wallDash();
            else yield* this.aimedDash();
            if (this.phase) this.bounceNext = !this.bounceNext;
            yield 0.35;
            yield* this.claw();
            yield this.phase ? 0.55 : 0.85;
        }
    }

    private *claw(): Generator<number> {
        const target = { x: this.c.player.x, y: this.c.player.y };
        warn(this.c, this.core, 0.4, 'leopard-claw');
        yield 0.4;
        const x = this.core.x, y = this.core.y - 45;
        fan(this.c, x, y, Math.atan2(target.y - y, target.x - x), 5, 64, 200, this.style(STYLE.shard));
        this.c.emit({ type: 'boss-attack', x, y, kind: 'leopard-claw' });
    }

    /** 单步预告线只做显示，每帧重新登记；最后一帧也保持 warn > 0。 */
    private *preview(from: Vec, to: Vec, seconds: number, kind: string): Generator<number> {
        warn(this.c, this.core, seconds, kind);
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        this.core.aimX = length > 0 ? (to.x - from.x) / length : 0;
        this.core.aimY = length > 0 ? (to.y - from.y) / length : 0;
        let elapsed = 0;
        while (elapsed < seconds) {
            this.c.addHazard({ kind: 'laser', ax: from.x, ay: from.y, bx: to.x, by: to.y,
                width: 26, warn: Math.max(0.001, 1 - elapsed / seconds) });
            elapsed += this.dt;
            yield 0;
        }
        this.core.aimX = this.core.aimY = 0;
    }

    /** 尾迹按路程采样，低帧率也不会跳过碎冰；每点两片先闪烁 0.6 秒再向两侧飞出。 */
    private *dash(from: Vec, to: Vec, kind: string, stopAbovePlayer = false): Generator<number> {
        const core = this.core, length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length < 0.001) return;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        core.angle = angle - DOWN;
        this.c.emit({ type: 'boss-attack', x: from.x, y: from.y, kind });
        let distance = 0, nextShard = 40;
        while (distance < length) {
            let next = Math.min(length, distance + 900 * this.dt);
            if (stopAbovePlayer) {
                // 玩家在蓄力或冲刺期间向上移动时，只缩短已预告的路径，绝不继续逼近。
                const floor = Math.max(this.c.player.y + 170, ch(this.c, 0.3));
                if (core.y <= floor) break;
                next = Math.min(next, Math.max(distance, (from.y - floor) / -dy));
                if (next <= distance + 0.000001) break;
            }
            distance = next;
            core.x = from.x + dx * distance;
            core.y = from.y + dy * distance;
            while (nextShard <= distance + 0.000001) {
                const x = from.x + dx * nextShard, y = from.y + dy * nextShard;
                for (const side of [-1, 1]) shoot(this.c, x, y, angle + side * Math.PI / 2,
                    110, this.style({ ...STYLE.shard, delay: 0.6 }));
                nextShard += 40;
            }
            yield 0;
        }
        core.x = from.x + dx * distance;
        core.y = from.y + dy * distance;
    }

    private *returnHome(): Generator<number> {
        const home = this.homePoint(this.time + 0.8);
        this.core.angle = 0;
        yield* this.moveTo(this.core, home.x, home.y, 0.8);
        this.roaming = true;
    }

    private *aimedDash(): Generator<number> {
        this.roaming = false;
        const c = this.c, core = this.core, from = { x: core.x, y: core.y };
        // 在蓄力开始时锁定方向与停止线，不在发射前重新追踪玩家。
        const angle = aimAngle(c, from.x, from.y), dx = Math.cos(angle), dy = Math.sin(angle);
        const floor = Math.max(c.player.y + 170, ch(c, 0.3));
        let distance = from.y > floor && dy < -0.0001 ? (from.y - floor) / -dy : 0;
        if (dx > 0.0001) distance = Math.min(distance, (c.bounds.right - core.radius - from.x) / dx);
        else if (dx < -0.0001) distance = Math.min(distance, (c.bounds.left + core.radius - from.x) / dx);
        distance = Math.max(0, distance);
        const to = { x: from.x + dx * distance, y: from.y + dy * distance };
        yield* this.preview(from, to, 0.7, 'leopard-dash');
        yield* this.dash(from, to, 'leopard-dash', true);
        yield* this.returnHome();
    }

    private *wallDash(): Generator<number> {
        this.roaming = false;
        const c = this.c, core = this.core, side = c.rng.sign();
        const left = c.bounds.left + core.radius, right = c.bounds.right - core.radius;
        const firstX = side < 0 ? left : right;
        const totalX = Math.abs(firstX - core.x) + 2 * (right - left);
        const endY = ch(c, c.rng.range(0.44, 0.58));
        const slope = (endY - core.y) / Math.max(1, totalX);
        // 只反射水平速度，纵向斜率保持一致；三段均留在 ch .4～.85 的上半区。
        for (let segment = 0; segment < 3; segment++) {
            const from = { x: core.x, y: core.y };
            const x = segment === 1 ? (side < 0 ? right : left) : firstX;
            const to = { x, y: from.y + Math.abs(x - from.x) * slope };
            yield* this.preview(from, to, 0.35, 'leopard-wall-dash');
            yield* this.dash(from, to, 'leopard-wall-dash');
        }
        yield* this.returnHome();
    }
}

// ───────────────────────────── 5-3 风暴雪人 ─────────────────────────────

class StormYeti extends BossScript {
    readonly id = 'stormyeti';
    readonly name = '风暴雪人';
    readonly tier: BossTier = 'small';
    private readonly home: number;
    private ready = false;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.home = ch(c, 0.76);
        this.spawnBody(def(this.id, this.name, 'boss/stormyeti', 'boss', 70),
            (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 180, this.hpFor('small'));
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, this.home, 1.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        const core = this.core;
        if (core.dead) return;
        core.damageScale = !this.entering && this.ready ? 1 : 0;
        if (this.entering || !this.ready) return;
        const amp = Math.max(0, Math.min(95, (c.bounds.right - c.bounds.left) / 2 - 144));
        core.x = (c.bounds.left + c.bounds.right) / 2 + Math.sin(this.time * 0.35) * amp;
        core.y = this.home + Math.sin(this.time * 0.6) * 7;
    }

    protected setPhase(phase: number): void {
        this.ready = false;
        this.core.windup = 0;
        super.setPhase(phase);
    }

    onPhase(phase: number): void {
        if (phase !== this.phase || this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.ready = true;
        this.start(this.cycle(), 'attack');
    }

    private *cycle(): Generator<number> {
        yield this.phase ? 0.55 : 0.8;
        while (!this.core.dead) {
            yield* this.snowballs(this.phase ? 3 : 1);
            yield this.phase ? 0.15 : 0.5;
            yield* this.snowFan();
            if (this.phase) {
                yield 0.15;
                yield* this.groundPound();
                yield 0.4;
            } else yield 1.65;
        }
    }

    private *snowballs(count: number): Generator<number> {
        const kind = count === 1 ? 'yeti-snowball' : 'yeti-snowball-volley';
        warn(this.c, this.core, 0.6, kind);
        yield 0.6;
        const c = this.c, px = c.player.x, py = c.player.y;
        const offsets = count === 1 ? [c.rng.range(-120, 120)] : [-120, 0, 120];
        for (let i = 0; i < offsets.length; i++) {
            const x = Math.max(c.bounds.left + 64, Math.min(c.bounds.right - 64, px + offsets[i]));
            // 齐射的中间落点稍靠上，三颗都不压在玩家身上；两侧和下方保留退路。
            const y = Math.max(py + 60, Math.min(c.bounds.top - 64, py + (count > 1 && i === 1 ? 170 : 100)));
            c.addHazard({ kind: 'mark', ax: x, ay: y, bx: x, by: y,
                width: 60, warn: 1, warnTime: 1.2, life: 1.2 });
            lob(c, this.core.x, this.core.y - 55, x, y, 1.2, 200,
                this.style({ ...STYLE.snowball, pool: { radius: 60, life: 5, kind: 'ice' } }));
        }
        // 侧风只由战斗核心施加，Boss 不二次修改弹速或落点。
        c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y - 55, kind });
        yield 1.2;
    }

    private *snowFan(): Generator<number> {
        warn(this.c, this.core, 0.45, 'yeti-snow-fan');
        yield 0.45;
        fan(this.c, this.core.x, this.core.y - 55, DOWN, 7, 90, 190,
            this.style({ ...STYLE.shard, bounces: 1 }));
        this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y - 55, kind: 'yeti-snow-fan' });
    }

    private *groundPound(): Generator<number> {
        const c = this.c, px = c.player.x, y = c.player.y + 220;
        const target = { x: c.player.x, y: c.player.y };
        warn(c, this.core, 0.8, 'yeti-ground-pound');
        for (const offset of [-180, 0, 180]) c.addHazard({ kind: 'mark', ax: px + offset, ay: y,
            bx: px + offset, by: y, width: 60, warn: 1, warnTime: 0.8, life: 0.8 });
        yield 0.8;
        const x = this.core.x, sy = this.core.y - 55;
        // 十二弹相邻差 30°，把预告时的玩家方向放在两弹正中，保留可穿过的径向缺口。
        ring(c, x, sy, 12, 170, Math.atan2(target.y - sy, target.x - x) - Math.PI / 12,
            this.style(STYLE.shard));
        for (const offset of [-180, 0, 180]) c.addIce(px + offset, y, 60, 5);
        c.emit({ type: 'boss-attack', x, y: sy, kind: 'yeti-ground-pound' });
    }
}

// ───────────────────────────── 5-4 极光鲸 ─────────────────────────────

class AuroraWhale extends BossScript {
    readonly id = 'aurorawhale';
    readonly name = '极光鲸';
    readonly tier: BossTier = 'mid';
    private ready = false;
    private submerged = false;
    private swimTime = 0;
    private fins: Enemy[] = [];

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        const body = def(this.id, this.name, 'boss/aurorawhale', 'boss', 80);
        // 核心每帧先把屏内敌人标为 entered；行为钩子在碰撞前排除潜藏本体，子弹才能穿过。
        body.behavior = { update(e) { if (e.data.submerged) e.entered = false; } };
        // 每轮约 3 秒潜入冰下不可伤：血量按暴露时间折算为 0.85 倍。
        this.spawnBody(body, (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 220, this.hpFor('mid') * 0.85);
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, ch(c, 0.725), 2.2), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead) return;
        // 阶段护盾的异步恢复不能让下潜本体恢复受伤，也不能跳过尚未结束的阶段切换。
        this.core.damageScale = !this.entering && this.ready && !this.submerged ? 1 : 0;
        this.core.alpha = this.submerged ? 0 : 1;
        if (this.submerged) this.core.entered = false;
    }

    private clearFins(): void {
        for (const fin of this.fins) if (!fin.dead) this.c.killEnemy(fin, 'mechanic', false);
        this.fins = [];
    }

    private showBody(): void {
        this.submerged = false;
        this.core.data.submerged = 0;
        this.core.alpha = 1;
        this.core.entered = true;
        this.core.damageScale = !this.entering && this.ready ? 1 : 0;
        this.core.windup = 0;
    }

    protected setPhase(phase: number): void {
        // 中断下潜时先清理未登记为部件的背鳍，并恢复本体可见性；护盾仍由基类计时。
        this.ready = false;
        this.clearFins();
        this.showBody();
        super.setPhase(phase);
    }

    onPhase(phase: number): void {
        if (phase !== this.phase || this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.ready = true;
        this.clearFins();
        this.showBody();
        this.start(this.cycle(), 'attack');
    }

    private *cycle(): Generator<number> {
        while (!this.core.dead) {
            yield* this.surface();
            yield* this.dive();
        }
    }

    private curtain(): void {
        const c = this.c, spacing = 520 / 10;
        const left = this.core.x - 260 + Math.sin(this.time * 3) * 60;
        const center = (c.bounds.left + c.bounds.right) / 2;
        const gapX = center + Math.sin(this.time * 0.28) * 110;
        const gap = Math.max(0, Math.min(9, Math.round((gapX - left) / spacing - 0.5)));
        // 十一个槽位实发九弹、空出相邻两槽；漂移缺口以场地中部为基准，不能随鲸游到屏外。
        for (let i = 0; i < 11; i++) {
            if (i === gap || i === gap + 1) continue;
            const x = left + i * spacing;
            if (x < c.bounds.left + 12 || x > c.bounds.right - 12) continue;
            shoot(c, x, this.core.y - 70, DOWN, 150, this.style({ ...STYLE.ghost, delay: 0.18 }));
        }
    }

    private bounceShards(): void {
        for (const side of [-1, 1]) {
            for (const tilt of [0.16, 0.3]) shoot(this.c, this.core.x, this.core.y - 40,
                DOWN + side * (Math.PI / 2 - tilt), 200, this.style({ ...STYLE.shard, bounces: 1 }));
        }
        this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y - 40, kind: 'aurora-bounce' });
    }

    /** 五秒浮出包括 0.6 秒帘幕预警；破冰后前 0.8 秒平滑回游，期间同样可以输出。 */
    private *surface(): Generator<number> {
        const c = this.c, core = this.core, start = { x: core.x, y: core.y };
        const center = (c.bounds.left + c.bounds.right) / 2;
        const amp = Math.max(0, Math.min(190, (c.bounds.right - c.bounds.left) / 2 - 184));
        const height = c.bounds.top - c.bounds.bottom;
        const interval = this.phase >= 2 ? 0.2 : 0.25;
        let elapsed = 0, nextRow = 0.6, nextBounce = 1.2;
        let bounceWarned = false, diveWarned = false, curtainStarted = false;
        warn(c, core, 0.6, 'aurora-curtain');
        while (elapsed < 5) {
            const px = core.x, py = core.y;
            this.swimTime += this.dt;
            const x = center + Math.sin(this.swimTime * 0.4) * amp;
            const y = ch(c, 0.725) + Math.sin(this.swimTime * 0.55) * height * 0.1;
            const u = Math.min(1, elapsed / 0.8), k = u * u * (3 - 2 * u);
            core.x = start.x + (x - start.x) * k;
            core.y = start.y + (y - start.y) * k;
            if (Math.hypot(core.x - px, core.y - py) > 0.0001) {
                core.angle = Math.atan2(core.y - py, core.x - px) - DOWN;
            }
            while (elapsed + 0.000001 >= nextRow) {
                if (!curtainStarted) {
                    curtainStarted = true;
                    c.emit({ type: 'boss-attack', x: core.x, y: core.y - 70, kind: 'aurora-curtain' });
                }
                this.curtain();
                nextRow += interval;
            }
            if (this.phase >= 1) {
                if (!bounceWarned && elapsed >= nextBounce - 0.35) {
                    bounceWarned = true;
                    warn(c, core, 0.35, 'aurora-bounce');
                }
                if (elapsed + 0.000001 >= nextBounce) {
                    this.bounceShards();
                    nextBounce += 1.2;
                    bounceWarned = false;
                }
            }
            if (!diveWarned && elapsed >= 4.4) {
                diveWarned = true;
                warn(c, core, 0.6, 'whale-dive');
            }
            elapsed += this.dt;
            yield 0;
        }
    }

    private spawnFin(point: Vec, angle: number): Enemy {
        const finDef = def('aurorawhale-fin', '极光鲸背鳍', 'boss/whale-fin', 'part', 24);
        finDef.score = finDef.energy = finDef.coins = 0;
        finDef.behavior = { update(e) { e.entered = false; e.damageScale = 0; } };
        const fin = this.c.spawnEnemy(finDef, point.x, point.y, null, { boss: true, persistent: true });
        fin.wreck = true;
        fin.damageScale = 0;
        fin.entered = false;
        fin.base = true;
        fin.angle = angle - DOWN;
        fin.alpha = 0;
        // 装饰敌人不加入 bodies / parts，不能参与血量、部件奖励或胜负判定。
        this.fins.push(fin);
        return fin;
    }

    private *dive(): Generator<number> {
        const c = this.c, core = this.core, side = c.rng.sign();
        const center = (c.bounds.left + c.bounds.right) / 2;
        const halfSpan = Math.max(0, Math.min(280, (c.bounds.right - c.bounds.left) / 2 - 96));
        const from = { x: center - side * halfSpan, y: ch(c, 0.46) };
        const to = { x: center + side * halfSpan, y: from.y - Math.min((c.bounds.top - c.bounds.bottom) * 0.12, 180) };
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const dx = (to.x - from.x) / Math.max(0.001, length), dy = (to.y - from.y) / Math.max(0.001, length);
        const travel = length / 260, duration = travel + 0.6;
        // 常见屏幕穿行约 2.2 秒，终点再预告 0.6 秒；双鳍同时移动，不增加下潜无敌时长。
        this.submerged = true;
        core.data.submerged = 1;
        core.alpha = 0;
        core.damageScale = 0;
        core.entered = false;
        core.windup = 0;
        const paths = [{ from, to, dx, dy }];
        if (this.phase >= 2) paths.push({ from: { x: 2 * center - from.x, y: from.y },
            to: { x: 2 * center - to.x, y: to.y }, dx: -dx, dy });
        for (const path of paths) this.spawnFin(path.from, Math.atan2(path.dy, path.dx));
        let elapsed = 0, nextTrail = 0.12, breachWarned = false;
        while (elapsed < duration) {
            elapsed = Math.min(duration, elapsed + this.dt);
            const distance = Math.min(length, elapsed * 260);
            for (let i = 0; i < paths.length; i++) {
                const path = paths[i], fin = this.fins[i];
                fin.x = path.from.x + path.dx * distance;
                fin.y = path.from.y + path.dy * distance;
                fin.alpha = Math.min(1, elapsed / 0.15);
            }
            while (nextTrail <= Math.min(elapsed, travel) + 0.000001) {
                const d = Math.min(length, nextTrail * 260), back = Math.max(0, d - 40);
                for (const path of paths) c.addHazard({ kind: 'fissure',
                    ax: path.from.x + path.dx * back, ay: path.from.y + path.dy * back,
                    bx: path.from.x + path.dx * d, by: path.from.y + path.dy * d,
                    width: 12, warn: 1, warnTime: 1, life: 1 + 0.6, scroll: false });
                nextTrail += 0.12;
            }
            if (!breachWarned && elapsed >= travel) {
                breachWarned = true;
                warn(c, this.fins[0], 0.6, 'whale-breach');
                c.addHazard({ kind: 'mark', ax: to.x, ay: to.y, bx: to.x, by: to.y,
                    width: 90, warn: 1, warnTime: 0.6, life: 0.6 });
            }
            core.x = this.fins[0].x;
            core.y = this.fins[0].y;
            yield 0;
        }
        core.x = to.x;
        core.y = to.y;
        core.angle = 0;
        this.clearFins();
        this.showBody();
        ring(c, to.x, to.y, 12, 170, aimAngle(c, to.x, to.y) - Math.PI / 12,
            this.style({ ...STYLE.ghost, delay: 0.18 }));
        c.emit({ type: 'boss-attack', x: to.x, y: to.y, kind: 'whale-breach' });
    }

    protected onBodyKilled(): void {
        this.ready = false;
        this.clearFins();
    }
}

/** 创建第 5 章本组 Boss；不是本组的 id 返回 null。 */
export function createCh5BossA(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'snowleopard': return new SnowLeopard(c);
        case 'stormyeti': return new StormYeti(c);
        case 'aurorawhale': return new AuroraWhale(c);
        default: return null;
    }
}
