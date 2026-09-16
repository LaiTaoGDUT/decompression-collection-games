const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const frames=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-feedback-'));
 const artifacts=createVerificationArtifactDir('bubble-shooter-modal-motion-');
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
  e.pause();window.resumed=false;
  e.showPauseMenu({resume:async()=>{window.resumed=true;e.hidePauseMenu();e.resume();},restart:async()=>{},exit:async()=>{}});
  return 'Modal motion fixture ready';
 }));
 for(let i=0;i<140;i++) {
  await page.evaluate(async i=>{
   const cc=await System.import('cc'),e=window.testEntry;
   if(i===1) {
    e.pauseView.content.getChildByName('Primary').emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
    if(window.resumed)throw Error('opening modal accepted premature click');
   }
   if(i===20) {
    e.pauseView.content.getChildByName('Primary').emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
    if(window.resumed)throw Error('resume skipped closing animation');
   }
   if(i===35&&!window.resumed)throw Error('resume did not run after close');
   if(i===40)e.showEnd('offer');
   if(i===65)void e.endView.close().then(done=>{if(done){e.endView.hide();window.reviveClosed=true;}});
   if(i===80&&!window.reviveClosed)throw Error('revive did not close');
   if(i===90){e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.showReward();}
   e.update(1/30);

   if(i===105&&e.rewardView.motion.moving)throw Error('reward opening did not finish');
  },i);
  await page.waitForTimeout(10);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(i).padStart(3,'0')}.png`)});
 }
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 await browser.close();if(errors.length)throw Error(errors.join('\n'));
 const video=path.join(artifacts.dir,'modal-motion-review.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
 fs.rmSync(frames,{recursive:true,force:true});console.log('Pause/revive open-close, reward entrance, delayed action and premature click guard passed; disposable video removed.');artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
