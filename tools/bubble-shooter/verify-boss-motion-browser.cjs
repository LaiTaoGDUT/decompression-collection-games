const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const frames=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-feedback-'));
 const artifacts=createVerificationArtifactDir('bubble-shooter-boss-motion-');
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
  e.round.stage='boss-entry';e.round.regionProgress=e.round.difficulty.progressRequired;
  e.state='playing';e.update(.01);e.update(.01);e.state='paused';
  return 'Boss animation fixture ready';
 }));
 let idlePose;
 for(let i=0;i<180;i++) {
  const pose=await page.evaluate(i=>{
   const e=window.testEntry;
   if(i===85) {
    e.round.bossShots=2;e.round.frostTargets=e.model.bubbles.filter(b=>!b.frosted).slice(0,2).map(b=>({row:b.row,col:b.col}));
    const shot=e.model.trace({x:0,y:1});if(!shot)throw Error('skill shot missing');
    const result=e.round.settle(shot.cell);e.presentResult(result);
    if(e.bossCast===0)throw Error('actual skill did not animate');
   }
   if(i===135) {
    e.clearAttack();e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;
    e.healthVisible=0;e.healthTarget=0;e.syncBoss();
   }
   e.state='playing';e.update(1/30);
   if((i===20||i===90)&&e.canInteract())throw Error('animation should lock firing');
   e.state='paused';
   const root=e.bossRoot,body=root.getChildByName('Body');
   const frozen=JSON.stringify([root.position,body.scale,e.bossClock,e.bossCast]);
   e.update(.2);if(frozen!==JSON.stringify([root.position,body.scale,e.bossClock,e.bossCast]))throw Error('paused animation advanced');
   if(i===20&&e.canInteract())throw Error('entry should lock firing');
   if(i===90&&e.canInteract())throw Error('cast should lock firing');
   if(i===160&&e.rewardView.visible)throw Error('reward interrupted exit');
   return {y:root.position.y,sx:body.scale.x,cast:e.bossCast,reward:e.rewardView.visible};
  },i);
  if(i===45)idlePose=pose;if(i===65&&Math.abs(idlePose.sx-pose.sx)<.001)throw Error('idle body static');
  await page.waitForTimeout(10);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(i).padStart(3,'0')}.png`)});
  if([15,65,98,153].includes(i))await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,`boss-motion-${i}.png`)});
 }
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 await browser.close();if(errors.length)throw Error(errors.join('\n'));
 const video=path.join(artifacts.dir,'boss-motion-review.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
 fs.rmSync(frames,{recursive:true,force:true});console.log('Entry, idle, actual skill trigger, defeat, pause freeze and input locks passed; disposable video removed.');artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
