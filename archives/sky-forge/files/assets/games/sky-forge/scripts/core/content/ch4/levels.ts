import type { LevelDef, WaveEvent } from '../../SfLevelTypes';

/**
 * 第 4 章编排（动词：地形——熔岩滩会改写可走的区域）：
 * - 4-1 火口：火蝠群聚 + 史莱姆弹跳留滩 + 火山落石；
 * - 4-2 矿道：轨道先亮再有矿车冲过，间歇泉与熔炉矿工机把地面烧成熔岩；
 * - 4-3 喷发：规则关，玩家脚下周期性喷发，熔岩滩与弹跳史莱姆叠加；
 * - 4-4 钻井：黑曜石魔像与交叉矿轨；
 * - 4-5 炼狱：全机制总复习。
 */
const L4_1: WaveEvent[] = [
    // 热身：一群火蝠示范“打进群里会散开”。
    { t: 0, f: 'flock', e: 'firebat', n: 10, side: -1 },
    { t: 8, f: 'flock', e: 'firebat', n: 12, side: 1, drop: 'main' },
    // 新敌人：熔岩史莱姆——看阴影圈，落地留滩。
    { t: 16, f: 'hop', e: 'lavaslime', n: 1, x: 0 },
    { t: 21, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 25, f: 'hop', e: 'lavaslime', n: 3, gap: 220, drop: 'wing' },
    // 新敌人：火山落石——阴影圈标出落点。
    { t: 33, f: 'rockfall', e: 'boulder', n: 3, gap: 0.8 },
    { t: 39, f: 'flock', e: 'firebat', n: 12, side: -1 },
    { t: 46, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：火口——蝠群在头顶游走，史莱姆在下方留滩，落石逼你换位。
    { t: 52, f: 'flock-pincer', e: 'firebat', n: 16, drop: 'special' },
    { t: 56, f: 'hop-stair', e: 'lavaslime', n: 4, side: -1 },
    { t: 62, f: 'rockfall', e: 'boulder', n: 4, gap: 0.6 },
    { t: 68, f: 'hop', e: 'lavaslime', n: 3, gap: 240 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 80, f: 'mimic', e: 'mimic', side: 1 },
    // 高潮。
    { t: 88, f: 'flock', e: 'firebat', n: 14, side: 1, drop: 'main' },
    { t: 92, f: 'hop-stair', e: 'lavaslime', n: 5, side: 1 },
    { t: 99, f: 'rockfall', e: 'boulder', n: 5, gap: 0.5 },
    { t: 105, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 109, f: 'flock-pincer', e: 'firebat', n: 18 },
];

const L4_2: WaveEvent[] = [
    // 热身：火蝠 + 第一条直轨（先看轨道亮，再看矿车冲过）。
    { t: 0, f: 'flock', e: 'firebat', n: 10, side: 1 },
    { t: 7, f: 'rail', e: 'minecart', n: 2, x: -150, drop: 'main' },
    { t: 14, f: 'rail', e: 'minecart', n: 2, x: 170 },
    { t: 19, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新敌人：熔岩间歇泉。
    { t: 23, f: 'ground', e: 'geyser', n: 1, x: 0 },
    { t: 29, f: 'rail-s', e: 'minecart', n: 3, side: -1, amp: 190, drop: 'wing' },
    // 新敌人：熔炉矿工机——蓄热时打掉。
    { t: 36, f: 'hover', e: 'furnace', n: 1, x: 0, y: 0.76, hold: 5 },
    { t: 44, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：矿道——间歇泉成排、矿车在泉之间穿梭、熔炉在上方喷火。
    { t: 50, f: 'edge', e: 'geyser', n: 2, gap: 90, hold: 1.2, drop: 'special' },
    { t: 54, f: 'rail', e: 'minecart', n: 3, x: 0 },
    { t: 60, f: 'hover', e: 'furnace', n: 2, gap: 380, y: 0.78, hold: 5 },
    { t: 66, f: 'flock', e: 'firebat', n: 12, side: -1 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮。
    { t: 84, f: 'rail-s', e: 'minecart', n: 3, side: 1, amp: 210 },
    { t: 88, f: 'ground', e: 'geyser', n: 2, gap: 300, drop: 'main' },
    { t: 94, f: 'escort', e: 'furnace', n: 5, x: 0, y: 0.8, hold: 5, escort: 'firebat' },
    { t: 101, f: 'rail', e: 'minecart', n: 2, x: -200 },
    { t: 104, f: 'rail', e: 'minecart', n: 2, x: 200 },
    { t: 107, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 111, f: 'flock-pincer', e: 'firebat', n: 16 },
];

const L4_3: WaveEvent[] = [
    // 火山喷发：八秒后脚下开始喷发。热身用熟悉的单位。
    { t: 0, f: 'flock', e: 'firebat', n: 10, side: -1, drop: 'main' },
    { t: 7, f: 'hop', e: 'lavaslime', n: 2, gap: 300 },
    { t: 14, f: 'rockfall', e: 'boulder', n: 3, gap: 0.8 },
    { t: 20, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 25, f: 'rail', e: 'minecart', n: 2, x: 0 },
    { t: 31, f: 'hover', e: 'furnace', n: 1, x: -150, y: 0.78, hold: 5, drop: 'wing' },
    { t: 38, f: 'hop-stair', e: 'lavaslime', n: 4, side: 1 },
    { t: 45, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：熔岩地形——喷发、史莱姆、间歇泉三种熔岩来源叠加，可借喷发清掉敌人。
    { t: 52, f: 'ground', e: 'geyser', n: 2, gap: 340, drop: 'special' },
    { t: 56, f: 'hop', e: 'lavaslime', n: 3, gap: 220 },
    { t: 62, f: 'flock-pincer', e: 'firebat', n: 16 },
    { t: 68, f: 'rockfall', e: 'boulder', n: 4, gap: 0.6 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 80, f: 'mimic', e: 'mimic', side: -1 },
    // 高潮。
    { t: 88, f: 'rail-s', e: 'minecart', n: 3, side: -1, amp: 200, drop: 'main' },
    { t: 93, f: 'hover', e: 'furnace', n: 2, gap: 360, y: 0.8, hold: 5 },
    { t: 99, f: 'hop-stair', e: 'lavaslime', n: 5, side: -1 },
    { t: 106, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 110, f: 'flock', e: 'firebat', n: 14, side: 1 },
];

const L4_4: WaveEvent[] = [
    // 精英先单独登场：看水晶旋转挡弹，打碎全部水晶再打本体。
    { t: 0, f: 'elite', e: 'golem', n: 1, x: 0, y: 0.74, hold: 14 },
    { t: 15, f: 'flock', e: 'firebat', n: 12, side: 1, drop: 'main' },
    { t: 21, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新编排：交叉双轨。
    { t: 25, f: 'rail-x', e: 'minecart', n: 2, drop: 'wing' },
    { t: 33, f: 'ground', e: 'geyser', n: 2, gap: 360 },
    { t: 38, f: 'hop', e: 'lavaslime', n: 3, gap: 220 },
    { t: 45, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：钻井——魔像坐镇，矿车护航（轨道从魔像两侧通过）。
    { t: 50, f: 'elite', e: 'golem', n: 1, x: 0, y: 0.76, hold: 14, drop: 'special' },
    { t: 53, f: 'rail', e: 'minecart', n: 2, x: -240 },
    { t: 57, f: 'rail', e: 'minecart', n: 2, x: 240 },
    { t: 63, f: 'rockfall', e: 'boulder', n: 4, gap: 0.6 },
    { t: 69, f: 'hover', e: 'furnace', n: 1, x: 0, y: 0.82, hold: 5 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮。
    { t: 85, f: 'rail-x', e: 'minecart', n: 3, drop: 'main' },
    { t: 90, f: 'flock-pincer', e: 'firebat', n: 18 },
    { t: 96, f: 'edge', e: 'geyser', n: 2, gap: 90, hold: 1.4 },
    { t: 101, f: 'hop-stair', e: 'lavaslime', n: 5, side: 1 },
    { t: 106, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 110, f: 'rockfall', e: 'boulder', n: 5, gap: 0.5 },
];

const L4_5: WaveEvent[] = [
    // 炼狱：本章机制总复习。
    { t: 0, f: 'flock-pincer', e: 'firebat', n: 16, drop: 'main' },
    { t: 6, f: 'rail', e: 'minecart', n: 2, x: 0 },
    { t: 12, f: 'hop', e: 'lavaslime', n: 3, gap: 220 },
    { t: 18, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 22, f: 'hover', e: 'furnace', n: 2, gap: 380, y: 0.78, hold: 5, drop: 'wing' },
    { t: 28, f: 'ground', e: 'geyser', n: 2, gap: 340 },
    { t: 34, f: 'rockfall', e: 'boulder', n: 4, gap: 0.6 },
    { t: 40, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：魔像 + 交叉双轨 + 蝠群。
    { t: 46, f: 'elite', e: 'golem', n: 1, x: 0, y: 0.76, hold: 14, drop: 'special' },
    { t: 49, f: 'rail-x', e: 'minecart', n: 2 },
    { t: 56, f: 'flock', e: 'firebat', n: 14, side: -1 },
    { t: 62, f: 'hop-stair', e: 'lavaslime', n: 4, side: 1 },
    // 喘息。
    { t: 72, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮。
    { t: 80, f: 'rail-s', e: 'minecart', n: 3, side: 1, amp: 210, drop: 'main' },
    { t: 84, f: 'escort', e: 'furnace', n: 5, x: 0, y: 0.8, hold: 5, escort: 'firebat' },
    { t: 90, f: 'edge', e: 'geyser', n: 2, gap: 90, hold: 1.2 },
    { t: 95, f: 'rockfall', e: 'boulder', n: 5, gap: 0.5 },
    { t: 100, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 104, f: 'flock-pincer', e: 'firebat', n: 18, drop: 'wing' },
];

/** 第 4 章恰好五关；三星线约为自动驾驶模拟得分（先锋 16 级、零件 5 级）的 1.15～1.2 倍。 */
export const CH4_LEVELS: LevelDef[] = [
    { id: '4-1', chapter: 4, index: 1, number: 16, name: '熔岩火山 · 火口', boss: 'magmatoad', tier: 'small', bossAt: 120, waves: L4_1, scroll: 98, starScore: 25500, intro: '子弹打进火蝠群会把它们驱散；史莱姆落地前先看阴影圈，熔岩滩会烧三秒。' },
    { id: '4-2', chapter: 4, index: 2, number: 17, name: '熔岩火山 · 矿道', boss: 'lavaworm', tier: 'mid', bossAt: 122, waves: L4_2, scroll: 100, starScore: 31000, intro: '轨道亮起后矿车会冲过并向两侧抛石；熔炉矿工机蓄热时打掉它，别等它喷火。' },
    { id: '4-3', chapter: 4, index: 3, number: 18, name: '熔岩火山 · 喷发', boss: 'magmaray', tier: 'small', bossAt: 124, waves: L4_3, scroll: 102, starScore: 23000, rule: 'eruption', intro: '火山喷发：预警圈会喷出岩浆柱并留下熔岩滩，敌人站在圈里同样会被烧伤。' },
    { id: '4-4', chapter: 4, index: 4, number: 19, name: '熔岩火山 · 钻井', boss: 'infernodrill', tier: 'mid', bossAt: 118, waves: L4_4, scroll: 104, starScore: 40000, intro: '黑曜石魔像的水晶全部打碎才能伤到本体；钻探机的钻臂打掉一条，喷浆就少一路。' },
    { id: '4-5', chapter: 4, index: 5, number: 20, name: '熔岩火山 · 炼狱', boss: 'oniblade', tier: 'big', bossAt: 116, waves: L4_5, scroll: 106, starScore: 54000, intro: '武神居合斩出的熔岩裂缝会把战场切成几块，留在没有被切到的格子里。' },
];
