import { getFruitConfig } from './FruitCatalog';
import { DEFAULT_WATERMELON_GAMEPLAY_CONFIG } from './WatermelonGameplayConfig';

export function clampDropX(
    requestedX: number,
    boardWidth: number,
    fruitRadius: number,
    edgePadding = DEFAULT_WATERMELON_GAMEPLAY_CONFIG.dropEdgePadding,
): number {
    const limit = Math.max(0, boardWidth / 2 - fruitRadius - edgePadding);
    return Math.max(-limit, Math.min(limit, requestedX));
}

export interface MergeCandidate {
    readonly level: number;
    readonly isMergeLocked: boolean;
    lockForMerge(): boolean;
}

export function tryLockMergePair(
    first: MergeCandidate,
    second: MergeCandidate,
): number | undefined {
    if (first === second
        || first.level !== second.level
        || first.isMergeLocked
        || second.isMergeLocked) {
        return undefined;
    }

    const nextLevel = getFruitConfig(first.level).nextLevel;

    if (nextLevel === undefined) {
        return undefined;
    }

    if (!first.lockForMerge() || !second.lockForMerge()) {
        return undefined;
    }

    return nextLevel;
}
