// Integration over the real scene graph and production game classes. Rendering APIs are stubbed;
// this complements (does not replace) Cocos/manual visual acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const compiler=fs.realpathSync(execFileSync('which',['tsc'],{encoding:'utf8'}).trim());
const ts=require(path.resolve(path.dirname(compiler),'../lib/typescript.js'));
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'assets/games/bubble-shooter/scripts');
class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}}
class Component{enabled=true;get isValid(){return this.node.isValid;}}
class Node{constructor(name=''){Object.assign(this,{name,children:[],components:[],position:new Vec3(),scale:new Vec3(1,1,1),angle:0,active:true,isValid:true,layer:1});}setParent(p){this.removeFromParent();this.parent=p;p?.children.push(this);}removeFromParent(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=undefined;}}setSiblingIndex(i){const p=this.parent;if(!p)return;this.removeFromParent();this.parent=p;p.children.splice(i,0,this);}getSiblingIndex(){return this.parent.children.indexOf(this);}addComponent(C){const c=new C();c.node=this;Object.defineProperty(c,'isValid',{get:()=>this.isValid});this.components.push(c);return c;}getComponent(C){return this.components.find(c=>c instanceof C)||null;}getComponentsInChildren(C){return [...this.components.filter(c=>c instanceof C),...this.children.flatMap(n=>n.getComponentsInChildren(C))];}getChildByName(n){return this.children.find(c=>c.name===n)||null;}getChildByPath(p){return p.split('/').reduce((n,k)=>n?.getChildByName(k),this);}setPosition(x,y,z=0){this.position=typeof x==='number'?new Vec3(x,y,z):x.clone();}setScale(x,y=x,z=1){this.scale=typeof x==='number'?new Vec3(x,y,z):x.clone();}on(){}off(){}targetOff(){}destroy(){this.children.slice().forEach(c=>c.destroy());this.isValid=false;this.removeFromParent();}get worldPosition(){return this.position;}}
Node.EventType={TOUCH_START:'start',TOUCH_END:'end',TOUCH_MOVE:'move',TOUCH_CANCEL:'cancel'};
class UITransform{constructor(){this.width=0;this.height=0;this.anchorPoint={x:.5,y:.5};}setContentSize(w,h){this.width=w;this.height=h;}setAnchorPoint(x,y){this.anchorPoint={x,y};}convertToWorldSpaceAR(p){return p.clone();}convertToNodeSpaceAR(p){return p.clone();}getBoundingBoxToWorld(){return {contains:()=>true};}}
class Sprite{spriteFrame=null;}Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};
class SpriteFrame{constructor(p){const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/game-assets/bubble-shooter',p+'.png.meta')));const d=meta.subMetas.f9941.userData;this.name=p.split('/').pop();this.originalSize={width:d.rawWidth,height:d.rawHeight};this.rect={width:d.width,height:d.height};this.path=p;}}
class UIOpacity{opacity=255;}
class Graphics{clear(){}rect(){}roundRect(){}fill(){}stroke(){}circle(){}moveTo(){}lineTo(){}close(){}arc(){}ellipse(){}bezierCurveTo(){}}
class Label{};Label.HorizontalAlign={CENTER:1,LEFT:0};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:2};
class Color{constructor(r=255,g=255,b=255,a=255){Object.assign(this,{r,g,b,a});}}Color.WHITE=new Color();
class Material{initialize(){}overridePipelineStates(){}destroy(){}}
class Mask{};Mask.Type={GRAPHICS_RECT:0};
function instantiate(n){const copy=new Node(n.name);copy.setPosition(n.position);copy.setScale(n.scale);copy.angle=n.angle;copy.active=n.active;for(const c of n.components){const d=copy.addComponent(c.constructor);for(const k of Object.keys(c))if(k!=='node')d[k]=c[k];}for(const child of n.children)instantiate(child).setParent(copy);return copy;}
const cc={_decorator:{ccclass:()=>c=>c,property:(...args)=>args.length>1?undefined:()=>{}},Node,Component,Vec3,Sprite,SpriteFrame,UIOpacity,UITransform,Graphics,Label,Color,Material,Mask,instantiate,BlockInputEvents:class{},AudioClip:class{},view:{setDesignResolutionSize(){},getVisibleSize:()=>({width:750,height:1334}),on(){},off(){}},ResolutionPolicy:{FIXED_WIDTH:1},gfx:{BlendFactor:{SRC_ALPHA:1,ONE:1},BlendOp:{ADD:1}},Director:{EVENT_AFTER_DRAW:'draw'},director:{on(){},off(){}}};
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{experimentalDecorators:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:n=>n==='cc'?cc:load(path.resolve(path.dirname(file),n+'.ts')),console,Date,Math,Set,Map,Array,Number,Promise},{filename:file});return exports;}
const {BubbleShooterGame}=load(path.join(dir,'BubbleShooterGame.ts'));
const {BubbleShooterRound}=load(path.join(dir,'BubbleShooterRound.ts'));
const scene=JSON.parse(fs.readFileSync(path.join(root,'assets/games/bubble-shooter/scenes/BubbleShooter.scene')));
function sceneNode(data){const n=new Node(data._name);n.active=data._active!==false;n.setPosition(data._lpos.x,data._lpos.y);n.setScale(data._lscale.x,data._lscale.y);for(const ref of data._components){const c=scene[ref.__id__];const C=cc[c.__type__.slice(3)];if(!C)continue;const item=n.addComponent(C);if(C===UITransform){item.setContentSize(c._contentSize.width,c._contentSize.height);item.setAnchorPoint(c._anchorPoint.x,c._anchorPoint.y);}if(C===UIOpacity)item.opacity=c._opacity;}data._children.forEach(ref=>sceneNode(scene[ref.__id__]).setParent(n));return n;}
let saved;let preparations=[];const frames=new Map();const assets={prepareBundle:async(_b,d)=>{preparations.push(d);return {get(p){p=p.replace('/spriteFrame','');if(!frames.has(p))frames.set(p,new SpriteFrame(p));return frames.get(p);}};}};
const context={gameId:'bubble-shooter',services:{assets,platform:{getLayoutInfo:()=>undefined},storage:{getGameData:()=>saved,writeGameData:(_id,v)=>saved=v},feedback:{vibrate(){}},ads:{isEnabledForGame:()=>true}},requestLobby(){},requestPause(){}};
function game(){const n=sceneNode(scene.find(o=>o.__type__==='cc.Node'&&o._name==='GameRoot'));const e=n.addComponent(BubbleShooterGame);e.audioSlots=scene.find(o=>'audioSlots' in o).audioSlots.map(s=>({...s,clips:[]}));e.onLoad();return e;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function tick(e,n=80){for(let i=0;i<n;i++){e.update(.05);e.transitionView?.afterDraw();}}
async function continueVictory(e){e.round.stage='victory';e.round.ended=true;e.round.bossHealth=0;e.round.futureRows=[];e.state='completed';e.showReward();e.rewardView.confirm(['bomb','wildcard','clear-bottom'].find(key=>e.round.inventory[key]<3));await flush();tick(e);await flush();tick(e);}
(async()=>{
 let e=game();await e.initialize(context);e.begin();tick(e);assert.equal(e.round.region,'ocean');assert(e.frames.size===4);assert(!preparations.some(p=>p.includes('/cloud')));
 await continueVictory(e);assert.equal(e.round.region,'cloud');
 const progress=e.round.completedRegions,inventory=JSON.stringify(e.round.inventory);
 e.restartCurrentRound=true;await e.restart();e.restartCurrentRound=false;tick(e);await flush();tick(e);assert.equal(e.round.region,'cloud');assert.equal(e.round.completedRegions,progress);assert.equal(JSON.stringify(e.round.inventory),inventory);
 await e.restart();tick(e);await flush();tick(e);assert.equal(e.round.region,'ocean');assert(e.oceanBoss);assert(e.frames.get('red').path.includes('/ocean/'));
 await continueVictory(e);assert.equal(e.round.region,'cloud');
 await continueVictory(e);assert.equal(e.round.region,'ocean');assert.equal(e.state,'playing');assert(e.oceanBoss);assert(e.model.bubbles.some(b=>b.solidKind==='ocean'));assert(e.node.getChildByPath('Playfield/Launcher/TurretPivot/CurrentBall').getSiblingIndex()>e.node.getChildByPath('Playfield/Launcher/TurretPivot/TurretArtwork').getSiblingIndex());
 const snapshot=JSON.parse(JSON.stringify(saved));e.dispose();assert.equal(e.state,'disposed');assert.equal(e.sceneSprites.length,0);
 saved=snapshot;preparations=[];e=game();await e.initialize(context);e.begin();tick(e);assert.equal(e.round.region,'ocean');assert(!preparations.some(p=>p.includes('/cloud')));assert(e.pauseView.decoration);
 const ambient=e.oceanAmbient,ambientRoot=e.node.getChildByName('OceanAmbient');
 assert(ambientRoot.getSiblingIndex()>e.node.getChildByName('Background').getSiblingIndex());
 assert(ambientRoot.getSiblingIndex()<e.node.getChildByName('Playfield').getSiblingIndex());
 assert.equal(ambient.fish.length,3);assert.equal(ambient.weeds.length,2);
 assert.equal(e.foreground.styles.size,1);assert(e.foreground.styles.has('ocean'));
 const fishBefore=ambient.fish[0].position.x;tick(e,20);assert.notEqual(ambient.fish[0].position.x,fishBefore);
 assert.equal(e.foreground.bottom,-280);assert(e.foreground.style.frames.every(f=>f.path.includes('/ocean/foreground/')));

 e.round.futureRows=[];e.round.stage='boss-entry';tick(e,160);assert.equal(e.round.stage,'boss');assert(!e.oceanBoss.busy);
 e.round.bossShots=2;const target=e.model.removableBubbles.find(b=>b.row>=2);const made=e.model.petrify([target],6);e.oceanTargets=made.map(b=>({bubble:b,color:target.color}));e.oceanCastAge=0;e.oceanBoss.cast();e.syncBoard();e.pause();const age=e.oceanCastAge,ambientAge=ambient.clock;tick(e,30);assert.equal(e.oceanCastAge,age);assert.equal(ambient.clock,ambientAge);e.resume();tick(e,50);assert.equal(e.oceanCastAge,-1);assert(!e.oceanBoss.busy);
 const index=e.model.bubbles.findIndex(b=>b.row===target.row&&b.col===target.col);assert.equal(e.node.getChildByPath('Playfield/Board').children[index].getComponent(Sprite).spriteFrame,e.supportFrame);
 const build=e.applyRegionView.bind(e),before=e.round.completedRegions;let failOnce=true;
 e.applyRegionView=pack=>{if(failOnce){failOnce=false;throw Error('expected presentation retry test');}build(pack);};
 await continueVictory(e);assert.equal(e.transitionView.phase,'error');
 e.transitionView.phase='covered';e.transitionView.launchPrepare();await flush();tick(e);
 assert.equal(e.round.completedRegions,before+1,'retry must not advance/reward twice');assert.equal(e.state,'playing');
 assert.equal(e.round.region,'cloud');assert(!e.oceanBoss);assert(!e.oceanAmbient);assert(!ambientRoot.isValid);assert.equal(ambient.fish.length,0);assert.equal(e.foreground.styles.size,1);assert(e.foreground.styles.has('cloud'));assert(e.node.getChildByName('Environment').active);assert(e.bossHealthRoot.getChildByName('HealthFill').getComponent(Sprite).spriteFrame.path.startsWith('visual/common/'));
 e.dispose();
 // Late asset resolution after disposal may not resurrect the view.
 e=game();let done;const pending=e.initialize({...context,services:{...context.services,assets:{prepareBundle:()=>new Promise(r=>done=r)}}});e.dispose();done(await assets.prepareBundle('','visual/common'));await flush();done(await assets.prepareBundle('','visual/regions/cloud'));await assert.rejects(pending,/cancelled/);assert(!e.viewBuilt);
 console.log('Region lifecycle (render stubs): ocean startup → cloud → ocean reward transition → ocean-only restore → Boss entry/cast pause/impact → cloud return → disposal/cancel passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
