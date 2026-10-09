import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, EnemyBullet, Hazard, Vec } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, aimed, fan, lob, ring, shoot } from '../../SfPatterns';

/** 第 5 章后半组 Boss 信息；这里只提供内容，清单与工厂由汇总模块另行接入。 */
export const CH5_BOSS_INFO_B: Record<string, BossInfo> = {
    mammoth: { id: 'mammoth', name: '猛犸战车', tier: 'mid', chapter: 5, frame: 'boss/mammoth', intro: '冰墙能挡住双方子弹；先避开象牙冲锋的直线预警，再从墙缝持续攻击，击毁背炮可减少反弹冰片。' },
    frostdragon: { id: 'frostdragon', name: '霜翼冰晶龙', tier: 'big', chapter: 5, frame: 'boss/frostdragon', intro: '吐息会停在半空后碎裂；镜像阶段认准有影子的真身，打掉双翼减少冰环，碎晶雨留有两条通路。' },
    'frostdragon-hidden': { id: 'frostdragon-hidden', name: '暗晶霜翼', tier: 'hidden', chapter: 5, frame: 'boss/frostdragon', intro: '暗晶吐息凝成挡弹冰墙，分身也会吐息；沿墙间通路追击真身，极夜时提前离开三处陨冰落点。' },
};

/** 每次独立构造定义，避免导入敌人实值或修改共享定义造成循环依赖与跨局污染。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number,
    body: 'metal' | 'flesh', ground = false): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body, chapter: 5, contact: false, ground, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

/** 本组危险物有明确所有者；阶段中断与核心死亡都立即移除自己的预警和冰墙。 */
abstract class IceBoss extends BossScript {
    protected phaseStarted = -1;
    private ownedHazards: Hazard[] = [];

    protected hazard(h: Hazard): Hazard {
        this.ownedHazards.push(h);
        return this.c.addHazard(h);
    }

    protected removeHazard(h: Hazard): void {
        h.life = 0.01;
        // 单设 life 要等下一步才移除，期间仍会挡掉在墙中心生成的碎片。
        this.c.hazards = this.c.hazards.filter(other => other !== h);
        this.ownedHazards = this.ownedHazards.filter(other => other !== h);
    }

    private clearHazards(): void {
        for (const h of this.ownedHazards) h.life = 0.01;
        this.c.hazards = this.c.hazards.filter(h => this.ownedHazards.indexOf(h) < 0);
        this.ownedHazards = [];
    }

    protected resetAttackState(): void { }
    protected clearDecorations(): void { }

    update(c: SfCombat, dt: number): void {
        if (this.core.dead) {
            this.stop('attack'); this.stop('move');
            this.clearHazards(); this.resetAttackState(); this.clearDecorations();
            return;
        }
        this.ownedHazards = this.ownedHazards.filter(h => c.hazards.indexOf(h) >= 0);
        super.update(c, dt);
    }

    protected setPhase(phase: number): void {
        this.stop('move');
        this.clearHazards(); this.resetAttackState(); this.clearDecorations();
        this.core.windup = 0;
        this.phaseStarted = -1;
        super.setPhase(phase);
    }

    protected onBodyKilled(): void {
        this.stop('attack'); this.stop('move');
        this.clearHazards(); this.resetAttackState(); this.clearDecorations();
    }

    /** 玩家 flight.top 在胶囊安全线下又留了 200 像素 HUD 空间；Boss 可用其上方的安全高度。 */
    protected fitScale(home: number, low: number, halfWidth: number, halfHeight: number, maxX = 0): number {
        const top = Math.min(this.c.bounds.top - 12, this.c.flight.top + 200);
        const side = Math.min(-this.c.bounds.left, this.c.bounds.right) - maxX - 12;
        return Math.max(0.1, Math.min(1, side / halfWidth, (top - home) / halfHeight,
            (low - this.c.flight.bottom) / halfHeight));
    }
}

// ───────────────────────────── 5-2 猛犸战车 ─────────────────────────────

class Mammoth extends IceBoss {
    readonly id = 'mammoth';
    readonly name = '猛犸战车';
    readonly tier: BossTier = 'mid';
    private readonly turret: Enemy;
    private readonly home: number;
    private walls: Hazard[] = [];

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        this.home = ch(c, 0.78);
        const hp = this.hpFor('mid');
        const core = this.spawnBody(def(this.id, this.name, 'boss/mammoth', 'boss', 82, 'metal'),
            0, c.bounds.top + 200, hp);
        core.scale = this.fitScale(this.home, ch(c, 0.25), 90, 150, 260);
        this.turret = this.spawnPart(def('mammoth-turret', '猛犸背炮', 'boss/mammoth-turret', 'part', 24, 'metal'),
            core, 0, 30, hp * 0.15);
        this.turret.partTag = 'mammoth-turret'; this.turret.drop = 'main';
        this.turret.scale = core.scale;
        this.start(this.enter(0, this.home, 2.4), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        this.walls = this.walls.filter(h => (h.life ?? 0) > 0.01 && c.hazards.indexOf(h) >= 0);
    }

    protected resetAttackState(): void { this.walls = []; }

    onPhase(phase: number): void {
        if (this.core.dead || phase !== this.phase || phase === this.phaseStarted) return;
        this.phaseStarted = phase;
        this.c.scrollSpeed = 20;
        // 首阶段由 enter().next() 调用，不能在其返回前删除当前 move 任务。
        if (phase > 0) this.start(this.moveTo(this.core, this.core.x, this.home, 0.6), 'move');
        this.start(this.backCannon(), 'attack');
        this.start(this.raiseWalls(), 'attack');
        this.start(this.charges(), 'attack');
    }

    private *backCannon(): Generator<number> {
        yield 0.7;
        while (!this.core.dead) {
            const next = this.time + (this.phase >= 2 ? 1.5 : 2.2);
            const source = this.turret.dead ? this.core : this.turret;
            warn(this.c, source, 0.35, this.turret.dead ? 'mammoth-fan' : 'mammoth-ricochet');
            if (source !== this.core) warn(this.c, this.core, 0.35, 'mammoth-cannon');
            yield 0.35;
            if (!this.turret.dead) {
                // 父子坐标由核心在 Boss 更新之后同步，这里直接按本体的新位置取炮口。
                aimed(this.c, this.core.x, this.core.y + 30 * this.core.scale, 3, 40, 210,
                    { ...STYLE.shard, bounces: 1 });
            } else {
                fan(this.c, this.core.x, this.core.y - 100 * this.core.scale, DOWN, 5, 72, 210, STYLE.orange);
            }
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y,
                kind: this.turret.dead ? 'mammoth-fan' : 'mammoth-ricochet' });
            while (this.time < next) yield 0;
        }
    }

    private *raiseWalls(): Generator<number> {
        yield 0.8;
        while (!this.core.dead) {
            const next = this.time + (this.phase >= 2 ? 5 : 8);
            const y = ch(this.c, 0.45);
            for (const x of [-150, 150]) {
                this.c.emit({ type: 'telegraph', x, y, kind: 'mammoth-icewall' });
                this.walls.push(this.hazard({ kind: 'icewall', ax: x - 100, ay: y, bx: x + 100, by: y,
                    width: 10, warn: 1, warnTime: 0.6, life: 7 }));
            }
            while (this.time < next) yield 0;
        }
    }

    private crossesLane(h: Hazard, x: number, top: number): boolean {
        return Math.max(h.ax, h.bx) + h.width >= x - 60 && Math.min(h.ax, h.bx) - h.width <= x + 60 &&
            Math.max(h.ay, h.by) >= this.c.bounds.bottom && Math.min(h.ay, h.by) <= top;
    }

    private shatterWalls(x: number, top: number): void {
        const keep: Hazard[] = [];
        for (const h of this.walls) {
            if (this.c.hazards.indexOf(h) < 0 || (h.life ?? 0) <= 0.01) continue;
            if (!this.crossesLane(h, x, top)) { keep.push(h); continue; }
            const wx = (h.ax + h.bx) / 2, wy = (h.ay + h.by) / 2;
            this.removeHazard(h);
            this.c.emit({ type: 'telegraph', x: wx, y: wy, kind: 'mammoth-wall-shatter' });
            ring(this.c, wx, wy, 6, 150, DOWN + Math.PI / 6, { ...STYLE.shard, delay: 0.35 });
            this.c.emit({ type: 'boss-attack', x: wx, y: wy, kind: 'mammoth-wall-shatter' });
        }
        this.walls = keep;
    }

    private *charge(): Generator<number> {
        const core = this.core, x = core.x, sy = core.y, target = ch(this.c, 0.25);
        warn(this.c, core, 1, 'mammoth-tusk-charge');
        for (const h of this.walls) if (this.crossesLane(h, x, sy)) {
            this.c.emit({ type: 'telegraph', x: (h.ax + h.bx) / 2, y: h.ay, kind: 'mammoth-wall-shatter' });
        }
        const lane: Hazard = { kind: 'laser', ax: x, ay: sy, bx: x, by: this.c.bounds.bottom, width: 70, warn: 1 };
        const windup = this.time;
        while (this.time - windup < 1) {
            lane.warn = Math.max(0.001, 1 - (this.time - windup));
            this.hazard(lane);
            yield 0;
        }
        lane.width = 60; lane.warn = 0;
        this.c.emit({ type: 'boss-attack', x, y: sy, kind: 'mammoth-tusk-charge' });
        this.shatterWalls(x, sy);
        const downTime = Math.max(0, sy - target) / 900;
        // 常见屏幕总计 1.2 秒；极长屏若仅下冲就超过该时长，保留 900 的速度与完整回程。
        const duration = Math.max(1.2, downTime + 0.15), start = this.time;
        while (this.time - start < duration) {
            const elapsed = this.time - start;
            if (elapsed <= downTime) core.y = Math.max(target, sy - 900 * elapsed);
            else {
                const u = Math.min(1, (elapsed - downTime) / (duration - downTime));
                core.y = target + (this.home - target) * u * u * (3 - 2 * u);
            }
            core.x = x;
            this.hazard(lane);
            // 冲锋期间新凝结的墙也必须碎掉，不留隔着实体墙的有效冲锋线。
            this.shatterWalls(x, sy);
            yield 0;
        }
        core.y = this.home;
    }

    private *charges(): Generator<number> {
        yield 1.8;
        while (!this.core.dead) {
            const next = this.time + (this.phase >= 2 ? 5.6 : this.phase === 1 ? 6.6 : 7);
            yield* this.charge();
            if (this.phase >= 1) {
                const x = Math.max(-260, Math.min(260, this.c.player.x));
                yield* this.moveTo(this.core, x, this.home, 0.35);
                // 横移后重新锁定第二条车道，再完整预警一秒，不在冲锋中追踪玩家。
                yield* this.charge();
            }
            while (this.time < next) yield 0;
        }
    }
}

// ───────────────────────────── 5-5 霜翼冰晶龙（含隐藏版） ─────────────────────────────

interface FrozenShard { bullet: EnemyBullet; side: number }
interface CloneWing { enemy: Enemy; index: number }
interface RainShard { x: number; angle: number }

class FrostDragon extends IceBoss {
    readonly id: string;
    readonly name: string;
    readonly tier: BossTier;
    private readonly wings: Enemy[];
    private readonly home: number;
    private clones: Enemy[] = [];
    private cloneWings: CloneWing[] = [];
    private frozen: FrozenShard[] = [];

    constructor(c: SfCombat, private readonly hidden = false) {
        super(c);
        this.id = hidden ? 'frostdragon-hidden' : 'frostdragon';
        this.name = hidden ? '暗晶霜翼' : '霜翼冰晶龙';
        this.tier = hidden ? 'hidden' : 'big';
        if (hidden) this.tint = '#7A5CFF';
        if (hidden) this.thresholds.push(0.75, 0.5, 0.25);
        else this.thresholds.push(0.66, 0.33);
        this.home = ch(c, 0.74);
        const core = this.spawnBody(def(this.id, this.name, 'boss/frostdragon', 'boss', 80, 'flesh'),
            // 分身阶段与冰息碎裂的输出窗口较短：血量按 0.85 倍折算。
            0, c.bounds.top + 210, this.hpFor(this.tier) * 0.85);
        core.scale = this.fitScale(this.home, this.home, 254, 154);
        const hp = this.hpFor('big') * 0.12;
        this.wings = [
            this.spawnPart(def('dragon-wing-left', '霜龙左翼', 'boss/frostdragon-wing', 'part', 34, 'flesh'), core, -128, 14, hp),
            this.spawnPart(def('dragon-wing-right', '霜龙右翼', 'boss/frostdragon-wing', 'part', 34, 'flesh'), core, 128, 14, hp),
        ];
        this.wings.forEach((wing, i) => {
            wing.partTag = 'dragon-wing'; wing.drop = i ? 'wing' : 'main';
            // 美术帧只有左翼，右侧只镜像横轴；偏移是翼图中心，不再额外向外移半张图。
            wing.scale = (i ? -1 : 1) * core.scale;
        });
        this.start(this.enter(0, this.home, 2.6), 'move');
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead) return;
        // 从侧槽回中时逐帧放大，不能刚切阶段就在边缘恢复全尺寸而裁掉双翼。
        this.core.scale = this.fitScale(this.home, this.home, 254, 154, this.phase === 1 ? 220 : Math.abs(this.core.x));
        const flap = Math.sin(this.time * 3.4) * 0.055;
        this.wings.forEach((wing, i) => {
            if (wing.dead) return;
            wing.angle = i ? -flap : flap;
            wing.scale = (i ? -1 : 1) * this.core.scale;
        });
        for (const wing of this.cloneWings) {
            if (wing.enemy.dead) continue;
            wing.enemy.angle = wing.index ? -flap : flap;
            wing.enemy.scale = (wing.index ? -1 : 1) * this.core.scale;
        }
        const keep: FrozenShard[] = [];
        for (const frozen of this.frozen) {
            const b = frozen.bullet;
            // 命中、清弹或撞上旧冰墙的弹体不会留下墙；只认核心实际冻结后的坐标。
            if (b.dead || c.ebullets.indexOf(b) < 0) continue;
            if (b.stop !== undefined) { keep.push(frozen); continue; }
            if (b.vx || b.vy || (b.fuse ?? 0) <= 0) continue;
            // 冰墙连静止敌弹也挡：横移 16 像素避免把自己的冻结弹立即吞掉，保留其 fuse 碎裂。
            // 竖直短墙之间留出纵向射击通路，不能把整条吐息弧拼成封死真身的横墙。
            let x = b.x + frozen.side * 16;
            if (x < c.bounds.left + 8 || x > c.bounds.right - 8) x = b.x - frozen.side * 16;
            const y = Math.max(c.flight.bottom + 30, Math.min(c.bounds.top - 30, b.y));
            this.hazard({ kind: 'icewall', ax: x, ay: y - 30, bx: x, by: y + 30, width: 8, life: 4 });
        }
        this.frozen = keep;
    }

    protected resetAttackState(): void { this.frozen = []; }

    protected clearDecorations(): void {
        const clones = this.clones, wings = this.cloneWings;
        this.clones = []; this.cloneWings = [];
        for (const clone of clones) if (!clone.dead) this.c.killEnemy(clone, 'mechanic', false);
        for (const wing of wings) if (!wing.enemy.dead) this.c.killEnemy(wing.enemy, 'mechanic', false);
    }

    onPhase(phase: number): void {
        if (this.core.dead || phase !== this.phase || phase === this.phaseStarted) return;
        this.phaseStarted = phase;
        this.c.scrollSpeed = 20;
        // 镜像时三者统一缩放，真实双翼连同身体完整留在 ±220 槽位的屏幕边界内。
        this.core.scale = this.fitScale(this.home, this.home, 254, 154, phase === 1 ? 220 : Math.abs(this.core.x));
        if (phase > 0) this.start(this.moveTo(this.core, 0, this.home, 0.7), 'move');
        this.start(this.breaths(this.core, 0.7, 4, 0.9), 'attack');
        if (phase === 0) this.start(this.wingRings(), 'attack');
        else if (phase === 1) {
            this.spawnClones();
            this.start(this.mirrorGlide(), 'move');
            this.clones.forEach((clone, i) => {
                this.start(this.cloneFans(clone, i), 'attack');
                if (this.hidden) this.start(this.breaths(clone, 0.35, 6, 2.1 + i * 1.4), 'attack');
            });
        } else {
            this.start(this.shatterRain(), 'attack');
            if (this.hidden && phase === 3) this.start(this.polarNight(), 'attack');
        }
    }

    private mouth(source: Enemy): Vec {
        return { x: source.x, y: source.y - 120 * Math.abs(source.scale) };
    }

    private *breaths(source: Enemy, sweep: number, period: number, delay: number): Generator<number> {
        yield delay;
        while (!source.dead && !this.core.dead) {
            const next = this.time + period;
            yield* this.breath(source, sweep);
            while (this.time < next && !source.dead) yield 0;
        }
    }

    private *breath(source: Enemy, sweep: number): Generator<number> {
        const direction = this.c.rng.sign(), windup = this.time;
        warn(this.c, source, 0.8, 'dragon-ice-breath');
        while (this.time - windup < 0.8 && !source.dead) {
            const mouth = this.mouth(source), length = 260 * this.c.bulletSpeedScale * 0.6;
            for (const a of [DOWN - sweep, DOWN, DOWN + sweep]) {
                this.hazard({ kind: 'laser', ax: mouth.x, ay: mouth.y,
                    bx: mouth.x + Math.cos(a) * length, by: mouth.y + Math.sin(a) * length,
                    width: 8, warn: Math.max(0.001, 1 - (this.time - windup) / 0.8) });
            }
            yield 0;
        }
        if (source.dead) return;
        const start = this.time;
        let shot = 0;
        this.c.emit({ type: 'boss-attack', ...this.mouth(source), kind: 'dragon-ice-breath' });
        while ((this.time - start < 1.4 || shot < 28) && !source.dead) {
            // 用发射序号计算角度，逐帧推进但不把 0.05 秒错误地量化成四帧。
            while (shot < 28 && shot * 0.05 <= this.time - start + 0.000001) {
                const angle = DOWN - direction * sweep + direction * 2 * sweep * shot * 0.05 / 1.4;
                const mouth = this.mouth(source);
                const bullet = shoot(this.c, mouth.x, mouth.y, angle, 260, {
                    ...STYLE.shard, stop: 0.6, fuse: 1.6,
                    burst: { count: 3, speed: 80, kind: 'iceshard', radius: 8 },
                });
                shot++;
                if (this.hidden && shot % 6 === 0) this.frozen.push({ bullet, side: Math.cos(angle) < 0 ? -1 : 1 });
            }
            yield 0;
        }
    }

    private wingtip(wing: Enemy): Vec {
        const side = wing.ox < 0 ? -1 : 1, scale = Math.abs(this.core.scale);
        return { x: Math.max(this.c.bounds.left + 12, Math.min(this.c.bounds.right - 12,
            this.core.x + wing.ox * scale + side * Math.cos(wing.angle) * 110 * scale)),
        y: this.core.y + wing.oy * scale + side * Math.sin(wing.angle) * 110 * scale };
    }

    private *wingRings(): Generator<number> {
        yield 1.7;
        while (!this.core.dead) {
            const next = this.time + 3;
            for (const wing of this.wings) if (!wing.dead) warn(this.c, wing, 0.5, 'dragon-wing-ring');
            yield 0.5;
            for (const wing of this.wings) {
                if (wing.dead) continue;
                const p = this.wingtip(wing);
                ring(this.c, p.x, p.y, 8, 170, DOWN + Math.PI / 8, { ...STYLE.shard, bounces: 1 });
                this.c.emit({ type: 'boss-attack', ...p, kind: 'dragon-wing-ring' });
            }
            while (this.time < next) yield 0;
        }
    }

    private spawnClones(): void {
        for (const x of [-220, 220]) {
            const cloneDef = def('dragon-mirror', '霜龙镜像', 'boss/frostdragon', 'part', 80, 'flesh', true);
            cloneDef.score = cloneDef.energy = cloneDef.coins = 0;
            const clone = this.c.spawnEnemy(cloneDef, x, this.home, null,
                { boss: true, persistent: true, scale: this.core.scale, tint: this.tint });
            clone.wreck = true; clone.damageScale = 0; clone.alpha = 1;
            this.clones.push(clone);
            // 补齐与真身同样的存活翼，不能让双翼有无或透明度提前泄露真身；分身整套没有影子。
            this.wings.forEach((wing, i) => {
                if (wing.dead) return;
                const wingDef = def('dragon-mirror-wing', '镜像龙翼', 'boss/frostdragon-wing', 'part', 34, 'flesh', true);
                wingDef.score = wingDef.energy = wingDef.coins = 0;
                const echo = this.c.spawnEnemy(wingDef, x + wing.ox * clone.scale, this.home + 14 * clone.scale, null,
                    { boss: true, persistent: true, parent: clone, ox: wing.ox, oy: 14,
                        scale: (i ? -1 : 1) * clone.scale, tint: this.tint });
                echo.wreck = true; echo.damageScale = 0;
                this.cloneWings.push({ enemy: echo, index: i });
            });
        }
    }

    private *mirrorGlide(): Generator<number> {
        yield 6;
        while (!this.core.dead && this.phase === 1) {
            const next = this.time + 6, slots = [-220, 0, 220];
            for (let i = slots.length - 1; i > 0; i--) {
                const j = this.c.rng.int(0, i), slot = slots[i];
                slots[i] = slots[j]; slots[j] = slot;
            }
            const flights = [this.core].concat(this.clones).map((e, i) => ({ e, x: e.x, y: e.y, tx: slots[i] }));
            const start = this.time;
            while (this.time - start < 1) {
                const u = Math.min(1, (this.time - start) / 1), k = u * u * (3 - 2 * u);
                for (const flight of flights) {
                    if (flight.e.dead) continue;
                    flight.e.x = flight.x + (flight.tx - flight.x) * k;
                    flight.e.y = flight.y + (this.home - flight.y) * k;
                }
                yield 0;
            }
            for (const flight of flights) if (!flight.e.dead) { flight.e.x = flight.tx; flight.e.y = this.home; }
            while (this.time < next) yield 0;
        }
    }

    private *cloneFans(clone: Enemy, index: number): Generator<number> {
        yield 0.9 + index * 0.4;
        while (!clone.dead && !this.core.dead && this.phase === 1) {
            const next = this.time + 2;
            warn(this.c, clone, 0.35, 'dragon-clone-fan');
            yield 0.35;
            if (clone.dead) return;
            const p = this.mouth(clone);
            aimed(this.c, p.x, p.y, 3, 36, 190, STYLE.shard);
            this.c.emit({ type: 'boss-attack', ...p, kind: 'dragon-clone-fan' });
            while (this.time < next) yield 0;
        }
    }

    /** 随机弹雨分布在三个区间；发射点和到底部的投影都不得侵入两条 70 像素通路。 */
    private rainVolley(): RainShard[] {
        const c = this.c, left = c.bounds.left + 20, right = c.bounds.right - 20, span = right - left;
        // 相邻轮弹雨会同时在场：通路固定，随机的是其余落点，不能让新一轮堵住旧一轮的缺口。
        const a = left + span / 3, b = left + span * 2 / 3;
        // 35 半宽再加上弹体半径与玩家判定半径，实际可穿行宽度不小于 70。
        const regions = [{ min: left, max: a - 50 }, { min: a + 50, max: b - 50 }, { min: b + 50, max: right }];
        const height = c.bounds.top + 20 - c.flight.bottom, shots: RainShard[] = [];
        for (let i = 0; i < 9; i++) {
            const region = regions[i % 3], cell = Math.floor(i / 3);
            const x = region.min + (region.max - region.min) * (cell + c.rng.range(0.2, 0.8)) / 3;
            let angle = DOWN;
            for (let attempt = 0; attempt < 32; attempt++) {
                const candidate = DOWN + c.rng.range(-12, 12) * Math.PI / 180;
                const end = x + Math.cos(candidate) / -Math.sin(candidate) * height;
                if (end >= region.min && end <= region.max) { angle = candidate; break; }
            }
            shots.push({ x, angle });
        }
        return shots;
    }

    private *shatterRain(): Generator<number> {
        yield 1.2;
        while (!this.core.dead) {
            const next = this.time + 1.4, shots = this.rainVolley(), y = this.c.bounds.top + 20;
            warn(this.c, this.core, 0.45, 'dragon-shatter-rain');
            for (const shot of shots) {
                const height = y - this.c.flight.bottom;
                this.hazard({ kind: 'laser', ax: shot.x, ay: y,
                    bx: shot.x + Math.cos(shot.angle) / -Math.sin(shot.angle) * height, by: this.c.flight.bottom,
                    width: 8, warn: 1, warnTime: 0.45, life: 0.45 });
            }
            yield 0.45;
            for (const shot of shots) shoot(this.c, shot.x, y, shot.angle, 180, { ...STYLE.shard, bounces: 1 });
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'dragon-shatter-rain' });
            while (this.time < next) yield 0;
        }
    }

    private *polarNight(): Generator<number> {
        yield 1.9;
        while (!this.core.dead) {
            const next = this.time + 3, targets: Vec[] = [];
            warn(this.c, this.core, 1.2, 'dragon-polar-night');
            for (const slot of [-220, 0, 220]) {
                const x = Math.max(this.c.bounds.left + 80, Math.min(this.c.bounds.right - 80, slot + this.c.rng.range(-16, 16)));
                const y = ch(this.c, this.c.rng.range(0.25, 0.42));
                targets.push({ x, y });
                // 先预告 1.2 秒，再飞行一秒；实心落点圈保留到落地，不在发射时消失。
                this.hazard({ kind: 'mark', ax: x, ay: y, bx: x, by: y,
                    width: 70, warn: 1, warnTime: 1.2, life: 2.25 });
            }
            yield 1.2;
            const mouth = this.mouth(this.core);
            for (const target of targets) lob(this.c, mouth.x, mouth.y, target.x, target.y, 1, 160, {
                ...STYLE.snowball, radius: 28, burst: { count: 10, speed: 110, kind: 'iceshard', radius: 8 },
            });
            this.c.emit({ type: 'boss-attack', ...mouth, kind: 'dragon-polar-night' });
            while (this.time < next) yield 0;
        }
    }

    onPartDestroyed(part: Enemy): void {
        const index = this.wings.indexOf(part);
        if (index < 0) return;
        for (const wing of this.cloneWings) {
            if (wing.index === index && !wing.enemy.dead) this.c.killEnemy(wing.enemy, 'mechanic', false);
        }
        this.cloneWings = this.cloneWings.filter(wing => !wing.enemy.dead);
    }
}

class HiddenFrostDragon extends FrostDragon {
    constructor(c: SfCombat) { super(c, true); }
}

/** 创建第 5 章猛犸战车与霜翼冰晶龙；不属于本文件的 id 返回 null。 */
export function createCh5BossB(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'mammoth': return new Mammoth(c);
        case 'frostdragon': return new FrostDragon(c);
        case 'frostdragon-hidden': return new HiddenFrostDragon(c);
        default: return null;
    }
}
