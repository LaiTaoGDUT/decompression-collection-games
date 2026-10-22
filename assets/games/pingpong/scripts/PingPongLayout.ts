import type { PlatformLayoutInfo } from '../../../core/types/CommonTypes';
import { calculateSafeContentBounds } from '../../../shared/ui/PlatformSafeLayout';
import { PINGPONG_WORLD as W, type PingPongMode } from './PingPongModel';

/** Flip scoreboard in the centre, round glass buttons at both safe edges. */
export const PINGPONG_HUD = Object.freeze({
    boardWidth: 356, boardHeight: 116, button: 68, edge: 16, courtGap: 14,
});
/** Two-player HUD beside the net: score on the left, pause on the right. */
export const PINGPONG_NET_HUD = Object.freeze({ scoreWidth: 108, scoreHeight: 124, button: 68, gap: 8 });
/** Net posts reach this far past the table edge (world units). */
const NET_REACH = W.tableWidth / 2 + 1.07;
/** Paddles stop at paddleMinZ, so this band around the net never holds a paddle. */
const NET_BAND = W.paddleMinZ - W.paddleLength / 2;

/** The source camera shows 40 world units vertically at 9:16. Preserve that
 * Fit Width framing, fitting the table and complete starting paddles below
 * the HUD on short screens. Movement bounds follow the actual playable
 * rectangle; off-camera native drag limits must not shrink the whole table.
 * Against the computer the HUD sits on top. Face to face the top player's hand
 * works there, so the HUD moves into the side gutters of the paddle-free net band.
 */
export function calculatePingPongLayout(width: number, height: number, platform: PlatformLayoutInfo, mode: PingPongMode) {
    const safe = calculateSafeContentBounds(width, height, platform);
    const controls = Math.min(1, safe.width / 750, safe.height / 800);
    const margin = PINGPONG_HUD.edge * controls;
    const hudScale = controls;
    const hudY = safe.topY - margin - PINGPONG_HUD.boardHeight * hudScale / 2;
    const buttonX = safe.width / 2 - margin - PINGPONG_HUD.button * hudScale / 2;
    const topHud = mode === 'cpu';
    const playTop = topHud ? hudY - PINGPONG_HUD.boardHeight * hudScale / 2 - PINGPONG_HUD.courtGap * controls : safe.topY - margin;
    const playBottom = safe.bottomY + margin;
    const playHeight = playTop - playBottom;
    const playWidth = safe.width - 2 * margin;
    const coreHalfZ = Math.max(W.tableLength / 2, W.paddleStartZ + W.paddleLength / 2);
    const unit = Math.max(.01, Math.min(width / (40 * 9 / 16),
        playWidth / W.tableWidth, playHeight / (2 * coreHalfZ)));
    const worldY = (playTop + playBottom) / 2;
    const paddleBounds = {
        sideLimit: Math.min(W.sideLimit, playWidth / (2 * unit) - W.paddleWidth / 2),
        backLimit: Math.min(W.paddleMaxZ + W.cpuOffsetRadius, playHeight / (2 * unit) - W.paddleLength / 2),
    };
    const N = PINGPONG_NET_HUD, gutter = playWidth / 2 - NET_REACH * unit - N.gap * controls;
    const netScale = Math.max(.01, Math.min(1, gutter / Math.max(N.scoreWidth, N.button),
        (2 * NET_BAND * unit - 2 * N.gap * controls) / N.scoreHeight));
    const netX = playWidth / 2 - gutter / 2;
    return { safe, unit, worldX: safe.centerX, worldY, controls, playTop, playBottom, paddleBounds,
        topHud, hudScale, buttonX, hudY, netX, netScale };
}
