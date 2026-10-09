import type { CloudCue } from './BubbleShooterAudio';
import type { BubbleRegion } from './BubbleShooterRound';

/** Shared interactions keep their meaning; each region owns its material and music. */
export const BUBBLE_COMMON_AUDIO = ['menu-music', 'reward-music', 'ui', 'select', 'confirm', 'reward', 'swap',
    'revive', 'failure', 'warning', 'bomb', 'wildcard', 'clear-bottom'] as const;
export const BUBBLE_REGIONAL_AUDIO = ['normal-music', 'boss-music', 'shot', 'bounce', 'attach',
    'pop', 'drop', 'thaw', 'frost', 'row', 'boss-enter', 'boss-hit', 'victory'] as const;

export interface BubbleAudioEntry {
    readonly cue: CloudCue;
    readonly paths: readonly string[];
    readonly volume: number;
    readonly startSeconds?: number;
}

const VOLUMES: Partial<Record<CloudCue, number>> = {
    'normal-music': .40, 'boss-music': .37, 'reward-music': .50, 'menu-music': .42,
    shot: .54, bounce: .42, attach: .46, pop: .70, drop: .60,
    ui: .46, select: .48, swap: .50, warning: .50, row: .50,
    'boss-hit': .64, victory: .70,
};
const VARIANTS = new Set<string>(['shot', 'bounce', 'attach', 'pop', 'boss-hit']);
const REGION_VOLUMES: Partial<Record<BubbleRegion, Partial<Record<CloudCue, number>>>> = {
    toy: { shot: 1, bounce: 1, pop: 1 },
};

export function bubbleAudioEntries(region: BubbleRegion): BubbleAudioEntry[] {
    const entry = (cue: CloudCue, prefix: string, variants = false): BubbleAudioEntry => ({
        cue,
        paths: variants ? [0, 1, 2].map(i => `${prefix}/${cue}${i ? '-' + (i + 1) : ''}`) : [`${prefix}/${cue}`],
        volume: REGION_VOLUMES[region]?.[cue] ?? VOLUMES[cue] ?? .62,
    });
    const prefix = `visual/regions/${region}/audio`;
    const common = BUBBLE_COMMON_AUDIO.map(cue => entry(cue, 'visual/common/audio'));
    const regional = BUBBLE_REGIONAL_AUDIO.map(cue => {
        if (region === 'ocean' && cue === 'boss-music') {
            // Morning's Boss variation is the same complete period starting at its later phrase.
            return { ...entry(cue, prefix), paths: [`${prefix}/normal-music`], startSeconds: 32.015419501133785 };
        }
        return entry(cue, prefix, VARIANTS.has(cue));
    });
    const specials: CloudCue[] = region === 'ocean' ? ['ocean-cast', 'ocean-convert']
        : region === 'toy' ? ['rail', 'ui', 'warning', 'bomb', 'failure']
        : region === 'magic' ? ['rune', 'ui', 'warning', 'bomb', 'failure'] : [];
    // Last entry wins at bind time: explicit regional overrides, never event aliases.
    return common.concat(regional, specials.map(cue => entry(cue, prefix)));
}
