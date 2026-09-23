import { BUBBLE_SCENE_SPRITES } from './BubbleShooterSceneBindings';
import { loadBubbleRegion, type BubbleRegionAssets } from './BubbleShooterRegionAssets';
import { BubbleShooterOceanBoss } from './BubbleShooterOceanBoss';
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
import { BubbleShooterRewardView } from './BubbleShooterRewardView';
import { calculateBubbleShooterLayout, CLOUD_COUNTER_Y } from './BubbleShooterLayout';

import { Bubble, BubbleColor, COLORS, PIVOT, position, ROW_HEIGHT, Shot, SHOT_SPEED, MAX_AIM_ANGLE, DIAMETER, DANGER, BOARD_WIDTH, TOP } from './BubbleShooterModel';

import { BubbleShooterRound, BubbleItem, OrdinaryResult, ShotKind, ORDINARY_TUNING, BOSS_TUNING } from './BubbleShooterRound';

import type { AudioService } from '../../../services/audio/AudioService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import { BubbleShooterAudio, BubbleShooterAudioSlot, type CloudCue } from './BubbleShooterAudio';
import { BubbleShooterParticles } from './BubbleShooterParticles';
import { removalMotion, sampleRemoval, POP_BURST_TIME, POP_CHAIN_INTERVAL, type RemovalMotion } from './BubbleShooterRemovalMotion';
import type { CloudSnapshot } from './BubbleShooterRound';

const { ccclass, property } = _decorator;
type BubbleShooterState = 'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'disposed';
interface BubbleShooterServices { readonly assets?: AssetService; readonly platform: Platform; readonly ads: AdService; readonly audio: AudioService; readonly storage: StorageService; readonly feedback: FeedbackService; }

const COUNTER_DECOR_GAP = 45;

/** Cloud prototype with a shared deterministic trace for aiming and flight. */
@ccclass('BubbleShooterGame')
export class BubbleShooterGame extends Component implements MiniGame<BubbleShooterServices> {
    @property({ type: [BubbleShooterAudioSlot] }) audioSlots: BubbleShooterAudioSlot[] = [];
    @property({ type: SpriteFrame }) supportFrame: SpriteFrame | null = null;
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
    private pausedFrom: 'playing' | 'completed' = 'playing';

    private readonly round = new BubbleShooterRound();
    private get model() { return this.round.board; }
    private readonly frames = new Map<BubbleColor, SpriteFrame>();
    private frostFrame?: SpriteFrame;
    private get currentColor(): BubbleColor { return this.round.current; }
    private set currentColor(color: BubbleColor) { this.round.current = color; }
    private get nextColor(): BubbleColor { return this.round.next; }
    private set nextColor(color: BubbleColor) { this.round.next = color; }
    private pendingShot?: Shot;
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
        view.on('canvas-resize', this.applyLayout, this);
        const play = this.node.getChildByName('Playfield')!;
        play.on(Node.EventType.TOUCH_START, this.startAim, this);
        play.on(Node.EventType.TOUCH_END, this.fire, this);
        play.on(Node.EventType.TOUCH_MOVE, this.aim, this);
        play.on(Node.EventType.TOUCH_CANCEL, this.cancelAim, this);
        play.getChildByPath('Launcher/NextBall')!.on(Node.EventType.TOUCH_END, this.swap, this);
        play.getChildByPath('Launcher/Swap')!.on(Node.EventType.TOUCH_END, this.swap, this);
        this.node.getChildByName('Pause')!.on(Node.EventType.TOUCH_END, this.requestPause, this);
        this.listening = true;
        this.drawDangerLine();
        const glow=new Node('DangerEdgeGlow');glow.layer=this.node.layer;glow.setParent(this.node);
        glow.addComponent(UITransform);this.dangerGlow=glow.addComponent(Graphics);
        const board = play.getChildByName('Board')!;
        board.children.forEach(ball => {
            const sprite = ball.getComponent(Sprite);
            const frame = sprite?.spriteFrame;
            const color = COLORS.find(c => frame?.name.includes('bubble-' + c));
            if (color && frame) this.frames.set(color, frame);
            const frost = ball.getChildByName('Frosting')?.getComponent(Sprite)?.spriteFrame;
            if (frost) this.frostFrame = frost;
        });
        if (this.frames.size !== 4 || (this.round.region==='cloud' && !this.frostFrame) || !this.supportFrame) throw new Error('Cloud scene is missing bubble SpriteFrames.');
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
        this.transitionView = new BubbleShooterTransitionView(this.node, rewardFrames.get('cloud-curtain')!,
            rewardFrames.get('boss-alert')!, rewardFrames.get('button')!, () => {
                if (this.context) this.context.requestLobby(); else this.transitionView?.cancel();
            });
        this.viewBuilt=true;
        this.applyLayout();
    }

    async initialize(context: MiniGameContext<BubbleShooterServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize BubbleShooterGame from ${this.state}.`);
        this.context = context;
        this.sound.bind(context.services.audio, this.audioSlots);
        this.round.reset('ocean');
        const saved = context.services.storage?.getGameData(context.gameId)?.custom?.activeRound;
        if (saved && typeof saved === 'object') {
            const record=saved as {round?:unknown;elapsed?:unknown};
            if(typeof record.elapsed==='number' && Number.isFinite(record.elapsed) && record.elapsed>=0 && this.round.restore(record.round,['cloud','ocean'])) {
                this.elapsed=record.elapsed;this.restored=true;
            }
        }
        if(!context.services.assets)throw new Error('Bubble Shooter requires session AssetService.');
        const generation=this.operationGeneration;
        const pack=await loadBubbleRegion(context.services.assets,this.round.region);
        if(generation!==this.operationGeneration || !this.node.isValid)throw new Error('Game initialization cancelled.');
        this.sceneSprites=BUBBLE_SCENE_SPRITES.map(([path])=>({path,sprite:this.node.getChildByPath(path)!.getComponent(Sprite)!}));
        this.applyRegionFrames(pack);
        this.buildView();
        this.applyRegionView(pack);
        this.healthVisible=this.healthTarget=this.round.bossHealth;
        this.syncBoss();this.syncBoard(false,true);this.syncItems();this.syncCounter();this.syncSupply();
        this.commitCheckpoint();
        this.applyLayout();
        this.state = 'ready';
    }

    private applyRegionFrames(pack: BubbleRegionAssets): void {
        this.regionAssets=pack;
        const paths=new Map(BUBBLE_SCENE_SPRITES);
        this.sceneSprites.forEach(({path,sprite})=>{
            if(!sprite.isValid)return;
            sprite.spriteFrame=pack.sceneFrame(paths.get(path)!);
        });
        this.frames.clear();COLORS.forEach(color=>this.frames.set(color,pack.regional(`bubbles/bubble-${color}`)));
        this.supportFrame=pack.regional('bubbles/bubble-support');
        this.frostFrame=pack.region==='cloud'?pack.regional('bubbles/frosting-overlay'):undefined;
        this.foregroundFrames=pack.region==='cloud'?['a','b','c'].map(key=>pack.regional(`foreground/cloud-${key}`)):[];
    }

    private applyRegionView(pack: BubbleRegionAssets): void {
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.oceanBoss?.dispose();this.oceanBossNode?.destroy();this.oceanBoss=undefined;this.oceanBossNode=undefined;
        this.oceanCastAge=-1;this.oceanTargets=[];this.oceanDefeating=false;this.bossCast=0;this.castFrozen.clear();
        for (const key of this.itemKeys) {
            const button=this.node.getChildByPath(`Playfield/Items/Item-${key}`)!;
            button.getComponent(Sprite)!.enabled=pack.region==='cloud';
            let base=button.getChildByName('OceanItemBase');
            if (pack.region==='ocean') {
                if(!base){base=new Node('OceanItemBase');base.layer=button.layer;base.setParent(button);base.addComponent(UITransform);base.addComponent(Sprite);}
                base.active=true;base.setSiblingIndex(0);base.setPosition(0,22);
                const frame=pack.regional('hud/item-base');
                const sprite=base.getComponent(Sprite)!;sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;
                base.getComponent(UITransform)!.setContentSize(120,120*frame.originalSize.height/frame.originalSize.width);
            } else if(base) {base.active=false;base.getComponent(Sprite)!.spriteFrame=null;}
        }
        this.node.getChildByPath('Playfield/Counter/BossSkill')!.getComponent(UITransform)!.setContentSize(36,pack.region==='ocean'?36:40);
        this.foreground?.clearStyles();
        if(pack.region==='ocean') {
            this.oceanAmbient=new BubbleShooterOceanAmbient(this.node,pack.regional('decoration/fish'),pack.regional('decoration/seaweed'));
            this.foreground?.register('ocean',{frames:[pack.regional('foreground/water-bubble-single')],
                width:84,opacity:190,duration:3.8,interval:2.5,bob:7,rise:220,motion:'bubbles'});
        } else this.foreground?.register('cloud',{frames:this.foregroundFrames,width:250,opacity:230,duration:11,interval:9,bob:12});
        const rewards=new Map<string,SpriteFrame>();
        this.node.getChildByName('RewardAssets')!.children.forEach(n=>{const f=n.getComponent(Sprite)?.spriteFrame;if(f)rewards.set(n.name,f);});
        this.attackFrame=rewards.get('attack-heart');
        this.particles?.dispose();this.particles=new BubbleShooterParticles(this.node.getChildByPath('Playfield/Vfx')!,rewards);
        this.particles.theme=pack.region;if(this.juice)this.juice.theme=pack.region;
        this.rewardView?.dispose();this.endView?.dispose();this.pauseView?.dispose();
        this.rewardView=new BubbleShooterRewardView(this.node,rewards,this.itemFrames,this.bossRoot!,()=>this.cue('select'));
        this.endView=new BubbleShooterEndView(this.node,rewards,this.bossRoot!,()=>this.cue('ui'));
        this.pauseView=new BubbleShooterEndView(this.node,rewards,this.bossRoot!,()=>this.cue('ui'));this.pauseView.root.name='PauseOverlay';
        if(pack.region==='ocean'){
            const node=new Node('OceanBoss');node.layer=this.node.layer;node.setParent(this.bossClip!);
            node.addComponent(UITransform);this.oceanBossNode=node;
            const boss=node.addComponent(BubbleShooterOceanBoss);boss.enabled=false;
            const parts=['body','crown','staff-arm','right-arm'] as const;
            boss.initialize(new Map(parts.map(part=>[part,pack.regional(`boss/boss-${part}`)])));boss.paused=false;
            this.oceanBoss=boss;
            if(this.round.stage==='boss' || this.round.stage==='victory')boss.showIdle();
            this.endView.setRegionDecoration(boss.modalFactory());this.pauseView.setRegionDecoration(boss.modalFactory());
            this.rewardView.setCelebration(pack.regional('reward/celebration'));
        }
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
        if (this.restored && this.round.rewardAvailable) this.showReward();
        else this.music(this.round.stage === 'boss' ? 'boss-music' : 'normal-music');
        this.restored = false;
        this.transitionView?.revealPrepared();
    }

    pause(): boolean {
        if (this.state !== 'playing' && this.state !== 'completed') return false;
        this.pausedFrom = this.state;
        this.sound.pause();
        this.persistCheckpoint();
        this.rewardView?.setEnabled(false);
        this.endView?.setEnabled(false);
        this.cancelAim();
        this.selectedItem = undefined;
        this.syncItems();
        this.syncSupply();
        this.state = 'paused';
        return true;
    }

    resume(): void {
        if (this.state === 'paused') { this.sound.resume(); this.state = this.pausedFrom; this.rewardView?.setEnabled(true); this.endView?.setEnabled(true); }
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state === 'paused') {
            this.pauseView?.showPause(model, async () => {
                this.restartCurrentRound = true;
                try { await model.restart(); }
                finally { this.restartCurrentRound = false; }
            });
        }
    }

    hidePauseMenu(): void { this.pauseView?.hide(); }

    async restart(context?: MiniGameContext<BubbleShooterServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') {
            throw new Error(`Cannot restart BubbleShooterGame from ${this.state}.`);
        }
        if (context) this.context = context;
        if (this.restartPending) return;
        const keepProgress = this.restartCurrentRound;
        const startRegion = keepProgress ? this.round.region : 'ocean';
        const generation = this.operationGeneration;
        let prepared: BubbleRegionAssets;
        let committed = false;
        const started = this.transitionView!.start(async () => {
            prepared = this.round.region === startRegion ? this.regionAssets!
                : await loadBubbleRegion(this.context!.services.assets!, startRegion);
            if (generation !== this.operationGeneration && !committed) throw new Error('Restart cancelled.');
        }, () => {
            if (!committed) {
                this.resetRound(keepProgress, true);
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
        const layout = calculateBubbleShooterLayout(width, height, this.context?.services.platform.getLayoutInfo());
        this.transitionView?.layout(width, height, this.pauseView?.content.position.y ?? 0);
        this.node.getComponent(UITransform)!.setContentSize(width, height);
        const play = this.node.getChildByName('Playfield')!;
        play.setScale(layout.scale, layout.scale, 1);
        play.setPosition(0, layout.playY);
        this.foreground?.layout(0,layout.playY,layout.scale);
        this.oceanAmbient?.layout(width,height,layout.playY,layout.scale);
        play.getChildByName('DangerLine')!.setPosition(0, DANGER);
        this.centerCounter();
        const launcher = play.getChildByName('Launcher')!;
        launcher.getChildByName('FixedConnector')!.active = false;
        const pivot = launcher.getChildByName('TurretPivot')!;
        const art=pivot.getChildByName('TurretArtwork')!,ocean=this.round.region==='ocean';
        // Region-specific spacing must be absolute so resize/region changes never accumulate it.
        launcher.getChildByName('NextBall')!.setPosition(ocean ? 191 : 173, 70);
        const artUI=art.getComponent(UITransform)!;
        // Approved world-v1 cutout: loading-hole centre is 34.3% up from its bottom.
        artUI.setAnchorPoint(.5,ocean?.343:0);
        if(ocean){const frame=art.getComponent(Sprite)!.spriteFrame;artUI.setContentSize(128,frame?128*frame.originalSize.height/frame.originalSize.width:150);}
        else artUI.setContentSize(96,118);
        art.setPosition(0,ocean?0:-52);
        pivot.getChildByName('CurrentBall')!.setSiblingIndex(ocean ? pivot.children.length-1 : 0);
        const pedestal=launcher.getChildByName('Pedestal')!;
        const baseFrame=pedestal.getComponent(Sprite)!.spriteFrame;
        pedestal.getComponent(UITransform)!.setContentSize(ocean?146:192,ocean&&baseFrame?146*baseFrame.originalSize.height/baseFrame.originalSize.width:128);
        pedestal.getComponent(UITransform)!.setAnchorPoint(.5,ocean?.5:.125);
        // The socket overlaps the circular lower housing throughout the full ±70° aim arc.
        pedestal.setPosition(ocean?pivot.position.x:0,ocean?pivot.position.y-38:0);
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
        const cloud = this.node.getChildByName('CloudTransition');
        const ledgeSprite=cloud?.getComponent(Sprite),ledgeFrame=ledgeSprite?.spriteFrame;
        if(ledgeSprite)ledgeSprite.trim=ocean;
        const ledgeHeight=ocean&&ledgeFrame?width*ledgeFrame.rect.height/ledgeFrame.rect.width:layout.cloudHeight;
        const ledgeY=ocean?layout.playY+(TOP+DIAMETER*.08)*layout.scale+ledgeHeight/2:layout.cloudY;
        cloud?.setPosition(0,ledgeY);
        cloud?.getComponent(UITransform)?.setContentSize(width,ledgeHeight);
        const clipBottom = ledgeY + (ocean ? 0 : -layout.cloudHeight*.12);
        this.bossHealthRoot?.setPosition(0, layout.healthY);
        this.bossHealthRoot?.setScale(layout.scale * .48, layout.scale * .48, 1);
        if(this.oceanBossNode){
            const available=Math.max(1,height/2-20-clipBottom);
            // Fit crown (y=240) through chest/hand (y=-140) above the ledge.
            const scale=Math.min(width/600,available/390);
            this.oceanBossNode.setScale(scale,scale,1);
            this.oceanBossNode.setPosition(0,145*scale);
        }
        if (this.bossRoot) {
            this.bossScale = layout.bossScale;
            // Clip inside the region's opaque ledge so lower body/entrance never leaks below it.
            this.bossClip?.setPosition(0, clipBottom);
            this.bossClip?.getComponent(UITransform)?.setContentSize(width, height / 2 - clipBottom);
            this.bossBaseY = layout.bossY - clipBottom;
            this.bossRoot.setPosition(0, this.bossBaseY);
            this.bossRoot.setScale(layout.bossScale, layout.bossScale, 1);
            this.bossRoot.getChildByName('LeftFist')!.setPosition(-200, 175);
            this.bossRoot.getChildByName('RightFist')!.setPosition(200, 175);
        }
    }

    private canInteract(): boolean {
        // Direct scene preview exercises the prototype without creating a global Session.
        return this.viewBuilt && !this.transitionView?.active && this.oceanCastAge<0 && !this.oceanBoss?.busy && this.bossCast === 0 && !this.attack && this.hitTime === 0 && !this.rewardView?.visible && !this.endView?.visible && !this.pauseView?.visible && this.round.stage !== 'boss-entry' && this.bossReveal >= 1 && !this.flight && this.transition === 0 && this.rowBirths.length === 0 && !this.effects.some(e => !e.falling) && this.effects.length < 285 && (this.state === 'playing' || (this.state === 'idle' && !this.context));
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
        this.node.getChildByPath('Playfield/AimFeedback')?.getComponent(Graphics)?.clear();
    }

    private drawAim(): void {
        const root = this.node.getChildByPath('Playfield/AimFeedback')!;
        const g = root.getComponent(Graphics) ?? root.addComponent(Graphics);
        g.clear();
        if (!this.pendingShot) return;
        const ocean = this.round.region === 'ocean';
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
        if (ocean) dots(6, new Color(13, 43, 66, 245));
        dots(ocean ? 4.2 : 4, ocean ? new Color(255, 246, 214, 255) : new Color(237, 105, 153, 200));
        const end=this.model.position(this.pendingShot.cell);
        if (ocean) {
            g.lineWidth=6; g.strokeColor=new Color(13,43,66,245);
            g.circle(end.x,end.y,DIAMETER / 2 - 2); g.stroke();
        }
        g.lineWidth=3;
        g.strokeColor=ocean ? new Color(255,246,214,255) : new Color(237,105,153,220);
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
        const kind: ShotKind = this.selectedItem === 'bomb' || this.selectedItem === 'wildcard' ? this.selectedItem : 'normal';
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
        if (this.state === 'disposed' || !this.viewBuilt) return;
        this.pauseView?.motion.update(dt); this.endView?.motion.update(dt); this.rewardView?.update(dt);
        this.updateAtmosphere(Math.max(0,Math.min(dt,.05)));
        if (this.state === 'paused') return;
        if (this.transitionView?.active) { this.transitionView.update(dt); return; }
        if (this.rewardView?.visible || this.endView?.visible || this.pauseView?.visible) return;
        this.oceanAmbient?.update(dt);
        if (this.state === 'playing' || this.state === 'idle') this.elapsed += Math.max(0, dt);
        this.particles?.update(Math.min(dt, .05));
        this.juice?.update(Math.min(dt,.05));
        this.foreground?.update(Math.min(dt,.05),this.round.region,!this.round.ended && this.round.stage!=='boss-entry');
        if (this.round.ended && this.round.stage !== 'victory' && !this.flight && !this.attack
            && this.hitTime === 0 && this.effects.length === 0 && this.transition === 0 && this.oceanCastAge<0 && !this.oceanBoss?.busy) {
            const ads = this.context?.services.ads;
            const available = !ads || ads.isEnabledForGame(this.context!.gameId);
            this.showEnd(this.round.canRevive && available ? 'offer' : 'result');
            return;
        }
        if (this.round.rewardAvailable && this.defeatElapsed >= 1.1 && !this.attack && !this.flight && this.effects.length === 0) {
            this.showReward();
            return;
        }
        if (this.transition > 0) {
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
        if (this.round.stage === 'boss-entry' && !this.flight && this.effects.length === 0 && this.transition === 0) {
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
        this.effects = this.effects.filter(effect => {
            effect.elapsed += Math.min(dt, .05);
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
                    ring.strokeColor = this.round.region==='ocean'?new Color(158,245,255,210*(1-t)):new Color(255, 237, 246, 210 * (1 - t));
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
        this.presentResult(result);
        if(!result.refilled) {
            const contact={x:point.x,y:point.y-((result.inserted||result.descended)?ROW_HEIGHT:0)};
            const newborns=new Set(this.rowBirths.map(b=>b.node));
            this.juice?.attach(this.node.getChildByPath('Playfield/Board')!.children.filter(n=>!newborns.has(n)),contact,point);
        }
    }

    private presentResult(result: OrdinaryResult): void {
        this.commitCheckpoint();
        if(this.particles)this.particles.theme=this.round.region;
        if(this.juice)this.juice.theme=this.round.region;
        if (result.removed.length) this.cue('pop', 'light'); else this.cue('attach');
        if (result.dropped.length) this.cue('drop');
        if (result.thawed.length) this.cue('thaw');
        if (result.frosted.length && this.round.stage !== 'boss') this.cue('frost');
        if (this.round.region==='ocean' && this.round.stage==='boss' && result.inserted) {
            this.oceanCastAge=0;this.oceanBoss?.cast();this.cue('ocean-cast');
        }
        if (this.round.region==='cloud' && this.round.stage === 'boss' && (result.frosted.length || result.inserted)) {
            this.bossCast = 2.05; this.castImpactPlayed = false;
            this.castFrozen.clear();
            result.frosted.forEach(b => this.castFrozen.add(`${b.row}:${b.col}`));
        }
        if (result.inserted || result.descended || result.refilled) this.cue('row');
        if ((this.round.stage === 'boss' && this.round.bossShots === BOSS_TUNING.shotsPerAction - 1)
            || (this.round.stage === 'ordinary' && this.round.accumulatedMisses === ORDINARY_TUNING.missesPerRow - 1)) this.cue('warning');
        result.removed.forEach((b, i) => this.animateRemoval(b, false, result.phaseBefore, i));
        const chainEnd=result.removed.length? (result.removed.length-1)*POP_CHAIN_INTERVAL+POP_BURST_TIME : 0;
        result.dropped.forEach((b, i) => this.animateRemoval(b, true, result.phaseBefore, i, chainEnd));
        result.thawed.forEach(b =>
            this.particles?.burst(b, position(b, result.phaseBefore), true));
        this.syncBoard(result.inserted || result.descended, result.refilled);
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

    private animateRemoval(bubble: Bubble, falling: boolean, phase: number, order = 0, startDelay = 0): void {
        const ball = this.createBall(falling ? this.fallingRoot! : this.node.getChildByPath('Playfield/Vfx')!, bubble.color, bubble.frosted, bubble.indestructible);
        const point = position(bubble, phase);
        ball.setPosition(point.x, point.y);
        ball.addComponent(UIOpacity);
        let ring: Graphics | undefined;
        if (!falling) {
            const rim = new Node('PopRim'); rim.layer = ball.layer; rim.setParent(ball);
            rim.addComponent(UITransform); ring = rim.addComponent(Graphics);
        }
        const motion=removalMotion(bubble, point, falling, order);motion.delay+=startDelay;
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

    private syncBoard(birthRow = false, wholeBoard = false): void {
        this.rowBirths = [];
        this.juice?.clear();
        const board=this.node.getChildByPath('Playfield/Board')!;
        board.children.slice().forEach(child=>{ child.removeFromParent(); child.destroy(); });
        this.model.bubbles.forEach(b=>{
            const pending=this.oceanCastAge>=0 && this.oceanCastAge<1.2?this.oceanTargets.find(t=>t.bubble.row===b.row&&t.bubble.col===b.col):undefined;
            const node=this.createBall(board,pending?.color??b.color,b.frosted,!!b.indestructible&&!pending);
            const point=this.model.position(b);
            node.setPosition(point.x,point.y);
            if (wholeBoard || (birthRow && b.row === 0)) {
                node.addComponent(UIOpacity).opacity = 0; node.setScale(.05,.05,1);
                this.rowBirths.push({node, elapsed:0, delay:wholeBoard ? b.row * .055 + b.col * .008 : b.col * .006, y:point.y});
            }
        });
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
        const kind = this.selectedItem === 'bomb' || this.selectedItem === 'wildcard' ? this.selectedItem : 'normal';
        this.setProjectileAppearance(current,kind,this.currentColor);
        this.node.getChildByPath('Playfield/Launcher/NextBall')!.getComponent(UITransform)!.setContentSize(DIAMETER, DIAMETER);
        this.node.getChildByPath('Playfield/Launcher/NextBall')!.getComponent(Sprite)!.spriteFrame=this.frames.get(this.nextColor)!;
    }

    private showReward(): void {
        this.particles?.clear(); this.juice?.clear();
        this.cue('reward'); this.music();
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
            const next:BubbleRegion=this.round.region==='cloud'?'ocean':'cloud';
            const generation=this.operationGeneration;let prepared:BubbleRegionAssets;let committed=false;
            this.transitionView!.start(async () => {
                prepared=await loadBubbleRegion(this.context!.services.assets!,next);
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

    private resetRound(keepProgress = false, keepTransition = false): void {
        this.foreground?.reset();
        this.rowBirths=[]; this.turretReturn=undefined;
        if (!keepTransition) this.transitionView?.cancel();
        this.runFinished = false; this.restored = false; this.checkpoint = undefined;
        this.particles?.clear(); this.juice?.clear();
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
        this.round.reset(keepProgress ? this.round.region : 'ocean', keepProgress);
        this.oceanBoss?.resetPose();this.oceanCastAge=-1;this.oceanTargets=[];this.oceanDefeating=false;
        this.bossReveal = 1;
        this.hitTime = 0;
        this.healthVisible = this.healthTarget = BOSS_TUNING.health;
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
        this.rowBirths = this.rowBirths.filter(b => {
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
        counter.setPosition(Number.isFinite(left)?-(left+right)/2:0,CLOUD_COUNTER_Y);
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

    private syncCounter(): void {
        const counter=this.node.getChildByPath('Playfield/Counter')!;
        const pending=counter.getChildByName('PendingRow');
        if (pending) pending.active=this.round.stage==='ordinary' && this.round.remainingRows>0;
        const limit = this.round.stage === 'boss' ? BOSS_TUNING.shotsPerAction : ORDINARY_TUNING.missesPerRow;
        const count = this.round.stage === 'boss' ? this.round.bossShots : this.round.accumulatedMisses;
        this.node.getChildByPath('Playfield/Counter')!.active = true;
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
        if (!this.canInteract()) return;
        const button = event.currentTarget as Node;
        const key = this.itemKeys.find(item => button.name === 'Item-' + item);
        if (!key || this.round.inventory[key] <= 0) return;
        this.cancelAim();
        if (key === 'clear-bottom' && this.selectedItem === key) {
            this.selectedItem = undefined;
            this.cue('clear-bottom', 'medium');
            this.presentResult(this.round.clearBottom());
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
        const names: Record<BubbleItem, string> = { bomb: '炸弹球', wildcard: '万能球', 'clear-bottom': '清底' };
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
            name.getComponent(UITransform)!.setContentSize(132,44);
            name.getComponent(Label)!.fontSize=23;
            button.getChildByName('Count')!.getComponent(Label)!.color=Color.WHITE;
            const selected = this.selectedItem === key;
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
        const visible = this.round.stage === 'boss' || this.round.stage === 'victory';
        this.bossRoot.active = visible && this.round.region==='cloud';
        if(this.oceanBossNode)this.oceanBossNode.active=visible;
        this.node.getChildByName('Environment')!.active = this.round.region==='cloud';
        this.node.getChildByName('Foreground')!.active = this.round.region==='cloud';
        if (this.bossHealthRoot) this.bossHealthRoot.active = visible;
        if (this.skillNode) this.skillNode.active = this.round.stage === 'boss';

    }

    private startAttack(result: OrdinaryResult): void {
        const sources = [...result.removed, ...result.dropped].map(b => {
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
        const chainEnd=result.removed.length?(result.removed.length-1)*POP_CHAIN_INTERVAL+POP_BURST_TIME:0;
        this.attack = { node, sources, elapsed: -chainEnd, targetHealth: this.round.bossHealth };
        this.updateAttack(0);
    }

    private updateAttack(dt: number): void {
        const attack = this.attack; if (!attack) return;
        attack.elapsed += dt;
        const rootTransform = this.node.getComponent(UITransform)!;
        const playTransform = this.node.getChildByName('Playfield')!.getComponent(UITransform)!;
        const bossTransform = (this.round.region==='ocean'?this.oceanBossNode!:this.bossRoot!).getComponent(UITransform)!;
        const target = rootTransform.convertToNodeSpaceAR(bossTransform.convertToWorldSpaceAR(new Vec3(0, 160, 0)));
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
        const width=Math.max(64,810*fraction);fill.active=fraction>0;
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
        const castAge = (2.05 - this.bossCast) * 1.25 / 2.05;
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
        body.setScale(1 + pulse + idle * .012 + cast * .065 + landing * .04,
            1 - pulse - idle * .009 - cast * .085 - landing * .035, 1);
        body.setPosition(0, 30 + recoil * 7);
        const left = this.bossRoot.getChildByName('LeftFist')!, right = this.bossRoot.getChildByName('RightFist')!;
        left.setPosition(-200 - cast * 12, 175 + Math.sin(this.bossClock * 2.4 + .8) * 6 + cast * 72);
        right.setPosition(200 + cast * 12, 175 + Math.sin(this.bossClock * 2.4 - .8) * 6 + cast * 72);
        left.angle = -idle * 2.5 - cast * 16; right.angle = idle * 2.5 + cast * 16;
        const crown = this.bossRoot.getChildByName('Crown')!;
        crown.setPosition(0, 240 + Math.sin(this.bossClock * 2.4 - .6) * 3 + cast * 5);
        crown.angle = Math.sin(this.bossClock * 1.2) * 2 + defeat * 18;
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
        if (this.hitFlash) {
            this.hitFlash.getComponent(UIOpacity)!.opacity = this.hitTime > 0 ? 150 * Math.sin(this.hitTime / 0.35 * Math.PI) : 0;
            this.hitFlash.setScale(body.scale);
            this.hitFlash.setPosition(body.position);
            if (this.hitTime > 0) this.hitFlash.getComponent(Sprite)!.getMaterialInstance(0)?.overridePipelineStates({
                blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE }] },
            });
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
        if (!this.endView?.visible && (page === 'offer' || page === 'result')) this.cue('failure', 'medium');
        if (page === 'offer' || page === 'result') this.music();
        if (page === 'result') this.discardSavedProgress();
        this.particles?.clear(); this.juice?.clear();
        if (this.state !== 'paused') this.state = 'completed';
        else this.pausedFrom = 'completed';
        this.cancelAim();
        this.selectedItem = undefined;
        this.node.getChildByName('Pause')!.active = false;
        if (page === 'result' && !this.finalResult) {
            this.finalResult = Object.freeze({ score: 0, duration: this.elapsed, completed: false,
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
                else context.requestLobby(this.finalResult);
            } else if (!primary) this.showEnd('result');
            else void this.requestRevive();
        }, message);
        this.endView?.setEnabled(this.state !== 'paused');
    }

    private async requestRevive(): Promise<void> {
        if (this.revivePending || !this.round.canRevive) return;
        const context = this.context;
        if (!context?.services.ads) {
            this.showEnd('offer', '视频暂时不可用，请稍后重试');
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
                ? '视频未看完，复活机会仍保留' : '视频暂时不可用，请稍后重试');
        } catch {
            if (generation === this.operationGeneration && this.context === context)
                this.showEnd('offer', '视频暂时不可用，请稍后重试');
        } finally {
            if (generation === this.operationGeneration) this.revivePending = false;
        }
    }

    private music(cue?: 'normal-music' | 'boss-music'): void {
        this.sound.music(cue && this.round.region==='ocean' ? (cue==='boss-music'?'ocean-boss-music':'ocean-normal-music') : cue);
    }

    private cue(cue: CloudCue, vibration?: 'light' | 'medium'): void {
        this.sound.play(cue);
        if (vibration && this.state !== 'paused') this.context?.services.feedback?.vibrate(vibration);
    }

    private commitCheckpoint(): void {
        if (this.runFinished) return;
        this.checkpoint = { round: this.round.snapshot(), elapsed: this.elapsed };
        this.persistCheckpoint();
    }

    private persistCheckpoint(): void {
        const context = this.context, storage = context?.services.storage;
        if (!context || !storage) return;
        try {
            const previous = storage.getGameData(context.gameId);
            storage.writeGameData(context.gameId, {
                dataVersion: 1, playCount: previous?.playCount ?? 0, highScore: previous?.highScore ?? 0,
                lastPlayedAt: Date.now(), custom: { ...previous?.custom,
                    activeRound: this.runFinished || !this.checkpoint ? null : { ...this.checkpoint, elapsed: this.elapsed } },
            });
        } catch (error) { console.warn('[BubbleShooter] Save deferred/failed.', error); }
    }

    discardSavedProgress(): void {
        this.runFinished = true; this.checkpoint = undefined; this.persistCheckpoint();
    }

    private requestPause(): void {
        if (this.state === 'playing') this.context?.requestPause();
    }

    private drawDangerLine(): void {
        const line = this.node.getChildByPath('Playfield/DangerLine')!;
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
        if (!this.listening) return;
        view.off('canvas-resize', this.applyLayout, this);
        const play = this.node.getChildByName('Playfield');
        play?.targetOff(this);
        play?.getChildByPath('Launcher/NextBall')?.targetOff(this);
        play?.getChildByPath('Launcher/Swap')?.targetOff(this);
        this.node.getChildByName('Pause')?.targetOff(this);
        for (const key of this.itemKeys) this.node.getChildByPath('Playfield/Items/Item-' + key)?.targetOff(this);
        this.listening = false;
    }

    async dispose(): Promise<void> {
        this.rowBirths=[];this.turretReturn=undefined;
        if (this.state === 'disposed') return;
        this.persistCheckpoint();
        this.viewBuilt=false;this.oceanBoss?.dispose();this.oceanBoss=undefined;this.oceanBossNode?.destroy();this.oceanBossNode=undefined;
        this.sceneSprites=[];this.regionAssets=undefined;this.oceanTargets=[];
        this.foreground?.dispose(); this.foreground=undefined;this.foregroundFrames=[];
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.juice?.dispose(); this.juice=undefined;
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
        this.round.clear();
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
        this.rowBirths=[];this.turretReturn=undefined;
        this.persistCheckpoint();
        this.viewBuilt=false;this.oceanBoss?.dispose();this.oceanBoss=undefined;this.oceanBossNode?.destroy();this.oceanBossNode=undefined;
        this.sceneSprites=[];this.regionAssets=undefined;this.oceanTargets=[];
        this.foreground?.dispose(); this.foreground=undefined;this.foregroundFrames=[];
        this.oceanAmbient?.dispose();this.oceanAmbient=undefined;
        this.juice?.dispose(); this.juice=undefined;
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
        this.round.clear();
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
