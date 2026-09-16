const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const frames=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-feedback-'));
 const artifacts=createVerificationArtifactDir('bubble-shooter-transition-');
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
  e.state='playing';e.update(.01);e.state='paused';
  window.beforeRegion=e.round.completedRegions;
  return 'Transition fixture ready';
 }));
 for(let i=0;i<215;i++) {
  await page.evaluate(async i=>{
   const cc=await System.import('cc'),e=window.testEntry,t=e.transitionView;
   if(i===10&&e.round.stage!=='boss-entry')throw Error('Boss entered before banner finished');
   if(i===25&&(!t.bannerRoot.active||e.bossRoot.active))throw Error('warning must precede boss appearance');
   if(i===80&&e.round.stage!=='boss')throw Error('Boss did not enter after banner');
   if(i===85){e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.showReward();}
   if(i===105){
    window.realPrepare=e.context.services.assets.prepareBundle.bind(e.context.services.assets);
    e.context.services.assets.prepareBundle=()=>new Promise(resolve=>{window.completeLoad=resolve;});
    const emit=n=>n.emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
    emit(e.rewardView.content.getChildByName('Reward-bomb'));emit(e.rewardView.content.getChildByName('Confirm'));
    if(!t.cloudActive)throw Error('reward did not trigger clouds');
   }
   if(i===130){if(t.phase!=='covered'||e.round.completedRegions!==window.beforeRegion)throw Error('slow load did not hold covered before commit');}
   if(i===148){window.completeLoad();e.context.services.assets.prepareBundle=window.realPrepare;}
   e.state='playing';e.update(1/30);e.state='paused';
   if(i===132){const time=t.elapsed;e.update(.2);if(t.elapsed!==time)throw Error('paused cloud advanced');}
   if(i===195&&(t.active||e.round.completedRegions!==window.beforeRegion+1||e.round.stage!=='ordinary'))throw Error('transition did not commit once and reveal');
  },i);
  await page.waitForTimeout(10);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(i).padStart(3,'0')}.png`)});
  if([25,118,135,164,195].includes(i))await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,`transition-live-${i}.png`)});
 }
 console.log(await page.evaluate(async()=>{
  const e=window.testEntry,t=e.transitionView;let commits=0,attempts=0;
  t.start(async()=>{attempts++;throw Error('Injected network failure');},()=>commits++);
  await new Promise(r=>setTimeout(r,0));
  for(let i=0;i<15;i++){e.state='playing';e.update(.05);e.state='paused';}
  if(t.phase!=='error'||commits)throw Error('failed download did not preserve covered state');
  t.prepare=async()=>{attempts++;};t.phase='covered';t.launchPrepare();
  await new Promise(r=>setTimeout(r,0));
  for(let i=0;i<4;i++){e.state='playing';e.update(.05);e.state='paused';}
  if(commits!==1||t.phase!=='rendering')throw Error('retry/render gate');
  if(t.start(async()=>{},()=>commits++))throw Error('duplicate transition accepted');
  t.cancel();let resolve;t.start(()=>new Promise(r=>resolve=r),()=>commits++);await Promise.resolve();t.cancel();resolve();
  await Promise.resolve();await Promise.resolve();e.state='playing';e.update(.05);e.state='paused';
  if(commits!==1||t.active)throw Error('cancelled loading result committed');
  return 'Slow loading, pause, failure/retry, render gate, duplicate prevention and cancelled result passed';
 }));
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 await browser.close();if(errors.length)throw Error(errors.join('\n'));
 const video=path.join(artifacts.dir,'transition-live-review.mp4');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',video]);
 fs.rmSync(frames,{recursive:true,force:true});console.log('Boss banner, cloud coverage, actual reward continuation, pageErrors=[]; disposable video removed.');artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
