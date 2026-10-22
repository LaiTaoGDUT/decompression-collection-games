import { REGION_ART, type Region } from './MemeRunnerRegions';

/** Midground pieces along the back sidewalk, in the region's frontage order. Pieces differ in width and
 * height and each slot jitters its position and setback, so the frontage overlaps in places, opens onto
 * the far town in others, and rooflines never line up. Every value is a pure function of the slot, so a
 * piece keeps its place while it scrolls. */
export interface RunnerSceneryPlacement { id: number; key: string; x: number; sink: number; }
export const SCENERY_STEP = 250;
const JITTER = 70, SINK = 10;

function hash(slot: number, salt: number): number {
    return (((slot * 2654435761) ^ (salt * 40503)) >>> 0) % 1009 / 1009;
}

export function runnerScenery(distance: number, left: number, right: number, region: Region): RunnerSceneryPlacement[] {
    const buildings = REGION_ART[region].buildings, first = Math.floor((left + distance) / SCENERY_STEP) - 1;
    return Array.from({ length: sceneryCount(left, right) }, (_, i) => {
        const slot = first + i, key = buildings[(slot % buildings.length + buildings.length) % buildings.length];
        return { id: slot, key, sink: Math.round(hash(slot, 2) * SINK),
            x: slot * SCENERY_STEP - distance + SCENERY_STEP / 2 + (hash(slot, 3) - .5) * JITTER };
    });
}

export function sceneryCount(left: number, right: number): number { return Math.ceil((right - left) / SCENERY_STEP) + 3; }
