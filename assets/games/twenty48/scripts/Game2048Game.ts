import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { Game2048MergeFx, mergeFxDuration, mergeFxTier, type Game2048MergeFxFrames } from './Game2048MergeFx';
import { Game2048MergeChain } from './Game2048MergeChain';
import { setLabelBold } from '../../../services/font/FontBinding';
import {
    _decorator,
    assetManager,
    AudioClip,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    LabelOutline,
    Node,
    Sprite,
    SpriteFrame,
    sys,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import type {
    MiniGame,
    MiniGameBackgroundPausePolicy,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { Platform } from '../../../platform/Platform';
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import {
    BOARD_SIZE,
    Game2048Model,
    MILESTONE_TILE,
    TARGET_TILE,
    type Game2048Direction,
    type Game2048MoveResult,
    type Game2048Snapshot,
} from './Game2048Model';
import {
    calculateGame2048BackgroundCover,
    calculateGame2048LayoutFromPlatform,
    GAME_2048_BOARD_NODE_SIZE,
    GAME_2048_BOARD_SIZE,
    GAME_2048_PAUSE_ICON_SIZE,
    GAME_2048_ACTION_BAR_ITEM_HEIGHT,
    GAME_2048_ACTION_BAR_ITEM_WIDTH,
    GAME_2048_PAUSE_TOUCH_SIZE,
    GAME_2048_SCORE_CARD_HEIGHT,
    GAME_2048_SCORE_CARD_WIDTH,
    GAME_2048_TITLE_HEIGHT,
    GAME_2048_TITLE_WIDTH,
    type Game2048LayoutMetrics,
} from './Game2048Layout';

const { ccclass } = _decorator;

// 一次移动的动画节奏：滑动 + 落位合计就是输入锁窗口（0.07 + 0.02 = 0.09 秒）。
// 锁定期间的下一次滑动不会丢弃，而是缓存一步，解锁后立即执行，连续快速滑动也不吞操作。
const TILE_SLIDE_DURATION = 0.07;
/** 手指移动超过这一距离（UI 坐标）就立即触发移动，不必等抬手。 */
const SWIPE_TRIGGER_DISTANCE = 30;
type HighMergeTier = 3 | 4 | 5;
/** 普通/紧张音乐切换：前一首先淡出，后一首再淡入。 */
const GAME_2048_MUSIC_TRANSITION = { fadeOutSeconds: 1.5, fadeInSeconds: 1.5 } as const;
/** 512 / 1024 / 2048+ 合成各播放一条预混音效，避免运行时按帧延迟叠放多个 Cue 造成错位。 */
const GAME_2048_HIGH_MERGE_AUDIO: Readonly<Record<HighMergeTier, string>> = {
    3: 'visual/audio/t48-tier-512-v1',
    4: 'visual/audio/t48-tier-1024-v1',
    5: 'visual/audio/t48-tier-2048-v1',
};
const TILE_SETTLE_DURATION = 0.02;
/** 达成合成的特效完整播完后，再停留这么久才弹出达成弹窗。 */
const MERGE_CELEBRATION_HOLD = 0.25;
/** 死局后先让棋盘震动、变暗，停顿这么久再弹出死局/结算界面，让玩家看清怎么输的。 */
const GAME_OVER_REVEAL_DELAY = 0.75;
/** 连击标记按最低连击数从高到低匹配；×9 起进入更亮的金色档位。 */
const COMBO_COLOR_TIERS: readonly { readonly minCount: number; readonly color: Rgb }[] = [
    { minCount: 9, color: [255, 240, 164] },
    { minCount: 6, color: [172, 84, 255] },
    { minCount: 5, color: [255, 62, 172] },
    { minCount: 4, color: [255, 132, 42] },
    { minCount: 3, color: [255, 198, 44] },
    { minCount: 2, color: [36, 220, 255] },
];
const GAME_2048_DATA_VERSION = 4;
const GAME_2048_RESOURCE_BUNDLE = 'game-2048-assets';
const GAME_2048_BACKGROUND_ASSET_PATH = 'visual/backgrounds/t48-background-v2/texture';
const GAME_2048_TITLE_ASSET_PATH = 'visual/ui/t48-title-v2/texture';
const GAME_2048_BOARD_ASSET_PATH = 'visual/boards/t48-user-board-v1/texture';
const GAME_2048_PAUSE_ICON_ASSET_PATH = 'visual/ui/t48-pause-v2/texture';
const GAME_2048_REWARDED_AD_ICON_ASSET_PATH = 'visual/ui/t48-rewarded-ad-icon-v1/texture';
const GAME_2048_POPUP_SYSTEM_ASSET_PATH = 'visual/ui/t48-popup-panel-system-v1/texture';
const GAME_2048_POPUP_RESULT_ASSET_PATH = 'visual/ui/t48-popup-panel-result-v1/texture';
const GAME_2048_POPUP_2048_ASSET_PATH = 'visual/ui/t48-popup-panel-2048-v1/texture';
// 终极目标（TARGET_TILE）庆祝弹窗底框；素材沿用最初为 4096 绘制的紫色底框，无文字，与 8192 同色系。
const GAME_2048_POPUP_TARGET_ASSET_PATH = 'visual/ui/t48-popup-panel-4096-v1/texture';
const GAME_2048_POPUP_BUTTON_CYAN_ASSET_PATH = 'visual/ui/t48-popup-button-cyan-v1/texture';
const GAME_2048_POPUP_BUTTON_AMBER_ASSET_PATH = 'visual/ui/t48-popup-button-amber-v1/texture';
const GAME_2048_POPUP_BUTTON_VIOLET_ASSET_PATH = 'visual/ui/t48-popup-button-violet-v1/texture';
const GAME_2048_POPUP_SCORE_CYAN_ASSET_PATH = 'visual/ui/t48-popup-score-cyan-v1/texture';
const GAME_2048_POPUP_SCORE_AMBER_ASSET_PATH = 'visual/ui/t48-popup-score-amber-v1/texture';
const GAME_2048_SYSTEM_POPUP_ASPECT_RATIO = 700 / 520;
const GAME_2048_RESULT_POPUP_ASPECT_RATIO = 730 / 520;
const GAME_2048_TARGET_POPUP_ASPECT_RATIO = 780 / 548;
const GAME_2048_POPUP_BUTTON_BOTTOM_PADDING = 58;
const GAME_2048_TILE_VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192] as const;
/** 无字底框（生图拼版经 tools/twenty48/slice-tile-sheets.py 切出）；数字由 Label 渲染。 */
const GAME_2048_TILE_ASSET_PATH = (value: number) => `visual/pieces/t48-tile-${value}-v3/texture`;
/**
 * 底框贴图里方块主体只占边长的这一比例（与 slice-tile-sheets.py 的 BODY_FILL 一致），其余是外发光。
 * 贴图按 1 / BODY_FILL 放大绘制，主体才正好填满棋盘槽位，外发光溢出到格间。
 */
const GAME_2048_TILE_BODY_FILL = 0.9;
const GAME_2048_FX_ASSET_PATHS = Object.freeze({
    glowSquare: 'visual/fx/t48-fx-glow-square-v1/texture',
    echo: 'visual/fx/t48-fx-echo-v1/texture',
    sparkle: 'visual/fx/t48-fx-sparkle-v1/texture',
    rays: 'visual/fx/t48-fx-rays-v1/texture',
    techRing: 'visual/fx/t48-fx-tech-ring-v1/texture',
    shockwave: 'visual/fx/t48-fx-shockwave-v1/texture',
});
const GAME_2048_HUD_CARD_ASSET_PATHS = Object.freeze({
    cyan: 'visual/ui/t48-hud-card-cyan-v1/texture',
    amber: 'visual/ui/t48-hud-card-amber-v1/texture',
});
/** 每局可免费撤销的次数；次数随当前局存档，退出重进不会重置。 */
const GAME_2048_UNDO_LIMIT = 3;
/** 1024 起合成时棋盘轻震；2048 起再加一次全屏色光闪烁。 */
const BIG_MERGE_SHAKE_MIN_VALUE = 1024;
// 新版棋盘图已去掉外圈留白；四列槽位连同内外间距约占 548/572，棋子间距略放宽为 9px。
const GAME_2048_BOARD_GRID_RATIO = 548 / 572;
const GAME_2048_BOARD_GAP_RATIO = 9 / 548;

type Game2048State = 'idle' | 'ready' | 'playing' | 'paused' | 'target' | 'completed' | 'disposed';
/** 庆祝弹窗的档位：CELEBRATION_TILES 之一（2048、4096、终极目标 8192）。 */
type AchievementTile = number;

export interface Game2048Services {
    readonly assets: AssetService;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    readonly ads?: AdService;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    /** amber 主操作、cyan 次操作、dark 最弱操作；link 是不带底框的文字链接，用于"查看棋盘"这类辅助入口。 */
    readonly tone: 'cyan' | 'amber' | 'violet' | 'link';
    readonly action: () => void | Promise<void>;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: Button[];
    readonly rebuild: () => OverlayState;
    busy: boolean;
}

interface ResultOverlayContent {
    readonly score: number;
    readonly highestTile: number;
    /** 本局开始时的最高分，用于显示"新纪录多了多少"或"距最高分还差多少"。 */
    readonly previousBest: number;
}

interface Game2048TileView {
    readonly node: Node;
    readonly homePosition: Vec3;
    /** 无字底框；底框缺失时改用 fallbackGraphics 绘制。 */
    readonly artwork: Sprite;
    readonly fallbackGraphics: Graphics;
    /** 数字始终由 Label 渲染，任意位数都能显示，字形统一。 */
    readonly valueLabel: Label;
    readonly valueOutline: LabelOutline;
    readonly opacity: UIOpacity;
    value: number;
}

const COLORS = Object.freeze({
    void: new Color(2, 6, 22, 255),
    panel: new Color(11, 22, 54, 248),
    panelLight: new Color(21, 39, 82, 255),
    cyan: new Color(30, 245, 250, 255),
    cyanDim: new Color(30, 245, 250, 64),
    violet: new Color(181, 78, 255, 255),
    violetDim: new Color(181, 78, 255, 54),
    amber: new Color(255, 214, 55, 255),
    amberDim: new Color(255, 214, 55, 64),
    white: new Color(245, 252, 255, 255),
    muted: new Color(194, 220, 247, 255),
    overlay: new Color(1, 4, 22, 204),
});

type Rgb = readonly [number, number, number];

interface TileMaterial {
    /** 棋子底色（暗部），也是数字描边色的来源。 */
    readonly surface: Rgb;
    /** 浅色高光，用于内框与特效细节。 */
    readonly facet: Rgb;
    /** 近白色内核，用于最亮的光芯。 */
    readonly core: Rgb;
    /** 辅助色，用于描边次色与双色边框。 */
    readonly accent: Rgb;
    /** 主霓虹色：棋子边框、外发光和合成特效的主色。 */
    readonly glow: Rgb;
}

/**
 * 棋子色阶的唯一来源：运行时的数字描边、合成特效和兜底绘制只读这里。
 * 无字底框的生图提示词（sprite-atlas-sources/twenty48/visual/pieces/sheets/*.prompt.txt）
 * 按各档 glow 色值出图；改色时同步更新提示词并重新生成底框。
 * 色相沿 蓝 → 青 → 绿 → 黄 → 橙 → 红 → 品红 → 紫 单向推进，相邻档位不撞色；
 * 2048 起改用金色、粉紫晶钻、彩虹棱镜三档特殊材质。
 */
const TILE_PALETTE: Readonly<Record<number, TileMaterial>> = Object.freeze({
    2: { surface: [8, 24, 70], facet: [150, 195, 255], core: [226, 238, 255], accent: [40, 92, 255], glow: [70, 142, 255] },
    4: { surface: [4, 34, 72], facet: [150, 228, 255], core: [222, 248, 255], accent: [0, 150, 236], glow: [40, 204, 255] },
    8: { surface: [3, 52, 34], facet: [150, 255, 200], core: [224, 255, 238], accent: [0, 196, 110], glow: [36, 238, 146] },
    16: { surface: [16, 52, 10], facet: [190, 255, 150], core: [236, 255, 222], accent: [58, 198, 40], glow: [112, 236, 62] },
    32: { surface: [42, 52, 6], facet: [236, 255, 150], core: [250, 255, 222], accent: [168, 214, 20], glow: [206, 242, 44] },
    64: { surface: [64, 40, 4], facet: [255, 228, 150], core: [255, 248, 222], accent: [255, 156, 20], glow: [255, 198, 44] },
    128: { surface: [72, 24, 4], facet: [255, 198, 150], core: [255, 238, 222], accent: [255, 92, 18], glow: [255, 132, 42] },
    256: { surface: [74, 8, 16], facet: [255, 162, 162], core: [255, 228, 228], accent: [228, 26, 52], glow: [255, 66, 70] },
    512: { surface: [72, 6, 46], facet: [255, 162, 222], core: [255, 228, 245], accent: [228, 28, 142], glow: [255, 62, 172] },
    1024: { surface: [38, 10, 84], facet: [216, 172, 255], core: [244, 232, 255], accent: [128, 48, 240], glow: [172, 84, 255] },
    2048: { surface: [84, 48, 4], facet: [255, 240, 160], core: [255, 252, 232], accent: [255, 148, 28], glow: [255, 212, 64] },
    4096: { surface: [20, 28, 68], facet: [255, 205, 248], core: [255, 255, 255], accent: [176, 110, 255], glow: [255, 112, 228] },
    8192: { surface: [26, 10, 56], facet: [255, 200, 246], core: [255, 255, 255], accent: [120, 92, 255], glow: [214, 160, 255] },
});

/** 棋子数字取色：内核色向高光色混合的比例，以及混合后的整体亮度系数。 */
const TILE_VALUE_FACET_MIX = 0.3;
const TILE_VALUE_BRIGHTNESS = 0.95;

/** 已绘制底框的最高档；更大的数字沿用最高档材质与底框。 */
const GAME_2048_MAX_FRAMED_TILE = 8192;

function tileMaterial(value: number): TileMaterial {
    return TILE_PALETTE[Math.min(value, GAME_2048_MAX_FRAMED_TILE)] ?? TILE_PALETTE[2];
}

function colorWithAlpha(rgb: Rgb, alpha: number): Color {
    return new Color(rgb[0], rgb[1], rgb[2], alpha);
}

@ccclass('Game2048Game')
export class Game2048Game extends Component implements MiniGame {
    /**
     * 切后台只冻结本局，不弹出暂停界面。
     * 退出 App 或接电话是玩家的常规操作，回到前台应直接继续，
     * 而不是先让玩家关掉一层自动弹出的暂停界面。
     */
    readonly backgroundPausePolicy: MiniGameBackgroundPausePolicy = 'silent';

    private state: Game2048State = 'idle';
    private context?: MiniGameContext<Game2048Services>;
    private readonly model = new Game2048Model();
    private boardNode?: Node;
    private boardContent?: Node;
    /** 棋子上方的合成光晕层：填充光在合成棋子中心留空，向外扩散时不被邻格遮挡。 */
    private mergeHaloLayer?: Node;
    /** 棋子上方的合成冲击层：只放从棋子边缘向外扩散的线条，几何上不进入合成棋子的数字区。 */
    private mergeBurstLayer?: Node;
    private readonly tileViews: Game2048TileView[] = [];
    private boardGridSizeValue = 0;
    private boardGapValue = 0;
    private boardTileSizeValue = 0;
    private scoreLabel?: Label;
    private bestLabel?: Label;
    /**
     * 合成棋子上方的 "+N" 飘字，每个格子固定一个节点（棋盘坐标，随棋盘缩放）。
     * 快速连续合成时同一格的新飘字直接替换旧的，不会叠成一摞。
     */
    private readonly floatTexts: Label[] = [];
    /** 连续递进合成的 "连击 ×N" 文字，盖在链头棋子下沿，常驻一个节点复用。 */
    private comboLabel?: Label;
    private readonly mergeChain = new Game2048MergeChain();
    /** 撤销用的历史快照（最近若干步，不超过剩余撤销次数）。 */
    private readonly undoHistory: Game2048Snapshot[] = [];
    private undosUsed = 0;
    private resumableUndosUsed = 0;
    private undoButton?: Button;
    private undoLabel?: Label;
    private readonly hudCardArtworks: { readonly sprite: Sprite; readonly graphics: Graphics; readonly tone: 'cyan' | 'amber' }[] = [];
    private readonly ownedHudCardFrames = new Map<'cyan' | 'amber', SpriteFrame>();
    private readonly actionBarArtworks: { readonly sprite: Sprite; readonly graphics: Graphics; readonly tone: OverlayAction['tone'] }[] = [];
    /** 2048 起合成时的全屏色光闪烁层，常驻一个节点循环复用。 */
    private screenFlash?: Sprite;
    private mergeFx?: Game2048MergeFx;
    private ownedFxFrames?: Game2048MergeFxFrames;
    /** 旧版 UI 素材共享的柔和霓虹材质；由 AssetService 统一追踪释放。 */
    /** 死局停顿期间等待弹出的界面；尺寸重建会立即补弹，避免停顿被打断后卡在无界面状态。 */
    private pendingGameOverReveal = false;
    private pauseButton?: Button;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private completedResultModel?: MiniGameResultModel;
    private targetOverlay?: OverlayState;
    private audioBank?: BundleAudioBank;
    private normalMusicClip?: AudioClip;
    private dangerMusicClip?: AudioClip;
    private highMergeClips: Partial<Record<HighMergeTier, AudioClip>> = {};
    private dangerLayer?: Node;
    private dangerMode = false;
    private ownedBackgroundFrame?: SpriteFrame;
    private ownedTitleFrame?: SpriteFrame;
    private ownedBoardFrame?: SpriteFrame;
    private ownedPauseFrame?: SpriteFrame;
    private ownedRewardedAdIconFrame?: SpriteFrame;
    private ownedSystemPopupFrame?: SpriteFrame;
    private ownedResultPopupFrame?: SpriteFrame;
    private ownedMilestonePopupFrame?: SpriteFrame;
    private ownedTargetPopupFrame?: SpriteFrame;
    private ownedAchievementScoreFrame?: SpriteFrame;
    private ownedResultScoreFrame?: SpriteFrame;
    private readonly ownedPopupButtonFrames = new Map<OverlayAction['tone'], SpriteFrame>();
    private readonly ownedTileFrames = new Map<number, SpriteFrame>();
    private titleArtwork?: Sprite;
    private boardArtwork?: Sprite;
    private pauseFallback?: Node;
    private pauseArtwork?: Sprite;
    private inputLocked = false;
    private touchStartX = 0;
    private touchStartY = 0;
    /** 本次触摸起手落在底部手势保护带内，抬手时不参与合成。 */
    private touchStartIgnored = false;
    /** 本次触摸已经触发过一次移动；同一次触摸只移动一步。 */
    private touchConsumed = false;
    /** 动画锁定期间收到的下一次移动，解锁后立即执行；暂停、结算、重开等时清空。 */
    private queuedDirection?: Game2048Direction;
    private playCount = 0;
    private bestScore = 0;
    private historicalHighestTile = 0;
    private roundStartingBest = 0;
    private resumableRound?: Game2048Snapshot;
    private savedProgressDiscarded = false;
    private layoutMetrics?: Game2048LayoutMetrics;
    private resizeListening = false;
    private operationGeneration = 0;
    private gameOverOverlay?: OverlayState;
    private hasShownGameOverAdOffer = false;

    setRandomSourceForTesting(random: () => number): void {
        this.model.setRandomSource(random);
    }

    async initialize(context: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize Game2048Game from ${this.state}.`);
        this.context = context;
        this.readSave();
        this.buildInterface();
        await Promise.all([this.loadBackground(), this.loadThemeAssets(), this.loadMusic()]);
        this.registerInput();
        this.audioBank = new BundleAudioBank({
            bundle: GAME_2048_RESOURCE_BUNDLE,
            cues: {
                uiButton: 'visual/audio/t48-button-v1',
                drop: 'visual/audio/t48-move-v1',
                // Invalid moves stay silent: `collision` has no clip and only vibrates.
                fold: 'visual/audio/t48-spawn-v1',
                merge: 'visual/audio/t48-merge-v1',
                chain: 'visual/audio/t48-combo-v1',
                milestone: 'visual/audio/t48-target-v1',
                failure: 'visual/audio/t48-gameover-v1',
                record: 'visual/audio/t48-record-v1',
            },
        }, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize().catch((error: unknown) => {
            // TODO: console.error('[Game2048Game] Audio initialization failed.', error);
        });
        if (this.context !== context) return;
        this.state = 'ready';
    }

    isGameplayActive(): boolean {
        return this.state === 'playing';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin Game2048Game from ${this.state}.`);
        this.operationGeneration += 1;
        this.startRound(true);
    }

    pause(): boolean {
        if (this.state !== 'playing' && this.state !== 'target') return false;
        this.operationGeneration += 1;
        this.queuedDirection = undefined;
        this.inputLocked = true;
        this.state = 'paused';
        // 移动模型已经提交时，暂停必须把复用视图同步到最终格位，避免恢复后留下半程动画。
        this.syncBoardViews();
        // 平台 hide 会复用统一暂停路径；在这里同步落盘，避免只依赖最近一次移动。
        this.persistProgress(true);
        this.context?.services.audio.pauseMusic();
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.operationGeneration += 1;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.services.audio.resumeMusic();
        if (this.targetOverlay?.root.isValid) {
            this.state = 'target';
            this.inputLocked = true;
        } else if (this.model.pendingCelebration !== undefined) {
            this.targetOverlay = undefined;
            this.showAchievementOverlay(this.model.pendingCelebration);
        } else if (!this.model.hasAvailableMove) {
            this.finishRound('no-moves');
        } else {
            this.updateDangerState();
        }
    }

    async restart(context?: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state === 'disposed') throw new Error('Cannot restart a disposed Game2048Game.');
        if (context) this.context = context;
        this.operationGeneration += 1;
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.destroyOverlay(this.gameOverOverlay);
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.targetOverlay = undefined;
        this.gameOverOverlay = undefined;
        this.startRound();
    }

    discardSavedProgress(): void {
        this.savedProgressDiscarded = true;
        this.persistProgress(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.operationGeneration += 1;
        if (!this.savedProgressDiscarded
            && (this.state === 'playing' || this.state === 'paused' || this.state === 'target')) {
            this.persistProgress(true);
        }
        this.state = 'disposed';
        this.unscheduleAllCallbacks();
        this.unregisterInput();
        this.setDangerMode(false, false);
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.normalMusicClip = undefined;
        this.dangerMusicClip = undefined;
        this.highMergeClips = {};
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.destroyOverlay(this.gameOverOverlay);
        this.pendingGameOverReveal = false;
        this.mergeFx?.dispose();
        this.mergeFx = undefined;
        this.tileViews.length = 0;
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        this.destroyOwnedThemeFrames();
        this.context = undefined;
    }

    private destroyOwnedThemeFrames(): void {
        this.ownedBackgroundFrame?.destroy();
        this.ownedBackgroundFrame = undefined;
        if (this.ownedTitleFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedTitleFrame);
        this.ownedTitleFrame = undefined;
        if (this.ownedBoardFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedBoardFrame);
        this.ownedBoardFrame = undefined;
        if (this.ownedPauseFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedPauseFrame);
        this.ownedPauseFrame = undefined;
        if (this.ownedRewardedAdIconFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedRewardedAdIconFrame);
        this.ownedRewardedAdIconFrame = undefined;
        if (this.ownedSystemPopupFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedSystemPopupFrame);
        this.ownedSystemPopupFrame = undefined;
        if (this.ownedResultPopupFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedResultPopupFrame);
        this.ownedResultPopupFrame = undefined;
        if (this.ownedMilestonePopupFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedMilestonePopupFrame);
        this.ownedMilestonePopupFrame = undefined;
        if (this.ownedTargetPopupFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedTargetPopupFrame);
        this.ownedTargetPopupFrame = undefined;
        if (this.ownedAchievementScoreFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedAchievementScoreFrame);
        this.ownedAchievementScoreFrame = undefined;
        if (this.ownedResultScoreFrame) this.context?.services.assets.releaseRuntimeAsset(this.ownedResultScoreFrame);
        this.ownedResultScoreFrame = undefined;
        this.ownedPopupButtonFrames.forEach(frame => this.context?.services.assets.releaseRuntimeAsset(frame));
        this.ownedPopupButtonFrames.clear();
        this.ownedHudCardFrames.forEach(frame => this.context?.services.assets.releaseRuntimeAsset(frame));
        this.ownedHudCardFrames.clear();
        this.ownedTileFrames.forEach(frame => this.context?.services.assets.releaseRuntimeAsset(frame));
        this.ownedTileFrames.clear();
        if (this.ownedFxFrames) {
            const frames = this.ownedFxFrames;
            (Object.keys(frames) as (keyof Game2048MergeFxFrames)[])
                .forEach(key => this.context?.services.assets.releaseRuntimeAsset(frames[key]));
        }
        this.ownedFxFrames = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.hidePauseMenu();
        this.pauseOverlay = this.buildOverlay(
            'Game2048PauseOverlay',
            "游戏暂停",
            `当前分数：${this.model.score}\n棋盘已暂停，进度已保留`,
            [
                { name: 'ResumeButton', label: "继续游戏", tone: 'amber', action: model.resume },
                { name: 'RestartButton', label: "重新开始", tone: 'cyan', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'violet', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = model;
        this.destroyOverlay(this.targetOverlay);
        this.targetOverlay = undefined;
        this.destroyOverlay(this.gameOverOverlay);
        this.gameOverOverlay = undefined;
        const extra = model.result.extra ?? {};
        const highest = typeof extra.highestTile === 'number' ? Math.floor(extra.highestTile) : this.model.highestTile;
        const reason = extra.reason === 'target-complete' ? '目标达成' : "本局结束";
        const record = extra.newRecord === true;
        this.resultOverlay = this.buildOverlay(
            'Game2048ResultOverlay',
            record ? '新纪录' : reason,
            `本局得分：${model.result.score}\n最大数字：${highest}`,
            [
                { name: 'RestartButton', label: '再来一局', tone: 'amber', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'cyan', action: model.returnToLobby },
                {
                    name: 'InspectBoardButton',
                    label: '关闭并查看棋盘',
                    tone: 'link',
                    action: () => this.dismissResultOverlay(),
                },
            ],
            { score: model.result.score, highestTile: highest, previousBest: this.roundStartingBest },
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = undefined;
    }

    private startRound(allowResume = false): void {
        // 重开前运行层会先 pause()（结算后则已由 finishRound 暂停），上一局也可能停在危险状态；
        // 新一局先清掉危险表现，结尾再按新棋盘恢复正确曲目。
        this.setDangerMode(false, false);
        this.pendingGameOverReveal = false;
        this.queuedDirection = undefined;
        this.mergeChain.reset();
        this.mergeFx?.clear();
        this.resetBoardPose();
        this.savedProgressDiscarded = false;
        const savedRound = allowResume ? this.resumableRound : undefined;
        this.resumableRound = undefined;
        this.undoHistory.length = 0;
        this.undosUsed = savedRound ? this.resumableUndosUsed : 0;
        this.resumableUndosUsed = 0;
        if (savedRound) {
            this.model.restore(savedRound);
        } else {
            this.model.reset();
            this.playCount += 1;
        }
        const resumedCelebration = savedRound ? this.model.pendingCelebration : undefined;
        const resumedDeadTarget = !!savedRound
            && this.model.highestTile >= TARGET_TILE
            && !this.model.hasAvailableMove;
        this.roundStartingBest = this.bestScore;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.reportScore(0);
        this.completedResultModel = undefined;
        this.persistProgress(true);
        this.syncBoardViews();
        this.refreshHud();
        if (resumedCelebration !== undefined) this.showAchievementOverlay(resumedCelebration);
        else if (resumedDeadTarget) this.finishRound('target-complete');
        else this.updateDangerState();
        if (!resumedDeadTarget) this.resumeRoundMusic();
    }

    private registerInput(): void {
        this.node.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.pauseButton?.node.on(Button.EventType.CLICK, this.handlePause, this);
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = true;
        }
    }

    private unregisterInput(): void {
        this.node.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
    }

    private readonly handleCanvasResize = (): void => {
        if (!this.node.isValid || this.state === 'disposed' || this.state === 'idle') return;

        this.operationGeneration += 1;
        this.queuedDirection = undefined;
        const pauseRebuild = this.pauseOverlay?.rebuild;
        const resultRebuild = this.resultOverlay?.rebuild;
        const targetRebuild = this.targetOverlay?.rebuild;
        const gameOverOfferShown = !!this.gameOverOverlay?.root.isValid;
        const shouldRestoreDanger = this.dangerMode;
        const wasPaused = this.state === 'paused';
        const wasCompleted = this.state === 'completed';
        const wasTarget = this.state === 'target';
        const wasAnimatingMove = this.state === 'playing' && this.inputLocked;

        this.unregisterInput();
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.targetOverlay = undefined;
        this.gameOverOverlay = undefined;
        this.dangerLayer = undefined;
        this.buildInterface();
        this.applyLoadedThemeAssets();
        this.syncBoardViews();
        this.refreshHud();
        if (shouldRestoreDanger) {
            const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
            this.createDangerLayer(emptyCount);
        }
        this.registerInput();
        void this.loadBackground();

        if (wasPaused && pauseRebuild) {
            this.pauseOverlay = pauseRebuild();
        } else if (wasCompleted && resultRebuild) {
            this.resultOverlay = resultRebuild();
        } else if (wasTarget && targetRebuild) {
            this.targetOverlay = targetRebuild();
        } else if (wasCompleted && gameOverOfferShown) {
            // 复活弹窗随界面一起被销毁，按当前局面重建。
            this.showGameOverAdOffer();
        } else if (wasCompleted && this.pendingGameOverReveal) {
            // 死局停顿被尺寸重建打断（重建会使计划中的回调失效），直接补弹界面。
            this.revealGameOver();
        }

        if (wasAnimatingMove) {
            this.inputLocked = false;
            if (this.model.pendingCelebration !== undefined) {
                this.showAchievementOverlay(this.model.pendingCelebration);
            } else if (!this.model.hasAvailableMove) {
                this.finishRound('no-moves');
            } else {
                this.updateDangerState();
            }
        }
    };

    private readonly handleTouchStart = (event: EventTouch): void => {
        const location = event.getUILocation();
        this.touchStartX = location.x;
        this.touchStartY = location.y;
        // 屏幕底部是系统上滑退出手势的起手区，落在保护带内的触摸不参与合成，
        // 避免玩家准备退出时意外滑动棋盘。保护带高度由布局按屏幕高度算出。
        this.touchStartIgnored = location.y < (this.layoutMetrics?.bottomSwipeExclusion ?? 0);
        this.touchConsumed = false;
    };

    /** 滑动距离一达到阈值就触发移动，手指不必抬起。 */
    private readonly handleTouchMove = (event: EventTouch): void => {
        this.resolveSwipe(event);
    };

    /** 移动事件稀疏的快速轻扫，在抬手时补判一次。 */
    private readonly handleTouchEnd = (event: EventTouch): void => {
        this.resolveSwipe(event);
    };

    private resolveSwipe(event: EventTouch): void {
        if (this.touchStartIgnored || this.touchConsumed) return;
        const location = event.getUILocation();
        const deltaX = location.x - this.touchStartX;
        const deltaY = location.y - this.touchStartY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_TRIGGER_DISTANCE) return;
        this.touchConsumed = true;
        this.requestMove(Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'up' : 'down'));
    }

    /** 空闲时立即移动；上一步动画尚未结束时缓存这一步（只保留最新的一步）。 */
    private requestMove(direction: Game2048Direction): void {
        if (this.state !== 'playing') return;
        if (this.inputLocked) {
            this.queuedDirection = direction;
            return;
        }
        this.performMove(direction);
    }

    private readonly handleKeyDown = (event: EventKeyboard): void => {
        const directions: Partial<Record<KeyCode, Game2048Direction>> = {
            [KeyCode.ARROW_LEFT]: 'left',
            [KeyCode.KEY_A]: 'left',
            [KeyCode.ARROW_RIGHT]: 'right',
            [KeyCode.KEY_D]: 'right',
            [KeyCode.ARROW_UP]: 'up',
            [KeyCode.KEY_W]: 'up',
            [KeyCode.ARROW_DOWN]: 'down',
            [KeyCode.KEY_S]: 'down',
        };
        const direction = directions[event.keyCode];
        if (direction) this.requestMove(direction);
    };

    private readonly handlePause = (): void => {
        if (this.state === 'completed' && this.completedResultModel) {
            this.context?.services.feedback.play('uiButton');
            this.showResultView(this.completedResultModel);
            return;
        }
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private performMove(direction: Game2048Direction): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        const generation = this.operationGeneration;
        const before = this.model.snapshot;
        const result = this.model.move(direction);
        if (!result.changed) {
            this.context?.services.feedback.play('collision');
            if (result.gameOver) this.finishRound('no-moves');
            return;
        }

        this.inputLocked = true;
        this.undoHistory.push(before);
        const keep = Math.max(0, GAME_2048_UNDO_LIMIT - this.undosUsed);
        if (this.undoHistory.length > keep) this.undoHistory.splice(0, this.undoHistory.length - keep);
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.context?.reportScore(this.model.score);
        this.playMoveFeedback(result);
        this.animateBoardMove(result);
        this.refreshHud();
        this.playScorePunch(result.scoreGained);
        this.mergeChain.advance(result, this.model.board);
        this.persistProgress();
        const achievementTile = this.achievementTileForMove(result);
        // 合成特效在滑动结束时开始；达成弹窗等最高档特效完整播完再停留片刻，不再用固定延迟截断特效。
        const celebrationDelay = Math.max(
            0,
            mergeFxDuration(this.highestMergedValue(result)) + MERGE_CELEBRATION_HOLD - TILE_SETTLE_DURATION,
        );

        this.scheduleOnce(() => {
            if (!this.isOperationCurrent(generation)) return;
            this.syncBoardViews(result, direction);
            this.playMergeEffects(result);
            this.playHighMergeFeedback(result);
            this.updateDangerState(result.gameOver);
        }, TILE_SLIDE_DURATION);

        this.scheduleOnce(() => {
            if (!this.isOperationCurrent(generation) || this.state !== 'playing') return;
            if (achievementTile !== undefined) {
                this.scheduleOnce(() => {
                    if (!this.isOperationCurrent(generation)) return;
                    this.showAchievementOverlay(achievementTile);
                }, celebrationDelay);
                return;
            }
            this.inputLocked = false;
            this.refreshHud();
            if (result.gameOver) {
                this.finishRound('no-moves');
                return;
            }
            const queued = this.queuedDirection;
            this.queuedDirection = undefined;
            if (queued) this.performMove(queued);
        }, TILE_SLIDE_DURATION + TILE_SETTLE_DURATION);
    }

    private isOperationCurrent(generation: number): boolean {
        return this.state === 'playing'
            && this.operationGeneration === generation
            && this.node.isValid;
    }

    /** 这一步刚合成出的待庆祝档位（2048 / 4096 / 8192）。 */
    private achievementTileForMove(result: Game2048MoveResult): AchievementTile | undefined {
        const pending = this.model.pendingCelebration;
        return pending !== undefined && this.highestMergedValue(result) >= pending ? pending : undefined;
    }

    private playMoveFeedback(result: Game2048MoveResult): void {
        if (result.mergedIndices.length > 1) this.context?.services.feedback.play('chain');
        else if (result.mergedIndices.length === 1) this.context?.services.feedback.play('merge');
        else this.context?.services.feedback.play('drop');
    }

    private playHighMergeFeedback(result: Game2048MoveResult): void {
        const highest = this.highestMergedValue(result);
        if (highest < 128) {
            if (result.reachedTarget) this.context?.services.feedback.play('milestone');
            return;
        }

        const level = Math.min(5, Math.max(1, Math.log2(highest) - 6));
        const feedback = this.context?.services.feedback;
        if (!feedback) return;

        // 大数字合成的独立震感与方块落位动效同步，并随数字等级增强。
        feedback.vibrate(level >= 3 ? 'heavy' : 'medium');

        if (level === 1) {
            feedback.play('fold', { vibrate: false });
            return;
        }
        if (level === 2) {
            feedback.play('chain', { vibrate: false });
            return;
        }

        // 512 及以上：每一级是一条在同一时间线上预混好的音效（阶梯琶音 + 落地冲击 + 绽放），
        // 不再在运行时用 scheduleOnce 叠放 chain/fold/milestone。
        const clip = this.highMergeClips[level as HighMergeTier];
        if (clip) this.context?.services.audio.playEffect(clip);
        else feedback.play('chain', { vibrate: false });
    }

    private highestMergedValue(result: Game2048MoveResult): number {
        return result.mergedIndices.reduce(
            (highest, index) => Math.max(highest, this.model.board[index] ?? 0),
            0,
        );
    }

    private showAchievementOverlay(tile: AchievementTile): void {
        if (this.state !== 'playing' || this.model.pendingCelebration !== tile) return;
        this.state = 'target';
        this.queuedDirection = undefined;
        this.inputLocked = true;
        this.targetOverlay = this.buildTargetOverlay(
            [
                {
                    name: 'ContinueButton',
                    label: '继续冲击更高纪录',
                    tone: 'amber',
                    action: () => {
                        this.model.acknowledgeCelebration();
                        this.persistProgress(true);
                        this.destroyOverlay(this.targetOverlay);
                        this.destroyOverlay(this.gameOverOverlay);
                        this.targetOverlay = undefined;
                        if (!this.model.hasAvailableMove) {
                            this.finishRound('target-complete');
                            return;
                        }
                        this.state = 'playing';
                        this.inputLocked = false;
                        this.updateDangerState();
                    },
                },
                {
                    name: 'FinishButton',
                    label: "结束并结算",
                    tone: 'cyan',
                    action: () => this.finishRound('target-complete'),
                },
                {
                    name: 'LobbyButton',
                    label: '返回大厅',
                    tone: 'violet',
                    action: () => {
                        const result = this.createResult('target-complete');
                        this.persistProgress();
                        this.context?.requestLobby(result);
                    },
                },
            ],
            tile,
        );
    }

    private finishRound(reason: 'no-moves' | 'target-complete'): void {
        if (this.state === 'completed' || this.state === 'disposed') return;
        this.state = 'completed';
        this.queuedDirection = undefined;
        this.inputLocked = true;
        this.setDangerMode(false, false);
        this.context?.services.audio.pauseMusic();
        const newRecord = this.model.score > this.roundStartingBest;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.persistProgress(false);
        if (reason === 'no-moves') this.context?.services.feedback.play('failure');
        if (newRecord) this.context?.services.feedback.play('record');
        if (reason === 'no-moves') {
            // 死局先停顿：棋盘震动并变暗，让玩家看清最后的局面，再弹出复活/结算界面。
            this.pendingGameOverReveal = true;
            this.playGameOverBeat();
            const generation = this.operationGeneration;
            this.scheduleOnce(() => {
                if (this.operationGeneration !== generation) return;
                this.revealGameOver();
            }, GAME_OVER_REVEAL_DELAY);
            return;
        }
        this.context?.requestExit(this.createResult(reason));
    }

    /** 死局停顿结束：广告开启时首次死局给复活机会，否则直接结算。重复调用只生效一次。 */
    private revealGameOver(): void {
        if (!this.pendingGameOverReveal || this.state !== 'completed' || !this.node.isValid) return;
        this.pendingGameOverReveal = false;
        if (!this.hasShownGameOverAdOffer && this.isAdsEnabled()) {
            this.hasShownGameOverAdOffer = true;
            this.showGameOverAdOffer();
            return;
        }
        this.context?.requestExit(this.createResult('no-moves'));
    }

    private playGameOverBeat(): void {
        this.shakeBoard(9, 0.05);
        this.tileViews.forEach((view) => {
            if (!view.node.active) return;
            Tween.stopAllByTarget(view.opacity);
            tween(view.opacity).to(0.35, { opacity: 110 }, { easing: 'quadOut' }).start();
        });
    }

    /** 棋盘左右轻震后回到布局位置；振幅为设计像素。 */
    private shakeBoard(amplitude: number, step: number): void {
        const board = this.boardNode;
        const metrics = this.layoutMetrics;
        if (!board?.isValid || !metrics) return;
        this.resetBoardPose();
        const offset = amplitude * metrics.fitScale;
        let shake = tween(board);
        [1, -1, 0.6, -0.6, 0.25, 0].forEach((factor) => {
            shake = shake.to(step, { position: new Vec3(metrics.boardX + offset * factor, metrics.boardY, 0) });
        });
        shake.start();
    }

    /** 棋盘复位到布局位置；震动、重开和尺寸重建都从这里收口。 */
    private resetBoardPose(): void {
        const board = this.boardNode;
        const metrics = this.layoutMetrics;
        if (!board?.isValid || !metrics) return;
        Tween.stopAllByTarget(board);
        board.setPosition(metrics.boardX, metrics.boardY, 0);
    }

    private isAdsEnabled(): boolean {
        const context = this.context;
        return context?.services.ads?.isEnabledForGame(context.gameId) === true;
    }

    private showGameOverAdOffer(): void {
        if (!this.isAdsEnabled()) {
            this.context?.requestExit(this.createResult('no-moves'));
            return;
        }
        this.gameOverOverlay = this.buildOverlay(
            'Game2048GameOverAdOverlay',
            "没有可移动的方块了",
            `当前分数：${this.model.score}\n看广告清除所有 2 和 4，继续本局`,
            [
                { name: 'WatchAdButton', label: "看广告清除 2 和 4", tone: 'amber', action: () => this.watchGameOverAd() },
                { name: 'SettleButton', label: "结束并结算", tone: 'cyan', action: () => this.context?.requestExit(this.createResult('no-moves')) },
                { name: 'LobbyButton', label: '返回大厅', tone: 'violet', action: () => this.context?.requestLobby(this.createResult('no-moves')) },
            ],
        );
        const button = this.gameOverOverlay.buttons.find((candidate) => candidate.node.name === 'WatchAdButton');
        if (button && this.ownedRewardedAdIconFrame) {
            const iconNode = this.createNode(button.node, 'RewardedAdIcon', -128, 0, 52, 38);
            const icon = iconNode.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;
            icon.spriteFrame = this.ownedRewardedAdIconFrame;
        }
    }

    private async watchGameOverAd(): Promise<void> {
        const context = this.context;
        if (!context || !this.isAdsEnabled()) return;
        const result = await context.services.ads.showRewarded({
            placement: AD_PLACEMENTS.game2048ClearSmallTiles,
            gameId: context.gameId,
            sessionId: context.sessionId,
        });
        if (result.outcome !== 'completed') return;
        this.destroyOverlay(this.gameOverOverlay);
        this.gameOverOverlay = undefined;
        await this.playSmallTileClearEffect();
        this.model.clearSmallTiles();
        this.mergeChain.reset();
        this.undoHistory.length = 0;
        this.state = 'playing';
        this.inputLocked = false;
        this.syncBoardViews();
        this.refreshHud();
        this.persistProgress(true);
        this.updateDangerState();
        this.resumeRoundMusic();
    }

    /**
     * 开局和复活时恢复本局音乐：pause()/finishRound() 会让音频服务处于游戏暂停状态，
     * 期间 playMusic 只切换曲目、不会开始播放。这里按当前危险状态选定曲目，再解除暂停。
     */
    private resumeRoundMusic(): void {
        const audio = this.context?.services.audio;
        if (!audio) return;
        const clip = this.dangerMode ? this.dangerMusicClip : this.normalMusicClip;
        if (clip) audio.playMusic(clip);
        audio.resumeMusic();
    }

    private playSmallTileClearEffect(): Promise<void> {
        const content = this.boardContent;
        if (!content) return Promise.resolve();
        const targets = this.model.board
            .map((value, index) => (value === 2 || value === 4) ? content.getChildByName(`Tile-${index}`) : undefined)
            .filter((tile): tile is Node => !!tile && tile.isValid);
        if (targets.length === 0) return Promise.resolve();
        return new Promise((resolve) => {
            let remaining = targets.length;
            targets.forEach((tile) => {
                const opacity = tile.getComponent(UIOpacity) ?? tile.addComponent(UIOpacity);
                Tween.stopAllByTarget(tile);
                Tween.stopAllByTarget(opacity);
                tween(tile).to(0.22, { scale: new Vec3(0.55, 0.55, 1) }, { easing: 'quadIn' }).start();
                tween(opacity)
                    .to(0.22, { opacity: 0 }, { easing: 'quadIn' })
                    .call(() => {
                        remaining -= 1;
                        if (remaining === 0) resolve();
                    })
                    .start();
            });
        });
    }

    private createResult(reason: 'no-moves' | 'target-complete') {
        return Object.freeze({
            score: this.model.score,
            duration: 0,
            completed: true,
            extra: Object.freeze({
                reason,
                highestTile: this.model.highestTile,
                newRecord: this.model.score > this.roundStartingBest,
            }),
        });
    }

    private readSave(): void {
        const stored = this.context?.services.storage.getGameData('game2048');
        const data = stored?.dataVersion === GAME_2048_DATA_VERSION ? stored : undefined;
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        const highest = data?.custom?.highestTile;
        this.historicalHighestTile = typeof highest === 'number' && Number.isFinite(highest)
            ? Math.max(0, Math.floor(highest))
            : 0;
        this.resumableRound = this.readResumableRound(data);
    }

    private readResumableRound(data?: GameSaveData): Game2048Snapshot | undefined {
        const round = data?.custom?.activeRound;
        if (!round || typeof round !== 'object' || Array.isArray(round)) return undefined;
        const value = round as Record<string, unknown>;
        if (value.inProgress !== true
            || !Array.isArray(value.board)
            || typeof value.score !== 'number') {
            return undefined;
        }

        try {
            // 新存档记录 celebratedTile；v4 存档只有两个确认标记，交给模型迁移。
            const snapshot: Game2048Snapshot = {
                board: value.board as number[],
                score: value.score,
                celebratedTile: typeof value.celebratedTile === 'number' ? value.celebratedTile : undefined,
                targetAcknowledged: typeof value.targetAcknowledged === 'boolean' ? value.targetAcknowledged : undefined,
                milestoneAcknowledged: typeof value.milestoneAcknowledged === 'boolean' ? value.milestoneAcknowledged : undefined,
            };
            this.model.restore(snapshot);
            if (!this.model.hasAvailableMove && this.model.highestTile < TARGET_TILE) return undefined;
            const undosUsed = typeof value.undosUsed === 'number' && Number.isFinite(value.undosUsed)
                ? Math.floor(value.undosUsed)
                : 0;
            this.resumableUndosUsed = Math.max(0, Math.min(GAME_2048_UNDO_LIMIT, undosUsed));
            return this.model.snapshot;
        } catch (error: unknown) {
            // TODO: console.warn('[Game2048Game] Ignoring invalid round save.', error);
            return undefined;
        }
    }

    private persistProgress(inProgress = true): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const data: GameSaveData = {
            dataVersion: GAME_2048_DATA_VERSION,
            playCount: this.playCount,
            highScore: Math.max(this.bestScore, this.model.score),
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                highestTile: Math.max(this.historicalHighestTile, this.model.highestTile),
                activeRound: Object.freeze({
                    inProgress,
                    undosUsed: this.undosUsed,
                    ...this.model.snapshot,
                }),
            }),
        };
        try {
            storage.writeGameData('game2048', data);
        } catch (error: unknown) {
            // TODO: console.error('[Game2048Game] Save failed.', error);
        }
    }

    private buildInterface(): void {
        this.tileViews.length = 0;
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        const metrics = this.readLayoutMetrics();
        this.layoutMetrics = metrics;
        const { width, height } = metrics;
        this.node.getComponent(UITransform)?.setContentSize(width, height);

        const backdropBleed = 32;
        const backgroundImage = this.createNode(
            this.node,
            'BackgroundImage',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        backgroundImage.setSiblingIndex(0);
        const backdrop = this.createNode(
            this.node,
            'NeonBackdrop',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        const background = backdrop.addComponent(Graphics);
        // 用户背景本身已包含电路与环境光，运行时只保留一层很轻的可读性遮罩。
        background.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 18);
        background.rect(
            -(width + backdropBleed) / 2,
            -(height + backdropBleed) / 2,
            width + backdropBleed,
            height + backdropBleed,
        );
        background.fill();

        // Wide, low-alpha pools create a neon atmosphere without leaving bright hotspots.
        [
            { x: -width * 0.48, y: height * 0.35, radius: 310, color: COLORS.cyan, alpha: 9 },
            { x: -width * 0.48, y: height * 0.35, radius: 220, color: COLORS.cyan, alpha: 12 },
            { x: -width * 0.48, y: height * 0.35, radius: 145, color: COLORS.cyan, alpha: 15 },
            { x: width * 0.48, y: height * 0.22, radius: 270, color: COLORS.violet, alpha: 9 },
            { x: width * 0.48, y: height * 0.22, radius: 178, color: COLORS.violet, alpha: 12 },
            { x: width * 0.46, y: -height * 0.34, radius: 300, color: COLORS.amber, alpha: 7 },
            { x: width * 0.46, y: -height * 0.34, radius: 195, color: COLORS.amber, alpha: 10 },
        ].forEach((glow) => {
            background.fillColor = new Color(glow.color.r, glow.color.g, glow.color.b, glow.alpha);
            background.circle(glow.x, glow.y, glow.radius);
            background.fill();
        });

        background.strokeColor = new Color(65, 145, 163, 28);
        background.lineWidth = 1;
        const gridXs: number[] = [];
        const gridYs: number[] = [];
        for (let x = -width / 2 + 48; x < width / 2; x += 84) {
            gridXs.push(x);
            background.moveTo(x, -height / 2);
            background.lineTo(x, height / 2);
        }
        background.stroke();
        background.strokeColor = new Color(127, 102, 189, 22);
        for (let y = -height / 2 + 38; y < height / 2; y += 84) {
            gridYs.push(y);
            background.moveTo(-width / 2, y);
            background.lineTo(width / 2, y);
        }
        background.stroke();

        gridXs.forEach((x, column) => {
            gridYs.forEach((y, row) => {
                if ((column * 3 + row * 5) % 11 !== 0) return;
                const accent = (column + row) % 3 === 0 ? COLORS.violet : COLORS.cyan;
                background.fillColor = new Color(accent.r, accent.g, accent.b, 42);
                background.circle(x, y, 2.4);
                background.fill();
            });
        });

        const titleFrame = this.createNode(
            this.node,
            'TitleCircuit',
            metrics.titleX,
            metrics.titleY,
            GAME_2048_TITLE_WIDTH,
            GAME_2048_TITLE_HEIGHT,
        );
        titleFrame.setScale(metrics.titleScale, metrics.titleScale, 1);
        const titleArtworkNode = this.createNode(
            titleFrame,
            'TitleArtwork',
            0,
            0,
            GAME_2048_TITLE_WIDTH,
            GAME_2048_TITLE_HEIGHT,
        );
        const titleArtwork = titleArtworkNode.addComponent(Sprite);
        titleArtwork.sizeMode = Sprite.SizeMode.CUSTOM;
        titleArtworkNode.active = false;
        titleArtworkNode.setSiblingIndex(titleFrame.children.length - 1);
        this.titleArtwork = titleArtwork;
        this.pauseButton = this.createPauseButton(
            this.node,
            'PauseButton',
            metrics.pauseX,
            metrics.pauseY,
        );
        // 暂停按钮使用独立图标，触摸热区略大于图标本身。
        this.pauseButton.node.setScale(metrics.fitScale, metrics.fitScale, 1);

        this.hudCardArtworks.length = 0;
        this.scoreLabel = this.createHudCard(metrics.scoreLeftX, metrics.scoreY, '分数', 'cyan', metrics.fitScale);
        this.bestLabel = this.createHudCard(metrics.scoreRightX, metrics.scoreY, "最高分", 'amber', metrics.fitScale);

        const boardSize = GAME_2048_BOARD_SIZE;
        this.boardNode = this.createNode(
            this.node,
            'BoardPanel',
            metrics.boardX,
            metrics.boardY,
            GAME_2048_BOARD_NODE_SIZE,
            GAME_2048_BOARD_NODE_SIZE,
        );
        this.boardNode.setScale(metrics.boardScale, metrics.boardScale, 1);
        const boardArtworkNode = this.createNode(
            this.boardNode,
            'BoardArtwork',
            0,
            0,
            boardSize,
            boardSize,
        );
        const boardArtwork = boardArtworkNode.addComponent(Sprite);
        boardArtwork.sizeMode = Sprite.SizeMode.CUSTOM;
        boardArtworkNode.active = false;
        const boardGridSize = this.boardGridSize(boardSize);
        // 棋子视图依赖 setSiblingIndex(0..15) 排序，特效放在 BoardContent 上方的独立层，
        // 不与棋子混排；光晕只避开合成棋子中心，神光和冲击线均可完整扫过邻格。
        this.boardContent = this.createNode(this.boardNode, 'BoardContent', 0, 0, boardGridSize, boardGridSize);
        this.mergeHaloLayer = this.createNode(this.boardNode, 'MergeHaloLayer', 0, 0, boardGridSize, boardGridSize);
        this.mergeBurstLayer = this.createNode(this.boardNode, 'MergeBurstLayer', 0, 0, boardGridSize, boardGridSize);
        this.rebuildMergeFx();
        this.buildTileViews(boardGridSize);
        // 飘字字号取决于棋子尺寸，必须在棋子视图算出尺寸之后创建。
        this.buildFloatTexts(boardGridSize);
        this.boardArtwork = boardArtwork;

        this.createLabel(
            this.node,
            'Hint',
            '',
            metrics.hintX,
            metrics.hintY,
            25 * metrics.fitScale,
            COLORS.muted,
            metrics.hintWidth,
            metrics.hintHeight,
        );
        this.buildActionBar(metrics);
        // 全屏色光闪烁层位于 HUD 与棋盘之上、弹窗之下（弹窗总是追加到最后）。
        // 柔光方块贴图的不透明平台约占边长的一半，放大到 2.4 倍屏幕才能让平台铺满整屏。
        const flashSize = Math.max(width, height) * 2.4;
        const flashNode = this.createNode(this.node, 'ScreenFlash', 0, 0, flashSize, flashSize);
        flashNode.addComponent(UIOpacity).opacity = 0;
        this.screenFlash = flashNode.addComponent(Sprite);
        this.screenFlash.sizeMode = Sprite.SizeMode.CUSTOM;
        this.applyLoadedThemeAssets();
    }

    private readLayoutMetrics(): Game2048LayoutMetrics {
        const canvasSize = this.node.parent?.getComponent(UITransform)?.contentSize;
        const visible = view.getVisibleSize();
        const width = visible.width > 0 ? visible.width : canvasSize?.width ?? 750;
        const height = visible.height > 0 ? visible.height : canvasSize?.height ?? 1334;
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visible.width > 0 ? width / visible.width : 1;
        const scaleY = visible.height > 0 ? height / visible.height : 1;
        const systemSafeLeft = Math.max(0, safeRect.x) * scaleX;
        const systemSafeRight = Math.max(0, visible.width - safeRect.x - safeRect.width) * scaleX;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY;
        const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
        return calculateGame2048LayoutFromPlatform(
            width,
            height,
            this.context?.services.platform.getLayoutInfo(),
            {
                safeTop: systemSafeTop,
                safeBottom: systemSafeBottom,
                safeLeft: systemSafeLeft,
                safeRight: systemSafeRight,
            },
        );
    }

    private loadBackground(): Promise<void> {
        const bundle = assetManager.getBundle(GAME_2048_RESOURCE_BUNDLE);
        const background = this.node.getChildByName('BackgroundImage');
        if (!bundle || !background) return Promise.resolve();

        return new Promise((resolve) => {
            bundle.load(GAME_2048_BACKGROUND_ASSET_PATH, Texture2D, (error, texture) => {
                if (!error && texture && this.node.isValid && background.isValid) {
                    const sprite = background.addComponent(Sprite);
                    const spriteFrame = new SpriteFrame();
                    spriteFrame.texture = texture;
                    this.ownedBackgroundFrame?.destroy();
                    this.ownedBackgroundFrame = spriteFrame;
                    sprite.spriteFrame = spriteFrame;
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

                    const rootSize = this.node.getComponent(UITransform)?.contentSize;
                    const targetWidth = rootSize?.width ?? 750;
                    const targetHeight = rootSize?.height ?? 1334;
                    const cover = calculateGame2048BackgroundCover(
                        targetWidth,
                        targetHeight,
                        texture.width / Math.max(1, texture.height),
                    );
                    // Cover 只按统一比例放大，超出视口的部分交给 Camera 裁切，禁止非等比拉伸。
                    background.getComponent(UITransform)?.setContentSize(cover.width, cover.height);
                    const backdrop = this.node.getChildByName('NeonBackdrop');
                    if (backdrop) backdrop.active = false;
                } else if (error) {
                    // TODO: console.warn('[Game2048Game] Neon background failed to load.', error);
                }
                resolve();
            });
        });
    }

    private async loadThemeAssets(): Promise<void> {
        const bundle = assetManager.getBundle(GAME_2048_RESOURCE_BUNDLE);
        if (!bundle) return;
        const tileFrames = await this.context!.services.assets.loadSpriteFrames(GAME_2048_RESOURCE_BUNDLE,
            GAME_2048_TILE_VALUES.map(value => ({
                key: String(value),
                path: PACKED_SPRITE_PATHS[GAME_2048_TILE_ASSET_PATH(value)],
            })));
        // 特效贴图整组加载；任一失败时整组缺省，合成只保留棋子自身的挤压回弹。
        const fxFrames = await this.context!.services.assets.loadSpriteFrames(GAME_2048_RESOURCE_BUNDLE,
            (Object.keys(GAME_2048_FX_ASSET_PATHS) as (keyof Game2048MergeFxFrames)[])
                .map(key => ({ key, path: PACKED_SPRITE_PATHS[GAME_2048_FX_ASSET_PATHS[key]] })))
            .catch((error: unknown) => {
                // TODO: console.warn('[Game2048Game] Merge effect textures failed to load.', error);
                return undefined;
            });
        const [
            title,
            board,
            pause,
            systemPopup,
            resultPopup,
            milestonePopup,
            targetPopup,
            cyanButton,
            amberButton,
            violetButton,
            achievementScore,
            resultScore,
        ] = await Promise.all([
            this.loadTextureFrame(GAME_2048_TITLE_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_BOARD_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_PAUSE_ICON_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SYSTEM_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_RESULT_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_2048_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_TARGET_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_CYAN_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_AMBER_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_BUTTON_VIOLET_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SCORE_CYAN_ASSET_PATH),
            this.loadTextureFrame(GAME_2048_POPUP_SCORE_AMBER_ASSET_PATH),
        ]);

        if (!this.node.isValid || this.state === 'disposed') {
            if (title) this.context?.services.assets.releaseRuntimeAsset(title);
            if (board) this.context?.services.assets.releaseRuntimeAsset(board);
            if (pause) this.context?.services.assets.releaseRuntimeAsset(pause);
            if (systemPopup) this.context?.services.assets.releaseRuntimeAsset(systemPopup);
            if (resultPopup) this.context?.services.assets.releaseRuntimeAsset(resultPopup);
            if (milestonePopup) this.context?.services.assets.releaseRuntimeAsset(milestonePopup);
            if (targetPopup) this.context?.services.assets.releaseRuntimeAsset(targetPopup);
            if (cyanButton) this.context?.services.assets.releaseRuntimeAsset(cyanButton);
            if (amberButton) this.context?.services.assets.releaseRuntimeAsset(amberButton);
            if (violetButton) this.context?.services.assets.releaseRuntimeAsset(violetButton);
            if (achievementScore) this.context?.services.assets.releaseRuntimeAsset(achievementScore);
            if (resultScore) this.context?.services.assets.releaseRuntimeAsset(resultScore);
            Object.keys(tileFrames).forEach((key) => this.context?.services.assets.releaseRuntimeAsset(tileFrames[key]));
            if (fxFrames) Object.keys(fxFrames).forEach((key) => this.context?.services.assets.releaseRuntimeAsset(fxFrames[key]));
            return;
        }

        this.ownedTitleFrame = title;
        this.ownedBoardFrame = board;
        this.ownedPauseFrame = pause;
        this.ownedRewardedAdIconFrame = await this.loadTextureFrame(GAME_2048_REWARDED_AD_ICON_ASSET_PATH);
        const [hudCyan, hudAmber] = await Promise.all([
            this.loadTextureFrame(GAME_2048_HUD_CARD_ASSET_PATHS.cyan),
            this.loadTextureFrame(GAME_2048_HUD_CARD_ASSET_PATHS.amber),
        ]);
        if (!this.node.isValid) {
            if (hudCyan) this.context?.services.assets.releaseRuntimeAsset(hudCyan);
            if (hudAmber) this.context?.services.assets.releaseRuntimeAsset(hudAmber);
        } else {
            if (hudCyan) this.ownedHudCardFrames.set('cyan', hudCyan);
            if (hudAmber) this.ownedHudCardFrames.set('amber', hudAmber);
        }
        this.ownedSystemPopupFrame = systemPopup;
        this.ownedResultPopupFrame = resultPopup;
        this.ownedMilestonePopupFrame = milestonePopup;
        this.ownedTargetPopupFrame = targetPopup;
        if (cyanButton) this.ownedPopupButtonFrames.set('cyan', cyanButton);
        if (amberButton) this.ownedPopupButtonFrames.set('amber', amberButton);
        if (violetButton) this.ownedPopupButtonFrames.set('violet', violetButton);
        this.ownedAchievementScoreFrame = achievementScore;
        this.ownedResultScoreFrame = resultScore;
        GAME_2048_TILE_VALUES.forEach((value) => {
            const frame = tileFrames[String(value)];
            if (frame) this.ownedTileFrames.set(value, frame);
        });
        if (fxFrames) {
            this.ownedFxFrames = {
                glowSquare: fxFrames.glowSquare,
                echo: fxFrames.echo,
                sparkle: fxFrames.sparkle,
                rays: fxFrames.rays,
                techRing: fxFrames.techRing,
                shockwave: fxFrames.shockwave,
            };
            this.rebuildMergeFx();
        }
        this.applyLoadedThemeAssets();
    }

    private loadTextureFrame(assetPath: string): Promise<SpriteFrame | undefined> {
        const packed = PACKED_SPRITE_PATHS[assetPath];
        return this.context!.services.assets.loadSpriteFrame(
            GAME_2048_RESOURCE_BUNDLE, packed ?? assetPath, packed ? 'frame' : 'texture',
        );
    }

    private applyLoadedThemeAssets(): void {
        this.hudCardArtworks.forEach(({ sprite, graphics, tone }) => {
            if (!sprite.node.isValid) return;
            const frame = this.ownedHudCardFrames.get(tone) ?? null;
            sprite.spriteFrame = frame;
            sprite.node.active = !!frame;
            graphics.enabled = !frame;
        });
        this.actionBarArtworks.forEach(({ sprite, graphics, tone }) => {
            if (!sprite.node.isValid) return;
            const frame = this.ownedPopupButtonFrames.get(tone) ?? null;
            sprite.spriteFrame = frame;
            sprite.node.active = !!frame;
            graphics.enabled = !frame;
        });
        if (this.titleArtwork?.node.isValid) {
            this.titleArtwork.spriteFrame = this.ownedTitleFrame ?? null;
            this.titleArtwork.node.active = !!this.ownedTitleFrame;
        }
        if (this.boardArtwork?.node.isValid) {
            this.boardArtwork.spriteFrame = this.ownedBoardFrame ?? null;
            this.boardArtwork.node.active = !!this.ownedBoardFrame;
        }
        if (this.pauseArtwork?.node.isValid) {
            this.pauseArtwork.spriteFrame = this.ownedPauseFrame ?? null;
            this.pauseArtwork.node.active = !!this.ownedPauseFrame;
        }
        if (this.pauseFallback?.isValid) {
            this.pauseFallback.active = !this.ownedPauseFrame;
        }
    }

    private async loadMusic(): Promise<void> {
        const services = this.context!.services;
        const loadClip = (path: string, enabled: boolean): Promise<AudioClip | undefined> =>
            enabled ? services.assets.loadAudioClip(GAME_2048_RESOURCE_BUNDLE, path) : Promise.resolve(undefined);
        const tiers = [3, 4, 5] as const;
        const [normal, danger, ...tierClips] = await Promise.all([
            loadClip('visual/audio/t48-neon-loop-v1', services.audio.isMusicEnabled).catch((error: unknown) => {
                // TODO: console.warn('[Game2048Game] Normal music failed to load.', error);
                return undefined;
            }),
            loadClip('visual/audio/t48-danger-loop-v1', services.audio.isMusicEnabled).catch((error: unknown) => {
                // TODO: console.warn('[Game2048Game] Danger music failed to load.', error);
                return undefined;
            }),
            ...tiers.map((tier) => loadClip(GAME_2048_HIGH_MERGE_AUDIO[tier], services.audio.isSoundEnabled).catch((error: unknown) => {
                // TODO: console.warn(`[Game2048Game] High-merge tier ${tier} audio failed to load.`, error);
                return undefined;
            })),
        ]);
        if (!this.node.isValid || this.state === 'disposed') return;
        if (normal) {
            this.normalMusicClip = normal;
            this.context?.services.audio.playMusic(normal);
        }
        this.dangerMusicClip = danger;
        const highMergeClips: Partial<Record<HighMergeTier, AudioClip>> = {};
        tiers.forEach((tier, index) => {
            const clip = tierClips[index];
            if (clip) highMergeClips[tier] = clip;
        });
        this.highMergeClips = highMergeClips;
    }

    private buildTileViews(boardSize: number): void {
        const content = this.boardContent;
        if (!content) return;

        this.boardGridSizeValue = boardSize;
        this.boardGapValue = this.boardGap(boardSize);
        this.boardTileSizeValue = (
            boardSize - this.boardGapValue * (BOARD_SIZE + 1)
        ) / BOARD_SIZE;

        for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
            const position = this.tilePosition(
                index,
                this.boardGridSizeValue,
                this.boardGapValue,
                this.boardTileSizeValue,
            );
            const tile = this.createNode(
                content,
                `Tile-${index}`,
                position.x,
                position.y,
                this.boardTileSizeValue,
                this.boardTileSizeValue,
            );
            const opacity = tile.addComponent(UIOpacity);
            const fallbackGraphics = tile.addComponent(Graphics);
            const artworkNode = this.createNode(
                tile,
                'Artwork',
                0,
                0,
                this.boardTileSizeValue / GAME_2048_TILE_BODY_FILL,
                this.boardTileSizeValue / GAME_2048_TILE_BODY_FILL,
            );
            const artwork = artworkNode.addComponent(Sprite);
            artwork.sizeMode = Sprite.SizeMode.CUSTOM;
            const { label: valueLabel, outline: valueOutline } = this.createTileValueLabel(tile, this.boardTileSizeValue);
            tile.active = false;
            this.tileViews.push({
                node: tile,
                homePosition: new Vec3(position.x, position.y, 0),
                artwork,
                fallbackGraphics,
                valueLabel,
                valueOutline,
                opacity,
                value: -1,
            });
        }
    }

    /**
     * 将模型状态提交到固定的 16 个棋子视图。普通移动只更新已有组件，
     * 不在热路径创建或销毁棋子节点。
     */
    private syncBoardViews(result?: Game2048MoveResult, direction?: Game2048Direction): void {
        const content = this.boardContent;
        if (!content || this.tileViews.length !== BOARD_SIZE * BOARD_SIZE) return;

        const board = this.model.board;
        const horizontal = direction === 'left' || direction === 'right';
        for (let index = 0; index < this.tileViews.length; index += 1) {
            const view = this.tileViews[index];
            const value = board[index] ?? 0;

            Tween.stopAllByTarget(view.node);
            Tween.stopAllByTarget(view.opacity);
            view.node.setPosition(view.homePosition);
            view.node.setScale(1, 1, 1);
            view.node.setSiblingIndex(index);
            view.opacity.opacity = 255;

            if (value === 0) {
                view.node.active = false;
                view.value = 0;
                continue;
            }

            view.node.active = true;
            if (view.value !== value) {
                this.applyTileViewValue(view, value, this.boardTileSizeValue);
                view.value = value;
            }

            if (result?.spawned?.index === index) {
                view.node.setScale(0.45, 0.45, 1);
                tween(view.node)
                    .to(0.09, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .start();
            } else if ((result?.mergedIndices.indexOf(index) ?? -1) >= 0) {
                // 落位挤压：沿滑动方向先压扁再回弹，档位越高越有力。
                const tier = mergeFxTier(value);
                const squash = 0.18 + Math.min(0.08, tier * 0.014);
                const along = 1 - squash;
                const across = 1 + squash * 0.55;
                const overshoot = 1.07 + tier * 0.01;
                const settle = 1 - (overshoot - 1) * 0.5;
                view.node.setScale(horizontal ? along : across, horizontal ? across : along, 1);
                tween(view.node)
                    .to(0.05, {
                        scale: new Vec3(horizontal ? overshoot : settle, horizontal ? settle : overshoot, 1),
                    }, { easing: 'quadOut' })
                    .to(0.05, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
                    .start();
            }
        }
    }

    /**
     * 每个合成位置播放一次与目标棋子同色的特效，并在棋子上方飘出 "+N"；
     * 连续递进合成（同一块棋子连续翻倍）达到 ×2 起，在链头棋子上方显示连击。
     */
    private playMergeEffects(result: Game2048MoveResult): void {
        const fx = this.mergeFx;
        const board = this.model.board;
        result.mergedIndices.forEach((index) => {
            const value = board[index] ?? 0;
            if (value <= 0) return;
            const { x, y } = this.tilePosition(index, this.boardGridSizeValue, this.boardGapValue, this.boardTileSizeValue);
            fx?.play(x, y, this.boardTileSizeValue, value, tileMaterial(value));
            this.playFloatText(index, x, y, value);
        });
        const chain = this.mergeChain.current;
        if (chain && chain.count >= 2 && result.mergedIndices.indexOf(chain.index) >= 0) {
            this.playComboBurst(chain.index, chain.count);
        }

        const highest = this.highestMergedValue(result);
        if (highest >= BIG_MERGE_SHAKE_MIN_VALUE) this.shakeBoard(highest >= MILESTONE_TILE ? 8 : 5, 0.04);
        if (highest >= MILESTONE_TILE) this.playScreenFlash(tileMaterial(highest).glow);
    }

    private playScreenFlash(color: Rgb): void {
        const flash = this.screenFlash;
        const frame = this.ownedFxFrames?.glowSquare;
        if (!flash?.node.isValid || !frame) return;
        // Graphics 不受 UIOpacity 控制，闪烁层用柔光方块 Sprite 放大到屏幕外，其不透明的中心铺满整屏。
        flash.spriteFrame = frame;
        flash.color = colorWithAlpha(color, 255);
        const opacity = flash.node.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 0;
        tween(opacity)
            .to(0.12, { opacity: 25 }, { easing: 'quadOut' })
            .to(0.4, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    /** 飘字层位于特效层之上，坐标与棋子一致，随棋盘缩放。尺寸重建时与棋盘一起重建。 */
    private buildFloatTexts(boardGridSize: number): void {
        this.floatTexts.length = 0;
        const board = this.boardNode;
        if (!board) return;
        const layer = this.createNode(board, 'FloatTextLayer', 0, 0, boardGridSize, boardGridSize);
        const tileSize = this.boardTileSizeValue;
        for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
            const label = this.createFloatLabel(layer, `ScoreFloat-${index}`, Math.round(tileSize * 0.27), tileSize * 1.4);
            this.floatTexts.push(label);
        }
        // 连击文字：与 "+N" 区分——斜体、更大、暖色渐进，盖在棋子下沿而不是从上缘飘走。
        const comboLabel = this.createFloatLabel(layer, 'ComboLabel', Math.round(tileSize * 0.25), tileSize * 1.6);
        comboLabel.isItalic = true;
        this.comboLabel = comboLabel;
    }

    private createFloatLabel(parent: Node, name: string, fontSize: number, width: number): Label {
        const label = this.createLabel(parent, name, '', 0, 0, fontSize, COLORS.white, width, fontSize + 16);
        label.overflow = Label.Overflow.NONE;
        setLabelBold(label, true);
        const outline = label.node.addComponent(LabelOutline);
        outline.color = new Color(4, 8, 24, 230);
        outline.width = Math.max(2, Math.round(fontSize * 0.12));
        label.node.addComponent(UIOpacity).opacity = 0;
        return label;
    }

    /** "+N" 从棋子上缘冒出并向上飘，颜色取该档的亮色，玩家视线不必离开棋子。 */
    private playFloatText(index: number, x: number, y: number, value: number): void {
        const label = this.floatTexts[index];
        if (!label?.node.isValid) return;
        const tile = this.boardTileSizeValue;
        const material = tileMaterial(value);
        const node = label.node;
        const opacity = node.getComponent(UIOpacity)!;
        label.string = `+${value}`;
        label.color = new Color(material.facet[0], material.facet[1], material.facet[2], 255);
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);
        node.setPosition(x, y + tile * 0.46);
        node.setScale(0.6, 0.6, 1);
        opacity.opacity = 255;
        tween(node)
            .to(0.12, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(node)
            .to(0.6, { position: new Vec3(x, y + tile * 0.8, 0) }, { easing: 'quadOut' })
            .start();
        tween(opacity)
            .delay(0.32)
            .to(0.28, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    /**
     * 连续递进合成达到 ×2 起，在链头棋子下沿盖出 "连击 ×N"。
     * "+N" 是从棋子上缘往上飘的小号文字；连击是斜体、暖色、从大到小盖章式落在下沿、原地停留后淡出。
     * 总时长约 0.45 秒。
     */
    private playComboBurst(index: number, count: number): void {
        const label = this.comboLabel;
        if (!label?.node.isValid) return;
        const node = label.node;
        const tile = this.boardTileSizeValue;
        const { x, y } = this.tilePosition(index, this.boardGridSizeValue, this.boardGapValue, tile);
        const color = (COMBO_COLOR_TIERS.find((tier) => count >= tier.minCount)
            ?? COMBO_COLOR_TIERS[COMBO_COLOR_TIERS.length - 1]).color;
        label.string = `连击 ×${count}`;
        label.color = new Color(color[0], color[1], color[2], 255);
        // 靠边的棋子把文字往棋盘内侧挪，避免超出棋盘。
        const limit = this.boardGridSizeValue / 2 - tile * 0.6;
        const labelX = Math.max(-limit, Math.min(limit, x));
        const labelY = y - tile * 0.5;
        const opacity = node.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);
        const peak = 1.1 + Math.min(4, count - 2) * 0.03;
        node.setPosition(labelX, labelY);
        node.setScale(1.7, 1.7, 1);
        opacity.opacity = 0;
        tween(node)
            .to(0.1, { scale: new Vec3(peak, peak, 1) }, { easing: 'quadIn' })
            .to(0.06, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
            .start();
        tween(opacity)
            .to(0.08, { opacity: 255 })
            .delay(0.22)
            .to(0.15, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    /** 分数更新时让分数数字轻弹一下，与棋子上方的 "+N" 呼应。 */
    private playScorePunch(gain: number): void {
        if (gain <= 0) return;
        const value = this.scoreLabel?.node;
        if (!value?.isValid) return;
        Tween.stopAllByTarget(value);
        value.setScale(1, 1, 1);
        tween(value)
            .to(0.07, { scale: new Vec3(1.14, 1.14, 1) }, { easing: 'quadOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .start();
    }

    private animateBoardMove(result: Game2048MoveResult): void {
        const content = this.boardContent;
        if (!content || this.tileViews.length !== BOARD_SIZE * BOARD_SIZE) return;

        result.tileMotions.forEach((motion) => {
            const tile = this.tileViews[motion.fromIndex]?.node;
            if (!tile?.isValid || motion.fromIndex === motion.toIndex) return;
            const destination = this.tileViews[motion.toIndex];
            if (!destination) return;
            Tween.stopAllByTarget(tile);
            tile.setSiblingIndex(content.children.length - 1);
            tween(tile)
                .to(
                    TILE_SLIDE_DURATION,
                    { position: destination.homePosition },
                    { easing: 'quadOut' },
                )
                .start();
        });
    }

    private boardGap(boardSize: number): number {
        return Math.max(0.5, boardSize * GAME_2048_BOARD_GAP_RATIO);
    }

    private boardGridSize(boardSize: number): number {
        return boardSize * GAME_2048_BOARD_GRID_RATIO;
    }

    /** 特效层和贴图都就绪后（重新）创建合成特效对象池；尺寸重建会换新层，旧池一并销毁。 */
    private rebuildMergeFx(): void {
        this.mergeFx?.dispose();
        this.mergeFx = undefined;
        const haloLayer = this.mergeHaloLayer;
        const burstLayer = this.mergeBurstLayer;
        if (!this.ownedFxFrames || !haloLayer?.isValid || !burstLayer?.isValid) return;
        this.mergeFx = new Game2048MergeFx(haloLayer, burstLayer, this.ownedFxFrames);
    }

    /** 达成弹窗等处的独立棋子：无字底框 + 数字 Label，与棋盘上的棋子同一套绘制。 */
    private drawTile(tile: Node, value: number, size: number): void {
        const spriteFrame = this.ownedTileFrames.get(Math.min(value, GAME_2048_MAX_FRAMED_TILE));
        if (spriteFrame) {
            const artworkSize = size / GAME_2048_TILE_BODY_FILL;
            const artwork = this.createNode(tile, 'Artwork', 0, 0, artworkSize, artworkSize);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = spriteFrame;
        } else {
            this.drawFallbackTile(tile.addComponent(Graphics), value, size);
        }
        const { label, outline } = this.createTileValueLabel(tile, size);
        this.styleTileValueLabel(label, outline, value, size);
    }

    private applyTileViewValue(view: Game2048TileView, value: number, size: number): void {
        const spriteFrame = this.ownedTileFrames.get(Math.min(value, GAME_2048_MAX_FRAMED_TILE));
        view.fallbackGraphics.clear();
        if (spriteFrame) {
            if (view.artwork.spriteFrame !== spriteFrame) view.artwork.spriteFrame = spriteFrame;
            view.artwork.node.active = true;
        } else {
            view.artwork.spriteFrame = null;
            view.artwork.node.active = false;
            this.drawFallbackTile(view.fallbackGraphics, value, size);
        }
        this.styleTileValueLabel(view.valueLabel, view.valueOutline, value, size);
    }

    private createTileValueLabel(tile: Node, size: number): { label: Label; outline: LabelOutline } {
        const label = this.createLabel(tile, 'Value', '', 0, size * 0.015, 59, COLORS.white, size - 16, size - 16);
        setLabelBold(label, true);
        const outline = label.node.addComponent(LabelOutline);
        return { label, outline };
    }

    /**
     * 数字字号随位数缩小；颜色由内核色向高光色混合并整体降亮，避免近白粗体在暗底上产生眩光，
     * 描边取暗部色，保证在发光底框上清晰。
     */
    private styleTileValueLabel(label: Label, outline: LabelOutline, value: number, size: number): void {
        const material = tileMaterial(value);
        const digits = String(value).length;
        const ratio = digits <= 2 ? 0.44 : digits === 3 ? 0.38 : digits === 4 ? 0.31 : digits === 5 ? 0.26 : 0.22;
        const fontSize = Math.round(size * ratio);
        label.string = String(value);
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        const channel = (index: 0 | 1 | 2) => Math.round(
            (material.core[index] + (material.facet[index] - material.core[index]) * TILE_VALUE_FACET_MIX) * TILE_VALUE_BRIGHTNESS,
        );
        label.color = new Color(channel(0), channel(1), channel(2), 255);
        outline.color = new Color(
            Math.round(material.surface[0] * 0.55),
            Math.round(material.surface[1] * 0.55),
            Math.round(material.surface[2] * 0.55),
            235,
        );
        outline.width = Math.max(2, Math.round(size * 0.022));
    }

    /** 底框贴图缺失时的兜底底板，颜色同样取自 TILE_PALETTE。 */
    private drawFallbackTile(graphics: Graphics, value: number, size: number): void {
        graphics.clear();
        const material = tileMaterial(value);
        const rgb = material.glow;
        graphics.fillColor = colorWithAlpha(rgb, 36);
        graphics.roundRect(-size / 2 - 6, -size / 2 - 6, size + 12, size + 12, 26);
        graphics.fill();
        graphics.fillColor = colorWithAlpha(material.surface, 240);
        graphics.strokeColor = colorWithAlpha(rgb, 235);
        graphics.lineWidth = value >= MILESTONE_TILE ? 3 : 2;
        graphics.roundRect(-size / 2, -size / 2, size, size, 20);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = colorWithAlpha(material.facet, 70);
        graphics.lineWidth = 1;
        graphics.roundRect(-size / 2 + 6, -size / 2 + 6, size - 12, size - 12, 15);
        graphics.stroke();
    }

    private updateDangerState(gameOver = false): void {
        const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
        const shouldEnter = !gameOver && this.state === 'playing' && emptyCount <= 2;
        this.setDangerMode(shouldEnter, true, emptyCount);
    }

    private setDangerMode(enabled: boolean, restoreMusic: boolean, emptyCount = 0): void {
        if (enabled === this.dangerMode) {
            if (enabled) this.updateDangerHint(emptyCount);
            return;
        }
        this.dangerMode = enabled;
        if (enabled) {
            this.createDangerLayer(emptyCount);
            if (this.dangerMusicClip) this.context?.services.audio.transitionMusic(this.dangerMusicClip, GAME_2048_MUSIC_TRANSITION);
            return;
        }
        this.destroyDangerLayer();
        this.updateDangerHint();
        if (restoreMusic && this.normalMusicClip) this.context?.services.audio.transitionMusic(this.normalMusicClip, GAME_2048_MUSIC_TRANSITION);
    }

    private createDangerLayer(emptyCount: number): void {
        this.destroyDangerLayer();
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const root = this.createNode(this.node, 'CriticalSpaceEffect', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        this.dangerLayer = root;
        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 100;
        const graphics = root.addComponent(Graphics);
        [18, 10, 4].forEach((lineWidth, index) => {
            graphics.strokeColor = new Color(255, index === 2 ? 65 : 26, index === 0 ? 128 : 218, 38 + index * 35);
            graphics.lineWidth = lineWidth;
            const inset = 10 + index * 7;
            graphics.roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, 34);
            graphics.stroke();
        });
        graphics.fillColor = new Color(255, 28, 112, 28);
        graphics.rect(-width / 2, height / 2 - 82, width, 82);
        graphics.rect(-width / 2, -height / 2, width, 82);
        graphics.fill();
        const cornerLength = 92;
        graphics.strokeColor = new Color(255, 83, 177, 210);
        graphics.lineWidth = 4;
        [-1, 1].forEach((horizontal) => [-1, 1].forEach((vertical) => {
            const x = horizontal * (width / 2 - 35);
            const y = vertical * (height / 2 - 35);
            graphics.moveTo(x, y - vertical * cornerLength);
            graphics.lineTo(x, y);
            graphics.lineTo(x - horizontal * cornerLength, y);
        }));
        graphics.stroke();

        const scan = this.createNode(root, 'CriticalScanLine', 0, height / 2 - 130, width - 42, 6);
        const scanGraphics = scan.addComponent(Graphics);
        scanGraphics.fillColor = new Color(255, 46, 143, 62);
        scanGraphics.rect(-(width - 42) / 2, -3, width - 42, 6);
        scanGraphics.fill();
        tween(scan)
            .repeatForever(
                tween()
                    .to(2.5, { position: new Vec3(0, -height / 2 + 130, 0) }, { easing: 'quadIn' })
                    .call(() => scan.setPosition(0, height / 2 - 130)),
            )
            .start();
        // 危险态可能持续很久：用约 2.4 秒一次的缓慢呼吸代替急促闪烁，降低长时间注视的疲劳。
        tween(opacity)
            .repeatForever(
                tween()
                    .to(1.2, { opacity: 150 }, { easing: 'sineInOut' })
                    .to(1.2, { opacity: 100 }, { easing: 'sineInOut' }),
            )
            .start();
        this.updateDangerHint(emptyCount);
    }

    private destroyDangerLayer(): void {
        if (!this.dangerLayer) return;
        const opacity = this.dangerLayer.getComponent(UIOpacity);
        const scan = this.dangerLayer.getChildByName('CriticalScanLine');
        Tween.stopAllByTarget(this.dangerLayer);
        if (opacity) Tween.stopAllByTarget(opacity);
        if (scan) Tween.stopAllByTarget(scan);
        if (this.dangerLayer.isValid) this.destroyNodeWithTweens(this.dangerLayer);
        this.dangerLayer = undefined;
    }

    private updateDangerHint(emptyCount?: number): void {
        const hint = this.node.getChildByName('Hint')?.getComponent(Label);
        if (!hint) return;
        if (emptyCount !== undefined && emptyCount <= 2) {
            hint.string = `空位不足 · 仅剩 ${emptyCount} 格`;
            hint.color = new Color(255, 126, 184, 255);
            setLabelBold(hint, true);
        } else {
            hint.string = '';
            hint.color = COLORS.muted;
            setLabelBold(hint, false);
        }
    }

    private refreshHud(): void {
        this.context?.reportAchievementProgress('highest-tile', this.model.highestTile);
        if (this.scoreLabel) this.scoreLabel.string = String(this.model.score);
        if (this.bestLabel) this.bestLabel.string = String(Math.max(this.bestScore, this.model.score));
        this.refreshUndoButton();
    }

    /** 底部操作栏：居中的撤销按钮。 */
    private buildActionBar(metrics: Game2048LayoutMetrics): void {
        this.actionBarArtworks.length = 0;
        const width = GAME_2048_ACTION_BAR_ITEM_WIDTH;
        const height = GAME_2048_ACTION_BAR_ITEM_HEIGHT;
        const undo = this.createActionBarItem('UndoButton', metrics.undoButtonX, metrics.actionBarY, 'cyan', metrics.fitScale);
        const button = undo.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.94;
        button.duration = 0.08;
        button.node.on(Button.EventType.CLICK, this.handleUndo, this);
        this.undoButton = button;
        this.undoLabel = this.createLabel(undo, 'Label', '', 0, 0, 26, COLORS.white, width - 32, height - 12);
        setLabelBold(this.undoLabel, true);
        this.refreshUndoButton();
    }

    private createActionBarItem(name: string, x: number, y: number, tone: OverlayAction['tone'], scale: number): Node {
        const width = GAME_2048_ACTION_BAR_ITEM_WIDTH;
        const height = GAME_2048_ACTION_BAR_ITEM_HEIGHT;
        const node = this.createNode(this.node, name, x, y, width, height);
        node.setScale(scale, scale, 1);
        node.addComponent(UIOpacity);
        const accent = tone === 'cyan' ? COLORS.cyan : COLORS.violet;
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = new Color(COLORS.panel.r, COLORS.panel.g, COLORS.panel.b, 235);
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 200);
        graphics.lineWidth = 2;
        this.drawChamferedRectPath(graphics, -width / 2, -height / 2, width, height, 12);
        graphics.fill();
        graphics.stroke();
        const artworkNode = this.createNode(node, 'Artwork', 0, 0, width, height);
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artworkNode.active = false;
        this.actionBarArtworks.push({ sprite: artwork, graphics, tone });
        return node;
    }

    private refreshUndoButton(): void {
        const button = this.undoButton;
        if (!button?.node.isValid) return;
        const remaining = Math.max(0, GAME_2048_UNDO_LIMIT - this.undosUsed);
        // 全局字体不含箭头等符号，文案只用汉字和数字。
        if (this.undoLabel) this.undoLabel.string = `撤销 · 剩 ${remaining} 次`;
        const usable = this.state === 'playing' && remaining > 0 && this.undoHistory.length > 0;
        button.interactable = usable;
        const opacity = button.node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = usable ? 255 : 110;
    }

    /** 撤销上一步：恢复移动前的棋盘与分数；动画进行中、结算或弹窗期间不可用。 */
    private readonly handleUndo = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        if (this.undosUsed >= GAME_2048_UNDO_LIMIT) return;
        const snapshot = this.undoHistory.pop();
        if (!snapshot) return;
        this.context?.services.feedback.play('uiButton');
        this.undosUsed += 1;
        this.operationGeneration += 1;
        this.queuedDirection = undefined;
        this.mergeChain.reset();
        this.mergeFx?.clear();
        this.model.restore(snapshot);
        this.syncBoardViews();
        // 回退时棋子轻轻收缩再展开，提示局面被还原。
        this.tileViews.forEach((view) => {
            if (!view.node.active) return;
            view.node.setScale(0.9, 0.9, 1);
            tween(view.node).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        });
        this.context?.reportScore(this.model.score);
        this.refreshHud();
        this.persistProgress(true);
        this.updateDangerState();
    };

    private dismissResultOverlay(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        // 查看最终棋盘时恢复正常显示，清除死局动画留下的棋子变暗效果。
        this.syncBoardViews();
    }

    private createHudCard(x: number, y: number, caption: string, tone: 'cyan' | 'amber', scale = 1): Label {
        const accent = tone === 'cyan' ? COLORS.cyan : COLORS.amber;
        const card = this.createNode(
            this.node,
            `${caption}Card`,
            x,
            y,
            GAME_2048_SCORE_CARD_WIDTH,
            GAME_2048_SCORE_CARD_HEIGHT,
        );
        card.setScale(scale, scale, 1);
        const graphics = card.addComponent(Graphics);
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 14);
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2 - 5,
            -GAME_2048_SCORE_CARD_HEIGHT / 2 - 6,
            GAME_2048_SCORE_CARD_WIDTH + 10,
            GAME_2048_SCORE_CARD_HEIGHT + 10,
            24,
        );
        graphics.fill();
        graphics.fillColor = COLORS.panelLight;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 155);
        graphics.lineWidth = 2;
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2,
            -GAME_2048_SCORE_CARD_HEIGHT / 2,
            GAME_2048_SCORE_CARD_WIDTH,
            GAME_2048_SCORE_CARD_HEIGHT,
            20,
        );
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 48);
        graphics.lineWidth = 1;
        graphics.roundRect(
            -GAME_2048_SCORE_CARD_WIDTH / 2 + 6,
            -GAME_2048_SCORE_CARD_HEIGHT / 2 + 6,
            GAME_2048_SCORE_CARD_WIDTH - 12,
            GAME_2048_SCORE_CARD_HEIGHT - 12,
            16,
        );
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 100);
        graphics.moveTo(-62, 45);
        graphics.lineTo(62, 45);
        graphics.stroke();
        // 生图霓虹卡片加载后替换代码绘制的兜底边框；贴图带外发光，按 1.12 倍绘制。
        const artworkNode = this.createNode(
            card, 'CardArtwork', 0, 0, GAME_2048_SCORE_CARD_WIDTH * 1.12, GAME_2048_SCORE_CARD_HEIGHT * 1.12,
        );
        artworkNode.setSiblingIndex(0);
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artworkNode.active = false;
        this.hudCardArtworks.push({ sprite: artwork, graphics, tone });
        // 标题落在卡片上沿标题槽下方，与边框留出呼吸空间；数字居于卡片下半部。
        this.createLabel(card, 'Caption', caption, 0, 19, 21, accent, 180, 28).spacingX = 2;
        const value = this.createLabel(card, 'Value', '0', 0, -17, 40, COLORS.white, 188, 50);
        setLabelBold(value, true);
        return value;
    }

    /** 2048、4096 里程碑与终极目标 8192 共用同一套庆祝层，而不是通用系统弹窗。 */
    private buildTargetOverlay(
        actions: readonly OverlayAction[],
        tile: AchievementTile,
    ): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, 'Game2048TargetOverlay', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);

        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(2, 5, 14, 232);
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        // 达成弹窗恢复原型的纵向节奏；矮屏或窄屏时整体等比缩小。
        // 不再使用“最小高度”顶回可用安全区，从根源上避免上下溢出。
        const panelWidth = 600;
        const panelHeight = panelWidth * GAME_2048_TARGET_POPUP_ASPECT_RATIO;
        const availableWidth = Math.max(1, layout.contentWidth - 32);
        const availableHeight = Math.max(1, height - layout.safeTop - layout.safeBottom - 48);
        const panelScale = Math.min(1, availableWidth / panelWidth, availableHeight / panelHeight);
        const panel = this.createNode(
            root,
            'AchievementPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        const targetMaterial = tileMaterial(tile);
        // 2048 用金色圆环底框；4096 与终极目标 8192 用紫粉圆环底框（与两者的棋子同色系）。
        const popupFrame = tile > MILESTONE_TILE
            ? this.ownedTargetPopupFrame
            : this.ownedMilestonePopupFrame;
        this.createPopupArtwork(panel, 'AchievementPanelArtwork', popupFrame, panelWidth, panelHeight);

        // 2048 与终极目标复用同一套庆祝构图，只根据目标数字切换材质和文案。
        graphics.fillColor = colorWithAlpha(targetMaterial.glow, 18);
        graphics.roundRect(-panelWidth / 2 - 14, -panelHeight / 2 - 14, panelWidth + 28, panelHeight + 28, 44);
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 62);
        graphics.lineWidth = 14;
        graphics.roundRect(-panelWidth / 2 - 7, -panelHeight / 2 - 7, panelWidth + 14, panelHeight + 14, 38);
        graphics.stroke();
        graphics.fillColor = new Color(14, 25, 48, 250);
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 232);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 32);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = colorWithAlpha(targetMaterial.accent, 92);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 25);
        graphics.stroke();
        graphics.enabled = !popupFrame;

        const crest = this.createNode(panel, `Target${tile}Crest`, 0, panelHeight / 2 - 8, 82, 82);
        const crestGraphics = crest.addComponent(Graphics);
        crestGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 255);
        crestGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 245);
        crestGraphics.lineWidth = 4;
        crestGraphics.moveTo(0, 38);
        crestGraphics.lineTo(38, 0);
        crestGraphics.lineTo(0, -38);
        crestGraphics.lineTo(-38, 0);
        crestGraphics.close();
        crestGraphics.fill();
        crestGraphics.stroke();
        crestGraphics.strokeColor = colorWithAlpha(targetMaterial.accent, 175);
        crestGraphics.lineWidth = 2;
        crestGraphics.moveTo(0, 27);
        crestGraphics.lineTo(27, 0);
        crestGraphics.lineTo(0, -27);
        crestGraphics.lineTo(-27, 0);
        crestGraphics.close();
        crestGraphics.stroke();
        crestGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 235);
        crestGraphics.rect(-10, -10, 8, 8);
        crestGraphics.fillColor = colorWithAlpha(targetMaterial.accent, 235);
        crestGraphics.rect(2, -10, 8, 8);
        crestGraphics.fillColor = COLORS.cyan;
        crestGraphics.rect(-10, 2, 8, 8);
        crestGraphics.fillColor = COLORS.violet;
        crestGraphics.rect(2, 2, 8, 8);
        crestGraphics.fill();
        crest.active = !popupFrame;

        const halo = this.createNode(panel, `Target${tile}Halo`, 0, 135, 312, 246);
        const haloGraphics = halo.addComponent(Graphics);
        [116, 99, 82, 66].forEach((radius, index) => {
            haloGraphics.strokeColor = colorWithAlpha(
                index % 2 === 0 ? targetMaterial.glow : targetMaterial.accent,
                52 + index * 18,
            );
            haloGraphics.lineWidth = 3 + index * 0.7;
            haloGraphics.circle(0, 0, radius);
            haloGraphics.stroke();
        });
        haloGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 176);
        haloGraphics.lineWidth = 2;
        for (let index = 0; index < 12; index += 1) {
            const angle = (Math.PI * 2 * index) / 12;
            haloGraphics.moveTo(Math.cos(angle) * 91, Math.sin(angle) * 91);
            haloGraphics.lineTo(Math.cos(angle) * 124, Math.sin(angle) * 124);
        }
        haloGraphics.stroke();
        halo.active = !popupFrame;
        halo.setScale(0.78, 0.78, 1);
        tween(halo)
            .repeatForever(
                tween()
                    .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                    .to(0.8, { scale: new Vec3(0.86, 0.86, 1) }, { easing: 'sineInOut' }),
            )
            .start();

        const crystalCore = this.createNode(panel, `Target${tile}CrystalCore`, 0, 135, 156, 156);
        const crystalOpacity = crystalCore.addComponent(UIOpacity);
        crystalOpacity.opacity = 210;
        const crystalGraphics = crystalCore.addComponent(Graphics);
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.core, 84);
        crystalGraphics.moveTo(0, -57);
        crystalGraphics.lineTo(57, 0);
        crystalGraphics.lineTo(0, 57);
        crystalGraphics.lineTo(-57, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        crystalCore.active = !popupFrame;
        crystalGraphics.strokeColor = colorWithAlpha(targetMaterial.accent, 210);
        crystalGraphics.lineWidth = 3;
        crystalGraphics.stroke();
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 112);
        crystalGraphics.moveTo(0, -40);
        crystalGraphics.lineTo(40, 0);
        crystalGraphics.lineTo(0, 40);
        crystalGraphics.lineTo(-40, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        tween(crystalCore)
            .repeatForever(
                tween()
                    .to(0.52, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .to(0.52, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        tween(crystalOpacity)
            .repeatForever(
                tween()
                    .to(0.52, { opacity: 255 }, { easing: 'sineInOut' })
                    .to(0.52, { opacity: 168 }, { easing: 'sineInOut' }),
            )
            .start();

        const burst = this.createNode(panel, 'AchievementBurst', 0, 135, 276, 216);
        const burstGraphics = burst.addComponent(Graphics);
        for (let index = 0; index < 20; index += 1) {
            const angle = (Math.PI * 2 * index) / 20;
            const inner = index % 2 === 0 ? 72 : 80;
            const outer = index % 2 === 0 ? 102 : 94;
            burstGraphics.strokeColor = index % 3 === 0
                ? colorWithAlpha(targetMaterial.accent, 112)
                : colorWithAlpha(targetMaterial.facet, 138);
            burstGraphics.lineWidth = index % 2 === 0 ? 3 : 2;
            burstGraphics.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            burstGraphics.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            burstGraphics.stroke();
        }
        burstGraphics.strokeColor = colorWithAlpha(targetMaterial.glow, 92);
        burstGraphics.lineWidth = 2;
        burstGraphics.circle(0, 0, 88);
        burstGraphics.stroke();
        burst.active = !popupFrame;

        const badgeSize = 190;
        // 两种达成态使用独立下移量：2048 文案较短，需要更明显的顶部留白；
        // 终极目标标题较长，只做较小幅度下移。按钮仍由底部基线统一定位。
        const achievementContentOffsetY = tile === TARGET_TILE ? -18 : -32;
        const achievementTitleY = panelHeight / 2 - 132 + achievementContentOffsetY;
        const badgeCenterY = achievementTitleY - 135;
        const badge = this.createNode(panel, `Unlocked${tile}Tile`, 0, badgeCenterY, badgeSize, badgeSize);
        this.drawTile(badge, tile, badgeSize);

        const sparkColors = [
            colorWithAlpha(targetMaterial.facet, 255),
            colorWithAlpha(targetMaterial.accent, 255),
            colorWithAlpha(targetMaterial.glow, 255),
        ] as const;
        const sparkPositions = [
            [-144, 201], [-122, 111], [136, 204], [151, 119], [-172, 156], [177, 166],
        ] as const;
        sparkPositions.forEach(([x, y], index) => {
            const spark = this.createNode(panel, `CelebrationSpark-${index}`, x, y, 16, 16);
            const opacity = spark.addComponent(UIOpacity);
            const sparkGraphics = spark.addComponent(Graphics);
            const color = sparkColors[index % sparkColors.length];
            sparkGraphics.fillColor = new Color(color.r, color.g, color.b, 230);
            if (index % 2 === 0) {
                sparkGraphics.moveTo(0, 8);
                sparkGraphics.lineTo(3, 3);
                sparkGraphics.lineTo(8, 0);
                sparkGraphics.lineTo(3, -3);
                sparkGraphics.lineTo(0, -8);
                sparkGraphics.lineTo(-3, -3);
                sparkGraphics.lineTo(-8, 0);
                sparkGraphics.lineTo(-3, 3);
                sparkGraphics.close();
                sparkGraphics.fill();
            } else {
                sparkGraphics.circle(0, 0, 4);
                sparkGraphics.fill();
            }
            spark.active = !popupFrame;
            spark.setScale(0.35, 0.35, 1);
            tween(spark)
                .delay(0.08 + index * 0.035)
                .to(0.28, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
                .to(0.18, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'sineInOut' })
                .start();
            tween(opacity)
                .repeatForever(
                    tween()
                        .to(0.62 + index * 0.04, { opacity: 115 }, { easing: 'sineInOut' })
                        .to(0.62 + index * 0.04, { opacity: 255 }, { easing: 'sineInOut' }),
                )
                .start();
        });

        const achievementTitle = tile === TARGET_TILE ? '终极目标达成' : '恭喜你达成';
        const title = this.createLabel(
            panel,
            'Title',
            achievementTitle,
            0,
            achievementTitleY,
            tile === TARGET_TILE ? 46 : 50,
            colorWithAlpha(targetMaterial.facet, 255),
            panelWidth - 112,
            62,
        );
        setLabelBold(title, true);
        const achievementTitleOutline = title.node.addComponent(LabelOutline);
        achievementTitleOutline.color = colorWithAlpha(targetMaterial.glow, 142);
        achievementTitleOutline.width = 3;
        const scoreChipWidth = 450;
        const scoreChipHeight = 78;
        const scoreChip = this.createNode(
            panel,
            'AchievementScore',
            0,
            badgeCenterY - 170,
            scoreChipWidth,
            scoreChipHeight,
        );
        const scoreGraphics = scoreChip.addComponent(Graphics);
        scoreGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 16);
        scoreGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 104);
        scoreGraphics.lineWidth = 1.5;
        scoreGraphics.roundRect(-scoreChipWidth / 2, -scoreChipHeight / 2, scoreChipWidth, scoreChipHeight, 13);
        scoreGraphics.fill();
        scoreGraphics.stroke();
        const scoreArtwork = this.createPopupArtwork(
            scoreChip,
            'AchievementScoreArtwork',
            this.ownedAchievementScoreFrame,
            scoreChipWidth,
            scoreChipHeight,
        );
        scoreGraphics.enabled = !scoreArtwork;
        const scoreCaption = this.createLabel(
            scoreChip, 'ScoreCaption', '本局得分', -98, 0, 26, COLORS.muted, 188, 46,
        );
        setLabelBold(scoreCaption, true);
        const scoreValue = this.createLabel(
            scoreChip, 'ScoreValue', `${this.model.score}`, 115, 0, 30, COLORS.white, 205, 46,
        );
        setLabelBold(scoreValue, true);

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildTargetOverlay(actions, tile),
            busy: false,
        };
        const buttonWidth = Math.min(460, panelWidth - 120);
        const buttonHeight = 86;
        const buttonGap = 90;
        const lastButtonCenterY = -panelHeight / 2
            + GAME_2048_POPUP_BUTTON_BOTTOM_PADDING
            + buttonHeight / 2;
        const buttonStartY = lastButtonCenterY + (actions.length - 1) * buttonGap;
        actions.forEach((action, index) => {
            const button = this.createOverlayButton(
                panel, action.name, action.label, 0, buttonStartY - index * buttonGap,
                buttonWidth, buttonHeight, action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });

        if (!popupFrame) {
            burst.setScale(0.55, 0.55, 1);
            tween(burst).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        }
        panel.setScale(panelScale * 0.82, panelScale * 0.76, 1);
        tween(panel).to(0.28, { scale: new Vec3(panelScale, panelScale, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private buildOverlay(
        name: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
        resultContent?: ResultOverlayContent,
    ): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, name, 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = COLORS.overlay;
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        const panelWidth = resultContent ? 580 : 570;
        const panelHeight = panelWidth * (resultContent
            ? GAME_2048_RESULT_POPUP_ASPECT_RATIO
            : GAME_2048_SYSTEM_POPUP_ASPECT_RATIO);
        const availableWidth = Math.max(1, layout.contentWidth - 40);
        const availableHeight = Math.max(1, height - layout.safeTop - layout.safeBottom - 40);
        const panelScale = Math.min(1, availableWidth / panelWidth, availableHeight / panelHeight);
        const panel = this.createNode(
            root,
            'NeonPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        const popupFrame = resultContent ? this.ownedResultPopupFrame : this.ownedSystemPopupFrame;
        this.createPopupArtwork(panel, 'PopupPanelArtwork', popupFrame, panelWidth, panelHeight);
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 28);
        graphics.lineWidth = 16;
        graphics.roundRect(-panelWidth / 2 - 8, -panelHeight / 2 - 8, panelWidth + 16, panelHeight + 16, 38);
        graphics.stroke();
        graphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 16);
        graphics.roundRect(-panelWidth / 2 - 10, -panelHeight / 2 - 10, panelWidth + 20, panelHeight + 20, 34);
        graphics.fill();
        graphics.fillColor = COLORS.panel;
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 188);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 30);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 62);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 24);
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 112);
        graphics.moveTo(-72, panelHeight / 2 - 78);
        graphics.lineTo(72, panelHeight / 2 - 78);
        graphics.stroke();
        graphics.enabled = !popupFrame;

        // 原型顶部的悬浮菱形状态核，结算态切换为金色，暂停/开发层保持青紫。
        const crestAccent = resultContent ? COLORS.amber : COLORS.cyan;
        const crest = this.createNode(panel, 'OverlayCrest', 0, panelHeight / 2 - 8, 84, 84);
        const crestGraphics = crest.addComponent(Graphics);
        crestGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 255);
        crestGraphics.strokeColor = new Color(crestAccent.r, crestAccent.g, crestAccent.b, 245);
        crestGraphics.lineWidth = 4;
        crestGraphics.moveTo(0, 38);
        crestGraphics.lineTo(38, 0);
        crestGraphics.lineTo(0, -38);
        crestGraphics.lineTo(-38, 0);
        crestGraphics.close();
        crestGraphics.fill();
        crestGraphics.stroke();
        crestGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 210);
        crestGraphics.lineWidth = 2;
        crestGraphics.moveTo(0, 27);
        crestGraphics.lineTo(27, 0);
        crestGraphics.lineTo(0, -27);
        crestGraphics.lineTo(-27, 0);
        crestGraphics.close();
        crestGraphics.stroke();
        crestGraphics.fillColor = new Color(crestAccent.r, crestAccent.g, crestAccent.b, 230);
        crestGraphics.rect(-10, -10, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 230);
        crestGraphics.rect(2, -10, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 230);
        crestGraphics.rect(-10, 2, 8, 8);
        crestGraphics.fillColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 230);
        crestGraphics.rect(2, 2, 8, 8);
        crestGraphics.fill();
        crest.active = !popupFrame;

        const contentTop = panelHeight / 2 - (resultContent ? 160 : 150);
        const titleLabel = this.createLabel(
            panel,
            'Title',
            title,
            0,
            contentTop - 15,
            resultContent ? 60 : 56,
            COLORS.white,
            panelWidth - 112,
            70,
        );
        setLabelBold(titleLabel, true);
        const titleOutline = titleLabel.node.addComponent(LabelOutline);
        titleOutline.color = resultContent
            ? new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 138)
            : new Color(77, 171, 255, 168);
        titleOutline.width = resultContent ? 4 : 3;
        if (resultContent) {
            // 结算内容自上而下按各自高度排布，避免文案或元素变化时互相重叠。
            let cursor = contentTop - 15 - 35;
            const place = (height: number, spacing = 10): number => {
                const center = cursor - spacing - height / 2;
                cursor = center - height / 2;
                return center;
            };
            const scoreCaption = this.createLabel(panel, 'ScoreCaption', '最终分数', 0, place(38), 26,
                COLORS.cyan, panelWidth - 128, 38);
            setLabelBold(scoreCaption, true);
            const scoreChipWidth = 430;
            const scoreChipHeight = 110;
            const scoreChip = this.createNode(panel, 'ResultScoreChip', 0, place(scoreChipHeight), scoreChipWidth, scoreChipHeight);
            const scoreGraphics = scoreChip.addComponent(Graphics);
            scoreGraphics.fillColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 22);
            scoreGraphics.strokeColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 220);
            scoreGraphics.lineWidth = 2;
            scoreGraphics.roundRect(-scoreChipWidth / 2, -scoreChipHeight / 2, scoreChipWidth, scoreChipHeight, 17);
            scoreGraphics.fill();
            scoreGraphics.stroke();
            const scoreArtwork = this.createPopupArtwork(
                scoreChip,
                'ResultScoreArtwork',
                this.ownedResultScoreFrame,
                scoreChipWidth,
                scoreChipHeight,
            );
            scoreGraphics.enabled = !scoreArtwork;
            const scoreLabel = this.createLabel(scoreChip, 'Score', `${resultContent.score}`, 0, 0, 54,
                COLORS.amber, scoreChipWidth - 54, 70);
            setLabelBold(scoreLabel, true);

            const gap = resultContent.score - resultContent.previousBest;
            const recordText = gap > 0
                ? (resultContent.previousBest > 0 ? `刷新纪录，比原纪录多 ${gap} 分` : '首次记录，继续挑战更高分')
                : gap === 0 ? '追平最高分' : `距最高分还差 ${-gap} 分`;
            const recordLabel = this.createLabel(panel, 'RecordLine', recordText, 0, place(36, 8), 24,
                gap > 0 ? COLORS.amber : COLORS.muted, panelWidth - 128, 36);
            setLabelBold(recordLabel, gap > 0);

            // 本局最大数字用真实棋子徽章展示，而不是一行文字。
            const highestRowY = place(72, 10);
            const highestCaption = this.createLabel(panel, 'HighestCaption', '本局最大', -52, highestRowY, 25,
                COLORS.muted, 140, 40);
            setLabelBold(highestCaption, true);
            const badge = this.createNode(panel, 'HighestTileBadge', 62, highestRowY, 72, 72);
            this.drawTile(badge, resultContent.highestTile, 72);
        } else {
            const [scoreLine = body, descriptionLine = ''] = body.split('\n');
            const scoreLineLabel = this.createLabel(
                panel, 'ScoreLine', scoreLine, 0, contentTop - 106, 30,
                new Color(112, 202, 255, 255), panelWidth - 132, 42,
            );
            setLabelBold(scoreLineLabel, true);
            this.createLabel(
                panel, 'DescriptionLine', descriptionLine, 0, contentTop - 156, 25,
                COLORS.muted, panelWidth - 132, 40,
            );
        }

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildOverlay(name, title, body, actions, resultContent),
            busy: false,
        };
        // 按钮从底部向上按各自高度堆叠：文字链接更矮、离底边更近。
        const buttonWidth = Math.min(460, panelWidth - 120);
        const heightOf = (action: OverlayAction) => action.tone === 'link' ? 48 : 86;
        const buttonSpacing = resultContent ? 4 : 12;
        // 弹窗底框下沿有装饰边，文字链接也要与之保持和按钮相近的留白。
        let bottom = -panelHeight / 2 + (actions[actions.length - 1]?.tone === 'link' ? 64 : GAME_2048_POPUP_BUTTON_BOTTOM_PADDING);
        const centers = new Array<number>(actions.length);
        for (let index = actions.length - 1; index >= 0; index -= 1) {
            const height = heightOf(actions[index]);
            centers[index] = bottom + height / 2;
            bottom += height + buttonSpacing;
        }
        actions.forEach((action, index) => {
            const button = this.createOverlayButton(
                panel,
                action.name,
                action.label,
                0,
                centers[index],
                action.tone === 'link' ? 300 : buttonWidth,
                heightOf(action),
                action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });
        panel.setScale(panelScale * 0.86, panelScale * 0.78, 1);
        tween(panel).to(0.22, { scale: new Vec3(panelScale, panelScale, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 140;
        });
        try {
            await action.action();
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
            }
        } catch (error: unknown) {
            // TODO: console.error(`[Game2048Game] ${action.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
            }
        }
    }

    private createPauseButton(parent: Node, name: string, x: number, y: number): Button {
        const node = this.createNode(
            parent,
            name,
            x,
            y,
            GAME_2048_PAUSE_TOUCH_SIZE,
            GAME_2048_PAUSE_TOUCH_SIZE,
        );
        node.addComponent(UIOpacity);

        // 资源加载失败时保留一个无文字的暂停符号，保证入口仍然可见可用。
        const fallback = this.createNode(
            node,
            'PauseFallback',
            0,
            0,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
        );
        const fallbackGraphics = fallback.addComponent(Graphics);
        fallbackGraphics.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 245);
        fallbackGraphics.roundRect(
            -GAME_2048_PAUSE_ICON_SIZE / 2,
            -GAME_2048_PAUSE_ICON_SIZE / 2,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
            11,
        );
        fallbackGraphics.fill();
        fallbackGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 210);
        fallbackGraphics.lineWidth = 2;
        fallbackGraphics.roundRect(
            -GAME_2048_PAUSE_ICON_SIZE / 2 + 1,
            -GAME_2048_PAUSE_ICON_SIZE / 2 + 1,
            GAME_2048_PAUSE_ICON_SIZE - 2,
            GAME_2048_PAUSE_ICON_SIZE - 2,
            10,
        );
        fallbackGraphics.stroke();
        fallbackGraphics.fillColor = COLORS.cyan;
        fallbackGraphics.roundRect(-11, -18, 6, 36, 3);
        fallbackGraphics.roundRect(5, -18, 6, 36, 3);
        fallbackGraphics.fill();

        const artworkNode = this.createNode(
            node,
            'PauseArtwork',
            0,
            0,
            GAME_2048_PAUSE_ICON_SIZE,
            GAME_2048_PAUSE_ICON_SIZE,
        );
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artworkNode.active = false;
        this.pauseFallback = fallback;
        this.pauseArtwork = artwork;

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        return button;
    }

    private createPopupArtwork(
        parent: Node,
        name: string,
        frame: SpriteFrame | undefined,
        width: number,
        height: number,
    ): Sprite | undefined {
        if (!frame) return undefined;
        const artworkNode = this.createNode(parent, name, 0, 0, width, height);
        const artwork = artworkNode.addComponent(Sprite);
        artwork.sizeMode = Sprite.SizeMode.CUSTOM;
        artwork.spriteFrame = frame;
        artworkNode.setSiblingIndex(0);
        return artwork;
    }

    /** 弹窗专用的晶体切角按钮，不影响 HUD 与开发入口的原有按钮皮肤。 */
    private createOverlayButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tone: OverlayAction['tone'],
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        if (tone === 'link') {
            const button = node.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.95;
            button.duration = 0.08;
            const label = this.createLabel(node, 'Label', text, 0, 0, 24, COLORS.muted, width, height);
            label.isUnderline = true;
            return button;
        }
        const graphics = node.addComponent(Graphics);
        const accent = tone === 'cyan' ? COLORS.cyan
            : tone === 'amber' ? COLORS.amber
                : COLORS.violet;
        // 三种色调只换色相，亮度与描边强度一致，避免某个按钮明显比其他按钮亮或暗。
        const fill = new Color(
            Math.round(COLORS.panel.r * 0.6 + accent.r * 0.4),
            Math.round(COLORS.panel.g * 0.6 + accent.g * 0.4),
            Math.round(COLORS.panel.b * 0.6 + accent.b * 0.4),
            255,
        );

        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 32);
        this.drawChamferedRectPath(graphics, -width / 2 - 6, -height / 2 - 5, width + 12, height + 10, 15);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 235);
        graphics.lineWidth = 2.5;
        this.drawChamferedRectPath(graphics, -width / 2, -height / 2, width, height, 12);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 82);
        graphics.lineWidth = 1;
        this.drawChamferedRectPath(graphics, -width / 2 + 6, -height / 2 + 6, width - 12, height - 12, 8);
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 130);
        graphics.moveTo(-width / 2 + 30, height / 2 - 7);
        graphics.lineTo(width / 2 - 30, height / 2 - 7);
        graphics.stroke();

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        const artworkFrame = this.ownedPopupButtonFrames.get(tone);
        graphics.enabled = !artworkFrame;
        if (artworkFrame) {
            const artworkNode = this.createNode(node, 'ButtonArtwork', 0, 0, width, height);
            const artwork = artworkNode.addComponent(Sprite);
            artwork.sizeMode = Sprite.SizeMode.CUSTOM;
            artwork.spriteFrame = artworkFrame;
            artworkNode.setSiblingIndex(0);
        }
        const isRewardedAdButton = name === 'WatchAdButton';
        // 看视频按钮采用紧凑的文字盒，图标才能贴着文字左缘布局，避免按整块按钮宽度居中造成视觉间距过大。
        const labelWidth = isRewardedAdButton ? 240 : width - 24;
        const label = this.createLabel(node, 'Label', text, isRewardedAdButton ? 22 : 0, 0, height <= 54 ? 22 : 24,
            COLORS.white, labelWidth, height - 8);
        setLabelBold(label, true);
        return button;
    }

    private drawChamferedRectPath(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        cut: number,
    ): void {
        const right = x + width;
        const top = y + height;
        const corner = Math.max(0, Math.min(cut, width / 2, height / 2));
        graphics.moveTo(x + corner, top);
        graphics.lineTo(right - corner, top);
        graphics.lineTo(right, top - corner);
        graphics.lineTo(right, y + corner);
        graphics.lineTo(right - corner, y);
        graphics.lineTo(x + corner, y);
        graphics.lineTo(x, y + corner);
        graphics.lineTo(x, top - corner);
        graphics.close();
    }

    private createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
    ): Label {
        const node = this.createNode(parent, name, x, y, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 9;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private tilePosition(index: number, boardSize: number, gap: number, tileSize: number): { x: number; y: number } {
        const row = Math.floor(index / BOARD_SIZE);
        const column = index % BOARD_SIZE;
        return {
            x: -boardSize / 2 + gap + tileSize / 2 + column * (tileSize + gap),
            y: boardSize / 2 - gap - tileSize / 2 - row * (tileSize + gap),
        };
    }

    private destroyOverlay(state?: OverlayState): void {
        if (state?.root.isValid) this.destroyNodeWithTweens(state.root);
    }

    private destroyNodeWithTweens(node: Node): void {
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        node.getComponents(UIOpacity).forEach((opacity) => Tween.stopAllByTarget(opacity));
        node.destroy();
    }

}
