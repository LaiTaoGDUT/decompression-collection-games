// Exercise the production controller: transforms, cancellation, node budget and themes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const compiler=fs.realpathSync(execFileSync('which',['tsc'],{encoding:'utf8'}).trim());
const ts=require(path.resolve(path.dirname(compiler),'../lib/typescript.js'));
class Graphics{clear(){}circle(){}stroke(){}fill(){}}
class Node{
 constructor(name='Bubble'){this.name=name;this.isValid=true;this.position={x:0,y:0};this.scale={x:1,y:1};this.layer=1;}
 setParent(p){this.parent=p;}addComponent(C){return new C();}setPosition(x,y){this.position={x,y};}setScale(x,y){this.scale={x,y};}destroy(){this.isValid=false;}
}
const exportsObject={};const output=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../assets/games/bubble-shooter/scripts/BubbleShooterJuice.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(output,{exports:exportsObject,require:n=>n==='cc'?{Node,Graphics,Color:class{},UITransform:class{}}:{DIAMETER:55}});
const {BubbleShooterJuice,JUICE}=exportsObject;
for(const theme of Object.keys(JUICE)){
 const juice=new BubbleShooterJuice(new Node());juice.theme=theme;
 const center=new Node(),neighbor=new Node(),far=new Node(),support=new Node('SupportBubble');
 neighbor.setPosition(55,0);far.setPosition(200,0);support.setPosition(-55,0);
 juice.attach([center,neighbor,far,support],{x:0,y:0});juice.update(.08);
 assert(center.scale.x>1 && center.scale.y<1,'contact visibly squashes');
 assert(neighbor.position.x>55,'adjacent bubble yields away from impact');
 assert.equal(far.position.x,200);assert.equal(support.position.x,-55);assert.equal(support.scale.x,1);
 for(let i=0;i<60;i++)juice.update(1/60);
 assert.equal(center.scale.x,1);assert.equal(center.position.y,0);assert.equal(neighbor.position.x,55);
 const art=new Node();art.setPosition(3,7);art.setScale(.8,.9);
 juice.launch(art,{x:0,y:0});juice.update(.06);assert(art.position.y<7);
 juice.clear();assert.equal(art.position.y,7);assert.equal(art.scale.x,.8);assert.equal(art.scale.y,.9);
 // Repeated launch restores the true rest transform, never accumulating recoil drift.
 for(let i=0;i<8;i++){juice.launch(art,{x:0,y:0});juice.update(.03);}juice.clear();assert.equal(art.position.y,7);
 for(let i=0;i<500;i++)juice.trail({x:i,y:0});assert(juice.marks.length<=80);
 juice.update(1);assert.equal(juice.marks.length,0);
 juice.attach([center],{x:0,y:0});center.destroy();juice.update(.1);assert.equal(juice.motions.length,0);
 juice.dispose();assert.equal(juice.node.isValid,false);
}
console.log('Shot feedback: four themes, contact/neighbor impulse, support exclusion, exact rest, repeated recoil, cancellation, bounded trails and disposal passed.');
