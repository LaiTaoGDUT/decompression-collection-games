export const BOARD_COLUMNS = 9;
export const BOARD_ROWS = 10;
export const MAX_BOARD_REINFORCEMENT_THRESHOLD = 16;
/** 每种道具最多持有的数量；奖励满额的道具不会再出现在三选一中。 */
export const ITEM_CAPACITY = 2;

/**
 * 开局前两批增援提前入场，避免玩家在只有初始五枚敌棋的状态下空走太久。
 * 后续低压到中压区间也各收紧约 1 回合；高压末段保留原节奏，避免增援过密。
 */
const OPENING_REINFORCEMENT_PACING = Object.freeze({
    waves: 2,
    minimumTurns: 3,
    maximumTurns: 4,
});

/**
 * 无尽难度曲线。每回合仍只移动一枚敌棋，压力来自三方面：
 * 棋盘可容纳的敌棋数随难度增加、后期增援更密、AI 对玩家应手做一层推演。
 */
export const DIFFICULTY_TUNING = Object.freeze({
    // 首只将军只需 4 批普通增援，让多数玩家在前几十回合就能斩将拿到道具。
    firstGeneralTarget: 4,
    // 难度 ≥ capacityGrowthStart 后，每 capacityGrowthEvery 级多容纳一枚普通增援。
    capacityGrowthStart: 9,
    capacityGrowthEvery: 3,
    maxBoardCapacity: 22,
    // 难度 ≥ lookaheadStart 后，AI 对单步评分最高的若干走法推演玩家的最佳应手。
    lookaheadStart: 3,
    lookaheadCandidates: 10,
    lookaheadWeightPerLevel: 8,
    lookaheadMaxWeight: 48,
    // 普通棋逃离车线的倾向随难度衰减：后期敌棋更敢留在车线上封锁退路。
    escapeDecayPerLevel: 0.03,
    minimumEscapeFactor: 0.4,
});

/** 当前难度下普通增援还能入场时，棋盘上允许的敌棋数量上限。 */
export function boardCapacity(difficulty: number): number {
    if (difficulty < DIFFICULTY_TUNING.capacityGrowthStart) return MAX_BOARD_REINFORCEMENT_THRESHOLD;
    const growth = 1 + Math.floor(
        (difficulty - DIFFICULTY_TUNING.capacityGrowthStart) / DIFFICULTY_TUNING.capacityGrowthEvery,
    );
    return Math.min(DIFFICULTY_TUNING.maxBoardCapacity, MAX_BOARD_REINFORCEMENT_THRESHOLD + growth);
}

/**
 * 将军保护使用固定评分，不随隐藏难度递增。
 *
 * 普通棋脱离玩家车的直接威胁时会获得 `(600 + 棋子价值 × 3) × 逃离系数`，
 * 逃离系数从 1 随难度衰减到 0.4。难度 1 时马的有效脱险分为 690，高于将军的
 * 680；后期普通棋更愿意留在车线上，将军的脱险优先级随之相对升高。
 */
export const GENERAL_AI_SCORING = Object.freeze({
    // 将军成功脱离玩家车的直接威胁时获得的分数；马的有效脱险分仍更高。
    escapeThreat: 600,
    // 其他棋子通过挡线解除将军威胁时获得的分数。
    guardedByAlly: 100,
    // 将军原本已受威胁且行动后仍未脱险的扣分。
    remainsThreatened: 350,
    // 将军原本安全却因本次行动暴露在车线上的扣分。
    newlyExposed: 600,
});

export type EnemyPieceType =
    | 'pawn'
    | 'advisor'
    | 'elephant'
    | 'horse'
    | 'cannon'
    | 'rook'
    | 'general';

export type ItemType = 'crossSlash' | 'freeze' | 'delay' | 'banish' | 'teleport';
export type GamePhase = 'player' | 'enemy' | 'reward' | 'dead' | 'ended';
export type ReinforcementState = 'COUNTDOWN' | 'WAITING' | 'GENERAL_COUNTDOWN' | 'GENERAL_WAITING';
export type KillSource = 'normal' | 'cross';

export interface BoardPosition {
    readonly column: number;
    readonly row: number;
}

export interface EnemyPiece {
    readonly id: number;
    readonly type: EnemyPieceType;
    position: BoardPosition;
    frozenTurns: number;
    isNewlySpawned: boolean;
}

export interface ReinforcementQueue {
    readonly kind: 'normal' | 'general';
    readonly types: readonly EnemyPieceType[];
}

export interface Inventory {
    crossSlash: number;
    freeze: number;
    delay: number;
    banish: number;
    teleport: number;
}

export interface KillRecord {
    readonly piece: EnemyPiece;
    readonly source: KillSource;
    readonly score: number;
}

export interface PlayerMoveResult {
    readonly from: BoardPosition;
    readonly to: BoardPosition;
    readonly captured?: KillRecord;
    readonly crossSlashKills: readonly KillRecord[];
    readonly scoreDelta: number;
    readonly combo: number;
    readonly generalKilled: boolean;
    readonly immediateSpawned: readonly EnemyPiece[];
    readonly immediateReinforcementKind?: 'normal' | 'general';
}

export interface EnemyTurnResult {
    readonly moved?: Readonly<{
        pieceId: number;
        type: EnemyPieceType;
        from: BoardPosition;
        to: BoardPosition;
    }>;
    readonly killedPlayer: boolean;
    readonly scoreDelta: number;
    readonly spawned: readonly EnemyPiece[];
    readonly reinforcementKind?: 'normal' | 'general';
    readonly enteredWaiting: boolean;
}

export interface ItemUseResult {
    readonly item: ItemType;
    readonly target?: BoardPosition;
    readonly removed?: EnemyPiece;
}

export interface ReviveResult {
    readonly kills: readonly KillRecord[];
    readonly scoreDelta: number;
    readonly generalKilled: boolean;
}

export interface ChessEndlessSnapshot {
    readonly seed: number;
    readonly rngState: number;
    readonly playerPosition: BoardPosition;
    readonly enemies: readonly EnemyPiece[];
    readonly turnNumber: number;
    readonly score: number;
    readonly combo: number;
    readonly maxCombo: number;
    readonly totalKills: number;
    readonly killStats: Readonly<Record<EnemyPieceType, number>>;
    readonly normalReinforcementCount: number;
    readonly reinforcementTimer: number;
    readonly reinforcementState: ReinforcementState;
    readonly queuedReinforcement: ReinforcementQueue;
    readonly difficultyLevel: number;
    readonly generalActive: boolean;
    readonly generalCounter: number;
    readonly generalTargetN: number;
    readonly generalKills: number;
    readonly inventory: Readonly<Inventory>;
    readonly reviveUsed: boolean;
    readonly usedItemThisTurn: boolean;
    readonly pendingCrossSlash: boolean;
    readonly phase: GamePhase;
    readonly pendingRewardChoices: readonly ItemType[];
    readonly rewardResumePhase?: 'player' | 'enemy';
    readonly nextPieceId: number;
}

export const PIECE_DISPLAY: Readonly<Record<EnemyPieceType, string>> = Object.freeze({
    pawn: '卒',
    advisor: '士',
    elephant: '象',
    horse: '马',
    cannon: '炮',
    rook: '車',
    general: '将',
});

export const PIECE_VALUE: Readonly<Record<EnemyPieceType, number>> = Object.freeze({
    pawn: 10,
    advisor: 15,
    elephant: 20,
    horse: 30,
    cannon: 40,
    rook: 60,
    general: 200,
});

export const PIECE_SCORE: Readonly<Record<EnemyPieceType, number>> = Object.freeze({
    pawn: 10,
    advisor: 15,
    elephant: 20,
    horse: 30,
    cannon: 40,
    rook: 60,
    general: 300,
});

export const ITEM_DISPLAY: Readonly<Record<ItemType, string>> = Object.freeze({
    crossSlash: '十字斩',
    freeze: '定身符',
    delay: '缓兵符',
    banish: '驱逐令',
    teleport: '移形符',
});

export const ITEM_DESCRIPTIONS: Readonly<Record<ItemType, string>> = Object.freeze({
    crossSlash: "本次行动后，清除车所在横线与竖线上的全部敌棋。",
    freeze: '封住一枚普通敌棋，使其跳过下一个敌方回合。',
    delay: '当前增援倒计时增加 2 回合。',
    banish: '移走一枚普通敌棋；不计击杀与得分。',
    teleport: "立即传送到任意空格；随后继续行动。",
});

const ITEM_TYPES: readonly ItemType[] = Object.freeze([
    'crossSlash', 'freeze', 'delay', 'banish', 'teleport',
]);
const NORMAL_TYPES: readonly EnemyPieceType[] = Object.freeze([
    'pawn', 'advisor', 'elephant', 'horse', 'cannon', 'rook',
]);
const DIRECTIONS: readonly BoardPosition[] = Object.freeze([
    Object.freeze({ column: 1, row: 0 }),
    Object.freeze({ column: -1, row: 0 }),
    Object.freeze({ column: 0, row: 1 }),
    Object.freeze({ column: 0, row: -1 }),
]);
const HORSE_MOVES: readonly BoardPosition[] = Object.freeze([
    Object.freeze({ column: 2, row: 1 }), Object.freeze({ column: 2, row: -1 }),
    Object.freeze({ column: -2, row: 1 }), Object.freeze({ column: -2, row: -1 }),
    Object.freeze({ column: 1, row: 2 }), Object.freeze({ column: -1, row: 2 }),
    Object.freeze({ column: 1, row: -2 }), Object.freeze({ column: -1, row: -2 }),
]);

const ENEMY_TYPES: readonly EnemyPieceType[] = Object.freeze([
    'pawn', 'advisor', 'elephant', 'horse', 'cannon', 'rook', 'general',
]);

const PHASES: readonly GamePhase[] = Object.freeze([
    'player', 'enemy', 'reward', 'dead', 'ended',
]);

const REINFORCEMENT_STATES: readonly ReinforcementState[] = Object.freeze([
    'COUNTDOWN', 'WAITING', 'GENERAL_COUNTDOWN', 'GENERAL_WAITING',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSnapshotInteger(value: unknown, field: string, minimum = 0): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    return value;
}

function requireSnapshotUint32(value: unknown, field: string): number {
    const integer = requireSnapshotInteger(value, field);
    if (integer > 0xffffffff) {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    return integer;
}

function requireSnapshotBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    return value;
}

function requireSnapshotPosition(value: unknown, field: string): void {
    if (!isRecord(value)) {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    const column = requireSnapshotInteger(value.column, `${field}.column`);
    const row = requireSnapshotInteger(value.row, `${field}.row`);
    if (!isInside(position(column, row))) {
        throw new Error(`Chess snapshot position is outside the board: ${field}.`);
    }
}

function requireSnapshotEnemyType(value: unknown, field: string): EnemyPieceType {
    if (typeof value !== 'string' || ENEMY_TYPES.indexOf(value as EnemyPieceType) < 0) {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    return value as EnemyPieceType;
}

function requireSnapshotItemType(value: unknown, field: string): ItemType {
    if (typeof value !== 'string' || ITEM_TYPES.indexOf(value as ItemType) < 0) {
        throw new Error(`Invalid chess snapshot field: ${field}.`);
    }

    return value as ItemType;
}

/** 验证可恢复快照，避免损坏的本地存档把游戏带入不可操作状态。 */
function validateSnapshot(value: unknown): asserts value is ChessEndlessSnapshot {
    if (!isRecord(value)) {
        throw new Error('Chess snapshot must be an object.');
    }

    requireSnapshotUint32(value.seed, 'seed');
    requireSnapshotUint32(value.rngState, 'rngState');
    requireSnapshotPosition(value.playerPosition, 'playerPosition');
    requireSnapshotInteger(value.turnNumber, 'turnNumber');
    requireSnapshotInteger(value.score, 'score');
    requireSnapshotInteger(value.combo, 'combo');
    requireSnapshotInteger(value.maxCombo, 'maxCombo');
    requireSnapshotInteger(value.totalKills, 'totalKills');
    requireSnapshotInteger(value.normalReinforcementCount, 'normalReinforcementCount');
    requireSnapshotInteger(value.reinforcementTimer, 'reinforcementTimer');
    requireSnapshotInteger(value.difficultyLevel, 'difficultyLevel', 1);
    requireSnapshotInteger(value.generalCounter, 'generalCounter');
    requireSnapshotInteger(value.generalTargetN, 'generalTargetN', 1);
    requireSnapshotInteger(value.generalKills, 'generalKills');
    const nextPieceId = requireSnapshotInteger(value.nextPieceId, 'nextPieceId', 1);
    requireSnapshotBoolean(value.generalActive, 'generalActive');
    requireSnapshotBoolean(value.reviveUsed, 'reviveUsed');
    requireSnapshotBoolean(value.usedItemThisTurn, 'usedItemThisTurn');
    requireSnapshotBoolean(value.pendingCrossSlash, 'pendingCrossSlash');

    if (typeof value.phase !== 'string' || PHASES.indexOf(value.phase as GamePhase) < 0) {
        throw new Error('Invalid chess snapshot field: phase.');
    }

    if (typeof value.reinforcementState !== 'string'
        || REINFORCEMENT_STATES.indexOf(value.reinforcementState as ReinforcementState) < 0) {
        throw new Error('Invalid chess snapshot field: reinforcementState.');
    }

    const enemies = value.enemies;
    if (!Array.isArray(enemies)) {
        throw new Error('Invalid chess snapshot field: enemies.');
    }
    const enemyIds = new Set<number>();
    const occupied = new Set<string>();
    enemies.forEach((rawEnemy: unknown, index) => {
        if (!isRecord(rawEnemy)) {
            throw new Error(`Invalid chess snapshot enemy at index ${index}.`);
        }
        const id = requireSnapshotInteger(rawEnemy.id, `enemies[${index}].id`);
        requireSnapshotEnemyType(rawEnemy.type, `enemies[${index}].type`);
        requireSnapshotPosition(rawEnemy.position, `enemies[${index}].position`);
        requireSnapshotInteger(rawEnemy.frozenTurns, `enemies[${index}].frozenTurns`);
        requireSnapshotBoolean(rawEnemy.isNewlySpawned, `enemies[${index}].isNewlySpawned`);
        if (enemyIds.has(id)) {
            throw new Error(`Duplicate chess snapshot enemy ID: ${id}.`);
        }
        // 新增援从 nextPieceId 开始分配 ID；它不大于现有 ID 时新棋会与旧棋撞号。
        if (id >= nextPieceId) {
            throw new Error(`Chess snapshot enemy ID ${id} is not below nextPieceId.`);
        }
        enemyIds.add(id);
        const positionValue = rawEnemy.position as Record<string, unknown>;
        const positionId = `${positionValue.column},${positionValue.row}`;
        if (occupied.has(positionId)) {
            throw new Error(`Duplicate chess snapshot position: ${positionId}.`);
        }
        occupied.add(positionId);
    });

    // 车被吃时击杀者落在车的格子上，死亡（及随后结束）快照中两者重叠是合法状态。
    const playerPosition = value.playerPosition as Record<string, unknown>;
    const playerCaptured = value.phase === 'dead' || value.phase === 'ended';
    if (!playerCaptured && occupied.has(`${playerPosition.column},${playerPosition.row}`)) {
        throw new Error('Chess snapshot player overlaps an enemy.');
    }

    if (!isRecord(value.killStats)) {
        throw new Error('Invalid chess snapshot field: killStats.');
    }
    for (const type of ENEMY_TYPES) {
        requireSnapshotInteger(value.killStats[type], `killStats.${type}`);
    }

    if (!isRecord(value.queuedReinforcement)
        || (value.queuedReinforcement.kind !== 'normal'
            && value.queuedReinforcement.kind !== 'general')
        || !Array.isArray(value.queuedReinforcement.types)) {
        throw new Error('Invalid chess snapshot field: queuedReinforcement.');
    }
    value.queuedReinforcement.types.forEach((type, index) => {
        requireSnapshotEnemyType(type, `queuedReinforcement.types[${index}]`);
    });

    if (!isRecord(value.inventory)) {
        throw new Error('Invalid chess snapshot field: inventory.');
    }
    for (const item of ITEM_TYPES) {
        const count = requireSnapshotInteger(value.inventory[item], `inventory.${item}`);
        if (count > ITEM_CAPACITY) {
            throw new Error(`Chess snapshot inventory exceeds capacity: ${item}.`);
        }
    }

    if (!Array.isArray(value.pendingRewardChoices)) {
        throw new Error('Invalid chess snapshot field: pendingRewardChoices.');
    }
    value.pendingRewardChoices.forEach((item, index) => {
        requireSnapshotItemType(item, `pendingRewardChoices[${index}]`);
    });
    if (value.rewardResumePhase !== undefined
        && value.rewardResumePhase !== 'player'
        && value.rewardResumePhase !== 'enemy') {
        throw new Error('Invalid chess snapshot field: rewardResumePhase.');
    }
    const phase = value.phase as GamePhase;
    if (phase === 'reward'
        ? value.pendingRewardChoices.length === 0 || value.rewardResumePhase === undefined
        : value.pendingRewardChoices.length > 0 || value.rewardResumePhase !== undefined) {
        throw new Error('Chess snapshot reward state is inconsistent.');
    }
}

function position(column: number, row: number): BoardPosition {
    return Object.freeze({ column, row });
}

function copyPosition(value: BoardPosition): BoardPosition {
    return position(value.column, value.row);
}

function samePosition(left: BoardPosition, right: BoardPosition): boolean {
    return left.column === right.column && left.row === right.row;
}

function positionKey(value: BoardPosition): string {
    return `${value.column},${value.row}`;
}

function isInside(value: BoardPosition): boolean {
    return isInsideCell(value.column, value.row);
}

function isInsideCell(column: number, row: number): boolean {
    return column >= 0 && column < BOARD_COLUMNS && row >= 0 && row < BOARD_ROWS;
}

function cellIndex(column: number, row: number): number {
    return row * BOARD_COLUMNS + column;
}

/**
 * 规则推演用的棋盘占位表：按格子下标 O(1) 查询敌棋，替代逐枚扫描敌棋数组。
 * 推演只临时改动格子占位或被模拟棋子的坐标，并在同一次调用内恢复，不再整盘克隆敌棋。
 */
class BoardOccupancy {
    private readonly cells: (EnemyPiece | undefined)[] = new Array(BOARD_COLUMNS * BOARD_ROWS).fill(undefined);

    constructor(readonly pieces: readonly EnemyPiece[]) {
        for (const piece of pieces) {
            this.cells[cellIndex(piece.position.column, piece.position.row)] = piece;
        }
    }

    at(column: number, row: number): EnemyPiece | undefined {
        return isInsideCell(column, row) ? this.cells[cellIndex(column, row)] : undefined;
    }

    /** 暂时清空一格（模拟该格敌棋被车吃掉），返回原占位供 `put` 恢复。 */
    take(column: number, row: number): EnemyPiece | undefined {
        const index = cellIndex(column, row);
        const piece = this.cells[index];
        this.cells[index] = undefined;
        return piece;
    }

    put(piece: EnemyPiece | undefined, column: number, row: number): void {
        this.cells[cellIndex(column, row)] = piece;
    }

    /** 棋子仍在棋盘上：被 `take` 暂时吃掉的棋子不再参与攻击判定。 */
    holds(piece: EnemyPiece): boolean {
        return this.cells[cellIndex(piece.position.column, piece.position.row)] === piece;
    }

    /** 把棋子挪到目标格；只用于推演副本，调用方负责再挪回原位。 */
    relocate(piece: EnemyPiece, to: BoardPosition): void {
        this.cells[cellIndex(piece.position.column, piece.position.row)] = undefined;
        this.cells[cellIndex(to.column, to.row)] = piece;
        piece.position = to;
    }
}

function playerMoves(player: BoardPosition, board: BoardOccupancy): BoardPosition[] {
    const moves: BoardPosition[] = [];
    for (const direction of DIRECTIONS) {
        let column = player.column + direction.column;
        let row = player.row + direction.row;
        while (isInsideCell(column, row)) {
            moves.push(position(column, row));
            if (board.at(column, row)) break;
            column += direction.column;
            row += direction.row;
        }
    }
    return moves;
}

/** 车四个方向上第一枚敌棋，即车下一步可直接吃到的敌棋。 */
function playerThreatenedIds(player: BoardPosition, board: BoardOccupancy): Set<number> {
    const threatened = new Set<number>();
    for (const direction of DIRECTIONS) {
        let column = player.column + direction.column;
        let row = player.row + direction.row;
        while (isInsideCell(column, row)) {
            const enemy = board.at(column, row);
            if (enemy) {
                threatened.add(enemy.id);
                break;
            }
            column += direction.column;
            row += direction.row;
        }
    }
    return threatened;
}

function countBetween(from: BoardPosition, column: number, row: number, board: BoardOccupancy): number {
    if (from.column !== column && from.row !== row) return -1;
    const columnStep = Math.sign(column - from.column);
    const rowStep = Math.sign(row - from.row);
    let currentColumn = from.column + columnStep;
    let currentRow = from.row + rowStep;
    let count = 0;
    while (currentColumn !== column || currentRow !== row) {
        if (board.at(currentColumn, currentRow)) count += 1;
        currentColumn += columnStep;
        currentRow += rowStep;
    }
    return count;
}

function enemyCanCapture(piece: EnemyPiece, column: number, row: number, board: BoardOccupancy): boolean {
    const deltaColumn = column - piece.position.column;
    const deltaRow = row - piece.position.row;
    const absColumn = Math.abs(deltaColumn);
    const absRow = Math.abs(deltaRow);
    if (piece.type === 'pawn' || piece.type === 'general') return absColumn + absRow === 1;
    if (piece.type === 'advisor') return absColumn === 1 && absRow === 1;
    if (piece.type === 'elephant') {
        if (absColumn !== 2 || absRow !== 2) return false;
        return !board.at(
            piece.position.column + Math.sign(deltaColumn),
            piece.position.row + Math.sign(deltaRow),
        );
    }
    if (piece.type === 'horse') {
        if (!((absColumn === 2 && absRow === 1) || (absColumn === 1 && absRow === 2))) return false;
        return absColumn === 2
            ? !board.at(piece.position.column + Math.sign(deltaColumn), piece.position.row)
            : !board.at(piece.position.column, piece.position.row + Math.sign(deltaRow));
    }
    const between = countBetween(piece.position, column, row, board);
    if (piece.type === 'rook') return between === 0;
    if (piece.type === 'cannon') return between === 1;
    return false;
}

/** 车落到该格（若有敌棋则吃掉）后，是否会被未定身的敌棋吃掉。 */
function isLandingAttacked(column: number, row: number, board: BoardOccupancy): boolean {
    const captured = board.take(column, row);
    const attacked = board.pieces.some((piece) => (
        board.holds(piece) && piece.frozenTurns <= 0 && enemyCanCapture(piece, column, row, board)
    ));
    board.put(captured, column, row);
    return attacked;
}

function safePlayerMoves(player: BoardPosition, board: BoardOccupancy): BoardPosition[] {
    return playerMoves(player, board).filter((target) => !isLandingAttacked(target.column, target.row, board));
}

/**
 * 玩家最佳应手的活动空间：车走到某个安全落点（必要时吃子）后还剩几个安全落点，
 * 取所有安全落点中的最大值。值越小，说明敌方越接近把车逼进死角。
 */
function bestReplyMobility(player: BoardPosition, board: BoardOccupancy): number {
    let best = 0;
    for (const target of safePlayerMoves(player, board)) {
        const captured = board.take(target.column, target.row);
        best = Math.max(best, safePlayerMoves(target, board).length);
        board.put(captured, target.column, target.row);
    }
    return best;
}

function cloneEnemy(piece: EnemyPiece): EnemyPiece {
    return {
        id: piece.id,
        type: piece.type,
        position: copyPosition(piece.position),
        frozenTurns: piece.frozenTurns,
        isNewlySpawned: piece.isNewlySpawned,
    };
}

function emptyKillStats(): Record<EnemyPieceType, number> {
    return { pawn: 0, advisor: 0, elephant: 0, horse: 0, cannon: 0, rook: 0, general: 0 };
}

function emptyInventory(): Inventory {
    return { crossSlash: 0, freeze: 0, delay: 0, banish: 0, teleport: 0 };
}

function comboMultiplier(combo: number): number {
    if (combo <= 1) return 1;
    if (combo === 2) return 1.2;
    if (combo === 3) return 1.4;
    if (combo === 4) return 1.6;
    return 2;
}

/** Small stateful RNG; the state is included in revive snapshots. */
export class SeededRandom {
    private value: number;

    constructor(readonly seed: number, state = seed) {
        this.value = state >>> 0 || 0x6d2b79f5;
    }

    next(): number {
        let value = this.value += 0x6d2b79f5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        this.value = (value ^ value >>> 14) >>> 0;
        return this.value / 4294967296;
    }

    integer(minimum: number, maximum: number): number {
        return minimum + Math.floor(this.next() * (maximum - minimum + 1));
    }

    choose<T>(items: readonly T[]): T {
        if (items.length === 0) throw new Error('Cannot choose from an empty list.');
        return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]!;
    }

    shuffle<T>(items: readonly T[]): T[] {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const other = Math.floor(this.next() * (index + 1));
            [result[index], result[other]] = [result[other]!, result[index]!];
        }
        return result;
    }

    get state(): number {
        return this.value >>> 0;
    }
}

interface MutableState {
    seed: number;
    playerPosition: BoardPosition;
    enemies: EnemyPiece[];
    turnNumber: number;
    score: number;
    combo: number;
    maxCombo: number;
    totalKills: number;
    killStats: Record<EnemyPieceType, number>;
    normalReinforcementCount: number;
    reinforcementTimer: number;
    reinforcementState: ReinforcementState;
    queuedReinforcement: ReinforcementQueue;
    difficultyLevel: number;
    generalActive: boolean;
    generalCounter: number;
    generalTargetN: number;
    generalKills: number;
    inventory: Inventory;
    reviveUsed: boolean;
    usedItemThisTurn: boolean;
    pendingCrossSlash: boolean;
    phase: GamePhase;
    pendingRewardChoices: ItemType[];
    rewardResumePhase?: 'player' | 'enemy';
    nextPieceId: number;
}

interface EnemyCandidate {
    readonly pieceId: number;
    readonly type: EnemyPieceType;
    readonly from: BoardPosition;
    readonly to: BoardPosition;
    readonly score: number;
}

export class ChessEndlessModel {
    private state!: MutableState;
    private rng!: SeededRandom;
    private reviveSnapshot?: ChessEndlessSnapshot;
    /** 快照整体冻结，可在两次状态变更之间复用；所有改动状态的公开方法都经过 `mutate`。 */
    private cachedSnapshot?: ChessEndlessSnapshot;

    constructor(seed = 0x43484553) {
        this.reset(seed);
    }

    reset(seed = Date.now() >>> 0): ChessEndlessSnapshot {
        this.mutate(() => this.resetState(seed));
        return this.snapshot;
    }

    /** 在状态变更前后都丢弃快照缓存；中途抛错时也不会留下过期快照。 */
    private mutate<T>(action: () => T): T {
        this.cachedSnapshot = undefined;
        try {
            return action();
        } finally {
            this.cachedSnapshot = undefined;
        }
    }

    private resetState(seed: number): void {
        this.rng = new SeededRandom(seed >>> 0);
        this.state = {
            seed: seed >>> 0,
            playerPosition: position(4, 4),
            enemies: [],
            turnNumber: 0,
            score: 0,
            combo: 0,
            maxCombo: 0,
            totalKills: 0,
            killStats: emptyKillStats(),
            normalReinforcementCount: 0,
            reinforcementTimer: 4,
            reinforcementState: 'COUNTDOWN',
            queuedReinforcement: { kind: 'normal', types: Object.freeze(['pawn']) },
            difficultyLevel: 1,
            generalActive: false,
            generalCounter: 0,
            generalTargetN: DIFFICULTY_TUNING.firstGeneralTarget,
            generalKills: 0,
            inventory: emptyInventory(),
            reviveUsed: false,
            usedItemThisTurn: false,
            pendingCrossSlash: false,
            phase: 'player',
            pendingRewardChoices: [],
            nextPieceId: 1,
        };
        this.placeInitialEnemies();
        this.queueNextReinforcement();
        this.reviveSnapshot = undefined;
    }

    get snapshot(): ChessEndlessSnapshot {
        this.cachedSnapshot ??= this.createSnapshot();
        return this.cachedSnapshot;
    }

    private createSnapshot(): ChessEndlessSnapshot {
        const state = this.state;
        return Object.freeze({
            seed: state.seed,
            rngState: this.rng.state,
            playerPosition: copyPosition(state.playerPosition),
            enemies: Object.freeze(state.enemies.map((piece) => Object.freeze(cloneEnemy(piece)))),
            turnNumber: state.turnNumber,
            score: state.score,
            combo: state.combo,
            maxCombo: state.maxCombo,
            totalKills: state.totalKills,
            killStats: Object.freeze({ ...state.killStats }),
            normalReinforcementCount: state.normalReinforcementCount,
            reinforcementTimer: state.reinforcementTimer,
            reinforcementState: state.reinforcementState,
            queuedReinforcement: Object.freeze({
                kind: state.queuedReinforcement.kind,
                types: Object.freeze([...state.queuedReinforcement.types]),
            }),
            difficultyLevel: state.difficultyLevel,
            generalActive: state.generalActive,
            generalCounter: state.generalCounter,
            generalTargetN: state.generalTargetN,
            generalKills: state.generalKills,
            inventory: Object.freeze({ ...state.inventory }),
            reviveUsed: state.reviveUsed,
            usedItemThisTurn: state.usedItemThisTurn,
            pendingCrossSlash: state.pendingCrossSlash,
            phase: state.phase,
            pendingRewardChoices: Object.freeze([...state.pendingRewardChoices]),
            ...(state.rewardResumePhase ? { rewardResumePhase: state.rewardResumePhase } : {}),
            nextPieceId: state.nextPieceId,
        });
    }

    get canRevive(): boolean {
        return this.state.phase === 'dead' && !this.state.reviveUsed && Boolean(this.reviveSnapshot);
    }

    /** 保存死亡状态时一并保留广告复活所需的致死前快照。 */
    get recoverySnapshot(): ChessEndlessSnapshot | undefined {
        return this.reviveSnapshot;
    }

    /** 生产存档使用的恢复入口；与测试专用的部分加载入口分开。 */
    restoreSnapshot(
        snapshot: ChessEndlessSnapshot,
        recoverySnapshot?: ChessEndlessSnapshot,
    ): void {
        validateSnapshot(snapshot);
        if (recoverySnapshot !== undefined) {
            validateSnapshot(recoverySnapshot);
            if (recoverySnapshot.phase !== 'enemy') {
                throw new Error('Chess recovery snapshot must be captured before an enemy turn.');
            }
        }

        this.mutate(() => {
            this.restore(snapshot);
            this.reviveSnapshot = recoverySnapshot;
        });
    }

    getPlayerLegalMoves(): readonly BoardPosition[] {
        return Object.freeze(playerMoves(this.state.playerPosition, this.boardOccupancy()));
    }

    getSafePlayerMoves(): readonly BoardPosition[] {
        return Object.freeze(safePlayerMoves(this.state.playerPosition, this.boardOccupancy()));
    }

    /** 车原地不动时下一个敌方回合能吃掉车的敌棋 ID，用于威胁预警表现。 */
    getPlayerAttackerIds(): readonly number[] {
        const board = this.boardOccupancy();
        const player = this.state.playerPosition;
        return Object.freeze(this.state.enemies
            .filter((piece) => piece.frozenTurns <= 0 && enemyCanCapture(piece, player.column, player.row, board))
            .map((piece) => piece.id));
    }

    getDangerPositions(): readonly BoardPosition[] {
        const board = this.boardOccupancy();
        const dangers: BoardPosition[] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                if (isLandingAttacked(column, row, board)) dangers.push(position(column, row));
            }
        }
        return Object.freeze(dangers);
    }

    useItem(item: ItemType, target?: BoardPosition | number): ItemUseResult {
        return this.mutate(() => {
            if (this.state.phase !== 'player') throw new Error('Items may only be used during the player turn.');
            if (this.state.usedItemThisTurn) throw new Error('Only one item may be used per player turn.');
            if (this.state.inventory[item] <= 0) throw new Error(`${ITEM_DISPLAY[item]} is not available.`);

            let result: ItemUseResult = { item };
            if (item === 'crossSlash') {
                this.state.pendingCrossSlash = true;
            } else if (item === 'delay') {
                if (this.state.reinforcementState === 'WAITING'
                    || this.state.reinforcementState === 'GENERAL_WAITING') {
                    throw new Error("增援已在等待入场，无法再延后。");
                }
                this.state.reinforcementTimer += 2;
            } else if (item === 'teleport') {
                if (!target || typeof target === 'number' || !isInside(target)) throw new Error('移形符需要一个棋盘空格。');
                if (this.enemyAt(target)) throw new Error('移形符只能选择空格。');
                this.state.playerPosition = copyPosition(target);
                result = { item, target: copyPosition(target) };
            } else {
                if (typeof target !== 'number') throw new Error(`${ITEM_DISPLAY[item]}需要选择一枚敌棋。`);
                const enemy = this.state.enemies.find((piece) => piece.id === target);
                if (!enemy || enemy.type === 'general') throw new Error('该道具不能选择将。');
                if (item === 'freeze') {
                    enemy.frozenTurns = Math.max(enemy.frozenTurns, 1);
                    result = { item, target: copyPosition(enemy.position) };
                } else {
                    this.state.enemies = this.state.enemies.filter((piece) => piece.id !== enemy.id);
                    result = { item, target: copyPosition(enemy.position), removed: cloneEnemy(enemy) };
                }
            }

            this.state.inventory[item] -= 1;
            this.state.usedItemThisTurn = true;
            return Object.freeze(result);
        });
    }

    movePlayer(target: BoardPosition): PlayerMoveResult {
        return this.mutate(() => {
            if (this.state.phase !== 'player') throw new Error('It is not the player turn.');
            const legal = playerMoves(this.state.playerPosition, this.boardOccupancy());
            if (!legal.some((candidate) => samePosition(candidate, target))) throw new Error('Illegal rook move.');

            const from = copyPosition(this.state.playerPosition);
            const scoreBefore = this.state.score;
            const capturedEnemy = this.enemyAt(target);
            let captured: KillRecord | undefined;

            if (capturedEnemy) {
                this.state.combo += 1;
                this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
                captured = this.removeAndScore(capturedEnemy, 'normal');
            } else {
                this.state.combo = 0;
            }

            this.state.playerPosition = copyPosition(target);
            const crossSlashKills = this.state.pendingCrossSlash ? this.performCrossSlash() : [];
            this.state.pendingCrossSlash = false;
            const generalKilled = Boolean(captured?.piece.type === 'general')
                || crossSlashKills.some((record) => record.piece.type === 'general');
            let immediateSpawned: EnemyPiece[] = [];
            let immediateReinforcementKind: 'normal' | 'general' | undefined;
            if (this.state.enemies.length === 0) {
                this.state.reinforcementTimer = 0;
                const reinforcement = this.trySpawnQueuedReinforcement();
                immediateSpawned = reinforcement.spawned;
                immediateReinforcementKind = reinforcement.kind;
            }

            if (this.state.pendingRewardChoices.length > 0) {
                this.state.rewardResumePhase = 'enemy';
                this.state.phase = 'reward';
            } else {
                this.state.phase = 'enemy';
            }

            return Object.freeze({
                from,
                to: copyPosition(target),
                ...(captured ? { captured } : {}),
                crossSlashKills: Object.freeze(crossSlashKills),
                scoreDelta: this.state.score - scoreBefore,
                combo: this.state.combo,
                generalKilled,
                immediateSpawned: Object.freeze(immediateSpawned.map(cloneEnemy)),
                ...(immediateReinforcementKind ? { immediateReinforcementKind } : {}),
            });
        });
    }

    chooseReward(item: ItemType): void {
        this.mutate(() => {
            if (this.state.phase !== 'reward' || this.state.pendingRewardChoices.indexOf(item) < 0) {
                throw new Error('This item is not one of the current rewards.');
            }
            if (this.state.inventory[item] >= ITEM_CAPACITY) throw new Error(`${ITEM_DISPLAY[item]}已满。`);
            this.state.inventory[item] += 1;
            this.state.pendingRewardChoices = [];
            this.state.phase = this.state.rewardResumePhase ?? 'player';
            this.state.rewardResumePhase = undefined;
        });
    }

    resolveEnemyTurn(): EnemyTurnResult {
        return this.mutate(() => {
            if (this.state.phase !== 'enemy') throw new Error('It is not the enemy turn.');
            this.reviveSnapshot = this.snapshot;
            this.state.enemies.forEach((piece) => { piece.isNewlySpawned = false; });

            const board = this.boardOccupancy();
            const player = this.state.playerPosition;
            const attackers = this.state.enemies
                .filter((piece) => piece.frozenTurns <= 0 && enemyCanCapture(piece, player.column, player.row, board))
                .sort((left, right) => PIECE_VALUE[right.type] - PIECE_VALUE[left.type]);

            let moved: EnemyTurnResult['moved'];
            if (attackers.length > 0) {
                const topValue = PIECE_VALUE[attackers[0]!.type];
                const strongest = attackers.filter((piece) => PIECE_VALUE[piece.type] === topValue);
                const killer = this.rng.choose(strongest);
                const from = copyPosition(killer.position);
                killer.position = copyPosition(this.state.playerPosition);
                moved = Object.freeze({ pieceId: killer.id, type: killer.type, from, to: copyPosition(killer.position) });
                this.state.phase = 'dead';
                return Object.freeze({
                    moved,
                    killedPlayer: true,
                    scoreDelta: 0,
                    spawned: Object.freeze([]),
                    enteredWaiting: false,
                });
            }

            const candidates = this.buildEnemyCandidates();
            if (candidates.length > 0) {
                const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
                const best = this.rng.choose(candidates.filter((candidate) => candidate.score === bestScore));
                const piece = this.state.enemies.find((enemy) => enemy.id === best.pieceId)!;
                piece.position = copyPosition(best.to);
                moved = Object.freeze({
                    pieceId: piece.id,
                    type: piece.type,
                    from: copyPosition(best.from),
                    to: copyPosition(best.to),
                });
            }

            this.state.turnNumber += 1;
            this.state.score += 2;
            this.state.enemies.forEach((piece) => {
                if (piece.frozenTurns > 0) piece.frozenTurns -= 1;
            });
            const reinforcement = this.advanceReinforcement();
            this.state.usedItemThisTurn = false;
            this.state.phase = 'player';
            return Object.freeze({
                ...(moved ? { moved } : {}),
                killedPlayer: false,
                scoreDelta: 2,
                spawned: Object.freeze(reinforcement.spawned.map(cloneEnemy)),
                ...(reinforcement.kind ? { reinforcementKind: reinforcement.kind } : {}),
                enteredWaiting: reinforcement.enteredWaiting,
            });
        });
    }

    revive(): ReviveResult {
        return this.mutate(() => {
            if (!this.canRevive || !this.reviveSnapshot) throw new Error('Revive is unavailable.');
            const before = this.state.score;
            this.restore(this.reviveSnapshot);
            this.state.reviveUsed = true;
            this.state.phase = 'player';
            // 复活后是一次新的玩家行动；致死前那一步用过的道具不占用这次机会。
            this.state.usedItemThisTurn = false;
            const kills = this.performCrossSlash();
            const generalKilled = kills.some((record) => record.piece.type === 'general');
            if (this.state.pendingRewardChoices.length > 0) {
                this.state.rewardResumePhase = 'player';
                this.state.phase = 'reward';
            }
            this.reviveSnapshot = undefined;
            return Object.freeze({
                kills: Object.freeze(kills),
                scoreDelta: this.state.score - before,
                generalKilled,
            });
        });
    }

    endGame(): void {
        this.mutate(() => {
            if (this.state.phase !== 'dead' && this.state.phase !== 'ended') {
                throw new Error('The round can only end after death.');
            }
            this.state.phase = 'ended';
            this.reviveSnapshot = undefined;
        });
    }

    /** Deterministic rule-test hook. */
    loadForTesting(value: Partial<ChessEndlessSnapshot>): void {
        this.mutate(() => {
            const current = this.snapshot;
            this.restore({ ...current, ...value } as ChessEndlessSnapshot);
            this.reviveSnapshot = undefined;
        });
    }

    private restore(snapshot: ChessEndlessSnapshot): void {
        this.rng = new SeededRandom(snapshot.seed, snapshot.rngState);
        this.state = {
            seed: snapshot.seed,
            playerPosition: copyPosition(snapshot.playerPosition),
            enemies: snapshot.enemies.map(cloneEnemy),
            turnNumber: snapshot.turnNumber,
            score: snapshot.score,
            combo: snapshot.combo,
            maxCombo: snapshot.maxCombo,
            totalKills: snapshot.totalKills,
            killStats: { ...snapshot.killStats },
            normalReinforcementCount: snapshot.normalReinforcementCount,
            reinforcementTimer: snapshot.reinforcementTimer,
            reinforcementState: snapshot.reinforcementState,
            queuedReinforcement: {
                kind: snapshot.queuedReinforcement.kind,
                types: Object.freeze([...snapshot.queuedReinforcement.types]),
            },
            difficultyLevel: snapshot.difficultyLevel,
            generalActive: snapshot.generalActive,
            generalCounter: snapshot.generalCounter,
            generalTargetN: snapshot.generalTargetN,
            generalKills: snapshot.generalKills,
            inventory: { ...snapshot.inventory },
            reviveUsed: snapshot.reviveUsed,
            usedItemThisTurn: snapshot.usedItemThisTurn,
            pendingCrossSlash: snapshot.pendingCrossSlash,
            phase: snapshot.phase,
            pendingRewardChoices: [...snapshot.pendingRewardChoices],
            rewardResumePhase: snapshot.rewardResumePhase,
            nextPieceId: snapshot.nextPieceId,
        };
    }

    private placeInitialEnemies(): void {
        const types: readonly EnemyPieceType[] = ['pawn', 'pawn', 'advisor', 'advisor', 'elephant'];
        const candidates: BoardPosition[] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                const candidate = position(column, row);
                if (!samePosition(candidate, this.state.playerPosition)) candidates.push(candidate);
            }
        }

        for (let attempt = 0; attempt < 160; attempt += 1) {
            const spots = this.rng.shuffle(candidates).slice(0, types.length);
            const enemies = types.map((type, index) => this.createEnemy(type, spots[index]!, false));
            const board = new BoardOccupancy(enemies);
            const player = this.state.playerPosition;
            if (!enemies.some((piece) => enemyCanCapture(piece, player.column, player.row, board))
                && safePlayerMoves(player, board).length >= 2) {
                this.state.enemies = enemies;
                return;
            }
        }

        this.state.enemies = [
            this.createEnemy('pawn', position(0, 0), false),
            this.createEnemy('pawn', position(8, 9), false),
            this.createEnemy('advisor', position(0, 9), false),
            this.createEnemy('elephant', position(8, 0), false),
            this.createEnemy('advisor', position(4, 0), false),
        ];
    }

    private createEnemy(type: EnemyPieceType, at: BoardPosition, newlySpawned: boolean): EnemyPiece {
        return {
            id: this.state.nextPieceId++,
            type,
            position: copyPosition(at),
            frozenTurns: 0,
            isNewlySpawned: newlySpawned,
        };
    }

    private enemyAt(at: BoardPosition): EnemyPiece | undefined {
        return this.state.enemies.find((piece) => samePosition(piece.position, at));
    }

    private boardOccupancy(): BoardOccupancy {
        return new BoardOccupancy(this.state.enemies);
    }

    private enemyDestinations(piece: EnemyPiece, board: BoardOccupancy): BoardPosition[] {
        const player = this.state.playerPosition;
        const isBlocked = (column: number, row: number): boolean => (
            (column === player.column && row === player.row) || Boolean(board.at(column, row))
        );
        const destinations: BoardPosition[] = [];
        const append = (column: number, row: number): void => {
            if (!isInsideCell(column, row) || isBlocked(column, row)) return;
            destinations.push(position(column, row));
        };
        const { column: originColumn, row: originRow } = piece.position;
        if (piece.type === 'pawn' || piece.type === 'general') {
            DIRECTIONS.forEach((direction) => append(originColumn + direction.column, originRow + direction.row));
        } else if (piece.type === 'advisor') {
            [-1, 1].forEach((column) => [-1, 1].forEach((row) => append(originColumn + column, originRow + row)));
        } else if (piece.type === 'elephant') {
            [-2, 2].forEach((column) => [-2, 2].forEach((row) => {
                if (!isBlocked(originColumn + column / 2, originRow + row / 2)) {
                    append(originColumn + column, originRow + row);
                }
            }));
        } else if (piece.type === 'horse') {
            HORSE_MOVES.forEach((move) => {
                const legBlocked = Math.abs(move.column) === 2
                    ? isBlocked(originColumn + Math.sign(move.column), originRow)
                    : isBlocked(originColumn, originRow + Math.sign(move.row));
                if (!legBlocked) append(originColumn + move.column, originRow + move.row);
            });
        } else {
            for (const direction of DIRECTIONS) {
                let column = originColumn + direction.column;
                let row = originRow + direction.row;
                while (isInsideCell(column, row) && !isBlocked(column, row)) {
                    destinations.push(position(column, row));
                    column += direction.column;
                    row += direction.row;
                }
            }
        }
        return destinations;
    }

    private buildEnemyCandidates(): EnemyCandidate[] {
        const player = this.state.playerPosition;
        // 所有候选走法共用一份推演副本：逐个挪动棋子评分后立即挪回原位。
        // 副本的定身回合数按本回合结束时的递减结果计算，评分看的是玩家下一步
        // 实际面对的局面：只剩 1 回合定身的棋子到下一个敌方回合已能吃车。
        const simulated = this.state.enemies.map((piece) => ({
            ...cloneEnemy(piece),
            frozenTurns: Math.max(0, piece.frozenTurns - 1),
        }));
        const board = new BoardOccupancy(simulated);
        const canCapturePlayer = (enemy: EnemyPiece): boolean => (
            enemyCanCapture(enemy, player.column, player.row, board)
        );
        const beforeThreatened = playerThreatenedIds(player, board);
        const general = simulated.find((piece) => piece.type === 'general');
        const generalScoring = general ? GENERAL_AI_SCORING : undefined;
        const generalThreatenedBefore = Boolean(general && beforeThreatened.has(general.id));
        const beforeSafe = safePlayerMoves(player, board).length;
        const beforeCannonAttack = simulated.some((piece) => piece.type === 'cannon' && canCapturePlayer(piece));
        const escapeFactor = this.escapeFactor();
        const candidates: EnemyCandidate[] = [];

        for (let index = 0; index < simulated.length; index += 1) {
            // 能否在本回合行动仍以当前定身状态为准。
            if (this.state.enemies[index]!.frozenTurns > 0) continue;
            const piece = simulated[index]!;
            const origin = piece.position;
            for (const target of this.enemyDestinations(piece, board)) {
                board.relocate(piece, target);
                const afterThreatened = playerThreatenedIds(player, board);
                const generalThreatenedAfter = Boolean(general && afterThreatened.has(general.id));
                const afterSafe = safePlayerMoves(player, board).length;
                const canKillPlayer = simulated.some(canCapturePlayer);
                const afterCannonAttack = simulated.some((enemy) => enemy.type === 'cannon' && canCapturePlayer(enemy));
                board.relocate(piece, origin);

                let score = 0;
                if (beforeThreatened.has(piece.id) && !afterThreatened.has(piece.id)) {
                    if (piece.type !== 'general') score += (600 + PIECE_VALUE[piece.type] * 3) * escapeFactor;
                }
                if (generalScoring) {
                    if (generalThreatenedBefore && !generalThreatenedAfter) {
                        score += piece.type === 'general'
                            ? generalScoring.escapeThreat
                            : generalScoring.guardedByAlly;
                    } else if (generalThreatenedAfter) {
                        score -= generalThreatenedBefore
                            ? generalScoring.remainsThreatened
                            : generalScoring.newlyExposed;
                    }
                }
                if (canKillPlayer) score += 400;
                if (!beforeCannonAttack && afterCannonAttack) score += 180;
                score += Math.max(0, beforeSafe - afterSafe) * 30;
                if (afterThreatened.has(piece.id)) {
                    score -= (250 + PIECE_VALUE[piece.type] * 2) * escapeFactor;
                }
                score += this.aiNoise();
                candidates.push({
                    pieceId: piece.id,
                    type: piece.type,
                    from: copyPosition(origin),
                    to: copyPosition(target),
                    score,
                });
            }
        }
        return this.applyLookahead(candidates, simulated, board);
    }

    /**
     * 对单步评分最高的若干走法推演玩家的最佳应手，按"车最好的落点还剩几个安全落点"
     * 重新排序；只在这批候选中选择，未入围的走法不再参与比较。
     */
    private applyLookahead(
        candidates: readonly EnemyCandidate[],
        simulated: readonly EnemyPiece[],
        board: BoardOccupancy,
    ): EnemyCandidate[] {
        const tuning = DIFFICULTY_TUNING;
        const difficulty = this.state.difficultyLevel;
        if (difficulty < tuning.lookaheadStart || candidates.length === 0) return [...candidates];

        const weight = Math.min(
            tuning.lookaheadMaxWeight,
            tuning.lookaheadWeightPerLevel * (difficulty - tuning.lookaheadStart + 1),
        );
        const player = this.state.playerPosition;
        const before = bestReplyMobility(player, board);
        const shortlisted = [...candidates]
            .sort((left, right) => right.score - left.score)
            .slice(0, tuning.lookaheadCandidates);
        return shortlisted.map((candidate) => {
            const piece = simulated.find((enemy) => enemy.id === candidate.pieceId)!;
            const origin = piece.position;
            board.relocate(piece, candidate.to);
            const after = bestReplyMobility(player, board);
            board.relocate(piece, origin);
            return { ...candidate, score: candidate.score + (before - after) * weight };
        });
    }

    /** 普通棋逃离车线奖励与暴露扣分的系数，随难度从 1 线性衰减到下限。 */
    private escapeFactor(): number {
        const tuning = DIFFICULTY_TUNING;
        return Math.max(
            tuning.minimumEscapeFactor,
            1 - (this.state.difficultyLevel - 1) * tuning.escapeDecayPerLevel,
        );
    }

    private aiNoise(): number {
        const difficulty = this.state.difficultyLevel;
        const range = difficulty <= 2 ? 200 : difficulty <= 6 ? 100 : difficulty <= 10 ? 40 : 10;
        return this.rng.integer(-range, range);
    }

    private removeAndScore(enemy: EnemyPiece, source: KillSource): KillRecord {
        this.state.enemies = this.state.enemies.filter((piece) => piece.id !== enemy.id);
        let score = 0;
        if (enemy.type === 'general') {
            score = 300;
        } else if (source === 'normal') {
            score = Math.floor(PIECE_SCORE[enemy.type] * comboMultiplier(this.state.combo));
        } else {
            score = Math.floor(PIECE_SCORE[enemy.type] * 0.6);
        }
        this.state.score += score;
        this.state.totalKills += 1;
        this.state.killStats[enemy.type] += 1;
        if (enemy.type === 'general') this.onGeneralKilled();
        return Object.freeze({ piece: cloneEnemy(enemy), source, score });
    }

    private performCrossSlash(): KillRecord[] {
        const targets = this.state.enemies
            .filter((piece) => (
                piece.position.column === this.state.playerPosition.column
                || piece.position.row === this.state.playerPosition.row
            ))
            .sort((left, right) => {
                const leftDistance = Math.abs(left.position.column - this.state.playerPosition.column)
                    + Math.abs(left.position.row - this.state.playerPosition.row);
                const rightDistance = Math.abs(right.position.column - this.state.playerPosition.column)
                    + Math.abs(right.position.row - this.state.playerPosition.row);
                return leftDistance - rightDistance;
            });
        return targets.map((piece) => this.removeAndScore(piece, 'cross'));
    }

    private onGeneralKilled(): void {
        this.state.generalActive = false;
        this.state.generalKills += 1;
        this.state.generalCounter = 0;
        this.recalculateDifficulty();
        this.state.generalTargetN = this.calculateGeneralTarget();
        this.state.pendingRewardChoices = this.createRewardChoices();
    }

    private createRewardChoices(): ItemType[] {
        const available = ITEM_TYPES.filter((item) => this.state.inventory[item] < ITEM_CAPACITY);
        if (available.length === 0) return [];
        const pool = [...available];
        const choices: ItemType[] = [];
        while (pool.length > 0 && choices.length < 3) {
            const weights = pool.map((item) => item === 'crossSlash' ? 0.18 : 1);
            let roll = this.rng.next() * weights.reduce((sum, weight) => sum + weight, 0);
            let selectedIndex = 0;
            for (let index = 0; index < weights.length; index += 1) {
                roll -= weights[index]!;
                if (roll <= 0) {
                    selectedIndex = index;
                    break;
                }
            }
            choices.push(pool.splice(selectedIndex, 1)[0]!);
        }
        return choices;
    }

    private recalculateDifficulty(): void {
        this.state.difficultyLevel = 1
            + Math.floor(this.state.normalReinforcementCount / 5)
            + this.state.generalKills;
    }

    private calculateGeneralTarget(): number {
        const difficulty = this.state.difficultyLevel;
        if (difficulty <= 3) return 8;
        if (difficulty <= 6) return this.rng.integer(7, 8);
        if (difficulty <= 10) return this.rng.integer(6, 7);
        return this.rng.integer(5, 6);
    }

    private reinforcementInterval(): number {
        if (this.state.normalReinforcementCount < OPENING_REINFORCEMENT_PACING.waves) {
            return this.rng.integer(
                OPENING_REINFORCEMENT_PACING.minimumTurns,
                OPENING_REINFORCEMENT_PACING.maximumTurns,
            );
        }

        const difficulty = this.state.difficultyLevel;
        if (difficulty <= 2) return this.rng.integer(4, 5);
        if (difficulty <= 5) return 4;
        if (difficulty <= 8) return this.rng.integer(3, 4);
        if (difficulty <= 12) return 3;
        if (difficulty <= 20) return this.rng.integer(2, 3);
        return 2;
    }

    private reinforcementCount(): number {
        const difficulty = this.state.difficultyLevel;
        const roll = this.rng.next();
        const probabilities = difficulty <= 4
            ? [1, 0, 0]
            : difficulty <= 8
                ? [0.8, 0.2, 0]
                : difficulty <= 12
                    ? [0.55, 0.45, 0]
                    : difficulty <= 16
                        ? [0.2, 0.65, 0.15]
                        : [0, 0.6, 0.4];
        let cumulative = 0;
        for (let index = 0; index < probabilities.length; index += 1) {
            cumulative += probabilities[index]!;
            if (roll < cumulative) return index + 2;
        }
        return 4;
    }

    private pieceWeights(): readonly [EnemyPieceType, number][] {
        const difficulty = this.state.difficultyLevel;
        if (difficulty <= 2) return [['pawn', 50], ['advisor', 30], ['elephant', 20]];
        if (difficulty <= 5) return [['pawn', 35], ['advisor', 20], ['elephant', 20], ['horse', 25]];
        if (difficulty <= 8) return [['pawn', 25], ['advisor', 15], ['elephant', 15], ['horse', 25], ['cannon', 20]];
        if (difficulty <= 12) return [['pawn', 20], ['advisor', 10], ['elephant', 15], ['horse', 25], ['cannon', 20], ['rook', 10]];
        return [['pawn', 15], ['advisor', 10], ['elephant', 10], ['horse', 25], ['cannon', 25], ['rook', 15]];
    }

    private weightedPiece(existingRooks: number): EnemyPieceType {
        const weights = this.pieceWeights().filter(([type]) => type !== 'rook' || existingRooks < 2);
        const total = weights.reduce((sum, entry) => sum + entry[1], 0);
        let roll = this.rng.next() * total;
        for (const [type, weight] of weights) {
            roll -= weight;
            if (roll < 0) return type;
        }
        return weights.length > 0 ? weights[weights.length - 1]![0] : 'pawn';
    }

    private queueNextReinforcement(): void {
        const shouldGeneral = !this.state.generalActive && this.state.generalCounter >= this.state.generalTargetN;
        if (shouldGeneral) {
            this.state.queuedReinforcement = {
                kind: 'general',
                types: Object.freeze(['advisor', 'general', 'advisor']),
            };
            this.state.reinforcementState = 'GENERAL_COUNTDOWN';
        } else {
            const count = this.reinforcementCount();
            let rooks = this.state.enemies.filter((piece) => piece.type === 'rook').length;
            const types: EnemyPieceType[] = [];
            for (let index = 0; index < count; index += 1) {
                const type = this.weightedPiece(rooks);
                types.push(type);
                if (type === 'rook') rooks += 1;
            }
            this.state.queuedReinforcement = { kind: 'normal', types: Object.freeze(types) };
            this.state.reinforcementState = 'COUNTDOWN';
        }
        this.state.reinforcementTimer = this.reinforcementInterval();
    }

    private advanceReinforcement(): {
        spawned: EnemyPiece[];
        kind?: 'normal' | 'general';
        enteredWaiting: boolean;
    } {
        if (this.state.reinforcementState === 'COUNTDOWN'
            || this.state.reinforcementState === 'GENERAL_COUNTDOWN') {
            this.state.reinforcementTimer = Math.max(0, this.state.reinforcementTimer - 1);
            if (this.state.reinforcementTimer > 0) return { spawned: [], enteredWaiting: false };
        }
        return this.trySpawnQueuedReinforcement();
    }

    private trySpawnQueuedReinforcement(): {
        spawned: EnemyPiece[];
        kind?: 'normal' | 'general';
        enteredWaiting: boolean;
    } {
        const queue = this.state.queuedReinforcement;
        const capacity = boardCapacity(this.state.difficultyLevel);
        const normalBlocked = queue.kind === 'normal'
            && this.state.enemies.length >= capacity;
        const generalBlocked = queue.kind === 'general'
            && this.state.enemies.length > capacity;
        if (normalBlocked || generalBlocked) {
            this.state.reinforcementState = queue.kind === 'general' ? 'GENERAL_WAITING' : 'WAITING';
            return { spawned: [], enteredWaiting: true };
        }

        const placements = queue.kind === 'general'
            ? this.findGeneralPlacements()
            : this.findNormalPlacements(queue.types.length);
        if (!placements) {
            this.state.reinforcementState = queue.kind === 'general' ? 'GENERAL_WAITING' : 'WAITING';
            return { spawned: [], enteredWaiting: true };
        }

        const spawned = queue.types.map((type, index) => this.createEnemy(type, placements[index]!, true));
        this.state.enemies.push(...spawned);
        if (queue.kind === 'general') {
            this.state.generalActive = true;
        } else {
            this.state.normalReinforcementCount += 1;
            if (!this.state.generalActive) this.state.generalCounter += 1;
            this.recalculateDifficulty();
        }
        this.queueNextReinforcement();
        return { spawned, kind: queue.kind, enteredWaiting: false };
    }

    private findNormalPlacements(count: number): BoardPosition[] | undefined {
        const player = this.state.playerPosition;
        const board = this.boardOccupancy();
        const open: BoardPosition[] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                if (board.at(column, row) || (column === player.column && row === player.row)) continue;
                open.push(position(column, row));
            }
        }
        if (open.length < count) return undefined;
        const directAttackRange = new Set(playerMoves(player, board).map(positionKey));

        // 先用“完全不与玩家车同横线/竖线”的候选，确保普通棋落地时肉眼可见地
        // 离开车的攻击方向；若棋盘拥挤，再放宽到被已有棋挡住的线位，最后才
        // 允许当前直接攻击线作为保底。
        const preferredPools = [
            open.filter((candidate) => candidate.column !== player.column && candidate.row !== player.row),
            open.filter((candidate) => !directAttackRange.has(positionKey(candidate))),
            open,
        ];
        const queuedTypes = this.state.queuedReinforcement.types.slice(0, count);
        for (const pool of preferredPools) {
            const placements = this.searchNormalPlacementPool(pool, count, queuedTypes);
            if (placements) return placements;
        }
        return undefined;
    }

    private searchNormalPlacementPool(
        pool: readonly BoardPosition[],
        count: number,
        queuedTypes: readonly EnemyPieceType[],
    ): BoardPosition[] | undefined {
        if (pool.length < count || queuedTypes.length < count) return undefined;

        const player = this.state.playerPosition;
        let safeFallback: BoardPosition[] | undefined;
        // 多次洗牌仍保留随机性，但每次只接受整批通过安全检查的结果；这样不会
        // 因一次随机抽样失败就把普通棋直接刷到车线上。
        for (let attempt = 0; attempt < 240; attempt += 1) {
            const placements = this.rng.shuffle(pool).slice(0, count);
            const spawned = queuedTypes.map((type, index): EnemyPiece => ({
                id: -1 - index,
                type,
                position: placements[index]!,
                frozenTurns: 0,
                isNewlySpawned: true,
            }));
            const board = new BoardOccupancy(this.state.enemies.concat(spawned));
            if (safePlayerMoves(player, board).length === 0) continue;

            // 普通增援优先避开玩家车的直接吃子线；只有前面的候选层都找不到
            // 同时满足安全走法的整批落点时，才允许新棋成为下一步直接吃子目标。
            safeFallback ??= placements;
            const threatened = playerThreatenedIds(player, board);
            if (!spawned.some((piece) => threatened.has(piece.id))) return placements;
        }
        return safeFallback;
    }

    private findGeneralPlacements(): BoardPosition[] | undefined {
        const player = this.state.playerPosition;
        const occupied = this.boardOccupancy();
        const isOpen = (candidate: BoardPosition): boolean => (
            !occupied.at(candidate.column, candidate.row) && !samePosition(candidate, player)
        );
        const groups: BoardPosition[][] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let start = 0; start <= BOARD_COLUMNS - 3; start += 1) {
                const group = [position(start, row), position(start + 1, row), position(start + 2, row)];
                if (group.every(isOpen)) groups.push(group);
            }
        }
        const safeGroups: Array<{ group: BoardPosition[]; distance: number }> = [];
        for (const group of this.rng.shuffle(groups)) {
            const spawned = (['advisor', 'general', 'advisor'] as const).map((type, index): EnemyPiece => ({
                id: -1 - index,
                type,
                position: group[index]!,
                frozenTurns: 0,
                isNewlySpawned: true,
            }));
            const board = new BoardOccupancy(this.state.enemies.concat(spawned));
            if (safePlayerMoves(player, board).length === 0) continue;
            if (playerThreatenedIds(player, board).has(-2)) continue;
            const generalPosition = group[1]!;
            safeGroups.push({
                group,
                distance: Math.abs(generalPosition.column - player.column)
                    + Math.abs(generalPosition.row - player.row),
            });
        }
        if (safeGroups.length === 0) return undefined;
        const greatestDistance = Math.max(...safeGroups.map((candidate) => candidate.distance));
        return this.rng.choose(safeGroups.filter((candidate) => candidate.distance === greatestDistance)).group;
    }
}
