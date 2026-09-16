// Cocos Creator preview must be running. Uses Playwright; override module/browser/URL via env.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const { createVerificationArtifactDir } = require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-pause-runtime-');
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
 const cc=await System.import('cc');const e=cc.director.getScene().getChildByPath('Canvas/GameRoot').getComponent('BubbleShooterGame');window.testEntry=e;e.state='playing';
 window.context={services:{platform:{getLayoutInfo:()=>undefined}}};e.context=window.context;
 window.emit=n=>n.emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
 window.calls={resume:0,restart:0,exit:0};
 window.model={resume:async()=>{window.calls.resume++;e.hidePauseMenu();e.resume();},restart:async()=>{window.calls.restart++;await new Promise(r=>window.resolveRestart=r);e.hidePauseMenu();await e.restart();},exit:async()=>{window.calls.exit++;await e.dispose();}};
 window.openPause=()=>{if(!e.pause())throw Error('pause rejected');e.showPauseMenu(window.model);};window.openPause();
 return 'Pause fixture ready';
 }));
 const resize=async(height)=>{await page.setViewportSize({width:750,height:height+50});await page.waitForTimeout(300);await page.evaluate(async height=>{
 const cc=await System.import('cc');const canvas=document.getElementById('GameCanvas');for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height=height+'px';n.style.maxWidth='none';n.style.maxHeight='none';}
 cc.view.setFrameSize(750,height);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
 window.context.services.platform.getLayoutInfo=()=>({safeArea:{left:0,right:750,top:44,bottom:height-48,width:750,height:height-92},topRightReservedArea:{left:500,right:730,top:50,bottom:110,width:230,height:60}});window.testEntry.applyLayout();
 },height);await page.waitForTimeout(500);};
 const screenshot=async name=>page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,name+'.png')});
 await resize(1334);await screenshot('pause-runtime-1334');await resize(1000);await screenshot('pause-runtime-1000');
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,v=e.pauseView;const check=(b,m)=>{if(!b)throw Error(m);};
 check(v.visible&&v.tertiary.active&&!e.canInteract(),'pause input freeze');const before=JSON.stringify(e.model.bubbles);const time=e.pulseTime;e.update(.2);check(JSON.stringify(e.model.bubbles)===before&&e.pulseTime===time,'pause update freeze');
 window.emit(v.primary);window.emit(v.primary);await Promise.resolve();check(window.calls.resume===1&&e.state==='playing'&&!v.visible,'resume once');
 window.openPause();window.emit(v.secondary);window.emit(v.secondary);window.emit(v.tertiary);check(window.calls.restart===1&&window.calls.exit===0,'busy blocks all buttons');window.resolveRestart();await Promise.resolve();await Promise.resolve();await Promise.resolve();check(e.state==='playing'&&!v.visible,'restart reset');
 window.openPause();e.showPauseMenu({...window.model,resume:async()=>{throw Error('fixture failure');}});window.emit(v.primary);await Promise.resolve();await Promise.resolve();check(v.visible&&!v.busy&&v.detail.string.includes('重试'),'failure retry');
 e.hidePauseMenu();e.resume();window.openPause();window.emit(v.tertiary);window.emit(v.tertiary);await Promise.resolve();check(window.calls.exit===1&&e.state==='disposed'&&!e.pauseView&&!e.listening,'exit once and disposal');return 'freeze/resume/restart/duplicate/failure/dispose passed';
 }));
 console.log('pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
