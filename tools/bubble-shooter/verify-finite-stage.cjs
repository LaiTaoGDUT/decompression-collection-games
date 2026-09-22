const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-finite-'));
try{
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--target','es2020','--module','commonjs','--outDir',out,'--skipLibCheck']);
 const {BubbleShooterRound}=require(path.join(out,'BubbleShooterRound.js'));
 const {BubbleShooterModel,ROW_HEIGHT,COLUMNS}=require(path.join(out,'BubbleShooterModel.js'));
 const b=(row,col,color='red')=>({row,col,color,frosted:false});
 const r=new BubbleShooterRound(()=>.3);r.reset();assert.equal(r.remainingRows,2);
 const initial=r.snapshot(),copy=new BubbleShooterRound(()=>.8);assert(copy.restore(initial));assert.deepEqual(copy.snapshot(),initial);
 r.board.reset([b(0,4),b(0,5)]);r.current='red';
 const early=r.settle({row:0,col:3});
 assert(early.enteredBoss&&!early.refilled&&!early.inserted);assert.equal(r.remainingRows,0);
 assert.equal(r.board.removableBubbles.length,0);assert(copy.restore(r.snapshot()));assert.deepEqual(copy.snapshot(),r.snapshot());
 // Other clear paths must also discard unspawned rows and produce a restorable entry save.
 for(const region of ['cloud','ocean']){
  const item=new BubbleShooterRound(()=>.3);item.reset(region);item.board.reset([b(0,4),b(1,4)]);
  assert(item.clearBottom().enteredBoss);assert.equal(item.remainingRows,0);assert(copy.restore(item.snapshot(),[region]));
  const revive=new BubbleShooterRound(()=>.3);revive.reset(region);revive.board.reset([b(13,4),b(14,4)]);revive.ended=true;
  assert(revive.revive());assert.equal(revive.stage,'boss-entry');assert.equal(revive.remainingRows,0);assert(copy.restore(revive.snapshot(),[region]));
 }
 // Empty board at shallow aim needs several reflections; all remain on legal walls and move upwards.
 const empty=new BubbleShooterModel();empty.reset([]);
 for(const sign of [-1,1]){
  const angle=sign*70*Math.PI/180, shot=empty.trace({x:Math.sin(angle),y:Math.cos(angle)});
  assert(shot && shot.points.length>=5,'at least three rebounds remain aimable');
  for(let i=1;i<shot.points.length-2;i++){
   const point=shot.points[i];assert(Math.abs(Math.abs(point.x)-(720-720/COLUMNS)/2)<1e-6);
   assert(point.y>shot.points[i-1].y,'path advances toward ceiling');
  }
  assert.equal(shot.cell.row,0);
 }
 const pressure=new BubbleShooterRound(()=>.2);assert(pressure.restore({...initial,futureRows:[],bubbles:[b(0,4),b(1,4,'blue')]}));
 pressure.accumulatedMisses=2;pressure.current='yellow';const before=pressure.board.position(b(0,4));
 const step=pressure.settle({row:2,col:4});assert(step.descended&&!step.inserted);assert.equal(pressure.board.removableBubbles.length,3);assert.equal(pressure.board.bubbles.filter(b=>b.indestructible).length,COLUMNS-pressure.board.rowPhase);assert.equal(pressure.board.ceilingRow,0);
 assert(Math.abs(pressure.board.position(b(1,4)).y-(before.y-ROW_HEIGHT))<1e-8);
 assert(copy.restore(pressure.snapshot()));assert.deepEqual(copy.snapshot(),pressure.snapshot());
 const removed=pressure.board.clearTargets(pressure.board.bubbles.filter(b=>b.row>1));assert.equal(removed.dropped.length,0);assert.equal(pressure.board.removableBubbles.length,1,'solid top row supports remaining colored bubbles');
 for(let angle=-70;angle<=70;angle+=5){const a=angle*Math.PI/180,shot=pressure.board.trace({x:Math.sin(a),y:Math.cos(a)});if(shot)assert(shot.cell.row>=1);}
 const stable=copy.snapshot();assert(!copy.restore({...initial,ceilingRow:1}));assert(!copy.restore({...initial,futureRows:[['invalid']]}));assert.deepEqual(copy.snapshot(),stable);
 const {cloudDifficulty}=require(path.join(out,'BubbleShooterDifficulty.js'));
 assert.deepEqual([0,2,4,6,100].map(n=>cloudDifficulty(n).futureRows),[2,3,4,5,5]);
 const advanced={...initial,futureRows:[],stage:'victory',ended:true,bossHealth:0,completedRegions:5,bubbles:[]};assert(copy.restore(advanced));assert(copy.claimReward('bomb'));assert(copy.continueCloud());assert.equal(copy.remainingRows,5);
 const highSave=copy.snapshot(),highCopy=new BubbleShooterRound();assert(highCopy.restore(highSave));assert.deepEqual(highCopy.snapshot(),highSave);
 const old={...initial,version:6};delete old.futureRows;delete old.ceilingRow;assert(copy.restore(old));assert.equal(copy.remainingRows,0,'old save does not receive extra level content');
 console.log('Finite stage: preplanned rows, immediate clear victory, item/revive queue discard, multi-wall trace, solid support insertion/aim and v8 save continuity passed.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
