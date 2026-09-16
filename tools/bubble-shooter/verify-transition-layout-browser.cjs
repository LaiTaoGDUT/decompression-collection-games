// Verify the dense board through the real application entry and renderer.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');
const {createVerificationArtifactDir}=require('./verification-artifacts');
(async()=>{
 const artifacts=createVerificationArtifactDir('bubble-shooter-transition-layout-');
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
 for(const height of [1000,1334,1625]) {
  await page.setViewportSize({width:750,height:height+50});
  await page.evaluate(async height=>{
   const cc=await System.import('cc'),e=window.testEntry,canvas=document.getElementById('GameCanvas');
   for(let n=canvas;n&&n!==document.body;n=n.parentElement){n.style.width='750px';n.style.height=height+'px';n.style.maxWidth='none';n.style.maxHeight='none';}
   cc.view.setFrameSize(750,height);cc.view.setDesignResolutionSize(750,1334,cc.ResolutionPolicy.FIXED_WIDTH);
   e.state='paused';e.applyLayout();const t=e.transitionView;t.cancel();t.phase='covered';t.root.active=true;t.draw();
   if(t.cloudWidth*.4921875<375)throw Error('Cloud opaque edges do not overlap');
   if(t.cloudWidth*3<height)throw Error('Cloud height does not cover screen');
  },height);
  await page.waitForTimeout(250);
  await page.locator('#GameCanvas').screenshot({path:path.join(artifacts.dir,`transition-covered-${height}.png`)});
 }
 await page.evaluate(async()=>{await window.runtime.exitGame();});
 console.log('Full opaque cloud overlap, full height, grouped startup and pageErrors',errors);if(errors.length)throw Error(errors.join('\n'));await browser.close();artifacts.cleanup();
})().catch(e=>{console.error(e);process.exit(1)});
