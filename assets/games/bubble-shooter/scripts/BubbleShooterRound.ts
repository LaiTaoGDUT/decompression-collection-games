import { cloudDifficulty, MAX_SAVED_FUTURE_ROWS } from './BubbleShooterDifficulty';
import { Bubble, BubbleColor, BubbleShooterModel, Cell, neighbors, COLORS, ShotResult, DANGER, ROW_HEIGHT, DIAMETER, COLUMNS, MAX_ROW } from './BubbleShooterModel';

/** Gameplay tuning, independently adjustable from the counter artwork. */
export const ORDINARY_TUNING = Object.freeze({ missesPerRow: 3, protectionAfter: 3, initialRows: 10, refillRows: 6 });
export const BOSS_TUNING = Object.freeze({ progressRequired: 90, health: 60, shotsPerAction: 3, frostTargets: 2 });
export type BubbleRegion = 'cloud' | 'ocean';
export const OCEAN_TUNING = Object.freeze({ ordinaryAnchors: 4, supportCap: 6, grabTargets: 2 });
export type CloudStage = 'ordinary' | 'boss-entry' | 'boss' | 'victory';
export type BubbleItem = 'bomb' | 'wildcard' | 'clear-bottom';
export type ShotKind = 'normal' | 'bomb' | 'wildcard';
export interface CloudSnapshot {
    version: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    ceilingRow?: number;
    futureRows?: BubbleColor[][];
    region?: BubbleRegion;
    bubbles: Bubble[];
    migrationReserve?: Bubble[];
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
    readonly board = new BubbleShooterModel();
    private activeRegion: BubbleRegion = 'cloud';
    private migrationReserve: Bubble[] = [];
    get region(): BubbleRegion { return this.activeRegion; }
    accumulatedMisses = 0;
    consecutiveMisses = 0;
    current: BubbleColor = 'red';
    next: BubbleColor = 'blue';
    cleared = 0;
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
        let count=this.futureRows.length, remaining=this.migrationReserve.length, phase=this.board.rowPhase;
        while(remaining>0) {phase=1-phase;remaining-=COLUMNS-phase;count++;}
        return count;
    }
    private readonly random: () => number;

    snapshot(): CloudSnapshot {
        return { version: 7, ceilingRow:this.board.ceilingRow, futureRows:this.futureRows.map(row=>row.slice()), region: this.region, bubbles: this.board.bubbles,
            ...(this.migrationReserve.length ? {migrationReserve:this.migrationReserve.map(b=>({...b}))} : {}), phase: this.board.rowPhase,
            stage: this.stage, current: this.current, next: this.next,
            accumulatedMisses: this.accumulatedMisses, consecutiveMisses: this.consecutiveMisses,
            regionProgress: this.regionProgress, bossHealth: this.bossHealth, bossShots: this.bossShots,
            frostTargets: this.frostTargets.map(c => ({ ...c })), cleared: this.cleared,
            completedRegions: this.completedRegions, inventory: { ...this.inventory },
            ended: this.ended, reviveUsed: this.reviveUsed };
    }

    /** Validate everything before mutating the live round; stale/invalid saves start clean. */
    restore(value: unknown, availableRegions: readonly BubbleRegion[] = ['cloud', 'ocean']): boolean {
        if (!value || typeof value !== 'object') return false;
        let s = value as CloudSnapshot;
        const legacy = s.version === 1;
        const oldGrid = s.version < 6;
        const savedMaxRow=oldGrid ? (s.version===5 ? 16 : 18) : MAX_ROW;
        const savedColumns=oldGrid ? (s.version===5 ? 14 : 15) : COLUMNS;
        const region: BubbleRegion = s.version >= 4 ? s.region! : 'cloud';
        if (availableRegions.indexOf(region) < 0) return false;
        if ((region !== 'cloud' && region !== 'ocean')
            || (s.version < 4 && s.region !== undefined && s.region !== 'cloud')) return false;
        const integer = (n: unknown, max: number): boolean => typeof n === 'number'
            && Number.isInteger(n) && n >= 0 && n <= max;
        if ((s.version !== 1 && s.version !== 2 && s.version !== 3 && s.version !== 4 && s.version !== 5 && s.version !== 6 && s.version !== 7) || [0, 1].indexOf(s.phase) < 0
            || ['ordinary', 'boss-entry', 'boss', 'victory'].indexOf(s.stage) < 0
            || COLORS.indexOf(s.current) < 0 || COLORS.indexOf(s.next) < 0
            || !integer(s.accumulatedMisses, 3) || !integer(s.consecutiveMisses, 1000000)
            || !integer(s.regionProgress, 1000000000) || !integer(s.cleared, 1000000000)
            || !integer(s.completedRegions, 1000000) || !integer(s.bossHealth, BOSS_TUNING.health)
            || !integer(s.bossShots, s.stage === 'victory' ? BOSS_TUNING.shotsPerAction : BOSS_TUNING.shotsPerAction - 1) || typeof s.ended !== 'boolean' || typeof s.reviveUsed !== 'boolean'
            || !s.inventory || !['bomb', 'wildcard', 'clear-bottom'].every(k => integer(s.inventory[k as BubbleItem], 3))
            || !Array.isArray(s.bubbles) || s.bubbles.length > savedColumns * (savedMaxRow + 1)
            || (!s.bubbles.length && s.stage !== 'victory' && s.stage !== 'boss-entry')
            || !s.bubbles.every(b => b && integer(b.row, legacy ? 10 : savedMaxRow) && integer(b.col, legacy ? 9 : savedColumns - 1)
                && COLORS.indexOf(b.color) >= 0 && typeof b.frosted === 'boolean'
                && (region === 'cloud' ? b.support === undefined
                    : !b.frosted && (b.support === undefined || b.support === (s.stage === 'ordinary' || s.stage === 'boss-entry' ? 'seaweed' : 'tentacle'))))
            || !Array.isArray(s.frostTargets) || s.frostTargets.length > 3
            || !s.frostTargets.every(c => c && integer(c.row, legacy ? 10 : savedMaxRow)
                && integer(c.col, legacy ? 9 : savedColumns - 1))) return false;
        if(s.migrationReserve!==undefined && ((s.version!==5 && s.version!==6 && s.version!==7) || !Array.isArray(s.migrationReserve)
            || s.migrationReserve.length>285 || !s.migrationReserve.every(b=>b && COLORS.indexOf(b.color)>=0
                && Number.isInteger(b.row) && b.row>=0 && b.row<=18 && Number.isInteger(b.col) && b.col>=0 && b.col<15
                && typeof b.frosted==='boolean' && (region==='cloud' ? b.support===undefined : !b.frosted && (b.support===undefined || b.support===(s.stage==='ordinary'||s.stage==='boss-entry'?'seaweed':'tentacle'))))))return false;
        if(s.version===7 && (!integer(s.ceilingRow,MAX_ROW) || !Array.isArray(s.futureRows)
            || s.futureRows.length>MAX_SAVED_FUTURE_ROWS || (s.futureRows.length>0 && (s.migrationReserve?.length??0)>0) || !s.futureRows.every((row,i)=>Array.isArray(row) && row.length===COLUMNS-(s.phase+i+1)%2 && row.every(color=>COLORS.indexOf(color)>=0))
            || (s.stage!=='ordinary' && (s.futureRows.length>0 || (s.ceilingRow!==0 && s.stage!=='boss-entry')))
            || (s.ceilingRow!>0 && (s.futureRows.length>0 || (s.migrationReserve?.length??0)>0))))return false;
        if (region === 'ocean' && (s.frostTargets.length > 0
            || (s.bubbles.filter(b => b.support !== undefined).length + (s.migrationReserve??[]).filter(b=>b.support!==undefined).length) > OCEAN_TUNING.supportCap)) return false;
        if(s.version<7)s={...s,ceilingRow:0,futureRows:[]};
        if (legacy) {
            // Keep the old cells/queue/inventory; center them in the wider board.
            // The expanded runway can make an old danger crossing playable again.
            if (!s.bubbles.every(b => b.col < 10 - (b.row + s.phase) % 2)) return false;
            const oldDanger = s.bubbles.some(b => 410 - b.row * 72 * Math.sqrt(3) / 2 - 36 <= -210);
            if ((s.stage === 'ordinary' || s.stage === 'boss') && s.ended !== oldDanger) return false;
            s = { ...s, version: 3, bubbles: s.bubbles.map(b => ({ ...b, col: b.col + 2 })),
                frostTargets: s.frostTargets.map(c => ({ ...c, col: c.col + 2 })),
                ended: (s.stage === 'ordinary' || s.stage === 'boss') ? false : s.ended };
        }
        if (s.version === 2) {
            const oldDanger = s.bubbles.some(b => 350 - b.row * (48 * Math.sqrt(3) / 2) - 24 <= -330);
            if ((s.stage === 'ordinary' || s.stage === 'boss') && s.ended !== oldDanger) return false;
            s = { ...s, version: 3, ended: (s.stage === 'ordinary' || s.stage === 'boss') ? false : s.ended };
        }
        if (oldGrid) {
            // Validate old hex occupancy before reflowing into the narrower grid.
            const occupied=new Set<string>();
            if (!s.bubbles.every(b=> {
                const key=`${b.row}:${b.col}`;
                if(b.col>=savedColumns-(b.row+s.phase)%2 || occupied.has(key))return false;
                occupied.add(key);return true;
            })) return false;
            if(!s.frostTargets.every(c=>s.bubbles.some(b=>b.row===c.row&&b.col===c.col&&!b.frosted))
                || new Set(s.frostTargets.map(c=>`${c.row}:${c.col}`)).size!==s.frostTargets.length)return false;
            if(value && (value as CloudSnapshot).version >= 3 && (s.stage==='ordinary'||s.stage==='boss')
                && s.ended!==s.bubbles.some(b=>{const d=720/savedColumns;return 410-b.row*d*Math.sqrt(3)/2-d/2<=((value as CloudSnapshot).version===5 ? -305 : -330);}))return false;
            const free: Cell[]=[];
            // Live saves stay live during geometry migration; terminal saves may retain danger cells.
            for(let row=0;row<=MAX_ROW;row++)for(let col=0;col<COLUMNS-(row+s.phase)%2;col++) {
                if(!s.ended && 410-row*ROW_HEIGHT-DIAMETER/2<=DANGER)continue;
                free.push({row,col});
            }
            const reserve: Bubble[]=(s.migrationReserve??[]).map(b=>({...b}));
            const remap=new Map<string,Cell>();
            const migrated=s.bubbles.map(b=>{
                if(!free.length){reserve.push({...b});return undefined;}
                const desiredCol=b.col*(COLUMNS-1)/(savedColumns-1);
                let best=0,bestCost=Infinity;
                free.forEach((c,i)=>{const cost=Math.pow(c.row-b.row,2)*4+Math.pow(c.col-desiredCol,2);if(cost<bestCost){best=i;bestCost=cost;}});
                const target=free.splice(best,1)[0]!;remap.set(`${b.row}:${b.col}`,target);
                return {...b,...target};
            }).filter((b): b is Bubble => !!b);
            s={...s,version:6,region,bubbles:migrated,migrationReserve:reserve,frostTargets:s.frostTargets.filter(c=>remap.has(`${c.row}:${c.col}`)).map(c=>({...remap.get(`${c.row}:${c.col}`)!}))};
            if(s.stage==='ordinary'||s.stage==='boss')s={...s,ended:migrated.some(b=>410-b.row*ROW_HEIGHT-DIAMETER/2<=DANGER)};
        }
        let model: BubbleShooterModel;
        try { model = new BubbleShooterModel(); model.reset(s.bubbles, s.phase,s.ceilingRow??0); } catch { return false; }
        if (!s.frostTargets.every(c => c && s.bubbles.some(b => b.row === c.row && b.col === c.col && !b.frosted))
            || new Set(s.frostTargets.map(c => `${c.row}:${c.col}`)).size !== s.frostTargets.length
            || (s.stage === 'victory' && (!s.ended || s.bossHealth !== 0))
            || (s.stage === 'boss-entry' && (s.ended || (s.bubbles.length > 0 && s.regionProgress < cloudDifficulty(s.completedRegions).progressRequired)))
            || ((s.stage === 'ordinary' || s.stage === 'boss') && (s.ended !== model.danger || s.bossHealth === 0))) return false;
        this.activeRegion = region;
        this.migrationReserve=(s.migrationReserve??[]).map(b=>({...b}));
        this.board.reset(s.bubbles, s.phase,s.ceilingRow??0);
        this.futureRows=(s.futureRows??[]).map(row=>row.slice());
        this.stage = s.stage; this.current = s.current; this.next = s.next;
        this.accumulatedMisses = s.accumulatedMisses; this.consecutiveMisses = s.consecutiveMisses;
        this.regionProgress = s.regionProgress; this.bossHealth = s.bossHealth; this.bossShots = s.bossShots;
        this.frostTargets = s.frostTargets.map(c => ({ ...c })); this.cleared = s.cleared;
        this.completedRegions = s.completedRegions;
        for (const k of ['bomb', 'wildcard', 'clear-bottom'] as BubbleItem[]) this.inventory[k] = s.inventory[k];
        this.ended = s.ended; this.reviveUsed = s.reviveUsed; this.rewardClaimed = false;
        return true;
    }

    constructor(random: () => number = Math.random) { this.random = random; }

    reset(region: BubbleRegion = 'cloud'): void {
        if (region !== 'cloud' && region !== 'ocean') throw new Error('Unknown region.');
        this.activeRegion = region;
        this.migrationReserve=[];this.futureRows=[];
        this.reviveUsed = false;
        this.completedRegions = 0;
        this.rewardClaimed = false;
        this.stage = 'ordinary';
        this.regionProgress = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.bossShots = 0;
        this.frostTargets = [];
        this.inventory.bomb = 1;
        this.inventory.wildcard = 1;
        this.inventory['clear-bottom'] = 1;
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.cleared = 0;
        this.ended = false;
        this.board.reset(this.generate(ORDINARY_TUNING.initialRows));
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

    get difficulty() { return cloudDifficulty(this.completedRegions); }

    get rewardAvailable(): boolean { return this.stage === 'victory' && !this.rewardClaimed; }
    get canRevive(): boolean {
        return this.ended && !this.reviveUsed && (this.stage === 'ordinary' || this.stage === 'boss');
    }

    /** Only called after a completed rewarded ad. Clearing grants neither progress nor damage. */
    revive(): boolean {
        if (!this.canRevive) return false;
        this.board.clearTargets(this.board.bottomTargets());
        this.accumulatedMisses = this.consecutiveMisses = this.bossShots = 0;
        this.frostTargets = [];
        this.reviveUsed = true;
        this.ended = false;
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

    /** Compatibility entry for the live cloud view until region artwork is connected. */
    continueCloud(): boolean { return this.continueRegion('cloud'); }

    continueRegion(region: BubbleRegion = this.region): boolean {
        if (region !== 'cloud' && region !== 'ocean') return false;
        if (this.stage !== 'victory' || !this.rewardClaimed) return false;
        this.activeRegion = region;
        this.migrationReserve=[];this.futureRows=[];
        this.stage = 'ordinary';
        this.rewardClaimed = false;
        this.regionProgress = 0;
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.bossShots = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.frostTargets = [];
        this.ended = false;
        this.board.reset(this.generate(ORDINARY_TUNING.initialRows));
        this.planFutureRows();
        return true;
    }

    get staleCurrent(): boolean { return !this.board.bubbles.some(b => b.color === this.current); }
    get staleNext(): boolean { return !this.board.bubbles.some(b => b.color === this.next); }

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

    private planFutureRows(): void {
        const palette=this.shuffle(COLORS);
        this.futureRows=Array.from({length:this.difficulty.futureRows},(_,row)=>Array.from({length:COLUMNS-(row+1)%2},(_,col)=>palette[(Math.floor(col/3)+row)%palette.length]!));
    }

    private complete(result: ShotResult, phaseBefore: number, countsAsShot: boolean, advanceSupply: boolean): OrdinaryResult {
        const matched = result.removed.length > 0;
        const count = result.removed.length + result.dropped.length;
        this.cleared += count;
        const clearedCells = new Set([...result.removed, ...result.dropped].map(b => `${b.row}:${b.col}`));
        this.frostTargets = this.frostTargets.filter(c => !clearedCells.has(`${c.row}:${c.col}`));
        if (countsAsShot) {
            if (matched) this.consecutiveMisses = 0;
            else this.consecutiveMisses++;
            if (this.stage === 'ordinary') this.accumulatedMisses = matched ? 0 : this.accumulatedMisses + 1;
            if (this.stage === 'boss') this.bossShots++;
        }
        if(this.stage==='ordinary' && matched)this.accumulatedMisses=0;
        let inserted = false, descended = false, refilled = false, enteredBoss = false, victory = false, damage = 0;
        let frosted: Bubble[] = [], supported: Bubble[] = [];
        if (this.stage === 'ordinary') {
            this.regionProgress += count;
            if (this.board.bubbles.length === 0 && this.remainingRows===0) {
                // Clearing the whole board wins over row insertion and danger; no ordinary refill.
                this.stage = 'boss-entry';
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
            if (this.board.bubbles.length === 0) {
                if(this.stage==='ordinary') {this.insertPressureRow();inserted=true;this.accumulatedMisses=0;}
                else this.board.reset(this.generateBoss());
                refilled = true;
            }
            if (this.stage === 'boss' && countsAsShot && this.bossShots >= BOSS_TUNING.shotsPerAction) {
                if (!this.board.danger) {
                    this.insertPressureRow();
                    inserted = true;
                    // Cloud targets follow inserted cells; ocean grabs select surviving bubbles.
                    if (this.region === 'ocean') {
                        const targets = this.shuffle(this.board.bubbles.filter(b => b.row >= 2 && !b.support))
                            .sort((a, b) => b.row - a.row).slice(0, OCEAN_TUNING.grabTargets);
                        supported = this.board.applySupport(targets, 'tentacle', this.availableSupportCap);
                    } else if (!refilled) frosted = this.board.applyFrost(this.frostTargets.map(c => ({row:c.row+1,col:c.col})));
                }
                this.bossShots = 0;
                this.frostTargets = [];
            } else if (this.stage === 'ordinary' && !inserted && countsAsShot && !this.board.danger && this.accumulatedMisses >= ORDINARY_TUNING.missesPerRow) {
                if(this.remainingRows>0) {this.insertPressureRow();inserted=true;}
                else {this.board.descend();descended=true;}
                this.accumulatedMisses = 0;
                // Region effects belong to the inserted row and commit before danger checking.
                const top = inserted ? this.board.bubbles.filter(b => b.row === 0 && b.col > 0 && b.col < COLUMNS - 2) : [];
                const selected = this.shuffle(top).slice(0, this.difficulty.insertedFrost);
                if (this.region === 'ocean') supported = this.board.applySupport(selected, 'seaweed', this.availableSupportCap);
                else frosted = this.board.applyFrost(selected);
            }
            this.ended = this.board.danger;
            if (this.region === 'cloud' && this.stage === 'boss' && countsAsShot && this.bossShots === BOSS_TUNING.shotsPerAction - 1 && !this.ended) {
                if (!this.frostTargets.length) {
                    this.frostTargets = this.board.bubbles.filter(b => !b.frosted)
                        .map(b => ({bubble:b, key:-Math.log(Math.max(1e-9,this.random())) / (1 + b.row * .35)}))
                        .sort((a,b) => a.key-b.key).slice(0,this.difficulty.frostTargets).map(entry=>entry.bubble)
                        .map(b=>({row:b.row,col:b.col}));
                }
            }
        }
        if (advanceSupply) {
            this.current = this.next;
            this.next = this.choose(this.supplyWeights());
        }
        return { ...result, phaseBefore, inserted, descended, refilled, danger: this.ended && !victory,
            enteredBoss, victory, damage, frosted, supported };
    }

    private get availableSupportCap(): number {
        return Math.max(0,OCEAN_TUNING.supportCap-this.migrationReserve.filter(b=>b.support!==undefined).length);
    }

    private insertPressureRow(): void {
        if(this.stage!=='ordinary') {
            this.board.insertRow(this.random);
            if(this.migrationReserve.length) {
                const bubbles=this.board.bubbles;
                for(const b of bubbles.filter(b=>b.row===0)) {const queued=this.migrationReserve.shift();if(!queued)break;Object.assign(b,{...queued,row:0,col:b.col});}
                this.board.reset(bubbles,this.board.rowPhase);
            }
            return;
        }
        const phase=1-this.board.rowPhase, width=COLUMNS-phase;
        const row: Bubble[]=this.migrationReserve.length
            ? this.migrationReserve.splice(0,width).map((b,col)=>({...b,row:0,col}))
            : (this.futureRows.shift()??[]).slice(0,width).map((color,col)=>({row:0,col,color,frosted:false}));
        // A partially populated migrated row is still finite; never fill it with fresh random bubbles.
        this.board.reset(this.board.bubbles.map(b=>({...b,row:b.row+1})).concat(row),phase);
    }

    /** Invoked only after the preceding shot's effects finish; never resets inventory or queue. */
    beginBoss(): void {
        if (this.stage !== 'boss-entry' || this.ended) throw new Error('Boss entry is not pending.');
        this.migrationReserve=[];this.futureRows=[];
        this.board.reset(this.generateBoss());
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.bossShots = 0;
        this.bossHealth = BOSS_TUNING.health;
        this.frostTargets = [];
        this.stage = 'boss';
    }

    private generateBoss(): Bubble[] {
        const shift = this.completedRegions === 0 ? 0 : Math.floor(this.random() * 3) - 1;
        const board = this.generate(10, false).filter(b => b.row < 8
            || (b.row === 8 && b.col >= 2 + shift && b.col <= COLUMNS - 3 + shift)
            || (b.row === 9 && b.col >= 3 + shift && b.col <= COLUMNS - 5 + shift));
        if (this.region === 'cloud') this.addFrost(board, this.difficulty.bossFrost);
        return board;
    }

    /** Counts plus exposed edges, with a bounded bias toward sampled reachable matches. */
    supplyWeights(): ReadonlyMap<BubbleColor, number> {
        const bubbles = this.board.bubbles;
        const normal = bubbles.filter(b => !b.frosted);
        // If every ball is frosted, retain visible colors so play can continue to strip frost.
        const source = normal.length ? normal : bubbles;
        const occupied = new Set(bubbles.map(b => `${b.row}:${b.col}`));
        const weights = new Map<BubbleColor, number>();
        for (const b of source) {
            const exposed = this.board.neighbors(b).some(c => c.row >= b.row && !occupied.has(`${c.row}:${c.col}`));
            weights.set(b.color, (weights.get(b.color) ?? 0) + 1 + (exposed ? 2 : 0));
        }
        if (this.consecutiveMisses >= ORDINARY_TUNING.protectionAfter) {
            const useful = new Set<BubbleColor>();
            for (let angle = -70; angle <= 70; angle += 5) {
                const radians = angle * Math.PI / 180;
                const shot = this.board.trace({ x: Math.sin(radians), y: Math.cos(radians) });
                if (!shot) continue;
                for (const color of Array.from(weights.keys())) {
                    if (this.board.matchingCount(shot.cell, color) >= 2) useful.add(color);
                }
            }
            useful.forEach(color => weights.set(color, weights.get(color)! * 1.35));
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

    private generate(rows: number, frost = true): Bubble[] {
        const palette = this.shuffle(COLORS);
        const variant = Math.min(2, Math.floor(this.random() * 3));
        const offset = Math.min(3, Math.floor(this.random() * 4));
        const bubbles: Bubble[] = [];
        for (let row = 0; row < rows; row++) for (let col = 0; col < COLUMNS - row % 2; col++) {
            const band = variant === 0 ? Math.floor(col / 2) + Math.floor(row / 2)
                : variant === 1 ? Math.floor((col + row % 2) / 2) + Math.floor(row / 3)
                : Math.floor(col / 3) + Math.floor(row / 2);
            bubbles.push({ row, col, color: palette[(band + offset) % 4]!, frosted: false });
        }
        const cells = new Map(bubbles.map(b => [`${b.row}:${b.col}`, b]));
        for (const bubble of bubbles) {
            // Preserve exposed pairs, and avoid bridging neighboring groups when fragmenting the interior.
            if (bubble.row >= rows - 2 || this.random() >= this.difficulty.colorScatter) continue;
            const adjacent = neighbors(bubble).map(c => cells.get(`${c.row}:${c.col}`)).filter((b): b is Bubble => !!b);
            const choices = palette.filter(color => color !== bubble.color && !adjacent.some(b => b.color === color));
            if (choices.length) bubble.color = choices[Math.floor(this.random() * choices.length)]!;
        }
        if (frost) {
            if (this.region === 'cloud') this.addFrost(bubbles, this.difficulty.ordinaryFrost);
            else {
                const anchors: Bubble[] = [];
                for (const bubble of this.shuffle(bubbles.filter(b => b.row >= 2 && b.row < rows - 1))) {
                    if (anchors.length >= Math.min(OCEAN_TUNING.ordinaryAnchors,this.availableSupportCap)) break;
                    if (anchors.some(b => Math.abs(b.row - bubble.row) <= 1 && Math.abs(b.col - bubble.col) <= 1)) continue;
                    bubble.support = 'seaweed'; anchors.push(bubble);
                }
            }
        }
        return bubbles;
    }

    clear(): void {
        this.migrationReserve=[];this.futureRows=[];
        this.board.reset([]);
        this.frostTargets = [];
        this.inventory.bomb = 0;
        this.inventory.wildcard = 0;
        this.inventory['clear-bottom'] = 0;
        this.ended = true;
        this.accumulatedMisses = 0;
        this.consecutiveMisses = 0;
        this.cleared = 0;
    }
}
