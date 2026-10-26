import {
    _decorator, BlockInputEvents, Camera, Canvas, Color, Component, EventTouch, Graphics, Label, Node,
    ResolutionPolicy, Tween, tween, UIOpacity, UITransform, Vec2, Vec3, view,
} from 'cc';
import type { MiniGame, MiniGameContext, MiniGamePauseModel, MiniGameResultModel } from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import type { AdService } from '../../../services/ads/AdService';
import { setLabelBold } from '../../../services/font/FontBinding';
import { DailyToolRewardAnimation } from '../../../shared/ui/DailyToolRewardAnimation';
import type { ServerTimeService } from '../../../services/cloud/ServerTimeService';
import { MULTI_COLOR_FILL_LEVELS, type MultiColorFillMode } from './MultiColorFillLevels';
import { MultiColorFillModel } from './MultiColorFillModel';
import { MultiColorFillEffects } from './MultiColorFillEffects';
import { MultiColorFillGuide } from './MultiColorFillGuide';
import { FILL_NOTE_VOLUME, MultiColorFillMelody } from './MultiColorFillMelody';
import { completeFillLevel, fillUnlocked, grantFillDailyHints, MULTI_COLOR_FILL_DATA_VERSION, readFillSave, type MultiColorFillSave } from './MultiColorFillSave';
import { calculateFillLayout, type MultiColorFillLayout } from './MultiColorFillLayout';
import { FILL_AUDIO, FILL_MODE_NAMES, FILL_MODE_THEMES, FILL_THEME, FILL_WIN_TITLES, fillColorSets, type FillColorSet } from './MultiColorFillTheme';

const { ccclass } = _decorator;
/** 选关每页一段 5 × 6 的蛇形路线：奇数行从右往左折返，关卡号沿路线连续。 */
const SELECT_COLUMNS = 5;
const SELECT_ROWS = 6;
const PER_PAGE = SELECT_COLUMNS * SELECT_ROWS;
const SELECT_CACHE_X = 10000;
const PROGRESS_WIDTH = 552;
const NAV_CONTROL_SIZE = 72;
/** 通关页成品棋盘的最大边长。 */
const WIN_BOARD_SIZE = 460;
/** 关号和模式标签同排，下接细进度条；位置相对暂停按钮中心。 */
const HEADER = Object.freeze({ chip: 0, title: 0, progress: -72 });
type FillState = 'idle' | 'ready' | 'playing' | 'selecting' | 'paused' | 'completed' | 'disposed';
interface FillServices {
    readonly serverTime?: ServerTimeService;
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    readonly ads: AdService;
}
interface FillButton { readonly node: Node; readonly label: Label; }
type FillButtonStyle = 'primary' | 'secondary' | 'light' | 'dialog-primary';
interface OverlayAction { readonly name: string; readonly text: string; readonly primary?: boolean;
    readonly requiresUserGesture?: boolean; readonly action: () => void | Promise<void>; }
interface FillToast { readonly node: Node; readonly label: Label; readonly pill: Graphics; readonly opacity: UIOpacity; }
interface FillTile {
    readonly node: Node; readonly cell: number; readonly blocked: boolean;
    owner: number; animating: boolean;
}
interface FillTileRow { readonly graphics: Graphics; readonly tiles: FillTile[]; }
/** 离开选关时保留的整页节点；同一屏幕尺寸下再次进入直接复用，不再重建 90 个关卡格。 */
interface FillSelectCache { readonly page: Node; readonly view: FillLevelSelectView; readonly toast: FillToast; readonly key: string; }
interface FillLevelSelectView {
    readonly track: Node;
    readonly pages: Node[];
    /** 每个槽位当前画着的内容签名；签名不变就不重绘，翻页时槽位随页面一起轮转。 */
    readonly slotKeys: string[];
    /** 尚未补画的邻页槽位，逐帧各画一页。 */
    pendingSlots: number[];
    readonly previous: Node;
    readonly next: Node;
    /** 关卡圆点直径与相邻圆点的中心距。 */
    readonly diameter: number;
    readonly pitch: number;
    sliding: boolean;
    drag?: { readonly id: number; readonly startX: number; readonly startY: number; lastX: number; lastAt: number; velocity: number; moved: boolean };
}

function color(hex: string, alpha = 255): Color {
    const result = new Color(); Color.fromHEX(result, hex); result.a = alpha; return result;
}
const EMPTY_TILE = color(FILL_THEME.tile), EMPTY_SHADE = color(FILL_THEME.tileShade);
const WHITE = color('#FFFFFF'), WIN_FLASH = color('#FFFAC3');
const CELEBRATION_BLOCKS = Array.from({ length: 16 }, (_, i) => {
    const noise = (seed: number): number => { const v = Math.sin(seed * 12.9898) * 43758.5453; return v - Math.floor(v); };
    return { speed: 22 + 26 * noise(i + .3), phase: noise(i + .7),
        x: (i + .2 + .6 * noise(i + .1)) / 16, size: 12 + 16 * noise(i + .5) };
});

/** 彩路的页面、输入和生命周期；题库/模型完全独立，公共服务只从 Context 获取。 */
@ccclass('MultiColorFillGame')
export class MultiColorFillGame extends Component implements MiniGame<FillServices> {
    readonly backgroundPausePolicy = 'silent' as const;
    private state: FillState = 'idle';
    private context?: MiniGameContext<FillServices>;
    private save?: MultiColorFillSave;
    private model?: MultiColorFillModel;
    private mode: MultiColorFillMode = 'normal';
    private levelNumber = 1;
    private selectionMode: MultiColorFillMode = 'normal';
    private selectionPage = 0;
    private layout?: MultiColorFillLayout;
    private page?: Node;
    private background?: Node;
    private backgroundKey = '';
    private pageKind?: 'playing' | 'selecting';
    private overlay?: Node;
    private audioBank?: BundleAudioBank;
    private actionBusy = false;
    private selectionView?: FillLevelSelectView;
    private touchId?: number;
    private lastTouch?: Vec2;
    private boardInput?: Node;
    private uiCamera?: Camera;
    private tiles: FillTile[] = [];
    private tileRows: FillTileRow[] = [];
    private cellPoints: Vec2[] = [];
    private boardDirty = false;
    private boardPitch = -1;
    private boardRevision = -1;
    private syncedRevision = -1;
    private routesAnimating = false;
    private sparklesDrawing = false;
    private guideDrawing?: boolean;
    private fingerX = NaN;
    private fingerY = NaN;
    private fingerColor = -2;
    private routeGraphics?: Graphics;
    private capGraphics?: Graphics;
    private fingerGraphics?: Graphics;
    private boardSparkles?: Graphics;
    private guideGraphics?: Graphics;
    private guideLabel?: Label;
    private guideDetail?: Label;
    private pointerPoint?: Vec2;
    private bumpedCell = -1;
    private readonly effects = new MultiColorFillEffects();
    private readonly guide = new MultiColorFillGuide();
    private readonly melody = new MultiColorFillMelody();
    private colors: readonly FillColorSet[] = [];
    private inks: { readonly tile: Color; readonly line: Color; readonly inner: Color }[] = [];
    private readonly alphaInk = new Color();
    private winGraphics?: Graphics;
    private winBoard?: Graphics;
    private winCellPoints: Vec2[] = [];
    private winStep = 0;
    private winBoardDone = false;
    private overlayKind: 'dialog' | 'completion' = 'dialog';
    private progressGraphics?: Graphics;
    private progressLabel?: Label;
    private winTime = 0;
    private winTitle = FILL_WIN_TITLES[0] as string;
    private toast?: FillToast;
    private selectCache?: FillSelectCache;
    /** 选关预建倒计时（秒），-1 表示无待办；预建页渲染一帧后在下一次 update 收进缓存。 */
    private prewarmDelay = -1;
    private prewarmed?: FillSelectCache;
    /** 邻页补画前的等待（秒），让入场淡入先走完。 */
    private neighborDelay = 0;
    private hintCountLabel?: Label;
    private hintButton?: FillButton;
    private hintAdIcon?: Node;
    private hintOpacity?: UIOpacity;
    private adPending = false;
    private resizeListening = false;
    private autoSaveSeconds = 0;
    private readonly dailyReward = new DailyToolRewardAnimation();
    private dailyHintReward = 0;

    async initialize(context: MiniGameContext<FillServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize MultiColorFill from ${this.state}`);
        this.context = context;
        for (let parent: Node | null = this.node; parent; parent = parent.parent) {
            const camera = parent.getComponent(Canvas)?.cameraComponent;
            if (camera) { this.uiCamera = camera; break; }
        }
        if (!this.uiCamera) throw new Error('MultiColorFill UI camera is missing');
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
        const stored = context.services.storage.getGameData(context.gameId);
        const savedFill = stored?.dataVersion === MULTI_COLOR_FILL_DATA_VERSION ? stored.custom?.fill : undefined;
        this.save = readFillSave(savedFill, context.services.serverTime?.day);
        this.dailyHintReward = grantFillDailyHints(this.save, context.services.serverTime?.day);
        this.mode = this.save.mode;
        this.levelNumber = this.save.modes[this.mode].current;
        this.model = new MultiColorFillModel(this.levels().get(this.levelNumber - 1), this.save.modes[this.mode].draft);
        context.reportAchievementProgress('normal-cleared-level', this.save.modes.normal.cleared);
        this.resetEffects();
        this.rebuildPage();
        this.persist();
        view.on('canvas-resize', this.handleResize, this);
        this.resizeListening = true;
        this.audioBank = new BundleAudioBank(FILL_AUDIO, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if ((this.state as FillState) !== 'disposed') {
            // 加载层收起前准备当前选关页，首次点击也能直接复用。
            this.prewarmLevelSelect();
            this.state = 'ready';
        }
    }

    isGameplayActive(): boolean {
        return this.state === 'playing';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin MultiColorFill from ${this.state}`);
        this.state = 'playing';
        this.renderBoard();
        this.showDailyHintReward();
        this.schedulePrewarm();
        if (this.model?.completed) this.completeLevel();
    }

    pause(): boolean {
        if (this.state === 'paused') return true;
        if (this.state !== 'playing') return false;
        this.finishStroke();
        this.completeLevel();
        if ((this.state as FillState) !== 'playing') return false;
        this.persist();
        this.state = 'paused';
        this.dailyReward.setVisible(false);
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.dailyReward.setVisible(true);
        if (this.save) {
            const before = this.save.hints;
            if (grantFillDailyHints(this.save, this.context?.services.serverTime?.day)) {
                this.finishDailyHintReward();
                this.dailyHintReward = this.save.hints - before;
                this.persist();
                this.showDailyHintReward();
            }
        }
        this.renderBoard();
        this.completeLevel();
    }

    async restart(context?: MiniGameContext<FillServices>): Promise<void> {
        if (this.state === 'disposed') return;
        if (context) this.context = context;
        this.startLevel(this.mode, this.levelNumber, false);
    }

    discardSavedProgress(): void {
        if (!this.save) return;
        this.save.modes[this.mode].draft = undefined;
        this.persist(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.finishStroke();
        this.finishHint();
        this.persist();
        this.state = 'disposed';
        this.finishDailyHintReward();
        if (this.resizeListening) view.off('canvas-resize', this.handleResize, this);
        this.resizeListening = false;
        this.unscheduleAllCallbacks();
        this.destroyOverlay();
        this.clearPage();
        this.destroySelectCache();
        this.destroyNode(this.prewarmed?.page); this.prewarmed = undefined; this.prewarmDelay = -1;
        this.destroyNode(this.background);
        this.background = undefined; this.backgroundKey = ''; this.pageKind = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.layout = undefined;
        this.uiCamera = undefined;
        this.model = undefined;
        this.effects.dispose(); this.guide.dispose(); this.colors = []; this.inks = [];
        this.save = undefined;
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        if (this.state !== 'paused') return;
        this.showOverlay('休息一下', `${FILL_MODE_NAMES[this.mode]} · 第 ${this.levelNumber} 关`, [
            { name: 'Resume', text: '继续游戏', primary: true, action: () => model.resume() },
            { name: 'Restart', text: '重新开始', action: () => model.restart() },
            { name: 'Select', text: '选择关卡', action: async () => { await model.resume(); this.openLevelSelect(); } },
            { name: 'Lobby', text: '返回大厅', requiresUserGesture: true, action: () => model.exit() },
        ]);
    }

    hidePauseMenu(): void { this.destroyOverlay(); }
    showResultView(model: MiniGameResultModel): void {
        this.showOverlay('本局结束', undefined, [
            { name: 'Restart', text: '重新开始', primary: true, action: () => model.restart() },
            { name: 'Lobby', text: '返回大厅', requiresUserGesture: true, action: () => model.returnToLobby() },
        ]);
    }
    hideResultView(): void { this.destroyOverlay(); }

    protected update(deltaTime: number): void {
        this.runDeferredWork(Math.min(Math.max(deltaTime, 0), .25));
        if ((this.state === 'playing' || this.state === 'completed') && this.dailyReward.active) {
            this.dailyReward.advance(Math.min(Math.max(deltaTime, 0), .1));
            return;
        }
        if (!this.model || this.adPending || (this.state !== 'playing' && this.state !== 'completed')) return;
        const seconds = Math.min(Math.max(deltaTime, 0), .25), wasAnimating = this.effects.animating;
        this.guide.advance(seconds);
        if (this.guide.assisting) {
            const frame = this.guide.frame;
            if (frame) {
                const path = this.model.paths[frame.color];
                for (let index = path.length; index <= Math.floor(frame.position); index++) {
                    this.model.moveTo(frame.route[index]);
                    this.context?.services.feedback.play('drop', { volume: FILL_NOTE_VOLUME, variant: this.melody.noteFor(index) });
                }
            }
            if (this.guide.finished) {
                this.finishHint(); this.persist(); this.completeLevel();
            }
        }
        if (this.effects.advance(seconds) || wasAnimating || this.guide.active) this.boardDirty = true;
        if (this.state === 'completed') {
            if (!this.overlay && this.effects.readyToReveal) this.showCompletion();
            if (this.winGraphics?.isValid) { this.winTime += seconds; this.renderCelebration(); }
            return;
        }
        this.model.elapsed += Math.min(Math.max(deltaTime, 0), 1);
        this.autoSaveSeconds += deltaTime;
        if (this.autoSaveSeconds >= 5) { this.autoSaveSeconds = 0; this.persist(); }
    }

    /** 一帧可能收到多次触摸采样；模型与音效立即响应，几何在提交渲染前统一更新。 */
    protected lateUpdate(): void {
        if (this.boardDirty) this.renderBoard();
    }

    private syncBoardEffects(): void {
        if (!this.model || this.syncedRevision === this.model.revision) return;
        this.effects.sync(this.model.paths);
        this.syncedRevision = this.model.revision;
    }

    private requestBoardRender(): void {
        this.syncBoardEffects();
        this.boardDirty = true;
    }

    private levels(mode = this.mode) { return MULTI_COLOR_FILL_LEVELS[mode]; }

    private startLevel(mode: MultiColorFillMode, number: number, restore = true): void {
        if (!this.save || this.state === 'disposed') return;
        const progress = this.save.modes[mode];
        if (!Number.isInteger(number) || number < 1 || number > fillUnlocked(mode, progress)) return;
        this.finishDailyHintReward();
        this.finishStroke();
        this.finishHint();
        this.destroyOverlay();
        const continuing = restore && this.model && !this.model.completed && mode === this.mode && number === this.levelNumber;
        this.mode = mode;
        this.save.mode = mode;
        this.levelNumber = number;
        if (!continuing) {
            this.model = new MultiColorFillModel(this.levels().get(number - 1),
                restore && progress.current === number ? progress.draft : undefined);
            this.melody.pick();
        }
        progress.current = number;
        this.state = 'playing';
        this.resetEffects();
        this.autoSaveSeconds = 0;
        this.rebuildPage();
        this.persist();
        this.schedulePrewarm();
        if (this.model?.completed) this.completeLevel();
    }

    private resetEffects(): void {
        if (!this.model) return;
        this.effects.reset(this.model.paths, this.model.level.width * this.model.level.height, this.model.level.width);
        this.guide.reset(this.model.level.solution, this.mode === 'normal' && this.levelNumber === 1
            && this.model.strokes === 0
            && this.model.paths.every(path => path.length === 1));
        this.colors = fillColorSets(this.model.paths.length, this.levelNumber);
        this.inks = this.colors.map(set => {
            const inner = color(set.line); inner.r *= .35; inner.g *= .35; inner.b *= .35;
            return { tile: color(set.tile), line: color(set.line), inner };
        });
        this.syncedRevision = -1;
        this.pointerPoint = undefined;
    }

    private persist(snapshot = true): void {
        const context = this.context, save = this.save, model = this.model;
        if (!context || !save) return;
        if (snapshot && model && !model.completed) {
            const progress = save.modes[this.mode];
            progress.current = this.levelNumber;
            progress.draft = model.snapshot(true);
        }
        const stored = context.services.storage.getGameData(context.gameId);
        // StorageService 只冻结外层，独立序列化避免之后的棋盘操作修改已提交的存档。
        const previous = stored?.dataVersion === MULTI_COLOR_FILL_DATA_VERSION ? stored : undefined;
        const frozen = JSON.parse(JSON.stringify(save)) as MultiColorFillSave;
        try {
            context.services.storage.writeGameData(context.gameId, {
                dataVersion: MULTI_COLOR_FILL_DATA_VERSION,
                playCount: previous?.playCount ?? 0,
                highScore: Math.max(previous?.highScore ?? 0, save.modes.normal.cleared + save.modes.hard.cleared),
                lastPlayedAt: Date.now(), custom: { fill: frozen },
            });
        } catch (error: unknown) {
            console.warn('[MultiColorFill] Save failed', error);
            this.showToast('进度暂未保存，请稍后重试');
        }
    }

    private computeLayout(): MultiColorFillLayout {
        const size = view.getVisibleSize();
        const platform = this.context?.services.platform.getLayoutInfo();
        const level = this.model?.level;
        return calculateFillLayout(size.width, size.height, level?.width ?? 5, level?.height ?? 5, {
            top: platform?.safeArea.top,
            bottom: size.height - (platform?.safeArea.bottom ?? size.height),
            capsuleBottom: platform?.topRightReservedArea?.bottom,
        });
    }

    private handleResize(): void {
        if (this.state === 'idle' || this.state === 'disposed') return;
        this.finishStroke();
        this.completeLevel();
        // 暂停/结果页的操作回调留在原节点上；只更新它们共有的安全区父容器。
        if (this.overlay) {
            this.layout = this.computeLayout();
            if (this.page) { this.page.setScale(this.layout.scale, this.layout.scale, 1); this.page.setPosition(0, this.layout.centerY); }
            this.positionPlayingAnchors();
            this.buildBackground();
            this.resizeOverlayDim();
        } else this.rebuildPage();
        if (this.layout) this.dailyReward.relayout(this.layout);
        // 屏幕尺寸变了，缓存的选关页格子尺寸已失效。
        if (this.selectCache && this.layout && this.selectCache.key !== this.selectLayoutKey(this.layout)) this.destroySelectCache();
        if (this.state === 'playing') this.schedulePrewarm();
    }

    private positionPlayingAnchors(): void {
        const page = this.page, layout = this.layout;
        if (!page?.getChildByName('BoardPlate') || !layout) return;
        const offsets: Record<string, number> = { Pause: 0, ModeChip: HEADER.chip, LevelTitle: HEADER.title, FillProgress: HEADER.progress };
        for (const name of Object.keys(offsets)) {
            const node = page.getChildByName(name); if (node) node.setPosition(node.position.x, layout.headerY + offsets[name]);
        }
        for (const name of ['Hint', 'Toast']) {
            const node = page.getChildByName(name);
            if (node) node.setPosition(node.position.x, layout.controlsY + (name === 'Toast' ? 112 : 0));
        }
        const board = page.getChildByName('BoardPlate')!;
        board.setPosition(0, layout.boardY);
        board.getComponent(UITransform)!.setContentSize(layout.boardWidth, layout.boardHeight);
        for (const layer of board.children) layer.getComponent(UITransform)?.setContentSize(layout.boardWidth, layout.boardHeight);
        this.cacheCellPoints();
        for (const row of this.tileRows) row.graphics.node.getComponent(UITransform)!.setContentSize(layout.boardWidth, layout.boardHeight);
        for (const tile of this.tiles) {
            const point = this.cellPoint(tile.cell);
            tile.node.setPosition(point.x, point.y);
            tile.node.getComponent(UITransform)!.setContentSize(layout.boardPitch, layout.boardPitch);
        }
        page.getChildByName('FirstLevelGuide')?.setPosition(0, layout.boardY - layout.boardHeight / 2 - 50);
        page.getChildByName('BoardGlow')?.setPosition(0, layout.boardY);
        this.renderBoard();
    }

    private rebuildPage(): void {
        this.clearPage();
        this.layout = this.computeLayout();
        this.buildBackground();
        const kind = this.state === 'selecting' ? 'selecting' : 'playing';
        if (kind !== 'selecting' || !this.restoreLevelSelect()) {
            this.page = this.makeNode('FillPage', this.node, 750, 1110, 0, this.layout.centerY);
            this.page.setScale(this.layout.scale, this.layout.scale, 1);
            if (kind === 'selecting') this.buildLevelSelect(); else this.buildPlayingPage();
        }
        // 选关立即显示；回到关卡时保留淡入，同类页面重排不闪。
        if (this.pageKind && this.pageKind !== kind && kind === 'playing') this.fadeIn(this.page, .16);
        this.pageKind = kind;
        this.dailyReward.relayout(this.layout);
    }

    /** 底图只随屏幕尺寸和模式重建；翻页、切关、切选关都复用同一张。 */
    private buildBackground(): void {
        const layout = this.layout!, theme = this.modeTheme();
        const key = `${layout.width.toFixed(1)}x${layout.height.toFixed(1)}:${theme.backgroundTop}`;
        if (this.background?.isValid && this.backgroundKey === key) return;
        this.destroyNode(this.background);
        this.backgroundKey = key;
        this.background = this.makeNode('FillBackground', this.node, layout.width, layout.height);
        this.background.setSiblingIndex(0);
        const g = this.background.addComponent(Graphics), width = layout.width, height = layout.height;
        // 竖向渐变：逐条色带由顶部亮石墨过渡到底部暗石墨，色带略微重叠避免缝隙。
        const top = color(theme.backgroundTop), bottom = color(theme.backgroundBottom), bands = 48, band = height / bands;
        for (let i = 0; i < bands; i += 1) {
            const t = i / (bands - 1);
            g.fillColor = new Color(top.r + (bottom.r - top.r) * t, top.g + (bottom.g - top.g) * t, top.b + (bottom.b - top.b) * t, 255);
            g.rect(-width / 2, height / 2 - (i + 1) * band, width, band + 1); g.fill();
        }
        // 画室点阵：以屏幕中心对齐的极淡网点。
        const pitch = 36, columns = Math.ceil(width / 2 / pitch), rows = Math.ceil(height / 2 / pitch);
        g.fillColor = color(FILL_THEME.glass, FILL_THEME.dotAlpha);
        for (let row = -rows; row <= rows; row += 1) {
            for (let column = -columns; column <= columns; column += 1) g.rect(column * pitch - 1.5, row * pitch - 1.5, 3, 3);
        }
        g.fill();
    }

    /** 当前界面所属模式的主题：选关看正在浏览的模式，关卡内看正在玩的模式。 */
    private modeTheme(mode: MultiColorFillMode = this.state === 'selecting' ? this.selectionMode : this.mode) {
        return FILL_MODE_THEMES[mode];
    }

    private buildPlayingPage(): void {
        const page = this.page!, model = this.model;
        if (!model) return;
        const layout = this.layout!, headerY = layout.headerY, controlsY = layout.controlsY, pitch = layout.boardPitch;
        this.cacheCellPoints();
        const pause = this.iconButton('Pause', page, 'pause', 302, headerY, NAV_CONTROL_SIZE, () => {
            if (this.state === 'playing') this.context?.requestPause();
        });
        this.createHardModeNotice(pause.node, 20);
        const modeChip = this.modeTag('ModeChip', page, FILL_MODE_NAMES[this.mode], 0, headerY + HEADER.chip, 20, true);
        const title = this.text('LevelTitle', page, `第 ${this.levelNumber} 关`, -136, headerY + HEADER.title, 364, 64, 44,
            FILL_THEME.ink, true, Label.HorizontalAlign.LEFT);
        title.enableWrapText = false; title.overflow = Label.Overflow.NONE;
        // 按关号实际文字宽度排标签；字体绑定或位数变化后仍保持紧邻的固定间距。
        const alignHeading = (): void => {
            const titleWidth = title.node.getComponent(UITransform)!.width;
            const chipWidth = modeChip.getComponent(UITransform)!.width;
            title.node.setPosition(-318 + titleWidth / 2, title.node.position.y);
            modeChip.setPosition(-318 + titleWidth + 20 + chipWidth / 2, modeChip.position.y);
        };
        title.node.on(Node.EventType.SIZE_CHANGED, alignHeading);
        title.updateRenderData(true); alignHeading();
        const progress = this.makeNode('FillProgress', page, 636, 30, 0, headerY + HEADER.progress);
        this.progressGraphics = progress.addComponent(Graphics);
        this.progressLabel = this.text('ProgressValue', progress, '', 286, 0, 76, 30, 22, FILL_THEME.ink,
            true, Label.HorizontalAlign.RIGHT);
        // 原作棋盘直接落在石墨底色上，不加托盘；背后只垫一层模式色柔光，位置居中于头部与提示之间。
        this.drawBoardGlow(this.makeNode('BoardGlow', page, 750, 750, 0, layout.boardY).addComponent(Graphics));
        const board = this.makeNode('BoardPlate', page, layout.boardWidth, layout.boardHeight, 0, layout.boardY);
        const tileLayer = this.makeNode('Tiles', board, layout.boardWidth, layout.boardHeight);
        // Graphics 独占绘制提交；按行合并仍按原来的格子顺序作画，同时允许只重画变化的行。
        for (let row = 0; row < model.level.height; row++) {
            const rowNode = this.makeNode(`TileRow${row}`, tileLayer, layout.boardWidth, layout.boardHeight);
            const batch: FillTileRow = { graphics: rowNode.addComponent(Graphics), tiles: [] };
            this.tileRows.push(batch);
            for (let column = 0; column < model.level.width; column++) {
                const cell = row * model.level.width + column, point = this.cellPoint(cell);
                const node = this.makeNode(`Cell${cell}`, rowNode, pitch, pitch, point.x, point.y);
                const tile: FillTile = { node, cell, blocked: model.level.blocked.indexOf(cell) >= 0, owner: -2, animating: false };
                this.tiles.push(tile); batch.tiles.push(tile);
            }
        }
        this.routeGraphics = this.makeNode('Routes', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.capGraphics = this.makeNode('Dots', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.boardSparkles = this.makeNode('BoardSparkles', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.fingerGraphics = this.makeNode('FingerCircle', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        this.guideGraphics = this.makeNode('FirstLevelGesture', board, layout.boardWidth, layout.boardHeight).addComponent(Graphics);
        const guideCard = this.glassPanel('FirstLevelGuide', page, 584, 80, 0,
            layout.boardY - layout.boardHeight / 2 - 50, 26);
        this.guideLabel = this.text('GuideTitle', guideCard, '滑动填色', 0, 15, 548, 34, 24, FILL_THEME.ink, true);
        this.guideDetail = this.text('GuideDetail', guideCard, '从彩色圆点出发，滑动填满所有方格。', 0, -18, 548, 30, 20, FILL_THEME.muted);
        this.boardInput = this.makeNode('BoardInput', board, layout.boardWidth, layout.boardHeight);
        this.boardInput.on(Node.EventType.TOUCH_START, this.onBoardStart, this);
        this.boardInput.on(Node.EventType.TOUCH_MOVE, this.onBoardMove, this);
        this.boardInput.on(Node.EventType.TOUCH_END, this.onBoardEnd, this);
        this.boardInput.on(Node.EventType.TOUCH_CANCEL, this.onBoardCancel, this);
        // 提示托盘：烟晶胶囊，左侧粉色圆形灯泡，中间标题与说明，右侧内凹库存角标。
        this.hintButton = this.button('Hint', page, '提示', 0, controlsY, 420, 100, () => this.giveHint());
        this.hintOpacity = this.hintButton.node.addComponent(UIOpacity);
        this.hintButton.label.node.getComponent(UITransform)!.setContentSize(190, 38);
        this.hintButton.label.node.setPosition(-17, 16); this.hintButton.label.fontSize = 28;
        this.hintButton.label.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.text('HintDescription', this.hintButton.node, '画出一条完整路线', -17, -19, 190, 28, 18,
            FILL_THEME.muted, false, Label.HorizontalAlign.LEFT);
        const bulbBack = this.makeNode('HintBulbBack', this.hintButton.node, 68, 68, -156, 0).addComponent(Graphics);
        bulbBack.fillColor = color(FILL_THEME.hint, 70); bulbBack.circle(0, 0, 34); bulbBack.fill();
        bulbBack.fillColor = color(FILL_THEME.hint); bulbBack.circle(0, 0, 28); bulbBack.fill();
        const bulbNode = this.makeNode('HintBulb', this.hintButton.node, 64, 64, -156, 0);
        bulbNode.setScale(.56, .56, 1); this.drawBulb(bulbNode.addComponent(Graphics), FILL_THEME.white);
        const stock = this.panel('HintStock', this.hintButton.node, 64, 44, 152, 0, FILL_THEME.inset, 22, FILL_THEME.insetAlpha);
        this.hintCountLabel = this.text('HintCount', stock, '', 0, 0, 58, 44, 24, FILL_THEME.white, true);
        this.hintAdIcon = this.makeNode('HintAdIcon', stock, 56, 44);
        const adIcon = this.hintAdIcon.addComponent(Graphics);
        adIcon.strokeColor = color(FILL_THEME.white); adIcon.lineWidth = 2.5;
        adIcon.roundRect(-15, -11, 30, 22, 4); adIcon.stroke();
        adIcon.fillColor = color(FILL_THEME.white);
        adIcon.moveTo(-4, -6); adIcon.lineTo(-4, 6); adIcon.lineTo(6, 0); adIcon.close(); adIcon.fill();
        this.createToast(page, controlsY + 112);
        this.renderBoard();
    }

    /** 分段进度条：每色占比按路线格数从左依次铺开，后画的段被前一段的圆头压住。 */
    private renderProgress(): void {
        const g = this.progressGraphics, model = this.model;
        if (!g?.isValid || !model) return;
        g.clear();
        const width = PROGRESS_WIDTH, height = 10, left = -318;
        // 内凹进度槽：深色槽底，下沿一道细亮边。
        g.fillColor = color(FILL_THEME.glass, FILL_THEME.cardEdgeAlpha);
        g.roundRect(left, -height / 2 - 1.5, width, height, height / 2); g.fill();
        g.fillColor = color(FILL_THEME.inset, FILL_THEME.insetAlpha); g.roundRect(left, -height / 2, width, height, height / 2); g.fill();
        const ends: number[] = [];
        model.paths.reduce((sum, path) => { ends.push(sum + path.length); return sum + path.length; }, 0);
        for (let c = ends.length - 1; c >= 0; c -= 1) {
            const end = width * ends[c] / model.total;
            g.fillColor = color(this.colors[c]?.tile ?? FILL_THEME.tile);
            g.roundRect(left, -height / 2, Math.max(height, end), height, height / 2); g.fill();
        }
        if (this.progressLabel) this.progressLabel.string = `${Math.round(model.filled / model.total * 100)}%`;
    }

    private iconButton(name: string, parent: Node, icon: 'back' | 'pause' | 'next' | 'previous',
        x: number, y: number, size: number, action: () => void | Promise<void>, requiresUserGesture = false): FillButton {
        const button = this.button(name, parent, '', x, y, size, size, action, 'secondary', requiresUserGesture);
        this.drawControl(button, icon, true);
        return button;
    }

    private drawControl(button: FillButton, icon: string, enabled: boolean): void {
        const size = button.node.getComponent(UITransform)!.width, factor = size / 82;
        // 图标使用独立几何层，不与底板的填充和描边混在同一份 Graphics 数据里。
        const glyph = button.node.getChildByName('ControlIcon') ?? this.makeNode('ControlIcon', button.node, size, size);
        const g = glyph.getComponent(Graphics) ?? glyph.addComponent(Graphics);
        g.clear();
        const ink = enabled ? FILL_THEME.ink : FILL_THEME.faint;
        g.strokeColor = color(ink); g.fillColor = color(ink); g.lineWidth = 3.5 * factor;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        if (icon === 'back' || icon === 'previous' || icon === 'next') {
            const direction = icon === 'next' ? -1 : 1;
            g.moveTo(9 * factor * direction, 17 * factor); g.lineTo(-9 * factor * direction, 0);
            g.lineTo(9 * factor * direction, -17 * factor); g.lineTo(12 * factor * direction, -14 * factor);
            g.lineTo(-3 * factor * direction, 0); g.lineTo(12 * factor * direction, 14 * factor); g.close(); g.fill();
        } else if (icon === 'pause') {
            g.roundRect(-10 * factor, -12 * factor, 6 * factor, 24 * factor, 2);
            g.roundRect(4 * factor, -12 * factor, 6 * factor, 24 * factor, 2); g.fill();
        }
    }

    private drawBulb(g: Graphics, ink: string, filled = false): void {
        // 包含光芒和圆头描边的完整图形上下边界为 -33、33，围绕节点原点居中。
        if (filled) {
            g.fillColor = color(FILL_THEME.toast); g.circle(0, 1, 15); g.fill();
            g.moveTo(-10, -10); g.lineTo(-7, -25); g.lineTo(7, -25); g.lineTo(10, -10); g.close(); g.fill();
        }
        g.strokeColor = color(ink); g.lineWidth = 4; g.lineCap = Graphics.LineCap.ROUND;
        g.circle(0, 1, 15); g.stroke();
        g.moveTo(-10, -10); g.lineTo(-7, -25); g.lineTo(7, -25); g.lineTo(10, -10); g.stroke();
        g.moveTo(-5, -31); g.lineTo(5, -31); g.stroke();
        for (let i = 0; i < 5; i++) {
            const angle = (25 + i * 32.5) * Math.PI / 180;
            g.moveTo(Math.cos(angle) * 24, 1 + Math.sin(angle) * 24);
            g.lineTo(Math.cos(angle) * 30, 1 + Math.sin(angle) * 30); g.stroke();
        }
        if (filled) {
            g.strokeColor = color(FILL_THEME.white); g.lineWidth = 3;
            g.moveTo(-9, 2); g.bezierCurveTo(-9, 9, -5, 12, 0, 12); g.stroke();
        }
    }

    private cacheCellPoints(): void {
        const level = this.model!.level, pitch = this.layout!.boardPitch;
        this.cellPoints = Array.from({ length: level.width * level.height }, (_, cell) =>
            new Vec2((cell % level.width - (level.width - 1) / 2) * pitch,
                ((level.height - 1) / 2 - Math.floor(cell / level.width)) * pitch));
    }

    /** 缓存坐标只读，动画插值不能修改其中的 Vec2。 */
    private cellPoint(cell: number): Vec2 { return this.cellPoints[cell]; }

    /** Graphics 的颜色 setter 会复制分量，因此动态透明度可以复用同一个临时 Color。 */
    private withAlpha(ink: Readonly<Color>, alpha: number): Color {
        this.alphaInk.set(ink); this.alphaInk.a = alpha; return this.alphaInk;
    }

    private renderBoard(): void {
        const model = this.model, layout = this.layout;
        if (!model || !layout || !this.routeGraphics || !this.capGraphics || this.state === 'selecting') return;
        this.boardDirty = false;
        this.syncBoardEffects();
        const force = this.boardPitch !== layout.boardPitch, changed = this.boardRevision !== model.revision;
        this.renderTileRows(force);
        if (force || changed || this.routesAnimating || this.effects.routesAnimating) this.renderRoutes();
        this.routesAnimating = this.effects.routesAnimating;
        this.renderFinger(force);
        if (changed) this.renderProgress();
        this.syncHintButton();
        const age = this.effects.completionAge;
        const sparkles = age >= .22 && age < .84 + (model.paths.length - 1) * .045;
        if (sparkles || this.sparklesDrawing) this.renderBoardSparkles();
        this.sparklesDrawing = sparkles;
        const guide = this.guide.active && this.state === 'playing';
        if (guide || this.guideDrawing !== guide) this.renderGuide();
        this.guideDrawing = guide;
        this.boardPitch = layout.boardPitch; this.boardRevision = model.revision;
    }

    private renderTileRows(force: boolean): void {
        const model = this.model!, pitch = this.layout!.boardPitch;
        const face = pitch * .9, radius = pitch * .1, lip = pitch * .045;
        for (const row of this.tileRows) {
            let dirty = force;
            for (const tile of row.tiles) {
                if (tile.blocked) continue;
                const owner = model.ownerAt(tile.cell), animating = this.effects.tileAnimating(tile.cell);
                // 上一帧还在动的格子需要补画最后一帧，清除已经结束的叠层。
                dirty ||= tile.owner !== owner || tile.animating || animating;
                tile.owner = owner; tile.animating = animating;
            }
            if (!dirty) continue;
            const g = row.graphics; g.clear();
            for (const tile of row.tiles) {
                if (tile.blocked) continue;
                const cell = tile.cell, ink = this.inks[tile.owner], point = this.cellPoint(cell);
                const entry = this.effects.entry(cell), size = face * entry;
                const x = point.x + this.effects.bumpShake(cell) * pitch * .07, y = point.y;
                if (size <= 0) continue;
                // 同一行保持原有的格子/底边/退色/高亮绘制顺序，避免改变透明叠层。
                g.fillColor = ink?.line ?? EMPTY_SHADE;
                g.roundRect(x - size / 2, y - size / 2 - lip * entry, size, size, radius * entry); g.fill();
                g.fillColor = ink?.tile ?? EMPTY_TILE;
                g.roundRect(x - size / 2, y - size / 2, size, size, radius * entry); g.fill();
                const released = tile.owner < 0 ? this.effects.release(cell) : undefined;
                if (released && this.inks[released[0]]) {
                    const t = released[1], shrink = size * (1 - .45 * t);
                    g.fillColor = this.withAlpha(this.inks[released[0]].tile, Math.round(255 * (1 - t)));
                    g.roundRect(x - shrink / 2, y - shrink / 2, shrink, shrink, radius); g.fill();
                }
                this.renderTileFlash(g, x, y, face, radius, pitch,
                    tile.owner >= 0 ? this.effects.hover(cell) : 0, this.effects.hoverScale(cell), WHITE);
                this.renderTileFlash(g, x, y, face, radius, pitch,
                    this.effects.win(cell), this.effects.winScale(cell), WIN_FLASH);
            }
        }
    }

    private renderTileFlash(g: Graphics, x: number, y: number, face: number, radius: number, pitch: number,
        alpha: number, scale: number, ink: Readonly<Color>): void {
        if (alpha <= 0) return;
        const size = face * scale;
        g.fillColor = this.withAlpha(ink, Math.round(alpha * 210));
        g.roundRect(x - size / 2, y - size / 2, size, size, radius * scale); g.fill();
        g.strokeColor = this.withAlpha(ink, Math.round(alpha * 255)); g.lineWidth = pitch * .025;
        g.roundRect(x - size / 2, y - size / 2, size, size, radius * scale); g.stroke();
    }

    private renderRoutes(): void {
        const model = this.model!, pitch = this.layout!.boardPitch;
        const lines = this.routeGraphics!, caps = this.capGraphics!, bulge = this.effects.bulge;
        lines.clear(); caps.clear(); lines.lineWidth = pitch * .32 * bulge * this.effects.entryAll;
        lines.lineCap = Graphics.LineCap.ROUND; lines.lineJoin = Graphics.LineJoin.ROUND;
        for (let c = 0; c < model.paths.length; c++) {
            const path = model.paths[c], ink = this.inks[c], head = this.effects.head(c);
            const length = head ? head.length : path.length;
            const start = this.cellPoint(path[0]), end = this.cellPoint(path[length - 1]);
            const startX = start.x + this.effects.bumpShake(path[0]) * pitch * .07;
            let endX = length === 1 ? startX : end.x, endY = end.y;
            if (head) {
                const from = this.cellPoint(head.from), to = this.cellPoint(head.to);
                endX = from.x + (to.x - from.x) * head.progress;
                endY = from.y + (to.y - from.y) * head.progress;
            }
            lines.strokeColor = ink.line;
            if (length > 1) {
                lines.moveTo(startX, start.y);
                for (let i = 1; i < length; i++) {
                    const p = this.cellPoint(path[i]);
                    lines.lineTo(i === length - 1 ? endX : p.x, i === length - 1 ? endY : p.y);
                }
                lines.stroke();
                // 显式圆帽保证微信端的转角和线末端与原作一致。
                caps.fillColor = ink.line;
                for (let i = 0; i < length; i++) {
                    const p = this.cellPoint(path[i]);
                    const x = i === 0 ? startX : i === length - 1 ? endX : p.x;
                    caps.circle(x, i === length - 1 ? endY : p.y, lines.lineWidth / 2); caps.fill();
                }
            }
            caps.fillColor = ink.line;
            caps.circle(startX, start.y, pitch * .38 * bulge * this.effects.entry(path[0])); caps.fill();
            if (this.effects.completed) {
                const alpha = Math.round(this.effects.endAlpha * 255);
                caps.fillColor = this.withAlpha(ink.inner, alpha);
                caps.circle(startX, start.y, pitch * .23 * bulge); caps.fill();
                caps.fillColor = this.withAlpha(ink.tile, alpha);
                caps.circle(endX, endY, pitch * .38 * bulge); caps.fill();
                caps.fillColor = this.withAlpha(ink.inner, alpha);
                this.star(caps, endX, endY, pitch * .265 * this.effects.starScale * bulge);
            }
            for (let i = 1; i < path.length; i++) {
                const cell = path[i], alpha = this.effects.hintAlpha(cell);
                if (!alpha) continue;
                const point = this.cellPoint(cell);
                caps.strokeColor = this.withAlpha(WHITE, Math.round(alpha * 185)); caps.lineWidth = pitch * .04;
                caps.circle(point.x, point.y, pitch * .23); caps.stroke();
            }
        }
    }

    private renderFinger(force: boolean): void {
        const g = this.fingerGraphics, point = this.pointerPoint, c = this.model!.drawingColor;
        const x = point?.x ?? NaN, y = point?.y ?? NaN;
        if (!g || (!force && Object.is(x, this.fingerX) && Object.is(y, this.fingerY) && c === this.fingerColor)) return;
        g.clear(); this.fingerX = x; this.fingerY = y; this.fingerColor = c;
        if (point && c >= 0 && this.cellAt(point) >= 0) {
            // 手指光圈直径约 1.2 格，单独更新，不触发静止棋盘重绘。
            g.fillColor = this.withAlpha(this.inks[c].line, 115);
            g.circle(x, y, this.layout!.boardPitch * .6); g.fill();
        }
    }

    private renderBoardSparkles(): void {
        const g = this.boardSparkles, model = this.model, layout = this.layout;
        if (!g || !model || !layout) return;
        g.clear();
        const age = this.effects.completionAge;
        if (age < 0) return;
        // 终点的小星星散开；棋盘收尾动画结束后揭示通关页。
        model.paths.forEach((path, c) => {
            const t = (age - .22 - c * .045) / .62;
            if (t < 0 || t >= 1) return;
            const end = this.cellPoint(path[path.length - 1]), reach = layout.boardPitch * (.3 + 1.05 * (1 - Math.pow(1 - t, 3)));
            g.fillColor = this.withAlpha(this.inks[c].tile, Math.round(220 * (1 - t)));
            for (let i = 0; i < 6; i += 1) {
                const angle = i * Math.PI / 3 + c * .35;
                this.star(g, end.x + Math.cos(angle) * reach, end.y + Math.sin(angle) * reach,
                    layout.boardPitch * .08 * Math.sin(Math.PI * t));
            }
        });
    }

    private renderGuide(): void {
        const g = this.guideGraphics, layout = this.layout;
        if (this.guideLabel) {
            this.guideLabel.node.parent!.active = this.guide.active && this.state === 'playing';
        }
        if (!g || !layout) return;
        g.clear();
        const frame = this.state === 'playing' ? this.guide.frame : undefined;
        if (!frame || frame.opacity <= 0) return;
        const pitch = layout.boardPitch, c = this.colors[frame.color];
        const index = Math.min(frame.route.length - 2, Math.floor(frame.position));
        const from = this.cellPoint(frame.route[index]), to = this.cellPoint(frame.route[index + 1]);
        const progress = frame.position - index;
        const point = new Vec2(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
        g.strokeColor = color(c.line, Math.round(frame.opacity * 130)); g.lineWidth = pitch * .24;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        const start = this.cellPoint(frame.route[0]); g.moveTo(start.x, start.y);
        for (let i = 1; i <= index; i++) { const p = this.cellPoint(frame.route[i]); g.lineTo(p.x, p.y); }
        g.lineTo(point.x, point.y); g.stroke();
        g.strokeColor = color(FILL_THEME.ink, Math.round(frame.opacity * 150)); g.lineWidth = 3;
        g.circle(point.x, point.y, pitch * (.25 + .05 * (1 - frame.press))); g.stroke();
        g.fillColor = color(c.line, Math.round(frame.opacity * 45));
        g.circle(point.x, point.y, pitch * .36); g.fill();
        const s = pitch / 110 * (1 - .06 * frame.press), x = point.x, y = point.y;
        g.fillColor = color('#FFDBAA', Math.round(frame.opacity * 255));
        g.strokeColor = color('#554239', Math.round(frame.opacity * 255)); g.lineWidth = 3.5 * s;
        g.moveTo(x - 9 * s, y - 38 * s); g.lineTo(x - 9 * s, y - 10 * s);
        g.bezierCurveTo(x - 9 * s, y + 5 * s, x + 7 * s, y + 5 * s, x + 7 * s, y - 10 * s);
        g.lineTo(x + 7 * s, y - 28 * s);
        g.bezierCurveTo(x + 17 * s, y - 18 * s, x + 21 * s, y - 23 * s, x + 24 * s, y - 31 * s);
        g.bezierCurveTo(x + 35 * s, y - 22 * s, x + 43 * s, y - 30 * s, x + 41 * s, y - 39 * s);
        g.bezierCurveTo(x + 51 * s, y - 35 * s, x + 58 * s, y - 40 * s, x + 53 * s, y - 52 * s);
        g.lineTo(x + 47 * s, y - 70 * s);
        g.bezierCurveTo(x + 39 * s, y - 88 * s, x + 9 * s, y - 87 * s, x, y - 73 * s);
        g.lineTo(x - 18 * s, y - 50 * s);
        g.bezierCurveTo(x - 25 * s, y - 39 * s, x - 19 * s, y - 32 * s, x - 9 * s, y - 38 * s);
        g.close(); g.fill(); g.stroke();
        g.strokeColor = color('#FFEED4', Math.round(frame.opacity * 200)); g.lineWidth = 3 * s;
        g.moveTo(x - 3 * s, y - 12 * s); g.lineTo(x - 3 * s, y - 34 * s); g.stroke();
    }

    private star(g: Graphics, x: number, y: number, radius: number): void {
        if (radius <= 0) return;
        for (let i = 0; i < 10; i += 1) {
            const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 === 0 ? 1 : .46);
            if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.close(); g.fill();
    }

    private touchPoint(event: EventTouch): Vec2 {
        return this.localTouchPoint(event, this.boardInput!);
    }

    /** 与 UITransform.hitTest 使用同一相机换算，Fit Width 长屏下视图 UI 坐标不等于场景世界坐标。 */
    private localTouchPoint(event: EventTouch, node: Node): Vec2 {
        const point = event.getLocation();
        const world = this.uiCamera!.screenToWorld(new Vec3(point.x, point.y, 0));
        const local = node.getComponent(UITransform)!.convertToNodeSpaceAR(world);
        return new Vec2(local.x, local.y);
    }

    private cellAt(point: Vec2): number {
        return this.cellAtXY(point.x, point.y);
    }

    private cellAtXY(px: number, py: number): number {
        const level = this.model!.level, layout = this.layout!, pitch = layout.boardPitch;
        const x = Math.floor((px + layout.boardWidth / 2) / pitch);
        const y = Math.floor((layout.boardHeight / 2 - py) / pitch);
        return x < 0 || y < 0 || x >= level.width || y >= level.height ? -1 : y * level.width + x;
    }

    private onBoardStart(event: EventTouch): void {
        if (this.state !== 'playing' || this.overlay || this.dailyReward.active || this.touchId !== undefined || !this.model || this.guide.assisting || this.adPending) return;
        const point = this.touchPoint(event);
        if (!this.model.startStroke(this.cellAt(point))) return;
        this.guide.dismiss();
        this.touchId = event.getID(); this.lastTouch = point; this.pointerPoint = point; this.requestBoardRender();
        this.context?.services.feedback.play('drop', { volume: FILL_NOTE_VOLUME, variant: this.routeNote() });
        event.propagationStopped = true;
    }

    private onBoardMove(event: EventTouch): void {
        if (event.getID() !== this.touchId || this.state !== 'playing' || !this.model || !this.lastTouch) return;
        const to = this.touchPoint(event), from = this.lastTouch;
        // 快速拖动按格宽采样整条手指轨迹，避免一帧跨过多个格子漏画。
        const samples = Math.max(1, Math.ceil(Vec2.distance(from, to) / (this.layout!.boardPitch * .2)));
        let sound: 'drop' | 'toggle' | 'collision' | undefined;
        for (let i = 1; i <= samples; i += 1) {
            const x = from.x + (to.x - from.x) * i / samples, y = from.y + (to.y - from.y) * i / samples;
            const cell = this.cellAtXY(x, y), result = this.model.dragTo(cell);
            if (result === 'extended' || result === 'backtracked') { sound = result === 'extended' ? 'drop' : 'toggle'; this.bumpedCell = -1; }
            else if (result === 'blocked' && cell !== this.bumpedCell && this.blocksStroke(cell)) {
                // 同一次停留只提示一次：手指离开障碍后再撞才重新晃动。
                this.bumpedCell = cell;
                if (this.effects.bump(cell)) sound ??= 'collision';
            } else if (result === 'blocked' && cell !== this.bumpedCell) this.bumpedCell = -1;
        }
        this.lastTouch = to; this.pointerPoint = to;
        // 落格 / 退格都按原作 PlayNote：取路线新末格对应的旋律音，同一音量。
        if (sound === 'collision') this.context?.services.feedback.play(sound, { volume: .5 });
        else if (sound) this.context?.services.feedback.play(sound, { volume: FILL_NOTE_VOLUME, variant: this.routeNote() });
        this.requestBoardRender();
        event.propagationStopped = true;
    }

    /** 当前路线末格应弹的音（原作 PlayNote：n = 路线格数 − 1）。 */
    private routeNote(): number {
        const model = this.model, path = model && model.drawingColor >= 0 ? model.paths[model.drawingColor] : undefined;
        return this.melody.noteFor(path ? path.length - 1 : 0);
    }

    /** 只有看得见的障碍（他色起点）会晃动；墙洞和棋盘外不打扰。 */
    private blocksStroke(cell: number): boolean {
        const model = this.model;
        if (!model || cell < 0) return false;
        const owner = model.ownerAt(cell);
        return owner >= 0 && owner !== model.drawingColor && model.level.starts[owner] === cell;
    }

    private onBoardEnd(event: EventTouch): void {
        if (event.getID() !== this.touchId) return;
        this.onBoardMove(event);
        this.finishStroke();
        this.requestBoardRender(); this.persist(); this.completeLevel();
        event.propagationStopped = true;
    }

    /**
     * Cocos 在手指于节点范围外抬起时派发 TOUCH_CANCEL 而不是 TOUCH_END。
     * 手指拖出棋盘再松开是正常操作：已画的路线照常提交，不回滚整笔。
     */
    private onBoardCancel(event: EventTouch): void {
        if (event.getID() !== this.touchId) return;
        this.finishStroke();
        this.requestBoardRender(); this.persist(); this.completeLevel();
        event.propagationStopped = true;
    }

    private finishStroke(): void {
        if (!this.guide.assisting) this.model?.endStroke();
        this.touchId = undefined; this.lastTouch = undefined; this.pointerPoint = undefined; this.bumpedCell = -1;
    }

    private finishHint(): void {
        if (!this.guide.assisting) return;
        this.model?.endStroke(); this.guide.dismiss(); this.renderBoard();
    }

    private giveHint(): void {
        if (this.state !== 'playing' || this.dailyReward.active || !this.model || !this.save || this.guide.assisting || this.adPending) return;
        this.finishStroke();
        this.completeLevel();
        if ((this.state as FillState) !== 'playing') return;
        if (this.model.nextHintColor() < 0) return;
        if (this.save.hints <= 0) {
            if (this.context?.services.ads.isEnabledForGame(this.context.gameId)) void this.requestHintAd();
            else this.showToast('提示用完了，明天登录再送 3 个');
            return;
        }
        const hint = this.model.beginHint();
        if (!hint.applied) return;
        this.save.hints -= 1;
        this.guide.play(hint.color, hint.route);
        this.context?.services.feedback.play('drop', { volume: FILL_NOTE_VOLUME, variant: this.melody.rootNote });
        this.renderBoard(); this.persist();
    }

    private syncHintButton(): void {
        // 赠送飞入前只延后显示数字；是否切广告取决于真实库存，避免到账途中闪出广告图标。
        const stock = this.save?.hints ?? 0, count = Math.max(0, stock - this.dailyHintReward);
        const adsEnabled = this.context?.services.ads.isEnabledForGame(this.context.gameId) ?? false;
        const showAd = stock === 0 && adsEnabled;
        if (this.hintCountLabel) {
            const text = count > 99 ? '99+' : String(count), stockNode = this.hintCountLabel.node.parent;
            // 库存变化时角标轻弹一下，提示消耗或到账；首次建页不弹。
            if (this.hintCountLabel.string && this.hintCountLabel.string !== text && stockNode?.isValid) {
                Tween.stopAllByTarget(stockNode); stockNode.setScale(1.3, 1.3, 1);
                tween(stockNode).to(.24, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            }
            this.hintCountLabel.string = text;
            this.hintCountLabel.node.active = !showAd;
        }
        if (this.hintAdIcon) this.hintAdIcon.active = showAd;
        const enabled = this.state === 'playing' && !this.guide.assisting && !this.adPending;
        if (this.hintOpacity) this.hintOpacity.opacity = enabled ? 255 : 130;
    }

    private showDailyHintReward(): void {
        const amount = this.dailyHintReward, layout = this.layout;
        if (amount <= 0 || !layout || this.dailyReward.active) return;
        this.dailyReward.start({
            parent: this.node, bounds: layout,
            colors: { dim: color(FILL_THEME.dim, 150), shadow: color('#000000', 60),
                accent: color(FILL_THEME.hint), text: color(FILL_THEME.white) },
            items: [{
                caption: `提示 +${amount}`,
                createIcon: parent => {
                    const icon = this.makeNode('RewardIcon', parent, 64, 64);
                    this.drawBulb(icon.addComponent(Graphics), FILL_THEME.hint, true);
                    icon.setScale(2.2, 2.2, 1);
                    return icon;
                },
                target: () => this.hintButton?.node.getChildByName('HintBulb') ?? undefined,
                onArrive: () => { this.dailyHintReward = 0; this.syncHintButton(); },
            }],
        });
        this.context?.services.feedback.play('drop', { volume: FILL_NOTE_VOLUME, variant: this.melody.rootNote });
    }

    private finishDailyHintReward(): void {
        this.dailyReward.dispose(); this.dailyHintReward = 0; this.syncHintButton();
    }

    private async requestHintAd(): Promise<void> {
        const context = this.context, save = this.save;
        if (!context || !save || save.hints > 0 || this.state !== 'playing' || this.guide.assisting || this.adPending
            || !context.services.ads.isEnabledForGame(context.gameId)) return;
        this.adPending = true; this.syncHintButton();
        try {
            const result = await context.services.ads.showRewarded({ placement: 'multi-color-fill-hint',
                gameId: context.gameId, sessionId: context.sessionId });
            if (this.context !== context || this.save !== save || (this.state as FillState) === 'disposed') return;
            if (result.outcome === 'completed') {
                save.hints += 1; this.persist(); this.showToast('提示 +1，点提示绘制完整路线');
            } else if (result.errorCode !== 'not-configured') {
                this.showToast(result.outcome === 'skipped' ? '看完广告就能获得 1 个提示' : '广告暂时无法播放，请稍后再试');
            }
        } catch {
            if (this.context === context) this.showToast('广告暂时无法播放，请稍后再试');
        } finally {
            this.adPending = false; this.syncHintButton();
        }
    }

    private completeLevel(): void {
        if (this.state !== 'playing' || !this.model?.completed || !this.save || this.guide.assisting) return;
        this.finishStroke(); this.state = 'completed';
        this.context?.reportRoundFinished?.();
        this.guide.dismiss();
        this.winTitle = FILL_WIN_TITLES[Math.floor(Math.random() * FILL_WIN_TITLES.length)];
        completeFillLevel(this.mode, this.save.modes[this.mode], this.levelNumber);
        this.persist(false);
        this.context?.reportScore(this.save.modes.normal.cleared + this.save.modes.hard.cleared);
        if (this.mode === 'normal') this.context?.reportAchievementProgress('normal-cleared-level', this.save.modes.normal.cleared);
        this.context?.reportEvent?.('level_complete', { mode: this.mode, level: this.levelNumber,
            duration: Math.floor(this.model.elapsed), strokes: this.model.strokes, hints: this.model.hints },
        `${this.context.sessionId}:${this.mode}:${this.levelNumber}`);
        this.context?.services.feedback.play('milestone');
        this.effects.complete(this.model.paths); this.renderBoard();
    }

    /**
     * 全屏通关页：模式底色铺满，棋盘背后是模式色柔光、四周缓缓上浮本关配色的方块；
     * 成品棋盘先现出空格，再沿每条路线逐格填色（呼应关内通关亮波），标题、模式标签、下一关依次出现。
     */
    private showCompletion(): void {
        if (this.state !== 'completed' || !this.model || !this.save || !this.page || this.overlay) return;
        const last = this.levelNumber >= this.levels().length, theme = this.modeTheme();
        this.overlayKind = 'completion';
        this.context?.services.feedback.play('popup', { vibrate: false });
        const root = this.overlay = this.makeNode('FillOverlay', this.page, 750, 1110);
        root.addComponent(BlockInputEvents);
        const dim = this.makeNode('Dim', root, 750, 1110); dim.addComponent(Graphics); dim.addComponent(BlockInputEvents);
        this.winGraphics = this.makeNode('WinSparkles', root, 750, 1110).addComponent(Graphics);
        this.fadeIn(dim, .3); this.fadeIn(this.winGraphics.node, .8, .3);

        const hero = this.makeNode('WinHero', root, WIN_BOARD_SIZE, WIN_BOARD_SIZE, 0, 10);
        const glow = this.makeNode('WinGlow', hero, 820, 820);
        this.drawGlow(glow.addComponent(Graphics), 410, theme.accent);
        this.fadeIn(glow, .6, .1);
        tween(glow).to(2.4, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
            .to(2.4, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }).union().repeatForever().start();
        this.winBoard = this.makeNode('WinBoard', hero, WIN_BOARD_SIZE, WIN_BOARD_SIZE).addComponent(Graphics);
        const level = this.model.level, pitch = WIN_BOARD_SIZE / Math.max(level.width, level.height);
        this.winCellPoints = Array.from({ length: level.width * level.height }, (_, cell) =>
            new Vec2((cell % level.width - (level.width - 1) / 2) * pitch,
                ((level.height - 1) / 2 - Math.floor(cell / level.width)) * pitch));
        this.winStep = Math.min(.06, .9 / Math.max(...this.model.paths.map(path => path.length)));
        this.winBoardDone = false; this.winTime = 0;
        this.resizeOverlayDim(); this.renderCelebration();
        hero.setScale(.86, .86, 1); this.fadeIn(hero, .22);
        tween(hero).to(.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

        // 标题：白色粗体 + 模式深色描边，挤压弹出。
        const title = this.text('WinTitle', root, this.winTitle, 0, 420, 660, 96, 64, FILL_THEME.white, true);
        title.enableOutline = true; title.outlineColor = color(theme.accentShadow); title.outlineWidth = 5;
        const titleOpacity = title.node.addComponent(UIOpacity); titleOpacity.opacity = 0;
        title.node.setScale(1.4, 1.4, 1);
        tween(titleOpacity).delay(.12).to(.16, { opacity: 255 }).start();
        tween(title.node).delay(.12).to(.2, { scale: new Vec3(.94, .94, 1) }, { easing: 'quadIn' })
            .to(.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        const chips = this.makeNode('WinChips', root, 640, 44, 0, 338);
        this.modeTag('WinLevel', chips, `${FILL_MODE_NAMES[this.mode]} · 第 ${this.levelNumber} 关`, 0, 0, 22);
        this.reveal(chips, .26);

        // 下一关与暂停「继续游戏」同为当前模式的主按钮。
        const next = this.button('Continue', root, last ? '全部完成 · 返回选关' : '下一关', 0, -380, 480, 104, () => {
            if (this.levelNumber >= this.levels().length) this.openLevelSelect();
            else this.startLevel(this.mode, this.levelNumber + 1, true);
        }, 'primary');
        next.label.fontSize = 34;
        this.reveal(next.node, .55);
    }

    /** 模式色柔光：由外向内叠加的低透明度同心圆，形成径向渐变。 */
    private drawGlow(g: Graphics, radius: number, accent: string, alpha = 3, rings = 48): void {
        // 圈数多、每圈极淡，叠出平滑的径向渐变而不是一道道色环。
        for (let i = rings; i >= 1; i -= 1) {
            g.fillColor = color(accent, alpha); g.circle(0, 0, radius * Math.pow(i / rings, .8)); g.fill();
        }
    }

    /** 关卡内棋盘背后的模式色柔光，比通关页更淡，只托出棋盘轮廓。 */
    private drawBoardGlow(g: Graphics): void {
        this.drawGlow(g, 375, this.modeTheme().accent, 2, 36);
    }

    /**
     * 成品棋盘缩略（按 winTime 逐帧绘制）：空格先在，随后每条路线从起点逐格填色、线条跟着生长，
     * 起点深芯随首格出现，整条填完后终点星弹出。动画结束后不再重绘。
     */
    private renderWinBoard(): void {
        const g = this.winBoard, model = this.model;
        if (!g?.isValid || !model || this.winBoardDone) return;
        g.clear();
        const level = model.level, pitch = WIN_BOARD_SIZE / Math.max(level.width, level.height), age = this.winTime;
        const point = (cell: number): Vec2 => this.winCellPoints[cell];
        const pop = (value: number): number => { const t = Math.min(1, Math.max(0, value)) - 1, c = 1.70158; return 1 + (c + 1) * t * t * t + c * t * t; };
        const step = this.winStep, startAt = (c: number): number => .2 + c * .07;
        const face = pitch * .9, radius = pitch * .1, lip = pitch * .045;
        const square = (x: number, y: number, size: number, top: Readonly<Color>, edge: Readonly<Color>): void => {
            if (size <= 0) return;
            g.fillColor = edge; g.roundRect(x - size / 2, y - size / 2 - lip, size, size, radius); g.fill();
            g.fillColor = top; g.roundRect(x - size / 2, y - size / 2, size, size, radius); g.fill();
        };
        for (let cell = 0; cell < level.width * level.height; cell += 1) {
            if (level.blocked.indexOf(cell) < 0) { const p = point(cell); square(p.x, p.y, face, EMPTY_TILE, EMPTY_SHADE); }
        }
        let done = true;
        model.paths.forEach((path, c) => {
            const set = this.inks[c], begin = startAt(c);
            path.forEach((cell, i) => {
                const p = point(cell); square(p.x, p.y, face * pop((age - begin - i * step) / .24), set.tile, set.line);
            });
            const reach = Math.min(path.length - 1, Math.max(0, (age - begin) / step));
            const points = path.slice(0, Math.floor(reach) + 1).map(point);
            if (reach < path.length - 1 && reach > 0) {
                const a = point(path[Math.floor(reach)]), b = point(path[Math.floor(reach) + 1]), f = reach - Math.floor(reach);
                points.push(new Vec2(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f));
            }
            const ink = set.line, inner = set.inner;
            g.lineWidth = pitch * .32; g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND; g.strokeColor = ink;
            if (age >= begin && points.length > 1) {
                points.forEach((p, i) => { if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }); g.stroke();
            }
            const head = pop((age - begin) / .24), start = point(path[0]);
            if (head > 0) {
                g.fillColor = ink; g.circle(start.x, start.y, pitch * .38 * head); g.fill();
                g.fillColor = inner; g.circle(start.x, start.y, pitch * .2 * head); g.fill();
            }
            const finished = begin + (path.length - 1) * step, star = pop((age - finished - .08) / .28);
            if (path.length > 1 && star > 0) {
                const end = point(path[path.length - 1]);
                g.fillColor = set.tile; g.circle(end.x, end.y, pitch * .36 * star); g.fill();
                g.fillColor = inner; this.star(g, end.x, end.y, pitch * .24 * star);
            }
            if (age < finished + .4) done = false;
        });
        this.winBoardDone = done;
    }

    /** 背景氛围：本关配色的实心圆角小方块从底部缓缓上浮、左右轻摆，进出时淡入淡出；确定性伪随机。 */
    private renderCelebration(): void {
        this.renderWinBoard();
        const g = this.winGraphics, layout = this.layout;
        if (!g?.isValid || !layout) return;
        g.clear();
        const width = layout.width / layout.scale, height = layout.height / layout.scale;
        const span = height + 120;
        for (let i = 0; i < 16; i += 1) {
            const block = CELEBRATION_BLOCKS[i], size = block.size;
            const y = -height / 2 - 60 + ((this.winTime * block.speed + block.phase * span) % span);
            const x = -width / 2 + block.x * width + Math.sin(this.winTime * .5 + i) * 14;
            // 越靠近顶部越淡，底部刚出现时也淡入。
            const life = (y + height / 2 + 60) / span, alpha = Math.round(60 * Math.min(1, life * 5) * Math.min(1, (1 - life) * 3));
            if (alpha <= 0) continue;
            g.fillColor = this.withAlpha(this.inks[i % this.inks.length].tile, alpha);
            g.roundRect(x - size / 2, y - size / 2, size, size, size * .2); g.fill();
        }
    }

    private openLevelSelect(): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready' || this.state === 'paused') return;
        this.finishStroke(); this.finishHint(); this.completeLevel(); this.persist(); this.destroyOverlay();
        this.selectionMode = this.mode;
        this.selectionPage = Math.floor((this.save!.modes[this.mode].current - 1) / PER_PAGE);
        this.state = 'selecting'; this.rebuildPage();
    }

    private switchMode(mode: MultiColorFillMode): void {
        const view = this.selectionView;
        if (this.state !== 'selecting' || !this.save || !view || view.sliding || mode === this.selectionMode) return;
        this.selectionMode = mode; this.save.mode = mode;
        if (mode === 'hard') this.discoverHardMode();
        this.selectionPage = Math.floor((this.save.modes[mode].current - 1) / PER_PAGE);
        this.persist(); this.buildBackground(); this.fillSelectionPages(); this.refreshSelectionHeader(true);
    }

    /**
     * 选关「路线图」：返回、居中标题与右侧分段切换同排，标题下显示当前模式的通关进度；
     * 中部烟晶路线卡里的蛇形路线按模式色阶铺色；底部为烟晶翻页与快捷定位按钮。
     */
    private buildLevelSelect(): void {
        const page = this.page!, layout = this.layout!, titleY = layout.headerY + 10;
        const bottom = (layout.bottom - layout.centerY) / layout.scale;
        this.iconButton('BackToLobby', page, 'back', -311, titleY, NAV_CONTROL_SIZE, () => this.context?.requestLobby(), true);
        this.text('SelectTitle', page, '选择关卡', 0, titleY, 274, 80, 44, FILL_THEME.ink, true);
        this.text('SelectProgress', page, '', 0, titleY - 64, 630, 40, 26, FILL_THEME.muted);
        const modeRoot = this.makeNode('ModeSwitch', page, 196, 64, 249, titleY);
        modeRoot.addComponent(Graphics);
        const thumb = this.makeNode('ModeThumb', modeRoot, 92, 52);
        thumb.addComponent(Graphics);
        for (const [mode, x] of [['normal', -49], ['hard', 49]] as const) {
            const name = mode === 'normal' ? 'ModeNormal' : 'ModeHard';
            const tab = this.button(name, modeRoot, mode === 'normal' ? '普通' : '困难', x, 0, 98, 64, () => this.switchMode(mode));
            tab.node.getComponent(Graphics)!.clear();
            tab.label.fontSize = 24;
            tab.label.node.setPosition(mode === 'normal' ? 3 : -3, 0);
        }
        this.createHardModeNotice(modeRoot, 24);
        // 底部：两端烟晶翻页，中间实心「继续上次」与描边「最新解锁」。
        const trayY = bottom + 84;
        const previous = this.iconButton('PreviousPage', page, 'previous', -306, trayY, 72, () => this.changePage(-1));
        const next = this.iconButton('NextPage', page, 'next', 306, trayY, 72, () => this.changePage(1));
        const current = this.button('JumpCurrent', page, '', -126, trayY, 224, 84,
            () => this.jumpPage(this.save!.modes[this.selectionMode].current), 'primary');
        const latest = this.button('JumpLatest', page, '', 126, trayY, 224, 84,
            () => this.jumpPage(fillUnlocked(this.selectionMode, this.save!.modes[this.selectionMode])), 'light');
        for (const [button, caption] of [[current, '继续上次'], [latest, '最新解锁']] as const) {
            button.label.fontSize = 26; button.label.node.setPosition(0, -16);
            this.text(`${button.node.name}Caption`, button.node, caption, 0, 19, 224, 28, 18,
                button === current ? FILL_THEME.buttonInk : this.modeTheme(this.selectionMode).accentLight);
        }
        // 路线卡：只装 5 × 6 蛇形路线；卡片按内容高度居中在标题与底栏之间。
        const regionTop = titleY - 106, regionBottom = trayY + 42 + 26, cardPad = 40;
        // 自然尺寸：圆点 98、中心距 132，五行折返后高 758，进行中外环距卡边约 30；矮屏整体等比缩小。
        const natural = (SELECT_ROWS - 1) * 132 + 98;
        const fit = Math.min(1, Math.max(1, regionTop - regionBottom - cardPad * 2) / natural);
        const diameter = 98 * fit, pitch = 132 * fit, gridHeight = natural * fit;
        const cardHeight = gridHeight + cardPad * 2, cardY = (regionTop + regionBottom) / 2;
        this.glassPanel('RouteCard', page, 702, cardHeight, 0, cardY, 40, FILL_THEME.cardAlpha, FILL_THEME.cardEdgeAlpha);
        const available = cardHeight;
        const pager = this.makeNode('LevelPager', page, 750, available, 0, cardY);
        // 不加 Mask：Fit Width 下可见宽度恒为 750，相邻页位于 ±750 正好在屏幕外；
        // 省掉模板缓冲既减少打断合批，也避免预建页在屏幕外生成的模板区域移回后失效。
        const track = this.makeNode('LevelTrack', pager, 750, available);
        track.addComponent(UIOpacity);
        // 每页节点自身的 Graphics 画路线，子节点只放关卡圆点，圆点盖住路线拐点。
        const pages = [-1, 0, 1].map(slot => {
            const node = this.makeNode(`SelectionSlot${slot}`, track, 750, available, slot * 750, 0);
            node.addComponent(Graphics); return node;
        });
        this.selectionView = { track, pages, slotKeys: ['', '', ''], pendingSlots: [],
            previous: previous.node, next: next.node, diameter, pitch, sliding: false };
        this.refreshSelectionHeader(); this.fillSelectionPages();
        pager.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onPagerStart(event), this);
        pager.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onPagerMove(event), this);
        pager.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onPagerEnd(event), this);
        pager.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onPagerEnd(event, true), this);
        // 提示浮在底部导航上，不遮挡可点的关卡圆点。
        this.createToast(page, trayY);
    }

    private refreshSelectionHeader(animate = false): void {
        const page = this.page, save = this.save;
        if (!page || !save) return;
        const mode = this.selectionMode, progress = save.modes[mode];
        const current = page.getChildByName('JumpCurrent')!.getChildByName('JumpCurrentLabel')!.getComponent(Label)!;
        current.string = `第 ${progress.current} 关`; current.color = color(FILL_THEME.buttonInk);
        this.paintButton(page.getChildByName('JumpCurrent')!, 'primary');
        const latestNode = page.getChildByName('JumpLatest')!;
        this.paintButton(latestNode, 'light');
        const latest = page.getChildByName('JumpLatest')!.getChildByName('JumpLatestLabel')!.getComponent(Label)!;
        latest.string = `第 ${fillUnlocked(mode, progress)} 关`; latest.color = color(this.modeTheme(mode).accentLight);
        latestNode.getChildByName('JumpLatestCaption')!.getComponent(Label)!.color = latest.color.clone();
        page.getChildByName('SelectProgress')!.getComponent(Label)!.string = `已通关 ${progress.cleared} / ${this.levels(mode).length}`;
        const root = page.getChildByName('ModeSwitch')!;
        this.paintModeSwitch(root, mode, animate);
    }

    /** 顶栏分段胶囊：文字固定在轨道内，模式色底块在两段之间滑动。 */
    private paintModeSwitch(root: Node, mode: MultiColorFillMode, animate: boolean): void {
        const theme = FILL_MODE_THEMES[mode], rail = root.getComponent(Graphics)!, thumb = root.getChildByName('ModeThumb')!;
        rail.clear(); rail.fillColor = color(FILL_THEME.glass, FILL_THEME.glassAlpha);
        rail.roundRect(-98, -32, 196, 64, 32); rail.fill();
        rail.strokeColor = color(FILL_THEME.glass, FILL_THEME.glassEdgeAlpha); rail.lineWidth = 1.5;
        rail.roundRect(-97, -31, 194, 62, 31); rail.stroke();
        const face = thumb.getComponent(Graphics)!;
        face.clear(); face.fillColor = color(theme.buttonShadow);
        face.roundRect(-46, -28, 92, 52, 26); face.fill();
        face.fillColor = color(theme.button);
        face.roundRect(-46, -26, 92, 52, 26); face.fill();
        for (const [name, tabMode] of [['ModeNormal', 'normal'], ['ModeHard', 'hard']] as const) {
            root.getChildByName(name)!.getChildByName(`${name}Label`)!.getComponent(Label)!.color =
                color(tabMode === mode ? FILL_THEME.buttonInk : FILL_THEME.muted);
        }
        Tween.stopAllByTarget(thumb);
        const position = new Vec3(mode === 'hard' ? 46 : -46, 0, 0);
        if (animate) tween(thumb).to(.18, { position }, { easing: 'quadOut' }).start();
        else thumb.setPosition(position);
    }

    /**
     * 仅复用当前与相邻三页，共最多90个格子；题库规模不增加页面节点数量。
     * 当前页立即绘制，左右邻页推迟并逐帧各画一页（拖动或翻页前会先补齐），避免进入选关时连续长帧。
     */
    private fillSelectionPages(): void {
        const view = this.selectionView, save = this.save;
        if (!view || !save) return;
        const total = this.levels(this.selectionMode).length, pageCount = Math.ceil(total / PER_PAGE);
        this.selectionPage = Math.max(0, Math.min(pageCount - 1, this.selectionPage));
        Tween.stopAllByTarget(view.track); view.track.setPosition(0, 0); view.drag = undefined;
        view.pages.forEach((page, slot) => page.setPosition((slot - 1) * 750, 0));
        this.fillSelectionSlot(1);
        // 邻页等入场淡入结束后再逐帧补画（先画下一页），拖动或点翻页时立即补齐。
        // 只排队内容真的变了的邻页；轮转后已画好的页不重画。
        view.pendingSlots = [2, 0].filter(slot => this.selectionSlotKey(slot) !== view.slotKeys[slot]);
        this.neighborDelay = .22;
        const first = this.selectionPage * PER_PAGE + 1, last = Math.min(total, first + PER_PAGE - 1);
        [view.previous, view.next].forEach((button, index) => {
            const enabled = index === 0 ? this.selectionPage > 0 : last < total;
            (button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity)).opacity = enabled ? 255 : 130;
        });
    }

    private fillSelectionNeighbors(): void {
        const view = this.selectionView;
        if (!view) return;
        while (view.pendingSlots.length) this.fillSelectionSlot(view.pendingSlots.shift()!);
    }

    /**
     * 按帧推进的延后工作：选关邻页每帧补画一页；关卡内空闲时预建选关页。
     * 不用在回调里重排自身的 scheduleOnce——Cocos 会在一次性回调结束时移除同一计时器，重排会丢失。
     */
    private runDeferredWork(seconds: number): void {
        const view = this.selectionView;
        if (this.state === 'selecting' && view?.pendingSlots.length) {
            if (this.neighborDelay > 0) this.neighborDelay -= seconds;
            else this.fillSelectionSlot(view.pendingSlots.shift()!);
        }
        const warmed = this.prewarmed;
        if (warmed) {
            // 预建页已在屏幕外渲染过一帧：隐藏、归位后收进缓存；期间状态或尺寸变了就丢弃。
            this.prewarmed = undefined;
            if (this.state !== 'playing' || this.selectCache || !this.layout || this.selectLayoutKey(this.layout) !== warmed.key) {
                this.destroyNode(warmed.page);
            } else {
                this.cacheLevelSelect(warmed);
            }
        }
        if (this.prewarmDelay < 0 || this.state !== 'playing') return;
        this.prewarmDelay = Math.max(0, this.prewarmDelay - seconds);
        // 正在拖动、弹窗、领奖或提示演示时顺延，不和玩家操作抢同一帧。
        if (this.prewarmDelay > 0 || this.touchId !== undefined || this.overlay || this.dailyReward.active || this.guide.assisting) return;
        this.prewarmDelay = -1;
        this.prewarmLevelSelect();
    }

    /** 槽位内容签名：模式、页码与影响格子样式的进度；页码越界时为空页。 */
    private selectionSlotKey(slot: number): string {
        const mode = this.selectionMode, progress = this.save!.modes[mode], index = this.selectionPage + slot - 1;
        return index < 0 || index >= Math.ceil(this.levels(mode).length / PER_PAGE) ? `none:${index}`
            : `${mode}:${index}:${progress.cleared}:${progress.current}`;
    }

    /** 页内第 cell 个关卡在蛇形路线上的位置：偶数行从左往右，奇数行折返；六行整体居中，末页不满时停在上方。 */
    private selectionPoint(cell: number, pitch: number): Vec2 {
        const row = Math.floor(cell / SELECT_COLUMNS), step = cell % SELECT_COLUMNS;
        const column = row % 2 === 0 ? step : SELECT_COLUMNS - 1 - step;
        return new Vec2((column - (SELECT_COLUMNS - 1) / 2) * pitch, ((SELECT_ROWS - 1) / 2 - row) * pitch);
    }

    private fillSelectionSlot(slot: number): void {
        const view = this.selectionView, save = this.save;
        if (!view || !save) return;
        const mode = this.selectionMode, progress = save.modes[mode], total = this.levels(mode).length;
        const index = this.selectionPage + slot - 1, page = view.pages[slot], unlocked = fillUnlocked(mode, progress);
        const key = this.selectionSlotKey(slot);
        page.active = !key.startsWith('none:');
        if (view.slotKeys[slot] === key || !page.active) { view.slotKeys[slot] = key; return; }
        view.slotKeys[slot] = key;
        const first = index * PER_PAGE + 1, count = Math.min(PER_PAGE, total - first + 1);
        const theme = FILL_MODE_THEMES[mode], d = view.diameter, pitch = view.pitch;
        // 通关路线使用明亮模式色，其余路线保持可辨认的中间色。
        const route = page.getComponent(Graphics)!;
        route.clear(); route.lineWidth = pitch * .085;
        route.lineCap = Graphics.LineCap.ROUND; route.lineJoin = Graphics.LineJoin.ROUND;
        for (let cell = 1; cell < count; cell++) {
            const from = this.selectionPoint(cell - 1, pitch), to = this.selectionPoint(cell, pitch);
            route.strokeColor = color(first + cell - 1 <= progress.cleared ? this.selectionRouteColor(first + cell - 1).tile : theme.route);
            route.moveTo(from.x, from.y); route.lineTo(to.x, to.y); route.stroke();
        }
        for (let cell = 0; cell < PER_PAGE; cell++) {
            const number = first + cell;
            const tile = page.children[cell] ?? this.createLevelTile(page, view);
            tile.active = cell < count; tile.name = `Level${number}`;
            if (!tile.active) continue;
            Tween.stopAllByTarget(tile); tile.setScale(1, 1, 1);
            const point = this.selectionPoint(cell, pitch); tile.setPosition(point.x, point.y);
            const current = number === progress.current, cleared = number <= progress.cleared;
            const latest = !current && !cleared && number === unlocked, locked = number > unlocked;
            const g = tile.getComponent(Graphics)!, r = d / 2, lip = d * .05;
            g.clear();
            // 圆点像棋盘方格一样带下沿厚度：先画深一阶的底，再盖上面。
            const disc = (radius: number, face: string, edge: Color): void => {
                g.fillColor = edge; g.circle(0, -lip, radius); g.fill();
                g.fillColor = color(face); g.circle(0, 0, radius); g.fill();
            };
            // 当前关以亮环强调，通关关卡铺亮色；锁定关卡保留中间色和清晰轮廓。
            if (current) {
                g.strokeColor = color(theme.button, 230); g.lineWidth = 2.5;
                g.circle(0, -lip / 2, r + d * .085); g.stroke();
                disc(r, theme.accent, color(theme.accentShadow));
            } else if (cleared) {
                const set = this.selectionRouteColor(number);
                disc(r * .94, set.tile, color(set.line));
            } else if (latest) {
                disc(r, theme.surface, color(FILL_THEME.inset, FILL_THEME.insetAlpha));
                g.strokeColor = color(theme.accent); g.lineWidth = 2; g.circle(0, 0, r - 1); g.stroke();
            } else {
                disc(r * .86, theme.locked, color(FILL_THEME.inset, FILL_THEME.insetAlpha));
                g.strokeColor = color(theme.lockedEdge); g.lineWidth = 2; g.circle(0, 0, r * .86); g.stroke();
            }
            const label = tile.getChildByName('Number')!.getComponent(Label)!;
            label.string = String(number); label.color = color(locked ? theme.lockedInk : current || cleared ? FILL_THEME.buttonInk : FILL_THEME.ink);
            label.fontSize = Math.min(34, d * (locked ? .28 : .33)) * (number >= 1000 ? .86 : 1);
            label.node.setPosition(0, current || latest ? d * .09 : 0);
            // 说明文字只在“进行中/最新”两格需要，按需创建，其余格子不多挂 Label。
            let caption = tile.getChildByName('Caption')?.getComponent(Label);
            if (!caption && (current || latest)) {
                caption = this.text('Caption', tile, '', 0, -d * .24, d * .8, d * .2, Math.min(17, d * .16), FILL_THEME.muted, true);
            }
            if (caption) {
                caption.node.active = current || latest;
                caption.string = current ? '进行中' : '最新'; caption.color = color(current ? FILL_THEME.buttonInk : theme.button);
            }
        }
    }

    /** 路线按全局行号轮换所属模式的色阶，翻页后顺序连续。 */
    private selectionRouteColor(number: number): FillColorSet {
        const palette = this.modeTheme(this.selectionMode).routeColors;
        return palette[Math.floor((number - 1) / SELECT_COLUMNS) % palette.length];
    }

    private createLevelTile(page: Node, view: FillLevelSelectView): Node {
        const tile = this.makeNode('LevelTile', page, view.diameter, view.diameter);
        tile.addComponent(Graphics);
        this.text('Number', tile, '', 0, 0, view.diameter - 8, view.diameter * .5, Math.min(34, view.diameter * .33), FILL_THEME.ink, true);
        tile.on(Node.EventType.TOUCH_START, () => {
            if (!view.sliding && this.state === 'selecting') this.pressScale(tile, true);
        }, this);
        tile.on(Node.EventType.TOUCH_CANCEL, () => this.pressScale(tile, false), this);
        tile.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            this.pressScale(tile, false);
            const point = event.getUILocation(), start = event.getUIStartLocation();
            if (Vec2.distance(point, start) > 12 || this.selectionView !== view || view.sliding || view.drag?.moved
                || this.actionBusy || this.state !== 'selecting') return;
            const target = Number(tile.name.slice(5)), selected = this.save!.modes[this.selectionMode];
            if (target > fillUnlocked(this.selectionMode, selected)) { this.shakeLevelTile(tile); this.showToast('先完成前面的关卡，再继续挑战'); return; }
            this.context?.services.feedback.play('uiButton'); this.startLevel(this.selectionMode, target, true);
        }, this);
        return tile;
    }

    private pagerX(event: EventTouch): number {
        return this.localTouchPoint(event, this.page!).x;
    }
    private onPagerStart(event: EventTouch): void {
        const view = this.selectionView;
        if (!view || view.sliding || view.drag || this.state !== 'selecting') return;
        this.fillSelectionNeighbors();
        const point = this.localTouchPoint(event, this.page!);
        view.drag = { id: event.getID(), startX: point.x, startY: point.y, lastX: point.x, lastAt: Date.now(), velocity: 0, moved: false };
    }
    private onPagerMove(event: EventTouch): void {
        const view = this.selectionView, drag = view?.drag;
        if (!view || !drag || drag.id !== event.getID()) return;
        const point = this.localTouchPoint(event, this.page!), x = point.x, now = Date.now();
        drag.velocity = (x - drag.lastX) / Math.max(1, now - drag.lastAt) * 1000;
        drag.lastX = x; drag.lastAt = now;
        let dx = x - drag.startX;
        drag.moved ||= Math.abs(dx) > 12 || Math.abs(point.y - drag.startY) > 12;
        if ((dx > 0 && this.selectionPage === 0) || (dx < 0 && this.selectionPage >= Math.ceil(this.levels(this.selectionMode).length / PER_PAGE) - 1)) dx *= .3;
        view.track.setPosition(dx, 0);
    }
    private onPagerEnd(event: EventTouch, cancelled = false): void {
        const view = this.selectionView, drag = view?.drag;
        if (!view || !drag || drag.id !== event.getID()) return;
        view.drag = undefined;
        const dx = this.pagerX(event) - drag.startX;
        const direction = cancelled || !drag.moved ? 0 : dx < -135 || (dx < -12 && drag.velocity < -600) ? 1
            : dx > 135 || (dx > 12 && drag.velocity > 600) ? -1 : 0;
        this.changePage(direction);
    }

    private changePage(delta: number, onDone?: () => void): void {
        const view = this.selectionView;
        if (this.state !== 'selecting' || !view || view.sliding) return;
        const maxPage = Math.ceil(this.levels(this.selectionMode).length / PER_PAGE) - 1;
        if (this.selectionPage + delta < 0 || this.selectionPage + delta > maxPage) delta = 0;
        this.fillSelectionNeighbors();
        view.sliding = true; Tween.stopAllByTarget(view.track);
        tween(view.track).to(.22, { position: new Vec3(-delta * 750, 0, 0) }, { easing: 'quadOut' }).call(() => {
            if (this.selectionView !== view) return;
            // 槽位跟着页面轮转：刚滑入的页已经画好，只需补画新的远端邻页。
            view.sliding = false;
            // 回弹（未翻页）内容不变，只停在原位。
            if (delta === 0) { onDone?.(); return; }
            if (delta > 0) { view.pages.push(view.pages.shift()!); view.slotKeys.push(view.slotKeys.shift()!); }
            if (delta < 0) { view.pages.unshift(view.pages.pop()!); view.slotKeys.unshift(view.slotKeys.pop()!); }
            this.selectionPage += delta; this.fillSelectionPages(); onDone?.();
        }).start();
    }
    private jumpPage(number: number): void {
        const view = this.selectionView;
        if (!view || view.sliding) return;
        const target = Math.floor((number - 1) / PER_PAGE);
        const pulse = (): void => {
            const tile = view.pages[1].getChildByName(`Level${number}`);
            if (!tile) return;
            Tween.stopAllByTarget(tile);
            tween(tile).to(.12, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
                .to(.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        };
        if (Math.abs(target - this.selectionPage) === 1) this.changePage(target - this.selectionPage, pulse);
        else {
            this.selectionPage = target; this.fillSelectionPages();
            const opacity = view.track.getComponent(UIOpacity)!; Tween.stopAllByTarget(opacity);
            opacity.opacity = 0; tween(opacity).to(.18, { opacity: 255 }).call(pulse).start();
        }
    }

    private shakeLevelTile(tile: Node): void {
        const base = tile.position.clone(); Tween.stopAllByTarget(tile); tile.setScale(1, 1, 1);
        tween(tile).to(.06, { position: new Vec3(base.x - 5, base.y, 0) }).to(.06, { position: new Vec3(base.x + 5, base.y, 0) })
            .to(.06, { position: base }).start();
    }
    private createHardModeNotice(parent: Node, diameter = 30): void {
        if (!this.save || this.save.hardModeDiscovered || this.mode === 'hard') return;
        const size = parent.getComponent(UITransform)!;
        const node = this.makeNode('HardModeNotice', parent, diameter, diameter, size.width / 2 - 5, size.height / 2 - 5);
        const g = node.addComponent(Graphics), unit = diameter / 30;
        g.fillColor = color(FILL_THEME.white); g.circle(0, 0, diameter / 2 + 2); g.fill();
        g.fillColor = color(FILL_MODE_THEMES.hard.accent); g.circle(0, 0, diameter / 2); g.fill();
        g.fillColor = color(FILL_THEME.white); g.roundRect(-1.8 * unit, -1 * unit, 3.6 * unit, 10 * unit, 2 * unit); g.fill();
        g.circle(0, -6 * unit, 2 * unit); g.fill();
    }
    private discoverHardMode(): void {
        if (!this.save || this.save.hardModeDiscovered) return;
        this.save.hardModeDiscovered = true;
        const nodes = [this.node];
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].name === 'HardModeNotice') nodes[i].active = false;
            nodes.push(...nodes[i].children);
        }
        this.persist(false);
    }

    /** 暂停/结果弹窗：深石墨卡片 + 细亮边，白色标题、模式柔色胶囊和纵向按钮，不加顶部装饰。 */
    private showOverlay(title: string, subtitle: string | undefined, actions: readonly OverlayAction[]): void {
        this.destroyOverlay();
        if (!this.page || this.state === 'disposed' || !actions.length) return;
        this.overlayKind = 'dialog';
        this.overlay = this.makeNode('FillOverlay', this.page, 750, 1110);
        this.overlay.addComponent(BlockInputEvents);
        const dim = this.makeNode('Dim', this.overlay, 750, 1110); dim.addComponent(Graphics); dim.addComponent(BlockInputEvents);
        this.resizeOverlayDim(); this.fadeIn(dim, .18);
        const [first, ...rest] = actions;
        const height = 104 + (subtitle ? 58 : 0) + 20 + 116 + rest.length * 96 + 20, width = 600, radius = 44;
        const card = this.makeNode('OverlayCard', this.overlay, width, height);
        this.panel('OverlayShadow', card, width, height, 0, -14, FILL_THEME.dialogShadow, radius, FILL_THEME.dialogShadowAlpha);
        const panel = this.panel('OverlayPanel', card, width, height, 0, 0, this.modeTheme().dialog, radius);
        const edge = panel.getComponent(Graphics)!;
        edge.strokeColor = color(FILL_THEME.glass, FILL_THEME.glassEdgeAlpha); edge.lineWidth = 1.5;
        edge.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius - 1); edge.stroke();
        this.text('OverlayTitle', panel, title, 0, height / 2 - 66, 560, 62, 42, FILL_THEME.ink, true);
        let cursor = height / 2 - 104;
        if (subtitle) { this.modeTag('OverlaySubtitle', panel, subtitle, 0, cursor - 22, 22, true); cursor -= 58; }
        cursor -= 20;
        const add = (entry: OverlayAction, y: number, h: number, style: FillButtonStyle, size: number): void => {
            const button = this.button(entry.name, panel, entry.text, 0, y, 504, h, entry.action, style, entry.requiresUserGesture);
            button.label.fontSize = size;
            if (entry.name === 'Select') this.createHardModeNotice(button.node);
        };
        add(first, cursor - 48, 96, 'dialog-primary', 30); cursor -= 116;
        rest.forEach(entry => { add(entry, cursor - 40, 80, 'secondary', 26); cursor -= 96; });
        card.setScale(.9, .9, 1); this.fadeIn(card, .14);
        tween(card).to(.26, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    private resizeOverlayDim(): void {
        const overlay = this.overlay, layout = this.layout;
        if (!overlay || !layout) return;
        const width = layout.width / layout.scale, height = layout.height / layout.scale;
        // 蒙层和彩纸都按全屏 cover 铺满；内容仍留在安全区内的列里。
        for (const name of ['Dim', 'WinSparkles']) {
            const node = overlay.getChildByName(name);
            if (!node) continue;
            node.getComponent(UITransform)!.setContentSize(width, height); node.setPosition(0, -layout.centerY / layout.scale);
        }
        const graphics = overlay.getChildByName('Dim')?.getComponent(Graphics);
        if (!graphics) return;
        graphics.clear();
        graphics.fillColor = this.overlayKind === 'completion' ? color(this.modeTheme().background) : color(FILL_THEME.dim, 200);
        graphics.rect(-width / 2, -height / 2, width, height); graphics.fill();
    }

    /** 页面内唯一的浮层提示：浅色胶囊、淡入轻弹、停留后淡出；补间随页面节点一起销毁。 */
    private createToast(parent: Node, y: number): void {
        const node = this.makeNode('Toast', parent, 680, 60, 0, y), pill = node.addComponent(Graphics);
        const label = this.text('ToastLabel', node, '', 0, 0, 640, 52, 23, FILL_THEME.toastInk);
        const opacity = node.addComponent(UIOpacity); opacity.opacity = 0; node.active = false;
        this.toast = { node, label, pill, opacity };
    }

    private showToast(message: string): void {
        const toast = this.toast;
        if (!toast?.node.isValid) return;
        // 中文按字号、半角按约一半估宽，胶囊贴合文案且不超过页面安全宽度。
        const textWidth = Array.from(message).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 23 : 13), 0);
        const width = Math.min(680, textWidth + 64);
        toast.label.string = message;
        toast.pill.clear(); toast.pill.fillColor = color(FILL_THEME.toast);
        toast.pill.roundRect(-width / 2, -28, width, 56, 28); toast.pill.fill();
        Tween.stopAllByTarget(toast.node); Tween.stopAllByTarget(toast.opacity);
        toast.node.active = true; toast.node.setScale(.92, .92, 1); toast.opacity.opacity = 0;
        tween(toast.node).to(.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        tween(toast.opacity).to(.16, { opacity: 255 }).delay(2.1).to(.24, { opacity: 0 })
            .call(() => { if (toast.node.isValid) toast.node.active = false; }).start();
    }

    private makeNode(name: string, parent: Node, width: number, height: number, x = 0, y = 0): Node {
        const node = new Node(name); node.layer = this.node.layer; node.addComponent(UITransform).setContentSize(width, height);
        node.setParent(parent); node.setPosition(x, y); return node;
    }

    private text(name: string, parent: Node, value: string, x: number, y: number, width: number, height: number,
        size: number, hex: string, bold = false, align = Label.HorizontalAlign.CENTER): Label {
        const node = this.makeNode(name, parent, width, height, x, y), label = node.addComponent(Label);
        label.string = value; label.fontSize = size; label.lineHeight = size * 1.45; label.color = color(hex);
        label.horizontalAlign = align; label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK; label.enableWrapText = true; label.fontFamily = 'Arial'; setLabelBold(label, bold); return label;
    }

    private panel(name: string, parent: Node, width: number, height: number, x: number, y: number, hex: string, radius: number, alpha = 255): Node {
        const node = this.makeNode(name, parent, width, height, x, y), g = node.addComponent(Graphics);
        g.fillColor = color(hex, alpha); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill(); return node;
    }

    /** 烟晶面板：半透明白底 + 细亮边，用于引导卡和选关路线卡。 */
    private glassPanel(name: string, parent: Node, width: number, height: number, x: number, y: number, radius: number,
        alpha: number = FILL_THEME.glassAlpha, edgeAlpha: number = FILL_THEME.glassEdgeAlpha): Node {
        const node = this.panel(name, parent, width, height, x, y, FILL_THEME.glass, radius, alpha), g = node.getComponent(Graphics)!;
        g.strokeColor = color(FILL_THEME.glass, edgeAlpha); g.lineWidth = 1.5;
        g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius - 1); g.stroke();
        return node;
    }

    /**
     * 模式标签：普通用紫晶色、困难用珊瑚色。实心为模式色底深色字（通关页）；
     * soft 为模式色透明底、模式色细边与浅强调字（关卡头部）。
     */
    private modeTag(name: string, parent: Node, value: string, x: number, y: number, size: number, soft = false): Node {
        const theme = this.modeTheme(), width = this.textWidth(value, size) + size * 1.6, height = size + 16;
        if (!soft) {
            const node = this.panel(name, parent, width, height, x, y, theme.accent, 10);
            this.text(`${name}Label`, node, value, 0, 0, width, height, size, FILL_THEME.buttonInk, true);
            return node;
        }
        const node = this.panel(name, parent, width, height, x, y, theme.accent, height / 2, 52), g = node.getComponent(Graphics)!;
        g.strokeColor = color(theme.accent, 170); g.lineWidth = 1.5;
        g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, height / 2 - 1); g.stroke();
        this.text(`${name}Label`, node, value, 0, 0, width, height, size, theme.accentLight, true);
        return node;
    }

    /** 中文按字号、半角按约 0.56 倍字号估宽。 */
    private textWidth(value: string, size: number): number {
        return Array.from(value).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? size : size * .56), 0);
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

    private button(name: string, parent: Node, value: string, x: number, y: number, width: number, height: number,
        action: () => void | Promise<void>, style: FillButtonStyle = 'secondary', requiresUserGesture = false): FillButton {
        const node = this.makeNode(name, parent, width, height, x, y);
        node.addComponent(Graphics); this.paintButton(node, style);
        const label = this.text(`${name}Label`, node, value, 0, 0, width - 12, height - 8, 24,
            style === 'primary' || style === 'dialog-primary' ? FILL_THEME.buttonInk
                : style === 'light' ? this.modeTheme().accentLight : FILL_THEME.ink, true);
        // 按钮只响应它所在页面；离开的页面（含缓存的选关页）不再触发旧回调。
        const owner = this.page;
        let start: Vec2 | undefined, pointer: number | undefined;
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (this.actionBusy || pointer !== undefined) return;
            start = event.getUILocation().clone(); pointer = event.getID(); this.pressScale(node, true); event.propagationStopped = true;
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => { start = undefined; pointer = undefined; this.pressScale(node, false); });
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (pointer !== event.getID()) return;
            const from = start; start = undefined; pointer = undefined; this.pressScale(node, false); event.propagationStopped = true;
            if (!from || Vec2.distance(from, event.getUILocation()) > 16 || this.actionBusy
                || owner !== this.page || !node.activeInHierarchy || this.state === 'disposed') return;
            this.actionBusy = true;
            this.context?.services.feedback.play('uiButton');
            // 返回入口保留当前 touchend；运行层负责延后销毁节点和切场景。
            const invoke = async (): Promise<void> => { await action(); };
            const pending = requiresUserGesture ? invoke() : Promise.resolve().then(invoke);
            void pending.then(() => { this.actionBusy = false; }, (error: unknown) => {
                this.actionBusy = false;
                console.warn('[MultiColorFill] Action failed', error); this.showToast('操作未完成，请重试');
            });
        });
        return { node, label };
    }

    /**
     * 关卡与选关控件为烟晶（半透明白底 + 细亮边、浅色文字）；主按钮为实心模式色，
     * 次操作 light 为模式色透明底 + 模式色描边；弹窗主操作为带下沿厚度的实心模式色，弹窗次操作同为烟晶。
     */
    private paintButton(node: Node, style: FillButtonStyle): void {
        const g = node.getComponent(Graphics)!, size = node.getComponent(UITransform)!.contentSize;
        const width = size.width, height = size.height, radius = Math.min(height / 2, 24), theme = this.modeTheme();
        g.clear();
        if (style === 'dialog-primary') {
            // 弹窗主操作：实心模式色，下沿露出深一阶的厚度。
            g.fillColor = color(theme.buttonShadow); g.roundRect(-width / 2, -height / 2 - 6, width, height, radius); g.fill();
            g.fillColor = color(theme.button); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
            return;
        }
        if (style === 'primary') {
            g.fillColor = color(theme.button); g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
            return;
        }
        const light = style === 'light';
        g.fillColor = light ? color(theme.accent, 46) : color(FILL_THEME.glass, FILL_THEME.glassAlpha);
        g.roundRect(-width / 2, -height / 2, width, height, radius); g.fill();
        g.strokeColor = light ? color(theme.accent, 220) : color(FILL_THEME.glass, FILL_THEME.glassEdgeAlpha);
        g.lineWidth = light ? 2 : 1.5;
        g.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius - 1); g.stroke();
    }

    /** 按下快速压低，松手带一点回弹；不改输入区域。 */
    private pressScale(node: Node, down: boolean): void {
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        tween(node).to(down ? .06 : .18, { scale: down ? new Vec3(.95, .95, 1) : new Vec3(1, 1, 1) },
            { easing: down ? 'quadOut' : 'backOut' }).start();
    }

    private destroyOverlay(): void {
        this.destroyNode(this.overlay); this.overlay = undefined; this.winGraphics = undefined; this.winBoard = undefined; this.winTime = 0; this.overlayKind = 'dialog';
        this.winCellPoints = []; this.winStep = 0;
    }

    private clearPage(): void {
        const page = this.page, view = this.selectionView, toast = this.toast, layout = this.layout;
        this.selectionView = undefined;
        if (this.boardInput?.isValid) {
            this.boardInput.off(Node.EventType.TOUCH_START, this.onBoardStart, this);
            this.boardInput.off(Node.EventType.TOUCH_MOVE, this.onBoardMove, this);
            this.boardInput.off(Node.EventType.TOUCH_END, this.onBoardEnd, this);
            this.boardInput.off(Node.EventType.TOUCH_CANCEL, this.onBoardCancel, this);
        }
        this.boardInput = undefined; this.tiles = []; this.tileRows = []; this.cellPoints = []; this.pointerPoint = undefined;
        this.boardDirty = false; this.boardPitch = -1; this.boardRevision = -1; this.syncedRevision = -1;
        this.routesAnimating = false; this.sparklesDrawing = false; this.guideDrawing = undefined;
        this.fingerX = NaN; this.fingerY = NaN; this.fingerColor = -2;
        this.routeGraphics = undefined; this.capGraphics = undefined; this.fingerGraphics = undefined;
        this.progressGraphics = undefined; this.progressLabel = undefined;
        this.boardSparkles = undefined; this.guideGraphics = undefined; this.guideLabel = undefined; this.guideDetail = undefined;
        this.toast = undefined; this.hintCountLabel = undefined; this.hintButton = undefined; this.hintAdIcon = undefined; this.hintOpacity = undefined;
        this.page = undefined;
        if (page?.isValid && view && toast && layout && this.state !== 'disposed') {
            // 选关页整页缓存：停掉翻页与提示补间，移出屏幕并隐藏渲染，保留组件的准备状态。
            if (this.selectCache?.page !== page) this.destroySelectCache();
            Tween.stopAllByTarget(view.track); view.drag = undefined; view.sliding = false; view.pendingSlots = [];
            Tween.stopAllByTarget(toast.opacity); Tween.stopAllByTarget(toast.node); toast.node.active = false;
            this.cacheLevelSelect({ page, view, toast, key: this.selectLayoutKey(layout) });
        } else this.destroyNode(page);
    }

    private selectLayoutKey(layout: MultiColorFillLayout): string {
        return [layout.width, layout.height, layout.top, layout.bottom].map(value => value.toFixed(1)).join(':');
    }

    /** 不切换 active，避免每次进入时所有 Label/Graphics 重新 onEnable；屏幕外节点也不会命中触摸。 */
    private cacheLevelSelect(cache: FillSelectCache): void {
        const opacity = cache.page.getComponent(UIOpacity) ?? cache.page.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity); opacity.opacity = 0;
        cache.page.setPosition(SELECT_CACHE_X, cache.page.position.y);
        // 底图在 0；缓存排在玩法页下面，让触摸先命中当前屏幕上的控件。
        cache.page.setSiblingIndex(1);
        this.selectCache = cache;
    }

    /** 同一屏幕尺寸复用缓存的选关页；尺寸变化则丢弃重建。 */
    private restoreLevelSelect(): boolean {
        const cache = this.selectCache ?? this.prewarmed, layout = this.layout!;
        this.selectCache = undefined; this.prewarmed = undefined;
        if (!cache) return false;
        if (!cache.page.isValid || cache.key !== this.selectLayoutKey(layout)) { this.destroyNode(cache.page); return false; }
        this.page = cache.page; this.selectionView = cache.view; this.toast = cache.toast;
        cache.page.active = true;
        cache.page.setPosition(0, layout.centerY);
        const opacity = cache.page.getComponent(UIOpacity);
        if (opacity) { Tween.stopAllByTarget(opacity); opacity.opacity = 255; }
        this.refreshSelectionHeader(); this.fillSelectionPages();
        return true;
    }

    /** 关卡内空闲时在屏幕外预建选关页；渲染一帧后由 runDeferredWork 收进缓存，首次打开选关也只需激活。 */
    private prewarmLevelSelect(): void {
        const layout = this.layout, save = this.save;
        if (this.selectCache || this.prewarmed || !layout || !save) return;
        const restore = { page: this.page, view: this.selectionView, toast: this.toast, mode: this.selectionMode, index: this.selectionPage };
        this.selectionMode = this.mode; this.selectionPage = Math.floor((save.modes[this.mode].current - 1) / PER_PAGE);
        const page = this.page = this.makeNode('FillPage', this.node, 750, 1110, SELECT_CACHE_X, layout.centerY);
        page.setScale(layout.scale, layout.scale, 1);
        this.buildLevelSelect();
        const view = this.selectionView!;
        view.pendingSlots = [];
        this.prewarmed = { page, view, toast: this.toast!, key: this.selectLayoutKey(layout) };
        this.page = restore.page; this.selectionView = restore.view; this.toast = restore.toast;
        this.selectionMode = restore.mode; this.selectionPage = restore.index;
    }

    private schedulePrewarm(): void {
        if (!this.selectCache && !this.prewarmed) this.prewarmDelay = 1.5;
    }

    private destroySelectCache(): void {
        this.destroyNode(this.selectCache?.page); this.selectCache = undefined;
    }

    private destroyNode(node?: Node): void {
        if (!node?.isValid) return;
        const pending = [node];
        for (let i = 0; i < pending.length; i += 1) {
            Tween.stopAllByTarget(pending[i]);
            const opacity = pending[i].getComponent(UIOpacity); if (opacity) Tween.stopAllByTarget(opacity);
            pending.push(...pending[i].children);
        }
        node.active = false; node.destroy();
    }
}
