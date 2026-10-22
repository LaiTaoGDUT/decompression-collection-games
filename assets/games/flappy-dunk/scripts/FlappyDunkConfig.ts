/** Unity AnimationCurve keys: time, value, in/out tangent, weightedMode, in/out weight. */
export type DunkCurveKey = readonly [number, number, number, number, number, number, number];

// CurvaAnimazione.BackIn/BackOut use Hermite tangents -1.85 and 2;
// JindoTween does not use the usual analytic Back easing coefficient.
export const dunkBackIn = (t: number): number => -1.850000023841858 * t ** 3 + 4.700000047683716 * t * t - 1.850000023841858 * t;
export const dunkBackOut = (t: number): number => -1.850000023841858 * t ** 3 + .8500000238418579 * t * t + 2 * t;
export interface DunkDifficulty {
    readonly groups: readonly (readonly number[])[];
    readonly curves: Readonly<Record<string, readonly DunkCurveKey[]>>;
}
export interface DunkConfig {
    readonly version: number;
    readonly ball: { readonly size: number; readonly speeds: readonly (readonly number[])[];
        readonly gravity: number; readonly radius: number; readonly invincibleSeconds: number; };
    readonly missOffset: number;
    readonly cameraOffset: readonly number[];
    readonly difficulties: readonly DunkDifficulty[];
}

export function validateDunkConfig(value: unknown): DunkConfig {
    const config = value as DunkConfig;
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    if (config?.version !== 1 || !finite(config.ball?.size) || config.ball.size <= 0
        || !finite(config.ball?.radius) || config.ball.radius <= 0 || !finite(config.ball?.gravity) || config.ball.gravity >= 0
        || !finite(config.ball?.invincibleSeconds) || config.ball.invincibleSeconds <= 0
        || !finite(config.missOffset) || config.missOffset <= 0
        || config.ball.speeds?.length !== 3 || config.difficulties?.length !== 3
        || config.cameraOffset?.length !== 3 || !config.cameraOffset.every(finite)) {
        throw new Error('Invalid Flappy Dunk original configuration');
    }
    const names = ['HoopDistMin', 'HoopDistMax', 'HoopMinY', 'HoopMaxY', 'HoopScale', 'HoopMinWallDist',
        'HoopTiltChance', 'HoopRotMin', 'HoopRotMax', 'HoopMoveChance', 'HoopMoveHorizontalChance',
        'HoopMoveDistMin', 'HoopMoveDistMax', 'HoopMoveSpeedMin', 'HoopMoveSpeedMax', 'HoopShieldChance',
        'HoopShieldCooldown', 'HoopHazardChance', 'HoopHazardCooldown', 'HoopHazardScale',
        'ShrinkingWallsChance', 'ShrinkingWallsAmount', 'ShrinkingWallsStartDelay', 'ShrinkingWallsTime',
        'ShrinkingWallsStayTime', 'ShrinkingWallsCooldown', 'HoopInvertedChance', 'HoopInvertedRotMin', 'HoopInvertedRotMax'];
    for (let i = 0; i < 3; i++) {
        if (config.ball.speeds[i]?.length !== 2 || !config.ball.speeds[i].every(n => finite(n) && n > 0)) {
            throw new Error('Invalid Flappy Dunk ball speed');
        }
        const difficulty = config.difficulties[i];
        if (!difficulty.groups?.length || difficulty.groups.some(g => g.length !== 6 || !g.every(n => Number.isInteger(n) && n >= 0))) {
            throw new Error('Invalid Flappy Dunk feature groups');
        }
        for (const name of names) {
            const keys = difficulty.curves?.[name];
            if (!keys?.length || keys.some((k, index) => k.length !== 7 || !k.every(finite)
                || (index > 0 && k[0] <= keys[index - 1][0]))) throw new Error(`Invalid Dunk curve: ${name}`);
        }
    }
    return config;
}

/** Unity's unweighted cubic Hermite interpolation, clamped to the original key range. */
export function dunkCurve(keys: readonly DunkCurveKey[], time: number): number {
    if (time <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
        const b = keys[i], a = keys[i - 1];
        if (time > b[0]) continue;
        const duration = b[0] - a[0], t = (time - a[0]) / duration, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * duration * a[3]
            + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * duration * b[2];
    }
    return keys[keys.length - 1][1];
}
