/** Regions follow delivery progress, one per 1000 m, from morning to night (visual spec v38, backgrounds v46). */
export const REGIONS = ['street', 'alley', 'roofs', 'night'] as const;
export type Region = typeof REGIONS[number];
export const REGION_METERS = 1000;
export function regionIndex(meters: number): number { return Math.min(REGIONS.length - 1, Math.floor(Math.max(0, meters) / REGION_METERS)); }

export interface RegionArt {
    /** Complete town painting, cover-scaled and fixed. */
    sky: string;
    /** Fill below the road tile, matching the tile's bottom edge. */
    groundBase: string;
}
export const REGION_ART: Readonly<Record<Region, RegionArt>> = {
    street: { sky: 'sky-street', groundBase: '#19343C' },
    alley: { sky: 'sky-alley', groundBase: '#19343C' },
    roofs: { sky: 'sky-roofs', groundBase: '#19343C' },
    night: { sky: 'sky-night', groundBase: '#11242F' },
};
