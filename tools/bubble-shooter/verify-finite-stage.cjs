const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-finite-'));
try{
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--target','es2020','--module','commonjs','--outDir',out,'--skipLibCheck']);
 const {BubbleShooterRound}=require(path.join(out,'BubbleShooterRound.js'));
 const {BubbleShooterModel,ROW_HEIGHT}=require(path.join(out,'BubbleShooterModel.js'));
 const b=(row,col,color='red')=>({row,col,color,frosted:false});
 const r=new BubbleShooterRound(()=>.3);r.reset();assert.equal(r.remainingRows,2);
 const initial=r.snapshot(),copy=new BubbleShooterRound(()=>.8);assert(copy.restore(initial));assert.deepEqual(copy.snapshot(),initial);
 for(let i=0;i<2;i++){
  const phase=r.board.rowPhase;r.board.reset([b(0,4),b(0,5)],phase);r.current='red';
  const result=r.settle({row:0,col:3});assert(result.refilled&&result.inserted&&!result.enteredBoss);assert.equal(r.remainingRows,1-i);
  assert.deepEqual(r.board.bubbles.map(b=>b.color),initial.futureRows[i]);
  const saved=r.snapshot();assert(copy.restore(saved));assert.deepEqual(copy.snapshot(),saved);
 }
 r.board.reset([b(0,4),b(0,5)],r.board.rowPhase);r.current='red';assert(r.settle({row:0,col:3}).enteredBoss);assert(copy.restore(r.snapshot()));
 const pressure=new BubbleShooterRound(()=>.2);assert(pressure.restore({...initial,futureRows:[],bubbles:[b(0,4),b(1,4,'blue')]}));
 pressure.accumulatedMisses=2;pressure.current='yellow';const before=pressure.board.position(b(0,4));
 const step=pressure.settle({row:2,col:4});assert(step.descended&&!step.inserted);assert.equal(pressure.board.bubbles.length,3);assert.equal(pressure.board.ceilingRow,1);
 assert(Math.abs(pressure.board.position(b(1,4)).y-(before.y-ROW_HEIGHT))<1e-8);
 assert(copy.restore(pressure.snapshot()));assert.deepEqual(copy.snapshot(),pressure.snapshot());
 const removed=pressure.board.clearTargets(pressure.board.bubbles.filter(b=>b.row>1));assert.equal(removed.dropped.length,0);assert.equal(pressure.board.bubbles.length,1,'shifted ceiling still supports top bubbles');
 for(let angle=-70;angle<=70;angle+=5){const a=angle*Math.PI/180,shot=pressure.board.trace({x:Math.sin(a),y:Math.cos(a)});if(shot)assert(shot.cell.row>=1);}
 const stable=copy.snapshot();assert(!copy.restore({...initial,ceilingRow:1}));assert(!copy.restore({...initial,futureRows:[['invalid']]}));assert.deepEqual(copy.snapshot(),stable);
 const {cloudDifficulty}=require(path.join(out,'BubbleShooterDifficulty.js'));
 assert.deepEqual([0,2,4,6,100].map(n=>cloudDifficulty(n).futureRows),[2,3,4,5,5]);
 const advanced={...initial,futureRows:[],stage:'victory',ended:true,bossHealth:0,completedRegions:5,bubbles:[]};assert(copy.restore(advanced));assert(copy.claimReward('bomb'));assert(copy.continueCloud());assert.equal(copy.remainingRows,5);
 const highSave=copy.snapshot(),highCopy=new BubbleShooterRound();assert(highCopy.restore(highSave));assert.deepEqual(highCopy.snapshot(),highSave);
 const old={...initial,version:6};delete old.futureRows;delete old.ceilingRow;assert(copy.restore(old));assert.equal(copy.remainingRows,0,'old save does not receive extra level content');
 console.log('Finite stage: preplanned rows, early-clear reveal, final-clear Boss entry, descent without added bubbles, moving ceiling support/aim and v7 save continuity passed.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
