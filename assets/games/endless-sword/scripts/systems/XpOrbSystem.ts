import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { XpOrbModel } from '../core/CombatModels';
import { ObjectPool, type ObjectPoolStats } from '../core/ObjectPool';

export type XpCollectedHandler = (value: number) => void;
export type XpReleasedHandler = (orb: XpOrbModel) => void;

/** T1.7 XP 节点：固定容量、满池合并、吸附拾取和四级视觉数据。 */
export class XpOrbSystem {
    private readonly pool: ObjectPool<XpOrbModel>;

    constructor(capacity: number = ENDLESS_SWORD_CONFIG.pools.xpOrbs) {
        this.pool = new ObjectPool(
            capacity,
            (poolIndex) => createXpOrbModel(poolIndex),
            resetXpOrbModel,
        );
    }

    spawn(x: number, y: number, value: number): XpOrbModel | undefined {
        const normalizedValue = Math.max(1, Math.floor(value));
        const shouldMergeFirst = this.pool.stats.active >= this.pool.capacity;
        const orb = shouldMergeFirst ? undefined : this.pool.acquire();
        if (!orb) {
            const mergeTarget = this.findNearestActive(x, y, ENDLESS_SWORD_CONFIG.experience.xpMergeRadius);
            if (!mergeTarget) {
                return undefined;
            }
            mergeTarget.value += normalizedValue;
            mergeTarget.tier = getXpOrbTier(mergeTarget.value);
            return mergeTarget;
        }
        orb.generation += 1;
        orb.active = true;
        orb.x = x;
        orb.y = y;
        orb.value = normalizedValue;
        orb.tier = getXpOrbTier(normalizedValue);
        return orb;
    }

    step(
        dt: number,
        playerX: number,
        playerY: number,
        pickupRadius: number,
        magnetRadius: number,
        magnetSpeed: number,
        onCollected: XpCollectedHandler,
        onReleased?: XpReleasedHandler,
    ): void {
        this.pool.forEachActive((orb) => {
            const dx = playerX - orb.x;
            const dy = playerY - orb.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= pickupRadius) {
                onCollected(orb.value);
                onReleased?.(orb);
                this.pool.release(orb);
                return;
            }
            if (distance > magnetRadius || distance <= 0.0001) {
                return;
            }
            const stepDistance = Math.min(distance, magnetSpeed * dt);
            orb.x += dx / distance * stepDistance;
            orb.y += dy / distance * stepDistance;
        });
    }

    clear(beforeRelease?: (orb: XpOrbModel) => void): void {
        this.pool.clear(beforeRelease);
    }

    forEachActive(visitor: (orb: XpOrbModel) => void): void {
        this.pool.forEachActive(visitor);
    }

    get stats(): ObjectPoolStats {
        return this.pool.stats;
    }

    private findNearestActive(x: number, y: number, radius: number): XpOrbModel | undefined {
        let nearest: XpOrbModel | undefined;
        let nearestDistanceSquared = radius * radius;
        this.pool.forEachActive((orb) => {
            const dx = orb.x - x;
            const dy = orb.y - y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= nearestDistanceSquared) {
                nearestDistanceSquared = distanceSquared;
                nearest = orb;
            }
        });
        return nearest;
    }
}

function createXpOrbModel(poolIndex: number): XpOrbModel {
    return {
        poolIndex,
        generation: 0,
        active: false,
        x: 0,
        y: 0,
        value: 0,
        tier: 1,
    };
}

function resetXpOrbModel(orb: XpOrbModel): void {
    orb.active = false;
    orb.value = 0;
    orb.tier = 1;
}

export function getXpOrbTier(value: number): 1 | 2 | 3 | 4 {
    const thresholds = ENDLESS_SWORD_CONFIG.experience.xpLevelThresholds;
    if (value >= thresholds.large + 1) {
        return 4;
    }
    if (value >= thresholds.medium + 1) {
        return 3;
    }
    if (value >= thresholds.small + 1) {
        return 2;
    }
    return 1;
}
