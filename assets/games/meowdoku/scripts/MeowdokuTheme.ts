import { Color, Material, SpriteFrame, Texture2D } from 'cc';

/**
 * 猫咪数独（Meowdoku）视觉与常量基线。
 *
 * 主题名称：`Meowdoku · 猫咪占格`
 * 设计关键词：奶白纸面 / 果冻色块 / 圆角棋盘 / 猫脸棋子 / 极简标记
 *
 * 本小游戏只复用原作 APK（com.oakever.meowdoku 1.18.0）的棋子美术、音效与调色板，
 * 页面构图、HUD 造型和动效编排由本项目自己定义并冻结，不继承大厅或其他小游戏。
 *
 * 色板来源（原作 `board_view.gd` 的 `region_color` 默认档 `NEW_CELL_ONLY`，
 * 以及 `game_page.tscn` 的页面底色与规则条配色）；区域显示色在原色上混入 12% 白色，
 * 小幅提亮，保留色板顺序与关卡选色映射以保证玩法识别度。
 */

export const MEOWDOKU_THEME_ID = 'meowdoku-paper-v1';

export const MEOWDOKU_THEME = Object.freeze({
    id: MEOWDOKU_THEME_ID,
    name: 'Meowdoku · 猫咪占格',
    keywords: Object.freeze(['奶白纸面', '果冻色块', '圆角棋盘', '猫脸棋子', '极简标记']),
});

/** 页面与 HUD 颜色。 */
/**
 * 通关提示条的评级门槛（原作 `win_toast_tier.gd` 的 `_THRESHOLDS`）：
 * 步数与 `scale` 相等 = PERFECT，再按 p5 / p10 / p20 分档，超出就没有提示条。
 * 4×4 / 5×5 不在表里，也就是小盘面不弹。
 */
/**
 * 引导关卡的盘面，取自原作 `assets/resources/levels/bankDataSP.json` 里
 * `pattern == "guide"` 的那一关（id 51）：4×4、解位在 `solution`、配色槽位 `colorMap`。
 */
/** 圆角面板底（128×128，圆角 34，四周留 2px 透明边）的 9-slice 内缩。 */
export const MEOWDOKU_PANEL_INSET = 34;

/** 引导页蒙层浓度（原作 `_show_mask_hints`）与每步之间的停顿（`_STEP_PAUSE_SEC = 0.4`）。 */
export const MEOWDOKU_TUTORIAL_MASK_ALPHA = 0.62;
export const MEOWDOKU_TUTORIAL_STEP_PAUSE = 0.4;

export const MEOWDOKU_TUTORIAL_BOARD = Object.freeze({
    size: 4,
    regions: Object.freeze([
        Object.freeze([0, 1, 2, 1]),
        Object.freeze([0, 1, 1, 1]),
        Object.freeze([0, 0, 3, 1]),
        Object.freeze([0, 3, 3, 1]),
    ]),
    solution: Object.freeze([2, 0, 3, 1]),
    colorMap: Object.freeze([8, 4, 10, 1]),
});

/**
 * 引导默认流程（原作 `tutorial_page.gd` 的 `_run_guide_flow_default`，
 * `nu_guide` 默认档 `VALUE_CURRENT_FLOW` 走的就是这条）：
 * 放第一只猫 → 明白了 → 叉掉同行同列 → 放第二只猫 → 划动排除四周 → 放第三只猫 → 自由放最后一只。
 */
export const MEOWDOKU_TUTORIAL_STEPS = Object.freeze([
    Object.freeze({
        mode: 'place' as const,
        // `TUTORIAL_STEP1_RICH`：{breath} 双击把猫咪放到格子里（玫红格）
        // 原作 `TUTORIAL_STEP1_RICH`：不带颜色，只说「双击把猫咪放到格子里」
        message: '双击或长按把猫咪放到格子里',
        subMessage: '',
        allowed: Object.freeze([[0, 2]] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([[0, 2]] as readonly (readonly [number, number])[]),
        hand: Object.freeze([0, 2] as readonly [number, number]),
    }),
    Object.freeze({
        mode: 'confirm' as const,
        message: "真棒！每种颜色只能放一只猫咪。",
        subMessage: '',
        allowed: Object.freeze([] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([] as readonly (readonly [number, number])[]),
        hand: null,
    }),
    Object.freeze({
        mode: 'mark' as const,
        message: "非常好！每行、每列都只能有一只猫咪。",
        subMessage: '点击这些空格以排除它们。',
        allowed: Object.freeze([
            [0, 0], [0, 1], [0, 3], [1, 2], [2, 2], [3, 2],
        ] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([
            [0, 0], [0, 1], [0, 3], [1, 2], [2, 2], [3, 2],
        ] as readonly (readonly [number, number])[]),
        maskKeep: Object.freeze([[0, 2]] as readonly (readonly [number, number])[]),
        hand: null,
    }),
    Object.freeze({
        mode: 'place' as const,
        message: "玫红色区域只剩这一个格子了，双击或长按放猫吧！",
        subMessage: '',
        allowed: Object.freeze([[3, 1]] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([[3, 1]] as readonly (readonly [number, number])[]),
        maskKeep: Object.freeze([[2, 2], [3, 2]] as readonly (readonly [number, number])[]),
        hand: Object.freeze([3, 1] as readonly [number, number]),
    }),
    Object.freeze({
        mode: 'mark' as const,
        message: "猫咪周围八个格子都不能放另一只猫。",
        subMessage: '划动这些空格以排除它们。',
        allowed: Object.freeze([[2, 0], [2, 1], [3, 0]] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([[2, 0], [2, 1], [3, 0]] as readonly (readonly [number, number])[]),
        maskKeep: Object.freeze([[3, 1]] as readonly (readonly [number, number])[]),
        hand: null,
        swipe: Object.freeze([[3, 0], [2, 0], [2, 1]] as readonly (readonly [number, number])[]),
    }),
    Object.freeze({
        mode: 'place' as const,
        message: "蓝色区域只剩这一个格子了，双击或长按放猫吧！",
        subMessage: '',
        allowed: Object.freeze([[1, 0]] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([[1, 0]] as readonly (readonly [number, number])[]),
        maskKeep: Object.freeze([[0, 0], [2, 0], [2, 1], [3, 0]] as readonly (readonly [number, number])[]),
        hand: Object.freeze([1, 0] as readonly [number, number]),
    }),
    Object.freeze({
        mode: 'free' as const,
        message: '找到最后一只猫咪吧！',
        subMessage: '',
        allowed: Object.freeze([[2, 3]] as readonly (readonly [number, number])[]),
        maskCells: Object.freeze([] as readonly (readonly [number, number])[]),
        hand: null,
    }),
]);

export const MEOWDOKU_WIN_TOAST_THRESHOLDS: Readonly<Record<number, Readonly<{ p5: number; p10: number; p20: number }>>> = Object.freeze({
    6: Object.freeze({ p5: 16, p10: 20, p20: 30 }),
    7: Object.freeze({ p5: 30, p10: 32, p20: 36 }),
    8: Object.freeze({ p5: 25, p10: 32, p20: 40 }),
    9: Object.freeze({ p5: 28, p10: 35, p20: 45 }),
    10: Object.freeze({ p5: 30, p10: 38, p20: 50 }),
    11: Object.freeze({ p5: 60, p10: 65, p20: 71 }),
    12: Object.freeze({ p5: 70, p10: 75, p20: 80 }),
});
/** 4 = 此关历史无叉、无草稿、零失误的专属奖励，0 = 本局零失误，1..3 = 普通通关步数档，-1 = 不弹。 */
export type MeowdokuWinToastTier = 0 | 1 | 2 | 3 | 4 | -1;
export function meowdokuWinToastTier(size: number, steps: number, perfect: boolean, genius = false): MeowdokuWinToastTier {
    if (size <= 0) return -1;
    if (perfect && genius) return 4;
    // 完美与结算页采用同一结果，不受草稿操作、预置猫或道具减少放猫步数的影响。
    if (perfect) return 0;
    if (steps <= 0) return -1;
    const table = MEOWDOKU_WIN_TOAST_THRESHOLDS[size];
    if (!table) return -1;
    if (steps <= table.p5) return 1;
    if (steps <= table.p10) return 2;
    if (steps <= table.p20) return 3;
    return -1;
}
/** 通关鼓励文案：`{N}` 为操作步数、`{CATS}` 为猫数，两者可能因草稿/预置猫/道具而不同。 */
export const MEOWDOKU_WIN_TOAST_MESSAGES: readonly (readonly string[])[] = Object.freeze([
    Object.freeze([
        '喵不可挡！{CATS} 只猫全部找齐。',
        '完美通关！每只猫都找对了。',
        '{N} 步通关，找齐 {CATS} 只猫。',
        '思路清晰，零失误通关！',
        '完喵无缺！{CATS} 只猫，一只不漏。',
        '判断准确，零失误找到所有猫咪。',
        '{CATS} 只猫全部归位，干净利落。',
        '推理到位，猫咪全部找到了。',
        "所有猫咪都找到了，太棒了！",
    ]),
    Object.freeze([
        '通关成功，漂亮！',
        '干净利落，所有猫咪都找到了。',
        '思路敏锐，顺利通关。',
        '高效又优雅。',
        '猫咪全部归位，继续挑战。',
        '{N} 步找齐 {CATS} 只猫，漂亮！',
        '找齐所有猫咪，完成得真利落！',
    ]),
    Object.freeze([
        "找猫高手！这局完成得很漂亮。",
        '这局完成得很利落，漂亮！',
        '思路清晰，全部猫咪都找到了。',
        "表现出色，干得漂亮。",
        "干净利落，继续挑战！",
        '猫咪不好惹，你却轻松拿下。',
        '离巅峰更近了一步。',
    ]),
    Object.freeze([
        "稳扎稳打，顺利找到所有猫咪。",
        '好棋！越来越出色。',
        "这局找得很顺利，继续加油！",
        '干得好，思路越来越敏锐。',
        "完成得不错，试试用更少步数通关吧！",
        "好样的！试试减少操作步数。",
        "表现不错，推理很漂亮。",
    ]),
    Object.freeze([
        '不画叉、不用草稿，零失误！\n天才猫侦探，非你莫属！',
    ]),
]);

/** 满标文字尺寸（原作 `full_mark_text.tscn` 的设计像素）。 */
export const MEOWDOKU_CLEAR_TEXT_SIZE: readonly [number, number] = Object.freeze([194, 72]);
export const MEOWDOKU_PERFECT_TEXT_SIZE: readonly [number, number] = Object.freeze([527, 84]);
/** 气泡 / 文字相对格子上移的基准：`CAT_TOP_UNSCALED + BUBBLE_GAP`。 */
export const MEOWDOKU_CAT_TOP_UNSCALED = 50;
export const MEOWDOKU_BUBBLE_GAP = 10;
/** 计分气泡高度（原作 `ComboFeedbackView.BUBBLE_HEIGHT`）。 */
export const MEOWDOKU_BUBBLE_HEIGHT = 83;
/** 满标反馈的最小盘面边长（原作 `full_mark_detector.MIN_BOARD_SIZE`）。 */
export const MEOWDOKU_FULL_MARK_MIN_SIZE = 6;
/** 未标格数允许值（原作档位：<=7 → 2、<=9 → 3、<=12 → 4）。 */
export function meowdokuMaxUnmarkedAllowed(size: number): number {
    if (size < MEOWDOKU_FULL_MARK_MIN_SIZE) return -1;
    if (size <= 7) return 2;
    if (size <= 9) return 3;
    return 4;
}
/** 面积最大的颜色（原作 `FullMarkDetector.dominant_region`），平票取编号小的。 */
export function dominantRegionId(regions: readonly (readonly number[])[]): number {
    const counts = new Map<number, number>();
    for (const row of regions) {
        for (const id of row) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = -1;
    let bestCount = 0;
    for (const id of Array.from(counts.keys()).sort((a, b) => a - b)) {
        const count = counts.get(id) ?? 0;
        if (count > bestCount) {
            bestCount = count;
            best = id;
        }
    }
    return best;
}
/** 画叉时格子的挤压节奏（原作 `CrossOutAppear_G3` 的 `BgPanel:scale`，x/y 错开）。 */
export const MEOWDOKU_MARK_SQUISH_APPEAR_X: readonly (readonly [number, number])[] = Object.freeze([
    [0.05, 1.1], [0.167, 0.9], [0.333, 1.05], [0.5, 1],
]);
export const MEOWDOKU_MARK_SQUISH_APPEAR_Y: readonly (readonly [number, number])[] = Object.freeze([
    [0.067, 0.8], [0.183, 1.1], [0.35, 0.95], [0.5, 1],
]);

export const MEOWDOKU_COLORS = Object.freeze({
    /** 手画标记 X 的颜色。 */
    mark: new Color(255, 255, 255, 255),
    /** 页面底色，取自原作 `Root/Background`。 */
    page: new Color(247, 242, 239, 255),
    /** 棋盘底板，原作是纯白圆角底板。 */
    board: new Color(255, 255, 255, 255),
    /** 规则条底板。 */
    rulePanel: new Color(255, 255, 255, 255),
    /** 规则条胶囊底色，取自原作 `sf_rule_pill`。 */
    rulePill: new Color(251, 244, 238, 255),
    /** 猫进度槽底色。 */
    slotEmpty: new Color(233, 222, 214, 255),
    /** 规则文案颜色，取自原作 `RuleLabel`。 */
    ruleText: new Color(147, 90, 90, 255),
    /** 关卡标题颜色。 */
    title: new Color(122, 72, 72, 255),
    /** 次级文案颜色。 */
    subtitle: new Color(176, 141, 134, 255),
    /** 圆形按钮与 HUD 卡片底色。 */
    hudButton: new Color(255, 255, 255, 255),
    /** HUD 卡片底部的柔和投影（暖棕低透明度，和页面底色融在一起）。 */
    hudShadow: new Color(122, 72, 72, 26),
    /** 圆形按钮图标颜色。 */
    hudIcon: new Color(147, 90, 90, 255),
    /** 自动标记开启时的强调色。 */
    hudAccent: new Color(205, 164, 0, 255),
    /** 叉的投影（暖棕半透明，压在格子上）。 */
    markShadow: new Color(110, 60, 60, 70),
    /** 错误标记的初始颜色，取自原作 `_RED_CROSS_BASE_COLOR`。 */
    markError: new Color(253, 106, 46, 255),
    /** 通关提示底板。 */
    toast: new Color(255, 255, 255, 246),
    /** 棋盘厚板露出的下沿侧边。 */
    boardEdge: new Color(236, 225, 217, 255),
    /** 棋盘投影（暖棕，按层叠加后中心约 20% 深）。 */
    boardShadow: new Color(122, 72, 72, 16),
    /** 有效生命的红心颜色。 */
    lifeHeart: new Color(233, 54, 74, 255),
    /** 沿用 fish_dim.png 的主色与 20% 透明度，白底上呈浅奶金色。 */
    lifeLost: new Color(245, 171, 31, 51),
    /** 工具按钮底板。 */
    toolBg: new Color(255, 255, 255, 240),
    /** 冲突连线的颜色。 */
    conflict: new Color(253, 106, 46, 220),
    /** 道具数量角标底色，取自原作 `StyleBoxFlat_red`。 */
    badge: new Color(233, 54, 54, 255),
    /**
     * 通关页标题描边（原作控制组 AB `_LEGACY_TITLE_STYLE.outline_color` = (0.8, 0.349, 0)）。
     */
    winTitleOutline: new Color(204, 89, 0, 255),
    /** 规则高亮贴图本身已经是红色（淡红填充 + 红边），这里保持原色不染。 */
    ruleHighlightTint: new Color(255, 255, 255, 255),
    /** 规则高亮时底板被点亮到的颜色（原作高亮框是红的：填充 ≈ #F0A8A8、边 ≈ #F03030）。 */
    rulePillGlow: new Color(244, 150, 150, 255),
    /** 通关页「下一关」按钮底色（原作 `btn_with_tag` 的 `StyleBoxFlat` = (0.945, 0.576, 0.125)）。 */
    winButton: new Color(241, 147, 32, 255),
    /** 没道具时的广告角标底色，取自原作 `game_ad_badge` 的绿色。 */
    badgeAd: new Color(2, 190, 82, 255),
    /** 通关提示条文案里的数字高亮色（原作四档 `highlight_color`）。 */
    /** 计分金光的金色（原作 `effect_score_trail` 的星点颜色 1,0.92,0.2 / 0.549,0.482,0.275）。 */
    scoreGold: new Color(255, 235, 51, 255),
    scoreGoldDeep: new Color(140, 123, 70, 255),
    winToastHighlight: Object.freeze([
        new Color(92, 218, 146, 255),
        new Color(115, 201, 255, 255),
        new Color(255, 131, 251, 255),
        new Color(255, 224, 21, 255),
    ]),
    /** 通关提示条文案的行高与内缩（原作 `MessageTxt` 的 line_separation 18）。 */
    winToastLineHeight: 72,
    /** 引导页蒙层浓度（原作 `_show_mask_hints` 的 mask）。 */
    tutorialMaskAlpha: 0.62,
    /** 引导每一步之间的停顿（原作 `_STEP_PAUSE_SEC = 0.4`）。 */
    tutorialStepPause: 0.4,
    /** 提示面板上「应用」按钮的底色（原作按钮的橙色系）。 */
    hintApply: new Color(255, 176, 102, 255),
    /** 提示条底板。 */
    hintPanel: new Color(122, 72, 72, 238),
    /** 提示条文字。 */
    hintText: new Color(255, 246, 240, 255),
    /** 弹窗蒙层（暖调深色，比纯黑柔和）。 */
    overlayDim: new Color(46, 28, 24, 168),
    /** 弹窗与选关格子的底部厚边 / 投影。 */
    panelShadow: new Color(122, 72, 72, 38),
    /** 主按钮底部厚边（`winButton` 的深一档）。 */
    primaryEdge: new Color(214, 112, 14, 255),
    /** 次按钮描边与底部厚边。 */
    secondaryEdge: new Color(236, 219, 205, 255),
    /** 结算页（通关 / 失败）的暖调深色蒙层，压住背后的棋盘。 */
    resultDim: new Color(36, 20, 16, 232),
    /** 结算页信息卡：比蒙层亮一档的暖棕实底 + 细描边，数值白色、标签暖灰。 */
    resultCard: new Color(74, 47, 38, 236),
    resultCardStroke: new Color(255, 236, 220, 52),
    resultLabel: new Color(236, 206, 188, 255),
    resultValue: new Color(255, 255, 255, 255),
    /** 玩法与弹窗共用的关卡胶囊：普通模式沿用原 HUD 的白底、暖棕字。 */
    levelChip: Color.WHITE,
    levelChipText: new Color(122, 72, 72, 255),
    /** 「完美通关」金色胶囊。 */
    resultPerfect: new Color(255, 206, 64, 255),
    resultPerfectText: new Color(122, 62, 8, 255),
    /** 此关历史无叉、无草稿、零失误的紫色专属称号。 */
    resultGenius: new Color(224, 158, 255, 255),
    resultGeniusText: new Color(82, 30, 116, 255),
    /** 失败页进度：高亮数字、进度条轨道与填充。 */
    resultHighlight: new Color(255, 206, 64, 255),
    resultTrack: new Color(36, 20, 16, 200),
    resultFill: new Color(255, 176, 64, 255),
    /** 失败页鼓励语。 */
    resultEncourage: new Color(247, 242, 238, 255),
    /** 看广告复活按钮的底部厚边（`badgeAd` 的深一档）。 */
    adEdge: new Color(0, 138, 58, 255),
    /** 选关页：未解锁关卡的格子底色与文字。 */
    levelLocked: new Color(236, 228, 221, 255),
    levelLockedText: new Color(196, 178, 170, 255),
    /** 专属通关关卡：浅紫底、紫色厚边，搭配金色呼吸星芒。 */
    levelGenius: new Color(239, 207, 255, 255),
    levelGeniusEdge: new Color(171, 104, 205, 255),
});

/**
 * 困难模式 · 莓果：以单一莓红为强调色，搭配偏冷的粉白纸面与淡莓灰未解锁格子。
 * 选关页、玩法与弹窗的关卡胶囊、结算印章统一使用同一莓红色相，避免两套红色互相打架。
 */
export const MEOWDOKU_HARD_MODE_COLORS: typeof MEOWDOKU_COLORS = Object.freeze({
    ...MEOWDOKU_COLORS,
    page: new Color(248, 242, 244, 255),
    board: new Color(255, 252, 253, 255),
    title: new Color(98, 40, 62, 255),
    subtitle: new Color(166, 124, 140, 255),
    ruleText: new Color(150, 58, 92, 255),
    rulePill: new Color(252, 236, 242, 255),
    hudButton: new Color(252, 232, 239, 255),
    hudIcon: new Color(150, 58, 92, 255),
    hudShadow: new Color(120, 32, 66, 26),
    panelShadow: new Color(120, 32, 66, 34),
    winButton: new Color(190, 52, 96, 255),
    primaryEdge: new Color(146, 32, 70, 255),
    secondaryEdge: new Color(238, 204, 217, 255),
    levelLocked: new Color(241, 231, 235, 255),
    levelLockedText: new Color(190, 160, 173, 255),
    levelGenius: new Color(246, 214, 228, 255),
    levelGeniusEdge: new Color(196, 96, 140, 255),
    levelChip: new Color(190, 52, 96, 255),
    levelChipText: Color.WHITE,
    resultGeniusText: new Color(122, 34, 72, 255),
});

/**
 * 区域显示色板：原作 `region_color` 默认档的 12 色统一混入 12% 白色。
 * 保留原顺序与色相，让格子稍浅、稍亮，仍能辨认相邻区域。
 * 4x4 关卡只会用到其中 4 个索引，但色板长度必须保持 12，
 * 才能复现原作 `LevelGenerator.compute_color_map` 的选色算法。
 */
export const MEOWDOKU_REGION_PALETTE_HEX: readonly string[] = Object.freeze([
    '#D3AF1F', '#D8809C', '#9789DE', '#F9A7E8',
    '#FBA970', '#FBDE92', '#6586B0', '#B0CDEA',
    '#50B3C8', '#449A68', '#99DA8D', '#B27F60',
]);

/**
 * 原作 `LevelGenerator.compute_color_map*` 用来评估“相邻区域颜色差”的 RGB 采样表。
 * 它和最终显示的 `MEOWDOKU_REGION_PALETTE_HEX` 是两套值：前者决定区域到色板槽位的
 * 映射，后者决定槽位真正画出来的颜色。两者都要保留，否则同一关的配色会变。
 */
export const MEOWDOKU_COLOR_MAP_RGB: readonly (readonly [number, number, number])[] = Object.freeze([
    Object.freeze([230, 168, 193] as const),
    Object.freeze([193, 101, 138] as const),
    Object.freeze([145, 121, 209] as const),
    Object.freeze([254, 160, 236] as const),
    Object.freeze([255, 169, 108] as const),
    Object.freeze([227, 186, 70] as const),
    Object.freeze([97, 130, 181] as const),
    Object.freeze([166, 190, 216] as const),
    Object.freeze([105, 188, 230] as const),
    Object.freeze([70, 179, 176] as const),
    Object.freeze([172, 217, 148] as const),
    Object.freeze([171, 109, 70] as const),
]);

let regionPaletteCache: readonly Color[] | undefined;

/** 区域色板（`Color` 形式），首次访问时解析并缓存。 */
export function meowdokuRegionPalette(): readonly Color[] {
    if (!regionPaletteCache) {
        regionPaletteCache = Object.freeze(
            MEOWDOKU_REGION_PALETTE_HEX.map((hex) => Color.fromHEX(new Color(), hex)),
        );
    }
    return regionPaletteCache;
}

/** 资源 Bundle。 */
export const MEOWDOKU_RESOURCE_BUNDLE = 'game-meowdoku-assets';

/** 贴图资源路径。 */
export const MEOWDOKU_ASSET_PATHS = Object.freeze({
    catAppear: 'visual/cat/meowdoku-cat-appear-v1/texture',
    catIdle: 'visual/cat/meowdoku-cat-idle-v1/texture',
    catFrustrated: 'visual/cat/meowdoku-cat-frustrated-v1/texture',
    catCry: 'visual/cat/meowdoku-cat-cry-v1/texture',
    catAngry2: 'visual/cat/meowdoku-cat-angry2-v1/texture',
    /** 果冻立体格子：本体（按区域色染色）+ 高光两帧，由 `build-board-textures.py` 生成。 */
    tile: 'visual/effect/meowdoku-tile-v2/texture',
    hintLight: 'visual/effect/meowdoku-hint-light-v1/texture',
    promptFrame: 'visual/effect/meowdoku-prompt-frame-v1/texture',
    promptX: 'visual/effect/meowdoku-prompt-x-v1/texture',
    promptCat: 'visual/effect/meowdoku-prompt-cat-v1/texture',
    paw: 'visual/effect/meowdoku-paw-v1/texture',
    gridGlow: 'visual/effect/meowdoku-grid-glow-v1/texture',
    brokenHeart1: 'visual/effect/meowdoku-broken-heart-1-v1/texture',
    brokenHeart2: 'visual/effect/meowdoku-broken-heart-2-v1/texture',
    /** 叉的单根笔画：胶囊形柱面明暗，由 `build-board-textures.py` 生成。 */
    crossBar: 'visual/effect/meowdoku-cross-bar-v2/texture',
    /** 叉笔画的柔和投影（每根笔画一张，四周带模糊留边），由 `build-board-textures.py` 生成。 */
    crossShadow: 'visual/effect/meowdoku-cross-shadow-v1/texture',
    glowRadial: 'visual/effect/meowdoku-glow-radial-v1/texture',
    star: 'visual/effect/meowdoku-star-v1/texture',
    iconBack: 'visual/ui/meowdoku-icon-back-v1/texture',
    iconPause: 'visual/ui/meowdoku-icon-pause-v1/texture',
    /** 数量为 0 时的「看广告领一个」图标（原作 `ad_play_icon.png`）。 */
    iconAdPlay: 'visual/ui/meowdoku-icon-ad-play-v1/texture',
    /** 引导页/弹窗用的 9-slice 白色圆角面板底（128×128，圆角 34，留 2px 透明边）。 */
    panelBg: 'visual/ui/meowdoku-panel-v1/texture',
    /** 静态引导手；单击、双击、划动与波纹由引导界面代码驱动。 */
    guideHand: 'visual/ui/meowdoku-guide-hand-v1/texture',
    /** 计分金光用的尾迹与星点（原作 `effect_score_trail` / `effect_score_burst` 的贴图）。 */
    trailGold: 'visual/effect/meowdoku-trail-gold-v1/texture',
    starGold: 'visual/effect/meowdoku-star-gold-v1/texture',
    starSpark: 'visual/effect/meowdoku-star-spark-v1/texture',
    glowSoft: 'visual/effect/meowdoku-glow-soft-v1/texture',
    /** 规则高亮底图（原作 `assets/sprites/game/rule_highlight.png`，332×140 的红色圆角框）。 */
    ruleHighlight: 'visual/ui/meowdoku-rule-highlight-v1/texture',
    /** 通关提示条底板（原作 `win_toast/bg.png`，900×370）。 */
    winToastBg: 'visual/ui/meowdoku-win-toast-bg-v1/texture',
    /** 通关提示条的评级图标（原作 `game_win_toast0N/union_86.png`）。 */
    winToast1: 'visual/ui/meowdoku-win-toast-1-v1/texture',
    winToast2: 'visual/ui/meowdoku-win-toast-2-v1/texture',
    winToast3: 'visual/ui/meowdoku-win-toast-3-v1/texture',
    winToast4: 'visual/ui/meowdoku-win-toast-4-v1/texture',
    ruleColor: 'visual/ui/meowdoku-rule-color-v1/texture',
    ruleLine: 'visual/ui/meowdoku-rule-line-v1/texture',
    ruleTouch: 'visual/ui/meowdoku-rule-touch-v1/texture',
    /** 顶部猫咪进度列表：用户提供的透明布偶猫头像，彩色与剪影共用轮廓。 */
    catSlotBaseFace: 'visual/ui/meowdoku-cat-slot-base-face-v1/texture',
    txtClear: 'visual/effect/meowdoku-txt-clear-v1/texture',
    txtPerfect: 'visual/effect/meowdoku-txt-perfect-v1/texture',
    rayLight: 'visual/effect/meowdoku-ray-light-v1/texture',
    toolLocate: 'visual/ui/meowdoku-tool-locate-v1/texture',
    toolHint: 'visual/ui/meowdoku-tool-hint-v1/texture',
    failCat: 'visual/ui/meowdoku-result-fail-cat-v1/texture',
    winCat: 'visual/ui/meowdoku-result-win-cat-v1/texture',
    winCatHop: 'visual/ui/meowdoku-result-win-cat-hop-v1/texture',
    winCatWink: 'visual/ui/meowdoku-result-win-cat-wink-v1/texture',
    /** 此关历史无手画叉、无草稿、零失误通关的「天才猫侦探」专属猫咪。 */
    winGeniusCat: 'visual/ui/meowdoku-result-genius-cat-v2/texture',
    likeHand: 'visual/ui/meowdoku-like-hand-v1/texture',
});

/** 成功弹窗的三种猫咪姿态，独立于标题随机选择，连续两次不重复。 */
export const MEOWDOKU_WIN_CAT_KEYS = Object.freeze(['winCat', 'winCatHop', 'winCatWink'] as const);

/**
 * 棋子精灵表几何。
 *
 * 原作把猫的动画放在 `cat_atlas.png`（出场 41 帧）和 `cat_atlas_1.png`（待机）里，
 * 由 `cell.tscn` 的 `CatIconAppear` / `CatIconIdle` 逐帧播放：
 * - 出场 41 帧按 30fps 播完（1.333s）；
 * - 待机在 `CatIconIdle` 里只用到前 48 帧，2.667s 播完后定格。
 * 精灵表按 0.75 倍导出，正好对上 4x4 棋盘的显示比例。
 */
export const MEOWDOKU_SHEETS = Object.freeze({
    /**
     * 新布偶猫出场：视频动作重排为 41 帧，按 40fps 播放（1.025 秒）。
     * 相比 36fps 再提速约 11%，保留完整放大、回弹、眨眼和星光，收势更干脆。
     *
     * `pack-video-appear.py` 用同视频完整帧恢复两侧裁切，保留放大回弹；
     * 正常尺寸以上的放大幅度保留 70%，峰值宽度从 215px 收小到 191px。
     * 使用更高的透明画布（240x216）容纳过冲；头部固定在各帧中心，
     * 收势帧与待机首帧的可见像素和显示比例一致，切换时不跳位。
     */
    catAppear: Object.freeze({
        cols: 8, rows: 6, count: 41,
        frameWidth: 240, frameHeight: 216, pad: 2,
        /** 相对原作帧尺寸的导出比例，用于换算显示大小。 */
        scale: 0.75,
        /** 扩展后的等价源画布尺寸，透明留白不改变猫头显示比例。 */
        sourceWidth: 320,
        sourceHeight: 288,
        fps: 40,
    }),
    /** 新布偶猫待机：视频全 107 帧 @24fps，透明绿幕、固定中心，播完停在正面。 */
    catIdle: Object.freeze({
        cols: 9, rows: 12, count: 107,
        frameWidth: 240, frameHeight: 186, pad: 2,
        scale: 0.75,
        sourceWidth: 320,
        sourceHeight: 248,
        fps: 24,
    }),
    /** 新布偶猫全场烦躁：去绿幕、固定中心，75 帧 @30fps、2.5 秒，首末帧衔接待机。 */
    catFrustrated: Object.freeze({
        cols: 12, rows: 7, count: 75,
        frameWidth: 240, frameHeight: 186, pad: 2,
        scale: 0.75,
        sourceWidth: 320,
        sourceHeight: 248,
        fps: 30,
    }),
    /** 新布偶猫哭泣：64 帧 @24fps、2.667 秒循环，固定猫头中心，扩展透明画布保留眼泪。 */
    catCry: Object.freeze({
        cols: 8, rows: 8, count: 64,
        frameWidth: 336, frameHeight: 216, pad: 2,
        scale: 0.75,
        sourceWidth: 448,
        sourceHeight: 288,
        fps: 24,
    }),
    /** 错放猫与被撞猫共用的新生气视频：41 帧 @24fps，保持原版约 1.708 秒动作时长。 */
    catAngry2: Object.freeze({
        cols: 8, rows: 6, count: 41,
        frameWidth: 240, frameHeight: 186, pad: 2,
        scale: 0.75,
        sourceWidth: 320,
        sourceHeight: 248,
        fps: 24,
    }),
});

/** 棋盘厚板与投影，原作 1080 参考像素，运行时 × 页面缩放 × `boardFit`。 */
export const MEOWDOKU_BOARD_PLATE = Object.freeze({
    depth: 12,
    shadowOffset: 14,
    shadowBlur: 28,
});

/**
 * 果冻立体格子贴图（`meowdoku-tile-v2.png`，`project-scripts/meowdoku/build-board-textures.py` 生成）。
 *
 * 帧 0 是灰度本体（顶面灰度 1，染色后就是色板原色；下沿侧壁更暗，外圈带向下投影），
 * 帧 1 是不染色的白色高光。两帧都以边长 `body` 的方块为格子本体，四周留投影边，
 * 所以节点边长 = 格子边长 × `frame / body`。格子总是正方形，整体等比缩放，
 * 圆角、侧壁与高光都随格子大小同比变化。
 */
export const MEOWDOKU_TILE = Object.freeze({
    sheet: Object.freeze({ cols: 2, rows: 1, count: 2, frameWidth: 252, frameHeight: 252, pad: 2 }),
    frame: 252,
    body: 212,
});

/**
 * 连击反馈改用 Label。文案与 9 档连击配音对应，配色与同档配音一起定义，
 * 3 连击从第 1 档开始，11 连击为 Breathtaking，12 连击循环回到第 1 档。
 */
export const MEOWDOKU_ENCOURAGEMENTS = Object.freeze([
    Object.freeze({ text: 'Nice', color: new Color(80, 189, 88, 255), voice: 'voice1' }),
    Object.freeze({ text: 'Great', color: new Color(49, 169, 210, 255), voice: 'voice2' }),
    Object.freeze({ text: 'Perfect', color: new Color(242, 145, 49, 255), voice: 'voice3' }),
    Object.freeze({ text: 'Excellent', color: new Color(206, 81, 222, 255), voice: 'voice4' }),
    Object.freeze({ text: 'Amazing', color: new Color(247, 86, 86, 255), voice: 'voice5' }),
    Object.freeze({ text: 'Unbelievable', color: new Color(177, 103, 226, 255), voice: 'voice6' }),
    Object.freeze({ text: 'Unreal', color: new Color(255, 222, 43, 255), voice: 'voice7' }),
    Object.freeze({ text: 'Insane', color: new Color(224, 107, 161, 255), voice: 'voice8' }),
    Object.freeze({ text: 'Breathtaking', color: new Color(49, 169, 210, 255), voice: 'voice10' }),
]);

/** 代码渲染的得分与鼓励语字形基线：粗字、清晰描边、暖棕投影。 */
export const MEOWDOKU_FEEDBACK_TEXT = Object.freeze({
    scoreColor: new Color(244, 144, 43, 255),
    outlineColor: new Color(255, 255, 255, 255),
    shadowColor: new Color(159, 71, 51, 210),
    outlineFontRatio: 0.085,
    shadowFontRatio: 0.065,
    encourageFontSize: 78,
    encouragePeakScale: 1.61,
});

/**
 * 「点赞手势」：原作 `play_like_hand(global_pos, LikeHandAnim.LIKE)`。
 * 触发条件是 `_decide_like_hand_for_correct_cat`：只有玩家主动放猫（双击或长按）、
 * 不是本局第一只猫、距上一只猫超过 `minInterval` 秒、且本局不超过 `maxTriggers` 次。
 * 原作只给 6..12 的棋盘配置了节奏。
 */
export const MEOWDOKU_LIKE_HAND = Object.freeze({
    /** 单张点赞图的显示尺寸，使用原有反馈的设计比例。 */
    designSize: 256 * 0.6,
    peakScale: 1.12,
    liftDesign: 22,
    popIn: 0.18,
    nod: 0.16,
    settle: 0.2,
    hold: 0.65,
    fadeOut: 0.24,
    /** 手势底边与分数弹跳峰值顶边的间距，按页面设计比例换算。 */
    bubbleGapDesign: 10,
    /** 点赞与得分反馈的横向留白。 */
    edgeMarginDesign: 100,
    cadenceBySize: Object.freeze({
        6: Object.freeze({ minInterval: 30, maxTriggers: 2 }),
        7: Object.freeze({ minInterval: 30, maxTriggers: 2 }),
        8: Object.freeze({ minInterval: 40, maxTriggers: 3 }),
        9: Object.freeze({ minInterval: 40, maxTriggers: 3 }),
        10: Object.freeze({ minInterval: 40, maxTriggers: 3 }),
        11: Object.freeze({ minInterval: 40, maxTriggers: 3 }),
        12: Object.freeze({ minInterval: 40, maxTriggers: 3 }),
    }),
});

/**
 * 「分数飞向得分面板」的拖尾（原作 `effect_score_trail.tscn` + `addons/trail_preview/tw.gd`）。
 *
 * 原作是三条 `Line2D` 记真实路径：只保留最后 `fixed_trail_length = 120` 像素
 * （`TrailGlow` 宽 120、`TrailAlp` / `TrailAdd` 宽 80），颜色由尾部的透明淡黄
 * 渐变到头部的橙色；头部还有两枚旋转光点（`GlowAlp` / `GlowAdd`，0.5 缩放、0.8s 一轮）
 * 和 16 粒小星点（life 0.35s、速度 ≤120、缩放 0.05~0.15）。
 *
 * 注意：Cocos 的 `Color(r, g, b, a)` 分量是 **0~255**，所以这里直接写换算好的整数。
 */
export const MEOWDOKU_SCORE_FLY = Object.freeze({
    /**
     * 整体放大系数。原作的数值是照 1080 基准给的，实际观感偏小，
     * 这里统一放大一点（拖尾宽度 / 光点 / 星点 / 爆发一起放大）。
     */
    scale: 1.35,
    /** 拖尾长度（原作 `fixed_trail_length`，1080 设计像素）。 */
    trailLength: 120,
    /**
     * 拖尾贴图的锚点（沿长度方向）。彗尾贴图左端透明、最亮段在右侧约 65%~90%，
     * 锚点放在 0.9 并压在头部，贴图左端恰好落在尾点。
     */
    trailHeadAnchor: 0.9,
    /** 往回采样路径的步数（用来量「头部往后 120 像素」落在曲线的哪个位置）。 */
    backSamples: 24,
    /** 宽光带宽度（原作 `TrailGlow.width`）。 */
    glowWidth: 120,
    /** 芯线宽（原作 `TrailAlp.width`）。 */
    coreWidth: 80,
    /** 头部两枚光点的缩放与自转速度（每 0.8s 一圈）。 */
    glowScale: 0.5,
    glowSpin: 180,
    glowLife: 0.8,
    /** 沿途小星点：`Stars` 的 life / 速度 / 缩放区间。 */
    starInterval: 0.035,
    starLife: 0.35,
    starSpeed: 120,
    starScaleMin: 0.05,
    starScaleMax: 0.15,
    /** 到达后拖尾停留（`_SE_TRAIL_LINGER`）与落点爆发的星点数 / 时长。 */
    trailLinger: 0.067,
    burstStars: 12,
    burstLife: 1.02,
    /** 头部两枚光点的颜色（`GlowAlp` = (0.549, 0.482, 0.275)、`GlowAdd` = (1, 0.92, 0.2)）。 */
    glowColorAlp: new Color(140, 123, 70, 255),
    glowColorAdd: new Color(255, 235, 51, 255),
    /**
     * 拖尾着色（贴图为白色，透明度渐变由贴图自身的左端淡出提供）：
     * 宽光带取 `Gradient_hy2kp` 的淡黄段并半透明垫底，芯线取头部橙色 `(1, 0.47, 0)`。
     */
    trailGlowColor: new Color(255, 235, 128, 140),
    trailCoreColor: new Color(255, 120, 0, 255),
});


/**
 * 冲突连线的中点红叉（原作 `conflict_line.tscn` 的 `MidpointSlot`）：
 * `Glow`（`et_glow_008`，从 0 放大）+ `RedCross`（两根 `icon_mark_white_2` 竖条
 * 旋转 ±45°、染色 (1, 0.2, 0.2)），0.1667s 出现，缩放 0.4 → 1.05 → 1，结尾缩到 0.3。
 */
export const MEOWDOKU_CONFLICT_LINE = Object.freeze({
    /** 红叉出现时刻（原作 `RedCross:visible` 在 0.1667s 由 false 变 true）。 */
    crossAppear: 0.1667,
    /** 弹入过程：0.4 →(0.0839) 1.05 →(0.2043) 1.0。 */
    popUp: 0.0839,
    popDown: 0.2043,
    popStart: 0.4,
    popPeak: 1.05,
    /** 结尾缩小（原作 0.8 → 1.0 之间缩到 0.3）。 */
    shrinkAt: 0.8,
    shrinkScale: 0.3,
    /**
     * 红叉的框（原作 `RedCross` 是 100×100）。笔画与格子里的叉同一造型，
     * 粗细和长度按 `MEOWDOKU_MARK` 相对这个框计算。
     */
    boxSize: 100,
    /** 中点光晕沿用原作 `RedCross` 节点的 0.5 缩放。 */
    glowBaseScale: 0.5,
    /** 红色（原作 `modulate = Color(1, 0.2, 0.2)`）。 */
    color: new Color(255, 51, 51, 255),
    /** 中点光晕的相对大小。 */
    glowScale: 1.6,
});

/**
 * 错误格的「心碎」，逐条照抄原作 `cell.tscn` 的 `ErrorAppear_G3`：
 *
 * - `Heart` 是格子正中 100×100 的容器（`z_index = 2`，和 `Glows` 同层，压在整个棋盘之上）；
 * - `Heart1` 是 100×104、缩放 0.6 的容器，里面两片碎片 `BrokenHeart1/2`
 *   （Sprite2D，缩放 1.105，位置 (35.44, 49.28) / (61.72, 45.83)，各带 offset）；
 * - `Heart1:visible` 0.359s 出现、1.197s 消失；`Heart1:modulate` 0.359→0.684 淡入；
 * - `Heart1:scale` 关键帧：0.359s = 0.6 → 0.683s = 1.1 → 1.034s = 1.0 → 1.194s = 0
 *   （相对基态 0.6 即 1 → 1.83 → 1.67 → 0，所以结尾是**缩小消失**而不是淡出）；
 * - `BrokenHeart1/2` 的 position/rotation 从 0.688s 动到 1.232s：
 *   BH1 左移约 8px、转 −12.5°；BH2 右移约 7px、转 +10°（都在 Heart1 的 100 单位空间里）。
 *
 * 注意：两片的位置要以**动画第一帧的关键值**为准，不能读 `cell.tscn` 里节点上的初始 position ——
 * `ErrorAppear_G3` 从 0s 起就把 `position` 按住（BH1 (52.70, 71.395)、BH2 (56.94, 71.135)），
 * 节点上写的 (61.72, 45.83) 根本用不到。再叠上各自的 sprite `offset` 才是图的中心。
 *
 * 换算到「相对格子」的比例（1 单位 = 格子边长的 1/100，再乘 0.6 的容器缩放）：
 * 单片 40×52 的图 → 26.5% × 34.5% 格子；两片中心分别落在 (−5.3%, −5.2%) 与 (+9.2%, −3.4%)
 * （Godot 的 y 向下，这里已换算成 Cocos 的 y 向上）。
 */
export const MEOWDOKU_BROKEN_HEART = Object.freeze({
    /** `Heart1:visible` 出现 / 消失时刻。 */
    appearAt: 0.359,
    hideAt: 1.197,
    /** `Heart1:modulate` 淡入（0.359 → 0.684）。 */
    fadeIn: 0.325,
    /**
     * `Heart1:scale` 的相对脉冲：1 →(0.324) 1.83 →(0.351) 1.67 →(0.160) 0。
     * 三段时长是相邻关键帧的时间差（0.359→0.683→1.034→1.194），别当成绝对时间用。
     */
    pulsePeakAt: 0.324,
    pulseSettleAt: 0.351,
    pulseEndAt: 0.160,
    pulsePeak: 1.83,
    pulseSettle: 1.67,
    /** 裂开（旋转 + 外移）的时间。 */
    splitAt: 0.688,
    splitDuration: 0.544,
    /** 单片尺寸（相对格子）。 */
    pieceWidthRatio: 0.265,
    pieceHeightRatio: 0.345,
    /**
     * 两片中心相对格心的偏移（x, y，y 向上为正）。
     *
     * 原作两片中心是 (−5.3%, −5.2%) 与 (+9.2%, −3.4%)，合起来的心整体偏 (−2%, +4.3%)；
     * 需求是「心要正对格子中心」，所以把这组偏移整体平移回以格心对称：
     * (−7.25%, −0.9%) 与 (+7.25%, +0.9%)（两片间距仍是原作的水平 14.5%）。
     */
    pieceOffsets: Object.freeze([
        Object.freeze([-0.0725, -0.009]),
        Object.freeze([0.0725, 0.009]),
    ]),
    /** 裂开时的水平外移与旋转角度。 */
    spreads: Object.freeze([-0.048, 0.043]),
    tilts: Object.freeze([-12.5, 10]),
    /** 整段结束后的清理时间。 */
    cleanupAt: 1.32,
});

/**
 * 错误格那层「橙红闪光」（原作 `cell.tscn` 的 `BgPanel/BgRed/RedRecttangle2`：
 * `StyleBoxFlat` 底色 `(1, 0.3216, 0)` = `#FF5200`、圆角 10、还带一圈
 * `(0.976, 0.392, 0.141)` α0.196 的阴影）。
 *
 * 时间来自 `ErrorAppear_G3`：0.0664s 变 visible，接着一直保持满尺寸，
 * 1.034s 开始缩、1.187s 缩到 0。
 */
export const MEOWDOKU_ERROR_FLASH = Object.freeze({
    color: new Color(255, 82, 0, 255),
    shadow: new Color(249, 100, 36, 50),
    /** 圆角（设计像素，原作 10）。 */
    corner: 10,
    appearAt: 0.0664,
    shrinkAt: 1.034,
    shrinkDuration: 0.153,
});

/**
 * 通关页 / 失败页共用的结算版式（750 设计像素，运行时 × `fitScale`）。
 *
 * 两页都是一整列自上而下排布：标题 → 关卡胶囊 → 猫咪舞台 → 信息卡 → 按钮，
 * 整列在胶囊下方与底部安全区之间居中，放不下时整列等比缩小，高屏保留上下留白。
 */
export const MEOWDOKU_RESULT_PAGE = Object.freeze({
    /** 整列与安全区上下边界之间至少留出的空隙。 */
    edgeGap: 24,
    /** 标题：白色粗体字身 + `winTitleOutline` 描边（沿用原作 `TitleLabelUp` 的风格）。 */
    titleHeight: 112,
    titleSize: 84,
    titleLetterSpacing: 8,
    titleOutline: 9,
    /** 标题下的关卡胶囊（「第 N 关」，通关零失误时并排一枚「完美通关」）。 */
    chipGap: 10,
    chipHeight: 50,
    chipFontSize: 26,
    chipPadX: 26,
    chipSpacing: 14,
    /** 猫咪舞台：单张透明图等比容纳，预留轻微出场回弹的空间。 */
    stageGap: 12,
    winStageHeight: 520,
    failStageHeight: 470,
    winCatHeight: 480,
    failCatHeight: 440,
    /** 所有结算猫共用一次 0.6 秒的淡入、上浮和轻微回弹，完成后静止。 */
    catStartScale: 0.86,
    catPeakScale: 1.02,
    catLift: 12,
    catOvershoot: 3,
    catGrowDuration: 0.42,
    catSettleDuration: 0.18,
    catFadeDuration: 0.32,
    raySize: 820,
    /** 信息卡（通关：得分 / 用时 / 步数；失败：找到进度）。 */
    cardGap: 20,
    cardWidth: 600,
    cardRadius: 36,
    winCardHeight: 150,
    failCardHeight: 168,
    statLabelSize: 26,
    statValueSize: 46,
    statDividerHeight: 72,
    progressTextSize: 34,
    progressBarWidth: 520,
    progressBarHeight: 22,
    /** 失败页猫咪下方的鼓励语。 */
    encourageGap: 8,
    encourageHeight: 56,
    encourageSize: 38,
    /** 按钮组。 */
    buttonsGap: 36,
    buttonWidth: 520,
    primaryButtonHeight: 112,
    secondaryButtonHeight: 96,
    buttonGap: 22,
    buttonEdge: 7,
    primaryButtonFont: 42,
    secondaryButtonFont: 36,
    adIconHeight: 46,
    adIconGap: 16,
    /** 失败页鼓励语按「已找到比例」分档（原作 `FailTextStats` 的 0.8 / 0.2）。 */
    highRatio: 0.8,
    midRatio: 0.2,
});

/** 困难模式结算印章：莓红双圆环和文字带暖白柔影、透明底；位于猫图右下角，随结算列等比适配。 */
export const MEOWDOKU_HARD_RESULT_STAMP = Object.freeze({
    diameter: 168,
    outerBorder: 7,
    innerBorder: 3,
    borderInset: 11,
    fontSize: 58,
    letterSpacing: 4,
    ink: new Color(230, 70, 118, 255),
    shadowColor: new Color(255, 246, 232, 144),
    shadowOffset: 2,
    shadowBlur: 3,
    shadowLayers: 3,
    angle: -12,
    catOffsetX: 0.32,
    catOffsetY: 0.34,
    /** 等猫出场落定后盖下：快速压扁、短暂回弹，再固定。 */
    delay: 0.64,
    startScale: 1.85,
    startAngle: 2,
    lift: 44,
    fadeDuration: 0.07,
    pressDuration: 0.16,
    pressScaleX: 1.04,
    pressScaleY: 0.86,
    reboundDuration: 0.08,
    reboundScale: 1.06,
    settleDuration: 0.14,
});

/**
 * 规则高亮（原作 `base_game_page.gd::_play_rule_highlight`）：`modulate.a` 从
 * `RULE_HL_FLOOR = 0.4` 到 1 按 `sin(t * PI)` 脉冲，周期 `RULE_HL_PERIOD = 0.6`，
 * 循环 2 次（`set_loops(2)`）。
 */
export const MEOWDOKU_RULE_HIGHLIGHT = Object.freeze({
    /** 单次呼吸时长（原作 `RULE_HL_PERIOD = 0.6`，按需求放慢到 0.75 更明显）。 */
    period: 0.75,
    /** 呼吸起始透明度（原作 `RULE_HL_FLOOR = 0.4`）。 */
    floor: 0.4,
    /** 呼吸次数（原作 `set_loops(2)`：两次）。 */
    breaths: 2,
});

/** 棋子节点在原作里的基础缩放（`CellView._CAT_ICON_BASE_SCALE`）。 */
export const MEOWDOKU_CAT_DISPLAY_SCALE = 0.5;

/**
 * 标记 X 的几何，全部来自原作 `cell.tscn` 的 `Crosses/CrossOut`：
 * 两根 32×168 的白色笔画按 0.5 缩放后旋转 ±45°，拼成一个 X；
 * 笔画长度从最终长度的 15% 生长到最终长度（原作是 12.5 → 84 棋盘本地像素）。
 */
export const MEOWDOKU_MARK = Object.freeze({
    /**
     * 笔画长度相对格宽的比例。原作是 84 / 100；果冻棋盘按大厅封面改成短而敦实的叉
     * （约为顶面边长的 0.67）。
     */
    barLengthRatio: 0.64,
    /** 笔画粗细相对格宽的比例。原作是 16 / 100；果冻棋盘按大厅封面加粗。 */
    barThicknessRatio: 0.19,
    /** 生长起点相对最终长度的比例（12.5 / 84）。 */
    barGrowFromRatio: 0.15,
    /** 投影贴图四周的模糊留边（笔画粗细的倍数），与 `build-board-textures.py` 一致。 */
    shadowPadRatio: 0.45,
    /** 投影按屏幕向下的偏移（格宽的比例）。 */
    shadowOffsetRatio: 0.035,
});

/** 动效时长，取自原作 `cell.tscn` 的动画轨。 */
export const MEOWDOKU_TIMING = Object.freeze({
    /** `CrossOutAppear` 总长。 */
    crossAppear: 0.49,
    /** `CrossOutAppear` 里第一/第二笔画的生长起点与时长。 */
    crossBar1Delay: 0.066,
    crossBar1Grow: 0.1,
    crossBar2Delay: 0.164,
    crossBar2Grow: 0.128,
    /** X 本体的弹入节奏（0.4 → 1.15 → 1）。 */
    crossPopStart: 0.104,
    crossPopPeak: 0.186,
    crossPopSettle: 0.439,
    crossPopOvershoot: 1.15,
    /** `CatIconAppear`：猫本体淡入 + 出场动画总长。 */
    catFadeIn: 0.056,
    /** 与 36fps 出场同步提速：原 0.2s 的猫头显现时刻提前到约 0.167s。 */
    catBurstAt: 1 / 6,
    /** `AutoXFillMode`：自动补叉的弹入与光圈。 */
    autoXPopSettle: 0.59,
    autoXFadeIn: 0.069,
    autoXGlowIn: 0.1,
    autoXGlowHold: 1.0,
    autoXGlowOut: 1.15,
    /** 通关扫光：每个对角环的间隔，原作 `AUTO_CROSS_DIAG_INTERVAL_SEC`。 */
    winRingInterval: 0.03,
    /** 区域消除变暗时长（`_DIM_TWEEN_SEC`）。 */
    dimFade: 0.1,
    /** 双击窗口，原作 `DEFAULT_DOUBLE_TAP_SEC`。 */
    doubleTapWindow: 0.35,
    /** 按住同一格放猫，达到时长即触发，不必松手。 */
    longPressDuration: 0.5,
    /** 长按允许的指尖抖动范围，单位为设计分辨率下的 UI 像素。 */
    longPressMoveTolerance: 18,
    /** 通关后停留多久再进入下一关。 */
    levelClearHold: 1.5,
    /** 放错位置时的屏幕震动（原作 `_play_screen_shake`，1080 参考下 ±8px）。 */
    shakeOffset: 8 * (750 / 1080),
    shakeSteps: Object.freeze([0.05, 0.05, 0.04, 0.04, 0.03]),
    /** 扣命时格子里碎心飞散的时长。 */
    brokenHeartFlight: 0.55,
    /** 生命栏红心：完整放大后裂开，再散落淡出。 */
    lifeHeartPop: 0.16,
    lifeHeartPopScale: 1.2,
    lifeHeartCrack: 0.12,
    lifeHeartFade: 0.38,
    /** 失败后输入锁定时长（原作 2.0s）。 */
    failInputLock: 2.0,
    /** 连击飘字的上浮与淡出。 */
    comboFloatRise: 0.9,
    /** 提示预览的呼吸节奏。 */
    hintPulse: 0.65,
    /** 工具与提示条切换时长。 */
    panelSwap: 0.15,
    /** 失败后多久弹出失败页（原作 0.6s）。 */
    failDialogDelay: 0.6,

    /** `ErrorAppear`（1.569s）：白叉弹入并退场，0.64s 后红叉弹入并停住。 */
    errorWhitePopStart: 0.066,
    errorWhitePopPeak: 0.168,
    errorWhiteHold: 0.352,
    errorWhiteShrink: 0.492,
    errorWhiteFadeAt: 0.493,
    errorRedAppearAt: 1.13,
    errorRedPopPeak: 1.218,
    errorRedSettle: 1.422,
    errorDuration: 1.569,

    /** `CrossOutDisAppear`（0.306s）：X 缩到 0.6 并淡出。 */
    crossDisappear: 0.301,
    crossDisappearFadeFrom: 0.1,
    crossDisappearShrink: 0.6,

    /** 猫的待机动画每 5 秒重播一次（原作 `_IDLE_INTERVAL`）。 */
    catIdleInterval: 5.0,
    /**
     * 单元级 Clear：原作 `_UNIT_CLEAR_WAVE_DELAY/STEP`，围绕最后落笔格按环依次点亮。
     */
    clearWaveDelay: 0.0667,
    clearWaveStep: 0.0333,
    /** 整盘满标（Perfect）：原作 `_FULL_MARK_WAVE_DELAY/STEP`，从 0.4667s 起按对角环扫。 */
    fullMarkDelay: 0.4667,
    /** 棋盘外发光闪烁峰值（原作 `BoardGlow` 的 0.3137）。 */
    boardGlowAlpha: 0.3137,
    /**
     * 通关提示条（原作 `game_win_toast_01.tscn` 的 `GenericPopup`）：
     * 0.0333s 淡入、0.1329s 冲到 1.05、0.333s 收到 1，`Mark` 在 0.5s，
     * 之后一直保持到 `hide_toast`（页面等 1.3s），最后 0.3159s 缩到 0.8 并淡出。
     */
    winToastPop: 0.5,
    winToastHold: 1.3,
    winToastOut: 0.3159,
    winToastScaleFrom: 0.7,
    winToastScalePeak: 1.05,
    winToastScaleEnd: 0.8,
    /** 提示条期间页面压暗到 0.749（原作 `Overlay:color`）。 */
    winToastDimAlpha: 0.749,

    /** 冲突反应按共用生气序列的完整时长结束，避免旧反馈定时提前截断新动作。 */
    conflictDuration: MEOWDOKU_SHEETS.catAngry2.count / MEOWDOKU_SHEETS.catAngry2.fps,
    conflictLineDelay: 0.25,
    conflictLineFade: 0.35,

    /** `GridGlowing`：光圈 0.2s 亮起、保持、1.7s 淡出。 */
    gridGlowIn: 0.2,
    gridGlowOutAt: 1.7,
    gridGlowDuration: 2.0,

    /** `PreCat`（0.467s）：肉垫弹一下 + 格子挤压。 */
    preCatPaw: 0.4667,

    /** 提示：光圈与提示框呼吸（`_HINT_HALF_CYCLE` / `_HINT_FADE_OUT` / 最低透明度）。 */
    hintHalfCycle: 0.65,
    hintFadeOut: 0.12,
    hintAlphaMin: 0.35,
    /** `play_r2_preview`：背景 0.2s 亮起，0.317s 后播 `PromptCrossOut`。 */
    hintPreviewDelay: 0.317,
    hintPreviewBgFade: 0.2,
    /** `play_prompt_cat`：猫提示 0.3 → 1 回弹 0.25s，再 1s 一轮呼吸。 */
    promptCatScaleIn: 0.25,
    promptCatPulse: 1.0,

    /** `PromptCrossOut`（0.64s）：整只叉 0 → 1.2 → 0.9 → 1。 */
    promptXPop: 0.59,

    /** 棋盘入场：按对角环逐格淡入放大（原作 `BoardContainerCell_01` 的 Group3 节奏）。 */
    /**
     * 棋盘入场（原作 `BoardContainerCell_01` + `game_page.tscn` 的 Group3 参数）：
     * 每格起始 `0.18 + 环 * 0.04`、淡入 0.4s、缩放 0 → 1 用时 1.0s；
     * 棋盘整体 0.18s 后淡入 0.45s、1.3 → 1 用时 0.48s、上移 130 设计像素用时 0.53s。
     */
    boardIntroListDelay: 0.18,
    boardIntroDiagonalInterval: 0.04,
    boardIntroCellFade: 0.4,
    boardIntroCellScale: 1.0,
    boardIntroContainerFade: 0.45,
    boardIntroContainerScale: 0.48,
    boardIntroContainerScaleFrom: 1.3,
    boardIntroContainerMove: 0.53,
    /** 猫咪列表：剪影的透明度与出现弹跳（原作 `CatProgressSlot`）。 */
    catSlotSilhouetteAlpha: 0.5,
    catSlotPopIn: 0.13,
    catSlotPopSettle: 0.22,
    /** 「Clear」满标提示（原作 `full_mark_text.tscn` 的 `Appear`）。 */
    clearTextIn: 0.12,
    clearTextScaleFrom: 0.7,
    clearTextScalePeak: 1.08,
    clearTextHold: 0.48,
    clearTextOut: 0.2,
    /** 提示遮罩的渐显与浓度（原作 `hint_overlay.gd`）。 */
    hintMaskFade: 0.3,
    hintMaskAlpha: 0.75,
    /** 通关页标题出现延迟（原作 `Appear` 里 `TitleLabelUp:fade` 的 0.1644s）。 */
    winTitleDelay: 0.1644,
    /** 标题淡入时长（0.1644 → 0.2756）。 */
    winTitleFade: 0.1112,
    /** 标题出场缩放第一段：1.6 → 0.9（0.164 → 0.3926）。 */
    winTitleSquash: 0.2287,
    /** 标题出场缩放第二段：0.9 → 1.0（0.3926 → 0.6288）。 */
    winTitleSettle: 0.2362,
    winContinueDelay: 0.9127,
    /** 「下一关」按钮淡入时长（0.9127 → 1.2759）。 */
    winContinueFade: 0.3632,

    /** 计分：得分气泡 `Appear` 动画 + 分数飞向 HUD。 */
    scoreBubblePop: 0.4,
    scoreBubbleSettle: 0.483,
    scoreBubbleFadeIn: 0.05,
    scoreBubbleFadeStart: 0.7,
    scoreBubbleDuration: 1.0167,
    scoreFlyDuration: 0.57,
    scoreFlyDelay: 0.8,
    scoreRollDuration: 0.35,
    /** 得分面板数值弹跳（原作 `_SE_BOUNCE_UP/DOWN_DURATION`）。 */
    scoreBounceUp: 0.1,
    scoreBounceDown: 0.2,
});

/**
 * 区域消除变暗：原作 `cat_found_grid` 的 `DIM_G1` 档（`ALPHA_DIM_G1 = 0.25`）。
 * 原作控制档是关掉的，本合集作为信息中性的视觉反馈默认开启。
 */
export const MEOWDOKU_DIM_ALPHA = 0.25;

/** 文案。与大厅语言无关，只覆盖玩法页面本身。 */
export const MEOWDOKU_COPY = Object.freeze({
    /** 关卡标题。 */
    levelTitle: (level: number): string => `第 ${level} 关`,
    hardResultStamp: '困难',
    rulePerColor: '一种颜色一只猫',
    rulePerLine: '同行同列各一只',
    ruleNoTouch: '猫咪不能相邻',
    clearTitle: '全部找到！',
    /**
     * 通关页鼓励语：保留原作五条并扩充为 25 条，每条不超过四个字。
     * 每次独立于猫咪图片随机取一个，并避开上一次用过的那个。
     */
    winTitles: Object.freeze([
        '势不可挡',
        '难以置信',
        '天才',
        '真聪明',
        '了不起',
        '太棒啦',
        '太厉害了',
        '机智如你',
        '脑力满分',
        '灵光一闪',
        '思路清晰',
        '推理高手',
        '找猫达人',
        '猫咪专家',
        '喵力全开',
        '解谜大师',
        '妙招连连',
        '稳稳拿下',
        '轻松过关',
        '你真行',
        '好样的',
        '真有一套',
        '干得漂亮',
        '高手出招',
        '越来越棒',
    ]),
    /** 顶部得分。 */
    scoreTitle: '得分',
    /** 工具名（原作 ToolKind：定位 / 提示 / 老鼠 / 草稿）。 */
    toolLocate: "找猫",
    toolHint: '提示',
    toolMouse: '老鼠',
    /** 道具卡上名称下面的一句说明。 */
    toolLocateDesc: "直接找到一只猫",
    toolHintDesc: '推理下一步',
    /** 广告角标上的字（原作 `GAME_AD`）。 */
    adTag: 'AD',
    /** 草稿：状态行开关（关 / 开）与草稿期间底部的取消 / 应用按钮。 */
    draftToggle: '草稿',
    draftToggleActive: '草稿中',
    draftCancel: '取消草稿',
    draftApply: '应用草稿',
    /** 生命耗尽后的失败页。 */
    failTitle: '生命值耗尽',
    failRestart: '重新开始',
    failLobby: '返回大厅',
    /** 失败页进度：「已找到 3 / 6 只猫咪」。 */
    failProgress: (found: number, total: number): string => `已找到 ${found} / ${total} 只猫咪`,
    /** 通关页信息卡的三项。 */
    resultScore: '得分',
    resultTime: '用时',
    resultSteps: '步数',
    /** 通关页主按钮。 */
    resultNext: '下一关',
    /** 暂停弹窗。 */
    pauseTitle: '暂停一下',
    pauseResume: '继续游戏',
    pauseRestart: '重新开始',
    pauseSelectLevel: '选择关卡',
    /** 选关页。 */
    levelSelectTitle: '选择关卡',
    modeNormal: '普通模式',
    modeHard: '困难模式',
    levelSelectProgress: (cleared: number, total: number): string => `已通关 ${cleared} / ${total}`,
    levelSelectCurrent: '进行中',
    levelSelectLatest: "新解锁",
    levelSelectPage: (first: number, last: number): string => `第 ${first}–${last} 关`,
    levelSelectJumpCurrent: (level: number): string => `当前关卡：第 ${level} 关`,
    levelSelectJumpLatest: (level: number): string => `最新解锁：第 ${level} 关`,
    /** 失败页的看广告复活按钮（原作 `FAIL_REVIVE_1FISH`）。 */
    /** 复活按钮文案（原作 `FAIL_REVIVE_3FISH`，复活是补满 3 颗红心）。 */
    failRevive: "看广告恢复 3 颗红心",
    /** 复活按钮副标题（原作 `FAIL_REVIVE_SUBTITLE_3FISH`）。 */
    failReviveSubtitle: "看完广告后恢复 3 颗红心",
    /** 复活补满的生命值数量（原作 `_lives = _life_cap`，cap 默认 3）。 */
    reviveLives: 3,
    /** 失败页标题上方的小字（原作 `FAIL_TITLE_FISH` 的猫数说明）。 */
    /**
     * 失败弹窗里「猫下面那句」：原作 `FailTextStats.pick_encourage_text()` 按
     * 「已找到猫咪比例」分 HIGH / MID / LOW 三档、每档 4 条随机（中文取自
     * `FAIL_ENC_HIGH_1..4` / `FAIL_ENC_MID_1..4` / `FAIL_ENC_LOW_1..4`）。
     */
    /** 广告没看完 / 拉不到时的提示。 */
    adUnavailable: '广告暂时不可用，稍后再试',
    failEncourageHigh: Object.freeze([
        '就快成功了！',
        '就差一点点了！',
        '胜利在望！',
        '差点就抓全了！',
    ]),
    failEncourageMid: Object.freeze([
        '再接再厉！',
        '继续加油！',
        '已经很不错了！',
        '下一把一定行！',
    ]),
    failEncourageLow: Object.freeze([
        '你一定可以的！',
        '慢慢来，别急！',
        '再来一次！',
        '猫咪们等着你！',
    ]),
    /** 开局提示，取自原作 `GAME_TOAST_FIRST_TRY` / `GAME_TOAST_KEEP_GOING` 的语气。 */
    startFirst: '找出所有猫咪吧！',
    startRetry: '再来一次，这次一定行！',
    startAssist: "已为你放好一只猫咪，从这里继续吧。",
    /** 零失误通关时通关页关卡号旁的金色胶囊。 */
    perfectWin: '完美通关',
    geniusWin: '天才猫侦探',
    geniusWinTitle: '喵喵满分',
    /** 第一关引导的步骤文案，取自原作 `TUTORIAL_*`。 */
    tutorialSteps: Object.freeze([
        '双击或长按格子放一只猫咪。',
        '点击格子标记 × 来排除它。',
        '猫咪四周不能有另一只猫，斜着相邻也不行。',
    ]),
    tutorialSkip: '跳过',
    tutorialGotIt: '明白了',
    /** 单条提示的取消 / 应用，取自原作 `HINT_CANCEL` / `HINT_APPLY`。 */
    hintCancel: '取消',
    hintApply: '应用',
    hintNoHint: "暂无可直接给出的提示，试试用草稿推理候选格。",
});

/** 加载好的贴图与精灵帧；由 `MeowdokuGame` 负责创建与销毁。 */
export interface MeowdokuVisuals {
    readonly frames: Readonly<Record<keyof typeof MEOWDOKU_ASSET_PATHS, SpriteFrame>>;
    /** 只采样头像透明度、保留区域染色的共享剪影材质。 */
    readonly catSlotSilhouette: Material;
    /** 出场动画的逐帧精灵帧，共享给所有格子。 */
    readonly catAppear: readonly SpriteFrame[];
    /** 待机动画的逐帧精灵帧。 */
    readonly catIdle: readonly SpriteFrame[];
    /** 放错位置时全场猫的「烦躁」动画。 */
    readonly catFrustrated: readonly SpriteFrame[];
    /** 生命值耗尽时全场猫的「哭」动画。 */
    readonly catCry: readonly SpriteFrame[];
    /** 冲突反应：错放猫与被撞猫共用的生气序列帧。 */
    readonly catAngry2: readonly SpriteFrame[];
    /** 果冻格子本体（染色）与高光（不染色）。 */
    readonly tileBody: SpriteFrame;
    readonly tileGloss: SpriteFrame;
    readonly owned: readonly SpriteFrame[];
}
