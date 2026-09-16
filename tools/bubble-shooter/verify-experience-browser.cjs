const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const frames=fs.mkdtempSync(path.join(os.tmpdir(),'bubble-experience-'));
 try {
 const page=await browser.newPage({viewport:{width:750,height:1384},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE',String(e));});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle'});await page.waitForTimeout(3500);
 console.log(await page.evaluate(async()=>{
  const cc=await System.import('cc');console.log('cc loaded');
  const bundle=await new Promise((res,rej)=>cc.assetManager.loadBundle('game-bubble-shooter',(err,b)=>err?rej(err):res(b)));
  const scene=await new Promise((res,rej)=>bundle.loadScene('scenes/BubbleShooter',(err,s)=>err?rej(err):res(s)));
  await new Promise(res=>cc.director.runScene(scene,undefined,res));
  const e=cc.director.getScene().getChildByPath('Canvas/GameRoot').getComponent('BubbleShooterGame');
  const context={gameId:'bubble-shooter',sessionId:'experience',services:{platform:{getLayoutInfo:()=>undefined},storage:{getGameData:()=>undefined,writeGameData:()=>{}},feedback:{vibrate:()=>{}},ads:{isEnabledForGame:()=>true,showRewarded:async()=>({outcome:'completed'})}},requestPause:()=>{},requestRestart:()=>{},requestLobby:()=>{}};
  await e.initialize(context);e.begin();await new Promise(r=>setTimeout(r,1100));e.state='paused';
  const runtime={exitGame:()=>e.dispose()};
  const canvas=document.getElementById('GameCanvas');for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height='1334px';n.style.maxWidth='none';n.style.maxHeight='none';}
  cc.view.setFrameSize(750,1334);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
  e.context.services.platform.getLayoutInfo=()=>({safeArea:{left:0,right:750,top:44,bottom:1286,width:750,height:1242},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});e.applyLayout();
  window.test={cc,e,runtime};const check=(a,m)=>{if(!a)throw Error(m)};window.check=check;
  const balls=e.model.bubbles.filter(b=>b.row===0);check(balls.length===14,'14 column board');
  const diameter=e.node.getChildByPath('Playfield/Board').children[0].getComponent(cc.UITransform).width;check(Math.abs(diameter*14-720)<.001,'board width stable');
  const counter=e.node.getChildByPath('Playfield/Counter');
  const bounds=()=>{let l=Infinity,r=-Infinity;counter.children.filter(n=>n.active).forEach(n=>{const u=n.getComponent(cc.UITransform);l=Math.min(l,n.position.x-u.width*u.anchorX);r=Math.max(r,n.position.x+u.width*(1-u.anchorX));});return counter.position.x+(l+r)/2;};
  check(Math.abs(bounds())<.01,'ordinary indicator centered');e.round.stage='boss';e.syncCounter();check(Math.abs(bounds())<.01,'boss indicator centered');e.round.stage='ordinary';e.syncCounter();
  check(!e.node.getChildByPath('Playfield/Launcher/FixedConnector').active,'connector removed');
  const pivot=e.node.getChildByPath('Playfield/Launcher/TurretPivot');pivot.angle=60;e.cancelAim();check(pivot.angle===60,'return should not snap');e.updatePresentation(.12);check(pivot.angle>0&&pivot.angle<60,'return interpolates');e.updatePresentation(.12);check(pivot.angle===0,'return completes');
  const items=e.node.getChildByPath('Playfield/Items');items.children.forEach(n=>{check(n.getChildByName('Count').getComponent(cc.Label).color.equals(cc.Color.WHITE),'white badge');check(n.getChildByName('NamePlate').getComponent(cc.UITransform).width>=4*23,'four character plaque');});
  check(items.getChildByName('Item-clear-bottom').getChildByName('Icon').angle===-45,'clear tilt');
  return '14/13 columns, 720 width, centered indicators, smooth turret return, item layout passed';
 }));
 await page.locator('#GameCanvas').screenshot({path:path.resolve(__dirname,'../../docs/games/bubble-shooter/references/experience-board-live.png')});
 console.log(await page.evaluate(()=>{
  const {e,cc}=window.test;e.round.accumulatedMisses=2;e.round.current='purple';
  e.model.reset([{row:0,col:0,color:'red',frosted:false}]);
  const result=e.round.settle({row:0,col:1});check(result.inserted,'fixture inserts');e.presentResult(result);
  check(e.rowBirths.length>=13,'new row births');check(e.rowBirths.every(b=>b.node.scale.x===.05&&b.node.getComponent(cc.UIOpacity).opacity===0),'born transparent at own center');
  return 'new-row birth state initialized';
 }));
 for(let i=0;i<110;i++){
  await page.evaluate(i=>{
   const {e}=window.test;
   if(i===18){e.round.reset();e.syncBoard();e.syncSupply();e.transition=0;e.state='paused';e.pauseView.showPause({resume:async()=>{},restart:async()=>{},exit:async()=>{}});e.applyLayout();}
   if(i===37)window.closing=e.pauseView.close();
   if(i===45)e.pauseView.hide();
   if(i===50){e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.showReward();}
   e.state=i<18?'playing':'paused';e.update(1/30);e.state='paused';
  },i);
  await page.locator('#GameCanvas').screenshot({path:path.join(frames,`${String(i).padStart(3,'0')}.png`)});
  if([6,30,63,90].includes(i))await page.locator('#GameCanvas').screenshot({path:path.resolve(__dirname,`../../docs/games/bubble-shooter/references/experience-motion-${i}.png`)});
 }
 console.log(await page.evaluate(async()=>{
  const {e}=window.test;check(e.rewardView.headerAge===.72,'celebration ends');check(e.rewardView.header.scale.x===1&&e.rewardView.header.scale.y===1,'celebration restores native scale');
  check(await window.closing,'close animation resolves');await window.test.runtime.exitGame();return 'row birth, pause open/close, celebration drop/squash/rebound and cleanup passed';
 }));
 if(errors.length)throw Error(errors.join('\n'));
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.resolve(__dirname,'../../docs/games/bubble-shooter/references/experience-motion-review.mp4')]);
 } finally {await browser.close();fs.rmSync(frames,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
