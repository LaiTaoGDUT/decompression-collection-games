import type { LevelDef, WaveEvent } from '../../SfLevelTypes';

/**
 * 第 5 章编排（动词：反弹 / 遮挡——子弹会弹墙、冰墙能当掩体、冰晶能借力）：
 * - 5-1 冰河：雪鸮撒弹墙冰片、雪原兵方阵、冰晶棱镜借力；
 * - 5-2 冰墙：霜冻炮台冻结弹墙、雪球雪人铺冰面、冰镜哨兵交叉火力；
 * - 5-3 暴风雪：规则关，侧风吹偏所有敌弹；
 * - 5-4 极光：冰霜女巫与双方阵；
 * - 5-5 霜翼：全机制总复习。
 */
const L5_1: WaveEvent[] = [
    // 热身：雪鸮掠过，第一次看到冰片弹墙。
    { t: 0, f: 'swoop', e: 'snowowl', n: 5, side: -1 },
    { t: 6, f: 'swoop', e: 'snowowl', n: 5, side: 1, drop: 'main' },
    // 新敌人：雪原兵方阵——打穿一列看它收拢。
    { t: 13, f: 'phalanx', e: 'snowtrooper', n: 4, y: 0.82 },
    { t: 22, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    // 新敌人：冰晶棱镜——打水晶借力。
    { t: 26, f: 'ground', e: 'prism', n: 1, x: 0 },
    { t: 29, f: 'sweep', e: 'snowowl', n: 7, side: 1, drop: 'wing' },
    { t: 37, f: 'phalanx', e: 'snowtrooper', n: 5, y: 0.84 },
    { t: 46, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：冰河——方阵压境，棱镜在方阵下方，借折射的碎光打穿方阵。
    { t: 52, f: 'ground', e: 'prism', n: 2, gap: 300, drop: 'special' },
    { t: 54, f: 'phalanx', e: 'snowtrooper', n: 5, y: 0.86 },
    { t: 63, f: 'sweep', e: 'snowowl', n: 7, side: -1 },
    { t: 69, f: 'swoop', e: 'snowowl', n: 6, side: 1 },
    // 喘息。
    { t: 77, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    { t: 80, f: 'mimic', e: 'mimic', side: 1 },
    // 高潮。
    { t: 88, f: 'phalanx-double', e: 'snowtrooper', n: 4, drop: 'main' },
    { t: 95, f: 'ground', e: 'prism', n: 1, x: 0 },
    { t: 100, f: 'sweep', e: 'snowowl', n: 8, side: 1 },
    { t: 105, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 109, f: 'sweep', e: 'snowowl', n: 8, side: -1 },
];

const L5_2: WaveEvent[] = [
    // 热身：雪鸮 + 棱镜。
    { t: 0, f: 'sweep', e: 'snowowl', n: 7, side: -1, drop: 'main' },
    { t: 7, f: 'ground', e: 'prism', n: 1, x: 150 },
    // 新敌人：霜冻炮台——冰弹停住结墙再碎裂。
    { t: 12, f: 'hover', e: 'frostturret', n: 1, x: 0, y: 0.78, hold: 6 },
    { t: 20, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    // 新敌人：雪球雪人——冰面会打滑。
    { t: 24, f: 'ground', e: 'snowman', n: 1, x: -120 },
    { t: 30, f: 'phalanx', e: 'snowtrooper', n: 4, y: 0.84, drop: 'wing' },
    // 新敌人：冰镜哨兵——以你为轴镜像。
    { t: 38, f: 'mirror', e: 'mirror', n: 1, y: 0.72, hold: 9 },
    { t: 46, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：冰墙——两座炮台交错冻结出弹墙，雪人把下方铺成冰面。
    { t: 52, f: 'hover', e: 'frostturret', n: 2, gap: 380, y: 0.8, hold: 7, drop: 'special' },
    { t: 55, f: 'ground', e: 'snowman', n: 2, gap: 360 },
    { t: 62, f: 'swoop', e: 'snowowl', n: 6, side: 1 },
    { t: 68, f: 'mirror', e: 'mirror', n: 1, y: 0.7, hold: 8 },
    // 喘息。
    { t: 78, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮。
    { t: 86, f: 'phalanx', e: 'snowtrooper', n: 5, y: 0.86, drop: 'main' },
    { t: 90, f: 'hover', e: 'frostturret', n: 1, x: 0, y: 0.72, hold: 6 },
    { t: 96, f: 'ground', e: 'prism', n: 2, gap: 340 },
    { t: 100, f: 'mirror', e: 'mirror', n: 2, y: 0.66, hold: 9 },
    { t: 106, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 110, f: 'sweep', e: 'snowowl', n: 8, side: 1 },
];

const L5_3: WaveEvent[] = [
    // 暴风雪：六秒后起风，侧风每 8 秒换向，所有敌弹都被吹偏。
    { t: 0, f: 'swoop', e: 'snowowl', n: 6, side: -1, drop: 'main' },
    { t: 7, f: 'phalanx', e: 'snowtrooper', n: 4, y: 0.84 },
    { t: 16, f: 'ground', e: 'snowman', n: 1, x: 0 },
    { t: 20, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 25, f: 'hover', e: 'frostturret', n: 1, x: -160, y: 0.78, hold: 6, drop: 'wing' },
    { t: 32, f: 'sweep', e: 'snowowl', n: 7, side: 1 },
    { t: 39, f: 'ground', e: 'prism', n: 1, x: 0 },
    { t: 45, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：顺风弹幕——方阵与镜像哨兵的子弹都被风吹成斜线。
    { t: 52, f: 'phalanx-double', e: 'snowtrooper', n: 4, drop: 'special' },
    { t: 58, f: 'mirror', e: 'mirror', n: 1, y: 0.7, hold: 9 },
    { t: 66, f: 'ground', e: 'snowman', n: 2, gap: 340 },
    // 喘息。
    { t: 76, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    { t: 79, f: 'mimic', e: 'mimic', side: -1 },
    // 高潮。
    { t: 87, f: 'hover', e: 'frostturret', n: 2, gap: 360, y: 0.8, hold: 6, drop: 'main' },
    { t: 92, f: 'sweep', e: 'snowowl', n: 8, side: -1 },
    { t: 98, f: 'phalanx', e: 'snowtrooper', n: 5, y: 0.86 },
    { t: 105, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 109, f: 'swoop', e: 'snowowl', n: 6, side: 1 },
];

const L5_4: WaveEvent[] = [
    // 精英先单独登场：看冰墙，绕到墙侧面打。
    { t: 0, f: 'solo', e: 'frostwitch', n: 1, x: 0, y: 0.8 },
    { t: 17, f: 'sweep', e: 'snowowl', n: 7, side: 1, drop: 'main' },
    { t: 22, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 26, f: 'phalanx-double', e: 'snowtrooper', n: 4, drop: 'wing' },
    { t: 36, f: 'ground', e: 'prism', n: 2, gap: 320 },
    { t: 40, f: 'hover', e: 'frostturret', n: 1, x: 0, y: 0.78, hold: 6 },
    { t: 46, f: 'carrier', e: 'carrier', side: 1, drop: 'wing' },
    // 招牌段：极光——女巫坐镇，镜像哨兵与雪人配合。
    { t: 51, f: 'solo', e: 'frostwitch', n: 1, x: 0, y: 0.82, drop: 'special' },
    { t: 55, f: 'mirror', e: 'mirror', n: 1, y: 0.66, hold: 10 },
    { t: 62, f: 'ground', e: 'snowman', n: 2, gap: 340 },
    { t: 69, f: 'swoop', e: 'snowowl', n: 6, side: -1 },
    // 喘息。
    { t: 78, f: 'carrier', e: 'carrier', side: -1, drop: 'special' },
    // 高潮。
    { t: 86, f: 'phalanx', e: 'snowtrooper', n: 6, y: 0.86, drop: 'main' },
    { t: 92, f: 'hover', e: 'frostturret', n: 2, gap: 380, y: 0.78, hold: 6 },
    { t: 98, f: 'sweep', e: 'snowowl', n: 8, side: 1 },
    { t: 104, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 108, f: 'mirror', e: 'mirror', n: 2, y: 0.66, hold: 8 },
];

const L5_5: WaveEvent[] = [
    // 霜翼：本章机制总复习。
    { t: 0, f: 'sweep', e: 'snowowl', n: 7, side: -1, drop: 'main' },
    { t: 6, f: 'phalanx', e: 'snowtrooper', n: 5, y: 0.84 },
    { t: 14, f: 'ground', e: 'prism', n: 1, x: 0 },
    { t: 18, f: 'carrier', e: 'carrier', side: 1, drop: 'main' },
    { t: 22, f: 'hover', e: 'frostturret', n: 2, gap: 380, y: 0.78, hold: 6, drop: 'wing' },
    { t: 29, f: 'ground', e: 'snowman', n: 2, gap: 340 },
    { t: 35, f: 'mirror', e: 'mirror', n: 1, y: 0.7, hold: 8 },
    { t: 42, f: 'carrier', e: 'carrier', side: -1, drop: 'wing' },
    // 招牌段：女巫 + 双方阵 + 棱镜借力。
    { t: 47, f: 'solo', e: 'frostwitch', n: 1, x: 0, y: 0.84, drop: 'special' },
    { t: 50, f: 'phalanx-double', e: 'snowtrooper', n: 4 },
    { t: 58, f: 'ground', e: 'prism', n: 2, gap: 320 },
    { t: 64, f: 'sweep', e: 'snowowl', n: 8, side: 1 },
    // 喘息。
    { t: 73, f: 'carrier', e: 'carrier', side: 1, drop: 'special' },
    // 高潮。
    { t: 81, f: 'mirror', e: 'mirror', n: 2, y: 0.66, hold: 9, drop: 'main' },
    { t: 86, f: 'hover', e: 'frostturret', n: 1, x: 0, y: 0.82, hold: 6 },
    { t: 92, f: 'ground', e: 'snowman', n: 2, gap: 360 },
    { t: 97, f: 'phalanx', e: 'snowtrooper', n: 6, y: 0.86 },
    { t: 101, f: 'carrier', e: 'carrier', side: -1, drop: 'main' },
    { t: 105, f: 'sweep', e: 'snowowl', n: 9, side: -1, drop: 'wing' },
];

/** 第 5 章恰好五关；三星线约为自动驾驶模拟得分（先锋 18～20 级、零件 6～7 级）的 1.15 倍。 */
export const CH5_LEVELS: LevelDef[] = [
    { id: '5-1', chapter: 5, index: 1, number: 21, name: '冰晶峡谷 · 冰河', boss: 'snowleopard', tier: 'small', bossAt: 120, waves: L5_1, scroll: 108, starScore: 28500, intro: '冰片碰到屏幕边会反弹一次；打中冰晶棱镜的子弹会折射成三发碎光，可以借力打穿方阵。' },
    { id: '5-2', chapter: 5, index: 2, number: 22, name: '冰晶峡谷 · 冰墙', boss: 'mammoth', tier: 'mid', bossAt: 122, waves: L5_2, scroll: 110, starScore: 36500, intro: '冻结的冰弹会停在空中再碎开；冰面会让飞机打滑。猛犸战车竖起的冰墙能当掩体，但它冲锋时会撞碎冰墙。' },
    { id: '5-3', chapter: 5, index: 3, number: 23, name: '冰晶峡谷 · 暴风雪', boss: 'stormyeti', tier: 'small', bossAt: 124, waves: L5_3, scroll: 112, starScore: 27500, rule: 'blizzard', intro: '暴风雪：侧风每 8 秒换向，所有敌弹被吹偏，雪线的方向就是风向。' },
    { id: '5-4', chapter: 5, index: 4, number: 24, name: '冰晶峡谷 · 极光', boss: 'aurorawhale', tier: 'mid', bossAt: 118, waves: L5_4, scroll: 114, starScore: 39000, intro: '冰霜女巫躲在冰墙后，绕到侧面打；极光鲸潜入冰层时，背鳍划过的地方一秒后会裂开。' },
    { id: '5-5', chapter: 5, index: 5, number: 25, name: '冰晶峡谷 · 霜翼', boss: 'frostdragon', tier: 'big', bossAt: 116, waves: L5_5, scroll: 116, starScore: 66000, intro: '冰息会冻结成悬空的冰墙再碎裂；分身阶段只有真身有影子。' },
];
