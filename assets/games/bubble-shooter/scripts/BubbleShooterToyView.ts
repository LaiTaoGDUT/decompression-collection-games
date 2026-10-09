import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { DIAMETER } from './BubbleShooterModel';
import { BubbleShooterRound, TOY_SHOTS_PER_ACTION, ToyRailConstruction } from './BubbleShooterRound';

/** Image-based track bed; warning light follows the next movement direction. */
export class BubbleShooterToyView {
    readonly root:Node;
    private readonly markers:Graphics;
    private clock=0;
    private tracks:{node:Node;row:number;x1:number;x2:number;y:number;direction:number;buildAge:number;fromX1:number;fromX2:number}[]=[];
    private warning=false;
    private readonly board:Node;
    constructor(parent:Node,private readonly frame:SpriteFrame){
        const play=parent.getChildByName('Playfield')!;this.board=play.getChildByName('Board')!;
        this.root=this.node('ToyRails',play);this.root.setSiblingIndex(play.getChildByName('Board')!.getSiblingIndex());
        const overlay=this.node('ToyRailMarkers',play);overlay.setSiblingIndex(play.getChildByName('Board')!.getSiblingIndex()+1);this.markers=overlay.addComponent(Graphics);
    }
    private node(name:string,parent:Node):Node{const n=new Node(name);n.layer=parent.layer;n.setParent(parent);n.addComponent(UITransform);return n;}
    sync(round:BubbleShooterRound):void{
        this.root.children.slice().forEach(n=>{n.removeFromParent();n.destroy()});this.tracks=[];
        this.root.active=round.stage==='ordinary'||round.stage==='boss';this.markers.node.active=this.root.active;
        this.warning=(round.stage==='boss'?round.bossShots:round.railShots)===TOY_SHOTS_PER_ACTION-1;
        for(const rail of round.rails){
            const a=round.board.position({row:rail.row,col:rail.start}),b=round.board.position({row:rail.row,col:rail.end});
            const n=this.node('RailBed',this.root);n.setPosition((a.x+b.x)/2,a.y);
            // Keep rail thickness visible above and below the 56 px beads; wide art is stretchable along its straight axis.
            n.getComponent(UITransform)!.setContentSize(b.x-a.x+DIAMETER+12,DIAMETER+12);
            const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.frame;
            this.tracks.push({node:n,row:rail.row,x1:a.x-DIAMETER/2,x2:b.x+DIAMETER/2,y:a.y,direction:rail.direction,buildAge:2,fromX1:a.x-DIAMETER/2,fromX2:b.x+DIAMETER/2});
        }
        this.update(0);
    }
    construct(changes:readonly ToyRailConstruction[],round:BubbleShooterRound):void {
        for(const change of changes) {
            const track=this.tracks.find(t=>t.row===change.after.row);
            if(!track)continue;
            track.buildAge=0;
            track.fromX1=change.before?round.board.position({row:change.before.row,col:change.before.start}).x-DIAMETER/2:(track.x1+track.x2)/2;
            track.fromX2=change.before?round.board.position({row:change.before.row,col:change.before.end}).x+DIAMETER/2:track.fromX1;
        }
        this.update(0);
    }
    update(dt:number):void{
        this.clock+=Math.min(dt,.05);this.root.setPosition(this.board.position);this.markers.node.setPosition(this.board.position);const g=this.markers;g.clear();
        for(const track of this.tracks){
            track.buildAge=Math.min(2,track.buildAge+Math.min(dt,.05));
            const build=Math.max(0,Math.min(1,(track.buildAge-.7)/.35)),ease=1-Math.pow(1-build,3);
            const x1=track.fromX1+(track.x1-track.fromX1)*ease,x2=track.fromX2+(track.x2-track.fromX2)*ease;
            track.node.setPosition((x1+x2)/2,track.y);
            track.node.setScale((x2-x1+12)/(track.x2-track.x1+12),1,1);
            track.node.active=x2-x1>1;
            if(!track.node.active)continue;
            const pulse=.5+.5*Math.sin(this.clock*7);
            const constructing=track.buildAge>=.7&&track.buildAge<1.3;
            track.node.getComponent(Sprite)!.color=this.warning||constructing?new Color(255,235+pulse*20,185+pulse*70):Color.WHITE;
            const direction=track.direction,end=direction===1?x2-11:x1+11;
            g.fillColor=new Color(29,99,105,240);g.circle(end,track.y,9);g.fill();
            g.lineWidth=2;g.strokeColor=new Color(255,235,181);g.moveTo(end-direction*3,track.y+4);g.lineTo(end+direction*3,track.y);g.lineTo(end-direction*3,track.y-4);g.stroke();
            if(!this.warning&&!constructing)continue;
            g.lineWidth=2+pulse*2;g.strokeColor=new Color(255,224,113,130+pulse*110);
            for(const dy of [-31,31]){g.moveTo(x1,track.y+dy);g.lineTo(x2,track.y+dy);g.stroke();}
            for(let i=0;i<4;i++){
                const u=(this.clock*1.1+i/4)%1,x=direction===1?x1+(x2-x1)*u:x2-(x2-x1)*u;
                for(const dy of [-31,31]){g.fillColor=new Color(255,250,195,240);g.circle(x,track.y+dy,3.2);g.fill();}
            }
        }
    }
    dispose():void{this.root.removeFromParent();this.root.destroy();this.markers.node.removeFromParent();this.markers.node.destroy();this.tracks=[];}
}
