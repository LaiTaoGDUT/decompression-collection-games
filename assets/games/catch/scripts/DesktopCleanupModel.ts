import type { DesktopCleanupGameplayConfig } from './DesktopCleanupConfig';
import { DEFAULT_DESKTOP_CLEANUP_CONFIG } from './DesktopCleanupConfig';
import {
    getDesktopCleanupTheme,
    selectDesktopCleanupTheme,
    type DesktopCleanupItemType,
    type DesktopCleanupThemeDefinition,
} from './DesktopCleanupTheme';

export {
    DESKTOP_CLEANUP_ITEM_TYPES,
    getDesktopCleanupTheme,
    selectDesktopCleanupTheme,
} from './DesktopCleanupTheme';
export type {
    DesktopCleanupItemType,
    DesktopCleanupThemeDefinition,
} from './DesktopCleanupTheme';
export type DesktopCleanupTool = 'return' | 'magnet' | 'shuffle';
export type DesktopCleanupPhase = 'playing' | 'failed' | 'won';
export type DesktopCleanupFailureReason = 'slots' | 'timeout';

/**
 * Legacy export kept for callers that still need the default theme's scales.
 * Runtime layout and physics always use the active theme definition below.
 */
export const DESKTOP_CLEANUP_ITEM_SIZE_MULTIPLIERS = getDesktopCleanupTheme().itemSizeMultipliers;

function maxItemSizeMultiplier(theme: DesktopCleanupThemeDefinition): number {
    return theme.itemTypes.reduce(
        (maximum, type) => Math.max(maximum, theme.itemSizeMultipliers[type] ?? 1),
        0,
    );
}

function itemSizeMultiplier(
    type: DesktopCleanupItemType | undefined,
    theme: DesktopCleanupThemeDefinition,
): number {
    return type ? (theme.itemSizeMultipliers[type] ?? 1) : maxItemSizeMultiplier(theme);
}

export interface DesktopCleanupItemSnapshot {
    readonly id: string;
    readonly type: DesktopCleanupItemType;
    readonly layer: number;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly angularVelocity: number;
    /** 伪 3D 抬升量；只影响显示层级和轻微的透视缩放。 */
    readonly elevation: number;
    readonly active: boolean;
    /** 近似表示当前是否露出；不作为点选的硬门槛。 */
    readonly free: boolean;
}

export interface DesktopCleanupShakeInput {
    /** 颠锅方向，使用桌面归一化坐标。 */
    readonly x: number;
    readonly y: number;
    /** 颠锅强度，建议范围 0.5–2。 */
    readonly strength: number;
}

export interface DesktopCleanupSlotSnapshot {
    readonly itemId: string;
    readonly type: DesktopCleanupItemType;
    readonly order: number;
}

export interface DesktopCleanupTripleMatch {
    readonly type: DesktopCleanupItemType;
    readonly itemIds: readonly [string, string, string];
}

export interface DesktopCleanupPendingSelection {
    readonly token: number;
    readonly selectedItemId: string;
    readonly insertionIndex: number;
    readonly triple?: DesktopCleanupTripleMatch;
}

export interface DesktopCleanupMagnetEffect {
    readonly type: DesktopCleanupItemType;
    readonly itemIds: readonly [string, string, string];
    readonly slotItemIds: readonly string[];
    readonly boardItemIds: readonly string[];
}

export interface DesktopCleanupSnapshot {
    readonly phase: DesktopCleanupPhase;
    readonly failureReason?: DesktopCleanupFailureReason;
    readonly remainingMs: number;
    readonly score: number;
    readonly itemsRemaining: number;
    readonly collectedBadges: number;
    readonly items: readonly DesktopCleanupItemSnapshot[];
    readonly slots: readonly DesktopCleanupSlotSnapshot[];
    readonly toolCharges: Readonly<Record<DesktopCleanupTool, number>>;
    readonly boostAdAttempted: boolean;
    readonly continueAdAttempted: boolean;
    readonly continued: boolean;
    readonly continuedWithTime: boolean;
    readonly layoutRevision: number;
    /**
     * Only triples waiting for their merge commit live here. Ordinary pickup
     * animation ownership belongs to the view and never gates logical slot
     * occupancy, so a lost visual cannot leave a model reservation behind.
     */
    readonly pendingSelections: readonly DesktopCleanupPendingSelection[];
}

export interface DesktopCleanupActionResult {
    readonly accepted: boolean;
    readonly reason?: 'state' | 'missing' | 'empty' | 'needs-ad' | 'unavailable' | 'busy' | 'full' | 'stale';
    readonly triple?: DesktopCleanupItemType;
    readonly magnet?: DesktopCleanupMagnetEffect;
    readonly removedItemIds?: readonly string[];
    readonly selection?: DesktopCleanupPendingSelection;
    readonly phase: DesktopCleanupPhase;
}

interface MutableItem {
    id: string;
    type: DesktopCleanupItemType;
    layer: number;
    x: number;
    y: number;
    angle: number;
    velocityX: number;
    velocityY: number;
    angularVelocity: number;
    elevation: number;
    active: boolean;
    free: boolean;
}

interface MutableSlot {
    itemId: string;
    type: DesktopCleanupItemType;
    order: number;
}

interface DesktopCleanupToolEffect {
    readonly triple?: DesktopCleanupItemType;
    readonly magnet?: DesktopCleanupMagnetEffect;
    readonly removedItemIds?: readonly string[];
}

// Keep the visible pile footprint unchanged while using 27 depth layers.
// Six items per layer gives a 162-item board without making the playmat too
// dense to read.
const LAYER_COUNT = 27;
const GROUPS_PER_LAYER = 2;
const ITEMS_PER_LAYER = GROUPS_PER_LAYER * 3;
const TOTAL_ITEM_COUNT = LAYER_COUNT * ITEMS_PER_LAYER;
// Each logical triplet is deliberately split across three different depth
// bands. The offsets are applied through a shuffled layer permutation so the
// pattern is not visible in the rendered pile.
const TRIPLET_LAYER_OFFSETS = Object.freeze([0, 7, 14]);
// Let the item cloud use almost the whole square playmat instead of stopping
// noticeably short of its visible edge. The rotated-item bound below remains
// the final guard for each individual item.
const STACK_X_LIMIT = 0.44;
const STACK_Y_LIMIT = 0.44;
/** PileRoot uses this factor when mapping normalized model coordinates to pixels. */
export const DESKTOP_CLEANUP_STACK_RENDER_SCALE = 0.96;
/** Base normalized half-size; type multipliers are applied by visibleCenterLimit. */
const STACK_ITEM_BASE_HALF_EXTENT = 0.15;
/**
 * Allow the item footprint to reach the playmat edge, with only a tiny
 * overscan so the pile does not look inset from the panel artwork.
 */
const STACK_EDGE_OVERSCAN = 0.02;
const PHYSICS_ITEM_RADIUS = 0.125;
const PHYSICS_MAX_SPEED = 0.90;
const PHYSICS_MAX_ANGULAR_SPEED = 120;
const PHYSICS_MAX_ELEVATION = 0.30;
const PHYSICS_ITEM_SCALE_PER_ELEVATION = 0.14;
const PHYSICS_SETTLE_SPEED = 0.006;
const PHYSICS_DEPTH_COLLISION_RANGE = 0.35;
const PHYSICS_COVER_RADIUS = PHYSICS_ITEM_RADIUS * 0.72;
const PHYSICS_EPSILON = 0.0001;
const PHYSICS_SHAKE_LAYER_ATTENUATION = 0.72;
const PHYSICS_SHAKE_COVERED_MOBILITY = 0.72;
const PHYSICS_SHAKE_STATIC_IMPULSE = 0.012;
const PHYSICS_SHAKE_ANGULAR_IMPULSE = 24;
const PHYSICS_SHAKE_ELEVATION_IMPULSE = 0.03;
// The initial cloud is random and may clamp against the playmat edge. Extra
// sweeps let each six-item layer settle before the first shake can wake it.
const INITIAL_POSITION_RELAXATION_PASSES = 256;

function visibleCenterLimit(
    angle: number,
    elevation = 0,
    type?: DesktopCleanupItemType,
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): number {
    const radians = angle * Math.PI / 180;
    const renderScale = itemSizeMultiplier(type, theme) * (
        1 + clamp(elevation, 0, PHYSICS_MAX_ELEVATION)
        * PHYSICS_ITEM_SCALE_PER_ELEVATION
    );
    const rotatedHalfExtent = STACK_ITEM_BASE_HALF_EXTENT * renderScale
        * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
    return Math.max(
        0.12,
        Math.min(
            STACK_X_LIMIT,
            STACK_Y_LIMIT,
            0.5 / DESKTOP_CLEANUP_STACK_RENDER_SCALE
                - rotatedHalfExtent
                + STACK_EDGE_OVERSCAN,
        ),
    );
}

function renderDepth(item: Pick<DesktopCleanupItemSnapshot, 'layer' | 'elevation'>): number {
    return item.layer + item.elevation * 4;
}

export function compareDesktopCleanupItems(
    left: Pick<DesktopCleanupItemSnapshot, 'id' | 'layer' | 'elevation'>,
    right: Pick<DesktopCleanupItemSnapshot, 'id' | 'layer' | 'elevation'>,
): number {
    return renderDepth(left) - renderDepth(right)
        || left.layer - right.layer
        || left.id.localeCompare(right.id);
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function createRandom(): () => number {
    return (): number => Math.random();
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        const current = result[index];
        result[index] = result[target];
        result[target] = current;
    }
    return result;
}

function physicsItemRadius(
    type: DesktopCleanupItemType,
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): number {
    return PHYSICS_ITEM_RADIUS * itemSizeMultiplier(type, theme);
}

function desktopCleanupPositionKey(x: number, y: number): string {
    return `${x.toFixed(4)}:${y.toFixed(4)}`;
}

function tripletCatalog(
    theme: DesktopCleanupThemeDefinition,
    random: () => number,
): readonly DesktopCleanupItemType[] {
    const ordinaryTypes = shuffle(
        theme.itemTypes.filter((type) => type !== theme.targetType),
        random,
    );
    if (ordinaryTypes.length === 0) {
        throw new Error(`Theme ${theme.id} needs at least one ordinary item type.`);
    }
    const catalog: DesktopCleanupItemType[] = [theme.targetType];
    // Keep the target as one dedicated triplet. The remaining logical groups
    // cycle through the active theme's ordinary catalog, so a theme can have
    // any number of ordinary item types while the board still has the same
    // fixed number of complete three-item groups.
    const ordinaryGroupCount = LAYER_COUNT * GROUPS_PER_LAYER - 1;
    for (let index = 0; index < ordinaryGroupCount; index += 1) {
        const type = ordinaryTypes[index % ordinaryTypes.length];
        if (type !== undefined) catalog.push(type);
    }
    return Object.freeze(catalog);
}

function distributeTripletsAcrossLayers(
    theme: DesktopCleanupThemeDefinition,
    random: () => number,
): readonly (readonly DesktopCleanupItemType[])[] {
    const layerOrder = shuffle(
        Array.from({ length: LAYER_COUNT }, (_value, index) => index),
        random,
    );
    const layerItems: DesktopCleanupItemType[][] = Array.from(
        { length: LAYER_COUNT },
        () => [],
    );
    tripletCatalog(theme, random).forEach((type, groupIndex) => {
        const baseLayer = groupIndex % LAYER_COUNT;
        TRIPLET_LAYER_OFFSETS.forEach((offset) => {
            const layer = layerOrder[(baseLayer + offset) % LAYER_COUNT];
            if (layer !== undefined) layerItems[layer].push(type);
        });
    });
    return Object.freeze(layerItems.map((items) => Object.freeze(items)));
}

interface DesktopCleanupGeneratedPosition {
    x: number;
    y: number;
    angle: number;
}

function stackedPositions(
    random: () => number,
    itemCount = LAYER_COUNT * ITEMS_PER_LAYER,
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): readonly DesktopCleanupGeneratedPosition[] {
    const positions: DesktopCleanupGeneratedPosition[] = [];
    const layerCount = Math.ceil(Math.max(0, itemCount) / ITEMS_PER_LAYER);
    for (let layer = 0; layer < layerCount; layer += 1) {
        // Every layer gets its own irregular cloud. There are deliberately
        // no reusable anchors or sinusoidal waves: those create a visible
        // ring/flower silhouette even when the item order is shuffled.
        const layerOffsetX = (random() - 0.5) * 0.12;
        const layerOffsetY = (random() - 0.5) * 0.12;
        // Fill the playmat with one broad irregular cloud per layer. The
        // final rotated-item bound below still owns the hard edge; these
        // larger spreads only make reaching that safe edge common enough that
        // a freshly spawned pile does not collapse into the center.
        const layerSpreadX = 0.37 + random() * 0.09;
        const layerSpreadY = 0.39 + random() * 0.09;
        const layerPositionKeys = new Set<string>();
        const count = Math.min(ITEMS_PER_LAYER, itemCount - positions.length);
        for (let index = 0; index < count; index += 1) {
            const spreadX = layerSpreadX * (0.88 + random() * 0.12);
            const spreadY = layerSpreadY * (0.88 + random() * 0.12);
            const angle = Math.round(-38 + random() * 76);
            const centerLimit = visibleCenterLimit(angle, 0, undefined, theme);
            let x = 0;
            let y = 0;
            let key = '';
            for (let attempt = 0; attempt < 32; attempt += 1) {
                x = clamp(layerOffsetX + (random() * 2 - 1) * spreadX, -centerLimit, centerLimit);
                y = clamp(layerOffsetY + (random() * 2 - 1) * spreadY, -centerLimit, centerLimit);
                key = desktopCleanupPositionKey(x, y);
                if (!layerPositionKeys.has(key)) break;
            }
            if (layerPositionKeys.has(key)) {
                // Broad edge-biased spreads can quantize several clamped
                // points to the same four-decimal coordinate. Use a sparse
                // fallback only for that rare collision, keeping the normal
                // layout fully random and asymmetric.
                const fallbackStart = (index * 17) % 81;
                for (let offset = 0; offset < 81; offset += 1) {
                    const candidate = (fallbackStart + offset) % 81;
                    const column = candidate % 9;
                    const row = Math.floor(candidate / 9);
                    x = -centerLimit + centerLimit * 2 * (column + 0.5) / 9;
                    y = -centerLimit + centerLimit * 2 * (row + 0.5) / 9;
                    key = desktopCleanupPositionKey(x, y);
                    if (!layerPositionKeys.has(key)) break;
                }
            }
            layerPositionKeys.add(key);
            positions.push(Object.freeze({ x, y, angle }));
        }
    }
    return Object.freeze(positions);
}

function clampGeneratedPosition(
    position: DesktopCleanupGeneratedPosition,
    type: DesktopCleanupItemType,
    theme: DesktopCleanupThemeDefinition,
): void {
    const centerLimit = visibleCenterLimit(position.angle, 0, type, theme);
    position.x = clamp(position.x, -centerLimit, centerLimit);
    position.y = clamp(position.y, -centerLimit, centerLimit);
}

function relaxInitialLayerPositions(
    positions: readonly DesktopCleanupGeneratedPosition[],
    layerItems: readonly (readonly DesktopCleanupItemType[])[],
    theme: DesktopCleanupThemeDefinition,
): readonly DesktopCleanupGeneratedPosition[] {
    // Only same-layer items participate in runtime collision resolution. The
    // overlap between different layers is intentional and creates the pile.
    const relaxed = positions.map((position) => ({ ...position }));
    for (let pass = 0; pass < INITIAL_POSITION_RELAXATION_PASSES; pass += 1) {
        let changed = false;
        for (let layer = 0; layer < layerItems.length; layer += 1) {
            const types = layerItems[layer] ?? [];
            const layerStart = layer * ITEMS_PER_LAYER;
            const layerEnd = Math.min(layerStart + types.length, relaxed.length);
            for (let leftIndex = layerStart; leftIndex < layerEnd; leftIndex += 1) {
                const left = relaxed[leftIndex];
                const leftType = types[leftIndex - layerStart];
                if (!left || !leftType) continue;
                for (let rightIndex = leftIndex + 1; rightIndex < layerEnd; rightIndex += 1) {
                    const right = relaxed[rightIndex];
                    const rightType = types[rightIndex - layerStart];
                    if (!right || !rightType) continue;
                    const dx = right.x - left.x;
                    const dy = right.y - left.y;
                    const distance = Math.hypot(dx, dy);
                    const minimumDistance = physicsItemRadius(leftType, theme)
                        + physicsItemRadius(rightType, theme);
                    if (distance >= minimumDistance) continue;

                    const safeDistance = Math.max(distance, PHYSICS_EPSILON);
                    const fallbackDirection = (leftIndex + rightIndex) % 2 === 0 ? 1 : -1;
                    const normalX = distance > PHYSICS_EPSILON ? dx / safeDistance : fallbackDirection;
                    const normalY = distance > PHYSICS_EPSILON ? dy / safeDistance : 0;
                    const correction = (minimumDistance - safeDistance) * 0.5;
                    left.x -= normalX * correction;
                    left.y -= normalY * correction;
                    right.x += normalX * correction;
                    right.y += normalY * correction;
                    clampGeneratedPosition(left, leftType, theme);
                    clampGeneratedPosition(right, rightType, theme);
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }
    return Object.freeze(relaxed.map((position) => Object.freeze({ ...position })));
}

export function desktopCleanupDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const monthValue = date.getMonth() + 1;
    const dayValue = date.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
    const day = dayValue < 10 ? `0${dayValue}` : `${dayValue}`;
    return `${year}-${month}-${day}`;
}

export function generateDesktopCleanupItems(
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): readonly DesktopCleanupItemSnapshot[] {
    const random = createRandom();
    const layerItems = distributeTripletsAcrossLayers(theme, random);
    const shuffledLayerItems = layerItems.map((items) => shuffle(items, random));
    const positions = relaxInitialLayerPositions(
        stackedPositions(random, LAYER_COUNT * ITEMS_PER_LAYER, theme),
        shuffledLayerItems,
        theme,
    );

    const items: DesktopCleanupItemSnapshot[] = [];
    for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
        (shuffledLayerItems[layer] ?? []).forEach((type, index) => {
            items.push(Object.freeze({
                id: `desk-${layer}-${index}-${type}`,
                type,
                layer,
                ...positions[layer * ITEMS_PER_LAYER + index],
                velocityX: 0,
                velocityY: 0,
                angularVelocity: 0,
                elevation: 0,
                active: true,
                free: false,
            }));
        });
    }
    return Object.freeze(items);
}

export interface DesktopCleanupLayoutVerification {
    readonly valid: boolean;
    readonly itemCount: number;
    readonly errors: readonly string[];
}

export function verifyDesktopCleanupLayout(
    items: readonly DesktopCleanupItemSnapshot[],
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): DesktopCleanupLayoutVerification {
    const errors: string[] = [];
    const totalItemCount = LAYER_COUNT * ITEMS_PER_LAYER;
    if (items.length !== totalItemCount) {
        errors.push(`expected ${totalItemCount} items, received ${items.length}`);
    }
    const ids = new Set<string>();
    const positionKeys = new Set<string>();
    const totals = new Map<DesktopCleanupItemType, number>();
    items.forEach((item) => {
        if (ids.has(item.id)) errors.push(`duplicate item id ${item.id}`);
        ids.add(item.id);
        const positionKey = `${item.layer}:${item.x.toFixed(4)}:${item.y.toFixed(4)}`;
        if (positionKeys.has(positionKey)) errors.push(`duplicate position inside layer ${positionKey}`);
        positionKeys.add(positionKey);
        totals.set(item.type, (totals.get(item.type) ?? 0) + 1);
        if (item.layer < 0 || item.layer >= LAYER_COUNT) {
            errors.push(`invalid layer ${item.layer}`);
        }
        const centerLimit = visibleCenterLimit(item.angle, item.elevation, item.type, theme);
        if (Math.abs(item.x) > centerLimit + PHYSICS_EPSILON
            || Math.abs(item.y) > centerLimit + PHYSICS_EPSILON) {
            errors.push(`item ${item.id} exceeds rotated playmat bounds`);
        }
    });
    totals.forEach((count, type) => {
        if (count % 3 !== 0) errors.push(`${type} count ${count} is not divisible by 3`);
    });
    for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
        const layerItems = items.filter((item) => item.layer === layer);
        if (layerItems.length !== ITEMS_PER_LAYER) {
            errors.push(`layer ${layer} contains ${layerItems.length} items`);
        }
        const layerTypeTotals = new Map<DesktopCleanupItemType, number>();
        layerItems.forEach((item) => {
            layerTypeTotals.set(item.type, (layerTypeTotals.get(item.type) ?? 0) + 1);
        });
        layerTypeTotals.forEach((count, type) => {
            if (count >= 3) {
                errors.push(`layer ${layer} exposes an immediate ${type} triple`);
            }
        });
    }
    const target = items.filter((item) => item.type === theme.targetType);
    if (target.length !== 3 || new Set(target.map((item) => item.layer)).size !== 3) {
        errors.push(`${theme.targetType} must be one triplet split across three layers`);
    }
    const xValues = items.map((item) => item.x);
    const yValues = items.map((item) => item.y);
    const horizontalSpan = Math.max(...xValues) - Math.min(...xValues);
    const verticalSpan = Math.max(...yValues) - Math.min(...yValues);
    if (horizontalSpan < 0.30 || horizontalSpan > STACK_X_LIMIT * 2) {
        errors.push(`compact stack horizontal span ${horizontalSpan.toFixed(3)} is out of range`);
    }
    if (verticalSpan < 0.28 || verticalSpan > STACK_Y_LIMIT * 2) {
        errors.push(`compact stack vertical span ${verticalSpan.toFixed(3)} is out of range`);
    }
    return Object.freeze({
        valid: errors.length === 0,
        itemCount: items.length,
        errors: Object.freeze(errors),
    });
}

export function runDesktopCleanupLayoutSelfCheck(
    samples = 365,
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
): DesktopCleanupLayoutVerification {
    const errors: string[] = [];
    for (let index = 0; index < samples; index += 1) {
        const result = verifyDesktopCleanupLayout(generateDesktopCleanupItems(theme), theme);
        if (!result.valid) result.errors.forEach((error) => errors.push(`sample ${index}: ${error}`));
    }
    return Object.freeze({
        valid: errors.length === 0,
        itemCount: samples * LAYER_COUNT * ITEMS_PER_LAYER,
        errors: Object.freeze(errors),
    });
}

export class DesktopCleanupModel {
    private readonly items = new Map<string, MutableItem>();
    private slots: MutableSlot[] = [];
    private currentPhase: DesktopCleanupPhase = 'playing';
    private currentFailure?: DesktopCleanupFailureReason;
    private timeLeftMs: number;
    private currentScore = 0;
    private selectionOrder = 0;
    private revision = 0;
    private boostAttempted = false;
    private continueAttempted = false;
    private usedContinue = false;
    private continuedWithTime = false;
    private pendingBoostTool?: DesktopCleanupTool;
    private continueAdPending = false;
    private readonly pendingSelections = new Map<number, DesktopCleanupPendingSelection>();
    private selectionToken = 0;
    private readonly charges: Record<DesktopCleanupTool, number>;
    private readonly initialBadgeCount = 3;
    readonly theme: DesktopCleanupThemeDefinition;

    constructor(
        readonly dateKey: string,
        readonly config: DesktopCleanupGameplayConfig = DEFAULT_DESKTOP_CLEANUP_CONFIG,
        theme: DesktopCleanupThemeDefinition = selectDesktopCleanupTheme(config.themeId),
    ) {
        this.theme = theme;
        const generated = generateDesktopCleanupItems(theme);
        const verification = verifyDesktopCleanupLayout(generated, theme);
        if (!verification.valid) {
            throw new Error(`Invalid desktop cleanup layout: ${verification.errors.join('; ')}`);
        }
        generated.forEach((item) => this.items.set(item.id, { ...item }));
        this.timeLeftMs = config.timeLimitSeconds * 1000;
        this.charges = {
            return: config.freeUsesPerTool,
            magnet: config.freeUsesPerTool,
            shuffle: config.freeUsesPerTool,
        };
        this.refreshExposure();
    }

    get phase(): DesktopCleanupPhase {
        return this.currentPhase;
    }

    get remainingMs(): number {
        return this.timeLeftMs;
    }

    isItemActive(itemId: string): boolean {
        return this.items.get(itemId)?.active === true;
    }

    get snapshot(): DesktopCleanupSnapshot {
        const items = Array.from(this.items.values()).map((item) => Object.freeze({ ...item }));
        return Object.freeze({
            phase: this.currentPhase,
            ...(this.currentFailure ? { failureReason: this.currentFailure } : {}),
            remainingMs: this.timeLeftMs,
            score: this.currentScore,
            itemsRemaining: items.filter((item) => item.active).length,
            collectedBadges: this.initialBadgeCount - items.filter(
                (item) => item.active && item.type === this.theme.targetType,
            ).length - this.slots.filter((slot) => slot.type === this.theme.targetType).length,
            items: Object.freeze(items),
            slots: Object.freeze(this.slots.map((slot) => Object.freeze({ ...slot }))),
            toolCharges: Object.freeze({ ...this.charges }),
            boostAdAttempted: this.boostAttempted,
            continueAdAttempted: this.continueAttempted,
            continued: this.usedContinue,
            continuedWithTime: this.continuedWithTime,
            layoutRevision: this.revision,
            pendingSelections: Object.freeze(Array.from(this.pendingSelections.values())),
        });
    }

    tick(deltaMs: number): boolean {
        if (this.currentPhase !== 'playing'
            || this.pendingSelections.size > 0
            || !Number.isFinite(deltaMs)
            || deltaMs <= 0) return false;
        const physicsChanged = this.stepPhysics(Math.min(deltaMs, 50) / 1000);
        this.timeLeftMs = Math.max(0, this.timeLeftMs - deltaMs);
        if (this.timeLeftMs <= 0) this.fail('timeout');
        return physicsChanged;
    }

    applyShake(input: DesktopCleanupShakeInput): boolean {
        if (this.currentPhase !== 'playing'
            || !Number.isFinite(input.x)
            || !Number.isFinite(input.y)
            || !Number.isFinite(input.strength)) return false;
        const directionLength = Math.hypot(input.x, input.y);
        if (directionLength <= PHYSICS_EPSILON) return false;
        const directionX = input.x / directionLength;
        const directionY = input.y / directionLength;
        const strength = clamp(input.strength, 0.7, 2);
        const impulse = this.config.shakeImpulse * strength;
        const active = Array.from(this.items.values()).filter((item) => item.active);
        const frontLayer = active.reduce(
            (highest, item) => Math.max(highest, item.layer),
            0,
        );
        active.forEach((item) => {
            // 堆叠越深，受到的桌面冲量越弱；已经露出的低层物件仍保留少量
            // 响应，被覆盖物件再叠加一层“堆压”衰减。这样不是只开关 free，
            // 也不会让整堆物件以相同速度一起滑走。
            const depth = Math.max(0, frontLayer - item.layer);
            const layerRatio = Math.min(1, depth / Math.max(frontLayer, 1));
            const layerMobility = 1 - layerRatio * PHYSICS_SHAKE_LAYER_ATTENUATION;
            const mobility = layerMobility * (
                item.free ? 1 : PHYSICS_SHAKE_COVERED_MOBILITY
            );
            const itemImpulse = impulse * mobility;
            // 很小的传导被静摩擦吸收，只保留极轻微抬升/旋转反馈。
            if (itemImpulse >= PHYSICS_SHAKE_STATIC_IMPULSE) {
                item.velocityX = clamp(
                    item.velocityX + directionX * itemImpulse,
                    -PHYSICS_MAX_SPEED,
                    PHYSICS_MAX_SPEED,
                );
                item.velocityY = clamp(
                    item.velocityY + directionY * itemImpulse,
                    -PHYSICS_MAX_SPEED,
                    PHYSICS_MAX_SPEED,
                );
            }
            const spinDirection = directionX * (item.layer % 2 === 0 ? 1 : -1) + directionY;
            item.angularVelocity = clamp(
                item.angularVelocity + spinDirection * PHYSICS_SHAKE_ANGULAR_IMPULSE * strength * mobility,
                -PHYSICS_MAX_ANGULAR_SPEED,
                PHYSICS_MAX_ANGULAR_SPEED,
            );
            item.elevation = clamp(
                item.elevation + PHYSICS_SHAKE_ELEVATION_IMPULSE * strength * mobility,
                0,
                PHYSICS_MAX_ELEVATION,
            );
        });
        return true;
    }

    selectItem(itemId: string): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        // Pending merge items occupy their cells until the merge presentation
        // completes, unless a new pickup explicitly releases that active merge
        // first. Do not let a pickup overrun the tray while those cells wait.
        if (this.slots.length >= this.config.slotCapacity) return this.reject('full');
        const item = this.items.get(itemId);
        if (!item || !item.active) return this.reject('missing');

        item.active = false;
        item.free = false;
        item.velocityX = 0;
        item.velocityY = 0;
        item.angularVelocity = 0;
        item.elevation = 0;
        const slot: MutableSlot = {
            itemId: item.id,
            type: item.type,
            order: ++this.selectionOrder,
        };
        const lastSame = this.slots.reduce(
            (last, current, index) => current.type === slot.type ? index : last,
            -1,
        );
        const insertionIndex = lastSame >= 0 ? lastSame + 1 : this.slots.length;
        this.slots.splice(insertionIndex, 0, slot);
        const triple = this.findSlotTriple(item.type);
        const selection: DesktopCleanupPendingSelection = Object.freeze({
            token: ++this.selectionToken,
            selectedItemId: item.id,
            insertionIndex,
            ...(triple ? { triple } : {}),
        });
        if (selection.triple) this.pendingSelections.set(selection.token, selection);
        this.refreshExposure();
        return Object.freeze({
            accepted: true,
            selection,
            phase: this.currentPhase,
        });
    }

    finalizeSelectionBatch(): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            phase: this.currentPhase,
        });
    }

    settleSelection(token: number): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        const pending = this.pendingSelections.get(token);
        if (!pending) return this.reject('stale');

        this.pendingSelections.delete(token);
        if (pending.triple) {
            const ids = new Set(pending.triple.itemIds);
            this.slots = this.slots.filter((slot) => !ids.has(slot.itemId));
            this.currentScore += this.config.pointsPerTriple;
        }
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            ...(pending.triple ? { triple: pending.triple.type } : {}),
            phase: this.currentPhase,
        });
    }

    useTool(tool: DesktopCleanupTool): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        if (this.pendingSelections.size > 0) return this.reject('busy');
        if (this.charges[tool] <= 0) {
            return this.reject(this.boostAttempted ? 'unavailable' : 'needs-ad');
        }
        if (!this.canApplyTool(tool)) return this.reject('empty');
        this.charges[tool] -= 1;
        const effect = this.applyTool(tool);
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            ...(effect.triple ? { triple: effect.triple } : {}),
            ...(effect.magnet ? { magnet: effect.magnet } : {}),
            ...(effect.removedItemIds ? { removedItemIds: effect.removedItemIds } : {}),
            phase: this.currentPhase,
        });
    }

    beginBoostAd(tool: DesktopCleanupTool): boolean {
        if (this.currentPhase !== 'playing'
            || this.pendingSelections.size > 0
            || this.boostAttempted
            || this.pendingBoostTool !== undefined
            || this.charges[tool] > 0
            || !this.canApplyTool(tool)) {
            return false;
        }
        this.pendingBoostTool = tool;
        return true;
    }

    resolveBoostAd(completed: boolean): DesktopCleanupActionResult {
        const tool = this.pendingBoostTool;
        this.pendingBoostTool = undefined;
        if (this.pendingSelections.size > 0) return this.reject('busy');
        if (!completed || !tool || this.currentPhase !== 'playing') return this.reject('unavailable');
        const effect = this.applyTool(tool);
        this.boostAttempted = true;
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            ...(effect.triple ? { triple: effect.triple } : {}),
            ...(effect.magnet ? { magnet: effect.magnet } : {}),
            ...(effect.removedItemIds ? { removedItemIds: effect.removedItemIds } : {}),
            phase: this.currentPhase,
        });
    }

    beginContinueAd(): boolean {
        if (this.currentPhase !== 'failed' || this.continueAttempted || this.continueAdPending) return false;
        this.continueAdPending = true;
        return true;
    }

    resolveContinueAd(completed: boolean): DesktopCleanupActionResult {
        if (!this.continueAdPending) return this.reject('stale');
        this.continueAdPending = false;
        if (!completed || this.currentPhase !== 'failed') return this.reject('unavailable');
        let removedItemIds: readonly string[] | undefined;
        if (this.currentFailure === 'slots') {
            removedItemIds = this.removeRecentSlots(3);
        } else {
            this.timeLeftMs += this.config.continueSeconds * 1000;
            this.continuedWithTime = true;
        }
        this.currentFailure = undefined;
        this.currentPhase = 'playing';
        this.continueAttempted = true;
        this.usedContinue = true;
        return Object.freeze({
            accepted: true,
            ...(removedItemIds ? { removedItemIds } : {}),
            phase: this.currentPhase,
        });
    }

    private canApplyTool(tool: DesktopCleanupTool): boolean {
        if (tool === 'return') return this.slots.length > 0;
        if (tool === 'shuffle') return Array.from(this.items.values()).some((item) => item.active);
        return this.findCompletableType() !== undefined;
    }

    private applyTool(tool: DesktopCleanupTool): DesktopCleanupToolEffect {
        if (tool === 'return') {
            return Object.freeze({ removedItemIds: this.removeRecentSlots(3) });
        }
        if (tool === 'shuffle') {
            this.revision += 1;
            const random = createRandom();
            const active = shuffle(Array.from(this.items.values()).filter((item) => item.active), random);
            const positions = stackedPositions(random, active.length, this.theme);
            active.forEach((item, index) => {
                item.free = false;
                item.layer = Math.floor(index / ITEMS_PER_LAYER);
                const position = positions[index];
                item.x = position.x;
                item.y = position.y;
                item.angle = position.angle;
                item.velocityX = 0;
                item.velocityY = 0;
                item.angularVelocity = 0;
                item.elevation = 0;
            });
            this.refreshExposure();
            return Object.freeze({});
        }
        const magnet = this.completeBestGroup();
        return magnet
            ? Object.freeze({ triple: magnet.type, magnet })
            : Object.freeze({});
    }

    private removeRecentSlots(maximum: number): readonly string[] {
        const recent = [...this.slots]
            .sort((left, right) => right.order - left.order)
            .slice(0, maximum);
        const recentIds = new Set(recent.map((slot) => slot.itemId));
        this.slots = this.slots.filter((slot) => !recentIds.has(slot.itemId));
        this.revision += 1;
        const activeItems = Array.from(this.items.values()).filter((item) => item.active);
        const frontLayer = activeItems.reduce(
            (highest, item) => Math.max(highest, item.layer),
            -1,
        );
        // These items were only parked in the tray temporarily. Return them
        // to the desktop at their original positions, but promote them above
        // the current pile so the tool cannot return an item underneath the
        // pieces that were already exposed after it was picked up.
        recent.slice().reverse().forEach((slot, index) => {
            const item = this.items.get(slot.itemId);
            if (!item) return;
            item.active = true;
            item.layer = frontLayer + index + 1;
            item.free = false;
            item.velocityX = 0;
            item.velocityY = 0;
            item.angularVelocity = 0;
            item.elevation = 0;
        });
        this.refreshExposure();
        return Object.freeze(recent.map((slot) => slot.itemId));
    }

    private findCompletableType(): DesktopCleanupItemType | undefined {
        const slotCounts = new Map<DesktopCleanupItemType, number>();
        this.slots.forEach((slot) => slotCounts.set(slot.type, (slotCounts.get(slot.type) ?? 0) + 1));
        const availableCounts = new Map<DesktopCleanupItemType, number>();
        Array.from(this.items.values()).filter((item) => item.active).forEach((item) => {
            availableCounts.set(item.type, (availableCounts.get(item.type) ?? 0) + 1);
        });
        const candidates = this.theme.itemTypes.filter((type) => (
            (slotCounts.get(type) ?? 0) + (availableCounts.get(type) ?? 0) >= 3
        ));
        return candidates.sort((left, right) => (
            (slotCounts.get(right) ?? 0) - (slotCounts.get(left) ?? 0)
            || (availableCounts.get(right) ?? 0) - (availableCounts.get(left) ?? 0)
        ))[0];
    }

    private completeBestGroup(): DesktopCleanupMagnetEffect | undefined {
        const type = this.findCompletableType();
        if (!type) return undefined;
        const slotMatches = this.slots
            .filter((slot) => slot.type === type)
            .sort((left, right) => right.order - left.order)
            .slice(0, 3);
        const needed = 3 - slotMatches.length;
        const boardMatches = Array.from(this.items.values())
            .filter((item) => item.active && item.type === type)
            .sort((left, right) => Number(right.free) - Number(left.free) || right.layer - left.layer)
            .slice(0, needed);
        const slotItemIds = Object.freeze(slotMatches.map((slot) => slot.itemId));
        const boardItemIds = Object.freeze(boardMatches.map((item) => item.id));
        const itemIds = Object.freeze([
            ...slotItemIds,
            ...boardItemIds,
        ]) as readonly [string, string, string];
        const selectedIds = new Set(itemIds);
        this.slots = this.slots.filter((slot) => !selectedIds.has(slot.itemId));
        boardMatches.forEach((item) => {
            item.active = false;
            item.free = false;
            item.velocityX = 0;
            item.velocityY = 0;
            item.angularVelocity = 0;
            item.elevation = 0;
        });
        this.currentScore += this.config.pointsPerTriple;
        this.refreshExposure();
        return Object.freeze({
            type,
            itemIds,
            slotItemIds,
            boardItemIds,
        });
    }

    private stepPhysics(deltaSeconds: number): boolean {
        const active = Array.from(this.items.values()).filter((item) => item.active);
        if (active.length === 0) return false;
        let changed = false;
        const movingItems = new Set<MutableItem>();
        active.forEach((item) => {
            const speed = Math.hypot(item.velocityX, item.velocityY);
            const angularSpeed = Math.abs(item.angularVelocity);
            const moving = speed > PHYSICS_SETTLE_SPEED || angularSpeed > 0.5 || item.elevation > PHYSICS_EPSILON;
            if (!moving) return;
            movingItems.add(item);
            changed = true;
            item.x += item.velocityX * deltaSeconds;
            item.y += item.velocityY * deltaSeconds;
            item.angle += item.angularVelocity * deltaSeconds;
            this.resolveBoundary(item);

            const linearDamping = Math.exp(-this.config.physicsDamping * deltaSeconds);
            const angularDamping = Math.exp(-this.config.physicsAngularDamping * deltaSeconds);
            item.velocityX *= linearDamping;
            item.velocityY *= linearDamping;
            item.angularVelocity *= angularDamping;
            item.elevation = Math.max(0, item.elevation - deltaSeconds * 0.34);
            if (Math.hypot(item.velocityX, item.velocityY) < PHYSICS_SETTLE_SPEED) {
                item.velocityX = 0;
                item.velocityY = 0;
            }
            if (Math.abs(item.angularVelocity) < 0.5) item.angularVelocity = 0;
        });

        for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
            const left = active[leftIndex];
            if (!left) continue;
            for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
                const right = active[rightIndex];
                if (!right || (!movingItems.has(left) && !movingItems.has(right))) continue;
                if (Math.abs(left.layer - right.layer) > PHYSICS_DEPTH_COLLISION_RANGE) continue;
                const dx = right.x - left.x;
                const dy = right.y - left.y;
                const distance = Math.hypot(dx, dy);
                const minimumDistance = physicsItemRadius(left.type, this.theme)
                    + physicsItemRadius(right.type, this.theme);
                if (distance >= minimumDistance) continue;
                const safeDistance = Math.max(distance, PHYSICS_EPSILON);
                const normalX = distance > PHYSICS_EPSILON ? dx / safeDistance : 1;
                const normalY = distance > PHYSICS_EPSILON ? dy / safeDistance : 0;
                const overlap = minimumDistance - safeDistance;
                const leftMobility = left.free ? 1 : 0.2;
                const rightMobility = right.free ? 1 : 0.2;
                const mobilityTotal = leftMobility + rightMobility;
                left.x -= normalX * overlap * leftMobility / mobilityTotal;
                left.y -= normalY * overlap * leftMobility / mobilityTotal;
                right.x += normalX * overlap * rightMobility / mobilityTotal;
                right.y += normalY * overlap * rightMobility / mobilityTotal;
                const relativeVelocity = (right.velocityX - left.velocityX) * normalX
                    + (right.velocityY - left.velocityY) * normalY;
                if (relativeVelocity < 0) {
                    const bounce = 1 + this.config.physicsBounce;
                    const impulse = -relativeVelocity * bounce / mobilityTotal;
                    left.velocityX -= normalX * impulse * leftMobility;
                    left.velocityY -= normalY * impulse * leftMobility;
                    right.velocityX += normalX * impulse * rightMobility;
                    right.velocityY += normalY * impulse * rightMobility;
                }
                changed = true;
            }
        }
        if (changed) {
            // Pair separation can move either participant, including a
            // settled item pushed by a moving one. Reapply the same rotated
            // bounds after all pairs have been resolved so collision order
            // can never leak an item through the playmat edge.
            active.forEach((item) => this.resolveBoundary(item));
            this.refreshExposure();
        }
        return changed;
    }

    private resolveBoundary(item: MutableItem): void {
        const centerLimit = visibleCenterLimit(item.angle, item.elevation, item.type, this.theme);
        if (item.x < -centerLimit) {
            item.x = -centerLimit;
            item.velocityX = Math.abs(item.velocityX) * this.config.physicsBounce;
        } else if (item.x > centerLimit) {
            item.x = centerLimit;
            item.velocityX = -Math.abs(item.velocityX) * this.config.physicsBounce;
        }
        if (item.y < -centerLimit) {
            item.y = -centerLimit;
            item.velocityY = Math.abs(item.velocityY) * this.config.physicsBounce;
        } else if (item.y > centerLimit) {
            item.y = centerLimit;
            item.velocityY = -Math.abs(item.velocityY) * this.config.physicsBounce;
        }
    }

    private refreshExposure(): void {
        const active = Array.from(this.items.values())
            .filter((item) => item.active)
            .sort((left, right) => compareDesktopCleanupItems(left, right));
        active.forEach((item, index) => {
            item.free = !active.some((candidate, candidateIndex) => {
                if (candidateIndex <= index) return false;
                const distance = Math.hypot(candidate.x - item.x, candidate.y - item.y);
                const coverageScale = (
                    itemSizeMultiplier(item.type, this.theme) + itemSizeMultiplier(candidate.type, this.theme)
                ) / 2;
                return distance < PHYSICS_COVER_RADIUS * coverageScale;
            });
        });
    }

    private findSlotTriple(type: DesktopCleanupItemType): DesktopCleanupTripleMatch | undefined {
        const pendingMatchItemIds = new Set<string>();
        this.pendingSelections.forEach((selection) => {
            selection.triple?.itemIds.forEach((itemId) => pendingMatchItemIds.add(itemId));
        });
        const matches = this.slots.filter((slot) => (
            slot.type === type && !pendingMatchItemIds.has(slot.itemId)
        ));
        if (matches.length < 3) return undefined;
        const itemIds: readonly [string, string, string] = Object.freeze([
            matches[0].itemId,
            matches[1].itemId,
            matches[2].itemId,
        ]);
        return Object.freeze({
            type,
            itemIds,
        });
    }

    private finishOrFail(): void {
        const active = Array.from(this.items.values()).some((item) => item.active);
        if (!active && this.slots.length === 0 && this.pendingSelections.size === 0) {
            const unused = (['return', 'magnet', 'shuffle'] as DesktopCleanupTool[])
                .filter((tool) => this.charges[tool] > 0).length;
            this.currentScore += Math.floor(this.timeLeftMs / 1000) * this.config.remainingSecondBonus;
            this.currentScore += unused * this.config.unusedToolBonus;
            if (!this.usedContinue) this.currentScore += this.config.noContinueBonus;
            this.currentPhase = 'won';
            this.currentFailure = undefined;
            return;
        }
        // A full tray is terminal only when no queued triple can still release
        // three cells. The view calls finalizeSelectionBatch after the current
        // pickup animation batch reaches its presentation checkpoint.
        if (this.slots.length >= this.config.slotCapacity && this.pendingSelections.size === 0) {
            this.fail('slots');
        }
    }

    private fail(reason: DesktopCleanupFailureReason): void {
        this.currentPhase = 'failed';
        this.currentFailure = reason;
    }

    private reject(reason: DesktopCleanupActionResult['reason']): DesktopCleanupActionResult {
        return Object.freeze({ accepted: false, reason, phase: this.currentPhase });
    }
}
