import { Color, Graphics, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { BubbleRegionAssets } from './BubbleShooterRegionAssets';

/** Atmospheric layers follow the session clock. Foreground actors use BoardForeground. */
export class BubbleShooterRegionalAmbient {
    readonly back:Node;
    readonly front:Node;
    private clock=0;
    private width=750;
    private top=630;
    private bottom=-630;
    private readonly toy:boolean;
    private readonly motes:Graphics;
    private flyers:Node[]=[];
    private drift:Node[]=[];
    private rearMist:Node[]=[];
    constructor(parent:Node,pack:BubbleRegionAssets){
        this.toy=pack.region==='toy';
        this.back=this.node('RegionalBackgroundMotion',parent);
        this.back.setSiblingIndex(parent.getChildByName('Background')!.getSiblingIndex()+1);
        this.front=this.node('RegionalForegroundMotion',parent);
        this.front.setSiblingIndex(parent.getChildByName('Playfield')!.getSiblingIndex()+1);
        for(const root of [this.back,this.front])root.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.motes=this.node('AtmosphericMotes',this.back).addComponent(Graphics);
        if(!this.toy){
            const get=(key:string)=>pack.part('decoration/ambient-v3',key);
            for(let i=0;i<3;i++)this.flyers.push(this.sprite('BackgroundMoth',this.back,get('flyer'),38+i*5,155));
            for(let i=0;i<2;i++){
                this.rearMist.push(this.sprite('BackgroundMist',this.back,get('drift'),500,65));
                this.drift.push(this.sprite('ForegroundMist',this.front,get('drift'),380,80));
            }
        }
        this.layout(750,1334,630,-630,430);
    }
    private node(name:string,parent:Node):Node{const n=new Node(name);n.layer=parent.layer;n.setParent(parent);n.addComponent(UITransform);return n;}
    private sprite(name:string,parent:Node,frame:SpriteFrame,width:number,opacity:number):Node{
        const n=this.node(name,parent);n.getComponent(UITransform)!.setContentSize(width,width*frame.rect.height/frame.rect.width);
        const s=n.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frame;n.addComponent(UIOpacity).opacity=opacity;return n;
    }
    layout(width:number,height:number,top:number,bottom:number,_canopyY:number):void{
        this.width=width;this.top=top;this.bottom=bottom;
        for(const root of [this.back,this.front])root.getComponent(UITransform)!.setContentSize(width,height);
    }
    setVisible(visible:boolean):void { this.front.active=this.back.active=visible; }
    update(dt:number,visible:boolean):void{
        this.setVisible(visible);if(!visible)return;
        this.clock+=Math.max(0,Math.min(dt,.05));const t=this.clock,span=this.top-this.bottom;
        const g=this.motes;g.clear();
        for(let i=0;i<(this.toy?18:12);i++){
            const u=(i*.173+t*(this.toy?.008:.016))%1;
            const x=Math.sin(i*2.4+t*.13)*this.width*.44,y=this.bottom+130+u*(span-230);
            const a=(this.toy?65:100)*(.45+.55*Math.sin(i+t*.9)**2);
            g.fillColor=this.toy?new Color(255,238,191,a*.3):new Color(132,239,223,a*.3);g.circle(x,y,this.toy?5:6);g.fill();
            g.fillColor=this.toy?new Color(255,247,213,a):new Color(179,255,232,a);g.circle(x,y,this.toy?1.5:2.3);g.fill();
        }
        this.flyers.forEach((n,i)=>{
            const u=(t/(20+i*3)+i*.32)%1,side=i%2?1:-1;
            n.setPosition(side*(-this.width*.4+this.width*.8*u),this.bottom+330+i*155+Math.sin(t*.7+i)*35);
            n.setScale(side*(.6+.4*Math.abs(Math.sin(t*7+i))),1,1);n.angle=Math.sin(t*1.5+i)*8;
        });
        this.drift.forEach((n,i)=>{
            n.setPosition((i%2?1:-1)*(this.width*.44+Math.sin(t*.25+i)*45),this.bottom+370+i*260+Math.sin(t*.4+i)*25);
            n.setScale(i?-1:1,1,1);n.getComponent(UIOpacity)!.opacity=65+Math.sin(t*.5+i)*20;
        });
        this.rearMist.forEach((n,i)=>{
            n.setPosition(Math.sin(t*.2+i*3)*this.width*.23,this.bottom+280+i*320+Math.sin(t*.3+i)*20);
            n.setScale(i?-1:1,1,1);
        });
    }
    dispose():void{for(const n of [this.back,this.front]){n.removeFromParent();n.destroy()}this.flyers=[];this.drift=[];this.rearMist=[];}
}
