export const DESKTOP_CLEANUP_THEME_IDS = Object.freeze([
    'soft-clay-workbench',
    'dessert-workbench',
    'convenience-store',
    'fruit-stall',
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

export const DESKTOP_CLEANUP_DESSERT_ITEM_TYPES = Object.freeze([
    'strawberry-doughnut',
    'butter-croissant',
    'strawberry-shortcake',
    'mint-macaron',
    'caramel-flan',
    'egg-tart',
    'chocolate-cookie',
    'golden-waffle',
    'chocolate-eclair',
    'pink-meringue',
    'cinnamon-roll',
    'chocolate-swiss-roll',
    'strawberry-popsicle',
    'golden-star-cookie',
    'berry-cupcake',
    'golden-madeleine',
    'pistachio-biscuit',
    'cream-puff',
    'lemon-cheesecake',
    'dark-chocolate-bar',
] as const);

export const DESKTOP_CLEANUP_CONVENIENCE_ITEM_TYPES = Object.freeze([
    'blue-milk-carton',
    'red-chips-bag',
    'lime-soda-can',
    'seaweed-rice-ball',
    'orange-noodle-cup',
    'orange-juice-bottle',
    'blueberry-yogurt-cup',
    'cheese-sandwich-pack',
    'teal-tuna-can',
    'sausage-twin-pack',
    'green-mint-tin',
    'pink-tissue-pack',
    'blue-water-bottle',
    'golden-shopping-basket',
    'blue-biscuit-box',
    'strawberry-jelly-cup',
    'yellow-cereal-box',
    'turquoise-gummy-pouch',
    'cream-coffee-cup',
    'wrapped-bread-loaf',
] as const);

export const DESKTOP_CLEANUP_FRUIT_ITEM_TYPES = Object.freeze([
    'red-apple',
    'ripe-strawberry',
    'banana-bunch',
    'purple-grape-bunch',
    'watermelon-wedge',
    'golden-pineapple',
    'green-pear',
    'fresh-orange',
    'yellow-lemon',
    'pink-peach',
    'kiwi-half',
    'dragon-fruit-half',
    'purple-mangosteen',
    'golden-starfruit',
    'sunset-mango',
    'coconut-half',
    'cherry-pair',
    'blueberry-cluster',
    'avocado-half',
    'fig-half',
] as const);

export type DesktopCleanupItemType = typeof DESKTOP_CLEANUP_ITEM_TYPES[number]
    | typeof DESKTOP_CLEANUP_DESSERT_ITEM_TYPES[number]
    | typeof DESKTOP_CLEANUP_CONVENIENCE_ITEM_TYPES[number]
    | typeof DESKTOP_CLEANUP_FRUIT_ITEM_TYPES[number];

export type DesktopCleanupRgb = readonly [number, number, number];

export interface DesktopCleanupThemeDefinition {
    readonly id: DesktopCleanupThemeId;
    readonly name: string;
    readonly targetType: DesktopCleanupItemType;
    readonly targetLabel: string;
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
    'blue-pen': 1.02,
    'red-pencil': 1.02,
    'yellow-eraser': 0.92,
    'mint-notes': 0.98,
    'binder-clip': 0.92,
    'orange-tape': 0.98,
    'teal-usb': 0.90,
    'cream-earbuds': 0.95,
    'coral-keycap': 0.88,
    'purple-stress-ball': 0.98,
    'round-coaster': 1.13,
    'spiral-notebook': 1.29,
    'clear-ruler': 1.23,
    'lucky-badge': 0.95,
    'teal-wireless-mouse': 1.17,
    'cream-alarm-clock': 1.40,
    'coral-candle-jar': 1.30,
    'mustard-glasses-case': 1.11,
    'mint-compact-mirror': 1.20,
    'purple-mini-speaker': 1.33,
});

const WORKBENCH_THEME: DesktopCleanupThemeDefinition = Object.freeze({
    id: 'soft-clay-workbench',
    name: '软陶微缩工作台',
    targetType: 'lucky-badge',
    targetLabel: '幸运徽章',
    itemTypes: DESKTOP_CLEANUP_ITEM_TYPES,
    itemAtlasPath: 'visual/items/desktop-cleanup-items-atlas-v2/texture',
    itemAtlasColumns: 4,
    itemAtlasRows: 5,
    itemLabels: WORKBENCH_ITEM_LABELS,
    itemColors: WORKBENCH_ITEM_COLORS,
    itemSizeMultipliers: WORKBENCH_ITEM_SIZE_MULTIPLIERS,
    logoItemTypes: ['mint-notes', 'lucky-badge', 'red-pencil'] as const,
});

const DESSERT_ITEM_LABELS = Object.freeze({
    'strawberry-doughnut': "草莓甜甜圈",
    'butter-croissant': "黄油可颂",
    'strawberry-shortcake': "草莓蛋糕",
    'mint-macaron': "薄荷马卡龙",
    'caramel-flan': "焦糖布丁",
    'egg-tart': "葡式蛋挞",
    'chocolate-cookie': "巧克力曲奇",
    'golden-waffle': "金黄华夫饼",
    'chocolate-eclair': "巧克力闪电泡芙",
    'pink-meringue': "粉色蛋白糖",
    'cinnamon-roll': "肉桂卷",
    'chocolate-swiss-roll': "巧克力卷",
    'strawberry-popsicle': "草莓雪糕",
    'golden-star-cookie': "金色星星饼干",
    'berry-cupcake': "莓果纸杯蛋糕",
    'golden-madeleine': "玛德琳",
    'pistachio-biscuit': "开心果夹心饼",
    'cream-puff': "奶油泡芙",
    'lemon-cheesecake': "柠檬芝士蛋糕",
    'dark-chocolate-bar': "黑巧克力",
});

const DESSERT_ITEM_COLORS: Readonly<Record<string, DesktopCleanupRgb>> = Object.freeze({
    'strawberry-doughnut': [239, 134, 155],
    'butter-croissant': [224, 153, 70],
    'strawberry-shortcake': [240, 215, 185],
    'mint-macaron': [136, 206, 157],
    'caramel-flan': [226, 173, 93],
    'egg-tart': [243, 191, 70],
    'chocolate-cookie': [193, 140, 81],
    'golden-waffle': [220, 159, 72],
    'chocolate-eclair': [113, 64, 42],
    'pink-meringue': [238, 160, 172],
    'cinnamon-roll': [195, 138, 89],
    'chocolate-swiss-roll': [120, 78, 56],
    'strawberry-popsicle': [236, 153, 162],
    'golden-star-cookie': [244, 191, 59],
    'berry-cupcake': [232, 196, 168],
    'golden-madeleine': [223, 160, 81],
    'pistachio-biscuit': [179, 195, 118],
    'cream-puff': [228, 184, 122],
    'lemon-cheesecake': [243, 221, 137],
    'dark-chocolate-bar': [105, 65, 47],
});

// The atlas gives every dessert the same square cell. These scales restore
// the size contrast between small sweets and full-size pastries or cake slices.
const DESSERT_ITEM_SIZE_MULTIPLIERS = Object.freeze({
    'strawberry-doughnut': 1.13,
    'butter-croissant': 1.34,
    'strawberry-shortcake': 1.38,
    'mint-macaron': 0.71,
    'caramel-flan': 1.07,
    'egg-tart': 0.87,
    'chocolate-cookie': 0.82,
    'golden-waffle': 1.37,
    'chocolate-eclair': 1.17,
    'pink-meringue': 0.65,
    'cinnamon-roll': 1.12,
    'chocolate-swiss-roll': 1.13,
    'strawberry-popsicle': 1.28,
    'golden-star-cookie': 0.76,
    'berry-cupcake': 1.21,
    'golden-madeleine': 0.74,
    'pistachio-biscuit': 0.90,
    'cream-puff': 0.97,
    'lemon-cheesecake': 1.35,
    'dark-chocolate-bar': 1.24,
});

const DESSERT_THEME: DesktopCleanupThemeDefinition = Object.freeze({
    id: 'dessert-workbench',
    name: '甜点工作台',
    targetType: 'golden-star-cookie',
    targetLabel: '金色星星饼干',
    itemTypes: DESKTOP_CLEANUP_DESSERT_ITEM_TYPES,
    itemAtlasPath: 'visual/items/desktop-cleanup-dessert-atlas-v1/texture',
    itemAtlasColumns: 4,
    itemAtlasRows: 5,
    itemLabels: DESSERT_ITEM_LABELS,
    itemColors: DESSERT_ITEM_COLORS,
    itemSizeMultipliers: DESSERT_ITEM_SIZE_MULTIPLIERS,
    logoItemTypes: ['strawberry-shortcake', 'golden-star-cookie', 'mint-macaron'] as const,
});

const CONVENIENCE_ITEM_LABELS = Object.freeze({
    'blue-milk-carton': '盒装牛奶',
    'red-chips-bag': '薯片',
    'lime-soda-can': '青柠汽水',
    'seaweed-rice-ball': '海苔饭团',
    'orange-noodle-cup': '杯装泡面',
    'orange-juice-bottle': '橙汁',
    'blueberry-yogurt-cup': '蓝莓酸奶',
    'cheese-sandwich-pack': '芝士三明治',
    'teal-tuna-can': '金枪鱼罐头',
    'sausage-twin-pack': '双支香肠',
    'green-mint-tin': '薄荷糖',
    'pink-tissue-pack': '纸巾',
    'blue-water-bottle': '矿泉水',
    'golden-shopping-basket': '金色购物篮',
    'blue-biscuit-box': '苏打饼干',
    'strawberry-jelly-cup': '草莓果冻',
    'yellow-cereal-box': '早餐麦片',
    'turquoise-gummy-pouch': '小熊软糖',
    'cream-coffee-cup': '外带咖啡',
    'wrapped-bread-loaf': '袋装吐司',
});

const CONVENIENCE_ITEM_COLORS: Readonly<Record<string, DesktopCleanupRgb>> = Object.freeze({
    'blue-milk-carton': [50, 145, 225],
    'red-chips-bag': [238, 56, 47],
    'lime-soda-can': [105, 195, 37],
    'seaweed-rice-ball': [239, 231, 207],
    'orange-noodle-cup': [244, 146, 32],
    'orange-juice-bottle': [247, 163, 43],
    'blueberry-yogurt-cup': [171, 129, 219],
    'cheese-sandwich-pack': [56, 175, 172],
    'teal-tuna-can': [52, 151, 164],
    'sausage-twin-pack': [193, 86, 53],
    'green-mint-tin': [102, 192, 143],
    'pink-tissue-pack': [238, 139, 176],
    'blue-water-bottle': [115, 190, 232],
    'golden-shopping-basket': [248, 189, 35],
    'blue-biscuit-box': [45, 107, 205],
    'strawberry-jelly-cup': [226, 65, 94],
    'yellow-cereal-box': [240, 182, 35],
    'turquoise-gummy-pouch': [33, 189, 189],
    'cream-coffee-cup': [225, 201, 166],
    'wrapped-bread-loaf': [216, 146, 69],
});

// Packaging sizes vary deliberately: pocket mints stay small beside family packs.
const CONVENIENCE_ITEM_SIZE_MULTIPLIERS = Object.freeze({
    'blue-milk-carton': 1.16,
    'red-chips-bag': 1.31,
    'lime-soda-can': 0.92,
    'seaweed-rice-ball': 0.84,
    'orange-noodle-cup': 1.19,
    'orange-juice-bottle': 1.08,
    'blueberry-yogurt-cup': 0.84,
    'cheese-sandwich-pack': 1.16,
    'teal-tuna-can': 0.76,
    'sausage-twin-pack': 1.04,
    'green-mint-tin': 0.65,
    'pink-tissue-pack': 0.93,
    'blue-water-bottle': 1.16,
    'golden-shopping-basket': 1.00,
    'blue-biscuit-box': 1.11,
    'strawberry-jelly-cup': 0.79,
    'yellow-cereal-box': 1.38,
    'turquoise-gummy-pouch': 1.00,
    'cream-coffee-cup': 1.04,
    'wrapped-bread-loaf': 1.32,
});

const CONVENIENCE_THEME: DesktopCleanupThemeDefinition = Object.freeze({
    id: 'convenience-store',
    name: '迷你便利店',
    targetType: 'golden-shopping-basket',
    targetLabel: '金色购物篮',
    itemTypes: DESKTOP_CLEANUP_CONVENIENCE_ITEM_TYPES,
    itemAtlasPath: 'visual/items/desktop-cleanup-convenience-atlas-v1/texture',
    itemAtlasColumns: 4,
    itemAtlasRows: 5,
    itemLabels: CONVENIENCE_ITEM_LABELS,
    itemColors: CONVENIENCE_ITEM_COLORS,
    itemSizeMultipliers: CONVENIENCE_ITEM_SIZE_MULTIPLIERS,
    logoItemTypes: ['blue-milk-carton', 'golden-shopping-basket', 'red-chips-bag'] as const,
});

const FRUIT_ITEM_LABELS = Object.freeze({
    'red-apple': '红苹果',
    'ripe-strawberry': '草莓',
    'banana-bunch': '香蕉',
    'purple-grape-bunch': '紫葡萄',
    'watermelon-wedge': '西瓜块',
    'golden-pineapple': '菠萝',
    'green-pear': '青梨',
    'fresh-orange': '橙子',
    'yellow-lemon': '柠檬',
    'pink-peach': '蜜桃',
    'kiwi-half': '猕猴桃',
    'dragon-fruit-half': '火龙果',
    'purple-mangosteen': '山竹',
    'golden-starfruit': '金色杨桃',
    'sunset-mango': '芒果',
    'coconut-half': '椰子',
    'cherry-pair': '樱桃',
    'blueberry-cluster': '蓝莓',
    'avocado-half': '牛油果',
    'fig-half': '无花果',
});

const FRUIT_ITEM_COLORS: Readonly<Record<string, DesktopCleanupRgb>> = Object.freeze({
    'red-apple': [216, 55, 60],
    'ripe-strawberry': [233, 66, 79],
    'banana-bunch': [246, 205, 64],
    'purple-grape-bunch': [124, 76, 165],
    'watermelon-wedge': [236, 98, 91],
    'golden-pineapple': [223, 160, 49],
    'green-pear': [166, 190, 66],
    'fresh-orange': [242, 148, 35],
    'yellow-lemon': [241, 208, 62],
    'pink-peach': [238, 147, 150],
    'kiwi-half': [146, 180, 66],
    'dragon-fruit-half': [220, 77, 137],
    'purple-mangosteen': [105, 61, 109],
    'golden-starfruit': [244, 190, 44],
    'sunset-mango': [243, 175, 49],
    'coconut-half': [145, 98, 63],
    'cherry-pair': [187, 41, 55],
    'blueberry-cluster': [80, 102, 163],
    'avocado-half': [151, 172, 75],
    'fig-half': [156, 75, 112],
});

// Small berries sit beside generous fruit wedges without losing their silhouettes.
const FRUIT_ITEM_SIZE_MULTIPLIERS = Object.freeze({
    'red-apple': 1.10,
    'ripe-strawberry': 0.82,
    'banana-bunch': 1.25,
    'purple-grape-bunch': 1.13,
    'watermelon-wedge': 1.38,
    'golden-pineapple': 1.36,
    'green-pear': 1.13,
    'fresh-orange': 1.02,
    'yellow-lemon': 0.90,
    'pink-peach': 1.09,
    'kiwi-half': 0.79,
    'dragon-fruit-half': 1.21,
    'purple-mangosteen': 0.88,
    'golden-starfruit': 0.95,
    'sunset-mango': 1.16,
    'coconut-half': 1.33,
    'cherry-pair': 0.74,
    'blueberry-cluster': 0.65,
    'avocado-half': 1.17,
    'fig-half': 0.86,
});

const FRUIT_THEME: DesktopCleanupThemeDefinition = Object.freeze({
    id: 'fruit-stall',
    name: '缤纷水果摊',
    targetType: 'golden-starfruit',
    targetLabel: '金色杨桃',
    itemTypes: DESKTOP_CLEANUP_FRUIT_ITEM_TYPES,
    itemAtlasPath: 'visual/items/desktop-cleanup-fruit-atlas-v1/texture',
    itemAtlasColumns: 4,
    itemAtlasRows: 5,
    itemLabels: FRUIT_ITEM_LABELS,
    itemColors: FRUIT_ITEM_COLORS,
    itemSizeMultipliers: FRUIT_ITEM_SIZE_MULTIPLIERS,
    logoItemTypes: ['ripe-strawberry', 'golden-starfruit', 'banana-bunch'] as const,
});

export const DESKTOP_CLEANUP_THEME_CATALOG: Readonly<Record<DesktopCleanupThemeId, DesktopCleanupThemeDefinition>> = Object.freeze({
    'soft-clay-workbench': WORKBENCH_THEME,
    'dessert-workbench': DESSERT_THEME,
    'convenience-store': CONVENIENCE_THEME,
    'fruit-stall': FRUIT_THEME,
});

export const DEFAULT_DESKTOP_CLEANUP_THEME_ID: DesktopCleanupThemeId = 'soft-clay-workbench';
export const DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION: DesktopCleanupThemeSelection = 'random';

export function parseDesktopCleanupThemeId(value: unknown): DesktopCleanupThemeId {
    return DESKTOP_CLEANUP_THEME_IDS.find((id) => id === value) ?? DEFAULT_DESKTOP_CLEANUP_THEME_ID;
}

export function parseDesktopCleanupThemeSelection(value: unknown): DesktopCleanupThemeSelection {
    if (value === 'random') return 'random';
    return DESKTOP_CLEANUP_THEME_IDS.find((id) => id === value) ?? DEFAULT_DESKTOP_CLEANUP_THEME_SELECTION;
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
