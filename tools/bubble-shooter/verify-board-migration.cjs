const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-grid-save-'));
try{
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRound.ts','--target','es2020','--module','commonjs','--outDir',out,'--skipLibCheck']);
 const {BubbleShooterRound}=require(path.join(out,'BubbleShooterRound.js'));
 const {COLUMNS,DIAMETER,BOARD_WIDTH,DANGER,TOP}=require(path.join(out,'BubbleShooterModel.js'));
 assert.equal(COLUMNS,13);assert.equal(BOARD_WIDTH,720);assert.equal(DIAMETER,720/13);assert.equal(TOP,410);assert(DANGER>-330);
 const r=new BubbleShooterRound(()=>.2);r.reset();const base=r.snapshot();
 const balls=[];for(let row=0;row<10;row++)for(let col=0;col<15-row%2;col++)balls.push({row,col,color:['red','blue','yellow','purple'][(row+col)%4],frosted:row===4&&col===14});
 for(const version of [3,4]){
  const old={...base,version,region:version===4?'ocean':undefined,bubbles:balls.map(b=>({...b,frosted:version===3?b.frosted:false})),regionProgress:37,inventory:{bomb:2,wildcard:0,'clear-bottom':3},reviveUsed:true};
  if(version===4)old.bubbles[60].support='seaweed';
  assert(r.restore(old));assert.equal(r.snapshot().version,9);assert.equal(r.board.bubbles.length,145);assert(!r.board.danger);
  assert.deepEqual(r.inventory,old.inventory);assert.equal(r.regionProgress,37);assert(r.snapshot().reviveUsed);
  for(const color of ['red','blue','yellow','purple'])assert.equal(r.board.removableBubbles.filter(b=>b.color===color).length,old.bubbles.filter(b=>b.color===color&&!b.support).length);
  assert.equal(r.board.bubbles.filter(b=>b.solidKind).length,version===4?1:0);
  const save=r.snapshot();const copy=new BubbleShooterRound();assert(copy.restore(save));assert.deepEqual(copy.snapshot(),save);
  assert(!r.restore({...old,bubbles:[old.bubbles[0],old.bubbles[0]]}));assert.deepEqual(r.snapshot(),save);
 }
 const v5balls=[];for(let row=0;row<16;row++)for(let col=0;col<14-row%2;col++)v5balls.push({row,col,color:'yellow',frosted:row===3&&col===4});
 const previous={...base,version:5,bubbles:v5balls,migrationReserve:[{row:17,col:12,color:'purple',frosted:false}]};
 assert(r.restore(previous));const migrated14=r.snapshot();assert.equal(migrated14.bubbles.length+migrated14.migrationReserve.length,v5balls.length+1);assert(!r.board.danger);
 const restored14=new BubbleShooterRound();assert(restored14.restore(migrated14));assert.deepEqual(restored14.snapshot(),migrated14);
 const dense=[];for(let row=0;row<18;row++)for(let col=0;col<15-row%2;col++)dense.push({row,col,color:'blue',frosted:false});
 assert(r.restore({...base,version:3,region:undefined,bubbles:dense}));
 const denseSave=r.snapshot();assert(denseSave.migrationReserve.length>0);assert(!r.board.danger);
 assert.equal(r.board.bubbles.length+denseSave.migrationReserve.length,dense.length);
 const copy=new BubbleShooterRound();assert(copy.restore(denseSave));assert.deepEqual(copy.snapshot(),denseSave);
 const queued=copy.snapshot().migrationReserve.length;
 copy.board.reset([{row:0,col:0,color:'red',frosted:false}]);copy.accumulatedMisses=2;copy.current='purple';copy.settle({row:0,col:1});
 assert(copy.snapshot().migrationReserve.length<queued,'overflow resumes in future pressure rows');
 console.log('15/14-to-13 column migration preserves every bubble, color, support, inventory, progress, revive state; v6 roundtrip and malformed-save rejection passed.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
