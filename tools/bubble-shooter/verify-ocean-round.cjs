const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-ocean-round-'));
try {
    execFileSync('tsc', ['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', out, '--skipLibCheck']);
    const { BubbleShooterRound, OCEAN_TUNING } = require(path.join(out, 'BubbleShooterRound.js'));
    let seed = 83;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const b = (row, col, color = 'blue', support) => ({ row, col, color, frosted: false, ...(support ? { support } : {}) });
    const roundtrip = r => {
        const copy = new BubbleShooterRound(random);
        assert(copy.restore(JSON.parse(JSON.stringify(r.snapshot()))));
        assert.deepEqual(copy.snapshot(), r.snapshot());
        assert.equal(copy.region, 'ocean');
    };
    for (let i = 0; i < 20; i++) {
        const r = new BubbleShooterRound(random); r.reset('ocean');
        assert.equal(r.board.bubbles.length, 135);
        assert.equal(r.board.bubbles.filter(b => b.support === 'seaweed').length, OCEAN_TUNING.ordinaryAnchors);
        assert(r.board.bubbles.every(b => !b.frosted)); roundtrip(r);
        r.stage = 'boss-entry'; r.regionProgress = r.difficulty.progressRequired; roundtrip(r);
        r.beginBoss(); assert.equal(r.board.bubbles.length, 125);
        assert(r.board.bubbles.every(b => !b.frosted && !b.support));
        r.current = 'purple'; r.bossShots = 2;
        const shot = r.board.trace({ x: 0, y: 1 }); assert(shot);
        const result = r.settle(shot.cell);
        assert(result.inserted); assert.equal(result.supported.length, 2);
        assert.equal(result.frosted.length, 0); assert.equal(r.frostTargets.length, 0);
        assert(r.board.bubbles.filter(b => b.support).every(b => b.support === 'tentacle'));
        roundtrip(r);
    }
    const r = new BubbleShooterRound(random); r.reset('ocean');
    // Matching a grabbed root releases its suspended neighbors and awards both as Boss damage.
    r.stage = 'boss'; r.board.reset([b(0,12), b(3,4,'red','tentacle'), b(3,5,'red'), b(4,4)]);
    r.current = 'red'; const hit = r.settle({row:3,col:3});
    assert.equal(hit.removed.length, 3); assert.equal(hit.dropped.length, 1);
    assert.equal(hit.damage, 4); assert(!r.board.bubbles.some(b => b.support)); roundtrip(r);
    // The winning shot cannot add a row or attach new tentacles.
    r.board.reset([b(0,4,'red','tentacle'), b(0,5,'red')]); r.current = 'red';
    r.bossHealth = 1; r.bossShots = 2;
    const win = r.settle({row:0,col:3}); assert(win.victory);
    assert(!win.inserted); assert.equal(win.supported.length,0); roundtrip(r);
    const queue = [r.current, r.next]; assert(r.claimReward('bomb'));
    const inventory = {...r.inventory}; assert(r.continueRegion('ocean'));
    assert(!r.continueRegion('ocean')); assert.deepEqual(r.inventory,inventory);
    assert.deepEqual([r.current,r.next],queue); roundtrip(r);
    // Region restrictions and malformed support saves must reject atomically.
    const s = r.snapshot();
    const invalid = [
        {...s, region:'unknown'}, {...s, region:undefined}, {...s, version:3},
        {...s, bubbles:s.bubbles.map((b,i)=>i === 0 ? {...b,frosted:true} : b)},
        {...s, bubbles:s.bubbles.map((b,i)=>i === 0 ? {...b,support:'tentacle'} : b)},
        {...s, bubbles:s.bubbles.map((b,i)=>({...b,support:i < 7 ? 'seaweed' : undefined}))},
        {...s, frostTargets:[{row:0,col:0}]},
    ];
    for (const bad of invalid) { assert(!r.restore(bad)); assert.deepEqual(r.snapshot(),s); }
    assert(!r.restore(s,['cloud'])); assert.deepEqual(r.snapshot(),s);
    // Ordinary row pressure preserves support kind and caps additions.
    r.board.reset([b(0,0), b(1,0)]); r.accumulatedMisses = 2; r.current = 'purple';
    const pushed = r.settle({row:2,col:0}); assert(pushed.inserted);
    assert.equal(pushed.supported.length,1); assert.equal(pushed.supported[0].support,'seaweed'); roundtrip(r);
    // A revive keeps the region and shared one-revive-per-run rule across region changes.
    r.board.reset(Array.from({length:17},(_,row)=>b(row,4)));
    r.ended = true; assert(r.canRevive); assert(r.revive()); assert(!r.board.danger); roundtrip(r);
    r.stage='victory'; r.ended=true; r.bossHealth=0; assert(r.claimReward('wildcard'));
    assert(r.continueRegion('cloud')); assert.equal(r.snapshot().version,5);
    assert(r.board.bubbles.every(b=>!b.support)); r.ended=true; assert(!r.canRevive);
    console.log('Ocean round: anchors, third-shot grabs, matching/drop damage, victory priority, region continuation, revive persistence, v4 roundtrip and atomic corrupt-save rejection passed.');
} finally { fs.rmSync(out, { recursive:true, force:true }); }
