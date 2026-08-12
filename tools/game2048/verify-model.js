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
    assert.deepStrictEqual(model.board.slice(0, 4), [4, 4, 2, 0]);
    assert.strictEqual(model.score, 8);
    assert.strictEqual(model.canUndo, true);
    assert.strictEqual(model.undo(), true);
    assert.deepStrictEqual(model.board.slice(0, 4), [2, 2, 2, 2]);
    assert.strictEqual(model.undo(), false);
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
    assert.strictEqual(result.gameOver, false);
    assert.deepStrictEqual(model.board, before);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 64]);
    const result = model.move('left');
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.gameOver, true);
    assert.strictEqual(model.canUndo, false);
}

{
    const model = new Game2048Model(zeroRandom);
    model.loadForTesting([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = model.move('left');
    assert.strictEqual(result.reachedTarget, true);
    assert.strictEqual(model.highestTile, 2048);
    assert.strictEqual(model.score, 2048);
}

console.log('game2048_model=passed, cases=8, directions=left+right+up+down, invalid_move=passed, undo=passed, target=passed, gameover=passed');
