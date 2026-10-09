import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { SpriteFrame } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';

const WATERMELON_RESOURCE_BUNDLE = 'game-watermelon-assets';

export interface WatermelonPopupFrames {
    readonly pauseBackground: SpriteFrame;
    readonly pauseScoreBackground: SpriteFrame;
    readonly pauseResumeButton: SpriteFrame;
    readonly pauseRestartButton: SpriteFrame;
    readonly continuePanel: SpriteFrame;
    readonly continueVideoButton: SpriteFrame;
    readonly continueVideoIcon: SpriteFrame;
    readonly recordBackground: SpriteFrame;
    readonly recordRestartButton: SpriteFrame;
}

const POPUP_TEXTURE_PATHS = Object.freeze({
    pauseBackground: 'visual/ui/c1-watermelon-pause-panel-v3/texture',
    pauseScoreBackground: 'visual/ui/c1-watermelon-pause-score-v3/texture',
    pauseResumeButton: 'visual/ui/c1-cat-popup-button-mint-350-v3/texture',
    pauseRestartButton: 'visual/ui/c1-cat-popup-button-cream-350-v3/texture',
    continuePanel: 'visual/ui/c1-watermelon-continue-panel-v1/texture',
    continueVideoButton: 'visual/ui/c1-watermelon-continue-video-button-v1/texture',
    continueVideoIcon: 'visual/ui/c1-watermelon-continue-video-icon-v1/texture',
    recordBackground: 'visual/ui/c1-watermelon-record-panel-v1/texture',
    recordRestartButton: 'visual/ui/c1-watermelon-record-restart-button-v1/texture',
});

interface SliceInsets {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
}

const PAUSE_SLICE_INSETS = Object.freeze({
    // Preserve the complete fruit crown and the four illuminated corners;
    // only the quiet centre of the trimmed panel may grow.
    panel: Object.freeze({ left: 72, right: 72, top: 164, bottom: 82 }),
    score: Object.freeze({ left: 34, right: 34, top: 34, bottom: 34 }),
    // The pause derivatives match their runtime sizes, so the rounded ends are
    // never compressed. Insets retain only a two-pixel vertical stretch strip.
    pauseResumeButton: Object.freeze({ left: 60, right: 60, top: 37, bottom: 37 }),
    pauseRestartButton: Object.freeze({ left: 60, right: 60, top: 36, bottom: 36 }),
    continuePanel: Object.freeze({ left: 72, right: 72, top: 112, bottom: 82 }),
    continueVideoButton: Object.freeze({ left: 62, right: 62, top: 42, bottom: 42 }),
    // The record artwork is 750x1261. The runtime keeps the node at source
    // size, scales it uniformly to the popup's 550px design width, and lets
    // only the centre band absorb the small height adjustment. This keeps the
    // fruit crown and lower glow out of the stretch region.
    recordBackground: Object.freeze({ left: 100, right: 100, top: 330, bottom: 121 }),
    recordRestartButton: Object.freeze({ left: 60, right: 60, top: 40, bottom: 40 }),
});

function applyInsets(frame: SpriteFrame, insets?: SliceInsets): void {
    frame.packable = false;
    const { width, height } = frame.rect;
    if (!insets) return;
    frame.insetLeft = Math.min(insets.left, width - 1);
    frame.insetRight = Math.min(insets.right, width - frame.insetLeft - 1);
    frame.insetTop = Math.min(insets.top, height - 1);
    frame.insetBottom = Math.min(insets.bottom, height - frame.insetTop - 1);
}

async function loadFrame(assets: AssetService, path: string, insets?: SliceInsets): Promise<SpriteFrame> {
    const packed = PACKED_SPRITE_PATHS[path];
    const frame = await assets.loadSpriteFrame(WATERMELON_RESOURCE_BUNDLE, packed ?? path, packed ? 'frame' : 'texture');
    applyInsets(frame, insets);
    return frame;
}

export async function loadWatermelonPopupFrames(assets: AssetService): Promise<WatermelonPopupFrames> {
    const created: SpriteFrame[] = [];
    let failure: unknown;
    let failed = false;
    const [pauseBackground, pauseScoreBackground, pauseResumeButton, pauseRestartButton, continuePanel, continueVideoButton, continueVideoIcon, recordBackground, recordRestartButton] = await Promise.all([
        loadFrame(assets, POPUP_TEXTURE_PATHS.pauseBackground, PAUSE_SLICE_INSETS.panel),
        loadFrame(assets, POPUP_TEXTURE_PATHS.pauseScoreBackground, PAUSE_SLICE_INSETS.score),
        loadFrame(assets, POPUP_TEXTURE_PATHS.pauseResumeButton, PAUSE_SLICE_INSETS.pauseResumeButton),
        loadFrame(assets, POPUP_TEXTURE_PATHS.pauseRestartButton, PAUSE_SLICE_INSETS.pauseRestartButton),
        loadFrame(assets, POPUP_TEXTURE_PATHS.continuePanel, PAUSE_SLICE_INSETS.continuePanel),
        loadFrame(assets, POPUP_TEXTURE_PATHS.continueVideoButton, PAUSE_SLICE_INSETS.continueVideoButton),
        loadFrame(assets, POPUP_TEXTURE_PATHS.continueVideoIcon),
        loadFrame(assets, POPUP_TEXTURE_PATHS.recordBackground, PAUSE_SLICE_INSETS.recordBackground),
        loadFrame(assets, POPUP_TEXTURE_PATHS.recordRestartButton, PAUSE_SLICE_INSETS.recordRestartButton),
    ].map(load => load.then(frame => {
        created.push(frame);
        return frame;
    }, error => {
        if (!failed) failure = error;
        failed = true;
        return undefined;
    })));
    if (failed) {
        for (const frame of created) assets.releaseRuntimeAsset(frame);
        throw failure;
    }
    return Object.freeze({ pauseBackground, pauseScoreBackground, pauseResumeButton, pauseRestartButton, continuePanel, continueVideoButton, continueVideoIcon, recordBackground, recordRestartButton });
}

export function destroyWatermelonPopupFrames(assets: AssetService, frames?: WatermelonPopupFrames): void {
    if (!frames) return;
    for (const frame of [
        frames.pauseBackground,
        frames.pauseScoreBackground,
        frames.pauseResumeButton,
        frames.pauseRestartButton,
        frames.continuePanel,
        frames.continueVideoButton,
        frames.continueVideoIcon,
        frames.recordBackground,
        frames.recordRestartButton,
    ]) {
        assets.releaseRuntimeAsset(frame);
    }
}
