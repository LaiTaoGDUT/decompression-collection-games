/** Bounded cloud-only progression. Mechanics grow; health and turn timing stay readable. */
export function cloudDifficulty(completed: number) {
    const tier = Math.min(3, Math.max(0, Math.floor(completed / 2)));
    return Object.freeze({
        tier,
        colorScatter: .22 + tier * .04,
        progressRequired: completed === 0 ? 90 : 120,
        ordinaryFrost: Math.min(8, 4 + tier * 2),
        bossFrost: 4 + tier,
        frostTargets: tier >= 2 ? 3 : 2,
        insertedFrost: tier >= 2 ? 2 : 1,
    });
}
