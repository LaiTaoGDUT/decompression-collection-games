import type { LevelDef, WaveEvent } from '../../SfLevelTypes';

/**
 * 第 3 章编排（每关一个招牌段落，新敌人分摊到各关首次登场，海面与空中叠加出场）：
 * - 3-1 破浪：雷区——布雷机的水雷阵与雷鱼突刺；
 * - 3-2 电涌：激光走廊——两侧激光平台交叉扫射，直升炮机悬停；
 * - 3-3 引雷：导弹快艇群在落雷中穿行，落雷也能炸沉快艇；
 * - 3-4 潜锋：护盾舰队——护盾无人机罩住驱逐舰与鲨艇；
 * - 3-5 风眼：全机制总复习。
 */
const L3_1: WaveEvent[] = [
    // 热身：雷鱼单独示范锁定突刺，电网成对。
    { t: 0, f: 'charge', e: 'thunderfish', n: 1, x: 0 },
    { t: 5, f: 'charge', e: 'thunderfish', n: 3, gap: 200, drop: 'main' },
    { t: 12, f: 'buoy-pair', e: 'buoy', n: 2, gap: 420 },
    { t: 18, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新敌人：布雷机悬停后投下 3×2 水雷阵。
    { t: 23, f: 'solo', e: 'minelayer', n: 1, x: 0 },
    { t: 33, f: 'charge', e: 'thunderfish', n: 4, gap: 160 },
    { t: 39, f: 'ground', e: 'destroyer', n: 1, x: -150, drop: 'wing' },
    { t: 45, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：雷区——两架布雷机左右布雷，雷鱼从雷阵缝隙里突刺，电网封住上方。
    { t: 52, f: 'solo', e: 'minelayer', n: 2, gap: 360, drop: 'special' },
    { t: 58, f: 'charge', e: 'thunderfish', n: 5, gap: 130 },
    { t: 63, f: 'buoy-pair', e: 'buoy', n: 2, gap: 480 },
    { t: 68, f: 'charge', e: 'thunderfish', n: 4, gap: 170 },
    // 喘息。
    { t: 78, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮：驱逐舰 + 布雷 + 雷鱼。
    { t: 88, f: 'ground', e: 'destroyer', n: 2, gap: 340, drop: 'main' },
    { t: 92, f: 'solo', e: 'minelayer', n: 1, x: 0 },
    { t: 99, f: 'charge', e: 'thunderfish', n: 5, gap: 128 },
    { t: 104, f: 'buoy-pair', e: 'buoy', n: 4, gap: 480, drop: 'wing' },
    { t: 108, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 112, f: 'charge', e: 'thunderfish', n: 4, gap: 170 },
];

const L3_2: WaveEvent[] = [
    // 热身：直升炮机悬停扫射。
    { t: 0, f: 'hover', e: 'heli', n: 1, x: 0 },
    { t: 9, f: 'charge', e: 'thunderfish', n: 4, gap: 160, drop: 'main' },
    // 新敌人：激光平台——红色虚线锁定后发射扫向玩家的激光。
    { t: 16, f: 'ground', e: 'laserdeck', n: 1, x: -170 },
    { t: 22, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 27, f: 'hover', e: 'heli', n: 2, gap: 340, drop: 'wing' },
    { t: 33, f: 'ground', e: 'laserdeck', n: 1, x: 170 },
    { t: 38, f: 'buoy-pair', e: 'buoy', n: 2, gap: 440 },
    { t: 46, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：激光走廊——左右两座平台交叉扫射，直升机与驱逐舰在中间施压。
    { t: 52, f: 'ground', e: 'laserdeck', n: 2, gap: 470, drop: 'special' },
    { t: 56, f: 'hover', e: 'heli', n: 1, x: 0, y: 0.78 },
    { t: 62, f: 'ground', e: 'destroyer', n: 1, x: 0 },
    { t: 67, f: 'charge', e: 'thunderfish', n: 4, gap: 150 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 79, f: 'mimic', e: 'mimic', side: -1 },
    // 精英段：重装舰队与平台。
    { t: 86, f: 'ground', e: 'destroyer', n: 2, gap: 330, drop: 'main' },
    { t: 90, f: 'hover', e: 'heli', n: 3, gap: 200 },
    { t: 96, f: 'ground', e: 'laserdeck', n: 1, x: 0 },
    { t: 101, f: 'solo', e: 'minelayer', n: 1, x: -150 },
    { t: 106, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 110, f: 'charge', e: 'thunderfish', n: 5, gap: 130 },
];

const L3_3: WaveEvent[] = [
    // 雷暴。热身：熟悉的雷鱼与电网，八秒后落雷开始。
    { t: 0, f: 'charge', e: 'thunderfish', n: 3, gap: 180, drop: 'main' },
    { t: 7, f: 'buoy-pair', e: 'buoy', n: 2, gap: 420 },
    // 新敌人：导弹快艇——可击落的慢速追踪导弹，落雷也能炸沉它。
    { t: 14, f: 'ground', e: 'missileboat', n: 1, x: 0 },
    { t: 21, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 25, f: 'hover', e: 'heli', n: 2, gap: 340 },
    { t: 31, f: 'ground', e: 'missileboat', n: 2, gap: 360, drop: 'wing' },
    { t: 38, f: 'charge', e: 'thunderfish', n: 4, gap: 160 },
    { t: 45, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：快艇群——三艇错落卷入，导弹与落雷同时逼你走位。
    { t: 52, f: 'ground', e: 'missileboat', n: 3, gap: 230, drop: 'special' },
    { t: 57, f: 'buoy-pair', e: 'buoy', n: 2, gap: 480 },
    { t: 63, f: 'solo', e: 'minelayer', n: 1, x: 0 },
    { t: 69, f: 'charge', e: 'thunderfish', n: 5, gap: 128 },
    // 喘息（落雷仍在，可借雷清场）。
    { t: 78, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮。
    { t: 88, f: 'ground', e: 'laserdeck', n: 1, x: 160 },
    { t: 90, f: 'ground', e: 'missileboat', n: 1, x: -170, drop: 'main' },
    { t: 96, f: 'hover', e: 'heli', n: 2, gap: 360 },
    { t: 102, f: 'buoy-pair', e: 'buoy', n: 4, gap: 480 },
    { t: 107, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 111, f: 'charge', e: 'thunderfish', n: 4, gap: 170 },
];

const L3_4: WaveEvent[] = [
    // 海面精英先单独登场：看潜航，再看浮出鱼雷。
    { t: 0, f: 'shark-patrol', e: 'sharksub', n: 1, x: 0 },
    { t: 11, f: 'charge', e: 'thunderfish', n: 4, gap: 170, drop: 'main' },
    { t: 17, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    // 新敌人：护盾无人机罩住驱逐舰——先打无人机。
    { t: 22, f: 'ground', e: 'destroyer', n: 1, x: 0 },
    { t: 25, f: 'hover', e: 'shielddrone', n: 1, x: 0, y: 0.84, hold: 9 },
    { t: 35, f: 'hover', e: 'heli', n: 2, gap: 330, drop: 'wing' },
    { t: 40, f: 'ground', e: 'missileboat', n: 1, x: 160 },
    { t: 46, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：护盾舰队——两艘驱逐舰与导弹快艇各被一架无人机守护，雷鱼骚扰。
    { t: 52, f: 'ground', e: 'destroyer', n: 2, gap: 380, drop: 'special' },
    { t: 54, f: 'hover', e: 'shielddrone', n: 2, gap: 380, y: 0.86, hold: 10 },
    { t: 60, f: 'ground', e: 'missileboat', n: 1, x: 0 },
    { t: 66, f: 'charge', e: 'thunderfish', n: 4, gap: 160 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 79, f: 'mimic', e: 'mimic', side: -1 },
    // 精英段：两艘鲨艇分列两侧，护盾无人机罩住它们。
    { t: 86, f: 'shark-patrol', e: 'sharksub', n: 2, gap: 300, drop: 'main' },
    { t: 89, f: 'hover', e: 'shielddrone', n: 1, x: 0, y: 0.86, hold: 10 },
    { t: 96, f: 'ground', e: 'laserdeck', n: 1, x: 0 },
    { t: 102, f: 'hover', e: 'heli', n: 2, gap: 340 },
    { t: 106, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 110, f: 'charge', e: 'thunderfish', n: 4, gap: 168 },
];

const L3_5: WaveEvent[] = [
    // 风眼：本章机制总复习。
    { t: 0, f: 'charge', e: 'thunderfish', n: 4, gap: 160, drop: 'main' },
    { t: 5, f: 'buoy-pair', e: 'buoy', n: 2, gap: 440 },
    { t: 10, f: 'solo', e: 'minelayer', n: 1, x: 0 },
    { t: 17, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 21, f: 'ground', e: 'laserdeck', n: 1, x: -170 },
    { t: 24, f: 'hover', e: 'heli', n: 2, gap: 340, drop: 'wing' },
    // 施压：护盾舰队 + 导弹快艇。
    { t: 31, f: 'ground', e: 'destroyer', n: 1, x: 120 },
    { t: 33, f: 'hover', e: 'shielddrone', n: 1, x: 120, y: 0.86, hold: 9 },
    { t: 39, f: 'ground', e: 'missileboat', n: 2, gap: 380 },
    { t: 45, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：铁潮总攻——鲨艇、激光平台、布雷机同时出现，雷鱼穿插。
    { t: 52, f: 'shark-patrol', e: 'sharksub', n: 1, x: 0, drop: 'special' },
    { t: 54, f: 'ground', e: 'laserdeck', n: 2, gap: 480 },
    { t: 60, f: 'solo', e: 'minelayer', n: 2, gap: 380 },
    { t: 66, f: 'charge', e: 'thunderfish', n: 5, gap: 130 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮。
    { t: 86, f: 'shark-patrol', e: 'sharksub', n: 2, gap: 300, drop: 'main' },
    { t: 88, f: 'hover', e: 'shielddrone', n: 1, x: 0, y: 0.86, hold: 10 },
    { t: 95, f: 'ground', e: 'missileboat', n: 1, x: 0 },
    { t: 100, f: 'buoy-pair', e: 'buoy', n: 2, gap: 480 },
    { t: 104, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 108, f: 'charge', e: 'thunderfish', n: 5, gap: 128, drop: 'wing' },
];

/** 第 3 章恰好五关；三星线约为自动驾驶模拟得分的 1.15～1.2 倍。 */
export const CH3_LEVELS: LevelDef[] = [
    { id: '3-1', chapter: 3, index: 1, number: 11, name: '雷暴钢海 · 破浪', boss: 'rhino', tier: 'small', bossAt: 122, waves: L3_1, scroll: 88, starScore: 29000, intro: '锁定后横移躲雷鱼；布雷机投下的水雷靠近才会引爆，可以先打掉。' },
    { id: '3-2', chapter: 3, index: 2, number: 12, name: '雷暴钢海 · 电涌', boss: 'emship', tier: 'mid', bossAt: 124, waves: L3_2, scroll: 90, starScore: 47500, intro: '激光平台的红色虚线锁定后会发射扫向你的激光；电磁舰线圈充能时避开横向电束。' },
    { id: '3-3', chapter: 3, index: 3, number: 13, name: '雷暴钢海 · 引雷', boss: 'rodship', tier: 'small', bossAt: 126, waves: L3_3, scroll: 92, starScore: 28000, rule: 'storm', intro: '落雷敌我皆伤，导弹快艇的导弹可以击落；把预警柱引到避雷飞艇附近后立即横移。' },
    { id: '3-4', chapter: 3, index: 4, number: 14, name: '雷暴钢海 · 潜锋', boss: 'steelwhale', tier: 'mid', bossAt: 120, waves: L3_4, scroll: 94, starScore: 38000, intro: '护盾无人机罩住的敌人几乎打不动，先打无人机；鲨艇浮出时才会受伤。' },
    { id: '3-5', chapter: 3, index: 5, number: 15, name: '雷暴钢海 · 风眼', boss: 'typhon', tier: 'big', bossAt: 118, waves: L3_5, scroll: 96, starScore: 70500, intro: '击破电塔打开雷笼缺口，避开旋转十字，留意风暴眼由收拢转为爆散。' },
];
