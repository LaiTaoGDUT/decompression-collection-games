import {
    COMBO_WINDOW, MAX_FIELD_LEVEL, PLAYER_RULES, SLOTS, comboMultiplier, slotDps, standardDps, type SlotId,
} from './SfBalance';
import { SfRandom } from './SfRandom';
import type { CombatEvent, EnemyBullet, Hazard, Pickup, PickupKind, PlaneId, PlayerBullet } from './SfTypes';
import { enemyDef, type Enemy, type EnemyDef, type FireSpec } from './SfEnemies';
import type { Motion } from './SfMotion';
import type { LevelDef, WaveEvent } from './SfLevelTypes';
import { spawnFormation } from './SfFormations';
import type { LevelRule } from './content/SfContentTypes';
import { CH2_RULES } from './content/ch2/rules';
import { CH3_RULES } from './content/ch3/rules';
import { CH4_RULES } from './content/ch4/rules';
import { CH5_RULES } from './content/ch5/rules';
import { CH6_RULES } from './content/ch6/rules';

/** 关卡特殊规则（LevelDef.rule → 规则实现）。 */
const LEVEL_RULES: Record<string, LevelRule> = { ...CH2_RULES, ...CH3_RULES, ...CH4_RULES, ...CH5_RULES, ...CH6_RULES };
import { createPlaneKit, resolveExpiredBullet, type PlaneKit, type Ultimate } from './SfPlanes';
import { createBoss, type BossScript } from './SfBosses';
import { aimAngle, fan, lerpAngle, ring, segmentDistance, shoot, DOWN } from './SfPatterns';

export type CombatPhase = 'intro' | 'waves' | 'warning' | 'boss' | 'clear' | 'exit' | 'dead' | 'done';

export interface CombatConfig {
    plane: PlaneId;
    planeLevel: number;
    parts: Record<SlotId, number>;
    hearts: number;
    level: LevelDef;
    seed: number;
    hiddenBoss: boolean;
    /** 无尽模式：Boss 击破后不退出，按段数生成下一段空域。 */
    endless?: (sector: number) => { level: LevelDef; difficulty: number };
    /** 等效关卡序号（敌人血量与弹速）。 */
    difficulty?: number;
}

export interface PlayerState {
    x: number; y: number;
    vx: number;
    hp: number;
    maxHp: number;
    invulnerable: number;
    alive: boolean;
    energy: number;
    /** 涅槃等“抵消一次致命伤”的次数。 */
    rebirths: number;
    bank: number;
    hitFlash: number;
}

export interface Assembly {
    slot: SlotId;
    t: number;
    duration: number;
    fromX: number;
    fromY: number;
}

interface PendingSpawn { at: number; run: () => void }
interface PickupOptions { vx?: number; vy?: number; lost?: boolean; level?: number }

interface Group { total: number; killed: number; alive: number; drop?: PickupKind; lastX: number; lastY: number }

export interface CombatResult {
    victory: boolean;
    distance: number;
    sectors: number;
    bosses: number;
    score: number;
    coins: number;
    hitsTaken: number;
    kills: number;
    maxCombo: number;
    grazes: number;
    hiddenBoss: boolean;
    bossDefeated: boolean;
    seconds: number;
}

export class SfCombat {
    private nextId = 1;
    readonly rng: SfRandom;
    readonly events: CombatEvent[] = [];
    readonly config: CombatConfig;
    level: LevelDef;
    /** 无尽模式当前段数（从 1 开始）与累计飞行距离（米）。 */
    sector = 1;
    distance = 0;
    bossesDefeated = 0;
    readonly kit: PlaneKit;
    bounds = { left: -375, right: 375, top: 600, bottom: -600 };
    /** 玩家可移动范围（顶部给 HUD 留出空间）。 */
    flight = { left: -345, right: 345, top: 440, bottom: -560 };
    phase: CombatPhase = 'intro';
    time = 0;
    levelTime = 0;
    phaseTime = 0;
    scrollSpeed = 70;
    /** 敌人血量单位与弹速倍率。 */
    hpUnit: number;
    bulletSpeedScale: number;
    fireRateScale: number;

    readonly player: PlayerState;
    readonly fieldParts: Record<SlotId, number> = { main: 0, wing: 0, special: 0 };
    readonly assemblies: Assembly[] = [];
    buff = 0;
    ultimate: Ultimate | null = null;
    enemies: Enemy[] = [];
    pbullets: PlayerBullet[] = [];
    ebullets: EnemyBullet[] = [];
    pickups: Pickup[] = [];
    /** 场地危险物（见 SfTypes.Hazard）：每步开头清掉单步登记的，持续型按 life 倒计时。 */
    hazards: Hazard[] = [];
    /** 蛛网减速：本步玩家移动速度上限倍率（1 = 不减速）。 */
    private slowFactor = 1;
    /** 冰面：本步玩家是否在冰面上（下一步按惯性滑行），以及滑行速度。 */
    private onIce = false;
    private slideVx = 0;
    private slideVy = 0;
    /** 侧风（像素/秒，正值向右）：由关卡规则设置，吹偏玩家与敌弹。 */
    wind = 0;
    /** 牵引光束与引力井本步对玩家的拉动速度（像素/秒），下一步移动时叠加。 */
    private pullX = 0;
    private pullY = 0;
    /** 玩家处在牵引光束里：我方火力 +30%。 */
    tractorBoost = false;
    /** 本步生效的引力井与虚空裂缝（每步筛一次，子弹逐颗判定时不再遍历全部危险物）。 */
    private wells: Hazard[] = [];
    private portals: Hazard[] = [];
    /** 黑白世界（终焉·虚无最终阶段）：视图把场景压暗，敌人与敌弹只画成白色轮廓。 */
    monochrome = false;
    boss: BossScript | null = null;
    score = 0;
    coins = 0;
    combo = 0;
    comboTimer = 0;
    maxCombo = 0;
    kills = 0;
    grazes = 0;
    hitsTaken = 0;
    /** 慢动作倍率（Boss 击破、死亡）。 */
    timeScale = 1;
    private slowTimer = 0;
    private waveIndex = 0;
    private readonly pending: PendingSpawn[] = [];
    private readonly groups = new Map<number, Group>();
    /** 受伤敌人逃跑后，同类下一次登场继承最低剩余血量比例。 */
    private readonly escapedHp = new Map<string, number>();
    private groupSeq = 1;
    private graceWarn = 0;
    private bossDefeated = false;
    /** 本局至少击破过一个 Boss（无尽模式结算用）。 */
    get anyBossDefeated(): boolean { return this.bossesDefeated > 0; }
    private exitSpeed = 0;
    private waves: WaveEvent[];
    private lastKillAt = -9;
    private killChain = 0;
    private target: { x: number; y: number } | null = null;
    private energyAnnounced = false;
    /** 补给计数只计战斗击杀，按关卡 / 无尽区段重置。 */
    private supplyKills: number;
    private killsSinceRepair: number;

    /** 当前关卡的特殊规则（没有则为 undefined）。 */
    get rule(): LevelRule | undefined { return this.level.rule ? LEVEL_RULES[this.level.rule] : undefined; }

    constructor(config: CombatConfig) {
        this.config = config;
        this.level = config.level;
        this.rng = new SfRandom(config.seed);
        this.supplyKills = 0;
        this.killsSinceRepair = 0;
        const n = config.difficulty ?? config.level.number;
        this.hpUnit = standardDps(n);
        this.bulletSpeedScale = 1 + 0.012 * (n - 1);
        this.fireRateScale = 1 + 0.02 * (n - 1);
        this.scrollSpeed = config.level.scroll;
        this.waves = config.level.waves.slice().sort((a, b) => a.t - b.t);
        this.player = {
            x: 0, y: -900, vx: 0, hp: config.hearts, maxHp: config.hearts, invulnerable: 0, alive: true,
            energy: 0, rebirths: 0, bank: 0, hitFlash: 0,
        };
        this.kit = createPlaneKit(config.plane, this);
    }

    // ───────────────────────────── 外部接口 ─────────────────────────────

    /** top/bottom 为整屏边界（敌人在屏外生成）；flightTop/flightBottom 为玩家可活动的安全区间。 */
    setBounds(left: number, right: number, top: number, bottom: number, flightTop: number, flightBottom: number): void {
        this.bounds = { left, right, top, bottom };
        this.flight = { left: Math.max(left, -375) + 34, right: Math.min(right, 375) - 34, top: flightTop, bottom: flightBottom };
        if (this.phase === 'intro' && this.phaseTime === 0) this.player.y = bottom - 120;
    }

    emit(event: CombatEvent): void {
        this.events.push(event);
    }

    /** Boss 进入新阶段时调用：玩家未满血则在核心下方掉一个修理包。 */
    bossPhaseChanged(phase: number, x: number, y: number): void {
        if (phase >= 1 && this.player.hp < this.player.maxHp) this.spawnPickup('repair', x, y - 80);
    }

    drainEvents(): CombatEvent[] {
        return this.events.splice(0, this.events.length);
    }

    get partLevels(): Readonly<Record<SlotId, number>> { return this.config.parts; }

    /** 某挂点基础每秒伤害（含局外等级、局内零件）。 */
    slotDps(slot: SlotId, fieldOverride?: number): number {
        const field = fieldOverride ?? this.fieldParts[slot];
        return slotDps(this.config.planeLevel, slot, this.config.parts[slot], field);
    }

    /** 当前总火力（用于必杀伤害）。 */
    totalDps(): number {
        return SLOTS.reduce((sum, slot) => sum + this.slotDps(slot, Math.max(this.fieldParts[slot], slot === 'main' ? 0 : 1)), 0);
    }

    get buffActive(): boolean { return this.buff > 0; }

    /** 是否可以释放必杀（视图据此先播放切入演出，演出到释放点再调用 requestUltimate）。 */
    canUltimate(): boolean {
        if (this.phase !== 'waves' && this.phase !== 'boss' && this.phase !== 'warning') return false;
        return !this.ultimate && this.player.energy >= PLAYER_RULES.energyMax && this.player.alive;
    }

    requestUltimate(): boolean {
        if (!this.canUltimate()) return false;
        this.player.energy = 0;
        this.energyAnnounced = false;
        this.ultimate = this.kit.createUltimate(this);
        this.player.invulnerable = Math.max(this.player.invulnerable, this.ultimate.duration + 0.6);
        this.emit({ type: 'ultimate', text: this.ultimate.name, kind: this.config.plane });
        return true;
    }

    revive(): void {
        const p = this.player;
        p.alive = true;
        p.hp = p.maxHp;
        p.invulnerable = PLAYER_RULES.reviveProtection;
        this.cancelBullets(true);
        this.phase = this.boss ? 'boss' : 'waves';
        this.timeScale = 1;
        this.slowTimer = 0;
        this.emit({ type: 'revive', x: p.x, y: p.y });
    }

    result(): CombatResult {
        return {
            victory: this.bossDefeated && !this.config.endless, distance: Math.floor(this.distance), sectors: this.sector,
            bosses: this.bossesDefeated, score: this.score, coins: this.coins, hitsTaken: this.hitsTaken,
            kills: this.kills, maxCombo: this.maxCombo, grazes: this.grazes, hiddenBoss: this.config.hiddenBoss,
            bossDefeated: this.bossDefeated, seconds: this.time,
        };
    }

    // ───────────────────────────── 主循环 ─────────────────────────────

    step(rawDt: number, target: { x: number; y: number } | null): void {
        if (this.phase === 'done') return;
        this.target = target;
        if (this.slowTimer > 0) {
            this.slowTimer -= rawDt;
            if (this.slowTimer <= 0) this.timeScale = 1;
        }
        const dt = rawDt * this.timeScale;
        this.time += dt;
        this.phaseTime += dt;
        if (this.phase !== 'dead') this.distance += this.scrollSpeed * dt / 10;
        for (const e of this.enemies) e.hitFx = Math.max(0, e.hitFx - dt);
        if (this.phase === 'dead') return;

        this.tickHazards(dt);
        this.updatePhase(dt);
        this.updatePlayer(dt);
        this.updateAssemblies(dt);
        if (this.player.alive && this.phase !== 'exit' && this.phase !== 'intro') this.kit.update(this, dt);
        if (this.ultimate && !this.ultimate.update(this, dt)) {
            this.emit({ type: 'ultimate-end', kind: this.config.plane });
            this.ultimate = null;
        }
        this.runPending();
        this.boss?.update(this, dt);
        if (this.rule && (this.phase === 'waves' || this.phase === 'warning' || this.phase === 'boss')) this.rule.update(this, dt);
        this.updateEnemies(dt);
        this.applyHazards();
        this.updatePlayerBullets(dt);
        this.updateEnemyBullets(dt);
        this.updatePickups(dt);
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.combo = 0;
        }
        if (this.buff > 0) this.buff = Math.max(0, this.buff - dt);
        if (!this.energyAnnounced && this.player.energy >= PLAYER_RULES.energyMax && !this.ultimate) {
            this.energyAnnounced = true;
            this.emit({ type: 'energy-full' });
        }
        this.compact();
    }

    private updatePhase(dt: number): void {
        switch (this.phase) {
            case 'intro':
                if (this.phaseTime >= 1.3) this.setPhase('waves');
                break;
            case 'waves':
                this.levelTime += dt;
                while (this.waveIndex < this.waves.length && this.waves[this.waveIndex].t <= this.levelTime) {
                    spawnFormation(this, this.waves[this.waveIndex++]);
                }
                if (this.levelTime >= this.level.bossAt) {
                    const airborne = this.enemies.filter(e => !e.dead && !e.def.ground).length;
                    this.graceWarn += dt;
                    if (airborne <= 2 || this.graceWarn > 7) {
                        this.setPhase('warning');
                        this.emit({ type: 'boss-warning', text: this.config.hiddenBoss ? 'hidden' : this.level.tier });
                    }
                }
                break;
            case 'warning':
                if (this.phaseTime >= 3.0) {
                    this.boss = createBoss(this.config.hiddenBoss && this.sector === 1 ? this.hiddenBossId() : this.level.boss, this);
                    this.setPhase('boss');
                    this.emit({ type: 'boss-enter', text: this.boss.name, kind: this.boss.id });
                }
                break;
            case 'clear':
                for (const p of this.pickups) p.magnet = true;
                if (this.phaseTime >= 3.2) {
                    if (this.config.endless) {
                        this.sector++;
                        const next = this.config.endless(this.sector);
                        this.startSector(next.level, next.difficulty);
                    } else {
                        this.setPhase('exit');
                        this.emit({ type: 'level-exit' });
                    }
                }
                break;
            case 'exit':
                this.exitSpeed += 1800 * dt;
                this.player.y += this.exitSpeed * dt;
                if (this.player.y > this.bounds.top + 200) {
                    this.setPhase('done');
                    this.emit({ type: 'level-clear' });
                }
                break;
        }
    }

    /** 无尽模式：进入下一段空域（保留机体、零件与生命）。 */
    private startSector(level: LevelDef, difficulty: number): void {
        this.level = level;
        this.waves = level.waves.slice().sort((a, b) => a.t - b.t);
        this.waveIndex = 0;
        this.levelTime = 0;
        this.graceWarn = 0;
        this.supplyKills = 0;
        this.killsSinceRepair = 0;
        this.boss = null;
        this.bossDefeated = false;
        this.hpUnit = standardDps(difficulty);
        this.wind = 0;
        this.hazards.length = 0;
        this.bulletSpeedScale = 1 + 0.012 * (difficulty - 1);
        this.fireRateScale = 1 + 0.02 * (difficulty - 1);
        this.scrollSpeed = level.scroll;
        this.groups.clear();
        this.escapedHp.clear();
        this.setPhase('waves');
        this.rule?.start?.(this);
        this.emit({ type: 'sector', value: this.sector, text: level.name });
    }

    private hiddenBossId(): string {
        return `${this.level.boss}-hidden`;
    }

    private setPhase(phase: CombatPhase): void {
        this.phase = phase;
        this.phaseTime = 0;
        if (phase === 'waves' && this.levelTime === 0 && this.sector === 1) {
            this.emit({ type: 'level-intro', text: this.level.name });
            this.rule?.start?.(this);
        }
    }

    private updatePlayer(dt: number): void {
        const p = this.player;
        if (p.invulnerable > 0) p.invulnerable -= dt;
        if (p.hitFlash > 0) p.hitFlash -= dt;
        if (this.phase === 'intro') {
            const targetY = this.flight.bottom + 160;
            p.y += (targetY - p.y) * Math.min(1, dt * 3.2);
            p.x += (0 - p.x) * Math.min(1, dt * 4);
            p.vx = 0;
            p.bank += (0 - p.bank) * Math.min(1, dt * 8);
            return;
        }
        if (this.phase === 'exit' || !p.alive) return;
        const px = p.x;
        if (this.target) {
            const tx = Math.max(this.flight.left, Math.min(this.flight.right, this.target.x));
            const ty = Math.max(this.flight.bottom, Math.min(this.flight.top, this.target.y));
            // 跟手但不瞬移：高速逼近目标点，保证躲弹精确又有轻微惯性。
            const k = Math.min(1, dt * 28);
            let mx = (tx - p.x) * k, my = (ty - p.y) * k;
            // 蛛网减速：限制每步位移。
            const cap = 900 * this.slowFactor * dt;
            const len = Math.hypot(mx, my);
            if (this.slowFactor < 1 && len > cap) { mx *= cap / len; my *= cap / len; }
            if (this.onIce) {
                // 冰面：朝目标点加速，但加速度有限、几乎没有摩擦——松手后还会滑一段。
                let wx = (tx - p.x) * 8, wy = (ty - p.y) * 8;
                const w = Math.hypot(wx, wy);
                if (w > 820) { wx *= 820 / w; wy *= 820 / w; }
                const a = Math.min(1, dt * 2.4);
                this.slideVx += (wx - this.slideVx) * a;
                this.slideVy += (wy - this.slideVy) * a;
                p.x += this.slideVx * dt;
                p.y += this.slideVy * dt;
            } else {
                p.x += mx;
                p.y += my;
                this.slideVx = mx / Math.max(dt, 1e-4);
                this.slideVy = my / Math.max(dt, 1e-4);
            }
        }
        if (this.wind) p.x += this.wind * 0.35 * dt;
        p.x += this.pullX * dt;
        p.y += this.pullY * dt;
        p.x = Math.max(this.flight.left, Math.min(this.flight.right, p.x));
        p.y = Math.max(this.flight.bottom, Math.min(this.flight.top, p.y));
        p.vx = (p.x - px) / Math.max(dt, 1e-4);
        const bankTarget = Math.max(-1, Math.min(1, p.vx / 900));
        p.bank += (bankTarget - p.bank) * Math.min(1, dt * 10);
    }

    clampTarget(x: number, y: number): { x: number; y: number } {
        return {
            x: Math.max(this.flight.left, Math.min(this.flight.right, x)),
            y: Math.max(this.flight.bottom, Math.min(this.flight.top, y)),
        };
    }

    private updateAssemblies(dt: number): void {
        for (let i = this.assemblies.length - 1; i >= 0; i--) {
            const a = this.assemblies[i];
            a.t += dt;
            if (a.t >= a.duration) {
                this.assemblies.splice(i, 1);
                this.fieldParts[a.slot] = Math.min(MAX_FIELD_LEVEL, this.fieldParts[a.slot] + 1);
                this.emit({ type: 'assemble', slot: a.slot, value: this.fieldParts[a.slot], x: this.player.x, y: this.player.y });
            }
        }
    }

    private pendingLevel(slot: SlotId): number {
        return this.fieldParts[slot] + this.assemblies.filter(a => a.slot === slot).length;
    }

    // ───────────────────────────── 生成 ─────────────────────────────

    schedule(delay: number, run: () => void): void {
        this.pending.push({ at: this.time + delay, run });
    }

    private runPending(): void {
        for (let i = 0; i < this.pending.length; i++) {
            if (this.pending[i].at <= this.time) {
                const job = this.pending.splice(i, 1)[0];
                i--;
                job.run();
            }
        }
    }

    newGroup(drop?: PickupKind): number {
        const id = this.groupSeq++;
        this.groups.set(id, { total: 0, killed: 0, alive: 0, drop, lastX: 0, lastY: 0 });
        return id;
    }

    spawnEnemy(id: string | EnemyDef, x: number, y: number, motion: Motion | null, options: {
        group?: number; drop?: PickupKind; hpScale?: number; fireScale?: number; persistent?: boolean;
        parent?: Enemy; ox?: number; oy?: number; boss?: boolean; tint?: string; frame?: string; scale?: number;
    } = {}): Enemy {
        const def = typeof id === 'string' ? enemyDef(id) : id;
        const hpScale = options.hpScale ?? 1;
        const maxHp = Math.max(1, def.hp * this.hpUnit * hpScale);
        const e: Enemy = {
            id: this.nextId++, def, x, y, vx: 0, vy: 0, angle: 0, hp: maxHp, maxHp, radius: def.radius, age: 0, motion,
            fires: (def.fire ?? []).map(spec => this.fireState(spec, options.fireScale ?? 1)),
            parent: options.parent, ox: options.ox ?? 0, oy: options.oy ?? 0, damageScale: 1,
            entered: false, hitFlash: -1, hitFx: 0, windup: 0, aimX: 0, aimY: 0, frame: options.frame ?? def.frame,
            drop: options.drop, group: options.group, boss: options.boss, locks: 0, volatile: 0,
            persistent: options.persistent, scale: options.scale ?? 1, face: !!def.face, jelly: 0, jellyMax: 0, jellyStrength: 0, kickY: 0, hpScale,
            tint: options.tint, data: {},
        };
        const ratio = this.escapedHp.get(def.id);
        if (!e.boss && def.size !== 'boss' && ratio !== undefined) {
            e.hp = Math.max(1, maxHp * ratio);
            this.escapedHp.delete(def.id);
        }
        if (options.group !== undefined) {
            const g = this.groups.get(options.group);
            if (g) { g.total++; g.alive++; }
        }
        this.enemies.push(e);
        this.emit({ type: 'enemy-spawn', kind: def.id, id: e.id });
        def.behavior?.spawn?.(e, this);
        return e;
    }

    private fireState(spec: FireSpec, scale: number) {
        return { spec, timer: (spec.delay ?? 0.8) * scale, burstLeft: 0, burstTimer: 0 };
    }

    spawnEnemyBullet(b: Partial<EnemyBullet> & { x: number; y: number; vx: number; vy: number; kind: string; radius: number }): EnemyBullet {
        const bullet: EnemyBullet = {
            id: this.nextId++, x: b.x, y: b.y, vx: b.vx, vy: b.vy, ax: b.ax ?? 0, ay: b.ay ?? 0, radius: b.radius,
            kind: b.kind, life: b.life ?? 12, delay: b.delay ?? 0, turn: b.turn ?? 0, maxSpeed: b.maxSpeed ?? 0,
            grazed: false, fuse: b.fuse, burst: b.burst, pool: b.pool, bounces: b.bounces, stop: b.stop, orbit: b.orbit, lofted: b.lofted,
            angle: Math.atan2(b.vy, b.vx),
        };
        if (this.ebullets.length < 260) this.ebullets.push(bullet);
        return bullet;
    }

    firePlayer(b: Omit<PlayerBullet, 'id'>): PlayerBullet {
        const bullet = { ...b, id: this.nextId++ } as PlayerBullet;
        if (this.pbullets.length < 320) {
            this.pbullets.push(bullet);
            if (b.slot === 'wing' || b.slot === 'special') {
                this.emit({ type: 'weapon-fire', kind: b.kind, slot: b.slot });
            }
        }
        return bullet;
    }

    spawnPickup(kind: PickupKind, x: number, y: number, options: PickupOptions & { lost: true }): Pickup;
    spawnPickup(kind: PickupKind, x: number, y: number, options?: PickupOptions): Pickup | null;
    spawnPickup(kind: PickupKind, x: number, y: number, options: PickupOptions = {}): Pickup | null {
        // 所有奖励来源共用满级过滤，正在装配的升级也占用等级；受伤脱落的零件仍可回收。
        if (!options.lost && SLOTS.indexOf(kind as SlotId) >= 0 && this.pendingLevel(kind as SlotId) >= MAX_FIELD_LEVEL) {
            return null;
        }
        const p: Pickup = {
            id: this.nextId++, kind, x, y,
            vx: options.vx ?? this.rng.range(-60, 60), vy: options.vy ?? this.rng.range(140, 220),
            age: 0, life: options.lost ? Infinity : (kind === 'coin' || kind === 'coinBig' ? 9 : 14),
            lost: options.lost, level: options.level, magnet: false,
        };
        this.pickups.push(p);
        return p;
    }

    // ───────────────────────────── 敌人 ─────────────────────────────

    private updateEnemies(dt: number): void {
        const b = this.bounds;
        for (const e of this.enemies) {
            if (e.dead) continue;
            e.age += dt;
            if (e.hitFlash > -1) e.hitFlash -= dt;
            if (e.windup > 0) e.windup -= dt;
            if (e.jelly > 0) e.jelly = Math.max(0, e.jelly - dt);
            if (e.kickY !== 0) e.kickY *= Math.max(0, 1 - dt * 20);
            if (e.parent) {
                if (e.parent.dead) { this.killEnemy(e, 'mechanic', false); continue; }
                e.x = e.parent.x + e.ox * e.parent.scale;
                e.y = e.parent.y + e.oy * e.parent.scale;
            } else if (e.motion) {
                const alive = e.motion.update(e, dt, this);
                if (alive === false && !e.persistent) { e.dead = true; e.escaped = true; this.groupEscape(e); continue; }
            }
            if (e.face && (Math.abs(e.vx) + Math.abs(e.vy) > 5)) {
                const target = Math.atan2(e.vy, e.vx) + Math.PI / 2;
                e.angle = lerpAngle(e.angle, target, Math.min(1, dt * 10));
            }
            const inside = e.y - e.radius * 0.4 < b.top && e.y + e.radius > b.bottom && e.x > b.left - e.radius * 0.5 && e.x < b.right + e.radius * 0.5;
            if (inside) e.entered = true;
            e.def.behavior?.update?.(e, this, dt);
            if (e.dead) continue;
            if (e.shieldParts) {
                e.shield = e.shieldParts.filter(part => !part.dead).length;
                e.damageScale = e.shield > 0 ? 0.08 : 1;
            }
            if (!e.persistent && e.entered && (e.y < b.bottom - e.radius - 60 || e.x < b.left - e.radius - 140 || e.x > b.right + e.radius + 140 || e.y > b.top + 420)) {
                e.dead = true; e.escaped = true; this.groupEscape(e); continue;
            }
            if (!e.persistent && !e.entered && e.age > 18) { e.dead = true; e.escaped = true; this.groupEscape(e); continue; }
            if (e.entered && this.phase !== 'clear' && this.phase !== 'exit') this.updateFire(e, dt);
            // 空中敌人与玩家碰撞。
            if (e.def.contact && e.entered && this.player.alive && !e.boss) {
                const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                if (d < e.radius * 0.72 + 10) {
                    this.hurtPlayer();
                    if (e.def.size === 'small' || e.def.size === 'medium') this.damageEnemy(e, e.maxHp * 2, 'mechanic', e.x, e.y);
                }
            }
        }
    }

    private updateFire(e: Enemy, dt: number): void {
        if (this.player.y > e.y + 40 && e.def.size !== 'elite' && !e.def.ground && e.def.id !== 'bomber') return; // 飞过玩家的敌人不再从背后偷袭。
        for (const f of e.fires) {
            const spec = f.spec;
            if (f.burstLeft > 0) {
                f.burstTimer -= dt;
                if (f.burstTimer <= 0) { this.fireOnce(e, spec); f.burstLeft--; f.burstTimer = spec.burstGap ?? 0.15; }
                continue;
            }
            f.timer -= dt * this.fireRateScale;
            const windup = spec.windup ?? 0;
            if (windup > 0 && f.timer <= windup && f.timer + dt * this.fireRateScale > windup) {
                e.windup = windup;
            }
            if (f.timer <= 0) {
                f.timer += spec.interval;
                this.fireOnce(e, spec);
                if ((spec.burst ?? 1) > 1) { f.burstLeft = (spec.burst ?? 1) - 1; f.burstTimer = spec.burstGap ?? 0.15; }
            }
        }
    }

    private fireOnce(e: Enemy, spec: FireSpec): void {
        if (e.y > this.bounds.top - 10 || e.y < this.bounds.bottom + 60) return;
        const mx = e.x + (spec.muzzle?.x ?? 0) * e.scale;
        const my = e.y + (spec.muzzle?.y ?? -e.radius * 0.5) * e.scale;
        const style = { kind: spec.kind, radius: spec.radius ?? 8, fuse: spec.fuse, burst: spec.burstSpec };
        switch (spec.pattern) {
            case 'aimed': fan(this, mx, my, aimAngle(this, mx, my), spec.count ?? 1, spec.spread ?? 0, spec.speed, style); break;
            case 'fan': fan(this, mx, my, DOWN, spec.count ?? 5, spec.spread ?? 60, spec.speed, style); break;
            case 'down': fan(this, mx, my, DOWN, spec.count ?? 1, spec.spread ?? 0, spec.speed, style); break;
            case 'ring': ring(this, mx, my, spec.count ?? 8, spec.speed, this.rng.next() * Math.PI, style); break;
            case 'line': {
                const a = aimAngle(this, mx, my);
                for (let i = 0; i < (spec.count ?? 5); i++) shoot(this, mx, my, a, spec.speed * (0.7 + i * 0.12), style);
                break;
            }
            case 'drop': shoot(this, mx, my, DOWN, spec.speed, style); break;
        }
        this.emit({ type: 'shot', kind: 'enemy', x: mx, y: my });
    }

    /** 对敌人造成伤害；返回实际伤害。 */
    damageEnemy(e: Enemy, amount: number, slot: string, hx: number, hy: number): number {
        if (e.dead || e.wreck) return 0;
        if (!e.entered || e.damageScale <= 0) {
            this.emit({ type: 'shield-hit', x: hx, y: hy });
            return 0;
        }
        if (e.coveredBy && !e.coveredBy.dead) {
            this.emit({ type: 'shield-hit', x: hx, y: hy });
            return 0;
        }
        const guarded = e.guard && !e.guard.dead ? 0.2 : 1;
        if (guarded < 1) this.emit({ type: 'shield-hit', x: hx, y: hy });
        const scaled = amount * e.damageScale * guarded * (this.tractorBoost ? 1.3 : 1);
        const dealt = e.def.behavior?.damage ? e.def.behavior.damage(e, this, scaled, hx, hy) : scaled;
        if (dealt <= 0) {
            this.emit({ type: 'shield-hit', x: hx, y: hy });
            return 0;
        }
        e.hp -= dealt;
        // tidal-wings 受击：普通 0.18 秒、重击 0.22 秒；力度随单次伤害占比；受击向上踢动。
        const heavy = dealt > e.maxHp * 0.18;
        if (e.jelly <= e.jellyMax * 0.35) {
            e.jellyMax = heavy ? 0.22 : 0.18;
            e.jelly = e.jellyMax;
        }
        e.jellyStrength = Math.max(0.35, Math.min(1, dealt / e.maxHp * 3 + 0.35));
        e.kickY = Math.min(9, e.kickY + (heavy ? 4 : 1.6));
        e.lastSlot = slot;
        if (e.damageScale < 0.5) this.emit({ type: 'shield-hit', x: hx, y: hy });
        if (e.hitFx <= 0) {
            e.hitFx = 0.07;
            this.emit({ type: 'hit', x: hx, y: hy, kind: e.def.body, size: e.boss ? 2 : 1 });
        }
        if (e.hp <= 0) this.killEnemy(e, slot, true);
        return dealt;
    }

    killEnemy(e: Enemy, slot: string, reward: boolean): void {
        if (e.dead) return;
        e.dead = true;
        e.hp = 0;
        if (e.group !== undefined) {
            const g = this.groups.get(e.group);
            if (g) {
                g.alive--; if (reward) g.killed++;
                g.lastX = e.x; g.lastY = e.y;
                // 带奖励的编队（3 只以上或 1～2 只的重装单位）全歼即掉落。
                if (g.alive <= 0 && g.killed === g.total && g.drop) {
                    this.spawnPickup(g.drop, g.lastX, g.lastY);
                    if (g.total >= 3) this.emit({ type: 'combo', x: g.lastX, y: g.lastY, text: 'squad' });
                }
            }
        }
        const size = e.def.size === 'small' ? 1 : e.def.size === 'medium' ? 2 : e.def.size === 'large' ? 3 : e.def.size === 'part' ? 3 : e.def.size === 'elite' ? 4 : 5;
        this.emit({ type: 'kill', x: e.x, y: e.y, size, kind: e.def.body, id: e.id, value: e.def.id === 'balloon' ? 1 : 0 });
        if (reward) {
            this.kills++;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.comboTimer = COMBO_WINDOW;
            const gain = Math.round((e.scoreValue ?? e.def.score) * comboMultiplier(this.combo));
            this.score += gain;
            this.player.energy = Math.min(PLAYER_RULES.energyMax, this.player.energy + e.def.energy);
            // 金币击杀即得（不需要拾取），随击杀飘字一起显示。
            const coins = (e.def.coins ?? 0) + (e.boss ? 20 : 0);
            this.coins += coins;
            this.killChain = this.time - this.lastKillAt < 0.72 ? this.killChain + 1 : 1;
            this.lastKillAt = this.time;
            this.emit({ type: 'score', x: e.x, y: e.y, value: gain, coins, chain: this.killChain, tier: size, size: this.combo });
            if (e.drop) this.spawnPickup(e.drop, e.x, e.y);
            for (const extra of e.extraDrops ?? []) this.spawnPickup(extra, e.x + this.rng.range(-30, 30), e.y);
            // Boss 本体、部件与结算清场不计补给；精英另送一份维修。
            if (!e.boss && e.def.size !== 'boss' && e.def.size !== 'part' && !this.bossDefeated) {
                this.supplyKills++;
                this.killsSinceRepair++;
                if (this.supplyKills % 26 === 0) this.spawnPickup('fire', e.x, e.y);
                if (this.player.hp < this.player.maxHp && this.killsSinceRepair >= 30) {
                    this.spawnPickup('repair', e.x, e.y);
                    this.killsSinceRepair = 0;
                }
                if (e.def.size === 'elite' && this.player.hp < this.player.maxHp) this.spawnPickup('repair', e.x, e.y);
            }
            if (e.def.deathBurst && !e.boss) {
                const d = e.def.deathBurst;
                ring(this, e.x, e.y, d.count, d.speed, this.rng.next() * Math.PI, { kind: d.kind, radius: d.radius });
            }
            this.kit.onEnemyKilled?.(this, e, slot);
        }
        e.def.behavior?.death?.(e, this, reward);
        for (const child of this.enemies) if (child.parent === e && !child.dead) this.killEnemy(child, 'mechanic', false);
        if (this.boss) this.boss.onEnemyKilled(this, e);
    }

    private groupEscape(e: Enemy): void {
        if (!e.boss && e.def.size !== 'boss' && e.def.size !== 'small' && e.def.size !== 'part' && e.hp < e.maxHp) {
            const ratio = e.hp / e.maxHp;
            this.escapedHp.set(e.def.id, Math.min(this.escapedHp.get(e.def.id) ?? 1, ratio));
        }
        if (e.group === undefined) return;
        const g = this.groups.get(e.group);
        if (g) g.alive--;
    }

    /** Boss 击破：慢动作、清弹、清场，进入结算阶段。 */
    onBossDefeated(x: number, y: number): void {
        if (this.bossDefeated) return;
        this.bossDefeated = true;
        this.bossesDefeated++;
        this.timeScale = 0.25;
        this.slowTimer = 0.7;
        this.cancelBullets(true);
        this.hazards.length = 0;
        this.monochrome = false;
        for (const e of this.enemies) if (!e.dead && !e.boss) this.killEnemy(e, 'mechanic', true);
        this.emit({ type: 'boss-defeated', x, y, text: this.boss?.name, kind: this.boss?.id });
        this.setPhase('clear');
        this.ultimate = null;
    }

    /** 清除敌弹；奖励模式下每颗换 10 分并发出闪光事件。 */
    cancelBullets(reward: boolean, cx?: number, cy?: number, radius = Infinity): void {
        for (const b of this.ebullets) {
            if (b.dead) continue;
            if (cx !== undefined && Math.hypot(b.x - cx, b.y - (cy ?? 0)) > radius) continue;
            b.dead = true;
            if (reward) { this.score += 10; this.emit({ type: 'explosion', x: b.x, y: b.y, size: 0, kind: 'cancel' }); }
        }
    }

    // ───────────────────────────── 场地危险物 ─────────────────────────────

    /** 登记一个危险物；持续型（life）首次登记时记录总时长。 */
    addHazard(h: Hazard): Hazard {
        if (h.life !== undefined && h.maxLife === undefined) h.maxLife = h.life;
        this.hazards.push(h);
        return h;
    }

    private tickHazards(dt: number): void {
        this.hazards = this.hazards.filter(h => h.life !== undefined && (h.life -= dt) > 0);
        const drop = this.scrollSpeed * dt;
        for (const h of this.hazards) {
            if (h.warn !== undefined && h.warn > 0 && h.warnTime) h.warn = Math.max(0, h.warn - dt / h.warnTime);
            if (h.scroll) { h.ay -= drop; h.by -= drop; }
            if (h.kind === 'pulse' && !(h.warn ?? 0)) h.radius = (h.radius ?? 0) + (h.speed ?? 0) * dt;
        }
    }

    /** 冰面：地面上的圆形滑行区，随地面卷动（数量过多时替换最旧的一块）。 */
    addIce(x: number, y: number, radius: number, life: number): Hazard {
        const patches = this.hazards.filter(h => h.kind === 'ice');
        if (patches.length >= 12) patches[0].life = 0.01;
        return this.addHazard({ kind: 'ice', ax: x, ay: y, bx: x, by: y, width: radius, life, scroll: true });
    }

    /** 熔岩滩：地面上的圆形燃烧区，warnTime 秒预警后生效，随地面卷动（数量过多时替换最旧的一块）。 */
    addLava(x: number, y: number, radius: number, life: number, warnTime = 0): Hazard {
        const pools = this.hazards.filter(h => h.kind === 'lava');
        if (pools.length >= 24) pools[0].life = 0.01;
        return this.addHazard({ kind: 'lava', ax: x, ay: y, bx: x, by: y, width: radius, life: life + warnTime,
            warn: warnTime > 0 ? 1 : undefined, warnTime: warnTime > 0 ? warnTime : undefined, scroll: true });
    }

    /** 激光 / 藤鞭 / 脉冲波伤人，蛛网减速，牵引光束与引力井拉动玩家（拖网、裂缝、引力井在子弹更新里作用于子弹）。 */
    private applyHazards(): void {
        const p = this.player;
        this.slowFactor = 1;
        this.onIce = false;
        this.pullX = this.pullY = 0;
        this.tractorBoost = false;
        this.wells = this.hazards.filter(h => h.kind === 'well' && !((h.warn ?? 0) > 0) && !!h.pull);
        this.portals = this.hazards.filter(h => h.kind === 'portal' && !((h.warn ?? 0) > 0));
        if (!p.alive || (this.phase !== 'waves' && this.phase !== 'warning' && this.phase !== 'boss')) return;
        for (const h of this.hazards) {
            if ((h.warn ?? 0) > 0) continue;
            if (h.kind === 'laser' || h.kind === 'vine' || h.kind === 'fissure' || h.kind === 'tongue') {
                if (segmentDistance(p.x, p.y, h.ax, h.ay, h.bx, h.by) < h.width + PLAYER_RULES.hitRadius) this.hurtPlayer();
            } else if (h.kind === 'pulse') {
                const dx = p.x - h.ax, dy = p.y - h.ay;
                if (Math.abs(Math.hypot(dx, dy) - (h.radius ?? 0)) >= h.width + PLAYER_RULES.hitRadius) continue;
                let off = Math.abs(Math.atan2(dy, dx) - (h.gap ?? 0)) % (Math.PI * 2);
                if (off > Math.PI) off = Math.PI * 2 - off;
                if (off > (h.gapWidth ?? 0)) this.hurtPlayer();
            } else if (h.kind === 'tractor') {
                if (segmentDistance(p.x, p.y, h.ax, h.ay, h.bx, h.by) >= h.width) continue;
                const dx = h.ax - p.x, dy = h.ay - p.y, d = Math.hypot(dx, dy) || 1;
                this.pullX += dx / d * (h.pull ?? 0);
                this.pullY += dy / d * (h.pull ?? 0);
                this.tractorBoost = true;
            } else if (h.kind === 'well') {
                if (!h.drag) continue;
                const dx = h.ax - p.x, dy = h.ay - p.y, d = Math.hypot(dx, dy);
                if (d > h.width || d < 8) continue;
                this.pullX += dx / d * h.drag;
                this.pullY += dy / d * h.drag;
            } else if (h.kind === 'lava') {
                // 熔岩滩边缘留出余量：只有机体压进滩面才算踩到。
                if (Math.hypot(p.x - h.ax, p.y - h.ay) < h.width * 0.78) this.hurtPlayer();
            } else if (h.kind === 'web') {
                if (Math.hypot(p.x - h.ax, p.y - h.ay) < h.width) this.slowFactor = 0.45;
            } else if (h.kind === 'ice') {
                if (Math.hypot(p.x - h.ax, p.y - h.ay) < h.width * 0.85) this.onIce = true;
            }
        }
    }

    /** 拖网与冰墙挡住我方子弹（必杀不受影响）。 */
    private blockedByNet(bullet: PlayerBullet): boolean {
        if (bullet.slot === 'ultimate') return false;
        for (const h of this.hazards) {
            if ((h.kind !== 'net' && h.kind !== 'icewall') || (h.warn ?? 0) > 0) continue;
            if (segmentDistance(bullet.x, bullet.y, h.ax, h.ay, h.bx, h.by) < h.width + bullet.radius) {
                bullet.dead = true;
                this.emit({ type: 'shield-hit', x: bullet.x, y: bullet.y, kind: h.kind });
                return true;
            }
        }
        return false;
    }

    /** 虚空裂缝：子弹进入一端，从另一端以原速度射出；之后短时间内不再传送（避免在两端之间来回）。 */
    private warpThroughPortals(b: { x: number; y: number; vx: number; vy: number; warp?: number }, dt: number): void {
        if (b.warp !== undefined && b.warp > 0) { b.warp -= dt; return; }
        for (const h of this.portals) {
            const ends: [number, number, number, number][] = [[h.ax, h.ay, h.bx, h.by], [h.bx, h.by, h.ax, h.ay]];
            for (const [ix, iy, ox, oy] of ends) {
                if ((b.x - ix) * (b.x - ix) + (b.y - iy) * (b.y - iy) > h.width * h.width) continue;
                b.x = ox + (b.x - ix);
                b.y = oy + (b.y - iy);
                b.warp = Math.max(0.3, h.width * 2.4 / (Math.hypot(b.vx, b.vy) || 1));
                return;
            }
        }
    }

    /** 引力井：把经过的子弹向井心弯曲，只改方向不改速率。 */
    private bendByWells(b: { x: number; y: number; vx: number; vy: number }, dt: number, scale: number): void {
        for (const h of this.wells) {
            const dx = h.ax - b.x, dy = h.ay - b.y, d = Math.hypot(dx, dy);
            if (d > h.width || d < 10) continue;
            const speed = Math.hypot(b.vx, b.vy);
            if (speed < 1) continue;
            const a = h.pull * scale * (1 - d / h.width) * dt;
            b.vx += dx / d * a; b.vy += dy / d * a;
            const k = speed / (Math.hypot(b.vx, b.vy) || 1);
            b.vx *= k; b.vy *= k;
        }
    }

    /** 冰墙同样挡住敌弹：玩家可以躲在墙后。 */
    private blockedByIceWall(bullet: EnemyBullet): boolean {
        for (const h of this.hazards) {
            if (h.kind !== 'icewall' || (h.warn ?? 0) > 0) continue;
            if (segmentDistance(bullet.x, bullet.y, h.ax, h.ay, h.bx, h.by) < h.width + bullet.radius * 0.6) {
                bullet.dead = true;
                this.emit({ type: 'shield-hit', x: bullet.x, y: bullet.y, kind: 'icewall' });
                return true;
            }
        }
        return false;
    }

    // ───────────────────────────── 子弹 ─────────────────────────────

    private updatePlayerBullets(dt: number): void {
        const b = this.bounds;
        for (const bullet of this.pbullets) {
            if (bullet.dead) continue;
            bullet.life -= dt;
            if (bullet.life <= 0) {
                bullet.dead = true;
                if (bullet.tag) resolveExpiredBullet(this, bullet);
                continue;
            }
            if (bullet.target !== undefined && bullet.turn) {
                const t = this.enemies.find(e => e.id === bullet.target && !e.dead);
                if (t) {
                    const want = Math.atan2(t.y - bullet.y, t.x - bullet.x);
                    const cur = Math.atan2(bullet.vy, bullet.vx);
                    const next = turnToward(cur, want, bullet.turn * dt);
                    const speed = bullet.speed ?? Math.hypot(bullet.vx, bullet.vy);
                    bullet.vx = Math.cos(next) * speed; bullet.vy = Math.sin(next) * speed;
                } else {
                    bullet.target = this.nearestEnemy(bullet.x, bullet.y, 700)?.id;
                    if (bullet.target === undefined) bullet.turn = 0;
                }
            }
            if (bullet.spin) bullet.angle = (bullet.angle ?? 0) + bullet.spin * dt;
            this.bendByWells(bullet, dt, 2.2);
            bullet.x += bullet.vx * dt;
            bullet.y += bullet.vy * dt;
            this.warpThroughPortals(bullet, dt);
            if (bullet.y > b.top + 60 || bullet.y < b.bottom - 60 || bullet.x < b.left - 60 || bullet.x > b.right + 60) {
                bullet.dead = true; continue;
            }
            if (this.blockedByNet(bullet)) continue;
            for (const e of this.enemies) {
                if (e.dead || e.wreck || !e.entered) continue;
                // 被部件遮挡的本体（如主帆下的船身）不拦截子弹，让子弹打到遮挡部件上。
                if (e.coveredBy && !e.coveredBy.dead) continue;
                const r = e.radius * (e.boss || e.def.size === 'part' ? 0.85 : 1) + bullet.radius;
                const dx = e.x - bullet.x, dy = e.y - bullet.y;
                if (dx * dx + dy * dy > r * r) continue;
                if (bullet.hitIds && bullet.hitIds.indexOf(e.id) >= 0) continue;
                if (bullet.tag === 'burst' || bullet.tag === 'cluster' || bullet.tag === 'burst-mini') {
                    bullet.dead = true;
                    resolveExpiredBullet(this, bullet);
                    break;
                }
                this.damageEnemy(e, bullet.damage, bullet.slot, bullet.x, bullet.y);
                this.kit.onBulletHit?.(this, e, bullet);
                if (bullet.splash) this.splash(bullet.x, bullet.y, bullet.splash, bullet.damage * (bullet.splashRatio ?? 0.5), bullet.slot, e.id);
                if (bullet.pierce > 0) {
                    bullet.pierce--;
                    (bullet.hitIds = bullet.hitIds ?? []).push(e.id);
                } else {
                    bullet.dead = true;
                    break;
                }
            }
        }
    }

    splash(x: number, y: number, radius: number, damage: number, slot: string, skipId = -1): void {
        this.emit({ type: 'explosion', x, y, size: radius, kind: 'splash' });
        for (const e of this.enemies) {
            if (e.dead || e.id === skipId || !e.entered) continue;
            if (Math.hypot(e.x - x, e.y - y) < radius + e.radius * 0.6) this.damageEnemy(e, damage, slot, e.x, e.y);
        }
    }

    nearestEnemy(x: number, y: number, range: number, filter?: (e: Enemy) => boolean): Enemy | undefined {
        let best: Enemy | undefined;
        let bestD = range * range;
        for (const e of this.enemies) {
            if (e.dead || e.wreck || !e.entered || e.damageScale <= 0) continue;
            if (e.coveredBy && !e.coveredBy.dead) continue;
            if (filter && !filter(e)) continue;
            const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    private updateEnemyBullets(dt: number): void {
        const p = this.player;
        const b = this.bounds;
        const hitR = PLAYER_RULES.hitRadius;
        const grazeR = PLAYER_RULES.grazeRadius;
        for (const bullet of this.ebullets) {
            if (bullet.dead) continue;
            bullet.life -= dt;
            if (bullet.life <= 0) { bullet.dead = true; continue; }
            if (bullet.delay > 0) { bullet.delay -= dt; continue; }
            if (bullet.stop !== undefined) {
                bullet.stop -= dt;
                if (bullet.stop <= 0) { bullet.vx = bullet.vy = bullet.ax = bullet.ay = 0; bullet.turn = 0; bullet.stop = undefined; }
            }
            if (bullet.orbit) {
                // 公转弹：位置由公转参数决定，速度只用于贴图朝向。
                const o = bullet.orbit;
                o.a += o.w * dt;
                o.r += o.dr * dt;
                if (o.r <= 4) { bullet.dead = true; continue; }
                const nx = o.cx + Math.cos(o.a) * o.r, ny = o.cy + Math.sin(o.a) * o.r;
                bullet.vx = (nx - bullet.x) / Math.max(dt, 1e-4); bullet.vy = (ny - bullet.y) / Math.max(dt, 1e-4);
                bullet.x = nx; bullet.y = ny;
            }
            if (this.wind && (bullet.vx || bullet.vy)) bullet.vx += this.wind * 0.6 * dt;
            if (bullet.turn) {
                const a = Math.atan2(bullet.vy, bullet.vx) + bullet.turn * dt;
                const s = Math.hypot(bullet.vx, bullet.vy);
                bullet.vx = Math.cos(a) * s; bullet.vy = Math.sin(a) * s;
            }
            if (bullet.ax || bullet.ay) {
                bullet.vx += bullet.ax * dt; bullet.vy += bullet.ay * dt;
                if (bullet.maxSpeed) {
                    const s = Math.hypot(bullet.vx, bullet.vy);
                    if (s > bullet.maxSpeed) { bullet.vx *= bullet.maxSpeed / s; bullet.vy *= bullet.maxSpeed / s; }
                }
            }
            if (!bullet.orbit) {
                this.bendByWells(bullet, dt, 0.5);
                bullet.x += bullet.vx * dt;
                bullet.y += bullet.vy * dt;
                this.warpThroughPortals(bullet, dt);
            }
            if (bullet.bounces && ((bullet.x < b.left + bullet.radius && bullet.vx < 0) || (bullet.x > b.right - bullet.radius && bullet.vx > 0))) {
                bullet.vx = -bullet.vx;
                bullet.bounces--;
            }
            if (this.blockedByIceWall(bullet)) continue;
            if (bullet.vx || bullet.vy) bullet.angle = Math.atan2(bullet.vy, bullet.vx);
            if (bullet.fuse !== undefined) {
                bullet.fuse -= dt;
                if (bullet.fuse <= 0) {
                    bullet.dead = true;
                    if (bullet.burst) {
                        const s = bullet.burst;
                        ring(this, bullet.x, bullet.y, s.count, s.speed, s.offset ?? Math.PI / 4, { kind: s.kind, radius: s.radius });
                    }
                    if (bullet.pool) {
                        const ice = bullet.pool.kind === 'ice';
                        if (ice) this.addIce(bullet.x, bullet.y, bullet.pool.radius, bullet.pool.life);
                        else this.addLava(bullet.x, bullet.y, bullet.pool.radius, bullet.pool.life);
                        this.emit({ type: 'explosion', x: bullet.x, y: bullet.y, size: bullet.pool.radius, kind: ice ? 'ice' : 'lava' });
                        continue;
                    }
                    this.emit({ type: 'explosion', x: bullet.x, y: bullet.y, size: 28, kind: 'bomb' });
                    continue;
                }
            }
            if (bullet.y < b.bottom - 50 || bullet.y > b.top + 160 || bullet.x < b.left - 50 || bullet.x > b.right + 50) {
                bullet.dead = true; continue;
            }
            if (!p.alive || this.phase === 'exit' || this.phase === 'intro' || bullet.lofted) continue;
            const dx = bullet.x - p.x, dy = bullet.y - p.y;
            const d2 = dx * dx + dy * dy;
            const hit = bullet.radius * 0.6 + hitR;
            if (d2 < hit * hit) {
                if (p.invulnerable <= 0) {
                    bullet.dead = true;
                    this.hurtPlayer();
                }
                continue;
            }
            const graze = bullet.radius + grazeR;
            if (!bullet.grazed && d2 < graze * graze) {
                bullet.grazed = true;
                this.grazes++;
                this.score += 10;
                p.energy = Math.min(PLAYER_RULES.energyMax, p.energy + 0.6);
                this.kit.onGraze?.(this, bullet);
                this.emit({ type: 'graze', x: bullet.x, y: bullet.y });
            }
        }
    }

    hurtPlayer(): void {
        const p = this.player;
        if (p.invulnerable > 0 || !p.alive || this.phase === 'exit' || this.phase === 'clear') return;
        p.hp -= 1;
        this.hitsTaken++;
        p.invulnerable = PLAYER_RULES.invulnerableSeconds;
        p.hitFlash = 0.4;
        this.combo = 0;
        this.comboTimer = 0;
        // 为了公平，命中瞬间清掉身边的子弹。
        this.cancelBullets(false, p.x, p.y, 110);
        this.emit({ type: 'hurt', x: p.x, y: p.y, value: p.hp });
        this.dropPart();
        if (p.hp <= 0) {
            if (p.rebirths > 0 || (this.kit.tryRebirth?.(this) ?? false)) return;
            p.alive = false;
            this.timeScale = 0.3;
            this.slowTimer = 0.8;
            this.emit({ type: 'dead', x: p.x, y: p.y });
            this.schedule(0.25, () => { if (!this.player.alive) this.phase = 'dead'; });
        }
    }

    private dropPart(): void {
        const owned = SLOTS.filter(s => this.fieldParts[s] > 0);
        if (owned.length === 0) return;
        const slot = this.rng.pick(owned);
        this.fieldParts[slot]--;
        const p = this.player;
        // 零件向周围随机落点弹飞，落点限制在玩家可活动范围内。
        const angle = this.rng.range(0, Math.PI * 2), distance = this.rng.range(150, 260);
        const target = this.clampTarget(p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance);
        const item = this.spawnPickup(slot, p.x, p.y, { vx: 0, vy: 0, lost: true, level: this.fieldParts[slot] + 1 });
        item.sx = p.x; item.sy = p.y;
        item.tx = target.x; item.ty = target.y;
        this.emit({ type: 'part-lost', slot, x: p.x, y: p.y, value: this.fieldParts[slot] + 1 });
    }

    // ───────────────────────────── 拾取 ─────────────────────────────

    private updatePickups(dt: number): void {
        const p = this.player;
        for (const item of this.pickups) {
            if (item.dead) continue;
            const flying = item.lost && item.age < PLAYER_RULES.lostPartFly;
            item.age += dt;
            if (item.lost && (flying || !item.magnet)) {
                // 弹飞期间只沿 easeOutCubic 移动；通关吸附也等落地后再接管。
                const k = Math.min(1, item.age / PLAYER_RULES.lostPartFly), ease = 1 - Math.pow(1 - k, 3);
                const sx = item.sx ?? item.x, sy = item.sy ?? item.y;
                item.x = sx + ((item.tx ?? sx) - sx) * ease;
                item.y = sy + ((item.ty ?? sy) - sy) * ease;
                item.vx = item.vy = 0;
                if (item.age < PLAYER_RULES.lostPartFly) continue;
            }
            if (!item.lost && item.age > item.life && !item.magnet) { item.dead = true; continue; }
            const dx = p.x - item.x, dy = p.y - item.y;
            const d = Math.hypot(dx, dy);
            const coin = item.kind === 'coin' || item.kind === 'coinBig';
            if (p.alive && (coin ? d < PLAYER_RULES.coinMagnetRadius : d < (item.lost ? 90 : 70))) item.magnet = true;
            if (item.magnet && p.alive) {
                // 永久保留的零件可能久置，单帧吸附不能越过玩家。
                const speed = Math.min(900 + item.age * 300, d / Math.max(dt, 1e-4));
                item.vx = dx / (d || 1) * speed; item.vy = dy / (d || 1) * speed;
            } else if (item.lost) {
                item.vx = item.vy = 0;
            } else {
                // 弹出后减速，然后缓慢下落；零件左右轻微摆动，便于辨认。
                item.vx *= Math.pow(0.12, dt);
                item.vy += (-(coin ? 120 : 75) - item.vy) * Math.min(1, dt * 2.2);
                if (item.x < this.bounds.left + 30 || item.x > this.bounds.right - 30) item.vx = -item.vx;
                if (item.y > this.bounds.top - 120 && item.vy > 0) item.vy = -item.vy * 0.4;
            }
            item.x += item.vx * dt;
            item.y += item.vy * dt;
            if (!item.lost && item.y < this.bounds.bottom - 40) { item.dead = true; continue; }
            if (p.alive && d < 38) {
                item.dead = true;
                this.collect(item);
            }
        }
    }

    private collect(item: Pickup): void {
        const p = this.player;
        switch (item.kind) {
            case 'main': case 'wing': case 'special': {
                const slot = item.kind as SlotId;
                if (this.pendingLevel(slot) >= MAX_FIELD_LEVEL) {
                    this.score += 500;
                    p.energy = Math.min(PLAYER_RULES.energyMax, p.energy + 10);
                    this.emit({ type: 'part-full', slot, x: p.x, y: p.y });
                } else {
                    this.assemblies.push({ slot, t: 0, duration: 0.5, fromX: item.x, fromY: item.y });
                    this.emit({ type: 'assemble-start', slot, x: item.x, y: item.y, value: this.pendingLevel(slot) });
                }
                break;
            }
            case 'fire':
                this.buff = 10;
                this.emit({ type: 'fire-buff', x: p.x, y: p.y });
                break;
            case 'repair': {
                // value：1 = 回复了 1 点装甲；0 = 已满血（不额外加分）。
                const healed = p.hp < p.maxHp;
                if (healed) p.hp++;
                this.emit({ type: 'repair', x: p.x, y: p.y, value: healed ? 1 : 0 });
                break;
            }
            case 'coin': case 'coinBig': {
                const v = item.kind === 'coinBig' ? 5 : 1;
                this.coins += v;
                this.emit({ type: 'coin', x: p.x, y: p.y, value: v });
                break;
            }
        }
        this.emit({ type: 'pickup', kind: item.kind, x: p.x, y: p.y });
    }

    private compact(): void {
        this.enemies = this.enemies.filter(e => !e.dead);
        this.pbullets = this.pbullets.filter(b => !b.dead);
        this.ebullets = this.ebullets.filter(b => !b.dead);
        this.pickups = this.pickups.filter(p => !p.dead);
    }
}

export function turnToward(current: number, target: number, maxStep: number): number {
    let d = (target - current) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return current + Math.max(-maxStep, Math.min(maxStep, d));
}
