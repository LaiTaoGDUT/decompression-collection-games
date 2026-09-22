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
        assert.equal(r.board.bubbles.length, 125);
        assert.equal(r.board.bubbles.filter(b => b.solidKind === 'ocean').length, OCEAN_TUNING.ordinaryAnchors);
        assert(r.board.bubbles.every(b => !b.frosted)); roundtrip(r);
        r.futureRows=[];r.board.reset([]);r.stage = 'boss-entry'; roundtrip(r);
        r.beginBoss(); assert.equal(r.board.bubbles.length, 115);
        assert(r.board.bubbles.every(b => !b.frosted && !b.support));
        r.current = 'purple'; r.bossShots = 2;
        const shot = r.board.trace({ x: 0, y: 1 }); assert(shot);
        const result = r.settle(shot.cell);
        assert(result.inserted); assert.equal(result.supported.length, 2);
        assert.equal(result.frosted.length, 0); assert.equal(r.frostTargets.length, 0);
        assert(r.board.bubbles.filter(b => b.solidKind).every(b => b.indestructible));
        roundtrip(r);
    }
    const r = new BubbleShooterRound(random); r.reset('ocean');
    // Neutral stones survive every removal path and keep neighboring colors suspended.
    const stone={...b(3,4),color:'red',indestructible:true,solidKind:'ocean'};
    r.futureRows=[];r.stage='boss';r.board.reset([b(0,12),stone,b(3,5,'red'),b(4,4)]);
    const clear=r.board.clearTargets([stone]);assert.equal(clear.removed.length,0);assert.equal(clear.dropped.length,0);
    r.current='red';const hit=r.settle({row:3,col:3});
    assert.equal(hit.removed.length,0,'stone dummy color must not match');assert(r.board.bubbles.some(b=>b.solidKind));roundtrip(r);
    // Winning damage still precedes pressure and conversion, even if a stone remains.
    r.board.reset([{...stone,row:0,col:8},b(0,4,'red'),b(0,5,'red')]);r.current='red';r.bossHealth=1;r.bossShots=2;
    const win=r.settle({row:0,col:3});assert(win.victory);assert(!win.inserted);assert.equal(win.supported.length,0);roundtrip(r);
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
    r.board.reset(Array.from({length:5},(_,row)=>Array.from({length:10},(_,col)=>b(row,col))).flat()); r.accumulatedMisses = 2; r.current = 'purple';
    const pushed = r.settle({row:5,col:0}); assert(pushed.inserted);
    assert.equal(pushed.supported.length,1); assert.equal(pushed.supported[0].solidKind,'ocean');assert(pushed.supported[0].indestructible); roundtrip(r);
    // A revive keeps the region and shared one-revive-per-run rule across region changes.
    r.board.reset(Array.from({length:15},(_,row)=>b(row,4)),r.board.rowPhase);
    r.ended = true; assert(r.canRevive); assert(r.revive()); assert(!r.board.danger); roundtrip(r);
    r.stage='victory'; r.ended=true; r.bossHealth=0; assert(r.claimReward('wildcard'));
    assert(r.continueRegion('cloud')); assert.equal(r.snapshot().version,9);
    assert(r.board.bubbles.every(b=>!b.support)); r.ended=true; assert(!r.canRevive);
        // Legacy grabbed colors migrate atomically to neutral stones, retaining exact positions.
    const legacy=new BubbleShooterRound(random);legacy.reset('ocean');
    const old={...legacy.snapshot(),version:8,bubbles:[b(0,4),b(2,4,'purple','seaweed')]};
    assert(legacy.restore(old));assert.equal(legacy.board.bubbles.find(b=>b.row===2).solidKind,'ocean');
    assert(!legacy.board.bubbles.some(b=>b.support));roundtrip(legacy);
    const stable=legacy.snapshot();
    assert(!legacy.restore({...stable,region:'cloud'}));assert.deepEqual(legacy.snapshot(),stable);
    // Boss with only stones and nonzero HP gets new colors without erasing existing stones.
    const refill=new BubbleShooterRound(random);refill.reset('ocean');refill.futureRows=[];refill.stage='boss';
    refill.board.reset([{...stone,row:0,col:8},b(0,4,'red'),b(0,5,'red')]);refill.current='red';
    const replenished=refill.settle({row:0,col:3});assert(replenished.refilled);assert(refill.board.removableBubbles.length>0);
    assert(refill.board.bubbles.some(b=>b.row===0 && b.col===8 && b.solidKind==='ocean'));roundtrip(refill);
    // Conversion cap is independent of full pressure rows, and duplicate targets do not double count.
    const cap=new BubbleShooterRound(random);cap.reset('ocean');
    cap.board.petrify(cap.board.removableBubbles,6);assert.equal(cap.board.bubbles.filter(b=>b.solidKind).length,6);
    assert.equal(cap.board.petrify(cap.board.removableBubbles,6).length,0);roundtrip(cap);
    const protection=new BubbleShooterRound(random);protection.reset('ocean');
    protection.board.reset([b(0,4,'purple'),b(1,4,'blue')]);
    const made=protection.board.petrify([{row:0,col:4},{row:0,col:4}],6);assert.equal(made.length,1);
    assert.equal(protection.board.applyFrost(made).length,0);
    assert.equal(protection.board.matchingCount({row:0,col:3},'red'),0);
    assert.equal(protection.board.clearTargets(made).removed.length,0);assert.equal(protection.board.removableBubbles.length,1);
    const blasted=protection.board.clearTargets(protection.board.bombTargets({row:0,col:4}));assert.equal(blasted.removed.length,1);
    assert.equal(protection.board.bubbles.length,1);assert.equal(protection.board.removableBubbles.length,0);
    protection.board.reset([b(0,4),b(1,4,'yellow'),{...stone,row:2,col:4},b(3,4)]);
    const disconnected=protection.board.clearTargets([{row:1,col:4}]);
    assert.equal(disconnected.removed.length,1);assert.equal(disconnected.dropped.length,2);
    assert(disconnected.dropped.some(b=>b.solidKind==='ocean'),'ocean stones must fall when ceiling connection breaks');
    const onlyLegacy={...old,bubbles:[b(2,4,'purple','seaweed')]};assert(legacy.restore(onlyLegacy));
    assert.equal(legacy.stage,'boss-entry');assert.equal(legacy.remainingRows,0);roundtrip(legacy);
    console.log('Ocean round: permanent anchors, third-shot conversions, neutral matching, victory priority, region continuation, revive persistence, v9 roundtrip/legacy migration and atomic corrupt-save rejection passed.');
} finally { fs.rmSync(out, { recursive:true, force:true }); }
