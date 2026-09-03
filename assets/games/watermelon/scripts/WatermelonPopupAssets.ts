import { assetManager, SpriteFrame, Texture2D } from 'cc';

const WATERMELON_RESOURCE_BUNDLE = 'game-watermelon-assets';

export interface WatermelonPopupFrames {
    readonly pauseBackground: SpriteFrame;
    readonly continueBackground: SpriteFrame;
    readonly resultBackground: SpriteFrame;
    readonly resultNormalBackground: SpriteFrame;
    readonly mintButton: SpriteFrame;
    readonly peachButton: SpriteFrame;
    readonly creamButton: SpriteFrame;
    readonly creamMintButton: SpriteFrame;
    readonly statStrip: SpriteFrame;
    readonly videoIcon: SpriteFrame;
}

const POPUP_TEXTURE_PATHS = Object.freeze({
    pauseBackground: 'visual/ui/c1-cat-popup-pause-bg-v2/texture',
    continueBackground: 'visual/ui/c1-cat-popup-continue-bg-v2/texture',
    resultBackground: 'visual/ui/c1-cat-popup-result-bg-v2/texture',
    resultNormalBackground: 'visual/ui/c1-cat-popup-result-normal-bg-v2/texture',
    mintButton: 'visual/ui/c1-cat-popup-button-mint-v2/texture',
    peachButton: 'visual/ui/c1-cat-popup-button-peach-v2/texture',
    creamButton: 'visual/ui/c1-cat-popup-button-cream-v2/texture',
    creamMintButton: 'visual/ui/c1-cat-popup-button-cream-mint-v1/texture',
    statStrip: 'visual/ui/c1-cat-popup-stat-butter-v2/texture',
    videoIcon: 'visual/ui/c1-cat-popup-video-icon-v1/texture',
});

function loadFrame(path: string): Promise<SpriteFrame> {
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
            resolve(frame);
        });
    });
}

export async function loadWatermelonPopupFrames(): Promise<WatermelonPopupFrames> {
    const [pauseBackground, continueBackground, resultBackground, resultNormalBackground, mintButton, peachButton, creamButton, creamMintButton, statStrip, videoIcon] = await Promise.all([
        loadFrame(POPUP_TEXTURE_PATHS.pauseBackground),
        loadFrame(POPUP_TEXTURE_PATHS.continueBackground),
        loadFrame(POPUP_TEXTURE_PATHS.resultBackground),
        loadFrame(POPUP_TEXTURE_PATHS.resultNormalBackground),
        loadFrame(POPUP_TEXTURE_PATHS.mintButton),
        loadFrame(POPUP_TEXTURE_PATHS.peachButton),
        loadFrame(POPUP_TEXTURE_PATHS.creamButton),
        loadFrame(POPUP_TEXTURE_PATHS.creamMintButton),
        loadFrame(POPUP_TEXTURE_PATHS.statStrip),
        loadFrame(POPUP_TEXTURE_PATHS.videoIcon),
    ]);
    return Object.freeze({ pauseBackground, continueBackground, resultBackground, resultNormalBackground, mintButton, peachButton, creamButton, creamMintButton, statStrip, videoIcon });
}

export function destroyWatermelonPopupFrames(frames?: WatermelonPopupFrames): void {
    if (!frames) return;
    for (const frame of [
        frames.pauseBackground,
        frames.continueBackground,
        frames.resultBackground,
        frames.resultNormalBackground,
        frames.mintButton,
        frames.peachButton,
        frames.creamButton,
        frames.creamMintButton,
        frames.statStrip,
        frames.videoIcon,
    ]) {
        if (frame.isValid) frame.destroy();
    }
}
