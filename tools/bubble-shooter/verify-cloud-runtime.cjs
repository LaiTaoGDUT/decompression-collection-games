// Cocos Creator preview must be running. Uses Playwright; override module/browser/URL via env.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const { createVerificationArtifactDir } = require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-cloud-runtime-');
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
 const page=await browser.newPage({viewport:{width:750,height:1334},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.goto(process.env.COCOS_PREVIEW_URL || 'http://localhost:7456',{waitUntil:'networkidle',timeout:60000});
 await page.waitForTimeout(4000);

 console.log(await page.evaluate(async()=>{
 const cc=await System.import('cc');const app=cc.js.getClassByName('App').current;
 if(!app)throw Error('App composition root missing');
 const services=Array.from(app.services.services.values());
 const runtime=services.find(s=>typeof s.enterGame==='function');const registry=services.find(s=>typeof s.getById==='function');

 const audioService=services.find(s=>typeof s.createEffectScope==='function');
 const channel=()=>({clip:null,loop:false,volume:1,playing:false,play(){this.playing=true;},pause(){this.playing=false;},stop(){this.playing=false;},playOneShot(){}});
 const voices=[];let destroyed=0;
 const scopedService=new audioService.constructor(channel(),channel(),{snapshot:{settings:{musicEnabled:true,soundEnabled:true}},writeSettings:()=>{}},()=>{const c=channel();voices.push(c);return {channel:c,dispose:()=>destroyed++};});
 scopedService.initialize();const scope=scopedService.createEffectScope();for(let i=0;i<20;i++)scope.play({name:'test'},.5);
 if(voices.length!==6||!voices.every(v=>v.playing))throw Error('bounded audio voices');
 scope.stop();if(voices.some(v=>v.playing||v.clip))throw Error('stop releases scoped clips');
 scopedService.onHide();scope.play({name:'test'},.5);if(voices.some(v=>v.playing))throw Error('hidden scope playback');
 scopedService.onShow();scope.play({name:'test'},.5);scopedService.setSoundEnabled(false,false);if(voices.some(v=>v.playing||v.clip))throw Error('mute stops effects');
 scope.dispose();scope.dispose();if(destroyed!==6)throw Error('scope dispose exactly once');scopedService.dispose();
 window.runtime=runtime;window.manifest=registry.getById('bubble-shooter');
 await runtime.enterGame(window.manifest);window.testEntry=runtime.entry;
 if(!runtime.entry||runtime.entry.state!=='playing')throw Error('real runtime entry failed');
 return {appEntry:true,audioSlots:runtime.entry.audioSlots.length};
 }));
 await page.waitForTimeout(800);
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,r=window.runtime;
 e.round.inventory.bomb=2;e.round.regionProgress=43;e.round.current='purple';e.commitCheckpoint();
 window.roundBeforeExit=JSON.stringify(e.round.snapshot());
 e.requestPause();await Promise.resolve();if(!e.pauseView.visible||e.state!=='paused')throw Error('real pause presenter');
 await e.pauseView.pauseModel.exit();if(r.entry)throw Error('real lobby release');
 await r.enterGame(window.manifest);window.testEntry=r.entry;
 if(JSON.stringify(r.entry.round.snapshot())!==window.roundBeforeExit)throw Error('real storage recovery');
 r.entry.requestPause();await Promise.resolve();await r.entry.pauseView.pauseModel.resume();
 if(r.entry.state!=='playing'||r.entry.pauseView.visible)throw Error('real resume');
 return 'App → game → pause → lobby → storage recovery → resume passed';
 }));
 console.log(await page.evaluate(async()=>{
 const r=window.runtime;let e=r.entry;
 e.requestPause();await Promise.resolve();await e.pauseView.pauseModel.restart();e=r.entry;
 if(e.round.inventory.bomb!==1||e.round.regionProgress!==0)throw Error('real restart');
 const cc=await System.import('cc');
 e.round.board.reset([{row:0,col:4,color:'red',frosted:false},{row:0,col:5,color:'red',frosted:false},{row:1,col:4,color:'blue',frosted:true},{row:0,col:9,color:'purple',frosted:false}]);
 e.round.current='red';e.syncBoard();e.presentResult(e.round.settle({row:0,col:3}));for(let i=0;i<4;i++)e.update(.05);e.pause();
 window.testEntry=e;return {realRestart:true,particles:e.particles.count};
 }));
 await page.waitForTimeout(120);
 await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,'cloud-fragments-runtime.png')});
 console.log(await page.evaluate(async()=>{
 const cc=await System.import('cc');cc.director.resume();const r=window.runtime,e=r.entry;
 e.showEnd('result');await r.exitGame();await r.enterGame(window.manifest);
 if(r.entry.round.regionProgress!==0||r.entry.round.inventory.bomb!==1)throw Error('real terminal recovery removed');
 await r.exitGame();return 'real terminal cleanup and release passed';
 }));
 console.log('pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
