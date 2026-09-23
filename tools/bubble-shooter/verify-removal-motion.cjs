const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');const out=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-motion-'));
try {
 execFileSync('tsc',['assets/games/bubble-shooter/scripts/BubbleShooterRemovalMotion.ts','--module','commonjs','--target','es2020','--outDir',out,'--skipLibCheck']);
 const {removalMotion,sampleRemoval,FALL_FADE_Y}=require(path.join(out,'BubbleShooterRemovalMotion.js'));
 const motions=[];
 for(let i=0;i<12;i++) {
  const m=removalMotion({row:4,col:i},{x:i*48-264,y:244},true,i);motions.push(m);
  assert.equal(m.delay,0,'unsupported bubbles fall immediately');
  assert(sampleRemoval(m,.016).y<m.y,'fall starts in first frame');
  assert.equal(sampleRemoval(m,m.delay+m.fadeAt-.001).opacity,255,'no early fading');
  const atLine=sampleRemoval(m,m.delay+m.fadeAt);assert(Math.abs(atLine.y-FALL_FADE_Y)<1e-6);
  const fade=sampleRemoval(m,m.delay+m.fadeAt+m.fadeDuration/2);assert(fade.opacity>100&&fade.opacity<160);
  const step=.01,t=m.delay+m.fadeAt;
  const before=sampleRemoval(m,t-step).y-atLine.y;
  const after=atLine.y-sampleRemoval(m,t+step).y;
  assert(after>before,'gravity continues accelerating across fade threshold');
  assert(!fade.done);assert(sampleRemoval(m,m.delay+m.fadeAt+m.fadeDuration+.001).done);
  assert(m.fadeDuration>=.46);assert(m.fadeAt>.7);assert.equal(sampleRemoval(m,0).y,m.y);
 }
 assert(new Set(motions.map(m=>sampleRemoval(m,.6).y.toFixed(2))).size>=10,'same-row falls separate naturally');
 const pop=removalMotion({row:0,col:0},{x:0,y:410},false,0);
 assert.equal(sampleRemoval(pop,.08).opacity,255,'readable body until burst');
 assert(sampleRemoval(pop,.065).sx>1&&sampleRemoval(pop,.065).sy<1,'squash before release');
 assert(sampleRemoval(pop,.13).sx>1.1,'short expansion peak');assert(sampleRemoval(pop,.3).done);
 const high=removalMotion({row:0,col:0},{x:0,y:410},true,0),low=removalMotion({row:10,col:0},{x:0,y:-220},true,0);
 assert(high.fadeAt>low.fadeAt,'fade is threshold-based, not fixed lifespan');
 console.log('Motion: readable elastic pop, immediate fall, varied gravity/drift, threshold-only fade, slow fade and bounded lifetime passed.');
} finally {fs.rmSync(out,{recursive:true,force:true});}
