import { _decorator, BlockInputEvents, Button, Color, Component, EventKeyboard, EventTouch, Graphics,
    Input, input, KeyCode, Label, Node, Sprite, SpriteFrame, UITransform, view } from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { AssetService } from '../../../services/asset/AssetService';
import type { Platform } from '../../../platform/Platform';
import type { StorageService } from '../../../services/storage/StorageService';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { setLabelBold } from '../../../services/font/FontBinding';
import { COURSE, DROP, MemeRunnerModel, RUNNER, STREAK, steamPhase, dronePhase, type RunnerObstacle, type RunnerPlatform } from './MemeRunnerModel';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { MemeRunnerMotion, RUNNER_FRAME_SOURCES, RUN_IN_DURATION, runnerEntry } from './MemeRunnerMotion';
import { MemeRunnerHero } from './MemeRunnerHero';
import { CAST_FRAME_SOURCES, MemeRunnerCast } from './MemeRunnerCast';
import { readRunnerProgress, recordRunnerResult, type RunnerProgress } from './MemeRunnerProgress';
import type { AudioService } from '../../../services/audio/AudioService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import { RUNNER_AUDIO, RUNNER_EVENT_CUES } from './MemeRunnerAudio';
import { WORLD_ART } from './MemeRunnerWorldArt';
import { MemeRunnerWorld } from './MemeRunnerWorld';
import { runnerFailureHint, RUNNER_UI as T } from './MemeRunnerUI';
import { MemeRunnerDialogs, type ResultMotion } from './MemeRunnerDialogs';
import { REGIONS, regionIndex } from './MemeRunnerRegions';
import { MemeRunnerEffects } from './MemeRunnerEffects';
import { MemeRunnerFever } from './MemeRunnerFever';
import { MemeRunnerCustomer } from './MemeRunnerCustomer';
import { MemeRunnerForeground } from './MemeRunnerForeground';
import { MemeRunnerControls } from './MemeRunnerControls';
import { MemeRunnerHUD } from './MemeRunnerHUD';
import { MemeRunnerItems } from './MemeRunnerItems';
import { MemeRunnerGround } from './MemeRunnerGround';
import { V34_ART } from './MemeRunnerArtV34';
import { V33_ART } from './MemeRunnerArtV33';
import { V38_ART } from './MemeRunnerArtV38';
import { V47_ART } from './MemeRunnerArtV47';
import { V48_ART } from './MemeRunnerArtV48';

const { ccclass } = _decorator;
const BUNDLE = 'game-meme-runner-assets';
/** The road occupies about the bottom 19% of the screen (v38 layering). */
const W = 1280, H = 920, UI_H = 800, FLOOR = -230, HERO_X = -320;
/** Transparent inset below the machine's feet. */
const SPRING_FOOT = 2;
interface Services { assets: AssetService; platform: Platform; storage: StorageService; audio: AudioService; feedback: FeedbackService; }
type State = 'idle' | 'ready' | 'countdown' | 'entering' | 'playing' | 'paused' | 'ending' | 'finished' | 'disposed';
interface ResultPresentation { age: number; motion: ResultMotion; }
/** Seconds of celebration at the customer's door before the result card. */
const DELIVERY_CELEBRATION = 1.8;

/** 街区怪咖 · stitched paper controls, plush sprites, fixed side-on camera. */
@ccclass('MemeRunnerGame')
export class MemeRunnerGame extends Component implements MiniGame<Services> {
    private context?: MiniGameContext<Services>;
    private state: State = 'idle';
    private pausedState: 'countdown' | 'entering' | 'playing' | 'ending' = 'playing';
    private model?: MemeRunnerModel;
    private entryAge = 0;
    private progressData: RunnerProgress = readRunnerProgress(undefined);
    private newRecord = false;
    private audioBank?: BundleAudioBank;
    private frames?: Readonly<Record<string, SpriteFrame>>;
    private loading?: Promise<void>;
    private unsubscribeLayout?: Unsubscribe;
    private courseSeed = 0;
    private checkpointAge = 0;
    private checkpointWarning = false;
    private countdownAge = 0;
    private countdown?: Label;
    private inputAttached = false;
    private readonly slideTouches = new Set<number>();
    private readonly jumpTouches = new Set<number>();
    private readonly heldKeys = new Set<KeyCode>();
    private readonly obstacleViews = new Map<number, Node>();
    private readonly coinViews = new Map<number, Node>();
    private readonly platformViews = new Map<number, Node>();
    private world?: MemeRunnerWorld;
    private effects?: MemeRunnerEffects;
    private feverView?: MemeRunnerFever;
    private customer?: MemeRunnerCustomer;
    private foreground?: MemeRunnerForeground;
    private stage?: Node;
    private playfield?: Node;
    private scenery?: Node;
    private objects?: Node;
    private hero?: Node;
    private heroView?: MemeRunnerHero;
    private cast?: MemeRunnerCast;
    private readonly motion = new MemeRunnerMotion();
    private shadow?: Graphics;
    private itemsView?: MemeRunnerItems;
    private readonly trapPhases = new Map<number, string>();
    private groundView?: MemeRunnerGround;
    private hudView?: MemeRunnerHUD;
    private worldBounds = { left: -W / 2, right: W / 2, bottom: -H / 2, top: H / 2 };
    private safeStageBounds = { right: W / 2, bottom: -H / 2, top: H / 2 };
    private hud?: Node;
    private controls?: Node;
    private controlView?: MemeRunnerControls;
    private overlay?: Node;
    private resultPresentation?: ResultPresentation;
    private dialogs?: MemeRunnerDialogs;
    private endingAge = 0;
    private scoreSent = -1;
    private layout?: ReturnType<typeof calculateSafeContentBounds>;

    async initialize(context: MiniGameContext<Services>): Promise<void> {
        if (this.state !== 'idle') throw Error('Runner already initialized');
        this.context = context;
        const saved = context.services.storage.getGameData(context.gameId)?.custom;
        this.progressData = readRunnerProgress(saved?.runnerProgress);
        // highScore is the cloud-saved best final score; custom records are local only.
        this.progressData.best.score = Math.max(this.progressData.best.score, context.services.storage.getGameData(context.gameId)?.highScore ?? 0);
        this.loading = this.prepare(context);
        try { await this.loading; } finally { this.loading = undefined; }
    }
    private async prepare(context: MiniGameContext<Services>): Promise<void> {
        const entries = CAST_FRAME_SOURCES.map(({ key, path }) => ({ key, path: PACKED_SPRITE_PATHS[path], type: 'frame' as const }));
        for (const key of Object.keys(WORLD_ART).filter(key => key.startsWith('fx-'))) entries.push({ key, path: PACKED_SPRITE_PATHS[WORLD_ART[key].path], type: 'frame' });
        const retained = (source: typeof V38_ART, keep: (key: string) => boolean): typeof V38_ART => {
            const selected: Record<string, typeof V38_ART[string]> = {};
            for (const key of Object.keys(source)) if (keep(key)) selected[key] = source[key];
            return selected;
        };
        // Every frame has one load and one release; replacement keys never load their retired atlas too.
        const art = { ...V33_ART, ...retained(V34_ART, key => key.startsWith('dash-aura-')),
            ...retained(V38_ART, key => !/^(ground-|fg-|customer-|dlg-art-)/.test(key)),
            ...retained(V47_ART, key => key === 'balloons'), ...V48_ART };
        for (const key of Object.keys(art).filter(key => !key.startsWith('comic-'))) entries.push({ key, path: PACKED_SPRITE_PATHS[art[key].path], type: 'frame' });
        const frames = await context.services.assets.loadSpriteFrames(BUNDLE, entries);
        if (this.state === 'disposed') {
            Object.keys(frames).forEach(key => context.services.assets.releaseRuntimeAsset(frames[key])); return;
        }
        this.frames = frames;
        this.audioBank = new BundleAudioBank(RUNNER_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as State) === 'disposed') return;
        this.build();
        view.on('canvas-resize', this.applyLayout, this);
        this.unsubscribeLayout = context.services.platform.onLayoutChange(this.applyLayout);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this); this.inputAttached = true;
        this.state = 'ready'; this.resetModel(); this.applyLayout();
    }
    begin(): void {
        if (this.state !== 'ready') return;
        const checkpoint = this.context!.services.storage.getLocalGameState(this.context!.gameId) as { view?: { phase?: number; frame?: string } };
        const restored = MemeRunnerModel.restore(checkpoint);
        if (restored) {
            this.resetModel(restored);
            const savedView = checkpoint.view;
            if (savedView && Number.isFinite(savedView.phase)) this.motion.phase = Math.max(0, Math.min(1, savedView.phase));
            if (savedView && RUNNER_FRAME_SOURCES.some(source => source.key === savedView.frame)) this.motion.frame = savedView.frame;
            this.startCountdown();
        }
        else this.startRun();
    }
    isGameplayActive(): boolean { return this.state === 'countdown' || this.state === 'entering' || this.state === 'playing' || this.state === 'ending'; }
    pause(): boolean {
        if (this.state !== 'countdown' && this.state !== 'entering' && this.state !== 'playing' && this.state !== 'ending') return false;
        this.saveCheckpoint(); this.pausedState = this.state;
        this.state = 'paused'; this.clearInput(); this.audioBank?.stopEffects(); this.context?.services.audio.pauseMusic(); return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.clearInput(); this.state = this.pausedState;
        if (this.state === 'playing') this.startCountdown();
        if (this.state !== 'ending') this.context?.services.audio.resumeMusic();
    }
    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.clearInput(); this.clearOverlay();
        if (this.model?.delivered) this.courseSeed = Date.now() >>> 0;
        this.startRun();
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.saveCheckpoint(); this.state = 'disposed'; this.clearInput(); this.audioBank?.dispose();
        view.off('canvas-resize', this.applyLayout, this); this.unsubscribeLayout?.(); this.unsubscribeLayout = undefined;
        if (this.inputAttached) {
            input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
            input.off(Input.EventType.KEY_UP, this.keyUp, this); this.inputAttached = false;
        }
        await this.loading?.catch(() => undefined);
        this.audioBank?.dispose(); this.audioBank = undefined;
        for (const sprite of this.node.getComponentsInChildren(Sprite)) sprite.spriteFrame = null;
        this.clearOverlay(); this.heroView?.dispose(); this.heroView = undefined; this.cast?.dispose(); this.cast = undefined;
        this.controlView?.dispose(); this.controlView = undefined; this.hudView?.dispose(); this.hudView = undefined;
        this.itemsView?.dispose(); this.itemsView = undefined; this.groundView?.dispose(); this.groundView = undefined;
        this.world?.dispose(); this.world = undefined; this.effects?.dispose(); this.effects = undefined;
        this.feverView?.dispose(); this.feverView = undefined; this.customer?.dispose(); this.customer = undefined;
        this.foreground?.dispose(); this.foreground = undefined; this.playfield?.destroy();
        if (this.frames) Object.keys(this.frames).forEach(key => this.context?.services.assets.releaseRuntimeAsset(this.frames![key]));
        this.obstacleViews.clear(); this.coinViews.clear(); this.platformViews.clear(); this.trapPhases.clear();
        this.context = this.frames = this.model = this.layout = undefined;
        this.playfield = this.stage = this.scenery = this.objects = this.hero = this.hud = this.controls = undefined;
        this.shadow = this.countdown = undefined;
    }
    update(delta: number): void {
        if (this.state === 'countdown') {
            this.countdownAge += Math.max(0, Math.min(.1, delta));
            const remaining = Math.max(1, 3 - Math.floor(this.countdownAge + 1e-8));
            this.countdown!.string = String(remaining);
            const pulse = this.countdownAge % 1; this.countdown!.node.setScale(1 + .18 * (1 - pulse), 1 + .18 * (1 - pulse), 1);
            if (this.countdownAge + 1e-8 >= 3) { this.countdown!.node.active = false; this.state = 'playing'; this.context?.services.audio.resumeMusic(); }
            return;
        }
        if (this.state === 'entering' && this.model) {
            const dt = Math.max(0, Math.min(.1, delta));
            const entryStep = Math.min(dt, Math.max(0, RUN_IN_DURATION - this.entryAge));
            const nextAge = this.entryAge + entryStep;
            this.entryAge = nextAge + 1e-8 >= RUN_IN_DURATION ? RUN_IN_DURATION : nextAge;
            this.motion.advance(this.model, entryStep);
            if (this.entryAge < RUN_IN_DURATION) { this.render(); return; }
            this.state = 'playing';
            // Spend the rest of a crossing frame scrolling the street, rather than waiting for another update.
            delta = Math.max(0, dt - entryStep);
            if (delta < 1e-8) { this.render(); return; }
        }
        if (this.state === 'finished' && this.resultPresentation) { this.animateResult(Math.min(.1, delta)); return; }
        if (this.state === 'ending' && this.model) {
            const step = Math.min(.1, delta), delivered = this.model.delivered;
            this.endingAge += step; this.effects?.advance(this.model, step, true); this.hudView?.advance(step);
            this.motion.finish(delivered, this.endingAge); this.render();
            if (this.endingAge >= (delivered ? DELIVERY_CELEBRATION : 1)) { this.state = 'finished'; this.context?.requestExit(this.result(true)); }
            return;
        }
        if (this.state !== 'playing' || !this.model) return;
        const m = this.model;
        const previousTime = m.time; m.advance(delta);
        this.checkpointAge += m.time - previousTime;
        if (this.checkpointAge >= 2) this.saveCheckpoint();
        this.motion.advance(m, m.time - previousTime);
        this.effects?.advance(m, m.time - previousTime);
        this.hudView?.advance(m.time - previousTime);
        for (const feedback of m.feedbacks) if (feedback.kind === 'coin') {
            this.hudView?.collectCoin(HERO_X + feedback.x - m.x, FLOOR + feedback.y, feedback.value / 10);
        } else if (feedback.kind === 'streak') {
            // The chain's payout bursts from the runner as a small spray of coins flying to the counter.
            for (let i = 0; i < 5; i++) this.hudView?.collectCoin(HERO_X + feedback.x - m.x + (i - 2) * 26, FLOOR + feedback.y + (i % 2) * 22, STREAK.coins / 5);
        }
        for (const event of m.events) {
            const cue = RUNNER_EVENT_CUES[event];
            if (cue) this.context?.services.feedback.play(cue, { vibrate: event === 'hit' || event === 'fall' || event === 'break' || event === 'fever',
                minIntervalMs: event === 'warning' ? 600 : event === 'coin' ? 35 : 60,
                volume: event === 'warning' ? .55 : event === 'coin' ? .6 : event === 'land' ? .45 : .85,
                variant: event === 'coin' ? m.coins % 4 : undefined });
        }
        m.events.length = 0;
        m.feedbacks.length = 0;
        if (m.score !== this.scoreSent) { this.scoreSent = m.score; this.context?.reportScore(m.score); }
        this.render();
        if (m.ended) {
            this.state = 'ending'; this.endingAge = 0; this.clearInput();
            this.context?.services.storage.writeLocalGameState(this.context.gameId, null);
            this.context?.services.audio.pauseMusic();
            // A delivery already played its cue through the event table.
            if (!m.delivered) this.context?.services.feedback.play('failure', { vibrate: false, volume: .85 });
            this.settle(m);
            // Runtime uses completed to distinguish a settled round from an early exit.
        }
    }
    private startRun(countdown = false): void {
        this.playfield!.active = true;
        this.hud!.active = this.controls!.active = true;
        this.clearInput(); this.clearOverlay(); this.entryAge = 0; this.resetModel(); this.state = 'entering'; this.render();
        this.audioBank?.stopEffects(); this.context?.services.audio.resumeMusic();
        this.context?.services.feedback.play('voice4', { vibrate: false, volume: .7 });
        this.save({ runnerVisited: true }); this.saveCheckpoint();
        if (countdown) this.startCountdown();
    }
    private startCountdown(): void {
        this.clearOverlay(); this.clearInput(); this.state = 'countdown'; this.countdownAge = 0;
        this.playfield!.active = this.hud!.active = this.controls!.active = true;
        this.countdown!.node.active = true; this.countdown!.string = '3';
        this.context?.services.audio.pauseMusic(); this.render();
    }
    private saveCheckpoint(): void {
        if (!this.context || !this.model || this.model.ended || ['playing', 'entering', 'countdown', 'paused'].indexOf(this.state) < 0
) return;
        this.checkpointAge = 0;
        const storage = this.context.services.storage, old = storage.getGameData(this.context.gameId);
        try {
            storage.writeLocalGameState(this.context.gameId, { ...this.model.snapshot(),
                view: { phase: this.motion.phase, frame: this.motion.frame } });
            this.checkpointWarning = false;
        } catch (error) {
            if (!this.checkpointWarning) console.warn('[MemeRunner] Local continuation could not be saved.', error);
            this.checkpointWarning = true;
        }
        if (this.model.score > (old?.highScore ?? 0)) storage.writeGameData(this.context.gameId,
            { ...(old ?? { dataVersion: 1, playCount: 0 }), highScore: this.model.score });
    }
    /** Records the final score as the personal best (highScore is also the cloud-saved value). */
    private settle(m: MemeRunnerModel): void {
        if (!this.context) return;
        const storage = this.context.services.storage, old = storage.getGameData(this.context.gameId);
        this.newRecord = m.score > this.progressData.best.score;
        this.progressData = recordRunnerResult(this.progressData, m);
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }),
            highScore: Math.max(old?.highScore ?? 0, m.score), custom: { ...old?.custom, runnerProgress: this.progressData } });
        this.context.reportRoundFinished?.();
    }
    private resetModel(restored?: MemeRunnerModel): void {
        this.clearInput();
        if (restored) this.courseSeed = restored.seed;
        if (!this.courseSeed) this.courseSeed = Date.now() >>> 0 || 1;
        this.model = restored ?? new MemeRunnerModel(this.courseSeed);
        this.newRecord = false; this.setRunningUI(true);
        this.motion.reset(this.model); this.hudView?.reset(); this.scoreSent = -1; this.endingAge = 0;
        this.effects?.reset(); this.customer?.reset(); this.world?.reset(this.model); this.cast?.reset(); this.itemsView?.reset(); this.trapPhases.clear();
        for (const n of Array.from(this.obstacleViews.values())) n.destroy();
        for (const n of Array.from(this.coinViews.values())) n.destroy();
        for (const n of Array.from(this.platformViews.values())) n.destroy();
        this.obstacleViews.clear(); this.coinViews.clear(); this.platformViews.clear(); this.context?.reportScore(this.model.score); this.render();
    }
    private build(): void {
        this.playfield = this.make('RunnerPlayfield', this.node, 1334, 750);
        this.stage = this.make('RunnerStage', this.playfield, W, H);
        this.world = new MemeRunnerWorld(this.playfield, this.stage, this.frames!);
        // The street reaches the viewport edges; only the actor and UI use the safe stage.
        this.scenery = this.make('RunnerWorld', this.stage, W, H);
        this.groundView = new MemeRunnerGround(this.scenery, this.frames!);
        this.objects = this.make('ObstaclesAndCoins', this.scenery, W, H);
        this.shadow = this.make('HeroShadow', this.scenery, 110, 14).addComponent(Graphics);
        this.shadow.fillColor = color(T.ink, 45); this.shadow.ellipse(0, 0, 50, 5); this.shadow.fill();
        this.shadow.node.setPosition(HERO_X + 8, FLOOR + 1);
        this.cast = new MemeRunnerCast(this.scenery, this.frames!);
        this.heroView = new MemeRunnerHero(this.scenery, this.frames!); this.hero = this.heroView.root;
        this.itemsView = new MemeRunnerItems(this.scenery, this.frames!, this.stage);
        this.effects = new MemeRunnerEffects(this.scenery, this.frames!);
        this.customer = new MemeRunnerCustomer(this.objects!, this.frames!);
        // Drawn last within the street, so it passes in front of the road and the runner's feet.
        this.foreground = new MemeRunnerForeground(this.scenery, this.frames!);
        this.feverView = new MemeRunnerFever(this.stage);
        this.hud = this.make('RunnerHUD', this.stage, W, H);
        this.hudView = new MemeRunnerHUD(this.hud, this.frames!, () => { this.context?.requestPause(); });
        this.dialogs = new MemeRunnerDialogs(this.frames!, this.bindButton);
        this.countdown = this.label('ResumeCountdown', this.hud, '3', 0, 30, 220, 180, 120, T.paper);
        this.countdown.enableOutline = true; this.countdown.outlineColor = color(T.ink); this.countdown.outlineWidth = 5; this.countdown.node.active = false;
        this.controls = this.make('RunnerControls', this.stage, W, H);
        this.controlView = new MemeRunnerControls(this.controls, this.frames!);
        const slide = this.controlView.slide.root, jump = this.controlView.jump.root;
        slide.on(Node.EventType.TOUCH_START, this.slideStart, this);
        slide.on(Node.EventType.TOUCH_END, this.slideEnd, this);
        slide.on(Node.EventType.TOUCH_CANCEL, this.slideEnd, this);
        jump.on(Node.EventType.TOUCH_START, this.jumpStart, this);
        jump.on(Node.EventType.TOUCH_END, this.jumpEnd, this);
        jump.on(Node.EventType.TOUCH_CANCEL, this.jumpEnd, this);
    }
    private render(): void {
        const m = this.model; if (!m || !this.hero || !this.frames) return;
        const { left, right } = this.worldBounds;
        // The camera never moves vertically: every route, jump and flight stays within the stage.
        this.world!.render(m, FLOOR);
        const pits = m.obstacles.filter(o => o.kind === 'gap' && !o.broken).map(o => [HERO_X + o.x - m.x, o.width] as const)
            .filter(([x, w]) => x + w >= left && x <= right);
        this.groundView!.render(m.x, this.world!.theme, pits);
        for (const o of m.obstacles) {
            const x = HERO_X + o.x - m.x;
            if (o.broken || x + o.width < left || x > right) continue;
            if (o.kind.startsWith('drone-') && dronePhase(o.visibleAge ?? -1) !== 'flight') { const view = this.obstacleViews.get(o.id); if (view) view.active = false; continue; }
            let n = this.obstacleViews.get(o.id);
            if (!n) { n = this.createObstacle(o); this.obstacleViews.set(o.id, n); }
            // Ground hazards may stand on a platform; a banner hangs at its own hem height; Drone draws its own height.
            const lift = o.kind.startsWith('drone-') ? 0 : o.kind === 'bar' ? (o.bottom ?? RUNNER.barBottom) - RUNNER.barBottom : o.bottom ?? 0;
            n.active = true; n.setPosition(x + o.width / 2, FLOOR + lift);
            if (o.kind === 'gap') n.getChildByName('FloatingBridge')!.active = !!o.bridged;
            if (o.kind === 'drop-crate') {
                const warning = (o.visibleAge ?? -1) >= 0 && (o.visibleAge ?? 0) < DROP.warning;
                n.getChildByName('TrapWarning')!.active = warning;
            } else if (o.kind === 'roller') {
                n.getChildByName('RollingBarrel')!.angle = ((o.originX ?? o.x) - o.x) / 46 * 180 / Math.PI;
                n.getChildByName('TrapWarning')!.active = (o.visibleAge ?? -1) >= 0 && (o.visibleAge ?? 0) < .55;
            } else if (o.kind === 'steam') {
                const phase = steamPhase(o.visibleAge ?? -1);
                n.getChildByName('SteamJet')!.active = phase === 'active';
                n.getChildByName('TrapWarning')!.active = phase === 'warning';
                if (this.trapPhases.get(o.id) !== phase) {
                    this.trapPhases.set(o.id, phase);
                    n.getChildByName('SteamBase')!.getComponent(Sprite)!.color = color(phase === 'active' ? '#FFC2A6' : '#FFFFFF');
                }
            }

        }
        for (const [id, n] of Array.from(this.obstacleViews.entries())) {
            const o = m.obstacles.find(candidate => candidate.id === id);
            if (!o || o.broken || o.x + o.width - m.x + HERO_X < left) { n.destroy(); this.obstacleViews.delete(id); this.trapPhases.delete(id); }
        }
        for (const platform of m.platforms) {
            const x = HERO_X + platform.x - m.x;
            if (x + platform.width < left || x > right) continue;
            let n = this.platformViews.get(platform.id);
            if (!n) { n = this.createPlatform(platform); this.platformViews.set(platform.id, n); }
            if (platform.spring) {
                const pose = m.time - (platform.pressed ?? -10) < .25 ? 'spring-1' : 'spring-0', s = n.getComponent(Sprite)!;
                if (s.spriteFrame !== this.frames[pose]) s.spriteFrame = this.frames[pose];
                n.setPosition(x + platform.width / 2, FLOOR + platform.y - SPRING_FOOT); continue;
            }
            n.setPosition(x + platform.width / 2, FLOOR + platform.y);
        }
        for (const [id, n] of Array.from(this.platformViews.entries())) {
            const p = m.platforms.find(p => p.id === id);
            if (!p || HERO_X + p.x + p.width - m.x < left) { n.destroy(); this.platformViews.delete(id); }
        }
        const visibleCoins = new Set<number>();
        for (const coin of m.pickups) {
            const x = HERO_X + coin.x - m.x;
            if (coin.taken || x < left || x > right) { this.coinViews.get(coin.id)?.destroy(); this.coinViews.delete(coin.id); continue; }
            visibleCoins.add(coin.id);
            let n = this.coinViews.get(coin.id);
            if (!n) {
                const key = coin.golden ? 'coin-gold' : 'coin';
                n = this.sprite(`MilkTea-${coin.id}`, this.objects!, key, ...V38_ART[key].size); this.coinViews.set(coin.id, n);
            }
            n.setPosition(x, FLOOR + coin.y); n.setScale(.87 + .13 * Math.sin(m.time * 4 + coin.id), 1, 1);
        }
        // The model removes taken coins before render; reconcile absent IDs too.
        for (const [id, n] of Array.from(this.coinViews.entries())) if (!visibleCoins.has(id)) {
            n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); this.coinViews.delete(id);
        }
        const entering = this.state === 'entering' || (this.state === 'paused' && this.pausedState === 'entering');
        const entry = entering ? runnerEntry(this.entryAge, left, HERO_X) : undefined;
        // One stop-motion clock runs on from the run-in through the run to the ending.
        this.cast!.update(m, HERO_X, FLOOR, left, right, this.entryAge + m.time + this.endingAge, this.endingAge, entry);
        const actorX = entry?.heroX ?? HERO_X;
        // A delivery made in mid-air settles onto the doorstep for the celebration.
        const heroY = m.delivered ? m.y * Math.max(0, 1 - this.endingAge / .25) : m.y;
        const caughtPose = this.state === 'ending' && !m.delivered ? 35 : 0;
        this.heroView!.render(this.motion, actorX, FLOOR + heroY + this.cast!.riderOffset(m, this.motion.frame) + caughtPose,
            !m.ended && m.invulnerable > 0 && Math.floor(m.time * 14) % 2 ? 140 : 255, m.giantTime > 0);
        // The shadow lies on the highest surface below the runner: a platform, else the road; over a pit there is none.
        const below = m.platforms.filter(p => m.x >= p.x && m.x <= p.x + p.width && p.y <= heroY + 1).reduce((top, p) => Math.max(top, p.y), -1);
        const pit = m.obstacles.some(o => o.kind === 'gap' && !o.bridged && m.x > o.x && m.x < o.x + o.width);
        const surface = below >= 0 ? below : pit ? -1 : 0;
        this.shadow!.node.setPosition(actorX + 8, FLOOR + surface + 1);
        this.shadow!.node.active = surface >= 0 && heroY >= surface;
        this.shadow!.node.setScale(Math.max(20, 50 - (heroY - surface) * .08) / 50, 1, 1);
        this.customer!.render(m, HERO_X, FLOOR, left, right, this.endingAge);
        this.foreground!.render(m.x, this.world!.theme, FLOOR);
        this.itemsView!.render(m, HERO_X, FLOOR, left, right, this.worldBounds.bottom, this.worldBounds.top, this.safeStageBounds);
        this.effects!.render(m, HERO_X, FLOOR);
        this.feverView!.render(m);
        this.hudView!.render(m);
        this.renderControls();
    }
    /** Rooftop and skyway platforms: the flat top edge is the standing surface. Each region builds its striped
     * awning from its own palette, deeper than the background, with the gameplay rim; a floating platform
     * carries balloons; a spring pad uses the drawn ready and compressed machine poses. */
    private createPlatform(platform: RunnerPlatform): Node {
        if (platform.spring) {
            const n = this.sprite(`SpringPad-${platform.id}`, this.objects!, 'spring-0', ...V48_ART['spring-0'].size);
            n.getComponent(UITransform)!.setAnchorPoint(.5, 0); return n;
        }
        const awning = this.skin('awning', platform.x), height = V38_ART[awning].size[1];
        const n = this.sprite(`RooftopAwning-${platform.id}`, this.objects!, awning, platform.width, height);
        n.getComponent(UITransform)!.setAnchorPoint(.5, 1); n.getComponent(Sprite)!.type = Sprite.Type.TILED;
        // The deck owns a stable visible collision edge, even after a magnet removes its coin trail.
        const edge = this.make('PlatformLandingEdge', n, platform.width, 14).addComponent(Graphics);
        edge.fillColor = color('#254F59'); edge.roundRect(-platform.width / 2, -12, platform.width, 12, 4); edge.fill();
        edge.fillColor = color('#FFF1C7'); edge.rect(-platform.width / 2 + 3, -3, platform.width - 6, 3); edge.fill();
        edge.fillColor = color('#65C8C1'); edge.rect(-platform.width / 2 + 3, -8, platform.width - 6, 4); edge.fill();
        if (platform.bob) {
            const [w, h] = V47_ART.balloons.size, pairs = platform.width > 260 ? [-.25, .25] : [0];
            for (const at of pairs) this.sprite('Balloons', n, 'balloons', w, h).setPosition(at * platform.width, h / 2 - 4);
        }
        return n;
    }
    /** The region's own build of a gameplay sprite, drawn from the region's palette and chosen by where
     * it stands on the course so it never changes on screen; Milk-Tea Street and shared pieces (steam,
     * bridge, coins, power-ups) use the base art. */
    private skin(key: string, x: number): string {
        const themed = `${key}-${REGIONS[regionIndex(x / RUNNER.pixelsPerMeter)]}`;
        return V38_ART[themed] ? themed : key;
    }
    private createObstacle(o: RunnerObstacle): Node {
        const n = this.make(`Obstacle-${o.kind}-${o.id}`, this.objects!, o.width, 260);
        if (o.kind === 'roller') {
            const roller = this.skin('roller', o.x);
            this.sprite('RollingBarrel', n, roller, ...V38_ART[roller].size).setPosition(0, V38_ART[roller].size[1] / 2);
            this.label('TrapWarning', n, '!', 0, 118, 44, 46, 34, '#FFEB95');
        } else if (o.kind === 'steam') {
            const base = V38_ART['steam-base'].size;
            this.sprite('SteamBase', n, 'steam-base', ...base).setPosition(0, base[1] / 2);
            const jet = this.sprite('SteamJet', n, 'steam-jet', ...V38_ART['steam-jet'].size);
            jet.getComponent(UITransform)!.setAnchorPoint(.5, 0); jet.setPosition(0, base[1] - 20);
            jet.setSiblingIndex(0);
            this.label('TrapWarning', n, '!', 0, 76, 44, 46, 34, '#FFEB95');
        } else if (o.kind === 'wave') {
            this.drawWave(this.make('SoundWave', n, o.width + 40, o.height + 20).addComponent(Graphics), o.height);
        } else if (o.kind === 'gap') {
            // The hole itself is cut out of the road (MemeRunnerGround), so the background shows through.
            for (const side of [-1, 1]) {
                // Full-depth torn felt walls with a warning-taped curb; the right wall mirrors the left.
                const key = this.skin('pit-wall', o.x), [w, h] = V38_ART[key].size;
                const wall = this.sprite(side < 0 ? 'PitWallLeft' : 'PitWallRight', n, key, w, h);
                wall.getComponent(UITransform)!.setAnchorPoint(0, 1); wall.setPosition(side * o.width / 2, 4); wall.setScale(-side, 1, 1);
            }
            const bridge = this.sprite('FloatingBridge', n, 'bridge-planks', o.width + 8, V38_ART['bridge-planks'].size[1]);
            bridge.getComponent(UITransform)!.setAnchorPoint(.5, 1); bridge.getComponent(Sprite)!.type = Sprite.Type.TILED;
            bridge.setPosition(0, 2); bridge.active = !!o.bridged;
        } else if (o.kind.startsWith('drone-')) {
            // Propellers are decorative; the suspended cargo body owns the collision rectangle.
            this.sprite('Drone', n, 'drone-0', ...V48_ART['drone-0'].size).setPosition(0, (o.bottom ?? 0) + V48_ART['drone-0'].size[1] / 2);
        } else if (o.kind === 'spikes') {
            const spikes = this.skin('spikes', o.x);
            this.sprite('FeltSpikes', n, spikes, ...V38_ART[spikes].size).setPosition(0, V38_ART[spikes].size[1] / 2);
        } else if (o.kind === 'bar') {
            // A region banner on two ropes; its hem keeps the slide clearance.
            const banner = this.skin('gate', o.x), gate = this.sprite('BannerGate', n, banner, ...V38_ART[banner].size);
            gate.getComponent(UITransform)!.setAnchorPoint(.5, 0); gate.setPosition(0, RUNNER.barBottom);
        } else {
            const crate = this.skin('crate', o.x);
            this.sprite('Crate', n, crate, 84, 82).setPosition(0, 41);
            if (o.kind === 'drop-crate') {
                this.label('TrapWarning', n, '!', 0, 112, 44, 46, 34, '#FFEB95');
            } else if (o.kind === 'wall') {
                n.getChildByName('Crate')!.destroy();
                for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) this.sprite(`Breakable-${row}-${col}`, n, crate, 82, 64).setPosition((col - .5) * 84, 32 + row * 64);

            } else if (o.kind === 'tower') {
                this.sprite('Crate-2', n, crate, 84, 82).setPosition(0, 123);
            }
        }
        return n;
    }
    /** The compressor's ground pressure pulse: nested arcs bulging toward the runner, the hitbox's full height. */
    private drawWave(g: Graphics, height: number): void {
        g.fillColor = color('#FF6FAE', 70); g.ellipse(0, 2, 36, 7); g.fill();
        [[height * .42, 0], [height * .72, 12], [height, 24]].forEach(([r, dx]) => {
            for (const [tint, width] of [['#FFFFFF', 11], ['#FF4F9A', 6]] as [string, number][]) {
                g.strokeColor = color(tint); g.lineWidth = width;
                g.arc(16 + dx - r * .2, 0, r, Math.PI * .5, Math.PI * .97, true); g.stroke();
            }
        });
    }
    private slideStart = (event: EventTouch): void => {
        event.propagationStopped = true; if (this.state !== 'playing') return;
        this.slideTouches.add(event.getID()); this.refreshSlide();
    };
    private slideEnd = (event: EventTouch): void => { event.propagationStopped = true; this.slideTouches.delete(event.getID()); this.refreshSlide(); };
    private jumpStart = (event: EventTouch): void => {
        event.propagationStopped = true; if (this.state !== 'playing') return;
        this.jumpTouches.add(event.getID()); this.model?.jump(); this.renderControls();
    };
    private jumpEnd = (event: EventTouch): void => { event.propagationStopped = true; this.jumpTouches.delete(event.getID()); this.renderControls(); };
    private keyDown = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE) { this.context?.requestPause(); return; }
        if (this.state !== 'playing' || this.heldKeys.has(event.keyCode)) return;
        this.heldKeys.add(event.keyCode);
        if ([KeyCode.SPACE, KeyCode.ARROW_UP, KeyCode.KEY_W].indexOf(event.keyCode) >= 0) this.model?.jump();
        this.refreshSlide();
    };
    private keyUp = (event: EventKeyboard): void => { this.heldKeys.delete(event.keyCode); this.refreshSlide(); };
    private refreshSlide(): void { this.model?.holdSlide(this.slideTouches.size > 0 || this.heldKeys.has(KeyCode.ARROW_DOWN) || this.heldKeys.has(KeyCode.KEY_S)); this.renderControls(); }
    private renderControls(): void {
        if (!this.model) return;
        this.controlView?.render(this.model,
            this.slideTouches.size > 0 || this.heldKeys.has(KeyCode.ARROW_DOWN) || this.heldKeys.has(KeyCode.KEY_S),
            this.jumpTouches.size > 0 || this.heldKeys.has(KeyCode.SPACE) || this.heldKeys.has(KeyCode.ARROW_UP) || this.heldKeys.has(KeyCode.KEY_W));
    }
    private clearInput(): void { this.slideTouches.clear(); this.jumpTouches.clear(); this.heldKeys.clear(); this.model?.clearInput(); this.controlView?.clearInput(); }
    private applyLayout = (): void => {
        if (!this.stage || !this.context) return;
        const size = view.getVisibleSize(); this.node.getComponent(UITransform)?.setContentSize(size);
        const safe = this.layout = calculateSafeContentBounds(size.width, size.height, this.context.services.platform.getLayoutInfo());
        const scale = Math.max(.01, Math.min(1, (safe.width - 24) / W, (safe.height - 24) / H));
        this.stage.setPosition(safe.centerX, safe.centerY); this.stage.setScale(scale, scale, 1);
        const uiScale = Math.max(.01, Math.min(1, (safe.width - 24) / W, (safe.height - 24) / UI_H));
        this.hud?.setScale(uiScale / scale, uiScale / scale, 1);
        this.controls?.setScale(uiScale / scale, uiScale / scale, 1);
        this.worldBounds = { left: (-size.width / 2 - safe.centerX) / scale,
            right: (size.width / 2 - safe.centerX) / scale, bottom: (-size.height / 2 - safe.centerY) / scale, top: (size.height / 2 - safe.centerY) / scale };
        this.safeStageBounds = { right: safe.width / 2 / scale, bottom: -safe.height / 2 / scale, top: safe.height / 2 / scale };
        this.groundView?.layout(this.worldBounds.left, this.worldBounds.right, this.worldBounds.bottom, FLOOR);
        this.controlView?.layout((safe.width / 2) / uiScale, (-safe.height / 2) / uiScale);
        this.hudView?.layout((safe.width / 2) / uiScale);
        this.feverView?.layout(this.worldBounds);
        this.foreground?.layout(this.worldBounds.left, this.worldBounds.right, this.worldBounds.bottom, FLOOR);
        this.world?.layout(size.width, size.height, this.worldBounds.left, this.worldBounds.right);
        this.positionOverlay(); this.render();
    };
    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        this.openOverlay('RunnerPauseMenu', overlay => this.dialogs!.pause(overlay, model.resume, model.restart, model.exit, this.recordsCaption()));
        this.setRunningUI(false);
    }
    hidePauseMenu(): void { this.clearOverlay(); this.setRunningUI(true); }
    showResultView(model: MiniGameResultModel): void {
        const m = this.model!, best = this.progressData.best.score;
        const actions = [
            { name: 'RestartRunner', word: 'replay', caption: m.delivered ? '再送一单' : '重试这单', run: model.restart },
            { name: 'ResultLobby', word: 'home', run: model.returnToLobby },
        ];
        this.openOverlay('RunnerResult', overlay => {
            const card = m.delivered
                ? this.dialogs!.delivered(overlay, { runScore: m.runScore, deliveryBonus: COURSE.deliveryBonus, stars: m.stars,
                    starBonus: COURSE.starBonus[m.stars], score: m.score, time: clock(m.time), best, newRecord: this.newRecord, records: this.recordsCaption() }, actions)
                : this.dialogs!.caught(overlay, { remaining: m.remainingMeters, runScore: m.runScore, best, newRecord: this.newRecord,
                    reason: runnerFailureHint(m.lastHit), records: this.recordsCaption() }, actions);
            this.resultPresentation = { age: 0, motion: card.motion };
            return card.root;
        });
        // Dialogs carry their own numbers and buttons, so the running HUD steps aside behind them.
        this.setRunningUI(false);
        this.animateResult(0);
    }
    private animateResult(dt: number): void {
        const r = this.resultPresentation; if (!r) return;
        r.age += dt; this.dialogs!.animate(r.motion, r.age);
    }
    private recordsCaption(): string {
        const b = this.progressData.best;
        return `最高 ${b.score} · 送达 ${b.deliveries} 单 · 最佳 ${b.stars} 星 · 最快 ${b.fastest ? clock(b.fastest) : '--:--'}`;
    }
    hideResultView(): void { this.clearOverlay(); this.setRunningUI(true); }
    private setRunningUI(visible: boolean): void { if (this.hud) this.hud.active = visible; if (this.controls) this.controls.active = visible; }
    private result(completed = false): GameResult {
        const m = this.model;
        return { score: m?.score ?? 0, duration: Math.round((m?.time ?? 0) * 1000), completed,
            extra: { mode: 'delivery', delivered: m?.delivered ?? false, stars: m?.stars ?? 0, meters: m?.meters ?? 0, coins: m?.coins ?? 0, hits: m?.hits ?? 0,
                combo: m?.bestCombo ?? 0, mounts: m?.mounts ?? 0, bounces: m?.bounces ?? 0, springs: m?.springs ?? 0, stomps: m?.stomps ?? 0,
                fevers: m?.fevers ?? 0 } };
    }
    private save(values: Record<string, unknown>): void {
        if (!this.context) return;
        const { storage } = this.context.services, old = storage.getGameData(this.context.gameId);
        storage.writeGameData(this.context.gameId, { ...(old ?? { dataVersion: 1, playCount: 0 }), custom: { ...old?.custom, ...values } });
    }
    /** A dimmed overlay holding one felt dialog; the dialog's container is fitted to the safe area. */
    private openOverlay(name: string, build: (overlay: Node) => Node): void {
        this.clearOverlay(); this.overlay = this.make(name, this.node, 1334, 750); this.overlay.addComponent(BlockInputEvents);
        this.make('Shade', this.overlay, 1334, 750).addComponent(Graphics);
        build(this.overlay).name = 'Panel';
        this.positionOverlay();
    }
    private positionOverlay(): void {
        if (!this.overlay || !this.layout) return;
        const size = view.getVisibleSize(), safe = this.layout;
        this.overlay.getComponent(UITransform)!.setContentSize(size);
        const shade = this.overlay.getChildByName('Shade')!.getComponent(Graphics)!; shade.clear();
        fill(shade, -size.width / 2, -size.height / 2, size.width, size.height, T.ink, 165);
        const panel = this.overlay.getChildByName('Panel')!, panelSize = panel.getComponent(UITransform)!;
        const scale = Math.max(.01, Math.min(1, (safe.width - 32) / panelSize.width, (safe.height - 32) / panelSize.height));
        panel.setPosition(safe.centerX, safe.centerY); panel.setScale(scale, scale, 1);
    }
    private clearOverlay(): void {
        this.resultPresentation = undefined;
        if (this.overlay) {
            for (const sprite of this.overlay.getComponentsInChildren(Sprite)) sprite.spriteFrame = null;
            this.overlay.active = false; this.overlay.destroy(); this.overlay = undefined;
        }
    }
    private make(name: string, parent: Node, width: number, height: number): Node {
        const n = new Node(name); n.layer = this.node.layer; n.parent = parent; n.addComponent(UITransform).setContentSize(width, height); return n;
    }
    private sprite(name: string, parent: Node, key: string, width: number, height: number): Node {
        const n = this.make(name, parent, width, height), s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames![key]; return n;
    }
    /** A stitched felt patch; primary buttons are dyed teal. */
    private label(name: string, parent: Node, value: string, x: number, y: number, width: number, height: number, size: number, tint = T.ink): Label {
        const n = this.make(name, parent, width, height); n.setPosition(x, y);
        const l = n.addComponent(Label); l.string = value; l.fontSize = size; l.lineHeight = size + 6; l.color = color(tint);
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK;
        setLabelBold(l, true); return l;
    }
    private bindButton = (n: Node, run: () => unknown): void => {
        const button = n.addComponent(Button); button.transition = Button.Transition.SCALE;
        button.duration = .08; button.zoomScale = .94;
        let busy = false;
        n.on(Button.EventType.CLICK, () => {
            if (busy) return; busy = true;
            this.context?.services.feedback.play('uiButton', { vibrate: false, volume: .7 });
            try { const result = run(); Promise.resolve(result).then(() => { busy = false; }, error => { busy = false; console.error('[MemeRunner]', error); }); }
            catch (error) { busy = false; throw error; }
        });
    };
}
function clock(seconds: number): string {
    const total = Math.ceil(seconds), rest = total % 60; return `${Math.floor(total / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}
function color(hex: string, alpha = 255): Color { const c = new Color(); Color.fromHEX(c, hex); c.a = alpha; return c; }
function fill(g: Graphics, x: number, y: number, w: number, h: number, tint: string, alpha = 255): void {
    g.fillColor = color(tint, alpha); g.rect(x, y, w, h); g.fill();
}
