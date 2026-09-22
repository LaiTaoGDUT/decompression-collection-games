import { Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';

/** Region-owned background actors. Updated by the host, with no timers or input listeners. */
export class BubbleShooterOceanAmbient {
    private readonly root: Node;
    private readonly fish: Node[] = [];
    private readonly weeds: Node[] = [];
    private clock = 0;
    private width = 750;
    private playY = 0;
    private scale = 1;
    private disposed = false;

    constructor(parent: Node, fishFrame: SpriteFrame, weedFrame: SpriteFrame) {
        this.root = new Node('OceanAmbient'); this.root.layer = parent.layer; this.root.setParent(parent);
        this.root.addComponent(UITransform);
        this.root.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.root.setSiblingIndex(parent.getChildByName('Background')!.getSiblingIndex() + 1);
        for (let i=0;i<3;i++) this.fish.push(this.sprite('Fish-'+i,fishFrame,42-i*5,110+i*12));
        for (let i=0;i<2;i++) {
            const weed=this.sprite('Seaweed-'+i,weedFrame,88,165);
            weed.getComponent(UITransform)!.setAnchorPoint(.5,0);
            this.weeds.push(weed);
        }
        this.layout(750,1334,0,1);
    }
    private sprite(name: string, frame: SpriteFrame, width: number, opacity: number): Node {
        const node=new Node(name);node.layer=this.root.layer;node.setParent(this.root);
        node.addComponent(UITransform).setContentSize(width,width*frame.originalSize.height/frame.originalSize.width);
        const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;
        node.addComponent(UIOpacity).opacity=opacity;
        return node;
    }
    layout(width: number, height: number, playY: number, scale: number): void {
        if(this.disposed)return;
        this.width=width;this.playY=playY;this.scale=scale;
        this.root.getComponent(UITransform)!.setContentSize(width,height);
        this.pose();
    }
    update(dt: number): void {
        if(this.disposed || !Number.isFinite(dt) || dt<=0)return;
        this.clock+=Math.min(dt,.05);this.pose();
    }
    private pose(): void {
        this.fish.forEach((fish,i)=>{
            // Confine the slow swimming paths to side lanes; keep the central aim corridor quiet.
            const side=i===1?1:-1, phase=this.clock/(6+i*1.5)+i*2;
            const direction=side*Math.cos(phase)>=0?1:-1;
            fish.setPosition(side*(this.width*.36+Math.sin(phase)*35*this.scale),
                this.playY+(280-i*220+Math.sin(phase*1.4)*16)*this.scale);
            fish.setScale(direction*this.scale*(1+.035*Math.sin(this.clock*3+i)),this.scale,1);
            fish.angle=2*Math.sin(phase*1.4);
        });
        this.weeds.forEach((weed,i)=>{
            const side=i===0?-1:1;
            weed.setPosition(side*(this.width/2-30*this.scale),this.playY-430*this.scale);
            weed.setScale(side*this.scale,this.scale,1);
            // Fixed roots, no vertical stretching: a slow current with a smaller delayed swell.
            const current=this.clock*.65+i*1.7;
            weed.angle=side*3+Math.sin(current)*5+Math.sin(current*1.65-.8)*1.5;
        });
    }
    dispose(): void {
        if(this.disposed)return;
        this.disposed=true;
        this.root.getComponentsInChildren(Sprite).forEach(sprite=>sprite.spriteFrame=null);
        this.fish.length=0;this.weeds.length=0;
        this.root.removeFromParent();this.root.destroy();
    }
}
