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
    readonly active: boolean;
    readonly free: boolean;
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
            positions.push(Object.freeze({
                x: clamp(layerOffsetX + (random() * 2 - 1) * spreadX, -STACK_X_LIMIT, STACK_X_LIMIT),
                y: clamp(layerOffsetY + (random() * 2 - 1) * spreadY, -STACK_Y_LIMIT, STACK_Y_LIMIT),
                angle: Math.round(-38 + random() * 76),
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

    tick(deltaMs: number): void {
        if (this.currentPhase !== 'playing'
            || this.pendingSelections.size > 0
            || !Number.isFinite(deltaMs)
            || deltaMs <= 0) return;
        this.timeLeftMs = Math.max(0, this.timeLeftMs - deltaMs);
        if (this.timeLeftMs <= 0) this.fail('timeout');
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
            });
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
        recent.forEach((slot, index) => {
            const item = this.items.get(slot.itemId);
            if (!item) return;
            item.active = true;
            item.free = true;
            item.x = (index - (recent.length - 1) / 2) * 0.085 + (random() - 0.5) * 0.025;
            item.y = 0.08 + (random() - 0.5) * 0.05;
            item.angle = Math.round(-28 + random() * 56);
        });
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
            });
        this.currentScore += this.config.pointsPerTriple;
        return type;
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
