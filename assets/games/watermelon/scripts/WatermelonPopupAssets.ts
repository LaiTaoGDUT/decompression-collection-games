import { assetManager, Rect, Size, SpriteFrame, Texture2D } from 'cc';

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

function applyInsets(frame: SpriteFrame, texture: Texture2D, insets?: SliceInsets): void {
    frame.packable = false;
    frame.rect = new Rect(0, 0, texture.width, texture.height);
    frame.originalSize = new Size(texture.width, texture.height);
    if (!insets) return;
    frame.insetLeft = Math.min(insets.left, texture.width - 1);
    frame.insetRight = Math.min(insets.right, texture.width - frame.insetLeft - 1);
    frame.insetTop = Math.min(insets.top, texture.height - 1);
    frame.insetBottom = Math.min(insets.bottom, texture.height - frame.insetTop - 1);
}

function loadFrame(path: string, insets?: SliceInsets): Promise<SpriteFrame> {
    const bundle = assetManager.getBundle(WATERMELON_RESOURCE_BUNDLE);
    if (!bundle) {
        return Promise.reject(new Error(`${WATERMELON_RESOURCE_BUNDLE} bundle is unavailable.`));
    }
    return new Promise<SpriteFrame>((resolve, reject) => {
        bundle.load(path, Texture2D, (error, texture) => {
            if (error || !texture) {
                reject(new Error(`Popup texture failed: ${path}. ${error?.message ?? 'Asset missing.'}`));
                return;
            }
            const frame = new SpriteFrame();
            frame.texture = texture;
            applyInsets(frame, texture, insets);
            resolve(frame);
        });
    });
}

export async function loadWatermelonPopupFrames(): Promise<WatermelonPopupFrames> {
    const [pauseBackground, pauseScoreBackground, pauseResumeButton, pauseRestartButton, continuePanel, continueVideoButton, continueVideoIcon, recordBackground, recordRestartButton] = await Promise.all([
        loadFrame(POPUP_TEXTURE_PATHS.pauseBackground, PAUSE_SLICE_INSETS.panel),
        loadFrame(POPUP_TEXTURE_PATHS.pauseScoreBackground, PAUSE_SLICE_INSETS.score),
        loadFrame(POPUP_TEXTURE_PATHS.pauseResumeButton, PAUSE_SLICE_INSETS.pauseResumeButton),
        loadFrame(POPUP_TEXTURE_PATHS.pauseRestartButton, PAUSE_SLICE_INSETS.pauseRestartButton),
        loadFrame(POPUP_TEXTURE_PATHS.continuePanel, PAUSE_SLICE_INSETS.continuePanel),
        loadFrame(POPUP_TEXTURE_PATHS.continueVideoButton, PAUSE_SLICE_INSETS.continueVideoButton),
        loadFrame(POPUP_TEXTURE_PATHS.continueVideoIcon),
        loadFrame(POPUP_TEXTURE_PATHS.recordBackground, PAUSE_SLICE_INSETS.recordBackground),
        loadFrame(POPUP_TEXTURE_PATHS.recordRestartButton, PAUSE_SLICE_INSETS.recordRestartButton),
    ]);
    return Object.freeze({ pauseBackground, pauseScoreBackground, pauseResumeButton, pauseRestartButton, continuePanel, continueVideoButton, continueVideoIcon, recordBackground, recordRestartButton });
}

export function destroyWatermelonPopupFrames(frames?: WatermelonPopupFrames): void {
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
        if (frame.isValid) frame.destroy();
    }
}
