/**
 * 数值公式（DESIGN.md §5、§7.4）。所有曲线集中在这里，调平只改这一个文件。
 *
 * - 战斗力 P：机体等级与三个零件等级的乘积，全 1 级 = 1000。
 * - 推荐战力 R(n)：第 n 关（无尽按等效关卡数）。
 * - 标准火力 F(n) = R(n) / 10：战力达标、零件满配时的每秒伤害；敌人血量以 F(n) 为单位。
 */
export type SlotId = 'main' | 'wing' | 'special';
export const SLOTS: readonly SlotId[] = ['main', 'wing', 'special'];

export const MAX_PLANE_LEVEL = 30;
export const MAX_PART_LEVEL = 10;
export const MAX_FIELD_LEVEL = 3;
export const UPGRADE_REFUND_PERCENT = 100;

/** 满配时各挂点占总火力的比例（合计 1）。 */
export const SLOT_WEIGHT: Readonly<Record<SlotId, number>> = { main: 0.55, wing: 0.225, special: 0.225 };
/** 局内零件等级 0～3 对应的火力比例；裸机（主炮 0 级、其余未装）= 40%。 */
export const FIELD_SHARE: Readonly<Record<SlotId, readonly number[]>> = {
    main: [0.4, 0.45, 0.5, 0.55],
    wing: [0, 0.1, 0.165, 0.225],
    special: [0, 0.1, 0.165, 0.225],
};

export function planeLevelMultiplier(level: number): number {
    return Math.pow(1.08, Math.max(0, level - 1));
}

export function partLevelMultiplier(level: number): number {
    return Math.pow(1.1, Math.max(0, level - 1));
}

export function combatPower(planeLevel: number, parts: Readonly<Record<SlotId, number>>): number {
    const base = 1000 * planeLevelMultiplier(planeLevel);
    return Math.round(base * SLOTS.reduce((sum, slot) => sum + SLOT_WEIGHT[slot] * partLevelMultiplier(parts[slot]), 0));
}

export function recommendedPower(levelNumber: number): number {
    return Math.round(1000 * Math.pow(1.085, Math.max(0, levelNumber - 1)));
}

export function standardDps(levelNumber: number): number {
    return recommendedPower(levelNumber) / 10;
}

/** 某挂点当前每秒伤害：基础火力 × 局内份额 × 局外零件倍率。 */
export function slotDps(planeLevel: number, slot: SlotId, partLevel: number, fieldLevel: number): number {
    const base = 100 * planeLevelMultiplier(planeLevel);
    return base * FIELD_SHARE[slot][Math.max(0, Math.min(MAX_FIELD_LEVEL, fieldLevel))] * partLevelMultiplier(partLevel);
}

export function heartsForLevel(planeLevel: number, baseHearts = 3): number {
    return baseHearts + (planeLevel >= 10 ? 1 : 0) + (planeLevel >= 20 ? 1 : 0);
}

export function planeUpgradeCost(level: number): number {
    return roundCost(100 * Math.pow(1.17, level - 1));
}

export function partUpgradeCost(level: number): number {
    return roundCost(150 * Math.pow(1.25, level - 1));
}

function roundCost(value: number): number {
    if (value < 1000) return Math.round(value / 10) * 10;
    return Math.round(value / 50) * 50;
}

/** 关卡金币：首通 200+40n，新星每颗 +50%，重复通关 30%。 */
export function levelGold(levelNumber: number, firstClear: boolean, newStars: number): number {
    const base = 200 + 40 * levelNumber;
    if (!firstClear && newStars === 0) return Math.round(base * 0.3);
    return Math.round(base * (firstClear ? 1 : 0.3) + base * 0.5 * newStars);
}

/** 敌人血量单位（以 F(n) 计）。 */
export const HP_UNITS = {
    // 杂兵按“裸机也能 0.3～0.4 秒打掉”设计；满配时一触即溃。
    small: 0.15,
    medium: 0.8,
    large: 2.2,
    elite: 5,
    // Boss 按“零件约 7/9 级、输出约 85% 时间在打”反推：小 / 中 / 大约 25 / 45 / 75 秒。
    smallBoss: 20,
    midBoss: 38,
    bigBoss: 64,
    hiddenBoss: 84,
} as const;

/** 被击中后的无敌时间与判定参数（设计像素）。 */
export const PLAYER_RULES = {
    invulnerableSeconds: 1.5,
    hitRadius: 7,
    grazeRadius: 40,
    /** 被击落的零件飞向落点的时长，落地前不能被吸回 / 拾取（秒）。 */
    lostPartFly: 0.45,
    reviveProtection: 4,
    magnetRadius: 120,
    coinMagnetRadius: 190,
    energyMax: 100,
} as const;

export const COMBO_WINDOW = 1.5;

export function comboMultiplier(combo: number): number {
    return 1 + Math.min(1, combo / 60);
}
