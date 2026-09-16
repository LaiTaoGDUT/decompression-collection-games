const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-model-'));
try {
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterModel.ts','--module','commonjs','--target','es2020','--outDir',out,'--skipLibCheck'],{cwd:root});
 const {BubbleShooterModel,neighbors,position,DIAMETER,COLUMNS,MAX_ROW,WALL,BOARD_WIDTH}=require(path.join(out,'BubbleShooterModel.js'));
 const b=(row,col,color='red',frosted=false)=>({row,col,color,frosted});
 for(let row=0;row<=MAX_ROW;row++)for(let col=0;col<COLUMNS-row%2;col++)for(const n of neighbors({row,col})){
  assert(neighbors(n).some(p=>p.row===row&&p.col===col));
  assert(Math.abs(Math.hypot(position(n).x-position({row,col}).x,position(n).y-position({row,col}).y)-DIAMETER)<1e-8);
 }
 for(const scale of [1,.964,.663]) for(const side of [-1,1]) {
  const ray=new BubbleShooterModel([]).trace({x:side*.75,y:1});
  assert(ray&&ray.points.length>=3,'reflected shot exists');
  const edge=position({row:0,col:side<0?0:COLUMNS-1}).x+side*DIAMETER/2;
  assert(Math.abs((ray.points[1].x+side*DIAMETER/2-edge)*scale)<1e-6,'projectile outer edge equals rendered board edge');
  assert.equal(Math.abs(edge),BOARD_WIDTH/2);
 }
 let model=new BubbleShooterModel([b(0,4),b(0,5),b(1,4,'blue')]);
 let result=model.settle({row:0,col:3},'red');
 assert.equal(result.removed.length,3); assert.equal(result.dropped.length,1);assert.equal(model.bubbles.length,0);
 model=new BubbleShooterModel([b(0,4),b(0,5,'blue'),b(1,4,'red',true)]);
 result=model.settle({row:0,col:3},'red');assert.equal(result.removed.length,0);assert.equal(model.bubbles.length,4);
 model=new BubbleShooterModel([b(0,4),b(0,5),b(1,4,'red',true),b(0,6,'blue')]);
 result=model.settle({row:0,col:3},'red');assert.equal(result.removed.length,3);assert.equal(result.thawed.length,1);
 assert.equal(result.dropped.length,1,'Thawed bubble does not auto-match but may lose support.');
 assert.throws(()=>model.settle({row:0,col:6},'blue'));
 const thaw=new BubbleShooterModel([b(0,1),b(0,2),b(0,3,'blue'),b(1,2,'red',true),b(1,3),b(2,3)]);
 const thawResult=thaw.settle({row:0,col:0},'red');
 assert.equal(thawResult.thawed.length,1);
 assert.equal(thawResult.removed.length,3,'Newly thawed red cluster must not auto-chain.');
 assert.equal(thaw.bubbles.length,4);

 assert.throws(()=>model.settle({row:7,col:2},'blue'));
 model=new BubbleShooterModel();
 let shot=model.trace({x:0,y:1});assert(shot);assert.equal(shot.cell.row,0);
 shot=model.trace({x:.5,y:1});assert(shot);assert(shot.points.some(p=>Math.abs(p.x-WALL)<1e-6));
 assert.equal(model.trace({x:0,y:-1}),undefined);
 assert.equal(model.trace({x:10,y:1}),undefined,'Two-bounce paths are rejected by this prototype.');
 const fixture=[];for(let r=0;r<6;r++)for(let c=0;c<COLUMNS-r%2;c++)fixture.push(b(r,c,['red','yellow','blue','purple'][(Math.floor(c/2)+Math.floor(r/2))%4]));
 model=new BubbleShooterModel(fixture);
 let valid=0;
 for(let degree=-60;degree<=60;degree++){
  shot=model.trace({x:Math.sin(degree*Math.PI/180),y:Math.cos(degree*Math.PI/180)});
  if(!shot)continue;
  valid++;
  assert(!fixture.some(b=>b.row===shot.cell.row&&b.col===shot.cell.col));
  assert.deepEqual(shot.points.at(-1),position(shot.cell));
  new BubbleShooterModel(fixture).settle(shot.cell,'red');
 }
 assert(valid>80,`Expected broad usable aiming range; got ${valid}`);
 assert.equal(new BubbleShooterModel([b(0,0,'purple')]).supply(()=>0),'purple');
 console.log(`Model passed: hex symmetry, matching, frost, support/drop, invalid placement, ceiling/wall trace, ${valid} usable angles, supply.`);
}finally{fs.rmSync(out,{recursive:true,force:true});}
