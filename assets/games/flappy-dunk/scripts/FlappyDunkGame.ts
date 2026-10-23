import {
    _decorator, AudioClip, BitmapFont, BlockInputEvents, Canvas, Color, Component, EventKeyboard, EventTouch,
    Graphics, Input, input, JsonAsset, KeyCode, Label, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform, view,
} from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService, AudioVoiceScope } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import { setLabelBold } from '../../../services/font/FontBinding';
import { dunkBackIn, dunkBackOut, validateDunkConfig, type DunkConfig } from './FlappyDunkConfig';
import { FlappyDunkModel, readDunkRoundSnapshot, type DunkHoop, type DunkRoundSnapshot } from './FlappyDunkModel';
import { calculateDunkLayout, DUNK_ICON_BUTTON } from './FlappyDunkLayout';
import { DUNK_AMBIENCE, DUNK_AUDIO, DUNK_CHAIN_TIERS, DUNK_PARTICLE_PALETTE, DUNK_THEME as T, dunkChainTier } from './FlappyDunkTheme';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { FlappyDunkSkyline } from './FlappyDunkSkyline';
import { FlappyDunkShake, type DunkShakeConfig } from './FlappyDunkShake';
import { easeInCubic, easeOutBack, easeOutCubic, FlappyDunkMotion, springPulse } from './FlappyDunkMotion';
import { FlappyDunkParticles, recolorDunkParticles, type DunkParticleConfig } from './FlappyDunkParticles';
import { FlappyDunkTransition, type DunkHudItem, type DunkPresentationConfig } from './FlappyDunkPresentation';

/** Index of 极限 in DUNK_THEME.difficulties; the 空心大师 trophy is earned on this difficulty only. */
const DUNK_EXTREME_DIFFICULTY = 2;

const { ccclass } = _decorator;
const BUNDLE = 'game-flappy-dunk-assets';
/** Wing frame in world units and its pivot at the wing root. The original wing fills a 0.381 × 0.262 frame;
 * the 月夜天台 wing curls upward, so its frame is near square and ~10 % larger in visible area. */
const WING_SIZE = [.329, .334] as const;
const WING_PIVOT = [.82, .3] as const;
type DunkState = 'idle' | 'ready' | 'countdown' | 'playing' | 'dying' | 'revive' | 'paused' | 'finished' | 'disposed';
/** First-round guide: tap to flap, drop into the hoop from above, then what a swish chain does. */
type GuideStep = 'off' | 'tap' | 'hoop' | 'chain';
const COUNTDOWN_SECONDS = 3;
interface DunkServices { assets: AssetService; audio: AudioService; feedback: FeedbackService; storage: StorageService; platform: Platform; ads: AdService; }
interface HoopView { back: Node; front: Node; opacityBack: UIOpacity; opacityFront: UIOpacity; fire: boolean; netKick: number; rimHit: number;
    unit: number; net: UITransform; pickup?: Node; highlight?: Node; leftHazard?: Node; rightHazard?: Node; }
interface RibbonPoint { x: number; y: number; t: number; nx: number; ny: number; taper: number; fade: number; }
const CLOUD_RINGS = [1, .78, .56, .34] as const;
/** `body` carries squash and stretch along the screen axes; the painted ball inside it spins freely. */
interface BallView { root: Node; body: Node; ball: Node; faces: Sprite[]; glow: Sprite; left: Node; right: Node; shield: Sprite; size: number; }
interface DialogAction { name: string; text: string; icon: string; primary?: boolean; action: () => void | Promise<void>; }
/** Gameplay constants recovered from the original controller; the desert art is not part of this theme. */
interface DunkSceneSource { readonly gameOverDelay: number; readonly shakers: DunkShakeConfig; readonly hazardRotation: readonly number[]; }
interface HudView { root: Node; opacity: UIOpacity; transition?: FlappyDunkTransition; }

/** A single-player port of JungleFrog.Games.FlappyDunk, isolated behind MiniGameContext. */
@ccclass('FlappyDunkGame')
export class FlappyDunkGame extends Component implements MiniGame<DunkServices> {
    private context?: MiniGameContext<DunkServices>;
    private state: DunkState = 'idle';
    private config?: DunkConfig;
    private sceneSource?: DunkSceneSource;
    private skyline?: FlappyDunkSkyline;
    private moon?: Sprite;
    private skyFront?: Graphics;
    private clouds?: Graphics;
    private stars?: Graphics;
    private readonly renderColor = new Color();
    private readonly motion = new FlappyDunkMotion();
    /** Ball colour tier cross-fade (DUNK_CHAIN_TIERS) and the pop when the tier rises. */
    private tier = { from: 0, to: 0, age: Infinity };
    private ambienceClip?: AudioClip;
    private ambience?: AudioVoiceScope;
    private ambienceGain = 0;
    private ambienceStarted = false;
    private shake?: FlappyDunkShake;
    private particleConfig?: DunkParticleConfig;
    private particles?: FlappyDunkParticles;
    private scoreFont?: BitmapFont;
    private presentation?: DunkPresentationConfig;
    private model?: FlappyDunkModel;
    private difficulty = 0;
    private frames?: Readonly<Record<string, SpriteFrame>>;
    private audioBank?: BundleAudioBank;
    private loading?: Promise<void>;
    private background?: Graphics;
    private frame?: Node;
    private hud?: Node;
    private readonly hudViews = new Map<string, HudView>();
    private stage?: Node;
    private worldRoot?: Node;
    private scenery?: Graphics;
    private backLayer?: Node;
    private frontLayer?: Node;
    private effects?: Graphics;
    private ball?: BallView;
    private scoreLabel?: Label;
    private scoreShadow?: Label;
    private pauseButton?: Node;
    private comboLabel?: Label;
    private overlay?: Node;
    private readyBest?: Label;
    private readonly hoopViews = new Map<number, HoopView>();
    private readonly keys = new Set<KeyCode>();
    private readonly trail: { x: number; y: number; life: number }[] = [];
    private readonly ribbon: RibbonPoint[] = [];
    private ribbonCount = 0;
    private readonly hazardAngles = [0, 0, 0];
    private unsubscribeLayout?: Unsubscribe;
    private inputAttached = false;
    private animationTime = 0;
    private ballBirthAge = 0;
    private flap = 0;
    private scoreBump = -Infinity;
    /** Ball squash: +1 stretches upwards (flap), -1 flattens (impact). */
    private squash = { age: Infinity, amount: 0, direction: 1 };
    private previousVy = 0;
    private reportedScore = -1;
    private cameraX = 1.5;
    private cameraLock?: number;
    private deathTime = 0;
    private pausedFrom: DunkState = 'playing';
    private operation = 0;
    private revivePending = false;
    private reviveUsed = false;
    private layout?: ReturnType<typeof calculateDunkLayout>;
    /** Saved round waiting to be resumed; kept until its countdown ends so a pause mid-countdown still saves it. */
    private resumeSnapshot?: DunkRoundSnapshot;
    private countdownAge = 0;
    private saveClock = 0;
    private guide: { step: GuideStep; age: number; flaps: number } = { step: 'off', age: 0, flaps: 0 };
    private guideLayer?: Graphics;
    /** "+N" floating up from each scored hoop; labels are pooled and reused. */
    private floatLayer?: Node;
    private readonly floats: { label: Label; x: number; y: number; age: number }[] = [];
    private guideText?: Label;

    async initialize(context: MiniGameContext<DunkServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Flappy Dunk cannot initialize from ${this.state}`);
        this.context = context;
        if (!this.node.parent?.getComponent(Canvas)?.cameraComponent) throw new Error('Flappy Dunk Canvas camera is missing');
        const stored = context.services.storage.getGameData(context.gameId)?.custom?.dunkDifficulty;
        if (typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 && stored < 3) this.difficulty = stored;
        this.resumeSnapshot = readDunkRoundSnapshot(context.services.storage.getGameData(context.gameId)?.custom?.dunkRound);
        this.migrateBestScores();
        this.loading = this.prepare(context);
        try { await this.loading; } finally { this.loading = undefined; }
    }

    private async prepare(context: MiniGameContext<DunkServices>): Promise<void> {
        const asset = await context.services.assets.loadAsset(BUNDLE, 'configs/original', JsonAsset);
        if (this.state === 'disposed' || !this.isValid) return;
        this.config = validateDunkConfig(asset.json);
        const scene = await context.services.assets.loadAsset(BUNDLE, 'configs/scene', JsonAsset);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        const source = (scene.json as { source?: DunkSceneSource } | null)?.source;
        if (!source || !Number.isFinite(source.gameOverDelay) || !source.shakers || source.hazardRotation?.length !== 3)
            throw new Error('Invalid Flappy Dunk scene constants');
        this.sceneSource = source;
        this.shake = new FlappyDunkShake(source.shakers);
        this.skyline = new FlappyDunkSkyline();
        const effects = await context.services.assets.loadAsset(BUNDLE, 'configs/effects', JsonAsset);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        this.particleConfig = recolorDunkParticles(effects.json as DunkParticleConfig, DUNK_PARTICLE_PALETTE);
        const presentation = await context.services.assets.loadAsset(BUNDLE, 'configs/presentation', JsonAsset);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        this.presentation = presentation.json as DunkPresentationConfig;
        const fontData = await context.services.assets.loadAsset(BUNDLE, 'configs/score-font', JsonAsset);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        const frames = await context.services.assets.loadSpriteFrames(BUNDLE,
            [...Object.keys(PACKED_SPRITE_PATHS).filter(key => key.endsWith('/spriteFrame') && !key.includes('/Glyph-')).map(key => ({
                key: key.split('/').slice(-2)[0], path: PACKED_SPRITE_PATHS[key], type: 'frame' as const,
            })), { key: 'ScorePage', path: 'visual/objects/dunk-objects/texture', type: 'texture' as const }]);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) {
            Object.keys(frames).forEach(key => context.services.assets.releaseRuntimeAsset(frames[key]));
            return;
        }
        this.frames = frames;
        this.scoreFont = context.services.assets.trackRuntimeAsset(BUNDLE, new BitmapFont());
        this.scoreFont.name = 'CocogooseNarrow-Regular'; this.scoreFont.fontSize = fontData.json.fontSize;
        this.scoreFont.fntConfig = fontData.json; this.scoreFont.spriteFrame = frames.ScorePage; this.scoreFont.onLoaded();
        this.audioBank = new BundleAudioBank(DUNK_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        this.ambienceClip = await context.services.assets.loadAudioClip(BUNDLE, DUNK_AMBIENCE.path);
        if ((this.state as DunkState) === 'disposed' || !this.isValid) return;
        this.ambience = context.services.audio.createVoiceScope('effect');
        this.buildInterface();
        view.on('canvas-resize', this.applyLayout, this);
        this.unsubscribeLayout = context.services.platform.onLayoutChange(this.applyLayout);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        this.inputAttached = true;
        this.state = 'ready';
        this.applyLayout();
    }

    /** A round left unfinished last time continues after a 3-2-1 countdown; otherwise a new round starts. */
    begin(): void { if (this.state === 'ready') this.resetRound(this.resumeSnapshot); }
    isGameplayActive(): boolean { return this.state === 'playing' || this.state === 'countdown'; }

    pause(): boolean {
        if (this.state !== 'playing' && this.state !== 'countdown' && this.state !== 'dying' && this.state !== 'revive') return false;
        this.pausedFrom = this.state;
        this.state = 'paused';
        this.keys.clear();
        this.audioBank?.stopEffects();
        this.ambience?.pause();
        this.persistRound(true);
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.keys.clear(); this.state = this.pausedFrom;
        this.ambience?.resume();
        // Coming back mid-round always counts down again, so the ball never drops the moment play resumes.
        if (this.state === 'countdown' || this.state === 'playing') this.startCountdown();
        if (this.state === 'revive') {
            if (this.revivePending) this.actionDialog('ReviveLoading', '正在准备', '请稍候', []);
            else this.showRevive();
        }
    }

    async restart(context?: MiniGameContext<DunkServices>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.resetRound();
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.persistRound(true);
        this.state = 'disposed';
        this.operation++;
        this.model?.dispose(); this.sceneSource = this.shake = this.skyline = undefined;
        this.ambience?.dispose(); this.ambience = this.ambienceClip = undefined;
        this.particles?.dispose(); this.particles = this.particleConfig = undefined;
        this.motion.clear();
        view.off('canvas-resize', this.applyLayout, this);
        this.unsubscribeLayout?.(); this.unsubscribeLayout = undefined;
        if (this.inputAttached) {
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
            this.inputAttached = false;
        }
        this.stage?.off(Node.EventType.TOUCH_START, this.onTap, this);
        this.keys.clear();
        this.audioBank?.dispose();
        await this.loading?.catch(() => undefined);
        this.audioBank = undefined;
        this.frame?.getComponentsInChildren(Sprite).forEach(sprite => { sprite.spriteFrame = null; });
        this.frame?.getComponentsInChildren(Label).forEach(label => { label.font = null; });
        if (this.scoreFont) {
            this.scoreFont.spriteFrame = null;
            this.context?.services.assets.releaseRuntimeAsset(this.scoreFont); this.scoreFont = undefined;
        }
        this.frame?.destroy(); this.background?.node.destroy();
        const assets = this.context?.services.assets;
        if (assets && this.frames) Object.keys(this.frames).forEach(key => assets.releaseRuntimeAsset(this.frames![key]));
        this.hoopViews.clear(); this.trail.length = this.ribbon.length = this.ribbonCount = 0;
        this.hudViews.clear(); this.presentation = undefined;
        this.frames = this.config = this.model = this.context = this.layout = undefined;
        this.frame = this.hud = this.stage = this.worldRoot = this.backLayer = this.frontLayer = this.overlay = undefined;
        this.background = this.scenery = this.effects = this.skyFront = this.stars = undefined; this.moon = undefined; this.clouds = undefined;
        this.ball = undefined;
        this.scoreLabel = this.scoreShadow = this.comboLabel = this.readyBest = undefined; this.pauseButton = undefined;
        this.guideLayer = undefined; this.guideText = undefined; this.resumeSnapshot = undefined;
        this.floatLayer = undefined; this.floats.length = 0;
    }

    protected onDestroy(): void { void this.dispose(); }

    protected update(delta: number): void {
        if (!Number.isFinite(delta)) return;
        const dt = Math.max(0, Math.min(.1, delta));
        this.updateAmbience(dt);
        // Pausing only means something mid-round: hidden on the start screen, while dying and under dialogs.
        if (this.pauseButton) this.pauseButton.active = this.state === 'playing';
        // Interface motion keeps running under dialogs, where gameplay below is frozen.
        this.motion.advance(dt);
        if (!this.model || (this.state !== 'ready' && this.state !== 'countdown' && this.state !== 'playing' && this.state !== 'dying')) return;
        this.animationTime += dt;
        this.ballBirthAge += dt;
        if (this.state === 'countdown') { this.advanceCountdown(dt); this.render(); return; }
        if (this.state === 'playing') {
            this.saveClock += dt;
            if (this.saveClock >= 1) { this.saveClock = 0; this.persistRound(); }
            this.advanceGuide(dt);
        }
        this.flap = Math.max(0, this.flap - dt);
        if (this.state === 'ready') this.model.advance(dt);
        if (this.state === 'playing' || this.state === 'dying') {
            this.model.advance(dt);
            this.consumeEvents();
            this.trail.push({ x: this.model.x, y: this.model.y, life: .4 });
            for (let i = this.trail.length - 1; i >= 0; i--) {
                this.trail[i].life -= dt;
                if (this.trail[i].life <= 0) this.trail.splice(i, 1);
            }
        }
        this.updateEffects(dt);
        this.advanceHud(dt);
        this.updateTier(dt);
        this.advanceScoreFloats(dt);
        this.detectImpact(dt);
        this.breatheStartButton();
        this.shake?.advance(dt, this.model.alive && (this.model.wallPhase === 'warning' || this.model.wallPhase === 'closing'));
        this.render();
        if (this.state === 'playing' && !this.model.alive) {
            this.state = 'dying'; this.keys.clear(); this.deathTime = 0;
            // A lost round is never resumed; an unfinished first-round guide shows again next round.
            this.persistRound(); if (this.guide.step !== 'chain') this.guide.step = 'off';
        } else if (this.state === 'dying') {
            this.deathTime += dt;
            if (this.deathTime >= (this.sceneSource?.gameOverDelay ?? .91)) {
                if (this.context?.services.ads.isEnabledForGame(this.context.gameId)) this.showRevive();
                else this.finishRound();
            }
        }
    }

    /** Chalk "+N" just above the scored rim. A swish takes the colour of the chain tier it reaches;
     * bigger chains write bigger numbers. */
    private spawnScoreFloat(x: number, y: number, points: number, swish: boolean): void {
        if (!this.floatLayer || !this.scoreFont) return;
        let float = this.floats.find(f => f.age === Infinity);
        if (!float) {
            const label = this.label(`ScoreFloat-${this.floats.length}`, this.floatLayer, '', 0, 0, 300, 120, 64, T.ink);
            label.font = this.scoreFont; label.overflow = Label.Overflow.NONE;
            float = { label, x: 0, y: 0, age: Infinity }; this.floats.push(float);
        }
        float.x = x; float.y = y + .55; float.age = 0;
        const label = float.label;
        this.setText(label, `+${points}`);
        label.fontSize = 52 + 6 * Math.min(points, 8); label.lineHeight = label.fontSize + 8;
        label.color = color(swish ? DUNK_CHAIN_TIERS[dunkChainTier(points)].trail : T.ink);
        label.node.active = true;
    }

    private advanceScoreFloats(dt: number): void {
        for (const float of this.floats) {
            if (float.age === Infinity) continue;
            float.age += dt;
            if (float.age >= .9) { float.age = Infinity; float.label.node.active = false; }
        }
    }

    /** Pop in with a little overshoot, rise .9 world units, fade out over the last third. */
    private drawScoreFloats(): void {
        const u = this.layout?.unit ?? 0;
        for (const float of this.floats) {
            if (float.age === Infinity) continue;
            const p = float.age / .9, pop = .5 + .5 * easeOutBack(Math.min(1, float.age / .2));
            const node = float.label.node;
            node.setPosition((float.x - this.cameraX) * u, (float.y + .9 * easeOutCubic(p)) * u);
            node.setScale(pop, pop, 1);
            this.renderColor.set(float.label.color);
            this.renderColor.a = Math.round(255 * (p < .65 ? 1 : 1 - (p - .65) / .35)); float.label.color = this.renderColor;
        }
    }

    /** tap → hoop after two flaps (or 4 s); the first basket finishes the guide and shows the chain tip. */
    private advanceGuide(dt: number): void {
        const guide = this.guide;
        if (guide.step === 'off') return;
        guide.age += dt;
        if (guide.step === 'tap' && ((guide.flaps >= 2 && guide.age > 1.2) || guide.age > 4)) this.guide = { step: 'hoop', age: 0, flaps: 0 };
        else if (guide.step === 'chain' && guide.age > 3.6) guide.step = 'off';
    }

    private drawGuide(): void {
        const g = this.guideLayer, text = this.guideText, m = this.model, l = this.layout;
        if (!g || !text || !m || !l) return;
        g.clear();
        const step = this.state === 'playing' || this.state === 'dying' ? this.guide.step : 'off';
        text.node.active = step !== 'off';
        if (step === 'off') return;
        const u = l.unit, t = this.guide.age, wall = m.wallLimit * u;
        let tx = 0, ty = 0, alpha = 1;
        if (step === 'tap') {
            // Tap ripples just under the ball: two rings expanding out of a finger dot.
            const x = (m.x - this.cameraX + .9) * u, y = Math.max(-wall + .9 * u, (m.y - 1.4) * u);
            for (const phase of [0, .5]) {
                const k = (t * 1.1 + phase) % 1;
                g.strokeColor = color(T.ink, Math.round(200 * (1 - k))); g.lineWidth = 3;
                g.circle(x, y, (.12 + .32 * k) * u); g.stroke();
            }
            g.fillColor = color(T.ink, 230); g.circle(x, y, .08 * u); g.fill();
            this.setText(text, '点按屏幕，篮球向上扑一下'); tx = x; ty = y + .75 * u;
        } else if (step === 'hoop') {
            const hoop = m.hoops.find(h => !h.resolved && !h.inverted);
            if (!hoop) { text.node.active = false; return; }
            // A dashed drop line arcing in from above the rim, with an arrowhead at the opening.
            const hx = (hoop.x - this.cameraX) * u, hy = hoop.y * u;
            const p0 = { x: hx - 1.3 * u, y: Math.min(wall - .4 * u, hy + 1.7 * u) }, c = { x: hx - .1 * u, y: p0.y + .2 * u };
            const p2 = { x: hx, y: hy + .32 * u }, offset = (t * 1.6) % 1;
            g.strokeColor = color(T.lamp, 230); g.lineWidth = 5;
            for (let i = 0; i < 9; i++) {
                const a = (i + offset) / 9.5, b = Math.min(1, a + .055);
                const at = (k: number) => ({ x: (1 - k) ** 2 * p0.x + 2 * (1 - k) * k * c.x + k * k * p2.x,
                    y: (1 - k) ** 2 * p0.y + 2 * (1 - k) * k * c.y + k * k * p2.y });
                const s0 = at(a), s1 = at(b); g.moveTo(s0.x, s0.y); g.lineTo(s1.x, s1.y);
            }
            g.stroke();
            g.fillColor = color(T.lamp, 240);
            g.moveTo(p2.x, p2.y - .1 * u); g.lineTo(p2.x - .13 * u, p2.y + .1 * u); g.lineTo(p2.x + .13 * u, p2.y + .1 * u); g.close(); g.fill();
            this.setText(text, '从篮圈上方落进去'); tx = hx; ty = Math.min(wall - .35 * u, p0.y + .45 * u);
        } else {
            alpha = Math.min(1, (3.6 - t) / .4);
            this.setText(text, '空心入网不碰圈，下一球分数翻倍'); tx = 0; ty = wall - .7 * u;
        }
        // Keep the tip on screen and draw a night-glass pill behind it.
        const width = Math.min(l.stageWidth - 40, text.string.length * 28 + 56), half = l.stageWidth / 2 - 20;
        tx = Math.max(-half + width / 2, Math.min(half - width / 2, tx));
        text.node.setPosition(tx, ty); text.color = color(T.ink, Math.round(255 * alpha));
        g.fillColor = color(T.panel, Math.round(220 * alpha)); g.strokeColor = color(T.panelLine, Math.round(255 * alpha)); g.lineWidth = 2;
        g.roundRect(tx - width / 2, ty - 30, width, 60, 30); g.fill(); g.stroke();
    }

    private updateTier(dt: number): void {
        const m = this.model!, target = dunkChainTier(m.multiplier);
        this.tier.age += dt;
        if (target === this.tier.to) return;
        this.tier = { from: this.tier.to, to: target, age: 0 };
    }

    /** Original BallWings.Animate (FlapRotation 60): both wings tween from rest to 60° in .1 s with
     * InOutQuad, then back to rest in .2 s with OutQuad. The wing root stays upright as the ball spins. */
    private wingAngle(elapsed: number): number {
        if (elapsed < 0 || elapsed >= .3) return 0;
        if (elapsed < .1) { const t = elapsed / .1; return 60 * (t < .5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2); }
        const t = (elapsed - .1) / .2;
        return 60 * (1 - t) * (1 - t);
    }

    /** A hard change of vertical speed that is not a flap (floor, roof, rim) flattens the ball for a moment. */
    private detectImpact(dt: number): void {
        const m = this.model!, change = m.vy - this.previousVy;
        this.squash.age += dt;
        if (m.started && this.previousVy < -1.5 && change > 2.5) this.squash = { age: 0, amount: Math.min(.22, change * .025), direction: -1 };
        this.previousVy = m.vy;
    }

    /** The start pill breathes slowly while it waits; its layout scale stays the base. */
    private breatheStartButton(): void {
        const overlay = this.overlay?.name === 'ReadyOverlay' ? this.overlay : null;
        if (!overlay || !this.layout) return;
        const card = overlay.getChildByName('ReadyControls'), start = (card ?? overlay).getChildByName('StartDunk');
        const base = card ? 1 : this.layout.controlScale, t = this.animationTime;
        start?.setScale(base * (1 + .025 * Math.sin(t * Math.PI * 2 / 1.6)), base * (1 + .025 * Math.sin(t * Math.PI * 2 / 1.6)), 1);
        // The hero ball bobs and sways gently; its wings beat slowly.
        const float = overlay.getChildByName('ReadyHero')?.getChildByName('HeroFloat');
        if (float) {
            float.setPosition(0, 10 * Math.sin(t * 2.2)); float.angle = 4 * Math.sin(t * 1.1);
            const ball = float.getChildByName('HeroBall'); if (ball) ball.angle = -t * 25;
            const wing = float.getChildByName('HeroWingFront'); if (wing) wing.angle = -6 + 30 * Math.max(0, Math.sin(t * 5));
        }
    }

    /** Night ambience fades in for a round, out after settlement; pause() / resume() hold its position. */
    private updateAmbience(dt: number): void {
        const voice = this.ambience;
        if (!voice || !this.ambienceClip || this.state === 'paused' || this.state === 'disposed') return;
        const target = this.state === 'idle' || this.state === 'finished' ? 0 : DUNK_AMBIENCE.volume;
        if (target > 0 && !this.ambienceStarted) {
            this.ambienceGain = 0;
            this.ambienceStarted = voice.play(this.ambienceClip, 0, true);
            if (!this.ambienceStarted) return;
        }
        if (!this.ambienceStarted) return;
        const step = DUNK_AMBIENCE.volume / DUNK_AMBIENCE.fadeSeconds * dt;
        this.ambienceGain = target > this.ambienceGain ? Math.min(target, this.ambienceGain + step) : Math.max(target, this.ambienceGain - step);
        if (target === 0 && this.ambienceGain === 0) { voice.stop(); this.ambienceStarted = false; } else voice.setVolume(this.ambienceGain);
    }

    private resetRound(saved?: DunkRoundSnapshot, keepPoster = false): void {
        if (!this.config || !this.context || !this.frame) return;
        keepPoster = keepPoster && !saved && this.isPoster();
        if (!keepPoster) this.clearOverlay();
        this.operation++; this.revivePending = this.reviveUsed = false; this.deathTime = 0;
        this.audioBank?.stopEffects();
        this.keys.clear();
        this.particles?.clear(); this.trail.length = 0;
        for (const float of this.floats) { float.age = Infinity; float.label.node.active = false; }
        for (const view of Array.from(this.hoopViews.values())) { view.back.destroy(); view.front.destroy(); }
        this.hoopViews.clear();
        const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        if (saved && saved.difficulty >= 0 && saved.difficulty < 3) {
            this.difficulty = saved.difficulty;
            this.model?.dispose();
            this.model = new FlappyDunkModel(this.config, this.difficulty, seed);
            if (!this.model.restore(saved)) saved = undefined;
        } else saved = undefined;
        if (!saved) {
            if (!this.model || this.model.difficultyIndex !== this.difficulty) {
                this.model?.dispose();
                this.model = new FlappyDunkModel(this.config, this.difficulty, seed);
            } else this.model.restart();
        }
        const model = this.model!;
        this.resumeSnapshot = saved;
        this.state = saved ? 'countdown' : 'ready';
        this.animationTime = this.ballBirthAge = this.flap = this.saveClock = 0; this.reportedScore = -1;
        this.scoreBump = -Infinity; this.squash.age = Infinity; this.previousVy = 0;
        const tier = dunkChainTier(model.multiplier); this.tier = { from: tier, to: tier, age: Infinity };
        this.guide = { step: 'off', age: 0, flaps: 0 };
        this.skyline?.reset(model.score);
        this.resetHud();
        this.applyLayout(); this.render();
        if (saved) this.startCountdown();
        else { this.persistRound(); if (keepPoster) this.refreshPoster(); else this.showReady(); }
    }

    /** 3-2-1 over the frozen round, then play carries on from the saved state. */
    private startCountdown(): void {
        this.state = 'countdown'; this.countdownAge = 0;
        this.clearOverlay();
        const l = this.layout!;
        this.overlay = this.makeNode('CountdownOverlay', this.frame!, l.width, l.height);
        this.overlay.addComponent(Graphics);
        this.overlay.addComponent(BlockInputEvents);
        const digit = this.label('CountdownDigit', this.overlay, String(COUNTDOWN_SECONDS), 0, 0, 320, 240, 180, T.lamp);
        digit.font = this.scoreFont!; digit.lineHeight = 220; digit.overflow = Label.Overflow.NONE;
        this.label('CountdownHint', this.overlay, '继续上一局', 0, 0, 420, 50, 30, T.ink, true);
        this.layoutOverlay();
        this.popCountdown(COUNTDOWN_SECONDS);
    }

    private advanceCountdown(dt: number): void {
        const before = COUNTDOWN_SECONDS - Math.floor(this.countdownAge);
        this.countdownAge += dt;
        if (this.countdownAge >= COUNTDOWN_SECONDS) {
            this.clearOverlay(); this.state = 'playing';
            this.model?.resumeRound(); this.resumeSnapshot = undefined; this.persistRound();
            return;
        }
        const now = COUNTDOWN_SECONDS - Math.floor(this.countdownAge);
        if (now !== before) this.popCountdown(now);
    }

    private popCountdown(value: number): void {
        const digit = this.overlay?.getChildByName('CountdownDigit');
        const label = digit?.getComponent(Label);
        if (!digit || !label) return;
        this.setText(label, String(value));
        this.context?.services.feedback.play('uiButton', { vibrate: false });
        this.motion.play(digit, 'pop', .35, p => { const k = 1.6 - .6 * easeOutBack(p); digit.setScale(k, k, 1); });
    }

    /** The live round goes into the save on each basket, once a second and at pause and exit; any other state clears it. */
    private persistRound(flush = false): void {
        const live = this.state === 'playing' || this.state === 'countdown'
            || (this.state === 'paused' && (this.pausedFrom === 'playing' || this.pausedFrom === 'countdown'));
        const round = live ? this.model?.snapshot() ?? this.resumeSnapshot : undefined;
        // snapshot() already owns fresh state, hoop and group records; no JSON round trip is needed.
        this.writeCustom({ dunkRound: round }, flush);
    }

    private writeCustom(patch: Readonly<Record<string, unknown>>, flush = false): void {
        const context = this.context;
        if (!context) return;
        const storage = context.services.storage, stored = storage.getGameData(context.gameId);
        const custom: Record<string, unknown> = { ...stored?.custom };
        for (const key of Object.keys(patch)) { if (patch[key] === undefined) delete custom[key]; else custom[key] = patch[key]; }
        try {
            storage.writeGameData(context.gameId, { ...(stored ?? { dataVersion: 1, playCount: 0 }), custom });
            if (flush) storage.flush();
        } catch (error: unknown) { console.warn('[FlappyDunk] Save failed', error); }
    }

    private readonly startRound = (): void => {
        if (this.state !== 'ready') return;
        const poster = this.isPoster();
        this.clearOverlay(); this.state = 'playing';
        // The poster's hero ball hands over to the real one, which pops in at its gameplay spot.
        if (poster) this.ballBirthAge = 0;
        if (!this.reviveUsed && this.context?.services.storage.getGameData(this.context.gameId)?.custom?.dunkGuideDone !== true)
            this.guide = { step: 'tap', age: 0, flaps: 0 };
        this.jump();
    };

    private jump(): void {
        if (this.state !== 'playing' || !this.model?.jump()) return;
        this.flap = .4;
        if (this.guide.step === 'tap') this.guide.flaps++;
        this.squash = { age: 0, amount: .12, direction: 1 }; this.previousVy = this.model.vy;
        this.consumeEvents(); this.render();
    }

    private readonly onTap = (event: EventTouch): void => {
        event.propagationStopped = true;
        if (this.state === 'ready') this.startRound(); else this.jump();
    };

    private readonly onKeyDown = (event: EventKeyboard): void => {
        const key = event.keyCode;
        if (key === KeyCode.ESCAPE) { if (this.state === 'playing') this.context?.requestPause(); return; }
        if (key !== KeyCode.SPACE && key !== KeyCode.ARROW_UP && key !== KeyCode.KEY_W) return;
        if (this.keys.has(key)) return;
        this.keys.add(key);
        if (this.state === 'ready') this.startRound(); else this.jump();
    };
    private readonly onKeyUp = (event: EventKeyboard): void => { this.keys.delete(event.keyCode); };

    private consumeEvents(): void {
        if (!this.model || !this.context) return;
        const feedback = this.context.services.feedback;
        for (const event of this.model.drainEvents()) {
            if (event.type === 'jump') {
                feedback.play('drop', { vibrate: false, variant: Math.floor(Math.random() * 3) });
                this.particles?.play('jump', { x: this.model.x, y: this.model.y });
            } else if (event.type === 'rim') {
                this.updateScoreHud();
                const hit = this.hoopViews.get(event.hoop);
                if (hit) hit.rimHit = this.animationTime;
                if (event.first) feedback.play('collision', { minIntervalMs: 100, volume: .7, vibrate: false });
                feedback.vibrate('light');
            } else if (event.type === 'score') {
                this.updateScoreHud();
                const scored = this.hoopViews.get(event.hoop);
                if (scored) scored.netKick = this.animationTime;
                this.scoreBump = this.animationTime;
                this.spawnScoreFloat(event.x, event.y, event.points, event.swish);
                if (event.swish) {
                    feedback.play('chain', { minIntervalMs: 0, vibrate: false }); feedback.vibrate('heavy');
                    // The multiplier climbs by one per consecutive swish from ×1, so it carries the current streak.
                    // Only rounds played on 极限 count towards the trophy.
                    if (this.model.difficultyIndex === DUNK_EXTREME_DIFFICULTY)
                        this.context.reportAchievementProgress('swish-streak', event.points - 1);
                } else feedback.play('merge', { minIntervalMs: 0, vibrate: false });
                if (event.points > 2) this.shake?.swishHit();
                // SpawnScoreParticle 0x27D1030 uses rotation.z (Quaternion), then
                // sets Euler (0, 0, z). Preserve that native conversion as well.
                const hoopAngle = this.model.hoops.find(h => h.id === event.hoop)?.angle ?? 0;
                // Only swishes burst; an ordinary basket gets its score sound alone.
                if (event.swish) this.particles?.play(event.points === 2 ? 'swish' : 'power', {
                    x: event.x, y: event.y, angle: Math.sin(hoopAngle * Math.PI / 360) });
                this.persistHighScore();
                if (this.guide.step === 'tap' || this.guide.step === 'hoop') {
                    this.guide = { step: 'chain', age: 0, flaps: 0 }; this.writeCustom({ dunkGuideDone: true });
                }
                this.persistRound();
                this.context.reportScore(this.model.score);
                this.reportedScore = this.model.score;
            } else if (event.type === 'shield') {
                feedback.play('milestone', { vibrate: false }); this.hudViews.get('Shield')?.transition?.show();
            } else if (event.type === 'shieldLost') {
                this.particles?.play('shieldLost', { x: this.model.x, y: this.model.y, scale: this.config!.ball.size });
            } else if (event.type === 'failure') {
                this.hudViews.get('Failed')?.transition?.show();
                feedback.play('failure', { vibrate: false }); feedback.vibrate('medium');
            }
        }
        if (this.reportedScore < 0) { this.context.reportScore(this.model.score); this.reportedScore = this.model.score; }
        this.advanceHud(0);
    }

    private result(completed = false): GameResult {
        const model = this.model;
        return Object.freeze({ score: model?.score ?? 0, duration: Math.round((model?.time ?? 0) * 1000), completed,
            extra: Object.freeze({ hoops: model?.cleared ?? 0, bestCombo: model?.bestCombo ?? 1,
                difficulty: this.difficulty, reason: model?.failure }) });
    }

    private buildInterface(): void {
        this.background = this.makeNode('DunkBackdrop', this.node, 750, 1334).addComponent(Graphics);
        this.stars = this.makeNode('SkyStars', this.background.node, 750, 1334).addComponent(Graphics);
        // Soft clouds sit between the sky and the moon; the moon is never masked by them.
        this.clouds = this.makeNode('SkyClouds', this.background.node, 750, 1334).addComponent(Graphics);
        this.moon = this.sprite('Moon', this.background.node, 'Moon', 140, 140);
        // Clouds and the dusk flock pass in front of the moon.
        this.skyFront = this.makeNode('SkyFront', this.background.node, 750, 1334).addComponent(Graphics);
        this.frame = this.makeNode('DunkFullScreen', this.node, 750, 1334);
        this.stage = this.makeNode('DunkPlayfield', this.frame, 750, 1334);
        this.stage.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.stage.on(Node.EventType.TOUCH_START, this.onTap, this);
        this.worldRoot = this.makeNode('DunkWorld', this.stage, 722, 1048);
        this.scenery = this.makeNode('DunkScenery', this.worldRoot, 722, 1048).addComponent(Graphics);
        this.backLayer = this.makeNode('HoopBacks', this.worldRoot, 722, 1048);
        const particlesBack = this.makeNode('ParticleBacks', this.worldRoot, 722, 1048);
        this.effects = this.makeNode('DunkTrail', this.worldRoot, 722, 1048).addComponent(Graphics);
        this.ball = this.createBall('Basketball', this.worldRoot, 60);
        this.frontLayer = this.makeNode('HoopFronts', this.worldRoot, 722, 1048);
        const particlesFront = this.makeNode('ParticleFronts', this.worldRoot, 722, 1048);
        this.floatLayer = this.makeNode('ScoreFloats', this.worldRoot, 722, 1048);
        // First-round guide drawn in world space, above the hoops and the ball.
        const guide = this.makeNode('GuideLayer', this.worldRoot, 722, 1048);
        this.guideLayer = guide.addComponent(Graphics);
        this.guideText = this.label('GuideText', guide, '', 0, 0, 560, 48, 28, T.ink, true);
        this.particles = new FlappyDunkParticles(this.particleConfig!, this.frames!, particlesBack, particlesFront,
            this.ball.faces[0].getSharedMaterial(0)!, this.context!.services.assets, BUNDLE);
        this.hud = this.makeNode('NativeHud', this.frame, 915, 1931);
        // The prefab's central Score object is disabled in the original. Its
        // shared game shell supplies the score in the top bar instead.
        const scoreShadow = this.scoreShadow = this.label('ScoreShadow', this.frame, '0', 0, 0, 220, 64, 44, '#000000');
        scoreShadow.font = this.scoreFont!; scoreShadow.color = color('#000000', 102);
        this.scoreLabel = this.label('Score', this.frame, '0', 0, 0, 220, 64, 44, T.ink);
        this.scoreLabel.font = this.scoreFont!;
        this.createHudText('SwishText', this.presentation!.SwishText, T.hud.swish, T.ink);
        this.comboLabel = this.createHudText('SwishCombo', this.presentation!.SwishCombo, `${T.hud.combo}2`, T.lamp);
        this.createHudText('Shield', this.presentation!.Shield, T.hud.shield, T.shield);
        const item = this.presentation!.Failed;
        const failed = this.makeHudNode('Failed', item);
        // The chalk plus is turned into a cross by the original presentation rotation.
        this.sprite('FailureCross', failed, 'Tris_X', item.rect.size[0], item.rect.size[1], 0, 0, T.danger);
        failed.angle = Math.atan2(item.rect.rotation[2], item.rect.rotation[3]) * 360 / Math.PI;
        this.iconButton('ReturnLobby', this.frame, 'IconBack', () => this.context?.requestLobby(this.result()));
        this.pauseButton = this.iconButton('Pause', this.frame, 'IconPause',
            () => { if (this.state === 'playing') this.context?.requestPause(); });
        this.pauseButton.active = false;
        this.resetHud();
    }

    private makeHudNode(name: string, item: DunkHudItem): Node {
        const p = item.rect.position, parent = item.parent?.position;
        const root = this.makeNode(name, this.hud!, item.rect.size[0], item.rect.size[1],
            p[0] + (parent?.[0] ?? 0), p[1] + (parent?.[1] ?? 0));
        this.hudViews.set(name, { root, opacity: root.addComponent(UIOpacity),
            transition: item.transition ? new FlappyDunkTransition(item.transition) : undefined });
        return root;
    }

    /** Native HUD slot (position, margins, animation) with the theme's Chinese call-out text. */
    private createHudText(name: string, item: DunkHudItem, text: string, fill: string): Label {
        const root = this.makeHudNode(name, item), margin = item.margin!;
        const label = this.label(name + 'Text', root, text, (margin[0] - margin[2]) / 2,
            (margin[3] - margin[1]) / 2, item.rect.size[0] - margin[0] - margin[2],
            item.rect.size[1] - margin[1] - margin[3], item.fontSize!, T.white);
        // Chalk glyphs are white; the theme owns each message colour instead of the desert presentation data.
        label.font = this.scoreFont!; label.color = color(fill); label.isItalic = !!item.italic;
        label.lineHeight = item.fontSize! * 46.75 / 37 + item.lineSpacing!;
        label.enableWrapText = true;
        return label;
    }

    private updateScoreHud(): void {
        if (!this.model) return;
        const chain = this.model.multiplier;
        this.setText(this.comboLabel, `${T.hud.combo}${chain}`);
        for (const name of ['SwishText', 'SwishCombo']) {
            const transition = this.hudViews.get(name)?.transition;
            if (chain > 1) transition?.show(); else transition?.hide();
        }
        this.hudViews.get('Failed')?.transition?.hide();
    }

    private resetHud(): void {
        this.hudViews.forEach(view => view.transition?.hide());
        this.advanceHud(0);
    }

    private advanceHud(dt: number): void {
        this.hudViews.forEach(view => {
            const t = view.transition;
            if (!t) return;
            t.advance(dt); view.root.active = t.active;
            view.root.setScale(t.scale, t.scale, 1);
            view.opacity.opacity = Math.round(Math.max(0, Math.min(1, t.opacity)) * 255);
        });
    }

    private readonly applyLayout = (): void => {
        if (!this.context || !this.frame || !this.stage || !this.background) return;
        const size = view.getVisibleSize();
        this.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        const layout = this.layout = calculateDunkLayout(size.width, size.height, this.context.services.platform.getLayoutInfo());
        this.frame.setPosition(layout.x, layout.y); this.frame.setScale(layout.scale, layout.scale, 1);
        this.frame.getComponent(UITransform)!.setContentSize(layout.width, layout.height);
        const child = (name: string) => this.frame!.getChildByName(name)!;
        for (const name of ['ReturnLobby', 'Pause']) child(name).setScale(layout.controlScale, layout.controlScale, 1);
        child('ReturnLobby').setPosition(layout.safe.leftX + DUNK_ICON_BUTTON * .66 * layout.controlScale, layout.controlY);
        child('Pause').setPosition(layout.safe.rightX - DUNK_ICON_BUTTON * .66 * layout.controlScale, layout.controlY);
        this.scoreLabel!.node.setPosition(0, layout.controlY);
        this.scoreLabel!.node.setScale(layout.controlScale, layout.controlScale, 1);
        child('ScoreShadow').setPosition(2 * layout.controlScale, layout.controlY - 2 * layout.controlScale);
        child('ScoreShadow').setScale(layout.controlScale, layout.controlScale, 1);
        // Original CanvasScaler uses Expand with a 915 × 1931 reference canvas.
        const reference = this.presentation!.canvas.reference;
        const hudScale = Math.min(size.width / reference[0], size.height / reference[1], layout.safe.height / 1500);
        this.hud!.setScale(hudScale, hudScale, 1);
        const hudTop = 760 * hudScale, hudBottom = -180 * hudScale;
        const hudY = Math.max(layout.safe.bottomY - hudBottom, Math.min(0, layout.safe.topY - hudTop));
        this.hud!.setPosition(0, hudY);
        this.stage.setPosition(0, layout.stageY);
        this.stage.getComponent(UITransform)!.setContentSize(layout.stageWidth, layout.stageHeight);
        this.layoutOverlay();
        this.background.node.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.render();
    };

    private render(): void {
        const m = this.model, l = this.layout;
        if (!m || !l || !this.ball || !this.scenery) return;
        // On a loss the camera stops where the ball fell, so the ball and its detached wings drop in view.
        const follow = m.x + (this.config?.cameraOffset[0] ?? 1.5);
        if (m.alive) this.cameraLock = undefined; else if (this.cameraLock === undefined) this.cameraLock = follow;
        this.cameraX = this.cameraLock ?? follow;
        this.worldRoot?.setPosition(-(this.shake?.x ?? 0) * l.unit, l.worldY - (this.shake?.y ?? 0) * l.unit);
        this.drawSky();
        this.drawScenery();
        this.setText(this.scoreLabel, String(m.score));
        this.setText(this.scoreShadow, String(m.score));
        // Each basket pops the counter and flashes it lamp-yellow, settling back to chalk.
        const bump = Math.min(1, (this.animationTime - this.scoreBump) / .35), pop = 1 + .6 * Math.sin(Math.PI * bump) * (1 - bump);
        const flash = this.renderColor; Color.lerp(flash, color(T.lamp), color(T.ink), bump);
        this.scoreLabel!.color = flash;
        this.scoreLabel!.node.setScale(l.controlScale * pop, l.controlScale * pop, 1);
        this.scoreShadow!.node.setScale(l.controlScale * pop, l.controlScale * pop, 1);
        const ball = this.ball, u = l.unit;
        const poster = this.state === 'ready' && this.isPoster();
        ball.root.active = !poster; this.scoreLabel!.node.active = this.scoreShadow!.node.active = !poster;
        ball.root.setPosition((m.x - this.cameraX) * u, m.y * u);
        const birthT = Math.min(1, this.ballBirthAge / .5);
        const birth = dunkBackOut(birthT);
        ball.root.setScale(birth, birth, 1);
        this.resizeBall(ball, 204 / 350 * this.config!.ball.size * u);
        ball.ball.angle = m.rotation - 180 * (1 - birth);
        const blinkAlpha = m.invincible > 0 && Math.floor((this.config!.ball.invincibleSeconds - m.invincible) * 50 / this.config!.ball.invincibleSeconds) % 2 === 0 ? 0 : 255;
        // The chain recolours the ball (painted → gold → moonlight blue), cross-fading over .25 s.
        const blend = Math.min(1, this.tier.age / .25);
        ball.faces.forEach((face, i) => {
            const weight = (i === this.tier.to ? blend : 0) + (i === this.tier.from && this.tier.from !== this.tier.to ? 1 - blend : 0);
            face.node.active = weight > 0; face.color = color(T.white, Math.round(blinkAlpha * weight));
        });
        const tierPop = 1 + .2 * Math.sin(Math.PI * Math.min(1, this.tier.age / .3)) * (1 - Math.min(1, this.tier.age / .3));
        // The glow breathes with the beat of the chain and flares when the tier rises.
        const tier = DUNK_CHAIN_TIERS[this.tier.to], flare = 1 + 1.2 * Math.max(0, 1 - this.tier.age / .35);
        ball.glow.node.active = tier.glow > 0 && m.alive;
        ball.glow.color = color(tier.trail, Math.round(255 * Math.min(1, tier.glow * (.85 + .15 * Math.sin(this.animationTime * 6)) * flare) * blinkAlpha / 255));
        ball.glow.node.setScale(tierPop * (1 + .25 * (flare - 1)), tierPop * (1 + .25 * (flare - 1)), 1);
        const squash = this.squash.amount * springPulse(Math.min(1, this.squash.age / .3), 1) * this.squash.direction;
        ball.body.setScale(tierPop * (1 - .8 * squash), tierPop * (1 + squash), 1);
        const elapsed = this.flap > 0 ? .4 - this.flap : .4;
        const wingAngle = this.wingAngle(elapsed);
        ball.left.angle = ball.right.angle = wingAngle;
        m.wingRotation = wingAngle;
        if (m.wings) for (let i = 0; i < 2; i++) {
            const n = i === 0 ? ball.left : ball.right, wing = m.wings[i];
            n.setPosition((wing.x - m.x) * u, (wing.y - m.y) * u); n.angle = wing.rotation;
        } else {
            // Attachment pose is state, independent of cached sprite dimensions.
            // Detached physics overwrites these coordinates every dying frame.
            const wingUnit = this.config!.ball.size * u;
            ball.left.setPosition(-.063 * wingUnit, .199 * wingUnit);
            ball.right.setPosition(-.203 * wingUnit, .111 * wingUnit);
        }
        ball.shield.node.active = m.shield;
        for (const hoop of m.hoops) {
            let hv = this.hoopViews.get(hoop.id);
            if (!hv) { hv = this.createHoop(hoop); this.hoopViews.set(hoop.id, hv); }
            this.renderHoop(hoop, hv);
        }
        this.hoopViews.forEach((hv, id) => {
            if (!m.hoops.some(h => h.id === id)) { hv.back.destroy(); hv.front.destroy(); this.hoopViews.delete(id); }
        });
        this.drawEffects();
        this.drawScoreFloats();
        this.drawGuide();
    }

    /** Screen-space sky behind the playfield, with the moon rising and setting through the night. */
    private drawSky(): void {
        const g = this.background!, l = this.layout!, skyline = this.skyline!, moon = this.moon!;
        skyline.update(this.model!.score, this.animationTime);
        skyline.drawSky(g, l.width, l.height, this.animationTime);
        skyline.drawStars(this.stars!, l.width, l.height, this.animationTime);
        const sky = skyline.sky, scale = l.controlScale;
        moon.node.setScale(scale, scale, 1);
        // At its zenith the moon still clears the top band of the playfield.
        const zenith = Math.min(l.safe.topY - 230 * scale, l.worldY + (this.model!.wallLimit - .75) * l.unit);
        moon.node.setPosition(l.safe.rightX - 130 * scale, -.05 * l.height + (zenith + .05 * l.height) * sky.moonHeight);
        moon.color = color(T.white, Math.round(sky.moonAlpha * 255));
        // Each puff is four nested faint ellipses, so the cloud thickens towards its middle with no hard rim.
        const clouds = this.clouds!;
        clouds.clear();
        for (const p of skyline.cloudPuffs(l.width, l.height, this.animationTime)) {
            for (const k of CLOUD_RINGS) {
                clouds.fillColor = p.color; clouds.ellipse(p.x, p.y, p.w / 2 * k, p.h / 2 * k); clouds.fill();
            }
        }
        this.skyFront!.clear(); skyline.drawSkyFront(this.skyFront!, l.width, l.height, this.animationTime);
    }

    private drawScenery(): void {
        const g = this.scenery!, l = this.layout!, m = this.model!, u = l.unit;
        const half = l.stageWidth / 2 + 20, bottom = -l.stageHeight / 2 - l.worldY - 20, top = l.stageHeight / 2 - l.worldY + 20;
        g.clear();
        this.skyline!.drawCity(g, this.cameraX, u, half, this.animationTime);
        const wall = m.wallLimit * u;
        // Rooftop floor: one plain concrete band under the capped, moonlit collision line.
        g.fillColor = color(T.roof);
        g.rect(-half, bottom, half * 2, -wall - bottom); g.fill();
        // Night band above the playfield with a sagging power line, scrolling with the rooftops.
        g.fillColor = color(T.roof);
        g.rect(-half, wall, half * 2, top - wall); g.fill();
        g.strokeColor = color(T.roofEdge); g.lineWidth = .035 * u;
        const span = 6, start = Math.floor((this.cameraX * .4 - half / u) / span) * span;
        for (let x = start; x < this.cameraX * .4 + half / u + span; x += span) {
            const x1 = (x - this.cameraX * .4) * u, x2 = x1 + span * u;
            g.moveTo(x1, wall + .5 * u); g.quadraticCurveTo((x1 + x2) / 2, wall + .12 * u, x2, wall + .5 * u);
        }
        g.stroke();
        // Both collision lines read clearly: a concrete cap with a moonlit edge exactly on the boundary.
        g.fillColor = color(T.roofCap);
        g.rect(-half, -wall - .08 * u, half * 2, .08 * u); g.rect(-half, wall, half * 2, .08 * u); g.fill();
        g.strokeColor = color(T.roofCapLight, 220); g.lineWidth = Math.max(2, .025 * u);
        g.moveTo(-half, -wall); g.lineTo(half, -wall); g.moveTo(-half, wall); g.lineTo(half, wall); g.stroke();
        // Movement rails, anchored to the collision coordinates: a dark underlay, a dashed lamp track
        // and a stop at each end, so the path reads against both sky and windows.
        for (const h of m.hoops) {
            if (h.resolved || (!h.moveX && !h.moveY)) continue;
            const a = { x: (h.baseX - this.cameraX) * u, y: h.baseY * u }, b = { x: a.x + h.moveX * u, y: a.y + h.moveY * u };
            if (Math.max(a.x, b.x) < -half || Math.min(a.x, b.x) > half) continue;
            const length = Math.hypot(b.x - a.x, b.y - a.y), dash = .12 * u, gap = .08 * u;
            g.strokeColor = color(T.silhouetteShade, 170); g.lineWidth = Math.max(6, .06 * u);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
            g.strokeColor = color(T.lamp, 235); g.lineWidth = Math.max(3, .03 * u);
            for (let d = 0; d < length; d += dash + gap) {
                const s0 = d / length, s1 = Math.min(1, (d + dash) / length);
                g.moveTo(a.x + (b.x - a.x) * s0, a.y + (b.y - a.y) * s0); g.lineTo(a.x + (b.x - a.x) * s1, a.y + (b.y - a.y) * s1);
            }
            g.stroke();
            for (const end of [a, b]) {
                g.fillColor = color(T.silhouetteShade, 170); g.circle(end.x, end.y, .07 * u); g.fill();
                g.fillColor = color(T.lamp); g.circle(end.x, end.y, .045 * u); g.fill();
            }
        }
    }

    private createHoop(h: DunkHoop): HoopView {
        const back = this.makeNode(`HoopBack-${h.id}`, this.backLayer!, 1, 1);
        const front = this.makeNode(`HoopFront-${h.id}`, this.frontLayer!, 1, 1);
        const rim = h.inverted ? T.rimInverted : T.rim;
        this.sprite('BackRim', back, 'Hoop_1', 1, 1, 0, 0, rim);
        // The net hangs from the front half so the ball visibly drops through it; it never collides.
        this.sprite('Net', front, 'Net', 1, 1).node.getComponent(UITransform)!.setAnchorPoint(.5, 1);
        this.sprite('FrontRim', front, 'Hoop_0', 1, 1, 0, 0, rim);
        this.sprite('RimHighlight', back, 'RingHighlightSmall', 1, 1).color = color(T.white, 197);
        this.sprite('RimHighlightDot', back, 'Cerchio_128', 1, 1).color = color(T.white, 197);
        if (h.shield) {
            this.sprite('ShieldPickup', front, 'Shield', 1, 1);
            this.sprite('ShieldHighlight', back, 'CircleBlur', 1, 1, 0, 0, T.shield);
        }
        if (h.hazard) for (const side of [-1, 1]) this.sprite(side < 0 ? 'LeftHazard' : 'RightHazard', front, 'BeyBlade', 1, 1);
        return { back, front, fire: false, netKick: -Infinity, rimHit: -Infinity,
            opacityBack: back.addComponent(UIOpacity), opacityFront: front.addComponent(UIOpacity),
            unit: NaN, net: front.getChildByName('Net')!.getComponent(UITransform)!,
            pickup: front.getChildByName('ShieldPickup') ?? undefined, highlight: back.getChildByName('ShieldHighlight') ?? undefined,
            leftHazard: front.getChildByName('LeftHazard') ?? undefined, rightHazard: front.getChildByName('RightHazard') ?? undefined };
    }

    /** Visual pose only; colliders stay where the model puts them. A hoop pops in when it spawns, dips
     * with its net when scored, wobbles when the rim is hit and sinks away as it fades out. */
    private hoopPose(h: DunkHoop, hv?: HoopView): { y: number; scale: number; angle: number; opacity: number } {
        const enter = Math.min(1, h.age / .35), leave = h.resolved ? easeInCubic(Math.min(1, h.fade / .5)) : 0;
        const dip = hv ? springPulse(Math.min(1, (this.animationTime - hv.netKick) / .45), 1) : 0;
        const wobble = hv ? springPulse(Math.min(1, (this.animationTime - hv.rimHit) / .5), 2) : 0;
        return { y: h.y - .1 * dip - .3 * leave, scale: h.scale * (.6 + .4 * easeOutBack(enter)) * (1 - .15 * leave),
            angle: h.angle + 5 * wobble, opacity: h.resolved ? 1 - Math.min(1, h.fade / .5) : Math.min(1, h.age / .12) };
    }

    private renderHoop(h: DunkHoop, hv: HoopView): void {
        const l = this.layout!, u = l.unit, pose = this.hoopPose(h, hv), x = (h.x - this.cameraX) * u, y = pose.y * u;
        const extent = 1.04 * h.scale * u;
        const margin = l.stageWidth / 2 - Math.abs(x) - extent;
        const visible = margin > -extent * 2 && Math.abs(y) - extent < l.stageHeight / 2;
        hv.back.active = hv.front.active = visible;
        if (!visible) return;
        hv.opacityBack.opacity = hv.opacityFront.opacity = Math.round(Math.max(0, pose.opacity) * 255);
        for (const root of [hv.back, hv.front]) {
            root.setPosition(x, y); root.angle = pose.angle; root.setScale(pose.scale, pose.scale, 1);
        }
        if (hv.unit !== u) {
            hv.unit = u;
            const resize = (root: Node, name: string, w: number, height: number, px = 0, py = 0) => {
                const n = root.getChildByName(name); if (!n) return;
                n.getComponent(UITransform)!.setContentSize(w * u, height * u); n.setPosition(px * u, py * u);
            };
            resize(hv.back, 'BackRim', 1.92, .33 * .7888, 0, .1612);
            resize(hv.front, 'FrontRim', 1.92, .45 * .7888, 0, -.146);
            resize(hv.front, 'Net', 1.623, .564, 0, -.14);
            resize(hv.back, 'RimHighlight', 2.65 * .06939633190631866, 2.51 * .21521514654159546, -.4580000042915344, .210999995470047);
            const stripe = hv.back.getChildByName('RimHighlight')!;
            stripe.angle = Math.atan2(.7040484547615051, .7101520299911499) * 360 / Math.PI; stripe.setScale(1, -1, 1);
            resize(hv.back, 'RimHighlightDot', 128 / 12.399999618530273 * .004084464628249407,
                128 / 12.399999618530273 * .008860799483954906, -.7639999985694885, .09399999678134918);
            hv.back.getChildByName('RimHighlightDot')!.angle = Math.atan2(.7271804213523865, .686446487903595) * 360 / Math.PI;
            resize(hv.front, 'ShieldPickup', 1.74 * .32, 1.86 * .340571, -.216, -.267);
            resize(hv.back, 'ShieldHighlight', 1.28, 1.28);
            for (const [name, sign] of [['LeftHazard', -1], ['RightHazard', 1]] as const)
                resize(hv.front, name, 5.66 * .077, 5.45 * .077, sign * .775, .016);
        }
        // Only the net's score stretch changes its dimensions between layout updates.
        const kick = Math.min(1, Math.max(0, (this.animationTime - hv.netKick) / .25));
        const stretch = kick < 1 ? 1 + .22 * Math.sin(kick * Math.PI) : 1;
        hv.net.setContentSize(1.623 * u, .564 * stretch * u);
        if (hv.pickup) hv.pickup.active = h.shield;
        if (hv.highlight) hv.highlight.active = h.shield;
        const hazardAngle = this.hazardAngles[(h.id - 1) % 3];
        if (hv.leftHazard) hv.leftHazard.angle = hazardAngle;
        if (hv.rightHazard) hv.rightHazard.angle = hazardAngle;
    }

    private createBall(name: string, parent: Node, size: number): BallView {
        const root = this.makeNode(name, parent, size * 2.5, size * 2);
        const left = this.sprite('LeftWing', root, 'Wing', 1, 1).node;
        left.getComponent(UITransform)!.setAnchorPoint(WING_PIVOT[0], WING_PIVOT[1]);
        // Chain glow: a soft disc in the tier colour behind the ball (hidden at ×1).
        const glow = this.sprite('TierGlow', root, 'CircleBlur', size * 1.5, size * 1.5, 0, 0, T.lamp);
        const body = this.makeNode('BallBody', root, size, size);
        const ball = this.makeNode('BallSpin', body, size, size);
        const faces = DUNK_CHAIN_TIERS.map(tier => this.sprite(tier.ball, ball, tier.ball, size, size));
        const right = this.sprite('RightWing', root, 'Wing', 1, 1).node;
        right.getComponent(UITransform)!.setAnchorPoint(WING_PIVOT[0], WING_PIVOT[1]);
        const shield = this.sprite('ShieldAura', root, 'CircleBlur', 1, 1, 0, 0, T.shield);
        const result = { root, body, ball, faces, glow, left, right, shield, size: NaN };
        this.resizeBall(result, size); return result;
    }

    private resizeBall(ball: BallView, size: number): void {
        if (ball.size === size) return;
        ball.size = size;
        for (const face of ball.faces) face.node.getComponent(UITransform)!.setContentSize(size, size);
        ball.glow.node.getComponent(UITransform)!.setContentSize(size * 1.5, size * 1.5);
        const unit = size / (204 / 350);
        ball.shield.node.getComponent(UITransform)!.setContentSize(1.28 * unit, 1.28 * unit);
        for (const wing of [ball.left, ball.right]) wing.getComponent(UITransform)!.setContentSize(WING_SIZE[0] * unit, WING_SIZE[1] * unit);
    }

    private updateEffects(dt: number): void {
        const p = this.particles, m = this.model;
        if (!p || !m) return;
        p.beginFrame();
        const ball = { x: m.x, y: m.y, scale: this.config!.ball.size, angle: m.rotation };
        // Tight sparks in the tier colour follow the ball: gold embers at ×2, moonlit sparks from ×3.
        const sparks = DUNK_CHAIN_TIERS[dunkChainTier(m.multiplier)].sparks;
        if (m.started && m.alive && sparks) p.loop(`ball-${sparks}`, sparks, ball);
        for (const h of m.hoops) {
            if (h.hazard) this.hazardAngles[(h.id - 1) % 3] += dt * (this.sceneSource?.hazardRotation[2] ?? 1000);
            const hv = this.hoopViews.get(h.id), pose = this.hoopPose(h, hv);
            const anchor = { x: h.x, y: pose.y, angle: pose.angle, scale: pose.scale };
            if (hv && !h.resolved) hv.fire = m.multiplier > 1;
            if (hv?.fire) {
                p.loop(`fire-back-${h.id}`, 'fireBack', anchor);
                p.loop(`fire-front-${h.id}`, 'fireFront', anchor);
            }
            if (h.inverted) p.loop(`inverted-${h.id}`, 'inverted', anchor);
        }
        p.advance(dt);
    }

    private drawEffects(): void {
        const g = this.effects!, l = this.layout!, m = this.model!, u = l.unit;
        g.clear();
        const inside = (x: number, y: number, radius: number) => Math.abs(x) + radius < l.stageWidth / 2
            && Math.abs(y) + radius < m.wallLimit * u;
        const tier = DUNK_CHAIN_TIERS[this.tier.to];
        const ribbon = this.ribbonPoints(u);
        if (this.ribbonCount > 1 && inside(ribbon[0].x, ribbon[0].y, .35 * u)) {
            // Width tapers from about the ball's diameter at the head to nothing; alpha fades the same way.
            // In a chain a wide soft halo, the coloured band and a white core read as one glowing streak.
            if (tier.core) this.drawRibbon(g, ribbon, .56 * u, tier.trail, tier.trailAlpha * .3);
            this.drawRibbon(g, ribbon, .4 * u, tier.trail, tier.trailAlpha);
            if (tier.core) this.drawRibbon(g, ribbon, .16 * u, T.white, tier.trailAlpha * .9);
        }
        this.particles?.draw(this.cameraX, u);
    }

    /** Ball trail samples, newest first, smoothed with Catmull-Rom so the ribbon bends instead of stepping. */
    private ribbonPoints(u: number): RibbonPoint[] {
        const m = this.model!, points = this.ribbon, count = this.trail.length + 1;
        const sample = (i: number) => i === 0 ? m : this.trail[this.trail.length - i];
        let index = 0;
        for (let i = 0; i < count - 1; i++) {
            const p0 = sample(Math.max(0, i - 1)), p1 = sample(i), p2 = sample(i + 1), p3 = sample(Math.min(count - 1, i + 2));
            const t1 = i === 0 ? 0 : 1 - this.trail[this.trail.length - i].life / .4;
            const t2 = 1 - this.trail[this.trail.length - i - 1].life / .4;
            for (let k = 0; k < 3; k++) {
                const s = k / 3, s2 = s * s, s3 = s2 * s;
                const f = (a: number, b: number, c: number, d: number) =>
                    .5 * (2 * b + (c - a) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (3 * b - a - 3 * c + d) * s3);
                const p = points[index] ?? (points[index] = { x: 0, y: 0, t: 0, nx: 0, ny: 0, taper: 0, fade: 0 }); index++;
                p.x = (f(p0.x, p1.x, p2.x, p3.x) - this.cameraX) * u; p.y = f(p0.y, p1.y, p2.y, p3.y) * u;
                p.t = t1 + (t2 - t1) * s;
            }
        }
        const last = sample(count - 1), p = points[index] ?? (points[index] = { x: 0, y: 0, t: 0, nx: 0, ny: 0, taper: 0, fade: 0 });
        p.x = (last.x - this.cameraX) * u; p.y = last.y * u; p.t = count === 1 ? 0 : 1 - this.trail[0].life / .4;
        this.ribbonCount = index + 1;
        for (let i = 0; i < this.ribbonCount; i++) {
            const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(this.ribbonCount - 1, i + 1)];
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
            p.nx = dy / length; p.ny = dx / length; p.taper = (1 - p.t) ** .8;
            p.fade = i + 1 < this.ribbonCount ? (1 - (p.t + points[i + 1].t) / 2) ** 1.5 : 0;
        }
        return points;
    }

    /** One quad per segment sharing edges with its neighbours, so there are no gaps, overlaps or steps. */
    private drawRibbon(g: Graphics, points: RibbonPoint[], width: number, hex: string, alpha: number): void {
        for (let i = 0; i < this.ribbonCount - 1; i++) {
            const a = points[i], b = points[i + 1], fade = a.fade;
            if (fade <= .01) continue;
            g.fillColor = color(hex, Math.round(255 * alpha * fade));
            const ah = width / 2 * a.taper, bh = width / 2 * b.taper;
            g.moveTo(a.x - a.nx * ah, a.y + a.ny * ah); g.lineTo(b.x - b.nx * bh, b.y + b.ny * bh);
            g.lineTo(b.x + b.nx * bh, b.y - b.ny * bh); g.lineTo(a.x + a.nx * ah, a.y - a.ny * ah); g.close(); g.fill();
        }
    }

    /** Start screen. A new round gets the poster: chalk title, a floating hero ball with this difficulty's
     * best score, and game-style controls on a darkened bottom: three difficulty medallions and a chunky
     * start button. After a revive only the continue pill shows. */
    private showReady(): void {
        this.clearOverlay();
        const l = this.layout!;
        this.overlay = this.makeNode('ReadyOverlay', this.frame!, l.width, l.stageHeight);
        this.overlay.setPosition(0, l.stageY);
        if (this.reviveUsed) {
            this.button('StartDunk', this.overlay, '点按继续', 'IconBall', 0, 0, 420, 92, true, this.startRound, 46);
            this.readyBest = this.label('ReadyBest', this.overlay, '保留得分 · 从上方穿圈', 0, 0, 570, 36, 23, T.muted);
        } else {
            this.makeNode('PosterShade', this.overlay, l.width, l.stageHeight).addComponent(Graphics);
            this.posterTitle(this.overlay);
            this.posterHero(this.overlay);
            this.posterControls(this.overlay);
        }
        this.layoutOverlay();
        this.overlay.children.forEach((child, i) => this.fadeIn(child, .35, .05 + i * .1, i === 0 ? -16 : 16));
        const face = this.overlay.getChildByName('ReadyControls')?.getChildByName('StartDunk')?.getChildByName('Face')
            ?? this.overlay.getChildByName('StartDunk')?.getChildByName('Face');
        if (face) this.motion.play(face, 'enter', .4, p => { const k = .8 + .2 * easeOutBack(p); face.setScale(k, k, 1); }, .3);
    }

    /** 篮球灌篮 in large chalk with a soft drop shadow; the title stands alone. */
    private posterTitle(parent: Node): void {
        const root = this.makeNode('ReadyTitle', parent, 640, 160);
        const shadow = this.label('TitleShadow', root, '篮球灌篮', 4, -4, 640, 150, 118, '#000000');
        shadow.font = this.scoreFont!; shadow.lineHeight = 140; shadow.color = color(T.silhouetteShade, 150); shadow.overflow = Label.Overflow.NONE;
        const title = this.label('TitleText', root, '篮球灌篮', 0, 0, 640, 150, 118, T.ink);
        title.font = this.scoreFont!; title.lineHeight = 140; title.overflow = Label.Overflow.NONE;
    }

    /** The ball as the poster's hero: moon glow behind, wings out; it floats while the screen waits. */
    private posterHero(parent: Node): void {
        const root = this.makeNode('ReadyHero', parent, 260, 220);
        const float = this.makeNode('HeroFloat', root, 260, 220);
        this.sprite('HeroGlow', float, 'CircleBlur', 260, 260, 0, 0, T.moon).color = color(T.moon, 70);
        const back = this.sprite('HeroWingBack', float, 'Wing', 94, 96, -16, 51).node;
        back.getComponent(UITransform)!.setAnchorPoint(WING_PIVOT[0], WING_PIVOT[1]); back.angle = 12;
        this.sprite('HeroBall', float, 'Ball', 150, 150);
        const front = this.sprite('HeroWingFront', float, 'Wing', 94, 96, -52, 28).node;
        front.getComponent(UITransform)!.setAnchorPoint(WING_PIVOT[0], WING_PIVOT[1]);
        front.angle = -6;
        // This difficulty's best score sits under the hero: caption and chalk number between two stars.
        const best = this.makeNode('HeroBest', root, 460, 70, 0, -140);
        this.readable(this.label('BestCaption', best, '', 0, 26, 300, 32, 26, T.ink, true));
        const value = this.label('BestValue', best, '0', 0, -14, 260, 60, 56, T.lamp);
        value.font = this.scoreFont!; value.lineHeight = 64; value.overflow = Label.Overflow.NONE;
        for (const side of [-1, 1]) this.sprite(`BestStar${side}`, best, 'Star2', 22, 22, side * 110, 10, T.lamp);
    }

    private fadeIn(node: Node, duration: number, delay: number, rise = 0): void {
        const opacity = this.entranceOpacity(node), base = node.position.y;
        this.motion.play(node, 'enter', duration, p => {
            const e = easeOutCubic(p); opacity.opacity = Math.round(255 * e);
            if (rise) node.setPosition(node.position.x, base - rise * (1 - e));
            if (p >= 1) opacity.destroy();
        }, delay);
    }

    /** Opacity used only while an entrance runs: a UIOpacity left on a Label node leaves a faint box behind the text. */
    private entranceOpacity(node: Node): UIOpacity { return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity); }

    /** Small text over the night city gets a dark outline so it stays legible on lit windows. */
    private readable(label: Label): Label {
        label.enableOutline = true; label.outlineColor = color(T.veil, 220); label.outlineWidth = 3;
        return label;
    }

    private isPoster(): boolean { return this.overlay?.name === 'ReadyOverlay' && !!this.overlay.getChildByName('ReadyControls'); }

    /** Difficulty medallions over the start button and the one-line rule; no panel behind them. */
    private posterControls(parent: Node): void {
        const root = this.makeNode('ReadyControls', parent, 640, 380);
        for (let i = 0; i < 3; i++) {
            const node = this.makeNode(`Difficulty-${i}`, root, 170, 190, (i - 1) * 190, 110);
            const face = this.makeNode('Face', node, 170, 190);
            this.sprite('ChipGlow', face, 'CircleBlur', 210, 210, 0, 22, T.lamp);
            face.addComponent(Graphics);
            this.label(`Difficulty-${i}Label`, face, T.difficulties[i], 0, -60, 160, 40, 30, T.ink, true);
            this.bindAction(node, () => this.chooseDifficulty(i));
        }
        const start = this.button('StartDunk', root, '开始灌篮', 'IconBall', 0, -78, 460, 100, true, this.startRound, 50);
        this.chunkyPlate(start.getChildByName('Face')!, 460, 100, 50);
        this.readyBest = this.readable(this.label('ReadyBest', root, '从上方穿圈 · 连续空心得分翻倍', 0, -168, 600, 40, 26, T.ink, true));
        this.refreshPoster(false);
    }

    /** Selection, medallion art and the best score follow the current difficulty without rebuilding the screen. */
    private refreshPoster(animate = true): void {
        const controls = this.overlay?.getChildByName('ReadyControls');
        if (!controls) return;
        for (let i = 0; i < 3; i++) {
            const selected = i === this.difficulty, face = controls.getChildByName(`Difficulty-${i}`)!.getChildByName('Face')!;
            const g = face.getComponent(Graphics)!, r = 56;
            g.clear();
            if (selected) {
                // A lit lamp coin: brass rim underneath, lamp face, a pale inner ring.
                g.fillColor = color(T.lampDim); g.circle(0, 16, r); g.fill();
                g.fillColor = color(T.lamp); g.circle(0, 22, r); g.fill();
                g.strokeColor = color('#FFF1C9', 190); g.lineWidth = 3; g.circle(0, 22, r - 7); g.stroke();
            } else {
                g.fillColor = color(T.silhouetteShade, 130); g.circle(0, 17, r); g.fill();
                g.fillColor = color(T.panel, 240); g.circle(0, 22, r); g.fill();
                g.strokeColor = color(T.roofCap); g.lineWidth = 3; g.circle(0, 22, r - 1.5); g.stroke();
            }
            face.getChildByName('ChipGlow')!.active = selected;
            face.getChildByName('ChipGlow')!.getComponent(Sprite)!.color = color(T.lamp, 110);
            this.drawMoonPhase(g, i, 0, 22, 27, selected ? T.inkDark : T.moon, selected ? T.lamp : T.panel);
            face.getChildByName(`Difficulty-${i}Label`)!.getComponent(Label)!.color = color(selected ? T.lamp : T.ink);
            const target = selected ? 1.08 : .92, from = face.scale.x;
            if (animate) this.motion.play(face, 'select', .28, p => { const k = from + (target - from) * easeOutBack(p); face.setScale(k, k, 1); });
            else face.setScale(target, target, 1);
        }
        const best = this.overlay?.getChildByName('ReadyHero')?.getChildByName('HeroBest');
        const value = best?.getChildByName('BestValue')?.getComponent(Label), caption = best?.getChildByName('BestCaption')?.getComponent(Label);
        if (best && value && caption) {
            this.setText(caption, `${T.difficulties[this.difficulty]} · 最高分`); this.setText(value, String(this.highScore()));
            if (animate) this.motion.play(best, 'select', .3, p => { const k = 1 + .12 * Math.sin(Math.PI * p); best.setScale(k, k, 1); });
        }
    }

    /** Difficulty as the moon waxing: 普通 a crescent, 困难 a half moon, 极限 the full moon with craters.
     * The unlit part of the disc is a faint outline so every icon still reads as one moon. */
    private drawMoonPhase(g: Graphics, phase: number, x: number, y: number, r: number, ink: string, face: string): void {
        g.strokeColor = color(ink, 80); g.lineWidth = 2; g.circle(x, y, r); g.stroke();
        g.fillColor = color(ink);
        if (phase === 0) {
            g.circle(x, y, r); g.fill();
            g.fillColor = color(face); g.circle(x + r * .42, y + r * .12, r * .9); g.fill();
        } else if (phase === 1) {
            g.moveTo(x, y + r); g.arc(x, y, r, Math.PI / 2, Math.PI * 1.5, false); g.close(); g.fill();
        } else {
            g.circle(x, y, r); g.fill();
            g.fillColor = color(face, 70);
            for (const [cx, cy, cr] of [[-.35, .3, .2], [.3, .05, .26], [-.1, -.42, .16]]) { g.circle(x + cx * r, y + cy * r, cr * r); g.fill(); }
        }
    }

    /** Game button: a thick brass base under a lamp face, a glossy top half and a soft drop shadow. */
    private chunkyPlate(face: Node, width: number, height: number, radius: number): void {
        const g = face.getComponent(Graphics)!;
        g.clear();
        g.fillColor = color(T.silhouetteShade, 120); g.roundRect(-width / 2 + 8, -height / 2 - 16, width - 16, height, radius); g.fill();
        g.fillColor = color(T.lampDim); g.roundRect(-width / 2, -height / 2 - 9, width, height, radius); g.fill();
        g.fillColor = color(T.lamp); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
        g.fillColor = color(T.white, 70); g.roundRect(-width / 2 + 14, 4, width - 28, height / 2 - 12, (height / 2 - 12) / 2); g.fill();
    }

    private chooseDifficulty(index: number): void {
        if (this.state !== 'ready' || this.reviveUsed || index === this.difficulty || !this.context) return;
        this.difficulty = index;
        this.writeCustom({ dunkDifficulty: index });
        // Only the round behind the poster restarts; the start screen stays and just moves its selection.
        this.context.services.feedback.play('uiButton', { vibrate: false }); this.resetRound(undefined, true);
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        this.actionDialog('PauseOverlay', '歇一会儿', '篮球等你回来', [
            { name: 'ResumeDunk', text: '继续灌篮', icon: 'IconPlay', primary: true, action: model.resume },
            { name: 'RestartDunk', text: '重新开始', icon: 'IconRestart', action: model.restart },
            { name: 'LeaveDunk', text: '返回大厅', icon: 'IconHome', action: model.exit },
        ]);
    }
    /** The runtime hides the pause menu after resume(); only remove the pause card, never what resume() opened. */
    hidePauseMenu(): void { if (this.overlay?.name === 'PauseOverlay') this.clearOverlay(); }

    showResultView(model: MiniGameResultModel): void {
        const reason = this.model?.failure;
        this.actionDialog('ResultOverlay', '本局结束', reason ? T.failure[reason] : '继续挑战你的纪录', [
            { name: 'PlayAgain', text: '再来一局', icon: 'IconRestart', primary: true, action: model.restart },
            { name: 'ResultLobby', text: '返回大厅', icon: 'IconHome', action: model.returnToLobby },
        ], true);
    }
    hideResultView(): void { if (this.overlay?.name === 'ResultOverlay') this.clearOverlay(); }

    private finishRound(): void {
        if (this.state === 'finished' || this.state === 'disposed') return;
        this.clearOverlay(); this.state = 'finished'; this.keys.clear();
        // Runtime's completed flag means present the settled round instead of exiting to lobby.
        this.context?.requestExit(this.result(true));
    }

    private showRevive(message = '保留得分，继续挑战'): void {
        if (this.state === 'disposed' || this.state === 'finished') return;
        this.state = 'revive';
        this.actionDialog('ReviveOverlay', '再来一次', message, [
            { name: 'ReviveDunk', text: '看视频继续', icon: 'IconVideo', primary: true, action: () => this.requestRevive() },
            { name: 'DeclineRevive', text: '本局结算', icon: 'IconFlag', action: () => this.finishRound() },
        ]);
    }

    private async requestRevive(): Promise<void> {
        if (this.revivePending || this.state !== 'revive' || !this.context || !this.model) return;
        const context = this.context, operation = this.operation;
        this.revivePending = true;
        this.actionDialog('ReviveLoading', '正在准备', '请稍候', []);
        try {
            const ad = await context.services.ads.showRewarded({ placement: AD_PLACEMENTS.flappyDunkRevive,
                gameId: context.gameId, sessionId: context.sessionId });
            if (this.context !== context || this.operation !== operation) return;
            if (ad.outcome === 'completed' && this.model.revive()) {
                this.reviveUsed = true; this.state = 'ready'; this.ballBirthAge = this.deathTime = this.flap = 0;
                this.resetHud();
                this.particles?.clear(); this.trail.length = 0;
                this.clearOverlay(); this.render(); this.showReady();
            } else this.showRevive(ad.outcome === 'skipped' ? '视频未看完，仍可继续' : '视频暂时不可用，请稍后重试');
        } catch {
            if (this.context === context && this.operation === operation) this.showRevive('视频暂时不可用，请稍后重试');
        } finally {
            if (this.operation === operation) this.revivePending = false;
        }
    }

    /** Result / pause / revive card, laid out top-down and closed tightly around its content. */
    private actionDialog(name: string, title: string, subtitle: string, actions: DialogAction[], result = false): void {
        const button = 84, gap = 18, top = 58, bottom = 40;
        const height = top + 70 + 44 + 132 + 40 + (actions.length ? 30 + actions.length * button + (actions.length - 1) * gap : 0) + bottom;
        const card = this.dialog(name, height);
        let y = height / 2 - top;
        const row = (h: number) => { const centre = y - h / 2; y -= h; return centre; };
        this.label('DialogTitle', card, title, 0, row(70), 530, 70, 58, T.ink, true);
        this.label('DialogSubtitle', card, subtitle, 0, row(44), 530, 44, 28, T.muted);
        const total = this.model?.score ?? 0;
        const score = this.label('DialogScore', card, String(total), 0, row(132), 500, 132, 116, T.lamp);
        score.font = this.scoreFont!;
        if (result) this.motion.play(score.node, 'count', .8, p => {
            this.setText(score, String(Math.round(total * easeOutCubic(p))));
            const k = 1 + .1 * Math.sin(Math.PI * p); score.node.setScale(k, k, 1);
        }, .3);
        this.label('DialogStats', card, result
            ? `穿过 ${this.model?.cleared ?? 0} 个篮圈 · ${T.difficulties[this.difficulty]}最高 ${this.highScore()}` : `当前得分 · ${T.difficulties[this.difficulty]}模式`,
        0, row(40), 530, 40, 26, T.muted);
        y -= 30;
        actions.forEach((action, i) => {
            if (i) y -= gap;
            this.button(action.name, card, action.text, action.icon, 0, row(button), 530, button, !!action.primary, action.action);
        });
        // Rows settle in one after another once the card has popped.
        card.children.filter(child => child.name !== 'MoonBadge').forEach((child, i) => this.fadeIn(child, .3, .1 + i * .05, 18));
    }

    private dialog(name: string, height: number): Node {
        this.clearOverlay();
        const l = this.layout!;
        this.overlay = this.makeNode(name, this.frame!, l.width, l.height);
        this.overlay.addComponent(BlockInputEvents);
        this.overlay.addComponent(Graphics);
        this.layoutOverlay();
        const card = this.makeNode('DialogCard', this.overlay, 610, height);
        // DialogCard carries the layout scale; its Face carries the entrance pop.
        const face = this.makeNode('Face', card, 610, height);
        const g = face.addComponent(Graphics);
        g.fillColor = color(T.panel); g.strokeColor = color(T.panelLine); g.lineWidth = 2;
        g.roundRect(-305, -height / 2, 610, height, 28); g.fill(); g.stroke();
        // A faint moonlit edge along the inside of the top, never a glowing frame.
        g.strokeColor = color(T.moon, 38); g.lineWidth = 2;
        g.moveTo(-270, height / 2 - 7); g.lineTo(270, height / 2 - 7); g.stroke();
        this.sprite('MoonBadge', face, 'MoonBadge', 72, 72, 0, height / 2);
        this.layoutOverlay();
        const veil = this.entranceOpacity(this.overlay), faceOpacity = this.entranceOpacity(face);
        this.motion.play(this.overlay, 'enter', .2, p => { veil.opacity = Math.round(255 * easeOutCubic(p)); if (p >= 1) veil.destroy(); });
        this.motion.play(face, 'enter', .34, p => {
            const k = .88 + .12 * easeOutBack(p); face.setScale(k, k, 1); faceOpacity.opacity = Math.round(255 * Math.min(1, p * 2.5));
            if (p >= 1) faceOpacity.destroy();
        });
        return face;
    }

    private layoutOverlay(): void {
        if (!this.overlay || !this.layout) return;
        const l = this.layout, ready = this.overlay.name === 'ReadyOverlay';
        const height = ready ? l.stageHeight : l.height;
        this.overlay.setPosition(0, ready ? l.stageY : 0);
        this.overlay.getComponent(UITransform)!.setContentSize(l.width, height);
        if (ready && this.isPoster()) {
            // Poster: title under the top controls, controls on the bottom safe edge, hero (with its best
            // score below it) centred between. Short screens scale the whole poster down to stay in the safe area.
            const top = l.safe.topY - l.stageY - 104 * l.controlScale, bottom = l.safe.bottomY - l.stageY + 24;
            const need = 160 + 330 + 380 + 48;
            const scale = Math.min(l.controlScale, (top - bottom) / need, (l.safe.width - 28) / 640);
            const title = this.overlay.getChildByName('ReadyTitle')!, hero = this.overlay.getChildByName('ReadyHero')!;
            const controls = this.overlay.getChildByName('ReadyControls')!;
            for (const child of [title, hero, controls]) child.setScale(scale, scale, 1);
            title.setPosition(0, top - 80 * scale);
            controls.setPosition(0, bottom + 190 * scale);
            hero.setPosition(0, (top - 160 * scale + bottom + 380 * scale) / 2 + 55 * scale);
            // A dark fade rising from the bottom so the controls read over the city without a panel.
            const shade = this.overlay.getChildByName('PosterShade')!.getComponent(Graphics)!, from = bottom + 450 * scale;
            shade.clear();
            const floor = -l.stageHeight / 2, bands = 24, step = (from - floor) / bands;
            for (let i = 0; i < bands; i++) {
                shade.fillColor = color(T.veil, Math.round(190 * ((bands - i) / bands) ** 1.6));
                shade.rect(-l.width / 2, floor + i * step, l.width, step + 1); shade.fill();
            }
        } else if (ready) {
            const scale = l.controlScale, y = l.worldY;
            for (const child of this.overlay.children) {
                child.setScale(scale, scale, 1);
                if (child.name === 'StartDunk') child.setPosition(0, y - 1.8 * l.unit);
                else if (child.name === 'ReadyBest') child.setPosition(0, y - 2.42 * l.unit);
            }
        } else if (this.overlay.name === 'CountdownOverlay') {
            // The frozen round stays visible behind a light veil; the digit sets its own pop scale.
            this.overlay.getChildByName('CountdownDigit')?.setPosition(l.safe.centerX, l.safe.centerY + 40 * l.controlScale);
            const hint = this.overlay.getChildByName('CountdownHint');
            hint?.setPosition(l.safe.centerX, l.safe.centerY - 110 * l.controlScale); hint?.setScale(l.controlScale, l.controlScale, 1);
        } else {
            const card = this.overlay.getChildByName('DialogCard'), box = card?.getComponent(UITransform);
            if (card && box) {
                // The badge rises 36px above the card; the whole card always fits the safe area.
                const scale = Math.min(1, (l.safe.width - 28) / box.width, (l.safe.height - 28) / (box.height + 36));
                card.setPosition(l.safe.centerX, l.safe.centerY - 18 * scale); card.setScale(scale, scale, 1);
            }
        }
        const veil = this.overlay.getComponent(Graphics);
        if (!veil) return;
        veil.clear(); veil.fillColor = color(T.veil, this.overlay.name === 'CountdownOverlay' ? 110 : 178);
        veil.rect(-l.width / 2, -height / 2, l.width, height); veil.fill();
    }

    private clearOverlay(): void { this.overlay?.destroy(); this.overlay = undefined; this.readyBest = undefined; }
    /** Best score of each difficulty (普通, 困难, 极限). `highScore` stays the best over all three for the lobby. */
    private bestScores(): number[] {
        const raw = this.context?.services.storage.getGameData(this.context.gameId)?.custom?.dunkBest;
        return Array.isArray(raw) && raw.length === 3 && raw.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
            ? raw.map(n => Math.floor(n as number)) : [0, 0, 0];
    }
    /** Before per-difficulty records there was a single best; it moves to the difficulty that was selected. */
    private migrateBestScores(): void {
        const data = this.context?.services.storage.getGameData(this.context.gameId);
        if (!data || Array.isArray(data.custom?.dunkBest)) return;
        const best = [0, 0, 0]; best[this.difficulty] = data.highScore ?? 0;
        this.writeCustom({ dunkBest: best });
    }
    private highScore(): number { return this.bestScores()[this.difficulty]; }
    private persistHighScore(): void {
        if (!this.context || !this.model) return;
        const best = this.bestScores();
        if (this.model.score <= best[this.difficulty]) return;
        best[this.difficulty] = this.model.score;
        const storage = this.context.services.storage, saved = storage.getGameData(this.context.gameId);
        storage.writeGameData(this.context.gameId, { ...(saved ?? { dataVersion: 1, playCount: 0 }),
            highScore: Math.max(saved?.highScore ?? 0, this.model.score), custom: { ...saved?.custom, dunkBest: best } });
    }
    private setText(label: Label | undefined, text: string): void { if (label && label.string !== text) label.string = text; }

    private makeNode(name: string, parent: Node, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = parent.layer; parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height); node.setPosition(x, y); return node;
    }

    private label(name: string, parent: Node, text: string, x: number, y: number, width: number,
        height: number, size: number, fill: string, bold = false): Label {
        const node = this.makeNode(name, parent, width, height, x, y), label = node.addComponent(Label);
        label.string = text; label.fontSize = size; label.lineHeight = size + 8; label.color = color(fill);
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.enableWrapText = false; setLabelBold(label, bold); return label;
    }

    private sprite(name: string, parent: Node, frame: string, width: number, height: number, x = 0, y = 0, fill: string = T.white): Sprite {
        const node = this.makeNode(name, parent, width, height, x, y), sprite = node.addComponent(Sprite);
        // CUSTOM before the frame: assigning a frame in TRIMMED mode would resize the node to the atlas frame.
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.frames![frame];
        node.getComponent(UITransform)!.setContentSize(width, height); sprite.color = color(fill); return sprite;
    }

    private button(name: string, parent: Node, text: string, icon: string, x: number, y: number, width: number,
        height: number, primary: boolean, action: () => void | Promise<void>, radius = 22): Node {
        const node = this.makeNode(name, parent, width, height, x, y), face = this.makeNode('Face', node, width, height);
        this.plate(face, width, height, primary, radius);
        const fill = primary ? T.inkDark : T.ink, size = height >= 90 ? 38 : height >= 80 ? 32 : height > 65 ? 30 : 24;
        const iconSize = Math.round(size * 1.05);
        // Icon and text are centred as one group: measure the text at its natural width first.
        const label = this.label(name + 'Label', face, text, 0, 1, width - 76, height - 6, size, fill, true);
        const box = label.node.getComponent(UITransform)!;
        label.overflow = Label.Overflow.NONE; label.updateRenderData(true);
        const measured = Math.min(width - 76, box.width > 0 ? box.width : width - 76);
        label.overflow = Label.Overflow.SHRINK; box.setContentSize(measured, height - 6);
        const glyph = this.sprite(name + 'Icon', face, icon, iconSize, iconSize, 0, 1, fill);
        const group = iconSize + 14 + measured;
        glyph.node.setPosition(-group / 2 + iconSize / 2, 1); label.node.setPosition(-group / 2 + iconSize + 14 + measured / 2, 1);
        this.bindAction(node, action);
        return node;
    }

    /** Round HUD control (pause / back): a little moon — cream disc, brass inner ring, dark line icon. */
    private iconButton(name: string, parent: Node, icon: string, action: () => void | Promise<void>): Node {
        const size = DUNK_ICON_BUTTON, r = size / 2;
        const node = this.makeNode(name, parent, size, size + 4), face = this.makeNode('Face', node, size, size + 4);
        // The extra four pixels belong below the disc, where its shadow is drawn.
        // Match the touch bounds to that asymmetric artwork without moving the control.
        node.getComponent(UITransform)!.setAnchorPoint(.5, (r + 4) / (size + 4));
        const g = face.addComponent(Graphics);
        // A moon-cream disc on a dark drop with a brass inner ring: it stands out from the night bands.
        g.fillColor = color(T.silhouetteShade, 150); g.circle(0, -4, r); g.fill();
        g.fillColor = color(T.moon); g.circle(0, 0, r); g.fill();
        g.strokeColor = color(T.lampDim, 150); g.lineWidth = 2.5; g.circle(0, 0, r - 5); g.stroke();
        g.strokeColor = color(T.white, 150); g.lineWidth = 3;
        g.arc(0, 0, r - 10, Math.PI * .28, Math.PI * .72, true); g.stroke();
        this.sprite(name + 'Icon', face, icon, 32, 32, 0, 0, T.inkDark);
        this.bindAction(node, action);
        return node;
    }

    /** Tap handling plus press feedback: the face dips to 94 % on touch and springs back on release. */
    private bindAction(node: Node, action: () => void | Promise<void>): void {
        node.addComponent(BlockInputEvents);
        const face = node.getChildByName('Face');
        const release = () => {
            if (!face?.isValid) return;
            const from = face.scale.x;
            this.motion.play(face, 'press', .26, p => { const k = from + (1 - from) * easeOutBack(p); face.setScale(k, k, 1); });
        };
        if (face) {
            node.on(Node.EventType.TOUCH_START, () => this.motion.play(face, 'press', .08, p => {
                const k = 1 - .06 * easeOutCubic(p); face.setScale(k, k, 1); }), this);
            node.on(Node.EventType.TOUCH_CANCEL, release, this);
        }
        node.on(Node.EventType.TOUCH_END, () => {
            release();
            if (this.state === 'disposed') return;
            const result = action();
            if (result) void result.catch(error => console.error('[FlappyDunk] UI action failed', error));
        }, this);
    }

    private plate(node: Node, width: number, height: number, primary: boolean, radius: number): void {
        const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
        g.clear();
        if (primary) {
            // Lamp-yellow face over a 4px warm-brass thickness.
            g.fillColor = color(T.lampDim); g.roundRect(-width / 2, -height / 2 - 4, width, height, radius); g.fill();
            g.fillColor = color(T.lamp); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
        } else {
            g.fillColor = color(T.secondary); g.strokeColor = color(T.panelLine); g.lineWidth = 1.5;
            g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); g.stroke();
        }
    }
}

/** Cocos setters copy colours. Reuse one scratch colour per palette entry, never mutate renderer colours in place. */
const colors = new Map<string, Color>();
function color(hex: string, alpha = 255): Color {
    let result = colors.get(hex);
    if (!result) { result = Color.fromHEX(new Color(), hex); colors.set(hex, result); }
    result.a = alpha; return result;
}
