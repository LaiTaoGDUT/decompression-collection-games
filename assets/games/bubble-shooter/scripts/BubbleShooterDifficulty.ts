/** Extra ordinary rows per difficulty tier; zero is supported for a fixed-board stage. */
export const ORDINARY_FUTURE_ROWS_BY_TIER: readonly number[] = Object.freeze([2, 3, 4, 5]);
/** Save validation bound stays independent of later balance-table changes. */
export const MAX_SAVED_FUTURE_ROWS = 32;

/** Bounded cloud-only progression. Mechanics grow; health and turn timing stay readable. */
export function cloudDifficulty(completed: number) {
    const tier = Math.min(3, Math.max(0, Math.floor(completed / 2)));
    return Object.freeze({
        tier,
        futureRows: ORDINARY_FUTURE_ROWS_BY_TIER[tier]!,
        colorScatter: .22 + tier * .04,
        progressRequired: completed === 0 ? 90 : 120,
        ordinaryFrost: Math.min(8, 4 + tier * 2),
        bossFrost: 4 + tier,
        frostTargets: tier >= 2 ? 3 : 2,
        insertedFrost: tier >= 2 ? 2 : 1,
    });
}
