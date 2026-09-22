// Real Cocos geometry/lifecycle check. Isolated storage, no screenshots or video capture.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try {
  const page=await browser.newPage({viewport:{width:750,height:1334}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle'});
  await page.waitForFunction(async()=>{try{const cc=await System.import('cc');return !!cc.js.getClassByName('App')?.current;}catch{return false;}});
  console.log(await page.evaluate(async()=>{
   const cc=await System.import('cc'),app=cc.js.getClassByName('App').current,services=Array.from(app.services.services.values());
   const runtime=services.find(s=>typeof s.enterGame==='function');
   await runtime.enterGame(services.find(s=>typeof s.getById==='function').getById('bubble-shooter'));
   const e=runtime.entry;e.state='paused';
   const module=await System.import('file:///Users/laitao/hello-pressure/decompression-collection-games/assets/games/bubble-shooter/scripts/BubbleShooterOceanBoss.ts');
   const frames=await module.loadOceanBossFrames(e.context.services.assets);
   if(frames.size!==4||frames.has('grab-arm'))throw Error('legacy tentacle loaded');
   const node=new cc.Node('SharkVerification');node.layer=e.node.layer;node.setParent(e.node);
   const boss=node.addComponent(module.BubbleShooterOceanBoss);boss.enabled=false;boss.initialize(frames);boss.paused=false;
   let impacts=0,exits=0;
   if(!boss.enter()||boss.enter())throw Error('duplicate entry');
   boss.update(.3);const clock=boss.clock;boss.paused=true;boss.update(2);if(boss.clock!==clock)throw Error('pause advanced');
   boss.paused=false;boss.update(.61);if(boss.busy)throw Error('entry stuck');
   const idle=boss.figure.scale.y;boss.update(.3);if(idle===boss.figure.scale.y)throw Error('idle static');
   const origin=boss.getSkillOrigin();if(origin.parent!==boss.staff)throw Error('orb detached from staff');
   const before=origin.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3());
   if(!boss.cast(()=>impacts++)||boss.cast())throw Error('cast lock');
   boss.update(.6);const after=origin.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3());
   if(cc.Vec3.distance(before,after)<20)throw Error('orb does not follow raised staff');
   if(impacts)throw Error('early impact');boss.update(.2);boss.update(1.1);if(impacts!==1||boss.busy)throw Error('cast completion');
   e.pauseView.setRegionDecoration(boss.modalFactory());
   e.pauseView.showPause({resume:async()=>{},restart:async()=>{},exit:async()=>{}});
   const rear=e.pauseView.content.getChildByPath('RegionBack/OceanModalBack');
   if(!rear?.getChildByName('StaffArm')||!rear.getChildByName('Body'))throw Error('modal rig absent');
   const view=e.rewardView;
   const geometry=()=>JSON.stringify(view.content.children.filter(n=>['Panel','Subtitle','SelectionText','Confirm','Capacity'].includes(n.name)||n.name.startsWith('Reward-')).map(n=>[n.name,n.position,n.getComponent(cc.UITransform).contentSize]));
   const layout=geometry();view.setCelebration(await module.loadOceanCelebration(e.context.services.assets));
   if(layout!==geometry())throw Error('celebration changed common controls');
   if(!boss.defeat(()=>exits++)||boss.defeat())throw Error('defeat lock');boss.update(1.2);
   if(exits!==1||boss.figure.active)throw Error('defeat completion');
   boss.enter(()=>{throw Error('disposed callback fired');});boss.dispose();boss.update(2);boss.dispose();
   if(boss.frames||boss.figure||boss.getSkillOrigin())throw Error('retained references');
   e.pauseView.setRegionDecoration();node.destroy();await runtime.exitGame();
   return 'Shark: four parts, entry/idle/pause/cast/defeat, moving staff-tip origin, modal rig, unchanged reward controls and disposal passed.';
  }));
  if(errors.length)throw Error(errors.join('\n'));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
