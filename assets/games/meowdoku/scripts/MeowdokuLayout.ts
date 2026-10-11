import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { MEOWDOKU_DEFAULT_LIVES } from './MeowdokuModel';

/**
 * Meowdoku 玩法页面的布局基线。
 *
 * 所有数值都是 750 宽设计坐标下的**纵向/横向**尺寸，横向由 Canvas `Fit Width` 缩放。
 * 棋盘内部尺寸全部来自原作：
 * - 棋盘外框：`BoardView.intrinsic_size_for` = `槽位(108) * N + 内边距(15) * 2`
 * - 棋盘目标宽度：`FIXED_BOARD_WIDTH = 1008`（1080 宽参考），`N >= 8` 时再乘 `1.04167`
 * - 每格色块：`95 × 95`，视觉圆角恒定 `10` 设计像素（原作按容器缩放反补偿）
 * - 棋盘底板圆角：`30` 设计像素
 *
 * 原作参考宽 1080 与本项目 750 的宽高比完全一致（1.7778），因此纵向尺寸可以通过
 * `750 / 1080` 直接换算而不会改变相对构图。
 */

export const MEOWDOKU_DESIGN_WIDTH = 750;
export const MEOWDOKU_DESIGN_HEIGHT = 1334;

/** 原作参考分辨率到本项目设计分辨率的换算比例。 */
export const MEOWDOKU_SOURCE_SCALE = MEOWDOKU_DESIGN_WIDTH / 1080;

/** 棋盘在 1080 宽参考下的目标宽度。 */
export const MEOWDOKU_SOURCE_BOARD_WIDTH = 1008;
/** 大棋盘（`N >= 8`）在原作里会再放大一点，避免格子过小。 */
export const MEOWDOKU_SOURCE_BOARD_ENLARGE_FACTOR = 1.04167;
export const MEOWDOKU_BOARD_ENLARGE_MIN_SIZE = 8;

/** 棋盘内部几何（原作坐标）。 */
export const MEOWDOKU_CELL_PX = 100;
export const MEOWDOKU_CELL_GAP = 4;
export const MEOWDOKU_CELL_SLOT = MEOWDOKU_CELL_PX + MEOWDOKU_CELL_GAP * 2;
export const MEOWDOKU_BOARD_PADDING = 15;
export const MEOWDOKU_CELL_FACE_PX = 95;
export const MEOWDOKU_CELL_CORNER_SOURCE = 10;
export const MEOWDOKU_BOARD_CORNER_SOURCE = 30;

/**
 * 棋子显示比例与提取后的帧尺寸。
 *
 * 原作把每一帧按 `scale = 0.5` 画在格子上；本项目的帧是原图画布（320×248）的 0.75 倍
 * （240×186），所以显示比例用 `0.5 / 0.75`，最终猫身大小与原作一致
 * （177 设计像素 × 0.5）。
 */
export const MEOWDOKU_CAT_DISPLAY_SCALE = 0.5;
export const MEOWDOKU_CAT_TEXTURE_WIDTH = 240;
export const MEOWDOKU_CAT_TEXTURE_HEIGHT = 186;

/** 标记 X 的贴图已裁到内容，视觉边长取原作的 0.84 格宽。 */
export const MEOWDOKU_MARK_FACE_RATIO = 0.84;

/** HUD 尺寸（1080 参考 → 750 设计坐标）。 */
export const MEOWDOKU_TOP_BAR_HEIGHT = 120 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_HUD_BUTTON_TOUCH = 88;
export const MEOWDOKU_HUD_ICON_SIZE = 58;
/**
 * 棋盘上方 HUD 的卡片化排布：
 *
 * ```text
 * 顶栏   [第 N 关]         得分 1234         [♥ ♥ ♥] (Ⅱ)
 * 状态行 [猫咪进度 ▢▢▢▢▢▢▢▢]                  [✎ 草稿]
 * 规则条 [一种颜色一只猫][同行同列各一只][猫咪不能相邻]
 * ```
 *
 * 所有卡片左右边界都与规则条 / 棋盘外框对齐，卡片同高、全圆角、同一层柔和投影。
 * 体力和关卡、得分一起放在顶栏组成「本局状态」；状态行只留和棋盘直接相关的猫咪进度与草稿开关。
 */
export const MEOWDOKU_HUD_CARD_HEIGHT = 84 * MEOWDOKU_SOURCE_SCALE;
/** 暂停按钮直径（原作设置按钮 120，本合集缩到 88）。 */
export const MEOWDOKU_PAUSE_BUTTON_SIZE = 88 * MEOWDOKU_SOURCE_SCALE;
/** 顶栏左侧关卡胶囊宽度（容纳「第 999 关」）。 */
export const MEOWDOKU_LEVEL_CHIP_WIDTH = 168;
/** 顶栏里体力胶囊与暂停按钮之间的间距。 */
export const MEOWDOKU_HUD_ITEM_GAP = 12;
/** 状态行右侧的草稿开关（与体力胶囊同宽，猫咪进度的可用宽度不变）。 */
export const MEOWDOKU_DRAFT_TOGGLE_WIDTH = 260 * MEOWDOKU_SOURCE_SCALE;
/**
 * 猫咪进度（原作 `CatHeartRow` 的 `CatProgressBar`）：
 * 宽度由 `CatProgressBar.solve_metrics(total, 760)` 决定——
 * 格子 66 / 间距 68 / 内边距 24；超过 760 就换 62 的密排档并在 712 的可用宽度里摊开。
 * 体力胶囊是原作 `HeartBg`：260×84，里面 3 个 60×60 红心槽、间距 69。
 */
export const MEOWDOKU_CAT_ROW_HEIGHT = 88 * MEOWDOKU_SOURCE_SCALE;
/** 原作 `CatProgressBar` 的常量。 */
export const MEOWDOKU_CAT_SLOT = 66 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_CAT_SLOT_DENSE = 62 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_CAT_PITCH = 68 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_CAT_PADDING = 24 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_CAT_BAR_MAX_WIDTH = 760 * MEOWDOKU_SOURCE_SCALE;
/** 猫咪列表与草稿开关之间的最小间隙（原作 `CAT_PROGRESS_GROUP_GAP = 30`）。 */
export const MEOWDOKU_CAT_GROUP_GAP = 30 * MEOWDOKU_SOURCE_SCALE;
/** 头像与剪影等比铺满槽位，较旧比例放大约 15%；保持列表底板高度和槽位间距。 */
export const MEOWDOKU_CAT_COLOR_RATIO = 1;
/** 三颗心体力胶囊的原作基准尺寸（`health_progress_bar.tscn`）。 */
export const MEOWDOKU_LIFE_LIST_WIDTH = 260 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_LIFE_SLOT_MAX = 60 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_LIFE_SLOT_PITCH = 69 * MEOWDOKU_SOURCE_SCALE;
/** 沿用原作左右内边距，生命面板宽度按当前模式的生命上限计算。 */
export const MEOWDOKU_LIFE_LIST_PADDING = (MEOWDOKU_LIFE_LIST_WIDTH
    - MEOWDOKU_LIFE_SLOT_MAX - MEOWDOKU_LIFE_SLOT_PITCH * (MEOWDOKU_DEFAULT_LIVES - 1)) / 2;
/**
 * 底部道具栏：和顶部规则条同宽的白色圆角底板，里面只横排两块奶油色道具卡
 * （图标 + 名称 + 说明 + 右侧数量 / 广告角标），设计像素。草稿是常驻免费模式，不放在道具旁边。
 */
export const MEOWDOKU_TOOL_DOCK_HEIGHT = 128;
export const MEOWDOKU_TOOL_DOCK_PADDING = 12;
export const MEOWDOKU_TOOL_TILE_GAP = 12;
/** 提示条：显示推理说明 + 应用 / 取消。 */
export const MEOWDOKU_HINT_BAR_HEIGHT = 104;
export const MEOWDOKU_HINT_BUTTON_WIDTH = 132;
export const MEOWDOKU_BOTTOM_PADDING = 24;
export const MEOWDOKU_RULE_PANEL_HEIGHT = 164 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_RULE_PILL_WIDTH = 310 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_RULE_PILL_HEIGHT = 120 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_RULE_PILL_GAP = 19 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_RULE_PANEL_CORNER = 28 * MEOWDOKU_SOURCE_SCALE;
export const MEOWDOKU_RULE_PILL_CORNER = 15 * MEOWDOKU_SOURCE_SCALE;
/**
 * 页面纵向间距（设计像素）：安全区 → 顶栏 → 猫咪/体力行 → 规则条 →（棋盘）→ 道具栏。
 *
 * - `boardGap` 是棋盘与规则条、棋盘与道具栏**两侧共用**的最小间距，棋盘始终在两者正中间；
 * - 屏幕够高时用 `comfortable`；棋盘放不下时间距先向 `compact` 收紧，
 *   间距收到底还不够才缩小棋盘——留白永远不和棋盘抢空间，但也不会低于 `compact`。
 */
interface MeowdokuPageGaps {
    readonly top: number;
    readonly hudToStatus: number;
    readonly statusToRule: number;
    readonly boardGap: number;
}

export const MEOWDOKU_PAGE_SPACING: Readonly<{ comfortable: MeowdokuPageGaps; compact: MeowdokuPageGaps }> = Object.freeze({
    comfortable: Object.freeze({ top: 12, hudToStatus: 22, statusToRule: 18, boardGap: 32 }),
    compact: Object.freeze({ top: 0, hudToStatus: 6, statusToRule: 6, boardGap: 20 }),
});
export interface MeowdokuLayoutInsets {
    readonly safeTop?: number;
    readonly safeBottom?: number;
    readonly safeLeft?: number;
    readonly safeRight?: number;
    readonly topRightReservedBottom?: number;
}

export interface MeowdokuLayoutMetrics {
    readonly width: number;
    readonly height: number;
    readonly safeTop: number;
    readonly safeBottom: number;
    readonly safeLeft: number;
    readonly safeRight: number;
    readonly contentX: number;
    readonly contentWidth: number;
    readonly fitScale: number;
    /** 顶部内容起点（已避让安全区与微信胶囊）。 */
    readonly topInset: number;
    readonly topBarCenterY: number;
    readonly topBarHeight: number;
    readonly hudButtonTouch: number;
    readonly hudIconSize: number;
    /** HUD 卡片左右边界到屏幕边的距离（与规则条 / 棋盘外框对齐）。 */
    readonly hudEdgeInset: number;
    /** HUD 卡片（关卡 / 体力 / 猫咪进度 / 草稿开关）的统一高度与圆角。 */
    readonly hudCardHeight: number;
    readonly hudCardCorner: number;
    /** 顶栏左侧关卡胶囊。 */
    readonly levelChipLeft: number;
    readonly levelChipWidth: number;
    /** 顶栏右侧暂停按钮（中心 x 与直径）。 */
    readonly pauseX: number;
    readonly pauseSize: number;
    readonly rulePanelWidth: number;
    readonly rulePanelHeight: number;
    readonly rulePanelCenterY: number;
    readonly rulePanelCorner: number;
    readonly rulePillWidth: number;
    readonly rulePillHeight: number;
    readonly rulePillGap: number;
    readonly rulePillCorner: number;
    /** 状态行：猫咪列表贴左边界，草稿开关贴右边界。 */
    readonly catRowCenterY: number;
    readonly catRowHeight: number;
    readonly catSlotSize: number;
    readonly catSlotGap: number;
    readonly catSlotsFirstX: number;
    readonly catListLeft: number;
    readonly catListRight: number;
    readonly draftToggleLeft: number;
    readonly draftToggleRight: number;
    /** 顶栏体力胶囊（紧挨暂停按钮左侧），坐标与顶栏同一横轴。 */
    readonly lifeSlotSize: number;
    readonly lifeSlotGap: number;
    readonly lifeSlotsFirstX: number;
    readonly lifeListLeft: number;
    readonly lifeListRight: number;
    /** 底部道具行。 */
    /** 道具栏底板（与规则条同宽）。 */
    readonly toolRowWidth: number;
    readonly toolRowHeight: number;
    readonly toolRowCenterY: number;
    /** 道具栏里单块道具卡的尺寸与间距。 */
    readonly toolTileWidth: number;
    readonly toolTileHeight: number;
    readonly toolTileGap: number;
    /** 提示条（覆盖在棋盘与道具行之间）。 */
    readonly hintBarWidth: number;
    readonly hintBarHeight: number;
    readonly hintBarCenterY: number;
    /** 棋盘中心点。 */
    readonly boardX: number;
    readonly boardY: number;
    /** 棋盘外框边长（含内边距）。 */
    readonly boardSize: number;
    /** 为适配矮屏对棋盘做的额外等比缩放，`1` 表示按设计宽度原样显示。 */
    readonly boardFit: number;
    readonly boardCorner: number;
    /** 棋盘内部几何换算到设计坐标后的结果。 */
    readonly cellScale: number;
    /** 格子外框（100 设计像素，含格子自身的外间距）。 */
    readonly cellPx: number;
    readonly cellFace: number;
    readonly cellPitch: number;
    readonly cellPadding: number;
    readonly cellCorner: number;
    readonly catWidth: number;
    readonly catHeight: number;
    readonly markSize: number;
    /** 猫槽行总宽，便于调试与验收。 */
    readonly slotsWidth: number;
    readonly toastCenterY: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeInsets(
    width: number,
    height: number,
    insets: MeowdokuLayoutInsets,
): { safeTop: number; safeBottom: number; safeLeft: number; safeRight: number } {
    const topRightReservedBottom = Math.max(0, insets.topRightReservedBottom ?? 0);
    const safeTop = clamp(Math.max(0, insets.safeTop ?? 0, topRightReservedBottom), 0, height * 0.4);
    const safeBottom = clamp(Math.max(0, insets.safeBottom ?? 0), 0, height * 0.4);
    let safeLeft = clamp(Math.max(0, insets.safeLeft ?? 0), 0, width * 0.45);
    let safeRight = clamp(Math.max(0, insets.safeRight ?? 0), 0, width * 0.45);
    if (safeLeft + safeRight > width - 1) {
        const ratio = (width - 1) / Math.max(1, safeLeft + safeRight);
        safeLeft *= ratio;
        safeRight *= ratio;
    }
    return { safeTop, safeBottom, safeLeft, safeRight };
}

export function calculateMeowdokuLayoutFromPlatform(
    canvasWidth: number,
    canvasHeight: number,
    platformLayout?: PlatformLayoutInfo,
    systemInsets: Pick<MeowdokuLayoutInsets, 'safeTop' | 'safeBottom' | 'safeLeft' | 'safeRight'> = {},
    boardSize = MEOWDOKU_BOARD_ENLARGE_MIN_SIZE,
    lifeLimit = MEOWDOKU_DEFAULT_LIVES,
): MeowdokuLayoutMetrics {
    const safeArea = platformLayout?.safeArea;
    return calculateMeowdokuLayout(canvasWidth, canvasHeight, {
        safeTop: Math.max(systemInsets.safeTop ?? 0, safeArea?.top ?? 0),
        safeBottom: Math.max(
            systemInsets.safeBottom ?? 0,
            canvasHeight - (safeArea?.bottom ?? canvasHeight),
        ),
        safeLeft: Math.max(systemInsets.safeLeft ?? 0, safeArea?.left ?? 0),
        safeRight: Math.max(
            systemInsets.safeRight ?? 0,
            canvasWidth - (safeArea?.right ?? canvasWidth),
        ),
        topRightReservedBottom: platformLayout?.topRightReservedArea?.bottom,
    }, boardSize, lifeLimit);
}

/**
 * 玩法页面布局。坐标使用绑定 UI Camera 后的 Canvas 坐标，原点在画布中心、Y 向上。
 *
 * 横向不扣除左右系统安全区：棋盘与规则条都按屏幕可见宽度居中，
 * 只在竖向避让顶部胶囊和底部安全区。
 */
export function calculateMeowdokuLayout(
    canvasWidth: number,
    canvasHeight: number,
    insets: MeowdokuLayoutInsets = {},
    boardSize = MEOWDOKU_BOARD_ENLARGE_MIN_SIZE,
    lifeLimit = MEOWDOKU_DEFAULT_LIVES,
): MeowdokuLayoutMetrics {
    const width = Math.max(1, canvasWidth);
    const height = Math.max(1, canvasHeight);
    const normalized = normalizeInsets(width, height, insets);
    const contentWidth = width;
    const fitScale = Math.max(0.001, contentWidth / MEOWDOKU_DESIGN_WIDTH);

    const topInset = normalized.safeTop;
    const topBarHeight = MEOWDOKU_TOP_BAR_HEIGHT * fitScale;
    const hudButtonTouch = MEOWDOKU_HUD_BUTTON_TOUCH * fitScale;

    const rulePanelWidth = MEOWDOKU_SOURCE_BOARD_WIDTH * MEOWDOKU_SOURCE_SCALE * fitScale;
    const rulePanelHeight = MEOWDOKU_RULE_PANEL_HEIGHT * fitScale;
    const catRowHeight = MEOWDOKU_CAT_ROW_HEIGHT * fitScale;

    // HUD 卡片与规则条 / 棋盘外框左右对齐。
    const hudEdgeInset = (contentWidth - rulePanelWidth) / 2;
    const hudCardHeight = Math.min(catRowHeight, MEOWDOKU_HUD_CARD_HEIGHT * fitScale);
    const pauseSize = MEOWDOKU_PAUSE_BUTTON_SIZE * fitScale;
    const pauseX = contentWidth / 2 - hudEdgeInset - pauseSize / 2;
    const levelChipLeft = -contentWidth / 2 + hudEdgeInset;
    const levelChipWidth = MEOWDOKU_LEVEL_CHIP_WIDTH * fitScale;

    // 体力胶囊按生命上限容纳红心，保留原作槽位尺寸、间距与左右内边距。
    const lifeCount = Math.max(1, Math.floor(lifeLimit));
    const lifeSlotSize = MEOWDOKU_LIFE_SLOT_MAX * fitScale;
    const lifeSlotGap = Math.max(1, MEOWDOKU_LIFE_SLOT_PITCH * fitScale - lifeSlotSize);
    const lifeSlotsWidth = lifeSlotSize * lifeCount + lifeSlotGap * (lifeCount - 1);
    const lifeListWidth = lifeSlotsWidth + MEOWDOKU_LIFE_LIST_PADDING * 2 * fitScale;

    // 猫咪列表宽度：原作 `solve_metrics(total, 760)`。
    const catCount = Math.max(1, Math.min(12, boardSize));
    const catPadding = MEOWDOKU_CAT_PADDING * fitScale;
    const catMaxWidth = MEOWDOKU_CAT_BAR_MAX_WIDTH * fitScale;
    const idealWidth = MEOWDOKU_CAT_SLOT * fitScale
        + MEOWDOKU_CAT_PITCH * fitScale * (catCount - 1)
        + catPadding * 2;
    let catSlotSize = MEOWDOKU_CAT_SLOT * fitScale;
    let catSlotPitch = MEOWDOKU_CAT_PITCH * fitScale;
    if (idealWidth > catMaxWidth) {
        catSlotSize = MEOWDOKU_CAT_SLOT_DENSE * fitScale;
        const content = catMaxWidth - catPadding * 2;
        catSlotPitch = catCount > 1 ? (content - catSlotSize) / (catCount - 1) : 0;
    }
    let catBarWidth = catSlotSize + catSlotPitch * (catCount - 1) + catPadding * 2;
    // 贴边布局下要保证列表不会压到右边的草稿开关（原作靠 `solve_metrics(n, 760)` 限宽）。
    const draftToggleWidth = MEOWDOKU_DRAFT_TOGGLE_WIDTH * fitScale;
    const catBarLimit = contentWidth - hudEdgeInset * 2
        - draftToggleWidth - MEOWDOKU_CAT_GROUP_GAP * fitScale;
    if (catBarWidth > catBarLimit && catCount > 1) {
        catSlotSize = MEOWDOKU_CAT_SLOT_DENSE * fitScale;
        catSlotPitch = (catBarLimit - catPadding * 2 - catSlotSize) / (catCount - 1);
        catSlotPitch = Math.max(catSlotSize, catSlotPitch);
        catBarWidth = catSlotSize + catSlotPitch * (catCount - 1) + catPadding * 2;
    }

    // 状态行：猫咪列表贴左边界，草稿开关贴右边界。
    const catListLeft = -contentWidth / 2 + hudEdgeInset;
    const catListRight = catListLeft + catBarWidth;
    const catSlotGap = Math.max(0, catSlotPitch - catSlotSize);
    const catSlotsFirstX = catListLeft + catPadding + catSlotSize / 2;

    const draftToggleRight = contentWidth / 2 - hudEdgeInset;
    const draftToggleLeft = draftToggleRight - draftToggleWidth;

    // 顶栏：体力胶囊紧挨在暂停按钮左侧。
    const lifeListRight = pauseX - pauseSize / 2 - MEOWDOKU_HUD_ITEM_GAP * fitScale;
    const lifeListLeft = lifeListRight - lifeListWidth;
    const lifeSlotsFirstX = lifeListLeft + (lifeListWidth - lifeSlotsWidth) / 2 + lifeSlotSize / 2;

    // 底部道具栏固定贴在底部安全区之上，只放两张消耗道具卡。
    const toolRowWidth = rulePanelWidth;
    const toolRowHeight = MEOWDOKU_TOOL_DOCK_HEIGHT * fitScale;
    const toolDockPadding = MEOWDOKU_TOOL_DOCK_PADDING * fitScale;
    const toolTileGap = MEOWDOKU_TOOL_TILE_GAP * fitScale;
    const toolTileWidth = (toolRowWidth - toolDockPadding * 2 - toolTileGap) / 2;
    const toolTileHeight = toolRowHeight - toolDockPadding * 2;
    const toolRowCenterFromBottom = normalized.safeBottom
        + MEOWDOKU_BOTTOM_PADDING * fitScale + toolRowHeight / 2;
    const hintBarHeight = MEOWDOKU_HINT_BAR_HEIGHT * fitScale;
    const hintBarCenterFromBottom = toolRowCenterFromBottom + toolRowHeight / 2
        + 8 * fitScale + hintBarHeight / 2;

    // 道具栏上沿：棋盘区间的下边界。
    const toolRowTopFromTop = height - normalized.safeBottom
        - MEOWDOKU_BOTTOM_PADDING * fitScale
        - toolRowHeight;

    const boardTargetWidthSource = MEOWDOKU_SOURCE_BOARD_WIDTH
        * (boardSize >= MEOWDOKU_BOARD_ENLARGE_MIN_SIZE ? MEOWDOKU_SOURCE_BOARD_ENLARGE_FACTOR : 1);
    const boardTargetWidth = boardTargetWidthSource * MEOWDOKU_SOURCE_SCALE * fitScale;
    const intrinsicSide = MEOWDOKU_CELL_SLOT * boardSize + MEOWDOKU_BOARD_PADDING * 2;
    const boardTargetSide = boardTargetWidth;

    // 间距：先按最紧凑的间距算出棋盘还富余多少，富余部分按比例分给间距，
    // 最多放宽到 comfortable。矮屏上间距先收紧，棋盘尽量保持原尺寸。
    // 棋盘上下各有一份 `boardGap`，所以它在间距总和里算两次。
    const spacing = MEOWDOKU_PAGE_SPACING;
    const spacingSum = (gaps: MeowdokuPageGaps): number =>
        (gaps.top + gaps.hudToStatus + gaps.statusToRule + gaps.boardGap * 2) * fitScale;
    const topFixed = topInset + topBarHeight + catRowHeight + rulePanelHeight;
    const compactRoom = toolRowTopFromTop - topFixed - spacingSum(spacing.compact) - boardTargetSide;
    const spacingSpan = spacingSum(spacing.comfortable) - spacingSum(spacing.compact);
    const relax = clamp(spacingSpan > 0 ? compactRoom / spacingSpan : 1, 0, 1);
    const gap = (key: keyof MeowdokuPageGaps): number =>
        (spacing.compact[key] + (spacing.comfortable[key] - spacing.compact[key]) * relax) * fitScale;

    let cursor = topInset + gap('top');
    const topBarCenterFromTop = cursor + topBarHeight / 2;
    cursor += topBarHeight + gap('hudToStatus');
    const catRowCenterFromTop = cursor + catRowHeight / 2;
    cursor += catRowHeight + gap('statusToRule');
    const rulePanelCenterFromTop = cursor + rulePanelHeight / 2;
    const rulePanelBottomFromTop = cursor + rulePanelHeight;

    // 棋盘区间 = 规则条下沿 → 道具栏上沿，两端各扣一份最小间距。
    // 矮屏优先等比缩小主要玩法区域，而不是裁切或越界腾空间。
    const boardGap = gap('boardGap');
    const available = Math.max(1, toolRowTopFromTop - rulePanelBottomFromTop - boardGap * 2);
    const boardFit = clamp(
        Math.min(1, available / Math.max(1, boardTargetSide)),
        0.4,
        1,
    );
    const boardSizePx = boardTargetSide * boardFit;
    const cellScale = boardSizePx / intrinsicSide;
    // 棋盘放在规则条与道具栏的正中间：上下留白相等，且都不小于 `boardGap`；高屏保留自然留白。
    const boardCenterFromTop = (rulePanelBottomFromTop + toolRowTopFromTop) / 2;

    return Object.freeze({
        width,
        height,
        ...normalized,
        contentX: 0,
        contentWidth,
        fitScale,
        topInset,
        topBarCenterY: height / 2 - topBarCenterFromTop,
        topBarHeight,
        hudButtonTouch,
        hudIconSize: MEOWDOKU_HUD_ICON_SIZE * fitScale,
        hudEdgeInset,
        hudCardHeight,
        hudCardCorner: hudCardHeight / 2,
        levelChipLeft,
        levelChipWidth,
        pauseX,
        pauseSize,
        rulePanelWidth,
        rulePanelHeight,
        rulePanelCenterY: height / 2 - rulePanelCenterFromTop,
        rulePanelCorner: MEOWDOKU_RULE_PANEL_CORNER * fitScale,
        rulePillWidth: MEOWDOKU_RULE_PILL_WIDTH * fitScale,
        rulePillHeight: MEOWDOKU_RULE_PILL_HEIGHT * fitScale,
        rulePillGap: MEOWDOKU_RULE_PILL_GAP * fitScale,
        rulePillCorner: MEOWDOKU_RULE_PILL_CORNER * fitScale,
        catRowCenterY: height / 2 - catRowCenterFromTop,
        catRowHeight,
        catSlotSize,
        catSlotGap,
        catSlotsFirstX,
        lifeSlotSize,
        lifeSlotGap,
        lifeSlotsFirstX,
        lifeListLeft,
        lifeListRight,
        catListLeft,
        catListRight,
        draftToggleLeft,
        draftToggleRight,
        toolRowWidth,
        toolRowHeight,
        toolRowCenterY: -height / 2 + toolRowCenterFromBottom,
        toolTileWidth,
        toolTileHeight,
        toolTileGap,
        hintBarWidth: rulePanelWidth,
        hintBarHeight,
        hintBarCenterY: -height / 2 + hintBarCenterFromBottom,
        slotsWidth: catBarWidth,
        boardX: 0,
        boardY: height / 2 - boardCenterFromTop,
        boardSize: boardSizePx,
        boardFit,
        // 棋盘外框圆角是恒定的设计像素，不随格子缩放变化。
        boardCorner: MEOWDOKU_BOARD_CORNER_SOURCE * MEOWDOKU_SOURCE_SCALE * fitScale * boardFit,
        cellScale,
        cellPx: MEOWDOKU_CELL_PX * cellScale,
        cellFace: MEOWDOKU_CELL_FACE_PX * cellScale,
        cellPitch: MEOWDOKU_CELL_SLOT * cellScale,
        cellPadding: MEOWDOKU_BOARD_PADDING * cellScale,
        cellCorner: MEOWDOKU_CELL_CORNER_SOURCE * MEOWDOKU_SOURCE_SCALE * fitScale * boardFit,
        catWidth: MEOWDOKU_CAT_TEXTURE_WIDTH * MEOWDOKU_CAT_DISPLAY_SCALE * cellScale,
        catHeight: MEOWDOKU_CAT_TEXTURE_HEIGHT * MEOWDOKU_CAT_DISPLAY_SCALE * cellScale,
        markSize: MEOWDOKU_CELL_FACE_PX * MEOWDOKU_MARK_FACE_RATIO * cellScale,
        toastCenterY: height / 2 - boardCenterFromTop,
    });
}
