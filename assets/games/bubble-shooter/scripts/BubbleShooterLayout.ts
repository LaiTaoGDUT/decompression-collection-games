import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';

export const CLOUD_PLAYFIELD_HEIGHT = 970;
export const CLOUD_PLAYFIELD_BOTTOM = -550;
export const CLOUD_COUNTER_Y = 478;

/** All values use the Fit Width design coordinate system. */
export function calculateBubbleShooterLayout(width: number, height: number, platform?: PlatformLayoutInfo) {
    const safe = calculateVerticalSafeBounds(height, platform);
    const available = Math.max(1, safe.topY - safe.bottomY - 14 - 80);
    const scale = Math.max(0.001, Math.min(1, width / 750, available / (CLOUD_PLAYFIELD_HEIGHT + 140)));
    const bottom = safe.bottomY + 14;
    const cover = Math.max(width / 750, height / 1800);
    const playY = bottom - CLOUD_PLAYFIELD_BOTTOM * scale;
    const islandScale = Math.min(1, Math.max(0.1, (height / 2 - (playY + 430 * scale)) / 280));
    const bossScale = Math.min(width / 870, .9);
    const cloudY = playY + 502 * scale;
    // The decorative crown uses the clear top-center area; the face stays below the capsule.
    // Body lower edge sits inside the cloud bank; health has independent HUD placement.
    const bossY = Math.min(cloudY + 55 * bossScale, height / 2 - 342 * bossScale - 12);
    return {
        bossY,
        cloudY,
        cloudHeight: 150 * scale,
        healthY: playY + 512 * scale,
        bossScale,
        scale,
        playY,
        pauseX: -width / 2 + 48,
        pauseY: safe.topY - 38,
        backgroundWidth: 750 * cover,
        backgroundHeight: 1800 * cover,
        islandScale,
        decorationTop: height / 2 - 140 * islandScale,
    };
}
