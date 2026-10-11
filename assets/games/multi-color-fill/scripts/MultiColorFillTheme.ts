/**
 * 独立主题：彩路 · 原作石墨棋盘（fill2-graphite-v2）。
 * 依据原版 108_FILL2 的序列化色板与实际运行画面冻结，不继承大厅主题。
 * 构图：上方居中的模式/关卡、白色圆形返回与重来、居中的悬浮棋盘、右下粉色提示。
 * 棋盘：灰色小圆角格、同色铺面、深一阶粗路线、大圆起点；拖动不显示额外步数计数。
 * 字体：关卡36粗体、模式18粗体、控件22、说明24；结算使用金色大字与紫色透底。
 * 动效：手指半透明光圈、入格亮框、提示圆环、路线鼓动、终点星星、逐格通关亮波。
 * 声音：短按键音、连续落格音与完成和弦。
 */
export const FILL_THEME = Object.freeze({
    id: 'fill2-graphite-v2', background: '#29313A', panel: '#424952', tile: '#5A5D63', edge: '#737984',
    ink: '#FFFFFF', muted: '#B6BAC2', faint: '#737984', yellow: '#FFCF4D', mint: '#CEA4CC',
    red: '#ED5F55', blue: '#5C9DED', pink: '#CE8AAD', hint: '#DE659C', modeBadge: '#31313A',
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
export const FILL_COLORS = Object.freeze([FILL_THEME.yellow, '#47CEC0', FILL_THEME.red, FILL_THEME.blue]);
export const FILL_MODE_NAMES = Object.freeze({ normal: '普通模式', hard: '困难模式' });
export const FILL_RESOURCE_BUNDLE = 'game-multi-color-fill-assets';
export const FILL_AUDIO = Object.freeze({
    bundle: FILL_RESOURCE_BUNDLE,
    cues: Object.freeze({
        uiButton: 'visual/audio/fill-button-v1',
        drop: 'visual/audio/fill-step-v1',
        toggle: 'visual/audio/fill-back-v1',
        collision: 'visual/audio/fill-limit-v1',
        milestone: 'visual/audio/fill-complete-v1',
    }),
});
