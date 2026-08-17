const assert = require('assert');
const path = require('path');

const { Game2048Model } = require(path.resolve('temp/game2048-model/Game2048Model.js'));

function zeroRandom() {
    return 0;
}

{
    const model = new Game2048Model(zeroRandom);
    const spawned = model.reset();
    assert.strictEqual(spawned.length, 2);
    assert.deepStrictEqual(model.board.slice(0, 4), [2, 2, 0, 0]);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = model.move('left');
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.scoreGained, 8);
    assert.deepStrictEqual(result.mergedIndices, [0, 1]);
    assert.deepStrictEqual(result.tileMotions.slice(0, 4), [
        { fromIndex: 0, toIndex: 0, value: 2, merges: true },
        { fromIndex: 1, toIndex: 0, value: 2, merges: true },
        { fromIndex: 2, toIndex: 1, value: 2, merges: true },
        { fromIndex: 3, toIndex: 1, value: 2, merges: true },
    ]);
    assert.deepStrictEqual(model.board.slice(0, 4), [4, 4, 2, 0]);
    assert.strictEqual(model.score, 8);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
    const result = model.move('up');
    assert.strictEqual(result.scoreGained, 12);
    assert.deepStrictEqual(model.board.filter(Boolean).sort((a, b) => a - b), [2, 4, 8]);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = model.move('right');
    assert.strictEqual(result.scoreGained, 12);
    assert.deepStrictEqual(model.board.slice(0, 4), [2, 0, 4, 8]);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
    const result = model.move('down');
    assert.strictEqual(result.scoreGained, 12);
    assert.deepStrictEqual([model.board[0], model.board[4], model.board[8], model.board[12]], [2, 0, 4, 8]);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const before = model.board.slice();
    const result = model.move('left');
    assert.strictEqual(result.changed, false);
    assert.deepStrictEqual(result.tileMotions, []);
    assert.strictEqual(result.gameOver, false);
    assert.deepStrictEqual(model.board, before);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 64]);
    const result = model.move('left');
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.gameOver, true);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = model.move('left');
    assert.strictEqual(result.reachedTarget, false);
    assert.strictEqual(model.highestTile, 2048);
    assert.strictEqual(model.score, 2048);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2048, 2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = model.move('left');
    assert.strictEqual(result.reachedTarget, true);
    assert.strictEqual(model.highestTile, 4096);
    assert.strictEqual(model.score, 4096);
    assert.strictEqual(model.snapshot.targetAcknowledged, false);
    assert.strictEqual(model.needsTargetCelebration, true);
    model.acknowledgeTarget();
    assert.strictEqual(model.snapshot.targetAcknowledged, true);
    assert.strictEqual(model.needsTargetCelebration, false);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([4096, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.strictEqual(model.snapshot.targetAcknowledged, false);
    model.acknowledgeTarget();
    assert.strictEqual(model.snapshot.targetAcknowledged, true);
}

console.log('game2048_model=passed, cases=10, directions=left+right+up+down, invalid_move=passed, milestone_2048=passed, target_4096=passed, resume_target_ack=passed, gameover=passed');
