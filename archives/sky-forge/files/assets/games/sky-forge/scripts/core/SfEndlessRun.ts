import { MAX_PART_LEVEL, MAX_PLANE_LEVEL, type SlotId } from './SfBalance';
import { SfCombat } from './SfCombat';
import { endlessSector } from './SfEndless';
import { PLANE_BY_ID } from './SfPlaneDefs';
import type { CombatEvent, PlaneId, Vec } from './SfTypes';

const STEP = 1 / 60;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const enum Op { Release, Target, Bounds, Ultimate, Revive }
type Bounds = [number, number, number, number, number, number];

export interface EndlessStart {
    plane: PlaneId;
    planeLevel: number;
    parts: Record<SlotId, number>;
    hearts: number;
    seed: number;
    combatSeed: number;
    /** 本局出发前的距离纪录，用于飞行中更新纪录后仍能正确展示结算“新纪录”。 */
    bestDistance?: number;
}

/**
 * 操作流版本：战斗逻辑发生不兼容变更（敌人、编排、机体武器）时递增，旧续局按异常续局丢弃。
 * 2：M2.5 新敌人 / 场地危险物 / 曙光激光 / 第 2、3 章重编排。
 */
export const REPLAY_VERSION = 2;

/** 完整续局使用种子 + 压缩操作流，重建生成器编排的 Boss、延迟任务与武器状态。 */
export interface EndlessRunSave extends EndlessStart {
    version: typeof REPLAY_VERSION;
    frames: number;
    input: string;
    distance: number;
    sector: number;
    score: number;
    coins: number;
    hp: number;
    reviveUsed: boolean;
}

function encode(bytes: readonly number[]): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
        out += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]
            + (b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)])
            + (c === undefined ? '=' : ALPHABET[c & 63]);
    }
    return out;
}

function decode(input: string): number[] {
    if (input.length % 4) throw new Error('Invalid endless input');
    const out: number[] = [];
    for (let i = 0; i < input.length; i += 4) {
        const a = ALPHABET.indexOf(input[i]), b = ALPHABET.indexOf(input[i + 1]);
        const c = ALPHABET.indexOf(input[i + 2]), d = ALPHABET.indexOf(input[i + 3]);
        const last = i + 4 === input.length;
        if (a < 0 || b < 0 || (c < 0 && !(last && input[i + 2] === '=' && input[i + 3] === '=' && !(b & 15)))
            || (d < 0 && !(last && input[i + 3] === '=' && (c < 0 || !(c & 3))))) throw new Error('Invalid endless input');
        out.push((a << 2) | (b >> 4));
        if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
        if (d >= 0) out.push(((c & 3) << 6) | d);
    }
    return out;
}

interface Action { frame: number; op: Op; values: number[] }

class Reader {
    private offset = 0;
    frame = 0;
    constructor(readonly bytes: number[]) { }
    private byte(): number {
        if (this.offset >= this.bytes.length) throw new Error('Truncated endless input');
        return this.bytes[this.offset++];
    }
    private uint(): number {
        let value = 0, shift = 0;
        for (let i = 0; i < 5; i++) {
            const b = this.byte(); value += (b & 127) * Math.pow(2, shift);
            if (!(b & 128)) return value;
            shift += 7;
        }
        throw new Error('Invalid endless number');
    }
    next(): Action | undefined {
        if (this.offset === this.bytes.length) return undefined;
        this.frame += this.uint();
        const op = this.byte();
        if (op > Op.Revive) throw new Error('Invalid endless operation');
        const values: number[] = [];
        if (op === Op.Target) {
            for (let i = 0; i < 2; i++) { const v = this.uint(); values.push((v & 1 ? -(v + 1) / 2 : v / 2) / 4); }
        } else if (op === Op.Bounds) {
            const data = new DataView(new ArrayBuffer(48));
            for (let i = 0; i < 48; i++) data.setUint8(i, this.byte());
            for (let i = 0; i < 6; i++) values.push(data.getFloat64(i * 8, true));
        }
        if (values.some(v => !Number.isFinite(v) || Math.abs(v) > 100000)) throw new Error('Invalid endless coordinates');
        if (op === Op.Bounds && (values[0] >= values[1] || values[2] <= values[3] || values[4] <= values[5])) throw new Error('Invalid endless bounds');
        return { frame: this.frame, op, values };
    }
}

/** 异常或不兼容的续局不会影响已有金币、关卡星级和机体存档。 */
export function sanitizeEndlessRun(raw: unknown): EndlessRunSave | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as EndlessRunSave;
    const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    if (r.version !== REPLAY_VERSION || !PLANE_BY_ID[r.plane]?.implemented || !integer(r.planeLevel, 1, MAX_PLANE_LEVEL)
        || !integer(r.hearts, 1, 30) || !integer(r.seed, -2147483648, 2147483647) || !integer(r.combatSeed, -2147483648, 2147483647)
        || !integer(r.frames, 0, 10000000) || !integer(r.sector, 1, 100000)
        || !integer(r.distance, 0, 1e9) || !integer(r.score, 0, 1e12) || !integer(r.coins, 0, 1e9)
        || !integer(r.hp, 0, r.hearts) || typeof r.reviveUsed !== 'boolean' || typeof r.input !== 'string'
        || !r.parts || !(['main', 'wing', 'special'] as const).every(s => integer(r.parts[s], 1, MAX_PART_LEVEL))) return undefined;
    try {
        const reader = new Reader(decode(r.input));
        let a: Action | undefined;
        while ((a = reader.next())) if (a.frame > r.frames) return undefined;
    } catch { return undefined; }
    return {
        version: REPLAY_VERSION, plane: r.plane, planeLevel: r.planeLevel,
        parts: { main: r.parts.main, wing: r.parts.wing, special: r.parts.special }, hearts: r.hearts,
        seed: r.seed, combatSeed: r.combatSeed, frames: r.frames, input: r.input,
        distance: r.distance, sector: r.sector, score: r.score, coins: r.coins, hp: r.hp, reviveUsed: r.reviveUsed,
        bestDistance: typeof r.bestDistance === 'number' && Number.isFinite(r.bestDistance) ? Math.floor(Math.max(0, Math.min(1e9, r.bestDistance))) : 0,
    };
}

/** 输入只在改变时记录；四分之一设计像素精度，变长整数编码减少长局存档体积。 */
export class SfEndlessRun {
    readonly start: EndlessStart;
    private readonly bytes: number[];
    private lastFrame = 0;
    private target: Vec | null | undefined;
    frames = 0;

    constructor(start: EndlessStart, saved?: EndlessRunSave) {
        this.start = { plane: start.plane, planeLevel: start.planeLevel, parts: { ...start.parts }, hearts: start.hearts,
            seed: start.seed, combatSeed: start.combatSeed, bestDistance: start.bestDistance ?? 0 };
        this.bytes = saved ? decode(saved.input) : [];
        this.frames = saved?.frames ?? 0;
        if (saved) {
            const reader = new Reader(this.bytes);
            while (reader.next()) { /* 找到末次操作，继续写入帧差。 */ }
            this.lastFrame = reader.frame;
        }
    }

    createCombat(): SfCombat {
        const s = this.start, first = endlessSector(1, s.seed);
        return new SfCombat({
            plane: s.plane, planeLevel: s.planeLevel, parts: { ...s.parts }, hearts: s.hearts,
            level: first.level, seed: s.combatSeed, hiddenBoss: false,
            endless: sector => endlessSector(sector, s.seed), difficulty: first.difficulty,
        });
    }

    private uint(value: number): void {
        while (value >= 128) { this.bytes.push((value % 128) | 128); value = Math.floor(value / 128); }
        this.bytes.push(value);
    }
    private record(op: Op): void {
        this.uint(this.frames - this.lastFrame);
        this.bytes.push(op);
        this.lastFrame = this.frames;
    }

    step(c: SfCombat, target: Vec | null): void {
        const p = target ? { x: Math.round(target.x * 4) / 4, y: Math.round(target.y * 4) / 4 } : null;
        if (this.target === undefined || p?.x !== this.target?.x || p?.y !== this.target?.y || !!p !== !!this.target) {
            this.record(p ? Op.Target : Op.Release);
            if (p) for (const v of [p.x, p.y]) { const n = v * 4; this.uint(n < 0 ? -n * 2 - 1 : n * 2); }
            this.target = p;
        }
        c.step(STEP, p);
        this.frames++;
    }

    setBounds(c: SfCombat, ...bounds: Bounds): void {
        this.record(Op.Bounds);
        const data = new DataView(new ArrayBuffer(48));
        bounds.forEach((v, i) => data.setFloat64(i * 8, v, true));
        for (let i = 0; i < 48; i++) this.bytes.push(data.getUint8(i));
        c.setBounds(...bounds);
    }

    ultimate(c: SfCombat): boolean {
        if (!c.requestUltimate()) return false;
        this.record(Op.Ultimate);
        return true;
    }

    revive(c: SfCombat): void { c.revive(); this.record(Op.Revive); }

    snapshot(c: SfCombat, reviveUsed: boolean): EndlessRunSave {
        return {
            ...this.start, parts: { ...this.start.parts }, version: REPLAY_VERSION, frames: this.frames, input: encode(this.bytes),
            distance: Math.floor(c.distance), sector: c.sector, score: c.score, coins: c.coins, hp: c.player.hp, reviveUsed,
        };
    }
}

/** 分帧重建纯战斗逻辑，起飞台动画持续响应；重放事件不触发奖励、声音或演出。 */
export class SfEndlessRestore {
    readonly run: SfEndlessRun;
    readonly combat: SfCombat;
    private readonly reader: Reader;
    private action?: Action;
    private frame = 0;
    private target: Vec | null = null;
    private readonly warnings: { event: CombatEvent; until: number }[] = [];
    done = false;

    constructor(private readonly saved: EndlessRunSave) {
        this.run = new SfEndlessRun(saved, saved);
        this.combat = this.run.createCombat();
        this.reader = new Reader(decode(saved.input));
        this.action = this.reader.next();
    }

    get resumeWarnings(): CombatEvent[] {
        return this.warnings.filter(w => w.until > this.frame).map(w => ({ ...w.event, value: (w.until - this.frame) * STEP }));
    }

    get progress(): number { return this.saved.frames > 0 ? this.frame / this.saved.frames : this.done ? 1 : 0; }

    private drainEvents(): void {
        for (const event of this.combat.drainEvents()) {
            if (event.type === 'sector') this.warnings.length = 0;
            else if (event.type === 'strike') {
                for (let i = this.warnings.length - 1; i >= 0; i--) {
                    const e = this.warnings[i].event;
                    if (e.type === 'strike-warn' && Math.abs((e.x ?? 0) - (event.x ?? 0)) < 1) this.warnings.splice(i, 1);
                }
            } else if (event.type === 'strike-warn' || event.type === 'telegraph') {
                const life = event.type === 'strike-warn' ? event.value ?? 1 : 0.35;
                this.warnings.push({ event, until: this.frame + Math.ceil(life / STEP) });
            }
        }
        for (let i = this.warnings.length - 1; i >= 0; i--) if (this.warnings[i].until <= this.frame) this.warnings.splice(i, 1);
    }

    advance(budgetMs = 6): void {
        if (this.done) return;
        const until = Date.now() + budgetMs, c = this.combat;
        do {
            while (this.action?.frame === this.frame) {
                const a = this.action;
                switch (a.op) {
                    case Op.Release: this.target = null; break;
                    case Op.Target: this.target = { x: a.values[0], y: a.values[1] }; break;
                    case Op.Bounds: c.setBounds(...a.values as Bounds); break;
                    case Op.Ultimate: if (!c.requestUltimate()) throw new Error('Incompatible endless ultimate'); break;
                    case Op.Revive: c.revive(); break;
                }
                this.action = this.reader.next();
            }
            this.drainEvents();
            if (this.frame === this.saved.frames) {
                if (c.score !== this.saved.score || c.coins !== this.saved.coins || c.sector !== this.saved.sector
                    || Math.floor(c.distance) !== this.saved.distance || c.player.hp !== this.saved.hp) throw new Error('Incompatible endless progress');
                this.done = true;
                return;
            }
            c.step(STEP, this.target);
            this.frame++;
            this.drainEvents();
        } while (Date.now() < until);
    }
}
