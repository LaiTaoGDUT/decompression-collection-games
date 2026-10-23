import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { DUNK_WORLD } from './FlappyDunkModel';

/** Diameter of the round pause / back controls at the 750-wide baseline. */
export const DUNK_ICON_BUTTON = 76;

/** Native camera: orthographic size 5, filling the viewport. The top bar (back, score, pause) hugs the
 * top safe edge, which already keeps a gap under the capsule. The playfield is centred in the height left
 * between the bottom of that bar and the bottom safe edge; it keeps its native scale unless that height is
 * too short to fit roof to floor. */
export function calculateDunkLayout(width: number, height: number, platform: PlatformLayoutInfo) {
    const safe = calculateSafeContentBounds(width, height, platform);
    const controlScale = Math.min(1, safe.width / 750, safe.height / 800);
    const controlY = safe.topY - DUNK_ICON_BUTTON / 2 * controlScale;
    const playTopY = safe.topY - DUNK_ICON_BUTTON * controlScale;
    const unit = Math.max(0, Math.min(height / DUNK_WORLD.height, (playTopY - safe.bottomY) / (DUNK_WORLD.wall * 2 + .06)));
    const worldY = (playTopY + safe.bottomY) / 2;
    return { safe, x: 0, y: 0, scale: 1, width, height, stageY: 0, stageWidth: width, stageHeight: height,
        unit, worldY, worldWidth: unit > 0 ? width / unit : DUNK_WORLD.width,
        controlScale, controlY, playTopY };
}
