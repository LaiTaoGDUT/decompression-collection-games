/** SafeRoot uses 750-wide UI units. Only the board/page scales into the middle. */
export interface CozyLayout {
    readonly height: number;
    readonly headerY: number;
    readonly footerY: number;
    readonly chromeScale: number;
    readonly headerHeight: number;
    readonly footerHeight: number;
    readonly middleTop: number;
    readonly middleBottom: number;
    readonly boardY: number;
    readonly boardScale: number;
}
export function cozyLayout(height: number, boardSize: number, size: number, map = false): CozyLayout {
    const chromeScale = Math.max(.82, Math.min(1, height / 1120));
    // These envelopes match the actual controls, including the hint icon's
    // three pixels above its hit box. No empty container padding consumes board space.
    const headerHeight = map ? 126.5 : 182;
    const footerHeight = map ? 229 : size === 9 ? 313 : size === 4 ? 265 : 243;
    const top = height / 2, bottom = -height / 2;
    const middleTop = top - headerHeight * chromeScale - 8;
    const middleBottom = bottom + footerHeight * chromeScale + 8;
    return { height, chromeScale, headerHeight, footerHeight,
        headerY: top - headerHeight * chromeScale / 2,
        footerY: bottom + footerHeight * chromeScale / 2,
        middleTop, middleBottom, boardY: (middleTop + middleBottom) / 2,
        boardScale: Math.max(.05, Math.min(1, map ? 1 : 666 / boardSize, (middleTop - middleBottom) / boardSize)),
    };
}
/** Same authored numerals as full entries; multiple candidates share the cell without overlap. */
export function cozyNoteLayout(cell:number,size:number,count:number,maxAspect=.85):{height:number;points:readonly {x:number;y:number}[]} {
    const normalHeight=size===4?80:size===6?46:36;
    if(count<=0)return {height:normalHeight,points:[]};
    const columns=count<=3?count:count<=4?2:3,rows=Math.ceil(count/columns),gap=4;
    const width=cell-12,height=cell-12;
    const slotWidth=(width-gap*(columns-1))/columns,slotHeight=(height-gap*(rows-1))/rows;
    const digitHeight=Math.min(normalHeight,slotHeight,slotWidth/Math.max(.1,maxAspect));
    return {height:digitHeight,points:Array.from({length:count},(_,i)=>({
        x:(i%columns-(Math.min(columns,count-Math.floor(i/columns)*columns)-1)/2)*(slotWidth+gap),
        y:((rows-1)/2-Math.floor(i/columns))*(slotHeight+gap),
    }))};
}
export function cozyCellAt(x: number, y: number, boardSize: number, size: number): number {
    const half = boardSize / 2;
    if (x < -half || x >= half || y > half || y <= -half) return -1;
    return Math.floor((half - y) / (boardSize / size)) * size + Math.floor((x + half) / (boardSize / size));
}
export const COZY_PAGE_SIZE = 6;
export function cozyDecorationTheme(page:number,themeCount:number):number {
    return Math.floor(page*COZY_PAGE_SIZE/60)%Math.max(1,themeCount);
}
export function cozyMapDragOffset(offset:number,page:number,pageCount:number,width=750):number {
    const bounded=Math.max(-width,Math.min(width,offset));
    return (page===0&&bounded>0||page===pageCount-1&&bounded<0)?bounded*.24:bounded;
}
export function cozyMapReleasePage(offset:number,velocity:number,page:number,pageCount:number,width=750):number {
    const changed=Math.abs(offset)>=width*.22||Math.abs(offset)>=width*.035&&Math.abs(velocity)>=.7&&offset*velocity>0;
    return Math.max(0,Math.min(pageCount-1,page+(changed?(offset<0?1:-1):0)));
}
export const COZY_MAP_HEIGHT = 880;
/** Approved route plate is cropped from y=206..1086 in its 750x1334 master. */
export const COZY_MAP_POINTS: readonly (readonly [number, number])[] = [
    [-134,-314], [82,-216], [-101,-76], [106,66], [-81,221], [167,319],
];
/** Notes use the open pockets beside the trail; never cover a level or record. */
export interface CozyRuleNote { readonly x:number;readonly y:number;readonly side:'left'|'right'; }
export const COZY_MAP_RULE_NOTES: Readonly<Record<number,CozyRuleNote>> = {
    6: {x:-112,y:376,side:'right'},
    12:{x:-112,y:376,side:'right'},
    18:{x:-112,y:376,side:'right'},
    24:{x:-112,y:376,side:'right'},
    36:{x:-112,y:376,side:'right'},
    48:{x:-112,y:376,side:'right'},
};
