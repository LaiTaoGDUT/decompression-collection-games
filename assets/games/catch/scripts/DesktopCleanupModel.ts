import type { DesktopCleanupGameplayConfig } from './DesktopCleanupConfig';
import { DEFAULT_DESKTOP_CLEANUP_CONFIG } from './DesktopCleanupConfig';

export const DESKTOP_CLEANUP_ITEM_TYPES = Object.freeze([
    'blue-pen',
    'red-pencil',
    'yellow-eraser',
    'mint-notes',
    'binder-clip',
    'orange-tape',
    'teal-usb',
    'cream-earbuds',
    'coral-keycap',
    'purple-stress-ball',
    'round-coaster',
    'spiral-notebook',
    'clear-ruler',
    'lucky-badge',
] as const);

export type DesktopCleanupItemType = typeof DESKTOP_CLEANUP_ITEM_TYPES[number];
export type DesktopCleanupTool = 'return' | 'magnet' | 'shuffle';
export type DesktopCleanupPhase = 'playing' | 'failed' | 'won';
export type DesktopCleanupFailureReason = 'slots' | 'timeout';

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

const COMMON_TYPES = DESKTOP_CLEANUP_ITEM_TYPES.slice(0, 10);
const RARE_TYPES = DESKTOP_CLEANUP_ITEM_TYPES.slice(10, 13);
const TARGET_TYPE: DesktopCleanupItemType = 'lucky-badge';
const LAYER_COUNT = 24;
const GROUPS_PER_LAYER = 2;
const ITEMS_PER_LAYER = GROUPS_PER_LAYER * 3;
const TOTAL_ITEM_COUNT = LAYER_COUNT * ITEMS_PER_LAYER;
const STACK_X_LIMIT = 0.36;
const STACK_Y_LIMIT = 0.36;
/** PileRoot uses this factor when mapping normalized model coordinates to pixels. */
export const DESKTOP_CLEANUP_STACK_RENDER_SCALE = 0.96;
/** Conservative normalized half-size for the enlarged square item nodes. */
const STACK_ITEM_HALF_EXTENT = 0.15;
/** Keep rotated corners inside the visible playmat, not just inside PileRoot. */
const STACK_CONTAINER_MARGIN = 0.04;
const PHYSICS_ITEM_RADIUS = 0.125;
const PHYSICS_MAX_SPEED = 0.72;
const PHYSICS_MAX_ANGULAR_SPEED = 120;
const PHYSICS_MAX_ELEVATION = 0.30;
const PHYSICS_SETTLE_SPEED = 0.006;
const PHYSICS_DEPTH_COLLISION_RANGE = 0.35;
const PHYSICS_COVER_RADIUS = PHYSICS_ITEM_RADIUS * 0.72;
const PHYSICS_EPSILON = 0.0001;

function visibleCenterLimit(angle: number): number {
    const radians = angle * Math.PI / 180;
    const rotatedHalfExtent = STACK_ITEM_HALF_EXTENT
        * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
    return Math.max(
        0.12,
        Math.min(
            STACK_X_LIMIT,
            STACK_Y_LIMIT,
            0.5 / DESKTOP_CLEANUP_STACK_RENDER_SCALE
                - rotatedHalfExtent
                - STACK_CONTAINER_MARGIN,
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

function tripletCatalog(): DesktopCleanupItemType[] {
    const catalog: DesktopCleanupItemType[] = [];
    // Double the original ordinary-item groups while keeping the three
    // lucky badges as the single target triplet. The extra ordinary group
    // keeps the 24-layer layout at exactly two complete triplets per layer.
    COMMON_TYPES.forEach((type) => {
        for (let count = 0; count < 4; count += 1) catalog.push(type);
    });
    RARE_TYPES.forEach((type, index) => {
        const groupCount = index === 0 ? 3 : 2;
        for (let count = 0; count < groupCount; count += 1) catalog.push(type);
    });
    return catalog;
}

function stackedPositions(
    random: () => number,
    itemCount = LAYER_COUNT * ITEMS_PER_LAYER,
): readonly {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
}[] {
    const positions: { x: number; y: number; angle: number }[] = [];
    const layerCount = Math.ceil(Math.max(0, itemCount) / ITEMS_PER_LAYER);
    for (let layer = 0; layer < layerCount; layer += 1) {
        // Every layer gets its own irregular cloud. There are deliberately
        // no reusable anchors or sinusoidal waves: those create a visible
        // ring/flower silhouette even when the item order is shuffled.
        const layerOffsetX = (random() - 0.5) * 0.12;
        const layerOffsetY = (random() - 0.5) * 0.12;
        const layerSpreadX = 0.26 + random() * 0.10;
        const layerSpreadY = 0.28 + random() * 0.08;
        const count = Math.min(ITEMS_PER_LAYER, itemCount - positions.length);
        for (let index = 0; index < count; index += 1) {
            const spreadX = layerSpreadX * (0.82 + random() * 0.18);
            const spreadY = layerSpreadY * (0.82 + random() * 0.18);
            const angle = Math.round(-38 + random() * 76);
            const centerLimit = visibleCenterLimit(angle);
            positions.push(Object.freeze({
                x: clamp(layerOffsetX + (random() * 2 - 1) * spreadX, -centerLimit, centerLimit),
                y: clamp(layerOffsetY + (random() * 2 - 1) * spreadY, -centerLimit, centerLimit),
                angle,
            }));
        }
    }
    return Object.freeze(positions);
}

export function desktopCleanupDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const monthValue = date.getMonth() + 1;
    const dayValue = date.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
    const day = dayValue < 10 ? `0${dayValue}` : `${dayValue}`;
    return `${year}-${month}-${day}`;
}

export function generateDesktopCleanupItems(): readonly DesktopCleanupItemSnapshot[] {
    const random = createRandom();
    const ordinary = shuffle(tripletCatalog(), random);
    const positions = stackedPositions(random);
    const layerGroups: DesktopCleanupItemType[][] = Array.from(
        { length: LAYER_COUNT },
        () => [],
    );
    layerGroups[0].push(TARGET_TYPE, ...ordinary.splice(0, GROUPS_PER_LAYER - 1));
    for (let layer = 1; layer < LAYER_COUNT; layer += 1) {
        layerGroups[layer].push(...ordinary.splice(0, GROUPS_PER_LAYER));
    }

    const items: DesktopCleanupItemSnapshot[] = [];
    for (let layer = 0; layer < LAYER_COUNT; layer += 1) {
        const types: DesktopCleanupItemType[] = [];
        layerGroups[layer].forEach((type) => types.push(type, type, type));
        shuffle(types, random).forEach((type, index) => {
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
): DesktopCleanupLayoutVerification {
    const errors: string[] = [];
    if (items.length !== TOTAL_ITEM_COUNT) {
        errors.push(`expected ${TOTAL_ITEM_COUNT} items, received ${items.length}`);
    }
    const ids = new Set<string>();
    const positionKeys = new Set<string>();
    const totals = new Map<DesktopCleanupItemType, number>();
    const layerTotals = new Map<string, number>();
    items.forEach((item) => {
        if (ids.has(item.id)) errors.push(`duplicate item id ${item.id}`);
        ids.add(item.id);
        const positionKey = `${item.layer}:${item.x.toFixed(4)}:${item.y.toFixed(4)}`;
        if (positionKeys.has(positionKey)) errors.push(`duplicate position inside layer ${positionKey}`);
        positionKeys.add(positionKey);
        totals.set(item.type, (totals.get(item.type) ?? 0) + 1);
        const key = `${item.layer}:${item.type}`;
        layerTotals.set(key, (layerTotals.get(key) ?? 0) + 1);
        if (item.layer < 0 || item.layer >= LAYER_COUNT) {
            errors.push(`invalid layer ${item.layer}`);
        }
        const centerLimit = visibleCenterLimit(item.angle);
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
        const types = new Set(layerItems.map((item) => item.type));
        types.forEach((type) => {
            const count = layerTotals.get(`${layer}:${type}`) ?? 0;
            if (count % 3 !== 0) errors.push(`layer ${layer} has incomplete ${type} group`);
        });
    }
    const target = items.filter((item) => item.type === TARGET_TYPE);
    if (target.length !== 3 || target.some((item) => item.layer !== 0)) {
        errors.push('lucky badges must be one triplet in the deepest layer');
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
): DesktopCleanupLayoutVerification {
    const errors: string[] = [];
    for (let index = 0; index < samples; index += 1) {
        const result = verifyDesktopCleanupLayout(generateDesktopCleanupItems());
        if (!result.valid) result.errors.forEach((error) => errors.push(`sample ${index}: ${error}`));
    }
    return Object.freeze({
        valid: errors.length === 0,
        itemCount: samples * TOTAL_ITEM_COUNT,
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
    private readonly pendingSelections = new Map<number, DesktopCleanupPendingSelection>();
    private selectionToken = 0;
    private readonly charges: Record<DesktopCleanupTool, number>;
    private readonly initialBadgeCount = 3;

    constructor(
        readonly dateKey: string,
        readonly config: DesktopCleanupGameplayConfig = DEFAULT_DESKTOP_CLEANUP_CONFIG,
    ) {
        const generated = generateDesktopCleanupItems();
        const verification = verifyDesktopCleanupLayout(generated);
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

    get snapshot(): DesktopCleanupSnapshot {
        const items = [...this.items.values()].map((item) => Object.freeze({ ...item }));
        return Object.freeze({
            phase: this.currentPhase,
            ...(this.currentFailure ? { failureReason: this.currentFailure } : {}),
            remainingMs: this.timeLeftMs,
            score: this.currentScore,
            itemsRemaining: items.filter((item) => item.active).length,
            collectedBadges: this.initialBadgeCount - items.filter(
                (item) => item.active && item.type === TARGET_TYPE,
            ).length - this.slots.filter((slot) => slot.type === TARGET_TYPE).length,
            items: Object.freeze(items),
            slots: Object.freeze(this.slots.map((slot) => Object.freeze({ ...slot }))),
            toolCharges: Object.freeze({ ...this.charges }),
            boostAdAttempted: this.boostAttempted,
            continueAdAttempted: this.continueAttempted,
            continued: this.usedContinue,
            continuedWithTime: this.continuedWithTime,
            layoutRevision: this.revision,
            pendingSelections: Object.freeze([...this.pendingSelections.values()]),
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
        const strength = clamp(input.strength, 0.35, 2.2);
        const impulse = this.config.shakeImpulse * strength;
        this.items.forEach((item) => {
            if (!item.active) return;
            // 露出的物件更容易被颠起；被压住的物件仍会获得一部分桌面传导
            // 的冲量，等上层滑开后就能自然露出来。
            const mobility = item.free ? 1 : 0.24;
            item.velocityX = clamp(item.velocityX + directionX * impulse * mobility, -PHYSICS_MAX_SPEED, PHYSICS_MAX_SPEED);
            item.velocityY = clamp(item.velocityY + directionY * impulse * mobility, -PHYSICS_MAX_SPEED, PHYSICS_MAX_SPEED);
            const spinDirection = directionX * (item.layer % 2 === 0 ? 1 : -1) + directionY;
            item.angularVelocity = clamp(
                item.angularVelocity + spinDirection * 48 * strength * mobility,
                -PHYSICS_MAX_ANGULAR_SPEED,
                PHYSICS_MAX_ANGULAR_SPEED,
            );
            item.elevation = clamp(
                item.elevation + (0.035 + 0.025 * mobility) * strength,
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
        const triple = this.applyTool(tool);
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            ...(triple ? { triple } : {}),
            phase: this.currentPhase,
        });
    }

    beginBoostAd(tool: DesktopCleanupTool): boolean {
        if (this.currentPhase !== 'playing'
            || this.pendingSelections.size > 0
            || this.boostAttempted
            || this.charges[tool] > 0
            || !this.canApplyTool(tool)) {
            return false;
        }
        this.boostAttempted = true;
        this.pendingBoostTool = tool;
        return true;
    }

    resolveBoostAd(completed: boolean): DesktopCleanupActionResult {
        const tool = this.pendingBoostTool;
        this.pendingBoostTool = undefined;
        if (this.pendingSelections.size > 0) return this.reject('busy');
        if (!completed || !tool || this.currentPhase !== 'playing') return this.reject('unavailable');
        const triple = this.applyTool(tool);
        this.finishOrFail();
        return Object.freeze({
            accepted: true,
            ...(triple ? { triple } : {}),
            phase: this.currentPhase,
        });
    }

    beginContinueAd(): boolean {
        if (this.currentPhase !== 'failed' || this.continueAttempted) return false;
        this.continueAttempted = true;
        return true;
    }

    resolveContinueAd(completed: boolean): boolean {
        if (!completed || this.currentPhase !== 'failed') return false;
        if (this.currentFailure === 'slots') {
            this.returnRecentSlots(3);
        } else {
            this.timeLeftMs += this.config.continueSeconds * 1000;
            this.continuedWithTime = true;
        }
        this.currentFailure = undefined;
        this.currentPhase = 'playing';
        this.usedContinue = true;
        return true;
    }

    private canApplyTool(tool: DesktopCleanupTool): boolean {
        if (tool === 'return') return this.slots.length > 0;
        if (tool === 'shuffle') return [...this.items.values()].some((item) => item.active);
        return this.findCompletableType() !== undefined;
    }

    private applyTool(tool: DesktopCleanupTool): DesktopCleanupItemType | undefined {
        if (tool === 'return') {
            this.returnRecentSlots(3);
            return undefined;
        }
        if (tool === 'shuffle') {
            this.revision += 1;
            const random = createRandom();
            const active = shuffle([...this.items.values()].filter((item) => item.active), random);
            const positions = stackedPositions(random, active.length);
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
            return undefined;
        }
        return this.completeBestGroup();
    }

    private returnRecentSlots(maximum: number): void {
        const recent = [...this.slots]
            .sort((left, right) => right.order - left.order)
            .slice(0, maximum);
        const recentIds = new Set(recent.map((slot) => slot.itemId));
        this.slots = this.slots.filter((slot) => !recentIds.has(slot.itemId));
        this.revision += 1;
        const random = createRandom();
        const topLayer = Math.max(
            LAYER_COUNT - 1,
            ...[...this.items.values()]
                .filter((item) => item.active && !recentIds.has(item.id))
                .map((item) => item.layer),
        );
        recent.forEach((slot, index) => {
            const item = this.items.get(slot.itemId);
            if (!item) return;
            item.active = true;
            item.free = true;
            item.layer = topLayer + index + 1;
            item.velocityX = 0;
            item.velocityY = 0;
            item.angularVelocity = 0;
            item.elevation = 0.08;
            item.x = (index - (recent.length - 1) / 2) * 0.085 + (random() - 0.5) * 0.025;
            item.y = 0.08 + (random() - 0.5) * 0.05;
            item.angle = Math.round(-28 + random() * 56);
        });
        this.refreshExposure();
    }

    private findCompletableType(): DesktopCleanupItemType | undefined {
        const slotCounts = new Map<DesktopCleanupItemType, number>();
        this.slots.forEach((slot) => slotCounts.set(slot.type, (slotCounts.get(slot.type) ?? 0) + 1));
        const availableCounts = new Map<DesktopCleanupItemType, number>();
        [...this.items.values()].filter((item) => item.active).forEach((item) => {
            availableCounts.set(item.type, (availableCounts.get(item.type) ?? 0) + 1);
        });
        const candidates = DESKTOP_CLEANUP_ITEM_TYPES.filter((type) => (
            (slotCounts.get(type) ?? 0) + (availableCounts.get(type) ?? 0) >= 3
        ));
        return candidates.sort((left, right) => (
            (slotCounts.get(right) ?? 0) - (slotCounts.get(left) ?? 0)
            || (availableCounts.get(right) ?? 0) - (availableCounts.get(left) ?? 0)
        ))[0];
    }

    private completeBestGroup(): DesktopCleanupItemType | undefined {
        const type = this.findCompletableType();
        if (!type) return undefined;
        const slotMatches = this.slots
            .filter((slot) => slot.type === type)
            .sort((left, right) => right.order - left.order)
            .slice(0, 3);
        const selectedIds = new Set(slotMatches.map((slot) => slot.itemId));
        this.slots = this.slots.filter((slot) => !selectedIds.has(slot.itemId));
        const needed = 3 - slotMatches.length;
        [...this.items.values()]
            .filter((item) => item.active && item.type === type)
            .sort((left, right) => Number(right.free) - Number(left.free) || right.layer - left.layer)
            .slice(0, needed)
            .forEach((item) => {
                item.active = false;
                item.free = false;
                item.velocityX = 0;
                item.velocityY = 0;
                item.angularVelocity = 0;
                item.elevation = 0;
            });
        this.currentScore += this.config.pointsPerTriple;
        this.refreshExposure();
        return type;
    }

    private stepPhysics(deltaSeconds: number): boolean {
        const active = [...this.items.values()].filter((item) => item.active);
        if (active.length === 0) return false;
        let changed = false;
        active.forEach((item) => {
            const speed = Math.hypot(item.velocityX, item.velocityY);
            const angularSpeed = Math.abs(item.angularVelocity);
            const moving = speed > PHYSICS_SETTLE_SPEED || angularSpeed > 0.5 || item.elevation > PHYSICS_EPSILON;
            if (!moving) return;
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
                if (!right || Math.abs(left.layer - right.layer) > PHYSICS_DEPTH_COLLISION_RANGE) continue;
                const dx = right.x - left.x;
                const dy = right.y - left.y;
                const distance = Math.hypot(dx, dy);
                const minimumDistance = PHYSICS_ITEM_RADIUS * 2;
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
        if (changed) this.refreshExposure();
        return changed;
    }

    private resolveBoundary(item: MutableItem): void {
        const centerLimit = visibleCenterLimit(item.angle);
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
        const active = [...this.items.values()]
            .filter((item) => item.active)
            .sort((left, right) => compareDesktopCleanupItems(left, right));
        active.forEach((item, index) => {
            item.free = !active.some((candidate, candidateIndex) => {
                if (candidateIndex <= index) return false;
                const distance = Math.hypot(candidate.x - item.x, candidate.y - item.y);
                return distance < PHYSICS_COVER_RADIUS;
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
        const active = [...this.items.values()].some((item) => item.active);
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
