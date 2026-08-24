import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { XpOrbModel } from '../core/CombatModels';
import { ObjectPool, type ObjectPoolStats } from '../core/ObjectPool';

/** T1.5 XP 节点基础池；吸附、合并、分级视觉在 T1.7 扩展。 */
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
        const orb = this.pool.acquire();
        if (!orb) {
            return undefined;
        }
        orb.generation += 1;
        orb.active = true;
        orb.x = x;
        orb.y = y;
        orb.value = value;
        return orb;
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
}

function createXpOrbModel(poolIndex: number): XpOrbModel {
    return {
        poolIndex,
        generation: 0,
        active: false,
        x: 0,
        y: 0,
        value: 0,
    };
}

function resetXpOrbModel(orb: XpOrbModel): void {
    orb.active = false;
    orb.value = 0;
}
