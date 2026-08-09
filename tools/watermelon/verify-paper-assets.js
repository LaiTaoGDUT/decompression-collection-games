const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const fruitRoot = path.resolve('assets/games/watermelon/visual/fruits');
const files = fs.readdirSync(fruitRoot).filter((name) => /-w1-v1\.png$/.test(name)).sort();

(async () => {
    if (files.length !== 11) throw new Error(`Expected 11 fruits, found ${files.length}.`);
    let totalBytes = 0;
    const signatures = new Set();
    const alphaCoverage = [];

    for (const file of files) {
        const absolute = path.join(fruitRoot, file);
        const metadata = await sharp(absolute).metadata();
        if (metadata.width !== 512 || metadata.height !== 512 || metadata.hasAlpha !== true) {
            throw new Error(`${file} must be a transparent 512x512 PNG.`);
        }
        const { data, info } = await sharp(absolute).resize(48, 48).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let opaque = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let index = 0; index < data.length; index += info.channels) {
            if (data[index + 3] < 24) continue;
            opaque += 1;
            r += data[index];
            g += data[index + 1];
            b += data[index + 2];
        }
        const signature = `${Math.round(r / opaque)}-${Math.round(g / opaque)}-${Math.round(b / opaque)}`;
        signatures.add(signature);
        alphaCoverage.push(opaque / (48 * 48));
        totalBytes += fs.statSync(absolute).size;
    }

    if (signatures.size < 9) throw new Error('Fruit color signatures are not distinct enough.');
    if (alphaCoverage.some((coverage) => coverage < 0.28 || coverage > 0.92)) {
        throw new Error('A fruit has an unsafe alpha coverage at preview size.');
    }

    const background = path.resolve(
        'assets/games/watermelon/visual/backgrounds/w1-paper-fruit-stand-bg-v1.jpg',
    );
    const backgroundMetadata = await sharp(background).metadata();
    if (backgroundMetadata.width !== 750 || backgroundMetadata.height !== 1334) {
        throw new Error('Background must be 750x1334.');
    }

    console.log(
        `fruits=${files.length}, dimensions=512x512, alpha=passed, `
        + `color_signatures=${signatures.size}, fruit_bytes=${totalBytes}, `
        + `background=750x1334/${fs.statSync(background).size}B`,
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
