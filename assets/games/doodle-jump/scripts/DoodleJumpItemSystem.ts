import type {
    DoodleJumpGameplayConfig,
    DoodleJumpItemType,
    DoodleJumpPlatformType,
} from './DoodleJumpConfig';
import type { DoodleJumpRandomStreams } from './DoodleJumpRandom';

export type DoodleJumpFlightPower = 'jetpack' | 'propeller-hat' | 'rocket';
export type DoodleJumpLandingPower = 'spring' | 'trampoline';

export interface DoodleJumpItemPlatform {
    readonly id: string;
    readonly type: DoodleJumpPlatformType;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly collisionEnabled: boolean;
    readonly consumed: boolean;
}

export interface DoodleJumpItemOccupiedBody {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly anchorPlatformId?: string;
}

export interface DoodleJumpItemSnapshot {
    readonly id: string;
    readonly type: DoodleJumpItemType;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly anchorPlatformId: string;
    readonly phase: number;
}

export interface DoodleJumpItemStatusSnapshot {
    readonly landingPower?: DoodleJumpLandingPower;
    readonly flightPower?: DoodleJumpFlightPower;
    readonly flightRemainingSeconds: number;
    readonly shieldRemainingSeconds: number;
    readonly trampolineJumpActive: boolean;
    readonly trampolineJumpProgress: number;
    readonly headStartRemainingSeconds: number;
    readonly itemPickupCount: number;
    readonly usedHeadStart: boolean;
}

export interface DoodleJumpItemPhysics {
    readonly gravity: number;
    readonly fixedVerticalVelocity?: number;
    readonly minimumVerticalVelocity?: number;
    readonly platformCollisionEnabled: boolean;
}

export interface DoodleJumpItemEvent {
    readonly type: 'pickup' | 'power-start' | 'power-end' | 'landing-boost';
    readonly itemType?: DoodleJumpItemType | 'head-start';
    readonly x: number;
    readonly y: number;
}

interface MutableItem {
    readonly id: string;
    readonly type: DoodleJumpItemType;
    readonly radius: number;
    readonly anchorPlatformId: string;
    readonly phase: number;
    x: number;
    y: number;
}

const FLIGHT_TYPES: readonly DoodleJumpFlightPower[] = Object.freeze([
    'jetpack',
    'propeller-hat',
    'rocket',
]);

function isFlightPower(type: DoodleJumpItemType): type is DoodleJumpFlightPower {
    return FLIGHT_TYPES.indexOf(type as DoodleJumpFlightPower) >= 0;
}

export class DoodleJumpItemSystem {
    private readonly items: MutableItem[] = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpItemEvent[] = [];
    private nextItemId = 1;
    private landingPower?: DoodleJumpLandingPower;
    private flightPower?: DoodleJumpFlightPower;
    private flightRemainingSeconds = 0;
    private shieldRemainingSeconds = 0;
    private trampolineJumpActive = false;
    private trampolineJumpElapsedSeconds = 0;
    private trampolineJumpDurationSeconds = 0;
    private headStartRemainingSeconds = 0;
    private itemPickupCount = 0;
    private usedHeadStart = false;

    constructor(
        private readonly config: DoodleJumpGameplayConfig,
        private readonly randomStreams: DoodleJumpRandomStreams,
    ) {}

    reset(): void {
        this.items.length = 0;
        this.evaluatedPlatformIds.clear();
        this.events.length = 0;
        this.nextItemId = 1;
        this.landingPower = undefined;
        this.flightPower = undefined;
        this.flightRemainingSeconds = 0;
        this.shieldRemainingSeconds = 0;
        this.trampolineJumpActive = false;
        this.trampolineJumpElapsedSeconds = 0;
        this.trampolineJumpDurationSeconds = 0;
        this.headStartRemainingSeconds = 0;
        this.itemPickupCount = 0;
        this.usedHeadStart = false;
        const preset = this.config.items.debugPowerPreset;
        if (preset === 'spring' || preset === 'trampoline') {
            this.landingPower = preset;
        } else if (preset === 'shield') {
            this.shieldRemainingSeconds = this.config.items.shield.durationSeconds;
        } else if (preset === 'head-start') {
            this.activateHeadStart();
        } else if (preset !== 'none') {
            this.activateFlight(preset);
        }
    }

    restore(
        snapshots: readonly DoodleJumpItemSnapshot[],
        status: DoodleJumpItemStatusSnapshot,
        platformIds: readonly string[],
    ): void {
        this.reset();
        this.items.length = 0;
        this.events.length = 0;
        this.evaluatedPlatformIds.clear();
        platformIds.forEach((id) => this.evaluatedPlatformIds.add(id));
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            if (platformIds.indexOf(snapshot.anchorPlatformId) < 0) return;
            const parsedId = Number(snapshot.id.replace(/^I/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            this.items.push({ ...snapshot });
        });
        this.nextItemId = maximumId + 1;
        this.landingPower = status.landingPower;
        this.flightPower = status.flightPower;
        const restoredFlightDuration = status.flightPower
            ? this.getPoweredDurationSeconds(status.flightPower)
            : 0;
        this.flightRemainingSeconds = Math.min(
            restoredFlightDuration,
            Math.max(0, status.flightRemainingSeconds),
        );
        this.shieldRemainingSeconds = Math.max(0, status.shieldRemainingSeconds);
        this.trampolineJumpActive = status.trampolineJumpActive;
        this.trampolineJumpDurationSeconds = status.trampolineJumpActive
            ? this.config.items.trampoline.bounceVelocity
                / Math.max(1, Math.abs(this.config.player.gravity))
            : 0;
        this.trampolineJumpElapsedSeconds = this.trampolineJumpDurationSeconds
            * Math.max(0, Math.min(1, status.trampolineJumpProgress));
        this.headStartRemainingSeconds = Math.max(0, status.headStartRemainingSeconds);
        this.itemPickupCount = Math.max(0, Math.floor(status.itemPickupCount));
        this.usedHeadStart = status.usedHeadStart;
    }

    updateTimers(
        deltaSeconds: number,
        playerX: number,
        playerY: number,
        playerVelocityY: number,
    ): void {
        const delta = Math.max(0, deltaSeconds);
        if (this.flightPower) {
            this.flightRemainingSeconds = Math.max(0, this.flightRemainingSeconds - delta);
            // Keep the original powered phase and trajectory unchanged. Once
            // powered lift ends, retain the equipment while normal gravity
            // performs the already-existing coast, then detach at the apex.
            if (this.flightRemainingSeconds <= 0 && playerVelocityY <= 0) {
                const ended = this.flightPower;
                this.flightPower = undefined;
                this.events.push(Object.freeze({
                    type: 'power-end',
                    itemType: ended,
                    x: playerX,
                    y: playerY,
                }));
            }
        }
        this.shieldRemainingSeconds = Math.max(0, this.shieldRemainingSeconds - delta);
        if (this.trampolineJumpActive) this.trampolineJumpElapsedSeconds += delta;
        this.headStartRemainingSeconds = Math.max(0, this.headStartRemainingSeconds - delta);
    }

    syncWorld(
        platforms: readonly DoodleJumpItemPlatform[],
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpItemOccupiedBody[],
    ): void {
        const platformById = new Map<string, DoodleJumpItemPlatform>();
        platforms.forEach((platform) => platformById.set(platform.id, platform));
        this.recycleItems(cameraBottomY);
        this.purgeEvaluatedPlatforms(platformById);
        this.evaluateNewPlatforms(platforms, cameraBottomY, cameraTopY, occupiedBodies);
    }

    resolvePickups(
        playerX: number,
        playerY: number,
        playerWidth: number,
        playerHeight: number,
    ): void {
        const halfWidth = playerWidth / 2;
        const halfHeight = playerHeight / 2;
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            const closestX = Math.max(playerX - halfWidth, Math.min(item.x, playerX + halfWidth));
            const closestY = Math.max(playerY - halfHeight, Math.min(item.y, playerY + halfHeight));
            const deltaX = item.x - closestX;
            const deltaY = item.y - closestY;
            if (deltaX * deltaX + deltaY * deltaY > item.radius * item.radius) continue;
            if (this.hasFlightInvincibility() && isFlightPower(item.type)) continue;
            this.items.splice(index, 1);
            this.itemPickupCount += 1;
            this.applyPickup(item.type, item.x, item.y);
        }
    }

    getPhysics(): DoodleJumpItemPhysics {
        if (this.headStartRemainingSeconds > 0) {
            return Object.freeze({
                gravity: 0,
                fixedVerticalVelocity: this.config.items.headStart.verticalVelocity,
                platformCollisionEnabled: false,
            });
        }
        if (this.flightPower === 'jetpack' && this.flightRemainingSeconds > 0) {
            return Object.freeze({
                gravity: 0,
                fixedVerticalVelocity: this.config.items.jetpack.verticalVelocity,
                platformCollisionEnabled: false,
            });
        }
        if (this.flightPower === 'rocket' && this.flightRemainingSeconds > 0) {
            return Object.freeze({
                gravity: 0,
                fixedVerticalVelocity: this.config.items.rocket.verticalVelocity,
                platformCollisionEnabled: false,
            });
        }
        if (this.flightPower === 'propeller-hat' && this.flightRemainingSeconds > 0) {
            return Object.freeze({
                gravity: -this.config.items.propellerHat.gravity,
                minimumVerticalVelocity: this.config.items.propellerHat.minimumVerticalVelocity,
                platformCollisionEnabled: true,
            });
        }
        return Object.freeze({
            gravity: this.config.player.gravity,
            platformCollisionEnabled: true,
        });
    }

    consumeLandingPower(x: number, y: number): number | undefined {
        const power = this.landingPower;
        this.trampolineJumpActive = false;
        this.trampolineJumpElapsedSeconds = 0;
        this.trampolineJumpDurationSeconds = 0;
        if (!power) return undefined;
        this.landingPower = undefined;
        this.events.push(Object.freeze({
            type: 'landing-boost',
            itemType: power,
            x,
            y,
        }));
        if (power === 'trampoline') {
            const bounceVelocity = this.config.items.trampoline.bounceVelocity;
            const gravityMagnitude = Math.max(1, Math.abs(this.config.player.gravity));
            this.trampolineJumpActive = true;
            // Complete both visual turns exactly at the ballistic apex. The
            // fixed-step velocity crosses from positive to non-positive in the
            // same step that this elapsed duration reaches one.
            this.trampolineJumpDurationSeconds = bounceVelocity / gravityMagnitude;
            return bounceVelocity;
        }
        return this.config.items.spring.bounceVelocity;
    }

    activateHeadStart(): void {
        if (this.usedHeadStart) return;
        this.cancelTrampolineJump();
        this.flightPower = undefined;
        this.flightRemainingSeconds = 0;
        this.headStartRemainingSeconds = this.config.items.headStart.durationSeconds;
        this.usedHeadStart = true;
        this.events.push(Object.freeze({
            type: 'power-start',
            itemType: 'head-start',
            x: 0,
            y: 0,
        }));
    }

    grantShield(seconds: number): void {
        this.shieldRemainingSeconds = Math.max(this.shieldRemainingSeconds, Math.max(0, seconds));
    }

    hasShield(): boolean {
        return this.shieldRemainingSeconds > 0;
    }

    hasFlightInvincibility(): boolean {
        return this.flightPower !== undefined;
    }

    hasTrampolineInvincibility(): boolean {
        return this.trampolineJumpActive;
    }

    cancelTrampolineJump(): void {
        this.trampolineJumpActive = false;
        this.trampolineJumpElapsedSeconds = 0;
        this.trampolineJumpDurationSeconds = 0;
    }

    drainEvents(): readonly DoodleJumpItemEvent[] {
        if (this.events.length === 0) return Object.freeze([]);
        return Object.freeze(this.events.splice(0, this.events.length));
    }

    getSnapshots(): readonly DoodleJumpItemSnapshot[] {
        return Object.freeze(this.items.map((item) => Object.freeze({
            id: item.id,
            type: item.type,
            x: item.x,
            y: item.y,
            radius: item.radius,
            anchorPlatformId: item.anchorPlatformId,
            phase: item.phase,
        })));
    }

    getStatus(): DoodleJumpItemStatusSnapshot {
        return Object.freeze({
            landingPower: this.landingPower,
            flightPower: this.flightPower,
            flightRemainingSeconds: this.flightRemainingSeconds,
            shieldRemainingSeconds: this.shieldRemainingSeconds,
            trampolineJumpActive: this.trampolineJumpActive,
            trampolineJumpProgress: this.trampolineJumpActive
                ? Math.min(
                    1,
                    this.trampolineJumpElapsedSeconds
                        / Math.max(0.001, this.trampolineJumpDurationSeconds),
                )
                : 0,
            headStartRemainingSeconds: this.headStartRemainingSeconds,
            itemPickupCount: this.itemPickupCount,
            usedHeadStart: this.usedHeadStart,
        });
    }

    getOccupiedBodies(): readonly DoodleJumpItemOccupiedBody[] {
        return Object.freeze(this.items.map((item) => Object.freeze({
            x: item.x,
            y: item.y,
            width: item.radius * 2,
            height: item.radius * 2,
            anchorPlatformId: item.anchorPlatformId,
        })));
    }

    clearNear(x: number, y: number, radius: number): void {
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            if (Math.abs(item.x - x) <= radius && Math.abs(item.y - y) <= radius) {
                this.items.splice(index, 1);
            }
        }
        this.events.length = 0;
    }

    isAreaClear(x: number, y: number, radius: number): boolean {
        return !this.items.some((item) => (
            Math.abs(item.x - x) <= radius && Math.abs(item.y - y) <= radius
        ));
    }

    private applyPickup(type: DoodleJumpItemType, x: number, y: number): void {
        this.events.push(Object.freeze({ type: 'pickup', itemType: type, x, y }));
        if (type === 'spring') {
            if (this.landingPower !== 'trampoline') this.landingPower = 'spring';
            return;
        }
        if (type === 'trampoline') {
            this.landingPower = 'trampoline';
            return;
        }
        if (type === 'shield') {
            this.shieldRemainingSeconds = this.config.items.shield.durationSeconds;
            return;
        }
        this.activateFlight(type);
    }

    private activateFlight(type: DoodleJumpFlightPower): void {
        this.cancelTrampolineJump();
        this.headStartRemainingSeconds = 0;
        this.flightPower = type;
        this.flightRemainingSeconds = this.getPoweredDurationSeconds(type);
        this.events.push(Object.freeze({ type: 'power-start', itemType: type, x: 0, y: 0 }));
    }

    private getPoweredDurationSeconds(type: DoodleJumpFlightPower): number {
        return type === 'jetpack'
            ? this.config.items.jetpack.durationSeconds
            : type === 'rocket'
                ? this.config.items.rocket.durationSeconds
                : this.config.items.propellerHat.durationSeconds;
    }

    private recycleItems(cameraBottomY: number): void {
        const recycleY = cameraBottomY - this.config.items.recycleBelow;
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            if (this.items[index].y + this.items[index].radius < recycleY) {
                this.items.splice(index, 1);
            }
        }
    }

    private purgeEvaluatedPlatforms(
        platformById: ReadonlyMap<string, DoodleJumpItemPlatform>,
    ): void {
        Array.from(this.evaluatedPlatformIds).forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
    }

    private evaluateNewPlatforms(
        platforms: readonly DoodleJumpItemPlatform[],
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpItemOccupiedBody[],
    ): void {
        if (!this.config.items.enabled || this.items.length >= this.config.items.maximumActive) return;
        const ordered = platforms.slice().sort((left, right) => (
            left.y !== right.y ? left.y - right.y : left.id.localeCompare(right.id)
        ));
        for (let index = 0; index < ordered.length; index += 1) {
            if (this.items.length >= this.config.items.maximumActive) return;
            const platform = ordered[index];
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            if (platform.y < cameraBottomY
                || platform.y <= cameraTopY + this.config.items.spawnAboveScreenMargin) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            this.evaluatedPlatformIds.add(platform.id);
            if (!platform.collisionEnabled
                || platform.consumed
                || platform.type === 'breakable'
                || platform.type === 'disappearing'
                || platform.type === 'exploding') continue;
            if (occupiedBodies.some((body) => body.anchorPlatformId === platform.id)) continue;
            if (this.randomStreams.next('item') >= this.config.items.spawnChancePerPlatform) continue;
            const heightMeters = Math.max(0, (platform.y - this.startWorldY()) / 100);
            const type = this.pickItemType(heightMeters);
            if (!type) continue;
            const item = this.createItem(type, platform, occupiedBodies);
            if (!item) continue;
            if (this.items.some((candidate) => (
                Math.abs(candidate.y - item.y) < this.config.items.minimumVerticalSeparation
            ))) continue;
            this.items.push(item);
        }
    }

    private pickItemType(heightMeters: number): DoodleJumpItemType | undefined {
        const override = this.config.items.typeOverride;
        if (override !== 'auto') return this.isUnlocked(override, heightMeters) ? override : undefined;
        const band = this.config.items.weightBands.find((candidate) => (
            heightMeters >= candidate.startMeters && heightMeters < candidate.endMeters
        ));
        if (!band) return undefined;
        const candidates: Array<readonly [DoodleJumpItemType, number]> = [
            ['spring', band.spring],
            ['trampoline', band.trampoline],
            ['jetpack', band.jetpack],
            ['propeller-hat', band.propellerHat],
            ['rocket', band.rocket],
            ['shield', band.shield],
        ];
        const weights = candidates.filter((entry) => (
            entry[1] > 0 && this.isUnlocked(entry[0], heightMeters)
        ));
        const total = weights.reduce((sum, entry) => sum + entry[1], 0);
        if (total <= 0) return undefined;
        let roll = this.randomStreams.next('item') * total;
        for (let index = 0; index < weights.length; index += 1) {
            roll -= weights[index][1];
            if (roll < 0) return weights[index][0];
        }
        return weights[weights.length - 1][0];
    }

    private createItem(
        type: DoodleJumpItemType,
        platform: DoodleJumpItemPlatform,
        occupiedBodies: readonly DoodleJumpItemOccupiedBody[],
    ): MutableItem | undefined {
        const radius = this.config.items.pickupRadius;
        const safeHalfWidth = Math.max(0, platform.width / 2 - radius - 8);
        const offsetX = (this.randomStreams.next('item') * 2 - 1) * safeHalfWidth;
        const offsetY = this.config.items.minimumAbovePlatform
            + this.randomStreams.next('item')
            * (this.config.items.maximumAbovePlatform - this.config.items.minimumAbovePlatform);
        const x = platform.x + offsetX;
        const y = platform.y + offsetY;
        if (occupiedBodies.some((body) => (
            Math.abs(body.x - x) <= body.width / 2 + radius + 12
            && Math.abs(body.y - y) <= body.height / 2 + radius + 12
        ))) return undefined;
        const id = `I${this.nextItemId}`;
        this.nextItemId += 1;
        return {
            id,
            type,
            x,
            y,
            radius,
            anchorPlatformId: platform.id,
            phase: this.randomStreams.next('item'),
        };
    }

    private isUnlocked(type: DoodleJumpItemType, heightMeters: number): boolean {
        const unlock = type === 'spring' ? this.config.items.spring.unlockHeightMeters
            : type === 'trampoline' ? this.config.items.trampoline.unlockHeightMeters
                : type === 'jetpack' ? this.config.items.jetpack.unlockHeightMeters
                    : type === 'propeller-hat' ? this.config.items.propellerHat.unlockHeightMeters
                        : type === 'rocket' ? this.config.items.rocket.unlockHeightMeters
                            : this.config.items.shield.unlockHeightMeters;
        return heightMeters >= unlock;
    }

    private startWorldY(): number {
        return this.config.fixedPlatforms[0].y + this.config.player.collisionHeight / 2;
    }
}
