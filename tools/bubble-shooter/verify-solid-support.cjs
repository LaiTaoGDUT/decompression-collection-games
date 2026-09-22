const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-solid-'));
try {
    execFileSync('tsc', ['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', out, '--skipLibCheck']);
    const { BubbleShooterModel, COLUMNS, MAX_ROW, DIAMETER, ROW_HEIGHT } = require(path.join(out, 'BubbleShooterModel.js'));
    const { BubbleShooterRound } = require(path.join(out, 'BubbleShooterRound.js'));
    const b = (row, col, color = 'blue') => ({ row, col, color, frosted: false });
    const solidRow = (row, phase) => Array.from({ length: COLUMNS - (row + phase) % 2 }, (_, col) => ({ ...b(row, col, 'red'), indestructible: true }));
    for (const phase of [0, 1]) {
        const board = new BubbleShooterModel();
        board.reset([b(0, 4), b(1, 4, 'yellow')], phase);
        const positions = board.bubbles.map(ball => board.position(ball));
        board.insertSupportRow();
        assert.equal(board.ceilingRow, 0);
        assert.equal(board.bubbles.filter(ball => ball.indestructible).length, COLUMNS - board.rowPhase);
        board.removableBubbles.forEach((ball, i) => {
            const point = board.position(ball);
            assert.equal(point.x, positions[i].x); assert(Math.abs(point.y - positions[i].y + ROW_HEIGHT) < 1e-8);
        });
        assert.equal(board.matchingCount({ row: 1, col: 0 }, 'red'), 0, 'neutral support never matches its legacy color field');
        assert.equal(board.applyFrost(board.bubbles.filter(ball => ball.indestructible)).length, 0);
        assert.equal(board.applySupport(board.bubbles.filter(ball => ball.indestructible), 'seaweed', 6).length, 0);
        assert(board.bombTargets({ row: 1, col: 0 }).every(ball => !ball.indestructible));
        const clear = board.clearTargets(board.bubbles);
        assert.equal(clear.removed.length, 2); assert.equal(clear.dropped.length, 0);
        const solids = board.bubbles.length;
        assert(solids > 0); assert.equal(board.clearTargets(board.bubbles).removed.length, 0);
        for (let degrees = -65; degrees <= 65; degrees += 5) {
            const angle = degrees * Math.PI / 180, shot = board.trace({ x: Math.sin(angle), y: Math.cos(angle) });
            if (!shot) continue;
            assert.equal(shot.cell.row, 1, 'shot attaches beneath real solid row');
            const target = board.position(shot.cell);
            assert(board.bubbles.every(ball => Math.hypot(target.x - board.position(ball).x, target.y - board.position(ball).y) >= DIAMETER - 1e-6));
        }
        const attached = board.settle({ row: 1, col: 4 }, 'red');
        assert.equal(attached.removed.length, 0, 'support must not complete a red triple');
        board.settle({ row: 1, col: 5 }, 'red');
        const match = board.settle({ row: 1, col: 6 }, 'red');
        assert.equal(match.removed.length, 3); assert.equal(board.bubbles.length, solids);
        board.reset([...solidRow(0, phase), b(1, 4), b(2, 4, 'yellow')], phase);
        const severed = board.clearTargets([{ row: 1, col: 4 }]);
        assert.equal(severed.dropped.length, 1, 'colored chain still drops when disconnected');
        board.reset([...solidRow(0, phase), b(1, 4), b(1, 5, 'yellow')], phase);
        assert.equal(board.clearTargets([{ row: 1, col: 4 }]).dropped.length, 0, 'other branch remains hung from solid row');
    }
    const round = new BubbleShooterRound(() => .2); round.reset();
    const base = round.snapshot();
    assert(round.restore({ ...base, futureRows: [], bubbles: [...solidRow(0, 0), b(1, 4), b(1, 5)] }));
    round.current = 'red'; round.next = 'yellow';
    assert(round.staleCurrent); assert.deepEqual(Array.from(round.supplyWeights().keys()), ['blue']);
    assert.equal(round.refreshStale(), 2); assert.equal(round.current, 'blue');
    const win = round.settle({ row: 1, col: 6 });
    assert(win.enteredBoss); assert(round.board.bubbles.every(ball => ball.indestructible));
    assert.equal(round.cleared, 3);
    const restored = new BubbleShooterRound(); assert(restored.restore(round.snapshot()));
    assert.deepEqual(restored.snapshot(), round.snapshot()); restored.beginBoss();
    assert(restored.board.bubbles.every(ball => !ball.indestructible));
    for (const region of ['cloud', 'ocean']) {
        assert(round.restore({ ...base, region, futureRows: [], bubbles: [...solidRow(0, 0), b(1, 4), b(2, 4)] }));
        assert(round.clearBottom().enteredBoss, 'clear-bottom ignores solids and can finish stage');
    }
    for (const phase of [0, 1]) {
        const old = { ...base, version: 7, phase, ceilingRow: 3, futureRows: [], bubbles: [b(3, 4), b(4, 4, 'yellow')], current: 'blue' };
        assert(restored.restore(old));
        assert.deepEqual(restored.board.removableBubbles, old.bubbles, 'migration preserves colored cell positions');
        assert.equal(restored.snapshot().ceilingRow, 0); assert.equal(restored.snapshot().version, 9);
        assert.equal(restored.board.bubbles.filter(ball => ball.indestructible).length, [0, 1, 2].reduce((n, row) => n + COLUMNS - (row + phase) % 2, 0));
        const migrated = restored.snapshot(), copy = new BubbleShooterRound(); assert(copy.restore(migrated));
        assert.deepEqual(copy.snapshot(), migrated);
        const malformed = [
            { ...migrated, bubbles: migrated.bubbles.slice(0, -1) },
            { ...migrated, stage: 'boss' },
            { ...migrated, ceilingRow: 1 },
            { ...migrated, futureRows: [Array(COLUMNS - (phase + 1) % 2).fill('blue')] },
            { ...migrated, bubbles: migrated.bubbles.map(ball => ball.indestructible ? { ...ball, frosted: true } : ball) },
            { ...migrated, bubbles: migrated.bubbles.map(ball => ({ ...ball, indestructible: 'yes' })) },
            { ...old, bubbles: [...old.bubbles, b(0, 1)] }
        ];
        for (const bad of malformed) { assert(!copy.restore(bad)); assert.deepEqual(copy.snapshot(), migrated); }
    }
    const solids = Array.from({ length: MAX_ROW - 1 }, (_, row) => solidRow(row, 0)).flat();
    assert(round.restore({ ...base, futureRows: [], bubbles: [...solids, b(MAX_ROW - 1, 4), b(MAX_ROW, 4)], ended: true }));
    assert(round.canRevive); assert(round.revive()); assert.equal(round.stage, 'boss-entry');
    assert.equal(round.board.bubbles.length, solids.length, 'revival keeps all support cells');
    assert.equal(round.cleared, base.cleared); assert(!round.ended); assert(!round.canRevive);
    assert(restored.restore(round.snapshot()));
    console.log('Solid support: collision/attachment, no match/item/frost removal, support/drop, palette, clear and revive victories, v7 migration, v8 roundtrip and atomic corruption rejection passed.');
} finally { fs.rmSync(out, { recursive: true, force: true }); }
