import type { SfCombat } from './SfCombat';
import type { Enemy, EnemyDef } from './SfEnemies';
import { HP_UNITS } from './SfBalance';
import type { BossTier } from './SfTypes';
import type { ShotStyle } from './SfPatterns';

export interface BossInfo {
    id: string;
    name: string;
    tier: BossTier;
    chapter: number;
    intro: string;
    /** 图鉴与警报横幅使用的主图帧。 */
    frame: string;
}

export const TIER_SCORE: Record<BossTier, number> = { small: 8000, mid: 15000, big: 30000, hidden: 50000 };

type Task = { gen: Iterator<number | void>; wait: number; tag: string };

/**
 * Boss 脚本基类：用生成器编排动作（yield 秒数 = 等待，yield 0 = 下一帧）。
 * 每个 Boss 可同时运行多条任务（移动、攻击），阶段切换时只停止攻击任务。
 */
export abstract class BossScript {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly tier: BossTier;
    /** 决定胜负的本体（全部死亡才算击破）。 */
    bodies: Enemy[] = [];
    parts: Enemy[] = [];
    phase = 0;
    entering = true;
    protected time = 0;
    /** 当前帧的模拟步长；生成器里的逐帧插值使用它，慢动作时同样正确。 */
    protected dt = 1 / 60;
    protected readonly thresholds: number[] = [];
    private tasks: Task[] = [];
    private defeated = false;
    protected tint?: string;

    protected constructor(protected readonly c: SfCombat) { }

    get hpRatio(): number {
        const max = this.bodies.reduce((s, e) => s + e.maxHp, 0) || 1;
        return this.bodies.reduce((s, e) => s + Math.max(0, e.hp), 0) / max;
    }

    get core(): Enemy { return this.bodies[0]; }

    /** 血条分层边界（1 → 各阶段阈值 → 0）：每一层对应一个攻击阶段。 */
    get layerBounds(): number[] {
        return [1].concat(this.thresholds.filter(t => t > 0 && t < 1).sort((a, b) => b - a), [0]);
    }

    protected hpFor(tier: BossTier): number {
        return tier === 'small' ? HP_UNITS.smallBoss : tier === 'mid' ? HP_UNITS.midBoss : tier === 'big' ? HP_UNITS.bigBoss : HP_UNITS.hiddenBoss;
    }

    protected spawnBody(def: EnemyDef, x: number, y: number, units: number, scoreShare = 1): Enemy {
        const e = this.c.spawnEnemy(def, x, y, null, { boss: true, persistent: true, hpScale: units, tint: this.tint });
        e.damageScale = 0;
        e.scoreValue = Math.round(TIER_SCORE[this.tier] * scoreShare);
        this.bodies.push(e);
        return e;
    }

    protected spawnPart(def: EnemyDef, parent: Enemy, ox: number, oy: number, units: number, frame?: string): Enemy {
        const e = this.c.spawnEnemy(def, parent.x + ox, parent.y + oy, null, {
            parent, ox, oy, persistent: true, hpScale: units, tint: this.tint, frame,
        });
        e.damageScale = 0;
        this.parts.push(e);
        return e;
    }

    start(gen: Iterator<number | void>, tag = 'attack'): void {
        this.tasks.push({ gen, wait: 0, tag });
    }

    stop(tag = 'attack'): void {
        this.tasks = this.tasks.filter(t => t.tag !== tag);
    }

    update(c: SfCombat, dt: number): void {
        if (this.defeated) return;
        this.dt = dt;
        this.time += dt;
        // 任务里可能调用 start() / stop() 改写任务表（如进场任务里触发 onPhase）：遍历本帧快照，
        // 已被停止的任务跳过，结束的任务按引用移除；本帧新开的任务从下一帧开始执行。
        for (const task of this.tasks.slice()) {
            if (this.tasks.indexOf(task) < 0) continue;
            if (task.wait > 0) { task.wait -= dt; continue; }
            const r = task.gen.next();
            if (r.done) {
                const at = this.tasks.indexOf(task);
                if (at >= 0) this.tasks.splice(at, 1);
                continue;
            }
            task.wait = typeof r.value === 'number' ? r.value : 0;
        }
        if (!this.entering && this.phase < this.thresholds.length && this.hpRatio <= this.thresholds[this.phase]) {
            this.setPhase(this.phase + 1);
        }
    }

    protected setPhase(phase: number): void {
        this.phase = phase;
        this.stop('attack');
        this.c.cancelBullets(true);
        for (const e of this.bodies) e.hitFlash = 0.3;
        this.c.emit({ type: 'boss-phase', value: phase, x: this.core.x, y: this.core.y, text: this.name });
        this.c.bossPhaseChanged(phase, this.core.x, this.core.y);
        const shielded = this.bodies.concat(this.parts).filter(e => !e.dead);
        shielded.forEach(e => { e.damageScale = 0; });
        this.c.schedule(0.9, () => {
            shielded.forEach(e => { if (!e.dead) e.damageScale = 1; });
            this.onPhase(phase);
        });
    }

    /** 进场完成后调用 onPhase(0)。 */
    protected *enter(x: number, y: number, duration = 2.4): Generator<number> {
        const core = this.core;
        yield* this.moveTo(core, x, y, duration);
        this.entering = false;
        for (const e of this.bodies.concat(this.parts)) e.damageScale = 1;
        this.onPhase(0);
    }

    protected *moveTo(e: Enemy, x: number, y: number, duration: number): Generator<number> {
        const sx = e.x, sy = e.y;
        let t = 0;
        while (t < duration) {
            t += this.dt;
            const u = Math.min(1, t / duration);
            const k = u * u * (3 - 2 * u);
            e.x = sx + (x - sx) * k;
            e.y = sy + (y - sy) * k;
            yield 0;
        }
    }

    /** 每帧左右晃动（持续任务）。 */
    protected *sway(e: Enemy, amp: number, speed: number, baseY: number, bob = 10): Generator<number> {
        const baseX = e.x;
        let t = 0;
        for (; ;) {
            t += this.dt;
            e.x = baseX + Math.sin(t * speed) * amp;
            e.y = baseY + Math.sin(t * speed * 1.7) * bob;
            yield 0;
        }
    }

    protected style(base: ShotStyle): ShotStyle {
        return this.tint === 'ghost' ? { ...base, kind: base.kind === 'orb-l' ? 'orb-gl' : 'orb-g' } : base;
    }

    abstract onPhase(phase: number): void;

    onPartDestroyed(_part: Enemy): void { }

    onEnemyKilled(c: SfCombat, e: Enemy): void {
        if (this.defeated) return;
        if (this.parts.indexOf(e) >= 0) {
            c.emit({ type: 'boss-part', x: e.x, y: e.y, kind: e.partTag });
            c.player.energy = Math.min(100, c.player.energy + 15);
            this.onPartDestroyed(e);
            return;
        }
        if (this.bodies.indexOf(e) >= 0) {
            this.onBodyKilled(e);
            if (this.bodies.every(b => b.dead)) {
                this.defeated = true;
                this.tasks = [];
                for (const p of this.parts) if (!p.dead) c.killEnemy(p, 'mechanic', false);
                c.onBossDefeated(e.x, e.y);
            }
        }
    }

    protected onBodyKilled(_e: Enemy): void { }
}

/** 战场高度比例 → y 坐标（0 = 底部，1 = 顶部）。 */
export const ch = (c: SfCombat, frac: number) => c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * frac;
