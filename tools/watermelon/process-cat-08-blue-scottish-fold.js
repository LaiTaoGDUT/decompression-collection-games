const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceRoot = path.resolve('docs/asset-generation/sources/cat-08-blue-scottish-fold-c8');
const outputRoot = path.resolve('assets/games/watermelon/visual/cats/frames-c6');
const frames = [
    ['idle-1', 'cat-08-blue-scottish-fold-idle-1-source.png'],
    ['idle-2', 'cat-08-blue-scottish-fold-idle-2-source.png'],
    ['fall', 'cat-08-blue-scottish-fold-fall-source.png'],
];
const size = 256;
const center = size / 2;
const radius = 126;
const transparentFill = [164, 169, 182];

function circleAlpha(x, y) {
    const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
    return Math.max(0, Math.min(255, Math.round((radius - distance) * 255)));
}

(async () => {
    for (const [frame, sourceName] of frames) {
        const source = path.join(sourceRoot, sourceName);
        const { data, info } = await sharp(source)
            .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const rgba = Buffer.alloc(size * size * 4);

        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const sourceOffset = (y * size + x) * info.channels;
                const targetOffset = (y * size + x) * 4;
                const alpha = circleAlpha(x, y);
                for (let channel = 0; channel < 3; channel += 1) {
                    rgba[targetOffset + channel] = alpha === 0
                        ? transparentFill[channel]
                        : data[sourceOffset + channel];
                }
                rgba[targetOffset + 3] = alpha;
            }
        }

        const output = path.join(
            outputRoot,
            `cat-08-blue-scottish-fold-${frame}-c8-v1.png`,
        );
        await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
            .png({ compressionLevel: 9, adaptiveFiltering: true })
            .toFile(output);
    }

    console.log('cat08=blue-scottish-fold, frames=3, size=256x256, alpha_circle=252px');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
