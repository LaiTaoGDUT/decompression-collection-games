import {
    AudioClip,
    BlockInputEvents,
    Color,
    Component,
    EventTouch,
    Graphics,
    Label,
    Mask,
    Node,
    ResolutionPolicy,
    SpriteFrame,
    UITransform,
    UIOpacity,
    Vec2,
    Vec3,
    _decorator,
    director,
    view,
} from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService, AudioVoiceScope } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { Platform } from '../../../platform/Platform';
import type { StorageService } from '../../../services/storage/StorageService';
import type {
    MiniGame,
    MiniGameBackgroundPausePolicy,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import { CYBLOCKBEES_AUDIO_BANK, CYBLOCKBEES_BEE_LOOP, CYBLOCKBEES_PENCIL_LOOP } from './CyBlockBeesAudio';
import { CyBlockBeesBoard, enableBoardPhysics, planBoardPhysics, stepBoardPhysics } from './CyBlockBeesBoard';
import {
    CYBLOCKBEES_STAR_THRESHOLDS,
    CYBLOCKBEES_STICKERS,
    CyBlockBeesUi,
    cyblockbeesStars,
    type StickerStyle,
} from './CyBlockBeesUi';
import {
    CYBLOCKBEES_LEVELS,
    getCyBlockBeesLevel,
    type CyBlockBeesLevel,
} from './CyBlockBeesLevels';
import {
    CYBLOCKBEES_DEFAULT_SAVE,
    CYBLOCKBEES_SAVE_VERSION,
    countCyBlockBeesThreeStarLevels,
    readCyBlockBeesSave,
    type CyBlockBeesSave,
} from './CyBlockBeesProgress';
import { CYBLOCKBEES_SPRITES, CYBLOCKBEES_SPRITE_DIRECTORIES } from './CyBlockBeesSprites';
import {
    CYBLOCKBEES_BUNDLE,
    CYBLOCKBEES_PALETTE,
    CYBLOCKBEES_RESOURCE_BUNDLE,
    CYBLOCKBEES_RULES,
} from './CyBlockBeesTheme';

const { ccclass } = _decorator;

export const CYBLOCKBEES_DESIGN_WIDTH = 750;
export const CYBLOCKBEES_DESIGN_HEIGHT = 1334;

/** 选关页蜂巢 4 列；常规屏 6 行一页，矮屏减少行数而不是把格子缩到难以点击。 */
const LEVEL_COLUMNS = 4;
const LEVEL_ROWS = 6;
const LEVELS_PER_PAGE = LEVEL_COLUMNS * LEVEL_ROWS;
/** 蜂巢格子允许的最小缩放；再矮就减少每页行数。 */
const MIN_GRID_SCALE = .74;
/** 页数超过此值时，翻页栏显示页码文字而不是圆点。 */
const MAX_PAGE_DOTS = 12;
/** 横向移动超过此距离（设计像素）判定为滑动；松手时超过 SWIPE_TURN 翻页。 */
const SWIPE_START = 16;
const SWIPE_TURN = 90;
/** 蜂巢格子的外接圆半径与间距（缩放前的设计像素）。 */
const HEX_RADIUS = 80;
/** 蜂群碰撞触发的平台振动最短间隔（毫秒）。 */
const BEE_VIBRATE_INTERVAL_MS = 250;
/** 容纳低频触摸事件间隔；声音跟随原始手指移动，不受画线采样点间距影响。 */
const PENCIL_MOVE_HOLD_SECONDS = .15;
const HEX_GAP = 12;
const HEX_DEPTH = 8;
/** HUD 两行（按钮行 + 墨水条/秒表行）的总高度；其下方直到底部安全边界是玩法窗口。 */
const HUD_HEIGHT = 186;
/** 铅笔墨水条的中心 x 与满墨总长；笔杆可伸缩部分从橡皮和金属箍（34）之后开始，减去笔尖（30）。 */
const INK_METER_CENTER = -44;
const INK_METER_LENGTH = 560;
const INK_METER_BODY_START = 34;
const INK_METER_BODY_LENGTH = INK_METER_LENGTH - INK_METER_BODY_START - 30;

/** 剩余墨水比例对应的笔杆末端，相对铅笔中心。 */
function inkMeterX(ratio: number): number {
    return -INK_METER_LENGTH / 2 + INK_METER_BODY_START + INK_METER_BODY_LENGTH * ratio;
}

const P = CYBLOCKBEES_PALETTE;

/** 由 update 统一驱动的界面动效；返回 true 表示结束。节点失效后自动移除。 */
interface Motion {
    readonly node: Node;
    time: number;
    readonly step: (node: Node, time: number) => boolean;
}

/** 选关页的蜂巢翻页：容器固定在原点，已构建的页按「页号差 × 屏宽 + 拖动偏移」摆放。 */
interface LevelCarousel {
    readonly root: Node;
    readonly pages: Map<number, Node>;
    /** 每页已构建的行数；相邻页在空闲帧逐行补齐。 */
    readonly builtRows: Map<number, number>;
    readonly rows: number;
    readonly colStep: number;
    readonly rowStep: number;
    readonly gridWidth: number;
    readonly gridHeight: number;
    readonly scale: number;
    readonly totalPages: number;
    readonly pagerRoot: Node;
    offset: number;
    animating: boolean;
    dragging: boolean;
}

interface OverlayAction {
    readonly label: string;
    readonly action: () => void;
}

interface OverlaySpec {
    readonly caption: string;
    readonly title: string;
    readonly ribbon: StickerStyle;
    readonly portrait: string;
    readonly stars?: number;
    readonly body?: string;
    readonly primary: OverlayAction;
    readonly secondary: readonly OverlayAction[];
}

type CyBlockBeesState = 'idle' | 'ready' | 'selecting' | 'playing' | 'finished' | 'paused' | 'disposed';

export interface CyBlockBeesServices {
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
}

/** 精选 200 关的画线防守；绘制完成才释放刚体、出蜂和计时。 */
@ccclass('CyBlockBeesGame')
export class CyBlockBeesGame extends Component implements MiniGame<CyBlockBeesServices> {
    readonly backgroundPausePolicy: MiniGameBackgroundPausePolicy = 'menu';

    private state: CyBlockBeesState = 'idle';
    private context?: MiniGameContext<CyBlockBeesServices>;
    private board?: CyBlockBeesBoard;
    private audioBank?: BundleAudioBank;
    private frames = new Map<string, SpriteFrame>();
    private ownedFrames: SpriteFrame[] = [];
    private root?: Node;
    private pageRoot?: Node;
    private overlayRoot?: Node;
    private hudRoot?: Node;
    private ui!: CyBlockBeesUi;
    private clock?: Graphics;
    private clockFace?: Graphics;
    private lastClockDanger?: boolean;
    private lastClockRatio = -1;
    private clockLabelColor = P.text;
    private inkStars: Graphics[] = [];
    private motions: Motion[] = [];
    /** 空闲帧任务（每帧最多执行一个），用于预建选关的相邻页。 */
    private idleTasks: (() => void)[] = [];
    private carousel?: LevelCarousel;
    private lastInk = -1;
    private inkDirty = false;
    private touchId?: number;
    private navigationPending = false;

    private save: CyBlockBeesSave = CYBLOCKBEES_DEFAULT_SAVE;
    private levelIndex = 0;
    private page = 0;
    private pageSize = LEVELS_PER_PAGE;
    private timeLeft = 0;
    private timeTotal = 0;
    private drawnLength = 0;
    private drawing = false;
    private draftPoints: Vec2[] = [];
    private roundStarted = false;
    private restartToSelect = false;
    private flyClip?: AudioClip;
    private flyVoice?: AudioVoiceScope;
    private pencilClip?: AudioClip;
    private pencilVoice?: AudioVoiceScope;
    private pencilIdleSeconds = Infinity;
    private pencilVolume = 0;
    private pencilLastPoint?: Vec2;
    private dogAlive = true;
    private failureHint = '';
    private hiveTimers: { element: CyBlockBeesLevel['elements'][number]; elapsed: number;
        next: number; interval: number; count: number; initial: number; isLeft: boolean;
        phase: 'warmup' | 'initial' | 'regular' | 'interval' }[] = [];
    private timerLabel?: Label;
    private inkBar?: Graphics;
    private levelLabel?: Label;
    // 用对象身份标记生命周期；Cocos 销毁组件时会把数值字段重置为 0。
    private lifecycle: object = {};

    // ------------------------------------------------------------ 生命周期

    async initialize(context: MiniGameContext<CyBlockBeesServices>): Promise<void> {
        if (this.state === 'disposed') return;
        const lifecycle = this.lifecycle;
        this.context = context;
        view.setDesignResolutionSize(CYBLOCKBEES_DESIGN_WIDTH, CYBLOCKBEES_DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
        this.readSave();
        await this.loadVisuals(lifecycle);
        if (lifecycle !== this.lifecycle) return;
        this.root = this.makeNode('CyBlockBeesRoot');
        this.root.setParent(this.node);
        this.root.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);
        this.ui = new CyBlockBeesUi(slug => this.frameOf(slug), () => this.context?.services.feedback.play('uiButton'));
        this.audioBank = new BundleAudioBank(
            CYBLOCKBEES_AUDIO_BANK,
            context.services.audio,
            context.services.feedback,
            context.services.assets,
        );
        await this.audioBank.initialize();
        if (lifecycle !== this.lifecycle) return;
        const [flyClip, pencilClip] = await Promise.all([
            context.services.assets.loadAudioClip(CYBLOCKBEES_RESOURCE_BUNDLE, CYBLOCKBEES_BEE_LOOP),
            context.services.assets.loadAudioClip(CYBLOCKBEES_RESOURCE_BUNDLE, CYBLOCKBEES_PENCIL_LOOP),
        ]);
        if (lifecycle !== this.lifecycle) return;
        this.flyClip = flyClip;
        this.flyVoice = context.services.audio.createVoiceScope('effect');
        this.pencilClip = pencilClip;
        this.pencilVoice = context.services.audio.createVoiceScope('effect');
        this.state = 'ready';
    }

    isGameplayActive(): boolean {
        return this.state === 'playing';
    }

    begin(): void {
        // initialize 已从存档定位最新解锁关，进入后直接开始该关的画线规划。
        this.startLevel(this.levelIndex);
        // 当前存档或云恢复中的三星成绩同步到成就进度。
        this.reportThreeStarProgress();
    }

    pause(): boolean {
        if (this.state !== 'playing') return false;
        this.state = 'paused';
        this.cancelDrawing();
        this.flyVoice?.pause();
        this.audioBank?.stopEffects();
        enableBoardPhysics(false);
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        enableBoardPhysics(this.roundStarted);
        this.flyVoice?.resume();
    }

    async restart(context?: MiniGameContext<CyBlockBeesServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') return;
        if (context) this.context = context;
        this.removeOverlay();
        if (this.restartToSelect) { this.restartToSelect = false; this.buildSelectPage(); }
        else this.startLevel(this.levelIndex);
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.showOverlay({
            caption: `第 ${this.levelIndex + 1} 关`,
            title: '已暂停',
            ribbon: CYBLOCKBEES_STICKERS.cream,
            portrait: 'dog-idle',
            body: '蜂群和计时都停下来了',
            primary: { label: '继续', action: () => { this.removeOverlay(); void model.resume(); } },
            secondary: [
                { label: '重新开始', action: () => { this.removeOverlay(); void model.restart(); } },
                { label: '选关', action: () => { this.removeOverlay(); this.restartToSelect = true; void model.restart(); } },
                { label: '返回大厅', action: () => { this.removeOverlay(); void model.exit(); } },
            ],
        });
    }

    hidePauseMenu(): void {
        this.removeOverlay();
    }

    showResultView(model: MiniGameResultModel): void {
        const won = model.result.extra?.won === true;
        const score = model.result.score ?? 0;
        const hasNext = won && this.levelIndex < CYBLOCKBEES_LEVELS.length - 1;
        this.showOverlay({
            caption: `第 ${this.levelIndex + 1} 关`,
            title: won ? '守护成功' : '守护失败',
            ribbon: won ? CYBLOCKBEES_STICKERS.honey : CYBLOCKBEES_STICKERS.danger,
            portrait: won ? 'dog-win' : 'dog-lose',
            stars: won ? cyblockbeesStars(score / 1000) : undefined,
            body: won ? `剩余墨水 ${Math.round(score / 10)}%` : this.failureHint || '未能完成本关的守护目标',
            primary: { label: hasNext ? '下一关' : won ? '重新开始' : '再试一次',
                action: () => { if (hasNext) this.levelIndex++; void model.restart(); } },
            secondary: [
                ...(hasNext ? [{ label: '重新开始', action: () => { void model.restart(); } }] : []),
                { label: '选关', action: () => { this.restartToSelect = true; void model.restart(); } },
                { label: '返回大厅', action: () => { void model.returnToLobby(); } },
            ],
        });
    }

    hideResultView(): void {
        this.removeOverlay();
    }

    async dispose(): Promise<void> {
        // 初始化超时/加载失败时，dispose 可能先于异步加载完成；迟到的结果不能恢复页面或音频。
        this.lifecycle = {};
        this.state = 'disposed';
        this.removeOverlay(); this.clearPage();
        this.motions.length = 0;
        this.drawing = false; this.touchId = undefined; this.draftPoints = [];
        this.hiveTimers.length = 0;
        this.flyVoice?.dispose();
        this.flyVoice = undefined;
        this.flyClip = undefined;
        this.pencilVoice?.dispose();
        this.pencilVoice = undefined;
        this.pencilClip = undefined;
        this.pencilLastPoint = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        for (const frame of this.ownedFrames) {
            this.context?.services.assets.releaseRuntimeAsset(frame);
        }
        this.ownedFrames.length = 0;
        this.frames.clear();
        for (const directory of CYBLOCKBEES_SPRITE_DIRECTORIES) {
            await this.context?.services.assets.releaseDirectory(CYBLOCKBEES_RESOURCE_BUNDLE, directory);
        }
        if (this.root?.isValid) this.root.destroy();
        this.root = undefined;
        this.pageRoot = undefined;
        await this.context?.services.assets.releaseBundle(CYBLOCKBEES_RESOURCE_BUNDLE);
        this.context = undefined;
    }

    protected update(deltaTime: number): void {
        if (this.state === 'disposed') return;
        this.updateDrawingAudio(Math.max(0, Math.min(.1, deltaTime)));
        this.stepMotions(deltaTime);
        // 选关页在没有拖动和动画时，每帧最多预建一页。
        if (this.idleTasks.length && !this.carousel?.animating && !this.carousel?.dragging) this.idleTasks.shift()!();
        if (this.state !== 'playing' || !this.board) return;
        const frame = Math.max(0, Math.min(CYBLOCKBEES_RULES.maxFrameDelta, deltaTime));
        // 物理放弃追赶的积压同时从游戏时间扣除；蜂群 AI、出蜂和倒计时与物理使用同一时钟。
        const physics = this.roundStarted && frame > 0 ? planBoardPhysics(frame) : { dt: frame, steps: 0 };
        const dt = physics.dt;
        this.board.updateFrame(dt);
        stepBoardPhysics(physics.steps, this.board);
        this.board.renderFrame();
        if (this.inkDirty) this.updateInk();
        if (!this.roundStarted || dt <= 0) return;
        if (this.state !== 'playing') return;
        this.advanceHives(dt);
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.updateHud();
        if (this.timeLeft <= 0) this.finish(this.dogAlive && this.board.bonesCollected);
    }

    private get canvasHeight(): number {
        const size = view.getVisibleSize();
        return size.width > 0 ? size.height * CYBLOCKBEES_DESIGN_WIDTH / size.width : CYBLOCKBEES_DESIGN_HEIGHT;
    }

    private safeBounds(): ReturnType<typeof calculateVerticalSafeBounds> {
        return calculateVerticalSafeBounds(this.canvasHeight, this.context?.services.platform.getLayoutInfo());
    }

    // ------------------------------------------------------------ 资源

    /**
     * 帧按目录整体加载。
     *
     * 图集会被 `sprite-atlas-sources/build.py` 按 1024 分页，同一组的帧可能落在
     * `cyblockbees-fx` 和 `cyblockbees-fx-2` 两个页上；按目录取就能拿到全部帧，
     * 键是「图集名/帧名」，这里再还原成 slug。
     */
    private async loadVisuals(lifecycle: object): Promise<void> {
        const assets = this.context?.services.assets;
        if (!assets) throw new Error('CyBlockBeesGame requires the asset service.');
        await assets.loadBundle(CYBLOCKBEES_RESOURCE_BUNDLE);
        if (lifecycle !== this.lifecycle) return;
        for (const directory of CYBLOCKBEES_SPRITE_DIRECTORIES) {
            try {
                const frames = await assets.loadDirectoryFrames(CYBLOCKBEES_RESOURCE_BUNDLE, directory);
                if (lifecycle !== this.lifecycle) return;
                for (const key of Object.keys(frames)) {
                    const slug = key.split('/').pop()?.replace(/-v1$/, '');
                    if (slug) this.frames.set(slug, frames[key]);
                }
            } catch (error) {
                if (lifecycle !== this.lifecycle) return;
                // 目录为空（例如还没导出特效）不应该让整个游戏起不来。
                console.warn(`CyBlockBees: 目录 ${directory} 没有可用帧`, error);
            }
        }
        // 天空是超尺寸的独立纹理，不在图集里。
        try {
            const sky = await assets.loadSpriteFrames(CYBLOCKBEES_RESOURCE_BUNDLE, [
                { key: 'sky', path: CYBLOCKBEES_SPRITES.sky, type: 'texture' },
            ]);
            if (lifecycle !== this.lifecycle) return;
            if (sky.sky) {
                this.frames.set('sky', sky.sky);
                this.ownedFrames.push(sky.sky);
                assets.trackRuntimeAsset(CYBLOCKBEES_RESOURCE_BUNDLE, sky.sky);
            }
        } catch (error) {
            if (lifecycle !== this.lifecycle) return;
            console.warn('CyBlockBees: 天空纹理缺失', error);
        }
    }

    private frameOf(slug: string): SpriteFrame | undefined {
        return this.frames.get(slug);
    }

    // ------------------------------------------------------------ 存档

    private readSave(): void {
        const context = this.context;
        if (!context) return;
        const stored = context.services.storage.getGameData(context.gameId);
        this.save = readCyBlockBeesSave(stored?.dataVersion === 1 ? stored.custom : undefined);
        this.levelIndex = Math.max(0, Math.min(CYBLOCKBEES_LEVELS.length - 1, this.save.unlocked - 1));
        this.page = Math.floor(this.levelIndex / this.pageSize);
    }

    private reportThreeStarProgress(): void {
        this.context?.reportAchievementProgress('three-star-levels', countCyBlockBeesThreeStarLevels(this.save));
    }

    private persistSave(next: CyBlockBeesSave): void {
        this.save = Object.freeze(next);
        const context = this.context;
        if (!context) return;
        const stored = context.services.storage.getGameData(context.gameId);
        const previous = stored?.dataVersion === 1 && stored.custom?.version === CYBLOCKBEES_SAVE_VERSION
            ? stored : undefined;
        context.services.storage.writeGameData(context.gameId, {
            dataVersion: 1,
            playCount: (previous?.playCount ?? 0) + 1,
            highScore: Math.max(previous?.highScore ?? 0, next.cleared),
            lastPlayedAt: Date.now(),
            custom: this.save as unknown as Readonly<Record<string, unknown>>,
        });
    }

    // ------------------------------------------------------------ 选关页

    private buildSelectPage(): void {
        const root = this.preparePage('select');
        this.state = 'selecting';
        const bounds = this.safeBounds(), top = bounds.topY;

        // 第一行：返回大厅 / 游戏标题。
        this.ui.button(root, '返回大厅', -301, top - 52, 84, 84,
            () => this.context?.requestLobby(), { icon: 'back' });
        this.ui.label(root, '挡住蜜蜂', 0, top - 54, 64,
            { color: P.honey, bold: true, stroke: P.outline, strokeWidth: 8, width: 330 });
        const titleBee = this.ui.image(root, 'bee', 172, top - 30, 54);
        this.float(titleBee, 5, 1.5);

        this.buildContinueCard(root, top - 178);

        // 蜂巢格子按宽度排布：放得下 6 行就等比缩放填满，放不下时先减少行数，
        // 保证格子不小于 MIN_GRID_SCALE，矮屏也能准确点中。
        const gridTop = top - 300, gridBottom = bounds.bottomY + 112, available = gridTop - gridBottom;
        const colStep = Math.sqrt(3) * HEX_RADIUS + HEX_GAP, rowStep = HEX_RADIUS * 1.5 + HEX_GAP;
        const heightFor = (rows: number): number => (rows - 1) * rowStep + HEX_RADIUS * 2 + HEX_DEPTH;
        let rows = LEVEL_ROWS;
        while (rows > 2 && available / heightFor(rows) < MIN_GRID_SCALE) rows--;
        const gridHeight = heightFor(rows);
        const scale = Math.min(1, available / gridHeight);
        const pageSize = rows * LEVEL_COLUMNS;
        // 每页容量变化时，以旧页里的当前关（不在旧页时取旧页首关）定位新页，避免跳到别处。
        if (pageSize !== this.pageSize) {
            const first = this.page * this.pageSize;
            const anchor = this.levelIndex >= first && this.levelIndex < first + this.pageSize ? this.levelIndex : first;
            this.page = Math.floor(anchor / pageSize); this.pageSize = pageSize;
        }
        const totalPages = Math.ceil(CYBLOCKBEES_LEVELS.length / pageSize);
        this.page = Math.max(0, Math.min(totalPages - 1, this.page));
        this.ui.label(root, '选择关卡', -219, top - 272, 28, { bold: true, width: 250, align: 'left', color: P.text });

        const gridWidth = (LEVEL_COLUMNS + .5) * colStep;
        // 容器宽度等于屏宽并用遮罩裁切。相邻页保留激活及文字预建，
        // 完全位于屏外时用透明度跳过渲染遍历，滑入时复用已有网格和纹理。
        const container = this.ui.node(root, 'level-pages', 0, (gridTop + gridBottom) / 2,
            CYBLOCKBEES_DESIGN_WIDTH, gridHeight * scale + 16);
        container.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const pagerRoot = this.ui.node(root, 'pager-bar', 0, bounds.bottomY + 52, CYBLOCKBEES_DESIGN_WIDTH, 96);
        this.carousel = { root: container, pages: new Map(), builtRows: new Map(), rows, colStep, rowStep, gridWidth, gridHeight, scale,
            totalPages, offset: 0, animating: false, dragging: false, pagerRoot };
        this.buildLevelPage(this.page, true);
        this.placePages();
        this.refreshPager();
        this.bindPageSwipe(container);
        this.queueNeighborPages();
    }

    /** 构建某一页的蜂巢网格（含尚未补完的行）；只在选关页初次进入时逐格弹出。 */
    private buildLevelPage(page: number, pop: boolean): Node {
        const grid = this.ensureLevelGrid(page);
        while (this.addLevelRow(page, pop));
        return grid;
    }

    private ensureLevelGrid(page: number): Node {
        const carousel = this.carousel!;
        const existing = carousel.pages.get(page);
        if (existing?.isValid) return existing;
        const grid = this.ui.node(carousel.root, `level-grid-${page + 1}`, 0, 0, carousel.gridWidth, carousel.gridHeight);
        grid.addComponent(UIOpacity);
        grid.setScale(carousel.scale, carousel.scale, 1);
        carousel.pages.set(page, grid);
        carousel.builtRows.set(page, 0);
        this.placePages();
        return grid;
    }

    /** 给某页补一行格子；该页已完整时返回 false。 */
    private addLevelRow(page: number, pop: boolean): boolean {
        const carousel = this.carousel!, grid = carousel.pages.get(page), row = carousel.builtRows.get(page) ?? 0;
        const startIndex = page * this.pageSize + row * LEVEL_COLUMNS;
        const endIndex = Math.min(startIndex + LEVEL_COLUMNS, (page + 1) * this.pageSize, CYBLOCKBEES_LEVELS.length);
        if (!grid || row >= carousel.rows || startIndex >= endIndex) return false;
        for (let index = startIndex; index < endIndex; index += 1) {
            const col = index - startIndex;
            const x = (col - (LEVEL_COLUMNS - 1) / 2 + (row % 2 ? .25 : -.25)) * carousel.colStep;
            const y = carousel.gridHeight / 2 - HEX_RADIUS - HEX_DEPTH / 2 - row * carousel.rowStep;
            this.addLevelCell(grid, index, x, y, row * LEVEL_COLUMNS + col, pop);
        }
        carousel.builtRows.set(page, row + 1);
        return true;
    }

    /** 按当前页与滑动偏移摆放已构建的页（页号差 × 屏宽 + 偏移），屏外部分由容器遮罩裁掉。 */
    private placePages(): void {
        const carousel = this.carousel;
        if (!carousel) return;
        carousel.pages.forEach((grid, page) => {
            const x = (page - this.page) * CYBLOCKBEES_DESIGN_WIDTH + carousel.offset;
            if (grid.position.x !== x) grid.setPosition(x, 0, 0);
            // 保留节点激活，避免反复 onDisable 销毁 Label 的 renderData。
            grid.getComponent(UIOpacity)!.opacity = Math.abs(x) < CYBLOCKBEES_DESIGN_WIDTH ? 255 : 0;
        });
    }

    /** 翻页栏：两侧箭头 + 页码圆点，页数过多时改为文字。 */
    private refreshPager(): void {
        const carousel = this.carousel;
        if (!carousel) return;
        const bar = carousel.pagerRoot, total = carousel.totalPages;
        for (const child of bar.children.slice()) { child.removeFromParent(); child.destroy(); }
        this.ui.button(bar, '上一页', -290, 0, 96, 88, () => this.turnPage(-1), { icon: 'back', disabled: this.page === 0 });
        this.ui.button(bar, '下一页', 290, 0, 96, 88, () => this.turnPage(1), { icon: 'next', disabled: this.page >= total - 1 });
        if (total > MAX_PAGE_DOTS) {
            const pill = this.ui.card(bar, 'pager', 0, 0, 180, 64, CYBLOCKBEES_STICKERS.cream, 28, 6);
            this.ui.label(pill, `${this.page + 1} / ${total}`, 0, 3, 28, { bold: true, width: 150 });
            return;
        }
        const dots = this.ui.node(bar, 'pager', 0, 4, 400, 40).addComponent(Graphics);
        dots.lineWidth = 3; dots.strokeColor = P.outline;
        for (let i = 0; i < total; i++) {
            const x = (i - (total - 1) / 2) * 34;
            if (i === this.page) { dots.fillColor = P.honey; dots.roundRect(x - 16, -9, 32, 18, 9); }
            else { dots.fillColor = P.cream; dots.circle(x, 0, 7); }
            dots.fill(); dots.stroke();
        }
    }

    /** 空闲帧里预建相邻页，并释放离当前页较远的页；每帧只建一页，避免翻页时临时构建造成卡顿。 */
    private queueNeighborPages(): void {
        const carousel = this.carousel;
        if (!carousel) return;
        for (const [page, grid] of Array.from(carousel.pages.entries())) {
            if (Math.abs(page - this.page) > 1) { grid.destroy(); carousel.pages.delete(page); carousel.builtRows.delete(page); }
        }
        this.idleTasks.length = 0;
        for (const page of [this.page + 1, this.page - 1]) {
            if (page < 0 || page >= carousel.totalPages) continue;
            // 每个空闲帧补一行，单帧开销只有几个格子。
            for (let row = 0; row < carousel.rows; row++) this.idleTasks.push(() => {
                if (this.carousel !== carousel || Math.abs(page - this.page) > 1) return;
                this.ensureLevelGrid(page);
                this.addLevelRow(page, false);
            });
        }
    }

    private turnPage(direction: -1 | 1): void {
        const carousel = this.carousel;
        const next = this.page + direction;
        if (!carousel || this.state !== 'selecting' || carousel.animating || next < 0 || next >= carousel.totalPages) return;
        this.settlePages(direction);
    }

    /** 从当前偏移缓动到目标页（direction 为 0 时回弹到当前页），结束后更新页码并预建新的相邻页。 */
    private settlePages(direction: -1 | 0 | 1): void {
        const carousel = this.carousel!;
        if (direction !== 0) this.buildLevelPage(this.page + direction, false);
        const from = carousel.offset, to = -direction * CYBLOCKBEES_DESIGN_WIDTH;
        const duration = Math.max(.14, Math.min(.3, Math.abs(to - from) / CYBLOCKBEES_DESIGN_WIDTH * .32));
        carousel.animating = true;
        this.motions = this.motions.filter(motion => motion.node !== carousel.root);
        this.motions.push({ node: carousel.root, time: 0, step: (_node, time) => {
            if (this.carousel !== carousel) return true;
            const t = Math.min(1, time / duration), eased = 1 - Math.pow(1 - t, 3);
            carousel.offset = from + (to - from) * eased;
            if (t >= 1) {
                carousel.offset = 0; carousel.animating = false;
                if (direction !== 0) { this.page += direction; this.refreshPager(); this.queueNeighborPages(); }
            }
            this.placePages();
            return t >= 1;
        } });
    }

    /**
     * 蜂巢区域的横向滑动翻页。监听同时注册在捕获阶段：手指落在格子上时，
     * 格子是事件目标，容器仍能先看到移动；一旦判定为横向滑动就截断事件，
     * 格子收不到后续移动和抬起，配合按钮自身的拖动取消，不会误进关卡。
     * 相邻页已在空闲帧预建，拖动时随手指一起移动，松手只做位移动画。
     */
    private bindPageSwipe(container: Node): void {
        const carousel = this.carousel!;
        const start = new Vec2(), current = new Vec2();
        let pointer: number | undefined, handled: unknown;
        const offsetFor = (dx: number): number => {
            const blocked = dx > 0 ? this.page === 0 : this.page >= carousel.totalPages - 1;
            return blocked ? dx * .3 : dx;
        };
        const onStart = (event: EventTouch): void => {
            if (handled === event) return; handled = event;
            if (pointer !== undefined || this.state !== 'selecting' || carousel.animating) return;
            pointer = event.getID(); carousel.dragging = false; event.getUILocation(start);
        };
        const onMove = (event: EventTouch): void => {
            if (handled === event) return; handled = event;
            if (event.getID() !== pointer) return;
            event.getUILocation(current);
            const dx = current.x - start.x, dy = current.y - start.y;
            if (!carousel.dragging && Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy)) {
                carousel.dragging = true;
                // 预建还没补完时（进入后立刻滑动），先把将要露出的那一页补完整。
                const neighbor = this.page + (dx < 0 ? 1 : -1);
                if (neighbor >= 0 && neighbor < carousel.totalPages) this.buildLevelPage(neighbor, false);
            }
            if (!carousel.dragging) return;
            carousel.offset = offsetFor(dx);
            this.placePages();
            event.propagationStopped = true;
        };
        const onEnd = (event: EventTouch): void => {
            if (handled === event) return; handled = event;
            if (event.getID() !== pointer) return;
            pointer = undefined;
            if (!carousel.dragging) return;
            carousel.dragging = false;
            event.propagationStopped = true;
            const direction: -1 | 1 = carousel.offset < 0 ? 1 : -1;
            const next = this.page + direction;
            this.settlePages(Math.abs(carousel.offset) >= SWIPE_TURN && next >= 0 && next < carousel.totalPages ? direction : 0);
        };
        for (const capture of [true, false]) {
            container.on(Node.EventType.TOUCH_START, onStart, this, capture);
            container.on(Node.EventType.TOUCH_MOVE, onMove, this, capture);
            container.on(Node.EventType.TOUCH_END, onEnd, this, capture);
            container.on(Node.EventType.TOUCH_CANCEL, onEnd, this, capture);
        }
    }

    /** 顶部的「继续」卡片：小狗头像 + 当前关卡 + 蜂蜜色开始按钮。 */
    private buildContinueCard(root: Node, y: number): void {
        const continueIndex = Math.min(this.save.unlocked - 1, CYBLOCKBEES_LEVELS.length - 1);
        const card = this.ui.card(root, 'continue', 0, y, 690, 136, CYBLOCKBEES_STICKERS.cream, 32, 8);
        const face = 4;
        const frame = this.ui.hex(card, 'portrait-frame', -272, face, 54, CYBLOCKBEES_STICKERS.honey, 6);
        this.ui.image(frame, this.save.cleared > 0 ? 'dog-win' : 'dog-idle', 0, 1, 80);
        this.ui.label(card, this.save.cleared > 0 ? '继续守护' : '开始守护', -78, face + 24, 22,
            { color: P.textSoft, width: 240, align: 'left' });
        this.ui.label(card, `第 ${continueIndex + 1} 关`, -78, face - 12, 44,
            { bold: true, width: 240, align: 'left', color: P.text });
        const play = this.ui.card(card, 'play', 226, face, 196, 92, CYBLOCKBEES_STICKERS.honey, 30, 8);
        this.ui.icon(play, 'play', -50, 4, 34, P.text);
        this.ui.label(play, this.save.cleared > 0 ? '继续' : '开始', 18, 4, 34, { bold: true, width: 100, color: P.text });
        this.pulse(play, .035, 1.4);
        this.ui.bindButton(card, () => this.startLevel(continueIndex));
    }

    private addLevelCell(grid: Node, index: number, x: number, y: number, order: number, pop: boolean): void {
        const level = CYBLOCKBEES_LEVELS[index];
        const unlocked = index < this.save.unlocked;
        const cleared = index < this.save.cleared;
        const current = unlocked && !cleared;
        const style: StickerStyle = !unlocked ? CYBLOCKBEES_STICKERS.mint
            : cleared ? CYBLOCKBEES_STICKERS.honey
            : { fill: P.cream, base: P.honeyDeep, outline: P.outline };
        if (current) {
            const glow = this.ui.node(grid, 'glow', x, y, HEX_RADIUS * 2.1, HEX_RADIUS * 2.1).addComponent(Graphics);
            glow.fillColor = P.glow; glow.circle(0, 0, HEX_RADIUS * 1.02); glow.fill();
            this.pulse(glow.node, .07, 1.2);
        }
        const node = this.ui.hex(grid, `level-${level.level}`, x, y, HEX_RADIUS, style, HEX_DEPTH);
        const face = HEX_DEPTH / 2;
        if (!unlocked) {
            this.ui.label(node, String(level.level), 0, face + 12, 34, { color: P.locked, width: 110, bold: true });
            this.ui.icon(node, 'lock', 0, face - 30, 24, P.locked);
        } else {
            this.ui.label(node, String(level.level), 0, face + 12, 40, { color: P.text, width: 110, bold: true });
            const stars = cleared ? cyblockbeesStars((this.save.best[String(level.level)] ?? 0) / 1000) : 0;
            for (let i = 0; i < 3; i++) this.ui.star(node, (i - 1) * 27, face - 30 + (i === 1 ? -3 : 0), 11, i < stars);
        }
        if (current) {
            const bee = this.ui.image(node, 'bee', HEX_RADIUS * .56, face + HEX_RADIUS * .62, 46);
            this.float(bee, 4, 1.2);
        }
        // 翻页动画或拖动进行中不响应格子点击。
        this.ui.bindButton(node, () => { if (!this.carousel?.animating && !this.carousel?.dragging) this.startLevel(index); }, unlocked);
        if (pop) this.popIn(node, .015 * order);
    }

    // ------------------------------------------------------------ 玩法

    private startLevel(index: number): void {
        const level = getCyBlockBeesLevel(index + 1);
        if (!level) return;
        this.levelIndex = index;
        this.preparePage('play');
        this.removeOverlay();
        this.state = 'playing';

        const bounds = this.safeBounds();
        this.buildHud(bounds);

        // HUD 下方到屏幕底部安全边界都是玩法窗口，物理和画线使用同一坐标系。
        const playTop = bounds.topY - HUD_HEIGHT;
        const playHeight = Math.max(280, playTop - bounds.bottomY);
        const playCenterY = (playTop + bounds.bottomY) / 2;
        this.board = new CyBlockBeesBoard(this.requirePageRoot(), CYBLOCKBEES_DESIGN_WIDTH,
            playHeight, {
                onDogStung: (_element, cause) => {
                    this.failureHint = cause === 'water' ? '狗头掉进了水里'
                        : cause === 'bee' ? '狗头被蜜蜂蜇伤了'
                        : cause === 'bomb' ? '爆炸击中了狗头'
                        : cause === 'spike' ? '狗头碰到了尖刺'
                        : cause === 'saw' ? '狗头碰到了锯齿'
                        : cause === 'ciqiu' || cause === 'ciqiuJoint' ? '狗头碰到了刺球'
                        : '狗头受到了伤害';
                    this.dogAlive = false;
                    this.context?.services.feedback.play('danger');
                    this.finish(false);
                },
                // 蜂群连续撞线/落水时音效保持 80 ms 合并，平台振动另行限频，避免高频调用振动接口。
                onBeeHitLine: () => this.context?.services.feedback.play('toggle', { minIntervalMs: 80, minVibrateIntervalMs: BEE_VIBRATE_INTERVAL_MS }),
                onBeeHitObstacle: () => this.context?.services.feedback.play('collision', { minVibrateIntervalMs: BEE_VIBRATE_INTERVAL_MS }),
                onBeeEnterWater: () => this.context?.services.feedback.play('merge', { minIntervalMs: 80, minVibrateIntervalMs: BEE_VIBRATE_INTERVAL_MS }),
                onDogHurt: () => this.context?.services.feedback.play('danger'),
                onExplosion: () => this.context?.services.feedback.play('milestone'),
            });
        this.board.root.setPosition(0, playCenterY, 0);
        this.board.build(level, (slug) => this.frameOf(slug));
        this.hudRoot?.setSiblingIndex(this.requirePageRoot().children.length - 1);

        this.dogAlive = true;
        this.failureHint = '';
        this.roundStarted = false;
        this.drawnLength = 0;
        this.draftPoints = [];
        this.drawing = false;
        this.touchId = undefined;
        this.navigationPending = false;
        this.timeTotal = this.computeLevelTime(level);
        this.timeLeft = this.timeTotal;
        this.buildHiveTimers(level);
        this.registerDrawing();
        this.updateHud();
    }

    /** 原作：有蜂巢 10 秒（cngn 分支前 8 关 8 秒），无蜂巢 6 秒。 */
    private computeLevelTime(level: CyBlockBeesLevel): number {
        const hasHive = level.elements.some((element) => element.kind === 'hive');
        if (!hasHive) return CYBLOCKBEES_RULES.timeWithoutHive;
        return CYBLOCKBEES_RULES.timeWithHive;
    }

    private buildHiveTimers(level: CyBlockBeesLevel): void {
        this.hiveTimers.length = 0;
        for (const element of level.elements) {
            if (element.kind !== 'hive') continue;
            const count = element.params.dtCount ?? 0;
            if (count <= 0) continue;
            const interval = Math.max(.02, element.params.dtInterval ?? .5);
            const initial = element.params.dtInitCount ?? 0;
            this.hiveTimers.push({ element, elapsed: 0, next: interval / 2, interval, count,
                initial, isLeft: (element.params.dtIsLeft ?? 0) > 0, phase: 'warmup' });
        }
    }

    private advanceHives(dt: number): void {
        if (!this.board || !this.roundStarted) return;
        for (const timer of this.hiveTimers) {
            timer.elapsed += dt;
            if (timer.count <= 0 && timer.initial <= 0 || timer.elapsed + 1e-9 < timer.next) continue;
            if (timer.phase === 'warmup' || timer.phase === 'interval') {
                timer.phase = timer.phase === 'warmup' && timer.initial > 0 ? 'initial' : 'regular';
                if (timer.phase === 'regular') timer.next = timer.elapsed + timer.interval / 2;
                // 原协程初始群的第一只也要 yield(0)；两次半间隔分别等待，不能追赶旧截止时间。
                continue;
            }
            const initial = timer.phase === 'initial';
            if (initial) {
                timer.initial--;
                if (timer.initial === 0) { timer.phase = 'regular'; timer.next = timer.elapsed + timer.interval / 2; }
            } else {
                timer.count--; timer.phase = 'interval'; timer.next = timer.elapsed + timer.interval / 2;
            }
            this.board.spawnBee(this.board.hivePosition(timer.element), this.frameOf('bee'), timer.isLeft ? 1 : -1, timer.element, initial);
        }
    }

    private stopLevel(): void {
        this.stopDrawingAudio();
        this.pencilLastPoint = undefined;
        this.flyVoice?.stop();
        this.audioBank?.stopEffects();
        this.roundStarted = false;
        this.board?.destroy();
        this.board = undefined;
        for (const timer of this.hiveTimers) timer.count = 0;
        this.hiveTimers.length = 0;
    }

    private finish(win: boolean): void {
        if (this.state !== 'playing') return;
        this.state = 'finished';
        this.stopDrawingAudio();
        this.pencilLastPoint = undefined;
        enableBoardPhysics(false);
        this.flyVoice?.stop();
        this.audioBank?.stopEffects();
        this.board?.finish(win);
        if (!win && this.dogAlive && !this.board?.bonesCollected)
            this.failureHint = '还有小狗没有吃到骨头';
        const level = getCyBlockBeesLevel(this.levelIndex + 1);
        const score = win ? Math.round(Math.max(0, 1 - this.drawnLength / this.drawBudget()) * 1000) : 0;
        if (win && level) {
            const best = Math.max(this.save.best[String(level.level)] ?? 0, score);
            const cleared = Math.max(this.save.cleared, level.level);
            this.persistSave({ version: CYBLOCKBEES_SAVE_VERSION, cleared,
                unlocked: Math.min(CYBLOCKBEES_LEVELS.length, Math.max(this.save.unlocked, level.level + 1)),
                best: Object.freeze({ ...this.save.best, [String(level.level)]: best }) });
            this.context?.services.feedback.play('record');
            this.reportThreeStarProgress();
        } else this.context?.services.feedback.play('failure');
        this.context?.reportScore(score);
        // completed 表示本局已结算；失败同样进入运行层结果页，不能误当退出大厅。
        this.context?.requestExit({ completed: true, score, duration: this.timeTotal - this.timeLeft,
            extra: { won: win, level: level?.level ?? 1 } });
    }

    // ------------------------------------------------------------ 画线

    private registerDrawing(): void {
        const root = this.pageRoot;
        if (!root) return;
        root.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        root.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        root.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        root.on(Node.EventType.TOUCH_CANCEL, this.cancelDrawing, this);
    }

    private eventToLocal(event: { getLocation(): Vec2 }): Vec2 | undefined {
        const parent = this.board?.root;
        if (!parent) return undefined;
        const transform = parent.getComponent(UITransform), camera = director.root?.batcher2D.getFirstRenderCamera(parent);
        if (!transform || !camera) return undefined;
        // getUILocation 不是相机世界坐标。通过实际 UI 相机投影，长短屏/DPR 下黑线才跟随指尖。
        const point = event.getLocation();
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
        const world = camera.screenToWorld(new Vec3(), new Vec3(point.x, point.y, 0));
        const local = transform.convertToNodeSpaceAR(world);
        return new Vec2(local.x, local.y);
    }

    private onTouchStart(event: { getLocation(): Vec2; getID?(): number }): void {
        if (this.state !== 'playing' || !this.board || this.roundStarted || this.drawing || this.navigationPending) return;
        const point = this.eventToLocal(event);
        if (!point || this.board.isBlocked(point)) return;
        this.board.dismissDrawingGuide();
        this.drawing = true;
        this.touchId = event.getID?.();
        this.draftPoints = [point];
        this.drawnLength = 0;
        this.board.setDraft(this.draftPoints);
        this.stopDrawingAudio();
        this.pencilLastPoint = point;
        this.updateHud();
    }

    private onTouchMove(event: { getLocation(): Vec2; getID?(): number }): void {
        if (!this.drawing || !this.board || this.roundStarted || this.state !== 'playing') return;
        if (this.touchId !== undefined && event.getID?.() !== this.touchId) return;
        let point = this.eventToLocal(event);
        if (!point) return;
        const previousTouch = this.pencilLastPoint;
        this.pencilLastPoint = point;
        const last = this.draftPoints[this.draftPoints.length - 1];
        const distance = Vec2.distance(point, last);
        const available = Math.max(0, this.drawBudget() - this.drawnLength) * this.board.worldScale;
        if (available <= .001) { this.stopDrawingAudio(); return; }
        if (distance > available) point = Vec2.lerp(new Vec2(), last, point, available / distance);
        if (this.board.isBlocked(point, last)) {
            this.stopDrawingAudio();
            this.board.setDraft(this.draftPoints, point);
            return;
        }
        // 慢画时许多触摸移动不足以新增线段，但笔尖仍在移动，持续书写声不能因此断开。
        // 对比原始触摸位置，重复的静止事件不会误续声；极小坐标抖动忽略。
        if (previousTouch && Vec2.distance(this.pencilLastPoint, previousTouch) > .001 * this.board.worldScale)
            this.pulseDrawingAudio();
        if (distance < CYBLOCKBEES_RULES.minSegmentDistance * this.board.worldScale) return;
        this.drawnLength += Vec2.distance(point, last) / this.board.worldScale;
        this.draftPoints.push(point);
        this.board.setDraft(this.draftPoints);
        this.inkDirty = true;
    }

    private onTouchEnd(event?: { getLocation(): Vec2; getID?(): number }): void {
        if (!this.drawing || !this.board) return;
        if (event && this.touchId !== undefined && event.getID?.() !== this.touchId) return;
        if (event) this.onTouchMove(event);
        this.stopDrawingAudio();
        this.pencilLastPoint = undefined;
        this.drawing = false;
        this.touchId = undefined;
        if (this.draftPoints.length < 2) { this.cancelDrawing(); return; }
        if (!this.board.commitLine(this.draftPoints)) return;
        this.draftPoints = [];
        this.roundStarted = true;
        this.board.beginSimulation();
        enableBoardPhysics(true);
        if (this.hiveTimers.length && this.flyClip) this.flyVoice?.play(this.flyClip, .45, true);
        this.updateHud();
    }

    private cancelDrawing(event?: { getID?(): number }): void {
        if (event && this.touchId !== undefined && event.getID?.() !== this.touchId) return;
        this.stopDrawingAudio();
        this.pencilLastPoint = undefined;
        this.drawing = false;
        this.touchId = undefined;
        this.draftPoints = [];
        if (!this.roundStarted) { this.drawnLength = 0; this.board?.setDraft([]); this.updateHud(); }
    }

    private pulseDrawingAudio(): void {
        const voice = this.pencilVoice, clip = this.pencilClip;
        if (!voice || !clip) return;
        if (!voice.playing) {
            if (!voice.play(clip, 0, true)) return;
            this.pencilVolume = 0;
        }
        this.pencilIdleSeconds = 0;
    }

    private updateDrawingAudio(dt: number): void {
        const voice = this.pencilVoice;
        if (!voice?.playing) return;
        if (!this.drawing || this.state !== 'playing') { this.stopDrawingAudio(); return; }
        this.pencilIdleSeconds += dt;
        const target = this.pencilIdleSeconds <= PENCIL_MOVE_HOLD_SECONDS ? 1 : 0;
        // 25 ms 起音、20 ms 收尾，停笔时自然变轻，恢复移动时无需重建播放器。
        this.pencilVolume += (target - this.pencilVolume) * (1 - Math.exp(-dt / (target ? .025 : .02)));
        voice.setVolume(this.pencilVolume);
        if (target === 0 && this.pencilVolume < .01) this.stopDrawingAudio();
    }

    private stopDrawingAudio(): void {
        this.pencilIdleSeconds = Infinity;
        this.pencilVolume = 0;
        this.pencilVoice?.stop();
    }

    private drawBudget(): number {
        return getCyBlockBeesLevel(this.levelIndex + 1)?.drawBudget ?? 40;
    }

    // ------------------------------------------------------------ HUD

    /**
     * 关卡 HUD 直接浮在天空上，不加底板。上行是重画 / 关卡名 / 暂停；下行是铅笔形墨水条
     * （三颗星立在 20%、40%、60% 的位置，笔杆缩过它就熄灭）和圆形秒表。两行之间留出约 20 像素的呼吸空间。
     */
    private buildHud(bounds: ReturnType<typeof calculateVerticalSafeBounds>): void {
        const root = this.requirePageRoot();
        this.hudRoot = this.makeNode('hud');
        this.hudRoot.setParent(root);
        this.hudRoot.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);

        const hud = this.hudRoot, top = bounds.topY;
        let navigationHandled = false;
        const restart = (): void => {
            if (navigationHandled || this.navigationPending) return;
            navigationHandled = true; this.navigationPending = true; this.restartToSelect = false;
            this.context?.requestRestart();
        };
        const rowY = top - 42, meterY = top - 150;
        this.ui.button(hud, '重画', -301, rowY, 80, 76, restart, { icon: 'retry', tone: 'honey' });
        this.levelLabel = this.ui.label(hud, `第 ${this.levelIndex + 1} 关`, 0, rowY + 2, 42,
            { color: P.white, width: 320, bold: true, stroke: P.outline, strokeWidth: 6 });
        this.ui.button(hud, '暂停', 301, rowY, 80, 76, () => this.context?.requestPause(), { icon: 'pause', tone: 'honey' });

        this.inkBar = this.ui.node(hud, 'ink', INK_METER_CENTER, meterY, INK_METER_LENGTH + 8, 36).addComponent(Graphics);
        for (const threshold of CYBLOCKBEES_STAR_THRESHOLDS) {
            const x = INK_METER_CENTER + inkMeterX(threshold);
            const tick = this.ui.node(hud, 'star-tick', x, meterY + 19, 4, 8).addComponent(Graphics);
            tick.fillColor = new Color(96, 58, 32, 110); tick.roundRect(-1.5, -4, 3, 8, 1.5); tick.fill();
            this.inkStars.push(this.ui.star(hud, x, meterY + 36, 13, true));
        }

        const clock = this.ui.node(hud, 'clock', 296, meterY + 6, 76, 84);
        this.clockFace = clock.addComponent(Graphics);
        this.clock = this.ui.node(clock, 'clock-progress', 0, 0, 76, 84).addComponent(Graphics);
        this.timerLabel = this.ui.label(clock, '', 0, 0, 28, { color: P.text, width: 50, bold: true });
    }

    private updateHud(): void {
        const danger = this.roundStarted && this.timeLeft <= 3;
        if (this.timerLabel) {
            this.timerLabel.string = String(Math.ceil(this.timeLeft));
            const color = danger ? P.dangerDeep : P.text;
            if (color !== this.clockLabelColor) { this.timerLabel.color = color; this.clockLabelColor = color; }
        }
        if (this.clock) {
            const g = this.clock, ratio = this.ui.stopwatchProgressRatio(32, this.timeTotal > 0 ? this.timeLeft / this.timeTotal : 1);
            if (this.lastClockDanger !== danger || this.lastClockRatio !== ratio) {
                if (this.clockFace && this.lastClockDanger !== danger) {
                    this.clockFace.clear(); this.ui.paintStopwatchFace(this.clockFace, 32, danger);
                }
                g.clear(); this.ui.paintStopwatchProgress(g, 32, ratio, danger);
                this.lastClockDanger = danger; this.lastClockRatio = ratio;
            }
            // 最后三秒轻微跳动提醒。
            const beat = danger ? 1 + .07 * Math.max(0, Math.sin((this.timeLeft % 1) * Math.PI)) : 1;
            if (this.clockFace && this.clockFace.node.scale.x !== beat) this.clockFace.node.setScale(beat, beat, 1);
        }
        this.updateInk();
    }

    private updateInk(): void {
        this.inkDirty = false;
        const graphics = this.inkBar;
        if (!graphics) return;
        const remaining = Math.max(0, 1 - this.drawnLength / this.drawBudget());
        if (remaining === this.lastInk) return;
        const previous = this.lastInk; this.lastInk = remaining;
        this.inkStars.forEach((g, i) => {
            const threshold = CYBLOCKBEES_STAR_THRESHOLDS[i], active = remaining + 1e-8 >= threshold;
            if (previous < 0 || active !== (previous + 1e-8 >= threshold)) this.ui.paintStar(g, 13, active);
        });
        graphics.clear();
        this.ui.paintPencilMeter(graphics, -INK_METER_LENGTH / 2, INK_METER_LENGTH, 28, remaining, remaining <= .2);
    }

    // ------------------------------------------------------------ 页面工具

    /** 清空当前页面并按页面类型重建背景。 */
    private preparePage(mode: 'select' | 'play'): Node {
        this.clearPage();
        const root = this.requirePageRoot();
        this.buildBackdrop(root, mode);
        return root;
    }

    private requirePageRoot(): Node {
        if (!this.pageRoot?.isValid) {
            const node = this.makeNode('page');
            node.setParent(this.requireRoot());
            node.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);
            this.pageRoot = node;
        }
        return this.pageRoot;
    }

    /**
     * 新建节点一律继承入口节点的 layer。
     *
     * Cocos 只渲染相机 visibility 覆盖到的层，`new Node` 默认落在 DEFAULT 层，
     * 相机看不到就是整屏空白 —— 这是进游戏白屏的原因。
     */
    private makeNode(name: string, parent?: Node): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        if (parent) node.setParent(parent);
        return node;
    }

    private requireRoot(): Node {
        if (!this.root?.isValid) {
            const node = this.makeNode('CyBlockBeesRoot');
            node.setParent(this.node);
            node.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);
            this.root = node;
        }
        return this.root;
    }

    private clearPage(): void {
        this.stopLevel();
        if (this.pageRoot?.isValid) {
            this.pageRoot.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.pageRoot.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this.pageRoot.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.pageRoot.off(Node.EventType.TOUCH_CANCEL, this.cancelDrawing, this);
            for (const child of this.pageRoot.children.slice()) { child.removeFromParent(); child.destroy(); }
        }
        this.motions = this.motions.filter(motion => this.overlayRoot?.isValid && motion.node.isChildOf(this.overlayRoot));
        this.carousel = undefined; this.idleTasks.length = 0;
        this.hudRoot = undefined; this.timerLabel = undefined; this.inkBar = undefined; this.levelLabel = undefined;
        this.clock = undefined; this.clockFace = undefined; this.clockLabelColor = P.text;
        this.lastClockDanger = undefined; this.lastClockRatio = -1;
        this.inkStars.length = 0; this.lastInk = -1; this.inkDirty = false;
    }

    /**
     * 背景按 cover 铺满整块画布：自上而下的天空渐变 + 云层。
     * 选关页另有远山；玩法页保持干净，避免干扰判断黑线与机关。
     */
    private buildBackdrop(parent: Node, mode: 'select' | 'play'): void {
        const node = this.makeNode('backdrop', parent);
        const height = this.canvasHeight, half = CYBLOCKBEES_DESIGN_WIDTH / 2;
        node.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, height);
        const g = node.addComponent(Graphics);
        const bands = Math.ceil(height / 10), step = height / bands;
        for (let i = 0; i < bands; i++) {
            const t = i / (bands - 1);
            g.fillColor = new Color(
                Math.round(P.skyTop.r + (P.skyBottom.r - P.skyTop.r) * t),
                Math.round(P.skyTop.g + (P.skyBottom.g - P.skyTop.g) * t),
                Math.round(P.skyTop.b + (P.skyBottom.b - P.skyTop.b) * t), 255);
            // 每条带向下多覆盖 1px，避免浮点缝隙。
            g.rect(-half, height / 2 - (i + 1) * step - 1, CYBLOCKBEES_DESIGN_WIDTH, step + 2); g.fill();
        }
        g.fillColor = new Color(255, 255, 255, 46);
        g.circle(half - 90, height / 2 - 120, 150); g.fill();
        g.circle(half - 90, height / 2 - 120, 96); g.fill();
        if (mode === 'select') {
            // 远山两层，都在背景层，不参与交互。
            const base = -height / 2;
            g.fillColor = P.hillFar;
            g.moveTo(-half, base + 300);
            g.bezierCurveTo(-200, base + 400, -40, base + 250, 120, base + 300);
            g.bezierCurveTo(260, base + 345, 320, base + 330, half, base + 280);
            g.lineTo(half, base); g.lineTo(-half, base); g.close(); g.fill();
            g.fillColor = P.hillNear;
            g.moveTo(-half, base + 170);
            g.bezierCurveTo(-180, base + 250, 40, base + 140, 220, base + 200);
            g.bezierCurveTo(300, base + 225, 340, base + 210, half, base + 190);
            g.lineTo(half, base); g.lineTo(-half, base); g.close(); g.fill();
        }
        this.ui.image(node, 'cloud-1', -236, height * .24, 220, undefined, 200);
        this.ui.image(node, 'cloud-2', 262, height * .05, 250, undefined, 170);
        this.ui.image(node, 'cloud-3', -120, -height * .2, 236, undefined, 140);
    }

    private showOverlay(spec: OverlaySpec): void {
        this.removeOverlay();
        const root = this.requireRoot();
        const overlay = this.makeNode('overlay');
        overlay.setParent(root);
        overlay.addComponent(UITransform).setContentSize(CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);
        overlay.addComponent(BlockInputEvents);
        const shade = overlay.addComponent(Graphics);
        shade.fillColor = P.shade;
        shade.rect(-CYBLOCKBEES_DESIGN_WIDTH / 2, -this.canvasHeight / 2, CYBLOCKBEES_DESIGN_WIDTH, this.canvasHeight);
        shade.fill();
        this.overlayRoot = overlay;

        // 自上而下排版：头像压在卡片上沿，缎带标题，关卡号，星星，说明，主按钮，次按钮。
        const width = 600, portraitOverflow = 84;
        const starsBlock = spec.stars !== undefined ? 96 : 0, bodyBlock = spec.body ? 92 : 0;
        const height = 104 + 70 + 44 + starsBlock + bodyBlock + 112 + 96 + 36;
        const bounds = this.safeBounds();
        const scale = Math.min(1, (bounds.topY - bounds.bottomY - 24) / (height + portraitOverflow));
        const panel = this.ui.card(overlay, 'panel', 0,
            (bounds.topY + bounds.bottomY) / 2 - portraitOverflow * scale / 2, width, height, CYBLOCKBEES_STICKERS.cream, 40, 12);
        panel.setScale(scale, scale, 1);
        let cursor = height / 2;

        const portrait = this.ui.image(panel, spec.portrait, 0, cursor + 4, 168);
        this.popIn(portrait, 0);
        cursor -= 104;
        const ribbon = this.ui.ribbon(panel, spec.title, 0, cursor - 32, 420, spec.ribbon);
        this.popIn(ribbon, .06);
        cursor -= 70;
        this.ui.label(panel, spec.caption, 0, cursor - 20, 24, { color: P.textSoft, width: 400 });
        cursor -= 44;
        if (spec.stars !== undefined) {
            for (let i = 0; i < 3; i++) {
                const star = this.ui.star(panel, (i - 1) * 96, cursor - 46 + (i === 1 ? 10 : -4), i === 1 ? 36 : 30, i < spec.stars);
                this.popIn(star.node, .18 + i * .12);
            }
            cursor -= starsBlock;
        }
        if (spec.body) {
            const box = this.ui.card(panel, 'body', 0, cursor - 44, 500, 72,
                { fill: new Color(250, 238, 208, 255), base: P.creamDeep }, 24, 0);
            this.ui.label(box, spec.body, 0, 0, 24, { color: P.text, width: 460 });
            cursor -= bodyBlock;
        }

        let handled = false;
        const guard = (action: () => void) => (): void => {
            if (handled) return;
            handled = true;
            action();
        };
        this.ui.button(panel, spec.primary.label, 0, cursor - 52, 500, 96, guard(spec.primary.action),
            { text: spec.primary.label, tone: 'honey', textSize: 34 });
        cursor -= 112;
        const count = spec.secondary.length, gap = 20, buttonWidth = (500 - gap * (count - 1)) / count;
        spec.secondary.forEach((action, index) => {
            this.ui.button(panel, action.label, -250 + buttonWidth / 2 + index * (buttonWidth + gap), cursor - 44,
                buttonWidth, 80, guard(action.action), { text: action.label, tone: 'cream', textSize: 28 });
        });
    }

    private removeOverlay(): void {
        if (this.overlayRoot?.isValid) this.overlayRoot.destroy();
        this.overlayRoot = undefined;
    }

    // ------------------------------------------------------------ 动效

    /**
     * 推进全部动效。单帧时长限制在 1/30 秒，偶发的慢帧不会让翻页、弹出动画直接跳到后段；
     * 动效回调里新加入的动效保留到下一帧。
     */
    private stepMotions(dt: number): void {
        if (!this.motions.length) return;
        const step = Math.min(dt, 1 / 30), running = this.motions;
        this.motions = [];
        const kept = running.filter(motion => {
            if (!motion.node.isValid) return false;
            motion.time += step;
            return !motion.step(motion.node, motion.time);
        });
        this.motions = kept.concat(this.motions);
    }

    /** 上下轻微漂浮。 */
    private float(node: Node, amplitude: number, period: number): void {
        const base = node.position.clone(), phase = Math.random() * period;
        this.motions.push({ node, time: phase, step: (target, time) => {
            target.setPosition(base.x, base.y + Math.sin(time / period * Math.PI * 2) * amplitude, base.z);
            return false;
        } });
    }

    /** 呼吸缩放。 */
    private pulse(node: Node, amount: number, period: number): void {
        this.motions.push({ node, time: 0, step: (target, time) => {
            const scale = 1 + Math.sin(time / period * Math.PI * 2) * amount;
            target.setScale(scale, scale, 1);
            return false;
        } });
    }

    /** 带回弹的弹出；只用于装饰和格子自身，不能用于会改变子按钮位置的容器。 */
    private popIn(node: Node, delay: number, target = 1): void {
        node.setScale(0, 0, 1);
        this.motions.push({ node, time: 0, step: (item, time) => {
            const t = Math.max(0, Math.min(1, (time - delay) / .32));
            const back = 1.7, eased = 1 + (back + 1) * Math.pow(t - 1, 3) + back * Math.pow(t - 1, 2);
            const scale = target * eased;
            item.setScale(scale, scale, 1);
            return t >= 1;
        } });
    }
}
