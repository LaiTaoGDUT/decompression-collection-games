// Check deferred startup dependencies and the production regional loader without a browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const compiler=fs.realpathSync(execFileSync('which',['tsc'],{encoding:'utf8'}).trim());
const ts=require(path.resolve(path.dirname(compiler),'../lib/typescript.js'));
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'assets/games/bubble-shooter/scripts');
const cache=new Map();class SpriteFrame{}
function moduleAt(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>n==='cc'?{SpriteFrame}:moduleAt(path.resolve(path.dirname(file),n+'.ts'))});return exports;}
const {loadBubbleRegion}=moduleAt(path.join(scripts,'BubbleShooterRegionAssets.ts'));
const {BUBBLE_SCENE_SPRITES:bindings}=moduleAt(path.join(scripts,'BubbleShooterSceneBindings.ts'));
const scene=JSON.parse(fs.readFileSync(path.join(root,'assets/games/bubble-shooter/scenes/BubbleShooter.scene')));
const gameRoot=scene.find(o=>o.__type__==='cc.Node'&&o._name==='GameRoot');
const resolve=ref=>scene[ref.__id__];
const seen=new Set();for(const [nodePath] of bindings){let n=gameRoot;for(const part of nodePath.split('/'))n=n._children.map(resolve).find(c=>c._name===part);assert(n,nodePath);const sprite=n._components.map(resolve).find(c=>c.__type__==='cc.Sprite');assert(sprite,nodePath);assert.equal(sprite._spriteFrame,null,nodePath);assert(!seen.has(nodePath));seen.add(nodePath);}
assert.equal(bindings.length,scene.filter(o=>o.__type__==='cc.Sprite').length,'all authored sprites have deferred bindings');
const component=scene.find(o=>'audioSlots' in o);assert.equal(component.supportFrame,null);assert.equal(component.foregroundFrames.length,0);
const config=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/configs/games.json')));
const {validateGameCatalog}=moduleAt(path.join(root,'assets/runtime/GameManifestValidator.ts'));
(async()=>{
 for(const region of ['cloud','ocean']){
  const calls=[],reads=[];let missing;
  const assets={prepareBundle:async(name,dir)=>{assert.equal(name,'game-bubble-shooter-assets');calls.push(dir);return {get(p){reads.push(p);if(p===missing)return null;assert(p.startsWith('visual/common/')||p.startsWith(`visual/regions/${region}/`),`cross-region load: ${p}`);const image=path.join(root,'assets/game-assets/bubble-shooter',p.replace('/spriteFrame','.png'));assert(fs.existsSync(image),image);assert(fs.existsSync(image+'.meta'));return new SpriteFrame();}}}};
  const pack=await loadBubbleRegion(assets,region);assert.deepEqual(calls,['visual/common',`visual/regions/${region}`]);
  bindings.forEach(([,p])=>pack.sceneFrame(p));assert.equal(pack.region,region);
  missing=`visual/regions/${region}/bubbles/bubble-support/spriteFrame`;await assert.rejects(loadBubbleRegion(assets,region),/Missing/);
 }
 const game=config.games.find(g=>g.id==='bubble-shooter');assert.deepEqual(game.resourceDirectories,['visual/common']);assert(game.initializeTimeoutMs>60000);
 const validate=validateGameCatalog;
 assert(validate);{assert(validate(config).valid);for(const value of [0,-1,120001,NaN,'75000']){const bad=JSON.parse(JSON.stringify(config));bad.games.find(g=>g.id===game.id).initializeTimeoutMs=value;assert(!validate(bad).valid);}}
 assert.equal(component.audioSlots.length,28);assert(component.audioSlots.every(s=>s.clips.length===0));
 console.log('Regional assets: all '+bindings.length+' deferred bindings, common + current only, complete frame paths, early missing-asset rejection and 28 empty audio slots passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
