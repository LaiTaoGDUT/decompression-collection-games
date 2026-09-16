const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-ocean-runtime-');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try {
 const page=await browser.newPage({viewport:{width:750,height:1384},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle'});await page.waitForTimeout(3500);
 console.log(await page.evaluate(async()=>{
  const cc=await System.import('cc'),app=cc.js.getClassByName('App').current,services=Array.from(app.services.services.values());
  const runtime=services.find(s=>typeof s.enterGame==='function');await runtime.enterGame(services.find(s=>typeof s.getById==='function').getById('bubble-shooter'));
  const e=runtime.entry;await e.restart();await new Promise(r=>setTimeout(r,1100));e.state='paused';
  const canvas=document.getElementById('GameCanvas');for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height='1334px';n.style.maxWidth='none';n.style.maxHeight='none';}
  cc.view.setFrameSize(750,1334);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);e.applyLayout();
  const backdrop=new cc.Node('OceanAssemblyBackdrop');backdrop.layer=e.node.layer;backdrop.setParent(e.node);backdrop.addComponent(cc.UITransform).setContentSize(750,1800);
  const graphics=backdrop.addComponent(cc.Graphics);graphics.fillColor=new cc.Color(28,67,82);graphics.rect(-375,-900,750,1800);graphics.fill();
  const module=await System.import('file:///Users/laitao/hello-pressure/decompression-collection-games/assets/games/bubble-shooter/scripts/BubbleShooterOceanBoss.ts');
  const frames=await module.loadOceanBossFrames(e.context.services.assets);
  const node=new cc.Node('OceanBossReview');node.layer=e.node.layer;node.setParent(e.node);node.setPosition(0,210);
  const boss=node.addComponent(module.BubbleShooterOceanBoss);boss.enabled=false;
  const grabParent=new cc.Node('GrabReview');grabParent.layer=e.node.layer;grabParent.setParent(e.node.getChildByName('Playfield'));grabParent.setSiblingIndex(0);
  boss.initialize(frames,grabParent);boss.paused=false;
  e.bossRoot.active=false;e.node.getChildByName('Environment').active=false;e.node.getChildByName('CloudTransition').active=false;
  window.ocean={module,cc,e,runtime,boss,node,grabParent,backdrop,impacts:0,exits:0};
  return {frames:frames.size,registered:!!cc.js.getClassByName('BubbleShooterOceanBoss')};
 }));
 console.log(await page.evaluate(()=>{
  const o=window.ocean,b=o.boss;
  if(!b.enter()||b.enter())throw Error('duplicate entry accepted');
  b.update(.3);const pose=JSON.stringify([b.figure.position,b.body.scale,b.clock]);b.paused=true;b.update(3);
  if(pose!==JSON.stringify([b.figure.position,b.body.scale,b.clock]))throw Error('paused motion advanced');
  b.paused=false;b.update(.61);if(b.busy)throw Error('entry did not complete');
  const before=b.body.scale.y;b.update(.3);if(before===b.body.scale.y)throw Error('idle static');
  if(!b.cast(()=>o.impacts++))throw Error('cast rejected');if(b.cast())throw Error('duplicate cast accepted');
  b.update(.41);if(o.impacts)throw Error('early impact');b.update(.02);b.update(.6);if(o.impacts!==1)throw Error('impact not exactly once');
  return 'entry, idle, pause, cast timing and duplicate locks passed';
 }));
 await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,'ocean-boss-assembly-live.png')});
 const videoFrames=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-boss-motion-'));
 try {
  await page.evaluate(()=>window.ocean.boss.enter());
  for(let i=0;i<100;i++) {
   await page.evaluate(i=>{const b=window.ocean.boss;if(i===30)b.cast();if(i===63)b.defeat();b.update(1/30);},i);
   await page.locator('#GameCanvas').screenshot({path:path.join(videoFrames,`${String(i).padStart(3,'0')}.png`)});
  }
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(videoFrames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(artifacts.dir,'ocean-boss-motion-live.mp4')]);
 } finally {fs.rmSync(videoFrames,{recursive:true,force:true});}
 await page.evaluate(()=>{window.ocean.boss.enter();window.ocean.boss.update(1);});
 console.log(await page.evaluate(()=>{
  const {e,boss:b}=window.ocean;
  e.round.reset('ocean');e.round.stage='boss';const cells=e.model.bubbles.slice(-2);e.model.applySupport(cells,'tentacle',6);
  b.syncGrabs(e.model.bubbles,e.model);b.update(.5);if(b.grabs.size!==2)throw Error('grabs missing');
  const nodes=Array.from(b.grabs.values()).map(g=>g.node);
  e.model.insertRow(()=>.1);b.syncGrabs(e.model.bubbles,e.model,true);
  if(!Array.from(b.grabs.values()).every(g=>nodes.includes(g.node)))throw Error('insert recreated grabs');
  e.model.clearTargets(e.model.bubbles.filter(x=>x.support));b.syncGrabs(e.model.bubbles,e.model);b.update(.4);
  if(b.grabs.size)throw Error('removed grabs retained');
  e.pauseView.setRegionDecoration(b.modalFactory());
  e.pauseView.showPause({resume:async()=>{},restart:async()=>{},exit:async()=>{}});
  e.pauseView.motion.update(.4);e.pauseView.layout(750,1334);
  window.ocean.node.active=false;
  return 'grab insertion/retraction and modal decoration mounted';
 }));
 await page.waitForTimeout(200);
 await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,'ocean-pause-assembly-live.png')});
 console.log(await page.evaluate(async()=>{
  const o=window.ocean;o.e.pauseView.hide();
  const view=o.e.rewardView;
  const unchanged=()=>JSON.stringify(view.content.children.filter(n=>['Panel','Subtitle','SelectionText','Confirm','Capacity'].includes(n.name)||n.name.startsWith('Reward-')).map(n=>[n.name,n.position,n.getComponent(o.cc.UITransform).contentSize]));
  const before=unchanged();const frame=await o.module.loadOceanCelebration(o.e.context.services.assets);
  view.setCelebration(frame);if(before!==unchanged())throw Error('celebration moved common reward controls');
  o.e.round.stage='victory';o.e.round.ended=true;o.e.round.bossHealth=0;view.show(o.e.round,()=>{});
  view.root.setSiblingIndex(o.e.node.children.length-1);view.motion.update(.4);view.layout(750,1334);
  return 'complete celebration mounted; common middle and bottom geometry unchanged';
 }));
 await page.waitForTimeout(200);
 await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,'ocean-reward-assembly-live.png')});
 console.log(await page.evaluate(async()=>{
  const o=window.ocean,b=o.boss;
  if(!b.defeat(()=>o.exits++)||b.defeat())throw Error('duplicate defeat accepted');b.update(1.2);
  if(o.exits!==1||b.figure.active)throw Error('defeat completion incorrect');
  b.enter(()=>{throw Error('disposed callback fired');});b.dispose();b.update(2);b.dispose();
  if(b.frames||b.grabs.size||b.figure)throw Error('retained refs');
  o.e.pauseView.setRegionDecoration();o.node.destroy();o.grabParent.destroy();o.backdrop.destroy();await o.runtime.exitGame();
  return 'defeat, disposal cancellation, repeated disposal and exit passed';
 }));
 if(errors.length)throw Error(errors.join('\n'));
 } finally {await browser.close();artifacts.cleanup();}
})().catch(e=>{console.error(e);process.exit(1)});
