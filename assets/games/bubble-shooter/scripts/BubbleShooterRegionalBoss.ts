import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';
import type { Point } from './BubbleShooterModel';
import type { BubbleRegionAssets } from './BubbleShooterRegionAssets';

/** Independent cutout rig and board-space spell. No timers, callbacks or gameplay mutations. */
export class BubbleShooterRegionalBoss {
    readonly root: Node;
    private readonly body: Node;
    private readonly head: Node;
    private readonly left: Node;
    private readonly right: Node;
    private readonly ornament: Node;
    private readonly spell: Graphics;
    private projectiles: Node[]=[];
    private targets: Point[]=[];
    private castAge=2;
    private clock=0;
    private readonly toy:boolean;
    get busy():boolean{return this.castAge<1.3;}
    get charging():boolean{return this.castAge<.7;}
    constructor(private readonly parent:Node, private readonly play:Node, pack:BubbleRegionAssets){
        this.toy=pack.region==='toy';
        this.root=this.node('RegionalBossRig',parent);
        if(this.toy){
            // The whole head and torso share one drawing; arms pivot at the painted shoulder sockets.
            this.body=this.part('Body',this.root,pack.part('boss/bear-v7','body'),230,14,10);
            const frame=pack.part('boss/bear-v7','body'),ui=this.body.getComponent(UITransform)!;
            ui.setAnchorPoint(.5,0);ui.setContentSize(300*frame.rect.width/frame.rect.height,300);
            this.head=this.node('BearFace',this.body);
            this.left=this.node('LeftArmPivot',this.body);this.right=this.node('RightArmPivot',this.body);
            const left=this.part('LeftArm',this.left,pack.part('boss/bear-v7','right-arm'),91,0,0);
            const right=this.part('RightArm',this.right,pack.part('boss/bear-v7','left-arm'),91,0,0);
            left.getComponent(UITransform)!.setAnchorPoint(.83,.84);
            right.getComponent(UITransform)!.setAnchorPoint(.18,.84);
            this.ornament=this.node('WindupJoint',this.body);
        } else {
            this.ornament=this.part('Tail',this.root,pack.part('boss/rig-v4','ornament'),190,-175,70);
            this.body=this.part('Body',this.root,pack.part('boss/core-v7','core'),285,0,95);
            this.left=this.node('LeftWingPivot',this.root);this.right=this.node('RightWingPivot',this.root);
            this.part('LeftWing',this.left,pack.part('boss/rig-v4','right-arm'),275,-110,15);
            this.part('RightWing',this.right,pack.part('boss/rig-v4','left-arm'),275,110,15);
            this.left.setSiblingIndex(1);this.right.setSiblingIndex(2);
            this.head=this.node('DragonMouth',this.body);
            const frame=pack.part('boss/core-v7','core'),ui=this.body.getComponent(UITransform)!;
            ui.setAnchorPoint(.5,0);ui.setContentSize(340*frame.rect.width/frame.rect.height,340);
        }
        const spell=this.node('RegionalBossSpell',play.getChildByName('Vfx')!);this.spell=spell.addComponent(Graphics);
        for(let i=0;i<12;i++){
            const projectile=this.part('SpellProjectile',spell,pack.part(this.toy?'boss/bear-v7':'boss/rig-v4','projectile'),this.toy?40:32,0,0);
            projectile.active=false;this.projectiles.push(projectile);
        }
        this.update(0,0,0);
    }
    private node(name:string,parent:Node):Node{const n=new Node(name);n.layer=parent.layer;n.setParent(parent);n.addComponent(UITransform);return n;}
    private part(name:string,parent:Node,frame:SpriteFrame,width:number,x:number,y:number):Node{
        const n=this.node(name,parent);n.setPosition(x,y);n.getComponent(UITransform)!.setContentSize(width,width*frame.rect.height/frame.rect.width);
        const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;return n;
    }
    cast(targets:readonly Point[]):void{this.targets=targets.slice(0,12).map(p=>({x:p.x,y:p.y}));this.castAge=0;}
    cancelCast():void{this.castAge=2;this.targets=[];this.spell.clear();this.projectiles.forEach(n=>n.active=false);}
    update(dt:number,hit:number,defeat:number):void{
        this.clock+=dt;this.castAge=Math.min(2,this.castAge+dt);
        const t=this.castAge,busy=this.busy;
        const charge=busy?(t<.35?t/.35:t<.55?1-(t-.35)/.2:0):0;
        const slam=busy&&t>=.5?Math.sin(Math.min(1,(t-.5)/.25)*Math.PI)*Math.exp(-Math.max(0,t-.7)*8):0;
        const hurt=hit>0?Math.sin(hit/.35*Math.PI):0;
        const idle=Math.sin(this.clock*(this.toy?2.8:1.7));
        if(this.toy){
            this.body.setPosition(14+Math.sin(this.clock*42)*hurt*5,10+idle*2+charge*8-slam*9);
            this.body.angle=idle*.6-hurt*3+defeat*4;
            this.body.setScale(1+slam*.04,1-slam*.05,1);
            this.head.setPosition(-14,235);
            this.left.setPosition(-85,125);this.right.setPosition(54,125);
            this.left.angle=idle*2-charge*35+slam*12-hurt*8;
            this.right.angle=-idle*2+charge*35-slam*12+hurt*8;
        } else {
            // Dragon's wings breathe, spread to charge, then beat as the mouth releases a storm.
            this.body.setPosition(Math.sin(this.clock*40)*hurt*5,10+idle*3+charge*5-slam*5);
            this.body.angle=idle*.6+charge*1.5-slam*2-hurt*2;
            this.body.setScale(1+charge*.025-hurt*.04,1+charge*.03+hurt*.03,1);
            this.head.setPosition(57,164);
            this.head.angle=0;
            this.left.setPosition(-112,165+idle*5+charge*12);this.right.setPosition(112,165-idle*5+charge*12);
            this.left.angle=5+idle*4-charge*14+slam*18+defeat*22;
            this.right.angle=-5-idle*4+charge*14-slam*18-defeat*22;
            this.ornament.angle=Math.sin(this.clock*1.3)*8+charge*12;
        }
        // The rig body animates above its local origin. Keep its feet at the shared ledge
        // instead of letting that rest/charge offset create a gap on tall screens.
        this.root.setPosition(0,-this.body.position.y);
        this.ornament.setScale(1+charge*.03,1+charge*.03,1);
        const tint=hurt>.1?new Color(255,215,210):Color.WHITE;
        for(const n of [this.body,this.head]){const sprite=n.getComponent(Sprite);if(sprite)sprite.color=tint;}
        const g=this.spell;g.clear();this.projectiles.forEach(n=>n.active=false);
        if(!busy || !this.parent.active)return;
        const ui=this.play.getComponent(UITransform)!;
        const origins=this.toy?[this.left,this.right].map(n=>ui.convertToNodeSpaceAR(n.children[0]!.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0,-45))))
            :[0,1].map(()=>ui.convertToNodeSpaceAR(this.head.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0,0))));
        const main=this.toy?new Color(255,200,75):new Color(143,243,255);
        if(t<.48)origins.forEach((o,j)=>{
            g.lineWidth=3;g.strokeColor=new Color(main.r,main.g,main.b,220*charge);
            g.circle(o.x,o.y,12+26*charge);g.stroke();
            for(let i=0;i<8;i++){const a=i*Math.PI/4+t*8+j,r=42-18*charge;g.fillColor=new Color(255,245,211,210*charge);g.circle(o.x+Math.cos(a)*r,o.y+Math.sin(a)*r,2+charge*3);g.fill();}
        });
        this.targets.forEach((p,i)=>{
            const origin=origins[i%2],travel=Math.max(0,Math.min(1,(t-.35)/.38));
            if(t>=.35&&t<.76){
                const node=this.projectiles[i]!;node.active=true;node.angle=this.toy?t*650:t*90;
                const arc=Math.sin(travel*Math.PI)*(i%2?-48:48);
                node.setPosition(origin.x+(p.x-origin.x)*travel+arc,origin.y+(p.y-origin.y)*travel);
                for(let k=1;k<=7;k++){const u=Math.max(0,travel-k*.035);g.fillColor=new Color(main.r,main.g,main.b,190-k*22);g.circle(origin.x+(p.x-origin.x)*u+Math.sin(u*Math.PI)*(i%2?-48:48),origin.y+(p.y-origin.y)*u,7-k*.65);g.fill();}
            }
            if(t>=.7){const u=Math.min(1,(t-.7)/.6),alpha=230*(1-u);g.strokeColor=new Color(main.r,main.g,main.b,alpha);g.lineWidth=4*(1-u)+1;
                if(this.toy){g.ellipse(p.x,p.y,24+u*65,10+u*24);g.stroke();}
                else {g.circle(p.x,p.y,22+u*43);g.stroke();g.circle(p.x,p.y,29+u*48);g.stroke();}
                for(let k=0;k<6;k++){const a=k*Math.PI/3+u,r=28+u*52,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;g.fillColor=new Color(main.r,main.g,main.b,alpha);g.moveTo(x,y+5);g.lineTo(x+3,y);g.lineTo(x,y-5);g.lineTo(x-3,y);g.close();g.fill();}
            }
        });
        if(t>=.68){const u=Math.min(1,(t-.68)/.62);g.lineWidth=5*(1-u)+1;g.strokeColor=new Color(main.r,main.g,main.b,160*(1-u));g.ellipse(0,410-u*270,340,12+u*35);g.stroke();}
    }
    dispose():void{this.cancelCast();this.root.removeFromParent();this.root.destroy();this.spell.node.removeFromParent();this.spell.node.destroy();this.projectiles=[];}
}
