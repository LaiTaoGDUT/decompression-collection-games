import { _decorator, AudioClip, Camera, Canvas, Color, Component, director, Director, EffectAsset, EventTouch, JsonAsset,
    Node, SpriteAtlas, Texture2D, TTFFont, UITransform, view } from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService, AudioVoiceScope } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { AdService } from '../../../services/ads/AdService';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { CityBloxxModel, type CityConfig } from './CityBloxxModel';
import type { CityRainState } from './CityBloxxRain';
import { CITY_ASSETS, CityBloxxView, type CityBuildingData } from './CityBloxxView';
import { CityBloxxScenery, type CityEnvironment } from './CityBloxxScenery';
import type { CitySkyPanels } from './CityBloxxSky';
import { CityBloxxHud } from './CityBloxxHud';
import { cityComboMilestone, cityComboStage, cityPerfectTone } from './CityBloxxFeedback';

const { ccclass } = _decorator;
const SKY_LAYER = 1 << 20;
interface Services { assets: AssetService; platform: Platform; audio: AudioService; feedback: FeedbackService; storage: StorageService; ads: AdService; }
type State = 'idle' | 'ready' | 'playing' | 'paused' | 'result' | 'disposed';

@ccclass('CityBloxxGame')
export class CityBloxxGame extends Component implements MiniGame<Services> {
    private context?: MiniGameContext<Services>;
    private state: State = 'idle';
    private pausedFrom: 'playing' | 'result' = 'playing';
    private pauseMenuVisible = false;
    private config?: CityConfig;
    private model?: CityBloxxModel;
    private renderer?: CityBloxxView;
    private scenery?: CityBloxxScenery;
    private loading?: Promise<void>;
    private finishWarmup?: () => void;
    private audioBank?: BundleAudioBank;
    private rainClip?: AudioClip;
    private rainVoice?: AudioVoiceScope;
    private unsubscribe?: Unsubscribe;
    private skyCamera?: Camera;
    private stage?: Node;
    private ui?: CityBloxxHud;
    private skin: 'yellow' | 'blue' = 'yellow';
    private rewardPending = false;
    private operation = 0;
    private finalized = false;
    private discardRound = false;
    private bounds?: ReturnType<typeof calculateSafeContentBounds>;
    private layoutDirty = false;
    private readonly onResize = (): void => { this.layoutDirty = true; };

    async initialize(context: MiniGameContext<Services>): Promise<void> {
        if (this.state !== 'idle') throw Error('City Bloxx already initialized');
        this.context = context;
        this.loading = this.prepare(context);
        try { await this.loading; } finally { this.loading = undefined; }
    }
    private async prepare(context: MiniGameContext<Services>): Promise<void> {
        const assets = context.services.assets;
        const [rules, buildings, coral, blue, lobby, groundTexture, environment, atlas, hudFont,
            particleEffect, trailLine, trailMask, rainLine, skyline, skyPanels, hudAtlas, fxAtlas] = await Promise.all([
            assets.loadAsset(CITY_ASSETS, 'configs/original', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'configs/buildings', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/cloudline/floor-coral/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/cloudline/floor-blue/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/cloudline/floor-lobby/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/cloudline/pavers/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'configs/cloudline-environment', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/city-sunlit', SpriteAtlas),
            assets.loadAsset(CITY_ASSETS, 'fonts/native-hud', TTFFont),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/city-particles', EffectAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/star-trail-line/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/star-trail-mask/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/rain-line/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/skyline/city-skyline/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'configs/sky-panels', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/hud/city-hud', SpriteAtlas),
            assets.loadAsset(CITY_ASSETS, 'visual/fx/city-fx', SpriteAtlas),
        ]);
        if (this.state === 'disposed' || !this.isValid) return;
        this.config = rules.json as CityConfig;
        if (!this.config.curves?.NormalLoop || this.config.houseDropSpeed !== 8) throw Error('Invalid City Bloxx Endless data');
        const canvas = this.node.parent?.getComponent(Canvas), uiCamera = canvas?.cameraComponent;
        if (!uiCamera) throw Error('City Bloxx Canvas camera is missing');
        uiCamera.priority = 10; uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        this.renderer = new CityBloxxView(this.node.scene, this.node, assets,
            buildings.json as CityBuildingData,
            { house_yellow_m: coral, blue_house: blue, house_yellow_B: lobby, ground: groundTexture },
            this.config.camera);
        const camera = this.make('CitySkyCamera', this.node, 1, 1); camera.layer = SKY_LAYER; camera.setPosition(0, 0, 1000);
        this.skyCamera = camera.addComponent(Camera); this.skyCamera.projection = Camera.ProjectionType.ORTHO;
        this.skyCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR; this.skyCamera.clearColor = new Color('#C7EAF4');
        this.skyCamera.visibility = SKY_LAYER; this.skyCamera.priority = -10; this.skyCamera.near = .1; this.skyCamera.far = 2000;
        this.scenery = new CityBloxxScenery(this.node, this.renderer.projection, atlas, skyline, environment.json as CityEnvironment, SKY_LAYER,
            (x, y, z, out) => this.renderer!.project(x, y, z, out), assets, particleEffect, trailLine, trailMask, rainLine,
            skyPanels.json as CitySkyPanels, fxAtlas,
            (floor, left, right) => this.renderer!.projectRoof(floor, left, right));
        this.stage = this.make('CityPlayArea', this.node, 750, 1334);
        this.stage.on(Node.EventType.TOUCH_START, this.onTouch, this);
        const feedback = context.services.feedback;
        this.ui = new CityBloxxHud(this.node, atlas, hudAtlas, fxAtlas, hudFont, run => {
            if (!this.rewardPending) { feedback.play('uiButton', { vibrate: false, volume: .8 }); run(); }
        }, () => {
            if (this.state !== 'playing') return;
            feedback.play('uiButton', { vibrate: false, volume: .8 }); this.context?.requestPause();
        }, () => feedback.play('popup', { vibrate: false, volume: .85 }),
        (x, y, z) => this.renderer!.project(x, y, z));
        this.scenery.placeBelowEffects(this.ui.notice);
        this.reset(true); this.state = 'ready';
        // Cues are deterministic and never consume the simulation's random stream.
        this.audioBank = new BundleAudioBank({ bundle: CITY_ASSETS, music: 'audio/skyward-loop',
            packedEffects: 'visual/audio/city-feedback-v2',
            cues: { fold: 'feedback/release', drop: ['feedback/land', 'feedback/foundation'],
                merge: Array.from({ length: 8 }, (_, i) => 'feedback/perfect-' + i),
                chain: ['feedback/combo-3', 'feedback/combo-5', 'feedback/combo-10'], milestone: 'feedback/bonus',
                popup: 'feedback/zone', collision: 'feedback/miss', failure: 'feedback/result',
                continue: 'feedback/revive', uiButton: 'feedback/button' },
        }, context.services.audio, context.services.feedback, assets);
        await Promise.all([this.audioBank.initialize(), this.scenery.sky.preload(),
            assets.loadAudioClip(CITY_ASSETS, 'audio/rain-loop').then(clip => {
                if (this.state !== 'disposed') this.rainClip = clip;
            })]);
        if (!this.context || !this.isValid) return;
        this.rainVoice = context.services.audio.createVoiceScope('music');
        view.on('canvas-resize', this.onResize, this); this.unsubscribe = context.services.platform.onLayoutChange(this.onResize);
        this.layout();
        await this.warmup();
    }
    private warmup(): Promise<void> {
        const retireWorld = this.renderer!.warmup(), retireScenery = this.scenery!.warmup(), retireHud = this.ui!.warmup();
        return new Promise(resolve => {
            let frames = 0, finished = false;
            const finish = (): void => {
                if (finished) return;
                finished = true; clearTimeout(timeout);
                director.off(Director.EVENT_AFTER_DRAW, afterDraw);
                this.finishWarmup = undefined; retireWorld(); retireScenery(); retireHud(); resolve();
            };
            const afterDraw = (): void => { if (++frames >= 2) finish(); };
            // Backgrounded views may stop drawing. Runtime cancellation waits for initialize,
            // so prewarming must settle even before dispose can be called.
            const timeout = setTimeout(finish, 250);
            this.finishWarmup = finish; director.on(Director.EVENT_AFTER_DRAW, afterDraw);
        });
    }
    begin(): void {
        if (this.state !== 'ready') return;
        this.state = 'playing';
        this.startWeatherAudio();
        this.persistRound();
        // Historical floor records also qualify when the trophy is introduced or a cloud save is restored.
        const context = this.context!;
        context.reportAchievementProgress('tower-floors', context.services.storage.getGameData(context.gameId)?.highScore ?? 0);
    }
    isGameplayActive(): boolean { return this.state === 'playing' && !this.rewardPending; }
    pause(): boolean {
        if (this.state !== 'playing' && this.state !== 'result') return false;
        this.pausedFrom = this.state;
        this.state = 'paused'; this.audioBank?.stopEffects(); this.context?.services.audio.pauseMusic();
        this.persistRound(true); return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.pausedFrom; this.context?.services.audio.resumeMusic();
        this.startWeatherAudio();
    }
    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.state === 'disposed') return;
        this.operation++; this.rewardPending = false; if (context) this.context = context;
        this.reset(); this.audioBank?.restartMusic(); this.state = 'playing';
        this.persistRound(true);
        this.context?.services.audio.resumeMusic();
        this.startWeatherAudio();
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        // A failed/cancelled initialization must not overwrite the previous round.
        if (this.state === 'playing' || this.state === 'paused' || this.state === 'result') this.persistRound(true);
        this.state = 'disposed'; this.operation++; this.rewardPending = false;
        this.finishWarmup?.();
        view.off('canvas-resize', this.onResize, this); this.unsubscribe?.(); this.unsubscribe = undefined;
        this.stage?.off(Node.EventType.TOUCH_START, this.onTouch, this);
        this.context?.services.audio.stopMusic(); this.model?.dispose(); this.model = undefined;
        this.audioBank?.dispose(); this.audioBank = undefined;
        this.rainVoice?.dispose(); this.rainVoice = undefined; this.rainClip = undefined;
        this.renderer?.dispose(); this.renderer = undefined;
        this.scenery?.dispose(); this.scenery = undefined;
        this.config = undefined;
        this.ui?.dispose(); this.ui = undefined;
        this.node.children.slice().forEach(child => child.destroy()); this.skyCamera = undefined;
        this.stage = undefined;
        this.context = undefined; if (this.loading) await this.loading.catch(() => undefined);
    }
    showPauseMenu(menu: MiniGamePauseModel): void {
        this.pauseMenuVisible = true;
        if (this.pausedFrom === 'result') {
            this.ui?.pause([
                { name: 'CityResume', icon: 'play', run: () => { void menu.resume(); } },
            ]);
            return;
        }
        this.ui?.pause([
            { name: 'CityResume', icon: 'play', run: () => { void menu.resume(); } },
            { name: 'CityRestart', icon: 'retry', run: () => { void menu.restart(); } },
            { name: 'CityLobby', icon: 'home', run: () => { void menu.exit(); } },
        ]);
    }
    hidePauseMenu(): void {
        // Achievement suspension has no pause menu; its resume must retain
        // the existing result panel. Platform suspension replaces it.
        if (!this.pauseMenuVisible) return;
        this.pauseMenuVisible = false; this.ui?.close();
        if (this.state === 'result') this.showResult();
    }
    discardSavedProgress(): void { this.discardRound = true; this.persistRound(true); }
    private reset(restore = false): void {
        this.audioBank?.stopEffects();
        this.rainVoice?.stop();
        this.pausedFrom = 'playing'; this.pauseMenuVisible = false;
        const saved = restore ? this.context?.services.storage.getGameData(this.context.gameId)?.custom?.cityRound : undefined;
        const round = saved && typeof saved === 'object'
            ? saved as { version?: number; model?: unknown; skin?: string; weather?: CityRainState } : undefined;
        const weather = round?.weather;
        const validAppearance = round?.version === 1 && (round.skin === 'yellow' || round.skin === 'blue')
            && weather && typeof weather.enabled === 'boolean' && typeof weather.clock === 'number'
            && Number.isFinite(weather.clock) && weather.clock >= 0;
        const resumed = validAppearance ? CityBloxxModel.restore(this.config!, round.model) : undefined;
        this.discardRound = false;
        // Draw once per new round; lobby continuation and video revival retain it.
        this.skin = resumed ? round!.skin as 'yellow' | 'blue' : Math.random() < .5 ? 'yellow' : 'blue';
        this.renderer?.setSkin(this.skin);
        this.model?.dispose(); this.model = resumed ?? new CityBloxxModel(this.config!); this.finalized = false;
        this.scenery?.reset(resumed ? weather : undefined, resumed); this.ui?.reset();
        this.context?.reportScore(this.model.maxFloors); this.render();
    }
    private startWeatherAudio(): void {
        if (!this.scenery?.isRaining || !this.rainClip || !this.rainVoice || this.rainVoice.playing) return;
        // One owned loop under the music slider, alongside the soundtrack.
        // The audio service handles menu/ad/background suspension and volume.
        this.rainVoice.play(this.rainClip, .5, true);
    }
    private showResult(): void {
        this.ui?.result(this.model!, () => { void this.revive(); },
            () => { this.finalize(); this.context?.requestRestart(this.result()); },
            () => { this.finalize(); this.context?.requestLobby(this.result()); });
    }
    private async revive(): Promise<void> {
        const context = this.context, m = this.model;
        if (!context || !m || this.rewardPending || !m.canRevive) return;
        this.rewardPending = true; this.ui?.setRewardPending(true);
        this.audioBank?.stopEffects(); const operation = ++this.operation;
        try {
            const result = await context.services.ads.showRewarded({ placement: 'city-bloxx-revive', gameId: context.gameId, sessionId: context.sessionId });
            if (operation !== this.operation || this.state === 'disposed') return;
            if (result.outcome === 'completed') {
                if (m.revive()) {
                    // The HUD clock is frozen during the video. Retire the
                    // previous miss/landing feedback before play resumes.
                    this.ui?.reset(); this.ui?.revived(); this.state = 'playing';
                    this.persistRound(true);
                }
            } else if (!result.feedbackShown) {
                context.services.platform.showToast(result.outcome === 'skipped'
                    ? '未完成视频，可稍后再试' : '视频暂不可用，请稍后再试');
            }
        } catch { if (operation === this.operation) context.services.platform.showToast('视频暂不可用，请稍后再试'); }
        finally {
            if (operation === this.operation) { this.rewardPending = false; this.ui?.setRewardPending(false); }
        }
    }
    private onTouch(event: EventTouch): void {
        event.propagationStopped = true;
        if (this.state !== 'playing' || this.rewardPending) return;
        this.model?.release();
    }
    update(dt: number): void {
        if (this.rewardPending) { this.ui?.advanceLoading(dt); return; }
        if ((this.state !== 'playing' && this.state !== 'result') || !this.model) return;
        this.ui?.advance(dt);
        this.scenery?.advance(dt);
        this.model.advance(dt);
        let saveRound = false;
        for (const event of this.model.events) {
            this.scenery?.event(event, this.model);
            if (event.type === 'land') {
                this.ui?.land(event, this.model);
                const feedback = this.context?.services.feedback;
                if (event.floor.base || !event.perfect) feedback?.play('drop', {
                    variant: event.floor.base ? 1 : 0, vibrate: false, volume: .85 });
                else if (cityComboMilestone(this.model.combo)) feedback?.play('chain', {
                    variant: cityComboStage(this.model.combo).level - 1, vibrate: false, volume: .85 });
                else feedback?.play('merge', { variant: cityPerfectTone(this.model.combo), vibrate: false, volume: .8 });
                this.context?.reportScore(this.model.maxFloors); this.saveBest();
                this.context?.reportAchievementProgress('tower-floors', this.model.maxFloors);
            } else if (event.type === 'bonus') {
                this.ui?.showBonus(event.people);
                if (event.people > 0) this.context?.services.feedback.play('milestone', { vibrate: false, volume: .7 });
            }
            else if (event.type === 'release') this.context?.services.feedback.play('fold', { vibrate: false, volume: .7 });
            else if (event.type === 'miss') {
                this.ui?.miss(event.lives); this.context?.services.feedback.play('collision', { volume: .9 });
                saveRound = event.lives === 0;
            } else if (event.type === 'revive') this.context?.services.feedback.play('continue', { vibrate: false, volume: .9 });
            else if (event.type === 'result') {
                this.saveBest(); this.state = 'result'; this.showResult();
                this.context?.services.feedback.play('failure', { vibrate: false, volume: .9 });
            }
        }
        this.model.events.length = 0;
        if (saveRound) this.persistRound();
        this.render();
    }
    lateUpdate(): void {
        // Cocos emits canvas-resize before Fit Width and Canvas have finished updating their transforms.
        if (this.layoutDirty && this.state !== 'disposed') { this.layoutDirty = false; this.layout(); }
    }
    private render(): void {
        const m = this.model; if (!m) return;
        this.renderer?.update(m);
        this.scenery?.update(m);
        this.ui?.update(m);
    }
    private saveBest(): void {
        const c = this.context, m = this.model; if (!c || !m) return;
        const old = c.services.storage.getGameData(c.gameId) ?? { dataVersion: 1, playCount: 0 };
        const highScore = Math.max(old.highScore ?? 0, m.maxFloors);
        const bestPeople = Math.max(Number(old.custom?.cityBestPeople) || 0, m.people);
        const bestCombo = Math.max(Number(old.custom?.cityBestCombo) || 0, m.maxCombo);
        if (old.highScore === highScore && old.custom?.cityBestPeople === bestPeople
            && old.custom?.cityBestCombo === bestCombo && !Object.prototype.hasOwnProperty.call(old.custom ?? {}, 'cityCoins')) return;
        const custom = { ...old.custom };
        delete custom.cityCoins;
        c.services.storage.writeGameData(c.gameId, { ...old, highScore,
            custom: { ...custom, cityBestPeople: bestPeople, cityBestCombo: bestCombo } });
    }
    private persistRound(flush = false): void {
        const c = this.context;
        if (!c || !this.model || !this.scenery) return;
        // Snapshot at lifecycle boundaries, not on a gameplay timer: serializing
        // an endless tower during ordinary movement would introduce frame spikes.
        const snapshot = this.discardRound || this.finalized ? undefined : this.model.snapshot();
        const old = c.services.storage.getGameData(c.gameId) ?? { dataVersion: 1, playCount: 0 };
        if (!snapshot && !old.custom?.cityRound) return;
        const custom = { ...old.custom };
        if (snapshot) custom.cityRound = { version: 1, model: snapshot, skin: this.skin, weather: this.scenery.weather };
        else delete custom.cityRound;
        try {
            c.services.storage.writeGameData(c.gameId, { ...old, custom });
            if (flush) c.services.storage.flush();
        } catch (error: unknown) { console.warn('[CityBloxx] Save failed', error); }
    }
    private finalize(): void {
        if (this.finalized) return;
        this.finalized = true; this.model?.finish(); this.saveBest();
        this.persistRound(true);
        this.context?.reportRoundFinished?.();
    }
    private result(): GameResult { const m = this.model; return { score: m?.maxFloors ?? 0, duration: m?.time ?? 0,
        completed: this.finalized, extra: { floors: m?.tower ?? 0, residents: m?.people ?? 0, combo: m?.maxCombo ?? 0 } }; }
    private layout = (): void => {
        if (!this.context || !this.skyCamera || !this.stage || !this.ui) return;
        const size = view.getVisibleSize(), safe = this.bounds = calculateSafeContentBounds(size.width, size.height, this.context.services.platform.getLayoutInfo());
        this.node.getComponent(UITransform)?.setContentSize(size);
        this.stage.setPosition(safe.centerX, safe.centerY); this.stage.getComponent(UITransform)!.setContentSize(safe.width, safe.height);
        // Skin-only: the HUD overlays the original safe viewport. Subtracting
        // card margins here would change the apparent speed and aiming scale.
        this.renderer?.layout(size.width, safe.bottomY, safe.topY, -size.height / 2);
        this.scenery?.layout(size.width, size.height, safe.bottomY, safe.topY);
        this.skyCamera!.orthoHeight = size.height / 2;
        this.ui.layout(size, safe); this.render();
    };
    private make(name: string, parent: Node, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform).setContentSize(w, h); return n;
    }
}
