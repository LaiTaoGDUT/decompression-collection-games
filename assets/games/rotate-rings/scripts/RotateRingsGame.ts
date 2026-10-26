import {
    _decorator, AudioClip, BlockInputEvents, Camera, Canvas, Color, Component, EffectAsset, EventTouch, Graphics, JsonAsset, Label,
    Material, Node, Sprite, SpriteFrame, Tween, tween, UIOpacity, UITransform, Vec2, Vec3, Vec4, view,
} from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { GameResult } from '../../../core/types/CommonTypes';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { AdService } from '../../../services/ads/AdService';
import { AD_PLACEMENTS } from '../../../services/ads/AdService';
import { FontBinding, setLabelBold } from '../../../services/font/FontBinding';
import type { RingLevel, RingLevelBank, RingMode, RingPoint, RingProp } from './RotateRingsTypes';
import { RotateRingsModel } from './RotateRingsModel';
import { RotateRingsBoard, ringColor } from './RotateRingsBoard';
import { completeRingLevel, grantRingDailyHints, readRingSave, ringUnlocked, ROTATE_RINGS_SAVE_VERSION, type RotateRingsSave } from './RotateRingsSave';
import { calculateRingDialogLayout, calculateRingLayout, calculateRingPlayLayout, calculateRingSelectionLayout, RING_DIALOG } from './RotateRingsLayout';
import { RING_AUDIO, RING_ENCOURAGEMENTS, ringComboTier, RING_THEME as T, RING_TITLE_MUSIC } from './RotateRingsTheme';
import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { createRingArcMesh, type RingLevelVisuals, type RingVisualMesh } from './RotateRingsVisuals';
import { RotateRingsLevelAssets } from './RotateRingsLevelAssets';
import { RotateRingsEffects, ringCurve } from './RotateRingsEffects';
import { RotateRingsMeshSprite } from './RotateRingsMeshSprite';
import { ORIGINAL_RING_CONFIG as SOURCE } from './RotateRingsOriginalConfig';
import * as G from './RotateRingsGeometry';
import { DailyToolRewardAnimation } from '../../../shared/ui/DailyToolRewardAnimation';
import type { ServerTimeService } from '../../../services/cloud/ServerTimeService';
import { RotateRingsGuide } from './RotateRingsGuide';

const { ccclass } = _decorator;
const RESOURCE_BUNDLE = 'game-rotate-rings-assets';
type RingState = 'idle' | 'ready' | 'selecting' | 'loading' | 'playing' | 'paused' | 'completed' | 'disposed';
interface RingServices {
    serverTime?: ServerTimeService;
    assets: AssetService; audio: AudioService; feedback: FeedbackService; storage: StorageService; platform: Platform; ads: AdService;
}
interface RingAction { name: string; text: string; primary?: boolean; icon?: string; action: () => void | Promise<void>; }
interface RingGesture { touch: number; kind: 'ring' | 'pull'; id: string; point: RingPoint; angle: number; changed: boolean;
    removedBefore: string[]; bombsBefore: number[]; progressBefore: number; }
interface RingPropBadge { count: Label; number: Node; ad: Node; }
/** 一条短彩带：扁平纸带沿长度扭转、整体旋转飘落。d0 为首次从顶上落下前的延迟距离，之后到底部就回到顶上，持续不断。 */
interface RingConfettiPiece { color: Color; x: number; d0: number; speed: number; sway: number; swayRate: number;
    phase: number; spin: number; flutter: number; length: number; width: number; twist: number; curl: number; }
/** 全屏通关页的动画对象：刚解开的这一关的缩略盘面，各部件按玩家实际解开的顺序依次弹一下、闪一下釉光。 */
interface RingCompletion { time: number; card: Node; confetti: Graphics; pieces: RingConfettiPiece[];
    parts: { node: Node; shadow?: Node; sprite?: RotateRingsMeshSprite; color: Color; scale: number; at: number }[]; }
/** 选关陶瓷环关卡格：各部件分层放置（同类节点相邻以便合批），按压与跳转动画统一缩放这一格的全部部件。 */
interface RingTile { number: number; x: number; y: number; press: { scale: number }; spin: number;
    glow: Node; shadow: Node; ring: Node; text: Label; lock: Node; }
/** 全屏通关页（参照缤纷填色：主角是刚完成的盘面）：标题、模式关卡标签距顶部安全边界，下一关按钮距底部安全边界；
 * 中间白卡里是这一关开局时的完整盘面缩略（真实网格与材质），卡片弹入后各部件按解开顺序依次弹跳闪光，像把这一关快放一遍；
 * 短彩带从屏幕顶上持续撒落。 */
const RING_COMPLETE = Object.freeze({
    titles: ['解开啦', '环环解开', '干净利落', '一圈不剩', '思路通透', '轻轻松松'] as const,
    titleOffset: -170, tagOffset: -262, buttonOffset: 118, titleSize: 76,
    card: 620, cardRadius: 44, thumb: 540, cardPop: .42, replayStart: .55, replaySpan: 1.2, replayStep: .09, partPop: .3, partLift: .14, partFlash: .45,
    glow: 860,
    /** 礼花：从屏幕顶上持续撒落的短彩带，颜色取本关釉色加金、粉、珊瑚红（白色在奶油底上看不见）。速度像素/秒，sway 左右摆幅（像素）；
     * 彩带长宽（像素），twist 为沿带长的扭转量（弧度），flutter 为扭转随时间翻动的角速度（弧度/秒），curl 为带身弯曲（像素）。 */
    confetti: { count: 54, speed: [160, 250] as const, sway: [16, 42] as const, swayRate: [1, 2.1] as const,
        spin: [40, 150] as const, flutter: [3, 6] as const, length: [46, 72] as const, width: [12, 16] as const,
        twist: [1.6, 3.2] as const, curl: [3, 9] as const, segments: 6,
        /** 开场一阵：前 60% 的片在 burst（占一屏落差的比例）内依次入场，约 1 秒铺满；其余错开补位，保持持续撒落。 */
        burstShare: .6, burst: .12 },
});
/** 关内顶部：关卡号在上、解环进度条在下，整体以 headerY 为中心。 */
const RING_HUD = Object.freeze({ titleSize: 40, titleWidth: 360, titleOffset: 14, flameOffset: 108, barWidth: 236, barHeight: 14, barOffset: -30 });
/** 选关环：网格单位 → 像素比例、缺口角度、投影下沉、锁扣在缺口处的半径；当前关缓慢转动缺口（度/秒）。 */
const RING_TILE = Object.freeze({ scale: 26, radius: 1.45, gap: 96, shadowDrop: -.22, lockRadius: 38, spin: 36, currentScale: 1.1, decoScale: 15 });

/** 仅通过 Context 使用公共能力；进入即恢复上次关卡，设置菜单可切换两种模式选关。 */
@ccclass('RotateRingsGame')
export class RotateRingsGame extends Component implements MiniGame<RingServices> {
    readonly backgroundPausePolicy = 'silent' as const;
    private state: RingState = 'idle';
    /** 只保留在棋盘实体上按下、仍等待当前拖动结束的触点 ID。 */
    private readonly waitingTouches = new Set<number>();
    private context?: MiniGameContext<RingServices>;
    private bank?: RingLevelBank;
    private save?: RotateRingsSave;
    private mode: RingMode = 'normal';
    private levelNumber = 1;
    private selectionPage = 0;
    /** 选关翻页轨道：前/当前/后三页槽位，拖动跟手，松手按距离或速度翻页或回弹。 */
    /** 选关页常驻：加载阶段预先建好并隐藏，进出关只切换显隐并刷新内容；布局变化时才重建。 */
    private selectionRoot?: Node;
    private selectionToast?: Label;
    private selectionKey = '';
    private selectionView?: {
        track: Node; slots: Node[]; tiles: RingTile[][]; pages: number; sliding: boolean; pressed?: RingTile; time: number;
        drag?: { id: number; startX: number; startY: number; lastX: number; lastAt: number; velocity: number; moved: boolean };
    };
    private loadedLevel?: RingLevel;
    private model?: RotateRingsModel;
    private page?: Node;
    private background?: Node;
    private overlay?: Node;
    private camera?: Camera;
    private board?: RotateRingsBoard;
    private boardInput?: Node;
    private boardDirty = false;
    private animationTime = 0;
    /** 关内顶部解环进度条：显示值向目标缓动，变化时才重画。 */
    private progressBar?: { graphics: Graphics; shown: number; target: number; drawn: number };
    private toast?: Label;
    private gesture?: RingGesture;
    private audioBank?: BundleAudioBank;
    private frames?: Readonly<Record<string, SpriteFrame>>;
    private loadedVisuals?: RingLevelVisuals;
    private levelAssets?: RotateRingsLevelAssets;
    private ringMaterial?: Material;
    private shadowMaterial?: Material;
    /** 选关陶瓷环的投影：投影偏移按关卡格比例设置，与棋盘投影材质分开。 */
    private tileShadowMaterial?: Material;
    /** 选关与标题装饰共用的 C 形环网格。 */
    private tileMesh?: RingVisualMesh;
    private backgroundMaterial?: Material;
    private titleMusic?: AudioClip;
    private effects?: RotateRingsEffects;
    private guide?: RotateRingsGuide;
    private readonly dailyReward = new DailyToolRewardAnimation();
    private dailyHintReward = 0;
    private comboStreak = 0;
    private comboMisses = 0;
    private dialogContent?: Node;
    private dialogTime = 0;
    private completion?: RingCompletion;
    /** 本局部件消除的先后顺序，供通关页快放。 */
    private releaseOrder: string[] = [];
    private propBadges = new Map<RingProp, RingPropBadge>();
    private busy = false;
    private generation = 0;
    private saveTime = 0;
    private resizeListening = false;
    private layout = calculateRingLayout(1334);
    private selectionLayout = calculateRingSelectionLayout(this.layout.top, this.layout.bottom);
    private playLayout = calculateRingPlayLayout(1334, 651, -651);
    private toastTime = 0;

    async initialize(context: MiniGameContext<RingServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`RotateRings cannot initialize from ${this.state}`);
        const generation = ++this.generation;
        this.context = context;
        for (let p: Node | null = this.node; p; p = p.parent) {
            const camera = p.getComponent(Canvas)?.cameraComponent;
            if (camera) { this.camera = camera; break; }
        }
        if (!this.camera) throw new Error('RotateRings UI camera is missing');
        const catalog = await context.services.assets.loadAsset(RESOURCE_BUNDLE, 'configs/index', JsonAsset);
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') return;
        const bank = catalog.json as RingLevelBank;
        if (bank?.version !== 1 || !bank.modes?.normal?.length || !bank.modes?.hard?.length || bank.packing?.version !== 2
            || bank.packing.bankSize !== 64 || !Number.isInteger(bank.packing.meshCount) || bank.packing.meshCount <= 0
            || !Number.isInteger(bank.packing.collisionShapeCount) || bank.packing.collisionShapeCount <= 0) {
            throw new Error('RotateRings level catalog is invalid');
        }
        this.bank = bank;
        this.levelAssets = new RotateRingsLevelAssets(context.services.assets, RESOURCE_BUNDLE, bank.packing.meshCount, bank.packing.collisionShapeCount);
        const stored = context.services.storage.getGameData(context.gameId);
        const savedRings = stored?.dataVersion === ROTATE_RINGS_SAVE_VERSION ? stored.custom?.rings : undefined;
        this.save = readRingSave(savedRings, bank, context.services.serverTime?.day);
        const daily = grantRingDailyHints(this.save, context.services.serverTime?.day);
        this.dailyHintReward = savedRings ? daily : this.save.props.hint;
        this.mode = this.save.mode;
        this.levelNumber = this.save.modes[this.mode].current;
        context.reportAchievementProgress('normal-cleared-level', this.save.modes.normal.cleared);
        this.selectionPage = Math.floor((this.levelNumber - 1) / this.selectionLayout.pageSize);
        this.audioBank = new BundleAudioBank(RING_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        const requests = Object.keys(PACKED_SPRITE_PATHS).filter(key => key.endsWith('/spriteFrame')).map(key => ({
            key: key.split('/').slice(-2)[0], path: PACKED_SPRITE_PATHS[key], type: 'frame' as const,
        }));
        const frames = await context.services.assets.loadSpriteFrames(RESOURCE_BUNDLE,
            [...requests, { key: 'home-bg', path: 'visual/home-bg/texture', type: 'texture' }]);
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') {
            Object.keys(frames).map(k => frames[k]).forEach(frame => context.services.assets.releaseRuntimeAsset(frame)); return;
        }
        this.frames = frames;
        const [ceramic, background] = await Promise.all([
            context.services.assets.loadAsset(RESOURCE_BUNDLE, 'visual/objects/rings-ceramic', EffectAsset),
            context.services.assets.loadAsset(RESOURCE_BUNDLE, 'visual/objects/rings-background', EffectAsset),
        ]);
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') return;
        const makeMaterial = (effect: EffectAsset, technique = 0) => {
            const material = new Material(); material.initialize({ effectAsset: effect, technique });
            return context.services.assets.trackRuntimeAsset(RESOURCE_BUNDLE, material);
        };
        this.ringMaterial = makeMaterial(ceramic); this.shadowMaterial = makeMaterial(ceramic, 1); this.backgroundMaterial = makeMaterial(background);
        this.tileShadowMaterial = makeMaterial(ceramic, 1);
        for (const material of [this.ringMaterial, this.shadowMaterial, this.tileShadowMaterial]) {
            material.setProperty('mainRect', this.frameRect(frames['ring-texture']));
            material.setProperty('normalRect', this.frameRect(frames['ring-normal']));
            material.setProperty('sdfRect', this.frameRect(frames['ring-sdf']));
        }
        this.shadowMaterial.setProperty('shadowColor', ringColor(T.shadow, Math.round(T.boardShadow.alpha * 255)));
        const tile = RING_TILE, tileShadow = T.boardShadow;
        this.tileShadowMaterial.setProperty('shadowColor', ringColor(T.shadow, Math.round(tileShadow.alpha * 255)));
        this.tileShadowMaterial.setProperty('shadowOffset', new Vec4(tileShadow.offsetX * tile.scale, tile.shadowDrop * tile.scale, tileShadow.softness, tileShadow.spread));
        this.tileMesh = createRingArcMesh('#FFFFFF', tile.gap, tile.radius);
        this.backgroundMaterial.setProperty('detailRect', this.frameRect(frames['game-bg-mask']));
        this.backgroundMaterial.setProperty('baseColor', ringColor(T.background));
        // 公共加载阶段已准备全部关卡压缩包；音频也在开始前全部准备，关闭声音不会延后下载。
        await context.services.assets.prepareBundle(RESOURCE_BUNDLE, 'visual/audio');
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') return;
        await this.audioBank.initialize();
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') return;
        const titleMusic = await context.services.assets.loadAsset(RESOURCE_BUNDLE, RING_TITLE_MUSIC, AudioClip);
        if (!this.isValid || generation !== this.generation || (this.state as RingState) === 'disposed') return;
        this.titleMusic = titleMusic;
        view.on('canvas-resize', this.handleResize, this); this.resizeListening = true;
        await this.openLevel(this.levelNumber, true);
        // 选关页在加载阶段建好隐藏并预先排好文字，关内进选关只切显隐，不在点击时现建几百个节点或现画文字。
        if ((this.state as RingState) === 'ready') {
            this.buildSelection();
            this.selectionPage = Math.floor((this.save.modes[this.mode].current - 1) / this.selectionLayout.pageSize);
            this.refreshSelectionMode();
            this.selectionRoot!.getComponentsInChildren(Label).forEach(label => label.updateRenderData(true));
        }
    }
    begin(): void {
        if (this.state !== 'ready') throw new Error(`RotateRings cannot begin from ${this.state}`);
        this.state = 'playing'; this.enterPlaying();
    }
    isGameplayActive(): boolean { return this.state === 'playing' && !this.busy; }
    pause(): boolean {
        if (this.state === 'paused') return true;
        if (this.state !== 'playing') return false;
        this.finishGesture(); this.checkCompletion();
        if ((this.state as RingState) !== 'playing') return false;
        this.persist(); this.state = 'paused'; this.dailyReward.setVisible(false); this.audioBank?.stopEffects(); return true;
    }
    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing'; this.dailyReward.setVisible(true);
        const added = this.save ? grantRingDailyHints(this.save, this.context?.services.serverTime?.day) : 0;
        if (added) { this.finishDailyHintReward(); this.dailyHintReward = added; this.persist(); this.showDailyHintReward(); }
    }
    async restart(context?: MiniGameContext<RingServices>): Promise<void> {
        if (this.state === 'disposed' || !this.loadedLevel) return;
        if (context) this.context = context;
        this.startLevel(false);
    }
    discardSavedProgress(): void {
        if (!this.save) return;
        this.save.modes[this.mode].draft = undefined; this.persist(false);
    }
    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.finishGesture(); this.persist(); this.state = 'disposed'; this.generation++;
        this.levelAssets?.dispose(); this.levelAssets = undefined;
        if (this.resizeListening) view.off('canvas-resize', this.handleResize, this);
        this.resizeListening = false; this.unscheduleAllCallbacks();
        this.finishDailyHintReward(); this.hidePauseMenu(); this.clearPage(); this.destroyNode(this.background); this.background = undefined;
        this.destroyNode(this.selectionRoot); this.selectionRoot = undefined; this.selectionToast = undefined; this.selectionView = undefined; this.selectionKey = '';
        this.audioBank?.dispose(); this.audioBank = undefined; this.camera = undefined; this.loadedLevel = undefined;
        if (this.frames && this.context) Object.keys(this.frames).map(k => this.frames![k]).forEach(frame => this.context!.services.assets.releaseRuntimeAsset(frame));
        if (this.context) for (const material of [this.ringMaterial, this.shadowMaterial, this.tileShadowMaterial, this.backgroundMaterial]) {
            if (material) this.context.services.assets.releaseRuntimeAsset(material);
        }
        this.ringMaterial = undefined; this.shadowMaterial = undefined; this.tileShadowMaterial = undefined; this.backgroundMaterial = undefined;
        this.tileMesh = undefined;
        this.frames = undefined; this.titleMusic = undefined; this.loadedVisuals = undefined; this.propBadges.clear();
        this.model = undefined; this.save = undefined; this.bank = undefined; this.context = undefined; this.busy = false;
    }
    protected onDestroy(): void { void this.dispose(); }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        this.showDialog('休息一下', `${T.modeNames[this.mode]} · 第 ${this.levelNumber} 关`, [
            { name: 'Resume', text: '继续游戏', primary: true, action: () => model.resume() },
            { name: 'Restart', text: '重新开始', action: () => model.restart() },
            // 继续与切到选关在同一帧完成，中间不露出关内画面。
            { name: 'PauseSelect', text: '返回选关', action: async () => { await model.resume(); if (this.state !== 'disposed') this.showSelection(); } },
            { name: 'ExitLobby', text: '返回大厅', action: () => model.exit() },
        ]);
    }
    hidePauseMenu(): void {
        this.destroyNode(this.overlay); this.overlay = undefined; this.dialogContent = undefined; this.dialogTime = 0; this.completion = undefined;
    }
    showResultView(model: MiniGameResultModel): void {
        this.showDialog('圆环已解开', `${T.modeNames[this.mode]} · 第 ${this.levelNumber} 关`, [
            { name: 'Restart', text: '再玩一次', primary: true, action: () => model.restart() },
            { name: 'ExitLobby', text: '返回大厅', action: () => model.returnToLobby() },
        ]);
    }
    hideResultView(): void { this.hidePauseMenu(); }

    protected update(delta: number): void {
        if (this.busy) return;
        this.updateDialog(Math.min(.1, delta)); this.updateCompletion(Math.min(.1, delta));
        if (this.state !== 'paused' && this.toastTime > 0) {
            this.toastTime -= delta; if (this.toastTime <= 0 && this.toast) this.toast.string = '';
        }
        if (this.state === 'playing' || this.state === 'completed') { this.effects?.update(Math.min(.1, delta)); this.advanceProgress(Math.min(.1, delta)); }
        if (this.state === 'selecting') this.animateSelection(Math.min(.1, delta));
        if (this.state === 'playing') {
            this.dailyReward.advance(Math.min(.1, Math.max(0, delta)));
            if (!this.overlay && !this.dailyReward.active) { this.guide?.update(Math.min(.1, delta)); if (this.guide?.active) this.boardDirty = true; }
        }
        if (this.state === 'playing' && this.model) {
            this.model.seconds += Math.min(.25, delta);
            this.saveTime += delta;
            if (this.saveTime >= 1) { this.saveTime = 0; this.persist(); }
        }
        if (this.board && (this.boardDirty || this.animationTime > 0 || this.board.animating) && this.state !== 'paused') {
            this.board.draw(delta); this.boardDirty = false; this.animationTime -= delta;
        }
    }

    private handleResize(): void {
        if (this.state === 'idle' || this.state === 'disposed') return;
        const endedGesture = !!this.gesture;
        this.finishGesture(); this.applyLayout();
        if (this.state === 'selecting') this.showSelection();
        this.drawBackground();
        if (endedGesture) { this.renderStatus(); this.persist(); this.checkCompletion(); }
    }
    private applyLayout(): void {
        const size = view.getVisibleSize(), platform = this.context?.services.platform.getLayoutInfo();
        this.layout = calculateRingLayout(size.height, platform?.safeArea.top,
            size.height - (platform?.safeArea.bottom ?? size.height), platform?.topRightReservedArea?.bottom);
        this.playLayout = calculateRingPlayLayout(size.height, this.layout.top, this.layout.bottom);
        const previousSize = this.selectionLayout.pageSize;
        this.selectionLayout = calculateRingSelectionLayout(this.layout.top, this.layout.bottom);
        if (previousSize !== this.selectionLayout.pageSize) this.selectionPage = Math.floor(this.selectionPage * previousSize / this.selectionLayout.pageSize);
        this.node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        for (const node of [this.page, this.overlay]) if (node?.isValid) {
            if (node === this.page && node.name === 'RingPlaying') {
                node.setScale(1, 1, 1); node.setPosition(0, 0); node.getComponent(UITransform)!.setContentSize(750, size.height);
                const play = this.playLayout;
                node.getChildByName('Pause')?.setPosition(306, play.headerY);
                const title = node.getChildByName('LevelTitle');
                title?.setPosition(0, play.headerY + RING_HUD.titleOffset);
                node.getChildByName('HardFlame')?.setPosition((title?.position.x ?? 0) - RING_HUD.flameOffset, play.headerY + RING_HUD.titleOffset);
                node.getChildByName('LevelProgress')?.setPosition(0, play.headerY + RING_HUD.barOffset);
                for (const name of ['Hint']) {
                    const child = node.getChildByName(name); if (child) child.setPosition(child.position.x, play.propsY);
                }
                this.boardInput?.setPosition(0, play.boardY);
                this.boardInput?.getComponent(UITransform)!.setContentSize(play.boardSafetyWidth, play.boardSafetyHeight);
                this.board?.resize(play.boardWidth, play.boardHeight, play.boardSafetyWidth, play.boardSafetyHeight);
                this.guide?.update(0);
                const shadow = T.boardShadow, boardScale = this.board?.transform.scale ?? 1;
                this.shadowMaterial?.setProperty('shadowOffset', new Vec4(shadow.offsetX * boardScale, shadow.offsetY * boardScale, shadow.softness, shadow.spread));
                this.toast?.node.setPosition(0, play.propsY + 100);
            } else if (node === this.overlay && node.name === 'RingComplete') {
                this.layoutCompletion();
            } else if (node === this.page && node.name === 'LevelSelection') {
                // 选关内容按当前布局整体重建（见 handleResize），这里只铺满可见高度。
                node.setScale(1, 1, 1); node.setPosition(0, 0); node.getComponent(UITransform)!.setContentSize(750, size.height);
            } else {
                const panelHeight = node === this.overlay ? this.dialogContent?.getComponent(UITransform)?.height : undefined;
                const scale = panelHeight ? Math.min(1, Math.max(1, this.layout.top - this.layout.bottom - 32) / (panelHeight * 1.05)) : this.layout.scale;
                node.setScale(scale, scale, 1); node.setPosition(0, this.layout.centerY);
            }
        }
        const dimNode = this.overlay?.getChildByName('DialogDim'), dim = dimNode?.getComponent(Graphics);
        if (dim && dimNode) {
            const scale = this.overlay!.scale.y;
            const width = size.width / scale, height = size.height / scale;
            dimNode.setPosition(0, -this.layout.centerY / scale);
            dimNode.getComponent(UITransform)!.setContentSize(width, height);
            dim.clear(); dim.fillColor = ringColor(T.dim, 115); dim.rect(-width / 2, -height / 2, width, height); dim.fill();
        }
        this.dailyReward.relayout({ width: size.width, height: size.height, top: this.layout.top, bottom: this.layout.bottom });
    }
    private drawBackground(): void {
        const size = view.getVisibleSize();
        if (!this.background) this.background = this.makeNode(this.node, 'RingBackground', size.width, size.height);
        this.background.setSiblingIndex(0);
        const playing = this.page?.name === 'RingPlaying';
        const sprite = this.background.getComponent(Sprite) || this.background.addComponent(Sprite);
        const frame = this.frames![playing ? 'game-bg-mask' : 'home-bg'];
        sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.customMaterial = playing ? this.backgroundMaterial! : null;
        if (playing) {
            this.background.getComponent(UITransform)!.setContentSize(size.width, size.height);
            this.backgroundMaterial!.setProperty('screenRatio', new Vec4(1, size.height / size.width, 0, 0));
        } else {
            const cover = Math.max(size.width / frame.originalSize.width, size.height / frame.originalSize.height);
            this.background.getComponent(UITransform)!.setContentSize(frame.originalSize.width * cover, frame.originalSize.height * cover);
        }
    }
    private newPage(name: string): Node {
        this.clearPage(); this.hidePauseMenu();
        this.page = this.makeNode(this.node, name, 750, 1100);
        this.applyLayout(); this.drawBackground();
        this.toast = this.label(this.page, 'Toast', '', 20, 0, -536, 690, 24, T.ink, true);
        return this.page;
    }
    private clearPage(): void {
        this.guide?.dispose(); this.guide = undefined;
        this.effects?.dispose(); this.effects = undefined; this.propBadges.clear();
        if (this.page && this.page === this.selectionRoot) {
            this.releasePressedTile(); if (this.selectionView) { this.selectionView.drag = undefined; this.selectionView.sliding = false; }
            this.page.active = false;
        } else this.destroyNode(this.page);
        this.page = undefined; this.board = undefined; this.boardInput = undefined; this.progressBar = undefined;
        if (this.toast) this.toast.string = '';
        this.toast = undefined; this.toastTime = 0;
    }
    private destroyNode(node?: Node): void {
        if (!node?.isValid) return;
        if (node === this.selectionRoot && this.selectionView) {
            for (const list of this.selectionView.tiles) for (const tile of list) Tween.stopAllByTarget(tile.press);
        }
        const walk = (n: Node) => {
            Tween.stopAllByTarget(n);
            const opacity = n.getComponent(UIOpacity); if (opacity) Tween.stopAllByTarget(opacity);
            n.children.forEach(walk);
        }; walk(node);
        node.removeFromParent(); node.destroy();
    }

    private showSelection(): void {
        if (!this.save || !this.bank || this.state === 'disposed') return;
        const entering = this.state !== 'selecting';
        this.finishGesture(); this.persist(); this.finishDailyHintReward(); this.state = 'selecting'; this.model = undefined;
        this.busy = false;
        this.audioBank?.setMusicOverride(this.titleMusic);
        this.clearPage(); this.hidePauseMenu(); this.applyLayout(); this.buildSelection();
        const root = this.selectionRoot!, view = this.selectionView!;
        root.active = true; root.setSiblingIndex(this.node.children.length - 1);
        this.page = root; this.toast = this.selectionToast; this.toastTime = 0;
        this.applyLayout(); this.drawBackground();
        if (entering) this.selectionPage = Math.floor((this.save.modes[this.mode].current - 1) / this.selectionLayout.pageSize);
        const opacity = view.track.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(view.track); Tween.stopAllByTarget(opacity); opacity.opacity = 255;
        view.sliding = false; view.drag = undefined;
        this.refreshSelectionMode();
    }
    /** 按当前布局建好隐藏的选关页；布局（安全区、每页行数）未变时复用已有节点。 */
    private buildSelection(): void {
        const selection = this.selectionLayout, key = JSON.stringify(selection);
        if (this.selectionRoot?.isValid && this.selectionKey === key) return;
        if (this.selectionRoot && this.page === this.selectionRoot) this.page = undefined;
        this.destroyNode(this.selectionRoot); this.selectionKey = key;
        const page = this.selectionRoot = this.makeNode(this.node, 'LevelSelection', 750, view.getVisibleSize().height);
        page.active = false;
        this.iconButton(page, 'SelectionLobby', 'back', -306, selection.titleY, () => this.context?.requestLobby(this.result()));
        // 标题两侧各一只与棋盘同材质的陶瓷 C 形环，缺口朝外，一眼看出是解圆环的选关页。
        const deco = this.makeNode(page, 'TitleRings', 750, 120, 0, selection.titleY);
        const decoShadows = this.makeNode(deco, 'Shadows', 750, 120), decoRings = this.makeNode(deco, 'Rings', 750, 120);
        for (const [x, angle, color] of [[-148, 200, T.colors[0]], [148, -20, T.colors[1]]] as const) {
            for (const [layer, shadow] of [[decoShadows, true], [decoRings, false]] as const) {
                const node = this.tileRing(layer, shadow ? 'TitleRingShadow' : 'TitleRing', x, 0, RING_TILE.decoScale, shadow);
                node.angle = angle; if (!shadow) node.getComponent(RotateRingsMeshSprite)!.color = ringColor(color);
            }
        }
        this.label(page, 'SelectionTitle', '解个圆环', 46, 0, selection.titleY, 240, 70, T.ink, true);
        this.label(page, 'SelectionSubtitle', '转动缺口，慢慢解开每一个环', 24, 0, selection.subtitleY, 650, 40, T.muted);
        for (const [mode, x] of [['normal', -155], ['hard', 155]] as const) {
            this.button(page, mode === 'normal' ? 'NormalMode' : 'HardMode', T.modeNames[mode], x, selection.tabsY, 292, 70,
                () => this.switchSelectionMode(mode), this.mode === mode);
        }
        this.label(page, 'ModeProgress', '', 25, 0, selection.progressY, 660, 42, T.muted);
        this.image(page, 'HardFlame', 'hard_flame', 263, selection.tabsY, 34, 42);
        // 关卡格本身不吃触摸：按下、拖动和点击统一由翻页区判定，从格子上开始拖也能翻页。
        const pager = this.makeNode(page, 'LevelPager', 750, selection.gridHeight + 40, 0, selection.gridY);
        const track = this.makeNode(pager, 'LevelTrack', 750, selection.gridHeight + 40); track.addComponent(UIOpacity);
        // 三个槽位的关卡格只建一次，翻页和切换模式只改釉色、缺口朝向与数字，不再销毁重建节点和文字纹理。
        const slots: Node[] = [], tiles: RingTile[][] = [];
        for (const slot of [-1, 0, 1]) {
            const node = this.makeNode(track, `LevelSlot${slot}`, 750, selection.gridHeight + 40, slot * 750, 0);
            const layers = ['Glows', 'Shadows', 'Rings', 'Texts', 'Locks'].map(name => this.makeNode(node, name, 750, selection.gridHeight + 40));
            const list: RingTile[] = [];
            for (let index = 0; index < selection.pageSize; index++) list.push(this.levelTile(layers, index));
            slots.push(node); tiles.push(list);
        }
        this.selectionView = { track, slots, tiles, pages: 1, sliding: false, time: 0 };
        pager.on(Node.EventType.TOUCH_START, this.pagerStart, this);
        pager.on(Node.EventType.TOUCH_MOVE, this.pagerMove, this);
        pager.on(Node.EventType.TOUCH_END, this.pagerEnd, this);
        pager.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.pagerEnd(event, true), this);
        this.label(page, 'PageNumber', '', 28, 0, selection.pageNumberY, 320, 42, T.ink, true);
        this.iconButton(page, 'PreviousPage', 'left', -306, selection.trayY, () => this.changeSelectionPage(-1));
        this.iconButton(page, 'NextPage', 'right', 306, selection.trayY, () => this.changeSelectionPage(1));
        for (const [name, caption, primary, x] of [['JumpCurrent', '当前关卡', true, -126], ['JumpLatest', '最新解锁', false, 126]] as const) {
            const button = this.button(page, name, '', x, selection.trayY, 224, 92, () => {
                const save = this.save, bank = this.bank; if (!save || !bank) return;
                const progress = save.modes[this.mode];
                this.jumpSelection(name === 'JumpCurrent' ? progress.current : ringUnlocked(bank, this.mode, progress));
            }, primary);
            const text = button.getChildByName('Text')!; text.setPosition(0, -12);
            const label = text.getComponent(Label)!; label.fontSize = 28; label.lineHeight = 34;
            this.label(button, 'Caption', caption, 18, 0, 20, 200, 24, primary ? '#FFFFFF' : T.muted, true);
        }
        this.selectionToast = this.label(page, 'Toast', '', 20, 0, selection.toastY, 690, 24, T.ink, true);
    }
    /** 选关内切换模式：原地更新页签、进度、跳转按钮和关卡格，不重建整页。 */
    private switchSelectionMode(mode: RingMode): void {
        const view = this.selectionView;
        if (!this.save || this.mode === mode || this.state !== 'selecting' || !view || view.sliding || view.drag) return;
        this.mode = mode; this.levelNumber = this.save.modes[mode].current;
        this.selectionPage = Math.floor((this.levelNumber - 1) / this.selectionLayout.pageSize);
        this.persist(false); this.refreshSelectionMode();
        Tween.stopAllByTarget(view.track.getComponent(UIOpacity)!);
        view.track.getComponent(UIOpacity)!.opacity = 255;
    }
    /** 当前模式相关的选关内容：页签样式、通关进度、困难火焰、跳转按钮数字、总页数与三页关卡格。 */
    private refreshSelectionMode(): void {
        const view = this.selectionView, page = this.selectionRoot, save = this.save, bank = this.bank;
        if (!view || !page || !save || !bank) return;
        const progress = save.modes[this.mode], levels = bank.modes[this.mode], unlocked = ringUnlocked(bank, this.mode, progress);
        this.styleButton(page.getChildByName('NormalMode')!, this.mode === 'normal');
        this.styleButton(page.getChildByName('HardMode')!, this.mode === 'hard');
        this.styleButton(page.getChildByName('JumpCurrent')!, true);
        page.getChildByName('ModeProgress')!.getComponent(Label)!.string = `已通关 ${progress.cleared} / ${levels.length} 关`;
        page.getChildByName('HardFlame')!.active = this.mode === 'hard';
        page.getChildByName('JumpCurrent')!.getChildByName('Text')!.getComponent(Label)!.string = `第 ${progress.current} 关`;
        page.getChildByName('JumpLatest')!.getChildByName('Text')!.getComponent(Label)!.string = `第 ${unlocked} 关`;
        view.pages = Math.ceil(levels.length / this.selectionLayout.pageSize);
        this.selectionPage = Math.max(0, Math.min(view.pages - 1, this.selectionPage));
        this.fillSelectionSlots(); this.refreshSelectionChrome();
    }
    /** 一只陶瓷 C 形环（或它的投影），缺口朝向节点局部 +X。 */
    private tileRing(parent: Node, name: string, x: number, y: number, scale: number, shadow = false): Node {
        const node = this.makeNode(parent, name, 6, 6, x, y); node.setScale(scale, scale, 1);
        node.addComponent(RotateRingsMeshSprite).configure(this.tileMesh!, this.frames!['ring-texture'], shadow ? this.tileShadowMaterial! : this.ringMaterial!);
        return node;
    }
    /** 关卡格：光晕、投影、陶瓷环、数字和锁扣常驻在各自图层，填充时按关卡状态切换。数字用字符缓存共享字形纹理。 */
    private levelTile(layers: Node[], index: number): RingTile {
        const selection = this.selectionLayout, pagerTop = selection.gridHeight / 2 + 20;
        const x = -248 + index % 5 * 124, y = pagerTop - 62 - Math.floor(index / 5) * selection.rowStep;
        const [glows, shadows, rings, texts, locks] = layers;
        const glow = this.image(glows, 'Glow', 'fx_glow', x, y, 150, 150);
        const shadow = this.tileRing(shadows, 'Shadow', x, y, RING_TILE.scale, true), ring = this.tileRing(rings, 'Level-0', x, y, RING_TILE.scale);
        const text = this.label(texts, 'Text', '', 30, x, y + 1, 64, 40, T.ink, true);
        // 字符缓存不支持合成粗体，用同色细描边补足笔画粗细。
        text.cacheMode = Label.CacheMode.CHAR; text.enableOutline = true; text.outlineWidth = 1;
        const lock = this.image(locks, 'Locked', 'badge_lock', x, y - RING_TILE.lockRadius, 28, 28);
        return { number: 0, x, y, press: { scale: 1 }, spin: 0, glow, shadow, ring, text, lock };
    }
    /** 按压、跳转弹跳与当前关的放大共同决定一格的整体缩放；锁扣跟随缩放留在缺口处。 */
    private placeTile(tile: RingTile): void {
        const base = tile.number === this.currentSelectionLevel() ? RING_TILE.currentScale : 1, s = base * tile.press.scale, ring = RING_TILE.scale * s;
        tile.ring.setScale(ring, ring, 1); tile.shadow.setScale(ring, ring, 1);
        tile.glow.setScale(s, s, 1); tile.text.node.setScale(s, s, 1); tile.lock.setScale(s, s, 1);
        tile.lock.setPosition(tile.x, tile.y - RING_TILE.lockRadius * s);
    }
    private currentSelectionLevel(): number { return this.save?.modes[this.mode].current ?? 0; }
    /** 槽位 -1/0/1 依次放上一页、当前页、下一页；越界的格子隐藏。
     * 已通关：按关卡序号轮换七色釉、缺口朝向各不相同；当前关：模式主色、光晕呼吸并缓慢转动缺口；未解锁：浅灰釉，缺口朝下卡着一枚锁。 */
    private fillSelectionSlots(): void {
        const view = this.selectionView, save = this.save, bank = this.bank;
        if (!view || !save || !bank) return;
        const selection = this.selectionLayout, progress = save.modes[this.mode], levels = bank.modes[this.mode];
        const unlocked = ringUnlocked(bank, this.mode, progress);
        view.track.setPosition(0, 0);
        view.tiles.forEach((list, i) => {
            const pageIndex = this.selectionPage + i - 1;
            list.forEach((tile, index) => {
                const number = pageIndex * selection.pageSize + index + 1;
                const visible = pageIndex >= 0 && pageIndex < view.pages && number <= levels.length;
                for (const node of [tile.ring, tile.shadow, tile.text.node]) node.active = visible;
                tile.number = visible ? number : 0; tile.ring.name = `Level-${tile.number}`;
                Tween.stopAllByTarget(tile.press); tile.press.scale = 1;
                if (!visible) { tile.glow.active = false; tile.lock.active = false; return; }
                const locked = number > unlocked, current = number === progress.current && !locked;
                const color = locked ? T.lockedRing : current ? this.accent() : T.colors[(number - 1) % T.colors.length];
                tile.ring.getComponent(RotateRingsMeshSprite)!.color = ringColor(color);
                tile.spin = locked ? -90 : current ? 45 : (number * 137.5) % 360;
                tile.ring.angle = tile.shadow.angle = tile.spin;
                tile.text.string = String(number);
                const ink = ringColor(locked ? T.lockedText : T.ink); tile.text.color = ink; tile.text.outlineColor = ink;
                tile.lock.active = locked; tile.glow.active = current;
                if (current) tile.glow.getComponent(Sprite)!.color = ringColor(this.accent(), 150);
                this.placeTile(tile);
            });
        });
        this.setSelectionSlotsVisible(!!view.drag?.moved || view.sliding);
    }
    /** 静止时相邻两页完全在屏外；拖动/翻页前恢复，落位后只提交当前页的网格和文字。 */
    private setSelectionSlotsVisible(expanded: boolean): void {
        this.selectionView?.slots.forEach((slot, index) => { slot.active = expanded || index === 1; });
    }
    /** 选关常驻动画：当前关的环缓慢转动缺口、光晕呼吸。随游戏 update 推进，离开选关即停。 */
    private animateSelection(delta: number): void {
        const view = this.selectionView; if (!view) return;
        view.time += delta;
        const current = this.currentSelectionLevel(), pulse = .5 + .5 * Math.sin(view.time * 2.4);
        for (const list of view.tiles) for (const tile of list) {
            if (tile.number !== current || !tile.glow.active) continue;
            tile.spin = (tile.spin + RING_TILE.spin * delta) % 360; tile.ring.angle = tile.shadow.angle = tile.spin;
            const glow = tile.glow.getComponent(Sprite)!, color = ringColor(this.accent(), Math.round(110 + 90 * pulse));
            glow.color = color; const s = tile.press.scale * (.94 + .1 * pulse); tile.glow.setScale(s, s, 1);
        }
    }
    private refreshSelectionChrome(): void {
        const view = this.selectionView, page = this.selectionRoot;
        if (!view || !page) return;
        page.getChildByName('PageNumber')!.getComponent(Label)!.string = `${this.selectionPage + 1} / ${view.pages}`;
        for (const [name, disabled] of [['PreviousPage', this.selectionPage === 0], ['NextPage', this.selectionPage + 1 >= view.pages]] as const) {
            page.getChildByName(name)!.getChildByName('Icon')!.getComponent(Sprite)!.color = ringColor(disabled ? T.disabledTint : '#FFFFFF');
        }
    }
    private pagerPoint(event: EventTouch, node: Node): Vec3 {
        const point = event.getLocation();
        return node.getComponent(UITransform)!.convertToNodeSpaceAR(this.camera!.screenToWorld(new Vec3(point.x, point.y, 0)));
    }
    private pagerStart(event: EventTouch): void {
        const view = this.selectionView;
        if (!view || view.sliding || view.drag || this.busy || this.state !== 'selecting') return;
        const point = this.pagerPoint(event, this.page!), slotPoint = this.pagerPoint(event, view.slots[1]);
        view.drag = { id: event.getID(), startX: point.x, startY: point.y, lastX: point.x, lastAt: Date.now(), velocity: 0, moved: false };
        view.pressed = view.tiles[1].find(tile => tile.number > 0 && Math.abs(tile.x - slotPoint.x) <= 50 && Math.abs(tile.y - slotPoint.y) <= 50);
        if (view.pressed) this.tweenTile(view.pressed, [[.08, .92]]);
    }
    private pagerMove(event: EventTouch): void {
        const view = this.selectionView, drag = view?.drag;
        if (!view || !drag || drag.id !== event.getID()) return;
        const point = this.pagerPoint(event, this.page!), now = Date.now();
        drag.velocity = (point.x - drag.lastX) / Math.max(1, now - drag.lastAt) * 1000;
        drag.lastX = point.x; drag.lastAt = now;
        let dx = point.x - drag.startX;
        if (!drag.moved && (Math.abs(dx) > 12 || Math.abs(point.y - drag.startY) > 12)) { drag.moved = true; this.releasePressedTile(); }
        // 首尾页继续拖只给阻尼，松手回弹；拖到一半停住时轨道就停在手指位置。
        if ((dx > 0 && this.selectionPage === 0) || (dx < 0 && this.selectionPage + 1 >= view.pages)) dx *= .3;
        if (drag.moved) { this.setSelectionSlotsVisible(true); view.track.setPosition(dx, 0); }
    }
    private pagerEnd(event: EventTouch, cancelled = false): void {
        const view = this.selectionView, drag = view?.drag;
        if (!view || !drag || drag.id !== event.getID()) return;
        view.drag = undefined;
        const tile = view.pressed; this.releasePressedTile();
        if (!drag.moved) {
            if (!cancelled && tile) this.tapLevelTile(tile.number);
            return;
        }
        const dx = this.pagerPoint(event, this.page!).x - drag.startX;
        // 停住后再松手不算甩动：最后一次移动距今超过 100ms 时速度归零，只按拖动距离判定。
        const velocity = Date.now() - drag.lastAt > 100 ? 0 : drag.velocity;
        this.changeSelectionPage(cancelled ? 0 : dx < -135 || (dx < -12 && velocity < -600) ? 1
            : dx > 135 || (dx > 12 && velocity > 600) ? -1 : 0);
    }
    private releasePressedTile(): void {
        const tile = this.selectionView?.pressed; if (!tile) return;
        this.selectionView!.pressed = undefined;
        if (tile.ring.isValid) this.tweenTile(tile, [[.1, 1, 'backOut']]);
    }
    /** 依次缓动一格的按压缩放：[时长, 目标缩放, 缓动]。 */
    private tweenTile(tile: RingTile, steps: [number, number, ('quadOut' | 'backOut')?][]): void {
        Tween.stopAllByTarget(tile.press);
        let chain = tween(tile.press);
        for (const [duration, scale, easing] of steps) {
            chain = chain.to(duration, { scale }, { easing: easing ?? 'quadOut', onUpdate: () => { if (tile.ring.isValid) this.placeTile(tile); } });
        }
        chain.start();
    }
    private tapLevelTile(number: number): void {
        if (!this.save || !this.bank) return;
        this.context?.services.feedback.play('uiButton', { vibrate: false });
        const unlocked = ringUnlocked(this.bank, this.mode, this.save.modes[this.mode]);
        if (number > unlocked) { this.showToast(`先通关第 ${unlocked} 关即可继续解锁`); return; }
        void this.openLevel(number);
    }
    /** 轨道滑到目标页后轮换槽位内容；delta 为 0 时回弹到原位。 */
    private changeSelectionPage(delta: number, onDone?: () => void): void {
        const view = this.selectionView;
        if (!view || view.sliding || this.state !== 'selecting') return;
        if (this.selectionPage + delta < 0 || this.selectionPage + delta >= view.pages) delta = 0;
        view.sliding = true; Tween.stopAllByTarget(view.track);
        this.setSelectionSlotsVisible(true);
        tween(view.track).to(.22, { position: new Vec3(-delta * 750, 0, 0) }, { easing: 'quadOut' }).call(() => {
            if (this.selectionView !== view) return;
            view.sliding = false;
            if (delta) { this.selectionPage += delta; this.fillSelectionSlots(); this.refreshSelectionChrome(); }
            this.setSelectionSlotsVisible(false);
            onDone?.();
        }).start();
    }
    /** 底部跳转：相邻页滑过去，远页淡入；到位后让目标关卡格弹一下。 */
    private jumpSelection(number: number): void {
        const view = this.selectionView;
        if (!view || view.sliding) return;
        const target = Math.floor((number - 1) / this.selectionLayout.pageSize);
        const pulse = (): void => {
            const tile = this.selectionView?.tiles[1].find(item => item.number === number);
            if (tile) this.tweenTile(tile, [[.12, 1.12], [.18, 1, 'backOut']]);
        };
        if (Math.abs(target - this.selectionPage) <= 1) { this.changeSelectionPage(target - this.selectionPage, pulse); return; }
        this.selectionPage = target; this.fillSelectionSlots(); this.refreshSelectionChrome();
        const opacity = view.track.getComponent(UIOpacity)!; Tween.stopAllByTarget(opacity);
        opacity.opacity = 0; tween(opacity).to(.18, { opacity: 255 }).call(pulse).start();
    }

    private async openLevel(number: number, prepare = false): Promise<void> {
        const context = this.context, bank = this.bank, save = this.save;
        if (!context || !bank || !save || this.busy || this.state === 'disposed') return;
        if (number < 1 || number > ringUnlocked(bank, this.mode, save.modes[this.mode])) return;
        const generation = ++this.generation, mode = this.mode, previousState = this.state;
        this.busy = true; this.state = 'loading'; this.showToast('正在准备关卡…');
        try {
            const id = bank.modes[mode][number - 1].id;
            const { level, visuals } = await this.levelAssets!.load(id);
            if ((this.state as RingState) === 'disposed' || generation !== this.generation) return;
            if (level.id !== id || !Array.isArray(level.rings) || !Array.isArray(level.pullObjects)
                || level.rings.some(part => !visuals[part.id]) || level.pullObjects.some(part => !visuals[part.id] || (part.dragAxis !== 0 && part.dragAxis !== 90))) {
                throw new Error(`Original RotateRings level/mesh mismatch: ${id}`);
            }
            // 资源全部通过校验后一次性提交，失败重试不会混用新关卡和上一关的网格。
            this.loadedLevel = level; this.loadedVisuals = visuals;
            this.levelNumber = number; this.busy = false; this.startLevel(true, prepare);
        } catch (error: unknown) {
            if ((this.state as RingState) === 'disposed' || generation !== this.generation) return;
            console.warn('[RotateRings] Level load failed', error);
            this.busy = false; this.state = previousState; this.showToast('关卡加载失败，请点击重试');
            if (prepare) throw error;
        }
    }
    private startLevel(restore: boolean, prepare = false): void {
        if (!this.loadedLevel || !this.save || this.state === 'disposed') return;
        this.finishGesture(); this.hidePauseMenu();
        const progress = this.save.modes[this.mode];
        const draft = restore && progress.current === this.levelNumber ? progress.draft : undefined;
        this.model = new RotateRingsModel(this.loadedLevel, draft);
        this.comboStreak = Math.max(0, Math.min(9999, Number.isInteger(draft?.comboStreak) ? draft!.comboStreak! : 0));
        this.releaseOrder = [];
        this.comboMisses = Math.max(0, Math.min(9999, Number.isInteger(draft?.comboMisses) ? draft!.comboMisses! : 0));
        this.save.mode = this.mode; progress.current = this.levelNumber; this.saveTime = 0;
        if (this.dailyReward.active) this.finishDailyHintReward();
        this.state = prepare ? 'ready' : 'playing'; this.showPlaying(); this.persist();
        if (!prepare) this.enterPlaying();
    }
    private enterPlaying(): void {
        this.audioBank?.setMusicOverride(); this.context?.services.feedback.play('voice9', { vibrate: false });
        this.context?.reportEvent?.('level_start', { mode: this.mode, level: this.levelNumber, sourceLevel: this.loadedLevel.id },
            `${this.context.sessionId}:${this.mode}:${this.levelNumber}:${Date.now()}:start`);
        this.showDailyHintReward(); this.startFirstGuide(); this.checkCompletion();
    }
    private showPlaying(): void {
        if (!this.model) return;
        const page = this.newPage('RingPlaying'), play = this.playLayout;
        this.iconButton(page, 'Pause', 'pause', 306, play.headerY, () => this.context?.requestPause());
        // 顶部居中：关卡号 + 解环进度条；困难模式在关卡号左侧加火焰标记。
        const hud = RING_HUD, title = this.label(page, 'LevelTitle', `第 ${this.levelNumber} 关`, hud.titleSize, 0, play.headerY + hud.titleOffset,
            hud.titleWidth, hud.titleSize * 1.3, this.mode === 'hard' ? T.hard : T.ink, true);
        title.enableOutline = true; title.outlineColor = ringColor('#FFFFFF'); title.outlineWidth = 3;
        if (this.mode === 'hard') this.image(page, 'HardFlame', 'hard_flame', -hud.flameOffset, play.headerY + hud.titleOffset, 26, 32);
        const bar = this.makeNode(page, 'LevelProgress', hud.barWidth + 8, hud.barHeight + 8, 0, play.headerY + hud.barOffset);
        const progress = this.model.total ? this.model.progress / this.model.total : 0;
        this.progressBar = { graphics: bar.addComponent(Graphics), shown: progress, target: progress, drawn: -1 };
        const input = this.makeNode(page, 'RingBoardInput', play.boardSafetyWidth, play.boardSafetyHeight, 0, play.boardY);
        this.boardInput = input;
        this.effects = new RotateRingsEffects(page, this.frames!, this.ringMaterial);
        this.board = new RotateRingsBoard(this.model, input.addComponent(Graphics), play.boardWidth, play.boardHeight,
            this.loadedVisuals, this.frames, true, this.ringMaterial, play.boardSafetyWidth, play.boardSafetyHeight, this.shadowMaterial,
            (id, angle) => this.playPartRelease(id, angle));
        this.board.draw();
        this.guide = new RotateRingsGuide(this.board, input, this.frames!.guide_hand);
        input.on(Node.EventType.TOUCH_START, this.touchStart, this); input.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        input.on(Node.EventType.TOUCH_END, this.touchEnd, this); input.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        this.propButton(page, 'hint', 0);
        this.applyLayout(); this.renderStatus();
    }

    private touchPoint(event: Pick<EventTouch, 'getLocation'>): RingPoint {
        const point = event.getLocation(), world = this.camera!.screenToWorld(new Vec3(point.x, point.y, 0));
        const local = this.boardInput!.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        return this.board!.world(local);
    }
    private touchStart(event: EventTouch): void {
        if (this.state !== 'playing' || !this.model || !this.board || this.overlay || this.dailyReward.active || this.busy) return;
        const p = this.touchPoint(event), hit = this.board.hit(this.board.point(p));
        if (!hit) return;
        if (this.gesture) {
            if (event.getID() !== this.gesture.touch) this.waitingTouches.add(event.getID());
        } else this.beginTouchGesture(event.getID(), p, hit);
        event.propagationStopped = true;
    }
    private beginTouchGesture(touch: number, point: RingPoint, hit: { kind: 'ring' | 'pull'; id: string }): void {
        this.guide?.dispose();
        if (this.toastTime < 0 && this.toast) { this.toast.string = ''; this.toastTime = 0; }
        const ring = hit.kind === 'ring' ? this.model.pose(hit.id) : undefined;
        this.model.beginGesture();
        this.gesture = { ...hit, touch, point, angle: ring ? G.angleTo(ring, point) : 0, changed: false,
            removedBefore: Array.from(this.model.removedRings).concat(Array.from(this.model.removedPulls)),
            bombsBefore: Array.from(this.model.explodedBombs), progressBefore: this.model.progress };
        this.board.selected = hit.id; this.board.hint = undefined; this.boardDirty = true;
    }
    private touchMove(event: EventTouch): void {
        const gesture = this.gesture, model = this.model;
        if (this.state !== 'playing' || !gesture || !model || event.getID() !== gesture.touch) return;
        const p = this.touchPoint(event);
        if (gesture.kind === 'ring') {
            if (model.removedRings.has(gesture.id)) return;
            const ring = model.pose(gesture.id);
            if (G.distance(p, ring) < ring.inner * .35) return;
            const pointerAngle = G.angleTo(ring, p), delta = G.angleDiff(pointerAngle, gesture.angle);
            gesture.angle = pointerAngle;
            const result = model.rotateRing(ring.id, ring.angle + delta);
            gesture.changed ||= result.rotated > .001;
            if (result.blocked) { this.board?.blocked(gesture.id); this.context?.services.feedback.play('collision', { minIntervalMs: 180, volume: .55 }); }
            else if (result.rotated > 2) this.context?.services.feedback.play('drop', { minIntervalMs: 95, volume: .6, vibrate: false });
        } else {
            const axis = G.polar(1, model.pullAxis(gesture.id));
            const delta = (p.x - gesture.point.x) * axis.x + (p.y - gesture.point.y) * axis.y;
            const result = model.dragPull(gesture.id, this.board!.limitPullDelta(gesture.id, delta)); gesture.changed ||= Math.abs(result.moved) > .001;
            if (result.blocked) this.context?.services.feedback.play('collision', { minIntervalMs: 180, volume: .55 });
            else if (Math.abs(result.moved) > .03) this.context?.services.feedback.play('fold', { minIntervalMs: 150, volume: .5, vibrate: false });
        }
        gesture.point = p;
        this.renderStatus();
        event.propagationStopped = true;
    }
    private touchEnd(event: EventTouch): void {
        if (this.gesture?.touch !== event.getID()) { this.waitingTouches.delete(event.getID()); return; }
        const waiting = event.getAllTouches().filter(touch => this.waitingTouches.has(touch.getID()));
        this.finishGesture(); this.renderStatus(); this.persist(); this.checkCompletion();
        if (this.state === 'playing' && this.board && !this.overlay && !this.dailyReward.active && !this.busy) {
            // 先提交旧拖动的消除，再用存活触点的最新位置命中剩余实体；全程只允许一个活动拖动。
            for (const touch of waiting) {
                const point = this.touchPoint(touch), hit = this.board.hit(this.board.point(point));
                if (!hit) continue;
                if (this.gesture) this.waitingTouches.add(touch.getID());
                else this.beginTouchGesture(touch.getID(), point, hit);
            }
        }
        this.startFirstGuide(); event.propagationStopped = true;
    }
    private finishGesture(): void {
        this.waitingTouches.clear();
        if (!this.gesture) return;
        const gesture = this.gesture, model = this.model;
        model?.endGesture(gesture.changed); this.gesture = undefined;
        if (model && gesture.changed) {
            if (model.explodedBombs.size > gesture.bombsBefore.length) {
                model.explodedBombs.forEach(index => {
                    if (gesture.bombsBefore.indexOf(index) >= 0) return;
                    const point = this.board!.point(model.bombPoint(index, true));
                    this.effects?.bomb({ x: point.x, y: point.y + this.playLayout.boardY });
                });
                this.context?.services.feedback.play('danger', { minIntervalMs: 80 }); this.animationTime = 1;
            }
            const released = Array.from(model.removedRings).concat(Array.from(model.removedPulls)).filter(id => gesture.removedBefore.indexOf(id) < 0);
            // 消除由 playPartRelease 播放碎裂声；只脱开卡扣时用轻提示，避免没碎也响碎裂声。
            if (model.progress > gesture.progressBefore) {
                if (!released.length) this.context?.services.feedback.play('merge', { minIntervalMs: 90, volume: .6, vibrate: false });
                this.animationTime = .7;
            }
            if (this.save && gesture.kind === 'ring') this.save.tutorialCompleted = true;
            this.evaluateCombo(released);
        }
        if (this.board) { this.board.selected = undefined; this.board.draw(0); }
        this.boardDirty = true;
    }
    private renderStatus(): void {
        const model = this.model; if (!model) return;
        if (this.progressBar) this.progressBar.target = model.total ? model.progress / model.total : 1;
        const adsEnabled = this.context!.services.ads.isEnabledForGame(this.context!.gameId);
        this.propBadges.forEach((badge, prop) => {
            const stock = this.save!.props[prop], count = Math.max(0, stock - this.dailyHintReward), showAd = stock <= 0 && adsEnabled;
            badge.count.string = String(count);
            badge.number.active = !showAd; badge.count.node.active = !showAd; badge.ad.active = showAd;
        });
        this.boardDirty = true;
    }
    private showHint(): boolean {
        if (this.state !== 'playing' || !this.model || !this.board) return false;
        this.finishGesture();
        const hint = this.model.hint();
        if (!hint) { this.showToast('试试先移动外侧滑杆，或转动相邻圆环的缺口'); return false; }
        this.board.hint = hint; this.guide?.start(hint); this.renderStatus(); this.guide?.update(0); this.boardDirty = true;
        if (hint.kind === 'ring') this.showToast('转动高亮圆环，把缺口对准小圆标记');
        else {
            const axis = G.polar(Math.sign(hint.target), this.model.pullAxis(hint.id));
            const direction = Math.abs(axis.x) > Math.abs(axis.y) ? axis.x > 0 ? '右' : '左' : axis.y > 0 ? '上' : '下';
            this.showToast(`试着向${direction}拉动高亮滑杆`);
        }
        return true;
    }
    private propButton(page: Node, prop: RingProp, x: number): void {
        const node = this.button(page, 'Hint', '', x, this.playLayout.propsY, 132, 134, () => this.requestProp(prop));
        this.destroyNode(node.getChildByName('ButtonFace')!);
        this.image(node, 'PropPlate', 'prop_plate', 0, 0, 132, 132);
        const frame = this.frames!.icon_hint;
        this.image(node, 'PropIcon', 'icon_hint', 0, 2, 72, 72 * frame.originalSize.height / frame.originalSize.width);
        const number = this.image(node, 'PropNumber', 'badge_number', 48, 48, 48, 48);
        const ad = this.image(node, 'PropAd', 'badge_ad', 48, 48, 48, 48); ad.active = false;
        const count = this.label(node, 'PropCount', String(this.save!.props.hint), 31, 48, 48, 42, 40, '#FFFFFF');
        this.propBadges.set(prop, { count, number, ad });
    }
    private requestProp(prop: RingProp): void {
        if (this.state !== 'playing' || !this.model || !this.save || !this.board || this.dailyReward.active || this.busy || this.overlay) return;
        this.finishGesture();
        if (this.save.props.hint <= 0) {
            const enabled = this.context!.services.ads.isEnabledForGame(this.context!.gameId);
            this.showDialog('提示已用完', '每天首次进入游戏赠送 3 个提示', [
                ...(enabled ? [{ name: 'PropReward', text: '看广告补充 3 个', icon: 'icon_ad', primary: true, action: () => this.rewardProp(prop) }] : []),
                { name: 'PropClose', text: '继续游戏', primary: !enabled, action: () => this.hidePauseMenu() },
            ]); return;
        }
        if (this.board.hint) { this.showToast('沿手指方向转动圆环，或拉动提示的滑杆'); return; }
        if (this.guide?.active && this.mode === 'normal' && this.levelNumber === 1 && !this.save.tutorialCompleted) {
            this.showToast('先跟着手指滑动圆环，首关引导不会消耗提示'); return;
        }
        if (this.showHint()) {
            this.save.props.hint--; this.context?.services.feedback.play('toggle', { vibrate: false }); this.persist(); this.renderStatus();
        }
    }
    private async rewardProp(prop: RingProp): Promise<void> {
        const context = this.context, model = this.model;
        if (!context || !model || !this.save || this.state !== 'playing' || this.busy
            || !context.services.ads.isEnabledForGame(context.gameId)) return;
        this.hidePauseMenu(); this.busy = true;
        try {
            const result = await context.services.ads.showRewarded({ placement: AD_PLACEMENTS.rotateRingsHint, gameId: context.gameId, sessionId: context.sessionId });
            if ((this.state as RingState) === 'disposed' || this.context !== context || this.model !== model) return;
            if (result.outcome === 'completed') {
                this.save!.props[prop] = Math.min(999, this.save!.props[prop] + 3); this.renderStatus(); this.persist(); this.showToast('已补充 3 个提示');
            } else if (result.errorCode !== 'not-configured') this.showToast(result.outcome === 'skipped' ? '广告未完成，未增加提示' : '暂时无法获取提示');
        } catch {
            if ((this.state as RingState) !== 'disposed' && this.context === context && this.model === model) this.showToast('暂时无法获取提示');
        } finally { if (this.context === context && this.model === model) this.busy = false; }
    }
    private startFirstGuide(): void {
        if (this.state !== 'playing' || this.mode !== 'normal' || this.levelNumber !== 1 || this.save?.tutorialCompleted
            || this.dailyReward.active || this.overlay || this.gesture || this.guide?.active) return;
        const hint = this.model?.hint(); if (!hint) return;
        this.guide?.start(hint); this.renderStatus(); this.guide?.update(0); this.boardDirty = true; this.showToast('跟着手指滑动，转动圆环的缺口', true);
    }
    private showDailyHintReward(): void {
        const amount = this.dailyHintReward;
        if (amount <= 0 || this.dailyReward.active || this.state !== 'playing') return;
        const layout = this.layout;
        this.dailyReward.start({
            parent: this.node, bounds: { width: 750, height: layout.height, top: layout.top, bottom: layout.bottom },
            titleFontSize: 30, titleGap: 28,
            systemFontOnly: true,
            colors: { dim: ringColor(T.dim, 135), shadow: ringColor('#000000', 60), accent: ringColor(T.gold), text: ringColor('#FFFFFF') },
            items: [{ caption: `提示 +${amount}`, createIcon: parent => {
                const frame = this.frames!.icon_hint_large;
                return this.image(parent, 'HintReward', 'icon_hint_large', 0, 0, 148, 148 * frame.originalSize.height / frame.originalSize.width);
            }, target: () => this.page?.getChildByName('Hint')?.getChildByName('PropIcon') ?? undefined,
            onArrive: () => { this.dailyHintReward = 0; this.renderStatus(); } }],
            onFinish: () => this.startFirstGuide(),
        });
        this.context?.services.feedback.play('toggle', { vibrate: false });
    }
    private finishDailyHintReward(): void {
        this.dailyReward.dispose(); this.dailyHintReward = 0;
        if (this.model && this.state !== 'disposed') this.renderStatus();
    }
    private playPartRelease(id: string, angle: number): void {
        if (this.releaseOrder.indexOf(id) < 0) this.releaseOrder.push(id);
        const board = this.board, model = this.model, mesh = this.loadedVisuals?.[id];
        const part = model?.rings.get(id) ?? model?.pulls.get(id);
        if (!board || !model || !mesh || !part || !this.effects) return;
        const axis = model.pulls.has(id) ? G.polar(model.offsets.get(id) ?? 0, model.pullAxis(id)) : { x: 0, y: 0 };
        const point = { x: part.x + axis.x, y: part.y + axis.y };
        this.effects.release(mesh, () => { const p = board.point(point); return { x: p.x, y: p.y + this.playLayout.boardY, angle, scale: board.transform.scale }; });
        this.context?.services.feedback.play('record', { minIntervalMs: 40, vibrate: false });
    }
    /** 进度条缓动到当前解环进度（约 0.3s 追上），暂停时随 update 冻结。 */
    private advanceProgress(delta: number): void {
        const bar = this.progressBar; if (!bar?.graphics.isValid) return;
        bar.shown += (bar.target - bar.shown) * Math.min(1, delta * 10);
        if (Math.abs(bar.target - bar.shown) < .002) bar.shown = bar.target;
        if (Math.abs(bar.shown - bar.drawn) < .001) return;
        bar.drawn = bar.shown;
        const g = bar.graphics, hud = RING_HUD, w = hud.barWidth, h = hud.barHeight, r = h / 2, fill = Math.max(0, Math.min(1, bar.shown)) * w;
        g.clear();
        g.fillColor = ringColor('#FFFFFF'); g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, r + 4); g.fill();
        g.fillColor = ringColor(T.track); g.roundRect(-w / 2, -h / 2, w, h, r); g.fill();
        if (fill > .5) {
            const width = Math.max(h, fill);
            g.fillColor = ringColor(this.accent()); g.roundRect(-w / 2, -h / 2, width, h, r); g.fill();
            g.fillColor = ringColor('#FFFFFF', 110); g.roundRect(-w / 2 + 4, h * .05, Math.max(0, width - 8), h * .28, h * .14); g.fill();
        }
    }
    private evaluateCombo(released: string[]): void {
        if (!released.length) { this.comboMisses = Math.min(9999, this.comboMisses + 1); return; }
        const misses = this.comboMisses;
        this.comboStreak = misses ? 1 : Math.min(9999, this.comboStreak + 1); this.comboMisses = 0;
        const tier = ringComboTier(this.comboStreak, released.length, misses);
        if (tier < 0 || !this.model || !this.board) return;
        const evaluation = RING_ENCOURAGEMENTS[tier];
        const points = released.map(id => {
            const ring = this.model!.rings.get(id), pull = this.model!.pulls.get(id), part = ring ?? pull!;
            const offset = pull ? G.polar(this.model!.offsets.get(id) ?? 0, this.model!.pullAxis(id)) : { x: 0, y: 0 };
            return this.board!.point({ x: part.x + offset.x, y: part.y + offset.y });
        });
        const point = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
            y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
        this.effects?.combo(evaluation.key, { x: point.x, y: point.y + this.playLayout.boardY },
            { left: -375, right: 375, top: this.playLayout.headerY - 70, bottom: this.playLayout.propsY + 98 });
        this.context?.services.feedback.play(evaluation.voice, { vibrate: false });
    }

    private checkCompletion(): void {
        const model = this.model, save = this.save, bank = this.bank;
        if (this.state !== 'playing' || !model?.completed || !save || !bank) return;
        this.finishGesture(); this.state = 'completed';
        completeRingLevel(save, bank, this.mode, this.levelNumber, { moves: model.moves, seconds: model.seconds });
        this.renderStatus();
        this.persist(false); this.context?.reportScore(this.clearedTotal()); this.context?.reportRoundFinished?.();
        if (this.mode === 'normal') this.context?.reportAchievementProgress('normal-cleared-level', save.modes.normal.cleared);
        this.context?.reportEvent?.('level_complete', { mode: this.mode, level: this.levelNumber, sourceLevel: model.level.id,
            moves: model.moves, seconds: Math.round(model.seconds) }, `${this.context.sessionId}:${this.mode}:${this.levelNumber}:complete`);
        this.context?.services.feedback.play('milestone', { vibrate: false });
        this.boardDirty = true; this.animationTime = 1;
        this.scheduleOnce(() => {
            if (this.state !== 'completed' || this.model !== model) return;
            this.showCompletion(this.levelNumber === bank.modes[this.mode].length);
        }, 1);
    }

    private persist(snapshot = true): void {
        const context = this.context, save = this.save, model = this.model;
        if (!context || !save) return;
        if (snapshot && model && !model.completed && (this.state === 'playing' || this.state === 'paused' || this.state === 'ready')) {
            save.modes[this.mode].current = this.levelNumber;
            save.modes[this.mode].draft = { ...model.snapshot(), comboStreak: this.comboStreak, comboMisses: this.comboMisses };
        }
        const previous = context.services.storage.getGameData(context.gameId);
        try {
            // 保留运行层写入的成就指标等字段，只更新本作自己的存档内容。
            context.services.storage.writeGameData(context.gameId, { ...previous, dataVersion: ROTATE_RINGS_SAVE_VERSION,
                playCount: previous?.playCount ?? 0, highScore: Math.max(previous?.highScore ?? 0, this.clearedTotal()),
                lastPlayedAt: Date.now(), custom: { rings: JSON.parse(JSON.stringify(save)) } });
        } catch (error: unknown) { console.warn('[RotateRings] Save failed', error); this.showToast('进度暂未保存，请稍后重试'); }
    }
    /** 本作没有分数：对运行层与存档的成绩统一报两种模式累计通关数（与 highScore 同口径）。 */
    private clearedTotal(): number { return this.save ? this.save.modes.normal.cleared + this.save.modes.hard.cleared : 0; }
    private result(): GameResult {
        return { score: this.clearedTotal(), duration: this.model?.seconds ?? 0, completed: this.model?.completed ?? false,
            extra: { mode: this.mode, level: this.levelNumber, moves: this.model?.moves ?? 0 } };
    }
    /** 本关圆环里最先出现的三种釉色（不足时用主题色补齐）。 */
    private levelColors(): string[] {
        const colors: string[] = [];
        for (const ring of this.loadedLevel?.rings ?? []) {
            const color = this.loadedVisuals?.[ring.id]?.color;
            if (color && colors.indexOf(color) < 0) colors.push(color);
            if (colors.length === 3) break;
        }
        for (const color of [T.colors[0], T.colors[1], T.colors[6]]) if (colors.length < 3 && colors.indexOf(color) < 0) colors.push(color);
        return colors;
    }
    private accent(): string { return this.mode === 'hard' ? T.hard : T.primary; }
    private showToast(text: string, duringGuide = false): void {
        if (this.toast?.isValid) {
            this.toast.string = text;
            this.toastTime = duringGuide ? -1 : 3;
            this.toast.fontSize = duringGuide ? 32 : 20; this.toast.lineHeight = duringGuide ? 40 : 24;
            this.toast.node.getComponent(UITransform)!.setContentSize(690, duringGuide ? 44 : 24);
            if (this.page?.name === 'RingPlaying') this.toast.node.setPosition(0, this.playLayout.propsY + 100);
        }
    }

    private showDialog(title: string, body: string, actions: RingAction[]): void {
        this.hidePauseMenu();
        const overlay = this.makeNode(this.node, 'RingDialog', 750, 1100); this.overlay = overlay;
        const dim = this.makeNode(overlay, 'DialogDim', 750, 1100); dim.addComponent(Graphics); dim.addComponent(BlockInputEvents); dim.addComponent(UIOpacity);
        overlay.addComponent(BlockInputEvents);
        const buttonHeights = actions.map(a => a.primary || a.name === 'PropClose' ? 104 : 96);
        const layout = calculateRingDialogLayout(buttonHeights);
        const content = this.makeNode(overlay, 'DialogContent', RING_DIALOG.width, layout.height); this.dialogContent = content;
        content.addComponent(UIOpacity); this.dialogTime = 0;
        this.image(content, 'DialogPanel', 'dialog_panel', 0, layout.panelY, RING_DIALOG.width, layout.panelHeight, true);
        this.image(content, 'DialogHeader', 'dialog_header', 0, layout.headerY, RING_DIALOG.headerWidth, RING_DIALOG.headerHeight);
        this.label(content, 'DialogTitle', title, 40, 0, layout.titleY, RING_DIALOG.titleWidth, 56, '#FFFFFF', true);
        this.label(content, 'DialogSubtitle', body, 26, 0, layout.subtitleY, 580, 88, T.muted);
        actions.forEach((a, i) => this.button(content, a.name, a.text, 0, layout.buttonYs[i], 532, buttonHeights[i], a.action, a.primary, undefined, a.icon));
        this.applyLayout(); this.updateDialog(0);
    }
    private updateDialog(delta: number): void {
        if (!this.dialogContent?.isValid || !this.overlay?.isValid) return;
        if (this.dialogTime >= SOURCE.popupOpen.duration) return;
        this.dialogTime = Math.min(SOURCE.popupOpen.duration, this.dialogTime + delta);
        const config = SOURCE.popupOpen, time = this.dialogTime;
        this.dialogContent.setScale(ringCurve(config.scaleX, time), ringCurve(config.scaleY, time), 1);
        this.dialogContent.getComponent(UIOpacity)!.opacity = Math.round(255 * ringCurve(config.opacity, time));
        this.overlay.getChildByName('DialogDim')!.getComponent(UIOpacity)!.opacity = Math.round(255 * ringCurve(config.maskOpacity, time));
    }
    /** 全屏通关页：选关背景铺满，主色柔光托着白卡，卡里是这一关开局的完整盘面；标题挤压弹出，
     * 模式关卡标签与唯一的「下一关」按钮依次浮现。 */
    private showCompletion(last: boolean): void {
        this.hidePauseMenu();
        const root = this.overlay = this.makeNode(this.node, 'RingComplete', 750, view.getVisibleSize().height), c = RING_COMPLETE;
        root.addComponent(BlockInputEvents);
        const backdrop = this.image(root, 'CompleteBackdrop', 'home-bg', 0, 0, 750, 1334); backdrop.addComponent(BlockInputEvents);
        this.fadeIn(backdrop, .3);
        const glow = this.image(root, 'CompleteGlow', 'fx_glow', 0, 0, c.glow, c.glow);
        glow.getComponent(Sprite)!.color = ringColor(this.accent(), 80); this.fadeIn(glow, .6, .1);
        // 白卡：柔和下投影 + 半透明白面，不用弹窗的蓝描边面板，避免看起来又是一个弹窗。
        const card = this.makeNode(root, 'CompleteCard', c.card, c.card), face = card.addComponent(Graphics), half = c.card / 2;
        face.fillColor = ringColor(T.shadow, 22); face.roundRect(-half + 4, -half - 12, c.card - 8, c.card, c.cardRadius); face.fill();
        face.fillColor = ringColor('#FFFFFF', 240); face.roundRect(-half, -half, c.card, c.card, c.cardRadius); face.fill();
        const parts = this.buildSolvedThumbnail(card);
        // 短彩带压在白卡之上、标题和按钮之下，从顶上持续撒落。
        const confetti = this.makeNode(root, 'CompleteConfetti', 750, 1334).addComponent(Graphics);
        const pieces = this.confettiPieces();
        // 标题：白色粗体 + 模式深色描边，挤压弹出。
        const titleText = last ? '全部解开了' : c.titles[Math.floor(Math.random() * c.titles.length)];
        const title = this.label(root, 'CompleteTitle', titleText, c.titleSize, 0, 0, 660, c.titleSize * 1.3, '#FFFFFF', true);
        title.enableOutline = true; title.outlineColor = ringColor(this.mode === 'hard' ? T.hardDeep : T.primaryDeep); title.outlineWidth = 6;
        title.enableShadow = true; title.shadowColor = ringColor(T.shadow, 60); title.shadowOffset = new Vec2(0, -5);
        const titleOpacity = title.node.addComponent(UIOpacity); titleOpacity.opacity = 0; title.node.setScale(1.4, 1.4, 1);
        tween(titleOpacity).delay(.12).to(.16, { opacity: 255 }).start();
        tween(title.node).delay(.12).to(.2, { scale: new Vec3(.94, .94, 1) }, { easing: 'quadIn' })
            .to(.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        const tagText = `${T.modeNames[this.mode]} · 第 ${this.levelNumber} 关`, tagWidth = 300, tagHeight = 54;
        const tag = this.makeNode(root, 'CompleteTag', tagWidth, tagHeight), pill = tag.addComponent(Graphics);
        pill.fillColor = ringColor('#FFFFFF', 225); pill.roundRect(-tagWidth / 2, -tagHeight / 2, tagWidth, tagHeight, tagHeight / 2); pill.fill();
        this.label(tag, 'CompleteTagText', tagText, 26, 0, 0, tagWidth - 24, tagHeight - 6, this.accent(), true);
        const next = this.button(root, 'NextLevel', last ? '全部完成 · 返回选关' : '下一关', 0, 0, 480, 104, () => {
            if (this.levelNumber >= (this.bank?.modes[this.mode].length ?? 0)) this.showSelection(); else void this.openLevel(this.levelNumber + 1);
        }, true);
        next.getChildByName('Text')!.getComponent(Label)!.fontSize = 34;
        this.completion = { time: 0, card, confetti, pieces, parts };
        this.layoutCompletion();
        this.reveal(tag, .26); this.reveal(next, .55);
        this.updateCompletion(0);
    }
    /** 白卡里的开局盘面：与关内同一套网格、材质、卡扣和炸弹图，按 fitRingBoard 适配到缩略框；
     * 快放顺序取本局实际消除顺序（续玩前已消除的部件排在最前，其余按关卡顺序补齐）。 */
    private buildSolvedThumbnail(card: Node): RingCompletion['parts'] {
        const level = this.loadedLevel, visuals = this.loadedVisuals, frames = this.frames, c = RING_COMPLETE;
        if (!level || !visuals || !frames || !this.ringMaterial || !this.shadowMaterial) return [];
        // 缩略按开局实际外形取包围盒（不含旋转包络和滑杆行程），让盘面填满卡片。
        const pose = new RotateRingsModel(level), bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        const extend = (x: number, y: number, r = 0) => {
            bounds.minX = Math.min(bounds.minX, x - r); bounds.maxX = Math.max(bounds.maxX, x + r);
            bounds.minY = Math.min(bounds.minY, y - r); bounds.maxY = Math.max(bounds.maxY, y + r);
        };
        // 圆环取外半径与销/卡口伸出的最远处，滑杆取碰撞轮廓；都按开局姿态，不含转动包络和拖动行程。
        level.rings.forEach(r => extend(r.x, r.y, Math.max(r.outer, ...r.pins.map(pin => pin.radius + Math.hypot(pin.mouthSize.x, pin.mouthSize.y) / 2)) + .1));
        level.pullObjects.forEach(p => G.polygonWorld(p.polyLocal, p.x, p.y, p.angle).forEach(q => extend(q.x, q.y, .1)));
        level.fixedObjects.forEach(f => extend(f.x, f.y, .5));
        level.bombs.forEach((b, i) => { const p = pose.bombPoint(i, true); extend(p.x, p.y, b.radius); });
        if (!Number.isFinite(bounds.minX)) return [];
        const fit = { scale: Math.min(c.thumb / Math.max(.01, bounds.maxX - bounds.minX), c.thumb / Math.max(.01, bounds.maxY - bounds.minY)),
            centerX: (bounds.minX + bounds.maxX) / 2, centerY: (bounds.minY + bounds.maxY) / 2 };
        const point = (p: RingPoint) => ({ x: (p.x - fit.centerX) * fit.scale, y: (p.y - fit.centerY) * fit.scale });
        const thumb = this.makeNode(card, 'Thumbnail', c.thumb, c.thumb);
        const [shadows, meshes, sprites] = ['Shadows', 'Meshes', 'Sprites'].map(name => this.makeNode(thumb, name, c.thumb, c.thumb));
        const order = level.rings.map(r => r.id).concat(level.pullObjects.map(p => p.id));
        const sequence = order.filter(id => this.releaseOrder.indexOf(id) < 0).concat(this.releaseOrder.filter(id => order.indexOf(id) >= 0));
        const step = Math.min(c.replayStep, c.replaySpan / Math.max(1, sequence.length));
        const parts: RingCompletion['parts'] = [];
        const mesh = (id: string, x: number, y: number, angle: number) => {
            const visual = visuals[id]; if (!visual) return;
            const p = point({ x, y }), shadow = this.makeNode(shadows, `Shadow-${id}`, 6, 6, p.x, p.y), node = this.makeNode(meshes, `Part-${id}`, 6, 6, p.x, p.y);
            shadow.addComponent(RotateRingsMeshSprite).configure(visual, frames['ring-texture'], this.shadowMaterial!);
            const sprite = node.addComponent(RotateRingsMeshSprite); sprite.configure(visual, frames['ring-texture'], this.ringMaterial!);
            const color = ringColor(visual.color); sprite.color = color;
            for (const n of [shadow, node]) { n.angle = angle; n.setScale(fit.scale, fit.scale, 1); }
            parts.push({ node, shadow, sprite, color, scale: fit.scale, at: c.replayStart + Math.max(0, sequence.indexOf(id)) * step });
        };
        for (const pull of level.pullObjects) mesh(pull.id, pull.x, pull.y, pull.angle);
        for (const ring of level.rings) mesh(ring.id, ring.x, ring.y, pose.angles.get(ring.id) ?? ring.angle);
        for (const fixed of level.fixedObjects) {
            const p = point(fixed), node = this.image(sprites, 'Catch', 'catch', p.x, p.y, .96 * fit.scale, .96 * fit.scale); node.angle = fixed.angle;
        }
        level.bombs.forEach((bomb, index) => {
            const p = point(pose.bombPoint(index, true)), size = bomb.radius * 2 * fit.scale;
            const node = this.image(sprites, 'Bomb', 'bomb', p.x, p.y, size, size); node.angle = pose.bombAngle(index);
        });
        return parts;
    }
    /** 通关页随窗口/安全区重排：背景 cover 铺满，标题与标签贴顶部安全边界，按钮贴底部安全边界，白卡居中且矮屏等比缩小。 */
    private layoutCompletion(): void {
        const root = this.overlay; if (!root?.isValid || root.name !== 'RingComplete') return;
        const size = view.getVisibleSize(), layout = this.layout, c = RING_COMPLETE;
        root.setScale(1, 1, 1); root.setPosition(0, 0); root.getComponent(UITransform)!.setContentSize(750, size.height);
        const backdrop = root.getChildByName('CompleteBackdrop')!, frame = this.frames!['home-bg'];
        const cover = Math.max(size.width / frame.originalSize.width, size.height / frame.originalSize.height);
        backdrop.getComponent(UITransform)!.setContentSize(frame.originalSize.width * cover, frame.originalSize.height * cover);
        const titleY = layout.top + c.titleOffset, tagY = layout.top + c.tagOffset, buttonY = layout.bottom + c.buttonOffset;
        root.getChildByName('CompleteTitle')?.setPosition(0, titleY);
        for (const [name, y] of [['CompleteTag', tagY], ['NextLevel', buttonY]] as const) {
            const node = root.getChildByName(name); if (!node) continue;
            // 浮现途中窗口变化：直接结束浮现补间并落到新位置，避免补间按旧坐标收尾。
            if (this.completion?.time) {
                Tween.stopAllByTarget(node); const opacity = node.getComponent(UIOpacity);
                if (opacity) { Tween.stopAllByTarget(opacity); opacity.opacity = 255; }
            }
            node.setPosition(0, y);
        }
        const top = tagY - 50, bottom = buttonY + 76, centerY = (top + bottom) / 2;
        root.getChildByName('CompleteCard')?.setPosition(0, centerY);
        root.getChildByName('CompleteGlow')?.setPosition(0, centerY);
        root.getChildByName('CompleteConfetti')?.getComponent(UITransform)!.setContentSize(size.width, size.height);
    }
    /** 卡片弹入后按缩放适配可用高度；部件依次弹跳并闪一下白釉光；礼花持续撒落。 */
    private updateCompletion(delta: number): void {
        const party = this.completion; if (!party || !this.overlay?.isValid) return;
        party.time += delta;
        const c = RING_COMPLETE, layout = this.layout, room = (layout.top + c.tagOffset - 50) - (layout.bottom + c.buttonOffset + 76);
        const fit = Math.min(1, room / (c.card + 20), 710 / (c.card + 20));
        const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
        const pop = Math.max(0, Math.min(1, party.time / c.cardPop)), cardScale = fit * (.86 + .14 * backOut(pop));
        party.card.setScale(cardScale, cardScale, 1);
        const opacity = party.card.getComponent(UIOpacity) ?? party.card.addComponent(UIOpacity); opacity.opacity = Math.round(255 * Math.min(1, party.time / .22));
        const tint = new Color();
        for (const part of party.parts) {
            const u = (party.time - part.at) / c.partPop, wave = u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0, scale = part.scale * (1 + c.partLift * wave);
            part.node.setScale(scale, scale, 1); part.shadow?.setScale(scale, scale, 1);
            if (part.sprite) part.sprite.color = tint.set(part.color).lerp(Color.WHITE, c.partFlash * wave);
        }
        this.drawConfetti(party);
    }
    /** 彩带参数：确定性伪随机（黄金比例序列），每次通关页都铺得均匀；大部分在 burst 内依次落下形成开场一阵，其余持续补位。 */
    private confettiPieces(): RingConfettiPiece[] {
        const c = RING_COMPLETE.confetti, colors = this.levelColors().concat([T.gold, T.colors[6], T.colors[3], T.gold]);
        const pick = (range: readonly number[], k: number) => range[0] + (range[1] - range[0]) * (k % 1);
        return Array.from({ length: c.count }, (_, i) => {
            return { color: ringColor(colors[i % colors.length]), x: (i * .38197 + .13) % 1,
                d0: (i < c.count * c.burstShare ? ((i * .7548) % 1) * c.burst : c.burst + ((i * .7548) % 1) * (1 - c.burst)),
                speed: pick(c.speed, i * .2925 + .1), sway: pick(c.sway, i * .5698), swayRate: pick(c.swayRate, i * .4142),
                phase: (i * 2.3999) % (Math.PI * 2), spin: (i % 2 ? 1 : -1) * pick(c.spin, i * .3183), flutter: pick(c.flutter, i * .7071),
                length: pick(c.length, i * .1732), width: pick(c.width, i * .8862), twist: pick(c.twist, i * .6180), curl: pick(c.curl, i * .2361) };
        });
    }
    /** 每帧重画全部短彩带：沿带长分段，每段宽度按该处扭转角的余弦变化（转到侧面就收窄），正面亮、背面暗；
     * 正面迎光提亮、背面略暗，避免暖色发褐。扭转随时间翻动，整条带随下落缓慢旋转、左右飘摆，落出底部回到顶上。 */
    private drawConfetti(party: RingCompletion): void {
        const g = party.confetti; if (!g.isValid) return;
        const size = view.getVisibleSize(), top = size.height / 2 + 60, span = size.height + 120, t = party.time, segments = RING_COMPLETE.confetti.segments;
        const shade = new Color(), xs: number[] = [], ys: number[] = [], hs: number[] = [], cs: number[] = [];
        g.clear();
        for (const p of party.pieces) {
            const travel = t * p.speed - p.d0 * span;
            if (travel < 0) continue;
            const y = top - (travel % span), x = (p.x - .5) * size.width + Math.sin(t * p.swayRate + p.phase) * p.sway;
            const a = (p.phase * 57.3 + t * p.spin) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
            for (let k = 0; k <= segments; k++) {
                const u = k / segments, lx = (u - .5) * p.length, ly = Math.sin(u * Math.PI + p.phase) * p.curl;
                xs[k] = x + lx * cos - ly * sin; ys[k] = y + lx * sin + ly * cos;
                const turn = Math.cos(p.phase + t * p.flutter + u * p.twist);
                hs[k] = p.width / 2 * Math.max(.08, Math.abs(turn)); cs[k] = turn;
            }
            // 带身法线取整条带的横向（局部 Y），每段画成一个四边形，颜色按该段两端的扭转平均。
            const nx = -sin, ny = cos;
            for (let k = 0; k < segments; k++) {
                // 正面迎光时向白色提亮，背面只压暗一成：橙、金等暖色乘暗会发褐。
                const face = (cs[k] + cs[k + 1]) / 2;
                if (face >= 0) shade.set(p.color).lerp(Color.WHITE, .28 * face); else shade.set(p.color.r * .9, p.color.g * .9, p.color.b * .9);
                shade.a = 240;
                g.fillColor = shade;
                g.moveTo(xs[k] + nx * hs[k], ys[k] + ny * hs[k]); g.lineTo(xs[k + 1] + nx * hs[k + 1], ys[k + 1] + ny * hs[k + 1]);
                g.lineTo(xs[k + 1] - nx * hs[k + 1], ys[k + 1] - ny * hs[k + 1]); g.lineTo(xs[k] - nx * hs[k], ys[k] - ny * hs[k]);
                g.close(); g.fill();
            }
        }
    }
    private fadeIn(node: Node, duration: number, delay = 0): void {
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0; tween(opacity).delay(delay).to(duration, { opacity: 255 }).start();
    }
    /** 自下方上浮并淡入。 */
    private reveal(node: Node, delay: number, rise = 26): void {
        const target = node.position.clone();
        node.setPosition(target.x, target.y - rise, target.z); this.fadeIn(node, .26, delay);
        tween(node).delay(delay).to(.26, { position: target }, { easing: 'quadOut' }).start();
    }
    private makeNode(parent: Node, name: string, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent); node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height); return node;
    }
    private label(parent: Node, name: string, text: string, fontSize: number, x: number, y: number,
        width: number, height: number, hex: string = T.ink, bold = false): Label {
        const node = this.makeNode(parent, name, width, height, x, y), label = node.addComponent(Label);
        label.string = text; label.fontSize = fontSize; label.lineHeight = fontSize * 1.3;
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.enableWrapText = true; label.fontFamily = 'Arial';
        label.color = ringColor(hex);
        label.font = null; label.useSystemFont = true;
        (node.getComponent(FontBinding) ?? node.addComponent(FontBinding)).systemFontOnly = true;
        setLabelBold(label, bold); return label;
    }
    private button(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number,
        action: () => void | Promise<void>, primary = false, tileFrame?: string, leadingIcon?: string): Node {
        const node = this.makeNode(parent, name, width, height, x, y);
        const tile = !!tileFrame, frame = tileFrame ?? this.buttonFrame(name, primary);
        // 胶囊底按原图高度九宫格拉宽后整体等比缩放，任何按钮高度下两端都保持正圆。
        const faceScale = tile ? 1 : height / this.frames![frame].originalSize.height;
        this.image(node, 'ButtonFace', frame, 0, 0, width / faceScale, height / faceScale, !tile).setScale(faceScale, faceScale, 1);
        this.label(node, 'Text', text, name.startsWith('Level-') ? 32 : 28, leadingIcon ? 30 : 0, 0,
            leadingIcon ? 230 : width - 20, height - 8, primary ? '#FFFFFF' : T.ink, true);
        if (leadingIcon) this.image(node, 'LeadingIcon', leadingIcon, -118, 0, 44, 44);
        const config = tile ? SOURCE.ButtonClickAnimationCfg.squareFrameClickEffectConfig
            : SOURCE.ButtonClickAnimationCfg.rectangleFrameClickEffectConfig;
        const down = config.pointerDownSequence.scaleKeyFrames[0], up = config.pointerUpSequence.scaleKeyFrames[0];
        let pointer: number | undefined, start: Vec2 | undefined;
        const reset = () => { Tween.stopAllByTarget(node); if (node.isValid) tween(node).to(up.duration,
            { scale: new Vec3(up.targetScale.x, up.targetScale.y, 1) }, { easing: t => ringCurve(up.curve.m_Curve, t) }).start(); };
        node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            if (pointer !== undefined || this.busy) return;
            pointer = e.getID(); start = e.getUILocation().clone();
            Tween.stopAllByTarget(node); tween(node).to(down.duration, { scale: new Vec3(down.targetScale.x, down.targetScale.y, 1) },
                { easing: t => ringCurve(down.curve.m_Curve, t) }).start(); e.propagationStopped = true;
        });
        node.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { pointer = undefined; start = undefined; reset(); e.propagationStopped = true; });
        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            const allowed = pointer === e.getID() && start && Vec2.distance(start, e.getUILocation()) < 20;
            pointer = undefined; start = undefined; reset(); e.propagationStopped = true;
            if (!allowed || this.busy || this.state === 'disposed') return;
            try { const result = action(); if (result && typeof result.then === 'function') void result.catch(error => {
                if (this.state !== 'disposed') { console.warn('[RotateRings] Action failed', error); this.showToast('操作未完成，请再试一次'); }
            }); } catch (error: unknown) { console.warn('[RotateRings] Action failed', error); }
            // 点击音在动作之后播放：设置钮会同步进入暂停并停止本局音效，先播就会被立即掐断。
            if ((this.state as RingState) !== 'disposed') this.context?.services.feedback.play('uiButton', { vibrate: false });
        });
        return node;
    }
    private buttonFrame(name: string, primary: boolean): string {
        return name === 'HardMode' && primary || primary && this.mode === 'hard' ? 'btn_primary_orange' : primary ? 'btn_primary_blue' : 'btn_secondary';
    }
    /** 胶囊按钮换主次样式：三种底图同高，沿用创建时的九宫格尺寸与缩放。 */
    private styleButton(node: Node, primary: boolean): void {
        node.getChildByName('ButtonFace')!.getComponent(Sprite)!.spriteFrame = this.frames![this.buttonFrame(node.name, primary)];
        node.getChildByName('Text')!.getComponent(Label)!.color = ringColor(primary ? '#FFFFFF' : T.ink);
        const caption = node.getChildByName('Caption')?.getComponent(Label);
        if (caption) caption.color = ringColor(primary ? '#FFFFFF' : T.muted);
    }
    private iconButton(parent: Node, name: string, icon: string, x: number, y: number, action: () => void | Promise<void>, disabled = false): Node {
        const node = this.button(parent, name, '', x, y, 76, 72, () => { if (!disabled) return action(); });
        this.destroyNode(node.getChildByName('ButtonFace')!);
        const image = this.image(node, 'Icon', icon === 'pause' ? 'btn_round_settings' : 'btn_round_back', 0, 0, 76, 76);
        if (icon === 'right') image.setScale(-1, 1, 1);
        if (disabled) image.getComponent(Sprite)!.color = ringColor(T.disabledTint); return node;
    }
    private image(parent: Node, name: string, frame: string, x: number, y: number, width: number, height: number, sliced = false): Node {
        const node = this.makeNode(parent, name, width, height, x, y), sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.frames![frame];
        sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE; return node;
    }
    private frameRect(frame: SpriteFrame): Vec4 {
        const uv = frame.uv; return new Vec4(uv[0], uv[1], uv[2] - uv[0], uv[5] - uv[1]);
    }
    private drawIcon(g: Graphics, icon: string, hex: string, size: number): void {
        g.strokeColor = ringColor(hex); g.fillColor = ringColor(hex); g.lineWidth = 3;
        if (icon === 'pause') { g.roundRect(-size * .7, -size, size * .45, size * 2, 3); g.roundRect(size * .25, -size, size * .45, size * 2, 3); g.fill(); }
        else if (icon === 'check') { g.moveTo(-size, 0); g.lineTo(-size * .2, -size * .65); g.lineTo(size, size * .65); g.stroke(); }
        else if (icon === 'lock') { g.roundRect(-size * .75, -size, size * 1.5, size * 1.3, 2); g.stroke(); g.arc(0, size * .25, size * .5, 0, Math.PI, false); g.stroke(); }
        else { const sign = icon === 'right' ? 1 : -1; g.moveTo(-sign * size * .35, size * .7); g.lineTo(sign * size * .35, 0); g.lineTo(-sign * size * .35, -size * .7); g.stroke(); }
    }
}
