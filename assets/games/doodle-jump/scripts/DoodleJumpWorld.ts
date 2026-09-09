import type { DoodleJumpPlatformType } from './DoodleJumpConfig';

export interface DoodleJumpWorldPlatform {
    readonly id: string;
    readonly type: DoodleJumpPlatformType;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly collisionEnabled: boolean;
    readonly consumed: boolean;
}

export interface DoodleJumpWorldIndex {
    /** Platforms are ordered by current y, then id, for deterministic evaluation. */
    readonly platforms: readonly DoodleJumpWorldPlatform[];
    readonly platformById: ReadonlyMap<string, DoodleJumpWorldPlatform>;
}

export interface DoodleJumpWorldOccupiedBody {
    x: number;
    y: number;
    width: number;
    height: number;
    anchorPlatformId?: string;
}
