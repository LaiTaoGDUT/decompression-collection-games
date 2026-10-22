/** Regions follow delivery progress, one per 1000 m, from morning to night (visual spec v38). */
export const REGIONS = ['street', 'alley', 'roofs', 'night'] as const;
export type Region = typeof REGIONS[number];
export const REGION_METERS = 1000;
export function regionIndex(meters: number): number { return Math.min(REGIONS.length - 1, Math.floor(Math.max(0, meters) / REGION_METERS)); }

export interface RegionArt {
    /** Full-screen sky and far distance, cover-scaled. */
    backdrop: string;
    /** The midground frontage in order (shops, houses, a garden gap), repeating; a key may appear more
     * than once, so the region's signature shop stays rare and neighbours never repeat. */
    buildings: readonly string[];
    /** Tileable plaza between the road and the building fronts; it sets the buildings back. */
    plaza: string;
    /** Fill below the road tile, matching the tile's bottom edge. */
    groundBase: string;
    /** Foreground props are dark silhouettes tinted toward the region's shadows. */
    foregroundTint: string;
}
// The frontage order keeps each region's signature shop (piece 0) to once per ten slots.
export const REGION_ART: Readonly<Record<Region, RegionArt>> = {
    street: { backdrop: 'backdrop-street', buildings: ['mid-street-0', 'mid-street-3', 'mid-street-4', 'mid-street-1', 'mid-street-5', 'mid-street-2', 'mid-street-4', 'mid-street-3', 'mid-street-1', 'mid-street-2'], plaza: 'plaza-street', groundBase: '#341817', foregroundTint: '#4A3040' },
    alley: { backdrop: 'backdrop-alley', buildings: ['mid-alley-0', 'mid-alley-3', 'mid-alley-4', 'mid-alley-1', 'mid-alley-5', 'mid-alley-2', 'mid-alley-4', 'mid-alley-3', 'mid-alley-1', 'mid-alley-2'], plaza: 'plaza-alley', groundBase: '#35381D', foregroundTint: '#2F3F33' },
    roofs: { backdrop: 'backdrop-roofs', buildings: ['mid-roofs-0', 'mid-roofs-3', 'mid-roofs-4', 'mid-roofs-1', 'mid-roofs-5', 'mid-roofs-2', 'mid-roofs-4', 'mid-roofs-3', 'mid-roofs-1', 'mid-roofs-2'], plaza: 'plaza-roofs', groundBase: '#452447', foregroundTint: '#3A2A4A' },
    night: { backdrop: 'backdrop-night', buildings: ['mid-night-0', 'mid-night-3', 'mid-night-4', 'mid-night-1', 'mid-night-5', 'mid-night-2', 'mid-night-4', 'mid-night-3', 'mid-night-1', 'mid-night-2'], plaza: 'plaza-night', groundBase: '#1A0F16', foregroundTint: '#121528' },
};
