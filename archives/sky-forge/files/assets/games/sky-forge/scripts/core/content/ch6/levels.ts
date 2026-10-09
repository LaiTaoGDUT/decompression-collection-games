import type { LevelDef, WaveEvent } from '../../SfLevelTypes';

/**
 * 第 6 章编排（终章，动词：空间——传送、牵引、引力弯曲）：
 * - 6-1 星海：虚空水母的脉冲波、闪现的虚空兵、第一对虚空裂缝；
 * - 6-2 千眼：卫星群轮转、异星飞碟的牵引光束；
 * - 6-3 引力井：规则关，两口引力井弯曲所有子弹；
 * - 6-4 母舰：星界守卫镜盾 + 闪现包围；
 * - 6-5 终焉：全机制总复习。
 */
const L6_1: WaveEvent[] = [
    // 热身：水母飘落，第一次看到脉冲波和缺口。
    { t: 0, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 300 },
    { t: 7, f: 'swoop', e: 'voidtrooper', n: 5, side: -1, drop: 'main' },
    // 新敌人：虚空兵——先亮标记，再按顺序闪现。
    { t: 13, f: 'blink', e: 'voidtrooper', n: 5, side: -1 },
    { t: 21, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 25, f: 'float', e: 'voidjelly', n: 3, x: 0, gap: 220, drop: 'wing' },
    { t: 31, f: 'blink', e: 'voidtrooper', n: 6, side: 1 },
    // 新地形：虚空裂缝——子弹从一边进、另一边出。
    { t: 38, f: 'rift', e: 'voidrift', amp: 0 },
    { t: 40, f: 'hover', e: 'voidjelly', n: 2, gap: 520, y: 0.76, hold: 7 },
    { t: 46, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：星海——两只水母交替放波，虚空兵从波的缺口方向闪现。
    { t: 52, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 360, drop: 'special' },
    { t: 56, f: 'blink', e: 'voidtrooper', n: 6, side: -1 },
    { t: 63, f: 'blink', e: 'voidtrooper', n: 6, side: 1 },
    { t: 70, f: 'rift', e: 'voidrift', amp: 160 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 80, f: 'mimic', e: 'mimic', side: -1 },
    // 高潮。
    { t: 88, f: 'float', e: 'voidjelly', n: 3, x: 0, gap: 230, drop: 'main' },
    { t: 92, f: 'blink', e: 'voidtrooper', n: 7, side: 1, gap: 0.38 },
    { t: 99, f: 'swoop', e: 'voidtrooper', n: 6, side: -1 },
    { t: 104, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 108, f: 'blink', e: 'voidtrooper', n: 7, side: -1, gap: 0.38 },
];

const L6_2: WaveEvent[] = [
    // 热身：水母 + 虚空兵。
    { t: 0, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 320, drop: 'main' },
    { t: 6, f: 'blink', e: 'voidtrooper', n: 5, side: 1 },
    // 新敌人：卫星群——先打核心，卫星会甩飞。
    { t: 12, f: 'orbit', e: 'satellite', n: 6, x: 0, y: 0.74, hold: 9 },
    { t: 22, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新敌人：异星飞碟——牵引光束，光束里火力 +30%。
    { t: 26, f: 'hover', e: 'ufo', n: 1, x: 0, y: 0.78, hold: 8, drop: 'wing' },
    { t: 34, f: 'blink', e: 'voidtrooper', n: 6, side: -1 },
    { t: 40, f: 'orbit', e: 'satellite', n: 6, x: -120, side: -1, y: 0.76, hold: 8 },
    { t: 47, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：双轮转 + 飞碟——被牵引到卫星群下方，抓住 +30% 火力先打核心。
    { t: 52, f: 'orbit-pair', e: 'satellite', n: 5, y: 0.78, hold: 9, drop: 'special' },
    { t: 56, f: 'hover', e: 'ufo', n: 1, x: 0, y: 0.64, hold: 7 },
    { t: 66, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 380 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮：水母当卫星的轮转群。
    { t: 84, f: 'orbit', e: 'voidjelly', n: 4, x: 0, y: 0.76, hold: 9, gap: 96, speed: 0.9, drop: 'main' },
    { t: 92, f: 'blink-ring', e: 'voidtrooper', n: 6 },
    { t: 98, f: 'hover', e: 'ufo', n: 2, gap: 400, y: 0.78, hold: 6 },
    { t: 104, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 108, f: 'orbit', e: 'satellite', n: 7, x: 0, y: 0.8, hold: 7 },
];

const L6_3: WaveEvent[] = [
    // 引力井：4 秒后两口引力井出现，敌我子弹都会被弯曲。
    { t: 0, f: 'swoop', e: 'voidtrooper', n: 6, side: -1, drop: 'main' },
    { t: 7, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 340 },
    { t: 14, f: 'orbit', e: 'satellite', n: 6, x: 0, y: 0.78, hold: 8 },
    { t: 22, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 26, f: 'blink', e: 'voidtrooper', n: 6, side: 1, drop: 'wing' },
    { t: 33, f: 'hover', e: 'ufo', n: 1, x: -150, y: 0.78, hold: 7 },
    { t: 41, f: 'rift', e: 'voidrift', amp: 120 },
    { t: 45, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：弯曲弹幕——卫星群的切线弹被引力井拧成漩涡。
    { t: 51, f: 'orbit-pair', e: 'satellite', n: 6, y: 0.8, hold: 9, drop: 'special' },
    { t: 58, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 420 },
    { t: 66, f: 'blink-ring', e: 'voidtrooper', n: 6, side: -1 },
    // 喘息。
    { t: 75, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 78, f: 'mimic', e: 'mimic', side: 1 },
    // 高潮。
    { t: 86, f: 'hover', e: 'ufo', n: 2, gap: 420, y: 0.8, hold: 6, drop: 'main' },
    { t: 92, f: 'orbit', e: 'satellite', n: 7, x: 0, y: 0.76, hold: 8 },
    { t: 99, f: 'blink', e: 'voidtrooper', n: 7, side: -1, gap: 0.38 },
    { t: 104, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 108, f: 'float', e: 'voidjelly', n: 3, x: 0, gap: 230 },
];

const L6_4: WaveEvent[] = [
    // 精英先单独登场：看镜盾反射，从侧面或趁盾放下时打。
    { t: 0, f: 'solo', e: 'starguard', n: 1, x: 0, y: 0.78 },
    { t: 18, f: 'blink', e: 'voidtrooper', n: 6, side: 1, drop: 'main' },
    { t: 23, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 27, f: 'orbit', e: 'satellite', n: 6, x: 0, y: 0.76, hold: 8, drop: 'wing' },
    { t: 36, f: 'rift', e: 'voidrift', amp: 0 },
    { t: 38, f: 'hover', e: 'ufo', n: 1, x: 0, y: 0.74, hold: 7 },
    { t: 46, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：母舰前哨——守卫坐镇，卫星群绕场，闪现包围。
    { t: 51, f: 'solo', e: 'starguard', n: 1, x: 0, y: 0.82, drop: 'special' },
    { t: 54, f: 'orbit', e: 'satellite', n: 6, x: 0, y: 0.66, hold: 9 },
    { t: 62, f: 'blink-ring', e: 'voidtrooper', n: 6 },
    { t: 69, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 380 },
    // 喘息。
    { t: 78, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮。
    { t: 86, f: 'orbit-pair', e: 'satellite', n: 6, y: 0.8, hold: 8, drop: 'main' },
    { t: 92, f: 'hover', e: 'ufo', n: 2, gap: 420, y: 0.74, hold: 6 },
    { t: 98, f: 'blink', e: 'voidtrooper', n: 7, side: 1, gap: 0.36 },
    { t: 104, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 108, f: 'blink-ring', e: 'voidtrooper', n: 7, side: -1 },
];

const L6_5: WaveEvent[] = [
    // 终焉：本章机制总复习。
    { t: 0, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 340, drop: 'main' },
    { t: 6, f: 'blink', e: 'voidtrooper', n: 6, side: -1 },
    { t: 13, f: 'orbit', e: 'satellite', n: 6, x: 0, y: 0.76, hold: 8 },
    { t: 20, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 24, f: 'hover', e: 'ufo', n: 1, x: 0, y: 0.78, hold: 7, drop: 'wing' },
    { t: 30, f: 'rift', e: 'voidrift', amp: 140 },
    { t: 33, f: 'blink-ring', e: 'voidtrooper', n: 6 },
    { t: 41, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：守卫 + 双轮转 + 水母波。
    { t: 46, f: 'solo', e: 'starguard', n: 1, x: 0, y: 0.84, drop: 'special' },
    { t: 49, f: 'orbit-pair', e: 'satellite', n: 5, y: 0.7, hold: 9 },
    { t: 58, f: 'float', e: 'voidjelly', n: 2, x: 0, gap: 400 },
    { t: 64, f: 'blink', e: 'voidtrooper', n: 7, side: 1, gap: 0.36 },
    // 喘息。
    { t: 73, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮。
    { t: 81, f: 'hover', e: 'ufo', n: 2, gap: 420, y: 0.76, hold: 6, drop: 'main' },
    { t: 86, f: 'orbit', e: 'voidjelly', n: 4, x: 0, y: 0.82, hold: 8, gap: 100, speed: 0.9 },
    { t: 93, f: 'blink-ring', e: 'voidtrooper', n: 7, side: -1 },
    { t: 99, f: 'orbit', e: 'satellite', n: 7, x: 0, y: 0.78, hold: 7 },
    { t: 102, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 106, f: 'blink', e: 'voidtrooper', n: 7, side: -1, gap: 0.36, drop: 'wing' },
];

/** 第 6 章恰好五关；三星线约为自动驾驶模拟得分（先锋 23 级、零件 8 级，约等于 6-5 推荐战力）的 1.15 倍。 */
export const CH6_LEVELS: LevelDef[] = [
    { id: '6-1', chapter: 6, index: 1, number: 26, name: '星空裂隙 · 星海', boss: 'anemone', tier: 'small', bossAt: 118, waves: L6_1, scroll: 118, starScore: 27500, intro: '虚空水母的脉冲波只留一个缺口，从缺口穿过去；虚空裂缝成对出现，子弹从一边进、另一边出。' },
    { id: '6-2', chapter: 6, index: 2, number: 27, name: '星空裂隙 · 千眼', boss: 'eyelord', tier: 'mid', bossAt: 120, waves: L6_2, scroll: 120, starScore: 32500, intro: '先打卫星核心，卫星会沿切线甩飞；飞碟的牵引光束会拉你过去，光束里火力 +30%。千眼之主看向哪一格，那一格一秒后就会撕裂。' },
    { id: '6-3', chapter: 6, index: 3, number: 28, name: '星空裂隙 · 引力井', boss: 'gravitycore', tier: 'small', bossAt: 120, waves: L6_3, scroll: 122, starScore: 23500, rule: 'gravity', intro: '引力井：两口引力井在场上漂移，敌我子弹经过都会被弯向井心。' },
    { id: '6-4', chapter: 6, index: 4, number: 29, name: '星空裂隙 · 母舰', boss: 'voidcarrier', tier: 'mid', bossAt: 116, waves: L6_4, scroll: 124, starScore: 42500, intro: '星界守卫的镜盾会反射子弹，从侧面或趁盾放下时打它。虚空母舰的主炮扫过的地方会短暂变成牵引区。' },
    { id: '6-5', chapter: 6, index: 5, number: 30, name: '星空裂隙 · 终焉', boss: 'devourer', tier: 'big', bossAt: 114, waves: L6_5, scroll: 126, starScore: 56000, intro: '终焉吞噬者会轮流使出熔岩、反弹与传送三种攻击，最后把一切吸向中心——顶着吸力飞。' },
];
