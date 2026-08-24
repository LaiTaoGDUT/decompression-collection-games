import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Camera,
    Canvas,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    input,
    Input,
    JsonAsset,
    KeyCode,
    Label,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
    view,
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import { AD_PLACEMENTS, type AdService } from '../../../services/ads/AdService';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { AccelerometerSample, Platform } from '../../../platform/Platform';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    attachRewardedVideoIcon,
    layoutRewardedVideoIconBeforeLabel,
    loadRewardedVideoIcon,
} from '../../../shared/ui/RewardedVideoIcon';
import {
    DEFAULT_DESKTOP_CLEANUP_CONFIG,
    parseDesktopCleanupGameplayConfig,
    type DesktopCleanupGameplayConfig,
} from './DesktopCleanupConfig';
import {
    DESKTOP_CLEANUP_ITEM_TYPES,
    DesktopCleanupModel,
    compareDesktopCleanupItems,
    desktopCleanupDateKey,
    runDesktopCleanupLayoutSelfCheck,
    type DesktopCleanupActionResult,
    type DesktopCleanupItemSnapshot,
    type DesktopCleanupItemType,
    type DesktopCleanupPendingSelection,
    type DesktopCleanupShakeInput,
    type DesktopCleanupTool,
} from './DesktopCleanupModel';
import {
    readDesktopCleanupLayout,
    type DesktopCleanupLayoutMetrics,
} from './DesktopCleanupLayout';
import {
    DESKTOP_CLEANUP_RULES_VERSION,
    readDesktopCleanupSave,
    writeDesktopCleanupSave,
    type DesktopCleanupSave,
} from './DesktopCleanupSave';

const { ccclass } = _decorator;

const BUNDLE = 'game-catch';
const BACKGROUND_PATH = 'visual/backgrounds/desktop-cleanup-backdrop-v2/texture';
const PLAYMAT_PATH = 'visual/backgrounds/desktop-cleanup-playmat-v2/texture';
const ITEM_ATLAS_PATH = 'visual/items/desktop-cleanup-items-atlas-v2/texture';
const PICKUP_ANIMATION_WATCHDOG_SECONDS = 0.82;
const SHAKE_GESTURE_MIN_DISTANCE = 72;
const ACCELEROMETER_SHAKE_THRESHOLD = 0.18;
const ACCELEROMETER_SHAKE_COOLDOWN_MS = 110;
const THEME_TEXTURE_PATHS = Object.freeze({
    playmat: PLAYMAT_PATH,
    help: 'visual/ui/desktop-cleanup-hud-help-v2/texture',
    pause: 'visual/ui/desktop-cleanup-hud-pause-v2/texture',
    title: 'visual/ui/desktop-cleanup-title-emblem-v2/texture',
    timer: 'visual/ui/desktop-cleanup-timer-plate-v2/texture',
    tray: 'visual/ui/desktop-cleanup-slot-tray-7-v2/texture',
    return: 'visual/ui/desktop-cleanup-tool-return-v2/texture',
    magnet: 'visual/ui/desktop-cleanup-tool-magnet-v2/texture',
    shuffle: 'visual/ui/desktop-cleanup-tool-shuffle-v2/texture',
    popupPanel: 'visual/ui/desktop-cleanup-popup-panel-v1/texture',
    popupButtonTeal: 'visual/ui/desktop-cleanup-popup-button-teal-v1/texture',
    popupButtonCoral: 'visual/ui/desktop-cleanup-popup-button-coral-v1/texture',
    popupButtonPaper: 'visual/ui/desktop-cleanup-popup-button-paper-v1/texture',
    smoke: 'visual/vfx/desktop-cleanup-match-smoke-v1/texture',
} as const);
type ThemeFrameKey = keyof typeof THEME_TEXTURE_PATHS;
const THEME_FRAME_KEYS: readonly ThemeFrameKey[] = Object.freeze([
    'playmat',
    'help',
    'pause',
    'title',
    'timer',
    'tray',
    'return',
    'magnet',
    'shuffle',
    'popupPanel',
    'popupButtonTeal',
    'popupButtonCoral',
    'popupButtonPaper',
    'smoke',
]);
const POPUP_BUTTON_FRAME_RECTS: Readonly<Partial<Record<ThemeFrameKey, Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
}>>>> = Object.freeze({
    // Tight alpha crop (threshold 8) removes transparent padding that would
    // otherwise make equal-size sliced buttons render at different sizes.
    popupButtonTeal: Object.freeze({ x: 85, y: 128, width: 1916, height: 490 }),
    popupButtonCoral: Object.freeze({ x: 147, y: 131, width: 1878, height: 451 }),
    popupButtonPaper: Object.freeze({ x: 108, y: 80, width: 1956, height: 543 }),
});
const POPUP_BUTTON_HORIZONTAL_INSET_RATIO = 0.2;
const ITEM_LABELS: Readonly<Record<DesktopCleanupItemType, string>> = Object.freeze({
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
});

const ITEM_COLORS: Readonly<Record<DesktopCleanupItemType, Color>> = Object.freeze({
    'blue-pen': new Color(76, 139, 194, 255),
    'red-pencil': new Color(222, 103, 89, 255),
    'yellow-eraser': new Color(238, 190, 77, 255),
    'mint-notes': new Color(111, 191, 167, 255),
    'binder-clip': new Color(54, 65, 84, 255),
    'orange-tape': new Color(229, 136, 71, 255),
    'teal-usb': new Color(67, 160, 164, 255),
    'cream-earbuds': new Color(240, 223, 187, 255),
    'coral-keycap': new Color(229, 119, 114, 255),
    'purple-stress-ball': new Color(151, 115, 174, 255),
    'round-coaster': new Color(167, 116, 77, 255),
    'spiral-notebook': new Color(95, 124, 155, 255),
    'clear-ruler': new Color(141, 200, 201, 255),
    'lucky-badge': new Color(241, 184, 50, 255),
});

interface ItemHitPolygonPoint {
    readonly x: number;
    readonly y: number;
}

type ItemHitPolygonVertex = readonly [number, number];
type ItemHitPolygon = readonly ItemHitPolygonPoint[];

interface ItemHitPolygonShape {
    readonly outer: ItemHitPolygon;
}

function defineHitPolygon(points: readonly ItemHitPolygonVertex[]): ItemHitPolygon {
    return Object.freeze(points.map(([x, y]) => Object.freeze({
        x: x / ITEM_ATLAS_CELL_SIZE,
        y: y / ITEM_ATLAS_CELL_SIZE,
    })));
}

const ITEM_ATLAS_CELL_SIZE = 384;
const ITEM_HIT_POLYGONS: Readonly<Record<DesktopCleanupItemType, ItemHitPolygonShape>> = Object.freeze({
// BEGIN GENERATED DESKTOP CLEANUP HIT POLYGONS
// Generated from atlas Alpha >= 176; RDP epsilon: 1.2 source px.
    'blue-pen': Object.freeze({ outer: defineHitPolygon([
        [183, 252], [176, 264], [174, 264], [168, 273], [156, 284], [154, 290], [142, 303], [137, 305],
        [129, 304], [126, 308], [104, 323], [97, 323], [87, 334], [76, 339], [68, 338], [65, 335],
        [63, 324], [64, 319], [71, 308], [71, 297], [79, 274], [76, 266], [77, 257], [86, 243],
        [91, 240], [95, 230], [119, 195], [160, 142], [160, 136], [163, 130], [171, 120], [176, 118],
        [179, 109], [182, 107], [184, 102], [187, 100], [189, 95], [192, 93], [194, 88], [200, 82],
        [202, 77], [205, 75], [207, 70], [213, 64], [233, 35], [238, 31], [249, 27], [264, 28],
        [279, 33], [294, 42], [304, 53], [306, 67], [314, 73], [317, 79], [317, 92], [314, 100],
        [299, 127], [266, 177], [260, 182], [252, 183], [247, 181], [243, 176], [235, 188], [227, 191],
        [226, 195], [217, 208], [213, 211], [206, 224], [203, 225], [196, 237], [192, 240], [191, 244],
    ]) }),
    'red-pencil': Object.freeze({ outer: defineHitPolygon([
        [160, 119], [163, 117], [163, 113], [167, 106], [173, 101], [178, 90], [183, 87], [186, 79],
        [192, 72], [196, 71], [198, 64], [211, 46], [220, 37], [228, 32], [246, 27], [255, 27],
        [271, 31], [287, 40], [300, 52], [307, 62], [312, 74], [312, 96], [300, 118], [287, 133],
        [284, 143], [281, 145], [280, 149], [276, 151], [272, 161], [266, 166], [260, 178], [253, 182],
        [249, 187], [248, 191], [244, 194], [243, 198], [239, 201], [238, 205], [229, 215], [222, 228],
        [212, 239], [211, 243], [207, 246], [206, 250], [202, 253], [196, 264], [192, 267], [181, 284],
        [173, 292], [160, 299], [158, 303], [153, 304], [153, 306], [147, 308], [142, 313], [139, 313],
        [126, 323], [118, 326], [116, 329], [112, 329], [109, 333], [102, 336], [89, 346], [80, 350],
        [71, 349], [66, 340], [67, 320], [89, 219],
    ]) }),
    'yellow-eraser': Object.freeze({ outer: defineHitPolygon([
        [49, 270], [37, 253], [33, 235], [34, 222], [40, 206], [54, 191], [54, 189], [64, 180],
        [67, 165], [95, 137], [95, 135], [153, 76], [160, 72], [166, 72], [187, 50], [189, 50],
        [196, 43], [211, 36], [230, 36], [244, 40], [286, 64], [303, 80], [310, 93], [313, 104],
        [312, 130], [303, 150], [300, 152], [291, 167], [288, 168], [282, 176], [280, 176], [275, 195],
        [260, 207], [256, 218], [246, 223], [240, 229], [236, 239], [230, 243], [212, 263], [207, 265],
        [194, 281], [180, 284], [174, 296], [168, 301], [160, 304], [154, 312], [144, 316], [119, 314],
        [77, 291], [68, 283], [60, 280], [53, 272],
    ]) }),
    'mint-notes': Object.freeze({ outer: defineHitPolygon([
        [107, 95], [107, 93], [118, 83], [125, 73], [134, 66], [134, 64], [148, 49], [150, 49],
        [155, 43], [166, 42], [224, 71], [227, 71], [258, 88], [264, 89], [275, 96], [305, 109],
        [306, 111], [315, 115], [319, 120], [319, 162], [315, 172], [298, 198], [296, 198], [296, 200],
        [290, 205], [286, 216], [277, 224], [271, 232], [268, 240], [252, 258], [245, 273], [233, 284],
        [228, 295], [211, 312], [201, 312], [196, 310], [194, 307], [186, 304], [185, 302], [158, 290],
        [156, 287], [145, 282], [144, 280], [133, 276], [111, 262], [83, 249], [75, 242], [62, 237],
        [58, 233], [44, 226], [38, 219], [34, 184], [34, 177], [36, 173], [68, 138], [68, 136],
        [79, 126], [84, 118],
    ]) }),
    'binder-clip': Object.freeze({ outer: defineHitPolygon([
        [296, 129], [301, 141], [334, 157], [339, 162], [357, 223], [357, 235], [353, 244], [346, 251],
        [325, 265], [311, 277], [306, 279], [296, 288], [291, 290], [277, 302], [272, 304], [266, 310],
        [261, 312], [253, 323], [244, 330], [235, 331], [229, 329], [228, 327], [182, 304], [177, 299],
        [175, 289], [168, 293], [160, 293], [144, 285], [143, 283], [102, 262], [96, 254], [95, 245],
        [88, 250], [77, 249], [35, 226], [31, 223], [27, 215], [27, 203], [34, 185], [43, 175],
        [47, 173], [57, 174], [112, 65], [124, 53], [136, 53], [169, 71], [176, 67], [188, 69],
        [199, 77], [202, 82], [203, 89], [209, 91], [210, 93], [236, 105], [237, 107], [259, 117],
        [262, 120], [267, 121], [270, 119], [282, 119], [292, 124],
    ]) }),
    'orange-tape': Object.freeze({ outer: defineHitPolygon([
        [323, 146], [322, 162], [318, 180], [310, 202], [302, 218], [292, 232], [292, 241], [288, 252],
        [272, 270], [267, 271], [260, 277], [255, 278], [250, 283], [239, 287], [234, 287], [226, 291],
        [221, 291], [214, 295], [209, 295], [199, 301], [191, 303], [186, 310], [173, 319], [171, 323],
        [154, 334], [146, 336], [140, 340], [125, 340], [115, 335], [113, 332], [105, 329], [95, 320],
        [61, 298], [55, 292], [54, 283], [57, 279], [77, 273], [87, 268], [102, 254], [107, 244],
        [107, 237], [101, 233], [89, 219], [83, 207], [78, 189], [78, 152], [87, 119], [101, 92],
        [115, 73], [133, 55], [154, 40], [180, 29], [191, 27], [208, 27], [230, 33], [277, 59],
        [297, 74], [314, 95], [322, 119],
    ]) }),
    'teal-usb': Object.freeze({ outer: defineHitPolygon([
        [161, 84], [201, 44], [213, 35], [231, 29], [253, 31], [277, 42], [293, 52], [314, 72],
        [319, 82], [322, 95], [323, 110], [320, 135], [309, 160], [299, 167], [297, 176], [290, 183],
        [290, 187], [286, 190], [284, 195], [274, 199], [262, 215], [255, 219], [254, 222], [250, 223],
        [240, 236], [236, 237], [210, 265], [204, 268], [197, 275], [195, 280], [186, 282], [180, 287],
        [154, 291], [149, 296], [142, 298], [136, 305], [125, 309], [122, 314], [119, 314], [116, 318],
        [110, 320], [109, 323], [96, 324], [83, 317], [80, 313], [75, 311], [72, 306], [69, 306],
        [68, 303], [52, 294], [48, 289], [30, 277], [27, 267], [27, 254], [74, 207], [72, 185],
        [73, 180], [79, 170],
    ]) }),
    'cream-earbuds': Object.freeze({ outer: defineHitPolygon([
        [246, 290], [236, 306], [230, 309], [225, 315], [205, 322], [183, 321], [158, 313], [154, 309],
        [141, 305], [134, 300], [123, 298], [119, 294], [108, 291], [102, 286], [85, 279], [70, 269],
        [56, 252], [50, 234], [50, 214], [54, 198], [71, 163], [76, 157], [88, 134], [88, 131],
        [90, 130], [92, 124], [96, 121], [101, 109], [104, 107], [106, 102], [124, 86], [132, 82],
        [148, 78], [166, 79], [183, 84], [260, 117], [274, 126], [291, 147], [297, 168], [297, 185],
        [294, 207], [285, 224], [280, 229], [276, 243], [263, 261], [257, 278],
    ]) }),
    'coral-keycap': Object.freeze({ outer: defineHitPolygon([
        [121, 268], [100, 260], [95, 256], [73, 246], [67, 238], [66, 225], [70, 214], [72, 213],
        [72, 210], [96, 164], [111, 146], [117, 135], [125, 127], [141, 103], [154, 89], [154, 87],
        [168, 79], [185, 80], [263, 115], [278, 134], [284, 148], [286, 149], [296, 168], [297, 185],
        [293, 196], [288, 200], [280, 217], [267, 234], [263, 246], [251, 258], [244, 275], [234, 285],
        [229, 296], [216, 303], [201, 303], [185, 298], [171, 290], [164, 288], [161, 285], [150, 282],
    ]) }),
    'purple-stress-ball': Object.freeze({ outer: defineHitPolygon([
        [223, 288], [195, 290], [185, 287], [178, 287], [141, 269], [122, 252], [109, 234], [99, 211],
        [95, 191], [96, 162], [103, 138], [110, 123], [126, 101], [141, 87], [170, 70], [192, 63],
        [213, 60], [231, 61], [249, 65], [267, 73], [286, 87], [300, 103], [307, 114], [318, 141],
        [322, 163], [321, 184], [317, 204], [302, 238], [298, 240], [287, 255], [283, 256], [267, 271],
        [246, 282], [243, 282], [242, 284], [229, 288],
    ]) }),
    'round-coaster': Object.freeze({ outer: defineHitPolygon([
        [204, 293], [187, 294], [153, 290], [118, 273], [103, 259], [101, 259], [101, 257], [96, 253],
        [85, 238], [75, 215], [71, 194], [71, 167], [75, 148], [86, 123], [99, 105], [117, 88],
        [134, 77], [157, 67], [186, 61], [213, 61], [234, 65], [252, 71], [278, 87], [292, 101],
        [301, 116], [304, 118], [313, 141], [317, 162], [317, 191], [313, 207], [304, 227], [302, 236],
        [291, 245], [288, 253], [274, 263], [273, 266], [266, 272], [255, 276], [253, 279], [250, 279],
        [249, 281], [235, 288], [220, 292],
    ]) }),
    'spiral-notebook': Object.freeze({ outer: defineHitPolygon([
        [40, 203], [41, 193], [47, 186], [64, 182], [58, 170], [58, 161], [65, 151], [73, 148],
        [80, 148], [75, 134], [78, 123], [86, 116], [99, 114], [94, 105], [94, 93], [102, 83],
        [116, 80], [112, 71], [114, 58], [123, 50], [140, 49], [147, 36], [155, 30], [175, 30],
        [265, 68], [280, 68], [289, 72], [294, 80], [305, 84], [312, 92], [313, 121], [317, 127],
        [317, 139], [312, 157], [307, 167], [300, 174], [291, 198], [280, 211], [275, 226], [261, 246],
        [257, 259], [251, 265], [247, 274], [243, 278], [237, 295], [232, 299], [219, 324], [211, 329],
        [196, 331], [178, 325], [173, 325], [164, 321], [152, 312], [138, 308], [131, 302], [106, 294],
        [87, 283], [67, 277], [62, 272], [53, 268], [48, 262], [45, 254], [45, 243], [50, 230],
        [50, 219], [41, 207],
    ]) }),
    'clear-ruler': Object.freeze({ outer: defineHitPolygon([
        [127, 171], [293, 35], [300, 32], [310, 31], [322, 35], [329, 42], [336, 66], [336, 84],
        [332, 138], [330, 142], [328, 174], [329, 186], [326, 196], [322, 265], [319, 275], [319, 290],
        [315, 307], [313, 313], [303, 323], [290, 327], [263, 325], [204, 315], [179, 313], [163, 309],
        [143, 308], [128, 304], [108, 303], [94, 299], [73, 298], [65, 295], [46, 293], [36, 288],
        [30, 281], [27, 272], [28, 257], [33, 248],
    ]) }),
    'lucky-badge': Object.freeze({ outer: defineHitPolygon([
        [289, 233], [288, 235], [280, 237], [276, 245], [262, 256], [263, 268], [266, 273], [268, 288],
        [272, 296], [271, 310], [265, 315], [246, 307], [236, 305], [229, 307], [218, 320], [212, 322],
        [206, 321], [202, 315], [193, 274], [188, 270], [178, 270], [174, 272], [159, 294], [156, 302],
        [152, 305], [145, 304], [140, 298], [136, 289], [131, 284], [110, 283], [90, 285], [86, 280],
        [87, 272], [117, 224], [117, 220], [112, 215], [104, 198], [97, 167], [98, 145], [104, 123],
        [109, 114], [109, 105], [118, 99], [125, 87], [139, 74], [158, 61], [174, 54], [192, 49],
        [212, 48], [218, 43], [226, 43], [232, 50], [254, 56], [274, 67], [295, 87], [308, 107],
        [316, 130], [319, 149], [317, 176], [310, 200], [302, 215], [296, 220], [292, 232],
    ]) }),
});
// END GENERATED DESKTOP CLEANUP HIT POLYGONS

function isPointInsideHitPolygon(point: ItemHitPolygonPoint, polygon: ItemHitPolygon): boolean {
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
        const current = polygon[index];
        const previous = polygon[previousIndex];
        const crossesScanline = (current.y > point.y) !== (previous.y > point.y);
        if (!crossesScanline) continue;
        const xAtScanline = (previous.x - current.x) * (point.y - current.y)
            / (previous.y - current.y) + current.x;
        if (point.x < xAtScanline) inside = !inside;
    }
    return inside;
}

function isPointInsideHitShape(point: ItemHitPolygonPoint, shape: ItemHitPolygonShape): boolean {
    return isPointInsideHitPolygon(point, shape.outer);
}

const TOOL_TITLES: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '归位夹',
    magnet: '磁吸盒',
    shuffle: '桌面风暴',
});

const TOOL_DESCRIPTIONS: Readonly<Record<DesktopCleanupTool, string>> = Object.freeze({
    return: '把收纳槽中最近放入的最多 3 件物品送回桌面，适合在槽位快满时腾出空间。',
    magnet: '自动寻找最容易凑齐的一类物品，并直接完成一组三件收纳。',
    shuffle: '将桌面上仍未收纳的物品重新压叠成一座紧凑物件堆，并改变露出顺序。',
});

const COLORS = Object.freeze({
    ink: new Color(39, 48, 69, 255),
    inkSoft: new Color(65, 77, 103, 255),
    cream: new Color(248, 232, 199, 255),
    paper: new Color(255, 248, 229, 255),
    desk: new Color(135, 90, 62, 255),
    deskDark: new Color(78, 51, 44, 255),
    coral: new Color(235, 119, 100, 255),
    teal: new Color(86, 177, 166, 255),
    mustard: new Color(232, 180, 69, 255),
    lilac: new Color(155, 126, 176, 255),
    overlay: new Color(28, 30, 42, 210),
    muted: new Color(112, 105, 101, 255),
    white: new Color(255, 253, 244, 255),
});

type GameState = 'idle' | 'ready' | 'rules' | 'tool-help' | 'playing' | 'paused' | 'failed' | 'completed' | 'disposed';

export interface DesktopCleanupServices {
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
    readonly ads: AdService;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'coral' | 'teal' | 'paper' | 'mustard';
    readonly action: () => void | Promise<void>;
    readonly adIcon?: boolean;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: readonly Button[];
    busy: boolean;
}

interface PendingPileTap {
    readonly touchId: number;
    readonly itemId?: string;
    readonly type?: DesktopCleanupItemType;
    readonly node?: Node;
}

interface BoardTouchTrace {
    readonly touchId: number;
    readonly start: Vec2;
    last: Vec2;
    shakeTriggered: boolean;
}

interface DesktopCleanupMatchAnimation {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
    readonly root: Node;
    readonly leftNode: Node;
    readonly middleNode: Node;
    readonly rightNode: Node;
    smoke?: Node;
}

interface DesktopCleanupPickupAnimation {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
    readonly node: Node;
}

interface DesktopCleanupPendingMatch {
    readonly selection: DesktopCleanupPendingSelection;
    readonly generation: number;
}

interface DesktopCleanupSlotMove {
    readonly node: Node;
}

@ccclass('DesktopCleanupGame')
export class DesktopCleanupGame extends Component implements MiniGame<DesktopCleanupServices> {
    private state: GameState = 'idle';
    private stateBeforePause: GameState = 'playing';
    private context?: MiniGameContext<DesktopCleanupServices>;
    private config: DesktopCleanupGameplayConfig = DEFAULT_DESKTOP_CLEANUP_CONFIG;
    private model?: DesktopCleanupModel;
    private save: DesktopCleanupSave = Object.freeze({
        playCount: 0,
        highScore: 0,
        wins: 0,
        rulesSeenVersion: 0,
    });
    private roundStartedAt = 0;
    private layout?: DesktopCleanupLayoutMetrics;
    private pileRoot?: Node;
    private slotRoot?: Node;
    private pickupRoot?: Node;
    private timerLabel?: Label;
    private headerLogoRoot?: Node;
    private hintRoot?: Node;
    private hintLabel?: Label;
    private pileItemNodes = new Map<string, Node>();
    private slotItemNodes = new Map<string, Node>();
    private readonly slotMoveTokens = new Map<string, DesktopCleanupSlotMove>();
    private toolButtons = new Map<DesktopCleanupTool, Button>();
    private pauseButton?: Button;
    private helpButton?: Button;
    private rulesOverlay?: OverlayState;
    private toolHelpOverlay?: OverlayState;
    private activeToolHelp?: DesktopCleanupTool;
    private failureOverlay?: OverlayState;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private pauseModel?: MiniGamePauseModel;
    private resultModel?: MiniGameResultModel;
    private backgroundFrame?: SpriteFrame;
    private readonly themeFrames = new Map<ThemeFrameKey, SpriteFrame>();
    private readonly popupButtonFrames = new Set<SpriteFrame>();
    private itemAtlasTexture?: Texture2D;
    private itemFrames = new Map<DesktopCleanupItemType, SpriteFrame>();
    private resizeListening = false;
    private inputLocked = false;
    private rulesFirstTime = false;
    private adBusy = false;
    private terminalPending = false;
    private operationGeneration = 0;
    private readonly pickupAnimations = new Map<number, DesktopCleanupPickupAnimation>();
    private readonly matchAnimations = new Map<number, DesktopCleanupMatchAnimation>();
    private readonly pendingMatchSelections = new Map<number, DesktopCleanupPendingMatch>();
    private readonly destroyedNodes = new WeakSet<Node>();
    private rendering = false;
    private renderQueued = false;
    private readonly pendingPileTaps = new Map<number, PendingPileTap>();
    private readonly boardTouchTraces = new Map<number, BoardTouchTrace>();
    private readonly renderedItemFree = new Map<string, boolean>();
    private readonly revealPulseStartedAt = new Map<string, number>();
    private stopAccelerometer?: () => void;
    private lastAccelerometerSample?: AccelerometerSample;
    private lastAccelerometerShakeAt = 0;
    private rewardedVideoIconFrame?: SpriteFrame;
    private lastHudSecond = -1;
    private lastReportedScore?: number;

    protected onLoad(): void {
        // The scene is intentionally only a bootstrap container. Remove any
        // legacy serialized children before Cocos can render the first frame;
        // the current interface is built by initialize().
        this.node.children.slice().forEach((child) => this.destroyNode(child));
    }

    async initialize(context: MiniGameContext<DesktopCleanupServices>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize DesktopCleanupGame from ${this.state}.`);
        this.context = context;
        this.config = await this.loadGameplayConfig();
        const selfCheck = runDesktopCleanupLayoutSelfCheck(365);
        if (!selfCheck.valid) throw new Error(`Desktop cleanup self-check failed: ${selfCheck.errors.join('; ')}`);
        this.save = readDesktopCleanupSave(context.services.storage);
        this.buildInterface();
        this.registerGlobalInput();
        this.stopAccelerometer = context.services.platform.onAccelerometerChange(this.handleAccelerometerChange);
        await this.loadThemeAssets();
        this.rewardedVideoIconFrame = await loadRewardedVideoIcon();
        this.applyThemeAssets();
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin DesktopCleanupGame from ${this.state}.`);
        this.startRound();
    }

    protected update(deltaTime: number): void {
        if (this.state !== 'playing' || !this.model) return;
        const physicsChanged = this.model.tick(Math.max(0, deltaTime) * 1000);
        if (physicsChanged || this.revealPulseStartedAt.size > 0) this.syncPileTransforms();
        const second = Math.max(0, Math.ceil(this.model.remainingMs / 1000));
        if (second > 0 && second <= 30 && this.lastHudSecond > 30) {
            this.context?.services.feedback.play('danger');
        }
        if (second !== this.lastHudSecond) this.refreshHud();
        if (this.model.phase !== 'playing') this.syncTerminalPhase();
    }

    pause(): void {
        if (this.state === 'disposed' || this.state === 'idle' || this.state === 'ready') return;
        this.clearPendingPileTaps();
        this.settlePendingImmediately();
        this.stopDeviceMotion();
        if (this.state !== 'paused') this.stateBeforePause = this.state;
        this.state = 'paused';
        this.inputLocked = true;
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.stateBeforePause === 'paused' ? 'playing' : this.stateBeforePause;
        this.inputLocked = this.state !== 'playing';
        if (this.state === 'playing') this.startDeviceMotion();
    }

    async restart(context?: MiniGameContext<DesktopCleanupServices>): Promise<void> {
        if (this.state === 'disposed' || this.state === 'idle') {
            throw new Error(`Cannot restart DesktopCleanupGame from ${this.state}.`);
        }
        if (context) this.context = context;
        this.resetOperations();
        this.destroyAllOverlays();
        this.startRound();
    }

    discardSavedProgress(): void {
        // This game intentionally stores records only; no in-progress round is persisted.
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.operationGeneration += 1;
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotMoves();
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.stopAccelerometer?.();
        this.stopAccelerometer = undefined;
        this.unregisterGlobalInput();
        this.unscheduleAllCallbacks();
        this.destroyAllOverlays();
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        this.backgroundFrame?.destroy();
        this.backgroundFrame = undefined;
        this.themeFrames.forEach((frame) => frame.destroy());
        this.themeFrames.clear();
        this.popupButtonFrames.forEach((frame) => frame.destroy());
        this.popupButtonFrames.clear();
        this.rewardedVideoIconFrame?.destroy();
        this.rewardedVideoIconFrame = undefined;
        this.itemFrames.forEach((frame) => frame.destroy());
        this.itemFrames.clear();
        this.pileItemNodes.clear();
        this.slotItemNodes.clear();
        this.slotMoveTokens.clear();
        this.boardTouchTraces.clear();
        this.renderedItemFree.clear();
        this.revealPulseStartedAt.clear();
        this.lastAccelerometerSample = undefined;
        this.pickupRoot = undefined;
        this.itemAtlasTexture = undefined;
        this.model = undefined;
        this.context = undefined;
        this.lastReportedScore = undefined;
        this.state = 'disposed';
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.stopDeviceMotion();
        this.pauseModel = model;
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = this.buildOverlay(
            'DesktopPauseOverlay',
            '先歇一会儿',
            '倒计时已经暂停，回来后会从当前时间继续',
            [
                { name: 'ResumeButton', label: '继续整理', tone: 'teal', action: model.resume },
                { name: 'RestartButton', label: '重新开局', tone: 'mustard', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
        this.pauseModel = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.resultModel = model;
        this.stopDeviceMotion();
        this.state = 'completed';
        this.inputLocked = true;
        const extra = model.result.extra ?? {};
        const newRecord = extra.newRecord === true;
        const remaining = typeof extra.remainingSeconds === 'number'
            ? Math.max(0, Math.floor(extra.remainingSeconds))
            : 0;
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = this.buildOverlay(
            'DesktopResultOverlay',
            newRecord ? '最快清理！' : '桌面清爽啦',
            `剩余时间  ${remaining} 秒\n幸运徽章全部找回`,
            [
                { name: 'RestartButton', label: '再清一桌', tone: 'coral', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: model.returnToLobby },
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.resultModel = undefined;
    }

    private startRound(): void {
        const key = desktopCleanupDateKey();
        this.model = new DesktopCleanupModel(key, this.config);
        this.roundStartedAt = Date.now();
        this.save = Object.freeze({ ...this.save, playCount: this.save.playCount + 1 });
        this.persistSave();
        this.terminalPending = false;
        this.inputLocked = false;
        this.lastHudSecond = -1;
        this.lastReportedScore = 0;
        this.renderedItemFree.clear();
        this.revealPulseStartedAt.clear();
        this.lastAccelerometerSample = undefined;
        this.context?.reportScore(0);
        this.state = 'playing';
        this.startDeviceMotion();
        this.renderAll();
        this.setHint('');
        if (this.save.rulesSeenVersion < DESKTOP_CLEANUP_RULES_VERSION) {
            this.showRules(true);
        }
    }

    private resetOperations(): void {
        this.operationGeneration += 1;
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotMoves();
        this.adBusy = false;
        this.terminalPending = false;
        this.inputLocked = false;
        this.clearPendingPileTaps();
        this.stopDeviceMotion();
        this.unscheduleAllCallbacks();
    }

    private async loadGameplayConfig(): Promise<DesktopCleanupGameplayConfig> {
        const bundle = assetManager.getBundle(BUNDLE);
        if (!bundle) return DEFAULT_DESKTOP_CLEANUP_CONFIG;
        return new Promise((resolve) => {
            bundle.load('configs/gameplay', JsonAsset, (error, asset) => {
                if (error || !asset) {
                    console.warn('[DesktopCleanupGame] Gameplay config unavailable; using defaults.', error);
                    resolve(DEFAULT_DESKTOP_CLEANUP_CONFIG);
                    return;
                }
                resolve(parseDesktopCleanupGameplayConfig(asset.json));
            });
        });
    }

    private async loadThemeAssets(): Promise<void> {
        const [background, atlas, themeTextures] = await Promise.all([
            this.loadTexture(BACKGROUND_PATH),
            this.loadTexture(ITEM_ATLAS_PATH),
            Promise.all(THEME_FRAME_KEYS.map(async (key) => (
                [key, await this.loadTexture(THEME_TEXTURE_PATHS[key])] as const
            ))),
        ]);
        if (this.state === 'disposed' || !this.node.isValid) return;
        if (background) {
            this.backgroundFrame?.destroy();
            const frame = new SpriteFrame();
            frame.texture = background;
            this.backgroundFrame = frame;
        }
        if (atlas) this.sliceItemAtlas(atlas);
        themeTextures.forEach(([key, texture]) => {
            if (!texture) return;
            this.themeFrames.get(key)?.destroy();
            const frame = this.createThemeFrame(key, texture);
            this.themeFrames.set(key, frame);
        });
    }

    private loadTexture(path: string): Promise<Texture2D | undefined> {
        const bundle = assetManager.getBundle(BUNDLE);
        if (!bundle) return Promise.resolve(undefined);
        return new Promise((resolve) => {
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture) {
                    console.warn(`[DesktopCleanupGame] Theme asset unavailable: ${path}`, error);
                    resolve(undefined);
                    return;
                }
                resolve(texture);
            });
        });
    }

    private createThemeFrame(key: ThemeFrameKey, texture: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        const crop = POPUP_BUTTON_FRAME_RECTS[key];
        if (crop) {
            frame.rect = new Rect(crop.x, crop.y, crop.width, crop.height);
            frame.originalSize = new Size(crop.width, crop.height);
            if (this.isPopupButtonFrameKey(key)) {
                // Buttons use horizontal slicing: preserve each rounded end and
                // stretch only the center strip to the shared target width.
                const horizontalInset = Math.min(
                    crop.width * POPUP_BUTTON_HORIZONTAL_INSET_RATIO,
                    crop.width / 2 - 1,
                );
                frame.insetLeft = horizontalInset;
                frame.insetRight = horizontalInset;
                frame.insetTop = 0;
                frame.insetBottom = 0;
            }
        } else {
            frame.originalSize = new Size(texture.width, texture.height);
        }
        frame.offset = new Vec2();
        return frame;
    }

    private sliceItemAtlas(texture: Texture2D): void {
        this.itemFrames.forEach((frame) => frame.destroy());
        this.itemFrames.clear();
        this.itemAtlasTexture = texture;
        const cellWidth = Math.floor(texture.width / 4);
        const cellHeight = Math.floor(texture.height / 4);
        DESKTOP_CLEANUP_ITEM_TYPES.forEach((type, index) => {
            const column = index % 4;
            const row = Math.floor(index / 4);
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(
                column * cellWidth,
                row * cellHeight,
                cellWidth,
                cellHeight,
            );
            frame.originalSize = new Size(cellWidth, cellHeight);
            frame.offset = new Vec2();
            this.itemFrames.set(type, frame);
        });
    }

    private buildInterface(): void {
        this.slotItemNodes.clear();
        this.slotMoveTokens.clear();
        this.pickupRoot = undefined;
        this.node.children.slice().forEach((child) => this.destroyNode(child));
        const metrics = readDesktopCleanupLayout(
            this.node,
            this.context?.services.platform.getLayoutInfo(),
        );
        this.layout = metrics;
        this.node.getComponent(UITransform)?.setContentSize(metrics.width, metrics.height);
        this.buildBackground(metrics);
        this.buildHeader(metrics);
        this.pileItemNodes.clear();

        const board = this.createNode(
            this.node,
            'DeskPilePanel',
            0,
            metrics.boardY,
            metrics.boardWidth,
            metrics.boardHeight,
        );
        board.on(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        board.on(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        board.on(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        board.on(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
        const playmat = this.createNode(board, 'PlaymatImage', 0, 0, metrics.boardWidth, metrics.boardHeight);
        const fallbackNode = this.createNode(playmat, 'Fallback', 0, 0, metrics.boardWidth, metrics.boardHeight);
        const fallback = fallbackNode.addComponent(Graphics);
        const inset = 12 * metrics.scale;
        fallback.fillColor = new Color(247, 231, 198, 255);
        fallback.strokeColor = new Color(235, 119, 100, 235);
        fallback.lineWidth = 5 * metrics.scale;
        fallback.roundRect(
            -metrics.boardWidth / 2 + inset,
            -metrics.boardHeight / 2 + inset,
            metrics.boardWidth - inset * 2,
            metrics.boardHeight - inset * 2,
            34 * metrics.scale,
        );
        fallback.fill();
        fallback.stroke();
        this.pileRoot = this.createNode(board, 'PileRoot', 0, 0, metrics.boardWidth, metrics.boardHeight);

        this.buildSlotTray(metrics);
        this.buildTools(metrics);
        this.buildHintToast(metrics);
        this.buildPickupAnimationRoot();
        this.applyThemeAssets();
    }

    private buildPickupAnimationRoot(): void {
        // The pointer dispatcher requires every node with touch listeners to
        // have a UITransform so it can resolve cameraPriority. Keep the root
        // at the minimum size so it does not become a full-screen hit target;
        // only its animated children participate in touch forwarding.
        const root = this.createNode(this.node, 'PickupAnimationRoot', 0, 0, 1, 1);
        root.on(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
        root.on(Node.EventType.TOUCH_MOVE, this.handleBoardTouchMove, this);
        root.on(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
        root.on(Node.EventType.TOUCH_CANCEL, this.handleBoardTouchCancel, this);
        this.pickupRoot = root;
    }

    private buildHeader(metrics: DesktopCleanupLayoutMetrics): void {
        this.headerLogoRoot = this.createNode(
            this.node,
            'GamePictureLogo',
            0,
            metrics.titleY,
            274 * metrics.scale,
            108 * metrics.scale,
        );

        this.helpButton = this.createHeaderIconButton(
            'HelpButton',
            -metrics.width / 2 + 54 * metrics.scale,
            metrics.titleY,
            'help',
            COLORS.coral,
            this.handleHelp,
        );
        this.pauseButton = this.createHeaderIconButton(
            'PauseButton',
            metrics.width / 2 - 54 * metrics.scale,
            metrics.titleY,
            'pause',
            COLORS.coral,
            this.handlePause,
        );
        this.timerLabel = this.createTimerCard(metrics);
        this.applyHeaderLogo();
    }

    private createTimerCard(metrics: DesktopCleanupLayoutMetrics): Label {
        const width = 252 * metrics.scale;
        const height = 94 * metrics.scale;
        const card = this.createNode(this.node, 'CountdownCard', 0, metrics.statsY, width, height);
        const fallbackNode = this.createNode(card, 'Fallback', 0, 0, width, height);
        const graphics = fallbackNode.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = COLORS.coral;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.roundRect(-width / 2, -height / 2, width, height, 34 * metrics.scale);
        graphics.fill();
        graphics.stroke();
        const label = this.createLabel(
            card,
            'Value',
            '03:00',
            0,
            2 * metrics.scale,
            50 * metrics.scale,
            COLORS.ink,
            210 * metrics.scale,
            72 * metrics.scale,
        );
        label.isBold = true;
        return label;
    }

    private buildBackground(metrics: DesktopCleanupLayoutMetrics): void {
        const backgroundNode = this.createNode(
            this.node,
            'BackgroundImage',
            0,
            0,
            metrics.width + 36,
            metrics.height + 36,
        );
        backgroundNode.setSiblingIndex(0);
        const fallbackNode = this.createNode(
            backgroundNode,
            'BackgroundFallback',
            0,
            0,
            metrics.width + 36,
            metrics.height + 36,
        );
        const fallback = fallbackNode.addComponent(Graphics);
        fallback.fillColor = COLORS.deskDark;
        fallback.rect(
            -(metrics.width + 36) / 2,
            -(metrics.height + 36) / 2,
            metrics.width + 36,
            metrics.height + 36,
        );
        fallback.fill();
        fallback.strokeColor = new Color(174, 119, 78, 36);
        fallback.lineWidth = 2;
        for (let y = -metrics.height / 2; y < metrics.height / 2; y += 72) {
            fallback.moveTo(-metrics.width / 2, y);
            fallback.bezierCurveTo(-140, y + 18, 160, y - 14, metrics.width / 2, y + 6);
        }
        fallback.stroke();
        const shadeNode = this.createNode(this.node, 'ReadabilityShade', 0, 0, metrics.width, metrics.height);
        const shade = shadeNode.addComponent(Graphics);
        shade.fillColor = new Color(37, 38, 47, 20);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();
    }

    private applyThemeAssets(): void {
        const background = this.node.getChildByName('BackgroundImage');
        if (background && this.backgroundFrame) {
            const fallback = background.getChildByName('BackgroundFallback');
            if (fallback) fallback.active = false;
            const sprite = background.getComponent(Sprite) ?? background.addComponent(Sprite);
            sprite.spriteFrame = this.backgroundFrame;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const texture = this.backgroundFrame.texture;
            const metrics = this.layout;
            if (texture && metrics) {
                const artAspect = texture.width / Math.max(1, texture.height);
                const viewportAspect = metrics.width / metrics.height;
                const width = viewportAspect > artAspect ? metrics.width : metrics.height * artAspect;
                const height = viewportAspect > artAspect ? metrics.width / artAspect : metrics.height;
                background.getComponent(UITransform)?.setContentSize(width + 8, height + 8);
            }
        }
        this.applyThemeFrame(
            this.node.getChildByName('DeskPilePanel')?.getChildByName('PlaymatImage'),
            'playmat',
        );
        this.applyThemeFrame(this.node.getChildByName('HelpButton'), 'help');
        this.applyThemeFrame(this.node.getChildByName('PauseButton'), 'pause');
        this.applyThemeFrame(this.node.getChildByName('CountdownCard'), 'timer');
        this.applyThemeFrame(this.node.getChildByName('SlotTray'), 'tray');
        const dock = this.node.getChildByName('ToolDock');
        this.applyThemeFrame(dock?.getChildByName('Tool-return'), 'return');
        this.applyThemeFrame(dock?.getChildByName('Tool-magnet'), 'magnet');
        this.applyThemeFrame(dock?.getChildByName('Tool-shuffle'), 'shuffle');
        this.applyHeaderLogo();
        if (this.model) this.renderAll();
    }

    private applyThemeFrame(node: Node | null | undefined, key: ThemeFrameKey): boolean {
        const frame = this.themeFrames.get(key);
        if (!node?.isValid || !frame) return false;
        const transform = node.getComponent(UITransform);
        const width = transform?.contentSize.width ?? 1;
        const height = transform?.contentSize.height ?? 1;
        const fallback = node.getChildByName('Fallback');
        if (fallback) fallback.active = false;
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = this.isPopupButtonFrameKey(key) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;
        transform?.setContentSize(width, height);
        return true;
    }

    private isPopupButtonFrameKey(key: ThemeFrameKey): boolean {
        return key === 'popupButtonTeal'
            || key === 'popupButtonCoral'
            || key === 'popupButtonPaper';
    }

    private applyHeaderLogo(): void {
        const root = this.headerLogoRoot;
        const metrics = this.layout;
        if (!root || !metrics) return;
        if (this.applyThemeFrame(root, 'title')) {
            root.children.slice().forEach((child) => this.destroyNode(child));
            return;
        }
        if (this.itemFrames.size === 0) return;
        root.children.slice().forEach((child) => this.destroyNode(child));
        const addArtwork = (
            name: string,
            type: DesktopCleanupItemType,
            x: number,
            y: number,
            maximumWidth: number,
            maximumHeight: number,
            angle: number,
        ): void => {
            const size = this.fitItemSize(type, maximumWidth, maximumHeight);
            const node = this.createNode(root, name, x, y, size.width, size.height);
            node.angle = angle;
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.itemFrames.get(type)!;
            node.getComponent(UITransform)?.setContentSize(size.width, size.height);
        };
        addArtwork(
            'LogoNotes',
            'mint-notes',
            -42 * metrics.scale,
            -4 * metrics.scale,
            66 * metrics.scale,
            62 * metrics.scale,
            -7,
        );
        addArtwork(
            'LogoBadge',
            'lucky-badge',
            43 * metrics.scale,
            1 * metrics.scale,
            62 * metrics.scale,
            62 * metrics.scale,
            7,
        );
        addArtwork(
            'LogoPencil',
            'red-pencil',
            4 * metrics.scale,
            -1 * metrics.scale,
            86 * metrics.scale,
            68 * metrics.scale,
            -27,
        );
    }

    private buildTools(metrics: DesktopCleanupLayoutMetrics): void {
        const specs: readonly DesktopCleanupTool[] = ['return', 'magnet', 'shuffle'];
        this.toolButtons.clear();
        const cardSize = 150 * metrics.scale;
        const cardStep = 162 * metrics.scale;
        const dockWidth = cardStep * 2 + cardSize;
        const dockHeight = cardSize;
        const dock = this.createNode(this.node, 'ToolDock', 0, metrics.toolY, dockWidth, dockHeight);
        specs.forEach((tool, index) => {
            const x = (index - 1) * cardStep;
            const card = this.createNode(dock, `Tool-${tool}`, x, 0, cardSize, cardSize);
            card.addComponent(UIOpacity);
            const fallback = this.createNode(card, 'Fallback', 0, 0, cardSize, cardSize);
            const fallbackGraphics = fallback.addComponent(Graphics);
            fallbackGraphics.fillColor = COLORS.cream;
            fallbackGraphics.strokeColor = COLORS.coral;
            fallbackGraphics.lineWidth = 4 * metrics.scale;
            fallbackGraphics.roundRect(-58 * metrics.scale, -54 * metrics.scale, 116 * metrics.scale, 108 * metrics.scale, 24 * metrics.scale);
            fallbackGraphics.fill();
            fallbackGraphics.stroke();
            const icon = this.createNode(fallback, 'ToolIcon', 0, 0, 58 * metrics.scale, 58 * metrics.scale);
            this.drawToolIcon(icon, tool, tool === 'return' ? COLORS.teal : tool === 'magnet' ? COLORS.coral : COLORS.lilac);
            const count = this.createLabel(
                card,
                'Count',
                '1',
                48 * metrics.scale,
                -48 * metrics.scale,
                28 * metrics.scale,
                COLORS.white,
                46 * metrics.scale,
                46 * metrics.scale,
            );
            // Keep the number centered on the origin of the red count badge in
            // the formal tool artwork. The label has its own centered transform
            // so the glyph does not drift with font metrics or card scaling.
            count.node.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
            count.node.setPosition(48 * metrics.scale, -48 * metrics.scale);
            count.lineHeight = 32 * metrics.scale;
            count.isBold = true;
            const helpTarget = this.createNode(
                card,
                'Help',
                53 * metrics.scale,
                53 * metrics.scale,
                46 * metrics.scale,
                46 * metrics.scale,
            );
            helpTarget.addComponent(BlockInputEvents);
            helpTarget.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.showToolHelp(tool);
            }, this);

            const button = card.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.95;
            button.duration = 0.08;
            card.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                if (button.interactable) void this.handleTool(tool);
            }, this);
            this.toolButtons.set(tool, button);
        });
    }

    private buildSlotTray(metrics: DesktopCleanupLayoutMetrics): void {
        const trayWidth = Math.min(metrics.width - 46 * metrics.scale, 644 * metrics.scale);
        const trayHeight = 155 * metrics.scale;
        const tray = this.createNode(this.node, 'SlotTray', 0, metrics.slotY, trayWidth, trayHeight);
        const fallback = this.createNode(tray, 'Fallback', 0, 0, trayWidth, trayHeight);
        const graphics = fallback.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = COLORS.coral;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.roundRect(-trayWidth / 2, -trayHeight / 2, trayWidth, trayHeight, 28 * metrics.scale);
        graphics.fill();
        graphics.stroke();
        const rootWidth = Math.min(trayWidth - 28 * metrics.scale, 600 * metrics.scale);
        this.slotRoot = this.createNode(tray, 'SlotRoot', 0, 3 * metrics.scale, rootWidth, 94 * metrics.scale);
        const cellWidth = rootWidth / this.config.slotCapacity;
        for (let index = 0; index < this.config.slotCapacity; index += 1) {
            const x = -rootWidth / 2 + cellWidth * (index + 0.5);
            this.createNode(this.slotRoot, `Cell-${index}`, x, 0, cellWidth, 92 * metrics.scale);
        }
    }

    private buildHintToast(metrics: DesktopCleanupLayoutMetrics): void {
        const width = Math.min(metrics.width - 120 * metrics.scale, 460 * metrics.scale);
        const height = 48 * metrics.scale;
        const root = this.createNode(
            this.node,
            'HintToast',
            0,
            metrics.slotY + 82 * metrics.scale,
            width,
            height,
        );
        root.addComponent(UIOpacity);
        const graphics = root.addComponent(Graphics);
        graphics.fillColor = new Color(39, 48, 69, 218);
        graphics.strokeColor = new Color(248, 232, 199, 155);
        graphics.lineWidth = 2 * metrics.scale;
        graphics.roundRect(-width / 2, -height / 2, width, height, height / 2);
        graphics.fill();
        graphics.stroke();
        this.hintLabel = this.createLabel(
            root,
            'HintLabel',
            '',
            0,
            0,
            21 * metrics.scale,
            COLORS.cream,
            width - 34 * metrics.scale,
            height - 8 * metrics.scale,
        );
        root.active = false;
        this.hintRoot = root;
    }

    private renderAll(): void {
        if (this.rendering) {
            this.renderQueued = true;
            return;
        }
        this.rendering = true;
        try {
            do {
                this.renderQueued = false;
                const repaired = this.repairPresentationState();
                this.renderPile();
                this.renderSlots();
                this.promotePickupAnimations();
                this.refreshHud();
                this.refreshTools();
                // Match startup can settle another pending selection and ask
                // for a render again. Keep that mutation outside the current
                // slot snapshot, then render the resulting state once more.
                this.startReadyMatchAnimations();
                if (repaired) this.syncTerminalPhase();
            } while (this.renderQueued);
        } finally {
            this.rendering = false;
        }
    }

    /**
     * Reconcile presentation owners without making them a second gameplay
     * state machine. Ordinary pickups are already logical slot items and are
     * owned only by pickupAnimations until their view transaction completes.
     * The model pending set owns triples exclusively, from pickup arrival to
     * merge commit.
     */
    private repairPresentationState(): boolean {
        const model = this.model;
        const slotRoot = this.slotRoot;
        const pickupRoot = this.pickupRoot;
        if (!model) return false;
        let repaired = false;
        const pendingTokens = new Set(
            model.snapshot.pendingSelections.map((selection) => selection.token),
        );

        this.slotMoveTokens.forEach((move, itemId) => {
            if (move.node.isValid
                && move.node.parent === slotRoot
                && this.slotItemNodes.get(itemId) === move.node) return;
            this.slotMoveTokens.delete(itemId);
            repaired = true;
        });

        const interruptedPickups: DesktopCleanupPickupAnimation[] = [];
        this.pickupAnimations.forEach((animation) => {
            if (!this.isCurrent(animation.generation) || !animation.node.isValid) {
                interruptedPickups.push(animation);
                return;
            }
            if (pickupRoot?.isValid && animation.node.parent !== pickupRoot) {
                animation.node.setParent(pickupRoot, true);
            }
            if (animation.node.parent !== pickupRoot && animation.node.parent !== this.pileRoot) {
                interruptedPickups.push(animation);
            }
        });
        interruptedPickups.forEach((animation) => {
            if (this.completePickupAnimation(animation, false, false)) repaired = true;
        });

        this.pendingMatchSelections.forEach((pending, token) => {
            if (pendingTokens.has(token) && this.isCurrent(pending.generation)) return;
            this.pendingMatchSelections.delete(token);
            repaired = true;
        });

        this.matchAnimations.forEach((animation, token) => {
            const ownsMatchNodes = animation.root.isValid
                && animation.root.parent === slotRoot
                && [animation.leftNode, animation.middleNode, animation.rightNode]
                    .every((node) => node.isValid && node.parent === animation.root);
            if (ownsMatchNodes) return;

            this.matchAnimations.delete(token);
            this.pendingMatchSelections.delete(token);
            animation.selection.triple?.itemIds.forEach((itemId) => this.slotMoveTokens.delete(itemId));
            repaired = true;
            if (pendingTokens.has(token)) this.releaseMatchSelection(animation, false);
            if (animation.root.isValid) this.destroyNode(animation.root);
        });

        // A triple is committed to the model before the view queues its merge.
        // If that handoff is interrupted, reconstruct the merge owner from the
        // immutable model selection. Ordinary pickups never enter this path.
        const presentationTokens = new Set<number>();
        this.pickupAnimations.forEach((_animation, token) => presentationTokens.add(token));
        this.pendingMatchSelections.forEach((_pending, token) => presentationTokens.add(token));
        this.matchAnimations.forEach((_animation, token) => presentationTokens.add(token));
        model.snapshot.pendingSelections.forEach((selection) => {
            if (presentationTokens.has(selection.token)) return;
            repaired = true;
            this.pendingMatchSelections.set(selection.token, {
                selection,
                generation: this.operationGeneration,
            });
        });
        return repaired;
    }

    private renderPile(): void {
        const pile = this.pileRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!pile || !snapshot || !metrics) return;
        const activeItemIds = new Set(
            snapshot.items.filter((item) => item.active).map((item) => item.id),
        );
        // A later pickup can arrive while an earlier one is still flying.
        // Rebuild only settled pile items so a model refresh does not destroy
        // the in-flight nodes and their tweens.
        const pickupNodes = new Set(
            [...this.pickupAnimations.values()]
                .filter((animation) => animation.node.isValid && animation.node.parent === pile)
                .map((animation) => animation.node),
        );
        // A touch candidate is owned by its logical item ID, not by the
        // particular view node that happened to exist when the finger went
        // down. A concurrent pickup/merge can rebuild the pile while the
        // finger is still held; prefer the current node from the ID map so
        // the candidate cannot fall through to the item underneath.
        const pendingTapNodes = new Set(
            [...this.pendingPileTaps.values()]
                .filter((tap) => !tap.itemId || activeItemIds.has(tap.itemId))
                .map((tap) => tap.itemId
                    ? (this.pileItemNodes.get(tap.itemId) ?? tap.node)
                    : tap.node)
                .filter((node): node is Node => Boolean(node?.isValid && node.parent === pile)),
        );
        const preservedNodes = new Set([...pickupNodes, ...pendingTapNodes]);
        pile.children.slice().forEach((child) => {
            if (!preservedNodes.has(child)) this.destroyNode(child);
        });
        this.pileItemNodes.clear();
        preservedNodes.forEach((node) => {
            const itemId = node.name.startsWith('Item-') ? node.name.slice('Item-'.length) : '';
            if (itemId) this.pileItemNodes.set(itemId, node);
        });
        const active = snapshot.items
            .filter((item) => item.active)
            .sort(compareDesktopCleanupItems);
        active.forEach((item) => {
            const wasFree = this.renderedItemFree.get(item.id);
            if (wasFree === false && item.free) this.startRevealPulse(item.id);
            this.renderedItemFree.set(item.id, item.free);
            const existing = this.pileItemNodes.get(item.id);
            if (existing?.isValid && existing.parent === pile) {
                this.updatePileItemTransform(existing, item);
                return;
            }
            const size = this.itemDisplaySize(item.type, metrics.scale);
            const position = this.pilePosition(item, metrics);
            const node = this.createNode(
                pile,
                `Item-${item.id}`,
                position.x,
                position.y,
                size.width,
                size.height,
            );
            node.angle = item.angle;
            node.setScale(1, 1, 1);
            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = 255;
            this.drawItem(node, item, size.width, size.height);
            this.updatePileItemTransform(node, item);
            this.pileItemNodes.set(item.id, node);
        });
        // Preserved touch candidates keep their node instance across a
        // rebuild, but newly created nodes are appended after them. Restore
        // the model's layer order explicitly; otherwise a held item can be
        // rendered underneath a newly created item and the release hit test
        // will select that item instead.
        const orderedItemNodes = active
            .map((item) => this.pileItemNodes.get(item.id))
            .filter((node): node is Node => Boolean(node?.isValid && node.parent === pile));
        orderedItemNodes.forEach((node, index) => node.setSiblingIndex(index));
        this.rebindPendingPileTapNodes();
        // Rebuilding settled pile items appends them after preserved pickup
        // nodes. Promote every in-flight pickup again so concurrent pickup
        // animations always render above the entire desktop stack.
        this.pickupAnimations.forEach((animation) => {
            if (animation.node.isValid && animation.node.parent === pile) {
                animation.node.setSiblingIndex(pile.children.length - 1);
            }
        });
    }

    private syncPileTransforms(): void {
        const pile = this.pileRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!pile || !snapshot || !metrics) return;
        const active = snapshot.items
            .filter((item) => item.active)
            .sort(compareDesktopCleanupItems);
        const activeIds = new Set(active.map((item) => item.id));
        this.revealPulseStartedAt.forEach((_startedAt, itemId) => {
            if (!activeIds.has(itemId)) this.revealPulseStartedAt.delete(itemId);
        });
        active.forEach((item, index) => {
            const wasFree = this.renderedItemFree.get(item.id);
            if (wasFree === false && item.free) this.startRevealPulse(item.id);
            this.renderedItemFree.set(item.id, item.free);
            const node = this.pileItemNodes.get(item.id);
            if (!node?.isValid || node.parent !== pile) return;
            this.updatePileItemTransform(node, item);
            node.setSiblingIndex(index);
        });
        this.promotePickupAnimations();
    }

    private updatePileItemTransform(node: Node, item: DesktopCleanupItemSnapshot): void {
        const pulse = this.revealPulseVisual(item.id);
        const baseScale = 1 + item.elevation * 0.14;
        node.setPosition(this.pilePosition(item, this.layout!));
        node.angle = item.angle + pulse.angle;
        node.setScale(baseScale * pulse.scaleX, baseScale, 1);
    }

    private startRevealPulse(itemId: string): void {
        this.revealPulseStartedAt.set(itemId, Date.now());
    }

    private revealPulseVisual(itemId: string): { readonly scaleX: number; readonly angle: number } {
        const startedAt = this.revealPulseStartedAt.get(itemId);
        if (startedAt === undefined) return { scaleX: 1, angle: 0 };
        const progress = Math.min(1, Math.max(0, (Date.now() - startedAt) / 260));
        if (progress >= 1) {
            this.revealPulseStartedAt.delete(itemId);
            return { scaleX: 1, angle: 0 };
        }
        const phase = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
        const scaleX = progress < 0.5
            ? 1 - phase * 0.88
            : 0.12 + phase * 0.88;
        return {
            scaleX,
            angle: Math.sin(progress * Math.PI) * 6,
        };
    }

    private drawItem(
        node: Node,
        item: Pick<DesktopCleanupItemSnapshot, 'type'>,
        width: number,
        height: number,
    ): void {
        const frame = this.itemFrames.get(item.type);
        if (frame) {
            const artNode = this.createNode(node, 'Artwork', 0, 0, width, height);
            const sprite = artNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            // Assigning a SpriteFrame can restore its source pixel dimensions.
            // Reapply the gameplay size so pile items and slot thumbnails stay
            // inside their responsive layout bounds.
            artNode.getComponent(UITransform)?.setContentSize(width, height);
            sprite.color = Color.WHITE;
            return;
        }
        const body = node.addComponent(Graphics);
        const source = ITEM_COLORS[item.type];
        body.fillColor = source;
        body.roundRect(-width * 0.44, -height * 0.40, width * 0.88, height * 0.80, Math.min(22, height * 0.24));
        body.fill();
        const label = this.createLabel(node, 'FallbackLabel', ITEM_LABELS[item.type], 0, 0, Math.min(24, height * 0.25), COLORS.white, width * 0.78, height * 0.54);
        label.isBold = true;
    }

    private renderSlots(): void {
        const root = this.slotRoot;
        const snapshot = this.model?.snapshot;
        const metrics = this.layout;
        if (!root || !snapshot || !metrics) return;
        const pickupItemIds = new Set(
            [...this.pickupAnimations.values()]
                .filter((animation) => animation.node.isValid)
                .map((animation) => animation.selection.selectedItemId),
        );
        const matchItemIds = new Set<string>();
        this.matchAnimations.forEach((animation) => {
            if (!animation.root.isValid
                || animation.root.parent !== root
                || ![animation.leftNode, animation.middleNode, animation.rightNode]
                    .every((node) => node.isValid && node.parent === animation.root)) return;
            animation.selection.triple?.itemIds.forEach((itemId) => matchItemIds.add(itemId));
        });
        const trayWidth = root.getComponent(UITransform)?.contentSize.width ?? 640;
        const cellWidth = trayWidth / this.config.slotCapacity;
        const desiredSlots: Array<{
            readonly slot: (typeof snapshot.slots)[number];
            readonly position: Vec3;
            readonly size: Size;
        }> = [];
        snapshot.slots.forEach((slot, index) => {
            if (pickupItemIds.has(slot.itemId) || matchItemIds.has(slot.itemId)) return;
            const natural = this.itemDisplaySize(slot.type, metrics.scale);
            const fitted = this.fitSize(
                natural.width,
                natural.height,
                cellWidth - 10 * metrics.scale,
                78 * metrics.scale,
            );
            desiredSlots.push({
                slot,
                position: new Vec3(-trayWidth / 2 + cellWidth * (index + 0.5), 0, 0),
                size: fitted,
            });
        });
        const desiredItemIds = new Set(desiredSlots.map(({ slot }) => slot.itemId));

        // Keep regular slot nodes by item ID. Removing and recreating the
        // whole tray made every compressed item flash to its new position.
        this.slotItemNodes.forEach((node, itemId) => {
            if (desiredItemIds.has(itemId)) return;
            this.slotItemNodes.delete(itemId);
            this.slotMoveTokens.delete(itemId);
            if (node.isValid && node.parent === root) this.destroyNode(node);
        });
        root.children
            .filter((child) => {
                if (!child.name.startsWith('SlotItem-')) return false;
                const itemId = child.name.slice('SlotItem-'.length);
                return !desiredItemIds.has(itemId);
            })
            .forEach((child) => {
                this.slotMoveTokens.delete(child.name.slice('SlotItem-'.length));
                this.destroyNode(child);
            });

        desiredSlots.forEach(({ slot, position, size }) => {
            let node = this.slotItemNodes.get(slot.itemId);
            if (!node?.isValid || node.parent !== root) {
                const existing = root.getChildByName(`SlotItem-${slot.itemId}`);
                node = existing?.isValid ? existing : undefined;
            }
            if (!node) {
                // Any move ownership belonged to a previous node instance.
                // A newly created thumbnail starts at its final position.
                this.slotMoveTokens.delete(slot.itemId);
                node = this.createNode(
                    root,
                    `SlotItem-${slot.itemId}`,
                    position.x,
                    position.y,
                    size.width,
                    size.height,
                );
                node.addComponent(UIOpacity);
                this.drawItem(node, { type: slot.type }, size.width, size.height);
            } else {
                node.getComponent(UITransform)?.setContentSize(size.width, size.height);
                this.animateSlotItemTo(node, position, slot.itemId);
            }
            this.slotItemNodes.set(slot.itemId, node);
        });
        // Newly created thumbnails append after the existing tray content.
        // Keep every active merge presentation above the tray content.
        this.matchAnimations.forEach((animation) => {
            if (animation.root.isValid && animation.root.parent === root) {
                animation.root.setSiblingIndex(root.children.length - 1);
            }
        });
    }

    private animateSlotItemTo(node: Node, target: Vec3, itemId: string): void {
        if (!node.isValid || node.parent !== this.slotRoot) return;
        const current = node.position;
        const distance = Math.hypot(target.x - current.x, target.y - current.y);
        Tween.stopAllByTarget(node);
        if (distance <= 0.5) {
            node.setPosition(target);
            this.slotMoveTokens.delete(itemId);
            return;
        }
        const move: DesktopCleanupSlotMove = { node };
        this.slotMoveTokens.set(itemId, move);
        tween(node)
            .to(0.14, { position: target.clone() }, { easing: 'quadOut' })
            .call(() => {
                if (this.slotMoveTokens.get(itemId) !== move) return;
                this.slotMoveTokens.delete(itemId);
                this.startReadyMatchAnimations();
            })
            .start();
    }

    private refreshHud(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        const seconds = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
        this.lastHudSecond = seconds;
        const minutes = Math.floor(seconds / 60);
        const minuteText = minutes < 10 ? `0${minutes}` : `${minutes}`;
        const remainderValue = seconds % 60;
        const remainder = remainderValue < 10 ? `0${remainderValue}` : `${remainderValue}`;
        if (this.timerLabel) {
            this.timerLabel.string = `${minuteText}:${remainder}`;
            this.timerLabel.color = seconds <= 30 ? COLORS.coral : COLORS.ink;
        }
        if (snapshot.score !== this.lastReportedScore) {
            this.lastReportedScore = snapshot.score;
            this.context?.reportScore(snapshot.score);
        }
    }

    private refreshTools(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        const adsEnabled = this.isAdsEnabled();
        this.toolButtons.forEach((button, tool) => {
            const charge = snapshot.toolCharges[tool];
            const count = button.node.getChildByName('Count')?.getComponent(Label);
            if (count) count.string = `${charge}`;
            button.interactable = this.state === 'playing'
                && !this.adBusy
                && snapshot.pendingSelections.length === 0
                && this.pickupAnimations.size === 0
                && this.pendingMatchSelections.size === 0
                && this.matchAnimations.size === 0
                && this.slotMoveTokens.size === 0
                && (charge > 0 || (adsEnabled && !snapshot.boostAdAttempted));
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
        });
    }

    private handleItemTap(itemId: string, node: Node): void {
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        // A pickup request during an active merge must release that merge
        // before the model performs its capacity check. Otherwise a full tray
        // rejects the request before the three visual merge cells can free up.
        this.releaseActiveMatchesForPickup();
        let result = this.model.selectItem(itemId);
        if (!result.accepted && result.reason === 'full') {
            if (this.releaseActiveMatchesForPickup()) {
                result = this.model.selectItem(itemId);
            }
        }
        const selection = result.selection;
        if (!result.accepted || !selection) return;
        const generation = this.operationGeneration;
        const animation: DesktopCleanupPickupAnimation = {
            selection,
            generation,
            node,
        };
        this.pickupAnimations.set(selection.token, animation);
        this.movePickupNodeToAnimationLayer(animation);
        // Releasing the first merge can synchronously refresh the tray and
        // start another queued merge. Catch that newly active merge after the
        // current pickup has been registered as well.
        this.releaseActiveMatchesForPickup();
        // The model has already inserted the item into its target slot. Move
        // existing thumbnails out of the way while the pickup is still flying
        // so the destination is reserved before the item arrives.
        this.renderSlots();
        this.promotePickupAnimations();
        this.startReadyMatchAnimations();
        this.refreshTools();
        this.context?.services.feedback.play('drop');
        node.setSiblingIndex(Math.max(0, (node.parent?.children.length ?? 1) - 1));
        const currentSlotIndex = this.model.snapshot.slots.findIndex(
            (slot) => slot.itemId === selection.selectedItemId,
        );
        const destination = this.slotTargetInParent(
            node.parent,
            currentSlotIndex >= 0 ? currentSlotIndex : selection.insertionIndex,
        );
        const start = node.position.clone();
        const arc = new Vec3(
            (start.x + destination.x) / 2,
            Math.max(start.y, destination.y) + 54 * (this.layout?.scale ?? 1),
            0,
        );
        tween(node)
            .to(0.07, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
            .to(0.12, { position: arc, scale: new Vec3(0.88, 0.88, 1), angle: 0 }, { easing: 'quadOut' })
            .to(0.15, { position: destination, scale: new Vec3(0.56, 0.56, 1), angle: 0 }, { easing: 'quadIn' })
            .call(() => this.finishPickupAnimation(animation))
            .start();
        // The normal callback and interruption deadline share the same atomic
        // transaction completion, so neither path can settle or remove twice.
        this.scheduleOnce(
            () => this.finishPickupAnimation(animation),
            PICKUP_ANIMATION_WATCHDOG_SECONDS,
        );
    }

    private finishPickupAnimation(animation: DesktopCleanupPickupAnimation): void {
        this.completePickupAnimation(animation, true, true);
    }

    private completePickupAnimation(
        animation: DesktopCleanupPickupAnimation,
        render: boolean,
        pulse: boolean,
    ): boolean {
        const selection = animation.selection;
        if (this.pickupAnimations.get(selection.token) !== animation) return false;
        this.pickupAnimations.delete(selection.token);
        if (animation.node.isValid) this.destroyNode(animation.node);

        const model = this.model;
        if (!this.isCurrent(animation.generation) || !model || model.phase !== 'playing') return true;
        const stillPending = model.snapshot.pendingSelections.some(
            (pending) => pending.token === selection.token,
        );
        if (selection.triple && stillPending) {
            this.pendingMatchSelections.set(selection.token, {
                selection,
                generation: animation.generation,
            });
        }
        if (this.pickupAnimations.size === 0) model.finalizeSelectionBatch();
        if (!render) return true;

        this.renderAll();
        if (pulse) {
            const settledSlotIndex = model.snapshot.slots.findIndex(
                (slot) => slot.itemId === selection.selectedItemId,
            );
            this.pulseSlot(settledSlotIndex >= 0 ? settledSlotIndex : selection.insertionIndex);
        }
        this.syncTerminalPhase();
        return true;
    }

    private movePickupNodeToAnimationLayer(animation: DesktopCleanupPickupAnimation): void {
        const source = animation.node;
        const root = this.pickupRoot;
        if (!source.isValid) return;
        this.pileItemNodes.delete(animation.selection.selectedItemId);
        if (!root?.isValid || source.parent === root) return;
        source.setParent(root, true);
        source.name = `PickupAnimation-${animation.selection.token}`;
        source.layer = this.node.layer;
    }

    private settleSelection(
        selection: DesktopCleanupPendingSelection,
        generation: number,
        render = true,
    ): boolean {
        if (!this.isCurrent(generation) || !this.model) return false;
        const settled = this.model.settleSelection(selection.token);
        if (!settled.accepted) return false;
        if (render) {
            this.renderAll();
            this.syncTerminalPhase();
        }
        return true;
    }

    private animateTripleSelection(selection: DesktopCleanupPendingSelection, generation: number): void {
        const triple = selection.triple;
        const root = this.slotRoot;
        if (!triple || !root?.isValid || !this.isCurrent(generation)) {
            this.settleSelection(selection, generation);
            return;
        }
        const nodes = triple.itemIds
            .map((itemId) => root.getChildByName(`SlotItem-${itemId}`))
            .filter((node): node is Node => Boolean(node?.isValid));
        if (nodes.length !== 3) {
            if (triple.itemIds.some((itemId) => this.isPickupInFlight(itemId))) return;
            this.settleSelection(selection, generation);
            return;
        }
        // The model stores the matching item IDs by selection order. The
        // presentation must use the actual slot positions, because tools or
        // insertion of another type can make that order differ from the
        // visible left-to-right arrangement.
        const orderedNodes = [...nodes].sort((left, right) => (
            left.position.x - right.position.x
            || left.position.y - right.position.y
            || left.name.localeCompare(right.name)
        ));
        const leftNode = orderedNodes[0];
        const middleNode = orderedNodes[1];
        const rightNode = orderedNodes[2];
        const center = middleNode.position.clone();
        const leftStart = leftNode.position.clone();
        const middleStart = middleNode.position.clone();
        const rightStart = rightNode.position.clone();
        const animationRootTransform = root.getComponent(UITransform);
        const animationRoot = this.createNode(
            root,
            `MatchAnimation-${selection.token}`,
            0,
            0,
            animationRootTransform?.contentSize.width ?? 1,
            animationRootTransform?.contentSize.height ?? 1,
        );
        animationRoot.setSiblingIndex(root.children.length - 1);
        const leftAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, leftNode, leftStart);
        const middleAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, middleNode, middleStart);
        const rightAnimationNode = this.moveMatchNodeToAnimationLayer(animationRoot, rightNode, rightStart);
        const animation: DesktopCleanupMatchAnimation = {
            selection,
            generation,
            root: animationRoot,
            leftNode: leftAnimationNode,
            middleNode: middleAnimationNode,
            rightNode: rightAnimationNode,
        };
        this.matchAnimations.set(selection.token, animation);
        // If another pickup is already flying when this merge starts, release
        // the three logical cells now while keeping their views in this upper
        // animation root.
        if (this.hasConcurrentPickup(selection.token)) {
            this.releaseMatchSelection(animation);
        }

        const gatherDuration = 0.24;
        const overlapDuration = 0.06;
        const centerPosition = center.clone();
        const leftGather = tween(leftAnimationNode)
            .to(gatherDuration, {
                position: centerPosition.clone(),
                scale: new Vec3(0.88, 0.88, 1),
                angle: 7,
            }, { easing: 'quadInOut' });
        const rightGather = tween(rightAnimationNode)
            .to(gatherDuration, {
                position: centerPosition.clone(),
                scale: new Vec3(0.88, 0.88, 1),
                angle: -7,
            }, { easing: 'quadInOut' });
        leftGather.start();
        rightGather.start();
        tween(middleAnimationNode)
            .to(0.07, {
                scale: new Vec3(1.08, 1.08, 1),
                angle: -2,
            }, { easing: 'backOut' })
            .to(gatherDuration - 0.07, {
                scale: new Vec3(0.94, 0.94, 1),
                angle: 0,
            }, { easing: 'quadIn' })
            .start();

        const beginBurst = (): void => {
            if (this.matchAnimations.get(selection.token) !== animation) return;
            this.beginMatchBurst(animation, centerPosition);
        };
        tween(animationRoot)
            .delay(gatherDuration + overlapDuration)
            .call(beginBurst)
            .start();
        // A watchdog prevents an interrupted presentation tween from leaving
        // the model pending and the board input-locked forever.
        this.scheduleOnce(() => {
            if (this.matchAnimations.get(selection.token) === animation) this.finishMatchAnimation(animation);
        }, gatherDuration + overlapDuration + 0.65);
    }

    private moveMatchNodeToAnimationLayer(
        parent: Node,
        node: Node,
        position: Vec3,
    ): Node {
        const itemId = node.name.startsWith('SlotItem-')
            ? node.name.slice('SlotItem-'.length)
            : '';
        if (itemId) {
            this.slotItemNodes.delete(itemId);
            // A slot move tween can otherwise survive the reparenting. If the
            // match root is destroyed before that tween's callback, the token
            // remains forever and blocks every later merge/slot refresh.
            this.slotMoveTokens.delete(itemId);
        }
        Tween.stopAllByTarget(node);
        node.removeFromParent();
        node.setParent(parent);
        node.setPosition(position);
        node.setScale(1, 1, 1);
        node.angle = 0;
        this.setMatchNodeOpacity(node, 255);
        return node;
    }

    private beginMatchBurst(animation: DesktopCleanupMatchAnimation, center: Vec3): void {
        if (!this.isCurrent(animation.generation) || !animation.root.isValid) {
            this.finishMatchAnimation(animation);
            return;
        }
        Tween.stopAllByTarget(animation.root);
        [animation.leftNode, animation.middleNode, animation.rightNode].forEach((node) => {
            if (!node.isValid) return;
            Tween.stopAllByTarget(node);
            node.setPosition(center);
            node.setScale(1, 1, 1);
            node.angle = 0;
            this.setMatchNodeOpacity(node, 255);
        });
        const metrics = this.layout;
        const extent = 192 * (metrics?.scale ?? 1);
        const smoke = this.createNode(
            animation.root,
            `MatchSmoke-${animation.selection.token}`,
            center.x,
            center.y,
            extent,
            extent,
        );
        smoke.setScale(0.28, 0.28, 1);
        const smokeOpacity = smoke.addComponent(UIOpacity);
        smokeOpacity.opacity = 0;
        const smokeFrame = this.themeFrames.get('smoke');
        if (smokeFrame) {
            const sprite = smoke.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = smokeFrame;
            smoke.getComponent(UITransform)?.setContentSize(extent, extent);
        } else {
            const fallback = smoke.addComponent(Graphics);
            fallback.fillColor = new Color(255, 245, 213, 232);
            [-38, -17, 8, 34].forEach((offset, index) => {
                fallback.circle(offset * (metrics?.scale ?? 1), (index % 2 === 0 ? 8 : -5) * (metrics?.scale ?? 1), 34 * (metrics?.scale ?? 1));
            });
            fallback.fill();
        }
        animation.smoke = smoke;
        this.context?.services.feedback.play('merge');

        const finish = (): void => this.finishMatchAnimation(animation);
        [animation.leftNode, animation.middleNode, animation.rightNode].forEach((node) => {
            const opacity = node.getComponent(UIOpacity);
            tween(node)
                .to(0.03, { scale: new Vec3(1.16, 1.16, 1) }, { easing: 'backOut' })
                .to(0.09, { scale: new Vec3(0.04, 0.04, 1) }, { easing: 'quadIn' })
                .start();
            if (opacity) {
                tween(opacity)
                    .delay(0.02)
                    .to(0.08, { opacity: 0 }, { easing: 'quadIn' })
                    .start();
            }
        });
        tween(smokeOpacity)
            .to(0.03, { opacity: 255 }, { easing: 'quadOut' })
            .delay(0.03)
            .to(0.11, { opacity: 0 }, { easing: 'quadIn' })
            .start();
        tween(smoke)
            .to(0.03, { scale: new Vec3(1.08, 1.08, 1), angle: -5 }, { easing: 'backOut' })
            .to(0.11, { scale: new Vec3(1.28, 1.28, 1), angle: 8 }, { easing: 'quadOut' })
            .start();
        tween(animation.root)
            .delay(0.18)
            .call(finish)
            .start();
    }

    private finishMatchAnimation(animation: DesktopCleanupMatchAnimation): void {
        if (this.matchAnimations.get(animation.selection.token) !== animation) return;
        this.matchAnimations.delete(animation.selection.token);
        animation.selection.triple?.itemIds.forEach((itemId) => this.slotMoveTokens.delete(itemId));
        if (animation.root.isValid) this.destroyNode(animation.root);
        // The model token is the only source of truth for commit state. If a
        // pickup released it early this is a render-only reconciliation;
        // otherwise animation completion commits it here.
        this.releaseMatchSelection(animation);
    }

    private releaseMatchSelection(
        animation: DesktopCleanupMatchAnimation,
        render = true,
    ): boolean {
        const pending = this.model?.snapshot.pendingSelections.some(
            (selection) => selection.token === animation.selection.token,
        );
        if (!pending) {
            if (render) {
                this.renderAll();
                this.syncTerminalPhase();
            }
            return true;
        }
        if (!this.settleSelection(animation.selection, animation.generation, false)) return false;
        if (render) {
            this.renderAll();
            this.syncTerminalPhase();
        }
        return true;
    }

    private releaseActiveMatchesForPickup(): boolean {
        let released = false;
        // Settling merges can promote another queued merge during the unified
        // tray render. Keep draining until no unreleased animation remains so
        // consecutive merges cannot leave a logical cell behind.
        while (true) {
            const pendingTokens = new Set(
                this.model?.snapshot.pendingSelections.map((selection) => selection.token) ?? [],
            );
            const active = [...this.matchAnimations.values()]
                .filter((animation) => pendingTokens.has(animation.selection.token));
            if (active.length === 0) break;
            let releasedThisPass = false;
            active.forEach((animation) => {
                if (!this.releaseMatchSelection(animation, false)) return;
                released = true;
                releasedThisPass = true;
            });
            if (!releasedThisPass) {
                // A stale/invalid animation is repaired by the next render;
                // never spin here and block the pickup request forever.
                this.renderAll();
                break;
            }
            this.renderAll();
            this.syncTerminalPhase();
        }
        return released;
    }

    private cancelMatchAnimation(): void {
        this.pendingMatchSelections.clear();
        const animations = [...this.matchAnimations.values()];
        this.matchAnimations.clear();
        animations.forEach((animation) => {
            animation.selection.triple?.itemIds.forEach((itemId) => this.slotMoveTokens.delete(itemId));
            if (animation.root.isValid) this.destroyNode(animation.root);
        });
    }

    private cancelPickupAnimations(): void {
        const animations = [...this.pickupAnimations.values()];
        this.pickupAnimations.clear();
        animations.forEach((animation) => {
            if (animation.node.isValid) this.destroyNode(animation.node);
        });
    }

    private cancelSlotMoves(): void {
        this.slotMoveTokens.clear();
        this.slotItemNodes.forEach((node) => {
            if (node.isValid) Tween.stopAllByTarget(node);
        });
    }

    private startReadyMatchAnimations(): void {
        if (this.state !== 'playing' || !this.model || this.model.phase !== 'playing') return;
        if (this.slotMoveTokens.size > 0) return;
        const pendingTokens = new Set(
            this.model.snapshot.pendingSelections.map((selection) => selection.token),
        );
        [...this.pendingMatchSelections.values()].forEach((pending) => {
            if (!this.isCurrent(pending.generation)) return;
            if (!pendingTokens.has(pending.selection.token)) {
                this.pendingMatchSelections.delete(pending.selection.token);
                return;
            }
            const triple = pending.selection.triple;
            if (!triple || triple.itemIds.some((itemId) => this.isPickupInFlight(itemId))) return;
            this.pendingMatchSelections.delete(pending.selection.token);
            this.animateTripleSelection(pending.selection, pending.generation);
        });
    }

    private hasConcurrentPickup(selectionToken: number): boolean {
        return [...this.pickupAnimations.values()].some(
            (animation) => animation.selection.token !== selectionToken,
        );
    }

    private isPickupInFlight(itemId: string): boolean {
        return [...this.pickupAnimations.values()].some(
            (animation) => animation.selection.selectedItemId === itemId,
        );
    }

    private promotePickupAnimations(): void {
        const root = this.pickupRoot;
        if (!root?.isValid) return;
        this.pickupAnimations.forEach((animation) => {
            if (animation.node.isValid && animation.node.parent === root) {
                animation.node.setSiblingIndex(root.children.length - 1);
            }
        });
    }

    private setMatchNodeOpacity(node: Node, opacity: number): void {
        if (!node.isValid) return;
        const component = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        component.opacity = Math.max(0, Math.min(255, Math.round(opacity)));
    }

    private async handleTool(tool: DesktopCleanupTool): Promise<void> {
        if (this.state !== 'playing' || this.inputLocked || this.adBusy || !this.model) return;
        const result = this.model.useTool(tool);
        if (result.reason === 'needs-ad') {
            if (!this.isAdsEnabled()) {
                this.setHint('本局工具次数已用完');
                this.refreshTools();
                return;
            }
            await this.requestBoostAd(tool);
            return;
        }
        if (!result.accepted) {
            this.setHint(result.reason === 'empty' ? '当前还用不上这个工具' : '本局工具次数已用完');
            return;
        }
        this.context?.services.feedback.play(result.triple ? 'merge' : 'fold');
        this.renderAll();
        this.setHint(tool === 'return' ? '最近物件已放回堆顶' : tool === 'shuffle' ? '剩余文具已经重新叠好' : '磁吸盒凑齐了一组');
        this.syncTerminalPhase();
    }

    private async requestBoostAd(tool: DesktopCleanupTool): Promise<void> {
        const model = this.model;
        const context = this.context;
        if (!model
            || !context
            || !this.isAdsEnabled()
            || !model.beginBoostAd(tool)) return;
        const generation = this.operationGeneration;
        this.adBusy = true;
        this.inputLocked = true;
        this.state = 'paused';
        this.setHint('正在播放视频…');
        this.refreshTools();
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            const action = model.resolveBoostAd(result.outcome === 'completed');
            if (action.accepted) {
                this.context?.services.feedback.play(action.triple ? 'merge' : 'continue');
                this.setHint('视频完成，工具已生效');
            } else {
                this.setHint('视频未完整播放，本局不再补充工具');
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveBoostAd(false);
            console.warn('[DesktopCleanupGame] Rewarded tool ad failed.', error);
            this.setHint('视频暂不可用，本局不再补充工具');
        } finally {
            if (this.isCurrent(generation)) {
                this.adBusy = false;
                this.inputLocked = false;
                this.state = 'playing';
                this.renderAll();
                this.syncTerminalPhase();
            }
        }
    }

    private syncTerminalPhase(): void {
        const phase = this.model?.snapshot.phase;
        if (phase === 'failed' && this.state === 'playing') {
            this.state = 'failed';
            this.inputLocked = true;
            this.context?.services.feedback.play('failure');
            this.showFailure();
        } else if (phase === 'won' && !this.terminalPending) {
            this.finishWin();
        }
    }

    private showFailure(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return;
        this.stopDeviceMotion();
        const reason = snapshot.failureReason === 'timeout'
            ? '时间到了，桌面还没清空'
            : '收纳槽已经放满了';
        const actions: OverlayAction[] = [];
        if (this.isAdsEnabled() && !snapshot.continueAdAttempted) {
            const label = snapshot.failureReason === 'slots'
                ? '看广告继续'
                : `加时 ${this.config.continueSeconds} 秒继续`;
            actions.push({ name: 'ContinueButton', label, tone: 'teal', action: () => this.requestContinueAd(), adIcon: true });
        }
        actions.push(
            { name: 'RestartButton', label: '重新挑战', tone: 'mustard', action: () => this.restartFromFailure() },
            { name: 'LobbyButton', label: '返回大厅', tone: 'paper', action: () => this.lobbyFromFailure() },
        );
        this.destroyOverlay(this.failureOverlay);
        this.failureOverlay = this.buildOverlay(
            'DesktopFailureOverlay',
            '还差一点',
            reason,
            actions,
        );
    }

    private async requestContinueAd(): Promise<void> {
        const model = this.model;
        const context = this.context;
        if (!model
            || !context
            || this.adBusy
            || !this.isAdsEnabled()
            || !model.beginContinueAd()) return;
        const failureReason = model.snapshot.failureReason;
        const generation = this.operationGeneration;
        this.adBusy = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在播放视频…');
        try {
            const result = await context.services.ads.showRewarded({
                placement: AD_PLACEMENTS.desktopCleanupRewarded,
                gameId: context.gameId,
                sessionId: context.sessionId,
            });
            if (!this.isCurrent(generation)) return;
            if (model.resolveContinueAd(result.outcome === 'completed')) {
                this.destroyOverlay(this.failureOverlay);
                this.failureOverlay = undefined;
                this.state = 'playing';
                this.inputLocked = false;
                this.startDeviceMotion();
                this.context?.services.feedback.play('continue');
                this.setHint(failureReason === 'slots' ? '视频完成，已清出 3 格！' : '加时成功，继续整理！');
                this.renderAll();
            } else {
                this.setHint('视频未完整播放，无法续玩');
                this.showFailure();
            }
        } catch (error: unknown) {
            if (!this.isCurrent(generation)) return;
            model.resolveContinueAd(false);
            console.warn('[DesktopCleanupGame] Continue ad failed.', error);
            this.setHint('视频暂不可用，无法续玩');
            this.showFailure();
        } finally {
            if (this.isCurrent(generation)) this.adBusy = false;
        }
    }

    private restartFromFailure(): void {
        if (this.terminalPending) return;
        this.terminalPending = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在重新摆桌…');
        this.context?.requestRestart(this.makeFailureResult('failure_restart'));
    }

    private lobbyFromFailure(): void {
        if (this.terminalPending) return;
        this.terminalPending = true;
        this.setOverlayBusy(this.failureOverlay, true, '正在返回大厅…');
        this.context?.requestLobby(this.makeFailureResult('failure_lobby'));
    }

    private makeFailureResult(reason: string) {
        const snapshot = this.model?.snapshot;
        return Object.freeze({
            score: snapshot?.score ?? 0,
            duration: this.currentDurationSeconds(),
            completed: false,
            extra: Object.freeze({
                reason,
                failureReason: snapshot?.failureReason ?? 'unknown',
                challengeDate: this.model?.dateKey ?? desktopCleanupDateKey(),
            }),
        });
    }

    private finishWin(): void {
        const snapshot = this.model?.snapshot;
        if (!snapshot || snapshot.phase !== 'won' || this.terminalPending) return;
        this.terminalPending = true;
        this.state = 'completed';
        this.inputLocked = true;
        const durationMs = Math.round(this.currentDurationSeconds() * 1000);
        const newRecord = snapshot.score > this.save.highScore;
        this.save = Object.freeze({
            ...this.save,
            highScore: Math.max(this.save.highScore, snapshot.score),
            wins: this.save.wins + 1,
            bestClearMs: this.save.bestClearMs === undefined
                ? durationMs
                : Math.min(this.save.bestClearMs, durationMs),
            lastCompletedDate: this.model?.dateKey,
        });
        this.persistSave();
        this.context?.services.feedback.play(newRecord ? 'record' : 'milestone');
        this.context?.requestExit(Object.freeze({
            score: snapshot.score,
            duration: durationMs / 1000,
            completed: true,
            extra: Object.freeze({
                newRecord,
                remainingSeconds: Math.floor(snapshot.remainingMs / 1000),
                challengeDate: this.model?.dateKey,
                continued: snapshot.continued,
            }),
        }));
    }

    private currentDurationSeconds(): number {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return Math.max(0, (Date.now() - this.roundStartedAt) / 1000);
        const total = this.config.timeLimitSeconds * 1000
            + (snapshot.continuedWithTime ? this.config.continueSeconds * 1000 : 0);
        return Math.max(0, (total - snapshot.remainingMs) / 1000);
    }

    private isAdsEnabled(): boolean {
        const context = this.context;
        return Boolean(context?.services.ads.isEnabledForGame(context.gameId));
    }

    private showToolHelp(tool: DesktopCleanupTool): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.stopDeviceMotion();
        this.activeToolHelp = tool;
        this.state = 'tool-help';
        this.inputLocked = true;
        const adRule = this.isAdsEnabled()
            ? '三种道具都用完免费次数后，本局总共还能看 1 次视频补充任意一种。'
            : '当前环境不提供视频补充次数。';
        this.destroyOverlay(this.toolHelpOverlay);
        this.toolHelpOverlay = this.buildOverlay(
            'DesktopToolHelpOverlay',
            TOOL_TITLES[tool],
            `${TOOL_DESCRIPTIONS[tool]}\n\n每局免费 ${this.config.freeUsesPerTool} 次。${adRule}`,
            [
                { name: 'CloseButton', label: '知道了', tone: 'teal', action: () => this.closeToolHelp() },
            ],
            tool,
        );
    }

    private closeToolHelp(): void {
        this.destroyOverlay(this.toolHelpOverlay);
        this.toolHelpOverlay = undefined;
        this.activeToolHelp = undefined;
        this.state = 'playing';
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
    }

    private showRules(firstTime: boolean): void {
        if (this.state !== 'playing' && this.state !== 'ready') return;
        this.stopDeviceMotion();
        this.rulesFirstTime = firstTime;
        this.state = 'rules';
        this.inputLocked = true;
        this.destroyOverlay(this.rulesOverlay);
        this.rulesOverlay = this.buildOverlay(
            'DesktopRulesOverlay',
            firstTime ? '今天也来清清桌面' : '整理规则',
            '点击物件露出的部分，把它放入 7 格收纳槽\n同类三件会自动收好，清掉上层会露出更深的文具\n在 180 秒内清空桌面并找回 3 枚幸运徽章',
            [
                { name: 'StartButton', label: firstTime ? '开始整理' : '知道了', tone: 'teal', action: () => this.closeRules(firstTime) },
            ],
        );
    }

    private closeRules(markSeen: boolean): void {
        this.destroyOverlay(this.rulesOverlay);
        this.rulesOverlay = undefined;
        this.rulesFirstTime = false;
        if (markSeen && this.save.rulesSeenVersion < DESKTOP_CLEANUP_RULES_VERSION) {
            this.save = Object.freeze({ ...this.save, rulesSeenVersion: DESKTOP_CLEANUP_RULES_VERSION });
            this.persistSave();
        }
        this.state = 'playing';
        this.inputLocked = false;
        this.startDeviceMotion();
        this.refreshTools();
    }

    private readonly handlePause = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private readonly handleHelp = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.showRules(false);
    };

    private startDeviceMotion(): void {
        const platform = this.context?.services.platform;
        if (!platform?.supportsAccelerometer()) return;
        this.lastAccelerometerSample = undefined;
        this.lastAccelerometerShakeAt = 0;
        platform.startAccelerometer();
    }

    private stopDeviceMotion(): void {
        this.context?.services.platform.stopAccelerometer();
        this.lastAccelerometerSample = undefined;
        this.lastAccelerometerShakeAt = 0;
    }

    private readonly handleAccelerometerChange = (sample: AccelerometerSample): void => {
        const previous = this.lastAccelerometerSample;
        this.lastAccelerometerSample = sample;
        if (this.state !== 'playing' || this.inputLocked || !this.model || !previous) return;
        const deltaX = sample.x - previous.x;
        const deltaY = sample.y - previous.y;
        const magnitude = Math.hypot(deltaX, deltaY);
        const now = Date.now();
        if (magnitude < ACCELEROMETER_SHAKE_THRESHOLD
            || now - this.lastAccelerometerShakeAt < ACCELEROMETER_SHAKE_COOLDOWN_MS) return;
        this.lastAccelerometerShakeAt = now;
        const shake: DesktopCleanupShakeInput = {
            // 微信加速度计的 x/y 轴与竖屏桌面方向相反/相同的设备存在差异，
            // 只取变化量并使用相反的 x 方向，保证“向右晃”能把物品向右推。
            x: -deltaX,
            y: deltaY,
            strength: Math.min(1.8, Math.max(0.7, magnitude / 0.22)),
        };
        if (this.model.applyShake(shake)) {
            this.context?.services.feedback.vibrate('light');
        }
    };

    private readonly handleBoardTouchStart = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked || !this.model) return;
        const touchId = event.getID();
        const location = event.getLocation();
        this.boardTouchTraces.set(touchId, {
            touchId,
            start: location.clone(),
            last: location.clone(),
            shakeTriggered: false,
        });
        this.pendingPileTaps.set(touchId, { touchId });
        this.updatePendingPileTap(touchId, location, event.windowId);
    };

    private readonly handleBoardTouchMove = (event: EventTouch): void => {
        if (this.state !== 'playing' || this.inputLocked || !this.model) {
            this.clearPendingPileTap(event.getID());
            this.boardTouchTraces.delete(event.getID());
            return;
        }
        const touchId = event.getID();
        const location = event.getLocation();
        const trace = this.boardTouchTraces.get(touchId);
        if (trace) {
            const stepX = location.x - trace.last.x;
            const stepY = location.y - trace.last.y;
            trace.last = location.clone();
            const totalDistance = Math.hypot(
                location.x - trace.start.x,
                location.y - trace.start.y,
            );
            const threshold = SHAKE_GESTURE_MIN_DISTANCE * (this.layout?.scale ?? 1);
            if (!trace.shakeTriggered && totalDistance >= threshold) {
                trace.shakeTriggered = true;
                this.applyShakeFromGesture(
                    touchId,
                    Math.abs(stepX) + Math.abs(stepY) > 0.5
                        ? new Vec2(stepX, stepY)
                        : new Vec2(location.x - trace.start.x, location.y - trace.start.y),
                    totalDistance,
                );
            }
            if (trace.shakeTriggered) return;
        }
        this.updatePendingPileTap(touchId, location, event.windowId);
    };

    private readonly handleBoardTouchEnd = (event: EventTouch): void => {
        const touchId = event.getID();
        const trace = this.boardTouchTraces.get(touchId);
        this.boardTouchTraces.delete(touchId);
        if (this.state !== 'playing'
            || this.inputLocked
            || !this.model) {
            this.clearPendingPileTap(touchId);
            return;
        }
        if (trace?.shakeTriggered) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // Resolve one final time at release so the item under the finger at
        // the exact moment of lifting is the one that gets picked up.
        this.updatePendingPileTap(touchId, event.getLocation(), event.windowId);
        const target = this.pendingPileTaps.get(touchId);
        if (!target
            || target.touchId !== touchId
            || !target.itemId
            || !target.type
            || !target.node) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // A previous rapid pickup may have rebuilt the pile and destroyed the
        // node captured on touch start. Resolve the current node by item ID so
        // the click is not lost just because its view was refreshed.
        const currentNode = this.pileItemNodes.get(target.itemId);
        const node = currentNode?.isValid ? currentNode : target.node;
        if (!node.isValid || node.parent !== this.pileRoot) {
            this.clearPendingPileTap(touchId);
            return;
        }
        // Keep the exact live node protected until handleItemTap either hands
        // it to pickupAnimations or rejects the selection. Releasing an active
        // merge can synchronously renderPile; dropping this owner before that
        // render destroyed the clicked node and made the accepted item appear
        // directly in the tray with no flight animation.
        this.pendingPileTaps.set(touchId, {
            touchId,
            itemId: target.itemId,
            type: target.type,
            node,
        });
        try {
            this.handleItemTap(target.itemId, node);
        } finally {
            this.clearPendingPileTap(touchId);
        }
    };

    private readonly handleBoardTouchCancel = (event: EventTouch): void => {
        this.boardTouchTraces.delete(event.getID());
        this.clearPendingPileTap(event.getID());
    };

    private applyShakeFromGesture(touchId: number, delta: Vec2, distance: number): void {
        const model = this.model;
        const metrics = this.layout;
        if (!model || !metrics) return;
        const length = Math.hypot(delta.x, delta.y);
        if (length <= 0.5) return;
        const shake: DesktopCleanupShakeInput = {
            x: delta.x / Math.max(1, metrics.boardWidth),
            y: delta.y / Math.max(1, metrics.boardHeight),
            strength: Math.min(1.8, Math.max(0.7, distance / Math.max(1, metrics.boardWidth * 0.24))),
        };
        if (!model.applyShake(shake)) return;
        this.clearPendingPileTap(touchId);
        this.context?.services.feedback.vibrate('light');
    }

    private updatePendingPileTap(touchId: number, screenLocation: Vec2, windowId: number): void {
        this.rebindPendingPileTapNodes();
        const previous = this.pendingPileTaps.get(touchId);
        if (!previous) return;
        // If the logical candidate is still active but its view is between
        // render generations, do not let hit testing fall through to a lower
        // item for this move/end event. The next render will rebind it by ID.
        if (this.isPendingPileTapCandidateUnbound(previous)) return;
        const target = this.findPileItemAt(screenLocation, windowId);
        const sameTarget = Boolean(
            target
            && previous.itemId === target.itemId,
        );
        if (sameTarget && target) {
            // The item node may have been recreated during a render while the
            // finger stayed down. Keep the logical candidate and refresh only
            // its view reference instead of allowing a lower item to win.
            if (previous.node !== target.node) {
                if (previous.node?.isValid && previous.type) {
                    this.setItemHighlight(previous.node, previous.type, false);
                }
                this.setItemHighlight(target.node, target.type, true);
                this.pendingPileTaps.set(touchId, {
                    touchId,
                    itemId: target.itemId,
                    type: target.type,
                    node: target.node,
                });
            }
            return;
        }
        if (previous.node?.isValid && previous.type) {
            this.setItemHighlight(previous.node, previous.type, false);
        }
        if (!target) {
            this.pendingPileTaps.set(touchId, { touchId });
            return;
        }
        this.setItemHighlight(target.node, target.type, true);
        this.pendingPileTaps.set(touchId, {
            touchId,
            itemId: target.itemId,
            type: target.type,
            node: target.node,
        });
    }

    private isPendingPileTapCandidateUnbound(pending: PendingPileTap): boolean {
        if (!pending.itemId) return false;
        const item = this.model?.snapshot.items.find(({ id }) => id === pending.itemId);
        if (!item?.active) return false;
        const node = this.pileItemNodes.get(pending.itemId);
        return !node?.isValid || node.parent !== this.pileRoot;
    }

    private rebindPendingPileTapNodes(): void {
        const pile = this.pileRoot;
        const snapshot = this.model?.snapshot;
        if (!pile || !snapshot) return;
        const activeItemIds = new Set(
            snapshot.items.filter((item) => item.active).map((item) => item.id),
        );
        this.pendingPileTaps.forEach((pending, touchId) => {
            if (!pending.itemId || !pending.type) return;
            // Another touch may have legitimately picked this candidate. Do
            // not keep a stale hold alive against an item that is no longer
            // part of the active desktop pile.
            if (!activeItemIds.has(pending.itemId)) {
                this.clearPendingPileTap(touchId);
                return;
            }
            const currentNode = this.pileItemNodes.get(pending.itemId);
            if (!currentNode?.isValid || currentNode.parent !== pile) return;
            if (pending.node === currentNode) return;
            if (pending.node?.isValid) {
                this.setItemHighlight(pending.node, pending.type, false);
            }
            this.setItemHighlight(currentNode, pending.type, true);
            this.pendingPileTaps.set(touchId, {
                ...pending,
                node: currentNode,
            });
        });
    }

    private clearPendingPileTap(touchId: number): void {
        const pending = this.pendingPileTaps.get(touchId);
        const node = pending?.itemId
            ? (this.pileItemNodes.get(pending.itemId) ?? pending.node)
            : pending?.node;
        if (node?.isValid && pending?.type) {
            this.setItemHighlight(node, pending.type, false);
        }
        this.pendingPileTaps.delete(touchId);
    }

    private clearPendingPileTaps(): void {
        [...this.pendingPileTaps.keys()].forEach((touchId) => this.clearPendingPileTap(touchId));
        this.boardTouchTraces.clear();
    }

    private findPileItemAt(
        screenLocation: Vec2,
        windowId: number,
    ): { readonly itemId: string; readonly type: DesktopCleanupItemType; readonly node: Node } | undefined {
        const snapshot = this.model?.snapshot;
        if (!snapshot) return undefined;
        const activeItems = new Map(
            snapshot.items.filter((item) => item.active).map((item) => [item.id, item] as const),
        );
        const ordered = [...this.pileItemNodes.entries()]
            .filter(([itemId, node]) => (
                activeItems.has(itemId)
                && node.isValid
                && node.parent === this.pileRoot
            ))
            .sort((left, right) => right[1].getSiblingIndex() - left[1].getSiblingIndex());
        for (const [itemId, node] of ordered) {
            const item = activeItems.get(itemId);
            const transform = node.getComponent(UITransform);
            if (item
                && transform?.hitTest(screenLocation, windowId)
                && this.hitTestItemPolygon(transform, item.type, screenLocation)) {
                return { itemId, type: item.type, node };
            }
        }
        return undefined;
    }

    private setItemHighlight(node: Node, type: DesktopCleanupItemType, highlighted: boolean): void {
        const existing = node.getChildByName('SelectionOutline');
        if (!highlighted) {
            if (existing?.isValid) this.destroyNode(existing);
            return;
        }
        if (existing?.isValid) return;
        const transform = node.getComponent(UITransform);
        const shape = ITEM_HIT_POLYGONS[type];
        if (!transform || !shape || shape.outer.length === 0) return;
        const width = Math.max(1, transform.contentSize.width);
        const height = Math.max(1, transform.contentSize.height);
        const outline = this.createNode(node, 'SelectionOutline', 0, 0, width, height);
        const graphics = outline.addComponent(Graphics);
        graphics.strokeColor = new Color(255, 248, 178, 255);
        graphics.lineWidth = Math.max(3, 5 * (this.layout?.scale ?? 1));
        const first = shape.outer[0];
        if (!first) {
            this.destroyNode(outline);
            return;
        }
        graphics.moveTo((first.x - 0.5) * width, (0.5 - first.y) * height);
        shape.outer.slice(1).forEach((point) => {
            graphics.lineTo((point.x - 0.5) * width, (0.5 - point.y) * height);
        });
        graphics.close();
        graphics.stroke();
    }

    private hitTestItemPolygon(
        transform: UITransform,
        type: DesktopCleanupItemType,
        screenLocation: Vec2,
    ): boolean {
        const shape = ITEM_HIT_POLYGONS[type];
        if (!shape) return false;
        const scene = this.node.scene;
        const canvasCamera = scene?.getComponentInChildren(Canvas)?.cameraComponent;
        const camera = canvasCamera ?? scene?.getComponentInChildren(Camera);
        if (!camera) return false;
        const world = camera.screenToWorld(new Vec3(screenLocation.x, screenLocation.y, 0));
        const local = transform.convertToNodeSpaceAR(world);
        const width = Math.max(1, transform.contentSize.width);
        const height = Math.max(1, transform.contentSize.height);
        const u = local.x / width + 0.5;
        const v = 0.5 - local.y / height;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
        return isPointInsideHitShape({ x: u, y: v }, shape);
    }

    private settlePendingImmediately(): void {
        const model = this.model;
        const pending = model?.snapshot.pendingSelections ?? [];
        if (!model && this.pickupAnimations.size === 0 && this.matchAnimations.size === 0) return;
        this.operationGeneration += 1;
        this.cancelPickupAnimations();
        this.cancelMatchAnimation();
        this.cancelSlotMoves();
        pending.forEach((selection) => model?.settleSelection(selection.token));
        model?.finalizeSelectionBatch();
        this.inputLocked = false;
        if (this.node.isValid) this.renderAll();
    }

    private registerGlobalInput(): void {
        input.on(Input.EventType.KEY_UP, this.handleKeyUp, this);
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleResize, this);
            this.resizeListening = true;
        }
    }

    private unregisterGlobalInput(): void {
        input.off(Input.EventType.KEY_UP, this.handleKeyUp, this);
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleResize, this);
            this.resizeListening = false;
        }
    }

    private readonly handleKeyUp = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE && this.state === 'playing') this.handlePause();
    };

    private readonly handleResize = (): void => {
        if (this.state === 'idle' || this.state === 'disposed') return;
        this.clearPendingPileTaps();
        this.settlePendingImmediately();
        const wasRules = this.state === 'rules';
        const rulesFirstTime = this.rulesFirstTime;
        const toolHelp = this.state === 'tool-help' ? this.activeToolHelp : undefined;
        const wasFailure = this.state === 'failed';
        const pauseModel = this.pauseModel;
        const resultModel = this.resultModel;
        this.rulesOverlay = undefined;
        this.toolHelpOverlay = undefined;
        this.failureOverlay = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.buildInterface();
        this.renderAll();
        if (wasRules) {
            this.state = 'playing';
            this.showRules(rulesFirstTime);
        }
        else if (toolHelp) {
            this.state = 'playing';
            this.inputLocked = false;
            this.showToolHelp(toolHelp);
        }
        else if (wasFailure) this.showFailure();
        else if (pauseModel) this.showPauseMenu(pauseModel);
        else if (resultModel) this.showResultView(resultModel);
        else if (this.state === 'playing') this.syncTerminalPhase();
    };

    private buildOverlay(
        name: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
        toolIcon?: DesktopCleanupTool,
    ): OverlayState {
        const metrics = this.layout ?? readDesktopCleanupLayout(this.node, this.context?.services.platform.getLayoutInfo());
        const root = this.createNode(this.node, name, 0, 0, metrics.width, metrics.height);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(15, 21, 32, 232);
        shade.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        shade.fill();
        const panelWidth = Math.min(metrics.width - 76 * metrics.scale, 610 * metrics.scale);
        const prototypePanelRatio = 1402 / 1122;
        const panelHeight = Math.min(
            metrics.height - metrics.safeTop - metrics.safeBottom - 48 * metrics.scale,
            panelWidth * prototypePanelRatio,
        );
        const panelY = (metrics.safeBottom - metrics.safeTop) / 2;
        const panel = this.createNode(root, 'ClayPanel', 0, panelY, panelWidth, panelHeight);
        const panelFallback = this.createNode(panel, 'Fallback', 0, 0, panelWidth, panelHeight);
        const panelGraphics = panelFallback.addComponent(Graphics);
        panelGraphics.fillColor = COLORS.paper;
        panelGraphics.strokeColor = COLORS.mustard;
        panelGraphics.lineWidth = 6 * metrics.scale;
        panelGraphics.roundRect(
            -panelWidth / 2,
            -panelHeight / 2,
            panelWidth,
            panelHeight,
            42 * metrics.scale,
        );
        panelGraphics.fill();
        panelGraphics.stroke();
        this.applyThemeFrame(panel, 'popupPanel');

        // The approved prototype uses the same game emblem as a tactile tab
        // that sits over the popup's top edge. Tool help keeps this universal
        // shell so every popup state reads as one visual system.
        void toolIcon;
        const emblem = this.createNode(
            panel,
            'PopupEmblem',
            0,
            panelHeight / 2 - 32 * metrics.scale,
            300 * metrics.scale,
            150 * metrics.scale,
        );
        const emblemFallback = this.createNode(emblem, 'Fallback', 0, 0, 300 * metrics.scale, 150 * metrics.scale);
        const emblemGraphics = emblemFallback.addComponent(Graphics);
        emblemGraphics.fillColor = COLORS.mustard;
        emblemGraphics.roundRect(-76 * metrics.scale, -24 * metrics.scale, 152 * metrics.scale, 48 * metrics.scale, 24 * metrics.scale);
        emblemGraphics.fill();
        this.applyThemeFrame(emblem, 'title');

        const top = panelHeight / 2;
        const titleY = top - 164 * metrics.scale;
        const dividerY = top - 226 * metrics.scale;
        const titleLabel = this.createLabel(panel, 'Title', title, 0, titleY, 50 * metrics.scale, COLORS.ink, panelWidth - 80 * metrics.scale, 70 * metrics.scale);
        titleLabel.isBold = true;
        const divider = this.createNode(panel, 'Divider', 0, dividerY, 420 * metrics.scale, 18 * metrics.scale);
        const dividerGraphics = divider.addComponent(Graphics);
        dividerGraphics.fillColor = COLORS.mustard;
        for (let x = -192 * metrics.scale; x <= 192 * metrics.scale; x += 13 * metrics.scale) {
            if (Math.abs(x) < 10 * metrics.scale) continue;
            dividerGraphics.circle(x, 0, 1.8 * metrics.scale);
        }
        dividerGraphics.circle(0, 0, 6 * metrics.scale);
        dividerGraphics.fill();
        const bodyWidth = Math.max(1, panelWidth - 144 * metrics.scale);
        const bodyLabel = this.createLabel(panel, 'Body', body, 0, 0, 24 * metrics.scale, COLORS.inkSoft, bodyWidth, Math.max(1, metrics.scale));
        const bodyTransform = bodyLabel.node.getComponent(UITransform);
        bodyTransform?.setAnchorPoint(0.5, 1);
        bodyLabel.node.setPosition(0, top - 260 * metrics.scale);
        bodyLabel.verticalAlign = 0;
        bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        bodyLabel.lineHeight = 36 * metrics.scale;
        bodyLabel.enableWrapText = true;
        bodyLabel.updateRenderData(true);
        const buttons: Button[] = [];
        const state: OverlayState = { root, buttons, busy: false };
        const buttonWidth = Math.min(420 * metrics.scale, panelWidth - 112 * metrics.scale);
        const buttonHeight = 104 * metrics.scale;
        const gap = 120 * metrics.scale;
        const bottomButtonY = -panelHeight / 2 + 122 * metrics.scale;
        const startY = bottomButtonY + (actions.length - 1) * gap;
        actions.forEach((action, index) => {
            const button = this.createPillButton(
                panel,
                action.name,
                0,
                startY - index * gap,
                buttonWidth,
                buttonHeight,
                action.label,
                action.tone,
                () => { void this.runOverlayAction(state, action); },
                action.adIcon === true,
            );
            buttons.push(button);
        });
        panel.setScale(0.94, 0.94, 1);
        tween(panel).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => { button.interactable = false; });
        try {
            await action.action();
        } catch (error: unknown) {
            console.error(`[DesktopCleanupGame] Overlay action ${action.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => { button.interactable = true; });
            }
        }
    }

    private setOverlayBusy(overlay: OverlayState | undefined, busy: boolean, label: string): void {
        if (!overlay?.root.isValid) return;
        overlay.busy = busy;
        overlay.buttons.forEach((button) => { button.interactable = !busy; });
        const first = overlay.buttons[0]?.node.getChildByName('Label')?.getComponent(Label);
        if (first && busy) first.string = label;
    }

    private createHeaderIconButton(
        name: string,
        x: number,
        y: number,
        icon: 'help' | 'pause',
        color: Color,
        handler: () => void,
    ): Button {
        const metrics = this.layout!;
        const size = 82 * metrics.scale;
        const node = this.createNode(this.node, name, x, y, size, size);
        node.addComponent(UIOpacity);
        const fallback = this.createNode(node, 'Fallback', 0, 0, size, size);
        const graphics = fallback.addComponent(Graphics);
        graphics.fillColor = COLORS.cream;
        graphics.strokeColor = color;
        graphics.lineWidth = 4 * metrics.scale;
        graphics.circle(0, 0, size * 0.44);
        graphics.fill();
        graphics.stroke();
        const glyph = this.createNode(fallback, 'Glyph', 0, 0, 38 * metrics.scale, 38 * metrics.scale);
        if (icon === 'help') this.drawHelpIcon(glyph, COLORS.ink);
        else this.drawPauseIcon(glyph, COLORS.ink);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler, this);
        return button;
    }

    private createSmallHelpButton(
        parent: Node,
        x: number,
        y: number,
        size: number,
        handler: () => void,
    ): Button {
        const node = this.createNode(parent, 'Help', x, y, size, size);
        const background = node.addComponent(Graphics);
        background.fillColor = new Color(255, 247, 220, 244);
        background.strokeColor = new Color(38, 45, 64, 165);
        background.lineWidth = Math.max(1.5, size * 0.06);
        background.circle(0, 0, size * 0.46);
        background.fill();
        background.stroke();
        const glyph = this.createNode(node, 'Glyph', 0, 0, size * 0.66, size * 0.66);
        this.drawHelpIcon(glyph, COLORS.ink);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.88;
        button.duration = 0.07;
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            handler();
        }, this);
        return button;
    }

    private drawHelpIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 32;
        const unit = size / 32;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(2, 3.8 * unit);
        graphics.moveTo(-7 * unit, 6 * unit);
        graphics.bezierCurveTo(-6 * unit, 14 * unit, 8 * unit, 14 * unit, 8 * unit, 5 * unit);
        graphics.bezierCurveTo(8 * unit, 0, 1 * unit, 0, 1 * unit, -5 * unit);
        graphics.stroke();
        graphics.circle(1 * unit, -11 * unit, 2.5 * unit);
        graphics.fill();
    }

    private drawPauseIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 32;
        const unit = size / 32;
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-10 * unit, -12 * unit, 7 * unit, 24 * unit, 3 * unit);
        graphics.roundRect(3 * unit, -12 * unit, 7 * unit, 24 * unit, 3 * unit);
        graphics.fill();
    }

    private drawClockIcon(node: Node, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 40;
        const unit = size / 40;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(2, 3.5 * unit);
        graphics.circle(0, -1 * unit, 15 * unit);
        graphics.stroke();
        graphics.moveTo(0, -1 * unit);
        graphics.lineTo(0, 8 * unit);
        graphics.moveTo(0, -1 * unit);
        graphics.lineTo(7 * unit, -6 * unit);
        graphics.stroke();
        graphics.roundRect(-6 * unit, 15 * unit, 12 * unit, 4 * unit, 2 * unit);
        graphics.fill();
    }

    private drawToolIcon(node: Node, tool: DesktopCleanupTool, color: Color): void {
        const size = node.getComponent(UITransform)?.contentSize.width ?? 60;
        const unit = size / 60;
        const graphics = node.addComponent(Graphics);
        graphics.strokeColor = color;
        graphics.fillColor = color;
        graphics.lineWidth = Math.max(3, 5 * unit);
        if (tool === 'return') {
            graphics.moveTo(21 * unit, -16 * unit);
            graphics.bezierCurveTo(21 * unit, 13 * unit, -9 * unit, 20 * unit, -19 * unit, 2 * unit);
            graphics.stroke();
            graphics.moveTo(-23 * unit, 7 * unit);
            graphics.lineTo(-20 * unit, -8 * unit);
            graphics.lineTo(-8 * unit, 1 * unit);
            graphics.close();
            graphics.fill();
            return;
        }
        if (tool === 'magnet') {
            graphics.moveTo(-20 * unit, 18 * unit);
            graphics.lineTo(-20 * unit, -4 * unit);
            graphics.bezierCurveTo(-20 * unit, -27 * unit, 20 * unit, -27 * unit, 20 * unit, -4 * unit);
            graphics.lineTo(20 * unit, 18 * unit);
            graphics.stroke();
            graphics.fillColor = new Color(255, 235, 174, 255);
            graphics.roundRect(-25 * unit, 12 * unit, 11 * unit, 11 * unit, 3 * unit);
            graphics.roundRect(14 * unit, 12 * unit, 11 * unit, 11 * unit, 3 * unit);
            graphics.fill();
            return;
        }
        graphics.moveTo(-22 * unit, 15 * unit);
        graphics.bezierCurveTo(-5 * unit, 15 * unit, 4 * unit, -15 * unit, 20 * unit, -15 * unit);
        graphics.moveTo(-22 * unit, -15 * unit);
        graphics.bezierCurveTo(-5 * unit, -15 * unit, 4 * unit, 15 * unit, 20 * unit, 15 * unit);
        graphics.stroke();
        graphics.moveTo(14 * unit, 22 * unit);
        graphics.lineTo(25 * unit, 15 * unit);
        graphics.lineTo(14 * unit, 8 * unit);
        graphics.close();
        graphics.moveTo(14 * unit, -8 * unit);
        graphics.lineTo(25 * unit, -15 * unit);
        graphics.lineTo(14 * unit, -22 * unit);
        graphics.close();
        graphics.fill();
    }

    private createPillButton(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        text: string,
        tone: OverlayAction['tone'],
        handler: () => void,
        showAdIcon = false,
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const fallback = this.createNode(node, 'Fallback', 0, 0, width, height);
        const graphics = fallback.addComponent(Graphics);
        const color = this.actionColor(tone);
        graphics.fillColor = new Color(30, 33, 45, 72);
        graphics.roundRect(-width / 2 + 4, -height / 2 - 6, width, height, height * 0.38);
        graphics.fill();
        graphics.fillColor = color;
        graphics.strokeColor = COLORS.paper;
        graphics.lineWidth = 3;
        graphics.roundRect(-width / 2, -height / 2, width, height, height * 0.38);
        graphics.fill();
        graphics.stroke();
        this.applyPopupButtonSlices(node, this.popupButtonFrameKey(tone), width, height);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler);
        const iconSize = Math.min(42, height - 22);
        const labelFontSize = Math.min(30, height * 0.34);
        const label = this.createLabel(
            node,
            'Label',
            text,
            0,
            0,
            labelFontSize,
            tone === 'paper' ? COLORS.ink : COLORS.paper,
            width - 20,
            height - 10,
        );
        // Button copy is always a single line. Label.SHRINK scales the glyphs
        // down when a longer action label exceeds the available text width.
        label.enableWrapText = false;
        label.overflow = Label.Overflow.SHRINK;
        if (showAdIcon) {
            const icon = attachRewardedVideoIcon(
                node,
                this.rewardedVideoIconFrame,
                0,
                0,
                iconSize,
            );
            layoutRewardedVideoIconBeforeLabel(
                icon,
                label,
                text,
                labelFontSize,
                iconSize,
                width,
            );
        }
        label.isBold = true;
        return button;
    }

    private applyPopupButtonSlices(node: Node, key: ThemeFrameKey, width: number, height: number): boolean {
        const frame = this.themeFrames.get(key);
        const sourceRect = frame?.rect;
        const texture = frame?.texture;
        if (!frame || !sourceRect || !texture) return false;
        const fallback = node.getChildByName('Fallback');
        if (fallback) fallback.active = false;

        // Keep the rounded ends at a fixed visual width and stretch only the
        // center strip. All three button tones use the same target geometry.
        const capWidth = Math.min(height * 0.78, width / 2 - 1);
        const centerWidth = Math.max(1, width - capWidth * 2);
        const sourceCapWidth = Math.min(
            sourceRect.width * POPUP_BUTTON_HORIZONTAL_INSET_RATIO,
            sourceRect.width / 2 - 1,
        );
        const sourceCenterWidth = Math.max(1, sourceRect.width - sourceCapWidth * 2);
        const slices = [
            {
                name: 'Left',
                x: -width / 2 + capWidth / 2,
                width: capWidth,
                sourceX: sourceRect.x,
                sourceWidth: sourceCapWidth,
            },
            {
                name: 'Center',
                x: 0,
                width: centerWidth,
                sourceX: sourceRect.x + sourceCapWidth,
                sourceWidth: sourceCenterWidth,
            },
            {
                name: 'Right',
                x: width / 2 - capWidth / 2,
                width: capWidth,
                sourceX: sourceRect.x + sourceRect.width - sourceCapWidth,
                sourceWidth: sourceCapWidth,
            },
        ] as const;

        slices.forEach((slice) => {
            const artwork = this.createNode(node, `Artwork${slice.name}`, slice.x, 0, slice.width, height);
            const partFrame = new SpriteFrame();
            partFrame.texture = texture;
            partFrame.rect = new Rect(slice.sourceX, sourceRect.y, slice.sourceWidth, sourceRect.height);
            partFrame.originalSize = new Size(slice.sourceWidth, sourceRect.height);
            partFrame.offset = new Vec2();
            this.popupButtonFrames.add(partFrame);
            const sprite = artwork.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.spriteFrame = partFrame;
        });
        return true;
    }

    private popupButtonFrameKey(tone: OverlayAction['tone']): ThemeFrameKey {
        if (tone === 'teal') return 'popupButtonTeal';
        if (tone === 'paper') return 'popupButtonPaper';
        return 'popupButtonCoral';
    }

    private createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(Math.max(1, width), Math.max(1, height));
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
        label.fontSize = Math.max(10, fontSize);
        label.lineHeight = Math.max(14, fontSize + 8);
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return label;
    }

    private actionColor(tone: OverlayAction['tone']): Color {
        if (tone === 'coral') return COLORS.coral;
        if (tone === 'teal') return COLORS.teal;
        if (tone === 'mustard') return COLORS.mustard;
        return new Color(116, 110, 110, 255);
    }

    private itemDisplaySize(type: DesktopCleanupItemType, scale: number): Size {
        const extent = type === 'lucky-badge' ? 184 * scale : 192 * scale;
        return new Size(extent, extent);
    }

    private fitItemSize(type: DesktopCleanupItemType, maximumWidth: number, maximumHeight: number): Size {
        void type;
        const edge = Math.min(maximumWidth, maximumHeight);
        return new Size(edge, edge);
    }

    private pilePosition(item: Pick<DesktopCleanupItemSnapshot, 'x' | 'y'>, metrics: DesktopCleanupLayoutMetrics): Vec3 {
        return new Vec3(
            item.x * metrics.boardWidth * 0.96,
            item.y * metrics.boardHeight * 0.96,
            0,
        );
    }

    private fitSize(width: number, height: number, maximumWidth: number, maximumHeight: number): Size {
        const scale = Math.min(maximumWidth / Math.max(1, width), maximumHeight / Math.max(1, height));
        return new Size(Math.max(1, width * scale), Math.max(1, height * scale));
    }

    private slotTargetInParent(parent: Node | null, index: number): Vec3 {
        const root = this.slotRoot;
        const rootTransform = root?.getComponent(UITransform);
        const parentTransform = parent?.getComponent(UITransform);
        if (!root || !rootTransform || !parent) return new Vec3();
        const width = rootTransform.contentSize.width;
        const cellWidth = width / this.config.slotCapacity;
        const clampedIndex = Math.max(0, Math.min(this.config.slotCapacity - 1, index));
        const local = new Vec3(-width / 2 + cellWidth * (clampedIndex + 0.5), 0, 0);
        const world = rootTransform.convertToWorldSpaceAR(local);
        if (parentTransform) return parentTransform.convertToNodeSpaceAR(world);
        // PickupAnimationRoot is a direct child of the game UI root, so this
        // conversion also works for its minimal UITransform.
        const ancestorTransform = parent.parent?.getComponent(UITransform);
        return ancestorTransform?.convertToNodeSpaceAR(world) ?? world;
    }

    private pulseSlot(index: number): void {
        const clampedIndex = Math.max(0, Math.min(this.config.slotCapacity - 1, index));
        const cell = this.slotRoot?.getChildByName(`Cell-${clampedIndex}`);
        if (!cell?.isValid) return;
        Tween.stopAllByTarget(cell);
        cell.setScale(1, 1, 1);
        tween(cell)
            .to(0.08, { scale: new Vec3(1.10, 1.10, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    private readonly hideHintToast = (): void => {
        const root = this.hintRoot;
        const opacity = root?.getComponent(UIOpacity);
        if (!root?.isValid || !opacity) return;
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(0.16, { opacity: 0 })
            .call(() => {
                if (root.isValid) root.active = false;
            })
            .start();
    };

    private setHint(message: string): void {
        this.unschedule(this.hideHintToast);
        const root = this.hintRoot;
        const label = this.hintLabel;
        const opacity = root?.getComponent(UIOpacity);
        if (!root || !label || !opacity) return;
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;
        if (!message.trim()) {
            root.active = false;
            label.string = '';
            return;
        }
        label.string = message;
        root.active = true;
        this.scheduleOnce(this.hideHintToast, 1.8);
    }

    private persistSave(): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        try {
            writeDesktopCleanupSave(storage, this.save);
        } catch (error: unknown) {
            console.error('[DesktopCleanupGame] Save failed.', error);
        }
    }

    private destroyAllOverlays(): void {
        this.destroyOverlay(this.rulesOverlay);
        this.destroyOverlay(this.toolHelpOverlay);
        this.destroyOverlay(this.failureOverlay);
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.rulesOverlay = undefined;
        this.toolHelpOverlay = undefined;
        this.activeToolHelp = undefined;
        this.failureOverlay = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
    }

    private destroyOverlay(overlay?: OverlayState): void {
        if (overlay?.root.isValid) this.destroyNode(overlay.root);
    }

    private destroyNode(node: Node): void {
        if (!node.isValid || this.destroyedNodes.has(node)) return;
        this.destroyedNodes.add(node);
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        const spriteFrame = node.getComponent(Sprite)?.spriteFrame;
        if (spriteFrame && this.popupButtonFrames.delete(spriteFrame)) spriteFrame.destroy();
        node.children.slice().forEach((child) => this.destroyNode(child));
        node.removeFromParent();
        node.destroy();
    }

    private isCurrent(generation: number): boolean {
        return generation === this.operationGeneration
            && this.state !== 'disposed'
            && this.node.isValid;
    }
}
