export const DESKTOP_CLEANUP_THEME_IDS = Object.freeze([
    'soft-clay-workbench',
] as const);

export type DesktopCleanupThemeId = typeof DESKTOP_CLEANUP_THEME_IDS[number];
export type DesktopCleanupThemeSelection = DesktopCleanupThemeId | 'random';

export const DESKTOP_CLEANUP_ITEM_TYPES = Object.freeze([
    'blue-pen',
    'red-pencil',
    'yellow-eraser',
    'mint-notes',
    'binder-clip',
    'orange-tape',
    'teal-usb',
    'cream-earbuds',
    'coral-keycap',
    'purple-stress-ball',
    'round-coaster',
    'spiral-notebook',
    'clear-ruler',
    'lucky-badge',
    'teal-wireless-mouse',
    'cream-alarm-clock',
    'coral-candle-jar',
    'mustard-glasses-case',
    'mint-compact-mirror',
    'purple-mini-speaker',
] as const);

export type DesktopCleanupItemType = typeof DESKTOP_CLEANUP_ITEM_TYPES[number];

export type DesktopCleanupRgb = readonly [number, number, number];

export interface DesktopCleanupThemeDefinition {
    readonly id: DesktopCleanupThemeId;
    readonly name: string;
    readonly targetType: DesktopCleanupItemType;
    readonly itemTypes: readonly DesktopCleanupItemType[];
    readonly itemAtlasPath: string;
    readonly itemAtlasColumns: number;
    readonly itemAtlasRows: number;
    readonly itemLabels: Readonly<Record<string, string>>;
    readonly itemColors: Readonly<Record<string, DesktopCleanupRgb>>;
    readonly itemSizeMultipliers: Readonly<Record<string, number>>;
    readonly logoItemTypes: readonly [
        DesktopCleanupItemType,
        DesktopCleanupItemType,
        DesktopCleanupItemType,
    ];
}

const WORKBENCH_ITEM_LABELS: Readonly<Record<string, string>> = Object.freeze({
    'blue-pen': '蓝笔',
    'red-pencil': '铅笔',
    'yellow-eraser': '橡皮',
    'mint-notes': '便签',
    'binder-clip': '夹子',
    'orange-tape': '胶带',
    'teal-usb': 'U盘',
    'cream-earbuds': '耳机',
    'coral-keycap': '键帽',
    'purple-stress-ball': '软球',
    'round-coaster': '杯垫',
    'spiral-notebook': '线圈本',
    'clear-ruler': '直尺',
    'lucky-badge': '★',
    'teal-wireless-mouse': '无线鼠标',
    'cream-alarm-clock': '小闹钟',
    'coral-candle-jar': '香薰蜡烛',
    'mustard-glasses-case': '眼镜盒',
    'mint-compact-mirror': '便携小镜',
    'purple-mini-speaker': '迷你音箱',
});

const WORKBENCH_ITEM_COLORS: Readonly<Record<string, DesktopCleanupRgb>> = Object.freeze({
    'blue-pen': [76, 139, 194],
    'red-pencil': [222, 103, 89],
    'yellow-eraser': [238, 190, 77],
    'mint-notes': [111, 191, 167],
    'binder-clip': [54, 65, 84],
    'orange-tape': [229, 136, 71],
    'teal-usb': [67, 160, 164],
    'cream-earbuds': [240, 223, 187],
    'coral-keycap': [229, 119, 114],
    'purple-stress-ball': [151, 115, 174],
    'round-coaster': [167, 116, 77],
    'spiral-notebook': [95, 124, 155],
    'clear-ruler': [141, 200, 201],
    'lucky-badge': [241, 184, 50],
    'teal-wireless-mouse': [38, 183, 190],
    'cream-alarm-clock': [246, 231, 194],
    'coral-candle-jar': [239, 103, 91],
    'mustard-glasses-case': [232, 174, 31],
    'mint-compact-mirror': [124, 212, 181],
    'purple-mini-speaker': [143, 79, 211],
});

const WORKBENCH_ITEM_SIZE_MULTIPLIERS: Readonly<Record<string, number>> = Object.freeze({
    'blue-pen': 1.00,
    'red-pencil': 1.00,
    'yellow-eraser': 1.00,
    'mint-notes': 1.00,
    'binder-clip': 1.00,
    'orange-tape': 1.00,
    'teal-usb': 1.00,
    'cream-earbuds': 1.00,
    'coral-keycap': 1.00,
    'purple-stress-ball': 1.00,
    'round-coaster': 1.10,
    'spiral-notebook': 1.20,
    'clear-ruler': 1.18,
    'lucky-badge': 1.00,
    'teal-wireless-mouse': 1.12,
    'cream-alarm-clock': 1.30,
    'coral-candle-jar': 1.22,
    'mustard-glasses-case': 1.08,
    'mint-compact-mirror': 1.14,
    'purple-mini-speaker': 1.24,
});

const WORKBENCH_THEME: DesktopCleanupThemeDefinition = Object.freeze({
    id: 'soft-clay-workbench',
    name: '软陶微缩工作台',
    targetType: 'lucky-badge',
    itemTypes: DESKTOP_CLEANUP_ITEM_TYPES,
    itemAtlasPath: 'visual/items/desktop-cleanup-items-atlas-v2/texture',
    itemAtlasColumns: 4,
    itemAtlasRows: 5,
    itemLabels: WORKBENCH_ITEM_LABELS,
    itemColors: WORKBENCH_ITEM_COLORS,
    itemSizeMultipliers: WORKBENCH_ITEM_SIZE_MULTIPLIERS,
    logoItemTypes: ['mint-notes', 'lucky-badge', 'red-pencil'] as const,
});

export const DESKTOP_CLEANUP_THEME_CATALOG: Readonly<Record<DesktopCleanupThemeId, DesktopCleanupThemeDefinition>> = Object.freeze({
    'soft-clay-workbench': WORKBENCH_THEME,
});

export const DEFAULT_DESKTOP_CLEANUP_THEME_ID: DesktopCleanupThemeId = 'soft-clay-workbench';
export const DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION: DesktopCleanupThemeSelection = 'random';

export function parseDesktopCleanupThemeId(_value: unknown): DesktopCleanupThemeId {
    return DEFAULT_DESKTOP_CLEANUP_THEME_ID;
}

export function parseDesktopCleanupThemeSelection(value: unknown): DesktopCleanupThemeSelection {
    if (value === 'random') return 'random';
    if (value === DEFAULT_DESKTOP_CLEANUP_THEME_ID) {
        return DEFAULT_DESKTOP_CLEANUP_THEME_ID;
    }
    return DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION;
}

export function getDesktopCleanupTheme(
    themeId: DesktopCleanupThemeId = DEFAULT_DESKTOP_CLEANUP_THEME_ID,
): DesktopCleanupThemeDefinition {
    return DESKTOP_CLEANUP_THEME_CATALOG[themeId] ?? WORKBENCH_THEME;
}

export function selectDesktopCleanupTheme(
    selection: DesktopCleanupThemeSelection = DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION,
    random: () => number = Math.random,
): DesktopCleanupThemeDefinition {
    if (selection !== 'random') return getDesktopCleanupTheme(selection);
    const index = Math.min(
        DESKTOP_CLEANUP_THEME_IDS.length - 1,
        Math.max(0, Math.floor(random() * DESKTOP_CLEANUP_THEME_IDS.length)),
    );
    const themeId = DESKTOP_CLEANUP_THEME_IDS[index] ?? DEFAULT_DESKTOP_CLEANUP_THEME_ID;
    return getDesktopCleanupTheme(themeId);
}
