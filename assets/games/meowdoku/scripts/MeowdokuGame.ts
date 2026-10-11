import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { setLabelBold } from '../../../services/font/FontBinding';
import {
    _decorator,
    BlockInputEvents,
    Camera,
    Canvas,
    Color,
    Component,
    EffectAsset,
    EventTouch,
    Graphics,
    Label,
    Material,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
    view,
    type AssetManager,
} from 'cc';
import type {
    MiniGame,
    MiniGameBackgroundPausePolicy,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { Platform } from '../../../platform/Platform';
import type { AdResult, AdService } from '../../../services/ads/AdService';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    MEOWDOKU_ASSET_PATHS,
    MEOWDOKU_CAT_DISPLAY_SCALE,
    MEOWDOKU_COLORS,
    MEOWDOKU_HARD_MODE_COLORS,
    MEOWDOKU_CONFLICT_LINE,
    MEOWDOKU_BOARD_PLATE,
    MEOWDOKU_BROKEN_HEART,
    MEOWDOKU_COPY,
    MEOWDOKU_ERROR_FLASH,
    MEOWDOKU_ENCOURAGEMENTS,
    MEOWDOKU_FEEDBACK_TEXT,
    MEOWDOKU_LIKE_HAND,
    MEOWDOKU_MARK,
    MEOWDOKU_RESOURCE_BUNDLE,
    MEOWDOKU_RULE_HIGHLIGHT,
    MEOWDOKU_SCORE_FLY,
    MEOWDOKU_SHEETS,
    MEOWDOKU_TILE,
    MEOWDOKU_TIMING,
    MEOWDOKU_TUTORIAL_BOARD,
    MEOWDOKU_PANEL_INSET,
    MEOWDOKU_BUBBLE_GAP,
    MEOWDOKU_BUBBLE_HEIGHT,
    MEOWDOKU_CAT_TOP_UNSCALED,
    MEOWDOKU_CLEAR_TEXT_SIZE,
    MEOWDOKU_FULL_MARK_MIN_SIZE,
    MEOWDOKU_MARK_SQUISH_APPEAR_X,
    MEOWDOKU_MARK_SQUISH_APPEAR_Y,
    MEOWDOKU_PERFECT_TEXT_SIZE,
    MEOWDOKU_RESULT_PAGE,
    MEOWDOKU_HARD_RESULT_STAMP,
    MEOWDOKU_WIN_CAT_KEYS,
    MEOWDOKU_WIN_TOAST_MESSAGES,
    dominantRegionId,
    meowdokuMaxUnmarkedAllowed,
    meowdokuWinToastTier,
    meowdokuRegionPalette,
    type MeowdokuVisuals,
} from './MeowdokuTheme';
import { MEOWDOKU_AUDIO_BANK } from './MeowdokuAudio';
import { MeowdokuTutorial } from './MeowdokuTutorial';
import { applyNineSlice, buildSheetFrames } from './MeowdokuAtlas';
import {
    MEOWDOKU_DEFAULT_LIVES,
    MeowdokuModel,
    decodeMeowdokuLevel,
    findMeowdokuPriorityConflict,
    type MeowdokuCellChange,
    type MeowdokuCellState,
    type MeowdokuChallengeHistory,
    type MeowdokuDraftMark,
    type MeowdokuLevelBoard,
    type MeowdokuMarkOrigin,
} from './MeowdokuModel';
import {
    computeMeowdokuCellRanks,
    solverBoardFromCells,
    solveMeowdokuHint,
    type MeowdokuHint,
} from './MeowdokuSolver';
import { MEOWDOKU_LEVELS, type MeowdokuLevelDefinition } from './MeowdokuLevels';
import { MEOWDOKU_HARD_LEVELS } from './MeowdokuHardLevels';
import {
    MEOWDOKU_CAT_COLOR_RATIO,
    MEOWDOKU_SOURCE_SCALE,
    calculateMeowdokuLayoutFromPlatform,
    type MeowdokuLayoutMetrics,
} from './MeowdokuLayout';

const { ccclass } = _decorator;

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/** 原作 `ComboFeedbackView._cubic_bezier_ease`：牛顿迭代求 x 对应的 y。 */
function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number): number {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    let guess = t;
    for (let i = 0; i < 8; i += 1) {
        const x = ((ax * guess + bx) * guess + cx) * guess;
        const dx = (3 * ax * guess + 2 * bx) * guess + cx;
        if (Math.abs(dx) < 1e-7) break;
        guess -= (x - t) / dx;
    }
    return ((ay * guess + by) * guess + cy) * guess;
}

const CAT_STAR_COUNT = 12;
function clamp(value: number, min: number, max: number): number {
    if (max < min) return min;
    return value < min ? min : value > max ? max : value;
}

/** 今天的 `YYYY-MM-DD`（每日道具的判重键）。 */
function todayStamp(): string {
    const now = new Date();
    const two = (value: number): string => (value < 10 ? `0${value}` : String(value));
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
/** 存档版本；已有题目或存档结构不兼容时加 1；仅追加关卡和兼容字段沿用版本。 */
const MEOWDOKU_DATA_VERSION = 7;
/** 连续失败到几次时，下一局免费送一只猫（原作 `_pre_cat_pending_struggle`）。 */
const PRE_CAT_FAIL_THRESHOLD = 2;

/** 原作 `_resolve_pre_cat()`：`lv <= 20` 不预放猫。 */
const PRE_CAT_MIN_LEVEL = 20;
/** 原作 `PreCatDecider.pick_prefill_cell()` 只挑 rank >= 3 的解格。 */
const PRE_CAT_MIN_RANK = 3;

type MeowdokuState =
    | 'idle'
    | 'ready'
    | 'playing'
    | 'clearing'
    | 'failing'
    | 'paused'
    | 'selecting'
    | 'disposed';

/** 选关页每页 5 列 × 6 行。 */
const LEVEL_SELECT_COLUMNS = 5;
const LEVEL_SELECT_ROWS = 6;
const LEVEL_SELECT_PER_PAGE = LEVEL_SELECT_COLUMNS * LEVEL_SELECT_ROWS;
/** 松手时拖过页宽的这个比例，或者甩动速度超过这个值（px/s），就翻页。 */
const LEVEL_SELECT_FLIP_RATIO = 0.18;
const LEVEL_SELECT_FLIP_SPEED = 600;

interface ModeSwitchView {
    readonly node: Node;
    readonly track: Graphics;
    readonly thumb: Node;
    readonly normalLabel: Label;
    readonly hardLabel: Label;
}

/** 选关页运行时状态：保留三页节点，模式切换与翻页均复用。 */
interface LevelSelectView {
    readonly root: Node;
    readonly modeSwitch: ModeSwitchView;
    readonly title: Label;
    readonly progress: Label;
    readonly backButton: Node;
    readonly jumpCurrent: Node;
    readonly jumpLatest: Node;
    /** 三页并排的滑轨，拖动 / 翻页时整体平移。 */
    readonly track: Node;
    readonly trackOpacity: UIOpacity;
    readonly pageLabel: Label;
    readonly prevButton: Node;
    readonly nextButton: Node;
    readonly pageWidth: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly gapX: number;
    readonly gapY: number;
    /** [上一页, 当前页, 下一页]；越界的一侧为 undefined。 */
    pages: (Node | undefined)[];
    /** 与三个位置对应的可复用页；越界时隐藏，切回有效页时继续使用。 */
    pagePool: (Node | undefined)[];
    page: number;
    drag?: { startX: number; lastX: number; lastAt: number; velocity: number };
    sliding: boolean;
    modeAnimating: boolean;
}

type MeowdokuTool = 'locate' | 'hint';

/** 正在播放的猫帧序列。 */
interface CatFramePlay {
    readonly frames: readonly SpriteFrame[];
    readonly fps: number;
    time: number;
    index: number;
    /** 播完后切到待机、待机循环、循环、或停在最后一帧。 */
    next: 'idle' | 'idleLoop' | 'hold' | 'loop' | 'once';
}

/** 单个格子的视图句柄。 */
interface MeowdokuCellView {
    row: number;
    col: number;
    /** 果冻格子本体（按区域色染色，可变暗）。 */
    readonly face: Sprite;
    /** 果冻格子高光（不染色，随本体一起变暗）。 */
    readonly gloss: Sprite;
    /** 格子容器：尺寸等于格子顶面，承载缩放、入场淡入与错误底色。 */
    readonly faceNode: Node;
    readonly baseColor: Color;
    /** 手画的叉：两根白色笔画拼成 X。 */
    readonly crossRoot: Node;
    /** 叉的入场容器：只承载棋盘入场的逐格弹出，和格子同步；叉自己的动画作用在 `crossRoot` 上。 */
    readonly crossIntro: Node;
    readonly crossOpacity: UIOpacity;
    readonly bars: readonly Node[];
    /** 每根笔画的投影：都排在两根笔画之前绘制，显隐和生长长度始终与对应笔画同步。 */
    readonly barShadows: readonly Node[];
    /** 冲突反应与提示用的格子光圈（原作 `Glows/Glow3`）。 */
    readonly gridGlowRoot: Node;
    readonly gridGlowOpacity: UIOpacity;
    /** 棋子。 */
    readonly catRoot: Node;
    /** 猫的入场容器（在猫层里）：只承载棋盘入场的逐格弹出；冲突时猫会临时抬到特效层，结束后回到这里。 */
    readonly catIntro: Node;
    readonly cat: Sprite;
    readonly catOpacity: UIOpacity;
    /** 落子闪光 / 通关扫光。 */
    readonly glowRoot: Node;
    readonly glowOpacity: UIOpacity;
    catPlay?: CatFramePlay;
    /** 距下一次待机重播的累计时间（原作 5 秒）。 */
    idleTimer: number;
    /**
     * 叉动画的代次：每次开始画叉、播错误叉或隐藏叉时加一。延时激活笔画、笔画长完后
     * 显示投影等回调都要核对代次，过期的回调（例如画叉途中已被取消）直接作废。
     */
    crossToken: number;
    dim: number;
    dimTarget: number;
    /** 格子挤压（原作 `BgPanel:scale` 的 x/y 双轴）共享状态。 */
    readonly squish: { x: number; y: number };
}

type PillButtonStyle = 'primary' | 'secondary' | 'ad';

interface PillButtonPalette {
    readonly face: Color;
    readonly edge: Color;
    readonly stroke?: Color;
    readonly text: Color;
}

/** 胶囊按钮三种样式的配色：按钮面、底部厚边、可选描边与文字色。 */
const PILL_BUTTON_PALETTES: Readonly<Record<PillButtonStyle, PillButtonPalette>> = Object.freeze({
    primary: Object.freeze({
        face: MEOWDOKU_COLORS.winButton,
        edge: MEOWDOKU_COLORS.primaryEdge,
        text: Color.WHITE,
    }),
    secondary: Object.freeze({
        face: MEOWDOKU_COLORS.rulePill,
        edge: MEOWDOKU_COLORS.secondaryEdge,
        stroke: MEOWDOKU_COLORS.secondaryEdge,
        text: MEOWDOKU_COLORS.ruleText,
    }),
    ad: Object.freeze({
        face: MEOWDOKU_COLORS.badgeAd,
        edge: MEOWDOKU_COLORS.adEdge,
        text: Color.WHITE,
    }),
});

interface OverlayEntry {
    readonly label: string;
    readonly action: () => void | Promise<void>;
    /** 主操作用暖橙色实心按钮，其余用浅色描边按钮。 */
    readonly primary?: boolean;
    /** 引导用户发现困难模式的入口，已访问后统一隐藏角标。 */
    readonly hardModeNotice?: boolean;
}

/**
 * 当前关卡存档。`level` 永远是玩家「接下来要玩的关」（通关后即下一关）；
 * 只有这一关正在进行时才带棋盘快照。
 */
interface MeowdokuSavedProgress {
    readonly level: number;
    readonly cells?: readonly MeowdokuCellState[];
    readonly lives?: number;
    /** 原作 endgame snapshot 里同样保存 score / combo，恢复后鼓励语档位接着走。 */
    readonly score?: number;
    readonly combo?: number;
    /** 找猫操作次数（双击或长按）；旧存档缺少时从 0 开始。 */
    readonly stepsUsed?: number;
    /** 当前棋盘的操作记录，用于续玩；每关累计历史独立保存，不随棋盘丢弃。 */
    readonly challenge?: MeowdokuChallengeHistory;
}

interface ToolButtonView {
    readonly node: Node;
    readonly icon: Sprite;
    readonly label: Label;
    readonly badge: Node;
    /** 有道具时的红底数量角标。 */
    readonly countRoot: Node;
    readonly countLabel: Label;
    /** 没道具时的绿底「看广告领一个」角标。 */
    readonly adRoot: Node;
}

/** 状态行右侧草稿开关的视图句柄。 */
interface DraftToggleView {
    readonly node: Node;
    readonly face: Graphics;
    readonly icon: Graphics;
    readonly iconSize: number;
    readonly label: Label;
}

/** 道具库存（本地存档，每天首次进入随机补一个）。 */
interface MeowdokuToolStock {
    locate: number;
    hint: number;
    /** `YYYY-MM-DD`，用来判断今天是否已经发过每日道具。 */
    day: string;
}

export interface MeowdokuServices {
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    /** 激励广告（道具用尽时看广告换一个）；不可用时降级为不发放。 */
    readonly ads?: AdService;
}

/**
 * 猫咪数独玩法页面。
 *
 * 覆盖原作内容页的玩法、动效、音效与道具：
 * 棋盘与逐格呼吸、红心生命值、连击计分与鼓励语、定位 / 提示道具与常驻免费草稿、
 * 自动标记、冲突连线、屏幕震动、通关扫光、失败流程与难度助攻。
 * 道具商店、广告复活、排行榜、每日任务和体力属于页面之外的商业化系统，不在范围内。
 */
@ccclass('MeowdokuGame')
export class MeowdokuGame extends Component implements MiniGame<MeowdokuServices> {
    readonly backgroundPausePolicy: MiniGameBackgroundPausePolicy = 'menu';

    private state: MeowdokuState = 'idle';
    private stateBeforePause: MeowdokuState = 'playing';
    private context?: MiniGameContext<MeowdokuServices>;
    private model?: MeowdokuModel;
    private board?: MeowdokuLevelBoard;
    private draftMode = false;
    private draftLayer?: Node;
    private readonly draftNodes = new Map<number, { node: Node; mark: MeowdokuDraftMark }>();
    private draftControls?: Node;
    private draftToggle?: DraftToggleView;
    private draftTapWasCat = false;
    private levelIndex = 0;
    private mode: 'normal' | 'hard' = 'normal';
    /** 全模式共享的一次性提示；切换到困难或进入困难关卡后永久关闭。 */
    private hardModeDiscovered = false;
    private readonly hardModeNotices = new Set<Node>();
    /** 使上一局尚未完成的动画回调不能写入新局。 */
    private levelRunId = 0;
    /** 已解锁的最高关卡号（从 1 开始）；小于它的关卡都已通关。 */
    private unlockedLevel = 1;
    /** 已通关的最高关卡号；单独记录以保留最后一关和循环重玩后的通关进度。 */
    private clearedLevel = 0;
    private levelSelectView?: LevelSelectView;
    private layout?: MeowdokuLayoutMetrics;
    private visuals?: MeowdokuVisuals;
    private audioBank?: BundleAudioBank;
    private resizeListening = false;
    private inputLocked = false;
    private pendingLevelCells?: readonly MeowdokuCellState[];
    private pendingLives?: number;
    private failCounts: Record<string, number> = {};
    /** 每关累计操作记录，撤销、重开、退出和普通通关都不会清除。 */
    private levelChallengeHistories: Record<string, MeowdokuChallengeHistory> = {};
    /** 引导盘不参与正式关卡的累计记录。 */
    private challengeTrackingActive = false;
    /** 已获得专属荣誉的关卡；之后重玩不会覆盖这份历史。 */
    private geniusClearedLevels: Record<string, true> = {};
    /** 通关前冻结评价，避免更新通关进度、自动补叉后改变奖励资格。 */
    private geniusClear = false;
    private pendingChallenge?: MeowdokuSavedProgress['challenge'];
    /** 道具库存（定位 / 提示），存在游戏存档里。 */
    private toolStock: MeowdokuToolStock = { locate: 0, hint: 0, day: '' };
    /** 本关找猫步数：统计有效的双击或长按，包含放错和草稿中的找猫操作。 */
    private stepsUsed = 0;
    /** 整盘满标补叉阶段：此时不再判定「单元级 Clear」（原作排除 FULL_MARK_AUTO_CROSS）。 */
    private autoCrossPass = false;
    private winToastNode?: Node;
    private failPageNode?: Node;
    private revivePending = false;
    /** 存档里带回来的得分 / 连击（原作 endgame snapshot 也存这两项）。 */
    private pendingScoreValue?: number;
    private pendingCombo?: number;
    private pendingStepsUsed?: number;
    private toolAdPending = false;
    private preCatCell?: readonly [number, number];

    private backgroundNode?: Node;
    private toolsRowNode?: Node;
    private hintBarNode?: Node;
    private boardNode?: Node;
    private boardGlowNode?: Node;
    /** 所有猫都画在全部格子与标记之上，放大动画不受格子创建顺序影响。 */
    private catLayerNode?: Node;
    private fxNode?: Node;
    private levelValueLabel?: Label;
    private scoreLabel?: Label;
    private scoreLayer?: Node;
    /** 得分面板上当前显示的分数（金光到达才更新，和原作 `_displayed_score` 一致）。 */
    private displayedScore = 0;
    private pendingScore = 0;
    /** 最近一次计分气泡钳位后的中心 x（原作 `_last_clamped_center_x`），手势跟着它走。 */
    private lastBubbleCenterX?: number;
    private catSlotNodes: Node[] = [];
    private catSlotBases: Sprite[] = [];
    private catSlotFaces: Sprite[] = [];
    private catSlotFound: boolean[] = [];
    private catSlotPalette: number[] = [];
    private lifeSlotNodes: Node[] = [];
    private renderedLives = -1;
    private toolButtons = new Map<MeowdokuTool, ToolButtonView>();
    private toastNode?: Node;
    private toastLabel?: Label;
    private toastOpacity?: UIOpacity;
    private overlayNode?: Node;
    /** 关闭通用弹窗时的回调（暂停弹窗用它恢复输入锁）。 */
    private overlayOnClose?: () => void;
    private cellViews: MeowdokuCellView[] = [];
    /** 只保留一副最大棋盘的格子；换尺寸时重新绑定几何，不缓存整页或关卡状态。 */
    private readonly cellPool: MeowdokuCellView[] = [];
    private cellPoolRoot?: Node;
    private warmCellCount = 0;
    /** 已隐藏并停止补间的旧页面，按子节点先于父节点的顺序分帧释放。 */
    private readonly retiredPageNodes: Node[] = [];
    private readonly retiredPageRoots = new Set<Node>();
    private hintPreviewNodes: Node[] = [];
    /** 正在显示的连击鼓励文字。 */
    private encourageNode?: Node;
    /** 代码反馈的动画所有者；暂停与销毁都显式处理 Node / UIOpacity 补间。 */
    private readonly feedbackNodes = new Set<Node>();
    private winOverlayNode?: Node;
    /** 上一次用过的通关标题（原作 `_last_win_title`）。 */
    private lastWinTitle = '';
    /** 只保存资源键，避免随机历史额外持有 SpriteFrame。 */
    private lastWinCatKey?: (typeof MEOWDOKU_WIN_CAT_KEYS)[number];
    private hintMaskNode?: Node;
    private hintLayerNode?: Node;
    private tutorialNode?: Node;
    private tutorialRingNode?: Node;
    /** 新手引导页（原作 `tutorial_page` 的七步流程）。 */
    private tutorial?: MeowdokuTutorial;
    /** 引导前所在的关卡序号，引导结束/跳过后回到它。 */
    private tutorialLevelBackup?: number;
    /**
     * 只压制「下一次」进第一关的引导。
     *
     * 规则：**不管从哪里进第一关**（大厅进、重开第一关、从选关页选第 1 关…），
     * 只要是新进入第一关就播引导。唯一例外是引导自己结束时会把第一关重新开一次，
     * 用这个标记压制那一次，避免引导无限循环。
     */
    private tutorialSuppressNext = false;
    /** 冲突反应期间被临时抬到特效层的猫（结束后放回格子）。 */
    private liftedCats: MeowdokuCellView[] = [];
    /** 当前冲突连线（反应结束前要一起清掉）。 */
    private conflictLineNode?: Node;
    /** 引导页不播棋盘入场动画。 */
    private suppressBoardIntro = false;
    /** 引导收尾的一次性闸门（跳过按钮的触摸 + 合成鼠标事件会触发两次）。 */
    private tutorialFinishing = false;
    /** 规则栏三条规则的高亮层（原作 `RuleHighlight1..3`）。 */
    private ruleHighlightNodes: { node: Node; opacity: UIOpacity }[] = [];
    /** 规则底板（高亮时连底板一起变亮，否则光被不透明底板挡住看不见）。 */
    private rulePillGraphics: {
        graphics: Graphics;
        width: number;
        height: number;
        corner: number;
    }[] = [];
    /** 已经弹过 Clear 的单元（行 / 列 / 颜色），避免反复触发。 */
    private fullMarkFired = new Set<string>();
    private fullMarkUnitCache: readonly { key: string; cells: readonly (readonly [number, number])[] }[] = [];
    /** 整盘满标只弹一次。 */
    private perfectMarkFired = false;
    /** 「点赞手势」的本局节奏（原作 `_like_hand_state`）。 */
    private likeHandState = { hasSeenFirstCat: false, triggered: 0, lastCatAt: 0 };

    private lastTapRow = -1;
    private lastTapCol = -1;
    private lastTapAt = 0;
    private doubleTapToken = 0;
    /** 第一按先显示叉；识别为双击就消费预览，识别为单击才计入画叉历史。 */
    private pendingSingleTap?: { readonly model: MeowdokuModel; readonly row: number; readonly col: number };
    private boardPress?: {
        readonly id: number | null;
        readonly row: number;
        readonly col: number;
        readonly start: Vec2;
        catAction: boolean;
        dragging: boolean;
    };
    private longPressCallback?: () => void;
    private dragMode: 'none' | 'mark' | 'unmark' = 'none';
    private dragRow = -1;
    private dragCol = -1;
    private dragSaveDirty = false;
    private activeHint?: MeowdokuHint;
    private pendingToolReward?: { model: MeowdokuModel; tool: MeowdokuTool };

    // ---------------------------------------------------------------- 生命周期

    async initialize(context: MiniGameContext<MeowdokuServices>): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`Cannot initialize MeowdokuGame from ${this.state}.`);
        }
        this.context = context;
        this.readSave();
        this.visuals = await this.loadVisuals();
        this.layout = this.computeLayout();
        this.buildBackground();
        this.rebuildPage();
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = true;
        }
        this.audioBank = new BundleAudioBank(
            MEOWDOKU_AUDIO_BANK,
            context.services.audio,
            context.services.feedback,
            context.services.assets,
        );
        await this.audioBank.initialize();
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') {
            throw new Error(`Cannot begin MeowdokuGame from ${this.state}.`);
        }
        // 每日赠礼照发，但不再弹「获得 1 个道具」的提示（道具按钮上的角标本身就够了）。
        this.grantDailyTool();
        // 进游戏总是直接进当前关卡（选关页不记存档）。
        const restored = this.pendingLevelCells;
        const lives = this.pendingLives;
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.startLevel(this.levelIndex, restored, lives, true);
        // 成就条件调整后，以已有通关进度恢复新条件下的成就，不要求重过旧关。
        if (this.mode !== 'hard') {
            this.context?.reportAchievementProgress('cleared-level', this.clearedLevel);
        }
    }

    pause(): boolean {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready') {
            return false;
        }
        // 选关页和已通关流程都不再是进行中的对局，退出/切后台前仍要落盘。
        // 通关回调依赖 clearing 状态；切成 paused 会消费回调而丢失后续结算。
        if (this.state === 'selecting' || this.state === 'clearing') {
            this.persistProgress();
            return false;
        }
        this.resetBoardGesture();
        if (this.state !== 'paused') this.stateBeforePause = this.state;
        this.state = 'paused';
        this.inputLocked = true;
        this.tutorial?.pause();
        this.setFeedbackPaused(true);
        this.persistProgress();
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.stateBeforePause === 'paused' ? 'playing' : this.stateBeforePause;
        this.inputLocked = this.state !== 'playing' || !!this.tutorial;
        this.tutorial?.resume();
        this.setFeedbackPaused(false);
        const reward = this.pendingToolReward;
        this.pendingToolReward = undefined;
        if (reward && reward.model === this.model && this.state === 'playing') this.applyTool(reward.tool);
    }

    async restart(context?: MiniGameContext<MeowdokuServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') {
            throw new Error(`Cannot restart MeowdokuGame from ${this.state}.`);
        }
        if (context) this.context = context;
        this.destroyOverlay();
        this.resetBoardGesture();
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.startLevel(this.levelIndex, undefined, undefined, false);
    }

    discardSavedProgress(): void {
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.clearProgress();
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        if (this.node?.isValid) this.node.active = false;
        this.state = 'disposed';
        this.pendingToolReward = undefined;
        this.model?.clearDraft();
        this.draftMode = false;
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
        this.resetBoardGesture();
        this.unscheduleAllCallbacks();
        this.releaseRetiredPageNodes(this.retiredPageNodes.length);
        this.destroyOverlay();
        // 引导拥有自己的补间、回调和节点引用，必须先经过其 dispose，再清理页面子树。
        this.destroyTutorial();
        this.tutorialLevelBackup = undefined;
        this.tutorialFinishing = false;
        this.levelSelectView = undefined;
        this.clearHintPreview();
        this.detachBoardInput();
        this.draftLayer = undefined;
        this.draftNodes.clear();
        this.draftControls = undefined;
        this.draftToggle = undefined;
        this.cellViews = [];
        this.cellPool.length = 0;
        this.cellPoolRoot = undefined;
        this.warmCellCount = 0;
        this.catSlotNodes = [];
        this.catSlotBases = [];
        this.catSlotFaces = [];
        this.catSlotFound = [];
        this.catSlotPalette = [];
        this.lifeSlotNodes = [];
        this.renderedLives = -1;
        this.toolButtons.clear();
        this.boardGlowNode = undefined;
        this.catLayerNode = undefined;
        this.fxNode = undefined;
        this.levelValueLabel = undefined;
        this.scoreLabel = undefined;
        this.scoreLayer = undefined;
        this.hintLayerNode = undefined;
        this.encourageNode = undefined;
        this.winOverlayNode = undefined;
        this.winToastNode = undefined;
        this.failPageNode = undefined;
        this.hintMaskNode = undefined;
        this.hintBarNode = undefined;
        this.toastLabel = undefined;
        this.toastOpacity = undefined;
        this.toastNode = undefined;
        this.toolsRowNode = undefined;
        if (this.node?.isValid) {
            this.node.children.slice().forEach((child) => this.destroyNode(child));
        }
        this.feedbackNodes.clear();
        this.hardModeNotices.clear();
        this.backgroundNode = undefined;
        this.boardNode = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.releaseVisuals();
        this.model = undefined;
        this.board = undefined;
        this.context = undefined;
    }

    /**
     * 暂停弹窗由页面自己弹（运行层的 `PauseLayer` 在本项目里不显示），按钮动作走运行层给的
     * model，行为不重复实现。这里**不播任何音乐**。
     */
    showPauseMenu(model: MiniGamePauseModel): void {
        this.inputLocked = true;
        this.destroyOverlay();
        const level = this.model?.level ?? this.currentLevelNumber();
        this.showOverlay(MEOWDOKU_COPY.pauseTitle, MEOWDOKU_COPY.levelTitle(level), [
            { label: MEOWDOKU_COPY.pauseResume, action: () => model.resume(), primary: true },
            { label: MEOWDOKU_COPY.pauseRestart, action: () => model.restart() },
            // 先让运行层恢复对局状态，再切到选关页（选关页本身不是暂停态）。
            {
                label: MEOWDOKU_COPY.pauseSelectLevel,
                hardModeNotice: true,
                action: async () => {
                    await model.resume();
                    this.openLevelSelect();
                },
            },
            { label: MEOWDOKU_COPY.failLobby, action: () => model.exit() },
        ], () => {
            // 从暂停弹窗返回：把输入锁解除。
            this.inputLocked = this.state !== 'playing';
        });
    }

    hidePauseMenu(): void {
        this.destroyOverlay();
        this.inputLocked = this.state !== 'playing' && this.state !== 'clearing';
    }

    showResultView(model: MiniGameResultModel): void {
        this.inputLocked = true;
        this.showOverlay(model.result.completed ? MEOWDOKU_COPY.clearTitle : '本局结束', undefined, [
            { label: '再来一局', action: () => model.restart(), primary: true },
            { label: '返回大厅', action: () => model.returnToLobby() },
        ]);
    }

    hideResultView(): void {
        this.destroyOverlay();
        this.inputLocked = this.state !== 'playing' && this.state !== 'clearing';
    }

    /** 驱动逐帧动画、区域变暗插值与计时。 */
    protected update(deltaTime: number): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'paused') return;
        const dt = Math.max(0, Math.min(0.1, deltaTime));
        if (dt <= 0) return;
        this.releaseRetiredPageNodes(24);
        if (this.state === 'selecting' && !this.levelSelectView?.modeAnimating) this.warmBoardCells();
        if (this.state === 'playing' || this.state === 'failing' || this.state === 'clearing') {
            this.model?.tick(dt * 1000);
        }
        this.advanceCatAnimations(dt);
        this.advanceIdleLoop(dt);
        this.advanceDim(dt);
    }

    // ---------------------------------------------------------------- 资源

    private async loadVisuals(): Promise<MeowdokuVisuals> {
        const assets = this.context?.services.assets;
        if (!assets) throw new Error('MeowdokuGame requires the asset service.');
        await assets.loadBundle(MEOWDOKU_RESOURCE_BUNDLE);
        const textures = {} as Record<keyof typeof MEOWDOKU_ASSET_PATHS, Texture2D>;
        const keys = Object.keys(MEOWDOKU_ASSET_PATHS) as (keyof typeof MEOWDOKU_ASSET_PATHS)[];
        const loaded = await assets.loadSpriteFrames(MEOWDOKU_RESOURCE_BUNDLE, keys.map(key => {
            const source = MEOWDOKU_ASSET_PATHS[key];
            const packed = PACKED_SPRITE_PATHS[source];
            return { key, path: packed ?? source, type: packed ? 'frame' as const : 'texture' as const };
        }));
        const frames = loaded as Record<keyof typeof MEOWDOKU_ASSET_PATHS, SpriteFrame>;
        const owned = keys.map(key => frames[key]);
        // Only the unchanged grid sheets are sliced as Texture2D; other art uses SpriteFrames.
        keys.forEach(key => {
            if (!PACKED_SPRITE_PATHS[MEOWDOKU_ASSET_PATHS[key]]) textures[key] = frames[key].texture as Texture2D;
        });
        // 引导页/弹窗的圆角面板底必须也设 9-slice 内缩，否则圆角会被整体拉伸（模糊 + 锯齿）。
        applyNineSlice(frames.panelBg, MEOWDOKU_PANEL_INSET);

        const silhouetteEffect = await assets.loadAsset(
            MEOWDOKU_RESOURCE_BUNDLE,
            'visual/ui/meowdoku-cat-slot-silhouette',
            EffectAsset,
        );
        const catSlotSilhouette = assets.trackRuntimeAsset(MEOWDOKU_RESOURCE_BUNDLE, new Material());
        catSlotSilhouette.initialize({ effectAsset: silhouetteEffect, defines: { USE_TEXTURE: true } });

        const catAppear = buildSheetFrames(textures.catAppear, MEOWDOKU_SHEETS.catAppear);
        const catIdle = buildSheetFrames(textures.catIdle, MEOWDOKU_SHEETS.catIdle);
        const catFrustrated = buildSheetFrames(textures.catFrustrated, MEOWDOKU_SHEETS.catFrustrated);
        const catCry = buildSheetFrames(textures.catCry, MEOWDOKU_SHEETS.catCry);
        const catAngry2 = buildSheetFrames(textures.catAngry2, MEOWDOKU_SHEETS.catAngry2);
        const [tileBody, tileGloss] = buildSheetFrames(textures.tile, MEOWDOKU_TILE.sheet);
        owned.push(...catAppear, ...catIdle, ...catFrustrated, ...catCry, ...catAngry2, tileBody!, tileGloss!);

        owned.forEach(frame => assets.trackRuntimeAsset(MEOWDOKU_RESOURCE_BUNDLE, frame));
        return Object.freeze({
            frames: Object.freeze(frames),
            catSlotSilhouette,
            catAppear,
            catIdle,
            catFrustrated,
            catCry,
            catAngry2,
            tileBody: tileBody!,
            tileGloss: tileGloss!,
            owned: Object.freeze(owned),
        });
    }



    private releaseVisuals(): void {
        const visuals = this.visuals;
        this.visuals = undefined;
        if (!visuals) return;
        this.context?.services.assets.releaseRuntimeAsset(visuals.catSlotSilhouette);
        visuals.owned.forEach((frame) => {
            this.context?.services.assets.releaseRuntimeAsset(frame);
        });
    }

    // ---------------------------------------------------------------- 存档

    private levelDefinitions(): readonly MeowdokuLevelDefinition[] {
        return this.mode === 'hard' ? MEOWDOKU_HARD_LEVELS : MEOWDOKU_LEVELS;
    }

    private lifeLimit(): number {
        return this.mode === 'hard' ? 1 : MEOWDOKU_DEFAULT_LIVES;
    }

    private clearPendingProgress(): void {
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.pendingScoreValue = undefined;
        this.pendingCombo = undefined;
        this.pendingStepsUsed = undefined;
        this.pendingChallenge = undefined;
    }

    private readSave(requestedMode?: 'normal' | 'hard'): void {
        const context = this.context;
        if (!context) return;
        // 只读取当前版本的存档。
        const data = context.services.storage.getGameData(context.gameId);
        // 提示历史独立于关卡版本；旧存档已选过困难或留下困难进度，也视为已发现。
        const savedHard = data?.custom?.meowdokuHard;
        this.hardModeDiscovered = this.hardModeDiscovered
            || data?.custom?.meowdokuHardModeDiscovered === true
            || data?.custom?.meowdokuMode === 'hard'
            || (typeof savedHard === 'object' && savedHard !== null && !Array.isArray(savedHard)
                && Object.keys(savedHard).length > 0);
        const custom = data?.dataVersion === MEOWDOKU_DATA_VERSION ? data.custom : undefined;
        this.mode = requestedMode ?? (custom?.meowdokuMode === 'hard' ? 'hard' : 'normal');
        const hard = custom?.meowdokuHard;
        const scoped: Record<string, unknown> = this.mode === 'hard'
            ? (typeof hard === 'object' && hard !== null && !Array.isArray(hard) ? hard as Record<string, unknown> : {})
            : {
                unlocked: custom?.meowdokuUnlocked, cleared: custom?.meowdokuCleared,
                progress: custom?.meowdokuProgress, fails: custom?.meowdokuFails,
                challengeHistory: custom?.meowdokuChallengeHistory, geniusClears: custom?.meowdokuGeniusClears,
            };
        this.clearPendingProgress();
        this.failCounts = {};
        // 版本 7 的旧存档只有解锁关卡，可据此恢复已通关关数；新增字段无需重置存档。
        this.clearedLevel = this.readClearedLevel(scoped.unlocked, scoped.cleared, this.levelDefinitions().length);
        this.unlockedLevel = this.clampLevel(this.clearedLevel + 1);
        this.levelChallengeHistories = {};
        const histories = scoped.challengeHistory;
        const hasChallengeHistory = typeof histories === 'object' && histories !== null && !Array.isArray(histories);
        if (hasChallengeHistory) {
            const record = histories as Record<string, unknown>;
            Object.keys(record).forEach((key) => {
                const value = record[key];
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const usage = value as Record<string, unknown>;
                    this.mergeLevelChallengeHistory(Number(key), {
                        manualMarksUsed: usage.manualMarksUsed === true,
                        draftUsed: usage.draftUsed === true,
                        wrongGuessMade: usage.wrongGuessMade === true,
                    });
                }
            });
        }
        const fails = scoped.fails;
        if (typeof fails === 'object' && fails !== null) {
            const counts: Record<string, number> = {};
            const record = fails as Record<string, unknown>;
            Object.keys(record).forEach((key) => {
                const value = record[key];
                if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                    counts[key] = Math.floor(value);
                    // 首次迁移只追溯尚未通关的关卡；上线前已通关关卡可重新挑战荣誉。
                    // 启用独立历史后，失败次数不再用作历史来源，避免重复导入上线前记录。
                    if (!hasChallengeHistory && Number(key) > this.clearedLevel) {
                        this.mergeLevelChallengeHistory(Number(key), {
                            manualMarksUsed: false, draftUsed: false, wrongGuessMade: true,
                        });
                    }
                }
            });
            this.failCounts = counts;
        }
        const tools = custom?.meowdokuTools;
        if (typeof tools === 'object' && tools !== null) {
            const record = tools as Record<string, unknown>;
            const num = (key: string): number => {
                const value = record[key];
                return typeof value === 'number' && Number.isFinite(value) && value > 0
                    ? Math.floor(value)
                    : 0;
            };
            this.toolStock = {
                locate: num('locate'),
                hint: num('hint'),
                day: typeof record.day === 'string' ? record.day : '',
            };
        }

        // 当前关卡（没有存档 = 第一次进游戏，直接进第 1 关）。
        this.levelIndex = 0;
        const raw = scoped.progress;
        if (typeof raw === 'object' && raw !== null) {
            const record = raw as Record<string, unknown>;
            const level = typeof record.level === 'number' && Number.isFinite(record.level)
                ? Math.floor(record.level)
                : 1;
            this.levelIndex = this.levelIndexOf(level);
            const legacyClearedReplay = !hasChallengeHistory && level >= 1 && level <= this.clearedLevel;
            const cells = record.cells;
            const challenge = record.challenge;
            let hasWrongGuessRecord = false;
            if (!legacyClearedReplay && typeof challenge === 'object' && challenge !== null && !Array.isArray(challenge)) {
                const usage = challenge as Record<string, unknown>;
                // 兼容旧版含 firstAttempt 的记录；进入次数已不参与资格判定。
                if (typeof usage.manualMarksUsed === 'boolean' && typeof usage.draftUsed === 'boolean') {
                    hasWrongGuessRecord = typeof usage.wrongGuessMade === 'boolean';
                    this.pendingChallenge = Object.freeze({ manualMarksUsed: usage.manualMarksUsed,
                        draftUsed: usage.draftUsed, wrongGuessMade: usage.wrongGuessMade === true });
                    this.mergeLevelChallengeHistory(level, this.pendingChallenge);
                }
            }
            if (Array.isArray(cells) && this.isValidCellSnapshot(cells)) {
                this.pendingLevelCells = Object.freeze(cells.slice() as MeowdokuCellState[]);
                const lives = record.lives;
                if (typeof lives === 'number' && Number.isFinite(lives)) {
                    this.pendingLives = Math.max(0, Math.min(this.lifeLimit(), Math.floor(lives)));
                }
                const score = record.score;
                if (typeof score === 'number' && Number.isFinite(score) && score >= 0) {
                    this.pendingScoreValue = Math.floor(score);
                }
                const combo = record.combo;
                if (typeof combo === 'number' && Number.isFinite(combo) && combo >= 0) {
                    this.pendingCombo = Math.floor(combo);
                }
                const steps = record.stepsUsed;
                if (typeof steps === 'number' && Number.isFinite(steps) && steps >= 0) {
                    this.pendingStepsUsed = Math.floor(steps);
                }
                if (legacyClearedReplay) {
                    // 保留旧棋盘的续玩状态，但上线前已通关关卡的旧操作不计入新荣誉历史。
                    this.pendingChallenge = Object.freeze({ manualMarksUsed: false, draftUsed: false, wrongGuessMade: false });
                } else {
                    // 没有独立记录的旧快照，保留可观察到的叉、红叉与已扣生命信息。
                    const wrongGuessMade = !hasWrongGuessRecord && (cells.some(cell => cell === 'error')
                        || (this.pendingLives !== undefined && this.pendingLives < this.lifeLimit()));
                    const usage = this.pendingChallenge;
                    this.mergeLevelChallengeHistory(level, {
                        manualMarksUsed: usage?.manualMarksUsed ?? cells.some(cell => cell === 'mark'),
                        draftUsed: usage?.draftUsed ?? false,
                        wrongGuessMade: usage?.wrongGuessMade === true || wrongGuessMade,
                    });
                    if (usage && wrongGuessMade) this.pendingChallenge = Object.freeze({ ...usage, wrongGuessMade: true });
                }
            }
        }

        // 困难模式的失误盘不能靠退出/切模式继续；错误动画尚未扣命时也视为失败盘。
        if (this.mode === 'hard' && (this.pendingLives === 0 || this.pendingChallenge?.wrongGuessMade
            || this.pendingLevelCells?.some(cell => cell === 'error'))) {
            this.clearPendingProgress();
        }
        this.geniusClearedLevels = this.readGeniusClears(scoped.geniusClears, this.clearedLevel);
    }

    /** 普通与困难存档沿用同一通关进度校验，兼容只有解锁关卡号的旧记录。 */
    private readClearedLevel(unlocked: unknown, cleared: unknown, totalLevels: number): number {
        const unlockedLevel = Math.max(1, Math.min(totalLevels,
            typeof unlocked === 'number' && Number.isFinite(unlocked) ? Math.floor(unlocked) : 1));
        return Math.max(unlockedLevel - 1,
            typeof cleared === 'number' && Number.isFinite(cleared)
                ? Math.max(0, Math.min(totalLevels, Math.floor(cleared))) : 0);
    }

    /** 荣誉按模式内的有效关卡去重，未通关、越界与非 true 的记录不计入。 */
    private readGeniusClears(value: unknown, clearedLevel: number): Record<string, true> {
        const clears: Record<string, true> = {};
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return clears;
        const record = value as Record<string, unknown>;
        Object.keys(record).forEach((key) => {
            const level = Number(key);
            if (record[key] === true && Number.isInteger(level) && level >= 1 && level <= clearedLevel) {
                clears[String(level)] = true;
            }
        });
        return clears;
    }

    private isValidCellSnapshot(value: readonly unknown[]): boolean {
        if (value.length === 0) return false;
        return value.every((cell) => cell === 'empty' || cell === 'mark' || cell === 'error' || cell === 'cat');
    }

    private levelIndexOf(level: number): number {
        const index = this.levelDefinitions().findIndex((definition) => definition.level === level);
        return index < 0 ? 0 : index;
    }

    private clampLevel(level: number): number {
        return Math.max(1, Math.min(this.levelDefinitions().length, level));
    }

    private failCountFor(level: number): number {
        return this.failCounts[String(level)] ?? 0;
    }

    private recordFail(level: number): void {
        this.failCounts[String(level)] = this.failCountFor(level) + 1;
    }

    private clearFailCount(level: number): void {
        delete this.failCounts[String(level)];
    }

    /** 本关是否是一盘还能继续下的正式棋盘（不是引导盘、没通关、没失败）。 */
    private isLevelLive(): boolean {
        const model = this.model;
        return !!model && this.challengeTrackingActive && !this.tutorial && !model.isComplete && model.lives > 0
            && !(this.mode === 'hard' && model.hasWrongGuess);
    }

    private continuationLevelIndex(): number {
        return (this.levelIndex + 1) % this.levelDefinitions().length;
    }

    /** 玩家接下来要玩的关：通关后按顺序进入下一关。 */
    private currentLevelNumber(): number {
        const index = this.challengeTrackingActive && this.model?.isComplete && !this.tutorial
            ? this.continuationLevelIndex()
            : this.levelIndex;
        return this.levelDefinitions()[index]?.level ?? 1;
    }

    private currentProgress(): MeowdokuSavedProgress {
        const level = this.currentLevelNumber();
        const model = this.model;
        if (model && this.isLevelLive()) {
            return Object.freeze({
                level,
                cells: model.snapshot(),
                lives: model.lives,
                score: model.score,
                combo: model.combo,
                stepsUsed: this.stepsUsed,
                challenge: Object.freeze({ manualMarksUsed: model.usedManualMarks, draftUsed: model.usedDraft,
                    wrongGuessMade: model.hasWrongGuess }),
            });
        }
        if (!model && this.pendingLevelCells) {
            // 切模式后尚在选关页，保存读入的未完成棋盘，不能用空盘覆盖另一个模式的续玩。
            return Object.freeze({ level, cells: this.pendingLevelCells, lives: this.pendingLives,
                score: this.pendingScoreValue, combo: this.pendingCombo, stepsUsed: this.pendingStepsUsed,
                challenge: this.pendingChallenge });
        }
        return Object.freeze({ level });
    }

    /** 保存当前关卡、解锁进度和失败次数。 */
    private persistProgress(): void {
        this.recordLevelChallengeHistory();
        this.dragSaveDirty = false;
        this.writeProgress(this.currentProgress());
    }

    /** 丢掉本关的棋盘快照（重开本关），关卡和解锁进度保留。 */
    private clearProgress(): void {
        this.recordLevelChallengeHistory();
        this.clearPendingProgress();
        this.writeProgress(Object.freeze({ level: this.currentLevelNumber() }));
    }

    private writeProgress(progress: MeowdokuSavedProgress): void {
        this.writeSave((custom) => {
            if (this.mode === 'hard') {
                custom.meowdokuHard = Object.freeze({
                    fails: Object.freeze({ ...this.failCounts }),
                    challengeHistory: Object.freeze({ ...this.levelChallengeHistories }),
                    geniusClears: Object.freeze({ ...this.geniusClearedLevels }),
                    progress, unlocked: this.unlockedLevel, cleared: this.clearedLevel,
                });
                return;
            }
            custom.meowdokuFails = Object.freeze({ ...this.failCounts });
            custom.meowdokuChallengeHistory = Object.freeze({ ...this.levelChallengeHistories });
            custom.meowdokuGeniusClears = Object.freeze({ ...this.geniusClearedLevels });
            custom.meowdokuProgress = progress;
            custom.meowdokuUnlocked = this.unlockedLevel;
            custom.meowdokuCleared = this.clearedLevel;
        });
    }

    private persistToolStock(): void {
        this.writeSave((custom) => {
            custom.meowdokuTools = Object.freeze({ ...this.toolStock });
        });
    }

    private writeSave(update: (custom: Record<string, unknown>) => void): void {
        const context = this.context;
        if (!context) return;
        const storage = context.services.storage;
        const stored = storage.getGameData(context.gameId);
        const previous = stored?.dataVersion === MEOWDOKU_DATA_VERSION ? stored : undefined;
        // 写入时不带入其他版本的数据。
        const custom: Record<string, unknown> = { ...(previous?.custom ?? {}) };
        custom.meowdokuMode = this.mode;
        custom.meowdokuHardModeDiscovered = this.hardModeDiscovered;
        update(custom);
        try {
            storage.writeGameData(context.gameId, Object.freeze({
                dataVersion: MEOWDOKU_DATA_VERSION,
                playCount: previous?.playCount ?? 0,
                ...(previous?.highScore === undefined ? {} : { highScore: previous.highScore }),
                lastPlayedAt: Date.now(),
                custom: Object.freeze(custom),
            }));
        } catch (error: unknown) {
            // TODO: console.warn('[MeowdokuGame] Failed to persist save.', error);
        }
    }

    // ---------------------------------------------------------------- 关卡

    /** 累计记录只增不减；仅保存发生过的操作，干净关卡不占存档条目。 */
    private mergeLevelChallengeHistory(level: number, usage: MeowdokuChallengeHistory): void {
        if (!Number.isInteger(level) || level < 1 || level > this.levelDefinitions().length) return;
        const key = String(level);
        const previous = this.levelChallengeHistories[key];
        const manualMarksUsed = previous?.manualMarksUsed === true || usage.manualMarksUsed === true;
        const draftUsed = previous?.draftUsed === true || usage.draftUsed === true;
        const wrongGuessMade = previous?.wrongGuessMade === true || usage.wrongGuessMade === true;
        if (!manualMarksUsed && !draftUsed && !wrongGuessMade) return;
        this.levelChallengeHistories[key] = Object.freeze({ manualMarksUsed, draftUsed, wrongGuessMade });
    }

    private recordLevelChallengeHistory(): void {
        const model = this.model;
        if (!model || !this.challengeTrackingActive || this.tutorial) return;
        this.mergeLevelChallengeHistory(model.level, { manualMarksUsed: model.usedManualMarks,
            draftUsed: model.usedDraft, wrongGuessMade: model.hasWrongGuess });
    }

    private beginChallenge(): void {
        this.challengeTrackingActive = true;
        this.recordLevelChallengeHistory();
        this.pendingChallenge = undefined;
    }

    private startLevel(
        index: number,
        restored: readonly MeowdokuCellState[] | undefined,
        lives: number | undefined,
        animateEntry: boolean,
    ): void {
        const definition = this.levelDefinitions()[index];
        if (!definition) {
            throw new Error(`MeowdokuGame has no level at index ${index}.`);
        }
        if (this.mode === 'hard') this.discoverHardMode();
        this.levelRunId += 1;
        this.geniusClear = false;
        this.unscheduleAllCallbacks();
        this.destroyWinOverlay();
        this.destroyFailPage();
        // 棋盘目标宽度随边长变化（N >= 8 会放大），边长变了就必须重算整页布局。
        const needsRelayout = !this.layout || this.board?.size !== definition.size;
        this.draftMode = false;
        this.resetBoardGesture();
        this.recordLevelChallengeHistory();
        this.challengeTrackingActive = false;
        this.dragSaveDirty = false;
        this.levelIndex = index;
        this.pendingToolReward = undefined;
        this.preCatCell = this.pickPreCatCell(definition.level);
        this.board = decodeMeowdokuLevel(definition, this.preCatCell);
        this.model = MeowdokuModel.fromLevel(this.board, Math.min(lives ?? this.lifeLimit(), this.lifeLimit()));
        const boardRestored = !!restored && this.model.restore(restored, this.pendingChallenge);
        if (restored && !boardRestored) {
            // TODO: console.warn('[MeowdokuGame] Discarded an invalid saved board.');
        }
        this.clearHint();
        this.activeHint = undefined;
        // 原作 `_seed_like_hand_first_cat_from_board()`：预置猫也算「已经见过第一只猫」。
        const seededCat = this.board
            ? this.board.solution.some((col, row) => this.model?.getCell(row, col) === 'cat')
            : false;
        this.likeHandState = { hasSeenFirstCat: seededCat, triggered: 0, lastCatAt: 0 };
        // 恢复存档时把得分 / 连击接着用（鼓励语档位才不会退回 Nice）。
        if (restored && this.pendingScoreValue !== undefined) {
            this.model?.restoreScore(this.pendingScoreValue, this.pendingCombo ?? 0);
        }
        this.pendingScoreValue = undefined;
        this.pendingCombo = undefined;
        this.fullMarkFired = new Set<string>();
        this.fullMarkUnitCache = this.fullMarkUnits();
        this.perfectMarkFired = false;
        this.stepsUsed = boardRestored ? this.pendingStepsUsed ?? 0 : 0;
        this.pendingStepsUsed = undefined;
        this.destroyWinToast();
        this.inputLocked = false;
        this.state = 'playing';

        // 第一关的新手引导：**先跑引导**，这一关的棋盘等引导结束再初始化。
        // 之前是「先把第一关整页建出来 → 引导再整页重建一遍」，两次建盘会看到棋盘闪一下 /
        // 重复初始化；现在引导用的是引导盘，只建一次。
        const suppressTutorial = this.tutorialSuppressNext;
        this.tutorialSuppressNext = false;
        if (this.mode !== 'hard' && definition.level === 1 && !suppressTutorial) {
            this.suppressBoardIntro = true;
            this.startTutorial();
            return;
        }
        this.beginChallenge();
        // 正式关卡始终保留原入场；只有新手引导直接摆好棋盘。
        void animateEntry;
        this.suppressBoardIntro = false;
        if (needsRelayout) {
            this.rebuildPage();
        } else {
            this.rebuildBoard();
            this.refreshHud();
        }
        // 进关先把「已经满标」的单元登记掉，避免下一次落笔补弹 Clear。
        this.primeFullMarkUnits();
        this.displayedScore = this.model?.score ?? 0;
        if (this.scoreLabel?.isValid) this.scoreLabel.string = String(this.displayedScore);
        this.pendingScore = this.displayedScore;
        this.syncToolButtons();
        this.refreshDraftControls();
        // 动画开局短时间屏蔽输入：浏览器里「点大厅开始按钮」的合成鼠标事件会漏到刚打开的
        // 棋盘上（道具按钮正好在底部同一个位置），会把提示/道具莫名用掉。
        this.inputLocked = true;
        this.scheduleOnce(() => {
            if (!this.tutorial) this.inputLocked = false;
        }, 0.35);
        // 需求：去掉开局「找出所有猫咪吧」提示条和提示音。
        this.destroyTutorial();
        this.suppressBoardIntro = false;
        if (this.preCatCell && !restored) this.playPreCatReveal(this.preCatCell);
        this.context?.reportScore(0);
        this.persistProgress();
    }

    private advanceToNextLevel(): void {
        const nextIndex = this.continuationLevelIndex();
        this.startLevel(nextIndex, undefined, undefined, true);
    }

    /**
     * 难度助攻选格：连续失败到阈值后，下一局免费放好一只猫。
     * 原作按 `HintEngine.compute_cell_ranks` 选“最需要推理才找得到”的猫，
     * 这里用同一用途的 `computeMeowdokuCellRanks` 复现。
     */
    private pickPreCatCell(level: number): readonly [number, number] | undefined {
        if (this.mode === 'hard') return undefined;
        // 原作 `_resolve_pre_cat()`：`if lv <= 20: skip`（前 20 关永远不预放猫），
        // 而且困难助攻要求「同一关失败 >= 2 次」（`_pre_cat_fail_count >= 2`）。
        if (level <= PRE_CAT_MIN_LEVEL) return undefined;
        if (this.failCountFor(level) < PRE_CAT_FAIL_THRESHOLD) return undefined;
        const definition = this.levelDefinitions().find((entry) => entry.level === level);
        if (!definition) return undefined;
        const size = definition.size;
        const regions = definition.regions.map((row) => Array.from(row, (char) => Number.parseInt(char, 36)));
        const solution = Array.from(definition.solution, (char) => Number.parseInt(char, 36));
        const empty = new Array(size * size).fill('empty') as string[];
        const result = computeMeowdokuCellRanks(
            solverBoardFromCells(size, empty),
            size,
            regions,
            solution,
        );
        // 原作控制组 `PreCatDecider.pick_prefill_cell()`：在 **rank >= 3** 的解格里随机挑一个
        // （高难模式才取全盘最高 rank）。
        const candidates: (readonly [number, number])[] = [];
        for (let row = 0; row < size; row += 1) {
            const col = solution[row]!;
            const rank = result.ranks.get(row * 100 + col) ?? 0;
            if (rank >= PRE_CAT_MIN_RANK) candidates.push(Object.freeze([row, col] as [number, number]));
        }
        const best = candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : undefined;
        if (this.isExtraPreCatCell(definition, best)) return best;
        return undefined;
    }

    private isExtraPreCatCell(
        definition: { prefill: readonly [number, number] | null },
        cell: readonly [number, number] | undefined,
    ): boolean {
        if (!cell) return false;
        const prefill = definition.prefill;
        return !(prefill && prefill[0] === cell[0] && prefill[1] === cell[1]);
    }

    // ---------------------------------------------------------------- 页面

    private computeLayout(): MeowdokuLayoutMetrics {
        const size = view.getVisibleSize();
        const boardSize = this.levelDefinitions()[this.levelIndex]?.size ?? 4;
        return calculateMeowdokuLayoutFromPlatform(
            size.width,
            size.height,
            this.context?.services.platform.getLayoutInfo(),
            {},
            boardSize,
            this.lifeLimit(),
        );
    }

    private buildBackground(): void {
        const previous = this.backgroundNode;
        if (previous?.isValid) {
            this.backgroundNode = undefined;
            this.destroyNode(previous);
        }
        const background = new Node('Background');
        background.layer = this.node.layer;
        background.setParent(this.node);
        background.addComponent(UITransform).setContentSize(750, 1334);
        const graphics = background.addComponent(Graphics);
        graphics.fillColor = MEOWDOKU_COLORS.page;
        const size = view.getVisibleSize();
        graphics.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        graphics.fill();
        this.backgroundNode = background;
    }

    private rebuildPage(preserveTutorial = false): void {
        this.recycleBoardCells();
        this.destroyPage(preserveTutorial);
        this.layout = this.computeLayout();
        this.buildHud();
        this.buildStatusRow();
        this.buildRuleBar();
        // 道具栏要先于棋盘根节点建：棋盘根里会建提示蒙层 / 计分层，它们必须盖在道具栏之上。
        this.buildToolsRow();
        this.buildBoardRoot();
        this.buildHintBar();
        this.buildToast();
        this.rebuildBoard();
        this.refreshHud();
        // 屏幕重排后恢复已付费的提示，不能留下不可见的 activeHint 锁住棋盘。
        if (this.activeHint) {
            this.buildHintPreview(this.activeHint);
            this.showHintBar(this.activeHint);
        }
    }

    private destroyPage(preserveTutorial = false): void {
        // 引导页属于页面内容，重建页面时必须一起销毁，否则会留下一层挡输入的残留。
        // 屏幕重排保留本实例，由 relayout 更新几何，避免中途丢失当前引导步骤。
        if (!preserveTutorial) this.destroyTutorial();
        this.detachBoardInput();
        this.clearHintPreview();
        this.draftLayer = undefined;
        this.draftNodes.clear();
        this.draftControls = undefined;
        this.draftToggle = undefined;
        this.cellViews = [];
        this.catSlotNodes = [];
        this.catSlotBases = [];
        this.catSlotFaces = [];
        this.catSlotFound = [];
        this.catSlotPalette = [];
        this.lifeSlotNodes = [];
        this.renderedLives = -1;
        this.toolButtons.clear();
        this.boardGlowNode = undefined;
        this.catLayerNode = undefined;
        this.fxNode = undefined;
        this.levelValueLabel = undefined;
        this.scoreLabel = undefined;
        this.scoreLayer = undefined;
        this.hintLayerNode = undefined;
        this.encourageNode = undefined;
        this.winOverlayNode = undefined;
        this.winToastNode = undefined;
        this.failPageNode = undefined;
        this.hintMaskNode = undefined;
        this.hintBarNode = undefined;
        this.toastLabel = undefined;
        this.toastOpacity = undefined;
        this.toastNode = undefined;
        this.toolsRowNode = undefined;
        this.boardNode = undefined;
        const root = this.node;
        if (!root?.isValid) return;
        root.children.slice().forEach((child) => {
            if (child === this.backgroundNode) return;
            if (child === this.cellPoolRoot) return;
            if (this.retiredPageRoots.has(child)) return;
            if (preserveTutorial && child === this.tutorial?.node) return;
            this.retirePageNode(child);
        });
    }

    /**
     * 顶栏（本局状态），对应原作 `game_page.tscn` 的 Header（1080×120）：
     *
     * - 左边「第 N 关」胶囊；
     * - 正中得分：上面小标题、下面大数字（计分金光飞向这里）；
     * - 右边体力胶囊紧挨暂停按钮（原作的返回按钮按需求去掉，设置 / 暂停缩到 88）。
     *
     * 卡片与规则条 / 棋盘外框左右对齐，整条顶栏在胶囊下方的安全边界内纵向居中。
     */
    private buildHud(): void {
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const hud = new Node('Hud');
        hud.layer = this.node.layer;
        hud.setParent(this.node);
        hud.addComponent(UITransform).setContentSize(layout.contentWidth, layout.topBarHeight);
        hud.setPosition(0, layout.topBarCenterY, 0);
        const cardHeight = layout.hudCardHeight;
        const levelColors = this.levelSelectColors();

        // --- 左：关卡胶囊 ---
        const chip = new Node('LevelChip');
        chip.layer = this.node.layer;
        chip.setParent(hud);
        chip.addComponent(UITransform).setContentSize(layout.levelChipWidth, cardHeight);
        chip.setPosition(layout.levelChipLeft + layout.levelChipWidth / 2, 0, 0);
        this.drawLevelChip(
            chip.addComponent(Graphics),
            layout.levelChipWidth,
            cardHeight,
        );
        const level = this.createLabel(
            chip,
            'Value',
            layout.levelChipWidth - 28 * s,
            cardHeight,
            28 * s,
            levelColors.levelChipText,
        );
        setLabelBold(level, true);
        level.string = this.model ? MEOWDOKU_COPY.levelTitle(this.model.level) : '';
        this.levelValueLabel = level;

        // --- 中：得分 ---
        const scoreWidth = 180 * s;
        const score = new Node('ScoreDisplay');
        score.layer = this.node.layer;
        score.setParent(hud);
        score.addComponent(UITransform).setContentSize(scoreWidth, layout.topBarHeight);
        score.setPosition(0, 0, 0);
        const caption = this.createLabel(score, 'Title', scoreWidth, 26 * s, 20 * s, MEOWDOKU_COLORS.subtitle);
        caption.string = MEOWDOKU_COPY.scoreTitle;
        caption.node.setPosition(0, 22 * s, 0);
        const value = this.createLabel(score, 'Value', scoreWidth, 48 * s, 42 * s, MEOWDOKU_COLORS.ruleText);
        setLabelBold(value, true);
        // 重建 HUD（换尺寸、重排）时接着显示当前分数，不能回到 0。
        value.string = String(this.displayedScore);
        value.node.setPosition(0, -10 * s, 0);
        this.scoreLabel = value;

        // --- 右：体力胶囊 + 暂停按钮 ---
        const lifeWidth = layout.lifeListRight - layout.lifeListLeft;
        const lifePanel = new Node('LifeListBg');
        lifePanel.layer = this.node.layer;
        lifePanel.setParent(hud);
        lifePanel.addComponent(UITransform).setContentSize(lifeWidth, cardHeight);
        lifePanel.setPosition((layout.lifeListLeft + layout.lifeListRight) / 2, 0, 0);
        this.drawHudCard(
            lifePanel.addComponent(Graphics),
            lifeWidth,
            cardHeight,
            MEOWDOKU_COLORS.hudButton,
            MEOWDOKU_COLORS.hudShadow,
        );
        this.lifeSlotNodes = [];
        const lifeLimit = this.lifeLimit();
        for (let index = 0; index < lifeLimit; index += 1) {
            const slot = new Node(`LifeSlot${index}`);
            slot.layer = this.node.layer;
            slot.setParent(hud);
            slot.addComponent(UITransform).setContentSize(layout.lifeSlotSize, layout.lifeSlotSize);
            slot.setPosition(
                layout.lifeSlotsFirstX + index * (layout.lifeSlotSize + layout.lifeSlotGap),
                0,
                0,
            );
            this.drawLifeHeart(slot.addComponent(Graphics), layout.lifeSlotSize, true);
            this.lifeSlotNodes.push(slot);
        }

        const pauseButton = this.createIconButton(
            hud,
            'PauseButton',
            this.visuals?.frames.iconPause,
            layout.pauseX,
            0,
            () => this.requestPause(),
            layout.pauseSize,
        );
        this.createHardModeNotice(pauseButton, { diameter: 24 });
    }

    /**
     * 状态行：左边猫咪进度（原作 `CatHeartRow` 的 `CatProgressBar`），右边草稿开关。
     *
     * - 每个进度槽在「彩色模式」下只有两种形态（`cat_progress_slot.gd`）：
     *   没找到 → 只显示按**该颜色**染色的底板（比槽位小一圈、0.5 透明度）；
     *   找到了 → 换成彩色猫脸并 0 → 1.2 → 1 弹一下；
     * - 草稿是常驻免费模式，开关放在棋盘正上方、和消耗道具分开：
     *   关时白底铅笔「草稿」，开时橙底「草稿中」，再点一次退出草稿（等同取消）。
     */
    private buildStatusRow(): void {
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const row = new Node('StatusRow');
        row.layer = this.node.layer;
        row.setParent(this.node);
        row.addComponent(UITransform).setContentSize(layout.contentWidth, layout.catRowHeight);
        row.setPosition(0, layout.catRowCenterY, 0);
        const cardHeight = layout.hudCardHeight;

        // --- 猫咪进度底板 ---
        const catListWidth = Math.max(80, layout.catListRight - layout.catListLeft);
        const catPanel = new Node('CatListBg');
        catPanel.layer = this.node.layer;
        catPanel.setParent(row);
        catPanel.addComponent(UITransform).setContentSize(catListWidth, cardHeight);
        catPanel.setPosition((layout.catListLeft + layout.catListRight) / 2, 0, 0);
        this.drawHudCard(
            catPanel.addComponent(Graphics),
            catListWidth,
            cardHeight,
            MEOWDOKU_COLORS.hudButton,
            MEOWDOKU_COLORS.hudShadow,
        );

        // --- 猫咪进度（左对齐）：没找到画同一头像的区域色剪影，找到后显示彩色头像 ---
        const size = this.model?.size ?? 4;
        const step = layout.catSlotSize + layout.catSlotGap;
        const slotSize = layout.catSlotSize;
        const innerSize = slotSize * MEOWDOKU_CAT_COLOR_RATIO;
        const catFrame = this.visuals?.frames.catSlotBaseFace;
        const catWidth = catFrame?.originalSize.width ?? 1;
        const catHeight = catFrame?.originalSize.height ?? 1;
        const catScale = innerSize / Math.max(catWidth, catHeight);
        this.catSlotNodes = [];
        this.catSlotBases = [];
        this.catSlotFaces = [];
        this.catSlotFound = [];
        this.catSlotPalette = [];
        for (let index = 0; index < size; index += 1) {
            const slot = new Node(`CatSlot${index}`);
            slot.layer = this.node.layer;
            slot.setParent(row);
            slot.addComponent(UITransform).setContentSize(slotSize, slotSize);
            slot.setPosition(layout.catSlotsFirstX + index * step, 0, 0);

            const baseNode = new Node('ColorBase');
            baseNode.layer = this.node.layer;
            baseNode.setParent(slot);
            baseNode.addComponent(UITransform).setContentSize(catWidth * catScale, catHeight * catScale);
            const baseSprite = baseNode.addComponent(Sprite);
            baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            baseSprite.spriteFrame = catFrame ?? null;
            baseSprite.customMaterial = this.visuals?.catSlotSilhouette ?? null;

            const faceNode = new Node('ColorFace');
            faceNode.layer = this.node.layer;
            faceNode.setParent(slot);
            faceNode.addComponent(UITransform).setContentSize(catWidth * catScale, catHeight * catScale);
            const face = faceNode.addComponent(Sprite);
            face.sizeMode = Sprite.SizeMode.CUSTOM;
            face.spriteFrame = catFrame ?? null;
            faceNode.active = false;

            this.catSlotNodes.push(slot);
            this.catSlotBases.push(baseSprite);
            this.catSlotFaces.push(face);
            this.catSlotFound.push(false);
            this.catSlotPalette.push(-1);
        }

        // --- 草稿开关 ---
        const toggleWidth = layout.draftToggleRight - layout.draftToggleLeft;
        const toggle = new Node('DraftToggle');
        toggle.layer = this.node.layer;
        toggle.setParent(row);
        toggle.addComponent(UITransform).setContentSize(toggleWidth, cardHeight);
        toggle.setPosition((layout.draftToggleLeft + layout.draftToggleRight) / 2, 0, 0);
        const toggleFace = toggle.addComponent(Graphics);
        const iconSize = 30 * s;
        const iconNode = new Node('Icon');
        iconNode.layer = this.node.layer;
        iconNode.setParent(toggle);
        iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        const icon = iconNode.addComponent(Graphics);
        const label = this.createLabel(toggle, 'Label', toggleWidth, cardHeight, 26 * s, MEOWDOKU_COLORS.title);
        setLabelBold(label, true);
        // 文字宽度随「草稿 / 草稿中」变化，按实际宽度和图标一起居中。
        label.overflow = Label.Overflow.NONE;
        this.draftToggle = { node: toggle, face: toggleFace, icon, iconSize, label };
        this.bindButton(toggle, () => {
            if (this.draftMode) this.cancelDraft();
            else this.enterDraft();
        });
        this.paintDraftToggle();
    }

    private buildRuleBar(): void {
        const layout = this.requireLayout();
        const bar = new Node('RuleBar');
        bar.layer = this.node.layer;
        bar.setParent(this.node);
        bar.addComponent(UITransform).setContentSize(layout.rulePanelWidth, layout.rulePanelHeight);
        bar.setPosition(0, layout.rulePanelCenterY, 0);

        const panel = new Node('Panel');
        panel.layer = this.node.layer;
        panel.setParent(bar);
        panel.addComponent(UITransform).setContentSize(
            layout.rulePanelWidth,
            layout.rulePanelHeight,
        );
        this.drawRoundedRect(
            panel.addComponent(Graphics),
            layout.rulePanelWidth,
            layout.rulePanelHeight,
            layout.rulePanelCorner,
            MEOWDOKU_COLORS.rulePanel,
        );

        const texts = [
            MEOWDOKU_COPY.rulePerColor,
            MEOWDOKU_COPY.rulePerLine,
            MEOWDOKU_COPY.ruleNoTouch,
        ];
        const totalWidth = layout.rulePillWidth * texts.length
            + layout.rulePillGap * (texts.length - 1);
        // 原作 `RuleBar/Control/RuleHighlight1..3`（330×140 的 `rule_highlight.png`，
        // `modulate.a` 从 0.4 脉冲到 1、周期 0.6s、循环 2 次）。这里放在规则底板之后、
        // 图标之前，等价于「压在规则底板背后的一圈光」。
        this.ruleHighlightNodes = [];
        this.rulePillGraphics = [];
        texts.forEach((_text, index) => {
            const x = -totalWidth / 2
                + layout.rulePillWidth / 2
                + index * (layout.rulePillWidth + layout.rulePillGap);
            const glow = new Node(`RuleHighlight${index + 1}`);
            glow.layer = this.node.layer;
            glow.setParent(bar);
            // 高亮范围 = 规则底板本身（原作 `RuleHighlight` 330×140 就是规则条那一格的尺寸，
            // 之前放大到 1.28×/1.6× 会看着「范围变大了」）。
            glow.addComponent(UITransform).setContentSize(
                layout.rulePillWidth,
                layout.rulePillHeight,
            );
            glow.setPosition(x, 0, 0);
            // 原作 `rule_highlight.png`：淡红填充 + 红边的圆角框（332×140），不是白色柔光。
            const frame = this.visuals?.frames.ruleHighlight
                ?? this.visuals?.frames.glowSoft;
            if (frame) {
                const sprite = glow.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = frame;
                sprite.color = MEOWDOKU_COLORS.ruleHighlightTint;
            }
            const opacity = glow.addComponent(UIOpacity);
            opacity.opacity = 0;
            this.ruleHighlightNodes.push({ node: glow, opacity });
        });
        texts.forEach((text, index) => {
            const x = -totalWidth / 2
                + layout.rulePillWidth / 2
                + index * (layout.rulePillWidth + layout.rulePillGap);
            const pill = new Node(`RulePill${index + 1}`);
            pill.layer = this.node.layer;
            pill.setParent(bar);
            pill.addComponent(UITransform).setContentSize(
                layout.rulePillWidth,
                layout.rulePillHeight,
            );
            pill.setPosition(x, 0, 0);
            const pillGraphics = pill.addComponent(Graphics);
            this.drawRoundedRect(
                pillGraphics,
                layout.rulePillWidth,
                layout.rulePillHeight,
                layout.rulePillCorner,
                MEOWDOKU_COLORS.rulePill,
            );
            this.rulePillGraphics.push({
                graphics: pillGraphics,
                width: layout.rulePillWidth,
                height: layout.rulePillHeight,
                corner: layout.rulePillCorner,
            });
            // 原作每条规则前面有一张示意图（rule_diagram_color/line/touch）。
            const diagramSize = layout.rulePillHeight * 0.62;
            const diagramFrame = [
                this.visuals?.frames.ruleColor,
                this.visuals?.frames.ruleLine,
                this.visuals?.frames.ruleTouch,
            ][index];
            let labelOffset = 0;
            if (diagramFrame) {
                const diagram = new Node('Diagram');
                diagram.layer = this.node.layer;
                diagram.setParent(pill);
                diagram.addComponent(UITransform).setContentSize(diagramSize, diagramSize);
                diagram.setPosition(-layout.rulePillWidth / 2 + diagramSize / 2 + 8, 0, 0);
                const sprite = diagram.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = diagramFrame;
                labelOffset = (diagramSize + 6) / 2;
            }
            const label = this.createLabel(
                pill,
                'Label',
                layout.rulePillWidth - diagramSize - 20,
                layout.rulePillHeight - 8,
                19,
                MEOWDOKU_COLORS.ruleText,
            );
            label.string = text;
            label.node.setPosition(labelOffset, 0, 0);
        });
    }

    private buildBoardRoot(): void {
        const layout = this.requireLayout();
        const board = new Node('Board');
        board.layer = this.node.layer;
        board.setParent(this.node);
        board.addComponent(UITransform).setContentSize(layout.boardSize, layout.boardSize);
        board.setPosition(layout.boardX, layout.boardY, 0);
        this.boardNode = board;

        // 棋盘底板：白色厚板，下沿露出侧边并向下投出柔和阴影，与果冻格子的立体感一致。
        const plate = new Node('BoardPlate');
        plate.layer = this.node.layer;
        plate.setParent(board);
        const plateScale = MEOWDOKU_SOURCE_SCALE * layout.fitScale * layout.boardFit;
        const depth = MEOWDOKU_BOARD_PLATE.depth * plateScale;
        const shadowOffset = MEOWDOKU_BOARD_PLATE.shadowOffset * plateScale;
        const shadowBlur = MEOWDOKU_BOARD_PLATE.shadowBlur * plateScale;
        const plateExtent = layout.boardSize + (shadowOffset + shadowBlur) * 2;
        plate.addComponent(UITransform).setContentSize(plateExtent, plateExtent);
        const plateGraphics = plate.addComponent(Graphics);
        const half = layout.boardSize / 2;
        const shadow = MEOWDOKU_COLORS.boardShadow;
        const layers = Math.max(1, Math.round(shadowBlur / 2));
        for (let index = layers; index >= 1; index -= 1) {
            const spread = shadowBlur * index / layers;
            const t = index / layers;
            plateGraphics.fillColor = new Color(shadow.r, shadow.g, shadow.b, Math.round(shadow.a * (1 - t) * (1 - t)));
            plateGraphics.roundRect(
                -half - spread,
                -half - spread - shadowOffset,
                (half + spread) * 2,
                (half + spread) * 2,
                layout.boardCorner + spread,
            );
            plateGraphics.fill();
        }
        plateGraphics.fillColor = MEOWDOKU_COLORS.boardEdge;
        plateGraphics.roundRect(-half, -half - depth, half * 2, half * 2, layout.boardCorner);
        plateGraphics.fill();
        plateGraphics.fillColor = MEOWDOKU_COLORS.board;
        plateGraphics.roundRect(-half, -half, half * 2, half * 2, layout.boardCorner);
        plateGraphics.fill();

        const fx = new Node('Fx');
        fx.layer = this.node.layer;
        fx.setParent(board);
        fx.addComponent(UITransform).setContentSize(layout.boardSize, layout.boardSize);
        this.fxNode = fx;

        // 提示层：蒙层和提示高亮都放这里，保证「棋盘被压暗、提示本身是亮的」。
        const hintLayer = new Node('HintLayer');
        hintLayer.layer = this.node.layer;
        hintLayer.setParent(this.node);
        hintLayer.addComponent(UITransform).setContentSize(layout.width, layout.height);
        hintLayer.setPosition(0, 0, 0);
        this.hintLayerNode = hintLayer;

        // 计分气泡 / 飞分 / 鼓励图都挂在页面层，方便飞向 HUD。
        const scoreLayer = new Node('ScoreLayer');
        scoreLayer.layer = this.node.layer;
        scoreLayer.setParent(this.node);
        scoreLayer.addComponent(UITransform).setContentSize(layout.width, layout.height);
        scoreLayer.setPosition(0, 0, 0);
        this.scoreLayer = scoreLayer;

        // 格子底板和标记使用同一层；猫使用独立层，统一盖在所有格子之上。
        const cells = new Node('Cells');
        cells.layer = this.node.layer;
        cells.setParent(board);
        cells.addComponent(UITransform).setContentSize(layout.boardSize, layout.boardSize);
        this.boardGlowNode = cells;

        const cats = new Node('Cats');
        cats.layer = this.node.layer;
        cats.setParent(board);
        cats.addComponent(UITransform).setContentSize(layout.boardSize, layout.boardSize);
        this.catLayerNode = cats;

        // 特效层必须排在格子和猫之后：原作的格子特效层 `Glows` 带 `z_index = 2`，
        // 永远画在整块棋盘之上（否则格子扫光 / 冲突连线会被相邻格子盖住）。
        fx.setSiblingIndex(board.children.length - 1);

        this.attachBoardInput();
    }

    /**
     * 底部道具栏：和顶部规则条同宽、同风格的白色圆角底板，里面只横排两块奶油色道具卡
     * （草稿是常驻免费模式，开关在棋盘上方的状态行，不和消耗道具挤在一起）。
     *
     * - 每块卡左侧是白色圆底 + 道具图标（原作美术，按原比例缩放，不拉伸不染色）；
     * - 中间是道具名称（粗体）和一句说明；
     * - 右侧角标：**有道具**时红底胶囊 + 数量，**没道具**时绿底胶囊 + 看广告图标 + `AD`
     *   （原作 `game_ad_badge`），点了就看广告换一次。
     *
     * 建好后立刻按当前库存刷新角标，任何一次重建页面（换关、改尺寸、引导）都不会停在占位数字上。
     */
    private buildToolsRow(): void {
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const row = new Node('ToolsRow');
        row.layer = this.node.layer;
        row.setParent(this.node);
        row.addComponent(UITransform).setContentSize(layout.toolRowWidth, layout.toolRowHeight);
        row.setPosition(0, layout.toolRowCenterY, 0);
        this.drawRoundedRect(
            row.addComponent(Graphics),
            layout.toolRowWidth,
            layout.toolRowHeight,
            layout.rulePanelCorner,
            MEOWDOKU_COLORS.rulePanel,
        );
        this.toolsRowNode = row;

        const tools: MeowdokuTool[] = ['locate', 'hint'];
        const tileWidth = layout.toolTileWidth;
        const tileHeight = layout.toolTileHeight;
        const firstX = -(tileWidth * 2 + layout.toolTileGap) / 2 + tileWidth / 2;
        const inset = 14 * s;
        const circleSize = 54 * s;
        const circleX = -tileWidth / 2 + inset / 2 + circleSize / 2 + 4 * s;
        // 角标两种形态宽度不同：红底数量只放一两位数字；绿底广告要放下「▶ AD」，单独给宽。
        // 两者右边缘对齐，名称 / 说明按较宽的广告角标留位。
        const badgeHeight = 44 * s;
        const countBadgeWidth = 48 * s;
        const adBadgeWidth = 88 * s;
        const badgeRight = tileWidth / 2 - 16 * s;
        const badgeX = badgeRight - adBadgeWidth / 2;
        const textLeft = circleX + circleSize / 2 + 8 * s;
        const textWidth = badgeRight - adBadgeWidth - 8 * s - textLeft;

        tools.forEach((tool, index) => {
            const button = new Node(`Tool-${tool}`);
            button.layer = this.node.layer;
            button.setParent(row);
            button.addComponent(UITransform).setContentSize(tileWidth, tileHeight);
            button.setPosition(firstX + index * (tileWidth + layout.toolTileGap), 0, 0);
            this.drawRoundedRect(
                button.addComponent(Graphics),
                tileWidth,
                tileHeight,
                layout.rulePillCorner,
                MEOWDOKU_COLORS.rulePill,
            );

            // 图标：白色圆底里放原作道具图标，按原比例缩进 70% 的方框。
            const circle = new Node('IconBg');
            circle.layer = this.node.layer;
            circle.setParent(button);
            circle.addComponent(UITransform).setContentSize(circleSize, circleSize);
            circle.setPosition(circleX, 0, 0);
            this.drawRoundedRect(
                circle.addComponent(Graphics),
                circleSize,
                circleSize,
                circleSize / 2,
                MEOWDOKU_COLORS.hudButton,
            );
            const iconFrame = this.toolIconFrame(tool);
            const frameRect = iconFrame?.rect;
            const aspect = frameRect && frameRect.height > 0 ? frameRect.width / frameRect.height : 1;
            const iconBox = circleSize * 0.7;
            const iconNode = new Node('Icon');
            iconNode.layer = this.node.layer;
            iconNode.setParent(circle);
            // 必须先给 UITransform 定尺寸再挂 Sprite：反过来 Sprite 会自己加一个
            // 100x100 的 UITransform，把图标拉成正方形。
            iconNode.addComponent(UITransform).setContentSize(
                aspect >= 1 ? iconBox : iconBox * aspect,
                aspect >= 1 ? iconBox / aspect : iconBox,
            );
            const iconSprite = iconNode.addComponent(Sprite);
            iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            iconSprite.spriteFrame = iconFrame;
            iconSprite.color = Color.WHITE;

            // 名称 + 说明：左对齐排在图标右侧。
            const label = this.createLabel(button, 'Label', textWidth, 44 * s, 28 * s, MEOWDOKU_COLORS.title);
            setLabelBold(label, true);
            label.horizontalAlign = Label.HorizontalAlign.LEFT;
            label.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
            label.node.setPosition(textLeft, 16 * s, 0);
            label.string = this.toolLabel(tool);
            const desc = this.createLabel(button, 'Desc', textWidth, 32 * s, 18 * s, MEOWDOKU_COLORS.subtitle);
            desc.horizontalAlign = Label.HorizontalAlign.LEFT;
            desc.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
            desc.node.setPosition(textLeft, -20 * s, 0);
            desc.string = tool === 'hint' ? MEOWDOKU_COPY.toolHintDesc : MEOWDOKU_COPY.toolLocateDesc;

            // 角标：右侧竖直居中。
            const badge = new Node('Badge');
            badge.layer = this.node.layer;
            badge.setParent(button);
            badge.addComponent(UITransform).setContentSize(adBadgeWidth, badgeHeight);
            badge.setPosition(badgeX, 0, 0);

            const countRoot = new Node('RedRoot');
            countRoot.layer = this.node.layer;
            countRoot.setParent(badge);
            countRoot.addComponent(UITransform).setContentSize(countBadgeWidth, badgeHeight);
            countRoot.setPosition(adBadgeWidth / 2 - countBadgeWidth / 2, 0, 0);
            this.drawRoundedRect(
                countRoot.addComponent(Graphics),
                countBadgeWidth,
                badgeHeight,
                badgeHeight / 2,
                MEOWDOKU_COLORS.badge,
            );
            const countLabel = this.createLabel(
                countRoot,
                'Count',
                countBadgeWidth - 8 * s,
                badgeHeight - 4 * s,
                28 * s,
                Color.WHITE,
            );
            setLabelBold(countLabel, true);

            const adRoot = new Node('AdRoot');
            adRoot.layer = this.node.layer;
            adRoot.setParent(badge);
            adRoot.addComponent(UITransform).setContentSize(adBadgeWidth, badgeHeight);
            this.drawRoundedRect(
                adRoot.addComponent(Graphics),
                adBadgeWidth,
                badgeHeight,
                badgeHeight / 2,
                MEOWDOKU_COLORS.badgeAd,
            );
            const adIconFrame = this.visuals?.frames.iconAdPlay;
            const adIconHeight = badgeHeight * 0.42;
            const adAspect = adIconFrame && adIconFrame.rect.height > 0
                ? adIconFrame.rect.width / adIconFrame.rect.height
                : 1;
            const adIconWidth = adIconHeight * adAspect;
            const adGap = 6 * s;
            const adLabel = this.createLabel(adRoot, 'Tag', adBadgeWidth, badgeHeight, 22 * s, Color.WHITE);
            setLabelBold(adLabel, true);
            adLabel.overflow = Label.Overflow.NONE;
            adLabel.string = MEOWDOKU_COPY.adTag;
            adLabel.updateRenderData(true);
            const adTextWidth = adLabel.node.getComponent(UITransform)!.width;
            const adTotal = (adIconFrame ? adIconWidth + adGap : 0) + adTextWidth;
            adLabel.node.setPosition(adTotal / 2 - adTextWidth / 2, 0, 0);
            if (adIconFrame) {
                const adIcon = new Node('AdIcon');
                adIcon.layer = this.node.layer;
                adIcon.setParent(adRoot);
                adIcon.addComponent(UITransform).setContentSize(adIconWidth, adIconHeight);
                adIcon.setPosition(-adTotal / 2 + adIconWidth / 2, 0, 0);
                const adSprite = adIcon.addComponent(Sprite);
                adSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                adSprite.spriteFrame = adIconFrame;
                adSprite.color = Color.WHITE;
            }

            this.bindButton(button, () => this.pressTool(tool));
            this.toolButtons.set(tool, {
                node: button,
                icon: iconSprite,
                label,
                badge,
                countRoot,
                countLabel,
                adRoot,
            });
        });
        this.refreshDraftControls();
        this.syncToolButtons();
    }

    // 草稿为常驻免费功能。临时状态只在 model.draft 中，正式落子统一在应用时发生。
    private resetBoardGesture(): void {
        this.stopLongPress();
        this.boardPress = undefined;
        this.stopDoubleTapWindow();
        this.lastTapRow = -1;
        this.lastTapCol = -1;
        this.lastTapAt = 0;
        this.dragMode = 'none';
        this.draftTapWasCat = false;
    }

    private enterDraft(): void {
        if (this.state !== 'playing' || this.inputLocked || this.tutorial || this.toolAdPending || this.draftMode) return;
        this.clearHint();
        this.resetBoardGesture();
        this.model?.clearDraft();
        this.model?.recordDraftUse();
        this.draftMode = true;
        this.persistProgress();
        this.refreshDraftControls();
        this.refreshDraftMarks();
    }

    private cancelDraft(): void {
        if (this.state !== 'playing' || this.inputLocked || !this.draftMode) return;
        this.model?.clearDraft();
        this.draftMode = false;
        this.resetBoardGesture();
        this.refreshDraftMarks();
        this.refreshDraftControls();
    }

    /** 草稿状态变化后同步两处：状态行开关的外观，以及底部道具栏 ↔ 草稿操作栏的切换。 */
    private refreshDraftControls(): void {
        this.paintDraftToggle();
        const row = this.toolsRowNode;
        if (!row?.isValid) return;
        if (this.draftControls?.isValid) this.destroyNode(this.draftControls);
        this.draftControls = undefined;
        for (const child of row.children) child.active = !this.draftMode;
        if (!this.draftMode) return;
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const root = new Node('DraftControls');
        root.layer = this.node.layer;
        root.setParent(row);
        this.draftControls = root;
        // 两个按钮正好占住两张道具卡的位置：同宽同间距，按钮面 + 底部厚边一起落在卡片高度内。
        const edge = 6 * s;
        const width = layout.toolTileWidth;
        const height = layout.toolTileHeight - edge;
        const offsetX = (width + layout.toolTileGap) / 2;
        const cancel = this.createPillButton(root, 'DraftCancel', width, height,
            MEOWDOKU_COPY.draftCancel, 'secondary', { fontSize: 32 * s });
        cancel.setPosition(-offsetX, edge / 2, 0);
        this.addPillGlyph(cancel, 'cross', MEOWDOKU_COLORS.ruleText);
        this.bindButton(cancel, () => this.cancelDraft());
        const apply = this.createPillButton(root, 'DraftApply', width, height,
            MEOWDOKU_COPY.draftApply, 'primary', { fontSize: 32 * s });
        apply.setPosition(offsetX, edge / 2, 0);
        this.addPillGlyph(apply, 'check', Color.WHITE);
        this.bindButton(apply, () => this.applyDraft());
    }

    /** 在胶囊按钮文字左侧补一枚手画符号（× / ✓），和文字整体居中。 */
    private addPillGlyph(button: Node, glyph: 'cross' | 'check', color: Color): void {
        const label = button.getChildByName('Label')?.getComponent(Label);
        if (!label) return;
        const s = this.requireLayout().fitScale;
        const size = 30 * s;
        const gap = 10 * s;
        label.overflow = Label.Overflow.NONE;
        label.updateRenderData(true);
        const textWidth = label.node.getComponent(UITransform)?.width ?? 0;
        const total = size + gap + textWidth;

        const icon = new Node('Glyph');
        icon.layer = this.node.layer;
        icon.setParent(button);
        icon.addComponent(UITransform).setContentSize(size, size);
        icon.setPosition(-total / 2 + size / 2, 0, 0);
        const graphics = icon.addComponent(Graphics);
        graphics.lineWidth = 5.5 * s;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.strokeColor = color;
        const h = size / 2;
        if (glyph === 'cross') {
            const r = h * 0.62;
            graphics.moveTo(-r, -r);
            graphics.lineTo(r, r);
            graphics.moveTo(-r, r);
            graphics.lineTo(r, -r);
        } else {
            graphics.moveTo(-h * 0.72, h * 0.02);
            graphics.lineTo(-h * 0.2, -h * 0.52);
            graphics.lineTo(h * 0.75, h * 0.55);
        }
        graphics.stroke();
        label.node.setPosition(-total / 2 + size + gap + textWidth / 2, 0, 0);
    }

    private refreshDraftMarks(): void {
        const board = this.boardNode;
        if (!this.draftMode || !board?.isValid || !this.model) {
            if (this.draftLayer?.isValid) this.destroyNode(this.draftLayer);
            this.draftLayer = undefined;
            this.draftNodes.clear();
            return;
        }
        if (!this.draftLayer?.isValid || this.draftLayer.parent !== board) {
            if (this.draftLayer?.isValid) this.destroyNode(this.draftLayer);
            const layer = new Node('DraftMarks');
            layer.layer = this.node.layer;
            layer.setParent(board);
            this.draftLayer = layer;
            this.draftNodes.clear();
        }
        const present = new Set<number>();
        for (const { row, col } of this.model.draftEntries()) {
            const key = row * this.model.size + col;
            present.add(key);
            this.updateDraftMark(row, col);
        }
        for (const [key, entry] of this.draftNodes) {
            if (present.has(key)) continue;
            this.destroyNode(entry.node);
            this.draftNodes.delete(key);
        }
    }

    /** 划涂只同步被改动的格子，避免每次触摸都重建整层草稿。 */
    private updateDraftMark(row: number, col: number): void {
        const model = this.model;
        const layer = this.draftLayer;
        if (!model || !layer?.isValid) return;
        const key = row * model.size + col;
        const mark = model.getDraft(row, col);
        const current = this.draftNodes.get(key);
        if (!mark) {
            if (current) this.destroyNode(current.node);
            this.draftNodes.delete(key);
            return;
        }
        if (current?.node.isValid && current.mark === mark) return;
        if (current?.node.isValid) this.destroyNode(current.node);
        const layout = this.requireLayout();
        const node = new Node(mark === 'cat' ? 'DraftCat' : 'DraftCross');
        node.layer = this.node.layer;
        node.setParent(layer);
        const [x, y] = this.cellCenter(col, row);
        node.setPosition(x, y, 0);
        const size = layout.cellFace * (mark === 'cat' ? 0.8 : 0.65);
        node.addComponent(UITransform).setContentSize(size, size);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = (mark === 'cat' ? this.visuals?.frames.promptCat : this.visuals?.frames.promptX) ?? null;
        node.addComponent(UIOpacity).opacity = 200;
        this.draftNodes.set(key, { node, mark });
    }

    private applyDraft(): void {
        const model = this.model;
        if (!model || !this.draftMode || this.state !== 'playing' || this.inputLocked) return;
        const entries = model.draftEntries();
        // 同一同步事务内退出草稿并锁住入口，重复点击不会重复计分、扣血或结算。
        this.inputLocked = true;
        this.draftMode = false;
        model.clearDraft();
        this.resetBoardGesture();
        this.refreshDraftMarks();
        this.refreshDraftControls();
        for (const { row, col, mark } of entries) {
            if (mark === 'mark') this.applyMark(row, col, true, true);
        }
        // 先处理错误，生命耗尽后不再落下剩余假设猫，避免同一批同时失败与通关。
        for (const { row, col, mark } of entries) {
            if (mark !== 'cat' || model.isSolutionCell(row, col) || model.getCell(row, col) !== 'empty') continue;
            model.placeCat(row, col);
            this.resolveWrongGuess(row, col, this.cellViewAt(row, col), true);
            if (model.lives <= 0) break;
        }
        if (model.lives > 0) {
            for (const { row, col, mark } of entries) {
                if (mark === 'cat' && model.isSolutionCell(row, col) && model.placeCat(row, col) === 'placed') {
                    this.placeCatAt(row, col, true);
                }
            }
            this.inputLocked = false;
            this.commitBoardChange();
        } else {
            this.refreshHud();
            this.persistProgress();
        }
    }

    /** 提示蒙层：原作 `hint_overlay` 用 0.75 浓度的全屏遮罩把注意力压到棋盘上。 */
    private showHintMask(): void {
        if (this.hintMaskNode?.isValid) return;
        const layout = this.requireLayout();
        const mask = new Node('HintMask');
        mask.addComponent(BlockInputEvents);
        mask.layer = this.node.layer;
        mask.setParent(this.hintLayerNode ?? this.node);
        mask.setSiblingIndex(0);
        mask.addComponent(UITransform).setContentSize(layout.width, layout.height);
        mask.setPosition(0, 0, 0);
        const graphics = mask.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, Math.round(255 * MEOWDOKU_TIMING.hintMaskAlpha));
        graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
        graphics.fill();
        const opacity = mask.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).to(MEOWDOKU_TIMING.hintMaskFade, { opacity: 255 }).start();
        this.hintMaskNode = mask;
    }

    private hideHintMask(): void {
        const mask = this.hintMaskNode;
        this.hintMaskNode = undefined;
        if (mask?.isValid) this.destroyNode(mask);
    }

    /**
     * 提示面板，对齐原作 `hint_overlay.tscn`：
     *
     * - 顶部横幅（`Banner`，900×190）里有策略码（`StrategyLabel`，如 `R4`，字号 56、红色）
     *   和说明（`DescLabel`，字号 36、`#935A5A`）；
     * - 底部一个 750×160 的「应用」大按钮（`ApplyBtn`）。
     *
     * 按需求**去掉了取消按钮**（原作默认档 `hint_ue = VALUE_CONTROL` 也不走关闭按钮流程）。
     */
    /**
     * 提示的**应用按钮**。
     *
     * 需求：把原来那套「顶部横幅」（左上角策略码 `R1/R2/…` + 说明文案）整段删掉，
     * 提示只保留：全屏蒙层 + 目标格子高亮 + 一个「应用」按钮。
     */
    private buildHintBar(): void {
        const layout = this.requireLayout();
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;

        const root = new Node('HintBar');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(layout.width, layout.height);
        root.setPosition(0, 0, 0);
        root.active = false;
        this.hintBarNode = root;

        // 底部「应用」大按钮：原作 750×160，提示期间正好压在道具栏的位置上（道具栏被蒙层压暗）。
        const buttonWidth = Math.min(layout.width - 60 * k, 750 * k);
        const buttonHeight = 160 * k;
        const apply = new Node('Apply');
        apply.layer = this.node.layer;
        apply.setParent(root);
        apply.addComponent(UITransform).setContentSize(buttonWidth, buttonHeight);
        apply.setPosition(0, layout.toolRowCenterY, 0);
        this.drawRoundedRect(
            apply.addComponent(Graphics),
            buttonWidth,
            buttonHeight,
            buttonHeight / 2,
            MEOWDOKU_COLORS.hintApply,
        );
        const applyLabel = this.createLabel(
            apply,
            'Label',
            buttonWidth - 40 * k,
            buttonHeight - 20 * k,
            56 * k,
            Color.WHITE,
        );
        applyLabel.string = MEOWDOKU_COPY.hintApply;
        applyLabel.node.setPosition(0, 0, 0);
        this.bindButton(apply, () => this.applyHint());
    }

    private buildToast(): void {
        const toast = new Node('Toast');
        toast.layer = this.node.layer;
        toast.setParent(this.node);
        toast.addComponent(UITransform).setContentSize(392, 128);
        toast.setPosition(0, this.requireLayout().toastCenterY, 0);
        toast.active = false;

        this.drawRoundedRect(toast.addComponent(Graphics), 392, 128, 35, MEOWDOKU_COLORS.toast);
        const opacity = toast.addComponent(UIOpacity);
        opacity.opacity = 0;
        const label = this.createLabel(toast, 'Label', 340, 76, 36, MEOWDOKU_COLORS.title);
        label.string = MEOWDOKU_COPY.clearTitle;
        label.node.setPosition(0, 0, 0);

        this.toastNode = toast;
        this.toastLabel = label;
        this.toastOpacity = opacity;
    }

    // ---------------------------------------------------------------- 棋盘

    private cellCenter(col: number, row: number): readonly [number, number] {
        const layout = this.requireLayout();
        const half = layout.boardSize / 2;
        const origin = layout.cellPadding + (layout.cellPitch - layout.cellPx) / 2
            + layout.cellPx / 2;
        return Object.freeze([
            origin + col * layout.cellPitch - half,
            half - origin - row * layout.cellPitch,
        ]);
    }

    private rebuildBoard(): void {
        const layout = this.requireLayout();
        const board = this.boardNode;
        const host = this.boardGlowNode;
        const cats = this.catLayerNode;
        const model = this.model;
        const level = this.board;
        if (!board?.isValid || !host?.isValid || !cats?.isValid || !model || !level) return;

        const face = layout.cellFace;
        const cellPx = layout.cellPx;
        const barLength = cellPx * MEOWDOKU_MARK.barLengthRatio;
        const barThickness = cellPx * MEOWDOKU_MARK.barThicknessRatio;
        const palette = meowdokuRegionPalette();
        const reusable = this.cellViews.length === model.size * model.size
            && this.cellViews.every((view) => view.faceNode.isValid && view.faceNode.parent === host
                && view.catIntro.isValid && view.catIntro.parent === cats
                && view.gridGlowRoot.isValid);
        if (reusable) {
            this.resetReusedBoard();
        } else {
            this.recycleBoardCells();
        }
        for (let row = 0; row < model.size; row += 1) {
            for (let col = 0; col < model.size; col += 1) {
                const [x, y] = this.cellCenter(col, row);
                const regionId = level.regions[row]![col]!;
                const slot = level.colorMap[regionId] ?? regionId;
                const color = palette[slot % palette.length]!;
                if (reusable) {
                    const view = this.cellViews[row * model.size + col]!;
                    view.baseColor.r = color.r;
                    view.baseColor.g = color.g;
                    view.baseColor.b = color.b;
                    view.baseColor.a = color.a;
                } else {
                    const cached = this.cellPool.pop();
                    if (cached) {
                        this.bindCellNodes(cached, row, col, x, y, color);
                        this.cellViews.push(cached);
                    } else {
                        this.cellViews.push(this.createCellNodes(
                            host, cats, row, col, x, y, face, barLength, barThickness,
                            new Color(color.r, color.g, color.b, color.a),
                        ));
                    }
                }
            }
        }
        this.playBoardIntro();
        this.syncBoardState();
        this.refreshDraftMarks();
    }

    /** 复用前清掉上一局的动画和一次性特效，不改入场动画的参数。 */
    private resetReusedBoard(): void {
        this.restoreLiftedCats();
        const board = this.boardNode;
        if (board?.isValid) {
            Tween.stopAllByTarget(board);
            const opacity = board.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            const plateOpacity = board.getChildByName('BoardPlate')?.getComponent(UIOpacity);
            if (plateOpacity) {
                Tween.stopAllByTarget(plateOpacity);
                plateOpacity.opacity = 255;
            }
        }
        const permanentGlowNodes = new Set(this.cellViews.map((view) => view.gridGlowRoot));
        for (const child of this.fxNode?.children.slice() ?? []) {
            if (!permanentGlowNodes.has(child)) this.destroyNode(child);
        }
        this.conflictLineNode = undefined;
        for (const child of this.scoreLayer?.children.slice() ?? []) this.destroyNode(child);
        for (const node of Array.from(this.feedbackNodes)) this.destroyNode(node);
        this.encourageNode = undefined;
        const scoreNode = this.scoreLabel?.node;
        if (scoreNode?.isValid) {
            Tween.stopAllByTarget(scoreNode);
            scoreNode.setScale(1, 1, 1);
        }
        this.catSlotFound = [];
        this.catSlotPalette = [];
        for (const face of this.catSlotFaces) {
            if (!face?.isValid) continue;
            Tween.stopAllByTarget(face.node);
            face.node.setScale(1, 1, 1);
        }
        this.renderedLives = -1;
        for (const slot of this.lifeSlotNodes) {
            slot.children.slice().forEach((child) => this.destroyNode(child));
        }
        for (const entry of this.ruleHighlightNodes) {
            Tween.stopAllByTarget(entry.opacity);
            entry.opacity.opacity = 0;
        }
        for (const pill of this.rulePillGraphics) {
            if (pill.graphics.isValid) this.drawRoundedRect(
                pill.graphics, pill.width, pill.height, pill.corner, MEOWDOKU_COLORS.rulePill,
            );
        }
        if (this.toastOpacity) Tween.stopAllByTarget(this.toastOpacity);
        if (this.toastNode?.isValid) this.toastNode.active = false;
        for (const view of this.cellViews) {
            for (const node of [view.faceNode, view.crossIntro, view.crossRoot,
                view.catIntro, view.catRoot, view.gridGlowRoot, view.glowRoot,
                ...view.bars, ...view.barShadows]) {
                Tween.stopAllByTarget(node);
                const opacity = node.getComponent(UIOpacity);
                if (opacity) Tween.stopAllByTarget(opacity);
            }
            Tween.stopAllByTarget(view.squish);
            view.squish.x = 1;
            view.squish.y = 1;
            view.faceNode.setScale(1, 1, 1);
            view.crossRoot.setScale(1, 1, 1);
            view.catRoot.setPosition(0, 0, 0);
            view.catRoot.setScale(1, 1, 1);
            view.gridGlowRoot.setScale(1, 1, 1);
            view.glowRoot.setScale(1, 1, 1);
            view.gridGlowOpacity.opacity = 0;
            view.glowOpacity.opacity = 0;
            view.gridGlowRoot.active = false;
            view.glowRoot.active = false;
            view.catPlay = undefined;
            view.idleTimer = MEOWDOKU_TIMING.catIdleInterval;
            view.crossToken += 1;
            view.dim = 1;
            view.dimTarget = 1;
        }
    }

    /**
     * 棋盘入场：原作 `BoardContainerCell_01` 用 0.12s 一档、由左下到右上逐格淡入放大，
     * 让棋盘有一个「铺开」的过程。
     */
    /**
     * 棋盘入场，逐条对齐原作 `BoardContainerCell_01`（`active_group = 3`）与
     * `game_page.tscn` 里的导出参数：
     *
     * | 对象 | 行为 | 参数 |
     * | --- | --- | --- |
     * | 每格 | 淡入 | 起始 `0.18 + 环*0.04`，0.4s |
     * | 每格 | 缩放 | 0 → 1，1.0s，曲线中途冲到 1.1 再回落 |
     * | 棋盘 | 淡入 / 缩放 / 上移 | 0.45s / 1.3→1 用时 0.48s / -130 设计像素 0.53s |
     * | 网格 | 细线与彩边逐段长出、外框向上合拢 | 与格子淡入完成时间同步 |
     *
     * 环 = `col + (size - 1 - row)`（原作 `_rings.append(c + (n - 1 - r))`）。
     */
    private playBoardIntro(): void {
        const model = this.model;
        const boardNode = this.boardNode;
        const layout = this.requireLayout();
        if (!model || !boardNode?.isValid) return;
        // 引导页：棋盘直接摆好，不播逐格入场（格子默认是 0 缩放/透明，跳过入场时必须
        // 手动把它们落到最终状态，否则会看到一块空棋盘）。跳过入场时**也不播入场音效**。
        if (this.suppressBoardIntro) {
            this.cellViews.forEach((view) => {
                for (const node of this.cellIntroNodes(view)) {
                    if (!node.isValid) continue;
                    node.setScale(1, 1, 1);
                    const opacity = node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                }
            });
            boardNode.setScale(1, 1, 1);
            boardNode.setPosition(layout.boardX, layout.boardY, 0);
            const boardOpacity = boardNode.getComponent(UIOpacity);
            if (boardOpacity) boardOpacity.opacity = 255;
            return;
        }

        // 原作 `_play_entry_animation()`：棋盘入场动画和 `SoundManager.Kind.BOARD_ENTER`
        // (`board_enter_1.ogg`) 一起播。
        this.context?.services.feedback.play('popup');

        const scale = layout.cellScale;
        const ringMax = 2 * (model.size - 1);
        const fadeDone = MEOWDOKU_TIMING.boardIntroListDelay
            + ringMax * MEOWDOKU_TIMING.boardIntroDiagonalInterval
            + MEOWDOKU_TIMING.boardIntroCellFade;

        // 棋盘整体：0.18s 后开始淡入 + 从 1.3 缩到 1 + 从 -130 设计像素上移到位。
        const boardOpacity = boardNode.getComponent(UIOpacity) ?? boardNode.addComponent(UIOpacity);
        boardOpacity.opacity = 0;
        boardNode.setScale(
            MEOWDOKU_TIMING.boardIntroContainerScaleFrom,
            MEOWDOKU_TIMING.boardIntroContainerScaleFrom,
            1,
        );
        boardNode.setPosition(layout.boardX, layout.boardY - 130 * scale, 0);
        tween(boardOpacity)
            .delay(MEOWDOKU_TIMING.boardIntroListDelay)
            .to(MEOWDOKU_TIMING.boardIntroContainerFade, { opacity: 255 })
            .start();
        tween(boardNode)
            .delay(MEOWDOKU_TIMING.boardIntroListDelay)
            .to(MEOWDOKU_TIMING.boardIntroContainerScale, { scale: new Vec3(1, 1, 1) },
                { easing: 'circOut' })
            .start();
        tween(boardNode)
            .delay(MEOWDOKU_TIMING.boardIntroListDelay)
            .to(MEOWDOKU_TIMING.boardIntroContainerMove, {
                position: new Vec3(layout.boardX, layout.boardY, 0),
            }, { easing: 'cubicOut' })
            .start();

        for (const view of this.cellViews) {
            const ring = view.col + (model.size - 1 - view.row);
            const delay = MEOWDOKU_TIMING.boardIntroListDelay
                + ring * MEOWDOKU_TIMING.boardIntroDiagonalInterval;
            // 格子、叉、猫同一节拍弹出：棋盘上已有的叉和猫（续玩存档、开局送猫）跟着自己的格子出现。
            for (const node of this.cellIntroNodes(view)) this.playCellIntro(node, delay);
        }

        // 入场刚开始的一小段锁输入（格子和网格都还没长出来）。
        this.inputLocked = true;
        this.scheduleOnce(() => {
            if (this.state === 'playing') this.inputLocked = false;
        }, MEOWDOKU_TIMING.boardIntroListDelay);

    }

    private createCellNodes(
        host: Node,
        cats: Node,
        row: number,
        col: number,
        x: number,
        y: number,
        face: number,
        barLength: number,
        barThickness: number,
        baseColor: Color,
        fx = this.fxNode,
    ): MeowdokuCellView {
        const layout = this.requireLayout();

        const faceNode = new Node('Face');
        faceNode.layer = this.node.layer;
        faceNode.setParent(host);
        faceNode.addComponent(UITransform).setContentSize(face, face);
        faceNode.addComponent(UIOpacity);
        faceNode.setPosition(x, y, 0);
        // 贴图四周带投影边：本体与高光节点按 frame / body 放大，方块本体正好落在格子顶面上。
        const tileSize = face * MEOWDOKU_TILE.frame / MEOWDOKU_TILE.body;
        const addTileLayer = (name: string, frame: SpriteFrame | null, color: Color): Sprite => {
            const layer = new Node(name);
            layer.layer = this.node.layer;
            layer.setParent(faceNode);
            layer.addComponent(UITransform).setContentSize(tileSize, tileSize);
            const sprite = layer.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            sprite.color = color;
            return sprite;
        };
        const faceSprite = addTileLayer('Body', this.visuals?.tileBody ?? null, baseColor);
        const glossSprite = addTileLayer('Gloss', this.visuals?.tileGloss ?? null, Color.WHITE);

        const crossIntro = new Node('CrossIntro');
        crossIntro.layer = this.node.layer;
        crossIntro.setParent(host);
        crossIntro.addComponent(UITransform).setContentSize(layout.cellFace, layout.cellFace);
        crossIntro.addComponent(UIOpacity);
        crossIntro.setPosition(x, y, 0);
        const crossRoot = new Node('Cross');
        crossRoot.layer = this.node.layer;
        crossRoot.setParent(crossIntro);
        crossRoot.addComponent(UITransform).setContentSize(layout.cellFace, layout.cellFace);
        crossRoot.setPosition(0, 0, 0);
        const crossOpacity = crossRoot.addComponent(UIOpacity);
        crossOpacity.opacity = 0;
        crossRoot.active = false;

        // 两根笔画的投影都先于笔画绘制（投影只落在格子上，不会压到另一根笔画），
        // 与笔画同角度，按屏幕向下偏移；贴图四周带模糊留边。
        const shadowPad = barThickness * MEOWDOKU_MARK.shadowPadRatio;
        const barShadows: Node[] = [];
        for (let index = 0; index < 2; index += 1) {
            const shadow = new Node(`BarShadow${index + 1}`);
            shadow.layer = this.node.layer;
            shadow.setParent(crossRoot);
            shadow.addComponent(UITransform).setContentSize(barThickness + shadowPad * 2, barLength + shadowPad * 2);
            shadow.setPosition(0, -layout.cellPx * MEOWDOKU_MARK.shadowOffsetRatio, 0);
            shadow.angle = index === 0 ? 45 : -45;
            const sprite = shadow.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.visuals?.frames.crossShadow ?? null;
            sprite.color = MEOWDOKU_COLORS.markShadow;
            shadow.active = false;
            barShadows.push(shadow);
        }

        const bars: Node[] = [];
        for (let index = 0; index < 2; index += 1) {
            const bar = new Node(`Bar${index + 1}`);
            bar.layer = this.node.layer;
            bar.setParent(crossRoot);
            bar.addComponent(UITransform).setContentSize(barThickness, barLength);
            bar.setPosition(0, 0, 0);
            bar.angle = index === 0 ? 45 : -45;
            const sprite = bar.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.visuals?.frames.crossBar ?? null;
            sprite.color = MEOWDOKU_COLORS.mark;
            bar.active = false;
            bars.push(bar);
        }

        const gridGlowRoot = new Node('GridGlow');
        gridGlowRoot.layer = this.node.layer;
        // 原作 `Glows` 是格子自己的子节点但带 `z_index = 2`，渲染时压在整块棋盘之上。
        // Cocos 的 UI 没有 z_index，用「挂在棋盘特效层」等价实现。
        gridGlowRoot.setParent(fx?.isValid ? fx : host);
        gridGlowRoot.addComponent(UITransform).setContentSize(face * 1.25, face * 1.25);
        gridGlowRoot.setPosition(x, y, 0);
        const gridGlowOpacity = gridGlowRoot.addComponent(UIOpacity);
        gridGlowOpacity.opacity = 0;
        const gridGlowSprite = gridGlowRoot.addComponent(Sprite);
        gridGlowSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        gridGlowSprite.spriteFrame = this.visuals?.frames.gridGlow ?? null;
        gridGlowRoot.active = false;

        const catIntro = new Node('CatIntro');
        catIntro.layer = this.node.layer;
        catIntro.setParent(cats);
        catIntro.addComponent(UITransform).setContentSize(layout.catWidth, layout.catHeight);
        catIntro.addComponent(UIOpacity);
        catIntro.setPosition(x, y, 0);
        const catRoot = new Node('Cat');
        catRoot.layer = this.node.layer;
        catRoot.setParent(catIntro);
        catRoot.addComponent(UITransform).setContentSize(layout.catWidth, layout.catHeight);
        catRoot.setPosition(0, 0, 0);
        const catOpacity = catRoot.addComponent(UIOpacity);
        catOpacity.opacity = 0;
        const cat = catRoot.addComponent(Sprite);
        cat.sizeMode = Sprite.SizeMode.CUSTOM;
        cat.spriteFrame = this.visuals?.catIdle[0] ?? null;
        catRoot.active = false;

        const glowRoot = new Node('Glow');
        glowRoot.layer = this.node.layer;
        glowRoot.setParent(host);
        glowRoot.addComponent(UITransform).setContentSize(layout.cellFace, layout.cellFace);
        glowRoot.setPosition(x, y, 0);
        const glowOpacity = glowRoot.addComponent(UIOpacity);
        glowOpacity.opacity = 0;
        const glow = glowRoot.addComponent(Sprite);
        glow.sizeMode = Sprite.SizeMode.CUSTOM;
        glow.spriteFrame = this.visuals?.frames.glowRadial ?? null;
        glowRoot.active = false;

        return {
            row,
            col,
            face: faceSprite,
            gloss: glossSprite,
            faceNode,
            baseColor,
            crossRoot,
            crossIntro,
            crossOpacity,
            bars: Object.freeze(bars),
            barShadows: Object.freeze(barShadows),
            gridGlowRoot,
            gridGlowOpacity,
            catRoot,
            catIntro,
            cat,
            catOpacity,
            glowRoot,
            glowOpacity,
            idleTimer: MEOWDOKU_TIMING.catIdleInterval,
            crossToken: 0,
            dim: 1,
            dimTarget: 1,
            squish: { x: 1, y: 1 },
        };
    }

    private getCellPoolRoot(): Node {
        if (this.cellPoolRoot?.isValid) return this.cellPoolRoot;
        const root = new Node('CellPool');
        root.layer = this.node.layer;
        // 保持父节点激活，换盘时 reparent 不触发上千次 UI 组件的 onDisable/onEnable。
        // 整池透明且不在屏幕命中范围内，也不参与棋盘动画更新。
        root.addComponent(UITransform);
        root.addComponent(UIOpacity).opacity = 0;
        root.setPosition((this.layout?.width ?? 750) * 4, 0, 0);
        root.setParent(this.node);
        this.cellPoolRoot = root;
        return root;
    }

    private recycleBoardCells(): void {
        if (this.cellViews.length === 0) return;
        this.resetReusedBoard();
        const pool = this.getCellPoolRoot();
        for (const cell of this.cellViews) {
            for (const node of [cell.faceNode, cell.crossIntro, cell.catIntro,
                cell.gridGlowRoot, cell.glowRoot]) node.setParent(pool);
            this.cellPool.push(cell);
        }
        this.cellViews = [];
    }

    /** 选关期间每帧最多准备 4 格，最多保留已解锁关卡所需的一副棋盘。 */
    private warmBoardCells(): void {
        const missing = this.warmCellCount - this.cellViews.length - this.cellPool.length;
        if (missing <= 0) return;
        const pool = this.getCellPoolRoot();
        const layout = this.requireLayout();
        for (let count = 0; count < Math.min(4, missing); count += 1) {
            this.cellPool.push(this.createCellNodes(
                pool, pool, -1, -1, 0, 0, layout.cellFace,
                layout.cellPx * MEOWDOKU_MARK.barLengthRatio,
                layout.cellPx * MEOWDOKU_MARK.barThicknessRatio,
                new Color(255, 255, 255, 255), pool,
            ));
        }
    }

    /** 与新建格子使用相同尺寸和层次，单独的入场容器继续播放原来的补间。 */
    private bindCellNodes(cell: MeowdokuCellView, row: number, col: number,
        x: number, y: number, color: Color): void {
        const layout = this.requireLayout();
        const face = layout.cellFace;
        const barLength = layout.cellPx * MEOWDOKU_MARK.barLengthRatio;
        const barThickness = layout.cellPx * MEOWDOKU_MARK.barThicknessRatio;
        const shadowPad = barThickness * MEOWDOKU_MARK.shadowPadRatio;
        cell.row = row;
        cell.col = col;
        cell.baseColor.set(color);
        for (const node of [cell.faceNode, cell.crossIntro, cell.glowRoot]) {
            node.setParent(this.boardGlowNode!);
            node.getComponent(UITransform)!.setContentSize(face, face);
            node.setPosition(x, y, 0);
        }
        const tileSize = face * MEOWDOKU_TILE.frame / MEOWDOKU_TILE.body;
        for (const node of [cell.face.node, cell.gloss.node]) {
            node.getComponent(UITransform)!.setContentSize(tileSize, tileSize);
        }
        cell.crossRoot.getComponent(UITransform)!.setContentSize(face, face);
        for (const node of cell.bars) node.getComponent(UITransform)!.setContentSize(barThickness, barLength);
        for (const node of cell.barShadows) {
            node.getComponent(UITransform)!.setContentSize(barThickness + shadowPad * 2, barLength + shadowPad * 2);
            node.setPosition(0, -layout.cellPx * MEOWDOKU_MARK.shadowOffsetRatio, 0);
        }
        cell.catIntro.setParent(this.catLayerNode!);
        cell.catIntro.setPosition(x, y, 0);
        for (const node of [cell.catIntro, cell.catRoot]) {
            node.getComponent(UITransform)!.setContentSize(layout.catWidth, layout.catHeight);
        }
        cell.gridGlowRoot.setParent(this.fxNode ?? this.boardGlowNode!);
        cell.gridGlowRoot.getComponent(UITransform)!.setContentSize(face * 1.25, face * 1.25);
        cell.gridGlowRoot.setPosition(x, y, 0);
    }

    private syncBoardState(): void {
        const model = this.model;
        if (!model) return;
        for (const view of this.cellViews) this.applyCellVisual(view, false);
        this.refreshDimTargets(false);
    }

    /** 把模型状态映射到格子的节点显隐与缩放。 */
    private applyCellVisual(view: MeowdokuCellView, animate: boolean): void {
        const model = this.model;
        if (!model) return;
        const value = model.getCell(view.row, view.col);
        const isCross = value === 'mark' || value === 'error';
        view.crossRoot.active = isCross;

        if (isCross) {
            const color = value === 'error' ? MEOWDOKU_COLORS.markError : MEOWDOKU_COLORS.mark;
            if (!animate) this.restartCrossAnimation(view);
            view.crossOpacity.opacity = 255;
            view.crossRoot.setScale(1, 1, 1);
            view.bars.forEach((bar, index) => {
                const sprite = bar.getComponent(Sprite);
                if (sprite) sprite.color = color;
                this.setBar(view, index, true, animate ? undefined : 1);
            });
        } else {
            view.crossOpacity.opacity = 0;
            this.hideBars(view);
        }

        if (value === 'cat') {
            view.catRoot.active = true;
            view.catOpacity.opacity = 255;
            if (!animate) {
                view.catPlay = undefined;
                this.setCatFrames(view, this.visuals?.catIdle ?? [], 0);
            }
            view.idleTimer = Math.min(view.idleTimer, MEOWDOKU_TIMING.catIdleInterval);
        } else {
            view.catOpacity.opacity = 0;
            view.catPlay = undefined;
            view.catRoot.active = false;
        }
        this.applyDimToView(view);
    }

    /**
     * 单元级「Clear」：原作 `full_mark_detector.completed_units` ——
     * 某一**行 / 某一列 / 某一颜色**里的格子全部被排除干净（且该单元里有一只正确的猫）时，
     * 在最后落笔的那一格上方弹 `txt_clear`，并让整条单元的格子按「以最后落笔格为中心的
     * 环」依次挤压亮一下（原作 `_play_unit_clear_feedback` → `play_grid_glow_2`）。
     *
     * 注意原作 `MIN_BOARD_SIZE = 6`：4×4 / 5×5 关卡不做满标反馈。
     */
    /** 所有「单元」：每行 / 每列 / 每种颜色。 */
    private fullMarkUnits(): readonly { key: string; cells: readonly (readonly [number, number])[] }[] {
        const model = this.model;
        if (!model) return [];
        const size = model.size;
        const units: { key: string; cells: readonly (readonly [number, number])[] }[] = [];
        for (let row = 0; row < size; row += 1) {
            units.push({
                key: `r${row}`,
                cells: Array.from({ length: size }, (_, col) => [row, col] as const),
            });
        }
        for (let col = 0; col < size; col += 1) {
            units.push({
                key: `c${col}`,
                cells: Array.from({ length: size }, (_, row) => [row, col] as const),
            });
        }
        for (let region = 0; region < size; region += 1) {
            units.push({ key: `g${region}`, cells: model.regionCells(region) });
        }
        return units;
    }

    /** 某个单元是否「已经满标」（全被排除干净且含一只正确的猫）。 */
    private unitIsCleared(cells: readonly (readonly [number, number])[]): boolean {
        const model = this.model;
        if (!model) return false;
        let hasCat = false;
        for (const [row, col] of cells) {
            const state = model.getCell(row, col);
            if (state === 'cat') {
                if (model.isSolutionCell(row, col)) hasCat = true;
            } else if (state !== 'mark' && state !== 'error') {
                return false;
            }
        }
        return hasCat;
    }

    /**
     * 原作 `_seed_full_mark_fired_units_from_board()`：进关（含恢复存档）时，
     * 把**当前已经满标**的单元先登记成「已触发」，否则它们会在你下一次落笔时
     * 突然补弹一次 Clear（看起来就是「随便点一格都出 Clear」）。
     */
    private primeFullMarkUnits(): void {
        const model = this.model;
        if (!model || model.size < MEOWDOKU_FULL_MARK_MIN_SIZE) return;
        for (const unit of this.fullMarkUnitCache) {
            if (this.unitIsCleared(unit.cells)) this.fullMarkFired.add(unit.key);
        }
    }

    private checkFullMarkUnits(lastRow: number, lastCol: number): void {
        const model = this.model;
        if (!model || model.size < MEOWDOKU_FULL_MARK_MIN_SIZE) return;
        const fresh: (readonly (readonly [number, number])[])[] = [];
        const size = model.size;
        const region = model.board.regions[lastRow]?.[lastCol];
        if (region === undefined) return;
        const indexes = [lastRow, size + lastCol, size * 2 + region];
        for (const index of indexes) {
            const unit = this.fullMarkUnitCache[index];
            if (!unit) continue;
            if (this.fullMarkFired.has(unit.key)) continue;
            if (!this.unitIsCleared(unit.cells)) continue;
            this.fullMarkFired.add(unit.key);
            fresh.push(unit.cells);
        }
        if (fresh.length === 0) return;

        // 整盘满标会换更大的 `txt_perfectly_marked`，此时单元文字让位。
        const perfectTakesOver = this.isFullMarked() && model.isComplete;
        if (!perfectTakesOver) {
            const frame = this.visuals?.frames.txtClear;
            if (frame) this.showFullMarkText(frame, lastRow, lastCol, 'clear');
        }
        this.playClearWave(fresh, lastRow, lastCol, MEOWDOKU_TIMING.clearWaveDelay,
            MEOWDOKU_TIMING.clearWaveStep);
    }

    /** 整盘满标（原作 `is_full_mark`：未标格数不超过档位允许值）且已经通关时的反馈。 */
    private playFullMarkFeedback(): void {
        const model = this.model;
        if (!model || model.size < MEOWDOKU_FULL_MARK_MIN_SIZE) return;
        if (!this.isFullMarked() || !model.isComplete) return;
        if (this.perfectMarkFired) return;
        this.perfectMarkFired = true;
        this.autoCrossPass = true;

        // 先把还没标的格子按对角环顺序补叉（原作 `AutoXFillMode2`）。
        const blanks: [number, number][] = [];
        for (let row = 0; row < model.size; row += 1) {
            for (let col = 0; col < model.size; col += 1) {
                if (model.getCell(row, col) === 'empty') blanks.push([row, col]);
            }
        }
        blanks.sort((a, b) => (a[1] + (model.size - 1 - a[0])) - (b[1] + (model.size - 1 - b[0])));
        blanks.forEach(([row, col], index) => {
            this.scheduleOnce(() => {
                if (this.state === 'disposed') return;
                this.applyMark(row, col, true, true);
                const view = this.cellViewAt(row, col);
                if (view) this.playClearWaveCell(view);
            }, MEOWDOKU_TIMING.fullMarkDelay + index * MEOWDOKU_TIMING.clearWaveStep);
        });

        // 棋盘外发光按主导颜色亮一下（原作 `AnimBoardGlow.play("BoardGlow")`）。
        const palette = meowdokuRegionPalette();
        const dominator = dominantRegionId(model.board.regions);
        this.flashBoardGlow(palette[(model.board.colorMap[dominator] ?? dominator) % palette.length]!);

        const frame = this.visuals?.frames.txtPerfect;
        const center = Math.floor((model.size - 1) / 2);
        if (frame) this.showFullMarkText(frame, center, center, 'perfect');
        this.scheduleOnce(() => {
            this.autoCrossPass = false;
        }, 0.4);
    }

    /** 以「最后一次落笔的格子」为中心，按环序依次点亮一组格子的光圈。 */
    private playClearWave(
        groups: readonly (readonly (readonly [number, number])[])[],
        anchorRow: number,
        anchorCol: number,
        firstDelay: number,
        step: number,
    ): void {
        const rings = new Map<number, (readonly [number, number])[]>();
        const seen = new Set<number>();
        for (const cells of groups) {
            for (const [row, col] of cells) {
                const key = row * 100 + col;
                if (seen.has(key)) continue;
                seen.add(key);
                const ring = Math.max(Math.abs(row - anchorRow), Math.abs(col - anchorCol));
                const bucket = rings.get(ring) ?? [];
                bucket.push([row, col]);
                rings.set(ring, bucket);
            }
        }
        const sorted = Array.from(rings.keys()).sort((a, b) => a - b);
        let delay = firstDelay;
        for (const ring of sorted) {
            const cells = rings.get(ring) ?? [];
            this.scheduleOnce(() => {
                if (this.state === 'disposed') return;
                for (const [row, col] of cells) {
                    const view = this.cellViewAt(row, col);
                    if (view) this.playClearWaveCell(view);
                }
            }, delay);
            delay += step;
        }
    }

    /** 原作 `play_grid_glow_2`（`GridGlowing2`）：格子挤压 + 光圈亮起后淡出。 */
    private playClearWaveCell(view: MeowdokuCellView): void {
        // 原作 `GridGlowing2` 同时缩放 `BgPanel`、`CrossOut`、`CatIcon`（都是 1 → 1.1 → 1）。
        this.squishCell(
            view,
            [[0.1, 1.1], [0.3, 1]],
            [[0.1, 1.1], [0.3, 1]],
        );
        for (const target of [view.crossRoot, view.catRoot]) {
            if (!target?.isValid) continue;
            Tween.stopAllByTarget(target);
            target.setScale(1, 1, 1);
            tween(target)
                .to(0.1, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
                .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
                .start();
        }
        const glow = view.gridGlowRoot;
        const opacity = view.gridGlowOpacity;
        if (!glow?.isValid) return;
        glow.active = true;
        Tween.stopAllByTarget(glow);
        Tween.stopAllByTarget(opacity);
        glow.setScale(1.09, 1.09, 1);
        opacity.opacity = Math.round(255 * 0.6078);
        tween(glow)
            .to(0.1, { scale: new Vec3(1.19, 1.19, 1) }, { easing: 'quadOut' })
            .to(0.2, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' })
            .start();
        tween(opacity)
            .to(0.1, { opacity: 0 })
            .call(() => { if (glow.isValid) glow.active = false; })
            .start();
    }

    /** 是否达到「整盘满标」档位（原作 `full_mark_detector.is_full_mark`）。 */
    private isFullMarked(): boolean {
        const model = this.model;
        if (!model) return false;
        let unmarked = 0;
        for (let row = 0; row < model.size; row += 1) {
            for (let col = 0; col < model.size; col += 1) {
                const state = model.getCell(row, col);
                if (state !== 'mark' && state !== 'error' && state !== 'cat') unmarked += 1;
            }
        }
        return unmarked <= meowdokuMaxUnmarkedAllowed(model.size);
    }

    /** 棋盘外发光闪一下（原作 `BoardGlow` 1.2s：0 → 0.31 → 0）。 */
    private flashBoardGlow(color: Color): void {
        const node = this.boardNode?.getChildByName('BoardPlate');
        if (!node?.isValid) return;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;
        tween(opacity)
            .to(0.5, { opacity: Math.round(255 * MEOWDOKU_TIMING.boardGlowAlpha) })
            .delay(0.5)
            .to(0.2, { opacity: 255 })
            .start();
        void color;
    }

    /**
     * 弹出满标文字（`txt_clear` 194x72 / `txt_perfectly_marked` 527x84，原作设计像素）。
     * 原作把控件顶边放在最后落笔格子下方，转成 Cocos 中心坐标时还要加上内容中心偏移。
     */
    private showFullMarkText(
        frame: SpriteFrame,
        row: number,
        col: number,
        kind: 'clear' | 'perfect',
    ): void {
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        if (!layer?.isValid) return;
        // 文字是页面层元素，尺寸按页面设计比例换算（只有「离格子的高度」才跟棋盘缩放）。
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const scale = layout.cellScale;
        const sourceW = kind === 'perfect'
            ? MEOWDOKU_PERFECT_TEXT_SIZE[0]
            : MEOWDOKU_CLEAR_TEXT_SIZE[0];
        const sourceH = kind === 'perfect'
            ? MEOWDOKU_PERFECT_TEXT_SIZE[1]
            : MEOWDOKU_CLEAR_TEXT_SIZE[1];
        const [localX, localY] = this.cellCenter(col, row);
        const node = new Node('FullMarkText');
        node.layer = this.node.layer;
        node.setParent(layer);
        node.addComponent(UITransform).setContentSize(sourceW * k, sourceH * k);
        // 原作 `show_full_mark_text` 用的是 `local_pos.y + offset`（y 向下）= 格子**下方**；
        // 计分气泡才是 `- offset`（上方），两者方向相反，别搞混。
        node.setPosition(
            layout.boardX + localX,
            layout.boardY + localY - MEOWDOKU_CAT_TOP_UNSCALED * scale
                // 原作容器高 84；Clear 子图中心比容器中心高 6.5，Perfect 居中。
                - (MEOWDOKU_BUBBLE_GAP + 42 - (kind === 'clear' ? 6.5 : 0)) * k,
            0,
        );
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(
            MEOWDOKU_TIMING.clearTextScaleFrom,
            MEOWDOKU_TIMING.clearTextScaleFrom,
            1,
        );
        tween(node)
            .to(MEOWDOKU_TIMING.clearTextIn, {
                scale: new Vec3(
                    MEOWDOKU_TIMING.clearTextScalePeak,
                    MEOWDOKU_TIMING.clearTextScalePeak,
                    1,
                ),
            }, { easing: 'quadOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(opacity)
            .to(MEOWDOKU_TIMING.clearTextIn, { opacity: 255 })
            .delay(MEOWDOKU_TIMING.clearTextHold)
            .to(MEOWDOKU_TIMING.clearTextOut, { opacity: 0 })
            .call(() => {
                if (node.isValid) this.destroyNode(node);
            })
            .start();
    }

    /** 冲突 / 提示用的格子光圈：0.2s 亮起、保持、1.7s 淡出（原作 `GridGlowing`）。 */
    private playGridGlow(view: MeowdokuCellView): void {
        if (!view.gridGlowRoot.isValid) return;
        view.gridGlowRoot.active = true;
        view.gridGlowRoot.setScale(1.09, 1.09, 1);
        view.gridGlowOpacity.opacity = 0;
        Tween.stopAllByTarget(view.gridGlowOpacity);
        Tween.stopAllByTarget(view.gridGlowRoot);
        tween(view.gridGlowOpacity)
            .to(MEOWDOKU_TIMING.gridGlowIn, { opacity: 255 })
            .delay(MEOWDOKU_TIMING.gridGlowOutAt - MEOWDOKU_TIMING.gridGlowIn)
            .to(MEOWDOKU_TIMING.gridGlowDuration - MEOWDOKU_TIMING.gridGlowOutAt, { opacity: 0 })
            .call(() => { if (view.gridGlowRoot.isValid) view.gridGlowRoot.active = false; })
            .start();
        tween(view.gridGlowRoot)
            .to(MEOWDOKU_TIMING.gridGlowDuration, { scale: new Vec3(1.02, 1.02, 1) }, { easing: 'quadOut' })
            .start();
    }

    private stopGridGlow(): void {
        for (const view of this.cellViews) {
            if (!view.gridGlowRoot.isValid) continue;
            Tween.stopAllByTarget(view.gridGlowOpacity);
            Tween.stopAllByTarget(view.gridGlowRoot);
            view.gridGlowOpacity.opacity = 0;
            view.gridGlowRoot.setScale(1, 1, 1);
            view.gridGlowRoot.active = false;
        }
    }

    /** 棋盘入场时逐格弹出的节点：格子本身，以及叉和猫各自的入场容器。 */
    private cellIntroNodes(view: MeowdokuCellView): readonly Node[] {
        return [view.faceNode, view.crossIntro, view.catIntro];
    }

    /** 单个节点的入场：淡入 + 0 → 1.1 → 0.968 → 1 的弹性缩放（原作 `BoardContainerCell_01`）。 */
    private playCellIntro(node: Node, delay: number): void {
        if (!node.isValid) return;
        node.setScale(0, 0, 1);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity)
            .delay(delay)
            .to(MEOWDOKU_TIMING.boardIntroCellFade, { opacity: 255 }, { easing: 'sineOut' })
            .start();
        const grow = MEOWDOKU_TIMING.boardIntroCellScale;
        tween(node)
            .delay(delay)
            .to(grow * 0.293, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
            .to(grow * 0.157, { scale: new Vec3(0.968, 0.968, 1) }, { easing: 'quadInOut' })
            .to(grow * 0.117, { scale: new Vec3(0.9986, 0.9986, 1) }, { easing: 'quadInOut' })
            .to(grow * 0.433, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
    }

    private hideBars(view: MeowdokuCellView): void {
        this.restartCrossAnimation(view);
        view.bars.forEach((_, index) => this.setBar(view, index, false));
        view.crossRoot.active = false;
    }

    /** 作废进行中的叉动画（笔画生长、延时激活），返回新的代次。 */
    private restartCrossAnimation(view: MeowdokuCellView): number {
        view.crossToken += 1;
        view.bars.forEach((bar) => Tween.stopAllByTarget(bar));
        return view.crossToken;
    }

    /** 同时设置一根笔画和它的投影：显隐，以及（给出时）生长方向的缩放。 */
    private setBar(view: MeowdokuCellView, index: number, active: boolean, scaleY?: number): void {
        const bar = view.bars[index];
        const shadow = view.barShadows[index];
        for (const node of [bar, shadow]) {
            if (!node?.isValid) continue;
            node.active = active;
            if (scaleY !== undefined) node.setScale(1, scaleY, 1);
        }
    }

    /** 一根笔画从 `barGrowFromRatio` 长到完整长度，投影逐帧同步；`token` 过期时作废。 */
    private growBar(view: MeowdokuCellView, index: number, duration: number, token: number): void {
        const bar = view.bars[index];
        const shadow = view.barShadows[index];
        if (!bar?.isValid || view.crossToken !== token) return;
        this.setBar(view, index, true, MEOWDOKU_MARK.barGrowFromRatio);
        tween(bar)
            .to(duration, { scale: new Vec3(1, 1, 1) }, {
                easing: 'quadOut',
                onUpdate: () => {
                    if (shadow?.isValid) shadow.setScale(bar.scale);
                },
            })
            .start();
    }

    private applyDimToView(view: MeowdokuCellView): void {
        view.face.color = new Color(
            view.baseColor.r,
            view.baseColor.g,
            view.baseColor.b,
            Math.round(view.baseColor.a * view.dim),
        );
        view.gloss.color = new Color(255, 255, 255, Math.round(255 * view.dim));
    }

    // ---------------------------------------------------------------- 逐帧动画

    private setCatFrames(
        view: MeowdokuCellView,
        frames: readonly SpriteFrame[],
        index: number,
    ): void {
        if (frames.length === 0) return;
        const frame = frames[Math.min(index, frames.length - 1)]!;
        view.cat.spriteFrame = frame;
        const layout = this.requireLayout();
        // 原作把整帧按 `_CAT_ICON_BASE_SCALE` 缩放显示；各套动画帧宽不同，
        // 显示尺寸要按当前帧的尺寸换算，而不是固定值。
        // 出场和哭泣扩展透明画布以容纳过冲与眼泪；按整帧换算大小并保持中心锚点，
        // 透明留白不参与可见猫头的缩放，切到待机时可见尺寸和位置一致。
        const fit = MEOWDOKU_CAT_DISPLAY_SCALE / MEOWDOKU_SHEETS.catAppear.scale;
        const size = frame.rect;
        const width = (size.width > 0 ? size.width : MEOWDOKU_SHEETS.catAppear.frameWidth)
            * fit * layout.cellScale;
        const height = (size.height > 0 ? size.height : MEOWDOKU_SHEETS.catAppear.frameHeight)
            * fit * layout.cellScale;
        const transform = view.catRoot.getComponent(UITransform);
        if (transform && (transform.width !== width || transform.height !== height)) {
            transform.setContentSize(width, height);
        }
    }

    private startCatAnimation(view: MeowdokuCellView, withBurst: boolean): void {
        const appear = this.visuals?.catAppear ?? [];
        view.catRoot.active = true;
        view.catOpacity.opacity = 0;
        tween(view.catOpacity)
            .to(MEOWDOKU_TIMING.catFadeIn, { opacity: 255 })
            .start();
        view.catPlay = {
            frames: appear,
            fps: MEOWDOKU_SHEETS.catAppear.fps,
            time: 0,
            index: 0,
            next: 'idle',
        };
        this.setCatFrames(view, appear, 0);
        view.catRoot.setScale(1, 1, 1);

        const [x, y] = this.cellCenter(view.col, view.row);
        this.scheduleOnce(() => {
            if (!view.catRoot.isValid) return;
            if (withBurst) this.spawnStarBurst(x, y);
            this.flashCell(view, 0.3);
        }, MEOWDOKU_TIMING.catBurstAt);
    }

    private advanceCatAnimations(dt: number): void {
        const visuals = this.visuals;
        if (!visuals) return;
        for (const view of this.cellViews) {
            const play = view.catPlay;
            if (!play || play.next === 'hold' || !view.catRoot.isValid) continue;
            play.time += dt;
            if (play.next === 'loop') {
                // 保留跨循环的余量，24fps 素材在 30/60Hz 屏幕上也保持同一速度。
                play.time %= play.frames.length / play.fps;
                const index = Math.floor(play.time * play.fps + 1e-6) % play.frames.length;
                if (index !== play.index) {
                    play.index = index;
                    this.setCatFrames(view, play.frames, index);
                }
                continue;
            }
            const last = play.frames.length - 1;
            const nextIndex = Math.min(last, Math.floor(play.time * play.fps));
            if (nextIndex !== play.index) {
                play.index = nextIndex;
                this.setCatFrames(view, play.frames, nextIndex);
            }
            if (play.next === 'once') {
                // 播到最后帧就停住（`nextIndex` 上面已经被 clamp 到最后一帧）。
                if (nextIndex >= play.frames.length - 1) play.next = 'hold';
                continue;
            }
            if (play.next === 'idleLoop') {
                // 按实际序列帧数/帧率完整播放，避免替换素材后仍用旧时长截断动作。
                // 最后一帧是正面姿势，播完停住，等下一次重播。
                const duration = play.frames.length / play.fps;
                if (play.time + 1e-6 >= duration) {
                    play.index = last;
                    play.next = 'hold';
                    this.setCatFrames(view, play.frames, last);
                }
                continue;
            }
            if (play.next !== 'idle') continue;
            // 出场和烦躁都按自身帧数/帧率播完整段，之后再回到待机。
            // 不使用独立定时器，避免旧的烦躁回调打断后续出场、生气或哭泣。
            if (play.time + 1e-6 < play.frames.length / play.fps) continue;
            view.catPlay = {
                frames: visuals.catIdle,
                fps: MEOWDOKU_SHEETS.catIdle.fps,
                time: 0,
                index: 0,
                next: 'idleLoop',
            };
            view.idleTimer = 0;
            this.setCatFrames(view, visuals.catIdle, 0);
        }
    }


    /** 静置满 5 秒重播一次 `CatIconIdle`（原作 `_idle_timer` 的节奏）。 */
    private advanceIdleLoop(dt: number): void {
        const visuals = this.visuals;
        const model = this.model;
        if (!visuals || !model) return;
        for (const view of this.cellViews) {
            if (model.getCell(view.row, view.col) !== 'cat') continue;
            const play: CatFramePlay | undefined = view.catPlay;
            if (play && play.next !== 'idleLoop' && play.next !== 'hold') continue;
            view.idleTimer += dt;
            if (view.idleTimer < MEOWDOKU_TIMING.catIdleInterval) continue;
            view.idleTimer = 0;
            view.catPlay = {
                frames: visuals.catIdle,
                fps: MEOWDOKU_SHEETS.catIdle.fps,
                time: 0,
                index: 0,
                next: 'idleLoop',
            };
            this.setCatFrames(view, visuals.catIdle, 0);
        }
    }

    /** 播放一段命名过的猫动画（冲突反应用）。 */
    private playNamedCatAnim(
        view: MeowdokuCellView,
        frames: readonly SpriteFrame[],
        fps: number,
    ): void {
        if (frames.length === 0) return;
        view.catRoot.active = true;
        view.catOpacity.opacity = 255;
        // `once` 推进到完整动作的最后一帧；冲突反馈结束时统一收回两只猫。
        view.catPlay = { frames, fps, time: 0, index: 0, next: 'once' };
        this.setCatFrames(view, frames, 0);
    }

    /** 通关时所有猫重播一次出场动画（原作 `replay_all_cat_appear`）。 */
    /**
     * 通关时整个棋盘的庆祝：所有猫重播出场（原作 `replay_all_cat_appear`）之外，
     * 棋盘外发光按主色闪一次、四角炸星点，让「整盘」都有反馈。
     */
    private playBoardWinFlourish(): void {
        const model = this.model;
        const layout = this.requireLayout();
        if (!model) return;
        const palette = meowdokuRegionPalette();
        const dominator = dominantRegionId(model.board.regions);
        this.flashBoardGlow(
            palette[(model.board.colorMap[dominator] ?? dominator) % palette.length]!,
        );
        const star = this.visuals?.frames.star;
        if (!star) return;
        const half = layout.boardSize / 2;
        const corners: readonly (readonly [number, number])[] = [
            [-half * 0.8, half * 0.8],
            [half * 0.8, half * 0.8],
            [-half * 0.8, -half * 0.8],
            [half * 0.8, -half * 0.8],
        ];
        corners.forEach(([x, y], index) => {
            this.scheduleOnce(() => {
                if (this.state === 'disposed') return;
                this.spawnStarBurst(layout.boardX + x, layout.boardY + y);
            }, index * 0.06);
        });
    }

    private replayAllCatAppear(): void {
        const model = this.model;
        if (!model) return;
        for (const view of this.cellViews) {
            if (model.getCell(view.row, view.col) !== 'cat') continue;
            this.startCatAnimation(view, true);
        }
    }

    /**
     * 原作 `revive_all_cat_to_idle()`：复活后让所有猫回到待机（从哭/烦躁里恢复）。
     */
    private reviveCatsToIdle(): void {
        const visuals = this.visuals;
        const model = this.model;
        if (!visuals || !model) return;
        for (const view of this.cellViews) {
            if (model.getCell(view.row, view.col) !== 'cat') continue;
            this.setCatFrames(view, visuals.catIdle, 0);
            view.catPlay = {
                frames: visuals.catIdle,
                fps: MEOWDOKU_SHEETS.catIdle.fps,
                time: 0,
                index: 0,
                next: 'idleLoop',
            };
            view.idleTimer = 0;
        }
    }

    /**
     * 原作 `play_cat_frustrated_all` / `play_cat_cry_loop_all`：
     * 放错位置时全场猫「烦躁」，生命值耗尽时全场猫「哭」。
     */
    private playAllCatsMood(mood: 'frustrated' | 'cry'): void {
        const visuals = this.visuals;
        if (!visuals) return;
        const frames = mood === 'frustrated' ? visuals.catFrustrated : visuals.catCry;
        const fps = mood === 'frustrated'
            ? MEOWDOKU_SHEETS.catFrustrated.fps
            : MEOWDOKU_SHEETS.catCry.fps;
        const model = this.model;
        if (!model) return;
        for (const view of this.cellViews) {
            if (model.getCell(view.row, view.col) !== 'cat') continue;
            view.catPlay = { frames, fps, time: 0, index: 0, next: mood === 'cry' ? 'loop' : 'idle' };
            view.idleTimer = 0;
            this.setCatFrames(view, frames, 0);
        }
    }

    // ---------------------------------------------------------------- 区域变暗

    /**
     * 原作 `cat_found_grid` 的控制档是 **关闭**，找到猫之后格子底板保持原样。
     * 这里保留接口让格子底板始终按区域原色渲染，不做整块变淡。
     */
    private refreshDimTargets(_animated: boolean): void {
        for (const view of this.cellViews) {
            if (view.dim === 1 && view.dimTarget === 1) continue;
            view.dim = 1;
            view.dimTarget = 1;
            this.applyDimToView(view);
        }
    }

    private advanceDim(_dt: number): void {
        // 没有变暗动画，保留 update 钩子便于以后接原作的可选档位。
    }

    // ---------------------------------------------------------------- 动效

    private playCrossAppear(view: MeowdokuCellView, color: Color, animated: boolean): void {
        const [bar1, bar2] = view.bars;
        view.crossRoot.active = true;
        const token = this.restartCrossAnimation(view);
        view.crossOpacity.opacity = 255;
        view.crossRoot.setScale(1, 1, 1);
        for (const bar of view.bars) {
            const sprite = bar.getComponent(Sprite);
            if (sprite) sprite.color = color;
        }
        if (!animated || !bar1 || !bar2) {
            view.bars.forEach((_, index) => this.setBar(view, index, true, 1));
            return;
        }
        // 画叉时格子本身也会被「按」一下（原作 `CrossOutAppear_G3` 的 `BgPanel:scale`）。
        this.squishCell(view, MEOWDOKU_MARK_SQUISH_APPEAR_X, MEOWDOKU_MARK_SQUISH_APPEAR_Y);
        view.bars.forEach((_, index) => this.setBar(view, index, false, MEOWDOKU_MARK.barGrowFromRatio));
        this.scheduleOnce(() => this.growBar(view, 0, MEOWDOKU_TIMING.crossBar1Grow, token),
            MEOWDOKU_TIMING.crossBar1Delay);
        this.scheduleOnce(() => this.growBar(view, 1, MEOWDOKU_TIMING.crossBar2Grow, token),
            MEOWDOKU_TIMING.crossBar2Delay);
        view.crossRoot.setScale(0.4, 0.4, 1);
        this.scheduleOnce(() => {
            if (!view.crossRoot.isValid) return;
            tween(view.crossRoot)
                .to(
                    MEOWDOKU_TIMING.crossPopPeak - MEOWDOKU_TIMING.crossPopStart,
                    { scale: new Vec3(MEOWDOKU_TIMING.crossPopOvershoot, MEOWDOKU_TIMING.crossPopOvershoot, 1) },
                    { easing: 'quadOut' },
                )
                .to(
                    MEOWDOKU_TIMING.crossPopSettle - MEOWDOKU_TIMING.crossPopPeak,
                    { scale: new Vec3(1, 1, 1) },
                    { easing: 'quadIn' },
                )
                .start();
        }, MEOWDOKU_TIMING.crossPopStart);
    }

    private flashCell(view: MeowdokuCellView, duration: number): void {
        if (!view.glowRoot.isValid) return;
        view.glowRoot.active = true;
        view.glowRoot.setScale(0.5, 0.5, 1);
        view.glowOpacity.opacity = 235;
        Tween.stopAllByTarget(view.glowRoot);
        Tween.stopAllByTarget(view.glowOpacity);
        tween(view.glowOpacity)
            .to(duration * 0.25, { opacity: 220 })
            .to(duration * 0.75, { opacity: 0 })
            .call(() => { if (view.glowRoot.isValid) view.glowRoot.active = false; })
            .start();
        tween(view.glowRoot)
            .to(duration, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'quadOut' })
            .start();
    }

    /** 原作 `_play_screen_shake`：棋盘左右快速抖动。 */
    private playScreenShake(): void {
        const board = this.boardNode;
        if (!board?.isValid) return;
        const originX = this.requireLayout().boardX;
        Tween.stopAllByTarget(board);
        board.setPosition(originX, board.position.y, 0);
        const offsets = [8, -8, 5, -5];
        let chain = tween(board);
        offsets.forEach((offset, index) => {
            chain = chain.to(MEOWDOKU_TIMING.shakeSteps[index]!, {
                position: new Vec3(originX + offset, board.position.y, 0),
            });
        });
        chain.to(MEOWDOKU_TIMING.shakeSteps[4]!, {
            position: new Vec3(originX, board.position.y, 0),
        }).start();
    }

    /** 扣命时在格子里炸开两片碎心（原作 `cell.tscn` 的 Heart/Heart1）。 */
    /**
     * 错误格的「心碎」：原作 `cell.tscn` 的 `ErrorAppear_G3` 里 `Heart` 那一组轨道。
     * 两片碎片先拼在格子正中，0.359s 出现并淡入（到 0.684s 全亮），
     * 同时整体脉冲 1 → 1.83 → 1.67，0.688s 起各自旋转并水平分开，1.194s 缩到 0 消失。
     */
    private spawnBrokenHearts(x: number, y: number): void {
        const fx = this.fxNode;
        const frames = this.visuals?.frames;
        const layout = this.requireLayout();
        if (!fx?.isValid || !frames) return;
        const heart = MEOWDOKU_BROKEN_HEART;
        const pieces: readonly SpriteFrame[] = [
            frames.brokenHeart1 as SpriteFrame,
            frames.brokenHeart2 as SpriteFrame,
        ].filter((frame): frame is SpriteFrame => !!frame?.isValid);
        if (pieces.length === 0) return;

        // 两片放进一个容器：容器的脉冲（1 → 1.83 → 1.67 → 0）等价于原作 `Heart1:scale`。
        const root = new Node('BrokenHeart');
        root.layer = this.node.layer;
        root.setParent(fx);
        root.addComponent(UITransform).setContentSize(layout.cellFace, layout.cellFace);
        root.setPosition(x, y, 0);
        const rootOpacity = root.addComponent(UIOpacity);
        rootOpacity.opacity = 0;
        tween(rootOpacity)
            .delay(heart.appearAt)
            .to(heart.fadeIn, { opacity: 255 })
            .start();
        tween(root)
            .delay(heart.appearAt)
            .to(heart.pulsePeakAt, { scale: new Vec3(heart.pulsePeak, heart.pulsePeak, 1) }, { easing: 'quadOut' })
            .to(heart.pulseSettleAt, { scale: new Vec3(heart.pulseSettle, heart.pulseSettle, 1) }, { easing: 'quadInOut' })
            .to(heart.pulseEndAt, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' })
            .call(() => {
                if (root.isValid) this.destroyNode(root);
            })
            .start();

        pieces.forEach((frame, index) => {
            const offset = heart.pieceOffsets[index] ?? heart.pieceOffsets[0]!;
            const spread = heart.spreads[index] ?? 0;
            const tilt = heart.tilts[index] ?? 0;
            const piece = new Node('BrokenHeartPiece');
            piece.layer = this.node.layer;
            piece.setParent(root);
            piece.addComponent(UITransform).setContentSize(
                layout.cellFace * heart.pieceWidthRatio,
                layout.cellFace * heart.pieceHeightRatio,
            );
            piece.setPosition(
                offset[0]! * layout.cellFace,
                offset[1]! * layout.cellFace,
                0,
            );
            const sprite = piece.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            void sprite;
            // 裂开：水平外移 + 旋转（原作 0.688 → 1.232s）。
            tween(piece)
                .delay(heart.splitAt)
                .to(heart.splitDuration, {
                    position: new Vec3(
                        (offset[0]! + spread) * layout.cellFace,
                        offset[1]! * layout.cellFace,
                        0,
                    ),
                    angle: tilt,
                }, { easing: 'quadOut' })
                .start();
        });
    }

    /** 冲突连线：把点错的格子和挡住它的猫连起来（原作 `line_cross_connector`）。 */
    /**
     * 冲突连线（原作 `line_cross_connector.gd` + `conflict_line.tscn`）：
     * 一条贴图线 + `MidpointSlot`（中点光晕 + 红色叉），红叉 0.1667s 出现，
     * 缩放 0.4 → 1.05 → 1，结尾缩到 0.3；整条连线随冲突反应结束一起销毁。
     */
    private drawConflictLine(from: readonly [number, number], to: readonly [number, number]): void {
        const fx = this.fxNode;
        if (!fx?.isValid) return;
        const [fromX, fromY] = this.cellCenter(from[1], from[0]);
        const [toX, toY] = this.cellCenter(to[1], to[0]);
        const layout = this.requireLayout();
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const spec = MEOWDOKU_CONFLICT_LINE;

        const line = new Node('ConflictLine');
        line.layer = this.node.layer;
        line.setParent(fx);
        line.addComponent(UITransform).setContentSize(layout.boardSize, layout.boardSize);
        const graphics = line.addComponent(Graphics);
        graphics.strokeColor = MEOWDOKU_COLORS.conflict;
        graphics.lineWidth = Math.max(2, layout.cellFace * 0.06);
        graphics.moveTo(fromX, fromY);
        graphics.lineTo(toX, toY);
        graphics.stroke();
        const opacity = line.addComponent(UIOpacity);

        // 中点：光晕 + 红叉（原作 `z_index = 10`，压在连线上）。
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const glowFrame = this.visuals?.frames.glowSoft ?? this.visuals?.frames.glowRadial;
        if (glowFrame) {
            const glow = new Node('MidpointGlow');
            glow.layer = this.node.layer;
            glow.setParent(line);
            const size = Math.max(glowFrame.rect.width, glowFrame.rect.height)
                * spec.glowScale * spec.glowBaseScale * k;
            glow.addComponent(UITransform).setContentSize(size, size);
            glow.setPosition(midX, midY, 0);
            const sprite = glow.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = glowFrame;
            sprite.color = new Color(255, 120, 120, 255);
            const glowOpacity = glow.addComponent(UIOpacity);
            glowOpacity.opacity = 0;
            glow.setScale(0.0001, 0.0001, 1);
            tween(glowOpacity)
                .delay(spec.crossAppear)
                .to(spec.popUp, { opacity: 200 })
                .to(spec.popDown, { opacity: 255 })
                .delay(spec.shrinkAt - spec.crossAppear - spec.popUp - spec.popDown)
                .to(0.2, { opacity: 0 })
                .start();
            tween(glow)
                .delay(spec.crossAppear)
                .to(spec.popUp, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadOut' })
                .to(spec.popDown, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
                .delay(spec.shrinkAt - spec.crossAppear - spec.popUp - spec.popDown)
                .to(0.2, { scale: new Vec3(spec.shrinkScale, spec.shrinkScale, 1) })
                .start();
        }
        const barFrame = this.visuals?.frames.crossBar;
        if (barFrame) {
            const cross = new Node('MidpointCross');
            cross.layer = this.node.layer;
            cross.setParent(line);
            cross.addComponent(UITransform).setContentSize(spec.boxSize * k, spec.boxSize * k);
            cross.setPosition(midX, midY, 0);
            const crossOpacity = cross.addComponent(UIOpacity);
            crossOpacity.opacity = 0;
            cross.setScale(spec.popStart, spec.popStart, 1);
            [[-45, 0], [45, 0]].forEach(([angle]) => {
                const bar = new Node('Bar');
                bar.layer = this.node.layer;
                bar.setParent(cross);
                bar.addComponent(UITransform).setContentSize(
                    spec.boxSize * MEOWDOKU_MARK.barThicknessRatio * k,
                    spec.boxSize * MEOWDOKU_MARK.barLengthRatio * k,
                );
                bar.setPosition(0, 0, 0);
                bar.angle = angle;
                const sprite = bar.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = barFrame;
                sprite.color = spec.color;
            });
            tween(crossOpacity)
                .delay(spec.crossAppear)
                .to(0.0167, { opacity: 255 })
                .delay(spec.shrinkAt - spec.crossAppear)
                .to(0.2, { opacity: 0 })
                .start();
            tween(cross)
                .delay(spec.crossAppear)
                .to(spec.popUp, { scale: new Vec3(spec.popPeak, spec.popPeak, 1) }, { easing: 'quadOut' })
                .to(spec.popDown, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
                .delay(spec.shrinkAt - spec.crossAppear - spec.popUp - spec.popDown)
                .to(0.2, { scale: new Vec3(spec.shrinkScale, spec.shrinkScale, 1) })
                .start();
        }

        // 整条连线跟着冲突反应一起消失（原作在 1.25s 结束时空闲释放）。
        this.conflictLineNode = line;
        tween(opacity)
            .delay(MEOWDOKU_TIMING.conflictDuration - 0.15)
            .to(0.15, { opacity: 0 })
            .call(() => {
                if (line.isValid) this.destroyNode(line);
                if (this.conflictLineNode === line) this.conflictLineNode = undefined;
            })
            .start();
    }

    /**
     * 得分反馈（原作 `score_encourage = NON_ROUND` 默认档）：
     * 格子上弹出 Label 渲染的 `+N` 气泡（`Appear` 动画），随后沿三次贝塞尔飞向
     * HUD 分数并让分数滚动 0.35s；连击 ≥ 3 时在棋盘顶部弹出同档鼓励语。
     */
    private showScoreFeedback(row: number, col: number, gain: number, combo: number): void {
        const layout = this.requireLayout();
        const [localX, localY] = this.cellCenter(col, row);
        // 计分元素挂在页面层，需要把棋盘本地坐标换算成页面坐标。
        const x = layout.boardX + localX;
        const y = layout.boardY + localY;
        this.showScoreBubble(x, y, gain);
        // 原作 `_SE_FLY_DELAY = 0.8`：先让 +N 气泡唱完，再让金光飞向得分面板，
        // 到达后广播才把分数加上去（`_on_se_trail_arrived` → `update_se_score` + 弹一下）。
        const pending = this.model?.score ?? 0;
        this.pendingScore = pending;
        this.scheduleOnce(() => {
            if (this.state === 'disposed') return;
            this.flyScoreToHud(x, y, pending);
        }, MEOWDOKU_TIMING.scoreFlyDelay);
        if (combo >= 3) this.showEncourage(combo);
    }

    /** 用一个 Label 渲染完整 `+数字`，播 `Appear`（0.4 → 1.15 → 0.98 → 1）。 */
    private showScoreBubble(x: number, y: number, gain: number): void {
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        if (!layer?.isValid) return;

        const text = `+${Math.max(0, Math.floor(gain))}`;
        const fontSize = layout.cellFace * 0.52;
        // 预留粗字、描边与投影；峰值缩放时也完整落在屏幕左右边界内。
        const width = Math.min(layout.contentWidth / 1.15, fontSize * (text.length * 0.72 + 0.8));
        const height = fontSize * 1.5;

        const bubble = new Node('ScoreBubble');
        bubble.layer = this.node.layer;
        bubble.setParent(layer);
        bubble.addComponent(UITransform).setContentSize(width, height);
        this.createFeedbackText(bubble, text, width, height, fontSize, MEOWDOKU_FEEDBACK_TEXT.scoreColor);
        // 原作 get_score_bubble_y_offset 包含完整 BUBBLE_HEIGHT：顶边在格心上方
        // `50*boardScale + 10 + 83`，换成中心坐标是 `50*boardScale + 10 + 83/2`。
        // 漏掉完整高度会让飘字压在落猫格上。
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const halfWidth = layout.contentWidth / 2;
        const peakHalfWidth = width * 1.15 / 2;
        const centerX = clamp(x, -halfWidth + peakHalfWidth, halfWidth - peakHalfWidth);
        this.lastBubbleCenterX = centerX;
        const targetY = y + MEOWDOKU_CAT_TOP_UNSCALED * layout.cellScale
            + (MEOWDOKU_BUBBLE_GAP + MEOWDOKU_BUBBLE_HEIGHT / 2) * k;
        const peakHalfHeight = height * 1.15 / 2;
        bubble.setPosition(
            centerX,
            clamp(targetY, -layout.height / 2 + layout.safeBottom + peakHalfHeight,
                layout.height / 2 - layout.topInset - peakHalfHeight),
            0,
        );

        const opacity = bubble.addComponent(UIOpacity);
        opacity.opacity = 0;
        bubble.setScale(0.4, 0.4, 1);
        tween(bubble)
            .to(0.0833, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
            .to(0.15, { scale: new Vec3(0.98, 0.98, 1) }, { easing: 'quadIn' })
            .to(0.0833, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(opacity)
            .to(MEOWDOKU_TIMING.scoreBubbleFadeIn, { opacity: 255 })
            .delay(MEOWDOKU_TIMING.scoreBubbleFadeStart - MEOWDOKU_TIMING.scoreBubbleFadeIn)
            .to(
                MEOWDOKU_TIMING.scoreBubbleDuration - MEOWDOKU_TIMING.scoreBubbleFadeStart,
                { opacity: 0 },
            )
            .call(() => {
                if (bubble.isValid) this.destroyNode(bubble);
            })
            .start();
        this.feedbackNodes.add(bubble);
    }

    /**
     * 分数飞向 HUD。原作 `_se_fly_pos` 的曲线：
     * x 走 `cubic-bezier(0.2, 0, 0.8, 1)`，y 走 `cubic-bezier(0.5, -0.343, 1, 1)`。
     */
    /**
     * 原作「分数飞向得分面板」的金光（`combo_feedback_view.play_se_fly_effect` +
     * `effect_score_trail.tscn` / `effect_score_burst.tscn`）：
     *
     * - **轨迹**：`_se_fly_pos(t, from, to)`，x / y 各一条三次贝塞尔（y 的控制点为负，
     *   所以是「先上抛再落下」的弧线），时长 `_SE_FLY_DURATION = 0.57`。
     * - **拖尾**：`Line2D` 只保留目标路径最后 `fixed_trail_length = 120` 像素
     *   （`TrailGlow` 宽 120、`TrailAlp` / `TrailAdd` 宽 80），颜色从尾巴的透明淡黄
     *   渐变到头部的橙色（`Gradient_hy2kp` / `Gradient_5troy`）。这里按同一条贝塞尔曲线
     *   采样等价实现折线拖尾。
     * - **头部**：两枚旋转光点（`GlowAlp` / `GlowAdd`：0.5 缩放、0.8s 一圈）。
     * - **沿途**：小星点（`Stars`：life 0.35s、速度 ≤120、缩放 0.05~0.15）。
     * - **到达**：拖尾再停留 `_SE_TRAIL_LINGER = 0.067` 后释放，落点炸一圈
     *   `ScoreBurst`，然后分数滚动 0.35s 并把面板弹一下（1 → 1.2 → 1）。
     */
    private flyScoreToHud(fromX: number, fromY: number, pending: number): void {
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        const labelTransform = this.scoreLabel?.node?.getComponent(UITransform);
        const holderTransform = layer?.getComponent(UITransform);
        const trailFrame = this.visuals?.frames.trailGold;
        if (!layer?.isValid || !labelTransform || !holderTransform || !trailFrame) return;
        const world = labelTransform.convertToWorldSpaceAR(new Vec3(0, 0, 0));
        const local = holderTransform.convertToNodeSpaceAR(world);

        const fly = MEOWDOKU_SCORE_FLY;
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const duration = MEOWDOKU_TIMING.scoreFlyDuration;
        const footprint = fly.scale;
        const trailLength = fly.trailLength * k * footprint;
        const runId = this.levelRunId;
        // 曲线形状整段飞行都不变；均匀采样后逐帧只做线性插值。
        const pathSteps = 192;
        const pathX = new Float32Array(pathSteps + 1);
        const pathY = new Float32Array(pathSteps + 1);
        for (let index = 0; index <= pathSteps; index += 1) {
            const p = index / pathSteps;
            pathX[index] = lerp(fromX, local.x, cubicBezierEase(p, 0.2, 0, 0.8, 1));
            pathY[index] = lerp(fromY, local.y, cubicBezierEase(p, 0.5, -0.343, 1, 1));
        }
        const sampleInto = (t: number, out: { x: number; y: number }): void => {
            const scaled = clamp(t, 0, 1) * pathSteps;
            const index = Math.min(pathSteps - 1, Math.floor(scaled));
            const mix = scaled - index;
            out.x = lerp(pathX[index]!, pathX[index + 1]!, mix);
            out.y = lerp(pathY[index]!, pathY[index + 1]!, mix);
        };
        // 渐变查表：原作的 `Gradient_hy2kp` 停靠点（尾部透明淡黄 → 头部橙色）。
        const rampAt = (u: number): { color: Color; alpha: number } => {
            let prev = fly.ramp[0]!;
            for (const stop of fly.ramp) {
                if (u <= stop.at) {
                    const span = Math.max(1e-5, stop.at - prev.at);
                    const mix = clamp((u - prev.at) / span, 0, 1);
                    return {
                        color: new Color(
                            lerp(prev.color.r, stop.color.r, mix),
                            lerp(prev.color.g, stop.color.g, mix),
                            lerp(prev.color.b, stop.color.b, mix),
                            255,
                        ),
                        alpha: lerp(prev.alpha, stop.alpha, mix),
                    };
                }
                prev = stop;
            }
            const last = fly.ramp[fly.ramp.length - 1]!;
            return { color: last.color.clone(), alpha: last.alpha };
        };

        // 拖尾折线：`segments` 段 × 两层（宽光带 + 芯线），和原作的三条 Line2D 等价。
        interface Ribbon { node: Node; transform: UITransform; opacity: UIOpacity; alpha: number }
        const ribbon: Ribbon[] = [];
        const makeRibbon = (height: number, name: string, alphaScale: number): Ribbon[] => {
            const list: Ribbon[] = [];
            for (let index = 0; index < fly.segments; index += 1) {
                const node = new Node(name);
                node.layer = this.node.layer;
                node.setParent(layer);
                const transform = node.addComponent(UITransform);
                transform.setContentSize(trailLength, height);
                const sprite = node.addComponent(Sprite);
                sprite.type = Sprite.Type.TILED;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = trailFrame;
                const ramp = rampAt((index + 1) / fly.segments);
                sprite.color = ramp.color;
                const opacity = node.addComponent(UIOpacity);
                opacity.opacity = 0;
                list.push({ node, transform, opacity,
                    alpha: Math.round(255 * clamp(ramp.alpha, 0, 1) * alphaScale) });
            }
            return list;
        };
        const glowRibbon = makeRibbon(fly.glowWidth * k, 'ScoreFlyGlow', 0.55);
        const coreRibbon = makeRibbon(fly.coreWidth * k, 'ScoreFlyCore', 1);
        ribbon.push(...glowRibbon, ...coreRibbon);

        // 头部两枚旋转光点（`GlowAlp` / `GlowAdd`）。
        const headGlows: { node: Node; opacity: UIOpacity; spin: number }[] = [];
        const makeHeadGlow = (frame: SpriteFrame | undefined, tint: Color): void => {
            if (!frame) return;
            const node = new Node('ScoreFlyHead');
            node.layer = this.node.layer;
            node.setParent(layer);
            const size = Math.max(frame.rect.width, frame.rect.height) * fly.glowScale * k * footprint;
            node.addComponent(UITransform).setContentSize(size, size);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            sprite.color = tint.clone();
            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = 0;
            headGlows.push({ node, opacity, spin: 0 });
        };
        makeHeadGlow(this.visuals?.frames.starGold, fly.glowColorAlp);
        makeHeadGlow(this.visuals?.frames.starSpark, fly.glowColorAdd);

        const trailRoot = new Node('ScoreFlyTrail');
        trailRoot.layer = this.node.layer;
        trailRoot.setParent(layer);

        // 沿途小星点：原作是 `Stars` 粒子，这里按固定间隔在头部撒一颗并让它飘散。
        let lastStarP = -1;
        const starFrames = [this.visuals?.frames.starSpark, this.visuals?.frames.starGold];
        const emitStars = (x: number, y: number): void => {
            const frame = starFrames[Math.floor(Math.random() * starFrames.length)];
            if (!frame) return;
            const star = new Node('ScoreFlyStar');
            star.layer = this.node.layer;
            star.setParent(trailRoot);
            const size = Math.max(frame.rect.width, frame.rect.height)
                * lerp(fly.starScaleMin, fly.starScaleMax, Math.random()) * k * footprint;
            star.addComponent(UITransform).setContentSize(size, size);
            star.setPosition(x, y, 0);
            const sprite = star.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            const mix = Math.random();
            sprite.color = new Color(
                lerp(fly.glowColorAlp.r, fly.glowColorAdd.r, mix),
                lerp(fly.glowColorAlp.g, fly.glowColorAdd.g, mix),
                lerp(fly.glowColorAlp.b, fly.glowColorAdd.b, mix),
                255,
            );
            const angle = Math.random() * Math.PI * 2;
            const speed = fly.starSpeed * k * (0.35 + Math.random() * 0.65);
            const opacity = star.addComponent(UIOpacity);
            tween(star)
                .to(fly.starLife, {
                    position: new Vec3(
                        x + Math.cos(angle) * speed * fly.starLife,
                        y + Math.sin(angle) * speed * fly.starLife,
                        0,
                    ),
                    scale: new Vec3(0.3, 0.3, 1),
                }, { easing: 'quadOut' })
                .start();
            tween(opacity)
                .to(fly.starLife, { opacity: 0 })
                .call(() => {
                    if (star.isValid) this.destroyNode(star);
                })
                .start();
        };

        const pointX = new Float32Array(fly.backSamples + 1);
        const pointY = new Float32Array(fly.backSamples + 1);
        const distances = new Float32Array(fly.backSamples + 1);
        const head = { x: 0, y: 0 };
        const back = { x: 0, y: 0 };
        const from = { x: 0, y: 0, angle: 0 };
        const to = { x: 0, y: 0, angle: 0 };
        let pointCount = 0;
        let travelled = 0;
        const pointAt = (distance: number, out: { x: number; y: number; angle: number }): void => {
            const target = Math.min(distance, travelled);
            for (let index = 1; index < pointCount; index += 1) {
                if (target > distances[index]! && index < pointCount - 1) continue;
                const span = distances[index]! - distances[index - 1]!;
                const mix = span > 1e-4 ? clamp((target - distances[index - 1]!) / span, 0, 1) : 0;
                const ax = pointX[index - 1]!;
                const ay = pointY[index - 1]!;
                const bx = pointX[index]!;
                const by = pointY[index]!;
                out.x = lerp(ax, bx, mix);
                out.y = lerp(ay, by, mix);
                out.angle = Math.atan2(by - ay, bx - ax) * (180 / Math.PI);
                return;
            }
            out.x = pointX[pointCount - 1]!;
            out.y = pointY[pointCount - 1]!;
            out.angle = 0;
        };
        const updateRibbon = (list: Ribbon[], width: number): void => {
            if (travelled <= 1) {
                for (const entry of list) entry.opacity.opacity = 0;
                return;
            }
            const segmentLength = Math.max(1, travelled / fly.segments);
            for (let index = 0; index < list.length; index += 1) {
                const entry = list[index]!;
                if (!entry.node.isValid) continue;
                pointAt((index + 0.5) * segmentLength, from);
                pointAt(Math.min((index + 1.5) * segmentLength, travelled), to);
                const length = Math.max(1, Math.hypot(from.x - to.x, from.y - to.y) * 1.25);
                entry.node.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
                entry.node.angle = from.angle;
                entry.transform.setContentSize(length, width);
                entry.opacity.opacity = entry.alpha;
            }
        };
        const state = { t: 0 };
        tween(state)
            .to(duration, { t: 1 }, {
                easing: 'linear',
                onUpdate: (value) => {
                    if (!layer.isValid || runId !== this.levelRunId) return;
                    const p = clamp((value as { t: number }).t, 0, 1);
                    sampleInto(p, head);
                    // 头部光点：跟随 + 自转（原作 180°/s）。
                    for (const entry of headGlows) {
                        if (!entry.node.isValid) continue;
                        entry.spin = p * duration * fly.glowSpin;
                        entry.node.setPosition(head.x, head.y, 0);
                        entry.node.angle = entry.spin;
                        entry.opacity.opacity = 255;
                    }
                    // 沿途小星点（按飞行进度撒，和帧率无关）。
                    if (lastStarP < 0 || (p - lastStarP) * duration >= fly.starInterval) {
                        lastStarP = p;
                        emitStars(head.x, head.y);
                    }
                    // 拖尾：从头部往回量 `trailLength` 像素，得到折线采样点。
                    pointX[0] = head.x;
                    pointY[0] = head.y;
                    distances[0] = 0;
                    pointCount = 1;
                    travelled = 0;
                    let previousX = head.x;
                    let previousY = head.y;
                    const stepT = 1 / (fly.backSamples * 2);
                    for (let index = 1; index <= fly.backSamples && travelled < trailLength; index += 1) {
                        sampleInto(p - index * stepT, back);
                        travelled += Math.hypot(previousX - back.x, previousY - back.y);
                        previousX = back.x;
                        previousY = back.y;
                        pointX[index] = back.x;
                        pointY[index] = back.y;
                        distances[index] = travelled;
                        pointCount += 1;
                    }
                    updateRibbon(glowRibbon, fly.glowWidth * k * footprint);
                    updateRibbon(coreRibbon, fly.coreWidth * k * footprint);
                },
            })
            .call(() => {
                if (runId !== this.levelRunId || !layer.isValid) return;
                // 到达：拖尾再停留 `_SE_TRAIL_LINGER` 后释放，同时落点爆发。
                this.spawnScoreBurst(local.x, local.y);
                this.rollScore();
                this.bounceScoreValue();
                void pending;
                this.scheduleOnce(() => {
                    if (layer.isValid) this.destroyNode(trailRoot);
                    ribbon.forEach((entry) => {
                        if (entry.node.isValid) this.destroyNode(entry.node);
                    });
                    headGlows.forEach((entry) => {
                        if (entry.node.isValid) this.destroyNode(entry.node);
                    });
                }, fly.trailLinger);
            })
            .start();
    }

    /** 得分面板数值的弹跳（原作 `_play_se_score_bar_bounce`：1 → 1.2 → 1）。 */
    private bounceScoreValue(): void {
        const label = this.scoreLabel;
        if (!label?.isValid) return;
        const node = label.node;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(MEOWDOKU_TIMING.scoreBounceUp, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadInOut' })
            .to(MEOWDOKU_TIMING.scoreBounceDown, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
            .start();
    }

    /** 金光落点的小爆开（原作 `effect_score_burst`）。 */
    /**
     * 落点爆发（原作 `effect_score_burst.tscn`）：`GlowAlp` 一枚 + `StarAlp` / `StarAdd`
     * 各 12 粒（`explosiveness = 1.0`，life 1.02、速度 50~100、缩放 0.2~0.6）。
     */
    private spawnScoreBurst(x: number, y: number): void {
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        const fly = MEOWDOKU_SCORE_FLY;
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        if (!layer?.isValid) return;
        const glow = this.visuals?.frames.glowSoft;
        if (glow) {
            const node = new Node('ScoreBurstGlow');
            node.layer = this.node.layer;
            node.setParent(layer);
            const size = Math.max(glow.rect.width, glow.rect.height) * k * fly.scale;
            node.addComponent(UITransform).setContentSize(size, size);
            node.setPosition(x, y, 0);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = glow;
            sprite.color = new Color(255, 238, 153, 255);
            const opacity = node.addComponent(UIOpacity);
            tween(opacity)
                .to(0.3, { opacity: 0 })
                .call(() => {
                    if (node.isValid) this.destroyNode(node);
                })
                .start();
        }
        const variants: (SpriteFrame | undefined)[] = [
            this.visuals?.frames.starSpark,
            this.visuals?.frames.starGold,
        ];
        variants.forEach((frame, variant) => {
            if (!frame) return;
            for (let index = 0; index < fly.burstStars; index += 1) {
                const angle = (Math.PI * 2 * index) / fly.burstStars + variant * 0.26;
                const star = new Node('ScoreBurst');
                star.layer = this.node.layer;
                star.setParent(layer);
                const size = Math.max(frame.rect.width, frame.rect.height)
                    * lerp(0.2, 0.6, Math.random()) * k * fly.scale;
                star.addComponent(UITransform).setContentSize(size, size);
                star.setPosition(x, y, 0);
                const sprite = star.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = frame;
                sprite.color = variant === 0
                    ? new Color(255, 235, 51, 255)
                    : MEOWDOKU_COLORS.scoreGold;
                const speed = lerp(50, 100, Math.random()) * k;
                const opacity = star.addComponent(UIOpacity);
                tween(star)
                    .to(fly.burstLife, {
                        position: new Vec3(x + Math.cos(angle) * speed * fly.burstLife, y + Math.sin(angle) * speed * fly.burstLife, 0),
                        scale: new Vec3(0.3, 0.3, 1),
                    }, { easing: 'quadOut' })
                    .start();
                tween(opacity)
                    .delay(fly.burstLife * 0.4)
                    .to(fly.burstLife * 0.6, { opacity: 0 })
                    .call(() => {
                        if (star.isValid) this.destroyNode(star);
                    })
                    .start();
            }
        });
    }

    /** HUD 分数滚动（原作 `RollingNumber.roll(..., 0.35, Quad/EASE_OUT)`）。 */
    private rollScore(): void {
        const model = this.model;
        const label = this.scoreLabel;
        if (!model || !label?.isValid) return;
        const from = this.displayedScore;
        const to = this.pendingScore ?? model.score;
        if (from === to) {
            label.string = `${to}`;
            return;
        }
        const runId = this.levelRunId;
        const state = { value: from };
        tween(state)
            .to(MEOWDOKU_TIMING.scoreRollDuration, { value: to }, {
                easing: 'quadOut',
                onUpdate: (value) => {
                    if (!label.isValid || runId !== this.levelRunId) return;
                    const current = Math.round((value as { value: number }).value);
                    label.string = `${current}`;
                },
            })
            .call(() => {
                if (label.isValid && runId === this.levelRunId) label.string = `${to}`;
            })
            .start();
        this.displayedScore = to;
    }

    /**
     * 连击鼓励语（原作 `ComboFeedbackView._show_encourage_fixed` + `level_encourage.tscn`）：
     *
     * - 位置：屏幕水平中心、`board_top_y * 0.5 + 11`（以页面顶为基准的 y 向下坐标），
     *   也就是棋盘顶部再往上一点的地方；
     * - Label 与 9 档配音对应，Breathtaking 之后循环回 Nice；
     * - 出场缩放 0.508 → 1.61 → 1.05 → 1.2（0.5s），到 1.0167s 直接销毁（原作不淡出）；
     * - 配音是**同一档**的 `combo_voice`，文字和声音始终对应，且每关按 combo 重新算。
     */
    private showEncourage(combo: number): void {
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        if (!layer?.isValid) return;
        if (this.encourageNode?.isValid) this.destroyNode(this.encourageNode);
        // 3 连击 = Nice，11 连击 = Breathtaking，12 连击开始下一轮。
        const count = MEOWDOKU_ENCOURAGEMENTS.length;
        const level = (((combo - 3) % count) + count) % count;
        const feedback = MEOWDOKU_ENCOURAGEMENTS[level]!;
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const style = MEOWDOKU_FEEDBACK_TEXT;
        const fontSize = style.encourageFontSize * k;
        const width = Math.min(layout.contentWidth / style.encouragePeakScale - 24 * k,
            fontSize * (feedback.text.length * 0.72 + 0.8));
        const height = fontSize * 1.5;
        const boardTop = layout.boardY + layout.boardSize / 2;
        const node = new Node('Encourage');
        node.layer = this.node.layer;
        node.setParent(layer);
        node.addComponent(UITransform).setContentSize(width, height);
        this.createFeedbackText(node, feedback.text, width, height, fontSize, feedback.color);
        // 位置：屏幕水平中心、贴着棋盘顶部（再往上 10 设计像素）。
        const peakHalfHeight = height * style.encouragePeakScale / 2;
        node.setPosition(0, clamp(boardTop + 10 * k,
            -layout.height / 2 + layout.safeBottom + peakHalfHeight,
            layout.height / 2 - layout.topInset - peakHalfHeight), 0);
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).to(0.05, { opacity: 255 }).start();
        // 原作 `EncourageImage.scale`：0.508 → 1.61 → 1.05 → 1.2。
        node.setScale(0.508, 0.508, 1);
        tween(node)
            .to(0.083, { scale: new Vec3(style.encouragePeakScale, style.encouragePeakScale, 1) }, { easing: 'quadOut' })
            .to(0.15, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadIn' })
            .to(0.267, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' })
            .delay(1.0167 - 0.5)
            .call(() => {
                if (node.isValid) this.destroyNode(node);
                if (this.encourageNode === node) this.encourageNode = undefined;
            })
            .start();
        this.encourageNode = node;
        this.feedbackNodes.add(node);
        this.context?.services.feedback.play(feedback.voice);
    }

    /**
     * 规则高亮（原作 `_play_rule_highlight`）：`alpha = 0.4 + 0.6 * sin(t * PI)`，
     * 周期 `RULE_HL_PERIOD = 0.6`，循环 2 次。
     */
    private playRuleHighlight(ruleIndex: number): void {
        const entry = this.ruleHighlightNodes[ruleIndex - 1];
        if (!entry?.node.isValid) return;
        const runId = this.levelRunId;
        Tween.stopAllByTarget(entry.opacity);
        entry.opacity.opacity = Math.round(255 * MEOWDOKU_RULE_HIGHLIGHT.floor);
        // 用一条总时长为 `period * breaths` 的补间自己算相位：保证**正好呼吸 `breaths` 次**，
        // 也不受 `union()/repeat()` 在不同版本行为差异的影响。
        const spec = MEOWDOKU_RULE_HIGHLIGHT;
        const total = spec.period * spec.breaths;
        const state = { t: 0 };
        tween(state)
            .to(total, { t: 1 }, {
                easing: 'linear',
                onUpdate: (value) => {
                    if (!entry.node.isValid || runId !== this.levelRunId) return;
                    const progress = clamp((value as { t: number }).t, 0, 1);
                    const local = (progress * spec.breaths) % 1;
                    const phase = Math.sin(local * Math.PI);
                    entry.opacity.opacity = Math.round(
                        255 * (spec.floor + (1 - spec.floor) * phase),
                    );
                    // 底板一起变亮（原作规则条没有不透明底板，光才看得见；我们有底板，
                    // 所以把底板颜色一起往高亮色插值）。
                    const pill = this.rulePillGraphics[ruleIndex - 1];
                    if (pill?.graphics.isValid) {
                        const base = MEOWDOKU_COLORS.rulePill;
                        const glow = MEOWDOKU_COLORS.rulePillGlow;
                        this.drawRoundedRect(
                            pill.graphics,
                            pill.width,
                            pill.height,
                            pill.corner,
                            new Color(
                                lerp(base.r, glow.r, phase),
                                lerp(base.g, glow.g, phase),
                                lerp(base.b, glow.b, phase),
                                255,
                            ),
                        );
                    }
                },
            })
            .call(() => {
                if (runId !== this.levelRunId) return;
                if (entry.node.isValid) entry.opacity.opacity = 0;
                const pill = this.rulePillGraphics[ruleIndex - 1];
                if (pill?.graphics.isValid) {
                    this.drawRoundedRect(
                        pill.graphics,
                        pill.width,
                        pill.height,
                        pill.corner,
                        MEOWDOKU_COLORS.rulePill,
                    );
                }
            })
            .start();
    }

    /** 判断这次错选踩到了哪条常驻规则（1 同色 / 2 同行列 / 3 不能相邻）。 */
    private violatedRuleIndex(
        row: number,
        col: number,
        conflict: readonly [number, number],
    ): number {
        const regions = this.model?.board.regions;
        if (!regions) return 0;
        if (regions[row]![col] === regions[conflict[0]]![conflict[1]]) return 1;
        if (conflict[0] === row || conflict[1] === col) return 2;
        return 3;
    }

    /**
     * 失败弹窗猫下面那句：原作 `FailTextStats.pick_encourage_text(found_ratio)` ——
     * 按「已找到猫咪数 / 猫咪总数」分三档（>0.8 HIGH、>=0.2 MID、否则 LOW），每档 4 条随机。
     */
    private pickFailEncourage(model: MeowdokuModel | undefined): string {
        if (!model) return MEOWDOKU_COPY.failEncourageLow[0]!;
        const total = model.size;
        const ratio = total <= 0 ? 0 : model.placedCount / total;
        const spec = MEOWDOKU_RESULT_PAGE;
        const pool = ratio > spec.highRatio
            ? MEOWDOKU_COPY.failEncourageHigh
            : ratio >= spec.midRatio
                ? MEOWDOKU_COPY.failEncourageMid
                : MEOWDOKU_COPY.failEncourageLow;
        return pool[Math.floor(Math.random() * pool.length)] ?? '';
    }

    private spawnStarBurst(x: number, y: number): void {
        const fx = this.fxNode;
        const frame = this.visuals?.frames.star;
        const layout = this.requireLayout();
        if (!fx?.isValid || !frame) return;
        const radius = layout.cellFace * 0.9;
        const starSize = layout.cellFace * 0.42;
        for (let index = 0; index < CAT_STAR_COUNT; index += 1) {
            const star = new Node(`Star${index}`);
            star.layer = this.node.layer;
            star.setParent(fx);
            star.addComponent(UITransform).setContentSize(starSize, starSize);
            star.setPosition(x, y, 0);
            const sprite = star.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            const opacity = star.addComponent(UIOpacity);
            const angle = (Math.PI * 2 * index) / CAT_STAR_COUNT + (Math.random() - 0.5) * 0.5;
            const distance = radius * (0.7 + Math.random() * 0.5);
            star.angle = Math.random() * 360;
            tween(star)
                .to(0.5, {
                    position: new Vec3(
                        x + Math.cos(angle) * distance,
                        y + Math.sin(angle) * distance,
                        0,
                    ),
                    scale: new Vec3(0.25, 0.25, 1),
                }, { easing: 'quadOut' })
                .call(() => {
                    if (star.isValid) this.destroyNode(star);
                })
                .start();
            tween(opacity)
                .delay(0.12)
                .to(0.38, { opacity: 0 })
                .start();
        }
    }

    /**
     * 「点赞手势」：原作 `_decide_like_hand_for_correct_cat(PLAYER_DOUBLE_TAP)`。
     * 只有 6..12 的棋盘有节奏配置，且不是本局第一只猫、间隔够长、次数没超。
     */
    private maybePlayLikeHand(row: number, col: number, fromPlayerPlacement: boolean): void {
        const model = this.model;
        if (!model || !fromPlayerPlacement) return;
        const cadence = MEOWDOKU_LIKE_HAND.cadenceBySize[model.size as 6];
        if (!cadence) return;
        if (!this.likeHandState.hasSeenFirstCat) return;
        if (this.likeHandState.triggered >= cadence.maxTriggers) return;
        const moment = model.elapsedSeconds;
        if (moment - this.likeHandState.lastCatAt < cadence.minInterval) return;
        const frame = this.visuals?.frames.likeHand;
        const layer = this.scoreLayer;
        const layout = this.requireLayout();
        if (!frame || !layer?.isValid) return;
        const [localX, localY] = this.cellCenter(col, row);
        // 挂在页面层，保证手势盖在猫咪上面（原作 z_index 41，高于棋盘）。
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        // 原作先让手势跟着被钳过的气泡 x 走，没有气泡时才自己贴边留白。
        const halfWidth = layout.contentWidth / 2;
        const margin = MEOWDOKU_LIKE_HAND.edgeMarginDesign * k;
        const rawX = layout.boardX + localX;
        const suggestedX = this.lastBubbleCenterX !== undefined
            ? this.lastBubbleCenterX
            : clamp(rawX, -halfWidth + margin, halfWidth - margin);
        const size = MEOWDOKU_LIKE_HAND.designSize * k;
        const source = frame.originalSize;
        const fit = size / Math.max(1, source.width, source.height);
        const width = source.width * fit;
        const height = source.height * fit;
        // 用图片对角线覆盖旋转和缩放峰值，整段动作保持在完整屏幕宽度及上下安全区内。
        const peakHalf = Math.hypot(width, height) * MEOWDOKU_LIKE_HAND.peakScale / 2;
        const lift = MEOWDOKU_LIKE_HAND.liftDesign * k;
        const x = clamp(suggestedX, -layout.width / 2 + peakHalf, layout.width / 2 - peakHalf);
        const bubbleCenterY = layout.boardY + localY + MEOWDOKU_CAT_TOP_UNSCALED * layout.cellScale
            + (MEOWDOKU_BUBBLE_GAP + MEOWDOKU_BUBBLE_HEIGHT / 2) * k;
        const suggestedY = bubbleCenterY + layout.cellFace * 0.52 * 1.15 / 2
            + MEOWDOKU_LIKE_HAND.bubbleGapDesign * k + height / 2;
        const y = clamp(suggestedY, -layout.height / 2 + layout.safeBottom + peakHalf,
            layout.height / 2 - layout.topInset - peakHalf - lift * 1.3);
        const node = new Node('LikeHand');
        node.layer = this.node.layer;
        node.setParent(layer);
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.angle = -16;
        node.setScale(0.72, 0.72, 1);
        this.feedbackNodes.add(node);
        const timing = MEOWDOKU_LIKE_HAND;
        tween(node)
            .to(timing.popIn, { scale: new Vec3(timing.peakScale, timing.peakScale, 1),
                angle: 8, position: new Vec3(x, y + lift, 0) }, { easing: 'quadOut' })
            .to(timing.nod, { scale: new Vec3(0.96, 0.96, 1), angle: -6 }, { easing: 'sineInOut' })
            .to(timing.settle, { scale: new Vec3(1, 1, 1), angle: 0 }, { easing: 'sineOut' })
            .delay(timing.hold)
            .to(timing.fadeOut, { scale: new Vec3(0.86, 0.86, 1), position: new Vec3(x, y + lift * 1.3, 0) },
                { easing: 'sineIn' })
            .call(() => this.destroyNode(node))
            .start();
        tween(opacity)
            .to(timing.popIn, { opacity: 255 })
            .delay(timing.nod + timing.settle + timing.hold)
            .to(timing.fadeOut, { opacity: 0 })
            .start();
        this.likeHandState.triggered += 1;
    }

    /**
     * 第一关引导：原作 `tutorial_page` 会在第一关用几步文字 + 高亮带玩家上手。
     * 这里按同样的顺序做三步：双击或长按放猫 → 点击打叉 → 猫咪不能相邻；
     * 玩家做出对应操作后自动推进，随时可以「跳过」。
     */
    /**
     * 新手引导：原作 `tutorial_page.gd` 的默认七步流程。
     *
     * 演示盘**直接用游戏自己的棋盘**：把原作 SP 题库里 `pattern == "guide"` 那一关
     * （4×4、解位 `[2,0,3,1]`、配色 `[8,4,10,1]`）装进真实棋盘，这样渲染、命中、层级、
     * 猫的出场/待机动效和正式关卡完全一致（之前自己画盘会出现模糊、黑线、层级和点不中）。
     */
    private startTutorial(): void {
        const model = this.model;
        if (!model || model.level !== 1) return;
        this.destroyTutorial();
        this.clearHint();
        const visuals = this.visuals;
        if (!visuals) return;
        try {
            // 1) 把引导关卡装进真实棋盘
            this.tutorialLevelBackup = this.levelIndex;
            const guide: MeowdokuLevelBoard = Object.freeze({
                level: 1,
                size: MEOWDOKU_TUTORIAL_BOARD.size,
                rank: 0,
                regions: MEOWDOKU_TUTORIAL_BOARD.regions,
                solution: MEOWDOKU_TUTORIAL_BOARD.solution,
                colorMap: MEOWDOKU_TUTORIAL_BOARD.colorMap,
                prefill: Object.freeze([] as (readonly [number, number])[]),
            });
            this.levelIndex = 0;
            this.preCatCell = undefined;
            this.board = guide;
            this.model = MeowdokuModel.fromLevel(guide, MEOWDOKU_DEFAULT_LIVES);
            this.stepsUsed = 0;
            this.fullMarkFired = new Set<string>();
            this.perfectMarkFired = false;
            // 引导页的棋盘**不播入场动画**：引导本身就有高亮/演示，逐格入场只会抢节奏、
            // 还会让小手和格子错位。这里只对这一层重排生效。
            this.suppressBoardIntro = true;
            this.rebuildPage();
            this.suppressBoardIntro = false;
            this.syncToolButtons();
            // 装完引导盘、页面重排之后**重新取一次**布局，保证洞 / 边框 / 小手和棋盘对齐。
            const layout = this.requireLayout();

            // 2) 引导界面层
            this.tutorial = new MeowdokuTutorial({
                root: this.node,
                width: layout.width,
                height: layout.height,
                safeTopY: layout.height / 2 - layout.topInset,
                safeBottomY: -layout.height / 2 + layout.safeBottom,
                k: MEOWDOKU_SOURCE_SCALE * layout.fitScale,
                boardX: layout.boardX,
                boardY: layout.boardY,
                boardSize: layout.boardSize,
                cellFace: layout.cellFace,
                frames: {
                    panelBg: visuals.frames.panelBg,
                    promptFrame: visuals.frames.promptFrame,
                    guideHand: visuals.frames.guideHand,
                },
                placeCat: (row, col) => {
                    if (this.model?.placeCat(row, col) === 'placed') {
                        this.placeCatAt(row, col, true, true);
                    }
                },
                markCell: (row, col) => {
                    this.applyMark(row, col, true, true);
                },
                cellStateAt: (row, col) => this.model?.getCell(row, col) ?? 'empty',
                // 用游戏自己的格子中心（含 cellPadding 与槽位 origin 偏移），保证洞/边框/小手
                // 和棋盘严格对齐。
                cellCenter: (col, row) => {
                    const current = this.requireLayout();
                    const [x, y] = this.cellCenter(col, row);
                    return Object.freeze([current.boardX + x, current.boardY + y] as const);
                },
                finish: () => this.finishTutorial(),
                skip: () => this.finishTutorial(),
            });
            this.setGameChromeVisible(false);
            this.inputLocked = true;
        } catch (error: unknown) {
            // TODO: console.warn('[MeowdokuGame] Tutorial failed to start; skipping it.', error);
            this.tutorial = undefined;
            this.inputLocked = false;
        }
    }

    /**
     * 引导进行中时，棋盘点击转给引导页处理（只接受当前步骤允许的格子）。
     * 「放猫」的步骤（含最后自由放猫）接受双击或长按。
     */
    private routeTutorialTap(row: number, col: number, placesCat: boolean): boolean {
        const tutorial = this.tutorial;
        if (!tutorial) return false;
        tutorial.handleTap(row, col, placesCat);
        return true;
    }

    /**
     * 引导期间隐藏游戏页面自身的元素（HUD / 状态行 / 规则条 / 道具行 / 提示条 / Toast）：
     * 原作引导是独立一整页，背后没有这些东西。
     */
    /** 引导结束 / 跳过：回到引导前的关卡（那次重开不再弹引导）。 */
    private finishTutorial(): void {
        // 跳过按钮会同时收到触摸和浏览器补发的合成鼠标事件 → 这里会被调用两次，
        // 第二次又把关卡重开一遍（表现就是「跳过后棋盘又初始化一次」）。加个一次性闸门。
        if (this.tutorialFinishing) return;
        this.tutorialFinishing = true;
        // 引导自己会把关卡重新开一次，压掉那一次的引导。
        this.tutorialSuppressNext = true;
        this.clearHint();
        this.destroyTutorial();
        const index = this.tutorialLevelBackup ?? 0;
        this.tutorialLevelBackup = undefined;
        // 推迟一帧再恢复页面元素并重开关卡：跳过/开始按钮这一按会先派发触摸事件，
        // 紧接着浏览器还会补一个合成鼠标事件，如果立刻恢复 HUD，那个鼠标事件会打到
        // 右上角的暂停按钮上（表现就是「点跳过弹出暂停弹窗」）。
        // 这一按会先派发触摸、紧接着浏览器再补一个合成鼠标事件：先锁住输入一小会，
        // 让那个补发的事件落空（否则会打到刚恢复的暂停按钮 / 道具按钮上）。
        this.inputLocked = true;
        this.scheduleOnce(() => {
            this.tutorialFinishing = false;
            // 这一帧里玩家已经去了选关页（或页面已销毁）：不再替他开第一关。
            if (this.state !== 'playing') return;
            this.setGameChromeVisible(true);
            // 引导结束才真正初始化第一关（这是这一关唯一一次建盘，入场动画/音效正常播）。
            this.startLevel(index, undefined, undefined, true);
            this.scheduleOnce(() => {
                this.inputLocked = false;
            }, 0.25);
        }, 0);
    }


    private setGameChromeVisible(visible: boolean): void {
        // 常驻元素直接跟随引导显隐。
        const names = ['Hud', 'StatusRow', 'RuleBar', 'ToolsRow'];
        for (const name of names) {
            const node = this.node.getChildByName(name);
            if (node?.isValid) node.active = visible;
        }
        // 提示条和 Toast 的显隐由各自的状态驱动（有提示 / 正在播 Toast 才显示），
        // 恢复页面时不能一律打开；进入引导时则连同状态一起收起。
        if (visible) return;
        this.clearHint();
        const toast = this.toastNode;
        if (this.toastOpacity) Tween.stopAllByTarget(this.toastOpacity);
        if (toast?.isValid) toast.active = false;
    }

    private destroyTutorial(): void {
        this.setGameChromeVisible(true);
        const tutorial = this.tutorial;
        this.tutorial = undefined;
        if (tutorial) tutorial.dispose();
        const overlay = this.tutorialNode;
        this.tutorialNode = undefined;
        if (overlay?.isValid) this.destroyNode(overlay);
        const ring = this.tutorialRingNode;
        this.tutorialRingNode = undefined;
        if (ring?.isValid) this.destroyNode(ring);
    }

    private playPreCatReveal(cell: readonly [number, number]): void {
        const view = this.cellViewAt(cell[0], cell[1]);
        if (!view) return;
        const frames = this.visuals?.frames;
        const layout = this.requireLayout();
        const fx = this.fxNode;
        if (fx?.isValid && frames?.paw) {
            const [x, y] = this.cellCenter(cell[1], cell[0]);
            const paw = new Node('PreCatPaw');
            paw.layer = this.node.layer;
            paw.setParent(fx);
            paw.addComponent(UITransform).setContentSize(layout.cellFace * 0.9, layout.cellFace);
            paw.setPosition(x, y, 0);
            const sprite = paw.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frames.paw;
            const opacity = paw.addComponent(UIOpacity);
            opacity.opacity = 0;
            paw.setScale(0.5, 0.5, 1);
            tween(paw)
                .delay(0.0167)
                .to(0.0833, { scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadOut' })
                .to(0.1333, { scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadOut' })
                .start();
            tween(opacity)
                .delay(0.0167)
                .to(0.0833, { opacity: 255 })
                .delay(0.1667)
                .to(0.15, { opacity: 0 })
                .call(() => {
                    if (paw.isValid) this.destroyNode(paw);
                })
                .start();
        }
        // 原作 `PreCat` 只挤压 y 轴：1 → 0.8 → 1.05 → 0.95 → 1。
        this.squishCell(
            view,
            [[0.45, 1]],
            [[0.067, 0.8], [0.167, 1.05], [0.3, 0.95], [0.45, 1]],
        );
        this.scheduleOnce(() => {
            if (this.state === 'disposed' || !view.catRoot.isValid) return;
            this.startCatAnimation(view, true);
        }, MEOWDOKU_TIMING.preCatPaw * 0.6);
    }

    // ---------------------------------------------------------------- 输入

    private boardTouchNode?: Node;

    private attachBoardInput(): void {
        const board = this.boardNode;
        if (!board?.isValid) return;
        // 重建页面时这里会被再调一次，先解绑保证监听只有一份。
        if (this.boardTouchNode && this.boardTouchNode !== board) this.detachBoardInput();
        this.boardTouchNode = board;
        board.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        board.on(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        board.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        board.on(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
    }

    private detachBoardInput(): void {
        const board = this.boardTouchNode;
        if (board?.isValid) {
            board.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
            board.off(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
            board.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
            board.off(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        }
        this.boardTouchNode = undefined;
        this.resetBoardGesture();
    }

    private canHandleBoardInput(): boolean {
        // 引导进行中：棋盘输入要放行（引导只认当前步骤允许的格子），
        // 否则 `inputLocked` 会把棋盘点不动。
        return this.state === 'playing'
            && (!!this.tutorial || (!this.inputLocked && !this.activeHint && !this.toolAdPending));
    }

    private readonly handleTouchStart = (event: EventTouch): void => {
        if (!this.canHandleBoardInput() || this.boardPress) return;
        const cell = this.resolveTouchCell(event);
        if (!cell) return;
        const [row, col] = cell;
        const press = {
            id: event.getID(), row, col, start: event.getUILocation(), catAction: false, dragging: false,
        };
        this.boardPress = press;
        this.dragRow = row;
        this.dragCol = col;
        if (this.tutorial) {
            this.dragMode = 'none';
        } else {
            const model = this.model;
            const before = this.draftMode
                ? (model?.getCell(row, col) === 'empty' ? (model.getDraft(row, col) ?? 'empty') : 'cat')
                : model?.getCell(row, col);
            // 涂抹方向由起手格的“点击前”状态决定；从猫身上起手不参与涂抹。
            this.dragMode = before === 'cat' || before === 'error' || before === undefined
                ? 'none'
                : (before === 'mark' ? 'unmark' : 'mark');
        }
        press.catAction = this.beginCellTap(row, col);
        if (press.catAction) this.dragMode = 'none';
        else if (this.boardPress === press && (!this.tutorial || this.tutorial.acceptsCatPlacement)) {
            this.startLongPress();
        }
    };

    private readonly handleTouchMove = (event: EventTouch): void => {
        const press = this.boardPress;
        if (!press || event.getID() !== press.id || press.catAction) return;
        if (!this.canHandleBoardInput()) {
            this.resetBoardGesture();
            return;
        }
        const cell = this.resolveTouchCell(event);
        const location = event.getUILocation();
        // 位移以适配后的 UI 坐标计算；越格、移出棋盘或明显拖动都会取消本次长按。
        if (!cell || cell[0] !== press.row || cell[1] !== press.col
            || Math.hypot(location.x - press.start.x, location.y - press.start.y)
                > MEOWDOKU_TIMING.longPressMoveTolerance) {
            this.stopLongPress();
            this.stopDoubleTapWindow();
            this.lastTapRow = -1;
            this.lastTapCol = -1;
            if (!press.dragging) {
                press.dragging = true;
                // 确认开始划涂后才处理起手格，避免长按等候期间提前打叉。
                if (this.tutorial) this.tutorial.handlePaint(press.row, press.col);
                else if (this.dragMode !== 'none') this.handleSingleTap(press.row, press.col);
            }
        }
        if (!cell) return;
        const [row, col] = cell;
        if (this.tutorial) {
            if (row === this.dragRow && col === this.dragCol) return;
            this.tutorial.handlePaint(row, col);
            this.dragRow = row;
            this.dragCol = col;
            return;
        }
        if (this.dragMode === 'none') return;
        if (row === this.dragRow && col === this.dragCol) return;
        const model = this.model;
        if (!model) return;
        this.paintLine(this.dragRow, this.dragCol, row, col, this.dragMode === 'mark');
        this.stopDoubleTapWindow();
        this.lastTapRow = -1;
        this.lastTapCol = -1;
        this.dragRow = row;
        this.dragCol = col;
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        const press = this.boardPress;
        if (!press || event.getID() !== press.id) return;
        this.stopLongPress();
        this.boardPress = undefined;
        this.dragMode = 'none';
        // 短按只在原格松手时生效；长按和划涂已经消费本次触摸。
        if (!press.catAction && !press.dragging) {
            const cell = this.resolveTouchCell(event);
            const location = event.getUILocation();
            if (this.canHandleBoardInput() && cell?.[0] === press.row && cell[1] === press.col
                && Math.hypot(location.x - press.start.x, location.y - press.start.y)
                    <= MEOWDOKU_TIMING.longPressMoveTolerance) {
                const awaitingDoubleTap = this.lastTapRow === press.row && this.lastTapCol === press.col
                    && Date.now() - this.lastTapAt <= MEOWDOKU_TIMING.doubleTapWindow * 1000;
                this.handleSingleTap(press.row, press.col, awaitingDoubleTap);
            } else {
                this.stopDoubleTapWindow();
                this.lastTapRow = -1;
                this.lastTapCol = -1;
            }
        }
        if (this.dragSaveDirty) this.persistProgress();
    };

    private readonly handleTouchCancel = (event: EventTouch): void => {
        if (!this.boardPress || event.getID() !== this.boardPress.id) return;
        this.resetBoardGesture();
        if (this.dragSaveDirty) this.persistProgress();
    };

    private startLongPress(): void {
        this.stopLongPress();
        const press = this.boardPress;
        if (!press) return;
        this.longPressCallback = () => {
            this.longPressCallback = undefined;
            if (this.boardPress !== press || press.catAction || !this.canHandleBoardInput()) return;
            // 先消费手势再落猫，持续按住和随后的移动 / 松手都不能重复触发。
            press.catAction = true;
            this.dragMode = 'none';
            this.stopDoubleTapWindow();
            this.lastTapRow = -1;
            this.lastTapCol = -1;
            this.handleFindCat(press.row, press.col);
        };
        this.scheduleOnce(this.longPressCallback, MEOWDOKU_TIMING.longPressDuration);
    }

    private stopLongPress(): void {
        if (!this.longPressCallback) return;
        this.unschedule(this.longPressCallback);
        this.longPressCallback = undefined;
    }

    private paintLine(
        fromRow: number,
        fromCol: number,
        toRow: number,
        toCol: number,
        paintMark: boolean,
    ): void {
        const steps = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
        if (this.draftMode) {
            for (let step = 1; step <= steps; step += 1) {
                const row = fromRow + Math.round((toRow - fromRow) * step / steps);
                const col = fromCol + Math.round((toCol - fromCol) * step / steps);
                if (this.model?.getDraft(row, col) === 'cat') continue;
                if (this.model?.setDraft(row, col, paintMark ? 'mark' : undefined)) {
                    this.updateDraftMark(row, col);
                }
            }
            return;
        }
        let changed = false;
        for (let step = 1; step <= steps; step += 1) {
            const row = fromRow + Math.round((toRow - fromRow) * step / steps);
            const col = fromCol + Math.round((toCol - fromCol) * step / steps);
            // 拖动经过的每一格都要播出现/消失动画，和原作逐格落笔一致。
            if (this.applyMark(row, col, paintMark, true)) changed = true;
        }
        if (!changed) return;
        this.playMarkCue(paintMark);
        this.dragSaveDirty = true;
    }

    /**
     * 原作 `CellView._emit_state_sound`：音效只看格子的状态变化——空 → 叉播 `MARK_X`，
     * 叉 → 空播 `UNMARK_X`，和操作方式（点击 / 划涂 / 提示）无关。
     */
    private playMarkCue(marked: boolean): void {
        this.context?.services.feedback.play(marked ? 'toggle' : 'drop');
    }

    private applyMark(row: number, col: number, marked: boolean, animated: boolean,
        origin: MeowdokuMarkOrigin = 'manual'): boolean {
        const model = this.model;
        if (!model) return false;
        const change = model.setMark(row, col, marked, origin);
        if (!change) return false;
        this.applyChange(change, animated);
        return true;
    }

    private resolveTouchCell(event: EventTouch): readonly [number, number] | undefined {
        const board = this.boardNode;
        const model = this.model;
        const layout = this.layout;
        if (!board?.isValid || !model || !layout) return undefined;
        const transform = board.getComponent(UITransform);
        if (!transform) return undefined;
        // getUILocation 是适配后的 UI 坐标，不能直接当作场景世界坐标。
        // 使用实际渲染棋盘的 Canvas 相机，和 Cocos UITransform.hitTest 的换算一致：
        // 屏幕触点 → 相机世界坐标 → 棋盘本地坐标，包含 Fit Width、视口与像素密度。
        let ancestor: Node | null = board;
        let camera: Camera | null = null;
        while (ancestor) {
            const candidate = ancestor.getComponent(Canvas)?.cameraComponent;
            if (candidate?.isValid && candidate.enabledInHierarchy && (candidate.visibility & board.layer)) {
                camera = candidate;
                break;
            }
            ancestor = ancestor.parent;
        }
        if (!camera) return undefined;
        const location = event.getLocation();
        const world = camera.screenToWorld(new Vec3(location.x, location.y, 0));
        const local = transform.convertToNodeSpaceAR(world);
        const half = layout.boardSize / 2;
        // 原作 `BoardView.pointer_to_cell`：整条槽位都算命中，棋盘内边距是死区。
        const col = Math.floor((local.x + half - layout.cellPadding) / layout.cellPitch);
        const row = Math.floor((half - local.y - layout.cellPadding) / layout.cellPitch);
        if (!model.isInside(row, col)) return undefined;
        return Object.freeze([row, col] as [number, number]);
    }

    private beginCellTap(row: number, col: number): boolean {
        const now = Date.now();
        if (this.lastTapRow === row
            && this.lastTapCol === col
            && now - this.lastTapAt <= MEOWDOKU_TIMING.doubleTapWindow * 1000) {
            this.lastTapRow = -1;
            this.lastTapCol = -1;
            this.stopDoubleTapWindow(true);
            this.handleFindCat(row, col);
            return true;
        }
        this.draftTapWasCat = this.draftMode && this.model?.getDraft(row, col) === 'cat';
        this.lastTapRow = row;
        this.lastTapCol = col;
        this.lastTapAt = now;
        this.startDoubleTapWindow(row, col);
        return false;
    }

    private handleSingleTap(row: number, col: number, preview = false): void {
        // 引导进行中：单击交给引导页（放猫步骤会等待双击或长按）。
        if (this.routeTutorialTap(row, col, false)) return;
        if (this.draftMode) {
            if (this.model?.setDraft(row, col, this.model.getDraft(row, col) ? undefined : 'mark')) {
                this.updateDraftMark(row, col);
            }
            return;
        }
        // 红的错误格不响应点击，与原作一致。
        if (this.model?.getCell(row, col) === 'error') return;
        const marking = this.model?.getCell(row, col) !== 'mark';
        // 不延迟画叉反馈，但双击的第一下只属于手势预览，不是已确认的排除操作。
        if (!this.applyMark(row, col, marking, true, preview ? 'tap-preview' : 'manual')) return;
        if (preview && marking && this.model) this.pendingSingleTap = { model: this.model, row, col };
        this.playMarkCue(marking);
        this.persistProgress();
    }

    /** 双击和长按共用找猫入口，计步、草稿、引导和错误反馈保持一致。 */
    private handleFindCat(row: number, col: number): void {
        if (this.routeTutorialTap(row, col, true)) return;
        if (this.draftMode) {
            if (this.model?.setDraft(row, col, this.draftTapWasCat ? undefined : 'cat')) {
                this.stepsUsed += 1;
                this.updateDraftMark(row, col);
                this.persistProgress();
            }
            return;
        }
        const model = this.model;
        if (!model) return;
        const view = this.cellViewAt(row, col);
        const result = model.placeCat(row, col);
        if (result === 'blocked') return;

        // 正确落猫与错误猜测都属于一次找猫尝试；在可能触发通关之前计数。
        this.stepsUsed += 1;
        if (result === 'placed') {
            if (view) {
                view.crossOpacity.opacity = 0;
                this.hideBars(view);
            }
            this.placeCatAt(row, col, true, true);
        } else {
            this.startWrongGuess(row, col, view);
        }
        this.commitBoardChange();
    }

    /**
     * 棋盘落子后的统一收尾（找猫 / 定位 / 提示共用）：刷新 HUD（顶部猫咪列表、生命、分数）、
     * 存档，放满就进入通关。任何改变棋盘的入口都必须走这里，不能各自挑着做。
     */
    private commitBoardChange(): void {
        const model = this.model;
        if (!model) return;
        this.refreshHud();
        this.persistProgress();
        if (model.isComplete) this.handleLevelCleared();
    }

    /** 放下一只正确的猫（用户点击 / 定位 / 老鼠 / 提示 / 草稿提交共用）。 */
    private placeCatAt(row: number, col: number, withBurst: boolean, fromPlayerPlacement = false): void {
        const view = this.cellViewAt(row, col);
        if (view) this.startCatAnimation(view, withBurst);
        this.onCorrectCat(row, col, view, fromPlayerPlacement);
    }

    /**
     * 放对一只猫：连击 +1、按原作默认档计分、区域变暗、计分反馈。
     * 原作 `meow_feedback` 默认关闭，所以这里不播猫叫，只有 `MARK_CAT`。
     */
    private onCorrectCat(
        row: number,
        col: number,
        view: MeowdokuCellView | undefined,
        fromPlayerPlacement = false,
    ): void {
        const model = this.model;
        if (!model) return;
        const gain = model.awardCombo();
        const combo = model.combo;
        this.context?.services.feedback.play('merge');
        this.context?.reportScore(model.score);
        this.refreshDimTargets(true);
        this.showScoreFeedback(row, col, gain, combo);
        this.checkFullMarkUnits(row, col);
        this.maybePlayLikeHand(row, col, fromPlayerPlacement);
        this.likeHandState.lastCatAt = model.elapsedSeconds;
        this.likeHandState.hasSeenFirstCat = true;
        if (this.activeHint) this.clearHint();
    }

    /**
     * 放错位置，原作 `_on_wrong_guess` 的完整顺序。
     *
     * 默认档 `misplace_react = CONFLICT`：先用「生气」动画 + 规则格扫光 + 连线
     * 指出是被哪只猫挡住（按生气序列完整时长），**播完**才落红叉、扣命、震屏；冲突反应播过时
     * 不再播全场「烦躁」。
     */
    private startWrongGuess(row: number, col: number, view: MeowdokuCellView | undefined): void {
        const model = this.model;
        if (!model) return;
        this.clearHint();
        // 原作 `play_wrong_pos_reaction`：先把手画的叉藏起来、猫恢复不透明，再播生气动画。
        if (view) {
            view.crossOpacity.opacity = 0;
            this.hideBars(view);
            view.catRoot.active = true;
            view.catOpacity.opacity = 255;
        }
        const conflict = findMeowdokuPriorityConflict([row, col], model.placedCats(), model.board.regions);
        if (!conflict) {
            this.resolveWrongGuess(row, col, view, false);
            return;
        }
        this.inputLocked = true;
        if (view) {
            this.playNamedCatAnim(view, this.visuals?.catAngry2 ?? [], MEOWDOKU_SHEETS.catAngry2.fps);
            this.playGridGlow(view);
        }
        const conflictView = this.cellViewAt(conflict[0], conflict[1]);
        // 生气猫弹出时会超出格子边界，相邻格子的底板会把它盖住（原作那层 `Glows`
        // 有 `z_index = 2` 才不会被盖，但猫本身没有）——这里把参与反应的两只猫临时
        // 抬到棋盘特效层（与格子同一坐标系，位置不变），反应结束再放回独立猫层。
        this.liftConflictCats(view, conflictView);
        // 原作 `_on_rule_violated(rule)`：踩到哪条常驻规则，对应的规则就闪两下。
        this.playRuleHighlight(this.violatedRuleIndex(row, col, conflict));
        if (conflictView) {
            this.playNamedCatAnim(conflictView, this.visuals?.catAngry2 ?? [], MEOWDOKU_SHEETS.catAngry2.fps);
            this.playGridGlow(conflictView);
        }
        for (const [r, c] of this.conflictRuleCells(row, col, conflict)) {
            const ruleView = this.cellViewAt(r, c);
            if (ruleView) this.playGridGlow(ruleView);
        }
        this.scheduleOnce(() => {
            if (this.state === 'disposed') return;
            this.drawConflictLine([row, col], conflict);
        }, MEOWDOKU_TIMING.conflictLineDelay);
        this.scheduleOnce(() => {
            if (this.state === 'disposed') return;
            this.stopGridGlow();
            this.stopConflictReaction(row, col, conflict);
            this.resolveWrongGuess(row, col, view, true);
        }, MEOWDOKU_TIMING.conflictDuration);
    }

    /** 冲突反应里需要扫光的「规则格」：同色整块 / 同行列之间 / 周围八格。 */
    private conflictRuleCells(
        row: number,
        col: number,
        conflict: readonly [number, number],
    ): readonly (readonly [number, number])[] {
        const model = this.model;
        if (!model) return [];
        const size = model.size;
        const regions = model.board.regions;
        const out: [number, number][] = [];
        const sameRegion = regions[row]![col] === regions[conflict[0]]![conflict[1]];
        if (sameRegion) {
            const regionId = regions[conflict[0]]![conflict[1]]!;
            for (const cell of model.regionCells(regionId)) {
                if (cell[0] === conflict[0] && cell[1] === conflict[1]) continue;
                out.push([cell[0], cell[1]]);
            }
        } else if (conflict[0] === row) {
            const from = Math.min(col, conflict[1]);
            const to = Math.max(col, conflict[1]);
            for (let c = from + 1; c < to; c += 1) out.push([row, c]);
        } else if (conflict[1] === col) {
            const from = Math.min(row, conflict[0]);
            const to = Math.max(row, conflict[0]);
            for (let r = from + 1; r < to; r += 1) out.push([r, col]);
        } else {
            for (let dr = -1; dr <= 1; dr += 1) {
                for (let dc = -1; dc <= 1; dc += 1) {
                    if (dr === 0 && dc === 0) continue;
                    const r = conflict[0] + dr;
                    const c = conflict[1] + dc;
                    if (r >= 0 && r < size && c >= 0 && c < size) out.push([r, c]);
                }
            }
        }
        return out;
    }

    private liftConflictCats(...views: (MeowdokuCellView | undefined)[]): void {
        const fx = this.fxNode;
        if (!fx?.isValid) return;
        views.forEach((view) => {
            const root = view?.catRoot;
            if (!view || !root?.isValid || root.parent === fx) return;
            root.setParent(fx, true);
            this.liftedCats.push(view);
        });
    }

    /** 把冲突猫放回自己在猫层里的入场容器（保持世界坐标，落回容器原点）。 */
    private restoreLiftedCats(): void {
        this.liftedCats.forEach((view) => {
            if (!view.catRoot.isValid || !view.catIntro.isValid) return;
            view.catRoot.setParent(view.catIntro, true);
        });
        this.liftedCats = [];
    }

    private stopConflictReaction(row: number, col: number, conflict: readonly [number, number]): void {
        this.restoreLiftedCats();
        if (this.conflictLineNode?.isValid) this.destroyNode(this.conflictLineNode);
        this.conflictLineNode = undefined;
        const views = [this.cellViewAt(row, col), this.cellViewAt(conflict[0], conflict[1])];
        views.forEach((view) => {
            if (!view?.catRoot.isValid) return;
            view.catPlay = undefined;
            if (view.col === col && view.row === row) {
                // 目标格：冲突期间借用猫脸播「生气」，结束后必须按真实状态收回去。
                view.catOpacity.opacity = 0;
                view.catRoot.active = false;
                return;
            }
            this.setCatFrames(view, this.visuals?.catIdle ?? [], 0);
            view.catRoot.active = true;
            view.catOpacity.opacity = 255;
        });
    }

    /** 冲突动画播完（或本来就没有冲突）之后才真正结算一次错误猜测。 */
    private resolveWrongGuess(
        row: number,
        col: number,
        view: MeowdokuCellView | undefined,
        conflictPlayed: boolean,
    ): void {
        const model = this.model;
        if (!model) return;
        this.inputLocked = false;
        const state = model.getCell(row, col);
        // 原作 `play_error_feedback`：错误格进入 ERROR 状态，红叉常驻。
        if (state !== 'error') {
            model.setMark(row, col, false, 'manual');
            model.markCellError(row, col);
        }
        // 格子的错误动效必须画在「猫」上面：原来错格的生气猫（层级比叉高）一直留着，
        // 直接把红叉盖住了，看起来就像「看不到错误动效」。变成 ERROR 格时要把猫收掉
        // （原作 `change_state(ERROR)` 也会隐藏 CatIcon）。
        if (view) {
            view.catOpacity.opacity = 0;
            view.catPlay = undefined;
            view.catRoot.active = false;
            this.playErrorAppear(view);
        }

        const exhausted = model.loseLife();
        const [x, y] = this.cellCenter(col, row);
        this.spawnBrokenHearts(x, y);
        this.playScreenShake();
        // 生命数已扣减，新的生命数恰好是刚失去的红心下标。
        this.refreshLifeBar(model.lives);
        this.context?.services.feedback.play('collision');

        if (exhausted) {
            this.playAllCatsMood('cry');
            this.inputLocked = true;
            this.state = 'failing';
            this.context?.services.feedback.play('failure');
            this.scheduleOnce(() => {
                if (this.state !== 'failing') return;
                this.onLivesExhausted();
            }, MEOWDOKU_TIMING.failDialogDelay);
        } else if (!conflictPlayed) {
            // 冲突反应已经指出问题所在，就不再让全场猫一起「烦躁」。
            this.playAllCatsMood('frustrated');
        }
        this.refreshHud();
        this.persistProgress();
    }

    /**
     * `ErrorAppear`（1.569s）：白叉弹入 → 缩小淡出 → 0.64s 后红叉弹入并**停住**，
     * 这个红叉会一直留在棋盘上（原作 `win_red_mark` 默认档 `KEEP_RED`）。
     */
    private playErrorAppear(view: MeowdokuCellView): void {
        const timing = MEOWDOKU_TIMING;
        // 第一段：白叉
        view.crossRoot.active = true;
        view.crossOpacity.opacity = 255;
        view.crossRoot.setScale(0.4, 0.4, 1);
        const whiteToken = this.restartCrossAnimation(view);
        view.bars.forEach((bar, index) => {
            this.setBar(view, index, false);
            const sprite = bar.getComponent(Sprite);
            if (sprite) sprite.color = MEOWDOKU_COLORS.mark;
        });
        // 原作 `ErrorAppear_G3` 里的 `BgPanel/BgRed/RedRecttangle2`：0.0664s 铺一层
        // 橙红圆角底（#FF5200），一直保持到 1.034s 再缩到 0。挂在 face 上，跟着格子一起挤压。
        const flash = MEOWDOKU_ERROR_FLASH;
        const faceNode = view.faceNode;
        if (faceNode?.isValid) {
            const flashNode = new Node('ErrorFlash');
            flashNode.layer = this.node.layer;
            flashNode.setParent(faceNode);
            const faceTransform = faceNode.getComponent(UITransform);
            flashNode.addComponent(UITransform).setContentSize(
                faceTransform?.width ?? 0,
                faceTransform?.height ?? 0,
            );
            flashNode.setPosition(0, 0, 0);
            flashNode.addComponent(Graphics);
            this.drawRoundedRect(
                flashNode.getComponent(Graphics)!,
                faceTransform?.width ?? 0,
                faceTransform?.height ?? 0,
                flash.corner * MEOWDOKU_SOURCE_SCALE * this.requireLayout().fitScale,
                flash.color,
            );
            const flashOpacity = flashNode.addComponent(UIOpacity);
            flashOpacity.opacity = 0;
            tween(flashOpacity)
                .delay(flash.appearAt)
                .to(0.0008, { opacity: 255 })
                .delay(flash.shrinkAt - flash.appearAt)
                .to(flash.shrinkDuration, { opacity: 0 })
                .start();
            tween(flashNode)
                .delay(flash.shrinkAt)
                .to(flash.shrinkDuration, { scale: new Vec3(0, 0, 1) }, { easing: 'quadIn' })
                .call(() => {
                    if (flashNode.isValid) this.destroyNode(flashNode);
                })
                .start();
        }
        // 原作 `ErrorAppear_G3` 的 `BgPanel:scale` 和画叉同形（x/y 错开）。
        this.squishCell(view, MEOWDOKU_MARK_SQUISH_APPEAR_X, MEOWDOKU_MARK_SQUISH_APPEAR_Y);
        this.scheduleOnce(() => { this.growBar(view, 0, 0.0816, whiteToken); }, 0);
        this.scheduleOnce(() => { this.growBar(view, 1, 0.1038, whiteToken); }, 0);
        tween(view.crossRoot)
            .delay(0.05)
            .to(0.0833, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .delay(0.1339)
            .to(0.1149, { scale: new Vec3(0.4, 0.4, 1) }, { easing: 'quadIn' })
            .start();
        tween(view.crossOpacity)
            .delay(timing.errorWhiteFadeAt)
            .to(0.06, { opacity: 0 })
            .call(() => {
                if (!view.crossRoot.isValid) return;
                this.hideBars(view);
            })
            .start();
        // 第二段：红叉
        this.scheduleOnce(() => {
            if (!view.crossRoot.isValid) return;
            view.bars.forEach((bar) => {
                const sprite = bar.getComponent(Sprite);
                if (sprite) sprite.color = MEOWDOKU_COLORS.markError;
            });
            this.playCrossAppear(view, MEOWDOKU_COLORS.markError, true);
            view.crossRoot.setScale(0.4, 0.4, 1);
            tween(view.crossRoot)
                .to(0.0833, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'quadOut' })
                .to(0.15, { scale: new Vec3(1, 1, 1) })
                .start();
        }, timing.errorRedAppearAt);
    }

    private applyChange(change: MeowdokuCellChange, animated: boolean): void {
        const view = this.cellViewAt(change.row, change.col);
        if (!view) return;
        // 原作 `cell_state_changed` 每次变化都会判定满标：这样「最后落笔的那一格」
        // 才是真正的最后一格（划涂补叉、道具补叉同样会触发）。
        if (!this.autoCrossPass) this.checkFullMarkUnits(change.row, change.col);
        if (change.to === 'mark') {
            // 老鼠 / 提示补的叉和手点的一样，都是 `CrossOutAppear` 的两道笔画。
            this.playCrossAppear(view, MEOWDOKU_COLORS.mark, animated);
        } else if (change.to === 'error') {
            this.playErrorAppear(view);
        } else if (change.from === 'mark') {
            // 原作 `CrossOutDisAppear`：X 缩到 0.6 并淡出，笔画最后隐藏。
            this.playCrossDisappear(view, animated);
        } else {
            view.crossOpacity.opacity = 0;
            this.hideBars(view);
        }
    }

    /** `CrossOutDisAppear`（0.306s）：X 缩到 0.6、0.1s 起淡出，格子挤压一下。 */
    private playCrossDisappear(view: MeowdokuCellView, animated: boolean): void {
        if (!animated) {
            view.crossOpacity.opacity = 0;
            this.hideBars(view);
            return;
        }
        Tween.stopAllByTarget(view.crossRoot);
        Tween.stopAllByTarget(view.crossOpacity);
        tween(view.crossRoot)
            .to(MEOWDOKU_TIMING.crossDisappear, {
                scale: new Vec3(MEOWDOKU_TIMING.crossDisappearShrink, MEOWDOKU_TIMING.crossDisappearShrink, 1),
            }, { easing: 'quadIn' })
            .start();
        tween(view.crossOpacity)
            .delay(MEOWDOKU_TIMING.crossDisappearFadeFrom)
            .to(MEOWDOKU_TIMING.crossDisappear - MEOWDOKU_TIMING.crossDisappearFadeFrom, { opacity: 0 })
            .call(() => {
                if (!view.crossRoot.isValid) return;
                this.hideBars(view);
                view.crossRoot.setScale(1, 1, 1);
            })
            .start();
        // `CrossOutDisAppear`：x / y 同步压到 0.9 再回 1。
        this.squishCell(view, [[0.0507, 0.9], [0.1006, 1]], [[0.0507, 0.9], [0.1006, 1]]);
    }

    /**
     * 格子底板的挤压（原作 `BgPanel:scale`）。
     *
     * 原作把 x / y 两个轴拆成两条轨道，而且**时间刻意错开**（例如 `CrossOutAppear_G3`：
     * x 轴 0.05s 冲到 1.1、y 轴 0.067s 才砸到 0.8），所以这里用两条 tween
     * 各驱动一个轴，通过同一个状态对象落到节点的 scale 上。
     */
    private squishCell(
        view: MeowdokuCellView,
        xKeys: readonly (readonly [number, number])[],
        yKeys: readonly (readonly [number, number])[],
    ): void {
        const node = view.faceNode;
        if (!node?.isValid) return;
        const state = view.squish;
        Tween.stopAllByTarget(state);
        state.x = 1;
        state.y = 1;
        node.setScale(1, 1, 1);
        const apply = (): void => {
            if (node.isValid) node.setScale(state.x, state.y, 1);
        };
        const axis = (key: 'x' | 'y', keys: readonly (readonly [number, number])[]): void => {
            let chain = tween(state);
            let previous = 0;
            for (const [time, value] of keys) {
                chain = chain.to(Math.max(0.01, time - previous), { [key]: value }, {
                    easing: 'quadOut',
                    onUpdate: apply,
                });
                previous = time;
            }
            chain.call(() => {
                state[key] = 1;
                apply();
            }).start();
        };
        axis('x', xKeys);
        axis('y', yKeys);
    }

    private cellViewAt(row: number, col: number): MeowdokuCellView | undefined {
        const model = this.model;
        if (!model) return undefined;
        return this.cellViews[row * model.size + col];
    }

    private startDoubleTapWindow(row: number, col: number): void {
        this.stopDoubleTapWindow();
        const token = this.doubleTapToken;
        this.scheduleOnce(() => {
            if (token !== this.doubleTapToken) return;
            this.commitPendingSingleTap();
            if (this.lastTapRow === row && this.lastTapCol === col) {
                this.lastTapRow = -1;
                this.lastTapCol = -1;
            }
        }, MEOWDOKU_TIMING.doubleTapWindow);
    }

    private commitPendingSingleTap(): void {
        const pending = this.pendingSingleTap;
        this.pendingSingleTap = undefined;
        if (!pending || pending.model !== this.model) return;
        const { model, row, col } = pending;
        if (model.getCell(row, col) !== 'mark' || model.getMarkOrigin(row, col) !== 'tap-preview') return;
        // 只确认来源和使用历史，叉的视觉已在松手时展示，无需重播动画或音效。
        model.setMark(row, col, true, 'manual');
        this.persistProgress();
    }

    private stopDoubleTapWindow(consumePreview = false): void {
        if (consumePreview) this.pendingSingleTap = undefined;
        else this.commitPendingSingleTap();
        this.doubleTapToken += 1;
    }

    // ---------------------------------------------------------------- 道具

    private toolIconFrame(tool: MeowdokuTool): SpriteFrame | null {
        const frames = this.visuals?.frames;
        if (!frames) return null;
        if (tool === 'hint') return frames.toolHint;
        return frames.toolLocate;
    }

    private toolLabel(tool: MeowdokuTool): string {
        if (tool === 'hint') return MEOWDOKU_COPY.toolHint;
        return MEOWDOKU_COPY.toolLocate;
    }

    /** 刷新道具角标：有货显示红底数量，没货显示绿底「看广告领一个」。 */
    private syncToolButtons(): void {
        const tools: MeowdokuTool[] = ['locate', 'hint'];
        const enabled = this.state === 'playing' && !this.inputLocked;
        for (const tool of tools) {
            const view = this.toolButtons.get(tool);
            if (!view) continue;
            if (view.icon.isValid) view.icon.color = Color.WHITE;
            const count = this.toolStock[tool] ?? 0;
            const hasTool = count > 0;
            if (view.countRoot.isValid) view.countRoot.active = hasTool;
            if (view.adRoot.isValid) view.adRoot.active = !hasTool;
            if (hasTool && view.countLabel.isValid) {
                view.countLabel.string = count > 99 ? '99+' : String(count);
            }
            if (view.node.isValid) view.node.setScale(enabled ? 1 : 0.96, enabled ? 1 : 0.96, 1);
        }
    }

    /** 扣一个道具；没有就返回 false（调用方去走广告）。 */
    private consumeTool(tool: MeowdokuTool): boolean {
        const count = this.toolStock[tool] ?? 0;
        if (count <= 0) return false;
        this.toolStock[tool] = count - 1;
        this.syncToolButtons();
        this.persistToolStock();
        return true;
    }

    /**
     * 每天第一次进入游戏随机送一个道具（需求：每日首次进入获得随机一个道具）。
     * 返回本次是否发过。
     */
    private grantDailyTool(): boolean {
        const today = todayStamp();
        if (this.toolStock.day === today) return false;
        const tool: MeowdokuTool = Math.random() < 0.5 ? 'locate' : 'hint';
        this.toolStock.day = today;
        this.toolStock[tool] = (this.toolStock[tool] ?? 0) + 1;
        this.persistToolStock();
        this.syncToolButtons();
        return true;
    }

    /** 数量为 0 时点道具：看一次激励广告换一个（原作 `game_ad_badge` 的绿色角标）。 */
    private async requestToolByAd(tool: MeowdokuTool): Promise<void> {
        if (this.toolAdPending) return;
        this.toolAdPending = true;
        this.context?.services.feedback.play('uiButton');
        // 看完广告**不补库存**，直接把这一次道具用掉（原作 `_on_ad_rewarded` 后立即执行道具）。
        const model = this.model;
        const context = this.context;
        const useNow = (): void => {
            // 广告返回时必须仍是同一局；退出、重开、换关后不能把旧奖励应用到新棋盘。
            if (this.model !== model || this.context !== context || !model || model.isComplete) return;
            if (this.state === 'paused') {
                // 广告结束时仍在后台：留到应用状态机恢复本局后展示，不能丢失奖励。
                this.pendingToolReward = { model, tool };
                return;
            }
            if (this.state !== 'playing' || this.inputLocked || this.draftMode || this.activeHint) return;
            this.applyTool(tool);
        };
        try {
            const ads = this.context?.services.ads;
            if (!ads) {
                this.showToast(MEOWDOKU_COPY.adUnavailable);
                return;
            }
            const result = await ads.showRewarded({
                placement: 'meowdoku-tool',
                gameId: this.context?.gameId ?? 'meowdoku',
                sessionId: this.context?.sessionId,
            });
            if (result?.outcome === 'completed') {
                useNow();
                return;
            }
            // 没看完就说一声，避免「点了没反应」。
            if (result?.errorCode !== 'not-configured') {
                this.showToast(MEOWDOKU_COPY.adUnavailable);
            }
        } catch (error) {
            // TODO: console.warn('[MeowdokuGame] Tool ad failed.', error);
            this.showToast(MEOWDOKU_COPY.adUnavailable);
        } finally {
            this.toolAdPending = false;
        }
    }

    /** 提示先求解再扣库存；无提示不消耗，也不发起广告。 */
    private pressTool(tool: MeowdokuTool): void {
        if (this.tutorial) return;
        if (this.state !== 'playing' || this.inputLocked) return;
        if (this.toolAdPending || this.draftMode || this.activeHint || !this.model || this.model.isComplete) return;
        this.resetBoardGesture();
        if (tool === 'hint') {
            this.useHint();
            return;
        }
        if (!this.consumeTool(tool)) {
            void this.requestToolByAd(tool);
            return;
        }
        this.context?.services.feedback.play('uiButton');
        this.applyTool(tool);
    }

    private applyTool(tool: MeowdokuTool): void {
        if (tool === 'hint') {
            this.useHint(true);
            return;
        }
        this.useLocate();
    }

    /** 定位：挑候选最少的颜色，直接把那只猫放上去。移植自 `_on_locate_btn_pressed`。 */
    private useLocate(): void {
        const model = this.model;
        if (!model || model.isComplete) return;
        const size = model.size;
        const regionRemaining = new Map<number, number>();
        for (let row = 0; row < size; row += 1) {
            for (let col = 0; col < size; col += 1) {
                if (model.getCell(row, col) === 'mark') continue;
                const regionId = model.board.regions[row]![col]!;
                regionRemaining.set(regionId, (regionRemaining.get(regionId) ?? 0) + 1);
            }
        }
        let best: readonly [number, number] | undefined;
        let bestSize = Number.POSITIVE_INFINITY;
        for (let row = 0; row < size; row += 1) {
            const col = model.board.solution[row]!;
            if (model.getCell(row, col) === 'cat') continue;
            const regionId = model.board.regions[row]![col]!;
            const candidateSize = regionRemaining.get(regionId) ?? size * size;
            if (candidateSize < bestSize) {
                bestSize = candidateSize;
                best = Object.freeze([row, col] as [number, number]);
            }
        }
        if (!best) return;
        const view = this.cellViewAt(best[0], best[1]);
        const result = model.placeCat(best[0], best[1]);
        if (result !== 'placed') return;
        this.context?.services.feedback.play('continue');
        if (view) {
            view.crossOpacity.opacity = 0;
            this.hideBars(view);
        }
        this.placeCatAt(best[0], best[1], true);
        this.clearHint();
        this.commitBoardChange();
    }

    /** 生成有效提示后才扣库存；广告奖励只支付这一次提示。 */
    private useHint(rewarded = false): void {
        const model = this.model;
        if (!model || model.isComplete || this.state !== 'playing' || this.inputLocked
            || this.draftMode || this.activeHint || (this.toolAdPending && !rewarded)) return;
        const hint = solveMeowdokuHint(
            this.resolveHintBoard(model), model.size, model.board.regions, model.board.solution,
        );
        if (!hint) {
            this.clearHint();
            this.showToast(MEOWDOKU_COPY.hintNoHint);
            return;
        }
        if (!rewarded && !this.consumeTool('hint')) {
            void this.requestToolByAd('hint');
            return;
        }
        this.resetBoardGesture();
        this.context?.services.feedback.play('continue');
        this.activeHint = hint;
        this.buildHintPreview(hint);
        this.showHintBar(hint);
    }

    /** 只使用真实棋盘；擦除提示产生的叉后，该格立即重新成为候选。 */
    private resolveHintBoard(model: MeowdokuModel): readonly (readonly number[])[] {
        return solverBoardFromCells(model.size, model.snapshot());
    }

    /**
     * 提示预览，对应原作 `CellView.play_hint` / `play_r2_preview` / `play_prompt_cat`：
     * - 必然放猫的格子：`icon_light` 光圈 + `icon_prompt_frame` 提示框交互呼吸（0.65s 半周期，
     *   最低 0.35 透明度），猫剪影 0.3 → 1 回弹后 1s 一轮明暗；
     * - 待排除的格子：背景 0.2s 亮起，0.317s 后播 `PromptCrossOut`（整只叉 0 → 1.2 → 0.9 → 1）。
     */
    private buildHintPreview(hint: MeowdokuHint): void {
        this.clearHintPreview();
        const fx = this.hintLayerNode ?? this.fxNode;
        if (!fx?.isValid) return;
        const layout = this.requireLayout();
        const timing = MEOWDOKU_TIMING;
        // 挂在页面层（HintLayer）时要补上棋盘自身的位置，否则高亮会整体偏移。
        const usePage = fx === this.hintLayerNode;
        const offsetX = usePage ? layout.boardX : 0;
        const offsetY = usePage ? layout.boardY : 0;

        hint.markCells.forEach(([row, col], index) => {
            const [localX, localY] = this.cellCenter(col, row);
            const x = localX + offsetX;
            const y = localY + offsetY;
            const node = new Node('HintMark');
            node.layer = this.node.layer;
            node.setParent(fx);
            node.addComponent(UITransform).setContentSize(layout.markSize, layout.markSize);
            node.setPosition(x, y, 0);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.visuals?.frames.promptX ?? null;
            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = 0;
            node.setScale(0.001, 0.001, 1);
            const delay = timing.hintPreviewDelay + index * 0.04;
            tween(node)
                .delay(delay)
                .to(0.15, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' })
                .to(0.15, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'quadIn' })
                .to(0.29, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .start();
            tween(opacity).delay(delay).to(0.07, { opacity: 255 }).start();
            this.hintPreviewNodes.push(node);
        });

        if (hint.action === 'mark') return;
        const [row, col] = hint.cell;
        const [cellX, cellY] = this.cellCenter(col, row);
        const x = cellX + offsetX;
        const y = cellY + offsetY;

        const frame = new Node('HintFrame');
        frame.layer = this.node.layer;
        frame.setParent(fx);
        frame.addComponent(UITransform).setContentSize(layout.cellFace, layout.cellFace);
        frame.setPosition(x, y, 0);
        const frameSprite = frame.addComponent(Sprite);
        frameSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        frameSprite.spriteFrame = this.visuals?.frames.promptFrame ?? null;
        const frameOpacity = frame.addComponent(UIOpacity);
        frameOpacity.opacity = Math.round(255 * timing.hintAlphaMin);
        tween(frameOpacity)
            .to(timing.hintHalfCycle, { opacity: 255 }, { easing: 'quadInOut' })
            .to(timing.hintHalfCycle, { opacity: Math.round(255 * timing.hintAlphaMin) }, { easing: 'quadInOut' })
            .union()
            .repeatForever()
            .start();
        this.hintPreviewNodes.push(frame);

        const light = new Node('HintLight');
        light.layer = this.node.layer;
        light.setParent(fx);
        light.addComponent(UITransform).setContentSize(layout.cellFace * 1.1, layout.cellFace * 1.1);
        light.setPosition(x, y, 0);
        const lightSprite = light.addComponent(Sprite);
        lightSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        lightSprite.spriteFrame = this.visuals?.frames.hintLight ?? null;
        const lightOpacity = light.addComponent(UIOpacity);
        lightOpacity.opacity = Math.round(255 * timing.hintAlphaMin);
        tween(lightOpacity)
            .to(timing.hintHalfCycle, { opacity: 255 }, { easing: 'quadInOut' })
            .to(timing.hintHalfCycle, { opacity: Math.round(255 * timing.hintAlphaMin) }, { easing: 'quadInOut' })
            .union()
            .repeatForever()
            .start();
        this.hintPreviewNodes.push(light);

        if (hint.action === 'unmark') {
            // 纠错只预览擦叉，不显示猫剪影，避免误解为直接放猫。
            const cross = new Node('HintUnmark');
            cross.layer = this.node.layer;
            cross.setParent(fx);
            cross.addComponent(UITransform).setContentSize(layout.markSize, layout.markSize);
            cross.setPosition(x, y, 0);
            const sprite = cross.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.visuals?.frames.promptX ?? null;
            const opacity = cross.addComponent(UIOpacity);
            tween(opacity)
                .to(0.65, { opacity: 0 }, { easing: 'quadIn' })
                .delay(0.25)
                .to(0.15, { opacity: 255 })
                .union().repeatForever().start();
            this.hintPreviewNodes.push(cross);
            return;
        }

        const catPrompt = new Node('HintCat');
        catPrompt.layer = this.node.layer;
        catPrompt.setParent(fx);
        catPrompt.addComponent(UITransform).setContentSize(layout.cellFace * 0.8, layout.cellFace * 0.8);
        catPrompt.setPosition(x, y, 0);
        const catSprite = catPrompt.addComponent(Sprite);
        catSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        catSprite.spriteFrame = this.visuals?.frames.promptCat ?? null;
        const catOpacity = catPrompt.addComponent(UIOpacity);
        catOpacity.opacity = 0;
        catPrompt.setScale(0.3, 0.3, 1);
        const catDelay = timing.hintPreviewDelay + 0.12;
        tween(catPrompt)
            .delay(catDelay)
            .to(timing.promptCatScaleIn, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
        tween(catOpacity)
            .delay(catDelay)
            .to(0.05, { opacity: 255 })
            .delay(timing.promptCatScaleIn)
            .to(timing.promptCatPulse, { opacity: 128 }, { easing: 'sineInOut' })
            .to(timing.promptCatPulse, { opacity: 255 }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
        this.hintPreviewNodes.push(catPrompt);
    }

    private clearHintPreview(): void {
        this.hintPreviewNodes.forEach((node) => {
            if (node.isValid) this.destroyNode(node);
        });
        this.hintPreviewNodes = [];
    }

    /** 只控制「应用」按钮的显隐（横幅与 `R1` 策略码已整段删除）。 */
    private showHintBar(hint: MeowdokuHint | undefined): void {
        const bar = this.hintBarNode;
        if (!bar?.isValid) return;
        if (hint) {
            const label = bar.getChildByName('Apply')?.getChildByName('Label')?.getComponent(Label);
            if (label) label.string = hint.action === 'unmark' ? "取消错误标记" : MEOWDOKU_COPY.hintApply;
            bar.active = true;
            this.showHintMask();
            return;
        }
        bar.active = false;
        this.activeHint = undefined;
    }

    private clearHint(): void {
        this.activeHint = undefined;
        this.clearHintPreview();
        this.hideHintMask();
        if (this.hintBarNode?.isValid) this.hintBarNode.active = false;
    }

    /** 一次应用只提交一个结论；纠错撤叉不会放猫或扣生命。 */
    private applyHint(): void {
        if (this.state !== 'playing' || this.inputLocked || this.draftMode || this.toolAdPending) return;
        const hint = this.activeHint;
        const model = this.model;
        if (!hint || !model || model.isComplete) return;
        const [row, col] = hint.cell;
        // 写入前校验动作与真实状态，避免异常/过期结论调用 placeCat 后产生红叉。
        const applicable = hint.action === 'place'
            ? model.getCell(row, col) === 'empty' && model.isSolutionCell(row, col)
            : hint.action === 'unmark'
                ? model.getCell(row, col) === 'mark' && model.isSolutionCell(row, col)
                : hint.markCells.length > 0 && hint.markCells.every(([r, c]) =>
                    model.getCell(r, c) === 'empty' && !model.isSolutionCell(r, c));
        this.clearHint();
        if (!applicable) return;
        if (hint.action === 'place') {
            const view = this.cellViewAt(row, col);
            if (model.placeCat(row, col) === 'placed') {
                if (view) this.hideBars(view);
                this.placeCatAt(row, col, true);
            }
        } else if (hint.action === 'unmark') {
            const change = model.setMark(row, col, false, 'manual');
            if (change) this.applyChange(change, true);
            this.playMarkCue(false);
        } else {
            this.context?.services.feedback.play('chain');
            hint.markCells.forEach(([r, c]) => {
                const change = model.setMark(r, c, true, 'manual');
                if (change) this.applyChange(change, true);
            });
        }
        this.commitBoardChange();
    }

    // ---------------------------------------------------------------- 通关 / 失败

    /**
     * 通关，原作 `_on_game_win` + `replay_all_cat_appear`：
     * 停止连击音、重置区域变暗、播 `ALL_CLEARED`，然后**所有猫重播一次出场动画**。
     * 原作控制档里没有环扫补叉、没有整场放大、红叉也不会变白，这里保持一致。
     */
    private handleLevelCleared(): void {
        const model = this.model;
        if (this.state !== 'playing' || !model?.isComplete) return;
        this.recordLevelChallengeHistory();
        const history = this.levelChallengeHistories[String(model.level)];
        this.geniusClear = this.challengeTrackingActive && model.isPerfectClear
            && !history?.manualMarksUsed && !history?.draftUsed && !history?.wrongGuessMade;
        if (this.geniusClear) this.geniusClearedLevels[String(model.level)] = true;
        this.inputLocked = true;
        this.state = 'clearing';
        this.clearHint();
        if (model) {
            this.clearFailCount(model.level);
            this.clearedLevel = Math.max(this.clearedLevel, model.level);
            this.unlockedLevel = Math.max(this.unlockedLevel, this.clampLevel(model.level + 1));
        }
        // 通关后存档与按钮都指向当前关的下一关。
        this.persistProgress();
        this.context?.reportScore(model?.score ?? 0);
        this.refreshDimTargets(true);
        this.context?.services.feedback.play('milestone');
        // 原作 `_validate_board`：先结算「整盘满标」（补叉 + 棋盘发光 + Perfect），
        // 再走 `_on_game_win` 的「所有猫重播出场」。
        this.playFullMarkFeedback();
        this.replayAllCatAppear();
        this.playBoardWinFlourish();
        // 历史无叉、无草稿、零失误优先展示专属提示，其次是本局完美，其余按步数分档。
        // 顺序：先让棋盘猫把出场动画播完 → 再弹胜利提示条 → 最后展示静态结算猫。
        const tier = meowdokuWinToastTier(model?.size ?? 0, this.stepsUsed, model?.isPerfectClear ?? false, this.geniusClear);
        this.scheduleOnce(() => {
            if (this.state !== 'clearing') return;
            const toastShown = tier >= 0 && this.showWinToast(tier as 0 | 1 | 2 | 3 | 4);
            this.scheduleOnce(() => {
                if (this.state !== 'clearing') return;
                this.finishClearSequence();
            }, toastShown
                ? MEOWDOKU_TIMING.winToastPop + MEOWDOKU_TIMING.winToastHold
                : 0);
        }, MEOWDOKU_SHEETS.catAppear.count / MEOWDOKU_SHEETS.catAppear.fps);
    }

    /** 通关结算：静态布偶猫与底部按钮，点按钮才进下一关。 */
    private finishClearSequence(): void {
        const model = this.model;
        this.context?.services.feedback.play('record');
        this.showWinOverlay(model?.isPerfectClear ?? false, this.geniusClear);
        if (model && this.mode !== 'hard') {
            this.context?.reportAchievementProgress('cleared-level', this.clearedLevel);
        }
    }

    /**
     * 通关提示条，对齐原作 `game_win_toast_01.tscn` + `win_toast_messages.gd`：
     *
     * - 900×368 的九宫格底板（`win_toast/bg.png`）居中，位置在屏幕中心上方 84~452 设计像素；
     * - 顶部是分档图标（`game_win_toast0N/union_86.png`，206×174 显示成 103×87）；
     * - 下面是文案（字号 60、白色、居中），数字部分按分档色高亮；
     * - `GenericPopup` 节奏：page 压暗到 0.749，面板 0.7 → 1.05 → 1（0.5s），
     *   保持 1.3s，再用 0.316s 缩到 0.8 并淡出。
     *
     * @returns 是否真的展示了（没有资源时返回 false，让调用方回退到原来的等待时间）
     */
    private showWinToast(tier: 0 | 1 | 2 | 3 | 4): boolean {
        this.destroyWinToast();
        const layout = this.requireLayout();
        const k = MEOWDOKU_SOURCE_SCALE * layout.fitScale;
        const bgFrame = this.visuals?.frames.winToastBg;
        const iconFrame = [
            this.visuals?.frames.winToast1,
            this.visuals?.frames.winToast2,
            this.visuals?.frames.winToast3,
            this.visuals?.frames.winToast4,
            this.visuals?.frames.winToast1,
        ][tier];
        const messages = MEOWDOKU_WIN_TOAST_MESSAGES[tier];
        if (!bgFrame || !iconFrame || !messages || messages.length === 0) return false;

        const root = new Node('WinToast');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(layout.width, layout.height);
        root.setPosition(0, 0, 0);
        this.winToastNode = root;

        // 页面压暗（原作 `GenericPopup` 把 `Root/Overlay` 的 alpha 推到 0.749）。
        const dim = new Node('Dimmer');
        dim.layer = this.node.layer;
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(layout.width, layout.height);
        const dimGraphics = dim.addComponent(Graphics);
        dimGraphics.fillColor = new Color(0, 0, 0, Math.round(255 * MEOWDOKU_TIMING.winToastDimAlpha));
        dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
        dimGraphics.fill();
        const dimOpacity = dim.addComponent(UIOpacity);
        dimOpacity.opacity = 0;
        tween(dimOpacity).to(0.09, { opacity: 255 }).start();

        // 面板：900×368 设计像素，中心在屏幕中心上方 268（84~452）。
        const panelWidth = 900 * k;
        const panelHeight = 368 * k;
        const panel = new Node('Content');
        panel.layer = this.node.layer;
        panel.setParent(root);
        panel.addComponent(UITransform).setContentSize(panelWidth, panelHeight);
        panel.setPosition(0, 268 * k, 0);
        const panelSprite = panel.addComponent(Sprite);
        panelSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        panelSprite.spriteFrame = bgFrame;
        const panelOpacity = panel.addComponent(UIOpacity);
        panelOpacity.opacity = 0;
        panel.setScale(
            MEOWDOKU_TIMING.winToastScaleFrom,
            MEOWDOKU_TIMING.winToastScaleFrom,
            1,
        );
        tween(panelOpacity).to(0.055, { opacity: 255 }).start();
        tween(panel)
            .to(0.1, {
                scale: new Vec3(
                    MEOWDOKU_TIMING.winToastScalePeak,
                    MEOWDOKU_TIMING.winToastScalePeak,
                    1,
                ),
            }, { easing: 'quadOut' })
            .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();

        // 分档图标：原作 103×87 显示尺寸。
        const icon = new Node('UnionImg');
        icon.layer = this.node.layer;
        icon.setParent(panel);
        icon.addComponent(UITransform).setContentSize(103 * k, 87 * k);
        // 原作面板上边距 140、下边距 68：图标占上方图区，文案在下方文本区。
        icon.setPosition(0, panelHeight / 2 - 70 * k, 0);
        const iconSprite = icon.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        iconSprite.spriteFrame = iconFrame;
        if (tier === 4) iconSprite.color = MEOWDOKU_COLORS.resultGenius;

        // 文案：`{N}` 步数、`{CATS}` 猫数；数字按该档高亮色显示。
        // 文案里的数字按分档高亮色包一层 `<color>`（原作 `_wrap_numbers_with_color`）。
        const raw = messages[Math.floor(Math.random() * messages.length)]!;
        const steps = this.stepsUsed;
        const cats = this.model?.size ?? 0;
        const filled = raw
            .replace(/\{N\}/g, String(steps))
            .replace(/\{CATS\}/g, String(cats));
        const highlight = tier === 4 ? MEOWDOKU_COLORS.resultGenius : MEOWDOKU_COLORS.winToastHighlight[tier] ?? Color.WHITE;
        const hex = highlight.toHEX('#rrggbb');
        const message = new Node('Message');
        message.layer = this.node.layer;
        message.setParent(panel);
        message.addComponent(UITransform).setContentSize(panelWidth - 56 * k, 160 * k);
        message.setPosition(0, -panelHeight / 2 + 68 * k + 80 * k, 0);
        this.createHighlightedText(
            message,
            filled,
            Math.round(60 * k),
            panelWidth - 44 * k,
            highlight,
        );
        void panelSprite;
        void hex;

        // 保持、再淡出（原作 `hide_toast` 的 0.316s）。
        this.scheduleOnce(() => {
            if (!root.isValid) return;
            tween(panel)
                .to(MEOWDOKU_TIMING.winToastOut, {
                    scale: new Vec3(
                        MEOWDOKU_TIMING.winToastScaleEnd,
                        MEOWDOKU_TIMING.winToastScaleEnd,
                        1,
                    ),
                }, { easing: 'quadIn' })
                .start();
            tween(panelOpacity)
                .to(MEOWDOKU_TIMING.winToastOut, { opacity: 0 })
                .start();
            tween(dimOpacity)
                .to(MEOWDOKU_TIMING.winToastOut, { opacity: 0 })
                .start();
        }, MEOWDOKU_TIMING.winToastPop + MEOWDOKU_TIMING.winToastHold);
        return true;
    }

    /**
     * 用多个 `Label` 拼一段「数字高亮」的文案：原作 `MessageTxt` 是 RichText，
     * 但本项目引擎裁掉了 `rich-text` 模块，所以这里自己分段 + 折行，
     * 效果一致（白字 + 数字用该档高亮色）。
     */
    private createHighlightedText(
        parent: Node,
        text: string,
        fontPx: number,
        maxWidth: number,
        highlight: Color,
    ): void {
        // 1) 按数字分段
        const segments: { text: string; highlight: boolean }[] = [];
        const pattern = /\d+%?/g;
        let cursor = 0;
        let match = pattern.exec(text);
        while (match) {
            if (match.index > cursor) {
                segments.push({ text: text.slice(cursor, match.index), highlight: false });
            }
            segments.push({ text: match[0], highlight: true });
            cursor = match.index + match[0].length;
            match = pattern.exec(text);
        }
        if (cursor < text.length) {
            segments.push({ text: text.slice(cursor), highlight: false });
        }
        if (segments.length === 0) return;

        // 2) 逐字折行（CJK 按一个字宽、数字/字母按半宽估算）
        // 中文字宽按 0.98 em 估算（Cocos 默认字体就是 1 em，留一点余量避免最后一个字被挤到下一行）。
        const charWidth = (ch: string): number => {
            const code = ch.charCodeAt(0);
            if (code < 0x2e80) return fontPx * 0.56;
            return fontPx * 0.98;
        };
        const lines: { text: string; highlight: boolean }[][] = [[]];
        let lineWidth = 0;
        for (const segment of segments) {
            let current = lines[lines.length - 1]!;
            for (const ch of segment.text) {
                if (ch === '\n') {
                    lines.push([]);
                    current = lines[lines.length - 1]!;
                    lineWidth = 0;
                    continue;
                }
                const width = charWidth(ch);
                if (lineWidth + width > maxWidth && current.length > 0) {
                    lines.push([]);
                    current = lines[lines.length - 1]!;
                    lineWidth = 0;
                }
                const last = current[current.length - 1];
                if (last && last.highlight === segment.highlight) {
                    current[current.length - 1] = {
                        text: last.text + ch,
                        highlight: last.highlight,
                    };
                } else {
                    current.push({ text: ch, highlight: segment.highlight });
                }
                lineWidth += width;
            }
        }

        // 3) 每行居中排布
        const lineHeight = fontPx * 1.2;
        const totalHeight = lines.length * lineHeight;
        const measure = (text: string): number => {
            let width = 0;
            for (const ch of text) width += charWidth(ch);
            return width;
        };
        lines.forEach((line, index) => {
            const row = new Node(`Line${index + 1}`);
            row.layer = this.node.layer;
            row.setParent(parent);
            row.addComponent(UITransform).setContentSize(maxWidth, lineHeight);
            row.setPosition(0, totalHeight / 2 - lineHeight * (index + 0.5), 0);

            // 每个同色片段一个 Label，按估算宽度横向居中排布。
            const widths = line.map((part) => measure(part.text));
            const totalWidth = widths.reduce((sum, value) => sum + value, 0);
            let offset = -totalWidth / 2;
            line.forEach((part, partIndex) => {
                const width = widths[partIndex]!;
                const label = this.createLabel(
                    row,
                    'Part',
                    width,
                    lineHeight,
                    fontPx,
                    part.highlight ? highlight : Color.WHITE,
                );
                label.overflow = Label.Overflow.NONE;
                label.string = part.text;
                label.node.setPosition(offset + width / 2, 0, 0);
                offset += width;
            });
        });
        void lineHeight;
    }

    private destroyWinToast(): void {
        const node = this.winToastNode;
        this.winToastNode = undefined;
        if (node?.isValid) this.destroyNode(node);
    }

    /**
     * 通关结算页（原作 `game_win_page.tscn` 的素材与节奏）：暖调深色蒙层上排一整列——
     * 标题 → 关卡胶囊（零失误时并排「完美通关」）→ 旋转光芒 + 单次出场的布偶猫 → 得分 / 用时 / 步数
     * → 「下一关」按钮。整列在胶囊下方与底部安全区之间居中，放不下时等比缩小。
     */
    private showWinOverlay(perfect: boolean, genius = false): void {
        this.destroyWinOverlay();
        this.destroyWinToast();
        const spec = MEOWDOKU_RESULT_PAGE;
        const model = this.model;
        const columnHeight = spec.titleHeight + spec.chipGap + spec.chipHeight
            + spec.stageGap + spec.winStageHeight
            + spec.cardGap + spec.winCardHeight
            + spec.buttonsGap + spec.primaryButtonHeight + spec.buttonEdge;
        const { root, column, s } = this.createResultPage('WinOverlay', columnHeight);
        this.winOverlayNode = root;
        const top = columnHeight * s / 2;
        const titleY = top - spec.titleHeight * s / 2;
        const chipsY = top - (spec.titleHeight + spec.chipGap + spec.chipHeight / 2) * s;
        let cursor = top - (spec.titleHeight + spec.chipGap + spec.chipHeight + spec.stageGap) * s;

        // 光芒转在布偶猫背后，猫本体以单张图片做一次轻柔的出场。
        const stageY = cursor - spec.winStageHeight * s / 2;
        const rayFrame = this.visuals?.frames.rayLight;
        if (rayFrame) {
            const raySize = spec.raySize * s;
            const ray = new Node('RayLight');
            ray.layer = this.node.layer;
            ray.setParent(column);
            ray.addComponent(UITransform).setContentSize(raySize, raySize);
            ray.setPosition(0, stageY, 0);
            const raySprite = ray.addComponent(Sprite);
            raySprite.sizeMode = Sprite.SizeMode.CUSTOM;
            raySprite.spriteFrame = rayFrame;
            raySprite.color = new Color(255, 255, 255, Math.round(255 * 0.6));
            const rayOpacity = ray.addComponent(UIOpacity);
            rayOpacity.opacity = 0;
            tween(rayOpacity).to(0.3, { opacity: 255 }).start();
            tween(ray).by(18, { angle: 360 }).repeatForever().start();
        }
        const catHeight = spec.winCatHeight * s;
        const cat = this.placeResultCat(column, 'VictoryCat', genius ? this.visuals?.frames.winGeniusCat : this.pickWinCatFrame(),
            catHeight, spec.cardWidth * s, stageY, s);
        this.placeHardResultStamp(cat, stageY, true);
        // 礼花：原作 `EffectFlreworks` 在 0.386s 炸开。
        this.scheduleOnce(() => {
            if (this.state === 'disposed' || !column.isValid) return;
            this.spawnWinFireworks(column, stageY, catHeight);
        }, 0.386);

        const title = this.createResultTitle(column, genius ? MEOWDOKU_COPY.geniusWinTitle : this.pickWinTitle(), titleY);
        this.popResultTitle(title, MEOWDOKU_TIMING.winTitleDelay);
        const chips = this.createResultChips(
            column,
            chipsY,
            genius
                ? [{ text: this.currentLevelLabel() }, { text: MEOWDOKU_COPY.perfectWin, perfect: true },
                    { text: MEOWDOKU_COPY.geniusWin, genius: true }]
                : perfect
                    ? [{ text: this.currentLevelLabel() }, { text: MEOWDOKU_COPY.perfectWin, perfect: true }]
                    : [{ text: this.currentLevelLabel() }],
        );
        this.revealResultNode(chips, 0.36);
        cursor -= (spec.winStageHeight + spec.cardGap) * s;

        const card = this.createResultStats(column, cursor - spec.winCardHeight * s / 2, [
            { label: MEOWDOKU_COPY.resultScore, value: `${model?.score ?? 0}` },
            { label: MEOWDOKU_COPY.resultTime, value: this.formatResultTime(model?.elapsedSeconds ?? 0) },
            { label: MEOWDOKU_COPY.resultSteps, value: `${this.stepsUsed}` },
        ]);
        this.revealResultNode(card, 0.6);
        cursor -= (spec.winCardHeight + spec.buttonsGap) * s;

        const buttonHeight = spec.primaryButtonHeight * s;
        const button = this.createPillButton(
            column,
            'ContinueButton',
            spec.buttonWidth * s,
            buttonHeight,
            MEOWDOKU_COPY.resultNext,
            'primary',
            { fontSize: spec.primaryButtonFont * s },
        );
        button.setPosition(0, cursor - buttonHeight / 2, 0);
        this.revealResultNode(button, MEOWDOKU_TIMING.winContinueDelay, MEOWDOKU_TIMING.winContinueFade);
        this.bindButton(button, () => {
            if (this.state !== 'clearing') return;
            this.destroyWinOverlay();
            this.context?.services.feedback.play('uiButton');
            this.advanceToNextLevel();
        });
    }

    /** 通关礼花：围绕大猫炸一圈星点（原作 `EffectFlreworks` 的一次性粒子）。 */
    private spawnWinFireworks(parent: Node, centerY: number, catHeight: number): void {
        const frame = this.visuals?.frames.star;
        if (!frame?.isValid) return;
        const layout = this.requireLayout();
        for (let index = 0; index < 10; index += 1) {
            const angle = (Math.PI * 2 * index) / 10;
            const radius = catHeight * 0.42;
            const star = new Node('Firework');
            star.layer = this.node.layer;
            star.setParent(parent);
            const size = 34 * MEOWDOKU_SOURCE_SCALE * layout.fitScale;
            star.addComponent(UITransform).setContentSize(size, size);
            star.setPosition(
                Math.cos(angle) * radius * 0.4,
                centerY + Math.sin(angle) * radius * 0.4,
                0,
            );
            const sprite = star.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            sprite.color = new Color(255, 226, 138, 255);
            const opacity = star.addComponent(UIOpacity);
            tween(star)
                .to(0.5, {
                    position: new Vec3(
                        Math.cos(angle) * radius * 1.6,
                        centerY + Math.sin(angle) * radius * 1.6,
                        0,
                    ),
                    scale: new Vec3(0.2, 0.2, 1),
                }, { easing: 'quadOut' })
                .start();
            tween(opacity)
                .to(0.5, { opacity: 0 })
                .call(() => {
                    if (star.isValid) this.destroyNode(star);
                })
                .start();
        }
    }

    /** 猫咪姿态独立随机，并避开上一次用过的；同一个弹窗内不切换图片。 */
    private pickWinCatFrame(): SpriteFrame | undefined {
        const visuals = this.visuals;
        if (!visuals) return undefined;
        const pool = MEOWDOKU_WIN_CAT_KEYS.filter((key) => key !== this.lastWinCatKey);
        const source = pool.length > 0 ? pool : MEOWDOKU_WIN_CAT_KEYS;
        const key = source[Math.floor(Math.random() * source.length)]!;
        this.lastWinCatKey = key;
        return visuals.frames[key];
    }

    /** 从扩充后的标题池里随机挑一个，避开上一次用过的。 */
    private pickWinTitle(): string {
        const pool = MEOWDOKU_COPY.winTitles.filter((entry) => entry !== this.lastWinTitle);
        const source = pool.length > 0 ? pool : MEOWDOKU_COPY.winTitles;
        const picked = source[Math.floor(Math.random() * source.length)]!;
        this.lastWinTitle = picked;
        return picked;
    }

    private destroyWinOverlay(): void {
        const overlay = this.winOverlayNode;
        this.winOverlayNode = undefined;
        if (overlay?.isValid) this.destroyNode(overlay);
    }

    /** 生命值耗尽：记录失败次数（供下一局难度助攻），弹出失败页。 */
    private onLivesExhausted(): void {
        const model = this.model;
        this.state = 'failing';
        if (model) {
            this.recordFail(model.level);
            this.persistProgress();
        }
        this.context?.reportScore(model?.score ?? 0);
        this.showFailPage();
    }

    /**
     * 失败页（原作 `game_fail_page.tscn` 的素材与文案）：和通关页同一套一整列版式——
     * 标题「生命值耗尽」→ 关卡胶囊 → 单次出场的失落布偶猫 → 鼓励语 → 找到进度（数字高亮 + 进度条）
     * → 普通模式「看广告恢复红心 / 重新开始」，困难模式「重新开始 / 选择关卡」。
     */
    private showFailPage(): void {
        this.destroyFailPage();
        const spec = MEOWDOKU_RESULT_PAGE;
        const model = this.model;
        const columnHeight = spec.titleHeight + spec.chipGap + spec.chipHeight
            + spec.stageGap + spec.failStageHeight
            + spec.encourageGap + spec.encourageHeight
            + spec.cardGap + spec.failCardHeight
            + spec.buttonsGap + spec.primaryButtonHeight + spec.buttonGap
            + spec.secondaryButtonHeight + spec.buttonEdge;
        const { root, column, s } = this.createResultPage('FailPage', columnHeight);
        this.failPageNode = root;
        const top = columnHeight * s / 2;
        const titleY = top - spec.titleHeight * s / 2;
        const chipsY = top - (spec.titleHeight + spec.chipGap + spec.chipHeight / 2) * s;
        let cursor = top - (spec.titleHeight + spec.chipGap + spec.chipHeight + spec.stageGap) * s;

        // 布偶猫以单张图片做一次出场，按舞台宽高等比容纳整张图。
        const stageY = cursor - spec.failStageHeight * s / 2;
        const catHeight = spec.failCatHeight * s;
        const cat = this.placeResultCat(column, 'FailCat', this.visuals?.frames.failCat,
            catHeight, spec.cardWidth * s, stageY, s);
        this.placeHardResultStamp(cat, stageY, false);

        const title = this.createResultTitle(column, MEOWDOKU_COPY.failTitle, titleY);
        this.popResultTitle(title, 0.08);
        const chips = this.createResultChips(column, chipsY, [{ text: this.currentLevelLabel() }]);
        this.revealResultNode(chips, 0.24);
        cursor -= (spec.failStageHeight + spec.encourageGap) * s;

        const encourage = this.createLabel(
            column,
            'Encourage',
            spec.cardWidth * s,
            spec.encourageHeight * s,
            spec.encourageSize * s,
            MEOWDOKU_COLORS.resultEncourage,
        );
        setLabelBold(encourage, true);
        encourage.enableShadow = true;
        encourage.shadowColor = new Color(0, 0, 0, 102);
        encourage.shadowOffset = new Vec2(0, -3 * s);
        encourage.string = this.pickFailEncourage(model);
        encourage.node.setPosition(0, cursor - spec.encourageHeight * s / 2, 0);
        this.revealResultNode(encourage.node, 0.42);
        cursor -= (spec.encourageHeight + spec.cardGap) * s;

        const found = model?.placedCount ?? 0;
        const total = model?.size ?? 0;
        const card = this.createResultProgress(column, cursor - spec.failCardHeight * s / 2, found, total, 0.72);
        this.revealResultNode(card, 0.52);
        cursor -= (spec.failCardHeight + spec.buttonsGap) * s;

        const buttonWidth = spec.buttonWidth * s;
        const hard = this.mode === 'hard';
        const reviveHeight = spec.primaryButtonHeight * s;
        const revive = this.createPillButton(
            column,
            hard ? 'Restart' : 'Revive',
            buttonWidth,
            reviveHeight,
            hard ? MEOWDOKU_COPY.failRestart : MEOWDOKU_COPY.failRevive,
            hard ? 'primary' : 'ad',
            { fontSize: spec.primaryButtonFont * s, icon: hard ? undefined : this.visuals?.frames.iconAdPlay },
        );
        revive.setPosition(0, cursor - reviveHeight / 2, 0);
        this.revealResultNode(revive, 0.66);
        this.bindButton(revive, () => {
            if (this.state !== 'failing') return;
            if (hard) {
                this.destroyFailPage();
                this.restartCurrentLevel();
            } else {
                void this.requestRevive();
            }
        });
        cursor -= reviveHeight + spec.buttonGap * s;

        const restartHeight = spec.secondaryButtonHeight * s;
        const restart = this.createPillButton(
            column,
            hard ? 'SelectLevel' : 'Restart',
            buttonWidth,
            restartHeight,
            hard ? MEOWDOKU_COPY.pauseSelectLevel : MEOWDOKU_COPY.failRestart,
            'secondary',
            { fontSize: spec.secondaryButtonFont * s },
        );
        restart.setPosition(0, cursor - restartHeight / 2, 0);
        this.revealResultNode(restart, 0.76);
        this.bindButton(restart, () => {
            if (this.state !== 'failing') return;
            this.destroyFailPage();
            if (hard) this.openLevelSelect();
            else this.restartCurrentLevel();
        });
    }

    private isFailureState(): boolean {
        return this.state === 'failing' || (this.state === 'paused' && this.stateBeforePause === 'failing');
    }

    /** 看广告复活：补满 3 颗红心并继续本关（原作 `ReviveBtn` → `revive_requested`）。 */
    private async requestRevive(): Promise<void> {
        const model = this.model;
        const runId = this.levelRunId;
        if (this.mode === 'hard' || !this.isFailureState() || !model || this.revivePending) return;
        this.revivePending = true;
        try {
            const ads = this.context?.services.ads;
            const result: AdResult = ads
                ? await ads.showRewarded({
                    placement: 'meowdoku-tool',
                    gameId: this.context?.gameId ?? 'meowdoku',
                    sessionId: this.context?.sessionId,
                })
                : { outcome: 'failed' as const };
            // 广告期间可能退出、重开或切换模式；旧局广告不能给新局补命。
            if (this.model !== model || this.levelRunId !== runId || !this.isFailureState()) return;
            const paused = this.state === 'paused';
            if (result?.outcome !== 'completed') {
                if (result?.errorCode !== 'not-configured') {
                    this.showToast(MEOWDOKU_COPY.adUnavailable);
                }
                return;
            }
            this.destroyFailPage();
            // 原作 `_on_revive_requested()`：`_lives = _life_cap`（默认 3 条），不是补 1 条。
            model.restoreLives(MEOWDOKU_COPY.reviveLives);
            // 广告完成时仍在后台，补命后保持暂停，等应用状态机恢复再继续。
            if (paused) this.stateBeforePause = 'playing';
            else this.state = 'playing';
            this.inputLocked = paused;
            this.reviveCatsToIdle();
            this.refreshHud();
            this.persistProgress();
        } catch (error) {
            // TODO: console.warn('[MeowdokuGame] Revive ad failed.', error);
            if (this.model === model && this.levelRunId === runId && this.state === 'failing') {
                this.showToast(MEOWDOKU_COPY.adUnavailable);
            }
        } finally {
            this.revivePending = false;
        }
    }

    private destroyFailPage(): void {
        const node = this.failPageNode;
        this.failPageNode = undefined;
        if (node?.isValid) this.destroyNode(node);
    }

    private showToast(text: string): void {
        const toast = this.toastNode;
        const opacity = this.toastOpacity;
        if (!toast?.isValid || !opacity) return;
        if (this.toastLabel) this.toastLabel.string = text;
        toast.active = true;
        opacity.opacity = 0;
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(0.16, { opacity: 255 })
            .delay(0.8)
            .to(0.16, { opacity: 0 })
            .call(() => {
                if (toast.isValid) toast.active = false;
            })
            .start();
    }

    // ---------------------------------------------------------------- 结算页公共件

    /**
     * 结算页骨架：全屏挡输入 + 淡入的暖调深色蒙层（允许 cover 铺满）+ 一列内容。
     * 这一列在胶囊下方与底部安全区之间居中，放不下时整列等比缩小；高屏保留上下留白。
     * 返回的 `s` 是列内使用的设计像素比例（750 设计宽 × `fitScale`）。
     */
    private createResultPage(name: string, columnDesignHeight: number): { root: Node; column: Node; s: number } {
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const root = new Node(name);
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(layout.width, layout.height);
        root.setPosition(0, 0, 0);
        root.addComponent(BlockInputEvents);

        const dimmer = new Node('Dimmer');
        dimmer.layer = this.node.layer;
        dimmer.setParent(root);
        dimmer.addComponent(UITransform).setContentSize(layout.width, layout.height);
        const graphics = dimmer.addComponent(Graphics);
        graphics.fillColor = MEOWDOKU_COLORS.resultDim;
        graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
        graphics.fill();
        const dimOpacity = dimmer.addComponent(UIOpacity);
        dimOpacity.opacity = 0;
        tween(dimOpacity).to(0.2, { opacity: 255 }).start();

        const columnHeight = columnDesignHeight * s;
        const column = new Node('Column');
        column.layer = this.node.layer;
        column.setParent(root);
        column.addComponent(UITransform).setContentSize(layout.width, columnHeight);
        const available = layout.height - layout.safeTop - layout.safeBottom
            - 2 * MEOWDOKU_RESULT_PAGE.edgeGap * s;
        const fit = Math.min(1, available / Math.max(1, columnHeight));
        column.setPosition(0, (layout.safeBottom - layout.safeTop) / 2, 0);
        column.setScale(fit, fit, 1);
        return { root, column, s };
    }

    /** 结算页标题：白色粗体字身 + 橙色描边（原作 `TitleLabelUp` 的 legacy 风格，不带投影）。 */
    private createResultTitle(parent: Node, text: string, y: number): Node {
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const spec = MEOWDOKU_RESULT_PAGE;
        const title = this.createLabel(
            parent,
            'Title',
            layout.width - 80 * s,
            spec.titleHeight * s,
            spec.titleSize * s,
            Color.WHITE,
        );
        setLabelBold(title, true);
        title.spacingX = spec.titleLetterSpacing * s;
        title.enableOutline = true;
        title.outlineColor = MEOWDOKU_COLORS.winTitleOutline;
        title.outlineWidth = spec.titleOutline * s;
        title.string = text;
        title.node.setPosition(0, y, 0);
        return title.node;
    }

    /** 标题出场：淡入并 1.6 → 0.9 → 1 挤压弹出（原作 `TitleLabelUp` 的节奏）。 */
    private popResultTitle(node: Node, delay: number): void {
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(1.6, 1.6, 1);
        tween(opacity).delay(delay).to(MEOWDOKU_TIMING.winTitleFade, { opacity: 255 }).start();
        tween(node)
            .delay(delay)
            .to(MEOWDOKU_TIMING.winTitleSquash, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'quadIn' })
            .to(MEOWDOKU_TIMING.winTitleSettle, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
    }

    /** 列内元素出场：延时后从下方 24 设计像素处上浮并淡入。 */
    private revealResultNode(node: Node, delay: number, duration = 0.24): void {
        const s = this.requireLayout().fitScale;
        const target = node.position.clone();
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setPosition(target.x, target.y - 24 * s, target.z);
        tween(opacity).delay(delay).to(duration, { opacity: 255 }).start();
        tween(node).delay(delay).to(duration, { position: target }, { easing: 'quadOut' }).start();
    }

    /** 标题下的一排胶囊（关卡号、完美通关与专属称号），宽度随文字、整排居中。 */
    private createResultChips(
        parent: Node,
        y: number,
        chips: readonly { readonly text: string; readonly perfect?: boolean; readonly genius?: boolean }[],
    ): Node {
        const s = this.requireLayout().fitScale;
        const spec = MEOWDOKU_RESULT_PAGE;
        const colors = this.levelSelectColors();
        const height = spec.chipHeight * s;
        const row = new Node('Chips');
        row.layer = this.node.layer;
        row.setParent(parent);
        row.setPosition(0, y, 0);
        const nodes = chips.map((chip, index) => {
            const node = new Node(`Chip${index}`);
            node.layer = this.node.layer;
            node.setParent(row);
            const label = this.createLabel(
                node,
                'Label',
                spec.cardWidth * s,
                height,
                spec.chipFontSize * s,
                chip.genius ? MEOWDOKU_COLORS.resultGeniusText
                    : chip.perfect ? MEOWDOKU_COLORS.resultPerfectText : colors.levelChipText,
            );
            setLabelBold(label, true);
            label.overflow = Label.Overflow.NONE;
            label.string = chip.text;
            label.updateRenderData(true);
            const width = label.node.getComponent(UITransform)!.width + spec.chipPadX * 2 * s;
            node.addComponent(UITransform).setContentSize(width, height);
            const graphics = node.addComponent(Graphics);
            if (chip.genius || chip.perfect) {
                this.drawRoundedRect(
                    graphics,
                    width,
                    height,
                    height / 2,
                    chip.genius ? MEOWDOKU_COLORS.resultGenius : MEOWDOKU_COLORS.resultPerfect,
                );
            } else {
                this.drawLevelChip(graphics, width, height);
            }
            return { node, width };
        });
        const gap = spec.chipSpacing * s;
        const total = nodes.reduce((sum, entry) => sum + entry.width, 0) + gap * Math.max(0, nodes.length - 1);
        row.addComponent(UITransform).setContentSize(total, height);
        let x = -total / 2;
        for (const entry of nodes) {
            entry.node.setPosition(x + entry.width / 2, 0, 0);
            x += entry.width + gap;
        }
        return row;
    }

    /** 结算信息卡底板：半透明暖白 + 细描边。 */
    private createResultCard(parent: Node, name: string, y: number, height: number): Node {
        const s = this.requireLayout().fitScale;
        const spec = MEOWDOKU_RESULT_PAGE;
        const width = spec.cardWidth * s;
        const radius = spec.cardRadius * s;
        const card = new Node(name);
        card.layer = this.node.layer;
        card.setParent(parent);
        card.addComponent(UITransform).setContentSize(width, height);
        card.setPosition(0, y, 0);
        const graphics = card.addComponent(Graphics);
        graphics.fillColor = MEOWDOKU_COLORS.resultCard;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.lineWidth = 2 * s;
        graphics.strokeColor = MEOWDOKU_COLORS.resultCardStroke;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.stroke();
        return card;
    }

    /** 通关信息卡：等分几栏，每栏上面小标签、下面大数值，栏间细分隔线。 */
    private createResultStats(
        parent: Node,
        y: number,
        stats: readonly { readonly label: string; readonly value: string }[],
    ): Node {
        const s = this.requireLayout().fitScale;
        const spec = MEOWDOKU_RESULT_PAGE;
        const width = spec.cardWidth * s;
        const height = spec.winCardHeight * s;
        const card = this.createResultCard(parent, 'Stats', y, height);
        const graphics = card.getComponent(Graphics)!;
        const columnWidth = width / Math.max(1, stats.length);
        const dividerHalf = spec.statDividerHeight * s / 2;
        stats.forEach((stat, index) => {
            const x = -width / 2 + columnWidth * (index + 0.5);
            const label = this.createLabel(
                card,
                `Label${index}`,
                columnWidth - 16 * s,
                40 * s,
                spec.statLabelSize * s,
                MEOWDOKU_COLORS.resultLabel,
            );
            label.string = stat.label;
            label.node.setPosition(x, 30 * s, 0);
            const value = this.createLabel(
                card,
                `Value${index}`,
                columnWidth - 16 * s,
                64 * s,
                spec.statValueSize * s,
                MEOWDOKU_COLORS.resultValue,
            );
            setLabelBold(value, true);
            value.string = stat.value;
            value.node.setPosition(x, -20 * s, 0);
            if (index > 0) {
                const dividerX = -width / 2 + columnWidth * index;
                graphics.moveTo(dividerX, -dividerHalf);
                graphics.lineTo(dividerX, dividerHalf);
                graphics.stroke();
            }
        });
        return card;
    }

    /** 失败页进度卡：「已找到 N / M 只猫咪」（数字高亮）+ 一条延时长满的进度条。 */
    private createResultProgress(parent: Node, y: number, found: number, total: number, fillDelay: number): Node {
        const s = this.requireLayout().fitScale;
        const spec = MEOWDOKU_RESULT_PAGE;
        const height = spec.failCardHeight * s;
        const card = this.createResultCard(parent, 'Progress', y, height);

        const text = new Node('Text');
        text.layer = this.node.layer;
        text.setParent(card);
        text.addComponent(UITransform).setContentSize(spec.cardWidth * s, 56 * s);
        text.setPosition(0, 30 * s, 0);
        this.createHighlightedText(
            text,
            MEOWDOKU_COPY.failProgress(found, total),
            Math.round(spec.progressTextSize * s),
            spec.cardWidth * s - 48 * s,
            MEOWDOKU_COLORS.resultHighlight,
        );

        const barWidth = spec.progressBarWidth * s;
        const barHeight = spec.progressBarHeight * s;
        const barY = -34 * s;
        const track = new Node('Track');
        track.layer = this.node.layer;
        track.setParent(card);
        track.addComponent(UITransform).setContentSize(barWidth, barHeight);
        track.setPosition(0, barY, 0);
        this.drawRoundedRect(track.addComponent(Graphics), barWidth, barHeight, barHeight / 2, MEOWDOKU_COLORS.resultTrack);

        const ratio = total > 0 ? Math.min(1, Math.max(0, found / total)) : 0;
        if (ratio > 0) {
            // 填充节点左对齐在轨道起点，横向从 0 缩放到 1，表现为进度条「长」出来。
            const fillWidth = Math.max(barHeight, barWidth * ratio);
            const fill = new Node('Fill');
            fill.layer = this.node.layer;
            fill.setParent(card);
            const transform = fill.addComponent(UITransform);
            transform.setContentSize(fillWidth, barHeight);
            transform.setAnchorPoint(0, 0.5);
            fill.setPosition(-barWidth / 2, barY, 0);
            const graphics = fill.addComponent(Graphics);
            graphics.fillColor = MEOWDOKU_COLORS.resultFill;
            graphics.roundRect(0, -barHeight / 2, fillWidth, barHeight, barHeight / 2);
            graphics.fill();
            fill.setScale(0, 1, 1);
            tween(fill)
                .delay(fillDelay)
                .to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .start();
        }
        return card;
    }

    /** 单张透明结算猫：淡入、轻轻上浮并回弹一次，之后保持静态。 */
    private placeResultCat(
        parent: Node,
        name: string,
        frame: SpriteFrame | undefined,
        displayHeight: number,
        maxWidth: number,
        y: number,
        designScale: number,
    ): Node | undefined {
        if (!frame) return undefined;
        const source = frame.originalSize;
        const fit = Math.min(displayHeight / Math.max(1, source.height), maxWidth / Math.max(1, source.width));
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(source.width * fit, source.height * fit);
        node.setPosition(0, y, 0);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
        const spec = MEOWDOKU_RESULT_PAGE;
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.setScale(spec.catStartScale, spec.catStartScale, 1);
        node.setPosition(0, y - spec.catLift * designScale, 0);
        this.feedbackNodes.add(node);
        tween(opacity).to(spec.catFadeDuration, { opacity: 255 }, { easing: 'quadOut' }).start();
        tween(node)
            .to(spec.catGrowDuration, {
                position: new Vec3(0, y + spec.catOvershoot * designScale, 0),
                scale: new Vec3(spec.catPeakScale, spec.catPeakScale, 1),
            }, { easing: 'quadOut' })
            .to(spec.catSettleDuration, {
                position: new Vec3(0, y, 0),
                scale: new Vec3(1, 1, 1),
            }, { easing: 'sineInOut' })
            .call(() => this.feedbackNodes.delete(node))
            .start();
        if (this.state === 'paused') {
            Tween.pauseAllByTarget(node);
            Tween.pauseAllByTarget(opacity);
        }
        return node;
    }

    /** 困难结算印章：透明圆环叠在猫图右下角，通关盖下回弹，失败直接保持静态。 */
    private placeHardResultStamp(cat: Node | undefined, catY: number, animated: boolean): Node | undefined {
        if (this.mode !== 'hard' || !cat?.parent) return undefined;
        const s = this.requireLayout().fitScale;
        const spec = MEOWDOKU_HARD_RESULT_STAMP;
        const catSize = cat.getComponent(UITransform)!;
        const diameter = spec.diameter * s;
        const radius = diameter / 2;
        const target = new Vec3(cat.position.x + catSize.width * spec.catOffsetX,
            catY - catSize.height * spec.catOffsetY, 0);
        // 与猫同属安全区内的结算列，印章独立于猫的入场缩放，盖下后固定在图区。
        const stamp = new Node('HardModeStamp');
        stamp.layer = this.node.layer;
        stamp.setParent(cat.parent);
        stamp.addComponent(UITransform).setContentSize(diameter, diameter);
        stamp.setPosition(target);
        stamp.angle = spec.angle;

        const inset = spec.borderInset * s;
        const drawRings = (graphics: Graphics, spread: number, offsetY: number): void => {
            graphics.lineWidth = spec.outerBorder * s + spread * 2;
            graphics.circle(0, offsetY, radius - spec.outerBorder * s / 2);
            graphics.stroke();
            graphics.lineWidth = spec.innerBorder * s + spread * 2;
            graphics.circle(0, offsetY, radius - inset);
            graphics.stroke();
        };
        // 只沿笔画叠出渐淡的暖白柔影，圆环内部仍透明；玫瑰色本体绘在子层上方。
        const shadow = stamp.addComponent(Graphics);
        const shadowColor = spec.shadowColor.clone();
        shadowColor.a = Math.round(shadowColor.a / spec.shadowLayers);
        shadow.strokeColor = shadowColor;
        for (let layer = 0; layer < spec.shadowLayers; layer += 1) {
            const spread = spec.shadowBlur * s * (spec.shadowLayers - 1 - layer) / (spec.shadowLayers - 1);
            drawRings(shadow, spread, -spec.shadowOffset * s);
        }
        const rings = new Node('Rings');
        rings.layer = this.node.layer;
        rings.setParent(stamp);
        rings.addComponent(UITransform).setContentSize(diameter, diameter);
        const graphics = rings.addComponent(Graphics);
        graphics.strokeColor = spec.ink;
        drawRings(graphics, 0, 0);
        const label = this.createLabel(stamp, 'Label', diameter - 4 * inset, diameter - 4 * inset,
            spec.fontSize * s, spec.ink);
        setLabelBold(label, true);
        label.spacingX = spec.letterSpacing * s;
        label.enableShadow = true;
        label.shadowColor = spec.shadowColor;
        label.shadowOffset = new Vec2(0, -spec.shadowOffset * s);
        label.shadowBlur = spec.shadowBlur * s;
        label.string = MEOWDOKU_COPY.hardResultStamp;
        const opacity = stamp.addComponent(UIOpacity);
        if (!animated) return stamp;

        opacity.opacity = 0;
        stamp.setScale(spec.startScale, spec.startScale, 1);
        stamp.setPosition(target.x, target.y + spec.lift * s, 0);
        stamp.angle = spec.startAngle;
        this.feedbackNodes.add(stamp);
        tween(opacity).delay(spec.delay).to(spec.fadeDuration, { opacity: 255 }).start();
        tween(stamp)
            .delay(spec.delay)
            .to(spec.pressDuration, {
                position: target,
                scale: new Vec3(spec.pressScaleX, spec.pressScaleY, 1),
                angle: spec.angle,
            }, { easing: 'quadIn' })
            .to(spec.reboundDuration, { scale: new Vec3(spec.reboundScale, spec.reboundScale, 1) }, { easing: 'quadOut' })
            .to(spec.settleDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
            .call(() => this.feedbackNodes.delete(stamp))
            .start();
        if (this.state === 'paused') {
            Tween.pauseAllByTarget(stamp);
            Tween.pauseAllByTarget(opacity);
        }
        return stamp;
    }

    /** 关卡号胶囊文案，引导盘不算正式关卡时仍按第 1 关显示。 */
    private currentLevelLabel(): string {
        const level = this.model?.level ?? this.levelIndex + 1;
        return MEOWDOKU_COPY.levelTitle(level);
    }

    /** 用时显示为 `m:ss`。 */
    private formatResultTime(seconds: number): string {
        const total = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(total / 60);
        const rest = total % 60;
        return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    // ---------------------------------------------------------------- HUD

    private refreshHud(): void {
        const model = this.model;
        if (!model) return;
        if (this.levelValueLabel?.isValid) {
            this.levelValueLabel.string = MEOWDOKU_COPY.levelTitle(model.level);
        }
        if (this.scoreLabel?.isValid && this.displayedScore === model.score) {
            this.scoreLabel.string = `${model.score}`;
        }
        this.refreshLifeBar();
        this.refreshCatList();
    }

    /**
     * 猫咪列表：第 i 格对应第 i 种颜色（原作 `cat_progress_slot.apply_state`）。
     * 没找到画头像透明轮廓的区域色剪影，找到了换原色猫脸并弹一下。
     */
    private refreshCatList(): void {
        const model = this.model;
        if (!model) return;
        const palette = meowdokuRegionPalette();
        const foundRegions = new Set<number>();
        for (const [row, col] of model.placedCats()) {
            foundRegions.add(model.board.regions[row]![col]!);
        }
        for (let index = 0; index < this.catSlotNodes.length; index += 1) {
            const regionId = index;
            const paletteSlot = model.board.colorMap[regionId] ?? regionId;
            const color = palette[paletteSlot % palette.length]!;
            const found = foundRegions.has(regionId);
            const wasFound = this.catSlotFound[index] === true;
            if (this.catSlotPalette[index] === paletteSlot && this.catSlotFound[index] === found) continue;
            this.catSlotFound[index] = found;
            this.catSlotPalette[index] = paletteSlot;

            const base = this.catSlotBases[index];
            const face = this.catSlotFaces[index];
            if (base?.isValid) {
                base.node.active = !found;
                base.color = new Color(color.r, color.g, color.b, Math.round(255 * MEOWDOKU_TIMING.catSlotSilhouetteAlpha));
            }
            if (!face?.isValid) continue;
            face.node.active = found;
            face.color = Color.WHITE;
            if (found && !wasFound) {
                face.node.setScale(0, 0, 1);
                tween(face.node)
                    .to(MEOWDOKU_TIMING.catSlotPopIn, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'quadOut' })
                    .to(MEOWDOKU_TIMING.catSlotPopSettle, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                    .start();
            } else if (!found) {
                face.node.setScale(1, 1, 1);
            }
        }
    }

    /** 完整红心与碎片共用外轮廓，两半沿同一条锯齿裂缝拼合。 */
    private drawLifeHeart(
        graphics: Graphics,
        size: number,
        alive: boolean,
        half?: 'left' | 'right',
    ): void {
        const unit = size / 60;
        graphics.clear();
        graphics.fillColor = alive ? MEOWDOKU_COLORS.lifeHeart : MEOWDOKU_COLORS.lifeLost;
        graphics.moveTo(0, -22 * unit);
        if (half !== 'right') {
            graphics.bezierCurveTo(-7 * unit, -16 * unit, -25 * unit, -3 * unit, -25 * unit, 10 * unit);
            graphics.bezierCurveTo(-25 * unit, 26 * unit, -7 * unit, 29 * unit, 0, 15 * unit);
        } else {
            // 从底端向上走裂缝，和左半心的路径完全重合。
            graphics.lineTo(3 * unit, -9 * unit);
            graphics.lineTo(-3 * unit, -2 * unit);
            graphics.lineTo(3 * unit, 6 * unit);
            graphics.lineTo(0, 15 * unit);
        }
        if (half !== 'left') {
            graphics.bezierCurveTo(7 * unit, 29 * unit, 25 * unit, 26 * unit, 25 * unit, 10 * unit);
            graphics.bezierCurveTo(25 * unit, -3 * unit, 7 * unit, -16 * unit, 0, -22 * unit);
        } else {
            graphics.lineTo(3 * unit, 6 * unit);
            graphics.lineTo(-3 * unit, -2 * unit);
            graphics.lineTo(3 * unit, -9 * unit);
            graphics.lineTo(0, -22 * unit);
        }
        graphics.close();
        graphics.fill();
    }

    /** 完整红心先放大，再从中心裂开并淡出，露出浅金色生命槽。 */
    private playLifeHeartLost(slot: Node, size: number): void {
        const timing = MEOWDOKU_TIMING;
        const root = new Node('LifeHeartLost');
        root.layer = slot.layer;
        root.setParent(slot);
        root.addComponent(UITransform).setContentSize(size, size);
        const whole = root.addComponent(Graphics);
        this.drawLifeHeart(whole, size, true);
        const opacity = root.addComponent(UIOpacity);
        const pieces: Node[] = [];
        for (const direction of [-1, 1]) {
            const piece = new Node('LifeHeartPiece');
            piece.layer = slot.layer;
            piece.setParent(root);
            piece.addComponent(UITransform).setContentSize(size, size);
            this.drawLifeHeart(piece.addComponent(Graphics), size, true, direction < 0 ? 'left' : 'right');
            // 放大阶段使用完整轮廓，避免两片拼合处出现抗锯齿细缝。
            piece.active = false;
            pieces.push(piece);
        }
        tween(root)
            .to(timing.lifeHeartPop, {
                scale: new Vec3(timing.lifeHeartPopScale, timing.lifeHeartPopScale, 1),
            }, { easing: 'quadOut' })
            .call(() => {
                whole.clear();
                pieces.forEach((piece, index) => {
                    const direction = index === 0 ? -1 : 1;
                    piece.active = true;
                    tween(piece)
                        .to(timing.lifeHeartCrack, {
                            position: new Vec3(direction * size * 0.06, 0, 0),
                            angle: direction * -6,
                        }, { easing: 'quadOut' })
                        .to(timing.lifeHeartFade, {
                            position: new Vec3(direction * size * 0.19, -size * 0.1, 0),
                            angle: direction * -20,
                            scale: new Vec3(0.75, 0.75, 1),
                        }, { easing: 'quadIn' })
                        .start();
                });
                tween(opacity)
                    .delay(timing.lifeHeartCrack)
                    .to(timing.lifeHeartFade, { opacity: 0 }, { easing: 'quadIn' })
                    .call(() => this.destroyNode(root))
                    .start();
            })
            .start();
    }

    /** 只为本次扣掉的红心播放动画，普通 HUD 刷新不打断正在消散的碎片。 */
    private refreshLifeBar(lostIndex = -1): void {
        const lives = this.model?.lives ?? 0;
        if (lives === this.renderedLives && lostIndex < 0) return;
        this.renderedLives = lives;
        const size = this.requireLayout().lifeSlotSize;
        this.lifeSlotNodes.forEach((node, index) => {
            const alive = index < lives;
            const graphics = node.getComponent(Graphics);
            if (graphics) this.drawLifeHeart(graphics, size, alive);
            if (alive || index === lostIndex) {
                // 复活或重复触发时清理旧碎片及其补间。
                node.children.slice().forEach((child) => this.destroyNode(child));
            }
            if (!alive && index === lostIndex) this.playLifeHeartLost(node, size);
        });
    }

    private createIconButton(
        parent: Node,
        name: string,
        frame: SpriteFrame | undefined,
        x: number,
        y: number,
        onClick: () => void,
        diameter = this.requireLayout().hudButtonTouch,
    ): Node {
        const layout = this.requireLayout();
        const button = new Node(name);
        button.layer = this.node.layer;
        button.setParent(parent);
        button.addComponent(UITransform).setContentSize(diameter, diameter);
        button.setPosition(x, y, 0);

        const circle = new Node('Circle');
        circle.layer = this.node.layer;
        circle.setParent(button);
        circle.addComponent(UITransform).setContentSize(diameter, diameter);
        const graphics = circle.addComponent(Graphics);
        graphics.fillColor = MEOWDOKU_COLORS.hudButton;
        graphics.circle(0, 0, diameter / 2);
        graphics.fill();

        if (frame) {
            const icon = new Node('Icon');
            icon.layer = this.node.layer;
            icon.setParent(button);
            icon.addComponent(UITransform).setContentSize(
                diameter * 0.6,
                diameter * 0.6,
            );
            const sprite = icon.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            // 图标是原作带颜色的美术，不能叠加染色。
            sprite.color = Color.WHITE;
        }

        this.bindButton(button, onClick);
        return button;
    }

    private bindButton(button: Node, onClick: () => void): void {
        let lastPointerAt = 0;
        let pressed = false;
        const press = (): void => {
            if (!button.isValid) return;
            pressed = true;
            button.setScale(0.94, 0.94, 1);
        };
        const release = (): void => {
            pressed = false;
            if (!button.isValid) return;
            button.setScale(1, 1, 1);
        };
        button.on(Node.EventType.TOUCH_START, press, this);
        button.on(Node.EventType.TOUCH_CANCEL, () => {
            lastPointerAt = Date.now();
            release();
        }, this);
        button.on(Node.EventType.TOUCH_END, () => {
            const wasPressed = pressed;
            lastPointerAt = Date.now();
            release();
            // 按钮可能刚在另一按钮的结束事件里显示（例如提示→应用）。
            // 没收到本次按下的按钮不能接走抬起/合成事件。
            if (wasPressed) {
                onClick();
            }
        }, this);
        // 浏览器预览会同时派发触摸和合成鼠标事件，这里忽略触摸后 500ms 内的鼠标事件。
        button.on(Node.EventType.MOUSE_DOWN, () => {
            if (Date.now() < lastPointerAt + 500) return;
            press();
        }, this);
        button.on(Node.EventType.MOUSE_UP, () => {
            const now = Date.now();
            const wasPressed = pressed;
            release();
            if (!wasPressed || now < lastPointerAt + 500) return;
            onClick();
        }, this);
    }

    /** 请求暂停：优先走运行层状态机，运行层没有接管时退回本页面的暂停弹窗。 */
    private requestPause(): void {
        if (!this.context || this.state === 'disposed') return;
        this.context?.services.feedback.play('uiButton');
        try {
            this.context.requestPause();
        } catch (error: unknown) {
            // TODO: console.error('[MeowdokuGame] Pause request failed.', error);
        }
    }

    private restartCurrentLevel(): void {
        if (this.state === 'disposed' || this.state === 'idle') return;
        this.destroyOverlay();
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.clearProgress();
        this.context?.services.feedback.play('uiButton');
        // 重开也要走一次开局提示：难度助攻生效时必须告诉玩家多了一只猫。
        this.startLevel(this.levelIndex, undefined, undefined, true);
    }

    // ---------------------------------------------------------------- 弹层

    /**
     * 通用弹窗（暂停 / 结算）：暖调蒙层 + 白色圆角卡片，粗体标题下可带一枚副标题胶囊标签；
     * 主操作是暖橙色实心按钮，其余是浅色按钮，都带底部厚边。
     * 整张卡片按上下安全区等比缩放，打开时蒙层淡入、卡片回弹放大。
     */
    private showOverlay(
        title: string,
        subtitle: string | undefined,
        entries: readonly OverlayEntry[],
        onClose?: () => void,
    ): void {
        this.destroyOverlay();
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const overlay = new Node('Overlay');
        overlay.layer = this.node.layer;
        overlay.setParent(this.node);
        overlay.addComponent(UITransform).setContentSize(layout.width, layout.height);
        overlay.setPosition(0, 0, 0);
        overlay.addComponent(BlockInputEvents);
        this.overlayOnClose = onClose;

        const dimmer = new Node('Dimmer');
        dimmer.layer = this.node.layer;
        dimmer.setParent(overlay);
        dimmer.addComponent(UITransform).setContentSize(layout.width, layout.height);
        const dimGraphics = dimmer.addComponent(Graphics);
        dimGraphics.fillColor = MEOWDOKU_COLORS.overlayDim;
        dimGraphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
        dimGraphics.fill();
        const dimOpacity = dimmer.addComponent(UIOpacity);
        dimOpacity.opacity = 0;
        tween(dimOpacity).to(0.16, { opacity: 255 }).start();

        // ---- 卡片尺寸（设计像素 × fitScale）
        const panelWidth = 600 * s;
        const buttonWidth = 480 * s;
        const buttonHeight = 100 * s;
        const buttonGap = 22 * s;
        const padTop = 52 * s;
        const padBottom = 48 * s;
        const titleHeight = 72 * s;
        const chipHeight = subtitle ? 48 * s : 0;
        const chipGap = subtitle ? 12 * s : 0;
        const headerGap = 36 * s;
        const buttonsHeight = entries.length * buttonHeight + Math.max(0, entries.length - 1) * buttonGap;
        const panelHeight = padTop + titleHeight + chipGap + chipHeight + headerGap + buttonsHeight + padBottom;

        const card = new Node('Card');
        card.layer = this.node.layer;
        card.setParent(overlay);
        card.addComponent(UITransform).setContentSize(panelWidth, panelHeight);
        // 卡片落在胶囊下方与底部安全区之间居中，放不下就等比缩小。
        const available = layout.height - layout.safeTop - layout.safeBottom - 48 * s;
        const fit = Math.min(1, available / Math.max(1, panelHeight + 12 * s));
        card.setPosition(0, (layout.safeBottom - layout.safeTop) / 2, 0);

        const face = card.addComponent(Graphics);
        const corner = 48 * s;
        face.fillColor = MEOWDOKU_COLORS.panelShadow;
        face.roundRect(-panelWidth / 2, -panelHeight / 2 - 12 * s, panelWidth, panelHeight, corner);
        face.fill();
        face.fillColor = MEOWDOKU_COLORS.toast;
        face.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, corner);
        face.fill();

        let cursor = panelHeight / 2 - padTop;
        const titleLabel = this.createLabel(card, 'Title', panelWidth - 80 * s, titleHeight, 52 * s, MEOWDOKU_COLORS.title);
        setLabelBold(titleLabel, true);
        titleLabel.string = title;
        titleLabel.node.setPosition(0, cursor - titleHeight / 2, 0);
        cursor -= titleHeight + chipGap;
        if (subtitle) {
            // 关卡号胶囊使用当前模式配色，宽度随文字。
            const colors = this.levelSelectColors();
            const chip = new Node('Subtitle');
            chip.layer = this.node.layer;
            chip.setParent(card);
            chip.setPosition(0, cursor - chipHeight / 2, 0);
            const chipLabel = this.createLabel(chip, 'Label', panelWidth, chipHeight, 26 * s, colors.levelChipText);
            setLabelBold(chipLabel, true);
            chipLabel.overflow = Label.Overflow.NONE;
            chipLabel.string = subtitle;
            chipLabel.updateRenderData(true);
            const chipWidth = Math.min(
                panelWidth - 80 * s,
                chipLabel.node.getComponent(UITransform)!.width + 48 * s,
            );
            chip.addComponent(UITransform).setContentSize(chipWidth, chipHeight);
            this.drawLevelChip(
                chip.addComponent(Graphics),
                chipWidth,
                chipHeight,
            );
            cursor -= chipHeight;
        }
        cursor -= headerGap;

        entries.forEach((entry, index) => {
            const button = this.createPillButton(
                card,
                `Action${index}`,
                buttonWidth,
                buttonHeight,
                entry.label,
                entry.primary === true ? 'primary' : 'secondary',
            );
            button.setPosition(0, cursor - buttonHeight / 2, 0);
            if (entry.hardModeNotice) this.createHardModeNotice(button, { diameter: 44 });
            cursor -= buttonHeight + buttonGap;
            this.bindButton(button, () => {
                void Promise.resolve()
                    .then(entry.action)
                    .catch((error: unknown) => {
                        // TODO: console.error('[MeowdokuGame] Overlay action failed.', error);
                    });
            });
        });

        const cardOpacity = card.addComponent(UIOpacity);
        cardOpacity.opacity = 0;
        card.setScale(fit * 0.86, fit * 0.86, 1);
        tween(card).to(0.24, { scale: new Vec3(fit, fit, 1) }, { easing: 'backOut' }).start();
        tween(cardOpacity).to(0.12, { opacity: 255 }).start();

        this.overlayNode = overlay;
    }

    /**
     * 胶囊按钮：底部一条深色厚边 + 按钮面 + 居中粗体文字（可带一枚图标，图标与文字整体居中）。
     * `primary` 暖橙实心、`ad` 看广告绿色实心、`secondary` 浅色描边。
     */
    private createPillButton(
        parent: Node,
        name: string,
        width: number,
        height: number,
        text: string,
        style: PillButtonStyle,
        options: { readonly fontSize?: number; readonly icon?: SpriteFrame | null; readonly palette?: PillButtonPalette } = {},
    ): Node {
        const s = this.requireLayout().fitScale;
        const palette = options.palette ?? PILL_BUTTON_PALETTES[style];
        const button = new Node(name);
        button.layer = this.node.layer;
        button.setParent(parent);
        button.addComponent(UITransform).setContentSize(width, height);
        const graphics = button.addComponent(Graphics);
        this.drawPillButton(graphics, width, height, palette);
        const label = this.createLabel(
            button,
            'Label',
            width - 48 * s,
            height - 16 * s,
            options.fontSize ?? (style === 'secondary' ? 34 : 38) * s,
            palette.text,
        );
        setLabelBold(label, true);
        label.string = text;
        label.node.setPosition(0, 0, 0);

        const icon = options.icon;
        if (icon) {
            const spec = MEOWDOKU_RESULT_PAGE;
            const iconHeight = spec.adIconHeight * s;
            const iconWidth = iconHeight * (icon.rect.height > 0 ? icon.rect.width / icon.rect.height : 1);
            const gap = spec.adIconGap * s;
            label.overflow = Label.Overflow.NONE;
            label.updateRenderData(true);
            const textWidth = label.node.getComponent(UITransform)!.width;
            const total = iconWidth + gap + textWidth;
            const iconNode = new Node('Icon');
            iconNode.layer = this.node.layer;
            iconNode.setParent(button);
            iconNode.addComponent(UITransform).setContentSize(iconWidth, iconHeight);
            iconNode.setPosition(-total / 2 + iconWidth / 2, 0, 0);
            const sprite = iconNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = icon;
            sprite.color = palette.text;
            label.node.setPosition(-total / 2 + iconWidth + gap + textWidth / 2, 0, 0);
        }
        return button;
    }

    private drawPillButton(graphics: Graphics, width: number, height: number, palette: PillButtonPalette): void {
        const s = this.requireLayout().fitScale;
        const radius = height / 2;
        graphics.clear();
        graphics.fillColor = palette.edge;
        graphics.roundRect(-width / 2, -height / 2 - 6 * s, width, height, radius);
        graphics.fill();
        graphics.fillColor = palette.face;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        if (palette.stroke) {
            graphics.lineWidth = 3 * s;
            graphics.strokeColor = palette.stroke;
            graphics.roundRect(-width / 2, -height / 2, width, height, radius);
            graphics.stroke();
        }
    }

    // ---------------------------------------------------------------- 选关页

    private levelSelectColors(): typeof MEOWDOKU_COLORS {
        return this.mode === 'hard' ? MEOWDOKU_HARD_MODE_COLORS : MEOWDOKU_COLORS;
    }

    private levelSelectButtonPalette(style: 'primary' | 'secondary'): PillButtonPalette {
        if (this.mode !== 'hard') return PILL_BUTTON_PALETTES[style];
        const colors = this.levelSelectColors();
        return style === 'primary'
            ? { face: colors.winButton, edge: colors.primaryEdge, text: Color.WHITE }
            : { face: colors.rulePill, edge: colors.secondaryEdge, stroke: colors.secondaryEdge, text: colors.ruleText };
    }

    /**
     * 打开选关页（只从暂停弹窗进入）：盖在玩法页上的一整页。正在下的那盘棋不丢，
     * 选回同一关就原样继续。选关页本身不记存档，下次进游戏直接回到当前关卡。
     */
    private openLevelSelect(): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready') return;
        this.resetBoardGesture();
        this.destroyOverlay();
        this.clearHint();
        this.destroyWinToast();
        this.destroyWinOverlay();
        this.destroyFailPage();
        if (this.tutorial) {
            // 引导盘不是正式关卡：离开引导就丢掉它，之后选第 1 关会重新开始（并重新引导）。
            this.destroyTutorial();
            this.tutorialLevelBackup = undefined;
            this.model = undefined;
            this.board = undefined;
        }
        this.state = 'selecting';
        this.inputLocked = true;
        this.warmCellCount = this.levelDefinitions().reduce((largest, level) =>
            level.level <= this.unlockedLevel ? Math.max(largest, level.size * level.size) : largest, 0);
        this.buildLevelSelect();
        this.persistProgress();
    }

    private switchMode(mode: 'normal' | 'hard'): void {
        const view = this.levelSelectView;
        if (this.state !== 'selecting' || !view || this.mode === mode) return;
        this.persistProgress();
        this.resetBoardGesture();
        this.unscheduleAllCallbacks();
        this.levelRunId += 1;
        this.challengeTrackingActive = false;
        this.model = undefined;
        this.board = undefined;
        this.draftMode = false;
        this.tutorialFinishing = false;
        this.pendingToolReward = undefined;
        this.readSave(mode);
        if (mode === 'hard') this.discoverHardMode();
        this.context?.services.feedback.play('uiButton');
        this.warmCellCount = this.levelDefinitions().reduce((largest, level) =>
            level.level <= this.unlockedLevel ? Math.max(largest, level.size * level.size) : largest, 0);
        view.page = this.levelSelectPageOf(this.currentLevelNumber());
        view.drag = undefined;
        view.sliding = false;
        Tween.stopAllByTarget(view.trackOpacity);
        view.trackOpacity.opacity = 255;
        this.refreshLevelSelect(view);
        this.persistProgress();
    }

    /** 切换只更新原页面，避免同一帧创建/销毁几十个关卡格子和文字组件。 */
    private refreshLevelSelect(view: LevelSelectView): void {
        const colors = this.levelSelectColors();
        const bounds = view.root.getComponent(UITransform)!;
        const background = view.root.getComponent(Graphics)!;
        background.clear();
        background.fillColor = colors.page;
        background.rect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
        background.fill();
        view.title.color = colors.title;
        view.progress.color = colors.subtitle;
        view.progress.string = MEOWDOKU_COPY.levelSelectProgress(this.clearedLevel, this.levelDefinitions().length);
        view.pageLabel.color = colors.ruleText;
        for (const button of [view.backButton, view.prevButton, view.nextButton]) {
            this.drawRoundButton(button);
        }
        const backIcon = view.backButton.getChildByName('Icon')?.getComponent(Sprite);
        if (backIcon) backIcon.color = colors.hudIcon;
        this.drawChevron(view.prevButton, view.prevButton.getComponent(UITransform)!.width, -1);
        this.drawChevron(view.nextButton, view.nextButton.getComponent(UITransform)!.width, 1);
        for (const [button, style] of [[view.jumpCurrent, 'primary'], [view.jumpLatest, 'secondary']] as const) {
            const size = button.getComponent(UITransform)!;
            const palette = this.levelSelectButtonPalette(style);
            this.drawPillButton(button.getComponent(Graphics)!, size.width, size.height, palette);
            const label = button.getChildByName('Label')!.getComponent(Label)!;
            label.color = palette.text;
            label.string = style === 'primary'
                ? MEOWDOKU_COPY.levelSelectJumpCurrent(this.currentLevelNumber())
                : MEOWDOKU_COPY.levelSelectJumpLatest(this.unlockedLevel);
        }
        this.fillLevelSelectPages(view);
        view.modeAnimating = true;
        this.refreshModeSwitch(view.modeSwitch, true, () => {
            if (this.levelSelectView === view) view.modeAnimating = false;
        });
    }

    /** 文字位于长胶囊内部，选中底块滑向点按的普通 / 困难分段。 */
    private createModeSwitch(parent: Node): ModeSwitchView {
        const s = this.requireLayout().fitScale;
        const node = new Node('ModeToggle');
        node.layer = this.node.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(196 * s, 64 * s);
        const rail = new Node('Rail');
        rail.layer = this.node.layer;
        rail.setParent(node);
        rail.addComponent(UITransform).setContentSize(196 * s, 64 * s);
        const track = rail.addComponent(Graphics);
        const thumb = new Node('Thumb');
        thumb.layer = this.node.layer;
        thumb.setParent(rail);
        thumb.addComponent(UITransform).setContentSize(92 * s, 52 * s);
        thumb.addComponent(Graphics);
        const normalLabel = this.createLabel(node, 'Normal', 84 * s, 40 * s, 24 * s, Color.WHITE);
        normalLabel.string = '普通';
        normalLabel.node.setPosition(-46 * s, 0, 0);
        setLabelBold(normalLabel, true);
        const hardLabel = this.createLabel(node, 'Hard', 84 * s, 40 * s, 24 * s, Color.WHITE);
        hardLabel.string = '困难';
        hardLabel.node.setPosition(46 * s, 0, 0);
        setLabelBold(hardLabel, true);
        this.createHardModeNotice(node);
        const modeSwitch = { node, track, thumb, normalLabel, hardLabel };
        this.refreshModeSwitch(modeSwitch);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (Vec2.distance(event.getUIStartLocation(), event.getUILocation()) > 12) return;
            const location = event.getUILocation();
            const local = node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
            this.switchMode(local.x < 0 ? 'normal' : 'hard');
        }, this);
        return modeSwitch;
    }

    /** 三处入口共用莓红圆形角标，图形绘制避免额外字体或图集资源。 */
    private createHardModeNotice(
        parent: Node,
        options: { readonly diameter?: number; readonly insetX?: number; readonly insetY?: number } = {},
    ): void {
        if (this.hardModeDiscovered || this.mode === 'hard') return;
        const s = this.requireLayout().fitScale;
        const unit = (options.diameter ?? 36) / 36 * s;
        const bounds = parent.getComponent(UITransform)!;
        const notice = new Node('HardModeNotice');
        notice.layer = parent.layer;
        notice.setParent(parent);
        notice.addComponent(UITransform).setContentSize(36 * unit, 36 * unit);
        notice.setPosition(
            bounds.width / 2 - (options.insetX ?? 8) * s,
            bounds.height / 2 - (options.insetY ?? 8) * s,
            0,
        );
        const graphics = notice.addComponent(Graphics);
        graphics.fillColor = Color.WHITE;
        graphics.circle(0, 0, 18 * unit);
        graphics.fill();
        graphics.fillColor = MEOWDOKU_HARD_MODE_COLORS.levelChip;
        graphics.circle(0, 0, 16 * unit);
        graphics.fill();
        graphics.fillColor = Color.WHITE;
        graphics.roundRect(-2.2 * unit, -1 * unit, 4.4 * unit, 11 * unit, 2.2 * unit);
        graphics.fill();
        graphics.circle(0, -7 * unit, 2.4 * unit);
        graphics.fill();
        this.hardModeNotices.add(notice);
    }

    /** 立即清掉包含底层玩法页在内的全部提示，并把发现记录落入共享存档。 */
    private discoverHardMode(): void {
        if (this.hardModeDiscovered) return;
        this.hardModeDiscovered = true;
        for (const notice of Array.from(this.hardModeNotices)) {
            if (notice.isValid) notice.active = false;
        }
        this.hardModeNotices.clear();
        this.writeSave(() => {});
    }

    private refreshModeSwitch(modeSwitch: ModeSwitchView, animate = false, onDone?: () => void): void {
        const s = this.requireLayout().fitScale;
        const colors = this.levelSelectColors();
        const hard = this.mode === 'hard';
        const track = modeSwitch.track;
        track.clear();
        track.fillColor = colors.secondaryEdge;
        track.roundRect(-98 * s, -35 * s, 196 * s, 64 * s, 32 * s);
        track.fill();
        track.fillColor = colors.rulePill;
        track.roundRect(-98 * s, -32 * s, 196 * s, 64 * s, 32 * s);
        track.fill();
        const face = modeSwitch.thumb.getComponent(Graphics)!;
        face.clear();
        face.fillColor = colors.primaryEdge;
        face.roundRect(-46 * s, -28 * s, 92 * s, 52 * s, 26 * s);
        face.fill();
        face.fillColor = colors.winButton;
        face.roundRect(-46 * s, -26 * s, 92 * s, 52 * s, 26 * s);
        face.fill();
        modeSwitch.normalLabel.color = hard ? colors.ruleText : Color.WHITE;
        modeSwitch.hardLabel.color = hard ? Color.WHITE : colors.ruleText;
        Tween.stopAllByTarget(modeSwitch.thumb);
        const position = new Vec3((hard ? 46 : -46) * s, 0, 0);
        if (animate) {
            tween(modeSwitch.thumb).to(0.18, { position }, { easing: 'quadOut' }).call(() => onDone?.()).start();
        } else {
            modeSwitch.thumb.setPosition(position);
        }
    }

    /**
     * 选关页：顶栏（返回大厅 / 标题 / 通关进度 / 模式切换）+ 左右翻页的关卡网格（每页 30 关）
     * + 页码与左右箭头 + 「当前关卡」「最新关卡」两个快捷跳转。
     * 默认打开到当前关卡所在的那一页。
     */
    private buildLevelSelect(page = this.levelSelectPageOf(this.currentLevelNumber())): void {
        this.destroyLevelSelect();
        const layout = this.requireLayout();
        const s = layout.fitScale;
        const width = layout.width;
        const height = layout.height;
        const colors = this.levelSelectColors();

        const root = new Node('LevelSelect');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(width, height);
        root.addComponent(BlockInputEvents);
        const background = root.addComponent(Graphics);
        background.fillColor = colors.page;
        background.rect(-width / 2, -height / 2, width, height);
        background.fill();

        // ---- 顶栏：左侧返回大厅，中间标题，标题下是通关进度。
        const headerTop = height / 2 - layout.safeTop;
        const titleY = headerTop - 56 * s;
        const backSize = 88 * s;
        const back = this.createRoundButton(root, 'BackButton', backSize);
        back.setPosition(-width / 2 + 28 * s + backSize / 2, titleY, 0);
        const backFrame = this.visuals?.frames.iconBack;
        if (backFrame && backFrame.rect.height > 0) {
            const icon = new Node('Icon');
            icon.layer = this.node.layer;
            icon.setParent(back);
            const iconHeight = backSize * 0.4;
            icon.addComponent(UITransform).setContentSize(
                iconHeight * backFrame.rect.width / backFrame.rect.height,
                iconHeight,
            );
            const sprite = icon.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = backFrame;
            // 返回图标是白色剪影，按当前模式的按钮图标色染色。
            sprite.color = colors.hudIcon;
        }
        this.bindButton(back, () => this.leaveLevelSelect());

        const title = this.createLabel(root, 'Title', width - 476 * s, 80 * s, 44 * s, colors.title);
        setLabelBold(title, true);
        title.string = MEOWDOKU_COPY.levelSelectTitle;
        title.node.setPosition(0, titleY, 0);
        const progress = this.createLabel(root, 'Progress', width - 120 * s, 40 * s, 26 * s, colors.subtitle);
        progress.string = MEOWDOKU_COPY.levelSelectProgress(this.clearedLevel, this.levelDefinitions().length);
        progress.node.setPosition(0, titleY - 64 * s, 0);

        const modeSwitch = this.createModeSwitch(root);
        modeSwitch.node.setPosition(width / 2 - 28 * s - 98 * s, titleY, 0);

        // ---- 底部（自下而上）：快捷跳转 → 页码行。
        const margin = 36 * s;
        const bottom = -height / 2 + layout.safeBottom;
        const jumpHeight = 88 * s;
        const jumpGap = 24 * s;
        const jumpWidth = (width - margin * 2 - jumpGap) / 2;
        const jumpY = bottom + 28 * s + jumpHeight / 2;
        const current = this.currentLevelNumber();
        const latest = this.unlockedLevel;
        const jumpCurrent = this.createPillButton(
            root,
            'JumpCurrent',
            jumpWidth,
            jumpHeight,
            MEOWDOKU_COPY.levelSelectJumpCurrent(current),
            'primary',
            { palette: this.levelSelectButtonPalette('primary') },
        );
        jumpCurrent.setPosition(-(jumpWidth + jumpGap) / 2, jumpY, 0);
        this.bindButton(jumpCurrent, () => this.jumpLevelSelectTo(this.currentLevelNumber()));
        const jumpLatest = this.createPillButton(
            root,
            'JumpLatest',
            jumpWidth,
            jumpHeight,
            MEOWDOKU_COPY.levelSelectJumpLatest(latest),
            'secondary',
            { palette: this.levelSelectButtonPalette('secondary') },
        );
        jumpLatest.setPosition((jumpWidth + jumpGap) / 2, jumpY, 0);
        this.bindButton(jumpLatest, () => this.jumpLevelSelectTo(this.unlockedLevel));

        const arrowSize = 72 * s;
        const pagerY = jumpY + jumpHeight / 2 + 28 * s + arrowSize / 2;
        const prevButton = this.createRoundButton(root, 'PrevPage', arrowSize);
        prevButton.setPosition(-width / 2 + margin + arrowSize / 2, pagerY, 0);
        this.drawChevron(prevButton, arrowSize, -1);
        this.bindButton(prevButton, () => this.slideLevelSelect(-1));
        const nextButton = this.createRoundButton(root, 'NextPage', arrowSize);
        nextButton.setPosition(width / 2 - margin - arrowSize / 2, pagerY, 0);
        this.drawChevron(nextButton, arrowSize, 1);
        this.bindButton(nextButton, () => this.slideLevelSelect(1));
        const pageLabel = this.createLabel(
            root,
            'PageLabel',
            width - margin * 2 - arrowSize * 2 - 40 * s,
            arrowSize,
            30 * s,
            colors.ruleText,
        );
        setLabelBold(pageLabel, true);
        pageLabel.node.setPosition(0, pagerY, 0);

        // ---- 网格区：标题进度下方到页码行上方；矮屏时整格等比缩小。
        const gridTop = titleY - 100 * s;
        const gridBottom = pagerY + arrowSize / 2 + 20 * s;
        const available = Math.max(1, gridTop - gridBottom);
        const gapX = 22 * s;
        let tileWidth = (width - margin * 2 - gapX * (LEVEL_SELECT_COLUMNS - 1)) / LEVEL_SELECT_COLUMNS;
        let tileHeight = tileWidth * 1.08;
        let gapY = 22 * s;
        const gridHeight = LEVEL_SELECT_ROWS * tileHeight + (LEVEL_SELECT_ROWS - 1) * gapY;
        const fit = Math.min(1, available / gridHeight);
        tileWidth *= fit;
        tileHeight *= fit;
        gapY *= fit;

        const pager = new Node('Pager');
        pager.layer = this.node.layer;
        pager.setParent(root);
        pager.addComponent(UITransform).setContentSize(width, available);
        pager.setPosition(0, (gridTop + gridBottom) / 2, 0);
        const track = new Node('Track');
        track.layer = this.node.layer;
        track.setParent(pager);
        track.addComponent(UITransform).setContentSize(width, available);
        const trackOpacity = track.addComponent(UIOpacity);

        const pageCount = this.levelSelectPageCount();
        const view: LevelSelectView = {
            root,
            modeSwitch,
            title,
            progress,
            backButton: back,
            jumpCurrent,
            jumpLatest,
            track,
            trackOpacity,
            pageLabel,
            prevButton,
            nextButton,
            pageWidth: width,
            tileWidth,
            tileHeight,
            gapX,
            gapY,
            pages: [],
            pagePool: [],
            page: Math.max(0, Math.min(pageCount - 1, page)),
            sliding: false,
            modeAnimating: false,
        };
        this.levelSelectView = view;
        this.fillLevelSelectPages(view);

        // 手指拖动整条滑轨；格子上的触摸会冒泡到这里，格子自己只认「没拖动」的点按。
        pager.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onLevelPagerStart(view, event), this);
        pager.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onLevelPagerMove(view, event), this);
        pager.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onLevelPagerEnd(view, event), this);
        pager.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onLevelPagerEnd(view, event), this);
    }

    private levelSelectPageCount(): number {
        return Math.max(1, Math.ceil(this.levelDefinitions().length / LEVEL_SELECT_PER_PAGE));
    }

    private levelSelectPageOf(level: number): number {
        return Math.floor(this.levelIndexOf(level) / LEVEL_SELECT_PER_PAGE);
    }

    /** 更新当前页和左右两页；模式切换和远距离跳转复用已有节点。 */
    private fillLevelSelectPages(view: LevelSelectView): void {
        view.pages = [-1, 0, 1].map((slot) =>
            this.createLevelSelectPage(view, view.page + slot, slot, view.pagePool[slot + 1]));
        Tween.stopAllByTarget(view.track);
        view.track.setPosition(0, 0, 0);
        this.syncLevelSelectPager(view);
    }

    private createLevelSelectPage(view: LevelSelectView, page: number, slot: number, reusable?: Node): Node | undefined {
        if (page < 0 || page >= this.levelSelectPageCount()) {
            if (reusable?.isValid) {
                reusable.children.forEach(tile => this.stopLevelTileAnimations(tile));
                reusable.active = false;
            }
            return undefined;
        }
        const node = reusable ?? new Node(`Page${page}`);
        if (!reusable) {
            node.layer = this.node.layer;
            node.setParent(view.track);
            node.addComponent(UITransform);
        }
        view.pagePool[slot + 1] = node;
        node.name = `Page${page}`;
        node.active = true;
        const gridWidth = LEVEL_SELECT_COLUMNS * view.tileWidth + (LEVEL_SELECT_COLUMNS - 1) * view.gapX;
        const gridHeight = LEVEL_SELECT_ROWS * view.tileHeight + (LEVEL_SELECT_ROWS - 1) * view.gapY;
        node.getComponent(UITransform)!.setContentSize(gridWidth, gridHeight);
        node.setPosition(slot * view.pageWidth, 0, 0);
        const current = this.currentLevelNumber();
        const first = page * LEVEL_SELECT_PER_PAGE;
        const last = Math.min(this.levelDefinitions().length, first + LEVEL_SELECT_PER_PAGE);
        const tiles = node.children.slice();
        for (let index = first; index < last; index += 1) {
            const definition = this.levelDefinitions()[index]!;
            const cell = index - first;
            const col = cell % LEVEL_SELECT_COLUMNS;
            const row = Math.floor(cell / LEVEL_SELECT_COLUMNS);
            const tile = this.createLevelTile(
                node,
                definition.level,
                view.tileWidth,
                view.tileHeight,
                current,
                tiles[cell],
            );
            tile.setPosition(
                -gridWidth / 2 + view.tileWidth / 2 + col * (view.tileWidth + view.gapX),
                gridHeight / 2 - view.tileHeight / 2 - row * (view.tileHeight + view.gapY),
                0,
            );
            const base = tile.position.clone();
            // 索引随页和模式变化；先移除旧处理器，避免复用格子误选旧关或重复响应。
            tile.targetOff(this);
            this.bindScrollTap(tile, () => {
                if (view.sliding || this.levelSelectView !== view) return;
                if (!this.selectLevel(index)) this.shakeLevelTile(tile, base);
            });
        }
        for (let cell = last - first; cell < tiles.length; cell += 1) {
            this.stopLevelTileAnimations(tiles[cell]!);
            tiles[cell]!.active = false;
        }
        return node;
    }

    private syncLevelSelectPager(view: LevelSelectView): void {
        const first = view.page * LEVEL_SELECT_PER_PAGE + 1;
        const last = Math.min(this.levelDefinitions().length, first + LEVEL_SELECT_PER_PAGE - 1);
        view.pageLabel.string = MEOWDOKU_COPY.levelSelectPage(first, last);
        const setEnabled = (button: Node, enabled: boolean): void => {
            const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
            opacity.opacity = enabled ? 255 : 90;
        };
        setEnabled(view.prevButton, !!view.pages[0]);
        setEnabled(view.nextButton, !!view.pages[2]);
    }

    private onLevelPagerStart(view: LevelSelectView, event: EventTouch): void {
        if (this.levelSelectView !== view || view.sliding) return;
        const x = event.getUILocation().x;
        view.drag = { startX: x, lastX: x, lastAt: Date.now(), velocity: 0 };
    }

    private onLevelPagerMove(view: LevelSelectView, event: EventTouch): void {
        const drag = view.drag;
        if (this.levelSelectView !== view || !drag) return;
        const x = event.getUILocation().x;
        const now = Date.now();
        drag.velocity = (x - drag.lastX) / Math.max(1, now - drag.lastAt) * 1000;
        drag.lastX = x;
        drag.lastAt = now;
        let dx = x - drag.startX;
        // 第一页往右 / 最后一页往左拖时加阻尼，松手回弹。
        if ((dx > 0 && !view.pages[0]) || (dx < 0 && !view.pages[2])) dx *= 0.3;
        view.track.setPosition(dx, 0, 0);
    }

    private onLevelPagerEnd(view: LevelSelectView, event: EventTouch): void {
        const drag = view.drag;
        view.drag = undefined;
        if (this.levelSelectView !== view || !drag) return;
        const dx = event.getUILocation().x - drag.startX;
        const threshold = view.pageWidth * LEVEL_SELECT_FLIP_RATIO;
        let direction = 0;
        if (dx < 0 && view.pages[2] && (dx < -threshold || drag.velocity < -LEVEL_SELECT_FLIP_SPEED)) direction = 1;
        if (dx > 0 && view.pages[0] && (dx > threshold || drag.velocity > LEVEL_SELECT_FLIP_SPEED)) direction = -1;
        this.slideLevelSelect(direction);
    }

    /** 滑到相邻页（direction = ±1），或回弹到当前页（0）。 */
    private slideLevelSelect(direction: number, onDone?: () => void): void {
        const view = this.levelSelectView;
        if (!view || view.sliding) return;
        if (direction > 0 && !view.pages[2]) direction = 0;
        if (direction < 0 && !view.pages[0]) direction = 0;
        view.sliding = true;
        Tween.stopAllByTarget(view.track);
        tween(view.track)
            .to(0.22, { position: new Vec3(-direction * view.pageWidth, 0, 0) }, { easing: 'quadOut' })
            .call(() => {
                if (this.levelSelectView !== view) return;
                if (direction !== 0) this.shiftLevelSelectPages(view, direction);
                view.track.setPosition(0, 0, 0);
                view.sliding = false;
                onDone?.();
            })
            .start();
    }

    /** 翻过一页：两页直接挪位，离开视野那一页复用为新的相邻页。 */
    private shiftLevelSelectPages(view: LevelSelectView, direction: number): void {
        const [prev, current, next] = view.pages;
        const [prevPool, currentPool, nextPool] = view.pagePool;
        view.page += direction;
        if (direction > 0) {
            view.pagePool = [currentPool, nextPool, prevPool];
            view.pages = [current, next, this.createLevelSelectPage(view, view.page + 1, 1, prevPool)];
        } else {
            view.pagePool = [nextPool, prevPool, currentPool];
            view.pages = [this.createLevelSelectPage(view, view.page - 1, -1, nextPool), prev, current];
        }
        view.pages.forEach((page, slot) => page?.setPosition((slot - 1) * view.pageWidth, 0, 0));
        this.syncLevelSelectPager(view);
    }

    /** 快捷跳转：相邻页滑过去，远处的页直接换页并淡入，然后让目标关卡跳一下。 */
    private jumpLevelSelectTo(level: number): void {
        const view = this.levelSelectView;
        if (!view || view.sliding) return;
        const target = this.levelSelectPageOf(level);
        const highlight = (): void => this.pulseLevelTile(level);
        if (target === view.page) {
            highlight();
            return;
        }
        if (Math.abs(target - view.page) === 1) {
            this.slideLevelSelect(target - view.page, highlight);
            return;
        }
        view.page = target;
        this.fillLevelSelectPages(view);
        Tween.stopAllByTarget(view.trackOpacity);
        view.trackOpacity.opacity = 0;
        tween(view.trackOpacity).to(0.18, { opacity: 255 }).call(highlight).start();
    }

    private pulseLevelTile(level: number): void {
        const tile = this.levelSelectView?.pages[1]?.getChildByName(`Level${level}`);
        if (!tile?.isValid) return;
        Tween.stopAllByTarget(tile);
        tile.setScale(1, 1, 1);
        tween(tile)
            .to(0.12, { scale: new Vec3(1.14, 1.14, 1) }, { easing: 'quadOut' })
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .to(0.1, { scale: new Vec3(1.07, 1.07, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .start();
    }

    /** 白色圆形按钮底（带底部投影），图标 / 箭头由调用方加。 */
    private createRoundButton(parent: Node, name: string, diameter: number): Node {
        const button = new Node(name);
        button.layer = this.node.layer;
        button.setParent(parent);
        button.addComponent(UITransform).setContentSize(diameter, diameter);
        button.addComponent(Graphics);
        this.drawRoundButton(button);
        return button;
    }

    private drawRoundButton(button: Node): void {
        const s = this.requireLayout().fitScale;
        const colors = this.levelSelectColors();
        const diameter = button.getComponent(UITransform)!.width;
        const graphics = button.getComponent(Graphics)!;
        graphics.clear();
        graphics.fillColor = colors.panelShadow;
        graphics.circle(0, -4 * s, diameter / 2);
        graphics.fill();
        graphics.fillColor = colors.hudButton;
        graphics.circle(0, 0, diameter / 2);
        graphics.fill();
    }

    /** 在圆形按钮上画一个左 / 右箭头（direction = -1 / 1）。 */
    private drawChevron(button: Node, diameter: number, direction: number): void {
        let chevron = button.getChildByName('Chevron');
        if (!chevron) {
            chevron = new Node('Chevron');
            chevron.layer = this.node.layer;
            chevron.setParent(button);
            chevron.addComponent(UITransform).setContentSize(diameter, diameter);
            chevron.addComponent(Graphics);
        }
        const graphics = chevron.getComponent(Graphics)!;
        graphics.clear();
        const arm = diameter * 0.16;
        graphics.lineWidth = diameter * 0.09;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.strokeColor = this.levelSelectColors().title;
        graphics.moveTo(-direction * arm * 0.5, arm);
        graphics.lineTo(direction * arm * 0.5, 0);
        graphics.lineTo(-direction * arm * 0.5, -arm);
        graphics.stroke();
    }

    /**
     * 一个关卡格子：
     * - 当前关：暖橙色实心 + 白字 +「进行中」；
     * - 获得专属荣誉：浅紫格子、深紫数字和金色呼吸星芒，无额外称号文字；
     * - 已解锁：白色格子，最新解锁那关标「最新」；
     * - 未解锁：灰色平面格子。
     */
    private createLevelTile(
        parent: Node,
        level: number,
        width: number,
        height: number,
        current: number,
        reusable?: Node,
    ): Node {
        const s = this.requireLayout().fitScale;
        const colors = this.levelSelectColors();
        const isCurrent = level === current;
        const locked = level > this.unlockedLevel;
        const genius = !locked && this.geniusClearedLevels[String(level)] === true;
        const isLatest = level === this.unlockedLevel && !isCurrent;
        const tile = reusable ?? new Node(`Level${level}`);
        if (!reusable) {
            tile.layer = this.node.layer;
            tile.setParent(parent);
            tile.addComponent(UITransform).setContentSize(width, height);
            tile.addComponent(Graphics);
        }
        tile.name = `Level${level}`;
        tile.active = true;
        this.stopLevelTileAnimations(tile);
        tile.setScale(1, 1, 1);
        const graphics = tile.getComponent(Graphics)!;
        graphics.clear();
        const radius = Math.min(28 * s, width * 0.24);
        if (!locked) {
            graphics.fillColor = genius ? colors.levelGeniusEdge
                : isCurrent ? colors.primaryEdge : colors.secondaryEdge;
            graphics.roundRect(-width / 2, -height / 2 - 6 * s, width, height, radius);
            graphics.fill();
        }
        graphics.fillColor = genius ? colors.levelGenius : isCurrent
            ? colors.winButton
            : locked ? colors.levelLocked : colors.board;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();

        const existingGlow = tile.getChildByName('GeniusGlow');
        if (existingGlow) existingGlow.active = genius;
        if (genius) {
            if (existingGlow) this.animateLevelGeniusGlow(existingGlow.getComponent(UIOpacity)!);
            else this.createLevelGeniusGlow(tile, width, height, radius);
        }
        const numberColor = genius ? colors.resultGeniusText : isCurrent
            ? Color.WHITE
            : locked ? colors.levelLockedText : colors.title;
        const number = tile.getChildByName('Number')?.getComponent(Label) ?? this.createLabel(
            tile,
            'Number',
            width - 12 * s,
            height * 0.5,
            Math.min(44 * s, height * 0.4),
            numberColor,
        );
        if (!reusable) setLabelBold(number, true);
        number.color = numberColor;
        number.string = String(level);
        // 只有「进行中」「最新」两种格子带一行说明，其余格子只放居中的关卡号。
        const hasCaption = isCurrent || isLatest;
        number.node.setPosition(0, hasCaption ? height * 0.1 : 0, 0);
        const oldCaption = tile.getChildByName('Caption')?.getComponent(Label);
        if (oldCaption) oldCaption.node.active = hasCaption;
        if (hasCaption) {
            const caption = oldCaption ?? this.createLabel(
                tile,
                'Caption',
                width - 12 * s,
                height * 0.26,
                Math.min(20 * s, height * 0.18),
                genius ? colors.resultGeniusText : isCurrent ? Color.WHITE : colors.winButton,
            );
            if (!oldCaption) setLabelBold(caption, true);
            caption.color = genius ? colors.resultGeniusText : isCurrent ? Color.WHITE : colors.winButton;
            caption.string = isCurrent ? MEOWDOKU_COPY.levelSelectCurrent : MEOWDOKU_COPY.levelSelectLatest;
            caption.node.setPosition(0, -height / 2 + height * 0.2, 0);
        }
        return tile;
    }

    private stopLevelTileAnimations(tile: Node): void {
        Tween.stopAllByTarget(tile);
        const glowOpacity = tile.getChildByName('GeniusGlow')?.getComponent(UIOpacity);
        if (glowOpacity) Tween.stopAllByTarget(glowOpacity);
    }

    /** 只让内描边和角落星芒轻柔呼吸，关卡数字和触摸缩放保持稳定。 */
    private createLevelGeniusGlow(tile: Node, width: number, height: number, radius: number): void {
        const s = this.requireLayout().fitScale;
        const glow = new Node('GeniusGlow');
        glow.layer = tile.layer;
        glow.setParent(tile);
        glow.addComponent(UITransform).setContentSize(width, height);
        const graphics = glow.addComponent(Graphics);
        const inset = 4 * s;
        graphics.strokeColor = MEOWDOKU_COLORS.resultPerfect;
        graphics.lineWidth = 2.5 * s;
        graphics.roundRect(-width / 2 + inset, -height / 2 + inset,
            width - 2 * inset, height - 2 * inset, Math.max(0, radius - inset));
        graphics.stroke();
        graphics.fillColor = MEOWDOKU_COLORS.resultPerfect;
        const starX = width / 2 - 17 * s;
        const starY = height / 2 - 17 * s;
        for (let point = 0; point < 8; point += 1) {
            const angle = point * Math.PI / 4;
            const length = (point % 2 === 0 ? 7 : 2) * s;
            const x = starX + Math.cos(angle) * length;
            const y = starY + Math.sin(angle) * length;
            if (point === 0) graphics.moveTo(x, y);
            else graphics.lineTo(x, y);
        }
        graphics.close();
        graphics.fill();
        const opacity = glow.addComponent(UIOpacity);
        this.animateLevelGeniusGlow(opacity);
    }

    private animateLevelGeniusGlow(opacity: UIOpacity): void {
        opacity.opacity = 80;
        tween(opacity)
            .to(1.1, { opacity: 220 }, { easing: 'sineInOut' })
            .to(1.1, { opacity: 80 }, { easing: 'sineInOut' })
            .repeatForever()
            .start();
    }

    /** 网格里的点按：手指拖动过（在翻页）就不算点按。 */
    private bindScrollTap(node: Node, onTap: () => void): void {
        node.on(Node.EventType.TOUCH_START, () => {
            if (node.isValid) node.setScale(0.95, 0.95, 1);
        }, this);
        node.on(Node.EventType.TOUCH_CANCEL, () => {
            if (node.isValid) node.setScale(1, 1, 1);
        }, this);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (node.isValid) node.setScale(1, 1, 1);
            if (Vec2.distance(event.getUIStartLocation(), event.getUILocation()) > 12) return;
            onTap();
        }, this);
    }

    /** 选关；关卡未解锁时返回 false（由格子自己抖一下提示）。 */
    private selectLevel(index: number): boolean {
        if (this.state !== 'selecting') return true;
        const definition = this.levelDefinitions()[index];
        if (!definition) return true;
        if (definition.level > this.unlockedLevel) return false;
        this.context?.services.feedback.play('uiButton');
        this.destroyLevelSelect();
        const continuing = definition.level === this.currentLevelNumber();
        if (continuing && this.isLevelLive()) {
            // 选回正在下的那一盘：棋盘原样继续。
            this.state = 'playing';
            this.inputLocked = true;
            this.scheduleOnce(() => {
                if (this.state === 'playing' && !this.tutorial) this.inputLocked = false;
            }, 0.25);
            this.persistProgress();
            return true;
        }
        const restored = continuing ? this.pendingLevelCells : undefined;
        const lives = continuing ? this.pendingLives : undefined;
        if (!continuing) this.clearPendingProgress();
        this.pendingLevelCells = undefined;
        this.pendingLives = undefined;
        this.startLevel(index, restored, lives, true);
        return true;
    }

    private shakeLevelTile(tile: Node, origin: Vec3): void {
        if (!tile.isValid) return;
        const s = this.requireLayout().fitScale;
        Tween.stopAllByTarget(tile);
        const at = (dx: number): Vec3 => new Vec3(origin.x + dx * s, origin.y, 0);
        tween(tile)
            .to(0.05, { position: at(-8) })
            .to(0.05, { position: at(8) })
            .to(0.05, { position: at(-5) })
            .to(0.05, { position: origin })
            .start();
    }

    private leaveLevelSelect(): void {
        if (this.state !== 'selecting') return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestLobby();
    }

    private destroyLevelSelect(): void {
        const view = this.levelSelectView;
        this.levelSelectView = undefined;
        if (view?.root.isValid) this.retirePageNode(view.root);
    }

    private destroyOverlay(): void {
        const onClose = this.overlayOnClose;
        this.overlayOnClose = undefined;
        if (onClose) onClose();
        const overlay = this.overlayNode;
        this.overlayNode = undefined;
        if (overlay?.isValid) this.destroyNode(overlay);
    }

    // ---------------------------------------------------------------- 适配

    private readonly handleCanvasResize = (): void => {
        if (this.state === 'disposed' || this.state === 'idle') return;
        const previousState = this.state;
        if (previousState === 'paused') this.state = this.stateBeforePause;
        const selectPage = this.levelSelectView?.page;
        const tutorial = this.tutorial;
        this.buildBackground();
        this.rebuildPage(!!tutorial);
        if (tutorial) {
            const layout = this.requireLayout();
            tutorial.relayout({
                width: layout.width,
                height: layout.height,
                safeTopY: layout.height / 2 - layout.topInset,
                safeBottomY: -layout.height / 2 + layout.safeBottom,
                k: MEOWDOKU_SOURCE_SCALE * layout.fitScale,
                boardX: layout.boardX,
                boardY: layout.boardY,
                boardSize: layout.boardSize,
                cellFace: layout.cellFace,
            });
            // 保留的教程根层重新排到新棋盘之后，避免被重建的页面元素盖住。
            tutorial.node.setSiblingIndex(this.node.children.length - 1);
            this.setGameChromeVisible(false);
            this.inputLocked = true;
        }
        if (previousState === 'selecting') this.buildLevelSelect(selectPage);
        if (previousState === 'paused') {
            this.state = 'paused';
            this.inputLocked = true;
        }
    };

    private requireLayout(): MeowdokuLayoutMetrics {
        if (!this.layout) {
            throw new Error('MeowdokuGame layout was requested before initialization.');
        }
        return this.layout;
    }

    // ---------------------------------------------------------------- 工具

    private setFeedbackPaused(paused: boolean): void {
        for (const node of Array.from(this.feedbackNodes)) {
            if (!node.isValid) {
                this.feedbackNodes.delete(node);
                continue;
            }
            const opacity = node.getComponent(UIOpacity);
            if (paused) {
                Tween.pauseAllByTarget(node);
                if (opacity) Tween.pauseAllByTarget(opacity);
            } else {
                Tween.resumeAllByTarget(node);
                if (opacity) Tween.resumeAllByTarget(opacity);
            }
        }
    }

    /** 得分与连击反馈共用字形样式；完整文本由 Label 渲染，不创建字模 Sprite。 */
    private createFeedbackText(
        parent: Node,
        text: string,
        width: number,
        height: number,
        fontSize: number,
        color: Color,
    ): Label {
        const label = this.createLabel(parent, 'Text', width, height, fontSize, color);
        label.string = text;
        label.enableWrapText = false;
        setLabelBold(label, true);
        const style = MEOWDOKU_FEEDBACK_TEXT;
        label.enableOutline = true;
        label.outlineColor = style.outlineColor;
        label.outlineWidth = fontSize * style.outlineFontRatio;
        label.enableShadow = true;
        label.shadowColor = style.shadowColor;
        label.shadowOffset = new Vec2(0, -fontSize * style.shadowFontRatio);
        label.shadowBlur = 0;
        return label;
    }

    private createLabel(
        parent: Node,
        name: string,
        width: number,
        height: number,
        fontSize: number,
        color: Color,
    ): Label {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = '';
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.25);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private drawRoundedRect(
        graphics: Graphics,
        width: number,
        height: number,
        radius: number,
        color: Color,
    ): void {
        graphics.clear();
        graphics.fillColor = color;
        const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
        graphics.roundRect(-width / 2, -height / 2, width, height, r);
        graphics.fill();
    }

    /** 玩法与弹窗的关卡号直接共用 HUD 圆角卡片及当前模式配色。 */
    private drawLevelChip(graphics: Graphics, width: number, height: number): void {
        const colors = this.levelSelectColors();
        this.drawHudCard(graphics, width, height, colors.levelChip, colors.hudShadow);
    }

    /** HUD 卡片：全圆角底板 + 向下错开的柔和投影（关卡 / 体力 / 猫咪进度 / 草稿开关共用）。 */
    private drawHudCard(
        graphics: Graphics,
        width: number,
        height: number,
        fill: Color,
        shadow: Color,
    ): void {
        const layout = this.requireLayout();
        const radius = Math.min(layout.hudCardCorner, width / 2, height / 2);
        const drop = 4 * layout.fitScale;
        graphics.clear();
        graphics.fillColor = shadow;
        graphics.roundRect(-width / 2, -height / 2 - drop, width, height, radius);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
    }

    /** 按草稿状态重画开关：关时白底 + 棕色铅笔「草稿」，开时橙底 + 白色铅笔「草稿中」。 */
    private paintDraftToggle(): void {
        const toggle = this.draftToggle;
        if (!toggle?.node.isValid) return;
        const layout = this.requireLayout();
        const active = this.draftMode;
        const transform = toggle.node.getComponent(UITransform);
        if (!transform) return;
        this.drawHudCard(
            toggle.face,
            transform.width,
            transform.height,
            active ? MEOWDOKU_COLORS.winButton : MEOWDOKU_COLORS.hudButton,
            active ? MEOWDOKU_COLORS.primaryEdge : MEOWDOKU_COLORS.hudShadow,
        );
        const ink = active ? Color.WHITE : MEOWDOKU_COLORS.title;
        this.drawPencil(toggle.icon, toggle.iconSize, ink);
        toggle.label.color = ink;
        toggle.label.string = active ? MEOWDOKU_COPY.draftToggleActive : MEOWDOKU_COPY.draftToggle;
        toggle.label.updateRenderData(true);
        // 图标 + 文字整体居中。
        const gap = 8 * layout.fitScale;
        const textWidth = toggle.label.node.getComponent(UITransform)?.width ?? 0;
        const total = toggle.iconSize + gap + textWidth;
        toggle.icon.node.setPosition(-total / 2 + toggle.iconSize / 2, 0, 0);
        toggle.label.node.setPosition(-total / 2 + toggle.iconSize + gap + textWidth / 2, 0, 0);
    }

    /**
     * 铅笔图标（素材包里没有，按页面扁平风格手画）：45° 斜放，笔尖朝左下，
     * 笔尖、笔杆、橡皮之间各留一道缝。
     */
    private drawPencil(graphics: Graphics, size: number, color: Color): void {
        graphics.clear();
        graphics.fillColor = color;
        const length = size * Math.SQRT2 * 0.9;
        const half = size * 0.14;
        const gap = length * 0.06;
        // 沿笔杆方向 t（左下 → 右上）与法线方向 w 取点。
        const c = Math.SQRT1_2;
        const at = (t: number, w: number): readonly [number, number] => [c * (t - w), c * (t + w)];
        const fillPolygon = (points: readonly (readonly [number, number])[]): void => {
            const [first, ...rest] = points;
            if (!first) return;
            graphics.moveTo(first[0], first[1]);
            rest.forEach(([x, y]) => graphics.lineTo(x, y));
            graphics.close();
            graphics.fill();
        };
        const tip = -length / 2;
        const bodyStart = tip + length * 0.3;
        const eraserStart = length / 2 - length * 0.2;
        const end = length / 2;
        fillPolygon([at(tip, 0), at(bodyStart, half), at(bodyStart, -half)]);
        fillPolygon([
            at(bodyStart + gap, half),
            at(eraserStart, half),
            at(eraserStart, -half),
            at(bodyStart + gap, -half),
        ]);
        fillPolygon([
            at(eraserStart + gap, half),
            at(end, half),
            at(end, -half),
            at(eraserStart + gap, -half),
        ]);
    }

    /** 立即退出显示/输入/补间，重建页的点击帧不承担整棵旧页面的组件销毁。 */
    private retirePageNode(root: Node): void {
        if (!root.isValid) return;
        // 成百个已渲染 UI 组件同时 onDisable 也会阻塞点击帧。先透明并移出命中区域，
        // 后续逐节点销毁；重命名后不会被 getChildByName 当成新页面命中。
        const opacity = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        opacity.opacity = 0;
        root.setPosition((this.layout?.width ?? 750) * 4, 0, 0);
        root.name = `Retired_${root.name}`;
        this.retiredPageRoots.add(root);
        const pending = [root];
        while (pending.length > 0) {
            const node = pending.pop()!;
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            const sprite = node.getComponent(Sprite);
            if (sprite) Tween.stopAllByTarget(sprite);
            this.feedbackNodes.delete(node);
            this.hardModeNotices.delete(node);
            this.retiredPageNodes.push(node);
            for (const child of node.children) pending.push(child);
        }
    }

    private releaseRetiredPageNodes(limit: number): void {
        for (let count = 0; count < limit && this.retiredPageNodes.length > 0; count += 1) {
            this.destroyNode(this.retiredPageNodes.pop()!);
        }
    }

    private destroyNode(node: Node): void {
        this.feedbackNodes.delete(node);
        this.hardModeNotices.delete(node);
        this.retiredPageRoots.delete(node);
        if (!node?.isValid) return;
        // 先立刻从父节点摘掉：Cocos 的 `destroy()` 是延迟执行，若同名节点被重建，
        // `getChildByName` 会先命中这个「已销毁但仍在树上」的旧节点。
        node.removeFromParent();
        // 节点被回收时先停掉挂在它身上的补间，避免补间在销毁后继续写 scale/opacity。
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            Tween.stopAllByTarget(sprite);
            sprite.spriteFrame = null;
        }
        node.children.slice().forEach((child) => this.destroyNode(child));
        node.active = false;
        node.destroy();
    }
}
