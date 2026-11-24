import { CITY_THEME as T } from './CityBloxxTheme';

/** Presentation tiers only. Never feed these values into the simulation. */
const STAGES = [
    { level: 0, color: T.brass, ink: '#8C651F' },
    { level: 1, color: '#D79B36', ink: '#A06C19' },
    { level: 2, color: '#DD795A', ink: '#AE4D34' },
    { level: 3, color: '#258E9C', ink: '#176F7C' },
] as const;

export function cityComboStage(combo: number): typeof STAGES[number] {
    return STAGES[combo >= 10 ? 3 : combo >= 5 ? 2 : combo >= 3 ? 1 : 0];
}

export function cityComboMilestone(combo: number): boolean {
    return combo === 3 || combo === 5 || (combo >= 10 && combo % 10 === 0);
}

export function cityNextComboMilestone(combo: number): number {
    return combo < 3 ? 3 : combo < 5 ? 5 : combo < 10 ? 10 : (Math.floor(combo / 10) + 1) * 10;
}

/** Combo n sounds scale degree n - 1 (do re mi fa sol la si, then high do); milestones land on the same degree. */
export function cityPerfectTone(combo: number): number {
    return Math.min(7, Math.max(0, combo - 1));
}
