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

export interface DesktopCleanupItemSnapshot {
    readonly id: string;
    readonly type: DesktopCleanupItemType;
    /** Same-triplet items are deliberately assigned to different spawn waves. */
    readonly spawnWave: number;
    /** True only while the item belongs to the physical desktop. */
    readonly active: boolean;
}

export interface DesktopCleanupShakeInput {
    readonly x: number;
    readonly y: number;
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
    readonly pendingSelections: readonly DesktopCleanupPendingSelection[];
}

export interface DesktopCleanupActionResult {
    readonly accepted: boolean;
    readonly reason?: 'state' | 'missing' | 'empty' | 'needs-ad' | 'unavailable'
        | 'busy' | 'full' | 'stale';
    readonly triple?: DesktopCleanupItemType;
    readonly magnet?: DesktopCleanupMagnetEffect;
    readonly removedItemIds?: readonly string[];
    readonly selection?: DesktopCleanupPendingSelection;
    readonly phase: DesktopCleanupPhase;
}

interface MutableItem {
    id: string;
    type: DesktopCleanupItemType;
    spawnWave: number;
    active: boolean;
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

export const DESKTOP_CLEANUP_TRIPLET_COUNT = 54;
export const DESKTOP_CLEANUP_TOTAL_ITEM_COUNT = DESKTOP_CLEANUP_TRIPLET_COUNT * 3;

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
    const groups: DesktopCleanupItemType[] = [theme.targetType];
    for (let index = 1; index < DESKTOP_CLEANUP_TRIPLET_COUNT; index += 1) {
        groups.push(ordinaryTypes[(index - 1) % ordinaryTypes.length]!);
    }
    return Object.freeze(groups);
}

export function generateDesktopCleanupItems(
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
    spawnBatchSize = DEFAULT_DESKTOP_CLEANUP_CONFIG.spawnBatchSize,
): readonly DesktopCleanupItemSnapshot[] {
    const random = createRandom();
    const batchSize = Math.max(1, Math.floor(spawnBatchSize));
    const waveCount = Math.ceil(DESKTOP_CLEANUP_TOTAL_ITEM_COUNT / batchSize);
    const waveOffset = Math.max(1, Math.ceil(waveCount / 3));
    const waves: DesktopCleanupItemSnapshot[][] = Array.from(
        { length: waveCount },
        () => [],
    );

    tripletCatalog(theme, random).forEach((type, groupIndex) => {
        for (let member = 0; member < 3; member += 1) {
            const spawnWave = (groupIndex + member * waveOffset) % waveCount;
            waves[spawnWave]!.push({
                id: `desk-${type}-g${groupIndex}-m${member}`,
                type,
                spawnWave,
                active: true,
            });
        }
    });

    const result: DesktopCleanupItemSnapshot[] = [];
    waves.forEach((wave) => {
        shuffle(wave, random).forEach((item) => result.push(Object.freeze(item)));
    });
    return Object.freeze(result);
}

export interface DesktopCleanupLayoutVerification {
    readonly valid: boolean;
    readonly itemCount: number;
    readonly errors: readonly string[];
}

export function verifyDesktopCleanupLayout(
    items: readonly DesktopCleanupItemSnapshot[],
    theme: DesktopCleanupThemeDefinition = getDesktopCleanupTheme(),
    spawnBatchSize = DEFAULT_DESKTOP_CLEANUP_CONFIG.spawnBatchSize,
): DesktopCleanupLayoutVerification {
    const errors: string[] = [];
    if (items.length !== DESKTOP_CLEANUP_TOTAL_ITEM_COUNT) {
        errors.push(
            `expected ${DESKTOP_CLEANUP_TOTAL_ITEM_COUNT} items, received ${items.length}`,
        );
    }

    const ids = new Set<string>();
    const totals = new Map<DesktopCleanupItemType, number>();
    const waves = new Map<number, number>();
    const groups = new Map<number, DesktopCleanupItemSnapshot[]>();
    items.forEach((item) => {
        if (ids.has(item.id)) errors.push(`duplicate item id ${item.id}`);
        ids.add(item.id);
        totals.set(item.type, (totals.get(item.type) ?? 0) + 1);
        waves.set(item.spawnWave, (waves.get(item.spawnWave) ?? 0) + 1);
        if (!Number.isInteger(item.spawnWave) || item.spawnWave < 0) {
            errors.push(`invalid spawn wave ${item.spawnWave} for ${item.id}`);
        }
        const match = /-g(\d+)-m(\d+)$/.exec(item.id);
        if (!match) {
            errors.push(`item id does not encode a triplet group: ${item.id}`);
            return;
        }
        const groupIndex = Number(match[1]);
        const group = groups.get(groupIndex) ?? [];
        group.push(item);
        groups.set(groupIndex, group);
    });

    totals.forEach((count, type) => {
        if (count % 3 !== 0) errors.push(`${type} count ${count} is not divisible by 3`);
    });
    waves.forEach((count, wave) => {
        if (count > spawnBatchSize) {
            errors.push(`spawn wave ${wave} contains ${count} items; limit is ${spawnBatchSize}`);
        }
    });
    for (let index = 0; index < DESKTOP_CLEANUP_TRIPLET_COUNT; index += 1) {
        const group = groups.get(index) ?? [];
        if (group.length !== 3) {
            errors.push(`triplet group ${index} contains ${group.length} items`);
            continue;
        }
        if (new Set(group.map((item) => item.type)).size !== 1) {
            errors.push(`triplet group ${index} mixes item types`);
        }
        if (new Set(group.map((item) => item.spawnWave)).size !== 3) {
            errors.push(`triplet group ${index} must span three spawn waves`);
        }
    }
    const target = items.filter((item) => item.type === theme.targetType);
    if (target.length !== 3 || new Set(target.map((item) => item.spawnWave)).size !== 3) {
        errors.push(`${theme.targetType} must be one triplet split across three spawn waves`);
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
        const generated = generateDesktopCleanupItems(theme);
        const result = verifyDesktopCleanupLayout(generated, theme);
        if (!result.valid) {
            result.errors.forEach((error) => errors.push(`sample ${index}: ${error}`));
        }
    }
    return Object.freeze({
        valid: errors.length === 0,
        itemCount: samples * DESKTOP_CLEANUP_TOTAL_ITEM_COUNT,
        errors: Object.freeze(errors),
    });
}

export function desktopCleanupDateKey(date = new Date()): string {
    const year = date.getFullYear();
    const monthValue = date.getMonth() + 1;
    const dayValue = date.getDate();
    const month = monthValue < 10 ? `0${monthValue}` : String(monthValue);
    const day = dayValue < 10 ? `0${dayValue}` : String(dayValue);
    return `${year}-${month}-${day}`;
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
        const generated = generateDesktopCleanupItems(theme, config.spawnBatchSize);
        const verification = verifyDesktopCleanupLayout(
            generated,
            theme,
            config.spawnBatchSize,
        );
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

    isItemActive(itemId: string): boolean {
        return this.items.get(itemId)?.active === true;
    }

    get snapshot(): DesktopCleanupSnapshot {
        const items = Array.from(this.items.values())
            .sort((left, right) => left.spawnWave - right.spawnWave || left.id.localeCompare(right.id))
            .map((item) => Object.freeze({ ...item }));
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
        this.timeLeftMs = Math.max(0, this.timeLeftMs - deltaMs);
        if (this.timeLeftMs <= 0) this.fail('timeout');
        return true;
    }

    selectItem(itemId: string): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        if (this.slots.length >= this.config.slotCapacity) return this.reject('full');
        const item = this.items.get(itemId);
        if (!item || !item.active) return this.reject('missing');

        item.active = false;
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
        return Object.freeze({ accepted: true, selection, phase: this.currentPhase });
    }

    finalizeSelectionBatch(): DesktopCleanupActionResult {
        if (this.currentPhase !== 'playing') return this.reject('state');
        this.finishOrFail();
        return Object.freeze({ accepted: true, phase: this.currentPhase });
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
            || !this.canApplyTool(tool)) return false;
        this.pendingBoostTool = tool;
        return true;
    }

    resolveBoostAd(completed: boolean): DesktopCleanupActionResult {
        const tool = this.pendingBoostTool;
        this.pendingBoostTool = undefined;
        if (this.pendingSelections.size > 0) return this.reject('busy');
        if (!completed || !tool || this.currentPhase !== 'playing') {
            return this.reject('unavailable');
        }
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
        if (this.currentPhase !== 'failed'
            || this.continueAttempted
            || this.continueAdPending) return false;
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
        if (tool === 'shuffle') {
            return Array.from(this.items.values()).some((item) => item.active);
        }
        return this.findCompletableType() !== undefined;
    }

    private applyTool(tool: DesktopCleanupTool): DesktopCleanupToolEffect {
        if (tool === 'return') {
            return Object.freeze({ removedItemIds: this.removeRecentSlots(3) });
        }
        if (tool === 'shuffle') {
            this.revision += 1;
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
        return Object.freeze(recent.map((slot) => slot.itemId));
    }

    private findCompletableType(): DesktopCleanupItemType | undefined {
        const slotCounts = new Map<DesktopCleanupItemType, number>();
        this.slots.forEach((slot) => {
            slotCounts.set(slot.type, (slotCounts.get(slot.type) ?? 0) + 1);
        });
        const availableCounts = new Map<DesktopCleanupItemType, number>();
        Array.from(this.items.values()).filter((item) => item.active).forEach((item) => {
            availableCounts.set(item.type, (availableCounts.get(item.type) ?? 0) + 1);
        });
        return this.theme.itemTypes
            .filter((type) => (
                (slotCounts.get(type) ?? 0) + (availableCounts.get(type) ?? 0) >= 3
            ))
            .sort((left, right) => (
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
            .sort((left, right) => left.spawnWave - right.spawnWave || left.id.localeCompare(right.id))
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
        });
        this.currentScore += this.config.pointsPerTriple;
        return Object.freeze({
            type,
            itemIds,
            slotItemIds,
            boardItemIds,
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
            matches[0]!.itemId,
            matches[1]!.itemId,
            matches[2]!.itemId,
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
            this.currentScore += Math.floor(this.timeLeftMs / 1000)
                * this.config.remainingSecondBonus;
            this.currentScore += unused * this.config.unusedToolBonus;
            if (!this.usedContinue) this.currentScore += this.config.noContinueBonus;
            this.currentPhase = 'won';
            this.currentFailure = undefined;
            return;
        }
        if (this.slots.length >= this.config.slotCapacity
            && this.pendingSelections.size === 0) {
            this.fail('slots');
        }
    }

    private fail(reason: DesktopCleanupFailureReason): void {
        this.currentPhase = 'failed';
        this.currentFailure = reason;
    }

    private reject(reason: DesktopCleanupActionResult['reason']): DesktopCleanupActionResult {
        return Object.freeze({
            accepted: false,
            reason,
            phase: this.currentPhase,
        });
    }
}
