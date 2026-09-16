const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const frames=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-feedback-'));
 const artifacts=createVerificationArtifactDir('bubble-shooter-feedback-');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:750,height:1384},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle'});await page.waitForTimeout(4000);
 console.log(await page.evaluate(async()=>{
  const cc=await System.import('cc'),app=cc.js.getClassByName('App').current,services=Array.from(app.services.services.values());
  const r=services.find(s=>typeof s.enterGame==='function');await r.enterGame(services.find(s=>typeof s.getById==='function').getById('bubble-shooter'));
  const e=r.entry;await e.restart();await new Promise(r=>setTimeout(r,1000));window.testEntry=e;window.runtime=r;
  const canvas=document.getElementById('GameCanvas');for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height='1334px';n.style.maxWidth='none';n.style.maxHeight='none';}
  cc.view.setFrameSize(750,1334);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
  e.context.services.platform.getLayoutInfo=()=>({safeArea:{left:0,right:750,top:44,bottom:1286,width:750,height:1242},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});e.applyLayout();
  const b=(row,col,color='blue')=>({row,col,color,frosted:false});
  const cells=[b(0,6,'red'),b(0,7,'red'),b(0,14,'purple')];
  for(let row=1;row<=6;row++)for(let col=5;col<=8;col++)cells.push(b(row,col,['blue','yellow','purple'][(row+col)%3]));
  e.round.board.reset(cells);e.round.current='red';e.syncBoard();e.syncSupply();
  e.presentResult(e.round.settle({row:0,col:5}));window.committed=JSON.stringify(e.round.snapshot());
  if(e.effects.filter(x=>x.falling).length<20)throw Error('drop fixture incomplete');
  e.state='paused';return {drops:e.effects.filter(x=>x.falling).length,pops:e.effects.filter(x=>!x.falling).length};
 }));
 const screenshot=async name=>page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,name+'.png')});
 for(let i=0;i<90;i++) {
  await page.evaluate(i=>{
   const e=window.testEntry;e.state='playing';e.update(1/30);
   if(i===5&&e.particles.count===0)throw Error('burst fragments not visible');
   if(i===18&&!e.canInteract())throw Error('decorative drops block next shot');
   if(JSON.stringify(e.round.snapshot())!==window.committed)throw Error('animation mutated round');
   e.state='paused';
  },i);
  await page.waitForTimeout(20);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(i).padStart(3,'0')}.png`)});
  if(i===4)await screenshot('feedback-pop-peak');if(i===20)await screenshot('feedback-natural-fall');if(i===38)await screenshot('feedback-threshold-fade');
 }
 console.log(await page.evaluate(()=>{
  const e=window.testEntry;if(e.effects.length||e.particles.count)throw Error('effect cleanup');
  return 'Elastic pop, varied full fall, threshold fade, input continuity and cleanup passed';
 }));
 for(let i=0;i<60;i++) {
  await page.evaluate(async i=>{
   const cc=await System.import('cc'),e=window.testEntry,play=e.node.getChildByName('Playfield'),ui=play.getComponent(cc.UITransform);
   const connector=play.getChildByPath('Launcher/FixedConnector'),pedestal=play.getChildByPath('Launcher/Pedestal');
   const before=connector.worldPosition.clone();const a=Math.sin(i/59*Math.PI*2)*65*Math.PI/180;
   const p=ui.convertToWorldSpaceAR(new cc.Vec3(Math.sin(a)*600,-404+Math.cos(a)*600));
   e.state='playing';e.activeTouch=91;e.aim({getID:()=>91,getUILocation:()=>p});
   if(!connector.worldPosition.equals(before)||connector.angle!==0||pedestal.angle!==0)throw Error('fixed base rotated');
   const pivot=play.getChildByPath('Launcher/TurretPivot');
   if(pivot.getChildByName('CurrentBall').angle!==0)throw Error('loaded ball must rotate with cannon');
   if(pivot.getChildByName('CurrentBall').position.length()>.001)throw Error('loaded ball must stay at rotation center');const center=ui.convertToNodeSpaceAR(pivot.worldPosition);
   if(Math.abs(center.y+404)>.01||Math.abs(center.x)>.01)throw Error('loaded-ball center pivot');
   if(e.pendingShot){const ball=ui.convertToNodeSpaceAR(pivot.getChildByName('CurrentBall').worldPosition),start=e.pendingShot.points[0];
    if(Math.hypot(ball.x-start.x,ball.y-start.y)>.01)throw Error('visual muzzle / trace mismatch');}
   e.state='paused';
  },i);
  await page.waitForTimeout(20);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(90+i).padStart(3,'0')}.png`)});
  if(i===15)await screenshot('launcher-ball-center-left');if(i===45)await screenshot('launcher-ball-center-right');
 }
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 await browser.close();if(errors.length)throw Error(errors.join('\n'));
 const video=path.join(artifacts.dir,'feedback-and-ball-center-review.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
 fs.rmSync(frames,{recursive:true,force:true});console.log('Fixed base, ball center pivot, muzzle alignment, pageErrors=[]; disposable video removed.');artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
