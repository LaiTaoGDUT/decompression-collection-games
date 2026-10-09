import { setLabelBold } from '../../../services/font/FontBinding';
import { BlockInputEvents, Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import { BubbleShooterModalArt, CAMPAIGN_MODAL_BOTTOM_PADDING, type BubbleShooterModalFrames } from './BubbleShooterModalArt';
import { BubbleShooterModalMotion } from './BubbleShooterModalMotion';
import type { BubbleItem, BubbleRegion } from './BubbleShooterRound';
import { campaignStarConditions, type BubbleShooterCampaign } from './BubbleShooterCampaign';
import type { BubbleCampaignArtwork, CampaignIcon } from './BubbleShooterRegionAssets';

const PAGES = [
    {title:'拖动瞄准，松手发射',text:"连上至少 3 颗同色泡泡，就能消除"},
    {title:"三种道具",text:"炸弹球、万能球：点选后瞄准发射\n清底道具：点击两次确认，清除底部两行"},
    {title:"清空棋盘，挑战首领",text:"消除泡泡就能攻击首领\n获胜后可选择获得一个道具"},
] as const;

const GOAL_LAYOUT = {
    width: 520, cardTop: 112, cardHeight: 148,
    starTitleY: 292, starsTop: 320, starsHeight: 142, buttonGap: 30,
} as const;

/** Endless keeps its three-page guide; campaign teaches matching only at route level 1. */
export class BubbleShooterTutorialView {
    readonly root: Node;
    readonly content: Node;
    readonly motion: BubbleShooterModalMotion;
    private readonly art: BubbleShooterModalArt;
    private readonly shade: Graphics;
    private readonly title: Label;
    private readonly detail: Label;
    private readonly pages: Label;
    private readonly diagram: Node;
    private readonly next: Node;
    private readonly skip: Node;
    private readonly nextText: Label;
    private step = 0;
    private campaign?: { round: BubbleShooterCampaign; artwork: BubbleCampaignArtwork };
    private diagramAge = 0;
    private busy = false;
    private complete?: () => Promise<void>;
    private middleHeight = 490;
    private viewport = { width: 750, height: 1334, platform: undefined as PlatformLayoutInfo | undefined };
    private get pageCount(): number { return this.campaign ? this.campaign.round.level.routeIndex === 1 ? 2 : 1 : PAGES.length; }
    private get matchingPage(): boolean { return !!this.campaign && this.campaign.round.level.routeIndex === 1 && this.step === 0; }
    constructor(parent: Node, region: BubbleRegion, frames: BubbleShooterModalFrames,
        private readonly bubble: SpriteFrame, private readonly items: ReadonlyMap<BubbleItem,SpriteFrame>, private readonly sound:()=>void) {
        this.root=this.node('TutorialOverlay',parent,750,1334);this.root.addComponent(BlockInputEvents);
        this.shade=this.root.addComponent(Graphics);
        this.content=this.node('TutorialContent',this.root,700,1100);
        this.motion=new BubbleShooterModalMotion(this.root,this.content);
        this.art=new BubbleShooterModalArt(this.content,region,frames);
        const top=this.art.layout(this.middleHeight);
        this.title=this.label('Title',this.content,0,top-48,490,70,36);
        this.detail=this.label('Detail',this.content,0,top-129,490,90,27);
        this.diagram=this.node('Diagram',this.content,490,160);this.diagram.setPosition(0,top-264);
        this.pages=this.label('Pages',this.content,0,top-365,440,38,20);this.pages.color=this.art.muted;
        this.next=this.art.button('Next',true);this.next.setPosition(126,top-430);this.next.setScale(.55,.85,1);
        this.nextText=this.label('Text',this.next,0,0,250,56,30);this.nextText.color=this.art.primaryInk;this.nextText.node.setScale(1/.55,1/.85,1);
        this.skip=this.art.button('Skip',false);this.skip.setPosition(-165,top-430);this.skip.setScale(.4,.85,1);
        this.label('Text',this.skip,0,0,170,56,24).node.setScale(1/.4,1/.85,1);
        this.skip.getChildByName('Text')!.getComponent(Label)!.string="知道了";
        for(const [button,advance] of [[this.next,true],[this.skip,false]] as const)button.on(Node.EventType.TOUCH_END,(event:EventTouch)=>{
            event.propagationStopped=true;if(!this.visible||this.busy||this.motion.moving)return;
            this.sound();if(advance&&this.step<this.pageCount-1){this.step++;this.drawPage();}else void this.finish();
        },this);
        this.root.active=false;
    }
    get visible():boolean{return this.root.active;}
    show(complete:()=>Promise<void>):void{
        this.campaign=undefined;
        this.complete=complete;this.step=0;this.busy=false;this.root.active=true;this.drawPage();
        this.root.setSiblingIndex(this.root.parent!.children.length-1);this.motion.open();
    }
    showCampaign(round: BubbleShooterCampaign, artwork: BubbleCampaignArtwork, complete: () => Promise<void>): void {
        this.campaign={round,artwork}; this.complete=complete;this.step=0;this.busy=false;this.root.active=true;this.drawPage();
        this.root.setSiblingIndex(this.root.parent!.children.length-1);this.motion.open();
    }
    update(dt: number): void {
        this.motion.update(dt);
        if (!this.visible || !this.campaign) return;
        this.diagramAge += Math.max(0, Math.min(dt,.05));
        this.diagram.children.filter(n=>n.name.startsWith('Illustration')).forEach((n,i)=>n.angle=Math.sin(this.diagramAge*2+i)*3);
    }
    private async finish():Promise<void>{
        this.busy=true;
        try{await this.complete?.();}
        catch{if(this.root.isValid){this.busy=false;this.detail.string='请再点一次，继续游戏';}}
    }
    hide():void{this.motion.cancel();this.root.active=false;this.complete=undefined;this.busy=false;this.campaign=undefined;}
    private drawPage():void{
        this.diagramAge=0;
        this.detail.fontSize=27;this.detail.lineHeight=32;
        this.configureFlow();
        if(this.campaign){this.drawCampaignPage();return;}
        const p=PAGES[this.step];this.title.string=p.title;this.detail.string=p.text;
        this.pages.string=`${this.step+1} / 3`;this.nextText.string=this.step===2?'开始游戏':'下一步';
        this.diagram.children.slice().forEach(n=>{n.removeFromParent();n.destroy();});
        if(this.step===0){this.drawMatchingPage();}
        else if(this.step===1){
            const keys:BubbleItem[]=['bomb','wildcard','clear-bottom'];
            const names=['炸弹球','万能球',"清底道具"],descriptions=['炸开一大片','匹配任意颜色',"清除底部两行"];
            keys.forEach((key,i)=>{const x=(i-1)*162;this.sprite(key,this.items.get(key)!,x,30,86);
                this.label('Name',this.diagram,x,-38,155,38,24).string=names[i];
                const l=this.label('Use',this.diagram,x,-70,160,32,19);l.string=descriptions[i];l.color=this.art.muted;});
        }else{
            for(let i=0;i<3;i++)this.sprite('Bubble'+i,this.bubble,(i-1)*80,-26,68);
            const n=this.node('Health',this.diagram,310,26);n.setPosition(0,56);const g=n.addComponent(Graphics);
            g.fillColor=new Color(50,38,67);g.roundRect(-155,-13,310,26,13);g.fill();
            g.fillColor=new Color(245,104,145);g.roundRect(-151,-9,202,18,9);g.fill();
        }
    }
    private drawMatchingPage(): void {
        this.title.string=PAGES[0].title;this.detail.string=PAGES[0].text;
        for(let i=0;i<3;i++)this.sprite('Bubble'+i,this.bubble,(i-1)*80,22,68);
        this.label('Match',this.diagram,0,-55,430,40,24).string=this.campaign
            ? '连上至少 3 颗同色泡泡 → 消除' : '连上至少 3 颗同色泡泡 → 消除得分';
    }
    private drawCampaignPage(): void {
        const {round,artwork}=this.campaign!, level=round.level, goal=level.goal;
        this.pages.string=`${this.step+1} / ${this.pageCount}`;this.nextText.string=this.step===this.pageCount-1?'开始挑战':'下一步';
        this.diagram.children.slice().forEach(n=>{n.removeFromParent();n.destroy();});
        if(this.matchingPage){this.drawMatchingPage();return;}
        this.title.string='本关目标';
        const key:CampaignIcon=goal.kind==='boss'?'boss':goal.kind==='drop-anchors'?'anchor':goal.kind==='remove-targets'?'target':'clear';
        this.detail.string=goal.kind==='boss'?'击败首领 · 生命 '+goal.health:goal.kind==='drop-anchors'?'让 '+goal.bubbleIds.length+' 颗锚珠掉落'
            :goal.kind==='remove-targets'?'清除 '+goal.bubbleIds.length+' 颗标记泡泡':'清空全部泡泡';
        const layout=GOAL_LAYOUT, goalCenter=layout.cardTop+layout.cardHeight/2;
        const card=this.node('GoalCard',this.diagram,layout.width,layout.cardHeight);
        this.art.scoreWell(card.addComponent(Graphics),layout.width,layout.cardHeight);
        this.detail.node.setParent(card);this.detail.node.setPosition(50,24);
        this.sprite('Illustration-Goal',artwork.icons[key],-180,0,84,card);
        const budget=this.label('Budget',card,50,-40,340,34,25);
        budget.string='最多 '+level.shotBudget+' 发';budget.color=this.art.muted;
        const caption=this.label('StarRequirementsTitle',this.diagram,0,goalCenter-layout.starTitleY,layout.width,30,24);
        caption.string='星星奖励';caption.color=this.art.muted;
        const rewards=this.node('StarRequirements',this.diagram,layout.width,layout.starsHeight);
        rewards.setPosition(0,goalCenter-layout.starsTop-layout.starsHeight/2);
        const surface=rewards.addComponent(Graphics),half=layout.width/2;
        surface.fillColor=new Color(this.art.muted.r,this.art.muted.g,this.art.muted.b,16);
        surface.roundRect(-half,-layout.starsHeight/2,layout.width,layout.starsHeight,18);surface.fill();
        surface.strokeColor=new Color(this.art.muted.r,this.art.muted.g,this.art.muted.b,46);surface.lineWidth=1.5;
        for(const x of [-layout.width/6,layout.width/6]){
            surface.moveTo(x,-layout.starsHeight/2+18);surface.lineTo(x,layout.starsHeight/2-18);
        }
        surface.stroke();
        campaignStarConditions(level).forEach((condition,index)=>{
            const tier=this.node('StarReward-'+(index+1),rewards,layout.width/3,layout.starsHeight);
            tier.setPosition((index-1)*layout.width/3,0);
            this.sprite('RewardStar',artwork.icons.star,0,24,62,tier);
            this.label('TierCondition',tier,0,-38,154,34,24).string=condition;
        });
    }
    private configureFlow(): void {
        const single=!!this.campaign && this.pageCount===1;
        const objective=!!this.campaign&&!this.matchingPage;
        const fullButton=single||objective;
        const buttonHeight=this.next.getComponent(UITransform)!.height*(fullButton?1:.85);
        const campaignButtonOffset=objective?GOAL_LAYOUT.starsTop+GOAL_LAYOUT.starsHeight+GOAL_LAYOUT.buttonGap+buttonHeight/2:464;
        const campaignContentHeight=campaignButtonOffset+buttonHeight/2+CAMPAIGN_MODAL_BOTTOM_PADDING;
        this.middleHeight=this.campaign ? campaignContentHeight-this.art.headerFace-this.art.footerFace : 490;
        const top=this.art.layout(this.middleHeight)+(this.campaign?this.art.headerFace:0);
        this.title.node.setPosition(0,top-48);this.title.fontSize=objective?40:36;
        // Move the shared label out before rebuilding the previous page's diagram.
        this.detail.node.setParent(this.content);this.detail.node.setPosition(0,top-129);
        this.detail.node.getComponent(UITransform)!.setContentSize(objective?340:490,objective?76:90);
        this.detail.fontSize=objective?32:27;this.detail.lineHeight=objective?38:32;
        this.diagram.setPosition(0,top-(objective?GOAL_LAYOUT.cardTop+GOAL_LAYOUT.cardHeight/2:this.campaign?260:264));
        this.pages.node.active=!fullButton;this.pages.node.setPosition(0,top-(this.campaign?385:365));
        this.skip.active=!fullButton;this.skip.setPosition(-165,top-(this.campaign?campaignButtonOffset:430));
        this.next.setPosition(fullButton?0:126,top-(this.campaign?campaignButtonOffset:430));
        this.next.setScale(fullButton?1:.55,fullButton?1:.85,1);
        this.nextText.node.setScale(fullButton?1:1/.55,fullButton?1:1/.85,1);
        this.nextText.node.getComponent(UITransform)!.setContentSize(fullButton?430:250,56);
        this.layout(this.viewport.width,this.viewport.height,this.viewport.platform);
    }
    layout(width:number,height:number,platform?:PlatformLayoutInfo):void{
        this.viewport={width,height,platform};
        const safe=calculateVerticalSafeBounds(height,platform),panelHeight=this.art.topHeight+this.middleHeight+this.art.bottomHeight;
        this.root.getComponent(UITransform)!.setContentSize(width,height);
        this.content.getComponent(UITransform)!.setContentSize(700,panelHeight);
        this.shade.clear();this.shade.fillColor=this.art.shade;this.shade.rect(-width/2,-height/2,width,height);this.shade.fill();
        this.motion.layout(Math.max(.001,Math.min(1,width/750,(safe.topY-safe.bottomY-28)/panelHeight)),(safe.topY+safe.bottomY)/2);
    }
    dispose():void{this.hide();this.next.targetOff(this);this.skip.targetOff(this);this.root.getComponentsInChildren(Sprite).forEach(s=>s.spriteFrame=null);this.root.destroy();}
    private sprite(name:string,frame:SpriteFrame,x:number,y:number,height:number,parent:Node=this.diagram):void{
        const n=this.node(name,parent,height*frame.rect.width/frame.rect.height,height);n.setPosition(x,y);
        const s=n.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frame;
    }
    private node(name:string,parent:Node,w:number,h:number):Node{const n=new Node(name);n.layer=parent.layer;n.setParent(parent);n.addComponent(UITransform).setContentSize(w,h);return n;}
    private label(name:string,parent:Node,x:number,y:number,w:number,h:number,size:number):Label{
        const n=this.node(name,parent,w,h);n.setPosition(x,y);const l=n.addComponent(Label);
        l.fontSize=size;l.lineHeight=size+9;l.color=this.art.ink;setLabelBold(l, true);l.overflow=Label.Overflow.SHRINK;
        l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;return l;
    }
}
