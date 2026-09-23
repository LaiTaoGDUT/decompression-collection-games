// Functional Cocos checks in an isolated browser context. Never takes screenshots.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
try{const page=await browser.newPage({viewport:{width:750,height:1334}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.COCOS_PREVIEW_URL||'http://localhost:7456',{waitUntil:'networkidle',timeout:60000});
await page.waitForFunction(async()=>{const cc=await System.import('cc');return !!cc.js.getClassByName('App')?.current;},{},{timeout:60000});
console.log(await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.js.getClassByName('App').current,services=Array.from(app.services.services.values());window.cc=cc;window.runtime=services.find(s=>typeof s.enterGame==='function');window.manifest=services.find(s=>typeof s.getById==='function').getById('bubble-shooter');window.preparations=[];const assets=services.find(s=>typeof s.prepareBundle==='function'),prepare=assets.prepareBundle.bind(assets);assets.prepareBundle=(b,d,p)=>{window.preparations.push(d);return prepare(b,d,p);};await window.runtime.enterGame(window.manifest);window.e=window.runtime.entry;if(!e||e.round.region!=='ocean')throw Error('ocean startup');if(preparations.some(d=>d.includes('/cloud')))throw Error('eager cloud load');return 'App → ocean startup: common + ocean only';}));
await page.waitForFunction(()=>!window.e.transitionView.active);
console.log(await page.evaluate(()=>{const frame=e.node.getChildByName('CloudTransition').getComponent(cc.Sprite).spriteFrame;if(frame.name!=='reef'||frame.originalSize.width!==1024||frame.originalSize.height!==82)throw Error('Approved water divider is not bound: '+frame.name+' '+JSON.stringify(frame.originalSize));return 'Live ocean divider: approved reef 1024×82';}));
console.log(await page.evaluate(()=>{
 e.particles.clear(); e.particles.burst({row:0,col:0,color:'red'},{x:0,y:0});
 const particles=e.particles.active;
 if(particles.length!==8)throw Error('ocean burst missing particles');
 if(particles.filter(p=>p.node.getComponent(cc.Sprite).enabled&&p.node.getComponent(cc.Sprite).spriteFrame).length!==5)throw Error('ocean colored fragments missing');
 if(particles.filter(p=>p.node.getChildByName('Water').active).length!==3)throw Error('ocean water accents missing');
 if(particles.some(p=>p.node.getComponent(cc.Graphics)))throw Error('conflicting renderers');
 e.particles.update(1);if(e.particles.count!==0)throw Error('particle lifetime');
 return 'Ocean pop: 5 colored fragments, 3 separate water renderers, bounded lifetime passed';
}));
async function victory(next){await page.evaluate(()=>{e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.round.futureRows=[];e.state='completed';e.showReward();e.rewardView.confirm(['bomb','wildcard','clear-bottom'].find(key=>e.round.inventory[key]<3));});await page.waitForFunction(region=>e.round.region===region&&!e.transitionView.active&&e.state==='playing',next,{timeout:60000});}
await victory('cloud');
await victory('ocean');
console.log(await page.evaluate(async()=>{const p=e.node.getChildByPath('Playfield/Launcher/TurretPivot');if(p.getChildByName('CurrentBall').getSiblingIndex()<p.getChildByName('TurretArtwork').getSiblingIndex())throw Error('loaded ball hidden');if(!e.oceanBoss||e.node.getChildByName('Environment').active)throw Error('ocean art binding');window.snapshot=JSON.stringify(e.round.snapshot());e.requestPause();await Promise.resolve();if(!e.pauseView.visible||!e.pauseView.decoration)throw Error('ocean pause');await e.pauseView.pauseModel.exit();window.preparations=[];await runtime.enterGame(manifest);window.e=runtime.entry;if(JSON.stringify(e.round.snapshot())!==snapshot)throw Error('ocean save roundtrip');if(preparations.some(d=>d.includes('/cloud')))throw Error('ocean restore loads cloud');return 'Ocean transition, cannon layer, themed pause, lobby exit and ocean-only restore passed';}));
await page.waitForFunction(()=>!e.transitionView.active);
console.log(await page.evaluate(()=>{
 const ambient=e.oceanAmbient,root=e.node.getChildByName('OceanAmbient');
 if(!ambient||root.getSiblingIndex()<=e.node.getChildByName('Background').getSiblingIndex()||root.getSiblingIndex()>=e.node.getChildByName('Playfield').getSiblingIndex())throw Error('ambient layer');
 const x=ambient.fish[0].position.x;for(let i=0;i<20;i++)ambient.update(.05);if(x===ambient.fish[0].position.x)throw Error('fish static');
 const f=e.foreground;f.update(0,'ocean',true);for(let i=0;i<60;i++)f.update(.05,'ocean',true);
 if(!f.root.active||f.bubbles.filter(b=>b.node.active).length<2||f.bottom!==-280||!f.bubbles.find(b=>b.node.active).sprite.spriteFrame.name.startsWith('water-'))throw Error('ocean foreground missing');
 if(f.root.getSiblingIndex()<=e.node.getChildByName('Playfield').getSiblingIndex())throw Error('foreground behind game');
 window.ambientBeforePause=ambient.clock;e.pause();e.update(.04);if(ambient.clock!==ambientBeforePause)throw Error('ambient runs paused');e.resume();
 return 'Ocean background actors move behind board; dedicated foreground above gameplay, danger-line mask and pause freeze passed';
}));
await page.evaluate(()=>{e.round.futureRows=[];e.round.stage='boss-entry';});
await page.waitForFunction(()=>e.round.stage==='boss'&&!e.oceanBoss.busy&&e.rowBirths.length===0,{},{timeout:20000});
console.log(await page.evaluate(async()=>{e.round.bossShots=2;const shot=e.model.trace({x:0,y:1});if(!shot)throw Error('missing shot');e.finishShot(shot);if(e.oceanTargets.length!==2)throw Error('conversion targets');window.targets=e.oceanTargets.map(t=>({...t.bubble}));e.requestPause();await Promise.resolve();window.castAge=e.oceanCastAge;return 'Boss entry and actual third-shot conversion scheduled';}));
await page.waitForTimeout(400);
await page.evaluate(async()=>{if(e.oceanCastAge!==castAge)throw Error('cast runs while paused');await e.pauseView.pauseModel.resume();});
await page.waitForFunction(()=>e.oceanCastAge<0&&!e.oceanBoss.busy,{},{timeout:15000});
console.log(await page.evaluate(()=>{for(const t of targets){const i=e.model.bubbles.findIndex(b=>b.row===t.row&&b.col===t.col);if(i<0)throw Error('converted cell missing');const s=e.node.getChildByPath('Playfield/Board').children[i].getComponent(cc.Sprite);if(s.spriteFrame!==e.supportFrame)throw Error('conversion impact sprite');}return 'Cast pause/resume and impact sprites passed';}));
await victory('cloud');
console.log(await page.evaluate(async()=>{if(e.oceanBoss||e.oceanAmbient||e.node.getChildByName('OceanAmbient')||!e.node.getChildByName('Environment').active)throw Error('cloud return');if(e.bossHealthRoot.getChildByName('HealthFill').getComponent(cc.Sprite).spriteFrame.name!=='hud-boss-health-fill')throw Error('health frame not restored');await runtime.exitGame();if(runtime.entry)throw Error('entry leaked');return 'Ocean → cloud restoration and final disposal passed';}));
assert.deepEqual(errors,[]);console.log('Real Cocos regional lifecycle passed; no screenshots, isolated storage.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
