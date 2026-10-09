import { Color, Graphics, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { BubbleRegion } from './BubbleShooterRound';

const color = (hex: string): Color => new Color().fromHEX(hex);
const PALETTES = {
    cloud: { ink: '#643961', muted: '#997391', primary: '#ED669E', primaryInk: '#FFFFFF', rim: '#D8A9D3', face: '#FFF6FA', shade: '#392348B8', well: '#FBE9F2', score: '#E0548C' },
    ocean: { ink: '#E1FAF1', muted: '#9ACFC9', primary: '#F0C579', primaryInk: '#183E49', rim: '#D5B77B', face: '#164A59', shade: '#061F32C8', well: '#0E3A47', score: '#F7D48D' },
    toy: { ink: '#544632', muted: '#9B805C', primary: '#E77953', primaryInk: '#FFFFFF', rim: '#AE7951', face: '#FFF0CF', shade: '#35291FBA', well: '#F5E0B6', score: '#D5603A' },
    magic: { ink: '#F5E9FF', muted: '#B9A5D6', primary: '#BDA2EF', primaryInk: '#30244C', rim: '#B9A070', face: '#30264D', shade: '#130E29D0', well: '#221A3A', score: '#DCC9FF' },
} as const;

export interface BubbleShooterModalFrames {
    readonly top: SpriteFrame;
    readonly middle: SpriteFrame;
    readonly bottom: SpriteFrame;
}

/**
 * Plain panel face (design px at 700 wide) at the bottom of each fixed header, measured from the
 * artwork below its lowest decoration. Content may rise into it instead of leaving it empty.
 * Toy keeps its approved spacing under the bear's paws.
 */
const HEADER_FACE: Record<BubbleRegion, number> = { cloud: 50, ocean: 84, toy: 0, magic: 72 };
/** Quiet central face above the fixed footer decoration, in design px at 700 wide. */
const FOOTER_FACE: Record<BubbleRegion, number> = { cloud: 85, ocean: 82, toy: 64, magic: 70 };
/** Breathing room between campaign controls and the footer's decorative edge, at 750-wide design scale. */
export const CAMPAIGN_MODAL_BOTTOM_PADDING = 48;

/** The Boss is baked into the fixed header; only the quiet middle strip stretches. */
export class BubbleShooterModalArt {
    readonly ink: Color;
    readonly muted: Color;
    readonly primaryInk: Color;
    readonly shade: Color;
    /** Hero numeral color; tuned per region for contrast against its score well. */
    readonly score: Color;
    readonly topHeight: number;
    /** Height of the header's plain face that content may occupy. */
    readonly headerFace: number;
    readonly bottomHeight: number;
    readonly footerFace: number;
    private readonly top: Node;
    private readonly middle: Node;
    private readonly bottom: Node;
    private readonly surface: Graphics;
    private readonly panel: Node;
    private readonly palette: typeof PALETTES[BubbleRegion];
    private readonly width = 700;
    constructor(private readonly parent: Node, private readonly region: BubbleRegion, frames: BubbleShooterModalFrames) {
        this.palette = PALETTES[region];
        this.ink = color(this.palette.ink); this.muted = color(this.palette.muted);
        this.primaryInk = color(this.palette.primaryInk); this.shade = color(this.palette.shade);
        this.score = color(this.palette.score);
        this.panel = this.node('RegionalPanel', this.width, 0);
        this.topHeight = this.width * frames.top.rect.height / frames.top.rect.width;
        this.headerFace = HEADER_FACE[region];
        this.bottomHeight = this.width * frames.bottom.rect.height / frames.bottom.rect.width;
        this.footerFace = FOOTER_FACE[region];
        const slice = (name: string, frame: SpriteFrame, height: number): Node => {
            const n = this.node(name, this.width, height);
            n.setParent(this.panel);
            const sprite = n.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.spriteFrame = frame;
            sprite.trim = false;
            return n;
        };
        this.top = slice('IntegratedBossTop', frames.top, this.topHeight);
        this.middle = slice('StretchMiddle', frames.middle, 1);
        this.bottom = slice('FixedBottom', frames.bottom, this.bottomHeight);
        const surface = this.node('ContentSurface', this.width, 0);
        surface.setParent(this.panel);
        this.surface = surface.addComponent(Graphics);
    }
    /** Returns the content top; all three slices share exact adjacent boundaries. */
    layout(middleHeight: number): number {
        const height = this.topHeight + middleHeight + this.bottomHeight;
        const middleTop = height / 2 - this.topHeight;
        const middleBottom = middleTop - middleHeight;
        this.panel.getComponent(UITransform)!.setContentSize(this.width, height);
        this.top.setPosition(0, height / 2 - this.topHeight / 2);
        this.middle.getComponent(UITransform)!.setContentSize(this.width, middleHeight);
        this.middle.setPosition(0, middleTop - middleHeight / 2);
        this.bottom.setPosition(0, middleBottom - this.bottomHeight / 2);
        // A painted content surface owns readability independently of the decorative
        // frame's glass/water alpha. Its fixed cap contours use the same three-slice mapping.
        this.surface.clear();
        if (this.region === 'ocean') this.paintOceanSurface(height, middleHeight);
        return middleTop;
    }
    private paintOceanSurface(height: number, middleHeight: number): void {
        const g = this.surface, scale = this.width / 1024;
        const x = (px: number): number => (px - 512) * scale;
        const y = (py: number): number => height / 2 - (py <= 480 ? py * scale
            : py <= 1300 ? this.topHeight + (py - 480) / 820 * middleHeight
            : this.topHeight + middleHeight + (py - 1300) * scale);
        const curve = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void =>
            g.bezierCurveTo(x(ax), y(ay), x(bx), y(by), x(cx), y(cy));
        g.fillColor = color(this.palette.face);
        g.moveTo(x(116), y(445));
        curve(116, 391, 178, 371, 228, 340);
        curve(285, 326, 333, 365, 418, 359);
        curve(500, 355, 600, 332, 681, 337);
        curve(775, 340, 900, 372, 902, 445);
        g.lineTo(x(902), y(1287));
        curve(902, 1320, 855, 1355, 817, 1387);
        curve(794, 1417, 782, 1423, 740, 1423);
        g.lineTo(x(279), y(1423));
        curve(247, 1423, 232, 1410, 214, 1388);
        curve(165, 1355, 116, 1324, 116, 1287);
        g.close(); g.fill();
    }
    button(name: string, primary: boolean): Node {
        const n = this.node(name, 474, primary ? 96 : 82), g = n.addComponent(Graphics);
        const w=474,h=primary?92:78,p=this.palette;
        const fill=primary?p.primary:({cloud:'#F7E4F0',ocean:'#225B68',toy:'#F3DFB7',magic:'#46365F'}[this.region]);
        if(this.region==='magic') {
            const gem=(y:number,c:string)=>{g.fillColor=color(c);g.moveTo(-w/2+20,-h/2+y);g.lineTo(w/2-20,-h/2+y);g.lineTo(w/2,y);g.lineTo(w/2-20,h/2+y);g.lineTo(-w/2+20,h/2+y);g.lineTo(-w/2,y);g.close();g.fill();};
            gem(-6,'#161126');gem(0,p.rim);
            n.getComponent(UITransform)!.setContentSize(w, h+6);
            // Inner faceted surface leaves a fine gold edge.
            g.fillColor=color(fill);g.moveTo(-w/2+22,-h/2+3);g.lineTo(w/2-22,-h/2+3);g.lineTo(w/2-4,0);g.lineTo(w/2-22,h/2-3);g.lineTo(-w/2+22,h/2-3);g.lineTo(-w/2+4,0);g.close();g.fill();
            for(const x of [-211,211])this.diamond(g,x,0,4,p.rim);
        } else {
            const radius=this.region==='cloud'?h/2:this.region==='ocean'?22:13;
            this.box(g,-w/2,-h/2-7,w,h,radius, this.region==='ocean'?'#0A303D':this.region==='toy'?'#B48655':'#D4A5CA');
            this.box(g,-w/2,-h/2,w,h,radius,fill);
            g.strokeColor=color(primary?'#FFFFFF55':p.rim);g.lineWidth=2;
            g.roundRect(-w/2+5,-h/2+5,w-10,h-10,Math.max(5,radius-4));g.stroke();
            if(this.region==='toy') for(const x of [-216,216])this.dot(g,x,0,5,primary?'#FFD1A7':'#D0AB75');
            if(this.region==='ocean') for(const x of [-216,216])this.diamond(g,x,0,4,p.rim);
        }
        return n;
    }
    /** Recessed score well in the region's control language; the divider sits at dividerY. */
    scoreWell(g: Graphics, w: number, h: number, dividerY?: number): void {
        g.clear();
        const p=this.palette,half=w/2,top=h/2;
        if(this.region==='magic') {
            const facet=(inset:number,c:string)=>{
                const cut=18-inset*.5;g.fillColor=color(c);
                g.moveTo(-half+inset+cut,top-inset);g.lineTo(half-inset-cut,top-inset);g.lineTo(half-inset,top-inset-cut);
                g.lineTo(half-inset,-top+inset+cut);g.lineTo(half-inset-cut,-top+inset);g.lineTo(-half+inset+cut,-top+inset);
                g.lineTo(-half+inset,-top+inset+cut);g.lineTo(-half+inset,top-inset-cut);g.close();g.fill();
            };
            facet(0,p.rim);facet(2,p.well);
        } else {
            const radius=this.region==='cloud'?30:this.region==='ocean'?22:13;
            this.box(g,-half,-top,w,h,radius,p.rim);
            this.box(g,-half+2,-top+2,w-4,h-4,Math.max(4,radius-2),p.well);
        }
        if(dividerY===undefined)return;
        // Hairline divider with regional end marks separates the hero score from the record.
        g.strokeColor=color(p.rim+'AA');g.lineWidth=2;g.moveTo(-half+64,dividerY);g.lineTo(half-64,dividerY);g.stroke();
        for(const x of [-half+52,half-52]) {
            if(this.region==='toy'||this.region==='cloud')this.dot(g,x,dividerY,4,p.rim);
            else this.diamond(g,x,dividerY,6,p.rim);
        }
    }
    /** Tilted tag shown when the run owns the best score. */
    recordBadge(g: Graphics, w: number, h: number): void {
        g.clear();
        const p=this.palette,r=this.region==='magic'?8:this.region==='toy'?9:h/2;
        this.box(g,-w/2,-h/2-4,w,h,r,this.region==='ocean'?'#0A303D':this.region==='toy'?'#B48655':this.region==='magic'?'#161126':'#C9487E');
        this.box(g,-w/2,-h/2,w,h,r,p.primary);
        g.strokeColor=color(p.primaryInk+'66');g.lineWidth=1.5;g.roundRect(-w/2+3,-h/2+3,w-6,h-6,Math.max(3,r-3));g.stroke();
    }
    emblem(g: Graphics, result: boolean): void {
        g.clear();
        const p=this.palette;
        this.dot(g,0,0,43,this.region==='cloud'?'#F8DEEB':this.region==='toy'?'#F3DFAF':this.region==='ocean'?'#226674':'#483861');
        g.strokeColor=color(p.rim);g.lineWidth=2;g.circle(0,0,48);g.stroke();
        if(result){
            // A finished journey seal, without suggesting victory on a lost round.
            g.strokeColor=this.ink;g.lineWidth=3;g.moveTo(-12,-24);g.lineTo(-12,25);g.stroke();
            g.fillColor=color(p.primary);g.moveTo(-9,24);g.lineTo(25,17);g.lineTo(15,5);g.lineTo(-9,10);g.close();g.fill();
            this.star(g,18,-15,6,p.rim);
        } else {
            g.strokeColor=color(p.primary);g.lineWidth=6;
            for(let i=0;i<=40;i++){
                const a=(.2+1.6*i/40)*Math.PI,x=23*Math.cos(a),y=23*Math.sin(a);
                if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
            }
            g.stroke();
            g.fillColor=color(p.primary);g.moveTo(28,-4);g.lineTo(9,-13);g.lineTo(27,-24);g.close();g.fill();
            this.star(g,0,0,10,p.rim);
        }
    }
    private node(name:string,w:number,h:number):Node {
        const n=new Node(name);n.layer=this.parent.layer;n.setParent(this.parent);n.addComponent(UITransform).setContentSize(w,h);return n;
    }
    private box(g:Graphics,x:number,y:number,w:number,h:number,r:number,c:string):void {g.fillColor=color(c);g.roundRect(x,y,w,h,r);g.fill();}
    private dot(g:Graphics,x:number,y:number,r:number,c:string):void {g.fillColor=color(c);g.circle(x,y,r);g.fill();}
    private diamond(g:Graphics,x:number,y:number,r:number,c:string):void {g.fillColor=color(c);g.moveTo(x,y+r);g.lineTo(x+r*.65,y);g.lineTo(x,y-r);g.lineTo(x-r*.65,y);g.close();g.fill();}
    private star(g:Graphics,x:number,y:number,r:number,c:string):void {
        g.fillColor=color(c);for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.28:r;const px=x+Math.sin(a)*rr,py=y+Math.cos(a)*rr;if(i===0)g.moveTo(px,py);else g.lineTo(px,py);}g.close();g.fill();
    }
}
