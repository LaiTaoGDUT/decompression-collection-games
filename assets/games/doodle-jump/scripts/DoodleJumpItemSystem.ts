import type {
    DoodleJumpGameplayConfig,
    DoodleJumpItemType,
} from './DoodleJumpConfig';
import { referenceFlightAcceleration, stepDoodleJumpVertical } from './DoodleJumpReferenceRules';
import type { DoodleJumpRandomStreams } from './DoodleJumpRandom';
import type {
    DoodleJumpWorldIndex,
    DoodleJumpWorldOccupiedBody,
    DoodleJumpWorldPlatform,
} from './DoodleJumpWorld';

export type DoodleJumpFlightPower = 'jetpack' | 'propeller-hat';
export type DoodleJumpLandingPower = 'spring' | 'trampoline';

export type DoodleJumpItemPlatform = DoodleJumpWorldPlatform;
export type DoodleJumpItemOccupiedBody = DoodleJumpWorldOccupiedBody;

export interface DoodleJumpItemSnapshot {
    readonly id: string;
    readonly type: DoodleJumpItemType;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly anchorPlatformId: string;
    readonly phase: number;
    readonly activationCount?: number;
    readonly compressionFrames?: number;
}

export interface DoodleJumpItemStatusSnapshot {
    /** Completed tickets; capacity-deferred tickets must survive a save. */
    readonly evaluatedPlatformIds?: readonly string[];
    readonly landingPower?: DoodleJumpLandingPower;
    readonly flightPower?: DoodleJumpFlightPower;
    readonly flightRemainingSeconds: number;
    readonly shieldRemainingSeconds: number;
    readonly trampolineJumpActive: boolean;
    readonly trampolineJumpProgress: number;
    readonly headStartRemainingSeconds: number;
    readonly itemPickupCount: number;
    readonly jetpackPickupCount: number;
    readonly usedHeadStart: boolean;
    readonly springShoesRemainingSeconds: number;
    readonly shoeBounceFrame: number;
    readonly trampolineCompressionFrames: number;
    readonly flightVelocity: number;
    readonly inheritedFlightVelocity: boolean;
    readonly flightJustStarted: boolean;
    readonly pendingLaunchVelocity?: number;
    readonly trampolineCompressionOffset?: number;
}

export interface DoodleJumpItemPhysics {
    readonly gravity: number;
    readonly fixedVerticalVelocity?: number;
    readonly minimumVerticalVelocity?: number;
    readonly platformCollisionEnabled: boolean;
    readonly initialVerticalVelocity?: number;
}

/** The same takeover rule drives live motion and the generation forecast. */
function flightMotion(
    config: DoodleJumpGameplayConfig, type: DoodleJumpFlightPower, velocityY: number,
    flightVelocity: number, inherited: boolean, justStarted: boolean, frame: number,
): Readonly<{ gravity: number; initialVerticalVelocity?: number; inherited: boolean }> {
    let initialVerticalVelocity: number | undefined;
    if (justStarted) {
        initialVerticalVelocity = Math.max(velocityY, flightVelocity);
        velocityY = initialVerticalVelocity;
        inherited = velocityY > flightVelocity;
    }
    if (inherited && velocityY <= flightVelocity) {
        inherited = false; initialVerticalVelocity = flightVelocity;
    }
    return { initialVerticalVelocity, inherited, gravity: inherited ? config.player.gravity
        : referenceFlightAcceleration(type, frame + 1e-7) * 3600 * config.design.width / 320 };
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
    anchorOffsetX: number;
    anchorOffsetY: number;
    activationCount: number;
    compressionFrames: number;
}

interface MutableItemPresentation {
    id: string;
    type: DoodleJumpItemType;
    x: number;
    y: number;
    radius: number;
    anchorPlatformId: string;
    phase: number;
    activationCount: number;
    compressionFrames: number;
}

interface MutableItemStatus {
    landingPower?: DoodleJumpLandingPower;
    flightPower?: DoodleJumpFlightPower;
    flightRemainingSeconds: number;
    shieldRemainingSeconds: number;
    trampolineJumpActive: boolean;
    trampolineJumpProgress: number;
    headStartRemainingSeconds: number;
    itemPickupCount: number;
    jetpackPickupCount: number;
    usedHeadStart: boolean;
    springShoesRemainingSeconds: number;
    shoeBounceFrame: number;
    trampolineCompressionFrames: number;
    flightVelocity: number;
    inheritedFlightVelocity: boolean;
    flightJustStarted: boolean;
}

const FLIGHT_TYPES: readonly DoodleJumpFlightPower[] = Object.freeze([
    'jetpack',
    'propeller-hat',
]);
function isFlightPower(type: DoodleJumpItemType): type is DoodleJumpFlightPower {
    return FLIGHT_TYPES.indexOf(type as DoodleJumpFlightPower) >= 0;
}

const EMPTY_EVENTS: readonly DoodleJumpItemEvent[] = Object.freeze([]);
// Native ordinary shoe table, excluding entry 0 (its animation-length header).
const SHOE_VELOCITIES = Object.freeze([-4, -4, 8, 11, 14, 14,
    13.760000228881836, 13.520000457763672, 13.279999732971191]);

export class DoodleJumpItemSystem {
    private readonly items: MutableItem[] = [];
    private readonly evaluatedPlatformIds = new Set<string>();
    private readonly events: DoodleJumpItemEvent[] = [];
    private readonly presentationItems: MutableItemPresentation[] = [];
    private readonly presentationStatus: MutableItemStatus = {
        flightRemainingSeconds: 0,
        shieldRemainingSeconds: 0,
        trampolineJumpActive: false,
        trampolineJumpProgress: 0,
        headStartRemainingSeconds: 0,
        itemPickupCount: 0,
        jetpackPickupCount: 0,
        usedHeadStart: false,
        springShoesRemainingSeconds: 0, shoeBounceFrame: -1, trampolineCompressionFrames: 0,
        flightVelocity: 0, inheritedFlightVelocity: false, flightJustStarted: false,
    };
    private springShoesRemainingSeconds = 0;
    private shoeBounceFrame = -1;
    private trampolineCompressionFrames = 0;
    private pendingLaunchVelocity?: number;
    private trampolineCompressionOffset = 0;
    private flightVelocity = 0;
    private inheritedFlightVelocity = false;
    private flightJustStarted = false;
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
    private jetpackPickupCount = 0;
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
        this.jetpackPickupCount = 0;
        this.usedHeadStart = false;
        this.springShoesRemainingSeconds = 0; this.shoeBounceFrame = -1;
        this.trampolineCompressionFrames = 0; this.pendingLaunchVelocity = undefined;
        this.trampolineCompressionOffset = 0;
        this.flightVelocity = 0; this.inheritedFlightVelocity = false; this.flightJustStarted = false;
        const preset = this.config.items.debugPowerPreset;
        if (preset === 'spring' || preset === 'trampoline') {
            this.landingPower = preset;
        } else if (preset === 'spring-shoes') {
            this.springShoesRemainingSeconds = this.config.items.springShoes.durationSeconds;
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
        world: DoodleJumpWorldIndex,
    ): void {
        this.reset();
        this.items.length = 0;
        this.events.length = 0;
        this.evaluatedPlatformIds.clear();
        const evaluatedIds = status.evaluatedPlatformIds
            ?? world.platforms.map((platform) => platform.id);
        evaluatedIds.forEach((id) => {
            if (world.platformById.has(id)) this.evaluatedPlatformIds.add(id);
        });
        let maximumId = 0;
        snapshots.forEach((snapshot) => {
            if (!world.platformById.has(snapshot.anchorPlatformId)) return;
            this.evaluatedPlatformIds.add(snapshot.anchorPlatformId);
            const parsedId = Number(snapshot.id.replace(/^I/, ''));
            if (Number.isInteger(parsedId)) maximumId = Math.max(maximumId, parsedId);
            this.items.push({
                ...snapshot,
                anchorOffsetX: Number.NaN,
                anchorOffsetY: Number.NaN,
                activationCount: snapshot.activationCount ?? 0,
                compressionFrames: snapshot.compressionFrames ?? 0,
            });
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
        this.jetpackPickupCount = Math.max(0, Math.floor(status.jetpackPickupCount));
        this.usedHeadStart = status.usedHeadStart;
        this.springShoesRemainingSeconds = Math.max(0, status.springShoesRemainingSeconds);
        this.shoeBounceFrame = status.shoeBounceFrame;
        this.trampolineCompressionFrames = status.trampolineCompressionFrames;
        this.flightVelocity = status.flightVelocity;
        this.inheritedFlightVelocity = status.inheritedFlightVelocity;
        this.flightJustStarted = status.flightJustStarted;
        this.pendingLaunchVelocity = status.pendingLaunchVelocity;
        this.trampolineCompressionOffset = status.trampolineCompressionOffset ?? 0;
    }

    updateTimers(
        deltaSeconds: number,
        playerX: number,
        playerY: number,
        playerVelocityY: number,
    ): number | undefined {
        const delta = Math.max(0, deltaSeconds);
        let shoeStepVelocity: number | undefined;
        for (const item of this.items) item.compressionFrames = Math.max(0, item.compressionFrames - 1);
        if (this.flightPower) {
            const frame = (this.getPoweredDurationSeconds(this.flightPower) - this.flightRemainingSeconds) * 60;
            this.flightVelocity += referenceFlightAcceleration(this.flightPower, frame + 1e-7)
                * 3600 * (this.config.design.width / 320) * delta;
            this.flightRemainingSeconds = Math.max(0, this.flightRemainingSeconds - delta);
            if (this.flightRemainingSeconds < 1e-7) {
                const ended = this.flightPower;
                this.flightPower = undefined; this.flightRemainingSeconds = 0;
                this.events.push(Object.freeze({ type: 'power-end', itemType: ended, x: playerX, y: playerY }));
            }
        }
        this.shieldRemainingSeconds = this.countdown(this.shieldRemainingSeconds, delta);
        this.springShoesRemainingSeconds = this.countdown(this.springShoesRemainingSeconds, delta);
        if (this.shoeBounceFrame >= 0) {
            this.shoeBounceFrame += 1;
            shoeStepVelocity = SHOE_VELOCITIES[this.shoeBounceFrame] / 14 * this.config.items.springShoes.bounceVelocity;
            if (this.shoeBounceFrame >= SHOE_VELOCITIES.length - 1) {
                this.shoeBounceFrame = -1;
                if (this.springShoesRemainingSeconds > 0 && this.springShoesRemainingSeconds < 100 / 60) {
                    this.springShoesRemainingSeconds = 30 / 60;
                }
            }
        }
        if (this.trampolineCompressionFrames > 0) {
            this.trampolineCompressionFrames -= 1;
            if (this.trampolineCompressionFrames === 0) this.pendingLaunchVelocity = this.config.items.trampoline.bounceVelocity;
        } else if (this.trampolineJumpActive) {
            this.trampolineJumpElapsedSeconds += delta;
            if (playerVelocityY <= 0 && !this.pendingLaunchVelocity) this.cancelTrampolineJump();
        }
        this.headStartRemainingSeconds = this.countdown(this.headStartRemainingSeconds, delta);
        return shoeStepVelocity;
    }

    updateExisting(
        world: DoodleJumpWorldIndex,
        cameraBottomY: number,
    ): void {
        this.updateAttachedItems(world.platformById);
        this.recycleItems(cameraBottomY);
    }

    reconcileWorld(
        world: DoodleJumpWorldIndex,
        cameraBottomY: number,
        cameraTopY: number,
        occupiedBodies: readonly DoodleJumpItemOccupiedBody[],
    ): void {
        this.recycleItems(cameraBottomY);
        this.purgeEvaluatedPlatforms(world.platformById);
        this.evaluateNewPlatforms(
            world.platforms,
            cameraBottomY,
            cameraTopY,
            occupiedBodies,
        );
    }

    resolvePickups(
        playerX: number, playerY: number, playerWidth: number, playerHeight: number,
        previousFootY = playerY - playerHeight / 2, velocityY = 0,
    ): Readonly<{ velocityY: number; surfaceY?: number; playerX?: number; playerY?: number }> | undefined {
        let result: Readonly<{ velocityY: number; surfaceY?: number; playerX?: number; playerY?: number }> | undefined;
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            if (item.type === 'spring' && item.activationCount > 0) continue;
            const [width, height] = this.itemCollisionSize(item.type);
            const surfaceY = item.y + height / 2;
            const bodyFootY = playerY - playerHeight / 2;
            const shoes = this.hasSpringShoes();
            const scale = this.config.design.width / 320;
            const footY = bodyFootY - (shoes ? 15 * scale : 0);
            const landingItem = item.type === 'spring' || item.type === 'trampoline' || item.type === 'spring-shoes';
            const collisionX = playerX + (landingItem && shoes ? 2 * scale : 0);
            const collisionWidth = playerWidth - (landingItem && shoes ? 4 * scale : 0);
            if (Math.abs(item.x - collisionX) > width / 2 + collisionWidth / 2) continue;
            if (landingItem) {
                if (velocityY >= 0 || footY >= previousFootY || footY > surfaceY
                    || footY + 2 * scale < item.y - height / 2
                    || item.compressionFrames > 0 || result) continue;
            } else if (playerY + playerHeight / 2 < item.y - height / 2 || footY > surfaceY) continue;
            if (this.hasFlightInvincibility()) continue;
            // Native kind 5 stays attached after its 3-frame compression. It is
            // a reusable landing surface, unlike spring kind 0 -> spent kind 1.
            if (item.type !== 'trampoline' && item.type !== 'spring') this.items.splice(index, 1);
            if (item.activationCount === 0) {
                this.itemPickupCount += 1;
                this.events.push(Object.freeze({ type: 'pickup', itemType: item.type, x: item.x, y: item.y }));
            }
            item.activationCount += 1;
            if (item.type === 'trampoline') item.compressionFrames = 3;
            if (item.type === 'spring' || item.type === 'trampoline') {
                this.landingPower = item.type;
                const launch = this.consumeLandingPower(playerX, surfaceY) ?? 0;
                if (item.type === 'trampoline') {
                    // Native kind 5 moves by 3/6, 2/6, 1/6 of the original
                    // body-foot-to-anchor distance, including while wearing shoes.
                    this.trampolineCompressionOffset = Math.min(0, (item.y - bodyFootY) / 6);
                    result = { velocityY: launch, playerY: playerY + this.trampolineCompressionOffset * 3 };
                } else result = { velocityY: launch };
            } else if (item.type === 'shield') {
                this.shieldRemainingSeconds = this.config.items.shield.durationSeconds;
            } else if (item.type === 'spring-shoes') {
                this.springShoesRemainingSeconds = this.config.items.springShoes.durationSeconds;
            } else {
                if (item.type === 'jetpack') this.jetpackPickupCount += 1;
                this.activateFlight(item.type);
                const initial = Math.max(velocityY, this.flightVelocity);
                this.inheritedFlightVelocity = initial > this.flightVelocity;
                this.flightJustStarted = false;
                result = { velocityY: initial };
            }
        }
        return result;
    }

    getPhysics(velocityY = this.config.player.bounceVelocity): DoodleJumpItemPhysics {
        if (this.headStartRemainingSeconds > 0) return { gravity: 0,
            fixedVerticalVelocity: this.config.items.headStart.verticalVelocity, platformCollisionEnabled: false };
        if (this.pendingLaunchVelocity !== undefined) {
            const initialVerticalVelocity = this.pendingLaunchVelocity;
            this.pendingLaunchVelocity = undefined;
            return { gravity: this.config.player.gravity, initialVerticalVelocity, platformCollisionEnabled: false };
        }
        if (this.trampolineCompressionFrames > 0) return { gravity: 0,
            fixedVerticalVelocity: Math.max(0, this.trampolineCompressionFrames - 1)
                * this.trampolineCompressionOffset * 60, platformCollisionEnabled: false };
        if (this.shoeBounceFrame >= 0) {
            // Ordinary SpringShoesJumper table at ELF 0x1a17c8, entries 1..9.
            // Ninja Double Jumper Suit (world+0x9c50) is a separate power.
            return { gravity: 0, fixedVerticalVelocity: SHOE_VELOCITIES[this.shoeBounceFrame] / 14 * this.config.items.springShoes.bounceVelocity,
                platformCollisionEnabled: false };
        }
        if (!this.flightPower) return { gravity: this.config.player.gravity, platformCollisionEnabled: true };
        const frame = (this.getPoweredDurationSeconds(this.flightPower) - this.flightRemainingSeconds) * 60;
        const motion = flightMotion(this.config, this.flightPower, velocityY, this.flightVelocity,
            this.inheritedFlightVelocity, this.flightJustStarted, frame);
        this.inheritedFlightVelocity = motion.inherited; this.flightJustStarted = false;
        return { gravity: motion.gravity, initialVerticalVelocity: motion.initialVerticalVelocity, platformCollisionEnabled: false };
    }

    /** Includes the normal-gravity coast after power expiry; this never changes live item state. */
    forecastFlightApex(playerY: number, velocityY: number): number | undefined {
        const type = this.flightPower;
        if (!type) return undefined;
        const delta = this.config.fixedStep.seconds;
        const duration = this.getPoweredDurationSeconds(type);
        const scale = this.config.design.width / 320;
        let remaining = this.flightRemainingSeconds;
        let flightVelocity = this.flightVelocity;
        let inherited = this.inheritedFlightVelocity;
        let justStarted = this.flightJustStarted;
        let y = playerY; let apex = y;
        while (remaining > 1e-7) {
            const frame = (duration - remaining) * 60;
            const motion = flightMotion(this.config, type, velocityY, flightVelocity, inherited, justStarted, frame);
            inherited = motion.inherited; justStarted = false;
            const step = stepDoodleJumpVertical(motion.initialVerticalVelocity ?? velocityY,
                motion.gravity, delta, this.config.player.terminalFallVelocity);
            y += step.displacement; velocityY = step.velocity;
            apex = Math.max(apex, y);
            flightVelocity += referenceFlightAcceleration(type, frame + 1e-7) * 3600 * scale * delta;
            remaining -= delta;
        }
        if (velocityY > 0) {
            const coastFrames = Math.ceil(velocityY / (-this.config.player.gravity * delta));
            const coast = stepDoodleJumpVertical(velocityY, this.config.player.gravity,
                coastFrames * delta, this.config.player.terminalFallVelocity);
            apex = Math.max(apex, y + coast.displacement);
        }
        return apex;
    }

    consumeLandingPower(x: number, y: number): number | undefined {
        const power = this.landingPower;
        this.landingPower = undefined;
        this.cancelTrampolineJump();
        if (power) this.shoeBounceFrame = -1;
        if (power) this.events.push(Object.freeze({ type: 'landing-boost', itemType: power, x, y }));
        if (power === 'trampoline') {
            this.trampolineCompressionFrames = 3;
            this.trampolineJumpActive = true;
            this.trampolineJumpDurationSeconds = this.config.items.trampoline.bounceVelocity / Math.abs(this.config.player.gravity);
            return 0;
        }
        if (power === 'spring') return this.config.items.spring.bounceVelocity;
        if (this.springShoesRemainingSeconds > 0) {
            this.shoeBounceFrame = 0;
            this.events.push(Object.freeze({ type: 'landing-boost', itemType: 'spring-shoes', x, y }));
            return -4 / 14 * this.config.items.springShoes.bounceVelocity;
        }
        return undefined;
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

    hasSpringShoes(): boolean {
        return this.springShoesRemainingSeconds > 0;
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
        this.trampolineCompressionFrames = 0; this.pendingLaunchVelocity = undefined;
        this.trampolineCompressionOffset = 0;
    }

    drainEvents(): readonly DoodleJumpItemEvent[] {
        if (this.events.length === 0) return EMPTY_EVENTS;
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
            activationCount: item.activationCount,
            compressionFrames: item.compressionFrames,
        })));
    }

    getPresentationItems(): readonly DoodleJumpItemSnapshot[] {
        for (let index = 0; index < this.items.length; index += 1) {
            const item = this.items[index];
            let presentation = this.presentationItems[index];
            if (!presentation) {
                presentation = {
                    id: item.id,
                    type: item.type,
                    x: item.x,
                    y: item.y,
                    radius: item.radius,
                    anchorPlatformId: item.anchorPlatformId,
                    phase: item.phase,
                    activationCount: item.activationCount,
                    compressionFrames: item.compressionFrames,
                };
                this.presentationItems[index] = presentation;
            }
            presentation.id = item.id;
            presentation.type = item.type;
            presentation.x = item.x;
            presentation.y = item.y;
            presentation.radius = item.radius;
            presentation.anchorPlatformId = item.anchorPlatformId;
            presentation.phase = item.phase;
            presentation.activationCount = item.activationCount;
            presentation.compressionFrames = item.compressionFrames;
        }
        this.presentationItems.length = this.items.length;
        return this.presentationItems;
    }

    getStatus(): DoodleJumpItemStatusSnapshot {
        return Object.freeze({
            evaluatedPlatformIds: Object.freeze(Array.from(this.evaluatedPlatformIds)),
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
            jetpackPickupCount: this.jetpackPickupCount,
            usedHeadStart: this.usedHeadStart,
            springShoesRemainingSeconds: this.springShoesRemainingSeconds, shoeBounceFrame: this.shoeBounceFrame,
            trampolineCompressionFrames: this.trampolineCompressionFrames, flightVelocity: this.flightVelocity,
            inheritedFlightVelocity: this.inheritedFlightVelocity, flightJustStarted: this.flightJustStarted,
            pendingLaunchVelocity: this.pendingLaunchVelocity,
            trampolineCompressionOffset: this.trampolineCompressionOffset,
        });
    }

    getPresentationStatus(): DoodleJumpItemStatusSnapshot {
        this.presentationStatus.landingPower = this.landingPower;
        this.presentationStatus.flightPower = this.flightPower;
        this.presentationStatus.flightRemainingSeconds = this.flightRemainingSeconds;
        this.presentationStatus.shieldRemainingSeconds = this.shieldRemainingSeconds;
        this.presentationStatus.trampolineJumpActive = this.trampolineJumpActive;
        this.presentationStatus.trampolineJumpProgress = this.trampolineJumpActive
            ? Math.min(
                1,
                this.trampolineJumpElapsedSeconds
                    / Math.max(0.001, this.trampolineJumpDurationSeconds),
            )
            : 0;
        this.presentationStatus.headStartRemainingSeconds = this.headStartRemainingSeconds;
        this.presentationStatus.itemPickupCount = this.itemPickupCount;
        this.presentationStatus.jetpackPickupCount = this.jetpackPickupCount;
        this.presentationStatus.usedHeadStart = this.usedHeadStart;
        this.presentationStatus.springShoesRemainingSeconds = this.springShoesRemainingSeconds;
        this.presentationStatus.shoeBounceFrame = this.shoeBounceFrame;
        this.presentationStatus.trampolineCompressionFrames = this.trampolineCompressionFrames;
        this.presentationStatus.flightVelocity = this.flightVelocity;
        this.presentationStatus.inheritedFlightVelocity = this.inheritedFlightVelocity;
        this.presentationStatus.flightJustStarted = this.flightJustStarted;
        return this.presentationStatus;
    }

    writeOccupiedBodies(
        target: DoodleJumpItemOccupiedBody[],
        startIndex = 0,
    ): number {
        let cursor = startIndex;
        for (let index = 0; index < this.items.length; index += 1) {
            const item = this.items[index];
            let body = target[cursor];
            if (!body) {
                body = { x: 0, y: 0, width: 0, height: 0 };
                target[cursor] = body;
            }
            body.x = item.x;
            body.y = item.y;
            body.width = item.radius * 2;
            body.height = item.radius * 2;
            body.anchorPlatformId = item.anchorPlatformId;
            cursor += 1;
        }
        return cursor;
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

    private countdown(remaining: number, delta: number): number {
        const next = remaining - delta;
        return next < 1e-7 ? 0 : next;
    }

    private activateFlight(type: DoodleJumpFlightPower): void {
        this.cancelTrampolineJump(); this.shoeBounceFrame = -1;
        this.headStartRemainingSeconds = 0;
        this.flightPower = type;
        this.flightRemainingSeconds = this.getPoweredDurationSeconds(type);
        this.flightVelocity = type === 'jetpack' ? this.config.items.jetpack.verticalVelocity
            : this.config.items.propellerHat.minimumVerticalVelocity;
        this.inheritedFlightVelocity = false; this.flightJustStarted = true;
        this.events.push(Object.freeze({ type: 'power-start', itemType: type, x: 0, y: 0 }));
    }

    private itemCollisionSize(type: DoodleJumpItemType): readonly [number, number] {
        const scale = this.config.design.width / 320;
        const sizes: Readonly<Record<DoodleJumpItemType, readonly [number, number]>> = {
            spring: [18, 20], trampoline: [28, 16], jetpack: [26, 34], 'propeller-hat': [30, 44],
            shield: [36, 62], 'spring-shoes': [16, 20],
        };
        return [sizes[type][0] * scale, sizes[type][1] * scale];
    }

    private getPoweredDurationSeconds(type: DoodleJumpFlightPower): number {
        return type === 'jetpack'
            ? this.config.items.jetpack.durationSeconds
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

    private updateAttachedItems(platformById: ReadonlyMap<string, DoodleJumpItemPlatform>): void {
        for (let index = this.items.length - 1; index >= 0; index -= 1) {
            const item = this.items[index];
            const platform = platformById.get(item.anchorPlatformId);
            if (!platform || platform.consumed) { this.items.splice(index, 1); continue; }
            if (!Number.isFinite(item.anchorOffsetX) || !Number.isFinite(item.anchorOffsetY)) {
                item.anchorOffsetX = item.x - platform.x; item.anchorOffsetY = item.y - platform.y;
            }
            item.x = platform.x + item.anchorOffsetX; item.y = platform.y + item.anchorOffsetY;
        }
    }

    private purgeEvaluatedPlatforms(
        platformById: ReadonlyMap<string, DoodleJumpItemPlatform>,
    ): void {
        this.evaluatedPlatformIds.forEach((id) => {
            if (!platformById.has(id)) this.evaluatedPlatformIds.delete(id);
        });
    }

    private evaluateNewPlatforms(platforms: readonly DoodleJumpItemPlatform[], cameraBottomY: number,
        _cameraTopY: number, _occupiedBodies: readonly DoodleJumpItemOccupiedBody[]): void {
        if (!this.config.items.enabled) return;
        for (const platform of platforms) {
            if (this.evaluatedPlatformIds.has(platform.id)) continue;
            if (platform.spawnPlan?.content !== 'item' || !platform.spawnPlan.itemType
                || platform.y < cameraBottomY || platform.consumed) {
                this.evaluatedPlatformIds.add(platform.id);
                continue;
            }
            // Opening rows can already be on screen. Their boost was used to
            // generate the next gap, so visibility must never cancel the ticket.
            if (this.items.length >= this.config.items.maximumActive) continue;
            const override = this.config.items.typeOverride;
            const type = override !== 'auto' ? override : platform.spawnPlan.itemType;
            this.items.push(this.createItem(type, platform));
            this.evaluatedPlatformIds.add(platform.id);
        }
    }

    private createItem(type: DoodleJumpItemType, platform: DoodleJumpItemPlatform): MutableItem {
        const [width, height] = this.itemCollisionSize(type);
        const offsetX = platform.spawnPlan?.itemOffsetX
            ?? (this.randomStreams.next('item') * 2 - 1) * Math.max(0, platform.width / 2 - width / 2 - 8);
        const offsetY = platform.spawnPlan?.itemOffsetY ?? height / 2;
        return { id: `I${this.nextItemId++}`, type, x: platform.x + offsetX, y: platform.y + offsetY,
            radius: Math.max(width, height) / 2, anchorPlatformId: platform.id,
            phase: this.randomStreams.next('item'), anchorOffsetX: offsetX, anchorOffsetY: offsetY,
            activationCount: 0, compressionFrames: 0 };
    }

    private startWorldY(): number {
        return this.config.fixedPlatforms[0].y + this.config.player.collisionHeight / 2;
    }
}
