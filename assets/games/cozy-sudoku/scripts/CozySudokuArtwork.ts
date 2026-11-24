import { EventTouch, Font, Label, Node, Sprite, SpriteFrame, tween, Tween, UITransform, Vec2, Vec3 } from 'cc';
import { node, text as createText } from './CozySudokuView';
import { COZY_THEME as T } from './CozySudokuTheme';
import { COZY_ART } from './CozySudokuArtCatalog';
import { COZY_MAP_SCENERY, cozySceneryPieces } from './CozySudokuScenery';

/** Only artwork used by the shipped screens. Retired panel/skin variants stay out of GPU memory. */
export function cozyArtworkRequests(): {key:string;path:string;type:'frame'}[] {
    const keys=[
        'gameplay-top','gameplay-bottom','map-top','map-bottom','rule-classic-4','rule-classic-9',
        'guide-arrow','stamp','cell-selected','key','key-selected','key-wide','key-wide-selected',
        'hint','note','help-button','undo','erase','lock','panel-victory','best-badge','back','pause',
        'inset','secondary-cream','sage-button','secondary-gray','secondary-peach','badge','rule-brush',
        'cell-highlight','dot-black','dot-white','panel-exact-thermo','panel-exact-kropki',
        'panel-exact-arrow','panel-exact-victory','panel-exact-pause','page-route','rule-loop',
        'map-primary','map-title','rule-tag','level-active','level','check','nav-left','nav-right','close',
        'thermo-pipe','arrow-circle','thermo-bulb','number-backing','arrow-head','thermo-joint',
        'diagonal-band','parity-odd','parity-even','inequality-sign',
    ];
    for(let value=1;value<=9;value++)keys.push('digit-'+value,'digit-'+value+'-green');
    for(let theme=0;theme<COZY_MAP_SCENERY.length;theme++)for(const piece of cozySceneryPieces(theme,1))keys.push(piece.key);
    return Array.from(new Set(keys)).map(key=>({key,path:COZY_ART[key],type:'frame'}));
}

/** Scene-owned bitmap artwork. No shared mutable skin state or generated-shape fallbacks. */
export class CozySudokuArtwork {
    constructor(private readonly frames: Readonly<Record<string, SpriteFrame>>, private readonly font: Font,
        private readonly tapped: () => void = () => {}) {}
    image(parent: Node, key: string, x: number, y: number, width: number, height: number, sliced = false): Sprite {
        const frame = this.frames[key];
        if (!frame) throw new Error(`Missing Cozy Sudoku artwork: ${key}`);
        const sprite = node('Art-'+key,parent,x,y,width,height).addComponent(Sprite);
        sprite.spriteFrame=frame; sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        sprite.type=sliced?Sprite.Type.SLICED:Sprite.Type.SIMPLE;
        // SpriteFrame assignment applies the imported native size before CUSTOM
        // takes effect. Restore the requested UI dimensions after configuration.
        if(sliced) {
            // Slice horizontally at the authored height, then scale uniformly.
            // Compressing the vertical center of a paper capsule creates pinched
            // pointed ends even though its original silhouette is rounded.
            const scale=height/frame.originalSize.height;
            sprite.node.getComponent(UITransform)!.setContentSize(width/scale,frame.originalSize.height);
            sprite.node.setScale(scale,scale,1);
        } else sprite.node.getComponent(UITransform)!.setContentSize(width,height);
        return sprite;
    }
    digit(parent:Node,value:number,x:number,y:number,height:number,entered=false):Sprite {
        const key='digit-'+value+(entered?'-green':'');
        const frame=this.frames[key];
        return this.image(parent,key,x,y,height*frame.originalSize.width/frame.originalSize.height,height);
    }
    text(parent:Node,name:string,value:string,x:number,y:number,size=24,width=600,height=50,color:string=T.ink,bold=false):Label {
        const label=createText(parent,name,value,x,y,size,width,height,color,bold);
        label.font=this.font;label.useSystemFont=false;label.isBold=bold;
        // This handwritten font has a smaller ink/em ratio than the reference's
        // face. Reserve ink size explicitly without shrinking it via lineHeight.
        label.fontSize=size*1.25;label.lineHeight=Math.ceil(size*1.25);
        label.node.getComponent(UITransform)!.setContentSize(width,height);
        return label;
    }
    paper(parent:Node,name:string,x:number,y:number,w:number,h:number,fill:string=T.paper,radius=24):Node {
        const root=node(name,parent,x,y,w,h);
        // Inset/data cards use the same authored paper surface as the source buttons.
        this.image(root,name==='NewRuleBadge'?'badge':fill===T.sage?'sage-button':'inset',0,0,w,h,true);
        return root;
    }
    panel(parent:Node,name:string,width:number,height:number,kind:'victory'|'pause'='victory'):Node {
        const root=node(name,parent,0,0,width,height);
        this.image(root,'panel-'+kind,0,0,width,height);
        return root;
    }
    tape(parent:Node,x:number,y:number,fill:string=T.peach):void {
        this.image(parent,fill===T.sageLight?'tape-sage':'tape-peach',x,y,155,44).node.angle=-4;
    }
    icon(parent:Node,kind:string,x=0,y=0,color:string=T.ink,size=60):void {
        this.image(parent,kind,x,y,size,size);
    }
    /** `tapSound` is off for controls whose action plays its own gameplay cue. */
    hit(parent:Node,name:string,x:number,y:number,w:number,h:number,action:()=>void,tapSound=true):Node {
        const root=node(name,parent,x,y,Math.max(64,w),Math.max(64,h));
        root.on(Node.EventType.TOUCH_START,()=>{Tween.stopAllByTarget(root);root.setScale(.97,.97,1);});
        root.on(Node.EventType.TOUCH_CANCEL,()=>root.setScale(1,1,1));
        root.on(Node.EventType.TOUCH_END,(event:EventTouch)=>{
            Tween.stopAllByTarget(root);root.setScale(1,1,1);
            // A swipe across a page or button is never a click on the release point.
            if(Vec2.distance(event.getUIStartLocation(),event.getUILocation())>24)return;
            if(tapSound)this.tapped();
            action();
        });
        return root;
    }
    button(parent:Node,name:string,title:string,x:number,y:number,w:number,h:number,action:()=>void,primary=false,glyph?:string,tapSound=true):Node {
        const root=this.hit(parent,name,x,y,w,h,action,tapSound);
        if(glyph==='back'||glyph==='pause') {
            this.image(root,'key',0,0,w,h);
            const height=h*.48,frame=this.frames[glyph];
            this.image(root,glyph,0,0,height*frame.originalSize.width/frame.originalSize.height,height);
        }
        else {
            const skin=primary?'sage-button':name==='Restart'?'secondary-gray':name==='VictoryMap'?'secondary-peach':w>180?'secondary-cream':'key';
            this.image(root,skin,0,0,w,h,w>120);
            if(title)this.text(root,'Caption',title,0,0,primary?52:30,w-20,h-8,primary?T.white:T.ink,true);
            if(glyph)this.icon(root,glyph);
        }
        return root;
    }
    tool(parent:Node,name:string,title:string,glyph:string,x:number,y:number,action:()=>void,tapSound=true):Node {
        const root=this.hit(parent,name,x,y,128,108,action,tapSound);
        this.image(root,glyph,0,20,glyph==='hint'?80:64,glyph==='hint'?74:64);
        this.text(root,'ToolCaption',title,0,-33,27,125,40,T.ink,true);
        return root;
    }
}
