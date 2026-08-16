const assert = require('assert');
const path = require('path');

const {
    BOARD_COLUMNS,
    BOARD_ROWS,
    ChessEndlessModel,
} = require(path.resolve('temp/chess-endless-model/ChessEndlessModel.js'));

function at(column, row) {
    return { column, row };
}

function enemy(id, type, column, row, frozenTurns = 0) {
    return { id, type, position: at(column, row), frozenTurns, isNewlySpawned: false };
}

function inventory(overrides = {}) {
    return { crossSlash: 0, freeze: 0, delay: 0, banish: 0, teleport: 0, ...overrides };
}

assert.strictEqual(BOARD_COLUMNS, 9);
assert.strictEqual(BOARD_ROWS, 10);

{
    const first = new ChessEndlessModel(123456).snapshot;
    const second = new ChessEndlessModel(123456).snapshot;
    assert.deepStrictEqual(first.enemies, second.enemies);
    assert.deepStrictEqual(first.queuedReinforcement, second.queuedReinforcement);
    assert.strictEqual(first.enemies.length, 5);
    assert.deepStrictEqual(first.enemies.map((piece) => piece.type).sort(), ['advisor', 'advisor', 'elephant', 'pawn', 'pawn']);
}

{
    const model = new ChessEndlessModel(1);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'pawn', 4, 1), enemy(2, 'horse', 7, 4)],
        phase: 'player',
        nextPieceId: 3,
    });
    const moves = model.getPlayerLegalMoves();
    assert(moves.some((move) => move.column === 4 && move.row === 1), 'Rook should capture the first vertical enemy.');
    assert(!moves.some((move) => move.column === 4 && move.row === 0), 'Rook must not move through an enemy.');
    assert(moves.some((move) => move.column === 7 && move.row === 4), 'Rook should capture the first horizontal enemy.');
    assert(!moves.some((move) => move.column === 8 && move.row === 4), 'Rook must stop after a capture target.');
}

const immediateCases = [
    ['pawn', at(4, 3), []],
    ['advisor', at(3, 3), []],
    ['elephant', at(2, 2), []],
    ['horse', at(2, 3), []],
    ['rook', at(4, 0), []],
    ['cannon', at(4, 0), [enemy(2, 'pawn', 4, 2)]],
    ['general', at(4, 3), []],
];
for (const [type, piecePosition, blockers] of immediateCases) {
    const model = new ChessEndlessModel(9);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, type, piecePosition.column, piecePosition.row), ...blockers],
        phase: 'enemy',
        reinforcementTimer: 5,
        nextPieceId: 10,
    });
    assert.strictEqual(model.resolveEnemyTurn().killedPlayer, true, `${type} immediate capture should be recognized.`);
}

{
    const blockedHorse = new ChessEndlessModel(4);
    blockedHorse.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'horse', 2, 3), enemy(2, 'pawn', 3, 3)],
        phase: 'enemy',
        reinforcementTimer: 5,
    });
    assert.strictEqual(blockedHorse.resolveEnemyTurn().killedPlayer, false, 'A blocked horse leg must prevent capture.');

    const blockedElephant = new ChessEndlessModel(5);
    blockedElephant.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'elephant', 2, 2), enemy(2, 'pawn', 3, 3)],
        phase: 'enemy',
        reinforcementTimer: 5,
    });
    assert.strictEqual(blockedElephant.resolveEnemyTurn().killedPlayer, false, 'A blocked elephant eye must prevent capture.');
}

{
    const model = new ChessEndlessModel(12);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'pawn', 4, 3)],
        phase: 'player',
        reinforcementTimer: 5,
        inventory: inventory({ freeze: 1 }),
    });
    model.useItem('freeze', 1);
    model.movePlayer(at(5, 4));
    const turn = model.resolveEnemyTurn();
    assert.strictEqual(turn.killedPlayer, false);
    assert.strictEqual(model.snapshot.enemies[0].frozenTurns, 0);
    assert.strictEqual(model.snapshot.inventory.freeze, 0);
}

{
    const model = new ChessEndlessModel(22);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [
            enemy(1, 'pawn', 4, 0),
            enemy(2, 'rook', 8, 5),
            enemy(3, 'general', 0, 5),
            enemy(4, 'advisor', 1, 1),
        ],
        phase: 'player',
        inventory: inventory({ crossSlash: 1 }),
        generalActive: true,
        nextPieceId: 5,
    });
    model.useItem('crossSlash');
    const move = model.movePlayer(at(4, 5));
    assert.strictEqual(move.crossSlashKills.length, 3);
    assert.strictEqual(move.crossSlashKills.reduce((sum, record) => sum + record.score, 0), 342);
    assert.strictEqual(model.snapshot.generalKills, 1);
    assert.strictEqual(model.snapshot.phase, 'reward');
    assert.strictEqual(model.snapshot.pendingRewardChoices.length, 3);
}

{
    const model = new ChessEndlessModel(37);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'rook', 4, 0), enemy(2, 'pawn', 0, 4)],
        phase: 'enemy',
        reinforcementTimer: 5,
        inventory: inventory(),
    });
    const death = model.resolveEnemyTurn();
    assert.strictEqual(death.killedPlayer, true);
    assert.strictEqual(model.canRevive, true);
    const revived = model.revive();
    assert.strictEqual(model.snapshot.phase, 'player');
    assert.strictEqual(model.snapshot.reviveUsed, true);
    assert.strictEqual(revived.kills.length, 2, 'Revive cross slash should clear both axes from the restored position.');
}

{
    const model = new ChessEndlessModel(41);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'pawn', 4, 3), enemy(2, 'rook', 0, 4)],
        phase: 'enemy',
        reinforcementTimer: 5,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.killedPlayer, true);
    assert.strictEqual(result.moved.pieceId, 2, 'Immediate killers should prioritize the highest-value piece.');
}

{
    const model = new ChessEndlessModel(51);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [],
        phase: 'enemy',
        reinforcementTimer: 1,
        reinforcementState: 'COUNTDOWN',
        queuedReinforcement: { kind: 'normal', types: ['pawn', 'advisor'] },
        nextPieceId: 1,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.reinforcementKind, 'normal');
    assert.strictEqual(result.spawned.length, 2, 'The complete queued reinforcement batch must enter together.');
    assert(model.getSafePlayerMoves().length > 0, 'A reinforcement placement must preserve at least one safe player move.');
}

{
    const occupied = [];
    let id = 1;
    for (let row = 0; row < BOARD_ROWS && occupied.length < 24; row += 1) {
        for (let column = 0; column < BOARD_COLUMNS && occupied.length < 24; column += 1) {
            if (column === 4 && row === 4) continue;
            occupied.push(enemy(id++, 'pawn', column, row, 1));
        }
    }
    const model = new ChessEndlessModel(52);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: occupied,
        phase: 'enemy',
        reinforcementTimer: 1,
        reinforcementState: 'COUNTDOWN',
        queuedReinforcement: { kind: 'normal', types: ['pawn'] },
        nextPieceId: id,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.spawned.length, 0);
    assert.strictEqual(result.enteredWaiting, true);
    assert.strictEqual(model.snapshot.reinforcementState, 'WAITING', 'Normal reinforcements wait at 24 occupied enemy slots.');
}

{
    const model = new ChessEndlessModel(53);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [],
        phase: 'enemy',
        reinforcementTimer: 1,
        reinforcementState: 'GENERAL_COUNTDOWN',
        queuedReinforcement: { kind: 'general', types: ['advisor', 'general', 'advisor'] },
        nextPieceId: 1,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.reinforcementKind, 'general');
    assert.deepStrictEqual(result.spawned.map((piece) => piece.type), ['advisor', 'general', 'advisor']);
    const ordered = [...result.spawned].sort((left, right) => left.position.column - right.position.column);
    assert.strictEqual(ordered[1].type, 'general', 'The general must occupy the middle of the horizontal formation.');
    assert.strictEqual(ordered[0].position.row, ordered[2].position.row);
    assert(!model.getPlayerLegalMoves().some((move) => (
        move.column === ordered[1].position.column && move.row === ordered[1].position.row
    )), 'A newly deployed general must not be immediately capturable by the player rook.');
    assert.strictEqual(model.snapshot.generalActive, true);
}

{
    const model = new ChessEndlessModel(54);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [],
        phase: 'enemy',
        reinforcementTimer: 1,
        reinforcementState: 'COUNTDOWN',
        queuedReinforcement: { kind: 'normal', types: ['pawn'] },
        generalCounter: 8,
        generalTargetN: 8,
        nextPieceId: 1,
    });
    model.resolveEnemyTurn();
    assert.strictEqual(model.snapshot.queuedReinforcement.kind, 'general');
    assert.strictEqual(model.snapshot.reinforcementState, 'GENERAL_COUNTDOWN');
    assert.deepStrictEqual(model.snapshot.queuedReinforcement.types, ['advisor', 'general', 'advisor']);
}

{
    const delay = new ChessEndlessModel(61);
    delay.loadForTesting({
        phase: 'player',
        reinforcementTimer: 2,
        reinforcementState: 'COUNTDOWN',
        inventory: inventory({ delay: 1, banish: 1 }),
    });
    delay.useItem('delay');
    assert.strictEqual(delay.snapshot.reinforcementTimer, 4);
    assert.strictEqual(delay.snapshot.inventory.delay, 0);
    assert.throws(() => delay.useItem('banish', 1), /Only one item/, 'Only one item may be used in a turn.');

    const banish = new ChessEndlessModel(62);
    banish.loadForTesting({
        phase: 'player',
        enemies: [enemy(1, 'horse', 0, 0), enemy(2, 'general', 8, 9)],
        inventory: inventory({ banish: 1 }),
        nextPieceId: 3,
    });
    const removed = banish.useItem('banish', 1);
    assert.strictEqual(removed.removed.type, 'horse');
    assert.strictEqual(banish.snapshot.enemies.length, 1);
    assert.strictEqual(banish.snapshot.score, 0);
    assert.strictEqual(banish.snapshot.totalKills, 0, 'Banish must not count as a kill.');

    const teleport = new ChessEndlessModel(63);
    teleport.loadForTesting({
        playerPosition: at(4, 4),
        phase: 'player',
        enemies: [enemy(1, 'pawn', 8, 8)],
        inventory: inventory({ teleport: 1 }),
    });
    teleport.useItem('teleport', at(0, 0));
    assert.deepStrictEqual(teleport.snapshot.playerPosition, at(0, 0));
    assert.strictEqual(teleport.snapshot.phase, 'player', 'Teleport must not replace the mandatory rook move.');
    teleport.movePlayer(at(0, 1));
    assert.strictEqual(teleport.snapshot.phase, 'enemy');
}

{
    const model = new ChessEndlessModel(71);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'pawn', 4, 0)],
        phase: 'player',
        score: 0,
        combo: 0,
        maxCombo: 0,
        reinforcementTimer: 5,
        nextPieceId: 2,
    });
    const first = model.movePlayer(at(4, 0));
    assert.strictEqual(first.scoreDelta, 10);
    assert.strictEqual(first.combo, 1);
    assert.strictEqual(model.snapshot.maxCombo, 1);

    model.loadForTesting({
        playerPosition: at(4, 0),
        enemies: [enemy(2, 'pawn', 0, 0)],
        phase: 'player',
        nextPieceId: 3,
    });
    const second = model.movePlayer(at(0, 0));
    assert.strictEqual(second.scoreDelta, 12, 'The second consecutive capture should use the 1.2 combo multiplier.');
    assert.strictEqual(second.combo, 2);
    assert.strictEqual(model.snapshot.maxCombo, 2);

    model.loadForTesting({
        playerPosition: at(0, 0),
        enemies: [enemy(3, 'pawn', 5, 0)],
        phase: 'player',
        inventory: inventory({ crossSlash: 1 }),
        nextPieceId: 4,
    });
    model.useItem('crossSlash');
    const cross = model.movePlayer(at(5, 0));
    assert.strictEqual(cross.captured.piece.id, 3);
    assert.strictEqual(cross.combo, 3, 'A normal capture should advance combo even when Cross Slash is armed.');

    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(4, 'pawn', 5, 0)],
        phase: 'player',
        combo: 3,
        inventory: inventory({ crossSlash: 1 }),
        usedItemThisTurn: false,
        nextPieceId: 5,
    });
    model.useItem('crossSlash');
    const crossOnly = model.movePlayer(at(5, 4));
    assert.strictEqual(crossOnly.crossSlashKills.length, 1);
    assert.strictEqual(crossOnly.combo, 0, 'A Cross Slash kill after an empty normal move must not maintain combo.');
    assert.strictEqual(model.snapshot.maxCombo, 3, 'Resetting combo must preserve the historical maximum.');
}

{
    const model = new ChessEndlessModel(81);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'rook', 4, 0)],
        phase: 'player',
        nextPieceId: 2,
    });
    const dangerKeys = new Set(model.getDangerPositions().map((cell) => `${cell.column},${cell.row}`));
    assert(dangerKeys.has('4,4'), 'The current rook file must be marked as dangerous.');
    assert(dangerKeys.has('4,8'), 'Future cells attacked by the rook must be marked as dangerous.');
    assert(!dangerKeys.has('3,4'), 'An unattacked neighbouring file must not be marked as dangerous.');
}

{
    const model = new ChessEndlessModel(82);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'pawn', 4, 0)],
        phase: 'player',
        reinforcementTimer: 5,
        reinforcementState: 'COUNTDOWN',
        queuedReinforcement: { kind: 'normal', types: ['pawn', 'advisor'] },
        nextPieceId: 2,
    });
    const result = model.movePlayer(at(4, 0));
    assert.strictEqual(result.immediateSpawned.length, 2, 'Clearing the board must immediately deploy the queued wave.');
    assert.strictEqual(result.immediateReinforcementKind, 'normal');
    assert.strictEqual(model.snapshot.enemies.length, 2);
}

{
    let exposedMoves = 0;
    let escapingMoves = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
        const model = new ChessEndlessModel(seed);
        model.loadForTesting({
            playerPosition: at(4, 4),
            enemies: [enemy(1, 'general', 4, 0)],
            phase: 'enemy',
            reinforcementTimer: 99,
            generalActive: true,
            nextPieceId: 2,
        });
        const result = model.resolveEnemyTurn();
        if (result.moved.to.column === 4) exposedMoves += 1;
        else escapingMoves += 1;
    }
    assert.strictEqual(exposedMoves, 0, 'A threatened general must take a safe escape when one is available.');
    assert.strictEqual(escapingMoves, 200);
}

{
    const model = new ChessEndlessModel(83);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'general', 4, 0, 1), enemy(2, 'advisor', 3, 1)],
        phase: 'enemy',
        reinforcementTimer: 99,
        generalActive: true,
        nextPieceId: 3,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.moved.pieceId, 2, 'An ally should protect a threatened general when the general cannot move.');
    assert.deepStrictEqual(result.moved.to, at(4, 2), 'The advisor should block the open rook line to the general.');
}

{
    const model = new ChessEndlessModel(85);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'general', 4, 0, 1), enemy(2, 'advisor', 4, 2), enemy(3, 'pawn', 0, 0)],
        phase: 'enemy',
        reinforcementTimer: 99,
        generalActive: true,
        nextPieceId: 4,
    });
    const result = model.resolveEnemyTurn();
    assert.strictEqual(result.moved.pieceId, 3, 'AI should preserve an existing guard instead of exposing the general.');
}

{
    const model = new ChessEndlessModel(84);
    model.loadForTesting({
        playerPosition: at(4, 4),
        enemies: [enemy(1, 'general', 4, 0)],
        phase: 'player',
        inventory: inventory({ crossSlash: 2, freeze: 2, delay: 2, banish: 2, teleport: 2 }),
        generalActive: true,
        nextPieceId: 2,
    });
    model.movePlayer(at(4, 0));
    assert.strictEqual(model.snapshot.pendingRewardChoices.length, 0, 'A full item dock must suppress the reward selection panel.');
    assert.strictEqual(model.snapshot.phase, 'enemy');
}

{
    let crossOffered = 0;
    const otherOffered = { freeze: 0, delay: 0, banish: 0, teleport: 0 };
    for (let seed = 1000; seed < 1400; seed += 1) {
        const model = new ChessEndlessModel(seed);
        model.loadForTesting({
            playerPosition: at(4, 4),
            enemies: [enemy(1, 'general', 4, 0)],
            phase: 'player',
            inventory: inventory(),
            generalActive: true,
            nextPieceId: 2,
        });
        model.movePlayer(at(4, 0));
        for (const item of model.snapshot.pendingRewardChoices) {
            if (item === 'crossSlash') crossOffered += 1;
            else otherOffered[item] += 1;
        }
    }
    const averageOther = Object.values(otherOffered).reduce((sum, count) => sum + count, 0) / 4;
    assert(crossOffered < averageOther * 0.45, 'Cross Slash must be materially rarer than every-day rewards.');
}

{
    for (const difficultyLevel of [1, 5, 9, 13, 18]) {
        const model = new ChessEndlessModel(900 + difficultyLevel);
        model.loadForTesting({
            playerPosition: at(4, 4),
            enemies: [],
            phase: 'enemy',
            reinforcementTimer: 1,
            reinforcementState: 'COUNTDOWN',
            queuedReinforcement: { kind: 'normal', types: ['pawn', 'advisor'] },
            difficultyLevel,
            nextPieceId: 1,
        });
        model.resolveEnemyTurn();
        const nextCount = model.snapshot.queuedReinforcement.types.length;
        assert(nextCount >= 2 && nextCount <= 4, `Difficulty ${difficultyLevel} queued an invalid wave size.`);
    }
}

console.log('chess_endless_model=passed, cases=24, board=9x10, pieces=7, items=5, combo_scoring=passed, danger_map=passed, general_survival=passed, general_guarding=passed, reward_weighting=passed, immediate_wave=passed, all_items=passed, reinforcements=passed, general_formation=passed, revive_snapshot=passed, cross_slash=passed');
