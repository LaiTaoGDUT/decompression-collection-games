import type { ChapterDef, LevelDef, WaveEvent } from './SfLevelTypes';
import { CH2_LEVELS } from './content/ch2/levels';
import { CH3_LEVELS } from './content/ch3/levels';
import { CH4_LEVELS } from './content/ch4/levels';
import { CH5_LEVELS } from './content/ch5/levels';
import { CH6_LEVELS } from './content/ch6/levels';

/**
 * 关卡编排（DESIGN.md §7）。每关：热身 → 压力 → 喘息 → 高潮 → 警报 → Boss。
 * 补给运输机约每 25～35 秒一架；整队全歼奖励零件；精英必掉 2 个零件。
 * 不被击中时，到 Boss 前约能攒到 7/9 级零件。
 */

const L1_1: WaveEvent[] = [
    { t: 0, f: 'column', e: 'raider', n: 5, x: 0 },
    { t: 6, f: 'v', e: 'raider', n: 5, x: -150, drop: 'main' },
    { t: 10, f: 'v', e: 'raider', n: 5, x: 150 },
    { t: 16, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 21, f: 'snake', e: 'gyro', n: 6, side: -1, drop: 'wing' },
    { t: 27, f: 'snake', e: 'gyro', n: 6, side: 1 },
    { t: 35, f: 'float', e: 'balloon', n: 3, x: 0, gap: 220 },
    { t: 43, f: 'row', e: 'raider', n: 6, y: 0.74, hold: 1.4 },
    { t: 50, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    { t: 55, f: 'ground', e: 'gunboat', n: 2, x: 0, gap: 320 },
    { t: 58, f: 'v', e: 'raider', n: 5, x: 0 },
    { t: 66, f: 'swoop', e: 'raider', n: 6, side: -1, drop: 'special' },
    { t: 72, f: 'swoop', e: 'raider', n: 6, side: 1 },
    { t: 80, f: 'float', e: 'balloon', n: 3, x: 0, gap: 240 },
    { t: 82, f: 'column', e: 'raider', n: 4, x: -260 },
    { t: 84, f: 'column', e: 'raider', n: 4, x: 260 },
    { t: 91, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 96, f: 'snake', e: 'gyro', n: 8, side: 1, amp: 200, drop: 'main' },
    { t: 102, f: 'row', e: 'raider', n: 7, y: 0.78, hold: 1.2 },
    { t: 109, f: 'ground', e: 'gunboat', n: 3, x: 0, gap: 230 },
    { t: 114, f: 'v', e: 'raider', n: 5, x: -170 },
    { t: 115, f: 'v', e: 'raider', n: 5, x: 170 },
];

const L1_2: WaveEvent[] = [
    { t: 0, f: 'v', e: 'raider', n: 5, x: 0 },
    { t: 5, f: 'column', e: 'raider', n: 5, x: -200 },
    { t: 7, f: 'column', e: 'raider', n: 5, x: 200 },
    { t: 12, f: 'cross', e: 'bomber', n: 1, side: -1, y: 0.82 },
    { t: 17, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 21, f: 'snake', e: 'gyro', n: 7, side: 1, drop: 'wing' },
    { t: 27, f: 'ground', e: 'gunboat', n: 2, x: 0, gap: 300 },
    { t: 31, f: 'float', e: 'balloon', n: 3, x: 0, gap: 220 },
    { t: 37, f: 'row', e: 'raider', n: 6, y: 0.76, drop: 'main' },
    // 新敌人：拖网飞艇——网会挡住子弹，打掉任意一艘。
    { t: 43, f: 'net-pair', e: 'netblimp', n: 1, gap: 380, drop: 'wing' },
    { t: 49, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    { t: 54, f: 'swoop', e: 'raider', n: 6, side: -1 },
    { t: 57, f: 'swoop', e: 'raider', n: 6, side: 1, drop: 'special' },
    { t: 65, f: 'elite', e: 'anchorship', n: 3, x: 0, y: 0.74, hold: 13 },
    { t: 74, f: 'mimic', e: 'mimic', side: 1 },
    { t: 84, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 88, f: 'snake', e: 'gyro', n: 8, side: -1 },
    { t: 92, f: 'snake', e: 'gyro', n: 8, side: 1, drop: 'main' },
    { t: 100, f: 'ground', e: 'gunboat', n: 3, x: 0, gap: 230 },
    { t: 101, f: 'float', e: 'balloon', n: 3, x: 0, gap: 240 },
    { t: 108, f: 'escort', e: 'bomber', n: 5, x: 0, y: 0.8, hold: 5 },
    { t: 114, f: 'pincer', e: 'gyro', n: 8, gap: 0.24, y: 0.22 },
    { t: 120, f: 'row', e: 'raider', n: 6, y: 0.76 },
];

const L1_3: WaveEvent[] = [
    { t: 0, f: 'swoop', e: 'raider', n: 6, side: -1 },
    { t: 3, f: 'swoop', e: 'raider', n: 6, side: 1, drop: 'main' },
    { t: 10, f: 'float', e: 'balloon', n: 5, x: 0, gap: 140 },
    { t: 16, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 20, f: 'circle', e: 'raider', n: 6, x: 0, amp: 120, drop: 'wing' },
    // 新敌人：旋转炮台礁——转台喷出四向螺旋弹流。
    { t: 28, f: 'ground', e: 'reeffort', n: 1, x: 0 },
    { t: 34, f: 'cross', e: 'bomber', n: 2, gap: 1.8, y: 0.82 },
    { t: 40, f: 'snake', e: 'gyro', n: 8, side: -1 },
    { t: 44, f: 'snake', e: 'gyro', n: 8, side: 1, drop: 'special' },
    { t: 50, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    { t: 55, f: 'pincer', e: 'gyro', n: 8, gap: 0.26, y: 0.24 },
    { t: 62, f: 'elite', e: 'anchorship', n: 3, x: 0, y: 0.75, hold: 13 },
    { t: 81, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 85, f: 'row', e: 'raider', n: 7, y: 0.8, hold: 1.2 },
    { t: 87, f: 'float', e: 'balloon', n: 2, x: 0, gap: 420 },
    { t: 93, f: 'net-pair', e: 'netblimp', n: 1, gap: 420 },
    { t: 95, f: 'stair', e: 'raider', n: 6, side: -1, y: 0.86 },
    { t: 101, f: 'circle', e: 'raider', n: 8, x: 0, amp: 140, side: -1, drop: 'main' },
    { t: 110, f: 'ground', e: 'gunboat', n: 2, x: 0, gap: 360 },
    { t: 111, f: 'cross', e: 'bomber', n: 2, gap: 1.6, y: 0.84 },
    { t: 117, f: 'scatter', e: 'raider', n: 10, gap: 0.3 },
];

const L1_4: WaveEvent[] = [
    { t: 0, f: 'v', e: 'raider', n: 7, x: 0 },
    { t: 5, f: 'snake', e: 'gyro', n: 8, side: -1, drop: 'main' },
    { t: 9, f: 'snake', e: 'gyro', n: 8, side: 1 },
    { t: 15, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 19, f: 'ground', e: 'reeffort', n: 1, x: -150 },
    { t: 21, f: 'cross', e: 'bomber', n: 2, gap: 1.4, y: 0.84 },
    { t: 28, f: 'float', e: 'balloon', n: 4, x: 0, gap: 170 },
    { t: 30, f: 'swoop', e: 'raider', n: 6, side: -1, drop: 'wing' },
    { t: 37, f: 'stair', e: 'raider', n: 6, side: 1, y: 0.84 },
    { t: 44, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    { t: 48, f: 'elite', e: 'anchorship', n: 3, x: -120, y: 0.76, hold: 12 },
    { t: 56, f: 'snake', e: 'gyro', n: 6, side: 1, drop: 'special' },
    { t: 66, f: 'circle', e: 'raider', n: 8, x: 0, amp: 130 },
    { t: 70, f: 'net-pair', e: 'netblimp', n: 2, gap: 360, drop: 'main' },
    { t: 73, f: 'mimic', e: 'mimic', side: -1 },
    { t: 78, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 82, f: 'row', e: 'raider', n: 7, y: 0.8, hold: 1.0 },
    { t: 84, f: 'cross', e: 'bomber', n: 3, gap: 1.2, y: 0.86 },
    { t: 92, f: 'float', e: 'balloon', n: 3, x: 0, gap: 230 },
    { t: 93, f: 'swoop', e: 'raider', n: 6, side: 1, drop: 'main' },
    { t: 100, f: 'elite', e: 'anchorship', n: 1, x: 120, y: 0.78, hold: 10 },
    { t: 106, f: 'ground', e: 'reeffort', n: 2, gap: 420 },
    { t: 114, f: 'scatter', e: 'raider', n: 12, gap: 0.28 },
];

const L1_5: WaveEvent[] = [
    { t: 0, f: 'swoop', e: 'raider', n: 6, side: -1 },
    { t: 2, f: 'swoop', e: 'raider', n: 6, side: 1, drop: 'main' },
    { t: 8, f: 'ground', e: 'gunboat', n: 3, x: 0, gap: 230 },
    { t: 10, f: 'float', e: 'balloon', n: 4, x: 0, gap: 170 },
    { t: 15, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 19, f: 'cross', e: 'bomber', n: 3, gap: 1.2, y: 0.84 },
    { t: 24, f: 'snake', e: 'gyro', n: 8, side: -1, drop: 'wing' },
    { t: 27, f: 'snake', e: 'gyro', n: 8, side: 1 },
    { t: 33, f: 'elite', e: 'anchorship', n: 3, x: 0, y: 0.76, hold: 12 },
    { t: 44, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    { t: 48, f: 'circle', e: 'raider', n: 8, x: -100, amp: 130, drop: 'special' },
    { t: 52, f: 'pincer', e: 'gyro', n: 10, gap: 0.22, y: 0.22 },
    { t: 60, f: 'row', e: 'raider', n: 7, y: 0.8, hold: 1.0 },
    { t: 62, f: 'ground', e: 'reeffort', n: 1, x: 140 },
    { t: 67, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 71, f: 'float', e: 'balloon', n: 5, x: 0, gap: 140 },
    { t: 73, f: 'cross', e: 'bomber', n: 2, gap: 1.4, y: 0.82 },
    { t: 80, f: 'elite', e: 'anchorship', n: 3, x: 140, y: 0.78, hold: 10 },
    { t: 88, f: 'escort', e: 'bomber', n: 5, x: -60, y: 0.8, hold: 5, drop: 'main' },
    { t: 90, f: 'net-pair', e: 'netblimp', n: 1, gap: 400, y: 0.7 },
    { t: 92, f: 'snake', e: 'gyro', n: 10, side: 1, amp: 220 },
    { t: 98, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 102, f: 'scatter', e: 'raider', n: 12, gap: 0.26 },
    { t: 108, f: 'swoop', e: 'raider', n: 6, side: -1 },
    { t: 110, f: 'swoop', e: 'raider', n: 6, side: 1 },
];

const CH1: LevelDef[] = [
    { id: '1-1', chapter: 1, index: 1, number: 1, name: '晴空港湾 · 出港', boss: 'hummingtwins', tier: 'small', bossAt: 122, waves: L1_1, scroll: 70, starScore: 24000 },
    { id: '1-2', chapter: 1, index: 2, number: 2, name: '晴空港湾 · 鹈鹕湾', boss: 'pelican', tier: 'mid', bossAt: 126, waves: L1_2, scroll: 72, starScore: 36000 },
    { id: '1-3', chapter: 1, index: 3, number: 3, name: '晴空港湾 · 火药礁', boss: 'powderkeg', tier: 'small', bossAt: 124, waves: L1_3, scroll: 74, starScore: 35000 },
    { id: '1-4', chapter: 1, index: 4, number: 4, name: '晴空港湾 · 王牌空域', boss: 'redhawk', tier: 'mid', bossAt: 120, waves: L1_4, scroll: 76, starScore: 38000 },
    { id: '1-5', chapter: 1, index: 5, number: 5, name: '晴空港湾 · 黑帆', boss: 'blacksail', tier: 'big', bossAt: 116, waves: L1_5, scroll: 78, starScore: 60000 },
];

export const CHAPTERS: readonly ChapterDef[] = [
    { id: 1, name: '晴空港湾', subtitle: '空贼团', scene: 'ch1', levels: CH1, hiddenBoss: 'blacksail-hidden', available: true },
    // 第 2～4 章内容在 content/ch<N>；5 关齐全才开放。
    { id: 2, name: '蘑菇森林', subtitle: '妖精与虫群', scene: 'ch2', levels: CH2_LEVELS, hiddenBoss: 'treeking-hidden', available: CH2_LEVELS.length === 5 },
    { id: 3, name: '雷暴钢海', subtitle: '铁潮舰队', scene: 'ch3', levels: CH3_LEVELS, hiddenBoss: 'typhon-hidden', available: CH3_LEVELS.length === 5 },
    { id: 4, name: '熔岩火山', subtitle: '炎魔与矿械', scene: 'ch4', levels: CH4_LEVELS, hiddenBoss: 'oniblade-hidden', available: CH4_LEVELS.length === 5 },
    { id: 5, name: '冰晶峡谷', subtitle: '霜灵与雪原兵器', scene: 'ch5', levels: CH5_LEVELS, hiddenBoss: 'frostdragon-hidden', available: CH5_LEVELS.length === 5 },
    { id: 6, name: '星空裂隙', subtitle: '虚空异形', scene: 'ch6', levels: CH6_LEVELS, hiddenBoss: 'devourer-hidden', available: CH6_LEVELS.length === 5 },
];

export const ALL_LEVELS: readonly LevelDef[] = CHAPTERS.reduce((all, ch) => all.concat(ch.levels), [] as LevelDef[]);

export function levelById(id: string): LevelDef | undefined {
    return ALL_LEVELS.find(level => level.id === id);
}

export function nextLevel(id: string): LevelDef | undefined {
    const index = ALL_LEVELS.findIndex(level => level.id === id);
    return index >= 0 ? ALL_LEVELS[index + 1] : undefined;
}
