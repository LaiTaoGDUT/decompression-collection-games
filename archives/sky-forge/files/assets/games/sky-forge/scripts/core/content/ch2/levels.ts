import type { LevelDef } from '../../SfLevelTypes';
import type { WaveEvent } from '../../SfLevelTypes';

/**
 * 第 2 章编排（每关一个招牌段落，新敌人分摊到各关首次登场，空中与地面叠加出场）：
 * - 2-1 虫径：萤火虫与鳞粉蛾的空中虫群，预告月光蛾后的鳞粉帘幕；
 * - 2-2 蜜巢：孢子田——孢子母菇、抛雷的蘑菇炮手与滚球甲虫占住地面，虫链从上方穿过；
 * - 2-3 萤夜：黑暗林道里垂丝蜘蛛与两侧食人花的藤鞭封路；
 * - 2-4 共生：左右对称的夹击与阶梯，树精巫师首次登场；
 * - 2-5 古冠：本章机制的总复习与双精英。
 * 补给机跟随段落出现：热身段末、施压段中、喘息段与高潮前各一架左右。
 */

const L2_1: WaveEvent[] = [
    // 热身：萤火虫链与 V 字，认识“整链全歼掉零件”。
    { t: 0, f: 'firefly-chain', e: 'firefly', n: 8, x: 0, amp: 110, drop: 'main' },
    { t: 7, f: 'v', e: 'firefly', n: 7, x: -120, speed: 230 },
    { t: 11, f: 'v', e: 'firefly', n: 7, x: 120, speed: 230 },
    // 新敌人：鳞粉蛾单独从左侧飞过，留下会亮起的鳞粉。
    { t: 17, f: 'snake', e: 'dustmoth', n: 1, side: -1, amp: 150, speed: 230 },
    { t: 22, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 26, f: 'float', e: 'dandelion', n: 2, gap: 300, speed: 105 },
    // 施压：虫群从两侧夹击，鳞粉蛾成对交叉。
    { t: 33, f: 'pincer', e: 'firefly', n: 10, gap: 0.22, y: 0.2, drop: 'wing' },
    { t: 39, f: 'snake', e: 'dustmoth', n: 2, side: 1, amp: 170, gap: 0.7 },
    { t: 41, f: 'snake', e: 'dustmoth', n: 2, side: -1, amp: 170, gap: 0.7 },
    { t: 48, f: 'circle', e: 'firefly', n: 8, amp: 120, drop: 'special' },
    { t: 54, f: 'float', e: 'dandelion', n: 3, gap: 200, speed: 120 },
    { t: 58, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：鳞粉之雨——三只鳞粉蛾错开穿场，萤火虫阶梯压下。
    { t: 64, f: 'swoop', e: 'dustmoth', n: 3, side: -1, gap: 0.6 },
    { t: 66, f: 'stair', e: 'firefly', n: 6, side: 1, y: 0.84, hold: 1.4 },
    { t: 72, f: 'swoop', e: 'dustmoth', n: 3, side: 1, gap: 0.6, drop: 'main' },
    // 喘息：收零件。
    { t: 80, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮：长链 + 蒲公英 + 鳞粉蛾同场。
    { t: 89, f: 'firefly-chain', e: 'firefly', n: 12, x: 0, amp: 190, drop: 'wing' },
    { t: 93, f: 'float', e: 'dandelion', n: 3, gap: 220, speed: 130 },
    { t: 97, f: 'snake', e: 'dustmoth', n: 3, side: 1, amp: 190, gap: 0.6 },
    { t: 104, f: 'pincer', e: 'firefly', n: 12, gap: 0.2, y: 0.18 },
    { t: 108, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 112, f: 'swoop', e: 'dustmoth', n: 2, side: -1, gap: 0.6 },
];

const L2_2: WaveEvent[] = [
    // 热身：地面先出现会抛雷的蘑菇炮手，上方虫链。
    { t: 0, f: 'ground', e: 'shroom-gunner', n: 1, x: 0 },
    { t: 5, f: 'firefly-chain', e: 'firefly', n: 8, x: -80, amp: 120, drop: 'main' },
    // 新敌人：甲虫缩球滚动反弹。
    { t: 13, f: 'solo', e: 'beetle', n: 1, x: 0 },
    { t: 20, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 24, f: 'solo', e: 'beetle', n: 2, gap: 300 },
    { t: 27, f: 'v', e: 'firefly', n: 7, x: 0, speed: 240 },
    // 新敌人：孢子母菇——不断孵出孢子仔，优先打掉。
    { t: 34, f: 'ground', e: 'sporemother', n: 1, x: 0, drop: 'wing' },
    { t: 40, f: 'firefly-chain', e: 'firefly', n: 9, x: 110, amp: 120 },
    { t: 46, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：孢子田——两朵母菇 + 炮手占地，甲虫滚过，虫链从中间穿过。
    { t: 52, f: 'ground', e: 'sporemother', n: 2, gap: 380 },
    { t: 54, f: 'ground', e: 'shroom-gunner', n: 1, x: 0 },
    { t: 58, f: 'solo', e: 'beetle', n: 2, gap: 420, drop: 'special' },
    { t: 63, f: 'firefly-chain', e: 'firefly', n: 10, x: 0, amp: 90 },
    { t: 69, f: 'ground', e: 'shroom-gunner', n: 2, gap: 440 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 80, f: 'mimic', e: 'mimic', side: 1 },
    // 高潮：甲虫三连滚 + 鳞粉蛾 + 母菇。
    { t: 89, f: 'solo', e: 'beetle', n: 3, gap: 230, drop: 'main' },
    { t: 93, f: 'snake', e: 'dustmoth', n: 2, side: 1, amp: 160, gap: 0.7 },
    { t: 97, f: 'ground', e: 'sporemother', n: 1, x: -160 },
    { t: 99, f: 'ground', e: 'shroom-gunner', n: 1, x: 170 },
    { t: 104, f: 'circle', e: 'firefly', n: 9, amp: 140, drop: 'wing' },
    { t: 108, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 112, f: 'solo', e: 'beetle', n: 2, gap: 360 },
];

const L2_3: WaveEvent[] = [
    // 萤火之夜。热身：萤火虫照路，第一只垂丝蜘蛛在光圈前降下。
    { t: 0, f: 'firefly-chain', e: 'firefly', n: 9, amp: 140, drop: 'main' },
    { t: 9, f: 'solo', e: 'spider', n: 1, x: 0, y: 0.72 },
    { t: 19, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新敌人：食人花在两侧边缘，甩出横扫整行的藤鞭。
    { t: 23, f: 'edge', e: 'maneater', n: 1, side: -1 },
    { t: 29, f: 'edge', e: 'maneater', n: 1, side: 1 },
    { t: 32, f: 'v', e: 'firefly', n: 7, x: 0, speed: 230 },
    // 施压：蜘蛛成对，藤鞭从两侧封行。
    { t: 38, f: 'solo', e: 'spider', n: 2, gap: 360, y: 0.74, drop: 'wing' },
    { t: 41, f: 'edge', e: 'maneater', n: 2, hold: 2.2 },
    { t: 48, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    { t: 52, f: 'float', e: 'dandelion', n: 3, gap: 210, speed: 120 },
    // 招牌段：蛛网林道——三只蜘蛛错落降下，两侧食人花交替甩鞭，萤火阶梯从上压下。
    { t: 60, f: 'solo', e: 'spider', n: 3, gap: 240, y: 0.7, drop: 'special' },
    { t: 62, f: 'edge', e: 'maneater', n: 4, hold: 1.8 },
    { t: 68, f: 'stair', e: 'firefly', n: 6, side: -1, y: 0.86, hold: 1.2 },
    // 喘息。
    { t: 79, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮：长链 + 蜘蛛 + 鳞粉蛾。
    { t: 89, f: 'firefly-chain', e: 'firefly', n: 12, amp: 200, drop: 'main' },
    { t: 93, f: 'solo', e: 'spider', n: 2, gap: 420, y: 0.76 },
    { t: 97, f: 'snake', e: 'dustmoth', n: 2, side: 1, amp: 170, gap: 0.7 },
    { t: 102, f: 'edge', e: 'maneater', n: 2, hold: 1.6 },
    { t: 107, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    { t: 111, f: 'pincer', e: 'firefly', n: 10, gap: 0.22, y: 0.2 },
];

const L2_4: WaveEvent[] = [
    // 共生：几乎所有段落左右对称。树精巫师先独自展示淡出与停顿弹环。
    { t: 0, f: 'treant', e: 'treant', x: 0, y: 0.77, hold: 16 },
    { t: 10, f: 'pincer', e: 'firefly', n: 10, gap: 0.24, y: 0.22, drop: 'main' },
    { t: 18, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 22, f: 'edge', e: 'maneater', n: 2, hold: 0.1 },
    { t: 25, f: 'solo', e: 'beetle', n: 2, gap: 420 },
    // 施压：对称的母菇与蜘蛛。
    { t: 32, f: 'ground', e: 'sporemother', n: 2, gap: 420, drop: 'wing' },
    { t: 38, f: 'solo', e: 'spider', n: 2, gap: 300, y: 0.78 },
    { t: 44, f: 'stair', e: 'firefly', n: 6, side: -1, y: 0.86 },
    { t: 46, f: 'stair', e: 'firefly', n: 6, side: 1, y: 0.8 },
    { t: 50, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：双生镜像——左右同时出现同一种敌人，最后两只树精对称登场。
    { t: 56, f: 'swoop', e: 'dustmoth', n: 2, side: -1, gap: 0.7 },
    { t: 56, f: 'swoop', e: 'dustmoth', n: 2, side: 1, gap: 0.7 },
    { t: 62, f: 'ground', e: 'shroom-gunner', n: 2, gap: 460, drop: 'special' },
    { t: 66, f: 'solo', e: 'beetle', n: 2, gap: 320 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 79, f: 'mimic', e: 'mimic', side: -1 },
    // 精英段：两只树精左右呼应，其间虫链穿插。
    { t: 86, f: 'treant', e: 'treant', x: -150, y: 0.78, hold: 15, drop: 'main' },
    { t: 88, f: 'treant', e: 'treant', x: 150, y: 0.72, hold: 15 },
    { t: 95, f: 'firefly-chain', e: 'firefly', n: 10, x: 0, amp: 100 },
    { t: 102, f: 'edge', e: 'maneater', n: 2, hold: 0.1 },
    { t: 106, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 110, f: 'pincer', e: 'firefly', n: 12, gap: 0.2, y: 0.2 },
];

const L2_5: WaveEvent[] = [
    // 古冠：本章机制总复习，节奏更紧。
    { t: 0, f: 'firefly-chain', e: 'firefly', n: 10, amp: 170, drop: 'main' },
    { t: 5, f: 'ground', e: 'shroom-gunner', n: 2, gap: 380 },
    { t: 11, f: 'solo', e: 'beetle', n: 2, gap: 300 },
    { t: 17, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 21, f: 'snake', e: 'dustmoth', n: 3, side: -1, amp: 170, gap: 0.6 },
    { t: 25, f: 'edge', e: 'maneater', n: 2, hold: 1.4 },
    // 施压：母菇孵化 + 蜘蛛封路 + 树精。
    { t: 32, f: 'ground', e: 'sporemother', n: 1, x: 0, drop: 'wing' },
    { t: 35, f: 'solo', e: 'spider', n: 2, gap: 420, y: 0.76 },
    { t: 41, f: 'treant', e: 'treant', x: 0, y: 0.8, hold: 14 },
    { t: 47, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    { t: 52, f: 'circle', e: 'firefly', n: 10, amp: 150, drop: 'special' },
    // 招牌段：森林总攻——地面母菇与炮手、空中甲虫与鳞粉蛾、两侧藤鞭同时施压。
    { t: 60, f: 'ground', e: 'sporemother', n: 2, gap: 400 },
    { t: 61, f: 'ground', e: 'shroom-gunner', n: 1, x: 0 },
    { t: 64, f: 'solo', e: 'beetle', n: 3, gap: 230 },
    { t: 67, f: 'swoop', e: 'dustmoth', n: 2, side: 1, gap: 0.7 },
    { t: 70, f: 'edge', e: 'maneater', n: 2, hold: 1.2 },
    // 喘息。
    { t: 78, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮：双精英 + 长链。
    { t: 87, f: 'treant', e: 'treant', x: -140, y: 0.78, hold: 13, drop: 'main' },
    { t: 89, f: 'solo', e: 'spider', n: 1, x: 170, y: 0.7 },
    { t: 95, f: 'firefly-chain', e: 'firefly', n: 12, amp: 195, speed: 270, drop: 'wing' },
    { t: 100, f: 'pincer', e: 'firefly', n: 10, gap: 0.22, y: 0.2 },
    { t: 104, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 108, f: 'snake', e: 'dustmoth', n: 3, side: 1, amp: 190, gap: 0.6 },
];

/** 第 2 章 5 关；三星线约为自动驾驶模拟得分的 1.15～1.2 倍。 */
export const CH2_LEVELS: LevelDef[] = [
    { id: '2-1', chapter: 2, index: 1, number: 6, name: '蘑菇森林 · 虫径', boss: 'moth', tier: 'small', bossAt: 120, waves: L2_1, scroll: 80, starScore: 32500, intro: '虫链全歼掉零件；鳞粉蛾飞过的路线一秒后会变成弹幕。' },
    { id: '2-2', chapter: 2, index: 2, number: 7, name: '蘑菇森林 · 蜜巢', boss: 'hive', tier: 'mid', bossAt: 124, waves: L2_2, scroll: 82, starScore: 40500, intro: '孢子母菇会不断孵出孢子仔，先打掉它；甲虫缩球后会在两侧反弹。' },
    { id: '2-3', chapter: 2, index: 3, number: 8, name: '蘑菇森林 · 萤夜', boss: 'lanternshroom', tier: 'small', bossAt: 122, waves: L2_3, scroll: 84, starScore: 30000, rule: 'night', intro: '蛛网会让你变慢，藤鞭的绿色虚线亮起就离开那一行；打灭巨菇灯笼，本体便会暴露弱点。' },
    { id: '2-4', chapter: 2, index: 4, number: 9, name: '蘑菇森林 · 共生', boss: 'twinshroom', tier: 'mid', bossAt: 124, waves: L2_4, scroll: 86, starScore: 42000, intro: '树精淡出后会在上半屏再现；共生蘑菇须在八秒内先后击倒。' },
    { id: '2-5', chapter: 2, index: 5, number: 10, name: '蘑菇森林 · 古冠', boss: 'treeking', tier: 'big', bossAt: 120, waves: L2_5, scroll: 88, starScore: 63500, intro: '破坏双臂疏开叶帘，追随睁开的眼睛攻击树王。' },
];
