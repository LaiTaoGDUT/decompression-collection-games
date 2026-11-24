import { _decorator, BlockInputEvents, Component, EventTouch, EffectAsset, Font, Graphics, Label, Node,
    Sprite, SpriteFrame, tween, UIOpacity, UITransform, Vec2, Vec3, view } from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { COZY_LEVELS } from './CozySudokuLevels';
import { CozySudokuModel, type SudokuHint } from './CozySudokuModel';
import { boxShape, conflicts, levelPeers, RULE_NAMES, type RuleName } from './CozySudokuRules';
import { completeCozyLevel, cozyTime, readCozySave, type CozySudokuSave } from './CozySudokuSave';
import { COZY_BUNDLE, COZY_THEME as T } from './CozySudokuTheme';
import { destroyTree, graphics, ink, line, node, rect, touchPoint } from './CozySudokuView';
import { CozySudokuArtwork, cozyArtworkRequests } from './CozySudokuArtwork';
import { COZY_PANELS, COZY_PAUSE, COZY_MAP_TITLE } from './CozySudokuArtCatalog';
import { COZY_MAP_SCENERY, cozySceneryPieces } from './CozySudokuScenery';
import { cozyArrowTrace, cozyRuleArrowPlacement } from './CozySudokuGeometry';
import { CozySudokuPager } from './CozySudokuPager';
import { CozySudokuFrost } from './CozySudokuFrost';
import { cozyLayout, cozyCellAt, cozyNoteLayout, cozyDecorationTheme, COZY_MAP_HEIGHT, COZY_MAP_POINTS, COZY_MAP_RULE_NOTES, COZY_PAGE_SIZE, type CozyLayout } from './CozySudokuLayout';

const { ccclass } = _decorator;
interface SudokuServices {
    readonly platform: Platform; readonly assets: AssetService; readonly audio: AudioService;
    readonly feedback: FeedbackService; readonly storage: StorageService;
}
type State = 'idle' | 'ready' | 'map' | 'playing' | 'hint' | 'paused' | 'celebrating' | 'victory' | 'disposed';

const CONTENT_HEIGHT = 1180;
/** Original 750×1334 plate, interactive area y=96…1276. */
const ART_CENTER_Y = 686;

/** The scene owns UI and round state; global lifecycle, resources and persistence stay behind Context services. */
@ccclass('CozySudokuGame')
export class CozySudokuGame extends Component implements MiniGame<SudokuServices> {
    private context?: MiniGameContext<SudokuServices>;
    private state: State = 'idle';
    private save: CozySudokuSave = readCozySave(undefined);
    private model?: CozySudokuModel;
    private safeRoot?: Node;
    private page?: Node;
    private background?: Node;
    private overlay?: Node;
    private frames?: Readonly<Record<string, SpriteFrame>>;
    private art?: CozySudokuArtwork;
    private frost?: CozySudokuFrost;
    private frostEffect?: EffectAsset;
    private selectedFrame?: Sprite;
    private guide?: Node;
    private keyFrames: Sprite[] = [];
    private digitSprites:Sprite[]=[];
    private digitBackings:(Sprite|undefined)[]=[];
    private keyDigits:Sprite[]=[];
    private keyDigitOpacity:UIOpacity[]=[];
    private bank?: BundleAudioBank;
    private board?: Node;
    private boardSize = 620;
    private layout?: CozyLayout;
    private mapPage = 0;
    private mapPager?:CozySudokuPager;
    private mapScenery?:Node;
    private mapDecorLayers:{theme:number;node:Node;opacity:UIOpacity}[]=[];
    private entranceElapsed = 1;
    private readonly entranceDuration = 1.05;
    private boardOpacity?:UIOpacity;
    private digitOpacity:UIOpacity[]=[];
    private hintBoardParent?: Node;
    private hintBoardTransform?:{position:Vec3;scale:Vec3};
    private hintHiddenNodes:Node[]=[];
    private hintBoardIndex = 0;
    private hintPreview?: Node;
    private hintOwnsInput = false;
    private winTiles: UIOpacity[] = [];
    private winElapsed = 0;
    private pausedFrom: 'playing' | 'celebrating' = 'playing';
    private selection?: Graphics;
    private noteLayer?: Node;
    private noteSprites: (Sprite|undefined)[][] = [];
    private noteLabel?: Label;
    private timer?: Label;
    private selected = -1;
    private pencil = false;
    private pageHeight = 1180;
    private autosave = 0;
    private draftDiscarded = false;
    private layoutPoll = 0;
    private layoutKey = '';
    private modal?: { kind: 'rules'; rule: RuleName; done: () => void } | { kind: 'hint'; hint: SudokuHint };
    private pauseModel?: MiniGamePauseModel;
    private best = false;
    get totalLevels(): number { return COZY_LEVELS.length; }
    get availableLevel():number {return this.save.unlockedLevel;}

    async initialize(context: MiniGameContext<SudokuServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error('CozySudoku already initialized');
        this.context = context;
        this.save = readCozySave(context.services.storage.getGameData(context.gameId)?.custom?.cozySudoku);
        const [frames,font,frostEffect] = await Promise.all([
            context.services.assets.loadSpriteFrames(COZY_BUNDLE,cozyArtworkRequests()),
            context.services.assets.loadAsset(COZY_BUNDLE,'fonts/cozy-hand',Font),
            context.services.assets.loadAsset(COZY_BUNDLE,'visual/effects/cozy-frost',EffectAsset),
        ]);
        if ((this.state as State) === 'disposed') return;
        this.frames = frames;
        this.art = new CozySudokuArtwork(frames,font,()=>this.context?.services.feedback.play('uiButton',{vibrate:false}));
        this.frostEffect=frostEffect;
        this.bank = new BundleAudioBank({ bundle: COZY_BUNDLE, alwaysLoad: true,
            music: 'visual/audio/journal-morning-loop', musicVolume: .5,
            cues: { uiButton: 'visual/audio/paper-touch', fold: 'visual/audio/page-turn', toggle: 'visual/audio/cell-select',
                drop: ['visual/audio/pencil-note-1','visual/audio/pencil-note-2','visual/audio/pencil-note-3'],
                collision: 'visual/audio/gentle-conflict', milestone: 'visual/audio/page-complete' },
            pooledCues: ['uiButton','fold','toggle','drop','collision','milestone'],
        }, context.services.audio, context.services.feedback, context.services.assets);
        await this.bank.initialize();
        if ((this.state as State) === 'disposed') return;
        this.state = 'ready';
        view.on('canvas-resize', this.resize, this);
        this.resize();
    }
    begin(): void {
        if (this.state !== 'ready') return;
        this.state = 'map'; this.mapPage=Math.floor((this.currentLevel()-1)/COZY_PAGE_SIZE); this.renderPage();
        // Count distinct cleared puzzles, including restored records; open levels and replays add no progress.
        this.context?.reportAchievementProgress('cleared-levels', Object.keys(this.save.records).length);
    }
    isGameplayActive(): boolean { return this.state === 'playing' && !this.overlay && this.entranceElapsed>=this.entranceDuration; }
    pause(): boolean {
        if (this.state === 'paused') return true;
        // Reading a rule or hint already freezes gameplay. Keep that modal and
        // its tutorial callback intact across a platform background/foreground.
        if (this.state === 'hint' || this.modal?.kind === 'rules') { this.persist(); return false; }
        if (this.state !== 'playing' && this.state !== 'celebrating') return false;
        this.pausedFrom=this.state;this.persist();this.closeDialog();this.state='paused';return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.state=this.pausedFrom;this.closeDialog();this.resize();
    }
    async restart(context?: MiniGameContext<SudokuServices>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.startLevel(this.model?.level.levelNumber ?? this.save.unlockedLevel, false);
    }
    discardSavedProgress(): void { this.draftDiscarded = true; this.save.draft = undefined; this.persist(false); }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.persist(); this.state = 'disposed';
        view.off('canvas-resize', this.resize, this); this.unscheduleAllCallbacks();
        this.bank?.dispose(); this.bank = undefined;
        this.mapPager?.dispose();this.mapPager=undefined;
        this.mapScenery=undefined;this.mapDecorLayers=[];
        this.closeDialog(); destroyTree(this.safeRoot); destroyTree(this.background);
        this.safeRoot = undefined; this.page = undefined; this.background = undefined;
        this.clearBoardRefs(); this.art = undefined; this.frostEffect=undefined; this.frames = undefined; this.model = undefined; this.pauseModel=undefined; this.context = undefined;
    }
    protected onDestroy(): void { void this.dispose(); }
    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        this.pauseModel = model; this.renderPause();
    }
    hidePauseMenu(): void { this.pauseModel = undefined; this.closeDialog(); }
    protected update(dt: number): void {
        if(this.state==='playing'&&!this.overlay&&this.entranceElapsed<this.entranceDuration) {
            this.entranceElapsed=Math.min(this.entranceDuration,this.entranceElapsed+Math.max(0,Math.min(dt,.1)));
            this.applyEntrance();
            if(this.entranceElapsed===this.entranceDuration)this.refreshGuide();
        }
        if (this.isGameplayActive() && this.model) {
            this.model.elapsed += Math.max(0, dt);
            if (this.timer) this.timer.string = cozyTime(this.model.elapsed);
            this.autosave += dt; if (this.autosave >= 5) { this.autosave = 0; this.persist(); }
        }
        if(this.state==='celebrating')this.updateWin(dt);
        if (this.state === 'disposed' || this.state === 'idle') return;
        this.layoutPoll += dt;
        if (this.layoutPoll > .5) { this.layoutPoll = 0; this.resize(); }
    }
    private resize(): void {
        if (!this.context || this.state === 'disposed') return;
        const size = view.getVisibleSize(), bounds = calculateSafeContentBounds(size.width,size.height,this.context.services.platform.getLayoutInfo());
        const key = JSON.stringify([size.width,size.height,bounds]);
        if (key === this.layoutKey && this.safeRoot) return;
        this.layoutKey = key;
        const top=bounds.topY,bottom=bounds.bottomY;
        const scale=bounds.width/750;
        if (scale <= 0) return;
        this.pageHeight = (top-bottom) / scale;
        if (!this.safeRoot) this.safeRoot = node('SafeRoot',this.node);
        this.safeRoot.setPosition(bounds.centerX,(top+bottom)/2);
        this.safeRoot.setScale(scale,scale,1);
        this.renderPage();
    }
    private renderBackground():void {
        if(!this.art)return;
        const size=view.getVisibleSize();
        destroyTree(this.background);this.background=node('Background',this.node);
        const cover=Math.max(size.width/750,size.height/1334);this.background.setScale(cover,cover,1);
        const kind=this.state==='map'||this.state==='ready'?'map':'gameplay';
        this.art.image(this.background,kind+'-top',0,333.5,750,667);
        this.art.image(this.background,kind+'-bottom',0,-333.5,750,667);
        this.background.setSiblingIndex(0);
    }
    private py(y:number):number{return ART_CENTER_Y-y;}
    private clearBoardRefs(): void {
        this.board=undefined;this.selection=undefined;this.noteLayer=undefined;this.noteSprites=[];
        this.timer=undefined;this.noteLabel=undefined;this.selectedFrame=undefined;this.guide=undefined;this.keyFrames=[];this.digitSprites=[];this.keyDigits=[];this.keyDigitOpacity=[];this.winTiles=[];
        this.boardOpacity=undefined;this.digitOpacity=[];
        this.digitBackings=[];
    }
    private renderPage(): void {
        if (!this.safeRoot || !this.art) return;
        const modal=this.modal;
        this.mapPager?.dispose();this.mapPager=undefined;
        this.mapScenery=undefined;this.mapDecorLayers=[];
        this.closeDialog();this.renderBackground();destroyTree(this.page);this.clearBoardRefs();
        this.page=node(this.state==='map'||this.state==='ready'?'LevelMapLayer':'GameplayLayer',this.safeRoot);
        if (this.state === 'map' || this.state === 'ready') this.renderMap();
        else if (this.model) this.renderGame();
        if(this.state==='celebrating'||(this.state==='paused'&&this.pausedFrom==='celebrating'))this.buildWin();
        if (this.state==='victory') this.renderVictory();
        else if (this.state==='paused') this.renderPause();
        else if (modal?.kind==='rules') this.showRules(modal.rule,modal.done);
        else if (modal?.kind==='hint') this.showHint(modal.hint);
    }
    private currentLevel():number {return this.save.draft?.levelNumber??this.save.unlockedLevel;}
    private turnMapPage(direction:number):void {
        if(this.state==='map'&&!this.overlay)this.mapPager?.turn(direction);
    }
    private renderMap():void {
        const p=this.page!,art=this.art!,layout=cozyLayout(this.pageHeight,COZY_MAP_HEIGHT,4,true);this.layout=layout;
        const header=node('TopHUD',p,0,layout.headerY,750,layout.headerHeight);header.setScale(layout.chromeScale,layout.chromeScale,1);
        art.button(header,'ReturnLobby','',-291,20.75,76,76,()=>this.context?.requestLobby(),false,'back');
        art.image(header,'map-title',20,19.75,COZY_MAP_TITLE.width,COZY_MAP_TITLE.height);
        const range=art.text(header,'PageRange','',0,-41.25,25,420,44,T.sageDark);
        const footer=node('BottomBar',p,0,layout.footerY,750,layout.footerHeight);footer.setScale(layout.chromeScale,layout.chromeScale,1);
        const previous=art.button(footer,'PreviousPage','',-250,78.5,92,72,()=>this.turnMapPage(-1),false,undefined,false);
        const next=art.button(footer,'NextPage','',250,78.5,92,72,()=>this.turnMapPage(1),false,undefined,false);
        art.image(previous,'nav-left',0,0,20,32);art.image(next,'nav-right',0,0,20,32);
        const previousOpacity=previous.addComponent(UIOpacity),nextOpacity=next.addComponent(UIOpacity);
        const pageNumber=art.text(footer,'PageNumber','',0,79.5,28,250,46,T.ink);
        const refreshNavigation=()=>{
            const first=this.mapPage*COZY_PAGE_SIZE+1,last=Math.min(first+COZY_PAGE_SIZE-1,this.totalLevels);
            range.string=`第 ${first} ～ ${last} 关`;
            pageNumber.string=`${this.mapPage+1} / ${Math.ceil(this.totalLevels/COZY_PAGE_SIZE)}`;
            previousOpacity.opacity=this.mapPage===0?85:255;nextOpacity.opacity=last===this.totalLevels?85:255;
        };
        this.mapScenery=node('MapScenery',p,0,layout.boardY);
        this.mapScenery.setSiblingIndex(0);
        this.mapPager=new CozySudokuPager(p,{index:this.mapPage,count:Math.ceil(this.totalLevels/COZY_PAGE_SIZE),
            y:layout.boardY,height:layout.middleTop-layout.middleBottom+16,
            build:(index,sheet)=>this.renderMapSheet(sheet,index,layout),
            scrolled:position=>this.updateMapScenery(position,layout),
            turning:()=>this.context?.services.feedback.play('fold',{vibrate:false}),
            changed:index=>{this.mapPage=index;refreshNavigation();}});
        refreshNavigation();
        const current=this.currentLevel(),main=art.hit(footer,'Continue',0,-44.5,550,140,()=>this.startLevel(current,true));
        art.image(main,'map-primary',0,0,550,140);
        const hasProgress=!!this.save.draft||Object.keys(this.save.records).length>0;
        art.text(main,'Caption',`${hasProgress?'继续':'开始'}第 ${current} 关`,0,0,38,380,88,T.white,true);
    }
    private updateMapScenery(position:number,layout:CozyLayout):void {
        if(!this.mapScenery)return;
        const page=Math.floor(position),fraction=position-page;
        const from=cozyDecorationTheme(page,COZY_MAP_SCENERY.length),to=cozyDecorationTheme(page+1,COZY_MAP_SCENERY.length);
        const blend=from===to?[{theme:from,weight:1}]:[{theme:from,weight:1-fraction},{theme:to,weight:fraction}].filter(item=>item.weight>0);
        for(const layer of this.mapDecorLayers)if(!blend.some(item=>item.theme===layer.theme))destroyTree(layer.node);
        this.mapDecorLayers=this.mapDecorLayers.filter(layer=>blend.some(item=>item.theme===layer.theme));
        for(const item of blend) {
            let layer=this.mapDecorLayers.find(layer=>layer.theme===item.theme);
            if(!layer) {
                const scenery=node('DecorTheme-'+item.theme,this.mapScenery);
                scenery.setScale(layout.boardScale,layout.boardScale,1);
                for(const piece of cozySceneryPieces(item.theme,layout.boardScale))
                    this.art!.image(scenery,piece.key,piece.x,piece.y,piece.width,piece.height);
                layer={theme:item.theme,node:scenery,opacity:scenery.addComponent(UIOpacity)};this.mapDecorLayers.push(layer);
            }
            layer.opacity.opacity=Math.round(item.weight*255);
        }
    }
    private renderMapSheet(sheet:Node,index:number,layout:CozyLayout):void {
        const art=this.art!,first=index*COZY_PAGE_SIZE+1;
        const body=node('MapPage',sheet,0,0,750,COZY_MAP_HEIGHT);body.setScale(layout.boardScale,layout.boardScale,1);
        art.image(body,'page-route',5,21,240,650);
        for(let i=0;i<COZY_PAGE_SIZE;i++) {
            const n=first+i;if(n>this.totalLevels)break;
            const [x,y]=COZY_MAP_POINTS[i],unlocked=n<=this.availableLevel,done=!!this.save.records[n];
            const active=n===this.save.unlockedLevel&&!done;
            const item=art.hit(body,'Level-'+n,x,y,104,104,()=>{
                if(!this.mapPager?.canTap(index))return;
                if(unlocked)this.startLevel(n,true);else this.context?.services.platform.showToast('先完成前面的关卡吧');
            });
            const face=art.image(item,active?'level-active':'level',active?11:0,active?7:0,active?155:98,active?142:98);
            if(!unlocked)face.color=ink('#E3DED5');
            art.text(item,'Number',String(n),0,2,active?(n<100?47:38):n<10?42:n<100?36:30,88,78,unlocked?T.ink:T.muted);
            const level=COZY_LEVELS[n-1];
            if(level.challenge)art.text(item,'ChallengeCaption',level.challenge==='finale'?'终页 · '+level.title:'小挑战',0,-66,21,172,34,T.sageDark);
            if(done) {
                art.image(item,'check',35,-30,34,34);
                const bestTime=this.save.records[n].bestTime;
                art.text(item,'Record',bestTime===undefined?'已完成':cozyTime(bestTime),0,level.challenge?-101:-70,21,120,34,T.sageDark);
            } else if(!unlocked)art.image(item,'lock',32,-29,27,32);
            const note=COZY_MAP_RULE_NOTES[n];
            if(note) {
                const placement=cozyRuleArrowPlacement(note,{x,y}),link=node('RuleArrow-'+n,body,placement.x,placement.y);
                link.angle=placement.angle;
                art.image(link,'rule-loop',0,0,placement.width,placement.height).node.setScale(placement.mirror,1,1);
                const tag=art.hit(body,'RuleTag-'+n,note.x,note.y,230,100,()=>{
                    if(this.mapPager?.canTap(index))this.showRules(COZY_LEVELS[n-1].primaryRule,()=>{});
                });
                art.image(tag,'rule-tag',0,0,230,140);
                art.text(tag,'Tag','新规则 · '+RULE_NAMES[COZY_LEVELS[n-1].primaryRule],7,-1,23,210,52,T.ink).node.angle=10;
            }
        }
    }
    private startLevel(number:number,restore:boolean):void {
        if(this.state==='disposed'||!Number.isInteger(number)||number<1||number>this.availableLevel)return;
        if(this.model&&!this.model.completed&&this.state!=='victory'&&this.state!=='paused')this.persist();
        const level=COZY_LEVELS[number-1];
        this.model=new CozySudokuModel(level,restore&&this.save.draft?.levelNumber===number?this.save.draft:undefined);
        this.draftDiscarded=false;
        this.state='playing';this.entranceElapsed=0;this.winElapsed=0;this.pausedFrom='playing';this.selected=number===1&&!this.model.cells[14]?14:this.model.cells.findIndex(v=>!v);this.pencil=false;
        this.autosave=0;this.pauseModel=undefined;this.closeDialog();this.renderPage();this.persist();
        if(this.model.completed){this.finish();return;}
        const model=this.model,pending=this.gameRuleNames().filter(rule=>this.save.tutorials.indexOf(rule)<0);
        const teachNext=()=>{
            if(this.model!==model||this.state!=='playing')return;
            const rule=pending.shift();if(!rule)return;
            this.showRules(rule,()=>{
                if(this.save.tutorials.indexOf(rule)<0)this.save.tutorials.push(rule);
                this.persist();teachNext();
            });
        };
        teachNext();
    }
    private gameRuleNames():RuleName[] {
        const names:RuleName[]=[this.model!.level.primaryRule];
        for(const rule of this.model!.level.rules)if(names.indexOf(rule.type)<0)names.push(rule.type);
        return names;
    }
    private renderGame():void {
        const p=this.page!,m=this.model!,n=m.level.size,art=this.art!;
        this.boardSize=n===4?614:n===6?664:620;
        const layout=cozyLayout(this.pageHeight,this.boardSize,n);this.layout=layout;
        const header=node('TopHUD',p,0,layout.headerY,750,layout.headerHeight);header.setScale(layout.chromeScale,layout.chromeScale,1);
        art.button(header,'ReturnMap','',-265,43,98,96,()=>this.openMap(),false,'back');
        const title=m.level.title?`${m.level.levelNumber} · ${m.level.title}`:`关卡 ${m.level.levelNumber}`;
        art.text(header,'LevelTitle',title,0,50,m.level.title?37:46,400,74,T.ink,true);
        this.timer=art.text(header,'Timer',cozyTime(m.elapsed),0,-9,29,250,46,T.ink,true);
        art.button(header,'Pause','',265,43,98,96,()=>this.context?.requestPause(),false,'pause');
        const names=this.gameRuleNames();
        if(names.length>1) {
            names.forEach((rule,i)=>{
                const chip=art.hit(header,'RuleChip-'+rule,-130+i*220,-59,202,64,()=>this.showRules(rule,()=>{}));
                art.image(chip,i===0?'sage-button':'secondary-gray',0,0,202,64);
                art.text(chip,'RuleCaption',RULE_NAMES[rule],0,0,29,190,55,T.ink,true);
            });
        } else {
            const chip=art.hit(header,'RuleChip',0,-59,224,64,()=>this.showRules(m.level.primaryRule,()=>{}));
            if(m.level.primaryRule==='classic'&&(n===4||n===9))art.image(chip,'rule-classic-'+n,0,0,230,61);
            else {
                art.image(chip,'rule-brush',0,0,224,53);
                art.text(chip,'RuleCaption',m.level.primaryRule==='classic'?`经典 ${n}×${n}`:RULE_NAMES[m.level.primaryRule],0,0,30,215,48,T.ink,true);
            }
        }
        const help=art.hit(header,'RuleHelp',names.length>1?255:163,-59,68,64,()=>this.showRules(m.level.primaryRule,()=>{}));
        art.image(help,'help-button',0,0,68,62);
        const middle=node('BoardArea',p,0,layout.boardY);middle.setScale(layout.boardScale,layout.boardScale,1);
        this.board=node('BoardContainer',middle,0,0,this.boardSize,this.boardSize);
        this.boardOpacity=this.board.addComponent(UIOpacity);
        this.selection=graphics('Layer1_Highlight',this.board);
        this.drawRuleUnderlays(node('RuleUnderlays',this.board));
        const grid=graphics('Layer2_GridLines',this.board),cell=this.boardSize/n,box=boxShape(n);
        grid.lineCap=Graphics.LineCap.ROUND;grid.lineJoin=Graphics.LineJoin.ROUND;
        for(let i=1;i<n;i++) {
            const z=-this.boardSize/2+i*cell;
            line(grid,[[z,-this.boardSize/2+4],[z,this.boardSize/2-4]],i%box.cols===0?T.grid:T.line,i%box.cols===0?5.5:1.8);
            line(grid,[[-this.boardSize/2+4,z],[this.boardSize/2-4,z]],i%box.rows===0?T.grid:T.line,i%box.rows===0?5.5:1.8);
        }
        grid.strokeColor=ink(T.grid);grid.lineWidth=6;grid.roundRect(-this.boardSize/2,-this.boardSize/2,this.boardSize,this.boardSize,24);grid.stroke();
        // Keep long rule shapes continuous across cell boundaries; grid strokes
        // and selected-cell paper must not cut the pipe or shaft into pieces.
        const geometry=graphics('Layer3_RuleGeometry',this.board);this.drawGeometry(geometry);
        const dots=graphics('Layer5_KropkiDots',this.board);
        for(const rule of m.level.rules)if(rule.type==='kropki') {
            const a=this.cellPoint(rule.cellA),b=this.cellPoint(rule.cellB),d=n===9?14:22;
            art.image(dots.node,rule.dot==='b'?'dot-black':'dot-white',(a.x+b.x)/2,(a.y+b.y)/2,d,d);
        }
        const signBackings=node('InequalityBackings',dots.node),signs=node('InequalitySigns',dots.node);
        for(const rule of m.level.rules)if(rule.type==='inequality') {
            const a=this.cellPoint(rule.lowerCell),b=this.cellPoint(rule.upperCell),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
            art.image(signBackings,'number-backing',x,y,cell*.42,cell*.42);
            const frame=this.frames!['inequality-sign'],height=cell*.32;
            const sign=art.image(signs,'inequality-sign',x,y,height*frame.originalSize.width/frame.originalSize.height,height);
            sign.node.angle=Math.atan2(a.y-b.y,a.x-b.x)*180/Math.PI;
            sign.color=ink('#72533C');
        }
        // The selected paper belongs below every rule layer. Its opaque center
        // must never hide a thermometer bulb, pipe or arrow-sum ring.
        this.selectedFrame=art.image(this.selection.node,'cell-selected',0,0,cell-3,cell-3);
        const backings=node('Layer6_NumberBackings',this.board),nums=node('Layer6_Numbers',this.board);
        this.noteLayer=node('Layer7_Notes',this.board);
        for(let i=0;i<n*n;i++) {
            const pos=this.cellPoint(i);
            const arrowCell=m.level.rules.some(rule=>rule.type==='arrow'&&(rule.circleCell===i||rule.pathCells.indexOf(i)>=0));
            const backing=arrowCell?art.image(backings,'number-backing',pos.x,pos.y,n===4?90:n===6?56:42,n===4?90:n===6?56:42):undefined;
            this.digitBackings.push(backing);
            const digit=art.digit(nums,1,pos.x,pos.y,n===4?80:n===6?46:36);digit.node.name='Cell-'+i;
            this.digitSprites.push(digit);
            this.digitOpacity.push(this.digitSprites[i].node.addComponent(UIOpacity));
            this.noteSprites.push([]);
        }
        const input=node('BoardInput',this.board,0,0,this.boardSize,this.boardSize);
        input.on(Node.EventType.TOUCH_END,(event:EventTouch)=>{
            if(!this.isGameplayActive()||Vec2.distance(event.getUIStartLocation(),event.getUILocation())>24)return;
            const point=this.boardTouch(event);if(!point)return;
            const index=cozyCellAt(point.x,point.y,this.boardSize,n);if(index<0)return;
            this.context?.services.feedback.play('toggle',{vibrate:false});
            this.selected=index;this.refreshBoard();
        });
        const footer=node('BottomBar',p,0,layout.footerY,750,layout.footerHeight);footer.setScale(layout.chromeScale,layout.chromeScale,1);
        const tools=[['Undo','撤销','undo',()=>this.afterMove(m.undo())],['Erase','擦除','erase',()=>this.fill(0)],
            ['Note','笔记','note',()=>{this.pencil=!this.pencil;this.refreshBoard();}],
            ['Hint','提示','hint',()=>{const hint=m.hint(this.selected);if(hint)this.showHint(hint);}]] as const;
        tools.forEach(([name,title,glyph,action],i)=>{
            const actionNow=()=>{if(this.isGameplayActive())action();};
            const control=art.tool(footer,name,title,glyph,-238+i*158.7,layout.footerHeight/2-57,actionNow,name==='Note'||name==='Hint');
            if(name==='Note')this.noteLabel=control.getChildByName('ToolCaption')!.getComponent(Label)!;
        });
        const keySkin=n===9?'key-wide':'key';
        for(let digit=1;digit<=n;digit++) {
            const row=n===9&&digit>5?1:0,count=n===9?(row?4:5):n;
            const index=n===9&&row?digit-6:digit-1;
            const pitch=n===4?153:n===6?104:114;
            const w=n===4?149:n===6?104:115,h=n===4?148:n===6?104:92;
            const x=(index-(count-1)/2)*pitch,y=-layout.footerHeight/2+(n===9?(row?46:140):h/2);
            const key=art.hit(footer,'Key-'+digit,x,y,w,h,()=>this.fill(digit),false);
            const face=art.image(key,keySkin,0,0,w,h);
            this.keyFrames.push(face);
            const sprite=art.digit(key,digit,0,0,n===4?66:n===6?46:43);
            this.keyDigits.push(sprite);this.keyDigitOpacity.push(sprite.node.addComponent(UIOpacity));
        }
        this.guide=node('FirstMoveGuide',p);
        this.refreshBoard();this.applyEntrance();
    }
    private applyEntrance():void {
        if(!this.board)return;
        const progress=Math.min(1,this.entranceElapsed/.8),ease=1-Math.pow(1-progress,3);
        this.board.setScale(.90+.10*ease,.90+.10*ease,1);this.board.setPosition(0,20*(1-ease));
        if(this.boardOpacity)this.boardOpacity.opacity=Math.round(255*progress*progress*(3-2*progress));
        const n=this.model!.level.size;
        this.digitSprites.forEach((digit,i)=>{
            const local=Math.max(0,Math.min(1,(this.entranceElapsed-.12-Math.floor(i/n)*.055)/.45));
            const amount=local*local*(3-2*local);
            this.digitOpacity[i].opacity=Math.round(255*amount);digit.node.setScale(.82+.18*amount,.82+.18*amount,1);
        });
    }
    private finishEntrance():void {
        if(this.entranceElapsed>=this.entranceDuration)return;
        this.entranceElapsed=this.entranceDuration;this.applyEntrance();this.refreshGuide();
    }
    private boardTouch(event:EventTouch):Vec3|undefined {
        return this.board?touchPoint(this.board,event):undefined;
    }
    private cellPoint(i:number):Vec2 {
        const n=this.model!.level.size,c=this.boardSize/n;
        return new Vec2(-this.boardSize/2+(i%n+.5)*c,this.boardSize/2-(Math.floor(i/n)+.5)*c);
    }
    private drawRuleUnderlays(parent:Node):void {
        const m=this.model!,c=this.boardSize/m.level.size,art=this.art!;
        m.level.rules.forEach((rule,index)=>{
            if(rule.type==='parity') {
                const p=this.cellPoint(rule.cell),key='parity-'+rule.parity,frame=this.frames![key],width=c*.70;
                const marker=art.image(parent,key,p.x,p.y,width,width*frame.originalSize.height/frame.originalSize.width);
                marker.node.name='Parity-'+rule.cell;marker.node.addComponent(UIOpacity).opacity=115;
            } else if(rule.type==='diagonal') {
                const a=this.cellPoint(rule.cells[0]),b=this.cellPoint(rule.cells[rule.cells.length-1]);
                const dx=b.x-a.x,dy=b.y-a.y,base=Math.hypot(dx,dy),extension=(c/2-14)*Math.SQRT2;
                const height=this.frames!['diagonal-band'].originalSize.height,scale=c*.25/height;
                const band=art.image(parent,'diagonal-band',(a.x+b.x)/2,(a.y+b.y)/2,(base+extension*2)/scale,height);
                band.type=Sprite.Type.TILED;band.node.setScale(scale,scale,1);
                band.node.getComponent(UITransform)!.setContentSize((base+extension*2)/scale,height);
                band.node.angle=Math.atan2(dy,dx)*180/Math.PI;band.node.name='Diagonal-'+index;
                band.node.addComponent(UIOpacity).opacity=125;
            }
        });
    }
    private drawGeometry(g:Graphics):void {
        const m=this.model!,c=this.boardSize/m.level.size,art=this.art!;
        g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
        m.level.rules.forEach((r,index)=>{
            if(r.type==='thermo') {
                const root=node('Thermometer-'+index,g.node),points=r.path.map(i=>this.cellPoint(i)),thickness=c*.22;
                for(let i=1;i<points.length;i++) {
                    const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
                    const nativeHeight=this.frames!['thermo-pipe'].originalSize.height,scale=thickness/nativeHeight;
                    const pipe=art.image(root,'thermo-pipe',(a.x+b.x)/2,(a.y+b.y)/2,length/scale,nativeHeight);
                    pipe.type=Sprite.Type.TILED;pipe.node.setScale(scale,scale,1);
                    pipe.node.getComponent(UITransform)!.setContentSize(length/scale,nativeHeight);
                    pipe.node.angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
                }
                for(let i=1;i<points.length;i++)art.image(root,'thermo-joint',points[i].x,points[i].y,thickness,thickness);
                art.image(root,'thermo-bulb',points[0].x,points[0].y,c*.64,c*.64);
            } else if(r.type==='arrow') {
                const start=this.cellPoint(r.circleCell),path=r.pathCells.map(i=>this.cellPoint(i));
                const headFrame=this.frames!['arrow-head'];
                const trace=cozyArrowTrace(start,path,c,headFrame.originalSize.width/headFrame.originalSize.height);if(!trace)return;
                const root=node('ArrowRule-'+index,g.node);
                line(g,trace.points.map(p=>[p.x,p.y]),'#8F9F79',c*.045);
                const head=art.image(root,'arrow-head',trace.head.x,trace.head.y,trace.headWidth,trace.headHeight);
                head.node.angle=trace.angle;
                art.image(root,'arrow-circle',start.x,start.y,c*.86,c*.86);
            }
        });
    }
    private refreshBoard(bad?:ReadonlySet<number>):void {
        const m=this.model,g=this.selection;if(!m||!g)return;
        g.clear();const c=this.boardSize/m.level.size,selectedValue=m.cells[this.selected];
        bad??=conflicts(m.level,m.cells);
        for(let i=0;i<m.cells.length;i++) {
            const p=this.cellPoint(i);
            if(this.selected>=0&&levelPeers(m.level,i,this.selected))rect(g,p.x,p.y,c-1,c-1,'#FFE9B4',0,undefined,38);
            if(selectedValue&&m.cells[i]===selectedValue)rect(g,p.x,p.y,c-1,c-1,'#FFE9B4',0,undefined,60);
            if(bad.has(i))rect(g,p.x,p.y,c-2,c-2,T.redLight);
            if(i===this.selected&&this.selectedFrame)this.selectedFrame.node.setPosition(p.x,p.y);
            const backing=this.digitBackings[i];if(backing)backing.node.active=m.cells[i]>0;
            const digit=this.digitSprites[i];digit.node.active=m.cells[i]>0;
            if(m.cells[i]) {
                digit.spriteFrame=this.frames!['digit-'+m.cells[i]+(m.level.givens[i]==='0'?'-green':'')];
                const h=m.level.size===4?80:m.level.size===6?46:36;
                digit.node.getComponent(UITransform)!.setContentSize(h*digit.spriteFrame.originalSize.width/digit.spriteFrame.originalSize.height,h);
                digit.color=ink(bad.has(i)?'#FF9999':'#FFFFFF');
            }
            const row=m.notes[i];
            if(!row.length&&!this.noteSprites[i].some(Boolean))continue;
            const aspect=Math.max(.1,...row.map(v=>{const f=this.frames!['digit-'+v+'-green'];return f.originalSize.width/f.originalSize.height;}));
            const noteLayout=cozyNoteLayout(c,m.level.size,row.length,aspect);
            for(let v=1;v<=m.level.size;v++) {
                const index=row.indexOf(v),existing=this.noteSprites[i][v-1];
                if(index<0){if(existing)existing.node.active=false;continue;}
                const point=noteLayout.points[index],frame=this.frames!['digit-'+v+'-green'];
                const sprite=existing??this.art!.digit(this.noteLayer!,v,0,0,noteLayout.height,true);
                if(!existing){sprite.node.name='NoteDigit-'+v;sprite.node.addComponent(UIOpacity).opacity=128;this.noteSprites[i][v-1]=sprite;}
                sprite.node.active=true;sprite.node.setPosition(p.x+point.x,p.y+point.y);
                sprite.node.getComponent(UITransform)!.setContentSize(noteLayout.height*frame.originalSize.width/frame.originalSize.height,noteLayout.height);
            }
        }
        if(this.selectedFrame)this.selectedFrame.node.active=this.selected>=0;
        const counts=new Array<number>(m.level.size+1).fill(0);for(const value of m.cells)counts[value]++;
        this.keyDigitOpacity.forEach((opacity,i)=>{
            const full=counts[i+1]>=m.level.size;
            opacity.opacity=full?105:255;
        });
        if(this.noteLabel){this.noteLabel.string=this.pencil?'笔记 · 开':'笔记';this.noteLabel.color=ink(this.pencil?T.sageDark:T.ink);}
        this.refreshGuide();
    }
    private refreshGuide():void {
        if(!this.guide||!this.model)return;
        for(const child of this.guide.children.slice())destroyTree(child);
        const m=this.model;
        this.guide.active=this.entranceElapsed>=this.entranceDuration&&m.level.levelNumber===1&&!m.completed&&this.selected===14&&!m.cells[14];
        if(!this.guide.active)return;
        const value=Number(m.level.solution[this.selected]),key=this.keyFrames[value-1];
        const p=this.cellPoint(this.selected),page=this.page!.getComponent(UITransform)!;
        const start=page.convertToNodeSpaceAR(this.board!.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(p.x-20,p.y-15)));
        const keyNode=key.node.parent!,target=page.convertToNodeSpaceAR(keyNode.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(38,82)));
        const height=Math.max(70,start.y-target.y),width=Math.max(70,Math.abs(start.x-target.x)+8);
        this.art!.image(this.guide,'guide-arrow',(start.x+target.x)/2,(start.y+target.y)/2,width,height);
    }

    private fill(value:number):void {
        if(!this.isGameplayActive()||!this.model)return;
        const enteredCell=this.selected,changed=this.model.write(enteredCell,value,this.pencil);
        this.afterMove(changed,value&&!this.pencil?enteredCell:undefined);
    }
    private afterMove(changed:boolean,advanceFrom?:number):void {
        if(!changed)return;
        const bad=conflicts(this.model!.level,this.model!.cells);
        this.context?.services.feedback.play(bad.size?'collision':'drop',{vibrate:false});
        if(advanceFrom!==undefined&&!bad.has(advanceFrom)) {
            const next=this.model!.nextEmptyCell(advanceFrom);this.selected=next>=0?next:advanceFrom;
        }
        this.refreshBoard(bad);this.persist();if(this.model!.completed)this.finish();
    }
    private openMap():void {
        if(this.state==='disposed')return;
        this.persist();this.state='map';this.mapPage=Math.floor((this.currentLevel()-1)/COZY_PAGE_SIZE);this.closeDialog();this.renderPage();
    }
    private persist(snapshot=true):void {
        const ctx=this.context;if(!ctx)return;
        if(snapshot&&!this.draftDiscarded&&this.model&&!this.model.completed)this.save.draft=this.model.snapshot();
        const previous=ctx.services.storage.getGameData(ctx.gameId);
        try {ctx.services.storage.writeGameData(ctx.gameId,{
            dataVersion:1,playCount:previous?.playCount??0,lastPlayedAt:Date.now(),
            highScore:Math.max(previous?.highScore??0,Object.keys(this.save.records).length),
            // Storage freezes custom's outer object only. Detach mutable save
            // data so a later move cannot alter an already committed snapshot.
            custom:{...previous?.custom,cozySudoku:JSON.parse(JSON.stringify(this.save))},
        });}catch(error){console.warn('[CozySudoku] Save failed',error);ctx.services.platform.showToast('保存暂未成功，稍后会自动重试');}
    }
    private finish():void {
        if(this.state!=='playing'||!this.model?.completed)return;
        this.finishEntrance();
        this.best=completeCozyLevel(this.save,this.model);this.state='celebrating';this.winElapsed=0;this.persist(false);
        this.context?.reportAchievementProgress('cleared-levels', Object.keys(this.save.records).length);
        if(this.timer)this.timer.string=cozyTime(this.model.elapsed);
        this.context?.reportScore(Object.keys(this.save.records).length);this.context?.reportRoundFinished?.();
        this.context?.services.feedback.play('milestone',{vibrate:false});this.buildWin();
    }
    private buildWin():void {
        if(!this.board||!this.model||this.winTiles.length)return;
        const block=node('WinInputBlock',this.page!,0,0,750,this.pageHeight);block.addComponent(BlockInputEvents);
        const fx=node('WinAnimation',this.board),cell=this.boardSize/this.model.level.size;
        for(let i=0;i<this.model.cells.length;i++) {
            const p=this.cellPoint(i),tile=this.art!.image(fx,'cell-selected',p.x,p.y,cell-3,cell-3);
            tile.color=ink('#B6D8A0');const opacity=tile.node.addComponent(UIOpacity);opacity.opacity=0;this.winTiles.push(opacity);
        }
    }
    private updateWin(dt:number):void {
        if(!this.model)return;this.winElapsed+=Math.max(0,Math.min(dt,.1));
        const n=this.model.level.size;
        this.winTiles.forEach((opacity,i)=>{
            const phase=this.winElapsed-Math.floor(i/n)*.055-(i%n)*.022;
            const wave=phase>=0&&phase<.5?Math.sin(Math.PI*phase/.5):0;
            opacity.opacity=Math.round(wave*145);this.digitSprites[i]?.node.setScale(1+wave*.13,1+wave*.13,1);
        });
        if(this.winElapsed<1.25)return;
        this.digitSprites.forEach(d=>d.node.setScale(1,1,1));
        destroyTree(this.board?.getChildByName('WinAnimation')??undefined);destroyTree(this.page?.getChildByName('WinInputBlock')??undefined);this.winTiles=[];
        this.state='victory';this.renderVictory();
    }
    private closeDialog():void {
        this.frost?.dispose();this.frost=undefined;
        destroyTree(this.hintPreview);this.hintPreview=undefined;
        if(this.hintBoardParent?.isValid&&this.board?.isValid) {
            this.board.setParent(this.hintBoardParent,false);this.board.setSiblingIndex(this.hintBoardIndex);
            if(this.hintBoardTransform){this.board.setPosition(this.hintBoardTransform.position);this.board.setScale(this.hintBoardTransform.scale);}
        }
        this.hintBoardParent=undefined;this.hintBoardTransform=undefined;
        for(const hidden of this.hintHiddenNodes)if(hidden.isValid)hidden.active=true;
        this.hintHiddenNodes=[];
        if(this.hintOwnsInput&&this.page?.isValid)this.page.resumeSystemEvents(true);
        this.hintOwnsInput=false;
        destroyTree(this.overlay);this.overlay=undefined;this.modal=undefined;
        if(this.state==='hint')this.state='playing';
    }
    private mountDialog(name:string,width:number,height:number):Node {
        this.closeDialog();
        if(this.background&&this.page&&this.frostEffect&&this.context)this.frost=new CozySudokuFrost(this.node,[this.background,this.page],this.context.services.assets,this.frostEffect);
        this.overlay=this.fullScreenOverlay('DialogLayer');
        const area=this.overlay.getComponent(UITransform)!.getBoundingBox();
        const shade=graphics('WarmVeil',this.overlay);rect(shade,area.x+area.width/2,area.y+area.height/2,area.width,area.height,'#E2D0B5',0,undefined,132);
        this.fadeVeil(shade.node);
        this.overlay.addComponent(BlockInputEvents);
        const card=node(name,this.overlay,0,0,width,height);
        const fit=Math.min(1,750/width,(this.pageHeight-20)/height);
        card.setScale(fit,fit,1);this.revealDialog(card);return card;
    }
    private fadeVeil(veil:Node):void {
        const opacity=veil.addComponent(UIOpacity);opacity.opacity=0;tween(opacity).to(.25,{opacity:255}).start();
    }
    private revealDialog(card:Node,startScale=.82,rise=24):void {
        const position=card.position.clone(),scale=card.scale.clone(),opacity=card.addComponent(UIOpacity);
        opacity.opacity=0;card.setScale(scale.x*startScale,scale.y*startScale,1);card.setPosition(position.x,position.y-rise*scale.y);
        tween(opacity).to(.28,{opacity:255},{easing:'quadOut'}).start();
        tween(card).to(.4,{position,scale},{easing:'cubicOut'}).start();
    }
    private fullScreenOverlay(name:string):Node {
        const size=view.getVisibleSize(),parent=this.node.getComponent(UITransform)!,safe=this.safeRoot!.getComponent(UITransform)!;
        const lo=safe.convertToNodeSpaceAR(parent.convertToWorldSpaceAR(new Vec3(-size.width/2,-size.height/2)));
        const hi=safe.convertToNodeSpaceAR(parent.convertToWorldSpaceAR(new Vec3(size.width/2,size.height/2)));
        const overlay=node(name,this.safeRoot!,0,0,hi.x-lo.x,hi.y-lo.y);
        // Keep dialog controls centered in the safe area while the input shield
        // and veil extend to every physical edge, including top/bottom insets.
        overlay.getComponent(UITransform)!.setAnchorPoint(-lo.x/(hi.x-lo.x),-lo.y/(hi.y-lo.y));
        return overlay;
    }
    private dialog(name:string,height:number,kind:'victory'|'pause'='victory',width=650):Node {
        const card=this.mountDialog(name,width,height);this.art!.image(card,'panel-'+kind,0,0,width,height);return card;
    }
    private referenceDialog(name:string,key:string):Node {
        const layout=COZY_PANELS[key],card=this.mountDialog(name,750,CONTENT_HEIGHT);
        this.art!.image(card,'panel-exact-'+key,layout.x,layout.y,layout.width,layout.height);
        return card;
    }
    private showRules(rule:RuleName,done:()=>void):void {
        if(rule==='parity'||rule==='inequality'||rule==='diagonal') {
            const card=this.dialog('RuleTutorialDialog',880),art=this.art!;this.modal={kind:'rules',rule,done};
            art.text(card,'BadgeCaption','数独小课堂',0,348,27,350,46,T.sageDark);
            art.text(card,'Title',RULE_NAMES[rule],0,272,51,500,78,T.ink,true);
            this.newRuleExample(card,rule);
            const copy=rule==='parity'?'圆形底纹填奇数，方形底纹填偶数。\n没有底纹的格子，不限制奇偶。'
                :rule==='inequality'?'开口朝大数，尖端朝小数。\n只需遵守标出的不等号。'
                :'两条浅金色长对角线上，\n数字也必须各出现一次。';
            art.text(card,'RuleHelp',copy,0,-170,31,550,108,T.ink);
            art.text(card,'ClassicReminder','每行、每列、每个粗线宫内仍不能重复。',0,-250,24,550,44,T.muted);
            art.button(card,'Start','开始挑战',0,-334,492,94,()=>{this.closeDialog();done();},true);
            return;
        }
        if(rule!=='classic') {
            const card=this.referenceDialog('RuleTutorialDialog',rule);this.modal={kind:'rules',rule,done};
            const start=rule==='thermo'?[383,979,404,94]:rule==='kropki'?[376,1034,510,100]:[376,1025,475,100];
            this.art!.hit(card,'Start',start[0]-375,this.py(start[1]),start[2],start[3],()=>{this.closeDialog();done();});
            return;
        }
        const card=this.dialog('RuleTutorialDialog',880);this.modal={kind:'rules',rule,done};
        const art=this.art!,badge=art.paper(card,'NewRuleBadge',0,this.py(366),184,58,T.peachLight,28);
        art.text(badge,'BadgeCaption','数独小课堂',0,0,33,180,56,T.ink,true);
        art.text(card,'Title','从这一小格开始',0,230,51,560,95,T.ink,true);
        this.tutorialExample(card);
        art.text(card,'RuleHelp','每行、每列、每个粗线宫内，\n数字各出现一次。',0,-189,29,550,128,T.ink,true);
        art.button(card,'Start','开始挑战',0,this.py(1034),492,94,()=>{this.closeDialog();done();},true);
    }
    private newRuleExample(parent:Node,rule:'parity'|'inequality'|'diagonal'):void {
        const art=this.art!,root=node('MiniExample',parent,0,52),g=graphics('MiniGrid',root);
        if(rule==='parity') {
            for(const [i,value]of [3,4].entries()) {
                const x=i===0?-90:90,key=i===0?'parity-odd':'parity-even';
                art.image(root,key,x,0,110,110).node.addComponent(UIOpacity).opacity=150;
                rect(g,x,0,132,132,T.paper,8,T.grid,0);
                art.digit(root,value,x,0,70);
                art.text(root,'ExampleCaption-'+i,i===0?'奇数格':'偶数格',x,-105,27,170,42,T.ink);
            }
        } else if(rule==='inequality') {
            for(let i=0;i<=2;i++)line(g,[[-126+i*126,-63],[-126+i*126,63]],T.grid,2);
            line(g,[[-126,-63],[126,-63]],T.grid,2);line(g,[[-126,63],[126,63]],T.grid,2);
            art.digit(root,5,-63,0,72);art.digit(root,2,63,0,72);
            art.image(root,'number-backing',0,0,58,58);art.image(root,'inequality-sign',0,0,32,36);
            art.text(root,'ExampleCaption','5 > 2 · 开口朝大数',0,-107,27,440,44,T.ink);
        } else {
            for(const angle of [45,-45]) {
                const band=art.image(root,'diagonal-band',0,0,320,16);band.node.angle=angle;
            }
            const c=58;
            for(let i=0;i<=4;i++) {
                line(g,[[-116+i*c,-116],[-116+i*c,116]],T.grid,i%2?1.5:3);
                line(g,[[-116,-116+i*c],[116,-116+i*c]],T.grid,i%2?1.5:3);
            }
            '1234341243212143'.split('').forEach((digit,i)=>art.digit(root,Number(digit),-87+i%4*c,87-Math.floor(i/4)*c,34));
        }
    }
    private tutorialExample(parent:Node):void {
        const root=node('MiniExample',parent,0,24),g=graphics('MiniGrid',root),c=89;
        for(let i=0;i<=3;i++) {
            line(g,[[-133.5+i*c,-133.5],[-133.5+i*c,133.5]],T.grid,i===0||i===3?3:1);
            line(g,[[-133.5,-133.5+i*c],[133.5,-133.5+i*c]],T.grid,i===0||i===3?3:1);
        }
        ['1','2','3'].forEach((v,i)=>this.art!.text(root,'Example-'+i,v,-89+i*89,0,47,80,80,T.ink,true));
    }
    private showHint(hint:SudokuHint):void {
        if(!this.board||!this.layout||(this.state!=='playing'&&this.state!=='hint'))return;
        this.finishEntrance();
        this.closeDialog();this.selected=hint.cell;this.refreshBoard();this.state='hint';
        const art=this.art!;
        const overlay=this.fullScreenOverlay('HintFocus');this.overlay=overlay;
        const transform=overlay.getComponent(UITransform)!;
        this.hintBoardParent=this.board.parent!;this.hintBoardIndex=this.board.getSiblingIndex();
        this.hintBoardTransform={position:this.board.position.clone(),scale:this.board.scale.clone()};
        this.board.setParent(overlay,true);
        // Reserve readable copy above and a reachable apply button below. Only
        // constrained screens move/shrink the lifted board; closing restores it.
        const bannerHeight=256,bannerTop=this.pageHeight/2-18,applyY=-this.pageHeight/2+78;
        const boardTop=bannerTop-bannerHeight-24,boardBottom=applyY+52+24;
        const scale=Math.min(this.board.scale.x,(boardTop-boardBottom)/(this.boardSize+8));
        this.board.setScale(scale,scale,1);
        const extent=(this.boardSize/2+4)*scale;
        this.board.setPosition(this.board.position.x,Math.max(boardBottom+extent,Math.min(boardTop-extent,this.board.position.y)));
        const mask=graphics('HintMask',overlay);mask.node.setSiblingIndex(0);
        const half=this.boardSize/2+4,boardTransform=this.board.getComponent(UITransform)!;
        const lo=transform.convertToNodeSpaceAR(boardTransform.convertToWorldSpaceAR(new Vec3(-half,-half)));
        const hi=transform.convertToNodeSpaceAR(boardTransform.convertToWorldSpaceAR(new Vec3(half,half)));
        // A moved, transparent board must not expose toolbar glyphs through its
        // mask hole. Preserve other dimmed HUD areas and restore only what hid.
        const worldLo=boardTransform.convertToWorldSpaceAR(new Vec3(-half,-half));
        const worldHi=boardTransform.convertToWorldSpaceAR(new Vec3(half,half));
        for(const name of ['TopHUD','BottomBar']) {
            const child=this.page!.getChildByName(name);if(!child?.active)continue;
            const bounds=child.getComponent(UITransform)!.getBoundingBoxToWorld();
            if(bounds.x<worldHi.x&&bounds.x+bounds.width>worldLo.x&&bounds.y<worldHi.y&&bounds.y+bounds.height>worldLo.y) {
                child.active=false;this.hintHiddenNodes.push(child);
            }
        }
        const area=transform.getBoundingBox(),left=area.x,right=area.x+area.width,bottom=area.y,top=area.y+area.height;
        const veil=(l:number,r:number,b:number,t:number)=>{if(r>l&&t>b)rect(mask,(l+r)/2,(b+t)/2,r-l,t-b,'#30291F',0,undefined,176);};
        veil(left,right,hi.y,top);veil(left,right,bottom,lo.y);
        veil(left,lo.x,lo.y,hi.y);veil(hi.x,right,lo.y,hi.y);
        this.fadeVeil(mask.node);
        overlay.addComponent(BlockInputEvents);
        this.page!.pauseSystemEvents(true);this.hintOwnsInput=true;
        const preview=node('HintPreview',this.board);this.hintPreview=preview;
        for(const i of hint.relatedCells??[])if(i!==hint.cell) {
            const related=this.cellPoint(i),size=this.boardSize/this.model!.level.size;
            const tile=art.image(preview,'cell-highlight',related.x,related.y,size-5,size-5);
            tile.node.addComponent(UIOpacity).opacity=65;
        }
        const p=this.cellPoint(hint.cell),cell=this.boardSize/this.model!.level.size;
        const mark=art.image(preview,'cell-selected',p.x,p.y,cell-2,cell-2);mark.color=ink('#D0E7B8');
        const opacity=mark.node.addComponent(UIOpacity);tween(opacity).to(.55,{opacity:115}).to(.55,{opacity:255}).union().repeatForever().start();
        if(!this.model!.cells[hint.cell]) {
            const ghost=art.digit(preview,hint.value,p.x,p.y,Math.min(cell*.58,60),true);ghost.node.addComponent(UIOpacity).opacity=155;
        }
        const ui=node('HintControls',overlay,0,0,750,this.pageHeight);
        const banner=art.paper(ui,'HintBanner',0,bannerTop-bannerHeight/2,684,bannerHeight,T.paper);
        art.text(banner,'HintTitle',hint.title,0,80,32,500,48,T.ink,true);
        art.text(banner,'HintAddress',`第 ${Math.floor(hint.cell/this.model!.level.size)+1} 行 · 第 ${hint.cell%this.model!.level.size+1} 列`,0,27,26,600,36,T.sageDark);
        const explanation=art.text(banner,'HintExplanation',hint.explanation,0,-51,32,620,112,T.ink);
        explanation.overflow=Label.Overflow.CLAMP;explanation.lineHeight=36;
        const close=art.button(banner,'CloseHint','',286,80,64,64,()=>this.closeDialog());
        art.image(close,'close',0,0,26,26);
        const apply=art.button(ui,'AdoptHint','',0,applyY,568,104,()=>{
            this.closeDialog();this.afterMove(this.model!.adopt(hint),hint.cell);
        },true,undefined,false);
        art.text(apply,'Caption',`应用提示 · 填入 ${hint.value}`,0,0,39,520,86,T.white,true);
        this.revealDialog(banner,.88,24);this.revealDialog(apply,.9,16);
        this.modal={kind:'hint',hint};
    }
    private renderPause():void {
        const model=this.pauseModel;if(!model)return;
        const art=this.art!,skin=COZY_PANELS.pause,card=this.mountDialog('PauseDialog',skin.width,skin.height);
        art.image(card,'panel-exact-pause',0,0,skin.width,skin.height);
        art.text(card,'Time',`关卡 ${this.model!.level.levelNumber} · ${cozyTime(this.model!.elapsed)}`,0,COZY_PAUSE.summaryY,26,490,50,T.ink,true);
        const actions=[['Resume',()=>{void model.resume();}],['Restart',()=>{void model.restart();}],
            ['PauseMap',()=>{void model.resume().then(()=>this.openMap());}]] as const;
        actions.forEach(([name,action],i)=>art.hit(card,name,0,COZY_PAUSE.buttonYs[i],COZY_PAUSE.buttonWidth,COZY_PAUSE.buttonHeight,action));
    }
    private renderVictory():void {
        const m=this.model!,art=this.art!,card=this.referenceDialog('VictoryDialog','victory');
        art.text(card,'VictoryTitle',`第${m.level.levelNumber}关完成`,1.5,this.py(387),58,440,86,T.ink,true);
        const stamp=art.image(card,'stamp',246,this.py(379),153,150).node;stamp.angle=9;
        stamp.setScale(1.35,1.35,1);tween(stamp).to(.25,{scale:new Vec3(1,1,1)},{easing:'quadIn'}).start();
        art.text(card,'FinalTime',cozyTime(m.elapsed),-76,this.py(669),54,216,86,T.ink,true);
        if(this.best)art.image(card,'best-badge',-75,this.py(730),145,46);
        else art.text(card,'Best','本次用时',-60,this.py(730),22,120,42,T.ink,true);
        art.text(card,'Hints',`${m.hints} 次`,235,this.py(652),36,110,60,T.sageDark,true);
        art.text(card,'BestCaption','历史最佳',115,this.py(726),24,150,42,T.ink,true);
        art.text(card,'BestValue',cozyTime(this.save.records[m.level.levelNumber].bestTime??m.elapsed),230,this.py(726),22,110,42,T.sageDark,true);
        const next=art.hit(card,'Next',11,this.py(929),550,94,()=>{
            if(m.level.levelNumber===this.totalLevels)this.openMap();else this.startLevel(m.level.levelNumber+1,false);
        });
        art.text(next,'Caption',m.level.levelNumber===this.totalLevels?'完成手账':'下一关  ›',0,0,44,500,86,T.white,true);
        const replay=art.hit(card,'Replay',-137,this.py(1033),264,84,()=>this.context?.requestRestart());
        art.text(replay,'Caption','再玩一次',27,0,30,190,68,T.ink,true);
        const map=art.hit(card,'VictoryMap',151,this.py(1033),280,84,()=>this.openMap());
        art.text(map,'Caption','返回手账',23,0,30,190,68,T.ink,true);
    }

}
