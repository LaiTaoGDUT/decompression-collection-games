import { setLabelBold } from '../../../services/font/FontBinding';
import { Color, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3 } from 'cc';
import type { BubbleColor, Point } from './BubbleShooterModel';
import { BUBBLE_POINTS } from './BubbleShooterRound';
import { celebrationTier } from './BubbleShooterFeedback';

export const SCORE_COLORS: Readonly<Record<BubbleColor, readonly [number, number, number]>> = {
    red: [255, 82, 94], yellow: [255, 216, 64], blue: [66, 189, 255], purple: [189, 108, 255],
};
export interface ScorePortion { color: BubbleColor; points: number; }
export const comboTier = celebrationTier;
export function comboPose(age:number,tier:number) {
    const peak=1.14+(tier-6)*.05;
    let scale=1,opacity=255,rise=0;
    if(age<0)return {scale:.25,opacity:0,rise:0,done:false};
    if(age<.22){const t=age/.22;scale=.25+(peak-.25)*(1-Math.pow(1-t,3));}
    else if(age<.34)scale=peak+(.94-peak)*(age-.22)/.12;
    else if(age<.46)scale=.94+.06*(age-.34)/.12;
    else if(age>1.12){const t=Math.min(1,(age-1.12)/.38);scale=1-.65*t;opacity=255*(1-t);rise=140*t;}
    return {scale,opacity,rise,done:age>=1.5};
}

interface FlyingScore { node: Node; x: number; y: number; }
interface Celebration {root:Node;score?:Node;scores:FlyingScore[];banner:Node;glints:Graphics;age:number;delay:number;tier:number;played:boolean;collected:boolean;x:number;y:number;}
const SCORE_HOLD = .62, SCORE_FLIGHT = .42;
/** Scores are already committed. This overlay only presents them, without locking firing. */
export class BubbleShooterComboView {
    readonly root:Node;
    private active:Celebration[]=[];
    get pending():boolean{return this.active.length>0;}
    constructor(private readonly board:Node,private readonly frames:readonly SpriteFrame[],private readonly play:(tier:number)=>void,
        private readonly target:()=>Node|undefined=()=>undefined,private readonly collect:()=>void=()=>{}){
        // A sibling of the board stays above the canopy/Boss as points fly into the HUD.
        this.root=this.node('ComboCelebrations',board.parent!,750,900);
        const pause=board.parent!.getChildByName('Pause');
        if(pause)this.root.setSiblingIndex(pause.getSiblingIndex());
        this.syncTransform();
    }
    private syncTransform():void{this.root.setPosition(this.board.position);this.root.setScale(this.board.scale);}
    private node(name:string,parent:Node,w:number,h:number):Node{
        const n=new Node(name);n.layer=parent.layer;n.setParent(parent);n.addComponent(UITransform).setContentSize(w,h);return n;
    }
    show(directCount:number,point:Point,delay:number,portions?:readonly ScorePortion[],droppedCount=0):void{
        const count=directCount+droppedCount;
        this.present(count,point,delay,portions??[{color:'red',points:count*BUBBLE_POINTS}],true);
    }
    showMatch(directCount:number,point:Point,delay:number,droppedCount=0):void {
        if(comboTier(directCount,droppedCount))this.present(directCount+droppedCount,point,delay,[],false);
    }
    private present(clearedCount:number,point:Point,delay:number,portions:readonly ScorePortion[],withScore:boolean):void {
        // The caller passes the total result of this shot; score portions remain model-owned.
        const tier=comboTier(clearedCount);if(withScore&&!portions.some(portion=>portion.points>0))return;
        const offset=Math.max(0,tier-6);
        if(this.active.length>=5){this.destroy(this.active.shift()!);}
        const frame=this.frames[offset]!,width=230+offset*24,height=width*frame.rect.height/frame.rect.width;
        const spacing=portions.length>1?100:0;
        const edge=350-Math.max(width*(1.14+offset*.05),portions.length*100)/2;
        const root=this.node('Combo-'+tier,this.root,1,1),x=Math.max(-edge,Math.min(edge,point.x)),y=Math.max(-240,Math.min(300,point.y));
        root.setPosition(x,y);
        const scores=(withScore?portions:[]).map((portion,i)=>{
            const node=this.node(i?'Score-'+portion.color:'Score',root,portions.length>1?98:250,90);
            node.addComponent(UIOpacity).opacity=0;
            const text=node.addComponent(Label);text.string='+'+portion.points;text.fontSize=tier?38+offset*6:30;text.lineHeight=78;
            setLabelBold(text, true);text.horizontalAlign=Label.HorizontalAlign.CENTER;text.verticalAlign=Label.VerticalAlign.CENTER;
            text.overflow=Label.Overflow.SHRINK;
            const rgb=SCORE_COLORS[portion.color];text.color=new Color(rgb[0],rgb[1],rgb[2]);
            text.enableOutline=true;text.outlineColor=new Color(rgb[0]*.23,rgb[1]*.23,rgb[2]*.23);text.outlineWidth=3;
            return {node,x:(i-(portions.length-1)/2)*spacing,y:tier?height*(1.14+offset*.05)/2+44:0};
        });
        const glints=this.node('ScoreStars',root,1,1).addComponent(Graphics);
        const banner=this.node('Banner',root,width,height);banner.addComponent(UIOpacity).opacity=0;
        const sprite=banner.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;banner.active=tier>0;
        this.active.push({root,score:scores[0]?.node,scores,banner,glints,age:0,delay:Math.max(0,delay),tier,played:false,collected:false,x,y});
        this.update(0);
    }
    update(dt:number):void{
        this.syncTransform();
        this.active=this.active.filter(c=>{
            c.age+=Math.max(0,Math.min(dt,.05));
            const age=c.age-c.delay,pose=comboPose(age,c.tier||6),g=c.glints;g.clear();
            if(age>=0&&!c.played){c.played=true;if(c.tier)this.play(c.tier);}
            c.banner.setScale(pose.scale,pose.scale,1);c.banner.setPosition(0,pose.rise);
            c.banner.getComponent(UIOpacity)!.opacity=pose.opacity;
            const destination=this.target();
            const end=destination?.isValid?c.root.getComponent(UITransform)!.convertToNodeSpaceAR(destination.worldPosition):new Vec3(0,240,0);
            for(const s of c.scores){
                const opacity=s.node.getComponent(UIOpacity)!;
                if(age<0){opacity.opacity=0;continue;}
                const flight=Math.max(0,Math.min(1,(age-SCORE_HOLD)/SCORE_FLIGHT));
                // A quick straight flight to the displayed number's actual center.
                const t=flight;
                s.node.setPosition(s.x+(end.x-s.x)*t,s.y+(end.y-s.y)*t);
                const pop=age<.24?.55+.45*(1-Math.pow(1-age/.24,3))+.2*Math.sin(age/.24*Math.PI):1;
                const scale=pop*(1-.7*t);s.node.setScale(scale,scale,1);
                opacity.opacity=255*Math.min(1,age/.07)*Math.min(1,(1-flight)/.12);
            }
            if(age>=0&&age<.5&&c.tier){
                const fade=1-age/.5;
                g.fillColor=new Color(255,240,192,180*fade);
                for(let i=0;i<c.tier-2;i++){
                    const a=i*Math.PI*2/(c.tier-2),r=35+age*75,x=Math.cos(a)*r,y=Math.sin(a)*r+(c.scores[0]?.y??0);
                    g.moveTo(x,y+4);g.lineTo(x+2,y);g.lineTo(x,y-4);g.lineTo(x-2,y);g.close();g.fill();
                }
            }
            if(age>=SCORE_HOLD+SCORE_FLIGHT&&!c.collected){c.collected=true;if(c.scores.length)this.collect();}
            if(!c.collected||(c.tier&&!pose.done))return true;
            this.destroy(c);return false;
        });
    }
    private destroy(c:Celebration):void{c.root.removeFromParent();c.root.destroy();}
    clear():void{for(const c of this.active)this.destroy(c);this.active=[];}
    dispose():void{this.clear();this.root.removeFromParent();this.root.destroy();}
}
