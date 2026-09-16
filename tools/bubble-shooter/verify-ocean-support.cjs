const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-ocean-support-'));
try {
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterModel.ts','--target','es2020','--module','commonjs','--outDir',out,'--skipLibCheck']);
 const {BubbleShooterModel}=require(path.join(out,'BubbleShooterModel.js'));
 const b=(row,col,color='blue',support)=>({row,col,color,frosted:false,...(support?{support}:{})});
 // Two independently supported groups: cutting a ceiling connection only drops the unanchored group.
 let m=new BubbleShooterModel([b(0,0),b(1,0),b(2,0,'red','seaweed'),b(3,0),b(0,10),b(1,10),b(2,10)]);
 let r=m.clearTargets([{row:0,col:0},{row:0,col:10}]);
 assert.equal(r.dropped.length,2);assert(m.bubbles.some(b=>b.support==='seaweed'));assert(m.bubbles.some(b=>b.row===3));
 r=m.clearTargets([{row:2,col:0}]);assert.equal(r.removed.length,1);assert.equal(r.dropped.length,2,'removing the root releases its entire disconnected group');
 // Anchors participate in ordinary matching and are removed by the same shot.
 m=new BubbleShooterModel([b(0,4,'red','seaweed'),b(0,5,'red'),b(1,4,'blue')]);
 r=m.settle({row:0,col:3},'red');assert.equal(r.removed.length,3);assert.equal(r.dropped.length,1);
 // Surviving tentacle root keeps a disconnected cluster after the other root is released.
 m=new BubbleShooterModel([b(3,4,'blue','tentacle'),b(3,5),b(3,6,'blue','seaweed')]);
 assert.equal(m.releaseSupport([{row:3,col:4}]).length,0);
 assert.equal(m.releaseSupport([{row:3,col:6}]).length,3);
 // Support follows the bubble through parity-changing row insertion and is not transferred into vacated cells.
 m=new BubbleShooterModel([b(0,4),b(1,4),b(2,4,'yellow','tentacle')]);m.insertRow(()=>.1);
 assert(m.bubbles.some(b=>b.row===3&&b.col===4&&b.support==='tentacle'));
 m.clearTargets([{row:3,col:4}]);m.settle({row:3,col:4},'purple');assert(!m.bubbles.find(b=>b.row===3&&b.col===4).support);
 // Idempotent, bounded target selection with empty and frozen cells filtered out.
 m=new BubbleShooterModel([b(0,0),b(0,1),{...b(0,2),frosted:true},b(0,3)]);
 assert.equal(m.applySupport([{row:0,col:0},{row:0,col:0},{row:0,col:2},{row:0,col:8},{row:0,col:1},{row:0,col:3}],'tentacle',2).length,2);
 assert.equal(m.applySupport([{row:0,col:3}],'tentacle',2).length,0);
 const copy=new BubbleShooterModel(m.bubbles);assert.deepEqual(copy.bubbles,m.bubbles);m.reset([b(0,0)]);assert(!m.bubbles[0].support);
 assert.throws(()=>new BubbleShooterModel([{...b(0,0),support:'invalid'}]));
 console.log('Ocean support: matching roots, multiple support sources, severed groups, direct removal, parity insertion, caps, frozen filtering and copied/reset state passed.');
} finally {fs.rmSync(out,{recursive:true,force:true});}
