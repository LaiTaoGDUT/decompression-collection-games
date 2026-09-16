// Cocos Creator preview must be running. Uses Playwright; override module/browser/URL via env.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const { createVerificationArtifactDir } = require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-end-runtime-');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
 const page=await browser.newPage({viewport:{width:750,height:1334},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.goto(process.env.COCOS_PREVIEW_URL || 'http://localhost:7456',{waitUntil:'networkidle',timeout:60000});
 await page.waitForTimeout(4000);
 console.log(await page.evaluate(async()=>{
  const cc = await System.import('cc');
  const bundle = await new Promise((resolve,reject)=>cc.assetManager.loadBundle('game-bubble-shooter',(e,b)=>e?reject(e):resolve(b)));
  const scene = await new Promise((resolve,reject)=>bundle.loadScene('scenes/BubbleShooter',(e,s)=>e?reject(e):resolve(s)));
  await new Promise(resolve=>cc.director.runScene(scene,undefined,resolve));
  return 'BubbleShooter scene loaded';
 }));
 await page.waitForTimeout(2500);



 console.log(await page.evaluate(async()=>{
 const cc=await System.import('cc'); const e=cc.director.getScene().getChildByPath('Canvas/GameRoot').getComponent('BubbleShooterGame');window.testEntry=e;
 window.emit=n=>n.emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
 window.calls={ad:0,restart:0,lobby:0};window.outcome='skipped';
 window.context={gameId:'bubble-shooter',sessionId:'test-session',services:{platform:{getLayoutInfo:()=>undefined},ads:{isEnabledForGame:()=>true,showRewarded:()=>{window.calls.ad++;return new Promise(resolve=>window.adResolve=resolve);}}},requestRestart:()=>window.calls.restart++,requestLobby:()=>window.calls.lobby++};
 e.context=window.context;e.state='playing';
 window.fail=()=>{e.round.board.reset(Array.from({length:19},(_,row)=>({row,col:4,color:['red','blue','yellow','purple'][row%4],frosted:row===9})));e.round.ended=true;e.state='completed';e.syncBoard();};
 window.fail();return 'failure fixture ready';
 }));
 await page.waitForTimeout(700);
 const resize=async(height)=>{await page.setViewportSize({width:750,height:height+50});await page.waitForTimeout(300);await page.evaluate(async height=>{
 const cc=await System.import('cc');const canvas=document.getElementById('GameCanvas');for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height=height+'px';n.style.maxWidth='none';n.style.maxHeight='none';}
 cc.view.setFrameSize(750,height);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
 window.context.services.platform.getLayoutInfo=()=>({safeArea:{left:0,right:750,top:44,bottom:height-48,width:750,height:height-92},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});window.testEntry.applyLayout();
 },height);await page.waitForTimeout(500);};
 const screenshot=async name=>page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,name+'.png')});
 await resize(1334);await screenshot('revive-runtime-1334');await resize(1000);await screenshot('revive-runtime-1000');
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,v=e.endView;const check=(b,m)=>{if(!b)throw Error(m);};
 check(v.visible&&!e.canInteract(),'failure freeze');
 const cc=await System.import('cc');const w=v.primaryText.node.getComponent(cc.UITransform).width;
 const left=v.video.position.x-25,right=v.primaryText.node.position.x+w/2;
 check(Math.abs(left+right)<.01,'icon and text group centered');
 check(Math.abs(v.primaryText.node.position.x-w/2-(v.video.position.x+25)-16)<.01,'icon text spacing');window.emit(v.primary);window.emit(v.primary);check(window.calls.ad===1,'duplicate ad');
 window.adResolve({outcome:'skipped'});await Promise.resolve();await Promise.resolve();check(e.round.canRevive&&v.note.string.includes('未看完'),'skip preserved');
 window.emit(v.primary);window.adResolve({outcome:'failed'});await Promise.resolve();await Promise.resolve();check(e.round.canRevive&&v.note.string.includes('不可用'),'failure preserved');
 window.emit(v.primary);check(e.pause(),'pause during ad');window.adResolve({outcome:'completed'});await Promise.resolve();await Promise.resolve();
 check(!e.round.ended&&!v.visible,'success closes overlay');window.emit(v.primary);check(e.state==='paused'&&!e.canInteract(),'background remains paused');e.resume();check(e.canInteract()&&!v.visible,'resume directly plays');return 'duplicate/skip/fail/completed/paused callbacks passed';
 }));
 await resize(1334);await screenshot('revive-resumed-runtime');
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,v=e.endView;if(v.visible||e.state!=='playing'||e.round.canRevive)throw Error('continue');window.fail();return 'resumed';
 }));await page.waitForTimeout(400);await screenshot('result-runtime-1334');
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,v=e.endView; if(v.title.string!=='本局结束')throw Error('second failure result');window.emit(v.primary);window.emit(v.primary);if(window.calls.restart!==1)throw Error('restart duplicate');
 await e.restart(window.context);window.fail();e.showEnd('offer');window.emit(v.secondary);window.emit(v.secondary);window.emit(v.secondary);if(window.calls.lobby!==1)throw Error('lobby duplicate');
 await e.restart(window.context);window.fail();e.showEnd('offer');window.emit(v.primary);const resolveOld=window.adResolve;await e.restart(window.context);resolveOld({outcome:'completed'});await Promise.resolve();await Promise.resolve();if(e.round.ended||e.endView.visible||e.revivePending)throw Error('restart stale callback');
 window.fail();e.showEnd('offer');window.emit(v.primary);const resolveDisposed=window.adResolve;await e.dispose();resolveDisposed({outcome:'completed'});await Promise.resolve();await Promise.resolve();if(e.endView||e.listening||e.state!=='disposed')throw Error('dispose leak');return 'result/restart/lobby/stale callbacks/dispose passed';
 }));
 console.log('pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
