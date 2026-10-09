import type { SfCombat } from '../../SfCombat';
import type { Enemy, EnemyDef } from '../../SfEnemies';
import type { BossTier, EnemyBullet, Hazard, Vec } from '../../SfTypes';
import { BossScript, ch, type BossInfo } from '../../SfBossBase';
import { DOWN, STYLE, fan, orbitShot, ring, shoot } from '../../SfPatterns';

/** 第 6 章海葵、千眼之主与引力球体的信息（图鉴、警报横幅）。 */
export const CH6_BOSS_INFO_A: Record<string, BossInfo> = {
    anemone: { id: 'anemone', name: '星光海葵', tier: 'small', chapter: 6, frame: 'boss/anemone', intro: '击断触手永久减少弯曲弹流，沿弹流间隙移动，裂隙换边时提前远离出口。' },
    eyelord: { id: 'eyelord', name: '千眼之主', tier: 'mid', chapter: 6, frame: 'boss/eyelord', intro: '离开粉色凝视格并击毁睁开的眼睛削弱本体，中央巨眼蓄力时准备绕过扫射光束。' },
    gravitycore: { id: 'gravitycore', name: '引力球体', tier: 'small', chapter: 6, frame: 'boss/gravitycore', intro: '沿牢笼预告的缺口离开收缩弹环，避开拖拽引力井，利用螺旋两臂之间的空隙持续输出。' },
};

/** 每次独立构造定义，避免从汇总敌人模块导入实值造成循环依赖。 */
function def(id: string, name: string, frame: string, size: 'boss' | 'part', radius: number,
    body: EnemyDef['body'] = 'flesh'): EnemyDef {
    return { id, name, frame, size, radius, hp: 1, score: size === 'part' ? 1200 : 20000,
        energy: size === 'part' ? 10 : 0, coins: size === 'part' ? 3 : 0,
        body, chapter: 6, contact: false, ground: false, intro: name };
}

function warn(c: SfCombat, e: Enemy, seconds: number, kind: string): void {
    e.windup = Math.max(e.windup, seconds);
    c.emit({ type: 'telegraph', x: e.x, y: e.y, kind });
}

/** 危险物与部件归实例所有；只移除自己登记的东西，保留关卡规则的引力井。 */
abstract class VoidBoss extends BossScript {
    protected abstract readonly home: number;
    protected ready = false;
    private phaseStarted = -1;
    private ownedHazards: Hazard[] = [];

    protected hazard(h: Hazard): Hazard {
        this.ownedHazards.push(h);
        return this.c.addHazard(h);
    }

    protected removeHazard(h: Hazard): void {
        this.c.hazards = this.c.hazards.filter(other => other !== h);
        this.ownedHazards = this.ownedHazards.filter(other => other !== h);
    }

    protected retirePart(part: Enemy): void {
        // 自然闭眼与阶段清理不能被基类当作玩家击破，发放能量或触发额外伤害。
        this.parts = this.parts.filter(other => other !== part);
        if (!part.dead) this.c.killEnemy(part, 'mechanic', false);
    }

    protected resetAttackState(): void { }

    private clearEncounterState(): void {
        this.stop('attack'); this.stop('move');
        this.ready = false;
        this.phaseStarted = -1;
        this.core.windup = 0;
        this.core.aimX = this.core.aimY = 0;
        this.c.hazards = this.c.hazards.filter(h => this.ownedHazards.indexOf(h) < 0);
        this.ownedHazards = [];
        // 子类先保存仍存活部件的血量，再断开引用；机械清理不会触发部件回调。
        this.resetAttackState();
        const parts = this.parts;
        this.parts = [];
        for (const part of parts) if (!part.dead) this.c.killEnemy(part, 'mechanic', false);
    }

    update(c: SfCombat, dt: number): void {
        if (this.core.dead) { this.clearEncounterState(); return; }
        this.ownedHazards = this.ownedHazards.filter(h => c.hazards.indexOf(h) >= 0);
        super.update(c, dt);
        // 蓄力、睁眼、传送与公转弹均不遮挡本体；仅保留进场和基类 0.9 秒阶段护盾。
        const damageScale = !this.entering && this.ready ? 1 : 0;
        this.core.damageScale = damageScale;
        for (const part of this.parts) if (!part.dead) part.damageScale = damageScale;
    }

    protected setPhase(phase: number): void {
        this.clearEncounterState();
        super.setPhase(phase);
        this.start(this.moveTo(this.core, (this.c.bounds.left + this.c.bounds.right) / 2,
            this.home, 0.65), 'move');
    }

    protected beginPhase(phase: number): boolean {
        if (phase !== this.phase || this.core.dead || phase === this.phaseStarted) return false;
        this.phaseStarted = phase;
        this.ready = true;
        this.c.scrollSpeed = 20;
        return true;
    }

    protected onBodyKilled(): void { this.clearEncounterState(); }

    onEnemyKilled(c: SfCombat, e: Enemy): void {
        // 核心会先机械销毁子节点、再通知本体死亡；这批子节点同样不算部件击破。
        if (this.core.dead && this.parts.indexOf(e) >= 0) {
            this.parts = this.parts.filter(part => part !== e);
            return;
        }
        super.onEnemyKilled(c, e);
    }

    protected partPoint(part: Enemy): Vec {
        const parent = part.parent ?? this.core;
        return { x: parent.x + part.ox * parent.scale, y: parent.y + part.oy * parent.scale };
    }

    /** 低屏只等比缩放整套本体与部件；摆动幅度另按左右完整轮廓限制。 */
    protected fitScale(halfWidth: number, above: number, below: number): number {
        const c = this.c, top = Math.min(c.bounds.top - 12, c.flight.top + 200);
        return Math.max(0.1, Math.min(1, ((c.bounds.right - c.bounds.left) / 2 - 16) / halfWidth,
            (top - this.home - 8) / above, (this.home - c.flight.bottom - 8) / below));
    }

    protected startSway(halfWidth: number, amplitude: number, speed: number): void {
        const room = (this.c.bounds.right - this.c.bounds.left) / 2 - halfWidth * this.core.scale - 16;
        this.start(this.sway(this.core, Math.max(0, Math.min(amplitude, room)), speed, this.home, 7), 'move');
    }

    /** 使用模拟时间，避免 yield 0.13 被基类等待器量化成更长的发射周期。 */
    protected *wait(seconds: number): Generator<number> {
        const until = this.time + seconds;
        while (this.time < until) yield 0;
    }
}

// ───────────────────────────── 6-1 星光海葵 ─────────────────────────────

interface Tentacle {
    baseAngle: number;
    index: number;
    broken: boolean;
    hpRatio: number;
    enemy?: Enemy;
}

interface RiftShot { bullet: EnemyBullet; target: Vec; scatter: number; turn: number }

class Anemone extends VoidBoss {
    readonly id = 'anemone';
    readonly name = '星光海葵';
    readonly tier: BossTier = 'small';
    protected readonly home: number;
    private readonly tentacles: Tentacle[] = [-56, -28, 0, 28, 56].map((degrees, index) => ({
        baseAngle: degrees * Math.PI / 180, index, broken: false, hpRatio: 1,
    }));
    private riftShots: RiftShot[] = [];
    private portalSide = 1;
    private portalWarn = 1;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.home = ch(c, 0.76);
        const core = this.spawnBody(def(this.id, this.name, 'boss/anemone', 'boss', 60),
            (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 180, this.hpFor('small'));
        core.scale = this.fitScale(228, 110, 240);
        core.radius = 60 * core.scale;
        this.spawnTentacles();
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, this.home, 1.8), 'move');
    }

    private tentacleAngle(t: Tentacle): number {
        return t.baseAngle + Math.sin(this.time * 0.8 + t.index * 1.3) * 12 * Math.PI / 180;
    }

    private syncTentacle(t: Tentacle): void {
        const e = t.enemy;
        if (!e || e.dead) return;
        const angle = this.tentacleAngle(t);
        // 正角把朝下精灵转向右侧；根在半径 60 的体缘，中心在根外 80，尖端再外 80。
        e.angle = angle;
        e.ox = Math.sin(angle) * 140;
        e.oy = -Math.cos(angle) * 140;
        e.scale = this.core.scale;
        const p = this.partPoint(e);
        e.x = p.x; e.y = p.y;
    }

    private tentacleTip(t: Tentacle): Vec {
        const angle = this.tentacleAngle(t), reach = 220 * this.core.scale;
        return { x: this.core.x + Math.sin(angle) * reach, y: this.core.y - Math.cos(angle) * reach };
    }

    private spawnTentacles(): void {
        for (const t of this.tentacles) {
            if (t.broken || (t.enemy && !t.enemy.dead)) continue;
            const e = this.spawnPart(def(`anemone-tentacle-${t.index}`, '星光触手',
                'boss/anemone-tentacle', 'part', 18), this.core, 0, -140, this.hpFor('small') * 0.08);
            e.partTag = 'tentacle';
            e.radius *= this.core.scale;
            e.hp = Math.max(1, e.maxHp * t.hpRatio);
            t.enemy = e;
            this.syncTentacle(t);
        }
    }

    update(c: SfCombat, dt: number): void {
        super.update(c, dt);
        if (this.core.dead) return;
        for (const t of this.tentacles) this.syncTentacle(t);
        const pending: RiftShot[] = [];
        for (const shot of this.riftShots) {
            const b = shot.bullet;
            if (b.dead || c.ebullets.indexOf(b) < 0) continue;
            if (!(b.warp && b.warp > 0)) { pending.push(shot); continue; }
            // 通用裂隙保留速度方向。只在本实例汇聚弹实际传送后转向一次，绝不改写裂隙规则。
            const speed = Math.hypot(b.vx, b.vy);
            const angle = Math.atan2(shot.target.y - b.y, shot.target.x - b.x) + shot.scatter;
            b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
            b.angle = angle; b.turn = shot.turn;
            // 出口附近也给出闪烁窗口，不能在传送当帧无预警地压中玩家。
            b.delay = Math.max(b.delay, 0.25);
        }
        this.riftShots = pending;
    }

    protected resetAttackState(): void {
        this.riftShots = [];
        this.portalWarn = 1;
        for (const t of this.tentacles) {
            if (t.enemy && !t.enemy.dead) t.hpRatio = t.enemy.hp / t.enemy.maxHp;
            t.enemy = undefined;
        }
    }

    onPartDestroyed(part: Enemy): void {
        const t = this.tentacles.find(slot => slot.enemy === part);
        if (!t) return;
        t.broken = true;
        t.enemy = undefined;
        this.parts = this.parts.filter(e => e !== part);
    }

    onPhase(phase: number): void {
        if (!this.beginPhase(phase)) return;
        this.spawnTentacles();
        this.startSway(228, 90, 0.35);
        if (phase === 1) this.start(this.portals(), 'attack');
        this.start(this.streams(), 'attack');
        this.start(this.stars(), 'attack');
        if (phase === 1) this.start(this.rings(), 'attack');
    }

    private portalEnds(): { a: Vec; b: Vec } {
        return { a: { x: this.core.x, y: this.core.y - 170 * this.core.scale },
            b: { x: this.portalSide < 0 ? this.c.bounds.left + 90 : this.c.bounds.right - 90, y: ch(this.c, 0.32) } };
    }

    private *portals(): Generator<number> {
        this.portalSide = this.c.rng.sign();
        let changed = this.time;
        warn(this.c, this.core, 0.8, 'anemone-portal');
        while (!this.core.dead && this.phase === 1) {
            if (this.time - changed >= 6) {
                this.portalSide *= -1;
                changed = this.time;
                warn(this.c, this.core, 0.8, 'anemone-portal');
            }
            const { a, b } = this.portalEnds();
            this.portalWarn = Math.max(0, 1 - (this.time - changed) / 0.8);
            if (this.time === changed) this.c.emit({ type: 'telegraph', ...b, kind: 'anemone-portal-exit' });
            this.hazard({ kind: 'portal', ax: a.x, ay: a.y, bx: b.x, by: b.y, width: 46, warn: this.portalWarn });
            yield 0;
        }
    }

    /** 2.4 秒开启、1.6 秒关闭；关闭的最后 0.5 秒用于下一轮蓄力。 */
    private *streams(): Generator<number> {
        yield* this.wait(0.65);
        while (!this.core.dead) {
            const next = this.time + 4, target = { x: this.c.player.x, y: this.c.player.y };
            for (const t of this.tentacles) if (t.enemy && !t.enemy.dead) {
                this.syncTentacle(t);
                warn(this.c, t.enemy, 0.5, 'anemone-tentacle-stream');
            }
            warn(this.c, this.core, 0.5, 'anemone-stream');
            yield* this.wait(0.5);
            const start = this.time;
            let volley = 0;
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'anemone-stream' });
            while (this.time - start < 2.4) {
                while (volley * 0.13 <= this.time - start + 0.000001 && volley * 0.13 < 2.4) {
                    for (const t of this.tentacles) {
                        if (!t.enemy || t.enemy.dead) continue;
                        const p = this.tentacleTip(t), turn = (t.index % 2 ? -1 : 1) * 0.55;
                        const throughRift = this.phase === 1 && this.portalWarn === 0;
                        const a = this.portalEnds().a;
                        const angle = throughRift ? Math.atan2(a.y - p.y, a.x - p.x) + this.c.rng.range(-0.025, 0.025)
                            : DOWN + this.tentacleAngle(t);
                        const bullet = shoot(this.c, p.x, p.y, angle, 210,
                            { ...STYLE.voidorb, turn: throughRift ? 0 : turn, life: 6 });
                        if (throughRift) this.riftShots.push({ bullet, target,
                            scatter: (t.index - 2) * 0.035, turn });
                    }
                    volley++;
                }
                yield 0;
            }
            while (this.time < next) yield 0;
        }
    }

    private *stars(): Generator<number> {
        yield* this.wait(1.3);
        while (!this.core.dead) {
            const next = this.time + 3.4, target = { x: this.c.player.x, y: this.c.player.y };
            warn(this.c, this.core, 0.45, 'anemone-star-fan');
            yield* this.wait(0.45);
            const x = this.core.x, y = this.core.y - 54 * this.core.scale;
            fan(this.c, x, y, Math.atan2(target.y - y, target.x - x), 3, 36, 160, STYLE.voidstar);
            this.c.emit({ type: 'boss-attack', x, y, kind: 'anemone-star-fan' });
            while (this.time < next) yield 0;
        }
    }

    private *rings(): Generator<number> {
        yield* this.wait(2);
        while (!this.core.dead) {
            const next = this.time + 3, target = { x: this.c.player.x, y: this.c.player.y };
            warn(this.c, this.core, 0.5, 'anemone-orb-ring');
            yield* this.wait(0.5);
            // 把预告时的玩家方向放在两枚弹之间，12 弹间隔 30°。
            ring(this.c, this.core.x, this.core.y, 12, 120,
                Math.atan2(target.y - this.core.y, target.x - this.core.x) - Math.PI / 12, STYLE.voidorb);
            this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'anemone-orb-ring' });
            while (this.time < next) yield 0;
        }
    }
}

// ───────────────────────────── 6-2 千眼之主 ─────────────────────────────

interface OpenEye { enemy: Enemy; slot: number; zone?: Hazard; line?: Hazard }

class EyeLord extends VoidBoss {
    readonly id = 'eyelord';
    readonly name = '千眼之主';
    readonly tier: BossTier = 'mid';
    protected readonly home: number;
    private readonly eyeOffsets: Vec[] = [
        { x: -86, y: 26 }, { x: -48, y: -28 }, { x: 0, y: 42 },
        { x: 48, y: -28 }, { x: 86, y: 26 }, { x: 0, y: -10 },
    ];
    private eyes: OpenEye[] = [];
    private bigEye?: Enemy;
    private bigLine?: Hazard;
    private reopenAt = 0;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.66, 0.33);
        this.home = ch(c, 0.80);
        const core = this.spawnBody(def(this.id, this.name, 'boss/eyelord', 'boss', 90),
            (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 210, this.hpFor('mid'));
        core.scale = this.fitScale(150, 150, 150);
        core.radius *= core.scale;
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, this.home, 2), 'move');
    }

    protected resetAttackState(): void {
        this.eyes = [];
        this.bigEye = undefined;
        this.bigLine = undefined;
        this.reopenAt = this.time;
    }

    onPhase(phase: number): void {
        if (!this.beginPhase(phase)) return;
        this.startSway(150, 75, 0.3);
        this.start(this.openEyes(), 'attack');
        this.start(this.needles(), 'attack');
        if (phase === 2) this.start(this.centralEye(), 'attack');
    }

    private spawnEye(slot: number, big = false): Enemy {
        const offset = this.eyeOffsets[slot];
        const eye = this.spawnPart(def(big ? 'eyelord-bigeye' : `eyelord-eye-${slot}`, big ? '中央巨眼' : '凝视之眼',
            'boss/eyelord-eye', 'part', big ? 40 : 26), this.core, offset.x, offset.y,
        this.hpFor('mid') * (big ? 0.1 : 0.06));
        eye.partTag = big ? 'bigeye' : 'eye';
        eye.scale = (big ? 2 : 1) * this.core.scale;
        eye.radius *= this.core.scale;
        eye.damageScale = 1;
        return eye;
    }

    private *openEyes(): Generator<number> {
        yield* this.wait(0.5);
        while (!this.core.dead) {
            const next = this.time + (this.phase === 2 ? 3 : 2.6);
            const available = this.eyeOffsets.map((_p, i) => i).filter(i =>
                !(this.bigEye && !this.bigEye.dead && i === 5) && !this.eyes.some(eye => eye.slot === i && !eye.enemy.dead));
            const count = this.phase === 1 ? 2 : 1;
            for (let i = 0; i < count && available.length; i++) {
                const slot = available.splice(this.c.rng.int(0, available.length - 1), 1)[0];
                const state: OpenEye = { enemy: this.spawnEye(slot), slot };
                this.eyes.push(state);
                warn(this.c, state.enemy, 0.4, 'eyelord-eye-open');
                this.start(this.eyeLife(state, i === 1), 'attack');
            }
            while (this.time < next) yield 0;
        }
    }

    private cancelGaze(eye: OpenEye): void {
        if (eye.zone) this.removeHazard(eye.zone);
        if (eye.line) this.removeHazard(eye.line);
        eye.zone = eye.line = undefined;
    }

    private *eyeLife(eye: OpenEye, neighbor: boolean): Generator<number> {
        const closeAt = this.time + 3;
        yield* this.wait(0.4);
        if (eye.enemy.dead) return;
        yield* this.gaze(eye, neighbor);
        while (!eye.enemy.dead && this.time < closeAt) yield 0;
        this.cancelGaze(eye);
        this.eyes = this.eyes.filter(other => other !== eye);
        this.retirePart(eye.enemy);
    }

    private gazeCell(neighbor: boolean): { a: Vec; b: Vec; center: Vec } {
        const c = this.c, width = (c.bounds.right - c.bounds.left) / 3;
        const height = (ch(c, 0.6) - c.bounds.bottom) / 4;
        let column = Math.max(0, Math.min(2, Math.floor((c.player.x - c.bounds.left) / width)));
        const row = Math.max(0, Math.min(3, Math.floor((c.player.y - c.bounds.bottom) / height)));
        if (neighbor) {
            // 边列取中列；中心列以玩家相对中心的位置决定邻列，始终留下一整列退路。
            column = column === 0 ? 1 : column === 2 ? 1 : c.player.x < (c.bounds.left + c.bounds.right) / 2 ? 2 : 0;
        }
        const a = { x: c.bounds.left + column * width, y: c.bounds.bottom + row * height };
        const b = { x: a.x + width, y: a.y + height };
        return { a, b, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }

    private *gaze(eye: OpenEye, neighbor: boolean): Generator<number> {
        const c = this.c, cell = this.gazeCell(neighbor), start = this.time;
        eye.zone = this.hazard({ kind: 'zone', ax: cell.a.x, ay: cell.a.y, bx: cell.b.x, by: cell.b.y,
            width: 0, tint: '#FF5AC8', warn: 1, warnTime: 1, life: 1 });
        const p = this.partPoint(eye.enemy);
        eye.enemy.x = p.x; eye.enemy.y = p.y;
        warn(c, eye.enemy, 1, 'eyelord-gaze');
        while (!eye.enemy.dead && this.time - start < 1) {
            const from = this.partPoint(eye.enemy);
            // 没有 life 的细线每帧重登，warn 始终为 1，绝不升级成伤害光束。
            eye.line = this.hazard({ kind: 'laser', ax: from.x, ay: from.y,
                bx: cell.center.x, by: cell.center.y, width: 2, warn: 1, tint: '#FF5AC8' });
            yield 0;
        }
        this.cancelGaze(eye);
        if (eye.enemy.dead || this.core.dead) return;
        const insetX = Math.min(18, (cell.b.x - cell.a.x) / 4), insetY = Math.min(18, (cell.b.y - cell.a.y) / 4);
        for (let i = 0; i < 12; i++) shoot(c,
            c.rng.range(cell.a.x + insetX, cell.b.x - insetX), c.rng.range(cell.a.y + insetY, cell.b.y - insetY),
            c.rng.range(0, Math.PI * 2), c.rng.range(50, 110), { ...STYLE.voidorb, delay: 0.15, life: 2.4 });
        c.emit({ type: 'boss-attack', ...cell.center, kind: 'eyelord-gaze-rift' });
    }

    onPartDestroyed(part: Enemy): void {
        const eye = this.eyes.find(state => state.enemy === part);
        const central = part === this.bigEye;
        if (!eye && !central) return;
        if (eye) {
            this.cancelGaze(eye);
            this.eyes = this.eyes.filter(state => state !== eye);
        }
        if (central) {
            if (this.bigLine) this.removeHazard(this.bigLine);
            this.bigLine = undefined;
            this.bigEye = undefined;
            this.reopenAt = this.time + 6;
        }
        this.parts = this.parts.filter(e => e !== part);
        if (!this.core.dead) {
            // 击破睁眼只削弱本体，保留至少 1 HP，让正常火力完成击杀。
            this.core.hp = Math.max(1, this.core.hp - this.core.maxHp * 0.05);
            this.core.hitFlash = 0.2;
            this.c.emit({ type: 'hit', x: this.core.x, y: this.core.y, kind: 'flesh', size: 2 });
        }
    }

    private *needles(): Generator<number> {
        yield* this.wait(1.25);
        while (!this.core.dead) {
            const next = this.time + 2.2, target = { x: this.c.player.x, y: this.c.player.y };
            warn(this.c, this.core, 0.4, 'eyelord-needle-fan');
            yield* this.wait(0.4);
            const x = this.core.x, y = this.core.y - 65 * this.core.scale;
            fan(this.c, x, y, Math.atan2(target.y - y, target.x - x), 5, 60, 230, STYLE.voidneedle);
            this.c.emit({ type: 'boss-attack', x, y, kind: 'eyelord-needle-fan' });
            while (this.time < next) yield 0;
        }
    }

    private *centralEye(): Generator<number> {
        while (!this.core.dead && this.phase === 2) {
            if (!this.bigEye && this.time >= this.reopenAt) {
                this.bigEye = this.spawnEye(5, true);
                this.start(this.eyeSweeps(this.bigEye), 'attack');
            }
            yield 0;
        }
    }

    /** 巨眼光束只射到场地中部（560 像素）：扫射覆盖整个横向，躲法是退到下半场，而不是穿过光束。 */
    private laser(eye: Enemy, angle: number, warning: number): Hazard {
        const p = this.partPoint(eye);
        const length = Math.min(560, Math.max(0, p.y - this.c.bounds.bottom) / Math.max(0.001, -Math.sin(angle)));
        return this.hazard({ kind: 'laser', ax: p.x, ay: p.y,
            bx: p.x + Math.cos(angle) * length, by: p.y + Math.sin(angle) * length, width: 14, warn: warning });
    }

    private *eyeSweeps(eye: Enemy): Generator<number> {
        yield* this.wait(0.8);
        const half = 50 * Math.PI / 180;
        while (!eye.dead && !this.core.dead && this.phase === 2) {
            const next = this.time + 4, preview = this.time;
            const p = this.partPoint(eye);
            eye.x = p.x; eye.y = p.y;
            warn(this.c, eye, 0.8, 'eyelord-central-laser');
            while (!eye.dead && this.time - preview < 0.8) {
                const u = Math.min(1, (this.time - preview) / 0.8);
                this.bigLine = this.laser(eye, DOWN - half + 2 * half * u, Math.max(0.001, 1 - u));
                yield 0;
            }
            if (eye.dead) return;
            const start = this.time;
            this.c.emit({ type: 'boss-attack', ...this.partPoint(eye), kind: 'eyelord-central-laser' });
            while (!eye.dead && this.time - start < 2.4) {
                const u = Math.min(1, (this.time - start) / 2.4);
                this.bigLine = this.laser(eye, DOWN - half + 2 * half * u, 0);
                yield 0;
            }
            if (this.bigLine) this.removeHazard(this.bigLine);
            this.bigLine = undefined;
            while (!eye.dead && this.time < next) yield 0;
        }
    }
}

// ───────────────────────────── 6-3 引力球体 ─────────────────────────────

class GravityCore extends VoidBoss {
    readonly id = 'gravitycore';
    readonly name = '引力球体';
    readonly tier: BossTier = 'small';
    protected readonly home: number;

    constructor(c: SfCombat) {
        super(c);
        this.thresholds.push(0.5);
        this.home = ch(c, 0.78);
        const core = this.spawnBody(def(this.id, this.name, 'boss/gravitycore', 'boss', 64, 'metal'),
            (c.bounds.left + c.bounds.right) / 2, c.bounds.top + 180, this.hpFor('small'));
        core.scale = this.fitScale(110, 110, 110);
        core.radius *= core.scale;
        this.start(this.enter((c.bounds.left + c.bounds.right) / 2, this.home, 1.8), 'move');
    }

    onPhase(phase: number): void {
        if (!this.beginPhase(phase)) return;
        this.startSway(110, 90, 0.4);
        this.start(this.wells(), 'attack');
        this.start(this.cagesAndSpirals(), 'attack');
        if (phase === 1) this.start(this.stars(), 'attack');
    }

    private wellTarget(offset = 0): Vec {
        const c = this.c;
        return { x: Math.max(c.bounds.left + 40, Math.min(c.bounds.right - 40, c.player.x + offset)),
            y: Math.max(c.bounds.bottom + 40, Math.min(c.bounds.top - 40, c.player.y + 220)) };
    }

    /** 五秒一轮：前 0.8 秒固定位置显示，之后每秒最多移动 60 像素追向玩家上方。 */
    private *wells(): Generator<number> {
        while (!this.core.dead) {
            const start = this.time, point = this.wellTarget(this.c.rng.sign() * 100);
            warn(this.c, this.core, 0.8, 'gravitycore-well');
            this.c.emit({ type: 'telegraph', ...point, kind: 'gravitycore-well' });
            while (this.time - start < 5) {
                const elapsed = this.time - start;
                if (elapsed >= 0.8) {
                    const target = this.wellTarget(), dx = target.x - point.x, dy = target.y - point.y;
                    const distance = Math.hypot(dx, dy), step = Math.min(distance, 60 * this.dt);
                    if (distance > 0.001) { point.x += dx / distance * step; point.y += dy / distance * step; }
                }
                this.hazard({ kind: 'well', ax: point.x, ay: point.y, bx: point.x, by: point.y,
                    width: 200, pull: 1500, drag: this.phase === 1 ? 70 : 0,
                    warn: elapsed < 0.8 ? Math.max(0.001, 1 - elapsed / 0.8) : 0 });
                yield 0;
            }
        }
    }

    private angleDistance(a: number, b: number): number {
        const distance = Math.abs(a - b) % (Math.PI * 2);
        return distance > Math.PI ? Math.PI * 2 - distance : distance;
    }

    /** 优先选择通向玩家活动区的出口；排除朝上及直冲 Boss 的方向。双环出口至少相隔 90°。 */
    private cageGap(center: Vec, radius: number, other?: number): number {
        const c = this.c, bossDirection = Math.atan2(this.core.y - center.y, this.core.x - center.x);
        let best = DOWN, bestRoom = -Infinity;
        for (let i = 0; i < 96; i++) {
            const angle = c.rng.range(-Math.PI, Math.PI);
            if (this.angleDistance(angle, Math.PI / 2) < Math.PI / 6 ||
                this.angleDistance(angle, bossDirection) < Math.PI / 8 ||
                (other !== undefined && this.angleDistance(angle, other) < Math.PI / 2)) continue;
            const x = center.x + Math.cos(angle) * radius, y = center.y + Math.sin(angle) * radius;
            const room = Math.min(x - c.flight.left, c.flight.right - x, y - c.flight.bottom, c.flight.top - y);
            if (room > bestRoom) { best = angle; bestRoom = room; }
            if (room >= 18) return angle;
        }
        // 角落里的第二环不一定有整条径向通路；选越界最少的一侧，稀疏弹距与反向公转仍留退路。
        return best;
    }

    private cagePreview(center: Vec, radius: number, gap: number): void {
        this.hazard({ kind: 'pulse', ax: center.x, ay: center.y, bx: center.x, by: center.y,
            radius, width: 8, speed: 0, gap, gapWidth: Math.PI * 3 / 16, warn: 1, warnTime: 0.8, life: 0.8 });
    }

    private spawnCage(center: Vec, radius: number, gap: number, spin: number): void {
        // 十六个槽位跳过连续三槽：实发十三枚，缺口随整环旋转，不在蓄力结束后重锁玩家位置。
        for (let i = 0; i < 16; i++) {
            if (i === 0 || i === 1 || i === 15) continue;
            orbitShot(this.c, center.x, center.y, radius, gap + Math.PI * 2 * i / 16,
                spin * 0.9, -48, { ...STYLE.voidorb, delay: 0.6 });
        }
    }

    private *cage(): Generator<number> {
        const center = { x: this.c.player.x, y: this.c.player.y }, spin = this.c.rng.sign();
        const radius = this.phase === 1 ? 300 : 280;
        const gap = this.cageGap(center, radius), second = this.phase === 1 ? this.cageGap(center, 200, gap) : undefined;
        warn(this.c, this.core, 0.8, 'gravitycore-cage');
        this.c.emit({ type: 'telegraph', ...center, size: radius, kind: 'gravitycore-cage' });
        this.cagePreview(center, radius, gap);
        if (second !== undefined) this.cagePreview(center, 200, second);
        yield* this.wait(0.8);
        this.spawnCage(center, radius, gap, spin);
        if (second !== undefined) this.spawnCage(center, 200, second, -spin);
        this.c.emit({ type: 'boss-attack', ...center, kind: 'gravitycore-cage' });
    }

    private *spiral(): Generator<number> {
        warn(this.c, this.core, 0.4, 'gravitycore-spiral');
        yield* this.wait(0.4);
        const start = this.time, angle = this.c.rng.range(-Math.PI, Math.PI);
        let volley = 0;
        this.c.emit({ type: 'boss-attack', x: this.core.x, y: this.core.y, kind: 'gravitycore-spiral' });
        while (this.time - start < 2) {
            while (volley < 20 && volley * 0.1 <= this.time - start + 0.000001) {
                for (const arm of [0, Math.PI]) shoot(this.c, this.core.x, this.core.y - 45 * this.core.scale,
                    angle + volley * 0.3 + arm, 170, STYLE.voidorb);
                volley++;
            }
            yield 0;
        }
    }

    private *cagesAndSpirals(): Generator<number> {
        yield* this.wait(0.7);
        while (!this.core.dead) {
            const next = this.time + 5;
            yield* this.cage();
            yield* this.wait(0.6);
            yield* this.spiral();
            while (this.time < next) yield 0;
        }
    }

    private *stars(): Generator<number> {
        yield* this.wait(1.4);
        while (!this.core.dead) {
            const next = this.time + 2.5, target = { x: this.c.player.x, y: this.c.player.y };
            warn(this.c, this.core, 0.45, 'gravitycore-star-fan');
            yield* this.wait(0.45);
            const x = this.core.x, y = this.core.y - 50 * this.core.scale;
            fan(this.c, x, y, Math.atan2(target.y - y, target.x - x), 3, 40, 150, STYLE.voidstar);
            this.c.emit({ type: 'boss-attack', x, y, kind: 'gravitycore-star-fan' });
            while (this.time < next) yield 0;
        }
    }
}

/** 创建第 6 章本组 Boss；不属于本文件的 id 返回 null。 */
export function createCh6BossA(id: string, c: SfCombat): BossScript | null {
    switch (id) {
        case 'anemone': return new Anemone(c);
        case 'eyelord': return new EyeLord(c);
        case 'gravitycore': return new GravityCore(c);
        default: return null;
    }
}
