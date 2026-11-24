import { COZY_MAP_DECORS } from './CozySudokuArtCatalog';

interface SceneryPiece {
    readonly source:number;
    readonly part:'left'|'right';
    readonly side:'left'|'right';
    readonly inset:number;
    readonly y:number;
    readonly scale:number;
}
interface SceneryTheme { readonly name:string; readonly pieces:readonly SceneryPiece[]; }

/** Independent compositions reuse the authored watercolor cutouts, never redraw them. */
export const COZY_MAP_SCENERY:readonly SceneryTheme[] = [
    {name:'石阶小屋',pieces:[
        {source:0,part:'left',side:'left',inset:0,y:105,scale:1},
        {source:0,part:'right',side:'right',inset:0,y:-234,scale:1},
    ]},
    {name:'茶庭',pieces:[
        {source:1,part:'right',side:'left',inset:12,y:-185,scale:.96},
        {source:1,part:'left',side:'right',inset:14,y:255,scale:.6},
    ]},
    {name:'雨巷',pieces:[
        {source:2,part:'right',side:'right',inset:0,y:-190,scale:1},
    ]},
    {name:'湖畔',pieces:[
        {source:3,part:'left',side:'left',inset:18,y:235,scale:.62},
        {source:3,part:'right',side:'right',inset:0,y:-285,scale:1},
    ]},
    {name:'花房',pieces:[
        {source:4,part:'left',side:'left',inset:16,y:245,scale:.8},
        {source:4,part:'right',side:'right',inset:8,y:-260,scale:.72},
        {source:1,part:'left',side:'right',inset:36,y:80,scale:.42},
    ]},
    {name:'秋径',pieces:[
        {source:5,part:'right',side:'left',inset:0,y:80,scale:1},
    ]},
    {name:'雪庭',pieces:[
        {source:6,part:'right',side:'left',inset:10,y:190,scale:.9},
        {source:6,part:'left',side:'right',inset:0,y:-245,scale:.86},
    ]},
];

/** Keep the outer edge at the screen boundary on every height; scale uniformly. */
export function cozySceneryPieces(theme:number,boardScale:number):{key:string;x:number;y:number;width:number;height:number}[] {
    return COZY_MAP_SCENERY[theme].pieces.map(piece=>{
        const art=COZY_MAP_DECORS[piece.source],left=piece.part==='left';
        const width=(left?art.leftWidth:art.rightWidth)*piece.scale,height=(left?art.leftHeight:art.rightHeight)*piece.scale;
        const edge=375/boardScale-width/2-piece.inset;
        return{key:left?art.left:art.right,x:piece.side==='left'?-edge:edge,y:piece.y,width,height};
    });
}
