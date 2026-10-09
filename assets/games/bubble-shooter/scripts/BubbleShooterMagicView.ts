import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { Bubble, BubbleColor, BubbleShooterModel, Point } from './BubbleShooterModel';
import { BubbleShooterRound } from './BubbleShooterRound';

/** Rune presentation owns only local nodes; gameplay and clocks remain with the session. */
export class BubbleShooterMagicView {
    private owned: Node[]=[];
    private readonly spell: Graphics;
    private readonly warning: Graphics;
    private warningTargets:Point[]=[];
    private clock=0;
    private age=1;
    private targets:Point[]=[];
    private turns:{host:Sprite;face:Node;sprite:Sprite;to:SpriteFrame;preview?:Sprite;next:SpriteFrame;changed:boolean}[]=[];
    private width=750;
    private height=1334;
    get busy():boolean{return this.age<.55;}
    constructor(parent:Node){
        const play=parent.getChildByName('Playfield')!;
        const spell=this.node('RuneSpell',play.getChildByName('Vfx')!);this.spell=spell.addComponent(Graphics);this.owned.push(spell);
        const warning=this.node('RuneWarning',play);warning.setSiblingIndex(play.getChildByName('Board')!.getSiblingIndex()+1);
        this.warning=warning.addComponent(Graphics);this.owned.push(warning);
    }
    private node(name:string,parent:Node):Node{const node=new Node(name);node.layer=parent.layer;node.setParent(parent);node.addComponent(UITransform);return node;}

    static addRune(ball:Node,next:SpriteFrame):void{
        const ring=new Node('RuneRing');ring.layer=ball.layer;ring.setParent(ball);ring.addComponent(UITransform);const g=ring.addComponent(Graphics);
        g.lineWidth=2;g.strokeColor=new Color(223,255,224);g.circle(0,0,26);g.stroke();
        for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*26,y=Math.sin(a)*26;g.fillColor=new Color(255,231,144);g.moveTo(x,y+3);g.lineTo(x+2,y);g.lineTo(x,y-3);g.lineTo(x-2,y);g.close();g.fill();}
        g.fillColor=new Color(26,37,68);g.circle(18,19,12);g.fill();g.lineWidth=2;g.strokeColor=new Color(255,228,151);g.circle(18,19,12);g.stroke();
        const preview=new Node('RuneNextColor');preview.layer=ball.layer;preview.setParent(ring);preview.setPosition(18,19);preview.addComponent(UITransform).setContentSize(19,19);const sprite=preview.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=next;
    }
    sync(round:BubbleShooterRound):void{
        const imminent=(round.stage==='ordinary'||round.stage==='boss') && (round.stage==='boss'?round.bossShots:round.runeShots)===2;
        this.warningTargets=imminent?round.board.bubbles.filter(b=>b.runeNext).map(b=>round.board.position(b)):[];
        this.drawWarning();
    }
    private drawWarning():void{
        const g=this.warning;g.clear();const pulse=.5+.5*Math.sin(this.clock*7);
        for(const p of this.warningTargets){
            g.lineWidth=2+pulse*1.5;g.strokeColor=new Color(187,244,255,130+pulse*100);g.circle(p.x,p.y,28+pulse*2);g.stroke();
            for(let i=0;i<3;i++){const a=this.clock*2.5+i*Math.PI*2/3,x=p.x+Math.cos(a)*31,y=p.y+Math.sin(a)*31;
                g.fillColor=new Color(236,200,255,235);g.moveTo(x,y+4);g.lineTo(x+2.5,y);g.lineTo(x,y-4);g.lineTo(x-2.5,y);g.close();g.fill();}
        }
    }

    cast(changed:readonly Bubble[],model:BubbleShooterModel,board:Node,frames:ReadonlyMap<BubbleColor,SpriteFrame>,delay=0):void{
        this.finishTurns();this.targets=changed.map(b=>model.position(b));this.age=-delay;
        const bubbles=model.bubbles;
        for(const bubble of changed){
            if(!bubble.runeNext)continue;
            const host=board.children[bubbles.findIndex(b=>b.row===bubble.row&&b.col===bubble.col)]?.getComponent(Sprite);
            if(!host)continue;
            const from=frames.get(bubble.runeNext)!,to=frames.get(bubble.color)!;
            const face=this.node('RuneTurningFace',host.node);face.setSiblingIndex(0);
            const size=host.node.getComponent(UITransform)!;face.getComponent(UITransform)!.setContentSize(size.width,size.height);
            const sprite=face.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=from;host.enabled=false;
            const preview=host.node.getChildByPath('RuneRing/RuneNextColor')?.getComponent(Sprite)??undefined;
            if(preview)preview.spriteFrame=to;
            this.turns.push({host,face,sprite,to,preview,next:from,changed:false});
        }
    }
    private finishTurns():void{
        for(const t of this.turns){
            if(t.host.isValid)t.host.enabled=true;
            if(t.preview?.isValid)t.preview.spriteFrame=t.next;
            if(t.face.isValid){t.face.removeFromParent();t.face.destroy();}
        }
        this.turns=[];
    }
    cancelCast():void{this.finishTurns();this.targets=[];this.age=1;this.spell.clear();this.warning.clear();this.warningTargets=[];}
    layout(width:number,height:number):void{this.width=width;this.height=height;}
    update(dt:number):void{
        this.clock+=Math.min(dt,.05);
        if(this.warningTargets.length)this.drawWarning();
        if(this.age>=.55 && !this.turns.length && !this.targets.length)return;
        this.age=Math.min(1,this.age+Math.min(dt,.05));
        const s=this.spell;s.clear();if(this.age<0)return;if(this.age>=.55){this.finishTurns();this.targets=[];return;}
        const t=this.age/.55;
        for(const turn of this.turns){
            if(!turn.face.isValid)continue;
            if(t>=.5&&!turn.changed){turn.sprite.spriteFrame=turn.to;if(turn.preview?.isValid)turn.preview.spriteFrame=turn.next;turn.changed=true;}
            const sx=Math.max(.06,Math.abs(Math.cos(t*Math.PI)));
            turn.face.setScale(sx,1+.16*Math.sin(t*Math.PI),1);
            turn.face.angle=Math.sin(t*Math.PI*2)*8;
        }
        for(const p of this.targets){s.strokeColor=new Color(188,239,255,230*(1-t));s.lineWidth=3*(1-t)+1;s.circle(p.x,p.y,22+34*t);s.stroke();
            for(let i=0;i<6;i++){const a=i*Math.PI/3+t*2,r=22+24*t,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;s.fillColor=new Color(231,204,255,240*(1-t));s.moveTo(x,y+5);s.lineTo(x+3,y);s.lineTo(x,y-5);s.lineTo(x-3,y);s.close();s.fill();}}
    }
    static decorateReward(content:Node):void{
        for(const name of ['SelectionText','Capacity']){
            const label=content.getChildByName(name)!.getComponent(Label)!;
            label.color=new Color(201,255,237);label.enableOutline=true;label.outlineColor=new Color(21,36,65);label.outlineWidth=2;
        }
    }

    dispose():void{this.cancelCast();this.owned.forEach(n=>{n.removeFromParent();n.destroy()});this.owned=[];}
}
