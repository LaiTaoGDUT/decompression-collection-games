// Exercise production animation clocks without a renderer; browser visual review remains separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const compiler=fs.realpathSync(execFileSync('which',['tsc'],{encoding:'utf8'}).trim());
const ts=require(path.resolve(path.dirname(compiler),'../lib/typescript.js'));
class Color{constructor(...v){this.v=v}};Color.WHITE=new Color(255,255,255);
class Node {constructor(){this.active=true;this.isValid=true;this.position={x:0,y:0};this.scale={x:1,y:1};this.opacity={opacity:255};this.angle=0;}getComponent(){return this.opacity}addComponent(){return this.opacity}setPosition(x,y){this.position={x,y}}setScale(x,y){this.scale={x,y}}}
const cc={Node,Color,Component:class{},UIOpacity:class{},_decorator:{ccclass:()=>c=>c,property:()=>()=>{}}};
const root=path.resolve(__dirname,'../../assets/games/bubble-shooter/scripts');
function load(file){const exports={};const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;vm.runInNewContext(output,{exports,require:n=>n==='cc'?cc:{},console});return exports;}
(async()=>{
 const {BubbleShooterModalMotion}=load('BubbleShooterModalMotion.ts');
 const rootNode=new Node(),panel=new Node(),motion=new BubbleShooterModalMotion(rootNode,panel);motion.layout(.8,17);motion.open();
 assert(Math.abs(panel.scale.x-.88*.8)<1e-9);assert(Math.abs(panel.scale.y-.74*.8)<1e-9);
 for(let i=0;i<5;i++)motion.update(.05);assert(!motion.moving);assert.equal(panel.position.y,17);assert.equal(rootNode.opacity.opacity,255);
 const closed=motion.close();for(let i=0;i<4;i++)motion.update(.05);assert(await closed);assert.equal(rootNode.opacity.opacity,0);
 motion.open();const cancelled=motion.close();motion.cancel();assert.equal(await cancelled,false);
 const {BubbleShooterRewardView}=load('BubbleShooterRewardView.ts');
 const reward=Object.create(BubbleShooterRewardView.prototype);reward.header=new Node();reward.headerAge=0;reward.updateHeader();assert(reward.header.position.y>1000);
 reward.headerAge=.32;reward.updateHeader();assert.equal(reward.header.position.y,215);
 reward.headerAge=.44-1e-8;reward.updateHeader();assert(reward.header.scale.y<.85&&reward.header.scale.x>1.05);
 reward.headerAge=.56-1e-8;reward.updateHeader();assert(reward.header.scale.y>1.05);
 reward.headerAge=.72;reward.updateHeader();assert.equal(reward.header.scale.x,1);assert.equal(reward.header.scale.y,1);
 const {BubbleShooterGame}=load('BubbleShooterGame.ts');const game=Object.create(BubbleShooterGame.prototype),pivot=new Node(),board=new Node();
 game.node={getChildByPath:p=>p.endsWith('TurretPivot')?pivot:board};game.turretReturn={from:-60,elapsed:0};game.rowBirths=[];
 game.updatePresentation(.12);assert(pivot.angle<0&&pivot.angle>-60);game.updatePresentation(.12);assert(Math.abs(pivot.angle)<1e-9);assert.equal(game.turretReturn,undefined);
 const ball=new Node();board.setPosition(0,40);game.transition=.3;game.rowBirths=[{node:ball,elapsed:0,delay:0,y:410}];
 game.updatePresentation(.08);assert(ball.scale.x>0&&ball.scale.x<1);assert.equal(ball.position.y+board.position.y,410);assert(ball.opacity.opacity>0&&ball.opacity.opacity<255);
 board.setPosition(0,0);game.transition=0;game.updatePresentation(.5);assert.equal(game.rowBirths.length,0);assert.equal(ball.scale.x,1);assert.equal(ball.opacity.opacity,255);assert.equal(ball.position.y,410);
 console.log('Production clocks: Watermelon-style open/close and cancellation, celebration drop/squash/rebound, smooth turret return, centered row birth and cleanup passed.');
})().catch(e=>{console.error(e);process.exit(1)});
