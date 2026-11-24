import { COZY_LEVELS } from './CozySudokuLevels';
import { CozySudokuModel, type SudokuSnapshot } from './CozySudokuModel';
import { cozyPuzzleId, RULE_NAMES, type RuleName } from './CozySudokuRules';

export interface CozySudokuSave {
    campaignVersion: 3;
    unlockedLevel: number;
    records: Record<number, { bestTime?: number; clearedAt: number }>;
    /** Includes retired puzzles so a reorder never loses or misassigns a result. */
    puzzleRecords: Record<string, { bestTime?: number; clearedAt: number }>;
    tutorials: RuleName[];
    draft?: SudokuSnapshot;
    archivedDraft?: SudokuSnapshot;
}
export function readCozySave(value: unknown): CozySudokuSave {
    const raw = value && typeof value === 'object' ? value as Partial<CozySudokuSave> : {};
    const records: CozySudokuSave['records'] = {}, puzzleRecords: CozySudokuSave['puzzleRecords'] = {};
    const validRecord=(record: CozySudokuSave['records'][number] | undefined): record is CozySudokuSave['records'][number] =>
        !!record && (record.bestTime === undefined || Number.isFinite(record.bestTime) && record.bestTime >= 0)
            && Number.isFinite(record.clearedAt) && record.clearedAt > 0;
    if(raw.campaignVersion===3) {
        for(const id of Object.keys(raw.puzzleRecords??{})) {
            const record=raw.puzzleRecords![id];
            if((/^v2-(?:[1-9]\d{0,2})$/.test(id)&&Number(id.slice(3))<=600||/^v3-[0-9a-f]{16}$/.test(id))&&validRecord(record))
                puzzleRecords[id]={bestTime:record.bestTime,clearedAt:record.clearedAt};
        }
    } else for(let i=1;i<=600;i++) {
        const record=raw.records?.[i];
        if(validRecord(record))puzzleRecords[`v2-${i}`]={bestTime:record.bestTime,clearedAt:record.clearedAt};
    }
    for (const level of COZY_LEVELS) {
        const record = puzzleRecords[cozyPuzzleId(level)];
        if (validRecord(record)) {
            records[level.levelNumber] = { bestTime: record.bestTime, clearedAt: record.clearedAt };
        }
    }
    // Unlock follows the contiguous cleared prefix; stale or corrupt unlock counters cannot skip puzzles.
    let unlockedLevel = 1;
    while (records[unlockedLevel] && unlockedLevel < COZY_LEVELS.length) unlockedLevel++;
    const known = Object.keys(RULE_NAMES) as RuleName[];
    const tutorials = Array.isArray(raw.tutorials) ? known.filter(r => raw.tutorials!.indexOf(r) >= 0) : [];
    const migrateDraft=(value: SudokuSnapshot | undefined):SudokuSnapshot | undefined=>{
        if(!value||!Number.isInteger(value.levelNumber)||value.levelNumber<1||value.levelNumber>600)return;
        const id=raw.campaignVersion===3?value.puzzleId:`v2-${value.levelNumber}`;
        const level=COZY_LEVELS.find(l=>cozyPuzzleId(l)===id);
        if(!level||level.levelNumber>unlockedLevel)return;
        return new CozySudokuModel(level,{...value,levelNumber:level.levelNumber,puzzleId:id}).snapshot();
    };
    const draft=migrateDraft(raw.draft)??migrateDraft(raw.archivedDraft);
    // Preserve removed or currently locked puzzle drafts without making them playable.
    // They must never be interpreted against a different puzzle at that number.
    const retired=raw.draft&&!draft?raw.draft:raw.archivedDraft;
    const archivedDraft=retired&&Array.isArray(retired.cells)&&retired.cells.length<=81
        && Array.isArray(retired.notes)&&retired.notes.length===retired.cells.length
        ? {...retired,puzzleId:raw.campaignVersion===3?retired.puzzleId:`v2-${retired.levelNumber}`,
            history:Array.isArray(retired.history)?retired.history.slice(-100):[]} : undefined;
    return { campaignVersion:3, unlockedLevel, records, puzzleRecords, tutorials, draft, archivedDraft };
}
export function completeCozyLevel(save: CozySudokuSave, model: CozySudokuModel, now = Date.now()): boolean {
    if (!model.completed || model.level.levelNumber > save.unlockedLevel) return false;
    const number = model.level.levelNumber, previous = save.records[number];
    // Cloud restores completion only; an unknown remote time is never a zero-second record.
    const best = previous?.bestTime === undefined || model.elapsed < previous.bestTime;
    save.records[number] = { bestTime: best ? model.elapsed : previous.bestTime, clearedAt: now };
    save.puzzleRecords[cozyPuzzleId(model.level)] = {...save.records[number]};
    while(save.records[save.unlockedLevel]&&save.unlockedLevel<COZY_LEVELS.length)save.unlockedLevel++;
    if (save.draft?.levelNumber === number) save.draft = undefined;
    return best;
}
export function cozyTime(seconds: number): string {
    const rounded = Math.floor(Math.max(0, seconds));
    const pad = (n: number): string => n < 10 ? `0${n}` : String(n);
    return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}
