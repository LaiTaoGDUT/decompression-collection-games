/**
 * 独立主题：彩路 · 石墨画室（fill2-graphite-v9）。
 * 色板沿用原版 108_FILL2 的序列化色板与实际运行画面：石墨底、灰色小圆角格、白字、粉色提示。
 * 模式主题：普通「紫晶」（紫色强调、原作薰衣草按钮、冷石墨底）；
 *          困难「熔岩」（珊瑚红强调、暖粉按钮、偏暖石墨底）。强调色用于模式标签、主按钮、
 *          进行中关卡、选关模式切换、棋盘背后柔光、通关标题描边；棋盘路线色板与提示粉两模式共用。
 * 底图：模式石墨色自上而下由亮到暗的竖向渐变，铺一层极淡的画室点阵；棋盘背后是模式色柔光。
 * 控件「烟晶」：暂停、返回、翻页、提示托盘、引导卡与选关路线卡统一用半透明白底 + 细亮边，
 *       图标和文字为浅色；只有主操作用实心模式色，次操作用模式色透明底 + 模式色描边。
 * 构图：大号关号在左，模式柔色胶囊紧邻关号右侧；暂停独立靠右；下接内凹分段进度槽与百分比；
 *       棋盘直接落在底色上（原作无棋盘底板），居中于头部与提示之间；底部单一提示托盘：
 *       粉色圆形灯泡图标、标题与说明、内凹库存角标。
 * 棋盘：灰色小圆角格带下沿厚度、同色铺面、深一阶粗路线、大圆起点。
 * 选关「路线图」：返回、居中标题和右侧烟晶分段胶囊同排，标题下显示通关进度；
 *       每页 5 × 6 关卡圆点沿细蛇形路线排列，收在一张烟晶路线卡里（不显示关卡区间和页码），卡片按内容高度居中；
 *       圆点带下沿厚度：普通通关段为紫晶色阶、困难为珊瑚色阶，进行中为模式强调色加外环，
 *       最新为模式底色加强调色描边，未解锁为中明度圆点加浅色轮廓与文字；不画通关勾，不用方格。
 *       底部继续上次为实心模式色，最新解锁为模式色透明底描边，两端烟晶翻页。
 * 引导：固定一行标题「滑动填色」与一行玩法描述，文字不随手势阶段切换。
 * 弹窗：模式色调的深石墨实心卡片 + 细亮边与投影，白色标题下接模式柔色胶囊，无顶部装饰；
 *       四项操作纵向排列：首项为带下沿厚度的实心模式色按钮，其余为烟晶次按钮。
 * 字体：关卡44粗体、胶囊20粗体、按钮26–30、说明18–24；通关标题白色64粗体、模式深色描边。
 * 动效：开局沿对角线逐格弹入、手指半透明光圈、入格亮框、退回格原色收缩、撞到他色起点轻晃、
 *       提示圆环、路线鼓动、终点星星、逐格通关亮波；手指光圈直径约 1.2 格；按钮按下压低松手回弹，提示以浅色胶囊淡入淡出；
 *       弹窗蒙层淡入、卡片回弹。
 * 通关页：全屏模式底色，棋盘后模式色柔光缓慢呼吸，四周本关配色的圆角方块缓缓上浮；
 *         成品棋盘先现空格再沿路线逐格填色、终点星弹出；不计星，无用时/步数面板；下一关为模式主按钮。
 * 声音：无背景音乐；滑动音迁移原作：每格把原作 Marimba_C 变调，
 *       每关随机一段旋律（巴赫前奏曲 / 五声 / 非五声，见 MultiColorFillMelody）；
 *       退格同样按新长度取音；短按键音、撞点限位音、完成和弦，
 *       全屏通关页弹出时钢琴倒放吸气接上行琶音、落在 C 大调和弦。制作脚本见 tools/audio/multi-color-fill/。
 */
export const FILL_THEME = Object.freeze({
    id: 'fill2-graphite-v9',
    /** 烟晶控件：白色按透明度叠在石墨底上。 */
    glass: '#FFFFFF', glassAlpha: 20, glassEdgeAlpha: 44, cardAlpha: 9, cardEdgeAlpha: 26, dotAlpha: 12,
    inset: '#11151B', insetAlpha: 150, dialogShadow: '#07090D', dialogShadowAlpha: 130,
    tile: '#5A5D63', tileShade: '#45484E', ink: '#F5F3FA', muted: '#CAD2E0', faint: '#A4B0C3',
    buttonInk: '#292334', hint: '#C06198', hintLight: '#F2C3DC',
    dim: '#111820', toast: '#F1F2F5', toastInk: '#29313A', white: '#FFFFFF',
});

export interface FillModeTheme {
    readonly accent: string; readonly accentShadow: string;
    readonly button: string; readonly buttonShadow: string;
    /** 浅强调：模式柔色胶囊与次操作的文字。 */
    readonly accentLight: string;
    /** background 为通关页满屏底色；底图渐变由 backgroundTop 过渡到 backgroundBottom。 */
    readonly background: string; readonly backgroundTop: string; readonly backgroundBottom: string;
    /** 暂停/结果弹窗卡片底色：比底图亮一阶的同色调石墨。 */
    readonly dialog: string;
    readonly surface: string; readonly locked: string; readonly lockedEdge: string; readonly lockedInk: string; readonly route: string;
    readonly routeColors: readonly FillColorSet[];
}
/** 普通「紫晶」与困难「熔岩」：统一构图，模式各自拥有控件和选关路线色阶。 */
export const FILL_MODE_THEMES: Readonly<Record<'normal' | 'hard', FillModeTheme>> = Object.freeze({
    normal: Object.freeze({ accent: '#B49AEF', accentShadow: '#7E67B0', button: '#C7B3F1', buttonShadow: '#9D87C8',
        accentLight: '#DCCFFA',
        background: '#252B35', backgroundTop: '#2E3542', backgroundBottom: '#1B1F27', dialog: '#333B4A',
        surface: '#615276', locked: '#5D586F', lockedEdge: '#958BAA', lockedInk: '#ECE6F6', route: '#655B79',
        routeColors: Object.freeze([
            { tile: '#A68BD8', line: '#665084', name: '紫晶' }, { tile: '#8E9BD8', line: '#535F8D', name: '蓝紫' },
            { tile: '#B69AE0', line: '#705689', name: '浅紫' }, { tile: '#9590CB', line: '#5A5482', name: '鸢尾' },
        ]) }),
    hard: Object.freeze({ accent: '#F29A86', accentShadow: '#AD6557', button: '#F3B29F', buttonShadow: '#C88876',
        accentLight: '#FCD3C8',
        background: '#2E292F', backgroundTop: '#38313A', backgroundBottom: '#221E24', dialog: '#3D343C',
        surface: '#765354', locked: '#6A5559', lockedEdge: '#AF9297', lockedInk: '#F5E8E7', route: '#795C63',
        routeColors: Object.freeze([
            { tile: '#DD8B7B', line: '#875149', name: '珊瑚' }, { tile: '#E7A17F', line: '#915C48', name: '杏橙' },
            { tile: '#CF8A91', line: '#81505C', name: '玫瑰' }, { tile: '#D89C8D', line: '#875F54', name: '暖陶' },
        ]) }),
});

export interface FillColorSet { readonly tile: string; readonly line: string; readonly name: string; }
export const FILL_PALETTE: readonly FillColorSet[] = Object.freeze([
    { tile: '#ED5F55', line: '#CF4A41', name: '红' }, { tile: '#F87D51', line: '#DD623B', name: '橙' },
    { tile: '#FAB153', line: '#E59340', name: '金' }, { tile: '#FCCD54', line: '#E7B040', name: '黄' },
    { tile: '#C3D368', line: '#9DAD41', name: '青柠' }, { tile: '#99D468', line: '#73B242', name: '浅绿' },
    { tile: '#42CB6F', line: '#34B056', name: '绿' }, { tile: '#47CEC0', line: '#20AD9E', name: '青' },
    { tile: '#4EC2E7', line: '#33A6CC', name: '浅蓝' }, { tile: '#5C9DED', line: '#427FCA', name: '蓝' },
    { tile: '#CB93EC', line: '#A367C8', name: '紫' }, { tile: '#EC87BF', line: '#CD63A1', name: '粉' },
]);
const COLOR_GROUPS: Readonly<Record<number, readonly (readonly number[])[]>> = Object.freeze({
    2: [[0, 6], [3, 9], [5, 11], [1, 9], [2, 10]],
    3: [[0, 6, 9], [1, 5, 11], [2, 10, 7]],
    4: [[0, 6, 9, 3], [1, 5, 8, 11], [3, 7, 9, 11], [1, 6, 9, 11], [3, 6, 8, 10], [0, 2, 5, 11], [1, 4, 7, 10]],
});
export function fillColorSets(count: number, levelNumber: number): readonly FillColorSet[] {
    const groups = COLOR_GROUPS[count];
    return groups[(levelNumber - 1) % groups.length].map(index => FILL_PALETTE[index]);
}
export const FILL_MODE_NAMES = Object.freeze({ normal: '普通模式', hard: '困难模式' });
export const FILL_WIN_TITLES = Object.freeze(['漂亮', '思路真妙', '一气呵成', '又进一关', '完美填满', '道路畅通']);
export const FILL_RESOURCE_BUNDLE = 'game-multi-color-fill-assets';
/** 滑动音：原作 `Marimba_C` 变调的 −10…+19 半音共 30 个，序号见 MultiColorFillMelody.noteFor。 */
const FILL_NOTE_CLIPS: readonly string[] = Object.freeze(Array.from({ length: 30 },
    (_, index) => `visual/audio/notes/fill-note-${index < 10 ? '0' : ''}${index}-v1`));
export const FILL_AUDIO = Object.freeze({
    bundle: FILL_RESOURCE_BUNDLE,
    cues: Object.freeze({
        uiButton: 'visual/audio/fill-button-v1',
        // 落格与退格共用同一组音，由 MultiColorFillMelody 按原作规则指定 variant。
        drop: FILL_NOTE_CLIPS,
        toggle: FILL_NOTE_CLIPS,
        collision: 'visual/audio/fill-limit-v1',
        milestone: 'visual/audio/fill-complete-v1',
        popup: 'visual/audio/fill-win-popup-v1',
    }),
});
