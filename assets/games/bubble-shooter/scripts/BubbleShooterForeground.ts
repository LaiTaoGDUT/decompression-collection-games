import { Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { BOARD_WIDTH, TOP, DANGER, DIAMETER } from './BubbleShooterModel';

export interface BoardForegroundStyle {
    frames: readonly SpriteFrame[]; width: number; opacity: number;
    duration: number; interval: number; bob: number; rise?: number; motion?: 'bubbles';
}
/** Region-owned foreground above all playfield children, clipped to the gameplay area. No input listeners. */
export class BubbleShooterForeground {
    private readonly root: Node;
    private readonly cloud: Node;
    private readonly opacity: UIOpacity;
    private readonly sprite: Sprite;
    private readonly styles = new Map<string, BoardForegroundStyle>();
    private style?: BoardForegroundStyle;
    private theme = '';
    private wait = 4;
    private age = -1;
    private pass = 0;
    private bubbles: {node:Node; sprite:Sprite; opacity:UIOpacity; age:number; life:number; x:number; y:number; speed:number; size:number; wobble:number; phase:number}[] = [];
    private spawnWait = .6;
    private readonly bottom = DANGER;
    private readonly height = TOP + DIAMETER / 2 - this.bottom;
    constructor(parent: Node) {
        this.root=new Node('BoardForeground');this.root.layer=parent.layer;this.root.setParent(parent);
        this.root.addComponent(UITransform).setContentSize(BOARD_WIDTH,this.height);
        this.root.setPosition(0,this.bottom+this.height/2);
        this.root.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.root.setSiblingIndex(parent.children.length-1);
        this.cloud=new Node('DriftingDecoration');this.cloud.layer=parent.layer;this.cloud.setParent(this.root);
        this.cloud.addComponent(UITransform);this.sprite=this.cloud.addComponent(Sprite);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        this.opacity=this.cloud.addComponent(UIOpacity);this.cloud.active=false;
    }
    layout(x: number, y: number, scale: number): void {
        this.root.setScale(scale,scale,1);
        this.root.setPosition(x,y+(this.bottom+this.height/2)*scale);
    }
    putBehind(node: Node): void {node.setSiblingIndex(this.root.getSiblingIndex());}
    register(theme: string, style: BoardForegroundStyle): void {
        this.styles.set(theme,style);
        if(this.theme===theme)this.style=style;
    }
    clearStyles(): void {
        this.reset();this.styles.clear();this.style=undefined;this.theme='';this.sprite.spriteFrame=null;this.root.active=false;
    }
    update(dt: number, theme: string, enabled: boolean): void {
        if(theme!==this.theme){this.reset();this.theme=theme;this.style=this.styles.get(theme);}
        this.root.active=enabled && !!this.style?.frames.length;
        if(!enabled || !this.style?.frames.length)return;
        const style=this.style;
        if(style.motion==='bubbles'){this.updateBubbles(Math.max(0,Math.min(dt,.05)),style);return;}
        if(this.age<0){
            this.wait-=dt;if(this.wait>0)return;
            this.age=0;this.pass++;this.cloud.active=true;this.sprite.spriteFrame=style.frames[(this.pass-1)%style.frames.length]!;
            this.cloud.getComponent(UITransform)!.setContentSize(style.width,style.width*this.sprite.spriteFrame!.rect.height/this.sprite.spriteFrame!.rect.width);
        }
        this.age+=dt;const t=Math.min(1,this.age/style.duration);
        const direction=this.pass%2?1:-1;
        const extent=(BOARD_WIDTH+style.width)/2;
        const band=[.27,-.02,.14,-.20][this.pass%4]!;
        this.cloud.setPosition(direction*(-extent+extent*2*t),this.height*band+Math.sin(t*Math.PI*2)*style.bob+(t-.5)*(style.rise??0));
        this.cloud.setScale(direction,1,1);
        this.opacity.opacity=style.opacity*Math.min(1,t/.18,(1-t)/.18);
        if(t===1){this.cloud.active=false;this.age=-1;this.wait=style.interval+(this.pass%3)*1.5;}
    }
    private updateBubbles(dt:number,style:BoardForegroundStyle):void {
        this.spawnWait-=dt;
        if(this.spawnWait<=0){
            this.spawnWait=.18+Math.random()*.65;
            let b=this.bubbles.find(b=>!b.node.active);
            if(!b && this.bubbles.length<10){
                const node=new Node('RisingBubble');node.layer=this.root.layer;node.setParent(this.root);
                node.addComponent(UITransform);const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
                b={node,sprite,opacity:node.addComponent(UIOpacity),age:0,life:0,x:0,y:0,speed:0,size:0,wobble:0,phase:0};this.bubbles.push(b);
            }
            if(b){
                b.node.active=true;b.sprite.spriteFrame=style.frames[0]!;b.age=0;
                b.life=2.3+Math.random()*2.4;b.size=12+Math.random()*25;
                b.speed=38+b.size*1.1+Math.random()*22;
                b.x=(Math.random()-.5)*(BOARD_WIDTH-90);
                b.y=-this.height*.40+Math.random()*this.height*.38;
                b.wobble=3+Math.random()*8;b.phase=Math.random()*Math.PI*2;
                b.node.getComponent(UITransform)!.setContentSize(b.size,b.size);
            }
        }
        for(const b of this.bubbles){
            if(!b.node.active)continue;
            b.age+=dt;
            if(b.age>=b.life){b.node.active=false;b.sprite.spriteFrame=null;continue;}
            const born=Math.min(1,b.age/.14),fade=Math.min(1,(b.life-b.age)/.65);
            b.node.setPosition(b.x+Math.sin(b.phase+b.age*1.8)*b.wobble,b.y+b.age*b.speed);
            b.node.setScale(.65+.35*born,.65+.35*born,1);
            b.opacity.opacity=style.opacity*born*fade;
        }
    }
    reset(): void {
        this.age=-1;this.wait=4;this.pass=0;this.spawnWait=.6;this.cloud.active=false;this.opacity.opacity=0;
        this.bubbles.forEach(b=>{b.node.active=false;b.sprite.spriteFrame=null;});
    }
    dispose(): void {this.reset();this.bubbles=[];this.styles.clear();this.style=undefined;this.sprite.spriteFrame=null;this.root.destroy();}
}
