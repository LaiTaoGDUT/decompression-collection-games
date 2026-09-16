const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-boss-'));
try{
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--module','commonjs','--target','es2020','--outDir',out,'--skipLibCheck'],{cwd:path.resolve(__dirname,'../..')});
 const {BubbleShooterRound,BOSS_TUNING}=require(path.join(out,'BubbleShooterRound.js'));
 const b=(row,col,color='red',frosted=false)=>({row,col,color,frosted});
 const r=new BubbleShooterRound(()=>.2);r.reset();
 r.regionProgress=BOSS_TUNING.progressRequired-3;r.accumulatedMisses=2;
 r.board.reset([b(0,4),b(0,5),b(0,9,'blue')]);r.current='red';r.next='purple';
 let result=r.settle({row:0,col:3});
 assert(result.enteredBoss&&!result.inserted&&!result.refilled&&!result.danger);
 assert.equal(r.stage,'boss-entry');assert.equal(r.board.bubbles.length,1,'Keep settled ordinary board until effects finish.');
 assert.throws(()=>r.settle({row:0,col:8}));
 const queue=[r.current,r.next], stock={...r.inventory}, clear=r.cleared;
 r.beginBoss();assert.equal(r.board.bubbles.length,135);assert.equal(r.bossHealth,BOSS_TUNING.health);
 assert.deepEqual([r.current,r.next],queue);assert.deepEqual(r.inventory,stock);assert.equal(r.cleared,clear);
 assert.throws(()=>r.beginBoss());
 r.board.reset([b(0,4),b(0,5),b(0,9,'blue')]);r.current='red';result=r.settle({row:0,col:3});
 assert.equal(result.damage,3);assert.equal(r.bossShots,1);assert.equal(r.bossHealth,BOSS_TUNING.health-3);
 r.current='yellow';r.settle({row:0,col:8});assert.equal(r.bossShots,2);assert(r.frostTargets.length>0);
 const targets=r.frostTargets.map(c=>({...c}));
 r.current='purple';result=r.settle({row:0,col:7});assert(result.inserted);assert.equal(r.bossShots,0);
 for(const old of targets)assert(result.frosted.some(b=>b.row===old.row+1&&b.col===old.col));
 assert.equal(result.damage,0);
 // Clear-bottom damages but cannot advance or reset the common shot counter.
 r.bossShots=2;const hp=r.bossHealth;r.clearBottom();assert.equal(r.bossShots,2);assert(r.bossHealth<hp);
 // A lethal match on the action shot suppresses row insertion, frost and danger.
 r.reset();r.stage='boss';r.bossHealth=3;r.bossShots=2;
 r.board.reset([b(0,4),b(0,5),b(0,9,'blue'),b(10,4,'yellow')]);r.current='red';
 result=r.settle({row:0,col:3});assert(result.victory&&!result.inserted&&!result.danger);assert.equal(result.frosted.length,0);
 assert.equal(r.bossHealth,0);assert.equal(r.stage,'victory');assert(r.ended);
 // Removed premarked targets never redirect frost onto a different survivor.
 r.reset();r.stage='boss';r.bossShots=2;r.frostTargets=[{row:0,col:4}];
 r.board.reset([b(0,4),b(0,5),b(0,9,'blue')]);r.current='red';result=r.settle({row:0,col:3});
 assert(result.inserted);assert.equal(result.frosted.length,0);
 // Clearing announced cells before the next shot must also discard their identity.
 r.reset();r.stage='boss';r.bossShots=2;r.frostTargets=[{row:0,col:4}];
 r.board.reset([b(0,4),b(0,5)]);r.clearBottom();
 assert.equal(r.frostTargets.length,0,'Refilled cells must not inherit a cleared target.');
 r.reset();r.stage='boss';r.board.reset([b(0,4,'red',true)]);r.current='blue';
 result=r.settle({row:0,col:3});assert.equal(result.damage,0);assert.equal(r.bossHealth,BOSS_TUNING.health);
 r.reset();assert.equal(r.stage,'ordinary');assert.equal(r.regionProgress,0);assert.equal(r.bossShots,0);assert.equal(r.frostTargets.length,0);
 console.log('Boss passed: progress priority/deferred entry, dedicated board, queue/stock preservation, damage, shot counter, frost targets, clear-bottom, lethal priority, reset.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
