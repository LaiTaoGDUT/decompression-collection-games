export const BOARD_COLUMNS = 9;
export const BOARD_ROWS = 10;
export const MAX_BOARD_REINFORCEMENT_THRESHOLD = 16;

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
 * 将军保护使用固定评分，不随隐藏难度递增。
 *
 * 普通棋脱离玩家车的直接威胁时会获得 `600 + 棋子价值 × 3`；
 * 马的有效脱险分为 690，高于将军的 680，因此固定配置下马比将更重要。
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
    crossSlash: '本次正常移动后，清除车所在横线与竖线上的全部敌棋。',
    freeze: '封住一枚普通敌棋，使其跳过下一个敌方回合。',
    delay: '当前增援倒计时增加 2 回合。',
    banish: '移走一枚普通敌棋；不计击杀与得分。',
    teleport: '立即传送到任意空格；随后仍须正常走车一次。',
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
    requireSnapshotInteger(value.nextPieceId, 'nextPieceId', 1);
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
    for (const [index, rawEnemy] of enemies.entries()) {
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
        enemyIds.add(id);
        const positionValue = rawEnemy.position as Record<string, unknown>;
        const positionId = `${positionValue.column},${positionValue.row}`;
        if (occupied.has(positionId)) {
            throw new Error(`Duplicate chess snapshot position: ${positionId}.`);
        }
        occupied.add(positionId);
    }

    const playerPosition = value.playerPosition as Record<string, unknown>;
    if (occupied.has(`${playerPosition.column},${playerPosition.row}`)) {
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
        if (count > 2) {
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
    return value.column >= 0 && value.column < BOARD_COLUMNS
        && value.row >= 0 && value.row < BOARD_ROWS;
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

    constructor(seed = 0x43484553) {
        this.reset(seed);
    }

    reset(seed = Date.now() >>> 0): ChessEndlessSnapshot {
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
            generalTargetN: 8,
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
        return this.snapshot;
    }

    get snapshot(): ChessEndlessSnapshot {
        const state = this.state;
        return Object.freeze({
            seed: state.seed,
            rngState: this.rng.state,
            playerPosition: copyPosition(state.playerPosition),
            enemies: Object.freeze(state.enemies.map(cloneEnemy)),
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

        this.restore(snapshot);
        this.reviveSnapshot = recoverySnapshot;
    }

    getPlayerLegalMoves(): readonly BoardPosition[] {
        return Object.freeze(this.playerMoves(this.state.playerPosition, this.state.enemies));
    }

    getSafePlayerMoves(): readonly BoardPosition[] {
        return Object.freeze(this.safePlayerMoves(this.state.playerPosition, this.state.enemies));
    }

    getDangerPositions(): readonly BoardPosition[] {
        const dangers: BoardPosition[] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                const candidate = position(column, row);
                const remaining = this.state.enemies
                    .filter((piece) => !samePosition(piece.position, candidate))
                    .map(cloneEnemy);
                if (remaining.some((piece) => (
                    piece.frozenTurns <= 0 && this.enemyCanCapturePlayer(piece, candidate, remaining)
                ))) dangers.push(candidate);
            }
        }
        return Object.freeze(dangers);
    }

    useItem(item: ItemType, target?: BoardPosition | number): ItemUseResult {
        if (this.state.phase !== 'player') throw new Error('Items may only be used during the player turn.');
        if (this.state.usedItemThisTurn) throw new Error('Only one item may be used per player turn.');
        if (this.state.inventory[item] <= 0) throw new Error(`${ITEM_DISPLAY[item]} is not available.`);

        let result: ItemUseResult = { item };
        if (item === 'crossSlash') {
            this.state.pendingCrossSlash = true;
        } else if (item === 'delay') {
            if (this.state.reinforcementState === 'WAITING'
                || this.state.reinforcementState === 'GENERAL_WAITING') {
                throw new Error('待命增援无法继续延后。');
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
    }

    movePlayer(target: BoardPosition): PlayerMoveResult {
        if (this.state.phase !== 'player') throw new Error('It is not the player turn.');
        const legal = this.playerMoves(this.state.playerPosition, this.state.enemies);
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
    }

    chooseReward(item: ItemType): void {
        if (this.state.phase !== 'reward' || this.state.pendingRewardChoices.indexOf(item) < 0) {
            throw new Error('This item is not one of the current rewards.');
        }
        if (this.state.inventory[item] >= 2) throw new Error(`${ITEM_DISPLAY[item]}已满。`);
        this.state.inventory[item] += 1;
        this.state.pendingRewardChoices = [];
        this.state.phase = this.state.rewardResumePhase ?? 'player';
        this.state.rewardResumePhase = undefined;
    }

    resolveEnemyTurn(): EnemyTurnResult {
        if (this.state.phase !== 'enemy') throw new Error('It is not the enemy turn.');
        this.reviveSnapshot = this.snapshot;
        this.state.enemies.forEach((piece) => { piece.isNewlySpawned = false; });

        const attackers = this.state.enemies
            .filter((piece) => piece.frozenTurns <= 0 && this.enemyCanCapturePlayer(piece, this.state.playerPosition, this.state.enemies))
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
    }

    revive(): ReviveResult {
        if (!this.canRevive || !this.reviveSnapshot) throw new Error('Revive is unavailable.');
        const before = this.state.score;
        this.restore(this.reviveSnapshot);
        this.state.reviveUsed = true;
        this.state.phase = 'player';
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
    }

    endGame(): void {
        if (this.state.phase !== 'dead' && this.state.phase !== 'ended') {
            throw new Error('The round can only end after death.');
        }
        this.state.phase = 'ended';
        this.reviveSnapshot = undefined;
    }

    /** Deterministic rule-test hook. */
    loadForTesting(value: Partial<ChessEndlessSnapshot>): void {
        const current = this.snapshot;
        this.restore({ ...current, ...value } as ChessEndlessSnapshot);
        this.reviveSnapshot = undefined;
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
            if (!enemies.some((piece) => this.enemyCanCapturePlayer(piece, this.state.playerPosition, enemies))
                && this.safePlayerMoves(this.state.playerPosition, enemies).length >= 2) {
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

    private enemyAt(
        at: BoardPosition,
        enemies: readonly EnemyPiece[] = this.state.enemies,
    ): EnemyPiece | undefined {
        return enemies.find((piece) => samePosition(piece.position, at));
    }

    private playerMoves(player: BoardPosition, enemies: readonly EnemyPiece[]): BoardPosition[] {
        const moves: BoardPosition[] = [];
        for (const direction of DIRECTIONS) {
            let column = player.column + direction.column;
            let row = player.row + direction.row;
            while (isInside(position(column, row))) {
                const target = position(column, row);
                moves.push(target);
                if (this.enemyAt(target, enemies)) break;
                column += direction.column;
                row += direction.row;
            }
        }
        return moves;
    }

    private safePlayerMoves(player: BoardPosition, enemies: readonly EnemyPiece[]): BoardPosition[] {
        return this.playerMoves(player, enemies).filter((target) => {
            const remaining = enemies.filter((piece) => !samePosition(piece.position, target)).map(cloneEnemy);
            return !remaining.some((piece) => (
                piece.frozenTurns <= 0 && this.enemyCanCapturePlayer(piece, target, remaining)
            ));
        });
    }

    private playerThreatenedIds(player: BoardPosition, enemies: readonly EnemyPiece[]): Set<number> {
        const threatened = new Set<number>();
        for (const direction of DIRECTIONS) {
            let column = player.column + direction.column;
            let row = player.row + direction.row;
            while (isInside(position(column, row))) {
                const enemy = this.enemyAt(position(column, row), enemies);
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

    private countBetween(left: BoardPosition, right: BoardPosition, enemies: readonly EnemyPiece[]): number {
        if (left.column !== right.column && left.row !== right.row) return -1;
        const columnStep = Math.sign(right.column - left.column);
        const rowStep = Math.sign(right.row - left.row);
        let column = left.column + columnStep;
        let row = left.row + rowStep;
        let count = 0;
        while (column !== right.column || row !== right.row) {
            if (this.enemyAt(position(column, row), enemies)) count += 1;
            column += columnStep;
            row += rowStep;
        }
        return count;
    }

    private enemyCanCapturePlayer(piece: EnemyPiece, player: BoardPosition, enemies: readonly EnemyPiece[]): boolean {
        const deltaColumn = player.column - piece.position.column;
        const deltaRow = player.row - piece.position.row;
        const absColumn = Math.abs(deltaColumn);
        const absRow = Math.abs(deltaRow);
        if (piece.type === 'pawn' || piece.type === 'general') return absColumn + absRow === 1;
        if (piece.type === 'advisor') return absColumn === 1 && absRow === 1;
        if (piece.type === 'elephant') {
            if (absColumn !== 2 || absRow !== 2) return false;
            return !this.enemyAt(position(
                piece.position.column + Math.sign(deltaColumn),
                piece.position.row + Math.sign(deltaRow),
            ), enemies);
        }
        if (piece.type === 'horse') {
            if (!((absColumn === 2 && absRow === 1) || (absColumn === 1 && absRow === 2))) return false;
            const leg = absColumn === 2
                ? position(piece.position.column + Math.sign(deltaColumn), piece.position.row)
                : position(piece.position.column, piece.position.row + Math.sign(deltaRow));
            return !this.enemyAt(leg, enemies);
        }
        const between = this.countBetween(piece.position, player, enemies);
        if (piece.type === 'rook') return between === 0;
        if (piece.type === 'cannon') return between === 1;
        return false;
    }

    private enemyDestinations(piece: EnemyPiece, enemies: readonly EnemyPiece[]): BoardPosition[] {
        const destinations: BoardPosition[] = [];
        const append = (target: BoardPosition): void => {
            if (!isInside(target) || samePosition(target, this.state.playerPosition) || this.enemyAt(target, enemies)) return;
            destinations.push(target);
        };
        if (piece.type === 'pawn' || piece.type === 'general') {
            DIRECTIONS.forEach((direction) => append(position(
                piece.position.column + direction.column,
                piece.position.row + direction.row,
            )));
        } else if (piece.type === 'advisor') {
            [-1, 1].forEach((column) => [-1, 1].forEach((row) => append(position(
                piece.position.column + column,
                piece.position.row + row,
            ))));
        } else if (piece.type === 'elephant') {
            [-2, 2].forEach((column) => [-2, 2].forEach((row) => {
                const eye = position(piece.position.column + column / 2, piece.position.row + row / 2);
                if (!this.enemyAt(eye, enemies) && !samePosition(eye, this.state.playerPosition)) {
                    append(position(piece.position.column + column, piece.position.row + row));
                }
            }));
        } else if (piece.type === 'horse') {
            HORSE_MOVES.forEach((move) => {
                const leg = Math.abs(move.column) === 2
                    ? position(piece.position.column + Math.sign(move.column), piece.position.row)
                    : position(piece.position.column, piece.position.row + Math.sign(move.row));
                if (!this.enemyAt(leg, enemies) && !samePosition(leg, this.state.playerPosition)) append(position(
                    piece.position.column + move.column,
                    piece.position.row + move.row,
                ));
            });
        } else {
            for (const direction of DIRECTIONS) {
                let column = piece.position.column + direction.column;
                let row = piece.position.row + direction.row;
                while (isInside(position(column, row))) {
                    const target = position(column, row);
                    if (samePosition(target, this.state.playerPosition) || this.enemyAt(target, enemies)) break;
                    destinations.push(target);
                    column += direction.column;
                    row += direction.row;
                }
            }
        }
        return destinations;
    }

    private buildEnemyCandidates(): EnemyCandidate[] {
        const beforeThreatened = this.playerThreatenedIds(this.state.playerPosition, this.state.enemies);
        const general = this.state.enemies.find((piece) => piece.type === 'general');
        const generalScoring = general ? GENERAL_AI_SCORING : undefined;
        const generalThreatenedBefore = Boolean(general && beforeThreatened.has(general.id));
        const beforeSafe = this.safePlayerMoves(this.state.playerPosition, this.state.enemies).length;
        const beforeCannonAttack = this.state.enemies.some((piece) => (
            piece.type === 'cannon' && this.enemyCanCapturePlayer(piece, this.state.playerPosition, this.state.enemies)
        ));
        const candidates: EnemyCandidate[] = [];

        for (const piece of this.state.enemies) {
            if (piece.frozenTurns > 0) continue;
            for (const target of this.enemyDestinations(piece, this.state.enemies)) {
                const simulated = this.state.enemies.map(cloneEnemy);
                const moved = simulated.find((enemy) => enemy.id === piece.id)!;
                moved.position = copyPosition(target);
                const afterThreatened = this.playerThreatenedIds(this.state.playerPosition, simulated);
                const generalThreatenedAfter = Boolean(general && afterThreatened.has(general.id));
                const afterSafe = this.safePlayerMoves(this.state.playerPosition, simulated).length;
                let score = 0;
                if (beforeThreatened.has(piece.id) && !afterThreatened.has(piece.id)) {
                    if (piece.type !== 'general') score += 600 + PIECE_VALUE[piece.type] * 3;
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
                if (simulated.some((enemy) => this.enemyCanCapturePlayer(enemy, this.state.playerPosition, simulated))) score += 400;
                const afterCannonAttack = simulated.some((enemy) => (
                    enemy.type === 'cannon' && this.enemyCanCapturePlayer(enemy, this.state.playerPosition, simulated)
                ));
                if (!beforeCannonAttack && afterCannonAttack) score += 180;
                score += Math.max(0, beforeSafe - afterSafe) * 30;
                if (afterThreatened.has(piece.id)) {
                    score -= 250 + PIECE_VALUE[piece.type] * 2;
                }
                score += this.aiNoise();
                candidates.push({
                    pieceId: piece.id,
                    type: piece.type,
                    from: copyPosition(piece.position),
                    to: copyPosition(target),
                    score,
                });
            }
        }
        return candidates;
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
        const available = ITEM_TYPES.filter((item) => this.state.inventory[item] < 2);
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
        return this.rng.integer(3, 4);
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
        const normalBlocked = queue.kind === 'normal'
            && this.state.enemies.length >= MAX_BOARD_REINFORCEMENT_THRESHOLD;
        const generalBlocked = queue.kind === 'general'
            && this.state.enemies.length > MAX_BOARD_REINFORCEMENT_THRESHOLD;
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
        const occupied = new Set(this.state.enemies.map((piece) => positionKey(piece.position)));
        occupied.add(positionKey(this.state.playerPosition));
        const open: BoardPosition[] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let column = 0; column < BOARD_COLUMNS; column += 1) {
                const candidate = position(column, row);
                if (!occupied.has(positionKey(candidate))) open.push(candidate);
            }
        }
        if (open.length < count) return undefined;
        const playerColumn = this.state.playerPosition.column;
        const playerRow = this.state.playerPosition.row;
        const directAttackRange = new Set(this.playerMoves(
            this.state.playerPosition,
            this.state.enemies,
        ).map(positionKey));

        // 先用“完全不与玩家车同横线/竖线”的候选，确保普通棋落地时肉眼可见地
        // 离开车的攻击方向；若棋盘拥挤，再放宽到被已有棋挡住的线位，最后才
        // 允许当前直接攻击线作为保底。
        const preferredPools = [
            open.filter((candidate) => candidate.column !== playerColumn && candidate.row !== playerRow),
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

        let safeFallback: BoardPosition[] | undefined;
        // 多次洗牌仍保留随机性，但每次只接受整批通过安全检查的结果；这样不会
        // 因一次随机抽样失败就把普通棋直接刷到车线上。
        for (let attempt = 0; attempt < 240; attempt += 1) {
            const placements = this.rng.shuffle(pool).slice(0, count);
            const simulated = this.state.enemies.map(cloneEnemy);
            const spawnedIds = new Set<number>();
            queuedTypes.forEach((type, index) => {
                const id = -1 - index;
                spawnedIds.add(id);
                simulated.push({ id, type, position: placements[index]!, frozenTurns: 0, isNewlySpawned: true });
            });
            if (this.safePlayerMoves(this.state.playerPosition, simulated).length === 0) continue;

            // 普通增援优先避开玩家车的直接吃子线；只有前面的候选层都找不到
            // 同时满足安全走法的整批落点时，才允许新棋成为下一步直接吃子目标。
            safeFallback ??= placements;
            const threatened = this.playerThreatenedIds(this.state.playerPosition, simulated);
            const newlyThreatened = [...spawnedIds].some((id) => threatened.has(id));
            if (!newlyThreatened) return placements;
        }
        return safeFallback;
    }

    private findGeneralPlacements(): BoardPosition[] | undefined {
        const occupied = new Set(this.state.enemies.map((piece) => positionKey(piece.position)));
        occupied.add(positionKey(this.state.playerPosition));
        const groups: BoardPosition[][] = [];
        for (let row = 0; row < BOARD_ROWS; row += 1) {
            for (let start = 0; start <= BOARD_COLUMNS - 3; start += 1) {
                const group = [position(start, row), position(start + 1, row), position(start + 2, row)];
                if (group.every((candidate) => !occupied.has(positionKey(candidate)))) groups.push(group);
            }
        }
        const safeGroups: Array<{ group: BoardPosition[]; distance: number }> = [];
        for (const group of this.rng.shuffle(groups)) {
            const simulated = this.state.enemies.map(cloneEnemy);
            (['advisor', 'general', 'advisor'] as const).forEach((type, index) => {
                simulated.push({ id: -1 - index, type, position: group[index]!, frozenTurns: 0, isNewlySpawned: true });
            });
            if (this.safePlayerMoves(this.state.playerPosition, simulated).length === 0) continue;
            if (this.playerThreatenedIds(this.state.playerPosition, simulated).has(-2)) continue;
            const generalPosition = group[1]!;
            safeGroups.push({
                group,
                distance: Math.abs(generalPosition.column - this.state.playerPosition.column)
                    + Math.abs(generalPosition.row - this.state.playerPosition.row),
            });
        }
        if (safeGroups.length === 0) return undefined;
        const greatestDistance = Math.max(...safeGroups.map((candidate) => candidate.distance));
        return this.rng.choose(safeGroups.filter((candidate) => candidate.distance === greatestDistance)).group;
    }
}
