import { bossDifficulty, cloudDifficulty, MAX_SAVED_FUTURE_ROWS, REGION_CYCLE } from './BubbleShooterDifficulty';
import { Bubble, BubbleColor, BubbleShooterModel, Cell, neighbors, COLORS, ShotResult, COLUMNS, MAX_ROW } from './BubbleShooterModel';
import { initialBoardConnected, structuredBubbles } from './BubbleShooterCraftedBoards';
import { counterableFrostBubbles } from './BubbleShooterBossTargets';

/** Gameplay tuning, independently adjustable from the counter artwork. */
export const BUBBLE_POINTS = 10;
export const ORDINARY_TUNING = Object.freeze({ missesPerRow: 3, protectionAfter: 3, initialRows: 8, refillRows: 6 });
export const BOSS_TUNING = Object.freeze({ progressRequired: 90, health: 60, shotsPerAction: 3, frostTargets: 2 });
export type BubbleRegion = typeof REGION_CYCLE[number];
export const OCEAN_TUNING = Object.freeze({ ordinaryAnchors: 4, supportCap: 6, convertTargets: 2 });
export type CloudStage = 'ordinary' | 'boss-entry' | 'boss' | 'victory';
export type BubbleItem = 'bomb' | 'wildcard' | 'clear-bottom';
export type ShotKind = 'normal' | 'bomb' | 'wildcard';
export interface ToyRail { row: number; start: number; end: number; direction: 1 | -1; }
export interface ToyRailConstruction { before?: ToyRail; after: ToyRail; }
export const TOY_SHOTS_PER_ACTION = 3;
export interface CloudSnapshot {
    version: 14;
    regionOrder: BubbleRegion[];
    nextRegionOrder: BubbleRegion[];
    roundStartCleared: number;
    runeShots: number;
    rails: ToyRail[];
    railShots: number;
    futureRows: BubbleColor[][];
    region: BubbleRegion;
    bubbles: Bubble[];
    phase: number;
    stage: CloudStage;
    current: BubbleColor;
    next: BubbleColor;
    accumulatedMisses: number;
    consecutiveMisses: number;
    regionProgress: number;
    bossHealth: number;
    bossShots: number;
    frostTargets: Cell[];
    cleared: number;
    completedRegions: number;
    inventory: Record<BubbleItem, number>;
    ended: boolean;
    reviveUsed: boolean;
}
export interface OrdinaryResult extends ShotResult {
    scoreGained: number;
    railMoved: { from: Cell; to: Cell; id?: string }[];
    railDropped: Bubble[];
    railBuilt: ToyRailConstruction[];
    toySkill: boolean;
    railPhase: number;
    runed: Bubble[];
    phaseBefore: number;
    inserted: boolean;
    descended: boolean;
    refilled: boolean;
    danger: boolean;
    enteredBoss: boolean;
    victory: boolean;
    damage: number;
    frosted: Bubble[];
    supported: Bubble[];
}

/** Region-aware turn bookkeeping; view timing never changes committed board state. */
export class BubbleShooterRound {
    rails: ToyRail[] = [];
    railShots = 0;
    runeShots = 0;
    readonly board = new BubbleShooterModel();
    protected activeRegion: BubbleRegion = 'cloud';
    private regionOrder: BubbleRegion[] = [];
    private nextRegionOrder: BubbleRegion[] = [];
    get region(): BubbleRegion { return this.activeRegion; }
    accumulatedMisses = 0;
    consecutiveMisses = 0;
    current: BubbleColor = 'red';
    next: BubbleColor = 'blue';
    cleared = 0;
    private roundStartCleared = 0;
    get score(): number { return this.cleared * BUBBLE_POINTS; }
    ended = false;
    stage: CloudStage = 'ordinary';
    regionProgress = 0;
    bossHealth: number = BOSS_TUNING.health;
    bossShots = 0;
    frostTargets: Cell[] = [];
    completedRegions = 0;
    private reviveUsed = false;
    private rewardClaimed = false;
    readonly inventory: Record<BubbleItem, number> = { bomb: 1, wildcard: 1, 'clear-bottom': 1 };
    private futureRows: BubbleColor[][] = [];
    get remainingRows(): number {
        return this.futureRows.length;
    }
    private readonly random: () => number;

    snapshot(): CloudSnapshot {
        return { version: 14, regionOrder: this.regionOrder.slice(), nextRegionOrder: this.nextRegionOrder.slice(), roundStartCleared: this.roundStartCleared, runeShots: this.runeShots, rails: this.rails.map(r=>({...r})), railShots: this.railShots, futureRows:this.futureRows.map(row=>row.slice()), region: this.region, bubbles: this.board.bubbles,
            phase: this.board.rowPhase,
            stage: this.stage, current: this.current, next: this.next,
            accumulatedMisses: this.accumulatedMisses, consecutiveMisses: this.consecutiveMisses,
            regionProgress: this.regionProgress, bossHealth: this.bossHealth, bossShots: this.bossShots,
            frostTargets: this.frostTargets.map(c => ({ ...c })), cleared: this.cleared,
            completedRegions: this.completedRegions, inventory: { ...this.inventory },
            ended: this.ended, reviveUsed: this.reviveUsed };
    }

    /** Validate the current snapshot completely before mutating the live round. */
    restore(value: unknown, availableRegions: readonly BubbleRegion[] = REGION_CYCLE): boolean {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const s = value as CloudSnapshot;
        const region = s.region;
        if (s.version !== 14 || REGION_CYCLE.indexOf(region) < 0 || availableRegions.indexOf(region) < 0) return false;
        const integer = (n: unknown, max: number): boolean => typeof n === 'number'
            && Number.isInteger(n) && n >= 0 && n <= max;
        const validOrder = (order: unknown): order is BubbleRegion[] => Array.isArray(order)
            && order.length === REGION_CYCLE.length && new Set(order).size === REGION_CYCLE.length
            && order.every(r => REGION_CYCLE.indexOf(r) >= 0);
        if (!validOrder(s.regionOrder) || !validOrder(s.nextRegionOrder)
            || !integer(s.completedRegions, 1000000)
            || s.regionOrder[s.completedRegions % REGION_CYCLE.length] !== region
            || s.nextRegionOrder[0] === s.regionOrder[REGION_CYCLE.length - 1]
            || (s.phase !== 0 && s.phase !== 1)
            || ['ordinary', 'boss-entry', 'boss', 'victory'].indexOf(s.stage) < 0
            || COLORS.indexOf(s.current) < 0 || COLORS.indexOf(s.next) < 0
            || !integer(s.accumulatedMisses, 3) || !integer(s.consecutiveMisses, 1000000)
            || !integer(s.regionProgress, 1000000000) || !integer(s.cleared, 1000000000)
            || !integer(s.roundStartCleared, s.cleared)
            || !integer(s.bossHealth, BOSS_TUNING.health)
            || !integer(s.bossShots, s.stage === 'victory' ? BOSS_TUNING.shotsPerAction : BOSS_TUNING.shotsPerAction - 1)
            || typeof s.ended !== 'boolean' || typeof s.reviveUsed !== 'boolean'
            || !s.inventory || !['bomb', 'wildcard', 'clear-bottom'].every(k => integer(s.inventory[k as BubbleItem], 3))
            || !Array.isArray(s.bubbles) || s.bubbles.length > COLUMNS * (MAX_ROW + 1)
            || (!s.bubbles.length && s.stage !== 'victory' && s.stage !== 'boss-entry')
            || !s.bubbles.every(b => b && integer(b.row, MAX_ROW) && integer(b.col, COLUMNS - 1)
                && COLORS.indexOf(b.color) >= 0 && typeof b.frosted === 'boolean'
                && (b.indestructible === undefined || (b.indestructible === true && !b.frosted))
                && (b.solidKind === undefined || (region === 'ocean' && b.solidKind === 'ocean' && b.indestructible === true))
                && !('support' in b)
                && (b.runeNext === undefined || (region === 'magic' && COLORS.indexOf(b.runeNext) >= 0
                    && b.runeNext !== b.color && !b.indestructible && !b.frosted)))
            || !Array.isArray(s.frostTargets) || s.frostTargets.length > 3
            || !s.frostTargets.every(c => c && integer(c.row, MAX_ROW) && integer(c.col, COLUMNS - 1))
            || !Array.isArray(s.futureRows) || s.futureRows.length > MAX_SAVED_FUTURE_ROWS
            || !s.futureRows.every((row, i) => Array.isArray(row)
                && row.length === COLUMNS - (s.phase + i + 1) % 2
                && row.every(color => COLORS.indexOf(color) >= 0))
            || (s.stage !== 'ordinary' && s.futureRows.length > 0)
            || !integer(s.railShots, TOY_SHOTS_PER_ACTION - 1)
            || !integer(s.runeShots, TOY_SHOTS_PER_ACTION - 1)
            || !Array.isArray(s.rails) || s.rails.length > 3) return false;

        const solids = s.bubbles.filter(b => b.indestructible && !b.solidKind);
        if (solids.length) {
            if ((s.stage !== 'ordinary' && s.stage !== 'boss-entry') || s.futureRows.length) return false;
            const last = Math.max(...solids.map(b => b.row));
            const occupied = new Set(solids.map(b => `${b.row}:${b.col}`));
            for (let row = 0; row <= last; row++) for (let col = 0; col < COLUMNS - (row + s.phase) % 2; col++) {
                if (!occupied.has(`${row}:${col}`)) return false;
            }
            if (s.stage === 'ordinary' && !s.bubbles.some(b => !b.indestructible)) return false;
        }
        if (region === 'ocean' && (s.frostTargets.length > 0
            || s.bubbles.filter(b => b.solidKind === 'ocean').length > OCEAN_TUNING.supportCap)) return false;
        if (region !== 'toy' && (s.rails.length || s.railShots)) return false;
        const railRows = new Set<number>();
        for (const rail of s.rails) {
            if (!rail || !integer(rail.row, MAX_ROW) || !integer(rail.start, COLUMNS - 1)
                || !integer(rail.end, COLUMNS - 1) || rail.start >= rail.end
                || rail.end >= COLUMNS - (rail.row + s.phase) % 2
                || (rail.direction !== 1 && rail.direction !== -1) || railRows.has(rail.row)) return false;
            railRows.add(rail.row);
        }
        if (region === 'toy' && (s.frostTargets.length
            || s.bubbles.some(b => b.frosted || b.solidKind))) return false;
        if (region !== 'magic' && s.runeShots !== 0) return false;
        if (region === 'magic' && s.frostTargets.length) return false;
        if (s.bubbles.filter(b => b.runeNext).length > 12) return false;

        let model: BubbleShooterModel;
        try { model = new BubbleShooterModel(); model.reset(s.bubbles, s.phase); } catch { return false; }
        if (!s.frostTargets.every(c => s.bubbles.some(b => b.row === c.row && b.col === c.col && !b.indestructible && !b.frosted))
            || new Set(s.frostTargets.map(c => `${c.row}:${c.col}`)).size !== s.frostTargets.length
            || (s.stage === 'victory' && (!s.ended || s.bossHealth !== 0))
            || (s.stage === 'boss-entry' && (s.ended || model.removableBubbles.length > 0))
            || ((s.stage === 'ordinary' || s.stage === 'boss') && (s.ended !== model.danger || s.bossHealth === 0))
            || (s.stage === 'ordinary' && !model.removableBubbles.length)) return false;

        this.activeRegion = region;
        this.rails = s.rails.map(r => ({ ...r }));
        this.railShots = s.railShots;
        this.runeShots = s.runeShots;
        this.board.reset(model.bubbles, s.phase);
        this.futureRows = s.futureRows.map(row => row.slice());
        this.stage = s.stage;
        this.current = s.current;
        this.next = s.next;
        this.accumulatedMisses = s.accumulatedMisses;
        this.consecutiveMisses = s.consecutiveMisses;
        this.regionProgress = s.regionProgress;
        this.bossHealth = s.bossHealth;
        this.bossShots = s.bossShots;
        this.frostTargets = s.frostTargets.map(c => ({ ...c }));
        this.cleared = s.cleared;
        this.roundStartCleared = s.roundStartCleared;
        this.completedRegions = s.completedRegions;
        this.regionOrder = s.regionOrder.slice();
        this.nextRegionOrder = s.nextRegionOrder.slice();
        for (const k of ['bomb', 'wildcard', 'clear-bottom'] as BubbleItem[]) this.inventory[k] = s.inventory[k];
        this.ended = s.ended;
        this.reviveUsed = s.reviveUsed;
        this.rewardClaimed = false;
        if (this.stage === 'boss' && !this.ended && !this.board.removableBubbles.length) this.refillBossColors();
        return true;
    }

    constructor(random: () => number = Math.random) { this.random = random; }

    reset(region: BubbleRegion = 'cloud', keepProgress = false): void {
        if (region !== 'cloud' && region !== 'ocean' && region !== 'toy' && region !== 'magic') throw new Error('Unknown region.');
        this.activeRegion = region;
        if (!keepProgress) {
            this.regionOrder = [region, ...this.shuffle(REGION_CYCLE.filter(r => r !== region))];
            this.nextRegionOrder = this.shuffledCycle(this.regionOrder[3]);
        } else if (this.regionOrder[this.completedRegions % REGION_CYCLE.length] !== region) {
            this.alignRegionOrder(region);
        }
        this.futureRows=[];
        this.reviveUsed = false;
        if (!keepProgress) this.completedRegions = 0;
        this.rewardClaimed = false;
        this.stage = 'ordinary';
        this.regionProgress = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.bossShots = 0;
        this.frostTargets = [];
        if (!keepProgress) {
            this.inventory.bomb = 1;
            this.inventory.wildcard = 1;
            this.inventory['clear-bottom'] = 1;
        }
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        if (!keepProgress) this.roundStartCleared = 0;
        this.cleared = this.roundStartCleared;
        this.ended = false;
        this.board.reset(this.generate(this.difficulty.initialRows));
        this.setupRails();
        this.planFutureRows();
        const weights = this.supplyWeights();
        this.current = this.choose(weights);
        this.next = this.choose(weights);
    }

    swap(): void {
        if (this.ended || this.stage === 'boss-entry') return;
        const old = this.current;
        this.current = this.next;
        this.next = old;
    }

    /** Committed rounds plus the defeated Boss awaiting its reward. */
    get completedRounds(): number { return this.completedRegions + (this.rewardAvailable ? 1 : 0); }
    get roundNumber(): number { return this.completedRegions + 1; }
    get difficultyLevel(): number { return this.difficulty.level; }
    get cycleBossNumber(): number { return this.completedRegions % REGION_CYCLE.length + 1; }
    get cycleBossCount(): number { return REGION_CYCLE.length; }
    get nextRegion(): BubbleRegion {
        const index = this.regionOrder.indexOf(this.region);
        return this.regionOrder[index + 1] ?? this.nextRegionOrder[0];
    }

    pickStartRegion(): BubbleRegion {
        return REGION_CYCLE[Math.min(REGION_CYCLE.length - 1, Math.floor(this.random() * REGION_CYCLE.length))];
    }

    private shuffledCycle(previous: BubbleRegion): BubbleRegion[] {
        // 先从另外三个主题中等概率选首项，再打乱余项，避免边界重复和拒绝采样死循环。
        const first = this.shuffle(REGION_CYCLE.filter(r => r !== previous))[0];
        return [first, ...this.shuffle(REGION_CYCLE.filter(r => r !== first))];
    }

    private alignRegionOrder(region: BubbleRegion): void {
        const order = this.shuffle(REGION_CYCLE.filter(r => r !== region));
        order.splice(this.completedRegions % REGION_CYCLE.length, 0, region);
        this.regionOrder = order;
        this.nextRegionOrder = this.shuffledCycle(this.regionOrder[3]);
    }

    get difficulty() {
        return this.stage === 'ordinary' ? cloudDifficulty(this.completedRegions) : bossDifficulty(this.completedRegions);
    }

    get rewardAvailable(): boolean { return this.stage === 'victory' && !this.rewardClaimed; }
    get canRevive(): boolean {
        return this.ended && !this.reviveUsed && (this.stage === 'ordinary' || this.stage === 'boss');
    }

    /** Only called after a completed rewarded ad. Clearing grants neither progress nor damage. */
    revive(): boolean {
        if (!this.canRevive) return false;
        this.board.clearTargets(this.board.bottomTargets());
        this.accumulatedMisses = this.consecutiveMisses = this.bossShots = this.railShots = this.runeShots = 0;
        this.frostTargets = [];
        this.reviveUsed = true;
        if (!this.board.removableBubbles.length) {
            if (this.stage === 'ordinary') {
                this.enterBossAfterClear();
            } else this.refillBossColors();
        }
        this.ended = this.board.danger;
        return true;
    }
    get inventoryFull(): boolean {
        return this.inventory.bomb >= 3 && this.inventory.wildcard >= 3 && this.inventory['clear-bottom'] >= 3;
    }

    /** Commit once; selection belongs to the view and never changes inventory. */
    claimReward(item?: BubbleItem): boolean {
        if (!this.rewardAvailable) return false;
        if (item) {
            if (!Object.prototype.hasOwnProperty.call(this.inventory, item) || this.inventory[item] >= 3) return false;
            this.inventory[item]++;
        } else if (!this.inventoryFull) return false;
        this.rewardClaimed = true;
        this.completedRegions++;
        return true;
    }

    /** Convenience caller for continuing to the next region. */
    continueCloud(): boolean { return this.continueRegion(this.nextRegion); }

    continueRegion(region: BubbleRegion = this.nextRegion): boolean {
        if (region !== 'cloud' && region !== 'ocean' && region !== 'toy' && region !== 'magic') return false;
        if (this.stage !== 'victory' || !this.rewardClaimed || region !== this.nextRegion) return false;
        if (this.completedRegions % REGION_CYCLE.length === 0) {
            this.regionOrder = this.nextRegionOrder;
            this.nextRegionOrder = this.shuffledCycle(this.regionOrder[3]);
        }
        this.roundStartCleared = this.cleared;
        this.activeRegion = region;
        this.futureRows=[];
        this.stage = 'ordinary';
        this.rewardClaimed = false;
        this.regionProgress = 0;
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.bossShots = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.frostTargets = [];
        this.ended = false;
        this.board.reset(this.generate(this.difficulty.initialRows));
        this.setupRails();
        this.planFutureRows();
        return true;
    }

    get staleCurrent(): boolean { return !this.board.removableBubbles.some(b => b.color === this.current); }
    get staleNext(): boolean { return !this.board.removableBubbles.some(b => b.color === this.next); }

    /** Explicit free refresh, only replacing displayed colors which have disappeared. */
    refreshStale(): number {
        if (this.ended || this.stage === 'boss-entry') return 0;
        const weights = this.supplyWeights();
        let count = 0;
        if (this.staleCurrent) { this.current = this.choose(weights); count++; }
        if (this.staleNext) { this.next = this.choose(weights); count++; }
        return count;
    }

    consumeProjectile(item: 'bomb' | 'wildcard'): void {
        if (this.ended || this.stage === 'boss-entry' || this.inventory[item] <= 0) throw new Error('Item unavailable.');
        this.inventory[item]--;
    }

    clearBottom(): OrdinaryResult {
        if (this.ended || this.stage === 'boss-entry' || this.inventory['clear-bottom'] <= 0) throw new Error('Clear-bottom unavailable.');
        const targets = this.board.bottomTargets();
        if (!targets.length) throw new Error('No bottom rows to clear.');
        const phaseBefore = this.board.rowPhase;
        this.inventory['clear-bottom']--;
        return this.complete(this.board.clearTargets(targets), phaseBefore, false, false);
    }

    settle(cell: Cell, kind: ShotKind = 'normal'): OrdinaryResult {
        if (this.ended || this.stage === 'boss-entry') throw new Error('Cannot settle a locked round.');
        const phaseBefore = this.board.rowPhase;
        const result = kind === 'bomb'
            ? this.board.clearTargets(this.board.bombTargets(cell))
            : this.board.settle(cell, kind === 'wildcard' ? this.board.wildcardColor(cell, this.current) : this.current);
        return this.complete(result, phaseBefore, true, kind === 'normal');
    }

    private enterBossAfterClear(): void {
        this.futureRows=[]; this.frostTargets=[];
        this.accumulatedMisses=0;
        this.stage='boss-entry';this.rails=[];this.railShots=0;this.runeShots=0;
    }

    private planFutureRows(): void {
        const palette=this.shuffle(COLORS.slice(0,this.difficulty.colorCount));
        this.futureRows=Array.from({length:this.difficulty.futureRows},(_,row)=>Array.from({length:COLUMNS-(row+1)%2},(_,col)=>palette[(Math.floor(col/this.difficulty.clusterWidth)+row)%palette.length]!));
    }

    private complete(result: ShotResult, phaseBefore: number, countsAsShot: boolean, advanceSupply: boolean): OrdinaryResult {
        const matched = result.removed.length > 0;
        let count = result.removed.length + result.dropped.length;
        let railMoved: {from:Cell;to:Cell}[] = [], railDropped: Bubble[] = [];
        let railBuilt: ToyRailConstruction[] = [], toySkill = false;
        if (this.region==='toy' && this.stage==='ordinary' && countsAsShot && this.board.removableBubbles.length) {
            this.railShots++;
            if (this.railShots>=TOY_SHOTS_PER_ACTION) {
                const movement=this.moveRails();railMoved=movement.moved;railDropped=movement.dropped;
                count+=railDropped.length;this.railShots=0;
            }
        }
        const clearedCells = new Set([...result.removed, ...result.dropped].map(b => `${b.row}:${b.col}`));
        this.frostTargets = this.frostTargets.filter(c => !clearedCells.has(`${c.row}:${c.col}`));
        if (countsAsShot) {
            if (matched) this.consecutiveMisses = 0;
            else this.consecutiveMisses++;
            if (this.stage === 'ordinary' && !matched) this.accumulatedMisses++;
            if (this.stage === 'boss') this.bossShots++;
        }
        let inserted = false, descended = false, refilled = false, enteredBoss = false, victory = false, damage = 0;
        let frosted: Bubble[] = [], supported: Bubble[] = [], runed: Bubble[] = [];
        if (this.stage === 'ordinary') {
            this.regionProgress += count;
            if (this.board.removableBubbles.length === 0) {
                // Clearing the whole board wins over row insertion and danger; no ordinary refill.
                this.enterBossAfterClear();
                enteredBoss = true;
            }
        } else if (this.stage === 'boss') {
            damage = Math.min(this.bossHealth, count);
            this.bossHealth -= damage;
            if (this.bossHealth === 0) {
                this.stage = 'victory';
                this.ended = true;
                this.frostTargets = [];
                victory = true;
            }
        }
        if (!enteredBoss && !victory) {
            if (this.board.removableBubbles.length === 0) {
                this.refillBossColors();
                refilled = true;
            }
            if (this.stage === 'boss' && countsAsShot && this.bossShots >= BOSS_TUNING.shotsPerAction) {
                if (!this.board.danger) {
                    if (this.region === 'toy') {
                        toySkill = true;
                        railBuilt = this.constructRail();
                    } else {
                        this.insertPressureRow();
                        inserted = true;
                    }
                    // Cloud targets follow inserted cells; ocean transforms surviving colored cells.
                    if (this.region === 'ocean') {
                        const targets = this.shuffle(this.board.removableBubbles.filter(b => b.row >= 2))
                            .slice(0, this.difficulty.oceanConvertTargets);
                        supported = this.board.petrify(targets, OCEAN_TUNING.supportCap);
                    } else if (this.region === 'cloud' && !refilled) frosted = this.board.applyFrost(this.frostTargets.map(c => ({row:c.row+1,col:c.col})));
                }
                this.bossShots = 0;
                this.frostTargets = [];
            } else if (this.stage === 'ordinary' && !inserted && countsAsShot && !this.board.danger && this.accumulatedMisses >= ORDINARY_TUNING.missesPerRow) {
                if(this.remainingRows>0) {this.insertPressureRow();inserted=true;}
                else {this.board.insertSupportRow();descended=true;}
                this.accumulatedMisses = 0;
                // Region effects belong to the inserted row and commit before danger checking.
                const top = inserted ? this.board.bubbles.filter(b => b.row === 0 && b.col > 0 && b.col < COLUMNS - 2) : [];
                const selected = this.shuffle(top).slice(0, this.difficulty.insertedFrost);
                if (this.region === 'ocean') supported = this.board.petrify(selected, OCEAN_TUNING.supportCap);
                else if(this.region==='cloud') frosted = this.board.applyFrost(selected);
            }
            if (inserted || descended) this.rails=this.rails.map(r=>({...r,row:r.row+1})).filter(r=>r.row<=MAX_ROW);
            if (toySkill) {
                const movement=this.moveRails();railMoved=movement.moved;railDropped=movement.dropped;
                const extra=Math.min(this.bossHealth,railDropped.length);damage+=extra;this.bossHealth-=extra;
                if (!this.bossHealth) {this.stage='victory';this.ended=true;victory=true;}
                else if (!this.board.removableBubbles.length) {this.refillBossColors();refilled=true;}
            }
            if(this.region==='magic') {
                if(inserted)this.seedRunes(1,true);
                if(this.stage==='ordinary' && countsAsShot)this.runeShots++;
                if((this.stage==='ordinary' && this.runeShots>=TOY_SHOTS_PER_ACTION) || (this.stage==='boss'&&inserted)) {
                    runed=this.board.switchRunes();this.runeShots=0;
                }
            }
            this.ended = victory || this.board.danger;
        }
        if (advanceSupply) {
            this.current = this.next;
            this.next = this.choose(this.supplyWeights());
        }
        if (this.region === 'cloud' && this.stage === 'boss' && countsAsShot && this.bossShots === BOSS_TUNING.shotsPerAction - 1 && !this.ended && !this.frostTargets.length) {
            // Telegraph after advancing supply, so the next decision has a playable counter.
            this.frostTargets = counterableFrostBubbles(this.board, [this.current, this.next])
                .map(b => ({bubble:b, key:-Math.log(Math.max(1e-9,this.random())) / (1 + b.row * .35)}))
                .sort((a,b) => a.key-b.key).slice(0,this.difficulty.frostTargets)
                .map(entry=>({row:entry.bubble.row,col:entry.bubble.col}));
        }
        const clearedCount = result.removed.length + result.dropped.length + railDropped.length;
        this.cleared += clearedCount;
        return { ...result, scoreGained: clearedCount * BUBBLE_POINTS, railMoved, railDropped, railBuilt, toySkill, runed, railPhase: this.stage==='ordinary'||enteredBoss?phaseBefore:this.board.rowPhase, phaseBefore, inserted, descended, refilled, danger: this.ended && !victory,
            enteredBoss, victory, damage, frosted, supported };
    }

    private setupRails(): void {
        this.railShots=0;this.runeShots=0;this.rails=[];
        if(this.region==='magic'){this.seedRunes(Math.min(12,5+this.difficulty.tier*2));return;}
        if(this.region!=='toy')return;
        this.rails=[{row:3,start:2,end:7,direction:1},{row:6,start:5,end:10,direction:-1}];
        if(this.difficulty.tier>=2)this.rails.push({row:8,start:1,end:6,direction:1});
        let bubbles=this.board.bubbles;
        // Put each release gap at an endpoint that retains every initial ceiling path.
        for(const rail of this.rails){
            const ends=Array.from({length:rail.end-rail.start},(_,i)=>rail.direction===1?rail.end-i:rail.start+i);
            for(const col of ends){
                const proposed=bubbles.filter(b=>b.row!==rail.row||b.col!==col);
                if(!initialBoardConnected(proposed,this.board.rowPhase))continue;
                if(rail.direction===1)rail.end=col;else rail.start=col;
                bubbles=proposed;break;
            }
        }
        this.board.reset(bubbles,this.board.rowPhase);
    }
    private seedRunes(count:number,topOnly=false):void {
        const bubbles=this.board.bubbles;
        let remaining=Math.min(count,12-bubbles.filter(b=>b.runeNext).length);
        const candidates=this.shuffle(bubbles.filter(b=>!b.indestructible&&!b.frosted&&!b.runeNext&&(topOnly?b.row===0:b.row>=2)));
        for(const b of candidates){
            if(remaining<=0)break;
            if(!topOnly && bubbles.some(other=>other.runeNext&&Math.abs(other.row-b.row)<=1&&Math.abs(other.col-b.col)<=1))continue;
            b.runeNext=COLORS[(COLORS.indexOf(b.color)+1+Math.floor(this.random()*3))%COLORS.length];remaining--;
        }
        this.board.reset(bubbles,this.board.rowPhase);
    }
    /** Extend the shortest existing track first; build at most three board-bound tracks. */
    private constructRail(): ToyRailConstruction[] {
        const width = (row:number) => COLUMNS - (row + this.board.rowPhase) % 2;
        const existing = this.rails.filter(r=>r.start>0||r.end<width(r.row)-1)
            .sort((a,b)=>(a.end-a.start)-(b.end-b.start)||a.row-b.row)[0];
        if (existing) {
            const before = {...existing};
            existing.start = Math.max(0,existing.start-1);
            existing.end = Math.min(width(existing.row)-1,existing.end+1);
            return [{before,after:{...existing}}];
        }
        if (this.rails.length>=3) return [];
        const rows = Array.from(new Set(this.board.removableBubbles.map(b=>b.row)))
            .filter(row=>row>=1&&row<=8&&!this.rails.some(r=>r.row===row)).sort((a,b)=>a-b);
        const row = rows[0];
        if (row===undefined) return [];
        const start = Math.max(0,Math.floor((width(row)-5)/2));
        const rail:ToyRail = {row,start,end:start+4,direction:this.rails.length%2===0?1:-1};
        this.rails.push(rail);
        return [{after:{...rail}}];
    }
    private moveRails() {
        const movement=this.board.slideRails(this.rails);
        this.rails.forEach(r=>r.direction=r.direction===1?-1:1);
        return movement;
    }

    private insertPressureRow(): void {
        if(this.stage!=='ordinary') {
            this.board.insertRow(this.random);
            return;
        }
        const phase=1-this.board.rowPhase, width=COLUMNS-phase;
        const row: Bubble[]=(this.futureRows.shift()??[]).slice(0,width).map((color,col)=>({row:0,col,color,frosted:false}));
        this.board.reset(this.board.bubbles.map(b=>({...b,row:b.row+1})).concat(row),phase);
    }

    /** Invoked only after the preceding shot's effects finish; never resets inventory or queue. */
    beginBoss(): void {
        if (this.stage !== 'boss-entry' || this.ended) throw new Error('Boss entry is not pending.');
        this.futureRows=[];
        this.board.reset(this.generateBoss());
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.bossShots = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.frostTargets = [];
        this.stage = 'boss';
        this.setupRails();
    }

    /** Keep permanent stones while replenishing playable colors when Boss HP remains. */
    private refillBossColors(): void {
        const solids=this.board.bubbles.filter(b=>b.indestructible);
        const occupied=new Set(solids.map(b=>`${b.row}:${b.col}`));
        const phase=this.board.rowPhase;
        const colors=this.generateBoss(phase).filter(b=>!occupied.has(`${b.row}:${b.col}`));
        this.board.reset(solids.concat(colors),phase);
        this.setupRails();
    }

    private generateBoss(phase = 0): Bubble[] {
        const board = this.generate(this.difficulty.bossRows, false, phase);
        if (this.region === 'cloud') this.addFrost(board, this.difficulty.bossFrost);
        return board;
    }

    /** Counts plus exposed edges, with a bounded bias toward sampled reachable matches. */
    supplyWeights(): ReadonlyMap<BubbleColor, number> {
        const bubbles = this.board.bubbles;
        const removable = bubbles.filter(b => !b.indestructible);
        const normal = removable.filter(b => !b.frosted);
        // If every ball is frosted, retain visible colors so play can continue to strip frost.
        const source = normal.length ? normal : removable;
        const occupied = new Set(bubbles.map(b => `${b.row}:${b.col}`));
        const weights = new Map<BubbleColor, number>();
        for (const b of source) {
            const exposed = this.board.neighbors(b).some(c => c.row >= b.row && !occupied.has(`${c.row}:${c.col}`));
            weights.set(b.color, (weights.get(b.color) ?? 0) + 1 + (exposed ? 2 : 0));
        }
        if (this.consecutiveMisses >= this.difficulty.protectionAfter) {
            const useful = new Set<BubbleColor>();
            for (let angle = -70; angle <= 70; angle += 5) {
                const radians = angle * Math.PI / 180;
                const shot = this.board.trace({ x: Math.sin(radians), y: Math.cos(radians) });
                if (!shot) continue;
                for (const color of Array.from(weights.keys())) {
                    if (this.board.matchingCount(shot.cell, color) >= 2) useful.add(color);
                }
            }
            useful.forEach(color => weights.set(color, weights.get(color)! * this.difficulty.supplyAssist));
        }
        return weights;
    }

    private choose(weights: ReadonlyMap<BubbleColor, number>): BubbleColor {
        const entries = Array.from(weights.entries());
        if (!entries.length) return 'red';
        let draw = this.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
        for (const [color, weight] of entries) {
            draw -= weight;
            if (draw < 0) return color;
        }
        return entries[entries.length - 1]![0];
    }

    private shuffle<T>(items: readonly T[]): T[] {
        const copy = items.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.min(i, Math.floor(this.random() * (i + 1)));
            const value = copy[i]!; copy[i] = copy[j]!; copy[j] = value;
        }
        return copy;
    }

    private addFrost(board: Bubble[], count: number): void {
        const selected: Bubble[] = [];
        // Keep a normal top row and avoid solid walls of adjacent frost.
        for (const b of this.shuffle(board.filter(b => b.row >= 2))) {
            if (selected.length >= count) break;
            if (selected.some(c => Math.abs(c.row - b.row) <= 1 && Math.abs(c.col - b.col) <= 1)) continue;
            b.frosted = true; selected.push(b);
        }
    }

    private generate(rows: number, frost = true, phase = 0): Bubble[] {
        const palette = this.shuffle(COLORS.slice(0,this.difficulty.colorCount));
        // Rotate again on each theme cycle, so returning to a region gets a different support graph.
        const cycle = Math.floor(this.completedRegions / REGION_CYCLE.length);
        const pattern = (this.completedRegions + cycle + (frost ? 0 : 1)) % 4;
        const bubbles = structuredBubbles(rows, pattern, palette, phase);
        const cells = new Map(bubbles.map(b => [`${b.row}:${b.col}`, b]));
        for (const bubble of bubbles) {
            // Preserve exposed pairs, and avoid bridging neighboring groups when fragmenting the interior.
            if (bubble.row < 2 || bubble.row >= rows - 2 || this.random() >= this.difficulty.colorScatter) continue;
            const adjacent = neighbors(bubble, phase).map(c => cells.get(`${c.row}:${c.col}`)).filter((b): b is Bubble => !!b);
            const choices = palette.filter(color => color !== bubble.color && !adjacent.some(b => b.color === color));
            if (choices.length) bubble.color = choices[Math.floor(this.random() * choices.length)]!;
        }
        if (frost) {
            if (this.region === 'cloud') this.addFrost(bubbles, this.difficulty.ordinaryFrost);
            else if (this.region==='ocean') {
                const anchors: Bubble[] = [];
                for (const bubble of this.shuffle(bubbles.filter(b => b.row >= 2 && b.row < rows - 1))) {
                    if (anchors.length >= Math.min(this.difficulty.oceanAnchors,OCEAN_TUNING.supportCap)) break;
                    if (anchors.some(b => Math.abs(b.row - bubble.row) <= 1 && Math.abs(b.col - bubble.col) <= 1)) continue;
                    bubble.indestructible=true; bubble.solidKind='ocean'; bubble.color='red'; anchors.push(bubble);
                }
            }
        }
        return bubbles;
    }

    clear(): void {
        this.rails=[];this.railShots=0;this.runeShots=0;
        this.futureRows=[];
        this.board.reset([]);
        this.frostTargets = [];
        this.inventory.bomb = 0;
        this.inventory.wildcard = 0;
        this.inventory['clear-bottom'] = 0;
        this.ended = true;
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.cleared = 0; this.roundStartCleared = 0;
    }
}
