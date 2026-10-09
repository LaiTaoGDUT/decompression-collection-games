import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateTopRightControlPosition, calculateVerticalSafeBounds } from '../../../shared/ui/PlatformSafeLayout';
import { BOARD_WIDTH } from './BubbleShooterModel';

export const CLOUD_PLAYFIELD_BOTTOM = -550;
export const CLOUD_COUNTER_Y = 478;
export const CLOUD_PLAYFIELD_TOP = CLOUD_COUNTER_Y + 24;
export const CLOUD_PLAYFIELD_HEIGHT = CLOUD_PLAYFIELD_TOP - CLOUD_PLAYFIELD_BOTTOM;
// Preserve the top clearance in the original height budget so the cloud mask cannot crowd the boss.
export const PLAYFIELD_TOP_HEADROOM = 58;

/** All values use the Fit Width design coordinate system. */
export function calculateBubbleShooterLayout(width: number, height: number, platform?: PlatformLayoutInfo, reserveBoss = false, canopyHeight = 0, extraBossHeadroom = 0) {
    const safe = calculateVerticalSafeBounds(height, platform);
    const pause = calculateTopRightControlPosition(width, height, platform, {
        controlWidth: 76, controlHeight: 76, rightInset: 48, defaultTopInset: 38,
    });
    const available = Math.max(1, safe.topY - safe.bottomY - 14 - 80);
    const widthScale = Math.min(1, width / BOARD_WIDTH);
    const canopyScale = canopyHeight > 0 ? Math.max(1, safe.topY - safe.bottomY - 14 - canopyHeight - 12) / 994 : widthScale;
    // Content bounds and the original top/boss reservations both participate in scaling, in every stage.
    const requiredHeight = CLOUD_PLAYFIELD_HEIGHT + PLAYFIELD_TOP_HEADROOM + extraBossHeadroom + (reserveBoss ? (canopyHeight > 0 ? 210 : 140) : 0);
    const bottom = safe.bottomY + 14;
    const bossScale = Math.min(width / 870, .9);
    const heightScale = Math.min(canopyScale, available / requiredHeight);
    // Expand the horizontal boundary, never the authored bubble/launcher sizes. Short screens
    // still shrink the whole playfield with the same permanent top/boss reservations.
    const scale = Math.max(0.001, Math.min(widthScale, heightScale));
    const cover = Math.max(width / 750, height / 1800);
    const playY = bottom - CLOUD_PLAYFIELD_BOTTOM * scale;
    const islandScale = Math.min(1, Math.max(0.1, (height / 2 - (playY + 430 * scale)) / 280));
    const cloudY = playY + CLOUD_PLAYFIELD_TOP * scale;
    return {
        safeTopY:safe.topY,
        safeBottomY:safe.bottomY,
        cloudY,
        cloudHeight: 150 * scale,
        healthY: playY + 512 * scale,
        bossScale,
        scale,
        playY,
        pauseX: pause.x,
        pauseY: pause.y,
        backgroundWidth: 750 * cover,
        backgroundHeight: 1800 * cover,
        islandScale,
        decorationTop: height / 2 - 140 * islandScale,
    };
}
