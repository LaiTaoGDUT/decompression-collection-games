const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const compiler=fs.realpathSync(execFileSync('which',['tsc'],{encoding:'utf8'}).trim());
const ts=require(path.resolve(path.dirname(compiler),'../lib/typescript.js'));
class UITransform{setContentSize(w,h){this.width=w;this.height=h;}}
class Sprite{};Sprite.SizeMode={CUSTOM:0};class UIOpacity{};class Mask{};Mask.Type={GRAPHICS_RECT:0};
class Node{
 constructor(name){this.name=name;this.components=new Map();this.children=[];this.active=true;this.isValid=true;}
 setParent(p){this.parent=p;p.children.push(this);}addComponent(C){const c=new C();this.components.set(C,c);return c;}getComponent(C){return this.components.get(C);}
 getChildByName(n){return this.children.find(c=>c.name===n);}getSiblingIndex(){return this.parent.children.indexOf(this);}
 setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}destroy(){this.isValid=false;}
}
const output=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../assets/games/bubble-shooter/scripts/BubbleShooterForeground.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject={};vm.runInNewContext(output,{exports:exportsObject,require:n=>n==='cc'?{Node,Sprite,UIOpacity,UITransform,Mask}:{BOARD_WIDTH:720,TOP:410,DANGER:-280,DIAMETER:55}});
const parent=new Node('Playfield');for(const key of ['Board','AimFeedback','Vfx','Launcher'])new Node(key).setParent(parent);
const view=new exportsObject.BubbleShooterForeground(parent), frame={rect:{width:1024,height:171}};
view.register('cloud',{frames:[frame],width:290,opacity:43,duration:11,interval:9,bob:12});
assert.equal(parent.children[parent.children.length-1].name,'BoardForeground');
for(const name of ['Board','AimFeedback','Vfx','Launcher'])assert(view.root.getSiblingIndex()>parent.getChildByName(name).getSiblingIndex());
assert.equal(view.bottom,-280,'foreground clips exactly at danger line');
view.update(1,'cloud',true);assert(!view.cloud.active);view.update(3,'cloud',true);assert(view.cloud.active);
assert(view.opacity.opacity<=43 && view.opacity.opacity>0);const age=view.age;view.update(1,'cloud',false);assert(!view.root.active);assert.equal(view.age,age);
view.update(8,'cloud',true);assert(!view.cloud.active);view.update(1,'cloud',true);assert(!view.cloud.active,'gap between passes');
view.update(1,'ocean',true);assert(!view.root.active,'unregistered regions never reuse cloud art');
view.register('ocean',{frames:[frame],width:100,opacity:24,duration:8,interval:8,bob:20});
view.update(1,'cloud',true);view.update(4,'ocean',true);assert(view.root.active);assert.equal(view.cloud.getComponent(UITransform).width,100);
view.layout(12,-30,.7);assert.equal(view.root.scale.x,.7);assert.equal(view.root.position.x,12);assert.equal(view.root.position.y,-30+(view.bottom+view.height/2)*.7);
for(const scale of [.55,.8,1]){view.layout(0,23,scale);assert(Math.abs(view.root.position.y-view.height*scale/2-(23-280*scale))<1e-8,'mask bottom follows scaled danger line');}
const modal=new Node('Modal');modal.setParent(parent);const energy=new Node('BossAttackEnergy');energy.setParent(parent);view.putBehind(energy);
assert(energy.getSiblingIndex()<view.root.getSiblingIndex());assert(view.root.getSiblingIndex()<modal.getSiblingIndex());
view.reset();assert(!view.cloud.active);assert.equal(view.opacity.opacity,0);
const second={rect:{width:800,height:300}};
view.register('cloud',{frames:[frame,second],width:250,opacity:54,duration:11,interval:9,bob:12});
view.update(0,'cloud',true);view.update(4,'cloud',true);assert.equal(view.sprite.spriteFrame,frame);
view.update(11,'cloud',true);view.update(12,'cloud',true);assert.equal(view.sprite.spriteFrame,second);
view.clearStyles();view.register('ocean',{frames:[frame],width:84,opacity:190,duration:3.8,interval:2.5,bob:7,rise:220,motion:'bubbles'});
for(let i=0;i<60;i++)view.update(.05,'ocean',true);
const active=view.bubbles.filter(b=>b.node.active);assert(active.length>=2);assert(view.bubbles.length<=10);
assert.notEqual(active[0].age,active[1].age,'staggered births');
const tracked=active[active.length-1],beforeY=tracked.node.position.y;
view.update(.05,'ocean',true);assert(tracked.node.position.y>beforeY);
const frozen=tracked.age;view.update(.05,'ocean',false);assert.equal(tracked.age,frozen);
view.spawnWait=100;for(let i=0;i<110;i++)view.update(.05,'ocean',true);
assert(view.bubbles.every(b=>!b.node.active),'independent lifetimes expire');
view.reset();assert(view.bubbles.every(b=>b.sprite.spriteFrame===null));
view.dispose();assert(!view.root.isValid);assert.equal(view.sprite.spriteFrame,null);assert.equal(view.styles.size,0);
const scene=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/games/bubble-shooter/scenes/BubbleShooter.scene'),'utf8'));
const frames=scene.find(o=>'audioSlots' in o).foregroundFrames;assert.equal(frames.length,0,'foreground frames load by current region');
console.log('Foreground: board clipping/layer order, delayed sparse passes, opacity cap, freeze/hide, region ownership and disposal passed.');
