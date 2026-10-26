import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateSafeContentBounds, type SafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { SLING_ART } from './SlingPuckArt';

/** Every child fits this rectangle, including the hint and power rows. */
export const SLING_HUD = Object.freeze({ barWidth: 716, barHeight: 132, opponentHeight: 96, gap: 20, edge: 12 });
export interface SlingPuckLayout {
    readonly safe: SafeContentBounds;
    readonly scale: number; readonly boardX: number; readonly boardY: number;
    readonly hudScale: number; readonly topBarY: number; readonly bottomBarY: number;
    readonly boardBounds: { left: number; right: number; top: number; bottom: number };
}

/** Reserve two complete HUD bands, then uniformly fit the arena into the remaining height. */
export function calculateSlingPuckLayout(width: number, height: number, platform: PlatformLayoutInfo | undefined, local = false): SlingPuckLayout {
    const safe = calculateSafeContentBounds(width, height, platform), rink = SLING_ART.rink;
    const hudScale = Math.max(.01, Math.min(1, (safe.width - 2 * SLING_HUD.edge) / SLING_HUD.barWidth));
    const bar = SLING_HUD.barHeight * hudScale, topBar = (local ? SLING_HUD.barHeight : SLING_HUD.opponentHeight) * hudScale;
    const gap = SLING_HUD.gap * hudScale;
    const rinkWidth = rink.right - rink.left, rinkHeight = rink.top - rink.bottom;
    const scale = Math.max(.01, Math.min(1, (safe.width - 24) / rinkWidth, (safe.height - bar - topBar - 2 * gap) / rinkHeight));
    const center = safe.centerY + (bar - topBar) / 2, boardHalf = rinkHeight * scale / 2;
    return {
        safe, scale, hudScale, boardX: safe.centerX,
        boardY: center - (rink.top + rink.bottom) / 2 * scale,
        topBarY: center + boardHalf + gap + topBar / 2,
        bottomBarY: center - boardHalf - gap - bar / 2,
        boardBounds: { left: safe.centerX + rink.left * scale, right: safe.centerX + rink.right * scale,
            top: center + boardHalf, bottom: center - boardHalf },
    };
}
