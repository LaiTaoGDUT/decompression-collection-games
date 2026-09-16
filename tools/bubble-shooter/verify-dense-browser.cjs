// Verify the dense board through the real application entry and renderer.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-dense-runtime-');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:750,height:1384},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle'});await page.waitForTimeout(4000);
 await page.evaluate(async()=>{
  const cc=await System.import('cc'),app=cc.js.getClassByName('App').current;
  const services=Array.from(app.services.services.values()),r=services.find(s=>typeof s.enterGame==='function');
  const manifest=services.find(s=>typeof s.getById==='function').getById('bubble-shooter');
  const assets=services.find(s=>typeof s.prepareBundle==='function');
  const prepare=assets.prepareBundle.bind(assets),groups=[];
  assets.prepareBundle=(name,directory,...args)=>{if(name===manifest.resourceBundle)groups.push(directory);return prepare(name,directory,...args);};
  await r.enterGame(manifest);
  assets.prepareBundle=prepare;
  if(JSON.stringify(groups)!==JSON.stringify(['visual/common','visual/regions/cloud']))throw Error('startup must load only common and selected cloud groups: '+JSON.stringify(groups));
window.testEntry=r.entry;window.runtime=r;window.manifest=manifest;await r.entry.restart();await new Promise(r=>setTimeout(r,1000));
 });
 for(const height of [1334,1000,1625]) {
  await page.setViewportSize({width:750,height:height+50});
  const result=await page.evaluate(async height=>{
   const cc=await System.import('cc'),e=window.testEntry,canvas=document.getElementById('GameCanvas');
   for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height=height+'px';n.style.maxWidth='none';n.style.maxHeight='none';}
   cc.view.setFrameSize(750,height);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
   e.context.services.platform.getLayoutInfo=()=>({safeArea:{left:40,right:710,top:44,bottom:height-48,width:670,height:height-92},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});
   e.applyLayout();const play=e.node.getChildByName('Playfield'),board=play.getChildByName('Board');
   const check=(b,m)=>{if(!b)throw Error(m)};check(board.children.length===145,'145 rendered opening bubbles');
   const root=e.node.getComponent(cc.UITransform),rect=n=>{
    const t=n.getComponent(cc.UITransform),p=root.convertToNodeSpaceAR(t.convertToWorldSpaceAR(new cc.Vec3()));
    const sx=n.worldScale.x/e.node.worldScale.x,sy=n.worldScale.y/e.node.worldScale.y;
    return {left:p.x-t.width*t.anchorX*sx,right:p.x+t.width*(1-t.anchorX)*sx,bottom:p.y-t.height*t.anchorY*sy,top:p.y+t.height*(1-t.anchorY)*sy};
   };
   if(Math.abs(board.children[0].position.y-410)>.01)throw Error('board top remains at original 410');
   const balls=board.children.map(rect),left=Math.min(...balls.map(r=>r.left)),right=Math.max(...balls.map(r=>r.right));
   for(const side of [-1,1]) {
    const shot=new e.model.constructor([]).trace({x:side*.75,y:1});
    check(!!shot,'reflection fixture');
    const contact=play.getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(shot.points[1].x+side*24,shot.points[1].y));
    const edge=root.convertToNodeSpaceAR(contact).x;
    check(Math.abs(edge-(side<0?left:right))<.01,'projectile outer edge touches rendered board edge at reflection');
   }
   check(left>=-375&&right<=375,'board within horizontal screen');if(height>=1334)check(right-left>=690,'board fills standard/tall screen');
   const controls=['Items/Item-bomb','Items/Item-wildcard','Items/Item-clear-bottom','Launcher/Pedestal','Launcher/NextBall','Launcher/Swap'].map(p=>rect(play.getChildByPath(p)));
   controls.forEach(b=>check(b.left>=-375&&b.right<=375&&b.bottom>=-height/2+48&&b.top<=height/2-122,'control inside safe bounds'));
   check(controls[2].right<controls[3].left,'all three items left of cannon');
   check(controls[1].right<controls[2].left&&controls[0].bottom>controls[1].top,'two-row triangle targets separated');
   check(Math.abs((controls[0].left+controls[0].right)-(controls[1].left+controls[2].right))<.01,'triangle apex centered');
   const pivot=play.getChildByPath('Launcher/TurretPivot'),p=play.getComponent(cc.UITransform).convertToNodeSpaceAR(pivot.worldPosition);
   check(Math.abs(p.x)<.01&&Math.abs(p.y+404)<.01,'visual pivot agrees with trace');
   const ball=board.children[0].getComponent(cc.UITransform);check(ball.width===48&&ball.height===48,'strict circular ball size');
   return {height,balls:board.children.length,width:right-left,pivot:{x:p.x,y:p.y},bottomMargin:Math.min(...controls.map(r=>r.bottom))+height/2-48};
  },height);
  await page.waitForTimeout(350);console.log(result);
  await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,`cloud-header-live-${height}.png`)});
 }
 console.log(await page.evaluate(async()=>{
  const cc=await System.import('cc'),e=window.testEntry,play=e.node.getChildByName('Playfield');
  const ui=play.getComponent(cc.UITransform);const target=ui.convertToWorldSpaceAR(new cc.Vec3(-220,80));
  const event={getID:()=>77,getUILocation:()=>({x:target.x,y:target.y}),propagationStopped:false};
  e.activeTouch=77;e.aim(event);if(!e.pendingShot)throw Error('left-side aim from centered cannon');
  const expected=e.pendingShot;const visual=ui.convertToNodeSpaceAR(play.getChildByPath('Launcher/TurretPivot/CurrentBall').worldPosition);
  if(Math.hypot(visual.x-expected.points[0].x,visual.y-expected.points[0].y)>.01)throw Error('muzzle ray mismatch');
  e.fire(event);if(!e.flight)throw Error('projectile did not launch');
  for(let i=0;i<400&&e.flight;i++)e.update(.016);
  if(e.flight)throw Error('shot never settled');e.cancelAim();
  e.round.stage='boss-entry';e.round.regionProgress=e.round.difficulty.progressRequired;for(let i=0;i<200&&e.round.stage==='boss-entry';i++)e.update(.05);
  for(let i=0;i<25;i++)e.update(.05);
  if(e.round.board.bubbles.length!==135)throw Error('dense boss count');
  return 'centered cannon aiming, muzzle and settlement passed';
 }));
 await page.waitForTimeout(500);
 await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,'cloud-header-boss-live-1625.png')});
 for(const height of [1334,1000]) {
  await page.setViewportSize({width:750,height:height+50});
  await page.evaluate(async height=>{
   const cc=await System.import('cc'),e=window.testEntry,canvas=document.getElementById('GameCanvas');
   for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height=height+'px';n.style.maxWidth='none';n.style.maxHeight='none';}
   cc.view.setFrameSize(750,height);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
   e.context.services.platform.getLayoutInfo=()=>({safeArea:{left:40,right:710,top:44,bottom:height-48,width:670,height:height-92},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});e.applyLayout();
   if(!e.node.getChildByName('CloudTransition').getComponent(cc.Sprite).spriteFrame)throw Error('cloud asset missing');
   if(!e.bossHealthRoot.active||e.bossRoot.getChildByName('HealthTrack').active)throw Error('independent health HUD');
  },height);await page.waitForTimeout(350);
  await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,`cloud-header-boss-live-${height}.png`)});
 }
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 console.log('pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
