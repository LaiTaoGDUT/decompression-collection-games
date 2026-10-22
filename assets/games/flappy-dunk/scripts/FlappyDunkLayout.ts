import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { DUNK_WORLD } from './FlappyDunkModel';

/** Native camera: orthographic size 5, filling the viewport; HUD never reserves stage space. */
export function calculateDunkLayout(width: number, height: number, platform: PlatformLayoutInfo) {
    const safe = calculateSafeContentBounds(width, height, platform);
    const unit = Math.max(0, Math.min(height / DUNK_WORLD.height, safe.height / (DUNK_WORLD.wall * 2 + .06)));
    const extent = (DUNK_WORLD.wall + .03) * unit;
    const worldY = Math.max(safe.bottomY + extent, Math.min(0, safe.topY - extent));
    const controlScale = Math.min(1, safe.width / 750, safe.height / 800);
    return { safe, x: 0, y: 0, scale: 1, width, height, stageY: 0, stageWidth: width, stageHeight: height,
        unit, worldY, worldWidth: unit > 0 ? width / unit : DUNK_WORLD.width,
        controlScale, controlY: safe.topY - 44 * controlScale };
}
