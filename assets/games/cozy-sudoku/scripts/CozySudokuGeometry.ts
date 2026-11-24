import type { CozyRuleNote } from './CozySudokuLayout';

export interface CozyPoint { readonly x:number;readonly y:number; }

/** Clear the sum circle and the terminal numeral instead of drawing through them. */
export function cozyArrowTrace(circle:CozyPoint,path:readonly CozyPoint[],cell:number,headAspect=.6):
    {points:CozyPoint[];tip:CozyPoint;head:CozyPoint;angle:number;headWidth:number;headHeight:number}|undefined {
    if(!path.length)return;
    const first=path[0],last=path[path.length-1],before=path[path.length-2]??circle;
    const initial=Math.hypot(first.x-circle.x,first.y-circle.y),terminal=Math.hypot(last.x-before.x,last.y-before.y);
    if(!initial||!terminal)return;
    const ux=(last.x-before.x)/terminal,uy=(last.y-before.y)/terminal;
    const start={x:circle.x+(first.x-circle.x)/initial*cell*.455,y:circle.y+(first.y-circle.y)/initial*cell*.455};
    const tip={x:last.x-ux*cell*.30,y:last.y-uy*cell*.30};
    const headHeight=cell*.24,headWidth=headHeight*headAspect;
    return{points:[start,...path.slice(0,-1),tip],tip,
        head:{x:tip.x-ux*headWidth/2,y:tip.y-uy*headWidth/2},
        angle:Math.atan2(uy,ux)*180/Math.PI,headWidth,headHeight};
}

// Visible tail and tip measured in the alpha-trimmed authored v3 loop bitmap.
export const COZY_RULE_ARROW_ANCHORS={tail:{x:-.4936,y:.4843},tip:{x:.4886,y:-.4870}} as const;

/** Fit one uniformly scaled hand-painted loop between the sticker and token rim. */
export function cozyRuleArrowPlacement(note:CozyRuleNote,target:CozyPoint):
    {x:number;y:number;width:number;height:number;angle:number;mirror:number;start:CozyPoint;end:CozyPoint} {
    const mirror=note.side==='left'?-1:1;
    // The existing paper itself is tilted, so its left and right edge midpoints
    // are at different heights within the transparent sprite rectangle.
    const start={x:note.x+mirror*104,y:note.y+(mirror<0?-14:24)};
    const distance=Math.hypot(start.x-target.x,start.y-target.y);
    const end={x:target.x+(start.x-target.x)/distance*54,y:target.y+(start.y-target.y)/distance*54};
    const a={x:COZY_RULE_ARROW_ANCHORS.tail.x*150*mirror,y:COZY_RULE_ARROW_ANCHORS.tail.y*82};
    const b={x:COZY_RULE_ARROW_ANCHORS.tip.x*150*mirror,y:COZY_RULE_ARROW_ANCHORS.tip.y*82};
    const scale=Math.hypot(end.x-start.x,end.y-start.y)/Math.hypot(b.x-a.x,b.y-a.y);
    const angle=Math.atan2(end.y-start.y,end.x-start.x)-Math.atan2(b.y-a.y,b.x-a.x);
    const cos=Math.cos(angle),sin=Math.sin(angle);
    return{x:start.x-(a.x*cos-a.y*sin)*scale,y:start.y-(a.x*sin+a.y*cos)*scale,
        width:150*scale,height:82*scale,angle:angle*180/Math.PI,mirror,start,end};
}
