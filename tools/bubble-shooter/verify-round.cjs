const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-round-'));
try {
    execFileSync('tsc', ['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts', '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck'], { cwd: path.resolve(__dirname, '../..') });
    const { BubbleShooterRound, ORDINARY_TUNING } = require(path.join(out, 'BubbleShooterRound.js'));
    const { BubbleShooterModel, ROW_HEIGHT, COLUMNS, MAX_ROW } = require(path.join(out, 'BubbleShooterModel.js'));
    const b = (row, col, color = 'red', frosted = false) => ({ row, col, color, frosted });
    const geometry = new BubbleShooterModel(Array.from({length:COLUMNS}, (_,col)=>b(0,col)));
    for (let insertion = 0; insertion < 4; insertion++) {
        const before = geometry.bubbles;
        const points = before.map(cell=>geometry.position(cell));
        geometry.insertRow(()=>.6);
        before.forEach((cell,i)=>{
            const moved = geometry.bubbles.find(x=>x.row===cell.row+1 && x.col===cell.col);
            assert(moved, 'No edge bubble may be dropped during parity reversal.');
            assert.equal(geometry.position(moved).x, points[i].x);
            assert(Math.abs(geometry.position(moved).y - (points[i].y - ROW_HEIGHT)) < 1e-8);
            assert.equal(moved.color, cell.color);
            assert.equal(moved.frosted, cell.frosted);
        });
        for (const cell of geometry.bubbles) for (const n of geometry.neighbors(cell)) {
            assert(geometry.neighbors(n).some(c=>c.row===cell.row && c.col===cell.col));
        }
        assert(geometry.trace({x:0,y:1}), 'Trace must stay valid after parity reversal.');
    }
    const round = new BubbleShooterRound(()=>.25);
    round.reset();
    round.board.reset([b(0,4), b(0,5), b(0,9,'blue')]);
    round.current='blue';round.next='purple';
    let result=round.settle({row:0,col:3});
    assert.equal(round.accumulatedMisses,1);assert.equal(round.consecutiveMisses,1);
    assert.equal(round.current,'purple','Displayed next must be preserved.');
    round.current='red';result=round.settle({row:0,col:6});
    assert.equal(result.removed.length,3);
    assert.equal(round.accumulatedMisses,1,'Successful clear must not erase accumulated misses.');
    assert.equal(round.consecutiveMisses,0);
    round.current='yellow';round.settle({row:0,col:2});
    round.current='purple';result=round.settle({row:0,col:1});
    assert(result.inserted);assert.equal(round.accumulatedMisses,0);assert.equal(round.consecutiveMisses,2);
    assert.equal(round.board.rowPhase,1);
    assert(round.board.bubbles.some(x=>x.row===1&&x.col===9),'Right edge survives insertion.');
    const snapshot=[round.accumulatedMisses,round.consecutiveMisses,round.cleared,JSON.stringify(round.board.bubbles)];
    const shown=[round.current,round.next];round.swap();round.swap();
    assert.deepEqual([round.current,round.next],shown);
    assert.deepEqual([round.accumulatedMisses,round.consecutiveMisses,round.cleared,JSON.stringify(round.board.bubbles)],snapshot);

    round.reset();round.board.reset([b(0,4),b(0,5),b(0,9,'blue')]);
    round.current='red';round.next='red';result=round.settle({row:0,col:3});
    assert(round.staleCurrent);assert.equal(round.current,'red');assert.equal(round.next,'blue');
    const counts=[round.accumulatedMisses,round.consecutiveMisses,round.cleared];
    assert.equal(round.refreshStale(),1);assert.equal(round.current,'blue');
    assert.deepEqual([round.accumulatedMisses,round.consecutiveMisses,round.cleared],counts);
    assert.equal(round.refreshStale(),0);

    round.reset();round.board.reset([b(0,4),b(0,5)]);round.current='red';round.next='purple';round.accumulatedMisses=2;
    result=round.settle({row:0,col:3});
    assert(result.refilled&&!result.inserted&&!result.danger);
    assert.equal(round.board.bubbles.length,81);
    assert.equal(round.accumulatedMisses,2);assert.equal(round.current,'purple');assert.equal(round.cleared,3);
    round.board.reset([b(0,4),b(0,5),b(0,9,'blue')]);round.consecutiveMisses=0;
    const plain=round.supplyWeights();round.consecutiveMisses=ORDINARY_TUNING.protectionAfter;
    const boosted=round.supplyWeights();
    assert(boosted.get('red')>plain.get('red'));assert.equal(boosted.get('blue'),plain.get('blue'));
    assert(!boosted.has('yellow')&&!boosted.has('purple'));
    round.board.reset(Array.from({length:MAX_ROW},(_,row)=>b(row,4)));
    round.accumulatedMisses=2;round.current='blue';result=round.settle({row:MAX_ROW-1,col:5});
    assert(result.inserted&&result.danger);assert(round.ended);
    assert.throws(()=>round.settle({row:0,col:0}));
    round.reset();assert(!round.ended);assert.equal(round.accumulatedMisses,0);assert.equal(round.consecutiveMisses,0);
    round.clear();assert.equal(round.board.bubbles.length,0);
    console.log('Round passed: parity/vertical insertion, miss counters, preserved previews, explicit stale refresh, refill, bounded supply bias, danger, reset.');
} finally { fs.rmSync(out, {recursive:true, force:true}); }
