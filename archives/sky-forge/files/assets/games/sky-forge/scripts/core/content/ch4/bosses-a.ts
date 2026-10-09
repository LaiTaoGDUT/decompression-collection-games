import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, Hazard, Vec } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, aimAngle, aimed, fan, lob, ring, shoot, stream } from '../../SfPatterns';

/** 第 4 章前三位 Boss 信息（图鉴、警报横幅）。 */
export const CH4_BOSS_INFO_A: Record<string, BossInfo> = {
    magmatoad: { id: 'magmatoad', name: '熔岩蟾蜍', tier: 'small', chapter: 4, frame: 'boss/magmatoad', intro: '避开落点阴影和扫舌起始线，在熔岩湖之间的空隙持续攻击蟾蜍。' },
    lavaworm: { id: 'lavaworm', name: '熔岩蠕虫', tier: 'mid', chapter: 4, frame: 'boss/lavaworm', intro: '只有头部和尾刺会受伤，子弹会穿过甲壳；沿预告轨迹守住头部钻出的位置，打断尾刺后身体变短、钻得更快。' },
    magmaray: { id: 'magmaray', name: '岩浆鳐', tier: 'small', chapter: 4, frame: 'boss/magmaray', intro: '远离滑翔留下的熔岩滩，避开翼尖两侧弹幕并在破土阴影出现后横移。' },
};

/** 直接构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number, ground = false): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body: 'flesh', chapter: 4, contact: false, ground, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

// ───────────────────────────── 4-1 熔岩蟾蜍 ─────────────────────────────

interface ToadLake extends Vec { hazard?: Hazard }

class MagmaToad extends BossScript {
    readonly id = 'magmatoad';
    readonly name = '熔岩蟾蜍';
    readonly tier: BossTier = 'small';
    private lakes: ToadLake[];
    private lakeIndex = 1;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.lakes = [{ x: -220, y: ch(c, 0.70) }, { x: 0, y: ch(c, 0.80) }, { x: 220, y: ch(c, 0.66) }];
        this.ensureLakes();
        this.spawnBody(def(this.id, this.name, 'boss/magmatoad', 'boss', 70, true), 0, c.bounds.top + 150, this.hpFor('small'));
        this.start(this.enter(0, this.lakes[1].y, 1.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (!this.core.dead) this.ensureLakes();
    }

    /** 固定湖不能随地面漂走；危险物被规则清理或限额淘汰后重新登记。 */
    private ensureLakes(): void {
        for (const lake of this.lakes) {
            if (lake.hazard && this.c.hazards.indexOf(lake.hazard) >= 0) continue;
            const pool = this.c.addLava(lake.x, lake.y, 58, 9999);
            pool.scroll = false;
            pool.warn = 1;
            pool.warnTime = 0.8;
            lake.hazard = pool;
        }
    }

    protected setPhase(phase: number): void {
        // 攻击生成器会被基类取消，不能把跳跃放大的体型留给下一阶段。
        this.core.scale = 1;
        super.setPhase(phase);
    }

    onPhase(): void {
        if (this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.core.scale = 1;
        const lake = this.lakes[this.lakeIndex];
        this.core.x = lake.x;
        this.core.y = lake.y;
        this.start(this.cycle(), 'attack');
    }

    private *cycle(): Generator<number> {
        yield this.phase ? 0.45 : 0.7;
        while (!this.core.dead) {
            yield* this.hop();
            yield this.phase ? 0.12 : 0.25;
            warn(this.c, this.core, this.phase ? 0.3 : 0.4, 'toad-spit');
            yield this.phase ? 0.3 : 0.4;
            aimed(this.c, this.core.x, this.core.y - 50, 3, 36, 210, this.style(STYLE.ember));
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y - 50, kind: 'toad-spit' });
            yield this.phase ? 0.2 : 0.35;
            yield* this.tongue();
            yield this.phase ? 0.6 : 1.1;
        }
    }

    private *hop(): Generator<number> {
        const index = (this.lakeIndex + (this.c.rng.sign() < 0 ? 1 : 2)) % this.lakes.length;
        const target = this.lakes[index], core = this.core;
        const sx = core.x, sy = core.y;
        const arc = Math.max(0, Math.min(90, this.c.bounds.top - Math.max(sy, target.y) - core.radius * 1.35));
        this.c.addHazard({ kind: 'mark', ax: target.x, ay: target.y, bx: target.x, by: target.y,
            width: 74, life: 0.9, warn: 1, warnTime: 0.9 });
        warn(this.c, core, 0.9, this.phase ? 'toad-hop-embers' : 'toad-hop');
        let elapsed = 0, lobbed = false;
        while (elapsed < 0.9) {
            elapsed += this.dt;
            const u = Math.min(1, elapsed / 0.9), height = 4 * u * (1 - u);
            core.x = sx + (target.x - sx) * u;
            core.y = sy + (target.y - sy) * u + arc * height;
            core.scale = 1 + 0.35 * height;
            if (this.phase && !lobbed && u >= 0.5) {
                lobbed = true;
                const px = this.c.player.x, py = this.c.player.y + 40;
                for (const offset of [-160, -80, 0, 80, 160]) {
                    const tx = px + offset;
                    this.c.addHazard({ kind: 'mark', ax: tx, ay: py, bx: tx, by: py,
                        width: 40, life: 1.1, warn: 1, warnTime: 1.1 });
                    lob(this.c, core.x, core.y - 50, tx, py, 1.1, 160,
                        this.style({ ...STYLE.ember, pool: { radius: 40, life: 3 } }));
                }
                this.c.emit({ type: 'boss-attack', x: core.x, y: core.y, kind: 'toad-hop-embers' });
            }
            yield 0;
        }
        this.lakeIndex = index;
        core.x = target.x;
        core.y = target.y;
        core.scale = 1;
        ring(this.c, core.x, core.y, 14, 190, DOWN, this.style(STYLE.orange));
        this.c.emit({ type: 'boss-attack', x: core.x, y: core.y, kind: 'toad-land' });
    }

    private tongueLine(angle: number, warning: number): void {
        const x = this.core.x, y = this.core.y - 50;
        this.c.addHazard({ kind: 'tongue', ax: x, ay: y, bx: x + Math.cos(angle) * 560,
            by: y + Math.sin(angle) * 560, width: 14, warn: warning });
    }

    /** 先完整展示起始线；第二阶段同一次扫舌沿原路返回，期间仍留出两侧通路。 */
    private *tongue(): Generator<number> {
        const direction = this.c.rng.sign();
        const start = DOWN - direction * 0.9, end = DOWN + direction * 0.9;
        warn(this.c, this.core, 0.7, this.phase ? 'toad-double-tongue' : 'toad-tongue');
        let elapsed = 0;
        while (elapsed < 0.7) {
            this.tongueLine(start, Math.max(0.001, 1 - elapsed / 0.7));
            elapsed += this.dt;
            yield 0;
        }
        for (let sweep = 0; sweep < (this.phase ? 2 : 1); sweep++) {
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y - 50,
                kind: sweep ? 'toad-tongue-return' : 'toad-tongue' });
            elapsed = 0;
            while (elapsed < 0.8) {
                elapsed += this.dt;
                const u = Math.min(1, elapsed / 0.8);
                this.tongueLine(sweep ? end + (start - end) * u : start + (end - start) * u, 0);
                yield 0;
            }
        }
    }
}

// ───────────────────────────── 4-2 熔岩蠕虫 ─────────────────────────────

interface CurveSample { t: number; distance: number }
interface WormCurve { entry: Vec; control: Vec; exit: Vec; samples: CurveSample[]; length: number }
const WORM_SPEED = 320;

interface WormPiece { enemy: Enemy; gap: number; distance: number; warned: boolean; fired: boolean }

class LavaWorm extends BossScript {
    readonly id = 'lavaworm';
    readonly name = '熔岩蠕虫';
    readonly tier: BossTier = 'mid';
    private pieces: WormPiece[] = [];
    private segments: Enemy[] = [];
    private tail: Enemy;
    private tailLost = false;
    private ready = false;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        const hp = this.hpFor('mid');
        const headDef = def(this.id, this.name, 'boss/lavaworm', 'boss', 46);
        // 核心随后会把场内目标标为 entered，行为钩子在碰撞前再次排除潜藏部位。
        headDef.behavior = { update(e) { if (!e.data.airborne) e.entered = false; } };
        // 只有头部能受伤、且只在探头和穿场时暴露：血量按约三分之一的暴露时间折算。
        const core = this.spawnBody(headDef, 0, c.bounds.top + 140, hp * 0.34);
        this.addPiece(core, 0);
        const bodyDef = def('lavaworm-body', '蠕虫甲壳', 'boss/lavaworm-body', 'part', 30);
        // 甲壳不拦截子弹：身体沿头部走过的路线跟随，挡弹会让瞄准头部的子弹几乎全被后续节段吃掉。
        // entered 始终为 false，子弹直接穿过；甲壳只负责开火与压迫走位。
        bodyDef.behavior = { update(e) {
            e.damageScale = 0;
            e.entered = false;
        } };
        for (let i = 0; i < 7; i++) {
            const part = this.spawnPart(bodyDef, core, 0, 0, hp);
            // 身体沿已走过的曲线跟随，不能再被核心的父子偏移覆盖坐标。
            part.parent = undefined;
            part.partTag = 'worm-body';
            // 甲壳只挡子弹、不会被打坏：不显示血条（只有头部和尾刺可伤）。
            part.base = true;
            this.segments.push(part);
            this.addPiece(part, (i + 1) * 34);
        }
        const tailDef = def('lavaworm-tail', '蠕虫尾刺', 'boss/lavaworm-tail', 'part', 22);
        tailDef.behavior = { update(e) { if (!e.data.airborne) e.entered = false; } };
        this.tail = this.spawnPart(tailDef, core, 0, 0, hp * 0.12);
        this.tail.parent = undefined;
        this.tail.partTag = 'worm-tail';
        this.tail.drop = 'main';
        this.addPiece(this.tail, 8 * 34);
        this.start(this.enter(0, ch(c, 0.7), 1.6), 'move');
    }

    private addPiece(enemy: Enemy, gap: number): void {
        enemy.alpha = 0;
        enemy.damageScale = 0;
        enemy.entered = false;
        enemy.data.airborne = 0;
        this.pieces.push({ enemy, gap, distance: -gap, warned: false, fired: false });
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead) return;
        // 基类进场、阶段护盾结束时会把部件恢复为 1，甲壳必须每帧覆盖。
        for (const segment of this.segments) if (!segment.dead) segment.damageScale = 0;
        for (const enemy of [this.core, this.tail]) {
            if (enemy.dead) continue;
            enemy.damageScale = !this.entering && this.ready && !!enemy.data.airborne ? 1 : 0;
        }
    }

    private hideAll(): void {
        for (const piece of this.pieces) {
            const e = piece.enemy;
            e.alpha = 0;
            e.damageScale = 0;
            e.entered = false;
            e.data.airborne = 0;
            e.windup = 0;
        }
    }

    protected setPhase(phase: number): void {
        this.ready = false;
        this.hideAll();
        super.setPhase(phase);
    }

    onPhase(): void {
        if (this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.ready = true;
        this.hideAll();
        this.start(this.dives(), 'attack');
    }

    private point(curve: WormCurve, t: number): Vec {
        const u = 1 - t;
        return { x: u * u * curve.entry.x + 2 * u * t * curve.control.x + t * t * curve.exit.x,
            y: u * u * curve.entry.y + 2 * u * t * curve.control.y + t * t * curve.exit.y };
    }

    /** 数值弧长表使头和每个部位都以路程跟随，不以时间偏移近似间距。 */
    private curve(entry: Vec, control: Vec, exit: Vec): WormCurve {
        const curve: WormCurve = { entry, control, exit, samples: [{ t: 0, distance: 0 }], length: 0 };
        let previous = entry;
        for (let i = 1; i <= 96; i++) {
            const t = i / 96, p = this.point(curve, t);
            curve.length += Math.hypot(p.x - previous.x, p.y - previous.y);
            curve.samples.push({ t, distance: curve.length });
            previous = p;
        }
        return curve;
    }

    private pickCurve(): WormCurve {
        const c = this.c, side = c.rng.sign();
        // 从高处的孔钻出、向下方的孔钻入：头部领先朝向玩家，甲壳拖在头部上方，正面火力能打到头。
        // 左右孔至少相隔 420 像素；控制点也留在安全高度，整个凸包不会压进底部。
        const entry = { x: side * c.rng.range(210, 280), y: ch(c, c.rng.range(0.77, 0.88)) };
        const exit = { x: -side * c.rng.range(210, 280), y: ch(c, c.rng.range(0.45, 0.56)) };
        const control = { x: (c.player.x < 0 ? -1 : 1) * 240,
            y: Math.max(ch(c, 0.45), (entry.y + exit.y) / 2 - (c.bounds.top - c.bounds.bottom) * 0.15) };
        return this.curve(entry, control, exit);
    }

    private crossing(curve: WormCurve): WormCurve {
        // 左右镜像：两次俯冲在中线交叉成 X，仍保持自上而下、头部朝向玩家。
        return this.curve({ x: -curve.entry.x, y: curve.entry.y },
            { x: -curve.control.x, y: curve.control.y },
            { x: -curve.exit.x, y: curve.exit.y });
    }

    private along(curve: WormCurve, distance: number): Vec & { angle: number } {
        const d = Math.max(0, Math.min(curve.length, distance));
        const samples = curve.samples;
        let low = 0, high = samples.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (samples[mid].distance < d) low = mid;
            else high = mid;
        }
        const a = samples[low], b = samples[high];
        const u = (d - a.distance) / Math.max(0.0001, b.distance - a.distance);
        const t = a.t + (b.t - a.t) * u, p = this.point(curve, t);
        const vx = 2 * ((1 - t) * (curve.control.x - curve.entry.x) + t * (curve.exit.x - curve.control.x));
        const vy = 2 * ((1 - t) * (curve.control.y - curve.entry.y) + t * (curve.exit.y - curve.control.y));
        return { x: p.x, y: p.y, angle: Math.atan2(vy, vx) + Math.PI / 2 };
    }

    private mark(curve: WormCurve): void {
        for (let d = 0; d < curve.length; d += 70) {
            const p = this.along(curve, d);
            this.c.addHazard({ kind: 'mark', ax: p.x, ay: p.y, bx: p.x, by: p.y,
                width: 14, life: 1.1, warn: 1, warnTime: 1.1 });
        }
        const p = curve.exit;
        this.c.addHazard({ kind: 'mark', ax: p.x, ay: p.y, bx: p.x, by: p.y,
            width: 14, life: 1.1, warn: 1, warnTime: 1.1 });
    }

    private hole(p: Vec, kind: string): void {
        ring(this.c, p.x, p.y, 10, 185, DOWN, this.style(STYLE.orange));
        this.c.emit({ type: 'boss-attack', x: p.x, y: p.y, kind });
        if (this.phase >= 2) {
            const pool = this.c.addLava(p.x, p.y, 50, 4);
            pool.warn = 1;
            pool.warnTime = 0.35;
        }
    }

    private segmentShot(e: Enemy): void {
        if (this.phase >= 2) {
            const y = e.y - 260;
            this.c.addHazard({ kind: 'mark', ax: e.x, ay: y, bx: e.x, by: y,
                width: 34, life: 1.1, warn: 1, warnTime: 1.1 });
            lob(this.c, e.x, e.y, e.x, y, 1.1, 120,
                this.style({ ...STYLE.ember, pool: { radius: 34, life: 3 } }));
        } else {
            fan(this.c, e.x, e.y - 20, DOWN, 3, 48, 180, this.style(STYLE.small));
        }
    }

    private *dive(curve: WormCurve): Generator<number> {
        this.hideAll();
        this.core.x = curve.entry.x;
        this.core.y = curve.entry.y;
        this.mark(curve);
        warn(this.c, this.core, 1.1, 'worm-path');
        yield 1.1;
        for (const piece of this.pieces) { piece.warned = false; piece.fired = false; }
        this.hole(curve.entry, 'worm-emerge');
        // 探头：头部先在预告的洞口停留约一秒（身体仍在地下），这是最稳定的输出窗口。
        const head = this.core, start = this.along(curve, 0);
        head.data.airborne = 1; head.alpha = 1; head.entered = true; head.damageScale = 1;
        head.x = start.x; head.y = start.y; head.angle = 0;
        const rear = this.phase >= 2 ? 1.1 : 1.5;
        for (let t = 0; t < rear && !head.dead; t += this.dt) {
            head.y = start.y + Math.sin(t / rear * Math.PI) * 26;
            yield 0;
        }
        let distance = 0, dived = false;
        while (!this.core.dead) {
            // 头部是唯一的输出窗口：速度放慢到能跟住瞄准（约 2 秒穿场）。
            const speed = WORM_SPEED * (this.tailLost ? 1.3 : 1);
            const lastGap = this.pieces.reduce((gap, p) => p.enemy.dead ? gap : Math.max(gap, p.gap), 0);
            if (distance > curve.length + lastGap) break;
            // 用当前帧的速度和步长推进，断尾加速和慢动作切换都立即生效。
            distance += speed * this.dt;
            for (const piece of this.pieces) {
                const e = piece.enemy;
                if (e.dead) continue;
                piece.distance = distance - piece.gap;
                const airborne = piece.distance >= 0 && piece.distance <= curve.length;
                e.data.airborne = airborne ? 1 : 0;
                e.alpha = airborne ? 1 : 0;
                const target = e === this.core || e === this.tail;
                e.entered = airborne && target;
                e.damageScale = airborne && target ? 1 : 0;
                if (!airborne) continue;
                const p = this.along(curve, piece.distance);
                e.x = p.x; e.y = p.y;
                e.angle = p.angle + (e === this.tail ? Math.PI : 0);
                e.vx = Math.cos(p.angle + DOWN) * speed;
                e.vy = Math.sin(p.angle + DOWN) * speed;
                if (e === this.core || e === this.tail) continue;
                if (!piece.warned && piece.distance >= curve.length / 2 - speed * 0.35) {
                    piece.warned = true;
                    warn(this.c, e, 0.35, this.phase >= 2 ? 'worm-ember' : 'worm-fan');
                }
                if (!piece.fired && piece.distance >= curve.length / 2) {
                    piece.fired = true;
                    this.segmentShot(e);
                }
            }
            if (!dived && distance >= curve.length) {
                dived = true;
                this.hole(curve.exit, 'worm-dive');
            }
            yield 0;
        }
        this.hideAll();
    }

    private *dives(): Generator<number> {
        while (!this.core.dead) {
            const first = this.pickCurve();
            yield* this.dive(first);
            if (this.phase >= 1) yield* this.dive(this.crossing(first));
            yield this.tailLost ? 0.8 : 1.2;
        }
    }

    onPartDestroyed(part: Enemy): void {
        if (part.partTag !== 'worm-tail' || this.tailLost || this.core.dead) return;
        this.tailLost = true;
        for (const segment of this.segments.slice(-2)) {
            if (!segment.dead) this.c.killEnemy(segment, 'mechanic', false);
        }
    }
}

// ───────────────────────────── 4-3 岩浆鳐 ─────────────────────────────

class MagmaRay extends BossScript {
    readonly id = 'magmaray';
    readonly name = '岩浆鳐';
    readonly tier: BossTier = 'small';
    private theta = 0;
    private ready = false;
    private gliding = false;
    private submerged = false;
    private trailClock = 0;
    private rejoin?: Vec;
    private rejoinTime = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        const body = def(this.id, this.name, 'boss/magmaray', 'boss', 64);
        body.behavior = { damage(e, _c, amount) { return e.data.submerged ? 0 : amount; } };
        this.spawnBody(body, 0, c.bounds.top + 150, this.hpFor('small'));
        this.start(this.enter(0, ch(c, 0.675), 1.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        const core = this.core, px = core.x, py = core.y;
        super.update(c, dt);
        if (core.dead) return;
        core.vx = (core.x - px) / Math.max(0.0001, dt);
        core.vy = (core.y - py) / Math.max(0.0001, dt);
        if (Math.hypot(core.vx, core.vy) > 0.001) core.angle = Math.atan2(core.vy, core.vx) + Math.PI / 2;
        core.damageScale = !this.entering && this.ready && !this.submerged ? 1 : 0;
        if (this.entering || !this.ready) return;
        this.trailClock += dt;
        if (this.trailClock >= 0.35) {
            this.trailClock -= 0.35;
            const pool = c.addLava(core.x, core.y, this.phase ? 44 : 34, 3.5);
            pool.warn = 1;
            pool.warnTime = 0.35;
        }
    }

    protected setPhase(phase: number): void {
        this.ready = false;
        this.gliding = false;
        this.submerged = false;
        this.core.data.submerged = 0;
        this.core.alpha = 1;
        super.setPhase(phase);
    }

    onPhase(phase: number): void {
        if (this.core.dead) return;
        this.c.scrollSpeed = 20;
        // 首次调用来自 enter() 的 next() 内部，保留当前任务供基类正常移除。
        if (phase > 0) this.stop('move');
        this.ready = true;
        this.submerged = false;
        this.core.data.submerged = 0;
        this.core.alpha = 1;
        this.core.damageScale = 1;
        this.trailClock = 0;
        this.resumeGlide();
        this.start(this.glide(), 'move');
        this.start(this.cycle(), 'attack');
    }

    private resumeGlide(): void {
        this.gliding = true;
        const ampX = Math.min(280, (this.c.bounds.right - this.c.bounds.left) / 2 - this.core.radius - 24);
        const x = Math.sin(this.theta) * ampX;
        const y = ch(this.c, 0.675) + Math.sin(2 * this.theta) * (this.c.bounds.top - this.c.bounds.bottom) * 0.175;
        this.rejoin = Math.hypot(this.core.x - x, this.core.y - y) > 1 ? { x: this.core.x, y: this.core.y } : undefined;
        this.rejoinTime = 0;
    }

    /** 按八字曲线的导数校正参数速度，避免中心冲刺、翼端停顿。 */
    private *glide(): Generator<number> {
        const c = this.c, core = this.core;
        const ampX = Math.min(280, (c.bounds.right - c.bounds.left) / 2 - core.radius - 24);
        const ampY = (c.bounds.top - c.bounds.bottom) * 0.175;
        while (!core.dead) {
            if (this.gliding && this.ready) {
                const px = core.x, py = core.y;
                const dx = ampX * Math.cos(this.theta), dy = 2 * ampY * Math.cos(2 * this.theta);
                this.theta += (this.phase ? 230 : 180) * this.dt / Math.max(1, Math.hypot(dx, dy));
                const x = Math.sin(this.theta) * ampX, y = ch(c, 0.675) + Math.sin(2 * this.theta) * ampY;
                if (this.rejoin) {
                    this.rejoinTime += this.dt;
                    const u = Math.min(1, this.rejoinTime / 0.9), k = u * u * (3 - 2 * u);
                    core.x = this.rejoin.x + (x - this.rejoin.x) * k;
                    core.y = this.rejoin.y + (y - this.rejoin.y) * k;
                    if (u >= 1) this.rejoin = undefined;
                } else { core.x = x; core.y = y; }
                if (Math.hypot(core.x - px, core.y - py) > 0.0001) {
                    core.angle = Math.atan2(core.y - py, core.x - px) + Math.PI / 2;
                }
            }
            yield 0;
        }
    }

    private *cycle(): Generator<number> {
        yield this.phase ? 0.65 : 0.9;
        while (!this.core.dead) {
            yield* this.wingSweep();
            yield this.phase ? 0.35 : 0.65;
            if (this.phase) {
                warn(this.c, this.core, 0.45, 'ray-tail-whip');
                yield 0.45;
                const heading = this.core.angle + DOWN;
                const x = this.core.x - Math.cos(heading) * 60, y = this.core.y - Math.sin(heading) * 60;
                stream(this.c, x, y, aimAngle(this.c, x, y), 5, 190, 290, this.style(STYLE.needle));
                this.c.emit({ type: 'boss-attack', x, y, kind: 'ray-tail-whip' });
                yield 0.45;
            }
            yield* this.dive();
            yield this.phase ? 0.65 : 1;
        }
    }

    private *wingSweep(): Generator<number> {
        warn(this.c, this.core, 0.5, 'ray-wing-sweep');
        yield 0.5;
        let elapsed = 0, next = 0;
        this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'ray-wing-sweep' });
        while (elapsed < 1.2) {
            if (elapsed >= next) {
                const heading = this.core.angle + DOWN;
                for (const side of [-1, 1]) {
                    const a = heading + side * Math.PI / 2;
                    shoot(this.c, this.core.x + Math.cos(a) * 60, this.core.y + Math.sin(a) * 60,
                        a, 200, this.style(STYLE.orange));
                }
                next += 0.18;
            }
            elapsed += this.dt;
            yield 0;
        }
    }

    private *dive(): Generator<number> {
        const core = this.core;
        this.submerged = true;
        core.data.submerged = 1;
        core.alpha = 0.25;
        core.damageScale = 0;
        warn(this.c, core, 1.5, 'ray-dive');
        let elapsed = 0;
        while (elapsed < 1.5) {
            this.c.addHazard({ kind: 'mark', ax: core.x, ay: core.y, bx: core.x, by: core.y,
                width: 64, warn: Math.max(0.001, 1 - elapsed / 1.5) });
            elapsed += this.dt;
            yield 0;
        }
        this.gliding = false;
        const x = this.c.player.x, y = ch(this.c, 0.62);
        warn(this.c, core, 1, 'ray-breach');
        this.c.addHazard({ kind: 'mark', ax: x, ay: y, bx: x, by: y,
            width: 64, life: 1, warn: 1, warnTime: 1 });
        yield* this.moveTo(core, x, y, 1);
        ring(this.c, x, y, 16, 170, DOWN, this.style(STYLE.ember));
        this.c.emit({ type: 'boss-attack', x, y, kind: 'ray-breach' });
        this.submerged = false;
        core.data.submerged = 0;
        core.alpha = 1;
        core.damageScale = 1;
        this.resumeGlide();
    }
}

/** 创建第 4 章前三位 Boss；不是本组的 id 返回 null。 */
export function createCh4BossA(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'magmatoad': return new MagmaToad(c);
        case 'lavaworm': return new LavaWorm(c);
        case 'magmaray': return new MagmaRay(c);
        default: return null;
    }
}
