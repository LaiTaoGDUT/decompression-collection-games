import type { DoodleJumpPlatformType } from './DoodleJumpConfig';

/** Measured normal-mode rules, expressed in the original 320-unit world. */
export const DOODLE_JUMP_REFERENCE_WIDTH = 320;
export const DOODLE_JUMP_RULES_VERSION = 2;

export interface DoodleJumpVerticalStep {
    readonly displacement: number;
    readonly velocity: number;
}

/** Native update: position uses OLD velocity, then gravity changes velocity. */
export function stepDoodleJumpVertical(
    velocity: number,
    gravity: number,
    seconds: number,
    terminalVelocity: number,
): DoodleJumpVerticalStep {
    const frames = seconds * 60;
    const displacement = velocity <= terminalVelocity
        ? terminalVelocity * seconds
        : velocity * seconds + gravity / 7200 * frames * (frames - 1);
    return { displacement, velocity: Math.max(terminalVelocity, velocity + gravity * seconds) };
}

/** FUN_003f5cb4: draw FIRST, then cap the result (not the random range). */
export function referencePlatformGap(height: number, previousRawType: number, random: number): number {
    const range = Math.max(1, Math.floor((Math.max(0, height) + 150) / 150));
    const draw = Math.floor(random * range);
    const r = draw > 64 ? 65 : draw;
    return previousRawType === 2 && r >= 26 ? 50 : 25 + r;
}

export function referenceMonsterChance(height: number): number {
    return height > 3000 ? Math.max(10, Math.floor(70 - height / 333)) / 100 : 0;
}

/** Common clearance; species-specific +20/125 adjustments remain unresolved. */
export function referenceMonsterClearance(height: number, random: number): number {
    const range = Math.max(1, Math.floor((Math.max(0, height) + 200) / 200));
    return 15 + Math.max(0, 50 - Math.floor(random * range));
}

export function referenceMovingSpeed(height: number, random: number): number {
    return Math.min(2.5, 0.5 + Math.floor(random * 10) * 0.05 + Math.max(0, height) / 30000);
}

export function reflectedPlatformX(x: number, velocity: number, seconds: number, width: number): number {
    // The original endpoints are 28 and 292; platform width is independently 57.
    const minimum = width * 28 / 320;
    const span = width * 264 / 320;
    const distance = x - minimum + velocity * Math.max(0, seconds);
    const phase = ((distance % (span * 2)) + span * 2) % (span * 2);
    return minimum + (phase <= span ? phase : span * 2 - phase);
}

export type DoodleJumpSegmentContent = 'enemy' | 'hazard' | 'item';

export interface DoodleJumpSpawnPlan {
    readonly segmentId: number;
    readonly patternId?: number;
    readonly content?: DoodleJumpSegmentContent;
    readonly paperSpecial?: boolean;
}

export interface DoodleJumpPlannedPlatform {
    readonly x: number;
    readonly y: number;
    readonly type: DoodleJumpPlatformType;
    readonly rawType: number;
    readonly movingVelocity?: number;
    readonly spawnPlan: DoodleJumpSpawnPlan;
}

export interface DoodleJumpGenerationState {
    readonly segmentId: number;
    readonly previousRawType: number;
    readonly previousHadMonster: boolean;
    readonly pending: readonly DoodleJumpPlannedPlatform[];
}

export interface DoodleJumpReferencePattern {
    readonly id: number;
    /** Entry zero in levels_static.json is metadata, never a platform. */
    readonly monsterSlots: number;
    readonly bonusSlots: number;
    readonly entries: readonly (readonly [number, number, number])[];
}

/**
 * Original geometries containing only basic raw platform types, from
 * tmp/doodle-jump-3-core/data/levels_static.json. The remaining themed entities
 * have unresolved mappings and are deliberately absent from this bank.
 * Raw 2/3 use paper-jump's breakable/disappearing behaviours as adaptations.
 */
export const DOODLE_JUMP_REFERENCE_PATTERNS: readonly DoodleJumpReferencePattern[] = [
    { id: 8, monsterSlots: 0, bonusSlots: 0, entries: [
        [3, 62, 42], [3, 154, 77], [3, 229, 128], [3, 182, 187],
        [3, 105, 243], [0, 50, 301], [3, 115, 356], [1, 195, 430],
    ] },
    { id: 9, monsterSlots: 0, bonusSlots: 0, entries: [
        [1, 100, 22], [0, 233, 125], [2, 158, 185], [0, 40, 218],
        [2, 152, 233], [2, 155, 283], [0, 264, 311], [2, 158, 327],
        [2, 152, 370], [2, 155, 412], [1, 50, 454], [2, 159, 494],
        [2, 155, 533], [0, 257, 604], [0, 139, 647],
    ] },
    { id: 15, monsterSlots: 0, bonusSlots: 0, entries: [
        [0, 142, 22], [2, 77, 145], [3, 222, 173], [2, 168, 268],
        [3, 82, 320], [0, 252, 355], [3, 224, 467], [0, 65, 509],
        [3, 112, 605], [0, 239, 643],
    ] },
];
