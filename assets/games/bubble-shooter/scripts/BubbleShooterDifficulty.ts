/** Only released regions participate in a complete Boss cycle. */
export const REGION_CYCLE = ['ocean', 'cloud', 'toy', 'magic'] as const;
export const MAX_SAVED_FUTURE_ROWS = 32;

/** 同一轮四个主题共享难度；首轮即采用四色小分组，教学由规则引导承担。 */
export function cloudDifficulty(completed: number) {
    const tier = Math.floor(Math.max(0, Math.floor(completed)) / REGION_CYCLE.length);
    const round = tier;
    return Object.freeze({
        tier, level: round + 1,
        initialRows: Math.min(10, 8 + Math.floor((round + 1) / 2)),
        bossRows: Math.min(10, 7 + round),
        colorCount: 4,
        clusterWidth: 2,
        futureRows: Math.min(10, 2 + round),
        colorScatter: Math.min(.5, .18 + round * .035),
        supplyAssist: 1.35,
        protectionAfter: 3,
        progressRequired: round === 0 ? 90 : 120,
        ordinaryFrost: Math.min(12, 3 + Math.floor(round / 2)),
        bossFrost: Math.min(10, 3 + Math.floor(round / 3)),
        frostTargets: Math.min(4, 1 + Math.floor(round / 6)),
        insertedFrost: Math.min(3, 1 + Math.floor(round / 8)),
        oceanAnchors: Math.min(6, 2 + Math.floor(round / 3)),
        oceanConvertTargets: Math.min(3, 1 + Math.floor(round / 8)),
    });
}

/** Boss encounters use tighter groups and delayed assistance, independently of the tutorial. */
export function bossDifficulty(completed: number) {
    const ordinary = cloudDifficulty(completed);
    return Object.freeze({
        ...ordinary,
        bossRows: Math.min(10, 7 + ordinary.level - 1),
        colorCount: 4,
        clusterWidth: 2,
        colorScatter: Math.max(.14, ordinary.colorScatter),
        supplyAssist: 1.35,
        protectionAfter: Math.max(2, ordinary.protectionAfter),
        bossFrost: Math.max(3, ordinary.bossFrost),
        frostTargets: Math.max(2, ordinary.frostTargets),
        oceanConvertTargets: Math.max(2, ordinary.oceanConvertTargets),
    });
}
