import { Bubble, BubbleColor, BubbleShooterModel, Cell, COLORS, COLUMNS, MAX_ROW, ShotResult, valid } from './BubbleShooterModel';
import { BubbleShooterRound, BubbleItem, OrdinaryResult, ShotKind, ToyRailConstruction } from './BubbleShooterRound';
import { BubbleLevel, CAMPAIGN_BOARD_PROFILE, CAMPAIGN_RULES_VERSION, CAMPAIGN_SUPPLY_VERSION, validateBubbleLevel, campaignBoardConnected } from './BubbleShooterLevels';
import { counterableFrostBubbles } from './BubbleShooterBossTargets';

export type CampaignOutcome = 'won' | 'lost' | 'abandoned';
export type CampaignFailure = 'shots' | 'danger' | 'configuration';

/** Detail rewards and the actual settlement read the same efficiency thresholds. */
export function campaignStarsForShots(level: BubbleLevel, shotsUsed: number): number {
    return shotsUsed <= level.stars.threeMaxShots ? 3 : shotsUsed <= level.stars.twoMaxShots ? 2 : 1;
}

/** The objective guide and level detail use the same per-level star requirements. */
export function campaignStarConditions(level: BubbleLevel): readonly string[] {
    return ['完成目标', level.stars.twoMaxShots + ' 发内', level.stars.threeMaxShots + ' 发内'];
}

export interface CampaignBall { id: number; color: BubbleColor; }
export interface CampaignCheckpoint {
    schemaVersion: 1; levelId: string; levelRevision: number; rulesVersion: number; boardProfile: string; attemptId: string;
    bubbles: Bubble[]; phase: 0 | 1; rails: BubbleShooterRound['rails'];
    shotsUsed: number; roundId: number; boardRevision: number; bubbleSerial: number; ballSerial: number;
    current: CampaignBall; next: CampaignBall; openingCursor: number; supplyRng: number; skillRng: number; unhelpfulDraws: number;
    bossHealth: number; mechanicShots: number; frostIds: string[]; rowCursor: number; refillCursor: number;
    remainingTargets: string[]; inventory: Record<BubbleItem, number>; cleared: number;
}

/** Campaign reuses collision and presentation contracts, while owning its complete turn rules. */
export class BubbleShooterCampaign extends BubbleShooterRound {
    level!: BubbleLevel;
    attemptId = '';
    shotsUsed = 0;
    roundId = 0;
    boardRevision = 0;
    outcome?: CampaignOutcome;
    failure?: CampaignFailure;
    configurationError?: string;
    private bubbleSerial = 0;
    private ballSerial = 2;
    private currentId = 1;
    private nextId = 2;
    private openingCursor = 0;
    private supplyRng = 1;
    private skillRng = 1;
    private unhelpfulDraws = 0;
    private rowCursor = 0;
    private refillCursor = 0;
    private targetIds = new Set<string>();
    private frostIds: string[] = [];

    constructor(level: BubbleLevel, attemptId: string) { super(() => .5); this.start(level, attemptId); }
    private start(level: BubbleLevel, attemptId: string): void {
        validateBubbleLevel(level);
        if (!attemptId.trim()) throw new Error('Missing campaign attempt identity.');
        this.level = level; this.attemptId = attemptId; this.activeRegion = level.region;
        this.board.reset(level.initial.bubbles, level.initial.phase);
        this.rails = level.initial.rails.map(r => ({ ...r }));
        this.current = level.supply.current; this.next = level.supply.next;
        this.supplyRng = level.supply.seed || 1; this.skillRng = (level.supply.seed ^ 0x9e3779b9) >>> 0 || 1;
        this.bossHealth = level.goal.kind === 'boss' ? level.goal.health : 60;
        this.stage = level.goal.kind === 'boss' ? 'boss' : 'ordinary';
        this.targetIds = new Set('bubbleIds' in level.goal ? level.goal.bubbleIds : []);
        Object.assign(this.inventory, level.items);
    }
    get shotsRemaining(): number { return this.level.shotBudget - this.shotsUsed; }
    get score(): number { return 0; }
    get targetRemaining(): number { return this.targetIds.size; }
    get possibleStars(): number { return campaignStarsForShots(this.level, this.shotsUsed); }
    get stars(): number { return this.outcome === 'won' ? this.possibleStars : 0; }
    get rewardAvailable(): boolean { return false; }
    get canRevive(): boolean { return false; }
    get remainingRows(): number { return Math.max(0, (this.level.bossPlan?.rows.length ?? 0) - this.rowCursor); }
    isTarget(bubble: Bubble): boolean { return !!bubble.id && this.targetIds.has(bubble.id); }
    get difficulty() { return Object.freeze({ ...super.difficulty, frostTargets: this.level?.bossPlan?.frostTargets ?? 1 }); }

    availableColors(): BubbleColor[] {
        const living = this.board.removableBubbles;
        return COLORS.filter(color => (this.level.palette.indexOf(color) >= 0) && living.some(b => b.color === color || b.runeNext === color));
    }
    get staleCurrent(): boolean { return !(this.availableColors().indexOf(this.current) >= 0); }
    get staleNext(): boolean { return !(this.availableColors().indexOf(this.next) >= 0); }
    swap(): void {
        if (this.ended) return;
        const old = this.current, id = this.currentId;
        this.current = this.next; this.currentId = this.nextId; this.next = old; this.nextId = id;
    }
    private replacement(id: number): BubbleColor {
        const colors = this.availableColors();
        if (!colors.length) throw new Error('No campaign supply color.');
        let hash = this.level.supply.seed >>> 0;
        for (const n of [CAMPAIGN_SUPPLY_VERSION, this.roundId, this.boardRevision, id]) hash = Math.imul(hash ^ n, 16777619) >>> 0;
        return colors[hash % colors.length];
    }
    refreshStale(): number {
        if (this.ended) return 0;
        let count = 0;
        if (this.staleCurrent) { this.current = this.replacement(this.currentId); count++; }
        if (this.staleNext) { this.next = this.replacement(this.nextId); count++; }
        return count;
    }
    private nextRandom(stream: 'supply' | 'skill'): number {
        let state = stream === 'supply' ? this.supplyRng : this.skillRng;
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        state >>>= 0;
        if (stream === 'supply') this.supplyRng = state; else this.skillRng = state;
        return state / 4294967296;
    }
    private drawNext(): void {
        this.current = this.next; this.currentId = this.nextId; this.nextId = ++this.ballSerial;
        const available = this.availableColors();
        if (!available.length) throw new Error('No campaign supply color.');
        if (this.openingCursor < this.level.supply.openingQueue.length) {
            const fixed = this.level.supply.openingQueue[this.openingCursor++];
            this.next = (available.indexOf(fixed) >= 0) ? fixed : this.replacement(this.nextId);
            this.unhelpfulDraws = 0; return;
        }
        const useful = new Set<BubbleColor>();
        this.board.reachableShots().forEach(shot => available.forEach(color => {
            if (this.board.matchingCount(shot.cell, color) >= 2) useful.add(color);
        }));
        const pool = useful.size && this.unhelpfulDraws >= this.level.supply.maxUnhelpfulDraws ? available.filter(c => useful.has(c)) : available;
        const bubbles = this.board.removableBubbles;
        const weights = pool.map(color => 1 + bubbles.filter(b => b.color === color).length);
        let draw = this.nextRandom('supply') * weights.reduce((sum, n) => sum + n, 0);
        this.next = pool[pool.length - 1];
        for (let i = 0; i < pool.length; i++) { draw -= weights[i]; if (draw < 0) { this.next = pool[i]; break; } }
        this.unhelpfulDraws = !useful.size || useful.has(this.next) ? 0 : this.unhelpfulDraws + 1;
    }
    consumeProjectile(_item: 'bomb' | 'wildcard'): void {
        throw new Error('Campaign items are disabled.');
    }
    settle(cell: Cell, kind: ShotKind = 'normal'): OrdinaryResult {
        if (kind !== 'normal') throw new Error('Campaign items are disabled.');
        if (this.ended || this.shotsRemaining <= 0 || !valid(cell, this.board.rowPhase)
            || this.board.bubbles.some(b => b.row === cell.row && b.col === cell.col)
            || (cell.row > 0 && !this.board.neighbors(cell).some(c => this.board.bubbles.some(b => b.row === c.row && b.col === c.col)))) throw new Error('Invalid campaign shot.');
        const phase = this.board.rowPhase;
        const result = this.board.settle(cell, this.current, `${this.level.id}/shot/${++this.bubbleSerial}`);
        this.shotsUsed++; this.roundId++; this.boardRevision++;
        return this.resolve(result, phase, true, true);
    }
    clearBottom(): OrdinaryResult {
        throw new Error('Campaign items are disabled.');
    }
    private recordRemoval(removed: readonly Bubble[], dropped: readonly Bubble[]): number {
        const seen = new Set<string>();
        for (const b of [...removed, ...dropped]) {
            const id = b.id ?? `${b.row}:${b.col}`;
            if (seen.has(id)) continue;
            seen.add(id);
            if (this.level.goal.kind !== 'drop-anchors' || dropped.some(item => item.id === b.id)) this.targetIds.delete(id);
        }
        return seen.size;
    }
    private goalWon(): boolean {
        const goal = this.level.goal;
        return goal.kind === 'boss' ? this.bossHealth === 0 : goal.kind === 'clear-board'
            ? !this.board.removableBubbles.length : !this.targetIds.size;
    }
    private damage(removed: readonly Bubble[], dropped: readonly Bubble[]): number {
        if (this.level.goal.kind !== 'boss') return 0;
        const n = new Set([...removed, ...dropped].map(b => b.id)).size;
        const damage = Math.min(this.bossHealth, n); this.bossHealth -= damage; return damage;
    }
    private advanceRails(): { moved: OrdinaryResult['railMoved']; dropped: Bubble[] } {
        const movement = this.board.slideRails(this.rails);
        this.rails.forEach(r => r.direction = r.direction === 1 ? -1 : 1);
        return movement;
    }
    private buildRail(): ToyRailConstruction[] {
        const rail = this.rails.filter(r => r.start > 0 || r.end < COLUMNS - (r.row + this.board.rowPhase) % 2 - 1)
            .sort((a, b) => a.end - a.start - (b.end - b.start) || a.row - b.row)[0];
        if (rail) {
            const before = { ...rail }; rail.start = Math.max(0, rail.start - 1);
            rail.end = Math.min(COLUMNS - (rail.row + this.board.rowPhase) % 2 - 1, rail.end + 1);
            return [{ before, after: { ...rail } }];
        }
        if (this.rails.length >= 3) return [];
        const bubble = this.sortedBubbles().find(b => b.row > 0 && !this.rails.some(r => r.row === b.row));
        if (!bubble) return [];
        const after = { row: bubble.row, start: 0, end: COLUMNS - (bubble.row + this.board.rowPhase) % 2 - 1, direction: 1 as const };
        this.rails.push(after); return [{ after: { ...after } }];
    }
    private sortedBubbles(): Bubble[] { return this.board.bubbles.sort((a, b) => ((a.id ?? '') < (b.id ?? '') ? -1 : (a.id ?? '') > (b.id ?? '') ? 1 : 0) || a.row - b.row || a.col - b.col); }
    private pickSkill(candidates: Bubble[], count: number): Bubble[] {
        const remaining = candidates.slice(), result: Bubble[] = [];
        while (remaining.length && result.length < count) result.push(remaining.splice(Math.floor(this.nextRandom('skill') * remaining.length), 1)[0]);
        return result;
    }
    private resolve(result: ShotResult, phaseBefore: number, shot: boolean, supply: boolean): OrdinaryResult {
        let count = this.recordRemoval(result.removed, result.dropped);
        let damage = this.damage(result.removed, result.dropped);
        const turn: OrdinaryResult = { ...result, phaseBefore, railPhase: phaseBefore, railMoved: [], railDropped: [], railBuilt: [],
            toySkill: false, runed: [], inserted: false, descended: false, refilled: false, danger: false, enteredBoss: false,
            victory: false, damage: 0, frosted: [], supported: [], scoreGained: 0 };
        const boss = this.level.goal.kind === 'boss';
        let won = this.goalWon(), refill = boss && !won && !this.board.removableBubbles.length;
        if (!won && shot) {
            const countBefore = boss ? this.bossShots : this.region === 'toy' ? this.railShots : this.runeShots;
            const next = countBefore + 1;
            if (boss) this.bossShots = next; else if (this.region === 'toy') this.railShots = next; else if (this.region === 'magic') this.runeShots = next;
            if (next >= 3 && (boss || this.region === 'toy' || this.region === 'magic')) {
                if (boss) this.bossShots = 0; else if (this.region === 'toy') this.railShots = 0; else this.runeShots = 0;
                if (!refill && (!this.board.danger || this.region === 'toy')) {
                    if (boss && this.region !== 'toy' && this.rowCursor < this.level.bossPlan!.rows.length) {
                        const entry = this.level.bossPlan!.rows[this.rowCursor], phase = 1 - this.board.rowPhase;
                        const row = phase === 0 ? entry.phase0 : entry.phase1;
                        this.board.reset(this.board.bubbles.map(b => ({ ...b, row: b.row + 1 })).concat(row), phase);
                        this.rowCursor++; turn.inserted = true;
                    }
                    if (this.region === 'toy') {
                        if (boss) { turn.railBuilt = this.buildRail(); turn.toySkill = true; }
                        turn.railPhase = this.board.rowPhase;
                        const moved = this.advanceRails(); turn.railMoved = moved.moved; turn.railDropped = moved.dropped;
                        count += this.recordRemoval([], moved.dropped); damage += this.damage([], moved.dropped);
                    } else if (this.region === 'magic') turn.runed = this.board.switchRunes();
                    else if (boss && this.region === 'cloud') {
                        const targets = this.sortedBubbles().filter(b => (this.frostIds.indexOf(b.id!) >= 0) && !b.frosted && !b.indestructible);
                        turn.frosted = this.board.applyFrost(targets);
                    } else if (boss && this.region === 'ocean') {
                        // Keep exposed normal edges and do not convert every playable color.
                        const playable = this.sortedBubbles().filter(b => !b.indestructible && b.row >= 2);
                        const cap = Math.min(this.level.bossPlan!.anchorTargets, Math.max(0, playable.length - 3));
                        turn.supported = this.board.petrify(this.pickSkill(playable, cap), 6);
                    }
                    this.boardRevision++;
                }
                this.frostIds = [];
            }
        }
        won = this.goalWon();
        refill = refill || (boss && !won && !this.board.removableBubbles.length);
        if (won) { this.outcome = 'won'; this.ended = true; this.stage = 'victory'; this.frostIds = []; }
        else if (this.board.danger || this.shotsRemaining === 0) {
            this.outcome = 'lost'; this.failure = this.board.danger ? 'danger' : 'shots'; this.ended = true;
        } else {
            if (refill) {
                const layout = this.level.bossPlan!.refills[this.refillCursor];
                if (!layout) { this.failConfiguration('首领续盘配置已耗尽'); }
                else {
                    this.board.reset(layout.bubbles, layout.phase); this.rails = layout.rails.map(r => ({ ...r }));
                    this.refillCursor++; this.boardRevision++; turn.refilled = true; this.frostIds = [];
                }
            }
            if (!this.ended && !this.availableColors().length) this.failConfiguration('目标未完成但没有可用彩珠');
            if (!this.ended && supply) this.drawNext();
            if (!this.ended && boss && this.region === 'cloud' && this.bossShots === 2) this.frostIds = this.pickSkill(
                counterableFrostBubbles(this.board, [this.current, this.next]), this.level.bossPlan!.frostTargets).map(b => b.id!);
        }
        this.frostTargets = this.sortedBubbles().filter(b => (this.frostIds.indexOf(b.id!) >= 0)).map(b => ({ row: b.row, col: b.col }));
        this.cleared += count;
        turn.damage = damage; turn.victory = this.outcome === 'won'; turn.danger = this.ended && !turn.victory;
        return turn;
    }
    private failConfiguration(message: string): void { this.ended = true; this.outcome = 'lost'; this.failure = 'configuration'; this.configurationError = message; }
    campaignCheckpoint(): CampaignCheckpoint {
        if (this.ended) throw new Error('Cannot checkpoint a settled campaign attempt.');
        return { schemaVersion: 1, levelId: this.level.id, levelRevision: this.level.revision, rulesVersion: this.level.rulesVersion,
            boardProfile: this.level.boardProfile, attemptId: this.attemptId, bubbles: this.sortedBubbles(),
            phase: this.board.rowPhase as 0 | 1, rails: this.rails.map(r => ({ ...r })), shotsUsed: this.shotsUsed,
            roundId: this.roundId, boardRevision: this.boardRevision, bubbleSerial: this.bubbleSerial, ballSerial: this.ballSerial,
            current: { id: this.currentId, color: this.current }, next: { id: this.nextId, color: this.next },
            openingCursor: this.openingCursor, supplyRng: this.supplyRng, skillRng: this.skillRng, unhelpfulDraws: this.unhelpfulDraws,
            bossHealth: this.bossHealth, mechanicShots: this.stage === 'boss' ? this.bossShots : this.region === 'toy' ? this.railShots : this.runeShots,
            frostIds: this.frostIds.slice(), rowCursor: this.rowCursor, refillCursor: this.refillCursor,
            remainingTargets: Array.from(this.targetIds).sort(), inventory: { ...this.inventory }, cleared: this.cleared };
    }
    static restoreCampaign(level: BubbleLevel, value: unknown): BubbleShooterCampaign | undefined {
        try {
            if (!value || typeof value !== 'object') return undefined;
            const s = value as CampaignCheckpoint;
            // Rules 1 used the same boards and supply. Keep its live attempt, retiring its item stock.
            const legacyItems = s.rulesVersion === 1;
            const uint = (n: unknown, max = 1000000000) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
            if (s.schemaVersion !== 1 || s.levelId !== level.id || s.levelRevision !== level.revision
                || (!legacyItems && s.rulesVersion !== CAMPAIGN_RULES_VERSION) || s.boardProfile !== CAMPAIGN_BOARD_PROFILE || typeof s.attemptId !== 'string' || !s.attemptId.trim()
                || !uint(s.shotsUsed, level.shotBudget - 1) || !uint(s.roundId) || s.roundId < s.shotsUsed
                || !uint(s.boardRevision) || s.boardRevision < s.roundId || !uint(s.bubbleSerial) || s.bubbleSerial > s.shotsUsed
                || !uint(s.ballSerial) || s.ballSerial < 2 || !uint(s.openingCursor, level.supply.openingQueue.length)
                || !uint(s.supplyRng, 4294967295) || !s.supplyRng || !uint(s.skillRng, 4294967295) || !s.skillRng
                || !uint(s.unhelpfulDraws, level.supply.maxUnhelpfulDraws) || !uint(s.bossHealth, 60) || !s.bossHealth
                || !uint(s.mechanicShots, 2) || !uint(s.rowCursor, level.bossPlan?.rows.length ?? 0)
                || !uint(s.refillCursor, level.bossPlan?.refills.length ?? 0) || !uint(s.cleared)
                || !s.current || !s.next || !uint(s.current.id, s.ballSerial) || !s.current.id
                || !uint(s.next.id, s.ballSerial) || !s.next.id || s.current.id === s.next.id
                || !(level.palette.indexOf(s.current.color) >= 0) || !(level.palette.indexOf(s.next.color) >= 0)
                || !s.inventory || !['bomb', 'wildcard', 'clear-bottom'].every(k => uint(s.inventory[k], legacyItems && level.numberInRegion > 3 ? 1 : 0))
                || !Array.isArray(s.bubbles) || !s.bubbles.length || s.bubbles.length > COLUMNS * (MAX_ROW + 1)
                || !Array.isArray(s.rails) || s.rails.length > 3 || !Array.isArray(s.remainingTargets) || !Array.isArray(s.frostIds)) return undefined;
            const board = new BubbleShooterModel(); board.reset(s.bubbles, s.phase);
            const ids = new Set(s.bubbles.map(b => b.id));
            if (board.danger || !board.removableBubbles.length || !campaignBoardConnected(s.bubbles, s.phase) || ids.size !== s.bubbles.length || ids.has(undefined)
                || s.bubbles.some(b => !b.id || typeof b.id !== 'string' || !b.id.startsWith(level.id + '/')
                    || (!b.indestructible && !(level.palette.indexOf(b.color) >= 0)) || (b.runeNext && (level.region !== 'magic' || !(level.palette.indexOf(b.runeNext) >= 0)))
                    || (b.frosted && level.region !== 'cloud') || (b.solidKind && level.region !== 'ocean') || (b.indestructible && b.solidKind !== 'ocean'))
                || s.bubbles.filter(b => b.solidKind).length > 6 || s.bubbles.filter(b => b.runeNext).length > 12
                || new Set(s.remainingTargets).size !== s.remainingTargets.length || new Set(s.frostIds).size !== s.frostIds.length
                || s.remainingTargets.some(id => !ids.has(id) || !('bubbleIds' in level.goal) || !(level.goal.bubbleIds.indexOf(id) >= 0))
                || s.frostIds.length > (level.bossPlan?.frostTargets ?? 0) || s.frostIds.some(id => !s.bubbles.some(b => b.id === id && !b.frosted && !b.indestructible))) return undefined;
            if (level.region !== 'toy' && s.rails.length) return undefined;
            const railRows = new Set<number>();
            for (const r of s.rails) {
                if (!uint(r.row, MAX_ROW) || !uint(r.start, 12) || !uint(r.end, 12) || r.start >= r.end || railRows.has(r.row)
                    || !valid({ row: r.row, col: r.end }, s.phase) || (r.direction !== 1 && r.direction !== -1)) return undefined;
                railRows.add(r.row);
            }
            const restored = new BubbleShooterCampaign(level, s.attemptId);
            if ('bubbleIds' in level.goal && !s.remainingTargets.length) return undefined;
            restored.board.reset(s.bubbles.slice().sort((a, b) => (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0)), s.phase);
            restored.rails = s.rails.map(r => ({ ...r })); restored.shotsUsed = s.shotsUsed; restored.roundId = s.roundId;
            restored.boardRevision = s.boardRevision; restored.bubbleSerial = s.bubbleSerial; restored.ballSerial = s.ballSerial;
            restored.current = s.current.color; restored.currentId = s.current.id; restored.next = s.next.color; restored.nextId = s.next.id;
            restored.openingCursor = s.openingCursor; restored.supplyRng = s.supplyRng; restored.skillRng = s.skillRng; restored.unhelpfulDraws = s.unhelpfulDraws;
            restored.bossHealth = s.bossHealth; restored.rowCursor = s.rowCursor; restored.refillCursor = s.refillCursor;
            restored.targetIds = new Set(s.remainingTargets); restored.frostIds = s.frostIds.slice(); restored.cleared = s.cleared;
            // The constructor already owns a zero inventory in both new and migrated attempts.
            if (level.goal.kind === 'boss') restored.bossShots = s.mechanicShots; else if (level.region === 'toy') restored.railShots = s.mechanicShots; else if (level.region === 'magic') restored.runeShots = s.mechanicShots;
            restored.frostTargets = restored.sortedBubbles().filter(b => (s.frostIds.indexOf(b.id!) >= 0)).map(b => ({ row: b.row, col: b.col }));
            return restored;
        } catch { return undefined; }
    }
}
