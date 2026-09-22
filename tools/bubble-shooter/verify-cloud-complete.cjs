const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-cloud-'));
try {
    execFileSync('tsc', ['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts', '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck']);
    const {BubbleShooterRound} = require(path.join(out, 'BubbleShooterRound.js'));
    const {cloudDifficulty} = require(path.join(out, 'BubbleShooterDifficulty.js'));
    let seed = 71; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const layouts = new Set();
    for (let level = 0; level < 16; level++) {
        const r = new BubbleShooterRound(random); r.reset(); r.completedRegions = level;
        r.stage = 'victory'; r.ended = true; r.bossHealth = 0;
        assert(r.claimReward('bomb')); assert(r.continueCloud());
        assert(!r.board.danger); assert.equal(r.board.bubbles.length, 125);
        const frost = r.board.bubbles.filter(b => b.frosted);
        assert(frost.length >= 2 && frost.length <= 8);
        assert(frost.every(b => b.row >= 2));
        assert.equal(new Set(r.board.bubbles.map(b => b.color)).size, 4);
        assert(Array.from({length:29}, (_,i) => (-70 + 5*i) * Math.PI / 180).some(a => {
            const shot = r.board.trace({x:Math.sin(a),y:Math.cos(a)});
            return shot && ['red','blue','yellow','purple'].some(c => r.board.matchingCount(shot.cell,c) >= 2);
        }), 'Every opening must expose a matchable pair');
        layouts.add(JSON.stringify(r.board.bubbles));
        const restored = new BubbleShooterRound();
        assert(restored.restore(JSON.parse(JSON.stringify(r.snapshot()))));
        assert.deepEqual(restored.snapshot(),r.snapshot());
        r.futureRows=[];r.stage='boss-entry';r.regionProgress=r.difficulty.progressRequired;r.beginBoss();
        assert.equal(r.board.bubbles.length,115);assert(!r.board.danger);
        r.bossHealth=17;r.bossShots=2;r.frostTargets=r.board.bubbles.filter(b=>!b.frosted).slice(0,2);
        assert(restored.restore(r.snapshot()));assert.deepEqual(restored.snapshot(),r.snapshot());
    }
    assert(layouts.size>=12);assert.deepEqual(cloudDifficulty(1000),cloudDifficulty(8));
    const r=new BubbleShooterRound(random);r.reset();const s=r.snapshot();
    const malformed=[null,{}, {...s,version:99},{...s,bubbles:[s.bubbles[0],s.bubbles[0]]},
        {...s,phase:3},{...s,bossHealth:NaN},{...s,current:'green'}, {...s,inventory:{bomb:99}},
        {...s,ended:true},{...s,stage:'victory'}, {...s,frostTargets:[{row:20,col:0}]}];
    for(const bad of malformed){assert(!r.restore(bad));assert.deepEqual(r.snapshot(),s,'Invalid save must not partially mutate state');}
    const old = { ...s, version: 1, bubbles: [{row:0,col:4,color:'red',frosted:false}, {row:1,col:4,color:'blue',frosted:false}], frostTargets: [{row:1,col:4}], regionProgress:43 };
    const migrated = new BubbleShooterRound(); assert(migrated.restore(old));
    assert.equal(migrated.snapshot().version,9); assert.equal(migrated.regionProgress,43);
    assert.deepEqual(migrated.board.bubbles,old.bubbles.map(b=>({...b,col:5})));
    assert.deepEqual(migrated.frostTargets,[{row:1,col:5}]);
    assert.deepEqual(migrated.inventory,old.inventory); assert.equal(migrated.current,old.current);
    const v2 = { ...s, version:2, ended:true, bubbles:Array.from({length:17},(_,row)=>({row,col:4,color:'red',frosted:false})), frostTargets:[] };
    assert(migrated.restore(v2)); assert(!migrated.ended); assert.equal(migrated.board.bubbles.length,17);
    const oldFailure = {...old,ended:true,reviveUsed:true,bubbles:Array.from({length:11},(_,row)=>({row,col:4,color:'red',frosted:false}))};
    assert(migrated.restore(oldFailure)); assert(!migrated.ended); assert(migrated.snapshot().reviveUsed);
    assert(!migrated.restore({...old,frostTargets:[null]}));
    r.futureRows=[];r.stage='victory';r.ended=true;r.bossHealth=0;r.board.reset([]);assert(new BubbleShooterRound().restore(r.snapshot()));
    console.log('Cloud: varied reachable layouts, bounded progression, ordinary/Boss save roundtrip, empty victory and corrupt-save atomic rejection passed.');
} finally {fs.rmSync(out,{recursive:true,force:true});}
