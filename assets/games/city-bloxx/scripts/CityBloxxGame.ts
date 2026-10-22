import { _decorator, Camera, Canvas, Color, Component, EffectAsset, EventTouch, JsonAsset,
    Node, SpriteAtlas, SpriteFrame, Texture2D, TTFFont, UITransform, view } from 'cc';
import type { GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext, MiniGamePauseModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { AdService } from '../../../services/ads/AdService';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { CityBloxxModel, type CityConfig } from './CityBloxxModel';
import { CITY_ASSETS, CityBloxxView, type CityBuildingData, type CityGroundData } from './CityBloxxView';
import { CityBloxxScenery, type CityEnvironment } from './CityBloxxScenery';
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
    private audioBank?: BundleAudioBank;
    private unsubscribe?: Unsubscribe;
    private skyCamera?: Camera;
    private skyFrame?: SpriteFrame;
    private stage?: Node;
    private ui?: CityBloxxHud;
    private messageTime = 0;
    private skin: 'yellow' | 'blue' = 'yellow';
    private rewardPending = false;
    private operation = 0;
    private finalized = false;
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
        const [rules, buildings, groundData, coral, blue, lobby, groundTexture, sky, environment, atlas, hudFont,
            particleEffect, trailLine, trailMask, rainLine] = await Promise.all([
            assets.loadAsset(CITY_ASSETS, 'configs/original', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'configs/buildings', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'configs/ground', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/floor-coral/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/floor-blue/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/floor-lobby/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/ground/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/city/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'configs/sunlit-environment', JsonAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/sunlit/city-sunlit', SpriteAtlas),
            assets.loadAsset(CITY_ASSETS, 'fonts/native-hud', TTFFont),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/city-particles', EffectAsset),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/star-trail-line/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/star-trail-mask/texture', Texture2D),
            assets.loadAsset(CITY_ASSETS, 'visual/effects/rain-line/texture', Texture2D),
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
            groundData.json as CityGroundData[], this.config.camera);
        this.skyFrame = assets.trackRuntimeAsset(CITY_ASSETS, new SpriteFrame()); this.skyFrame.texture = sky;
        const camera = this.make('CitySkyCamera', this.node, 1, 1); camera.layer = SKY_LAYER; camera.setPosition(0, 0, 1000);
        this.skyCamera = camera.addComponent(Camera); this.skyCamera.projection = Camera.ProjectionType.ORTHO;
        this.skyCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR; this.skyCamera.clearColor = new Color('#C7EAF4');
        this.skyCamera.visibility = SKY_LAYER; this.skyCamera.priority = -10; this.skyCamera.near = .1; this.skyCamera.far = 2000;
        this.scenery = new CityBloxxScenery(this.node, this.renderer.projection, atlas, this.skyFrame, environment.json as CityEnvironment, SKY_LAYER,
            (x, y, z) => this.renderer!.project(x, y, z), assets, particleEffect, trailLine, trailMask, rainLine);
        this.stage = this.make('CityPlayArea', this.node, 750, 1334);
        this.stage.on(Node.EventType.TOUCH_START, this.onTouch, this);
        this.ui = new CityBloxxHud(this.node, atlas, hudFont, run => {
            if (!this.rewardPending) run();
        }, () => { if (this.state === 'playing') this.context?.requestPause(); }, (environment.json as CityEnvironment).hud,
        (x, y, z) => this.renderer!.project(x, y, z));
        this.scenery.placeBelowEffects(this.ui.notice);
        this.reset(); this.state = 'ready';
        // Retain the native music; the approved feedback pass adds short,
        // deterministic cues without consuming the simulation's random stream.
        this.audioBank = new BundleAudioBank({ bundle: CITY_ASSETS, music: 'audio/endless-music',
            packedEffects: 'visual/audio/city-feedback-v1', pooledCues: ['drop', 'merge', 'chain', 'milestone'],
            cues: { drop: 'feedback/land',
                merge: Array.from({ length: 7 }, (_, i) => 'feedback/perfect-' + i),
                chain: ['feedback/combo-3', 'feedback/combo-5', 'feedback/combo-10'], milestone: 'feedback/bank' },
        }, context.services.audio, context.services.feedback, assets);
        await this.audioBank.initialize();
        if (!this.context || !this.isValid) return;
        view.on('canvas-resize', this.onResize, this); this.unsubscribe = context.services.platform.onLayoutChange(this.onResize);
        this.layout();
    }
    begin(): void { if (this.state === 'ready') { this.state = 'playing'; this.hint('点击屏幕，放下楼层'); } }
    isGameplayActive(): boolean { return this.state === 'playing' && !this.rewardPending; }
    pause(): boolean {
        if (this.state !== 'playing' && this.state !== 'result') return false;
        this.pausedFrom = this.state;
        this.state = 'paused'; this.audioBank?.stopEffects(); this.context?.services.audio.pauseMusic(); return true;
    }
    resume(): void { if (this.state === 'paused') { this.state = this.pausedFrom; this.context?.services.audio.resumeMusic(); } }
    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.state === 'disposed') return;
        this.operation++; this.rewardPending = false; if (context) this.context = context;
        this.reset(); this.audioBank?.restartMusic(); this.state = 'playing'; this.hint('点击屏幕，放下楼层');
        this.context?.services.audio.resumeMusic();
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.state = 'disposed'; this.operation++; this.rewardPending = false;
        view.off('canvas-resize', this.onResize, this); this.unsubscribe?.(); this.unsubscribe = undefined;
        this.stage?.off(Node.EventType.TOUCH_START, this.onTouch, this);
        this.context?.services.audio.stopMusic(); this.model?.dispose(); this.model = undefined;
        this.audioBank?.dispose(); this.audioBank = undefined;
        this.renderer?.dispose(); this.renderer = undefined;
        this.scenery?.dispose(); this.scenery = undefined;
        if (this.skyFrame) this.context?.services.assets.releaseRuntimeAsset(this.skyFrame);
        this.skyFrame = undefined; this.config = undefined;
        this.ui?.dispose(); this.ui = undefined;
        this.node.children.slice().forEach(child => child.destroy()); this.skyCamera = undefined;
        this.stage = undefined;
        this.context = undefined; if (this.loading) await this.loading.catch(() => undefined);
    }
    showPauseMenu(menu: MiniGamePauseModel): void {
        this.pauseMenuVisible = true;
        if (this.pausedFrom === 'result') {
            this.ui?.dialog('暂时离开', '本局成绩已保留。', [
                { name: 'CityResume', text: '返回成绩', run: () => { void menu.resume(); } },
            ]);
            return;
        }
        this.ui?.dialog('暂停施工', '大楼会停在这里，准备好再继续。', [
            { name: 'CityResume', text: '继续建造', run: () => { void menu.resume(); } },
            { name: 'CityRestart', text: '重新开始', secondary: true, run: () => { void menu.restart(); } },
            { name: 'CityLobby', text: '返回大厅', secondary: true, run: () => { void menu.exit(); } },
        ]);
    }
    hidePauseMenu(): void {
        // Achievement suspension has no pause menu; its resume must retain
        // the existing result panel. Platform suspension replaces it.
        if (!this.pauseMenuVisible) return;
        this.pauseMenuVisible = false; this.ui?.close();
        if (this.state === 'result') this.showResult();
    }
    private reset(): void {
        this.audioBank?.stopEffects();
        this.pausedFrom = 'playing'; this.pauseMenuVisible = false;
        // Draw once per new round; video revival continues the existing round.
        this.skin = Math.random() < .5 ? 'yellow' : 'blue';
        this.renderer?.setSkin(this.skin);
        this.model?.dispose(); this.model = new CityBloxxModel(this.config!); this.finalized = false;
        this.scenery?.reset(); this.ui?.reset();
        this.messageTime = 0; this.context?.reportScore(0); this.render();
    }
    private showResult(): void {
        this.ui?.result(this.model!, () => { void this.revive(); },
            () => { this.finalize(); this.context?.requestRestart(this.result()); },
            () => { this.finalize(); this.context?.requestLobby(this.result()); });
    }
    private async revive(): Promise<void> {
        const context = this.context, m = this.model;
        if (!context || !m || this.rewardPending || !m.canRevive) return;
        this.rewardPending = true; this.audioBank?.stopEffects(); const operation = ++this.operation;
        try {
            const result = await context.services.ads.showRewarded({ placement: 'city-bloxx-revive', gameId: context.gameId, sessionId: context.sessionId });
            if (operation !== this.operation || this.state === 'disposed') return;
            if (result.outcome === 'completed') {
                if (m.revive()) { this.ui?.close(); this.state = 'playing'; this.hint('生命已补满，继续向上'); }
            } else if (result.errorCode !== 'not-configured') context.services.platform.showToast('未完成视频，可稍后再试');
        } catch { if (operation === this.operation) context.services.platform.showToast('视频暂不可用，请稍后再试'); }
        finally { if (operation === this.operation) this.rewardPending = false; }
    }
    private onTouch(event: EventTouch): void {
        event.propagationStopped = true;
        if (this.state !== 'playing' || this.rewardPending) return;
        this.model?.release();
    }
    update(dt: number): void {
        if ((this.state !== 'playing' && this.state !== 'result') || this.rewardPending || !this.model) return;
        this.ui?.advance(dt);
        this.scenery?.advance(dt);
        this.model.advance(dt);
        for (const event of this.model.events.splice(0)) {
            this.scenery?.event(event, this.model);
            if (event.type === 'land') {
                this.ui?.land(event, this.model);
                const feedback = this.context?.services.feedback;
                if (event.floor.base || !event.perfect) feedback?.play('drop', { vibrate: false, volume: .8 });
                else if (cityComboMilestone(this.model.combo)) feedback?.play('chain', {
                    variant: cityComboStage(this.model.combo).level - 1, vibrate: false, volume: .85 });
                else feedback?.play('merge', { variant: cityPerfectTone(this.model.combo), vibrate: false, volume: .8 });
                this.context?.reportScore(this.model.maxFloors); this.saveBest();
            } else if (event.type === 'bonus') {
                this.ui?.showBonus(event.people);
                if (event.people > 0) this.context?.services.feedback.play('milestone', { vibrate: false, volume: .7 });
            }
            else if (event.type === 'result') { this.saveBest(); this.state = 'result'; this.showResult(); }
        }
        this.messageTime = Math.max(0, this.messageTime - dt); this.render();
    }
    lateUpdate(): void {
        // Cocos emits canvas-resize before Fit Width and Canvas have finished updating their transforms.
        if (this.layoutDirty && this.state !== 'disposed') { this.layoutDirty = false; this.layout(); }
    }
    private render(): void {
        const m = this.model; if (!m) return;
        this.renderer?.update(m);
        this.scenery?.update(m);
        if (this.ui) this.ui.update(m, this.scenery?.skyColorAt(this.ui.top.position.y - 38 * this.ui.top.scale.y));
        if (this.ui) this.ui.hint.node.active = this.state === 'playing' && !this.ui.modal
            && (this.messageTime > 0 || m.phase === 'swing');
    }
    private hint(text: string): void { if (this.ui) this.ui.hint.string = text; this.messageTime = 2; }
    private saveBest(): void {
        const c = this.context, m = this.model; if (!c || !m) return;
        const old = c.services.storage.getGameData(c.gameId) ?? { dataVersion: 1, playCount: 0 };
        const custom = { ...old.custom };
        delete custom.cityCoins;
        c.services.storage.writeGameData(c.gameId, { ...old, highScore: Math.max(old.highScore ?? 0, m.maxFloors),
            custom: { ...custom, cityBestPeople: Math.max(Number(old.custom?.cityBestPeople) || 0, m.people),
                cityBestCombo: Math.max(Number(old.custom?.cityBestCombo) || 0, m.maxCombo) } });
    }
    private finalize(): void {
        if (this.finalized) return;
        this.finalized = true; this.model?.finish(); this.saveBest();
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
        this.renderer?.layout(size.width, size.height, safe.bottomY, safe.topY);
        this.scenery?.layout(size.width, size.height, safe.bottomY, safe.topY);
        this.skyCamera!.orthoHeight = size.height / 2;
        this.ui.layout(size, safe); this.render();
    };
    private make(name: string, parent: Node, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n); n.addComponent(UITransform).setContentSize(w, h); return n;
    }
}
