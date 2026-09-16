const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-revive-'));
try {
    execFileSync('tsc', ['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts', '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck'], {cwd: path.resolve(__dirname, '../..')});
    const {BubbleShooterRound} = require(path.join(out, 'BubbleShooterRound.js'));
    const {DANGER, ROW_HEIGHT, DIAMETER, MAX_ROW} = require(path.join(out, 'BubbleShooterModel.js'));
    for (const stage of ['ordinary', 'boss']) for (const phase of [0, 1]) {
        const r = new BubbleShooterRound(() => .2); r.reset();
        assert.equal(r.revive(), false);
        const cells = Array.from({length: MAX_ROW + 1}, (_, row) => ({row, col: 4, color: 'red', frosted: row >= 7}));
        r.board.reset(cells, phase); r.stage = stage; r.ended = true;
        r.regionProgress = 42; r.bossHealth = 17; r.cleared = 88;
        r.inventory.bomb = 2; r.current = 'blue'; r.next = 'purple';
        r.accumulatedMisses = 2; r.consecutiveMisses = 3; r.bossShots = 2; r.frostTargets = [{row: 7, col: 4}];
        assert(r.board.danger); assert(r.canRevive); assert(r.revive());
        assert(!r.ended); assert(!r.board.danger); assert(!r.canRevive);
        assert(r.board.bubbles.length > 0);
        assert(r.board.bubbles.every(b => r.board.position(b).y - DIAMETER / 2 >= DANGER + 2 * ROW_HEIGHT));
        assert.equal(r.board.rowPhase, phase);
        assert.deepEqual([r.regionProgress, r.bossHealth, r.cleared, r.inventory.bomb, r.current, r.next], [42,17,88,2,'blue','purple']);
        assert.deepEqual([r.accumulatedMisses,r.consecutiveMisses,r.bossShots,r.frostTargets.length], [0,0,0,0]);
        r.ended = true; assert(!r.canRevive); assert(!r.revive());
        r.stage = 'victory'; assert(r.claimReward('wildcard')); assert(r.continueCloud());
        r.ended = true; assert(!r.canRevive, 'Region continuation must not restore the session revive');
        r.reset(); r.ended = true; assert(r.canRevive);
        r.stage = 'victory'; assert(!r.revive());
    }
    console.log('Revive: safe distance, both phases/stages, preserved progress/queue/items, counters, once per run and restart passed.');
} finally { fs.rmSync(out, {recursive:true, force:true}); }
