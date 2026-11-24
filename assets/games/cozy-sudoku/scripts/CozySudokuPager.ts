import { EventTouch, Mask, Node, Tween, tween, Vec3 } from 'cc';
import { cozyMapDragOffset, cozyMapReleasePage } from './CozySudokuLayout';
import { destroyTree, node, touchPoint } from './CozySudokuView';

interface PagerOptions {
    readonly index:number; readonly count:number; readonly y:number; readonly height:number;
    readonly build:(index:number,sheet:Node)=>void;
    /** A different page was committed; fires before the snap animation, as the page starts to move. */
    readonly turning:(index:number)=>void;
    readonly changed:(index:number)=>void;
    readonly scrolled:(position:number)=>void;
}
/** Three resident pages follow the finger; only the settled page updates navigation. */
export class CozySudokuPager {
    readonly viewport:Node;
    readonly track:Node;
    private current:number;
    private dead=false;
    private suppressed=false;
    private readonly sheets=new Map<number,Node>();
    private gesture?:{id:number;x:number;y:number;base:number;lastX:number;lastTime:number;velocity:number;axis:'pending'|'horizontal'|'vertical'};
    moving=false;
    dragging=false;
    get offset():number{return this.track.position.x;}
    constructor(parent:Node,private readonly options:PagerOptions){
        this.current=options.index;
        this.viewport=node('MapViewport',parent,0,options.y,750,options.height);
        this.viewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.track=node('MapTrack',this.viewport);
        this.fill();this.publishPosition();
        this.viewport.on(Node.EventType.TOUCH_START,this.begin,this,true);
        this.viewport.on(Node.EventType.TOUCH_MOVE,this.move,this,true);
        this.viewport.on(Node.EventType.TOUCH_END,this.end,this,true);
        this.viewport.on(Node.EventType.TOUCH_CANCEL,this.end,this,true);
    }
    canTap(index:number):boolean{return !this.dead&&!this.moving&&!this.dragging&&!this.suppressed&&index===this.current;}
    turn(direction:number):void {
        if(this.dead||this.moving||this.dragging)return;
        this.settle(Math.max(0,Math.min(this.options.count-1,this.current+direction)));
    }
    private fill():void {
        const first=Math.max(0,this.current-1),last=Math.min(this.options.count-1,this.current+1);
        for(const [index,sheet] of Array.from(this.sheets.entries()))if(index<first||index>last){destroyTree(sheet);this.sheets.delete(index);}
        for(let i=first;i<=last;i++){
            let sheet=this.sheets.get(i);
            if(!sheet){sheet=node('MapSheet-'+i,this.track,0,0,750,this.options.height);this.options.build(i,sheet);this.sheets.set(i,sheet);}
            sheet.setPosition((i-this.current)*750,0);
        }
    }
    private publishPosition():void {
        // A mask clips pixels, but still submits offscreen pages to the GPU.
        for(const sheet of Array.from(this.sheets.values()))sheet.active=Math.abs(sheet.position.x+this.offset)<749.99;
        this.options.scrolled(Math.max(0,Math.min(this.options.count-1,this.current-this.offset/750)));
    }
    private begin(event:EventTouch):void {
        if(this.dead||this.gesture)return;
        const p=touchPoint(this.viewport,event);if(!p)return;
        const interrupted=this.moving||Math.abs(this.offset)>1;
        Tween.stopAllByTarget(this.track);this.moving=false;this.dragging=false;this.suppressed=interrupted;
        this.gesture={id:event.getID(),x:p.x,y:p.y,base:this.offset,lastX:p.x,lastTime:Date.now(),velocity:0,axis:'pending'};
    }
    private move(event:EventTouch):void {
        const g=this.gesture;if(!g||this.dead||g.id!==event.getID())return;
        const p=touchPoint(this.viewport,event);if(!p)return;
        const dx=p.x-g.x,dy=p.y-g.y,now=Date.now();
        if(g.axis==='pending'&&Math.max(Math.abs(dx),Math.abs(dy))>12){
            g.axis=Math.abs(dx)>Math.abs(dy)*1.1?'horizontal':'vertical';this.suppressed=true;
        }
        if(g.axis!=='horizontal')return;
        this.dragging=true;
        if(now>g.lastTime)g.velocity=(p.x-g.lastX)/(now-g.lastTime);
        g.lastX=p.x;g.lastTime=now;
        this.track.setPosition(cozyMapDragOffset(g.base+dx,this.current,this.options.count),0);
        this.publishPosition();
    }
    private end(event:EventTouch):void {
        const g=this.gesture;if(!g||this.dead||g.id!==event.getID())return;
        this.move(event);this.gesture=undefined;this.dragging=false;
        const velocity=Date.now()-g.lastTime>120?0:g.velocity;
        const target=event.type===Node.EventType.TOUCH_CANCEL||g.axis==='vertical'?this.current:cozyMapReleasePage(this.offset,velocity,this.current,this.options.count);
        this.settle(target);
    }
    private settle(target:number):void {
        if(target!==this.current)this.options.turning(target);
        const x=-(target-this.current)*750;
        if(Math.abs(this.offset-x)<.1){this.completeSettle(target);return;}
        this.moving=true;
        tween(this.track).to(.24,{position:new Vec3(x,0,0)},{easing:'cubicOut',onUpdate:()=>this.publishPosition()}).call(()=>{
            this.completeSettle(target);
        }).start();
    }
    private completeSettle(target:number):void {
        if(this.dead)return;this.moving=false;
        if(target!==this.current){
            this.current=target;this.track.setPosition(0,0);this.fill();this.options.changed(target);
        }else this.track.setPosition(0,0);
        this.publishPosition();
    }
    dispose():void {
        if(this.dead)return;this.dead=true;this.gesture=undefined;this.moving=false;this.dragging=false;
        Tween.stopAllByTarget(this.track);
        this.viewport.off(Node.EventType.TOUCH_START,this.begin,this,true);
        this.viewport.off(Node.EventType.TOUCH_MOVE,this.move,this,true);
        this.viewport.off(Node.EventType.TOUCH_END,this.end,this,true);
        this.viewport.off(Node.EventType.TOUCH_CANCEL,this.end,this,true);
        this.sheets.clear();
        destroyTree(this.viewport);
    }
}
