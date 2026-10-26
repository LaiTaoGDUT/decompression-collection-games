/** Regions follow delivery progress, one per 1000 m, from morning to night (visual spec v38, backgrounds v46). */
export const REGIONS = ['street', 'alley', 'roofs', 'night'] as const;
export type Region = typeof REGIONS[number];
export const REGION_METERS = 1000;
export function regionIndex(meters: number): number { return Math.min(REGIONS.length - 1, Math.floor(Math.max(0, meters) / REGION_METERS)); }

export interface RegionArt {
    /** Full-screen sky with the farthest horizon, cover-scaled and fixed. */
    sky: string;
    /** Seamless scenery strips standing on the road line, back to front: far hills, then near trees. */
    strips: readonly string[];
    /** Fill below the road tile, matching the tile's bottom edge. */
    groundBase: string;
    /** Foreground props are dark silhouettes tinted toward the region's shadows. */
    foregroundTint: string;
    sceneryTint: string;
}
export const REGION_ART: Readonly<Record<Region, RegionArt>> = {
    street: { sky: 'sky-street', strips: ['town-near'], groundBase: '#19343C', foregroundTint: '#FFFFFF', sceneryTint: '#FFFFFF' },
    alley: { sky: 'sky-alley', strips: ['town-near'], groundBase: '#19343C', foregroundTint: '#FFE2BE', sceneryTint: '#FFDCC0' },
    roofs: { sky: 'sky-roofs', strips: ['town-near'], groundBase: '#19343C', foregroundTint: '#BDC5E9', sceneryTint: '#D1C0E6' },
    night: { sky: 'sky-night', strips: ['town-near'], groundBase: '#11242F', foregroundTint: '#829CC6', sceneryTint: '#7A8CB9' },
};
