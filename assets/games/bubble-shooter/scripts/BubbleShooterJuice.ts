import { Color, Graphics, Node, UITransform } from 'cc';
import { DIAMETER, type Point } from './BubbleShooterModel';

export type JuiceTheme = 'cloud' | 'ocean' | 'toy' | 'magic';
export const JUICE = {
    cloud: { spring: .46, strength: 1, tint: [255, 211, 232], rings: 1 },
    ocean: { spring: .62, strength: .82, tint: [139, 244, 255], rings: 2 },
    toy: { spring: .38, strength: 1.15, tint: [255, 218, 115], rings: 1 },
    magic: { spring: .5, strength: .92, tint: [211, 174, 255], rings: 2 },
} as const;

/** A finite, damped impulse; returns exactly to rest, independent of frame rate. */
export function contactPulse(age: number, duration: number): number {
    if (age <= 0 || age >= duration) return 0;
    const t = age / duration;
    return Math.sin(t * Math.PI * 3) * (1-t) ** 2;
}
interface Motion { node: Node; age: number; delay: number; duration: number; x: number; y: number;
    sx: number; sy: number; dx: number; dy: number; squeeze: number; }
interface Mark { x: number; y: number; age: number; life: number; radius: number; ring: boolean; vx?: number; vy?: number; water?: boolean; }

/** Visual-only feedback. No timers, physics mutations, or per-frame node allocation. */
export class BubbleShooterJuice {
    private motions: Motion[] = [];
    private marks: Mark[] = [];
    private readonly node: Node;
    private readonly ink: Graphics;
    theme: JuiceTheme = 'cloud';
    constructor(parent: Node) {
        this.node = new Node('ShotFeedback'); this.node.layer = parent.layer; this.node.setParent(parent);
        this.node.addComponent(UITransform); this.ink = this.node.addComponent(Graphics);
    }
    private move(node: Node, dx: number, dy: number, squeeze: number, delay = 0): void {
        this.motions.push({node, age: 0, delay, duration: JUICE[this.theme].spring,
            x: node.position.x, y: node.position.y, sx: node.scale.x, sy: node.scale.y, dx, dy, squeeze});
    }
    launch(art: Node, point: Point): void {
        this.restore(art);
        this.move(art, 0, this.theme==='ocean'?-6:-13, this.theme==='ocean'?.045:.14);
        this.ripple(point, .6);
        if(this.theme==='ocean')this.splash(point,true);
    }
    attach(nodes: readonly Node[], point: Point, visualPoint: Point = point): void {
        const strength = JUICE[this.theme].strength;
        nodes.forEach(node => {
            if (node.name === 'SupportBubble') return;
            const dx = node.position.x-point.x, dy = node.position.y-point.y, distance = Math.hypot(dx,dy);
            if (distance > DIAMETER * 2.1) return;
            const direct = distance < DIAMETER * .25;
            const water=this.theme==='ocean';
            const force = direct ? 0 : (water?12:7) * strength * Math.max(0,1-distance/(DIAMETER*2.4));
            this.move(node, direct ? 0 : dx/distance*force, direct ? -4 : dy/distance*force,
                direct ? (water?.09:.24) : (water?.05:.12) * strength, direct ? 0 : distance/DIAMETER*(water?.07:.035));
        });
        this.ripple(visualPoint, .85);
        if(this.theme==='ocean')this.splash(visualPoint,false);
    }
    private splash(point: Point, launch: boolean): void {
        for(let i=0;i<7 && this.marks.length<80;i++) {
            const angle=launch?Math.PI*(.2+i*.1):i*Math.PI*2/7;
            this.marks.push({x:point.x,y:point.y,age:-i*.015,life:.48+i*.025,radius:3+i%3,
                ring:true,water:true,vx:Math.cos(angle)*(launch?65:100),vy:Math.sin(angle)*(launch?125:85)});
        }
    }
    trail(point: Point): void {
        if (this.marks.length >= 80) return;
        this.marks.push({x:point.x,y:point.y,age:0,life:this.theme==='ocean'?.38:.18,radius:DIAMETER*.14,ring:this.theme==='ocean',water:this.theme==='ocean',vy:28});
    }
    ripple(point: Point, power = 1): void {
        for (let i=0;i<JUICE[this.theme].rings && this.marks.length<80;i++)
            this.marks.push({x:point.x,y:point.y,age:-i*.07,life:.32+i*.06,radius:DIAMETER*.7*power,ring:true});
    }
    update(dt: number): void {
        this.motions=this.motions.filter(m=>{
            if (!m.node.isValid) return false;
            m.age+=dt; const age=m.age-m.delay;
            const pulse=contactPulse(age,m.duration);
            m.node.setPosition(m.x+m.dx*pulse,m.y+m.dy*pulse);
            m.node.setScale(m.sx*(1+m.squeeze*pulse),m.sy*(1-m.squeeze*pulse),1);
            return age<m.duration;
        });
        this.ink.clear(); const tint=JUICE[this.theme].tint;
        this.marks=this.marks.filter(m=>{
            m.age+=dt; if(m.age>=m.life)return false; if(m.age<0)return true;
            const t=m.age/m.life, alpha=(m.ring?145:110)*(1-t)**2;
            if(m.water){const x=m.x+(m.vx??0)*m.age,y=m.y+(m.vy??0)*m.age+25*m.age*m.age;
                this.ink.lineWidth=1.5;this.ink.strokeColor=new Color(154,244,255,220*(1-t));
                this.ink.circle(x,y,m.radius*(1+.35*t));this.ink.stroke();
                this.ink.fillColor=new Color(237,255,255,230*(1-t));this.ink.circle(x-m.radius*.3,y+m.radius*.35,1.2);this.ink.fill();return true;}
            if(m.ring){this.ink.lineWidth=2*(1-t)+.5;this.ink.strokeColor=new Color(tint[0],tint[1],tint[2],alpha);
                this.ink.circle(m.x,m.y,m.radius*(.35+t));this.ink.stroke();}
            else {this.ink.fillColor=new Color(tint[0],tint[1],tint[2],alpha);
                this.ink.circle(m.x,m.y,m.radius*(1-t));this.ink.fill();}
            return true;
        });
    }
    private restore(node: Node): void {
        this.motions=this.motions.filter(m=>{
            if(m.node!==node)return true;
            if(node.isValid){node.setPosition(m.x,m.y);node.setScale(m.sx,m.sy,1);}return false;
        });
    }
    clear(): void {
        this.motions.slice().forEach(m=>this.restore(m.node));this.marks=[];this.ink.clear();
    }
    dispose(): void {this.clear();this.node.destroy();}
}
