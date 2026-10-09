import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, Hazard } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { PLAYER_RULES } from '../../SfBalance';
import { GroundMotion } from '../../SfMotion';
import { DOWN, STYLE, aimAngle, aimed, fan, lob, ring, segmentDistance, shoot } from '../../SfPatterns';

/** 第 4 章后半段 Boss 信息（图鉴、警报横幅）；由汇总模块另行接入。 */
export const CH4_BOSS_INFO_B: Record<string, BossInfo> = {
    infernodrill: { id: 'infernodrill', name: '炼狱钻探机', tier: 'mid', chapter: 4, frame: 'boss/infernodrill', intro: '钻头蓄力后抛出熔岩，沿落点间隙穿行并击毁钻臂，可削弱侧翼喷射。' },
    oniblade: { id: 'oniblade', name: '炎刃武神·赤鬼', tier: 'big', chapter: 4, frame: 'boss/oniblade', intro: '避开居合裂缝与闪斩预警，优先击毁双刀以减少裂缝并解除火柱。' },
    'oniblade-hidden': { id: 'oniblade-hidden', name: '黑炎武神', tier: 'hidden', chapter: 4, frame: 'boss/oniblade', intro: '留在交叉裂缝之间的安全格内，避开裂缝消散的碎石与残影轮流施放的居合。' },
};

/** 直接构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number, ground = false): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body: 'metal', chapter: 4, contact: false, ground, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

interface CutLine { ax: number; ay: number; bx: number; by: number; angle: number }
interface Fissure { hazard: Hazard; angle: number; warned: boolean }

/** 裂缝没有方向，反向的两条线也必须作为同一个夹角比较。 */
function lineAngleDistance(a: number, b: number): number {
    return Math.abs(Math.atan2(Math.sin((a - b) * 2), Math.cos((a - b) * 2))) / 2;
}

function cutAt(x: number, y: number, angle: number): CutLine {
    const dx = Math.cos(angle) * 800, dy = Math.sin(angle) * 800;
    return { ax: x - dx, ay: y - dy, bx: x + dx, by: y + dy, angle };
}

/** 弹幕取可见线段上的点，避免把四个发射口落在屏外、被核心立即清掉。 */
function visibleLine(c: SfCombat, line: CutLine): CutLine | null {
    const dx = line.bx - line.ax, dy = line.by - line.ay;
    let lo = 0, hi = 1;
    const axes = [
        { origin: line.ax, delta: dx, min: c.bounds.left + 20, max: c.bounds.right - 20 },
        { origin: line.ay, delta: dy, min: c.bounds.bottom + 20, max: c.bounds.top - 20 },
    ];
    for (const axis of axes) {
        if (Math.abs(axis.delta) < 0.0001) {
            if (axis.origin < axis.min || axis.origin > axis.max) return null;
        } else {
            const a = (axis.min - axis.origin) / axis.delta, b = (axis.max - axis.origin) / axis.delta;
            lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
            if (lo > hi) return null;
        }
    }
    return { ax: line.ax + dx * lo, ay: line.ay + dy * lo,
        bx: line.ax + dx * hi, by: line.ay + dy * hi, angle: line.angle };
}

// ───────────────────────────── 4-4 炼狱钻探机 ─────────────────────────────

class InfernoDrill extends BossScript {
    readonly id = 'infernodrill';
    readonly name = '炼狱钻探机';
    readonly tier: BossTier = 'mid';
    private readonly arms: Enemy[];
    private readonly home: number;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        const hp = this.hpFor('mid');
        const core = this.spawnBody(def(this.id, this.name, 'boss/infernodrill', 'boss', 80), 0, c.bounds.top + 240, hp);
        const armDef = def('drill-arm', '钻探机钻臂', 'boss/drill-arm', 'part', 26);
        this.arms = [this.spawnPart(armDef, core, -112, -10, hp * 0.12), this.spawnPart(armDef, core, 112, -10, hp * 0.12)];
        this.arms.forEach((arm, i) => { arm.partTag = 'drill-arm'; arm.drop = i ? 'wing' : 'main'; });
        this.arms[1].scale = -1;
        this.home = ch(c, 0.74);
        this.start(this.enter(0, this.home, 2.5), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        for (const arm of this.arms) if (!arm.dead) arm.angle = Math.sin(this.time * 2.8 + (arm.ox < 0 ? 0 : Math.PI)) * 0.07;
    }

    onPhase(phase: number): void {
        // 基类延迟解除阶段护盾；连续跨阈值时旧阶段的回调不能重新启动攻击。
        if (phase !== this.phase || this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.stop('move');
        // 横移直接由攻击任务驱动，不能与持续 sway 同时改写本体的位置。
        if (phase !== 1) this.start(this.drillSway(phase), 'move');
        this.start(this.drillStrikes(), 'attack');
        if (phase === 2) this.start(this.rockRings(), 'attack');
    }

    private *drillSway(phase: number): Generator<number> {
        // 追踪横移可能停在屏幕边缘，过热前平滑回中，保证摆动时钻臂也留在场内。
        yield* this.moveTo(this.core, 0, this.home, 0.7);
        yield* this.sway(this.core, phase === 2 ? 40 : 65, 0.3, this.home, 6);
    }

    private throwLava(x: number, y: number, tx: number, ty: number): void {
        // 横移后侧翼落点可能越过场地，按熔岩半径收回边界；同一侧重叠的落点不会挤掉中路。
        tx = Math.max(this.c.bounds.left + 42, Math.min(this.c.bounds.right - 42, tx));
        this.c.addHazard({ kind: 'mark', ax: tx, ay: ty, bx: tx, by: ty, width: 42, warn: 1, warnTime: 1, life: 1 });
        lob(this.c, x, y, tx, ty, 1, 140, this.style({ ...STYLE.ember, pool: { radius: 42, life: 3.5 } }));
    }

    private *drillStrikes(): Generator<number> {
        yield 0.8;
        let strike = 0;
        while (!this.core.dead) {
            const next = this.time + (this.phase === 2 ? 2.2 : this.phase === 1 ? 4.2 : 3.6);
            if (this.phase === 1) {
                const x = Math.max(this.c.bounds.left + 150, Math.min(this.c.bounds.right - 150, this.c.player.x));
                yield* this.moveTo(this.core, x, this.home, 1.2);
            }
            warn(this.c, this.core, 1, 'drill');
            yield 1;
            const x = this.core.x, y = this.core.y - 120;
            this.c.emit({ type: 'boss-attack', x, y, kind: 'drill-slam' });
            // 落点排成以钻头为圆心的扇面（相邻落点间距约 105 像素），熔岩滩之间留出能穿过的缝。
            for (const a of [-0.4, 0, 0.4]) this.throwLava(x, y, x + Math.sin(a) * 260, y - Math.cos(a) * 260);
            for (const arm of this.arms) {
                if (arm.dead) continue;
                const side = arm.ox < 0 ? -1 : 1;
                for (const a of [0.85, 1.28]) this.throwLava(arm.x, arm.y - 120, x + side * Math.sin(a) * 250, y - Math.cos(a) * 250);
            }
            if (this.phase === 1 && ++strike % 2 === 0) {
                let count = this.c.enemies.filter(e => !e.dead && e.def.id === 'geyser').length;
                for (const side of [-1, 1]) {
                    if (count >= 4) break;
                    const gx = side * 180, gy = ch(this.c, 0.5);
                    this.c.emit({ type: 'telegraph', x: gx, y: gy, kind: 'geyser' });
                    // 实际间歇泉行为只负责喷发；随地面卷动必须显式提供 GroundMotion。
                    this.c.spawnEnemy('geyser', gx, gy, new GroundMotion());
                    count++;
                }
            }
            for (const arm of this.arms) if (!arm.dead) warn(this.c, arm, 0.3, 'drill-arm');
            yield 0.3;
            for (let burst = 0; burst < 2; burst++) {
                for (const arm of this.arms) if (!arm.dead) aimed(this.c, arm.x, arm.y - 35, 1, 0, 210, this.style(STYLE.small));
                if (burst === 0) yield 0.18;
            }
            while (this.time < next) yield 0;
        }
    }

    private *rockRings(): Generator<number> {
        yield 0.6;
        while (!this.core.dead) {
            const next = this.time + 1.6;
            warn(this.c, this.core, 0.5, 'drill-overheat');
            yield 0.5;
            const offset = aimAngle(this.c, this.core.x, this.core.y) - Math.PI / 12;
            // ring 原语没有跳号参数：在十二个槽位中空出两个相对的双弹缺口。
            for (let i = 0; i < 12; i++) {
                if (i === 0 || i === 1 || i === 6 || i === 7) continue;
                shoot(this.c, this.core.x, this.core.y, offset + i * Math.PI / 6, 170, this.style(STYLE.rock));
            }
            while (this.time < next) yield 0;
        }
    }
}

// ───────────────────────────── 4-5 炎刃武神（含隐藏版） ─────────────────────────────

class OniBlade extends BossScript {
    readonly id: string;
    readonly name: string;
    readonly tier: BossTier;
    private readonly katanas: Enemy[];
    private readonly home: number;
    private planted = false;
    private halo?: Enemy;
    private clones: Enemy[] = [];
    private fissures: Fissure[] = [];

    constructor(c: SfCombat, private readonly hidden = false) {
        super(c);
        this.id = hidden ? 'oniblade-hidden' : 'oniblade';
        this.name = hidden ? '黑炎武神' : '炎刃武神·赤鬼';
        this.tier = hidden ? 'hidden' : 'big';
        if (hidden) this.tint = '#9A7CFF';
        if (hidden) this.thresholds.push(0.75, 0.5, 0.25);
        else this.thresholds.push(0.66, 0.33);
        const core = this.spawnBody(def(this.id, this.name, 'boss/oniblade', 'boss', 95), 0, c.bounds.top + 280, this.hpFor(this.tier) * 0.85);
        const katanaDef = def('katana', '赤鬼炎刃', 'boss/katana', 'part', 22);
        const hp = this.hpFor('big') * 0.1;
        this.katanas = [this.spawnPart(katanaDef, core, -150, 10, hp), this.spawnPart(katanaDef, core, 150, 10, hp)];
        this.katanas.forEach((blade, i) => { blade.partTag = 'katana'; blade.drop = i ? 'wing' : 'main'; blade.angle = i ? 0.12 : -0.12; });
        this.home = ch(c, 0.76);
        this.start(this.enter(0, this.home, 2.8), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead) return;
        if (this.halo && !this.halo.dead) {
            this.halo.angle += dt * 2;
            this.halo.scale = 1 + Math.sin(this.time * 3.2) * 0.04;
        }
        this.clones.forEach((clone, i) => {
            if (clone.dead) return;
            // 固定在左右 ±230；父节点只用于自动清理和跟随本体的纵向晃动。
            clone.ox = (i ? 230 : -230) - this.core.x;
        });
        if (!this.hidden) return;
        const keep: Fissure[] = [];
        for (const fissure of this.fissures) {
            const h = fissure.hazard;
            if ((h.life ?? 0) > 0 && c.hazards.indexOf(h) >= 0) {
                if (!fissure.warned && (h.life ?? 0) <= 0.6) {
                    fissure.warned = true;
                    c.emit({ type: 'telegraph', x: (h.ax + h.bx) / 2, y: (h.ay + h.by) / 2, kind: 'fissure-break' });
                }
                keep.push(fissure);
            } else if ((h.life ?? 0) <= 0 && c.phase === 'boss') {
                // life 由战斗核心先递减；被外部清场移除、尚未到期的裂缝不补发碎石。
                const line = visibleLine(c, { ...h, angle: fissure.angle });
                if (!line) continue;
                for (let i = 0; i < 6; i++) {
                    const k = (i + 0.5) / 6;
                    shoot(c, line.ax + (line.bx - line.ax) * k, line.ay + (line.by - line.ay) * k,
                        fissure.angle + (i % 2 ? -1 : 1) * Math.PI / 2, 140, this.style({ ...STYLE.rock, delay: 0.35 }));
                }
            }
        }
        this.fissures = keep;
    }

    private attachBlades(): void {
        this.planted = false;
        this.katanas.forEach((blade, i) => {
            if (blade.dead) return;
            blade.parent = this.core; blade.ox = i ? 150 : -150; blade.oy = 10;
            blade.x = this.core.x + blade.ox; blade.y = this.core.y + blade.oy;
            blade.vx = blade.vy = 0; blade.angle = i ? 0.12 : -0.12;
        });
    }

    protected setPhase(phase: number): void {
        // 基类会停止所有攻击生成器；先恢复脱离父节点的活刀，避免中断飞行留下悬空部件。
        this.attachBlades();
        super.setPhase(phase);
    }

    onPhase(phase: number): void {
        if (phase !== this.phase || this.core.dead) return;
        this.c.scrollSpeed = 20;
        this.attachBlades();
        this.stop('move');
        this.start(this.sway(this.core, phase >= 2 ? 28 : 45, 0.25, this.home, 5), 'move');
        if (phase === 0) this.start(this.iaiCycle(), 'attack');
        else if (phase === 1) this.start(this.thrownBlades(), 'attack');
        else {
            this.core.frame = 'boss/oniblade-released';
            if (!this.halo) {
                const haloDef = def('oniblade-halo', '燃烧炎轮', 'boss/halo', 'part', 1);
                haloDef.score = haloDef.energy = haloDef.coins = 0;
                this.halo = this.c.spawnEnemy(haloDef, this.core.x, this.core.y + 20, null,
                    { boss: true, persistent: true, parent: this.core, ox: 0, oy: 20, tint: this.tint });
                this.halo.wreck = true; this.halo.damageScale = 0;
            }
            this.start(this.releaseCuts(), 'attack');
            if (phase === 3 && this.hidden) {
                if (!this.clones.length) {
                    const cloneDef = def('oniblade-afterimage', '黑炎残影', 'boss/oniblade-released', 'part', 95);
                    cloneDef.score = cloneDef.energy = cloneDef.coins = 0;
                    for (const x of [-230, 230]) {
                        const clone = this.c.spawnEnemy(cloneDef, x, this.core.y, null,
                            { boss: true, persistent: true, parent: this.core, ox: x - this.core.x, oy: 0, tint: this.tint });
                        clone.alpha = 0.4; clone.wreck = true; clone.damageScale = 0;
                        this.clones.push(clone);
                    }
                }
                this.start(this.afterimageCuts(), 'attack');
            }
        }
    }

    /** 同一轮裂缝至少相隔 0.35 弧度，并在创建时给玩家留出 70 像素的安全格。 */
    private makeCuts(count: number, paired: boolean): CutLine[] {
        const c = this.c, px = c.player.x, py = c.player.y;
        const lines: CutLine[] = [];
        if (paired) {
            const base = c.rng.range(0, Math.PI);
            for (let i = 0; i < count; i++) {
                // 相邻 X 的基角相差 0.4；最多三个 X 的六条无向直线仍全部满足夹角约束。
                const angle = base + i * 0.4;
                let pair: CutLine[] = [];
                for (let attempt = 0; attempt < 48; attempt++) {
                    const direction = c.rng.range(0, Math.PI * 2), distance = c.rng.range(90, 140);
                    const x = px + Math.cos(direction) * distance, y = py + Math.sin(direction) * distance;
                    pair = [cutAt(x, y, angle - 0.6), cutAt(x, y, angle + 0.6)];
                    if (pair.every(line => segmentDistance(px, py, line.ax, line.ay, line.bx, line.by) >= 70)) break;
                    pair = [];
                }
                if (!pair.length) {
                    const direction = angle + Math.PI / 2, distance = c.rng.range(110, 140);
                    const x = px + Math.cos(direction) * distance, y = py + Math.sin(direction) * distance;
                    pair = [cutAt(x, y, angle - 0.6), cutAt(x, y, angle + 0.6)];
                }
                for (const line of pair) lines.push(line);
            }
            return lines;
        }
        for (let i = 0; i < count; i++) {
            let chosen: CutLine | undefined;
            for (let attempt = 0; attempt < 64; attempt++) {
                const angle = c.rng.range(0, Math.PI);
                if (lines.some(line => lineAngleDistance(angle, line.angle) < 0.35)) continue;
                const direction = c.rng.range(0, Math.PI * 2), distance = c.rng.range(80, 140);
                const line = cutAt(px + Math.cos(direction) * distance, py + Math.sin(direction) * distance, angle);
                if (segmentDistance(px, py, line.ax, line.ay, line.bx, line.by) >= 70) { chosen = line; break; }
            }
            if (!chosen) {
                // 有界采样耗尽后从角度网格选合法方向，垂直偏移保证距离，不降低安全标准。
                const base = c.rng.range(0, Math.PI);
                for (let j = 0; j < 32; j++) {
                    const angle = base + j * Math.PI / 32;
                    if (lines.some(line => lineAngleDistance(angle, line.angle) < 0.35)) continue;
                    chosen = cutAt(px - Math.sin(angle) * 120, py + Math.cos(angle) * 120, angle);
                    break;
                }
            }
            if (chosen) lines.push(chosen);
        }
        return lines;
    }

    private *iai(count = 0, source = this.core, paired = this.hidden): Generator<number> {
        warn(this.c, source, 0.9, 'iai');
        yield 0.9;
        if (source.dead || this.core.dead) return;
        // 每把存活的太刀多斩一刀（双刀 2 条，打掉一把只剩 1 条）。
        const n = count || Math.max(1, this.katanas.filter(blade => !blade.dead).length);
        const lines = this.makeCuts(n, paired);
        for (const line of lines) {
            const h = this.c.addHazard({ kind: 'fissure', ax: line.ax, ay: line.ay, bx: line.bx, by: line.by,
                width: 10, warn: 1, warnTime: 0.8, life: 0.8 + 3.2 });
            if (this.hidden) this.fissures.push({ hazard: h, angle: line.angle, warned: false });
        }
        yield 0.8;
        if (source.dead || this.core.dead) return;
        this.c.emit({ type: 'boss-attack', x: source.x, y: source.y, kind: 'iai-slash' });
        for (const cut of lines) {
            const line = visibleLine(this.c, cut);
            if (!line) continue;
            for (let i = 0; i < 4; i++) {
                const k = (i + 1) / 5, x = line.ax + (line.bx - line.ax) * k, y = line.ay + (line.by - line.ay) * k;
                for (const side of [-1, 1]) shoot(this.c, x, y, line.angle + side * Math.PI / 2, 120, this.style(STYLE.orange));
            }
        }
    }

    private *aimedFan(): Generator<number> {
        warn(this.c, this.core, 0.3, 'oni-aim');
        yield 0.3;
        aimed(this.c, this.core.x, this.core.y - 80, 5, 56, 220, this.style(STYLE.orange));
    }

    private *iaiCycle(): Generator<number> {
        yield 0.8;
        while (!this.core.dead) {
            const next = this.time + 3.2;
            yield* this.iai();
            yield* this.aimedFan();
            while (this.time < next) yield 0;
        }
    }

    private *pillar(blade: Enemy): Generator<number> {
        while (this.planted && !blade.dead && !this.core.dead && this.phase === 1) {
            const next = this.time + 1.2;
            warn(this.c, blade, 0.35, 'katana-pillar');
            yield 0.35;
            if (!this.planted || blade.dead) return;
            fan(this.c, blade.x, blade.y - 45, DOWN, 6, 110, 180, this.style(STYLE.ember));
            while (this.time < next) yield 0;
        }
    }

    private *thrownBlades(): Generator<number> {
        yield 0.8;
        while (!this.core.dead) {
            const blades = this.katanas.filter(blade => !blade.dead);
            if (!blades.length) {
                const next = this.time + 2.6;
                yield* this.iai(2);
                yield* this.aimedFan();
                while (this.time < next) yield 0;
                continue;
            }
            for (const blade of blades) {
                warn(this.c, blade, 0.6, 'blade-throw');
                const x = blade.ox < 0 ? -200 : 200, y = ch(this.c, 0.45);
                this.c.addHazard({ kind: 'mark', ax: x, ay: y, bx: x, by: y, width: 28, warn: 1, warnTime: 1.2, life: 1.2 });
            }
            yield 0.6;
            const flights = blades.filter(blade => !blade.dead).map(blade => {
                blade.parent = undefined; blade.angle = 0;
                return { blade, x: blade.x, y: blade.y, tx: blade.ox < 0 ? -200 : 200, ty: ch(this.c, 0.45) };
            });
            let t = 0;
            while (t < 0.6) {
                t += this.dt;
                const u = Math.min(1, t / 0.6), k = u * u * (3 - 2 * u);
                for (const flight of flights) {
                    if (flight.blade.dead) continue;
                    flight.blade.x = flight.x + (flight.tx - flight.x) * k;
                    flight.blade.y = flight.y + (flight.ty - flight.y) * k;
                }
                yield 0;
            }
            this.planted = true;
            const recallAt = this.time + 5;
            for (const blade of blades) if (!blade.dead) this.start(this.pillar(blade), 'attack');
            yield 0.8;
            yield* this.iai(1);
            while (this.time < recallAt - 0.5 && blades.some(blade => !blade.dead)) yield 0;
            for (const blade of blades) if (!blade.dead) warn(this.c, blade, 0.5, 'blade-recall');
            while (this.time < recallAt && blades.some(blade => !blade.dead)) yield 0;
            this.planted = false;
            yield* this.recallBlades(blades);
            yield 0.8;
        }
    }

    private *recallBlades(blades: Enemy[]): Generator<number> {
        const flights = blades.filter(blade => !blade.dead).map(blade => ({ blade, x: blade.x, y: blade.y,
            cx: blade.ox < 0 ? this.c.bounds.right - 45 : this.c.bounds.left + 45, cy: ch(this.c, 0.64) }));
        if (!flights.length) return;
        let t = 0, shot = 0;
        while (t < 1.2) {
            t += this.dt; shot += this.dt;
            const k = Math.min(1, t / 1.2), u = 1 - k;
            for (const flight of flights) {
                const blade = flight.blade;
                if (blade.dead) continue;
                const tx = this.core.x + blade.ox, ty = this.core.y + 10;
                blade.x = u * u * flight.x + 2 * u * k * flight.cx + k * k * tx;
                blade.y = u * u * flight.y + 2 * u * k * flight.cy + k * k * ty;
                blade.angle = Math.atan2(2 * u * (flight.cy - flight.y) + 2 * k * (ty - flight.cy),
                    2 * u * (flight.cx - flight.x) + 2 * k * (tx - flight.cx)) - DOWN;
            }
            // 0.08 不是二进制精确数；容差只处理舍入尾差，不改变发射间隔。
            while (shot + 0.000001 >= 0.08) {
                shot -= 0.08;
                for (const flight of flights) {
                    const blade = flight.blade;
                    if (!blade.dead) shoot(this.c, blade.x, blade.y, aimAngle(this.c, blade.x, blade.y) + this.c.rng.range(-0.12, 0.12),
                        150, this.style({ ...STYLE.orange, delay: 0.25 }));
                }
            }
            yield 0;
        }
        this.attachBlades();
    }

    /** 激光不能把玩家当前所在的裂缝格整个封住；附近的候选落脚点必须留在同一格。 */
    private hasEscape(line: CutLine): boolean {
        const c = this.c, px = c.player.x, py = c.player.y;
        const points = [{ x: px, y: py }];
        for (const radius of [65, 110, 150]) {
            for (let i = 0; i < 16; i++) points.push({ x: px + Math.cos(i * Math.PI / 8) * radius, y: py + Math.sin(i * Math.PI / 8) * radius });
        }
        return points.some(point => {
            if (point.x < c.flight.left || point.x > c.flight.right || point.y < c.flight.bottom || point.y > c.flight.top) return false;
            if (segmentDistance(point.x, point.y, line.ax, line.ay, line.bx, line.by) < 30 + PLAYER_RULES.hitRadius + 20) return false;
            for (const h of c.hazards) {
                if (h.kind !== 'fissure') continue;
                if (segmentDistance(point.x, point.y, h.ax, h.ay, h.bx, h.by) < h.width + PLAYER_RULES.hitRadius + 10) return false;
                const dx = h.bx - h.ax, dy = h.by - h.ay;
                const from = dx * (py - h.ay) - dy * (px - h.ax), to = dx * (point.y - h.ay) - dy * (point.x - h.ax);
                if (from * to < 0) return false;
            }
            return true;
        });
    }

    private *flashCut(): Generator<number> {
        const c = this.c, px = c.player.x, py = c.player.y;
        let line: CutLine = { ax: c.bounds.left, ay: py + 120, bx: c.bounds.right, by: py + 120, angle: 0 };
        for (let attempt = 0; attempt < 32; attempt++) {
            const angle = c.rng.pick([0, -0.3, 0.3]), y = py + c.rng.range(-40, 120);
            const cut = { ax: c.bounds.left, ay: y + (c.bounds.left - px) * Math.tan(angle),
                bx: c.bounds.right, by: y + (c.bounds.right - px) * Math.tan(angle), angle };
            if (this.hasEscape(cut)) { line = cut; break; }
        }
        warn(c, this.core, 0.9, 'flash-cut');
        const band: Hazard = { kind: 'laser', ax: line.ax, ay: line.ay, bx: line.bx, by: line.by, width: 30, warn: 1 };
        const start = this.time;
        while (this.time - start < 0.9) {
            // 单步危险物每帧登记，保持预警时为正数，防止最后一个预警帧提前伤人。
            band.warn = Math.max(0.001, 1 - (this.time - start) / 0.9);
            c.addHazard(band);
            yield 0;
        }
        c.emit({ type: 'boss-attack', x: (line.ax + line.bx) / 2, y: (line.ay + line.by) / 2, kind: 'flash-cut' });
        const end = this.time + 0.25;
        band.warn = 0;
        while (this.time < end) { c.addHazard(band); yield 0; }
        const visible = visibleLine(c, line);
        if (visible) {
            const length = Math.hypot(visible.bx - visible.ax, visible.by - visible.ay);
            // 闪斩紧贴玩家所在高度：延迟爆点每 140 像素一个，爆开后留出足够的缝。
            for (let d = 35; d <= length; d += 140) {
                const k = d / Math.max(1, length);
                ring(c, visible.ax + (visible.bx - visible.ax) * k, visible.ay + (visible.by - visible.ay) * k,
                    4, 150, line.angle + Math.PI / 4, this.style({ ...STYLE.orange, delay: 0.5 }));
            }
        }
    }

    private *releaseCuts(): Generator<number> {
        yield 0.8;
        while (!this.core.dead) {
            // 每 3.5 秒一轮：闪斩 → 延迟爆破 → 一次居合；两次居合的间隔同样约为 3.5 秒。
            const next = this.time + 3.5;
            yield* this.flashCut();
            while (this.time < next - 1.7) yield 0;
            yield* this.iai(1);
            while (this.time < next) yield 0;
        }
    }

    private *afterimageCuts(): Generator<number> {
        yield 2.1;
        let turn = 0;
        while (!this.core.dead) {
            const clone = this.clones[turn++ % this.clones.length];
            const next = this.time + 3.5;
            // 百鬼夜行明确为单线残影斩；只有本体的隐藏版居合扩展为 X 对。
            if (clone && !clone.dead) yield* this.iai(1, clone, false);
            while (this.time < next) yield 0;
        }
    }

    protected onBodyKilled(): void {
        this.planted = false;
        this.fissures = [];
        if (this.halo && !this.halo.dead) this.c.killEnemy(this.halo, 'mechanic', false);
        for (const clone of this.clones) if (!clone.dead) this.c.killEnemy(clone, 'mechanic', false);
        this.clones = [];
    }
}

/** 创建第 4 章后半段 Boss；不属于本文件的 id 返回 null。 */
export function createCh4BossB(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'infernodrill': return new InfernoDrill(c);
        case 'oniblade': return new OniBlade(c);
        case 'oniblade-hidden': return new OniBlade(c, true);
        default: return null;
    }
}
