import {
    MAX_PART_LEVEL, MAX_PLANE_LEVEL, SLOTS, UPGRADE_REFUND_PERCENT, combatPower, heartsForLevel, levelGold, partUpgradeCost, planeUpgradeCost,
    type SlotId,
} from './SfBalance';
import { PLANES, PLANE_BY_ID } from './SfPlaneDefs';
import type { PlaneId } from './SfTypes';
import { ALL_LEVELS, CHAPTERS, levelById } from './SfLevels';
import type { CombatResult } from './SfCombat';
import { sanitizeEndlessRun, type EndlessRunSave } from './SfEndlessRun';

export const SAVE_VERSION = 10;

export interface PlaneSave {
    owned: boolean;
    level: number;
    parts: Record<SlotId, number>;
    /** 当前机体与零件强化实际支付的金币；还原后清零，不含购买机体的费用。 */
    upgradeGold: number;
}

export interface SfSave {
    gold: number;
    selected: PlaneId;
    planes: Record<PlaneId, PlaneSave>;
    stars: Record<string, number>;
    bestScore: Record<string, number>;
    bossKills: string[];
    hiddenKills: string[];
    /** 连续未遇到隐藏 Boss 的大 Boss 关次数（保底）。 */
    hiddenMiss: number;
    endlessBest: number;
    /** 已发放但尚未确认获得弹窗的机体，退出后仍会依次展示。 */
    pendingPlanes: PlaneId[];
    /** 未结算的无尽出击，继续时还原该局的完整战斗状态。 */
    endlessRun?: EndlessRunSave;
    highScore: number;
    seenEnemies: string[];
    lastLevel: string;
    plays: number;
    /** 机库选择的出击模式。 */
    mode: 'campaign' | 'endless';
    /** 是否已展示过“双击释放必杀”引导。 */
    ultGuide: boolean;
}

export function emptySave(): SfSave {
    const planes = {} as Record<PlaneId, PlaneSave>;
    for (const p of PLANES) planes[p.id] = { owned: p.unlock.type === 'start', level: 1, parts: { main: 1, wing: 1, special: 1 }, upgradeGold: 0 };
    return {
        gold: 0, selected: 'vanguard', planes, stars: {}, bestScore: {}, bossKills: [], hiddenKills: [], hiddenMiss: 0,
        endlessBest: 0, pendingPlanes: [], highScore: 0, seenEnemies: [], lastLevel: '1-1', plays: 0, mode: 'campaign', ultGuide: false,
    };
}

/** 当前强化支出的校验上限；退款始终使用实际支付记录。 */
function fullUpgradeGold(plane: PlaneSave): number {
    let gold = 0;
    for (let level = 1; level < plane.level; level++) gold += planeUpgradeCost(level);
    for (const slot of SLOTS) {
        for (let level = 1; level < plane.parts[slot]; level++) gold += partUpgradeCost(level);
    }
    return gold;
}

/** 读取并校验存档；任何字段异常都回退到默认值，不会让游戏无法进入。 */
export function sanitizeSave(raw: unknown): SfSave {
    const base = emptySave();
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Partial<SfSave>;
    const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(min, Math.min(max, v)) : d);
    base.gold = Math.floor(num(r.gold, 0, 1e9, 0));
    if (r.planes && typeof r.planes === 'object') {
        for (const p of PLANES) {
            const s = (r.planes as Record<string, PlaneSave>)[p.id];
            if (!s) continue;
            const plane: PlaneSave = {
                owned: !!s.owned || p.unlock.type === 'start',
                level: Math.floor(num(s.level, 1, MAX_PLANE_LEVEL, 1)),
                parts: {
                    main: Math.floor(num(s.parts?.main, 1, MAX_PART_LEVEL, 1)),
                    wing: Math.floor(num(s.parts?.wing, 1, MAX_PART_LEVEL, 1)),
                    special: Math.floor(num(s.parts?.special, 1, MAX_PART_LEVEL, 1)),
                },
                upgradeGold: 0,
            };
            const fullGold = fullUpgradeGold(plane);
            plane.upgradeGold = Math.floor(num(s.upgradeGold, 0, fullGold, 0));
            base.planes[p.id] = plane;
        }
    }
    base.selected = r.selected && PLANE_BY_ID[r.selected] && base.planes[r.selected].owned ? r.selected : 'vanguard';
    const ids = new Set(ALL_LEVELS.map(l => l.id));
    if (r.stars) for (const k of Object.keys(r.stars)) if (ids.has(k)) base.stars[k] = Math.floor(num(r.stars[k], 0, 3, 0));
    if (r.bestScore) for (const k of Object.keys(r.bestScore)) if (ids.has(k)) base.bestScore[k] = Math.floor(num(r.bestScore[k], 0, 1e10, 0));
    base.bossKills = Array.isArray(r.bossKills) ? r.bossKills.filter(x => typeof x === 'string') : [];
    base.hiddenKills = Array.isArray(r.hiddenKills) ? r.hiddenKills.filter(x => typeof x === 'string') : [];
    base.seenEnemies = Array.isArray(r.seenEnemies) ? r.seenEnemies.filter(x => typeof x === 'string') : [];
    base.hiddenMiss = Math.floor(num(r.hiddenMiss, 0, 99, 0));
    base.endlessBest = Math.floor(num(r.endlessBest, 0, 1e9, 0));
    if (Array.isArray(r.pendingPlanes)) {
        base.pendingPlanes = Array.from(new Set(r.pendingPlanes.filter(id => PLANE_BY_ID[id]
            && PLANE_BY_ID[id].unlock.type !== 'start' && base.planes[id].owned)));
    }
    base.highScore = Math.floor(num(r.highScore, 0, 1e12, 0));
    base.lastLevel = typeof r.lastLevel === 'string' && levelById(r.lastLevel) ? r.lastLevel : '1-1';
    base.plays = Math.floor(num(r.plays, 0, 1e9, 0));
    base.mode = r.mode === 'endless' ? 'endless' : 'campaign';
    base.ultGuide = r.ultGuide === true;
    const run = sanitizeEndlessRun(r.endlessRun);
    if (run && base.planes[run.plane].owned) base.endlessRun = run;
    return base;
}

export class SfProgress {
    constructor(public data: SfSave) { }

    plane(id: PlaneId): PlaneSave { return this.data.planes[id]; }

    power(id: PlaneId): number {
        const p = this.plane(id);
        return combatPower(p.level, p.parts);
    }

    hearts(id: PlaneId): number {
        return heartsForLevel(this.plane(id).level, PLANE_BY_ID[id].baseHearts);
    }

    planeCost(id: PlaneId): number | null {
        const p = this.plane(id);
        return p.level >= MAX_PLANE_LEVEL ? null : planeUpgradeCost(p.level);
    }

    partCost(id: PlaneId, slot: SlotId): number | null {
        const p = this.plane(id);
        return p.parts[slot] >= MAX_PART_LEVEL ? null : partUpgradeCost(p.parts[slot]);
    }

    upgradePlane(id: PlaneId): boolean {
        const cost = this.planeCost(id);
        if (cost === null || this.data.gold < cost || !this.plane(id).owned) return false;
        this.data.gold -= cost;
        this.plane(id).upgradeGold += cost;
        this.plane(id).level++;
        return true;
    }

    upgradePart(id: PlaneId, slot: SlotId): boolean {
        const cost = this.partCost(id, slot);
        if (cost === null || this.data.gold < cost || !this.plane(id).owned) return false;
        this.data.gold -= cost;
        this.plane(id).upgradeGold += cost;
        this.plane(id).parts[slot]++;
        return true;
    }

    /** 返还当前飞机实际强化支出的 100%；未拥有或全部为 1 级时不可还原。 */
    resetRefund(id: PlaneId): number | null {
        const p = this.plane(id);
        if (!p.owned || (p.level === 1 && SLOTS.every(slot => p.parts[slot] === 1))) return null;
        return Math.floor(p.upgradeGold * UPGRADE_REFUND_PERCENT / 100);
    }

    /** 同步重置等级和支出记录，再返还金币；重复还原不会再次发放。 */
    resetPlane(id: PlaneId): number | null {
        const refund = this.resetRefund(id);
        if (refund === null) return null;
        const p = this.plane(id);
        p.level = 1;
        for (const slot of SLOTS) p.parts[slot] = 1;
        p.upgradeGold = 0;
        this.data.gold += refund;
        return refund;
    }

    /** 解锁条件当前是否满足（金币购买需要另外扣费）。 */
    unlockState(id: PlaneId): { owned: boolean; canBuy: boolean; progress: string } {
        const def = PLANE_BY_ID[id];
        const owned = this.plane(id).owned;
        if (owned) return { owned, canBuy: false, progress: '' };
        switch (def.unlock.type) {
            case 'gold': return { owned, canBuy: this.data.gold >= def.unlock.value, progress: `${this.data.gold}/${def.unlock.value}` };
            case 'endless': return { owned, canBuy: false, progress: `${this.data.endlessBest}/${def.unlock.value} 米` };
            case 'clear': return { owned, canBuy: false, progress: this.chapterCleared(def.unlock.value) ? '已达成' : '未通关' };
            case 'stars': return { owned, canBuy: false, progress: `${this.totalStars()}/${def.unlock.value} 星` };
            default: return { owned, canBuy: false, progress: '' };
        }
    }

    buyPlane(id: PlaneId): boolean {
        const def = PLANE_BY_ID[id];
        if (this.plane(id).owned || def.unlock.type !== 'gold' || this.data.gold < def.unlock.value) return false;
        this.data.gold -= def.unlock.value;
        this.grantPlane(id);
        return true;
    }

    /** 所有获得途径统一记录所有权和待展示奖励，不依赖当前界面是否可弹窗。 */
    private grantPlane(id: PlaneId): void {
        if (this.plane(id).owned) return;
        this.plane(id).owned = true;
        this.data.pendingPlanes.push(id);
    }

    acknowledgePlane(id: PlaneId): void {
        this.data.pendingPlanes = this.data.pendingPlanes.filter(p => p !== id);
    }

    /** 飞行中也更新航程成就；暂停、退出与断点保存无需结算即可发放机体。 */
    recordEndlessDistance(distance: number): PlaneId[] {
        if (Number.isFinite(distance)) this.data.endlessBest = Math.max(this.data.endlessBest, Math.floor(Math.max(0, Math.min(1e9, distance))));
        return this.refreshUnlocks();
    }

    /** 根据成就类条件自动解锁；返回本次新解锁的机体。 */
    refreshUnlocks(): PlaneId[] {
        const unlocked: PlaneId[] = [];
        for (const def of PLANES) {
            const save = this.plane(def.id);
            if (save.owned) continue;
            const rule = def.unlock;
            const ok = (rule.type === 'endless' && this.data.endlessBest >= rule.value)
                || (rule.type === 'clear' && this.chapterCleared(rule.value))
                || (rule.type === 'stars' && this.totalStars() >= rule.value);
            if (ok) { this.grantPlane(def.id); unlocked.push(def.id); }
        }
        return unlocked;
    }

    chapterCleared(chapter: number): boolean {
        const ch = CHAPTERS.find(c => c.id === chapter);
        return !!ch && ch.levels.length > 0 && ch.levels.every(l => (this.data.stars[l.id] ?? 0) > 0);
    }

    levelUnlocked(id: string): boolean {
        const index = ALL_LEVELS.findIndex(l => l.id === id);
        if (index <= 0) return index === 0;
        return (this.data.stars[ALL_LEVELS[index - 1].id] ?? 0) > 0;
    }

    /** 无尽模式在通关第 1 章后解锁。 */
    get endlessUnlocked(): boolean { return this.chapterCleared(1); }

    /** 当前最新关卡：第一个已解锁但还没拿到星的关卡；全部通关时为最后一个已解锁关卡。 */
    latestLevel(): string {
        const open = ALL_LEVELS.filter(l => this.levelUnlocked(l.id));
        const fresh = open.find(l => !(this.data.stars[l.id] > 0));
        return (fresh ?? open[open.length - 1] ?? ALL_LEVELS[0]).id;
    }

    /** 满级时的战斗力（机库火力条的上限）。 */
    maxPower(): number {
        return combatPower(MAX_PLANE_LEVEL, { main: MAX_PART_LEVEL, wing: MAX_PART_LEVEL, special: MAX_PART_LEVEL });
    }

    totalStars(): number {
        return Object.keys(this.data.stars).reduce((s, k) => s + this.data.stars[k], 0);
    }

    /** 决定本次大 Boss 关是否出现隐藏 Boss：首通后 6%，连续 15 次未遇到必出。 */
    rollHidden(levelId: string, random: number): boolean {
        const level = levelById(levelId);
        if (!level || level.tier !== 'big' || !(this.data.stars[levelId] > 0)) return false;
        if (this.data.hiddenMiss >= 15) return true;
        return random < 0.06;
    }

    /** 结算关卡：返回金币、星级变化与新解锁。 */
    settle(levelId: string, result: CombatResult): {
        stars: number; newStars: number; gold: number; firstClear: boolean; unlocked: PlaneId[]; bestScore: boolean;
    } {
        const level = levelById(levelId)!;
        const prev = this.data.stars[levelId] ?? 0;
        let stars = 0;
        if (result.victory) {
            stars = 1;
            if (result.hitsTaken <= 1) stars++;
            if (result.score >= level.starScore) stars++;
        }
        const firstClear = result.victory && prev === 0;
        const newStars = Math.max(0, stars - prev);
        let gold = result.coins;
        if (result.victory) gold += levelGold(level.number, firstClear, newStars);
        if (result.hiddenBoss && result.victory) gold *= 3;
        this.data.gold += gold;
        if (stars > prev) this.data.stars[levelId] = stars;
        const bestScore = result.score > (this.data.bestScore[levelId] ?? 0);
        if (bestScore) this.data.bestScore[levelId] = result.score;
        this.data.highScore = Math.max(this.data.highScore, result.score);
        if (result.victory) {
            if (this.data.bossKills.indexOf(level.boss) < 0) this.data.bossKills.push(level.boss);
            if (level.tier === 'big' && prev > 0) {
                if (result.hiddenBoss) {
                    this.data.hiddenMiss = 0;
                    const hid = `${level.boss}-hidden`;
                    if (this.data.hiddenKills.indexOf(hid) < 0) this.data.hiddenKills.push(hid);
                } else this.data.hiddenMiss++;
            }
        }
        this.data.plays++;
        const unlocked = this.refreshUnlocks();
        return { stars, newStars, gold, firstClear, unlocked, bestScore };
    }

    /** 无尽模式结算：金币 = 局内金币 + 每 10 米 1 枚 + 每个 Boss 100；刷新最远距离（可能解锁机体）。 */
    settleEndless(result: CombatResult, previousBest = this.data.endlessBest): { gold: number; best: boolean; unlocked: PlaneId[] } {
        const gold = result.coins + Math.floor(result.distance / 10) + result.bosses * 100;
        this.data.gold += gold;
        const best = result.distance > previousBest;
        this.data.endlessBest = Math.max(this.data.endlessBest, result.distance);
        this.data.highScore = Math.max(this.data.highScore, result.score);
        this.data.plays++;
        return { gold, best, unlocked: this.refreshUnlocks() };
    }

    seeEnemy(id: string): boolean {
        if (this.data.seenEnemies.indexOf(id) >= 0) return false;
        this.data.seenEnemies.push(id);
        return true;
    }

    slotLevels(id: PlaneId): Record<SlotId, number> {
        const p = this.plane(id);
        return { main: p.parts.main, wing: p.parts.wing, special: p.parts.special };
    }
}

export { SLOTS };
