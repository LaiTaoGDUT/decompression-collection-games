// Cocos Creator preview must be running. Uses Playwright; override module/browser/URL via env.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
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
 const cc=await System.import('cc');
 const e=cc.director.getScene().getChildByPath('Canvas/GameRoot').getComponent('BubbleShooterGame');window.testEntry=e;
 const check=(b,m)=>{if(!b)throw Error(m);};window.check=check;
 window.saved=undefined;window.audioEvents=[];
 window.context={gameId:'bubble-shooter',sessionId:'save-1',services:{platform:{getLayoutInfo:()=>undefined},
 storage:{getGameData:()=>window.saved,writeGameData:(_id,value)=>window.saved=JSON.parse(JSON.stringify(value))},
 audio:{playMusic:(clip)=>window.audioEvents.push('music:'+clip.name),stopMusic:()=>window.audioEvents.push('stop'),pauseMusic:()=>window.audioEvents.push('pause'),resumeMusic:()=>window.audioEvents.push('resume'),playEffect:clip=>window.audioEvents.push('sfx:'+clip.name)},
 feedback:{vibrate:()=>{}},ads:{isEnabledForGame:()=>true,showRewarded:async()=>({outcome:'completed'})}},requestPause:()=>{},requestRestart:()=>{},requestLobby:()=>{}};
 check(e.audioSlots.length===24&&e.audioSlots.every(s=>s.clips.length===0),'24 empty serialized slots');
 await e.initialize(window.context);e.begin();await new Promise(r=>setTimeout(r,1000));check(window.saved.custom.activeRound,'initial checkpoint');
 const before=JSON.stringify(e.round.snapshot());
 e.round.current='red';e.round.next='blue';e.commitCheckpoint();
 const committed=JSON.stringify(window.saved.custom.activeRound.round);
 e.selectedItem='bomb';e.activeTouch=7;e.pendingShot=e.model.trace({x:0,y:1});
 const aimPoint=e.node.getChildByName('Playfield').getComponent(cc.UITransform).convertToWorldSpaceAR(new cc.Vec3(0,200,0));
 e.fire({getID:()=>7,getUILocation:()=>aimPoint,propagationStopped:false});
 check(e.round.inventory.bomb===0&&e.flight,'projectile in flight');e.pause();
 check(JSON.stringify(window.saved.custom.activeRound.round)===committed,'pause mid-flight keeps pre-shot checkpoint');
 check(window.saved.custom.activeRound.round.inventory.bomb===1,'save never loses uncommitted bomb');
 await e.dispose();check(!e.particles&&!e.listening,'dispose clears particles/input');
 window.firstSave=JSON.parse(JSON.stringify(window.saved));
 return 'null audio + atomic pre-shot persistence passed';
 }));
 const reload=async()=>{await page.evaluate(async()=>{
 const cc=await System.import('cc'),bundle=cc.assetManager.getBundle('game-bubble-shooter');
 const scene=await new Promise((res,rej)=>bundle.loadScene('scenes/BubbleShooter',(e,s)=>e?rej(e):res(s)));
 await new Promise(res=>cc.director.runScene(scene,undefined,res));
 });await page.waitForTimeout(700);await page.evaluate(async()=>{
 const cc=await System.import('cc');window.testEntry=cc.director.getScene().getChildByPath('Canvas/GameRoot').getComponent('BubbleShooterGame');
 await window.testEntry.initialize(window.context);window.testEntry.begin();await new Promise(r=>setTimeout(r,1000));
 });};
 await reload();
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,check=window.check;
 check(e.round.inventory.bomb===1&&e.round.current==='red'&&e.round.next==='blue'&&!e.flight,'scene reload restores intact queue and stock');
 check(JSON.stringify(e.round.snapshot())===JSON.stringify(window.firstSave.custom.activeRound.round),'whole board roundtrip');
 e.round.stage='boss';e.round.bossHealth=23;e.round.regionProgress=120;e.round.bossShots=2;e.healthTarget=e.healthVisible=23;
 e.model.reset([{row:0,col:4,color:'red',frosted:false},{row:0,col:5,color:'red',frosted:false},{row:1,col:4,color:'blue',frosted:true},{row:0,col:8,color:'yellow',frosted:false}]);
 e.round.current='red';e.round.next='purple';e.syncBoard();e.syncBoss();e.commitCheckpoint();
 const result=e.round.settle({row:0,col:3});e.presentResult(result);for(let i=0;i<4;i++)e.update(.05);check(e.particles.count>0,'fragments spawned');
 for(let i=0;i<100;i++)e.particles.burst({color:'red'},{x:0,y:0},true);check(e.particles.count===64,'particle cap');
 const child=e.particles.active[0].node;const pos=child.position.clone();e.pause();e.update(.2);check(child.position.equals(pos),'particles pause');e.resume();
 e.round.board.reset(Array.from({length:19},(_,row)=>({row,col:4,color:'red',frosted:false})));e.round.ended=true;e.state='completed';e.commitCheckpoint();e.showEnd('offer');
 await e.requestRevive();check(!e.endView.visible&&e.state==='playing'&&!e.round.canRevive,'revive directly resumes');
 check(window.saved.custom.activeRound.round.reviveUsed,'revive consumption persisted');
 e.round.bossHealth=13;e.round.bossShots=1;e.commitCheckpoint();window.bossSave=JSON.stringify(e.round.snapshot());
 await e.dispose();return 'fragments/cap/pause/revive checkpoint passed';
 }));
 await reload();
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,check=window.check;check(JSON.stringify(e.round.snapshot())===window.bossSave,'boss hp/counter/revive restored');
 const sound=e.sound;const clipA={name:'normal'},clipB={name:'boss'},pop={name:'pop'};
 sound.bind(window.context.services.audio,[{cue:'normal-music',clips:[clipA],volume:.3},{cue:'boss-music',clips:[clipB],volume:.3},{cue:'pop',clips:[pop],volume:.7}]);
 sound.reset();sound.music('normal-music');sound.music('boss-music');sound.pause();const n=window.audioEvents.length;sound.play('pop');check(window.audioEvents.length===n,'paused sound suppressed');sound.resume();sound.play('pop');sound.play('pop');check(window.audioEvents.filter(s=>s==='sfx:pop').length===1,'effect throttled');
 check(window.audioEvents.includes('music:normal')&&window.audioEvents.includes('music:boss'),'music stage switch');
 sound.bind(window.context.services.audio,e.audioSlots);
 e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.round.board.reset([]);e.commitCheckpoint();await e.dispose();return 'boss restore/audio routing/throttle passed';
 }));
 await reload();
 console.log(await page.evaluate(async()=>{
 const cc=await System.import('cc'),e=window.testEntry,check=window.check;
 check(e.rewardView.visible&&e.round.rewardAvailable,'victory save restores reward directly');
 for(let i=0;i<16;i++)e.update(.05);
 const old=e.round.completedRegions;
 const emit=n=>n.emit(cc.Node.EventType.TOUCH_END,{propagationStopped:false});
 emit(e.rewardView.content.getChildByName('Reward-wildcard'));emit(e.rewardView.content.getChildByName('Confirm'));
 await new Promise(r=>setTimeout(r,1600));
 check(e.round.completedRegions===old+1&&e.state==='playing'&&!e.rewardView.visible,'reward once after restore');
 check(window.saved.custom.activeRound.round.completedRegions===old+1,'next cloud committed');
 e.showEnd('result');check(window.saved.custom.activeRound===null,'ending run deletes recovery');await e.dispose();check(window.saved.custom.activeRound===null,'dispose never resurrects ended run');
 return 'reward recovery/continuation/terminal save cleanup passed';
 }));
 await reload();
 console.log(await page.evaluate(async()=>{
 const e=window.testEntry,check=window.check;check(e.round.completedRegions===0&&e.state==='playing','ended save starts fresh');
 e.round.inventory.bomb=0;e.commitCheckpoint();await e.restart(window.context);check(window.saved.custom.activeRound.round.inventory.bomb===1,'restart replaces checkpoint');
 await e.dispose();window.saved.custom.activeRound={elapsed:1,round:{version:999}};return 'restart checkpoint passed';
 }));
 await reload();
 console.log(await page.evaluate(async()=>{const e=window.testEntry;window.check(e.round.board.bubbles.length===135&&e.state==='playing','corrupt save starts safely');await e.dispose();return 'corrupt save fallback passed';}));
 console.log('pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
