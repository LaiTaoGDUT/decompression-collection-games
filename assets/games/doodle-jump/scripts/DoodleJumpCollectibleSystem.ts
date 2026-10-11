import type { DoodleJumpGameplayConfig } from './DoodleJumpConfig';
import type { DoodleJumpWorldIndex, DoodleJumpWorldPlatform } from './DoodleJumpWorld';

export interface DoodleJumpCollectibleSnapshot {
    readonly id: string;
    readonly anchorPlatformId: string;
    readonly x: number;
    readonly y: number;
    readonly offsetX: number;
    /** Chosen once at spawn, then kept relative to the carrier throughout its lifetime. */
    readonly layoutOffsetX?: number;
    readonly variant: number;
}

export interface DoodleJumpCollectibleState {
    readonly collectedCount: number;
    readonly evaluatedPlatformIds: readonly string[];
}

export type DoodleJumpCollectibleEvent = Readonly<{ id: string; x: number; y: number }>;
const EMPTY_EVENTS: readonly DoodleJumpCollectibleEvent[] = Object.freeze([]);

/** Bunny theme's CollectibleObject, rendered as a golden carrot in the paper game. */
export class DoodleJumpCollectibleSystem {
    private readonly carrots: Array<{
        id: string; anchorPlatformId: string; x: number; y: number; offsetX: number; layoutOffsetX: number; variant: number;
    }> = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpCollectibleEvent[] = [];
    private readonly presentation: DoodleJumpCollectibleSnapshot[] = [];
    private collectedCount = 0;

    constructor(private readonly config: DoodleJumpGameplayConfig) {}

    reset(): void {
        this.carrots.length = 0;
        this.events.length = 0;
        this.evaluatedPlatformIds.clear();
        this.collectedCount = 0;
    }

    reconcileWorld(world: DoodleJumpWorldIndex, cameraBottomY: number): void {
        // A collected carrot keeps its platform ticket until that platform is recycled.
        // This prevents respawning it after pickup, pause, or a save/restore.
        this.evaluatedPlatformIds.forEach(id => {
            if (!world.platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
        for (let index = this.carrots.length - 1; index >= 0; index -= 1) {
            const carrot = this.carrots[index];
            const anchor = world.platformById.get(carrot.anchorPlatformId);
            if (!anchor || anchor.consumed || anchor.y < cameraBottomY - this.config.camera.recycleBelow) {
                this.carrots.splice(index, 1);
                continue;
            }
            // Neighbor motion must never relocate an existing pickup. Clamping again
            // at screen edges also accumulates offset drift on reflected carriers.
            carrot.x = anchor.x + carrot.layoutOffsetX;
            // The paper carrot floats above the platform; collision follows the same center.
            carrot.y = anchor.y + this.config.collectibles.hoverOffsetY;
        }
        if (!this.config.collectibles.enabled) return;
        for (const platform of world.platforms) {
            const offsetX = platform.spawnPlan?.collectibleOffsetX;
            if (offsetX === undefined || this.evaluatedPlatformIds.has(platform.id)) continue;
            this.evaluatedPlatformIds.add(platform.id);
            if (platform.consumed || !platform.collisionEnabled
                || (platform.type !== 'normal' && platform.type !== 'moving')) continue;
            const x = this.floatingPositionX(platform, offsetX, world);
            if (x === undefined) continue;
            this.carrots.push({
                id: `carrot:${platform.id}`, anchorPlatformId: platform.id,
                x, y: platform.y + this.config.collectibles.hoverOffsetY, offsetX,
                layoutOffsetX: x - platform.x,
                variant: platform.spawnPlan?.collectibleVariant ?? 0,
            });
        }
    }

    resolvePickups(fromX: number, fromY: number, toX: number, toY: number): void {
        const scale = this.config.design.width / 320;
        // Native Bunny CollectibleObject's rectangle is 23 x 30. Carrots use the same pickup reach.
        const halfWidth = (this.config.player.collisionWidth + 23 * scale) / 2;
        const halfHeight = (this.config.player.collisionHeight + 30 * scale) / 2;
        const wrap = this.config.player.wrapDistance;
        const wrapped = Math.abs(toX - fromX) > wrap / 2;
        const unwrappedToX = wrapped ? toX + (toX < fromX ? wrap : -wrap) : toX;
        for (let index = this.carrots.length - 1; index >= 0; index -= 1) {
            const carrot = this.carrots[index];
            let hit = this.segmentTouchesRectangle(
                fromX, fromY, unwrappedToX, toY,
                carrot.x - halfWidth, carrot.x + halfWidth,
                carrot.y - halfHeight, carrot.y + halfHeight,
            );
            if (!hit && wrapped) {
                hit = this.segmentTouchesRectangle(fromX, fromY, unwrappedToX, toY,
                    carrot.x - wrap - halfWidth, carrot.x - wrap + halfWidth,
                    carrot.y - halfHeight, carrot.y + halfHeight)
                    || this.segmentTouchesRectangle(fromX, fromY, unwrappedToX, toY,
                        carrot.x + wrap - halfWidth, carrot.x + wrap + halfWidth,
                        carrot.y - halfHeight, carrot.y + halfHeight);
            }
            if (!hit) continue;
            this.collectedCount += 1;
            this.events.push(Object.freeze({ id: carrot.id, x: carrot.x, y: carrot.y }));
            this.carrots.splice(index, 1);
        }
    }

    getCount(): number { return this.collectedCount; }
    getPresentationCollectibles(): readonly DoodleJumpCollectibleSnapshot[] {
        for (let index = 0; index < this.carrots.length; index += 1) {
            const presented = this.presentation[index] ?? { ...this.carrots[index] };
            Object.assign(presented, this.carrots[index]);
            this.presentation[index] = presented;
        }
        this.presentation.length = this.carrots.length;
        return this.presentation;
    }
    getSnapshots(): readonly DoodleJumpCollectibleSnapshot[] {
        return Object.freeze(this.carrots.map(carrot => Object.freeze({ ...carrot })));
    }
    getState(): DoodleJumpCollectibleState {
        return Object.freeze({ collectedCount: this.collectedCount,
            evaluatedPlatformIds: Object.freeze(Array.from(this.evaluatedPlatformIds)) });
    }
    drainEvents(): readonly DoodleJumpCollectibleEvent[] {
        if (this.events.length === 0) return EMPTY_EVENTS;
        return this.events.splice(0);
    }

    restore(snapshots: readonly DoodleJumpCollectibleSnapshot[], state: DoodleJumpCollectibleState,
        world: DoodleJumpWorldIndex): void {
        if (!Array.isArray(snapshots) || snapshots.length > this.config.generation.maxActivePlatforms
            || !state || !Number.isSafeInteger(state.collectedCount) || state.collectedCount < 0
            || !Array.isArray(state.evaluatedPlatformIds)
            || state.evaluatedPlatformIds.length > this.config.generation.maxActivePlatforms) {
            throw new Error('Invalid restored golden carrot state.');
        }
        this.reset();
        this.collectedCount = state.collectedCount;
        for (const id of state.evaluatedPlatformIds) {
            if (typeof id !== 'string' || !world.platformById.has(id) || this.evaluatedPlatformIds.has(id)) {
                throw new Error('Invalid restored collectible platform ticket.');
            }
            this.evaluatedPlatformIds.add(id);
        }
        const ids = new Set<string>();
        for (const carrot of snapshots) {
            const anchor = world.platformById.get(carrot.anchorPlatformId);
            if (!anchor || !this.evaluatedPlatformIds.has(anchor.id) || ids.has(carrot.id)
                || carrot.id !== `carrot:${anchor.id}` || anchor.spawnPlan?.collectibleOffsetX !== carrot.offsetX
                || !Number.isFinite(carrot.x) || !Number.isFinite(carrot.y) || !Number.isFinite(carrot.offsetX)
                || (carrot.layoutOffsetX !== undefined && !Number.isFinite(carrot.layoutOffsetX))
                || !Number.isInteger(carrot.variant) || carrot.variant < 0 || carrot.variant > 7) {
                throw new Error('Invalid restored golden carrot.');
            }
            ids.add(carrot.id);
            // Saved layout is authoritative even if a neighbor has since moved.
            // Only older saves without a chosen layout need the one-time placement.
            const x = carrot.layoutOffsetX === undefined
                ? this.floatingPositionX(anchor, carrot.offsetX, world)
                : anchor.x + carrot.layoutOffsetX;
            if (x !== undefined) this.carrots.push({ ...carrot, x, layoutOffsetX: x - anchor.x,
                y: anchor.y + this.config.collectibles.hoverOffsetY });
        }
    }

    private floatingPositionX(anchor: DoodleJumpWorldPlatform, preferredOffsetX: number,
        world: DoodleJumpWorldIndex): number | undefined {
        const scale = this.config.design.width / 320;
        const halfWidth = 23 * scale / 2;
        const clearance = 8;
        const centerY = anchor.y + this.config.collectibles.hoverOffsetY;
        const halfHeight = 15 * scale + 3;
        // At the platform edge the player can still touch a carrot's native box.
        // Keep this presentation adaptation independent of route/item/monster RNG.
        const reach = anchor.width / 2 + halfWidth + clearance;
        const left = Math.max(halfWidth + clearance, anchor.x - reach);
        const right = Math.min(this.config.design.width - halfWidth - clearance, anchor.x + reach);
        const preferredX = Math.max(left, Math.min(right, anchor.x + preferredOffsetX));
        const blocked: Array<Readonly<{ left: number; right: number }>> = [];
        for (const platform of world.platforms) {
            // Rendering places the platform's TOP at its gameplay anchor.
            if (platform.id === anchor.id || platform.consumed || !platform.collisionEnabled || platform.spawnPlan?.entityOnly
                || platform.y + clearance <= centerY - halfHeight
                || platform.y - this.config.platformBehavior.visualHeight - clearance >= centerY + halfHeight) continue;
            blocked.push({ left: platform.x - platform.width / 2 - halfWidth - clearance,
                right: platform.x + platform.width / 2 + halfWidth + clearance });
        }
        const isFree = (x: number): boolean => left <= right && x >= left && x <= right
            && blocked.every(span => x <= span.left || x >= span.right);
        if (isFree(preferredX)) return preferredX;
        let best: number | undefined;
        let distance = Infinity;
        for (const span of blocked) {
            for (const candidate of [span.left, span.right]) {
                if (!isFree(candidate)) continue;
                const nextDistance = Math.abs(candidate - preferredX);
                if (nextDistance < distance) { best = candidate; distance = nextDistance; }
            }
        }
        return best;
    }

    private segmentTouchesRectangle(fromX: number, fromY: number, toX: number, toY: number,
        left: number, right: number, bottom: number, top: number): boolean {
        // Slab intersection, with no per-carrot callback/temporary rectangle allocation.
        let entry = 0, exit = 1;
        const dx = toX - fromX, dy = toY - fromY;
        if (Math.abs(dx) < 0.000001) {
            if (fromX < left || fromX > right) return false;
        } else {
            const a = (left - fromX) / dx, b = (right - fromX) / dx;
            entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
            if (entry > exit) return false;
        }
        if (Math.abs(dy) < 0.000001) return fromY >= bottom && fromY <= top;
        const a = (bottom - fromY) / dy, b = (top - fromY) / dy;
        return Math.max(entry, Math.min(a, b)) <= Math.min(exit, Math.max(a, b));
    }
}
