import { WATERMELON_SEMI_FLUID } from './WatermelonSemiFluid';

const POINT_COUNT = 18;
const TAU = Math.PI * 2;
const FIXED_HZ = 120;
const REFERENCE_SEPARATION_SLOP = -1.2;
// Only the body created by a merge uses this reduced rebound during its brief
// initial depenetration. Ordinary contacts retain the reference-game response.
const MERGED_BODY_REBOUND_SCALE = 0.35;
const MERGED_BODY_REBOUND_SECONDS = 0.12;
const BROAD_PHASE_RADIUS_SCALE = 1.5;

export interface WatermelonFluidPoint {
    x: number;
    y: number;
    px: number;
    py: number;
}

export interface WatermelonFluidBody {
    readonly id: number;
    readonly level: number;
    readonly radius: number;
    readonly points: WatermelonFluidPoint[];
    readonly targetArea: number;
    readonly edgeLength: number;
    readonly bendLength: number;
    readonly pressureGradientX: number[];
    readonly pressureGradientY: number[];
    x: number;
    y: number;
    ageSeconds: number;
    dangerSeconds: number;
    noImpulseCorrectionSeconds: number;
    mergeReboundScale: number;
    mergeReboundSeconds: number;
}

export interface WatermelonFluidBounds {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly dangerLine: number;
}

export interface WatermelonFluidMergeEvent {
    readonly first: WatermelonFluidBody;
    readonly second: WatermelonFluidBody;
    readonly result?: WatermelonFluidBody;
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly cleared: boolean;
}

interface FluidOverlap {
    depth: number;
    nx: number;
    ny: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => (
    Math.max(minimum, Math.min(maximum, value))
);

function updateCenter(body: WatermelonFluidBody): void {
    let x = 0;
    let y = 0;
    for (const point of body.points) {
        x += point.x;
        y += point.y;
    }
    body.x = x / POINT_COUNT;
    body.y = y / POINT_COUNT;
}

function constrainDistance(
    first: WatermelonFluidPoint,
    second: WatermelonFluidPoint,
    targetLength: number,
    stiffness: number,
): void {
    let dx = second.x - first.x;
    let dy = second.y - first.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const correction = (distance - targetLength) / distance * 0.5 * stiffness;
    dx *= correction;
    dy *= correction;
    first.x += dx;
    first.y += dy;
    second.x -= dx;
    second.y -= dy;
}

function polygonArea(points: readonly WatermelonFluidPoint[]): number {
    let area = 0;
    for (let index = 0; index < POINT_COUNT; index += 1) {
        const next = points[(index + 1) % POINT_COUNT];
        area += points[index].x * next.y - next.x * points[index].y;
    }
    return area * 0.5;
}

function constrainPressure(body: WatermelonFluidBody, stiffness: number): void {
    const gradientX = body.pressureGradientX;
    const gradientY = body.pressureGradientY;
    let norm = 0;
    for (let index = 0; index < POINT_COUNT; index += 1) {
        const before = body.points[(index + POINT_COUNT - 1) % POINT_COUNT];
        const after = body.points[(index + 1) % POINT_COUNT];
        const gx = (after.y - before.y) * 0.5;
        const gy = (before.x - after.x) * 0.5;
        gradientX[index] = gx;
        gradientY[index] = gy;
        norm += gx * gx + gy * gy;
    }
    const delta = clamp(
        (body.targetArea - polygonArea(body.points)) / (norm || 1),
        -0.16,
        0.16,
    ) * stiffness;
    for (let index = 0; index < POINT_COUNT; index += 1) {
        body.points[index].x += gradientX[index] * delta;
        body.points[index].y += gradientY[index] * delta;
    }
}

/**
 * The solver constrains every fruit to a rounded, pressure-filled shape. Its
 * separating axis is therefore the line between the two centers: project the
 * deformed rims onto that axis to retain visible squish without paying for a
 * 36-axis polygon SAT on every constraint iteration.
 */
function findOverlap(
    first: WatermelonFluidBody,
    second: WatermelonFluidBody,
    separationSlop: number,
    result: FluidOverlap,
): boolean {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const distanceSquared = dx * dx + dy * dy;
    const broadDistance = (first.radius + second.radius) * BROAD_PHASE_RADIUS_SCALE;
    if (distanceSquared > broadDistance * broadDistance) return false;

    const distance = Math.sqrt(distanceSquared);
    const nx = distance > 0.001 ? dx / distance : (first.id < second.id ? 1 : -1);
    const ny = distance > 0.001 ? dy / distance : 0;
    let firstSupport = Number.NEGATIVE_INFINITY;
    let secondSupport = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < POINT_COUNT; index += 1) {
        const firstPoint = first.points[index];
        const secondPoint = second.points[index];
        firstSupport = Math.max(
            firstSupport,
            (firstPoint.x - first.x) * nx + (firstPoint.y - first.y) * ny,
        );
        secondSupport = Math.max(
            secondSupport,
            (second.x - secondPoint.x) * nx + (second.y - secondPoint.y) * ny,
        );
    }
    const depth = firstSupport + secondSupport - distance;
    if (depth < separationSlop) return false;
    result.depth = Math.max(0, depth);
    result.nx = nx;
    result.ny = ny;
    return true;
}

function resolveOverlap(
    body: WatermelonFluidBody,
    sign: number,
    weight: number,
    overlap: FluidOverlap,
    positionOnly: boolean,
): void {
    const reboundScale = positionOnly
        ? 0
        : body.mergeReboundSeconds > 0
            ? body.mergeReboundScale
            : 1;
    for (let index = 0; index < POINT_COUNT; index += 1) {
        const point = body.points[index];
        const contact = clamp(
            -sign * ((point.x - body.x) * overlap.nx + (point.y - body.y) * overlap.ny)
                / body.radius,
            0,
            1,
        );
        const push = overlap.depth * weight * (0.4 + 0.6 * contact) * 0.94;
        const correctionX = sign * overlap.nx * push;
        const correctionY = sign * overlap.ny * push;
        point.x += correctionX;
        point.y += correctionY;
        if (reboundScale < 1) {
            point.px += correctionX * (1 - reboundScale);
            point.py += correctionY * (1 - reboundScale);
        }
    }
}

/**
 * Cocos-coordinate port of melon-lab's point/constraint solver. It adapts
 * Y-up gravity/floor handling and scales reference-space motion to the current
 * playfield width. Restored bodies get a short position-only depenetration
 * window; newly merged bodies rebound immediately like the reference game.
 */
export class WatermelonFluidWorld {
    readonly bodies: WatermelonFluidBody[] = [];
    timeSeconds = 0;
    tilt = 0;

    private nextId = 1;
    private readonly activeBodies = new Set<WatermelonFluidBody>();
    private readonly lockedBodies = new Set<number>();
    private readonly mergeFirst: WatermelonFluidBody[] = [];
    private readonly mergeSecond: WatermelonFluidBody[] = [];
    private readonly overlapScratch: FluidOverlap = { depth: 0, nx: 0, ny: 0 };

    constructor(
        private radii: readonly number[],
        private bounds: WatermelonFluidBounds,
        private readonly onMerge: (event: WatermelonFluidMergeEvent) => void = () => {},
    ) {}

    configure(radii: readonly number[], bounds: WatermelonFluidBounds): void {
        this.radii = radii;
        this.bounds = bounds;
    }

    private get coordinateScale(): number {
        const playfieldWidth = Math.max(1, this.bounds.right - this.bounds.left);
        return playfieldWidth / WATERMELON_SEMI_FLUID.referencePlayfieldWidth;
    }

    add(
        level: number,
        x: number,
        y: number,
        velocityX = 0,
        velocityY = 0,
        noImpulseCorrectionSeconds = 0,
    ): WatermelonFluidBody {
        const radius = this.radii[level];
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new Error(`Missing soft-body radius for cat level ${level}.`);
        }
        // Public velocities use melon-lab's 450-wide reference coordinates;
        // convert once at the simulation boundary so drops and tilt preserve
        // the same dimensionless motion on this collection's wider board.
        const scaledVelocityX = velocityX * this.coordinateScale;
        const scaledVelocityY = velocityY * this.coordinateScale;
        const points = Array.from({ length: POINT_COUNT }, (_, index) => {
            const angle = TAU * index / POINT_COUNT;
            const pointX = x + Math.cos(angle) * radius;
            const pointY = y + Math.sin(angle) * radius;
            return {
                x: pointX,
                y: pointY,
                px: pointX - scaledVelocityX / FIXED_HZ,
                py: pointY - scaledVelocityY / FIXED_HZ,
            };
        });
        const body: WatermelonFluidBody = {
            id: this.nextId,
            level,
            radius,
            points,
            x,
            y,
            ageSeconds: 0,
            targetArea: polygonArea(points),
            edgeLength: 2 * radius * Math.sin(Math.PI / POINT_COUNT),
            bendLength: 2 * radius * Math.sin(2 * Math.PI / POINT_COUNT),
            pressureGradientX: new Array<number>(POINT_COUNT).fill(0),
            pressureGradientY: new Array<number>(POINT_COUNT).fill(0),
            dangerSeconds: 0,
            noImpulseCorrectionSeconds: Math.max(0, noImpulseCorrectionSeconds),
            mergeReboundScale: 1,
            mergeReboundSeconds: 0,
        };
        this.nextId += 1;
        this.bodies.push(body);
        this.activeBodies.add(body);
        return body;
    }

    remove(body: WatermelonFluidBody): void {
        const index = this.bodies.indexOf(body);
        if (index >= 0) {
            this.bodies.splice(index, 1);
            this.activeBodies.delete(body);
        }
    }

    has(body: WatermelonFluidBody): boolean {
        return this.activeBodies.has(body);
    }

    /** Resume an externally restored shape without carrying stale frame velocity. */
    stabilize(body: WatermelonFluidBody, seconds: number): void {
        if (!this.activeBodies.has(body)) return;
        updateCenter(body);
        for (const point of body.points) {
            point.px = point.x;
            point.py = point.y;
        }
        body.noImpulseCorrectionSeconds = Math.max(
            body.noImpulseCorrectionSeconds,
            Math.max(0, seconds),
        );
    }

    reset(): void {
        this.bodies.length = 0;
        this.activeBodies.clear();
        this.lockedBodies.clear();
        this.mergeFirst.length = 0;
        this.mergeSecond.length = 0;
        this.timeSeconds = 0;
        this.tilt = 0;
        this.nextId = 1;
    }

    step(deltaSeconds = 1 / FIXED_HZ): void {
        const delta = Math.max(0, deltaSeconds);
        const coordinateScale = this.coordinateScale;
        const maxPointSpeed = WATERMELON_SEMI_FLUID.maxPointSpeedPerStep
            * coordinateScale;
        this.timeSeconds += delta;
        for (const body of this.bodies) {
            body.ageSeconds += delta;
            body.noImpulseCorrectionSeconds = Math.max(
                0,
                body.noImpulseCorrectionSeconds - delta,
            );
            body.mergeReboundSeconds = Math.max(0, body.mergeReboundSeconds - delta);
            for (const point of body.points) {
                const velocityX = clamp(
                    (point.x - point.px) * WATERMELON_SEMI_FLUID.damping,
                    -maxPointSpeed,
                    maxPointSpeed,
                );
                const velocityY = clamp(
                    (point.y - point.py) * WATERMELON_SEMI_FLUID.damping,
                    -maxPointSpeed,
                    maxPointSpeed,
                );
                point.px = point.x;
                point.py = point.y;
                point.x += velocityX + this.tilt
                    * WATERMELON_SEMI_FLUID.tiltAcceleration
                    * coordinateScale * delta * delta;
                point.y += velocityY - WATERMELON_SEMI_FLUID.gravity
                    * coordinateScale * delta * delta;
            }
        }

        const locked = this.lockedBodies;
        const mergeFirst = this.mergeFirst;
        const mergeSecond = this.mergeSecond;
        locked.clear();
        mergeFirst.length = 0;
        mergeSecond.length = 0;
        for (let iteration = 0; iteration < WATERMELON_SEMI_FLUID.iterations; iteration += 1) {
            for (const body of this.bodies) {
                for (let index = 0; index < POINT_COUNT; index += 1) {
                    constrainDistance(body.points[index], body.points[(index + 1) % POINT_COUNT], body.edgeLength, WATERMELON_SEMI_FLUID.edge);
                    constrainDistance(body.points[index], body.points[(index + 2) % POINT_COUNT], body.bendLength, WATERMELON_SEMI_FLUID.bend);
                    if (index < POINT_COUNT / 2) {
                        constrainDistance(body.points[index], body.points[(index + POINT_COUNT / 2) % POINT_COUNT], body.radius * 2, WATERMELON_SEMI_FLUID.shape);
                    }
                }
                constrainPressure(body, WATERMELON_SEMI_FLUID.pressure);
                updateCenter(body);
            }

            for (let firstIndex = 0; firstIndex < this.bodies.length; firstIndex += 1) {
                for (let secondIndex = firstIndex + 1; secondIndex < this.bodies.length; secondIndex += 1) {
                    const first = this.bodies[firstIndex];
                    const second = this.bodies[secondIndex];
                    const overlaps = findOverlap(
                        first,
                        second,
                        REFERENCE_SEPARATION_SLOP * coordinateScale,
                        this.overlapScratch,
                    );
                    if (!overlaps) continue;
                    if (first.level === second.level && !locked.has(first.id) && !locked.has(second.id)) {
                        locked.add(first.id);
                        locked.add(second.id);
                        mergeFirst.push(first);
                        mergeSecond.push(second);
                    }
                    const firstWeight = second.targetArea / (first.targetArea + second.targetArea);
                    const secondWeight = 1 - firstWeight;
                    const isPositionOnlyCorrection = first.noImpulseCorrectionSeconds > 0
                        || second.noImpulseCorrectionSeconds > 0
                        // A body already locked for merge disappears at the
                        // end of this step. Let it depenetrate geometrically,
                        // but never let its final corrections launch a third
                        // body before removal.
                        || locked.has(first.id)
                        || locked.has(second.id);
                    // Match melon-lab for ordinary contacts: leaving the previous
                    // position unchanged turns depenetration into Verlet velocity.
                    // Lifecycle topology correction remains position-only.
                    resolveOverlap(first, -1, firstWeight, this.overlapScratch, isPositionOnlyCorrection);
                    resolveOverlap(second, 1, secondWeight, this.overlapScratch, isPositionOnlyCorrection);
                }
            }

            for (const body of this.bodies) {
                for (const point of body.points) {
                    if (point.x < this.bounds.left) {
                        point.x = this.bounds.left;
                        point.px = point.x + (point.x - point.px) * 0.08;
                    }
                    if (point.x > this.bounds.right) {
                        point.x = this.bounds.right;
                        point.px = point.x + (point.x - point.px) * 0.08;
                    }
                    if (point.y < this.bounds.bottom) {
                        point.y = this.bounds.bottom;
                        point.py = point.y;
                        point.px += (point.x - point.px) * 0.025;
                    }
                }
            }
        }

        if (mergeFirst.length > 0) {
            let survivorCount = 0;
            for (let index = 0; index < this.bodies.length; index += 1) {
                const body = this.bodies[index];
                if (locked.has(body.id)) {
                    this.activeBodies.delete(body);
                } else {
                    this.bodies[survivorCount] = body;
                    survivorCount += 1;
                }
            }
            this.bodies.length = survivorCount;
            for (let index = 0; index < mergeFirst.length; index += 1) {
                const first = mergeFirst[index];
                const second = mergeSecond[index];
                const level = first.level + 1;
                const x = (first.x + second.x) / 2;
                const y = (first.y + second.y) / 2;
                let result: WatermelonFluidBody | undefined;
                if (level < this.radii.length) {
                    const radius = this.radii[level];
                    result = this.add(
                        level,
                        clamp(x, this.bounds.left + radius, this.bounds.right - radius),
                        Math.max(y, this.bounds.bottom + radius),
                        0,
                        0,
                    );
                    result.mergeReboundScale = MERGED_BODY_REBOUND_SCALE;
                    result.mergeReboundSeconds = MERGED_BODY_REBOUND_SECONDS;
                }
                this.onMerge({
                    first,
                    second,
                    result,
                    level: Math.min(level, this.radii.length - 1),
                    x,
                    y,
                    cleared: !result,
                });
            }
        }

        locked.clear();
        mergeFirst.length = 0;
        mergeSecond.length = 0;

        for (const body of this.bodies) {
            updateCenter(body);
            let highest = Number.NEGATIVE_INFINITY;
            for (const point of body.points) highest = Math.max(highest, point.y);
            body.dangerSeconds = body.ageSeconds > 1.8 && highest > this.bounds.dangerLine
                ? body.dangerSeconds + delta
                : Math.max(0, body.dangerSeconds - delta * 2);
        }
    }
}
