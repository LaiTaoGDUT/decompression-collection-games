import type { DoodleJumpEnemyType, DoodleJumpHazardType, DoodleJumpItemType, DoodleJumpPlatformType } from './DoodleJumpConfig';
export { DOODLE_JUMP_REFERENCE_PATTERNS, DOODLE_JUMP_EARLY_PATTERN_IDS, DOODLE_JUMP_LATE_PATTERN_IDS } from './DoodleJumpReferencePatterns';

/** Native normal-mode coordinates and timing; game coordinates scale by width / 320. */
export const DOODLE_JUMP_REFERENCE_WIDTH = 320;
export const DOODLE_JUMP_RULES_VERSION = 13;
export const DOODLE_JUMP_PATTERN_UNLOCK_HEIGHT = 3000; // DJBaseTheme::vf47
export const DOODLE_JUMP_LATE_PATTERN_HEIGHT = 15000;
export const REFERENCE_ENEMY_TYPES: readonly DoodleJumpEnemyType[] = ['small', 'hopper', 'hover', 'weaver', 'large', 'flyer'];
/** FUN_003f391c: the row type is a dispatcher code, not the MonsterObject kind. */
export function referenceEnemyType(rawType: number): DoodleJumpEnemyType | undefined {
    if (rawType >= 7 && rawType <= 11) return REFERENCE_ENEMY_TYPES[rawType - 7];
    if (rawType === 22) return 'flyer';
    if (rawType === 26) return 'bouncer'; // native kind 8
    if (rawType === 28) return 'runner'; // native kind 10
    if (rawType === 38) return 'tall'; // native kind 48
    return undefined;
}

/** MonsterObject stores a sprite anchor; the paper simulation stores its collision-box center. */
export function referenceEnemyOffset(type: DoodleJumpEnemyType): readonly [number, number] {
    return type === 'flyer' ? [0, -10] : type === 'bouncer' ? [0, -1.5]
        : type === 'runner' ? [0, 1] : type === 'tall' ? [-3, 0.5] : [0, 0];
}

const REFERENCE_ENEMY_VISUAL_SIZES: Readonly<Record<DoodleJumpEnemyType, readonly [number, number]>> = {
    small: [58, 52], hopper: [46, 36], hover: [38, 50], weaver: [80, 46], large: [82, 60],
    flyer: [68, 92], bouncer: [94, 34], runner: [88, 56], tall: [66, 88],
};
/** Native monster frame bank at image 0x7bf068; these are image bounds, not hitboxes. */
export function referenceEnemyVisualSize(type: DoodleJumpEnemyType): readonly [number, number] {
    return REFERENCE_ENEMY_VISUAL_SIZES[type];
}

const REFERENCE_ITEM_VISUALS: Readonly<Record<DoodleJumpItemType, readonly [number, number, number, number]>> = {
    spring: [18, 28, 0, 0], trampoline: [38, 20, 0, 0], jetpack: [26, 38, 0, 2],
    'propeller-hat': [32, 20, 0, 17], shield: [38, 38, 0, 17],
    'spring-shoes': [30, 24, 0, 0],
};
/** Native bonus frame bank at 0x7d2f10; offset from the collision-box center to the image anchor. */
export function referenceItemVisual(type: DoodleJumpItemType): readonly [number, number, number, number] {
    return REFERENCE_ITEM_VISUALS[type];
}
export const REFERENCE_BONUS_TYPES: readonly (DoodleJumpItemType | undefined)[] = [
    'spring', undefined, 'jetpack', 'propeller-hat', 'shield', 'trampoline', 'spring-shoes', undefined,
];

export function referenceBearTrapChance(mode: number, height: number): number {
    return mode === 6 || mode === 9 ? 0.2 : mode === 14 ? (height <= 25000 ? 0.5 : 0.4) : 0;
}

/** Paper platform Y is its landing surface; native bonus center is imageHeight + offsetY + collisionHeight/2 above it. */
export function referenceBonusOffset(type: DoodleJumpItemType, platformWidth: number, draw: number): readonly [number, number] {
    const sizes: Readonly<Record<DoodleJumpItemType, readonly [number, number]>> = {
        spring: [18, 10], trampoline: [28, 8], jetpack: [26, 17], 'propeller-hat': [30, -8],
        shield: [36, 1], 'spring-shoes': [16, 10],
    };
    const [imageWidth, centerY] = sizes[type];
    const freeWidth = platformWidth - imageWidth;
    const centerX = type === 'trampoline' ? 1 : type === 'spring-shoes' ? 5
        : Math.trunc(Math.floor(draw * Math.max(1, Math.trunc(freeWidth))) - freeWidth * 0.5);
    return [centerX, centerY];
}

/** FUN_003f7dd0: one low-pass sensor update per native physics frame. Input is physical tilt in g. */
export function stepDoodleJumpHorizontal(filteredTilt: number, requestedTilt: number, seconds: number,
    smoothingSeconds: number, gain: number, scale: number): { filteredTilt: number; displacement: number; velocity: number } {
    const f = Math.fround;
    const alpha = f(f(smoothingSeconds) / f(f(seconds) + f(smoothingSeconds)));
    const tilt = f(f(alpha * filteredTilt) + f(f(1 - alpha) * f(requestedTilt)));
    const nativeDisplacement = f(tilt * f(gain));
    const displacement = nativeDisplacement * scale;
    return { filteredTilt: tilt, displacement, velocity: displacement / seconds };
}

/** Native 28×35 body is centered at (-1,-9.5) relative to its image anchor. Platform hitbox is inset 3/2. */
export function referenceFootOverlapsPlatform(playerX: number, collisionWidth: number,
    platformX: number, platformWidth: number, scale: number): boolean {
    const left = platformX - platformWidth / 2 + 3 * scale;
    const right = platformX + platformWidth / 2 - 2 * scale;
    const footLeft = playerX - collisionWidth / 2;
    const footRight = playerX + collisionWidth / 2;
    return footRight >= left && footLeft <= right;
}

/** FUN_003fe024 uses the post-step velocity and the horizontal fast-motion flag. */
export function referenceFootNeedsSweep(horizontalDisplacement: number, velocityY: number,
    seconds: number, scale: number): boolean {
    return Math.abs(horizontalDisplacement) > 18 * scale
        || Math.fround(Math.fround(velocityY / (60 * scale)) * Math.fround(seconds * 60)) < -9;
}

/** Unwrap the half-step at the crossed edge; never sweep through the screen's middle. */
export function referenceFootMidpointX(previousX: number, playerX: number, scale: number): number {
    const distance = playerX - previousX;
    const wrapOffset = distance > 160 * scale ? -320 * scale
        : distance < -160 * scale ? 320 * scale : 0;
    return (previousX + playerX + wrapOffset) / 2;
}

/** 0 = miss, 1 = current foot, 2 = native half-step foot. No overlap-percentage gate. */
export function referenceFootPlatformContact(previousX: number, playerX: number,
    previousFootY: number, footY: number, collisionWidth: number,
    platformX: number, platformY: number, platformWidth: number, scale: number, sweep: boolean): 0 | 1 | 2 {
    // The swept rectangle is only a broad phase in the native code. A real
    // half-step/current foot contact must still confirm it before bouncing.
    if (sweep && footY < previousFootY) {
        const midpointY = (previousFootY + footY) / 2;
        if (midpointY <= platformY + 10 * scale && midpointY + 2 * scale >= platformY
            && referenceFootOverlapsPlatform(referenceFootMidpointX(previousX, playerX, scale),
                collisionWidth, platformX, platformWidth, scale)) return 2;
    }
    return footY <= platformY + 10 * scale && footY + 2 * scale >= platformY
        && referenceFootOverlapsPlatform(playerX, collisionWidth, platformX, platformWidth, scale) ? 1 : 0;
}

/** Native foot is 2 high, platform collision band is the upper half of its 20-high image. */
export function referenceFootTouchesPlatform(previousX: number, playerX: number,
    previousFootY: number, footY: number, collisionWidth: number,
    platformX: number, platformY: number, platformWidth: number, scale: number, sweep: boolean): boolean {
    return referenceFootPlatformContact(previousX, playerX, previousFootY, footY,
        collisionWidth, platformX, platformY, platformWidth, scale, sweep) !== 0;
}

export interface DoodleJumpUfoMotionState {
    x: number;
    y: number;
    phaseX: number;
    phaseY: number;
    oscillationX: number;
    oscillationY: number;
}

/** UfoObject::vf1: float32 differential sinf motion, then advance/reset each native clock. */
export function stepDoodleJumpUfoMotion(state: DoodleJumpUfoMotionState, frameDelta: number): void {
    if (frameDelta <= 0) return;
    const f = Math.fround;
    const x = f(f(Math.sin(f(state.phaseX * f(0.02)))) * 20);
    const y = f(f(Math.sin(f(state.phaseY * f(0.04)))) * 10);
    state.x = f(state.x + f(x - state.oscillationX));
    state.y = f(f(y - state.oscillationY) + state.y);
    state.oscillationX = x;
    state.oscillationY = y;
    state.phaseX = f(state.phaseX + f(frameDelta));
    state.phaseY = f(state.phaseY + f(frameDelta));
    if (state.phaseX >= 315) state.phaseX = 0;
    if (state.phaseY >= 158) state.phaseY = 0;
}

export interface DoodleJumpVerticalStep { readonly displacement: number; readonly velocity: number }

/** FUN_003f7dd0: move using OLD velocity, then change velocity; only downward speed is capped. */
export function stepDoodleJumpVertical(velocity: number, gravity: number, seconds: number, terminalVelocity: number): DoodleJumpVerticalStep {
    const frames = seconds * 60;
    const displacement = velocity <= terminalVelocity ? terminalVelocity * seconds
        : velocity * seconds + gravity / 7200 * frames * (frames - 1);
    return { displacement, velocity: Math.max(terminalVelocity, velocity + gravity * seconds) };
}

/** FUN_003f5cb4: random gap uses previous PLATFORM kind, clearance uses previous BONUS kind. */
export function referencePlatformGap(height: number, previousRawType: number, random: number,
    previousBonusKind = -1, clearanceRandom = 0): number {
    const range = Math.max(1, Math.floor((Math.max(0, height) + 150) / 150));
    const draw = Math.floor(random * range);
    const r = draw > 64 ? 65 : draw;
    const gap = previousRawType === 2 && r >= 26 ? 50 : 25 + r;
    if (previousBonusKind < 0) return gap;
    const clearance = Math.max(0, 50 - Math.floor(clearanceRandom * Math.max(1, Math.floor((height + 200) / 200))));
    if (previousBonusKind === 7) return 140;
    if (previousBonusKind === 100) return Math.min(90, gap + 15 + clearance);
    return gap + 15 + clearance + ([0, 2, 5].indexOf(previousBonusKind) >= 0 ? 20 : 0);
}

/** FUN_003f391c attaches a shield to a monster-bearing PATTERN, not another monster. */
export function referencePatternShieldChance(height: number): number {
    return height > 3000 ? Math.max(10, Math.floor(70 - height / 333)) / 100 : 0;
}

export function referenceMovingSpeed(height: number, random: number): number {
    return Math.min(2.5, 0.5 + Math.floor(random * 10) * 0.05 + Math.max(0, height) / 30000);
}

/** Immutable native degree LUT at ELF 0x7d51c8; its six-decimal entries differ from Math.sin(). */
const REFERENCE_SINE: readonly number[] = Object.freeze([
    0, 0.017452, 0.034899, 0.052336, 0.069756, 0.087156, 0.104528, 0.121869, 0.139173, 0.156434, 0.173648, 0.190809,
    0.207912, 0.224951, 0.241922, 0.258819, 0.275637, 0.292372, 0.309017, 0.325568, 0.34202, 0.358368, 0.374607, 0.390731,
    0.406737, 0.422618, 0.438371, 0.453991, 0.469472, 0.48481, 0.5, 0.515038, 0.529919, 0.544639, 0.559193, 0.573576,
    0.587785, 0.601815, 0.615661, 0.62932, 0.642788, 0.656059, 0.669131, 0.681998, 0.694658, 0.707107, 0.71934, 0.731354,
    0.743145, 0.75471, 0.766044, 0.777146, 0.788011, 0.798636, 0.809017, 0.819152, 0.829038, 0.838671, 0.848048, 0.857167,
    0.866025, 0.87462, 0.882948, 0.891007, 0.898794, 0.906308, 0.913545, 0.920505, 0.927184, 0.93358, 0.939693, 0.945519,
    0.951057, 0.956305, 0.961262, 0.965926, 0.970296, 0.97437, 0.978148, 0.981627, 0.984808, 0.987688, 0.990268, 0.992546,
    0.994522, 0.996195, 0.997564, 0.99863, 0.999391, 0.999848, 1, 0.999848, 0.999391, 0.99863, 0.997564, 0.996195,
    0.994522, 0.992546, 0.990268, 0.987688, 0.984808, 0.981627, 0.978148, 0.97437, 0.970296, 0.965926, 0.961262, 0.956305,
    0.951057, 0.945519, 0.939693, 0.93358, 0.927184, 0.920505, 0.913545, 0.906308, 0.898794, 0.891006, 0.882948, 0.87462,
    0.866025, 0.857167, 0.848048, 0.838671, 0.829038, 0.819152, 0.809017, 0.798635, 0.788011, 0.777146, 0.766044, 0.75471,
    0.743145, 0.731354, 0.71934, 0.707107, 0.694658, 0.681998, 0.669131, 0.656059, 0.642788, 0.62932, 0.615661, 0.601815,
    0.587785, 0.573576, 0.559193, 0.544639, 0.529919, 0.515038, 0.5, 0.48481, 0.469472, 0.453991, 0.438371, 0.422618,
    0.406737, 0.390731, 0.374606, 0.358368, 0.34202, 0.325568, 0.309017, 0.292372, 0.275637, 0.258819, 0.241922, 0.224951,
    0.207912, 0.190809, 0.173648, 0.156434, 0.139173, 0.121869, 0.104528, 0.087156, 0.069756, 0.052336, 0.034899, 0.017452,
    -0, -0.017452, -0.034899, -0.052336, -0.069756, -0.087156, -0.104528, -0.121869, -0.139173, -0.156434, -0.173648, -0.190809,
    -0.207912, -0.224951, -0.241922, -0.258819, -0.275637, -0.292372, -0.309017, -0.325568, -0.34202, -0.358368, -0.374607, -0.390731,
    -0.406737, -0.422618, -0.438371, -0.453991, -0.469472, -0.48481, -0.5, -0.515038, -0.529919, -0.544639, -0.559193, -0.573576,
    -0.587785, -0.601815, -0.615661, -0.62932, -0.642788, -0.656059, -0.669131, -0.681998, -0.694658, -0.707107, -0.71934, -0.731354,
    -0.743145, -0.75471, -0.766045, -0.777146, -0.788011, -0.798635, -0.809017, -0.819152, -0.829038, -0.838671, -0.848048, -0.857167,
    -0.866025, -0.87462, -0.882948, -0.891006, -0.898794, -0.906308, -0.913545, -0.920505, -0.927184, -0.93358, -0.939693, -0.945519,
    -0.951056, -0.956305, -0.961262, -0.965926, -0.970296, -0.97437, -0.978148, -0.981627, -0.984808, -0.987688, -0.990268, -0.992546,
    -0.994522, -0.996195, -0.997564, -0.99863, -0.999391, -0.999848, -1, -0.999848, -0.999391, -0.99863, -0.997564, -0.996195,
    -0.994522, -0.992546, -0.990268, -0.987688, -0.984808, -0.981627, -0.978148, -0.97437, -0.970296, -0.965926, -0.961262, -0.956305,
    -0.951056, -0.945519, -0.939693, -0.93358, -0.927184, -0.920505, -0.913545, -0.906308, -0.898794, -0.891006, -0.882948, -0.87462,
    -0.866025, -0.857167, -0.848048, -0.838671, -0.829038, -0.819152, -0.809017, -0.798635, -0.788011, -0.777146, -0.766045, -0.75471,
    -0.743145, -0.731354, -0.71934, -0.707107, -0.694658, -0.681998, -0.669131, -0.656059, -0.642788, -0.62932, -0.615661, -0.601815,
    -0.587785, -0.573577, -0.559193, -0.544639, -0.529919, -0.515038, -0.5, -0.484809, -0.469471, -0.453991, -0.438371, -0.422618,
    -0.406736, -0.390731, -0.374607, -0.358368, -0.34202, -0.325568, -0.309017, -0.292372, -0.275638, -0.258819, -0.241922, -0.224951,
    -0.207912, -0.190809, -0.173648, -0.156434, -0.139173, -0.121869, -0.104529, -0.087156, -0.069756, -0.052336, -0.0349, -0.017453,
].map(Math.fround));
export function referenceSine(degrees: number): number {
    return REFERENCE_SINE[((Math.trunc(degrees) % 360) + 360) % 360];
}

export interface DoodleJumpMonsterMotionState {
    x: number; y: number; phaseX: number; phaseY: number; oscillationX: number; oscillationY: number;
    velocityX: number; velocityY: number; bounceHeight: number;
}
export function createReferenceMonsterMotion(type: DoodleJumpEnemyType, x: number, y: number,
    phaseX: number, phaseY: number): DoodleJumpMonsterMotionState {
    return { x: Math.fround(x), y: Math.fround(y), phaseX, phaseY, oscillationX: 0, oscillationY: 0,
        velocityX: type === 'runner' ? 1 : type === 'hover' || type === 'flyer' ? 2 : 0,
        velocityY: 2, bounceHeight: 0 };
}

/** MonsterObject::vf3, one native frame. Positions here are native sprite anchors, not hitbox centers. */
export function stepReferenceMonsterMotion(type: DoodleJumpEnemyType, state: DoodleJumpMonsterMotionState): void {
    const f = Math.fround;
    const advance = (angle: number, speed: number): number => {
        const next = f(angle + f(speed)); return next >= 360 ? f(next - 360) : next;
    };
    if (type === 'bouncer' || type === 'runner' || type === 'tall') {
        state.velocityY = Math.max(-3, f(state.velocityY - f(0.1)));
        state.bounceHeight = f(state.bounceHeight + state.velocityY);
        state.y = f(state.y + state.velocityY); state.x = f(state.x + state.velocityX);
        if (state.bounceHeight <= 0) {
            state.y = f(state.y - state.bounceHeight); state.bounceHeight = 0;
            state.velocityY = 2; state.velocityX = -state.velocityX;
        }
        return;
    }
    if (type === 'hover') {
        state.x = f(state.x + state.velocityX);
        if (state.x >= 292) { state.x = f(584 - state.x); state.velocityX = -state.velocityX; }
        else if (state.x <= 28) { state.x = f(56 - state.x); state.velocityX = -state.velocityX; }
        const oscillation = f(referenceSine(state.phaseY) * 10);
        state.y = f(state.y + f(oscillation - state.oscillationY)); state.oscillationY = oscillation;
        state.phaseY = advance(state.phaseY, 8.5);
        return;
    }
    const oscillationX = f(referenceSine(state.phaseX) * (type === 'flyer' ? 5 : 10));
    state.x = f(f(state.x + f(oscillationX - state.oscillationX)) + (type === 'flyer' ? state.velocityX : 0));
    state.oscillationX = oscillationX;
    state.phaseX = advance(state.phaseX, type === 'flyer' ? 8 : 14);
    if (type === 'flyer') {
        state.y = f(state.y + f(1.8));
        if ((state.x > 285 && state.velocityX > 0) || (state.x < 35 && state.velocityX < 0))
            state.velocityX = -state.velocityX;
    } else {
        const oscillationY = f(referenceSine(state.phaseY) * 5);
        state.y = f(state.y + f(oscillationY - state.oscillationY)); state.oscillationY = oscillationY;
        state.phaseY = advance(state.phaseY, 2.8);
    }
}

/** PlatformObject::vf3 reads the old progress and evaluates its float32 quadratic branch. */
export function referenceShiftEasing(progress: number): number {
    const f = Math.fround;
    const doubled = f(progress + progress);
    if (progress <= 0.5) return f(f(doubled * doubled) * 0.5);
    const phase = f(doubled - 1);
    return f(f(f(phase - 2) * phase) - 1) * -0.5;
}

export function reflectedPlatformX(x: number, velocity: number, seconds: number, width: number): number {
    const minimum = width * 28 / 320;
    const span = width * 264 / 320;
    const distance = x - minimum + velocity * Math.max(0, seconds);
    const phase = ((distance % (span * 2)) + span * 2) % (span * 2);
    return minimum + (phase <= span ? phase : span * 2 - phase);
}

export function referencePlatformType(rawType: number): DoodleJumpPlatformType {
    if (rawType === 1) return 'moving';
    if (rawType === 2) return 'breakable';
    if (rawType === 3) return 'disappearing';
    if (rawType >= 12 && rawType <= 15) return 'vertical-moving';
    if (rawType === 16 || rawType === 17) return 'exploding';
    if (rawType === 41 || rawType === 52) return 'shifting';
    if (rawType === 42 || rawType === 53) return 'teleport';
    return 'normal';
}

/** Bonus kind 2 -> PowerUp kind 0 (jetpack); bonus kind 3 -> kind 1 (hat). */
export function referenceFlightAcceleration(type: 'jetpack' | 'propeller-hat', frame: number): number {
    if (type === 'jetpack') return frame < 60 ? 0.17 : frame < 138 ? 0 : -0.14;
    return frame < 80 ? 0.11 : frame < 175 ? 0 : -0.14;
}

export type DoodleJumpSegmentContent = 'enemy' | 'hazard' | 'item';
export interface DoodleJumpSpawnPlan {
    readonly segmentId: number;
    readonly patternId?: number;
    readonly referenceRawType?: number;
    readonly content?: DoodleJumpSegmentContent;
    readonly enemyType?: DoodleJumpEnemyType;
    readonly enemyOffsetX?: number;
    readonly enemyOffsetY?: number;
    readonly hazardType?: DoodleJumpHazardType;
    readonly itemType?: DoodleJumpItemType;
    readonly itemOffsetX?: number;
    readonly itemOffsetY?: number;
    /** Bunny theme (native mode 6): one collectible on an otherwise empty normal/moving platform. */
    readonly collectibleOffsetX?: number;
    readonly collectibleVariant?: number;
    /** A source pattern's independent entity uses an invisible carrier, never a landing surface. */
    readonly entityOnly?: boolean;
    readonly initialHidden?: boolean;
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
    readonly previousBonusKind: number;
    readonly nextJetpackHeight: number;
    readonly nextPropellerHeight: number;
    readonly previousPlatformY: number;
    readonly earlyPatternOrder: readonly number[];
    readonly latePatternOrder: readonly number[];
    readonly earlyPatternCursor: number;
    readonly latePatternCursor: number;
    readonly patternRetryPending: boolean;
    readonly boostClearanceHeight: number;
    readonly pending: readonly DoodleJumpPlannedPlatform[];
}

export interface DoodleJumpGenerationContext {
    readonly flightPower?: 'jetpack' | 'propeller-hat';
    /** World-space landing surfaces that remain below the forecast apex and above its camera bottom. */
    readonly flightLandingWindow?: Readonly<{ minimumY: number; maximumY: number }>;
    readonly shieldActive?: boolean;
    /** Native +0x7430 counts jetpack pickups; hat flights use +0x85d0. */
    readonly jetpackPickupCount?: number;
    /** Native classic is 0. This hook preserves themed item gates without changing paper's default deck. */
    readonly nativeThemeMode?: number;
}
