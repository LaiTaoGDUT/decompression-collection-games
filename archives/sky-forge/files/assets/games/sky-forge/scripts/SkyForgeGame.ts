import { _decorator, Camera, Canvas, Component, EventTouch, Graphics, Node, ResolutionPolicy, UITransform, Vec3, view } from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { AnalyticsService } from '../../../services/analytics/AnalyticsService';
import { AdService, AD_PLACEMENTS } from '../../../services/ads/AdService';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import { SfCombat } from './core/SfCombat';
import { SfProgress, SAVE_VERSION, sanitizeSave } from './core/SfProgress';
import { levelById } from './core/SfLevels';
import { endlessSector } from './core/SfEndless';
import { SfEndlessRestore, SfEndlessRun } from './core/SfEndlessRun';
import { BOSS_INFO } from './core/SfBosses';
import { PLANES, PLANE_BY_ID } from './core/SfPlaneDefs';
import { PLANE_ART } from './core/SfPlaneArt';
import { heartsForLevel } from './core/SfBalance';
import type { CombatEvent } from './core/SfTypes';
import type { LevelDef } from './core/SfLevelTypes';
import { SfAssets } from './view/SfAssets';
import { SfAudio, BOOT_AUDIO } from './view/SfAudio';
import { SfCombatView } from './view/SfCombatView';
import { SfHud } from './view/SfHud';
import { SfHangar } from './view/SfHangar';
import { SfPlaneReward } from './view/SfPlaneReward';
import { ReportScreen, SfMap, SfPause, SfResult, SfRevive } from './view/SfMenus';
import { SfGuide } from './view/SfGuide';
import { SfLaunch } from './view/SfLaunch';
import { SfCinematic } from './view/SfCinematic';
import { showcaseLevel } from './view/SfShowcase';
import type { SfShell } from './view/SfShell';
import { COLORS, Tweens, color, node, text } from './view/SfUi';

const { ccclass } = _decorator;

interface Services {
    readonly platform: Platform;
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly analytics: AnalyticsService;
    readonly ads: AdService;
}

type Screen = 'boot' | 'hangar' | 'map' | 'launch' | 'combat' | 'result';
const STEP = 1 / 60;
const GAME_ID = 'sky-forge';

/**
 * 苍穹铸翼（重做版）入口。关卡制飞机大战：机库 → 地图 → 出击 → 结算。
 * 设计见 docs/games/sky-forge/rework/DESIGN.md。
 */
@ccclass('SkyForgeGame')
export class SkyForgeGame extends Component implements MiniGame<Services> {
    readonly backgroundPausePolicy = 'menu' as const;
    private context?: MiniGameContext<Services>;
    private assets?: SfAssets;
    private audio?: SfAudio;
    private progress = new SfProgress(sanitizeSave(undefined));
    private readonly tweens = new Tweens();
    private screen: Screen = 'boot';
    private screenRoot?: Node;
    private overlayRoot?: Node;
    private fadeNode?: Graphics;
    private toastLabel?: ReturnType<typeof text>;
    private toastTime = 0;
    private hangar?: SfHangar;
    private map?: SfMap;
    private result?: SfResult;
    private planeReward?: SfPlaneReward;
    private launch?: SfLaunch;
    private cinematic?: SfCinematic;
    private combat?: SfCombat;
    private combatView?: SfCombatView;
    private hud?: SfHud;
    private pauseUi?: SfPause;
    private reviveUi?: SfRevive;
    private pauseModel?: MiniGamePauseModel;
    private inputCamera?: Camera;
    private width = 750;
    private height = 1334;
    private safeTop = 600;
    private safeBottom = -600;
    private accumulator = 0;
    private paused = false;
    private disposed = false;
    private begun = false;
    /** 正在淡出的战报界面（暂停 / 坠机），淡出完再销毁。 */
    private readonly closing: ReportScreen[] = [];
    /** 屏幕切换过渡进行中（淡入黑场 → 切换 → 淡出）。 */
    private switching = false;
    private guide?: SfGuide;
    private levelId = '1-1';
    /** 当前出击是否为无尽模式。 */
    private endless = false;
    private endlessRun?: SfEndlessRun;
    private endlessSaveTimer = 0;
    private restoring?: { job: SfEndlessRestore; resolve: () => void; reject: (error: Error) => void };
    private reviveUsed = false;
    private adBusy = false;
    private settled = false;
    private loadToken = 0;
    private pointer: number | null = null;
    private finger?: { x: number; y: number };
    private target: { x: number; y: number } | null = null;
    private touchStartAt = 0;
    private touchMoved = 0;
    private lastTap = -10;
    private clock = 0;
    private hideUnsubscribe?: () => void;

    // ───────────────────────────── 生命周期 ─────────────────────────────

    async initialize(context: MiniGameContext<Services>): Promise<void> {
        this.context = context;
        for (let parent: Node | null = this.node; parent && !this.inputCamera; parent = parent.parent) {
            this.inputCamera = parent.getComponent(Canvas)?.cameraComponent || undefined;
        }
        this.readSave();
        this.assets = new SfAssets(context.services.assets);
        this.audio = new SfAudio(context.services.audio, path => this.assets!.loadAudio(path));
        await Promise.all([this.assets.loadBoot(), this.audio.preload(BOOT_AUDIO)]);
        if (this.disposed) return;
        // 按项目基线在运行时固定设计宽度，重新计算不同像素密度下的可见高度。
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
        this.applyLayout();
        this.screenRoot = node(this.node, 'Screens', this.width, this.height);
        this.overlayRoot = node(this.node, 'Overlays', this.width, this.height);
        this.fadeNode = node(this.node, 'Fade', this.width, this.height).addComponent(Graphics);
        this.toastLabel = text(this.ui, this.node, '', 0, 0, { size: 36 });
        this.toastLabel.node.active = false;
        view.on('canvas-resize', this.applyLayout, this);
        this.hideUnsubscribe = context.services.platform.onHide(() => { this.releaseInput(); this.save(); });
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        context.services.analytics.track('sky_forge_enter', { sessionId: context.sessionId });
    }

    begin(): void {
        if (this.disposed) return;
        this.begun = true;
        this.openHangar();
    }

    pause(): boolean {
        if (!this.begun || this.disposed || this.paused) return false;
        if (this.screen !== 'combat' || !this.combat || this.combat.phase === 'done') return false;
        this.paused = true;
        this.audio?.pause();
        this.releaseInput();
        this.save();
        return true;
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.audio?.resume();
        this.releaseInput();
        this.closeReport(this.pauseUi);
        this.pauseUi = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.pauseModel = model;
        this.pauseUi?.dispose();
        const c = this.combat;
        this.pauseUi = new SfPause(this.shell, this.overlayRoot!, {
            endless: this.endless, stage: this.stageText(), score: c?.score ?? 0, coins: c?.coins ?? 0,
            hp: c?.player.hp ?? 0, maxHp: c?.player.maxHp ?? 0,
        }, {
            resume: () => void model.resume(),
            restart: () => void model.restart(),
            map: () => { void model.resume().then(() => this.abandonToMap()); },
            hangar: () => {
                if (!this.paused || this.disposed) return;
                void model.resume().then(() => {
                    if (this.disposed) return;
                    this.save();
                    this.openHangar();
                });
            },
        });
    }

    hidePauseMenu(): void {
        this.closeReport(this.pauseUi);
        this.pauseUi = undefined;
    }

    /** 战报界面淡出后销毁（不生切）。 */
    private closeReport(ui?: ReportScreen): void {
        if (!ui) return;
        ui.close();
        this.closing.push(ui);
    }

    /** 报告界面副标题：关卡号与关卡名，或无尽模式段数。 */
    private stageText(): string {
        const c = this.combat;
        if (!c) return '';
        return this.endless ? `无尽模式 · 第 ${c.sector} 段 · ${Math.floor(c.distance)} 米` : `${c.level.id} · ${c.level.name}`;
    }

    async restart(context?: MiniGameContext<Services>): Promise<void> {
        if (this.disposed) return;
        if (context) this.context = context;
        this.paused = false;
        this.pauseUi?.dispose();
        this.pauseUi = undefined;
        if (this.screen === 'combat' || this.screen === 'result') this.retry();
        else this.openHangar();
    }

    discardSavedProgress(): void {
        this.endlessRun = undefined;
        delete this.progress.data.endlessRun;
        this.save();
    }

    async dispose(): Promise<void> {
        if (this.disposed) return;
        this.save();
        this.disposed = true;
        this.loadToken++;
        view.off('canvas-resize', this.applyLayout, this);
        this.hideUnsubscribe?.();
        this.hideUnsubscribe = undefined;
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this.tweens.clear();
        this.clearScreen();
        this.overlayRoot?.destroy();
        this.screenRoot?.destroy();
        this.fadeNode?.node.destroy();
        this.toastLabel?.node.destroy();
        this.audio?.dispose();
        this.audio = undefined;
        this.assets?.dispose();
        this.assets = undefined;
        this.inputCamera = undefined;
        this.context = undefined;
    }

    // ───────────────────────────── 存档 ─────────────────────────────

    private readSave(): void {
        const storage = this.context?.services.storage;
        const data = storage?.getGameData(GAME_ID);
        const save = sanitizeSave(data?.dataVersion === SAVE_VERSION ? data.custom : undefined);
        this.progress = new SfProgress(save);
        this.progress.recordEndlessDistance(save.endlessRun?.distance ?? 0);
    }

    private save(): void {
        if (!this.context || this.disposed) return;
        if (this.endless && this.screen === 'combat' && this.combat && !this.settled) {
            this.progress.recordEndlessDistance(this.combat.distance);
            if (this.endlessRun) this.progress.data.endlessRun = this.endlessRun.snapshot(this.combat, this.reviveUsed);
        }
        try {
            const storage = this.context.services.storage;
            storage.writeGameData(GAME_ID, {
                dataVersion: SAVE_VERSION,
                playCount: this.progress.data.plays,
                highScore: this.progress.data.highScore,
                lastPlayedAt: Date.now(),
                custom: this.progress.data as unknown as Record<string, unknown>,
            });
            storage.flush();
        } catch (error) {
            console.error('[SkyForge] save failed', error);
        }
    }

    // ───────────────────────────── 布局 ─────────────────────────────

    private applyLayout = (): void => {
        const visible = view.getVisibleSize();
        this.width = visible.width || 750;
        this.height = visible.height || 1334;
        this.node.getComponent(UITransform)?.setContentSize(this.width, this.height);
        const safe = calculateVerticalSafeBounds(this.height, this.context?.services.platform.getLayoutInfo(), 12);
        this.safeTop = safe.topY - 6;
        this.safeBottom = safe.bottomY + 6;
        this.layoutCombat();
        this.hud?.layout(this.width, this.height, this.safeTop, this.safeBottom);
        this.cinematic?.layout(this.width, this.height, this.safeTop, this.safeBottom);
        this.planeReward?.layout(this.width, this.height, this.safeTop, this.safeBottom);
        if (this.toastLabel) this.toastLabel.node.setPosition(0, this.safeTop - 300);
    };

    private layoutCombat(): void {
        if (!this.combatView || !this.combat) return;
        const l = this.combatView.layout(this.width, this.height, this.safeTop, this.safeBottom);
        // 玩家可活动区间：上方让出顶部 HUD；下方让机体下沿（按机体贴图半高）正好贴住底部安全区。
        const flightBottom = l.safeBottom + (PLANE_ART[this.combat.config.plane]?.size[1] ?? 130) / 2 + 4;
        if (this.endlessRun) this.endlessRun.setBounds(this.combat, -375, 375, l.fieldTop, l.fieldBottom, l.safeTop - 200, flightBottom);
        else this.combat.setBounds(-375, 375, l.fieldTop, l.fieldBottom, l.safeTop - 200, flightBottom);
    }

    private get ui() {
        const assets = this.assets!;
        return {
            frame: assets.frame,
            get numberFont() { return assets.numberFont; },
            get bankMaterial() { return assets.bankMaterial; },
            frames: assets.frames,
            click: (kind: 'tap' | 'confirm' | 'back' | 'deny') => this.audio?.play(`ui-${kind}`),
        };
    }

    private get shell(): SfShell {
        const self = this;
        return {
            ui: this.ui,
            progress: this.progress,
            tweens: this.tweens,
            width: this.width,
            height: this.height,
            safeTop: this.safeTop,
            safeBottom: this.safeBottom,
            gameRoot: this.node,
            openHangar: () => self.openHangar(),
            openMap: (chapter?: number) => self.openMap(chapter),
            startLevel: (id: string) => self.startLevel(id),
            exitToLobby: () => { self.save(); self.context?.requestLobby(); },
            save: () => self.save(),
            sfx: (key: string, volume?: number) => self.audio?.play(key, volume),
            toast: (message: string) => self.toast(message),
            startEndless: () => self.startEndless(),
        };
    }

    // ───────────────────────────── 界面切换 ─────────────────────────────

    private clearScreen(): void {
        this.audio?.endCombat();
        this.loadToken++;
        this.restoring?.reject(new Error('Endless restore cancelled'));
        this.restoring = undefined;
        this.endlessRun = undefined;
        this.planeReward?.dispose(); this.planeReward = undefined;
        this.hangar?.dispose(); this.hangar = undefined;
        this.map?.dispose(); this.map = undefined;
        this.result?.dispose(); this.result = undefined;
        this.reviveUi?.dispose(); this.reviveUi = undefined;
        this.launch?.dispose(); this.launch = undefined;
        this.cinematic?.dispose(); this.cinematic = undefined;
        this.hud?.dispose(); this.hud = undefined;
        this.combatView?.dispose(); this.combatView = undefined;
        this.combat = undefined;
        this.pauseUi?.dispose(); this.pauseUi = undefined;
        this.guide?.dispose(); this.guide = undefined;
        for (const ui of this.closing) ui.dispose();
        this.closing.length = 0;
        this.releaseInput();
        this.tweens.clear();
    }

    private drawFade(alpha: number): void {
        const g = this.fadeNode;
        if (!g) return;
        g.clear();
        if (alpha <= 0) return;
        g.fillColor = color('#04121F', Math.round(255 * alpha));
        g.rect(-this.width / 2, -this.height / 2, this.width, this.height);
        g.fill();
    }

    /**
     * 屏幕切换过渡：先淡入深色（0.16 秒），在完全遮住时清理旧界面并搭建新界面，再淡出（0.24 秒）。
     * 过渡期间重复触发会被忽略，避免连点创建多个界面。首次进入（没有旧界面）直接淡出。
     */
    private switchScreen(build: () => void): void {
        if (this.disposed || !this.screenRoot || this.switching) return;
        const g = this.fadeNode;
        if (!g) { build(); return; }
        this.switching = true;
        g.node.setSiblingIndex(this.node.children.length - 1);
        const reveal = () => {
            build();
            g.node.setSiblingIndex(this.node.children.length - 1);
            this.tweens.add(0.24, k => this.drawFade(1 - k), { done: () => { this.drawFade(0); this.switching = false; } });
        };
        if (this.screen === 'boot') { this.drawFade(1); reveal(); return; }
        this.tweens.add(0.16, k => this.drawFade(k), { done: reveal, ease: x => x });
    }

    openHangar(): void {
        this.switchScreen(() => {
            this.clearScreen();
            this.screen = 'hangar';
            this.hangar = new SfHangar(this.shell, this.screenRoot!);
            this.audio?.playMusic('bgm-hangar');
        });
    }

    openMap(chapter?: number): void {
        this.switchScreen(() => {
            this.clearScreen();
            this.screen = 'map';
            const level = levelById(this.progress.data.lastLevel);
            this.map = new SfMap(this.shell, this.screenRoot!, chapter ?? level?.chapter ?? 1);
            this.audio?.playMusic('bgm-hangar');
        });
    }

    private abandonToMap(): void {
        this.paused = false;
        this.save();
        if (this.endless) this.openHangar();
        else this.openMap(levelById(this.levelId)?.chapter);
    }

    private retry(): void {
        if (this.endless) { this.discardSavedProgress(); this.startEndless(); }
        else this.startLevel(this.levelId);
    }

    /** 全部资源已在进入游戏时准备，关卡起飞直接使用常驻缓存。 */
    startLevel(id: string): void {
        const level = levelById(id);
        if (!level || this.disposed || this.switching || !this.screenRoot || !this.assets) return;
        this.endless = false;
        this.levelId = id;
        this.progress.data.lastLevel = id;
        const hidden = this.progress.rollHidden(id, Math.random());
        this.launchInto(() => this.beginCombat(level, hidden));
    }

    /** 无尽模式从存档恢复原机体与战斗；新出击才生成新的航线种子。 */
    startEndless(): void {
        if (this.disposed || this.switching || !this.screenRoot || !this.assets || !this.progress.endlessUnlocked) return;
        this.endless = true;
        const saved = this.progress.data.endlessRun;
        if (saved) this.progress.data.selected = saved.plane;
        const seed = saved?.seed ?? ((Date.now() & 0x7fffffff) ^ 0x2545f491);
        const first = endlessSector(1, seed);
        let restored: SfEndlessRestore | undefined;
        const prepare = saved ? () => {
            restored = new SfEndlessRestore(saved);
            return this.restoreEndless(restored);
        } : undefined;
        this.launchInto(() => this.beginCombat(first.level, false, seed, restored, saved?.reviveUsed), prepare);
    }

    private restoreEndless(job: SfEndlessRestore): Promise<void> {
        return new Promise((resolve, reject) => { this.restoring = { job, resolve, reject }; });
    }

    private launchInto(enter: () => void, prepare?: () => Promise<void>): void {
        this.switchScreen(() => this.buildLaunch(enter, prepare));
    }

    private buildLaunch(enter: () => void, prepare?: () => Promise<void>): void {
        this.clearScreen();
        this.screen = 'launch';
        const token = ++this.loadToken;
        const planeId = this.progress.data.selected;
        const parts = this.progress.plane(planeId).parts;
        const show = {
            main: showcaseLevel(parts.main), wing: showcaseLevel(parts.wing), special: showcaseLevel(parts.special),
        };
        this.audio?.stopMusic();
        this.launch = new SfLaunch(this.shell, this.overlayRoot!, planeId, show, {
            // 无尽续局在起飞台点火期间恢复战斗，准备好后再离台。
            prepare: prepare ? () => { if (token === this.loadToken) this.prepareLaunch(token, prepare); } : undefined,
            enter: () => { if (token === this.loadToken) enter(); },
            done: () => { this.launch?.dispose(); this.launch = undefined; },
            back: () => this.openHangar(),
        });
    }

    /** 继续无尽时分帧重建本局；此阶段不再调用资源加载或释放。 */
    private prepareLaunch(token: number, prepare?: () => Promise<void>): void {
        void Promise.resolve().then(() => {
            if (token !== this.loadToken || this.disposed) return;
            return prepare?.();
        }).then(() => {
            if (token !== this.loadToken || this.disposed) return;
            this.launch?.prepared();
        }, error => {
            if (token !== this.loadToken || this.disposed) return;
            console.error('[SkyForge] flight preparation failed', error);
            this.launch?.fail();
        });
    }

    private beginCombat(level: LevelDef, hidden: boolean, endlessSeed?: number, restored?: SfEndlessRestore, reviveUsed = false): void {
        const planeId = this.progress.data.selected;
        const save = this.progress.plane(planeId);
        const planeLevel = save.level;
        const parts = { ...save.parts };
        this.screen = 'combat';
        this.settled = false;
        this.reviveUsed = reviveUsed;
        this.endlessSaveTimer = 0;
        this.accumulator = 0;
        const seed = (Date.now() & 0x7fffffff) ^ 0x5f3759df;
        this.combat = restored?.combat ?? new SfCombat({
            plane: planeId, planeLevel, parts, hearts: heartsForLevel(planeLevel, PLANE_BY_ID[planeId].baseHearts),
            level, seed, hiddenBoss: hidden,
            endless: endlessSeed === undefined ? undefined : sector => endlessSector(sector, endlessSeed),
            difficulty: endlessSeed === undefined ? undefined : endlessSector(1, endlessSeed).difficulty,
        });
        const c = this.combat;
        this.endlessRun = endlessSeed === undefined ? undefined : restored?.run ?? new SfEndlessRun({
            plane: planeId, planeLevel, parts, hearts: c.player.maxHp, seed: endlessSeed, combatSeed: seed,
            bestDistance: this.progress.data.endlessBest,
        });
        this.combatView = new SfCombatView(this.ui, this.screenRoot!, final => {
            this.audio?.play(final ? 'explo-boss' : 'explo-m', final ? 1 : 0.65);
            if (final) this.context?.services.feedback.vibrate('heavy');
        });
        this.combatView.setChapter(c.level.chapter);
        const view = this.combatView;
        this.hud = new SfHud(this.ui, this.screenRoot!, () => this.context?.requestPause(), (x, y) => view.toScreen(x, y));
        this.cinematic = new SfCinematic(this.ui, this.screenRoot!);
        this.applyLayout();
        this.combatView.reset(this.combat);
        if (restored) {
            this.combatView.restoreWarnings(c, restored.resumeWarnings);
            this.combatView.startEntry(c);
        }
        if (this.endless) this.save();
        this.audio?.playMusic('bgm-battle');
        this.audio?.syncCombat(c, false);
        this.context?.services.analytics.track('sky_forge_level_start', { level: level.id, plane: planeId, hidden, endless: this.endless });
    }

    // ───────────────────────────── 输入 ─────────────────────────────

    private point(e: EventTouch): { x: number; y: number } {
        const p = this.inputCamera ? e.getLocation() : e.getUILocation();
        const world = this.inputCamera ? this.inputCamera.screenToWorld(new Vec3(p.x, p.y, 0)) : new Vec3(p.x, p.y, 0);
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        return { x: local.x, y: local.y };
    }

    private onTouchStart(e: EventTouch): void {
        // 演出 / 引导期间也登记手指：演出结束后不用重新按下就能继续拖动。
        if (this.screen !== 'combat' || !this.combat || this.launch || this.combatView?.entering || this.paused || this.planeReward || this.pointer !== null) return;
        if (this.combat.phase === 'dead' || this.combat.phase === 'done') return;
        this.pointer = e.getID();
        this.finger = this.point(e);
        this.target = { x: this.combat.player.x, y: this.combat.player.y };
        this.touchStartAt = this.clock;
        this.touchMoved = 0;
        this.combatView?.setTouching(true);
    }

    private onTouchMove(e: EventTouch): void {
        if (e.getID() !== this.pointer || !this.finger || !this.target || !this.combat) return;
        const p = this.point(e);
        // 插入演出 / 引导期间战斗暂停：只跟踪手指位置，不移动飞机，结束后从当前位置继续相对拖动。
        if (this.cinematic?.active || this.guide || this.planeReward) { this.finger = p; return; }
        const scale = this.combatView?.fieldScale ?? 1;
        const dx = (p.x - this.finger.x) / scale, dy = (p.y - this.finger.y) / scale;
        this.touchMoved += Math.hypot(p.x - this.finger.x, p.y - this.finger.y);
        // 相对拖动：手指移动多少，飞机就移动多少（略微放大，单手更省力）。
        this.target = this.combat.clampTarget(this.target.x + dx * 1.1, this.target.y + dy * 1.1);
        this.finger = p;
    }

    private onTouchEnd(e: EventTouch): void {
        if (e.getID() !== this.pointer) return;
        const tap = e.type !== Node.EventType.TOUCH_CANCEL && this.clock - this.touchStartAt < 0.25 && this.touchMoved < 30;
        this.releaseInput();
        if (!tap) { this.lastTap = -10; return; }
        // 双击释放必杀。
        if (this.clock - this.lastTap <= 0.35) {
            this.lastTap = -10;
            if (this.guide) { this.guide.dispose(); this.guide = undefined; }
            this.tryUltimate();
        } else this.lastTap = this.clock;
    }

    /** 双击：能量满时先播放必杀切入（战斗暂停），演出到释放点再真正释放。 */
    private tryUltimate(): void {
        const c = this.combat;
        if (!c || this.cinematic?.active) return;
        if (!c.canUltimate()) {
            if (c.player.energy < 100) this.toast('必杀能量未满');
            return;
        }
        const plane = PLANE_BY_ID[c.config.plane];
        this.context?.services.feedback.vibrate('heavy');
        this.audio?.play('ultimate-ready');
        this.cinematic?.playSpecial(plane.id, plane.name, plane.ultimate.name, plane.color, () => {
            if (this.combat === c) {
                if (this.endlessRun) this.endlessRun.ultimate(c);
                else c.requestUltimate();
            }
        });
    }

    private releaseInput(): void {
        this.pointer = null;
        this.finger = undefined;
        this.target = null;
        this.combatView?.setTouching(false);
    }

    // ───────────────────────────── 每帧 ─────────────────────────────

    protected update(rawDt: number): void {
        if (!this.begun || this.disposed) return;
        const dt = Math.min(0.1, Math.max(0, rawDt));
        this.clock += dt;
        this.tweens.update(dt);
        this.audio?.tick(dt);
        this.hangar?.update(dt);
        this.map?.update(dt);
        this.result?.update(dt);
        this.pauseUi?.update(dt);
        this.reviveUi?.update(dt);
        this.launch?.update(dt);
        this.planeReward?.update(dt);
        this.showPendingPlane();
        const restore = this.restoring;
        if (restore) {
            try {
                restore.job.advance();
                if (restore.job.done) { this.restoring = undefined; restore.resolve(); }
            } catch (error) {
                this.restoring = undefined;
                delete this.progress.data.endlessRun;
                this.save();
                this.toast('无尽进度无法恢复，请返回机库重新起飞');
                restore.reject(error instanceof Error ? error : new Error(String(error)));
            }
        }
        for (let i = this.closing.length - 1; i >= 0; i--) {
            const ui = this.closing[i];
            ui.update(dt);
            if (ui.finished) { ui.dispose(); this.closing.splice(i, 1); }
        }
        if (this.toastTime > 0 && this.toastLabel) {
            this.toastTime -= dt;
            this.toastLabel.node.active = this.toastTime > 0;
        }
        if (this.screen === 'combat' && this.combat && this.combatView && this.hud) this.updateCombat(dt);
    }

    private updateCombat(dt: number): void {
        const c = this.combat!, v = this.combatView!, hud = this.hud!;
        // 插入演出期间战斗暂停，HUD 隐藏；必杀引导期间战斗暂停，HUD 保留。
        const cinematic = !this.paused && !this.planeReward && !!this.cinematic?.update(dt);
        hud.setVisible(!cinematic && this.screen === 'combat');
        this.guide?.update(dt);
        if (this.guide?.done) { this.guide.dispose(); this.guide = undefined; }
        if (!this.paused && !this.launch) v.updateEntry(dt);
        const live = !this.paused && !this.planeReward && !this.launch && !v.entering && !cinematic && !this.guide && c.phase !== 'dead';
        if (live) {
            if (v.hitstop > 0) {
                v.hitstop -= dt;
            } else {
                this.accumulator += dt;
                let steps = 0;
                while (this.accumulator >= STEP && steps < 5) {
                    if (this.endlessRun) this.endlessRun.step(c, this.target);
                    else c.step(STEP, this.target);
                    this.accumulator -= STEP;
                    steps++;
                    if (v.hitstop > 0) { this.accumulator = 0; break; }
                    const events = c.drainEvents();
                    if (events.length) this.handleEvents(events);
                    if (v.hitstop > 0) { this.accumulator = 0; break; }
                }
            }
            v.tickTimers(dt);
        }
        v.render(c, live ? dt : 0, live);
        hud.update(c, live ? dt : 0, v.camera.hit);
        this.audio?.syncCombat(c, live, dt);
        if (live && this.endlessRun && !this.settled) {
            this.endlessSaveTimer += dt;
            const earnedPlane = PLANES.some(p => p.unlock.type === 'endless'
                && !this.progress.plane(p.id).owned && c.distance >= p.unlock.value);
            if (earnedPlane || this.endlessSaveTimer >= 10) { this.endlessSaveTimer = 0; this.save(); }
        }
        // 坠机：本关复活机会还在时弹复活界面，已用过则直接结算。
        if (c.phase === 'dead' && !this.reviveUi && !this.settled) {
            if (this.reviveUsed) this.finishLevel();
            else this.showRevive();
        }
    }

    /** 发放时只登记奖励；战斗中不挡操作，安全界面按存档队列逐架展示。 */
    private showPendingPlane(): void {
        if (this.planeReward || this.switching || this.adBusy || !this.overlayRoot) return;
        const id = this.progress.data.pendingPlanes[0];
        if (!id) return;
        const safe = this.screen === 'hangar' || this.screen === 'map'
            || (this.screen === 'result' && this.result?.rewardsReady)
            || (this.screen === 'combat' && ((this.paused && this.pauseUi) || this.reviveUi));
        if (!safe) return;
        this.releaseInput();
        this.save();
        this.planeReward = new SfPlaneReward(this.shell, this.overlayRoot, PLANE_BY_ID[id], toHangar => {
            this.planeReward = undefined;
            this.progress.acknowledgePlane(id);
            if (toHangar) this.progress.data.selected = id;
            this.save();
            if (!toHangar) return;
            if (this.paused && this.pauseModel) {
                void this.pauseModel.resume().then(() => { if (!this.disposed) this.openHangar(); });
            } else this.openHangar();
        });
    }

    private handleEvents(events: CombatEvent[]): void {
        const c = this.combat!;
        this.combatView!.consume(c, events);
        this.hud!.consume(c, events);
        this.audio?.consume(events, c.config.plane);
        for (const e of events) {
            switch (e.type) {
                case 'enemy-spawn':
                    if (e.kind) this.progress.seeEnemy(e.kind);
                    break;
                case 'boss-enter': {
                    this.context?.services.feedback.vibrate('medium');
                    const boss = c.boss;
                    const info = boss ? BOSS_INFO[boss.id] : undefined;
                    if (boss && info) {
                        const tone = boss.tier === 'hidden' ? '#A65CFF' : boss.tier === 'big' ? COLORS.red : boss.tier === 'mid' ? COLORS.orange : COLORS.blue;
                        const camera = this.combatView!.camera;
                        this.cinematic?.playBoss(info.frame, boss.name, tone, () => {
                            camera.shake = Math.max(camera.shake, 7);
                            camera.flash = Math.max(camera.flash, 0.34);
                        });
                    }
                    break;
                }
                case 'boss-defeated':
                    this.audio?.stopMusic();
                    this.context?.services.feedback.vibrate('heavy');
                    break;
                case 'level-exit':
                    this.audio?.playMusic('jingle-win', 0.2);
                    break;
                case 'level-clear':
                    this.finishLevel();
                    break;
                case 'hurt':
                    this.context?.services.feedback.vibrate('heavy');
                    break;
                case 'energy-full':
                    // 第一次充满必杀能量：暂停战斗，引导双击屏幕释放（只出现一次）。
                    if (!this.progress.data.ultGuide && !this.guide && this.screenRoot) {
                        this.progress.data.ultGuide = true;
                        this.save();
                        this.guide = new SfGuide(this.ui, this.screenRoot, this.width, this.height, (this.safeTop + this.safeBottom) / 2);
                    }
                    break;
                case 'assemble':
                    this.context?.services.feedback.vibrate('light');
                    break;
            }
        }
    }

    // ───────────────────────────── 复活 / 结算 ─────────────────────────────

    private showRevive(): void {
        this.releaseInput();
        this.save();
        this.audio?.stopMusic();
        const c = this.combat;
        this.reviveUi = new SfRevive(this.shell, this.overlayRoot!, !this.reviveUsed, {
            stage: this.stageText(), score: c?.score ?? 0, coins: c?.coins ?? 0,
        }, {
            revive: () => void this.requestRevive(),
            giveUp: () => { this.closeReport(this.reviveUi); this.reviveUi = undefined; this.finishLevel(); },
        });
    }

    private async requestRevive(): Promise<void> {
        if (this.adBusy || this.reviveUsed || !this.context) return;
        this.adBusy = true;
        this.reviveUi?.setBusy(true);
        const token = this.loadToken;
        try {
            const result = await this.context.services.ads.showRewarded({ placement: AD_PLACEMENTS.skyForgeRevive, gameId: GAME_ID, sessionId: this.context.sessionId });
            if (this.disposed || token !== this.loadToken || !this.combat) return;
            this.adBusy = false;
            if (result.outcome === 'completed') {
                this.reviveUsed = true;
                this.closeReport(this.reviveUi);
                this.reviveUi = undefined;
                if (this.endlessRun) this.endlessRun.revive(this.combat);
                else this.combat.revive();
                this.save();
                this.audio?.playMusic('bgm-battle');
                this.audio?.syncCombat(this.combat, false);
            } else {
                this.reviveUi?.setBusy(false);
                this.toast(result.outcome === 'skipped' ? '广告未看完，复活机会仍保留' : '暂时无法复活，请稍后再试');
            }
        } catch {
            this.adBusy = false;
            this.reviveUi?.setBusy(false);
            this.toast('暂时无法复活，请稍后再试');
        }
    }

    private finishLevel(): void {
        if (this.settled || !this.combat) return;
        this.settled = true;
        this.cinematic?.finish();
        const c = this.combat;
        const r = c.result();
        const canAd = !!this.context?.services.ads.isEnabledForGame(GAME_ID);
        this.screen = 'result';
        this.hud?.setVisible(false);
        const actions = {
            retry: () => this.retry(),
            next: (id: string) => this.startLevel(id),
            map: () => this.openMap(c.level.chapter),
            hangar: () => this.openHangar(),
            double: (gold: number) => this.doubleGold(gold),
        };
        if (this.endless) {
            const previousBest = this.endlessRun?.start.bestDistance ?? this.progress.data.endlessBest;
            this.endlessRun = undefined;
            delete this.progress.data.endlessRun;
            const settle = this.progress.settleEndless(r, previousBest);
            this.save();
            this.context?.reportScore(r.score);
            this.context?.services.analytics.track('sky_forge_endless_end', { distance: r.distance, sectors: r.sectors, score: r.score });
            this.audio?.playMusic(r.bosses > 0 ? 'jingle-win' : 'jingle-lose', 0.2);
            this.result = new SfResult(this.shell, this.overlayRoot!, {
                result: r, stars: 0, newStars: 0, gold: settle.gold, firstClear: false, unlocked: settle.unlocked,
                plane: c.config.plane, canDouble: settle.gold > 0 && canAd, endlessBest: settle.best,
            }, { ...actions, double: () => actions.double(settle.gold) });
            return;
        }
        const level = c.level;
        const bestScore = this.progress.data.bestScore[level.id] ?? 0;
        const settle = this.progress.settle(level.id, r);
        this.save();
        this.context?.reportScore(r.score);
        this.context?.services.analytics.track('sky_forge_level_end', { level: level.id, victory: r.victory, score: r.score, stars: settle.stars });
        if (!r.victory) this.audio?.playMusic('jingle-lose', 0.2);
        this.result = new SfResult(this.shell, this.overlayRoot!, {
            level, result: r, stars: settle.stars, newStars: settle.newStars, gold: settle.gold,
            firstClear: settle.firstClear, unlocked: settle.unlocked, plane: c.config.plane,
            canDouble: r.victory && settle.gold > 0 && canAd, bestScore,
        }, { ...actions, double: () => actions.double(settle.gold) });
    }

    private async doubleGold(amount: number): Promise<boolean> {
        if (!this.context || this.adBusy) return false;
        this.adBusy = true;
        try {
            const result = await this.context.services.ads.showRewarded({ placement: AD_PLACEMENTS.skyForgeDoubleGold, gameId: GAME_ID, sessionId: this.context.sessionId });
            this.adBusy = false;
            if (result.outcome !== 'completed' || this.disposed) return false;
            this.progress.data.gold += amount;
            this.save();
            return true;
        } catch {
            this.adBusy = false;
            return false;
        }
    }

    private toast(message: string): void {
        if (!this.toastLabel) return;
        this.toastLabel.string = message;
        this.toastLabel.node.active = true;
        this.toastLabel.node.setSiblingIndex(this.node.children.length - 1);
        this.toastTime = 1.8;
    }
}
