export type FaceName = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export type DirName = 'right' | 'left' | 'up' | 'down';

export const CUBE_AWAY_LEVEL_BANK = 'mint-original-v8';
export const CUBE_AWAY_TOTAL_LEVELS = 500;
export const CUBE_AWAY_CHAPTER_SIZE = 20;
export const CUBE_AWAY_CHAPTER_COUNT = CUBE_AWAY_TOTAL_LEVELS / CUBE_AWAY_CHAPTER_SIZE;

export type CubeAwayDifficulty = 'normal' | 'hard' | 'expert';

export function cubeAwayDifficulty(level: number): CubeAwayDifficulty {
    if (level % CUBE_AWAY_CHAPTER_SIZE === 0) return 'expert';
    return level % 5 === 0 ? 'hard' : 'normal';
}

export function hasCubeAwayEdgeRelay(level: number): boolean {
    return level >= 13 && (level % 5 === 3 || level % 10 === 0);
}

export function hasCubeAwayDoubleChain(level: number): boolean {
    if (level < 15) return false;
    const slot = level % 20;
    return slot === 7 || slot === 14 || slot === 15 || level % 40 === 0;
}

export const FACES: readonly FaceName[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
export const DIRS: readonly DirName[] = ['right', 'left', 'up', 'down'];
export const DIR_CHARS: Record<string, DirName> = {
    R: 'right',
    L: 'left',
    U: 'up',
    D: 'down',
};

export const OPPOSITE_DIR: Record<DirName, DirName> = {
    right: 'left',
    left: 'right',
    up: 'down',
    down: 'up',
};

export function resolveSplitExits(primary: DirName, secondary?: DirName): readonly [DirName, DirName] {
    return [primary, secondary && secondary !== primary ? secondary : OPPOSITE_DIR[primary]];
}

export const OPPOSITE_FACE: Record<FaceName, FaceName> = {
    '+x': '-x',
    '-x': '+x',
    '+y': '-y',
    '-y': '+y',
    '+z': '-z',
    '-z': '+z',
};

export type Vec3Tuple = readonly [number, number, number];

export const FACE_NORMAL: Record<FaceName, Vec3Tuple> = {
    '+x': [1, 0, 0],
    '-x': [-1, 0, 0],
    '+y': [0, 1, 0],
    '-y': [0, -1, 0],
    '+z': [0, 0, 1],
    '-z': [0, 0, -1],
};

/**
 * Right-handed per-face 2D basis matching Unity/Cocos screen orientation
 * when viewing each cube face from outside with +Y up (top face -Z up).
 */
export const CUBE_FRAME: Record<FaceName, Record<DirName, Vec3Tuple>> = {
    '+x': { up: [0, 1, 0], down: [0, -1, 0], left: [0, 0, 1], right: [0, 0, -1] },
    '-x': { up: [0, 1, 0], down: [0, -1, 0], left: [0, 0, -1], right: [0, 0, 1] },
    '+y': { up: [0, 0, -1], down: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0] },
    '-y': { up: [0, 0, 1], down: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0] },
    '+z': { up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0] },
    '-z': { up: [0, 1, 0], down: [0, -1, 0], left: [1, 0, 0], right: [-1, 0, 0] },
};

export type GimmickTypeName = 'pause' | 'changer' | 'reverse_changer' | 'split_changer';

export const GIMMICK_CODE_TO_TYPE: Record<number, GimmickTypeName> = {
    1: 'pause',
    2: 'changer',
    3: 'reverse_changer',
    4: 'split_changer',
};

export interface RawArrowPack {
    /** Head cell [x, y, z, faceIdx] */
    h: [number, number, number, number];
    /** Fire direction idx into DIRS */
    d: number;
    /** Bit 1 = double, bit 2 = branch */
    f: number;
    /** Linked branch group id (0 = standalone) */
    g: number;
    /** RLE step string from head to tail, e.g. 'U2R3' */
    r?: string;
}

export interface RawLevelPack {
    id: number;
    size: [number, number, number];
    cam: [number, number, number, number];
    arrows: RawArrowPack[];
    /** Carved solid rectangular spans [x0,y0,z0, x1,y1,z1]; omitted if full box */
    vox?: number[][];
    /** Cornerless edges: [x, y, z, face1Idx, face2Idx] */
    ce?: number[][];
    /** Gimmicks: [x, y, z, faceIdx, typeCode, exitDirIdx, exitDir2Idx] */
    gim?: number[][];
}

export interface ChapterPack {
    bankId: string;
    chapter: number;
    levels: RawLevelPack[];
}

export interface ChapterSummary {
    chapter: number;
    title: string;
    desc: string;
    startLevel: number;
    endLevel: number;
    newMechs: string[];
    allMechs: string[];
}

export interface LevelSummary {
    id: number;
    ch: number;
    ac: number;
    sz: [number, number, number];
    difficulty: CubeAwayDifficulty;
    m: string[];
}

export interface LevelIndexData {
    bankId: string;
    schemaVersion: number;
    totalLevels: number;
    totalChapters: number;
    levelsPerChapter: number;
    chapters: ChapterSummary[];
    levels: LevelSummary[];
}

export interface GimmickRuntime {
    cellId: string;
    x: number;
    y: number;
    z: number;
    face: FaceName;
    type: GimmickTypeName;
    exitDir?: DirName;
    exitDir2?: DirName;
    currentReverseDir?: DirName;
}

export interface PausedSnakePosition {
    readonly id: number;
    readonly cells: readonly string[];
    readonly fireDir: DirName;
}

export interface ArrowRuntime {
    id: number;
    cells: string[];
    fireDir: DirName;
    isDouble: boolean;
    isBranch: boolean;
    linkGroup: number;
    colorIndex: number;
    removed: boolean;
}

export type NeighborKind = 'flat' | 'wrap' | 'concave';

export interface SurfaceNeighbor {
    nextCellId: string;
    nextDir: DirName;
    kind: NeighborKind;
}

export interface PathStep {
    cellId: string;
    dir: DirName;
    crossedCornerless: boolean;
    isHollowJump: boolean;
    hitGimmick?: GimmickTypeName;
}

export interface SplitBranchPath {
    steps: PathStep[];
    finalDir: DirName;
    blockedByArrowId?: number;
}

export type TraceOutcome = 'clear' | 'pause' | 'blocked';

export interface TraceResult {
    arrowId: number;
    outcome: TraceOutcome;
    useTail: boolean;
    steps: PathStep[];
    finalDir: DirName;
    blockedByArrowId?: number;
    blockerCellId?: string;
    splitBranches?: [SplitBranchPath, SplitBranchPath];
    reverseUpdates: Array<{ cellId: string; nextDir: DirName }>;
}

export interface TapResolution {
    accepted: boolean;
    outcome: 'clear' | 'pause' | 'blocked' | 'ignored';
    firedArrowIds: number[];
    pausedArrowIds: number[];
    bouncedArrowIds: number[];
    traces: TraceResult[];
    blockerCellId?: string;
    levelCleared: boolean;
}

export interface CubeAwayLevelRecord {
    clearedAt: number;
    bestMoves: number;
    mistakes: number;
}

export interface CubeAwaySaveData {
    version: number;
    currentLevel: number;
    selectedChapter: number;
    hintsRemaining: number;
    smashesRemaining: number;
    seenMechanics: string[];
    cleared: Record<string, CubeAwayLevelRecord>;
    totalClearedCount: number;
}

export function formatCellId(x: number, y: number, z: number, face: FaceName): string {
    return `${x},${y},${z}:${face}`;
}

export function parseCellId(cellId: string): { x: number; y: number; z: number; face: FaceName } {
    const colon = cellId.indexOf(':');
    const face = cellId.slice(colon + 1) as FaceName;
    const xyz = cellId.slice(0, colon);
    const c1 = xyz.indexOf(',');
    const c2 = xyz.indexOf(',', c1 + 1);
    return {
        x: parseInt(xyz.slice(0, c1), 10),
        y: parseInt(xyz.slice(c1 + 1, c2), 10),
        z: parseInt(xyz.slice(c2 + 1), 10),
        face,
    };
}
