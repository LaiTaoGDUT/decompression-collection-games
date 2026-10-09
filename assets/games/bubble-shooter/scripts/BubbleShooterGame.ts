import { setLabelBold } from '../../../services/font/FontBinding';
import { BubbleShooterTutorialView } from './BubbleShooterTutorialView';
import { BubbleShooterComboView } from './BubbleShooterComboView';
import { BubbleShooterRegionalAmbient } from './BubbleShooterRegionalAmbient';
import { BubbleShooterRegionalBoss } from './BubbleShooterRegionalBoss';
import { PREVIEW } from 'cc/env';
import { BubbleShooterMagicView } from './BubbleShooterMagicView';
import { BubbleShooterToyView } from './BubbleShooterToyView';
import { BUBBLE_SCENE_SPRITES } from './BubbleShooterSceneBindings';
import { loadBubbleRegion, loadBubbleTransitionAssets, loadBubbleCampaignArtwork, releaseBubbleCampaignArtwork, type BubbleRegionAssets, type BubbleCampaignArtwork } from './BubbleShooterRegionAssets';
import { BubbleShooterOceanBoss, OCEAN_BOSS_PARTS } from './BubbleShooterOceanBoss';
import type { BubbleRegion } from './BubbleShooterRound';
import { BubbleShooterForeground } from './BubbleShooterForeground';
import { BubbleShooterOceanAmbient } from './BubbleShooterOceanAmbient';
import { BubbleShooterJuice } from './BubbleShooterJuice';
import { BubbleShooterTransitionView } from './BubbleShooterTransitionView';
import type { AssetService } from '../../../services/asset/AssetService';
import {
    _decorator, Component, Color, EventTouch, Graphics, Label, Mask, Node, instantiate,
    ResolutionPolicy, Sprite, SpriteFrame, gfx, Material, UIOpacity, UITransform, Vec3, view,
} from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { GameResult } from '../../../core/types/CommonTypes';
import { BubbleShooterEndView, type EndPage } from './BubbleShooterEndView';
import { BubbleShooterScoreHUD } from './BubbleShooterScoreHUD';
import { BubbleShooterRewardView } from './BubbleShooterRewardView';
import { calculateBubbleShooterLayout, CLOUD_COUNTER_Y } from './BubbleShooterLayout';

import { Bubble, BubbleColor, COLORS, PIVOT, position, ROW_HEIGHT, Shot, SHOT_SPEED, MAX_AIM_ANGLE, DIAMETER, DANGER, BOARD_WIDTH } from './BubbleShooterModel';

import { BubbleShooterRound, BubbleItem, OrdinaryResult, ShotKind, ORDINARY_TUNING, BOSS_TUNING } from './BubbleShooterRound';

import type { AudioService } from '../../../services/audio/AudioService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import { BubbleShooterAudio, BubbleShooterAudioSlot, type CloudCue } from './BubbleShooterAudio';
import { BubbleShooterParticles } from './BubbleShooterParticles';
import { removalMotion, sampleRemoval, dropStartTimes, POP_SPEED, POP_BURST_TIME, popStartTime, type RemovalMotion } from './BubbleShooterRemovalMotion';
import { CLOUD_CAST_DURATION } from './BubbleShooterFeedback';
import type { CloudSnapshot } from './BubbleShooterRound';

import { BubbleShooterCampaign } from './BubbleShooterCampaign';
import { BubbleShooterCampaignView } from './BubbleShooterCampaignView';
import { BUBBLE_LEVELS, bubbleLevel } from './BubbleShooterLevels';
import { CampaignProgress, readCampaignProgress, campaignUnlocked, settleCampaignProgress } from './BubbleShooterCampaignSave';
import { BubbleShooterCampaignResultView } from './BubbleShooterCampaignResultView';

const { ccclass, property } = _decorator;
const BUBBLE_SHOOTER_DATA_VERSION = 2;
type BubbleShooterState = 'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'disposed';
interface BubbleShooterServices { readonly assets?: AssetService; readonly platform: Platform; readonly ads: AdService; readonly audio: AudioService; readonly storage: StorageService; readonly feedback: FeedbackService; }
interface CampaignTargetVisual { readonly glow: UIOpacity; }
interface BoardBubbleVisual { readonly node: Node; readonly appearance: string; readonly target?: CampaignTargetVisual; }

const COUNTER_DECOR_GAP = 45;
const BOSS_DOCK_OVERLAP = 5;

/** Cloud prototype with a shared deterministic trace for aiming and flight. */
@ccclass('BubbleShooterGame')
export class BubbleShooterGame extends Component implements MiniGame<BubbleShooterServices> {
    @property({ type: [BubbleShooterAudioSlot] }) audioSlots: BubbleShooterAudioSlot[] = [];
    @property({ type: SpriteFrame }) supportFrame: SpriteFrame | null = null;
    private previewRegion?: BubbleRegion;
    private tutorialView?: BubbleShooterTutorialView;
    private tutorialCompleted = false;
    private tutorialPending = false;
    private rulesRequested = false;
    private comboView?: BubbleShooterComboView;
    private magicView?: BubbleShooterMagicView;
    private toyView?: BubbleShooterToyView;
    private regionalBoss?: BubbleShooterRegionalBoss;
    private regionalAmbient?: BubbleShooterRegionalAmbient;
    private railMotion: {node:Node;from:Vec3;to:Vec3;age:number}[]=[];
    private regionAssets?: BubbleRegionAssets;
    private sceneSprites: {path:string;sprite:Sprite}[]=[];
    private oceanBoss?: BubbleShooterOceanBoss;
    private oceanBossNode?: Node;
    private oceanCastAge = -1;
    private oceanTargets: {bubble:Bubble;color:BubbleColor}[]=[];
    private oceanDefeating = false;
    private viewBuilt = false;
    private readonly sound = new BubbleShooterAudio();
    private particles?: BubbleShooterParticles;
    private juice?: BubbleShooterJuice;
    private foreground?: BubbleShooterForeground;
    private oceanAmbient?: BubbleShooterOceanAmbient;
    @property({ type: [SpriteFrame] }) foregroundFrames: SpriteFrame[] = [];
    private transitionView?: BubbleShooterTransitionView;
    private checkpoint?: { round: CloudSnapshot; elapsed: number };
    private runFinished = false;
    private restored = false;
    private state: BubbleShooterState = 'idle';
    private context?: MiniGameContext<BubbleShooterServices>;
    private listening = false;
    private rewardView?: BubbleShooterRewardView;
    private endView?: BubbleShooterEndView;
    private pauseView?: BubbleShooterEndView;
    private operationGeneration = 0;
    private restartPending = false;
    private restartCurrentRound = false;
    private revivePending = false;
    private elapsed = 0;
    private finalResult?: GameResult;
    private bestScore = 0;
    private scoreHUD?: BubbleShooterScoreHUD;
    private reportedScore?: number;
    private pausedFrom: 'playing' | 'completed' = 'playing';

    private readonly endlessRound = new BubbleShooterRound();
    private campaignRound?: BubbleShooterCampaign;
    private get round(): BubbleShooterRound { return this.campaignRound ?? this.endlessRound; }
    private mode: 'campaign' | 'endless' = 'campaign';
    private localPage: 'modes' | 'levels' | 'playing' | 'result' | 'preparing' = 'modes';
    private campaignProgress: CampaignProgress = readCampaignProgress(undefined);
    private campaignView?: BubbleShooterCampaignView;
    private campaignResultView?: BubbleShooterCampaignResultView;
    private campaignArtwork?: BubbleCampaignArtwork;
    private pauseNavigation?: 'modes' | 'levels';
    private campaignRetryId?: string;
    private modeNavigationGeneration = 0;
    private activePauseModel?: MiniGamePauseModel;
    private get model() { return this.round.board; }
    private readonly frames = new Map<BubbleColor, SpriteFrame>();
    private frostFrame?: SpriteFrame;
    private get currentColor(): BubbleColor { return this.round.current; }
    private set currentColor(color: BubbleColor) { this.round.current = color; }
    private get nextColor(): BubbleColor { return this.round.next; }
    private set nextColor(color: BubbleColor) { this.round.next = color; }
    private pendingShot?: Shot;
    private lastAim?: { x: number; y: number; revision: number; item?: BubbleItem; region: BubbleRegion };
    private boardVisuals = new Map<string, BoardBubbleVisual>();
    private activeTouch?: number;
    private heldTouch?: { id: number; x: number; y: number };
    private flight?: { shot: Shot; node: Node; segment: number; travelled: number; kind: ShotKind; age: number; trailClock: number };
    private effects: { node: Node; elapsed: number; falling: boolean; motion: RemovalMotion; bubble: Bubble; burst: boolean; ring?: Graphics }[] = [];
    private fallingRoot?: Node;
    private get cleared(): number { return this.round.cleared; }
    private counterBeads: Node[] = [];
    private transition = 0;
    private transitionOffset = 0;
    private pulseTime = 0;
    private bossRoot?: Node;
    private bossClip?: Node;
    private bossScale = 1;
    private bossBaseY = 0;
    private bossClock = 0;
    private bossCast = 0;
    private skillImpact?: Graphics;
    private dangerGlow?: Graphics;
    private atmosphereClock = 0;
    private islands: {node: Node; x: number; y: number; scale: number}[] = [];
    private castImpactPlayed = false;
    private readonly castFrozen = new Set<string>();
    private bossHealthRoot?: Node;
    private bossReveal = 1;
    private hitTime = 0;
    private healthVisible: number = BOSS_TUNING.health;
    private healthTarget: number = BOSS_TUNING.health;
    private attackFrame?: SpriteFrame;
    private attack?: { node: Node; sources: Vec3[]; elapsed: number; targetHealth: number };
    private defeatElapsed = -1;
    private hitFlash?: Node;
    private flashMaterial?: Material;
    private skillNode?: Node;
    private rowBirths: { node: Node; elapsed: number; delay: number; y: number }[] = [];
    private turretReturn?: { from: number; elapsed: number };
    private selectedItem?: BubbleItem;
    private readonly itemFrames = new Map<BubbleItem, SpriteFrame>();
    private readonly itemKeys: readonly BubbleItem[] = ['bomb', 'wildcard', 'clear-bottom'];

    protected onLoad(): void {
        view.setDesignResolutionSize(750,1334,ResolutionPolicy.FIXED_WIDTH);
    }

    private buildView(): void {
        this.applyLayout();
        const play = this.node.getChildByName('Playfield')!;
        play.on(Node.EventType.TOUCH_START, this.startAim, this);
        play.on(Node.EventType.TOUCH_END, this.fire, this);
        play.on(Node.EventType.TOUCH_MOVE, this.aim, this);
        play.on(Node.EventType.TOUCH_CANCEL, this.cancelAim, this);
        play.getChildByPath('Launcher/NextBall')!.on(Node.EventType.TOUCH_END, this.swap, this);
        play.getChildByPath('Launcher/Swap')!.on(Node.EventType.TOUCH_END, this.swap, this);
        this.node.getChildByName('Pause')!.on(Node.EventType.TOUCH_END, this.requestPause, this);
        this.buildRulesButton();
        this.listening = true;
        this.drawDangerLine();
        const glow=new Node('DangerEdgeGlow');glow.layer=this.node.layer;glow.setParent(this.node);
        glow.addComponent(UITransform);this.dangerGlow=glow.addComponent(Graphics);
        for (const key of this.itemKeys) {
            const button = play.getChildByPath('Items/Item-' + key)!;
            this.itemFrames.set(key, button.getChildByName('Icon')!.getComponent(Sprite)!.spriteFrame!);
            button.on(Node.EventType.TOUCH_START, this.blockNoticeTouch, this);
            button.on(Node.EventType.TOUCH_END, this.selectItem, this);
        }
        this.buildCounter();
        this.setupBoss();
        const rewardFrames = new Map<string, SpriteFrame>();
        this.node.getChildByName('RewardAssets')!.children.forEach(n => {
            rewardFrames.set(n.name, n.getComponent(Sprite)!.spriteFrame!);
        });
        const playfield = this.node.getChildByName('Playfield')!;
        this.fallingRoot = new Node('FallingBubbles'); this.fallingRoot.layer = playfield.layer;
        this.fallingRoot.setParent(playfield); this.fallingRoot.addComponent(UITransform);
        this.fallingRoot.setSiblingIndex(playfield.getChildByName('Launcher')!.getSiblingIndex());
        this.foreground = new BubbleShooterForeground(this.node);
        this.foreground.register('cloud',{frames:this.foregroundFrames,
            width:250,opacity:230,duration:11,interval:9,bob:12});
        this.juice = new BubbleShooterJuice(this.node.getChildByPath('Playfield/Vfx')!);
        this.viewBuilt=true;
        this.applyLayout();
    }

    async initialize(context: MiniGameContext<BubbleShooterServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize BubbleShooterGame from ${this.state}.`);
        this.context = context;
        this.sound.bind(context.services.audio, this.audioSlots);
        // Explicit editor-preview route for acceptance; never consumes or overwrites a real run.
        const requested=PREVIEW && typeof location!=='undefined'?new URLSearchParams(location.search).get('bubbleRegion'):null;
        this.previewRegion=requested==='toy'||requested==='magic'?requested:undefined;
        this.round.reset(this.previewRegion ?? this.round.pickStartRegion());
        const record = context.services.storage?.getGameData(context.gameId);
        const stored = record?.dataVersion === BUBBLE_SHOOTER_DATA_VERSION ? record : undefined;
        this.bestScore = !this.previewRegion && Number.isFinite(stored?.highScore) ? Math.max(0, Math.floor(stored!.highScore!)) : 0;
        this.tutorialCompleted=stored?.custom?.tutorialCompleted===true;
        this.tutorialPending=!this.tutorialCompleted;
        this.campaignProgress = readCampaignProgress(stored?.custom?.campaign);
        const endless = stored?.custom?.endless as { activeRun?: unknown } | undefined;
        const saved = endless?.activeRun ?? stored?.custom?.activeRound;
        if (!this.previewRegion && saved && typeof saved === 'object') {
            const record=saved as {round?:unknown;elapsed?:unknown};
            if(typeof record.elapsed==='number' && Number.isFinite(record.elapsed) && record.elapsed>=0 && this.round.restore(record.round,['cloud','ocean','toy','magic'])) {
                this.elapsed=record.elapsed;this.restored=true;this.checkpoint={round:this.round.snapshot(),elapsed:this.elapsed};
            }
        }
        const restartIntent = stored?.custom?.restartIntent as { mode?: string; levelId?: string } | undefined;
        const restartLevel = restartIntent?.mode === 'campaign' ? bubbleLevel(restartIntent.levelId ?? '') : undefined;
        const selected = restartLevel;
        if (selected) {
            this.mode='campaign';this.campaignProgress={...this.campaignProgress,attemptSerial:this.campaignProgress.attemptSerial+1};
            this.campaignRound=new BubbleShooterCampaign(selected,context.sessionId+':'+this.campaignProgress.attemptSerial);
            this.localPage='playing';this.elapsed=0;this.restored=false;
        } else if (this.previewRegion || restartIntent?.mode === 'endless') {
            this.mode='endless';this.localPage='playing';
            if(restartIntent?.mode==='endless'){this.endlessRound.reset(this.previewRegion??this.endlessRound.pickStartRegion());this.checkpoint=undefined;this.restored=false;this.elapsed=0;}
        }
        if(!context.services.assets)throw new Error('Bubble Shooter requires session AssetService.');
        const generation=this.operationGeneration;
        const curtain = await loadBubbleTransitionAssets(context.services.assets);
        if(generation!==this.operationGeneration || !this.node.isValid)throw new Error('Game initialization cancelled.');
        this.transitionView = new BubbleShooterTransitionView(this.node, curtain.cloud, curtain.banner, curtain.button,
            () => this.context?.requestLobby());
        this.transitionView.coverPreparation();
        view.on('canvas-resize', this.applyLayout, this);
        this.applyLayout();
        const pack=await loadBubbleRegion(context.services.assets,this.round.region,context.services.audio);
        const campaignArtwork=await loadBubbleCampaignArtwork(context.services.assets);
        if(generation!==this.operationGeneration || !this.node.isValid){releaseBubbleCampaignArtwork(context.services.assets,campaignArtwork);throw new Error('Game initialization cancelled.');}
        this.campaignArtwork=campaignArtwork;
        this.sceneSprites=BUBBLE_SCENE_SPRITES.map(([path])=>({path,sprite:this.node.getChildByPath(path)!.getComponent(Sprite)!}));
        this.applyRegionFrames(pack);
        this.buildView();
        this.applyRegionView(pack);
        this.healthVisible=this.healthTarget=this.round.bossHealth;
        this.syncBoss();this.syncBoard(false,true);this.syncItems();this.syncCounter();this.syncSupply();
        if(this.localPage==='playing')this.commitCheckpoint();else this.persistCheckpoint();
        this.applyLayout();
        this.state = 'ready';
    }

    private applyRegionFrames(pack: BubbleRegionAssets): void {
        this.regionAssets=pack;
        this.sound.bind(this.context?.services.audio,pack.audioSlots.concat(pack.comboAudioSlots));
        const paths=new Map(BUBBLE_SCENE_SPRITES);
        this.sceneSprites.forEach(({path,sprite})=>{
            if(!sprite.isValid)return;
            sprite.spriteFrame=pack.sceneFrame(paths.get(path)!);
        });
        this.syncRulesButton();
        this.frames.clear();COLORS.forEach(color=>this.frames.set(color,pack.regional(`bubbles/bubble-${color}`)));
        this.supportFrame=pack.regional('bubbles/bubble-support');
        this.frostFrame=pack.region==='cloud'?pack.regional('bubbles/frosting-overlay'):undefined;
        this.foregroundFrames=pack.region==='cloud'?['a','b','c'].map(key=>pack.regional(`foreground/cloud-${key}`)):[];
    }

    private applyRegionView(pack: BubbleRegionAssets): void {
        this.comboView?.dispose();
        this.comboView=new BubbleShooterComboView(this.node.getChildByName('Playfield')!,pack.comboFrames,tier=>this.cue(('combo-'+tier) as CloudCue),
            ()=>this.campaignRound?undefined:this.scoreHUD?.scoreTarget,()=>{if(!this.campaignRound)this.scoreHUD?.pulse();});
        this.scoreHUD?.dispose();
        this.scoreHUD=new BubbleShooterScoreHUD(this.node,pack.region,pack.scoreIcons);
        // Keep the HUD below score flights so arriving numbers draw over it.
        this.scoreHUD.root.setSiblingIndex(this.comboView.root.getSiblingIndex());
        this.scoreHUD.set(this.round.score,this.bestScore);
        this.transitionView?.setBanner(pack.bossAlert);
        this.regionalAmbient?.dispose();this.regionalAmbient=undefined;
        this.regionalBoss?.dispose();this.regionalBoss=undefined;
        this.magicView?.dispose();this.magicView=undefined;
        this.toyView?.dispose();this.toyView=undefined;this.railMotion=[];
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.oceanBoss?.dispose();this.oceanBossNode?.destroy();this.oceanBoss=undefined;this.oceanBossNode=undefined;
        this.oceanCastAge=-1;this.oceanTargets=[];this.oceanDefeating=false;this.bossCast=0;this.castFrozen.clear();
        for (const key of this.itemKeys) {
            const button=this.node.getChildByPath(`Playfield/Items/Item-${key}`)!;
            button.getComponent(Sprite)!.enabled=pack.region==='cloud';
            let base=button.getChildByName('OceanItemBase');
            if (pack.region!=='cloud') {
                if(!base){base=new Node('OceanItemBase');base.layer=button.layer;base.setParent(button);base.addComponent(UITransform);base.addComponent(Sprite);}
                base.active=true;base.setSiblingIndex(0);base.setPosition(0,22);
                const frame=pack.region==='ocean'?pack.regional('hud/item-base'):pack.part('launcher/controls-v2','item');
                const sprite=base.getComponent(Sprite)!;sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;
                base.getComponent(UITransform)!.setContentSize(120,120*frame.originalSize.height/frame.originalSize.width);
            } else if(base) {base.active=false;base.getComponent(Sprite)!.spriteFrame=null;}
        }
        this.node.getChildByPath('Playfield/Counter/BossSkill')!.getComponent(UITransform)!.setContentSize(pack.region==='ocean'?30:36,pack.region==='ocean'?30:40);
        this.foreground?.clearStyles();
        if(pack.region==='ocean') {
            this.oceanAmbient=new BubbleShooterOceanAmbient(this.node,pack.regional('decoration/fish'),pack.regional('decoration/seaweed'));
            this.foreground?.register('ocean',{frames:[pack.regional('foreground/water-bubble-single')],
                width:84,opacity:190,duration:3.8,interval:2.5,bob:7,rise:220,motion:'bubbles'});
        } else if(pack.region==='cloud') this.foreground?.register('cloud',{frames:this.foregroundFrames,width:250,opacity:230,duration:11,interval:9,bob:12});
        if(pack.region==='toy')this.foreground?.register('toy',{frames:[pack.part('decoration/cotton-v7','cotton')],width:165,opacity:150,duration:14,interval:8,bob:9,rise:28});
        if(pack.region==='magic')this.foreground?.register('magic',{frames:[pack.part('decoration/ambient-v3','flyer')],width:68,opacity:225,duration:9,interval:2.5,bob:25,motion:'flutter'});
        this.syncProgressHUD(pack.sceneFrame('visual/common/hud/round-panel')!);
        const rewards=new Map<string,SpriteFrame>();
        this.node.getChildByName('RewardAssets')!.children.forEach(n=>{const f=n.getComponent(Sprite)?.spriteFrame;if(f)rewards.set(n.name,f);});
        this.attackFrame=rewards.get('attack-heart');
        this.particles?.dispose();this.particles=new BubbleShooterParticles(this.node.getChildByPath('Playfield/Vfx')!,rewards);
        this.particles.theme=pack.region;if(this.juice)this.juice.theme=pack.region;
        const body=this.bossRoot!.getChildByName('Body')!,bodyFrame=body.getComponent(Sprite)!.spriteFrame;
        const bodyWidth=pack.region==='cloud'?570:600;
        body.getComponent(UITransform)!.setContentSize(bodyWidth,bodyFrame?bodyWidth*bodyFrame.originalSize.height/bodyFrame.originalSize.width:285);
        body.angle=0;body.setScale(1,1,1);body.getComponent(Sprite)!.enabled=pack.region==='cloud';
        this.hitFlash?.getComponent(UITransform)?.setContentSize(body.getComponent(UITransform)!.width,body.getComponent(UITransform)!.height);
        this.tutorialView?.dispose();
        this.tutorialView=new BubbleShooterTutorialView(this.node,pack.region,pack.modalFrames,this.frames.get('red')!,this.itemFrames,()=>this.cue('ui'));
        this.rewardView?.dispose();this.endView?.dispose();this.pauseView?.dispose();
        this.rewardView=new BubbleShooterRewardView(this.node,rewards,this.itemFrames,this.bossRoot!,()=>this.cue('select'));
        this.endView=new BubbleShooterEndView(this.node,pack.region,pack.modalFrames,pack.scoreIcons,()=>this.cue('ui'));
        this.pauseView=new BubbleShooterEndView(this.node,pack.region,pack.modalFrames,pack.scoreIcons,()=>this.cue('ui'));this.pauseView.root.name='PauseOverlay';
        this.campaignView?.dispose();
        this.campaignView = new BubbleShooterCampaignView(this.node,this.campaignArtwork!,{
            selectLevels:()=>this.showCampaignSelection(),startEndless:()=>this.enterEndless(),
            enterLevel:id=>this.enterCampaign(id,this.campaignProgress.activeAttempt?.levelId===id),modes:()=>this.showModeSelection(),
            lobby:()=>{this.persistCheckpoint();this.flushProgress();this.context?.requestLobby();},
            feedback:()=>this.cue('ui'),
        });
        this.campaignResultView?.dispose();
        this.campaignResultView=new BubbleShooterCampaignResultView(this.node,pack.region,pack.modalFrames,this.campaignArtwork!,()=>this.cue('ui'));
        if(pack.region==='ocean'){
            const node=new Node('OceanBoss');node.layer=this.node.layer;node.setParent(this.bossClip!);
            node.addComponent(UITransform);this.oceanBossNode=node;
            const boss=node.addComponent(BubbleShooterOceanBoss);boss.enabled=false;
            const parts=OCEAN_BOSS_PARTS;
            boss.initialize(new Map(parts.map(part=>[part,pack.regional(`boss/boss-${part}`)])));boss.paused=false;
            this.oceanBoss=boss;
            if(this.round.stage==='boss' || this.round.stage==='victory')boss.showIdle();
            this.rewardView.setCelebration(pack.regional('reward/celebration'));
        }
        if(pack.region==='toy') {
            this.toyView=new BubbleShooterToyView(this.node,pack.part('board/rail-v2','rail'));
        }
        if(pack.region==='magic'){
            this.magicView=new BubbleShooterMagicView(this.node);
            BubbleShooterMagicView.decorateReward(this.rewardView.content);
        }
        if(pack.region==='toy'||pack.region==='magic'){
            this.regionalAmbient=new BubbleShooterRegionalAmbient(this.node,pack);
            this.regionalBoss=new BubbleShooterRegionalBoss(this.bossRoot!,this.node.getChildByName('Playfield')!,pack);
            this.rewardView.setCelebration(pack.part(pack.region==='magic'?'reward/celebration-v8':'reward/celebration-v7','celebration'));
        }
        if(this.hitFlash)this.hitFlash.getComponent(Sprite)!.enabled=pack.region==='cloud';
        if(this.hitFlash)this.hitFlash.getComponent(Sprite)!.spriteFrame=this.bossRoot!.getChildByName('Body')!.getComponent(Sprite)!.spriteFrame;
        this.transitionView?.bannerRoot.setSiblingIndex(this.node.children.length-1);
        this.transitionView?.root.setSiblingIndex(this.node.children.length-1);
        this.syncBoss();this.applyLayout();
        for(const [name,key] of [['HealthTrack','health-track'],['HealthFill','health-fill']]) {
            this.bossHealthRoot!.getChildByName(name)!.getComponent(Sprite)!.spriteFrame = pack.region==='ocean'
                ? pack.regional(`hud/${key}`) : pack.sceneFrame(`visual/common/hud/hud-boss-${key}`);
        }
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin BubbleShooterGame from ${this.state}.`);
        this.state = this.round.ended ? 'completed' : 'playing';
        if(this.localPage==='modes')this.showModeSelection();
        else if (this.restored && this.round.rewardAvailable) this.showReward();
        else this.music(this.round.stage === 'boss' ? 'boss-music' : 'normal-music');
        this.restored = false;
        this.transitionView?.revealPrepared();
        this.syncCampaignAchievementProgress();
    }

    pause(): boolean {
        if ((this.localPage!=='playing' && this.localPage!=='result') || (this.state !== 'playing' && this.state !== 'completed')) return false;
        this.pausedFrom = this.state;
        this.sound.pause({ keepMusicPlaying: this.rulesRequested });
        this.persistCheckpoint();this.flushProgress();
        this.rewardView?.setEnabled(false);
        this.endView?.setEnabled(false);
        this.campaignResultView?.setEnabled(false);
        this.cancelAim();
        this.selectedItem = undefined;
        this.syncItems();
        this.syncSupply();
        this.state = 'paused';
        return true;
    }

    resume(): void {
        if (this.state === 'paused') { this.state = this.pausedFrom;if(!this.pauseNavigation)this.sound.resume(); this.rewardView?.setEnabled(true); this.endView?.setEnabled(true);this.campaignResultView?.setEnabled(true); }
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.activePauseModel=model;
        if (this.state === 'paused') {
            if(this.campaignRound && this.rulesRequested){
                this.rulesRequested=false;
                this.tutorialView?.showCampaign(this.campaignRound,this.campaignArtwork!,async()=>{
                    this.campaignProgress={...this.campaignProgress,tutorialKeys:Array.from(new Set(this.campaignProgress.tutorialKeys.concat(this.campaignRound!.level.tutorialKeys)))};
                    this.commitCheckpoint();this.flushProgress();await model.resume();
                });return;
            }
            if(this.rulesRequested){
                this.rulesRequested=false;
                this.tutorialView?.show(async()=>{
                    if(!this.tutorialCompleted){
                        this.tutorialCompleted=true;this.persistCheckpoint();
                        if(!this.previewRegion)try{this.context?.services.storage.flush();}catch(error){/* TODO: console.warn('[BubbleShooter] Tutorial save deferred.',error); */}
                    }
                    await model.resume();
                });
                return;
            }
            if(this.tutorialView?.visible)return;
            if(this.campaignRound){
                this.pauseView?.showPause(model,()=>this.navigatePaused(model,'levels'),true,()=>this.navigatePaused(model,'modes'));return;
            }
            this.syncScore();
            this.pauseView?.showPause(model, async () => {
                this.restartCurrentRound = true;
                try { await model.restart(); }
                finally { this.restartCurrentRound = false; }
            }, false, () => this.navigatePaused(model,'modes'));
        }
    }

    hidePauseMenu(): void { this.pauseView?.hide();this.tutorialView?.hide();if(this.state!=='completed')this.campaignView?.hide();this.campaignView?.syncHUD(this.campaignRound); }

    async restart(context?: MiniGameContext<BubbleShooterServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') {
            throw new Error(`Cannot restart BubbleShooterGame from ${this.state}.`);
        }
        if (context) this.context = context;
        this.reportedScore = undefined;
        if(this.campaignRetryId||this.campaignRound){
            const id=this.campaignRetryId??this.campaignRound!.level.id;this.campaignRetryId=undefined;
            this.state='playing';this.campaignView?.hide();this.enterCampaign(id);return;
        }
        if (this.restartPending) return;
        const keepProgress = this.restartCurrentRound;
        const startRegion = keepProgress ? this.round.region : (this.previewRegion ?? this.round.pickStartRegion());
        const generation = this.operationGeneration;
        let prepared: BubbleRegionAssets;
        let committed = false;
        const started = this.transitionView!.start(async () => {
            prepared = this.round.region === startRegion ? this.regionAssets!
                : await loadBubbleRegion(this.context!.services.assets!, startRegion, this.context!.services.audio);
            if (generation !== this.operationGeneration && !committed) throw new Error('Restart cancelled.');
        }, () => {
            if (!committed) {
                this.resetRound(keepProgress, true, startRegion);
                committed = true;
            }
            this.applyRegionFrames(prepared);
            this.applyRegionView(prepared);
            this.syncBoard(false, true);this.syncSupply();this.syncItems();this.syncCounter();
            this.applyLayout();
            this.sound.reset();this.music('normal-music');
            this.commitCheckpoint();
            this.restartPending = false;
        });
        if (!started) throw new Error('A transition is already active.');
        this.restartPending = true;
        // The application can finish its restart operation; the cloud layer locks gameplay
        // until preparation, commit and two rendered frames have completed.
        this.state = 'playing';
    }

    private applyLayout(): void {
        if (this.state === 'disposed') return;
        const { width, height } = view.getVisibleSize();
        this.rewardView?.layout(width, height, this.context?.services.platform.getLayoutInfo());
        this.endView?.layout(width, height, this.context?.services.platform.getLayoutInfo());
        this.pauseView?.layout(width, height, this.context?.services.platform.getLayoutInfo());
        this.tutorialView?.layout(width,height,this.context?.services.platform.getLayoutInfo());
        this.campaignView?.layout(width,height,this.context?.services.platform.getLayoutInfo());
        this.campaignResultView?.layout(width,height,this.context?.services.platform.getLayoutInfo());
        const regional=this.round.region==='toy'||this.round.region==='magic';
        const canopyFrame=this.node.getChildByName('CloudTransition')?.getComponent(Sprite)?.spriteFrame;
        const canopyHeight=regional&&canopyFrame?width*canopyFrame.rect.height/canopyFrame.rect.width:0;
        const layout = calculateBubbleShooterLayout(width, height, this.context?.services.platform.getLayoutInfo(), regional||this.round.region==='ocean',canopyHeight,this.round.region==='ocean'?50:0);
        this.transitionView?.layout(width, height, this.pauseView?.content.position.y ?? 0, layout.safeBottomY);
        this.node.getComponent(UITransform)!.setContentSize(width, height);
        const play = this.node.getChildByName('Playfield')!;
        play.setScale(layout.scale, layout.scale, 1);
        play.setPosition(0, layout.playY);
        const playUI = play.getComponent(UITransform)!;
        playUI.setContentSize(BOARD_WIDTH, playUI.height);
        this.foreground?.layout(0,layout.playY,layout.scale);
        const items = play.getChildByName('Items')!;
        const leftItem = items.getChildByName('Item-wildcard')!;
        const leftItemUI = leftItem.getComponent(UITransform)!;
        const itemLeft = (leftItem.position.x - leftItemUI.width * leftItemUI.anchorX) * items.scale.x;
        items.setPosition(Math.max(-255, -width / (2 * layout.scale) - itemLeft + 8 / layout.scale), items.position.y);
        this.oceanAmbient?.layout(width,height,layout.playY,layout.scale);
        this.magicView?.layout(width,height);
        play.getChildByName('DangerLine')!.setPosition(0, DANGER);
        this.centerCounter();
        const launcher = play.getChildByName('Launcher')!;
        launcher.getChildByName('FixedConnector')!.active = false;
        const pivot = launcher.getChildByName('TurretPivot')!;
        const art=pivot.getChildByName('TurretArtwork')!,ocean=this.round.region==='ocean';
        // Region-specific spacing must be absolute so resize/region changes never accumulate it.
        const crafted=this.round.region==='toy'||this.round.region==='magic';
        launcher.getChildByName('NextBall')!.setPosition(crafted?235:ocean?191:201,70);
        const swap=launcher.getChildByName('Swap')!;
        swap.setPosition(crafted?149:125,76);
        swap.getComponent(UITransform)!.setContentSize(crafted?44:50,crafted?44:42);
        const artUI=art.getComponent(UITransform)!;
        // Approved world-v1 cutout: loading-hole centre is 34.3% up from its bottom.
        artUI.setAnchorPoint(.5,this.round.region==='magic'?.29:this.round.region==='toy'?.33:ocean?.343:0);
        if(this.round.region!=='cloud'){const frame=art.getComponent(Sprite)!.spriteFrame;artUI.setContentSize(this.round.region==='toy'?188:crafted?158:128,frame?(this.round.region==='toy'?188:crafted?158:128)*frame.originalSize.height/frame.originalSize.width:150);}
        else artUI.setContentSize(96,118);
        art.setPosition(0,this.round.region!=='cloud'?0:-52);
        pivot.getChildByName('CurrentBall')!.setSiblingIndex(this.round.region!=='cloud' ? pivot.children.length-1 : 0);
        const pedestal=launcher.getChildByName('Pedestal')!;
        const baseFrame=pedestal.getComponent(Sprite)!.spriteFrame;
        pedestal.getComponent(UITransform)!.setContentSize(ocean?128:192,ocean&&baseFrame?128*baseFrame.originalSize.height/baseFrame.originalSize.width:128);
        pedestal.getComponent(UITransform)!.setAnchorPoint(.5,ocean?.5:.125);
        // Keep the pedestal below the transparent loading port, with overlap at the lower rim.
        pedestal.setPosition(ocean?pivot.position.x:0,ocean?pivot.position.y-65:0);
        if(crafted){
            pedestal.getComponent(UITransform)!.setAnchorPoint(.5,.5);
            pedestal.getComponent(UITransform)!.setContentSize(this.round.region==='toy'?126:164,baseFrame?(this.round.region==='toy'?126:164)*baseFrame.rect.height/baseFrame.rect.width:70);
            pedestal.setPosition(pivot.position.x,pivot.position.y-(this.round.region==='toy'?55:47));
        }
        launcher.setPosition(PIVOT.x - pivot.position.x, PIVOT.y - pivot.position.y);
        const background=this.node.getChildByName('Background')!,frame=background.getComponent(Sprite)?.spriteFrame;
        const cover=frame?Math.max(width/frame.originalSize.width,height/frame.originalSize.height):1;
        background.getComponent(UITransform)!.setContentSize(frame?frame.originalSize.width*cover:layout.backgroundWidth,frame?frame.originalSize.height*cover:layout.backgroundHeight);
        this.node.getChildByName('Foreground')!.setPosition(0, -height / 2);
        this.islands=[];
        this.node.getChildByName('Environment')!.children.forEach((island) => {
            island.setPosition(island.position.x, layout.decorationTop);
            island.setScale(layout.islandScale, layout.islandScale, 1);
            this.islands.push({node:island,x:island.position.x,y:layout.decorationTop,scale:layout.islandScale});
        });
        this.node.getChildByName('Pause')!.setPosition(layout.pauseX, layout.pauseY);
        this.node.getChildByName('Rules')?.setPosition(layout.pauseX-92,layout.pauseY);
        this.scoreHUD?.layout(-width / 2 + 24, layout.pauseY);
        const cloud = this.node.getChildByName('CloudTransition');
        const ledgeSprite=cloud?.getComponent(Sprite),ledgeFrame=ledgeSprite?.spriteFrame;
        if(ledgeSprite)ledgeSprite.trim=ocean;
        const ledgeHeight=crafted&&ledgeFrame?width*ledgeFrame.rect.height/ledgeFrame.rect.width:ocean&&ledgeFrame?width*ledgeFrame.rect.height/ledgeFrame.rect.width:layout.cloudHeight;
        const ledgeY=crafted?layout.playY+444*layout.scale+ledgeHeight/2:ocean?layout.playY+526*layout.scale:layout.cloudY;
        cloud?.setPosition(0,ledgeY);
        cloud?.getComponent(UITransform)?.setContentSize(width,ledgeHeight);
        const clipBottom = ledgeY - (crafted?ledgeHeight*.38:ocean ? ledgeHeight*.14 : layout.cloudHeight*.12);
        this.regionalAmbient?.layout(width,height,layout.safeTopY,layout.safeBottomY,ledgeY);
        this.bossHealthRoot?.setPosition(0, layout.healthY);
        this.bossHealthRoot?.setScale(layout.scale * .48, layout.scale * .48, 1);
        if(this.oceanBossNode){
            const available=Math.max(1,layout.safeTopY-18-clipBottom);
            // Fit the complete reclining silhouette, reserving room for cast sway and breathing.
            const scale=Math.min(width*.98/720,available/((this.oceanBoss?.battleHeight ?? 270)+32));
            this.oceanBossNode.setScale(scale,scale,1);
            this.oceanBossNode.setPosition(0,-4*scale);
        }
        if (this.bossRoot) {
            const body=this.bossRoot.getChildByName('Body')!,bodyUI=body.getComponent(UITransform)!;
            // Cloud body's authored rest pose is y=30 with a low anchor. Dock its actual
            // bottom while preserving its original size and top-limited short-screen pose.
            const cloudBodyBottom=30-bodyUI.height*bodyUI.anchorY;
            this.bossScale = crafted?Math.min(width/(this.round.region==='toy'?690:765),Math.max(1,layout.safeTopY-26-clipBottom)/(this.round.region==='toy'?315:365)):layout.bossScale;
            // Clip inside the region's opaque ledge so lower body/entrance never leaks below it.
            this.bossClip?.setPosition(0, clipBottom);
            this.bossClip?.getComponent(UITransform)?.setContentSize(width, height / 2 - clipBottom);
            this.bossBaseY = crafted?-BOSS_DOCK_OVERLAP:Math.min(-BOSS_DOCK_OVERLAP,height/2-342*this.bossScale-12-clipBottom+cloudBodyBottom*this.bossScale);
            const bodyDockY=body.position.y-bodyUI.height*bodyUI.anchorY*body.scale.y;
            this.bossRoot.setPosition(0, this.bossBaseY-(crafted?0:bodyDockY*this.bossScale));
            this.bossRoot.setScale(this.bossScale, this.bossScale, 1);
            this.bossRoot.getChildByName('LeftFist')!.setPosition(-200, 175);
            this.bossRoot.getChildByName('RightFist')!.setPosition(200, 175);
        }
    }

    private canInteract(): boolean {
        // Direct scene preview exercises the prototype without creating a global Session.
        return this.localPage==='playing' && !this.pauseNavigation && !this.campaignView?.visible && !this.regionalBoss?.busy && !this.magicView?.busy && this.railMotion.length===0 && this.viewBuilt && !this.transitionView?.active && this.oceanCastAge<0 && !this.oceanBoss?.busy && this.bossCast === 0 && !this.attack && !this.rewardView?.visible && !this.endView?.visible && !this.pauseView?.visible && !this.tutorialView?.visible && this.round.stage !== 'boss-entry' && this.bossReveal >= 1 && !this.flight && this.transition === 0 && this.rowBirths.length === 0 && !this.effects.some(e => !e.falling) && this.effects.length < 285 && (this.state === 'playing' || (this.state === 'idle' && !this.context));
    }

    private startAim(event: EventTouch): void {
        if (this.activeTouch !== undefined || this.heldTouch) return;
        if (this.state !== 'playing' && !(this.state === 'idle' && !this.context)) return;
        if (this.pauseView?.visible || this.endView?.visible || this.rewardView?.visible) return;
        const point = event.getUILocation();
        this.heldTouch = {id:event.getID(),x:point.x,y:point.y};
        if (!this.canInteract()) return;
        if (this.selectedItem === 'clear-bottom') {
            this.selectedItem = undefined;
            this.cancelAim();
            this.syncItems();
            this.syncSupply();
            return;
        }
        this.activeTouch = event.getID();
        this.aim(event);
    }

    private aim(event: EventTouch): void {
        const point = event.getUILocation();
        if (this.heldTouch?.id === event.getID()) { this.heldTouch.x=point.x; this.heldTouch.y=point.y; }
        if (!this.canInteract() || event.getID() !== this.activeTouch) return;
        this.aimAt(point.x, point.y);
    }

    private aimAt(x: number, y: number): void {
        const play = this.node.getChildByName('Playfield')!;
        const local = play.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(x, y, 0));
        const last = this.lastAim;
        if (last && last.x === local.x && last.y === local.y && last.revision === this.model.revision
            && last.item === this.selectedItem && last.region === this.round.region) return;
        if (local.y < DANGER) {
            this.pendingShot = undefined;
            this.clearAim();
            return;
        }
        const pivot = play.getChildByPath('Launcher/TurretPivot')!;
        const dx = local.x - PIVOT.x;
        const dy = local.y - PIVOT.y;
        const angle = Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, -Math.atan2(dx, dy) * 180 / Math.PI));
        this.turretReturn = undefined;
        pivot.angle = angle;
        pivot.getChildByName('CurrentBall')!.angle = 0;
        const radians = -angle * Math.PI / 180;
        this.pendingShot = this.model.trace({ x: Math.sin(radians), y: Math.cos(radians) });
        if (this.selectedItem === 'bomb' && this.pendingShot && !this.model.bombTargets(this.pendingShot.cell).length) this.pendingShot = undefined;
        this.drawAim();
        this.lastAim = { x: local.x, y: local.y, revision: this.model.revision, item: this.selectedItem, region: this.round.region };
    }

    private cancelAim(event?: EventTouch, preserveHeld = false): void {
        if (event && event.getID() !== this.activeTouch && event.getID() !== this.heldTouch?.id) return;
        if (!preserveHeld) this.heldTouch = undefined;
        this.activeTouch = undefined;
        this.pendingShot = undefined;
        this.clearAim();
        const pivot = this.node.getChildByPath('Playfield/Launcher/TurretPivot');
        if (!pivot) return;
        if (Math.abs(pivot.angle) > .01 && !this.turretReturn) this.turretReturn = { from: pivot.angle, elapsed: 0 };
        pivot.getChildByName('CurrentBall')!.angle = 0;
    }

    private swap(event: EventTouch): void {
        event.propagationStopped = true;
        if (!this.canInteract()) return;
        this.selectedItem = undefined;
        if (this.round.refreshStale() === 0) this.round.swap();
        this.cue('swap'); this.commitCheckpoint();
        this.syncItems();
        this.cancelAim();
        this.syncSupply();
    }

    private clearAim(): void {
        this.lastAim = undefined;
        this.node.getChildByPath('Playfield/AimFeedback')?.getComponent(Graphics)?.clear();
    }

    private drawAim(): void {
        const root = this.node.getChildByPath('Playfield/AimFeedback')!;
        const g = root.getComponent(Graphics) ?? root.addComponent(Graphics);
        g.clear();
        if (!this.pendingShot) return;
        const ocean = this.round.region === 'ocean';
        const toy = this.round.region === 'toy';
        const magic = this.round.region === 'magic';
        const outlined = ocean || toy || magic;
        const largeDots = toy || magic;
        const outlineColor = magic ? new Color(32, 22, 61, 255) : new Color(13, 43, 66, 245);
        const highlightColor = magic ? new Color(221, 255, 236, 255) : new Color(255, 246, 214, 255);
        const points = this.pendingShot.points;
        const dots = (radius: number, color: Color): void => {
            g.fillColor = color;
            for (let i=1; i<points.length; i++) {
                const a=points[i-1]!, b=points[i]!;
                const length=Math.hypot(b.x-a.x,b.y-a.y);
                for(let t=12;t<length;t+=24) {
                    g.circle(a.x+(b.x-a.x)*t/length,a.y+(b.y-a.y)*t/length,radius);
                }
            }
            g.fill();
        };
        if (outlined) dots(largeDots ? 7 : 6, outlineColor);
        dots(largeDots ? 4.8 : ocean ? 4.2 : 4, outlined ? highlightColor : new Color(237, 105, 153, 200));
        const end=this.model.position(this.pendingShot.cell);
        if (outlined) {
            g.lineWidth = largeDots ? 8 : 6; g.strokeColor = outlineColor;
            g.circle(end.x,end.y,DIAMETER / 2 - 2); g.stroke();
        }
        g.lineWidth=3;
        g.strokeColor = outlined ? highlightColor : new Color(237,105,153,220);
        g.circle(end.x,end.y,DIAMETER / 2 - 2);
        g.stroke();
        if (this.selectedItem === 'bomb') this.drawTargets(this.model.bombTargets(this.pendingShot.cell), false);
    }

    private fire(event: EventTouch): void {
        if (event.getID() !== this.heldTouch?.id && event.getID() !== this.activeTouch) return;
        if (!this.canInteract()) { this.cancelAim(event); return; }
        if (this.activeTouch === undefined) this.activeTouch=event.getID();
        this.aim(event);
        const shot=this.pendingShot;
        this.activeTouch=undefined;
        this.pendingShot=undefined;
        this.clearAim();
        if (!shot) { this.cancelAim(); return; }
        this.cue('shot');
        const kind: ShotKind = !this.campaignRound && (this.selectedItem === 'bomb' || this.selectedItem === 'wildcard') ? this.selectedItem : 'normal';
        if (kind !== 'normal') this.round.consumeProjectile(kind);
        const projectile=this.createBall(this.node.getChildByPath('Playfield/Vfx')!, this.currentColor);
        this.setProjectileAppearance(projectile,kind,this.currentColor);
        this.selectedItem = undefined;
        this.syncItems();
        projectile.setPosition(shot.points[0]!.x,shot.points[0]!.y);
        this.flight={shot,node:projectile,segment:1,travelled:0,kind,age:0,trailClock:0};
        if(this.juice){this.juice.theme=this.round.region;
            this.juice.launch(this.node.getChildByPath('Playfield/Launcher/TurretPivot/TurretArtwork')!,shot.points[0]!);}
        this.cancelAim();
        this.node.getChildByPath('Playfield/Launcher/TurretPivot/CurrentBall')!.active=false;
    }

    protected update(dt: number): void {
        if (this.state === 'disposed') return;
        if (!this.viewBuilt) {
            this.transitionView?.update(dt);
            return;
        }
        this.campaignView?.update(dt);
        this.pauseView?.update(dt); this.endView?.update(dt); this.rewardView?.update(dt);this.tutorialView?.update(dt);this.campaignResultView?.update(dt);
        const rules=this.node.getChildByName('Rules');if(rules)rules.active=this.node.getChildByName('Pause')!.active&&!this.tutorialView?.visible;
        this.updateAtmosphere(Math.max(0,Math.min(dt,.05)));
        this.regionalAmbient?.setVisible(!this.rewardView?.visible&&!this.endView?.visible);
        if (this.state === 'paused') return;
        if (this.transitionView?.active) { this.transitionView.update(dt); return; }
        if(this.pauseNavigation||this.localPage==='modes'||this.localPage==='levels')return;
        if (this.campaignView?.visible || this.campaignResultView?.visible || this.rewardView?.visible || this.endView?.visible || this.pauseView?.visible || this.tutorialView?.visible) return;
        if(this.campaignRound && this.state==='playing' && this.rowBirths.length===0 && this.transition===0 && this.campaignRound.level.tutorialKeys.some(k=>this.campaignProgress.tutorialKeys.indexOf(k)<0)){this.requestRules();return;}
        if(!this.campaignRound && this.tutorialPending && this.state==='playing'){this.tutorialPending=false;this.requestRules();return;}
        this.comboView?.update(dt);
        this.scoreHUD?.update(dt);
        if(this.railMotion.length) this.railMotion=this.railMotion.filter(m=>{
            m.age+=Math.min(dt,.05);const t=Math.max(0,Math.min(1,m.age/.28)),u=t*t*(3-2*t);
            m.node.setPosition(m.from.x+(m.to.x-m.from.x)*u,m.to.y,0);return t<1;
        });
        this.oceanAmbient?.update(dt);this.magicView?.update(dt);this.toyView?.update(dt);this.regionalAmbient?.update(dt,true);
        if (this.state === 'playing' || this.state === 'idle') this.elapsed += Math.max(0, dt);
        this.particles?.update(Math.min(dt, .05));
        this.juice?.update(Math.min(dt,.05));
        this.foreground?.update(Math.min(dt,.05),this.round.region,!this.round.ended && this.round.stage!=='boss-entry');
        if(this.campaignRound?.ended && !this.comboView?.pending && !this.flight && !this.attack && this.effects.length===0
            && this.railMotion.length===0 && this.transition===0 && this.rowBirths.length===0 && this.oceanCastAge<0 && !this.oceanBoss?.busy && !this.regionalBoss?.busy){this.showCampaignResult();return;}
        if (!this.campaignRound && !this.comboView?.pending && this.round.ended && this.round.stage !== 'victory' && !this.flight && !this.attack
            && this.hitTime === 0 && this.effects.length === 0 && this.railMotion.length===0 && this.transition === 0 && this.oceanCastAge<0 && !this.oceanBoss?.busy) {
            const ads = this.context?.services.ads;
            const available = !ads || ads.isEnabledForGame(this.context!.gameId);
            this.showEnd(this.round.canRevive && available ? 'offer' : 'result');
            return;
        }
        if (!this.comboView?.pending && this.round.rewardAvailable && this.defeatElapsed >= 1.1 && !this.attack && !this.flight && this.effects.length === 0) {
            this.showReward();
            return;
        }
        if (this.transition > 0 && !this.regionalBoss?.charging) {
            this.transition = Math.max(0, this.transition - Math.min(dt, 0.05));
            const board = this.node.getChildByPath('Playfield/Board')!;
            board.setPosition(0, this.transitionOffset * (this.transition / 0.3) ** 2);
        }
        this.updatePresentation(Math.min(dt, .05));
        if (this.heldTouch && this.canInteract()) {
            this.activeTouch=this.heldTouch.id;
            this.aimAt(this.heldTouch.x,this.heldTouch.y);
        }
        this.pulseTime += Math.min(dt, 0.05);
        this.updateCampaignTargets();
        if(this.selectedItem==='clear-bottom')this.drawTargets(this.model.bottomTargets(),true);
        const activeCount = this.round.stage === 'boss' ? this.round.bossShots : this.round.accumulatedMisses;
        const limit = this.round.stage === 'boss' ? BOSS_TUNING.shotsPerAction : ORDINARY_TUNING.missesPerRow;
        const critical = activeCount === limit - 1;
        this.counterBeads.forEach((bead, index) => {
            const scale = critical && index < activeCount ? 1 + 0.06 * Math.sin(this.pulseTime * 5) : 1;
            bead.setScale(scale, scale, 1);
        });
        this.updateAttack(Math.min(dt, 0.05));
        this.updateBoss(Math.min(dt, 0.05));
        if (!this.comboView?.pending && this.round.stage === 'boss-entry' && !this.flight && !this.attack
            && this.effects.length === 0 && (this.particles?.count ?? 0) === 0 && !this.juice?.busy
            && this.rowBirths.length === 0 && this.transition === 0) {
            this.cue('boss-enter');
            this.transitionView!.showAlert(() => {
                this.round.beginBoss();
                if(this.round.region==='ocean'){this.oceanBoss?.resetPose();this.oceanBoss?.enter();}
                this.music('boss-music'); this.commitCheckpoint();
                this.bossReveal = 0; this.transition = 0.3; this.transitionOffset = 28;
                this.syncBoard(false, true); this.syncCounter(); this.syncSupply(); this.syncBoss(); this.updateBoss(0);
            });
            return;
        }
        const flight=this.flight;
        if (flight) {
            flight.age+=Math.min(dt,.05); flight.trailClock+=Math.min(dt,.05);
            let remaining=SHOT_SPEED*Math.min(dt,0.05);
            while (this.flight && remaining>0) {
                const a=flight.shot.points[flight.segment-1]!, b=flight.shot.points[flight.segment]!;
                const length=Math.hypot(b.x-a.x,b.y-a.y);
                const step=Math.min(remaining,Math.max(0,length-flight.travelled));
                flight.travelled+=step;
                remaining-=step;
                const t=length>0?flight.travelled/length:1;
                flight.node.setPosition(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
                const stretch=.2*Math.exp(-flight.age*7)+.045;
                flight.node.angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI-90;
                flight.node.setScale(1-stretch*.55,1+stretch,1);
                if(flight.trailClock>=.025){this.juice?.trail(flight.node.position);flight.trailClock=0;}
                if(t<1) break;
                flight.segment++;
                if (flight.segment < flight.shot.points.length) {this.cue('bounce');this.juice?.ripple(b,.35);}
                flight.travelled=0;
                if(flight.segment>=flight.shot.points.length) {
                    flight.node.destroy();
                    this.flight=undefined;
                    this.finishShot(flight.shot, flight.kind);
                }
            }
        }
        if(this.effects.length) this.effects = this.effects.filter(effect => {
            effect.elapsed += Math.min(dt, .05) * (effect.falling ? 1 : POP_SPEED);
            const pose = sampleRemoval(effect.motion, effect.elapsed);
            effect.node.setPosition(pose.x, pose.y); effect.node.setScale(pose.sx, pose.sy, 1);
            effect.node.angle = pose.angle; effect.node.getComponent(UIOpacity)!.opacity = pose.opacity;
            if (!effect.falling && !effect.burst && pose.age >= POP_BURST_TIME) {
                effect.burst = true;
                this.particles?.burst(effect.bubble, effect.motion);
                if (effect.bubble.frosted) this.particles?.burst(effect.bubble, effect.motion, true);
            }
            if (effect.ring) {
                const ring = effect.ring, t = Math.max(0, Math.min(1, (pose.age - POP_BURST_TIME) / .16));
                ring.clear();
                if (pose.age >= POP_BURST_TIME && t < 1) {
                    ring.lineWidth = 2 * (1 - t);
                    ring.strokeColor = this.round.region==='ocean'?new Color(158,245,255,210*(1-t)):this.round.region==='toy'?new Color(255,207,92,230*(1-t)):this.round.region==='magic'?new Color(186,215,255,240*(1-t)):new Color(255, 237, 246, 210 * (1 - t));
                    ring.circle(0, 0, DIAMETER * (.45 + .28 * t)); ring.stroke();
                }
            }
            if (!pose.done) return true;
            effect.node.destroy(); return false;
        });
    }

    private finishShot(shot: Shot, kind: ShotKind = 'normal'): void {
        if (kind !== 'normal') this.cue(kind);
        const point=this.model.position(shot.cell);
        const before=this.model.bubbles;
        const result=this.round.settle(shot.cell, kind);
        if(this.round.region==='ocean' && this.round.stage==='boss' && result.supported.length)
            this.oceanTargets=result.supported.map(bubble=>({bubble,color:before.find(b=>b.row===bubble.row-(result.inserted?1:0)&&b.col===bubble.col)?.color??this.currentColor}));
        // Propagate the pop from the contact point, not model iteration order.
        result.removed.sort((a,b)=>{
            const pa=position(a,result.phaseBefore),pb=position(b,result.phaseBefore);
            return Math.hypot(pa.x-point.x,pa.y-point.y)-Math.hypot(pb.x-point.x,pb.y-point.y);
        });
        this.presentResult(result, before);
        if(!result.refilled) {
            const contact={x:point.x,y:point.y-((result.inserted||result.descended)?ROW_HEIGHT:0)};
            const newborns=new Set(this.rowBirths.map(b=>b.node));
            this.juice?.attach(this.node.getChildByPath('Playfield/Board')!.children.filter(n=>!newborns.has(n)&&!this.railMotion.some(m=>m.node===n)),contact,point);
        }
    }

    private presentResult(result: OrdinaryResult, before: readonly Bubble[]): void {
        const firstEffect=this.effects.length;
        this.commitCheckpoint();
        if(this.particles)this.particles.theme=this.round.region;
        if(this.juice)this.juice.theme=this.round.region;
        if (result.removed.length) this.cue('pop', 'light'); else this.cue('attach');
        if (result.dropped.length||result.railDropped.length) this.cue('drop');
        if (result.thawed.length) this.cue('thaw');
        if (result.frosted.length && this.round.stage !== 'boss') this.cue('frost');
        if (this.round.region==='ocean' && this.round.stage==='boss' && result.inserted) {
            this.oceanCastAge=0;this.oceanBoss?.cast();this.cue('ocean-cast');
        }
        if (this.round.region==='cloud' && this.round.stage === 'boss' && (result.frosted.length || result.inserted)) {
            this.bossCast = CLOUD_CAST_DURATION; this.castImpactPlayed = false;
            this.castFrozen.clear();
            result.frosted.forEach(b => this.castFrozen.add(`${b.row}:${b.col}`));
        }
        if (result.inserted || result.descended || result.refilled) this.cue('row');
        if ((this.round.stage === 'boss' && this.round.bossShots === BOSS_TUNING.shotsPerAction - 1)
            || (this.round.stage === 'ordinary' && this.round.accumulatedMisses === ORDINARY_TUNING.missesPerRow - 1)) this.cue('warning');
        result.removed.forEach((b, i) => this.animateRemoval(b, false, result.phaseBefore, i));
        const dropStarts = dropStartTimes(before, result.removed, result.dropped, result.phaseBefore);
        result.dropped.forEach((b, i) => this.animateRemoval(b, true, result.phaseBefore, i, dropStarts.get(`${b.row}:${b.col}`) ?? 0));
        result.thawed.forEach(b =>
            this.particles?.burst(b, position(b, result.phaseBefore), true));
        this.syncBoard(result.inserted || result.descended, result.refilled);
        if(result.railMoved.length && !result.refilled) {
            this.cue('rail','light');
            const board=this.node.getChildByPath('Playfield/Board')!;
            const shift=this.round.stage==='boss'?0:(result.inserted||result.descended?1:0);
            const bubbles=this.model.bubbles;
            result.railMoved.forEach(m=>{const i=bubbles.findIndex(b=>m.id?b.id===m.id:b.row===m.to.row+shift&&b.col===m.to.col);if(i<0)return;
                const node=board.children[i],to=node.position.clone(),from=new Vec3(to.x+(m.from.col-m.to.col)*DIAMETER,to.y,0);
                node.setPosition(from);this.railMotion.push({node,from,to,age:0});});
        }
        result.railDropped.forEach((b,i)=>this.animateRemoval(b,true,result.railPhase,i,result.toySkill&&this.round.stage==='boss'?.7:0));
        if(result.runed.length){this.magicView?.cast(result.runed,this.model,this.node.getChildByPath('Playfield/Board')!,this.frames,this.round.stage==='boss' && result.inserted ? .7 : 0);this.cue('rune','light');}
        if(this.regionalBoss && this.round.stage==='boss' && (result.inserted||result.toySkill)){
            this.bossCast=1.3;this.castImpactPlayed=true;
            const targets=this.round.region==='toy'
                ?this.round.rails.map(r=>this.model.position({row:r.row,col:(r.start+r.end)/2}))
                :result.runed.map(b=>this.model.position(b));
            this.regionalBoss.cast(targets.length?targets:[{x:-170,y:340},{x:170,y:340}]);
            this.toyView?.construct(result.railBuilt,this.round);
            this.rowBirths.forEach(b=>b.delay+=.7);this.railMotion.forEach(m=>m.age-=.7);
        }
        const cleared=[...result.removed,...result.dropped,...result.railDropped];
        if(cleared.length>0){
            const center=result.removed.length?result.removed:cleared;
            const points=center.map(b=>position(b,result.phaseBefore));
            const point={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
            // Start feedback with the last removal, including delayed rail drops.
            // Pop motions use an accelerated clock; falling motions use real seconds.
            const delay=this.effects.slice(firstEffect).reduce((start,e)=>Math.max(start,
                e.motion.delay/(e.falling?1:POP_SPEED)),0);
            const portions=COLORS.map(color=>({color,points:result.scoreGained*cleared.filter(b=>b.color===color).length/cleared.length}))
                .filter(portion=>portion.points>0);
            const droppedCount=result.dropped.length+result.railDropped.length;
            if(this.campaignRound)this.comboView?.showMatch(result.removed.length,point,delay,droppedCount);
            else this.comboView?.show(result.removed.length,point,delay,portions,droppedCount);
        }
        if (this.bossCast > 0) this.updateBoss(0);
        if (result.damage > 0) this.startAttack(result);
        this.syncBoss();
        if (result.inserted || result.descended || result.refilled) {
            this.transition = 0.3;
            this.transitionOffset = (result.inserted || result.descended) ? ROW_HEIGHT : 36;
            this.node.getChildByPath('Playfield/Board')!.setPosition(0, this.transitionOffset);
        }
        this.syncCounter();
        this.syncItems();
        this.syncSupply();
        this.cancelAim(undefined, !result.danger && !result.victory);
        if (result.danger || result.victory) {
            // Freeze input immediately; the overlay waits for the complete turn animation.
            this.state = 'completed';
        }
    }

    private animateRemoval(bubble: Bubble, falling: boolean, phase: number, order = 0, delay = 0): void {
        const ball = this.createBall(falling ? this.fallingRoot! : this.node.getChildByPath('Playfield/Vfx')!, bubble.color, bubble.frosted, bubble.indestructible);
        const goal = this.campaignRound?.level.goal;
        // Settlement removes active target IDs before their pop/drop animation starts.
        if (goal && 'bubbleIds' in goal && bubble.id && goal.bubbleIds.indexOf(bubble.id) >= 0) this.addCampaignTarget(ball);
        const point = position(bubble, phase);
        ball.setPosition(point.x, point.y);
        ball.addComponent(UIOpacity);
        let ring: Graphics | undefined;
        if (!falling) {
            const rim = new Node('PopRim'); rim.layer = ball.layer; rim.setParent(ball);
            rim.addComponent(UITransform); ring = rim.addComponent(Graphics);
        }
        const motion=removalMotion(bubble, point, falling, order);
        if (falling) motion.delay = delay;
        this.effects.push({ node: ball, elapsed: 0, falling, motion, bubble, burst: false, ring });
    }

    private createBall(parent: Node, color: BubbleColor, frosted=false, indestructible=false): Node {
        const ball=new Node(indestructible ? 'SupportBubble' : 'Bubble');
        ball.layer=parent.layer;
        ball.setParent(parent);
        ball.addComponent(UITransform).setContentSize(DIAMETER,DIAMETER);
        const sprite=ball.addComponent(Sprite);
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        sprite.trim=false;
        sprite.spriteFrame=indestructible ? this.supportFrame : this.frames.get(color)!;
        if(frosted) {
            const frost=new Node('Frosting');
            frost.layer=parent.layer;
            frost.setParent(ball);
            frost.addComponent(UITransform).setContentSize(DIAMETER * 1.12,DIAMETER * 1.12);
            const overlay=frost.addComponent(Sprite);
            overlay.sizeMode=Sprite.SizeMode.CUSTOM;
            overlay.spriteFrame=this.frostFrame!;
        }
        return ball;
    }

    private addCampaignTarget(ball: Node): CampaignTargetVisual {
        const marker = new Node('CampaignTarget');
        marker.layer = ball.layer; marker.setParent(ball);
        marker.addComponent(UITransform).setContentSize(DIAMETER, DIAMETER);
        const radius = DIAMETER * .425;
        // Four pearl arcs follow the bubble surface without covering its color or symbol.
        const arcs = (graphics: Graphics): void => {
            graphics.lineCap = Graphics.LineCap.ROUND;
            for (let i = 0; i < 4; i++) {
                const start = i * Math.PI / 2 + Math.PI / 12;
                graphics.arc(0, 0, radius, start, start + Math.PI / 3, true);
            }
            graphics.stroke();
        };
        const glowNode = new Node('TargetGlow');
        glowNode.layer = ball.layer; glowNode.setParent(marker);
        glowNode.addComponent(UITransform).setContentSize(DIAMETER, DIAMETER);
        const halo = glowNode.addComponent(Graphics);
        halo.lineWidth = 11; halo.strokeColor = new Color(100, 255, 220, 50); arcs(halo);
        halo.lineWidth = 8; halo.strokeColor = new Color(123, 255, 229, 110); arcs(halo);
        halo.lineWidth = 5.5; halo.strokeColor = new Color(175, 255, 242, 210); arcs(halo);
        const glow = glowNode.addComponent(UIOpacity); glow.opacity = 150;
        const rimNode = new Node('TargetRim');
        rimNode.layer = ball.layer; rimNode.setParent(marker);
        rimNode.addComponent(UITransform).setContentSize(DIAMETER, DIAMETER);
        const rim = rimNode.addComponent(Graphics);
        rim.lineWidth = 5; rim.strokeColor = new Color(39, 103, 106, 150); arcs(rim);
        rim.lineWidth = 3.4; rim.strokeColor = new Color(249, 255, 251); arcs(rim);
        return { glow };
    }

    private updateCampaignTargets(): void {
        if (!this.campaignRound) return;
        const breath = .5 + .5 * Math.sin(this.pulseTime * Math.PI);
        this.boardVisuals.forEach(visual => {
            if (!visual.target) return;
            visual.target.glow.opacity = 100 + 130 * breath;
        });
    }

    private syncBoard(birthRow = false, wholeBoard = false): void {
        this.railMotion=[];this.toyView?.sync(this.round);this.magicView?.cancelCast();this.magicView?.sync(this.round);
        this.rowBirths = [];
        this.juice?.clear();
        const board=this.node.getChildByPath('Playfield/Board')!;
        const previous = this.boardVisuals;
        const next = new Map<string, BoardBubbleVisual>();
        const bubbles = this.model.bubbles;
        bubbles.forEach(b=>{
            const pending=this.oceanCastAge>=0 && this.oceanCastAge<1.2?this.oceanTargets.find(t=>t.bubble.row===b.row&&t.bubble.col===b.col):undefined;
            const key = `${b.row}:${b.col}`;
            const color = pending?.color ?? b.color, solid = !!b.indestructible && !pending;
            const target=this.campaignRound?.isTarget(b)??false;
            const appearance = `${this.round.region}:${color}:${solid}:${b.frosted}:${b.runeNext ?? ''}:${target ? this.campaignRound!.level.goal.kind : ''}`;
            const old = previous.get(key);
            const frame = solid ? this.supportFrame : this.frames.get(color)!;
            const reusable = old?.node.isValid && old.node.parent === board && old.appearance === appearance
                && old.node.getComponent(Sprite)!.spriteFrame === frame;
            const node = reusable ? old!.node : this.createBall(board,color,b.frosted,solid);
            if (!reusable && b.runeNext) BubbleShooterMagicView.addRune(node,this.frames.get(b.runeNext)!);
            const targetVisual = target ? (reusable ? old!.target : this.addCampaignTarget(node)) : undefined;
            // Match a freshly built board, including interrupted births and frost pulses.
            node.setScale(1,1,1); node.angle=0;
            const opacity=node.getComponent(UIOpacity); if(opacity)opacity.opacity=255;
            const frost=node.getChildByName('Frosting');
            if(frost){frost.setScale(1,1,1);const opacity=frost.getComponent(UIOpacity);if(opacity)opacity.opacity=255;}
            next.set(key,{node,appearance,target:targetVisual});
            const point=this.model.position(b);
            node.setPosition(point.x,point.y);
            if (wholeBoard || (birthRow && b.row === 0)) {
                (node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)).opacity = 0; node.setScale(.05,.05,1);
                this.rowBirths.push({node, elapsed:0, delay:wholeBoard ? b.row * .055 + b.col * .008 : b.col * .006, y:point.y});
            }
        });
        const retained = new Set(Array.from(next.values(), visual => visual.node));
        for (const child of board.children.slice()) {
            if (!retained.has(child)) { child.removeFromParent(); child.destroy(); }
        }
        // Boss/rune/rail presentation uses the model's insertion order as its node index.
        let index=0;
        next.forEach(visual=>visual.node.setSiblingIndex(index++));
        this.boardVisuals=next;
    }

    /** Toolbar padding must not shrink loaded items; flight uses the same visual size. */
    private setProjectileAppearance(node: Node, kind: ShotKind, color: BubbleColor): void {
        const sprite=node.getComponent(Sprite)!;
        sprite.spriteFrame=kind==='normal' ? this.frames.get(color)! : this.itemFrames.get(kind)!;
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        sprite.trim=false;
        const size=DIAMETER * (kind==='bomb' ? 1.32 : kind==='wildcard' ? 1.4 : 1);
        node.getComponent(UITransform)!.setContentSize(size,size);
    }

    private syncSupply(): void {
        const current=this.node.getChildByPath('Playfield/Launcher/TurretPivot/CurrentBall')!;
        current.active = !this.flight;
        const kind = !this.campaignRound && (this.selectedItem === 'bomb' || this.selectedItem === 'wildcard') ? this.selectedItem : 'normal';
        this.setProjectileAppearance(current,kind,this.currentColor);
        this.node.getChildByPath('Playfield/Launcher/NextBall')!.getComponent(UITransform)!.setContentSize(DIAMETER, DIAMETER);
        this.node.getChildByPath('Playfield/Launcher/NextBall')!.getComponent(Sprite)!.spriteFrame=this.frames.get(this.nextColor)!;
    }

    private showReward(): void {
        this.particles?.clear(); this.juice?.clear();this.comboView?.clear();
        this.cue('reward'); this.sound.music('reward-music');
        this.node.getChildByName('Playfield')!.active = false;
        this.node.getChildByName('Pause')!.active = false;
        this.node.getChildByName('Environment')!.active = false;
        this.bossRoot!.active = false;
        if(this.oceanBossNode)this.oceanBossNode.active=false;
        this.foreground?.update(0,this.round.region,false);
        this.bossHealthRoot!.active = false;
        this.node.getChildByName('CloudTransition')!.active = false;
        this.rewardView!.show(this.round, item => {
            if (!this.round.rewardAvailable || this.transitionView!.active) return;
            this.cue('confirm');
            const next:BubbleRegion=this.round.nextRegion;
            const generation=this.operationGeneration;let prepared:BubbleRegionAssets;let committed=false;
            this.transitionView!.start(async () => {
                prepared=await loadBubbleRegion(this.context!.services.assets!,next,this.context!.services.audio);
                if(generation!==this.operationGeneration)throw new Error('Region transition cancelled.');
            }, () => {
                // A presentation failure can retry without claiming a reward or advancing twice.
                if (!committed) {
                    if (!this.round.claimReward(item)) throw new Error('Reward is no longer available.');
                    if (!this.round.continueRegion(next)) throw new Error('Reward continuation was not committed.');
                    committed=true;
                }
                this.clearAttack(); this.rewardView!.hide();
                this.applyRegionFrames(prepared);this.applyRegionView(prepared);
                this.node.getChildByName('Playfield')!.active = true;
                this.node.getChildByName('Pause')!.active = true;
                this.node.getChildByName('CloudTransition')!.active = true;
                this.node.getChildByPath('Playfield/Board')!.setPosition(0, 0);
                this.healthVisible = this.healthTarget = BOSS_TUNING.health;
                this.hitTime = 0; this.transition = 0; this.transitionOffset = 0;
                this.syncBoss(); this.syncBoard(false, true); this.syncCounter(); this.syncItems(); this.syncSupply(); this.applyLayout();
                this.state = 'playing'; this.music('normal-music'); this.commitCheckpoint();
            });
        });
        this.applyLayout();
    }

    private resetRound(keepProgress = false, keepTransition = false, startRegion = this.round.region): void {
        this.foreground?.reset();
        this.rowBirths=[]; this.turretReturn=undefined;
        if (!keepTransition) this.transitionView?.cancel();
        this.runFinished = false; this.restored = false; this.checkpoint = undefined;
        this.particles?.clear(); this.juice?.clear();this.comboView?.clear();
        this.operationGeneration++;
        this.revivePending = false;
        this.elapsed = 0;
        this.finalResult = undefined;
        this.endView?.hide();
        this.pauseView?.hide();
        this.endView?.setEnabled(true);
        this.clearAttack();
        this.rewardView?.hide();
        this.node.getChildByName('Playfield')!.active = true;
        this.node.getChildByName('Pause')!.active = true;
        this.node.getChildByName('CloudTransition')!.active = true;
        this.cancelAim();
        this.flight?.node.destroy();
        this.flight=undefined;
        this.effects.forEach(e=>e.node.destroy());
        this.effects=[];
        this.transition = 0;
        this.transitionOffset = 0;
        this.pulseTime = 0;
        this.node.getChildByPath('Playfield/Board')!.setPosition(0, 0);
        this.selectedItem = undefined;
        if(!this.campaignRound)this.round.reset(startRegion, keepProgress);
        this.localPage='playing';
        this.oceanBoss?.resetPose();this.oceanCastAge=-1;this.oceanTargets=[];this.oceanDefeating=false;
        this.bossReveal = 1;
        this.hitTime = 0;
        this.healthVisible = this.healthTarget = this.round.bossHealth;
        this.syncBoss();
        this.syncItems();
        this.syncBoard(false, true);
        this.syncCounter();
        this.syncSupply();
    }

    private updateAtmosphere(dt: number): void {
        const blocked=this.state==='paused' || this.endView?.visible || this.pauseView?.visible || this.rewardView?.visible || this.transitionView?.active;
        if(!blocked)this.atmosphereClock+=dt;
        this.islands.forEach((island,i)=>{
            if(!island.node.isValid)return;
            const phase=this.atmosphereClock*1.08+i*2.2;
            // Drift inward/downward from the safe layout anchor, never above it.
            island.node.setPosition(island.x+(i===0?1:-1)*(1+Math.sin(phase*.7))*2,
                island.y-(1+Math.sin(phase))*4);
            const scale=island.scale*(.992+.008*Math.sin(phase+.8));
            island.node.setScale(scale,scale,1);
        });
        const g=this.dangerGlow;if(!g)return;g.clear();
        if(blocked || this.round.ended || this.round.stage==='boss-entry' || !this.model.nearDanger)return;
        const {width,height}=view.getVisibleSize(),thickness=44;
        const strength=.35+.65*(.5+.5*Math.sin(this.atmosphereClock*3.2));
        for(let i=0;i<16;i++) {
            const inset=i*thickness/16,band=thickness/16+.2;
            g.fillColor=new Color(255,65,100,65*strength*Math.pow(1-i/16,1.7));
            g.rect(-width/2+inset,-height/2,band,height);
            g.rect(width/2-inset-band,-height/2,band,height);
            g.rect(-width/2+thickness,-height/2+inset,width-2*thickness,band);
            g.rect(-width/2+thickness,height/2-inset-band,width-2*thickness,band);g.fill();
        }
    }

    private updatePresentation(dt: number): void {
        if (this.turretReturn) {
            const motion = this.turretReturn; motion.elapsed += dt;
            const t = Math.min(1, motion.elapsed / .24);
            this.node.getChildByPath('Playfield/Launcher/TurretPivot')!.angle = motion.from * Math.pow(1-t,3);
            if (t === 1) this.turretReturn = undefined;
        }
        if(this.rowBirths.length) this.rowBirths = this.rowBirths.filter(b => {
            if (!b.node.isValid) return false;
            b.elapsed += dt; const t = Math.max(0, Math.min(1,(b.elapsed-b.delay)/.32));
            const u=t-1, ease=1+2.70158*u*u*u+1.70158*u*u;
            b.node.setScale(.05+.95*ease,.05+.95*ease,1);
            b.node.getComponent(UIOpacity)!.opacity=255*Math.min(1,t*2);
            // Keep local coordinates: newborns travel with the descending board.
            b.node.setPosition(b.node.position.x,b.y);
            return t<1 || this.transition>0;
        });
    }

    private centerCounter(): void {
        const counter=this.node.getChildByPath('Playfield/Counter')!;
        let left=Infinity,right=-Infinity;
        counter.children.forEach(n=>{
            if (!n.active) return;
            const ui=n.getComponent(UITransform); if(!ui)return;
            left=Math.min(left,n.position.x-ui.width*ui.anchorX);
            right=Math.max(right,n.position.x+ui.width*(1-ui.anchorX));
        });
        counter.setPosition(Number.isFinite(left)?-(left+right)/2:0,this.round.region === 'ocean' ? 468 : CLOUD_COUNTER_Y);
    }

    private buildCounter(): void {
        const counter = this.node.getChildByPath('Playfield/Counter')!;
        const slotTemplate = counter.getChildByName('Slot0')!;
        const beadTemplate = counter.getChildByName('Bead0')!;
        const originals = counter.children.slice();
        const width = ORDINARY_TUNING.missesPerRow * 42;
        counter.getComponent(UITransform)!.setContentSize(width + 60, 48);
        this.positionCounterDecor(ORDINARY_TUNING.missesPerRow);
        for (let i = 0; i < ORDINARY_TUNING.missesPerRow; i++) {
            const x = (i - (ORDINARY_TUNING.missesPerRow - 1) / 2) * 42 + 12;
            const slot = instantiate(slotTemplate);
            slot.name = 'LiveSlot' + i;
            slot.setParent(counter);
            slot.setPosition(x, 0);
            const bead = instantiate(beadTemplate);
            bead.name = 'LiveBead' + i;
            bead.setParent(counter);
            bead.setPosition(x, 0);
            this.counterBeads.push(bead);
        }
        originals.forEach(child => {
            if (child.name !== 'DownArrow' && child.name !== 'BossSkill' && child.name !== 'PendingRow') {
                child.removeFromParent(); child.destroy();
            }
        });
    }

    /** 只用已结算的闯关胜利记录上报，进入游戏时也补记已有通关进度。 */
    private syncCampaignAchievementProgress(): void {
        if (this.previewRegion) return;
        const clearedLevel = BUBBLE_LEVELS.reduce((highest, level) =>
            this.campaignProgress.results[level.id] ? Math.max(highest, level.routeIndex) : highest, 0);
        this.context?.reportAchievementProgress('cleared-level', clearedLevel);
    }

    private syncScore(): void {
        if(this.campaignRound)return;
        this.bestScore = Math.max(this.bestScore, this.round.score);
        if (this.reportedScore !== this.round.score) {
            this.context?.reportScore(this.round.score);
            this.reportedScore = this.round.score;
        }
        this.scoreHUD?.set(this.round.score, this.bestScore);
        this.endView?.setScores(this.round.score, this.bestScore);
        this.pauseView?.setScores(this.round.score, this.bestScore);
    }

    private syncProgressHUD(frame?: SpriteFrame): void {
        const play=this.node.getChildByName('Playfield')!;
        let panel=play.getChildByName('RoundProgress');
        if (!panel) {
            if (!frame) return;
            panel=new Node('RoundProgress');panel.layer=play.layer;panel.setParent(play);
            panel.addComponent(UITransform).setContentSize(190,82);panel.setPosition(242,-330);
            const background=new Node('Panel');background.layer=play.layer;background.setParent(panel);
            const scale=82/frame.originalSize.height;
            background.addComponent(UITransform).setContentSize(190/scale,frame.originalSize.height);
            background.setScale(scale,scale,1);
            const sprite=background.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.type=Sprite.Type.SLICED;
            const label=(name:string,text:string,x:number,y:number,width:number,color:Color,numeric=false)=>{
                const node=new Node(name);node.layer=play.layer;node.setParent(panel!);node.setPosition(x,y);
                node.addComponent(UITransform).setContentSize(width,36);
                const value=node.addComponent(Label);value.string=text;value.fontSize=numeric?30:20;value.lineHeight=34;
                setLabelBold(value, true);value.color=color;value.horizontalAlign=Label.HorizontalAlign.CENTER;
                value.verticalAlign=Label.VerticalAlign.CENTER;value.overflow=Label.Overflow.NONE;
                if(numeric){value.enableOutline=true;value.outlineColor=Color.WHITE;value.outlineWidth=2;}
            };
            const ink=new Color(51,63,83);
            label('Prefix','第',0,17,24,ink);label('Round','1',0,17,24,new Color(240,100,12),true);
            label('Suffix','轮',0,17,24,ink);label('DifficultyTitle','难度',0,-17,44,ink);
            label('Difficulty','1',0,-17,24,new Color(164,48,216),true);
        }
        if(frame)panel.getChildByName('Panel')!.getComponent(Sprite)!.spriteFrame=frame;
        panel.getChildByName('Round')!.getComponent(Label)!.string=String(this.round.roundNumber);
        panel.getChildByName('Difficulty')!.getComponent(Label)!.string=String(this.round.difficultyLevel);
        // Measure actual glyph widths, then centre each complete phrase as one unit.
        for (const names of [['DifficultyTitle','Difficulty'],['Prefix','Round','Suffix']]) {
            const nodes=names.map(name=>panel!.getChildByName(name)!);
            nodes.forEach(node=>node.getComponent(Label)!.updateRenderData?.(true));
            const widths=nodes.map(node=>node.getComponent(UITransform)!.width);
            const gap=3,total=widths.reduce((sum,width)=>sum+width,0)+gap*(nodes.length-1);
            const scale=Math.min(1,152/total);
            let x=-total*scale/2;
            nodes.forEach((node,index)=>{
                node.setScale(scale,scale,1);
                node.setPosition(x+widths[index]!*scale/2,node.position.y);
                x+=(widths[index]!+gap)*scale;
            });
        }
    }

    private syncCounter(): void {
        this.syncProgressHUD();
        const counter=this.node.getChildByPath('Playfield/Counter')!;
        this.campaignView?.syncHUD(this.campaignRound);
        const progress=this.node.getChildByPath('Playfield/RoundProgress');if(progress)progress.active=!this.campaignRound;
        if(this.scoreHUD)this.scoreHUD.root.active=!this.campaignRound;
        const pending=counter.getChildByName('PendingRow');
        if (pending) pending.active=this.round.stage==='ordinary' && this.round.remainingRows>0;
        const limit = this.round.stage === 'boss' ? BOSS_TUNING.shotsPerAction : ORDINARY_TUNING.missesPerRow;
        const count = this.round.stage === 'boss' ? this.round.bossShots : this.campaignRound ? this.round.region==='toy'?this.round.railShots:this.round.runeShots : this.round.accumulatedMisses;
        this.node.getChildByPath('Playfield/Counter')!.active = !this.campaignRound || this.round.stage==='boss' || this.round.region==='toy'||this.round.region==='magic';
        if (this.counterBeads.length !== limit) this.rebuildCounter(limit);
        if (this.skillNode) this.skillNode.active = this.round.stage === 'boss';
        this.counterBeads.forEach((bead, index) => {
            bead.active = index < count;
            bead.setScale(1, 1, 1);
        });
        this.centerCounter();
    }

    private blockNoticeTouch(event: EventTouch): void { event.propagationStopped = true; }

    private selectItem(event: EventTouch): void {
        event.propagationStopped = true;
        if (this.campaignRound || !this.canInteract()) return;
        const button = event.currentTarget as Node;
        const key = this.itemKeys.find(item => button.name === 'Item-' + item);
        if (!key || this.round.inventory[key] <= 0) return;
        this.cancelAim();
        if (key === 'clear-bottom' && this.selectedItem === key) {
            this.selectedItem = undefined;
            this.cue('clear-bottom', 'medium');
            const before = this.model.bubbles;
            this.presentResult(this.round.clearBottom(), before);
            return;
        }
        this.selectedItem = this.selectedItem === key ? undefined : key;
        this.cue('select');
        this.syncItems();
        this.syncSupply();
        if (this.selectedItem === 'clear-bottom') this.drawTargets(this.model.bottomTargets(), true);
    }

    private drawTargets(targets: readonly Bubble[], clear: boolean): void {
        const root = this.node.getChildByPath('Playfield/AimFeedback')!;
        const graphics = root.getComponent(Graphics) ?? root.addComponent(Graphics);
        if (clear) {
            graphics.clear();
            const pulse=.5+.5*Math.sin(this.pulseTime*4);
            for(const target of targets) {
                const point=this.model.position(target),radius=DIAMETER/2-1;
                graphics.fillColor=new Color(255,232,246,48+24*pulse);
                graphics.circle(point.x,point.y,radius);graphics.fill();
                graphics.lineWidth=6;
                graphics.strokeColor=new Color(255,69,164,140+55*pulse);
                graphics.circle(point.x,point.y,radius);graphics.stroke();
                graphics.lineWidth=2.5;
                graphics.strokeColor=new Color(255,251,235,225+30*pulse);
                graphics.circle(point.x,point.y,radius-1);graphics.stroke();
            }
            return;
        }
        graphics.lineWidth = 5;
        graphics.strokeColor = new Color(255, 144, 67, 255);
        for (const target of targets) {
            const point = this.model.position(target);
            graphics.circle(point.x, point.y, DIAMETER / 2 - 2);
        }
        graphics.stroke();
    }

    private syncItems(): void {
        const items=this.node.getChildByPath('Playfield/Items')!;
        items.active=!this.campaignRound;
        const names: Record<BubbleItem, string> = { bomb: '炸弹球', wildcard: '万能球', 'clear-bottom': "清底道具" };
        for (const key of this.itemKeys) {
            const button = this.node.getChildByPath('Playfield/Items/Item-' + key)!;
            button.getChildByName('Count')!.getComponent(Label)!.string = String(this.round.inventory[key]);
            button.getChildByName('Name')!.getComponent(Label)!.string = this.selectedItem === key
                ? (key === 'clear-bottom' ? '确认清底' : '取消选择') : names[key];
            const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
            opacity.opacity = this.round.inventory[key] > 0 ? 255 : 120;
            const icon=button.getChildByName('Icon')!;
            icon.setScale(1,1,1);
            icon.getComponent(UITransform)!.setContentSize(96,96);
            icon.getComponent(Sprite)!.trim=false;
            const plate=button.getChildByName('NamePlate')!.getComponent(Sprite)!;
            plate.node.active=true;
            plate.type=Sprite.Type.SLICED;
            const plateScale=48/73;
            plate.node.setScale(plateScale,plateScale,1);
            plate.node.getComponent(UITransform)!.setContentSize(144/plateScale,73);
            if(key==='clear-bottom')icon.angle=-45;
            const name=button.getChildByName('Name')!;
            name.active=plate.node.active=true;
            name.getComponent(UITransform)!.setContentSize(132,44);
            name.getComponent(Label)!.fontSize=23;
            button.getChildByName('Count')!.getComponent(Label)!.color=Color.WHITE;
            const selected = this.selectedItem === key;
            // Region view owns the shell: cloud uses the scene sprite, the other regions
            // use their fitted child shell. Inventory refresh must never enable both.
            button.getComponent(Graphics)?.clear();
            button.setScale(selected ? 1.04 : 1, selected ? 1.04 : 1, 1);
        }
    }

    private rebuildCounter(limit: number): void {
        const counter = this.node.getChildByPath('Playfield/Counter')!;
        const slots = counter.children.filter(n => n.name.indexOf('LiveSlot') === 0);
        const beads = this.counterBeads.slice();
        this.counterBeads = [];
        for (let i = 0; i < limit; i++) {
            const x = (i - (limit - 1) / 2) * 42 + 12;
            const slot = instantiate(slots[0]!);
            slot.name = 'LiveSlot' + i; slot.setParent(counter); slot.setPosition(x, 0);
            const bead = instantiate(beads[0]!);
            bead.name = 'LiveBead' + i; bead.setParent(counter); bead.setPosition(x, 0);
            this.counterBeads.push(bead);
        }
        slots.concat(beads).forEach(n => { n.removeFromParent(); n.destroy(); });
        this.positionCounterDecor(limit);
    }

    private positionCounterDecor(limit: number): void {
        const counter = this.node.getChildByPath('Playfield/Counter')!;
        const downArrow = counter.getChildByName('DownArrow');
        if (!downArrow) return;
        const downX = -limit * 21 - 18;
        downArrow.setPosition(downX, 0);
        downArrow.getComponent(UITransform)?.setContentSize(28,28);
        const statusX = downX - COUNTER_DECOR_GAP;
        counter.getChildByName('BossSkill')?.setPosition(statusX, 0);
        counter.getChildByName('PendingRow')?.setPosition(statusX, 0);
        counter.getChildByName('PendingRow')?.getComponent(UITransform)?.setContentSize(32,32);
    }

    private setupBoss(): void {
        this.bossRoot = this.node.getChildByPath('Playfield/Boss')!;
        this.bossClip = new Node('BossCloudClip'); this.bossClip.layer = this.node.layer;
        this.bossClip.setParent(this.node);
        this.bossClip.addComponent(UITransform).setAnchorPoint(.5, 0);
        this.bossClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.bossClip.setSiblingIndex(this.node.getChildByName('CloudTransition')!.getSiblingIndex());
        this.bossRoot.setParent(this.bossClip);
        this.bossRoot.addComponent(UIOpacity);
        this.bossHealthRoot = new Node('BossHealthHUD'); this.bossHealthRoot.layer = this.node.layer;
        this.bossHealthRoot.setParent(this.node); this.bossHealthRoot.addComponent(UITransform);
        this.bossHealthRoot.addComponent(UIOpacity);
        for (const name of ['HealthTrack', 'HealthFill']) {
            const source = this.bossRoot.getChildByName(name)!;
            const bar = instantiate(source); bar.setParent(this.bossHealthRoot); bar.active = true;
            source.active = false;
        }
        this.hitFlash = instantiate(this.bossRoot.getChildByName('Body')!);
        this.hitFlash.name = 'HitFlash'; this.hitFlash.setParent(this.bossRoot);
        this.hitFlash.addComponent(UIOpacity).opacity = 0;
        const flashSprite = this.hitFlash.getComponent(Sprite)!;
        this.flashMaterial = new Material();
        this.flashMaterial.initialize({ effectName: 'builtin-sprite', defines: { USE_TEXTURE: true } });
        flashSprite.customMaterial = this.flashMaterial;
        this.flashMaterial.overridePipelineStates({ blendState: { targets: [{
            blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE,
        }] } });
        const impact = new Node('BossSkillImpact'); impact.layer = this.node.layer;
        impact.setParent(this.node.getChildByPath('Playfield/Vfx')!);
        impact.addComponent(UITransform).setContentSize(750, 1140);
        this.skillImpact = impact.addComponent(Graphics);
        // The skill SpriteFrame is serialized into the scene (same resource Bundle).
        this.skillNode = this.node.getChildByPath('Playfield/Counter/BossSkill')!;
    }

    private syncBoss(): void {
        if (!this.bossRoot) return;
        const visible = (!this.campaignRound || this.campaignRound.level.goal.kind==='boss') && (this.round.stage === 'boss' || this.round.stage === 'victory');
        this.bossRoot.active = visible && this.round.region!=='ocean';
        if(this.oceanBossNode)this.oceanBossNode.active=visible;
        this.node.getChildByName('Environment')!.active = this.round.region==='cloud';
        this.node.getChildByName('Foreground')!.active = this.round.region==='cloud';
        if (this.bossHealthRoot) this.bossHealthRoot.active = visible;
        if (this.skillNode) this.skillNode.active = this.round.stage === 'boss';

    }

    private startAttack(result: OrdinaryResult): void {
        const sources = [...result.removed, ...result.dropped, ...result.railDropped].map(b => {
            const p = position(b, result.phaseBefore); return new Vec3(p.x, p.y, 0);
        });
        const node = new Node('BossAttackEnergy'); node.layer = this.node.layer; node.setParent(this.node);
        this.foreground?.putBehind(node);
        // Region-owned energy sprites; damage remains the model's exact result.
        for (let i = 0; i < Math.min(3, sources.length); i++) {
            const heart = new Node('EnergyHeart'); heart.layer = node.layer; heart.setParent(node);
            const size=this.round.region==='ocean'?64:46;
            const ratio=this.round.region==='ocean'?this.attackFrame!.rect.width/this.attackFrame!.rect.height:1;
            heart.addComponent(UITransform).setContentSize(size*ratio, size);
            const sprite = heart.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.attackFrame!; heart.addComponent(UIOpacity);
        }
        const chainEnd=result.removed.length?popStartTime(result.removed.length-1)+POP_BURST_TIME:0;
        this.attack = { node, sources, elapsed: -chainEnd / POP_SPEED, targetHealth: this.round.bossHealth };
        this.updateAttack(0);
    }

    private updateAttack(dt: number): void {
        const attack = this.attack; if (!attack) return;
        attack.elapsed += dt;
        const rootTransform = this.node.getComponent(UITransform)!;
        const playTransform = this.node.getChildByName('Playfield')!.getComponent(UITransform)!;
        const ocean = this.round.region === 'ocean';
        const bossTransform = (ocean ? this.oceanBoss!.getHitTarget()! : this.bossRoot!).getComponent(UITransform)!;
        const target = rootTransform.convertToNodeSpaceAR(bossTransform.convertToWorldSpaceAR(new Vec3(0, ocean ? 0 : 160, 0)));
        attack.node.children.forEach((heart, i) => {
            const source = attack.sources[Math.floor(i * attack.sources.length / attack.node.children.length)]!;
            // Resolve both endpoints on every frame so resize cannot leave a stale world target.
            const start = rootTransform.convertToNodeSpaceAR(playTransform.convertToWorldSpaceAR(source));
            const t = Math.max(0, Math.min(1, (attack.elapsed - 0.12 - i * 0.06) / 0.42));
            const eased = t * t * (3 - 2 * t);
            heart.setPosition(start.x + (target.x - start.x) * eased + Math.sin(t * Math.PI) * (i - 1) * 32,
                start.y + (target.y - start.y) * eased);
            heart.angle=this.round.region==='ocean'?-Math.atan2(target.x-start.x,target.y-start.y)*180/Math.PI:0;
            const scale = this.node.getChildByName('Playfield')!.scale.x * (0.65 + 0.5 * Math.sin(t * Math.PI));
            heart.setScale(scale, scale, 1);
            heart.getComponent(UIOpacity)!.opacity = t >= 1 ? 0 : Math.max(0,Math.min(1, attack.elapsed / 0.12)) * 255;
        });
        if (attack.elapsed >= 0.54 + (attack.node.children.length - 1) * 0.06) {
            this.cue('boss-hit', 'light');
            this.oceanBoss?.hit();
            this.healthTarget = attack.targetHealth; this.hitTime = 0.35;
            attack.node.destroy(); this.attack = undefined;
        }
    }

    private clearAttack(): void {
        this.attack?.node.destroy(); this.attack = undefined; this.defeatElapsed = -1;
        this.hitTime = 0; this.bossCast = 0; this.bossClock = 0; this.castFrozen.clear(); this.skillImpact?.clear();
        if (this.hitFlash) this.hitFlash.getComponent(UIOpacity)!.opacity = 0;
    }

    private updateOceanBoss(dt:number):void {
        if(!this.oceanBossNode?.active)return;
        this.oceanBoss!.update(dt);
        this.bossReveal=Math.min(1,this.bossReveal+dt/.9);
        this.hitTime=Math.max(0,this.hitTime-dt);
        this.healthVisible+=(this.healthTarget-this.healthVisible)*Math.min(1,dt*12);
        if(Math.abs(this.healthVisible-this.healthTarget)<.01)this.healthVisible=this.healthTarget;
        const fill=this.bossHealthRoot!.getChildByName('HealthFill')!,fraction=this.healthVisible/BOSS_TUNING.health;
        // Keep a visible centre strip between the native rounded caps at low HP.
        const frame=fill.getComponent(Sprite)!.spriteFrame!;
        const minimum=frame.insetLeft+frame.insetRight+16;
        const width=Math.max(minimum,810*fraction);fill.active=fraction>0;
        fill.getComponent(UITransform)!.setContentSize(width,64);fill.setScale(.5,.5,1);fill.setPosition(-202.5+width/4,0);
        this.bossHealthRoot!.getComponent(UIOpacity)!.opacity=255;
        const ink=this.skillImpact!;ink.clear();
        if(this.oceanCastAge>=0){
            const previous=this.oceanCastAge;this.oceanCastAge+=dt;const age=this.oceanCastAge;
            const play=this.node.getChildByName('Playfield')!.getComponent(UITransform)!;
            const staff=this.oceanBoss!.getSkillOrigin();
            const source=staff?play.convertToNodeSpaceAR(staff.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0,0))):new Vec3(0,510);
            const charge=Math.min(1,age/.65);
            if(age<.75){ink.lineWidth=3;ink.strokeColor=new Color(158,248,255,220*charge);ink.circle(source.x,source.y,10+charge*26);ink.stroke();}
            this.oceanTargets.forEach(({bubble})=>{
                const target=this.model.position(bubble);
                if(age>=.65 && age<1.2){
                    const travel=Math.min(1,(age-.65)/.55);
                    for(let i=0;i<9;i++){
                        const t=Math.max(0,travel-i*.025);ink.fillColor=new Color(150,246,255,230-i*23);
                        ink.circle(source.x+(target.x-source.x)*t+Math.sin(t*Math.PI)*30,source.y+(target.y-source.y)*t,12-i);ink.fill();
                    }
                }
                if(age>=1.2 && age<1.85){
                    const t=(age-1.2)/.65;ink.lineWidth=3*(1-t)+1;ink.strokeColor=new Color(175,255,255,230*(1-t));
                    ink.circle(target.x,target.y,DIAMETER*(.45+t*.5));ink.stroke();
                    ink.circle(target.x,target.y,DIAMETER*(.3+t*.35));ink.stroke();
                }
            });
            if(previous<1.2 && age>=1.2){
                this.cue('ocean-convert','medium');
                const bubbles=this.model.bubbles;
                this.node.getChildByPath('Playfield/Board')!.children.forEach((node,i)=>{
                    const bubble=bubbles[i];if(!bubble || !this.oceanTargets.some(t=>t.bubble.row===bubble.row&&t.bubble.col===bubble.col))return;
                    node.getComponent(Sprite)!.spriteFrame=this.supportFrame;node.name='SupportBubble';
                    this.juice?.ripple(this.model.position(bubble));
                });
            }
            if(age>=1.9){this.oceanCastAge=-1;this.oceanTargets=[];ink.clear();}
        }
        if(this.round.stage==='victory' && !this.attack && this.hitTime===0 && this.healthVisible===0){
            if(!this.oceanDefeating){this.oceanDefeating=true;this.cue('victory','medium');this.oceanBoss!.defeat(()=>{this.defeatElapsed=1.2;});}
        }
    }

    private updateBoss(dt: number): void {
        if(this.round.region==='ocean'){this.updateOceanBoss(dt);return;}
        if (!this.bossRoot?.active) return;
        this.bossReveal = Math.min(1, this.bossReveal + dt / .9);
        this.hitTime = Math.max(0, this.hitTime - dt);
        const pulse = this.hitTime > 0 ? Math.sin(this.hitTime / 0.35 * Math.PI) * 0.04 : 0;
        if (this.round.stage === 'victory' && !this.attack && this.hitTime === 0 && this.healthVisible === 0) {
            if (this.defeatElapsed < 0) this.cue('victory', 'medium');
            this.defeatElapsed = Math.max(0, this.defeatElapsed) + dt;
        }
        this.bossClock += dt;
        this.bossCast = Math.max(0, this.bossCast - dt);
        const defeat = Math.max(0, Math.min(1, this.defeatElapsed / 1.1));
        const entry = this.bossReveal;
        const entryLift = 1 - Math.pow(1 - entry, 3);
        const landing = Math.sin(entry * Math.PI * 3) * (1 - entry);
        const idle = Math.sin(this.bossClock * 2.4);
        const castAge = (CLOUD_CAST_DURATION - this.bossCast) * 1.25 / CLOUD_CAST_DURATION;
        const cast = this.bossCast > 0 ? (castAge < .34 ? Math.pow(castAge / .34, 2)
            : castAge < .44 ? 1 - (castAge - .34) / .10 * 1.25
            : -.25 * Math.pow(Math.max(0,1 - (castAge - .44) / .81), 2)) : 0;
        const impactAge = castAge - .68;
        const recoil = this.bossCast > 0 && impactAge >= 0 ? Math.sin(impactAge * 35) * Math.max(0, 1 - impactAge / .35) : 0;
        if (this.bossCast > 0 && impactAge >= 0 && !this.castImpactPlayed) {
            this.castImpactPlayed = true; this.cue('frost', 'medium');
        }
        const exitDrop = Math.pow(defeat, 2);
        const scale = this.bossScale * (1 + landing * .07) * (1 - .18 * exitDrop);
        this.bossRoot.setPosition(defeat > 0 ? Math.sin(defeat * 25) * 7 * (1 - defeat) : 0,
            this.bossBaseY - 220 * (1 - entryLift) - 300 * exitDrop + idle * 3 * (1 - defeat));
        this.bossRoot.angle = defeat > 0 ? -12 * exitDrop : 0;
        this.bossRoot.setScale(scale, scale, 1);
        this.bossRoot.getComponent(UIOpacity)!.opacity = 255 * Math.min(1, entry * 4) * (1 - exitDrop);
        this.bossHealthRoot!.getComponent(UIOpacity)!.opacity = 255 * Math.min(1, entry * 4) * (1 - exitDrop);
        const body = this.bossRoot.getChildByName('Body')!;
        if(this.regionalBoss) {
            this.regionalBoss.update(dt,this.hitTime,defeat);
            this.skillImpact!.clear();
        } else {
        body.setScale(1 + pulse + idle * .012 + cast * .065 + landing * .04,
            1 - pulse - idle * .009 - cast * .085 - landing * .035, 1);
        body.setPosition(0, 30 + recoil * 7);
        const bodyUI=body.getComponent(UITransform)!;
        const bodyDockY=body.position.y-bodyUI.height*bodyUI.anchorY*body.scale.y;
        this.bossRoot.setPosition(this.bossRoot.position.x,this.bossRoot.position.y-bodyDockY*scale);
        const left = this.bossRoot.getChildByName('LeftFist')!, right = this.bossRoot.getChildByName('RightFist')!;
        left.setPosition(-200 - cast * 12, 175 + Math.sin(this.bossClock * 2.4 + .8) * 6 + cast * 72);
        right.setPosition(200 + cast * 12, 175 + Math.sin(this.bossClock * 2.4 - .8) * 6 + cast * 72);
        left.angle = -idle * 2.5 - cast * 16; right.angle = idle * 2.5 + cast * 16;
        const crown = this.bossRoot.getChildByName('Crown')!;
        crown.setPosition(0, 240 + Math.sin(this.bossClock * 2.4 - .6) * 3 + cast * 5);
        crown.angle = Math.sin(this.bossClock * 1.2) * 2 + defeat * 18;
        // Keep charging fists within the actual viewport while the lower body stays behind
        // the cloud bank. This preserves the authored boss size, including on short screens.
        const clipUI=this.bossClip!.getComponent(UITransform)!;
        let overflow=0;
        for(const part of [body,left,right,crown]) {
            const box=part.getComponent(UITransform)!.getBoundingBoxToWorld();
            const top=clipUI.convertToNodeSpaceAR(new Vec3(box.x,box.yMax)).y;
            overflow=Math.max(overflow,top-clipUI.height+12);
        }
        if(overflow>0)this.bossRoot.setPosition(this.bossRoot.position.x,this.bossRoot.position.y-overflow);
        // Only newly frozen bubbles pulse as the skill lands; no advance target markers.
        const bubbles = this.model.bubbles;
        this.node.getChildByPath('Playfield/Board')!.children.forEach((node, i) => {
            const frost = node.getChildByName('Frosting'), bubble = bubbles[i];
            if (!frost || !bubble || !this.castFrozen.has(`${bubble.row}:${bubble.col}`)) return;
            const size = 1 + (this.bossCast > 0 && impactAge >= 0 ? Math.sin(Math.min(1, impactAge / .55) * Math.PI) * .35 : 0);
            (frost.getComponent(UIOpacity) ?? frost.addComponent(UIOpacity)).opacity = this.bossCast > 0 && impactAge < 0 ? 0 : 255;
            frost.setScale(size, size, 1);
        });
        const impact = this.skillImpact!; impact.clear();
        if (this.bossCast > 0) {
            const play=this.node.getChildByName('Playfield')!.getComponent(UITransform)!;
            const origins=[left,right].map(fist=>play.convertToNodeSpaceAR(fist.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3())));
            // Charging motes orbit the actual fists; no target markers before impact.
            if(castAge<.44) origins.forEach((origin,j)=>{
                const charge=Math.min(1,castAge/.34);
                impact.lineWidth=3;impact.strokeColor=new Color(184,242,255,200*charge);
                impact.circle(origin.x,origin.y,12+22*charge);impact.stroke();
                for(let i=0;i<7;i++) {
                    const angle=i*Math.PI*2/7+castAge*9+j, radius=48-25*charge;
                    impact.fillColor=new Color(225,253,255,220*charge);
                    impact.circle(origin.x+Math.cos(angle)*radius,origin.y+Math.sin(angle)*radius,3+4*charge);impact.fill();
                }
            });
            const targets=bubbles.filter(b=>this.castFrozen.has(`${b.row}:${b.col}`));
            if(castAge>=.4 && castAge<.68) targets.forEach((bubble,index)=>{
                const target=this.model.position(bubble),origin=origins[index%2]!;
                const travel=Math.min(1,(castAge-.4)/.28);
                for(let tail=9;tail>=0;tail--) {
                    const t=Math.max(0,travel-tail*.025),arc=Math.sin(t*Math.PI)*(index%2===0?-45:45);
                    impact.fillColor=new Color(170+tail*10,240,255,240-tail*22);
                    impact.circle(origin.x+(target.x-origin.x)*t+arc,origin.y+(target.y-origin.y)*t,14-tail*1.05);impact.fill();
                }
            });
            if(impactAge>=0 && impactAge<.55) {
                const t=impactAge/.55,strength=1-t;
                impact.lineWidth=5*strength+1;impact.strokeColor=new Color(194,248,255,170*strength);
                impact.ellipse(0,410-t*110,BOARD_WIDTH*.48,12+t*45);impact.stroke();
                targets.forEach(bubble=>{
                    const p=this.model.position(bubble);
                    impact.lineWidth=3*strength+1;impact.strokeColor=new Color(235,255,255,250*strength);
                    impact.circle(p.x,p.y,DIAMETER*.4+t*32);impact.stroke();
                    for(let i=0;i<8;i++) {
                        const a=i*Math.PI/4+Math.PI/8,r=DIAMETER*.35+t*45;
                        const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;
                        impact.fillColor=new Color(195,246,255,240*strength);
                        const size=5*strength+1;
                        impact.moveTo(x,y+size);impact.lineTo(x+size*.55,y);impact.lineTo(x,y-size);impact.lineTo(x-size*.55,y);impact.close();impact.fill();
                    }
                });
            }
        }
        if (this.bossCast === 0) this.castFrozen.clear();
        }
        if (this.hitFlash) {
            this.hitFlash.getComponent(UIOpacity)!.opacity = this.hitTime > 0 ? 150 * Math.sin(this.hitTime / 0.35 * Math.PI) : 0;
            this.hitFlash.setScale(body.scale);
            this.hitFlash.setPosition(body.position);
        }
        this.healthVisible += (this.healthTarget - this.healthVisible) * Math.min(1, dt * 12);
        if (Math.abs(this.healthVisible - this.healthTarget) < 0.01) this.healthVisible = this.healthTarget;
        const fill = this.bossHealthRoot!.getChildByName('HealthFill')!;
        const fraction = this.healthVisible / BOSS_TUNING.health;
        fill.active = fraction > 0;
        // Keep the full-height rounded caps down to the last HP, then hide at zero.
        const width = Math.max(64, 810 * fraction);
        fill.getComponent(UITransform)!.setContentSize(width, 64);
        fill.setScale(0.5, 0.5, 1);
        fill.setPosition(-202.5 + width / 4, 0);
    }

    private showEnd(page: EndPage, message = ''): void {
        this.syncScore();
        if (!this.endView?.visible && (page === 'offer' || page === 'result')) this.cue('failure', 'medium');
        if (page === 'offer' || page === 'result') this.music();
        if (page === 'result') this.discardSavedProgress();
        this.particles?.clear(); this.juice?.clear();this.comboView?.clear();
        if (this.state !== 'paused') this.state = 'completed';
        else this.pausedFrom = 'completed';
        this.cancelAim();
        this.selectedItem = undefined;
        this.node.getChildByName('Pause')!.active = false;
        if (page === 'result' && !this.finalResult) {
            this.finalResult = Object.freeze({ score: this.round.score, duration: this.elapsed, completed: false,
                extra: { cleared: this.cleared, completedRegions: this.round.completedRegions,
                    regionProgress: this.round.regionProgress, bossHealth: this.round.bossHealth } });
        }
        this.endView?.show(page, primary => {
            if (page === 'loading') return;
            if (page === 'result') {
                const context = this.context;
                if (!context) {
                    this.showEnd('result', '请从大厅进入游戏');
                    return;
                }
                this.endView?.setBusy();
                if (primary) context.requestRestart(this.finalResult);
                else this.showModeSelection();
            } else if (!primary) this.showEnd('result');
            else void this.requestRevive();
        }, message);
        this.endView?.setEnabled(this.state !== 'paused');
    }

    private async requestRevive(): Promise<void> {
        if (this.revivePending || !this.round.canRevive) return;
        const context = this.context;
        if (!context?.services.ads) {
            this.showEnd('offer', "广告暂时不可用，请稍后重试");
            return;
        }
        const generation = this.operationGeneration;
        this.revivePending = true;
        this.showEnd('loading');
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.bubbleShooterRevive,
                gameId: context.gameId, sessionId: context.sessionId,
            });
            if (generation !== this.operationGeneration || this.context !== context) return;
            const beforeRevive=this.model.bubbles.map(b=>({...b}));
            const revivePhase=this.model.rowPhase;
            if (result.outcome === 'completed' && this.round.revive()) {
                const surviving=new Set(this.model.bubbles.map(b=>`${b.row}:${b.col}`));
                beforeRevive.filter(b=>!surviving.has(`${b.row}:${b.col}`))
                    .forEach((b,i)=>this.animateRemoval(b,false,revivePhase,i));
                this.commitCheckpoint();
                this.syncBoard(); this.syncCounter(); this.syncBoss(); this.syncItems(); this.syncSupply();
                if (this.endView && !await this.endView.close()) return;
                if (generation !== this.operationGeneration || this.context !== context) return;
                this.endView?.hide();
                this.cue('revive');
                this.music(this.round.stage === 'boss' ? 'boss-music' : 'normal-music');
                this.commitCheckpoint();
                // The ad may finish while the app is still in the background.
                if (this.state === 'paused') this.pausedFrom = 'playing';
                else this.state = 'playing';
                this.node.getChildByName('Pause')!.active = true;
            this.node.getChildByName('CloudTransition')!.active = true;
            } else this.showEnd('offer', result.outcome === 'skipped'
                ? "广告未看完，复活机会仍保留" : "广告暂时不可用，请稍后重试");
        } catch {
            if (generation === this.operationGeneration && this.context === context)
                this.showEnd('offer', "广告暂时不可用，请稍后重试");
        } finally {
            if (generation === this.operationGeneration) this.revivePending = false;
        }
    }

    private music(cue?: 'normal-music' | 'boss-music'): void {
        this.sound.music(cue);
    }

    private cue(cue: CloudCue, vibration?: 'light' | 'medium'): void {
        this.sound.play(cue);
        if (vibration && this.state !== 'paused') this.context?.services.feedback?.vibrate(vibration);
    }

    private showModeSelection(): void {
        this.campaignResultView?.hide();this.endView?.hide();
        this.persistCheckpoint(); this.flushProgress(); this.cancelAim();this.rowBirths=[]; this.localPage='modes';
        this.sound.pause({keepMusicPlaying:true});this.sound.music('menu-music');
        if(this.scoreHUD)this.scoreHUD.root.active=false; this.campaignView?.showModes(this.campaignProgress,!!this.checkpoint);
        this.node.getChildByName('Playfield')!.active=false;this.node.getChildByName('Pause')!.active=false;
        if(this.node.getChildByName('Rules'))this.node.getChildByName('Rules')!.active=false;
    }

    private showCampaignSelection(): void {
        this.campaignResultView?.hide();this.persistCheckpoint();this.flushProgress();
        this.cancelAim();this.rowBirths=[];this.localPage='levels';
        this.sound.pause({keepMusicPlaying:true});this.sound.music('menu-music');
        this.campaignView?.showLevels(this.campaignProgress);
        this.node.getChildByName('Playfield')!.active=false;this.node.getChildByName('Pause')!.active=false;
    }

    private enterCampaign(id: string, resume = false): void {
        const level=bubbleLevel(id),context=this.context;
        if(!level||!context?.services.assets||!campaignUnlocked(this.campaignProgress,id)||this.transitionView?.active)return;
        const serial=this.campaignProgress.attemptSerial+1;
        const saved=resume?this.campaignProgress.activeAttempt:null;
        const preparedRound=(saved?.levelId===id?BubbleShooterCampaign.restoreCampaign(level,saved):undefined)
            ??new BubbleShooterCampaign(level,context.sessionId+':'+serial);
        const generation=++this.modeNavigationGeneration;
        let prepared:BubbleRegionAssets,committed=false;
        const previousPage=this.localPage;
        const started=this.transitionView!.start(async()=>{
            prepared=this.regionAssets?.region===level.region?this.regionAssets:
                await loadBubbleRegion(context.services.assets!,level.region,context.services.audio);
            if(generation!==this.modeNavigationGeneration||this.context!==context)throw new Error('Campaign preparation cancelled.');
        },()=>{
            if(generation!==this.modeNavigationGeneration||this.context!==context)return;
            if(!committed){
                // Preparation succeeded before replacing either mode's saved state.
                this.persistCheckpoint();
                const previous=this.campaignProgress.activeAttempt;
                if(previous&&previous.attemptId!==preparedRound.attemptId){
                    const oldLevel=bubbleLevel(previous.levelId),oldRound=oldLevel?BubbleShooterCampaign.restoreCampaign(oldLevel,previous):undefined;
                    if(oldRound)this.campaignProgress=settleCampaignProgress(this.campaignProgress,oldRound,true);
                }
                this.mode='campaign';this.campaignRound=preparedRound;
                this.campaignProgress={...this.campaignProgress,attemptSerial:Math.max(this.campaignProgress.attemptSerial,serial)};
                this.resetRound(false,true,level.region);this.reportedScore=undefined;committed=true;
            }
            this.applyRegionFrames(prepared);this.applyRegionView(prepared);
            this.campaignView?.hide();this.syncBoard(false,true);this.syncSupply();this.syncItems();this.syncCounter();this.syncBoss();
            this.healthVisible=this.healthTarget=preparedRound.bossHealth;this.state='playing';this.localPage='playing';
            this.sound.reset();this.music(level.goal.kind==='boss'?'boss-music':'normal-music');
            this.commitCheckpoint();this.flushProgress();this.restartPending=false;this.campaignRetryId=undefined;this.applyLayout();
            this.context?.reportScore(0);
            this.context?.reportEvent?.('bubble_campaign_start',{mode:'campaign',levelId:id,revision:level.revision,rulesVersion:level.rulesVersion,attemptId:preparedRound.attemptId,resumed:!!saved},preparedRound.attemptId+':start');
        });
        if(started){this.localPage='preparing';this.cancelAim();}
        else this.localPage=previousPage;
    }

    private enterEndless(): void {
        const context=this.context;if(!context?.services.assets||this.transitionView?.active)return;
        const generation=++this.modeNavigationGeneration;
        const target=new BubbleShooterRound();
        if(!this.checkpoint||!target.restore(this.checkpoint.round))target.reset(this.previewRegion??target.pickStartRegion());
        const savedElapsed=this.checkpoint?.elapsed??0;
        let prepared:BubbleRegionAssets,committed=false;
        this.transitionView!.start(async()=>{
            prepared=this.regionAssets?.region===target.region?this.regionAssets:
                await loadBubbleRegion(context.services.assets!,target.region,context.services.audio);
            if(generation!==this.modeNavigationGeneration||this.context!==context)throw new Error('Endless preparation cancelled.');
        },()=>{
            if(generation!==this.modeNavigationGeneration||this.context!==context)return;
            if(!committed){
                this.persistCheckpoint();this.campaignRound=undefined;this.mode='endless';
                this.resetRound(false,true,target.region);this.endlessRound.restore(target.snapshot());this.reportedScore=undefined;this.elapsed=savedElapsed;committed=true;
            }
            this.applyRegionFrames(prepared);this.applyRegionView(prepared);this.campaignView?.hide();
            this.syncBoard(false,true);this.syncSupply();this.syncItems();this.syncCounter();this.syncBoss();
            this.healthVisible=this.healthTarget=this.round.bossHealth;this.state='playing';this.localPage='playing';
            this.sound.reset();this.music(this.round.stage==='boss'?'boss-music':'normal-music');this.commitCheckpoint();this.applyLayout();
            if(this.round.rewardAvailable)this.showReward();
            else if(this.round.ended)this.showEnd(this.round.canRevive?'offer':'result');
        });
        this.localPage='preparing';this.cancelAim();
    }

    private showCampaignResult(): void {
        const round=this.campaignRound;if(!round||this.localPage==='result')return;
        this.commitCheckpoint();this.flushProgress();this.cancelAim();this.state='completed';this.localPage='result';
        this.node.getChildByName('Pause')!.active=false;this.sound.music(round.outcome==='won'?'reward-music':undefined);
        this.cue(round.outcome==='won'?'reward':'failure');
        this.campaignResultView?.show(round,this.campaignProgress,index=>{
            if(round.outcome==='won'){
                if(index===0)this.nextCampaignLevel();else if(index===1)this.requestModeRestart();else this.showCampaignSelection();
            }else{
                if(index===0)this.requestModeRestart();else if(index===1)this.showCampaignSelection();else this.showModeSelection();
            }
        });this.applyLayout();
    }

    private nextCampaignLevel(): void {
        const round=this.campaignRound;if(!round||round.outcome!=='won')return;
        const next=BUBBLE_LEVELS[round.level.routeIndex];if(next)this.enterCampaign(next.id);else this.enterEndless();
    }

    private requestModeRestart(): void {
        if(this.restartPending||!this.context)return;
        this.campaignRetryId=this.campaignRound?.level.id;this.saveRestartIntent();
        this.restartPending=true;
        if(this.state==='paused'&&this.activePauseModel) {
            void this.activePauseModel.restart().catch(()=>{this.restartPending=false;});
        } else this.context.requestRestart();
    }

    private async navigatePaused(model: MiniGamePauseModel, destination: 'levels'|'modes'): Promise<void> {
        if(this.state!=='paused'||this.pauseNavigation)return;
        this.persistCheckpoint();this.flushProgress();this.pauseNavigation=destination;
        try {
            await model.resume();
            if(destination==='levels')this.showCampaignSelection();else this.showModeSelection();
        } finally {this.pauseNavigation=undefined;}
    }

    private saveRestartIntent(): void {
        const context=this.context;if(!context||this.previewRegion)return;
        const storage=context.services.storage,stored=storage.getGameData(context.gameId);
        if(stored)storage.writeGameData(context.gameId,{...stored,custom:{...stored.custom,restartIntent:{mode:this.mode,levelId:this.campaignRound?.level.id}}});
        this.flushProgress();
    }

    private flushProgress(): void {
        if(this.previewRegion)return;
        try{this.context?.services.storage.flush();}
        catch{/* StorageService retains the latest pending write and retries it. */}
        this.campaignView?.setSavePending(!!this.context?.services.storage.lastPersistenceError);
    }

    private commitCheckpoint(): void {
        const round=this.campaignRound;
        if(round){
            const previous=this.campaignProgress;
            if(round.ended){
                this.campaignProgress=settleCampaignProgress(previous,round);
                if(previous!==this.campaignProgress){
                    const level=round.level;
                    this.context?.reportEvent?.('bubble_campaign_result',{mode:'campaign',levelId:level.id,revision:level.revision,rulesVersion:level.rulesVersion,
                        attemptId:round.attemptId,outcome:round.outcome!,reason:round.failure??'goal',shotsUsed:round.shotsUsed,stars:round.stars},round.attemptId+':result');
                    if(round.outcome==='won'&&!previous.results[level.id])this.context?.reportEvent?.('bubble_campaign_first_clear',{levelId:level.id,attemptId:round.attemptId},round.attemptId+':first-clear');
                }
            }
            else if(this.localPage==='playing'||this.state==='paused')this.campaignProgress={...this.campaignProgress,activeAttempt:round.campaignCheckpoint()};
            this.persistCheckpoint(true);
            if(previous!==this.campaignProgress && round.outcome==='won')this.syncCampaignAchievementProgress();
            return;
        }
        if(this.localPage!=='playing')return;
        this.syncScore();
        if (this.runFinished) return;
        this.checkpoint = { round: this.round.snapshot(), elapsed: this.elapsed };
        this.persistCheckpoint(true);
    }

    private persistCheckpoint(clearRestartIntent = false): void {
        const context = this.context, storage = context?.services.storage;
        if (!context || !storage || this.previewRegion) return;
        try {
            const stored = storage.getGameData(context.gameId);
            const previous = stored?.dataVersion === BUBBLE_SHOOTER_DATA_VERSION ? stored : undefined;
            storage.writeGameData(context.gameId, {
                dataVersion: BUBBLE_SHOOTER_DATA_VERSION, playCount: previous?.playCount ?? 0, highScore: Math.max(previous?.highScore ?? 0, this.bestScore),
                lastPlayedAt: Date.now(), custom: { ...previous?.custom, tutorialCompleted:this.tutorialCompleted,
                    activeRound: null, lastMode:this.mode,
                    endless:{activeRun:this.checkpoint??null},campaign:this.campaignProgress,
                    restartIntent:clearRestartIntent?null:previous?.custom?.restartIntent??null },
            });
        } catch (error) { /* TODO: console.warn('[BubbleShooter] Save deferred/failed.', error); */ }
    }

    discardSavedProgress(): void {
        if(this.campaignRound){this.campaignProgress={...this.campaignProgress,activeAttempt:null};this.persistCheckpoint();return;}
        this.runFinished = true; this.checkpoint = undefined; this.persistCheckpoint();
    }

    private buildRulesButton():void {
        const n=new Node('Rules');n.layer=this.node.layer;n.setParent(this.node);n.addComponent(UITransform);
        const icon=n.addComponent(Sprite);icon.sizeMode=Sprite.SizeMode.CUSTOM;icon.trim=false;
        this.syncRulesButton();
        n.on(Node.EventType.TOUCH_END,this.requestRules,this);
    }
    private syncRulesButton():void {
        const rules=this.node.getChildByName('Rules'),pause=this.node.getChildByName('Pause');
        if(!rules||!pause||!this.regionAssets)return;
        rules.getComponent(Sprite)!.spriteFrame=this.regionAssets.rulesIcon;
        rules.getComponent(UITransform)!.setContentSize(pause.getComponent(UITransform)!.contentSize);
        rules.setScale(pause.scale);
    }
    private requestRules():void {
        if(this.state!=='playing'||this.transitionView?.active||this.rewardView?.visible||this.endView?.visible||this.tutorialView?.visible)return;
        this.rulesRequested=true;this.context?.requestPause();
    }

    private requestPause(): void {
        if (this.state === 'playing') this.context?.requestPause();
    }

    private drawDangerLine(): void {
        const line = this.node.getChildByPath('Playfield/DangerLine')!;
        line.getComponent(UITransform)!.setContentSize(BOARD_WIDTH, 4);
        const graphics = line.getComponent(Graphics) ?? line.addComponent(Graphics);
        graphics.clear();
        graphics.strokeColor = new Color(239, 120, 158, 180);
        graphics.lineWidth = 3;
        for (let x = -BOARD_WIDTH / 2; x < BOARD_WIDTH / 2; x += 24) {
            graphics.moveTo(x, 0);
            graphics.lineTo(Math.min(x + 12, BOARD_WIDTH / 2), 0);
        }
        graphics.stroke();
    }

    private detach(): void {
        this.heldTouch=undefined; this.activeTouch=undefined;
        view.off('canvas-resize', this.applyLayout, this);
        if (!this.listening) return;
        const play = this.node.getChildByName('Playfield');
        play?.targetOff(this);
        play?.getChildByPath('Launcher/NextBall')?.targetOff(this);
        play?.getChildByPath('Launcher/Swap')?.targetOff(this);
        this.node.getChildByName('Pause')?.targetOff(this);
        this.node.getChildByName('Rules')?.targetOff(this);
        for (const key of this.itemKeys) this.node.getChildByPath('Playfield/Items/Item-' + key)?.targetOff(this);
        this.listening = false;
    }

    async dispose(): Promise<void> {
        this.boardVisuals.clear();this.lastAim=undefined;
        this.rowBirths=[];this.turretReturn=undefined;
        if (this.state === 'disposed') return;
        this.persistCheckpoint();this.flushProgress();
        this.campaignView?.dispose();this.campaignView=undefined;this.modeNavigationGeneration++;
        this.campaignResultView?.dispose();this.campaignResultView=undefined;
        if(this.campaignArtwork&&this.context)releaseBubbleCampaignArtwork(this.context.services.assets,this.campaignArtwork);
        this.campaignArtwork=undefined;
        this.regionalAmbient?.dispose();this.regionalAmbient=undefined;
        this.regionalBoss?.dispose();this.regionalBoss=undefined;
        this.magicView?.dispose();this.magicView=undefined;
        this.toyView?.dispose();this.toyView=undefined;this.railMotion=[];
        this.scoreHUD?.dispose();this.scoreHUD=undefined;
        this.tutorialView?.dispose();this.tutorialView=undefined;this.node.getChildByName('Rules')?.destroy();
        this.viewBuilt=false;this.oceanBoss?.dispose();this.oceanBoss=undefined;this.oceanBossNode?.destroy();this.oceanBossNode=undefined;
        this.node.getChildByPath('Playfield/RoundProgress')?.destroy();
        this.sceneSprites=[];this.regionAssets=undefined;this.oceanTargets=[];
        this.foreground?.dispose(); this.foreground=undefined;this.foregroundFrames=[];
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.juice?.dispose(); this.juice=undefined;
        this.comboView?.dispose();this.comboView=undefined;
        this.sound.dispose(); this.particles?.dispose(); this.particles = undefined;
        this.audioSlots.forEach(slot => slot.clips = []);
        this.detach();
        this.clearAttack(); this.attackFrame = undefined; this.hitFlash = undefined;
        this.flashMaterial?.destroy(); this.flashMaterial = undefined;
        this.transitionView?.dispose(); this.transitionView = undefined;
        this.rewardView?.dispose(); this.rewardView = undefined;
        this.operationGeneration++; this.revivePending = false; this.finalResult = undefined;
        this.endView?.dispose(); this.endView = undefined;
        this.pauseView?.dispose(); this.pauseView = undefined;
        this.node.getComponentsInChildren(Sprite).forEach((sprite) => { sprite.spriteFrame = null; });
        this.node.getComponentsInChildren(Graphics).forEach((graphics) => graphics.clear());
        this.flight?.node.destroy();
        this.flight=undefined;
        this.effects.forEach(e=>e.node.destroy());
        this.effects=[];
        this.fallingRoot?.destroy(); this.fallingRoot = undefined;
        this.frames.clear();
        this.itemFrames.clear();
        this.selectedItem = undefined;
        this.frostFrame=undefined; this.supportFrame=null;
        this.campaignRound?.clear();this.campaignRound=undefined;this.endlessRound.clear();this.activePauseModel=undefined;
        this.bossRoot = undefined;
        this.bossHealthRoot?.destroy(); this.bossHealthRoot = undefined;
        this.bossClip?.destroy(); this.bossClip = undefined;
        this.skillImpact = undefined; this.castFrozen.clear();
        this.dangerGlow?.node.destroy();this.dangerGlow=undefined;this.islands=[];
        this.skillNode = undefined;
        this.counterBeads = [];
        this.transition = 0;
        this.context = undefined;
        this.state = 'disposed';
    }

    protected onDestroy(): void {
        this.boardVisuals.clear();this.lastAim=undefined;
        this.rowBirths=[];this.turretReturn=undefined;
        this.persistCheckpoint();this.flushProgress();
        this.campaignView?.dispose();this.campaignView=undefined;this.modeNavigationGeneration++;
        this.campaignResultView?.dispose();this.campaignResultView=undefined;
        if(this.campaignArtwork&&this.context)releaseBubbleCampaignArtwork(this.context.services.assets,this.campaignArtwork);
        this.campaignArtwork=undefined;
        this.regionalAmbient?.dispose();this.regionalAmbient=undefined;
        this.regionalBoss?.dispose();this.regionalBoss=undefined;
        this.magicView?.dispose();this.magicView=undefined;
        this.toyView?.dispose();this.toyView=undefined;this.railMotion=[];
        this.scoreHUD?.dispose();this.scoreHUD=undefined;
        this.tutorialView?.dispose();this.tutorialView=undefined;this.node.getChildByName('Rules')?.destroy();
        this.viewBuilt=false;this.oceanBoss?.dispose();this.oceanBoss=undefined;this.oceanBossNode?.destroy();this.oceanBossNode=undefined;
        this.node.getChildByPath('Playfield/RoundProgress')?.destroy();
        this.sceneSprites=[];this.regionAssets=undefined;this.oceanTargets=[];
        this.foreground?.dispose(); this.foreground=undefined;this.foregroundFrames=[];
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.juice?.dispose(); this.juice=undefined;
        this.comboView?.dispose();this.comboView=undefined;
        this.sound.dispose(); this.particles?.dispose(); this.particles = undefined;
        this.audioSlots.forEach(slot => slot.clips = []);
        this.detach();
        this.clearAttack(); this.attackFrame = undefined; this.hitFlash = undefined;
        this.flashMaterial?.destroy(); this.flashMaterial = undefined;
        this.transitionView?.dispose(); this.transitionView = undefined;
        this.rewardView?.dispose(); this.rewardView = undefined;
        this.operationGeneration++; this.revivePending = false; this.finalResult = undefined;
        this.endView?.dispose(); this.endView = undefined;
        this.pauseView?.dispose(); this.pauseView = undefined;
        this.flight?.node.destroy();
        this.flight=undefined;
        this.effects.forEach(e=>e.node.destroy());
        this.effects=[];
        this.fallingRoot?.destroy(); this.fallingRoot = undefined;
        this.frames.clear();
        this.itemFrames.clear();
        this.selectedItem = undefined;
        this.frostFrame=undefined; this.supportFrame=null;
        this.campaignRound?.clear();this.campaignRound=undefined;this.endlessRound.clear();this.activePauseModel=undefined;
        this.bossRoot = undefined;
        this.bossHealthRoot?.destroy(); this.bossHealthRoot = undefined;
        this.bossClip?.destroy(); this.bossClip = undefined;
        this.skillImpact = undefined; this.castFrozen.clear();
        this.dangerGlow?.node.destroy();this.dangerGlow=undefined;this.islands=[];
        this.skillNode = undefined;
        this.counterBeads = [];
        this.transition = 0;
        this.context = undefined;
        this.state = 'disposed';
    }
}
