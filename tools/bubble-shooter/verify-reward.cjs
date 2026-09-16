const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-boss-'));
try{
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--module','commonjs','--target','es2020','--outDir',out,'--skipLibCheck'],{cwd:path.resolve(__dirname,'../..')});
 const {BubbleShooterRound,BOSS_TUNING}=require(path.join(out,'BubbleShooterRound.js'));
 const r=new BubbleShooterRound(()=>.2);r.reset();
 assert.equal(r.claimReward('bomb'),false);assert.equal(r.continueCloud(),false);
 r.stage='victory';r.ended=true;r.inventory.bomb=3;r.inventory.wildcard=2;
 const queue=[r.current,r.next];r.cleared=123;
 assert.equal(r.claimReward('bomb'),false);assert.equal(r.claimReward(),false);
 assert.equal(r.inventory.wildcard,2);assert(r.claimReward('wildcard'));
 assert.equal(r.inventory.wildcard,3);assert.equal(r.claimReward('wildcard'),false);
 assert(r.continueCloud());assert.equal(r.continueCloud(),false);
 assert.equal(r.stage,'ordinary');assert.equal(r.completedRegions,1);
 assert.equal(r.board.bubbles.length,145);assert.equal(r.cleared,123);assert.deepEqual([r.current,r.next],queue);
 assert.equal(r.inventory.bomb,3);assert.equal(r.inventory.wildcard,3);assert.equal(r.ended,false);
 r.stage='victory';r.ended=true;r.inventory['clear-bottom']=3;
 assert(r.inventoryFull);assert(r.claimReward());assert.equal(r.claimReward(),false);assert(r.continueCloud());
 assert.equal(r.completedRegions,2);assert.equal(r.inventory['clear-bottom'],3);
 r.reset();assert.equal(r.completedRegions,0);assert.equal(r.inventory.bomb,1);assert.equal(r.rewardAvailable,false);
 console.log('Reward passed: victory gate, selection purity, cap, all-full skip, exactly-once grant, continuation preservation, reset');
}finally{fs.rmSync(out,{recursive:true,force:true});}
